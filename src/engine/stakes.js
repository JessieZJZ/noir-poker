import { isChipAmount } from './bet-sizing.js';
export const MAX_SMALL_BLIND = 50000;
export const SMALL_BLIND_INPUT_ERROR = '小盲只能输入25的正整数倍，且不超过50K。';
export const DEFAULT_STAKES = Object.freeze({
  smallBlind: 100,
  bigBlind: 200,
  startingStack: 20000,
  chipUnit: 100,
});
export function validateStakes(value = DEFAULT_STAKES) {
  const smallBlind = value?.smallBlind,
    bigBlind = value?.bigBlind;
  const chipUnit = smallBlind,
    startingStack = bigBlind * 100;
  if (
    !isChipAmount(smallBlind, 25) ||
    smallBlind === 0 ||
    smallBlind > MAX_SMALL_BLIND ||
    !isChipAmount(bigBlind, chipUnit) ||
    bigBlind <= smallBlind ||
    !isChipAmount(startingStack, chipUnit) ||
    startingStack > 1000000000000 ||
    (value?.chipUnit !== undefined && value.chipUnit !== chipUnit) ||
    (value?.startingStack !== undefined && value.startingStack !== startingStack)
  )
    throw Error(
      '小盲须为 25 的正整数倍且不超过 50K，大盲须为小盲的倍数且大于小盲。面额等于小盲，起始筹码为 100 BB。',
    );
  return { smallBlind, bigBlind, startingStack, chipUnit };
}
// The settings editor accepts plain whole numbers; K/M is display-only.
export function stakesFromSmallBlind(value) {
  const text = String(value),
    smallBlind = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !isChipAmount(smallBlind, 25) ||
    smallBlind === 0 ||
    smallBlind > MAX_SMALL_BLIND
  )
    throw Error(SMALL_BLIND_INPUT_ERROR);
  return validateStakes({ smallBlind, bigBlind: smallBlind * 2 });
}
export function sanitizeStakes(value) {
  try {
    return validateStakes(value);
  } catch {
    return { ...DEFAULT_STAKES };
  }
}
// Hand snapshots retain their own blinds through retry and review.
export const bigBlindOf = (value) =>
  value.bigBlind ?? value.stakes?.bigBlind ?? DEFAULT_STAKES.bigBlind;
export const sameStakes = (a, b) => a.smallBlind === b.smallBlind && a.bigBlind === b.bigBlind;
