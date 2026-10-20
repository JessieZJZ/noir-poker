import { rankText } from '../engine/poker.js';

export function heavyPreflopPressure(s, c) {
  return (
    !s.street &&
    c.preflopRaises >= 3 &&
    !(s.hole[0].rank === s.hole[1].rank && s.hole[0].rank >= 13)
  );
}

// Explain only cards available at the action. The engine owns hand ranking.
export function strengthParts(s, c) {
  if (!s.street) return [c.handLabel];
  if (c.made.score[0] === 2) {
    const counts = new Map();
    for (const card of s.board) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
    const sharedPair = [...counts].filter(([, count]) => count === 2);
    const ownPair = s.hole.find(
      (card) => counts.get(card.rank) === 1 && c.made.score.slice(1, 3).includes(card.rank),
    );
    if (sharedPair.length === 2 && c.made.score.slice(1, 3).every((rank) => counts.get(rank) >= 2))
      return [`两对来自公共牌，${rankText(c.made.score[3])} 踢脚`];
    if (sharedPair.length === 1 && ownPair) {
      const rank = rankText(ownPair.rank),
        shared = rankText(sharedPair[0][0]),
        kicker = rankText(c.made.score[3]);
      return [
        ownPair.rank === Math.max(...s.board.map((card) => card.rank))
          ? `底牌击中顶对 ${rank}`
          : `底牌击中一对 ${rank}`,
        `与公共牌的一对 ${shared} 共同组成两对`,
        `${kicker} 作为踢脚`,
      ];
    }
    if (
      sharedPair.length === 1 &&
      s.hole[0].rank === s.hole[1].rank &&
      c.made.score.slice(1, 3).includes(s.hole[0].rank)
    )
      return [
        `口袋对子 ${rankText(s.hole[0].rank)}`,
        `与公共牌的一对 ${rankText(sharedPair[0][0])} 共同组成两对`,
        `${rankText(c.made.score[3])} 作为踢脚`,
      ];
  }
  return [c.handLabel];
}

export function boardParts(s, c) {
  return s.street ? [c.texture.wet ? '湿润面' : '干燥面', c.texture.label] : ['公共牌尚未发出'];
}

export function exhaustsStack(s) {
  return (
    s.stack > 0 &&
    ((s.action === 'call' && s.legal.callAmount >= s.stack) ||
      (s.action === 'raise' && s.amount - s.bet >= s.stack))
  );
}
