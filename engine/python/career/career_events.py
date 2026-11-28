"""V7.4 phased career manager. V7.1 match core unchanged."""
import json, datetime as dt, calendar, random, itertools, copy, os
from pathlib import Path
from engine import clip
from match_engine import start_match_v71, restore_match, match_statistics
from analytics import archive
from career_setup import create as base_create
from career_helpers import PRIZE,BONUS,REP,bonus,seed_order,persist,player,event,dateadd,rng
from fitness import daily,finish
from growth import growth_week
from business import pay,settle_month,refresh_interest,title_reward
from season import D
import registration as reg
import contracts as contracts
import ranking as rank
import calendar_rules as cal80
import draw as draw83
VERSION='7.4-management'


def create(seed,year=2027,club_name='新俱乐部',city='未指定',cash=30_000_000,count=100,roster_input=None):
    s=base_create(seed,year,club_name,city,cash,count,roster_input);s['version']=VERSION
    s['rules']['management']=VERSION
    # Fictional event calendar, real announced number of tiers; 11-day S1000 and 6-day others.
    levels=['1000','750','500','300','100','500','300']*5
    # Convert two S500 and two S300 to S100? desired 5/5/9/8/8: current 5/5/10/10/5 -> 1 S500 + 2 S300.
    levels[5]='100';levels[6]='100';levels[13]='100'
    start=D(s['date'])+dt.timedelta(days=7)
    for e,lvl in zip(s['calendar'][:35],levels):
        span=10 if lvl=='1000' else 5;end=start+dt.timedelta(days=span)
        e.update(level=lvl,start=str(start),end=str(end),name=f"巡回赛第{e['id'][-2:]}站 S{lvl}",format='groups_then_knockout' if lvl=='1000' else 'knockout');start=end+dt.timedelta(days=3)
    wc=event(s,f'{year}-WC');wc.update(start=f'{year}-11-18',end=f'{year}-11-25',status='scheduled',source='fictional calendar')
    if any(e['start']<=wc['end'] and wc['start']<=e['end'] for e in s['calendar'] if e is not wc):raise ValueError('WC overlap')
    reg.init(s);contracts.init(s);rank.init(s);return s

def load(path):
    s=json.loads(Path(path).read_text());
    if s.get('version')!=VERSION:raise ValueError('new V7.4 career required')
    return s

def add(v,st,a,b):
    v['queue'].append({'stage':st,'a':a,'b':b,'date':v['days'][st],'serial':len(v['queue'])+1})
def seeding(e,r,p):
    # Freeze both ranking and race at entry close.
    x=r['rank_snapshot'][str(p)];return (-x['race'],x['rank'],p) if e['level']=='FINALS' and e.get('ruleset')=='bwf84' else (x.get('seed_rank',x['rank']),x.get('lot',p))
