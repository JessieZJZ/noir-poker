// Author-controlled training heuristics, never measured frequencies of a person.
// These helpers accept only the acting player's public perspective.
export function resolveBotStyle(profile) {
  return {
    entry: 1,
    reraise: 1,
    shortTable: 1,
    blockerBluffs: false,
    barrel: 1,
    riverBluff: 1,
    riverProbe: 1,
    riverValue: 1,
    adapt: 0,
    smallCbet: 0,
    potControl: 0,
    thinValue: 0,
    float: 0,
    delayed: 1,
    opening: null,
    streetSizing: null,
    flopCbet: null,
    turnSemiBluff: null,
    ...profile.policy,
  };
}

export function botStyleContext(view, style) {
  const high = Math.max(...view.hole.map((c) => c.rank));
  const low = Math.min(...view.hole.map((c) => c.rank));
  const suited = view.hole[0].suit === view.hole[1].suit;
  const suits = [0, 1, 2, 3].map((s) => view.board.filter((c) => c.suit === s).length);
  const flushSuit = suits.findIndex((n) => n >= 3);
  const flushBlocker =
    flushSuit >= 0 && view.hole.some((c) => c.suit === flushSuit && c.rank === 14);
  const highBlocker = flushSuit < 0 && high >= 13;
  const preflopBlocker = suited && high === 14 && low <= 5;
  const ownRaises = view.history.filter((a) => a.id === view.id && a.action === 'raise');
  const lastRaise = view.history.filter((a) => a.action === 'raise').at(-1);
  const initiative = lastRaise?.id === view.id;
  const liveIds = new Set((view.opponents || []).map((p) => p.id));
  const publicActions = view.history.filter((a) => liveIds.has(a.id) && a.street > 0);
  const bets = publicActions.filter((a) => a.action === 'raise').length;
  // At most 2.5 percentage points, only after three visible actions this hand.
  // It is an aggression proxy, not proof that an opponent is bluffing.
  const publicAdjustment =
    publicActions.length >= 3
      ? Math.max(-0.025, Math.min(0.025, (bets / publicActions.length - 0.35) * 0.08)) * style.adapt
      : 0;
  const earlierFloat = view.history.some(
    (a) => a.id === view.id && a.street === 1 && a.action === 'call',
  );
  const checkedTo =
    view.street > 0 &&
    view.history.some(
      (a) => liveIds.has(a.id) && a.street === view.street && a.action === 'check',
    ) &&
    !view.history.some((a) => a.street === view.street && a.action === 'raise');
  const delayed =
    style.float > 0 && view.street === 2 && earlierFloat && checkedTo && view.inPosition;
  return {
    initiative,
    ownRaises: ownRaises.length,
    flushBlocker,
    highBlocker,
    preflopBlocker,
    riverBlocker: flushBlocker || highBlocker,
    highDryFlop:
      view.street === 1 && !view.features.wet && Math.max(...view.board.map((c) => c.rank)) >= 12,
    floatCandidate:
      style.float > 0 &&
      view.street === 1 &&
      view.rivals === 1 &&
      view.inPosition &&
      !view.features.wet &&
      high >= 11 &&
      view.equity >= 0.15 &&
      view.equity <= 0.4 &&
      !view.features.draw &&
      view.legal.callAmount > 0 &&
      view.legal.callAmount <= view.pot * 0.25 &&
      view.legal.callAmount < view.stack &&
      view.legal.toCall / Math.max(1, view.stack + view.bet) <= 0.08 &&
      !(view.opponents || []).some((p) => p.allin),
    delayed,
    publicSamples: publicActions.length,
    publicAdjustment,
  };
}
