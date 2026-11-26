import test from 'node:test';
import assert from 'node:assert/strict';
import { act, deckOfCards, newGame, startHand } from '../../src/engine/poker.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { preflopPressureBasis as pressureBasis } from '../../src/review/coaching.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

// The lead and the basis render as separate parts; join them for wording checks.
const preflopPressureBasis = (...args) => {
  const { lead, basis } = pressureBasis(...args);
  return lead + basis;
};

const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );

// Reported hand 49: heads-up at 2.7K/5.4K, the hero limps Q2o on the button
// with 117.3K; Kai has 33.3K in the big blind.
function reportedLimp() {
  const g = newGame(5, { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 });
  Object.assign(g, { risingBlinds: false, smallBlind: 2700, bigBlind: 5400, difficulty: 'hard' });
  for (const id of [1, 2, 3]) Object.assign(g.players[id], { out: true, stack: 0 });
  g.players[0].stack = 117300;
  g.players[4].stack = 33300;
  g.dealer = 4;
  startHand(g);
  g.players[0].hole = cards('2c Qh');
  g.players[4].hole = cards('Th 5c');
  act(g, 0, 'call');
  return g.decisions[0];
}

const coaching = () => analyzeDecision(reportedLimp(), { trials: 24, rollouts: false }).coaching;
const reviewText = () => coaching().paragraphs.join('');
// The review renders and localizes each paragraph part on its own.
const reviewParts = () => coaching().paragraphParts.flat();

test('the shove recommendation names who must fold, what a fold wins and what a call risks', () => {
  const text = reviewText();
  assert.ok(
    text.includes(
      '这手建议 2-bet 全下至 117.3K，额外投入 114.6K，其中 Kai 跟不起的 84K 会退回给你。',
    ),
    text,
  );
  assert.ok(
    text.includes(
      '能不能这样打，看两点：Kai 弃牌的次数够不够多——弃牌时你直接赢下现在 8.1K 的底池；被跟注时，你的牌赢面够不够——输了要再付出 30.6K。',
    ),
    text,
  );
  assert.doesNotMatch(text, /施压依据|待回应玩家|已入池对手|无法被匹配|可被匹配/);
});

const players = (...stacks) =>
  stacks.map(([name, stack, extra = {}], id) => ({
    id,
    name,
    stack,
    total: 0,
    bet: 0,
    folded: false,
    allin: false,
    ...extra,
  }));
const spot = (overrides) => ({
  id: 0,
  bet: 0,
  pot: 300,
  legal: { maxRaiseTo: 10000 },
  ...overrides,
});

test('each pressure basis branch states the fold target and the matched risk in plain words', () => {
  const raise = { action: 'raise', amount: 1200 };
  const one = spot({
    players: players(['你', 10000], ['Mia', 9000], ['Alex', 0, { folded: true }]),
  });
  assert.equal(
    preflopPressureBasis(one, '加注至 1.2K', raise),
    '这手建议加注至 1.2K，额外投入 1.2K。能不能这样打，看两点：Mia 弃牌的次数够不够多——弃牌时你直接赢下现在 300 的底池；被跟注时，你的牌在翻牌后能不能撑起这 1.2K 的投入。',
  );
  const many = spot({ players: players(['你', 10000], ['Mia', 9000], ['Alex', 8000]) });
  assert.equal(
    preflopPressureBasis(many, '全下至 10K', { action: 'raise', amount: 10000 }),
    '这手建议全下至 10K，额外投入 10K，其中对手都跟不起的 1K 会退回给你。能不能这样打，看两点：其余 2 位对手是不是经常都弃牌——都弃牌时你直接赢下现在 300 的底池；有人跟注时，你的牌赢面够不够——输了最多再付出 9K。',
  );
  assert.match(
    preflopPressureBasis(many, '加注至 1.2K', raise),
    /其余 2 位对手是不是经常都弃牌.*有人跟注时，你的牌在翻牌后能不能撑起这 1.2K 的投入。$/,
  );
  const committed = spot({
    players: players(
      ['你', 10000],
      ['Mia', 0, { allin: true, total: 2000, bet: 2000 }],
      ['Alex', 8000],
    ),
  });
  assert.match(
    preflopPressureBasis(committed, '加注至 6K', { action: 'raise', amount: 6000 }),
    /^这手建议加注至 6K，额外投入 6K。已有对手全下，其他人弃牌也不能让你直接拿下底池.*最多要再付出 6K。$/,
  );
});

test('the plain pressure basis is translated in every supported locale', async () => {
  const many = spot({ players: players(['你', 10000], ['Mia', 9000], ['Alex', 8000]) });
  // Every lead and basis variant, as the separate parts the review renders.
  const sources = [
    ...reviewParts(),
    ...[
      [many, '全下至 10K', 10000],
      [many, '加注至 1.2K', 1200],
      [spot({ players: players(['你', 10000], ['Mia', 9000]) }), '加注至 1.2K', 1200],
      [
        spot({
          players: players(['你', 10000], ['Mia', 0, { allin: true, total: 2000 }], ['Alex', 8000]),
        }),
        '加注至 6K',
        6000,
      ],
    ].flatMap(([s, label, amount]) =>
      Object.values(pressureBasis(s, label, { action: 'raise', amount })),
    ),
  ];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const source of sources) {
        const translated = localizeText(source);
        assert.doesNotMatch(translated, /\{\d+\}|\uE000|\uE001/, `${locale}: placeholder leak`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
      }
      const reported = sources
        .filter((source) => /^(这手建议 2-bet|能不能这样打，看两点：Kai)/.test(source))
        .map(localizeText)
        .join(' ');
      const verdict = localizeText(sources.find((source) => source.includes('够全下的标准')));
      if (locale === 'en')
        assert.match(
          verdict,
          /^Q \/ 2 offsuit hole cards in BTN, with 1 players? still to act behind, is strong enough to go all-in/,
        );
      if (locale === 'en')
        assert.match(
          reported,
          /the 84K that Kai cannot cover comes back to you\. Whether this works comes down to two things: does Kai fold often enough — a fold wins you the current 8\.1K pot right away; and when called, does your hand win often enough — losing costs 30\.6K more\./,
        );
      if (locale === 'zh-TW')
        assert.match(reported, /能不能這樣打，看兩點：Kai 棄牌的次數夠不夠多/);
      if (locale === 'ja') assert.match(reported, /この打ち方が成り立つかは2点で決まります。/);
    }
  } finally {
    await loadLocale('zh-CN');
  }
});
