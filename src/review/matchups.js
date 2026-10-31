import { reviewCardCache, clearReviewCardCache } from './card-cache.js';
import { deckOfCards, evaluate, compare, RANK_NAMES } from '../engine/poker.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';
import { bigBlindOf } from '../engine/stakes.js';
import { compactChips } from '../engine/chip-format.js';
import { botBoardFeatures } from '../engine/bot-profiles.js';
import { preparePublicRanges, publicComboWeight } from '../engine/public-ranges.js';
import { publicHandData } from '../engine/public-equity.js';
import { cardText, spotFacts } from './spot-facts.js';
import { drawLabel } from './narrative.js';
import { actorAtPosition, actorIdentity } from '../engine/player-identity.js';
import { historyActionLabel } from '../engine/action-labels.js';
import { strengthParts, boardParts } from './presentation.js';
import { preflopRaiseTarget } from './preflop.js';

const identify = (card) => `${card.rank}-${card.suit}`;
const number = compactChips;
const ordered = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const pairKey = (cards) => cards.map(identify).sort().join('|');
const groupKey = (candidate, street, board) => {
  const [high, low] = candidate.cards.map((card) => card.rank).sort((a, b) => b - a),
    shape = high === low ? 'p' : candidate.cards[0].suit === candidate.cards[1].suit ? 's' : 'o';
  if (!street) {
    if (shape === 'p') return `pocket-${high >= 11 ? 'high' : high >= 7 ? 'middle' : 'small'}`;
    if (high === 14) return `ace-${low >= 10 ? 'broadway' : 'low'}-${shape}`;
    if (low >= 10) return `broadway-${shape}`;
    if (shape === 's' && high - low <= 2) return 'suited-connected';
    return `unpaired-${high >= 11 ? 'high' : 'low'}-${shape}`;
  }
  const score = candidate.score,
    top = Math.max(...board.map((c) => c.rank));
  const pair = score[0] === 1 ? (score[1] > top ? 'over' : score[1] === top ? 'top' : 'lower') : '';
  return `${score[0]}-${pair}-${high}-${low}-${candidate.features.draw ? 'draw' : 'made'}`;
};

export function matchupDrawLabel(cards, board, features) {
  const ranks = new Set([...cards, ...board].map((card) => card.rank));
  if (ranks.has(14)) ranks.add(1);
  const openEnded =
    features.straightOuts > 4 &&
    Array.from({ length: 9 }, (_, i) => i + 2).some(
      (low) =>
        [0, 1, 2, 3].every((offset) => ranks.has(low + offset)) &&
        !ranks.has(low - 1) &&
        !ranks.has(low + 4),
    );
  return drawLabel({
    flush: features.flushDraw,
    straight: features.straightOuts > 0,
    straightType:
      features.straightOuts > 4 ? (openEnded ? 'open-ended' : 'double-gutshot') : 'gutshot',
  });
}

// Only card evaluations are shared. Ranges are rebuilt for every public line.
// Four boards bound retained memory even when many archived hands are opened.
const cardCache = reviewCardCache();
export const clearMatchupCache = clearReviewCardCache;
function cachedCards(cards, board) {
  const key = board.map((c) => c.key).join('|');
  if (!cardCache.has(key) && cardCache.size >= 4) cardCache.delete(cardCache.keys().next().value);
  return publicHandData(cards, board, { evaluate, features: botBoardFeatures, cache: cardCache });
}
function handSummary(s, c) {
  if (!s.street) return [c.handLabel];
  const draw = c.draw.outs ? drawLabel(c.draw) : '';
  const pairDraw =
    !draw && c.made.score[0] === 0 && s.street < 3 ? '未成对，可改善为一对，成对也未必领先。' : '';
  return [...strengthParts(s, c), draw, pairDraw].filter(Boolean);
}

