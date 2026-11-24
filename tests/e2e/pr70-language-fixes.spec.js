import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sourceDigest } from '../../scripts/mobile-lib.mjs';
import { playerCountLocaleLabels } from '../fixtures/pr70-player-count-locales.js';

async function switchLocale(page, locale) {
  await page.locator('#language-select').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }, locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('all eleven locale headers follow real five-to-nine player count and language selections', async ({
  page,
}) => {
  const record = {
    mode: 'vite-test-ui-control-regression',
    project: test.info().project.name,
    viewport: [1700, 1000],
    sourceDigest: sourceDigest(),
    sourceCommitAtExecution: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    sourceDirtyAtExecution:
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
    status: 'running',
    qaFixtureUsed: false,
    cases: [],
    limit:
      'Actual Web UI-control and visible-text regression in Vite test mode; not production or native image acceptance. Both projects intentionally use a wide viewport for the header field.',
  };
  try {
    await page.setViewportSize({ width: 1700, height: 1000 });
    await page.goto('/');
    await page.waitForFunction(
      () => document.documentElement.dataset.appReady === 'true' && !!window.noir?.getState,
    );
    for (const count of [5, 6, 7, 8, 9]) {
      await page.locator('#opponents-button').click();
      await page.locator('#player-count').selectOption(String(count));
      for (const [locale, expected] of Object.entries(playerCountLocaleLabels)) {
        await page.locator('#language-select').selectOption(locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await page.locator('#opponents-dialog .close-dialog').click();
        const label = page.locator('#table-size-label');
        await expect(label).toBeVisible();
        const observation = {
          locale,
          playerCount: count,
          actual: await label.innerText(),
          expected: expected(count),
          actualPlayers: await page.evaluate(() => window.noir.getState().players.length),
          status: 'checking',
        };
        record.cases.push(observation);
        expect(observation.actual).toBe(observation.expected);
        expect(observation.actualPlayers).toBe(count);
        observation.status = 'passed';
        if (locale !== 'ru') await page.locator('#opponents-button').click();
      }
    }
    expect(record.cases).toHaveLength(55);
    expect(sourceDigest()).toBe(record.sourceDigest);
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = String(error);
    throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    const file = test.info().outputPath('player-count-locales.json');
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    await test
      .info()
      .attach('player-count-locales', { path: file, contentType: 'application/json' });
  }
});

test('switching Russian to Chinese redraws current amounts without changing the hand', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.stop();
  });
  const before = await page.evaluate(() => window.noir.getState());
  await switchLocale(page, 'ru');
  await expect(page.locator('#stakes-structure')).toContainText('1.5K');
  await switchLocale(page, 'zh-CN');
  await expect(page.locator('#stakes-structure')).toContainText('1.5K');
  await expect(page.locator('#hero-stack')).not.toContainText(',');
  await expect(page.locator('#pot-value')).not.toContainText(',');
  const after = await page.evaluate(() => window.noir.getState());
  for (const key of [
    'hand',
    'replayAttempt',
    'wealth',
    'actor',
    'phase',
    'stats',
    'players',
    'legal',
  ])
    expect(after[key], key).toEqual(before[key]);
});

test('blind progress names the next level while the original replay badge persists above it', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.foldWin(9);
    window.qa.stop();
  });
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('#blind-progress')).toBeVisible();
  await expect(page.locator('#replay-label')).toBeVisible();
  await expect(page.locator('#blind-progress')).toHaveText('再打 9 手后涨盲到 50 / 100');
  await expect(page.locator('#dismiss-replay')).toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    const blinds = rect('.blind-info'),
      progress = rect('#blind-progress'),
      retry = rect('#replay-label');
    return {
      under: progress.top >= blinds.bottom - 1,
      upper: retry.bottom <= progress.top + 1,
      beforeBlinds: retry.right <= blinds.left,
      inHand: document
        .querySelector('.hand-label')
        .contains(document.querySelector('#replay-label')),
    };
  });
  expect(geometry).toEqual({ under: true, upper: true, beforeBlinds: true, inHand: true });
  const before = await page.evaluate(() => window.noir.getState());
  await switchLocale(page, 'en');
  await expect(page.locator('#replay-label')).toBeVisible();
  await expect(page.locator('#replay-label')).toHaveText('Replay 1');
  await expect(page.locator('#blind-progress')).toHaveText('Hands until blinds rise: 9 · 50 / 100');
  const after = await page.evaluate(() => window.noir.getState());
  expect(after.hand).toBe(before.hand);
  expect(after.replayAttempt).toBe(before.replayAttempt);
  expect(after.wealth).toBe(before.wealth);
});

