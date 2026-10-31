// Keep every whole chip visible (1,025 -> 1.025K); only presentation changes.
export function compactChips(value, locale = 'en-US') {
  const amount = Math.round(Number(value));
  const magnitude = Math.abs(amount);
  const unit = magnitude >= 1000000 ? 1000000 : magnitude >= 1000 ? 1000 : 1;
  const digits = unit === 1000000 ? 6 : unit === 1000 ? 3 : 0;
  const suffix = unit === 1000000 ? 'M' : unit === 1000 ? 'K' : '';
  // WeChat's device JavaScript engines ship without Intl; write the same exact
  // decimal with a point there.
  if (typeof Intl === 'undefined') {
    const fraction = String(magnitude % unit)
      .padStart(digits, '0')
      .replace(/0+$/, '');
    return `${amount < 0 || Object.is(amount, -0) ? '-' : ''}${Math.floor(magnitude / unit)}${fraction ? `.${fraction}` : ''}${suffix}`;
  }
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits, useGrouping: false }).format(
      amount / unit,
    ) + suffix
  );
}

// Action records retain raw integer amounts; log presentation abbreviates them.
export const compactActionAmounts = (text) =>
  String(text).replace(
    /((?:小盲|大盲|全下跟注|跟注|短全下至|全下至|全下|下注至|下注|开池至|加注至)\s*)(\d+)(?![\dKMkm]|[.,]\d)/g,
    (_, label, amount) => label + compactChips(Number(amount)),
  );
