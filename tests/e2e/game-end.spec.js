import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.noir.getState());
// Seek every running animation so frames are checked without waiting on timers.
const seek = (page, selector, time) =>
  page.evaluate(
    ({ selector, time }) => {
      for (const animation of document.getAnimations()) {
        const target = animation.effect?.target;
        if (target?.closest?.(selector)) {
          animation.pause();
          animation.currentTime = time;
        }
      }
    },
    { selector, time },
  );
// Settle every finite animation; looping ones (turn glow, emotion halos) have
// no end to jump to.
const finishAnimations = () =>
  document
    .getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    .forEach((animation) => animation.finish());
// The hero's final place stands undimmed, centred above the hole cards, and
// never covers the board.
async function expectHeroPlace(page, label, standing) {
  const place = page.locator('#hero-place');
  await expect(place).toBeVisible();
  await expect(place).toHaveText(label);
  await expect(place).toHaveClass(standing);
  const geometry = await place.evaluate((tag) => {
    const box = (el) => el.getBoundingClientRect(),
      t = box(tag),
      cards = box(document.querySelector('#hero-cards')),
      board = box(document.querySelector('.table-center .board'));
    let opacity = 1;
    for (let el = tag; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
    return {
      centred: Math.abs(t.left + t.width / 2 - (cards.left + cards.width / 2)) < 2,
      clearOfBoard: t.top >= board.bottom - 1,
      onCards: t.bottom - cards.top,
      cardHeight: cards.height,
      height: t.height,
      opacity,
    };
  });
  expect(geometry.centred).toBe(true);
  expect(geometry.clearOfBoard).toBe(true);
  expect(geometry.onCards).toBeLessThan(geometry.cardHeight * 0.3);
  expect(geometry.height).toBeCloseTo(30, 0);
  expect(geometry.opacity).toBe(1);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
});

test('a premium start lights the hole cards after the deal, then the effect leaves', async ({
  page,
}) => {
  await page.clock.install();
  await page.evaluate(() => window.qa.premiumStart());
  const wrap = page.locator('main.main .hero-cards-wrap');
  await expect(wrap).not.toHaveClass(/premium-start/);
  await page.clock.runFor(1200);
  await expect(wrap).toHaveClass(/premium-start/);
  await expect(wrap.locator('.premium-spark')).toHaveCount(18);
  await expect(wrap.locator('.playing-card').first()).toHaveCSS('animation-name', 'deal-card');
  // The glow sits just outside each card: off the hero's turn too, the cards
  // must not clip it (iOS and Web showed sparks without the violet edge).
  await wrap.evaluate((el) => el.classList.remove('turn-attention'));
  for (const card of await wrap.locator('.hero-cards > .playing-card').all()) {
    await expect(card).toHaveCSS('overflow', 'visible');
    expect(await card.evaluate((el) => getComputedStyle(el, '::after').animationName)).toBe(
      'premium-glow',
    );
  }
  await page.clock.runFor(2700);
  await expect(wrap).not.toHaveClass(/premium-start/);
  await expect(wrap.locator('.premium-sparks')).toHaveCount(0);
});

test('opponent actions preserve premium card nodes and the running glow', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(() => {
    window.qa.premiumStart();
    window.qa.seatAction('call');
  });
  expect((await state(page)).actor).not.toBe('你');
  await page.clock.runFor(1200);
  const wrap = page.locator('main.main .hero-cards-wrap');
  await expect(wrap).toHaveClass(/premium-start/);
  expect(
    await wrap.evaluate((wrap) => {
      window.__premiumCards = [...wrap.querySelectorAll('.hero-cards > .playing-card')];
      window.__premiumGlows = document
        .getAnimations()
        .filter((a) => a.animationName === 'premium-glow');
      for (const glow of window.__premiumGlows) {
        glow.pause();
        glow.currentTime = 850;
      }
      return window.__premiumGlows.length;
    }),
  ).toBe(2);
  for (let action = 0; action < 2; action++) {
    const before = await state(page);
    expect(before.actor).not.toBe('你');
    await page.evaluate(() => window.qa.seatAction('call'));
    expect((await state(page)).actor).not.toBe(before.actor);
    expect(
      await wrap.evaluate((wrap) => {
        const cards = [...wrap.querySelectorAll('.hero-cards > .playing-card')];
        const animations = document.getAnimations();
        return {
          sameCards: cards.every((card, i) => card === window.__premiumCards[i]),
          sameGlows: window.__premiumGlows.every(
            (glow) => animations.includes(glow) && glow.currentTime === 850,
          ),
        };
      }),
    ).toEqual({ sameCards: true, sameGlows: true });
  }
  await page.clock.runFor(2700);
  await expect(wrap).not.toHaveClass(/premium-start/);
  await expect(wrap.locator('.premium-sparks')).toHaveCount(0);
  await page.evaluate(() => window.qa.seatAction('call'));
  await expect(wrap).not.toHaveClass(/premium-start/);
});