test('positive review chips use the same green meaning as records', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.foldWin(5, 0);
    window.qa.stop();
  });
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-result-change')).toHaveClass('positive');
  await expect(page.locator('#review-result-change')).toHaveCSS('color', 'rgb(110, 231, 197)');
});

test('showdown names, styles, and amounts refresh without moving or remounting the best five', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.locator('#opponents-button').click();
  await page.locator('[data-bot-seat="1"]').selectOption('jett');
  await page.locator('#opponents-dialog .close-dialog').click();
  await switchLocale(page, 'it');
  await page.evaluate(() => {
    window.qa.finale({ heroWins: false, highCard: true });
    window.qa.finaleShowdown();
    window.qa.stop();
    window.savedWinningCard = document.querySelector('.winning-card');
  });
  await expect(page.locator('#showdown-stage')).toBeVisible();
  const hero = page.locator('#showdown-scene [data-player="0"] .showdown-player-heading > strong');
  const rival = page.locator('#showdown-scene [data-player="1"] .showdown-player-heading > strong');
  await expect(hero).toHaveText('Tu');
  await expect(rival).toContainText('Valore largo');
  const winning = page.locator('.showdown-winner .winning-cards');
  await expect(winning).toHaveClass(/motion-high/);
  await expect(winning.locator('.rank-match')).toHaveAttribute('data-card', '0-14');
  const aligned = () =>
    winning.locator('.playing-card').evaluateAll((cards) => {
      const tops = cards.map((card) => card.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops);
    });
  await switchLocale(page, 'zh-CN');
  await expect(hero).toHaveText('你');
  await expect(rival).toHaveText('Mia（宽松取值）');
  await winning.evaluate((row) =>
    Promise.all(row.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  await expect.poll(aligned).toBeLessThan(0.5);
  await switchLocale(page, 'ru');
  const russian = await page.locator('.showdown-awards').allTextContents();
  await switchLocale(page, 'zh-CN');
  const chinese = await page.locator('.showdown-awards').allTextContents();
  expect(chinese.join(' ')).not.toMatch(/\d,\d/);
  expect(russian.join(' ')).not.toBe(chinese.join(' '));
  await switchLocale(page, 'pt');
  const losingFooter = page.locator('.showdown-player:not(.showdown-winner) .showdown-awards');
  await expect(losingFooter).toHaveCount(1);
  await expect(losingFooter).toHaveText('As 5 melhores cartas');
  for (const locale of Object.keys(playerCountLocaleLabels)) {
    await switchLocale(page, locale);
    await switchLocale(page, 'zh-CN');
    await expect(hero).toHaveText('你');
    await expect(rival).toHaveText('Mia（宽松取值）');
  }
  expect(
    await page.evaluate(() => window.savedWinningCard === document.querySelector('.winning-card')),
  ).toBe(true);
});

test('settings sentences remain separated across the blind-summary span', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await switchLocale(page, 'en');
  await page.locator('#opponents-button').click();
  await expect(page.locator('#stakes-description')).toContainText('Tap the small blind');
  await expect(page.locator('#stakes-description')).toContainText('small blind. Blinds');
});

test('a visible blind-level notice changes language without restarting the deal', async ({
  page,
}) => {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa, null, { polling: 20 });
  await switchLocale(page, 'it');
  await page.evaluate(() => window.qa.noticeHand({ count: 5 }));
  await page.clock.runFor(20);

  const stage = page.locator('.table-notice-stage');
  const title = stage.locator('.table-notice-title');
  await expect(title).toHaveText('Bui saliti a 200 / 400');
  const initial = await stage.elementHandle();
  const before = await page.evaluate(() => window.noir.getState());
  await switchLocale(page, 'zh-CN');
  await expect(title).toHaveText('盲注升至 200 / 400');
  await expect(stage.locator('.table-notice-caption')).toHaveText('每 10 手升一级');
  expect(
    await initial.evaluate((node) => node === document.querySelector('.table-notice-stage')),
  ).toBe(true);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
  await page.clock.runFor(1800);
  await expect(stage).toHaveCount(0);
});

