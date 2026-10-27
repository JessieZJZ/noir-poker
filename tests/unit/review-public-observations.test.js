import test from 'node:test';
import assert from 'node:assert/strict';
import { botDecision } from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { publicObservationNotes } from '../../src/review/public-story.js';
import { PUBLIC_READ_MODEL } from '../../src/engine/public-observations.js';
import { coldShoveResponse, allInRandom } from '../fixtures/all-in-decisions.js';
import { storyDecision } from '../fixtures/story-line-decisions.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

const read = {
  hands: 32,
  voluntaryHands: 32,
  raisingHands: 32,
  largeRaiseHands: 32,
  postActions: 128,
  postRaises: 128,
};
const observation = () => {
  const game = coldShoveResponse('As Kd');
  game.difficulty = 'hard';
  game.players[0].publicReads = Array.from({ length: 32 }, () => ({ ...read, hands: 1 }));
  const decision = botDecision(game, allInRandom(73));
  return { id: game.actor, name: game.players[game.actor].name, ...decision };
};

test('an actual observed shove response explains the actor public evidence without coaching', () => {
  const record = observation();
  assert.equal(record.action, 'call');
  const text = explainOpponent(record).detail;
  assert.match(text, /Mia结合.*此前 32 手中 32 手翻前大额加注.*保留了更多非顶级起手牌/);
  assert.doesNotMatch(text, /机器人|应当|建议|需要警惕|不能只凭|并非已经看到/);
  assert.equal(record.trace.view.publicReadModel, PUBLIC_READ_MODEL);
  const contaminated = structuredClone(record);
  contaminated.trace.view.opponents[0].hole = [{ rank: 14, suit: 0 }];
  contaminated.trace.view.deck = [{ rank: 14, suit: 0 }];
  contaminated.trace.view.winners = [0];
  assert.equal(explainOpponent(contaminated).detail, text);
});

test('legacy and external scripted records never acquire a new observation-based motive', () => {
  const record = observation();
  for (const edit of [
    (r) => delete r.trace.view.publicReadModel,
    (r) => delete r.trace.basis,
    (r) => (r.trace.reasonSource = 'scripted-action-only'),
    (r) => (r.trace.basis.action = 'fold'),
  ]) {
    const other = structuredClone(record);
    edit(other);
    assert.doesNotMatch(explainOpponent(other).detail, /此前 32 手中 32 手/);
  }
});

test('postflop observation copy remains a possible range interpretation and requires sufficient evidence', () => {
  const s = storyDecision().decision.trace.view;
  s.publicReadModel = PUBLIC_READ_MODEL;
  s.reviewSubject = 'River';
  s.action = 'call';
  s.opponents[0].publicRead = read;
  assert.match(
    publicObservationNotes(s).join(''),
    /River结合.*频繁的翻后下注与加注.*弱牌施压的可能/,
  );
  assert.doesNotMatch(publicObservationNotes(s).join(''), /确定|必然|应该|建议/);
  s.opponents[0].publicRead = { ...read, hands: 7 };
  assert.deepEqual(publicObservationNotes(s), []);
});

test('observation explanations translate every supported locale with counts and actor retained', async () => {
  const samples = [
    'Mia结合River此前 32 手中 20 手翻前大额加注的记录，本次估计中保留了更多非顶级起手牌。',
    'Mia结合River此前 32 手中 20 手翻前加注的记录，本次没有把加注范围限于强牌。',
    'Mia结合River此前频繁的翻后下注与加注，本次估计保留了更多弱牌施压的可能。',
  ];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const [index, source] of samples.entries()) {
        const text = localizeText(source);
        assert.ok(text.includes('Mia') && text.includes('River'), `${locale}: names retained`);
        if (index < 2) assert.ok(text.includes('32') && text.includes('20'));
        if (locale !== 'zh-CN') assert.notEqual(text, source, `${locale}: translated`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(text, /\p{Script=Han}/u);
        assert.doesNotMatch(text, /\{\d+\}/);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});
