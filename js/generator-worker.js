'use strict';
importScripts('./solver.js', './generator.js');
self.onmessage = ({ data: n }) => {
  try { self.postMessage(CatGenerator.generate(n)); }
  catch (error) { self.postMessage({ error: error.message }); }
};
