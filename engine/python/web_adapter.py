import json, sys, secrets, copy, math, re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'engine'))
import career as m, career_events as old, registration as reg
from match_engine import match_statistics, restore_match
from analytics import player_report
import qualification as qual
from career_helpers import dateadd
from attributes import ability
from legacy_rally import ATTR
S=None
ROSTER=json.loads((ROOT/'players.json').read_text())
BASE=json.loads((ROOT/'players.json').read_text())

# Women's singles careers are a separate database; legacy men's saves cannot migrate by ID.
ROSTER_ID='ws-2026-11-24'
def roster_preview():
    s=m.create(42,roster_input=ROSTER)
    return [person(p) for p in s['players']]
def person(p):
    keys='id name zh country rank points race_points ability age age_verified age_basis height_cm handedness external_rating profile_confidence profile_sources profile_version style_evidence bwf_rank bwf_points history_sample_count profile_basis dob_source birthdate_source career_birthdate origin profile_style synthetic_archetype attributes_status attributes potential_estimate fitness season_stats career_stats retired_date retired_rank debut_date debut_CA'.split()
    out={k:p[k] for k in keys if k in p}
    return out

def public_match(item,active=None,record=None):
    x=record or active or {}; snap=record.get('final_snapshot',{}) if record else x
    log=x.get('log',[]); a,b=item['a'],item['b']
    return dict(**{k:item.get(k) for k in ('event_id','a','b','serial','date','stage')},simulation_mode=x.get('simulation_mode','abstract' if snap.get('spatial') is False else 'spatial'),spatial=snap.get('spatial',active is None and record is None),body_profiles=snap.get('body_profiles',[]),finished=record is not None,winner=record.get('winner') if record else None,outcome=record.get('outcome') if record else None,score=snap.get('score',[0,0]),games=snap.get('games',[0,0]),history=snap.get('history',record.get('history',[]) if record else []),server=snap.get('server',None),ends=snap.get('ends',None),fatigue=snap.get('fatigue',[None,None]),form=snap.get('form',[None,None]),day_form=snap.get('day_form',[None,None]),log=[{k:l[k] for k in ('game','score','winner','event','shots','terminal','server','service_court','next_server','service_over','changed_ends','fatigue','stroke_trace','spatial','shot_types','distance','coach_plans','tactical_state') if k in l} for l in log],statistics=record.get('statistics') if record else match_statistics(log))

def group_info(v,item):
    if not str(item.get('stage','')).startswith('G'):return {}
    for j,g in enumerate(v.get('groups',[])):
        if item.get('a') in g and item.get('b') in g:
            return {'group':chr(65+j),'group_round':int(item['stage'][1:]) if item['stage'][1:].isdigit() else None}
    return {}

def sporting_status(v):
    statuses={}
    for m in v.get('results',[]):
        st=m['stage'];w=m.get('winner')
        if st in ('Q1','Q2') or st.startswith('G'):continue
        for i in (m['a'],m['b']):
            if i is not None and i!=w:statuses[str(i)]={'stage':st,'state':'eliminated'}
        if w is not None:statuses[str(w)]={'stage':st,'state':'champion' if st=='F' else 'advanced'}
    for i,z in v.get('placements',{}).items():
        statuses[i]={'state':'placement','placement':z}
    for m in v.get('queue',[])[v.get('cursor',0):]:
        if m['stage'] in ('Q1','Q2'):continue
        for i in (m['a'],m['b']):
            if i is not None and str(i) not in v.get('placements',{}) and statuses.get(str(i),{}).get('state')!='eliminated':statuses[str(i)]={'stage':m['stage'],'state':'pending'}
    # Group stage results are not knockout eliminations. A three-player group
    # contains three scheduled rounds but each player plays only two matches.
    for j,g in enumerate(v.get('groups',[])):
        label=chr(65+j);final=v.get('group_order')
        for i in g:
            k=str(i);done=sum(1 for m in v.get('results',[]) if m['stage'].startswith('G') and i in (m['a'],m['b']))
            if final is not None:
                if i not in final[j][:v.get('advance_per_group',1)]:
                    statuses[k]={'state':'group_eliminated','group':label,'played':done,'required':len(g)-1}
                elif k not in statuses:
                    statuses[k]={'state':'group_qualified','group':label,'played':done,'required':len(g)-1}
            else:
                statuses[k]={'state':'group_wait' if done>=len(g)-1 else 'group_pending','group':label,'played':done,'required':len(g)-1}
    return statuses

