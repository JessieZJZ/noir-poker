import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readNativePersonaTags } from '../native/scenarios.mjs';

function protocol({ fonts = 'ready' } = {}) {
  let resolveFonts,
    rejectFonts,
    fontResolved = false,
    framesFired = 0,
    reads = 0;
  const ready = new Promise((resolve, reject) => {
      resolveFonts = resolve;
      rejectFonts = reject;
    }),
    frames = [],
    tags = [{ textContent: '균형', getBoundingClientRect: () => ({ height: 18.5 }) }],
    window = {
      __nativePersonaTagsObservation: { token: 'old', result: '{"snapshot":{"hand":99}}' },
      noir: {
        getState() {
          assert.equal(fontResolved, true, 'State is measured after fonts resolve');
          assert.equal(framesFired, 2, 'Both real frame callbacks precede measurement');
          reads++;
          return { hand: 7, stack: 19500, hole: ['A♠', 'K♦'] };
        },
      },
    },
    context = vm.createContext({
      window,
      document: {
        fonts: { ready },
        querySelector: () => ({ textContent: '3' }),
        querySelectorAll: () => tags,
      },
      getComputedStyle: () => ({ fontSize: '12px' }),
      requestAnimationFrame: (callback) => frames.push(callback),
    });
  let polls = 0,
    promiseReturns = 0,
    deadline;
  const app = {
    async evaluate(fn, ...args) {
      const evaluate = vm.runInContext(`(${fn.toString()})`, context);
      const result = evaluate(...args);
      // Match the observed XCUITest execute/sync Promise serialization.
      if (result?.then) {
        promiseReturns++;
        return {};
      }
      return result === undefined ? null : JSON.parse(JSON.stringify(result));
    },
    async waitFor(predicate, timeout, message) {
      deadline = timeout;
      for (polls = 0; polls < 8; polls++) {
        const result = await predicate();
        if (result) return result;
        if (polls === 1 && fonts === 'ready') {
          fontResolved = true;
          resolveFonts();
        } else if (polls === 1 && fonts === 'reject') rejectFonts(new Error('Font load failed'));
        await Promise.resolve();
        const frame = frames.shift();
        if (frame) {
          framesFired++;
          frame();
        }
        await Promise.resolve();
      }
      throw new Error(message);
    },
  };
  return {
    app,
    window,
    evidence: () => ({ polls, framesFired, reads, promiseReturns, deadline }),
  };
}

test('native persona measurement waits for fonts and two frames while returning only bridge primitives', async () => {
  const bridge = protocol();
  const result = await readNativePersonaTags(bridge.app);
  assert.deepEqual(result, {
    hand: 7,
    stack: 19500,
    hole: ['A♠', 'K♦'],
    completedHands: '3',
    tags: [{ text: '균형', height: 18.5, fontSize: '12px' }],
  });
  assert.equal(bridge.evidence().framesFired, 2);
  assert.equal(bridge.evidence().reads, 1);
  assert.equal(bridge.evidence().promiseReturns, 0);
  assert.equal(bridge.evidence().deadline, 10000);
  assert.equal(bridge.window.__nativePersonaTagsObservation, undefined);
});

test('native persona measurement reports the actual font failure without manufacturing tag data', async () => {
  const bridge = protocol({ fonts: 'reject' });
  await assert.rejects(readNativePersonaTags(bridge.app), /Font load failed/);
  assert.equal(bridge.evidence().reads, 0);
  assert.equal(bridge.evidence().framesFired, 0);
  assert.equal(bridge.window.__nativePersonaTagsObservation, undefined);
});

test('pending fonts time out instead of accepting an earlier page measurement', async () => {
  const bridge = protocol({ fonts: 'pending' });
  await assert.rejects(
    readNativePersonaTags(bridge.app),
    /finish fonts.ready and two animation frames/,
  );
  assert.equal(bridge.evidence().reads, 0);
  assert.equal(bridge.evidence().deadline, 10000);
  assert.equal(bridge.evidence().promiseReturns, 0);
  assert.equal(bridge.window.__nativePersonaTagsObservation, undefined);
});
