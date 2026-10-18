import { botDecision } from '../src/engine/poker.js';
import { buttonIsolation, lateColdShove } from './fixtures/preflop-pressure.js';
import { allInRandom } from './fixtures/all-in-decisions.js';

const scenarios = [
  ['AKo/46BB-UTG-shove/CO', () => lateColdShove()],
  ['88/46BB-UTG-shove/SB', () => lateColdShove('8s 8c', 7)],
  ['AQo/3BB-BTN-isolation/3-limpers', () => buttonIsolation()],
  ['AQo/16.5BB-BTN-isolation/3-limpers', () => buttonIsolation('As Qc', 16.5)],
  ['A6o/6BB-BTN-isolation/3-limpers', () => buttonIsolation('Ac 6s', 6)],
  ['76s/3BB-BTN-isolation/3-limpers', () => buttonIsolation('7s 6s')],
];
const result = [];
for (const [name, fixture] of scenarios) {
  const actions = {},
    reasons = {};
  let equity = 0,
    odds = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const d = botDecision(fixture(), allInRandom(seed));
    actions[d.action] = (actions[d.action] || 0) + 1;
    reasons[d.trace.reason] = (reasons[d.trace.reason] || 0) + 1;
    equity += d.trace.rawEquity;
    odds += d.trace.odds;
  }
  result.push({
    name,
    samples: 100,
    actions,
    reasons,
    averageEquity: equity / 100,
    odds: odds / 100,
  });
}
console.log(JSON.stringify(result, null, 2));
