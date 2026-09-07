/* Versioned problem-only serialization. No solution, colors, or play state. */
(function (root) {
  'use strict';
  const solver = typeof module !== 'undefined' ? require('./solver.js') : root.CatSolver;
  const generator = typeof module !== 'undefined' ? require('./generator.js') : root.CatGenerator;
  function encode({ n, regions }) {
    if (!Number.isInteger(n) || n < 5 || n > 12 || !Array.isArray(regions) || regions.length !== n * n) throw new Error('盤面の形式が正しくありません。');
    // Region IDs from the generator may reveal solution rows. Replace them with
    // first-appearance IDs, which depend only on the visible region geometry.
    const ids = new Map();
    const shape = regions.map(id => {
      if (!Number.isInteger(id) || id < 0 || id >= n) throw new Error('領域番号が正しくありません。');
      if (!ids.has(id)) ids.set(id, ids.size);
      return ids.get(id).toString(16);
    }).join('');
    if (ids.size !== n) throw new Error('領域の数が正しくありません。');
    return `CQ1-${n}-${shape}`;
  }
  function extract(input) {
    if (typeof input !== 'string' || input.length > 2048) throw new Error('共有データが正しくありません。');
    let code = input.trim();
    if (/^(https?:|file:)/i.test(code)) code = new URLSearchParams(new URL(code).hash.slice(1)).get('p') || '';
    return code;
  }
  function decode(input) {
    const code = extract(input), match = /^CQ1-(5|6|7|8|9|10|11|12)-([0-9ab]+)$/.exec(code);
    if (!match) throw new Error('対応する共有URLまたは問題コードを入力してください。');
    const n = Number(match[1]), regions = [...match[2]].map(c => parseInt(c, 16));
    if (regions.length !== n * n || regions.some(c => c >= n) || new Set(regions).size !== n) throw new Error('共有データのサイズまたは領域が正しくありません。');
    for (let color = 0; color < n; color++) if (!generator.connected(regions, color, n)) throw new Error('つながっていない領域があります。');
    const solutions = solver.solve(regions, n, 2);
    if (solutions.length !== 1) throw new Error('正解が1つに決まる問題ではありません。');
    // Restore the internal row-to-region convention without transmitting answers.
    const ids = new Map(solutions[0].map((col, row) => [regions[row * n + col], row]));
    return { n, regions: regions.map(id => ids.get(id)) };
  }
  function link(puzzle, href) {
    const url = new URL(href);
    url.hash = new URLSearchParams({ p: encode(puzzle) }).toString();
    return url.href;
  }
  root.CatShare = { encode, decode, extract, link };
  if (typeof module !== 'undefined') module.exports = root.CatShare;
})(globalThis);
