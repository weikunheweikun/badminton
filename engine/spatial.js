/* core */
/* SMASH V10.7 spatial — core; extracted from the original release. */
(function(P){
"use strict";
const W=2.59,L=13.4,N=6.7,S=1.98,cl=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),pt=(x,y)=>({x,y}),lerp=(a,b,t)=>pt(mix(a.x,b.x,t),mix(a.y,b.y,t));
const ATTR=['杀球进攻','网前技术','拉吊控球','防守能力','后场技术','接发球','击球稳定性','移动速度','爆发力','体能耐力','灵活性','身体素质','战术意识','判断与预判','抗压能力','专注度'];
const presets={均衡:[85,85,85,85,85,85,85,85,85,85,85,85,85,85,85,85],进攻:[96,83,82,76,94,84,83,84,96,81,82,88,87,83,85,84],拉吊:[79,88,96,84,94,85,94,90,80,94,88,85,94,91,87,92],防反:[81,85,87,97,86,90,92,95,88,96,94,89,92,96,90,90],网前:[82,97,90,85,82,96,90,89,86,83,96,83,94,94,87,90]};
const SHOTS={short:['短发球',1.04,.42,.14,'网前技术'],long:['高远发球',1.80,2.55,.23,'后场技术'],clear:['高远球',2.08,3.8,.32,'后场技术'],punch:['平高球',1.16,1.95,.36,'拉吊控球'],drop:['吊球',1.53,.83,.32,'拉吊控球'],smash:['重杀',.68,.48,.36,'杀球进攻'],half:['点杀',.82,.58,.32,'杀球进攻'],drive:['平抽球',.70,.75,.30,'拉吊控球'],net:['放网球',1.42,.87,.23,'网前技术'],kill:['扑球',.39,.48,.27,'网前技术'],lift:['挑球',1.94,3.55,.32,'防守能力'],block:['接杀挡网',1.18,.85,.27,'防守能力']};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
function norm(r){return Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(2*Math.PI*r());}
function profile(name,kind='均衡',offset=0){return {name,style:kind,attrs:Object.fromEntries(ATTR.map((k,i)=>[k,cl(presets[kind][i]+offset,35,99)]))};}
function equalProfile(name,kind='均衡',ca=85){const p=profile(name,kind),weights=ATTR.map((_,i)=>i<7?.45/7:i<12?.35/5:.20/4);let lo=-100,hi=100;for(let n=0;n<40;n++){const x=(lo+hi)/2,v=ATTR.reduce((sum,k,i)=>sum+weights[i]*cl(p.attrs[k]+x,35,99),0);if(v<ca)lo=x;else hi=x;}for(const k of ATTR)p.attrs[k]=cl(p.attrs[k]+(lo+hi)/2,35,99);return p;}
function local(side,depth,y){return pt(side===0?N-depth:N+depth,side===0?y:-y);}
function depth(side,p){return side===0?N-p.x:p.x-N;}
function sideOf(i,ends){return i^ends;}
function a(p,k){return p.attrs[k]||85;}

const EXEC={"attack": [["杀球进攻", 0.55], ["爆发力", 0.23], ["后场技术", 0.22]], "net": [["网前技术", 0.6], ["灵活性", 0.25], ["判断与预判", 0.15]], "control": [["拉吊控球", 0.54], ["后场技术", 0.25], ["击球稳定性", 0.13], ["判断与预判", 0.08]], "defense": [["防守能力", 0.48], ["移动速度", 0.25], ["判断与预判", 0.27]], "serve": [["网前技术", 0.35], ["击球稳定性", 0.45], ["专注度", 0.2]], "receive": [["接发球", 0.55], ["判断与预判", 0.25], ["网前技术", 0.2]]}, RESP={"attack": [["防守能力", 0.48], ["移动速度", 0.32], ["判断与预判", 0.2]], "net": [["网前技术", 0.36], ["灵活性", 0.37], ["判断与预判", 0.27]], "control": [["拉吊控球", 0.28], ["移动速度", 0.3], ["后场技术", 0.22], ["判断与预判", 0.2]], "defense": [["后场技术", 0.35], ["移动速度", 0.3], ["判断与预判", 0.35]], "serve": [["接发球", 0.6], ["网前技术", 0.25], ["判断与预判", 0.15]], "receive": [["网前技术", 0.3], ["防守能力", 0.4], ["移动速度", 0.3]]}, COST={"attack": 1.75, "net": 1.05, "control": 0.9, "defense": 1.45, "serve": 0.25, "receive": 0.75};
const FAMILY={short:'serve',long:'serve',clear:'control',punch:'control',drop:'control',smash:'attack',half:'attack',drive:'control',net:'net',kill:'net',lift:'defense',block:'defense'};
const weighted=(p,spec)=>spec.reduce((v,[k,w])=>v+a(p,k)*w,0);
function effective(p,k){return cl(.80*a(p,k)+.20*rawAttr(p,k),35,99);}
const technicalWeighted=(p,spec)=>spec.reduce((v,[k,w])=>v+effective(p,k)*w,0);
function execution(p,kind,receiving=false){const base=technicalWeighted(p,EXEC[FAMILY[kind]]),specific=effective(p,SHOTS[kind][4]);let v=.68*base+.32*specific;return receiving?.65*v+.35*technicalWeighted(p,EXEC.receive):v;}
function response(p,kind){return technicalWeighted(p,RESP[FAMILY[kind]]);}
function rawAttr(p,k){return p.raw?.[k]??a(p,k);}
function workload(kind,d,actor,receiving=false,duration=1){const family=receiving?'receive':FAMILY[kind];const intensity=cl(d/Math.max(.15,duration)/3.4,0,1.3);return .81*(d*(.23+.08*intensity)+(actor?COST[family]*.62:.10));}
function loadScale(p){const raw=p.physicalRaw||p.raw||p.attrs;return cl((85/raw['体能耐力'])**.95,.72,1.65)*cl(1-(raw['身体素质']-85)*.008,.78,1.35);}
function loadDelta(p,cost){return cost*.157*loadScale(p)*.756;}
function decisionIntelligence(p){const skill=k=>.65*a(p,k)+.35*rawAttr(p,k);return cl((.60*skill('战术意识')+.25*skill('判断与预判')+.15*skill('专注度')-35)/64,0,1);}
function decisionNoise(p){return .045+.065*(1-decisionIntelligence(p));}

// V12.6: preserve overall ability and attenuate repeated specialist gains.
function calibrateProfile(p){const raw=p.raw||p.attrs,mean=ATTR.reduce((s,k)=>s+raw[k],0)/ATTR.length;return {...p,physicalRaw:{...raw},raw:Object.fromEntries(ATTR.map(k=>[k,cl(85+.60*(mean-85)+.72*(raw[k]-mean),35,99)])),attrs:Object.fromEntries(ATTR.map(k=>[k,cl(85+.64*(a(p,k)-85)+.12*(raw[k]-mean),35,99)]))};}
function recoveryScale(p){const raw=p.physicalRaw||p.raw||p.attrs;return cl(1+.010*(raw['身体素质']-85)+.011*(raw['体能耐力']-85),.55,1.4);}
Object.assign(P,{equalProfile,calibrateProfile,recoveryScale,W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,effective,workload,loadScale,loadDelta,decisionIntelligence,decisionNoise});
})(globalThis.SmashParts ||= {});


