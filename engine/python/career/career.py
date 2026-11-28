"""Multi-year career, free season-opening roster selection, V7.1 match core."""
import copy,json,calendar,datetime as dt
from pathlib import Path
import career_events as old
import lifecycle as life
import registration as reg
import ranking as rank
from season import D
from fitness import daily
from growth import growth_week
from business import settle_month,refresh_interest
from career_helpers import dateadd,persist,player,event
VERSION='7.5-career'
import qualification as qual
import calendar_rules as cal80
qual.install()


def create(seed,year=2027,roster_input=None,selected=()):
    s=old.create(seed,year,count=len(roster_input) if roster_input is not None else 100,roster_input=roster_input);s['version']=VERSION;s['rules']['management']=VERSION;s['rules']['qualification']='S100 40+8 (64-slot draw), S300 game expansion 24+8 (up to 64 qualifiers), S500 28+4; one registration; Q1/Q2 day one, Q3 if needed day two'
    # This mode is sporting management, not a transfer economy. Free selections have no monetary terms.
    for p in s['players']:p['employer']=None;p['npc_contract']=None
    s['rules']['contracts']='free sporting roster selection on January 1 before entries; no transfers or salaries in this mode'
    life.init(s);cal80.install(s);s['calendar_template']=copy.deepcopy(s['calendar']);s['rules']['finance']='legacy incidental accounting retained; no budget gate on roster selection';select(s,selected);s['committed84']=[p['id'] for p in sorted(s['players'],key=lambda p:p['rank'])[:15]];return s

def load(path):
    s=json.loads(Path(path).read_text())
    if s.get('version')!=VERSION:raise ValueError('new V7.5 career required')
    return s

def select(s,ids):
    ids=list(ids);c=s['club']
    if not s['date'].endswith('-01-01') or s['registrations'] or s['date'][:4] in s['v42']['year_closed']:raise ValueError('selection only Jan 1 before entries')
    if len(ids)>c['target_roster'] or len(ids)!=len(set(ids)) or not set(ids)<={p['id'] for p in s['players']}:raise ValueError('choose 0–3 active players, unique IDs')
    for p in s['players']:
        p['employer']='USER' if p['id'] in ids else None;p['contract']={'start':s['date'],'end':f"{s['season_year']+1}-01-01",'fee':0,'salary':0,'bonus':0,'years':1,'national_priority':True,'selection_only':True} if p['id'] in ids else None
    c['roster']=ids;c['annual_salary_commitment']=c['annual_bonus_cap']=0;c['operating_budget']['annual_salary']=c['operating_budget']['annual_bonus_max']=0
    return ids

def play(s,eid,until='match',retire_id=None,fast=False):
    v=s['v42']['events'][eid]
    if v['settled'] or v['cursor']>=len(v['queue']):raise ValueError('no match')
    item=v['queue'][v['cursor']];a,b=item['a'],item['b'];n=len(s['matches'])
    ratings=[player(s,i)['ability'] if i is not None else None for i in (a,b)]
    if not v['active']:qual.recover_same_day(s,eid,item)
    result=old.play(s,eid,until,retire_id,fast=fast)
    if len(s['matches'])>n:s['matches'][-1]['development_CA']=ratings # growth diagnostic only
    return result

def update_bests(s):
    for p in s['players']:
        c=p['career_stats'];c['best_rank']=p['rank'] if c['best_rank'] is None else min(c['best_rank'],p['rank']);c['peak_CA']=max(c['peak_CA'],p['ability'])

def close(s):
    year=s['season_year'];key=str(year)
    if key in s['v42']['year_closed']:return
    if s['date']!=f'{year}-12-31' or any(e['status'] not in ('completed','cancelled') for e in s['calendar']):raise ValueError('finish all events before closing year')
    settle_month(s,s['date']);rank.rankings(s);update_bests(s)
    rows=[]
    for p in s['players']:
        c=p['career_stats'];stats=p['season_stats'];c['seasons']+=1
        for k in ('wins','losses','titles'):c[k]+=stats[k]
        rows.append({k:copy.deepcopy(p[k]) for k in ('id','name','country','age','origin','rank','points','race_points','ability','season_stats','fitness')})
    s['career_history'].append({'year':year,'players':rows,'calendar':copy.deepcopy(s['calendar']),'events':s['v42']['events'],'registrations':s['registrations'],'roster':s['club']['roster'].copy()})
    s['v42']['year_closed'].append(key)

