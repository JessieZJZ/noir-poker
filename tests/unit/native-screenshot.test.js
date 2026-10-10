import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { captureNativeScreenshot } from '../../scripts/native-screenshot.mjs';

function fakeWebview({ timeout = false, animationActive = false } = {}) {
  const frames = [];
  const timers = new Map();
  let nextTimer = 0;
  return {
    frames,
    finishAnimation: () => (animationActive = false),
    execute: ({ script, args }) =>
      new Promise((resolve) => {
        const run = vm.runInNewContext(`(function () { ${script} })`, {
          requestAnimationFrame: (callback) => frames.push(callback),
          setTimeout: (callback) => {
            timers.set(++nextTimer, callback);
            if (timeout) queueMicrotask(callback);
            return nextTimer;
          },
          clearTimeout: (id) => timers.delete(id),
          document: {
            readyState: 'complete',
            querySelector: () => ({ open: false, dataset: { actionState: 'settled' } }),
            querySelectorAll: (selector) =>
              selector === '#hero-cards .playing-card'
                ? [{}, {}]
                : [
                    {
                      getAnimations: () =>
                        animationActive
                          ? [
                              {
                                playState: 'running',
                                effect: { getTiming: () => ({ iterations: 1 }) },
                              },
                            ]
                          : [],
                    },
                  ],
          },
          window: { noir: { getState: () => ({ phase: 'done' }) } },
        });
        run(...args, resolve);
      }),
  };
}

test('native pixels are captured only after two committed WebView frames', async () => {
  const page = fakeWebview();
  const requests = [];
  let paint;
  const capture = captureNativeScreenshot(
    async (method, endpoint, body) => {
      requests.push(endpoint);
      if (endpoint === '/execute/async') return page.execute(body);
      return 'native-device-pixels';
    },
    {
      onPaint: (value) => (paint = value),
      save: (pixels) => {
        assert.equal(pixels, 'native-device-pixels');
        requests.push('saved');
      },
      restore: async () => requests.push('restored'),
    },
  );
  assert.deepEqual(requests, ['/execute/async']);
  page.frames.shift()(10);
  await Promise.resolve();
  assert.deepEqual(requests, ['/execute/async']);
  page.frames.shift()(26);
  await capture;
  assert.deepEqual(requests, ['/execute/async', '/context', '/screenshot', 'saved', 'restored']);
  assert.equal(paint.phase, 'done');
  assert.equal(paint.reviewOpen, false);
  assert.ok(paint.committedFrame > paint.firstFrame);
});

test('a non-painting WebView fails instead of recording stale successful evidence', async () => {
  const page = fakeWebview({ timeout: true });
  const requests = [];
  await assert.rejects(
    captureNativeScreenshot(
      async (method, endpoint, body) => {
        requests.push(endpoint);
        return page.execute(body);
      },
      { timeoutMs: 700, save: () => assert.fail('No native screenshot may be labeled successful') },
    ),
    /two animation frames within 700ms/,
  );
  assert.deepEqual(requests, ['/execute/async']);
});

test('failure evidence can capture the native screen without a working WebView', async () => {
  const requests = [];
  await captureNativeScreenshot(
    async (method, endpoint) => {
      requests.push(endpoint);
      return 'failure-pixels';
    },
    { waitForPaint: false, save: (pixels) => assert.equal(pixels, 'failure-pixels') },
  );
  assert.deepEqual(requests, ['/context', '/screenshot']);
});

test('next-hand screenshots wait for the actual finite deal animation to finish', async () => {
  const page = fakeWebview({ animationActive: true });
  const requests = [];
  const capture = captureNativeScreenshot(
    async (method, endpoint, body) => {
      requests.push(endpoint);
      return endpoint === '/execute/async' ? page.execute(body) : 'native-device-pixels';
    },
    { expected: { heroCards: 2 }, save: () => requests.push('saved') },
  );
  page.frames.shift()(10);
  page.frames.shift()(26);
  await Promise.resolve();
  assert.deepEqual(requests, ['/execute/async']);
  page.finishAnimation();
  page.frames.shift()(42);
  page.frames.shift()(58);
  await capture;
  assert.deepEqual(requests, ['/execute/async', '/context', '/screenshot', 'saved']);
});

test('missing or non-finite frame timestamps cannot confirm a painted screenshot', async () => {
  for (const paint of [{}, { firstFrame: 10 }, { firstFrame: null, committedFrame: 20 }]) {
    await assert.rejects(
      captureNativeScreenshot(async () => paint, {
        save: () => assert.fail('Malformed paint response must not produce native evidence'),
      }),
      /did not confirm a subsequent committed animation frame/,
    );
  }
});
