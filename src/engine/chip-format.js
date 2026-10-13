// Keep every whole chip visible (1,025 -> 1.025K); only presentation changes.
export function compactChips(value, locale = 'en-US') {
  const amount = Math.round(Number(value));
  const magnitude = Math.abs(amount);
  const unit = magnitude >= 1000000 ? 1000000 : magnitude >= 1000 ? 1000 : 1;
  const digits = unit === 1000000 ? 6 : unit === 1000 ? 3 : 0;
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, useGrouping: false }).format(
      amount / unit,
    ) + (unit === 1000000 ? 'M' : unit === 1000 ? 'K' : '')
  );
}

// Action records retain raw integer amounts; log presentation abbreviates them.
export const compactActionAmounts = (text) =>
  String(text).replace(
    /((?:小盲|大盲|跟注|全下|下注至|开池至|加注至|短全下至|全下至)\s+)(\d+)(?![\d.KM])/g,
    (_, label, amount) => label + compactChips(Number(amount)),
  );
