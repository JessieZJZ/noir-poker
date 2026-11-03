import { fractionRaiseTo, legalRaiseTo } from '../engine/bet-sizing.js';

// Amounts are street totals. The engine supplies all legal-action boundaries.
export function presetRaiseTo({ currentBet, pot, legal }, preset) {
  if (!legal.enabled || !legal.canRaise) return null;
  let desired;
  if (preset === 'min') desired = legal.minRaiseTo;
  else if (preset === 'all') desired = legal.maxRaiseTo;
  else if (preset === 'half' || preset === 'pot') {
    const fraction = preset === 'half' ? 0.5 : 1;
    desired = fractionRaiseTo(
      { currentBet, pot, callAmount: legal.callAmount, chipUnit: legal.chipUnit },
      fraction,
    );
  } else return null;
  return legalRaiseTo(desired, legal);
}

// A presentation scale, independent of stakes. Its midpoint is the same legal
// street total as the pot shortcut. Short stacks use the whole rail instead.
export const RAISE_SLIDER_MAX = 1000000;
function sliderSegments(view) {
  const { minRaiseTo: min, maxRaiseTo: max } = view.legal;
  const pot = presetRaiseTo(view, 'pot');
  return { min, max, pivot: pot > min && pot < max ? pot : null };
}
export function sliderRaiseTo(view, position) {
  if (!view.legal.enabled || !view.legal.canRaise) return null;
  const { min, max, pivot } = sliderSegments(view);
  const fraction = Math.max(0, Math.min(1, Number(position) / RAISE_SLIDER_MAX || 0));
  const amount =
    pivot === null
      ? min + (max - min) * fraction
      : fraction <= 0.5
        ? min + (pivot - min) * fraction * 2
        : pivot + (max - pivot) * (fraction - 0.5) * 2;
  return legalRaiseTo(amount, view.legal);
}
export function raiseSliderPosition(view, amount) {
  if (!view.legal.enabled || !view.legal.canRaise) return 0;
  const { min, max, pivot } = sliderSegments(view);
  const value = legalRaiseTo(amount, view.legal);
  const fraction =
    min === max
      ? 0
      : pivot === null
        ? (value - min) / (max - min)
        : value <= pivot
          ? (0.5 * (value - min)) / (pivot - min)
          : 0.5 + (0.5 * (value - pivot)) / (max - pivot);
  return Math.round(fraction * RAISE_SLIDER_MAX);
}

// Whole-chip amounts cover intervals of rail positions. Keep the finger's
// position within that interval instead of snapping back to its inverse.
export function createRaiseSliderSelection() {
  let selected = null;
  const context = (view, game) =>
    [
      game.hand,
      game.replayAttempt,
      game.street,
      game.history?.length,
      view.currentBet,
      view.pot,
      view.legal.minRaiseTo,
      view.legal.maxRaiseTo,
      view.legal.callAmount,
      view.legal.chipUnit,
    ].join(':');
  return {
    reset() {
      selected = null;
    },
    select(view, position, game) {
      const value = Math.round(Math.max(0, Math.min(RAISE_SLIDER_MAX, Number(position) || 0)));
      const amount = sliderRaiseTo(view, value);
      selected = amount === null ? null : { game, key: context(view, game), value, amount };
      return amount;
    },
    position(view, amount, game) {
      if (
        view.legal.enabled &&
        view.legal.canRaise &&
        selected?.game === game &&
        selected.key === context(view, game) &&
        selected.amount === amount &&
        sliderRaiseTo(view, selected.value) === amount
      )
        return selected.value;
      selected = null;
      return raiseSliderPosition(view, amount);
    },
  };
}
