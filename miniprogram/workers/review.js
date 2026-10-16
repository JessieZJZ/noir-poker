import { analyzeDecision } from '../../src/review/analysis.js';

// Bundled independently: WeChat workers can require only their own directory.
worker.onMessage(({ decisions }) => {
  try {
    decisions.forEach((decision, index) => {
      worker.postMessage({ type: 'step', index, result: analyzeDecision(decision) });
    });
    worker.postMessage({ type: 'complete' });
  } catch {
    worker.postMessage({ type: 'error' });
  }
});
