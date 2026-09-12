/* DOM and pointer handling only. Puzzle rules live in game.js. */
(() => {
  'use strict';
  const { Game, EMPTY, CROSS, CAT } = CatGame;
  const DOUBLE_TAP_MS = 300, CROSS_DISPLAY_MS = 180;
  const board = document.querySelector('#board'), size = document.querySelector('#size');
  const palette = ['#d9d9ee','#f0d4bb','#c7dfd0','#f0e5ac','#e8c7d4','#c3dce7','#dbdfb9','#d2c5df','#bce0dd','#eebfb8','#cbd3e8','#e5d8c3'];
  let game, buttons = [], gesture = null, pending = null, busy = false;
  for (let n = 5; n <= 12; n++) size.add(new Option(`${n} × ${n}`, n));
  function render() {
    const result = game.result;
    buttons.forEach((button, i) => {
      const value = game.cells[i];
      const hideCross = pending?.index === i && pending.hideCross;
      button.querySelector('.mark').textContent = value === CAT ? '🐱' : value === CROSS && !hideCross ? '×' : '';
      button.classList.toggle('cross', value === CROSS);
      button.classList.toggle('conflict', result.conflicts.has(i));
      button.setAttribute('aria-label', `${Math.floor(i / game.puzzle.n) + 1}行 ${i % game.puzzle.n + 1}列：${value === CAT ? '猫' : value === CROSS ? 'バツ' : '空白'}${result.conflicts.has(i) ? '、ルール違反' : ''}`);
    });
    document.querySelector('#count').textContent = `猫 ${result.count} / ${game.puzzle.n}`;
    document.querySelector('#status').textContent = result.complete ? 'クリア！' : result.conflicts.size ? '赤枠の猫を確認してね' : '猫の居場所を探そう';
    document.querySelector('#success').hidden = !result.complete;
    document.querySelector('#undo').disabled = !game.history.length;
    document.querySelector('#redo').disabled = !game.future.length;
  }
  function cancelPending() {
    if (pending) { clearTimeout(pending.timer); clearTimeout(pending.displayTimer); }
    pending = null;
  }
  function tap(i) {
    if (pending && pending.index === i) {
      const { source, future } = pending;
      cancelPending();
      // Replace the immediate single tap so a double tap remains one undo step.
      game.undo();
      game.future = future;
      if (source !== CROSS) game.apply([[i, source === CAT ? EMPTY : CAT]]);
    } else {
      cancelPending();
      const source = game.cells[i];
      const future = [...game.future];
      game.apply([[i, source === EMPTY ? CROSS : EMPTY]]);
      // Keep recognition separate from the short visual delay for a new cross.
      pending = { index: i, source, future, hideCross: source === EMPTY,
        timer: setTimeout(cancelPending, DOUBLE_TAP_MS) };
      if (pending.hideCross) pending.displayTimer = setTimeout(() => {
        pending.hideCross = false; render();
      }, CROSS_DISPLAY_MS);
    }
    render();
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
      const mark = document.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true');
      button.append(mark); board.append(button); buttons.push(button);
    });
    render();
  }
  const modeSelect = document.querySelector('#mode');
  const descriptions = {
    RandomSnake: '広い領域を残して形を作ります。調整は最大0.5秒。端末により待ち時間は変わります。',
    Balanced: '小さな領域を優先して広げます。調整は最大0.5秒。端末により待ち時間は変わります。',
    SeedGrowth: '各猫から領域を広げます。最大30秒かかり、完成しない場合もあります。'
  };
  modeSelect.value = 'RandomSnake';
  function describeMode() { document.querySelector('#mode-note').textContent = descriptions[modeSelect.value]; }
  modeSelect.addEventListener('change', describeMode);
  describeMode();
  let requestId = 0, active = null;
  function setBusy(value) {
    busy = value; board.setAttribute('aria-busy', String(value));
    document.querySelector('#generation').hidden = !value;
    document.querySelectorAll('.puzzle-menu button, select, .actions button').forEach(b => b.disabled = value);
    if (!value) {
      document.querySelector('#undo').disabled = !game?.history.length;
      document.querySelector('#redo').disabled = !game?.future.length;
      document.querySelector('#reset').disabled = !game;
      document.querySelector('#share').disabled = !game;
    }
  }
  function cancelGeneration() {
    if (!active) return;
    active.controller.abort(); active = null; requestId++;
    setBusy(false);
    if (game) { size.value = String(game.puzzle.n); render(); }
    else document.querySelector('#status').textContent = '新しいパズルを作ってください。';
    document.querySelector('#share-status').textContent = '生成をキャンセルしました。';
  }
  document.querySelector('#cancel').addEventListener('click', cancelGeneration);
  function newPuzzle(shared = null) {
    // A new request supersedes any pending work, even if delivered programmatically.
    active?.controller.abort();
    cancelPending();
    gesture = null;
    if (game) render();
    const id = ++requestId, controller = new AbortController();
    const n = Number(size.value), mode = modeSelect.value;
    active = { id, controller }; setBusy(true);
    document.querySelector('#generation-status').textContent = shared === null ? `${mode} · 0.0秒` : '共有された問題を確認しています…';
    setTimeout(async () => {
      if (id !== requestId) return;
      try {
        const result = shared === null ? await CatGeneration.run(n, { mode, signal: controller.signal, requestId: id,
          onProgress: progress => {
            if (id === requestId) document.querySelector('#generation-status').textContent = `${mode} · ${(progress.elapsedMs / 1000).toFixed(1)}秒`;
          } }) : { puzzle: CatShare.decode(shared) };
        if (id !== requestId || controller.signal.aborted) return;
        const puzzle = result.puzzle;
        game = new Game(puzzle); size.value = String(puzzle.n); mount();
        document.querySelector('#current-mode').textContent = shared === null ? `この問題：${puzzle.mode}` : '共有された問題';
        document.querySelector('#share-output').hidden = true;
        document.querySelector('#share-status').textContent = shared === null ? '' : '共有された問題を読み込みました。最初から遊べます。';
        if (location.protocol !== 'file:') {
          const url = new URL(location.href);
          url.hash = shared === null ? '' : new URLSearchParams({ p: CatShare.encode(puzzle) }).toString();
          try { history.replaceState(null, '', url.href); } catch { /* Sharing still works without history access. */ }
        }
      } catch (error) {
        if (id !== requestId) return;
        if (game) { size.value = String(game.puzzle.n); render(); }
        else document.querySelector('#status').textContent = '新しいパズルを作るか、別の共有データを入力してください。';
        document.querySelector('#share-status').textContent = shared === null ? error.message : `読み込めませんでした：${error.message}`;
      } finally {
        if (id === requestId) { active = null; setBusy(false); }
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
    if (pending && pending.index !== index) { cancelPending(); render(); }
    const source = game.cells[index];
    gesture = { id: event.pointerId, index, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, drag: false, source, target: source === CROSS ? EMPTY : CROSS, visited: new Set() };
    board.setPointerCapture(event.pointerId); event.preventDefault();
  });
  board.addEventListener('pointermove', event => {
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 8 && at(event.clientX, event.clientY) !== g.index) {
      if (!g.drag) { cancelPending(); render(); g.drag = true; }
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
  function startFromMenu(shared = null) {
    document.querySelector('#puzzle-menu').open = false;
    newPuzzle(shared);
  }
  document.querySelector('#new').addEventListener('click', () => startFromMenu());
  size.addEventListener('change', () => newPuzzle());
  document.querySelector('#undo').addEventListener('click', () => { cancelPending(); game.undo(); render(); });
  document.querySelector('#redo').addEventListener('click', () => { cancelPending(); game.redo(); render(); });
  document.querySelector('#reset').addEventListener('click', () => { cancelPending(); game.reset(); render(); });
  document.querySelector('#share').addEventListener('click', () => {
    if (busy || !game) return;
    const local = location.protocol === 'file:';
    document.querySelector('#share-value').value = local ? CatShare.encode(game.puzzle) : CatShare.link(game.puzzle, location.href);
    document.querySelector('#share-output').hidden = false;
    document.querySelector('#share-note').textContent = local
      ? 'このコードを相手の「共有された問題を開く」に貼り付けてください。'
      : 'このURLを開くと、同じ問題を最初から遊べます。';
    document.querySelector('#share-status').textContent = '答え・入力済みの猫や×・色の割り当ては含まれません。';
  });
  document.querySelector('#copy-share').addEventListener('click', async () => {
    const field = document.querySelector('#share-value');
    try {
      await navigator.clipboard.writeText(field.value);
      document.querySelector('#share-status').textContent = 'コピーしました。相手に送ってください。';
    } catch {
      field.focus(); field.select();
      document.querySelector('#share-status').textContent = 'コピーできなかったため選択しました。選択した文字列をコピーしてください。';
    }
  });
  document.querySelector('#import').addEventListener('click', () => startFromMenu(document.querySelector('#import-value').value));
  const initial = new URLSearchParams(location.hash.slice(1)).get('p');
  newPuzzle(initial);
})();
