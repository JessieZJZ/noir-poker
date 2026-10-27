import { handFeatures } from './hand-features.js';

export const hasPublicStory = (line) =>
  Array.isArray(line) &&
  new Set(line.map((a) => a.street)).size >= 2 &&
  line.every(
    (a) =>
      a.street >= 1 && a.street <= 3 && Array.isArray(a.board) && a.board.length === a.street + 2,
  );

// Authored action-likelihood heuristics, not measured frequencies or a solver.
// A candidate hand is tested against each board as it was visible at that time.
export function publicPostflopLine(view, id, throughStreet = view.street) {
  const actions = (view.history || [])
    .filter(
      (a) =>
        a.street > 0 &&
        a.street <= view.street &&
        ['check', 'call', 'raise', 'fold'].includes(a.action),
    )
    .map((a) => ({ ...a, amount: Number.isFinite(a.amount) && a.amount > 0 ? a.amount : 0 }));
  const paid = new Map();
  let street = -1,
    current = 0,
    contributed = 0;
  const entries = actions.map((a) => {
    if (a.street !== street) {
      street = a.street;
      current = 0;
      paid.clear();
    }
    const before = paid.get(a.id) || 0;
    const extra =
      a.action === 'raise' ? Math.max(0, a.amount - before) : a.action === 'call' ? a.amount : 0;
    const event = { ...a, facing: Math.max(0, current - before), current, contributed };
    contributed += extra;
    paid.set(a.id, before + extra);
    if (a.action === 'raise') current = Math.max(current, a.amount);
    return event;
  });
  const openingPot = Math.max(view.bigBlind || 1, (view.pot || 0) - contributed);
  return entries.flatMap((a, index) => {
    if (a.id !== id || a.street > throughStreet || a.action === 'fold') return [];
    const previous = entries.slice(0, index).filter((b) => b.street === a.street);
    const checked = previous.filter((b) => b.id === id).at(-1)?.action === 'check';
    const closedCheck =
      a.action === 'check' &&
      a.street < view.street &&
      !entries.slice(index + 1).some((b) => b.street === a.street) &&
      !previous.some((b) => b.action === 'raise');
    const potBefore = openingPot + a.contributed;
    return [
      {
        street: a.street,
        action:
          a.action === 'raise'
            ? a.facing > 0
              ? checked
                ? 'check-raise'
                : 'raise'
              : 'bet'
            : a.action,
        amount: a.amount,
        facing: a.facing,
        ratio:
          a.action === 'raise'
            ? Math.max(0, a.amount - a.current) / Math.max(1, potBefore + a.facing)
            : a.amount / Math.max(1, potBefore),
        closedCheck,
        board: view.board.slice(0, a.street + 2).map((c) => ({ ...c })),
      },
    ];
  });
}

// Every factor is <= 1, preserving the preflop proposal bound used by the
// rejection sampler. Normalising candidate masses gives the inferred range.
export function publicStoryWeight(hole, line, handData) {
  let weight = 1,
    earlierDraw = false;
  for (const event of line) {
    const data = handData(hole, event.board);
    const f = data.features || handFeatures(hole, event.board, data.score);
    const top = Math.max(...event.board.map((c) => c.rank));
    const topPair = hole.some((c) => c.rank === top) && f.ownMade;
    const pair = topPair || f.overpair;
    const large = event.ratio >= 0.75;
    const raising = event.action === 'raise' || event.action === 'check-raise';
    let factor;
    if (event.action === 'check') {
      factor = f.strongMade ? (event.closedCheck ? 0.65 : 0.95) : pair ? 0.95 : 1;
    } else if (event.action === 'call') {
      factor = f.strongMade
        ? 0.9
        : pair
          ? large
            ? 0.55
            : 0.85
          : f.draw
            ? 0.75
            : f.ownMade
              ? large
                ? 0.2
                : 0.6
              : large
                ? 0.015
                : 0.12;
    } else if (f.strongMade) {
      factor = 0.95;
    } else if (pair) {
      factor = raising ? (large ? 0.3 : 0.45) : large ? 0.4 : 0.75;
    } else if (event.street === 3 && earlierDraw) {
      // A draw which failed to make a value hand is still a possible bluff.
      // Card removal by the defender naturally removes blocked draw combos.
      factor = raising ? 0.18 : f.ownMade ? 0.22 : 0.32;
    } else if (f.draw) {
      factor = (f.drawOuts || 0) >= 8 ? 0.65 : 0.3;
    } else if (f.ownMade) {
      factor = raising ? 0.06 : large ? 0.12 : 0.4;
    } else {
      factor = raising ? 0.015 : large ? 0.025 : 0.1;
    }
    weight *= factor;
    if (
      event.street < 3 &&
      f.draw &&
      ['bet', 'raise', 'check-raise', 'call'].includes(event.action)
    )
      earlierDraw = true;
  }
  return weight;
}