/* movement */
/* SMASH V10.7 spatial — movement; extracted from the original release. */
(function(P){
"use strict";
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise}=P;
// V14.6 acute load is a separate per-rally state (0..1), never persisted in career fatigue.
function fatigueScale(f){return 1-cl(f,0,75)*.0018;}
function athletic(p,k){return a(p,k)+.20*(rawAttr(p,k)-a(p,k));}
// V13.3: estimated COM scale, not an athlete-specific mass measurement.
// Height changes inertial manoeuvring, not the rated straight-line top speed.
function mobility(p,f){const body=bodyFor(p),agility=athletic(p,'灵活性'),size=body.scale,acute=cl(p._acute||0,0,1),
 turnScale=cl(size**(-1.35),.82,1.22)*(1-.30*acute),brakeScale=cl(size**(-1.10),.84,1.18)*(1-.28*acute),
 lowScale=cl(size**1.40,.80,1.22),agilityReserve=cl(1+(agility-85)*.018,.65,1.25)*(1-.22*acute);
 return {body,hand:body.hand,turnScale,brakeScale,lowScale,agilityReserve,comHeight:.55*body.height_cm/100,maxZ:Math.min(body.maxZ,2.66+body.heightDelta+(athletic(p,'爆发力')-85)*.012)-.13*acute,v: (5.35+(athletic(p,'移动速度')-85)*.075)*fatigueScale(f)*(1-.15*acute),acc:(16.4+(athletic(p,'爆发力')-85)*.25)*fatigueScale(f)*(1-.32*acute)*cl(size**(-.35),.94,1.06),turn:(.075+(99-agility)*.0032)/turnScale,react:cl(.145-(athletic(p,'判断与预判')-85)*.0021-(a(p,'专注度')-85)*.0015+f*.0013+.085*acute,.085,.45),reach:(.84+(a(p,'灵活性')-75)*.004)*(body.upperArm+body.forearm+body.racketCenter)/1.12};}
// Rest-to-rest triangular/trapezoidal footwork, with acceleration and braking.
// V12.7 shared contact skeleton: root is the ground projection of pelvis, not the racket.
// Nominal body dimensions are model assumptions; the racket length rule is an external constraint.
const BODY=Object.freeze({ankle:.045,hip:.87,torso:.49,headOffset:.205,headRadius:.105,shoulderHalf:.181,hipHalf:.115,upperArm:.31,forearm:.29,thigh:.43,shin:.44,racketCenter:.52});
// 167 cm is the original nominal standing height. Segment ratios are estimated,
// not individually measured. Racket dimensions and court stay fixed.
const bodyCache=new Map();
function bodyFor(p={}){
 const h=Number(p.height_cm),known=Number.isFinite(h)&&h>=140&&h<=200, height=known?h:167,scale=height/167,hand=p.handedness==='left'?-1:1;
 const handKnown=['left','right'].includes(p.handedness),key=[height,known,hand,handKnown].join('|');if(bodyCache.has(key))return bodyCache.get(key);
 const b={};for(const [k,v] of Object.entries(BODY))b[k]=k==='racketCenter'?v:v*scale;
 const heightDelta=(BODY.hip+BODY.torso+BODY.upperArm+BODY.forearm)*(scale-1);
 const result=Object.freeze({...b,height_cm:height,heightKnown:known,hand,handKnown,scale,heightDelta,maxZ:2.68+heightDelta});if(bodyCache.size>=512)bodyCache.clear();bodyCache.set(key,result);return result;
}
// V14.9: shared stroke classification, used by search, contact, tactics and animation.
// Around-head forehand is not a true backhand. Directional limits are conservative
// engineering estimates, not measured individual joint envelopes.
function strokeClass(root,q,side,m){
 const f=side===0?1:-1,scale=m.body?.scale??1,hand=m.hand??1;
 const lateral=(q.y-root.y)*f*hand/scale,forward=(q.x-root.x)*f/scale,high=q.z>1.90;
 if(high){if(lateral<-.20){return lateral<-.50||forward<-.12?'overBack':'aroundHead';}return 'overFore';}
 const back=lateral<-.18;
 return q.z<1.35?(back?'lowBack':'lowFore'):(back?'back':'fore');
}
function contactGeometry(root,q,side,m,vel=pt(0,0)){
 const B=m.body||BODY,hand=m.hand??1,scale=B.scale??1,deltaZ=B.heightDelta??0;
 const forward=side===0?1:-1,dx=q.x-root.x,dy=q.y-root.y,gap=Math.hypot(dx,dy),strokeType=strokeClass(root,q,side,m),back=strokeType.toLowerCase().includes('back');
 const high=q.z>1.90,low=q.z<1.25, speed=Math.hypot(vel.x,vel.y),localLat=dy*forward*hand/scale,localFwd=dx*forward/scale,backTurn=cl(.36+.58*cl((-localLat-.12)/.85,0,1)+.28*cl((.35-localFwd)/.70,0,1),.36,1.20),yaw=(side===0?0:Math.PI)+hand*(strokeType==='overBack'?-1.02-.48*cl((-localLat-.20)/.85,0,1)-.24*cl((-localFwd+.12)/.65,0,1):strokeType==='aroundHead'?-.33:back?-backTurn:high?.12:0);
 const right={x:-Math.sin(yaw)*hand,y:Math.cos(yaw)*hand},ux=gap?dx/gap:0,uy=gap?dy/gap:0;
 const lean=cl((gap-.38*scale)*(back&&!high?.56:.47),0,(low?.36:.27)*scale),hipShift=lean*.23, crouch=low?cl((1.25-q.z)*.36,.04,.29):0;
 // Only modest elevation for ordinary overhead contact; higher contacts require a jump.
 const elevation=high?cl((q.z-2.34-deltaZ)*.82,0,.31):0;
 const jumpHeight=Math.max(0,elevation-.045),jump=jumpHeight>.035;
 const flightTime=jump?2*Math.sqrt(2*jumpHeight/9.81):0;
 const lowDemand=low?cl((1.25-q.z)/1.07,0,1):0;
 const hip={x:root.x+ux*hipShift,y:root.y+uy*hipShift,z:B.hip-crouch+elevation};
 const torsoX=ux*lean,torsoY=uy*lean,torsoZ=Math.sqrt(Math.max(.01,B.torso**2-lean**2));
 const center={x:hip.x+torsoX,y:hip.y+torsoY,z:hip.z+torsoZ};
 const shoulder={x:center.x+right.x*B.shoulderHalf,y:center.y+right.y*B.shoulderHalf,z:center.z};
 const delta={x:q.x-shoulder.x,y:q.y-shoulder.y,z:q.z-shoulder.z},length=Math.hypot(delta.x,delta.y,delta.z),max=B.upperArm+B.forearm+B.racketCenter-.008;
 const forwardComponent=(delta.x*Math.cos(yaw)+delta.y*Math.sin(yaw))/Math.max(.10,length),crossBody=-(delta.x*right.x+delta.y*right.y)/Math.max(.10,length);
 const directionalLoss=cl(.075*Math.max(0,-forwardComponent-.25)+.055*Math.max(0,crossBody-.30)+(strokeType==='aroundHead'?.025:0),0,.105)*scale;
 const reachMax=max-directionalLoss,extension=length/reachMax,feasible=length<=reachMax+.002&&length>=.10&&q.z>=.10&&q.z<=(B.maxZ??2.68);
 return {hand,hip,center,shoulder,yaw,back,strokeType,reachMax,directionalLoss,elevation,jump,jumpHeight,flightTime,extension,feasible,margin:reachMax-length,lowDemand,crouch,balance:cl(1-.35*speed/m.v-.30*cl((extension-.78)/.22,0,1),.25,1)};
}
// Impact stringbed orientation follows the velocity-change direction, subject to
// the shoulder-arm-racket kinematic chain. This is a pose model, not a collision-force solver.
function impactPose(g,q,vin,vout,B=BODY){
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),mul=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k}),add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),len=a=>Math.hypot(a.x,a.y,a.z),unit=a=>mul(a,1/Math.max(1e-9,len(a)));
 const delta=sub(q,g.shoulder),d=len(delta),u=unit(delta),n=unit(sub(vout,vin)),R=B.racketCenter,lmax=B.upperArm+B.forearm-.003,lmin=.06;
 if(g.specialAxis){const aim=unit(g.specialAxis),wrist=sub(q,mul(aim,R));let normal=unit(sub(n,mul(aim,dot(n,aim))));if(len(normal)<.01){const ref=Math.abs(aim.z)<.8?{x:0,y:0,z:1}:{x:0,y:1,z:0};normal=unit(sub(ref,mul(aim,dot(aim,ref))));}return {wrist,aim,normal,alignment:cl(dot(n,normal),0,1)};}
 const mincos=cl((d*d+R*R-lmax*lmax)/(2*Math.max(.001,d*R)),-1,1),maxcos=cl((d*d+R*R-lmin*lmin)/(2*Math.max(.001,d*R)),-1,1);
 let axis=unit(sub(u,mul(n,dot(u,n))));if(len(axis)<.01){let ref=Math.abs(n.z)<.8?{x:0,y:0,z:1}:{x:0,y:1,z:0};axis=unit(sub(ref,mul(n,dot(n,ref))));}
 const c=dot(axis,u),goal=cl(c,mincos,maxcos);
 if(c<mincos-1e-7||c>maxcos+1e-7){let perp=unit(sub(axis,mul(u,c)));if(len(perp)<.01){const ref=Math.abs(u.z)<.8?{x:0,y:0,z:1}:{x:0,y:1,z:0};perp=unit(sub(ref,mul(u,dot(ref,u))));}axis=add(mul(u,goal),mul(perp,Math.sqrt(Math.max(0,1-goal*goal))));}
 let normal=unit(sub(n,mul(axis,dot(n,axis))));if(len(normal)<.01){const ref=Math.abs(axis.z)<.8?{x:0,y:0,z:1}:{x:0,y:1,z:0};normal=unit(sub(ref,mul(axis,dot(axis,ref))));}
 return {wrist:sub(q,mul(axis,R)),aim:axis,normal,alignment:cl(dot(n,normal),0,1)};
}
// V13.6: emergency strokes are selected before committing to a swing.
// Coefficients are game-design estimates, not measured biomechanics.
const SPECIAL_RESCUE={spin:{normal:.05,key:.15,pre:.59,recovery:.55,power:.80,spread:1.35,quality:.82,load:.45,lock:.12},between:{normal:.15,key:.40,pre:.26,recovery:.65,power:.48,spread:1.90,quality:.68,load:.40,lock:.15},dive:{normal:.15,key:.40,pre:.34,recovery:.95,power:.52,spread:1.75,quality:.64,load:1.25,lock:.32}};
function rescueGeometry(type,root,q,side,m,g){
 const B=m.body,front=side===0?1:-1,hand=B.hand,dx=q.x-root.x,dy=q.y-root.y,gap=Math.hypot(dx,dy),pt3=(x,y,z)=>({x,y,z});
 if(type==='spin')return g.feasible&&!g.jump?{...g,balance:Math.min(g.balance,.62)}:null;
 let hip,center,yaw;
 if(type==='dive'){if(gap<.01)return null;const ux=dx/gap,uy=dy/gap,len=Math.hypot(.89,.46);hip=pt3(root.x+ux*.06,root.y+uy*.06,.42*B.scale);center=pt3(hip.x+ux*.89/len*B.torso,hip.y+uy*.89/len*B.torso,hip.z+.46/len*B.torso);yaw=Math.atan2(dy,dx);}
 else {hip=pt3(root.x+front*cl(dx*front*.28,-.23*B.scale,.23*B.scale),root.y+cl(dy*.24,-.08,.08),.68*B.scale);const len=Math.hypot(.30,1);center=pt3(hip.x+front*.30/len*B.torso,hip.y,hip.z+B.torso/len);yaw=(side===0?0:Math.PI)+(dx*front>0?Math.PI:0);}
 const shoulder=pt3(center.x-Math.sin(yaw)*hand*B.shoulderHalf,center.y+Math.cos(yaw)*hand*B.shoulderHalf,center.z),d=Math.hypot(q.x-shoulder.x,q.y-shoulder.y,q.z-shoulder.z),max=B.upperArm+B.forearm+B.racketCenter-.012;
 if(d>max||d<.12)return null;
 let specialAxis=null;
 if(type==='between'){
  let best=null;for(const x of [-.18,-.09,0,.09,.18])for(const z of [-.14,-.08,-.02,.04]){const want=pt3(hip.x+front*x*B.scale,hip.y,hip.z+z*B.scale),d0=Math.hypot(q.x-want.x,q.y-want.y,q.z-want.z);if(d0<.001)continue;const axis=pt3((q.x-want.x)/d0,(q.y-want.y)/d0,(q.z-want.z)/d0),w=pt3(q.x-axis.x*B.racketCenter,q.y-axis.y*B.racketCenter,q.z-axis.z*B.racketCenter),arm=Math.hypot(w.x-shoulder.x,w.y-shoulder.y,w.z-shoulder.z);
   if(arm>B.upperArm+B.forearm-.008||arm<.07||w.z<.14||w.z>hip.z+.045||Math.abs(w.y-hip.y)>.19*B.scale||Math.abs(w.x-hip.x)>.25*B.scale)continue;
   if(Math.abs(w.y+axis.y*B.racketCenter*.35-hip.y)>.19*B.scale||w.z+axis.z*B.racketCenter*.35>hip.z-.025)continue;
   const merit=Math.abs(w.x-hip.x)*.6+Math.abs(w.y-hip.y)+Math.abs(w.z-(hip.z-.07*B.scale));if(!best||merit<best.merit)best={axis,merit};
  }if(!best)return null;specialAxis=best.axis;
 }
 return {...g,hip,center,shoulder,yaw,feasible:true,extension:d/max,margin:max-d,balance:type==='dive'?.30:.42,jump:false,jumpHeight:0,flightTime:0,elevation:0,specialAxis};
}
function emergencyRescue(p,f,side,root,q,v,m,g,ctx){
 const {now,burden,critical,margin,normalFeasible,rescue,serve,key,last,clock,seed}=ctx;
 if(serve||g.jump||now<.26||clock<(last?.rescueUntil??-Infinity)|| (normalFeasible&&!rescue&&burden<.30&&critical<.54&&margin>.035))return null;
 const B=m.body,front=side===0?1:-1,dx=(q.x-root.x)*front,dy=(q.y-root.y)*front*B.hand,gap=Math.hypot(dx,dy),speed=Math.hypot(v.x,v.y),skill=k=>P.effective(p,k),ag=skill('灵活性'),def=skill('防守能力'),read=skill('判断与预判'),power=skill('爆发力'),stable=skill('击球稳定性'),fit=skill('身体素质'),focus=skill('抗压能力');
 const ability=cl(1+.014*(ag-85)+.012*(def-85)+.007*(read-85)+(key?.009*(focus-85):0)-f*.005,.40,1.50),types=[];
 if(q.z<.73*B.scale&&gap>.86*B.scale&&speed<4.7&&now>=.34)types.push('dive');
 if(Math.abs(dy)<.30*B.scale&&dx>-.72*B.scale&&dx<.88*B.scale&&Math.abs(dx)>.17*B.scale&&q.z>=.20&&q.z<.66*B.scale)types.push('between');
 if(dy<-.29*B.scale&&dx<.42&&q.z>.95&&q.z<2.42+B.heightDelta&&speed<3.6&&now>=.59&&normalFeasible)types.push('spin');
 // Independent deterministic decision stream: no random draw on ordinary strokes.
 for(const type of types){const cfg=SPECIAL_RESCUE[type],geometry=rescueGeometry(type,root,q,side,m,g);if(!geometry||now<cfg.pre)continue;
  const chance=cl((key?cfg.key:cfg.normal)*ability,0,.75),hash=P.rng((seed^Math.imul(31,0x9e3779b1)^Math.imul(type.charCodeAt(0),0x85ebca6b))>>>0)();if(hash>=chance)continue;
  const quality=cl(cfg.quality+.006*(def-85)+.003*(stable-85),.48,.94),recovery=cl(cfg.recovery*(1-.012*(ag-85)-.008*(fit-85)+f*.003),cfg.recovery*.65,cfg.recovery*1.45);
  return {type,geometry,quality,power:cl(cfg.power+.004*(power-85)+.003*(def-85),cfg.power-.12,cfg.power+.15),spread:cl(cfg.spread-.012*(stable-85)-.005*(def-85),1.12,2.3),recovery,lock:Math.min(recovery*.65,cfg.lock*(recovery/cfg.recovery)),pre:Math.min(now,cfg.pre),post:recovery,load:cfg.load};
 }return null;
}
function moveTime(d,m){d=Math.max(0,d);const brake=(m.brake??1)/(m.brakeScale??1),peak=Math.min(m.v,Math.sqrt(2*d*m.acc/(1+brake))),ramp=peak/m.acc,cruise=peak?Math.max(0,(d-.5*peak*ramp*(1+brake))/peak):0;return ramp+cruise+brake*ramp;}
function travel(d,t,m){if(d<=0)return 0;let brake=(m.brake??1)/(m.brakeScale??1),peak=Math.min(m.v,Math.sqrt(2*d*m.acc/(1+brake))),ramp=peak/m.acc,cruise=Math.max(0,(d-.5*peak*ramp*(1+brake))/peak),total=(1+brake)*ramp+cruise;t=cl(t,0,total);if(t<ramp)return .5*m.acc*t*t;if(t<ramp+cruise)return .5*m.acc*ramp*ramp+peak*(t-ramp);let u=t-ramp-cruise;return cl(.5*peak*ramp+peak*cruise+peak*u-.5*peak/(Math.max(1e-9,brake*ramp))*u*u,0,d);}
// Continuous velocity across stroke boundaries; brake through reading/turn,
// accelerate toward foot placement and pace reachable contacts to the contact clock.
function motionStart(pos,vel,m,delay,side){let speed=Math.hypot(vel.x,vel.y),stop=speed?Math.min(.48,speed/(m.acc*.82*(m.brakeScale??1))):0;let end=pt(pos.x+vel.x*stop*.5,pos.y+vel.y*stop*.5);let bx=side===0?[-.65,N-.12]:[N+.12,L+.65];let frac=1;for(let [k,lo,hi] of [['x',...bx],['y',-W-.55,W+.55]]){let d=end[k]-pos[k];if(d>0)frac=Math.min(frac,(hi-pos[k])/d);else if(d<0)frac=Math.min(frac,(lo-pos[k])/d);}stop*=cl(frac,0,1);end=pt(pos.x+vel.x*stop*.5,pos.y+vel.y*stop*.5);return {origin:end,stop,delay:Math.max(delay,stop)};}
function motionShape(d,m,exit=0){let brake=(m.brake??1)/(m.brakeScale??1),k=1+brake*(1-exit*exit),peak=Math.min(m.v,Math.sqrt(2*d*m.acc/k)),ramp=peak/m.acc,dec=brake*(1-exit)*ramp,cruise=peak?Math.max(0,(d-.5*peak*ramp*k)/peak):0;return {peak,ramp,dec,cruise,total:ramp+dec+cruise,exit};}
function motionPlan(pos,to,vel,m,delay,side,deadline=null,exit=0,start=null){let a=start||motionStart(pos,vel,m,delay,side),d=dist(a.origin,to),shape=motionShape(d,m,exit);let scale=deadline===null||!shape.total?1:Math.max(1,(deadline-a.delay)/shape.total),readDelay=a.delay;scale=Math.min(scale,1.85);let delayRun=deadline===null||!shape.total?a.delay:Math.max(a.delay,deadline-shape.total*scale);return {from:{...pos},to:{...to},delay:delayRun,readDelay,mob:m,model:4,initial:{...vel},origin:a.origin,stop:a.stop,shape,scale,deadline};}
// Recovery keeps useful momentum instead of stopping and restarting every stroke.
function approachTime(pos,to,vel,m){const d=dist(pos,to);if(d<.015)return 0;const along=((to.x-pos.x)*vel.x+(to.y-pos.y)*vel.y)/d;const lateral=Math.sqrt(Math.max(0,vel.x**2+vel.y**2-along**2));return Math.max(0,moveTime(d,m)-cl(along/m.acc,-.25,.24)+.45*lateral/(m.acc*(m.turnScale??1)));}
// V12.8: one ground-plane steering law for recovery and reception. The
// acceleration ellipse distinguishes braking, forward acceleration and turning.
function steerVelocity(v,desired,m,dt){
 const speed=Math.hypot(v.x,v.y),dx=desired.x-v.x,dy=desired.y-v.y;
 const ux=speed>.08?v.x/speed:0,uy=speed>.08?v.y/speed:0;
 const along=dx*ux+dy*uy,sideX=dx-along*ux,sideY=dy-along*uy;
 const brake=m.brakeAcc??m.acc*.80*(m.brakeScale??1),turn=m.acc*cl(.76-((m.turn*(m.turnScale??1))-.10)*1.5,.50,.90)*(m.turnScale??1);
 const ratio=speed>.08?Math.hypot(along/((along<0?brake:m.acc)*dt),Math.hypot(sideX,sideY)/(turn*dt)):Math.hypot(dx,dy)/(m.acc*dt);
 const k=1/Math.max(1,ratio),nv=pt(v.x+dx*k,v.y+dy*k);
 return nv; // no instantaneous speed clamp when an athlete enters with momentum
}
function recoveryPlan(pos,to,vel,m,delay,side,airRemaining=0){
 let x={...pos},v={...vel},t=0,walk=0;const nodes=[[0,x.x,x.y,v.x,v.y,0]],dt=.035,brake=m.acc*.80*(m.brakeScale??1);
 for(let i=0;i<116;i++){const d=dist(x,to),speed=Math.hypot(v.x,v.y);if(t>=airRemaining&&d<.035&&speed<.045){v=pt(0,0);nodes.push([t+dt,x.x,x.y,0,0,walk]);break;}
  const ux=d?(to.x-x.x)/d:0,uy=d?(to.y-x.y)/d:0,along=v.x*ux+v.y*uy;
  // During follow-through retain compatible momentum, but do not accelerate before readiness.
  const want=Math.min(m.v,Math.sqrt(2*brake*Math.max(0,d-.025)),d/.16,t<delay?Math.max(0,along)*.85:m.v);
  const groundDt=cl(t+dt-airRemaining,0,dt),nv=groundDt>0?steerVelocity(v,pt(ux*want,uy*want),{...m,brakeAcc:brake},groundDt):{...v},nx=pt(cl(x.x+(v.x+nv.x)*dt*.5,side===0?-.65:N+.12,side===0?N-.12:L+.65),cl(x.y+(v.y+nv.y)*dt*.5,-W-.55,W+.55));
  if(Math.abs(nx.x-(x.x+(v.x+nv.x)*dt*.5))>1e-9)nv.x=0;if(Math.abs(nx.y-(x.y+(v.y+nv.y)*dt*.5))>1e-9)nv.y=0;walk+=dist(x,nx);x=nx;v=nv;t+=dt;nodes.push([t,x.x,x.y,v.x,v.y,walk]);
 }
 return {model:5,smooth:true,from:{...pos},to:{...x},origin:{...pos},initial:{...vel},delay,readDelay:delay,airRemaining,mob:m,nodes};
}
function pathState(plan,t){if(plan.model===5){const a=plan.nodes;let lo=0,hi=a.length-1,after=t>a[hi][0]+1e-6;t=cl(t,0,a[hi][0]);while(hi-lo>1){const mid=(lo+hi)>>1;if(a[mid][0]<=t)lo=mid;else hi=mid;}const u=a[lo],v=a[hi],k=v[0]>u[0]?cl((t-u[0])/(v[0]-u[0]),0,1):0;const h=v[0]-u[0];if(plan.smooth&&h>0){const k2=k*k,k3=k2*k;const axis=(i,j)=>{const p=u[i],q=v[i],a=u[j]*h,b=v[j]*h;return [(2*k3-3*k2+1)*p+(k3-2*k2+k)*a+(-2*k3+3*k2)*q+(k3-k2)*b,((6*k2-6*k)*p+(3*k2-4*k+1)*a+(-6*k2+6*k)*q+(3*k2-2*k)*b)/h];};const x=axis(1,3),y=axis(2,4);return {pos:pt(x[0],y[0]),vel:after?pt(0,0):pt(x[1],y[1]),travel:mix(u[5],v[5],k)};}return {pos:pt(mix(u[1],v[1],k),mix(u[2],v[2],k)),vel:after?pt(0,0):pt(mix(u[3],v[3],k),mix(u[4],v[4],k)),travel:mix(u[5],v[5],k)};}if(plan.model!==4){const d=dist(plan.from,plan.to),p=d?lerp(plan.from,plan.to,travel(d,t-plan.delay,plan.mob)/d):{...plan.from};return {pos:p,vel:pt(0,0),travel:dist(plan.from,p)};}
 t=Math.max(0,t);let {from,to,initial,origin,stop,delay,shape:s,scale}=plan,coast=Math.hypot(initial.x,initial.y)*stop*.5;
 if(t<stop){let x=t-t*t/(2*stop);return {pos:pt(from.x+initial.x*x,from.y+initial.y*x),vel:pt(initial.x*(1-t/stop),initial.y*(1-t/stop)),travel:Math.hypot(initial.x,initial.y)*x};}
 let d=dist(origin,to);if(t<=delay||!d)return {pos:{...origin},vel:pt(0,0),travel:coast};let u=cl((t-delay)/scale,0,s.total),x,v,acc=s.ramp?s.peak/s.ramp:0;
 if(u<s.ramp){x=.5*acc*u*u;v=acc*u;}else if(u<s.ramp+s.cruise){x=.5*s.peak*s.ramp+s.peak*(u-s.ramp);v=s.peak;}else{let z=u-s.ramp-s.cruise,br=s.dec?s.peak*(1-s.exit)/s.dec:0;x=.5*s.peak*s.ramp+s.peak*s.cruise+s.peak*z-.5*br*z*z;v=s.peak-br*z;}
 if(t>delay+s.total*scale+1e-7)v=0;let unit=pt((to.x-origin.x)/d,(to.y-origin.y)/d);return {pos:lerp(origin,to,cl(x/d,0,1)),vel:pt(unit.x*v/scale,unit.y*v/scale),travel:coast+cl(x,0,d)};
}
function pathPos(plan,t){return pathState(plan,t).pos;}

Object.assign(P,{fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,approachTime,recoveryPlan,steerVelocity,pathState,pathPos,BODY,bodyFor,strokeClass,contactGeometry,impactPose,emergencyRescue,rescueGeometry,SPECIAL_RESCUE});
})(globalThis.SmashParts ||= {});