def events_view(s):
    rows=[];ready=reg.ready(s)
    for e in sorted(s['calendar'],key=lambda e:e['start']):
        eid=e['id'];r=s['registrations'].get(eid,{});v=s['v42']['events'].get(eid,{})
        phase=r.get('phase','not_open');d=reg.dates(s,e)
        if phase=='open' and s['date']<d['open']:phase='not_open'
        if phase=='not_open' and d['open']<=s['date']<=d['close']:phase='open'
        blocked=reg.team_conflicts(s,e)
        if phase=='open' and eid!=ready:phase='not_open'
        controlled=[i for i in s['club']['roster'] if reg.controlled(s,e,i)]
        direct,qualifiers=qual.split(e,r.get('entries',[])) if not v else (v.get('qualification',{}).get('direct',v.get('entries',[])),v.get('qualification',{}).get('entrants',[]))
        q=v.get('qualification',{})
        rows.append(dict(**e,team_conflicts=blocked,conflicts={str(i):[o['name'] for o in s['calendar'] if o['id']!=eid and o['status']!='cancelled' and e['start']<=o['end'] and o['start']<=e['end'] and i in s['registrations'].get(o['id'],{}).get('entries',[]) and str(i) not in s['registrations'].get(o['id'],{}).get('withdrawn',{})] for i in s['club']['roster']},overlaps=[o['name'] for o in s['calendar'] if o['id']!=eid and e['start']<=o['end'] and o['start']<=e['end']],qualification=dict(direct=direct,entrants=qualifiers,winners=q.get('winners',[]),eliminated=q.get('eliminated',{}),finished=q.get('finished',False),main_entries=q.get('main_entries',[])),sporting_status=sporting_status(v),deadlines=d,phase=phase,intents=r.get('intents',{}),accepted=r.get('entries',[]),reserves=r.get('reserves',[]),withdrawn=r.get('withdrawn',{}),controlled=controlled,decisions=r.get('decisions',{}),played=v.get('cursor',0),total=len(v.get('queue',[])),champion=next((int(i) for i,z in v.get('placements',{}).items() if z==0),None)))
    return rows

def prematch_history(s, a, b):
    """Only recorded, completed simulated matches; exclude walkovers and byes."""
    ids=(a,b); recent=[[],[]]; meetings=[]; wins=[0,0]
    for r in reversed(s['matches']):
        if r.get('outcome')!='played' or r.get('winner') is None:continue
        pair=(r.get('a'),r.get('b'))
        for i,pid in enumerate(ids):
            if pid in pair and len(recent[i])<10:recent[i].append(int(r['winner']==pid))
        if set(pair)==set(ids):
            wins[ids.index(r['winner'])]+=1
            if len(meetings)<5:
                games=r.get('history',[])
                meetings.append(dict(date=r['date'],event_id=r['event_id'],winner=ids.index(r['winner']),history=games if pair==ids else [g[::-1] for g in games]))
    return dict(wins=wins,recent=recent,meetings=meetings,analytics=[player_report(s,i,10) for i in ids])

def match_pending(s):
    for eid,v in sorted(s['v42']['events'].items()):
        if not v['settled'] and v['cursor']<len(v['queue']):
            it=v['queue'][v['cursor']]
            if it['date']==s['date'] and (set((it['a'],it['b']))&set(s['club']['roster']) or v['active']) and (v['active'] or qual.playable(s,eid,it)):
                out={**public_match({**it,'event_id':eid},v['active']),**group_info(v,it)}
                if not out['log']:
                    out['prematch']=prematch_history(s,it['a'],it['b'])
                if not v['active']:
                    players={p['id']:p for p in s['players']}
                    out['body_profiles']=[{k:players.get(i,{}).get(k) for k in ('height_cm','handedness')} for i in (it['a'],it['b'])]
                coach=s.get('coach_current',{})
                out['coach_plans']=coach.get('plans',{}) if coach.get('key')==[eid,it['serial'],it['a'],it['b']] else {}
                return out
    return None