test('retry replaces the card nodes even when the original hole cards are identical', async ({
  page,
}) => {
  const before = await page.evaluate(() => {
    const state = window.qa.recordsStart();
    window.__originalHeroCards = [...document.querySelector('#hero-cards').children];
    return state;
  });
  await page.evaluate(() => window.qa.recordsFinish());
  const after = await page.evaluate(() => window.qa.recordsRetry());
  expect(after.hole).toEqual(before.hole);
  expect(after.replayAttempt).toBe(1);
  expect(
    await page.evaluate(() => {
      const cards = [...document.querySelector('#hero-cards').children];
      return cards.length === 2 && cards.every((card, i) => card !== window.__originalHeroCards[i]);
    }),
  ).toBe(true);
  await expect(page.locator('#hero-cards .card-deal')).toHaveCount(2);
});

for (const heroWins of [true, false]) {
  test(`${heroWins ? 'the hero' : 'the last bot'} gets the trophy after winning heads-up`, async ({
    page,
  }) => {
    await page.evaluate((heroWins) => window.qa.finale({ heroWins }), heroWins);
    await page.evaluate(() => window.qa.finaleShowdown());
    const view = await state(page);
    expect(view.over).toEqual({ heroPlace: heroWins ? 1 : 2, championId: heroWins ? 0 : 1 });
    await expect(page.locator('.trophy-stage')).toHaveCount(1);
    await expect(page.locator('.trophy-caption')).toHaveText(
      heroWins ? '你获得冠军' : 'Mia 获得冠军',
    );
    await expect(page.locator('.confetti-layer')).toHaveCount(heroWins ? 1 : 0);
    await expect(page.locator('.farewell-stage')).toHaveCount(0);
    if (heroWins) await expect(page.locator('.confetti-piece')).toHaveCount(112);
    const resting = heroWins ? '.hero-champion-trophy' : '.seat-1 .champion-trophy';
    await expect(page.locator(resting)).toHaveClass(/trophy-pending/);
    // A beaten hero's place waits for the trophy to land.
    await expect(page.locator('#hero-place')).toBeHidden();
    await seek(page, '.trophy-stage', 1000);
    await page.screenshot({ path: test.info().outputPath(`trophy-flight-${heroWins}.png`) });
    await page.evaluate(finishAnimations);
    await expect(page.locator('.trophy-stage')).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator(resting)).not.toHaveClass(/trophy-pending/);
    await expect(page.locator('.champion-trophy')).toHaveCount(1);
    // The trophy rests clear of its champion: centred above the hero's hole
    // cards, or beside the bot's profile on its roomier side, and it shimmers.
    const placement = await page.locator(resting).evaluate(async (trophy) => {
      // Measure the resting size, not the landing's oversized first frames.
      await Promise.all(trophy.getAnimations().map((animation) => animation.finished));
      const box = (el) => el.getBoundingClientRect();
      const t = box(trophy);
      const animations = trophy
        .getAnimations({ subtree: true })
        .map((a) => a.animationName)
        .filter((name) => /^trophy-(glow|rays|spark)$/.test(name));
      if (trophy.matches('.hero-champion-trophy')) {
        const cards = box(document.querySelector('#hero-cards')),
          board = box(document.querySelector('.table-center .board'));
        // It shrinks to the room below the board and only sinks onto the
        // top of the cards (never over the board) when that room runs out.
        return {
          centred: Math.abs(t.left + t.width / 2 - (cards.left + cards.width / 2)) < 2,
          clear: t.top >= board.bottom - 1 && t.bottom <= cards.top + cards.height * 0.25,
          shimmer: [...new Set(animations)].sort(),
        };
      }
      const profile = box(trophy.closest('.seat-profile'));
      return {
        centred: Math.abs(t.top + t.height / 2 - (profile.top + profile.height / 2)) < 2,
        clear: t.right <= profile.left || t.left >= profile.right,
        shimmer: [...new Set(animations)].sort(),
      };
    });
    expect(placement).toEqual({
      centred: true,
      clear: true,
      shimmer: ['trophy-glow', 'trophy-rays', 'trophy-spark'],
    });
    if (heroWins) await expect(page.locator('#hero-place')).toBeHidden();
    else await expectHeroPlace(page, '第2名', /standing-2/);
    await expect(page.locator('#street-label')).toHaveText('本局结束');
    await expect(page.locator('#next-button')).toHaveText('下一局');
    await expect(page.locator('#reset-button')).toBeHidden();
    await expect(page.locator('#restart-hand-button')).toBeVisible();
    await expect(page.locator('#session-title')).toHaveText('本局结束');
    await expect(page.locator('#session-standing')).toHaveText(heroWins ? '冠军' : '第2名');
    await expect(page.locator('#session-standing')).toHaveClass(
      heroWins ? /standing-champion/ : /standing-2/,
    );
    await page.screenshot({ path: test.info().outputPath(`trophy-${heroWins}.png`) });
    const session = view.sessionNumber;
    await page.locator('#next-button').click();
    const next = await state(page);
    expect(next.over).toBeNull();
    expect(next.sessionNumber).toBe(session + 1);
    expect(next.hand).toBe(1);
    await expect(page.locator('.champion-trophy')).toHaveCount(0);
    await expect(page.locator('#hero-place')).toBeHidden();
    await expect(page.locator('#reset-button')).toBeVisible();
    await expect(page.locator('#session-title')).toHaveText('本局练习');
    await page.goto('/#records');
    const finished = page.locator(`[data-session-number="${session}"]`);
    await expect(finished.locator('.record-standing')).toHaveText(heroWins ? '冠军' : '第2名');
    await expect(
      page.locator(`[data-session-number="${session + 1}"] .record-standing`),
    ).toHaveText('进行中');
  });
}

