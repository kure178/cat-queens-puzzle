(function (root) {
  'use strict';
  const EMPTY = 0, CROSS = 1, CAT = 2;
  function evaluate(puzzle, cells) {
    const { n, regions } = puzzle, cats = [], conflicts = new Set();
    cells.forEach((value, i) => { if (value === CAT) cats.push(i); });
    for (let a = 0; a < cats.length; a++) for (let b = a + 1; b < cats.length; b++) {
      const i = cats[a], j = cats[b], dr = Math.abs(Math.floor(i / n) - Math.floor(j / n)), dc = Math.abs(i % n - j % n);
      if (dr === 0 || dc === 0 || regions[i] === regions[j] || (dr <= 1 && dc <= 1)) { conflicts.add(i); conflicts.add(j); }
    }
    return { count: cats.length, conflicts, complete: cats.length === n && conflicts.size === 0 };
  }
  class Game {
    constructor(puzzle) { this.puzzle = puzzle; this.cells = Array(puzzle.n ** 2).fill(EMPTY); this.history = []; }
    apply(changes) {
      const before = [...this.cells];
      for (const [index, value] of changes) if (Number.isInteger(index) && index >= 0 && index < this.cells.length && [EMPTY, CROSS, CAT].includes(value)) this.cells[index] = value;
      if (before.some((v, i) => v !== this.cells[i])) this.history.push(before);
    }
    undo() { if (this.history.length) this.cells = this.history.pop(); }
    reset() { this.apply(this.cells.map((_, i) => [i, EMPTY])); }
    get result() { return evaluate(this.puzzle, this.cells); }
  }
  root.CatGame = { Game, evaluate, EMPTY, CROSS, CAT };
  if (typeof module !== 'undefined') module.exports = root.CatGame;
})(globalThis);
