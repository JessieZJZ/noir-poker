// Coverage describes facts actually emitted by a producer, not facts merely
// available in the snapshot. It lets later layers add new information without
// repeating the same reason under different wording.
export const REVIEW_TOPICS = Object.freeze({
  CLOSURE: 'betting-closure',
  FOLD_AVAILABILITY: 'fold-availability',
  DRAW: 'draw-improvement',
  DRAW_CEILING: 'draw-ceiling',
  CURRENT_RESPONSE: 'current-response',
  FUTURE_COST: 'future-cost',
  PRICE: 'price',
  PAIRED_DRAW_RISK: 'paired-draw-risk',
  NUT_DRAW: 'nut-draw',
  ACTION: 'action',
  RIVER_RANGE: 'river-range',
});

const known = new Set(Object.values(REVIEW_TOPICS));
export function proseCoverage(topics = []) {
  return new Set(Array.from(topics || []).filter((topic) => known.has(topic)));
}

export function proseReason(parts, coveredTopics = []) {
  return {
    parts: [parts].flat().filter((part) => typeof part === 'string' && part),
    coveredTopics: [...proseCoverage(coveredTopics)],
  };
}

export function unpackProseReason(value) {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? proseReason(value.parts || [], value.coveredTopics)
    : proseReason(value);
}
