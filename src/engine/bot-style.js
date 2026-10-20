import { boardTexture } from './hand-features.js';

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
    openingBB: null,
    streetSizing: null,
    flopCbet: null,
    turnSemiBluff: null,
    semiBluff: null,
    delayedProbe: 0,
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

// An equity estimate above the first-bet threshold does not mean a weak pair
// can keep value re-raising a much stronger public line. Calls are priced by
// the existing selector; this helper only limits discretionary value raises.
export function valueRaiseSupported(view, equity) {
  if (view.street === 0 || view.legal.canCheck) return true;
  const f = view.features;
  const raises = view.history.filter((a) => a.street === view.street && a.action === 'raise');
  const texture = boardTexture(view.board);
  if (f.strongMade) {
    if (texture.maxSuit >= 3 && f.madeCategory < 5) return false;
    if (texture.maxSuit >= 4 && f.madeCategory < 5) return false;
    if (texture.connected >= 4 && f.madeCategory < 4) return false;
    if (raises.length >= 2 && f.madeCategory < 3) return false;
    return equity >= (raises.length >= 2 ? 0.82 : 0.65);
  }
  const boardHigh = Math.max(...view.board.map((c) => c.rank));
  const topPair = view.hole.some((c) => c.rank === boardHigh);
  const kicker = Math.max(0, ...view.hole.filter((c) => c.rank !== boardHigh).map((c) => c.rank));
  const supportedPair = f.overpair || (f.ownPair && topPair && kicker >= 12);
  const pressure = view.legal.callAmount / Math.max(1, view.stack + view.bet);
  const originalStack = view.stack + (view.total || 0);
  return (
    supportedPair &&
    !f.wet &&
    view.rivals === 1 &&
    raises.length <= 1 &&
    equity >= 0.68 &&
    pressure <= 0.08 &&
    view.legal.minRaiseTo - view.bet <= originalStack * 0.2
  );
}

// Strong own hands can profitably seek value without winning a multiway
// showdown more than 62% of the time. Threatening boards retain the old gate.
export function safeStrongValue(view, equity) {
  const f = view.features,
    t = boardTexture(view.board);
  if (!view.legal.canCheck || view.street === 0 || view.playsBoard || !f.strongMade) return false;
  const protectedHand =
    (view.street === 3 && f.madeCategory >= 3 && equity >= 0.5) ||
    f.madeCategory >= 6 ||
    (f.madeCategory === 2 &&
      view.rivals <= 2 &&
      t.maxSuit <= 2 &&
      t.connected < 4 &&
      equity >= 0.55) ||
    (f.madeCategory === 5 && t.maxSuit < 4 && !t.paired) ||
    (f.madeCategory === 4 && t.maxSuit < 3 && t.connected < 4 && !t.paired) ||
    (f.madeCategory < 4 && t.maxSuit < 3 && t.connected < 3);
  return (
    protectedHand &&
    equity >= (view.rivals === 1 ? 0.6 : Math.max(0.45, 1 / (view.rivals + 1) + 0.17))
  );
}

export function expensiveWeakPair(view, equity) {
  if (
    view.street === 0 ||
    view.difficulty === 'easy' ||
    view.allIn ||
    view.legal.canCheck ||
    !view.features.ownPair ||
    view.features.draw ||
    view.features.strongMade
  )
    return false;
  const original = view.stack + (view.total || 0);
  const aggression = view.history.filter(
    (a) => a.id !== view.id && a.street > 0 && a.action === 'raise',
  );
  return view.legal.callAmount > original * 0.2 && aggression.length >= 2 && equity < 0.7;
}

// A checked-to good top pair can seek modest value in a dry multiway pot.
// This never creates a raise over a bet or reads another player's cards.
export function checkedToPairValue(view, equity) {
  const f = view.features,
    t = boardTexture(view.board);
  const high = Math.max(0, ...view.board.map((c) => c.rank));
  const top = view.hole.some((c) => c.rank === high);
  const kicker = Math.max(0, ...view.hole.filter((c) => c.rank !== high).map((c) => c.rank));
  return (
    view.street > 0 &&
    view.legal.canCheck &&
    view.inPosition &&
    !f.strongMade &&
    !t.trips &&
    t.maxSuit <= 2 &&
    t.connected < 4 &&
    (!f.wet || view.rivals <= 2 || (f.overpair && t.paired && view.rivals <= 3)) &&
    !view.playsBoard &&
    (f.overpair ||
      (f.ownMade &&
        top &&
        kicker >= 10 &&
        view.board.filter((c) => c.rank === high).length === 1)) &&
    view.history.some(
      (a) => a.street === view.street && a.id !== view.id && a.action === 'check',
    ) &&
    equity >= (view.rivals === 1 ? 0.52 : view.rivals === 2 ? 0.45 : f.wet ? 0.55 : 0.48)
  );
}

// A checked-through street supplies public evidence for a modest next-street
// value probe. Paired boards do not turn an overpair into mere board strength.
// Never raises over a bet, crosses a new flush/four-straight threat, or uses
// an unacted opponent as if that player had already checked.
export function checkedThroughPairValue(view, equity) {
  const f = view.features,
    t = boardTexture(view.board);
  if (
    view.street < 2 ||
    !view.legal.canCheck ||
    view.playsBoard ||
    f.strongMade ||
    view.rivals > 2 ||
    t.trips ||
    t.maxSuit >= 3 ||
    t.connected >= 4
  )
    return false;
  const high = Math.max(...view.board.map((c) => c.rank));
  const top =
    view.hole.some((c) => c.rank === high) &&
    view.board.filter((c) => c.rank === high).length === 1;
  const kicker = Math.max(0, ...view.hole.filter((c) => c.rank !== high).map((c) => c.rank));
  if (!(f.overpair || (f.ownMade && top && kicker >= 10))) return false;
  const prior = view.history.filter((a) => a.street === view.street - 1);
  return (
    !prior.some((a) => a.action === 'raise') &&
    prior.some((a) => a.id === view.id && a.action === 'check') &&
    (view.opponents || []).length > 0 &&
    view.opponents.every((p) => prior.some((a) => a.id === p.id && a.action === 'check')) &&
    equity >= (view.rivals === 1 ? 0.52 : 0.45)
  );
}

export function expensivePreflopDefense(view, equity) {
  if (view.street !== 0 || view.difficulty === 'easy' || view.allIn || view.legal.canCheck)
    return false;
  const [high, low] = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const premium = (high === low && high >= 12) || (high === 14 && low === 13);
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  const odds = view.callPrice?.odds ?? view.legal.callAmount / Math.max(1, view.contestable);
  return (
    !premium &&
    raises.length >= 2 &&
    view.currentBet > 15 * view.bigBlind &&
    view.legal.callAmount > (view.stack + (view.total || 0)) * 0.15 &&
    equity < odds + 0.2
  );
}

export function valueBetCap(view) {
  const f = view.features,
    t = boardTexture(view.board);
  if (!f.strongMade) return 0.5;
  if (f.madeCategory === 2 && t.connected === 3) return 0.5;
  if ((t.maxSuit >= 3 && f.madeCategory < 5) || (t.connected >= 4 && f.madeCategory < 4))
    return 0.5;
  if (t.maxSuit >= 4 && f.madeCategory === 5) {
    const suit = [0, 1, 2, 3].find((s) => view.board.filter((c) => c.suit === s).length >= 4);
    if (!view.hole.some((c) => c.suit === suit && c.rank >= 12)) return 0.5;
  }
  return Infinity;
}
