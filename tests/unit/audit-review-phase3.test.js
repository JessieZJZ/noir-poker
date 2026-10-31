import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePhase3Hand,
  loadPhase3Source,
  phase3Seed,
  playPhase3Hand,
  refreshPhase3Hand,
} from '../../scripts/audit-review-phase3.mjs';
import {
  PHASE3_SCENES,
  PHASE3_STYLES,
  phase3Configuration,
  phase3Reviewer,
} from '../../scripts/review-phase3-scenes.mjs';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';

const api = await loadPhase3Source(new URL('../..', import.meta.url).pathname);

test('reviewer strata each receive 800 natural hands, every hero policy and 10 of every scene', () => {
  const counts = new Map();
  for (let index = 0; index < 4000; index++) {
    const reviewer = phase3Reviewer(index);
    const c = phase3Configuration(index);
    const data = counts.get(reviewer) || { natural: 0, targeted: 0, policies: {}, scenes: {} };
    if (!c.scene) {
      data.natural++;
      data.policies[c.heroPolicy] = (data.policies[c.heroPolicy] || 0) + 1;
    } else {
      data.targeted++;
      data.scenes[c.scene.id] = (data.scenes[c.scene.id] || 0) + 1;
    }
    counts.set(reviewer, data);
  }
  assert.equal(counts.size, 4);
  for (const data of counts.values()) {
    assert.equal(data.natural, 800);
    assert.equal(data.targeted, 200);
    assert.deepEqual(Object.values(data.policies), [200, 200, 200, 200]);
    assert.equal(Object.keys(data.scenes).length, 20);
    assert(Object.values(data.scenes).every((n) => n === 10));
  }
});

test('phase three allocates 3200 natural and 800 targeted hands with exact canonical styles', () => {
  assert.deepEqual([...PHASE3_STYLES].sort(), BOT_PROFILES.map((p) => p.id).sort());
  const scenes = new Map(PHASE3_SCENES.map((scene) => [scene.id, []]));
  const seats = Array(10).fill(0);
  for (let index = 0; index < 4000; index++) {
    const configuration = phase3Configuration(index);
    seats[configuration.players]++;
    assert(Object.values(configuration.assignments).every((id) => PHASE3_STYLES.includes(id)));
    assert(configuration.stacksBB.every((depth) => Number.isInteger(depth) && depth > 0));
    if (configuration.scene) scenes.get(configuration.scene.id).push(configuration);
    else assert(index < 3200);
  }
  assert.deepEqual(seats.slice(5), [800, 800, 800, 800, 800]);
  for (const configurations of scenes.values()) {
    assert.equal(configurations.length, 40);
    assert.equal(new Set(configurations.map((c) => c.players)).size, 5);
    assert.equal(new Set(configurations.map((c) => c.difficulty)).size, 3);
    assert.equal(new Set(configurations.map((c) => c.emotionMode)).size, 3);
    assert.equal(new Set(configurations.map((c) => c.smallBlind)).size, 3);
    assert.equal(new Set(configurations.flatMap((c) => Object.values(c.assignments))).size, 8);
  }
});

test('phase three independent seeds keep hand deals and actions stable across shard boundaries', () => {
  assert.notEqual(phase3Seed(202610243, 0), phase3Seed(202610243, 1));
  assert.notEqual(phase3Seed(202610243, 0, 0), phase3Seed(202610243, 0, 1));
  const first = playPhase3Hand(api, 17, { botTrials: 1 });
  playPhase3Hand(api, 31, { botTrials: 1 });
  const again = playPhase3Hand(api, 17, { botTrials: 1 });
  assert.deepEqual(first.initialDeal, again.initialDeal);
  assert.deepEqual(first.game.history, again.game.history);
});

