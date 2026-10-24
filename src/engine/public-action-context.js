import { bigBlindOf } from './stakes.js';

// Public rule state only. A player who already acted may still owe a response
// after a raise; that is different from a seat taking its first action behind us.
export function publicActionContext(state, actorId = state.id ?? state.actor ?? 0) {
  const players = state.players || [],
    count = players.length,
    dealer = state.dealer ?? players.find((p) => p.position === 'BTN')?.id ?? 0,
    canAct = (p) => p && !p.folded && !p.allin && p.stack > 0,
    byId = new Map(players.map((p) => [p.id, p])),
    pending = new Set(state.pending || []),
    actedIds = new Set(
      (state.history || []).filter((a) => a.street === state.street).map((a) => a.id),
    ),
    hasActed = (id) =>
      byId.get(id).actedTo === undefined ? actedIds.has(id) : byId.get(id).actedTo !== null,
    // Eliminated seats leave the ring. It starts left of the button, so the
    // first preflop actor follows the big blind (the button when heads-up).
    ring = Array.from({ length: count }, (_, i) => (dealer + 1 + i) % count).filter(
      (id) => !byId.get(id)?.out,
    ),
    first = state.street === 0 ? (ring.length === 2 ? 1 : 2) % ring.length : 0,
    roundOrderIds = [...ring.slice(first), ...ring.slice(0, first)].filter((id) =>
      canAct(byId.get(id)),
    ),
    actorIndex = roundOrderIds.indexOf(actorId),
    pendingResponseIds = Array.from(
      { length: count - 1 },
      (_, i) => (actorId + 1 + i) % count,
    ).filter((id) => pending.has(id) && canAct(byId.get(id))),
    unactedBehindIds = roundOrderIds
      .slice(actorIndex < 0 ? roundOrderIds.length : actorIndex + 1)
      .filter((id) => pending.has(id) && !hasActed(id)),
    priorActedResponseIds = pendingResponseIds.filter(hasActed),
    liveShowdownIds = players.filter((p) => p.id !== actorId && !p.folded).map((p) => p.id);
  const entered = new Set(
    (state.history || [])
      .filter(
        (a) =>
          a.street <= state.street &&
          (a.action === 'raise' || (a.action === 'call' && a.amount > 0)),
      )
      .map((a) => a.id),
  );
  const enteredIds = liveShowdownIds.filter((id) => state.street > 0 || entered.has(id));
  return {
    roundOrderIds,
    pendingResponseIds,
    unactedBehindIds,
    priorActedResponseIds,
    liveShowdownIds,
    enteredIds,
    pendingResponseCount: pendingResponseIds.length,
    unactedBehindCount: unactedBehindIds.length,
    priorActedResponseCount: priorActedResponseIds.length,
  };
}

export function publicResponseRisk(view) {
  const ids = view.actionContext?.pendingResponseIds;
  if (!ids) return 0;
  const raisers = new Set(
    (view.history || [])
      .filter((a) => a.street === view.street && a.action === 'raise')
      .map((a) => a.id),
  );
  return Math.min(
    0.045,
    ids.reduce((sum, id) => sum + (raisers.has(id) ? 0.018 : 0.006), 0),
  );
}

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
    raises.length >= 1 &&
    matched >= 20 * bigBlindOf(view) &&
    legal.callAmount >= view.stack * 0.35;
  if (!aggressorAllIn && !callerAllIn && !highCommitment) return null;
  const committed = view.opponents.filter(
    (p) => p.allin || p.id === aggressor.id || p.bet >= matched,
  );
  const responseIds = view.actionContext?.pendingResponseIds;
  const waiting = view.opponents.filter(
    (p) => !committed.includes(p) && (!responseIds || responseIds.includes(p.id)),
  );
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
        position: p.position ?? null,
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
