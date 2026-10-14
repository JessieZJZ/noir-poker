import { deckOfCards, evaluate, compare } from '../engine/poker.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';
import { cardText, spotFacts } from './spot-facts.js';

const identify = (card) => `${card.rank}-${card.suit}`;
const number = (value) => Math.round(value).toLocaleString('en-US');

// These are possible current hands, never a prediction of the opponent's cards
// or a range-equity estimate. Only the actor's hole cards and current board count.
export function handMatchups(s, c) {
  if (!s.hole?.length || !s.board || !c.made) return null;
  const known = new Set([...s.hole, ...s.board].map(identify)),
    pool = deckOfCards().filter((card) => !known.has(identify(card))),
    own = c.made.score,
    example = (cards) => {
      if (!cards || cards.some((card) => !card)) return null;
      const made = evaluate([...cards, ...s.board]);
      return { cards, text: cardText(cards), label: made.label, score: made.score };
    },
    pair = (a, b) => {
      const first = pool.find((card) => card.rank === a),
        second = pool.find((card) => card.rank === b && card !== first);
      return first && second ? example([first, second]) : null;
    };
  let ahead = null,
    behind = null,
    tied = null;
  if (!s.street) {
    const ranks = s.hole.map((card) => card.rank).sort((a, b) => b - a),
      pocket = ranks[0] === ranks[1];
    if (pocket) {
      ahead = ranks[0] > 2 ? pair(ranks[0] - 1, ranks[0] - 1) : null;
      behind = ranks[0] < 14 ? pair(ranks[0] + 1, ranks[0] + 1) : null;
    } else {
      ahead =
        c.tier === 0 && c.preflopRaises
          ? null
          : ranks[1] > 2
            ? pair(ranks[0], ranks[1] - 1)
            : pair(Math.max(2, ranks[0] - 1), 2);
      behind =
        c.tier === 0 && c.preflopRaises
          ? pair(Math.max(8, Math.min(14, ranks[0] + 1)), Math.max(8, Math.min(14, ranks[0] + 1)))
          : ranks[1] < ranks[0] - 1
            ? pair(ranks[0], ranks[1] + 1)
            : pair(Math.min(14, ranks[0]), Math.min(14, ranks[0]));
    }
    const strength = c.tier >= 2 ? 'strong' : c.tier === 1 ? 'medium' : 'weak',
      text =
        ahead && behind
          ? `翻前牌组对比：${c.handLabel}比 ${ahead.text} 的点数或踢脚更好，但面对 ${behind.text} 会处于下风；之后仍要看公共牌。`
          : ahead
            ? `翻前牌组对比：${c.handLabel}领先例如 ${ahead.text}；这手强起手牌可以向较弱对子或高牌取值。`
            : behind
              ? `翻前牌组对比：${c.handLabel}面对例如 ${behind.text} 会落后，不能只靠弱牌本身支撑大额投入。`
              : '';
    return {
      ahead: ahead ? [ahead] : [],
      behind: behind ? [behind] : [],
      tied: [],
      nut: false,
      strength,
      relation: strength,
      text,
    };
  }
  const threatCategory =
      c.texture.paired && own[0] >= 4 && own[0] < 6
        ? 6
        : c.texture.maxSuit >= 3 && own[0] < 5
          ? 5
          : c.texture.connected >= 3 && own[0] < 4
            ? 4
            : null,
    threatPriority = (candidate) => (candidate.score[0] === threatCategory ? 0 : 1);
  for (let i = 0; i < pool.length - 1; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const candidate = example([pool[i], pool[j]]),
        comparison = compare(own, candidate.score);
      if (comparison > 0 && (!ahead || compare(candidate.score, ahead.score) > 0))
        ahead = candidate;
      else if (
        comparison < 0 &&
        (!behind ||
          threatPriority(candidate) < threatPriority(behind) ||
          (threatPriority(candidate) === threatPriority(behind) &&
            compare(candidate.score, behind.score) < 0))
      )
        behind = candidate;
      else if (!comparison && !tied) tied = candidate;
    }
  const board = c.handClass === 'board',
    danger = (c.texture.maxSuit >= 3 && own[0] < 5) || (c.texture.connected >= 4 && own[0] < 4),
    strength = board
      ? 'board'
      : own[0] >= 3 && !danger
        ? 'strong'
        : own[0] >= 1
          ? 'medium'
          : 'weak',
    text = board
      ? behind
        ? `主要牌力来自公共牌；遇到 ${behind.text}（${behind.label}）仍会落后，不能把公共牌成牌当成独占底池。`
        : `主要牌力来自公共牌，${tied?.text || ''} 也能组成同样的牌；当前争取的是平分底池。`
      : ahead && behind
        ? `当前成牌对比：${c.handLabel}能赢例如 ${ahead.text}（${ahead.label}），但会输给 ${behind.text}（${behind.label}）。`
        : ahead
          ? s.street === 3
            ? `当前成牌对比：${c.handLabel}能赢例如 ${ahead.text}（${ahead.label}），河牌已发完，是当前最大成牌。`
            : `当前成牌对比：${c.handLabel}能赢例如 ${ahead.text}（${ahead.label}），当前是最大成牌（坚果牌）；后面新发的牌仍可能改变强弱。`
          : behind
            ? `当前成牌对比：${c.handLabel}会输给例如 ${behind.text}（${behind.label}）；继续更需要补牌或对手弃牌。`
            : `当前成牌与 ${tied?.text || ''} 相同，主要争取平分底池。`;
  return {
    ahead: ahead ? [ahead] : [],
    behind: behind ? [behind] : [],
    tied: tied ? [tied] : [],
    nut: !behind,
    strength,
    relation: board ? 'board' : !behind ? 'current-nuts' : strength,
    text,
  };
}

