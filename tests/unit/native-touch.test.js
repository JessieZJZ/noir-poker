import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { prepareNativeTouch, performNativeTouch } from '../../scripts/native-touch.mjs';

function touchHarness({
  platform = 'ios',
  rect = { x: 126, y: 421.447, width: 150, height: 44 },
  viewport = { width: 402, height: 874 },
  frames = [{ x: 0, y: 0, width: 402, height: 874 }],
  covered = false,
  gestureError,
  onGesture,
} = {}) {
  const calls = [];
  const gestures = () =>
    calls.filter(([, endpoint]) => endpoint === '/execute/sync' || endpoint === '/actions');
  const context = {
    platform,
    webContext: 'WEBVIEW_current',
    async evaluate(fn, ...args) {
      const element = { getBoundingClientRect: () => rect, contains: (hit) => hit === element };
      return runInNewContext(`(${fn.toString()})(...args)`, {
        args,
        document: {
          querySelector: () => element,
          elementFromPoint: () => (covered ? {} : element),
        },
        innerWidth: viewport.width,
        innerHeight: viewport.height,
      });
    },
    async command(...args) {
      calls.push(args);
      const [, endpoint] = args;
      if (endpoint === '/elements')
        return frames.map((_, i) => ({
          'element-6066-11e4-a52e-4f735466cecf': `native-webview-${i}`,
        }));
      if (endpoint.endsWith('/rect')) {
        const index = Number(endpoint.match(/native-webview-(\d+)/)[1]);
        return frames[index];
      }
      if (gestureError && (endpoint === '/execute/sync' || endpoint === '/actions'))
        throw gestureError;
      if (endpoint === '/execute/sync' || endpoint === '/actions') return onGesture?.(...args);
    },
  };
  return {
    calls,
    gestures,
    touch: (selector = '#join-table-button', duration = 80, from = 0.5, to = null, tap = true) =>
      performNativeTouch(context, selector, duration, from, to, { tap }),
  };
}

test('iOS join uses exactly one atomic native tap at the existing measured physical point', async () => {
  const h = touchHarness();
  await h.touch();
  assert.deepEqual(h.gestures(), [
    [
      'POST',
      '/execute/sync',
      {
        script: 'mobile: tap',
        args: [{ elementId: 'native-webview-0', x: 201, y: 443 }],
      },
    ],
  ]);
  assert.deepEqual(h.calls, [
    ['POST', '/context', { name: 'NATIVE_APP' }],
    ['POST', '/elements', { using: 'class name', value: 'XCUIElementTypeWebView' }],
    ['GET', '/element/native-webview-0/rect'],
    ...h.gestures(),
    ['POST', '/context', { name: 'WEBVIEW_current' }],
  ]);
});

test('atomic iOS entry is anchored to the largest real WebView without assuming an application origin', async () => {
  const h = touchHarness({
    rect: { x: 80, y: 180, width: 40, height: 40 },
    viewport: { width: 400, height: 800 },
    frames: [
      { x: 0, y: 0, width: 40, height: 80 },
      { x: 12, y: 59, width: 200, height: 400 },
    ],
  });
  await h.touch();
  const [{ elementId, x, y }] = h.gestures()[0][2].args;
  assert.equal(elementId, 'native-webview-1');
  assert.deepEqual({ x, y }, { x: 50, y: 100 });
  assert.deepEqual({ x: 12 + x, y: 59 + y }, { x: 62, y: 159 });
  assert.equal(h.gestures().length, 1);
});

test('non-entry iOS taps and join holds retain the same W3C touch sequence', async () => {
  for (const [selector, duration, tap] of [
    ['#next-button', 80, true],
    ['#continue-deal-button', 80, true],
    ['#join-table-button', 650, false],
  ]) {
    const h = touchHarness();
    await h.touch(selector, duration, 0.5, null, tap);
    assert.deepEqual(h.gestures(), [
      [
        'POST',
        '/actions',
        {
          actions: [
            {
              type: 'pointer',
              id: 'native-summary-touch',
              parameters: { pointerType: 'touch' },
              actions: [
                { type: 'pointerMove', duration: 0, origin: 'viewport', x: 201, y: 443 },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        },
      ],
    ]);
    assert.deepEqual(h.calls.at(-1), ['POST', '/context', { name: 'WEBVIEW_current' }]);
  }
});

test('Android entry retains one real clickGesture and its density-scaled physical point', async () => {
  const h = touchHarness({
    platform: 'android',
    rect: { x: 80, y: 180, width: 40, height: 40 },
    viewport: { width: 400, height: 800 },
    frames: [{ x: 0, y: 48, width: 800, height: 1600 }],
  });
  await h.touch();
  assert.deepEqual(h.gestures(), [
    ['POST', '/execute/sync', { script: 'mobile: clickGesture', args: [{ x: 200, y: 448 }] }],
  ]);
});

test('drag retains its real W3C move instead of the entry atomic tap branch', async () => {
  const h = touchHarness();
  await h.touch('#join-table-button', 600, 0.2, 0.8, false);
  assert.deepEqual(h.gestures()[0][2].actions[0].actions, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x: 156, y: 443 },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 600, origin: 'viewport', x: 246, y: 443 },
    { type: 'pointerUp', button: 0 },
  ]);
  assert.equal(h.gestures().length, 1);
});

