import { compactChips } from '../engine/chip-format.js';
import { contestableAfterCall, evaluate, legalActions } from '../engine/poker.js';
import { handContext } from './context.js';
import { strengthParts } from './presentation.js';

// Cache card facts only. Prices and legal options must be read again for every
// action, even when the hole cards and board have not changed.
const cardFacts = new Map();
function currentHand(game) {
  const s = { hole: game.players[0].hole, board: game.board, street: game.street };
  const key = `${s.street}:${[...s.hole, ...s.board].map((c) => `${c.suit}-${c.rank}`).join('|')}`;
  if (!cardFacts.has(key)) {
    if (cardFacts.size >= 16) cardFacts.delete(cardFacts.keys().next().value);
    cardFacts.set(key, handContext(s));
  }
  return { s, c: cardFacts.get(key) };
}

function preflopCards(hole) {
  const [a, b] = hole;
  if (a.rank === b.rank) {
    if (a.rank === 14) return '你拿到 AA，是翻牌前最强的起手牌。';
    if (a.rank === 13) return '你拿到 KK，是翻牌前仅次于 AA 的起手牌。';
    if (a.rank >= 11) return '你拿到大口袋对子，通常领先未成对的高牌。';
    return '你拿到口袋对子，翻牌后有机会击中三条。';
  }
  if (a.suit === b.suit) {
    if (
      Math.abs(a.rank - b.rank) === 1 ||
      (Math.max(a.rank, b.rank) === 14 && Math.min(a.rank, b.rank) === 2)
    )
      return '你拿到同花连接牌，有机会在翻后形成顺子、同花听牌。';
    if (a.rank === 14 || b.rank === 14) return '你拿到同花 A，翻牌后有机会形成最大的同花听牌。';
    return '你拿到同花底牌，翻牌后有机会形成同花听牌。';
  }
  return a.rank >= 11 && b.rank >= 11
    ? '你拿到两张高牌，翻牌后有机会击中顶对。'
    : '是否入池，要一起看底牌、位置和前面玩家的行动。';
}

// Both clients use this public-information-only wording. No hidden holdings,
// remaining deck or estimated opponent range is needed for a live reminder.
export function tableHint(game, legal = legalActions(game, 0)) {
  const hero = game.players[0];
  if (game.phase === 'done') {
    if (hero.folded) return '本手已结束，回看你弃牌时要付出的筹码和对手此前的行动。';
    if (!game.showdown) return '对手都已弃牌，本手结束。复盘时看看此前的下注和跟注是否有依据。';
    const rank = evaluate([...hero.hole, ...game.board]);
    return `本手已摊牌，你的最佳牌型是${rank.label}。复盘时要看当时的信息，别只看最后输赢。`;
  }
  if (hero.hole.length !== 2) return '开始一手牌后，这里会提示当前牌力和行动成本。';
  if (hero.folded) return '你已经弃牌，等本手结束后再复盘这次决定。';
  if (hero.allin) return '你已全下，不用再行动，等待本手结算。';
  if (!legal.enabled) return '还没轮到你，先观察其他玩家的行动。';

  const { s, c } = currentHand(game);
  const parts = [
    !game.street
      ? preflopCards(hero.hole)
      : c.handClass === 'board'
        ? '你现在使用公共牌成牌，底牌没有提高牌力。'
        : `你目前的牌力是${strengthParts(s, c).join('，')}。`,
  ];
  if (c.draw.flush && c.draw.straight)
    parts.push('你同时有顺子和同花听牌，补到合适的牌还能提高牌力。');
  else if (c.draw.flush) {
    const nutDraw = hero.hole.some(
      (card) =>
        card.rank === 14 &&
        [...hero.hole, ...game.board].filter((other) => other.suit === card.suit).length === 4,
    );
    parts.push(
      nutDraw ? '你有同花听牌，补成后是最大的同花。' : '你有同花听牌，还差一张同花色的牌。',
    );
  } else if (c.draw.straight) parts.push('你有顺子听牌，还差一张合适点数的牌。');

  if (legal.toCall > 0) {
    const amount = compactChips(legal.callAmount),
      pot = contestableAfterCall(game, 0, legal.callAmount),
      contestable = compactChips(pot),
      percent = ((legal.callAmount / pot) * 100).toFixed(1);
    parts.push(
      legal.callAmount >= hero.stack
        ? `跟注需要全下 ${amount}，可争夺 ${contestable}，需要约 ${percent}% 的胜率才能持平。`
        : `跟注 ${amount} 后可争夺 ${contestable}，只算这次投入，需要约 ${percent}% 的胜率才能持平。`,
    );
  } else if (!legal.canRaise) parts.push('你现在可以过牌，不用再投入筹码。');
  else if (!game.street && hero.hole[0].rank === hero.hole[1].rank && hero.hole[0].rank >= 13)
    parts.push('你可以加注，争取让较弱的牌跟注。');
  else if (c.draw.outs) parts.push('你可以过牌保留听牌机会，若下注，要考虑对手是否可能弃牌。');
  else if (['strong', 'set', 'trips', 'two-pair', 'overpair', 'top-pair'].includes(c.handClass))
    parts.push('你可以过牌，也可以下注，争取让较弱的牌跟注。');
  else parts.push('你可以过牌，若下注，要先想清楚对手为什么会跟注或弃牌。');
  return parts.join(' ');
}
