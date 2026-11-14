/**
 * Nine-level model of a sequential Rydberg blockade CZ gate.
 * Basis: 00, 01, 0r, 10, 11, 1r, r0, r1, rr.
 * Time is in 1/Omega_0. Pulse durations are pi, 2pi, pi.
 * H/hbar = (1+epsilon)/2 (|1><r|_j + h.c.) + b |rr><rr|.
 * L_j = sqrt(2 gamma_phi) n_r,j; gamma_phi = g/(4pi).
 * Each step is a CP, trace-preserving Strang splitting: D/2, U, D/2.
 * The two-level pulse blocks are exponentiated analytically (no large-b RK instability).
 */
const D = 9;
const COMPUTATIONAL = [0, 1, 3, 4];
const CZ = [1, 1, 1, -1];
const CORRECTION = [1, -1, 1, -1, 1, -1, 1, -1, 1];
const ry = i => [Math.floor(i / 3) === 2 ? 1 : 0, i % 3 === 2 ? 1 : 0];
const RYDBERG_DIFFERENCES = Array.from({ length: 81 }, (_, k) => {
  const a = ry(Math.floor(k / D)), b = ry(k % D);
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
});
const at = (i, j) => 2 * (i * D + j);
const clamp = x => Math.max(0, Math.min(1, x));

function pulseBlocks(atom, dt, omega, b) {
  const pairs = atom === 0 ? [[3, 6], [4, 7], [5, 8]] : [[1, 2], [4, 5], [7, 8]];
  return pairs.map(([low, high]) => {
    const delta = high === 8 ? b : 0;
    if (!Number.isFinite(delta)) return { low, high, a: [1, 0], c: [0, 0], d: [1, 0] };
    const q = Math.hypot(omega, delta);
    const cs = Math.cos(q * dt / 2), sn = q === 0 ? dt / 2 : Math.sin(q * dt / 2) / q;
    const pr = Math.cos(delta * dt / 2), pi = -Math.sin(delta * dt / 2);
    const phase = (re, im) => [pr * re - pi * im, pr * im + pi * re];
    return { low, high, a: phase(cs, delta * sn), c: phase(0, -omega * sn), d: phase(cs, -delta * sn) };
  });
}

function unitaryStep(rho, blocks) {
  // Left multiplication by U, then right multiplication by U dagger.
  for (const { low, high, a, c, d } of blocks) {
    for (let j = 0; j < D; j++) {
      const x = at(low, j), y = at(high, j);
      const xr = rho[x], xi = rho[x + 1], yr = rho[y], yi = rho[y + 1];
      rho[x] = a[0] * xr - a[1] * xi + c[0] * yr - c[1] * yi;
      rho[x + 1] = a[0] * xi + a[1] * xr + c[0] * yi + c[1] * yr;
      rho[y] = c[0] * xr - c[1] * xi + d[0] * yr - d[1] * yi;
      rho[y + 1] = c[0] * xi + c[1] * xr + d[0] * yi + d[1] * yr;
    }
  }
  for (const { low, high, a, c, d } of blocks) {
    for (let i = 0; i < D; i++) {
      const x = at(i, low), y = at(i, high);
      const xr = rho[x], xi = rho[x + 1], yr = rho[y], yi = rho[y + 1];
      rho[x] = a[0] * xr + a[1] * xi + c[0] * yr + c[1] * yi;
      rho[x + 1] = a[0] * xi - a[1] * xr + c[0] * yi - c[1] * yr;
      rho[y] = c[0] * xr + c[1] * xi + d[0] * yr + d[1] * yi;
      rho[y + 1] = c[0] * xi - c[1] * xr + d[0] * yi - d[1] * yr;
    }
  }
}

export function inputDensity(amplitudes) {
  const rho = new Float64Array(162);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const [ar, ai] = amplitudes[i], [br, bi] = amplitudes[j];
    const k = at(COMPUTATIONAL[i], COMPUTATIONAL[j]);
    rho[k] = ar * br + ai * bi;
    rho[k + 1] = ai * br - ar * bi;
  }
  return rho;
}

