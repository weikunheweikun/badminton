"""Lightweight, deterministic career mail; no changes to results or random streams."""
from datetime import date, timedelta

def own(s):
    pid=s.get('career_player_id')
    if pid is None:return None
    return next((p for p in s['players']+s['retired_players'] if p['id']==pid),None)

def named(s,pid):
    p=next((p for p in s['players']+s['retired_players'] if p['id']==pid),{})
    return p.get('zh') or p.get('name') or '球员'

def send(s,key,category,title,body,sender,event=None,subject_id=None,personal=False):
    p=own(s)
    if not p:return
    inbox=s.setdefault('registration_inbox',[]); mid='news:'+key+':'+str(p['id'])
    if any(x['id']==mid for x in inbox):return
    inbox.append(dict(id=mid,date=s['date'],player_id=p['id'],category=category,title=title,reason=body,sender=sender,event=event,subject_id=subject_id,personal=bool(personal or subject_id==p['id'])))

def initialize(s):
    p=own(s)
    if not p or 'news_v157' in s:return
    s['news_v157']={'last_week':s['date'],'match_cursor':len(s['matches']),'rank':p['rank'],'leader':min(s['players'],key=lambda x:x['rank'])['id'] if s['players'] else None,'last_wins':p['career_stats']['wins']+p['season_stats']['wins']}
    send(s,'welcome','career','欢迎来到世界巡回赛',f"{named(s,p['id'])} 当前世界排名第 {p['rank']} 位。参赛计划、赛事成绩、排名变化与巡回赛动态将汇集于此。合理安排赛程与恢复，逐步积累生涯荣誉。",'球员服务中心',subject_id=p['id'])

def settled(s,e,v):
    p=own(s)
    if not p or str(p['id']) not in v.get('placements',{}):return
    z=v['placements'][str(p['id'])]
    # Qualification-only exits already have a dedicated notification.
    if p['id'] in v.get('qualification',{}).get('eliminated',{}) or str(p['id']) in v.get('qualification',{}).get('eliminated',{}):return
    if any(m.get('outcome') in ('played','retirement') and p['id'] in (m['a'],m['b']) for m in v.get('results',[])):
        matches=[m for m in v['results'] if m.get('outcome') in ('played','retirement') and p['id'] in (m['a'],m['b'])]
        wins=sum(m.get('winner')==p['id'] for m in matches)
        points=next((r['points'] for r in reversed(p['ranking_ledger']) if r['event_id']==e['id']),0)
        label={0:'冠军',1:'亚军',2:'四强',3:'八强',4:'十六强',5:'三十二强',6:'六十四强',7:'小组赛出局'}.get(z,'本站完赛')
        if v.get('groups') and not any(not m['stage'].startswith('G') and m['stage'] not in ('Q1','Q2','Q3') for m in matches):label='小组赛出局'
        if z==0 and not points:label='本站完赛'
        title=f"{e['name']} · {label}"
        body=f"{named(s,p['id'])} 本站取得 {wins} 胜 {len(matches)-wins} 负，收获 {points:,} 排名积分。"
        if z==0 and points:
            first=p['career_stats']['titles']+p['season_stats']['titles']==1
            if first:title=f'生涯首冠 · {e["name"]}';body+=' 这是职业生涯的首座巡回赛冠军奖杯。'
            else:body+=' 冠军荣誉已计入赛季档案。'
        elif z==1:body+=' 距离冠军仅一步之遥，期待下一站的表现。'
        else:body+=' 可在赛事页面回顾签表与赛果。'
        send(s,e['id']+':summary','career',title,body,'巡回赛球员服务',e['id'],p['id'])

def injury(s,pid):
    p=own(s)
    if not p or pid!=p['id']:return
    i=s['v42']['injuries'].get(str(pid))
    if i:send(s,'injury:'+s['date'],'fitness','身体状况更新',f"{named(s,pid)} 在比赛后出现伤病，预计恢复日期为 {i['until']}。建议根据恢复进度调整参赛安排。",'运动保障中心',subject_id=pid)

