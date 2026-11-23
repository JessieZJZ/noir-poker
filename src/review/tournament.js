import { bigBlindOf } from '../engine/stakes.js';
import { startingPercentile } from '../engine/starting-range.js';
import { preflopSeatsBehind } from '../engine/positions.js';
import {
  PUSH_FOLD_BB,
  pushWidth,
  pushPressureScale,
  tournamentPressure,
  eliminationPremium,
} from '../engine/push-fold.js';

// Tournament spots for the hero's review, in plain words: compare push/fold
// at short stacks, and near the final table a call that can end the
// game needs a clear margin. Both are training heuristics from public
// stacks and seats, never hidden cards or the result.
const percent = (n) => Math.round(n * 100) + '%';
const rangeText = (low, high) =>
  percent(low) === percent(high) ? '约 ' + percent(low) : percent(low) + '–' + percent(high);

export function survivalNote(stage, subject = '你') {
  return stage === 'bubble'
    ? `再淘汰一人就进入决赛圈，跟注全下输了${subject}就会出局。`
    : `决赛圈每多撑过一人名次就会提高，跟注全下输了${subject}就会出局。`;
}
const view = (s) => ({ ...s, id: 0 });
const chipLeader = (s) => tournamentPressure(view(s))?.chipLeader;

function depthOf(s) {
  const own = s.stack + s.total,
    others = s.players.filter((p) => p.id !== 0 && !p.folded && !p.out);
  if (!others.length) return own / bigBlindOf(s);
  return Math.min(own, Math.max(...others.map((p) => p.stack + p.total))) / bigBlindOf(s);
}

export function shortStackSpot(s, ctx) {
  if (s.street !== 0 || !s.legal.canRaise) return null;
  const preflop = s.history.filter((a) => a.street === 0),
    raises = preflop.filter((a) => a.action === 'raise');
  if (raises.length > 1 || raises.some((a) => a.id === 0)) return null;
  if (s.players.some((p) => p.id !== 0 && p.allin)) return null;
  const depthBB = depthOf(s);
  if (depthBB > PUSH_FOLD_BB) return null;
  const limpers = preflop.filter((a) => a.action === 'call' && a.amount > 0 && a.id !== 0).length,
    seated = s.players.filter((p) => !p.out).length,
    behind = s.actionContext?.unactedBehindCount ?? preflopSeatsBehind(s.position, seated) ?? 4,
    width =
      pushWidth(depthBB, behind) *
      (raises.length ? 0.45 : limpers ? 0.8 : 1) *
      pushPressureScale(view(s)),
    percentile = startingPercentile(s.hole),
    inRange = percentile <= width,
    shove = s.action === 'raise' && s.amount === s.legal.maxRaiseTo,
    odds = s.legal.callAmount / Math.max(1, s.pot + s.legal.callAmount),
    cheapCall =
      raises.length && s.action === 'call' && odds <= 0.3 && s.legal.callAmount <= s.stack * 0.25;
  if (shove || s.action === 'check' || cheapCall) return null;
  const depth = Math.max(1, Math.round(depthBB)),
    leaderNote = chipLeader(s) ? '你筹码最多，对手跟注输了会出局，可以更多地全下抢盲。' : '',
    hand = ctx.handLabel,
    position = s.position,
    base = `有效筹码只剩约 ${depth} 个大盲，加注或跟注后很难再弃牌，剩下的筹码也不够在翻牌后施压，所以这个深度通常只在全下和弃牌之间选择。`;
  const shoveAction = { action: 'raise', amount: s.legal.maxRaiseTo },
    passive = s.legal.canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
  const plan = '筹码约 12 个大盲以内时，先判断全下还是弃牌，再看位置和身后人数。';
  if (s.action === 'fold') {
    if (percentile > width * 0.6) return null;
    return {
      code: 'short-stack-push-fold',
      status: 'consider',
      title: '短筹码可以全下抢盲',
      reason: [
        base,
        behind
          ? `${hand} 在 ${position}，身后还有 ${behind} 位没行动，够全下的标准，弃牌放弃了抢盲的机会。`
          : `${hand} 在 ${position}，够全下的标准，弃牌放弃了抢盲的机会。`,
        leaderNote,
      ].join(''),
      alternative: shoveAction,
      lesson: '筹码越短、身后没行动的人越少，能全下的牌越宽。',
      plan,
    };
  }
  const verdict = inRange
    ? behind
      ? `${hand} 在 ${position}，身后还有 ${behind} 位没行动，够全下的标准，直接全下能让对手在翻牌前就面对全部筹码的压力。`
      : `${hand} 在 ${position}，够全下的标准，直接全下能让对手在翻牌前就面对全部筹码的压力。`
    : s.legal.canCheck
      ? `${hand} 在 ${position} 不够全下的标准，免费过牌能留着筹码等更好的机会。`
      : `${hand} 在 ${position} 不够全下的标准，弃牌能留着筹码等更好的机会。`;
  return {
    code: 'short-stack-push-fold',
    status: 'consider',
    title: '短筹码优先比较全下与弃牌',
    reason: [base, verdict, inRange ? leaderNote : ''].join(''),
    alternative: inRange ? shoveAction : passive,
    lesson: '短筹码时，小额加注或平跟可能让后续难以弃牌；仍需结合位置、价格和合法动作比较。',
    plan,
  };
}

// The hero can refill before the final table, so only a call that really
// ends the game (refills used up, or the final table) carries the premium.
export function survivalCallSpot(s, price, low, high, uncertainty) {
  const t = s.tournament;
  if (!t || s.action !== 'call' || s.legal.callAmount < s.stack || !price.cost) return null;
  if (!t.finalTable && s.refillsLeft !== 0) return null;
  const pressure = tournamentPressure(view(s));
  if (!pressure) return null;
  const premium = eliminationPremium(view(s), true);
  if (high + uncertainty < price.required || (low + high) / 2 >= price.required + premium)
    return null;
  return {
    code: 'survival-call',
    status: 'consider',
    title: '跟注输了就会出局，要比平时跟得更紧',
    reason:
      survivalNote(pressure.stage) +
      `这次跟注至少需要约 ${percent(price.required)} 的胜率，估计胜率${rangeText(low, high)}，没有比价格高出足够的余量，不足以抵消出局的代价。`,
    alternative: { action: 'fold', amount: 0 },
    lesson: '接近决赛圈时，输了就出局的跟注要求更高的胜率，只拿明显领先的牌跟注。',
    plan: '先看这次跟注输了会不会出局，再看胜率比价格高出多少。',
  };
}