def result_summary(r):
    return {k:r.get(k) for k in ('event_id','date','stage','a','b','winner','history','outcome','serial')}

def athlete_identity(s):
    return s.get('career_player_id')

def migrate_athlete(s):
    # Existing world/results remain intact. Prefer the active match participant,
    # otherwise the first previously controlled player. Never switch a fixed identity.
    if 'career_player_id' not in s:
        roster=list(s['club']['roster'])
        pending=match_pending(s)
        active_own=[i for i in roster if pending and pending['log'] and i in (pending['a'],pending['b'])]
        historical=[i for y in reversed(s['career_history']) for i in y.get('roster',[])]
        s['career_player_id']=(active_own or roster or historical or [None])[0]
        s['career_migration']={'previous_roster':roster,'player_id':s['career_player_id']}
    pid=athlete_identity(s)
    active_ids={p['id'] for p in s['players']}
    keep=[pid] if pid in active_ids else []
    s['club']['roster']=keep
    for p in s['players']:
        if p['id']!=pid and p.get('employer')=='USER':
            p['employer']=None;p['contract']=None
    s['rules']['career_mode']='single fixed athlete until retirement; no annual player switching'

def view(s):
    roster=[athlete_identity(s)] if athlete_identity(s) is not None else []; hist=[r for r in s['matches'] if set((r['a'],r['b']))&set(roster)]
    # Non-played outcomes are stored in event results rather than match archive.
    for eid,v in s['v42']['events'].items():
        hist.extend({**r,'event_id':eid} for r in v['results'] if r.get('outcome') in ('bye','walkover','void') and set((r['a'],r['b']))&set(roster))
    hist.sort(key=lambda r:(r['date'],r['event_id'],r['serial']))
    years=[]
    for y in s['career_history']:
        years.append(dict(year=y['year'],personal=next((q for q in y['players'] if q['id']==athlete_identity(s)),None),players=sorted(y['players'],key=lambda p:p['rank'])[:10],roster=y['roster'],champions=[dict(id=e['id'],name=e['name'],level=e['level'],champion=next((int(i) for i,z in y['events'].get(e['id'],{}).get('placements',{}).items() if z==0),None)) for e in y['calendar']]))
    def decorated(r):
        return {**result_summary(r),**group_info(s['v42']['events'].get(r['event_id'],{}),r)}
    return dict(career_player_id=athlete_identity(s),career_ended=not s['club']['roster'],career_migration=s.get('career_migration'),calendar_policy=s.get('calendar_policy','legacy'),inbox=[x for x in reversed(s.get('registration_inbox',[])) if x.get('player_id')==athlete_identity(s)],inbox_read=s.get('registration_inbox_read',[]),date=s['date'],year=s['season_year'],roster=s['club']['roster'],players=[person(p) for p in s['players']],retired=[person(p) for p in s['retired_players']],calendar=events_view(s),match=match_pending(s),last={**public_match(hist[-1],record=hist[-1]),**group_info(s['v42']['events'].get(hist[-1]['event_id'],{}),hist[-1])} if hist else None,recent=[decorated(r) for r in hist[-30:]][::-1],world_recent=[decorated(r) for r in s['matches'][-12:]][::-1],years=years,news=s['lifecycle_history'][-40:][::-1],match_count=len(s['matches']),selection_open=False,closed=s['date'][:4] in s['v42']['year_closed'])

