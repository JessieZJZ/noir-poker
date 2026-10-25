import { bigBlindOf } from './stakes.js';

// Authored cash-table sizing, informed by live cash hands rather than fitted
// population frequencies. Only our cards and public stacks/actions enter here.
function depthOf(view) {
  const bigBlind = bigBlindOf(view);
  const ownDepth = (view.stack + view.bet) / bigBlind;
  const opposingDepth = Math.max(
    0,
    ...(view.opponents || []).map((player) => (player.stack + (player.bet || 0)) / bigBlind),
  );
  return opposingDepth > 0 ? Math.min(ownDepth, opposingDepth) : ownDepth;
}

export function botOpeningSize(view, style, limpers = 0, mix = 0.5) {
  const bigBlind = bigBlindOf(view);
  const depthBB = depthOf(view);
  const [high, low] = view.hole.map((c) => c.rank).sort((a, b) => b - a);
  const pair = high === low;
  const premium = (pair && high >= 12) || (high === 14 && low === 13);
  const value = (pair && high >= 9) || (high >= 13 && low >= 11);
  const compact = style.openingBB != null;
  const baseBB =
    depthBB < 30 ? 2.5 : depthBB < 60 ? 3 : (style.openingBB ?? (depthBB < 100 ? 4 : 4.5));
  const positionBB = depthBB >= 30 && !['BTN', 'CO'].includes(view.position) ? 0.5 : 0;
  const valueBB =
    depthBB < 60 ? 0 : premium ? (compact ? 0.5 : depthBB < 100 ? 1 : 1.5) : value ? 0.5 : 0;
  // Overlapping bands: a large open increases the value weighting, but does
  // not uniquely reveal AA/KK. Retain the small-sizing style's narrower band.
  const mixBB = depthBB < 60 ? 0 : mix < 0.25 ? -0.5 : mix < 0.75 ? 0 : compact ? 0.5 : 1;
  const isolatedBase = limpers > 0 && depthBB >= 40 ? Math.max(4, baseBB) : baseBB;
  const limperBB = limpers * (depthBB >= 60 ? 1.5 : 1);
  return {
    depthBB,
    baseBB: isolatedBase,
    positionBB,
    valueBB,
    mixBB,
    limpers,
    limperBB,
    desired: (isolatedBase + positionBB + valueBB + mixBB + limperBB) * bigBlind,
  };
}

// Used only after the action selector has admitted a value raise or bluff.
// Cold callers are counted after the latest raise, not every earlier call.
export function botReraiseSize(view, mix = 0.5) {
  const raises = view.history.filter((a) => a.street === 0 && a.action === 'raise');
  if (view.street !== 0 || !raises.length) return null;
  const last = view.history.lastIndexOf(raises.at(-1));
  const callers = new Set(
    view.history
      .slice(last + 1)
      .filter(
        (a) =>
          a.street === 0 &&
          a.action === 'call' &&
          a.amount > 0 &&
          a.id !== view.id &&
          a.id !== raises.at(-1).id &&
          view.opponents?.some((p) => p.id === a.id),
      )
      .map((a) => a.id),
  ).size;
  const depthBB = depthOf(view);
  const threeBet = raises.length === 1;
  const positionMultiple = threeBet ? (view.inPosition ? 3.5 : 4.5) : view.inPosition ? 2.5 : 3;
  const mixMultiple = depthBB < 40 ? 0 : mix < 0.25 ? -0.5 : mix < 0.75 ? 0 : 0.5;
  const callerMultiple = callers * (threeBet ? 1 : 0.5);
  // Shallow stacks use a smaller normal re-raise; deliberate value jams are
  // still selected by the existing commitment policy before reaching here.
  const shallowMultiple = depthBB < 40 ? (threeBet ? 3 : 2.25) : positionMultiple;
  const multiple = shallowMultiple + mixMultiple + callerMultiple;
  return { depthBB, callers, threeBet, multiple, desired: view.currentBet * multiple };
}
