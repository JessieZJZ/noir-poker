import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForNativeReview } from '../native/scenarios.mjs';

const pending = (done, total = 3) => ({
  dialogOpen: true,
  analysisState: `正在分析决策 ${done} / ${total}…`,
  done,
  total,
  decisionCount: total,
  retryVisible: false,
  overview: '',
  suggestion: '分析中',
});
function protocol(read) {
  let elapsed = 0;
  return {
    now: () => elapsed,
    app: {
      evaluate: async () => read(elapsed),
      waitFor: async (predicate, timeoutMs, message) => {
        let lastError;
        while (elapsed < timeoutMs) {
          try {
            const result = await predicate();
            if (result) return result;
          } catch (error) {
            lastError = error;
          }
          elapsed += 1000;
        }
        throw new Error(message, { cause: lastError });
      },
    },
  };
}

test('native review timeout retains the last public progress and per-step elapsed evidence', async () => {
  const fake = protocol((elapsed) => pending(elapsed < 5000 ? 0 : elapsed < 12000 ? 1 : 2));
  await assert.rejects(waitForNativeReview(fake.app, { now: fake.now }), (error) => {
    assert.equal(error.reviewDiagnostics.timeoutMs, 30000);
    assert.equal(error.reviewDiagnostics.elapsedMs, 30000);
    assert.deepEqual(
      error.reviewDiagnostics.progress.map(({ done, elapsedMs, sincePreviousProgressMs }) => ({
        done,
        elapsedMs,
        sincePreviousProgressMs,
      })),
      [
        { done: 0, elapsedMs: 0, sincePreviousProgressMs: 0 },
        { done: 1, elapsedMs: 5000, sincePreviousProgressMs: 5000 },
        { done: 2, elapsedMs: 12000, sincePreviousProgressMs: 7000 },
      ],
    );
    assert.equal(error.reviewDiagnostics.observations.length, 3);
    assert.equal(error.reviewDiagnostics.observations.at(-1).done, 2);
    assert.equal(error.reviewDiagnostics.observations.at(-1).decisionCount, 3);
    return true;
  });
});

test('productive progress does not extend the native review deadline or pass incomplete content', async () => {
  const fake = protocol((elapsed) => ({
    ...pending(Math.floor(elapsed / 1000), 40),
    overview: '分析中',
  }));
  await assert.rejects(waitForNativeReview(fake.app, { now: fake.now }), (error) => {
    assert.equal(error.reviewDiagnostics.elapsedMs, 30000);
    assert.equal(error.reviewDiagnostics.progress.at(-1).done, 29);
    return true;
  });
});

test('only complete review content in the open installed dialog succeeds', async () => {
  const fake = protocol((elapsed) => {
    if (elapsed < 2000) return pending(2);
    if (elapsed < 4000)
      return { ...pending(3), overview: '已有摘要', suggestion: '建议 undefined' };
    if (elapsed < 6000)
      return { ...pending(3), dialogOpen: false, overview: '已有摘要', suggestion: '完整建议' };
    return { ...pending(3), overview: '已有摘要', suggestion: '完整建议' };
  });
  const result = await waitForNativeReview(fake.app, { now: fake.now });
  assert.equal(result.overview, '已有摘要');
  assert.equal(result.suggestion, '完整建议');
  assert.equal(result.diagnostics.elapsedMs, 6000);
  assert.equal(result.diagnostics.observations.at(-1).dialogOpen, true);
});

test('native review read failures retain earlier progress and their actual error', async () => {
  const fake = protocol((elapsed) => {
    if (elapsed < 1000) return pending(1);
    throw new Error('WebView disconnected');
  });
  await assert.rejects(waitForNativeReview(fake.app, { now: fake.now }), (error) => {
    assert.equal(error.cause.message, 'WebView disconnected');
    assert.equal(error.reviewDiagnostics.observations[0].done, 1);
    assert.equal(error.reviewDiagnostics.observations.at(-1).readError, 'WebView disconnected');
    assert.equal(error.reviewDiagnostics.elapsedMs, 30000);
    return true;
  });
});
