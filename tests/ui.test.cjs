const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const CatGame = require('../js/game.js');
const CatShare = require('../js/share.js');
let fixture;
const fixturePromise = require('../js/generator.js').generate(5).then(result => fixture = result.puzzle);

// Drive the real UI handlers with deterministic timers and a small DOM adapter.
async function setup(hash = '', runOverride) {
  await fixturePromise;
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.events = {}; this.styles = {}; this.attributes = {};
      this.classList = { toggle() {}, add() {} };
      this.style = { setProperty: (k, v) => this.styles[k] = v };
    }
    append(...items) { this.children.push(...items); }
    replaceChildren() { this.children = []; }
    add(option) { if (!this.value) this.value = option.value; }
    setAttribute(key, value) { this.attributes[key] = value; }
    setPointerCapture() {}
    closest() { return this.className === 'cell' ? this : null; }
    querySelector(selector) { return this.children.find(c => c.className === selector.slice(1)); }
    addEventListener(name, handler) { this.events[name] = handler; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 250, bottom: 250, width: 250, height: 250 }; }
  }
  const elements = Object.fromEntries(['board', 'size', 'count', 'status', 'undo', 'reset', 'new', 'success', 'share', 'share-output', 'share-value', 'share-note', 'share-status', 'copy-share', 'import', 'import-value', 'mode', 'mode-note', 'generation', 'generation-status', 'cancel', 'current-mode'].map(id => [id, new Element()]));
  const timers = new Map(); let timerId = 0, game, randomValue = 0.25;
  const context = {
    CatGame: { ...CatGame, Game: class extends CatGame.Game { constructor(p) { super(p); game = this; } } },
    CatGeneration: { run: runOverride || (async (n, { mode }) => ({ puzzle: { ...fixture, mode } })) }, CatShare, URL, URLSearchParams, AbortController,
    document: { querySelector: s => elements[s.slice(1)], querySelectorAll: () => [], createElement: () => new Element() },
    Option: function (_, value) { this.value = value; },
    location: { protocol: 'file:', hash }, console,
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
test('share excludes moves and opens the same problem with an empty board', async () => {
  const sender = await setup(); sender.stroke(0, 4); sender.tap(6); sender.tap(6);
  sender.elements.share.events.click();
  const code = sender.elements['share-value'].value;
  const recipient = await setup(`#p=${code}`);
  assert.equal(CatShare.encode(recipient.game.puzzle), CatShare.encode(sender.game.puzzle));
  assert.ok(recipient.game.cells.every(c => c === 0));
  assert.equal(recipient.game.history.length, 0);
  sender.elements.reset.events.click(); sender.elements.share.events.click();
  assert.equal(sender.elements['share-value'].value, code);
});
test('invalid import preserves existing progress; valid import starts over', async () => {
  const ui = await setup(); ui.stroke(0, 4);
  const before = [...ui.game.cells];
  ui.elements['import-value'].value = 'CQ1-12-broken';
  ui.elements.import.events.click(); await ui.tick();
  assert.deepEqual(ui.game.cells, before);
  assert.match(ui.elements['share-status'].textContent, /読み込めませんでした/);
  ui.elements['import-value'].value = CatShare.encode(fixture);
  ui.elements.import.events.click(); await ui.tick();
  assert.ok(ui.game.cells.every(c => c === 0));
});
test('invalid initial URL reports an error and allows a new puzzle', async () => {
  const ui = await setup('#p=invalid');
  assert.equal(ui.game, undefined);
  assert.equal(ui.elements.share.disabled, true);
  ui.elements.new.events.click(); await ui.tick();
  assert.ok(ui.game);
});
test('region IDs remain internal and are absent from visible and spoken labels', async () => {
  const ui = await setup();
  for (const cell of ui.elements.board.children) {
    assert.equal(cell.querySelector('.region'), undefined);
    assert.doesNotMatch(cell.attributes['aria-label'], /領域/);
  }
  fixture.solution.forEach((col, row) => assert.equal(ui.game.puzzle.regions[row * 5 + col], row));
});
test('mode changes apply only to the next puzzle', async () => {
  const ui = await setup(); const before = ui.game;
  ui.elements.mode.value = 'Balanced'; ui.elements.mode.events.change();
  assert.equal(ui.game, before); assert.match(ui.elements['current-mode'].textContent, /RandomSnake/);
  ui.elements.new.events.click(); await ui.tick();
  assert.equal(ui.game.puzzle.mode, 'Balanced'); assert.match(ui.elements['current-mode'].textContent, /Balanced/);
  ui.elements.mode.value = 'SeedGrowth'; ui.elements.size.events.change(); await ui.tick();
  assert.equal(ui.game.puzzle.mode, 'SeedGrowth');
});
test('cancel and late completion preserve inputs and a newer request wins', async () => {
  const jobs = []; let calls = 0;
  const ui = await setup('', async (n, options) => {
    if (++calls === 1) return { puzzle: { ...fixture, mode: options.mode } };
    return new Promise(resolve => jobs.push({ resolve, options }));
  });
  ui.stroke(0, 4); const before = ui.game;
  ui.elements.new.events.click(); const oldTick = ui.tick();
  jobs[0].options.onProgress({ elapsedMs: 1200 });
  assert.match(ui.elements['generation-status'].textContent, /1.2秒/);
  ui.elements.cancel.events.click();
  assert.equal(ui.game, before); assert.ok(before.cells.includes(1)); assert.ok(jobs[0].options.signal.aborted);
  ui.elements.mode.value = 'Balanced'; ui.elements.new.events.click(); const newTick = ui.tick();
  jobs[1].resolve({ puzzle: { ...fixture, mode: 'Balanced' } }); await newTick;
  jobs[0].resolve({ puzzle: { ...fixture, mode: 'RandomSnake' } }); await oldTick;
  assert.equal(ui.game.puzzle.mode, 'Balanced'); assert.ok(ui.game.cells.every(c => c === 0));
});
test('generation failure preserves the old board and current mode', async () => {
  let calls = 0;
  const ui = await setup('', async (n, options) => {
    if (++calls > 1) throw new Error('生成の上限に達しました。');
    return { puzzle: { ...fixture, mode: options.mode } };
  });
  ui.stroke(0, 4); const before = ui.game;
  ui.elements.mode.value = 'SeedGrowth'; ui.elements.new.events.click(); await ui.tick();
  assert.equal(ui.game, before); assert.ok(before.cells.includes(1));
  assert.match(ui.elements['share-status'].textContent, /上限/);
  assert.match(ui.elements['current-mode'].textContent, /RandomSnake/);
  assert.equal(ui.elements.generation.hidden, true);
});
