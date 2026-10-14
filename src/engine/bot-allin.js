import { bigBlindOf } from './stakes.js';
import { chipUnitOf } from './bet-sizing.js';

// Synthetic, public-line training ranges, not measured player tendencies or
// a solver. Waiting seats are a risk to price in, not confirmed showdown hands.
export function allInContext(view) {
  const { legal } = view;
  if (!legal?.callAmount || legal.canCheck) return null;
  const raises = view.history.filter((a) => a.street === view.street && a.action === 'raise');
  const latest = raises.at(-1);
  const aggressor = view.opponents?.find((p) => p.id === latest?.id);
  if (!aggressor) return null;
  const matched = Math.min(view.currentBet, view.bet + legal.callAmount);
  const aggressorAllIn = aggressor.allin,
    callerAllIn = legal.callAmount >= view.stack;
  // Leaving one chip or 20 BB behind must not make a huge re-raise magically
  // bypass the price test. Keep normal small-open/3-bet branches separate.
  const highCommitment =
    view.street === 0 &&
    raises.length >= 2 &&
    matched >= 20 * bigBlindOf(view) &&
    legal.callAmount >= view.stack * 0.35;
  if (!aggressorAllIn && !callerAllIn && !highCommitment) return null;
  const committed = view.opponents.filter(
    (p) => p.allin || p.id === aggressor.id || p.bet >= matched,
  );
  const waiting = view.opponents.filter((p) => !committed.includes(p));
  const ownTotal = view.total ?? view.bet;
  const actorCap = ownTotal + legal.callAmount;
  const depthBB = Math.min(actorCap, aggressor.total ?? aggressor.bet) / bigBlindOf(view);
  const line =
    view.street > 0
      ? 'postflop-shove'
      : raises.length >= 3
        ? 'multi-raise-shove'
        : raises.length === 2
          ? 'reraise-shove'
          : 'cold-shove';
  const priorRaisers = new Set(raises.slice(0, -1).map((a) => a.id));
  const pendingBuffer = Math.min(
    0.045,
    waiting.reduce((sum, p) => sum + (priorRaisers.has(p.id) ? 0.018 : 0.006), 0),
  );
  return {
    aggressorId: aggressor.id,
    isAllIn: aggressorAllIn || callerAllIn,
    aggressorAllIn,
    callerAllIn,
    highCommitment,
    closing:
      view.opponents.every((p) => p.allin) ||
      (callerAllIn && !waiting.length) ||
      (view.street === 3 && !waiting.length),
    line,
    depthBB,
    committedIds: committed.map((p) => p.id),
    waitingIds: waiting.map((p) => p.id),
    pendingBuffer,
    ranges: committed.map((p) => {
      const index = view.history.findLastIndex(
        (a) => a.id === p.id && ['call', 'raise'].includes(a.action),
      );
      const action = view.history[index];
      const currentCaller = p.bet >= view.currentBet && action?.street === view.street;
      const lockedEarlier = p.allin && p.bet < view.currentBet;
      const street = lockedEarlier ? (action?.street ?? 0) : view.street;
      const priorRaises = view.history
        .slice(0, index + 1)
        .filter((a) => a.street === street && a.action === 'raise').length;
      const ownLine =
        street > 0
          ? 'postflop-shove'
          : priorRaises >= 3
            ? 'multi-raise-shove'
            : priorRaises === 2
              ? 'reraise-shove'
              : 'cold-shove';
      return {
        id: p.id,
        role:
          p.id === aggressor.id || (lockedEarlier && action?.action === 'raise')
            ? 'shover'
            : currentCaller || lockedEarlier
              ? 'caller'
              : 'entered',
        street,
        line: lockedEarlier ? ownLine : line,
        depthBB: Math.min(actorCap, p.total ?? p.bet) / bigBlindOf(view),
      };
    }),
  };
}

