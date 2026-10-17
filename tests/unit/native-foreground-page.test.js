import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { withPreservedForegroundPage } from '../native/foreground-page.mjs';

function fixture(activation) {
  let realm = { window: {} };
  let attempts = 0;
  const backgrounds = [];
  const original = {
    platform: 'android',
    evaluate(fn, ...args) {
      return runInNewContext(`(${fn.toString()})(...args)`, { ...realm, args });
    },
    async background(...args) {
      backgrounds.push(args);
      return { nativeState: 3, startedAt: 123 };
    },
    async activate(...args) {
      attempts++;
      return activation?.({
        attempts,
        args,
        replacePage: () => {
          realm = { window: {} };
        },
      });
    },
    relaunch() {
      throw Error('Foreground recovery must never relaunch the app');
    },
  };
  return {
    app: withPreservedForegroundPage(original),
    original,
    attempts: () => attempts,
    window: () => realm.window,
    backgrounds,
  };
}

test('Android foreground preserves the original realm and native background evidence', async () => {
  const f = fixture(() => 'foregrounded');
  assert.deepEqual(await f.app.background('native'), { nativeState: 3, startedAt: 123 });
  assert.ok(f.window().__nativeForegroundPage);
  assert.equal(await f.app.activate('activity'), 'foregrounded');
  assert.equal(f.attempts(), 1);
  assert.deepEqual(f.backgrounds, [['native']]);
  assert.equal(f.window().__nativeForegroundPage, undefined);
});

test('Android transient foreground discovery retries once and still requires the original page', async () => {
  const f = fixture(({ attempts }) => {
    if (attempts === 1) throw Error('POST /context: No such context found.');
  });
  await f.app.background();
  await f.app.activate();
  assert.equal(f.attempts(), 2);
  assert.equal(f.window().__nativeForegroundPage, undefined);
});

test('Android foreground rejects a replacement renderer with or without rediscovery', async () => {
  for (const failOnce of [false, true]) {
    const f = fixture(({ attempts, replacePage }) => {
      if (failOnce && attempts === 1) throw Error('No such context found');
      replacePage();
    });
    await f.app.background();
    await assert.rejects(() => f.app.activate(), /retain the same live page/);
    assert.equal(f.attempts(), failOnce ? 2 : 1);
  }
});

test('persistent foreground context loss is bounded and unrelated errors are not retried', async () => {
  for (const [message, count] of [
    ['No such context found', 2],
    ['Native Activity crashed', 1],
  ]) {
    const f = fixture(() => {
      throw Error(message);
    });
    await f.app.background();
    await assert.rejects(() => f.app.activate(), new RegExp(message));
    assert.equal(f.attempts(), count);
  }
});

test('explicit preservation also guards Android Back minimization', async () => {
  const f = fixture();
  await f.app.preserveForegroundPage();
  assert.ok(f.window().__nativeForegroundPage);
  await f.app.activate();
  assert.equal(f.attempts(), 1);
  assert.equal(f.backgrounds.length, 0);
  assert.equal(f.window().__nativeForegroundPage, undefined);
});

test('preparing the page before a pending opponent avoids another WebView command before background', async () => {
  const f = fixture();
  await f.app.preserveForegroundPage();
  const marker = f.window().__nativeForegroundPage;
  await f.app.background();
  assert.equal(f.window().__nativeForegroundPage, marker);
  await f.app.activate();
  assert.equal(f.window().__nativeForegroundPage, undefined);
});

test('non-Android and unmarked foreground operations retain their original behavior', async () => {
  const ios = { platform: 'ios' };
  assert.equal(withPreservedForegroundPage(ios), ios);
  const f = fixture(() => {
    throw Error('No such context found');
  });
  await assert.rejects(() => f.app.activate(), /No such context found/);
  assert.equal(f.attempts(), 1);
});