// Conditional value candidates only. Existing analysis and paired-rollout guards
// still determine the final verdict. All sizing is delegated to the engine helper.
export function valuePlan(s, c, matchups = c.matchups || handMatchups(s, c)) {
  const empty = { primary: null, secondary: null, kind: null, reason: '' };
  if (!matchups || matchups.strength === 'board') return empty;
  const f = spotFacts(s, c),
    live = (s.players || []).filter((p) => p.id !== 0 && !p.folded && !p.allin && p.stack > 0),
    score = c.made.score[0],
    facing = f.lastAggression?.street === s.street ? f.lastAggression : null,
    dry = !c.texture.wet && !c.texture.paired,
    fullRaise = s.legal.fullRaiseTo ?? s.currentBet + (s.minRaise ?? 50),
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
          c.effective > Math.max(1500, s.legal.callAmount * 4)));
  if (
    canRaise &&
    ((shallow && shoveHand) ||
      (strongPreflop && (s.stack <= 750 || shallow) && c.preflopRaises <= 2))
  )
    return {
      primary: { action: 'raise', amount: s.legal.maxRaiseTo },
      secondary: s.legal.canCheck
        ? { action: 'check', amount: 0 }
        : { action: 'call', amount: s.legal.callAmount },
      kind: 'value-shove',
      reason: `当时底池 ${number(s.pot)}，你还剩 ${number(s.stack)}；这手强牌可比较价值全下，让${s.street ? '弱成牌或听牌' : '较弱起手牌'}为剩余筹码付费。`,
    };
  if (!valueHand && !strongPreflop) return empty;
  const amount = !s.street
      ? s.currentBet <= 50
        ? 150
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
        ? `这张 ${cardText(s.board)} 较干燥，对手已经主动下注；平跟 ${number(s.legal.callAmount)} 是埋牌路线，留住这条下注线中的弱牌和诈唬，双方仍有筹码继续下一街。`
        : `这手 ${cardText(s.hole)} 可以藏在平跟里；对手已有主动加注，你有位置，平跟 ${number(s.legal.callAmount)} 保留其弱牌和诈唬。`,
    };
  return {
    primary: raise,
    secondary: flat,
    kind: raise ? 'value-raise' : null,
    reason: !s.street
      ? `这手 ${cardText(s.hole)} 可用普通加注建立底池，给较弱对子和高牌留下继续的机会；当前 ${number(s.stack)} 的筹码不必一次全部推出。`
      : c.opponents > 1 && (c.handClass === 'top-pair' || c.handClass === 'overpair')
        ? `这张 ${cardText(s.board)} 是多人底池，一对更容易遇到两对或暗三条；可以取值，但不把 ${number(s.stack)} 一次当成必需投入。`
        : `当前成牌可向较弱牌取值；在 ${cardText(s.board)} 上加注既收取跟注，也让听牌付费，尺度仍要给弱牌留下继续空间。`,
  };
}