function preflopWeight(hole, range) {
  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a);
  const pair = high === low,
    suited = hole[0].suit === hole[1].suit;
  if (range.role === 'entered') {
    if ((pair && high >= 8) || (high >= 13 && low >= 10)) return 1;
    if (pair || (suited && high === 14) || (suited && high - low <= 2 && low >= 5)) return 0.4;
    return 0.08;
  }
  // A 10 BB shove has a different public meaning from a 100 BB cold shove;
  // a player who has already called the shove supplies a second strong range.
  if (range.depthBB <= 15) {
    if (pair && high >= 5) return 1;
    if (high === 14 && (low >= 10 || (suited && low >= 8))) return 1;
    if (high === 13 && (low === 12 || (suited && low >= 10))) return 0.8;
    if (pair || (high === 14 && suited) || (suited && high >= 10 && low >= 9)) return 0.35;
    return 0.01;
  }
  if (range.depthBB <= 30) {
    if ((pair && high >= 8) || (high === 14 && low >= 12)) return 1;
    if ((high === 14 && suited && low >= 10) || (suited && high === 13 && low === 12)) return 0.6;
    if ((pair && high >= 5) || (suited && high === 14)) return 0.1;
    return 0.003;
  }
  if (range.role === 'caller' || range.line === 'multi-raise-shove') {
    if (pair && high >= 13) return 1;
    if (pair && high === 12) return range.role === 'caller' ? 0.7 : 0.35;
    if (high === 14 && low === 13) return range.role === 'caller' ? 0.8 : 0.55;
    if (pair && high === 11) return 0.08;
    if (suited && high === 14 && low === 12) return 0.05;
    return 0.001;
  }
  if (range.line === 'reraise-shove') {
    if ((pair && high >= 11) || (high === 14 && low === 13)) return 1;
    if ((pair && high === 10) || (suited && high === 14 && low === 12)) return 0.3;
    if (suited && high === 14 && low <= 5) return 0.035;
    return 0.002;
  }
  if ((pair && high >= 10) || (high === 14 && low >= 12)) return 1;
  if ((pair && high === 9) || (suited && high >= 13 && low >= 11)) return 0.3;
  if (suited && high === 14 && low <= 5) return 0.04;
  return 0.003;
}

function postflopWeight(hole, view, range, score, boardScore, compare, features) {
  const shared = boardScore && compare(score, boardScore) === 0;
  const top = Math.max(...view.board.map((c) => c.rank));
  const ownRanks = hole.map((c) => c.rank);
  const topPair = score[0] === 1 && score[1] === top && ownRanks.includes(top);
  const aggressor = view.opponents.find((p) => p.id === view.allIn?.aggressorId);
  const ratio =
    (aggressor?.bet ?? view.currentBet) /
    Math.max(bigBlindOf(view), view.pot - (aggressor?.bet ?? view.currentBet));
  const tight = range.role === 'caller' || ratio > 3;
  if (!shared && features.strongMade) return 1;
  if (features.overpair || topPair) return tight ? 0.25 : 0.8;
  if (features.draw) return view.street === 1 ? (tight ? 0.18 : 0.5) : 0.12;
  if (!shared && features.ownMade) return tight ? 0.035 : 0.15;
  // A small bluff component prevents treating a shove as proof of a monster.
  return tight ? 0.003 : 0.015;
}