def draw(s,e):
    if s['date']!=reg.dates(s,e)['draw']:raise ValueError('draw date required')
    r=reg.review(s,e);level=e['level'];entries=sorted(r['entries'],key=lambda i:seeding(e,r,i));n=len(entries)
    v={'entries':entries,'requested':[int(i) for i,b in r['intents'].items() if b],'rejected':[int(i) for i,b in r['intents'].items() if b and int(i) not in entries],'decisions':r['decisions'],'groups':[],'queue':[],'cursor':0,'days':{},'placements':{},'results':[],'active':None,'settled':False,'walkovers':0}
    s['v42']['events'][e['id']]=v;e['entries']=entries.copy();r['phase']='drawn';r['history'].append({'date':s['date'],'action':'draw','entries':entries.copy()})
    if n<({'1000':16,'WC':16,'FINALS':4}.get(level,8)):
        e.update(status='cancelled',cancel_reason=f'only {n} available');v['settled']=True;r['phase']='cancelled';return v
    rr=rng(s,'draw83',e['id']);v['draw_policy']='protected83';group=level in ('1000','WC','FINALS')
    def ko_stages(size):return {2:['F'],4:['SF','F'],8:['QF','SF','F'],16:['R16','QF','SF','F'],32:['R32','R16','QF','SF','F'],64:['R64','R32','R16','QF','SF','F']}[size]
    if group:
        # 48 = 16 groups of 3, winner advances; reduced fields use smaller powers of 2.
        ng=2 if level=='FINALS' else min(16,2**((n//2).bit_length()-1))
        if level!='FINALS' and ng>1 and n>ng*3 and ng<16:ng*=2
        # With fewer than 32 entries some 1-player groups are possible only if above formula overshoots; prevent.
        ng=min(ng,2**((n//2).bit_length()-1)) if level!='FINALS' else 2
        groups,v['seeds']=draw83.groups_draw(entries,ng,rr,lambda i:player(s,i)['country'],level=='FINALS',e.get('ruleset')=='bwf84',level=='WC')
        v['groups']=groups;v['advance_per_group']=2 if level=='FINALS' else 1;size=ng*v['advance_per_group']
        # Round-robin schedule, at most one match/player/day, max group size four.
        schedule=[[],[],[]]
        for g in groups:
            for j,pairs in enumerate(draw83.group_schedule(g,lambda i:player(s,i)['country'])):schedule[j].extend(pairs)
        gdays=[(f'G{i+1}',pairs) for i,pairs in enumerate(schedule) if pairs];stages=[st for st,_ in gdays]+(ko_stages(size) if size>=2 else [])
        if size==1: # two-player shortage fallback to direct final
            group=False;v['groups']=[]
        else:v['group_last']=gdays[-1][0]
    if not group:
        size=2**((n-1).bit_length());stages=ko_stages(size)
    span=(D(e['end'])-D(e['start'])).days
    if len(stages)-1>span:raise ValueError('round dates insufficient')
    v['days']={st:dateadd(e['start'],round(j*span/max(1,len(stages)-1))) for j,st in enumerate(stages)}
    if group:
        for st,pairs in gdays:
            for a,b in pairs:add(v,st,a,b)
    else:
        slots,v['seeds']=draw83.main_slots(entries,size,rr,count=min(8,draw83.seed_count(n)),country=None if e.get('ruleset')=='bwf84' else lambda i:player(s,i)['country']);v['main_slots']=slots
        for a,b in zip(slots[::2],slots[1::2]):add(v,stages[0],a,b)
    return v

def process_entries(s,auto=False):
    for e in sorted(s['calendar'],key=lambda e:((reg.dates(s,e) or {}).get('close','9999'),cal80.PRIORITY[e['level']],e['start'] or '9999',e['id'])):
        if e['status']!='scheduled' or not e['start']:continue
        d=reg.dates(s,e)
        if s['date']<d['open']:continue
        r=reg.state(s,e)
        if r['phase']=='open' and s['date']==d['close']:
            missing=[i for i in s['club']['roster'] if reg.controlled(s,e,i) and str(i) not in r['intents']]
            blocked=reg.team_conflicts(s,e)
            if blocked:
                for i in s['club']['roster']:r['intents'][str(i)]=False
                r['team_conflicts']=blocked
            elif missing and not auto:return {'pause':'registration','event':e['id'],'missing':missing,'date':s['date']}
            else:
                for i in missing:r['intents'][str(i)]=True
            reg.close(s,e)
        if r['phase']=='accepted' and s['date']==d['draw']:draw(s,e)
    return None

def withdraw(s,eid,pid,reason='voluntary'):return reg.withdraw(s,eid,pid,reason)

def group_order(s,e,v,g):
    if e.get('ruleset')=='bwf84':
        from season import seed
        return draw83.standings84(g,v['results'],s['registrations'][e['id']]['withdrawn'],lambda i:seed(s['world_seed'],'group_lot84',e['id'],i))[0]
    r=s['registrations'][e['id']];eligible=[i for i in g if not unavailable(s,e,i)];stats={i:[0,0,0] for i in eligible};head={}
    for m in v['results']:
        a,b=m['a'],m['b'];w=m['winner']
        if a not in stats or b not in stats or w not in (a,b):continue
        if m.get('outcome') in ('bye','void'):continue
        h=m['history'];diff=sum(x-y for x,y in h);gd=sum((x>y)-(x<y) for x,y in h)
        stats[a][0]+=int(w==a);stats[b][0]+=int(w==b);stats[a][1]+=gd;stats[b][1]-=gd;stats[a][2]+=diff;stats[b][2]-=diff;head[frozenset((a,b))]=w
    result=[]
    for w in sorted({x[0] for x in stats.values()},reverse=True):
        t=[i for i in eligible if stats[i][0]==w]
        if len(t)==2 and frozenset(t) in head:
            hw=head[frozenset(t)];t.sort(key=lambda i:i!=hw)
        else:t.sort(key=lambda i:(-stats[i][1],-stats[i][2],g.index(i)))
        result+=t
    return result

def next_round(s,e,v,st):
    if st.startswith('G'):
        if st!=v['group_last']:return
        orders=[group_order(s,e,v,g) for g in v['groups']];v['group_order']=orders
        if e.get('ruleset')=='bwf84':v['group_withdrawn84']=copy.deepcopy(s['registrations'][e['id']]['withdrawn'])
        k=v['advance_per_group'];winners=[]
        for g,o in zip(v['groups'],orders):
            for i in g:
                if i not in o[:k]:
                    if e.get('ruleset')=='bwf84':
                        pos=o.index(i) if i in o else len(g)-1
                        v['placements'][str(i)]=(4 if pos==2 else 5) if e['level']=='FINALS' else min(7,(len(v['groups'])*(pos+1)-1).bit_length())
                    else:v['placements'][str(i)]=4 if e['level']=='FINALS' and i in o and o.index(i)==2 else 5
        if v.get('draw_policy')=='protected83':
            pairs=draw83.group_routes(orders,k,rng(s,'group_ko83',e['id']))
        elif k==2:
            pair=lambda o,j:o[j] if len(o)>j else None
            pairs=[(pair(orders[0],0),pair(orders[1],1)),(pair(orders[1],0),pair(orders[0],1))]
        else:
            winners=[o[0] if o else None for o in orders];winners=[winners[j] for j in seed_order(len(winners))];pairs=list(zip(winners[::2],winners[1::2]))
        nxt={1:'F',2:'SF',4:'QF',8:'R16'}[len(pairs)]
    else:
        results=sorted((m for m in v['results'] if m['stage']==st),key=lambda m:m.get('slot',m['serial']));idx={'R64':6,'R32':5,'R16':4,'QF':3,'SF':2,'F':1}[st]
        for m in results:
            for i in (m['a'],m['b']):
                if i is not None and i!=m['winner']:v['placements'][str(i)]=idx
        winners=[m['winner'] for m in results]
        if st=='F':
            if winners[0] is not None:v['placements'][str(winners[0])]=0
            settle(s,e,v);return
        nxt={'R64':'R32','R32':'R16','R16':'QF','QF':'SF','SF':'F'}[st];pairs=list(zip(winners[::2],winners[1::2]))
    for a,b in pairs:add(v,nxt,a,b)

def settle(s,e,v):
    if v['settled']:raise ValueError('duplicate settlement')
    if set(v['placements'])!=set(map(str,v['entries'])):raise ValueError('missing placements')
    # No ranking credits or prizes for an entrant who never played a real point.
    played={i for m in s['matches'] if m['event_id']==e['id'] and m.get('log_available',True) and (not v.get('qualification') or m['stage'] not in ('Q1','Q2','Q3')) for i in (m['a'],m['b'])}
    rank.award(s,e,v['placements'],played);v['prizes']={};lvl=e['level']
    for i,stage in v['placements'].items():
        p=player(s,int(i));gross=round(PRIZE[lvl]*[1,.5,.25,.125,.06,.03,.01,0][stage]) if p['id'] in played else 0;share=round(gross*.3) if p['id'] in s['club']['roster'] else 0
        v['prizes'][i]={'gross':gross,'club':share,'player':gross-share}
        if share:pay(s,share,'prize_share',event_id=e['id'],player_id=p['id'])
        if stage==0 and p['id'] in played and p['id'] in s['club']['roster']:
            bonus(s,p,BONUS[lvl],e['id']);s['club']['reputation']=min(100,s['club']['reputation']+REP[lvl]);title_reward(s,e,p)
    v['settled']=True;s['registrations'][e['id']]['phase']='completed';refresh_interest(s)

def unavailable(s,e,i):
    if i is None:return True
    r=s['registrations'][e['id']];p=player(s,i)
    if p['fitness']['injury_penalty']>=5 and str(i) not in r['withdrawn']:r['withdrawn'][str(i)]={'date':s['date'],'reason':'medical'}
    return str(i) in r['withdrawn']

def complete(s,e,v,item,record):
    v['results'].append({**item,**record});v['cursor']+=1;v['active']=None
    if v['cursor']==len(v['queue']):next_round(s,e,v,item['stage'])
    return {'finished':True,**record}

def prune_match_archive(s, migrate=False):
    """Keep results and development data; bound replay storage, never touch active matches.
    log_available is the legacy *played-match* flag used for ranking, not a replay flag.
    """
    cutoff=dateadd(s['date'],-28); trajectory_cutoff=dateadd(s['date'],-7)
    detailed=0
    for rec in reversed(s['matches']):
        snap=rec.get('final_snapshot',{})
        if migrate:
            rec.setdefault('simulation_mode','spatial' if snap.get('spatial') else 'abstract')
            rec['final_snapshot']={k:v for k,v in snap.items() if k in ('a','b','spatial','spatial_detail','score','games','history','server','ends','fatigue','form','day_form','body_profiles')}
            if 'managed' not in rec:rec['managed']=bool(snap.get('spatial_detail') or 'log' in rec)
            if not rec['managed']:rec['statistics']=None
        if rec.get('managed') and 'analytics_v153' not in rec:archive(rec)
        if 'log' not in rec:continue
        detailed+=1
        if detailed>12 or (detailed>1 and rec['date']<cutoff):
            rec.pop('log',None);continue
        if detailed>2 or (detailed>1 and rec['date']<trajectory_cutoff):
            for row in rec['log']:row.pop('spatial',None)


def play(s,eid,until='match',retire_id=None,fast=False):
    e=event(s,eid);v=s['v42']['events'][eid]
    if v['settled'] or v['cursor']>=len(v['queue']):raise ValueError('no match')
    item=v['queue'][v['cursor']];a,b=item['a'],item['b']
    if item['date']!=s['date']:raise ValueError('wrong date')
    if until not in ('point','interval','game','match'):raise ValueError('invalid granularity')
    if not v['active']:
        if retire_id is not None:raise ValueError('no active match')
        ua,ub=unavailable(s,e,a),unavailable(s,e,b)
        if ua or ub:
            w=None if ua and ub else b if ua else a;kind='bye' if (a is None or b is None) and w else 'void' if w is None else 'walkover';v['walkovers']+=int(kind=='walkover')
            return complete(s,e,v,item,{'winner':w,'history':[],'outcome':kind})
    m=restore_match(v['active']) if v['active'] else start_match_v71(s,eid,a,b,item['stage'],item['serial'],fast=fast or not bool({a,b}&set(s['club']['roster'])))
    coach=s.get('coach_current',{})
    if m.spatial and coach.get('key')==[eid,item['serial'],a,b]:m.coach_plans=coach.get('plans',{})
    if retire_id is not None:
        if retire_id not in (a,b) or retire_id not in s['club']['roster'] or not m.log:raise ValueError('retirement requires active managed player and played point')
        winner=b if retire_id==a else a;s['registrations'][eid]['withdrawn'][str(retire_id)]={'date':s['date'],'reason':'retirement'};outcome='retirement'
    else:
        m.run(until)
        if max(m.games)<2:
            v['active']=m.snapshot()
            return {'pause':'in_match','event':eid,'score':m.score,'games':m.games,'history':m.history}
        winner=[a,b][m.games.index(2)];outcome='played'
    managed=bool({a,b}&set(s['club']['roster']))
    # Completed matches never need RNG state or a full copy of the active rally log.
    snap={k:getattr(m,k) for k in ('a','b','spatial','spatial_detail','score','games','history','server','ends','fatigue','form','day_form','body_profiles')}
    rec={**item,'event_id':eid,'seed':m.seed,'winner':winner,'history':m.history,'final_snapshot':snap,'engine_version':m.engine_version,'simulation_mode':'spatial' if m.spatial else 'abstract','managed':managed,'statistics':match_statistics(m.log) if managed else None,'outcome':outcome,'log_available':True}
    if managed:rec['log']=m.log
    s['matches'].append(rec)
    if managed:prune_match_archive(s)
    for k,i in enumerate((a,b)):
        p=player(s,i);p['season_stats']['wins' if i==winner else 'losses']+=1;finish(p,m,k);f=p['fitness'];rr=rng(s,'injury',eid,item['serial'],i);prob=clip(.002+.0015*f['residual']+.0012*f['chronic']+.001*max(0,p['age']-29)+.0003*max(0,85-p['attributes']['身体素质']),0,.05)
        if f['injury_penalty']==0 and rr.random()<prob:
            u=rr.random();lo,hi,pen=(1,3,1) if u<.70 else (4,14,3) if u<.95 else (15,56,5) if u<.995 else (57,180,10);f['injury_penalty']=pen;f['status']='injured';inj={'until':dateadd(s['date'],rr.randint(lo,hi)),'penalty':pen,'event':eid};s['v42']['injuries'][str(i)]=inj;s['v42']['injury_history'].append({'player_id':i,'date':s['date'],**inj})
    return complete(s,e,v,item,{'winner':winner,'history':m.history,'outcome':outcome})

def advance_day(s,auto=False):
    if s['date'].endswith('-12-31'):raise ValueError('season closed')
    pause=process_entries(s,auto)
    if pause:raise ValueError('registration pending')
    if any(not v['settled'] and v['cursor']<len(v['queue']) and v['queue'][v['cursor']]['date']<=s['date'] for v in s['v42']['events'].values()):raise ValueError('match pending')
    if D(s['date']).day==calendar.monthrange(D(s['date']).year,D(s['date']).month)[1]:settle_month(s,s['date'])
    s['date']=dateadd(s['date'],1);day=s['date'];contracts.expire(s)
    for p in s['players']:
        daily(p,s['world_seed'],day);inj=s['v42']['injuries'].get(str(p['id']))
        if inj and day>=inj['until']:p['fitness'].update(injury_penalty=0,status='fit');del s['v42']['injuries'][str(p['id'])]
    if (D(day)-D(s['age_anchor_date'])).days%7==0:growth_week(s,day)
    rank.rankings(s);refresh_interest(s)

def run(s,target,auto=False):
    if not s['date']<=target<=f"{s['season_year']}-12-31":raise ValueError('invalid target')
    while True:
        pause=process_entries(s,auto)
        if pause:return pause
        for eid,v in sorted(s['v42']['events'].items()):
            while not v['settled'] and v['cursor']<len(v['queue']) and v['queue'][v['cursor']]['date']==s['date']:
                item=v['queue'][v['cursor']]
                if not auto and {item['a'],item['b']}&set(s['club']['roster']):return {'pause':'match','event':eid,'match':item,'date':s['date']}
                play(s,eid)
        if s['date']==target:
            if target.endswith('-12-31') and target[:4] not in s['v42']['year_closed']:
                for i in s['club']['roster']:
                    p=player(s,i);bonus(s,p,.30 if p['rank']<=3 else .15 if p['rank']<=10 else 0,'year_end_rank')
                settle_month(s,target);s['v42']['year_closed'].append(target[:4])
            return {'finished':True,'date':target}
        advance_day(s,auto)
