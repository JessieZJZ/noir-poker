import { fractionRaiseTo, legalRaiseTo } from '../engine/bet-sizing.js';

// Amounts are street totals. The engine supplies all legal-action boundaries.
export function presetRaiseTo({ currentBet, pot, legal }, preset) {
  if (!legal.enabled || !legal.canRaise) return null;
  let desired;
  if (preset === 'min') desired = legal.minRaiseTo;
  else if (preset === 'all') desired = legal.maxRaiseTo;
  else if (preset === 'half' || preset === 'pot') {
    const fraction = preset === 'half' ? 0.5 : 1;
    desired = fractionRaiseTo({ currentBet, pot, callAmount: legal.callAmount }, fraction);
  } else return null;
  return legalRaiseTo(desired, legal);
}
