import { cards } from './deceptive-decisions.js';

// Before-action public snapshots reconstructed from the reported screenshots.
export function turnBluffReview() {
  return {
    index: 0,
    hand: 1,
    smallBlind: 100,
    bigBlind: 200,
    chipUnit: 100,
    hole: cards('5c 2h'),
    board: cards('Kd Jd 7s 8s'),
    street: 2,
    position: 'BB',
    stack: 20000,
    total: 4000,
    bet: 0,
    pot: 13300,
    currentBet: 0,
    minRaise: 200,
    action: 'raise',
    amount: 6300,
    pending: [0],
    players: [
      { id: 0, name: '你', position: 'BB', stack: 20000, total: 4000, bet: 0 },
      {
        id: 1,
        name: 'Kai',
        botProfile: 'peter',
        position: 'LJ',
        stack: 13300,
        total: 9300,
        bet: 0,
      },
    ],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 1000 },
      { id: 0, street: 0, action: 'call', amount: 800 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'check', amount: 0 },
    ],
    legal: {
      chipUnit: 100,
      canCheck: true,
      callAmount: 0,
      toCall: 0,
      canRaise: true,
      raiseReopened: true,
      minRaiseTo: 200,
      fullRaiseTo: 200,
      maxRaiseTo: 20000,
    },
  };
}

export function turnStraightCallRecord() {
  const hero = turnBluffReview();
  return {
    id: 1,
    name: 'Kai',
    sequence: 1,
    action: 'call',
    amount: 6300,
    trace: {
      profile: 'peter',
      profileName: 'Peter',
      reason: 'price-continue',
      mode: 'off',
      mood: { kind: 'steady' },
      exceptions: [],
      view: {
        ...hero,
        id: 1,
        hole: cards('Td Qs'),
        position: 'LJ',
        stack: 13300,
        pot: 19600,
        currentBet: 6300,
        contestable: 25900,
        rivals: 1,
        inPosition: true,
        players: undefined,
        opponents: [{ id: 0, name: '你', position: 'BB', stack: 13700, bet: 6300, total: 10300 }],
        history: [...hero.history, { id: 0, street: 2, action: 'raise', amount: 6300 }],
        legal: {
          ...hero.legal,
          canCheck: false,
          callAmount: 6300,
          toCall: 6300,
          minRaiseTo: 12600,
          fullRaiseTo: 12600,
          maxRaiseTo: 13300,
        },
      },
    },
  };
}

export function suitedBroadwayFiveBetFold() {
  const s = turnBluffReview();
  return {
    ...s,
    hole: cards('Kc Qc'),
    board: [],
    street: 0,
    position: 'HJ',
    stack: 19000,
    total: 1000,
    bet: 1000,
    pot: 15800,
    currentBet: 9300,
    minRaise: 3800,
    action: 'fold',
    amount: 0,
    players: [
      { id: 0, name: '你', position: 'HJ', stack: 19000, total: 1000, bet: 1000 },
      {
        id: 1,
        name: 'Jade',
        botProfile: 'jungleman',
        position: 'MP',
        stack: 10700,
        total: 9300,
        bet: 9300,
      },
      {
        id: 2,
        name: 'Theo',
        botProfile: 'viktor',
        position: 'CO',
        stack: 14500,
        total: 5500,
        bet: 5500,
      },
    ],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 600 },
      { id: 0, street: 0, action: 'raise', amount: 1000 },
      { id: 2, street: 0, action: 'raise', amount: 5500 },
      { id: 1, street: 0, action: 'raise', amount: 9300 },
    ],
    legal: {
      ...s.legal,
      canCheck: false,
      callAmount: 8300,
      toCall: 8300,
      minRaiseTo: 13100,
      fullRaiseTo: 13100,
      maxRaiseTo: 20000,
    },
  };
}

export function pocketNinesCheckedBoard() {
  const s = turnBluffReview();
  return {
    ...s,
    hole: cards('9d 9c'),
    board: cards('2d Th 2s'),
    street: 1,
    position: 'BTN',
    pot: 5200,
    amount: 3400,
    players: [s.players[0], { ...s.players[1], name: 'Leo', botProfile: 'dwan', position: 'BB' }],
    history: [{ id: 1, street: 1, action: 'check', amount: 0 }],
  };
}
