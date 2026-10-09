// The pot already includes current street bets. Call first, then size the raise
// increment from that updated pot. Amounts use the game's one-chip precision.
export function fractionRaiseTo({ currentBet, pot, callAmount }, fraction) {
  return currentBet + Math.round((pot + callAmount) * fraction);
}
