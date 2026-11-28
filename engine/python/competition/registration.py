"""Entry dates, frozen ranking, reserves, and reproducible draws. Simplified simulation rules."""
from collections import Counter
import datetime as dt,random,math
from season import D,seed
from engine import clip
import calendar_rules as cal80
from contracts import dayadd,player
CAP={'100':32,'300':32,'500':32,'750':32,'1000':48,'WC':48,'FINALS':8}
LIMIT={'WC':4,'FINALS':2}

def event(s,eid):return next(e for e in s['calendar'] if e['id']==eid)
def legacy_dates(s,e):
    if not e['start']:return None
    # compressed startup and final invitation dates; freeze ranking only at close.
    if e['id'] in s.get('ui_legacy_deadlines',{}):return s['ui_legacy_deadlines'][e['id']]
    if s.get('calendar_policy')=='bwf80':return cal80.deadlines(s['season_year'],s['calendar'],e)
    offsets=(7,2,1)
    return dict(open=max(f"{s['season_year']}-01-01",dayadd(e['start'],-offsets[0])),close=max(f"{s['season_year']}-01-01",dayadd(e['start'],-offsets[1])),draw=max(f"{s['season_year']}-01-01",dayadd(e['start'],-offsets[2])))
def dates(s,e):
    if not e['start']:return None
    frozen=s.get('ui_sequential_frozen',{}).get(e['id'])
    if frozen:return frozen
    return dict(open=e['start'],close=e['start'],draw=e['start'])

def team_conflicts(s,e):
    """Team-wide selection lock for inclusive calendar overlaps, even after early elimination."""
    roster=set(s['club']['roster']);out=[]
    for o in s['calendar']:
        if o['id']==e['id'] or not o['start'] or o['status']=='cancelled' or not(e['start']<=o['end'] and o['start']<=e['end']):continue
        r=s['registrations'].get(o['id'],{});withdrawn=r.get('withdrawn',{})
        chosen={int(i) for i,v in r.get('intents',{}).items() if v}|set(r.get('entries',[]))
        if any(str(i) not in withdrawn for i in chosen&roster):out.append(o['name'])
    return out

def ready(s):
    for e in sorted(s['calendar'],key=lambda e:(e['start'] or '9999',cal80.PRIORITY[e['level']],e['id'])):
        if e['status']!='scheduled' or not e['start']:continue
        d=dates(s,e);r=s['registrations'].get(e['id'],{})
        if d['open']<=s['date']<=d['close'] and r.get('phase','open')=='open' and not team_conflicts(s,e):return e['id']
    return None

def migrate_sequential(s):
    if s.get('ui_sequential_v93'):return
    frozen={}
    for e in s['calendar']:
        r=s['registrations'].get(e['id'],{})
        if r.get('phase') in ('accepted','drawn','completed','cancelled'):
            frozen[e['id']]=legacy_dates(s,e)
        elif r.get('phase')=='open' and s['date']<e['start']:
            # Old preliminary choices have not been accepted; ask again at the station.
            s['registrations'].pop(e['id'],None)
    s['ui_sequential_frozen']=frozen;s['ui_sequential_v93']=True

def init(s):
    s['registrations']={};s['rules']['registration']='7.4 phased entry; association unchanged; reserve and byes';return s

def state(s,e):
    return s['registrations'].setdefault(e['id'],{'phase':'open','intents':{},'withdrawn':{},'rank_snapshot':{},'entries':[],'reserves':[],'decisions':{},'history':[]})
def conflict(s,e,pid):
    for other in s['calendar']:
        if other['id']==e['id'] or not other['start'] or other['status']=='cancelled' or not(e['start']<=other['end'] and other['start']<=e['end']):continue
        v=s['v42']['events'].get(other['id']);r=s['registrations'].get(other['id'],{})
        if pid in (v['entries'] if v else r.get('entries',[])) and str(pid) not in r.get('withdrawn',{}):return True
    return False

def controlled(s,e,pid):
    p=player(s,pid)
    return pid in s['club']['roster']

