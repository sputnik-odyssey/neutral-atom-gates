// Semi-classical teaching model, not an AOSense device model or fitted field map.
// Detunings use Hz; Gamma is a decay rate in s^-1, gamma = Gamma/(2*pi).
export const ATOM = Object.freeze({ wavelength: 461e-9, gamma: 32e6, mass: 87.9056 * 1.66053906660e-27, h: 6.62607015e-34, muOverH: 13.99624555e9 });
export const ASSUMPTIONS = Object.freeze({ length: .35, designIn: 450, designOut: 40, designDetuning: -650e6, slowerS: 2, motLength: .05, motRadius: .008, aperture: .002, motS: .6, x0: .0035, y0: 0, velocityAngle: Math.PI / 6, maxTransverse: 1.5, minAxial: 10, maxAxial: 80 });
export const DEFAULT_COOLING = Object.freeze({ detuning: -650, fieldScale: 1, initialVelocity: 450, motDetuning: -32, gradient: 30, transverseVelocity: 8 });
export const LIMITS = Object.freeze({ detuning: [-1000, -200], fieldScale: [0, 1.5], initialVelocity: [100, 700], motDetuning: [-96, 48], gradient: [-60, 60], transverseVelocity: [0, 30] });
export const MAX_ACCELERATION = ATOM.h / ATOM.wavelength / ATOM.mass * (2 * Math.PI * ATOM.gamma) / 2;
export const DESIGN_ACCELERATION = (ASSUMPTIONS.designIn ** 2 - ASSUMPTIONS.designOut ** 2) / (2 * ASSUMPTIONS.length);
export const DESIGN_FRACTION = DESIGN_ACCELERATION / MAX_ACCELERATION;
export const DESIGN_OFFSET = -ATOM.gamma / 2 * Math.sqrt(ASSUMPTIONS.slowerS / DESIGN_FRACTION - 1 - ASSUMPTIONS.slowerS);

