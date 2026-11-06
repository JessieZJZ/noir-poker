import test from 'node:test';
import assert from 'node:assert/strict';
import { blindProgressText } from '../../src/ui/effect-layouts.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { blindLevels } from '../../src/engine/blind-levels.js';
import { formatDecimal, loadLocale } from '../../src/i18n/index.js';

const game = (patch = {}) => ({
  phase: 'playing',
  stakes: stakesFromSmallBlind(125),
  players: Array.from({ length: 7 }),
  levelHands: 1,
  levelLength: 10,
  levelIndex: 0,
  ...patch,
});

test('blind progress counts hands after this hand, including settled/retry boundaries', () => {
  assert.equal(blindProgressText(game()), '本手后再打 9 手涨盲');
  assert.equal(blindProgressText(game({ levelHands: 9 })), '本手后再打 1 手涨盲');
  for (const phase of ['playing', 'done'])
    assert.equal(
      blindProgressText(game({ phase, levelHands: 10, replayAttempt: 2 })),
      '下一手涨盲',
    );
  assert.equal(blindProgressText(game({ levelIndex: 1, levelHands: 1 })), '本手后再打 9 手涨盲');
  const cap = blindLevels(game().stakes, 7).length - 1;
  assert.equal(blindProgressText(game({ levelIndex: cap })), '盲注已封顶');
  assert.equal(blindProgressText(game({ risingBlinds: false })), '');
  assert.equal(blindProgressText(game({ phase: 'idle' })), '');
});

test('visible calculator decimals follow the current language without changing the value', async () => {
  for (const locale of ['es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await loadLocale(locale);
    assert.equal(formatDecimal(62.47), '62,47', locale);
    assert.equal(formatDecimal(0.5), '0,50', locale);
  }
  await loadLocale('zh-CN');
  assert.equal(formatDecimal(62.47), '62.47');
});
