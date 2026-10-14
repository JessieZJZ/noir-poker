import { chipUnitOf, fractionRaiseTo, legalRaiseTo } from './bet-sizing.js';
import { bigBlindOf } from './stakes.js';

// Synthetic training controls. Eligibility follows the existing base style,
// never a claim that a named player used 7-2 or donked at these frequencies.
export function deceptionPolicy(profile, difficulty) {
  const [width, attack, bluff, , trap] = profile.axes.map((n) => n / 100);
  const baseline = profile.id === 'balanced';
  const scale = difficulty === 'hard' ? 1.8 : difficulty === 'normal' ? 1 : 0;
  return {
    trap: Math.min(0.95, (baseline || trap >= 0.5 ? trap * 0.52 + 0.04 : 0) * scale),
    dirty: (baseline || (width >= 0.8 && bluff >= 0.7) ? 0.015 + bluff * 0.04 : 0) * scale,
    donk: (baseline || (attack >= 0.8 && bluff >= 0.58) ? 0.04 + attack * 0.08 : 0) * scale,
    sevenTwo: (baseline || (width >= 0.8 && bluff >= 0.8) ? 0.008 + bluff * 0.012 : 0) * scale,
  };
}

export function isDonkLead(view) {
  const priorRaise = view.history
    .filter((a) => a.street === view.street - 1 && a.action === 'raise')
    .at(-1);
  const priorAggressor = (view.opponents || []).find((p) => p.id === priorRaise?.id);
  // Checks by other seats do not replace the prior aggressor. A folded or
  // all-in aggressor cannot be induced to act by a lead this street.
  return (
    view.street > 0 &&
    view.street < 3 &&
    !view.inPosition &&
    view.legal.canCheck &&
    !!priorRaise &&
    priorRaise.id !== view.id &&
    !!priorAggressor &&
    !priorAggressor.allin &&
    priorAggressor.stack > 0 &&
    !view.history.some(
      (a) =>
        a.street === view.street &&
        (a.id === priorRaise.id || a.id === view.id || a.action === 'raise'),
    )
  );
}