// Evaluator/rule helpers are supplied by poker.js, avoiding a second evaluator
// or any dependency on the actual deck, other hole cards or final result.
export function estimateAllInEquity(
  view,
  context,
  { deck, evaluate, compare, trials, random, cache = new Map() },
) {
  const known = new Set([...view.hole, ...view.board].map((c) => c.key));
  const available = deck.filter((c) => !known.has(c.key));
  // Scores/features depend only on this public board and a candidate pair.
  // By default this estimate owns the cache. Candidate rollouts may share it
  // only within one sampled deal, never a live session or actual hidden deal.
  // Range roles and pressure still receive their own weights.
  const boards = cache;
  const handData = (hole, board) => {
    const boardKey = board.map((card) => card.key).join('|');
    let hands = boards.get(boardKey);
    if (!hands) boards.set(boardKey, (hands = new Map()));
    const holeKey = hole.map((card) => card.key).join('|');
    let data = hands.get(holeKey);
    if (!data) {
      data = { score: evaluate([...hole, ...board]).score };
      hands.set(holeKey, data);
    }
    return data;
  };
  const boardScore = view.board.length === 5 ? handData([], view.board).score : null;
  const ownRiverScore = boardScore ? handData(view.hole, view.board).score : null;
  let unbeatableRiver = !!ownRiverScore;
  const pools = context.ranges.map((range) => {
    const combos = [];
    const preflopRange = view.street === 0 || range.street === 0;
    const rangeView =
      range.street > 0 && range.street < view.street
        ? { ...view, street: range.street, board: view.board.slice(0, range.street + 2) }
        : view;
    for (let a = 0; a < available.length; a++)
      for (let b = a + 1; b < available.length; b++) {
        const hole = [available[a], available[b]];
        // Locked preflop weights need no made-hand score. On the river every
        // candidate still contributes to the exhaustive unbeatable check.
        const score =
          ownRiverScore || (!preflopRange && rangeView === view)
            ? handData(hole, view.board).score
            : null;
        if (ownRiverScore && compare(score, ownRiverScore) > 0) unbeatableRiver = false;
        let weight;
        if (preflopRange) weight = preflopWeight(hole, range);
        else {
          const data = handData(hole, rangeView.board);
          data.features ??= botBoardFeatures(hole, rangeView.board, data.score);
          weight = postflopWeight(
            hole,
            rangeView,
            range,
            data.score,
            rangeView === view ? boardScore : null,
            compare,
            data.features,
          );
        }
        combos.push({ hole, weight });
      }
    return { id: range.id, combos };
  });
  const committed = new Set(context.committedIds);
  const pots = (view.callPots || [{ amount: view.contestable, eligible: [view.id, ...committed] }])
    .filter((pot) => pot.eligible.includes(view.id))
    .map((pot) => ({
      ...pot,
      eligible: pot.eligible.filter((id) => id === view.id || committed.has(id)),
    }));
  const contestable = pots.reduce((sum, pot) => sum + pot.amount, 0);
  if (!contestable) return { equity: 0, unbeatableRiver: false, guaranteedReturn: 0 };
  // Include every already-eligible public seat in this worst-case tie amount,
  // including waiting seats in lower contribution layers. No sampled range
  // can override a river hand that no legal unknown combination can beat.
  const guaranteedReturn = unbeatableRiver
    ? (view.callPots || pots).reduce(
        (sum, pot) =>
          sum + Math.floor(pot.amount / pot.eligible.length / chipUnitOf(view)) * chipUnitOf(view),
        0,
      )
    : 0;
  let share = 0;
  for (let t = 0; t < trials; t++) {
    const used = new Set(known),
      hands = new Map();
    for (const pool of pools) {
      const combos = pool.combos.filter(({ hole }) => hole.every((c) => !used.has(c.key)));
      let target = random() * combos.reduce((sum, c) => sum + c.weight, 0);
      const picked = combos.find((c) => (target -= c.weight) < 0) || combos.at(-1);
      hands.set(pool.id, picked.hole);
      picked.hole.forEach((c) => used.add(c.key));
    }
    const runout = available.filter((c) => !used.has(c.key));
    const community = [...view.board];
    while (community.length < 5) {
      const index = Math.min(runout.length - 1, Math.floor(random() * runout.length));
      community.push(runout.splice(index, 1)[0]);
    }
    const own = handData(view.hole, community).score;
    const scores = new Map([...hands].map(([id, hole]) => [id, handData(hole, community).score]));
    for (const pot of pots) {
      let ties = 1,
        lost = false;
      for (const id of pot.eligible) {
        if (id === view.id) continue;
        const result = compare(scores.get(id), own);
        if (result > 0) {
          lost = true;
          break;
        }
        if (result === 0) ties++;
      }
      if (!lost) share += pot.amount / ties;
    }
  }
  return { equity: share / trials / contestable, unbeatableRiver, guaranteedReturn };
}
import { botBoardFeatures } from './bot-profiles.js';
