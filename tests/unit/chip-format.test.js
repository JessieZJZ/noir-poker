import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactChips, compactActionAmounts } from '../../src/engine/chip-format.js';

test('chip amounts switch units at K/M boundaries without hiding a whole chip', () => {
  for (const [amount, expected] of [
    [999, '999'],
    [1000, '1K'],
    [1025, '1.025K'],
    [18800, '18.8K'],
    [999999, '999.999K'],
    [1000000, '1M'],
    [1000025, '1.000025M'],
    [10000000, '10M'],
    [-18800, '-18.8K'],
  ])
    assert.equal(compactChips(amount), expected);
});

test('action presentation formats adjacent and spaced monetary amounts only', () => {
  for (const [source, expected] of [
    ['你 3-bet 加注至1200', '你 3-bet 加注至1.2K'],
    ['你 全下至18800', '你 全下至18.8K'],
    ['Leo 全下 18800', 'Leo 全下 18.8K'],
    ['Kai 小盲50000 · Mia 大盲100000', 'Kai 小盲50K · Mia 大盲100K'],
    ['全下跟注 10000000', '全下跟注 10M'],
    ['短全下至1000025', '短全下至1.000025M'],
    ['下注1000 · 下注至2000 · 开池至3000', '下注1K · 下注至2K · 开池至3K'],
    ['跟注\t1200。全下至 18800.', '跟注\t1.2K。全下至 18.8K.'],
    [
      '第 1200 手 · 第 1000 次重打 · 2026 年 · 1000% · 3-bet',
      '第 1200 手 · 第 1000 次重打 · 2026 年 · 1000% · 3-bet',
    ],
  ])
    assert.equal(compactActionAmounts(source), expected);
});

test('action presentation preserves existing abbreviations and never partially rewrites decimals', () => {
  for (const source of [
    '跟注 1.2K · 全下至18.8K · 大盲1M',
    '跟注 1000K · 全下至1000M · 下注1000k · 开池至1000m',
    '小盲 1000.25 · 跟注 1,200 · 大盲 1000,25',
  ])
    assert.equal(compactActionAmounts(source), source);
  const formatted = compactActionAmounts('你 3-bet 加注至1200 · Leo 全下至1000025');
  assert.equal(compactActionAmounts(formatted), formatted);
});
