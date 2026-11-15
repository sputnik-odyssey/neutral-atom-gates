/** Four states per atom: 0, 1, r, ell; ell is absorbing and is not driven. */
export { singlePulse } from './noise.mjs';
export const DIM = 16;
export const COMPUTATIONAL = [0, 1, 4, 5];
const index = (i, j) => 2 * (DIM * i + j);
const rydberg = i => Number(Math.floor(i / 4) === 2) + Number(i % 4 === 2);
const leaked = i => Math.floor(i / 4) === 3 || i % 4 === 3;
const correction = i => (Math.floor(i / 4) === 1 ? -1 : 1) * (i % 4 === 1 ? -1 : 1);
const clamp = x => Math.max(0, Math.min(1, x));
const signs = [1, 1, 1, -1];
const trace = rho => Array.from({ length: DIM }, (_, i) => rho[index(i, i)]).reduce((a, b) => a + b, 0);

export function branches(params = {}) {
  const result = [params.branch0 ?? 0, params.branch1 ?? 1, params.branchLeak ?? 0];
  if (result.some(x => !Number.isFinite(x) || x < 0 || x > 1) || Math.abs(result.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new RangeError('Branch fractions must be nonnegative and sum to one');
  return result;
}
export function inputDensity(amplitudes = [[.5, 0], [.5, 0], [.5, 0], [.5, 0]]) {
  const rho = new Float64Array(512);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const [ar, ai] = amplitudes[i], [br, bi] = amplitudes[j], k = index(COMPUTATIONAL[i], COMPUTATIONAL[j]);
    rho[k] = ar * br + ai * bi; rho[k + 1] = ai * br - ar * bi;
  }
  return rho;
}
export function mixedInput() {
  const rho = new Float64Array(512);
  for (const i of COMPUTATIONAL) rho[index(i, i)] = .25;
  return rho;
}

/** Exact multi-branch amplitude damping; different destinations are independent Kraus jumps. */
export function decayChannel(rho, rateTime, fractions = [0, 1, 0], filtered = false) {
  if (!Number.isFinite(rateTime) || rateTime < 0) throw new RangeError('Invalid decay duration');
  if (!rateTime) return;
  const probability = -Math.expm1(-rateTime), amplitude = Math.exp(-rateTime / 2);
  for (const atom of [0, 1]) {
    for (let destination = 0; destination < 3; destination++) {
      if (filtered && destination !== 1) continue;
      const weight = probability * fractions[destination], level = [0, 1, 3][destination];
      if (!weight) continue;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const source = atom === 0 ? index(8 + i, 8 + j) : index(4 * i + 2, 4 * j + 2);
        const target = atom === 0 ? index(4 * level + i, 4 * level + j) : index(4 * i + level, 4 * j + level);
        rho[target] += weight * rho[source]; rho[target + 1] += weight * rho[source + 1];
      }
    }
    for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) {
      const ri = atom === 0 ? Math.floor(i / 4) === 2 : i % 4 === 2;
      const rj = atom === 0 ? Math.floor(j / 4) === 2 : j % 4 === 2;
      const factor = (ri ? amplitude : 1) * (rj ? amplitude : 1), k = index(i, j);
      rho[k] *= factor; rho[k + 1] *= factor;
    }
  }
}

