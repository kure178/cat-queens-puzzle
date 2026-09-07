const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generate, connected, MODES } = require('../js/generator.js');
const { solve } = require('../js/solver.js');
const { Game, evaluate, CAT, CROSS } = require('../js/game.js');
function random(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (const mode of MODES) for (let n = 5; n <= 12; n++) test(`${mode} ${n}×${n}: connected regions and exactly one valid solution`, async () => {
  for (let seed = 1; seed <= 2; seed++) {
    const { puzzle, metrics } = await generate(n, { mode, random: random(seed) });
    assert.equal(puzzle.mode, mode);
    if (mode !== "SeedGrowth") assert.ok(metrics.evaluations <= 3 * n * n);
    assert.equal(new Set(puzzle.regions).size, n);
    assert.ok(puzzle.regions.every(id => Number.isInteger(id) && id >= 0 && id < n));
    puzzle.solution.forEach((col, row) => assert.equal(puzzle.regions[row * n + col], row));
    for (let color = 0; color < n; color++) assert.ok(connected(puzzle.regions, color, n));
    assert.deepEqual(solve(puzzle.regions, n), [puzzle.solution]);
    const game = new Game(puzzle);
    assert.equal(game.result.complete, false);
    game.apply(puzzle.solution.map((col, row) => [row * n + col, CAT]));
    assert.equal(game.result.complete, true);
    game.reset(); assert.equal(game.result.count, 0);
    game.undo(); assert.equal(game.result.complete, true);
  }
});
test('row, column, region and diagonal conflicts; distant diagonals allowed', () => {
  const puzzle = { n: 5, regions: Array.from({ length: 25 }, (_, i) => i) };
  for (const pair of [[0, 4], [0, 20], [0, 6]]) {
    const cells = Array(25).fill(0); pair.forEach(i => cells[i] = CAT);
    assert.equal(evaluate(puzzle, cells).conflicts.size, 2);
  }
  const cells = Array(25).fill(0); cells[0] = cells[12] = CAT;
  assert.equal(evaluate(puzzle, cells).conflicts.size, 0);
  puzzle.regions[12] = 0;
  assert.equal(evaluate(puzzle, cells).conflicts.size, 2);
});
test('a stroke is undone as one operation', async () => {
  const game = new Game((await generate(5, { random: random(3) })).puzzle);
  game.apply([[0, CROSS], [1, CROSS], [2, CROSS]]);
  game.undo(); assert.ok(game.cells.every(v => v === 0));
});
test('invalid board sizes are rejected', async () => {
  for (const n of [4, 13, 5.5, NaN]) await assert.rejects(generate(n), RangeError);
});
test('solver agrees with exhaustive search on full and unassigned boards', () => {
  const n = 5;
  const boards = [Array.from({ length: 25 }, (_, i) => Math.floor(i / n))];
  const partial = Array(25).fill(-1), answer = [0, 2, 4, 1, 3];
  answer.forEach((col, row) => partial[row * n + col] = row);
  boards.push(partial, partial.map((id, i) => i === 0 ? -1 : id));
  for (const regions of boards) {
    const expected = [];
    function enumerate(path) {
      if (path.length === n) {
        const colors = path.map((col, row) => regions[row * n + col]);
        if (colors.every(id => id >= 0) && new Set(colors).size === n && path.every((col, row) => row === 0 || Math.abs(col - path[row - 1]) > 1)) expected.push(path);
        return;
      }
      for (let col = 0; col < n; col++) if (!path.includes(col)) enumerate([...path, col]);
    }
    enumerate([]);
    assert.deepEqual(solve(regions, n, Infinity).map(s => s.join(',')).sort(), expected.map(s => s.join(',')).sort());
  }
  assert.deepEqual(solve(partial, n), [answer]);
});