/* trajectory */
/* SMASH V10.7 spatial — trajectory; extracted from the original release. */
(function(P){
"use strict";
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise,fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,pathState,pathPos}=P;
// V12.5: Cohen et al. (2015) measured aerodynamic length 4.60 m; coupled gravity and quadratic drag.
const AIR_LENGTH=4.60, GRAVITY=9.81;
// Strang split: exact quadratic drag over a short interval between half gravity kicks.
// Also propagate the launch-velocity Jacobian for inverse trajectory fitting.
function airIntegrate(vx,vz,h,T,netD=Infinity,store=false){
 let peak=h,x=0,z=h,t=0,jx=0,jy=0,kx=0,ky=0,ax=1,ay=0,bx=0,by=1,net=null;
 const count=32,nodes=store?[[0,0,h,vx,vz]]:null;
 for(let i=1;i<=count;i++){
  const u=i/count,nt=T*u*u,dt=nt-t,oldx=x,oldz=z,oldjx=jx,oldjy=jy,oldkx=kx,oldky=ky,ovx=vx,ovz=vz;
  vz-=GRAVITY*dt*.5;
  const speed=Math.max(1e-8,Math.hypot(vx,vz)),a=speed*dt/AIR_LENGTH,den=1+a,inv=1/den,F=dt*Math.log1p(a)/Math.max(1e-12,a),dF=(dt*inv-F)/speed,dG=-dt/AIR_LENGTH*inv*inv;
  const xx=vx*vx/speed,zz=vz*vz/speed,xz=vx*vz/speed;
  const A=F+dF*xx,B=dF*xz,C=F+dF*zz,D=inv+dG*xx,E=dG*xz,H=inv+dG*zz;
  jx+=A*ax+B*bx;jy+=A*ay+B*by;kx+=B*ax+C*bx;ky+=B*ay+C*by;
  const nax=D*ax+E*bx,nay=D*ay+E*by,nbx=E*ax+H*bx,nby=E*ay+H*by;ax=nax;ay=nay;bx=nbx;by=nby;
  x+=vx*F;z+=vz*F;vx*=inv;vz=vz*inv-GRAVITY*dt*.5;
  if(!net&&x>=netD&&oldx<netD){let q=(netD-oldx)/Math.max(1e-10,x-oldx); // Hermite interpolation at crossing
   for(let j=0;j<3;j++){const w=hermite(oldx,x,ovx,vx,dt,q);q=cl(q-(w[0]-netD)/Math.max(1e-8,w[1]*dt),0,1);}
   const zz=hermite(oldz,z,ovz,vz,dt,q),xx=hermite(oldx,x,ovx,vx,dt,q),slope=zz[1]/Math.max(1e-8,xx[1]);
   net={z:zz[0],t:t+q*dt,jx:mix(oldkx,kx,q)-slope*mix(oldjx,jx,q),jy:mix(oldky,ky,q)-slope*mix(oldjy,jy,q)};
  }
  if(ovz>0&&vz<=0){const u=cl(ovz/(ovz-vz),0,1);peak=Math.max(peak,hermite(oldz,z,ovz,vz,dt,u)[0]);}peak=Math.max(peak,z);t=nt;if(nodes)nodes.push([t,x,z,vx,vz]);
 }
 return {x,z,vx,vz,jx,jy,kx,ky,net,nodes,peak};
}
function hermite(p,q,a,b,h,u){const u2=u*u,u3=u2*u;return [(2*u3-3*u2+1)*p+(u3-2*u2+u)*a*h+(-2*u3+3*u2)*q+(u3-u2)*b*h,((6*u2-6*u)*p+(3*u2-4*u+1)*a*h+(-6*u2+6*u)*q+(3*u2-2*u)*b*h)/Math.max(1e-9,h)];}
function inverseAir(d,h,T,netD,guess){
 let vx=guess?.vx??(AIR_LENGTH*Math.expm1(d/AIR_LENGTH)/T),vz=guess?.vz??(vx*(-h/Math.max(.1,d)+GRAVITY*T*T/(2*Math.max(.1,d)))),a;
 vx=cl(vx,.08,220);vz=cl(vz,-130,130);
 for(let i=0;i<9;i++){
  a=airIntegrate(vx,vz,h,T,netD);let ex=d-a.x,ez=-a.z;if(Math.hypot(ex,ez)<.0015)break;
  const det=a.jx*a.ky-a.jy*a.kx;if(Math.abs(det)<1e-10)break;
  let dx=(ex*a.ky-ez*a.jy)/det,dz=(ez*a.jx-ex*a.kx)/det;
  const scale=Math.min(1,(vx*.65+2)/Math.max(.001,Math.abs(dx)),(Math.abs(vz)*.65+12)/Math.max(.001,Math.abs(dz)));vx=cl(vx+dx*scale,.04,240);vz=cl(vz+dz*scale,-160,180);
 }
 a=airIntegrate(vx,vz,h,T,netD);return {vx,vz,T,a,error:Math.hypot(a.x-d,a.z)};
}
function fitAir(d,h,netD,wanted,T0,minT,maxT,fast,maxSpeed){
 let T=cl(T0,minT,maxT),fit=inverseAir(d,h,T,netD),best=fit;
 const cost=f=>f.error*5+Math.abs((f.a.net?.z??-2)-wanted)+(Math.max(0,Math.hypot(f.vx,f.vz)-maxSpeed))*0.04;
 // Net height increases monotonically with flight clock for fixed start/end.
 // Newton uses the implicit launch-velocity derivative from the endpoint solve.
 for(let i=0;i<7;i++){
  const z=fit.a.net?.z??-2,err=wanted-z;if(cost(fit)<cost(best))best=fit;
  if(Math.abs(err)<.012&&fit.error<.015)break;
  const a=fit.a,det=a.jx*a.ky-a.jy*a.kx,dx=(-a.vx*a.ky+a.vz*a.jy)/det,dz=(-a.vz*a.jx+a.vx*a.kx)/det,deriv=a.net?a.net.jx*dx+a.net.jy*dz:1;
  let nt=cl(T+cl(err/Math.max(.25,deriv),-.30,.40),minT,maxT);if(Math.abs(nt-T)<.002)break;
  fit=inverseAir(d,h,nt,netD,{vx:fit.vx*T/nt,vz:fit.vz*T/nt+GRAVITY*(nt-T)*.7});T=nt;
 }
 if(cost(fit)<cost(best))best=fit;
 // Prefer the requested feasible flight time; max launch speed is a physical cap,
 // not an excuse to warp the path after impact. Longer times lower horizontal speed.
 if(Math.hypot(best.vx,best.vz)>maxSpeed&&best.T<maxT){const nt=cl(best.T*Math.min(1.4,Math.hypot(best.vx,best.vz)/maxSpeed),minT,maxT),f=inverseAir(d,h,nt,netD);if(f.error<.025&&Math.hypot(f.vx,f.vz)<Math.hypot(best.vx,best.vz))best=f;}
 return best;
}
// Solve the inverse endpoint problem at a specified launch angle. Flight time is
// a free variable; the derivative is obtained from the endpoint Jacobian.
function fitAngle(d,h,netD,theta,T0,minT,maxT){
 let T=cl(T0,minT,maxT),f=inverseAir(d,h,T,netD),best=f,err0=Infinity;
 for(let i=0;i<6;i++){
  const angle=Math.atan2(f.vz,f.vx),err=theta-angle,cost=Math.abs(err)+f.error;
  if(cost<err0){best=f;err0=cost;}if(Math.abs(err)<.002&&f.error<.003)break;
  const a=f.a,det=a.jx*a.ky-a.jy*a.kx;if(Math.abs(det)<1e-10)break;
  const dx=(-a.vx*a.ky+a.vz*a.jy)/det,dz=(-a.vz*a.jx+a.vx*a.kx)/det,deriv=(f.vx*dz-f.vz*dx)/(f.vx*f.vx+f.vz*f.vz);
  if(!Number.isFinite(deriv)||deriv<.02)break;
  const nt=cl(T+cl(err/deriv,-.4,.4),minT,maxT);if(Math.abs(nt-T)<.001)break;
  f=inverseAir(d,h,nt,netD,{vx:f.vx*T/nt,vz:f.vz*T/nt+GRAVITY*(nt-T)*.7});T=nt;
 }return best;
}
function airState(b,t){const a=b.air,t0=a[0][0];t=cl(t,t0,a[a.length-1][0]);let lo=0,hi=a.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(a[m][0]<=t)lo=m;else hi=m;}const u=a[lo],v=a[hi],dt=v[0]-u[0],q=dt?cl((t-u[0])/dt,0,1):0,X=hermite(u[1],v[1],u[3],v[3],dt,q),Z=hermite(u[2],v[2],u[4],v[4],dt,q);return {s:X[0],z:Z[0],vx:X[1],vz:Z[1]};}
function airPredict(from,h,vx,vy,vz,offset=0){
 const speed=Math.hypot(vx,vy),ux=speed?vx/speed:1,uy=speed?vy/speed:0;let x=0,z=h,t=offset,u=speed,w=vz;const air=[[t,x,z,u,w]];
 for(let i=0;i<180&&t<offset+4.8;i++){const dt=Math.min(.045,.20*AIR_LENGTH/Math.max(1,Math.hypot(u,w))),ow=w,ou=u,ox=x,oz=z;w-=GRAVITY*dt*.5;const a=Math.max(1e-9,Math.hypot(u,w)*dt/AIR_LENGTH),F=dt*Math.log1p(a)/a;x+=u*F;z+=w*F;u/=1+a;w=w/(1+a)-GRAVITY*dt*.5;if(z<=0){let q=cl(oz/Math.max(1e-9,oz-z),0,1);for(let j=0;j<3;j++){const b=hermite(oz,z,ow,w,dt,q);q=cl(q-b[0]/Math.min(-1e-8,b[1]*dt),0,1);}const a=hermite(ox,x,ou,u,dt,q),b=hermite(oz,z,ow,w,dt,q);t+=dt*q;x=a[0];air.push([t,x,0,a[1],b[1]]);break;}t+=dt;air.push([t,x,z,u,w]);}
 return {from:{...from},to:pt(from.x+ux*x,from.y+uy*x),h,T:t,model:5,air,ux,uy,drag:1,arc:0};
}
function flightBasis(b,u,q){if(b.model===4){const k=b.verticalDrag??b.drag,vq=(1-Math.exp(-k*u))/(1-Math.exp(-k)),mid=(1-Math.exp(-k*.5))/(1-Math.exp(-k));return [1-vq,(vq-u)/Math.max(1e-8,mid-.5)];}if(b.model===3){let k=b.drag,m=b.curveMix??.32,mid=(1-Math.exp(-k*.5))/(1-Math.exp(-k));let vq=q;if(b.verticalDrag){k=b.verticalDrag;vq=(1-Math.exp(-k*u))/(1-Math.exp(-k));mid=(1-Math.exp(-k*.5))/(1-Math.exp(-k));}return [1-mix(u,vq,m),mix(4*u*(1-u),(vq-u)/Math.max(1e-8,mid-.5),m)];}let x=b.model===2?q:u;return [1-x,4*x*(1-x)];}
function ballAt(b,t){if(b.model===5&&b.air){const a=airState(b,t);return {x:b.from.x+b.ux*a.s,y:b.from.y+b.uy*a.s,z:Math.max(0,a.z)};}let u=cl(t/b.T,0,1),q=(1-Math.exp(-b.drag*u))/(1-Math.exp(-b.drag)),[base,arc]=flightBasis(b,u,q);return {x:mix(b.from.x,b.to.x,q),y:mix(b.from.y,b.to.y,q),z:Math.max(0,(b.model===3||b.model===4)?b.h*base+b.arc*arc:b.h*(1-(b.model===2?q:u))+4*b.arc*(b.model===2?q:u)*(1-(b.model===2?q:u)))};}
function apexTime(b){if(b.model===5&&b.air){let a=b.air;if(a[0][4]<=0)return a[0][0];for(let i=1;i<a.length;i++)if(a[i][4]<=0)return mix(a[i-1][0],a[i][0],a[i-1][4]/Math.max(1e-9,a[i-1][4]-a[i][4]));return b.T;}let lo=0,hi=b.T;for(let i=0;i<14;i++){let a=lo+(hi-lo)/3,c=hi-(hi-lo)/3;if(ballAt(b,a).z<ballAt(b,c).z)lo=a;else hi=c;}return (lo+hi)/2;}
function crossAt(b){if(b.model===5&&b.air){if(b.netCross)return b.netCross;const d=(N-b.from.x)/b.ux;if(!(d>0&&d<b.air.at(-1)[1]))return null;let lo=b.air[0][0],hi=b.T;for(let i=0;i<18;i++){const t=(lo+hi)/2;if(airState(b,t).s<d)lo=t;else hi=t;}const t=(lo+hi)/2;return {t,z:airState(b,t).z,y:b.from.y+b.uy*d};}let q=(N-b.from.x)/(b.to.x-b.from.x);if(!Number.isFinite(q)||q<=0||q>=1)return null;let u=-Math.log(1-q*(1-Math.exp(-b.drag)))/b.drag;return {t:u*b.T,z:ballAt(b,u*b.T).z,y:mix(b.from.y,b.to.y,q)};}
function inBounds(p,side){return depth(side,p)>=-1e-7&&depth(side,p)<=6.7+1e-7&&Math.abs(p.y)<=W+1e-7;}
// A single execution model is shared by candidate evaluation and actual flight.
// Contact quality already includes the receiver's time, balance, reach and speed stress;
// do not add an independent duplicate pressure penalty to the outgoing stroke.
function strokeSpread(p,kind,f,quality,key,receiving=false){
 const skill=execution(p,kind,receiving),stable=P.effective(p,'击球稳定性'),focus=P.effective(p,'专注度'),composure=key?P.effective(p,'抗压能力'):85;
 const delicate=['net','block','kill','drive','short'].includes(kind),stress=cl((.86-quality)/.66,0,1);
 const scale=cl(1+(85-skill)*.012+(85-stable)*.014+(85-focus)*.006+(85-composure)*.008+f*.004+.28*(p._acute||0)+1.05*stress,.52,2.45);
 const sigma=.94*SHOTS[kind][3]*scale*(['short','long'].includes(kind)?.72:1)*(['drop','punch','clear'].includes(kind)?cl(1-(P.rawAttr(p,'拉吊控球')-85)*.016,.68,1.32):1);
 const precision=cl(1-(P.rawAttr(p,SHOTS[kind][4])-85)*(['drop','punch','clear'].includes(kind)?.022:.012),.65,1.35);
 const heightSigma=((delicate?.043:.026)*scale+(delicate?.072:.048)*stress)*precision;
 return {sigma,heightSigma,stress,skill};
}
function directionalSpread(p,kind,from,target,quality,spread){
 const angle=Math.atan2(Math.abs(target.y-from.y),Math.max(.15,Math.abs(target.x-from.x))),turn=cl(angle/.85,0,1),technical=cl((spread.skill-55)/44,0,1),stress=cl((.86-quality)/.66,0,1);
 const factor=1+turn*(.08+.28*stress)*(1-.45*technical);
 return {...spread,sigma:spread.sigma*factor,heightSigma:spread.heightSigma*(1+(factor-1)*.65)};
}
// V12: smooth constant-effective-linear-drag flight, common to every shot.
// Effective component drag with gravity; calibrated per shot, not a full aerodynamic CFD model.
const FLIGHT_DRAG={short:.85,long:1.05,clear:1.05,punch:1.45,drop:1.20,smash:3.55,half:2.60,drive:2.05,net:.85,kill:3.05,lift:1.15,block:1.00};
const VERTICAL_DRAG={short:1.10,long:2.4,clear:3.8,punch:3.6,drop:1.85,net:2.2,block:1.55,lift:3.2};
function ballVelocity(b,t){if(b.model===5&&b.air){const a=airState(b,t);return {x:b.ux*a.vx,y:b.uy*a.vx,z:a.vz};}const u=cl(t/b.T,0,1),k=b.drag,qp=k*Math.exp(-k*u)/(1-Math.exp(-k));if(b.model===4){const kv=b.verticalDrag??k,vp=kv*Math.exp(-kv*u)/(1-Math.exp(-kv));const dz=-b.h*vp+b.arc*(vp-1)/Math.max(1e-8,(1-Math.exp(-kv*.5))/(1-Math.exp(-kv))-.5);return {x:(b.to.x-b.from.x)*qp/b.T,y:(b.to.y-b.from.y)*qp/b.T,z:dz/b.T};}const l=Math.max(0,t-.008),r=Math.min(b.T,t+.008),a=ballAt(b,l),c=ballAt(b,r),dt=Math.max(.0001,r-l);return {x:(c.x-a.x)/dt,y:(c.y-a.y)/dt,z:(c.z-a.z)/dt};}
function rebound(p,kind,quality,contact){if(!contact||!Number.isFinite(contact.speed))return {factor:1,boost:0};const v=cl(contact.horizontalSpeed??contact.speed,0,55),tech=P.effective(p,['block','lift'].includes(kind)?'防守能力':['net','kill'].includes(kind)?'网前技术':kind==='drive'||kind==='punch'||kind==='drop'?'拉吊控球':'后场技术'),stable=P.effective(p,'击球稳定性'),control=cl(.5*quality+.5*(.7*tech+.3*stable-35)/64,0,1),pace=cl((v-4)/22,0,1),retention={block:.23,drive:.28,kill:.16,net:.12,lift:.10,punch:.14,clear:.08,drop:.07,smash:.07,half:.10}[kind]??0;
 // A compact block/drive can borrow pace; poor control of a fast incoming shuttle reduces usable pace.
 const boost=pace*(retention*control-.18*(1-control));return {factor:cl(1+boost,.82,1.26),boost};}