def submit(s,eid,ids):
    e=event(s,eid);d=dates(s,e)
    if not d or e['status']!='scheduled' or not d['open']<=s['date']<=d['close']:raise ValueError('outside entry window')
    if ready(s)!=eid:raise ValueError('仅可报名当前站；同期赛事只能选择一站')
    if ids and team_conflicts(s,e):raise ValueError('本队已报名同期赛事')
    r=state(s,e)
    if r['phase']!='open':raise ValueError('entry closed')
    if len(ids)!=len(set(ids)) or not set(ids)<=set(s['club']['roster']):raise ValueError('only current club players')
    for pid in s['club']['roster']:
        if controlled(s,e,pid) and pid in ids and conflict(s,e,pid):raise ValueError('该球员已入围时间重叠的赛事，请取消勾选或先退出另一站')
    for pid in s['club']['roster']:
        if controlled(s,e,pid):r['intents'][str(pid)]=pid in ids
    return r

def order_key(e,p,snap):
    r=snap[str(p['id'])]['rank'];race=snap[str(p['id'])]['race'];level=e['level']
    if level=='FINALS':return (-race,-snap[str(p['id'])].get('tour_count',0),-snap[str(p['id'])].get('second_half',0),snap[str(p['id'])].get('lot',p['id']))
    return (r,p['id'])

# Rows: rank 1–10, 11–20, 21–35, 36–50, 51–75, 76+.
ENTRY_BASE={
 '100':(.008,.025,.10,.48,.90,.96),
 '300':(.035,.13,.52,.88,.92,.82),
 '500':(.35,.70,.93,.91,.79,.58),
 '750':(.92,.92,.84,.68,.49,.32),
 '1000':(.98,.96,.88,.72,.53,.34)}
def ai_probability(s,e,p):
    level=e['level'];r=p['rank'];f=p['fitness'];age=p['age']
    if level in ('WC','FINALS'):return 1.0
    if e.get('ruleset')=='bwf84' and p['id'] in s.get('committed84',[]) and level in ('1000','750') and f.get('injury_penalty',0)==0:return 1.0
    band=next((i for i,k in enumerate((10,20,35,50,75)) if r<=k),5)
    base=ENTRY_BASE[level][band]
    # Avoid low-tier farming by still-elite players after a temporary ranking drop.
    if level in ('100','300') and p['ability']>=90:base=min(base,.035 if level=='100' else .16)
    elif level=='100' and p['ability']>=86:base=min(base,.15)
    fatigue=max(0,f.get('fatigue',0));recent=sum(1 for o in s['calendar'] if o['id']!=e['id'] and o['start']<e['start'] and 0<=(D(e['start'])-D(o['end'])).days<=24 and p['id'] in s['registrations'].get(o['id'],{}).get('entries',[]) and str(p['id']) not in s['registrations'].get(o['id'],{}).get('withdrawn',{}))
    recovery=math.exp(-.023*fatigue-.12*max(0,recent-1)*(1.35 if age>=32 else 1))
    # Prioritize major events and conserve energy for the next major tournament.
    if level in ('100','300','500') and band<3 and any(o['level'] in ('1000','750','WC') and 0<(D(o['start'])-D(e['end'])).days<=10 for o in s['calendar']):recovery*=.70
    if level in ('1000','750') and band<2:recovery=max(.68,recovery)
    if f.get('injury_penalty',0)>=5:return 0.0
    if f.get('injury_penalty',0):recovery*=.70
    return clip(base*recovery,0,.99)
def available(s,e,p,r):return (p['fitness']['injury_penalty']<5 or (e.get('ruleset')=='bwf84' and s['v42']['injuries'].get(str(p['id']),{}).get('until','9999')<=e['start'])) and str(p['id']) not in r['withdrawn'] and not conflict(s,e,p['id'])
def allocate(s,e,r,pool):
    out=[];counts=Counter();cap=CAP[e['level']];limit=LIMIT.get(e['level'],cap)
    for pid in pool:
        p=player(s,pid)
        if len(out)<cap and counts[p['country']]<limit and available(s,e,p,r):out.append(pid);counts[p['country']]+=1
    return out

