import { compactChips } from '../engine/chip-format.js';
import { chipUnitOf } from '../engine/bet-sizing.js';

// The engine already partitioned eligible pots and refunds. Flooring each
// split gives a conservative bound, without duplicating odd-chip settlement.
export function guaranteedBoardShare(s, c, price) {
  if (
    s.street !== 3 ||
    c.handClass !== 'board' ||
    !c.matchups?.nut ||
    !price.closing ||
    c.pendingOthers ||
    s.action === 'raise'
  )
    return null;
  const unit = chipUnitOf(s);
  const minimum = price.pots.reduce(
    (sum, p) => sum + Math.floor(p.amount / (p.eligible.length * unit)) * unit,
    0,
  );
  return minimum >= price.cost
    ? { minimum, cost: price.cost, contestable: price.contestable }
    : null;
}
export function closedDrawChance(s, draw) {
  const unseen = 52 - s.hole.length - s.board.length;
  return s.street === 1
    ? 1 - ((unseen - draw.outs) * (unseen - draw.outs - 1)) / (unseen * (unseen - 1))
    : draw.nextChance;
}
export function guaranteedBoardCoaching(s, r) {
  const g = r.context.guaranteedBoard;
  if (!g) return null;
  const action = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  const kept = s.action === action.action;
  const facts = [
    '公共牌已是无法被超过的最大牌型，所有仍在局中的玩家只能组成同样的最佳五张。',
    `跟注后可争夺 ${compactChips(g.contestable)}，按有资格分池的人数和整筹码计算，至少可分回 ${compactChips(g.minimum)}，本次成本为 ${compactChips(g.cost)}。`,
    action.action === 'check'
      ? '可以免费过牌，保留确定的分池份额。'
      : '因此应保留跟注，不必再猜对手是价值下注还是诈唬。',
  ];
  const label = kept ? '值得保留' : action.action === 'check' ? '过牌' : '跟注';
  return {
    kind: kept ? 'keep' : 'improve',
    recommendedAction: action,
    label,
    paragraphs: [r.context.matchups.text, '复盘分析总结', facts.join('')],
    paragraphParts: [[r.context.matchups.text], ['复盘分析总结'], facts],
    explanation: facts.join(''),
    suggestedAction: action.action === 'check' ? '过牌' : '跟注',
    suggestion: label,
    followUp: '按有资格分池的份额和新增成本判断，不能把确定分池误当作独赢整个底池。',
    evKind: g.minimum > g.cost ? 'positive' : 'uncertain',
    evText: '确定可分回的筹码不少于本次跟注成本。',
    unchanged: kept,
    supported: kept,
    confirmed: !kept,
    modelImprovement: false,
    improvement: 0,
    score: kept ? 0 : 1e9,
    actualEV: [],
    proof: '公共牌无法被超过，跟注后的保守分回金额不低于新增成本。',
  };
}

export function riverRangeReason(s, c) {
  if (s.street !== 3 || c.handClass === 'board' || !c.made?.score || c.made.score[0] > 3) return '';
  const missed = c.matchups?.missedDraws || [],
    value = c.matchups?.behind || [];
  if (!missed.length || !value.length) return '';
  return `对手可能用 ${value
    .slice(0, 2)
    .map((hand) => hand.text)
    .join(
      '、',
    )} 取值，也可能用 ${missed.map((hand) => hand.text).join('、')} 等落空听牌诈唬；跟注需要后者或较弱取值的比例足够。`;
}
