import { after, before, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { joinObservedNativeTable, decodeEntryTouch } from '../native/observed-entry.mjs';

let browser,
  page,
  driverMode = 'WebKit order';
const dictionary = (value) =>
  !driverMode.startsWith('ChromeDriver')
    ? value
    : Array.isArray(value)
      ? value.map(dictionary)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, dictionary(item)]),
          )
        : value;
// Replay the relevant appium-remote-debugger17.5.8 execute_script atom rule:
// an object with a `document` property is wrapped as a Window reference.
// This handle shape/value was captured in CI run41062417432, not invented
// as a zero-event response. Strings bypass this legacy object classifier.
function webkitAtomValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('document' in value) return { WINDOW: ':wdc:1793367599106' };
  if (Array.isArray(value)) return value.map(webkitAtomValue);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, webkitAtomValue(item)]),
  );
}
function test(name, run) {
  for (const driver of ['WebKit order', 'ChromeDriver sorted dictionaries', 'WebKit Selenium atom'])
    nodeTest(`${name} [${driver}]`, async () => {
      driverMode = driver;
      await run();
    });
}
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
after(async () => browser?.close());
async function harness({ delivery = 'real', ignored = false, stalledDeal = false } = {}) {
  // setContent retains the Window and its pending timers. Navigation gives
  // every fake game a fresh document before installing its own state/handler.
  await page.goto('about:blank');
  await page.setContent(
    '<button id="join-table-button" style="margin:40px;width:160px;height:44px">Join</button><button id="other">Other</button>',
  );
  await page.evaluate(
    ({ ignored, stalledDeal }) => {
      window.current = {
        hand: 0,
        sessionNumber: 0,
        replayAttempt: 0,
        phase: 'idle',
        entryState: 'waiting',
        hole: [],
        pot: 0,
        players: [{ stack: 10000 }, { stack: 10000 }],
      };
      window.noir = { getState: () => structuredClone(window.current) };
      const join = () => {
        if (ignored || window.current.phase !== 'idle') return;
        window.current = {
          ...window.current,
          hand: 1,
          sessionNumber: 1,
          phase: 'playing',
          entryState: 'dealing',
          hole: ['A♠', 'Q♥'],
          pot: 300,
          players: [{ stack: 9900 }, { stack: 9800 }],
        };
        if (!stalledDeal) setTimeout(() => (window.current.entryState = 'playing'), 30);
      };
      document.querySelector('#join-table-button').onclick = join;
      document.querySelector('#other').onclick = join;
    },
    { ignored, stalledDeal },
  );
  const evaluate = async (fn, value) => {
    const result = await page.evaluate(fn, dictionary(value));
    return driverMode === 'WebKit Selenium atom' ? webkitAtomValue(result) : dictionary(result);
  };
  const before = await evaluate(() => window.noir.getState());
  let taps = 0,
    pending;
  const budgets = [];
  const realClick = async (selector = '#join-table-button') => {
    const box = await page.locator(selector).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  return {
    before,
    budgets,
    taps: () => taps,
    flush: () => pending,
    app: {
      evaluate,
      async nativeTap(selector) {
        taps++;
        assert.equal(selector, '#join-table-button');
        if (delivery === 'none') return;
        if (delivery === 'delayed') {
          pending = new Promise((resolve, reject) =>
            setTimeout(() => realClick().then(resolve, reject), 30),
          );
          return;
        }
        if (delivery === 'untrusted')
          return page.evaluate(() => document.querySelector('#join-table-button').click());
        if (delivery === 'wrong-target') return realClick('#other');
        if (delivery === 'double') {
          await realClick();
          await realClick();
          return;
        }
        await realClick();
      },
      async waitFor(predicate, budget, message) {
        budgets.push(budget);
        const deadline = Date.now() + Math.min(200, budget);
        while (Date.now() < deadline) {
          const result = await predicate();
          if (result) return result;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw Error(message);
      },
    },
  };
}

test('one real join records its click after the handler and waits for the original deal budget', async () => {
  const h = await harness();
  const result = await joinObservedNativeTable(h.app, h.before);
  assert.equal(h.taps(), 1);
  assert.equal(result.nativeTapCalls, 1);
  assert.equal(result.budgetMs, 10000);
  assert.equal(result.during.hand, 1);
  assert.equal(result.during.hole.length, 2);
  assert.equal(result.state.entryState, 'playing');
  const click = result.events.find((event) => event.type === 'click');
  assert.equal(click.trusted, true);
  assert.equal(click.stateAtEvent.hand, 0);
  assert.equal(click.afterDispatch.hand, 1);
  assert.equal(typeof result.document.hidden, 'boolean');
  assert.ok(result.document.visibilityState);
  assert.ok(h.budgets.every((budget) => budget > 0 && budget <= 10000));
});

test('a native request can return before DOM input without requiring another tap', async () => {
  const h = await harness({ delivery: 'delayed' });
  const result = await joinObservedNativeTable(h.app, h.before);
  await h.flush();
  assert.equal(result.during.hand, 1);
  assert.equal(h.taps(), 1);
});

test('join diagnostics record observed visibility and actual lifecycle details without inventing clock state', async () => {
  const h = await harness();
  const app = {
    ...h.app,
    async nativeTap(selector) {
      await page.evaluate(() => {
        for (const active of [false, true])
          document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active } }));
      });
      return h.app.nativeTap(selector);
    },
  };
  const result = await joinObservedNativeTable(app, h.before);
  assert.deepEqual(
    result.lifecycle.map((event) => event.detail.active),
    [false, true],
  );
  assert.ok(result.lifecycle.every((event) => typeof event.document.hidden === 'boolean'));
  assert.equal(h.taps(), 1);
});

