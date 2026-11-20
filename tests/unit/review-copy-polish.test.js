import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import {
  spaceCjk,
  withoutRepeats,
  styleTagOnce,
  styleTagOnceInReview,
} from '../../src/review/typography.js';
import { loadLocale, localizeText, SUPPORTED_LOCALES } from '../../src/i18n/index.js';

const card = (rank, suit) => ({ rank, suit, symbol: '♠♥♣♦'[suit], key: `${suit}-${rank}` });
const glued = /[一-鿿][0-9A-Za-z♠♥♣♦]|[0-9A-Za-z♠♥♣♦%][一-鿿]/u;
const displayed = (r) => [
  ...r.coaching.paragraphs,
  r.coaching.followUp || '',
  r.coaching.label || '',
  ...r.evidence,
];

// Six seats, 100 BB, a UTG limp, your button isolation raise to 3.5 BB, an
// 11 BB small blind re-shove, folds, and your call with K♠ 9♠.
function shortReshove() {
  const g = engine.newGame(6);
  g.difficulty = 'normal';
  g.emotionMode = 'off';
  g.dealer = 5;
  for (const p of g.players) p.stack = 20000;
  g.players[1].stack = 2200;
  engine.startHand(g);
  g.players[0].hole = [card(13, 0), card(9, 0)];
  const used = new Set(g.players[0].hole.map((c) => c.key));
  const rest = engine.deckOfCards().filter((c) => !used.has(c.key));
  for (const p of g.players.slice(1)) p.hole = [rest.pop(), rest.pop()];
  g.deck = rest;
  while (g.actor !== 0) engine.act(g, g.actor, g.actor === 3 ? 'call' : 'fold');
  engine.act(g, 0, 'raise', 700);
  engine.act(g, 1, 'raise', engine.legalActions(g).maxRaiseTo);
  while (g.actor !== 0) engine.act(g, g.actor, 'fold');
  engine.act(g, 0, 'call');
  return g;
}

test('review copy spaces Chinese next to Latin letters, digits and suits', () => {
  assert.equal(
    spaceCjk('此前Alex（听牌施压）在 CO 位2-bet 开池至 200，需要至少30.0%的胜率'),
    '此前 Alex（听牌施压）在 CO 位 2-bet 开池至 200，需要至少 30.0% 的胜率',
  );
  assert.equal(spaceCjk('他拿 8 / 5 同花底牌跟注 800与弃牌'), '他拿 8 / 5 同花底牌跟注 800 与弃牌');
  // Already spaced text, card pairs and parenthesised notes stay as they are.
  for (const text of ['第 1 局', 'Q♠ K♠（三条）', '较弱 Ax，', '（donk）', 'AA、AK'])
    assert.equal(spaceCjk(text), text);
});