test('retrying the deciding hand withdraws the trophy and the final standing', async ({ page }) => {
  await page.evaluate(() => window.qa.finale({ heroWins: true }));
  await page.evaluate(() => window.qa.finaleShowdown());
  await page.evaluate(finishAnimations);
  await expect(page.locator('.hero-champion-trophy')).toHaveCount(1);
  await page.locator('#restart-hand-button').click();
  const view = await state(page);
  expect(view.over).toBeNull();
  expect(view.replayAttempt).toBe(1);
  await expect(page.locator('.champion-trophy, .trophy-stage')).toHaveCount(0);
  await expect(page.locator('#session-title')).toHaveText('本局练习');
  await expect(page.locator('#reset-button')).toBeVisible();
});

test('busting with refills left shows the refill count, deals at once and counts the stack up', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.finale({ heroWins: false, rivals: 3, rebuysUsed: 1 }));
  await page.evaluate(() => window.qa.finaleShowdown());
  const view = await state(page);
  expect(view.over).toBeNull();
  expect(view.needsRebuy).toBe(true);
  const next = page.locator('#next-button');
  await expect(next).toContainText('补充筹码');
  await expect(next.locator('.rebuy-count')).toHaveText('剩 2 次');
  const hand = view.hand;
  await next.click();
  // The next hand is dealt immediately; the refill effect plays during it.
  const dealt = await state(page);
  expect(dealt.hand).toBe(hand + 1);
  expect(dealt.phase).not.toBe('done');
  expect(dealt.rebuysLeft).toBe(1);
  expect(dealt.needsRebuy).toBe(false);
  await expect(next).toBeHidden();
  await expect(page.locator('.rebuy-burst')).toHaveText('+20K');
  await expect(page.locator('#hero-stack')).toHaveClass(/stack-refill/);
  // The name row stays still while the stack counts up.
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(
      await page.evaluate(() => {
        const name = document.querySelector('.hero-identity > strong').getBoundingClientRect(),
          stack = document.querySelector('#hero-stack');
        return { left: Math.round(name.left * 10) / 10, text: stack.textContent };
      }),
    );
    await page.waitForTimeout(80);
  }
  const lefts = samples.map((sample) => sample.left);
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(0.5);
  expect(new Set(samples.map((sample) => sample.text)).size).toBeGreaterThan(1);
  await page.screenshot({ path: test.info().outputPath('refill.png') });
  await expect(page.locator('.rebuy-burst')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#hero-stack')).not.toHaveClass(/stack-refill/);
  // After the count the stack shows the real amount again (blinds included).
  await expect(page.locator('#hero-stack')).not.toHaveText('0');
  expect((await state(page)).hand).toBe(hand + 1);
});

