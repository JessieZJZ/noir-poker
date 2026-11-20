import { bigBlindOf } from './stakes.js';
import { startingPercentile } from './starting-range.js';
import { preflopSeatsBehind } from './positions.js';
import { PUSH_FOLD_BB, SHORT_SHOVE_BB, pushWidth, pushPressureScale } from './push-fold.js';

function effectiveDepthBB(view) {
  const active = (view.opponents || []).filter((p) => p.stack > 0 || p.allin);
  const original = view.stack + (view.total ?? view.bet ?? 0);
  if (!active.length) return original / bigBlindOf(view);
  return (
    Math.min(original, Math.max(...active.map((p) => p.stack + (p.total ?? p.bet ?? 0)))) /
    bigBlindOf(view)
  );
}
const seatsBehind = (view) =>
  view.actionContext?.unactedBehindCount ?? preflopSeatsBehind(view.position, view.count) ?? 4;
// Style moves the push width a little; the depth and seats behind set it.
const styleScale = (profile) =>
  0.85 + (profile.axes[1] / 100) * 0.2 + (profile.axes[0] / 100) * 0.1;

// At 12 BB or less an opponent no longer opens small or flats a raise: it
// moves all-in or folds (checks in the big blind). A cheap big-blind call
// over a single open is left to the normal price check.
export function shortStackPlan(view, profile) {
  if (view.street !== 0 || view.allIn || !view.legal.canRaise) return null;
  if (view.opponents?.some((p) => p.allin)) return null;
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  if (raises.length > 1 || raises.some((a) => a.id === view.id)) return null;
  const depthBB = effectiveDepthBB(view);
  if (depthBB > PUSH_FOLD_BB) return null;
  const limpers = view.history.filter(
    (a) => a.street === 0 && a.action === 'call' && a.amount > 0 && a.id !== view.id,
  ).length;
  const behind = seatsBehind(view);
  let width = pushWidth(depthBB, behind) * styleScale(profile) * pushPressureScale(view);
  if (raises.length) width *= 0.45;
  else if (limpers) width *= 0.8;
  const percentile = startingPercentile(view.hole);
  const plan = { depthBB, behind, width, percentile, reshove: raises.length > 0 };
  if (percentile <= width)
    return {
      ...plan,
      action: 'raise',
      amount: view.legal.maxRaiseTo,
      reason: raises.length ? 'short-reshove' : 'short-push',
    };
  if (view.legal.canCheck) return { ...plan, action: 'check', reason: 'short-check' };
  const odds = view.legal.callAmount / Math.max(1, view.contestable);
  if (raises.length && odds <= 0.3 && view.legal.callAmount <= view.stack * 0.25) return null;
  return { ...plan, action: 'fold', reason: 'short-fold' };
}

// Deliberate value commitments for the training opponents. This is a bounded
// policy mix, not a solver chart. Only the actor's cards and public ledgers enter.
export function preflopJamPlan(view, profile) {
  if (view.street !== 0 || !view.legal.canRaise || view.opponents?.some((p) => p.allin))
    return null;
  const active = (view.opponents || []).filter((p) => p.stack > 0);
  if (!active.length) return null;
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  const ownRaise = raises.some((a) => a.id === view.id);
  const [high, low] = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const pair = high === low;
  const ak = high === 14 && low === 13;
  const original = view.stack + (view.total ?? view.bet ?? 0);
  const effective = Math.min(
    original,
    Math.max(...active.map((p) => p.stack + (p.total ?? p.bet ?? 0))),
  );
  const depthBB = effective / bigBlindOf(view);
  const late = ['BTN', 'CO', 'SB'].includes(view.position) || view.count <= 3;
  const headsUp = view.opponents.length === 1;
  const firstIn =
    !raises.length &&
    !view.history.some((a) => a.street === 0 && a.action === 'call' && a.amount > 0);
  let rate = 0,
    trigger = null;
  if (firstIn && depthBB <= SHORT_SHOVE_BB) {
    const strong = (pair && high >= 10) || ak;
    const lateValue =
      (late || seatsBehind(view) <= 3) &&
      startingPercentile(view.hole) <=
        pushWidth(depthBB, seatsBehind(view)) * 0.75 * pushPressureScale(view);
    if (strong || lateValue) {
      rate = strong ? 0.88 : 0.65;
      trigger = 'short-first-in';
    }
  } else if (firstIn && depthBB <= 100 && pair && high >= 13) {
    // Deep open shoves are a rare value mix, never the default opening size.
    rate = high === 14 ? 0.1 : 0.06;
    trigger = 'rare-deep-first-in';
  } else if (!ownRaise && raises.length === 1 && view.currentBet >= 20 * bigBlindOf(view)) {
    const topPair = pair && high >= 13 && depthBB <= 150;
    const strongHeadsUp = headsUp && depthBB <= 100 && ((pair && high === 12) || ak);
    if (topPair || strongHeadsUp) {
      rate = topPair ? 0.96 : 0.78;
      trigger = 'value-over-large-open';
    }
  } else if (ownRaise && raises.length >= 3) {
    const topPair = pair && (high === 14 || (high === 13 && depthBB <= 150));
    const singleFourBet =
      headsUp && raises.length === 3 && depthBB <= 110 && ((pair && high === 12) || ak);
    const shortValue = headsUp && depthBB <= 40 && ((pair && high >= 10) || ak);
    if (topPair || singleFourBet || shortValue) {
      rate = topPair ? 0.98 : 0.85;
      trigger = 'value-five-bet';
    }
  } else if (ownRaise && raises.length === 2 && headsUp) {
    const shortValue =
      depthBB <= 60 && ((pair && high >= 12) || ak || (depthBB <= 30 && pair && high >= 10));
    const deepTop = depthBB <= 100 && pair && high >= 13;
    if (shortValue || deepTop) {
      rate = shortValue ? 0.86 : high === 14 ? 0.42 : 0.3;
      trigger = 'value-four-bet';
    }
  }
  if (!rate) return null;
  const aggression = profile.axes[1] / 100;
  const trapping = profile.policy?.trapRate ?? profile.axes[4] / 100;
  rate *= Math.max(0.65, Math.min(1.1, 0.9 + aggression * 0.25 - trapping * 0.15));
  return { trigger, depthBB, rate: Math.min(0.98, rate), amount: view.legal.maxRaiseTo };
}
