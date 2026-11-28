import test from 'node:test';
import assert from 'node:assert/strict';
import { act, advanceStreet, deckOfCards, newGame, startHand } from '../../src/engine/poker.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import { observerRecord } from '../fixtures/opponent-observer.js';

// Each review sentence has to explain the action it sits next to. These cases
// were found sentence by sentence in seeded self-play reviews.

const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const summary = (paragraphs) => paragraphs.slice(paragraphs.indexOf('复盘分析总结') + 1).join('');
const coaching = (s) => analyzeDecision(s, { trials: 24, rollouts: false }).coaching;

// Five seats at 100/200. With dealer 2 the seats are: 0 BB (hero), 1 UTG,
// 2 CO, 3 BTN, 4 SB. With dealer 4: 0 BTN (hero), 1 SB, 2 BB, 3 UTG, 4 CO.
function heroDecision({ dealer, hole, board, script }) {
  const g = newGame(5, { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 });
  Object.assign(g, { risingBlinds: false, difficulty: 'hard', dealer });
  startHand(g);
  g.players[0].hole = cards(hole);
  script(g, () => (g.board = cards(board)));
  return g.decisions.at(-1);
}

function lunaRiverBet(amount) {
  const record = observerRecord({
    action: 'raise',
    reason: 'value-raise',
    hole: 'Qd 5d',
    board: '6h 5h 3c 6s 8s',
    cost: 0,
    stack: 15400,
    pot: 10800,
    position: 'BB',
  });
  Object.assign(record, { amount, name: 'Luna' });
  return explainOpponent(record);
}

test('a value bet ties the board’s stronger hands to its size instead of listing them alone', () => {
  const small = summary(lunaRiverBet(2700).paragraphs);
  assert.match(
    small,
    /这是用两对取值：这次拿出 2\.7K，希望更弱成牌付费。这次只投入底池的约 25%：牌面能让对手组成三条、顺子、葫芦，这些牌都能赢这手两对。下注过大时，愿意跟的多半是这些更强的牌；小注更容易让更弱的成牌也跟注。$/,
  );
  assert.doesNotMatch(small, /领先当前成牌|这是用 /);
  const large = summary(lunaRiverBet(9000).paragraphs);
  assert.match(
    large,
    /这次投入约为底池的 83%，而牌面能让对手组成三条、顺子、葫芦，这些牌都能赢这手两对：下得越大，愿意跟的越集中在这些更强的牌上。$/,
  );
});

test('a hand with no pair gets no "beats the current made hand" sentence', () => {
  const check = explainOpponent(
    observerRecord({ action: 'check', reason: 'free-check', hole: 'Td 8h', board: '6h Qs 4h 3c' }),
  );
  assert.doesNotMatch(summary(check.paragraphs), /领先当前成牌/);
  const fold = explainOpponent(
    observerRecord({
      action: 'fold',
      reason: 'insufficient-equity',
      hole: 'Jd 4d',
      board: '9s Ts 7h',
    }),
  );
  assert.doesNotMatch(summary(fold.paragraphs), /领先当前成牌/);
});

// Hero raises to 600 on the button, the big blind calls and leads the flop.
const flopCall = (hole) =>
  heroDecision({
    dealer: 4,
    hole,
    board: '9s 8d 7c',
    script: (g, flop) => {
      act(g, 3, 'fold');
      act(g, 4, 'fold');
      act(g, 0, 'raise', 600);
      act(g, 1, 'fold');
      act(g, 2, 'call');
      advanceStreet(g);
      flop();
      g.players[2].hole = cards('2c 2d');
      act(g, 2, 'raise', 600);
      act(g, 0, 'call');
    },
  });

test('a call names what it can run into as its risk, and only with a made hand', () => {
  const pair = summary(coaching(flopCall('Ah 9h')).paragraphs);
  assert.match(pair, /跟注的风险是：牌面能让对手组成顺子，这些牌都能赢这手一对。/);
  assert.doesNotMatch(pair, /领先当前成牌/);
  const highCard = summary(coaching(flopCall('Kc Qc')).paragraphs);
  assert.doesNotMatch(highCard, /跟注的风险是|领先当前成牌/);
});

