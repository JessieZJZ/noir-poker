import { summarizeReview } from './analysis.js';

// Independent public decision snapshots can run concurrently. Two workers
// bound memory/thermal cost on phones; WeChat uses its separate single worker.
export function createReviewPool({
  id,
  input,
  completed = [],
  createWorker,
  concurrency = 2,
  onMessage,
  onError,
}) {
  const steps = [...completed],
    queue = input.decisions.flatMap((_, index) => (steps[index] ? [] : [index])),
    slots = [];
  let closed = false;
  const terminate = () => {
    if (closed) return;
    closed = true;
    for (const slot of slots) slot.worker.terminate();
  };
  const fail = () => {
    if (closed) return;
    terminate();
    onError();
  };
  function dispatch(slot) {
    if (closed) return;
    if (!queue.length) {
      slot.index = null;
      if (steps.filter(Boolean).length === input.decisions.length) {
        terminate();
        onMessage({ id, type: 'complete', analysis: summarizeReview(input, steps) });
      }
      return;
    }
    slot.index = queue.shift();
    try {
      slot.worker.postMessage({
        id,
        type: 'decision',
        index: slot.index,
        decision: input.decisions[slot.index],
      });
    } catch {
      fail();
    }
  }
  try {
    const count = Math.min(queue.length, Math.max(1, Math.min(2, Math.floor(concurrency) || 1)));
    for (let i = 0; i < count; i++) {
      const slot = { worker: createWorker(), index: null };
      slots.push(slot);
      slot.worker.onmessage = ({ data }) => {
        if (closed || data.id !== id || data.index !== slot.index) return;
        if (data.type !== 'progress' || !data.result) return fail();
        if (steps[data.index]) return;
        steps[data.index] = data.result;
        onMessage({ ...data, done: steps.filter(Boolean).length, total: input.decisions.length });
        dispatch(slot);
      };
      slot.worker.onerror = (event) => {
        event.preventDefault?.();
        fail();
      };
      slot.worker.onmessageerror = fail;
    }
    for (const slot of slots) dispatch(slot);
    if (!slots.length) {
      closed = true;
      onMessage({ id, type: 'complete', analysis: summarizeReview(input, steps) });
    }
  } catch (error) {
    terminate();
    throw error;
  }
  return { terminate };
}
