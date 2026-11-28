"""Explicit fresh career generator. No old career data is read. Python stdlib."""
import argparse, datetime as dt, json, random, secrets
from pathlib import Path
from season import seed, D
from engine import clip
from legacy_rally import ATTR
from legacy_career import rankings, persist
from growth import initialize

def development_parameters(r, age, ability, entry=None):
    """Potential tiers have no fixed headroom ceiling. Condition on ability only
    to exclude impossible potentials below the opening level.
    """
    entry=entry or {}
    shift=.30*max(0,70-ability)
    bands=((75-shift,82-shift),(83-shift,87-shift),(88,92),(93,96),(97,99))
    eligible=[((max(ability,lo),hi),weight) for (lo,hi),weight in zip(bands,(40,35,20,4,1)) if hi>=ability]
    tier=r.choices([x[0] for x in eligible],weights=[x[1] for x in eligible],k=1)[0]
    raw=r.uniform(*tier)
    # Older players may already be past their peak; retain historical potential
    # without making it a source of late-life rebound (age-dependent growth gate).
    potential=round(min(99,max(ability,raw)),4)
    g_range=r.choices(((.6,.85),(.85,1.15),(1.15,1.4),(1.4,1.75)),weights=(15,60,22,3),k=1)[0]
    growth=round(r.uniform(*g_range),3)
    decline=round(r.uniform(.5,1.6),3)
    peak=r.choices(list(range(22,33)),weights=(1,2,4,8,14,22,20,14,8,5,2),k=1)[0]
    values={'potential_hidden':potential,'growth_factor':growth,'decline_factor':decline,'peak_age':peak}
    for k in values:
        if k in entry:values[k]=float(entry[k])
    if not ability<=values['potential_hidden']<=99 or not .6<=values['growth_factor']<=1.75 or not .5<=values['decline_factor']<=1.6 or not 22<=values['peak_age']<=32 or values['peak_age']%1:
        raise ValueError('invalid development overrides')
    values['peak_age']=int(values['peak_age'])
    return values

def create(world_seed, year=2027, club_name='新俱乐部', city='未指定', cash=30_000_000, count=100, roster_input=None):
    day=f'{year:04d}-01-01'; r=random.Random(seed(world_seed,'new_world_v52')); players=[]
    # All opening values are newly generated game settings, not real athlete data.
    countries=('CHN','JPN','KOR','THA','INA','MAS','TPE','IND','DEN','ESP','USA','CAN','FRA','GER','SUI','SCO','ENG','VIE','SGP','HKG')
    for i in range(1,count+1):
        age=r.randint(18,35); ability=round(clip(r.gauss(78,7)-max(0,age-30)*.8,55,97),4)
        if roster_input is not None:
            entry=roster_input[i-1]; age=int(entry['age']);ability=float(entry['ability']); name=str(entry['name']);country=str(entry['country'])
            if not 16<=age<=45 or not 35<=ability<=99:raise ValueError('invalid age or ability')
        else:name=f'虚构球员 {i:03d}';country=countries[(i-1)%len(countries)]
        dev=development_parameters(r,age,ability,entry if roster_input is not None else None); potential=dev['potential_hidden']
        attrs={k:round(clip(ability+r.gauss(0,3.8),35,99),4) for k in ATTR}
        if roster_input is not None and 'attributes' in entry:
            attrs={k:float(v) for k,v in entry['attributes'].items()}
            if set(attrs)!=set(ATTR) or any(not 35<=v<=99 for v in attrs.values()):raise ValueError('invalid attributes')
        salary=round((250000+max(0,ability-60)**2*3200)/50000)*50000
        players.append({'id':i,'name':name,'country':country,'rank':0,'points':0,'ability':ability,'age':age,'contract':None,'real':False if roster_input is None else bool(entry.get('real',False)),'attributes':attrs,'attributes_status':'new game simulated' ,'potential_estimate':[max(35,round(potential)-3),min(99,round(potential)+3)],'market':{'signing_fee':max(50000,salary*2),'annual_salary':max(50000,salary),'interest':r.randint(15,85)},'attribute_anchor_mean':sum(attrs.values())/len(attrs),'ability_anchor':ability,'development':{**dev,'last_update':day,'age_anchor':age},'fitness':{'fatigue':0,'injury_penalty':0,'status':'fit'},'season_stats':{'wins':0,'losses':0,'titles':0},'race_points':0,'ranking_ledger':[]})
    # Initial seeding only: ability order, zero ranking points, no fabricated historical results.
    for j,p in enumerate(sorted(players,key=lambda p:(-p['ability'],p['id'])),1):p['rank']=j
    # A fictional game calendar generated from generic weeks, no imported historical schedule.
    calendar=[]
    for j in range(35):
        start=D(day)+dt.timedelta(days=7+j*9); level=('1000','750','500','300','100','500','300')[j%7]; end=start+dt.timedelta(days=7 if level=='1000' else 5)
        calendar.append({'id':f'{year}-{j+1:02d}','name':f'巡回赛第{j+1:02d}站 S{level}','start':str(start),'end':str(end),'level':level,'status':'scheduled','entries':None,'format':'groups_then_knockout' if level=='1000' else 'knockout','source':'fictional generated calendar'})
    calendar.extend([{'id':f'{year}-FINALS','name':'年度总决赛','start':f'{year}-12-01','end':f'{year}-12-05','level':'FINALS','status':'scheduled','entries':None,'format':'groups_then_knockout','source':'fictional generated calendar'},{'id':f'{year}-WC','name':'世界锦标赛','start':None,'end':None,'level':'WC','status':'date_pending','entries':None,'format':'groups_then_knockout','source':'manager date approval'}])
    s={'version':'5.2','date':day,'age_anchor_date':day,'season_year':year,'world_seed':world_seed,'save_id':'NEW_V52','ranking_date':day,'ranking_source':'initial simulated ability order; no prior results','club':{'name':club_name,'city':city,'commercial_name':club_name,'cash':cash,'reputation':20,'roster':[],'target_roster':3,'annual_salary_commitment':0,'annual_bonus_cap':0,'sponsorships':[],'annual_sponsor_income':0,'annual_in_kind':0,'operating_budget':{'staff_facilities':1800000,'travel':1200000,'medical_admin':600000,'annual_salary':0,'annual_bonus_max':0,'status':'active'},'finance_through':day},'players':players,'calendar':calendar,'matches':[],'transactions':[],'pending':[],'negotiation_history':[],'growth_history_v52':[],'scouting_shortlist':[],'commercial_market':[],'manager_tasks':[],'rules':{'scoring':'3x21 cap 30 interval 11','training':'automatic V5.2','ranking':'rolling 364 days best 10; no opening historical ledger','engine':'5.0.1'},'v42':{'events':{},'injuries':{},'bonus_paid':{},'rank_history':[],'year_closed':[],'injury_history':[],'best_rank':{},'revision':0,'save_id':'NEW_V52','policy':{'skip_team':True}}}

    # New careers only. Preserve all V5.2 draws outside the added independent stream.
    for p in players:
        entry=roster_input[p['id']-1] if roster_input is not None else {}
        a=p['ability']; age=p['age']; g=p['development']
        if a>=80 and age<24 and 'potential_hidden' not in entry:
            rr=random.Random(seed(world_seed,'growth_v53_new_potential',p['id']))
            weights=(20,25,35,20) if age<=19 else (30,35,25,10) if age<=21 else (55,30,15,0)
            h=rr.choices((0,2,4,6),weights=weights,k=1)[0]; floor=a+min(h,.6*(99-a))
            eligible=[((max(floor,lo),hi),w) for (lo,hi),w in zip(((75,82),(83,87),(88,92),(93,96),(97,99)),(40,35,20,4,1)) if hi>=floor]
            tier=rr.choices([x[0] for x in eligible],weights=[x[1] for x in eligible],k=1)[0]
            g['potential_hidden']=round(rr.uniform(*tier),4)
        scout=random.Random(seed(world_seed,'growth_v53_scout',p['id'],day)); center=round(g['potential_hidden']+scout.uniform(-2,2));p['potential_estimate']=[int(clip(center-3,35,99)),int(clip(center+3,35,99))];p['potential_estimate_date']=day
    initialize(s);s['save_id']='NEW_V53';s['v42']['save_id']='NEW_V53';s['rules']['group_knockout']='fixed_seed_protection_r2'
    return s

