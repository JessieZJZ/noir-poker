import { compare, deckOfCards, evaluate, rankText } from '../engine/poker.js';

// Card facts and before-action order only. No rival private cards or runout.
export function checkRisks(s, c) {
  const clauses = [];
  const score = c.made.score[0];
  if (!s.street || c.handClass === 'board') return clauses;
  if (c.texture.maxSuit >= 3 && score < 5)
    clauses.push(
      c.texture.maxSuit === 3
        ? '公共牌已有三张同花色，对手若持两张该花色的底牌，就能组成同花，领先当前成牌。'
        : '公共牌已有至少四张同花色，对手只需一张该花色的底牌，就能组成同花，领先当前成牌。',
    );
  if (c.texture.maxSuit >= 3 && score === 5) {
    const known = new Set([...s.hole, ...s.board].map((card) => card.key));
    const suit = [0, 1, 2, 3].find(
      (value) => s.board.filter((card) => card.suit === value).length >= 3,
    );
    const possible = deckOfCards()
      .filter((card) => card.suit === suit && !known.has(card.key))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2);
    if (compare(evaluate([...s.board, ...possible]).score, c.made.score) > 0)
      clauses.push('虽然已经成同花，对手仍可能用更高的同花领先，不能只看成花就把筹码全部投入。');
  }
  if (score < 4 && c.texture.connected >= 3) {
    const ranks = new Set(s.board.map((card) => card.rank));
    if (ranks.has(14)) ranks.add(1);
    const candidates = Array.from({ length: 10 }, (_, i) =>
      Array.from({ length: 5 }, (_, j) => i + j + 1).filter((rank) => !ranks.has(rank)),
    ).filter((values) => values.length > 0 && values.length <= 2);
    const single = candidates.filter((values) => values.length === 1).flat();
    if (single.length) {
      const distinct = [...new Set(single)].map((rank) => rankText(rank === 1 ? 14 : rank));
      clauses.push(
        distinct.length === 1
          ? `对手底牌中有一张 ${distinct[0]}，就能在这张牌面上组成顺子，领先当前成牌。`
          : `对手只需持有 ${distinct.join(' / ')} 中任意一张，就能在这张牌面上组成顺子，领先当前成牌。`,
      );
    } else if (candidates.length)
      clauses.push(
        `公共牌的连接也让对手同时持有 ${rankText(candidates[0][0] === 1 ? 14 : candidates[0][0])} 和 ${rankText(candidates[0][1] === 1 ? 14 : candidates[0][1])} 时可以组成顺子，领先当前成牌。`,
      );
  }
  if (c.texture.paired && score >= 3 && score < 6) {
    const quadPossible = [...new Set(s.board.map((card) => card.rank))].some((rank) => {
      const publicCount = s.board.filter((card) => card.rank === rank).length;
      const privateCount = s.hole.filter((card) => card.rank === rank).length;
      const needed = 4 - publicCount;
      return needed >= 0 && needed <= 2 && 4 - publicCount - privateCount >= needed;
    });
    clauses.push(
      quadPossible
        ? '公共牌已配对，对手可能组成葫芦或四条，这些牌会领先当前成牌。'
        : '公共牌已配对，对手仍可能组成葫芦，领先当前成牌。本人底牌已排除该公共对子组成四条的可能。',
    );
  }
  return clauses;
}

export function madeRedrawReasoning(s, c) {
  if (!s.street || s.street >= 3 || c.made.score[0] !== 3 || c.handClass === 'board') return [];
  const known = new Set([...s.hole, ...s.board].map((card) => card.key));
  const categories = new Set(
    deckOfCards()
      .filter((card) => !known.has(card.key))
      .map((card) => evaluate([...s.hole, ...s.board, card]).score[0])
      .filter((category) => category === 6 || category === 7),
  );
  if (!categories.size) return [];
  return [
    categories.has(6) && categories.has(7)
      ? '后续公共牌再配对时，这手三条还有改善为葫芦或四条的机会。'
      : categories.has(6)
        ? '后续公共牌仍可能让这手三条改善为葫芦。'
        : '后续公共牌仍可能让这手三条改善为四条。',
  ];
}

export function checkReasoning(s, c, { trap = false, closingExplained = false } = {}) {
  if (!s.street || c.handClass === 'board') return [];
  const risks = checkRisks(s, c);
  const strong = c.made.score[0] >= 3;
  const parts = [...risks];
  if (c.draw.outs)
    parts.push(
      `目前仍有 ${c.draw.outs} 张牌可能补成${c.draw.flush && c.draw.straight ? '同花或顺子' : c.draw.flush ? '同花' : '顺子'}，但这些是成牌补牌，不保证补中后领先对手。`,
    );
  if (risks.length)
    parts.push(
      c.pendingOthers > 0
        ? '过牌先不主动做大底池，保留遇到下注后再判断的空间。'
        : '过牌避免主动扩大当前底池。',
    );
  else if (strong) parts.push('这手强成牌仍有向较弱成牌收取跟注的空间，过牌可能少收一轮价值。');
  else if (c.made.score[0] === 0 && !c.draw.outs)
    parts.push('目前只有高牌，较难让更弱成牌付费，过牌避免用薄弱牌力主动做大底池。');
  else if (!c.draw.outs)
    parts.push('当前成牌保留了摊牌机会，过牌控制投入，也避免下注后只留下更强的继续范围。');
  if (risks.length) parts.push(...madeRedrawReasoning(s, c));
  if (s.street < 3 && (strong || c.handClass === 'top-pair'))
    parts.push('过牌的代价是对手也可能免费见到下一张，补成更强的牌。');
  if (c.pendingOthers > 0)
    parts.push(
      trap && !risks.length
        ? '后面还有玩家可以下注，过牌为诱导其弱牌或诈唬继续投入留下机会。'
        : '后面仍有玩家可以下注，过牌不保证本轮无需再付筹码。',
      '再遇下注时，要结合金额、人数和此前行动判断，不能只凭当前牌型自动跟注或弃牌。',
    );
  else if (!closingExplained)
    parts.push(
      s.street === 3
        ? '这是本轮最后行动，过牌后直接摊牌，已经不能诱导本轮下注。'
        : '这是本轮最后行动，过牌后免费见下一张，已经不能诱导本轮下注。',
    );
  return parts;
}
