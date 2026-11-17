/** Simplified teaching apparatus. Values are level parameters, not instrument specifications. */
export const TASKS=['相机触发','光路对准','真空检查','激光锁定','成像标定','完整实验'];
export const ORDER=['load','prepare','pulse','image'];
export const ORDER_LABEL={load:'装载原子',prepare:'初始化',pulse:'π 脉冲',image:'成像'};
export function freshHardware(){return {items:{cable:false,meter:false},trigger:{from:'',to:'',connected:false},beam:{x:5,y:-4,meter:false},vacuum:{connected:false,seconds:0},laser:{detuning:4.8,polarity:'positive',enabled:false,trace:[]},camera:{exposure:1,threshold:60,background:null,atom:null},sequence:[],pulse:.7,attempts:0,completed:Array(6).fill(false)};}
export function overlap(s){return Math.exp(-(s.beam.x**2+s.beam.y**2)/16);}
export function pressure(s){return 1e-10+(4e-7-1e-10)*Math.exp(-s.vacuum.seconds/30);}
export function survival(s){return Math.exp(-.1*pressure(s)/1e-7);}
export function poissonCDF(k,mean){if(k<0)return 0;let term=Math.exp(-mean),sum=term;for(let n=1;n<=k;n++){term*=mean/n;sum+=term;}return Math.max(0,Math.min(1,sum));}
export function cameraModel(s){const dark=8+2*s.camera.exposure,bright=dark+8*s.camera.exposure*overlap(s),threshold=s.camera.threshold;const falsePositive=1-poissonCDF(threshold-1,dark),falseNegative=poissonCDF(threshold-1,bright);return {dark,bright,falsePositive,falseNegative,error:(falsePositive+falseNegative)/2,saturated:bright>110};}
export function signature(s){return `${s.camera.exposure}:${s.beam.x}:${s.beam.y}`;}
export function laserReady(s){return s.laser.enabled&&s.laser.polarity==='negative'&&s.laser.trace.length>=6&&s.laser.trace.slice(-6).every(x=>Math.abs(x)<.03);}
export function readiness(s){const camera=cameraModel(s),sig=signature(s);return {trigger:s.trigger.connected&&s.trigger.from==='ttl'&&s.trigger.to==='external',alignment:s.items.meter&&s.beam.meter&&overlap(s)>=.97,vacuum:s.vacuum.connected&&pressure(s)<1e-8,laser:laserReady(s),camera:s.camera.background===sig&&s.camera.atom===sig&&!camera.saturated&&camera.error<=.01};}
export function connectTrigger(s){s.trigger.connected=s.items.cable&&s.trigger.from==='ttl'&&s.trigger.to==='external';return s.trigger.connected;}
export function pump(s,seconds=30){if(s.vacuum.connected)s.vacuum.seconds+=seconds;return pressure(s);}
export function servo(s,cycles=10){if(!s.laser.enabled)return [];const out=[];for(let i=0;i<cycles;i++){s.laser.detuning*=s.laser.polarity==='negative'?.4:1.6;s.laser.detuning=Math.max(-12,Math.min(12,s.laser.detuning));out.push(s.laser.detuning);}s.laser.trace.push(...out);s.laser.trace=s.laser.trace.slice(-40);return out;}
export function enableServo(s){s.laser.enabled=Math.abs(s.laser.detuning)<=3;s.laser.trace=[];return s.laser.enabled;}
export function pulseProbability(s){const omega=Math.sqrt(overlap(s)),delta=s.laser.detuning,general=Math.hypot(omega,delta);return omega**2/general**2*Math.sin(Math.PI*s.pulse*general/2)**2;}
export function shotPrediction(s){const ready=readiness(s),order=s.sequence.length===4&&s.sequence.every((x,i)=>x===ORDER[i]),transfer=pulseProbability(s),retention=survival(s),readout=1-cameraModel(s).falseNegative,probability=order&&Object.values(ready).every(Boolean)?transfer*retention*readout:0;return {ready,order,transfer,retention,readout,probability};}
export function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function poisson(mean,random){const limit=Math.exp(-mean);let product=1,k=0;do{k++;product*=Math.max(random(),1e-12);}while(product>limit);return k-1;}
export function referenceCounts(s,atom,shots=64){const m=cameraModel(s),random=rng((atom?781:231)+s.camera.exposure*19+s.beam.x*11+s.beam.y*17);return Array.from({length:shots},()=>Math.min(110,poisson(atom?m.bright:m.dark,random)));}
export function runHardwareShot(s,shots=64){s.attempts++;const prediction=shotPrediction(s),random=rng(9201+s.attempts*31);let successes=0;const results=[];for(let i=0;i<shots;i++){const good=random()<prediction.probability;results.push(good);if(good)successes++;}return {...prediction,shots,successes,results};}
