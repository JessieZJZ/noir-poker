import { analyzeDecision, summarizeReview } from '../review/analysis.js';
self.onmessage = (event) => {
  const { id, input } = event.data;
  try {
    const steps = [];
    for (const decision of input.decisions) {
      steps.push(analyzeDecision(decision));
      self.postMessage({
        id,
        type: 'progress',
        done: steps.length,
        total: input.decisions.length,
        result: steps.at(-1),
      });
    }
    self.postMessage({ id, type: 'complete', analysis: summarizeReview(input, steps) });
  } catch {
    self.postMessage({ id, type: 'error' });
  }
};
