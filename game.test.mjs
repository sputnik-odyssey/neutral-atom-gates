import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,instruction,probabilities,circuitResult,fidelity,ONE_ZERO,sample,CALIBRATIONS,CALIBRATION_START,BRANCHES}from './game-physics.mjs';
import{STATIONS,floor,pathTo}from'./game-world.mjs';
import{simulateGate}from'./branching.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const circuit=gates=>gates.reduce(instruction,freshState());
test('encoding and phase-interference missions have valid physical solutions',()=>{
 near(fidelity(circuit(['Xc']),ONE_ZERO),1);
 const before=circuit(['Hc']),after=circuit(['Hc','Zc']);assert.deepEqual(probabilities(before),probabilities(after));
 near(fidelity(circuit(['Hc','Zc','Hc']),ONE_ZERO),1);
});
test('compiled native-gate circuit prepares the specified entangled Bell state',()=>{
 const plus=circuitResult(circuit(['Hc','Ht']),2);near(plus.concurrence,0);assert.ok(plus.fidelity<.999);
 const graph=circuitResult(circuit(['Hc','Ht','CZ']),2);near(graph.concurrence,1);assert.ok(graph.fidelity<.999);
 const bell=circuitResult(circuit(['Hc','Ht','CZ','Ht']),2);near(bell.fidelity,1);near(bell.concurrence,1);
});
test('general complex gates preserve norm and target fidelity ignores global phase',()=>{
 const vector=circuit(['Hc','Yt','Zc','Ht','CZ']);near(probabilities(vector).reduce((a,b)=>a+b,0),1);
 const rotated=vector.map(([re,im])=>[re*Math.cos(.7)-im*Math.sin(.7),re*Math.sin(.7)+im*Math.cos(.7)]);near(fidelity(rotated,vector),1);
 assert.throws(()=>instruction(vector,'invalid'));
});
test('Born sampling respects deterministic outcomes and zero probability boundaries',()=>{
 assert.deepEqual(sample(circuit(['Xc']),64,()=>0),[0,0,64,0]);
 assert.deepEqual(sample(circuit(['Hc']),4,()=>.75),[0,0,4,0]);
});
test('calibration and decay objectives can be met with the exposed actions',()=>{
 const p={...CALIBRATION_START};assert.ok(simulateGate(p,{record:false}).averageFidelity<.995);
 for(const c of Object.values(CALIBRATIONS))p[c.key]=c.value;
 assert.ok(simulateGate(p,{record:false}).averageFidelity>=.995);
 for(const branch of BRANCHES){const before=simulateGate({decay:.35,...branch},{record:false}),after=simulateGate({decay:.04,...branch},{record:false});assert.ok(before.averageFidelity<.98);assert.ok(after.averageFidelity>=.98);}
});
test('all six consoles are reachable without crossing a wall or the console',()=>{
 const start={x:8,y:4};for(const station of STATIONS){const end={x:station.x,y:station.y+1},path=pathTo(start,end);assert.ok(path);let previous=start;for(const p of path){assert.ok(floor(p.x,p.y));assert.equal(Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y),1);previous=p;}assert.deepEqual(previous,end);}
 assert.equal(pathTo(start,{x:0,y:0}),null);assert.equal(floor(-1,2),false);
});