test('English blind captions fit one line and retain their full accessible meaning', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.skipTutorialReading();
  });
  await switchLocale(page, 'en');
  await page.locator('#rules-button').click();
  await page.locator('#tutorial-menu-item').click();
  await page.locator('#tutorial-dialog-primary').click();
  for (let step = 0; step < 20; step++) {
    const t = await page.evaluate(() => window.noir.getState().tutorial);
    if (t.allowed?.action === 'call') break;
    if (t.canContinue) await page.locator('#tutorial-next').click();
    else await page.waitForTimeout(60);
  }
  const label = page.locator('.seat[data-player="1"] .seat-action-label');
  await expect(label).toHaveText('SB');
  await expect(label).toHaveAttribute('aria-label', 'Small blind');
  const sameLine = await label.evaluate((el) => {
    const amount = el.nextElementSibling;
    const a = el.getBoundingClientRect(),
      b = amount.getBoundingClientRect();
    return (
      Math.abs(a.top - b.top) < 3 && b.right <= el.parentElement.getBoundingClientRect().right + 1
    );
  });
  expect(sameLine).toBe(true);
});

for (const locale of ['es', 'it', 'pt', 'ru', 'ja'])
  test(`${locale} settled labels fit their buttons at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await switchLocale(page, locale);
    await page.evaluate(() => {
      window.qa.foldWin(5, 0);
      window.qa.stop();
    });
    const overflow = await page
      .locator('#action-panel > button:not([hidden])')
      .evaluateAll((buttons) =>
        buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
      );
    expect(overflow).toEqual([]);
  });

for (const locale of ['en', 'ja'])
  test(`${locale} review facts are translated once through the rendered DOM`, async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await switchLocale(page, locale);
    const result = await page.evaluate(async (locale) => {
      const { renderReviewParagraphs } = await import('/src/ui/review-matchups.js');
      const { localizeText, setLocalizedHTML } = await import('/src/i18n/index.js');
      const parts =
        locale === 'ja'
          ? [
              'River用A♠ 8♣主动开池，拿出 1K 建立底池，希望较弱起手牌跟入；后面的玩家若不愿付这笔筹码，就会直接弃牌。',
              '其余一位玩家尚可行动，该玩家是否继续会改变你能争夺的底池和对抗人数。',
            ]
          : ['跟注占可争夺底池约 40%。', '随机范围与行动加权范围下，底池权益分别约 50% / 47%。'];
      const element = document.createElement('div');
      setLocalizedHTML(element, renderReviewParagraphs([parts.join('')], null, 0, [parts]));
      return {
        text: element.textContent,
        once: parts.map(localizeText).join(locale === 'ja' ? '' : ' '),
      };
    }, locale);
    expect(result.text).toBe(result.once);
    if (locale === 'ja') {
      expect(result.text).toContain('参加');
      expect(result.text).toContain('次第');
      expect(result.text).not.toContain('参と');
      expect(result.text).not.toContain('次ハンド');
    } else expect(result.text).toContain('pot. Pot equity');
  });

function readHeaderIssues() {
  const rect = (s) => document.querySelector(s).getBoundingClientRect();
  const hand = rect('.hand-label'),
    tag = rect('#replay-label'),
    blinds = rect('.blind-info'),
    row = rect('.surface-bottom'),
    hint = rect('.table-notices'),
    progress = rect('#blind-progress'),
    arena = rect('#arena'),
    felt = rect('.poker-table');
  const issues = [];
  if (document.querySelector('#dismiss-replay')) issues.push('unrequested close button');
  if (
    tag.width <= 0 ||
    tag.left < hand.left - 1 ||
    tag.right > hand.right + 1 ||
    tag.right > blinds.left - 1
  )
    issues.push(
      'upper replay badge clipped or overlaps blinds: ' +
        JSON.stringify({
          hand: hand.toJSON(),
          tag: tag.toJSON(),
          blinds: blinds.toJSON(),
        }),
    );
  if (tag.top < hand.top - 1 || tag.bottom > hand.bottom + 1 || tag.bottom > row.top + 1)
    issues.push('replay leaves original upper hand row');
  if (
    progress.top < blinds.bottom - 1 ||
    progress.bottom > row.bottom + 1 ||
    progress.right > row.right + 1
  )
    issues.push('countdown leaves row below blinds');
  const handCenters = [...document.querySelector('.hand-label').children]
    .map((item) => item.getBoundingClientRect())
    .filter((box) => box.width > 0)
    .map((box) => (box.top + box.bottom) / 2);
  if (Math.max(...handCenters) - Math.min(...handCenters) > 1)
    issues.push('hand labels wrap to more than one line');
  const countdownStyle = getComputedStyle(document.querySelector('#blind-progress'));
  if (
    countdownStyle.whiteSpace !== 'nowrap' ||
    progress.height > parseFloat(countdownStyle.lineHeight) + 1
  )
    issues.push('blind countdown wraps');
  const gap = progress.left - hint.right;
  if (hint.width <= 0 || gap < 4 || gap > 7 || hint.left > row.left + 1)
    issues.push('hint does not use available left width');
  if (row.bottom > arena.top + 1 || felt.height < 100 || arena.width <= 0 || arena.height <= 0)
    issues.push('header intrudes into table budget');
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflows');
  const textRects = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()];
  };
  for (const [selector, box] of [
    ['.hand-label', hand],
    ['.blind-info', blinds],
    ['#blind-progress', progress],
  ]) {
    if (
      textRects(document.querySelector(selector)).some(
        (r) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1),
      )
    )
      issues.push(`${selector} has clipped text`);
  }
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#replay-attempt'));
  const ink = range.getBoundingClientRect();
  if (ink.left < tag.left || ink.right > tag.right + 1)
    issues.push('replay text does not fit original badge');
  return issues;
}

for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'])
  test(`${locale} header keeps complete hand, blinds, replay and countdown on single lines through rotation`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Explicit responsive matrix runs once.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await switchLocale(page, locale);
    await page.evaluate(() => document.fonts.ready);
    const waiting = await page.locator('.poker-table').boundingBox();
    await page.locator('#join-table-button').click();
    await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
    const playing = await page.locator('.poker-table').boundingBox();
    for (const key of ['x', 'y', 'width', 'height'])
      expect(Math.abs(waiting[key] - playing[key])).toBeLessThanOrEqual(1.1);
    for (const smallBlind of [100, 250, 50000]) {
      await page.evaluate((smallBlind) => {
        // Match the normal production header: 100 / 200 is wider than the
        // generic foldWin fixture's 25 / 50, especially beside Japanese labels.
        window.qa.recordsStart({ count: 9, smallBlind });
        window.qa.recordsFinish();
        window.qa.stop();
      }, smallBlind);
      await page.locator('#restart-hand-button').click();
      await page.evaluate(() => window.qa.stop());
      await switchLocale(page, locale);
      await page.evaluate(() => document.fonts.ready);
      const before = await page.evaluate(() => window.qa.snapshot());
      const publicBefore = await page.evaluate(() => window.noir.getState());
      expect([publicBefore.smallBlind, publicBefore.bigBlind]).toEqual([
        smallBlind,
        smallBlind * 2,
      ]);
      for (const size of [
        { width: 320, height: 568 },
        { width: 320, height: 667 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1024, height: 1366 },
        { width: 1366, height: 1024 },
        { width: 1280, height: 900 },
        { width: 1700, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(size);
        await expect
          .poll(
            () => page.evaluate(readHeaderIssues),
            `${locale} ${smallBlind}/${smallBlind * 2} ${size.width}x${size.height}`,
          )
          .toEqual([]);
        await expect(page.locator('#replay-label')).toBeVisible();
        expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
        expect(await page.evaluate(() => window.noir.getState())).toEqual(publicBefore);
      }
      // The longer translated settlement status must also fit next to the
      // replay badge and maximum blind amounts on the smallest phone.
      await page.setViewportSize({ width: 320, height: 667 });
      await page.evaluate(() => {
        window.qa.recordsFinish();
        window.qa.stop();
      });
      await expect
        .poll(() => page.evaluate(readHeaderIssues), `${locale} ${smallBlind} settled replay`)
        .toEqual([]);
    }
  });

test('review game prose formats chips and punctuation in its rendered locale', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await switchLocale(page, 'pt');
  const result = await page.evaluate(async () => {
    const { setLocalizedHTML, localizeDocument } = await import('/src/i18n/index.js');
    const { renderReviewParagraphs } = await import('/src/ui/review-matchups.js');
    const node = document.querySelector('#review-coach-explanation');
    const source = '对手最近一次翻前加注：Kai在 CO 位 2-bet 开池至 1.1K。';
    setLocalizedHTML(node, renderReviewParagraphs([source], null, 0));
    const text = node.textContent;
    const fragment = document.createElement('p');
    node.append(fragment);
    setLocalizedHTML(fragment, 'Alex 弃牌。42.4% / 4.0 BB');
    const facts = fragment.textContent;
    localizeDocument(node);
    return { text, facts, repeated: node.textContent };
  });
  expect(result.text).toContain('Kai');
  expect(result.text).toContain('1.1K.');
  expect(result.text).not.toContain('。');
  expect(result.facts).toContain('. 42.4% / 4.0 BB');
  expect(result.repeated).toBe(result.text + result.facts);
  await switchLocale(page, 'zh-CN');
  await page.evaluate(() => {
    window.qa.shortAllinSettlement();
    window.qa.stop();
  });
  await switchLocale(page, 'pt');
  await page.locator('#pot-details-button').click();
  for (const summary of await page.locator('.pot-distribution > summary').all())
    await summary.click();
  const lists = await page.locator('.pot-distribution-body > p:first-child').allTextContents();
  expect(lists.some((text) => text.includes(', '))).toBe(true);
  expect(lists.join('')).not.toContain('、');
});

test('an opponent preflop passage joins its comma clauses with spaces in Latin locales', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await switchLocale(page, 'en');
  const text = await page.evaluate(async () => {
    const { setLocalizedHTML } = await import('/src/i18n/index.js');
    const { renderReviewParagraphs } = await import('/src/ui/review-matchups.js');
    const node = document.querySelector('#review-coach-explanation');
    const parts = [
      '这次你在 CO 位 2-bet 开池至 600，',
      'Alex 在 BTN 位拿 Q♣ 7♦ 选择较宽地跟注，用 600 保留看翻牌的机会，这笔投入占行动前剩余筹码的 3.4%。',
    ];
    setLocalizedHTML(node, renderReviewParagraphs([parts.join('')], null, 0, [parts]));
    return node.textContent;
  });
  expect(text).toMatch(/This time, .*600, Alex .*calls wide with Q♣ 7♦, putting in 600/);
  expect(text).not.toMatch(/,\S/);
  expect(text).not.toMatch(/[\u4e00-\u9fff]/);
});

test('rotating menu labels keep a constant text-to-arrow gap and centered icons', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit viewport matrix runs once.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await switchLocale(page, locale);
    for (const width of [320, 390, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const center = ({ top, bottom }) => (top + bottom) / 2;
        const arrow = box('.guide-menu-arrow');
        const trigger = box('#rules-button');
        const guide = [...document.querySelectorAll('[data-guide-label]')];
        return {
          gaps: guide.map((label) => arrow.left - label.getBoundingClientRect().right),
          arrowCentered: Math.abs(center(arrow) - center(trigger)) < 1,
          settingsIconCentered:
            Math.abs(center(box('#opponents-button svg')) - center(box('#opponents-button'))) < 1,
          labelsAligned:
            Math.abs(center(box('.guide-rotating-label')) - center(box('#opponents-button span'))) <
            1,
        };
      });
      expect(geometry, `${locale} at ${width}px`).toEqual({
        gaps: [3, 3, 3, 3],
        arrowCentered: true,
        settingsIconCentered: true,
        labelsAligned: true,
      });
    }
  }
});

test('overflowing hints keep their full text and repeat after changing the language', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit locale matrix runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.evaluate(() => window.qa.heroTurn(9));
  const banner = page.locator('#coach-content');
  const tip = page.locator('#coach-tip');
  const duplicate = banner.locator('.hint-marquee-copy');
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await switchLocale(page, locale);
    await page.clock.runFor(16);
    await expect(banner).toHaveAttribute('data-scrolling', 'true');
    await expect(tip).toHaveCSS('text-overflow', 'clip');
    await expect(duplicate).toHaveText(await tip.textContent());
    expect(await tip.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1,
    );
  }
  // The second copy takes over at the exact same position as the first
  // copy at the start of the track.
  await page.evaluate(() => {
    window.qa.heroTurn(9);
  });
  const lap = await duplicate.evaluate((node) => node.offsetLeft - node.previousSibling.offsetLeft);
  await page.clock.runFor(1200 + Math.ceil(((lap - 15) * 1000) / 35));
  const before = await banner.evaluate((node) => node.scrollLeft);
  expect(before).toBeGreaterThan(lap - 20);
  await page.clock.runFor(900);
  expect(await banner.evaluate((node) => node.scrollLeft)).toBeLessThan(30);
});

test('translated opponent wins and showdown ranks remain complete through rotation', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Explicit responsive matrix runs once.');
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  for (const locale of ['it', 'pt', 'de', 'fr', 'ru', 'ja', 'ko', 'zh-TW']) {
    await switchLocale(page, locale);
    for (const scenario of ['fold', 'showdown']) {
      await page.evaluate((scenario) => {
        if (scenario === 'fold') window.qa.foldWin(5);
        else
          window.qa.scene('5s 4s', '6s 7s 8s As 2h', {
            count: 5,
            otherHoles: { 4: 'Ts 9s' },
          });
        window.qa.stop();
      }, scenario);
      const badges = page.locator('.seat .hand-rank');
      await expect(badges.first()).toBeVisible();
      for (const [width, height] of [
        [320, 667],
        [390, 844],
        [768, 1024],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width, height });
        await expect
          .poll(
            () =>
              badges.evaluateAll((items) =>
                items.every((badge) => {
                  const label = badge.querySelector('.seat-rank-label');
                  const range = document.createRange();
                  range.selectNodeContents(label);
                  const box = badge.getBoundingClientRect();
                  const arena = badge.closest('.table-viewport').getBoundingClientRect();
                  return (
                    getComputedStyle(label).textOverflow === 'clip' &&
                    [...range.getClientRects()].every(
                      (rect) =>
                        rect.left >= Math.max(box.left, arena.left) - 1 &&
                        rect.right <= Math.min(box.right, arena.right) + 1 &&
                        rect.top >= Math.max(box.top, arena.top) - 2 &&
                        rect.bottom <= Math.min(box.bottom, arena.bottom) + 2,
                    )
                  );
                }),
              ),
            `${locale} ${scenario} ${width}x${height}`,
          )
          .toBe(true);
      }
    }
  }
});

test('medium landscape action rail and settings controls have deliberate vertical gaps', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1068, height: 962 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await switchLocale(page, 'de');
  await page.evaluate(() => {
    window.qa.heroTurn(5);
    window.qa.stop();
  });
  for (const width of [901, 1024, 1068, 1150, 1280]) {
    await page.setViewportSize({ width, height: width === 901 ? 820 : 962 });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
            const decision = rect('.decision-strip'),
              bet = rect('.bet-controls'),
              panel = rect('.action-panel');
            return (
              bet.top >= decision.bottom - 1 &&
              bet.top - decision.bottom <= 25 &&
              bet.bottom <= panel.bottom
            );
          }),
        String(width),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 960, height: 1440 });
  await expect(page.locator('#blind-progress')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('#blind-progress').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    )
    .toBeGreaterThanOrEqual(13);
  await page.locator('#opponents-button').click();
  const gap = await page.evaluate(() => {
    const count = document.querySelector('#player-count').closest('.settings-row');
    const box = count.querySelector('.dropdown-trigger') ?? document.querySelector('#player-count');
    return (
      document.querySelector('#small-blind-button').getBoundingClientRect().top -
      box.getBoundingClientRect().bottom
    );
  });
  expect(gap).toBeGreaterThanOrEqual(8);
});

test('the dealing frame of a replay shows the complete localized status', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.evaluate(() => {
    window.qa.foldWin(5);
    window.qa.stop();
    document.querySelector('#restart-hand-button').click();
  });

  for (const [locale, status] of Object.entries({
    ko: '딜하는 중',
    en: 'Dealing',
    ja: '配札中',
    es: 'Repartiendo',
    it: 'Distribuzione',
    pt: 'Distribuindo',
    de: 'Austeilen',
    fr: 'Distribution',
    ru: 'Сдача',
  })) {
    await switchLocale(page, locale);
    await expect(page.locator('#replay-label')).toBeVisible();
    await expect(page.locator('#street-label'), locale).toHaveText(status);
    await expect(page.locator('#decision-text'), locale).toHaveText(status);
    await expect
      .poll(() =>
        page.locator('#street-label').evaluate((label) => {
          const bounds = label.getBoundingClientRect();
          const blind = document.querySelector('.blind-info').getBoundingClientRect();
          return label.scrollWidth <= label.clientWidth + 1 && bounds.right <= blind.left;
        }),
      )
      .toBe(true);
    if (locale === 'ko')
      await page.screenshot({ path: test.info().outputPath('korean-replay-dealing.png') });
  }
});