test('a bot taking the last refill and every other seat in one hand gets the trophy', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.finale({ heroWins: false, rivals: 3, rebuysUsed: 3 }));
  await page.evaluate(() => window.qa.finaleShowdown({ allIn: true }));
  const view = await state(page);
  expect(view.over.championId).toBe(1);
  expect(view.players.filter((p) => !p.out).map((p) => p.id)).toEqual([1]);
  await expect(page.locator('.trophy-stage')).toHaveCount(1);
  await expect(page.locator('.trophy-caption')).toHaveText('Mia 获得冠军');
  await expect(page.locator('.confetti-layer')).toHaveCount(0);
  await page.evaluate(finishAnimations);
  await expect(page.locator('.trophy-stage')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('.seat-1 .champion-trophy')).not.toHaveClass(/trophy-pending/);
  await expect(page.locator('#next-button')).toHaveText('下一局');
  await expect(page.locator('#session-standing')).toHaveText(`第${view.over.heroPlace}名`);
});

for (const [ending, finale] of [
  ['a won game', { heroWins: true }],
  ['a lost game', { heroWins: false }],
  ['an out-of-refills game', { heroWins: false, rivals: 3, rebuysUsed: 3 }],
])
  test(`reloading after ${ending} waits for the next game with no ending replay`, async ({
    page,
  }) => {
    await page.evaluate((finale) => window.qa.finale(finale), finale);
    await page.evaluate(() => window.qa.finaleShowdown());
    const finished = await state(page);
    expect(finished.over).toBeTruthy();
    await page.evaluate(finishAnimations);
    await page.reload();
    await page.waitForFunction(() => !!window.noir?.getState());
    const fresh = await state(page);
    expect(fresh.over).toBeNull();
    expect(fresh.hand).toBe(0);
    expect(fresh.phase).toBe('idle');
    await expect(page.locator('#street-label')).toHaveText(
      `等待入座，即将开始第 ${finished.sessionNumber + 1} 局第 1 手`,
    );
    await expect(page.locator('#session-standing')).toBeHidden();
    await expect(page.locator('#hero-place')).toBeHidden();
    await page.waitForTimeout(1200);
    await expect(
      page.locator('.trophy-stage, .farewell-stage, .confetti-layer, .champion-trophy'),
    ).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('reloaded-after-game.png') });
    // The finished game stays in the records with its result.
    const records = await page.evaluate(() => JSON.parse(localStorage['noir-game-records-v1']));
    expect(records.sessions.at(-1).attempts.at(-1).over).toEqual(finished.over);
  });

test('busting after the last refill ends the game with a place and no champion', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.finale({ heroWins: false, rivals: 3, rebuysUsed: 3 }));
  await page.evaluate(() => window.qa.finaleShowdown());
  const view = await state(page);
  expect(view.over.championId).toBeNull();
  await expect(page.locator('.trophy-stage, .confetti-layer, .champion-trophy')).toHaveCount(0);
  await expectHeroPlace(page, `第${view.over.heroPlace}名`, /standing-/);
  // A grey card at the table's centre tells the final place, then leaves.
  const farewell = page.locator('.table-viewport > .farewell-stage');
  await expect(farewell).toHaveCount(1);
  await expect(farewell.locator('.farewell-title')).toHaveText('很遗憾，本局结束');
  await expect(farewell.locator('.farewell-place')).toHaveText(`第${view.over.heroPlace}名`);
  await expect(farewell.locator('.farewell-note')).toHaveText('补码次数已用完');
  const [card, table] = await Promise.all([
    farewell.locator('.farewell-card').boundingBox(),
    page.locator('.poker-table').boundingBox(),
  ]);
  expect(Math.abs(card.x + card.width / 2 - (table.x + table.width / 2))).toBeLessThan(
    table.width * 0.1,
  );
  expect(card.y).toBeGreaterThan(table.y);
  expect(card.y + card.height).toBeLessThan(table.y + table.height);
  await seek(page, '.farewell-stage', 1200);
  await page.screenshot({ path: test.info().outputPath('farewell.png') });
  await page.evaluate(finishAnimations);
  await expect(farewell).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('#next-button')).toHaveText('下一局');
  await expect(page.locator('#reset-button')).toBeHidden();
  await expect(page.locator('#session-standing')).toHaveText(`第${view.over.heroPlace}名`);
  await expect(page.locator('main.main .hero-area')).toHaveClass(/hero-out/);
  // Eliminated bots stay greyed out with their place.
  await expect(page.locator('.seat-4')).toHaveClass(/seat-out/);
  await expect(page.locator('.seat-4 .seat-action')).toContainText('出局 · 第');
});

