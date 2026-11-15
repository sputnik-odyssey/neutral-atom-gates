import test from 'node:test';
import assert from 'node:assert/strict';
import {idealUnitary,trajectory,responseAt,connectedKernel,kernelIntegral,computeResponses,makeSpectrum,spectrumOverlap,trapezoid} from './frt.mjs';
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} differs from ${b}, tolerance ${tol}`);
const relative=(a,b,tol)=>close(a,b,tol*Math.max(Math.abs(b),1e-12));

test('ideal projected evolution is unitary and implements locally corrected CZ',()=>{
 for(const t of [0,.7,Math.PI,2*Math.PI,3*Math.PI,4*Math.PI]){
  const u=idealUnitary(t);
  for(let a=0;a<8;a++)for(let b=0;b<8;b++){
   let re=0,im=0;for(let k=0;k<8;k++){const x=2*(k*8+a),y=2*(k*8+b);re+=u[x]*u[y]+u[x+1]*u[y+1];im+=u[x]*u[y+1]-u[x+1]*u[y];}
   close(re,+(a===b));close(im,0);
  }
 }
 const end=idealUnitary(4*Math.PI);for(const [i,phase] of [[0,1],[1,-1],[3,-1],[4,-1]])close(end[2*(i*8+i)],phase);
});
test('one-sided PSD normalization and amplitude-square scaling',()=>{
 const grid=Float64Array.from({length:401},(_,i)=>i*.03);
 for(const shape of ['peak','lowpass','white']){
  const s=makeSpectrum(grid,{shape,rms:.023,center:1.5,width:.18});close(trapezoid(grid,s),.023**2,1e-17);
  assert.ok(makeSpectrum(grid,{shape,rms:0}).every(x=>x===0));
 }
 const data=computeResponses(),a=makeSpectrum(grid,{rms:.015,center:0,width:.18}),b=makeSpectrum(grid,{rms:.03,center:0,width:.18}),c=makeSpectrum(grid,{rms:.015,center:10,width:.18});
 const oa=spectrumOverlap(grid,a,data.nu),ob=spectrumOverlap(grid,b,data.nu),oc=spectrumOverlap(grid,c,data.nu);
 close(oa.variance,oc.variance,1e-17);relative(ob.infidelity,4*oa.infidelity,1e-12);assert.ok(oa.infidelity>10*oc.infidelity);
});
test('Eq. (9) Fourier variance equals direct double integral for all input ranges',()=>{
 for(const ensemble of ['haar','symmetric','plus']){
  const data=trajectory(ensemble,16);
  for(const kind of ['frequency','intensity']){
   const kernel=connectedKernel(data,kind,3);
   for(const f of [0,.57,1.5,7.2])close(responseAt(data,kind,3,f),kernelIntegral(kernel,data.count,f,2/3,true,16).integral,1e-12);
   for(let f=0;f<=12;f+=.12)assert.ok(responseAt(data,kind,3,f)>=0);
  }
 }
});
test('frequency-noise units scale with inverse gate-speed squared; intensity response is scale invariant',()=>{
 const data=trajectory();
 for(const f of [0,.8,3]){
  relative(responseAt(data,'frequency',6,2*f),responseAt(data,'frequency',3,f)/4,1e-12);
  relative(responseAt(data,'intensity',6,2*f),responseAt(data,'intensity',3,f),1e-12);
 }
});
test('time and frequency grids converge across supported gate speeds and narrow PSDs',()=>{
 for(const rabi of [1,3,8]){
  const a=computeResponses({rabi,stepsPerPi:96}),b=computeResponses({rabi}),c=computeResponses({rabi,stepsPerPi:384,points:801});
  for(const kind of ['nu','intensity'])for(const center of [0,1.5,9,12]){
   const spec=x=>makeSpectrum(x.frequency,{rms:.02,center,width:.06});
   const value=x=>spectrumOverlap(x.frequency,spec(x),x[kind]).infidelity;
   relative(value(b),value(c),.003);relative(value(a),value(c),.015);
  }
 }
});
// Independent direct evolution of all four computational basis columns.
// A sinusoid sqrt(2)*sigma*cos(2pi*f*t+phase) has variance sigma^2.
function noisyGate(kind,sigma,phase,f=1.5,steps=192){
 const d=4,n=8,code=[0,1,3,4],rabi=3,du=Math.PI/steps;
 let y=new Float64Array(2*n*d);code.forEach((i,j)=>y[2*(i*d+j)]=1);
 const derivative=(state,u,atom)=>{
  const out=new Float64Array(state.length),noise=Math.SQRT2*sigma*Math.cos(f*u/rabi+phase);
  const coupling=.5*(kind==='intensity'?1+noise/2:1);
  const pairs=atom===0?[[3,6],[4,7]]:[[1,2],[4,5]];
  for(const [a,b] of pairs)for(let j=0;j<d;j++){
   const x=2*(a*d+j),z=2*(b*d+j);out[x]+=coupling*state[z+1];out[x+1]-=coupling*state[z];out[z]+=coupling*state[x+1];out[z+1]-=coupling*state[x];
  }
  if(kind==='frequency')for(let i=0;i<n;i++){
   const nr=Number(Math.floor(i/3)===2)+Number(i%3===2),h=-noise*nr/rabi;
   for(let j=0;j<d;j++){const x=2*(i*d+j);out[x]+=h*state[x+1];out[x+1]-=h*state[x];}
  }
  return out;
 };
 let u=0;
 for(const [atom,count] of [[0,steps],[1,2*steps],[0,steps]])for(let k=0;k<count;k++){
  const a=derivative(y,u,atom),b=derivative(y.map((v,i)=>v+du*a[i]/2),u+du/2,atom),c=derivative(y.map((v,i)=>v+du*b[i]/2),u+du/2,atom),e=derivative(y.map((v,i)=>v+du*c[i]),u+du,atom);
  y=y.map((v,i)=>v+du*(a[i]+2*b[i]+2*c[i]+e[i])/6);u+=du;
 }
 // Input-Haar fidelity of overlap A=V_ideal^dagger V_noisy, with leakage retained.
 let square=0,traceR=0,traceI=0;
 code.forEach((i,a)=>{const sign=a===0?1:-1;for(let b=0;b<d;b++){const x=2*(i*d+b);square+=y[x]**2+y[x+1]**2;if(a===b){traceR+=sign*y[x];traceI+=sign*y[x+1];}}});
 return 1-(square+traceR**2+traceI**2)/(d*(d+1));
}
test('single-frequency random-phase full evolution validates PSD factors and intensity coupling',()=>{
 const data=trajectory('haar',192),sigma=.001;
 for(const kind of ['frequency','intensity']){
  let average=0;for(let phase=0;phase<16;phase++)average+=noisyGate(kind,sigma,2*Math.PI*phase/16)/16;
  const predicted=sigma**2*responseAt(data,kind,3,1.5);relative(average,predicted,.001);
 }
});