export function preflopRangeNotes(s) {
  const observer = s.reviewAudience === 'observer';
  const actions = (s.history || []).filter((a) => a.street === 0),
    raises = actions.filter((a) => a.action === 'raise'),
    last = raises.findLast((a) => a.id !== 0),
    name = (id) => actorAtPosition(s, id),
    subject = s.reviewSubject || '你',
    notes = [];
  if (last) {
    const priorRaisers = new Map(
      raises
        .slice(0, raises.indexOf(last))
        .filter((a) => a.id !== 0 && a.id !== last.id && (s.pending || []).includes(a.id))
        .map((a) => [a.id, a]),
    );
    for (const prior of priorRaisers.values())
      notes.push(
        `此前${name(prior.id)}${historyActionLabel(s.history, s.history.indexOf(prior))}，仍需回应最新加注。`,
      );
    notes.push(`${name(last.id)}${historyActionLabel(s.history, s.history.indexOf(last))}。`);
  } else if (
    !observer &&
    s.legal.canCheck &&
    !(s.pending || []).some(
      (id) =>
        id !== 0 &&
        !s.players?.find((p) => p.id === id)?.folded &&
        !s.players?.find((p) => p.id === id)?.allin,
    )
  )
    notes.push(
      `本轮已轮到${subject}最后回应，可以免费过牌看翻牌。` +
        (!observer && s.legal.canRaise ? '也可结合底牌和对手范围比较主动加注。' : ''),
    );
  const live = new Set(s.players?.filter((p) => !p.folded && p.id !== 0).map((p) => p.id)),
    firstRaise = actions.findIndex((a) => a.action === 'raise'),
    limpers = actions.filter(
      (a, i) =>
        a.id !== 0 &&
        live.has(a.id) &&
        a.action === 'call' &&
        i < firstRaise &&
        !raises.some((raise) => raise.id === a.id) &&
        !actions
          .slice(firstRaise + 1)
          .some((later) => later.id === a.id && later.action === 'call'),
    ),
    callers = actions.filter(
      (a, i) =>
        last && a.id !== 0 && live.has(a.id) && a.action === 'call' && i > actions.indexOf(last),
    ),
    earlierCallers = actions.filter(
      (a, i) =>
        last &&
        a.id !== 0 &&
        live.has(a.id) &&
        a.action === 'call' &&
        i > firstRaise &&
        i < actions.indexOf(last) &&
        (s.pending || []).includes(a.id) &&
        !raises.some((raise) => raise.id === a.id),
    );
  const groupedCalls = (records, beforeRaise) => {
    const groups = new Map();
    for (const action of new Map(records.map((a) => [a.id, a])).values()) {
      const actor = actorIdentity(s, action.id);
      const label = actor.position ? `${actor.name}在 ${actor.position} 位` : actor.name;
      if (!groups.has(action.amount)) groups.set(action.amount, []);
      groups.get(action.amount).push(label);
    }
    return [...groups].map(([amount, names]) =>
      beforeRaise
        ? names.length > 1
          ? `${names.join('、')}都先跟注 ${number(amount)} 入池。`
          : `${names[0]}先跟注 ${number(amount)} 入池。`
        : names.length > 1
          ? `${names.join('、')}都已跟注这笔加注，各补 ${number(amount)}。`
          : `${names[0]}已跟注这笔加注，补 ${number(amount)}。`,
    );
  };
  if (earlierCallers.length)
    notes.push(...groupedCalls(earlierCallers, true), '先前跟注后仍需回应最新加注。');
  const callAllIn = s.stack > 0 && s.legal.callAmount >= s.stack,
    commitment = callAllIn || s.players?.some((p) => p.id !== 0 && !p.folded && p.allin);
  if (last && (limpers.length || callers.length))
    notes.push(
      [
        ...groupedCalls(limpers, true),
        ...groupedCalls(callers, false),
        '这类平跟可能是小对子、同花牌或连接牌，也可能藏着强牌。',
        observer || s.action === 'fold'
          ? ''
          : commitment
            ? callAllIn
              ? '本人跟注后就已全下，不能把后街取值或追中后的额外收益当成继续依据。'
              : '已全下者不能再被逼弃牌，其他仍有筹码玩家的后续投入需按边池另行判断。'
            : s.legal.canRaise
              ? `${subject}若再加注，需要同时考虑加注范围和跟注入池的范围。`
              : '',
      ].join(''),
    );
  if (!s.reviewSubject && s.hole.some((card) => card.rank === 14))
    notes.push(
      `${s.players?.find((p) => p.id === 0)?.name || '你'}手中的 A 会减少对手拿到 AA、AK、AQ、AJ 的组合，但这些强牌仍然可能出现。`,
    );
  return notes;
}