def group_standings(s,e,v,r,current):
    # Read-only mirror of the tournament tie-breaker; never changes injury or withdrawal state.
    frozen=v.get('group_order'); output=[]
    if e.get('ruleset')=='bwf84':
        from draw import standings84
        from season import seed
        for j,g in enumerate(v.get('groups',[])):
            _,rows=standings84(g,v.get('results',[]),v.get('group_withdrawn84',r.get('withdrawn',{})),lambda i:seed(s['world_seed'],'group_lot84',e['id'],i))
            if frozen is not None:
                order=frozen[j];by={x['id']:x for x in rows};rows=[by[i] for i in order+[i for i in g if i not in order]]
                for k,row in enumerate(rows):row['rank']=k+1 if row['id'] in order else None
            output.append(rows)
        return output
    for index,g in enumerate(v.get('groups',[])):
        if frozen is not None:eligible=list(frozen[index])
        else:
            available={p['id'] for p in s['players'] if p['fitness']['injury_penalty']<5} if current else set(g)
            eligible=[i for i in g if i in available and str(i) not in r.get('withdrawn',{})]
        stats={i:dict(id=i,played=0,wins=0,losses=0,gd=0,pd=0,rank=None) for i in g};head={}
        for match in v.get('results',[]):
            a,b,w=match['a'],match['b'],match.get('winner')
            if not match['stage'].startswith('G') or a not in eligible or b not in eligible or w not in (a,b) or match.get('outcome') in ('bye','void'):continue
            h=match.get('history',[]);gd=sum((x>y)-(x<y) for x,y in h);pd=sum(x-y for x,y in h)
            for i,sign in ((a,1),(b,-1)):
                z=stats[i];z['played']+=1;z['wins']+=int(i==w);z['losses']+=int(i!=w);z['gd']+=sign*gd;z['pd']+=sign*pd
            head[frozenset((a,b))]=w
        order=[]
        if frozen is not None:order=list(frozen[index])
        else:
            for wins in sorted({stats[i]['wins'] for i in eligible},reverse=True):
                tied=[i for i in eligible if stats[i]['wins']==wins]
                if len(tied)==2 and frozenset(tied) in head:
                    hw=head[frozenset(tied)];tied.sort(key=lambda i:i!=hw)
                else:tied.sort(key=lambda i:(-stats[i]['gd'],-stats[i]['pd'],g.index(i)))
                order+=tied
        for j,i in enumerate(order,1):stats[i]['rank']=j
        output.append([stats[i] for i in order+[i for i in g if i not in order]])
    return output

def detail(s,eid):
    if any(e['id']==eid for e in s['calendar']):
        e=m.event(s,eid);r=s['registrations'].get(eid,{});v=s['v42']['events'].get(eid,{})
    else:
        y=next(y for y in s['career_history'] if str(y['year'])==eid[:4]);e=next(e for e in y['calendar'] if e['id']==eid);r=y['registrations'].get(eid,{});v=y['events'].get(eid,{})
    q=v.get('qualification')
    if not q and not v and e['level'] in qual.RULES:
        direct,entrants=qual.split(e,r.get('entries',[]));q=dict(direct=direct,entrants=entrants,groups=[],winners=[],eliminated={},finished=False,main_entries=[]) if entrants else None
    return dict(event=e,draw_policy=v.get('draw_policy','legacy'),seeds=v.get('seeds',{}),qual_seeds=v.get('qual_seeds',{}),main_slots=v.get('main_slots',[]),qualification=q,entries=v.get('entries',r.get('entries',[])),reserves=r.get('reserves',[]),groups=v.get('groups',[]),results=v.get('results',[]),queue=v.get('queue',[])[v.get('cursor',0):],placements=v.get('placements',{}),withdrawn=r.get('withdrawn',{}),schedule=v.get('queue',[]),days=v.get('days',{}),standings=group_standings(s,e,v,r,any(x['id']==eid for x in s['calendar'])),group_complete='group_order' in v,advance_per_group=v.get('advance_per_group',1))

def growth_detail(s,pid):
    p=next((p for p in s['players']+s['retired_players'] if p['id']==pid),None)
    if p is None:raise ValueError('球员不存在')
    rows=sorted((r for r in s.get('growth_history_v53',[]) if r['player_id']==pid),key=lambda r:r['date'])
    # Existing records include exact weekly CA/group deltas. Do not invent older individual attributes or PA.
    return dict(player_id=pid, date=p.get('retired_date',s['date']), debut_date=p.get('debut_date',s['date']), debut_CA=p.get('debut_CA',p['ability']), current_CA=p['ability'], current_PA=p.get('potential_estimate'), rows=[{k:r[k] for k in ('date','ability_before','ability_after','group_delta','attribute_delta','pa_before','pa_after','phase','matches_84d','load_factor','injury_factor') if k in r} for r in rows], annual=[dict(year=y['year'],CA=q['ability'],rank=q['rank']) for y in s['career_history'] for q in y['players'] if q['id']==pid])

