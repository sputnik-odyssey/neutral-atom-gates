import { ATOM, ASSUMPTIONS as A, DEFAULT_COOLING, parameters, magneticField, scatteringRate, simulateMot } from './cooling-model.mjs?v=locking-1';
import { LOCK_ASSUMPTIONS as L, sampleLock } from './locking-model.mjs';

// Integrate each atom through the complete laser frequency trace, including jumps.
export function simulateLockedCapture(trace, entryMs, { atom = DEFAULT_COOLING, dt = 5e-7, save = true } = {}) {
  const p = parameters(atom);
  if (!(entryMs >= 0 && entryMs <= trace.duration) || !(dt > 0 && dt <= 2e-6)) throw new RangeError('Invalid entry time or integration step');
  let z = 0, v = p.initialVelocity, t = 0, stopped = false, reached = false;
  const points = [];
  const laserHz = at => sampleLock(trace, entryMs + at * 1000).frequency * 1e6;
  const detuning = (zz, vv, at) => p.detuning * 1e6 + laserHz(at) + vv / ATOM.wavelength - ATOM.muOverH * magneticField(zz, p.fieldScale);
  const acceleration = (zz, vv, at) => -ATOM.h / (ATOM.wavelength * ATOM.mass) * scatteringRate(detuning(zz, vv, at), A.slowerS);
  const savePoint = () => points.push({ z, v, t, field: magneticField(z, p.fieldScale), detuning: detuning(z, v, t) });
  if (save) savePoint();
  const eventTimes = [L.eventAt, L.restoreAt].filter(at => at > entryMs).map(at => (at - entryMs) / 1000);
  let i = 0;
  while (t < .01 && !stopped && !reached) {
    for (const at of eventTimes) if (Math.abs(t - at) < 1e-11) t = at;
    let h = Math.min(dt, .01 - t);
    for (const at of eventTimes) if (at > t + 1e-12 && at < t + h - 1e-12) h = at - t;
    const a1 = acceleration(z, v, t), v2 = v + h * a1 / 2, a2 = acceleration(z + h * v / 2, v2, t + h / 2), v3 = v + h * a2 / 2, a3 = acceleration(z + h * v2 / 2, v3, t + h / 2), v4 = v + h * a3, a4 = acceleration(z + h * v3, v4, eventTimes.some(at => Math.abs(t + h - at) < 1e-11) ? t + h - 1e-12 : t + h);
    const nextZ = z + h / 6 * (v + 2 * v2 + 2 * v3 + v4), nextV = v + h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
    let fraction = 1;
    if (nextZ >= A.length) { fraction = (A.length - z) / (nextZ - z); reached = true; }
    if (nextV <= 0 && v / (v - nextV) < fraction) { fraction = v / (v - nextV); stopped = true; reached = false; }
    z += fraction * (nextZ - z); v += fraction * (nextV - v); t += fraction * h;
    if (reached) z = A.length; if (stopped) v = 0;
    if (save && (++i % 12 === 0 || reached || stopped)) savePoint();
  }
  const slower = { points, velocity: v, z, duration: t, reached, stopped, accepted: reached && v >= A.minAxial && v <= A.maxAxial };
  const mot = slower.accepted ? simulateMot(v, p, { trace: save, frequencyOffset: tau => laserHz(t + tau), breakpoints: [L.eventAt, L.restoreAt].map(at => (at - entryMs) / 1000 - t) }) : null;
  return { parameters: p, entryMs, exitMs: entryMs + (t + (mot?.t ?? 0)) * 1000, slower, mot, captured: slower.accepted && mot.accepted, origin: 'locking' };
}
export function captureTimeline(trace) {
  return Array.from({ length: 25 }, (_, i) => {
    const entryMs = i * trace.duration / 24, r = simulateLockedCapture(trace, entryMs, { save: false });
    return { entryMs, captured: r.captured, axial: r.slower.accepted, exitMs: r.exitMs, velocity: r.slower.velocity };
  });
}