// UTG limps, CO opens to 700, the button and small blind fold to the hero.
const facingOpen = (hole, finish) =>
  heroDecision({
    dealer: 2,
    hole,
    script: (g) => {
      act(g, 1, 'call');
      act(g, 2, 'raise', 700);
      act(g, 3, 'fold');
      act(g, 4, 'fold');
      finish(g);
    },
  });

test('a 3-bet bluff states the fold it needs once and what a call costs in plain words', () => {
  const text = summary(coaching(facingOpen('Ks 5h', (g) => act(g, 0, 'raise', 2400))).paragraphs);
  assert.match(text, /你这次再加注，要同时面对加注者和跟注者的范围。/);
  assert.match(text, /需要所有仍在底池里的对手都弃牌，才能直接拿走底池。/);
  assert.match(
    text,
    /被跟注时，这次拿出的 2\.2K 要靠翻牌后改善或继续施压才能收回，这手牌本身很难在摊牌时赢。/,
  );
  assert.doesNotMatch(text, /共同弃牌|投入尺度相称|弃牌空间|若再加注/);
});

test('a fold keeps the earlier calls as facts without their possible holdings', () => {
  const text = summary(coaching(facingOpen('8c 3d', (g) => act(g, 0, 'fold'))).paragraphs);
  assert.match(text, /先跟注 200 入池/);
  assert.doesNotMatch(text, /这些跟注可能是|这类平跟|若再加注|会减少对手拿到/);
  const call = summary(coaching(facingOpen('Ad Qs', (g) => act(g, 0, 'call'))).paragraphs);
  assert.match(call, /这些跟注可能是小对子、同花牌或连接牌，也可能藏着强牌。/);
  assert.match(call, /你手中的 A 会减少对手拿到/);
  assert.doesNotMatch(call, /若再加注/);
});

// Folded to the hero on the button, who folds.
const unopenedFold = (hole) =>
  heroDecision({
    dealer: 4,
    hole,
    script: (g) => {
      act(g, 3, 'fold');
      act(g, 4, 'fold');
      act(g, 0, 'fold');
    },
  });

test('an unopened fold states the decision first and turns from the hand’s potential to its weakness', () => {
  const suited = summary(coaching(unopenedFold('7d 5d')).paragraphs);
  assert.match(
    suited,
    /选择弃牌。前面还没有对手加注，当前是在决定是否跟大盲入池。你的两张同花底牌能争取同花听牌和成花机会。但这手起手牌击中一对后仍可能偏弱/,
  );
  const ace = summary(coaching(unopenedFold('9c Ah')).paragraphs);
  assert.doesNotMatch(ace, /会减少对手拿到/);
  assert.match(ace, /仍需控制投入。这手起手牌击中一对后仍可能偏弱/);
});

test('the rewritten sentences translate in every locale, part by part and as whole paragraphs', async () => {
  const reviews = [
    lunaRiverBet(2700),
    lunaRiverBet(9000),
    coaching(flopCall('Ah 9h')),
    coaching(facingOpen('Ks 5h', (g) => act(g, 0, 'raise', 2400))),
    coaching(facingOpen('Ad Qs', (g) => act(g, 0, 'call'))),
    coaching(unopenedFold('7d 5d')),
  ];
  const sources = reviews.flatMap((review) => [
    ...review.paragraphParts.flat(),
    ...(review.paragraphs || []),
  ]);
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const source of sources) {
        const translated = localizeText(source);
        assert.doesNotMatch(translated, /\{\d+\}||/, `${locale}: placeholder leak`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
      }
    }
    await loadLocale('en');
    assert.match(
      localizeText(summary(lunaRiverBet(2700).paragraphs)),
      /Only about 25% of the pot goes in: the board allows Three of a kind \/ Straight \/ Full house, and each of these beats this hand \(Two pair\)\./,
    );
  } finally {
    await loadLocale('zh-CN');
  }
});
