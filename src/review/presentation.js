import { rankText, partitionPots } from '../engine/poker.js';

// Pressure can remove only players who still have chips. An existing side pot
// must come from the public contribution ledger, never from a proposed wager.
export function foldPressure(s, actorId = s.id ?? 0) {
  const players = s.players || [
      { id: actorId, total: s.total ?? s.bet ?? 0, folded: false },
      ...(s.opponents || []),
    ],
    opponents = players.filter((p) => p.id !== actorId && !p.folded),
    committed = opponents.filter((p) => p.allin),
    foldable = opponents.filter((p) => !p.allin && p.stack !== 0),
    committedIds = new Set(committed.map((p) => p.id)),
    foldableIds = new Set(foldable.map((p) => p.id)),
    pots = committed.length
      ? partitionPots({
          players: players.map((p) => ({
            id: p.id,
            total: p.total ?? p.bet ?? 0,
            folded: !!p.folded,
          })),
        }).pots
      : [];
  return {
    hasAllInOpponent: committed.length > 0,
    foldableCount: foldable.length,
    hasContestableSidePot: pots.some(
      (pot) =>
        pot.eligible.includes(actorId) &&
        pot.eligible.some((id) => foldableIds.has(id)) &&
        !pot.eligible.some((id) => committedIds.has(id)),
    ),
  };
}

export function foldWinNote(s, actorId = s.id ?? 0) {
  const pressure = foldPressure(s, actorId);
  if (!pressure.hasAllInOpponent) return '';
  if (!pressure.foldableCount) return '对手都已全下，已没有可施压弃牌的目标，底池仍需摊牌决定。';
  return pressure.hasContestableSidePot
    ? '若仍有筹码的对手都弃牌，可以争取已有的边池，已全下者参与的底池仍需摊牌。'
    : '这次只能争取让仍有筹码的对手退出，已全下者参与的底池仍需摊牌，不能靠其他玩家弃牌直接拿走整个底池。';
}

export function plannedValueShove(s, c) {
  return (
    ['value-shove', 'value-raise'].includes(c.valuePlan?.kind) &&
    c.valuePlan.primary?.action === 'raise' &&
    c.valuePlan.primary.amount === s.legal.maxRaiseTo
  );
}

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
