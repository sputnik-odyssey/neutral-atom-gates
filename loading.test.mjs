import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETERS as P, createPopulation, expectedAtoms, unrefilledAtoms, advancePopulation } from './loading-model.mjs';
import { EQUIPMENT, STAGES, AOSENSE } from './loading-catalog.mjs';

test('six full groups respect capacity and initial staggered ages', () => {
  const state = createPopulation();
  assert.equal(state.loaded.length, 6); assert.equal(P.sitesPerGroup * P.groups, 3240);
  assert.ok(expectedAtoms(state) < 3240 && expectedAtoms(state) > 3220);
  assert.equal(expectedAtoms(state), state.initial);
});
test('empty array builds in exactly six successful cycles', () => {
  const state = createPopulation(true); assert.equal(expectedAtoms(state), 0);
  assert.equal(advancePopulation(state, 5).loaded.filter(v => v !== null).length, 5);
  const built = advancePopulation(state, 6); assert.ok(built.loaded.every(v => v !== null));
  assert.equal(unrefilledAtoms(built), 0); assert.equal(built.replacements, 6);
});
test('a replacement updates just one group and preserves five timestamps', () => {
  const before = createPopulation(), after = advancePopulation(before);
  assert.equal(after.loaded[0], .08); assert.deepEqual(after.loaded.slice(1), before.loaded.slice(1));
  assert.equal(before.cycles, 0); assert.notEqual(before.loaded, after.loaded);
});
test('source off consumes two stored batches, then keeps old groups', () => {
  const before = { ...createPopulation(), source: false };
  const after = advancePopulation(before, 3);
  assert.equal(after.replacements, 2); assert.equal(after.reservoir, 0); assert.equal(after.last, 'source-empty');
  assert.deepEqual(after.loaded, advancePopulation(before, 2).loaded);
});
test('transfer interruption blocks replenishment even with running source', () => {
  const state = { ...createPopulation(), transfer: false }, after = advancePopulation(state, 750);
  assert.equal(after.replacements, 0); assert.equal(after.reservoir, 2);
  assert.ok(Math.abs(expectedAtoms(after) - state.initial / Math.E) < 1e-9);
  assert.ok(Math.abs(expectedAtoms(after) - unrefilledAtoms(after)) < 1e-9);
});
test('continuous renewal sustains expected population over many lifetimes', () => {
  const state = advancePopulation(createPopulation(), 7500);
  assert.ok(expectedAtoms(state) > 3220 && expectedAtoms(state) <= 3240);
  assert.ok(unrefilledAtoms(state) < 1); assert.equal(state.replacements, 7500);
});
test('restoring source restarts supply without deleting held groups on failure', () => {
  const starved = advancePopulation({ ...createPopulation(), source: false }, 10);
  const restored = advancePopulation({ ...starved, source: true });
  assert.equal(restored.replacements, 3); assert.equal(restored.last, 'replaced');
  assert.equal(restored.loaded.filter((v, i) => v !== starved.loaded[i]).length, 1);
});
test('batch and individual stepping are equivalent; invalid counts rejected', () => {
  const state = createPopulation(); let stepped = state;
  for (let i = 0; i < 750; i++) stepped = advancePopulation(stepped);
  assert.deepEqual(advancePopulation(state, 750), stepped);
  assert.throws(() => advancePopulation(state, -1), RangeError);
  assert.throws(() => advancePopulation(state, .5), RangeError);
});
test('source and array views have separate equipment provenance and stages', () => {
  const sr = EQUIPMENT.filter(e => e.view === 'sr');
  assert.equal(sr.length, 1); assert.equal(sr[0].model, 'Beam-RevD-Sr'); assert.equal(sr[0].source, AOSENSE);
  assert.equal(STAGES.sr.length, 4); assert.equal(STAGES.rb.length, 6);
  for (const [view, stages] of Object.entries(STAGES)) for (const stage of stages) assert.ok(EQUIPMENT.some(e => e.id === stage.device && e.view === view));
  for (const e of EQUIPMENT) assert.ok(e.source.startsWith('https://'));
});
