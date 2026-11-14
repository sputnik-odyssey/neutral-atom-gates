import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGate, evolveGate, inputDensity, amplitudeDamping, freeEvolution, singlePulse } from './noise.mjs';
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
const indices = [0, 1, 3, 4], signs = [1, 1, 1, -1];
test('perfect blockade and calibrated pulses implement CZ without leakage', () => {
  const r = simulateGate(); near(r.averageFidelity, 1); near(r.leakage, 0); near(r.trace, 1);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { near(r.computationalDensity[i][j][0], signs[i] * signs[j] / 4); near(r.computationalDensity[i][j][1], 0); }
});
test('no interaction produces identity after correction: Favg=2/5, Ftest=1/4', () => {
  const r = simulateGate({ blockadeRatio: 0 }); near(r.averageFidelity, .4); near(r.stateFidelity, .25); near(r.leakage, 0);
});
test('increasing blockade converges to ideal CZ', () => {
  assert.ok(simulateGate({ blockadeRatio: 1000 }).averageFidelity > .99999);
});
test('separate error examples lower fidelity', () => {
  for (const params of [{ epsilon: .08 }, { dephasing: .35 }, { blockadeRatio: 2.5 }, { decay: .35 }, { detuning: .12 }]) assert.ok(simulateGate(params).averageFidelity < .99);
});
test('preserves trace and Hermiticity across parameter corners without postselection', () => {
  for (const epsilon of [-.2, .2]) for (const dephasing of [0, 2]) for (const blockadeRatio of [0, 3.7, 40, Infinity]) {
    const r = simulateGate({ epsilon, dephasing, blockadeRatio }); near(r.trace, 1);
    for (let i = 0; i < 9; i++) {
      assert.ok(r.rho[2 * (9 * i + i)] > -1e-12);
      for (let j = 0; j < 9; j++) { near(r.rho[2 * (9 * i + j)], r.rho[2 * (9 * j + i)]); near(r.rho[2 * (9 * i + j) + 1], -r.rho[2 * (9 * j + i) + 1]); }
    }
    assert.ok(r.averageFidelity <= 1 && r.averageFidelity >= 0);
    near(r.leakage, r.trajectory.at(-1).rydberg);
  }
});
test('matches independent fourth-order Runge-Kutta integration of the Lindblad equation', () => {
  // Reference: direct 9x9 complex matrix products, 2000 RK4 steps per pi,
  // without analytic pulse blocks, CP splitting, or the browser implementation.
  const r = simulateGate({ epsilon: .07, dephasing: .4, blockadeRatio: 3.7 });
  near(r.averageFidelity, .8041329933251701, 2e-6);
  near(r.stateFidelity, .7707447069815774, 2e-6);
  near(r.leakage, .062313861300458795, 2e-6);
});
test('128 vs 256 steps per pi converge throughout the displayed parameter domain', () => {
  for (const b of [0, 1.5, 13.7, 40, Infinity]) {
    const params = { epsilon: .2, dephasing: 2, blockadeRatio: b };
    const a = simulateGate(params), c = simulateGate(params, { stepsPerPi: 256 });
    near(a.averageFidelity, c.averageFidelity, 1e-5); near(a.leakage, c.leakage, 1e-5);
  }
});
test('sector shortcut equals explicit propagation of all 16 logical channel operators', () => {
  const params = { epsilon: -.12, dephasing: .6, blockadeRatio: 4.2, decay: .3, detuning: .1 };
  let firstTerm = 0, secondTerm = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const initialDensity = new Float64Array(162); initialDensity[2 * (9 * indices[i] + indices[j])] = 1;
    const { rho } = evolveGate(params, { initialDensity, record: false });
    if (i === j) firstTerm += indices.reduce((sum, k) => sum + rho[2 * (9 * k + k)], 0);
    secondTerm += signs[i] * signs[j] * rho[2 * (9 * indices[i] + indices[j])];
  }
  near(simulateGate(params).averageFidelity, (firstTerm + secondTerm) / 20);
});
test('amplitude damping transfers excited populations and damps coherences at half the population rate', () => {
  const rho = new Float64Array(162);
  for (const i of [1, 2]) for (const j of [1, 2]) rho[2 * (9 * i + j)] = .5;
  amplitudeDamping(rho, .7);
  near(rho[2 * (9 * 2 + 2)], .5 * Math.exp(-.7));
  near(rho[2 * (9 * 1 + 1)], 1 - .5 * Math.exp(-.7));
  near(rho[2 * (9 * 1 + 2)], .5 * Math.exp(-.35));
});
test('independent decay of rr gives binomial two-atom populations', () => {
  const rho = new Float64Array(162); rho[2 * (9 * 8 + 8)] = 1;
  const survival = Math.exp(-.4);
  amplitudeDamping(rho, .4);
  near(rho[2 * (9 * 8 + 8)], survival ** 2);
  near(rho[2 * (9 * 4 + 4)], (1 - survival) ** 2);
  for (const i of [5, 7]) near(rho[2 * (9 * i + i)], survival * (1 - survival));
});
test('free-evolution analytic solution distinguishes decay, pure dephasing and fixed detuning', () => {
  const a = freeEvolution({ decay: .8 }), g = freeEvolution({ dephasing: .8 }), delta = freeEvolution({ detuning: .12 });
  near(a.excited, .5 * Math.exp(-.8)); near(a.coherence, .5 * Math.exp(-.4));
  near(g.excited, .5); near(g.coherence, .5 * Math.exp(-.8));
  near(delta.excited, .5); near(delta.coherence, .5); near(delta.phase, -4 * Math.PI * .12);
  const both = freeEvolution({ decay: .8, dephasing: .3 }); near(both.coherence, .5 * Math.exp(-.7));
});
test('coherent pi-pulse distinguishes area errors from a tilted detuned rotation axis', () => {
  near(singlePulse().population, 1); near(singlePulse({ epsilon: .2 }).maximum, 1);
  near(singlePulse({ epsilon: .2 }).population, Math.sin(.6 * Math.PI) ** 2);
  near(singlePulse({ detuning: 1 }).maximum, .5);
  near(singlePulse({ detuning: 1 }).population, .5 * Math.sin(Math.PI * Math.SQRT2 / 2) ** 2);
});
test('all five errors match an independent RK4 Lindblad reference', () => {
  // Reproduce with python3 reference_lindblad.py --decay 0.3 --detuning 0.11
  const result = simulateGate({ epsilon: .07, dephasing: .4, blockadeRatio: 3.7, decay: .3, detuning: .11 });
  near(result.averageFidelity, .5750093029958036, 2e-6);
  near(result.stateFidelity, .5092053417334077, 2e-6);
  near(result.leakage, .16177485195461272, 2e-6);
});
test('decay and detuning conserve trace, Hermiticity and probabilities at parameter limits', () => {
  for (const blockadeRatio of [0, 3.7, 40, Infinity]) for (const detuning of [-1, 1]) {
    const r = simulateGate({ epsilon: -.2, dephasing: 2, blockadeRatio, decay: 2, detuning });
    near(r.trace, 1);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      near(r.rho[2 * (9 * i + j)], r.rho[2 * (9 * j + i)]);
      near(r.rho[2 * (9 * i + j) + 1], -r.rho[2 * (9 * j + i) + 1]);
    }
    for (const p of r.trajectory) assert.ok(p.rydberg >= -1e-12 && p.rydberg <= 1 + 1e-12);
    const fine = simulateGate({ epsilon: -.2, dephasing: 2, blockadeRatio, decay: 2, detuning }, { stepsPerPi: 256 });
    near(r.averageFidelity, fine.averageFidelity, 1e-5); near(r.leakage, fine.leakage, 1e-5);
  }
});
test('arbitrary input density evolves with unit trace', () => {
  const initialDensity = inputDensity([[Math.SQRT1_2, 0], [0, 0], [0, 0], [0, Math.SQRT1_2]]);
  const { rho } = evolveGate({ epsilon: .1, dephasing: .4, blockadeRatio: 5 }, { initialDensity });
  near(Array.from({ length: 9 }, (_, i) => rho[2 * (9 * i + i)]).reduce((a, b) => a + b), 1);
});
