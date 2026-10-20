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

// Reconstructed from the displayed cards and prices, not a recovered full hand.
export function reportedKeyInfoCall(hole = 'As Qs') {
  return {
    ...turnBluffReview(),
    smallBlind: 10000,
    bigBlind: 20000,
    chipUnit: 10000,
    hole: cards(hole),
    board: [],
    street: 0,
    position: 'SB',
    stack: 2650000,
    total: 60000,
    bet: 60000,
    pot: 460000,
    currentBet: 200000,
    minRaise: 140000,
    action: 'call',
    amount: 140000,
    players: [
      { id: 0, name: '你', position: 'SB', stack: 2650000, total: 60000, bet: 60000 },
      {
        id: 1,
        name: 'Mia',
        botProfile: 'tan',
        position: 'BB',
        stack: 2500000,
        total: 200000,
        bet: 200000,
      },
      {
        id: 2,
        name: 'River',
        botProfile: 'peter',
        position: 'HJ',
        stack: 2500000,
        total: 200000,
        bet: 200000,
      },
    ],
    history: [
      { id: 2, street: 0, action: 'raise', amount: 60000 },
      { id: 0, street: 0, action: 'call', amount: 60000 },
      { id: 1, street: 0, action: 'raise', amount: 200000 },
      { id: 2, street: 0, action: 'call', amount: 140000 },
    ],
    legal: {
      chipUnit: 10000,
      canCheck: false,
      callAmount: 140000,
      toCall: 140000,
      canRaise: true,
      minRaiseTo: 340000,
      fullRaiseTo: 340000,
      maxRaiseTo: 2710000,
    },
  };
}

export function reportedGutshotCall() {
  const s = reportedKeyInfoCall('Ad Qs');
  return {
    ...s,
    hole: cards('Ad Qs'),
    board: cards('6c Ks Th 9h'),
    street: 2,
    position: 'CO',
    stack: 2830000,
    bet: 0,
    total: 345000,
    pot: 1210000,
    currentBet: 520000,
    minRaise: 520000,
    amount: 520000,
    smallBlind: 5000,
    bigBlind: 10000,
    chipUnit: 5000,
    players: [
      { id: 0, name: '你', position: 'CO', stack: 2830000, bet: 0, total: 345000 },
      {
        id: 1,
        name: 'River',
        botProfile: 'peter',
        position: 'BB',
        stack: 0,
        bet: 520000,
        total: 865000,
        allin: true,
      },
    ],
    history: [
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'raise', amount: 520000 },
    ],
    legal: {
      chipUnit: 5000,
      canCheck: false,
      callAmount: 520000,
      toCall: 520000,
      canRaise: false,
      minRaiseTo: 1040000,
      maxRaiseTo: 2830000,
    },
  };
}

// Reconstructed public prices and actions from the 4d5d screenshot. Unshown
// stacks and waiting seats are illustrative, not a recovered original hand.
export function reportedLowConnectorCall() {
  const s = reportedKeyInfoCall('4d 5d');
  const seats = ['HJ', 'UTG', 'UTG+1', 'MP', 'LJ', 'CO', 'BTN', 'SB', 'BB'];
  const bets = [0, 0, 20000, 20000, 100000, 0, 0, 10000, 20000];
  return {
    ...s,
    position: 'HJ',
    stack: 6270000,
    bet: 0,
    total: 0,
    pot: 170000,
    currentBet: 100000,
    minRaise: 80000,
    amount: 100000,
    pending: [0, 5, 6, 7, 8, 2, 3],
    players: seats.map((position, id) => ({
      id,
      position,
      name: ['你', 'River', 'Theo', 'Jade', 'Leo', 'Kai', 'Mia', 'Alex', 'Sam'][id],
      stack: id ? 6000000 : 6270000,
      bet: bets[id],
      total: bets[id],
      folded: id === 1,
    })),
    history: [
      { id: 1, street: 0, action: 'fold', amount: 0 },
      { id: 2, street: 0, action: 'call', amount: 20000 },
      { id: 3, street: 0, action: 'call', amount: 20000 },
      { id: 4, street: 0, action: 'raise', amount: 100000 },
    ],
    legal: {
      ...s.legal,
      callAmount: 100000,
      toCall: 100000,
      minRaiseTo: 180000,
      fullRaiseTo: 180000,
      maxRaiseTo: 6270000,
    },
  };
}

// Displayed public ledger before hero's 55 all-in. Other actors' remaining
// stacks are illustrative; their later response/cards never enter the review.
export function reportedFivesAllIn() {
  const s = reportedKeyInfoCall('5h 5c');
  const positions = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'];
  const totals = [380000, 10000, 1520000, 20000, 5720000, 80000, 0, 0, 380000];
  return {
    ...s,
    position: 'BTN',
    stack: 1620000,
    bet: 380000,
    total: 380000,
    pot: 8110000,
    currentBet: 5720000,
    minRaise: 4200000,
    amount: 1620000,
    pending: [0, 2],
    players: positions.map((position, id) => ({
      id,
      position,
      name: ['你', 'Mia', 'Alex', 'River', 'Kai', 'Luna', 'Theo', 'Jade', 'Leo'][id],
      stack: id ? 2000000 : 1620000,
      bet: totals[id],
      total: totals[id],
      folded: ![0, 2, 4].includes(id),
    })),
    history: [
      { id: 3, street: 0, action: 'call', amount: 20000 },
      { id: 4, street: 0, action: 'raise', amount: 80000 },
      { id: 5, street: 0, action: 'call', amount: 80000 },
      { id: 6, street: 0, action: 'fold', amount: 0 },
      { id: 7, street: 0, action: 'fold', amount: 0 },
      { id: 8, street: 0, action: 'raise', amount: 380000 },
      { id: 0, street: 0, action: 'call', amount: 380000 },
      { id: 1, street: 0, action: 'fold', amount: 0 },
      { id: 2, street: 0, action: 'raise', amount: 1520000 },
      { id: 3, street: 0, action: 'fold', amount: 0 },
      { id: 4, street: 0, action: 'raise', amount: 5720000 },
      { id: 5, street: 0, action: 'fold', amount: 0 },
      { id: 8, street: 0, action: 'fold', amount: 0 },
    ],
    legal: {
      ...s.legal,
      callAmount: 1620000,
      toCall: 5340000,
      canRaise: false,
      minRaiseTo: 9920000,
      fullRaiseTo: 9920000,
      maxRaiseTo: 2000000,
    },
  };
}