// Ranking describes possible opponent holdings from the same public range
// kernel as the bots. It never changes the exhaustive current-nuts proof.
export function handMatchups(s, c) {
  if (!s.hole?.length || !s.board || !c.made) return null;
  const known = new Set([...s.hole, ...s.board].map(identify)),
    pool = deckOfCards().filter((card) => !known.has(identify(card))),
    own = c.made.score,
    comparison = s.street ? 'made' : 'structure',
    cache = cardCache,
    candidates = [];
  let hasBehind = false;
  for (let i = 0; i < pool.length - 1; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const cards = [pool[i], pool[j]],
        made = cachedCards(cards, s.board),
        direction = Math.sign(compare(own, made.score));
      if (direction < 0) hasBehind = true;
      candidates.push({
        cards,
        text: cardText(cards),
        label: !s.street
          ? made.score[0] === 1
            ? '口袋对子'
            : '高牌'
          : made.score[0] === 8 && made.score[1] === 14
            ? '皇家同花顺'
            : RANK_NAMES[made.score[0]],
        score: made.score,
        features: made.features || {},
        direction: direction > 0 ? 'ahead' : direction < 0 ? 'behind' : 'tied',
        key: pairKey(cards),
        likelihood: 0,
        relevance: !s.street
          ? cards[0].rank === cards[1].rank
            ? 3
            : cards.every((card) => card.rank >= 10)
              ? 4
              : cards[0].suit === cards[1].suit && Math.abs(cards[0].rank - cards[1].rank) <= 2
                ? 2
                : 0
          : made.score[0] > 0 || made.features?.draw
            ? 1
            : 0,
      });
    }
  if (s.street)
    for (const candidate of candidates) {
      const draw = matchupDrawLabel(candidate.cards, s.board, candidate.features);
      if (draw) candidate.label = candidate.score[0] ? candidate.label + ' + ' + draw : draw;
    }
  const ranges = preparePublicRanges(s).sort((a, b) => a.id - b.id);
  // Each live seat contributes a normalized distribution over the legal pool.
  // Summing their group masses ranks which holdings merit consideration across
  // multiple opponents; these masses are not displayed as win probabilities.
  for (const range of ranges) {
    const board = range.board || [],
      boardScore = board.length === 5 ? publicHandData([], board, { evaluate, cache }).score : null,
      weights = candidates.map((candidate) => {
        const data =
          board.length >= 3
            ? publicHandData(candidate.cards, board, {
                evaluate,
                features: botBoardFeatures,
                cache,
              })
            : {};
        return publicComboWeight(candidate.cards, range, {
          board,
          ...data,
          boardScore,
          compare,
          handData: cachedCards,
        });
      }),
      total = weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < candidates.length; i++)
      candidates[i].likelihood += total ? weights[i] / total : 1 / candidates.length;
  }
  if (!ranges.length)
    for (const candidate of candidates) candidate.likelihood = 1 / candidates.length;
  // Teaching-example priority only. Do not alter equity weights or nut proofs.
  // A deep unraised pot should not use its limited slots mostly for premiums
  // which would often have raised, or for a one-combo extreme such as quads.
  const limped =
    s.street > 0 &&
    (s.history || []).some((a) => a.street === 0 && a.action === 'call' && a.amount > 0) &&
    !(s.history || []).some((a) => a.street === 0 && a.action === 'raise') &&
    ranges.length > 0 &&
    ranges.every((r) => r.depthBB >= 30);
  const priority = (candidate) => {
    if (!limped) return 1;
    const [hi, lo] = candidate.cards.map((c) => c.rank).sort((a, b) => b - a);
    const premium = (hi === lo && hi >= 10) || (hi === 14 && lo === 13);
    const connector =
      hi !== lo && hi - lo <= 2 && hi <= 11 && candidate.cards[0].suit === candidate.cards[1].suit;
    const pairedRank = s.board.find(
      (c) => s.board.filter((b) => b.rank === c.rank).length === 2,
    )?.rank;
    const pairedBoat =
      candidate.score[0] === 6 && hi !== lo && candidate.cards.some((c) => c.rank === pairedRank);
    return (
      (premium ? 0.08 : connector ? (hi <= 10 && hi - lo === 1 ? 2 : 1.15) : 1) *
      (pairedBoat ? 3 : 1) *
      (candidate.score[0] >= 7 ? 0.02 : 1)
    );
  };
  const groups = { ahead: new Map(), behind: new Map(), tied: new Map() };
  for (const candidate of candidates) {
    candidate.presentationMass = candidate.likelihood * priority(candidate);
    const group = groupKey(candidate, s.street, s.board),
      entries = groups[candidate.direction],
      previous = entries.get(group);
    if (!previous) entries.set(group, { ...candidate, group, mass: candidate.likelihood });
    else {
      const mass = previous.mass + candidate.likelihood,
        presentationMass = previous.presentationMass + candidate.presentationMass,
        preferred =
          candidate.relevance > previous.relevance ||
          (candidate.relevance === previous.relevance &&
            candidate.presentationMass > previous.likelihood * priority(previous) + 1e-12) ||
          (candidate.relevance === previous.relevance &&
            Math.abs(candidate.presentationMass - previous.likelihood * priority(previous)) <=
              1e-12 &&
            ordered(candidate.key, previous.key) < 0);
      entries.set(group, { ...(preferred ? candidate : previous), group, mass, presentationMass });
    }
  }
  const select = (direction, limit) => {
    const ranked = [...groups[direction].values()].sort((a, b) =>
      a.relevance !== b.relevance
        ? b.relevance - a.relevance
        : Math.abs(a.presentationMass - b.presentationMass) > 1e-12
          ? b.presentationMass - a.presentationMass
          : ordered(a.group, b.group),
    );
    // Do not spend every slot on adjacent overpairs while omitting top pairs
    // or sets. Preserve public weights within each distinct hand family.
    // A higher kicker on the same two pair should not consume the last slot
    // while a distinct winning hand type (for example a flush) is omitted.
    const sameTwoPair = (candidate) =>
      own[0] === 2 &&
      candidate.score[0] === 2 &&
      candidate.score[1] === own[1] &&
      candidate.score[2] === own[2];
    const representatives =
      direction === 'behind' && s.street && own[0] === 2
        ? [...ranked.filter((candidate) => !sameTwoPair(candidate)), ...ranked.filter(sameTwoPair)]
        : ranked;
    const chosen = [],
      families = new Set();
    if (limped && direction === 'behind' && own[0] === 5 && c.texture.paired) {
      for (let i = 0; i < 2; i++)
        for (const category of [5, 6]) {
          const pairedRanks = new Set(
            s.board
              .filter((card, index, board) =>
                board.some((other, j) => j !== index && other.rank === card.rank),
              )
              .map((card) => card.rank),
          );
          const candidate = ranked.filter(
            (c) =>
              c.score[0] === category &&
              (category !== 6 || c.cards.some((card) => pairedRanks.has(card.rank))),
          )[i];
          if (candidate && chosen.length < limit) chosen.push(candidate);
        }
    }
    if (s.street)
      for (const candidate of representatives) {
        if (chosen.length >= limit) break;
        const family = candidate.group.split('-').slice(0, 2).join('-');
        if (!candidate.relevance || families.has(family)) continue;
        families.add(family);
        chosen.push(candidate);
        if (chosen.length === limit) break;
      }
    for (const candidate of ranked) {
      if (chosen.length === limit) break;
      if (!chosen.includes(candidate)) chosen.push(candidate);
    }
    // Keep the board's visible flush threat among the few teaching examples.
    // This is category coverage only; it does not modify any range weight.
    if (
      direction === 'behind' &&
      own[0] < 5 &&
      c.texture.maxSuit >= 3 &&
      !chosen.some((candidate) => candidate.score[0] === 5)
    ) {
      const flush = ranked.find((candidate) => candidate.score[0] === 5);
      if (flush) {
        const rare = chosen.findIndex((candidate) => candidate.score[0] >= 7);
        chosen[rare < 0 ? chosen.length - 1 : rare] = flush;
      }
    }
    return chosen.map(({ cards, text, label, score, group }) => ({
      cards,
      text,
      label,
      score,
      group,
    }));
  };
  const mass = (direction) =>
    [...groups[direction].values()].reduce(
      (sum, group) => sum + (!s.street || group.relevance > 0 ? group.mass : 0),
      0,
    );
  const ahead = select('ahead', mass('ahead') >= mass('behind') ? 3 : 1),
    behind = select('behind', s.street ? 4 : mass('behind') > mass('ahead') ? 3 : 1),
    tied = select('tied', 1),
    lead = ahead[0],
    lose = behind[0],
    tie = tied[0],
    board = c.handClass === 'board',
    danger = (c.texture.maxSuit >= 3 && own[0] < 5) || (c.texture.connected >= 4 && own[0] < 4),
    strength = !s.street
      ? c.tier >= 2
        ? 'strong'
        : c.tier === 1
          ? 'medium'
          : 'weak'
      : board
        ? 'board'
        : own[0] >= 3 && !danger
          ? 'strong'
          : own[0] >= 1
            ? 'medium'
            : 'weak';
  const text = !s.street
    ? lead && lose
      ? c.handClass === 'pocket' && lead.score[0] === 0
        ? `翻前牌组对比：${c.handLabel}已经成对，${lead.text}仍未成对，但面对 ${lose.text} 这样的更大对子会处于下风，公共牌仍可能改变强弱。`
        : `翻前牌组对比：${c.handLabel}按当前牌型与点数高于 ${lead.text}，但低于 ${lose.text}，公共牌仍可能改变强弱。`
      : lead
        ? `翻前牌组对比：${c.handLabel}领先例如 ${lead.text}，这手强起手牌可以向较弱对子或高牌取值。`
        : lose
          ? `翻前牌组对比：${c.handLabel}面对例如 ${lose.text} 会落后，不能只靠弱牌本身支撑大额投入。`
          : ''
    : board
      ? lose
        ? `主要牌力来自公共牌，遇到 ${lose.text}（${lose.label}）仍会落后，不能把公共牌成牌当成独占底池。`
        : `主要牌力来自公共牌，${tie?.text || ''} 也能组成同样的牌，当前争取的是平分底池。`
      : lead && lose
        ? `当前成牌对比：${c.handLabel}，能赢例如 ${lead.text}（${lead.label}），但会输给 ${lose.text}（${lose.label}）。`
        : lead
          ? s.street === 3
            ? `当前成牌对比：${c.handLabel}，能赢例如 ${lead.text}（${lead.label}），河牌已发完，是当前最大成牌。`
            : `当前成牌对比：${c.handLabel}，能赢例如 ${lead.text}（${lead.label}），当前是最大成牌（坚果牌），后面新发的牌仍可能改变强弱。`
          : lose
            ? `当前成牌对比：${c.handLabel}，会输给例如 ${lose.text}（${lose.label}），继续更需要补牌或对手弃牌。`
            : `当前成牌与 ${tie?.text || ''} 相同，主要争取平分底池。`;
  const summaryParts = handSummary(s, c);
  const possible = [];
  if (!s.street) {
    const merged = new Map();
    for (const entries of Object.values(groups))
      for (const candidate of entries.values()) {
        const previous = merged.get(candidate.group);
        merged.set(
          candidate.group,
          previous
            ? {
                ...(candidate.likelihood > previous.likelihood ? candidate : previous),
                mass: previous.mass + candidate.mass,
              }
            : candidate,
        );
      }
    const families = new Set();
    for (const candidate of [...merged.values()].sort(
      (a, b) => b.mass - a.mass || ordered(a.group, b.group),
    )) {
      const family = candidate.group.split('-')[0];
      if (!candidate.relevance || families.has(family)) continue;
      families.add(family);
      const { cards, text, score, group } = candidate;
      possible.push({
        cards,
        text,
        score,
        group,
        label:
          cards[0].rank === cards[1].rank
            ? '口袋对子'
            : cards[0].suit === cards[1].suit
              ? '同花底牌'
              : '不同花底牌',
      });
      if (possible.length === 4) break;
    }
  }
  const seenMissed = new Set();
  const missedDraws =
    s.street === 3
      ? candidates
          .filter(
            (candidate) =>
              candidate.direction === 'ahead' &&
              !candidate.features.ownMade &&
              ranges.some((range) =>
                (range.postflopLine || []).some(
                  (event) =>
                    event.street < 3 &&
                    ['bet', 'raise', 'check-raise', 'call'].includes(event.action) &&
                    cachedCards(candidate.cards, event.board).features.draw,
                ),
              ),
          )
          .sort((a, b) => b.likelihood - a.likelihood)
          .filter((candidate) => {
            const key = candidate.cards
              .map((card) => card.rank)
              .sort((a, b) => b - a)
              .join(':');
            if (seenMissed.has(key)) return false;
            seenMissed.add(key);
            return true;
          })
          .slice(0, 2)
          .map(({ cards, text }) => ({ cards, text }))
      : [];
  return {
    ahead,
    missedDraws,
    weakerDrawTypes:
      s.street > 0 && s.street < 3
        ? [
            ...(candidates.some((c) => c.direction === 'ahead' && c.features.flushDraw)
              ? ['flush']
              : []),
            ...(candidates.some((c) => c.direction === 'ahead' && c.features.straightOuts > 0)
              ? ['straight']
              : []),
          ]
        : [],
    // Category existence uses the whole legal card pool, not the few range-
    // ranked examples selected for display. It conveys no rival hidden cards.
    weakerMadeCategories: [
      ...new Set(
        candidates.filter((hand) => hand.direction === 'ahead').map((hand) => hand.score[0]),
      ),
    ].sort((a, b) => a - b),
    strongerMadeCategories: [
      ...new Set(
        candidates.filter((hand) => hand.direction === 'behind').map((hand) => hand.score[0]),
      ),
    ].sort((a, b) => a - b),
    behind,
    tied,
    possible,
    rangeNotes: s.street ? [] : preflopRangeNotes(s),
    handLabel: c.handLabel,
    summary: summaryParts.join('，'),
    summaryParts,
    boardParts: boardParts(s, c),
    strengthParts: summaryParts,
    comparison,
    rangeContext: ranges.map(({ id, position, role, line, preflop, postflop }) => ({
      id,
      position,
      role,
      line,
      preflop,
      postflop,
    })),
    nut: Boolean(s.street) && !hasBehind,
    strength,
    relation: !s.street ? strength : board ? 'board' : !hasBehind ? 'current-nuts' : strength,
    text,
  };
}

