"""Fictional club contracts; sporting affiliation is never transferred."""
import datetime as dt, random, calendar, copy, math
from season import D,seed
from business import pay,check_budget,score_offer,refresh_interest,reserve
from negotiate import evaluate
from career_setup_base import sign as legacy_sign

KEYS={'fee','salary','years','bonus','national_priority'}
def dayadd(d,n):return str(D(d)+dt.timedelta(days=n))
def player(s,pid):return next(p for p in s['players'] if p['id']==pid)
def enddate(day,years):
    d=D(day);return str(d.replace(year=d.year+years,day=min(d.day,28) if d.month==2 else d.day))
def init(s):
    s['contract_archive']=[];s['transfer_history']=[];s['contract_offers']={};s['npc_clubs']={f'NPC{i}':{'name':f'模拟竞技俱乐部{i}'} for i in range(1,9)}
    for p in s['players']:
        r=random.Random(seed(s['world_seed'],'npc_contract74',p['id']))
        p['employer']=None;p['npc_contract']=None
        if r.random()<.55:
            owner=f'NPC{r.randint(1,8)}';p['employer']=owner;p['npc_contract']={'start':s['date'],'end':dayadd(s['date'],r.randint(90,900)),'salary':p['market']['annual_salary']}
    s['rules']['contracts']='fictional club employment; no nationality change';return s

def busy(s,pid):
    return any(pid in v['entries'] and not v['settled'] and next(e for e in s['calendar'] if e['id']==eid)['start']<=s['date'] for eid,v in s['v42']['events'].items())
def quote(s,pid):
    p=player(s,pid);c=p['npc_contract'];remaining=max(0,(D(c['end'])-D(s['date'])).days) if c else 0
    return {'employer':p['employer'],'transfer_fee':round(p['market']['signing_fee']*(.35+.65*min(remaining/730,1))) if c else 0,'remaining_days':remaining}
def validate(o):
    if set(o)!=KEYS or any(type(o[k]) is not int or not 0<o[k]<=10**9 for k in ('fee','salary')) or type(o['bonus']) is not int or not 0<=o['bonus']<=10**9 or type(o['years']) is not int or not 1<=o['years']<=5 or type(o['national_priority']) is not bool:raise ValueError('invalid offer')
def offer(s,pid,o,transfer_fee=0):
    p=player(s,pid);validate(o)
    if p['employer']=='USER' or len(s['club']['roster'])>=s['club']['target_roster'] or busy(s,pid):raise ValueError('unavailable/full/active tournament')
    q=quote(s,pid)
    if type(transfer_fee) is not int or not q['transfer_fee']<=transfer_fee<=10**9 or (not q['employer'] and transfer_fee):raise ValueError('owner transfer terms not met')
    check_budget(s,{**o,'fee':o['fee']+transfer_fee});refresh_interest(s)
    hist=[x for x in s['transfer_history'] if x.get('type')=='offer' and x['player_id']==pid];last=hist[-1] if hist else None
    old=s['contract_offers'].get(str(pid))
    if old and not old.get('executed') and s['date']<=old['expires']:raise ValueError('accepted offer still valid')
    if last and s['date']<last['cooldown']:raise ValueError('negotiation cooldown')
    session=[x for x in hist if x['date']>=dayadd(s['date'],-30)]
    utility=score_offer(p,o)
    if session and utility<session[-1]['utility']+.12:raise ValueError('materially improve personal terms')
    if len(session)>=3:raise ValueError('three offers per 30 days')
    r=evaluate(p,o,s['world_seed'],1);r.update(type='offer',date=s['date'],utility=utility,owner=p['employer'],transfer_fee=transfer_fee,cooldown=dayadd(s['date'],30 if r['result']=='rejected' or len(session)==2 else 0),expires=dayadd(s['date'],14),executed=False)
    s['transfer_history'].append(r)
    if r['result']=='accepted_offer':s['contract_offers'][str(pid)]=copy.deepcopy(r)
    return r

def sign(s,pid):
    p=player(s,pid);r=s['contract_offers'].get(str(pid));c=s['club']
    if not r or r['executed'] or s['date']>r['expires'] or r['owner']!=p['employer'] or busy(s,pid) or len(c['roster'])>=c['target_roster'] or p['contract']:raise ValueError('offer no longer executable')
    o=r['offer'];fee=r['transfer_fee'];check_budget(s,{**o,'fee':o['fee']+fee})
    old=p['employer'];s['negotiation_history'].append({'player_id':pid,'offer':copy.deepcopy(o),'result':'accepted_offer','executed':False})
    legacy_sign(s,pid,o)
    if fee:pay(s,-fee,'transfer_fee',player_id=pid,owner=old)
    p['employer']='USER';p['npc_contract']=None;r['executed']=True
    s['transfer_history'].append({'type':'signed','date':s['date'],'player_id':pid,'from':old,'fee':fee,'contract':copy.deepcopy(p['contract'])})
    return p['contract']

