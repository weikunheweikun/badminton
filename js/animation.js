/* math */
globalThis.SmashAnimMath=(()=>{
const cl=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t,pt=(x,y,z=0)=>({x,y,z});
const blend=(a,b,u)=>pt(mix(a.x,b.x,u),mix(a.y,b.y,u),mix(a.z,b.z,u));
// All lengths are metres. The racket is a rigid extension of the dominant wrist.
const V={add:(a,b)=>pt(a.x+b.x,a.y+b.y,a.z+b.z),sub:(a,b)=>pt(a.x-b.x,a.y-b.y,a.z-b.z),mul:(a,k)=>pt(a.x*k,a.y*k,a.z*k),dot:(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,len:a=>Math.hypot(a.x,a.y,a.z),unit(a){return this.mul(a,1/(this.len(a)||1))}};
const BODY=globalThis.SmashParts.BODY;
const smooth=u=>{u=cl(u,0,1);return u*u*(3-2*u)};
function armIK(shoulder,wrist,pole,L1=BODY.upperArm,L2=BODY.forearm){let d=V.sub(wrist,shoulder),u=V.unit(d),n=cl(V.len(d),.045,L1+L2-.001),w=V.add(shoulder,V.mul(u,n)),a=(L1*L1-L2*L2+n*n)/(2*n),h=Math.sqrt(Math.max(0,L1*L1-a*a)),perp=V.sub(pole,V.mul(u,V.dot(pole,u)));if(V.len(perp)<1e-5)perp=V.sub(pt(0,1,0),V.mul(u,u.y));if(V.len(perp)<1e-5)perp=pt(0,0,1);return {elbow:V.add(shoulder,V.add(V.mul(u,a),V.mul(V.unit(perp),h))),wrist:w};}
const bezier=(a,b,c,u)=>blend(blend(a,b,u),blend(b,c,u),u);
return {cl,mix,pt,blend,V,smooth,armIK,bezier,BODY};
})();


/* Whole-body motion / rare rescue choreography (presentation only).
   Never consumes the match RNG or expands physical reach. */
globalThis.SmashRescues=(()=>{
 const {cl,pt,V,smooth}=SmashAnimMath, selected=new WeakMap();
 const names={spin:'反手区快速转身救球',between:'胯下救球',dive:'鱼跃救球'};
 function hash(r,e){let a=(Math.imul((r.number||1)+19,0x9e3779b1)^Math.imul(e.n+11,0x85ebca6b)^Math.imul(Math.round(e.ball.from.x*1000),0xc2b2ae35)^Math.round(e.ball.from.y*1000))>>>0;a=Math.imul(a^(a>>>16),0x7feb352d);a=Math.imul(a^(a>>>15),0x846ca68b);return ((a^(a>>>16))>>>0)/4294967296;}
 function alternate(e,previous,B,side,type){
  const g=e.contactGeometry,q=pt(e.ball.from.x,e.ball.from.y,e.ball.h),root=e.start[e.actor],front=side===0?1:-1,hand=B.hand;
  let hip={...g.hip},center={...g.center},yaw=g.yaw,shoulder,aim,wrist,normal;
  if(type==='dive'){
   const d=V.unit(pt(q.x-root.x,q.y-root.y,0));if(V.len(d)<.5)return null;
   // Lower the whole torso as a unit; the free arm can brace the landing.
   hip=pt(root.x+d.x*.06,root.y+d.y*.06,.42*B.scale);
   center=V.add(hip,V.mul(V.unit(pt(d.x*.89,d.y*.89,.46)),B.torso));
   yaw=Math.atan2(d.y,d.x);
  }else if(type==='between'){
   // Turn away from the shuttle and crouch, creating a real corridor below the hips.
   const dx=(q.x-root.x)*front,shift=cl(dx*.28,-.23*B.scale,.23*B.scale);
   hip=pt(root.x+front*shift,root.y+cl((q.y-root.y)*.24,-.08,.08),.68*B.scale);
   center=V.add(hip,V.mul(V.unit(pt(front*.30,0,1)),B.torso));yaw=(side===0?0:Math.PI)+(dx>0?Math.PI:0);
  }
  const right=pt(-Math.sin(yaw)*hand,Math.cos(yaw)*hand,0);shoulder=V.add(center,V.mul(right,B.shoulderHalf));
  const delta=V.sub(q,shoulder),dist=V.len(delta);if(dist>B.upperArm+B.forearm+B.racketCenter-.012||dist<.12)return null;
  const pose={...g,hip,center,shoulder,yaw};
  const vin=Smash.ballVelocity(previous.ball,previous.duration),vout=Smash.ballVelocity(e.ball,0);
  let impact=SmashParts.impactPose(pose,q,vin,vout,B);
  if(type==='between'){
   // Shaft must enter the space between the legs; reject an impossible trick.
   let best=null;
   for(const x of [-.18,-.09,0,.09,.18])for(const z of [-.14,-.08,-.02,.04]){
    const want=pt(hip.x+front*x*B.scale,hip.y,hip.z+z*B.scale),a=V.unit(V.sub(q,want)),w=V.sub(q,V.mul(a,B.racketCenter)),arm=V.len(V.sub(w,shoulder));
    if(arm>B.upperArm+B.forearm-.008||arm<.07||w.z<.14||w.z>hip.z+.045||Math.abs(w.y-hip.y)>.19*B.scale||Math.abs(w.x-hip.x)>.25*B.scale)continue;
    const shaftMid=V.add(w,V.mul(a,B.racketCenter*.35));if(Math.abs(shaftMid.y-hip.y)>.19*B.scale||shaftMid.z>hip.z-.025)continue;
    const merit=Math.abs(w.x-hip.x)*.6+Math.abs(w.y-hip.y)+Math.abs(w.z-(hip.z-.07*B.scale));if(!best||merit<best.merit)best={a,w,merit};
   }if(!best)return null;aim=best.a;wrist=best.w;
   const n=V.unit(V.sub(vout,vin));normal=V.unit(V.sub(n,V.mul(aim,V.dot(n,aim))));if(V.len(normal)<.1)return null;
   impact={...impact,wrist,aim,normal};
  }
  if(V.len(V.sub(impact.wrist,shoulder))>B.upperArm+B.forearm-.002||impact.wrist.z<.06)return null;
  return {...pose,impact};
 }
 function prepare(r){
  if(r.rescueModel===2){for(const e of r.events){const s=e.specialRescue;if(s&&e.contactGeometry?.feasible)selected.set(e,{type:s.type,geometry:e.contactGeometry,label:names[s.type],pre:s.pre,post:s.post});}return;}
  const key=Math.max(...(r.scoreBefore||[0,0]))>=13||((r.scoreBefore||[]).length===2&&Math.min(...r.scoreBefore)>=11&&Math.abs(r.scoreBefore[0]-r.scoreBefore[1])<=2);
  let used=false;
  for(let j=2;j<r.events.length&&!used;j++){
   const e=r.events[j],prev=r.events[j-1],a=prev.receive,g=e.contactGeometry;if(!g?.feasible||!a||a.failed||prev.outcome!=='return'||g.jump||!['lift','block','drive','clear','drop','net','punch'].includes(e.kind))continue;
   const B=SmashParts.bodyFor(r.bodyProfiles?.[e.actor]),side=e.actor^r.ends,root=e.start[e.actor],front=side===0?1:-1,dx=(e.ball.from.x-root.x)*front,dy=(e.ball.from.y-root.y)*front*B.hand,h=e.ball.h,reach=Math.hypot(dx,dy),speed=Math.hypot(e.plans[e.actor].initial?.x||0,e.plans[e.actor].initial?.y||0);
   const pressure=a.burden??0,extension=g.extension??0;
   if(pressure<.22&&extension<.84&&!a.rescue&&(a.speed??0)<11&&(a.rapid??0)<.55)continue;
   // Only choose when the incoming ball and recorded movement allow the action.
   const options=[];
   if(dy<-.29*B.scale&&dx<.42&&h>.95&&h<2.42+B.heightDelta&&prev.duration>=.59&&e.duration>=.28&&speed<3.6)options.push('spin');
   if(Math.abs(dy)<.30*B.scale&&dx>-.72*B.scale&&dx<.88*B.scale&&Math.abs(dx)>.17*B.scale&&h>=.20&&h<.66*B.scale&&prev.duration>=.26&&e.duration>=.30)options.push('between');
   if(h<.70*B.scale&&reach>.93*B.scale&&extension>.76&&prev.duration>=.34&&e.duration>=.48&&speed<4.7)options.push('dive');
   if(!options.length)continue;
   const u=hash(r,e);
   for(const type of options.slice().reverse()){const chance=type==='spin'?(key?.11:.035):type==='dive'?(key?.28:.10):(key?.32:.12);if(u>=chance)continue;
    const geometry=type==='spin'?g:alternate(e,prev,B,side,type);if(!geometry)continue;
    selected.set(e,{type,geometry,label:names[type],pre:type==='spin'?Math.min(.70,prev.duration*.94):type==='dive'?.32:.26,post:type==='spin'?.32:type==='dive'?.58:.32});used=true;break;
   }
  }
 }
 return {prepare,get:e=>e&&selected.get(e)};
})();

/* strokes */
globalThis.SmashStrokes=(()=>{
// Court coordinates are expressed in the player's net-facing frame, independent of camera and ends.
// Racket side is supplied by the match body profile; the stroke type is inferred from contact geometry.
function action(e,ends,hand=1,deltaZ=0){
 const front=(e.actor^ends)===0?1:-1,p=e.start[e.actor],dy=(e.ball.from.y-p.y)*front*hand,forward=(e.ball.from.x-p.x)*front,h=e.ball.h,k=e.kind,depth=(e.actor^ends)===0?6.7-p.x:p.x-6.7,entry=e.plans?.[e.actor]?.initial||{x:0,y:0};
 const back=dy<-.12,highBack=dy<-.30&&(dy<-.48||forward<.16||h<2.45+deltaZ||entry.y*front*hand<-.65),jumpAttack=e.contactGeometry?.jump===true||(!e.contactGeometry&&k==='smash'&&h>=2.53+deltaZ&&depth>=2.25&&Math.abs(dy)<.72&&Math.hypot(entry.x,entry.y)<2.65);
 let type=k==='short'?'serveBack':k==='long'?'serveFore':h>1.92?(highBack&&!['smash','half','kill'].includes(k)?'overBack':jumpAttack?'jump':'overFore'):h<1.35||['net','lift','block'].includes(k)?(back?'lowBack':'lowFore'):(back?'back':'fore');
 const shared=e.contactGeometry?.strokeType;if(shared&&!['short','long'].includes(k)){type=shared==='aroundHead'||shared==='overFore'?(jumpAttack?'jump':'overFore'):shared;if(['net','lift','block'].includes(k)&&!['overBack','overFore','jump'].includes(type))type=shared.toLowerCase().includes('back')?'lowBack':'lowFore';}
 return {type,back:type.toLowerCase().includes('back'),side:dy,aroundHead:shared?shared==='aroundHead':back&&['jump','overFore'].includes(type),label:{serveBack:'反手短发球',serveFore:'正手高远发球',jump:['smash','half','kill'].includes(k)?(back?'头顶区杀球':'正手高点杀球'):(back?'头顶区正手高点击球':'正手高点击球'),overBack:'反手过顶击球',overFore:k==='smash'?'站姿下压杀球':back?'头顶区正手':'正手过顶击球',lowBack:'反手低位救球',lowFore:'正手低位救球',back:'反手平抽 / 挡球',fore:'正手平抽 / 挡球'}[type]};
}
// Separate backhand preparation and follow-through; not a mirrored forehand.
// Each vector is [forward, racket-side, relative height] in the rotated torso frame.
const BACKHAND={
 serveBack:{prep:[.30,-.27,-.26],in:[.43,-.22,-.30],follow:[.63,.10,-.12],yaw:[-.30,-.18,.06],elbow:[.26,-.36,-.55]},
 lowBack:{prep:[.25,-.44,-.36],in:[.38,-.64,-.54],follow:[.57,-.06,-.02],yaw:[-.82,-.55,-.12],elbow:[.42,-.75,-.32]},
 back:{prep:[.23,-.48,.12],in:[.35,-.59,.15],follow:[.64,.23,.18],yaw:[-.92,-.61,-.10],elbow:[.48,-.78,.20]},
 overBack:{prep:[.02,-.50,.38],in:[.19,-.51,.79],follow:[.46,.14,.55],yaw:[-1.70,-1.30,-.38],elbow:[.36,-.58,.85]}
};
const MOTION={short:{pre:.22,post:.23,wind:.24,turn:.25,prep:[-.03,-.20,-.25],follow:[.43,.10,-.10],drive:.36},long:{pre:.40,post:.40,wind:.60,turn:.75,prep:[-.37,.36,-.42],follow:[.40,-.35,.45],drive:.48},clear:{pre:.36,post:.39,wind:1.02,turn:.78,prep:[-.47,.41,.63],follow:[.53,-.30,.02],drive:.48},punch:{pre:.30,post:.31,wind:.82,turn:.62,prep:[-.35,.42,.60],follow:[.55,-.21,.07],drive:.40},smash:{pre:.43,post:.43,wind:1.26,turn:.96,prep:[-.50,.48,.47],follow:[.39,-.63,-.61],drive:.48},half:{pre:.31,post:.30,wind:.87,turn:.62,prep:[-.34,.39,.63],follow:[.48,-.28,-.23],drive:.43},drop:{pre:.34,post:.29,wind:.88,turn:.48,prep:[-.35,.39,.65],follow:[.38,-.14,-.02],drive:.29},drive:{pre:.18,post:.23,wind:.43,turn:.47,prep:[-.20,.39,.08],follow:[.42,-.17,.04],drive:.35},net:{pre:.22,post:.24,wind:.22,turn:.23,prep:[.14,.32,-.35],follow:[.43,.05,-.12],drive:.21},kill:{pre:.19,post:.25,wind:.52,turn:.50,prep:[-.13,.36,.43],follow:[.43,-.12,-.29],drive:.37},lift:{pre:.26,post:.32,wind:.42,turn:.42,prep:[-.18,.43,-.57],follow:[.46,-.20,.45],drive:.39},block:{pre:.14,post:.20,wind:.17,turn:.19,prep:[.18,.30,-.27],follow:[.40,.04,-.05],drive:.18}};
// Measured elite female smash: shuttle 78.5 m/s, racket head 51.0 m/s
// (Towler & King, 2024). The following is an animation calibration, not a collision solver.
const windows=new WeakMap();
const kinematics=new WeakMap();
function impactMotion(e,prev){
 const g=SmashRescues.get(e)?.geometry||e.contactGeometry;if(!g?.impact)return null;
 const {V,pt,cl}=SmashAnimMath, n=g.impact.normal;
 const vo=Smash.ballVelocity(e.ball,0),vi=prev?Smash.ballVelocity(prev.ball,prev.duration):pt(0,0,0);
 const out=Math.max(0,V.dot(vo,n)),incoming=V.dot(vi,n),rest=.55;
 // Effective restitution approximation for the normal component; defensive blocks may absorb energy.
 const speed=cl((out+rest*incoming)/(1+rest),0, e.kind==='smash'?65:45);
 return {speed,out:V.len(vo),incoming:V.len(vi),normal:n};
}
function impactCurve(e,dt,M,B,R,baseAim,baseWrist){
 const g=SmashRescues.get(e)?.geometry||e.contactGeometry, data=kinematics.get(e);if(!g?.impact||!data||e.miss)return null;
 const {V,pt,cl,smooth,blend}=SmashAnimMath, I=g.impact, a=I.aim,n=I.normal;
 const w=V.sub(I.wrist,g.shoulder), radial=V.unit(w),max=B.upperArm+B.forearm-.003;
 // Wrist translation is bounded separately from racket-head angular acceleration.
 const margin=cl((max-V.len(w))/.12,0,1),wdir=V.unit(V.sub(n,V.mul(radial,V.dot(n,radial)*(1-margin))));
 const projection=Math.max(0,V.dot(wdir,n)),wSpeed=Math.min(e.kind==='smash'?6.5:4.5,data.speed*.20)*projection;
 const omega=Math.max(0,(data.speed-wSpeed*projection)/B.racketCenter);
 const back=e.kind==='short'||g.back, compact=['net','block','short'].includes(e.kind);
 const thetaMax=compact?.38:back?.80:1.02,travel=compact?.065:.14;
 const turn=thetaMax*Math.tanh(dt*omega/thetaMax),shift=travel*Math.tanh(dt*wSpeed/travel);
 const axis=V.unit(V.add(V.mul(a,Math.cos(turn)),V.mul(n,Math.sin(turn))));
 const norm=V.unit(V.add(V.mul(n,Math.cos(turn)),V.mul(a,-Math.sin(turn))));
 const goal=V.add(R,V.add(w,V.mul(wdir,shift)));
 const span=Math.min(dt<0?M.pre:M.post,compact?.105:.145),weight=smooth(1-Math.abs(dt)/Math.max(.001,span));
 if(weight<=0)return null;
 let aim=V.unit(blend(baseAim,axis,weight));if(V.len(aim)<.01)aim=axis;
 return {aim,wrist:blend(baseWrist,goal,weight),normal:norm,weight,speed:data.speed};
}
function prepareWindows(r){for(let j=0;j<r.events.length;j++){let e=r.events[j],m=MOTION[e.kind]||MOTION.drive,s=SmashRescues.get(e),prev=r.events[j-1],prevOwn=r.events[j-2],next=r.events[j+1],pre=s?.pre??m.pre,post=s?.post??m.post;
 if(prev){const read=s?0:Math.min(prev.plans[e.actor]?.readDelay??0,prev.duration*.68);pre=Math.min(pre,Math.max(.045,prev.duration-read));if(prevOwn&&!s)pre=Math.min(pre,(prev.duration+prevOwn.duration)*.48);}
 if(next){post=Math.min(post,(e.duration+next.duration)*.48);}
 windows.set(e,{...m,pre,post});const k=impactMotion(e,prev);if(k)kinematics.set(e,k);}}
const strokeMotion=e=>{const w=e&&windows.get(e);if(w)return w;const m=MOTION[e?.kind]||MOTION.drive,s=SmashRescues.get(e);return s?{...m,pre:s.pre,post:s.post}:m;};
return {action,MOTION,BACKHAND,strokeMotion,prepareWindows,impactCurve,impactMotion};
})();


/* Motion clips: normalized, hand-authored badminton key poses in player-local space.
   Channels: time, pelvis drop (m), torso yaw weight, lean (m), foot lift multiplier.
   Root motion is always supplied by the simulation; clips never change its timing. */
globalThis.SmashMotionClips=(()=>{
 const {cl,mix,smooth}=SmashAnimMath;
 const clips={
  ready:[[0,.028,0,.035,0],[1,.028,0,.035,0]],
  split:[[0,.025,0,.035,0],[.32,.012,0,.035,.6],[.62,.105,0,.045,.25],[1,.035,0,.045,0]],
  chasse:[[0,.055,.16,.045,0],[.20,.040,.18,.065,.65],[.52,.025,.18,.08,1],[.78,.055,.16,.055,.55],[1,.065,.16,.045,0]],
  forward:[[0,.045,.12,.045,0],[.22,.027,.17,.075,.7],[.58,.02,.18,.095,1],[.82,.055,.15,.06,.45],[1,.07,.12,.035,0]],
  rearBack:[[0,.055,.38,.045,0],[.22,.04,.49,.06,.7],[.55,.027,.55,.07,1],[.82,.065,.47,.04,.45],[1,.072,.37,.025,0]],
  rearForeLong:[[0,.065,.54,.025,0],[.18,.045,.65,.045,.35],[.44,.028,.72,.075,1],[.72,.055,.68,.05,.72],[.90,.115,.59,-.015,.12],[1,.12,.52,-.025,0]],
  rearForePlant:[[0,.07,.60,.02,0],[.28,.035,.72,.065,.55],[.55,.055,.76,.045,1],[.81,.13,.64,-.04,.25],[1,.145,.53,-.03,0]],
  rearFore:[[0,.05,.43,.045,0],[.23,.035,.59,.065,.7],[.56,.02,.67,.07,1],[.83,.06,.56,.04,.45],[1,.065,.43,.025,0]],
  crossover:[[0,.045,.38,.05,0],[.25,.025,.48,.08,.8],[.60,.025,.53,.09,1],[.83,.055,.45,.055,.45],[1,.065,.38,.04,0]],
  brake:[[0,.035,.35,.065,0],[.40,.095,.30,.02,.6],[.72,.10,.24,-.025,.4],[1,.035,.14,.025,0]],
  lunge:[[0,.025,.25,.04,0],[.38,.115,.38,.10,.7],[.61,.22,.42,.15,1],[.80,.14,.32,.09,.35],[1,.04,.18,.04,0]],
  powerSmash:[[0,.02,.60,.02,0],[.22,.115,.92,-.055,0],[.47,.14,1,-.05,0],[.56,.025,.80,.02,0],[.64,0,.24,.14,0],[.75,.07,.60,.24,0],[.87,.105,.35,.13,0],[1,.035,.08,.04,0]],
  scissor:[[0,.055,.55,.05,0],[.27,.085,.68,.07,.6],[.52,.0,.72,.06,1],[.77,.04,.45,.05,.6],[1,.07,.20,.04,0]],
  travelStride:[[0,.052,.24,.075,0],[.18,.04,.28,.11,.48],[.43,.022,.30,.14,1],[.70,.048,.28,.10,.70],[.90,.085,.22,.05,.10],[1,.095,.20,.035,0]],
  plantLunge:[[0,.045,.20,.05,0],[.25,.06,.24,.10,.55],[.55,.10,.28,.14,1],[.82,.17,.24,.15,.24],[1,.20,.20,.12,0]],
  pushOff:[[0,.14,.20,.04,0],[.24,.095,.20,.075,.40],[.56,.035,.19,.12,1],[.85,.035,.15,.06,.30],[1,.06,.12,.035,0]],
  recovery:[[0,.09,.27,.02,0],[.35,.055,.20,.055,.8],[.65,.025,.16,.07,1],[1,.035,.08,.035,0]],
  rescue:[[0,.025,.28,.03,0],[.33,.09,.40,.09,.65],[.58,.18,.50,.16,1],[.81,.13,.35,.10,.40],[1,.045,.18,.035,0]]
 };
 function sample(name,u){const a=clips[name]||clips.ready;u=cl(u,0,1);let k=1;while(k<a.length-1&&a[k][0]<u)k++;const x=a[k-1],y=a[k],f=smooth((u-x[0])/(y[0]-x[0]||1));return {drop:mix(x[1],y[1],f),yaw:mix(x[2],y[2],f),lean:mix(x[3],y[3],f),lift:mix(x[4],y[4],f)};}
 function direction(df,ds){const rear=smooth((-df-.18)/.64),sign=Math.tanh(ds*4),lateral=smooth((Math.abs(ds)-.38)/.47);return mix(.18*sign*lateral,sign*mix(.34,.78,smooth((ds+.35)/.70)),rear);}
 function gait(df,ds,speed){if(speed<.22)return 'ready';if(df<-.33)return ds<0?'rearBack':'rearFore';if(Math.abs(ds)>.65)return speed>3.15?'crossover':'chasse';return 'forward';}
 return {clips,sample,direction,gait};
})();

/* footwork */
globalThis.SmashFootwork=(()=>{
const {cl,mix,smooth}=SmashAnimMath;
// A gait cycle is driven by actual distance travelled, not wall-clock time.
// Each foot remains at its last step anchor until the swing phase; the final
// anchor matches the stop position, so no walking in place at a stroke boundary.
function stepAnchor(progress,length,j,step){if(length<.10)return {at:progress,lift:0};let stride=2*step,anchors=[0];for(let x=(j===1?step:stride);x<length-.11;x+=stride)anchors.push(x);anchors.push(length);for(let k=1;k<anchors.length;k++){let a=anchors[k-1],b=anchors[k],d=b-a,lo=a+d*.19,hi=a+d*.81;if(progress<=hi){let u=cl((progress-lo)/Math.max(.001,hi-lo),0,1);return {at:mix(a,b,smooth(u)),lift:Math.sin(Math.PI*u)*Math.min(.14,.06+d*.07)};} }return {at:length,lift:0};}
// World-space planted feet sampled from the actual travelled path. The gait
// clock uses cumulative rally distance, not frame time or stroke number.
function gaitFoot(plan,t,side,j,prevPlan,prevDuration,nextPlan,nextDuration,front,eventDuration){
 const S=Smash,state=S.pathState(plan,t),walk=plan.walk||0,cycle=1.06,stance=.62,phase=((walk+state.travel)/cycle+(j===1?0:.5))%1;
 const base=walk+state.travel-phase*cycle,anchor=base+stance*cycle*.5;
 function sample(distance){let p=plan,duration=t;const last=eventDuration??(plan.model===5?plan.nodes.at(-1)[0]:(plan.shape?plan.delay+plan.shape.total*plan.scale:t));duration=last;
   if(distance<walk&&prevPlan){p=prevPlan;duration=prevDuration;}
   else if(nextPlan&&distance>walk+S.pathState(plan,last).travel){p=nextPlan;duration=nextDuration;}
   const local=distance-(p.walk||0),end=S.pathState(p,duration).travel;let lo=0,hi=duration;
   for(let n=0;n<11;n++){const mid=(lo+hi)*.5;if(S.pathState(p,mid).travel<local)lo=mid;else hi=mid;}
   const s=S.pathState(p,local<=0?0:local>=end?duration:(lo+hi)*.5),v=s.vel,speed=Math.hypot(v.x,v.y),dx=mix(front,v.x/Math.max(.001,speed),smooth(speed/.65)),dy=v.y/Math.max(.001,speed)*smooth(speed/.65);
   const lateral=smooth((Math.abs(dy)-.35)/.55),retreat=smooth((-dx*front-.15)/.65)*smooth(speed/.8),wide=.17+.05*lateral+.02*retreat*(1-lateral),turn=(front===1?0:Math.PI)+retreat*Math.tanh(dy*front*4+(side===0?.4:-.4))*1.05;
   // Support anchor orientation is fixed at the moment of planting.
   return {x:s.pos.x-Math.sin(turn)*j*wide+dx*.045,y:s.pos.y+Math.cos(turn)*j*wide+dy*.045};
 }
 const a=sample(anchor);if(phase<stance)return {...a,lift:0};const b=sample(anchor+cycle),u=cl((phase-stance)/(1-stance),0,1),v=smooth(u);
 return {x:mix(a.x,b.x,v),y:mix(a.y,b.y,v),lift:Math.sin(Math.PI*u)*.115};
}
// Build a deterministic footfall schedule over the whole rally. The world-space
// anchors do not reset at a shot boundary, and support feet remain fixed.
const tracks=new WeakMap(),prepared=new WeakSet();
function prepareRally(r){
 if(!r?.events?.length||!r.events.every(e=>e.plans?.length===2)||prepared.has(r))return;prepared.add(r);SmashRescues.prepare(r);SmashStrokes.prepareWindows(r);
 for(let i=0;i<2;i++){
  const front=(i^r.ends)===0?1:-1,body=SmashParts.bodyFor(r.bodyProfiles?.[i]),hand=body.hand,scale=body.scale,dominant=hand===1?1:0,samples=[],contacts=[];let distance=0,time=0,last=null;
  for(const e of r.events){let p=e.plans[i];if(e.actor===i&&e.n>1)contacts.push({t:time,x:e.ball.from.x,y:e.ball.from.y,h:e.ball.h});for(let k=0,n=Math.max(1,Math.ceil(e.duration/.02));k<=n;k++){if(k===0&&samples.length)continue;let t=e.duration*k/n,q=Smash.pathState(p,t),pos=q.pos;if(last)distance+=Math.hypot(pos.x-last.x,pos.y-last.y);samples.push({t:time+t,d:distance,x:pos.x,y:pos.y,vx:q.vel.x,vy:q.vel.y});last=pos;}time+=e.duration;}
  const first=samples[0],stance=(q,j)=>({x:q.x-.015*front,y:q.y+(j===0?-1:1)*front*.26*scale}),feet=[stance(first,0),stance(first,1)],initial=feet.map(q=>({...q})),steps=[[],[]];let lead=dominant;
  function sample(t){let lo=0,hi=samples.length-1;while(hi-lo>1){let m=(lo+hi)>>1;if(samples[m].t<t)lo=m;else hi=m;}let a=samples[lo],b=samples[hi],u=cl((t-a.t)/Math.max(.00001,b.t-a.t),0,1);return {t:mix(a.t,b.t,u),x:mix(a.x,b.x,u),y:mix(a.y,b.y,u),vx:mix(a.vx,b.vx,u),vy:mix(a.vy,b.vy,u),d:mix(a.d,b.d,u)};}
  function add(j,start,end,to,lift,clip="recovery"){let from=feet[j];const prev=steps[j].at(-1)?.end??0;start=Math.max(start,prev);let d=Math.hypot(to.x-from.x,to.y-from.y);
   // Start a long swing earlier if the same foot has already finished its support phase.
   start=Math.max(prev,0,Math.min(start,end-d/7.8));if(end-start<.065)return;let max=10.2*(end-start)/1.5;if(d>max){let f=max/d;to={x:mix(from.x,to.x,f),y:mix(from.y,to.y,f)};}steps[j].push({start,end,from,to,lift,clip});feet[j]=to;}
  function bout(a,b,stop){const A=samples[a],B=samples[b],len=B.d-A.d,dt=B.t-A.t;if(len<.055||dt<.06)return;
   // Timed contacts, not a distance-only gait clock: begin swing promptly,
   // use a short elastic flight, then plant through the next footfall.
   const meanSpeed=len/dt,long=len>1.65&&meanSpeed>1.25,rearFore=(B.x-A.x)*front<-.32&&(B.y-A.y)*front*hand>.25,stride=(rearFore?(long?.76:.62):long?.80:.66)*scale;
   const count=Math.max(1,Math.min(Math.max(1,Math.floor(dt/.115)),Math.max(Math.ceil(len/(stride*.84)),Math.ceil(dt/(long?.26:.27)))));
   let lastEnd=A.t,lat=(B.y-A.y)*front,forward=(B.x-A.x)*front,side=Math.abs(lat)>Math.abs(forward)*.90;
   const hit=contacts.find(c=>c.t>=A.t+.06&&c.t<=B.t+.14&&Math.abs(c.t-B.t)<.24);
   if(hit&&(hit.h<1.85||rearFore))lead=count%2===0?dominant^1:dominant;else if(rearFore)lead=dominant;else if(side)lead=lat>0?1:0;else if(forward>.18&&count>1)lead=count%2===0?dominant^1:dominant;
   for(let k=0;k<count;k++){
    let end=A.t+dt*(k+1)/count,q=sample(end),before=sample(Math.max(A.t,end-.10)),future=sample(Math.min(B.t,end+.055)),dx=future.x-before.x,dy=future.y-before.y,mag=Math.hypot(dx,dy)||1,ux=dx/mag,uy=dy/mag;
    let forwardLocal=ux*front,sideLocal=uy*front,lateral=Math.abs(sideLocal)>Math.abs(forwardLocal)*.90,j=lead,sign=j===0?-1:1;
    if(lateral&&k===0&&!hit&&!rearFore){j=sideLocal>=0?1:0;sign=j===0?-1:1;}
    let leading=lateral&&sign*sideLocal>0,terminal=k===count-1,pace=Math.hypot(q.vx,q.vy),advance=terminal?.08:lateral?(leading?.30:.06):cl(.20+.025*pace,.20,.30);
    const plant=terminal&&hit&&j===dominant&&hit.h<1.85,rearPlant=terminal&&rearFore&&j===dominant;
    // Chassé: the lead foot opens, the trailing foot closes but never passes.
    // Backward movement rotates both feet only moderately; torso rotates independently.
    let turn=SmashMotionClips.direction(forwardLocal,sideLocal),rx=-Math.sin(turn)*front,ry=Math.cos(turn)*front,width=(rearFore?.19:lateral?.23:.195)*scale;
    let pred=sample(Math.min(B.t,end+(long?.10:.085)));let to={x:pred.x+ux*advance+rx*sign*width,y:pred.y+uy*advance+ry*sign*width};
    if(rearFore){const stagger=sign*(rearPlant?.15:.09);to.x-=Math.cos(turn)*front*stagger;to.y-=Math.sin(turn)*front*stagger;}
    if(plant){const body=sample(Math.min(time,hit.t)),dx=hit.x-body.x,dy=hit.y-body.y,mag=Math.hypot(dx,dy)||1,reach=cl(mag*.45,.26,.52);to={x:body.x+dx/mag*reach+rx*.09*hand,y:body.y+dy/mag*reach+ry*.09*hand};end=Math.min(end,Math.max(A.t+.075,hit.t-.015));}
    {let other=feet[j^1],separation=sign*((to.x-other.x)*rx+(to.y-other.y)*ry);if(separation<.15){to.x+=rx*sign*(.15-separation);to.y+=ry*sign*(.15-separation);}}
    let start=Math.max(A.t,lastEnd-(long?.13:.075),end-(long?.31:.27)),clip=plant?'plantLunge':rearPlant?'rearForePlant':rearFore?'rearForeLong':long&&!lateral&&forwardLocal>-.25?'travelStride':k===0&&Math.hypot(A.vx,A.vy)<.65?'pushOff':SmashMotionClips.gait(forwardLocal,sideLocal,pace);add(j,start,end,to,plant?.135:rearFore?.125:lateral?.105:long?.16:.125,clip);lead=j^1;lastEnd=end;
   }
   // Re-establish a ready base if time permits; both feet can close in turn.
   if(stop-B.t>.14){let end=Math.min(stop,B.t+.22),j=lead,to=stance(B,j);if(Math.hypot(to.x-feet[j].x,to.y-feet[j].y)>.12){add(j,B.t,end,to,.075);lead^=1;}
    if(stop-end>.13){j=lead;to=stance(B,j);if(Math.hypot(to.x-feet[j].x,to.y-feet[j].y)>.14){add(j,end,Math.min(stop,end+.18),to,.065);lead^=1;}}}
  }
  let begin=0;
  for(let k=1;k<samples.length;k++){
   const q=samples[k],v=Math.hypot(q.vx,q.vy);
   if(v<.22){let j=k;while(j+1<samples.length&&Math.hypot(samples[j+1].vx,samples[j+1].vy)<.22)j++;if(samples[j].t-q.t>.085){bout(begin,k,samples[j].t);begin=j;k=j;continue;}}
   // Treat a substantial change of direction as a plant/push-off boundary,
   // rather than planning a footfall across a reversal.
   if(k>begin+5&&samples[k].t-samples[begin].t>.22){let old=sample(q.t-.11),m=Math.hypot(old.vx,old.vy);if(v>.55&&m>.65&&(q.vx*old.vx+q.vy*old.vy)/(v*m)<-.10){bout(begin,k,q.t);begin=k;}}
  }
  bout(begin,samples.length-1,time);
  let offset=0;for(const e of r.events){tracks.set(e.plans[i],{initial,steps,offset,sample,duration:time});offset+=e.duration;}
 }
}
function scheduledFoot(plan,t,j){let tr=tracks.get(plan);if(!tr)return null;let i=j===-1?0:1,T=t+tr.offset,steps=tr.steps[i],lo=0,hi=steps.length;while(lo<hi){let m=(lo+hi)>>1;if(steps[m].end<=T)lo=m+1;else hi=m;}let step=steps[lo];if(!step||T<step.start){let q=lo?steps[lo-1].to:tr.initial[i];return {...q,lift:0,phase:0,clip:"ready"};}let u=cl((T-step.start)/(step.end-step.start),0,1),v=u*u*(3-2*u),clip=step.clip||"recovery";return {x:mix(step.from.x,step.to.x,v),y:mix(step.from.y,step.to.y,v),lift:SmashMotionClips.sample(clip,u).lift*step.lift,phase:u,clip};}
function motionFrame(plan,t){const tr=tracks.get(plan);if(!tr)return null;const T=cl(tr.offset+t,0,tr.duration),at=x=>tr.sample(cl(x,0,tr.duration));let vx=0,vy=0;for(const [d,w] of [[-.085,.12],[-.04,.23],[0,.30],[.04,.23],[.085,.12]]){const q=at(T+d);vx+=w*q.vx;vy+=w*q.vy;}const a=at(T-.07),b=at(T+.07),dt=Math.max(.02,b.t-a.t);return {vx,vy,ax:(b.vx-a.vx)/dt,ay:(b.vy-a.vy)/dt};}
return {stepAnchor,gaitFoot,prepareRally,scheduledFoot,motionFrame};
})();


/* skeleton */
globalThis.SmashSkeleton=(()=>{
const S=Smash,{cl,mix,pt,blend,V,smooth,armIK,bezier,BODY}=SmashAnimMath,{action,strokeMotion,BACKHAND}=SmashStrokes,{stepAnchor,gaitFoot,scheduledFoot}=SmashFootwork;
function pose(i,p,e,t,ends,nextEvent=null,restMotion=null,prevEvent=null,rest=0,profile={}){
 const BODY=SmashParts.bodyFor(profile),hand=BODY.hand,scale=BODY.scale,deltaZ=BODY.heightDelta;
 let motionT=e?Math.min(t,e.duration):t,front=(i^ends)===0?1:-1,plan=e?.plans[i],state=[4,5].includes(plan?.model)?S.pathState(plan,motionT):null,v=plan?S.pathPos(plan,Math.min(e.duration,t+.035)):p,prev=plan?S.pathPos(plan,Math.max(0,t-.035)):p,dx=state?state.vel.x*.07:v.x-prev.x,dy=state?state.vel.y*.07:v.y-prev.y;
 const whole=plan&&SmashFootwork.motionFrame(plan,motionT);if(whole&&t>=0&&t<=e.duration){dx=whole.vx*.07;dy=whole.vy*.07;}
 if(e&&t>e.duration){dx=0;dy=0;if(state)state={...state,vel:pt(0,0)};}if(restMotion){dx=restMotion[i].x;dy=restMotion[i].y}let mag=Math.hypot(dx,dy)||1,run=cl(Math.hypot(dx,dy)/.26,0,1),ux=dx/mag,uy=dy/mag;
 let choices=[];if(e&&i===e.actor&&t<strokeMotion(e).post)choices.push([e,t]);if(nextEvent&&i===nextEvent.actor&&e.duration-t<strokeMotion(nextEvent).pre)choices.push([nextEvent,t-e.duration]);if(prevEvent&&i===prevEvent.actor&&prevEvent.duration+t<strokeMotion(prevEvent).post)choices.push([prevEvent,prevEvent.duration+t]);if((e?.receive?.failed||e?.rescueMotion)&&i===(e.actor^1)&&!e.judgment){const a=e.receive?.failed?e.receive:e.rescueMotion,miss={actor:i,kind:a.q.z>1.9?'clear':a.q.z>1.35?'drive':'block',start:e.start.map((x,k)=>k===i?a.foot:x),ball:{from:{x:a.q.x,y:a.q.y},h:a.q.z,to:{x:6.7+front*3,y:a.q.y}},plans:e.plans,miss:true};const d=t-a.t;if(d>=-.21&&d<=.30)choices.push([miss,d]);}const strength=([s,dt])=>dt<0?smooth(1+dt/strokeMotion(s).pre):1-smooth(dt/strokeMotion(s).post);choices.sort((a,b)=>strength(b)-strength(a));let [hit,dt]=choices[0]||[null,0],ac=hit?action(hit,ends,hand,deltaZ):null,M=strokeMotion(hit),env=hit?strength([hit,dt]):0,low=ac?.type.startsWith('low'),over=ac?.type.startsWith('over')||ac?.type==='jump',jump=hit?.contactGeometry?.jump===true||ac?.type==='jump',contact=hit?pt(hit.ball.from.x,hit.ball.from.y,hit.ball.h):null;const special=SmashRescues.get(hit),specialEnv=special?env:0;
 // Face the net in ready stance. Turn hips into the travelling direction for
 // cross-steps; backpedal in a side-on stance, then rotate into the shot.
 let moveForward=ux*front,moveSide=uy*front,mode=run<.08?'准备':moveForward<-.55?'后撤交叉步':Math.abs(moveSide)>.65?'侧向并步':'上网并步';
 const yawForDir=SmashMotionClips.direction;
 let movingYaw=run*yawForDir(moveForward,moveSide),split=0,braking=0;
 if(state&&t>=0&&plan.model===4){let yawFor=(x,y)=>{let d=Math.hypot(x,y);if(d<.005)return 0;let x0=x*front/d,y0=y*front/d;return yawForDir(x0,y0);};let tx=plan.to.x-plan.origin.x,ty=plan.to.y-plan.origin.y,startYaw=yawFor(plan.initial.x,plan.initial.y),endYaw=yawFor(tx,ty),turnProgress=smooth((t-plan.stop*.35)/Math.max(.08,(plan.readDelay??plan.delay)+.07-plan.stop*.35)),turnDiff=Math.atan2(Math.sin(endYaw-startYaw),Math.cos(endYaw-startYaw));let initialSpeed=Math.hypot(plan.initial.x,plan.initial.y),turning=initialSpeed>.35&&Math.abs(turnDiff)>.6;
 let yawWeight=cl(Math.max(run,Math.min(1,Math.hypot(tx,ty)*.7)*smooth(t/Math.max(.08,plan.readDelay??plan.delay))*.8),0,1);if(t>plan.delay+plan.shape.total*plan.scale&&run<.04)yawWeight*=1-smooth((t-plan.delay-plan.shape.total*plan.scale)/.22);movingYaw=(startYaw+turnDiff*turnProgress)*yawWeight;
 braking=plan.stop>0&&t<plan.stop?cl(initialSpeed/5,0,1)*Math.sin(Math.PI*cl(t/plan.stop,0,1)):0;
 let readWindow=Math.max(.055,Math.min(.16,(plan.readDelay??plan.delay)-plan.stop));if(i!==e.actor&&t>=plan.stop&&t<plan.stop+readWindow&&initialSpeed<1.8){split=Math.sin(Math.PI*cl((t-plan.stop)/readWindow,0,1));if(split>.25)mode='分腿垫步';}if(turning&&t<(plan.readDelay??plan.delay)&&t>=0)mode='急停 / 蹬转';}
 if(state&&plan.model===5&&t>=0&&t<=e.duration){let speed=Math.hypot(state.vel.x,state.vel.y),old=S.pathState(plan,Math.max(0,motionT-.085)),future=S.pathState(plan,Math.min(e.duration,motionT+.06)),s0=Math.hypot(old.vel.x,old.vel.y),s1=Math.hypot(future.vel.x,future.vel.y);braking=cl((s0-s1)/2.5,0,1);if(braking>.35)mode='制动 / 蹬转';if(t<plan.readDelay&&i!==e.actor){split=Math.sin(Math.PI*cl(t/Math.max(.05,plan.readDelay),0,1));if(split>.25)mode='分腿垫步';}let dir={x:whole?.vx??(old.vel.x*.22+state.vel.x*.56+future.vel.x*.22),y:whole?.vy??(old.vel.y*.22+state.vel.y*.56+future.vel.y*.22)},mag=Math.hypot(dir.x,dir.y);movingYaw=smooth(mag/1.8)*yawForDir(dir.x*front/Math.max(.01,mag),dir.y*front/Math.max(.01,mag));}


 const stepL=plan&&scheduledFoot(plan,motionT,-1),stepR=plan&&scheduledFoot(plan,motionT,1),clipL=SmashMotionClips.sample(stepL?.clip||'ready',stepL?.phase||0),clipR=SmashMotionClips.sample(stepR?.clip||'ready',stepR?.phase||0),clipDrop=(clipL.drop+clipR.drop)*.5,clipLean=(clipL.lean+clipR.lean)*.5,brakeClip=SmashMotionClips.sample('brake',braking);
 const shotClip=SmashMotionClips.sample(hit?.miss?'rescue':jump?'scissor':low?'lunge':'recovery',hit?cl((dt+M.pre)/(M.pre+M.post),0,1):0),splitClip=SmashMotionClips.sample('split',cl(t/Math.max(.05,plan?.readDelay||.10),0,1));
 const power=hit?.kind==='smash'&&!hit.miss,powerClip=SmashMotionClips.sample('powerSmash',hit?cl((dt+M.pre)/(M.pre+M.post),0,1):0);
 let swing=hit?(dt<0?mix(-M.wind,.10,smooth((dt+M.pre)/M.pre)):mix(.10,M.turn,smooth(dt/(M.post*.55)))):0;
 if(power){const u=cl((dt+M.pre)/M.pre,0,1);swing=dt<0?(u<.64?-M.wind:mix(-M.wind,.20,Math.pow((u-.64)/.36,1.65))):mix(.20,M.turn,1-Math.pow(1-cl(dt/.18,0,1),2.4));} 
 let backMotion=BACKHAND[ac?.type],base=front===1?0:Math.PI;
 // Backhand leads with the racket shoulder, then opens toward the net.
 const geometry=special?.geometry||hit?.contactGeometry;
 let shotYaw=backMotion?(dt<0?mix(backMotion.yaw[0],backMotion.yaw[1],smooth((dt+M.pre)/M.pre)):mix(backMotion.yaw[1],backMotion.yaw[2],smooth(dt/(M.post*.65)))):swing+(ac?.aroundHead?-.22:0),hipYaw=base+mix(movingYaw,hand*shotYaw*(backMotion?.55:.62),env),theta=hipYaw+cl(env*(hand*shotYaw-(hipYaw-base)),power?-.48:-.32,power?.48:.32);
 const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
 const align=geometry?smooth(1-Math.abs(dt)/Math.min(special?.type==='between'?.27:.20,dt<0?M.pre:M.post)):0;
 if(geometry&&Number.isFinite(geometry.yaw)){
  // Use the same impact yaw throughout the stroke envelope. Distinct hip and shoulder
  // preparation remain, but both converge smoothly to the committed contact geometry.
  const impactLocal=angleDelta(base,geometry.yaw),u=dt<0?smooth((dt+M.pre)/M.pre):smooth(dt/M.post),prepLocal=backMotion?impactLocal+hand*(geometry.strokeType==='overBack'?-.30:-.18):-hand*M.wind,followLocal=backMotion?impactLocal*.30+hand*.12*cl((hit.ball.to.y-hit.ball.from.y)*front*hand/Math.max(.5,Math.abs(hit.ball.to.x-hit.ball.from.x)),-1,1):hand*M.turn;
  const local=dt<0?prepLocal+angleDelta(prepLocal,impactLocal)*u:impactLocal+angleDelta(impactLocal,followLocal)*u;
  theta=base+movingYaw*(1-env)+local*env;hipYaw=base+movingYaw*(1-env)+local*env*(1-.35*(1-align));
 }
 if(special?.type==='spin'&&dt<0){const turn=hand*2*Math.PI*smooth((dt+M.pre)/M.pre);hipYaw+=turn;theta+=turn;}
 // The trunk returns continuously to the locomotion pose after the arm follow-through.
 // Evaluate both adjacent own strokes so a short flight cannot cut recovery at an event boundary.
 let trunk=[];for(const [ev,age] of [[prevEvent,prevEvent?prevEvent.duration+t:0],[e,t],[nextEvent,nextEvent?t-e.duration:0]]){const g=ev?.contactGeometry;if(!ev||ev.actor!==i||!g?.back||!Number.isFinite(g.yaw)||age<0)continue;const isRear=g.strokeType==='overBack',span=isRear?.58:.38,weight=(1-smooth(age/span));if(weight>0)trunk.push({g,ev,age,weight,span});}
 trunk.sort((a,b)=>b.weight-a.weight);const tail=trunk[0];
 if(tail){const {g,ev,age,weight,span}=tail,impactLocal=angleDelta(base,g.yaw),out=Smash.ballVelocity(ev.ball,0),outSide=cl(out.y*front*hand/Math.max(1,Math.abs(out.x)),-1,1),release=smooth(age/Math.min(.18,span*.45)),follow=impactLocal*(1-(g.strokeType==='overBack'?.30:.48)*release)+hand*.14*outSide*release;
  const influence=weight*(hit===ev?1:1-env);theta+=angleDelta(theta,base+mix(movingYaw,follow,weight))*influence;hipYaw+=angleDelta(hipYaw,base+mix(movingYaw,follow,weight*.88))*influence;
 }
 let f=pt(Math.cos(theta),Math.sin(theta),0),right=pt(-f.y*hand,f.x*hand,0),hf=pt(Math.cos(hipYaw),Math.sin(hipYaw),0),hr=pt(-hf.y,hf.x,0),fx=f.x,fy=f.y,rx=right.x,ry=right.y;
 // Only a genuine jump lifts the pelvis and both feet. Grounded overhead
 // reaches extend the hitting shoulder, with a planted split/scissor stance.
 const jumpH=hit?.contactGeometry?.jumpHeight??.18,halfFlight=Math.sqrt(2*jumpH/9.81),jumpU=dt/Math.max(.06,halfFlight),jumpLift=jump?Math.max(0,jumpH*(1-jumpU*jumpU)):0;
 let air=jump?cl(jumpLift/Math.max(.01,jumpH),0,1):0,load=jump&&dt<-.15?.085*Math.sin(Math.PI*cl((dt+M.pre)/Math.max(.03,M.pre-.15),0,1)):jump&&dt>.22?.075*Math.sin(Math.PI*cl((dt-.22)/Math.max(.03,M.post-.22),0,1)):0;
 let reachLift=over&&contact?cl((contact.z-2.36-deltaZ)*.85,0,.40)*env:0,grounded=jumpLift<.012&&reachLift<.055&&split<.25,lift=Math.max(jumpLift,reachLift*(jump?0:1),.035*split*(1-env)),crouch=(low?(geometry?.crouch??(.27*cl((1.60-(contact?.z??.4))/1.20,0,1)))*env:0)+(power?powerClip.drop*env*(jump?.55:1):0)+load+.035*(1-env)*(1-run)+.025*split+brakeClip.drop*braking*.65+clipDrop*run*(1-env)+splitClip.drop*split*.45+shotClip.drop*env*.22;
 let extension=over&&contact&&!jump?cl((contact.z-2.40-deltaZ)*.25,0,.09)*env:0;
 let footDrop=0;if(state&&jumpLift<.012&&plan){for(const j of [-1,1]){let f0=scheduledFoot(plan,motionT,j);if(f0){let d0=Math.hypot(f0.x-p.x-hr.x*j*BODY.hipHalf,f0.y-p.y-hr.y*j*BODY.hipHalf);let limit=BODY.ankle+Math.sqrt(Math.max(.17,(BODY.thigh+BODY.shin-.009)**2-d0*d0));footDrop=Math.max(footDrop,cl(BODY.hip-crouch+extension-.045*run-limit,0,.20)*(1-smooth(f0.lift/.075))*(1-.70*align));}}}let hip=pt(p.x+ux*.045*run,p.y+uy*.045*run,BODY.hip+lift-crouch+extension-.045*run-footDrop),tilt=pt(ux*(clipLean*run-.055*braking)+fx*.045,uy*(clipLean*run-.055*braking)+fy*.045,0);
 // Estimated COM is stabilized relative to the actual support feet, while
 // a shared acceleration-driven trunk/pelvis movement provides anticipation.
 if(whole){const ax=cl(whole.ax/16,-1,1),ay=cl(whole.ay/16,-1,1),w=(1-align)*(1-.55*env);tilt=V.add(tilt,pt(ax*.085*w,ay*.085*w,0));hip=V.add(hip,pt(ax*.025*w,ay*.025*w,0));}
 if(grounded&&stepL&&stepR){let wl=1-smooth(stepL.lift/.08),wr=1-smooth(stepR.lift/.08),sum=wl+wr;if(sum>.25){let support=pt((stepL.x*wl+stepR.x*wr)/sum,(stepL.y*wl+stepR.y*wr)/sum,0),com=pt(hip.x+tilt.x*.46,hip.y+tilt.y*.46,0),d=V.sub(support,com),k=.16*(1-align)*(1-.55*env)*(1-.55*run);hip=V.add(hip,pt(cl(d.x*k,-.07,.07),cl(d.y*k,-.07,.07),0));}}
 if(special?.type==='dive'){const d=V.unit(pt(contact.x-hit.start[hit.actor].x,contact.y-hit.start[hit.actor].y,0));hip.z=mix(hip.z,.42*scale,specialEnv*.88);tilt=blend(tilt,pt(d.x*.84,d.y*.84,0),specialEnv*.9);}
 if(special?.type==='between'){hip.z=mix(hip.z,.72*scale,specialEnv*.65);}
 if(contact){let horiz=pt(contact.x-p.x,contact.y-p.y,0),reach=V.len(horiz),lean=cl((reach-.47)*.65,0,.30)*env;if(low)lean=Math.min(.36,lean+.08*env);let u=V.unit(horiz);tilt=V.add(tilt,V.mul(u,lean));hip=V.add(hip,V.mul(u,lean*.25));}
 if(power){const lean=dt<0?mix(-.12,.10,Math.pow(cl((dt+M.pre)/M.pre,0,1),3)):.20*(1-smooth(dt/M.post));tilt=V.add(tilt,V.mul(f,lean*env));}
 if(tail){const {g,age,weight}=tail,blendWeight=weight*(hit===tail.ev?1:1-env)*.82;const axis0=V.sub(g.center,g.hip);tilt=blend(tilt,pt(axis0.x,axis0.y,0),blendWeight);}
 let axis=V.unit(pt(tilt.x,tilt.y,BODY.torso)),shoulder=V.add(hip,V.mul(axis,BODY.torso));
  let body=(a,b,z)=>pt(shoulder.x+fx*a*scale+rx*b*scale,shoulder.y+fy*a*scale+ry*b*scale,shoulder.z+(z-shoulder.z)*scale),R=V.add(shoulder,V.mul(right,BODY.shoulderHalf)),L=V.add(shoulder,V.mul(right,-BODY.shoulderHalf));
 // Neutral grip: elbows relaxed and bent, racket upright and slightly forward,
 // hands in front of the chest rather than an extended horizontal racket.
 let readyWrist=body(.28,.16,shoulder.z-.26),readyAim=V.unit(V.add(V.mul(f,.61),V.add(V.mul(right,.13),pt(0,0,.78)))),ready=V.add(readyWrist,V.mul(readyAim,BODY.racketCenter)),target=ready;
 if(hit){let back=ac.back,localPoint=v=>body(v[0],v[1],shoulder.z+v[2]),prep=localPoint(backMotion?.prep||M.prep),followVector=backMotion?.follow||M.follow;
 if(ac.type==='lowBack'&&['net','block'].includes(hit.kind))followVector=[.46,-.23,-.24];
 if(ac.type==='lowBack'&&hit.kind==='lift')followVector=[.56,.04,.45];
 let follow=localPoint(followVector);
 // Compact preparation for defense, full coil for overhead shots. A quadratic
 // swing path prevents the racket from moving in a straight line between key poses.
 let controlIn=backMotion?localPoint(backMotion.in):power?body(-.30,.58,shoulder.z+.67):body(over?-.08:.13,.54,shoulder.z+(over?.66:low?-.45:.02)),outDirection=V.unit(pt(hit.ball.to.x-hit.ball.from.x,hit.ball.to.y-hit.ball.from.y,0)),outZ=['smash','half','kill'].includes(hit.kind)?-.40:['clear','lift','long'].includes(hit.kind)?.28:hit.kind==='drop'?-.10:0,controlOut=V.add(contact,V.add(V.mul(outDirection,M.drive),pt(0,0,power?-.76:outZ)));
 if(dt<0){let u=cl((dt+M.pre)/M.pre,0,1),coil=power?.58:.43;target=u<coil?blend(ready,prep,smooth(u/coil)):bezier(prep,controlIn,contact,power?Math.pow(cl((u-coil)/(1-coil),0,1),1.9):smooth((u-coil)/(1-coil)));}else{let u=cl(dt/M.post,0,1),split=power?.39:over?.58:.48;target=u<split?bezier(contact,controlOut,follow,power?1-Math.pow(1-u/split,2.0):smooth(u/split)):blend(follow,ready,smooth((u-split)/(1-split)));}}

 // At impact use the engine's contact skeleton, rather than teleporting the arm to the shuttle.
 const physical=geometry,impactBlend=physical?smooth(1-Math.abs(dt)/Math.min(.19,dt<0?M.pre:M.post)):0;
 if(impactBlend>0){const contactRoot=hit.start[hit.actor],localHip=pt(p.x+physical.hip.x-contactRoot.x,p.y+physical.hip.y-contactRoot.y,physical.hip.z);hip=blend(hip,localHip,impactBlend);axis=V.unit(blend(axis,V.unit(V.sub(physical.center,physical.hip)),impactBlend));shoulder=V.add(hip,V.mul(axis,BODY.torso));const pr=V.unit(V.sub(physical.shoulder,physical.center));let sr=V.unit(blend(right,pr,impactBlend));if(V.len(sr)<.1)sr=pr;R=V.add(shoulder,V.mul(sr,BODY.shoulderHalf));L=V.sub(shoulder,V.mul(sr,BODY.shoulderHalf));}

 let reachD=V.len(V.sub(target,R));if(hit&&!hit.miss&&!physical&&reachD>BODY.upperArm+BODY.forearm+BODY.racketCenter-.003){let shift=V.mul(V.unit(V.sub(target,R)),Math.min(.30*env,reachD-(BODY.upperArm+BODY.forearm+BODY.racketCenter-.003)));let hipMax=(grounded?.94:1.30)*scale;shift.z=cl(shift.z,-.13,Math.max(0,hipMax-hip.z));shoulder=V.add(shoulder,shift);R=V.add(R,shift);L=V.add(L,shift);hip=V.add(hip,shift);}
 let aim=V.unit(V.sub(target,R));if(V.len(aim)<.01)aim=f;let dist=cl(V.len(V.sub(target,R)),.001,BODY.upperArm+BODY.forearm+BODY.racketCenter-.003),shaft=BODY.racketCenter,wantedWrist;
 if(dist<.74){let wristLen=Math.max(.22,shaft-dist+.005),cos=cl((dist*dist+shaft*shaft-wristLen*wristLen)/(2*dist*shaft),-1,1),perp=V.sub(right,V.mul(aim,V.dot(right,aim)));if(V.len(perp)<.01)perp=V.sub(pt(0,0,1),V.mul(aim,aim.z));aim=V.add(V.mul(aim,cos),V.mul(V.unit(perp),Math.sqrt(1-cos*cos)*(ac?.back?-1:1)));wantedWrist=V.sub(target,V.mul(aim,shaft));}else wantedWrist=V.add(R,V.mul(aim,dist-shaft));
 if(physical&&impactBlend>.999){const line=V.unit(V.sub(contact,R)),len=V.len(V.sub(contact,R)),shaftLen=BODY.racketCenter,armLen=cl(len-shaftLen,.09,BODY.upperArm+BODY.forearm-.003);if(len<shaftLen+.09){const wristLen=cl(shaftLen-len+.015,.09,BODY.upperArm+BODY.forearm-.003),cos=cl((len*len+shaftLen*shaftLen-wristLen*wristLen)/(2*Math.max(.001,len)*shaftLen),-1,1);let perp=V.sub(right,V.mul(line,V.dot(right,line)));if(V.len(perp)<.01)perp=V.sub(pt(0,0,1),V.mul(line,line.z));aim=V.add(V.mul(line,cos),V.mul(V.unit(perp),Math.sqrt(1-cos*cos)));}else aim=line;wantedWrist=V.sub(contact,V.mul(aim,shaftLen));}
 if(physical?.impact&&impactBlend>0){const w=impactBlend**2;let ia=V.unit(blend(aim,physical.impact.aim,w));if(V.len(ia)>.1)aim=ia;wantedWrist=blend(wantedWrist,V.add(R,V.sub(physical.impact.wrist,physical.shoulder)),w);}
 let blendHit=smooth(env/.48);if(!hit)blendHit=0;aim=V.unit(blend(readyAim,aim,blendHit));if(V.len(aim)<.01)aim=readyAim;wantedWrist=blend(readyWrist,wantedWrist,blendHit);
 // Drive the wrist and shaft through contact with a nonzero, shot-dependent tangent.
 const kinetic=hit&&SmashStrokes.impactCurve(hit,dt,M,BODY,R,aim,wantedWrist);
 if(kinetic){aim=kinetic.aim;wantedWrist=kinetic.wrist;}
 let backPole=backMotion?.elbow,pole=backPole?V.add(V.mul(f,backPole[0]*blendHit),V.add(V.mul(right,mix(.48,backPole[1],blendHit)),pt(0,0,mix(-.8,backPole[2],blendHit)))):V.add(V.mul(right,mix(.48,.72,blendHit)),pt(-fx*.18,-fy*.18,over?.12:-.8)),arm=armIK(R,wantedWrist,pole,BODY.upperArm,BODY.forearm),racket=V.add(arm.wrist,V.mul(aim,shaft));
 let freeReady=body(.23,-.17,shoulder.z-.30),freePrep=power?body(.29,-.29,shoulder.z+.48):backMotion?body(-.12,-.40,shoulder.z+(over?.12:-.30)):body(over?.28:low?-.30:.16,over?-.32:-.37,shoulder.z+(over?.37:low?-.22:-.14)),freeFollow=power?body(.17,-.10,shoulder.z-.39):body(-.08,-.33,shoulder.z-.36),nonTarget=hit?blend(freeReady,dt<0?freePrep:blend(freePrep,freeFollow,smooth(dt/(M.post*.65))),env):freeReady,other=armIK(L,nonTarget,V.add(V.mul(right,-1),pt(0,0,-.65)),BODY.upperArm,BODY.forearm);
 if(special?.type==='dive'){const d=V.unit(pt(contact.x-hit.start[hit.actor].x,contact.y-hit.start[hit.actor].y,0)),brace=pt(L.x+d.x*.23-right.x*.10,L.y+d.y*.23-right.y*.10,.09);other=armIK(L,blend(other.wrist,brace,specialEnv*.90),V.add(V.mul(right,-1),pt(0,0,-.65)),BODY.upperArm,BODY.forearm);}
 // Distance-driven alternating foot placement. Shuffle / crossover / retreat
 // differ by step length, side orientation and stance width.
 let d=plan?Math.hypot(plan.to.x-plan.from.x,plan.to.y-plan.from.y):0,progress=plan?Math.hypot(p.x-plan.from.x,p.y-plan.from.y):0,dir=plan&&d>1e-5?pt((plan.to.x-plan.from.x)/d,(plan.to.y-plan.from.y)/d,0):pt(ux,uy,0),legs=[];
 for(let j of [-1,1]){let width=(.205+(low?.10*env:0))*scale,step=dir.x*front<-.55?.48:Math.abs(dir.y)>.70?(d>1.55?.53:.38):.53,anchor=stepAnchor(progress,d,j*(dir.y*front<0?-1:1),step),edge=e?Math.min(smooth(t/.075),smooth((e.duration-t)/.075)):1,off=cl(anchor.at-progress,-.55,.55)*edge,ankle=pt(p.x+hr.x*j*width+dir.x*off,p.y+hr.y*j*width+dir.y*off,.045+lift*.88+anchor.lift*(1-.65*env)*edge);if(restMotion){let stride=Math.sin(rest*13+i*1.8+j*Math.PI*.5)*.20*run;ankle=V.add(ankle,pt(ux*stride,uy*stride,Math.max(0,stride)*.25));}
 if(state&&t>=0){const speed=Math.hypot(state.vel.x,state.vel.y),amp=smooth(speed/.80),scheduled=scheduledFoot(plan,motionT,j),foot=scheduled||gaitFoot(plan,motionT,i,j,prevEvent?.plans[i],prevEvent?.duration,nextEvent?.plans[i],nextEvent?.duration,front,e.duration),base=pt(p.x+hr.x*j*(.205+.07*split),p.y+hr.y*j*(.205+.07*split),.045+lift*.88+.025*split*(1-env));const planted=pt(foot.x,foot.y,.045+lift*.88+foot.lift*(1-.35*env));ankle=scheduled?planted:blend(base,planted,amp*(1-.65*env));
 const crossWeight=smooth((Math.abs(moveSide)-.48)/.32)*smooth((speed-1.8)/1.1);if(!scheduled&&crossWeight>0){ankle=V.add(ankle,V.mul(hr,-j*.16*amp*crossWeight*Math.sin(Math.PI*cl(foot.lift/.13,0,1))));if(crossWeight>.6)mode='交叉步';}else if(moveForward<-.45&&speed>.7)mode='转身后撤';}

 if(jump&&contact&&air>0){const swap=smooth((dt+.10)/.27),stagger=(j===hand?-1:1)*mix(.24,-.26,swap)*air;ankle=V.add(ankle,V.mul(hf,stagger));ankle.z+=Math.max(0,(j===hand?1-swap:swap)-.5)*.11*air;}
 if(over&&grounded&&contact){let transfer=smooth((dt+M.pre)/Math.max(.01,M.pre+M.post)),stagger=(j===hand?-.23:.20)*(1-2*transfer)*env;ankle=V.add(ankle,V.mul(hf,stagger*(state?.40:1)));ankle.z=mix(ankle.z,.045,env*.65);if(env>.45)mode=dt<0?'侧身架拍':dt<.12?'蹬转击球':'重心回位';}
 // Low split-step flight followed by a planted landing; not a high jump.
 if(grounded&&env>.7){let support=hand*(over?(dt<0?1:-1):1);if(j===support)ankle.z=.045;}
 if(low&&contact&&j===hand){let lunge=V.unit(pt(contact.x-p.x,contact.y-p.y,0)),target=pt(p.x+lunge.x*.48+hr.x*.13*hand,p.y+lunge.y*.48+hr.y*.13*hand,.045+lift*.88),anchor=state&&scheduledFoot(plan,motionT,j);
  // The planned plant owns the support foot. A rescue may still reach, but not drag an already planted ankle.
  if(!anchor)ankle=blend(ankle,target,.80*smooth(env));else if(anchor.lift>.035)ankle=blend(ankle,target,.25*smooth(env)*smooth(anchor.lift/.12));
  mode=env>.55?'跨步救球':mode;}
 if(special?.type==='spin'&&dt<0){const pivot=pt(hip.x+hr.x*j*.20*scale-hf.x*j*.10,hip.y+hr.y*j*.20*scale-hf.y*j*.10,.045+.065*Math.sin(Math.PI*cl((dt+M.pre)/M.pre,0,1))*(j===hand?1:.4));ankle=blend(ankle,pivot,specialEnv*.85);}
 if(special?.type==='between'){const spread=pt(hip.x+hr.x*j*.32*scale,hip.y+hr.y*j*.32*scale,.045);ankle=blend(ankle,spread,specialEnv*.95);}
 if(special?.type==='dive'){const d=V.unit(pt(contact.x-hit.start[hit.actor].x,contact.y-hit.start[hit.actor].y,0)),trail=pt(hip.x-d.x*(j===hand?.49:.38)*scale+hr.x*j*.18*scale,hip.y-d.y*(j===hand?.49:.38)*scale+hr.y*j*.18*scale,.045+(j===hand?.10:.035)*specialEnv);ankle=blend(ankle,trail,specialEnv*.94);}
 if(impactBlend>0&&physical.elevation>0){ankle.z=Math.max(ankle.z,.045+physical.elevation*impactBlend*.95);}let h=V.add(hip,V.mul(hr,j*BODY.hipHalf));if(grounded&&!jump){const lateral=V.dot(V.sub(ankle,hip),hr)*j;const rear=smooth((-moveForward-.15)/.55),fix=cl((.075-lateral),0,.30)*Math.max(rear,smooth(Math.abs(moveSide)/.65))*(1-.55*env);ankle=V.add(ankle,V.mul(hr,j*fix));}if(grounded&&over&&env>.45){ankle.z=Math.max(ankle.z,cl(h.z-(BODY.thigh+BODY.shin-.015),.045,.085));let dz=h.z-ankle.z,maxGround=Math.sqrt(Math.max(.01,(BODY.thigh+BODY.shin-.005)**2-dz*dz)),delta=pt(ankle.x-h.x,ankle.y-h.y,0),len=V.len(delta);if(len>maxGround){ankle.x=h.x+delta.x*maxGround/len;ankle.y=h.y+delta.y*maxGround/len;}}// Enforce a feasible ankle BEFORE IK. If the previous plant is outside the
 // moving pelvis envelope, treat it as a corrective swing, not a stretched leg.
 const floor=BODY.ankle,legLength=BODY.thigh+BODY.shin-.012;
 const minAnkle=Math.max(floor,h.z-legLength+.006);
 ankle.z=Math.max(ankle.z,minAnkle);
 const dzLeg=h.z-ankle.z,groundReach=Math.sqrt(Math.max(.0001,legLength*legLength-dzLeg*dzLeg)),planar=pt(ankle.x-h.x,ankle.y-h.y,0),lenPlanar=V.len(planar);
 const maxStep=Math.min(groundReach,.56*scale);
 const softEdge=Math.max(.001,maxStep*.84);if(lenPlanar>softEdge){const excess=Math.max(0,lenPlanar-maxStep),span=Math.max(.001,maxStep-softEdge),safe=Math.min(maxStep,softEdge+span*Math.tanh((lenPlanar-softEdge)/span));ankle.x=h.x+planar.x*safe/lenPlanar;ankle.y=h.y+planar.y*safe/lenPlanar;if(!jump&&excess>.025){ankle.z+=Math.min(.095,excess*.28)*smooth(excess/.10);if(env<.45)mode='调整步 / 换脚';}}
 let kneePole=V.add(hf,V.mul(hr,j*.12)),leg=armIK(h,ankle,kneePole,BODY.thigh,BODY.shin);legs.push({h,knee:leg.elbow,ankle:leg.wrist});}
 if(jump&&env>.4)mode=jumpLift>.008?(power?'跳杀 · 腾空击球':'剪刀步 · 腾空击球'):(dt<0?'起跳准备':'落地缓冲');else if(power&&env>.42)mode=dt<-.065?'重杀 · 蓄力架拍':dt<.10?'重杀 · 蹬转下压':'重杀 · 随挥回位';if(special&&env>.32)mode=special.label+(dt>.10?' · 恢复重心':'');if(hit?.miss&&env>.25)mode='受压挥空';
 const head=V.add(shoulder,V.mul(axis,BODY.headOffset));let com=pt(0,0,0);const mass=(q,w)=>{com=V.add(com,V.mul(q,w));};mass(blend(hip,shoulder,.53),.49);mass(head,.08);for(const leg of legs){mass(blend(leg.h,leg.knee,.43),.10);mass(blend(leg.knee,leg.ankle,.43),.045);mass(leg.ankle,.015);}for(const [sh,limb] of [[R,arm],[L,other]]){mass(blend(sh,limb.elbow,.44),.027);mass(blend(limb.elbow,limb.wrist,.43),.022);mass(limb.wrist,.006);} // normalized mass sum = 1
 return {com,special:special?.type||null,body:BODY,hand,front,hip,shoulder,R,L,arm,other,racket,aim,legs,f,right,hr,hf,axis,head:V.add(shoulder,V.mul(axis,BODY.headOffset)),contact,dt,ac,M,env,mode,yaw:theta,airborne:jumpLift>.008||.035*split*(1-env)>.009||lift>.06,impactNormal:kinetic?.normal||physical?.impact?.normal||null,impactBlend:kinetic?.weight??impactBlend,impactSpeed:kinetic?.speed??null,contactGap:contact?V.len(V.sub(contact,racket)):null};}
return {pose};
})();


/* venue */
globalThis.createSmashVenue=function(api){
const {W,H,cl,$,camera,perspective,P,poly,line,ellipse,text,ground}=api;
let c,cv;
// Background cached separately from animation; seeded spectators never change the match RNG.
let bgKey='',bgCanvas=document.createElement('canvas');bgCanvas.width=Math.round(W*1.5);bgCanvas.height=Math.round(H*1.5);
function sr(n){let v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)}
let venue=null;
function venueFor(id){let e=ev(id)||{},key=String(id||'').replace(/^\d{4}-/,''),hash=[...key].reduce((h,x)=>(Math.imul(h,31)+x.charCodeAt(0))>>>0,0),pal=[['#303c40','#485456','#788e92','#527e85','#397858','#428464','#4b5c60','#d3e0d7'],['#3d3944','#514d5a','#8b8997','#697b87','#397557','#468162','#55505e','#e0d9e3'],['#403c38','#59524a','#9c9488','#738a86','#417b59','#4b8866','#5e5951','#e6ded2'],['#323d3b','#46564e','#81928e','#557c79','#347650','#438460','#4b5c54','#dbe3d5'],['#303943','#455461','#8195a1','#507d8d','#367653','#438363','#4c5d69','#dce6eb'],['#40393d','#585055','#9b9094','#758b89','#3c7958','#498565','#60565b','#e5dadb']];let idx=({MASOPEN:0,ALLENGLAND:3,INAOPEN:2,WC:4,FINALS:1})[key]??hash%pal.length;if(e.level==='WC')idx=4;if(e.level==='FINALS')idx=1;let [roof,wall,outer,apron,court,mid,board,accent]=pal[idx];let rows=({WC:9,FINALS:9,'1000':8,'750':7,'500':6,'300':5,'100':4})[e.level]||6;return {key:id,name:e.name||'SMASH WORLD TOUR',city:displayText(e.city),level:e.level||'',roof,wall,outer,apron,court,mid,board,accent,rows,seed:hash,idx};}
// Low courtside LED fascia: all geometry projected in world coordinates. No stretched screen-space lettering.
function board(x0,x1,y0,y1,word,index=0){
 const h=.64,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy);if(len<.01)return;
 const nx=Math.abs(dx)>Math.abs(dy)?0:.14,ny=Math.abs(dx)>Math.abs(dy)?Math.sign(y0||1)*.14:0;
 const A=P(x0,y0,h),B=P(x1,y1,h),C=P(x1,y1,0),D=P(x0,y0,0),E=P(x0+nx,y0+ny,h),F=P(x1+nx,y1+ny,h),G=P(x1+nx,y1+ny,0),J=P(x0+nx,y0+ny,0);
 const point=(u,z)=>P(x0+u*dx,y0+u*dy,z);
 poly([P(x0,y0,0),P(x1,y1,0),P(x1+nx*2,y1+ny*2,0),P(x0+nx*2,y0+ny*2,0)],'#243a3440');
 poly([A,E,F,B],'#697778');poly([B,F,G,C],'#343f42');poly([D,J,E,A],'#414d4f');
 poly([A,B,C,D],'#344247','#728184',.65);
 const grad=c.createLinearGradient(0,Math.min(A.y,B.y),0,Math.max(C.y,D.y)+1);grad.addColorStop(0,'#53676a');grad.addColorStop(1,'#3b4a4e');
 poly([point(.018,.59),point(.982,.59),point(.982,.055),point(.018,.055)],grad);
 // Restrained abstract sponsor graphics, mapped to the board plane, not rotated billboard text.
 const accent=['#afc4bc','#9eafb8','#b7b0a0'][index%3];
 for(let u of [.09,.57]){poly([point(u,.19),point(u+.095,.46),point(u+.13,.46),point(u+.035,.19)],accent);poly([point(u+.14,.19),point(u+.235,.46),point(u+.26,.46),point(u+.165,.19)],'#e0e3d7a6');}
 line(point(.018,.075),point(.982,.075),'#202e31',1);line(A,B,'#899899',.65);
}
// Adjacent courts use the same metric court geometry and perspective as Court 01.
// They are scenery only: no players, match RNG or simulated collisions.
function adjacentCourt(center,index){
 const low=center-3.05,high=center+3.05,ink='#dce4d9',muted='#b9cfc2';
 const g=c.createLinearGradient(0,P(13.4,center).y,0,P(0,center).y);
 g.addColorStop(0,'#568470');g.addColorStop(1,'#4c7766');
 ground(-1.0,14.35,center-3.62,center+3.62,'#66858b');ground(0,13.4,low,high,g);
 for(let x of [0,.76,4.68,8.68,12.6,13.36])ground(x,x+.04,low,high,x===0||x===13.36?ink:muted);
 for(let y of [low,center-2.57,center+2.57,high-.04])ground(0,13.4,y,y+.04,ink);
 ground(0,4.72,center-.02,center+.02,ink);ground(8.68,13.4,center-.02,center+.02,ink);
 let top=y=>P(6.7,y,1.524+.026*Math.abs(y-center)/3.05),bottom=y=>P(6.7,y,.76);
 poly([top(low),top(high),bottom(high),bottom(low)],'#142b3355');
 for(let y=low;y<=high;y+=.24)line(top(y),bottom(y),'#a6bfb72c',.6);
 for(let z=.76;z<1.53;z+=.15)line(P(6.7,low,z),P(6.7,high,z),'#b2c4c43d',.65);
 line(top(low),top(high),'#c5d5cd',1.6);for(let y of [low,high])line(P(6.7,y),P(6.7,y,1.55),'#b3c5c7',2.5);
 for(let y of [center-2.95,center+.05])board(14.85,14.85,y,y+2.9,y<center?'SMASH':'BADMINTON',index);
}
function courtside(){
 for(let sign of [-1,1]){
  const center=sign*8.75, band=(a,b,col)=>ground(-1.9,15.15,Math.min(sign*a,sign*b),Math.max(sign*a,sign*b),col);
  band(3.7,4.08,'#4b6265');band(4.08,5.13,'#647b7e');band(5.13,5.2,venue.accent+'55');
  // Main court advertising in the walkway, outside both playing areas.
  for(let x of [0,3.45,6.9,10.35])board(x,x+3.29,sign*4.25,sign*4.25,['SMASH',"WOMEN’S SINGLES",'WORLD TOUR','BADMINTON'][Math.round(x/3.45)],Math.round(x/3.45));
 }
 for(let j=0;j<4;j++){let y=-5.65+j*2.82;board(14.85,14.85,y,y+2.73,['SMASH','WORLD TOUR',venue.level==='WC'?'CHAMPIONSHIPS':venue.level==='FINALS'?'FINALS':'BADMINTON'][j],j);}
}
function arena(){let g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,venue.roof);g.addColorStop(.43,venue.wall);g.addColorStop(1,venue.outer);c.fillStyle=g;c.fillRect(0,0,W,H);if(!perspective()||!$('crowd').checked)return;
let horizon=P(15.4,0,0).y,base=cl(horizon-30,100,H*.70),top=54,rows=Math.max(venue.rows,Math.ceil((base-top)/27)),dy=(base-top)/rows;
// Roof beams, recessed lighting and soft wall falloff.
c.fillStyle='#101c25';c.fillRect(0,0,W,top);c.fillStyle=venue.wall;c.fillRect(0,21,W,31);line({x:0,y:52},{x:W,y:52},'#a8bdc530',1);for(let j=0;j<Math.ceil(W/110);j++){let x=35+j*110;let glow=c.createRadialGradient(x+16,13,1,x+16,13,62);glow.addColorStop(0,'#ecf4e31f');glow.addColorStop(1,'#ffffff00');c.fillStyle=glow;c.fillRect(x-48,0,130,90);c.fillStyle='#dce6df';c.fillRect(x,10,32,3);c.fillStyle='#50646b';c.fillRect(x,15,32,1)}
const aisles=[W*.16,W*.36,W*.64,W*.84],colors=['#526476','#7c8e9b','#a5adb4','#8b6967','#c1b5a1','#475568','#647b76','#8b8295','#394958'];
for(let r=0;r<rows;r++){let y=top+(r+1)*dy,spacing=13+r*.38,sc=cl(dy/20,.54,1.12);let tier=c.createLinearGradient(0,y-dy,0,y);tier.addColorStop(0,venue.roof);tier.addColorStop(.5,venue.wall);tier.addColorStop(1,'#1a2932');c.fillStyle=tier;c.fillRect(0,y-dy,W,dy);for(let k=0;k<Math.ceil(W/spacing);k++){let x=k*spacing+(r%2)*spacing*.5;if(aisles.some(a=>Math.abs(x-a)<16))continue;let n=100+venue.seed%997+r*113+k,j=(sr(n+18)-.5)*2.6;c.fillStyle=venue.board;c.fillRect(x-5,y-7,10,5);if(sr(n)<.23)continue;let col=colors[Math.floor(sr(n+800)*colors.length)],skin=['#a78e7a','#8d7465','#b9a38e','#6c554a'][Math.floor(sr(n+11)*4)];ellipse({x:x+j,y:y-7*sc},4.8*sc,5.5*sc,col);ellipse({x:x+j,y:y-13*sc},2.5*sc,3*sc,skin);ellipse({x:x+j,y:y-14.2*sc},2.4*sc,1.3*sc,'#29343c');}line({x:0,y},{x:W,y},'#101f2a',1.2)}
for(let x of aisles){c.fillStyle='#34434c';c.fillRect(x-11,top,22,base-top);for(let y=top+dy;y<base;y+=dy)line({x:x-11,y},{x:x+11,y},'#64717a',.8);line({x:x-12,y:top},{x:x-12,y:base},'#91a0a955',1);line({x:x+12,y:top},{x:x+12,y:base},'#91a0a955',1)}
// Subdue the upper stands so the white shuttle remains visible against the audience.
let shade=c.createLinearGradient(0,top,0,base);shade.addColorStop(0,'#17242785');shade.addColorStop(.55,'#17242742');shade.addColorStop(1,'#17242718');c.fillStyle=shade;c.fillRect(0,top,W,base-top);
// A middle-tier concourse separates the upper and lower seating sections.
let concourse=top+Math.round(rows*.55)*dy;c.fillStyle='#182b36';c.fillRect(0,concourse-3,W,7);line({x:0,y:concourse-3},{x:W,y:concourse-3},'#82969d66',1);
// Continuous railing and tournament ribbon, not individual repeated labels.
line({x:0,y:base-2},{x:W,y:base-2},'#b9afa4',1.5);for(let x=20;x<W;x+=55)line({x,y:base-9},{x,y:base+5},'#b9afa4',.8);c.fillStyle=venue.board;c.fillRect(0,base+3,W,23);c.fillStyle=venue.accent;c.globalAlpha=.6;c.fillRect(0,base+3,W,1);c.globalAlpha=1;
}
function field(){let key=camera+'|'+$('crowd').checked+'|'+venue.key;if(bgKey!==key){bgKey=key;arena();ground(-2.3,15.4,-13.1,13.1,venue.outer);if(perspective()){adjacentCourt(-8.75,2);adjacentCourt(8.75,3);}for(let sign of [-1,1]){ground(-1.85,14.9,Math.min(sign*4.85,sign*4.91),Math.max(sign*4.85,sign*4.91),'#ffffff16');}ground(-1.25,14.55,-3.65,3.65,venue.apron);let floor=c.createLinearGradient(0,P(13.4,0).y,0,P(0,0).y);floor.addColorStop(0,venue.mid);floor.addColorStop(1,venue.court);ground(0,13.4,-3.05,3.05,floor);let apron=c.createLinearGradient(0,P(14.55,0).y,0,P(-1.25,0).y);apron.addColorStop(0,'#ffffff09');apron.addColorStop(1,'#0b20272e');ground(-1.25,14.55,-3.65,3.65,apron);ground(0,13.4,-3.05,3.05,floor);for(let y=-2.94;y<3.0;y+=.49)line(P(0,y),P(13.4,y),'#ffffff08',.55);
const ln='#f2f0e4',aux='#d6e3d8';ground(0,.04,-3.05,3.05,ln);ground(13.36,13.4,-3.05,3.05,ln);ground(0,13.4,-3.05,-3.01,aux);ground(0,13.4,3.01,3.05,aux);ground(.76,.80,-3.05,3.05,aux);ground(12.60,12.64,-3.05,3.05,aux);ground(0,13.4,-2.59,-2.55,ln);ground(0,13.4,2.55,2.59,ln);ground(4.68,4.72,-3.05,3.05,ln);ground(8.68,8.72,-3.05,3.05,ln);ground(0,4.72,-.02,.02,ln);ground(8.68,13.4,-.02,.02,ln);
if(perspective()&&$('crowd').checked){courtside(); // umpire chair and ladder, outside the court
let y=-3.7,x=6.7;for(let k of [-.24,.24])line(P(x+k,y,0),P(x+k,y,1.87),'#a9bcbd',2);for(let z=.25;z<1.6;z+=.31)line(P(x-.24,y,z),P(x+.24,y,z),'#a9bcbd',1.4);poly([P(x-.32,y-.24,1.65),P(x+.32,y-.24,1.65),P(x+.32,y+.24,1.65),P(x-.32,y+.24,1.65)],'#263843','#718a8c');line(P(x+.3,y,1.65),P(x+.3,y,2.04),'#829a9e',3);let u=P(x,y,2.26);ellipse(u,u.s*.09,u.s*.11,'#c6a88b');line(P(x,y,1.77),P(x,y,2.08),'#dae0dc',u.s*.25);}
bgCanvas.getContext('2d').drawImage(cv,0,0);
}else c.drawImage(bgCanvas,0,0,W,H);}
function net(){let a=P(6.7,-3.05),b=P(6.7,3.05),at=P(6.7,-3.05,1.55),bt=P(6.7,3.05,1.55);if(camera==='top'||camera==='side'){line(a,b,'#223c32',5);line(a,b,'#dce6d8',1.5);return}let nbot=y=>P(6.7,y,.76),ntop=y=>P(6.7,y,1.524+.026*Math.abs(y)/3.05);poly([ntop(-3.05),ntop(3.05),nbot(3.05),nbot(-3.05)],'#243b3550');for(let y=-3.05;y<=3.06;y+=.14)line(nbot(y),ntop(y),'#dce5dc30',.65);for(let z=.76;z<1.53;z+=.105)line(P(6.7,-3.05,z),P(6.7,3.05,z),'#dce5dc45',.65);line(at,bt,'#f1f2e5',3);for(const y of [-3.05,3.05]){let q=P(6.7,y),r=P(6.7,y,1.55);ellipse(q,7,3,'#1d312ca0');line(q,r,'#172e28',6);line(q,r,'#acc1af',2);ellipse(r,3,3,'#e0e9d9')}}
return {venueFor,field(ctx,canvas,theme){c=ctx;cv=canvas;venue=theme;field()},net(ctx){c=ctx;net()}};
};