export function matchupPresentation(matchups, street) {
  if (!matchups) return null;
  const structure = matchups.comparison === 'structure';
  const nutsNote =
    !structure && matchups.nut
      ? street === 3
        ? '河牌已发完，当前没有可能更强的牌组。'
        : '当前没有可能更强的牌组，后续公共牌仍可能改变强弱。'
      : '';
  return {
    title: '当前牌面',
    boardParts: matchups.boardParts || [],
    boardSummary: (matchups.boardParts || []).join('，'),
    strengthTitle: '当前牌力',
    strengthParts: matchups.strengthParts || matchups.summaryParts || [matchups.handLabel],
    handLabel: matchups.summary || matchups.handLabel,
    summaryParts: matchups.summaryParts || [matchups.handLabel],
    note: '',
    rangeNotes: [],
    groups: structure
      ? [{ direction: 'possible', label: '对手可能牌组', examples: matchups.possible, empty: '' }]
      : [
          {
            direction: 'ahead',
            label: '当前能赢的可能牌组',
            examples: matchups.ahead,
            empty: '未列出更弱的可能牌组。',
          },
          {
            direction: 'behind',
            label: '当前会输的可能牌组',
            examples: matchups.behind,
            empty: nutsNote || '未列出更强的可能牌组。',
          },
        ],
    nutsNote: '',
  };
}