def leave(s,pid,mode='release',buyer=None,fee=0):
    p=player(s,pid);c=s['club'];o=p['contract']
    if p['employer']!='USER' or not o or (mode!='expiry' and busy(s,pid)):raise ValueError('player unavailable')
    remaining=max(0,(D(o['end'])-D(s['date'])).days)
    if mode=='release':
        cost=round(o['salary']*remaining/365*.5)
        if c['cash']<cost:raise ValueError('cannot pay termination compensation')
        pay(s,-cost,'termination_compensation',player_id=pid)
    elif mode=='sale':
        if buyer not in s['npc_clubs'] or fee!=sale_quote(s,pid,buyer):raise ValueError('invalid sale quote')
        pay(s,fee,'transfer_income',player_id=pid,buyer=buyer)
    elif mode!='expiry' or remaining:raise ValueError('invalid termination')
    s['contract_archive'].append({'player_id':pid,**copy.deepcopy(o),'end':min(s['date'],o['end'])})
    c['roster'].remove(pid);c['annual_salary_commitment']-=o['salary'];c['annual_bonus_cap']-=o['bonus'];c['operating_budget']['annual_salary']-=o['salary'];c['operating_budget']['annual_bonus_max']-=o['bonus'];p['contract']=None;p['employer']=buyer if mode=='sale' else None;p['npc_contract']={'start':s['date'],'end':enddate(s['date'],2),'salary':o['salary']} if mode=='sale' else None
    s['transfer_history'].append({'type':mode,'date':s['date'],'player_id':pid,'buyer':buyer,'fee':fee});s['contract_offers'].pop(str(pid),None)
    return True

def sale_quote(s,pid,buyer):
    p=player(s,pid)
    if p['employer']!='USER' or buyer not in s['npc_clubs'] or busy(s,pid):raise ValueError('no eligible sale')
    # Deterministic fictional buyer willingness, conditional on player consent proxy.
    remaining=max(0,(D(p['contract']['end'])-D(s['date'])).days)
    u=random.Random(seed(s['world_seed'],'buyer74',pid,buyer,s['date'][:7])).random()
    if u<.35:raise ValueError('buyer/player declined')
    return round(p['market']['signing_fee']*(.35+.40*min(remaining/730,1))*(.8+.4*u))

def renew(s,pid,o):
    p=player(s,pid);validate(o);old=p['contract'];c=s['club']
    if p['employer']!='USER' or busy(s,pid) or not old or (D(old['end'])-D(s['date'])).days>180:raise ValueError('renew only in final 180 days outside active tournament')
    if o['salary']<old['salary'] or enddate(s['date'],o['years'])<=old['end']:raise ValueError('renewal must extend term and maintain salary')
    # New agreement replaces old from today; archive preserves accrued salary.
    if c['arrears'] or c['cash']-o['fee']<reserve(s)+max(0,o['salary']-old['salary'])//4+max(0,o['bonus']-old['bonus']):raise ValueError('insufficient reserve')
    refresh_interest(s)
    if evaluate(p,o,s['world_seed'],1)['result']!='accepted_offer':raise ValueError('player declined renewal')
    s['contract_archive'].append({'player_id':pid,**copy.deepcopy(old),'end':s['date']})
    for key,field in [('annual_salary_commitment','salary'),('annual_bonus_cap','bonus')]:c[key]+=o[field]-old[field]
    c['operating_budget']['annual_salary']+=o['salary']-old['salary'];c['operating_budget']['annual_bonus_max']+=o['bonus']-old['bonus'];p['contract']={**o,'start':s['date'],'end':enddate(s['date'],o['years'])};pay(s,-o['fee'],'renewal_fee',player_id=pid);s['transfer_history'].append({'type':'renewal','date':s['date'],'player_id':pid});return p['contract']

def expire(s):
    for p in s['players']:
        if p['employer']=='USER' and p['contract']['end']<=s['date']:leave(s,p['id'],'expiry')
        elif p['npc_contract'] and p['npc_contract']['end']<=s['date']:p['npc_contract']=None;p['employer']=None

def salaries(s,day):
    d=D(day);start=d.replace(day=1);end=d+dt.timedelta(days=1);days=calendar.monthrange(d.year,d.month)[1]
    contracts=s['contract_archive']+[p['contract'] for p in s['players'] if p['contract']]
    return sum(round(c['salary']/12*max(0,(min(end,D(c['end']))-max(start,D(c['start']))).days)/days) for c in contracts)