/* player */
globalThis.drawSmashPlayer=function(api,i,p,e,t,ends,nextEvent=null,restMotion=null,prevEvent=null){
const {p3,perspective,ellipse,shirts,text,dark,pose,P,line,poly,eye}=api,{pt,mix,blend,V,smooth}=SmashAnimMath;
let foot=p3(p);if(!perspective()){ellipse(foot,10,10,'#23392b80');ellipse(foot,9,9,shirts[i],'#eff3e5',1.3);return}
let a=pose(i,p,e,t,ends,nextEvent,restMotion,prevEvent),q=v=>P(v.x,v.y,v.z),{hip,shoulder,R,L,arm,other,racket,aim,legs,f,right,head}=a;
const hs=a.body.scale,s=foot.s*hs,items=[],camera=eye(),skin='#cfb196',hair='#303438';
// Sort small projected surfaces and limb sections by true camera depth rather
// than drawing every arm in front of the torso, irrespective of player facing.
const queue=(ps,draw)=>items.push({depth:ps.reduce((d,v)=>d+1/q(v).s,0)/ps.length,draw});
const bone=(u,v,col,w,scaled=true)=>{const n=Math.max(1,Math.ceil(V.len(V.sub(v,u))/.10));for(let j=0;j<n;j++){let b=blend(u,v,j/n),d=blend(u,v,(j+1)/n);queue([b,d],()=>line(q(b),q(d),col,Math.max(.5,q(blend(b,d,.5)).s*w*(scaled?hs:1))))}};
const dot=(v,rx,ry,col)=>queue([v],()=>ellipse(q(v),q(v).s*rx*hs,q(v).s*ry*hs,col));
const surface=(ps,col,stroke=null,width=.45)=>queue(ps,()=>poly(ps.map(q),col,stroke,width));
const cross=(u,v)=>pt(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x);
const average=ps=>V.mul(ps.reduce((sum,v)=>V.add(sum,v),pt(0,0,0)),1/ps.length);
// Use a true torso volume; only camera-facing panels are drawn. This gives
// side-on and rear poses distinct silhouettes instead of a flat front bib.
const axis=a.axis,side=V.unit(V.sub(R,L));let fw=V.unit(cross(side,axis));if(V.dot(fw,f)<0)fw=V.mul(fw,-1);
const ringAt=(center,lateral,depth,n=12)=>Array.from({length:n},(_,j)=>{let theta=j/n*Math.PI*2;return V.add(center,V.add(V.mul(side,lateral*Math.cos(theta)*hs),V.mul(fw,depth*Math.sin(theta)*hs)))});
function shell(rings,centers,paint){for(let k=0;k<rings.length-1;k++)for(let j=0;j<rings[k].length;j++){let n=(j+1)%rings[k].length,ps=[rings[k][j],rings[k][n],rings[k+1][n],rings[k+1][j]],mid=average(ps),center=blend(centers[k],centers[k+1],.5),rad=V.sub(mid,center);let normal=cross(V.sub(ps[1],ps[0]),V.sub(ps[3],ps[0]));if(V.dot(normal,rad)<0)normal=V.mul(normal,-1);if(V.dot(normal,V.sub(camera,mid))<=0)continue;let col=paint(k,j,mid,rad);surface(ps,col,col,.55)}}
const shade=(hex,k)=>{let n=parseInt(hex.slice(1),16);return '#'+[n>>16&255,n>>8&255,n&255].map(v=>Math.round(Math.max(0,Math.min(255,v*k))).toString(16).padStart(2,'0')).join('')};
ellipse(p3(a.com||p),foot.s*.37,foot.s*.12,'#142e2870');
for(let {h,knee,ankle} of legs){let hem=blend(h,knee,.58);bone(h,hem,dark[i],.132);bone(hem,knee,skin,.080);bone(knee,ankle,skin,.071);dot(knee,.041,.041,skin);let sock=blend(knee,ankle,.82);bone(sock,ankle,'#e5e7dc',.10);let toe=V.add(ankle,V.mul(a.hf,.16*hs));bone(ankle,toe,'#edf0e7',.12);bone(V.add(ankle,pt(0,0,-.035*hs)),V.add(toe,pt(0,0,-.035*hs)),'#53625d',.035)}
const torsoCenters=[hip,blend(hip,shoulder,.25),blend(hip,shoulder,.65),shoulder,V.add(shoulder,V.mul(axis,.055*hs))];
const torsoRings=torsoCenters.map((v,k)=>ringAt(v,[.158,.120,.148,.173,.100][k],[.086,.078,.093,.080,.052][k]));
shell(torsoRings,torsoCenters,(k,j,mid,rad)=>{let facing=V.dot(V.unit(rad),fw),edge=Math.abs(V.dot(V.unit(rad),side)),col=k===0?dark[i]:shirts[i];return shade(col,(facing<-.2?.94:1.015)-.065*edge)});
bone(shoulder,V.add(shoulder,V.mul(axis,.13*hs)),skin,.091);
for(let [sh,limb] of [[L,other],[R,arm]]){let sleeve=blend(sh,limb.elbow,.40);bone(sh,sleeve,shirts[i],.092);bone(sleeve,limb.elbow,skin,.064);bone(limb.elbow,limb.wrist,skin,.056);dot(limb.elbow,.035,.035,skin);dot(limb.wrist,.038,.038,skin)}
// Racket shares the existing exact three-dimensional impact geometry.
let gripEnd=V.add(arm.wrist,V.mul(aim,.10)),neck=V.add(racket,V.mul(aim,-.13));bone(arm.wrist,gripEnd,'#253538',.045,false);dot(V.add(arm.wrist,V.mul(aim,.035)),.045,.041,skin);bone(gripEnd,neck,'#e4eae4',.022,false);let perp=V.sub(right,V.mul(aim,V.dot(right,aim)));if(V.len(perp)<.02)perp=V.sub(pt(0,0,1),V.mul(aim,aim.z));perp=V.unit(perp);let normal=V.unit(pt(aim.y*perp.z-aim.z*perp.y,aim.z*perp.x-aim.x*perp.z,aim.x*perp.y-aim.y*perp.x)),roll=a.ac?(a.ac.back?-1:1)*a.env*(a.dt<0?mix(-.40,.08,smooth(1+a.dt/a.M.pre)):mix(.08,.95,smooth(a.dt/.17))):.16;perp=V.add(V.mul(perp,Math.cos(roll)),V.mul(normal,Math.sin(roll)));if(a.impactNormal&&a.impactBlend>0){const n=a.impactNormal,physicalPerp=V.unit(pt(n.y*aim.z-n.z*aim.y,n.z*aim.x-n.x*aim.z,n.x*aim.y-n.y*aim.x));const v=V.dot(physicalPerp,perp)<0?V.mul(physicalPerp,-1):physicalPerp;perp=V.unit(blend(perp,v,a.impactBlend));}let ring=[];for(let j=0;j<28;j++){let w=j/28*Math.PI*2;ring.push(V.add(racket,V.add(V.mul(aim,.139*Math.cos(w)),V.mul(perp,.094*Math.sin(w)))))}surface(ring,'#e6f0e520','#f0f3e8',1.45);for(let k of [-.5,0,.5]){let len=.139*Math.sqrt(1-k*k),d=V.add(racket,V.mul(perp,k*.094));bone(V.add(d,V.mul(aim,-len)),V.add(d,V.mul(aim,len)),'#e2ece580',.010,false)}

// Head and hair use an oriented ellipsoid, with the hair covering the rear
// and upper head. Front facial shading never appears through the back.
const N=16,levels=[-1,-.83,-.48,0,.48,.83,1],hc=levels.map(v=>V.add(head,V.mul(axis,v*.102*hs))),hrings=levels.map((v,k)=>ringAt(hc[k],Math.max(.001,.072*Math.sqrt(1-v*v)),Math.max(.001,.079*Math.sqrt(1-v*v)),N));
shell(hrings,hc,(k,j,mid,rad)=>{let facing=V.dot(rad,fw)/(.079*hs),upper=(levels[k]+levels[k+1])*.5;let isHair=upper>.48||(upper>-.65&&facing<-.18)||(upper>.10&&facing<.25);return shade(isHair?hair:'#d1b398',.96+.07*Math.max(0,facing))});
const tie=V.add(head,V.add(V.mul(fw,-.081*hs),V.mul(axis,.025*hs))),tail=V.add(tie,V.add(V.mul(fw,-.077*hs),V.mul(axis,-.103*hs)));bone(tie,tail,hair,.051);dot(tail,.032,.044,hair);dot(tie,.034,.032,hair);dot(V.add(tie,V.mul(fw,-.028*hs)),.018,.018,shirts[i]);
items.sort((a,b)=>b.depth-a.depth);for(const item of items)item.draw();if(a.special&&a.env>.55)text(a.mode,foot.x,foot.y+19,'#f6e8b5',10,750);
};