function pulse(atom, dt, omega, b, detuning) {
  const covered = new Set(), blocks = [];
  for (let spectator = 0; spectator < 4; spectator++) {
    const low = atom === 0 ? 4 + spectator : 4 * spectator + 1;
    const high = atom === 0 ? 8 + spectator : 4 * spectator + 2;
    covered.add(low); covered.add(high);
    const lowEnergy = spectator === 2 ? -detuning : 0;
    const delta = (spectator === 2 ? b : 0) - detuning;
    const phase = energy => [Math.cos(energy * dt), -Math.sin(energy * dt)];
    if (!Number.isFinite(delta)) {
      blocks.push({ low, high, a: phase(lowEnergy), c: [0, 0], d: phase(-2 * detuning) }); continue;
    }
    const q = Math.hypot(omega, delta), cs = Math.cos(q * dt / 2);
    const sn = q ? Math.sin(q * dt / 2) / q : dt / 2;
    const [pr, pi] = phase(lowEnergy + delta / 2);
    const product = (re, im) => [pr * re - pi * im, pr * im + pi * re];
    blocks.push({ low, high, a: product(cs, delta * sn), c: product(0, -omega * sn), d: product(cs, -delta * sn) });
  }
  const singles = [];
  for (let i = 0; i < DIM; i++) if (!covered.has(i) && rydberg(i)) singles.push({ i, re: Math.cos(detuning * dt), im: Math.sin(detuning * dt) });
  return { blocks, singles };
}
function unitary(rho, { blocks, singles }) {
  for (const { low, high, a, c, d } of blocks) for (let j = 0; j < DIM; j++) {
    const x = index(low, j), y = index(high, j), xr = rho[x], xi = rho[x + 1], yr = rho[y], yi = rho[y + 1];
    rho[x] = a[0] * xr - a[1] * xi + c[0] * yr - c[1] * yi;
    rho[x + 1] = a[0] * xi + a[1] * xr + c[0] * yi + c[1] * yr;
    rho[y] = c[0] * xr - c[1] * xi + d[0] * yr - d[1] * yi;
    rho[y + 1] = c[0] * xi + c[1] * xr + d[0] * yi + d[1] * yr;
  }
  for (const s of singles) for (let j = 0; j < DIM; j++) {
    const k = index(s.i, j), re = rho[k], im = rho[k + 1]; rho[k] = s.re * re - s.im * im; rho[k + 1] = s.re * im + s.im * re;
  }
  for (const { low, high, a, c, d } of blocks) for (let i = 0; i < DIM; i++) {
    const x = index(i, low), y = index(i, high), xr = rho[x], xi = rho[x + 1], yr = rho[y], yi = rho[y + 1];
    rho[x] = a[0] * xr + a[1] * xi + c[0] * yr + c[1] * yi;
    rho[x + 1] = a[0] * xi - a[1] * xr + c[0] * yi - c[1] * yr;
    rho[y] = c[0] * xr + c[1] * xi + d[0] * yr + d[1] * yi;
    rho[y + 1] = c[0] * xi - c[1] * xr + d[0] * yi - d[1] * yr;
  }
  for (const s of singles) for (let i = 0; i < DIM; i++) {
    const k = index(i, s.i), re = rho[k], im = rho[k + 1]; rho[k] = s.re * re + s.im * im; rho[k + 1] = s.re * im - s.im * re;
  }
}
function populations(rho) {
  let r = 0, loss = 0, residual = 0;
  for (let i = 0; i < DIM; i++) {
    const p = rho[index(i, i)];
    if (rydberg(i)) r += p;
    if (leaked(i)) loss += p; else if (rydberg(i)) residual += p;
  }
  return { rydberg: r, double: rho[index(10, 10)], loss, residual };
}
export function evolveGate(params = {}, options = {}) {
  const { epsilon = 0, dephasing = 0, blockadeRatio = Infinity, decay = 0, detuning = 0 } = params;
  const { stepsPerPi = 128, record = true, initialDensity, filtered = false } = options;
  const fractions = branches(params);
  if (![epsilon, dephasing, decay, detuning].every(Number.isFinite) || dephasing < 0 || decay < 0 || !(blockadeRatio >= 0) || !Number.isInteger(stepsPerPi) || stepsPerPi < 1) throw new RangeError('Invalid parameters');
  const rho = initialDensity ? Float64Array.from(initialDensity) : inputDensity();
  if (rho.length !== 512) throw new RangeError('A 16 by 16 complex matrix is required');
  const dt = Math.PI / stepsPerPi, factors = new Float64Array(256);
  for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) {
    const n = (Number(Math.floor(i / 4) === 2) - Number(Math.floor(j / 4) === 2)) ** 2 + (Number(i % 4 === 2) - Number(j % 4 === 2)) ** 2;
    factors[DIM * i + j] = Math.exp(-dephasing * dt * n / (8 * Math.PI));
  }
  const dissipate = () => {
    if (dephasing) for (let k = 0; k < 256; k++) { rho[2 * k] *= factors[k]; rho[2 * k + 1] *= factors[k]; }
    decayChannel(rho, decay * dt / (8 * Math.PI), fractions, filtered);
  };
  const trajectory = record ? [{ time: 0, ...populations(rho) }] : [];
  let elapsed = 0, maxDouble = 0;
  for (const [atom, duration] of [[0, 1], [1, 2], [0, 1]]) {
    const u = pulse(atom, dt, 1 + epsilon, blockadeRatio, detuning);
    for (let n = 0; n < duration * stepsPerPi; n++) {
      dissipate(); unitary(rho, u); dissipate(); elapsed++;
      if (record) { const p = populations(rho); maxDouble = Math.max(maxDouble, p.double); trajectory.push({ time: elapsed / stepsPerPi, ...p }); }
    }
  }
  for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) { const k = index(i, j), s = correction(i) * correction(j); rho[k] *= s; rho[k + 1] *= s; }
  return { rho, trajectory, maxDouble };
}
function overlap(rho) {
  let result = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) result += signs[i] * signs[j] * rho[index(COMPUTATIONAL[i], COMPUTATIONAL[j])] / 4;
  return result;
}
const survival = rho => COMPUTATIONAL.reduce((sum, i) => sum + rho[index(i, i)], 0);
export function simulateGate(params = {}, options = {}) {
  const tested = evolveGate(params, options);
  const average = evolveGate(params, { ...options, record: false, initialDensity: mixedInput() });
  const [p0, , pl] = branches(params);
  const diagonalPaths = params.decay && (p0 || pl) ? evolveGate(params, { ...options, record: false, filtered: true }) : tested;
  const processFidelity = overlap(diagonalPaths.rho), pcomp = survival(average.rho), stats = populations(average.rho);
  /* Haar identity with leakage: F_avg=(P_comp+4 F_e)/5.
   * To obtain F_e we retain only no-jump paths and r->1 jumps. Any r->0 jump
   * irreversibly lowers a logical bit (0 is never driven); any r->ell jump
   * leaves the code. Such Kraus operators have zero diagonal trace against CZ.
   * The retained Kraus operators are diagonal on the code, so their ++ overlap
   * is exactly F_e. This is verified against all 16 logical channel operators.
   * It is NOT the physical test-state fidelity when branch0 is nonzero.
   */
  return { ...tested, averageDensity: average.rho, trace: trace(tested.rho),
    averageFidelity: clamp((pcomp + 4 * processFidelity) / 5), processFidelity: clamp(processFidelity),
    stateFidelity: clamp(overlap(tested.rho)), survival: clamp(pcomp), leakage: clamp(1 - pcomp),
    branchLeakage: clamp(stats.loss), residualRydberg: clamp(stats.residual),
    logicalFlip: clamp(pcomp - survival(diagonalPaths.rho)),
    computationalDensity: COMPUTATIONAL.map(i => COMPUTATIONAL.map(j => [tested.rho[index(i, j)], tested.rho[index(i, j) + 1]])) };
}
export function freeEvolution(params = {}, time = 1) {
  const { dephasing = 0, decay = 0, detuning = 0 } = params;
  const [p0, p1, pl] = branches(params), released = .5 * (1 - Math.exp(-decay * time));
  const excited = .5 * Math.exp(-decay * time), coherence = .5 * Math.exp(-(dephasing + decay / 2) * time), phase = -4 * Math.PI * detuning * time;
  return { excited, ground: .5 + p1 * released, zero: p0 * released, loss: pl * released,
    coherence, real: coherence * Math.cos(phase), imaginary: coherence * Math.sin(phase), phase };
}
