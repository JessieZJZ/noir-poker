import test from 'node:test';
import assert from 'node:assert/strict';
import { storyDecision, riverStory } from '../fixtures/story-line-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { publicPostflopLine, publicStoryWeight } from '../../src/engine/public-story.js';
import { preparePublicRanges, publicComboWeight } from '../../src/engine/public-ranges.js';
import {
  publicHandData,
  exactStoryRiver,
  createPublicPairSampler,
} from '../../src/engine/public-equity.js';
import {
  evaluate,
  compare,
  deckOfCards,
  botDecision,
  act,
  advanceStreet,
  legalActions,
} from '../../src/engine/poker.js';
import { botBoardFeatures } from '../../src/engine/bot-profiles.js';
import { expensiveWeakPair } from '../../src/engine/bot-style.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
const options = () => ({
  deck: deckOfCards(),
  evaluate,
  compare,
  features: botBoardFeatures,
  cache: new Map(),
});
const view = (config = {}) => storyDecision(config).decision.trace.view;
const mass = (v, hand) => {
  const descriptor = preparePublicRanges(v)[0],
    opts = options(),
    hole = cards(hand),
    data = (h, b) => publicHandData(h, b, opts);
  return publicComboWeight(hole, descriptor, {
    board: descriptor.board,
    ...data(hole, descriptor.board),
    compare,
    handData: data,
  });
};

test('the screenshot reconstruction follows legal betting and the actual 33.91% price, without assuming a shove', () => {
  const { game, decision } = storyDecision();
  const v = decision.trace.view;
  assert.equal(v.pot, 2670000);
  assert.equal(v.callPrice.cost, 1370000);
  assert.equal(v.callPrice.contestable, 4040000);
  assert.equal(v.callPrice.odds, 137 / 404);
  assert.equal(v.opponents[0].allin, false);
  assert.equal(game.players[3].stack, 1590000);
  assert.equal(v.publicEquity.exact, true);
  assert.equal(v.publicEquity.enumeratedCombos, 990);
  assert.equal(v.publicEquity.samples, 0);
  const line = preparePublicRanges(v)[0].postflopLine;
  assert.deepEqual(
    line.map((a) => [a.street, a.action]),
    [
      [1, 'check'],
      [2, 'check'],
      [2, 'check-raise'],
      [3, 'bet'],
    ],
  );
  assert.equal(line[2].ratio, 350000 / 600000);
  assert.equal(line[3].ratio, 137 / 130);
});

test('earlier draw raises survive missed rivers while genuine strong hands retain more weight than unsupported air', () => {
  const v = view();
  assert.ok(mass(v, 'Kh Qh') > mass(v, 'Kd Qs') * 5);
  assert.ok(mass(v, 'Ah 5d') > mass(v, 'Kd Qs') * 20);
  assert.ok(mass(v, '6d 6s') > mass(v, 'Kh Qh'));
  assert.ok(mass(v, 'Ah Ks') > 0, 'Checks cannot remove slowplayed Ax');
});

test('a second raise after a check-raise is labelled as a reraise without changing any range weight', () => {
  const v = view({ route: 'reraise' }),
    line = publicPostflopLine(v, 0),
    turn = line.filter((a) => a.street === 2);
  assert.deepEqual(
    turn.map((a) => a.action),
    ['check', 'check-raise', 'raise'],
  );
  const earlierLabels = line.map((a) =>
    a.street === 2 && a.action === 'raise' ? { ...a, action: 'check-raise' } : a,
  );
  const pool = deckOfCards().filter((c) => ![...v.hole, ...v.board].some((k) => k.key === c.key)),
    opts = options(),
    data = (h, b) => publicHandData(h, b, opts);
  let combinations = 0;
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++) {
      const pair = [pool[a], pool[b]];
      assert.equal(
        publicStoryWeight(pair, line, data),
        publicStoryWeight(pair, earlierLabels, data),
      );
      combinations++;
    }
  assert.equal(combinations, 990);
});

test('the same river wager and price have different posteriors after a different full legal line', () => {
  const xr = view(),
    barrel = view({ route: 'barrel' });
  assert.equal(xr.pot, barrel.pot);
  assert.deepEqual(xr.callPrice, barrel.callPrice);
  assert.deepEqual(xr.board, barrel.board);
  assert.ok(xr.publicEquity.equity > barrel.publicEquity.equity + 0.02);
  assert.ok(mass(xr, 'Kh Qh') / mass(xr, 'Ah Ks') > mass(barrel, 'Kh Qh') / mass(barrel, 'Ah Ks'));
});

test('a completed flush or poor price can still make the same bluff catcher fold', () => {
  const missed = storyDecision(),
    completed = storyDecision({ river: '2h' }),
    expensive = storyDecision({ betBB: 150, defenderBB: 250 });
  assert.equal(missed.decision.action, 'call');
  assert.equal(completed.decision.action, 'fold');
  assert.equal(expensive.decision.action, 'fold');
  assert.ok(
    completed.decision.trace.view.publicEquity.equity <
      missed.decision.trace.view.publicEquity.equity,
  );
});

test('normal bets and actual all-ins share the same complete public story and exact weights', () => {
  const normal = view(),
    shove = view({ shove: true });
  assert.equal(normal.allIn, undefined);
  assert.equal(shove.allIn.isAllIn, true);
  assert.equal(normal.publicEquity.equity, shove.publicEquity.equity);
  assert.equal(shove.publicEquity.exact, true);
  assert.equal(shove.publicEquity.samples, 0);
  const nuts = storyDecision({ shove: true, hole: '5d 5s' });
  assert.notEqual(nuts.decision.action, 'fold');
  assert.equal(nuts.decision.trace.view.allIn.unbeatableRiver, true);
});

