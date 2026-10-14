export const chipUnitOf = (value) => value.chipUnit ?? value.stakes?.chipUnit ?? 1;
export const isChipAmount = (amount, chipUnit = 1) =>
  Number.isSafeInteger(chipUnit) &&
  chipUnit > 0 &&
  Number.isSafeInteger(amount) &&
  amount >= 0 &&
  amount % chipUnit === 0;
export const roundChips = (amount, chipUnit = 1) => Math.round(amount / chipUnit) * chipUnit;
export function legalRaiseTo(amount, legal) {
  const unit = chipUnitOf(legal);
  const min = Math.ceil(legal.minRaiseTo / unit) * unit,
    max = Math.floor(legal.maxRaiseTo / unit) * unit;
  if (min > max || !Number.isFinite(amount)) throw Error('没有可用的合法筹码档位。');
  return Math.min(max, Math.max(min, roundChips(amount, unit)));
}
export function fractionRaiseTo({ currentBet, pot, callAmount, chipUnit = 1 }, fraction) {
  return currentBet + roundChips((pot + callAmount) * fraction, chipUnit);
}
