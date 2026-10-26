import { bigBlindOf } from '../engine/stakes.js';
import { compactChips } from '../engine/chip-format.js';
import { actionLabel } from '../engine/action-labels.js';
import {
  actionReason,
  situationNotes,
  continuationNote,
  drawCompletion,
  drawLabel,
  preflopPotential,
  callStreetNote,
} from './narrative.js';
import { rankText } from '../engine/poker.js';
import { spotFacts } from './spot-facts.js';
import {
  exhaustsStack,
  plannedValueShove,
  foldPressure,
  foldWinNote,
  strengthParts,
  pendingRaiseOpportunity,
  coversOpponentStacks,
} from './presentation.js';
import { heavyPreflopPressure } from './presentation.js';
import { rangeNoteClauses } from './matchups.js';
import { checkReasoning, checkRisks, madeRedrawReasoning } from './check-reasoning.js';
import { guaranteedBoardCoaching, closedDrawChance, riverRangeReason } from './strategy-facts.js';
import { valueDrawNote, flushCompletionNote } from './value-targets.js';

const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
const fmt = compactChips;
const pct = (n) => Math.round(n * 100) + '%';
const pricePct = (n) => (n * 100).toFixed(1) + '%';
const same = (a, b) => a.action === b.action && (a.action !== 'raise' || a.amount === b.amount);
const valueCodes = new Set(['premium-flat', 'value-check', 'deep-value-shove']);

function fullHouseValueTargets(c) {
  // Use legally possible public-card examples rather than assuming that every
  // paired board permits both a weaker full house and three of a kind.
  const categories = c.matchups?.weakerMadeCategories || [];
  const trips = categories.includes(3);
  const boat = categories.includes(6);
  return boat ? (trips ? '三条或较小葫芦' : '较小葫芦') : trips ? '三条' : '较弱成牌';
}

const reviewedBoundaryCodes = new Set([
  'weak-late-limp',
  'weak-sb-cold-call',
  'weak-limper-isolation',
  'dangerous-value-shove',
  'undersized-value-bet',
  'dirty-draw-bet',
  'flush-board-shove',
]);

function currentHand(s, c) {
  if (!c.made?.score) return c.handLabel;
  if (c.made?.score[0] === 6)
    return `葫芦（三张 ${rankText(c.made.score[1])} 加两张 ${rankText(c.made.score[2])}）`;
  return strengthParts(s, c).join('，');
}

function waitingRaise(s) {
  return s.players ? pendingRaiseOpportunity(s) : null;
}

function waitingNote(s, c) {
  if (!c.pendingOthers) return '';
  return waitingRaise(s) === false
    ? `你身后还有 ${c.pendingOthers} 人等待回应，但他们当前没有再次加注权，只能补跟或弃牌。`
    : `你身后还有 ${c.pendingOthers} 人等待行动，他们如果加注或者再加注，你需要重新决定是否继续。`;
}

function callingPlan(s, c, closing) {
  if (closing) return '跟注后只能等摊牌，不能再靠后街下注赶走更好的牌。';
  if (c.pendingOthers)
    return waitingRaise(s) === false
      ? '本轮还有玩家可以补跟或弃牌，但当前没有重新加注权，不会因他们再次加注而要求你补筹码。'
      : '本轮还没封口，后面的玩家如果加注或者再加注，你需要重新决定要不要跟。';
  return '这一轮已经轮到你最后回应，继续后，下一街还要面对新的牌面与下注。';
}

function preflopPressureFocus(s, c) {
  return s.hole[0].rank === s.hole[1].rank
    ? '这手对子仍有摊牌机会，但面对更大对子会明显落后，继续加注要分别判断较弱牌是否会跟注、更强牌是否可能弃牌，不能只按对子大小确定进攻目的。'
    : s.hole.some((card) => card.rank === 14) && s.hole.some((card) => card.rank === 13)
      ? 'AK 击中 A 或 K 时有顶对顶踢脚潜力，但面对 AA、KK 仍明显落后，未击中时要结合价格和对手范围判断，再加注要分别判断较弱牌会不会付费，以及更好的牌会不会弃掉。'
      : '未成对高牌仍有改善潜力，但被更大对子或更好踢脚继续时会处于不利位置，再加注要分别判断较弱牌会不会付费，以及更好的牌会不会弃掉。';
}

function drawFoldReasons(s, c) {
  const parts = [];
  if (c.draw.flush) {
    const suit = [0, 1, 2, 3].find(
      (value) => [...s.hole, ...s.board].filter((card) => card.suit === value).length === 4,
    );
    const ownHigh = Math.max(
      0,
      ...s.hole.filter((card) => card.suit === suit).map((card) => card.rank),
    );
    const known = new Set(
      [...s.hole, ...s.board].filter((card) => card.suit === suit).map((card) => card.rank),
    );
    const higherUnknown = Array.from({ length: 13 }, (_, i) => i + 2).some(
      (rank) => rank > ownHigh && !known.has(rank),
    );
    if (higherUnknown)
      parts.push(
        '你的同花听牌不是最大同花听牌，补中时仍可能输给更高的同花，所以这些成牌候选不能全当作获胜补牌。',
      );
  }
  if (c.opponents > 1)
    parts.push('当前仍有多位对手，补中后也要同时赢过他们，多人竞争会降低部分补牌的实际价值。');
  const raises = (s.history || []).filter((a) => a.id !== 0 && a.action === 'raise');
  if (new Set(raises.map((a) => a.street)).size >= 2)
    parts.push(
      '对手已经连续多街下注，继续需要其范围里保留足够较弱牌或诈唬，不能只按补成牌型的概率判断。',
    );
  if (!parts.length)
    parts.push(
      '补成目标牌型不等于一定赢，仍要判断对手这条下注线里有多少更强成牌与诈唬，不能把改善概率直接当成获胜概率。',
    );
  return parts;
}