test('no click remains a strict failure with public state and visibility diagnostics', async () => {
  const h = await harness({ delivery: 'none' });
  await assert.rejects(joinObservedNativeTable(h.app, h.before), (error) => {
    assert.match(error.message, /must deliver its actual click/);
    assert.deepEqual(error.entryDiagnostics.events, []);
    assert.equal(error.entryDiagnostics.state.hand, 0);
    assert.equal(error.entryDiagnostics.state.entryState, 'waiting');
    assert.equal(error.entryDiagnostics.nativeTapCalls, 1);
    assert.equal(typeof error.entryDiagnostics.document.hidden, 'boolean');
    return true;
  });
  assert.equal(h.taps(), 1);
});

test('malformed or captured WINDOW wire data fails as transport data instead of becoming zero click', async () => {
  for (const wire of [{ WINDOW: ':wdc:1793367599106' }, '{}', 'not JSON']) {
    const h = await harness();
    const app = {
      ...h.app,
      async evaluate(fn, value) {
        const actual = await h.app.evaluate(fn, value);
        return fn.name === 'readEntryTouch' ? wire : actual;
      },
    };
    await assert.rejects(joinObservedNativeTable(app, h.before), (error) => {
      assert.ok(error.entryDiagnostics.wireFailure);
      assert.deepEqual(error.entryDiagnostics.wireFailure.wire, wire);
      assert.equal(Object.hasOwn(error.entryDiagnostics, 'events'), false);
      return true;
    });
    assert.equal(h.taps(), 1);
  }
});

test('trusted click delivery does not excuse a join handler that leaves the hand waiting', async () => {
  const h = await harness({ ignored: true });
  await assert.rejects(joinObservedNativeTable(h.app, h.before), (error) => {
    assert.match(error.message, /handler must start exactly the next hand/);
    const click = error.entryDiagnostics.events.find((event) => event.type === 'click');
    assert.equal(click.trusted, true);
    assert.equal(click.afterDispatch.hand, 0);
    return true;
  });
  assert.equal(h.taps(), 1);
});

