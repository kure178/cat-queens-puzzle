const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generate, connected } = require('../js/generator.js');
const { solve, solveBudgeted } = require('../js/solver.js');
function random(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
function valid(puzzle) {
  assert.deepEqual(solve(puzzle.regions, puzzle.n), [puzzle.solution]);
  for (let id = 0; id < puzzle.n; id++) assert.ok(connected(puzzle.regions, id, puzzle.n));
  assert.ok(puzzle.regions.every(id => id >= 0 && id < puzzle.n));
}
test('zero adjustment budget returns a complete base for both fast modes', async () => {
  for (const mode of ['RandomSnake', 'Balanced']) for (let n = 5; n <= 12; n++) {
    const { puzzle, metrics } = await generate(n, { mode, budgetMs: 0, random: random(n) });
    valid(puzzle); assert.equal(metrics.accepted, 0); assert.equal(metrics.stopReason, 'deadline');
  }
});
test('budget exhaustion during a candidate keeps a verified complete board', async () => {
  let clock = 0;
  const { puzzle, metrics } = await generate(12, { mode: 'Balanced', random: random(7), budgetMs: 30,
    now: () => ++clock, yieldControl: async () => {} });
  valid(puzzle); assert.equal(metrics.stopReason, 'deadline'); assert.ok(metrics.evaluations > 0);
});
test('unknown solver outcome is distinct from a completed uniqueness proof', async () => {
  const { puzzle } = await generate(5, { budgetMs: 0 });
  const unknown = await solveBudgeted(puzzle.regions, 5, { maxNodes: 1 });
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.solutions, undefined);
  assert.deepEqual((await solveBudgeted(puzzle.regions, 5)).solutions, [puzzle.solution]);
});
test('SeedGrowth deadline and attempt exhaustion never return incomplete puzzles', async () => {
  await assert.rejects(generate(12, { mode: 'SeedGrowth', budgetMs: 0 }), { name: 'GenerationTimeoutError' });
  await assert.rejects(generate(12, { mode: 'SeedGrowth', maxAttempts: 0 }), { name: 'GenerationTimeoutError' });
});
test('abort before work and during cooperative fallback rejects cleanly', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generate(12, { signal: controller.signal }), { name: 'AbortError' });
  const next = new AbortController(); let clock = 0, yields = 0;
  await assert.rejects(generate(12, { mode: 'SeedGrowth', signal: next.signal,
    now: () => (clock += 3), yieldControl: async () => { yields++; next.abort(); } }), { name: 'AbortError' });
  assert.ok(yields > 0);
});
test('bounded placement fallback works with a constant random source', async () => {
  for (let n = 5; n <= 12; n++) valid((await generate(n, { random: () => 0.999, budgetMs: 0 })).puzzle);
});
test('RandomSnake retains a large region and both fast modes honor candidate caps', async () => {
  for (const mode of ['RandomSnake', 'Balanced']) {
    const { puzzle, metrics } = await generate(12, { mode, maxEvaluations: 12, random: random(4) });
    assert.ok(metrics.evaluations <= 12); valid(puzzle);
    if (mode === 'RandomSnake') assert.ok(Math.max(...Array.from({ length: 12 }, (_, id) => puzzle.regions.filter(c => c === id).length)) >= Math.ceil(144 * 0.3));
  }
  await assert.rejects(generate(5, { mode: 'Unknown' }), RangeError);
});
