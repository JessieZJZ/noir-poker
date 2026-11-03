import assert from 'node:assert/strict';
import { nativePoint } from './native-pointer.mjs';

// nativeWebTap routes iOS WebView clicks through WDA. Keep Strict false so
// the driver tries the actual native accessibility element before coordinate
// calibration. Both paths use native touch; neither falls back to a JS click.
export async function prepareNativeTouch(command, platform) {
  if (platform === 'android') {
    // The table intentionally keeps animating. UIAutomator's default 10s idle
    // wait adds that delay to every native tap; our target sampler already
    // verifies visible, stable geometry before delegating the real touch.
    await command('POST', '/appium/settings', { settings: { waitForIdleTimeout: 500 } });
    const actual = await command('GET', '/appium/settings');
    assert.equal(actual?.waitForIdleTimeout, 500, 'Android idle timeout must read back as 500');
    return { waitForIdleTimeout: actual.waitForIdleTimeout };
  }
  if (platform !== 'ios') throw new Error('Native touch platform must be ios or android');
  await command('POST', '/appium/settings', {
    settings: { nativeWebTap: true, nativeWebTapStrict: false },
  });
  const actual = await command('GET', '/appium/settings');
  assert.equal(actual?.nativeWebTap, true, 'iOS nativeWebTap must read back as true');
  assert.equal(actual?.nativeWebTapStrict, false, 'iOS nativeWebTapStrict must read back as false');
  return { nativeWebTap: actual.nativeWebTap, nativeWebTapStrict: actual.nativeWebTapStrict };
}

export async function performNativeTouch(
  { command, evaluate, platform, webContext },
  selector,
  duration,
  from = 0.5,
  to = null,
  { tap = false } = {},
) {
  const target = await evaluate(
    (selector, from, to) => {
      const element = document.querySelector(selector),
        r = element.getBoundingClientRect(),
        x = r.x + r.width * from,
        y = r.y + r.height / 2,
        hit = document.elementFromPoint(x, y);
      if (!hit || !element.contains(hit)) throw Error('Native touch target is covered');
      return {
        x,
        y,
        endX: to === null ? null : r.x + r.width * to,
        width: innerWidth,
        height: innerHeight,
      };
    },
    selector,
    from,
    to,
  );
  await command('POST', '/context', { name: 'NATIVE_APP' });
  try {
    const elements = await command('POST', '/elements', {
      using: 'class name',
      value: platform === 'ios' ? 'XCUIElementTypeWebView' : 'android.webkit.WebView',
    });
    const frames = [];
    for (const element of elements) {
      const id = element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
      frames.push({ id, rect: await command('GET', `/element/${id}/rect`) });
    }
    const nativeWebView = frames.sort(
      (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
    )[0];
    const frame = nativeWebView?.rect;
    assert.ok(frame, 'The installed app must expose its actual WebView frame');
    const point = nativePoint(target, target, frame);
    if (tap && platform === 'ios' && selector === '#join-table-button') {
      // CI delivered only pointerdown for this entry W3C sequence. XCUITest's
      // atomic tap performs one real touch, with no calibration or retry.
      // Anchor to the same measured native WebView so its origin is included
      // exactly once and the rounded physical point remains unchanged.
      await command('POST', '/execute/sync', {
        script: 'mobile: tap',
        args: [{ elementId: nativeWebView.id, x: point.x - frame.x, y: point.y - frame.y }],
      });
      return;
    }
    if (tap && platform === 'android') {
      // A loaded emulator can stretch W3C down/pause/up into a long press.
      // Keep this a real device tap, issued atomically by UiAutomator2.
      await command('POST', '/execute/sync', {
        script: 'mobile: clickGesture',
        args: [point],
      });
      return;
    }
    await command('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'native-summary-touch',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, origin: 'viewport', ...point },
            { type: 'pointerDown', button: 0 },
            ...(target.endX === null
              ? [{ type: 'pause', duration }]
              : [
                  {
                    type: 'pointerMove',
                    duration,
                    origin: 'viewport',
                    ...nativePoint({ ...target, x: target.endX }, target, frame),
                  },
                ]),
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  } finally {
    await command('POST', '/context', { name: webContext });
  }
}