test('programmatic, wrong-target and duplicate clicks never impersonate the single real join', async () => {
  for (const delivery of ['untrusted', 'wrong-target', 'double']) {
    const h = await harness({ delivery });
    await assert.rejects(joinObservedNativeTable(h.app, h.before));
    assert.equal(h.taps(), 1);
  }
});

test('a stalled deal fails within the same total budget without another native touch', async () => {
  const h = await harness({ stalledDeal: true });
  await assert.rejects(joinObservedNativeTable(h.app, h.before), /original10-second budget/);
  assert.equal(h.taps(), 1);
  assert.equal(h.budgets.length, 2);
  assert.ok(h.budgets[1] <= h.budgets[0]);
});

nodeTest(
  'fresh fixture documents prevent a prior30ms timer from falsely completing a stalled deal',
  async () => {
    const previousPage = page;
    const probe = await browser.newPage();
    page = probe;
    try {
      await probe.clock.install({ time: new Date('2026-10-30T00:00:00Z') });
      await probe.clock.pauseAt(new Date('2026-10-30T00:00:01Z'));
      await probe.setContent('<button>Previous fixture</button>');
      await probe.evaluate(() => {
        window.current = { entryState: 'dealing' };
        setTimeout(() => (window.current.entryState = 'playing'), 30);
      });
      const h = await harness({ stalledDeal: true });
      const app = {
        ...h.app,
        async nativeTap(selector) {
          await h.app.nativeTap(selector);
          // Precisely fire any old fixture timer after the new stalled handler,
          // without changing its real timeout or letting timing luck hide a leak.
          await probe.clock.runFor(31);
        },
      };
      await assert.rejects(joinObservedNativeTable(app, h.before), /original10-second budget/);
      assert.equal(await probe.evaluate(() => window.current.entryState), 'dealing');
      assert.equal(h.taps(), 1);
    } finally {
      page = previousPage;
      await probe.close();
    }
  },
);

nodeTest(
  'serialized entry traces retain nested document and every event field without Window wrapping',
  () => {
    const document = { hidden: false, visibilityState: 'visible', hasFocus: true };
    const state = {
      hand: 1,
      phase: 'playing',
      entryState: 'playing',
      hole: ['7♦', '7♥'],
      pot: 300,
      players: [{ stack: 20000 }],
      extraPublicValue: 'preserved',
    };
    const payload = {
      state,
      document,
      events: [
        {
          type: 'click',
          target: 'join-table-button',
          trusted: true,
          defaultPrevented: false,
          stateAtEvent: { ...state, hand: 0 },
          documentAtEvent: document,
          afterDispatch: state,
          documentAfterDispatch: document,
          extraEventField: { document: { diagnostic: true } },
        },
      ],
      lifecycle: [{ detail: { active: true }, state, document }],
    };
    assert.deepEqual(webkitAtomValue(payload), { WINDOW: ':wdc:1793367599106' });
    const wire = webkitAtomValue(JSON.stringify(payload));
    assert.equal(typeof wire, 'string');
    assert.deepEqual(decodeEntryTouch(wire), payload);
    const invalid = [
      undefined,
      { WINDOW: ':wdc:1793367599106' },
      JSON.stringify({ WINDOW: ':wdc:1793367599106' }),
      'not JSON',
      '{}',
      'null',
      '[]',
    ];
    for (const change of [
      (p) => delete p.events,
      (p) => (p.events = {}),
      (p) => (p.lifecycle = {}),
      (p) => (p.document.hidden = 'false'),
      (p) => (p.state.hand = '1'),
      (p) => (p.state.hole = '7♦7♥'),
      (p) => (p.state.players = {}),
      (p) => (p.events[0].trusted = 'true'),
      (p) => delete p.events[0].stateAtEvent,
      (p) => delete p.events[0].documentAtEvent,
      (p) => (p.lifecycle[0].detail.active = 'true'),
    ]) {
      const copy = structuredClone(payload);
      change(copy);
      invalid.push(JSON.stringify(copy));
    }
    for (const wire of invalid) assert.throws(() => decodeEntryTouch(wire));
  },
);
