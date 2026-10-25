import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { pairedTurn, checkedRiver, deepFourBet } from '../fixtures/limped-defense.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import {
  planBotTurn,
  executeBotTurn,
  advanceStreet,
  act,
  legalActions,
  botDecision,
} from '../../src/engine/poker.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

function recorded(fixture, predicate) {
  for (let seed = 1; seed <= 64; seed++) {
    const g = fixture();
    if (!predicate(botDecision(g, clarityRandom(seed)))) continue;
    const plan = planBotTurn(g, clarityRandom(seed), { timingRandom: () => 0.4 });
    executeBotTurn(g, plan, { expedited: true });
    while (g.phase !== 'done') {
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
    }
    g.decisions = [];
    return g;
  }
  throw Error('No matching recorded decision');
}
async function open(page, g) {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), g);
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  return page.locator('#review-opponent-detail .review-explanation');
}
const action = (p) => p.decision?.action ?? p.action;
for (const [name, fixture, predicate, copy] of [
  ['a9-defense', pairedTurn, (p) => action(p) === 'call', '选择跟注'],
  [
    'flop-value',
    () => pairedTurn({ flop: true }),
    (p) => action(p) === 'raise',
    '向较弱对子和听牌收费',
  ],
  [
    'river-value',
    () => checkedRiver({ beforeBet: true }),
    (p) => action(p) === 'raise',
    '河牌改善成对后用小注',
  ],
  ['deep-ak', deepFourBet, (p) => action(p) === 'fold', '42.4%'],
])
  test(name + ' recorded action and explanation agree', async ({ page }, info) => {
    const g = recorded(fixture, predicate),
      body = await open(page, g);
    await expect(body).toContainText(copy);
    await expect(body).not.toContainText('当前成牌仍可能遇到更大牌');
    await mkdir('.artifacts/limped-defense-2026-10-25/web', { recursive: true });
    await body.locator('p').last().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '.artifacts/limped-defense-2026-10-25/web/' + info.project.name + '-' + name + '.png',
    });
  });
for (const [group, locales] of [
  SUPPORTED_LOCALES.slice(0, 6),
  SUPPORTED_LOCALES.slice(6),
].entries())
  test('defense explanation renders every locale ' + group, async ({ page }) => {
    const g = recorded(deepFourBet, (p) => action(p) === 'fold');
    await page.goto('/');
    for (const locale of locales) {
      await page.evaluate((l) => localStorage.setItem('noir-locale', l), locale);
      const body = await open(page, g),
        text = await body.innerText();
      expect(text).toContain('42.4%');
      expect(text).toContain('4.27M');
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(text, locale).not.toMatch(/\p{Script=Han}/u);
      if (locale !== 'zh-CN') expect(text, locale).not.toContain('强起手牌也不代表任何尺度');
    }
  });

test('a recorded Alex fold groups threats under his name without generic bot disclaimers', async ({
  page,
}, info) => {
  const g = pairedTurn();
  act(g, 1, 'fold');
  const plan = planBotTurn(g, clarityRandom(71), { timingRandom: () => 0.4 });
  expect(botDecision(g, clarityRandom(71)).action).toBe('fold');
  executeBotTurn(g, plan, { expedited: true });
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
  }
  g.decisions = [];
  const body = await open(page, g);
  await expect(body).toContainText(/Alex.*判断自己可能落后于/s);
  await expect(body).not.toContainText(
    /机器人按公开|并非已经看到了对手底牌|可能领先当前手牌的组合/,
  );
  await body.locator('p').last().scrollIntoViewIfNeeded();
  await mkdir('.artifacts/strategy-gaps-2026-10-26/web', { recursive: true });
  await page.screenshot({
    path: '.artifacts/strategy-gaps-2026-10-26/web/' + info.project.name + '-alex-concise.png',
  });
});
