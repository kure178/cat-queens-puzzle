/* Worker transport; direct-file and unavailable-worker paths use the same async API. */
(function (root) {
  'use strict';
  function run(n, { mode, signal, onProgress, requestId }) {
    const fallback = () => root.CatGenerator.generate(n, { mode, signal, onProgress });
    if (root.location.protocol === 'file:' || typeof root.Worker === 'undefined') return fallback();
    return new Promise((resolve, reject) => {
      let worker, settled = false;
      const cleanup = () => { worker?.terminate(); signal?.removeEventListener('abort', abort); };
      const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
      const abort = () => { const error = new Error('生成をキャンセルしました。'); error.name = 'AbortError'; finish(reject, error); };
      if (signal?.aborted) { abort(); return; }
      try { worker = new root.Worker('./js/generator-worker.js'); }
      catch { fallback().then(resolve, reject); return; }
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (settled || data.requestId !== requestId) return;
        if (data.type === 'progress') onProgress?.(data.progress);
        else if (data.type === 'result') finish(resolve, data.result);
        else if (data.type === 'error') {
          const error = new Error(data.message); error.name = data.name; error.metrics = data.metrics;
          finish(reject, error);
        }
      };
      worker.onerror = () => {
        if (settled) return;
        settled = true; cleanup(); fallback().then(resolve, reject);
      };
      worker.postMessage({ n, mode, requestId });
    });
  }
  root.CatGeneration = { run };
})(globalThis);
