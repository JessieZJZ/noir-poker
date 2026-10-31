import '../../src/platform/wechat-compat.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { INTERACTIVE_REVIEW_OPTIONS } from '../../src/review/budget.js';

// Bundled independently: WeChat workers can require only their own directory.
worker.onMessage(({ decisions }) => {
  try {
    decisions.forEach((decision, index) => {
      worker.postMessage({
        type: 'step',
        index,
        result: analyzeDecision(decision, INTERACTIVE_REVIEW_OPTIONS),
      });
    });
    worker.postMessage({ type: 'complete' });
  } catch {
    worker.postMessage({ type: 'error' });
  }
});
