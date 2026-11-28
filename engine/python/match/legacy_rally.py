"""SMASH V5.0 candidate: versioned rally-level simulation; stdlib only.
Legacy engine.py is an immutable dependency. No career I/O or global RNG.
"""
import math
from dataclasses import dataclass, field
from engine import Match, clip
from season import seed
VERSION='5.0.1'
TACTICS=('balanced','attack','control','net','counter')
ATTR=('杀球进攻','网前技术','拉吊控球','防守能力','后场技术','接发球','击球稳定性','移动速度','爆发力','体能耐力','灵活性','身体素质','战术意识','判断与预判','抗压能力','专注度')
# Ordered categories: neutral, directed attack/net/counter, control.
KINDS=('neutral','attack_a','attack_b','net_a','net_b','counter_a','counter_b','control')
# Each tuple contains the actor's skill index & weight, then opposing response.
ATTACK=(((0,.5),(8,.25),(4,.25)),((3,.5),(7,.3),(13,.2)))
NET=(((1,.5),(5,.25),(10,.25)),((1,.35),(5,.35),(10,.3)))
COUNTER=(((3,.4),(13,.35),(7,.25)),((0,.4),(8,.3),(4,.3)))
CONTROL=((2,.35),(6,.25),(9,.15),(13,.15),(12,.1))
LENGTHS=((4,7,10,13),(3,5,8,12),(3,5,8,12),(3,5,7,10),(3,5,7,10),(5,8,12,16),(5,8,12,16),(10,16,23,33))
INTENSITY=(1.,1.22,1.22,.85,.85,1.05,1.05,1.05)
# Baseline mixes per side; all are positive and are normalized at draw time.
MULT={'balanced':(1.,1.,1.,1.),'attack':(2.1,.85,.75,.72),'control':(.68,.9,.95,2.25),'net':(.85,2.15,.8,.72),'counter':(.65,.85,2.15,1.05)}
RISK={'balanced':0.,'attack':.0035,'control':-.001,'net':.003,'counter':-.001}

def weighted(a, spec): return sum(a[i]*w for i,w in spec)
def bounded(x): return 6.0*math.tanh(x/9.0)