export function parameters(input = {}) {
  const p = { ...DEFAULT_COOLING, ...input };
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) throw new RangeError(`Invalid ${key}`);
  return p;
}
export function designVelocity(z) { return Math.sqrt(Math.max(ASSUMPTIONS.designOut ** 2, ASSUMPTIONS.designIn ** 2 - 2 * DESIGN_ACCELERATION * z)); }
export function magneticField(z, scale = 1) {
  // A signed effective field for one sigma component; not the vendor's magnet geometry.
  return scale * (ASSUMPTIONS.designDetuning + designVelocity(z) / ATOM.wavelength - DESIGN_OFFSET) / ATOM.muOverH;
}
export function effectiveDetuning(z, velocity, p) {
  return p.detuning * 1e6 + velocity / ATOM.wavelength - ATOM.muOverH * magneticField(z, p.fieldScale);
}
export function scatteringRate(detuningHz, saturation) {
  return Math.PI * ATOM.gamma * saturation / (1 + saturation + (2 * detuningHz / ATOM.gamma) ** 2);
}
export function slowerAcceleration(z, velocity, p) {
  return -ATOM.h / (ATOM.wavelength * ATOM.mass) * scatteringRate(effectiveDetuning(z, velocity, p), ASSUMPTIONS.slowerS);
}
export function simulateSlower(input = {}, { steps = 1400, trace = true } = {}) {
  const p = parameters(input), dz = ASSUMPTIONS.length / steps;
  let w = p.initialVelocity ** 2, z = 0, t = 0, stopped = false;
  const points = [];
  const save = () => points.push({ z, v: Math.sqrt(Math.max(0, w)), t, field: magneticField(z, p.fieldScale), detuning: effectiveDetuning(z, Math.sqrt(Math.max(0, w)), p) });
  if (trace) save();
  const derivative = (zz, ww) => 2 * slowerAcceleration(zz, Math.sqrt(Math.max(0, ww)), p);
  for (let i = 0; i < steps; i++) {
    const oldV = Math.sqrt(w), k1 = derivative(z, w), k2 = derivative(z + dz / 2, w + dz * k1 / 2), k3 = derivative(z + dz / 2, w + dz * k2 / 2), k4 = derivative(z + dz, w + dz * k3);
    const nextW = w + dz / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    if (nextW <= 0) {
      const fraction = w / (w - nextW); z += dz * fraction; t += 2 * dz * fraction / oldV; w = 0; stopped = true; if (trace) save(); break;
    }
    w = nextW; z = (i + 1) * dz; t += 2 * dz / (oldV + Math.sqrt(w));
    if (trace && (i % 5 === 4 || i === steps - 1)) save();
  }
  const velocity = Math.sqrt(w), reached = !stopped;
  return { points, velocity, duration: t, z, reached, stopped, accepted: reached && velocity >= ASSUMPTIONS.minAxial && velocity <= ASSUMPTIONS.maxAxial, photons: (p.initialVelocity - velocity) * ATOM.mass * ATOM.wavelength / ATOM.h };
}
export function motAcceleration(state, input = {}) {
  const p = parameters(input), [x, y, vx, vy] = state;
  // 1 G/cm = .01 T/m. The polarizations are chosen for restoring forces at b>0.
  const b = p.gradient * .01, shiftX = vx / ATOM.wavelength + ATOM.muOverH * b * x, shiftY = vy / ATOM.wavelength + ATOM.muOverH * b * y;
  const delta = p.motDetuning * 1e6, s = ASSUMPTIONS.motS * Math.exp(-2 * (x * x + y * y) / ASSUMPTIONS.motRadius ** 2);
  const q = [delta - shiftX, delta + shiftX, delta - shiftY, delta + shiftY].map(d => s / (1 + (2 * d / ATOM.gamma) ** 2));
  const denominator = 1 + q.reduce((a, c) => a + c, 0), coefficient = MAX_ACCELERATION / denominator;
  return [coefficient * (q[0] - q[1]), coefficient * (q[2] - q[3])];
}
export function simulateMot(axialVelocity, input = {}, { dt = 2e-6, trace = true } = {}) {
  const p = parameters(input);
  if (!(axialVelocity > 0)) throw new RangeError('axial velocity must be positive');
  const duration = ASSUMPTIONS.motLength / axialVelocity, steps = Math.ceil(duration / dt), h = duration / steps;
  let state = [ASSUMPTIONS.x0, ASSUMPTIONS.y0, p.transverseVelocity * Math.cos(ASSUMPTIONS.velocityAngle), p.transverseVelocity * Math.sin(ASSUMPTIONS.velocityAngle)], t = 0, escaped = false;
  const points = [], save = () => points.push({ t, x: state[0], y: state[1], vx: state[2], vy: state[3] });
  const derivative = a => { const force = motAcceleration(a, p); return [a[2], a[3], ...force]; };
  const add = (a, k, scale) => a.map((v, j) => v + k[j] * scale);
  if (trace) save();
  for (let i = 0; i < steps; i++) {
    const k1 = derivative(state), k2 = derivative(add(state, k1, h / 2)), k3 = derivative(add(state, k2, h / 2)), k4 = derivative(add(state, k3, h));
    state = state.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); t = (i + 1) * h;
    escaped = Math.hypot(state[0], state[1]) > ASSUMPTIONS.motRadius;
    if (trace && (i % 4 === 3 || i === steps - 1 || escaped)) save();
    if (escaped) break;
  }
  const radius = Math.hypot(state[0], state[1]), speed = Math.hypot(state[2], state[3]);
  return { points, duration, t, radius, speed, escaped, accepted: !escaped && radius <= ASSUMPTIONS.aperture && speed <= ASSUMPTIONS.maxTransverse };
}
export function simulateCooling(input = {}, options = {}) {
  const p = parameters(input), slower = simulateSlower(p, options.slower);
  // Conditional transverse test: atoms outside the axial window are not passed to this stage.
  const mot = slower.accepted ? simulateMot(slower.velocity, p, options.mot) : null;
  return { parameters: p, slower, mot, captured: slower.accepted && mot.accepted };
}
export function captureMap(input = {}) {
  const p = parameters(input), columns = 25, rows = 13, cells = [];
  for (let col = 0; col < columns; col++) {
    const initialVelocity = 100 + col * 25, slower = simulateSlower({ ...p, initialVelocity }, { trace: false });
    for (let row = 0; row < rows; row++) {
      const transverseVelocity = row * 2.5;
      const mot = slower.accepted ? simulateMot(slower.velocity, { ...p, transverseVelocity }, { trace: false }) : null;
      cells.push({ initialVelocity, transverseVelocity, status: !slower.accepted ? 'axial' : mot.accepted ? 'captured' : 'transverse' });
    }
  }
  return { columns, rows, cells };
}
export function sampleTrajectory(points, phase, timeKey = 't') {
  if (!points.length) return null;
  const at = points.at(-1)[timeKey] * Math.max(0, Math.min(1, phase));
  let upper = points.findIndex(p => p[timeKey] >= at); if (upper <= 0) return points[0];
  const a = points[upper - 1], b = points[upper], fraction = (at - a[timeKey]) / (b[timeKey] - a[timeKey]);
  return Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * fraction]));
}
