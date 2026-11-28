"""Qualification extension: one entry, frozen eligibility, two rounds maximum.
All dates stay inside the original event. Only real matches count for fitness/stats.
"""
import math
import draw as draw83
import career_events as old
import registration as reg
import ranking as rank
from season import POINTS
from career_helpers import dateadd, rng, seed_order, player

RULES={'100':(40,8,32),'300':(28,4,16),'500':(28,4,16)}
def rules(e):return (24,8,32) if e['level']=='100' and e.get('ruleset')!='bwf84' else RULES[e['level']]
def main_capacity(e):return 48 if e['level']=='100' and e.get('ruleset')=='bwf84' else 32
_original_allocate=reg.allocate
_original_draw=old.draw
_original_next=old.next_round
_original_settle=old.settle

def allocate(s,e,r,pool):
    if e['level'] not in RULES or r.get('legacy_no_qual'):return _original_allocate(s,e,r,pool)
    d,k,q=rules(e);out=[]
    for pid in pool:
        if pid not in out and reg.available(s,e,player(s,pid),r):out.append(pid)
        if len(out)>=d+q:break
    return out

def split(e,entries):
    if e['level'] not in RULES or len(entries)<=main_capacity(e):return list(entries),[]
    d,k,q=rules(e);return list(entries[:d]),list(entries[d:d+q])

def notify(s,e,pid,status,reason):
    if pid not in s['club']['roster']:return
    key=e['id']+':'+str(pid)+':'+status
    inbox=s.setdefault('registration_inbox',[])
    if not any(x['id']==key for x in inbox):
        inbox.append(dict(id=key,event=e['id'],event_name=e['name'],date=s['date'],player_id=pid,admitted=status in ('qualified','qualifying'),entry_status=status,reason=reason))

def draw(s,e):
    if e['level'] not in RULES:return _original_draw(s,e)
    r=reg.review(s,e);direct,qual=split(e,r['entries'])
    if not qual:return _original_draw(s,e)
    if s['date']!=reg.dates(s,e)['draw']:raise ValueError('draw date required')
    k=rules(e)[1];eid=e['id'];rr=rng(s,'qual78',eid)
    # Separate the top k qualifying seeds, then distribute remaining players evenly.
    order=sorted(qual,key=lambda i:old.seeding(e,r,i));groups=[[i] for i in order[:k]]
    for j in range(k,len(order),k):
        pot=order[j:j+k];rr.shuffle(pot);idx=list(range(k));rr.shuffle(idx)
        idx.sort(key=lambda i:len(groups[i]))
        for i,p in zip(idx,pot):groups[i].append(p)
    v=dict(entries=direct+qual,requested=[int(i) for i,b in r['intents'].items() if b],rejected=[int(i) for i,b in r['intents'].items() if b and int(i) not in r['entries']],decisions=r['decisions'],groups=[],queue=[],cursor=0,days={'Q1':e['start'],'Q2':e['start']},placements={},results=[],active=None,settled=False,walkovers=0,qualification={'direct':direct,'entrants':qual,'groups':groups,'winners':[],'eliminated':{},'main_entries':[],'finished':False,'q1_serials':[]})
    v['draw_policy']='protected83'
    direct_order=sorted(direct,key=lambda i:old.seeding(e,r,i))
    size=64 if main_capacity(e)==48 else 32
    v['main_slots'],v['seeds']=draw83.main_slots(direct_order,size,rng(s,'main83',eid),count=8,placeholders=['Q'+str(i+1) for i in range(len(groups))])
    v['qual_seeds']={str(pid):i+1 for i,pid in enumerate(order[:k])}
    v['days'].update({st:dateadd(e['start'],j+1) for j,st in enumerate(('R32','R16','QF','SF','F'))})
    if size==64:v['days']['R64']=e['start']
    if v['days']['F']>e['end']:raise ValueError('qualification needs six event days')
    s['v42']['events'][eid]=v;e['entries']=v['entries'].copy();r['phase']='drawn';r['history'].append({'date':s['date'],'action':'draw','entries':v['entries'].copy()})
    for g in groups:
        pairs=[]
        if len(g)==4:pairs=[(g[0],g[3]),(g[1],g[2])]
        elif len(g)==3:pairs=[(g[1],g[2])]
        serials=[]
        for a,b in pairs:old.add(v,'Q1',a,b);serials.append(v['queue'][-1]['serial'])
        v['qualification']['q1_serials'].append(serials)
    if not v['queue']:q2(s,e,v)
    return v

def q2(s,e,v):
    q=v['qualification'];res={m['serial']:m for m in v['results'] if m['stage']=='Q1'}
    for g,serials in zip(q['groups'],q['q1_serials']):
        if len(g)==1:
            # This is an automatic main draw place, not a fictitious match.
            if not old.unavailable(s,e,g[0]):q['winners'].append(g[0])
            else:q['eliminated'][str(g[0])]='Q2'
            continue
        a,b=(g if len(g)==2 else [g[0],res[serials[0]]['winner']] if len(g)==3 else [res[x]['winner'] for x in serials])
        old.add(v,'Q2',a,b)
    if v['cursor']==len(v['queue']):main_draw(s,e,v)

