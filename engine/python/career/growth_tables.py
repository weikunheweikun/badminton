"""Automatic weekly development, V5.1. Standard library; no career I/O."""
import datetime as dt
import random
from collections import defaultdict
from season import D, seed
from engine import clip
from legacy_rally import ATTR
VERSION='5.1'
GROUPS=(ATTR[:7],ATTR[7:12],ATTR[12:])
WEIGHTS=(.45,.35,.20)
CURVE=((18,3.5,3.2,3.6),(20,3.5,3.2,3.6),(22,2.8,1.8,3),(24,1.8,.4,2),(26,.8,-.4,1.4),(27,.5,-.7,1.2),(29,.1,-1.5,.8),(31,-.5,-3,.5),(33,-1.3,-4.8,.1),(35,-2.4,-6.3,-.4),(37,-3.5,-7.5,-1))
def rates(age,peak):
    a=age-(peak-27)
    if a<=CURVE[0][0]:return CURVE[0][1:]
    for l,r in zip(CURVE,CURVE[1:]):
        if a<=r[0]:return tuple(x+(y-x)*(a-l[0])/(r[0]-l[0]) for x,y in zip(l[1:],r[1:]))
    return CURVE[-1][1:]
def interp(x,knots):
    if x<=knots[0][0]:return knots[0][1]
    for (a,b),(c,d) in zip(knots,knots[1:]):
        if x<=c:return b+(d-b)*(x-a)/(c-a)
    return knots[-1][1]
def load_factor(n):return interp(n,((0,.82),(20,.95),(40,1.10),(55,1.10),(70,.94),(90,.72),(120,.65)))
def phase(s,p,day):
    g=p['development']; st=g.get('v51_phase')
    if st and day<st['until']:return st
    r=random.Random(seed(s['world_seed'],'growth_v51_phase',p['id'],day)); u=r.random()
    if u<.10:label,lo,hi,weeks='breakthrough',1.25,1.50,r.randint(9,26)
    elif u<.30:label,lo,hi,weeks='fast',1.10,1.25,r.randint(9,17)
    elif u<.45:label,lo,hi,weeks='plateau',.40,.75,r.randint(9,26)
    else:label,lo,hi,weeks='normal',.90,1.10,r.randint(9,17)
    st={'name':label,'factor':r.uniform(lo,hi),'start':day,'until':(D(day)+dt.timedelta(weeks=weeks)).isoformat()};g['v51_phase']=st;return st

def recent(s,day):
    end=D(day); start=(end-dt.timedelta(days=84)).isoformat(); out=defaultdict(list)
    for m in reversed(s['matches']):
        d=m['date']
        if not start<=d<day:continue
        snap=m.get('final_snapshot',{});a,b=m['a'],m['b']; aa,bb=m.get('development_CA',[snap.get('a'),snap.get('b')])
        out[a].append(None if aa is None or bb is None else bb-aa);out[b].append(None if aa is None or bb is None else aa-bb)
    return out

def growth_week(s,day):
    for p in s['players']:
        if (D(day)-D(p['development']['last_update'])).days!=7:raise ValueError('growth requires exact 7-day steps; no duplicate updates')
        if set(p['attributes'])!=set(ATTR):raise ValueError('missing or unknown attributes')
    logs=recent(s,day); anchor=D(s.get('age_anchor_date','2027-01-01')); out=[]
    for p in s['players']:
        g=p['development'];age=g['age_anchor']+(D(day)-anchor).days/365.25;p['age']=int(age)
        a=p['ability']; cap=g['potential_hidden']; h=clip((cap-a)/4,0,1); rs=rates(age,g['peak_age']);st=phase(s,p,day)
        games=logs[p['id']];n=len(games)*365.25/84;load=load_factor(n)
        vals=[x for x in games if x is not None]; quality=sum(clip(1+x/100,.85,1.10) for x in vals)/len(vals) if vals else 1.
        pen=p['fitness']['injury_penalty']; injury=.25 if pen>=10 else .4 if pen>=5 else .85 if pen>=3 else .95 if pen else 1.
        # Body benefits more from recovery; experience helps skill/mental growth, never from winning alone.
        env=(load*quality,interp(n,((0,1.02),(35,1.08),(55,1),(75,.82),(100,.67)) ),load*quality)
        r=random.Random(seed(s['world_seed'],'growth_v51_week',p['id'],day)); before=p['attributes'].copy(); positive={};negative={}
        for j,keys in enumerate(GROUPS):
            # A bounded phase only modestly changes negative age rates, avoiding veteran growth spikes.
            v=rs[j]; pos=max(0,v)*g['growth_factor']*h*env[j]*injury*st['factor']/52
            neg=min(0,v)*g['decline_factor']*clip(1.0+(1-st['factor'])*.25,.85,1.2)/52
            for k in keys:
                f=random.Random(seed(s['world_seed'],'growth_v51_trait',p['id'],k)).uniform(.85,1.15)
                perturb=r.uniform(-.009,.009)
                delta=pos*f+neg*f+perturb
                # No positive drift at cap unless other traits decline; cap checked globally below.
                positive[k]=max(0,delta);negative[k]=min(0,delta)
        def change(scale):
            updated={k:round(clip(before[k]+negative[k]+scale*positive[k],35,99),4) for k in ATTR}
            d=[sum(updated[k]-before[k] for k in keys)/len(keys) for keys in GROUPS]
            return updated,d,sum(w*x for w,x in zip(WEIGHTS,d))
        updated,d,net=change(1)
        allowed=max(0,cap-a)
        if net>allowed:
            lo,hi=0.,1.
            for _ in range(25):
                mid=(lo+hi)/2
                if change(mid)[2]<=allowed:lo=mid
                else:hi=mid
            updated,d,net=change(lo)
        p['attributes']=updated;p['ability']=round(clip(a+net,35,max(a,cap)),4);g['last_update']=day
        out.append({'player_id':p['id'],'date':day,'ability_before':a,'ability_after':p['ability'],'group_delta':[round(x,6) for x in d],'matches_84d':len(games),'load_factor':round(load,4),'injury_factor':injury,'phase':st['name'],'version':VERSION})
    s.setdefault('growth_history_v51',[]).extend(out)
    return out

def report(s,pid,days=90):
    cutoff=(D(s['date'])-dt.timedelta(days=days)).isoformat(); rows=[x for x in s.get('growth_history_v51',[]) if x['player_id']==pid and x['date']>cutoff]
    return {'player_id':pid,'weeks':len(rows),'ability_delta':round(rows[-1]['ability_after']-rows[0]['ability_before'],4) if rows else 0,'group_delta':[round(sum(x['group_delta'][j] for x in rows),4) for j in range(3)]}
