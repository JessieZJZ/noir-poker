import { deceptiveView } from './deceptive-decisions.js';
import { chooseBotAction, freshBotMood, getBotProfile } from '../../src/engine/bot-profiles.js';

// External public-snapshot probes; no test entry point enters the product.
export function phase3CheckSpot(hole = '5c 5s', board = '4d Qh Ah 5h', options = {}) {
  const { pending = true, reason, ...overrides } = options;
  const view = deceptiveView(hole, board, {
    count: 2,
    position: pending ? 'CO' : 'BTN',
    inPosition: !pending,
    stack: 4500,
    total: 500,
    pot: 1000,
    contestable: 1000,
    equity: 0.8,
    opponents: [
      {
        id: 0,
        name: '你',
        position: pending ? 'BTN' : 'BB',
        stack: 4500,
        bet: 0,
        total: 500,
        allin: false,
        folded: false,
      },
    ],
    actionContext: { pendingResponseIds: pending ? [0] : [] },
    ...overrides,
  });
  const decision = chooseBotAction(
    view,
    getBotProfile('balanced'),
    freshBotMood(),
    'off',
    () => 0.95,
  );
  const record = {
    ...decision,
    id: 1,
    name: 'Kai',
    trace: { ...decision.trace, view },
  };
  // A named reason override probes a presentation branch, not a policy result.
  if (reason) {
    record.action = 'check';
    record.amount = 0;
    record.trace.reason = reason;
    delete record.trace.basis;
  }
  const snapshot = {
    ...view,
    id: 0,
    action: 'check',
    amount: 0,
    pending: pending ? [1] : [],
    players: [
      { id: 0, name: '你', position: view.position, stack: view.stack, bet: 0, total: 500 },
      { ...view.opponents[0], id: 1, name: 'Kai' },
    ],
    opponents: undefined,
  };
  return { view, record, snapshot };
}
