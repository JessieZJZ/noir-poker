// Compatibility for saved selections from older releases.
const legacy = {
  117987131: 'finn',
  443763750: 'knox',
  507862768: 'theo',
  1205452123: 'slate',
  1263673922: 'vale',
  1454845415: 'iris',
  1697058370: 'nico',
  2152942704: 'sage',
  2633446552: 'rook',
  2646095264: 'bram',
  2762101154: 'leon',
  3087218313: 'jett',
  3122905562: 'owen',
  3150340034: 'luka',
  3799774413: 'ezra',
  3812169722: 'mira',
};
// Retired overlapping styles migrate to the retained training archetype.
const merged = {
  luka: 'nico',
  slate: 'rook',
  knox: 'rook',
  finn: 'rook',
  theo: 'owen',
  sage: 'vale',
  bram: 'vale',
  leon: 'owen',
  ezra: 'owen',
};
export function canonicalProfileId(value) {
  if (typeof value !== 'string') return value;
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const id = legacy[hash >>> 0] || value;
  let current = id;
  while (merged[current]) current = merged[current];
  return current;
}
