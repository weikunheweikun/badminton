"""Compact per-match aggregates. No invented trajectory or technical data."""
import math
from bisect import bisect_right

COLS, DEPTHS=6,8

def clamp(x,a,b): return max(a,min(b,x))
def xy(p): return p['x'],p['y']
def position(plan,t):
    model=plan.get('model')
    if model==5:
        nodes=plan['nodes'];t=clamp(t,0,nodes[-1][0]);i=max(0,min(len(nodes)-2,bisect_right(nodes,t,key=lambda n:n[0])-1));a,b=nodes[i],nodes[min(i+1,len(nodes)-1)];h=b[0]-a[0];k=clamp((t-a[0])/h,0,1) if h else 0
        if plan.get('smooth') and h:
            return tuple((2*k**3-3*k*k+1)*a[j]+(k**3-2*k*k+k)*a[j+2]*h+(-2*k**3+3*k*k)*b[j]+(k**3-k*k)*b[j+2]*h for j in (1,2))
        return tuple(a[j]+(b[j]-a[j])*k for j in (1,2))
    if model==4:
        start=xy(plan['from']);origin=xy(plan['origin']);dest=xy(plan['to']);t=max(0,t);stop=plan['stop'];delay=plan['delay'];s=plan['shape'];scale=plan['scale']
        if t<stop:
            v=xy(plan['initial']);return tuple(start[j]+v[j]*(t-t*t/(2*stop)) for j in (0,1))
        d=math.dist(origin,dest)
        if t<=delay or not d:return origin
        u=clamp((t-delay)/scale,0,s['total']);peak,ramp,cruise,dec=(s[k] for k in ('peak','ramp','cruise','dec'));acc=peak/ramp if ramp else 0
        if u<ramp:x=.5*acc*u*u
        elif u<ramp+cruise:x=.5*peak*ramp+peak*(u-ramp)
        else:
            z=u-ramp-cruise;br=peak*(1-s['exit'])/dec if dec else 0;x=.5*peak*ramp+peak*cruise+peak*z-.5*br*z*z
        k=clamp(x/d,0,1);return tuple(origin[j]+(dest[j]-origin[j])*k for j in (0,1))
    # Earlier archived movement model.
    a,b=xy(plan['from']),xy(plan['to']);d=math.dist(a,b)
    if not d:return a
    m=plan['mob'];brake=m.get('brake',1)/m.get('brakeScale',1);peak=min(m['v'],math.sqrt(2*d*m['acc']/(1+brake)));ramp=peak/m['acc'];cruise=max(0,(d-.5*peak*ramp*(1+brake))/peak);t=clamp(t-plan['delay'],0,(1+brake)*ramp+cruise)
    if t<ramp:x=.5*m['acc']*t*t
    elif t<ramp+cruise:x=.5*m['acc']*ramp*ramp+peak*(t-ramp)
    else:
        u=t-ramp-cruise;x=.5*peak*ramp+peak*cruise+peak*u-.5*peak/max(1e-9,brake*ramp)*u*u
    k=clamp(x/d,0,1);return tuple(a[j]+(b[j]-a[j])*k for j in (0,1))

def cell(side,p):
    x,y=p;d=6.7-x if side==0 else x-6.7;y=y if side==0 else -y
    if not math.isfinite(d+y) or not 0<=d<=6.7 or abs(y)>2.59:return None
    return min(DEPTHS-1,int(d/6.7*DEPTHS))*COLS+min(COLS-1,int((y+2.59)/5.18*COLS))

COUNTS=('points','winners','forced','errors','serve_won','serve_played','receive_won','receive_played','short_won','short_played','long_won','long_played','shots','tech_points','spatial_points','distance_points','distance','sample_matches','spatial_matches')
def empty():return {**dict.fromkeys(COUNTS,0),'land':[0]*48,'move':[0]*48}

def summarize(log):
    sides=[empty(),empty()]
    for row in log:
        w=row.get('winner')
        if w not in (0,1):continue
        for i,s in enumerate(sides):
            won=int(w==i);s['tech_points']+=1;s['points']+=won;s['shots']+=row.get('shots',0)
            term=row.get('terminal');s['winners']+=int(won and term=='winner');s['forced']+=int(not won and term=='forced_error');s['errors']+=int(not won and term=='unforced_error')
            for key,ok in [('serve',row.get('server')==i),('receive',row.get('server')==1-i),('short',row.get('shots',0)<=6),('long',row.get('shots',0)>=13)]:
                if ok:s[key+'_played']+=1;s[key+'_won']+=won
            ds=row.get('distance') or []
            if len(ds)>i and isinstance(ds[i],(int,float)) and math.isfinite(ds[i]):s['distance']+=ds[i];s['distance_points']+=1
        r=row.get('spatial') or {};events=r.get('events') or [];ends=r.get('ends')
        if not events or ends not in (0,1):continue
        for s in sides:s['spatial_points']+=1
        e=events[-1]
        if row.get('terminal')=='winner' and e.get('actor')==w and e.get('outcome')=='winner' and e.get('landing'):
            k=cell((w^1)^ends,xy(e['landing']))
            if k is not None:sides[w]['land'][k]+=1
        for e in events:
            duration=e.get('duration',0)
            if not isinstance(duration,(int,float)) or not math.isfinite(duration) or duration<=0:continue
            steps=max(1,math.ceil(duration/.12));dt=duration/steps
            for i,plan in enumerate((e.get('plans') or [])[:2]):
                if not plan:continue
                for k in range(steps):
                    try:j=cell(i^ends,position(plan,(k+.5)*dt))
                    except (KeyError,ValueError,TypeError,ZeroDivisionError,IndexError):continue
                    if j is not None:sides[i]['move'][j]+=dt
    for s in sides:
        s['sample_matches']=int(s['tech_points']>0);s['spatial_matches']=int(s['spatial_points']>0);s['distance']=round(s['distance'],2);s['move']=[round(v,3) for v in s['move']]
    return sides

def archive(rec):
    if 'analytics_v153' in rec:return
    if rec.get('log'):
        rec['analytics_v153']=summarize(rec['log']);return
    stats=rec.get('statistics') or {};ss=stats.get('sides') or []
    if len(ss)!=2:return
    sides=[empty(),empty()]
    for i,(s,old) in enumerate(zip(sides,ss)):
        n=stats.get('total_points',0);s.update(tech_points=n,sample_matches=int(n>0),shots=round(stats.get('mean_shots',0)*n),points=old.get('points',0),winners=old.get('winners',0),forced=old.get('forced_errors',0),errors=old.get('unforced_errors',0))
        for k in ('serve','short','long'):
            for v in ('won','played'):s[k+'_'+v]=old.get(k+'_'+v,0)
        s['receive_played']=ss[i^1].get('serve_played',0);s['receive_won']=s['receive_played']-ss[i^1].get('serve_won',0)
    rec['analytics_v153']=sides

def player_report(state,pid,limit=None):
    rows=[r for r in reversed(state['matches']) if pid in (r.get('a'),r.get('b')) and r.get('outcome')=='played']
    if limit is not None:rows=rows[:limit]
    out=empty();out.update(matches=len(rows),match_wins=sum(r.get('winner')==pid for r in rows),cols=COLS,depths=DEPTHS)
    for r in rows:
        data=r.get('analytics_v153')
        if not data:continue
        s=data[0 if r['a']==pid else 1]
        for k in COUNTS:out[k]+=s.get(k,0)
        for k in ('land','move'):out[k]=[a+b for a,b in zip(out[k],s[k])]
    out['distance']=round(out['distance'],2);out['move']=[round(v,3) for v in out['move']]
    return out
