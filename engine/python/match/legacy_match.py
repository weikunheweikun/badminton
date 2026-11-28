"""SMASH 6.1: deterministic exchange-state rally engine (standard library).
One exchange step represents one abstract stroke, not a physical trajectory.
"""
import math
from dataclasses import dataclass, field
from engine import Match, clip
from legacy_rally import ATTR, restore_match as restore_legacy
from season import seed

VERSION="6.1"
K=58.0
AXES=("aggression","pace","net","risk")
PRESETS={"balanced":(50,50,50,50),"attack":(80,75,45,65),
         "control":(35,25,45,30),"net":(60,60,85,55),
         "counter":(25,40,40,35)}
def board(value):
    if isinstance(value,str):
        if value not in PRESETS:raise ValueError("unknown tactic")
        return dict(zip(AXES,PRESETS[value]))
    if not isinstance(value,dict) or set(value)!=set(AXES) or any(type(v) not in (int,float) or not 0<=v<=100 for v in value.values()):
        raise ValueError("four tactic axes in [0,100] required")
    return dict(value)
def logistic(x):return 1/(1+math.exp(-clip(x,-50,50)))
def weighted(p,weights):return sum(p[k]*v for k,v in weights)
ATTACK=(("杀球进攻",.45),("爆发力",.30),("后场技术",.25))
DEFENSE=(("防守能力",.45),("移动速度",.30),("判断与预判",.25))
NET=(("网前技术",.45),("接发球",.25),("灵活性",.30))
CONTROL=(("拉吊控球",.40),("击球稳定性",.25),("战术意识",.20),("体能耐力",.15))
def soft(x,cap=6):return cap*math.tanh(x/cap)

