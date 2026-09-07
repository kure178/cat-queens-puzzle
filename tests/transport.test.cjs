const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../js/generation-client.js'), 'utf8');
function setup({ protocol = 'https:', fail = false, noWorker = false } = {}) {
  let worker, fallback = 0;
  const context = { location: { protocol }, CatGenerator: { generate: async (n, options) => { fallback++; return { n, mode: options.mode }; } } };
  if (!noWorker) context.Worker = class {
    constructor() { if (fail) throw Error('Unavailable'); worker = this; }
    terminate() { this.terminated = true; }
    postMessage(data) { this.sent = data; }
  };
  vm.runInNewContext(source, context);
  return { run: context.CatGeneration.run, get worker() { return worker; }, get fallback() { return fallback; } };
}
test('worker request IDs isolate progress and results', async () => {
  const client = setup(), progress = [], signal = new AbortController().signal;
  const pending = client.run(12, { mode: 'Balanced', requestId: 7, signal, onProgress: p => progress.push(p) });
  assert.equal(client.worker.sent.mode, 'Balanced');
  client.worker.onmessage({ data: { requestId: 6, type: 'result', result: 'stale' } });
  client.worker.onmessage({ data: { requestId: 7, type: 'progress', progress: 123 } });
  client.worker.onmessage({ data: { requestId: 7, type: 'result', result: 'current' } });
  assert.equal(await pending, 'current'); assert.deepEqual(progress, [123]); assert.ok(client.worker.terminated);
});
test('worker cancellation terminates work and ignores late messages', async () => {
  const client = setup(), controller = new AbortController();
  const pending = client.run(12, { mode: 'SeedGrowth', requestId: 1, signal: controller.signal });
  controller.abort();
  client.worker.onmessage({ data: { requestId: 1, type: 'result', result: 'late' } });
  await assert.rejects(pending, { name: 'AbortError' }); assert.ok(client.worker.terminated);
});
test('direct-file, missing worker, startup errors use async fallback', async () => {
  for (const options of [{ protocol: 'file:' }, { noWorker: true }, { fail: true }]) {
    const client = setup(options);
    assert.equal((await client.run(5, { mode: 'Balanced' })).mode, 'Balanced'); assert.equal(client.fallback, 1);
  }
  const client = setup(); const pending = client.run(5, { mode: 'Balanced', requestId: 2 });
  client.worker.onerror(); await pending; assert.equal(client.fallback, 1); assert.ok(client.worker.terminated);
});
test('worker timeout is reported and does not silently change modes', async () => {
  const client = setup(); const pending = client.run(12, { mode: 'SeedGrowth', requestId: 1 });
  client.worker.onmessage({ data: { type: 'error', requestId: 1, name: 'GenerationTimeoutError', message: 'timeout' } });
  await assert.rejects(pending, { name: 'GenerationTimeoutError' }); assert.equal(client.fallback, 0);
});
test('worker entrypoint executes browser scripts and separates progress from the result', async () => {
  const messages = [];
  const context = { performance, setTimeout, self: { postMessage: message => messages.push(message) } };
  vm.createContext(context);
  context.importScripts = (...paths) => {
    for (const path of paths) vm.runInContext(fs.readFileSync(require.resolve('../js/' + path.slice(2)), 'utf8'), context);
  };
  vm.runInContext(fs.readFileSync(require.resolve('../js/generator-worker.js'), 'utf8'), context);
  await context.self.onmessage({ data: { n: 5, mode: 'Balanced', requestId: 19 } });
  assert.ok(messages.some(message => message.type === 'progress'));
  const result = messages.find(message => message.type === 'result');
  assert.equal(result.requestId, 19); assert.equal(result.result.puzzle.mode, 'Balanced');
  assert.equal(result.result.puzzle.metrics, undefined); assert.ok(result.result.metrics.elapsedMs >= 0);
});