function mishitChance(p,f,kind,quality){const stable=P.effective(p,'击球稳定性'),focus=P.effective(p,'专注度');return cl((.010+.100*(1-quality)**1.45)*Math.exp((85-stable)*.040+(85-focus)*.018+f*.006)*(kind==='short'||kind==='long'?.22:1),.001,.12);}
// V14.5: trajectory envelopes are game calibration, not BWF height regulations.
// All candidates and executed strokes share these limits; no animation clipping.
const ARC_LIMITS=Object.freeze({short:[2.05,1.45,72],long:[9.0,3.35,79],clear:[8.2,2.95,64],punch:[4.65,1.95,43],drop:[3.65,1.85,25],smash:[0,1.22,0],half:[0,1.45,0],drive:[2.65,1.30,23],net:[2.35,1.45,82],kill:[0,.95,0],lift:[8.2,2.95,76],block:[2.65,1.55,76]});
function liftMode(quality,h,contact){const stress=cl((.80-quality)/.55,0,1),balance=contact?.geometry?.balance??.85;return contact?.special||quality<.40||stress+.30*(1-balance)>.78?'defensive':quality>.72&&h>.90&&balance>.55?'attacking':'normal';}
function envelope(kind,h,mode){let [peak,time,angle]=ARC_LIMITS[kind];if(kind==='lift'){[peak,time,angle]=mode==='attacking'?[4.35,1.90,55]:mode==='defensive'?[8.2,2.95,76]:[5.95,2.40,65];}return {peak:Math.max(h,peak),time,angle:angle*Math.PI/180};}
function limitFit(fit,d,h,netD,minT,limits){
 const ok=f=>f.a.peak<=limits.peak+.002&&Math.atan2(f.vz,f.vx)<=limits.angle+.0005;
 if(ok(fit))return fit;
 // For fixed endpoints, lower flight time reduces apex/angle. Search a feasible
 // endpoint first; if impossible, keep a physically launched miss instead.
 let lo=Math.min(minT,fit.T),hi=fit.T,best=inverseAir(d,h,lo,netD);
 if(!ok(best)){lo=Math.min(.10,lo);best=inverseAir(d,h,lo,netD);}
 if(!ok(best))return best;
 for(let i=0;i<9;i++){const mid=(lo+hi)/2,f=inverseAir(d,h,mid,netD);if(ok(f)){lo=mid;best=f;}else hi=mid;}
 return best;
}
// Direction-dependent stroke load. A true rear backhand cannot deliver the same
// cross-court power/accuracy as a prepared forehand. Use the same factor for preview and execution.
function strokeConstraint(kind,from,target,contact){
 const g=contact?.geometry;if(!g||contact.special)return {power:1,spread:1,load:0};
 const angle=Math.atan2(Math.abs(target.y-from.y),Math.max(.15,Math.abs(target.x-from.x))),cross=cl(angle/.72,0,1),ext=cl((g.extension-.72)/.28,0,1);
 const rear=g.strokeType==='overBack',around=g.strokeType==='aroundHead',back=g.back;
 const load=cl((rear?.50:around?.22:back?.18:0)*cross+.16*ext,0,1);
 return {power:(rear&&['smash','half'].includes(kind)?.72:1)*(1-(rear?.12+.17*cross:around?.04+.08*cross:back?.07*cross:0)*(kind==='drop'||kind==='net'||kind==='block'?.45:1)),spread:1+load*.65+(rear&&['smash','half'].includes(kind)?.24:0),load};
}
function steepServeDemand(kind,v){return kind==='long'?cl((Math.atan2(Math.max(0,-v.z),Math.hypot(v.x,v.y))-.66)/.65,0,1):0;}
function makeBall(r,kind,from,h,target,p,f,quality,pressure,key,preview=false,receiving=false,errors=null,contact=null,trajectoryMode=null){
 const constraint=strokeConstraint(kind,from,target,contact),s=SHOTS[kind],spread=directionalSpread(p,kind,from,target,quality,strokeSpread(p,kind,f,quality,key,receiving)),{skill,stress}=spread,sigma=spread.sigma*(contact?.special?.spread??1)*constraint.spread,heightSigma=spread.heightSigma*(contact?.special?.spread??1)*Math.sqrt(constraint.spread);
 const timing=errors?.[0]??(preview?0:cl(norm(r),-3.5,3.5)),direction=errors?.[1]??(preview?0:cl(norm(r),-3.5,3.5)),vertical=errors?.[2]??(preview?0:cl(norm(r),-3.5,3.5));
 const sign=target.x>=from.x?1:-1,to=pt(target.x+sign*timing*sigma,target.y+direction*sigma*.85*(errors?1:P.bodyFor(p).hand*sign)),d=dist(from,to),drag=FLIGHT_DRAG[kind],fast=['smash','half','kill','drive'].includes(kind),high=['clear','lift','long','punch'].includes(kind),feedback=rebound(p,kind,quality,contact);
 const launch={short:7,long:15,clear:57.8,punch:45,drop:22.2,smash:70,half:35,drive:35,net:6.2,kill:38,lift:18,block:12}[kind];
 let v0=launch*cl(1+(skill-85)*.006-(1-quality)*.15-f*.0016,.68,1.20)*feedback.factor*(contact?.special?.power??1)*constraint.power;
 if(kind==='smash'||kind==='half')v0*=cl(1+.006*(P.rawAttr(p,'杀球进攻')-85)+.0025*(P.rawAttr(p,'爆发力')-85),.78,1.24);
 const q=(N-from.x)/(to.x-from.x),valid=q>0&&q<1,netD=valid?d*q:Infinity;
 const touch=cl((P.rawAttr(p,SHOTS[kind][4])-85)/14,-1,1)*cl((quality-.45)/.4,0,1);
 let wanted=({short:1.73,long:3.65,clear:4.0,punch:2.55,drop:1.70,smash:1.65,half:1.72,drive:1.70,net:1.74,kill:1.63,lift:3.75,block:1.77})[kind];
 const mode=kind==='lift'?(trajectoryMode||liftMode(quality,h,contact)):null,limits=envelope(kind,h,mode);
 let referenceAngle=null;
 // V13.9: distinguish recovery-height clear/lift from the attacking punch clear.
 // Tsai et al. (ISBS 2008) measured 57.8 m/s and +15.2 deg for prepared
 // clears, 22.2 m/s and +5.9 deg for drops. Those are controlled strokes,
 // not universal launch conditions. A recovery clear needs a higher angle.
 if(kind==='long'&&valid)referenceAngle=(57.5+1.5*cl((d-8)/2,-1,1))*Math.PI/180;
 if(kind==='clear'&&valid){
  referenceAngle=(24+4*cl((d-10)/3,0,1)+15*stress)*Math.PI/180;
 }
 if(kind==='lift'&&valid){
  const base=mode==='attacking'?36:mode==='defensive'?55:44;
  referenceAngle=cl(base-1.4*(d-8)+3*stress,25,65)*Math.PI/180;
 }
 if(kind==='punch'&&valid)referenceAngle=(12+8*stress)*Math.PI/180;
 if(kind==='drop'&&valid){
  // A slow drop stays near the tape; a deeper fast drop may descend earlier.
  // From the rear court a modest positive launch angle can still be a drop.
  const dep=Math.abs(target.x-N),theta=5.9-5*cl((dep-1.25)/1.4,0,1)-8*cl((8-d)/4,0,1)-4*stress;
  referenceAngle=theta*Math.PI/180;
 }
 if(high&&valid&&kind!=='lift'&&kind!=='clear')wanted=mix(1.78,wanted,cl(q/.32,0,1));
 wanted+=(['net','block','drive','short','drop','lift','clear'].includes(kind)?stress*.13:0)-(['net','drop','block'].includes(kind)?touch*.045:0);
 const poseStress=contact?.geometry?cl(.45*(1-contact.geometry.balance)+.35*cl((contact.geometry.extension-.75)/.25,0,1)+.20*(contact.geometry.back?1:0),0,1):0;
 const safety=(kind==='short'||kind==='long'?0:cl((1-quality)*.075+poseStress*.085,0,.12));
 wanted=Math.max(1.60,wanted-feedback.boost*(fast?.42:high?.26:.34))+safety;
 // Rare poor execution changes the physical launch, not the score. Probability is a fitted game parameter.
 const stable=P.effective(p,'击球稳定性'),focus=P.effective(p,'专注度');
 const mishit=!preview&&!errors&&r&&r()<mishitChance(p,f,kind,quality);
 let mishitDrop=high?.40+.35*stress:Math.max(.30,wanted-1.30),err=heightSigma*(.48*timing+.877268*vertical)-(mishit?mishitDrop:0);
 // Speed preference uses a quadratic-drag horizontal estimate. Net-height fitting
 // adjusts the initial launch only. The full trajectory is integrated once.
 let T0=AIR_LENGTH*Math.expm1(d/AIR_LENGTH)/Math.max(1,v0),minT,maxT;
 if(fast){minT=cl(T0*.91,.11,2.15);maxT=cl(Math.max(T0*(kind==='kill'?1.85:kind==='drive'?1.85:1.42),kind==='kill'?.57:kind==='drive'?.55:0),minT+.02,2.6);}
 else if(high){minT=kind==='punch'?.65:kind==='clear'?1.05:kind==='long'?2.20:mode==='attacking'?.65:mode==='normal'?.95:1.25;minT/=Math.sqrt(feedback.factor);maxT=limits.time;T0=cl(T0,minT,maxT);}
 else{minT=.22;maxT=2.8;T0=cl(T0,minT,maxT);}
 maxT=Math.min(maxT,limits.time);minT=Math.min(minT,maxT-.02);T0=cl(T0,minT,maxT);
 const speedCap=({short:15,long:55,clear:72,punch:82,drop:34,smash:88,half:80,drive:65,net:15,kill:75,lift:58,block:30})[kind]*cl(1+(skill-85)*.004,.84,1.06)*(fast?1-.16*poseStress:1-.055*poseStress)*(contact?.special?.power??1)*constraint.power;
 let fit;
 if(referenceAngle!==null&&valid){
  const angleFit=fitAngle(d,h,netD,referenceAngle,T0,minT,maxT),z=angleFit.a.net?.z??0;
  // Deep prepared overheads use the measured angle when compatible with the net.
  // A drop may not fly arbitrarily high; a defensive clear must clear the net.
  const targetNet=(kind==='long'?cl(z,4.0,8.8):kind==='clear'?cl(z,2.55,8.0):kind==='lift'?cl(z,1.76,limits.peak):kind==='punch'?cl(z,1.73,3.65):cl(z,1.66,1.91))+safety;
  if(kind==='drop'){mishitDrop=Math.max(.30,targetNet-1.30);err=heightSigma*(.48*timing+.877268*vertical)-(mishit?mishitDrop:0);}
  if(Math.abs(targetNet-z)<.012&&Math.abs(err)<.012&&angleFit.error<.012&&Math.hypot(angleFit.vx,angleFit.vz)<=speedCap)fit=angleFit;
  else fit=fitAir(d,h,netD,targetNet+err,angleFit.T,minT,maxT,fast,speedCap);
 }else fit=fitAir(d,h,netD,wanted+err,T0,minT,maxT,fast,speedCap);
 fit=limitFit(fit,d,h,netD,minT,limits);
 // A speed or angle conflict creates a genuine shorter/missed shot. Never inflate the arc.
 const launchSpeed=Math.hypot(fit.vx,fit.vz);if(launchSpeed>speedCap){fit={...fit,vx:fit.vx*speedCap/launchSpeed,vz:fit.vz*speedCap/launchSpeed,error:Infinity};}
 // If the inverse problem is unreachable (e.g. very close low point), retain the
 // physically launched trajectory and its actual landing rather than teleporting.
 const angle=Math.atan2(fit.vz,fit.vx);if(angle>limits.angle){const v=Math.hypot(fit.vx,fit.vz);fit={...fit,vx:v*Math.cos(limits.angle),vz:v*Math.sin(limits.angle),error:Infinity};}
 let a=airIntegrate(fit.vx,fit.vz,h,fit.T,netD,true);
 if(a.peak>limits.peak+.003){let lo=0,hi=Math.max(0,fit.vz);for(let i=0;i<12;i++){const v=(lo+hi)/2;if(airIntegrate(fit.vx,v,h,Math.max(fit.T,limits.time),Infinity).peak<=limits.peak-.005)lo=v;else hi=v;}fit={...fit,vz:lo,error:Infinity};a=airIntegrate(fit.vx,fit.vz,h,fit.T,netD,true);}
 const meta={trajectoryMode:mode,arcLimit:limits.peak,constraintFallback:fit.error>.012};
 const ux=d?(to.x-from.x)/d:1,uy=d?(to.y-from.y)/d:0;
 if(fit.error>.012||!Number.isFinite(a.x)||!Number.isFinite(a.z)||a.nodes.some(n=>n[2]<-.015&&n[0]<fit.T-.0001)){
  const b=airPredict(from,h,ux*fit.vx,uy*fit.vx,fit.vz);return {...b,...meta,v0:fit.vx,feedback:feedback.boost,mishitDrop,poseStress,safety,incomingSpeed:contact?.speed??0,incomingHorizontalSpeed:contact?.horizontalSpeed??contact?.speed??0};
 }
 // Small inverse numerical residual is corrected by a final refinement of the launch;
 // use the integrated endpoint (within millimetres of the requested target).
 const b={...meta,from:{...from},to:pt(from.x+ux*a.x,from.y+uy*a.x),h,T:fit.T,model:5,air:a.nodes,ux,uy,drag:1,arc:0,v0:fit.vx,feedback:feedback.boost,mishitDrop,poseStress,safety,incomingSpeed:contact?.speed??0,incomingHorizontalSpeed:contact?.horizontalSpeed??contact?.speed??0};
 if(a.net)b.netCross={t:a.net.t,z:a.net.z,y:from.y+uy*netD};return b;
}

Object.assign(P,{strokeConstraint,steepServeDemand,ARC_LIMITS,envelope,liftMode,mishitChance,flightBasis,ballAt,apexTime,crossAt,inBounds,makeBall,strokeSpread,directionalSpread,FLIGHT_DRAG,VERTICAL_DRAG,ballVelocity,rebound,airPredict,airIntegrate,inverseAir,fitAir,AIR_LENGTH});
})(globalThis.SmashParts ||= {});


