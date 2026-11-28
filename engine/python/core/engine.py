import random, math, json
from dataclasses import dataclass, field, asdict

def clip(x,a,b): return max(a,min(b,x))
def trunc(r,s,b):
    while True:
        x=r.gauss(0,s)
        if abs(x)<=b:return x
@dataclass
class Match:
    a: float
    b: float
    seed: int
    target: int=21
    cap: int=30
    interval: int=11
    score: list=field(default_factory=lambda:[0,0])
    games: list=field(default_factory=lambda:[0,0])
    history: list=field(default_factory=list)
    log: list=field(default_factory=list)
    form: list=field(default_factory=list)
    short: list=field(default_factory=lambda:[0.,0.])
    fatigue: list=field(default_factory=lambda:[0.,0.])
    matchup: list=field(default_factory=lambda:[0.,0.])
    tactic: list=field(default_factory=lambda:[0.,0.])
    pressure: list=field(default_factory=lambda:[0.,0.])
    endurance: list=field(default_factory=lambda:[80.,80.])
    injury: list=field(default_factory=lambda:[0.,0.])
    interval_done: bool=False
    rng_state: object=None
    def __post_init__(self):
        self.rng=random.Random(self.seed)
        if self.rng_state is not None:
            def tup(x):return tuple(map(tup,x)) if isinstance(x,list) else x
            self.rng.setstate(tup(self.rng_state))
        if not self.form:self.form=[trunc(self.rng,1.5,4) for _ in range(2)]
    def point(self):
        if max(self.games)>=2:raise ValueError('match finished')
        for i in range(2):self.short[i]=.9*self.short[i]+self.rng.gauss(0,.2)
        key=max(self.score)>=self.target-3 and abs(self.score[0]-self.score[1])<=3
        s=[c+clip(self.form[i]+self.short[i]+clip(self.matchup[i],-2,2)+clip(self.tactic[i],-1.5,1.5)-min(3,self.fatigue[i])+(clip(self.pressure[i],-1,1) if key else 0),-5,5)-clip(self.injury[i],0,15) for i,c in enumerate([self.a,self.b])]
        p=1/(1+math.exp(-(s[0]-s[1])/75)); u=self.rng.random(); w=int(u>=p); self.score[w]+=1
        for i in range(2):self.fatigue[i]+=0.018*(100/max(40,self.endurance[i]))
        event='point'; score=self.score.copy()
        if max(score)==self.cap or (max(score)>=self.target and abs(score[0]-score[1])>=2):
            self.games[w]+=1; self.history.append(score); self.score=[0,0]; self.interval_done=False; self.fatigue=[max(0,f-.25) for f in self.fatigue]; event='match' if max(self.games)==2 else 'game'
        elif max(score)==self.interval and not self.interval_done:
            self.interval_done=True; event='interval'
        self.log.append(dict(game=len(self.history) if event in ('game','match') else len(self.history)+1,score=score,p_a=p,draw=u,winner=w,event=event,effective=s,fatigue=self.fatigue.copy(),short=self.short.copy()))
        return event
    def run(self,until='match'):
        while max(self.games)<2:
            e=self.point()
            if until=='point' or (until=='interval' and e in ('interval','game','match')) or (until=='game' and e in ('game','match')):break
        return self.history,self.score,self.games
    def snapshot(self):
        self.rng_state=self.rng.getstate(); return asdict(self)

if __name__=='__main__':
    m=Match(85,80,42); m.run('interval'); n=Match(**json.loads(json.dumps(m.snapshot()))); m.run(); n.run(); assert m.log==n.log and max(m.games)==2 and sum(sum(g) for g in m.history)==len(m.log); print('PASS: point-by-point scoring and resume reproducibility',m.history)