/* shuttle */
globalThis.drawSmashShuttle=function(api,e,t,terminal,drop=0){
const S=Smash,{W,H,active,pose,p3,ellipse,kmh,color,$,c,line,poly,text}=api,{pt,mix,blend,V,smooth,cl}=SmashAnimMath;
if(t<0){let p=e.plans.map(plan=>S.pathPos(plan,0)),a=pose(e.actor,p[e.actor],e,t,active.r.ends),contact=pt(e.ball.from.x,e.ball.from.y,e.ball.h),held=V.add(a.other.wrist,pt(0,0,-.035)),b=blend(held,contact,smooth((t+.13)/.13)),q=p3(b,b.z);ellipse(q,2.8,2.8,'#fff6d9','#d9e4d9',.6);return;}let b=S.ballAt(e.ball,t);if(terminal&&e.outcome==='net')b.z=Math.max(0,b.z-4.9*drop*drop);let q=p3(b,b.z),shadow=p3(b),v=kmh(e.ball,t),col=terminal?'#fdf4d8':color(v),fast=['smash','half','kill','drive'].includes(e.kind);ellipse(shadow,3.2+b.z*.36,1.9+b.z*.13,`rgba(16,39,32,${cl(.47-b.z*.065,.13,.47)})`);if($('trail').checked&&!terminal&&t>0){let start=Math.max(0,t-(fast?.145:.28));for(let j=1;j<=20;j++){let a=mix(start,t,(j-1)/20),z=mix(start,t,j/20),p=S.ballAt(e.ball,a),r=S.ballAt(e.ball,z);c.globalAlpha=.06+.64*(j/20)**1.5;line(p3(p,p.z),p3(r,r.z),color(kmh(e.ball,(a+z)/2)),.9+1.7*j/20+Math.min(.8,v/180))}c.globalAlpha=1}
if(!terminal&&(q.y<14||q.y>H-14||q.x<14||q.x>W-14)){const X=cl(q.x,40,W-40),Y=cl(q.y,22,H-22),d=V.unit(pt(q.x-X,q.y-Y,0)),tip={x:X+d.x*7,y:Y+d.y*7},left={x:X-d.x*5-d.y*5,y:Y-d.y*5+d.x*5},right={x:X-d.x*5+d.y*5,y:Y-d.y*5-d.x*5};line(left,tip,'#fff4d2',1.7);line(tip,right,'#fff4d2',1.7);text(b.z.toFixed(1)+' m',X,cl(Y+18,16,H-6),'#fff4d2',12,750);return;}
let vel=S.ballVelocity(e.ball,t),future=V.add(b,V.mul(vel,.001)),q1=p3(future,future.z),dx=q1.x-q.x,dy=q1.y-q.y;if(terminal&&e.outcome==='net'&&drop>0){dx=0;dy=1;}let angle=Math.atan2(dy,dx),scale=cl(q.s/55,.9,1.65);c.save();c.translate(q.x,q.y);c.rotate(angle);c.scale(scale,scale);poly([{x:-7,y:-3.8},{x:-7,y:3.8},{x:-.8,y:1.55},{x:-.8,y:-1.55}],'#f6f4e9',col,1);for(let j of [-2,0,2])line({x:-6.5,y:j*1.2},{x:-1,y:j*.35},col,.52);ellipse({x:.5,y:0},2.6,2.6,col,'#fff7e1',.65);c.restore();if(terminal){let mark=e.landing||b,m=p3(mark),fault=['out','net'].includes(e.outcome),cc=fault?'#ffb696':'#e2f4b6';ellipse(m,13,8, fault?'#f3926140':'#c5f18340',cc,2);if(fault){line({x:m.x-6,y:m.y-5},{x:m.x+6,y:m.y+5},cc,2);line({x:m.x-6,y:m.y+5},{x:m.x+6,y:m.y-5},cc,2)}else ellipse(m,3,3,cc);text(e.outcome==='net'?'NET':e.outcome==='out'?'OUT':e.outcome==='guard'?'END':'IN',m.x,cl(m.y-15,17,H-20),cc,13,850)}}