def custom_entry(raw):
    if not isinstance(raw,dict):raise ValueError('自建球员资料无效')
    def number(k,lo,hi,integer=False):
        v=raw.get(k)
        if type(v) not in (int,float) or not math.isfinite(v) or not lo<=v<=hi or (integer and v%1):raise ValueError(f'{k} 超出有效范围')
        return int(v) if integer else float(v)
    name=raw.get('name','');country=raw.get('country','')
    if not isinstance(name,str) or not 1<=len(name.strip())<=40 or any(ord(c)<32 for c in name):raise ValueError('姓名须为1–40个字符')
    if not isinstance(country,str) or not re.fullmatch('[A-Z]{3}',country):raise ValueError('国家/地区代码须为3个大写字母')
    age=number('age',16,40,True);height=number('height_cm',140,200,True)
    hand=raw.get('handedness')
    if hand not in ('left','right'):raise ValueError('请选择持拍手')
    attrs=raw.get('attributes')
    if not isinstance(attrs,dict) or set(attrs)!=set(ATTR) or any(type(v) not in (int,float) or not math.isfinite(v) or not 35<=v<=99 for v in attrs.values()):raise ValueError('16项属性须在35–99之间，无总点数限制')
    attrs={k:float(attrs[k]) for k in ATTR};ca=ability(attrs)
    pa=number('potential_hidden',35,99)
    if pa<ca:raise ValueError('潜力不能低于当前CA')
    return dict(name=name.strip(),zh=name.strip(),country=country,age=age,age_verified=False,age_basis='custom fictional age',dob=f'{2027-age}-01-01',height_cm=height,handedness=hand,ability=ca,attributes=attrs,potential_hidden=pa,real=False,profile_style='自建球员',profile_provenance='玩家自定义属性',profile_basis='user_created',profile_version='14.1-custom',bwf_points=0)

