import { bigBlindOf } from './stakes.js';

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
  const suited = view.hole[0].suit === view.hole[1].suit;
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
  if (firstIn && depthBB <= 20) {
    const strong = (pair && high >= 10) || ak;
    const lateValue =
      late &&
      ((pair && high >= (depthBB <= 12 ? 5 : 7)) ||
        (high === 14 && low >= 12) ||
        (suited && high === 13 && low === 12));
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
