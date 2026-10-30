import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const source = readFileSync(new URL('../../src/ui/hand-advance.js', import.meta.url), 'utf8');
const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let browser, page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
after(async () => browser?.close());
beforeEach(async () => {
  await page.setContent(`
    <button id="continue"><span>Continue</span></button>
    <button id="next"><span>Next</span></button>
    <button id="other">Other</button><div id="outside">Outside</div>`);
  await page.evaluate(async (moduleURL) => {
    const { createHandAdvanceGuard } = await import(moduleURL);
    window.identity = 'session:1/hand:3/attempt:0';
    window.activations = [];
    window.clicks = [];
    const button = document.querySelector('#next');
    window.guard = createHandAdvanceGuard({ button, token: () => window.identity });
    button.onclick = (event) => {
      const allowed = window.guard.allow(event);
      if (allowed) window.activations.push(window.identity);
      else event.preventDefault();
      window.clicks.push({ allowed, prevented: event.defaultPrevented, detail: event.detail });
    };
  }, moduleURL);
});

const down = (selector, options = {}) =>
  page.evaluate(
    ({ selector, options }) =>
      document.querySelector(selector).dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'touch',
          ...options,
        }),
      ),
    { selector, options },
  );
const replayClick = (selector = '#next', detail = 1) =>
  page.evaluate(
    ({ selector, detail }) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
      const dispatched = document.querySelector(selector).dispatchEvent(event);
      return { dispatched, prevented: event.defaultPrevented, activations: window.activations };
    },
    { selector, detail },
  );

test('a real pointer click on next, including its nested text, activates exactly once', async () => {
  await page.locator('#next span').click();
  assert.deepEqual(await page.evaluate(() => window.activations), ['session:1/hand:3/attempt:0']);
  assert.deepEqual(await page.evaluate(() => window.clicks), [
    { allowed: true, prevented: false, detail: 1 },
  ]);
});

test('deterministic replay of a touch begun on continue or outside cannot click the replacement next control', async () => {
  // Explicit failure replay: these dispatched events model the captured native
  // sequence; they are not presented as real human or native pointer input.
  for (const selector of ['#continue span', '#outside', '#other']) {
    await down(selector);
    const result = await replayClick();
    assert.equal(result.dispatched, false, selector);
    assert.equal(result.prevented, true, selector);
    assert.deepEqual(result.activations, [], selector);
  }
  await page.locator('#next').click();
  assert.equal(await page.evaluate(() => window.activations.length), 1);
});

test('a pointer that started on the same button in an old session, hand or retry attempt is rejected', async () => {
  for (const changed of [
    'session:2/hand:3/attempt:0',
    'session:1/hand:4/attempt:0',
    'session:1/hand:3/attempt:1',
  ]) {
    await page.evaluate(() => (window.identity = 'session:1/hand:3/attempt:0'));
    await down('#next');
    await page.evaluate((changed) => (window.identity = changed), changed);
    const result = await replayClick();
    assert.equal(result.prevented, true, changed);
    assert.deepEqual(result.activations, [], changed);
  }
});

test('Enter and Space clear an obsolete pointer and retain one normal keyboard activation each', async () => {
  for (const key of ['Enter', 'Space']) {
    await down('#continue');
    await page.locator('#next').focus();
    await page.keyboard.press(key);
  }
  assert.equal(await page.evaluate(() => window.activations.length), 2);
  assert.ok(
    await page.evaluate(() => window.clicks.every((click) => click.allowed && !click.prevented)),
  );
});

test('an assistive activation with no pointer sequence remains allowed', async () => {
  const result = await replayClick('#next', 0);
  assert.equal(result.prevented, false);
  assert.equal(result.activations.length, 1);
});

test('an already prevented click cannot advance even when its pointer began on next', async () => {
  await down('#next');
  const result = await page.evaluate(() => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
    event.preventDefault();
    document.querySelector('#next').dispatchEvent(event);
    return {
      prevented: event.defaultPrevented,
      clicks: window.clicks,
      activations: window.activations,
    };
  });
  assert.equal(result.prevented, true);
  assert.deepEqual(result.clicks, [{ allowed: false, prevented: true, detail: 1 }]);
  assert.deepEqual(result.activations, []);
});

test('an unrelated click, pointer cancellation and explicit reset clear old pointer state', async () => {
  await down('#continue');
  await replayClick('#other');
  assert.equal((await replayClick('#next', 0)).prevented, false);
  await down('#continue');
  await page.evaluate(() =>
    document
      .querySelector('#continue')
      .dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, pointerId: 7, pointerType: 'touch' }),
      ),
  );
  assert.equal((await replayClick('#next', 0)).prevented, false);
  await down('#continue');
  await page.evaluate(() => window.guard.reset());
  assert.equal((await replayClick('#next', 0)).prevented, false);
  assert.equal(await page.evaluate(() => window.activations.length), 3);
});

test('window blur clears an abandoned pointer before a later assistive activation', async () => {
  await down('#outside');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await replayClick('#next', 0)).prevented, false);
  assert.equal(await page.evaluate(() => window.activations.length), 1);
});

test('destroy removes every root listener and is safe to repeat before creating a fresh guard', async () => {
  const evidence = await page.evaluate(async (moduleURL) => {
    window.guard.destroy();
    const { createHandAdvanceGuard } = await import(moduleURL);
    const live = [];
    const tracked = (target) => ({
      addEventListener(type, listener, options) {
        live.push({ target, type, listener, capture: options === true || !!options?.capture });
        target.addEventListener(type, listener, options);
      },
      removeEventListener(type, listener, options) {
        const capture = options === true || !!options?.capture;
        const index = live.findIndex(
          (entry) =>
            entry.target === target &&
            entry.type === type &&
            entry.listener === listener &&
            entry.capture === capture,
        );
        if (index >= 0) live.splice(index, 1);
        target.removeEventListener(type, listener, options);
      },
    });
    const root = { ...tracked(document), defaultView: tracked(window) };
    window.guard = createHandAdvanceGuard({
      button: document.querySelector('#next'),
      token: () => window.identity,
      root,
    });
    const registered = live.length;
    window.guard.destroy();
    window.guard.destroy();
    const remaining = live.length;
    window.guard = createHandAdvanceGuard({
      button: document.querySelector('#next'),
      token: () => window.identity,
    });
    return { registered, remaining };
  }, moduleURL);
  assert.ok(evidence.registered > 0);
  assert.equal(evidence.remaining, 0);
  await down('#outside');
  assert.equal((await replayClick()).prevented, true);
  await page.locator('#next').click();
  assert.equal(await page.evaluate(() => window.activations.length), 1);
});
