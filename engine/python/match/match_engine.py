"""SMASH 7.1-mens-singles: alternating abstract strokes, causal scoring.
Only attributes, fatigue, injury and seeded stochastic state drive play.
CA a/b in snapshots is derived metadata for the career module.
No manual tactics, club ownership, rank or potential enters the match.
"""
import math, json
from dataclasses import dataclass, field
from engine import Match, clip
from legacy_rally import ATTR
from attributes import ability
from season import seed
VERSION='7.1-mens-singles'
# Calibratable coefficients, not measured physical constants.
SENS=.0075
ACTIONS=('attack','net','control','defense')
# stroke execution, opponent response (convex weighted attributes)
EXEC={
 'attack':(('杀球进攻',.55),('爆发力',.23),('后场技术',.22)),
 'net':(('网前技术',.60),('灵活性',.25),('判断与预判',.15)),
 'control':(('拉吊控球',.54),('后场技术',.25),('击球稳定性',.13),('判断与预判',.08)),
 'defense':(('防守能力',.48),('移动速度',.25),('判断与预判',.27)),
 'serve':(('网前技术',.35),('击球稳定性',.45),('专注度',.20)),
 'receive':(('接发球',.55),('判断与预判',.25),('网前技术',.20))}
RESP={
 'attack':(('防守能力',.48),('移动速度',.32),('判断与预判',.20)),
 'net':(('网前技术',.36),('灵活性',.37),('判断与预判',.27)),
 'control':(('拉吊控球',.28),('移动速度',.30),('后场技术',.22),('判断与预判',.20)),
 'defense':(('后场技术',.35),('移动速度',.30),('判断与预判',.35)),
 'serve':(('接发球',.60),('网前技术',.25),('判断与预判',.15)),
 'receive':(('网前技术',.30),('防守能力',.40),('移动速度',.30))}
BASE_DIRECT={'attack':.115,'net':.069,'control':.032,'defense':.025,'serve':.001,'receive':.026}
BASE_ERROR={'attack':.055,'net':.038,'control':.014,'defense':.019,'serve':.008,'receive':.023}
COST={'attack':1.75,'net':1.05,'control':.90,'defense':1.45,'serve':.25,'receive':.75}
PRESS={'attack':.66,'net':.46,'control':.33,'defense':-.08,'serve':-.22,'receive':.16}
def weighted(p,spec):return sum(p[k]*v for k,v in spec)
def logistic(x):return 1/(1+math.exp(-clip(x,-40,40)))
def odds(p):return math.log(p/(1-p))
DIRECT_LOG={k:odds(v) for k,v in BASE_DIRECT.items()}
ERROR_LOG={k:odds(v) for k,v in BASE_ERROR.items()}

def pick(r,weights):
    u=r.random()*sum(weights)
    for k,w in zip(ACTIONS,weights):
        u-=w
        if u<0:return k
    return ACTIONS[-1]


STYLE_MAP={'attack':'进攻','power':'重炮','speed':'突击','control':'拉吊','defense':'耐力','counter':'防反','net':'网前','allround':'均衡'}
def style_for(p):
    tag=p.get('synthetic_archetype')
    if tag in STYLE_MAP:return STYLE_MAP[tag]
    attrs=p.get('attributes',p)
    group={k:weighted(attrs,EXEC[k]) for k in ACTIONS}
    best=max(group,key=group.get)
    if group[best]-sum(group.values())/4<3:return '均衡'
    return {'attack':'进攻','net':'网前','control':'拉吊','defense':'防反'}[best]

