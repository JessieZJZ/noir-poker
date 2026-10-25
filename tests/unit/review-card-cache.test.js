import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import {
  SnapshotBoardCache,
  reviewCardCache,
  clearReviewCardCache,
} from '../../src/review/card-cache.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { cards } from '../fixtures/deceptive-decisions.js';

test('cold and warm pure-card caches preserve every metric, verdict, candidate and explanation', () => {
  const game = heroValueGame('overpair');
  const snapshot = game.decisions.find((decision) => decision.street === 1);
  clearReviewCardCache();
  const cold = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 12 });
  const warm = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 12 });
  assert.deepEqual(warm, cold);
  assert.ok(reviewCardCache().size <= 4);
  // Warm evaluations cannot turn a different public line into the old range.
  const changed = structuredClone(snapshot);
  changed.history = changed.history.map((event) => ({
    ...event,
    action: event.id === 1 ? 'raise' : event.action,
  }));
  const cached = analyzeDecision(changed, { trials: 120, rolloutTrials: 12 });
  clearReviewCardCache();
  assert.deepEqual(analyzeDecision(changed, { trials: 120, rolloutTrials: 12 }), cached);
});

test('reviewing many boards keeps at most four evaluation boards and never trusts actual opponent cards', () => {
  const snapshot = heroValueGame('overpair').decisions.find((decision) => decision.street === 1);
  for (const board of ['2s 3h 4c', '3s 4h 5c', '4s 5h 6c', '5s 6h 7c', '6s 7h 8c', '7s 8h 9c']) {
    const s = { ...snapshot, board: cards(board) };
    for (const p of s.players.slice(1))
      Object.defineProperty(p, 'hole', {
        configurable: true,
        get() {
          throw Error('private hole cards read');
        },
      });
    const result = handMatchups(s, decisionContext(s));
    assert.ok(result.summary);
    assert.ok(reviewCardCache().size <= 4);
  }
});

test('rollout deals share only the visible boards of their snapshot', () => {
  const visible = new Map(),
    board = cards('Qs Jd 9c 8h'),
    keys = (text) =>
      cards(text)
        .map((c) => c.key)
        .join('|');
  const first = new SnapshotBoardCache(visible, board);
  first.set(keys('Qs Jd 9c'), 'flop facts');
  first.set(keys('Qs Jd 9c 8h'), 'turn facts');
  first.set(keys('Qs Jd 9c 8h 2s'), 'sampled river');
  first.set('', 'board only');
  assert.equal(first.size, 2);
  assert.deepEqual([...visible.keys()], [keys('Qs Jd 9c'), keys('Qs Jd 9c 8h')]);
  const next = new SnapshotBoardCache(visible, board);
  assert.equal(next.get(keys('Qs Jd 9c')), 'flop facts');
  assert.equal(next.get(keys('Qs Jd 9c 8h')), 'turn facts');
  assert.equal(next.get(keys('Qs Jd 9c 8h 2s')), undefined);
  assert.equal(next.get(''), undefined);
  // A preflop snapshot has no visible board, so every deal keeps its own facts.
  const preflop = new SnapshotBoardCache(new Map(), []);
  preflop.set(keys('Qs Jd 9c'), 'sampled flop');
  assert.equal(new SnapshotBoardCache(preflop.fixed, []).get(keys('Qs Jd 9c')), undefined);
});