def handle(action,data):
    global S
    compact_point=False
    if action=='preview':return {'preview':roster_preview()}
    if action=='new':
        roster=ROSTER if data.get('profile','scouting')=='scouting' else BASE
        if 'custom' in data:
            entry=custom_entry(data['custom']);roster=[*roster,entry];ids=[len(roster)]
        else:
            ids=data.get('ids',[])
            if not isinstance(ids,list) or len(ids)!=1 or type(ids[0]) is not int or not 1<=ids[0]<=len(roster):raise ValueError('请选择一名球员开启个人生涯')
        S=m.create(int(data.get('seed',secrets.randbits(32))),roster_input=roster,selected=ids)
        if 'custom' in data:
            own=next(p for p in S['players'] if p['id']==ids[0]);own['origin']='user_created';own['birthdate_source']='玩家自建生日';S['rules']['custom_player']=True
        S['rules']['profile_choice']='custom' if 'custom' in data else data.get('profile','scouting');S['ui_registration_v76']=True;S['ui_qualification_v78']=True;S['ui_revision']='14.1';S['ui_sequential_v93']=True;S['ui_roster_id']=ROSTER_ID;S['rules']['discipline']='WS';S['rules']['profile_dataset']='2026-11 ranking snapshot + sourced biography + third-party result rating where available; modeled attributes';S['career_player_id']=ids[0];migrate_athlete(S);result={'new':True}
    elif action=='restore':
        s=json.loads(data['save']);
        if s.get('ui_roster_id')!=ROSTER_ID:raise ValueError('此版本仅支持新版女单生涯存档，请重新开档；旧男单存档请在旧版使用。')
        if s.get('version')!=m.VERSION:raise ValueError('仅支持 V7.5 生涯存档')
        # Preserve old closed/frozen deadlines, migrate only open or future events.
        if not s.get('ui_registration_v76'):
            for e in s['calendar']:
                r=s['registrations'].get(e['id'],{})
                if r.get('phase') not in ('accepted','drawn','completed','cancelled'):continue
                offsets=(7,5,1) if e['level']=='FINALS' else (28,21,1)
                s.setdefault('ui_legacy_deadlines',{})[e['id']]={k:max(f"{s['season_year']}-01-01",dateadd(e['start'],-n)) for k,n in zip(('open','close','draw'),offsets)}
            s['ui_registration_v76']=True
        if not s.get('ui_qualification_v78'):
            for r in s['registrations'].values():
                if r.get('phase')=='accepted':r['legacy_no_qual']=True
            s['ui_qualification_v78']=True
        # Preserve active season dates and any frozen deadlines in existing careers. Next season uses new calendar.
        if not s.get('calendar_policy') and not s['registrations'] and s['date'].endswith('-01-01'):
            import calendar_rules
            calendar_rules.install(s)
        reg.migrate_sequential(s)
        patch=data.get('checkpoint_patch')
        if patch:
            v=s['v42']['events'][patch['event']];it=v['queue'][v['cursor']]
            if s['date']!=patch['date'] or it['serial']!=patch['serial'] or not v['active']:raise ValueError('增量存档与生涯存档不匹配')
            v['active']=patch['active']
        migrate_athlete(s)
        valid={x['id'] for x in s.get('registration_inbox',[])}
        s['registration_inbox_read']=sorted(set(s.get('registration_inbox_read',[])) | (set(data.get('inbox_read_patch') or []) & valid))
        old.prune_match_archive(s,migrate=True);view(s);S=s;result={'restored':True}
    elif action=='reset':S=None;return {'reset':True}
    else:
        if S is None:raise ValueError('请先创建生涯')
        if action=='prefetch':
            v=S['v42']['events'].get(data.get('event'),{});active=v.get('active')
            if not active or not active.get('spatial') or v['queue'][v['cursor']]['serial']!=data.get('serial'):return {'prefetched':False}
            if len(active['log'])!=data.get('points') or active['log'][-1]['event']!='point':return {'prefetched':False}
            it=v['queue'][v['cursor']];clone=restore_match(copy.deepcopy(active));coach=S.get('coach_current',{})
            if coach.get('key')==[data['event'],it['serial'],it['a'],it['b']]:clone.coach_plans=coach.get('plans',{})
            clone.point() # only populates bridge cache; career and RNG remain untouched
            return {'prefetched':True}
        if action=='checkpoint':return {'save':json.dumps(S,ensure_ascii=False,separators=(',',':'))}
        if action=='player_report':return {'report':player_report(S,int(data['id']))}
        if action=='growth':return {'growth':growth_detail(S,int(data['id']))}
        if action=='event':return {'detail':detail(S,data['event'])}
        if action in ('entry','withdraw','coach','play') and not S['club']['roster']:raise ValueError('个人生涯已结束')
        if action=='select':raise ValueError('个人生涯身份固定，不能更换球员')
        elif action=='entry':reg.submit(S,data['event'],[int(i) for i in data['ids']]);result={'submitted':True,'event':data['event']}
        elif action=='withdraw':old.withdraw(S,data['event'],int(data['id']),data.get('reason','voluntary'));result={'withdrawn':True}
        elif action=='run':
            if not S['club']['roster']:raise ValueError('个人生涯已结束，请查看生涯历史')
            result=m.run(S,data['target'],bool(data.get('auto',False)),fast_auto=bool(data.get('fast_auto',False)))
        elif action=='coach':
            pending=match_pending(S)
            if not pending or pending['event_id']!=data.get('event') or pending['serial']!=data.get('serial') or not pending['spatial']:raise ValueError('当前比赛不支持战术调整')
            log=pending['log']
            if data.get('points') is not None and data['points']!=len(log):raise ValueError('比分已变化，请重新打开战术面板')
            plans=data.get('plans',{})
            if not isinstance(plans,dict):raise ValueError('无效战术')
            clean={}
            for i,v in plans.items():
                if i not in ('0','1') or pending[('a','b')[int(i)]] not in S['club']['roster'] or not isinstance(v,dict):raise ValueError('只能调整自己的比赛战术')
                options={'mode':('auto','balanced','attack','control','counter','net','endurance','safe'),'target':('auto','front','rear','corners','backhand','body'),'risk':('normal','low','high'),'pace':('normal','slow','fast'),'recovery':('auto','front','rear')}
                defaults={'mode':'auto','target':'auto','risk':'normal','pace':'normal','recovery':'auto'}
                plan={k:v.get(k,defaults[k]) for k in options}
                if any(plan[k] not in values for k,values in options.items()):raise ValueError('无效战术选项')
                if plan!=defaults:clean[i]=plan
            S['coach_current']={'key':[pending['event_id'],pending['serial'],pending['a'],pending['b']],'plans':clean}
            result={'coach':True}
        elif action=='play':
            pending=match_pending(S)
            if not pending or pending['event_id']!=data['event'] or pending['serial']!=data['serial']:raise ValueError('当前比赛已变化，请刷新')
            was_active=bool(S['v42']['events'][data['event']]['active'])
            result=m.play(S,data['event'],data.get('until','point'),retire_id=data.get('retire_id'))
            compact_point=bool(data.get('compact') and was_active and data.get('until')=='point' and result.get('pause')=='in_match' and data.get('retire_id') is None)
        else:raise ValueError('未知操作')
    S['rules']['engine']='V15.1 dual: engine balance and tactical intelligence'
    S['rules']['registration']='station-day entry and draw; one overlapping event per managed team; existing frozen entries preserved'
    S['ui_revision']='15.4'
    if compact_point:
        pending=match_pending(S);active=S['v42']['events'][data['event']]['active']
        # Only transmit the new display row; persist the active match independently of the world archive.
        pending['log']=pending['log'][-1:]
        return {'state_patch':{'match':pending},'append_log':True,'result':result,'checkpoint_patch':{'event':data['event'],'serial':data['serial'],'date':S['date'],'active':active}}
    save=json.dumps(S,ensure_ascii=False,separators=(',',':'))
    return {'state':view(S),'result':result,'save':save}

