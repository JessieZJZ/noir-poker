import { turnBluffReview } from './review-summary.js';
import { cards } from './deceptive-decisions.js';

// Reconstruct only the public before-action facts from the reported turn call.
// The missing original saved hand is not restored or inferred by this fixture.
export function lastRiverCall() {
  const base = turnBluffReview();
  return {
    ...base,
    position: 'HJ',
    hole: cards('8s 7c'),
    board: cards('Tc 6c Kd 4d'),
    action: 'call',
    amount: 400000,
    stack: 1690000,
    bet: 0,
    total: 400000,
    pot: 1200000,
    currentBet: 400000,
    minRaise: 400000,
    pending: [0],
    players: [
      { id: 0, name: '你', position: 'HJ', stack: 1690000, bet: 0, total: 400000 },
      { id: 1, name: 'Jade', position: 'MP', stack: 1600000, bet: 400000, total: 800000 },
    ],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 130000 },
      { id: 0, street: 0, action: 'call', amount: 130000 },
      { id: 1, street: 1, action: 'raise', amount: 180000 },
      { id: 0, street: 1, action: 'call', amount: 180000 },
      { id: 1, street: 2, action: 'raise', amount: 400000 },
    ],
    legal: {
      ...base.legal,
      canCheck: false,
      callAmount: 400000,
      toCall: 400000,
      minRaiseTo: 800000,
      fullRaiseTo: 800000,
      maxRaiseTo: 1690000,
    },
  };
}
