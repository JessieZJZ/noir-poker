// Amounts are street totals. The engine supplies all legal-action boundaries.
export function presetRaiseTo({ currentBet, pot, legal }, preset) {
  if (!legal.enabled || !legal.canRaise) return null;
  let desired;
  if (preset === 'min') desired = legal.minRaiseTo;
  else if (preset === 'all') desired = legal.maxRaiseTo;
  else if (preset === 'half' || preset === 'pot') {
    const fraction = preset === 'half' ? 0.5 : 1;
    // Hypothetically call first, then raise by a fraction of that updated pot.
    const raise = Math.round(((pot + legal.callAmount) * fraction) / 25) * 25;
    desired = currentBet + raise;
  } else return null;
  return Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, desired));
}