test('records drop the live note, keep results at full opacity and toast a save failure once', async ({
  page,
}) => {
  await page.evaluate(() => {
    // The table waits for the hero to take a seat; start a recorded hand.
    window.qa.recordsStart();
    window.qa.recordsFinish();
    window.qa.recordsRetry();
    window.qa.recordsFinish();
  });
  await page.goto('/#records');
  await expect(page.locator('.records-live-note, #records-storage-error')).toHaveCount(0);
  for (const result of await page.locator('.record-hand-result').all())
    await expect(result).toHaveCSS('opacity', '1');
  await expect(page.locator('.compliance-footer')).toHaveText('单机练习·虚拟筹码·禁止赌博');
  await expect(page.locator('.compliance-footer')).toHaveCSS('text-align', 'center');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'noir-game-records-v1') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await backToGame(page);
  await page.evaluate(() => window.qa.recordsNext());
  await expect(page.locator('#app-toast')).toHaveText('对局记录保存失败，关闭后可能丢失。');
  await expect(page.locator('#app-toast')).toBeHidden({ timeout: 5000 });
  await page.evaluate(() => {
    window.qa.recordsFinish();
    window.qa.recordsNext();
  });
  await expect(page.locator('#app-toast')).toBeHidden();
  // A fresh start does not bring the warning back.
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await expect(page.locator('#app-toast')).toBeHidden();
});

test('board and hole cards read as one size across phone, tablet and table sizes', async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [430, 932],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    for (const count of [5, 7, 9]) {
      await page.evaluate((count) => window.qa.publicBoard(count), count);
      await page.waitForTimeout(300);
      // Layout widths, unaffected by the hero cards' tilt.
      const { board, hero } = await page.evaluate(() => ({
        board: document.querySelector('main.main .board .playing-card').offsetWidth,
        hero: document.querySelector('main.main .hero-cards .playing-card').offsetWidth,
      }));
      expect(Math.max(board, hero), `${width}px ${count} seats`).toBeLessThanOrEqual(
        Math.min(board, hero) * 1.1 + 1,
      );
    }
  }
});

test('the disabled raise slider rests at its minimum until the hero acts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.publicBoard(9));
  const slider = page.locator('#bet-slider');
  await expect(slider).toBeDisabled();
  expect(await slider.evaluate((el) => el.value === el.min)).toBe(true);
});

// Records rely on system Back: unwind the detail and list pages to the game.
async function backToGame(page) {
  while (/#records/.test(page.url())) await page.goBack();
}

for (const heroWins of [true, false])
  test(`${heroWins ? 'the hero' : 'a bot'} champion is greeted by the local ${heroWins ? 'full' : 'shorter'} crowd cheer`, async ({
    page,
  }) => {
    const requests = [];
    page.on('request', (request) => {
      if (/cheer/.test(request.url())) requests.push(new URL(request.url()));
    });
    await page.addInitScript(() => {
      window.startedCues = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.startedCues.push({
          seconds: this.buffer.duration,
          channels: this.buffer.numberOfChannels,
        });
        return start.apply(this, args);
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    // A trusted gesture lets the page start its audio context.
    await page.locator('#opponents-button').click();
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.evaluate((heroWins) => window.qa.finale({ heroWins }), heroWins);
    await page.evaluate(() => window.qa.finaleShowdown());
    await expect(page.locator('.trophy-stage')).toHaveCount(1);
    await page.waitForFunction(() => window.startedCues.some((cue) => cue.seconds > 3));
    const cheers = await page.evaluate(() => window.startedCues.filter((cue) => cue.seconds > 3));
    expect(cheers).toHaveLength(1);
    expect(cheers[0].channels).toBe(2);
    expect(cheers[0].seconds).toBeCloseTo(heroWins ? 5.7 : 3.4, 1);
    // The recordings come from the page's own origin, never a remote host.
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(url.origin).toBe(new URL(page.url()).origin);
      expect(url.pathname).toMatch(/^\/audio\/(champion|crowned)-cheer\.m4a$/);
    }
  });