def main_draw(s,e,v):
    q=v['qualification'];winners=q['winners'];q['finished']=True
    direct=q['direct'];entries=direct+winners;q['main_entries']=entries.copy();e['entries']=entries.copy()
    for pid in q['entrants']:
        if pid in winners:notify(s,e,pid,'qualified','资格赛晋级正赛，无需再次报名。')
        else:
            q['eliminated'].setdefault(str(pid),'Q2')
            notify(s,e,pid,'qualifying_eliminated','资格赛结束，未能晋级正赛。')
    # Fill pre-drawn qualification channels without moving any direct entrants.
    if v.get('draw_policy')=='protected83':
        group_winners={}
        for j,g in enumerate(q['groups']):
            found=[p for p in g if p in winners]
            assert len(found)<=1
            group_winners['Q'+str(j+1)]=found[0] if found else None
        slots=[group_winners[x] if isinstance(x,str) else x for x in v['main_slots']]
        assert sorted(x for x in slots if x is not None)==sorted(entries)
    else:
        # Old in-progress qualification saves retain the original draw policy.
        rr=rng(s,'main78',e['id']);r=s['registrations'][e['id']];ordered=sorted(direct,key=lambda i:old.seeding(e,r,i));slots=[None]*32
        for j,i in enumerate(seed_order(32)):
            if i<min(8,len(ordered)):slots[j]=ordered[i]
        rest=ordered[8:]+winners.copy();rr.shuffle(rest)
        free=[j for j,i in enumerate(slots) if i is None];protected=[j^1 for j,i in enumerate(slots) if i is not None and slots[j^1] is None]
        blank=[j+rr.randrange(2) for j in range(0,32,2) if slots[j] is None and slots[j+1] is None];rr.shuffle(blank)
        bye=set((protected+blank)[:32-len(entries)]);free=[j for j in free if j not in bye];rr.shuffle(free)
        assert len(free)==len(rest)
        for j,i in zip(free,rest):slots[j]=i
    start=len(v['queue'])
    for j,(a,b) in enumerate(zip(slots[::2],slots[1::2])):
        old.add(v,'R64' if len(slots)==64 else 'R32',a,b)
        if len(slots)==64 and e.get('ruleset')=='bwf84':
            item=v['queue'][-1];item['slot']=j
            if a in winners or b in winners:item['date']=dateadd(e['start'],1)
    if len(slots)==64 and e.get('ruleset')=='bwf84':v['queue'][start:]=sorted(v['queue'][start:],key=lambda m:(m['date'],m['slot']))

def next_round(s,e,v,st):
    if st not in ('Q1','Q2'):return _original_next(s,e,v,st)
    q=v['qualification']
    for m in v['results']:
        if m['stage']!=st:continue
        for i in (m['a'],m['b']):
            if i is not None and i!=m['winner']:
                q['eliminated'][str(i)]=st
                notify(s,e,i,'qualifying_eliminated','资格赛淘汰，未能晋级正赛。')
        if st=='Q2' and m['winner'] is not None:q['winners'].append(m['winner'])
    if st=='Q1':q2(s,e,v)
    else:main_draw(s,e,v)

def settle(s,e,v):
    q=v.get('qualification')
    if not q:return _original_settle(s,e,v)
    # Main draw placements and prizes remain exactly as before; separate lower credits for qualifying losers.
    original=v['entries'];v['entries']=q['main_entries']
    try:_original_settle(s,e,v)
    finally:v['entries']=original
    played={i for m in v['results'] if m['stage'] in ('Q1','Q2') and m.get('outcome') in ('played','retirement') for i in (m['a'],m['b'])}
    for pid,st in q['eliminated'].items():
        i=int(pid)
        if i not in played:continue
        p=player(s,i);pts=rank.points_for(e,7 if st=='Q1' and e['level']=='100' else 6) if e.get('ruleset')=='bwf84' else round(POINTS[e['level']][-1]*(.4 if st=='Q1' else .7))
        p['ranking_ledger'].append(dict(event_id=e['id'],date=s['date'],level=e['level'],points=pts,synthetic=False,qualifying_round=st,race_season=rank.race_year(s,e)))
    rank.rankings(s)

def playable(s,eid,item):
    r=s['registrations'][eid]
    return all(i is not None and str(i) not in r['withdrawn'] and player(s,i)['fitness']['injury_penalty']<5 for i in (item['a'],item['b']))

def recover_same_day(s,eid,item):
    # Two-hour modelled break between qualifying matches on the same date, no extra daily/form tick.
    if item['stage'] not in ('Q2','R64','R32') or not playable(s,eid,item):return
    v=s['v42']['events'][eid];previous={i for m in v['results'] if m['date']==s['date'] and m['stage'] in ('Q1','Q2','R64') and m.get('outcome') in ('played','retirement') for i in (m['a'],m['b'])}
    for i in (item['a'],item['b']):
        if i not in previous:continue
        p=player(s,i);f=p['fitness'];a=p['attributes'];rec=max(.5,min(1.4,1+.014*(a['身体素质']-85)+.010*(a['体能耐力']-85)))
        f['residual']=round(f['residual']*math.exp(-.16*rec),6);f['fatigue']=round(f['residual']+.35*f['chronic'],6)

def install():
    reg.allocate=allocate;old.draw=draw;old.next_round=next_round;old.settle=settle
