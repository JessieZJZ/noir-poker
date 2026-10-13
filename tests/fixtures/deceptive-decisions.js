// External fixtures shared by unit, Web and official DevTools checks only.
import { deckOfCards, evaluate } from '../../src/engine/poker.js';
import {
  botBoardFeatures,
  chooseBotAction,
  getBotProfile,
  freshBotMood,
} from '../../src/engine/bot-profiles.js';

export const cards = (text) =>
  text
    ? text
        .split(' ')
        .map((key) =>
          deckOfCards().find(
            (c) =>
              c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
          ),
        )
    : [];
export function deceptiveView(hole, board = '', overrides = {}) {
  const own = cards(hole),
    community = cards(board);
  return {
    id: 1,
    hole: own,
    board: community,
    street: community.length === 5 ? 3 : community.length === 4 ? 2 : community.length ? 1 : 0,
    position: 'BTN',
    inPosition: true,
    count: 6,
    stack: 5000,
    bet: 0,
    pot: community.length ? 800 : 75,
    currentBet: community.length ? 0 : 50,
    contestable: community.length ? 800 : 125,
    rivals: community.length ? 1 : 2,
    equity: 0.2,
    difficulty: 'hard',
    history: [],
    playsBoard: false,
    opponents: [{ id: 0, stack: 5000, bet: 0, allin: false }],
    features: botBoardFeatures(own, community, evaluate([...own, ...community]).score),
    legal: {
      enabled: true,
      canCheck: !!community.length,
      canRaise: true,
      toCall: community.length ? 0 : 50,
      callAmount: community.length ? 0 : 50,
      minRaiseTo: community.length ? 50 : 100,
      maxRaiseTo: 5000,
    },
    ...overrides,
  };
}
export const deceptionCases = () => ({
  'preflop-trap': deceptiveView('As Ah', '', {
    currentBet: 150,
    pot: 225,
    contestable: 375,
    equity: 0.82,
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 150,
      callAmount: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
  }),
  'check-trap': deceptiveView('9s 9h', '9d Kc 2h', { equity: 0.9 }),
  'call-trap': deceptiveView('9s 9h', '9d Kc 2h', {
    equity: 0.9,
    pot: 1000,
    currentBet: 200,
    contestable: 1200,
    history: [{ id: 0, street: 1, action: 'raise', amount: 200 }],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 200,
      callAmount: 200,
      minRaiseTo: 400,
      maxRaiseTo: 5000,
    },
  }),
  'dirty-open': deceptiveView('Jh 4c'),
  'dirty-reraise': deceptiveView('Kh 4c', '', {
    currentBet: 150,
    pot: 225,
    contestable: 375,
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 150,
      callAmount: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
  }),
  'donk-draw': deceptiveView('8s 7s', '6s 5s Kh', {
    position: 'BB',
    inPosition: false,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'call', amount: 150 },
    ],
  }),
  'donk-value': deceptiveView('5s 5d', '5h 9h 2c', {
    position: 'BB',
    inPosition: false,
    equity: 0.9,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'call', amount: 150 },
    ],
  }),
  'seven-two-open': deceptiveView('7s 2h'),
  'seven-two-probe': deceptiveView('7s 2h', 'As Kd 9h 6c 3d', {
    equity: 0.02,
    history: [{ id: 0, street: 3, action: 'check', amount: 0 }],
  }),
});
export function deceptiveRecords() {
  return Object.entries(deceptionCases()).map(([name, view], index) => {
    const d = chooseBotAction(view, getBotProfile('balanced'), freshBotMood(), 'off', () => 0);
    return {
      ...d,
      fixture: name,
      id: 1,
      name: 'River',
      sequence: index + 1,
      trace: { ...d.trace, view },
    };
  });
}
