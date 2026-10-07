import { deckOfCards, evaluate, compare, rankText } from '../engine/poker.js';

export function startingTier(hole) {
  if (hole.length !== 2) return 0;
  const high = Math.max(...hole.map((c) => c.rank)),
    low = Math.min(...hole.map((c) => c.rank)),
    suited = hole[0].suit === hole[1].suit,
    gap = high - low;
  if ((high === low && high >= 11) || (high === 14 && low === 13)) return 3;
  if (
    (high === low && high >= 8) ||
    (high === 14 && low >= 10) ||
    (suited && high >= 12 && low >= 10)
  )
    return 2;
  if (
    high === low ||
    (suited && high === 14) ||
    (high >= 11 && low >= 10) ||
    (suited && gap <= 2 && low >= 5) ||
    (high === 14 && low >= 8)
  )
    return 1;
  return 0;
}
// Completion cards are not guaranteed winning outs. Public information only.
export function drawInfo(hole, board) {
  if (board.length < 3 || board.length >= 5)
    return { flush: false, straight: false, flushOuts: 0, straightOuts: 0, outs: 0, nextChance: 0 };
  const known = [...hole, ...board],
    keys = new Set(known.map((c) => c.key)),
    holeKeys = new Set(hole.map((c) => c.key)),
    made = evaluate(known),
    flush = new Set(),
    straight = new Set();
  for (const c of deckOfCards()) {
    if (keys.has(c.key)) continue;
    const next = evaluate([...known, c]);
    if (compare(next.score, made.score) <= 0 || !next.cards.some((card) => holeKeys.has(card.key)))
      continue;
    if (made.score[0] < 5 && [5, 8].includes(next.score[0])) flush.add(c.key);
    if (made.score[0] < 4 && [4, 8].includes(next.score[0])) straight.add(c.key);
  }
  const outs = new Set([...flush, ...straight]).size;
  return {
    flush: flush.size > 0,
    straight: straight.size > 0,
    flushOuts: flush.size,
    straightOuts: straight.size,
    outs,
    nextChance: outs / (52 - keys.size),
  };
}
export function boardTexture(board) {
  const suits = [0, 1, 2, 3].map((s) => board.filter((c) => c.suit === s).length),
    counts = new Map();
  board.forEach((c) => counts.set(c.rank, (counts.get(c.rank) || 0) + 1));
  const ranks = new Set(board.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const connected = Math.max(
    0,
    ...Array.from(
      { length: 10 },
      (_, i) => Array.from({ length: 5 }, (_, j) => i + j + 1).filter((r) => ranks.has(r)).length,
    ),
  );
  const maxSuit = Math.max(0, ...suits),
    paired = [...counts.values()].some((n) => n >= 2),
    trips = [...counts.values()].some((n) => n >= 3);
  const tags = [];
  if (paired) tags.push(trips ? '公共牌三条' : '公共牌有对子');
  if (maxSuit >= 4) tags.push('四张同花色');
  else if (maxSuit === 3) tags.push('三张同花色');
  else if (board.length === 3 && maxSuit === 2) tags.push('两张同花色');
  if (connected >= 4) tags.push('四张连通');
  else if (connected === 3) tags.push('顺子连接明显');
  return {
    paired,
    trips,
    maxSuit,
    connected,
    wet: maxSuit >= 3 || connected >= 3 || (board.length === 3 && maxSuit === 2),
    label: tags.join('、') || '花色分散、连接较少',
  };
}
export function decisionContext(s) {
  const made = evaluate([...s.hole, ...s.board]),
    texture = boardTexture(s.board),
    draw = drawInfo(s.hole, s.board),
    opponents = s.players.filter((p) => p.id !== 0 && !p.folded);
  const high = Math.max(0, ...s.board.map((c) => c.rank)),
    pocket = s.hole.length === 2 && s.hole[0].rank === s.hole[1].rank,
    holeRank = s.hole[0]?.rank;
  const playsBoard = s.board.length === 5 && compare(made.score, evaluate(s.board).score) === 0;
  let handClass = 'high',
    handLabel = made.label;
  if (s.street === 0) {
    handClass = pocket ? 'pocket' : 'unpaired';
    handLabel = pocket
      ? `口袋 ${rankText(holeRank)}`
      : `${s.hole.map((c) => rankText(c.rank)).join(' / ')} ${s.hole[0]?.suit === s.hole[1]?.suit ? '同花' : '不同花'}`;
  } else if (playsBoard) {
    handClass = 'board';
    handLabel = '公共牌成牌，底牌未提高牌力';
  } else if (made.score[0] >= 4) {
    handClass = 'strong';
    handLabel = made.label;
  } else if (pocket && made.score[0] === 3) {
    handClass = 'set';
    handLabel = `暗三条 ${rankText(holeRank)}`;
  } else if (made.score[0] === 3) {
    handClass = 'trips';
    handLabel = made.label;
  } else if (pocket && holeRank > high) {
    handClass = 'overpair';
    handLabel = `超对 ${rankText(holeRank)}${texture.paired ? '，公共牌带对子' : ''}`;
  } else if (made.score[0] === 2) {
    handClass = 'two-pair';
    handLabel = made.label;
  } else if (made.score[0] === 1) {
    if (pocket) {
      handClass = 'underpair';
      handLabel = `口袋 ${rankText(holeRank)}，公共牌有更高点数`;
    } else {
      const paired = s.hole.find((c) => s.board.some((b) => b.rank === c.rank)),
        kicker = s.hole.find((c) => c !== paired);
      handClass = !paired ? 'board-pair' : paired.rank === high ? 'top-pair' : 'middle-pair';
      handLabel = !paired
        ? `对子 ${rankText(made.score[1])} 来自公共牌，底牌提供踢脚`
        : `${handClass === 'top-pair' ? '顶对' : '非顶对'} ${rankText(made.score[1])}，${rankText(kicker?.rank || made.score[2])} 踢脚`;
    }
  }
  const actionOrder = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'],
    heroOrder = actionOrder.indexOf(s.position);
  const inPosition = opponents.every((p) => actionOrder.indexOf(p.position) < heroOrder),
    pendingOthers = s.pending.filter(
      (id) => id !== 0 && !s.players[id]?.folded && !s.players[id]?.allin,
    ).length;
  const effective = Math.min(s.stack, Math.max(0, ...opponents.map((p) => p.stack))),
    spr = s.pot ? effective / s.pot : 0,
    extra = s.action === 'raise' ? s.amount - s.bet : s.action === 'call' ? s.legal.callAmount : 0;
  const raises = s.history.filter((a) => a.action === 'raise'),
    preflopRaises = raises.filter((a) => a.street === 0),
    facingRaise = raises.filter((a) => a.street === s.street).at(-1),
    pastCallActions = s.history.filter(
      (a) => a.id === 0 && a.action === 'call' && a.street < s.street,
    ).length;
  const pastCalls = new Set(
    s.history
      .filter((a) => a.id === 0 && a.action === 'call' && a.street < s.street)
      .map((a) => a.street),
  ).size;
  const flushSuit =
      texture.maxSuit >= 3
        ? [0, 1, 2, 3].find((suit) => s.board.filter((c) => c.suit === suit).length >= 3)
        : null,
    nutFlushBlocker =
      flushSuit !== null && s.hole.some((c) => c.suit === flushSuit && c.rank === 14);
  const previousDraw = s.street === 3 ? drawInfo(s.hole, s.board.slice(0, 4)) : null;
  return {
    made,
    texture,
    draw,
    opponents: opponents.length,
    handClass,
    handLabel,
    inPosition,
    pendingOthers,
    effective,
    spr,
    extra,
    betRatio: s.pot ? extra / s.pot : 0,
    preflopRaises: preflopRaises.length,
    facingRaise,
    pastCalls,
    pastCallActions,
    nutFlushBlocker,
    missedDraw: !!previousDraw?.outs && made.score[0] < 4,
    tier: startingTier(s.hole),
  };
}
