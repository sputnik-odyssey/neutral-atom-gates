import {gates,add,mul,abs2,concurrence} from './physics.mjs';
export const freshState=()=>[[1,0],[0,0],[0,0],[0,0]];
export function instruction(state,gate){
 if(gate==='CZ')return state.map((a,i)=>a.map(v=>i===3?-v:v));
 const name=gate[0],atom=gate.endsWith('c')?0:1,matrix=gates[name];
 if(!matrix||!['c','t'].includes(gate.at(-1)))throw new RangeError('Unknown instruction');
 const out=state.map(()=>[0,0]),mask=atom===0?2:1;
 for(let i=0;i<4;i++)for(let bit=0;bit<2;bit++){const j=(i&~mask)|(bit?mask:0);out[i]=add(out[i],mul(matrix[(i&mask)?1:0][bit],state[j]));}
 return out;
}
export function fidelity(state,target){let re=0,im=0;for(let i=0;i<4;i++){re+=target[i][0]*state[i][0]+target[i][1]*state[i][1];im+=target[i][0]*state[i][1]-target[i][1]*state[i][0];}return Math.min(1,Math.max(0,re*re+im*im));}
export const ONE_ZERO=[[0,0],[0,0],[1,0],[0,0]],BELL=[[Math.SQRT1_2,0],[0,0],[0,0],[Math.SQRT1_2,0]];
export function probabilities(state){return state.map(abs2);}
export function sample(state,shots=64,random=Math.random){const p=probabilities(state),counts=[0,0,0,0];for(let n=0;n<shots;n++){let x=random(),i=0;while(i<3&&x>=p[i])x-=p[i++];counts[i]++;}return counts;}
export function circuitResult(state,level){return {fidelity:fidelity(state,level===2?BELL:ONE_ZERO),concurrence:concurrence(state),probabilities:probabilities(state)};}
export const CALIBRATION_START=Object.freeze({epsilon:.12,detuning:.10,blockadeRatio:5,dephasing:.12});
export const CALIBRATIONS=Object.freeze({area:{key:'epsilon',value:0,label:'校准脉冲面积',explanation:'令 ε 回到 0，校正旋转角。'},detuning:{key:'detuning',value:0,label:'校准激光频率',explanation:'令固定失谐 δ 回到 0，校正旋转轴。'},blockade:{key:'blockadeRatio',value:40,label:'增强里德堡阻塞',explanation:'令 b 从 5 增至 40，抑制双激发及条件相位偏差。'},dephasing:{key:'dephasing',value:.005,label:'抑制相位噪声',explanation:'将纯退相干强度 g 降至 0.005；这降低新一次实验中的相干损失。'}});
export const BRANCHES=[{id:'zero',label:'全部回到 |0⟩',branch0:1,branch1:0,branchLeak:0},{id:'one',label:'全部回到 |1⟩',branch0:0,branch1:1,branchLeak:0},{id:'leak',label:'全部进入 |ℓ⟩',branch0:0,branch1:0,branchLeak:1}];
