import test from 'node:test';
import assert from 'node:assert/strict';
import { ATOM, ASSUMPTIONS as A, DEFAULT_COOLING as D, MAX_ACCELERATION, DESIGN_ACCELERATION, DESIGN_OFFSET, parameters, designVelocity, magneticField, effectiveDetuning, scatteringRate, motAcceleration, simulateSlower, simulateMot, simulateCooling, captureMap, sampleTrajectory } from './cooling-model.mjs';
import { PRODUCT_GUIDE } from './cooling-products.mjs';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}, tol=${tol}`);
test('Hz linewidth and angular decay rate give consistent scattering and recoil', () => {
  close(scatteringRate(0, 2), 2 * Math.PI * 32e6 / 3, 1e-7);
  assert.equal(scatteringRate(100e6, 0), 0);
  close(scatteringRate(32e6, 2), scatteringRate(-32e6, 2), 1e-10);
  assert.ok(MAX_ACCELERATION > 9e5 && MAX_ACCELERATION < 1.1e6);
  assert.ok(ATOM.h / ATOM.wavelength / ATOM.mass > .009 && ATOM.h / ATOM.wavelength / ATOM.mass < .011);
});
test('matched reference trajectory solves the constant deceleration design', () => {
  for (const z of [0, .07, .21, .35]) close(effectiveDetuning(z, designVelocity(z), D), DESIGN_OFFSET, 1e-6);
  const r = simulateSlower(); close(r.velocity, 40, .002);
  close(r.duration, (450 - 40) / DESIGN_ACCELERATION, 2e-8);
  close(r.photons * ATOM.h / ATOM.wavelength, ATOM.mass * (450 - 40), 1e-28);
  assert.equal(r.reached, true);
});
test('independent time-domain RK4 agrees with spatial v-squared integration', () => {
  const p = { ...D, initialVelocity: 500, detuning: -700 }, dt = 1e-7;
  // Independent state variables z(t),v(t) and explicit force formula.
  const accel = (z, v) => {
    const field = (A.designDetuning + Math.sqrt(Math.max(1600, 450 ** 2 - 2 * DESIGN_ACCELERATION * z)) / ATOM.wavelength - DESIGN_OFFSET) / ATOM.muOverH;
    const d = -700e6 + v / ATOM.wavelength - ATOM.muOverH * field;
    return -ATOM.h / (ATOM.wavelength * ATOM.mass) * (Math.PI * 32e6) * 2 / (3 + (d / 16e6) ** 2);
  };
  let z = 0, v = 500, lastZ = 0, lastV = v;
  while (z < .35 && v > 0) {
    lastZ = z; lastV = v;
    const a1 = accel(z, v), v2 = v + dt / 2 * a1, a2 = accel(z + dt / 2 * v, v2), v3 = v + dt / 2 * a2, a3 = accel(z + dt / 2 * v2, v3), v4 = v + dt * a3, a4 = accel(z + dt * v3, v4);
    z += dt / 6 * (v + 2 * v2 + 2 * v3 + v4); v += dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
  }
  const interpolated = lastV + (v - lastV) * (.35 - lastZ) / (z - lastZ);
  close(simulateSlower(p).velocity, interpolated, .002);
});
test('a stopped atom is not accepted as a cold beam output', () => {
  const r = simulateCooling({ initialVelocity: 100, detuning: -200, fieldScale: 0 });
  assert.equal(r.slower.stopped, true); assert.ok(r.slower.z < A.length);
  assert.equal(r.slower.accepted, false); assert.equal(r.mot, null); assert.equal(r.captured, false);
});
test('field mismatch, detuning mismatch and excessive axial speed each prevent default reception', () => {
  assert.equal(simulateCooling().captured, true);
  for (const changes of [{ fieldScale: 0 }, { detuning: -400 }, { initialVelocity: 650 }]) {
    const r = simulateCooling(changes); assert.equal(r.captured, false); assert.equal(r.mot, null); assert.ok(r.slower.velocity > A.maxAxial);
  }
});
test('red-detuned MOT damps velocity and restores position with chosen gradient', () => {
  assert.equal(motAcceleration([0, 0, 0, 0])[0], 0);
  assert.ok(motAcceleration([0, 0, 1, 0])[0] < 0);
  assert.ok(motAcceleration([.0001, 0, 0, 0])[0] < 0);
  assert.ok(motAcceleration([.0001, 0, 0, 0], { gradient: -30 })[0] > 0);
  assert.ok(motAcceleration([0, 0, 1, 0], { motDetuning: 32 })[0] > 0);
  const f = motAcceleration([.001, .002, 3, 4]), opposite = motAcceleration([-.001, -.002, -3, -4]);
  close(f[0], -opposite[0], 1e-9); close(f[1], -opposite[1], 1e-9);
});
test('without a magnetic gradient, damping alone can still miss the aperture', () => {
  const r = simulateCooling({ gradient: 0 });
  assert.ok(r.mot.speed < .001); assert.ok(r.mot.radius > A.aperture);
  assert.equal(r.mot.escaped, false); assert.equal(r.mot.accepted, false); assert.equal(r.captured, false);
});
test('wrong MOT signs and transverse speed can leave the cooling region early', () => {
  for (const changes of [{ gradient: -30 }, { motDetuning: 32 }, { transverseVelocity: 30 }]) {
    const r = simulateCooling(changes); assert.equal(r.slower.accepted, true); assert.equal(r.mot.escaped, true);
    assert.ok(r.mot.t < r.mot.duration); assert.equal(r.captured, false);
  }
});
test('MOT residence time is longitudinal transit, not axial trapping', () => {
  close(simulateMot(40).duration, .00125, 1e-12);
  close(simulateMot(80).duration, .000625, 1e-12);
  const zero = motAcceleration([.001, -.001, 0, 0], { gradient: 0 });
  close(zero[0], 0, 1e-10); close(zero[1], 0, 1e-10);
});
test('slower and MOT discretizations converge for matched and failing inputs', () => {
  for (const p of [{}, { initialVelocity: 500, detuning: -700 }]) close(simulateSlower(p, { steps: 1400 }).velocity, simulateSlower(p, { steps: 2800 }).velocity, .01);
  const a = simulateMot(40, {}, { dt: 2e-6 }), b = simulateMot(40, {}, { dt: 1e-6 });
  close(a.radius, b.radius, 1e-8); close(a.speed, b.speed, 1e-5);
});
test('capture map cells reproduce trajectory decisions without claiming thermal weights', () => {
  const map = captureMap(); assert.equal(map.cells.length, 325);
  for (const [initialVelocity, transverseVelocity] of [[450, 0], [450, 30], [650, 0]]) {
    const cell = map.cells.find(c => c.initialVelocity === initialVelocity && c.transverseVelocity === transverseVelocity);
    const r = simulateCooling({ initialVelocity, transverseVelocity });
    assert.equal(cell.status, !r.slower.accepted ? 'axial' : r.mot.accepted ? 'captured' : 'transverse');
  }
  assert.ok(map.cells.some(c => c.status === 'captured')); assert.ok(map.cells.some(c => c.status === 'axial')); assert.ok(map.cells.some(c => c.status === 'transverse'));
});
test('trajectory sampling preserves endpoints; parameter bounds reject nonfinite inputs', () => {
  const r = simulateSlower(); assert.deepEqual(sampleTrajectory(r.points, 0), r.points[0]);
  const end = sampleTrajectory(r.points, 1); close(end.z, A.length, 1e-12); close(end.v, r.velocity, 1e-12);
  for (const p of [{ gradient: NaN }, { detuning: 0 }, { fieldScale: -1 }]) assert.throws(() => parameters(p), RangeError);
});
test('all seventeen user-provided product pages remain distinct and categorized', () => {
  assert.equal(PRODUCT_GUIDE.length, 17); assert.equal(new Set(PRODUCT_GUIDE.map(p => p.url)).size, 17);
  assert.ok(PRODUCT_GUIDE.every(p => p.url.startsWith('https://aosense.com/products/')));
  for (const group of ['source', 'control', 'reference', 'application']) assert.ok(PRODUCT_GUIDE.some(p => p.group === group));
});
