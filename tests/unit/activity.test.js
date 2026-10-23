import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityFormatter } from '../../src/ui/activity.js';
import { newGame, startHand, act, advanceStreet, legalActions } from '../../src/engine/poker.js';

const players = [
  { id: 0, name: '你', botProfile: 'rook' },
  { id: 1, name: 'Mia', botProfile: 'balanced' },
  { id: 2, name: 'Alex', botProfile: 'owen' },
  { id: 3, name: 'River', botProfile: 'owen' },
];

test('activity identifies assigned personas in all mentions, leaving hero and balanced opponents plain', () => {
  const format = createActivityFormatter(players);
  assert.equal(format('你 跟注 50 · Mia 弃牌'), '你 跟注 50 · Mia 弃牌');
  for (const text of [
    '庄家 Alex',
    'Alex 小盲 25 · River 大盲 50',
    '主池 125 → Alex 125',
    'River 未跟注的 75 筹码已退还',
    'Alex 模拟状态：急于追回',
  ]) {
    const html = format(text);
    for (const [name, persona] of [
      ['Alex', '范围纪律'],
      ['River', '范围纪律'],
    ]) {
      if (text.includes(name))
        assert.ok(html.includes(`${name}<span class="activity-persona">（${persona}）</span>`));
    }
  }
  assert.equal(format('Alexandra 弃牌 · RIVER'), 'Alexandra 弃牌 · RIVER');
  assert.equal((format('Alex（范围纪律） 过牌').match(/范围纪律/g) || []).length, 1);
});

test('activity uses a captured hand identity and safely escapes text', () => {
  const hand = structuredClone(players);
  const format = createActivityFormatter(hand);
  hand[2].botProfile = 'rook';
  assert.ok(format('Alex 获胜').includes('范围纪律'));
  assert.ok(createActivityFormatter(hand)('Alex 获胜').includes('大注强攻'));
  assert.equal(format('<img src=x> & "chips"'), '&lt;img src=x&gt; &amp; &quot;chips&quot;');
});

test('activity formats raw chip amounts while retaining ordinals, names and metadata', () => {
  const format = createActivityFormatter(players);
  assert.equal(format('你 3-bet 加注至1200'), '你 3-bet 加注至1.2K');
  assert.equal(format('你 全下至18800'), '你 全下至18.8K');
  assert.equal(
    format('Alex 全下至10000000'),
    'Alex<span class="activity-persona">（范围纪律）</span> 全下至10M',
  );
  assert.equal(format('第 1200 手 · 2026 年 · 1000%'), '第 1200 手 · 2026 年 · 1000%');
  assert.equal(format('Mia 跟注 1.2K'), 'Mia 跟注 1.2K');
});

test('a long legal hand retains every activity entry in chronological order and clears on the next deal', () => {
  const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  let actions = 0;
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else {
      const legal = legalActions(g);
      act(g, g.actor, legal.canRaise ? 'raise' : 'call', legal.minRaiseTo);
      actions++;
    }
  }
  assert.ok(actions > 70);
  assert.equal(g.logs.filter((entry) => entry.type === 'action').length, actions);
  assert.match(g.logs.at(-1).text, /^第 1 手开始/);
  assert.equal(g.logs.find((entry) => entry.text === g.result)?.type, 'result');
  assert.equal(
    g.players.reduce((sum, player) => sum + player.stack, 0),
    45000,
  );
  // This all-in hand eliminates seats; seat them again to test the next deal.
  for (const p of g.players) if (p.stack === 0) Object.assign(p, { stack: 5000, out: false });
  g.over = null;
  startHand(g);
  assert.match(g.logs.at(-1).text, /^第 2 手开始/);
  assert.ok(g.logs.length < 15);
});