/* replay */
globalThis.createSmashReplay=function(api){
const S=Smash,{W,H,cl,mix,$,text,line,ellipse,kmh,color}=api;
let c;
// Review uses only the original event's geometry; it never generates a new outcome.
let reviewState=null;const reviewThreshold=.12;
function reviewInfo(r){let e=r.events.at(-1);if(e.outcome==='net'){let q=S.ballAt(e.ball,e.duration);return {kind:'net',e,q}}if(!e.landing||!['winner','out'].includes(e.outcome))return null;let q=e.landing,side=e.actor^r.ends,lines=[{axis:'y',value:-2.59,dist:q.y+2.59,label:'单打边线'},{axis:'y',value:2.59,dist:2.59-q.y,label:'单打边线'},{axis:'x',value:side===0?13.4:0,dist:side===0?13.4-q.x:q.x,label:'底线'}];if(e.n===1){let v=side===0?8.68:4.72,sy=(r.scoreBefore[r.server]%2===0?1:-1)*(side===0?1:-1);lines.push({axis:'x',value:v,dist:side===0?q.x-v:v-q.x,label:'短发球线'},{axis:'y',value:0,dist:-sy*q.y,label:'中线'})}else lines.push({axis:'x',value:6.7,dist:side===0?q.x-6.7:6.7-q.x,label:'球网平面'});let line=lines.sort((a,b)=>a.dist-b.dist)[0];return Math.abs(line.dist)<=reviewThreshold?{kind:'line',e,q,line}:null;}
function paintReview(){let {r,info,elapsed}=reviewState,{e,q,kind}=info,windowT=Math.min(e.duration,kind==='net'?.42:.50),begin=e.duration-windowT,move=cl(elapsed/1.75,0,1),t=mix(begin,e.duration,move),b=S.ballAt(e.ball,t),done=move>=1;let g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#152b32');g.addColorStop(1,'#253e39');c.fillStyle=g;c.fillRect(0,0,W,H);text('REPLAY  /  '+(kind==='line'?'LINE CAMERA':'NET CAMERA'),W/2,36,'#eaf1e3',20,800);text('慢动作 · 原始比赛轨迹 · 第 '+r.number+' 分 / 第 '+e.n+' 拍',W/2,60,'#aac2bc',12,600);
if(kind==='line'){let l=info.line,center={x:q.x,y:q.y},sc=208,centerScreen={x:420,y:340},pp=(p)=>({x:centerScreen.x+(p.y-center.y)*sc,y:centerScreen.y-(p.x-center.x)*sc});c.save();c.beginPath();c.rect(50,85,740,495);c.clip();c.fillStyle='#4f7770';c.fillRect(50,85,740,495);let a=pp({x:0,y:-2.59}),z=pp({x:13.4,y:2.59});c.fillStyle='#729584';c.fillRect(a.x,z.y,z.x-a.x,a.y-z.y);let white='#f3f2e4';for(let x of [.02,13.38,4.70,8.70])line(pp({x,y:-2.59}),pp({x,y:2.59}),white,.04*sc);for(let y of [-2.57,2.57])line(pp({x:0,y}),pp({x:13.4,y}),white,.04*sc);for(let [x0,x1] of [[0,4.70],[8.70,13.4]])line(pp({x:x0,y:0}),pp({x:x1,y:0}),white,.04*sc);line(pp({x:6.7,y:-3.05}),pp({x:6.7,y:3.05}),'#dce6d7',3);
for(let j=1;j<=30;j++){let t0=mix(begin,t,(j-1)/30),t1=mix(begin,t,j/30);line(pp(S.ballAt(e.ball,t0)),pp(S.ballAt(e.ball,t1)),color(kmh(e.ball,(t0+t1)/2)),2.5)}let pos=pp(b);if(!done)ellipse(pos,Math.max(4,7+b.z*2),Math.max(4,7+b.z*2),'#f7efc8','#354b3a',1);if(done){let p=pp(q),cc=e.outcome==='out'?'#ffc0a3':'#ecf9b8';ellipse(p,2.3,2.3,'#fff3d6','#172d2a',.7);ellipse(p,16,16,'#ffffff10',cc,2);let edge=pp({...q,[l.axis]:l.value});line(p,edge,cc,2);line({x:edge.x-4,y:edge.y-4},{x:edge.x+4,y:edge.y+4},cc,1.5);text(e.outcome==='out'?'OUT':'IN',p.x,p.y-24,cc,21,900)}c.restore();text((done?(e.outcome==='out'?(e.n===1?'发球违例':'出界'):'界内')+' · 落点中心距'+l.label+'判定边界 '+(Math.abs(l.dist)*100).toFixed(1)+' cm '+(l.dist<0?'外侧':'内侧'):'俯视追踪落点 · 线宽 4 cm'),420,617,'#e6eddd',17,750);text('仅复核引擎记录，不使用球体半径重新裁决',420,639,'#a9beb5',11,500);
}else{let scale=142,base=531,side=e.ball.from.x<6.7?1:-1,pp=p=>({x:420+(p.x-6.7)*side*scale,y:base-(p.z||0)*scale});c.fillStyle='#4d7771';c.fillRect(50,base,740,43);line({x:50,y:base},{x:790,y:base},'#e6eddb',1.5);let top=1.524+.026*cl(Math.abs(q.y)/3.05,0,1),netTop=pp({x:6.7,z:top});c.fillStyle='#a7bcb340';c.fillRect(415,netTop.y,10,base-netTop.y);line({x:420,y:netTop.y},{x:420,y:base},'#b3c9bf',3);line({x:411,y:netTop.y},{x:429,y:netTop.y},'#f4f0df',5);text('球网',458,netTop.y-10,'#e5e9dc',13,700);for(let z=0;z<4;z+=.5){let y=base-z*scale;if(y<90)continue;line({x:63,y},{x:75,y},'#7faaa0',1);text(z.toFixed(1)+'m',43,y+4,'#9eb8b0',10,500)}c.save();c.beginPath();c.rect(55,85,730,490);c.clip();for(let j=1;j<=30;j++){let t0=mix(begin,t,(j-1)/30),t1=mix(begin,t,j/30);line(pp(S.ballAt(e.ball,t0)),pp(S.ballAt(e.ball,t1)),color(kmh(e.ball,(t0+t1)/2)),2.8)}let drop=done?cl((elapsed-1.75)/.7,0,1):0,pos=pp({...b,z:Math.max(0,b.z-4.9*(drop*.7)**2)});ellipse(pos,6,6,'#fff0c8','#54665c',1);if(done){let mark=pp(q);ellipse(mark,13,13,'#e99f7540','#ffbd99',2);line(mark,{x:mark.x+50,y:mark.y-22},'#ffc9a8',1.3);text(Math.abs(q.x-6.7)>.01?'未过网':Math.abs(q.y)>3.05?'网外通过':'触网',mark.x+70,mark.y-24,'#ffc9a8',15,800)}c.restore();text(done?'NET · 终止点高度 '+q.z.toFixed(2)+' m / 网高 '+top.toFixed(2)+' m':'侧面慢动作 · 检查过网高度',420,615,'#f0e5d7',17,750);text('高度来自该拍模拟记录，触网后落下为视觉示意',420,638,'#a9beb5',11,500)}
}
return {reviewInfo,paint(ctx,r,info,elapsed){c=ctx;reviewState={r,info,elapsed};paintReview();reviewState=null;}};
};


