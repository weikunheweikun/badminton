"""Opening aggregate rank carryover, explicitly synthetic expiry; tour race best 14 max 3 S100."""
from season import D,POINTS
from contracts import dayadd

def init(s):
    for p in s['players']:
        n=p.get('bwf_points',0);q,rem=divmod(n,10)
        p['opening_rank_credits']=[{'points':q+(i<rem),'expiry':dayadd(s['date'],round((i+1)*364/10))} for i in range(10)] if n else []
    s['rules']['ranking']='best ten rolling 52 weeks; opening BWF aggregate split into ten synthetic expiring credits; race best 14 max 3 S100';rankings(s)

def rankings(s,date=None):
    day=date or s['date']
    publish=(not s.get('ranking_date') or day==s.get('age_anchor_date') or day.endswith('-01-01') or D(day).weekday()==1 and day!=s.get('ranking_date'))
    modern=any(e.get('ruleset')=='bwf84' for e in s.get('calendar',[]))
    cutoff=dayadd(day,-363)
    for p in s['players']:
        if not modern or publish or 'points' not in p:
            pts=[x['points'] for x in p['ranking_ledger'] if cutoff<=x['date']<=day]
            pts += [x['points'] for x in p.get('opening_rank_credits',[]) if day<x['expiry']]
            p['points']=sum(sorted(pts,reverse=True)[:10]);p['ranking_events84']=len(pts)
        race=[x for x in p['ranking_ledger'] if int(x.get('race_season',x['date'][:4]))==s['season_year'] and str(x.get('level','')).isdigit()]
        non=[x['points'] for x in race if x['level']!='100'];low=sorted((x['points'] for x in race if x['level']=='100'),reverse=True)[:3]
        p['race_points']=sum(sorted(non+low,reverse=True)[:14])
    if not modern or publish:
        if modern and day!=s.get('age_anchor_date'):
            last=None;rank=0
            for i,p in enumerate(sorted(s['players'],key=lambda p:(-p['points'],-p.get('ranking_events84',0),p['id'])),1):
                key=(p['points'],p.get('ranking_events84',0))
                if key!=last:rank=i;last=key
                p['rank']=rank
        else:
            for i,p in enumerate(sorted(s['players'],key=lambda p:(-p['points'],(p.get('bwf_rank',9999) if day==s['age_anchor_date'] else 9999),-p['ability'],p['id'])),1):p['rank']=i
        s['ranking_date']=day

def award(s,e,placements,played):
    for pid,stage in placements.items():
        v=s['v42']['events'].get(e['id'],{});matches=[m for m in v.get('results',[]) if int(pid) in (m['a'],m['b'])];credit_stage=stage
        if e.get('ruleset')=='bwf84':
            # A bye followed immediately by a loss earns first-round loser points. Qualification does not count as a main-draw win.
            ko=[m for m in matches if m['stage'] in ('R64','R32','R16','QF','SF','F')]
            if not v.get('groups') and len(ko)>=2 and ko[0].get('outcome')=='bye' and ko[1].get('winner')!=int(pid):credit_stage=min(6,stage+1)
            if e['level'] in ('WC','FINALS','1000','750','500'):
                byid={p['id']:p for p in s['players']}
                if any(m.get('outcome') in ('walkover','retirement') and m.get('winner')!=int(pid) and m['a'] in byid and m['b'] in byid and byid[m['a']]['country']==byid[m['b']]['country'] for m in matches):continue
        p=next(p for p in s['players'] if p['id']==int(pid))
        if int(pid) not in played:continue
        p['ranking_ledger'].append(dict(event_id=e['id'],date=s['date'],level=e['level'],points=points_for(e,credit_stage),synthetic=False,race_season=race_year(s,e)))
        if stage==0:p['season_stats']['titles']+=1
    e['status']='completed';rankings(s)


BWF_POINTS={'1000':[12000,10200,8400,6600,4800,3000,1200,600], '750':[11000,9350,7700,6050,4320,2660,1060,520], '500':[9200,7800,6420,5040,3600,2220,880,430], '300':[7000,5950,4900,3850,2750,1670,660,320], '100':[5500,4680,3850,3030,2110,1290,510,240], 'WC':[14500,12500,10500,8200,6000,3700,1450,750], 'FINALS':[14000,12000,10000,7800,8900,7800,1400,720]}
def points_for(e,stage):
    return BWF_POINTS[e['level']][stage] if e.get('ruleset')=='bwf84' else POINTS[e['level']][min(stage,5)]


def race_year(s,e):
    f=next((x for x in s['calendar'] if x['level']=='FINALS'),None)
    return s['season_year']+int(bool(e.get('ruleset')=='bwf84' and f and str(e['level']).isdigit() and e['end']>dayadd(f['start'],-14)))