test('spaced review text reaches the same translations as the unspaced source', async () => {
  const sources = [
    '面对Luna在 CO 位的2-bet 开池至 200，此前也有其他玩家跟注入池',
    '继续要补 300，可争夺跟注后的 900 底池，需要至少33.3%的胜率。',
    '翻牌前加注 2 次，本轮还有 1 位对手等待回应',
    '你拿 K♠ 9♠ 在 BTN 2-bet 隔离加注至 700，争取 450 的底池。',
  ];
  try {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'zh-CN')) {
      await loadLocale(locale);
      for (const text of sources) {
        const plain = localizeText(text);
        assert.equal(localizeText(spaceCjk(text)), plain, `${locale}: ${text}`);
        if (!['zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(plain, /\p{Script=Han}/u, `${locale}: ${plain}`);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('a weak suited king that clears the price against a short re-shove is a priced call', () => {
  const g = shortReshove();
  const call = analyzeDecision(g.decisions.at(-1), { trials: 600, rollouts: false });
  assert.ok(call.metrics.weightedEquity - call.metrics.uncertainty >= call.metrics.required);
  assert.ok(!['weak-threebet-defense', 'weak-entry'].includes(call.code), call.code);
  assert.equal(call.coaching.recommendedAction.action, 'call');
  for (const text of displayed(call)) {
    assert.doesNotMatch(text, /；/);
    assert.doesNotMatch(text, glued, text);
  }
});

test('evidence names an isolation raise, the higher card first and no zero counts', () => {
  const g = shortReshove();
  const raise = analyzeDecision(g.decisions[0], { trials: 200, rollouts: false });
  const evidence = raise.evidence.join('\n');
  assert.match(evidence, /当时牌力：K \/ 9 同花底牌/);
  assert.match(evidence, /实际 2-bet 隔离加注至 700/);
  assert.match(evidence, /翻牌前无人加注，本轮还有 \d 位对手等待回应/);
  assert.match(evidence, /入池情境：未加注，跛入 1 人/);
  assert.doesNotMatch(evidence, /加注 0 次|还有 0 位|跛入 0 人|开池至 700|已有跛入，跛入/);
  const shove = analyzeDecision(g.decisions.at(-1), { trials: 200, rollouts: false });
  assert.match(shove.evidence.join('\n'), /本轮没有对手等待回应|入池情境：最高 3-bet，跛入 1 人/);
});

test('a repeated sentence is said once and a replay tip does not restate the summary', () => {
  const said = '这次只能争取让仍有筹码的对手退出，已全下者参与的底池仍需摊牌。';
  const out = withoutRepeats({
    paragraphs: [
      '复盘分析总结',
      `你全下。${said}这次是诈唬。${said}`,
      '后续公共牌再配对时，这手三条还有改善为葫芦的机会。',
    ],
    followUp: '重打这手。后续公共牌再配对时，这手三条还有改善为葫芦的机会。',
  });
  assert.equal(out.paragraphs[1], `你全下。${said}这次是诈唬。`);
  assert.equal(out.followUp, '重打这手。');
  // Separately translated parts drop a repeated whole part and stay joined.
  const parts = withoutRepeats({
    paragraphs: [`你全下。${said}${said}`],
    paragraphParts: [[`你全下。${said}`, said]],
  });
  assert.deepEqual(parts.paragraphParts, [[`你全下。${said}`]]);
  assert.equal(parts.paragraphs[0], parts.paragraphParts[0].join(''));
});

test('a seat style tag appears with the first mention only', () => {
  assert.deepEqual(
    styleTagOnce(
      [
        'River（跟注诱导）在 CO 位拿 J♣ 10♣。River（跟注诱导）判断自己落后。',
        '面对 River（跟注诱导）的下注',
      ],
      ['River'],
    ),
    ['River（跟注诱导）在 CO 位拿 J♣ 10♣。River判断自己落后。', '面对 River的下注'],
  );
  // The matchup block is matched by exact text and stays untouched.
  const kept = styleTagOnceInReview(
    ['块 River（跟注诱导）', 'River（跟注诱导）弃牌。'],
    undefined,
    ['River'],
    new Set(),
    '块 River（跟注诱导）',
  );
  assert.deepEqual(kept.paragraphs, ['块 River（跟注诱导）', 'River（跟注诱导）弃牌。']);
});

test('a fold with a suggested all-in call states the call basis, not that it was kept', () => {
  const g = shortReshove();
  const s = g.decisions.at(-1);
  const folded = analyzeDecision(
    { ...s, action: 'fold', amount: 0 },
    { trials: 600, rollouts: false },
  );
  const text = folded.coaching.paragraphs.join('');
  assert.doesNotMatch(text, /这次全下跟注值得保留/);
  if (folded.coaching.recommendedAction?.action === 'call') assert.doesNotMatch(text, /；/);
});

test('an opponent who raises straight from zero is not said to add chips on top', () => {
  const g = engine.newGame(6);
  g.difficulty = 'normal';
  g.emotionMode = 'off';
  g.dealer = 5;
  engine.startHand(g);
  engine.act(g, g.actor, 'raise', 600);
  const id = g.actor;
  g.players[id].hole = [card(14, 0), card(14, 1)];
  const d = engine.botDecision(g, () => 0.1);
  assert.equal(d.action, 'raise');
  assert.equal(d.trace.view.bet, 0);
  const text = explainOpponent({
    id,
    name: g.players[id].name,
    action: 'raise',
    amount: d.amount,
    trace: d.trace,
  }).paragraphs.join('');
  assert.doesNotMatch(text, /再拿出 (\S+) 把下注抬到 \1。/);
  assert.doesNotMatch(text, glued);
  assert.doesNotMatch(text, /；/);
});
