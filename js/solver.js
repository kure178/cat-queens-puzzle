/* Pure logic, usable in browsers and Node. -1 means an unavailable cell. */
(function (root) {
  'use strict';
  function solve(regions, n, limit = 2) {
    const solutions = [], path = [], columns = new Set(), colors = new Set();
    function visit(row) {
      if (row === n) { solutions.push([...path]); return; }
      for (let col = 0; col < n && solutions.length < limit; col++) {
        const color = regions[row * n + col];
        if (color < 0 || columns.has(col) || colors.has(color) || (row && Math.abs(path[row - 1] - col) <= 1)) continue;
        path.push(col); columns.add(col); colors.add(color);
        visit(row + 1);
        path.pop(); columns.delete(col); colors.delete(color);
      }
    }
    visit(0); return solutions;
  }
  root.CatSolver = { solve };
  if (typeof module !== 'undefined') module.exports = root.CatSolver;
})(globalThis);
