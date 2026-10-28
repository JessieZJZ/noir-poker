import { newGame, startHand, act, advanceStreet, deckOfCards } from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// Reconstructed public ledger, not the user's unavailable saved deal. All
// setup actions are legal; only an engine before-action snapshot is returned.
// No other hole card, river card or result is an input to review assertions.
export function semanticDrawCall({
  opponentAllIn = true,
  heroAllIn = false,
  thirdLive = false,
  flopOnly = false,
} = {}) {
  const game = newGame(9, {
    smallBlind: 100,
    bigBlind: 200,
    startingStack: 20000,
    chipUnit: 100,
  });
  game.dealer = 3;
  game.emotionMode = 'off';
  game.players[0].stack = heroAllIn ? 17800 : 30000;
  game.players[5].stack = opponentAllIn ? (flopOnly ? 9300 : 17800) : 30000;
  startHand(game);
  const hole = cards('Ad 5d');
  const board = cards(flopOnly ? 'Ts 3c 2c' : 'Ts 3c 2c 2s');
  const known = new Set([...hole, ...board].map((card) => card.key));
  const rest = deckOfCards().filter((card) => !known.has(card.key));
  game.players[0].hole = hole;
  for (const player of game.players.slice(1)) player.hole = [rest.pop(), rest.pop()];
  const sequence = [rest.pop(), ...board.slice(0, 3)];
  if (!flopOnly) sequence.push(rest.pop(), board[3]);
  game.deck = [...rest, ...sequence.reverse()];
  const wealth = game.players.reduce((sum, player) => sum + player.stack + player.total, 0);
  if (
    new Set(
      [...game.deck, ...game.players.flatMap((player) => player.hole)].map((card) => card.key),
    ).size !== 52
  )
    throw Error('Semantic review fixture must keep a complete unique deck');

  act(game, 7, 'raise', 900);
  act(game, 8, 'fold');
  act(game, 0, 'raise', 2200);
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  act(game, 3, 'fold');
  act(game, 4, thirdLive ? 'call' : 'fold');
  act(game, 5, 'raise', 5500);
  act(game, 6, 'fold');
  act(game, 7, 'fold');
  act(game, 0, 'call');
  if (thirdLive) act(game, 4, 'call');
  advanceStreet(game);
  act(game, 5, 'raise', 3800);
  act(game, 0, 'call');
  if (flopOnly) {
    if (wealth !== game.players.reduce((sum, player) => sum + player.stack + player.total, 0))
      throw Error('Semantic review flop setup must conserve chips');
    return game.decisions.at(-1);
  }
  if (thirdLive) act(game, 4, 'call');
  advanceStreet(game);
  act(game, 5, 'raise', 8500);
  act(game, 0, 'call');
  if (wealth !== game.players.reduce((sum, player) => sum + player.stack + player.total, 0))
    throw Error('Semantic review setup must conserve chips');
  return game.decisions.at(-1);
}

export function summaryText(review) {
  const paragraphs = review.coaching?.paragraphs || review.paragraphs;
  const start = paragraphs.indexOf('复盘分析总结');
  return paragraphs.slice(start < 0 ? 0 : start + 1).join('');
}

// Count semantic sentences rather than occurrences of one implementation
// phrase. A single combined sentence can explain the closed state and its
// consequence; multiple independently worded versions are still repetition.
export function reviewSemanticTopics(text) {
  const sentences = text.match(/[^。！？]+[。！？]?/gu) || [];
  const closure = sentences.filter(
    (sentence) =>
      /(?:已没有|没有|不再有|无需再|不再参与|只(?:能|有))[^。]{0,24}(?:后续下注|后街下注|下注决策|付出筹码|支付筹码|继续下注|继续诈唬)/u.test(
        sentence,
      ) ||
      /没有后手[^。]*|没有[^。]*继续诈唬[^。]*空间/u.test(sentence) ||
      /跟注后直接比较最终摊牌机会/u.test(sentence),
  );
  const laterCost = sentences.filter((sentence) =>
    /下一街|后续下注|后续新增下注成本|再遭下注|再遇[^。]*下注/u.test(sentence),
  );
  const futureDecision = sentences.filter((sentence) =>
    /河牌若再面对下注[^。]*仍需另作决定|下一街再被下注仍要另算成本|后续新增下注成本另算|下一张没改善[^。]*再遇[^。]*重新比较/u.test(
      sentence,
    ),
  );
  const chanceCaution = sentences.filter((sentence) =>
    /(?:不等于|不保证|未必)[^。]*(?:获胜|获胜机会|领先|必胜)|(?:补中|补成)[^。]*(?:输给|落后)/u.test(
      sentence,
    ),
  );
  return { sentences, closure, laterCost, futureDecision, chanceCaution };
}
