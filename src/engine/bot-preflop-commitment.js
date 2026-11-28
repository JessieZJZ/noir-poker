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

// A single open that already commits most of the opener's stack leaves a
// caller almost nothing to play for after the flop. At or below this
// stack-to-pot ratio after the call, the response is all-in or fold.
export const COMMITTED_SPR = 1.5;
// Deeper matched stacks keep the normal open/3-bet logic.
export const COMMITTED_DEPTH_BB = 40;
// Starting-hand share that may ever move in over a committed open, so a noisy
// equity estimate cannot turn a dominated hand into a reshove; the top tier
// (88+, AK) moves in without depending on that estimate.
const COMMITTED_RESHOVE_FLOOR = 0.25;
const COMMITTED_VALUE_TIER = 0.04;

// Over a committed open the price is the whole matched stack, not the open:
// a flat call leaves SPR below COMMITTED_SPR, so speculative hands lose their
// implied odds and a hand worth playing gives up fold equity by flatting.
// The plan compares our public-range equity with the all-in price. Only public
// stacks, sizing and position, our own cards and that estimate enter it.
export function committedOpenPlan(view, profile, equity) {
  const legal = view.legal;
  if (view.street !== 0 || view.allIn || view.difficulty === 'easy') return null;
  if (!legal.canRaise || legal.toCall <= 0 || legal.callAmount >= view.stack) return null;
  if (view.opponents?.some((p) => p.allin)) return null;
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  if (raises.length !== 1 || raises[0].id === view.id) return null;
  const opener = view.opponents?.find((p) => p.id === raises[0].id);
  if (!opener || opener.stack <= 0) return null;
  const bigBlind = bigBlindOf(view);
  const ownPaid = view.total ?? view.bet ?? 0,
    openerPaid = opener.total ?? opener.bet ?? 0;
  const own = view.stack + ownPaid,
    openerChips = opener.stack + openerPaid;
  const matched = Math.min(own, openerChips);
  const depthBB = matched / bigBlind;
  if (depthBB > COMMITTED_DEPTH_BB) return null;
  const behindAfterCall = Math.min(view.stack - legal.callAmount, opener.stack);
  const spr = behindAfterCall / Math.max(1, view.contestable);
  if (spr > COMMITTED_SPR) return null;
  const callers = new Set(
    view.history
      .filter(
        (a) =>
          a.street === 0 &&
          a.action === 'call' &&
          a.amount > 0 &&
          a.id !== view.id &&
          a.id !== opener.id,
      )
      .map((a) => a.id),
  ).size;
  const behind = seatsBehind(view);
  // Assume the committed opener calls: the jam wins only at showdown here.
  const dead = Math.max(0, (view.pot ?? 0) - ownPaid - openerPaid);
  const risk = matched - ownPaid;
  const potOdds = risk / Math.max(1, dead + matched * 2);
  // Unacted seats and earlier callers can still wake up behind the jam.
  const aggression = profile.axes[1] / 100;
  const margin = Math.max(0, 0.02 + behind * 0.008 + callers * 0.03 - (aggression - 0.5) * 0.04);
  const required = Math.min(0.95, potOdds + margin);
  const percentile = startingPercentile(view.hole);
  const plan = {
    depthBB,
    spr,
    behindAfterCall,
    openerChips,
    matched,
    potOdds,
    margin,
    required,
    equity,
    percentile,
    behind,
    callers,
    openerAllIn: matched === openerChips,
  };
  const valueTier = percentile <= COMMITTED_VALUE_TIER;
  plan.valueTier = valueTier;
  if (valueTier || (equity >= required && percentile <= COMMITTED_RESHOVE_FLOOR)) {
    const amount = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, openerChips));
    return { ...plan, action: 'raise', amount, reason: 'committed-reshove' };
  }
  return { ...plan, action: 'fold', reason: 'committed-fold' };
}

// The opener facing a 3-bet with 40BB or less (or with a call that would
// leave less than COMMITTED_SPR times the pot behind) moves all-in with a
// range that narrows with depth: about 88+, ATs+, AJo+ and KQs at 20BB, down
// to TT+ and AQ+ at 40BB and deeper. A flat call there keeps no fold equity.
// Other hands go on to the normal price and range decision, so a good price
// against a small 3-bet can still be called. `mix(share)` is asked only for a
// hand between the two ranges and returns whether it moves in. Only our
// cards, public stacks and the public sizing enter.
export function reopenedCommitmentPlan(view, mix) {
  const legal = view.legal;
  if (view.street !== 0 || view.allIn || view.difficulty === 'easy') return null;
  if (!legal.canRaise || legal.toCall <= 0 || legal.callAmount >= view.stack) return null;
  if (view.opponents?.some((p) => p.allin)) return null;
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  if (raises.length !== 2 || raises[0].id !== view.id) return null;
  const threeBettor = view.opponents?.find((p) => p.id === raises[1].id);
  if (!threeBettor || threeBettor.stack <= 0) return null;
  const bigBlind = bigBlindOf(view);
  const own = view.stack + (view.total ?? view.bet ?? 0),
    theirs = threeBettor.stack + (threeBettor.total ?? threeBettor.bet ?? 0);
  const depthBB = Math.min(own, theirs) / bigBlind;
  const behindAfterCall = Math.min(view.stack - legal.callAmount, threeBettor.stack);
  const spr = behindAfterCall / Math.max(1, view.contestable);
  if (depthBB > COMMITTED_DEPTH_BB && spr >= COMMITTED_SPR) return null;
  const [high, low] = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const pair = high === low,
    suited = view.hole[0].suit === view.hole[1].suit;
  const tight = (pair && high >= 10) || (high === 14 && low >= 12);
  const wide =
    (pair && high >= 8) ||
    (high === 14 && low >= (suited ? 10 : 11)) ||
    (suited && high === 13 && low === 12);
  const wideShare = Math.min(1, Math.max(0, (COMMITTED_DEPTH_BB - depthBB) / 20));
  const jam = tight || (wide && wideShare > 0 && mix(wideShare));
  const short = depthBB <= COMMITTED_DEPTH_BB;
  const plan = {
    depthBB,
    spr,
    behindAfterCall,
    behind: 0,
    percentile: startingPercentile(view.hole),
    reshove: true,
    reopened: true,
    tier: tight ? 'tight' : wide ? 'wide' : null,
    wideShare,
  };
  if (!jam) return null;
  return {
    ...plan,
    action: 'raise',
    amount: legal.maxRaiseTo,
    reason: short ? 'short-reshove' : 'value-raise',
  };
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
