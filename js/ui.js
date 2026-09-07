/* DOM and pointer handling only. Puzzle rules live in game.js. */
(() => {
  'use strict';
  const { Game, EMPTY, CROSS, CAT } = CatGame;
  const board = document.querySelector('#board'), size = document.querySelector('#size');
  const palette = ['#d9d9ee','#f0d4bb','#c7dfd0','#f0e5ac','#e8c7d4','#c3dce7','#dbdfb9','#d2c5df','#bce0dd','#eebfb8','#cbd3e8','#e5d8c3'];
  let game, buttons = [], gesture = null, pending = null, busy = false;
  for (let n = 5; n <= 12; n++) size.add(new Option(`${n} × ${n}`, n));
  function render() {
    const result = game.result;
    buttons.forEach((button, i) => {
      const value = game.cells[i];
      button.querySelector('.mark').textContent = value === CAT ? '🐱' : value === CROSS ? '×' : '';
      button.classList.toggle('cross', value === CROSS);
      button.classList.toggle('conflict', result.conflicts.has(i));
      button.setAttribute('aria-label', `${Math.floor(i / game.puzzle.n) + 1}行 ${i % game.puzzle.n + 1}列 領域${game.puzzle.regions[i] + 1}：${value === CAT ? '猫' : value === CROSS ? 'バツ' : '空白'}${result.conflicts.has(i) ? '、ルール違反' : ''}`);
    });
    document.querySelector('#count').textContent = `猫 ${result.count} / ${game.puzzle.n}`;
    document.querySelector('#status').textContent = result.complete ? 'クリア！' : result.conflicts.size ? '赤枠の猫を確認してね' : '猫の居場所を探そう';
    document.querySelector('#success').hidden = !result.complete;
    document.querySelector('#undo').disabled = !game.history.length;
  }
  function cancelPending() { if (pending) clearTimeout(pending.timer); pending = null; }
  function flushPending() {
    if (!pending) return;
    const i = pending.index; cancelPending();
    game.apply([[i, game.cells[i] === EMPTY ? CROSS : EMPTY]]); render();
  }
  function tap(i) {
    if (pending && pending.index === i) {
      cancelPending();
      if (game.cells[i] !== CROSS) game.apply([[i, game.cells[i] === CAT ? EMPTY : CAT]]);
      render();
    } else {
      flushPending(); pending = { index: i, timer: setTimeout(flushPending, 300) };
    }
  }
  function mount() {
    board.replaceChildren(); buttons = [];
    const { n, regions } = game.puzzle;
    const colors = [...palette];
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    board.style.setProperty('--n', n);
    regions.forEach((region, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cell'; button.dataset.index = i;
      button.style.setProperty('--color', colors[region]); button.tabIndex = -1;
      if (i % n < n - 1 && regions[i + 1] !== region) button.classList.add('edge-right');
      if (i + n < n * n && regions[i + n] !== region) button.classList.add('edge-bottom');
      const label = document.createElement('span'); label.className = 'region'; label.textContent = region + 1; label.setAttribute('aria-hidden', 'true');
      const mark = document.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true');
      button.append(label, mark); board.append(button); buttons.push(button);
    });
    render();
  }
  function generatePuzzle(n) {
    // File URLs may prohibit workers; direct-file play still has a local fallback.
    if (location.protocol === 'file:' || typeof Worker === 'undefined') return Promise.resolve().then(() => CatGenerator.generate(n));
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker('./js/generator-worker.js'); }
      catch { resolve(CatGenerator.generate(n)); return; }
      worker.onmessage = ({ data }) => { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data); };
      worker.onerror = () => { worker.terminate(); try { resolve(CatGenerator.generate(n)); } catch (error) { reject(error); } };
      worker.postMessage(n);
    });
  }
  function newPuzzle() {
    if (busy) return;
    cancelPending(); gesture = null; busy = true;
    document.querySelector('#status').textContent = 'パズルを作っています…';
    board.setAttribute('aria-busy', 'true');
    document.querySelectorAll('.toolbar button, select, .actions button').forEach(b => b.disabled = true);
    setTimeout(async () => {
      try { game = new Game(await generatePuzzle(Number(size.value))); mount(); }
      catch (error) { document.querySelector('#status').textContent = '生成できませんでした。もう一度お試しください。'; console.error(error); }
      finally {
        busy = false; board.setAttribute('aria-busy', 'false');
        document.querySelectorAll('.toolbar button, select, .actions button').forEach(b => b.disabled = false);
        document.querySelector('#undo').disabled = !game?.history.length;
      }
    }, 30);
  }
  function at(x, y) {
    const rect = board.getBoundingClientRect(), n = game.puzzle.n;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return -1;
    return Math.floor((y - rect.top) / rect.height * n) * n + Math.floor((x - rect.left) / rect.width * n);
  }
  board.addEventListener('pointerdown', event => {
    if (busy || gesture || !event.isPrimary || event.button !== 0) return;
    const button = event.target.closest('.cell'); if (!button) return;
    const index = Number(button.dataset.index);
    if (pending && pending.index !== index) flushPending();
    const source = game.cells[index];
    gesture = { id: event.pointerId, index, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, drag: false, source, target: source === CROSS ? EMPTY : CROSS, visited: new Set() };
    board.setPointerCapture(event.pointerId); event.preventDefault();
  });
  board.addEventListener('pointermove', event => {
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8 && at(event.clientX, event.clientY) !== g.index) {
      if (!g.drag) { cancelPending(); g.drag = true; }
    }
    if (g.drag && g.source !== CAT) {
      const steps = Math.max(1, Math.ceil(Math.hypot(event.clientX - g.lastX, event.clientY - g.lastY) / 4));
      for (let s = 0; s <= steps; s++) {
        const i = at(g.lastX + (event.clientX - g.lastX) * s / steps, g.lastY + (event.clientY - g.lastY) * s / steps);
        if (i >= 0 && game.cells[i] === g.source) {
          g.visited.add(i);
          buttons[i].querySelector('.mark').textContent = g.target === CROSS ? '×' : '';
          buttons[i].classList.toggle('cross', g.target === CROSS);
        }
      }
    }
    if (g.drag) { g.lastX = event.clientX; g.lastY = event.clientY; }
  });
  board.addEventListener('pointerup', event => {
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    gesture = null;
    if (g.drag) { game.apply([...g.visited].map(i => [i, g.target])); render(); }
    else if (at(event.clientX, event.clientY) === g.index) tap(g.index);
  });
  for (const name of ['pointercancel', 'lostpointercapture']) board.addEventListener(name, () => { if (gesture) { gesture = null; render(); } });
  board.addEventListener('contextmenu', event => event.preventDefault());
  board.addEventListener('dblclick', event => event.preventDefault());
  board.addEventListener('click', event => {
    // Support assistive-technology activation without duplicating pointer input.
    if (event.detail === 0 && !busy && event.target.closest('.cell')) tap(Number(event.target.closest('.cell').dataset.index));
  });
  document.querySelector('#new').addEventListener('click', newPuzzle);
  size.addEventListener('change', newPuzzle);
  document.querySelector('#undo').addEventListener('click', () => { flushPending(); game.undo(); render(); });
  document.querySelector('#reset').addEventListener('click', () => { flushPending(); game.reset(); render(); });
  newPuzzle();
})();
