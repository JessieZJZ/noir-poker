import { analyzeDecision, summarizeReview } from '../review/analysis.js';
self.onmessage = (event) => {
  const { id, input, completed = [] } = event.data;
  try {
    const steps = [...completed];
    for (let index = 0; index < input.decisions.length; index++) {
      if (steps[index]) continue;
      steps[index] = analyzeDecision(input.decisions[index]);
      self.postMessage({
        id,
        type: 'progress',
        done: steps.filter(Boolean).length,
        index,
        total: input.decisions.length,
        result: steps[index],
      });
    }
    self.postMessage({ id, type: 'complete', analysis: summarizeReview(input, steps) });
  } catch {
    self.postMessage({ id, type: 'error' });
  }
};
