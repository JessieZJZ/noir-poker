import test from 'node:test';
import assert from 'node:assert/strict';
import {
  topPairFlushTurn,
  limpedSmallFlush,
  shortFlushShove,
  finishValueGame,
} from '../fixtures/review-value-targets.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { valueDrawNote } from '../../src/review/value-targets.js';
import { evaluate, compare } from '../../src/engine/poker.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
const analyze = (s) => analyzeDecision(s, { trials: 12, rolloutTrials: 2 });
const body = (r) => r.coaching.paragraphParts.slice(2).flat().join('');

test('reported top-pair flop explains payment by both weaker made hands and real draws without repeating the bet', () => {
  const { flop } = topPairFlushTurn(),
    r = analyze(flop),
    text = body(r);
  assert.equal(flop.pot, 810000);
  assert.equal(flop.stack, 2020000);
  assert.deepEqual(r.context.matchups.weakerDrawTypes, ['flush', 'straight']);
  assert.match(text, /更弱成牌跟注/);
  assert.match(text, /顺子听牌或同花听牌的跟注/);
  assert.match(text, /愿意支付这个尺度/);
  assert.equal(text.match(/810K/g)?.length, 1);
  assert.doesNotMatch(text, /这次拿出 810K/);
});

test('the completed-flush turn compares controlled investment instead of endorsing the capped routine value shove', () => {
  const { turn } = topPairFlushTurn(),
    r = analyze(turn),
    text = body(r);
  assert.equal(turn.pot, 2430000);
  assert.equal(turn.stack, 1210000);
  assert.equal(r.code, 'flush-board-shove');
  assert.notEqual(r.coaching.kind, 'keep');
  assert.ok(r.context.valuePlan.primary.amount < turn.legal.maxRaiseTo);
  assert.ok(r.routes.secondary.amount < turn.legal.maxRaiseTo);
  assert.match(text, /第三张方块.*两张方块.*已成同花/);
  assert.match(text, /过牌或较小下注/);
  assert.match(text, /较弱对子或尚未完成的听牌/);
  assert.doesNotMatch(text, /只有更强.*跟注|只会.*比.*大|强牌可比较价值全下|这次拿出 1.21M/);
});

test('a deep limped paired-flush board presents plausible higher connectors and boats using the paired rank', () => {
  const { river } = limpedSmallFlush(),
    m = handMatchups(river, decisionContext(river));
  assert.equal(river.pot, 360000);
  assert.equal(river.stack, 2620000);
  assert.equal(m.behind.length, 4);
  assert.equal(m.nut, false);
  assert.deepEqual(
    m.behind.map((c) => c.score[0]),
    [5, 6, 5, 6],
  );
  for (const example of m.behind) {
    assert.equal(
      compare(
        evaluate([...river.board, ...example.cards]).score,
        evaluate([...river.hole, ...river.board]).score,
      ),
      1,
    );
    if (example.score[0] === 5) {
      assert.ok(example.cards.every((c) => c.suit === 2));
      assert.ok(Math.abs(example.cards[0].rank - example.cards[1].rank) <= 2);
    } else assert.ok(example.cards.some((c) => c.rank === 4));
    assert.ok(example.cards[0].rank !== example.cards[1].rank);
    assert.ok(!example.cards.some((c) => c.rank === 14));
  }
  // Premium traps remain legal threats even when omitted from four examples.
  for (const text of ['Qs Qh', 'Ts Th', 'Ac Kc', '4s 4d'])
    assert.equal(
      compare(
        evaluate([...river.board, ...cards(text)]).score,
        evaluate([...river.hole, ...river.board]).score,
      ),
      1,
    );
});

test('raised pots and short limped stacks retain premium and rare-hand coverage', () => {
  for (const options of [{ raised: true }, { depthBB: 20 }]) {
    const { river } = limpedSmallFlush(options),
      m = handMatchups(river, decisionContext(river));
    assert.ok(m.behind.some((e) => e.cards[0].rank === e.cards[1].rank));
    assert.equal(m.nut, false);
  }
});

test('a turn brick or a remaining private flush draw is not automatically downgraded by the new flush warning', () => {
  for (const options of [{ turnCard: '2s' }, { hole: 'Ks Td' }]) {
    const { turn } = topPairFlushTurn(options),
      r = analyze(turn);
    assert.notEqual(r.code, 'flush-board-shove');
    assert.doesNotMatch(body(r), /只有更强.*跟注|只会.*比.*大/);
  }
});

