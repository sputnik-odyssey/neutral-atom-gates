import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGate, evolveGate, decayChannel, freeEvolution, branches, DIM, COMPUTATIONAL } from './branching.mjs';
import { simulateGate as closedGate } from './noise.mjs';
const at = (i,j) => 2*(DIM*i+j);
const near = (a,b,tol=1e-10) => assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`);
const settings = { epsilon:.07, dephasing:.4, blockadeRatio:3.7, decay:.3, detuning:.11, branch0:.25, branch1:.5, branchLeak:.25 };
test('branch proportions are probabilities with unit sum', () => {
  assert.deepEqual(branches(),[0,1,0]);
  assert.throws(()=>branches({branch0:.3,branch1:.5,branchLeak:.3}));
  assert.throws(()=>branches({branch0:-.1,branch1:1.1,branchLeak:0}));
});
test('four-level ideal gate and no-interaction limits', () => {
  near(simulateGate().averageFidelity,1);
  near(simulateGate({blockadeRatio:0}).averageFidelity,.4);
});
test('all-return-to-one limit reproduces the previous nine-level calculation', () => {
  for (const p of [{decay:.35},{epsilon:.04,dephasing:.15,blockadeRatio:5,decay:.2,detuning:.06}]) {
    const a=simulateGate(p),b=closedGate(p);
    for(const k of ['averageFidelity','stateFidelity','leakage']) near(a[k],b[k]);
  }
});
test('exact multi-branch decay gives binomial two-atom populations and trace one', () => {
  const rho=new Float64Array(512);rho[at(10,10)]=1;
  const time=.7, survival=Math.exp(-time), p=[.25*(1-survival),.5*(1-survival),survival,.25*(1-survival)];
  decayChannel(rho,time,[.25,.5,.25]);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)near(rho[at(4*i+j,4*i+j)],p[i]*p[j]);
});
test('free decay distributes released population while total coherence decay is branch-independent', () => {
  const p=freeEvolution(settings),q=freeEvolution({...settings,branch0:1,branch1:0,branchLeak:0});
  near(p.excited+p.ground+p.zero+p.loss,1);near(p.coherence,q.coherence);
  const released=.5*(1-Math.exp(-settings.decay));near(p.zero,released*.25);near(p.loss,released*.25);near(p.ground,.5+released*.5);
});
test('return-to-zero gives logical changes without other-state leakage', () => {
  const r=simulateGate({decay:.35,branch0:1,branch1:0,branchLeak:0});
  near(r.branchLeakage,0);assert.ok(r.logicalFlip>.1);
  assert.ok(Math.abs(r.stateFidelity-r.processFidelity)>.01);
});
test('other-state branch gives absorbing leakage, not a logical flip inside the code', () => {
  const r=simulateGate({decay:.35,branch0:0,branch1:0,branchLeak:1});
  assert.ok(r.branchLeakage>.1);near(r.logicalFlip,0);
  const rho=new Float64Array(512);rho[at(15,15)]=1;
  const evolved=evolveGate(settings,{initialDensity:rho,record:false}).rho;near(evolved[at(15,15)],1);
});
test('zero decay makes branching ratios irrelevant', () => {
  const a=simulateGate({decay:0,detuning:.12});
  const b=simulateGate({decay:0,detuning:.12,branch0:.3,branch1:.2,branchLeak:.5});
  near(a.averageFidelity,b.averageFidelity);near(a.leakage,b.leakage);
});
test('fidelity is the Haar average from all sixteen channel input operators', () => {
  let term1=0,term2=0;
  const signs=[1,1,1,-1];
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
    const rho=new Float64Array(512);rho[at(COMPUTATIONAL[i],COMPUTATIONAL[j])]=1;
    const out=evolveGate(settings,{initialDensity:rho,record:false}).rho;
    if(i===j)term1+=COMPUTATIONAL.reduce((s,k)=>s+out[at(k,k)],0);
    term2+=signs[i]*signs[j]*out[at(COMPUTATIONAL[i],COMPUTATIONAL[j])];
  }
  const r=simulateGate(settings);near(r.averageFidelity,(term1+term2)/20);near(r.processFidelity,term2/16);
  assert.ok(Math.abs(r.averageFidelity-(1-r.leakage+4*r.stateFidelity)/5)>.001);
});
test('matches independent RK4 propagation of all sixteen logical operators', () => {
  const r=simulateGate(settings);
  near(r.averageFidelity,.5748912889338926,2e-6);near(r.stateFidelity,.5128397437509382,2e-6);
  near(r.processFidelity,.5055628769148376,2e-6);near(r.leakage,.1477950629898872,2e-6);
  near(r.branchLeakage,.030946082876092313,2e-6);
});
test('leakage partition, trace, Hermiticity and timestep convergence', () => {
  for(const b of [0,3.7,40,Infinity]) {
    const p={...settings,blockadeRatio:b},r=simulateGate(p),fine=simulateGate(p,{stepsPerPi:256,record:false});
    near(r.trace,1);near(r.leakage,r.branchLeakage+r.residualRydberg);
    near(r.averageFidelity,fine.averageFidelity,1e-5);
    for(let i=0;i<DIM;i++)for(let j=0;j<DIM;j++) {
      near(r.rho[at(i,j)],r.rho[at(j,i)]);near(r.rho[at(i,j)+1],-r.rho[at(j,i)+1]);
    }
  }
});
