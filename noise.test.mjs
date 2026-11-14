import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGate, evolveGate, inputDensity } from './noise.mjs';
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
  for (const params of [{ epsilon: .08 }, { dephasing: .35 }, { blockadeRatio: 2.5 }]) assert.ok(simulateGate(params).averageFidelity < .99);
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
  const params = { epsilon: -.12, dephasing: .6, blockadeRatio: 4.2 };
  let firstTerm = 0, secondTerm = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const initialDensity = new Float64Array(162); initialDensity[2 * (9 * indices[i] + indices[j])] = 1;
    const { rho } = evolveGate(params, { initialDensity, record: false });
    if (i === j) firstTerm += indices.reduce((sum, k) => sum + rho[2 * (9 * k + k)], 0);
    secondTerm += signs[i] * signs[j] * rho[2 * (9 * indices[i] + indices[j])];
  }
  near(simulateGate(params).averageFidelity, (firstTerm + secondTerm) / 20);
});
test('arbitrary input density evolves with unit trace', () => {
  const initialDensity = inputDensity([[Math.SQRT1_2, 0], [0, 0], [0, 0], [0, Math.SQRT1_2]]);
  const { rho } = evolveGate({ epsilon: .1, dephasing: .4, blockadeRatio: 5 }, { initialDensity });
  near(Array.from({ length: 9 }, (_, i) => rho[2 * (9 * i + i)]).reduce((a, b) => a + b), 1);
});