@dataclass
class RallyMatch(Match):
    engine_version: str=VERSION
    profiles: list=field(default_factory=list)
    tactics_names: list=field(default_factory=lambda:['balanced','balanced'])
    carry: list=field(default_factory=list)
    strain: list=field(default_factory=lambda:[0.,0.])
    tactic_history: list=field(default_factory=list)
    def __post_init__(self):
        if self.engine_version!=VERSION: raise ValueError('unsupported V5 snapshot')
        if len(self.profiles)!=2 or any(set(x)!=set(ATTR) for x in self.profiles): raise ValueError('two full public attribute profiles required')
        if len(self.tactics_names)!=2 or any(x not in TACTICS for x in self.tactics_names): raise ValueError('invalid tactics')
        super().__post_init__()
        if not self.carry:self.carry=self.fatigue.copy()
        self._skills=[[p[k] for k in ATTR] for p in self.profiles]
        self._dev=[[v-c for v in row] for row,c in zip(self._skills,(self.a,self.b))]
        self._prepare()
    def _prepare(self):
        a,b=self._dev
        def duel(x,y,spec): return bounded(weighted(x,spec[0])-weighted(y,spec[1]))
        # Only the initiating side's action and defender response enter directed contests.
        self._edges=(0.,duel(a,b,ATTACK),-duel(b,a,ATTACK),duel(a,b,NET),-duel(b,a,NET),duel(a,b,COUNTER),-duel(b,a,COUNTER),bounded(weighted(a,CONTROL)-weighted(b,CONTROL)))
        weights=[]
        for i,x in enumerate(self._dev):
            m=MULT[self.tactics_names[i]]
            natural=[weighted(x,ATTACK[0]),weighted(x,NET[0]),weighted(x,COUNTER[0]),weighted(x,CONTROL)]
            weights.append([v*math.exp(clip(n/15,-.6,.6)) for v,n in zip(m,natural)])
        a,b=weights
        # Counter chances also depend on the other side initiating attacks.
        ws=[.24,.145*a[0],.145*b[0],.10*a[1],.10*b[1],.075*a[2]*math.sqrt(b[0]),.075*b[2]*math.sqrt(a[0]),.12*(a[3]+b[3])/2]
        total=sum(ws);self._cum=[];c=0.
        for w in ws:c+=w/total;self._cum.append(c)
        self._cum[-1]=1.
    def set_tactic(self,i,name):
        if i not in (0,1) or name not in TACTICS:raise ValueError('invalid tactics')
        if max(self.games)>=2 or (self.log and self.log[-1]['event'] not in ('interval','game')):raise ValueError('tactics only before match or at breaks')
        self.tactics_names[i]=name;self.tactic_history.append({'after_points':len(self.log),'side':i,'name':name});self._prepare()
    def _recover(self,amount):
        for i in range(2):
            take=min(self.strain[i],amount);self.strain[i]-=take;self.carry[i]=max(0.,self.carry[i]-(amount-take));self.fatigue[i]=self.carry[i]+self.strain[i]
    def point(self):
        if max(self.games)>=2:raise ValueError('match finished')
        for i in range(2):self.short[i]=.9*self.short[i]+self.rng.gauss(0,.2)
        r=self.rng.random();kind=next(i for i,c in enumerate(self._cum) if r<c)
        shots=LENGTHS[kind][self.rng.randrange(4)]
        key=max(self.score)>=self.target-3 and abs(self.score[0]-self.score[1])<=3
        # Carry and current strain are separately stored, not double-counted.
        s=[];errs=[]
        for i,ability in enumerate((self.a,self.b)):
            x=self._dev[i];skill=self._skills[i]
            fatigue_penalty=min(4.5,min(3.,self.carry[i])+min(3.,self.strain[i])*(1.5 if kind==7 else 1.2))
            base=self.form[i]+self.short[i]+(clip(self.pressure[i],-1,1) if key else 0)-fatigue_penalty
            s.append(ability+clip(base,-5,5)-clip(self.injury[i],0,15))
            # Error is a competing outcome before skill contest; depends on tactic, stability, focus, strain and rally length.
            risk=RISK[self.tactics_names[i]]
            if self.tactics_names[i]=='attack':
                risk=clip(risk-.00025*weighted(x,ATTACK[0])+.00022*weighted(self._dev[1-i],ATTACK[1]),.001,.012)
            errs.append(clip(.075+risk-.0011*x[6]-.0008*x[15]+.004*self.strain[i]+.0005*(shots-9),.025,.16))
        edge=self._edges[kind]
        # Longer rallies reward endurance/control; ability remains the main strength axis.
        if kind==7:edge+=1.1*math.tanh((self._dev[0][9]-self._dev[1][9])/10)
        eff=[s[0]+edge/2,s[1]-edge/2]
        contest=1/(1+math.exp(-(eff[0]-eff[1])/(75*(1-sum(errs)))))
        p=errs[1]+(1-sum(errs))*contest
        u=self.rng.random();w=int(u>=p);self.score[w]+=1
        # Partition the same draw into unforced error vs contested outcomes (not post-hoc invented).
        if u<errs[1] or u>=1-errs[0]:terminal='unforced_error'
        else:
            actor=(0 if kind in (1,3,5) else 1 if kind in (2,4,6) else None)
            # Conditional terminal type given contested winner; no claim of shot-by-shot reconstruction.
            chance=clip(.44+(.20 if actor==w else -.13 if actor is not None else 0)+.007*self._dev[w][0]-.004*self._dev[1-w][3],.12,.82)
            terminal='winner' if self.rng.random()<chance else 'forced_error'
        for i in range(2):
            # 0.018 remains the reference per 10-shot rally; bounded length & intensity factors.
            burden=(.62+.038*shots)*INTENSITY[kind]
            if kind in (1,2) and i==kind-1:burden*=1.13
            body=clip(1-.003*(self._skills[i][11]-self._skills[i][9]),.88,1.12)
            self.strain[i]+=.018*100/max(40,self.endurance[i])*burden*body
            self.fatigue[i]=self.carry[i]+self.strain[i]
        event='point';score=self.score.copy()
        if max(score)==self.cap or (max(score)>=self.target and abs(score[0]-score[1])>=2):
            self.games[w]+=1;self.history.append(score);self.score=[0,0];self.interval_done=False;self._recover(.25);event='match' if max(self.games)==2 else 'game'
        elif max(score)==self.interval and not self.interval_done:
            self.interval_done=True;self._recover(.08);event='interval'
        self.log.append(dict(game=len(self.history) if event in ('game','match') else len(self.history)+1,score=score,p_a=p,draw=u,winner=w,event=event,effective=eff,fatigue=self.fatigue.copy(),short=self.short.copy(),rally_type=KINDS[kind],shots=shots,terminal=terminal,error_side=1-w if terminal!='winner' else None,contest_p=contest,unforced_probability=errs,carry=self.carry.copy(),strain=self.strain.copy(),tactics=self.tactics_names.copy(),matchup_edge=edge))
        return event

def restore_match(snapshot):
    v=snapshot.get('engine_version')
    if v is None or v=='4.1':return Match(**{k:v for k,v in snapshot.items() if k!='engine_version'})
    if v==VERSION:return RallyMatch(**snapshot)
    raise ValueError(f'unsupported engine version {v}')

def make_match(p,q,match_seed):
    return RallyMatch(p['ability'],q['ability'],match_seed,profiles=[dict(x['attributes']) for x in (p,q)],endurance=[x['attributes']['体能耐力'] for x in (p,q)],pressure=[clip((x['attributes']['抗压能力']-85)/10,-1,1) for x in (p,q)],fatigue=[x['fitness']['fatigue'] for x in (p,q)],injury=[x['fitness']['injury_penalty'] for x in (p,q)])

def start_match_v50(s,event_id,a,b,stage,serial):
    p,q=[next(x for x in s['players'] if x['id']==i) for i in (a,b)]
    return make_match(p,q,seed(s['world_seed'],event_id,stage,serial,a,b))

def match_statistics(log):
    """Summarize only V5 rally logs. No synthetic statistics for V4.1 archives."""
    if not log or any('rally_type' not in x for x in log):return None
    sides=[dict(points=0,winners=0,forced_errors=0,unforced_errors=0,rally_types={}) for _ in range(2)]
    for x in log:
        w=x['winner'];sides[w]['points']+=1
        if x['terminal']=='winner':sides[w]['winners']+=1
        elif x['terminal']=='forced_error':sides[1-w]['forced_errors']+=1
        else:sides[1-w]['unforced_errors']+=1
        for i in (0,1):
            t=sides[i]['rally_types'].setdefault(x['rally_type'],dict(played=0,won=0));t['played']+=1;t['won']+=int(i==w)
    return dict(sides=sides,mean_shots=sum(x['shots'] for x in log)/len(log),total_points=len(log))
