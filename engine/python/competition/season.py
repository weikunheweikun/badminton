"""Game helpers; no automatic advancement on import. Standard library only."""
import datetime as dt, random, hashlib, math, json
from engine import Match
D=dt.date.fromisoformat
POINTS={'1000':[12000,10200,8400,6600,4800,3000], '750':[11000,9350,7700,6050,4320,2660], '500':[9200,7800,6420,5040,3600,2220], '300':[5000,4250,3500,2700,1900,1150], '100':[3000,2550,2100,1650,1100,650], 'WC':[14500,12500,10500,8000,6000,4000], 'FINALS':[14000,12000,10000,8000,6000,4000]}
def seed(*parts):return int(hashlib.sha256(':'.join(map(str,parts)).encode()).hexdigest(),16)
def rankings(s,date=None):
    day=D(date or s['date'])
    for p in s['players']:
        p['points']=sum(sorted((e['points'] for e in p['ranking_ledger'] if 0<=(day-D(e['date'])).days<364),reverse=True)[:10])
    for i,p in enumerate(sorted(s['players'],key=lambda p:(-p['points'],-p['ability'],p['id'])),1):p['rank']=i
    s['ranking_date']=day.isoformat()
def award(s,event,placements):
    assert event['status']=='scheduled' and event['level'] in POINTS
    assert len(set(placements))==len(placements)
    # placement indexes: champion, runner-up, SF, QF, R16, R32/group exit
    for pid,stage in placements.items():
        p=next(p for p in s['players'] if p['id']==int(pid)); pts=POINTS[event['level']][stage]
        p['ranking_ledger'].append(dict(event_id=event['id'],date=event['end'],points=pts,synthetic=False));p['race_points']+=pts if event['level'].isdigit() else 0
        if stage==0:p['season_stats']['titles']+=1
    event['status']='completed';rankings(s,event['end'])
def start_match(s,event_id,a,b,stage,serial):
    p,q=[next(x for x in s['players'] if x['id']==i) for i in (a,b)]
    # no automatic tactical advantage; matchups can be assigned symmetrically before first point
    m=Match(p['ability'],q['ability'],seed(s['world_seed'],event_id,stage,serial,a,b),endurance=[x['attributes']['体能耐力'] for x in (p,q)],pressure=[max(-1,min(1,(x['attributes']['抗压能力']-85)/10)) for x in (p,q)],fatigue=[x['fitness']['fatigue'] for x in (p,q)],injury=[x['fitness']['injury_penalty'] for x in (p,q)])
    return m
def important(s,event,a,b,stage):
    return bool({a,b}&set(s['club']['roster'])) and (event['level'] in ('WC','FINALS','OLY') or (event['level'] in ('500','750','1000') and stage in ('SF','F')))
def growth_week(s,week_date):
    for p in s['players']:
        g=p['development'];last=D(g['last_update']);day=D(week_date)
        if (day-last).days!=7:raise ValueError('advance growth in exact seven-day steps')
    for p in s['players']:
        g=p['development'];age=g['age_anchor']+(D(week_date)-D('2027-01-01')).days/365.25; p['age']=int(age);r=random.Random(seed(s['world_seed'],'growth',p['id'],week_date));a=p['ability'];cap=g['potential_hidden'];peak=g['peak_age'];rate=(3 if age<21 else 2 if age<24 else 1.3 if age<27 else .7) if age<=peak+1 else (0 if age<30 else -min(4,.65*(age-29)))
        if rate>=0:rate=min(rate*g['growth_factor'],max(0,cap-a)*.45)
        else:rate*=g['decline_factor']
        change=rate/52+r.gauss(0,.015);new=round(max(35,min(cap,a+change)),4);p['ability']=new
        for k in p['attributes']:p['attributes'][k]=round(max(35,min(99,p['attributes'][k]+new-a)),4)
        g['last_update']=week_date
        p['fitness']['fatigue']=max(0,p['fitness']['fatigue']-1)
def monthly_finance(s,month_start):
    """Call on first day of month after opening. Pay previous month base costs, quarterly advance when due. Travel included in budget, do not double count."""
    c=s['club']; day=D(month_start); prev=D(c['finance_through']);expected=dt.date(prev.year+(prev.month==12),prev.month%12+1,1)
    if day!=expected:raise ValueError('finance months must be sequential')
    expense=round(sum(c['operating_budget'][k] for k in ('staff_facilities','travel','medical_admin','annual_salary'))/12);c['cash']-=expense;s['transactions'].append(dict(date=month_start,type='monthly_operations',amount=-expense))
    for o in c['sponsorships']:
        if day.month in (1,4,7,10) and D(o['start'])<=day<D(o['end']) and month_start not in o['paid_quarters']:
            amt=o['annual_cash']//4;c['cash']+=amt;o['paid_quarters'].append(month_start);s['transactions'].append(dict(date=month_start,type='sponsor_payment',amount=amt,brand=o['brand']))
    c['finance_through']=month_start
