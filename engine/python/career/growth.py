"""V5.3: separate maturation and decline; bounded prospective potential review."""
import datetime as dt
import math
import random
from season import D, seed
from engine import clip
from legacy_rally import ATTR
from attributes import ability as derived_ability
from growth_tables import GROUPS, WEIGHTS, interp, load_factor, recent
VERSION = '5.3'
# Annual fraction of remaining potential realized, and annual natural decline.
CURVE = ((16,.30,0),(18,.30,0),(19,.25,0),(21,.25,0),(22,.20,0),(23,.20,0),
         (24,.15,0),(25,.15,0),(26,.10,.3),(27,.10,.3),(28,.05,.7),(29,.05,.7),
         (30,.02,1.3),(31,.02,1.3),(32,0,2.2),(33,0,2.2),(34,0,3.5),(35,0,3.5),
         (36,0,4.5),(37,0,4.5),(38,0,5.5))
# Physical development and decline arrive earlier; mental later. At equal
# reference age the weighted decline multipliers sum to 1.
AGE_OFFSETS = (0,2,-2)
DECLINE_MULTIPLIERS = (.65,1.9,.2125)

DECLINE_KNOTS = tuple(tuple(zip((0,1,2,4,6,8,10,12,14), values)) for values in (
    (0,.10,.25,.70,1.40,2.30,3.30,4.40,5.50),
    (0,.30,.70,1.80,3.20,4.80,6.50,8,9),
    (0,.05,.12,.30,.60,1,1.50,2,2.60)))

def rates(age, peak):
    shift=clip(.6*(peak-27),-2,2)
    onsets=(clip(30+.3*(peak-27),29,32),clip(26+.4*(peak-27),24,28),clip(32+.25*(peak-27),31,34))
    return tuple((interp(age-shift+off,[(x,g) for x,g,d in CURVE])*clip((stop-age)/2,0,1),
                  interp(max(0,age-onset),knots))
                 for off,stop,onset,knots in zip(AGE_OFFSETS,(32,30,34),onsets,DECLINE_KNOTS))

def migrate(s):
    if s.get('version')!='5.2-R2' or 'growth_history_v53' in s: raise ValueError('requires unmigrated R2 save')
    if any(not v['settled'] for v in s['v42']['events'].values()): raise ValueError('finish active event before upgrading')
    initialize(s)
    return s

def initialize(s):
    for p in s['players']:
        g=p['development']
        if 'v53_potential' in g: raise ValueError('already initialized')
        g['v53_potential']={'baseline':g['potential_hidden'],'cumulative_gain':0.0,'breakthrough_count':0,'last_breakthrough':None,'last_evaluation':None,'weeks_since_upgrade':0,'scout_pending':False}
    s['version']='5.3'; s['rules']['training']='automatic V5.3'; s['rules']['potential']='bounded_dynamic_v53';s['growth_history_v53']=[];s['potential_history_v53']=[]
    s['v53_migration']={'date':s['date'],'first_week_after':s['players'][0]['development']['last_update'],'source':'5.2-R2' if s['matches'] else 'new_game'}

def injury_factor(s,p,day):
    penalties=[0]*7
    for rec in s.get('v42',{}).get('injury_history',[]):
        if rec['player_id']!=p['id']:continue
        for i in range(7):
            d=(D(day)-dt.timedelta(days=7-i)).isoformat()
            if rec['date']<=d<rec['until']:penalties[i]=max(penalties[i],rec['penalty'])
    return sum(.25 if n>=10 else .4 if n>=5 else .85 if n>=3 else .95 if n else 1. for n in penalties)/7

