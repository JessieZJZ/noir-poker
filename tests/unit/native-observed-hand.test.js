import { after, before, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  assertObservedAction as sourceAssertObservedAction,
  settleObservedNativeHand,
  tapObservedAction,
} from '../native/observed-hand.mjs';

let browser, page;
let sortedDriverDictionaries = false;
function wireValue(value) {
  if (!sortedDriverDictionaries) return value;
  if (Array.isArray(value)) return value.map(wireValue);
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, wireValue(item)]),
      )
    : value;
}
function test(name, run) {
  for (const driver of ['WebKit order', 'ChromeDriver sorted dictionaries'])
    nodeTest(`${name} [${driver}]`, async (context) => {
      sortedDriverDictionaries = driver.startsWith('ChromeDriver');
      await run(context);
    });
}
const assertObservedAction = (result, ...args) =>
  sourceAssertObservedAction(wireValue(result), ...args);
const intended = { sessionNumber: 7, hand: 2, attempt: 1 };
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 402, height: 874 } });
});
after(async () => browser?.close());

async function harness({ done = false, immediate = false, hit = null } = {}) {
  await page.setContent(`
    <style>body { margin: 0; height: 1800px; } button { margin-top: 900px; width: 150px; height: 40px; }</style>
    <button id="fold-button">Fold</button><button id="continue-deal-button">Continue</button>
    <button id="next-button">Next</button>`);
  await page.evaluate(
    ({ intended, done, immediate }) => {
      window.current = {
        sessionNumber: intended.sessionNumber,
        hand: intended.hand,
        replayAttempt: intended.attempt,
        phase: done ? 'done' : 'playing',
        canContinue: false,
        players: [{ folded: false }],
      };
      window.noir = { getState: () => structuredClone(window.current) };
      document.querySelector('#fold-button').onclick = () => {
        window.current.players[0].folded = true;
        window.current.canContinue = true;
        if (immediate) window.current.phase = 'done';
      };
      document.querySelector('#continue-deal-button').onclick = () => {
        window.current.phase = 'done';
      };
      document.querySelector('#next-button').onclick = () => {
        window.current.hand++;
      };
      if (done) document.querySelector('#continue-deal-button').hidden = true;
    },
    { intended, done, immediate },
  );
  const taps = [],
    budgets = [];
  const evaluate = async (fn, value) => wireValue(await page.evaluate(fn, wireValue(value)));
  return {
    taps,
    budgets,
    app: {
      evaluate,
      state: () => evaluate(() => window.noir.getState()),
      visible: (selector) => page.locator(selector).isVisible(),
      async waitFor(predicate, timeout, message) {
        budgets.push(timeout);
        const deadline = Date.now() + Math.min(timeout, 1000);
        while (Date.now() < deadline) {
          const result = await predicate();
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw Error(message);
      },
      async nativeTap(selector) {
        taps.push(selector);
        const actual = hit || selector;
        const point = await page.locator(actual).boundingBox();
        await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
      },
      click() {
        throw Error('The observed helper must delegate only one measured native tap');
      },
    },
  };
}

test('observed fold uses one trusted touch, stays on the same attempt and skips optional continue after settlement', async () => {
  const h = await harness({ immediate: true });
  const evidence = await settleObservedNativeHand(h.app, { settledBeforeHero: false });
  assert.deepEqual(h.taps, ['#fold-button']);
  assert.deepEqual(evidence.intended, intended);
  assert.equal(evidence.actions[0].events.filter((event) => event.type === 'click').length, 1);
  assert.equal(evidence.actions[0].events.at(-1).trusted, true);
  assert.equal(evidence.budgetMs, 60000);
  assert.ok(h.budgets.every((budget) => budget > 0 && budget <= 60000));
});

test('WebDriver argument key order cannot change a valid hand identity or conceal changed values', async () => {
  const reordered = (app, change, stringify = false) => ({
    ...app,
    async evaluate(fn, value) {
      if (fn.name === 'armObservedAction') {
        const before = value.intended;
        value = {
          ...value,
          intended: {
            attempt: before.attempt,
            hand: before.hand,
            sessionNumber: before.sessionNumber,
          },
        };
        if (change)
          value.intended[change] = stringify
            ? String(value.intended[change])
            : value.intended[change] + 1;
      }
      return app.evaluate(fn, value);
    },
  });
  const h = await harness({ immediate: true });
  const result = await tapObservedAction(reordered(h.app), '#fold-button', intended);
  assert.equal(result.outcome, 'target-clicked');
  assert.deepEqual(result.armed.identityArgumentKeys, ['attempt', 'hand', 'sessionNumber']);
  assert.deepEqual(h.taps, ['#fold-button']);
  for (const field of ['sessionNumber', 'hand', 'attempt']) {
    for (const stringify of [false, true]) {
      const changed = await harness({ immediate: true });
      await assert.rejects(
        tapObservedAction(reordered(changed.app, field, stringify), '#fold-button', intended),
        /intended hand changed before the native action/,
      );
      assert.deepEqual(changed.taps, []);
    }
  }
});

test('an unfinished folded hand continues once through the real control within the original budget', async () => {
  const h = await harness();
  const evidence = await settleObservedNativeHand(h.app, { settledBeforeHero: false });
  assert.deepEqual(h.taps, ['#fold-button', '#continue-deal-button']);
  assert.equal(evidence.actions.length, 2);
  assert.equal(evidence.observations.at(-1).phase, 'done');
  assert.deepEqual(await h.app.state(), evidence.actions.at(-1).state);
});

test('the passive capture probe reads the standard event prevention after the real onclick handler', async () => {
  const h = await harness();
  await page.evaluate(() => {
    document.querySelector('#continue-deal-button').onclick = (event) => {
      event.preventDefault();
      window.current.phase = 'done';
    };
  });
  const evidence = await settleObservedNativeHand(h.app, { settledBeforeHero: false });
  const click = evidence.actions.at(-1).events.find((event) => event.type === 'click');
  assert.equal(click.trusted, true);
  assert.equal(click.phase, 'playing', 'Phase is observed before the onclick handler');
  assert.equal(click.defaultPrevented, true, 'Prevention is read after the onclick handler');
  assert.equal(evidence.actions.at(-1).state.phase, 'done');
  assert.deepEqual(h.taps, ['#fold-button', '#continue-deal-button']);
});

test('a hand that settles before positioning emits no obsolete continue tap', async () => {
  const h = await harness({ done: true });
  assert.equal(await h.app.visible('#continue-deal-button'), false);
  const action = await tapObservedAction(h.app, '#continue-deal-button', intended);
  assert.equal(action.skippedSettled, true);
  const settled = await settleObservedNativeHand(h.app, { settledBeforeHero: true });
  assert.deepEqual(h.taps, []);
  assert.deepEqual(settled.actions, []);
});

test('settlement that hides continue during geometry stabilization stops positioning without a touch', async () => {
  const h = await harness();
  let positions = 0;
  const app = {
    ...h.app,
    async evaluate(fn, value) {
      const result = await h.app.evaluate(fn, value);
      if (fn.name === 'readNativeTargetPosition' && ++positions === 1)
        await page.evaluate(() => {
          window.current.phase = 'done';
          document.querySelector('#continue-deal-button').hidden = true;
        });
      return result;
    },
  };
  const action = await tapObservedAction(app, '#continue-deal-button', intended);
  assert.equal(positions, 1);
  assert.equal(action.skippedSettled, true);
  assert.deepEqual(h.taps, []);
});

async function coverContinue({ done = true, cover = 'action-panel', changedHand = false } = {}) {
  return page.evaluate(
    ({ done, cover, changedHand }) => {
      const target = document.querySelector('#continue-deal-button');
      target.hidden = false;
      const rect = target.getBoundingClientRect();
      const panel = document.createElement('div');
      panel.id = cover;
      panel.className = 'action-panel settled-actions';
      Object.assign(panel.style, {
        position: 'fixed',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: '99999',
      });
      document.body.append(panel);
      window.current.phase = done ? 'done' : 'playing';
      if (changedHand) window.current.hand++;
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id;
    },
    { done, cover, changedHand },
  );
}

test('a visible continue covered by the settled action panel is skipped before positioning when the same hand is done', async () => {
  const h = await harness();
  await page.locator('#continue-deal-button').scrollIntoViewIfNeeded();
  assert.equal(await coverContinue(), 'action-panel');
  assert.equal(await h.app.visible('#continue-deal-button'), true);
  const result = await tapObservedAction(h.app, '#continue-deal-button', intended);
  assert.equal(result.skippedSettled, true);
  assert.deepEqual(h.taps, []);
});

test('the exact native hit-test cover error skips only the same-hand settled panel before any input', async () => {
  const h = await harness();
  await page.evaluate(() => (window.current.canContinue = true));
  let attempts = 0;
  const app = {
    ...h.app,
    async nativeTap() {
      attempts++;
      assert.equal(await coverContinue(), 'action-panel');
      throw Error('Native touch target is covered');
    },
  };
  const result = await tapObservedAction(app, '#continue-deal-button', intended);
  assert.equal(result.outcome, 'settled-before-covered-touch');
  assert.equal(result.frameCoverage.hit.id, 'action-panel');
  assert.deepEqual(result.events, []);
  assert.equal(attempts, 1);
  assert.deepEqual(h.taps, [], 'The preflight never emits a pointer gesture');
});

test('settled-cover recovery preserves wrong-frame, changed-hand, playing-state, fold and actual driver errors', async () => {
  for (const options of [
    { cover: 'next-button' },
    { cover: 'unrelated-overlay' },
    { changedHand: true },
    { done: false },
    { selector: '#fold-button' },
    { error: 'UiAutomator2 disconnected' },
    { error: 'WebView script timed out' },
    { error: 'element click intercepted by an unrelated element' },
  ]) {
    const h = await harness();
    await page.evaluate(() => (window.current.canContinue = true));
    let attempts = 0;
    const error = Error(options.error || 'Native touch target is covered');
    const app = {
      ...h.app,
      async nativeTap() {
        attempts++;
        await coverContinue(options);
        throw error;
      },
    };
    await assert.rejects(
      tapObservedAction(app, options.selector || '#continue-deal-button', intended),
      (received) => received === error,
    );
    assert.equal(attempts, 1);
    assert.deepEqual(h.taps, []);
  }
});

test('a covered-frame error after an actual input is never mistaken for a preflight skip', async () => {
  const h = await harness();
  await page.evaluate(() => (window.current.canContinue = true));
  const error = Error('Native touch target is covered');
  const app = {
    ...h.app,
    async nativeTap(selector) {
      await h.app.nativeTap(selector);
      await coverContinue();
      throw error;
    },
  };
  await assert.rejects(tapObservedAction(app, '#continue-deal-button', intended), (received) => {
    assert.equal(received, error);
    assert.equal(
      received.settlementDiagnostics.events.filter((event) => event.type === 'click').length,
      1,
    );
    return true;
  });
  assert.deepEqual(h.taps, ['#continue-deal-button']);
});

test('a hidden continue from a different hand fails instead of being accepted as a settled skip', async () => {
  const h = await harness({ done: true });
  await page.evaluate(() => window.current.hand++);
  await assert.rejects(
    tapObservedAction(h.app, '#continue-deal-button', intended),
    /Positioning must stay on the intended hand/,
  );
  assert.deepEqual(h.taps, []);
});

test('a misdirected native tap fails once and retains the actual event instead of repeating until fold succeeds', async () => {
  const h = await harness({ hit: '#continue-deal-button' });
  await assert.rejects(tapObservedAction(h.app, '#fold-button', intended), (error) => {
    assert.match(error.message, /intended button/);
    assert.equal(error.settlementDiagnostics.events.at(-1).target, 'continue-deal-button');
    return true;
  });
  assert.deepEqual(h.taps, ['#fold-button']);
});

test('observed action rejects forged, duplicate, changed-hand and unapplied fold events', () => {
  const state = {
    ...intended,
    replayAttempt: intended.attempt,
    players: [{ folded: true }],
  };
  const click = { ...intended, type: 'click', target: 'fold-button', trusted: true };
  assertObservedAction({ state, events: [click] }, '#fold-button', intended);
  for (const events of [[], [click, click], [{ ...click, trusted: false }]])
    assert.throws(() => assertObservedAction({ state, events }, '#fold-button', intended));
  for (const field of ['sessionNumber', 'hand', 'attempt']) {
    const event = { ...click, [field]: intended[field] + 1 };
    assert.throws(() => assertObservedAction({ state, events: [event] }, '#fold-button', intended));
    const changed = {
      ...state,
      [field === 'attempt' ? 'replayAttempt' : field]: intended[field] + 1,
    };
    assert.throws(() =>
      assertObservedAction({ state: changed, events: [click] }, '#fold-button', intended),
    );
  }
  assert.throws(() =>
    assertObservedAction(
      { state: { ...state, players: [{ folded: false }] }, events: [click] },
      '#fold-button',
      intended,
    ),
  );
});

test('only a production-prevented obsolete next click on the original settled hand is accepted', () => {
  // Replay of the captured event report, not a claim of actual native input.
  // The real Event's post-dispatch defaultPrevented read is checked above.
  const same = { ...intended, trusted: true };
  const result = {
    armed: {
      state: { ...intended, replayAttempt: intended.attempt, phase: 'playing', canContinue: true },
    },
    state: {
      ...intended,
      replayAttempt: intended.attempt,
      phase: 'done',
      players: [{ folded: true }],
    },
    events: [
      { ...same, type: 'pointerdown', target: null, phase: 'playing', defaultPrevented: false },
      { ...same, type: 'pointerup', target: null, phase: 'done', defaultPrevented: false },
      { ...same, type: 'click', target: 'next-button', phase: 'done', defaultPrevented: true },
    ],
  };
  assert.equal(
    assertObservedAction(result, '#continue-deal-button', intended),
    'settled-with-obsolete-next-blocked',
  );
  const cases = [
    (r) => (r.events.at(-1).defaultPrevented = false),
    (r) => delete r.events.at(-1).defaultPrevented,
    (r) => (r.events.at(-1).phase = 'playing'),
    (r) => (r.state.phase = 'playing'),
    (r) => (r.armed.state.phase = 'done'),
    (r) => (r.armed.state.canContinue = false),
    (r) => r.armed.state.hand++,
    (r) => r.state.hand++,
    (r) => r.events[0].hand++,
    (r) => r.events.at(-1).attempt++,
    (r) => (r.events[1].trusted = false),
    (r) => (r.events[0].target = 'next-button'),
    (r) => (r.events.at(-1).target = 'reset-button'),
    (r) => r.events.push({ ...r.events.at(-1) }),
    (r) => r.events.splice(0, 1),
    (r) => r.events.splice(1, 1),
  ];
  for (const change of cases) {
    const invalid = structuredClone(result);
    change(invalid);
    assert.throws(() => assertObservedAction(invalid, '#continue-deal-button', intended));
  }
  assert.throws(() => assertObservedAction(result, '#fold-button', intended));
});

test('only the exact observed continue gesture cancelled by same-hand settlement is recorded as cancellation', () => {
  // The installed iOS report has these two trusted events and no click.
  // This fixture checks classification; it is not fabricated native proof.
  const same = {
    ...intended,
    trusted: true,
    target: 'continue-deal-button',
    pointerId: 7,
    pointerType: 'touch',
  };
  const result = {
    armed: {
      state: { ...intended, replayAttempt: intended.attempt, phase: 'playing', canContinue: true },
    },
    state: {
      ...intended,
      replayAttempt: intended.attempt,
      phase: 'done',
      players: [{ folded: true }],
    },
    events: [
      { ...same, type: 'pointerdown', phase: 'playing' },
      { ...same, type: 'pointerup', phase: 'done' },
    ],
  };
  assert.equal(
    assertObservedAction(result, '#continue-deal-button', intended),
    'settled-during-cancelled-touch',
  );
  const cases = [
    (r) => (r.events[0].target = null),
    (r) => (r.events[1].target = 'next-button'),
    (r) => (r.events[0].phase = 'done'),
    (r) => (r.events[1].phase = 'playing'),
    (r) => (r.state.phase = 'playing'),
    (r) => (r.armed.state.phase = 'done'),
    (r) => (r.armed.state.canContinue = false),
    (r) => r.armed.state.replayAttempt++,
    (r) => r.state.hand++,
    (r) => r.events[0].sessionNumber++,
    (r) => r.events[1].attempt++,
    (r) => (r.events[0].trusted = false),
    (r) => (r.events[1].trusted = false),
    (r) => r.events[1].pointerId++,
    (r) => (r.events[1].pointerType = 'mouse'),
    (r) => r.events.reverse(),
    (r) => r.events.push({ ...r.events[0] }),
    (r) => r.events.splice(0, 1),
    (r) => (r.events[1].type = 'pointercancel'),
    (r) => r.events.push({ ...same, type: 'click', target: 'next-button', phase: 'done' }),
  ];
  for (const change of cases) {
    const invalid = structuredClone(result);
    change(invalid);
    assert.throws(() => assertObservedAction(invalid, '#continue-deal-button', intended));
  }
  assert.throws(() => assertObservedAction(result, '#fold-button', intended));
});

test('settlement never accepts a newly opened hand as the original completed snapshot', async () => {
  const h = await harness({ done: true });
  let reads = 0;
  const app = {
    ...h.app,
    async state() {
      const state = await h.app.state();
      if (reads++) state.hand++;
      return state;
    },
  };
  await assert.rejects(
    settleObservedNativeHand(app, { settledBeforeHero: true }),
    /Settlement must stay on the intended hand/,
  );
  assert.deepEqual(h.taps, []);
});
