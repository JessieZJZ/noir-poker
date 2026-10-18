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
import { actorAtPosition } from '../engine/player-identity.js';
import { historyActionLabel } from '../engine/action-labels.js';

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
  return [
    c.handLabel,
    draw,
    pairDraw,
    `${c.texture.wet ? '湿润面' : '干燥面'}：${c.texture.label}`,
    s.street < 3 && c.opponents > 1 && c.made.score[0] === 1
      ? '多人底池里，一对需要控制底池，选择过牌，也可能让对手免费补成更强的牌。'
      : '',
  ].filter(Boolean);
}

export function preflopRangeNotes(s) {
  const actions = (s.history || []).filter((a) => a.street === 0),
    raises = actions.filter((a) => a.action === 'raise'),
    last = raises.findLast((a) => a.id !== 0),
    name = (id) => actorAtPosition(s, id),
    subject = s.reviewSubject || '你',
    notes = [];
  if (last) {
    const position = s.players?.find((p) => p.id === last.id)?.position,
      early = ['UTG', 'UTG+1', 'MP', 'LJ'].includes(position),
      late = ['HJ', 'CO', 'BTN'].includes(position);
    if (raises.length > 1)
      notes.push(
        `${name(last.id)}，${raises.length >= 3 ? '多次再加注后仍' : '已有加注时'}${historyActionLabel(s.history, s.history.indexOf(last))}，因此继续范围通常比普通开池更集中于大对子和 AK，AQ、同花高张也可能这样打。`,
      );
    else
      notes.push(
        `${name(last.id)}开池到 ${number(last.amount)}，可能拿着对子、强 A 或同花高张。${early ? '前位开池后还有较多人能跟注或再加注，因此通常需要更强的起手牌，用容易被强 A 或大对子压制的牌继续时，要更谨慎。' : late ? '后位开池需要越过的人较少，翻后也更容易最后行动，因此还可能用小对子或同花连张争夺盲注，较强起手牌不必只按对手有大对子来防守。' : ['SB', 'BB'].includes(position) ? '盲位翻后通常先行动，较弱高张不易实现摊牌价值，因此不能只因这次开池就假定对手在偷盲。' : '中小对子可能被更大对子压住，高张成对后也可能遇到更好的踢脚，所以不能只凭起手牌好看就继续。'}`,
      );
  } else
    notes.push(
      '前面还没有对手加注，后面的玩家仍可能拿到大对子或强 A，也可能用小对子、同花高张或同花连张入池。后位需要越过的人较少，翻后也更容易最后行动，因此能用更多起手牌争夺盲注，开池时仍要预留面对跟注或再加注的余地。',
    );
  const live = new Set(s.players?.filter((p) => !p.folded && p.id !== 0).map((p) => p.id)),
    firstRaise = actions.findIndex((a) => a.action === 'raise'),
    limpers = actions.filter(
      (a, i) => a.id !== 0 && live.has(a.id) && a.action === 'call' && i < firstRaise,
    ),
    callers = [
      ...new Set(
        actions
          .filter(
            (a, i) =>
              a.id !== 0 && live.has(a.id) && a.action === 'call' && i > actions.indexOf(last),
          )
          .map((a) => name(a.id)),
      ),
    ];
  if (limpers.length)
    notes.push(
      `${limpers.map((a) => name(a.id) + '先跟注 ' + number(a.amount)).join('、')}入池，仍未弃牌，这类平跟可能是小对子或同花牌，也可能藏着强牌。${subject}若再加注，不能只考虑开池者会不会弃牌。`,
    );
  if (last && callers.length)
    notes.push(
      `${callers.join('、')}跟住了这笔加注，可能用小中对子追暗三条，或用同花高张、同花连张争取翻后成大牌，平跟也可能藏着强牌。${subject}若再加注，想直接拿走底池，需要让加注者和这些跟注者都放弃。${subject}若只跟注，就要准备面对多人竞争。`,
    );
  if (s.hole.some((card) => card.rank === 14))
    notes.push(
      `${s.players?.find((p) => p.id === 0)?.name || '你'}手里有一张 A，对手能拿到 AA、AK、AQ、AJ 的组合会少一些，但这些强牌仍然可能出现。`,
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
        return publicComboWeight(candidate.cards, range, { board, ...data, boardScore, compare });
      }),
      total = weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < candidates.length; i++)
      candidates[i].likelihood += total ? weights[i] / total : 1 / candidates.length;
  }
  if (!ranges.length)
    for (const candidate of candidates) candidate.likelihood = 1 / candidates.length;
  const groups = { ahead: new Map(), behind: new Map(), tied: new Map() };
  for (const candidate of candidates) {
    const group = groupKey(candidate, s.street, s.board),
      entries = groups[candidate.direction],
      previous = entries.get(group);
    if (!previous) entries.set(group, { ...candidate, group, mass: candidate.likelihood });
    else {
      const mass = previous.mass + candidate.likelihood,
        preferred =
          candidate.relevance > previous.relevance ||
          (candidate.relevance === previous.relevance &&
            candidate.likelihood > previous.likelihood + 1e-12) ||
          (candidate.relevance === previous.relevance &&
            Math.abs(candidate.likelihood - previous.likelihood) <= 1e-12 &&
            ordered(candidate.key, previous.key) < 0);
      entries.set(group, { ...(preferred ? candidate : previous), group, mass });
    }
  }
  const select = (direction, limit) => {
    const ranked = [...groups[direction].values()].sort((a, b) =>
      a.relevance !== b.relevance
        ? b.relevance - a.relevance
        : Math.abs(a.mass - b.mass) > 1e-12
          ? b.mass - a.mass
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
    if (s.street)
      for (const candidate of representatives) {
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
      ? `翻前牌组对比：${c.handLabel}比 ${lead.text} 的点数或踢脚更好，但面对 ${lose.text} 会处于下风，之后仍要看公共牌。`
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
        ? `当前成牌对比：${c.handLabel}能赢例如 ${lead.text}（${lead.label}），但会输给 ${lose.text}（${lose.label}）。`
        : lead
          ? s.street === 3
            ? `当前成牌对比：${c.handLabel}能赢例如 ${lead.text}（${lead.label}），河牌已发完，是当前最大成牌。`
            : `当前成牌对比：${c.handLabel}能赢例如 ${lead.text}（${lead.label}），当前是最大成牌（坚果牌），后面新发的牌仍可能改变强弱。`
          : lose
            ? `当前成牌对比：${c.handLabel}会输给例如 ${lose.text}（${lose.label}），继续更需要补牌或对手弃牌。`
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
  return {
    ahead,
    behind,
    tied,
    possible,
    rangeNotes: s.street ? [] : preflopRangeNotes(s),
    handLabel: c.handLabel,
    summary: summaryParts.join('，'),
    summaryParts,
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
    title: '牌力与牌面',
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
export function valuePlan(s, c, matchups = c.matchups || handMatchups(s, c)) {
  const empty = { primary: null, secondary: null, kind: null, reason: '' };
  if (!matchups || matchups.strength === 'board') return empty;
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
    strongPreflop = !s.street && c.tier === 3,
    pocketTrap = strongPreflop && pocket && s.hole[0].rank >= 13,
    boardTrips = c.texture.trips && !s.hole.some((card) => card.rank === c.made.score[1]),
    valueHand =
      s.street > 0 &&
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
      reason: `当时底池 ${number(s.pot)}，你还剩 ${number(s.stack)}，这手强牌可比较价值全下，让${s.street ? '弱成牌或听牌' : '较弱起手牌'}为剩余筹码付费。`,
    };
  if (!valueHand && !strongPreflop) return empty;
  const amount = !s.street
      ? s.currentBet <= bigBlind
        ? 3 * bigBlind
        : s.currentBet * (c.inPosition ? 3 : 4)
      : s.currentBet > 0
        ? s.currentBet * (c.inPosition ? 2.5 : 3)
        : s.pot * (c.texture.wet || c.opponents > 1 ? 0.65 : 0.4),
    raise = canRaise ? { action: 'raise', amount: legalRaiseTo(amount, s.legal) } : null,
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
      ? `这手 ${cardText(s.hole)} 可用普通加注建立底池，给较弱对子和高牌留下继续的机会，当前 ${number(s.stack)} 的筹码不必一次全部推出。`
      : c.opponents > 1 && (c.handClass === 'top-pair' || c.handClass === 'overpair')
        ? `这张 ${cardText(s.board)} 是多人底池，一对更容易遇到两对或暗三条，可以取值，但不把 ${number(s.stack)} 一次当成必需投入。`
        : `当前成牌可向较弱牌取值，在 ${cardText(s.board)} 上加注既收取跟注，也让听牌付费，尺度仍要给弱牌留下继续空间。`,
  };
}
