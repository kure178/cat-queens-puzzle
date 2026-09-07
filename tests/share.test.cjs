const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encode, decode, link } = require('../js/share.js');
const { generate } = require('../js/generator.js');
const { solve } = require('../js/solver.js');
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (let n = 5; n <= 12; n++) test(`share ${n}×${n} preserves geometry and its unique answer`, async () => {
  const { puzzle: original } = await generate(n, { random: random(n) });
  const code = encode(original), restored = decode(code);
  assert.equal(restored.n, n);
  assert.deepEqual(solve(restored.regions, n), [original.solution]);
  assert.deepEqual(restored.regions, original.regions);
  for (let i = 0; i < n * n; i++) for (let j = 0; j < n * n; j++) assert.equal(restored.regions[i] === restored.regions[j], original.regions[i] === original.regions[j]);
  assert.deepEqual(Object.keys(restored).sort(), ['n', 'regions']);
  assert.equal(encode(restored), code);
  for (const mode of ['RandomSnake', 'Balanced', 'SeedGrowth']) assert.equal(encode({ ...original, mode }), code);
  assert.equal(encode({ ...original, regions: original.regions.map(c => n - 1 - c), solution: [], cells: Array(n * n).fill(2), colors: ['red'] }), code);
  const url = link(original, 'https://example.test/QueensPuzzle/?lang=ja#old');
  assert.equal(new URL(url).pathname, '/QueensPuzzle/');
  assert.deepEqual(decode(url), restored);
});
test('malformed, unsupported, disconnected and non-unique problems are rejected', () => {
  for (const code of ['', 'CQ2-5-' + '0'.repeat(25), 'CQ1-4-0000', 'CQ1-5-01234', 'CQ1-5-' + 'a'.repeat(25), 'CQ1-5-' + '0'.repeat(25), 'x'.repeat(2049), 'CQ1-5-' + '01234'.repeat(5), 'CQ1-5-' + '0000011111222223333344444']) assert.throws(() => decode(code));
  // Region 0 consists of two separate cells in otherwise complete row regions.
  assert.throws(() => decode('CQ1-5-0100010111222223333344444'), /つながっていない/);
});
