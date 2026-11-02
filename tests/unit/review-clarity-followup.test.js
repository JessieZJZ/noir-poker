import test from 'node:test';
import assert from 'node:assert/strict';
import { explainOpponent } from '../../src/review/opponents.js';
import { preflopRangeNotes } from '../../src/review/matchups.js';
import { botDecision, act, advanceStreet, legalActions } from '../../src/engine/poker.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { phase3CheckSpot } from '../fixtures/review-phase3.js';
import { groupedPreflopReview, lunaCheapEntry } from '../fixtures/review-clarity-followup.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

const summary = (r) => r.paragraphs.slice(r.paragraphs.indexOf('复盘分析总结') + 1).join('');
const identities = (g) => g.players.map(({ id, name, botProfile }) => ({ id, name, botProfile }));

test('four actual equal-price limpers share one sentence and the summary omits generic size warnings', () => {
  const { game, record } = groupedPreflopReview();
  const review = explainOpponent(record, identities(game));
  const text = summary(review);
  assert.match(text, /你在 UTG 位、Mia在 LJ 位、Alex在 HJ 位、River在 CO 位都先跟注 20K 入池/);
  assert.equal(text.match(/先跟注 20K 入池/g)?.length, 1);
  assert.match(text, /Luna在 BTN 位2-bet 开池至 190K/);
  assert.match(text, /小对子、同花牌或连接牌.*藏着强牌/);
  assert.doesNotMatch(text, /明显大于普通开池|不能只根据位置套用|不能只考虑开池者会不会弃牌/);
});

test('callers with different actual incremental prices stay in separate groups, with folded seats excluded', () => {
  const { game, record } = groupedPreflopReview({ facingSqueeze: true });
  const text = summary(explainOpponent(record, identities(game)));
  assert.match(text, /你在 UTG 位、Alex在 HJ 位都已跟注这笔加注，各补 740K/);
  assert.match(text, /Luna在 BTN 位已跟注这笔加注，补 570K/);
  assert.doesNotMatch(text, /Mia在 LJ 位|River在 CO 位|各补 760K/);
});

test('suited AJ pressure explains nut-flush potential for recorded and legacy/scripted reason paths', () => {
  for (const scripted of [true, false]) {
    const { game, record } = groupedPreflopReview();
    if (!scripted) {
      delete record.trace.reasonSource;
      delete record.trace.basis;
    }
    const text = summary(explainOpponent(record, identities(game)));
    assert.match(text, /同花底牌.*两张与底牌同花色.*坚果同花听牌/);
    assert.match(text, /补成同花.*更低的同花/);
    assert.doesNotMatch(text, /你持有 A 同花底牌|与你底牌同花色/);
  }
  const off = groupedPreflopReview({ hole: 'Ah Jc' });
  assert.doesNotMatch(
    summary(explainOpponent(off.record, identities(off.game))),
    /坚果同花听牌|成花机会/,
  );
});

test('legacy set checks retain visible threats and tradeoffs without future response coaching', () => {
  for (const reason of ['free-check', 'pot-control', 'strong-trap', 'unrecognized']) {
    const { record } = phase3CheckSpot('5c 5d', '4d Qh Ah 5h', { reason });
    const review = explainOpponent(record),
      text = summary(review);
    assert.match(text, /暗三条 5.*三张同花色.*两张该花色.*同花.*领先当前成牌/);
    assert.match(text, /避免主动扩大当前底池.*葫芦或四条.*免费见到下一张/);
    assert.doesNotMatch(text, /再遇下注|要结合金额、人数和此前行动/);
    assert.doesNotMatch(text, /这是暗三条 5过牌|暗三条 5控池，保留摊牌机会/);
    if (reason === 'pot-control') assert.equal(review.title, '强牌选择过牌');
  }
});

test('the seven-player 77.5BB K8s case can limp for one BB without turning it into an automatic raise', () => {
  const game = lunaCheapEntry();
  const decision = botDecision(game, () => 0.4);
  assert.equal(decision.action, 'call');
  assert.equal(decision.trace.suitedLimp, true);
  assert.equal(decision.trace.view.actionContext.unactedBehindCount, 6);
  assert.equal(decision.trace.view.legal.callAmount, 20000);
  const initialTotal = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
  act(game, game.actor, decision.action, decision.amount);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    initialTotal,
  );
  for (const p of game.players) assert.equal(p.stack % game.chipUnit, 0);
});

test('the new suited limp is bounded by depth, suit, price, raises and all-in pressure at every blind scale', () => {
  for (const smallBlind of [25, 100, 10000, 50000]) {
    const get = (overrides) => botDecision(lunaCheapEntry({ smallBlind, ...overrides }), () => 0.4);
    assert.equal(get({}).trace.suitedLimp, true);
    assert.equal(get({ depth: 50 }).trace.suitedLimp, true);
    for (const change of [{ depth: 49.5 }, { hole: 'Kh 8c' }, { hole: 'Kh 3h' }])
      assert.equal(get(change).trace.suitedLimp, false);
    const view = get({}).trace.view;
    const decide = (v) =>
      chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.4);
    const raised = {
      ...view,
      currentBet: 6 * view.bigBlind,
      history: [
        { id: view.opponents[0].id, street: 0, action: 'raise', amount: 6 * view.bigBlind },
      ],
      legal: { ...view.legal, toCall: 6 * view.bigBlind, callAmount: 6 * view.bigBlind },
    };
    assert.equal(decide(raised).trace.suitedLimp, false);
    assert.equal(
      decide({
        ...view,
        opponents: view.opponents.map((p) => ({ ...p, stack: 20 * view.bigBlind })),
      }).trace.suitedLimp,
      false,
    );
    assert.equal(
      decide({
        ...view,
        allIn: {
          odds: 0.3,
          pendingBuffer: 0,
          ranges: [],
          cost: view.stack,
          contestable: view.stack * 2,
        },
      }).trace.suitedLimp,
      false,
    );
  }
});

test('both the limp decision and review are invariant to opponents hidden cards and the future runout', () => {
  const game = lunaCheapEntry();
  const before = botDecision(game, () => 0.4);
  for (const p of game.players.filter((p) => p.id !== game.actor))
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden opponent cards read');
      },
    });
  Object.defineProperty(game, 'deck', {
    get() {
      throw Error('future deck read');
    },
  });
  assert.deepEqual(
    botDecision(game, () => 0.4),
    before,
  );
  const { record } = groupedPreflopReview();
  const explanation = explainOpponent(record);
  for (const p of record.trace.view.opponents)
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden review cards read');
      },
    });
  record.trace.view.futureDeck = ['secret'];
  record.trace.view.winners = [6];
  assert.deepEqual(explainOpponent(record), explanation);
});

test('the changed summaries render in every supported locale with the same amounts and no untranslated clauses', async () => {
  const { game, record } = groupedPreflopReview();
  const review = explainOpponent(record, identities(game));
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const rendered = review.paragraphParts
      .flat()
      .map((part) => localizeText(part))
      .join('');
    for (const amount of ['20K', '190K', '760K'])
      assert.ok(rendered.includes(amount), `${locale}/${amount}`);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      assert.doesNotMatch(rendered, /\p{Script=Han}/u, locale);
    if (locale !== 'zh-CN') assert.doesNotMatch(rendered, /这类平跟|与底牌同花色/, locale);
    if (!['zh-CN', 'zh-TW'].includes(locale)) assert.doesNotMatch(rendered, /都先跟注/, locale);
  }
  await loadLocale('zh-CN');
});
