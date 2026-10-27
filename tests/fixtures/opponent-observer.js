import { deceptiveView } from './deceptive-decisions.js';

export function observerRecord({
  action = 'fold',
  reason = 'pot-control',
  hole = 'As 2d',
  board = 'Ad Ts 8h 7s 8s',
  cost = action === 'check' ? 0 : 300,
  stack = 1500,
  ...changes
} = {}) {
  return {
    id: 1,
    name: 'Alex',
    action,
    amount: action === 'raise' ? 600 : action === 'call' ? cost : 0,
    trace: {
      profile: 'balanced',
      reason,
      mode: 'off',
      view: deceptiveView(hole, board, {
        position: 'SB',
        stack,
        pot: 800,
        currentBet: cost,
        contestable: 800 + cost,
        history: cost
          ? [
              {
                id: 0,
                street: board
                  ? board.split(' ').length === 5
                    ? 3
                    : board.split(' ').length - 2
                  : 0,
                action: 'raise',
                amount: cost,
              },
            ]
          : [],
        opponents: [{ id: 0, name: '你', position: 'BTN', stack: 2000, bet: cost, allin: false }],
        actionContext: { pendingResponseIds: action === 'check' ? [0] : [] },
        legal: {
          chipUnit: 25,
          enabled: true,
          canCheck: !cost,
          canRaise: stack > cost,
          callAmount: cost,
          toCall: cost,
          minRaiseTo: cost * 2 || 50,
          maxRaiseTo: stack,
        },
        ...changes,
      }),
    },
  };
}
