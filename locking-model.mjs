// Deliberately slow, frequency-equivalent servo for teaching. Not SILC firmware.
export const LOCK_ASSUMPTIONS = Object.freeze({ duration: 240, tail: 20, dt: .02, width: 20, amplitude: 1, actuatorTau: .8, initialOffset: 5, vibration: 2, vibrationFrequency: .03, eventAt: 100, restoreAt: 170, hop: 160, referenceJump: 60, signalThreshold: .05, lockedTolerance: 2, dwell: 5 });
export const DEFAULT_LOCK = Object.freeze({ mode: 'silc', gain: 2, integral: .3, delay: .2, drift: .3, range: 100, referenceOffset: 0, polarity: 1, event: 'none' });
export const LOCK_PRESETS = Object.freeze({
  stable: {}, ilc: { mode: 'ilc' }, inverted: { polarity: -1 }, delayed: { gain: 8, delay: 4 }, hop: { event: 'hop' }, blank: { event: 'blank', drift: .7, integral: .5, range: 200 }, shifted: { event: 'reference' }, limited: { range: 20 },
});
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
export function lockParameters(input = {}) {
  const p = { ...DEFAULT_LOCK, ...input };
  for (const [key, min, max] of [['gain', 0, 8], ['integral', 0, .5], ['delay', 0, 5], ['drift', 0, 1], ['range', 10, 200], ['referenceOffset', -80, 80]]) if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) throw new RangeError(`Invalid ${key}`);
  if (!['ilc', 'silc'].includes(p.mode) || !['none', 'hop', 'blank', 'reference'].includes(p.event) || ![1, -1].includes(p.polarity)) throw new RangeError('Invalid servo configuration');
  return p;
}
export function discriminator(relativeMHz, present = true, assumptions = LOCK_ASSUMPTIONS) {
  const q = relativeMHz / assumptions.width, signal = present ? 1 / (1 + q * q) : 0;
  return { signal, error: assumptions.amplitude * q * signal };
}
export function freeFrequency(t, p) {
  const a = LOCK_ASSUMPTIONS;
  return a.initialOffset + p.drift * t + a.vibration * Math.sin(2 * Math.PI * a.vibrationFrequency * t) + (p.event === 'hop' && t >= a.eventAt ? a.hop : 0);
}
export function referenceFrequency(t, p) { return p.referenceOffset + (p.event === 'reference' && t >= LOCK_ASSUMPTIONS.eventAt ? LOCK_ASSUMPTIONS.referenceJump : 0); }
export function referencePresent(t, p) { return !(p.event === 'blank' && t >= LOCK_ASSUMPTIONS.eventAt && t < LOCK_ASSUMPTIONS.restoreAt); }
export function simulateLock(input = {}, { dt = LOCK_ASSUMPTIONS.dt } = {}) {
  const p = lockParameters(input), a = LOCK_ASSUMPTIONS;
  if (!(dt > 0 && dt <= .1)) throw new RangeError('Invalid integration step');
  const n = Math.ceil((a.duration + a.tail) / dt), delaySamples = Math.round(p.delay / dt), points = [];
  let actuator = 0, integral = 0, command = 0, dwell = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * dt, free = freeFrequency(t, p), reference = referenceFrequency(t, p), frequency = free + actuator, relative = frequency - reference, present = referencePresent(t, p);
    const d = discriminator(relative, present), valid = present && d.signal >= a.signalThreshold;
    // Small deterministic readout ripple, not measured SILC noise or a physical PSD.
    const readoutRipple = .0015 * Math.sin(2 * Math.PI * .37 * t) + .0005 * Math.sin(2 * Math.PI * .63 * t);
    const error = d.error + (present ? readoutRipple : 0);
    const delayed = points[Math.max(0, i - delaySamples)] ?? { error, valid };
    let saturated = false;
    if (p.mode === 'ilc') { command = 0; integral = 0; }
    else if (delayed.valid && valid) {
      const equivalent = delayed.error * a.width / a.amplitude, di = p.integral * equivalent * dt;
      let proposed = integral + di, raw = -p.polarity * (p.gain * equivalent + proposed);
      const incrementalCommand = -p.polarity * di;
      // Conditional integration prevents windup while an actuator is clipped.
      if ((raw > p.range && incrementalCommand > 0) || (raw < -p.range && incrementalCommand < 0)) proposed = integral;
      integral = proposed; raw = -p.polarity * (p.gain * equivalent + integral);
      saturated = Math.abs(raw) > p.range; command = clamp(raw, -p.range, p.range);
    }
    // Missing/weak reference: hold the last command and freeze the integrator.
    if (p.mode === 'silc' && valid && Math.abs(relative) < a.lockedTolerance && !saturated && Math.abs(actuator) < .98 * p.range) dwell += dt; else dwell = 0;
    const locked = dwell >= a.dwell;
    const state = p.mode === 'ilc' ? 'open' : !present ? 'missing' : !valid ? 'outside' : saturated || Math.abs(actuator) >= .98 * p.range ? 'saturated' : locked ? 'locked' : Math.abs(relative) < a.lockedTolerance ? 'acquiring' : 'unlocked';
    points.push({ t, free, reference, frequency, relative, error, signal: d.signal, present, valid, command, actuator, integral, locked, state });
    actuator += (1 - Math.exp(-dt / a.actuatorTau)) * (command - actuator);
  }
  return { parameters: p, dt, points, duration: a.duration, end: points.at(-1).t };
}
export function sampleLock(trace, t) {
  if (!(t >= 0 && t <= trace.end)) throw new RangeError('Time is outside computed laser trace');
  const index = Math.min(trace.points.length - 1, Math.floor(t / trace.dt));
  const p = trace.points[index], q = trace.points[Math.min(index + 1, trace.points.length - 1)];
  // Events are step discontinuities. Never smear a hop or a reference interruption.
  const isBoundary = [LOCK_ASSUMPTIONS.eventAt, LOCK_ASSUMPTIONS.restoreAt].some(at => p.t < at && q.t >= at);
  if (isBoundary || q === p) return { ...p, t };
  const fraction = Math.max(0, Math.min(1, (t - p.t) / trace.dt)), sampled = { ...p, t };
  for (const key of ['free', 'reference', 'frequency', 'relative', 'error', 'signal', 'command', 'actuator', 'integral']) sampled[key] = p[key] + fraction * (q[key] - p[key]);
  return sampled;
}