def rpc(action,data_json):
    global S
    # State-changing operations are transactional; UI cannot leave partial mutations on errors.
    data=json.loads(data_json);backup=None;local=None
    # Tiny idempotent operation: no transaction snapshot, world projection or full save.
    if action=='read_inbox':
        if S is None:return json.dumps({'error':'请先创建生涯'},ensure_ascii=False)
        valid={x['id'] for x in S.get('registration_inbox',[]) if x.get('player_id')==athlete_identity(S)}
        ids=data.get('ids',[])
        if not isinstance(ids,list) or any(not isinstance(i,str) or i not in valid for i in ids):return json.dumps({'error':'消息不存在'},ensure_ascii=False)
        read=set(S.get('registration_inbox_read',[]));read.update(ids);S['registration_inbox_read']=sorted(read)
        return json.dumps({'read':True,'ids':ids},ensure_ascii=False)
    if S is not None and action not in ('preview','event','growth','checkpoint','prefetch','player_report'):
        # A non-final point can only mutate its own active match; finish/retire/new matches still get a full transaction.
        if action=='play' and data.get('until')=='point' and data.get('retire_id') is None:
            v=S['v42']['events'].get(data.get('event'),{});active=v.get('active')
            if active and v['queue'][v['cursor']]['serial']==data.get('serial'):
                score=active['score'];games=active['games']
                can_finish=any(games[i]==1 and (score[i]+1==active['cap'] or (score[i]+1>=active['target'] and score[i]+1-score[1-i]>=2)) for i in (0,1))
                if not can_finish:local=(v,copy.deepcopy(active))
        if local is None:backup=json.dumps(S,ensure_ascii=False,separators=(',',':'))
    try:return json.dumps(handle(action,data),ensure_ascii=False,separators=(',',':'))
    except Exception as e:
        if local is not None:local[0]['active']=local[1]
        elif backup is not None:S=json.loads(backup)
        return json.dumps({'error':str(e) or type(e).__name__},ensure_ascii=False)