test('covered, clipped, invalid and mismatched targets fail without a gesture', async () => {
  for (const options of [
    { covered: true },
    { rect: { x: -200, y: 10, width: 10, height: 10 } },
    { rect: { x: 10, y: 900, width: 10, height: 10 } },
    { rect: { x: NaN, y: 10, width: 10, height: 10 } },
    { frames: [{ x: 0, y: 0, width: 402, height: 400 }] },
    { frames: [] },
  ]) {
    const h = touchHarness(options);
    await assert.rejects(h.touch());
    assert.deepEqual(h.gestures(), []);
    if (options.covered) assert.deepEqual(h.calls, []);
    else assert.deepEqual(h.calls.at(-1), ['POST', '/context', { name: 'WEBVIEW_current' }]);
  }
});

test('a failed atomic entry tap propagates the driver error and restores WebView without a fallback', async () => {
  for (const error of [new Error('WDA tap failed'), new Error('Unsupported mobile command')]) {
    const h = touchHarness({ gestureError: error });
    await assert.rejects(h.touch(), (actual) => actual === error);
    assert.equal(h.gestures().length, 1);
    assert.equal(h.gestures()[0][2].script, 'mobile: tap');
    assert.deepEqual(h.calls.at(-1), ['POST', '/context', { name: 'WEBVIEW_current' }]);
  }
});

test('WebView restoration waits for the single atomic tap to finish', async () => {
  let finish;
  const pending = new Promise((resolve) => (finish = resolve));
  const h = touchHarness({ onGesture: () => pending });
  const touch = h.touch();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(h.gestures().length, 1);
  assert.equal(h.calls.at(-1)[1], '/execute/sync');
  finish();
  await touch;
  assert.equal(h.gestures().length, 1);
  assert.deepEqual(h.calls.at(-1), ['POST', '/context', { name: 'WEBVIEW_current' }]);
});

test('iOS waits for AX-first native tap settings before reading back both required flags', async () => {
  const calls = [];
  let finishSet;
  const setting = new Promise((resolve) => (finishSet = resolve));
  const preparing = prepareNativeTouch(async (...args) => {
    calls.push(args);
    if (args[0] === 'POST') return setting;
    return { nativeWebTap: true, nativeWebTapStrict: false, unrelatedSetting: 'not reported' };
  }, 'ios');
  assert.deepEqual(calls, [
    ['POST', '/appium/settings', { settings: { nativeWebTap: true, nativeWebTapStrict: false } }],
  ]);
  await Promise.resolve();
  assert.equal(calls.length, 1, 'Readback must wait for the POST to finish');
  finishSet();
  assert.deepEqual(await preparing, { nativeWebTap: true, nativeWebTapStrict: false });
  assert.deepEqual(calls[1], ['GET', '/appium/settings']);
  assert.equal(calls.length, 2);
});

test('Android bounds the animated screen idle wait and verifies the real driver readback', async () => {
  const calls = [];
  assert.deepEqual(
    await prepareNativeTouch(async (...args) => {
      calls.push(args);
      return { waitForIdleTimeout: 500 };
    }, 'android'),
    { waitForIdleTimeout: 500 },
  );
  assert.deepEqual(calls, [
    ['POST', '/appium/settings', { settings: { waitForIdleTimeout: 500 } }],
    ['GET', '/appium/settings'],
  ]);
  for (const value of [0, 10000, '500', undefined])
    await assert.rejects(
      prepareNativeTouch(async () => ({ waitForIdleTimeout: value }), 'android'),
      /Android idle timeout must read back as 500/,
    );
});

test('unknown platforms fail before any driver setting request', async () => {
  let requests = 0;
  const command = async () => requests++;
  for (const platform of ['web', '', undefined, null])
    await assert.rejects(prepareNativeTouch(command, platform), /platform must be ios or android/);
  assert.equal(requests, 0);
});

test('disabled native tap, forced coordinates and non-boolean readback flags fail', async () => {
  for (const actual of [
    undefined,
    null,
    {},
    { nativeWebTap: false, nativeWebTapStrict: false },
    { nativeWebTap: true, nativeWebTapStrict: true },
    { nativeWebTap: true },
    { nativeWebTapStrict: false },
    { nativeWebTap: 'true', nativeWebTapStrict: false },
    { nativeWebTap: true, nativeWebTapStrict: 0 },
  ]) {
    const calls = [];
    await assert.rejects(
      prepareNativeTouch(async (method, endpoint) => {
        calls.push([method, endpoint]);
        return method === 'GET' ? actual : null;
      }, 'ios'),
      /iOS nativeWebTap(?:Strict)? must read back as (?:true|false)/,
    );
    assert.deepEqual(calls, [
      ['POST', '/appium/settings'],
      ['GET', '/appium/settings'],
    ]);
  }
});

test('settings and readback failures propagate their original errors without a fallback or retry', async () => {
  for (const failMethod of ['POST', 'GET']) {
    const error = new Error(`${failMethod} driver failure`),
      calls = [];
    await assert.rejects(
      prepareNativeTouch(async (method, endpoint) => {
        calls.push([method, endpoint]);
        if (method === failMethod) throw error;
      }, 'ios'),
      (received) => received === error,
    );
    assert.deepEqual(
      calls,
      failMethod === 'POST'
        ? [['POST', '/appium/settings']]
        : [
            ['POST', '/appium/settings'],
            ['GET', '/appium/settings'],
          ],
    );
  }
});