def performance(s, pid, day):
    start=(D(day)-dt.timedelta(days=168)).isoformat(); mid=(D(day)-dt.timedelta(days=84)).isoformat()
    rows=[[],[]]; opponents=set(); counts={}
    for m in s['matches']:
        if not start<=m['date']<day or pid not in (m['a'],m['b']):continue
        snap=m.get('final_snapshot',{}); a,b=m.get('development_CA',[snap.get('a'),snap.get('b')])
        if a is None or b is None or m.get('winner') not in (m['a'],m['b']):continue
        own,opp,oid=(a,b,m['b']) if pid==m['a'] else (b,a,m['a'])
        if opp<own-5:continue
        w=int(m['date']>=mid); key=(w,oid)
        if counts.get(key,0)>=2:continue
        counts[key]=counts.get(key,0)+1;opponents.add(oid)
        rows[w].append(int(m['winner']==pid)-1/(1+math.exp(-(own-opp)/10)))
    n=[len(x) for x in rows]; e=[sum(x)/len(x) if x else 0. for x in rows]; total=sum(map(sum,rows))/sum(n) if sum(n) else 0.
    return n,e,total,len(opponents)

def potential_review(s,p,day,age,st):
    g=p['development']; v=g['v53_potential'];v['weeks_since_upgrade']+=1
    if v['weeks_since_upgrade']%13:return
    if v['last_evaluation']==day:raise ValueError('duplicate potential review')
    v['last_evaluation']=day
    # Delayed, noisy scout estimate, independent of the review stream.
    if v['scout_pending']:
        scout=random.Random(seed(s['world_seed'],'growth_v53_scout',p['id'],day));center=round(g['potential_hidden']+scout.uniform(-2,2)); p['potential_estimate']=[int(clip(center-3,35,99)),int(clip(center+3,35,99))];p['potential_estimate_date']=day;v['scout_pending']=False
    n,e,total,distinct=performance(s,p['id'],day); room=min(3-v['cumulative_gain'],99-g['potential_hidden'])
    eligible=(16<=age<25 and max(0,g['potential_hidden']-p['ability'])<=4 and min(n)>=5 and sum(n)>=12 and distinct>=6 and min(e)>=0 and total>=.05 and v['breakthrough_count']<2 and room>=.25 and (v['last_breakthrough'] is None or (D(day)-D(v['last_breakthrough'])).days>=364))
    row={'player_id':p['id'],'date':day,'eligible':eligible,'success':False,'counts':n,'residual':total}
    if eligible:
        q=clip((.20+.20*clip((total-.05)/.20,0,1))*clip((25-age)/4,0,1)*{'plateau':.8,'normal':1.,'fast':1.1,'breakthrough':1.2}[st['name']],0,.45)
        prob=1-(1-q)**.25; r=random.Random(seed(s['world_seed'],'growth_v53_potential',p['id'],day));u=r.random()
        row.update(probability=prob,draw=u)
        if u<prob:
            delta=round(min(r.uniform(.75,1.5),room),4); v['cumulative_gain']=round(v['cumulative_gain']+delta,4);g['potential_hidden']=round(min(99,v['baseline']+v['cumulative_gain']),4);v['breakthrough_count']+=1;v['last_breakthrough']=day;v['scout_pending']=True;row.update(success=True,gain=delta)
    s['potential_history_v53'].append(row)

def phase(s,p,day):
    g=p['development']; st=g.get('v52_phase')
    if st is None:
        # An ongoing legacy phase survives the first future update.
        st=g.get('v51_phase')
    if st and day<st['until']:
        g['v52_phase']=st
        return st
    r=random.Random(seed(s['world_seed'],'growth_v52_phase',p['id'],day)); u=r.random()
    if u<.10: label,lo,hi,weeks='breakthrough',1.25,1.50,r.randint(9,26)
    elif u<.30: label,lo,hi,weeks='fast',1.10,1.25,r.randint(9,17)
    elif u<.45: label,lo,hi,weeks='plateau',.40,.75,r.randint(9,26)
    else: label,lo,hi,weeks='normal',.90,1.10,r.randint(9,17)
    st={'name':label,'factor':r.uniform(lo,hi),'start':day,'until':(D(day)+dt.timedelta(weeks=weeks)).isoformat()}
    g['v52_phase']=st; return st