@dataclass
class RallyMatch60(Match):
    engine_version:str=VERSION
    profiles:list=field(default_factory=list)
    tactics_board:list=field(default_factory=lambda:[board("balanced"),board("balanced")])
    tactics_names:list=field(default_factory=lambda:["balanced","balanced"])
    ai:list=field(default_factory=lambda:[False,False])
    carry:list=field(default_factory=list)
    strain:list=field(default_factory=lambda:[0.,0.])
    server:int=-1
    tactic_history:list=field(default_factory=list)
    focus:list=field(default_factory=lambda:[0.,0.])
    def __post_init__(self):
        if self.engine_version!=VERSION or len(self.profiles)!=2 or any(set(p)!=set(ATTR) or any(not 35<=v<=99 for v in p.values()) for p in self.profiles):
            raise ValueError("invalid 6.0 profiles")
        if len(self.ai)!=2 or len(self.tactics_board)!=2:raise ValueError("invalid sides")
        initial=not self.form
        self.tactics_board=[board(x) for x in self.tactics_board]
        super().__post_init__()
        if initial:
            for i,p in enumerate(self.profiles):
                self.form[i]=clip(self.form[i]*clip(1-(p["击球稳定性"]-85)*.018,.65,1.35),-4,4)
        if not self.carry:self.carry=self.fatigue.copy()
        if self.server==-1:self.server=self.rng.randrange(2)
        if initial:self.auto_tactics()
    def set_tactic(self,i,value):
        if i not in (0,1) or max(self.games)>=2 or (self.log and self.log[-1]["event"] not in ("interval","game")):
            raise ValueError("tactics only before play or at breaks")
        b=board(value)
        self.tactics_board[i]=b;self.tactics_names[i]=value if isinstance(value,str) else "custom"
        self.tactic_history.append({"after_points":len(self.log),"side":i,"name":self.tactics_names[i],"board":b.copy()})
    def auto_tactics(self):
        for i in range(2):
            if not self.ai[i]:continue
            a,b=self.profiles[i],self.profiles[1-i]
            own=(self.a,self.b)[i];opp=(self.a,self.b)[1-i]
            def dev(p,c,spec):return weighted(p,spec)-c
            scores={"balanced":1.0,
              "attack":.6*(dev(a,own,ATTACK)-dev(b,opp,DEFENSE))-.8*self.fatigue[i],
              "net":.6*(dev(a,own,NET)-dev(b,opp,NET)),
              "control":.55*(dev(a,own,CONTROL)-dev(b,opp,CONTROL))+.6*(self.fatigue[1-i]-self.fatigue[i]),
              "counter":.6*(dev(a,own,DEFENSE)-dev(b,opp,ATTACK))}
            # No lookahead, hidden PA, or trial matches. Prefer current tactic on exact ties.
            if self.log:
                recent=self.log[-10:]
                lost=sum(x["winner"]!=i for x in recent)/len(recent)
                attacked=sum(x["rally_type"].endswith("_"+("b" if i==0 else "a")) and x["rally_type"].startswith("attack") for x in recent)/len(recent)
                scores["counter"]+=2.5*attacked
                if lost>.65:scores[self.tactics_names[i] if self.tactics_names[i] in scores else "balanced"]-=.8
                if self.score[i]+4<=self.score[1-i]:scores["attack"]+=.6
            name=max(scores,key=lambda k:(scores[k],k==self.tactics_names[i]))
            if name!=self.tactics_names[i]:self.set_tactic(i,name)
    def _recover(self,fraction):
        for i in range(2):
            rec=fraction*clip(self.profiles[i]["身体素质"]/85,.65,1.2)
            take=min(self.strain[i],rec);self.strain[i]-=take
            self.carry[i]=max(0,self.carry[i]-(rec-take));self.fatigue[i]=self.carry[i]+self.strain[i]
    def point(self):
        if max(self.games)>=2:raise ValueError("match finished")
        r=self.rng; key=max(self.score)>=18 and abs(self.score[0]-self.score[1])<=3
        ca=(self.a,self.b); boards=[{k:(v-50)/50 for k,v in b.items()} for b in self.tactics_board]
        dev=[];eff=[];errs=[]
        for i,p in enumerate(self.profiles):
            self.short[i]=.88*self.short[i]+r.gauss(0,.22*clip(1-(p["专注度"]-85)*.025,.55,1.5))
            f=self.carry[i]+self.strain[i]
            # Differential fatigue: no duplicate CA penalty from absolute attribute levels.
            x={k:v-ca[i] for k,v in p.items()}
            for k,factor in (("爆发力",.68),("移动速度",.52),("灵活性",.38),("击球稳定性",.32),("判断与预判",.22)):
                x[k]-=factor*f
            dev.append(x)
            pressure=clip((p["抗压能力"]-85)/7,-1.6,1.6) if key else 0
            # Risk and initiative have an opportunity cost; adapt to relative technical strengths.
            t=boards[i]
            style=.14*t["aggression"]*(weighted(x,ATTACK)-weighted(x,DEFENSE))+.12*t["net"]*(weighted(x,NET)-weighted(x,ATTACK))-.10*t["pace"]*(weighted(x,CONTROL)-weighted(x,ATTACK))
            # When both initiative and pace are suppressed, short/weak replies expose openings.
            # Counter preset retains active defense and does not trigger this interaction.
            passive=1.1*max(0,-t["aggression"]-.5)*2+.65*max(0,-t["risk"])+3.5*max(0,-t["aggression"])*max(0,-t["pace"])
            # Fast, ultra-safe play cannot retain both full placement quality and pace.
            # Active attack and high-level control skills mitigate the execution cost.
            fast_safe=2.4*max(0,t["pace"])*max(0,-t["risk"])*clip(1-.035*weighted(x,CONTROL),.65,1.35)
            eff.append(ca[i]+clip(style,-3,3)-passive-fast_safe+self.form[i]+clip(self.short[i],-2,2)+pressure-min(7,.65*f+.07*f*f)-self.injury[i])
            errs.append(clip(.010+.003*boards[i]["risk"]+.002*boards[i]["aggression"]-.00032*x["击球稳定性"]-.00022*x["专注度"]+.0012*f,.004,.045))
        server=self.server; recv=1-server
        # Serve/receive initiates advantage, receiver can seize initiative.
        receive=soft(.55*dev[recv]["接发球"]+.25*dev[recv]["网前技术"]+.20*dev[recv]["判断与预判"]-dev[server]["网前技术"])
        start=logistic(receive/9+.22*boards[recv]["net"]-.10)
        state=recv if r.random()<.42*start else (server if r.random()<.22 else -1)
        path=[state]; counter_side=None; counts=[0,0]; shots=1; winner=None;terminal=None;kind="neutral";last_edge=0.;u=0.;p_a=.5;contest=.5
        while shots<=60:
            shots+=1
            actor=state if state in (0,1) else None
            # Unforced error competes with continuation and terminal contest.
            u=r.random()
            if u<errs[1]:winner=0;terminal="unforced_error";p_a=errs[1];break
            if u>=1-errs[0]:winner=1;terminal="unforced_error";p_a=1-errs[0];break
            if actor is None:
                quality=[.48*weighted(dev[i],CONTROL)+.27*weighted(dev[i],NET)+.25*weighted(dev[i],ATTACK) for i in range(2)]
                initiative=logistic((quality[0]-quality[1])/9+.65*(boards[0]["aggression"]-boards[1]["aggression"]))
                if r.random()<.55:state=0 if r.random()<initiative else 1
                kind="control" if (boards[0]["pace"]+boards[1]["pace"])<-.25 or shots>12 else "neutral"
                edge=soft((quality[0]-quality[1])*.55)
                endprob=.085+.035*(boards[0]["pace"]+boards[1]["pace"])
            else:
                i=actor;j=1-i;counts[i]+=1
                net=logistic(.6+1.5*boards[i]["net"]+.07*(weighted(dev[i],NET)-weighted(dev[i],ATTACK)))
                isnet=r.random()<net
                att=NET if isnet else ATTACK;df=NET if isnet else DEFENSE
                quality=soft(weighted(dev[i],att)-weighted(dev[j],df),7)
                edge=(1 if i==0 else -1)*(1.9+quality)
                kind=("counter_" if counter_side==i else "net_" if isnet else "attack_")+("a" if i==0 else "b")
                endprob=.18+.055*boards[i]["pace"]+.035*boards[i]["risk"]+.005*quality
                if r.random()<logistic(-.65-quality/7-.5*boards[i]["aggression"]+.65*boards[j]["aggression"]):
                    state=j;counter_side=j
                elif r.random()<.28:state=-1;counter_side=None
                else:counter_side=None
            last_edge=edge
            path.append(state)
            if shots>=60 or r.random()<clip(endprob,.055,.38):
                contest=logistic((eff[0]-eff[1]+edge)/K)
                p_a=errs[1]+(1-sum(errs))*contest
                # Conditional on no unforced error at this step.
                winner=0 if r.random()<contest else 1
                terminal="winner" if r.random()<clip(.45+.18*(actor==winner)-.12*(actor is not None and actor!=winner)+.10*boards[winner]["risk"],.12,.82) else "forced_error"
                break
        assert winner in (0,1)
        # Actual exchange count and initiative drive load; one continuous fatigue state.
        for i in range(2):
            burden=.60+.040*shots+.055*counts[i]
            body=clip(1-(self.profiles[i]["身体素质"]-85)*.005,.8,1.25)
            self.strain[i]+=.018*100/max(40,self.endurance[i])*burden*body
            self.fatigue[i]=self.carry[i]+self.strain[i]
        w=winner;self.server=w;self.score[w]+=1;score=self.score.copy();event="point"
        if max(score)==self.cap or (max(score)>=self.target and abs(score[0]-score[1])>=2):
            self.games[w]+=1;self.history.append(score);self.score=[0,0];self.interval_done=False;self._recover(.25);event="match" if max(self.games)==2 else "game"
        elif max(score)==self.interval and not self.interval_done:
            self.interval_done=True;self._recover(.08);event="interval"
        self.log.append(dict(game=len(self.history) if event in ("game","match") else len(self.history)+1,score=score,winner=w,event=event,shots=shots,rally_type=kind,terminal=terminal,error_side=1-w if terminal!="winner" else None,server=server,initiative=counts,state_path=path,terminal_contest_p=contest if terminal!="unforced_error" else None,terminal_step_error_prob=errs,effective=eff,matchup_edge=last_edge,fatigue=self.fatigue.copy(),tactics=self.tactics_names.copy()))
        if event in ("game","interval"):self.auto_tactics()
        return event

