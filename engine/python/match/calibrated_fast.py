"""V15.1 spatial-engine surrogate (simulation-calibrated, not real-match data).
No rank, CA, name or ownership enters the model. No trajectory is fabricated.
"""
import math
from engine import clip
from calibrated_data import FEATURE_KEYS, COEFFICIENTS, BODY_COEFFICIENTS, BODY_TEMPLATES
MAP={'short':'serve','long':'serve','clear':'control','punch':'control','drop':'control','smash':'attack','half':'attack','drive':'attack','net':'net','kill':'net','lift':'defense','block':'defense'}
def features(profiles,form,fatigue,server):
    return [(profiles[0][k]-profiles[1][k])/10 for k in FEATURE_KEYS]+[(form[0]-form[1])/5,(fatigue[1]-fatigue[0])/10,1 if server==0 else -1]
def bodies(body_profiles):
    out=[]
    for p in body_profiles if isinstance(body_profiles,list) and len(body_profiles)==2 else [{},{}]:
        p=p if isinstance(p,dict) else {};h=p.get('height_cm')
        out.append((float(h) if isinstance(h,(float,int)) and 140<=h<=200 else 167.,-1 if p.get('handedness')=='left' else 1))
    return out

def body_features(body_profiles,server,score):
    b=bodies(body_profiles);sign=1 if server==0 else -1;par=1 if score[server]%2==0 else -1
    return [(b[0][0]-b[1][0])/10,sign*int(b[0][1]!=b[1][1]),sign*par*b[1-server][1],sign*par*b[server][1]]

def probability(profiles,form,fatigue,server,body_profiles=None,score=None):
    f=features(profiles,form,fatigue,server);z=sum(a*b for a,b in zip(f,COEFFICIENTS))
    z+=sum(a*b for a,b in zip(body_features(body_profiles,server,score or [0,0]),BODY_COEFFICIENTS))
    return 1/(1+math.exp(-clip(z,-8,8)))

# Conditional on actual simulated winner, stage, handedness, relative skills,
# absolute skill, form and fatigue. Sparse cells fall back without changing winner.
BODY_POOLS={}
for stage in range(2):
    for mixed in range(2):
        for side in range(2):
            pool=BODY_TEMPLATES[stage][mixed][side]
            if len(pool)<24:pool=BODY_TEMPLATES[stage][0][side]+BODY_TEMPLATES[stage][1][side]
            if not pool:pool=[t for st in BODY_TEMPLATES for hand in st for t in hand[side]]
            BODY_POOLS[stage,mixed,side]=pool

def template(r,m,server,w,form,base):
    other=1-server;body=bodies(m.body_profiles);mixed=int(body[0][1]!=body[1][1]);stage=int(len(m.log)>=4);side=int(w!=server)
    v=features([m.profiles[server],m.profiles[other]],[0,0],[0,0],0)[:len(FEATURE_KEYS)]
    mean=sum(m.profiles[i][k] for i in (0,1) for k in FEATURE_KEYS)/32
    hs=[body[server][0],body[other][0]];fs=[base[server],base[other]];df=(form[server]-form[other])/5
    pool=BODY_POOLS[stage,mixed,side]
    def distance(t):
        delta=sum((a-b)**2 for a,b in zip(v,t[6]))/16
        gap=(sum(v)-sum(t[6]))/16
        return .85*delta+.8*gap*gap+.18*sum(((a-b)/10)**2 for a,b in zip(hs,t[7]))+.22*((mean-t[8])/10)**2+.10*sum(((a-b)/10)**2 for a,b in zip(fs,t[9]))+.18*(df-t[10])**2
    candidates=r.sample(pool,min(28,len(pool)));ds=[distance(t) for t in candidates];dmin=min(ds)
    weights=[math.exp(-min(30,(d-dmin)/.48)) for d in ds]
    return r.choices(candidates,weights=weights,k=1)[0]
def point(m):
    r=m.rng;key=m._critical();server=m.server;ends_before=m.ends;form=[];base=m.fatigue.copy();peak=base.copy()
    for i,p in enumerate(m.profiles):
        m.short[i]=.88*m.short[i]+r.gauss(0,.24*clip(1-(p['专注度']-85)*.023,.55,1.5))
        form.append(m.form[i]+m.day_form[i]+clip(m.short[i],-3,3)-m.injury[i]+((p['抗压能力']-85)*.48 if key else 0))
    w=int(r.random()>=probability(m.profiles,form,base,server,m.body_profiles,m.score))
    # Sample a spatial-engine rally conditional on who won and who served;
    # choose from a few candidates by similarity of relative attributes (no player identity).
    t=template(r,m,server,w,form,base)
    types,terminal,receiver_error,cost,dist,duration,_=t[:7]
    trace=[];counts=[0,0]
    for n,k in enumerate(types):
        actor=server^(n%2);action='receive' if n==1 else MAP[k];counts[actor]+=int(action in ('attack','net'))
        trace.append([actor,action,terminal if n==len(types)-1 and not receiver_error else 'return'])
    distance=[0.,0.]
    for j,i in enumerate((server,1-server)):
        m._load(i,cost[j]);distance[i]=dist[j]
    m._sync_fatigue();peak=[max(base[i],m.fatigue[i]) for i in range(2)]
    m.server=w;m.score[w]+=1;score=m.score.copy();event='point';changed=False
    if max(score)==m.cap or (max(score)>=m.target and abs(score[0]-score[1])>=2):
        m.games[w]+=1;m.history.append(score);m.score=[0,0];m.interval_done=False
        event='match' if max(m.games)==2 else 'game'
        if event=='game':m.ends=1-m.ends;changed=True;m._recover(120)
    elif max(score)==m.interval and not m.interval_done:
        m.interval_done=True;m._recover(60);event='interval'
        if len(m.history)==2:m.ends=1-m.ends;changed=True
    else:m._recover(21.43)
    last_actor,last_action,_=trace[-1];winning_action=last_action if terminal=='winner' or receiver_error else (trace[-2][1] if len(trace)>1 else 'serve')
    kind={'attack':'attack','net':'net','defense':'counter'}.get(winning_action,'control')
    if kind!='control':kind+='_'+('a' if w==0 else 'b')
    m.log.append(dict(game=len(m.history) if event in ('game','match') else len(m.history)+1,score=score,winner=w,event=event,shots=len(trace),rally_type=kind,terminal=terminal,error_side=None if terminal=='winner' else 1-w,server=server,service_court='right' if (score[server]-int(w==server))%2==0 else 'left',next_server=w,service_over=w!=server,ends_before=ends_before,ends_after=m.ends,changed_ends=changed,rally_peak=peak,acute=m.strain.copy(),residual=m.carry.copy(),day_form=m.day_form.copy(),match_form=m.form.copy(),initiative=counts,stroke_trace=trace,terminal_actor=last_actor,terminal_action=last_action,fatigue=m.fatigue.copy(),tactics=m.tactics_names.copy(),key_point=key,shot_types=types,distance=distance,duration=duration))
    return event
