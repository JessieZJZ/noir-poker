import { cards } from './deceptive-decisions.js';

// User-reported public snapshot. No opponent holes or later outcomes.
export function bottomPairReview() {
  const names = ['你', 'Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo'];
  const positions = ['CO', 'BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ'];
  const active = new Set([0, 4, 5, 7]);
  return {
    hand: 29,
    bigBlind: 1000,
    smallBlind: 500,
    chipUnit: 500,
    hole: cards('Ad 4h'),
    board: cards('5d 4s Js'),
    street: 1,
    position: 'CO',
    difficulty: 'normal',
    stack: 96000,
    bet: 0,
    total: 4000,
    pot: 17500,
    currentBet: 0,
    minRaise: 1000,
    action: 'raise',
    amount: 96000,
    pending: [0],
    legal: {
      enabled: true,
      chipUnit: 500,
      canCheck: true,
      canRaise: true,
      callAmount: 0,
      toCall: 0,
      minRaiseTo: 1000,
      maxRaiseTo: 96000,
    },
    players: names.map((name, id) => ({
      id,
      name,
      position: positions[id],
      stack: active.has(id) ? 96000 : 100000,
      total: active.has(id) ? 4000 : id === 2 ? 500 : id === 3 ? 1000 : 0,
      bet: 0,
      folded: !active.has(id),
      allin: false,
    })),
    history: [
      { id: 4, street: 0, action: 'call', amount: 1000 },
      { id: 5, street: 0, action: 'raise', amount: 4000 },
      { id: 6, street: 0, action: 'fold', amount: 0 },
      { id: 7, street: 0, action: 'call', amount: 4000 },
      { id: 8, street: 0, action: 'fold', amount: 0 },
      { id: 0, street: 0, action: 'call', amount: 4000 },
      { id: 1, street: 0, action: 'fold', amount: 0 },
      { id: 2, street: 0, action: 'fold', amount: 0 },
      { id: 3, street: 0, action: 'fold', amount: 0 },
      { id: 4, street: 0, action: 'call', amount: 3000 },
      { id: 4, street: 1, action: 'check', amount: 0 },
      { id: 5, street: 1, action: 'check', amount: 0 },
      { id: 7, street: 1, action: 'check', amount: 0 },
    ],
  };
}

export function topPairCheckReview() {
  const s = bottomPairReview();
  const view = {
    ...s,
    id: 5,
    hole: cards('Jh Ah'),
    stack: 118000,
    position: 'UTG+1',
    history: s.history.slice(0, -2),
    inPosition: false,
    rivals: 3,
    count: 9,
    opponents: s.players.filter((p) => p.id !== 5 && !p.folded),
    actionContext: { pendingResponseIds: [7, 0] },
  };
  delete view.players;
  return {
    id: 5,
    name: 'Luna',
    action: 'check',
    sequence: view.history.length + 1,
    trace: {
      view,
      reason: 'free-check',
      profile: 'balanced',
      mode: 'off',
      exceptions: [],
      basis: { version: 1, action: 'check', reason: 'free-check' },
    },
  };
}
