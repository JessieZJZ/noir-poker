import { newGame, startHand, deckOfCards } from '../../src/engine/poker.js';

export const hintCards = (text) =>
  text.split(' ').map((name) => {
    const rank = '23456789TJQKA'.indexOf(name[0]) + 2;
    const suit = 'shcd'.indexOf(name[1]);
    return deckOfCards().find((card) => card.rank === rank && card.suit === suit);
  });

// Explicit public card/price fixtures for presentation, not engine scenarios.
export function tableHintGame(hole = 'As Ah', board = '', call = 200, stack = 5000) {
  const game = newGame(5, {
    smallBlind: 25,
    bigBlind: 50,
    startingStack: 5000,
    chipUnit: 25,
  });
  game.dealer = 1;
  startHand(game);
  game.players[0].hole = hintCards(hole);
  game.players[0].stack = stack;
  game.board = board ? hintCards(board) : [];
  game.street = game.board.length ? game.board.length - 2 : 0;
  game.currentBet = call;
  game.players[1].bet = call;
  game.players[1].total = call;
  game.players[1].stack = 5000 - call;
  return game;
}
