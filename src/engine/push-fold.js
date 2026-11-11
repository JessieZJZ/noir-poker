// Short-stack push/fold widths and tournament pressure for the training
// opponents. These are authored approximations of standard push/fold
// charts, not a solver: the share of starting hands (by startingPercentile)
// worth moving all-in first-in, by seats still to act behind.
const PUSH_WIDTH_AT_10BB = [0.58, 0.58, 0.42, 0.32, 0.25, 0.21, 0.18, 0.16, 0.14];
// At or below this effective depth an opponent only moves all-in or folds preflop.
export const PUSH_FOLD_BB = 12;
// Above it, shoves are an occasional option up to this depth.
export const SHORT_SHOVE_BB = 20;

export function pushWidth(depthBB, behind) {
  const seats = Math.max(1, Math.min(8, Number.isFinite(behind) ? behind : 8));
  const width = PUSH_WIDTH_AT_10BB[seats] * Math.pow(10 / Math.max(1, depthBB), 0.75);
  return Math.max(0.04, Math.min(0.95, width));
}

// Chips each seated player started this hand with, from the public view.
function chipsOf(view, id) {
  return view.tournament?.stacks?.find((row) => row.id === id)?.chips;
}

// Near the final table, losing a big pot can end the game. Public stack
// sizes say who is most exposed: a covering stack can lean on shorter ones,
// a medium stack facing a covering stack behind should push tighter.
export function tournamentPressure(view) {
  const t = view.tournament;
  if (!t || !['bubble', 'final'].includes(t.stage)) return null;
  const own = chipsOf(view, view.id) ?? view.stack + (view.total ?? 0),
    others = t.stacks.filter((row) => row.id !== view.id);
  return {
    stage: t.stage,
    own,
    chipLeader: others.every((row) => row.chips < own),
    shorterSeats: others.filter((row) => row.chips < own).length,
    coveringSeats: others.filter((row) => row.chips >= own).length,
  };
}

export function pushPressureScale(view) {
  const pressure = tournamentPressure(view);
  if (!pressure) return 1;
  const behind = view.actionContext?.unactedBehindIds ?? [];
  const behindChips = behind.map((id) => chipsOf(view, id)).filter(Number.isFinite);
  if (behindChips.length && behindChips.every((chips) => chips < pressure.own)) return 1.3;
  if (pressure.shorterSeats && behindChips.some((chips) => chips >= pressure.own)) return 0.8;
  return 1;
}

// Extra equity a call needs when losing it could end the game before a
// better place it could still reach by waiting. A call that cannot bust the
// caller costs much less, since its stack still survives.
export function eliminationPremium(view, risked) {
  const pressure = tournamentPressure(view);
  if (!pressure) return 0;
  if (!risked) return 0.015;
  return (pressure.stage === 'bubble' ? 0.08 : 0.05) + (pressure.shorterSeats ? 0.03 : 0);
}
export function survivalPremium(view) {
  if (!view.allIn) return 0;
  return eliminationPremium(view, view.allIn.callerAllIn || view.legal.callAmount >= view.stack);
}
