(function (root) {
  'use strict';
  const solver = typeof module !== 'undefined' ? require('./solver.js') : root.CatSolver;
  const MODES = ['RandomSnake', 'Balanced', 'SeedGrowth'];
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
  function placeCats(n, random) {
    const columns = Array.from({ length: n }, (_, i) => i);
    for (let attempt = 0; attempt < 64; attempt++) {
      const solution = shuffled(columns, random);
      if (solution.every((col, row) => row === 0 || Math.abs(col - solution[row - 1]) > 1)) return solution;
    }
    // For n >= 5, even columns followed by odd columns also satisfy adjacency.
    let solution = [...columns.filter(c => c % 2 === 0), ...columns.filter(c => c % 2 === 1)];
    if (random() < 0.5) solution.reverse();
    if (random() < 0.5) solution = solution.map(c => n - 1 - c);
    return solution;
  }
  async function generate(n, options = {}) {
    const { mode = 'RandomSnake', random = Math.random, signal, onProgress,
      budgetMs = mode === 'SeedGrowth' ? 30000 : 500, maxEvaluations = 3 * n * n,
      maxAttempts = 200, now = () => performance.now(),
      yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = options;
    if (!Number.isInteger(n) || n < 5 || n > 12) throw new RangeError('Size must be 5–12');
    if (!MODES.includes(mode)) throw new RangeError('Unknown generation mode');
    if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new RangeError('Invalid budget');
    const start = now(); let deadline = start + budgetMs, lastYield = start, lastProgress = -Infinity;
    const metrics = { elapsedMs: 0, evaluations: 0, nodes: 0, attempts: 0, accepted: 0, stopReason: 'complete' };
    function abortCheck() {
      if (signal?.aborted) { const error = new Error('生成をキャンセルしました。'); error.name = 'AbortError'; throw error; }
    }
    async function checkpoint() {
      abortCheck();
      let time = now();
      if (time - lastProgress >= 100) { onProgress?.({ mode, elapsedMs: time - start }); lastProgress = time; }
      if (time - lastYield >= 8) { await yieldControl(); lastYield = now(); abortCheck(); time = lastYield; }
      return time < deadline;
    }
    async function unique(regions) {
      metrics.evaluations++;
      const result = await solver.solveBudgeted(regions, n, { checkpoint });
      metrics.nodes += result.nodes;
      return result.status === 'complete' ? result.solutions.length === 1 : null;
    }
    function finish(regions, solution) {
      abortCheck(); metrics.elapsedMs = now() - start;
      onProgress?.({ mode, elapsedMs: metrics.elapsedMs });
      return { puzzle: { n, regions, solution, mode }, metrics };
    }
    function timeout() {
      const error = new Error('生成の上限に達しました。再試行するか、別のスタイルを選んでください。');
      error.name = 'GenerationTimeoutError'; metrics.elapsedMs = now() - start; error.metrics = metrics; throw error;
    }
    abortCheck();
    const indices = Array.from({ length: n * n }, (_, i) => i);
    const adjacent = indices.map(i => neighbors(i, n));
    if (mode === 'SeedGrowth') {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!(await checkpoint())) { metrics.stopReason = 'deadline'; timeout(); }
        metrics.attempts++;
        const solution = placeCats(n, random), regions = Array(n * n).fill(-1);
        solution.forEach((col, row) => { regions[row * n + col] = row; });
        let remaining = n * n - n;
        while (remaining) {
          let changed = false;
          for (const i of shuffled(indices, random)) {
            if (!(await checkpoint())) { metrics.stopReason = 'deadline'; timeout(); }
            if (regions[i] !== -1) continue;
            const choices = shuffled([...new Set(adjacent[i].map(j => regions[j]).filter(id => id >= 0))], random);
            for (const color of choices) {
              regions[i] = color;
              const valid = await unique(regions);
              if (valid === true) { remaining--; changed = true; metrics.accepted++; break; }
              regions[i] = -1;
              if (valid === null) { metrics.stopReason = 'deadline'; timeout(); }
            }
          }
          if (!changed) break;
        }
        if (!remaining) return finish(regions, solution);
      }
      metrics.stopReason = 'attempts'; timeout();
    }
    const solution = placeCats(n, random), regions = Array(n * n).fill(-1);
    const seeds = new Set(solution.map((col, row) => row * n + col));
    solution.forEach((col, row) => { regions[row * n + col] = row; });
    const owner = Math.floor(random() * n);
    for (const i of indices) if (regions[i] === -1) regions[i] = owner;
    // All other cats are forced by singleton regions; the remaining row and
    // column force the owner cat. Non-adjacent singleton holes cannot disconnect it.
    const areas = Array(n).fill(1); areas[owner] = n * n - n + 1;
    const floor = mode === 'RandomSnake' ? Math.ceil(n * n * 0.3) : 1;
    metrics.attempts = 1;
    deadline = now() + budgetMs;
    const rejected = new Set();
    while (metrics.evaluations < maxEvaluations && areas[owner] > floor) {
      if (!(await checkpoint())) { metrics.stopReason = 'deadline'; break; }
      const candidates = [];
      for (const i of indices) {
        if (regions[i] !== owner || seeds.has(i)) continue;
        for (const color of new Set(adjacent[i].map(j => regions[j]))) {
          if (color !== owner && !rejected.has(`${i}:${color}`)) candidates.push([i, color]);
        }
      }
      if (!candidates.length) break;
      const ordered = shuffled(candidates, random);
      if (mode === 'Balanced') ordered.sort((a, b) => areas[a[1]] - areas[b[1]]);
      const [i, color] = ordered[0];
      regions[i] = color;
      // Count connectivity failures against the same candidate budget.
      let valid;
      if (!connected(regions, owner, n)) { metrics.evaluations++; valid = false; }
      else valid = await unique(regions);
      if (valid === true) { areas[owner]--; areas[color]++; metrics.accepted++; }
      else { regions[i] = owner; rejected.add(`${i}:${color}`); }
      if (valid === null) { metrics.stopReason = 'deadline'; break; }
    }
    if (metrics.evaluations >= maxEvaluations) metrics.stopReason = 'evaluations';
    return finish(regions, solution);
  }
  root.CatGenerator = { generate, connected, MODES };
  if (typeof module !== 'undefined') module.exports = root.CatGenerator;
})(globalThis);