test('the warning respects its 40% investment boundary in whole chips at every blind scale', () => {
  for (const smallBlind of [25, 100, 10000, 50000])
    for (const depthBB of [102, 102.5]) {
      const { turn } = topPairFlushTurn({ smallBlind, depthBB }),
        r = analyze(turn);
      assert.equal(r.code === 'flush-board-shove', depthBB === 102.5);
      assert.equal(turn.amount % smallBlind, 0);
    }
});

test('the actual 5% pot flush shove keeps its value comparison, mentions higher flushes factually and states 200K once', () => {
  const { river } = shortFlushShove(),
    r = analyze(river),
    text = body(r);
  assert.equal(river.pot, 3870000);
  assert.equal(river.stack, 200000);
  assert.equal(r.context.valuePlan.kind, 'value-shove');
  assert.equal(r.context.valuePlan.primary.amount, 200000);
  assert.match(text, /全下至 200K/);
  assert.equal(text.match(/200K/g)?.length, 1);
  assert.match(text, /5.2%/);
  assert.match(text, /更高的同花/);
  assert.doesNotMatch(
    text,
    /这次拿出 200K|不能只看成花就把筹码全部投入|顺子听牌.*跟注|同花听牌.*跟注/,
  );
});

test('a raise-to amount and its distinct additional investment remain separately explained', () => {
  const { turn } = topPairFlushTurn({ reraise: true }),
    r = analyze(turn),
    text = body(r);
  assert.equal(turn.bet, 200000);
  assert.equal(turn.amount, 1210000);
  assert.match(text, /全下至 1.21M/);
  assert.match(text, /本次追加 1.01M/);
});

test('draw payment is not invented for a dry disconnected flop or for a river', () => {
  const { flop } = topPairFlushTurn();
  const s = { ...flop, hole: cards('Ah Kd'), board: cards('Kc 7h 2s') };
  const c = decisionContext(s);
  c.matchups = handMatchups(s, c);
  assert.deepEqual(c.matchups.weakerDrawTypes, []);
  assert.equal(valueDrawNote(s, c), '');
  const { river } = shortFlushShove(),
    d = decisionContext(river);
  d.matchups = handMatchups(river, d);
  assert.deepEqual(d.matchups.weakerDrawTypes, []);
  assert.equal(valueDrawNote(river, d), '');
});

test('review examples and warnings ignore hidden hands, future cards and final winners', () => {
  const { river } = limpedSmallFlush(),
    expected = analyze(river).coaching;
  for (const p of river.players)
    if (p.id !== 0)
      Object.defineProperty(p, 'hole', {
        get() {
          throw Error('Private cards');
        },
      });
  Object.defineProperty(river, 'deck', {
    get() {
      throw Error('Future deck');
    },
  });
  river.winners = [4];
  assert.deepEqual(analyze(river).coaching, expected);
});

test('all reconstructions settle legally with whole chips and conserved later-hand stacks at every supported scale', () => {
  for (const smallBlind of [25, 100, 10000, 50000])
    for (const make of [topPairFlushTurn, limpedSmallFlush, shortFlushShove]) {
      const { game } = make({ smallBlind }),
        bank = game.players.reduce((n, p) => n + p.stack + p.total, 0);
      const deal = [...game.deck, ...game.board, ...game.players.flatMap((p) => p.hole)];
      assert.equal(new Set(deal.map((c) => c.key)).size, deal.length);
      assert.equal(deal.length, 52 - game.street); // One discarded burn per dealt street.
      finishValueGame(game);
      assert.equal(
        game.players.reduce((n, p) => n + p.stack, 0),
        bank,
      );
      for (const p of game.players) assert.equal(p.stack % game.chipUnit, 0);
    }
});

test('all new review explanations translate in every locale with cards, amounts and percentages intact', async () => {
  const sources = [
    analyze(topPairFlushTurn().flop),
    analyze(topPairFlushTurn().turn),
    analyze(shortFlushShove().river),
  ];
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const r of sources) {
      const text = r.coaching.paragraphParts.flat().map(localizeText).join('');
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(text, /\p{Script=Han}/u, locale);
      assert.doesNotMatch(text, /\{\d+\}/, locale);
    }
  }
  await loadLocale('zh-CN');
});
