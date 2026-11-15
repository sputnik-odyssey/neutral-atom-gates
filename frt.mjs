/** Fidelity response theory for a sequential pi-2pi-pi CZ gate, ideal infinite blockade.
 * Eight states: 00,01,0r,10,11,1r,r0,r1 (rr projected out).
 * Physical time: microseconds; f and Omega/(2pi): MHz; one-sided PSD on [0,fmax].
 * Frequency noise h_nu is in MHz, O_nu=-2pi(n_r,c+n_r,t).
 * Relative intensity noise h_I=delta I/I, O_I=H_drive/(2 hbar).
 * Responses follow Eq. (9), with exact input-Haar averaging as in Eq. (G13).
 */
const N = 8, TOTAL_U = 4 * Math.PI, CODE = [0, 1, 3, 4];
const pairs = atom => atom === 0 ? [[3,6],[4,7]] : [[1,2],[4,5]];
const ix = (i,j,cols=N) => 2*(i*cols+j);
const countR = i => Number(Math.floor(i/3)===2)+Number(i%3===2);
function basisFor(ensemble) {
  const columns = ensemble === 'symmetric' ? [[0,1], [1,Math.SQRT1_2,3,Math.SQRT1_2], [4,1]]
    : ensemble === 'plus' ? [[0,.5,1,.5,3,.5,4,.5]]
    : ensemble === 'haar' ? CODE.map(i=>[i,1]) : null;
  if (!columns) throw new RangeError('Unknown input ensemble');
  const d = columns.length, basis = new Float64Array(N*d);
  columns.forEach((column,j)=>{ for(let k=0;k<column.length;k+=2) basis[column[k]*d+j]=column[k+1]; });
  return { basis, d };
}
function identity() { const u = new Float64Array(2*N*N); for(let i=0;i<N;i++)u[ix(i,i)]=1; return u; }
function rotate(u, atom, angle) {
  const c=Math.cos(angle/2),s=Math.sin(angle/2);
  for(const [a,b] of pairs(atom))for(let j=0;j<N;j++) {
    const x=ix(a,j),y=ix(b,j),ar=u[x],ai=u[x+1],br=u[y],bi=u[y+1];
    u[x]=c*ar+s*bi;u[x+1]=c*ai-s*br;u[y]=c*br+s*ai;u[y+1]=c*bi-s*ar;
  }
}
export function idealUnitary(uTime) {
  const u=identity();let remaining=Math.max(0,Math.min(TOTAL_U,uTime));
  for(const [atom,length] of [[0,Math.PI],[1,2*Math.PI],[0,Math.PI]]) {
    const angle=Math.min(length,remaining);if(angle>0)rotate(u,atom,angle);remaining-=angle;
  }
  return u;
}
function restrict(w,basis,d) {
  const out=new Float64Array(2*d*d);
  for(let a=0;a<d;a++)for(let b=0;b<d;b++)for(let i=0;i<N;i++) {
    out[ix(a,b,d)]+=basis[i*d+a]*w[ix(i,b,d)];
    out[ix(a,b,d)+1]+=basis[i*d+a]*w[ix(i,b,d)+1];
  }
  return out;
}
function heisenbergColumns(u,atom,kind,basis,d) {
  const evolved=new Float64Array(2*N*d),operated=new Float64Array(2*N*d),out=new Float64Array(2*N*d);
  for(let i=0;i<N;i++)for(let a=0;a<d;a++)for(let k=0;k<N;k++) {
    evolved[ix(i,a,d)]+=u[ix(i,k)]*basis[k*d+a];evolved[ix(i,a,d)+1]+=u[ix(i,k)+1]*basis[k*d+a];
  }
  if(kind==='frequency') {
    for(let i=0;i<N;i++)for(let a=0;a<d;a++) {
      const k=ix(i,a,d),factor=-2*Math.PI*countR(i);operated[k]=factor*evolved[k];operated[k+1]=factor*evolved[k+1];
    }
  } else {
    // Dimensionless O_I/Omega = (|1><r|+h.c.)/4 for the addressed atom.
    for(const [i,j] of pairs(atom))for(let a=0;a<d;a++)for(let z=0;z<2;z++) {
      operated[ix(i,a,d)+z]=evolved[ix(j,a,d)+z]/4;operated[ix(j,a,d)+z]=evolved[ix(i,a,d)+z]/4;
    }
  }
  for(let i=0;i<N;i++)for(let a=0;a<d;a++)for(let k=0;k<N;k++) {
    const ur=u[ix(k,i)],ui=u[ix(k,i)+1],wr=operated[ix(k,a,d)],wi=operated[ix(k,a,d)+1];
    out[ix(i,a,d)]+=ur*wr+ui*wi;out[ix(i,a,d)+1]+=ur*wi-ui*wr;
  }
  return out;
}
export function trajectory(ensemble='haar',stepsPerPi=192) {
  if(!Number.isInteger(stepsPerPi)||stepsPerPi<4)throw new RangeError('Invalid time grid');
  const {basis,d}=basisFor(ensemble),count=4*stepsPerPi,du=TOTAL_U/count;
  const frequency=[],intensity=[],times=[];
  for(let k=0;k<count;k++) {
    const time=(k+.5)*du,atom=k<stepsPerPi||k>=3*stepsPerPi?0:1,u=idealUnitary(time);
    times.push(time);frequency.push(heisenbergColumns(u,atom,'frequency',basis,d));intensity.push(heisenbergColumns(u,atom,'intensity',basis,d));
  }
  return {basis,d,count,du,times,frequency,intensity,ensemble};
}
export function responseAt(data,kind,rabi,frequency) {
  const {basis,d,du,count}=data;
  const c=new Float64Array(2*N*d),s=new Float64Array(2*N*d);
  const scale=kind==='frequency'?1/(2*Math.PI*rabi):1;
  for(let k=0;k<count;k++) {
    const phase=frequency*data.times[k]/rabi,co=Math.cos(phase)*du*scale,si=Math.sin(phase)*du*scale,w=data[kind][k];
    for(let j=0;j<w.length;j++){c[j]+=co*w[j];s[j]+=si*w[j];}
  }
  let all=0;for(let j=0;j<c.length;j++)all+=c[j]**2+s[j]**2;
  const mc=restrict(c,basis,d),ms=restrict(s,basis,d);let code=0,tc=0,ts=0;
  for(let j=0;j<mc.length;j++)code+=mc[j]**2+ms[j]**2;
  for(let a=0;a<d;a++){tc+=mc[ix(a,a,d)];ts+=ms[ix(a,a,d)];}
  return Math.max(0,all/d-(code+tc*tc+ts*ts)/(d*(d+1)));
}
export function connectedKernel(data,kind,rabi) {
  const {basis,d,count}=data,w=data[kind],m=w.map(x=>restrict(x,basis,d));
  const traces=m.map(x=>{let t=0;for(let i=0;i<d;i++)t+=x[ix(i,i,d)];return t;});
  const kernel=new Float64Array(count*count);
  // K=T^2 Re <O_H(t)O_H(tau)>_c. Intensity operator carries one Omega factor.
  const duration=2/rabi,scale=kind==='frequency'?duration**2:TOTAL_U**2;
  for(let i=0;i<count;i++)for(let j=0;j<=i;j++) {
    let dot=0,restricted=0;
    for(let a=0;a<w[i].length;a++)dot+=w[i][a]*w[j][a];
    for(let a=0;a<m[i].length;a++)restricted+=m[i][a]*m[j][a];
    const value=scale*(dot/d-(restricted+traces[i]*traces[j])/(d*(d+1)));
    kernel[i*count+j]=kernel[j*count+i]=value;
  }
  return kernel;
}
export function computeResponses({rabi=3,ensemble='haar',points=401,maxFrequency=12,stepsPerPi=192}={}) {
  if(!(rabi>0)||!Number.isFinite(rabi)||points<2||!(maxFrequency>0))throw new RangeError('Invalid frequency grid');
  const data=trajectory(ensemble,stepsPerPi),frequency=new Float64Array(points),nu=new Float64Array(points),intensity=new Float64Array(points);
  for(let k=0;k<points;k++) {
    const f=maxFrequency*k/(points-1);frequency[k]=f;nu[k]=responseAt(data,'frequency',rabi,f);intensity[k]=responseAt(data,'intensity',rabi,f);
  }
  return {frequency,nu,intensity,rabi,ensemble,duration:2/rabi,timeCount:data.count,
    nuKernel:connectedKernel(data,'frequency',rabi),intensityKernel:connectedKernel(data,'intensity',rabi)};
}
export function trapezoid(x,y) {
  if(x.length!==y.length||x.length<2)throw new RangeError('Mismatched integration grid');
  let value=0;for(let i=1;i<x.length;i++)value+=(x[i]-x[i-1])*(y[i]+y[i-1])/2;return value;
}
export function makeSpectrum(grid,{rms=0,shape='peak',center=1,width=.18}={}) {
  if(!Number.isFinite(rms)||rms<0||!Number.isFinite(center)||!(width>0))throw new RangeError('Invalid spectrum');
  const profile=Float64Array.from(grid,f=>{
    if(shape==='peak')return Math.exp(-.5*((f-center)/width)**2);
    if(shape==='lowpass')return 1/(1+(f/width)**2);
    if(shape==='white')return 1;
    throw new RangeError('Unknown PSD shape');
  });
  const area=trapezoid(grid,profile);if(!(area>0))throw new RangeError('PSD outside integration band');
  return Float64Array.from(profile,x=>x*rms*rms/area);
}
export function spectrumOverlap(grid,spectrum,response) {
  if(grid.length!==spectrum.length||grid.length!==response.length)throw new RangeError('Mismatched PSD grid');
  const product=Float64Array.from(spectrum,(s,i)=>s*response[i]);
  return {product,variance:trapezoid(grid,spectrum),infidelity:trapezoid(grid,product)};
}
export function kernelIntegral(kernel,count,frequency,duration,weighted=true,cells=48) {
  if(kernel.length!==count*count||count%cells)throw new RangeError('Invalid kernel grid');
  const block=count/cells,heatmap=new Float64Array(cells*cells),cosine=Float64Array.from({length:count},(_,i)=>Math.cos(2*Math.PI*frequency*duration*i/count));
  let sum=0;
  for(let i=0;i<count;i++)for(let j=0;j<count;j++) {
    const v=kernel[i*count+j]*(weighted?cosine[Math.abs(i-j)]:1);
    sum+=v;heatmap[Math.floor(i/block)*cells+Math.floor(j/block)]+=v/(block*block);
  }
  return {integral:sum/(count*count),heatmap,cells};
}