/* renderer */
const spatialArena=(()=>{const S=Smash,cl=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
const $=id=>document.getElementById(({trail:'arenaTrail',crowd:'arenaCrowd'})[id]||id);
const shirts=['#e3e5d9','#bd8584'],dark=['#687e83','#79565e'];let camera='low';const mobileQuery=matchMedia('(max-width:740px)');let cv,c,match,visible,active,rest=0,flip=false,mobile=false,W=1280,H=720;
let scene=null,frame=null;
function configure(target){const portrait=mobileQuery.matches;if(cv===target&&scene&&portrait===mobile)return;cv=target;mobile=portrait;W=mobile?680:1280;H=mobile?920:720;frame=null;cv.width=Math.round(W*1.5);cv.height=Math.round(H*1.5);c=cv.getContext('2d');c.setTransform(cv.width/W,0,0,cv.height/H,0,0);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';scene=createSmashVenue({W,H,cl,$,camera,perspective,P,poly,line,ellipse,text,ground});}
// Redraw even when paused or idle, without replacing the canvas or advancing playback.
mobileQuery.addEventListener('change',()=>{if(typeof spatialIdle==='function')spatialIdle()});
const speeds=[[0,[134,201,246]],[25,[134,201,246]],[45,[163,229,176]],[75,[255,225,111]],[110,[255,159,91]],[160,[255,84,91]]];
function kmh(b,t){if((b.model===4||b.model===5)&&S.ballVelocity){const v=S.ballVelocity(b,t);return 3.6*Math.hypot(v.x,v.y,v.z);}let l=Math.max(0,t-.012),r=Math.min(b.T,t+.012);if(r<=l)return 0;let a=S.ballAt(b,l),z=S.ballAt(b,r);return 3.6*Math.hypot(z.x-a.x,z.y-a.y,z.z-a.z)/(r-l)}
function color(k){let i=1;while(i<speeds.length-1&&k>speeds[i][0])i++;let [a,b]=speeds[i-1],[d,e]=speeds[i],u=cl((k-a)/(d-a),0,1);return `rgb(${b.map((v,j)=>Math.round(mix(v,e[j],u))).join(',')})`}
const angles={court:8,flat:10,low:15,broadcast:24,medium:35};
function perspective(){return camera in angles}
// All axes use one perspective matrix; fit the playing area at each elevation.
function rawProject(x,y,z,a){let dx=x-6.7,dz=z-1.25,depth=(mobile?25:22)+dx*Math.cos(a)-dz*Math.sin(a);return {x:y/depth,y:-(dx*Math.sin(a)+dz*Math.cos(a))/depth,s:1/depth};}
function cameraFrame(){const a=angles[camera]*Math.PI/180;let pts=[];for(let x of [-.65,14.05])for(let y of [-3.05,3.05])for(let z of [0,2.9])pts.push(rawProject(x,y,z,a));// Fixed broadcast framing: retain real perspective and reserve airspace over both halves.
for(let x of [1.5,6.7,11.9])for(let y of [-2.59,2.59])pts.push(rawProject(x,y,5.10,a));pts.push(rawProject(6.7,0,5.65,a));const min=Math.min(...pts.map(p=>p.y)),max=Math.max(...pts.map(p=>p.y)),width=2*Math.max(...pts.map(p=>Math.abs(p.x))),focal=Math.min((W-(mobile?24:45))/width,(H-(mobile?67:64))/(max-min),mobile?2200:2000);return {a,focal,cy:H/2-(min+max)*focal/2};}
function P(x,y,z=0){if(flip){x=13.4-x;y=-y;}const f=frame||(frame=cameraFrame()),q=rawProject(x,y,z,f.a);return {x:W/2+q.x*f.focal,y:f.cy+q.y*f.focal,s:q.s*f.focal};}
function setCamera(key){if(!(key in angles)||key===camera)return;camera=key;scene=null;frame=null;if(cv)configure(cv);}

const p3=(p,z=0)=>P(p.x,p.y,z),pt=(x,y,z=0)=>({x,y,z});
function poly(points,fill,stroke,width=1){c.beginPath();points.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
function line(a,b,col,width=1){c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineWidth=width;c.strokeStyle=col;c.lineCap='round';c.stroke()}
function ellipse(q,rx,ry,fill,stroke,width=1){c.beginPath();c.ellipse(q.x,q.y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
function text(t,x,y,col='#dbe9dc',size=12,weight=500){c.textAlign='center';c.font=`${weight} ${size}px system-ui`;c.fillStyle=col;c.fillText(t,x,y)}
function ground(x0,x1,y0,y1,fill,stroke){poly([P(x0,y0),P(x1,y0),P(x1,y1),P(x0,y1)],fill,stroke)}
const venueFor=id=>{if(!scene){scene=createSmashVenue({W,H,cl,$,camera,perspective,P,poly,line,ellipse,text,ground});}return scene.venueFor(id)};let venue=null;
function field(){scene.field(c,cv,venue)}
function net(){scene.net(c)}
function pose(i,p,e,t,ends,nextEvent=null,restMotion=null,prevEvent=null){return SmashSkeleton.pose(i,p,e,t,ends,nextEvent,restMotion,prevEvent,rest,match.players[i].bodyProfile)}
function cameraEye(){let a=(frame||cameraFrame()).a,distance=mobile?25:22,x=6.7-distance*Math.cos(a);return pt(flip?13.4-x:x,0,1.25+distance*Math.sin(a));}
function player(i,p,e,t,ends,nextEvent=null,restMotion=null,prevEvent=null){drawSmashPlayer({p3,perspective,ellipse,shirts,text,dark,pose,P,line,poly,flip,eye:cameraEye},i,p,e,t,ends,nextEvent,restMotion,prevEvent)}
function ballVisual(e,t,terminal,drop=0){drawSmashShuttle({W,H,active,pose,p3,ellipse,kmh,color,$,c,line,poly,text},e,t,terminal,drop)}
const replay=createSmashReplay({W:840,H:660,cl,mix,$,text,line,ellipse,kmh,color});const reviewInfo=replay.reviewInfo;
function draw(e=null,t=0,ends=visible.ends,terminal=false,positions=null,drop=0,restMotion=null){flip=false;field();let near=arenaNear(visible.ids,ends);flip=near!==ends;let p=positions||(e?e.plans.map(plan=>S.pathPos(plan,t)):S.servePositions(visible.server,visible.score,ends));let far=near^1,nxt=!terminal&&e&&active?active.r.events[e.n]:null,prv=!terminal&&e&&active?active.r.events[e.n-2]:null;let poseTime=terminal&&e?t+Math.min(.38,Math.max(0,drop)):t;// The held shuttle in the idle serve pose must not appear through the player's back.
let held=null,heldBehind=false;if(!e){let i=visible.server,a=p[i],body=SmashParts.bodyFor(match.players[i].bodyProfile),sign=(i^ends)===0?1:-1;held=p3({x:a.x+sign*.29,y:a.y+sign*.08*body.hand},cl(1.03*body.scale,.85,1.14));heldBehind=held.s<P(a.x,a.y,cl(1.03*body.scale,.85,1.14)).s;}
const heldDraw=()=>ellipse(held,3.5,3.5,'#f7e9cc');const paint=i=>{if(held&&visible.server===i&&heldBehind)heldDraw();player(i,p[i],e,poseTime,ends,nxt,restMotion,prv);if(held&&visible.server===i&&!heldBehind)heldDraw()};paint(far);net();paint(near);if(e)ballVisual(e,t,terminal,drop);}

let bindKey='';function bind(m,r){let target=$('spatialCourt');if(!target)return false;configure(target);if(!venue||venue.key!==m.event_id)venue=venueFor(m.event_id);let key=m.event_id+'|'+m.a+'|'+m.b;if(bindKey!==key){bindKey=key;match={players:[{name:nm(m.a)},{name:nm(m.b)}]};}const anatomy=r?.bodyProfiles??(r?[]:m.body_profiles??[]);match.players.forEach((p,i)=>p.bodyProfile=anatomy[i]||{});visible={ends:m.ends??0,server:m.server??0,score:m.score,ids:[m.a,m.b]};active=r?{r}:null;if(r)SmashFootwork.prepareRally(r);return true;}
return {setCamera,angle(){return angles[camera]},frameInfo(){return {...(frame||cameraFrame()),W,H}},draw(m,r,e,t,ends,terminal,positions,drop,restMotion=null,restTime=0){if(bind(m,r)){rest=restTime;draw(e,t,ends,terminal,positions,drop,restMotion)}},pose,venueFor,reviewInfo,review(m,r,info,elapsed){if(!bind(m,r))return;
// Fit the full replay frame; never stretch or crop a line/net judgment.
let scale=Math.min(W/840,H/660),x=(W-840*scale)/2,y=(H-660*scale)/2;c.save();c.fillStyle='#152b32';c.fillRect(0,0,W,H);c.translate(x,y);c.scale(scale,scale);try{replay.paint(c,r,info,elapsed)}finally{c.restore()}},kmh,color,project(x,y,z=0){return P(x,y,z)},isFlipped(){return flip}};})();
function spatialDraw(m,e=null,t=0,ends=0,terminal=false,positions=null,netDrop=0,restMotion=null,restTime=0){spatialArena.draw(m,spatialVisual?.r||(e?m.log?.at(-1)?.spatial:null)||null,e,t,ends,terminal,positions,netDrop,restMotion,restTime);}
function spatialKmh(b,t){return spatialArena.kmh(b,t)}function spatialSpeedColor(k){return spatialArena.color(k)}
const spatialClamp=(x,a,b)=>Math.max(a,Math.min(b,x));