def growth_week(s,day):
    for p in s['players']:
        elapsed=(D(day)-D(p['development']['last_update'])).days
        if elapsed!=7 and not ('debut_date' in p and p['development']['last_update']==p['debut_date'] and 0<=elapsed<7):
            raise ValueError('growth requires exact 7-day steps; no duplicate updates')
        if set(p['attributes'])!=set(ATTR): raise ValueError('missing or unknown attributes')
    logs=recent(s,day); anchor=D(s.get('age_anchor_date','2027-01-01')); out=[]
    for p in s['players']:
        g=p['development']; age=g['age_anchor']+(D(day)-anchor).days/365.25
        if 'career_birthdate' in p:
            from lifecycle import decimal_age
            age=decimal_age(p,day)
        p['age']=int(age)
        if (D(day)-D(g['last_update'])).days<7:
            g['last_update']=day;continue  # no growth for a partial debut week
        a=p['ability']; cap=g['potential_hidden']; gap=max(0,cap-a); rs=rates(age,g['peak_age']); st=phase(s,p,day)
        games=logs[p['id']]; n=len(games)*365.25/84; load=load_factor(n)
        vals=[x for x in games if x is not None]; quality=sum(clip(1+x/100,.85,1.10) for x in vals)/len(vals) if vals else 1.
        injury=injury_factor(s,p,day)
        env=(load*quality,interp(n,((0,1.02),(35,1.08),(55,1),(75,.82),(100,.67))),load*quality)
        r=random.Random(seed(s['world_seed'],'growth_v52_week',p['id'],day)); before=p['attributes'].copy(); positive={}; negative={}
        for j,keys in enumerate(GROUPS):
            annual,decl=rs[j]
            fraction=clip(annual*g['growth_factor']*env[j]*injury*st['factor'],0,.75)
            pos=gap*(-math.expm1(math.log1p(-fraction)/52))
            neg=-decl*g['decline_factor']*clip(1+(1-st['factor'])*.25,.85,1.2)/52
            for k in keys:
                f=random.Random(seed(s['world_seed'],'growth_v51_trait',p['id'],k)).uniform(.85,1.15)
                # Bounded multiplicative variation, never creates growth when gap or rate is zero.
                positive[k]=pos*f*r.uniform(.92,1.08)
                negative[k]=neg*f*r.uniform(.96,1.04)
        gross=sum(w*sum(positive[k] for k in keys)/len(keys) for w,keys in zip(WEIGHTS,GROUPS))
        budget=min(9,7*max(1,g['growth_factor']))/52
        scale=min(1,budget/gross) if gross>0 else 1.
        def change(scale):
            updated={k:round(clip(before[k]+negative[k]+scale*positive[k],35,99),4) for k in ATTR}
            d=[sum(updated[k]-before[k] for k in keys)/len(keys) for keys in GROUPS]
            return updated,d,sum(w*x for w,x in zip(WEIGHTS,d))
        updated,d,net=change(scale)
        if net>gap:
            lo,hi=0.,scale
            for _ in range(30):
                mid=(lo+hi)/2
                if change(mid)[2]<=gap:lo=mid
                else:hi=mid
            updated,d,net=change(lo)
        p['attributes']=updated; p['ability']=derived_ability(updated); g['last_update']=day
        out.append({'player_id':p['id'],'date':day,'ability_before':a,'ability_after':p['ability'],'group_delta':[round(x,6) for x in d],'matches_84d':len(games),'load_factor':round(load,4),'injury_factor':injury,'phase':st['name'],'version':VERSION})
        out[-1]['attribute_delta']={k:round(updated[k]-before[k],4) for k in ATTR}
        out[-1]['pa_before']=list(p['potential_estimate'])
        potential_review(s,p,day,age,st)
        out[-1]['pa_after']=list(p['potential_estimate'])
    s.setdefault('growth_history_v53',[]).extend(out)
    return out

def report(s,pid,days=90):
    cutoff=(D(s['date'])-dt.timedelta(days=days)).isoformat()
    rows=sorted((x for key in ('growth_history_v51','growth_history_v52','growth_history_v53') for x in s.get(key,[]) if x['player_id']==pid and cutoff<x['date']<=s['date']),key=lambda x:x['date'])
    return {'player_id':pid,'weeks':len(rows),'ability_delta':round(rows[-1]['ability_after']-rows[0]['ability_before'],4) if rows else 0,'group_delta':[round(sum(x['group_delta'][j] for x in rows),4) for j in range(3)]}
