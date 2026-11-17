// Population bookkeeping only. No coherence, optical-force or vacuum simulation.
export const PARAMETERS = Object.freeze({ groups: 6, sitesPerGroup: 540, cycle: .08, lifetime: 60, reservoirBatches: 2 });
export function createPopulation(empty = false) {
  const p = PARAMETERS;
  const loaded = Array.from({ length: p.groups }, (_, i) => empty ? null : (i - p.groups + 1) * p.cycle);
  const state = { cycles: 0, loaded, next: 0, reservoir: p.reservoirBatches, source: true, transfer: true, replacements: 0, last: 'ready' };
  state.initial = expectedAtoms(state);
  return state;
}
export function expectedAtoms(state) {
  const t = state.cycles * PARAMETERS.cycle;
  return state.loaded.reduce((n, at) => n + (at === null ? 0 : PARAMETERS.sitesPerGroup * Math.exp(-(t - at) / PARAMETERS.lifetime)), 0);
}
export function unrefilledAtoms(state) {
  return state.initial * Math.exp(-state.cycles * PARAMETERS.cycle / PARAMETERS.lifetime);
}
export function advancePopulation(state, cycles = 1) {
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 100000) throw new RangeError('cycles must be an integer in [0, 100000]');
  const next = { ...state, loaded: [...state.loaded] };
  for (let i = 0; i < cycles; i++) {
    next.cycles++;
    if (next.source && next.reservoir === 0) next.reservoir = PARAMETERS.reservoirBatches;
    if (!next.transfer) { next.last = 'transfer-off'; continue; }
    if (next.reservoir === 0) { next.last = 'source-empty'; continue; }
    next.reservoir--;
    next.loaded[next.next] = next.cycles * PARAMETERS.cycle;
    next.lastGroup = next.next;
    next.next = (next.next + 1) % PARAMETERS.groups;
    next.replacements++;
    next.last = 'replaced';
  }
  return next;
}