test('the old 70% pair veto is bypassed only for a complete, exact heads-up river range', () => {
  const v = view();
  assert.equal(expensiveWeakPair(v, v.publicEquity.equity), false);
  for (const changed of [
    { street: 2 },
    { rivals: 2 },
    { publicEquity: { ...v.publicEquity, exact: false } },
    { publicEquity: { ...v.publicEquity, rangeModel: undefined } },
  ])
    assert.equal(expensiveWeakPair({ ...v, ...changed }, 0.4), true);
});

test('new story decisions never read actual hidden cards or the future deck and settle whole chips at every scale', () => {
  for (const smallBlind of [25, 100, 10000, 50000]) {
    const g = riverStory({ smallBlind }),
      expected = botDecision(g, clarityRandom(71));
    const wealth = g.players.reduce((s, p) => s + p.stack + p.total, 0);
    const saved = [];
    for (const p of g.players)
      if (p.id !== g.actor) {
        saved.push([p, p.hole]);
        Object.defineProperty(p, 'hole', {
          configurable: true,
          get() {
            throw Error('Hidden cards read');
          },
        });
      }
    const deck = g.deck;
    Object.defineProperty(g, 'deck', {
      configurable: true,
      get() {
        throw Error('Future deck read');
      },
    });
    assert.deepEqual(botDecision(g, clarityRandom(71)), expected);
    for (const [p, hole] of saved)
      Object.defineProperty(p, 'hole', { value: hole, writable: true, configurable: true });
    Object.defineProperty(g, 'deck', { value: deck, writable: true, configurable: true });
    act(g, g.actor, expected.action, expected.amount);
    while (g.phase !== 'done')
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      wealth,
    );
    for (const p of g.players) assert.equal(p.stack % g.chipUnit, 0);
  }
});

test('a locked earlier range uses only its earlier board and a factory captures immutable story inputs', () => {
  const v = view(),
    line = publicPostflopLine(v, 0, 2);
  assert.ok(line.every((a) => a.street <= 2 && a.board.length <= 4));
  const d = preparePublicRanges(v)[0],
    pool = deckOfCards().filter((c) => ![...v.hole, ...v.board].some((k) => k.key === c.key)),
    opts = options();
  const factory = createPublicPairSampler(pool, d, opts),
    fresh = createPublicPairSampler(pool, structuredClone(d), options());
  for (const a of d.postflopLine) {
    a.action = 'call';
    a.board[0].rank = 14;
  }
  const one = clarityRandom(541),
    two = clarityRandom(541);
  for (let n = 0; n < 20; n++) assert.deepEqual(factory({ random: one }), fresh({ random: two }));
  const early = { ...v, street: 1, board: v.board.slice(0, 3) };
  assert.ok(publicPostflopLine(early, 0).every((a) => a.street === 1));
});

test('review exposes the public story and missed draw without declaring that checks rule out an ace', () => {
  const { game, decision } = storyDecision();
  const record = { ...decision, id: 3, name: 'River', sequence: game.history.length + 1 };
  const r = explainOpponent(record, game.players),
    text = r.paragraphs.join('');
  assert.match(text, /此前的公开行动.*翻牌\s*过牌.*转牌\s*过牌后加注至 500K.*河牌\s*下注至 1.37M/);
  assert.match(text, /不能仅凭前面的过牌排除价值牌/);
  assert.match(text, /第三张红桃.*同花听牌仍可能转成诈唬/);
  assert.doesNotMatch(text, /对手一定没有 A|对手在诈唬|知道.*J.*8/);
});

test('the captured story CDF conditions exactly on cards left by earlier seats without uniform fallback', () => {
  const v = view(),
    d = preparePublicRanges(v)[0],
    pool = cards('Kh Qh Jh Th 9h 4d 4c Ah Ad Kd');
  const allowed = pool.filter((c) => !['Kh', 'Ah'].some((k) => cards(k)[0].key === c.key));
  const opts = options(),
    data = (h, b) => publicHandData(h, b, opts);
  let total = 0,
    hearts = 0;
  for (let a = 0; a < allowed.length; a++)
    for (let b = a + 1; b < allowed.length; b++) {
      const pair = [allowed[a], allowed[b]],
        w = publicComboWeight(pair, d, {
          board: d.board,
          ...data(pair, d.board),
          compare,
          handData: data,
        });
      total += w;
      if (pair.every((c) => c.suit === 1)) hearts += w;
    }
  const factory = createPublicPairSampler(pool, d, options()),
    random = clarityRandom(5591),
    stats = {};
  let selected = 0;
  for (let i = 0; i < 4000; i++) {
    const h = factory({ random, stats, available: allowed });
    assert.equal(new Set(h.map((c) => c.key)).size, 2);
    assert.ok(h.every((c) => allowed.some((k) => k.key === c.key)));
    if (h.every((c) => c.suit === 1)) selected++;
  }
  assert.equal(stats.storyCdfBuilds, 1);
  assert.ok(Math.abs(selected / 4000 - hearts / total) < 0.025);
});

test('full action stories and suit names translate in every locale while preserving prices and route identity', async () => {
  const { game, decision } = storyDecision(),
    review = explainOpponent({ ...decision, id: 3, name: 'River' }, game.players);
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const rendered = review.paragraphParts
      .flat()
      .map((part) => localizeText(part))
      .join('');
    for (const value of ['River', '500K', '1.37M'])
      assert.ok(rendered.includes(value), locale + '/' + value);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      assert.doesNotMatch(rendered, /\p{Script=Han}/u, locale);
    if (locale !== 'zh-CN')
      assert.doesNotMatch(rendered, /此前的公开行动|过牌后加注至|第三张红桃/, locale);
  }
  await loadLocale('zh-CN');
});
