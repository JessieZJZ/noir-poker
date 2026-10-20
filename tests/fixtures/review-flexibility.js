import {
  act,
  advanceStreet,
  deckOfCards,
  newGame,
  seatPosition,
  startHand,
} from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// These fixtures execute real legal actions. Reassign the whole deck together
// with the fixed hero hand, rather than leaving duplicate cards in another seat.
function fixDeal(game, hole, flop = []) {
  const own = cards(hole);
  const reserved = [...own, ...flop];
  const pool = deckOfCards().filter((card) => !reserved.some((held) => held.key === card.key));
  game.players[0].hole = own;
  for (const player of game.players.slice(1)) player.hole = pool.splice(0, 2);
  // The engine burns once, then pops the flop in its displayed order.
  game.deck = flop.length ? [...pool.slice(0, -1), ...flop.toReversed(), pool.at(-1)] : pool;
}

function begin({ smallBlind, heroStack, openerBB, callerBB, blindBB, position, hole }) {
  const bigBlind = smallBlind * 2;
  const game = newGame(6, {
    smallBlind,
    bigBlind,
    chipUnit: smallBlind,
    startingStack: bigBlind * 100,
  });
  // startHand advances the button once. Keep player 0 as the reviewed actor.
  game.dealer = position === 'SB' ? 4 : 5;
  const opener = position === 'SB' ? 2 : 3;
  const caller = position === 'SB' ? 4 : 5;
  game.players[0].stack = heroStack;
  game.players[opener].stack = openerBB * bigBlind;
  game.players[caller].stack = callerBB * bigBlind;
  for (const id of position === 'SB' ? [1] : [1, 2]) game.players[id].stack = blindBB * bigBlind;
  startHand(game);
  fixDeal(game, hole);
  return { game, opener, caller, bigBlind };
}

export function reviewFlexibilityGame({
  smallBlind = 100,
  heroStack = smallBlind * 423,
  openerBB = 100,
  callerBB = 100,
  blindBB = 100,
  position = 'BTN',
  hole = '7c 8c',
  caller = true,
  openTo = smallBlind * 5,
  threeBet = false,
  action = 'fold',
  amount,
} = {}) {
  const {
    game,
    opener,
    caller: callerId,
  } = begin({
    smallBlind,
    heroStack,
    openerBB,
    callerBB,
    blindBB,
    position,
    hole,
  });
  while (game.actor !== 0) {
    const id = game.actor;
    const seat = seatPosition(game, id);
    if (id === opener) act(game, id, 'raise', openTo);
    else if (threeBet && seat === 'HJ') act(game, id, 'raise', openTo * 3);
    else act(game, id, caller && id === callerId ? 'call' : 'fold');
  }
  act(game, 0, action, action === 'raise' ? (amount ?? openTo * 4) : undefined);
  return game;
}

export function reviewFlexibilitySnapshot(options) {
  return reviewFlexibilityGame(options).decisions.at(-1);
}

export function matchedLimpCallerGame({
  smallBlind = 25,
  heroBB = 200,
  openerBB = 200,
  limperBB = 50,
  blindBB = 100,
} = {}) {
  const bb = smallBlind * 2;
  const game = newGame(6, {
    smallBlind,
    bigBlind: bb,
    chipUnit: smallBlind,
    startingStack: bb * 100,
  });
  game.dealer = 5;
  game.players[0].stack = heroBB * bb;
  game.players[1].stack = blindBB * bb;
  game.players[2].stack = openerBB * bb;
  game.players[3].stack = limperBB * bb;
  startHand(game);
  fixDeal(game, '8s 7s');
  // BTN limped before BB's opening raise. UTG has already responded to that
  // raise when action returns to BTN, so his call is an increment, not a total.
  for (const [id, action, amount] of [
    [3, 'call'],
    [4, 'call'],
    [5, 'call'],
    [0, 'call'],
    [1, 'call'],
    [2, 'raise', bb * 3],
    [3, 'call'],
    [4, 'fold'],
    [5, 'fold'],
    [0, 'call'],
  ])
    act(game, id, action, amount);
  return game;
}

export function closedLimpEntryGame() {
  const game = newGame(5, {
    smallBlind: 100,
    bigBlind: 200,
    chipUnit: 100,
    startingStack: 20000,
  });
  game.dealer = 4;
  game.players[0].stack = 42300;
  startHand(game);
  fixDeal(game, '7c 8c');
  for (const [id, action, amount] of [
    [3, 'fold'],
    [4, 'fold'],
    [0, 'call'],
    [1, 'raise', 500],
    [2, 'call'],
    [0, 'call'],
  ])
    act(game, id, action, amount);
  return game;
}

export function strongMadeRedrawGame() {
  const game = newGame(6, {
    smallBlind: 25,
    bigBlind: 50,
    chipUnit: 25,
    startingStack: 5000,
  });
  for (const player of game.players) player.stack = 12500;
  game.dealer = 0;
  startHand(game);
  fixDeal(game, 'Qh Jh', cards('Th 9h 8c'));
  for (const [id, action, amount] of [
    [4, 'fold'],
    [5, 'fold'],
    [0, 'raise', 100],
    [1, 'raise', 300],
    [2, 'fold'],
    [3, 'fold'],
    [0, 'raise', 500],
    [1, 'call'],
  ])
    act(game, id, action, amount);
  // The engine discards the burn card, so retain its identity only in this
  // test fixture to verify the complete original deal after the flop.
  game.fixtureBurnedCards = [game.deck.at(-1)];
  advanceStreet(game);
  act(game, 0, 'raise', 12000);
  return game;
}