// These clauses describe only the actual action's public circumstances.
// They do not replace the analysis or select a different recommendation.
function actualActionReason(s, r) {
  const c = r.context,
    f = spotFacts(s, c),
    limpers = new Set(
      (s.history || [])
        .filter((a) => a.street === 0 && a.id !== 0 && a.action === 'call')
        .map((a) => a.id),
    );
  if (!s.street && s.action === 'raise' && heavyPreflopPressure(s, c))
    return `你拿 ${f.holeText} 在 ${s.position} ${actionLabel(s)}，这次拿出 ${fmt(f.investment)} 争取 ${fmt(s.pot)} 的底池。${preflopPressureFocus(s, c)}`;
  if (!s.street && s.action === 'raise' && !c.preflopRaises && limpers.size)
    return `你拿 ${f.holeText} 在 ${s.position} ${actionLabel(s)}，这次拿出 ${fmt(f.investment)} 争取 ${fmt(s.pot)} 的底池。前面已有 ${limpers.size} 位玩家跟注入池，这次加注也在隔离这些玩家，不能只把他们当作尚未入池的盲位。`;
  if (
    s.street &&
    s.action === 'raise' &&
    (c.made.score[0] >= 3 ||
      reviewedBoundaryCodes.has(r.code) ||
      (c.draw.outs > 0 && !(f.shove && f.potRatio > 4)) ||
      (c.handClass === 'underpair' && f.potRatio >= 1) ||
      (!s.legal.callAmount && f.potRatio < 0.35 && c.handClass === 'middle-pair'))
  ) {
    const hand = c.made.score[0] === 6 ? [currentHand(s, c)] : strengthParts(s, c);
    const actual = [
      `你拿 ${f.holeText}，在 ${f.boardText} 上是`,
      ...hand.flatMap((text, index) => (index ? ['，', text] : [text])),
      '，',
      actionLabel(s),
      '。',
    ];
    if (f.investment !== s.amount) actual.push(`本次追加 ${fmt(f.investment)}。`);
    if (
      c.features.ownMade &&
      ['top-pair', 'overpair'].includes(c.handClass) &&
      !reviewedBoundaryCodes.has(r.code)
    )
      actual.push('目前已有成牌，下注的价值来自对手用更弱成牌跟注。');
    if (c.draw.outs > 0 && ['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass))
      actual.push('这次属于半诈唬。', foldWinNote(s));
    const context =
      c.handClass === 'underpair' && f.potRatio >= 1
        ? '投入已达到或超过当前底池，愿意继续的牌更容易包含更强对子或强听牌，不能只用保护对子说明这次大额进攻。'
        : !s.legal.callAmount &&
            f.potRatio < 0.35 &&
            ['underpair', 'middle-pair'].includes(c.handClass)
          ? '小尺度可能让较弱的一对或听牌付费，也可能让高张放弃免费改善，但要看对手是否会这样继续，不能仅凭不是顶对就把这次下注定为诈唬。'
          : '';
    return [...actual, context].filter(Boolean);
  }
  return actionReason(s, r);
}

function explanation(s, r, evKind, suggested, kind) {
  const c = r.context,
    draw = c.draw || r.draw,
    f = spotFacts(s, c),
    hand = c.handLabel,
    cost = fmt(s.legal.callAmount),
    pressure = foldPressure(s);
  if (s.street && c.handClass === 'board')
    return [
      c.matchups?.nut
        ? '当前公共牌已是最大成牌，你的底牌没有提高牌力，对手至多组成相同的五张，当前主要争取平分底池。'
        : '你的最佳五张来自公共牌，底牌没有提高牌力，对手仍可能用底牌组成更大的牌，需要分别考虑落后与平分的机会。',
      s.action === 'raise'
        ? c.matchups?.nut
          ? '对手用相同的公共成牌跟注时也会分池，不能把这次下注当成独占底池的价值下注，额外收益依赖对手放弃相同的成牌。'
          : '对手用同样的公共牌跟注时也会分池，不能把这次下注当成独占底池的价值下注，额外收益需要对手放弃相同或更好的牌。'
        : '继续是否划算，要比较可能分得的底池份额与跟注成本，不能把平分机会算成赢下整个底池。',
      exhaustsStack(s)
        ? '你已投入全部剩余筹码，之后不再参与下注或弃牌决策。'
        : suggested.action === 'call' && s.legal.callAmount >= s.stack
          ? '若按建议跟注，会投入全部剩余筹码，之后不再参与下注或弃牌决策。'
          : '',
    ].filter(Boolean);
  if (r.code === 'weak-late-limp') return [r.reason, waitingNote(s, c)].filter(Boolean);
  if (['unbacked-small-pair-reraise', 'unbacked-pair-reraise'].includes(r.code))
    return [
      r.reason,
      exhaustsStack(s) ? '你已投入全部剩余筹码，之后不再参与下注决策。' : '',
    ].filter(Boolean);
  const suggestedAllInCall =
    s.action === 'fold' && suggested.action === 'call' && s.legal.callAmount >= s.stack;
  if (r.code === 'unbacked-high-card-call' && suggested.action === 'fold')
    return [
      r.reason,
      `按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      exhaustsStack(s) ? '你已投入全部剩余筹码，之后不再参与下注决策。' : '',
      !exhaustsStack(s) && s.street < 3 ? callStreetNote(s, r.metrics.closing) : '',
      c.pendingOthers ? '其余玩家尚可行动，他们是否继续会改变你能争夺的底池和对抗人数。' : '',
    ].filter(Boolean);
  if ((exhaustsStack(s) && s.action === 'call') || suggestedAllInCall) {
    const pocket = s.hole[0].rank === s.hole[1].rank;
    return [
      `按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      suggestedAllInCall
        ? `若继续，建议用剩余 ${fmt(s.stack)} 全下跟注，之后不再参与下注决策。`
        : '你已投入全部剩余筹码，之后不再参与下注决策。',
      s.street < 3 ? '你可以看完剩余公共牌，无需再支付筹码。' : '',
      !s.street && pocket
        ? s.hole[0].rank >= 13
          ? s.hole[0].rank === 14
            ? 'AA 是翻前最强起手牌，能领先所有其他起手牌，牌力足以支持积极争夺底池。'
            : 'KK 是翻前仅次于 AA 的顶级起手牌，领先较小对子和多数高牌，有很强的摊牌竞争力。'
          : '这手对子面对 AK 等未成对高牌有摊牌竞争力，获胜不只依赖补到暗三条，但面对更大对子会明显落后。'
        : c.handClass === 'board'
          ? '你的最佳五张完全来自公共牌，底牌没有提高牌力，这次主要争取平分底池。'
          : s.street && c.draw.outs
            ? [
                c.made.score[0] >= 1 && !['board', 'board-pair'].includes(c.handClass)
                  ? `你已有${hand}，即使未补成听牌，也可能赢过较弱成牌或未成牌的诈唬。`
                  : '听牌是主要改善路径，底牌成对或赢过未成牌诈唬也可能获胜，补牌率不等于全部权益。',
                s.street === 1
                  ? `看完转牌与河牌，至少出现一张当前补牌候选的机会约 ${pct(closedDrawChance(s, c.draw))}，这不是最终获胜概率，补中仍可能落后。`
                  : `当前有${drawLabel(c.draw)}，共 ${c.draw.outs} 张改善候选，下一张补成${drawCompletion(c.draw)}的机会约 ${pct(c.draw.nextChance)}，这不等于全部获胜机会，补中也未必领先。`,
              ]
            : !s.street
              ? preflopPotential(s, '你', true)
              : c.handClass === 'board-pair'
                ? '当前主要靠公共牌上的对子和底牌踢脚争取摊牌，要结合对手的成牌与诈唬范围判断。'
                : '需要结合对手的成牌与诈唬范围，判断你当前牌力的摊牌价值。',
      c.handClass === 'board'
        ? '是否划算取决于能够平分底池的机会与可分得的份额，还要计入对手用底牌组成更大牌的可能。'
        : suggested.action === 'call' && (kind === 'keep' || suggestedAllInCall)
          ? evKind === 'positive'
            ? '按当前对手范围估计，获胜机会能够覆盖跟注成本，这是这次全下跟注值得保留的依据。'
            : '这次全下跟注值得保留的依据是当前价格和摊牌机会，但依赖对手范围中包含足够较弱牌或未成对高牌。'
          : suggested.action === 'fold'
            ? '按当前对手范围估计，这些获胜机会不足以支持这次全下跟注。'
            : '这次全下跟注仍需核对对手的范围，不能只用补牌机会判断是否划算。',
      c.pendingOthers ? '其余玩家尚可行动，他们是否继续会改变你能争夺的底池和对抗人数。' : '',
    ]
      .flat()
      .filter(Boolean);
  }
  if (r.code === 'weak-sb-cold-call')
    return [
      `这笔跟注要补 ${cost}，约占你行动前筹码的 ${pricePct(s.legal.callAmount / Math.max(1, s.stack))}，按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      '你在小盲面对开池者和已有跟注者，翻后通常先行动，不同花弱牌即使击中一对，也可能被更大对子或更好踢脚压住，不能只因为还能改善就肯定跟注。',
      '先减少这笔投入，只有对手愿意用足够较弱牌继续、价格也更有利时，再比较跟注。',
    ];
  if (r.code === 'weak-limper-isolation')
    return [
      '要直接拿走底池，需要已跟注入池的玩家和后面的玩家都弃牌，不能只看盲位是否退出。',
      '不同花散牌被跟注后，成强牌的路径较少，较弱踢脚也难承受持续下注，没有对手明显过度弃牌的公开依据时，先减少投入。',
    ];
  if (r.code === 'dangerous-value-shove') {
    const weaker =
      {
        2: '一对或更小两对',
        3: '一对或两对',
        4: '两对或三条',
        5: '顺子或较低同花',
        6: fullHouseValueTargets(c),
      }[c.made.score[0]] || '较弱成牌';
    return [
      `你仍可能领先${weaker}，但这次拿出 ${fmt(f.investment)}，约为底池的 ${f.potRatio.toFixed(1)} 倍，愿意接下如此大下注的牌往往更强。`,
      '强成牌不代表任何全下尺度都有价值，应比较较小下注能留下哪些较弱跟注牌，不能只凭目前能赢哪些牌，就认定它们也愿意支付整笔全下。',
    ];
  }
  if (r.code === 'flush-board-shove') return [r.reason];
  if (r.code === 'undersized-value-bet')
    return [
      `当前${currentHand(s, c)}有取值潜力，这次只拿出 ${fmt(f.investment)}，约占底池的 ${pricePct(f.potRatio)}。`,
      s.street < 3
        ? '小尺度能留住较弱牌，但也可能少收价值，或让听牌以很低成本继续，应该比较对手是否也愿意支付较大的下注。'
        : '小尺度能留住较弱成牌，但也可能少收价值，应比较它们是否也愿意支付较大的下注，不能只因取值方向合理就肯定这个尺度。',
      '这次保留原下注作为比较基准，较大尺度只有在弱牌仍愿意跟注时才值得尝试，尚未确认它更好。',
    ];
  if (r.code === 'dirty-draw-bet')
    return [
      `当前仍有${drawLabel(draw)}，共 ${draw.outs} 张顺子改善候选，但即使补成顺子，也仍会输给同花，不能把这些牌全当成获胜补牌。`,
      '过牌可以保留下一张改善机会，只有明确能让更好的牌弃掉时，再比较主动施压。',
    ];
  if (c.valuePlan?.kind === 'trap' && s.action === 'call' && evKind !== 'negative')
    return c.valuePlan.reason;
  if (plannedValueShove(s, c) && s.action === 'raise')
    return f.shove
      ? c.valuePlan.reason
      : `当前${hand}有取值潜力，本次较小下注能保留较弱牌跟注，也可能少收价值，是否加大尺度要看它们愿意付出多少。`;
  if (s.street && s.action === 'raise' && c.made?.score[0] >= 3) {
    const weaker = {
      3: '一对或两对',
      4: '两对或三条',
      5: c.matchups?.weakerMadeCategories?.includes(4) ? '更低同花或顺子' : '更低同花',
      6: fullHouseValueTargets(c),
      7: '葫芦或更弱成牌',
      8: '较弱成牌',
    }[c.made.score[0]];
    return [
      `你当前的${currentHand(s, c)}仍能领先${weaker}，下注的价值来自这些较弱牌愿意跟注，而不是只看自己已经成牌。`,
      f.potRatio > 1.25
        ? '这次投入明显超过底池，需要比较较小下注能否留下更多弱牌，当前牌型本身不能证明这个大尺度划算。'
        : s.legal.canCheck
          ? '若这些较弱牌很少愿意继续，就应比较更小下注或过牌，不把取值当作必然收益。'
          : s.amount > s.legal.minRaiseTo
            ? '若这些较弱牌很少愿意继续，就应比较较小的合法加注或跟注，不把取值当作必然收益。'
            : '若这些较弱牌很少愿意继续，就应比较跟注，不把最小加注的取值当作必然收益。',
    ];
  }
  if (r.code === 'pressure-bet' && s.action === 'raise' && suggested.action === 'call')
    return [
      `你已有${hand}，跟注只需 ${cost}，按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      '在当前两种对手范围假设下，已有成牌与较低价格支持先比较跟注，保留摊牌机会，避免把边缘成牌变成只让更强牌继续的大加注。',
      '对手范围更紧或后续价格改变时要重新判断，这并不是完整后续打法的盈利证明。',
    ];
  if (r.code === 'positioned-entry' && c.positionedEntry?.eligible) {
    const entry = c.positionedEntry;
    if (exhaustsStack(s))
      return [
        ...preflopPotential(s),
        `这些潜力可以支持先考虑${actionLabel(s, 'call', s.legal.callAmount)}，不能单独证明把全部 ${fmt(s.stack)} 推出去划算。`,
        '你实际已经全下，之后不再有控制投入或弃牌的选择，这笔进攻需要对手有足够的弃牌空间。',
      ];
    return [
      ...preflopPotential(s),
      `这笔跟注约占你行动前筹码的 ${(entry.stackRatio * 100).toFixed(1)}%，与你已入池对手的有效筹码至少约 ${entry.depthBB.toFixed(0)} BB，较低成本和较深筹码为成强牌后的收益留下空间。`,
      suggested.action === 'fold'
        ? '这些翻后潜力不能保证跟注盈利，当前两种范围下的后续模拟更支持停止投入。'
        : s.action === 'call'
          ? '你在翻后有位置，可以先看对手行动，再决定控池、取值或带听牌施压。'
          : '若按建议跟注，翻后可以先看对手行动，再决定控池、取值或带听牌施压。',
      entry.raiseTo && suggested.action !== 'fold'
        ? `若${entry.callers ? '开池者范围较宽、平跟者有足够弃牌空间' : '开池者范围较宽且有足够弃牌空间'}，也可以考虑${actionLabel(s, 'raise', entry.raiseTo)}，争取直接拿池，对手较紧或不愿弃牌时优先跟注。`
        : '',
      entry.raiseTo && suggested.action !== 'fold'
        ? '再加注只是取得主动权，不代表天然拥有范围优势，翻后仍要结合公共牌和对手的继续范围判断。'
        : '',
      entry.shape === 'small-pair'
        ? '小对子已有摊牌机会，翻牌击中暗三条后可以争取更多价值。'
        : entry.shape === 'connector' || entry.shape === 'one-gap'
          ? '击中两对、三条、顺子或同花后可以争取价值，形成听牌时仍需比较价格，较低同花也可能输给更高同花。'
          : '',
      '底牌没有改善且面对不利下注时弃牌，若能免费过牌则保留机会，不必机械退出。',
      entry.waiting ? '身后的盲位仍可能再加注，遇到新压力后要按新的价格重新判断。' : '',
    ].filter(Boolean);
  }
  if (s.action === 'raise' && heavyPreflopPressure(s, c)) return preflopPotential(s);
  if (s.street === 0 && s.action === 'raise' && c.tier === 0) {
    const high = Math.max(...(s.hole || []).map((card) => card.rank));
    if (kind === 'keep')
      return [
        ...preflopPotential(s),
        pressure.hasAllInOpponent
          ? '这次进攻是否划算，还要比较投入尺度、仍有筹码的对手愿意弃牌的频率，以及剩余摊牌机会。'
          : '这次进攻保留的是主动争取对手弃牌、直接拿走底池的思路，能否划算取决于投入尺度和对手愿意弃牌的频率。',
        exhaustsStack(s)
          ? '被强牌跟注后，这手牌的摊牌能力偏弱，之后已没有继续下注或弃牌的选择。'
          : high >= 13
            ? '手里的 A 或 K 能减少部分对手强高张组合，但被更大对子或更好踢脚的牌跟注时，仍要控制后续投入。'
            : '被较高对子或强高张跟注后，这手牌的摊牌能力偏弱，翻后应按实际击中情况决定是否继续。',
      ];
    return high < 13
      ? `${hand}不是对子，也没有 A 或 K 阻断部分强牌组合，${f.lastAggression ? '面对 ' + fmt(s.currentBet) + ' 的下注，' : '在前面无人开池时主动进攻，'}被较高对子或强高张跟注后，不能只靠${s.hole[0].suit === s.hole[1].suit ? '同花潜力' : '偶尔补成两对或三条'}支撑这笔 ${fmt(c.extra)} 的投入。`
      : `${hand}有 A 或 K，可以减少对手持有部分强高张组合的可能，但这次投入 ${fmt(c.extra)} 后，若对手用更大对子或更好踢脚的高牌继续，你仍会处于不利位置。`;
  }
  if (s.action === 'call' && draw.outs) {
    const high = Math.max(...s.board.map((card) => card.rank)),
      overcards = s.hole
        .filter((card) => card.rank > high)
        .map((card) => rankText(card.rank))
        .join(' / '),
      otherChances =
        c.made.score[0] >= 1 && !['board', 'board-pair'].includes(c.handClass)
          ? `你已有${hand}，当前成牌的摊牌价值是继续的基础，同时还有${drawLabel(draw)}，即使没有补成听牌，也可能赢过较弱成牌或未成牌的诈唬。`
          : overcards
            ? `${overcards} 落下时，你有机会补成顶对，但这些牌也不能全部算成必胜补牌。`
            : ['board', 'board-pair'].includes(c.handClass)
              ? '主要牌型来自公共牌，你还没有自己的对子，未补中时要靠踢脚与对手的较弱牌争取摊牌。'
              : '你目前仍只有高牌，未补中时主要能赢未成牌的诈唬。',
      supported =
        evKind === 'positive' || r.metrics.equityLow - r.metrics.uncertainty > r.metrics.required,
      verdict =
        suggested.action === 'fold'
          ? '结合当前对手范围，这些获胜机会仍不足以支持这笔跟注。'
          : supported
            ? '综合当前牌力、补牌机会和对手可能的诈唬，跟注有继续依据，不能只用补成听牌的概率判断。'
            : kind === 'keep'
              ? '这次跟注保留了补牌与摊牌机会，值得保留的前提是对手有足够较弱牌或诈唬，面对更紧的范围应弃牌。'
              : draw.nextChance >= r.metrics.required
                ? '补牌机会能支持比较这次跟注，但仍要排除补中后会输的情况。'
                : '仅凭这些补牌还不能确认跟注划算，需要重新比较跟注与弃牌。';
    return [
      `按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      otherChances,
      `当前有${drawLabel(draw)}，共 ${draw.outs} 张直接成牌候选，下一张补成${drawCompletion(draw)}的机会约 ${pct(draw.nextChance)}，这不等于你的全部获胜机会。`,
      draw.straightRanks?.length
        ? `${draw.straightRanks.map(rankText).join(' / ')} 可补顺子，补中也未必获胜。`
        : '',
      verdict,
      callStreetNote(s, r.metrics.closing),
    ];
  }
  if (s.street === 0 && s.action === 'call' && suggested.action === 'fold') {
    const [high, low] = s.hole.map((card) => card.rank).sort((a, b) => b - a);
    const suited = s.hole[0].suit === s.hole[1].suit;
    return [
      ...preflopPotential(s),
      s.currentBet > bigBlindOf(s)
        ? `你这次面对加到 ${fmt(s.currentBet)}（${(s.currentBet / bigBlindOf(s)).toFixed(1)} BB）的下注。`
        : '前面没有加注，这次是在跟大盲入池。',
      `按当前可争夺底池计算，需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      high === low
        ? high >= 13
          ? 'AA、KK 属于顶级起手牌，已有很强的摊牌竞争力，继续的依据是领先较小对子和多数高牌，不能只当作追暗三条的牌。'
          : '这手对子遇到更大对子明显落后，如果主要靠翻牌中暗三条获利，还要有合适的跟注价格和成牌后的可赢筹码。'
        : high <= 8
          ? '你即使击中一对，点数仍偏低，较难靠这一对打到摊牌。'
          : '你即使击中一对，也要留意更大对子或更好踢脚的压制。',
      suited && high < 14 ? '你补成同花时，也可能遇到更高同花。' : '',
      waitingNote(s, c),
      r.metrics.closing
        ? '这次跟注后已没有后续下注，不能靠成牌后再赢筹码弥补成本。'
        : '这个比例只是当前底池的保本门槛，后续下注和成牌后的收益还要另算。',
      !r.metrics.closing && high - low === 1
        ? '若跟注价格更低、翻后有位置且成牌后能赢到足够筹码，同花或点数相连的潜力仍可支持继续，不能把连接牌一律当成弃牌。'
        : '',
    ].filter(Boolean);
  }
  if (s.action === 'call' && c.handClass === 'board')
    return [
      '你的最佳五张完全来自公共牌，底牌没有提供额外优势，跟注主要争取平分底池，要判断对手能否用底牌组成更大的牌。',
      '是否划算要按可能分得的底池份额与跟注成本比较，不能把平分机会算成独赢整个底池。',
      r.metrics.closing ? '这次跟注后已没有后续下注，只按当前摊牌机会判断。' : '',
    ].filter(Boolean);
  if (s.action === 'call' && r.metrics.closing)
    return [
      '这次跟注后已没有后续下注，继续的依据是当前牌力对这条下注范围的摊牌机会。',
      `需要至少 ${pricePct(r.metrics.required)} 的胜率，风险和收益才能持平。`,
      evKind === 'negative'
        ? '按当前范围估计，获胜机会不足以覆盖成本，建议保住剩余筹码。'
        : riverRangeReason(s, c) ||
          (evKind === 'positive'
            ? '这次跟注依赖对手范围里有足够较弱牌或诈唬；若主要是更强成牌，即使价格不高也应弃牌。'
            : '这次跟注保留了摊牌机会，前提是对手有足够较弱牌或诈唬，面对更紧的范围应弃牌。'),
    ];
  if (s.action === 'check' && s.street > 0 && c.made && c.texture && suggested.action === 'raise')
    return [
      `过牌可以保留${currentHand(s, c)}的摊牌机会，但也可能少收较弱成牌的跟注。`,
      ...checkRisks(s, c),
      checkRisks(s, c).length
        ? '这些风险不等于必须放弃取值，若仍有较弱成牌愿意跟注，可以比较主动下注，尺度要给它们留下继续空间。'
        : '若仍有较弱成牌愿意跟注，可以比较主动下注，尺度要给它们留下继续空间。',
    ];
  if (s.action === 'check' && s.street > 0 && c.made && c.texture && c.handClass !== 'board')
    return checkReasoning(s, c, { closingExplained: s.street === 3 && r.metrics.closing });
  if (s.action === 'check' && r.code === 'value-check')
    return s.street === 3 && r.metrics.closing
      ? '这次过牌已经不能诱导后面的下注，需要比较主动下注能否让较弱成牌付费。'
      : c.pendingOthers > 0
        ? `你已有${hand}，过牌可以观察后面玩家是否下注，但他们也过牌时，可能少收一轮价值。`
        : '你是本轮最后行动者，过牌会结束本轮下注，需要比较免费观察下一张与主动让较弱牌付费。';
  if (s.action === 'check' && c.handClass === 'board')
    return '过牌保留平分底池的机会，避免把公共牌成牌误当成独占底池的价值。';
  if (s.street === 0 && ['call', 'fold'].includes(s.action) && suggested.action === 'call')
    return [
      ...preflopPotential(s),
      s.action === 'fold'
        ? `若按建议跟注，行动后还留有 ${fmt(s.stack - s.legal.callAmount)} 筹码。`
        : `这次跟注后还留有 ${fmt(s.stack - s.legal.callAmount)} 筹码。`,
      s.hole.every((card) => card.rank === 14)
        ? 'AA 翻前领先其他起手牌，已有很强的摊牌竞争力，继续并非只为了追暗三条。'
        : s.hole.every((card) => card.rank === 13)
          ? 'KK 是仅次于 AA 的顶级起手牌，已有很强的摊牌竞争力，仍需核对对手范围与价格。'
          : '',
      c.preflopRaises >= 2 && r.context.tier >= 2
        ? '面对多次加注，起手牌较强不代表可以自动跟注，只有对手包含足够较弱牌或未成对高牌、价格也合适时才有继续依据。'
        : r.context.tier < 2
          ? '这条跟注路线的依据是当前价格下保留改善与摊牌机会，仍依赖对手范围较宽，底牌未改善时弃牌。'
          : '这手起手牌已有较强的摊牌竞争力，跟注可保留对手较弱牌，同时按后续公共牌调整。',
      r.metrics.closing
        ? '跟注后没有后续下注，继续的依据是这手牌对当前范围的摊牌机会。'
        : c.inPosition
          ? '你在翻后有位置，可以先观察对手行动，再决定是否继续投入。'
          : '你在翻后通常先行动，需要根据实际击中的牌面决定过牌、取值或退出。',
    ];
  if (s.action === 'fold' && !s.legal.canCheck && s.street === 0 && f.lastAggression) {
    const handRisk = s.hole.every((card) => card.rank === 14)
      ? 'AA 翻前领先其他起手牌，面对加注仍有很强的继续依据'
      : s.hole.every((card) => card.rank === 13)
        ? 'KK 是翻前仅次于 AA 的顶级起手牌，领先较小对子和多数高牌，本身的强度足以支持积极争夺底池'
        : s.hole[0].rank === s.hole[1].rank
          ? '这手对子遇到更大对子明显落后，如果主要靠翻牌中暗三条获利，还要有合适的跟注价格和成牌后的可赢筹码'
          : s.hole.some((card) => card.rank === 14) && s.hole.some((card) => card.rank === 13)
            ? 'AK 击中 A 或 K 时有顶对顶踢脚潜力，未击中时仍需结合价格和对手范围判断'
            : Math.max(...s.hole.map((card) => card.rank)) >= 11
              ? '这组高牌即使击中一对，也可能被大对子或更好踢脚压制'
              : '这两张低牌不是对子或强高牌，击中一对后点数仍偏低';
    const keep = suggested.action === 'fold';
    const suitedConnector =
      s.hole[0].suit === s.hole[1].suit && Math.abs(s.hole[0].rank - s.hole[1].rank) === 1;
    return [
      ...(suitedConnector ? preflopPotential(s) : [handRisk + '。']),
      suitedConnector &&
      Math.max(...s.hole.map((card) => card.rank)) >= 11 &&
      Math.max(...s.hole.map((card) => card.rank)) <= 13
        ? handRisk + '。'
        : '',
      suitedConnector
        ? `当前面对加注至 ${fmt(s.currentBet)}，约 ${(s.currentBet / bigBlindOf(s)).toFixed(1)} BB，需要结合尺度和有效筹码判断，不能只凭连接与同花潜力继续。`
        : '',
      `继续需要再补 ${cost}，${keep ? '这次弃牌可以保留，保住剩下的 ' + fmt(s.stack) + '，不再承担这笔投入' : '应结合对手愿意用哪些较弱牌继续，再决定是否接下这笔投入'}。`,
      suitedConnector ? waitingNote(s, c) : '',
    ].filter(Boolean);
  }
  if (s.action === 'fold' && !s.legal.canCheck && s.street === 0)
    return [
      ...preflopPotential(s),
      '前面还没有对手加注，当前是在决定是否跟大盲入池。',
      c.tier >= 2
        ? '这手起手牌有较强竞争力，可以比较主动加注与跟注，不必自动放弃。'
        : s.hole[0].rank === s.hole[1].rank
          ? '这手小对子已有摊牌机会，也能争取翻牌击中暗三条，需要结合位置、跟注价格、有效筹码和后面的再加注风险判断。'
          : '这手起手牌击中一对后仍可能偏弱，需要结合位置、跟注价格和后面的待行动玩家判断，不能只因为便宜就入池。',
    ];
  if (s.action === 'fold' && !s.legal.canCheck)
    return draw.outs
      ? [`跟注需要至少约 ${pricePct(r.metrics.required)} 的胜率。`, ...drawFoldReasons(s, c)]
      : `跟注需要至少约 ${pricePct(r.metrics.required)} 的胜率。当前牌力能否达到这个要求，取决于对手这条下注线包含多少更强成牌和诈唬。`;
  if (s.action === 'call' && s.street > 0)
    return [
      c.handClass === 'board-pair'
        ? '主要牌型来自公共牌，底牌提供的踢脚和对手可能的诈唬，是判断这次跟注的重点。'
        : c.made.score[0] === 0
          ? '当前只有高牌，跟注主要是在判断对手是否有足够未成牌的诈唬。'
          : '当前成牌能争取赢过较弱成牌和未成牌的诈唬，需要与对手这条下注线一起判断。',
      evKind === 'positive' || r.metrics.equityLow - r.metrics.uncertainty > r.metrics.required
        ? '按当前范围估计，已有牌力与价格支持继续争夺底池，这是这次跟注值得保留的依据。'
        : '这次跟注保留了摊牌机会，前提是对手愿意用足够较弱牌或诈唬下注，面对更紧的范围应弃牌。',
    ];
  return '';
}

function practiceFocus(s, r, action) {
  const c = r.context,
    f = spotFacts(s, c),
    suggestion = actionLabel(s, action.action, action.amount),
    actual = actionLabel(s),
    draw = c.draw || r.draw;
  const comparison =
    action.action === 'call'
      ? `先比较跟注 ${fmt(s.legal.callAmount)} 与弃牌`
      : action.action === 'fold' && s.legal.callAmount > 0
        ? `先比较弃牌与再补 ${fmt(s.legal.callAmount)} 跟注`
        : `重点比较${suggestion}与本次投入的尺度`;
  if (s.street && c.handClass === 'board')
    return `重打 ${f.boardText} 这手时，先看 ${f.holeText || c.handLabel} 是否提高了公共牌，本次没有提高，平分机会不能算成独占底池。${c.matchups?.nut ? '公共牌已是最大成牌，对手不能组成更大的牌，重点比较分池份额与跟注成本。' : '对手仍可能用底牌提高公共牌，需要同时判断落后与平分的机会。'}${exhaustsStack(s) ? '你已全下，之后不再参与下注或弃牌决策。' : ''}`;
  if (s.action === 'raise' && !exhaustsStack(s) && s.players && coversOpponentStacks(s, s.amount))
    return `重打 ${f.holeText} 这手，${comparison}。本次实际下注已覆盖所有未弃牌对手的剩余筹码，他们即使全部跟注，也没有更多筹码继续加注或后街下注，应在投入前核对价格与继续范围。`;
  if (exhaustsStack(s))
    return r.code === 'dangerous-value-shove'
      ? `重打 ${f.holeText} 这手，先对照本次全下与${suggestion}，重点比较较小下注能否收到更多弱牌跟注，不能只凭强成牌支持整笔全下。你实际全下后已没有继续下注或弃牌的选择。`
      : `重打 ${f.holeText} 这手，重点比较全下前的价格、对手范围与${suggestion}，全下后已没有继续下注或弃牌的选择。`;
  if (s.legal.callAmount >= s.stack && s.stack > 0 && !s.legal.canCheck)
    return `重打 ${f.holeText} 这手，先比较${suggestion}与${action.action === 'call' ? '弃牌' : '全下跟注 ' + fmt(s.stack)}。若改为跟注，会投入全部剩余 ${fmt(s.stack)}，之后不再参与下注或弃牌决策，其他玩家的后续加注不需要你再补筹码。`;
  if (s.legal.isShortAllin && f.shove)
    return `本次全下至 ${fmt(s.amount)} 是短全下，不一定重开其他人的加注权，重打这手先比较${suggestion}，不能选超过 ${fmt(s.legal.maxRaiseTo)} 的普通加注。`;
  if (r.code === 'positioned-entry')
    return c.positionedEntry.raiseTo
      ? `重打 ${f.holeText} 这手，先比较跟注 ${fmt(s.legal.callAmount)} 与有条件的${actionLabel(s, 'raise', c.positionedEntry.raiseTo)}，记录对手是否愿意弃牌，以及被跟注后的位置和成牌机会，不能只凭主动权持续诈唬。`
      : `重打 ${f.holeText} 这手，比较跟注 ${fmt(s.legal.callAmount)} 与弃牌，重点看有效筹码、身后再加注风险与翻后能否实现底牌潜力。`;
  if (plannedValueShove(s, c) && action.action === 'raise' && action.amount === s.legal.maxRaiseTo)
    return s.street === 3 && c.matchups?.nut
      ? `重打 ${f.holeText} 这手，比较${suggestion}与较小尺度：当前已是河牌最大成牌，重点核对弱牌是否愿意支付全下，以及较小尺度能否收到更多跟注，不能仅凭坚果牌认定全下最优。`
      : !s.street && s.hole.every((card) => card.rank === 14)
        ? `重打 ${f.holeText} 这手，先比较${suggestion}：AA 是翻前最强起手牌，重点核对对手会用哪些较弱牌付费，以及这次全下尺度是否合适。`
        : `重打 ${f.holeText} 这手，先比较${suggestion}：底池 ${fmt(s.pot)}，你还剩 ${fmt(s.stack)}。${s.street ? '当前成牌' : '这手强起手牌'}与筹码深度支持比较价值全下，但仍要留意更大的牌组。`;
  if (c.valuePlan?.kind === 'trap' && s.action === 'call')
    return `重打 ${f.holeText} 这手，平跟 ${fmt(s.legal.callAmount)} 是保留弱牌和诈唬的埋牌路线，对照${suggestion}，再看主动加注是否会赶走本来愿意继续的弱牌。`;
  if (s.street === 0 && s.action === 'raise' && c.tier === 0 && f.shove && f.potRatio > 4)
    return `重打这手 ${f.holeText}，优先选择${suggestion}。本次投入 ${fmt(c.extra)}，底池只有 ${fmt(s.pot)}，且还有 ${c.opponents} 位对手未弃牌，这手弱起手牌不适合只为抢小底池就全下。`;
  const cautiousReraise = ['unbacked-small-pair-reraise', 'unbacked-pair-reraise'].includes(r.code);
  if (!s.street && s.action === 'raise' && heavyPreflopPressure(s, c))
    return `重打 ${f.holeText} 这手，面对已有多次再加注，${comparison}。${preflopPressureFocus(s, c)}不要只为自己已经投入的筹码继续扩大底池。`;
  if (s.street === 0 && s.action === 'raise' && !cautiousReraise) {
    const facing = f.lastAggression
        ? `面对${f.lastAggression.name}的${f.lastAggression.label}`
        : '前面无人开池',
      hasCaller = s.history.some((a) => a.street === 0 && a.id !== 0 && a.action === 'call');
    if (c.tier >= 2)
      return `重打 ${f.holeText} 这手，${facing}，优先比较${suggestion}。底池 ${fmt(s.pot)}，本次拿出 ${fmt(c.extra)}，试着让较弱对子或高牌愿意跟注，让这手强起手牌收取价值。`;
    const entry = hasCaller ? `${facing}，此前也有其他玩家跟注入池` : facing;
    return `重打 ${f.holeText} 这手，${entry}，优先比较${suggestion}，核对这次为 ${fmt(s.pot)} 的底池拿出 ${fmt(c.extra)}，能否争取足够弃牌或让较弱牌付费。${s.hole[0].rank === s.hole[1].rank ? '这手小对子未中暗三条时，面对高张牌面和持续下注不容易继续。' : Math.max(...s.hole.map((card) => card.rank)) >= 11 ? '这组高牌击中一对后，仍要提防更好的踢脚和大对子。' : '这组低张击中一对时点数仍偏低，面对大对子或强高张继续容易落后。'}`;
  }
  if (s.action === 'raise' && !cautiousReraise) {
    const redraw = c.made ? madeRedrawReasoning(s, c).join('') : '';
    const focus =
      r.code === 'undersized-value-bet'
        ? '小下注可能少收弱牌价值，也可能让听牌便宜继续，比较较大尺度是否仍有弱牌愿意支付。'
        : c.draw.outs
          ? '被跟注后还可以补牌，但补中也未必领先，若对手再加注，要重新比较这笔投入与听牌机会。'
          : redraw
            ? redraw + '这些改善机会不能单独支持为当前底池投入过多后手。'
            : ['pressure-bet', 'large-unbacked-bet', 'dirty-draw-bet'].includes(r.code)
              ? '当前没有直接顺子或同花听牌托底，别为争夺这个底池投入过多后手。'
              : '已有成牌时，比较较小与较大尺度能收到多少弱牌跟注，既避免少收价值，也避免大加注只留下更强的牌。';
    return `重打 ${f.holeText || c.handLabel} 这手，${same(action, { action: s.action, amount: s.amount }) ? '核对' + actual + '的依据' : '先对照' + actual + '与' + suggestion}：底池 ${fmt(s.pot)}，你原本还有 ${fmt(s.stack)}，这次拿出 ${fmt(c.extra)}。${focus}`;
  }
  if (s.action === 'check' && c.handClass === 'board')
    return `重打 ${f.boardText} 这手时，先看 ${f.holeText || c.handLabel} 是否提高了公共牌，本次没有提高，平分机会不能算成独占底池。`;
  if (s.action === 'check') {
    const focus =
      action.action === 'raise'
        ? '重点比较哪些较弱成牌愿意跟注，以及这个下注尺度是否会把它们赶走。'
        : s.street === 3 && r.metrics.closing
          ? c.made?.score[0] === 0 ||
            ['board', 'board-pair', 'underpair', 'middle-pair'].includes(c.handClass)
            ? '本次河牌最后行动，过牌直接摊牌，不必为了获池机会再拿边缘牌额外投入。'
            : '本次河牌最后行动，比较的是免费摊牌与让弱牌付费。'
          : c.pendingOthers > 0
            ? '观察后面玩家是否下注，按金额、人数与公开行动判断是否继续，过牌不保证本轮免费。'
            : '本轮过牌可以免费见下一张，下一街再根据新公共牌和下注决定是否继续。';
    return `重打 ${f.holeText || c.handLabel} 这手，${action.action === 'check' ? '核对免费过牌的依据' : '对照免费过牌与' + suggestion}。${focus}`;
  }
  if (s.action === 'fold' && s.legal.canCheck)
    return `这手 ${f.holeText || c.handLabel} 的跟注成本为 0，重打时先选择过牌，保留免费机会。`;
  if (draw.outs && r.metrics.closing && s.street === 1)
    return `重打 ${f.holeText || c.handLabel} 这手，比较补 ${fmt(s.legal.callAmount)} 所需的 ${pct(r.metrics.required)} 胜率与${suggestion}。若跟注，就能看完转牌和河牌，${draw.outs} 张只是下一张的改善候选，不能拿下一张概率直接代替最终获胜机会。`;
  const facing =
    !s.street && !c.preflopRaises
      ? `当前大盲为 ${fmt(s.currentBet)}`
      : `面对当前 ${fmt(s.currentBet)} 的下注`;
  return draw.outs
    ? `重打 ${f.holeText || c.handLabel} 这手，先对照 ${draw.outs} 张改善候选、下一张约 ${pct(draw.nextChance)}，和再补 ${fmt(s.legal.callAmount)} 所需的 ${pct(r.metrics.required)} 胜率，再比较${suggestion}。${r.metrics.closing ? '若跟注，之后已没有后续下注，不能靠成牌后再取值补足价格。' : '这笔跟注要综合当前摊牌机会与下一张改善，再与价格比较，后续新增下注成本另算。'}`
    : `重打 ${f.holeText || c.handLabel} 这手，${facing}，先比较${suggestion}与${action.action === 'call' ? '弃牌' : '再补 ' + fmt(s.legal.callAmount)}。${s.action === 'fold' ? '若改为跟注，' : ''}${callingPlan(s, c, r.metrics.closing)}`;
}

// Decision quality depends only on this before-action snapshot and its analysis.
export function coachDecision(s, r) {
  const guaranteed = guaranteedBoardCoaching(s, r);
  if (guaranteed) return guaranteed;
  const actual = { action: s.action, amount: s.amount },
    sim = r.simulation;
  const actualRow = sim?.rows.find((row) => same(row.action, actual));
  const threshold = Math.max(0.2 * bigBlindOf(s), s.pot * 0.01);
  const candidates = sim?.comparisonReady
    ? sim.rows.filter(
        (row) =>
          !same(row.action, actual) &&
          row.scenarios.every((v) => v.vsActual?.informative && v.vsActual.lower > threshold),
      )
    : [];
  candidates.sort(
    (a, b) =>
      Math.min(...b.scenarios.map((v) => v.vsActual.lower)) -
      Math.min(...a.scenarios.map((v) => v.vsActual.lower)),
  );
  const improved = candidates[0],
    fold = sim?.rows.find((row) => row.action.action === 'fold');
  let evKind = 'uncertain',
    evText = '当前信息不足以确认这一步长期赚或亏。';
  if (s.action === 'call' && r.metrics.closing) {
    const guard = r.metrics.uncertainty * r.metrics.contestable;
    if ([r.metrics.randomEV, r.metrics.weightedEV].every((ev) => ev + guard < -threshold)) {
      evKind = 'negative';
      evText = '按这两种对手范围估计，这次跟注长期会亏筹码。';
    } else if ([r.metrics.randomEV, r.metrics.weightedEV].every((ev) => ev - guard > threshold)) {
      evKind = 'positive';
      evText = '按这两种对手范围估计，这次跟注有正收益，单次输牌不代表应该弃牌。';
    }
  } else if (sim?.comparisonReady && fold && s.action !== 'fold') {
    if (fold.scenarios.every((v) => v.vsActual.informative && v.vsActual.lower > threshold)) {
      evKind = 'negative';
      evText = '两种模拟范围下，这次继续投入都不如弃牌，属于当前模型下的负收益风险。';
    } else if (
      fold.scenarios.every((v) => v.vsActual.informative && v.vsActual.upper < -threshold)
    ) {
      evKind = 'positive';
      evText = '两种模拟范围下，这条路线都比弃牌收益更高，但仍依赖后续打法。';
    }
  }
  const freeFold = r.code === 'free-fold';
  const confirmed = freeFold || evKind === 'negative' || !!improved;
  // A draw alone below the price does not justify a positive label by default.
  // Use full public-range estimates as well as the next-card draw chance,
  // including closing flop calls that get to see two more cards.
  const unprovenDraw =
    s.action === 'call' &&
    r.draw.outs > 0 &&
    r.draw.nextChance < r.metrics.required &&
    r.context.made?.score[0] === 0 &&
    evKind !== 'positive' &&
    r.metrics.equityLow - r.metrics.uncertainty <= r.metrics.required;
  const supported =
    !confirmed &&
    !unprovenDraw &&
    !reviewedBoundaryCodes.has(r.code) &&
    (r.status === 'sound' || evKind === 'positive');
  let action = freeFold
    ? { action: 'check', amount: 0 }
    : improved?.action ||
      (evKind === 'negative' ? { action: 'fold', amount: 0 } : r.routes.primary);
  if (supported && !valueCodes.has(r.code)) action = actual;
  const unchanged = same(action, actual);
  const noFurtherDecision =
    exhaustsStack(s) ||
    s.action === 'fold' ||
    (s.action === 'raise' && s.amount === s.legal.maxRaiseTo) ||
    (r.metrics.closing && ['call', 'check'].includes(s.action));
  const kind = confirmed
    ? improved && evKind === 'positive'
      ? 'value'
      : 'improve'
    : valueCodes.has(r.code)
      ? 'value'
      : supported
        ? 'keep'
        : 'compare';
  const reason = explanation(s, r, evKind, action, kind);
  const reasonParts = Array.isArray(reason) ? reason : [reason].filter(Boolean);
  let followUp = practiceFocus(s, r, action),
    conciseReason = reasonParts.join(''),
    paragraphs = [conciseReason].filter(Boolean),
    paragraphParts;
  if (s.hole && s.board && r.context.texture) {
    const f = spotFacts(s, r.context),
      facts = situationNotes(s, r.context),
      continuation = continuationNote(s, r.context, r.metrics.closing);
    let recommendation = '';
    if (kind !== 'keep') {
      const suggested = actionLabel(s, action.action, action.amount);
      recommendation =
        unprovenDraw && !confirmed
          ? '这手需要比较跟注与弃牌，关键是对手的下注范围里有多少未成牌的诈唬，不能只因有听牌就保留跟注。'
          : action.action === 'fold'
            ? `这手建议弃牌，保住行动前剩下的 ${fmt(s.stack)}，不再付出筹码。`
            : action.action === 'raise'
              ? `这手建议${suggested}，额外投入 ${fmt(action.amount - s.bet)}，${r.context.valuePlan?.primary?.action === 'raise' ? (s.street ? '让较弱成牌付费，并控制这次投入的尺度' : '让较弱起手牌付费，并控制这次投入的尺度') : r.context.draw.outs ? (foldPressure(s).hasAllInOpponent ? '保留补牌机会，施压对象限于仍有筹码的对手' : '保留补牌机会，同时给对手弃牌的压力') : ['pressure-bet', 'large-unbacked-bet'].includes(r.code) || (!s.street && r.context.tier < 2) ? (foldPressure(s).hasAllInOpponent ? '这次只能争取仍有筹码的对手弃牌，要控制为这个底池付出的后手' : '这次主要争取对手弃牌，要控制为这个底池付出的后手') : s.street ? '让较弱成牌付费，并控制这次投入的尺度' : '让较弱起手牌付费，并控制这次投入的尺度'}。`
              : action.action === 'check'
                ? `这手建议直接过牌，不必下注，${r.context.handClass === 'board' ? '你的底牌没有提高公共牌，先保留平分底池的机会' : '先保留 ' + fmt(s.stack) + ' 后手，不主动放大 ' + fmt(s.pot) + ' 的底池'}。`
                : s.legal.callAmount >= s.stack
                  ? s.action === 'fold'
                    ? ''
                    : '这手保留全下跟注，依据是当前价格下的摊牌机会。'
                  : s.street === 3
                    ? '这手建议跟注，依据是当前牌力对这条下注范围的摊牌机会。'
                    : r.code === 'positioned-entry'
                      ? `这手建议${suggested}，先用较小成本保留翻后位置和改善机会。`
                      : '这手建议跟注，保留当前牌力和改善后的获池机会。';
    }
    const completedFlush = flushCompletionNote(s, r.context);
    const risks = checkRisks(s, r.context);
    if (completedFlush) risks.shift(); // The specific turn fact replaces the generic flush clause.
    if (completedFlush && !reasonParts.includes(completedFlush))
      reasonParts.unshift(completedFlush);
    const publicAdditions =
      s.street && s.action !== 'check'
        ? [
            completedFlush,
            ...risks,
            ...madeRedrawReasoning(s, r.context),
            r.code !== 'flush-board-shove' && action.action === 'raise'
              ? valueDrawNote(s, r.context)
              : '',
          ].filter(Boolean)
        : [];
    for (const clause of publicAdditions)
      if (clause && !reasonParts.includes(clause)) reasonParts.push(clause);
    const matchup = r.context.matchups?.text,
      supporting =
        plannedValueShove(s, r.context) &&
        s.action === 'raise' &&
        f.shove &&
        !reviewedBoundaryCodes.has(r.code) &&
        !(s.street && r.context.made.score[0] >= 3)
          ? publicAdditions
          : reasonParts.length
            ? reasonParts
            : [continuation].filter(Boolean);
    // Keep translatable clauses separate while rendering one visual paragraph.
    paragraphParts = [
      [matchup],
      ['复盘分析总结'],
      ...(r.context.matchups?.rangeNotes || []).map(rangeNoteClauses),
      [
        ...[actualActionReason(s, r)].flat(),
        s.street > 0 && !exhaustsStack(s) && f.lastAggression?.street === s.street ? facts[0] : '',
        ...supporting,
        recommendation,
      ].filter(Boolean),
    ].filter((parts) => parts[0]);
    if (!recommendation && continuation && !supporting.includes(continuation))
      paragraphParts.at(-1).push(continuation);
    if (f.allOpponentsAllIn && !paragraphParts.flat().some((p) => p.includes('没有后手')))
      paragraphParts.at(-1).push(facts.find((p) => p.includes('没有后手')));
    paragraphs = paragraphParts.map((parts) => parts.join(''));
    conciseReason = paragraphs.join('');
  } else if (!conciseReason) {
    conciseReason = `你在 ${s.position} 拿 ${r.context.handLabel}，实际选择${actionLabel(s)}，当时底池 ${fmt(s.pot)}，这次实际付出 ${fmt(r.context.extra)}。`;
    paragraphs = [conciseReason];
  }
  return {
    kind,
    recommendedAction: { ...action },
    label:
      kind === 'keep'
        ? '值得保留'
        : kind === 'compare' && unprovenDraw
          ? '需要比较'
          : actionLabel(s, action.action, action.amount),
    explanation: conciseReason,
    paragraphs,
    paragraphParts: paragraphParts || paragraphs.map((text) => [text]),
    suggestedAction: actionLabel(s, action.action, action.amount),
    suggestion:
      unprovenDraw && !confirmed
        ? '需要比较'
        : unchanged
          ? s.street === 3 || noFurtherDecision
            ? '保留这步，未确认更好的选择'
            : '保留这步，重点调整后续打法'
          : actionLabel(s, action.action, action.amount),
    followUp,
    evKind,
    evText,
    unchanged,
    supported,
    confirmed,
    modelImprovement: !!improved,
    improvement: improved ? Math.min(...improved.scenarios.map((v) => v.vsActual.delta)) : 0,
    score:
      (confirmed ? 1e9 : valueCodes.has(r.code) ? 1e6 : r.status === 'attention' ? 1e5 : 0) +
      (improved
        ? Math.min(...improved.scenarios.map((v) => v.vsActual.lower))
        : freeFold
          ? s.pot
          : r.context.extra),
    actualEV: actualRow?.scenarios.map((v) => v.ev) || [],
    proof: freeFold
      ? '免费过牌不增加成本，保留机会。'
      : improved
        ? '相同抽样牌局下，这个候选在两种范围中都优于实际操作。'
        : evKind !== 'uncertain'
          ? '根据当时价格或候选模拟判断，范围改变时结论也可能改变。'
          : '未发现足以确认另一动作更好的证据，建议按对手继续方式调整。',
  };
}

function uniquePoints(points, limit = 2) {
  const seen = new Set();
  return points
    .filter((p) => {
      const key = p.code + ':' + p.street;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

// Outcomes change the narrative only; they never change a step's grading.
export function buildOverview(input, steps) {
  const points = steps.map((r, i) => ({
    ...r.coaching,
    index: i,
    street: input.decisions[i].street,
    code: r.code,
    title: r.title,
    situation:
      r.code === 'weak-threebet-defense'
        ? '面对 3-bet'
        : r.code === 'weak-fourbet-defense'
          ? '面对 4-bet'
          : streets[input.decisions[i].street],
  }));
  const sorted = [...points].sort((a, b) => b.score - a.score);
  const critical = sorted.find((p) => p.confirmed),
    priority = critical || sorted.find((p) => p.kind !== 'keep') || sorted[0];
  const negative = points.filter((p) => p.evKind === 'negative');
  const improvements = uniquePoints(
    sorted.filter((p) => p.kind === 'improve' || p.kind === 'compare'),
  );
  const good = uniquePoints(
    points.filter((p) => p.supported && p.kind === 'keep'),
    1,
  );
  const value = uniquePoints(
    sorted.filter((p) => p.kind === 'value'),
    1,
  );
  const profit = input.outcome.profit,
    won = profit > 0,
    lost = profit < 0;
  let title, summary;
  if (!points.length) {
    title = '本手没有可评价的主动操作';
    summary = '只有强制投入或未轮到你行动，不能把结果归为操作失误。';
  } else if (won && negative.length) {
    title = '赢了，但有一步不值得长期重复';
    summary =
      '这次盈利不代表每一步都划算。下列决定在当前范围假设下有负收益风险，先修正它，再争取价值。';
  } else if (won && critical) {
    title = '赢了，仍有明确的改进空间';
    summary = '获胜不能证明这次打法最好，当时仍有更值得比较的选择。少赚与长期亏损是不同的问题。';
  } else if (lost && critical) {
    title = '输了，优先改变最关键的一步';
    summary = `先看第 ${priority.index + 1} 步（${streets[priority.street]}）：${priority.suggestedAction}。重点改善重复打时的收益，而不是保证这次就能赢。`;
  } else if (lost && points.every((p) => p.supported)) {
    title = '这次输了，操作仍有合理依据';
    summary =
      '当前分析没有确认需要纠正的决定。能接受的输牌也会发生，不必为了这一结果强行改成更冒险的打法。';
  } else if (won && good.length) {
    title = '赢了，有值得保留的操作';
    summary = '下面这些选择有当时的信息支持，尚未证明整条路线最优，仍可调整尺度和后续取值。';
  } else {
    title = lost
      ? '这次输了，先比较有条件的改进'
      : won
        ? '赢了，继续核对打法是否可重复'
        : '本手持平，继续看操作质量';
    summary = '有些选择会随对手范围改变，现有证据不足以宣布唯一最佳打法。先练习最值得比较的一步。';
  }
  const pots = input.outcome.pots || [],
    awards = pots.flatMap((p) => p.awards || []);
  const ownAwards = awards.filter((a) => a.name === '你');
  const settlement = input.outcome.wonPot
    ? (ownAwards.length &&
      pots.some((p) => p.awards?.some((a) => a.name === '你') && p.awards.length > 1)
        ? '本手包含平分底池。'
        : input.outcome.showdown
          ? '本手通过摊牌获得底池。'
          : '对手全部退出，你获得底池。') + (lost ? '虽然拿到部分底池，总投入仍高于总回收。' : '')
    : input.outcome.folded
      ? input.outcome.practiceRunout
        ? '你已弃牌，练习补牌不改变结算，也不用于判定弃牌对错。'
        : '你已弃牌，按弃牌前的信息评价。'
      : input.outcome.showdown
        ? '本手摊牌未获得底池。'
        : '本手未获得底池。';
  const luck =
    negative.length && won
      ? '这次结果更好，不能洗掉下注时的收益问题，无法把运气和技术精确分成比例。'
      : '单手输赢有牌运波动，操作按当时信息评价。';
  return {
    title,
    summary,
    settlement,
    luck,
    improvements,
    good,
    value,
    priorityIndex: priority?.index || 0,
    negative: negative.length,
    scope: '建议优先改善长期筹码收益，获池机会更高不一定更赚。',
  };
}
