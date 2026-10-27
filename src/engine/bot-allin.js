import { chipUnitOf } from './bet-sizing.js';

export { allInContext } from './public-action-context.js';
import { preparePublicRanges, publicComboWeight } from './public-ranges.js';
import { exactStoryRiver } from './public-equity.js';

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
  // within one review snapshot (sampled boards per deal, visible boards across
  // its deals), never a live session or actual hidden deal.
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
  const descriptors = new Map(
    preparePublicRanges({ ...view, allIn: context }).map((range) => [range.id, range]),
  );
  const pools = context.ranges.map((range) => {
    const descriptor = descriptors.get(range.id);
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
        if (preflopRange) weight = publicComboWeight(hole, descriptor, { board: [] });
        else {
          const data = handData(hole, rangeView.board);
          data.features ??= botBoardFeatures(hole, rangeView.board, data.score);
          weight = publicComboWeight(hole, descriptor, {
            board: rangeView.board,
            score: data.score,
            features: data.features,
            boardScore: rangeView === view ? boardScore : null,
            compare,
            handData: (pair, board) => {
              const data = handData(pair, board);
              data.features ??= botBoardFeatures(pair, board, data.score);
              return data;
            },
          });
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
  const exact =
    pools.length === 1
      ? exactStoryRiver(view, descriptors.get(pools[0].id), pots, {
          deck,
          evaluate,
          features: botBoardFeatures,
          compare,
          cache,
        })
      : null;
  if (exact) return { ...exact, unbeatableRiver, guaranteedReturn };
  let share = 0,
    wins = 0,
    tiesAtShowdown = 0;
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
    const overall = [...scores.values()].map((score) => compare(own, score));
    if (overall.every((result) => result > 0)) wins++;
    else if (overall.every((result) => result >= 0)) tiesAtShowdown++;
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
  return {
    equity: share / trials / contestable,
    unbeatableRiver,
    guaranteedReturn,
    winProbability: wins / trials,
    tieProbability: tiesAtShowdown / trials,
    lossProbability: 1 - (wins + tiesAtShowdown) / trials,
  };
}
import { botBoardFeatures } from './bot-profiles.js';
