import test from 'node:test';
import assert from 'node:assert/strict';
import { blindProgressText } from '../../src/ui/effect-layouts.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { blindLevels } from '../../src/engine/blind-levels.js';
import { formatDecimal, loadLocale, localizeText } from '../../src/i18n/index.js';

const game = (patch = {}) => ({
  phase: 'playing',
  stakes: stakesFromSmallBlind(125),
  players: Array.from({ length: 7 }),
  levelHands: 1,
  levelLength: 10,
  levelIndex: 0,
  ...patch,
});

test('blind progress counts hands after this hand and names the actual next level', () => {
  assert.equal(blindProgressText(game()), '再打 9 手后涨盲到 250 / 500');
  assert.equal(blindProgressText(game({ levelHands: 9 })), '再打 1 手后涨盲到 250 / 500');
  for (const phase of ['playing', 'done'])
    assert.equal(
      blindProgressText(game({ phase, levelHands: 10, replayAttempt: 2 })),
      '下一手涨盲到 250 / 500',
    );
  assert.equal(
    blindProgressText(game({ levelIndex: 1, levelHands: 1 })),
    '再打 9 手后涨盲到 375 / 750',
  );
  const cap = blindLevels(game().stakes, 7).length - 1;
  assert.equal(blindProgressText(game({ levelIndex: cap })), '盲注已封顶');
  assert.equal(blindProgressText(game({ risingBlinds: false })), '');
  assert.equal(blindProgressText(game({ phase: 'idle' })), '');
});

test('countdown derives non-linear levels and each game cap without changing its state', () => {
  for (const smallBlind of [25, 125, 50000])
    for (const seats of [5, 7, 9]) {
      const state = game({
        stakes: stakesFromSmallBlind(smallBlind),
        players: Array(seats).fill({}),
      });
      const levels = blindLevels(state.stakes, seats);
      for (let index = 0; index < levels.length; index++) {
        state.levelIndex = index;
        const before = structuredClone(state);
        const next = levels[index + 1];
        assert.equal(
          blindProgressText(state),
          next ? `再打 9 手后涨盲到 ${next.smallBlind} / ${next.bigBlind}` : '盲注已封顶',
        );
        assert.deepEqual(state, before);
      }
    }
  assert.equal(
    blindProgressText(game({ stakes: stakesFromSmallBlind(500) }), (value) => `${value / 1000}K`),
    '再打 9 手后涨盲到 1K / 2K',
  );
});

test('visible calculator decimals retain point notation across supported languages', async () => {
  for (const locale of ['es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await loadLocale(locale);
    assert.equal(formatDecimal(62.47), '62.47', locale);
    assert.equal(formatDecimal(0.5), '0.50', locale);
  }
  await loadLocale('zh-CN');
  assert.equal(formatDecimal(62.47), '62.47');
});

test('German guide examples use the same decimal separator as live chips', async () => {
  await loadLocale('de');
  const text = localizeText(
    '跟注旁的数字是这次要补的筹码；加注旁的数字是这一轮累计投入的总额。例如你已投 200，对手加到 600：跟注要补 400，选择加注 1.2K 则补 1K。所有筹码金额都是当前筹码面额的倍数。',
  );
  assert.ok(text.includes('1.2K'));
  assert.ok(!text.includes('1,2K'));
  await loadLocale('zh-CN');
});