def weekly(s):
    initialize(s); p=own(s)
    if not p or p.get('retired_date'):return
    n=s['news_v157']; now=date.fromisoformat(s['date']); last=date.fromisoformat(n['last_week'])
    if p.get('career_birthdate','')[5:]==s['date'][5:]:
        send(s,'birthday:'+str(now.year),'career',f'生日快乐 · {p["age"]} 岁',f'{named(s,p["id"])} 迎来 {p["age"]} 岁生日。祝愿在新一年的赛场上继续突破，收获更多精彩时刻。','球员服务中心',subject_id=p['id'])
    if (now-last).days<7:return
    # A single digest per week, with meaningful factual changes and at most two news items.
    lines=[];personal=False;title='巡回赛周报'; oldrank=n['rank'];newrank=p['rank']; leader=min(s['players'],key=lambda x:(x['rank'],x['id']))
    if oldrank!=newrank:
        personal=True
        lines.append(f"世界排名：{named(s,p['id'])} 由第 {oldrank} 位{'升至' if newrank<oldrank else '降至'}第 {newrank} 位。")
        if newrank<oldrank:title=f'排名上升 · 世界第 {newrank} 位'
        else:title=f'排名更新 · 世界第 {newrank} 位'
    if leader['id']!=n['leader']:
        personal=personal or p['id'] in (leader['id'],n['leader'])
        lines.append(f"世界第一易主：{named(s,leader['id'])}登顶世界排名。")
        if title=='巡回赛周报':title=f'世界第一易主 · {named(s,leader["id"])}'
    recent=s['matches'][n.get('match_cursor',len(s['matches'])):]
    finals=[m for m in recent if m['stage']=='F' and m.get('outcome')=='played' and m.get('winner') is not None]
    # The highest-tier completed event takes precedence; one headline for a busy week.
    byevent={e['id']:e for e in s['calendar']}; priority={'WC':8,'FINALS':7,'1000':6,'750':5,'500':4,'300':3,'100':2}
    finals=[m for m in finals if m['event_id'] in byevent]
    headline=None
    if finals:
        m=max(finals,key=lambda x:(priority.get(byevent[x['event_id']]['level'],0),x['date'],x['serial'])); e=byevent[m['event_id']];runner=m['b'] if m['a']==m['winner'] else m['a'];score='、'.join(f'{g[0]}:{g[1]}' if m['winner']==m['a'] else f'{g[1]}:{g[0]}' for g in m.get('history',[]))
        personal=personal or p['id'] in (m['a'],m['b'])
        lines.append(f"赛场焦点：{named(s,m['winner'])}在{e['name']}决赛击败{named(s,runner)}（{score}），夺得冠军。");headline=e['id']
        if title=='巡回赛周报':title=f'{e["name"]} · {named(s,m["winner"])}夺冠'
    if not finals:
        surprises=[]
        for m in recent:
            ca=m.get('development_CA',[])
            if m.get('outcome')!='played' or m.get('winner') not in (m.get('a'),m.get('b')) or len(ca)!=2 or None in ca:continue
            i=int(m['winner']==m['b']);gap=ca[1-i]-ca[i]
            if gap>=6 and m['event_id'] in byevent:surprises.append((gap,m))
        if surprises:
            _,m=max(surprises,key=lambda x:x[0]);e=byevent[m['event_id']];loser=m['b'] if m['winner']==m['a'] else m['a']
            personal=personal or p['id'] in (m['a'],m['b'])
            lines.append(f"赛场冷门：{named(s,m['winner'])}在{e['name']}击败实力占优的{named(s,loser)}。");headline=e['id']
            if title=='巡回赛周报':title=f'赛场冷门 · {named(s,m["winner"])}突围'
    wins=p['career_stats']['wins']+p['season_stats']['wins']
    if wins//10>n['last_wins']//10:
        personal=True
        lines.append(f"生涯里程碑：累计 {wins} 场胜利。")
        if title=='巡回赛周报':title=f'生涯里程碑 · {wins} 胜'
    # Quiet weeks stay quiet, except for occasional useful editorial advice.
    if not lines and (now.toordinal()//7)%3==0:
        tips=['连续参赛会增加长期负荷；适时休赛有助于维持竞技状态。','赛前可对照对手的长短回合胜率与场区占位，选择合适的比赛节奏。','S300资格赛提供向高级别赛事迈进的机会，参赛计划中可查看报名安排。']
        lines=[tips[(now.toordinal()//21)%len(tips)]];title='巡回赛手记'
    if lines:send(s,'week:'+s['date'],'news',title,'\n'.join(lines),'SMASH 体育编辑部',headline,personal=personal)
    n.update(last_week=s['date'],match_cursor=len(s['matches']),rank=newrank,leader=leader['id'],last_wins=wins)

def season(s,retired,newcomers):
    p=own(s)
    if not p:return
    if p['id'] in retired:
        send(s,'retire:'+str(s['season_year']),'career','告别赛场 · 职业生涯落幕',f"{named(s,p['id'])} 正式结束职业生涯。生涯最佳世界排名第 {p['career_stats']['best_rank']} 位，累计 {p['career_stats']['titles']} 座冠军。",'球员服务中心',subject_id=p['id'])
        return
    parts=[f"新赛季正式开启，本年度有 {len(newcomers)} 名青年球员进入巡回赛，{len(retired)} 名球员结束职业生涯。"]
    if retired:parts.append('告别赛场：'+'、'.join(named(s,i) for i in retired[:3])+'。')
    if newcomers:parts.append('新秀关注：'+'、'.join(named(s,i) for i in newcomers[:3])+'。')
    send(s,'season:'+str(s['season_year']),'news','新赛季 · 巡回赛阵容更新','\n'.join(parts),'SMASH 体育编辑部')