@dataclass
class AttributeMatch(Match):
    target:int=15
    cap:int=21
    interval:int=8
    engine_version:str=VERSION
    profiles:list=field(default_factory=list)
    carry:list=field(default_factory=list)
    strain:list=field(default_factory=lambda:[0.,0.])
    server:int=-1
    ends:int=-1
    chronic:list=field(default_factory=lambda:[0.,0.])
    day_form:list=field(default_factory=lambda:[0.,0.])
    work:list=field(default_factory=lambda:[0.,0.])
    # Compatibility labels only; no effect on any probability.
    tactics_names:list=field(default_factory=lambda:['attribute','attribute'])
    spatial:bool=False
    spatial_detail:bool=False
    styles:list=field(default_factory=list)
    tactical_memory:list=field(default_factory=lambda:[[],[]])
    tactical_state:list=field(default_factory=lambda:[{},{}])
    body_profiles:list=field(default_factory=list)
    def __post_init__(self):
        if self.engine_version!=VERSION or len(self.profiles)!=2 or any(set(p)!=set(ATTR) or any(type(v) not in (int,float) or not 35<=v<=99 for v in p.values()) for p in self.profiles):raise ValueError('invalid attribute profiles')
        if (self.target,self.cap,self.interval)!=(15,21,8):raise ValueError('all V7.1 matches must use 3x15, cap 21, interval 8')
        self.a,self.b=map(ability,self.profiles)  # display/record only
        self.endurance=[p['体能耐力'] for p in self.profiles] # metadata only
        initial=not self.form
        super().__post_init__()
        if initial:
            for i,p in enumerate(self.profiles):
                self.form[i]=clip(self.rng.gauss(0,3.6*clip(1-(p['击球稳定性']-85)*.018,.65,1.5)),-9,9)
        if not self.carry:self.carry=self.fatigue.copy()
        if self.ends==-1:self.ends=self.rng.randrange(2)
        self._sync_fatigue()
        if self.server==-1:self.server=self.rng.randrange(2)
    def set_tactic(self,*args):raise ValueError('manual tactics disabled in attribute engine')
    def _sync_fatigue(self):
        self.fatigue=[self.strain[i]+self.carry[i]+.35*self.chronic[i] for i in range(2)]
    def _recover(self,seconds):
        for i,p in enumerate(self.profiles):
            rec=clip(1+.010*(p['身体素质']-85)+.011*(p['体能耐力']-85),.55,1.4)
            self.strain[i]*=math.exp(-seconds*rec/32)
            self.carry[i]*=math.exp(-seconds*rec/5500)
        self._sync_fatigue()
    def _load(self,i,cost):
        p=self.profiles[i];scale=clip((85/p['体能耐力'])**.95,.72,1.65)*clip(1-(p['身体素质']-85)*.008,.78,1.35)
        self.strain[i]+=cost*.145*scale
        self.carry[i]+=cost*.012*scale
        self.work[i]+=cost
    def _critical(self):
        # Close late points, game points, or match points; no automatic comeback bonus.
        a,b=self.score
        return max(a,b)>=12 and (abs(a-b)<=3 or max(a,b)>=14)
    def point(self):
        if max(self.games)>=2:raise ValueError('match finished')
        if self.spatial:return self.spatial_point()
        from calibrated_fast import point
        return point(self)
    def legacy_point(self):
        r=self.rng;key=self._critical()
        ex=[];df=[];errors=[];skill=[]
        for i,p in enumerate(self.profiles):
            self.short[i]=.88*self.short[i]+r.gauss(0,.24*clip(1-(p['专注度']-85)*.023,.55,1.5))
            f=self.fatigue[i]
            # Attribute-specific fatigue and a bounded match form; no CA offset.
            common=self.form[i]+self.day_form[i]+clip(self.short[i],-3,3)-self.injury[i]-.26*f
            common+=(p['抗压能力']-85)*.48 if key else 0
            x={k:v+common for k,v in p.items()}
            for k,m in (('爆发力',.9),('移动速度',.75),('灵活性',.45),('击球稳定性',.40),('判断与预判',.28)):
                x[k]-=m*f
            ex.append({k:weighted(x,v) for k,v in EXEC.items()});df.append({k:weighted(x,v) for k,v in RESP.items()})
            errors.append(.008*(x['击球稳定性']-85)+.004*(x['专注度']-85))
            skill.append(x)
        actor=self.server;server=actor;court='right' if self.score[server]%2==0 else 'left';ends_before=self.ends;pressure=0.;counts=[0,0];trace=[];base_f=self.fatigue.copy();rally_peak=self.fatigue.copy()
        for shots in range(1,121):
            i=actor;j=1-i; x=skill[i]
            if shots==1:action='serve'
            elif shots==2:action='receive'
            else:
                # Preference from relative skills and opponent matchup; incoming pressure restricts attack.
                avg=sum(ex[i][k] for k in ACTIONS)/4
                awareness=clip((x['战术意识']-35)/64,0,1)
                weights=[]
                for k,base in zip(ACTIONS,(1.04,.72,1.60,.68)):
                    rel=(ex[i][k]-avg)*.032 + awareness*.022*(ex[i][k]-df[j][k])
                    situ={'attack':-1.3*pressure,'net':-.40*pressure,'control':-.08*pressure,'defense':1.55*pressure}[k]*(.6+.8*awareness)
                    weights.append(base*math.exp(clip(rel+situ,-5,5)))
                action=pick(r,weights)
            # Increment fatigue every stroke, including receiver's movement; pressure costs more.
            self._load(i,COST[action]*(1+.20*max(0,pressure)));self._load(j,.22+.20*max(0,pressure));self._sync_fatigue()
            delta=[self.fatigue[k]-base_f[k] for k in range(2)]
            rally_peak=[max(rally_peak[k],self.fatigue[k]) for k in range(2)]
            if action in ('attack','net'):counts[i]+=1
            # First determine whether THIS striker executes successfully.
            # Incoming pressure creates forced errors; intrinsic errors remain unforced.
            uerr=logistic(ERROR_LOG[action]-errors[i]+.0025*(85-ex[i][action])+.025*self.injury[i]+.022*delta[i])
            forced=clip((.018+.075*max(0,pressure)+.025*max(0,pressure)**2)*math.exp(-.0065*(x['防守能力']-85)-.0055*(x['移动速度']-85)-.0025*(x['判断与预判']-85)+.028*delta[i]),.008,.45) if shots>1 else 0.
            u=r.random(); diff=ex[i][action]-df[j][action]-.85*delta[i]+.85*delta[j]
            if u<uerr:
                winner=j;terminal='unforced_error';trace.append([i,action,'unforced_error']);break
            if u<uerr+(1-uerr)*forced:
                winner=j;terminal='forced_error';trace.append([i,action,'forced_error']);break
            # Successful stroke either beats receiver directly or creates next-shot pressure.
            direct=logistic(DIRECT_LOG[action]+(SENS if action in ('attack','net') else .0045)*diff-.40*max(0,pressure))
            if r.random()<direct:
                winner=i;terminal='winner';trace.append([i,action,'winner']);break
            # The receiving player now hits. Poorly executed shots reduce pressure.
            new_pressure=clip(PRESS[action]+.0055*diff-.48*pressure+r.gauss(0,.55),-1.5,2.3)
            trace.append([i,action,'return']);pressure=new_pressure;actor=j
            # Very long rallies are naturally ended by growing execution pressure;
            # a 120-stroke safety guard uses a final actual striker error, not a winner lottery.
            if shots==120:
                winner=j;terminal='unforced_error';trace[-1]=[i,action,'length_guard_error'];break
        # Typical between-rally recovery, plus regulation intervals. No recovery after final point.
        w=winner;self.server=w;self.score[w]+=1;score=self.score.copy();event='point';changed_ends=False
        if max(score)==self.cap or (max(score)>=self.target and abs(score[0]-score[1])>=2):
            self.games[w]+=1;self.history.append(score);self.score=[0,0];self.interval_done=False
            event='match' if max(self.games)==2 else 'game'
            if event=='game':self.ends=1-self.ends;changed_ends=True;self._recover(120)
        elif max(score)==self.interval and not self.interval_done:
            self.interval_done=True;self._recover(60);event='interval'
            if len(self.history)==2:self.ends=1-self.ends;changed_ends=True
        else:self._recover(21.43)
        last_actor,last_action,_=trace[-1];winning_action=last_action if terminal=='winner' else (trace[-2][1] if len(trace)>1 else 'serve')
        kind=({'attack':'attack','net':'net','defense':'counter'}.get(winning_action,'control'))
        if kind!='control':kind+='_'+('a' if w==0 else 'b')
        self.log.append(dict(game=len(self.history) if event in ('game','match') else len(self.history)+1,score=score,winner=w,event=event,shots=shots,rally_type=kind,terminal=terminal,error_side=None if terminal=='winner' else last_actor,server=server,service_court=court,next_server=w,service_over=w!=server,ends_before=ends_before,ends_after=self.ends,changed_ends=changed_ends,rally_peak=rally_peak,acute=self.strain.copy(),residual=self.carry.copy(),day_form=self.day_form.copy(),match_form=self.form.copy(),initiative=counts,stroke_trace=trace,terminal_actor=last_actor,terminal_action=last_action,fatigue=self.fatigue.copy(),tactics=self.tactics_names.copy(),key_point=key))
        return event

    def spatial_point(self):
        from js import spatialPoint
        key=self._critical(); server=self.server; ends_before=self.ends; base_f=self.fatigue.copy(); peak=base_f.copy()
        players=[]
        for i,p in enumerate(self.profiles):
            self.short[i]=.88*self.short[i]+self.rng.gauss(0,.24*clip(1-(p['专注度']-85)*.023,.55,1.5))
            common=self.form[i]+self.day_form[i]+clip(self.short[i],-3,3)-self.injury[i]
            if key:common+=(p['抗压能力']-85)*.48
            # Compress attribute differences moderately, retain individual strengths and daily form.
            attrs={k:clip(85+(v-85)*0.70+common*0.70,35,99) for k,v in p.items()}
            players.append({'name':str(i),'style':self.styles[i] if len(self.styles)==2 else style_for(p),'attrs':attrs,'raw':p,**(self.body_profiles[i] if len(self.body_profiles)==2 else {})})
            plan=getattr(self,'coach_plans',{}).get(str(i))
            if plan:players[-1]['coach']=plan
        x=dict(players=players,seed=self.rng.getrandbits(32),score=self.score,games=self.games,history=self.history,ends=self.ends,server=self.server,interval_done=self.interval_done,fatigue=[clip(f*1.8*0.42,0,70) for f in base_f],strain=self.strain,carry=self.carry,chronic=self.chronic,total=len(self.log),detail=self.spatial_detail,key_point=key,tacticalMemory=self.tactical_memory,tacticalState=self.tactical_state)
        rally=json.loads(spatialPoint(json.dumps(x,ensure_ascii=False)))
        mapping={'short':'serve','long':'serve','clear':'control','punch':'control','drop':'control','smash':'attack','half':'attack','drive':'attack','net':'net','kill':'net','lift':'defense','block':'defense'}
        trace=[];counts=[0,0]; w=rally['winner']; last=rally['events'][-1]
        terminal=last.get('terminal') or ('winner' if last['outcome']=='winner' else 'forced_error' if last['forcedError'] else 'unforced_error')
        receiver_error=bool(last.get('receiverError'))
        for n,e in enumerate(rally['events']):
            i=e['actor']; k=mapping[e['kind']]; k='receive' if n==1 else k
            trace.append([i,k,terminal if n==len(rally['events'])-1 and not receiver_error else 'return'])
            if k in ('attack','net'):counts[i]+=1
            for j,cost in enumerate(e['costs']):self.work[j]+=cost
            peak=[max(peak[j],e['fatigue'][j]/.756) for j in range(2)]
        self.strain=rally['strain'];self.carry=rally['carry'];self._sync_fatigue()
        self.server=w; self.score[w]+=1; score=self.score.copy(); event='point';changed_ends=False
        if max(score)==self.cap or (max(score)>=self.target and abs(score[0]-score[1])>=2):
            self.games[w]+=1;self.history.append(score);self.score=[0,0];self.interval_done=False
            event='match' if max(self.games)==2 else 'game'
            if event=='game':self.ends=1-self.ends;changed_ends=True
        elif max(score)==self.interval and not self.interval_done:
            self.interval_done=True;event='interval'
            if len(self.history)==2:self.ends=1-self.ends;changed_ends=True
        last_actor,last_action,_=trace[-1];winning_action=last_action if terminal=='winner' or receiver_error else (trace[-2][1] if len(trace)>1 else 'serve')
        kind={'attack':'attack','net':'net','defense':'counter'}.get(winning_action,'control')
        if kind!='control':kind+='_'+('a' if w==0 else 'b')
        row=dict(game=rally['game'],score=score,winner=w,event=event,shots=len(trace),rally_type=kind,terminal=terminal,error_side=None if terminal=='winner' else 1-w,server=server,service_court='right' if rally['scoreBefore'][server]%2==0 else 'left',next_server=w,service_over=w!=server,ends_before=ends_before,ends_after=self.ends,changed_ends=changed_ends,rally_peak=peak,acute=self.strain.copy(),residual=self.carry.copy(),day_form=self.day_form.copy(),match_form=self.form.copy(),initiative=counts,stroke_trace=trace,terminal_actor=last_actor,terminal_action=last_action,fatigue=self.fatigue.copy(),tactics=self.tactics_names.copy(),key_point=key,shot_types=[e['kind'] for e in rally['events']],duration=rally['duration'],distance=[sum(e['distances'][j] for e in rally['events']) for j in range(2)])
        if getattr(self,'coach_plans',None):row['coach_plans']=self.coach_plans.copy()
        self.tactical_memory=rally.pop('tacticalMemory',[[],[]])
        self.tactical_state=rally.pop('tacticalState',[{},{}])
        row['tactical_state']=self.tactical_state
        if self.spatial_detail:row['spatial']=rally
        self.log.append(row);return event

