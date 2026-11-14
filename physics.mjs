// Pure ideal-model calculations. Complex amplitudes are [real, imaginary].
export const add = (a,b) => [a[0]+b[0],a[1]+b[1]];
export const mul = (a,b) => [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
export const abs2 = a => a[0]**2+a[1]**2;
const s=Math.SQRT1_2;
export const gates={X:[[[0,0],[1,0]],[[1,0],[0,0]]],Y:[[[0,0],[0,-1]],[[0,1],[0,0]]],Z:[[[1,0],[0,0]],[[0,0],[-1,0]]],H:[[[s,0],[s,0]],[[s,0],[-s,0]]]};
export function applyGate(state,name){return gates[name].map(row=>add(mul(row[0],state[0]),mul(row[1],state[1])));}
export function bloch(state){const [a,b]=state;return {x:2*(a[0]*b[0]+a[1]*b[1]),y:2*(a[0]*b[1]-a[1]*b[0]),z:abs2(a)-abs2(b)};}
export function bellState(step){return step===0?[[1,0],[0,0],[0,0],[0,0]]:step===1?[[s,0],[0,0],[s,0],[0,0]]:[[s,0],[0,0],[0,0],[s,0]];}
export function concurrence(v){const ad=mul(v[0],v[3]),bc=mul(v[1],v[2]);return 2*Math.hypot(ad[0]-bc[0],ad[1]-bc[1]);}
export function dephasedBell(eta){if(eta<0||eta>1)throw new RangeError('eta must lie in [0,1]');const rho=Array.from({length:4},()=>Array(4).fill(0));rho[0][0]=rho[3][3]=.5;rho[0][3]=rho[3][0]=eta/2;return {rho,fidelity:(1+eta)/2};}
export function blockade(input,step){const c=input[0]==='1',t=input[1]==='1';let states=[input[0],input[1]],phase='+';if(step===1){states=[c?'r':'0',input[1]];phase=c?'−i':'+';}if(step===2){states=[c?'r':'0',input[1]];phase=c?'−i':t?'−':'+';}if(step===3)phase=c||t?'−':'+';return {states,phase,blocked:c&&t&&step===2,rawSign:c||t?-1:1,czSign:c&&t?-1:1};}
