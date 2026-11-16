/** Near-time-optimal sinusoidal phase CZ in the ideal B=infinity model.
 * Ansatz: Evered et al., Nature 622, 268 (2023), Methods Eq. (1).
 * Parameters below are recalibrated in this ideal model, NOT experimental fit values.
 * Units u=Omega*t. Fixed amplitude on BOTH atoms; no rise/fall or light shift.
 */
export const PHASE_GATE=Object.freeze({A:.7049699991530635,omegaOverOmega:1.0428277312172531,phi0:-.727319497510921,durationU:7.642814558109514});
export const phaseAt=u=>PHASE_GATE.A*Math.cos(PHASE_GATE.omegaOverOmega*u-PHASE_GATE.phi0);
function identity2(){return new Float64Array([1,0,0,0,0,0,1,0]);}
function derivative(y,u,g){
 const out=new Float64Array(8),p=phaseAt(u),c=Math.cos(p)*g,s=Math.sin(p)*g;
 for(let j=0;j<2;j++){
  const a=2*j,b=4+2*j,ar=y[a],ai=y[a+1],br=y[b],bi=y[b+1];
  out[a]=c*bi-s*br;out[a+1]=-c*br-s*bi;out[b]=c*ai+s*ar;out[b+1]=-c*ar+s*ai;
 }
 return out;
}
function advance(y,u,h,g){
 const a=derivative(y,u,g),b=derivative(y.map((v,i)=>v+h*a[i]/2),u+h/2,g),c=derivative(y.map((v,i)=>v+h*b[i]/2),u+h/2,g),d=derivative(y.map((v,i)=>v+h*c[i]),u+h,g);
 return y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
function embed(single,bright){
 const out=new Float64Array(128),put=(i,j,re,im=0)=>{out[2*(i*8+j)]=re;out[2*(i*8+j)+1]=im;};put(0,0,1);
 for(const [a,b] of [[1,2],[3,6]])for(let i=0;i<2;i++)for(let j=0;j<2;j++)put([a,b][i],[a,b][j],single[2*(i*2+j)],single[2*(i*2+j)+1]);
 put(4,4,bright[0],bright[1]);
 for(const i of [5,7]){put(4,i,bright[2]*Math.SQRT1_2,bright[3]*Math.SQRT1_2);put(i,4,bright[4]*Math.SQRT1_2,bright[5]*Math.SQRT1_2);}
 for(const i of [5,7])for(const j of [5,7])put(i,j,(bright[6]+(i===j?1:-1))/2,bright[7]/2);
 return out;
}
export function phaseUnitaryGrid(count=768){
 let single=identity2(),bright=identity2();const half=PHASE_GATE.durationU/(2*count),midpoints=[];
 for(let k=0;k<2*count;k++){
  single=advance(single,k*half,half,.5);bright=advance(bright,k*half,half,Math.SQRT1_2);
  if(k%2===0)midpoints.push(embed(single,bright));
 }
 return {midpoints,end:embed(single,bright)};
}
export function gateDiagnostics(u){
 const arg=i=>Math.atan2(u[2*(i*8+i)+1],u[2*(i*8+i)]),phase=arg(4)-arg(1)-arg(3),conditionalPhase=Math.atan2(Math.sin(phase),Math.cos(phase));
 const correction=arg(1);let traceR=0,traceI=0,population=0;
 for(const i of [0,1,3,4]){
  const v=2*(i*8+i),theta=(i===0?0:i===4?-2*correction+Math.PI:-correction),c=Math.cos(theta),s=Math.sin(theta);
  traceR+=c*u[v]-s*u[v+1];traceI+=s*u[v]+c*u[v+1];population+=u[v]**2+u[v+1]**2;
 }
 return {singlePhase:correction,conditionalPhase,phaseError:Math.abs(Math.atan2(Math.sin(conditionalPhase-Math.PI),Math.cos(conditionalPhase-Math.PI))),averageLeakage:Math.max(0,1-population/4),baselineInfidelity:Math.max(0,1-(population+traceR**2+traceI**2)/20)};
}