def rollover(s):
    year=s['season_year'];close(s);day=f'{year+1}-01-01';retired=[];previous=s['club']['roster'].copy()
    # Review using end-of-season age and completed season information. Effective January 1.
    from random import Random
    from season import seed
    for p in s['players'].copy():
        prob,reason=life.retirement(p,s);u=Random(seed(s['world_seed'],'retirement75',year,p['id'])).random();p['retirement_review']={'year':year,'probability':prob,'draw':u}
        if u<prob:life.retire(s,p,day,prob,reason);retired.append(p['id'])
    s['season_year']=year+1;s['date']=day;s['v42']['events']={};s['registrations']={}
    template=s['calendar_template'];calendar_new=[]
    for e in template:
        row=copy.deepcopy(e)
        for k in ('id','start','end'):row[k]=str(year+1)+row[k][4:]
        row.update(status='scheduled',entries=None);calendar_new.append(row)
    s['calendar']=calendar_new
    cal80.install(s)
    # Maintain annual youth flow without ejecting active players; soft target, not hard cap.
    n=max(5,min(12,105-len(s['players'])))
    newcomers=life.intake(s,day,n)
    # Remove expired sponsor commitments; past receipts remain in transactions.
    c=s['club'];c['sponsorships']=[o for o in c['sponsorships'] if o['end']>=day];c['annual_sponsor_income']=sum(o['annual_cash'] for o in c['sponsorships']);c['annual_in_kind']=0
    for p in s['players']:
        p['season_stats']={'wins':0,'losses':0,'titles':0};p['race_points']=0
    select(s,[i for i in previous if i not in retired]);tick(s);s['committed84']=[p['id'] for p in sorted(s['players'],key=lambda p:p['rank'])[:15]];return {'year':year+1,'retired':retired,'newcomers':[p['id'] for p in newcomers],'active':len(s['players'])}

def tick(s):
    day=s['date']
    for p in s['players']:
        p['age']=life.age_at(p,day);daily(p,s['world_seed'],day);inj=s['v42']['injuries'].get(str(p['id']))
        if inj and day>=inj['until']:p['fitness'].update(injury_penalty=0,status='fit');del s['v42']['injuries'][str(p['id'])]
    if (D(day)-D(s['age_anchor_date'])).days%7==0:
        old.prune_match_archive(s)
        # Restrict weekly scans to relevant data (full match and injury archives remain intact).
        view=s.copy();cutoff=dateadd(day,-168);view['matches']=[m for m in s['matches'] if m['date']>=cutoff];view['v42']=s['v42']|{'injury_history':[x for x in s['v42']['injury_history'] if x['until']>=dateadd(day,-7)]};growth_week(view,day)
    rank.rankings(s);update_bests(s);refresh_interest(s)

def run(s,target,auto=False,fast_auto=False,stop_event=None):
    D(target)
    if not s['date']<=target or D(target).year>2099:raise ValueError('invalid target (through 2099)')
    def tournament_done():
        return stop_event is not None and (s['v42']['events'].get(stop_event,{}).get('settled') or event(s,stop_event)['status'] in ('completed','cancelled'))
    def tournament_result():
        return {'finished':True,'pause':'tournament_complete','event':stop_event,'date':s['date']}
    if tournament_done():return tournament_result()
    while True:
        if s['date'][:4] in s['v42']['year_closed']:
            if s['date']==target:return {'finished':True,'date':target}
            result=rollover(s)
            if not auto:return {'pause':'new_season','date':s['date'],**result}
            continue
        before={eid:r['phase'] for eid,r in s['registrations'].items()}
        pause=old.process_entries(s,auto)
        if pause:return pause
        # Notify once at final draw; never interrupt for provisional outcomes.
        failed=[]
        for e in s['calendar']:
            eid=e['id'];r=s['registrations'].get(eid,{})
            if r.get('phase') not in ('drawn','cancelled') or before.get(eid) in ('drawn','cancelled','completed'):continue
            for pid in s['club']['roster']:
                decision=r.get('decisions',{}).get(str(pid),{})
                if not decision.get('willing'):continue
                admitted=pid in r.get('entries',[]) and r['phase']!='cancelled'
                q=s['v42']['events'].get(eid,{}).get('qualification',{})
                in_qual=admitted and pid in q.get('entrants',[])
                reason=(('凭近12周S100决赛成绩优先入围资格赛；晋级后自动进入正赛，无需再次报名' if pid in r.get('merit_qualifiers',[]) else '进入资格赛，晋级后自动进入正赛，无需再次报名') if in_qual else '赛事取消' if r['phase']=='cancelled' else '已进入正式签表' if admitted else '资格审核未通过（伤病、冲突或积分资格）' if not decision.get('eligible_at_close') else '候补未递补 / 名额限制')
                message={'id':eid+':'+str(pid),'event':eid,'event_name':e['name'],'date':s['date'],'player_id':pid,'admitted':admitted,'entry_status':'qualifying' if in_qual else 'direct' if admitted else 'rejected','reason':reason}
                inbox=s.setdefault('registration_inbox',[])
                if not any(x['id']==message['id'] for x in inbox):inbox.append(message)
                if not admitted:failed.append(message)
        # Results are delivered to inbox without interrupting match days.
        for eid,v in sorted(s['v42']['events'].items()):
            while not v['settled'] and v['cursor']<len(v['queue']) and v['queue'][v['cursor']]['date']==s['date']:
                item=v['queue'][v['cursor']]
                if not auto and eid!=stop_event and {item['a'],item['b']}&set(s['club']['roster']) and (v['active'] or qual.playable(s,eid,item)):return {'pause':'match','event':eid,'match':item,'date':s['date']}
                play(s,eid,fast=(auto and fast_auto) or eid==stop_event)
                if tournament_done():return tournament_result()
        if s['date'].endswith('-12-31'):close(s)
        if s['date']==target:return {'finished':True,'date':target} if stop_event is None else {'pause':'tournament_pending','event':stop_event,'date':s['date']}
        if s['date'][:4] in s['v42']['year_closed']:continue
        if D(s['date']).day==calendar.monthrange(D(s['date']).year,D(s['date']).month)[1]:settle_month(s,s['date'])
        s['date']=dateadd(s['date'],1);tick(s)