/* interception */
/* SMASH V10.7 spatial — interception; extracted from the original release. */
(function(P){
"use strict";
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise,fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,pathState,pathPos,flightBasis,ballAt,apexTime,crossAt,inBounds,makeBall}=P;
// Foot placement is height-dependent: overhead contacts are in front of the torso,
// low shots use a lunge; don't let a fixed long reach keep both players at centre.
function footFor(pos,b,m,side,compact=false){let d=dist(pos,b),high=b.z>1.9,low=b.z<1.25,r=Math.min(m.reach*(high?.54:low?.83:.70),d),f=d?lerp(b,pos,r/d):pt(b.x,b.y);if(high){let sign=side===0?-1:1;f.x=mix(f.x,b.x+sign*.38,compact?.22:.62);f.y=mix(f.y,b.y,compact?.08:.25);}const bound=v=>pt(cl(v.x,side===0?-.65:N+.12,side===0?N-.12:L+.65),cl(v.y,-W-.55,W+.55));f=bound(f);if(!P.contactGeometry(f,b,side,m).feasible){for(const t of [.25,.50,.75]){const test=bound(lerp(f,b,t));if(P.contactGeometry(test,b,side,m).feasible){f=test;break;}}}
 // Compact backhand defense: do not run the pelvis all the way to the shuttle
 // if the racket can intercept in front of the body. Choose a reachable root
 // with reserve extension; same deterministic candidates in forecast and execution.
 if(compact&&b.z<1.90&&(b.y-pos.y)*(side===0?1:-1)*m.hand<-.18){const forward=side===0?1:-1,hand=m.hand;let best=f,score=Infinity;for(const root of [f,bound(pos),...([.25,.46,.65].flatMap(dx=>[.32,.56,.78].map(dy=>bound(pt(b.x-forward*dx,b.y+forward*hand*dy)))) )]){const g=P.contactGeometry(root,b,side,m);if(!g.feasible)continue;const cost=dist(pos,root)+.65*cl((g.extension-.78)/.22,0,1)+.20*cl((.10-(b.x-root.x)*forward)/.5,0,1);if(cost<score){score=cost;best=root;}}f=best;}return f;}
// V10.9: observation-only prediction. Physics owns the actual path; the player
// reads delayed positions, then estimates the decay/flight clock from those samples.
const FAST=['smash','half','kill','drive'], HIGH=['clear','lift','long','punch'];
const DRAG=P.FLIGHT_DRAG;
const CURVE={clear:.30,lift:.76,long:.30,punch:.28,drop:.42,net:.36,block:.36,short:.30};
function ability(p,k){return cl(a(p,k)+.50*(rawAttr(p,k)-a(p,k)),35,99);}
function predict(observe,t,kind,p,f,bias){
 const dt=Math.min(.065,t*.65),q1=observe(Math.max(0,t-dt)),q2=observe(t);
 const read=.55*ability(p,'判断与预判')+.25*ability(p,'专注度')+.20*ability(p,'战术意识');
 const uncertainty=cl((.24+(99-read)*.010+f*.004)*Math.exp(-2.9*t),.035,1.15),dx=q2.x-q1.x,dy=q2.y-q1.y,dz=q2.z-q1.z,ds=Math.hypot(dx,dy,dz),decay=ds>1e-8?P.AIR_LENGTH*(-Math.expm1(-ds/P.AIR_LENGTH))/ds:1;
 const vx=dx/Math.max(.001,dt)*decay,vy=dy/Math.max(.001,dt)*decay,vz=dz/Math.max(.001,dt)*decay-9.81*dt*.5;
 const b=P.airPredict(pt(q2.x,q2.y),q2.z,vx*(1+.07*bias[0]*uncertainty),vy*(1+.07*bias[0]*uncertainty)+bias[2]*uncertainty*.45*P.bodyFor(p).hand,vz+bias[3]*uncertainty*.55,t);
 return {b,uncertainty};
}
function quickReaction(m,p,kind){return cl(m.react-((FAST.includes(kind)||kind==='punch')?cl(.027+(ability(p,'判断与预判')-85)*.0012,.012,.045):0)-.0011*(ability(p,'判断与预判')-a(p,'判断与预判')),.075,.46);}
function recoveryTime(p,kind,f){const base={short:.10,long:.24,clear:.25,punch:.20,drop:.19,smash:.30,half:.23,drive:.15,net:.13,kill:.18,lift:.20,block:.11}[kind]??.15;const low=['net','block','lift'].includes(kind),m=mobility(p,f);return base*cl(1+(85-ability(p,'灵活性'))*.009+(85-ability(p,'爆发力'))*.004+f*.004+.40*(p._acute||0),.65,2.0)*(low?1+(m.lowScale-1)/m.agilityReserve:1);}
// Follow-through and locomotion overlap; strong legs recover faster from an overhead attack.
function recoveryDelay(p,kind,quality,f){return recoveryTime(p,kind,f)*(['smash','half','clear','punch','drop'].includes(kind)?.55:.75)*(['clear','punch','drop'].includes(kind)?cl(1-.014*(rawAttr(p,'拉吊控球')-85),.86,1.14):1)+(1-quality)*.085;}
// V14.8: landing and follow-through run concurrently, not consecutively.
// Emergency recovery remains a separate constraint; no change to speed or reach.
function strokeRecovery(p,kind,quality,f,contact){const air=(contact?.geometry?.flightTime??0)*.5;return {air,delay:Math.max(air,recoveryDelay(p,kind,quality,f),contact?.special?.recovery??0)};}
function gripChangeDelay(last,back,kind,high=false){return last&&last.back!=null&&last.back!==back?(['smash','half','drive'].includes(kind)&&!high&&back?.016:.042):0;}
function contactFailure(burden,critical,margin,skill,focus,acute=0){return cl((.0015+.36*burden**2.05+.19*critical**3*burden+.09*cl(-margin/.12,0,1)+.13*acute*burden**1.3)*Math.exp((85-skill)*.021+(85-focus)*.010),.0003,.45);}
// Common reach envelope: normal contact versus a stretched, lower-quality save.
function contactReach(m,q,kind){const fast=FAST.includes(kind),front=['net','drop','block','short'].includes(kind),r=m.reach+(fast?.37:front?.21:.16);return r*(q.z>1.9?.87:q.z<1.25?1.07:1);}
function rescueReach(m,q,p,kind){return contactReach(m,q,kind)+cl(.20+(ability(p,'灵活性')-85)*.004+(ability(p,'防守能力')-85)*.002,.10,.29)*(q.z<1.6?1:.48);}
// V13.2: local handedness and actual posture, not an identity bonus.
function contactDemand(p,m,side,root,q,kind,geometry){
 const lateral=(q.y-root.y)*(side===0?1:-1)*m.hand, forward=(q.x-root.x)*(side===0?1:-1), high=q.z>1.90, rear=depth(side,q)>3.8;
 const back=cl((-lateral-.15)/.65,0,1), late=cl((.18-forward)/.65,0,1), stretch=cl(((geometry?.extension??.75)-.65)/.35,0,1);
 const overhead=high&&rear?(geometry?.strokeType==='overBack'?Math.max(.65,back):back)*(.35+.65*late):0;
 const jam=FAST.includes(kind)?cl(1-Math.abs(lateral-.12*m.body.scale)/.36,0,1)*cl((1.85-q.z)/.9,0,1):0;
 const skill=cl((ability(p,'后场技术')+ability(p,'灵活性')-170)/28,-.5,.5), def=cl((ability(p,'防守能力')-85)/14,-.5,.5);
 const low=cl((1.25-q.z)/1.07,0,1),mobilityDelta=((m.lowScale??1)-1)/(m.agilityReserve??1),lowTransition=low*(.45+.55*stretch)*mobilityDelta;
 return {back,overhead,jam,lowTransition,prep:.080*lowTransition+.042*overhead*(1-.35*skill)+.024*jam*(1-.35*def),quality:.11*lowTransition+.065*overhead*(.55+.45*stretch)*(1-.35*skill)+.038*jam*(1-.35*def)};
}
function receivePressure(timeStress,speedStress,reachStress,rapid,motionStress){return {burden:cl(.28*timeStress+.24*speedStress+.19*reachStress+.15*rapid+.14*motionStress,0,1),critical:Math.max(timeStress*.88,rapid*.84,speedStress*.78,reachStress*.68)};}
function intercept(b,pos,p,f,side,incoming,serve=false,vel=pt(0,0),context={}){
 const r=context.r||P.rng(1),m={...mobility(p,f),brake:.60},fast=FAST.includes(incoming),high=HIGH.includes(incoming),bias=Array.from({length:4},()=>cl(norm(r),-2.2,2.2)),readSkill=ability(p,'判断与预判'),focus=ability(p,'专注度'),agility=ability(p,'灵活性'),tech=.50*ability(p,serve?'接发球':'防守能力')+.30*ability(p,'网前技术')+.20*ability(p,'击球稳定性');
 const quick=fast||incoming==='punch',forecourt=['net','drop','block','short'].includes(incoming);
 const splitDelay=cl(.035+(m.turn-.10)*.40+(Math.hypot(vel.x,vel.y)/m.v)*.035,.022,.10);
 const prior=context.last,elapsed=prior?(context.time||0)-prior.time:0,serviceReady=(prior?.kind==='short'&&elapsed>=.20&&elapsed<1.5)||(prior?.kind==='long'&&elapsed>=1.7&&elapsed<3.5),attackReady=['smash','half'].includes(prior?.kind)&&elapsed>=.18&&elapsed<.85,ready=serviceReady||attackReady;
 const react=cl(quickReaction(m,p,incoming)-(forecourt?.025:0)+(serve?(85-ability(p,'接发球'))*.0015:0)+(ready?.20:.50)*splitDelay-(serviceReady?.025:attackReady?.012:0),.075,.46),lag=cl(.048+(99-readSkill)*.0011+f*.0005,.045,.15),dt=quick||forecourt?.025:.035,update=quick||forecourt?.055:.075;
 // Raw athletic attributes retain individual differences after the career engine compresses form.
 // mobility already accounts for the physical attributes; avoid applying them twice.
 const urgent=quick||forecourt;
 const last=context.last,airUntil=last?Math.max(0,(last.airUntil??0)-(context.time||0)):0,restUntil=last?Math.max(airUntil,Math.max(last.time+recoveryTime(p,last.kind,f),last.rescueUntil??0)-(context.time||0),0):0,lockedUntil=last?Math.max(0,(last.rescueLockUntil??0)-(context.time||0)):0;
 const maxZ=m.maxZ,reach=m.reach+(fast?.37:forecourt?.21:.16),cross=crossAt(b),netFault=!cross||cross.z<1.524+.026*cl(Math.abs(cross.y)/3.05,0,1)||Math.abs(cross.y)>3.05,stopAt=netFault?(cross?.t??b.T):b.T;
 const observe=t=>ballAt(b,t); // only called for timestamps <= current time
 let x={...pos},v={...vel},travelled=0,t=0,nextUpdate=react,aim=null,contactTime=Infinity,settled=false,forecast=null,letBall=false,attempt=null,best=null,miss=null,failed=false,reachAttempt=null,closest=Infinity;
 const nodes=[[0,x.x,x.y,v.x,v.y,0]],addNode=()=>nodes.push([t,x.x,x.y,v.x,v.y,travelled]);
 function prepFor(q){const back=P.strokeClass(x,q,side,m).toLowerCase().includes('back'),change=gripChangeDelay(last,back,incoming,q.z>1.9),demand=contactDemand(p,m,side,x,q,incoming);return {back,prep:cl((fast?.055:.092)+(99-agility)*.0014+change+f*.0005+demand.prep,.045,.26)};}
 function chooseContact(pred,now){const pb=pred.b;let chosen=null;const end=pb.T-.015;
  for(let tt=Math.max(now+.035,react+.035);tt<end;tt+=quick?.035:.055){let q=ballAt(pb,tt),d=depth(side,q);if(d<.012||d>7.15||Math.abs(q.y)>W+.55||q.z<.10||q.z>maxZ)continue;
   const calmFront=!quick&&d<2.55&&['net','drop','block','short'].includes(incoming);const foot=footFor(x,q,{...m,reach:reach*(calmFront?.89:q.z<1.4?1.05:.95)},side,quick),d0=dist(x,foot),speed=Math.hypot(v.x,v.y),align=d0*speed>.001?((foot.x-x.x)*v.x+(foot.y-x.y)*v.y)/(d0*speed):0,prep=prepFor(q).prep;
   const g=P.contactGeometry(foot,q,side,m,v),turnTime=speed>.3?m.turn*(1-align)*.50:0;const need=Math.max(0,restUntil-now,P.approachTime(x,foot,v,m)+turnTime)+prep+(g.jump?g.flightTime*.42:0),margin=tt-now-need,ideal=cl((q.z-.2)/2.5,0,1);
   const score=cl(margin,-1,.20)*2.95+ideal*(high?1.20:.94)-(tt-now)*(high?.45:.60)-d0*.04+(high?.12*cl(d/6.7,0,1):0)-(g.feasible?0:.85+Math.max(0,-g.margin)*2)-(quick&&g.back&&q.z<1.9?.24*cl((g.extension-.83)/.17,0,1):0);
   if(!chosen||score>chosen.score)chosen={foot,t:tt,margin,score};
  }return chosen;}
 function evaluate(now){if(now<Math.max(react,airUntil,lockedUntil)||failed||letBall||!aim||!forecast)return;
  const predicted=ballAt(forecast.b,now),near=dist(x,predicted);
  // Use delayed observed motion as a second, local estimate. The real trajectory
  // is used only to adjudicate the contact; never steer toward the true future.
  const obs=Math.max(0,now-lag),past=Math.max(0,obs-.035),a0=observe(past),a1=observe(obs),delta=Math.max(.001,obs-past),lead=now-obs;
  const sensed={x:a1.x+(a1.x-a0.x)*lead/delta,y:a1.y+(a1.y-a0.y)*lead/delta,z:Math.max(0,a1.z+(a1.z-a0.z)*lead/delta)};
  const sensedGap=dist(x,sensed),localNear=Math.min(near,sensedGap);
  if(localNear>rescueReach(m,predicted,p,incoming)+(quick?.50:.28))return;
  const q=observe(now),d=depth(side,q);if(d<.012||d>7.15||Math.abs(q.y)>W+.55||q.z<.10||q.z>maxZ)return;
  const hreach=contactReach(m,q,incoming),gap=dist(x,q),rescue=gap>hreach;
  const limit=rescueReach(m,q,p,incoming);
  // A visible attempt is not a successful contact. Keep the best near-miss for
  // animation, without altering scores or increasing racket reach.
  let geometry=P.contactGeometry(x,q,side,m,v);const normalFeasible=gap<=limit+.16&&geometry.feasible;
  if(gap>limit+.26||(!geometry.feasible&&q.z>.73*m.body.scale)){const excess=Math.max(gap-limit,-geometry.margin);if(excess<closest&&excess<.68){closest=excess;reachAttempt={t:now,q:{...q},foot:{...x},back:(q.y-x.y)*(side===0?1:-1)*m.hand<-.15};}return;}
  // Save attempts are a last resort; avoid wasting a good later overhead contact.
  if(rescue&&!quick&&now<contactTime-.11&&q.z>1.35&&forecast.b.T-now>.22)return;
  // For a slow forecourt ball, prefer a balanced lunge over an immediate maximum-reach swing.
  // Compare only delayed observations and the estimated trajectory, never a future true sample.
  const calmFront=!quick&&d<2.55&&['net','drop','block','short'].includes(incoming);
  if(calmFront&&q.z>.55&&gap>hreach*.85&&now<contactTime+.10){
   const horizon=.085,estimate=ballAt(forecast.b,now+horizon),advance=dist(x,aim),travel=Math.min(advance,Math.hypot(v.x,v.y)*horizon+.5*m.acc*horizon*horizon),futurePos=advance?lerp(x,aim,travel/advance):x;
   if(now+horizon<forecast.b.T-.025&&estimate.z>.36&&depth(side,estimate)>.075&&dist(futurePos,estimate)<Math.min(near,sensedGap)-.055)return;
  }
  const {prep}=prepFor(q),back=geometry.back,margin=now-Math.max(react,restUntil)-prep,velBall=(()=>{const bv=P.ballVelocity(b,now);return Math.hypot(bv.x,bv.y,bv.z)})(),speed=Math.hypot(v.x,v.y),front=d<2.5,ideal=cl((q.z-.2)/1.65,0,1),reachStress=cl(.60*(gap/hreach-(calmFront?.55:.47))/(calmFront?.49:.53)+.40*cl((geometry.extension-.70)/.30,0,1),0,1),timeStress=cl((.105-margin)/.15,0,1),motionStress=cl(speed/m.v*(calmFront?.94:1),0,1),rapid=last?cl((restUntil+prep+.16-now)/.22,0,1):0;
  const defense=rawAttr(p,'防守能力')-85, speedStress=cl((Math.hypot(P.ballVelocity(b,now).x,P.ballVelocity(b,now).y,.65*P.ballVelocity(b,now).z)-(front?5.5:10))/(front?19:31)*cl(1-.016*defense,.72,1.28),0,1),skill=high?.36*ability(p,'后场技术')+.44*ability(p,'拉吊控球')+.20*ability(p,'防守能力'):front?.55*tech+.45*ability(p,'网前技术'):.65*ability(p,'防守能力')+.35*ability(p,'后场技术');
  // Combined pressure, not additive independent failure chances for every factor.
  // A difficult but reachable contact normally gives a weak return; only genuinely
  // late or unstable contacts carry a substantial chance of missing the shuttle.
  const {burden,critical}=receivePressure(timeStress,speedStress,reachStress,rapid,motionStress);
  let quality=cl(.89+(high?.007:.004)*(skill-85)+.075*ideal+(fast?.010*defense*cl((velBall-4)/12,.25,1):.003*defense)-.48*burden-.085*critical-(rescue?.12:0)-(fast?.11*speedStress+.07*reachStress:0)-contactDemand(p,m,side,x,q,incoming,geometry).quality-.19*P.steepServeDemand(incoming,P.ballVelocity(b,now))-f*.0011-(p._acute||0)*(.09+.12*burden),.16,.98);
  // Actual missed swings remain terminal. Defer marginal attempted swings while
  // a later observed contact remains available; ordinary serves are usually touched.
  const special=P.emergencyRescue(p,f,side,x,q,v,m,geometry,{now,burden,critical,margin,normalFeasible,rescue,serve,key:context.key,last,clock:(context.time||0)+now,seed:context.seed??1});
  if(!normalFeasible&&!special){const excess=Math.max(gap-limit,-geometry.margin);if(excess<closest&&excess<.68){closest=excess;reachAttempt={t:now,q:{...q},foot:{...x},back};}return;}
  if(special){geometry=special.geometry;quality=cl(quality*special.quality,.12,.89);}
  const jumpPrep=geometry.jump?geometry.flightTime*.42:0;
  if(geometry.jump&&now-Math.max(react,restUntil)<jumpPrep)return;
  const normalFail=contactFailure(burden,critical,margin-jumpPrep,fast?.74*skill+.26*ability(p,'防守能力'):skill,focus,p._acute||0)*(serve?.10:1);
  const failProb=special?cl(normalFail*.75+.035+(1-special.quality)*.09,0,.65):normalFail;
  attempt={t:now,q,foot:{...x},margin,quality,back,failProb,speed:velBall,horizontalSpeed:Math.hypot(P.ballVelocity(b,now).x,P.ballVelocity(b,now).y),incoming,rapid,reachStress,prepared:margin>=0&&!rescue&&!special,burden,critical,rescue:rescue||!!special,geometry,incomingVelocity:P.ballVelocity(b,now),special:special?Object.fromEntries(Object.entries(special).filter(([k])=>k!=='geometry')):null};
  // Replan before committing to a swing, not after a real racket miss.
  if(!quick&&margin<-.035&&forecast.b.T-now>.17&&q.z>.32&&now<contactTime-.04)return;
  if(r()<failProb){failed=true;miss=attempt;}else best=attempt;
 }
 while(t<stopAt-1e-8){
  if(t>=nextUpdate-1e-8&&!failed){const obs=Math.max(.012,t-lag);if(obs<=t){forecast=predict(observe,obs,incoming,p,f,bias);const pb=forecast.b,os=forecast.uncertainty,land=pb.to,dep=depth(side,land),out=Math.max(Math.abs(land.y)-W,dep-6.7,serve?S-dep:-dep,serve?land.y*(context.sy||1):0);const remaining=pb.T-t;
   // Conservative line call: early predictions move first; borderline calls wait.
   letBall=out>Math.max(serve?.28:.12,os*(remaining>.35?1.85:1.0))&&t>react+.10;
   if(!letBall){const c=chooseContact(forecast,t);if(c){
    if(!aim||contactTime<t-.06||(!settled&&miss&&miss.margin<-.16&&c.margin>miss.margin+.13)){aim=c.foot;contactTime=c.t;settled=false;miss=c;}
    else {const remaining=contactTime-t,shift=dist(aim,c.foot),late=remaining<(urgent?.12:.24);
     // Commit to a playable contact window; ignore small forecast changes and
     // never chase a moving reach offset once feet have been planted.
     if((!late&&!settled||contactTime<t+.05&&c.margin>-.08)&&Math.abs(c.t-contactTime)>(urgent?.055:.10)){contactTime=mix(contactTime,c.t,urgent?.80:.46);}
     if(shift>(settled?.38:late?.24:urgent?.06:.10)&&(!late||shift>.42)&&(!settled||remaining>.12)){
       const maxShift=late?.15:urgent?.60:.28,alpha=Math.min(late?.30:urgent?.80:.50,maxShift/shift);aim=lerp(aim,c.foot,alpha);if(dist(x,aim)>.26)settled=false;
     } miss=c;
    }
   }else if(!aim){aim=footFor(x,{...land,z:.6},m,side);contactTime=pb.T-.06;settled=false;}}
   else {aim=null;contactTime=Infinity;settled=false;}
  }nextUpdate=t+update;}
  evaluate(t);if(best)break;
  const h=Math.min(dt,stopAt-t),goal=aim&&!failed&&!letBall?aim:x,dx=goal.x-x.x,dy=goal.y-x.y,d=Math.hypot(dx,dy),speed=Math.hypot(v.x,v.y);
  if(d<.11&&speed<.38)settled=true;else if(d>.26)settled=false;
  // Arrival controller: pace long runs to the estimated contact time, critically
  // damp the final approach, and maintain a small planted stance deadband.
  const available=Math.max(.12,contactTime-t-.075),pace=!urgent&&Number.isFinite(available)?Math.max(1.2,d/available*(incoming==='clear'?1.70:1.85)):m.v;
  const rearChase=quick&&aim&&depth(side,aim)>4.2&&contactTime-t<.48&&d>.26;
  const brakeAcc=m.acc*cl(.72+(agility-85)*.007,.55,.95)*(m.brakeScale??1),desired=t<react?Math.min(speed*.85,m.v):settled||d<.045?0:Math.min(m.v,pace,Math.sqrt(2*brakeAcc*Math.max(0,d-.045+(rearChase?.22:0))),d/(rearChase?.075:urgent?.12:.19));
  const vx=t<react||t<lockedUntil?v.x*(t<lockedUntil?.82:ready?.96:.82):d?dx/d*desired:0,vy=t<react||t<lockedUntil?v.y*(t<lockedUntil?.82:ready?.96:.82):d?dy/d*desired:0,nv=t+h<=airUntil?{...v}:P.steerVelocity(v,pt(vx,vy),{...m,brakeAcc},Math.max(.00001,Math.min(h,t+h-airUntil)));
  if(settled&&Math.hypot(nv.x,nv.y)<.055){nv.x=0;nv.y=0;}
  const nx=pt(cl(x.x+(v.x+nv.x)*h*.5,side===0?-.65:N+.12,side===0?N-.12:L+.65),cl(x.y+(v.y+nv.y)*h*.5,-W-.55,W+.55));if(Math.abs(nx.x-(x.x+(v.x+nv.x)*h*.5))>1e-9)nv.x=0;if(Math.abs(nx.y-(x.y+(v.y+nv.y)*h*.5))>1e-9)nv.y=0;travelled+=dist(x,nx);x=nx;v=nv;t+=h;
  addNode();
 }
 if(nodes[nodes.length-1][0]<t-1e-8)addNode();
 const plan={model:5,smooth:true,from:{...pos},to:{...x},initial:{...vel},origin:{...pos},delay:react,readDelay:react,airRemaining:airUntil,mob:m,nodes};
 return {best,miss,m,plan,attempt,failed,letBall,netFault,stopAt,reachAttempt};
}

Object.assign(P,{footFor,intercept,predict,recoveryTime,contactFailure,recoveryDelay,strokeRecovery,contactReach,rescueReach,receivePressure,quickReaction,contactDemand,gripChangeDelay});
})(globalThis.SmashParts ||= {});


