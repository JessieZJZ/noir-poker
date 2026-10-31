// Cross-hand memory contains completed public actions from the first hand.
// Current actions are conditioned separately by the public action-line model,
// rather than counting that same evidence again in the frequency prior.
// Cards, winners, bankroll changes and test-opponent identities are not inputs.
export const PUBLIC_READ_WINDOW = 64;
export const PUBLIC_LARGE_PREFLOP_BB = 8;
export const PUBLIC_READ_MODEL = 'observed-public-actions-v2';
export const LEGACY_PUBLIC_READ_MODEL = 'observed-public-actions-v1';
export const PLAYER_OBSERVATION_VERSION = 1;
const fields = [
  'hands',
  'voluntaryHands',
  'raisingHands',
  'largeRaiseHands',
  'largeCallHands',
  'postActions',
  'postRaises',
  'facedPostBet',
  'calledPostBet',
  'foldedPostBet',
];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function sanitizePublicRead(value) {
  if (!value || typeof value !== 'object') return null;
  const result = Object.fromEntries(
    fields.map((key) => [key, Number.isFinite(value[key]) ? Math.max(0, value[key]) : 0]),
  );
  result.hands = Math.min(PUBLIC_READ_WINDOW, Math.floor(result.hands));
  if (!result.hands) return null;
  for (const key of ['voluntaryHands', 'raisingHands', 'largeRaiseHands', 'largeCallHands'])
    result[key] = Math.min(result.hands, result[key]);
  result.postActions = Math.min(result.postActions, result.hands * 100);
  for (const key of ['postRaises', 'facedPostBet', 'calledPostBet', 'foldedPostBet'])
    result[key] = Math.min(result.postActions, result[key]);
  for (const key of ['calledPostBet', 'foldedPostBet'])
    result[key] = Math.min(result.facedPostBet, result[key]);
  return result;
}

export function summarizePublicRead(samples = []) {
  const recent = Array.isArray(samples) ? samples.slice(-PUBLIC_READ_WINDOW) : [];
  const total = Object.fromEntries(fields.map((key) => [key, 0]));
  for (const sample of recent) {
    const safe = sanitizePublicRead(sample);
    if (safe) for (const key of fields) total[key] += safe[key];
  }
  return sanitizePublicRead(total);
}

// A shared player profile is deliberately smaller than a hand record: no
// identities, cards, action transcript or result can survive this whitelist.
export function sanitizePlayerObservationProfile(value) {
  if (
    !value ||
    value.version !== PLAYER_OBSERVATION_VERSION ||
    !Array.isArray(value.samples) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Number.isSafeInteger(value.totalHands) ||
    value.totalHands < 0
  )
    return null;
  const samples = value.samples
    .slice(-PUBLIC_READ_WINDOW)
    .filter((sample) => sample?.hands === 1)
    .map(sanitizePublicRead)
    .filter(Boolean);
  const totalHands = Math.max(value.totalHands, samples.length);
  return {
    version: PLAYER_OBSERVATION_VERSION,
    revision: Math.max(value.revision, totalHands),
    totalHands,
    samples,
  };
}

export function publicReadForPlayer(game, id) {
  return summarizePublicRead(game.players?.[id]?.publicReads || []);
}

export function publicHandObservations({ dealtIds, history, bigBlind }) {
  // An imported settlement ledger can omit the original action history.
  // It still settles normally, but supplies no behavioural evidence.
  if (!Array.isArray(history)) return new Map();
  const result = new Map(
    dealtIds.map((id) => [
      id,
      Object.fromEntries(fields.map((key) => [key, key === 'hands' ? 1 : 0])),
    ]),
  );
  let street = -1,
    highest = 0;
  const paid = new Map();
  for (const event of history) {
    const row = result.get(event.id);
    if (!row || !['fold', 'check', 'call', 'raise'].includes(event.action)) continue;
    if (event.street === 0) {
      if (['call', 'raise'].includes(event.action) && event.amount > 0) row.voluntaryHands = 1;
      if (event.action === 'raise') row.raisingHands = 1;
      if (event.action === 'raise' && event.amount >= PUBLIC_LARGE_PREFLOP_BB * bigBlind)
        row.largeRaiseHands = 1;
      if (event.action === 'call' && event.amount >= PUBLIC_LARGE_PREFLOP_BB * bigBlind)
        row.largeCallHands = 1;
      continue;
    }
    if (event.street !== street) {
      street = event.street;
      highest = 0;
      paid.clear();
    }
    const before = paid.get(event.id) || 0;
    row.postActions++;
    if (highest > before) {
      row.facedPostBet++;
      if (event.action === 'call') row.calledPostBet++;
      if (event.action === 'fold') row.foldedPostBet++;
    }
    if (event.action === 'raise') {
      row.postRaises++;
      highest = Math.max(highest, event.amount);
      paid.set(event.id, event.amount);
    } else if (event.action === 'call') paid.set(event.id, before + event.amount);
  }
  return result;
}

export function observedRangeModel(value, { action, allIn = false, legacy = false } = {}) {
  const read = sanitizePublicRead(value);
  if (!read || !action || (legacy && read.hands < 8)) return null;
  const raising = action === 'raise';
  const key = allIn
    ? raising
      ? 'largeRaiseHands'
      : 'largeCallHands'
    : raising
      ? 'raisingHands'
      : 'voluntaryHands';
  const prior = allIn ? 0.04 : raising ? 0.22 : 0.4;
  const priorHands = legacy ? 24 : 8;
  return {
    hands: read.hands,
    events: read[key],
    kind: key,
    width: clamp((read[key] + prior * priorHands) / (read.hands + priorHands), 0.025, 0.9),
    confidence: read.hands / (read.hands + priorHands),
  };
}

export function observedRangeWeight(percentile, baseWeight, model) {
  if (!model) return baseWeight;
  const learned =
    percentile <= model.width
      ? 0.8 + 0.2 * (1 - percentile / model.width)
      : Math.max(0.006, 0.12 * Math.exp(-(percentile - model.width) / 0.06));
  return clamp((1 - model.confidence) * baseWeight + model.confidence * learned);
}

export function observedAggressiveLikelihood(value, { legacy = false } = {}) {
  const read = sanitizePublicRead(value);
  if (!read || !read.postActions) return 0;
  if (legacy) {
    if (read.hands < 8 || read.postActions < 16) return 0;
    const frequency = (read.postRaises + 0.32 * 32) / (read.postActions + 32);
    return clamp((frequency - 0.4) * 1.25, 0, 0.65);
  }
  const frequency = (read.postRaises + 0.32 * 8) / (read.postActions + 8);
  // Frequent visible aggression broadens a prior; it does not prove a bluff.
  const confidence = read.postActions / (read.postActions + 12);
  return clamp((frequency - 0.35) * 1.25 * confidence, 0, 0.65);
}

export function observedResponseShift(value) {
  const read = sanitizePublicRead(value);
  if (!read || !read.facedPostBet) return 0;
  // A modest log-odds adjustment to the size/hand-conditioned prior, not a
  // claim that an aggregate call rate predicts any specific wager. Raises
  // also continue; free checks are never counted as calling evidence.
  const n = read.facedPostBet;
  const continueRate = (n - read.foldedPostBet + 3) / (n + 6);
  const confidence = Math.min(0.65, n / (n + 12));
  return clamp(Math.log(continueRate / (1 - continueRate)), -2, 2) * confidence;
}
