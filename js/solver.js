/* Pure logic, usable in browsers and Node. -1 means an unavailable cell. */
(function (root) {
  'use strict';
  function* search(regions, n, limit = 2) {
    const solutions = [], path = Array(n).fill(-1);
    // Try the most constrained row first, including partly grown (-1) boards.
    function* visit(remaining, columns, colors) {
      yield;
      if (!remaining) { solutions.push([...path]); return; }
      let row = -1, choices = [], availableColors = colors;
      for (let r = 0; r < n; r++) {
        if (path[r] !== -1) continue;
        const candidates = [];
        for (let col = 0; col < n; col++) {
          const color = regions[r * n + col];
          if (color < 0 || (columns & (1 << col)) || (colors & (1 << color))) continue;
          if (r > 0 && path[r - 1] !== -1 && Math.abs(path[r - 1] - col) <= 1) continue;
          if (r + 1 < n && path[r + 1] !== -1 && Math.abs(path[r + 1] - col) <= 1) continue;
          candidates.push(col); availableColors |= 1 << color;
        }
        if (!candidates.length) return;
        if (row === -1 || candidates.length < choices.length) { row = r; choices = candidates; }
      }
      if (availableColors !== (1 << n) - 1) return;
      for (const col of choices) {
        if (solutions.length >= limit) break;
        path[row] = col;
        yield* visit(remaining - 1, columns | (1 << col), colors | (1 << regions[row * n + col]));
        path[row] = -1;
      }
    }
    yield* visit(n, 0, 0); return solutions;
  }
  function solve(regions, n, limit = 2) {
    const iterator = search(regions, n, limit);
    let step;
    do { step = iterator.next(); } while (!step.done);
    return step.value;
  }
  async function solveBudgeted(regions, n, { checkpoint, maxNodes = Infinity } = {}) {
    const iterator = search(regions, n, 2);
    let nodes = 0;
    while (nodes < maxNodes) {
      if (nodes % 32 === 0 && checkpoint && !(await checkpoint())) return { status: 'unknown', nodes };
      const step = iterator.next();
      if (step.done) return { status: 'complete', solutions: step.value, nodes };
      nodes++;
    }
    return { status: 'unknown', nodes };
  }
  root.CatSolver = { solve, solveBudgeted };
  if (typeof module !== 'undefined') module.exports = root.CatSolver;
})(globalThis);
