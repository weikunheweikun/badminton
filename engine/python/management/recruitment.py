"""Opt-in recruitment patch for the Xiamen career; no changes to match RNG."""
import hashlib, random

POLICY='xiamen_recruitment_v1'

def tier(ca):
    if ca>=95: return 8,18
    if ca>=90: return 13,27
    if ca>=80: return 25,43
    if ca>=70: return 38,60
    return 48,70

def geography(country):
    if country=='CHN': return 12
    if country in ('TPE','HKG'): return 8
    if country in ('JPN','KOR','VIE','THA','MAS','SGP'): return 4
    if country in ('INA','IND','SRI'): return 0
    if country in ('UAE','AZE','TUR'): return -5
    if country in ('CAN','USA','PER','BRA'): return -10
    return -7

def age_modifier(age):
    return 5 if age<=21 else 2 if age<=23 else 3 if age>=30 else 0

def components(p,club):
    lo,hi=tier(p['ability']); q=p['market']['recruitment_preference']
    base=lo+(hi-lo)*q
    rep=(club['reputation']-20)*(.6 if p['ability']>=90 else .45 if p['ability']>=80 else .3)
    return dict(base=base, geography=geography(p['country']), age=age_modifier(p['age']), reputation=rep)

def refresh(s):
    if s.get('rules',{}).get('recruitment')!=POLICY: return s
    for p in s['players']:
        c=components(p,s['club']); p['market']['interest']=max(5,min(95,round(sum(c.values()))))
    return s

def migrate(s):
    if s.get('rules',{}).get('recruitment')==POLICY: return refresh(s)
    if s['club']['city']!='厦门' or s['negotiation_history'] or s['club']['roster']: raise ValueError('requires unsigned Xiamen career before negotiations')
    s['rules']['recruitment']=POLICY
    for p in s['players']:
        key=f'{s["world_seed"]}:{POLICY}:{p["id"]}'
        p['market']['recruitment_preference']=random.Random(int(hashlib.sha256(key.encode()).hexdigest(),16)).random()
    return refresh(s)
