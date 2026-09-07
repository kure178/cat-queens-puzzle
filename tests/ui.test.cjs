const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const CatGame = require('../js/game.js');

// Drive the real UI handlers with deterministic timers and a small DOM adapter.
async function setup() {
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.events = {}; this.styles = {};
      this.classList = { toggle() {}, add() {} };
      this.style = { setProperty: (k, v) => this.styles[k] = v };
    }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    add(option) { if (!this.value) this.value = option.value; }
    setAttribute() {}
    setPointerCapture() {}
    closest() { return this.className === 'cell' ? this : null; }
    querySelector(selector) { return this.children.find(c => c.className === selector.slice(1)); }
    addEventListener(name, handler) { this.events[name] = handler; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 250, bottom: 250, width: 250, height: 250 }; }
  }
  const elements = Object.fromEntries(['board', 'size', 'count', 'status', 'undo', 'reset', 'new', 'success'].map(id => [id, new Element()]));
  const timers = new Map(); let timerId = 0, game, randomValue = 0.25;
  const context = {
    CatGame: { ...CatGame, Game: class extends CatGame.Game { constructor(p) { super(p); game = this; } } },
    CatGenerator: { generate: () => ({ n: 5, regions: Array.from({ length: 25 }, (_, i) => Math.floor(i / 5)) }) },
    document: { querySelector: s => elements[s.slice(1)], querySelectorAll: () => [], createElement: () => new Element() },
    Option: function (_, value) { this.value = value; },
    location: { protocol: 'file:' }, console,
    Math: Object.assign(Object.create(Math), { random: () => randomValue }),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'), 'utf8'), context);
  async function tick() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) await fn(); }
  await tick();
  function pointer(name, index) {
    elements.board.events[name]({ target: elements.board.children[index], pointerId: 1, isPrimary: true, button: 0, clientX: (index % 5) * 50 + 25, clientY: Math.floor(index / 5) * 50 + 25, preventDefault() {} });
  }
  const tap = i => { pointer('pointerdown', i); pointer('pointerup', i); };
  const stroke = (from, to) => { pointer('pointerdown', from); pointer('pointermove', to); pointer('pointerup', to); };
  return { elements, tick, tap, stroke, pointer, get game() { return game; }, setRandom: v => randomValue = v };
}

test('double tapping a cross is blocked; clearing it first permits a cat', async () => {
  const ui = await setup();
  ui.tap(0); await ui.tick(); assert.equal(ui.game.cells[0], CatGame.CROSS);
  ui.tap(0); ui.tap(0); await ui.tick(); assert.equal(ui.game.cells[0], CatGame.CROSS);
  ui.tap(0); await ui.tick(); assert.equal(ui.game.cells[0], CatGame.EMPTY);
  ui.tap(0); ui.tap(0); assert.equal(ui.game.cells[0], CatGame.CAT);
  ui.tap(0); ui.tap(0); assert.equal(ui.game.cells[0], CatGame.EMPTY);
});
test('draw and erase strokes preserve cats and undo as a single action', async () => {
  const ui = await setup();
  ui.tap(2); ui.tap(2);
  ui.stroke(0, 4);
  assert.deepEqual(ui.game.cells.slice(0, 5), [1, 1, 2, 1, 1]);
  ui.stroke(4, 0);
  assert.deepEqual(ui.game.cells.slice(0, 5), [0, 0, 2, 0, 0]);
  ui.elements.undo.events.click();
  assert.deepEqual(ui.game.cells.slice(0, 5), [1, 1, 2, 1, 1]);
});
test('cancelled erasing restores marks without changing the board', async () => {
  const ui = await setup(); ui.stroke(0, 4);
  ui.pointer('pointerdown', 0); ui.pointer('pointermove', 4);
  ui.elements.board.events.pointercancel();
  assert.deepEqual(ui.game.cells.slice(0, 5), [1, 1, 1, 1, 1]);
  assert.equal(ui.elements.board.children[0].querySelector('.mark').textContent, '×');
});
test('palette assignment changes on a new puzzle, not on board clear; no keyboard handler', async () => {
  const ui = await setup();
  const colors = () => ui.elements.board.children.map(b => b.styles['--color']);
  const before = colors();
  ui.stroke(0, 4); ui.elements.reset.events.click();
  assert.ok(ui.game.cells.every(c => c === 0)); assert.deepEqual(colors(), before);
  ui.setRandom(0.75); ui.elements.new.events.click(); await ui.tick();
  assert.notDeepEqual(colors(), before);
  assert.equal(new Set(colors()).size, 5);
  assert.equal(ui.elements.board.events.keydown, undefined);
});
