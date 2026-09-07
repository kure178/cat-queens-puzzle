const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generate, connected } = require('../js/generator.js');
const { solve } = require('../js/solver.js');
const { Game, evaluate, CAT, CROSS } = require('../js/game.js');
function random(seed) { return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (let n = 5; n <= 12; n++) test(`${n}×${n}: connected regions and exactly one valid solution`, () => {
  for (let seed = 1; seed <= 5; seed++) {
    const puzzle = generate(n, random(seed));
    assert.equal(new Set(puzzle.regions).size, n);
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
test('a stroke is undone as one operation', () => {
  const game = new Game(generate(5, random(3)));
  game.apply([[0, CROSS], [1, CROSS], [2, CROSS]]);
  game.undo(); assert.ok(game.cells.every(v => v === 0));
});
test('invalid board sizes are rejected', () => {
  for (const n of [4, 13, 5.5, NaN]) assert.throws(() => generate(n), RangeError);
});