/* tactics */
/* SMASH V11 — context-aware shot selection. */
(function(P){
"use strict";
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise,fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,pathState,pathPos,flightBasis,ballAt,apexTime,crossAt,inBounds,makeBall,footFor,intercept}=P;
// Contact geometry is measured in the player's own court coordinates, not screen coordinates.
// Positive forward means the shuttle is in front of the torso (toward the net).
const ATTACK=['smash','half','kill','drive'], DOWN=['smash','half','kill'], HIGH=['clear','lift','punch'], FRONT=['net','drop','block'];
const unit=x=>cl(x,0,1),sig=x=>1/(1+Math.exp(-cl(x,-30,30)));
const skill=(p,k)=>cl(.65*a(p,k)+.35*rawAttr(p,k),35,99);
function contactState(p,f,side,from,h,quality,ownPos,ctx={}){
 const forward=depth(side,ownPos)-depth(side,from),lateral=(from.y-ownPos.y)*(side===0?1:-1)*(p.handedness==='left'?-1:1),gap=dist(from,ownPos),v=ctx.ownVel||pt(0,0),m=mobility(p,f),hit=ctx.contact||{};
 const speed=Math.hypot(v.x,v.y),back=hit.geometry?.back??(lateral<-.20),retreat=v.x*(side===0?1:-1)<-.65;
 const front=unit((forward+.32)/.85),height=unit((h-1.55)/1.0),balance=unit(1-.40*speed/m.v-.17*unit((gap-.60)/.45)-.13*(retreat?1:0));
 const ready=unit(1-.45*(hit.rapid||0)-.32*unit((.06-(hit.margin??.18))/.16)-(hit.prepared===false?.22:0));
 const overheadBack=hit.geometry?.strokeType?hit.geometry.strokeType==='overBack':back&&forward<.15,angle=unit((h-1.65)/.95)*(.48+.52*front),tech=unit((skill(p,'杀球进攻')-50)/49);
 const attack=unit((.30*quality+.25*height+.20*front+.13*balance+.12*ready)*(.83+.17*tech)- (overheadBack?.14:0));
 return {backPower:unit((.55*skill(p,'后场技术')+.30*skill(p,'杀球进攻')+.15*skill(p,'爆发力')-55)/44),forward,lateral,gap,back,overheadBack,retreat,speed,balance:Math.min(balance,hit.geometry?.balance??1),ready,front,height,angle,attack,quality,h,d:depth(side,from),incomingSpeed:hit.speed||0};
}
// V12.9: initiative is derived from the actual contact, not a scoring buff.
function initiativeState(c,opos,ov,os){
 const d=depth(os,opos),imbalance=unit(Math.hypot(ov.x,ov.y)/4.5),offset=unit(Math.hypot((d-3.1)*.85,opos.y)/3.5);
 const readiness=unit(.42*c.quality+.20*c.ready+.18*c.balance+.12*c.front+.08*c.height);
 const opening=unit(.62*offset+.38*imbalance);
 return {value:unit(.78*readiness+.22*opening),readiness,opening,attack:c.attack,phase:readiness<.48?'defense':c.attack>.63&&readiness>.67?'attack':opening>.48&&readiness>.58?'pressure':'neutral'};
}
function candidateKinds(h,d,prev,quality,c=null){
 // The coarse gates guard execution; geometry further rules out awkward overhead attacks.
 const out=[],f=c?.forward??.35,b=c?.balance??.9,ready=c?.ready??.9,ob=c?.overheadBack??false;
 if(h>1.98&&quality>.40&&d>1.45){out.push('drop','clear');if(f>-.32&&quality>.44&&b>.43&&ready>.35)out.push('punch');if(f>-.24&&b>.43&&ready>.36&&(!ob||(quality>.74&&b>.65&&ready>.65&&c?.backPower>.64))){out.push('half');if(h>2.16&&quality>.53&&f>-.10&&b>.50&&ready>.48&&(!ob||(quality>.87&&c?.backPower>.83&&b>.76&&ready>.78)))out.push('smash');}}
 if(d<1.60&&h>1.74&&quality>.65&&f>.08&&ready>.55&&b>.58)out.push('kill');
 if(d<2.55&&h>1.34&&quality>.53&&f>-.15&&ready>.43&&b>.48)out.push('punch');
 if(h>1.12&&h<2.35&&d<4.6&&quality>.46&&ready>.38)out.push('drive');
 if(d<2.65&&h>.35)out.push('net');
 if(d<4.1||h<2.08||quality<.70)out.push('lift');
 if(['smash','half','kill','drive'].includes(prev)&&d<4.7)out.push('block','lift');
 if(h>1.98&&d>=1.8)out.push('clear');else if(h>1.45&&d>=1.8)out.push('lift');
 if(!out.length)out.push('lift');return [...new Set(out)];
}
function coachBias(p,kind,d,y,quality,opos,os){
 const c=p.coach;if(!c)return 0;
 const attack=['smash','half','kill','drive'].includes(kind), control=['clear','punch','drop'].includes(kind), front=['net','drop','block','kill'].includes(kind), counter=['block','lift','drive'].includes(kind);
 let v=0;
 if(c.mode==='attack')v+=attack?.24*quality:0;
 if(c.mode==='control')v+=control?.20:0;
 if(c.mode==='counter')v+=counter?.20:attack&&quality<.8?-.13:0;
 if(c.mode==='net')v+=front?.22:0;
 if(c.mode==='endurance')v+=(['clear','lift','drop','punch'].includes(kind)?.16:0)+.14*cl(dist(opos,local(os,d,y))/6,0,1);
 if(c.mode==='safe')v+=attack?-.20*(1-quality+.35):(['clear','lift'].includes(kind)?.15:0);
 if(c.target==='front'&&d<1.5)v+=.15;
 if(c.target==='rear'&&d>5.5)v+=.15;
 if(c.target==='corners'&&Math.abs(y)>1.8)v+=.13;
 return v*cl(.65+(rawAttr(p,'战术意识')-35)/100,.65,1.20);
}

// A cheap, deterministic look-ahead over plausible intercept windows. It estimates
// pressure, not the receiver's future RNG or true reaction to the shot.
function opponentForecast(b,other,of,os,opos,ctx,kind,samples=12){
 const m=mobility(other,of),cross=crossAt(b),fast=ATTACK.includes(kind),high=HIGH.includes(kind),v=ctx.oppVel||pt(0,0),last=ctx.oppLast;
 const rest=last?Math.max(0,last.time+P.recoveryTime(other,last.kind,of)-(ctx.time||0),(last.airUntil??0)-(ctx.time||0),(last.rescueUntil??0)-(ctx.time||0)):0;
 const react=P.quickReaction(m,other,kind),prep=.06+(99-skill(other,'灵活性'))*.0016,anticipation=skill(other,'判断与预判'),maxZ=m.maxZ;
 let best=null;
 if(!cross)return {returnChance:0,quality:0,replyAttack:0,margin:-1,value:0};
 for(let i=0;i<=samples;i++){
  const t=mix(Math.max(cross.t+.008,0),b.T*.985,i/samples),q=ballAt(b,t);
  if(t<=cross.t||depth(os,q)<.012||q.z<.10||q.z>maxZ||Math.abs(q.y)>W+.55)continue;
  const ft=footFor(opos,q,{...m,reach:P.contactReach(m,q,kind)},os,fast||kind==='punch'),dd=dist(opos,ft),speed=Math.hypot(v.x,v.y),alignment=dd*speed>.01?((ft.x-opos.x)*v.x+(ft.y-opos.y)*v.y)/(dd*speed):0;
  const geom=P.contactGeometry(ft,q,os,m,v);if(!geom.feasible)continue;const demand=P.contactDemand(other,m,os,ft,q,kind,geom),change=P.gripChangeDelay(last,geom.back,kind,q.z>1.9);
  const travelT=Math.max(0,P.approachTime(opos,ft,v,{...m,brake:.60})),need=Math.max(rest,react+travelT+(speed>.3?m.turn*(1-alignment)*.50:0)) +prep+change+demand.prep+(geom.jump?geom.flightTime*.42:0)+(99-anticipation)*.0011+.018,margin=t-need;
  const bv=P.ballVelocity(b,t),ballSpeed=Math.hypot(bv.x,bv.y,bv.z),front=depth(os,q)<2.5,defense=rawAttr(other,'防守能力')-85,speedStress=unit((Math.hypot(bv.x,bv.y,.65*bv.z)-(front?5.5:10))/(front?19:31)*cl(1-.016*defense,.72,1.28));
  const ownQuality=unit(.83+.004*(response(other,kind)-85)+.10*unit((q.z-.2)/1.65)-(fast?.35:.24)*speedStress+(fast?.010*defense*unit((ballSpeed-4)/12):.003*defense)-.26*unit((.13-margin)/.38)-.13*unit(dd/5)-.10*unit((rest+prep+.10-t)/.20)-of*.0015-(other._acute||0)*.15-demand.quality-.19*P.steepServeDemand(kind,bv));
  const reach=sig((margin+.075)/.12),timeStress=unit((.105-margin)/.24),rapid=unit((rest+prep+.16-t)/.22),moveStress=unit(dd/5),{burden,critical}=P.receivePressure(timeStress,speedStress,cl(.60*(dist(ft,q)/P.contactReach(m,q,kind)-.47)/.53+.40*cl((geom.extension-.70)/.30,0,1),0,1),rapid,moveStress),returnChance=reach*(1-P.contactFailure(burden,critical,margin,response(other,kind),skill(other,'专注度'),other._acute||0)),replyAttack=unit((q.z-1.65)/1.15)*ownQuality*(.70+.30*unit(margin/.30));
  const value=returnChance*(.64+.26*ownQuality+.10*replyAttack);
  if(!best||value>best.value)best={value,returnChance,quality:ownQuality,replyAttack,margin,q,foot:ft,t,back:geom.back,demand,speed:ballSpeed,horizontalSpeed:Math.hypot(bv.x,bv.y)};
 }
 return best||{returnChance:0,quality:0,replyAttack:0,margin:-1,value:0};
}
// Predict execution from the same nominal trajectory and coupled timing/depth errors.
// Five deterministic timing strata, then integrate remaining vertical uncertainty.
function shotRisk(p,f,kind,quality,c,b,cross,receiving,key,target=b.to,contact=null){
 const spread=P.directionalSpread(p,kind,b.from,target,quality,P.strokeSpread(p,kind,f,quality,key,receiving)),sigma=spread.sigma*(contact?.special?.spread??1)*P.strokeConstraint(kind,b.from,target,contact).spread,heightSigma=spread.heightSigma*(contact?.special?.spread??1)*Math.sqrt(P.strokeConstraint(kind,b.from,target,contact).spread);
 const tail=z=>{const x=Math.abs(z),t=1/(1+.2316419*x),q=.39894228*Math.exp(-x*x/2)*t*(.31938153+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return z>=0?q:1-q;};
 const os=b.to.x>N?1:0,d=depth(os,b.to),y=Math.abs(b.to.y),line=unit(tail((6.7-d)/sigma)+tail(d/sigma)+tail((W-y)/(sigma*.85))+tail((W+y)/(sigma*.85)));
 let net=0;
 for(const [timing,w] of [[-1.40,.25],[0,.50],[1.40,.25]]){
  const trial=timing===0?b:makeBall(null,kind,b.from,b.h,target,p,f,quality,0,key,true,receiving,[timing,0,0],contact||{speed:b.incomingSpeed,horizontalSpeed:b.incomingHorizontalSpeed},b.trajectoryMode);
  const x=timing===0?cross:crossAt(trial);
  if(!x){net+=w;continue;}
  const netH=1.524+.026*unit(Math.abs(x.y)/3.05),q=(N-trial.from.x)/(trial.to.x-trial.from.x),basis=flightBasis(trial,x.t/trial.T,q)[1];
  const vertical=Math.max(.008,heightSigma*.877268);
  const miss=P.mishitChance(p,f,kind,quality);net+=w*((1-miss)*tail((x.z-netH)/vertical)+miss*tail((x.z-netH-(trial.mishitDrop??.30))/vertical));
 }
 return unit(line+net-.5*Math.min(line,net));
}
// Shared recovery target: default positional base, then modest probabilistic adjustment.
function habitContext(side,from){const d=depth(side,from),y=from.y*(side===0?1:-1);return (d<2.6?'F':d>4.4?'R':'M')+(y<-.65?'L':y>.65?'R':'C');}
function habitFamily(kind){return HIGH.includes(kind)?'high':FRONT.includes(kind)?'front':'attack';}
function habitDirection(side,from,target){const y=target.y*(side===0?1:-1);return y<-.65?'L':y>.65?'R':'C';}
function habitLikelihood(memory,side,from,kind,target){
 const key=habitContext(side,from),family=habitFamily(kind),dir=habitDirection(side,from,target);let same=0,total=0;
 for(let i=0;i<(memory||[]).length;i++){let x=memory[i];if(x[0]!==key)continue;const w=Math.exp(-(memory.length-1-i)/25);total+=w;if(x[1]===family&&x[2]===dir)same+=w;}
 return {prob:(same+.6)/(total+5.4),confidence:total/(total+4),same,total};
}
function remember(memory,side,b,kind,duration){if(['short','long'].includes(kind))return;const observed=ballAt(b,duration),dx=observed.x-b.from.x;if(Math.abs(dx)<.15)return;
 // Estimate the destination lane from observed direction and a typical depth, not the hidden landing point.
 const dep=HIGH.includes(kind)?5.8:FRONT.includes(kind)?1.1:4.2,tx=local(side^1,dep,0).x,ty=cl(b.from.y+(observed.y-b.from.y)*(tx-b.from.x)/dx,-W,W);
 memory.push([habitContext(side,b.from),habitFamily(kind),habitDirection(side,b.from,{y:ty})]);if(memory.length>64)memory.shift();
}
function recoveryBase(as,kind,target){const os=as^1;
 // Serve on one side, make a small step towards centre, not across it.
 if(kind==='short')return local(as,2.65,cl(-target.y*(as===0?1:-1)*.24,-.42,.42));
 if(kind==='long')return local(as,3.45,cl(target.y*(as===0?1:-1)*.18,-.38,.38));
 return local(as,(['net','block'].includes(kind)?2.68:['smash','half'].includes(kind)?2.52:['kill','drop'].includes(kind)?2.80:HIGH.includes(kind)||kind==='long'?3.32:3.10)+.20*cl((depth(os,target)-3.3)/3.3,-1,1),cl(target.y*(as===0?1:-1)*.30,-.82,.82));}
// A bounded two-ply forecast. No future RNG or actual opponent choice is read.
// Construct plausible reply strokes from the predicted contact, then estimate how
// the original player can receive those replies after returning towards base.
function replyForecast(s,p,other,f,of,as,ownPos,ctx,quality,key,intelligence){
 const os=as^1,fc=s.forecast,base=recoveryBase(as,s.kind,s.target);
 if(!fc.q||fc.returnChance<.08)return {value:0,recovery:base};
 const t=fc.t,from=fc.q,oq=cl(fc.quality,.22,.94),foot=fc.foot||from;
 const recoveryClock=P.strokeRecovery(p,s.kind,quality,f,ctx.contact),ownPlan=P.recoveryPlan(ownPos,base,ctx.ownVel||pt(0,0),mobility(p,f),recoveryClock.delay,as,recoveryClock.air),state=pathState(ownPlan,t);
 const body=contactState(other,of,os,from,from.z,oq,foot,{contact:{margin:fc.margin,prepared:fc.margin>=0},ownVel:pt(0,0)});
 let ks=candidateKinds(from.z,depth(os,from),s.kind,oq,body);
 // One representative from each tactical family. Include both safe and attacking replies.
 const groups=[['lift','clear','punch'],['net','block','drop'],['kill','smash','half','drive']];
 const replies=[];
 for(const group of groups){let options=group.filter(k=>ks.includes(k));if(!options.length)continue;
  // Try each family's likely representative(s); retain the strongest direction for each.
  for(const k of options.slice(0,2)){
   const domain=aimDomain(k,P.strokeSpread(other,k,of,oq,key,false));
   const seeds=aimPoints(k,as,from,state.pos,state.vel,domain,.5,.37,2,p);
   for(const target of seeds.slice(0,5)){
    const b=makeBall(null,k,from,from.z,target,other,of,oq,0,key,true,false,null,fc),cross=crossAt(b);
    if(!cross||cross.z<1.55||DOWN.includes(k)&&ballAt(b,Math.min(.018,b.T*.06)).z>=from.z-.002)continue;
    const risk=shotRisk(other,of,k,oq,body,b,cross,false,key,target);
    const ret=opponentForecast(b,p,f,as,state.pos,{oppVel:state.vel,oppLast:{kind:s.kind,time:0,airUntil:recoveryClock.air,rescueUntil:ctx.contact?.special?.recovery??0},time:t},k,5);
    const attack=ret.q?ret.replyAttack:0;
    // Third-contact opportunity: opponent must recover from its predicted contact.
    // Assess uncovered front/rear lanes at OUR predicted next contact. No hidden RNG,
    // no real future trajectory and no fabricated winner are used.
    const otherM=mobility(other,of),otherBase=recoveryBase(os,k,target);
    const otherState=ret.q?pathState(P.recoveryPlan(foot,otherBase,pt(0,0),otherM,P.recoveryDelay(other,k,oq,of),os),ret.t):{pos:foot,vel:pt(0,0)};
    const ownNext=ret.q?contactState(p,f,as,ret.q,ret.q.z,ret.quality,ret.foot||ret.q,{contact:{margin:ret.margin,prepared:ret.margin>=0},ownVel:pt(0,0)}):null;
    // Approximate third-contact options: a slow loft lets the opponent recover.
    const lanes=ownNext?[...((ownNext.h>1.85&&ownNext.d>1.4)?[[1.1,-1.55,'drop'],[1.1,1.55,'drop'],[5.8,-1.55,'clear'],[5.8,1.55,'clear']]:[[1.1,-1.4,'net'],[1.1,1.4,'net'],[5.8,-1.5,'lift'],[5.8,1.5,'lift']]),...(ownNext.attack>.56?[[3.8,-1.65,'half'],[3.8,1.65,'half']]:[])]:[];
    const opportunities=lanes.map(([d,y,kind])=>{
      const target=local(os,d,y),flight=cl(dist(ret.q,target)/(kind==='half'?12:kind==='drop'?7:kind==='net'?4.8:5.6),.24,2.1),need=P.approachTime(otherState.pos,target,otherState.vel,otherM)+otherM.react;
      const margin=need-flight-.18,tech=execution(p,kind),feasible=kind==='net'&&ownNext.d>2.65?0:kind==='half'?ownNext.attack:ownNext.quality;
      return unit(.5+margin/.9)*feasible*cl(.9+(tech-85)*.008,.65,1.12);
    }).sort((a,b)=>b-a);
    const open=opportunities.length?.70*opportunities[0]+.30*(opportunities[1]??opportunities[0]):0;
    const setup=ret.returnChance*open*(.60+.40*ret.quality);
    const our=ret.returnChance*(.20+.48*ret.quality+.32*attack);
    const opp=(1-risk)*(1-our)-.65*risk+.05*styleBias(other,k)+.0015*(execution(other,k)-85);
    const habit=habitLikelihood(ctx.oppMemory,os,from,k,target);replies.push({opp,habit,our:risk+(1-risk)*our,foot:ret.foot||state.pos,risk,t:ret.t||b.T,margin:ret.margin,setup:(1-risk)*setup,weight:0});
   }
  }
 }
 if(!replies.length)return {value:.25,recovery:base};
 const best=Math.max(...replies.map(r=>r.opp)),temp=.16+.12*(1-intelligence);let sum=0,value=0,worst=1,setupValue=0;
 for(const r of replies){const w=Math.exp((r.opp-best)/temp)*(1+2.0*intelligence*r.habit.confidence*Math.max(0,9*r.habit.prob-1));r.weight=w;sum+=w;value+=w*r.our;setupValue+=w*r.setup;worst=Math.min(worst,r.our);}
 // Evaluate bounded alternative base positions against weighted urgency, not the
 // geometric mean of forecast contact points. Costs use the same approach clock.
 const m=mobility(p,f),v=ctx.ownVel||pt(0,0),delay=recoveryClock.delay;
 let recovery=base,minCost=Infinity;
 for(const dx of [-.40,0,.40])for(const dy of [-.42,0,.42].map(y=>y*P.bodyFor(p).hand)){
  const candidate=pt(cl(base.x+dx,as===0?.40:N+.60,as===0?N-.60:L-.40),cl(base.y+dy,-1.35,1.35));
  const nextState=dx||dy?pathState(P.recoveryPlan(ownPos,candidate,v,m,delay,as,recoveryClock.air),t):state;
  let cost=.13*dist(base,candidate)+.025*dist(ownPos,candidate);
  let worstCost=0;for(const r of replies){const need=P.approachTime(nextState.pos,r.foot,nextState.vel,{...m,brake:.60})+m.react+.105;const miss=(1-r.risk)*sig((need-r.t)/.17);cost+=.86*r.weight/sum*miss;worstCost=Math.max(worstCost,miss);}cost+=.14*worstCost;
  if(cost<minCost){minCost=cost;recovery=candidate;}
 }
 const expected=value/sum;
 // A weak opposing contact has intrinsic initiative value, even when one of
 // several replies might be dangerous. Preserve the risk of a good counter.
 return {value:fc.returnChance*(.86*expected+.14*worst-.50+.18*(1-fc.quality)+(.14+.15*intelligence)*setupValue/sum),recovery,expected,setup:setupValue/sum};
}
function styleBias(p,kind){const s=p.style;return s==='进攻'&&ATTACK.includes(kind)?.12:s==='拉吊'&&['clear','drop','punch'].includes(kind)?.12:s==='防反'&&['block','lift','drive'].includes(kind)?.12:s==='网前'&&FRONT.concat('kill').includes(kind)?.13:s==='重炮'&&['smash','half'].includes(kind)?.15:s==='突击'&&['drive','half','kill','punch'].includes(kind)?.13:s==='耐力'&&['clear','lift','drop'].includes(kind)?.10:0;}
// Continuous aim domains: bounds are shot-type constraints, not fixed aim points.
const AIM_DOMAIN={clear:[5.45,6.65],punch:[5.05,6.65],drop:[.55,2.65],smash:[2.15,6.60],half:[1.65,6.35],drive:[2.25,6.65],net:[.24,1.85],kill:[.42,4.85],lift:[5.45,6.65],block:[.38,2.30]};
function aimDomain(kind,spread){const range=AIM_DOMAIN[kind],deep=['clear','lift','punch'].includes(kind),m=(deep?1.35:1.70)*spread.sigma,hi=Math.min(range[1],6.7-m);return {lo:Math.min(hi,Math.max(range[0],m)),hi,edge:Math.max(.40,W-1.65*spread.sigma*.85)};}
function aimPoints(kind,os,from,opos,vel,domain,phase=.5,phaseY=.5,count=7,receiver=null){
 const {lo,hi,edge}=domain,pts=[],sign=os===0?1:-1,od=depth(os,opos),oy=opos.y*sign,vy=vel.y*sign,vd=vel.x*(os===0?-1:1);
 const hand=receiver?P.bodyFor(receiver).hand:1;
 const add=(d,y)=>{const a=local(os,cl(d,lo,hi),cl(y,-edge,edge));if(!pts.some(p=>dist(p,a)<.16))pts.push(a);};
 for(let i=0;i<count;i++)add(mix(lo,hi,(i+phase)/count),hand*edge*(2*((phaseY+i*.61803398875)%1)-1));
 const pred=cl(oy+vy*.28,-edge,edge),dep=cl(od+vd*.28,lo,hi),gap=pred===0?-hand:pred>0?-1:1;
 if(receiver){const hand=P.bodyFor(receiver).hand;
  // Probe both racket-side lanes, rather than forcing a backhand target.
  if(HIGH.includes(kind)){add(hi,-hand*edge*.86);add(hi,hand*edge*.86);}
  else if(ATTACK.includes(kind)){add(dep+.55,pred+hand*.12);add(dep+.70,pred-hand*.80);}
  else {add(mix(lo,hi,.35),-hand*edge*.84);add(mix(lo,hi,.35),hand*edge*.84);}
 }
 add(mix(lo,hi,.68+.16*phase),gap*edge*(.70+.23*phaseY));
 add(mix(lo,hi,.25+.40*phaseY),cl(oy-vy*.24,-edge,edge));
 if(ATTACK.includes(kind)){const origin=from.y*sign,body=pred+(pred-origin)*.30;add(dep+.95+.55*phase,body);}else add(mix(lo,hi,.38+.35*phase),cl(pred*.55,-edge,edge));
 return pts;
}
function tacticalState(previous,events,winner,server){
 const out=[0,1].map(i=>{const old=previous?.[i]||{},own=events.filter(e=>e.actor===i),opp=events.filter(e=>e.actor!==i),last=events.at(-1),error=last.terminal==='unforced_error'&&winner!==i?1:0;
 const ema=(k,x)=>.82*(Number.isFinite(old[k])?old[k]:x)+.18*x;
 return {n:(old.n||0)+1,mode:own.at(-1)?.decision?.mode||old.mode||'balanced',win:ema('win',+(winner===i)),error:ema('error',error),attack:ema('attack',opp.filter(e=>ATTACK.includes(e.kind)).length/Math.max(1,opp.length)),front:ema('front',opp.filter(e=>FRONT.includes(e.kind)).length/Math.max(1,opp.length)),load:ema('load',events.reduce((v,e)=>v+e.costs[i],0))};});return out;
}
function adaptivePlan(p,other,state,f,of){
 const s=state||{},intel=P.decisionIntelligence(p),manual=p.coach||{},m={...manual};delete m.serve;let mode=manual.mode||'auto';
 if(mode==='auto'){mode=({进攻:'attack',拉吊:'control',防反:'counter',网前:'net',耐力:'endurance',重炮:'attack',突击:'attack'}[p.style]||'balanced');if(s.n>=6&&intel>.42){if(s.error>.34&&s.win<.46)mode='safe';else if(s.attack>.32&&s.win<.47)mode='counter';else if(s.front>.40&&s.win<.45)mode='control';else if(of>f+6&&s.win>.44)mode='endurance';}}
 return {...m,mode,auto:!manual.mode||manual.mode==='auto',risk:manual.risk||'normal',pace:manual.pace||'normal',recovery:manual.recovery||'auto'};
}
function tacticalIntent(p,other,as,opos,prevOwn,c,plan){const os=as^1,od=depth(os,opos),oy=opos.y*(os===0?1:-1),hand=P.bodyFor(other).hand;
 if(c.quality<.46||c.balance<.37)return {type:'reset',strength:.14};
 if(prevOwn&&HIGH.includes(prevOwn.kind)&&od>4.1)return {type:'front',strength:.18};
 if(prevOwn&&FRONT.includes(prevOwn.kind)&&od<2.9)return {type:'rear',strength:.18};
 if(plan.target==='backhand'||plan.mode==='control'&&od<4.5)return {type:'backhand',strength:.17,hand};
 if(plan.mode==='attack'&&c.attack>.60)return {type:'finish',strength:.16};
 if(plan.mode==='net'&&od>2.8)return {type:'front',strength:.14};
 return {type:Math.abs(oy)>1.15?'opposite':'neutral',strength:.12,oy};}
function choose(r,p,other,f,of,side,from,h,quality,opos,prev,server,score,key,ownPos,ctx={}){
 const os=side^1,plan=p.coach||{};if(server){
  const sy=(score%2===0?1:-1)*(side===0?1:-1),opts=[],kind='long',sigma=P.strokeSpread(p,kind,f,quality,key).sigma,dep=cl(6.7-2.0*sigma,6.05,6.42);
  for(const lane of [.48,1.27,2.02]){const target=pt(local(os,dep,0).x,-sy*lane),b=makeBall(null,kind,from,h,target,p,f,quality,0,key,true),cross=crossAt(b);if(!cross||cross.z<1.55||!P.serviceLegal(b.to,os,sy))continue;
   const fc=opponentForecast(b,other,of,os,opos,ctx,kind,9),risk=shotRisk(p,f,kind,quality,{},b,cross,false,key,target),next=replyForecast({kind,target,forecast:fc},p,other,f,of,side,ownPos,ctx,quality,key,P.decisionIntelligence(p));
   opts.push({kind,target,risk,forecast:fc,recovery:next.recovery,setup:next.setup,utility:.42*(1-fc.returnChance)+.38*(1-fc.quality)-.32*fc.replyAttack-1.25*risk+.34*next.value});}
  if(!opts.length)return {kind,target:pt(local(os,6.15,0).x,-sy*1.3)};
  const top=Math.max(...opts.map(x=>x.utility)),weights=opts.map(x=>Math.exp((x.utility-top)/.15));let v=r()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<opts.length;i++){v-=weights[i];if(v<=0)return opts[i];}return opts.at(-1);
 }
 const c=contactState(p,f,side,from,h,quality,ownPos,ctx),kinds=ctx.contact?.special?(ctx.contact.special.type==='spin'?['clear','lift','drop','block']:['lift','block','net']).filter(k=>k==='lift'||candidateKinds(h,c.d,prev,quality,c).includes(k)):candidateKinds(h,c.d,prev,quality,c),receiving=prev==='short'||prev==='long';
 const initiative=initiativeState(c,opos,ctx.oppVel||pt(0,0),os),sequence=tacticalIntent(p,other,side,opos,ctx.ownLast,c,plan);
 const intelligence=P.decisionIntelligence(p),od=depth(os,opos),openFront=unit((od-2.4)/3),openRear=unit((3.6-od)/2.6),attackWindow=unit((c.attack-.52)/.32),defensive=unit((.62-c.attack)/.35),candidates=[];
 // Opportunity-dependent aggression: not a universal smash bonus.
 const modePolicy={attack:1.25,control:1.00,counter:.76,net:1.15,endurance:.74,safe:.60,balanced:1.0};
 const mode=p.coach?.mode||({进攻:'attack',拉吊:'control',防反:'counter',网前:'net',耐力:'endurance',重炮:'attack',突击:'attack'}[p.style]||'balanced');
 const readiness=unit((initiative.readiness-.35)/.55),oa=other._acute||0,pa=p._acute||0;
 const opportunity=readiness*unit(.44*initiative.opening+.23*oa+.20*unit((1-(ctx.oppLast?.quality??.8))/.65)+.13*unit((h-1.6)/1.1));
 const intent=(modePolicy[mode]??1)*(plan.pace==='fast'?1.18:plan.pace==='slow'?.84:1)+(mode==='endurance'?.55*oa:mode==='counter'?.40*initiative.opening:0);
 const phase=r(),phaseY=r();
 for(const kind of kinds){let best=null,pool=[];const spread=P.strokeSpread(p,kind,f,quality,key,receiving),domain=aimDomain(kind,{...spread,sigma:spread.sigma*(ctx.contact?.special?.spread??1)*(plan.risk==='low'?1.25:plan.risk==='high'?.86:1)});
 const seeds=aimPoints(kind,os,from,opos,ctx.oppVel||pt(0,0),domain,phase,phaseY,6,other);
 const evaluate=(target,mode=null)=>{
  const d=depth(os,target),y=target.y*(os===0?1:-1),b=makeBall(r,kind,from,h,target,p,f,quality,0,key,true,receiving,null,ctx.contact,mode),cross=crossAt(b);
  if(!cross||cross.z<1.524+.026*unit(Math.abs(cross.y)/3.05)||Math.abs(cross.y)>3.05||dist(target,b.to)>.35)return;
  // Downward shots must actually leave the racket descending, not bend up to clear the net.
  if(DOWN.includes(kind)&&ballAt(b,Math.min(.018,b.T*.06)).z>=h-.002)return;
  if(kind==='drive'){const v=P.ballVelocity(b,0);if(Math.abs(v.z)>Math.hypot(v.x,v.y)*.42)return;}
  const g=ctx.contact?.geometry,pose=g?.feasible?P.impactPose(g,{...from,z:h},ctx.contact?.incomingVelocity||{x:0,y:0,z:0},P.ballVelocity(b,0),P.bodyFor(p)):null;
  // Reject only clearly incompatible stringbed alignment; score the rest by attainable power/control.
  if(pose&&pose.alignment<.32&&!ctx.contact?.special)return;
  const forecast=opponentForecast(b,other,of,os,opos,ctx,kind),risk=shotRisk(p,f,kind,quality,c,b,cross,receiving,key,target,ctx.contact),winner=1-forecast.returnChance;
  const netThreat=forecast.q&&depth(os,forecast.q)<2.3?unit((forecast.q.z-1.42)/.50)*forecast.quality:0;
  const advantage=forecast.returnChance*unit(.55*(1-forecast.quality)+.45*(1-Math.max(forecast.replyAttack,netThreat)));
  const travel=unit(dist(opos,target)/6),energy=(DOWN.includes(kind)?(kind==='smash'?.16:.09):.035)*(1+f/65)*cl(85/skill(p,'体能耐力'),.75,1.5);
  const opening=readiness*unit(.55*winner+.25*unit((.55-forecast.quality)/.45)+.20*opportunity);
  const aggression=intent*(.35*readiness+1.35*opening);
  let u=-.24*P.strokeConstraint(kind,from,target,ctx.contact).load-.16*(pose?1-pose.alignment:0)+(1-risk)*((.95+.68*aggression)*winner+(1.00+.18*intent)*advantage)-(1.65-.38*unit(aggression)+(plan.risk==='low'?.50:plan.risk==='high'?-.32:0))*risk+.12*travel-energy+.003*(execution(p,kind,receiving)-85);
  // Fast placement or downward pressure exploits a weak predicted contact;
  // high defensive lifts remain useful when the striker is off balance.
  const pressure=(kind==='net'?.45:kind==='clear'||(kind==='lift'&&mode!=='attacking'))?.12:1;
  u+=(1-risk)*pressure*intent*readiness*(.18*winner+.15*forecast.returnChance*unit((.75-forecast.quality)/.55));
  if(kind==='clear'||kind==='lift'&&mode!=='attacking')u-=.075*intent*readiness*unit(.4+opportunity);
  // Attacking a good contact is valuable; a pressured or rear-of-body contact favours recovery.
  if(DOWN.includes(kind))u+=(kind==='half'?.52:.58)*attackWindow+.045*attackWindow*unit((skill(p,'杀球进攻')-65)/34)+.20*c.angle-.44*defensive-(c.overheadBack?.22:0)-(kind==='smash'?.10*unit((c.d-3.8)/2.8)+.12*(1-c.balance):0);
  // Deep, near-vertical service returns are poor automatic winners against a set defender.
  // Keep a full smash available when the receiver is well positioned or the opponent is open.
  if(prev==='long'&&DOWN.includes(kind)&&ctx.contact?.incomingVelocity){const steep=P.steepServeDemand(prev,ctx.contact.incomingVelocity),deep=unit((c.d-4.8)/1.5),settled=1-unit(Math.hypot(ctx.oppVel?.x||0,ctx.oppVel?.y||0)/3),covered=1-unit(Math.hypot((od-3.35)*.8,opos.y)/2.5);u-=(kind==='smash'?.60:.28)*steep*deep*settled*covered*(1-.38*opportunity)*(mode==='attack'?.78:1);}
  if(kind==='drive')u+=.22*attackWindow+.16*unit(c.incomingSpeed/18)-.14*defensive+.07-.12*unit((c.h-1.8)/.5);
  if(kind==='drop'||kind==='net'||kind==='block')u+=.28*openFront+.09*attackWindow+(kind==='drop'?.17:kind==='net'?-.06:0)-.45*netThreat-.43*unit((2.9-od)/2.2);
  if(kind==='net'&&['net','block','drop'].includes(prev))u-=.20*unit((3.4-od)/2.4)*(.50+.50*unit((1.75-c.h)/1.2));  
  if(kind==='punch')u+=.42*openRear+.10*attackWindow+.20+.06*travel+.11*unit((c.d-3.2)/3.2)-.12*(1-c.front)-.12*(1-c.ready);
  if(kind==='clear'||kind==='lift')u+=.33*defensive+.09*unit(c.speed/5)+.04*unit(f/55)+.13*openRear-.32*attackWindow-.02;
  if(kind==='lift'){const recoveryNeed=unit(.55*(1-quality)+.30*(1-c.balance)+.15*unit(c.speed/5));u+=mode==='defensive'? .36*recoveryNeed-.30*(1-recoveryNeed):mode==='attacking'? .21*openRear*quality-.31*recoveryNeed:.045;}
  // A lift/clear is a recovery or displacement stroke, not a free midcourt feed.
  // Penalize shallow physical landings and prefer baseline depth when feasible.
  if(kind==='lift'||kind==='clear'){const actualDepth=depth(os,b.to);u+=.30*unit((actualDepth-5.30)/1.10)-.65*unit((5.65-actualDepth)/1.40);if(forecast.q)u-=.25*forecast.replyAttack*unit((5.45-depth(os,forecast.q))/1.8);}
  if(kind==='drop'&&c.d>4.5){const launch=P.ballVelocity(b,0),km=Math.hypot(launch.x,launch.y,launch.z)*3.6;u+=.12*unit((d-.9)/1.35)*unit((quality-.5)/.45)-.17*unit(Math.abs(km-79.9)/35)*unit((quality-.55)/.40);}
  // Recovery value from high balls matters in defence, not as a universal safe-shot bonus.
  if(kind==='punch'&&prev==='punch')u-=.16*(1-openRear);
  if(kind==='clear'&&prev==='punch')u-=.08*attackWindow;
  if(kind==='lift'&&c.d<2.7)u+=.17*unit((1.60-c.h)/.9)+.10*unit(c.incomingSpeed/20)+.10*unit((3.4-od)/2.4)+.10*defensive-.12*unit((c.h-1.1)/.65)*unit((quality-.45)/.4);
  if(kind==='clear')u+=.28*unit((3.4-od)/2.4)+.19*unit((.85-c.balance)/.4)+.04*travel+.05+.17*unit((c.d-3.2)/3.2)*defensive+.17*unit(-c.forward/.45);
  if(kind==='drop')u+=.04*travel-.24*unit(-c.forward/.45)*defensive;
  // A short counter after a hard attack may deny the attacker time to recover.
  // Reward actual forecast pressure and the defender's ability to control it.
  if(kind==='block'&&['smash','half','kill','drive'].includes(prev))u+=.21*unit((c.incomingSpeed-4)/14)*unit((quality-.20)/.65)+.16*openFront;
  if(forecast.q){const displacement=unit(dist(opos,forecast.foot||forecast.q)/4.5),late=unit((.23-forecast.margin)/.40);
    const vv=ctx.oppVel||pt(0,0),to=forecast.foot||forecast.q,dd=dist(opos,to),sp=Math.hypot(vv.x,vv.y),reverse=dd*sp>.05?unit(-((to.x-opos.x)*vv.x+(to.y-opos.y)*vv.y)/(dd*sp)):0;
    u+=(1-risk)*forecast.returnChance*(.10*displacement*late+.13*reverse*unit(sp/3));
  }
  // Reward displacement of the next contact, not just nominal landing distance.
  if((['drop','punch','clear'].includes(kind)||kind==='lift'&&mode!=='defensive')&&forecast.q){const displacement=unit(dist(opos,forecast.foot||forecast.q)/4.5);u+=.20*displacement*unit((quality-.35)/.5)+.003*(P.rawAttr(p,'拉吊控球')-85)*unit((quality-.35)/.5);}
  if(kind==='clear')u+=.16*unit(-c.forward/.45)*defensive;
  // Avoid counting displacement, opposite side and edge as separate rewards.
  const habit=habitLikelihood(ctx.ownMemory,side,from,kind,target);
  const read=P.decisionIntelligence(other),predictability=habit.confidence*unit((habit.prob-1/9)*2.5);
  u-=.39*read*predictability*(.45+.55*forecast.returnChance);
  // Repeated family in the same incoming geometry is easier to anticipate.
  const recent=(ctx.ownMemory||[]).slice(-10).filter(x=>x[0]===habitContext(side,from));
  const known=recent.filter(x=>x[1]===habitFamily(kind)).length;
  u-=.20*read*unit((known-1)/4)*forecast.returnChance;
  // Straight and central high returns narrow the opponent's angles during recovery.
  if(kind==='clear'||kind==='lift'&&mode==='defensive')u+=.09*defensive*(1-Math.abs(y)/1.95);
  if(kind==='lift'&&mode!=='defensive'){const v=ctx.oppVel||pt(0,0),predY=cl(opos.y+.30*v.y,-W,W),opening=unit((Math.abs(target.y-predY)-.5)/3.5),usable=unit((quality-.42)/.48)*(.55+.45*c.balance);u+=.29*(1-risk)*usable*opening;}
  if(kind==='net'&&c.d<2.6)u+=.06*quality*unit((od-2.0)/2.8);
  // Mixed handedness changes preferred trajectories, not execution success.
  // Small prior from Zhang & Leng (2024); risk and forecast still dominate.
  if(P.bodyFor(p).hand!==P.bodyFor(other).hand){const delta=Math.abs(target.y-from.y),small=unit(delta/.65)*unit((3.4-delta)/1.65),wide=unit((delta-2.6)/1.8);u+=.025*small-.035*wide+(kind==='drive'?.035:0);}
  u+=(plan.auto?styleBias(p,kind)*.30:0)+coachBias(p,kind,d,y,quality,opos,os)*(.80+.20*intelligence);
  const seq=sequence.type,benefit=seq==='front'?unit((2.6-d)/2.0):seq==='rear'?unit((d-3.5)/2.5):seq==='backhand'?unit(-y*sequence.hand/2.0)*unit((d-3.5)/2.5):seq==='finish'?(DOWN.includes(kind)?attackWindow:0):seq==='reset'?(HIGH.includes(kind)?defensive:0):seq==='opposite'?unit(-y*sequence.oy/3):0;
  u+=sequence.strength*(.5+.5*intelligence)*(1-risk)*benefit;
  if(plan.target==='backhand')u+=.18*(1-risk)*unit(-y*P.bodyFor(other).hand/2)*unit((d-3.2)/2.8);
  if(plan.target==='body'&&ATTACK.includes(kind))u+=.17*(1-risk)*unit(1-Math.abs(target.y-opos.y)/1.6);
  if(plan.pace==='slow')u+=.12*(1-risk)*travel-.12*energy;if(plan.pace==='fast')u+=.12*(1-risk)*winner;
  // Only modest within-kind target variation. A large utility gap cannot be overturned by noise.
  u+=.012*Math.sin(phase*6.283+d*2.31+y*P.bodyFor(other).hand*3.71);
  const finish=DOWN.includes(kind)?initiative.readiness*attackWindow*(winner+.45*advantage):0;
  const reset=['lift','clear','block'].includes(kind)?(1-initiative.readiness)*(1-risk)*forecast.returnChance*(1-forecast.replyAttack):0;
  u+=.28*(1-risk)*finish+.15*reset;
  const entry={kind,target,trajectoryMode:b.trajectoryMode,utility:u,forecast,risk,initiative,opportunity:opening,aggression};pool.push(entry);if(!best||u>best.utility)best=entry;
 };
 const modes=kind==='lift'?(ctx.contact?.special?['defensive','normal']:quality<.44?['normal','defensive']:quality>.65&&h>.75?['attacking','normal','defensive']:['normal','defensive']):[null];
 for(const mode of modes)for(const target of seeds)evaluate(target,mode);
 if(best){const origin=best.target,dd=depth(os,origin),yy=origin.y*(os===0?1:-1),step=.24+.22*intelligence;
  for(const [dx,dy] of [[step,0],[-step,0],[0,step*P.bodyFor(other).hand],[0,-step*P.bodyFor(other).hand]]){const target=local(os,cl(dd+dx,domain.lo,domain.hi),cl(yy+dy,-domain.edge,domain.edge));if(!pool.some(s=>dist(s.target,target)<.12))evaluate(target,best.trajectoryMode);}
  const alts=pool.filter(s=>dist(s.target,best.target)>.65&&s.utility>=best.utility-.28).sort((a,b)=>b.utility-a.utility);best.alternate=alts[0];candidates.push(best);
 }}
 if(!candidates.length){ // Last-resort loft: maximize real net clearance rather than blindly lifting deep.
  let best=null;for(const d of [6.05,5.7,5.3,4.8,4.1,3.4,2.7,1.9]){const target=local(os,d,0),b=makeBall(null,'lift',from,h,target,p,f,quality,0,key,true,receiving,null,ctx.contact,'defensive'),cross=crossAt(b),actual=depth(os,b.to),legal=cross&&cross.z>=1.55&&P.inBounds(b.to,os),v=legal?10+actual+.12*Math.min(2,cross.z-1.55):(cross?.z??-1)-Math.max(0,actual-6.7);if(!best||v>best.v)best={kind:'lift',target,trajectoryMode:'defensive',v};}return best;
 }
 // Compare the best candidate from each feasible family on the next reply.
 // The next-reply value is bounded so it cannot justify a very risky stroke.
 const topKinds=[...candidates].sort((a,b)=>b.utility-a.utility).slice(0,3);
 const improve=s=>{const next=replyForecast(s,p,other,f,of,side,ownPos,ctx,quality,key,intelligence);s.utility+=(.48+.30*intelligence+(['smash','half'].includes(s.kind)&&c.d>4.6?.26:0))*next.value;s.recovery={...next.recovery};if(plan.recovery==='front'||plan.recovery==='rear')s.recovery.x=local(side,cl(depth(side,s.recovery)+(plan.recovery==='front'?-.35:.35),1.8,4.3),0).x;s.intent=sequence.type;s.setup=next.setup??0;s.expectedReply=next.expected??null;};
 const options=[];for(const s of candidates){const alt=s.alternate;delete s.alternate;improve(s);options.push(s);if(alt&&topKinds.includes(s)){improve(alt);options.push(alt);}}
 const top=Math.max(...options.map(s=>s.utility)),band=.28+.15*(1-intelligence),plausible=options.filter(s=>s.utility>=top-band&&s.risk<=Math.min(.55,.18+Math.max(...options.filter(x=>x.utility===top).map(x=>x.risk))));
 if(!plausible.length)return options.reduce((a,b)=>a.utility>b.utility?a:b);
 const temp=.075+.105*(1-intelligence),weights=plausible.map(s=>Math.exp((s.utility-top)/temp)/Math.sqrt(plausible.filter(t=>t.kind===s.kind).length));let pick=r()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<=0)return plausible[i];}return plausible.at(-1);
}
Object.assign(P,{tacticalState,adaptivePlan,tacticalIntent,initiativeState,contactState,candidateKinds,opponentForecast,shotRisk,recoveryBase,replyForecast,choose,remember,habitLikelihood,aimDomain,aimPoints});
})(globalThis.SmashParts ||= {});


