import { publicPostflopLine } from '../engine/public-story.js';
import { actorAtPosition, actorName } from '../engine/player-identity.js';
import { compactChips } from '../engine/chip-format.js';
import { preparePublicRanges } from '../engine/public-ranges.js';
import {
  PUBLIC_READ_MODEL,
  LEGACY_PUBLIC_READ_MODEL,
  observedAggressiveLikelihood,
  observedRangeModel,
} from '../engine/public-observations.js';

export function publicObservationNotes(s) {
  // Older sampled records could omit public tendency/style inputs inside the
  // sampler. Only the corrected producer or a known full-descriptor path can
  // support attributing an observation-based motive to the recorded decision.
  const completeRangeInputs =
    s.publicEquity?.rangeInputsVersion === 'complete-public-weight-inputs-v1' ||
    ((s.publicEquity?.exact || s.allIn) &&
      ['public-action-ranges', 'public-all-in-ranges', 'public-commitment-ranges'].includes(
        s.publicEquity?.model,
      ));
  if (
    !completeRangeInputs ||
    ![PUBLIC_READ_MODEL, LEGACY_PUBLIC_READ_MODEL].includes(s.publicReadModel) ||
    !s.reviewSubject ||
    !['call', 'fold', 'raise'].includes(s.action)
  )
    return [];
  const last = (s.history || []).findLast(
    (a) => a.street === s.street && a.action === 'raise' && a.id !== (s.id ?? 0),
  );
  if (!last) return [];
  const range = preparePublicRanges(s).find((r) => r.id === last.id);
  // Historical records used the current all-in flag to select this bucket.
  // New records carry the earlier-wager sizing contract after the action was
  // selected. Do not reinterpret an old motive with today's grouping rule.
  const sizing = s.observationSizing;
  const actualWagerSizing =
    sizing?.version === 1 && Number.isFinite(sizing.largePreflopBB) && sizing.largePreflopBB > 0;
  if (sizing && !actualWagerSizing) return [];
  const legacy = s.publicReadModel === LEGACY_PUBLIC_READ_MODEL;
  const observation = range
    ? observedRangeModel(range.publicRead, {
        action: range.preflop.action,
        allIn: actualWagerSizing ? range.preflop.amountBB >= sizing.largePreflopBB : range.allIn,
        legacy,
      })
    : null;
  if (!observation || (legacy && observation.hands < 8)) return [];
  const other = actorName(s, last.id),
    subject = s.reviewSubject;
  if (s.street === 0 && observation.events / observation.hands >= 0.5) {
    if (observation.kind === 'largeRaiseHands')
      return [
        `${subject}结合${other}此前 ${observation.hands} 手中 ${observation.events} 手翻前大额加注的记录，本次估计中保留了更多非顶级起手牌。`,
      ];
    if (observation.kind === 'raisingHands')
      return [
        `${subject}结合${other}此前 ${observation.hands} 手中 ${observation.events} 手翻前加注的记录，本次没有把加注范围限于强牌。`,
      ];
  }
  const aggression = observedAggressiveLikelihood(range.publicRead, { legacy });
  if (s.street > 0 && aggression > 0.1)
    return [`${subject}结合${other}此前频繁的翻后下注与加注，本次估计保留了更多弱牌施压的可能。`];
  return [];
}

// Public facts, not a claim that an archived bot had the current range model.
export function publicStoryNotes(s) {
  const observations = publicObservationNotes(s);
  if (!s.street || !['call', 'fold'].includes(s.action)) return observations;
  const last = (s.history || []).findLast(
    (a) => a.street === s.street && a.action === 'raise' && a.id !== 0,
  );
  if (!last) return observations;
  const line = publicPostflopLine(s, last.id);
  if (new Set(line.map((a) => a.street)).size < 2) return observations;
  const callThenLead =
    s.reviewAudience === 'observer' &&
    line.some((a) => a.action === 'call' && a.street < s.street) &&
    line.some((a) => ['bet', 'raise'].includes(a.action) && a.street === s.street);
  if (
    !callThenLead &&
    !line.some((a) => a.action === 'check-raise') &&
    line.filter((a) => ['bet', 'raise'].includes(a.action)).length < 2
  )
    return observations;
  const parts = [...observations, `${actorAtPosition(s, last.id)}此前的公开行动：`, ' '];
  const visible = line.filter(
    (a) =>
      a.action !== 'check' ||
      !line.some((b) => b.street === a.street && b.action === 'check-raise'),
  );
  visible.forEach((a, i) => {
    if (i) parts.push(' → ');
    parts.push(['', '翻牌', '转牌', '河牌'][a.street]);
    parts.push(' ');
    parts.push(
      a.action === 'check'
        ? '过牌'
        : a.action === 'check-raise'
          ? `过牌后加注至 ${compactChips(a.amount)}`
          : a.action === 'call'
            ? `跟注 ${compactChips(a.amount)}`
            : `${a.action === 'bet' ? '下注至' : '加注至'} ${compactChips(a.amount)}`,
    );
  });
  parts.push('。');
  if (line.some((a) => a.action === 'check-raise'))
    parts.push(
      s.reviewAudience === 'observer'
        ? '此前的过牌加注同时保留了强成牌和诈唬的可能。'
        : '过牌加注也可能来自强牌，不能仅凭前面的过牌排除价值牌。',
    );
  if (s.street === 3) {
    const turn = s.board.slice(0, 4),
      suits = ['黑桃', '红桃', '梅花', '方块'];
    for (let suit = 0; suit < 4; suit++)
      if (
        turn.filter((c) => c.suit === suit).length === 2 &&
        s.board.filter((c) => c.suit === suit).length === 2
      )
        parts.push(`河牌没有补出第三张${suits[suit]}，此前的同花听牌仍可能转成诈唬。`);
  }
  return parts;
}
