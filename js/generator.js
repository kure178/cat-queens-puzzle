(function (root) {
  'use strict';
  const solver = typeof module !== 'undefined' ? require('./solver.js') : root.CatSolver;
  function shuffled(values, random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function neighbors(i, n) {
    const list = [];
    if (i % n) list.push(i - 1); if (i % n < n - 1) list.push(i + 1);
    if (i >= n) list.push(i - n); if (i < n * (n - 1)) list.push(i + n);
    return list;
  }
  function connected(regions, color, n) {
    const start = regions.indexOf(color); if (start < 0) return false;
    const seen = new Set([start]), queue = [start];
    for (const i of queue) for (const next of neighbors(i, n)) if (regions[next] === color && !seen.has(next)) { seen.add(next); queue.push(next); }
    return seen.size === regions.filter(c => c === color).length;
  }
  function generate(n, random = Math.random) {
    if (!Number.isInteger(n) || n < 5 || n > 12) throw new RangeError('Size must be 5–12');
    const columns = Array.from({ length: n }, (_, i) => i), solution = [];
    function place() {
      if (solution.length === n) return true;
      for (const col of shuffled(columns, random)) {
        if (solution.includes(col) || (solution.length && Math.abs(solution.at(-1) - col) <= 1)) continue;
        solution.push(col); if (place()) return true; solution.pop();
      }
      return false;
    }
    place();
    // Start with forced singleton regions, then grow them while retaining one solution.
    const regions = Array(n * n).fill(0);
    const seeds = new Set(solution.map((col, row) => row * n + col));
    solution.forEach((col, row) => { regions[row * n + col] = row; });
    for (let pass = 0; pass < n * 2; pass++) {
      let changed = false;
      for (const i of shuffled(Array.from({ length: n * n }, (_, k) => k), random)) {
        if (regions[i] !== 0 || seeds.has(i)) continue;
        const choices = shuffled([...new Set(neighbors(i, n).map(j => regions[j]).filter(Boolean))], random);
        for (const color of choices) {
          regions[i] = color;
          if (connected(regions, 0, n) && solver.solve(regions, n).length === 1) { changed = true; break; }
          regions[i] = 0;
        }
      }
      if (!changed) break;
    }
    return { n, regions, solution };
  }
  root.CatGenerator = { generate, connected };
  if (typeof module !== 'undefined') module.exports = root.CatGenerator;
})(globalThis);