def restore_match(snapshot):
    if snapshot.get("engine_version")==VERSION:return RallyMatch60(**snapshot)
    return restore_legacy(snapshot)

def start_match_v60(s,event_id,a,b,stage,serial):
    p,q=[next(x for x in s["players"] if x["id"]==i) for i in (a,b)]
    managed=set(s["club"]["roster"]);auto=s.get("rules",{}).get("ai_tactics",True)
    return RallyMatch60(p["ability"],q["ability"],seed(s["world_seed"],event_id,stage,serial,a,b),
       profiles=[dict(x["attributes"]) for x in (p,q)],endurance=[x["attributes"]["体能耐力"] for x in (p,q)],
       fatigue=[x["fitness"]["fatigue"] for x in (p,q)],injury=[x["fitness"]["injury_penalty"] for x in (p,q)],
       ai=[auto and x["id"] not in managed for x in (p,q)])

def match_statistics(log):
    if not log:return None
    sides=[dict(points=0,winners=0,forced_errors=0,unforced_errors=0,short_played=0,short_won=0,long_played=0,long_won=0,serve_played=0,serve_won=0,initiative=0,rally_types={}) for _ in range(2)]
    for x in log:
        w=x["winner"];sides[w]["points"]+=1
        sides[w if x["terminal"]=="winner" else 1-w][{"winner":"winners","forced_error":"forced_errors","unforced_error":"unforced_errors"}[x["terminal"]]]+=1
        for i in range(2):
            d=sides[i];t=d["rally_types"].setdefault(x["rally_type"],{"played":0,"won":0});t["played"]+=1;t["won"]+=int(i==w)
            for category,ok in (("short",x["shots"]<=6),("long",x["shots"]>=13),("serve",x.get("server")==i)):
                if ok:d[category+"_played"]+=1;d[category+"_won"]+=int(i==w)
            d["initiative"]+=x.get("initiative",[0,0])[i]
    return dict(sides=sides,mean_shots=sum(x["shots"] for x in log)/len(log),total_points=len(log))
