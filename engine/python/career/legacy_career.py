"""SMASH V5.3 manager; unchanged V5.0.1 rally engine."""
import json, os, random, datetime as dt, itertools, copy
from pathlib import Path
from season import D, seed, rankings, award, start_match, important, monthly_finance, POINTS
from engine import Match, clip
from growth import growth_week, report
from recruitment import refresh as refresh_recruitment
from legacy_rally import RallyMatch, VERSION, restore_match, start_match_v50
ROOT=Path(__file__).resolve().parent
MANAGER_VERSION='5.3'
ROUTE_POLICY='fixed_seed_protection_r2'
PRIZE={'1000':700000,'750':450000,'500':280000,'300':120000,'100':50000,'FINALS':1500000,'WC':0}
BONUS={'1000':.30,'750':.20,'500':.10,'300':.05,'100':0,'FINALS':.40,'WC':.50}
REP={'1000':5,'750':3,'500':2,'300':1,'100':.5,'FINALS':6,'WC':8}
TACTICS={'balanced':None,'attack':('杀球进攻','爆发力','防守能力','移动速度'),'control':('拉吊控球','击球稳定性','体能耐力','判断与预判'),'net':('网前技术','接发球','网前技术','灵活性'),'counter':('防守能力','判断与预判','杀球进攻','爆发力')}

def load(path=None):
    if path is None:raise ValueError('explicit working-state path required')
    s=json.loads(Path(path).read_text())
    if s.get('version')!=MANAGER_VERSION:raise ValueError('explicit V5.3 migration required')
    s.setdefault('v42',{'events':{},'injuries':{},'bonus_paid':{},'rank_history':[], 'year_closed':[], 'injury_history':[], 'best_rank':{}, 'revision':0, 'save_id':'LEGACY_V42'})
    return refresh_recruitment(s)

def persist(s,path):
    refresh_recruitment(s)
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
    if path.name in ('save.json','career.json'): raise ValueError('archive filenames protected; use career_working.json')
    tmp=path.with_suffix(path.suffix+'.tmp'); tmp.write_text(json.dumps(s,ensure_ascii=False,indent=2)); os.replace(tmp,path)

def player(s,i): return next(p for p in s['players'] if p['id']==i)
def event(s,i): return next(e for e in s['calendar'] if e['id']==i)
def rng(s,*key): return random.Random(seed(s['world_seed'],*key))
def dateadd(d,n): return (D(d)+dt.timedelta(days=n)).isoformat()
def schedule_wc(s,start,end):
    e=event(s,str(s.get('season_year',2027))+'-WC')
    if e['status']!='date_pending' or start<s['date'] or end>str(s.get('season_year',2027))+'-12-31' or (D(end)-D(start)).days<7:raise ValueError('invalid WC dates')
    e.update(start=start,end=end,status='scheduled')

def expiring(s,days=30):
    end=dateadd(s['date'],days)
    return [{'player_id':p['id'],'event_id':x['event_id'],'points':x['points'],'expiry':dateadd(x['date'],364)} for p in s['players'] if p['id'] in s['club']['roster'] for x in p['ranking_ledger'] if s['date']<dateadd(x['date'],364)<=end]

def eligible(s,e,p):
    if p['fitness']['injury_penalty']>=5:return False
    if e['level']=='FINALS' and p['race_points']<=0:return False
    for k,v in s['v42']['events'].items():
        other=event(s,k)
        if k!=e['id'] and other['status']!='completed' and p['id'] in v['entries'] and e['start']<=other['end'] and other['start']<=e['end']:return False
    return True

