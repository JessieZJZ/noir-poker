export const CHIP_UNIT = 25;
export const isChipAmount = (amount) =>
  Number.isSafeInteger(amount) && amount >= 0 && amount % CHIP_UNIT === 0;

// Choose the nearest whole chip; an exact half chip rounds up.
export const roundChips = (amount) => Math.round(amount / CHIP_UNIT) * CHIP_UNIT;

// All producers of raise proposals share the same grid and engine boundaries.
// This also avoids clamping a rounded proposal back onto an off-grid boundary.
export function legalRaiseTo(amount, legal) {
  const min = Math.ceil(legal.minRaiseTo / CHIP_UNIT) * CHIP_UNIT,
    max = Math.floor(legal.maxRaiseTo / CHIP_UNIT) * CHIP_UNIT;
  if (min > max || !Number.isFinite(amount)) throw Error('没有可用的合法筹码档位。');
  return Math.min(max, Math.max(min, roundChips(amount)));
}

// The pot already includes current street bets. Call first, then size the raise
// increment from that updated pot, using whole 25-denomination chips.
export function fractionRaiseTo({ currentBet, pot, callAmount }, fraction) {
  return currentBet + roundChips((pot + callAmount) * fraction);
}