/* match */
/* SMASH V10.7 spatial — match; extracted from the original release. */
(function(P){
"use strict";
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise,fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,pathState,pathPos,flightBasis,ballAt,apexTime,crossAt,inBounds,makeBall,footFor,intercept,candidateKinds,choose}=P;
function diagnostics(p,kind='smash',fat=0,receiving=false){return {decisionNoise:decisionNoise(p),execution:execution(p,kind,receiving),response:response(p,kind),mobility:mobility(p,fat),load:loadDelta(p,2),recovery:cl(.7+.30*rawAttr(p,'身体素质')/85+.018*(rawAttr(p,'体能耐力')-85),.4,1.45)};}
function servePositions(server,score,ends){let side=i=>sideOf(i,ends),sy=(score[server]%2===0?1:-1)*(side(server)===0?1:-1),pos=[0,1].map(i=>local(side(i),i===server?2.35:2.50,0));pos[server].y=sy*1.30;pos[server^1].y=-sy*1.30;return pos;}
function serviceLegal(p,side,sy){return inBounds(p,side)&&depth(side,p)>=S-1e-7&&p.y*sy<=1e-7;}
class Match{
 constructor(players,seed=2027,target=15){this.players=JSON.parse(JSON.stringify(players)).map(P.calibrateProfile);this.bodyProfiles=this.players.map(p=>({height_cm:p.height_cm??null,handedness:p.handedness??null}));this.seed=seed>>>0;this.r=rng(this.seed);this.target=target;this.cap=target===15?21:30;this.interval=target===15?8:11;this.score=[0,0];this.games=[0,0];this.gameScores=[];this.server=this.r()<.5?0:1;this.ends=this.r()<.5?0:1;this.fatigue=[0,0];this.strain=[0,0];this.carry=[0,0];this.chronic=[0,0];this.total=0;this.done=false;this.winner=null;this.history=[];this.tacticalMemory=[[],[]];this.tacticalState=[{},{}];this.swapped=false;this.intervalTaken=false;this.stats=[0,1].map(()=>({points:0,winners:0,forced:0,errors:0,distance:0,shots:0,types:{},landings:[]}));}
 syncFatigue(){this.fatigue=this.strain.map((v,i)=>cl((v+this.carry[i]+.35*this.chronic[i])*.756,0,85));}
 next(){if(this.done)return null;const r=this.r, ps=this.players,scoreBefore=[...this.score],gamesBefore=[...this.games],ends=this.ends,server=this.server,game=this.gameScores.length+1,side=i=>sideOf(i,ends),sy=(this.score[server]%2===0?1:-1)*(side(server)===0?1:-1);let pos=servePositions(server,this.score,ends),velocity=[pt(0,0),pt(0,0)],walk=[0,0];let actor=server,from={x:pos[actor].x+(side(actor)===0?.29:-.29),y:pos[actor].y+(side(actor)===0?.08:-.08)*(ps[actor].handedness==='left'?-1:1)},h=cl(1.03*P.bodyFor(ps[actor]).scale,.85,1.14),quality=.91,prev=null,events=[],winner=null,reason='',time=0,key=this.keyPoint??(Math.max(...this.score)>=this.target-2);let fatigueStart=[...this.fatigue],lastStroke=[null,null],contact=null;const acute=[0,0];ps.forEach(p=>p._acute=0);
 for(let n=0;n<200;n++){let opp=actor^1,p=ps[actor],q=ps[opp],as=side(actor),os=side(opp),fat=[...this.fatigue],start=pos.map(v=>({...v}));let plan=P.adaptivePlan(p,q,this.tacticalState[actor],fat[actor],fat[opp]);let choice=choose(r,{...p,coach:plan},q,fat[actor],fat[opp],as,from,h,quality,pos[opp],prev,n===0,this.score[server],key,pos[actor],{contact,ownVel:velocity[actor],oppVel:velocity[opp],oppLast:lastStroke[opp],ownLast:lastStroke[actor],strategy:this.tacticalState[actor],time,ownMemory:this.tacticalMemory[actor],oppMemory:this.tacticalMemory[opp]});let kind=choice.kind,b=makeBall(r,kind,from,h,choice.target,p,fat[actor],quality,1-quality,key,false,n===1,null,contact,choice.trajectoryMode);let cross=crossAt(b),netH=cross?1.524+.026*cl(Math.abs(cross.y)/3.05,0,1):1.524,netFault=!cross||cross.z<netH||Math.abs(cross.y)>3.05;
 let legal=n===0?serviceLegal(b.to,os,sy):inBounds(b.to,os);lastStroke[actor]={time,kind,quality,rescueUntil:time+(contact?.special?.recovery??0),rescueLockUntil:time+(contact?.special?.lock??0),airUntil:time+(contact?.geometry?.flightTime??0)*.5,back:contact?.geometry?.back??false};
 let recv=intercept(b,pos[opp],q,fat[opp],os,kind,n===0,velocity[opp],{r,time,last:lastStroke[opp],sy,key,seed:(this.seed^Math.imul(this.total+1,0x9e3779b1)^Math.imul(n+1,0x85ebca6b))>>>0}),hit=recv.best;let duration=recv.stopAt,outcome='return',nextQuality=0,landing=null;
 // Actual legality is used only for adjudication, never to choose the receiver's movement.
 if(netFault){winner=opp;reason='下网';outcome='net';hit=null;}
 else if(hit){duration=hit.t;nextQuality=hit.quality;}
 else if(!legal){winner=opp;reason=n===0?'发球出界':'出界';outcome='out';landing={...b.to};duration=recv.stopAt;}
 else{winner=actor;reason=recv.failed?'受压触球失败':recv.letBall?'界内球误判':'未能到位';outcome='winner';landing={...b.to};}
 // Forced errors are actual failed strokes after a pressured return, not a
 // preassigned failure while the previous shuttle is still airborne.
 let forcedError=n>0&&quality<.78&&!!contact&&(contact.burden>.30||contact.critical>.55)&&['net','out'].includes(outcome);
 if(forcedError)reason=outcome==='net'?'受迫失误 · 下网':'受迫失误 · 出界';
 const receiverError=outcome==='winner'&&(recv.failed||recv.letBall);
 if(receiverError){forcedError=!!recv.failed&&(recv.attempt.burden>.24||recv.attempt.critical>.48||recv.attempt.margin<0);reason=recv.failed?(forcedError?'受压触球失败':'触球失误'):'界内球误判';}
 const terminal=outcome==='return'?null:receiverError?(forcedError?'forced_error':'unforced_error'):outcome==='winner'?'winner':forcedError?'forced_error':'unforced_error';
 let rm=mobility(p,fat[actor]),recovery=choice.recovery||P.recoveryBase(as,kind,choice.target);let planA=P.recoveryPlan(start[actor],recovery,velocity[actor],rm,P.strokeRecovery(p,kind,quality,fat[actor],contact).delay,as,P.strokeRecovery(p,kind,quality,fat[actor],contact).air),planB=recv.plan;let plans=[];plans[actor]=planA;plans[opp]=planB;plans.forEach((plan,i)=>{plan.walk=walk[i];});let states=plans.map(plan=>pathState(plan,duration));pos=states.map(x=>x.pos);velocity=states.map(x=>x.vel);let ds=states.map(x=>x.travel);walk=walk.map((x,i)=>x+ds[i]);let costs=ds.map((d,i)=>workload(kind,d,i===actor,n===1,duration)+(i===actor&&contact?.geometry?.jump?contact.geometry.jumpHeight*.85:0)+(i===actor?(contact?.special?.load??0):(receiverError&&recv.failed?(recv.attempt?.special?.load??0):0)));for(let i=0;i<2;i++){let load=costs[i]*loadScale(ps[i]);this.strain[i]+=load*.145;this.carry[i]+=load*.012;this.stats[i].distance+=ds[i];
 // Per-rally load: distance, movement intensity, stroke and emergency recovery.
 const speed=ds[i]/Math.max(.20,duration), reversal=cl(-(states[i].vel.x*plans[i].initial.x+states[i].vel.y*plans[i].initial.y)/12,0,1);
 const exertion=load*(1+.35*cl(speed/4,0,1)+.25*reversal);
 acute[i]=cl(acute[i]*Math.exp(-duration*(speed<1.2?.055:.012)*P.recoveryScale(ps[i]))+(1-acute[i])*.034*exertion,0,1);ps[i]._acute=acute[i];}this.syncFatigue();
 this.stats[actor].shots++;this.stats[actor].types[kind]=(this.stats[actor].types[kind]||0)+1;if(landing)this.stats[actor].landings.push(landing);const impactGeometry=contact?.geometry||P.contactGeometry(start[actor],{...b.from,z:b.h},as,rm,pt(0,0));
 const previous=events.at(-1),incomingV=previous?P.ballVelocity(previous.ball,previous.duration):{x:0,y:0,z:0};
 const impact=impactGeometry.feasible?P.impactPose(impactGeometry,{...b.from,z:b.h},incomingV,P.ballVelocity(b,0),rm.body):null;
 events.push({n:n+1,actor,kind,specialRescue:contact?.special??null,strokeQuality:quality,contactGeometry:impactGeometry.feasible?{...impactGeometry,impact}:null,aim:{...choice.target},decision:{mode:plan.mode,intent:choice.intent||null,trajectoryMode:b.trajectoryMode,setup:choice.setup??0,risk:choice.risk??null,initiative:choice.initiative??null,opportunity:choice.opportunity??null,aggression:choice.aggression??null,expectedReply:choice.expectedReply??null,forecast:choice.forecast?{quality:choice.forecast.quality,margin:choice.forecast.margin,returnChance:choice.forecast.returnChance,back:choice.forecast.back,demand:choice.forecast.demand}:null,recovery:{...recovery}},ball:b,duration,time,plans,start,end:pos.map(v=>({...v})),outcome,forcedError,terminal,receiverError,landing,margin:hit?hit.margin:recv.miss?recv.miss.margin:null,quality:hit?nextQuality:null,receive:recv.attempt?{...recv.attempt,failed:recv.failed}:null,judgment:recv.letBall?"leave":null,rescueMotion:outcome==='winner'&&!recv.failed&&!recv.letBall?recv.reachAttempt:null,distances:ds,costs,acuteFatigue:acute.map(x=>x*100),fatigue:[...this.fatigue]});time+=duration;P.remember(this.tacticalMemory[actor],as,b,kind,duration);
 if(winner!==null){if(terminal==='winner')this.stats[actor].winners++;else if(forcedError)this.stats[receiverError?opp:actor].forced++;else this.stats[receiverError?opp:actor].errors++;break;}
 actor=opp;from={x:hit.q.x,y:hit.q.y};h=hit.q.z;quality=nextQuality;prev=kind;contact=hit;
 }
 if(winner===null){winner=actor^1;reason='超长回合保护';events.at(-1).outcome='guard';events.at(-1).terminal='unforced_error';this.stats[actor].errors++;}this.tacticalState=P.tacticalState(this.tacticalState,events,winner,server);this.stats[winner].points++;this.score[winner]++;this.total++;this.server=winner;const finalScore=[...this.score];let gameEnd=false,interval=false;if(!this.intervalTaken&&Math.max(...this.score)>=this.interval){interval=true;this.intervalTaken=true;if(game===3&&!this.swapped){this.ends^=1;this.swapped=true;}}
 if(this.score[winner]>=this.target&&(this.score[winner]-this.score[winner^1]>=2||this.score[winner]>=this.cap)){gameEnd=true;this.games[winner]++;this.gameScores.push([...this.score]);if(this.games[winner]===2){this.done=true;this.winner=winner;}else{this.score=[0,0];this.ends^=1;this.intervalTaken=false;this.swapped=false;}}
 ps.forEach(p=>p._acute=0);let seconds=this.done?0:gameEnd?120:interval?60:21.43;for(let i=0;i<2;i++){const rec=P.recoveryScale(ps[i]);this.strain[i]*=Math.exp(-seconds*rec/32);this.carry[i]*=Math.exp(-seconds*rec/5500);}this.syncFatigue();let rally={rescueModel:2,bodyProfiles:this.bodyProfiles,number:this.total,game,ends,server,scoreBefore,gamesBefore,scoreAfter:finalScore,gamesAfter:[...this.games],gameEnd,matchEnd:this.done,winner,reason,events,duration:time,fatigueStart,acutePeak:acute.map((x,i)=>Math.max(x*100,...events.map(e=>e.acuteFatigue[i]))),fatigueEnd:[...this.fatigue],nextScore:[...this.score],strain:[...this.strain],carry:[...this.carry],interval,tacticalState:this.tacticalState,tacticalMemory:this.tacticalMemory.map(a=>a.map(x=>[...x]))};this.history.push(rally);return rally;}
 finish(){while(!this.done)this.next();return this;}
}

Object.assign(P,{diagnostics,servePositions,serviceLegal,Match});
})(globalThis.SmashParts ||= {});


/* index */
(function(P){
const {W,L,N,S,cl,mix,dist,pt,lerp,ATTR,presets,SHOTS,rng,norm,profile,local,depth,sideOf,a,EXEC,RESP,COST,FAMILY,weighted,execution,response,rawAttr,workload,loadScale,loadDelta,decisionNoise,fatigueScale,athletic,mobility,moveTime,travel,motionStart,motionShape,motionPlan,pathState,pathPos,flightBasis,ballAt,apexTime,crossAt,inBounds,makeBall,footFor,intercept,candidateKinds,choose,diagnostics,servePositions,serviceLegal,Match}=P;
const API={diagnostics,execution,response,workload,loadDelta,Match,profile,equalProfile:P.equalProfile,presets,ATTR,SHOTS,ballAt,ballVelocity:P.ballVelocity,pathPos,pathState,local,inBounds,crossAt,moveTime,servePositions,serviceLegal,constants:{W,L,N,S}};
globalThis.Smash=API;
})(globalThis.SmashParts);