def close(s,e):
    r=state(s,e);d=dates(s,e)
    if r['phase']!='open' or s['date']!=d['close']:raise ValueError('entry close date required')
    missing=[pid for pid in s['club']['roster'] if controlled(s,e,pid) and str(pid) not in r['intents']]
    if missing:raise ValueError('club entry confirmation required')
    r['rank_snapshot']={str(p['id']):{'rank':p['rank'],'race':p['race_points'],'tour_count':sum(int(x.get('race_season',x['date'][:4]))==s['season_year'] and str(x.get('level','')).isdigit() for x in p['ranking_ledger']),'second_half':sum(x['points'] for x in p['ranking_ledger'] if int(x.get('race_season',x['date'][:4]))==s['season_year'] and x['date'][5:]>='07-01' and str(x.get('level','')).isdigit()),'lot':seed(s['world_seed'],'entry_tie84',e['id'],p['id'])} for p in s['players']}
    level=e['level'];n=len(s['players']);target={'100':75,'300':50,'500':32,'750':20,'1000':15,'WC':20,'FINALS':8}[level]
    pool=[]
    for p in s['players']:
        pid=p['id'];rank=p['rank'];f=p['fitness']['fatigue'];explicit=r['intents'].get(str(pid)) if controlled(s,e,pid) else None
        prob=ai_probability(s,e,p)
        willing=explicit if explicit is not None else random.Random(seed(s['world_seed'],'entry79',e['id'],pid)).random()<prob
        qual=level!='FINALS' or p['race_points']>0
        if willing and qual and not conflict(s,e,pid):pool.append(pid)
        r['decisions'][str(pid)]={'willing':bool(willing),'eligible_at_close':qual and available(s,e,p,r),'rank':rank,'probability':prob if explicit is None else None}
    pool.sort(key=lambda pid:order_key(e,player(s,pid),r['rank_snapshot']))
    if level=='FINALS' and e.get('ruleset')=='bwf84' and s['season_year']%4!=0:
        wc=next((v for eid,v in s['v42']['events'].items() if eid.endswith('-WC') and v.get('settled')),None)
        champion=next((int(i) for i,z in wc.get('placements',{}).items() if z==0),None) if wc else None
        race_order=sorted(s['players'],key=lambda p:order_key(e,p,r['rank_snapshot']))
        if champion in pool and player(s,champion)['rank']<=20:
            pool.remove(champion);pool.insert(0,champion);r['champion_invitation']=champion
    r['pool']=pool;r['entries']=allocate(s,e,r,pool);r['reserves']=[i for i in pool if i not in r['entries']];r['phase']='accepted';r['history'].append({'date':s['date'],'action':'close','entries':r['entries'].copy()});return r

def review(s,e):
    r=state(s,e)
    if r['phase']!='accepted':raise ValueError('not accepted')
    # Accepted places preserved; vacant slots filled by frozen priority.
    old=r['entries'].copy();r['entries']=allocate(s,e,r,old+r['reserves']);
    if e.get('ruleset')=='bwf84':
        for p in s['players']:
            if str(p['id']) in r['rank_snapshot']:r['rank_snapshot'][str(p['id'])]['seed_rank']=p['rank']
    r['reserves']=[i for i in r['pool'] if i not in r['entries'] and str(i) not in r['withdrawn']]
    for i in old:
        if i not in r['entries']:r['history'].append({'date':s['date'],'action':'removed','player_id':i,'reason':'withdrawal, injury or conflict'})
    for i in r['entries']:
        if i not in old:r['history'].append({'date':s['date'],'action':'promoted','player_id':i})
    return r

def withdraw(s,eid,pid,reason='voluntary'):
    e=event(s,eid);r=state(s,e)
    if pid not in s['club']['roster'] or r['phase'] not in ('open','accepted','drawn') or e['status']!='scheduled':raise ValueError('cannot withdraw')
    if not controlled(s,e,pid) and reason!='medical':raise ValueError('national priority: association controls voluntary WC withdrawal')
    if reason=='medical' and player(s,pid)['fitness']['injury_penalty']<5:raise ValueError('medical withdrawal requires severe injury')
    if r['phase']=='open':
        if not dates(s,e)['open']<=s['date']<=dates(s,e)['close']:raise ValueError('entry window closed')
        r['intents'][str(pid)]=False
        if reason=='medical':r['withdrawn'][str(pid)]={'date':s['date'],'reason':reason}
        return r
    if pid not in r['pool']:raise ValueError('not registered')
    v=s['v42']['events'].get(eid)
    if v and (str(pid) in v['placements'] or str(pid) in v.get('qualification',{}).get('eliminated',{})):raise ValueError('player already eliminated')
    if v and v['active'] and pid in (v['queue'][v['cursor']]['a'],v['queue'][v['cursor']]['b']):raise ValueError('active match: use retirement')
    if str(pid) in r['withdrawn']:raise ValueError('already withdrawn')
    r['withdrawn'][str(pid)]={'date':s['date'],'reason':reason};r['history'].append({'date':s['date'],'action':'withdraw','player_id':pid,'reason':reason})
    if r['phase']=='accepted':review(s,e)
    return r