def sign(s,pid,offer):
    """Explicit manager-approved accepted offer; no automatic signature or negotiation override."""
    p=next(x for x in s['players'] if x['id']==pid); c=s['club']; required={'fee','salary','years','bonus','national_priority'}
    if set(offer)!=required or any(type(offer[k]) is not int or offer[k]<0 for k in ('fee','salary','bonus','years')) or offer['years']<1 or type(offer['national_priority']) is not bool:raise ValueError('invalid offer')
    if p['contract'] is not None or len(c['roster'])>=c['target_roster'] or c['cash']<offer['fee']:raise ValueError('unavailable player, roster full or insufficient cash')
    # Only accept a previously generated accepted offer from unchanged original negotiation engine.
    accepted=next((x for x in reversed(s['negotiation_history']) if x['player_id']==pid and x['offer']==offer and x['result']=='accepted_offer' and not x.get('executed')),None)
    if accepted is None:raise ValueError('no accepted negotiation in current career')
    d=D(s['date']); end=d.replace(year=d.year+offer['years'],day=min(d.day,28) if d.month==2 else d.day)
    p['contract']={**offer,'start':s['date'],'end':str(end)};c['roster'].append(pid);c['cash']-=offer['fee'];c['annual_salary_commitment']+=offer['salary'];c['annual_bonus_cap']+=offer['bonus'];c['operating_budget']['annual_salary']+=offer['salary'];c['operating_budget']['annual_bonus_max']+=offer['bonus'];s['transactions'].append({'date':s['date'],'type':'signing_fee','player_id':pid,'amount':-offer['fee'],'cash_after':c['cash']});accepted['executed']=True

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--seed',type=int);ap.add_argument('--year',type=int,default=2027);ap.add_argument('--club',default='新俱乐部');ap.add_argument('--city',default='未指定');ap.add_argument('--cash',type=int,default=30_000_000);ap.add_argument('--players',type=int,default=100);ap.add_argument('--roster-json');a=ap.parse_args();path=Path(a.output)
    if path.exists():ap.error('refusing to overwrite existing career')
    roster=json.loads(Path(a.roster_json).read_text()) if a.roster_json else None; n=len(roster) if roster is not None else a.players
    if not 64<=n<=1000 or not 1900<=a.year<=2090 or a.cash<0:ap.error('requires 64–1000 players, valid year and nonnegative cash')
    world_seed=a.seed if a.seed is not None else secrets.randbits(128)
    s=create(world_seed,a.year,a.club,a.city,a.cash,n,roster);persist(s,path);print(json.dumps({'created':str(path),'date':s['date'],'players':n,'seed':world_seed,'matches':0,'signed_players':0},ensure_ascii=False))
if __name__=='__main__':main()
