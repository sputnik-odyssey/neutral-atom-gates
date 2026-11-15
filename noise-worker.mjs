import { simulateGate } from './branching.mjs?v=branching-1';
let latest = 0;
const summary = r => ({ averageFidelity: r.averageFidelity, stateFidelity: r.stateFidelity,
  processFidelity: r.processFidelity, leakage: r.leakage, branchLeakage: r.branchLeakage,
  logicalFlip: r.logicalFlip, residualRydberg: r.residualRydberg });
self.onmessage = async ({ data }) => {
  const { id, params, key, min, max, count } = data;
  latest = id;
  try {
    const points = [];
    for (let i = 0; i < count; i++) {
      if (latest !== id) return;
      const value = min + (max - min) * i / (count - 1);
      points.push({ value, ...summary(simulateGate({ ...params, [key]: value }, { record: false })) });
      if (i % 6 === 5) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (latest !== id) return;
    const compared = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [params.branch0, params.branch1, params.branchLeak]].map(fractions => ({
      ...summary(simulateGate({ ...params, branch0: fractions[0], branch1: fractions[1], branchLeak: fractions[2] }, { record: false }))
    }));
    self.postMessage({ id, points, compared });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
