import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionContext } from '../../src/review/context.js';
import { spotFacts } from '../../src/review/spot-facts.js';
import { situationEntries } from '../../src/review/narrative.js';
import { reportedGutshotCall } from '../fixtures/review-summary.js';

const event = (street, id, action, amount = 0) => ({ street, id, action, amount });
function spot() {
  const s = reportedGutshotCall();
  s.street = 3;
  s.board.push({ key: '3-2', suit: 3, rank: 2 });
  s.action = 'fold';
  s.amount = 0;
  s.history = [
    event(1, 1, 'check'),
    event(1, 0, 'raise', 750),
    event(1, 1, 'raise', 1750),
    event(1, 0, 'raise', 3450),
    event(1, 1, 'call', 1700),
    event(2, 1, 'check'),
    event(2, 0, 'raise', 850),
    event(2, 1, 'raise', 2050),
    event(2, 0, 'raise', 4050),
    event(2, 1, 'call', 2000),
    event(3, 1, 'raise', 4800),
  ];
  return s;
}

test('two streets of check-raises followed by calls cannot become a passive-check story', () => {
  const s = spot(),
    c = decisionContext(s),
    before = structuredClone(s);
  assert.deepEqual(spotFacts(s, c).lastAggression.priorChecks, []);
  const text = situationEntries(s, c)
    .find((entry) => entry.kind === 'action-line')
    .parts.join('');
  assert.match(text, /翻牌 2-bet 加注至 1.75K → 转牌 2-bet 加注至 2.05K → 河牌 下注至 4.8K/);
  assert.match(text, /连续施压/);
  assert.doesNotMatch(text, /此前在.*过牌|之前的过牌不能排除慢打/);
  assert.deepEqual(s, before);
});

test('a check-call is not summarized as a pure prior check but a genuinely checked-through street is', () => {
  const s = spot();
  s.history = [
    event(1, 1, 'check'),
    event(1, 0, 'raise', 750),
    event(1, 1, 'call', 750),
    event(2, 1, 'raise', 2050),
  ];
  s.street = 2;
  s.board = s.board.slice(0, 4);
  assert.deepEqual(spotFacts(s, decisionContext(s)).lastAggression.priorChecks, []);
  s.history = [event(1, 1, 'check'), event(1, 0, 'check'), event(2, 1, 'raise', 2050)];
  const c = decisionContext(s);
  assert.deepEqual(spotFacts(s, c).lastAggression.priorChecks, [1]);
  assert.match(
    situationEntries(s, c)
      .find((entry) => entry.kind === 'action-line')
      .parts.join(''),
    /此前在翻牌过牌/,
  );
  assert.doesNotMatch(
    situationEntries(s, c)
      .map((entry) => entry.parts.join(''))
      .join(''),
    /连续施压/,
  );
});
