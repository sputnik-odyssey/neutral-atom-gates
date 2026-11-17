import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCK, LOCK_PRESETS, discriminator, lockParameters, simulateLock, sampleLock } from './locking-model.mjs';
import { simulateLockedCapture, captureTimeline } from './locking-capture.mjs';
import { simulateCooling, simulateMot } from './cooling-model.mjs';
const close = (a, b, tolerance) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const rms = array => Math.sqrt(array.reduce((sum, v) => sum + v * v, 0) / array.length);

test('discriminator has signed slope, nonunique small errors and zero signal without a reference', () => {
  close(discriminator(.001).error / .001, .05, 1e-8);
  close(discriminator(5).error, -discriminator(-5).error, 1e-12);
  assert.ok(discriminator(200).error < discriminator(20).error);
  assert.deepEqual(discriminator(80, false), { signal: 0, error: 0 });
});
test('ILC mode leaves the external optical-frequency loop open', () => {
  const t = simulateLock({ mode: 'ilc' });
  for (const point of t.points) { assert.equal(point.actuator, 0); assert.equal(point.command, 0); assert.equal(point.frequency, point.free); assert.equal(point.locked, false); }
});
test('negative feedback suppresses frequency drift and reaches its declared dwell condition', () => {
  const closed = simulateLock(), open = simulateLock({ mode: 'ilc' });
  const after = t => t.points.filter(q => q.t > 80 && q.t < 240).map(q => q.relative);
  assert.ok(rms(after(closed)) < rms(after(open)) / 20);
  assert.equal(sampleLock(closed, 200).state, 'locked');
  assert.equal(simulateLockedCapture(closed, 200).captured, true);
});
test('reversing loop polarity increases the error rather than correcting it', () => {
  const wrong = sampleLock(simulateLock({ polarity: -1 }), 80), open = sampleLock(simulateLock({ mode: 'ilc' }), 80);
  assert.ok(wrong.frequency > open.frequency + 20); assert.equal(wrong.locked, false);
});
test('large gain with a long delay produces sign reversals and leaves the valid region', () => {
  const t = simulateLock(LOCK_PRESETS.delayed);
  const early = t.points.filter(q => q.t < 30).map(q => q.relative);
  assert.ok(Math.max(...early) > 50); assert.ok(Math.min(...early) < -10);
  assert.equal(sampleLock(t, 80).locked, false);
});
test('actuator clipping and conditional integration keep the correction bounded', () => {
  const t = simulateLock({ range: 20 });
  assert.ok(t.points.every(q => Math.abs(q.actuator) <= 20 + 1e-10 && Math.abs(q.command) <= 20));
  close(sampleLock(t, 100).integral, sampleLock(t, 240).integral, 1e-10);
  assert.equal(sampleLock(t, 200).state, 'saturated');
  assert.equal(simulateLockedCapture(t, 210).captured, false);
});
test('reference interruption can show zero error while the laser drifts and capture fails', () => {
  const t = simulateLock(LOCK_PRESETS.blank), before = sampleLock(t, 110), during = sampleLock(t, 165);
  assert.equal(during.error, 0); assert.equal(during.signal, 0); assert.equal(during.locked, false);
  assert.equal(during.state, 'missing'); close(before.command, during.command, 1e-10);
  close(before.integral, during.integral, 1e-10); assert.ok(during.frequency > before.frequency + 30);
  assert.equal(simulateLockedCapture(t, 165).captured, false);
  assert.equal(simulateLockedCapture(t, 220).captured, true);
});
test('locking to a shifted reference does not ensure the correct atomic detuning', () => {
  const t = simulateLock(LOCK_PRESETS.shifted), q = sampleLock(t, 200);
  assert.equal(q.locked, true); assert.ok(Math.abs(q.relative) < 2); assert.ok(q.frequency > 50);
  assert.equal(simulateLockedCapture(t, 200).captured, false);
});
test('frequency jumps are not linearly smeared across the event boundary', () => {
  const t = simulateLock(LOCK_PRESETS.hop), before = sampleLock(t, 100 - 1e-7), after = sampleLock(t, 100);
  assert.ok(after.frequency - before.frequency > 159);
  assert.equal(simulateLockedCapture(t, 80).captured, true);
  assert.equal(simulateLockedCapture(t, 130).captured, false);
});
test('atom propagation reads a jump during flight, not just its entry-time detuning', () => {
  const t = simulateLock(LOCK_PRESETS.hop), q = sampleLock(t, 99);
  const frozen = simulateCooling({ detuning: -650 + q.frequency, motDetuning: -32 + q.frequency });
  assert.equal(frozen.captured, true); assert.equal(simulateLockedCapture(t, 99).captured, false);
});
test('zero laser offset recovers the independent fixed-detuning cooling result', () => {
  const t = simulateLock(); t.points = t.points.map(q => ({ ...q, frequency: 0 }));
  const dynamic = simulateLockedCapture(t, 200), fixed = simulateCooling();
  close(dynamic.slower.velocity, fixed.slower.velocity, .002);
  close(dynamic.slower.duration, fixed.slower.duration, 2e-8);
  close(dynamic.mot.radius, fixed.mot.radius, 2e-8);
  assert.equal(dynamic.captured, fixed.captured);
});
test('dynamic MOT offset reaches the same physical force as an equivalent static detuning', () => {
  const a = simulateMot(40, {}, { frequencyOffset: () => 64e6 }), b = simulateMot(40, { motDetuning: 32 });
  close(a.radius, b.radius, 1e-10); close(a.speed, b.speed, 1e-10); assert.equal(a.escaped, true);
});
test('servo and atomic integration converge after reducing their numerical steps', () => {
  for (const p of [{}, LOCK_PRESETS.delayed]) {
    const a = simulateLock(p), b = simulateLock(p, { dt: .01 });
    close(sampleLock(a, 200).frequency, sampleLock(b, 200).frequency, .03);
  }
  const t = simulateLock(LOCK_PRESETS.hop);
  for (const at of [99, 99.5, 130]) close(simulateLockedCapture(t, at).slower.velocity, simulateLockedCapture(t, at, { dt: 2.5e-7 }).slower.velocity, .002);
});
test('entry-time scan preserves deterministic trajectories and includes the last entry', () => {
  const t = simulateLock(LOCK_PRESETS.hop), samples = captureTimeline(t);
  assert.equal(samples.length, 25); assert.equal(samples.at(-1).entryMs, 240);
  for (const sample of [samples[0], samples[10], samples.at(-1)]) assert.equal(sample.captured, simulateLockedCapture(t, sample.entryMs).captured);
  assert.ok(samples.some(q => q.captured) && samples.some(q => !q.captured));
});
test('bounded control settings give finite traces, with invalid inputs rejected', () => {
  const t = simulateLock({ gain: 8, integral: .5, delay: 5, range: 200, drift: 1, referenceOffset: -80 });
  assert.ok(t.points.every(q => ['frequency', 'error', 'actuator', 'integral'].every(key => Number.isFinite(q[key]))));
  assert.throws(() => lockParameters({ gain: NaN }), RangeError);
  assert.throws(() => sampleLock(t, 1000), RangeError);
  assert.throws(() => simulateLockedCapture(t, -1), RangeError);
  assert.equal(DEFAULT_LOCK.mode, 'silc');
});
