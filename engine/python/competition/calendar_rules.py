"""BWF published 2027/28 World Tour dates, 30 June 2026. Other years are projections."""
from datetime import date,timedelta
SOURCE='https://res.cloudinary.com/badminton/images/v1782784055/wordpress_assets_test/BWF-World-Tour-Calendar-2027-2028/BWF-World-Tour-Calendar-2027-2028.pdf'
# stable slug | Chinese name | tier | host city | 2027 range | 2028 range
# The editable calendar lives in data/tournaments.json (virtual /smash/tournaments.json).
import json
from pathlib import Path
DATA='\n'.join('|'.join(row[k] for k in ('id','name','level','city','dates_2027','dates_2028')) for row in json.loads((Path(__file__).resolve().parents[1]/'tournaments.json').read_text(encoding='utf-8')))
PRIORITY={'FINALS':0,'WC':1,'1000':2,'750':3,'500':4,'300':5,'100':6}
def build(year):
    out=[]
    for row in DATA.splitlines():
        slug,name,level,city,a,b=row.split('|');start,end=(b if year==2028 else a).split()
        if slug=='JPNMASTERS' and year==2028:name='日本大师赛'
        if slug=='USOPEN' and year!=2027:city='美国'
        out.append(dict(id=f'{year}-{slug}',name=name,city=city,level=level,start=f'{year}-{start}',end=f'{year}-{end}',status='scheduled',entries=None,format='groups_then_knockout' if level in ('1000','FINALS') else 'knockout',source='BWF 2027–2028 官方赛历' if year in (2027,2028) else '基于2027赛历的模拟日期',calendar_confirmed=year in (2027,2028),ruleset='bwf84'))
    # 2027 individual World Championships dates not confirmed in the published calendar.
    # Retain the existing game event in a free window, visibly labelled provisional. Olympic years have no WC.
    if year%4!=0:
        out.append(dict(id=f'{year}-WC',name='世界羽毛球锦标赛',city='加拿大密西沙加' if year==2027 else '',level='WC',start=f'{year}-07-14',end=f'{year}-07-25',status='scheduled',entries=None,format='groups_then_knockout',source='2026-11-25 加拿大羽协公告' if year==2027 else '游戏赛历（非官方）',calendar_confirmed=year==2027,ruleset='bwf84'))
    return sorted(out,key=lambda e:(e['start'],PRIORITY[e['level']],e['id']))
def deadlines(year,events,e):
    start=date.fromisoformat(e['start']);floor=date(year,1,1)
    modern=e.get('ruleset')=='bwf84'
    close=start-timedelta(days=(14 if e['level']=='FINALS' else 28) if modern else 1)
    # No mandatory registration on any tournament day. Earlier deadlines during congested weeks.
    while close>floor and any(o['start']<=str(close)<=o['end'] for o in events):close-=timedelta(days=1)
    close=max(floor,close);opening=max(floor,close-timedelta(days=6));draw=max(close,start-timedelta(days=7 if modern and e['level']!='FINALS' else 1))
    return dict(open=str(opening),close=str(close),draw=str(draw))
def install(s):
    s['calendar']=build(s['season_year']);s['calendar_policy']='bwf80';s['calendar_source_url']=SOURCE
    s['rules']['calendar']='BWF published 2027/28; later projected; 2027 WC confirmed; overlapping events mutually exclusive per player'
    s['rules']['registration']='mandatory confirmation only on non-tournament dates; freeze at close; draw before start; overlapping events prioritized by tier'
