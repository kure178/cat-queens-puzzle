'use strict';
importScripts('./solver.js', './generator.js');
self.onmessage = async ({ data: { n, mode, requestId } }) => {
  try {
    const result = await CatGenerator.generate(n, { mode,
      onProgress: progress => self.postMessage({ type: 'progress', requestId, progress }) });
    self.postMessage({ type: 'result', requestId, result });
  }
  catch (error) { self.postMessage({ type: 'error', requestId, name: error.name, message: error.message, metrics: error.metrics }); }
};
