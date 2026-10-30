import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(
    () => !!window.qa && document.documentElement.dataset.appReady === 'true',
  );
  await page.evaluate(() => {
    window.qa.stop();
    // QA hands use 25/50. Keep the requested next-hand configuration equal
    // so a legitimate advance continues this game rather than resetting it.
    window.noir.requestSmallBlind('25');
  });
});

async function settleHand(page) {
  const state = await page.evaluate(() => window.qa.foldWin(6));
  expect(state.phase).toBe('done');
  await expect(page.locator('#next-button')).toBeVisible();
  return state;
}

// This deliberately replays a mismatched event sequence. It is deterministic
// coverage of the installed-app retargeting failure, not proof of human input.
async function replayPointerDown(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 17,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    element.dispatchEvent(event);
    return { target: element.id, trusted: event.isTrusted };
  });
}

async function replayPointerClick(page) {
  return page.locator('#next-button').evaluate((button) => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
      button: 0,
    });
    const accepted = button.dispatchEvent(event);
    window.qa.stop();
    return {
      target: button.id,
      trusted: event.isTrusted,
      accepted,
      defaultPrevented: event.defaultPrevented,
      state: window.qa.state(),
    };
  });
}

async function expectRejectedReplay(page, before, origin, testInfo) {
  const replay = await replayPointerClick(page);
  await testInfo.attach('synthetic-retargeting-replay', {
    body: JSON.stringify({
      kind: 'deterministic synthetic replay; not human input',
      origin,
      before,
      replay,
    }),
    contentType: 'application/json',
  });
  expect(origin.trusted).toBe(false);
  expect(replay.trusted).toBe(false);
  expect(replay.state.hand, 'A retargeted click must not start another hand').toBe(before.hand);
  expect(replay.state).toEqual(before);
  expect(replay.accepted).toBe(false);
  expect(replay.defaultPrevented).toBe(true);
}

test('a pointer begun on continue cannot become the next-hand click', async ({
  page,
}, testInfo) => {
  await page.evaluate(() => {
    window.qa.heroTurn(6);
    window.qa.seatAction('fold');
    window.qa.stop();
  });
  await expect(page.locator('#continue-deal-button')).toBeVisible();
  const origin = await replayPointerDown(page, '#continue-deal-button');
  const before = await page.evaluate(() => window.qa.foldRest());
  expect(before.phase).toBe('done');
  // Complete the real settled-hand runout without adding another click that
  // would erase the deliberately retained pointer origin.
  await page.locator('#continue-deal-button').evaluate((button) => button.onclick());
  await expect(page.locator('#continue-deal-button')).toBeHidden();
  await expect(page.locator('#next-button')).toBeVisible();
  const settled = await page.evaluate(() => window.qa.state());
  await expectRejectedReplay(page, settled, origin, testInfo);
});

test('a pointer begun outside next cannot advance the settled hand', async ({ page }, testInfo) => {
  await settleHand(page);
  const before = await page.evaluate(() => window.qa.state());
  const origin = await replayPointerDown(page, '#info-blinds');
  await expectRejectedReplay(page, before, origin, testInfo);
});

test('a next-hand pointer from the previous hand cannot advance the current hand', async ({
  page,
}, testInfo) => {
  const initial = await settleHand(page);
  const origin = await replayPointerDown(page, '#next-button');
  const before = await page.evaluate(() => {
    window.qa.recordsNext();
    window.qa.foldRest();
    return window.qa.state();
  });
  expect(before.phase).toBe('done');
  expect(before.hand).toBe(initial.hand + 1);
  await expectRejectedReplay(page, before, origin, testInfo);
});

test('a real pointer on next advances exactly one hand', async ({ page }) => {
  const before = await settleHand(page);
  await page.locator('#next-button').click();
  const after = await page.evaluate(() => {
    window.qa.stop();
    return window.qa.state();
  });
  expect(after.hand).toBe(before.hand + 1);
  expect(after.phase).not.toBe('done');
  const duplicate = await replayPointerClick(page);
  expect(duplicate.state).toEqual(after);
});

for (const key of ['Enter', 'Space']) {
  test(`keyboard ${key} on next advances exactly one hand`, async ({ page }) => {
    const before = await settleHand(page);
    await page.locator('#next-button').focus();
    await page.keyboard.press(key);
    const after = await page.evaluate(() => {
      window.qa.stop();
      return window.qa.state();
    });
    expect(after.hand).toBe(before.hand + 1);
    expect(after.phase).not.toBe('done');
  });
}

test('an assistive click without a pointer advances exactly one hand', async ({ page }) => {
  const before = await settleHand(page);
  const result = await page.locator('#next-button').evaluate((button) => {
    let click;
    button.addEventListener(
      'click',
      (event) => {
        click = { detail: event.detail, trusted: event.isTrusted };
      },
      { once: true },
    );
    button.click();
    window.qa.stop();
    return { click, state: window.qa.state() };
  });
  expect(result.click).toEqual({ detail: 0, trusted: false });
  expect(result.state.hand).toBe(before.hand + 1);
  expect(result.state.phase).not.toBe('done');
});