// Only actor cards and before-action public information enter this selector.
// It returns an executable action, not an intention later mistaken for one.
export function deceptiveAction(view, profile, roll) {
  const policy = deceptionPolicy(profile, view.difficulty);
  if (!Object.values(policy).some(Boolean)) return null;
  const { legal, features: f } = view;
  const bigBlind = bigBlindOf(view);
  const opponents = view.opponents || [];
  if (!opponents.length || opponents.some((p) => p.allin)) return null;
  const effective = Math.min(view.stack, Math.max(...opponents.map((p) => p.stack)));
  const ranks = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const pair = ranks[0] === ranks[1];
  const sevenTwo = ranks[0] === 7 && ranks[1] === 2;
  const raises = view.history.filter((a) => a.street === view.street && a.action === 'raise');
  const lastRaise = raises.at(-1);
  const priorRaise = view.history
    .filter((a) => a.street === view.street - 1 && a.action === 'raise')
    .at(-1);
  const liveIds = new Set(opponents.map((p) => p.id));
  const strongMade =
    !view.playsBoard && (!!f.strongMade || (f.overpair && ranks[0] >= 12 && view.equity >= 0.72));
  const price = legal.callAmount / Math.max(1, view.contestable);
  const safeCall = legal.callAmount < effective * 0.08 && legal.callAmount < view.stack;
  // Another deep seat does not make the actual opener deep enough to trap.
  const facingEffective = lastRaise
    ? Math.min(
        view.stack - legal.callAmount,
        opponents.find((p) => p.id === lastRaise.id)?.stack ?? 0,
      )
    : 0;
  const headsUp = view.rivals === 1;
  const behindCount = view.actionContext?.unactedBehindCount,
    responseCount = view.actionContext?.pendingResponseCount,
    lateRiskAcceptable = behindCount == null ? view.rivals <= 3 : behindCount <= 3,
    trapRiskAcceptable = responseCount == null ? view.rivals <= 2 : responseCount <= 2;
  const conditions = { effective, priorAggressor: priorRaise?.id ?? null };
  const select = (reason, threshold, action, kind, sizing = null, extra = {}) => {
    if (!threshold || roll(reason, threshold) >= threshold) return null;
    return {
      action,
      ...(sizing ? { amount: sizing.actual } : {}),
      reason,
      kind,
      sizing,
      deception: { strategy: reason, threshold, ...conditions, ...extra },
    };
  };
  // Flat a small single open with KK/AA, or keep genuine strong made hands
  // concealed on safe boards. Shallow stacks and wet boards need protection.
  const preflopTrap =
    view.street === 0 &&
    pair &&
    ranks[0] >= 13 &&
    legal.canRaise &&
    legal.toCall > 0 &&
    raises.length === 1 &&
    lastRaise.id !== view.id &&
    liveIds.has(lastRaise.id) &&
    trapRiskAcceptable &&
    view.currentBet <= 4 * bigBlind &&
    safeCall &&
    facingEffective >= legal.callAmount * 15;
  const riverCanInduce =
    view.street < 3 ||
    (!view.inPosition &&
      opponents.every((p) => !view.history.some((a) => a.street === view.street && a.id === p.id)));
  const postflopTrap =
    view.street > 0 &&
    view.street <= 3 &&
    headsUp &&
    strongMade &&
    !f.wet &&
    effective >= view.pot * 2 &&
    // A last-to-act river check cannot induce a later bet. A forced call is
    // not a deliberate decision to conceal value instead of raising.
    ((legal.canCheck && riverCanInduce) ||
      (legal.canRaise && view.street < 3 && raises.length === 1 && safeCall && price <= 0.25));
  if (preflopTrap || postflopTrap) {
    const selected = select(
      'strong-trap',
      policy.trap,
      legal.canCheck ? 'check' : 'call',
      'value',
      null,
      { stage: preflopTrap ? 'preflop' : 'postflop', response: legal.canCheck ? 'check' : 'call' },
    );
    if (selected) return selected;
  }
  if (!legal.canRaise || effective < 20 * bigBlind) return null;
  const proposal = (fraction, opening = false) => {
    const desired = opening
      ? 2.5 * bigBlind
      : fractionRaiseTo(
          {
            currentBet: view.currentBet,
            pot: view.pot,
            callAmount: legal.callAmount,
            chipUnit: chipUnitOf(legal),
          },
          fraction,
        );
    const actual = legalRaiseTo(desired, legal);
    // The engine owns legality; these checks only bound discretionary risk.
    if (actual === legal.maxRaiseTo || actual - view.bet > effective * 0.15) return null;
    return {
      fraction,
      desired,
      actual,
      minimum: legal.minRaiseTo,
      maximum: legal.maxRaiseTo,
      opening,
      executed: true,
    };
  };
  const unraisedLate =
    view.street === 0 &&
    !raises.length &&
    view.currentBet <= bigBlind &&
    legal.toCall <= bigBlind &&
    ['BTN', 'CO'].includes(view.position) &&
    lateRiskAcceptable &&
    !view.history.some((a) => a.street === 0 && a.action === 'call' && a.amount > 0);
  const checkedTo =
    headsUp &&
    view.inPosition &&
    legal.canCheck &&
    !raises.length &&
    opponents.every((p) =>
      view.history.some((a) => a.id === p.id && a.street === view.street && a.action === 'check'),
    );
  const sevenTwoProbe =
    sevenTwo &&
    view.street > 0 &&
    checkedTo &&
    f.madeCategory === 0 &&
    !f.draw &&
    !f.wet &&
    !view.playsBoard;
  if (sevenTwo && (unraisedLate || sevenTwoProbe)) {
    const sizing = proposal(0.4, unraisedLate);
    if (sizing) {
      const selected = select('seven-two-bluff', policy.sevenTwo, 'raise', 'bluff', sizing, {
        stage: unraisedLate ? 'opening' : 'probe',
        noBounty: true,
      });
      if (selected) return selected;
    }
  }
  const trash =
    !pair &&
    !sevenTwo &&
    ranks[1] <= 5 &&
    ranks[0] - ranks[1] >= 5 &&
    !(ranks[0] === 14 && view.hole[0].suit === view.hole[1].suit);
  const singleSmallOpen =
    view.street === 0 &&
    raises.length === 1 &&
    lastRaise.id !== view.id &&
    liveIds.has(lastRaise.id) &&
    ['BTN', 'CO'].includes(view.position) &&
    lateRiskAcceptable &&
    view.currentBet <= 3 * bigBlind &&
    safeCall &&
    ranks[0] >= 13 &&
    !view.history.some((a) => a.street === 0 && a.action === 'call' && a.amount > 0);
  if (trash && (unraisedLate || singleSmallOpen)) {
    const sizing = proposal(0.8, unraisedLate);
    if (sizing) {
      const selected = select(
        unraisedLate ? 'dirty-open' : 'dirty-reraise',
        policy.dirty,
        'raise',
        'bluff',
        sizing,
        { blocker: singleSmallOpen ? ranks[0] : null },
      );
      if (selected) return selected;
    }
  }
  // A donk leads BEFORE the prior aggressor acts, rather than c-betting,
  // probing after a check, or check-raising. Require real value or a big draw.
  const bigDraw = f.flushDraw || (f.straightOuts || 0) >= 8;
  const donk = headsUp && isDonkLead(view) && (strongMade || (bigDraw && f.wet));
  if (donk) {
    const sizing = proposal(strongMade ? 0.55 : 0.45);
    if (sizing)
      return select(
        'donk-lead',
        policy.donk,
        'raise',
        strongMade ? 'value' : 'semi-bluff',
        sizing,
        { kind: strongMade ? 'value' : 'semi-bluff' },
      );
  }
  return null;
}