export function evolveGate(params = {}, options = {}) {
  const { epsilon = 0, dephasing = 0, blockadeRatio = Infinity } = params;
  const { stepsPerPi = 128, record = true, initialDensity } = options;
  if (!Number.isFinite(epsilon) || Math.abs(epsilon) > .5 || !Number.isFinite(dephasing) || dephasing < 0 ||
      !(blockadeRatio >= 0) || !Number.isInteger(stepsPerPi) || stepsPerPi < 1) throw new RangeError('Invalid gate parameters');
  const rho = initialDensity ? Float64Array.from(initialDensity) : inputDensity(Array.from({ length: 4 }, () => [.5, 0]));
  if (rho.length !== 162) throw new RangeError('A 9 by 9 complex density matrix is required');
  const dt = Math.PI / stepsPerPi;
  const factors = RYDBERG_DIFFERENCES.map(n => Math.exp(-dephasing * dt * n / (8 * Math.PI)));
  const dephase = () => {
    if (dephasing === 0) return;
    for (let k = 0; k < 81; k++) { rho[2 * k] *= factors[k]; rho[2 * k + 1] *= factors[k]; }
  };
  const populations = () => ({
    rydberg: [2, 5, 6, 7, 8].reduce((sum, i) => sum + rho[at(i, i)], 0),
    double: rho[at(8, 8)]
  });
  const trajectory = record ? [{ time: 0, ...populations() }] : [];
  let elapsed = 0, maxDouble = 0;
  for (const [atom, duration] of [[0, 1], [1, 2], [0, 1]]) {
    const blocks = pulseBlocks(atom, dt, 1 + epsilon, blockadeRatio);
    for (let n = 0; n < duration * stepsPerPi; n++) {
      dephase(); unitaryStep(rho, blocks); dephase(); elapsed++;
      const p = populations();
      maxDouble = Math.max(maxDouble, p.double);
      if (record) trajectory.push({ time: elapsed / stepsPerPi, ...p });
    }
  }
  // Ideal instantaneous Z_c Z_t correction; no re-optimization at finite blockade.
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
    const k = at(i, j), sign = CORRECTION[i] * CORRECTION[j];
    rho[k] *= sign; rho[k + 1] *= sign;
  }
  return { rho, trajectory, maxDouble };
}

export function simulateGate(params = {}, options = {}) {
  if (options.initialDensity) throw new Error('Use evolveGate for custom input states');
  const { rho, trajectory, maxDouble } = evolveGate(params, options);
  const survival = COMPUTATIONAL.reduce((sum, i) => sum + rho[at(i, i)], 0);
  let targetOverlap = 0;
  const computationalDensity = COMPUTATIONAL.map((i, a) => COMPUTATIONAL.map((j, b) => {
    const k = at(i, j);
    targetOverlap += CZ[a] * CZ[b] * rho[k] / 4;
    return [rho[k], rho[k + 1]];
  }));
  /*
   * Sector preservation: |0> never changes into |1> or |r>.
   * For the ++ input, each logical operator |i><j| contributes to a disjoint block.
   * Thus this one density-matrix evolution retains all 16 logical channel blocks.
   * The Haar identity gives F_avg = (sum survival_i + sum target-weighted E_ij)/20
   * = (P_comp + 4 F_test)/5, INCLUDING leakage, without postselection.
   * This shortcut is specific to this model, not a general single-input gate test.
   */
  return {
    averageFidelity: clamp((survival + 4 * targetOverlap) / 5),
    stateFidelity: clamp(targetOverlap),
    leakage: clamp(1 - survival),
    trace: Array.from({ length: D }, (_, i) => rho[at(i, i)]).reduce((a, b) => a + b, 0),
    computationalDensity, rho, trajectory, maxDouble
  };
}