test('twenty target types complete legally at all five table sizes with unique complete deals', () => {
  for (let index = 3200; index < 3300; index++) {
    const played = playPhase3Hand(api, index, { botTrials: 1 });
    const { initialDeal, game, targeted } = played;
    const cards = [...initialDeal.deck, ...initialDeal.players.flatMap((p) => p.hole)];
    assert.equal(cards.length, 52);
    assert.equal(new Set(cards.map((card) => card.key)).size, 52);
    assert.equal(game.phase, 'done');
    assert(targeted.targetReached);
    assert.equal(
      game.players.reduce((n, p) => n + p.stack, 0),
      initialDeal.bank,
    );
    assert(played.policyLog.some((p) => p.source === 'scripted-prefix'));
    const short = played.configuration.scene.id === 'short-all-in-no-reopen';
    if (short) assert.equal(targeted.targetEvent.legal.canRaise, false);
    if (played.configuration.scene.id === 'short-stack-side-pot') assert(game.pots.length >= 2);
    if (played.configuration.scene.id === 'set-four-hearts-river') {
      assert.equal(targeted.facts.maxSuit, 4);
      assert.equal(targeted.facts.handClass, 'set');
    }
    for (const policy of played.policyLog) {
      const view = policy.proposed.trace.view;
      assert(!('deck' in view));
      assert(!view.opponents.some((p) => 'hole' in p));
    }
  }
});

test('three-heart set probe preserves the original policy proposal and labels the constructed action', () => {
  const played = playPhase3Hand(api, 3220, { botTrials: 1 });
  const target = played.policyLog.find((p) => p.sequence === played.targeted.targetEvent.sequence);
  assert.equal(played.configuration.focus, 1);
  assert.equal(target.actor, 1);
  assert.equal(target.source, 'scripted-probe');
  assert.equal(target.applied.action, 'check');
  assert(target.proposed.trace.view);
  const record = played.game.botDecisions.find((r) => r.sequence === target.sequence);
  assert.equal(record.trace.reasonSource, 'scripted-action-only');
  assert.equal(record.trace.provenance, 'scripted-probe');
  assert(!record.trace.basis);
});

test('presentation refresh keeps saved numerical analyses and records separate source provenance', () => {
  const played = playPhase3Hand(api, 3200, { botTrials: 1 });
  const original = analyzePhase3Hand(api, played, { trials: 2, rolloutTrials: 2 });
  const refreshed = refreshPhase3Hand(api, original);
  assert.deepEqual(
    refreshed.entries.filter((e) => e.perspective === 'hero').map((e) => e.analysis),
    JSON.parse(
      JSON.stringify(
        original.entries.filter((e) => e.perspective === 'hero').map((e) => e.analysis),
      ),
    ),
  );
  assert.equal(refreshed.analysisDigest, original.analysisDigest);
  assert.equal(refreshed.presentationDigest, api.fingerprint.digest);
  assert.deepEqual(refreshed.refresh.numericalReanalysis, []);
  assert.deepEqual(refreshed.fullHistory, original.fullHistory);
  assert(refreshed.entries.some((entry) => entry.isTargetDecision));
});

test('full reanalysis removes an older presentation view rather than displaying stale advice', () => {
  const played = playPhase3Hand(api, 3200, { botTrials: 1 });
  const original = analyzePhase3Hand(api, played, { trials: 2, rolloutTrials: 2 });
  const first = refreshPhase3Hand(api, original);
  const refreshed = refreshPhase3Hand(api, first, {
    trials: 2,
    rolloutTrials: 2,
    reanalyze: () => true,
  });
  for (const entry of refreshed.entries.filter((e) => e.perspective === 'hero')) {
    assert.equal(entry.presentationAnalysis, undefined);
    assert.deepEqual(entry.review.recommendedAction, entry.analysis.coaching.recommendedAction);
  }
});

test('refresh distinguishes changed route wording from a changed recommended action', () => {
  const played = playPhase3Hand(api, 3200, { botTrials: 1 });
  const original = analyzePhase3Hand(api, played, { trials: 2, rolloutTrials: 2 });
  const hero = original.entries.find((e) => e.perspective === 'hero');
  hero.review.recommendedAction.condition = 'Older wording only';
  hero.review.recommendedAction.tradeoff = 'Older tradeoff only';
  const updated = refreshPhase3Hand(api, original);
  assert.deepEqual(updated.refresh.numericalReanalysis, []);
  const changed = JSON.parse(JSON.stringify(original));
  const target = changed.entries.find((e) => e.perspective === 'hero');
  target.review.recommendedAction.action =
    target.review.recommendedAction.action === 'fold' ? 'call' : 'fold';
  assert.throws(() => refreshPhase3Hand(api, changed), /Recommendation changed/);
});
