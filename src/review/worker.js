import { analyzeDecision, summarizeReview } from '../review/analysis.js';
import { INTERACTIVE_REVIEW_OPTIONS } from './budget.js';
self.onmessage = (event) => {
  if (event.data.type === 'decision') {
    const { id, index, decision } = event.data;
    try {
      self.postMessage({
        id,
        index,
        type: 'progress',
        result: analyzeDecision(decision, INTERACTIVE_REVIEW_OPTIONS),
      });
    } catch {
      self.postMessage({ id, index, type: 'error' });
    }
    return;
  }
  const { id, input, completed = [] } = event.data;
  try {
    const steps = [...completed];
    for (let index = 0; index < input.decisions.length; index++) {
      if (steps[index]) continue;
      steps[index] = analyzeDecision(input.decisions[index], INTERACTIVE_REVIEW_OPTIONS);
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
