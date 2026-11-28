import json,random,math,hashlib
from pathlib import Path
ROOT=Path(__file__).parent

def evaluate(player, offer, seed, round_no=1):
    m=player['market']; preferred=player.get('preferred_contract_years',3)
    score=math.log(m['interest']/(100-m['interest']))+0.9*math.log(offer['fee']/m['signing_fee'])+1.5*math.log(offer['salary']/m['annual_salary'])+0.25*min(offer['bonus']/m['annual_salary'],1)+0.25*offer['national_priority']-0.18*abs(offer['years']-preferred)
    p=1/(1+math.exp(-score)); q=(1-p)*0.7
    key=f'{seed}:negotiation:{player["id"]}:{round_no}'
    u=random.Random(int(hashlib.sha256(key.encode()).hexdigest(),16)).random()
    result='accepted_offer' if u<p else 'counteroffer' if u<p+q else 'rejected'
    return dict(player_id=player['id'],offer=offer,round=round_no,accept_probability=p,counter_probability=q,draw=u,result=result,seed_key=key)

