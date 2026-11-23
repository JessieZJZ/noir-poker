import {
  newGame,
  startHand,
  seatPosition,
  botDecision,
  act,
  advanceStreet,
} from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// The reported 23rd hand at 300/600, four seated: River limps from CO, Luna
// (范围纪律) limps behind on the BTN with A♥ J♥, and on Q♠ 3♠ 7♣ A♦ 2♦ calls
// your river shove-sized bet all-in after your turn check-raise.
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

function arrangedHand({ postflopRaises }) {
  let game;
  for (let dealer = 0; dealer < 5; dealer++) {
    game = newGame(5, { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 });
    game.difficulty = 'normal';
    game.emotionMode = 'off';
    game.hand = 22;
    game.levelIndex = 2;
    game.smallBlind = 300;
    game.bigBlind = 600;
    game.levelHands = 1;
    game.players[4].stack = 0;
    game.players[4].out = true;
    game.dealer = dealer;
    const random = Math.random;
    Math.random = seeded(7);
    try {
      startHand(game);
    } finally {
      Math.random = random;
    }
    if (seatPosition(game, 0) === 'BB') break;
  }
  const at = (position) => game.players.find((p) => seatPosition(game, p.id) === position);
  const luna = at('BTN'),
    river = at('CO'),
    leo = at('SB');
  Object.assign(luna, { name: 'Luna', botProfile: 'owen', stack: 16000 });
  Object.assign(river, { name: 'River', botProfile: 'jett' });
  leo.name = 'Leo';
  game.players[0].stack = 25000 - game.players[0].bet;
  // Your earlier public hands: frequent postflop bets and raises.
  game.players[0].publicReads = Array.from({ length: 22 }, () => ({
    hands: 1,
    voluntaryHands: 1,
    raisingHands: 1,
    postActions: 4,
    postRaises: postflopRaises,
    facedPostBet: 1,
    calledPostBet: 1,
  }));
  const take = (text) =>
    cards(text).map((wanted) => {
      for (const group of [...game.players.map((p) => p.hole), game.deck]) {
        const index = group.findIndex((card) => card.key === wanted.key);
        if (index >= 0) return group.splice(index, 1)[0];
      }
      throw Error('Missing card in arranged deal');
    });
  const hole = take('Ah Jh');
  game.deck.push(...luna.hole.splice(0));
  luna.hole.push(...hole);
  const board = take('Qs 3s 7c Ad 2d');
  const burns = game.deck.splice(0, 3);
  // Streets pop from the end: burn, flop, burn, turn, burn, river.
  game.deck.push(board[4], burns[2], board[3], burns[1], board[2], board[1], board[0], burns[0]);
  return { game, luna, river, leo };
}

function recorded(game, id, action) {
  for (let seed = 1; seed < 400; seed++) {
    const decision = botDecision(game, seeded(seed));
    if (decision.action === action)
      return JSON.parse(
        JSON.stringify({
          id,
          name: game.players[id].name,
          hand: game.hand,
          sequence: game.history.length + 1,
          action: decision.action,
          amount: decision.amount,
          trace: decision.trace,
        }),
      );
  }
  throw Error(`No ${action} decision in the sampled seeds`);
}

export function lunaBluffCatch({ postflopRaises = 3 } = {}) {
  const { game, luna, river, leo } = arrangedHand({ postflopRaises });
  act(game, river.id, 'call');
  const preflop = recorded(game, luna.id, 'call');
  act(game, luna.id, 'call');
  act(game, leo.id, 'fold');
  act(game, 0, 'check');
  advanceStreet(game);
  act(game, 0, 'check');
  act(game, river.id, 'check');
  act(game, luna.id, 'raise', 1100);
  act(game, 0, 'call');
  act(game, river.id, 'fold');
  advanceStreet(game);
  act(game, 0, 'check');
  act(game, luna.id, 'raise', 1100);
  act(game, 0, 'raise', 4400);
  act(game, luna.id, 'call');
  advanceStreet(game);
  act(game, 0, 'raise', 13100);
  return { game, preflop, river: recorded(game, luna.id, 'call') };
}