def seed_order(n):
    if n==2:return [0,1]
    prev=seed_order(n//2)
    return [x for i in prev for x in (i,n-1-i)]

def knockout_routes(n):
    """Fixed group-winner vs runner-up routes, in bracket order (zero-based)."""
    if n==8:
        # A1-H2, E1-D2, C1-F2, G1-B2 / B1-G2, F1-C2, D1-E2, H1-A2.
        return [(0,7),(4,3),(2,5),(6,1),(1,6),(5,2),(3,4),(7,0)]
    if n==2:  # Finals: only two groups; cross-group semifinals are unavoidable.
        return [(0,1),(1,0)]
    if n==16:  # WC: rotate opposite-half runner-up slots by one quarter.
        order=seed_order(n); half=n//2; quarter=n//4
        return [(g,order[((j//half)^1)*half+(j%half+quarter)%half]) for j,g in enumerate(order)]
    raise ValueError('unsupported group count')

def migrate_pending_group_bracket(s,eid):
    """One explicit migration: only a fully played group stage, untouched KO queue."""
    e=event(s,eid); v=s['v42']['events'][eid]; n=len(v['groups']); q=v['queue']; j=v['cursor']
    if e['status']!='scheduled' or v['settled'] or v['active'] is not None or j!=6*n or len(q)!=7*n or len(v['results'])!=j:
        raise ValueError('migration requires completed groups and unstarted first knockout round')
    if any(x['stage'] not in ('G1','G2','G3') for x in v['results']) or any(x['event_id']==eid and x['stage'] not in ('G1','G2','G3') for x in s['matches']):
        raise ValueError('knockout already started')
    if v.get('route_policy')==ROUTE_POLICY:raise ValueError('already migrated')
    orders=[group_order(s,g,v['results']) for g in v['groups']]
    if orders!=v['group_order']:raise ValueError('stored group order mismatch')
    stage={2:'SF',8:'R16',16:'R32'}[n]
    if any(x['stage']!=stage or x['serial']!=j+k+1 or x['date']!=v['days'][stage] or x['date']<s['date'] for k,x in enumerate(q[j:])):
        raise ValueError('unexpected knockout queue')
    for x,(g,h) in zip(q[j:],knockout_routes(n)):
        x.update(a=orders[g][0],b=orders[h][1])
    v['route_policy']=ROUTE_POLICY
    s['rules']['group_knockout']=ROUTE_POLICY
    s['version']=MANAGER_VERSION
    return q[j:]

def prepare(s,eid,club_entries):
    if s.get('version')!=MANAGER_VERSION:raise ValueError('V5.3 save required')
    e=event(s,eid); v=s['v42']; roster=set(s['club']['roster']); chosen=set(club_entries)
    if not chosen<=roster or len(chosen)!=len(club_entries):raise ValueError('invalid club entries')
    if eid in v['events'] or e['status']!='scheduled':raise ValueError('already prepared or completed')
    if e['level'] not in POINTS or not e['start'] or not e['end']:raise ValueError('unsupported/undated event')
    if s['date']>e['start']:raise ValueError('late entry')
    level=e['level']; size=8 if level=='FINALS' else 64 if level=='WC' else 32
    order=sorted(s['players'],key=lambda p:(-p['race_points'],p['rank'],p['id']) if level=='FINALS' else (p['rank'],p['id']))
    # Finals invite in race order, with next eligible players as reserves.
    candidates=[]; decisions={}
    for p in order:
        i=p['id']; ok=eligible(s,e,p); rank=p['rank']; f=p['fitness']['fatigue']
        target={'1000':20,'750':28,'500':45,'300':65,'100':90,'WC':32,'FINALS':8}[level]
        prob=clip(.95-abs(rank-target)/100-.08*f,.10,.98)
        if level in ('WC','FINALS'):prob=1
        draw=None if i in roster else rng(s,'entry',eid,i).random()
        willing=(i in chosen) if i in roster else draw<prob
        decisions[str(i)]={'eligible':ok,'willing':willing,'prob':None if i in roster else prob,'draw':draw}
        if ok and willing:candidates.append(p)
    entries=[]; countries={}; limit=4 if level=='WC' else 2 if level=='FINALS' else 8
    for p in candidates:
        if len(entries)==size:break
        c=p['country']
        if countries.get(c,0)>=limit:continue
        entries.append(p['id']);countries[c]=countries.get(c,0)+1
    # deterministic reserves only among willing; shortage is explicit, never silently force entry
    if len(entries)!=size:raise ValueError(f'only {len(entries)}/{size} eligible willing entrants; manager must resolve shortage')
    r=rng(s,'draw',eid); groups=[]; queue=[]; group_mode=level in ('1000','WC','FINALS')
    stages=(['G1','G2','G3']+(['R32'] if size==64 else [])+(['R16','QF'] if size!=8 else [])+['SF','F']) if group_mode else ['R32','R16','QF','SF','F']
    span=(D(e['end'])-D(e['start'])).days
    if span<len(stages)-1:raise ValueError('insufficient round dates')
    days={st:dateadd(e['start'],round(j*span/(len(stages)-1))) for j,st in enumerate(stages)}
    def add(st,a,b):queue.append({'stage':st,'a':a,'b':b,'date':days[st],'serial':len(queue)+1})
    if group_mode:
        n=size//4;groups=[[i] for i in entries[:n]]
        for j in range(1,4):
            pot=entries[j*n:(j+1)*n]; best=None; best_cost=999
            for _ in range(200):
                r.shuffle(pot); cost=sum(sum(player(s,x)['country']==player(s,y)['country'] for x in g) for g,y in zip(groups,pot))
                if cost<best_cost:best=pot.copy();best_cost=cost
                if cost==0:break
            for g,i in zip(groups,best):g.append(i)
        for j,pairs in enumerate([((0,3),(1,2)),((0,2),(3,1)),((0,1),(2,3))],1):
            for g in groups:
                for a,b in pairs:add('G'+str(j),g[a],g[b])
    else:
        top=entries[:8];rest=entries[8:];r.shuffle(rest)
        # one top-eight seed per four-player section; seeds 1/2 opposite halves
        top=[top[i] for i in seed_order(8)]
        for j,a in enumerate(top):
            b,c,d=rest[3*j:3*j+3];add('R32',a,b);add('R32',c,d)
    state={'entries':entries,'requested':club_entries,'rejected':sorted(chosen-set(entries)),'decisions':decisions,'groups':groups,'queue':queue,'cursor':0,'days':days,'placements':{},'results':[],'active':None,'settled':False}
    if group_mode:state['route_policy']=ROUTE_POLICY
    s['rules']['group_knockout']=ROUTE_POLICY;s['version']=MANAGER_VERSION
    v['events'][eid]=state;e['entries']=entries.copy();return state

def advance_day(s,day):
    if s.get('version')!=MANAGER_VERSION:raise ValueError('V5.3 save required')
    if day!=dateadd(s['date'],1):raise ValueError('nonconsecutive date')
    s['date']=day; v=s['v42']
    for p in s['players']:
        f=p['fitness']; f['fatigue']=round(max(0,f['fatigue']-.55),6)
        injury=v['injuries'].get(str(p['id']))
        if injury and day>=injury['until']:
            f['injury_penalty']=0;f['status']='fit';del v['injuries'][str(p['id'])]
    if (D(day)-D(s.get('age_anchor_date','2027-01-01'))).days%7==0:
        growth_week(s,day)
    if D(day).day==1:monthly_finance(s,day)
    if D(day).weekday()==0:refresh(s)
    if day.endswith('-12-31'):close_year(s)

def refresh(s):
    rankings(s)
    if s.get('save_id') in ('NEW_V51','NEW_V52','NEW_V53') and not any(p['points'] for p in s['players']):
        for i,p in enumerate(sorted(s['players'],key=lambda p:(-p['ability'],p['id'])),1):p['rank']=i
    best=s['v42'].setdefault('best_rank',{})
    for p in s['players']:best[str(p['id'])]=min(best.get(str(p['id']),p['rank']),p['rank'])
    s['v42']['rank_history'].append({'date':s['date'],'ranks':{str(p['id']):p['rank'] for p in s['players']},'points':{str(p['id']):p['points'] for p in s['players']}})

def matchup(p,q):
    a,b=p['attributes'],q['attributes']; pairs=[('杀球进攻','防守能力'),('网前技术','接发球'),('拉吊控球','判断与预判'),('移动速度','爆发力')]
    # centered on overall ability to avoid counting ability twice
    return clip(sum((a[x]-p['ability'])-(b[y]-q['ability'])-(b[x]-q['ability'])+(a[y]-p['ability']) for x,y in pairs)/32,-2,2)

def tactic(p,q,name):
    spec=TACTICS[name]
    if spec is None:return 0
    a,b=p['attributes'],q['attributes'];x,y,z,w=spec
    return clip(((a[x]+a[y])/2-p['ability']-(b[z]+b[w])/2+q['ability'])/5,-1.5,1.5)

def group_order(s,g,results):
    stats={i:[0,0,0] for i in g}; head={}
    for m in results:
        a,b=m['a'],m['b']
        if a not in stats or b not in stats:continue
        h=m['history']; wins=sum(x>y for x,y in h); losses=len(h)-wins; diff=sum(x-y for x,y in h)
        stats[a][0]+=int(wins>losses);stats[b][0]+=int(losses>wins);stats[a][1]+=wins-losses;stats[b][1]+=losses-wins;stats[a][2]+=diff;stats[b][2]-=diff;head[frozenset((a,b))]=m['winner']
    out=[]
    for w in sorted({x[0] for x in stats.values()},reverse=True):
        tied=[i for i in g if stats[i][0]==w]
        if len(tied)==2:
            hw=head[frozenset(tied)];tied.sort(key=lambda i:i!=hw)
        else:tied.sort(key=lambda i:(-stats[i][1],-stats[i][2],g.index(i)))
        out+=tied
    return out

def next_round(s,e,st):
    v=s['v42']['events'][e['id']];q=v['queue']; last=q[-1]['stage']; results=[m for m in v['results'] if m['stage']==last]
    if last in ('G1','G2'):return
    if last=='G3':
        orders=[group_order(s,g,v['results']) for g in v['groups']];v['group_order']=orders
        for g in orders:
            for i in g[2:]:v['placements'][str(i)]=5
        pairs=[]
        pairs=[(orders[g][0],orders[h][1]) for g,h in knockout_routes(len(orders))]
        stage={8:'SF',32:'R16',64:'R32'}[len(v['entries'])]
    else:
        ix={'R32':5,'R16':4,'QF':3,'SF':2,'F':1}[last]
        for m in results:v['placements'][str(m['b'] if m['winner']==m['a'] else m['a'])]=ix
        winners=[m['winner'] for m in results]
        if last=='F':v['placements'][str(winners[0])]=0;return
        stage={'R32':'R16','R16':'QF','QF':'SF','SF':'F'}[last];pairs=list(zip(winners[::2],winners[1::2]))
    for a,b in pairs:q.append({'stage':stage,'a':a,'b':b,'date':v['days'][stage],'serial':len(q)+1})

def pay(s,amount,kind,**extra):
    s['club']['cash']+=amount;s['transactions'].append(dict(date=s['date'],type=kind,amount=amount,cash_after=s['club']['cash'],**extra))
def bonus(s,p,fraction,reason):
    c=p['contract'];k=f"{s['date'][:4]}:{p['id']}"; ledger=s['v42']['bonus_paid'];paid=ledger.get(k,0)
    amount=max(0,min(c['bonus']-paid,round(c['bonus']*fraction)))
    if amount:pay(s,-amount,'performance_bonus',player_id=p['id'],reason=reason);ledger[k]=paid+amount

def settle(s,e):
    v=s['v42']['events'][e['id']]
    if v['settled'] or e['status']=='completed':raise ValueError('duplicate settlement')
    if len(v['placements'])!=len(v['entries']):raise ValueError('incomplete placements')
    award(s,e,v['placements']);level=e['level'];v['prizes']={}
    for i,stage in v['placements'].items():
        p=player(s,int(i));gross=round(PRIZE[level]*[1,.5,.25,.125,.06,.03][stage]); club=round(gross*.3) if p['id'] in s['club']['roster'] else 0
        v['prizes'][i]={'gross':gross,'club':club,'player':gross-club}
        if club:pay(s,club,'prize_share',event_id=e['id'],player_id=p['id'])
        if stage==0 and p['id'] in s['club']['roster']:
            bonus(s,p,BONUS[level],e['id']);s['club']['reputation']=min(100,s['club']['reputation']+REP[level])
    v['settled']=True;refresh(s)

def close_year(s):
    year=s['date'][:4];v=s['v42']
    if year in v['year_closed']:return
    refresh(s)
    for i in s['club']['roster']:
        p=player(s,i);bonus(s,p,.30 if p['rank']<=3 else .15 if p['rank']<=10 else 0,'year_end_rank')
    v['year_closed'].append(year)

def play(s,eid,until='match',tactics=None,authorize=False):
    e=event(s,eid);v=s['v42']['events'][eid];q=v['queue'];j=v['cursor']
    if j>=len(q):raise ValueError('no pending match')
    item=q[j];a,b=item['a'],item['b'];p,qplayer=player(s,a),player(s,b)
    if item['date']!=s['date']:raise ValueError('wrong match date')
    imp=important(s,e,a,b,item['stage']); active=v['active']
    if not active and not authorize and any(x['fitness']['injury_penalty']>=5 and s['v42']['injuries'].get(str(x['id']),{}).get('event')!=eid for x in (p,qplayer)):
        return {'pause':'injury_review','event':eid,'match':item}
    if imp and not authorize:return {'pause':'important','event':eid,'match':item}
    if until not in ('point','interval','game','match'):raise ValueError('invalid granularity')
    m=restore_match(active) if active else start_match_v50(s,eid,a,b,item['stage'],item['serial'])
    if tactics:
        if not imp or (active and m.log[-1]['event'] not in ('interval','game')):raise ValueError('tactics only at authorized breaks')
        for i,name in tactics.items():
            i=int(i)
            if i not in (a,b) or i not in s['club']['roster']:raise ValueError('not managed player')
            k=int(i==b)
            if isinstance(m,RallyMatch):m.set_tactic(k,name)
            else:m.tactic[k]=tactic(p if k==0 else qplayer,qplayer if k==0 else p,name)
    m.run(until);v['active']=m.snapshot()
    if max(m.games)<2:return {'pause':'in_match','event':eid,'score':m.score,'games':m.games,'history':m.history}
    winner=[a,b][m.games.index(2)];record={**item,'event_id':eid,'seed':m.seed,'winner':winner,'history':m.history,'log':m.log,'final_snapshot':m.snapshot(),'engine_version':VERSION if isinstance(m,RallyMatch) else '4.1'}
    s['matches'].append(record);v['results'].append({k:record[k] for k in ('a','b','winner','history','stage','serial')});v['cursor']+=1;v['active']=None
    for k,x in enumerate((p,qplayer)):
        x['season_stats']['wins' if x['id']==winner else 'losses']+=1;f=x['fitness'];f['fatigue']=round(min(5,m.fatigue[k]),6)
        rr=rng(s,'injury',eid,item['serial'],x['id']);prob=clip(.003+.004*f['fatigue']+.001*max(0,x['age']-29)+.0003*max(0,85-x['attributes']['身体素质']),0,.05)
        if f['injury_penalty']==0 and rr.random()<prob:
            u=rr.random(); lo,hi,pen=(1,3,1) if u<.70 else (4,14,3) if u<.95 else (15,56,5) if u<.995 else (57,180,10)
            # serious injuries take effect after current tournament; current tournament may still be played with penalty
            f['injury_penalty']=pen;f['status']='injured';s['v42']['injuries'][str(x['id'])]={'until':dateadd(s['date'],rr.randint(lo,hi)),'penalty':pen,'event':eid}
            s['v42'].setdefault('injury_history',[]).append({'player_id':x['id'],'date':s['date'],**s['v42']['injuries'][str(x['id'])]})
    if v['cursor']==len(v['queue']):
        next_round(s,e,item['stage'])
        if item['stage']=='F':settle(s,e)
    return {'finished':True,'winner':winner,'history':m.history}

def run(s,target,checkpoint=None):
    """Advance through target inclusive; stop before unapproved events or important matches."""
    if target<s['date'] or target>str(s.get('season_year',2027))+'-12-31':raise ValueError('outside supported season')
    while True:
        for e in s['calendar']:
            if e['level']=='TEAM' and s['v42'].get('policy',{}).get('skip_team'):continue
            if e['status']=='scheduled' and e['start'] and e['start']<=s['date'] and e['id'] not in s['v42']['events']:
                return {'pause':'entries_or_unsupported','event':e['id'],'date':s['date']}
        for eid,v in sorted(s['v42']['events'].items()):
            while v['cursor']<len(v['queue']) and v['queue'][v['cursor']]['date']==s['date']:
                result=play(s,eid)
                if checkpoint:persist(s,checkpoint)
                if 'pause' in result:return result
        if s['date']==target:return {'date':target,'finished':True}
        advance_day(s,dateadd(s['date'],1))
        if checkpoint:
            persist(s,checkpoint)
            if D(s['date']).day==1 or s['date'].endswith('-12-31'):
                p=Path(checkpoint);persist(s,p.parent/'checkpoints'/f"{s['date']}.json")

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='SMASH V5.3 season manager; no implicit advancement')
    parser.add_argument('--state',required=True,help='explicit working state; never use archive directly')
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('status');sub.add_parser('expiring'); a=sub.add_parser('growth-report');a.add_argument('player',type=int);a.add_argument('--days',type=int,default=90)
    a=sub.add_parser('schedule-wc');a.add_argument('start');a.add_argument('end')
    a=sub.add_parser('prepare');a.add_argument('event');a.add_argument('players',nargs='*',type=int)
    a=sub.add_parser('migrate-bracket');a.add_argument('event')
    a=sub.add_parser('run');a.add_argument('date')
    a=sub.add_parser('play');a.add_argument('event');a.add_argument('--until',choices=['point','interval','game','match'],default='match');a.add_argument('--tactics',default='{}');a.add_argument('--authorize',action='store_true')
    args=parser.parse_args();path=Path(args.state);
    if not path.is_file():parser.error('state file missing; no fallback')
    if args.command not in ('status','expiring','growth-report') and path.name in ('career.json','save.json'):parser.error('archived state protected; use explicitly copied working state')
    s=load(path)
    if args.command=='status':
        result={'date':s['date'],'cash':s['club']['cash'],'reputation':s['club']['reputation'],'matches':len(s['matches']),'prepared':list(s['v42']['events']),'roster':[{'id':i,'name':player(s,i)['name'],'rank':player(s,i)['rank']} for i in s['club']['roster']]}
    elif args.command=='expiring':result=expiring(s)
    elif args.command=='growth-report':result=report(s,args.player,args.days)
    elif args.command=='schedule-wc':
        schedule_wc(s,args.start,args.end);persist(s,path);result=event(s,str(s.get('season_year',2027))+'-WC')
    elif args.command=='prepare':
        v=prepare(s,args.event,args.players);result={k:v[k] for k in ('entries','requested','rejected','groups','days')};persist(s,path)
    elif args.command=='migrate-bracket':result=migrate_pending_group_bracket(s,args.event);persist(s,path)
    elif args.command=='run':result=run(s,args.date,path);persist(s,path)
    else:result=play(s,args.event,args.until,json.loads(args.tactics),args.authorize);persist(s,path)
    print(json.dumps(result,ensure_ascii=False,indent=2))