export function reviewCommentary(paragraphs, matchups, street, paragraphParts) {
  const presentation = matchupPresentation(matchups, street);
  return paragraphs.map((text, index) =>
    presentation && text === matchups.text
      ? { matchups: presentation }
      : { text, ...(paragraphParts ? { parts: paragraphParts[index] } : {}) },
  );
}

// Conditional value candidates only. Existing analysis and paired-rollout guards
// still determine the final verdict. All sizing is delegated to the engine helper.
export function sharesPublicPair(s, c) {
  if (!s.street || c.made.score[0] !== 2) return false;
  const paired = s.board
    .filter((card) => s.board.filter((other) => other.rank === card.rank).length >= 2)
    .map((card) => card.rank);
  return c.made.score.slice(1, 3).some((rank) => paired.includes(rank));
}

export function valuePlan(s, c, matchups = c.matchups || handMatchups(s, c)) {
  const empty = { primary: null, secondary: null, kind: null, reason: '' };
  if (!matchups || matchups.strength === 'board') return empty;
  if (
    s.street > 0 &&
    s.legal.callAmount > 0 &&
    (sharesPublicPair(s, c) ||
      (c.handClass === 'top-pair' && (c.opponents > 1 || (s.street === 3 && s.bet > 0))))
  )
    return empty;
  const shoveReason = () =>
    `当时底池 ${number(s.pot)}，全下约占底池的 ${((s.stack / s.pot) * 100).toFixed(1)}%，这手强牌可比较价值全下，让${s.street === 3 ? '弱成牌' : s.street ? '弱成牌或听牌' : '较弱起手牌'}付费。`;
  const f = spotFacts(s, c),
    bigBlind = bigBlindOf(s),
    live = (s.players || []).filter((p) => p.id !== 0 && !p.folded && !p.allin && p.stack > 0),
    score = c.made.score[0],
    facing = f.lastAggression?.street === s.street ? f.lastAggression : null,
    dry = !c.texture.wet && !c.texture.paired,
    fullRaise = s.legal.fullRaiseTo ?? s.currentBet + (s.minRaise ?? bigBlind),
    canRaise =
      s.legal.canRaise &&
      s.legal.raiseReopened !== false &&
      !s.legal.isShortAllin &&
      s.legal.maxRaiseTo >= fullRaise &&
      live.length > 0,
    pocket = s.hole[0].rank === s.hole[1].rank,
    strongPreflop =
      !s.street && c.tier === 3 && (c.preflopRaises < 3 || (pocket && s.hole[0].rank >= 13)),
    pocketTrap = strongPreflop && pocket && s.hole[0].rank >= 13,
    boardTrips = c.texture.trips && !s.hole.some((card) => card.rank === c.made.score[1]),
    valueHand =
      s.street > 0 &&
      !['board', 'board-pair', 'underpair', 'middle-pair'].includes(c.handClass) &&
      !boardTrips &&
      (score >= 2 || ['overpair', 'top-pair'].includes(c.handClass)) &&
      !(c.texture.maxSuit >= 4 && score < 5) &&
      !(c.texture.connected >= 4 && score < 4),
    strongMade = valueHand && (score >= 3 || c.handClass === 'overpair'),
    topKicker =
      c.handClass === 'top-pair' &&
      s.hole.some(
        (card) => card.rank >= 13 && !s.board.some((boardCard) => boardCard.rank === card.rank),
      ),
    dangerousMade =
      (c.texture.maxSuit >= 3 && score < 5) ||
      (c.texture.connected >= 3 && score < 4) ||
      (c.texture.paired && score < 6),
    shallow = s.pot > 0 && c.spr <= 1.25 && s.stack / s.pot <= 1.25 && s.stack > s.legal.callAmount,
    shoveHand =
      s.street > 0 &&
      valueHand &&
      (matchups.nut ||
        (!dangerousMade &&
          (score >= 3 ||
            (c.opponents === 1 && (score === 2 || topKicker || c.handClass === 'overpair'))))),
    trap =
      canRaise &&
      facing &&
      s.stack > s.legal.callAmount &&
      ((s.street > 0 &&
        s.street < 3 &&
        c.opponents === 1 &&
        live.length === 1 &&
        dry &&
        strongMade &&
        !shallow) ||
        (!s.street &&
          pocketTrap &&
          c.opponents <= 3 &&
          c.pendingOthers <= 2 &&
          c.preflopRaises <= 2 &&
          c.inPosition &&
          c.effective > Math.max(30 * bigBlind, s.legal.callAmount * 4)));
  if (
    canRaise &&
    ((shallow && shoveHand) ||
      (strongPreflop && (s.stack <= 15 * bigBlind || shallow) && c.preflopRaises <= 2))
  )
    return {
      primary: { action: 'raise', amount: s.legal.maxRaiseTo },
      secondary: s.legal.canCheck
        ? { action: 'check', amount: 0 }
        : { action: 'call', amount: s.legal.callAmount },
      kind: 'value-shove',
      reason: shoveReason(),
    };
  if (!valueHand && !strongPreflop) return empty;
  let amount = !s.street
    ? preflopRaiseTarget(s, c)
    : s.currentBet > 0
      ? s.currentBet * (c.inPosition ? 2.5 : 3)
      : s.pot * (c.texture.wet || c.opponents > 1 ? 0.65 : 0.4);
  // Clamping a routine value size to the stack does not establish that a
  // dangerous hand is a value shove. Keep a smaller comparison if legal.
  const cappedDanger =
    dangerousMade && !shoveHand && s.legal.canCheck && amount >= s.legal.maxRaiseTo;
  if (cappedDanger) amount = s.bet + Math.min(s.pot * 0.25, s.stack * 0.5);
  const raise =
      canRaise && (!cappedDanger || legalRaiseTo(amount, s.legal) < s.legal.maxRaiseTo)
        ? { action: 'raise', amount: legalRaiseTo(amount, s.legal) }
        : null,
    flat = s.legal.canCheck
      ? { action: 'check', amount: 0 }
      : { action: 'call', amount: s.legal.callAmount };
  if (trap)
    return {
      primary: s.action === 'call' ? flat : raise,
      secondary: s.action === 'call' ? raise : flat,
      kind: 'trap',
      reason: s.street
        ? `这张 ${cardText(s.board)} 较干燥，对手已经主动下注，平跟 ${number(s.legal.callAmount)} 是埋牌路线，留住这条下注线中的弱牌和诈唬，双方仍有筹码继续下一街。`
        : `这手 ${cardText(s.hole)} 可以藏在平跟里，对手已有主动加注，你有位置，平跟 ${number(s.legal.callAmount)} 保留其弱牌和诈唬。`,
    };
  return {
    primary: raise,
    secondary: flat,
    kind: raise ? 'value-raise' : null,
    reason: !s.street
      ? raise && raise.amount - s.bet >= s.stack
        ? shoveReason()
        : `这手 ${cardText(s.hole)} 可比较普通加注，核对${s.hole[0].rank === s.hole[1].rank ? '较小对子或未成对高牌' : '较差踢脚的高牌'}是否愿意按这个尺度继续，当前 ${number(s.stack)} 的筹码不必一次全部推出。`
      : c.opponents > 1 && (c.handClass === 'top-pair' || c.handClass === 'overpair')
        ? c.texture.paired
          ? `这张 ${cardText(s.board)} 已经配对，公共牌的一对由所有玩家共享，对手持有相同点数的底牌就可能有三条。取值仍要有较弱牌愿意付费，不能只凭两对的总牌型扩大投入。`
          : `这张 ${cardText(s.board)} 是多人底池，一对更容易遇到两对或暗三条，可以取值，但不把 ${number(s.stack)} 一次当成必需投入。`
        : s.street === 3
          ? `当前成牌可向较弱成牌取值，在 ${cardText(s.board)} 上加注，收益来自它们愿意跟注付费，尺度仍要给弱牌留下继续空间。`
          : `当前成牌可向较弱牌取值，在 ${cardText(s.board)} 上加注既收取跟注，也让听牌付费，尺度仍要给弱牌留下继续空间。`,
  };
}

// Preserve one visual paragraph, but translate complete sentences independently.
export const rangeNoteClauses = (note) => note.match(/[^。]+。?/g) || [note];