def start_match_v71(s,event_id,a,b,stage,serial,fast=False):
    p,q=[next(x for x in s['players'] if x['id']==i) for i in (a,b)]
    return AttributeMatch(0,0,seed(s['world_seed'],event_id,stage,serial,a,b),spatial=not fast,body_profiles=[{k:x.get(k) for k in ('height_cm','handedness')} for x in (p,q)],styles=[style_for(x) for x in (p,q)],spatial_detail=not fast and bool({a,b}&set(s['club']['roster'])),profiles=[dict(x['attributes']) for x in (p,q)],fatigue=[x['fitness']['residual'] for x in (p,q)],carry=[x['fitness']['residual'] for x in (p,q)],chronic=[x['fitness']['chronic'] for x in (p,q)],day_form=[x['fitness']['form'] for x in (p,q)],injury=[x['fitness']['injury_penalty'] for x in (p,q)])
def restore_match(snapshot):
    if snapshot.get('engine_version')!=VERSION:raise ValueError('finish legacy active match in original engine; new career required')
    return AttributeMatch(**snapshot)

def match_statistics(log):
    from legacy_match import match_statistics as base
    stats=base(log)
    if stats is None:return None
    for i,s in enumerate(stats['sides']):
        actions={k:dict(attempts=0,winners=0,forced_errors=0,unforced_errors=0) for k in EXEC}
        for row in log:
            for actor,k,outcome in row['stroke_trace']:
                if actor==i:
                    actions[k]['attempts']+=1
                    if outcome in ('winner','forced_error','unforced_error','length_guard_error'):
                        actions[k][{'winner':'winners','forced_error':'forced_errors','unforced_error':'unforced_errors','length_guard_error':'unforced_errors'}[outcome]]+=1
        s['actions']=actions
    return stats
