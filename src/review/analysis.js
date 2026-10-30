import { heavyPreflopPressure, plannedValueShove } from './presentation.js';
import { compactChips } from '../engine/chip-format.js';
import { bigBlindOf } from '../engine/stakes.js';
import { callPrice, sampleValue } from './equity.js';
import { decisionContext, startingTier, drawInfo } from './context.js';
import { preflopContext, positionedEntry, preflopRaiseTarget } from './preflop.js';
import { comparisonRoutes } from './routes.js';
import { compareCandidateActions } from './counterfactual.js';
import { coachDecision, buildOverview } from './coaching.js';
import { drawLabel, callOddsText, investmentText } from './narrative.js';
import { cardText } from './spot-facts.js';
import { reviewActivity } from './activity.js';
import { handMatchups, sharesPublicPair, valuePlan } from './matchups.js';
import { actionLabel } from '../engine/action-labels.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';
import { gameIdentities } from '../engine/player-identity.js';
import { checkRisks } from './check-reasoning.js';
import { flushBoardShove } from './value-targets.js';
import { guaranteedBoardShare } from './strategy-facts.js';
import { reviewStrategy, enrichStrategy } from './strategy-context.js';
export { actionLabel } from '../engine/action-labels.js';
export { callPrice } from './equity.js';
export { startingTier, drawInfo } from './context.js';

export const STREET_NAMES = ['翻牌前', '翻牌', '转牌', '河牌'];
const number = compactChips;
const percent = (n) => Math.round(n * 100) + '%';
const rangeText = (low, high) =>
  percent(low) === percent(high) ? '约 ' + percent(low) : percent(low) + '–' + percent(high);
export function createReviewInput(g) {
  if (g.phase !== 'done') throw Error('牌局结束后才能复盘。');
  return JSON.parse(
    JSON.stringify({
      hand: g.hand,
      bigBlind: bigBlindOf(g),
      smallBlind: g.smallBlind,
      hole: g.players[0].hole,
      decisions: g.decisions || [],
      players: gameIdentities(g),
      activity: reviewActivity(g),
      opponents: g.botDecisions || [],
      outcome: {
        profit: (g.payouts[0] || 0) - g.players[0].total,
        paid: g.players[0].total,
        returned: g.payouts[0] || 0,
        folded: g.players[0].folded,
        wonPot: g.winners.some((w) => w.id === 0),
        showdown: !!g.showdown,
        board: g.board,
        pots: g.pots.map((p) => ({
          label: p.label,
          amount: p.amount,
          eligible: p.eligible.map((id) => g.players[id].name),
          awards: p.awards.map((a) => ({
            name: g.players[a.id].name,
            amount: a.amount,
            label: a.label,
          })),
        })),
        result: g.result,
      },
    }),
  );
}
export function analyzeDecision(
  s,
  {
    trials = 600,
    rolloutTrials = Math.max(12, Math.min(64, Math.round(trials / 15))),
    rollouts = true,
  } = {},
) {
  if (!Number.isInteger(trials) || trials < 1) throw Error('抽样次数必须是正整数。');
  const bigBlind = bigBlindOf(s);
  const price = callPrice(s),
    wide = sampleValue(s, price, trials, false),
    strong = sampleValue(s, price, trials, true),
    ctx = decisionContext(s);
  ctx.matchups = handMatchups(s, ctx);
  ctx.valuePlan = valuePlan(s, ctx, ctx.matchups);
  ctx.guaranteedBoard = guaranteedBoardShare(s, ctx, price);
  const pre = s.street === 0 ? preflopContext(s) : null;
  if (pre) ctx.positionedEntry = positionedEntry(s, ctx, pre);
  const low = Math.min(wide.equity, strong.equity),
    high = Math.max(wide.equity, strong.equity),
    uncertainty = Math.max(wide.margin, strong.margin);
  ctx.callAssessment = {
    required: price.required,
    optimistic: high + uncertainty,
    conservative: low - uncertainty,
  };
  const { draw, texture, handClass, handLabel, tier } = ctx,
    early = ['UTG', 'UTG+1', 'MP', 'LJ'].includes(s.position),
    deep = ctx.effective >= 50 * bigBlind;
  const priced = callOddsText(
    {
      callCost: price.cost,
      callAmount: s.legal.callAmount,
      contestable: price.contestable,
      required: price.required,
    },
    s.action,
  );
  const estimated = `随机范围与行动加权范围下，底池权益分别约 ${percent(wide.equity)} / ${percent(strong.equity)}。`;
  const strongMade =
    s.street > 0 &&
    !['high', 'underpair', 'middle-pair', 'board', 'board-pair'].includes(handClass) &&
    !(texture.maxSuit >= 4 && ctx.made.score[0] < 5) &&
    !(texture.connected >= 4 && ctx.made.score[0] < 4);
  const valueTarget = strongMade || (s.street === 0 && tier >= 2 && !heavyPreflopPressure(s, ctx));
  let status = 'sound',
    code = '',
    title = '',
    reason = '',
    lesson = '',
    plan = '',
    confidence = '依赖范围假设',
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  const raiseTo = () => {
    let target;
    if (s.street === 0) {
      target = preflopRaiseTarget(s, ctx, pre);
    } else if (s.currentBet > 0) target = s.currentBet * (ctx.inPosition ? 2.5 : 3);
    else target = s.pot * (texture.wet || ctx.opponents > 1 ? 0.65 : 0.4);
    alternative = {
      action: 'raise',
      amount: legalRaiseTo(target, s.legal),
    };
  };
  if (ctx.guaranteedBoard) {
    code = 'guaranteed-board-share';
    status = s.action === 'fold' ? 'attention' : 'sound';
    confidence = '规则与成本明确';
    title = '公共牌已锁定分池，按确定份额与成本判断';
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  } else if (s.action === 'fold' && s.legal.canCheck) {
    code = 'free-fold';
    status = 'attention';
    confidence = '规则与成本明确';
    title = '可以直接过牌，弃牌放弃了免费机会';
    reason = `当时你在 ${s.position}，跟注成本为 0。过牌保留本手权益，不会增加投入，${ctx.pendingOthers ? '后面还有 ' + ctx.pendingOthers + ' 位玩家可以行动。' : '本轮没有必须补齐的下注。'}`;
    alternative = { action: 'check', amount: 0 };
    lesson = '先免费过牌，面对后续下注再评估价格。';
    plan = '下一步若有人下注，按新的金额和参与人数重新计算，不预先承诺跟到底。';
  } else if (ctx.positionedEntry?.eligible && !price.closing) {
    code = 'positioned-entry';
    status = s.action === 'call' ? 'sound' : 'consider';
    title = '好位置与深有效筹码，支持低成本进入翻后';
    reason = `${handLabel} 在 ${s.position}，面对一次常规开池，跟注只占你的筹码约 ${(ctx.positionedEntry.stackRatio * 100).toFixed(1)}%，与你已入池对手的有效筹码至少约 ${ctx.positionedEntry.depthBB.toFixed(0)} BB。位置、较小投入和底牌的翻后潜力共同支持跟注，不能只因为尚未成对就默认弃牌。`;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = '区分便宜地保留翻后潜力和无依据持续投入，遇到再加注或后续不利牌面时重新判断。';
    plan =
      '击中强牌时争取让较弱牌付费，形成强听牌时结合价格与对手弃牌空间决定跟注或半诈唬，完全落空且面对不利下注时退出，能免费过牌时保留机会。';
  } else if (
    pre?.raises === 1 &&
    pre.callersAfterOpen > 0 &&
    s.position === 'SB' &&
    tier === 0 &&
    !pre.suited &&
    s.action === 'call' &&
    price.cost >= s.stack * 0.05 &&
    high <= price.required + 0.025
  ) {
    code = 'weak-sb-cold-call';
    status = 'consider';
    title = '小盲弱散牌冷跟多人开池，需要更多继续依据';
    reason = `${handLabel} 在小盲面对开池及已有跟注，要再补 ${number(price.cost)}，约占剩余筹码的 ${((price.cost / s.stack) * 100).toFixed(1)}%。不同花弱牌在翻后通常先行动，成对后也可能被更大对子或更好踢脚压制。${priced}${estimated}当前估计没有清晰价格余量，不能只因能改善就肯定跟注。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '较低的跟注金额不等于容易实现权益，无位置和多人竞争需要一起考虑。';
    plan = '先比较弃牌，只有明确的更宽范围与更有利价格能提供继续依据时，再讨论冷跟。';
  } else if (
    pre &&
    s.action === 'raise' &&
    s.hole[0].rank === s.hole[1].rank &&
    s.hole[0].rank <= 7 &&
    (pre.raises >= 2 ||
      (pre.raises === 1 &&
        pre.limpers + pre.callersAfterOpen > 0 &&
        s.amount === s.legal.minRaiseTo &&
        s.amount < preflopRaiseTarget(s, ctx, pre) * (2 / 3)))
  ) {
    code = 'unbacked-small-pair-reraise';
    status = 'consider';
    title = '小对子再加注，不能只凭施压意图肯定这条路线';
    reason =
      '小对子已有摊牌机会，但面对加注，不能只凭这点牌力就反复再加注。需要有对手会放弃哪些牌的依据。' +
      (s.amount === s.legal.maxRaiseTo
        ? '这次已把全部筹码投入，被跟注后只能争取摊牌，不能再靠后街施压弥补成本。'
        : (s.amount < preflopRaiseTarget(s, ctx, pre) * (2 / 3)
            ? '这次再加注偏小，可能让对手低成本继续。'
            : '') + '被跟注后，未中暗三条时仍要面对高张和后续压力。');
    alternative = {
      action: price.cost < s.stack * 0.25 && low - uncertainty > price.required ? 'call' : 'fold',
      amount:
        price.cost < s.stack * 0.25 && low - uncertainty > price.required ? s.legal.callAmount : 0,
    };
    lesson = '按价格跟注与主动反复再加注需要不同的依据。';
    plan = '先比较控制投入的路线，只有明确的宽范围和弃牌空间，才讨论更积极的再加注。';
  } else if (
    pre &&
    pre.raises >= 2 &&
    tier === 1 &&
    s.hole[0].rank !== s.hole[1].rank &&
    s.action === 'call' &&
    price.cost >= s.stack &&
    strong.equity + strong.margin < price.required
  ) {
    code = 'unbacked-speculative-allin';
    status = 'consider';
    title = '投机底牌全下接再加注，不能依赖后续隐含收益';
    reason = `${handLabel} 这次需要拿出全部 ${number(s.stack)}，行动加权范围的胜率估计加上抽样余量仍未达到当前保本门槛，不能只凭同花或连接潜力支持这笔全下。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '低成本保留翻后潜力，与一次投入全部筹码看完公共牌，需要不同的价格依据。';
    plan = '除非有明确的更宽范围依据，否则先保留剩余筹码，不能靠全下后的下注或成牌取值弥补成本。';
  } else if (
    !s.street &&
    s.action === 'call' &&
    s.hole[0].rank === s.hole[1].rank &&
    s.hole[0].rank <= 7 &&
    !price.closing &&
    price.cost < s.stack &&
    price.cost >= s.stack * 0.25 &&
    low - uncertainty <= price.required + 0.05
  ) {
    code = 'costly-small-pair-flat';
    status = 'consider';
    title = '短筹码小对子大额平跟，需要核对价格与改善空间';
    reason = `${handLabel} 已有对子，但这次跟注要拿出 ${number(price.cost)}，约占剩余筹码的 ${((price.cost / s.stack) * 100).toFixed(1)}%，两种范围估计扣除抽样余量后没有足够价格余量，不能单靠追暗三条支撑这笔投入。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '小对子不只靠暗三条获胜，但大额平跟也不能默认能靠成牌后的收益补足。';
    plan = '有明确宽范围或更有利的价格依据时再讨论跟注，全下跟注需要单独核对摊牌价格。';
  } else if (
    pre?.unopened &&
    !pre.suited &&
    tier === 0 &&
    s.action === 'call' &&
    Math.min(...s.hole.map((card) => card.rank)) <= 6 &&
    Math.abs(s.hole[0].rank - s.hole[1].rank) >= 3 &&
    ((pre.late && !pre.limpers && Math.max(...s.hole.map((card) => card.rank)) <= 10) ||
      (['HJ', 'CO', 'BTN'].includes(s.position) &&
        pre.limpers > 0 &&
        s.bet === 0 &&
        Math.max(...s.hole.map((card) => card.rank)) <= 11))
  ) {
    code = 'weak-late-limp';
    status = 'consider';
    title = '弱不同花散牌不能只因为跟注便宜就跛入';
    reason = `${handLabel} 不同花且点数相隔较远，成强牌的路径较少，后面仍有玩家可以加注，较低跟注成本不能单独支持这次入池。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '位置、底牌与价格需要共同支持入池，不能只因为跟注金额小就继续。';
    plan =
      '有明确更宽范围与更有利价格依据时再讨论跟注，已经有人跛入时，加注还需要考虑他们的继续范围。';
  } else if (
    pre?.unopened &&
    pre.limpers > 0 &&
    tier === 0 &&
    !pre.openingCandidate &&
    !pre.suited &&
    Math.abs(s.hole[0].rank - s.hole[1].rank) >= 3 &&
    s.action === 'raise'
  ) {
    code = 'weak-limper-isolation';
    status = 'consider';
    title = '弱散牌隔离跛入者，不能照搬无人入池的偷盲';
    reason = `${handLabel} 面对 ${pre.limpers} 位已经跟注入池的玩家，加到 ${number(s.amount)}，属于隔离加注。要拿走底池，需要已入池者和后面的玩家都弃牌，不能只看盲位是否退出。${s.amount < (2.5 + pre.limpers) * bigBlind ? '这次较小尺度也给跛入者留下便宜跟注的价格。' : ''}被跟注后，不同花散牌的成强牌路径较少，较弱踢脚也难承受持续压力。`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '隔离加注需要底牌潜力、对手弃牌空间与合理尺度共同支持。';
    plan = '缺少对手明显过度弃牌的依据时先减少投入，不能仅因已有死钱就用弱散牌扩大底池。';
  } else if (
    pre?.unopened &&
    pre.late &&
    (pre.openingCandidate ||
      (pre.limpers > 0 &&
        Math.min(...s.hole.map((card) => card.rank)) >= 8 &&
        Math.abs(s.hole[0].rank - s.hole[1].rank) <= 2)) &&
    tier < 2 &&
    s.action === 'raise' &&
    ctx.extra <= 8 * bigBlind &&
    s.amount < s.legal.maxRaiseTo
  ) {
    code = pre.limpers ? 'late-isolation' : 'late-open';
    title = pre.limpers ? '后位隔离加注，要区分人数与跟注倾向' : '后位主动开池有位置与弃牌权益依据';
    reason = `${handLabel} 在 ${s.position} ${pre.limpers ? '面对 ' + pre.limpers + ' 位跛入者' : '行动弃到你，前面没有开池'}，加注至 ${number(s.amount)}（${(s.amount / bigBlind).toFixed(1)} BB）。${pre.limpers ? '这次要隔离已入池的玩家，不能只考虑盲位是否弃牌。' : pre.ace ? 'A 底牌阻断部分 AA、AK、AQ 组合，后位允许比早位更宽的开池范围。' : '后位能以较宽范围争夺盲注，并在翻后获得位置优势。'}加注可让部分弱连张和高牌退出，收益包含弃牌权益，被跟注后，留下的范围可能更强${pre.weakAce ? '，A' + pre.kicker + ' 成顶对仍容易被更好的 A 踢脚压制' : ''}。${pre.limpers ? '这里是隔离加注，已有开池再加平跟后才叫挤压加注。' : '这里是开池／偷盲，不是挤压加注。'}`;
    alternative = {
      action: 'raise',
      amount: legalRaiseTo((2.5 + pre.limpers) * bigBlind, s.legal),
    };
    lesson = '开池能力与接再加注能力分开判断，A high 不是必须弃牌的理由，也不是跟到底的理由。';
    plan = `${pre.limpers ? '跛入者跟注较多时，提高隔离尺度并收紧范围，多人跟注后减少无依据持续施压。' : '比较 2–3 BB 开池：较小尺度降低偷盲成本，较大尺度提高即时压力，但要看盲位的继续范围。'}面对小额、宽范围 3-bet 才考虑有位置防守，大尺度或 4-bet 优先收紧。翻后顶对弱踢脚以控池为主，未中牌时结合牌面与对手范围决定是否持续下注。`;
  } else if (
    pre &&
    pre.raises >= 2 &&
    (pre.weakAce || tier === 0) &&
    ['call', 'raise'].includes(s.action)
  ) {
    code = pre.raises >= 3 ? 'weak-fourbet-defense' : 'weak-threebet-defense';
    status = pre.raises >= 3 || price.cost >= s.stack * 0.1 ? 'attention' : 'consider';
    title =
      pre.raises >= 3
        ? '多次再加注下，弱牌防守缺少支撑'
        : pre.ownOpen
          ? '可开池的牌，不等于可以宽接 3-bet'
          : '面对开池和再加注，弱牌继续需要更多依据';
    reason = `${handLabel} 在 ${s.position}，${pre.label}，最新总额 ${number(s.currentBet)}，约上一次的 ${pre.ratio.toFixed(1)} 倍。${priced}${estimated}${pre.ownOpen ? '你此前的开池有合理依据，但这一跟注是新的独立决策。' : ''}${pre.weakAce ? '较强 Ax 压制你的踢脚，单靠持有 A 的阻断不够支持大额跟注。' : '弱牌被强范围压制，缺少稳健的翻后实现条件。'}${ctx.pendingOthers ? '后面仍有 ' + ctx.pendingOthers + ' 人可再次行动。' : ''}`;
    alternative = { action: 'fold', amount: 0 };
    lesson =
      pre.raises >= 3
        ? '已投入的开池和跟注不能成为继续接 4-bet 的依据。'
        : '区分偷盲范围与防守再加注范围，核对尺度、位置、同花潜力和对手宽度。';
    plan =
      pre.raises >= 3
        ? '对多次加注且缺少宽范围依据的情形，优先停止新增投入，只有清晰的极宽范围证据与有利价格才重新讨论防守。'
        : `备选为小额有位置跟注，但需要对手 3-bet 足够宽、价格有余量${pre.suited ? '，同花潜力有助于实现权益' : '，不同花弱 A 需要更严格的防守条件'}。低 SPR 或大尺度压力下不要仅为看翻牌继续。`;
  } else if (
    pre?.unopened &&
    pre.late &&
    pre.openingCandidate &&
    tier < 2 &&
    !pre.limpers &&
    ctx.effective >= 10 * bigBlind &&
    s.legal.canRaise &&
    ['fold', 'call'].includes(s.action)
  ) {
    code = 'late-passive-entry';
    status = 'consider';
    title = '后位可比较主动开池，而非只看起手牌档位';
    reason = `${handLabel} 在 ${s.position}，无人主动入池。${pre.ace ? 'A 阻断部分强 Ax，后位允许更宽地争夺盲注。' : '翻后位置与对手退出空间支持比较主动开池。'}${s.action === 'call' ? '单纯跛入让盲位低成本看牌，缺少主动弃牌权益。' : '弃牌避免投入，但也放弃了后位争夺盲注的机会。'}这不等于被加注后还应继续，盲位很黏或有效筹码很短时需要另行调整。`;
    alternative = {
      action: 'raise',
      amount: legalRaiseTo(2.5 * bigBlind, s.legal),
    };
    lesson = '把主动开池与接再加注拆成两套继续条件。';
    plan =
      '比较 2–3 BB 开池与当前保守路线，若遇大尺度 3-bet 或 4-bet，弱 A 优先收紧。顶对弱踢脚时避免自动把筹码打光。';
  } else if (
    pre &&
    pre.raises === 1 &&
    pre.callersAfterOpen > 0 &&
    pre.late &&
    pre.weakAce &&
    s.action === 'raise'
  ) {
    code = 'squeeze-candidate';
    status = 'consider';
    title = '挤压加注需要退出范围支持，A 阻断只是其中一项';
    reason = `${handLabel} 在 ${s.position}，已有开池及 ${pre.callersAfterOpen} 次平跟，你再加注至 ${number(s.amount)}，属于挤压加注。A 阻断部分强 A 组合，可帮助挑选诈唬候选，但不同花弱 A 被跟注后仍可能被更强 Ax 压制。是否值得挤压，关键是开池者是否足够宽、平跟者是否会退出，以及你面对 4-bet 能否及时停止。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '减少人数不是收益证明，即刻弃牌权益与被继续后的牌力要分开评估。';
    plan =
      '没有对手范围与弃牌倾向证据时优先收紧，具备宽开池／可弃平跟的证据时，重打比较有位置挤压与弃牌，避免把持有 A 当成无条件进攻依据。';
  } else if (
    pre?.unopened &&
    early &&
    pre.suited &&
    tier === 0 &&
    ['call', 'raise'].includes(s.action)
  ) {
    code = 'early-suited-entry';
    status = 'consider';
    title = '早位边缘同花牌，开池取决于后面防守范围';
    reason = `${handLabel} 确实是同花牌，具备同花潜力，不能按不同花弱牌处理。你在 ${s.position}，后面仍有 ${ctx.pendingOthers} 人可行动。${pre.kicker <= 8 ? '较小踢脚使顶对容易被更强同点数高牌压制，' : ''}同花潜力并不能消除无位置和再加注压力。常规收紧范围可选择弃牌，若后面明显过紧、很少 3-bet，则可以比较小尺度开池利用其弃牌。`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '同花、位置、踢脚与防守倾向一起判断，不能只根据“有高张／同花”入池或根据档位直接判错。';
    plan =
      '把当前开池与弃牌放进候选行动模拟，查看对手范围改变时哪条路线占优。面对 3-bet 收紧，顶对弱踢脚控制底池，同花听牌仍按实际价格和后续付费判断。';
  } else if (
    s.street === 0 &&
    tier === 0 &&
    (s.action === 'call' || s.action === 'raise') &&
    ((pre.raises > 0 && s.currentBet >= 3 * bigBlind) || early)
  ) {
    code = 'weak-entry';
    status = early && !pre.raises ? 'attention' : 'consider';
    title = early && !pre.raises ? '早位弱牌入池缺少位置支持' : '面对开池，先核对价格与被压制风险';
    reason = `你拿 ${handLabel}，处于 ${s.position}，当前需补 ${number(s.legal.callAmount)}，仍有 ${ctx.pendingOthers} 位玩家尚可行动。${early ? '早位缺少位置优势，' + (pre.suited ? '同花潜力仍需承担踢脚、连接性及再加注风险。' : '不同花边缘牌更难实现权益。') : '前面已有加注，弱牌被更好顶对或更高踢脚压制的风险增加。'}`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '主动开池、平跟已有开池和防守再加注需要不同范围，不能只按起手牌档位判断。';
    plan = '若以后在大盲面对很小加注，应重新按价格判断，不能把“弱牌”直接等同于必须弃牌。';
  } else if (flushBoardShove(s, ctx)) {
    code = 'flush-board-shove';
    status = 'consider';
    title = '同花牌面直接全下，先核对较弱牌会不会跟注';
    reason =
      '对手继续范围可能变强，应比较过牌或较小下注；只有较弱对子或尚未完成的听牌仍愿意支付时，再考虑全下取值。';
    alternative = {
      action: s.legal.canCheck ? 'check' : high + uncertainty < price.required ? 'fold' : 'call',
      amount: s.legal.canCheck || high + uncertainty < price.required ? 0 : s.legal.callAmount,
    };
    lesson = reason;
    plan = reason;
  } else if (
    s.street > 0 &&
    s.action === 'raise' &&
    s.amount === s.legal.maxRaiseTo &&
    ctx.effective >= 20 * bigBlind &&
    ctx.betRatio > 1.5 &&
    ctx.made.score[0] >= 2 &&
    !ctx.matchups.nut &&
    checkRisks(s, ctx).length > 0 &&
    !plannedValueShove(s, ctx)
  ) {
    code = 'dangerous-value-shove';
    status = 'consider';
    title = '危险牌面强成牌大额全下，不能只凭牌型肯定取值';
    reason = `${handLabel} 仍能赢较弱成牌，但这次拿出 ${number(ctx.extra)}，约为底池的 ${ctx.betRatio.toFixed(1)} 倍。${checkRisks(s, ctx).join('')}愿意接下如此大下注的范围可能比当前未弃牌范围更强，现有摊牌机会不能单独证明全下有价值。`;
    alternative = {
      action: s.legal.canCheck ? 'check' : high + uncertainty < price.required ? 'fold' : 'call',
      amount: s.legal.canCheck || high + uncertainty < price.required ? 0 : s.legal.callAmount,
    };
    lesson = '把成牌能领先哪些牌，与那些牌会不会跟大额全下分开判断。';
    plan =
      '先比较控制投入的路线，只有列出足够较弱跟注目标时，再比较较小取值尺度与全下，不把当前建议当成唯一最优。';
  } else if (
    s.street > 0 &&
    s.action === 'raise' &&
    s.legal.canCheck &&
    texture.maxSuit >= 4 &&
    ctx.made.score[0] < 4 &&
    draw.straight &&
    !draw.flush
  ) {
    code = 'dirty-draw-bet';
    status = 'consider';
    title = '四同花面追顺，补成顺子也未必能赢';
    reason = `当前 ${handLabel} 带${drawLabel(draw)}，但公共牌已有四张同花色，对手底牌只需有一张该花色就已成同花。即使补成顺子，也仍会输给同花，不能把 ${draw.outs} 张顺子改善候选都当作获胜补牌。`;
    alternative = { action: 'check', amount: 0 };
    lesson = '半诈唬需要实际获胜潜力与对手弃牌空间，形式上的补牌张数不能单独支持下注。';
    plan = '免费过牌可保留下一张改善机会，只有明确仍能逼走更好牌时，再比较主动施压。';
  } else if (
    s.street > 0 &&
    s.action === 'raise' &&
    s.currentBet === 0 &&
    valueTarget &&
    !plannedValueShove(s, ctx) &&
    ctx.extra < s.pot * 0.15 &&
    ctx.valuePlan.primary?.action === 'raise' &&
    ctx.valuePlan.primary.amount > s.amount &&
    s.legal.maxRaiseTo - s.bet > ctx.extra * 2
  ) {
    code = 'undersized-value-bet';
    status = 'consider';
    title = '强牌小注能留住弱牌，也可能少收价值';
    reason = `${handLabel} 有取值潜力，这次只拿出 ${number(ctx.extra)}，约为底池的 ${percent(ctx.betRatio)}。较小下注可能留住弱牌，但也可能少收一轮价值${s.street < 3 ? '，并给听牌便宜继续的价格' : ''}，不能只因取值方向合理就肯定这个尺度。${checkRisks(s, ctx).join('')}`;
    ctx.valueSizeCandidate = {
      action: 'raise',
      amount:
        ctx.valuePlan.primary.amount === s.legal.maxRaiseTo
          ? legalRaiseTo(s.pot * 0.5, s.legal)
          : ctx.valuePlan.primary.amount,
    };
    alternative = { action: 'raise', amount: s.amount };
    lesson = '对照较小与较大尺度，看哪些较弱牌愿意付费，而不是只比较有没有下注。';
    plan = '较大候选只是有弱牌跟注依据时的练习对照，遇到加注仍需重新判断，不证明越大越好。';
  } else if (
    s.street > 0 &&
    s.action === 'raise' &&
    s.amount === s.legal.maxRaiseTo &&
    deep &&
    ctx.betRatio > 4 &&
    draw.outs > 0 &&
    !valueTarget &&
    !plannedValueShove(s, ctx)
  ) {
    code = 'oversized-draw-shove';
    status = 'consider';
    title = '深筹码听牌直接全下，需要比较较小的半诈唬尺度';
    reason = `${handLabel} 带${drawLabel(draw)}，这次投入 ${number(ctx.extra)} 是当时底池的 ${ctx.betRatio.toFixed(1)} 倍，补牌机会不能单独证明这个全下尺度划算。`;
    raiseTo();
    lesson = '有听牌可以讨论半诈唬，但还要比较弃牌空间和被跟注后的风险。';
    plan = '优化应放在全下之前，先比较较小的合法下注或加注，缺少弃牌空间时保留过牌或按价格跟注。';
  } else if (
    s.action === 'raise' &&
    s.amount === s.legal.maxRaiseTo &&
    deep &&
    ctx.betRatio > 4 &&
    ((s.street === 0 && tier >= 2) ||
      (s.street > 0 &&
        ctx.valuePlan.primary?.action === 'raise' &&
        ctx.valuePlan.primary.amount < s.legal.maxRaiseTo)) &&
    !plannedValueShove(s, ctx)
  ) {
    code = 'deep-value-shove';
    status = 'consider';
    title = '深筹码强牌直接全下，可能压缩价值空间';
    reason = `${handLabel} 有价值，但这次额外投入 ${number(ctx.extra)}（约 ${Math.round(ctx.extra / bigBlind)} BB），是当时底池 ${number(s.pot)} 的 ${ctx.betRatio.toFixed(1)} 倍，有效剩余筹码约 ${Math.round(ctx.effective / bigBlind)} BB。如此大的压力可能让愿意跟常规加注的较弱牌退出，不能仅凭强牌认定全下最好。`;
    raiseTo();
    lesson = s.street
      ? '优先比较普通下注或加注与全下，让较弱成牌有机会付费。'
      : '优先比较正常开池或再加注与全下，让较弱范围有机会付费。';
    plan = `可以先用 ${actionLabel(s, alternative.action, alternative.amount)} 这条路线练习，若对手再加注，再结合其范围和有效筹码决定继续。此尺度是练习候选，不保证多赚。`;
  } else if (
    s.street > 0 &&
    s.action === 'raise' &&
    s.legal.callAmount > 0 &&
    (sharesPublicPair(s, ctx) ||
      (handClass === 'top-pair' && (ctx.opponents > 1 || (s.street === 3 && s.bet > 0))))
  ) {
    code = 'unbacked-pair-reraise';
    status = 'consider';
    title = '当前成牌面对已有下注，不能自动当成大额价值再加注';
    reason = sharesPublicPair(s, ctx)
      ? '当前两对中有一对来自公共牌，所有玩家都能使用，不能按两张底牌各自成对的强度判断。面对已有下注，先比较跟注价格，价值再加注还需要明确哪些较弱牌会付费。'
      : '面对多人下注或河牌加注，顶对不能自动当成大额价值再加注。需要先明确哪些更弱成牌会继续付费，有听牌或阻断牌也不能单独证明对手会弃牌。';
    alternative = {
      action: high + uncertainty < price.required ? 'fold' : 'call',
      amount: high + uncertainty < price.required ? 0 : s.legal.callAmount,
    };
    lesson = '先按当前价格比较跟注与弃牌，强听牌可以增加继续依据，但不自动构成价值加注。';
    plan = '只有对手会用足够较弱牌付费，或有明确弃牌空间时，再比较较大的加注。';
  } else if (
    s.street > 0 &&
    s.action === 'call' &&
    handClass === 'high' &&
    !draw.outs &&
    (price.cost >= s.stack * 0.5 || price.required >= 0.2) &&
    strong.equity + uncertainty < price.required &&
    wide.equity - uncertainty <= price.required
  ) {
    code = 'unbacked-high-card-call';
    status = 'consider';
    title = '高牌大额跟注缺少继续依据';
    reason =
      '当前只有高牌，没有顺子、同花的直接听牌。根据对手之前的行动估计，获胜机会不足以覆盖成本，即使按更宽的底牌范围估计，也还不能确认这笔跟注划算，不能只因对手可能诈唬就肯定跟注。';
    alternative = { action: 'fold', amount: 0 };
    lesson = '只有更弱高牌诈唬的具体证据能够提供足够胜率时，再比较跟注。';
    plan = '优先停止这笔新增投入，之前的跟注不构成继续的理由。';
  } else if (s.action === 'call' && price.cost > 0 && high + uncertainty + 0.035 < price.required) {
    code = 'expensive-call';
    status = price.closing ? 'attention' : 'consider';
    title = price.closing ? '这次跟注的价格缺少权益支持' : '跟注偏贵，后续压力还需额外考虑';
    reason = `当时是 ${handLabel}，面对 ${ctx.opponents} 位未弃牌对手。${priced}${estimated}${draw.outs ? '当前有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '，成牌仍可能输给更强牌。' : ''}`;
    alternative = { action: 'fold', amount: 0 };
    lesson = price.closing
      ? '在这两种假设下，跟注价格高于估计权益，倾向停止投入。'
      : '抽到最终摊牌的权益不等于实际能实现的权益，跟注后还可能再付费。';
    plan = price.closing
      ? '本次跟注将结束你的下注决策，重点核对对手是否有足够诈唬，不能把未来额外收益作为理由。'
      : `后面尚有 ${ctx.pendingOthers} 位玩家可能行动，若跟注，先设定面对再加注或不利转牌时的退出条件。`;
  } else if (s.street === 0 && tier === 3 && s.action === 'fold') {
    code = 'premium-fold';
    status = 'consider';
    title = '强起手牌的弃牌需要解释下注压力';
    reason = `你持有 ${handLabel}，当前 ${number(s.currentBet)}、需补 ${number(s.legal.callAmount)}，有效筹码约 ${Math.round(ctx.effective / bigBlind)} BB，本手已出现 ${ctx.preflopRaises} 次翻牌前加注。${ctx.preflopRaises >= 2 ? '多次再加注会收紧对手范围，不能仅用强牌标签否定弃牌。' : '常规压力下，这组牌通常值得继续比较跟注或再加注。'}`;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = '把强牌与实际下注强度一起判断，避免机械全下或机械弃牌。';
    plan =
      ctx.preflopRaises >= 2
        ? '重点辨别这是宽范围争夺还是少诈唬的强范围，证据不足时将结论保留为讨论项。'
        : '可以重打本手，比较主动加注和跟注两条路线。';
  } else if (
    s.action === 'call' &&
    !s.legal.canCheck &&
    s.legal.callAmount > 0 &&
    s.legal.callAmount <= s.stack &&
    s.amount === s.legal.callAmount &&
    ctx.valuePlan.kind === 'trap'
  ) {
    code = 'strong-flat-trap';
    status = 'sound';
    title = '强牌平跟保留弱牌与诈唬';
    reason = ctx.valuePlan.reason;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = ctx.valuePlan.reason;
    plan = ctx.valuePlan.reason;
  } else if (s.street === 0 && tier === 3 && s.action === 'call' && s.legal.canRaise) {
    code = 'premium-flat';
    status = 'consider';
    title = '强起手牌可比较主动建立底池';
    reason = `${handLabel} 在 ${s.position} 跟注 ${number(s.legal.callAmount)}，${ctx.opponents} 位对手仍在局中，${ctx.pendingOthers} 位尚可行动。${ctx.preflopRaises ? '面对已有加注，平跟能保留较宽范围，但也可能把底池带入多人。' : '未加注底池中，单纯跟注让其他人低成本入池。'}`;
    raiseTo();
    lesson = '用加注获取价值，同时保留平跟诱导等替代路线，结合对手倾向选择。';
    plan = `练习候选为 ${actionLabel(s, alternative.action, alternative.amount)}，若有人再次加注，不自动把当前建议延伸为必须打光筹码。`;
  } else if (
    s.action === 'raise' &&
    ctx.extra > Math.max(10 * bigBlind, s.pot * 2.5) &&
    !strongMade &&
    !draw.outs &&
    (s.street !== 0 || tier < 2)
  ) {
    code = 'large-unbacked-bet';
    status = 'consider';
    title =
      s.street === 3 ? '河牌大额下注，需要明确哪些牌会弃牌' : '大额投入缺少明显牌力或听牌支持';
    reason = `你当时是 ${handLabel}，额外下注 ${number(ctx.extra)}，约 ${ctx.betRatio.toFixed(1)} 倍底池，${ctx.opponents} 位对手尚未弃牌。${ctx.missedDraw ? '此前听牌在河牌落空。' : ''}${ctx.nutFlushBlocker ? '你有该花色 A，能阻断部分坚果同花，但不代表对手一定弃牌。' : '没有识别出坚果同花 A 阻断，不能据此假设对手会频繁弃牌。'}`;
    alternative = {
      action: s.legal.canCheck ? 'check' : high + uncertainty < price.required ? 'fold' : 'call',
      amount: s.legal.canCheck || high + uncertainty < price.required ? 0 : s.legal.callAmount,
    };
    lesson = '给诈唬一个明确目标范围，而不是用很大金额补偿弱牌。';
    plan = '若没有对手弃牌倾向的依据，先比较过牌或小投入路线，这里没有计算诈唬的精确收益。';
  } else if (
    s.action === 'check' &&
    strongMade &&
    ((texture.maxSuit >= 3 && ctx.made.score[0] < 5) ||
      (ctx.made.score[0] === 5 && checkRisks(s, ctx).length))
  ) {
    code = 'dangerous-made-check';
    title = '危险牌面上，先保留过牌与有条件取值的比较';
    reason = '当前成牌仍有摊牌机会，但公共牌允许对手组成更强的牌，不能只凭牌型机械建议下注。';
    alternative = { action: 'check', amount: 0 };
    lesson = '先列出愿意付费的较弱牌，再比较下注尺度，遇到更强继续范围时控制投入。';
    plan = '只有此前行动支持较弱牌仍会跟注时，才比较价值下注，面对加注重新核对价格和范围。';
  } else if (
    s.action === 'check' &&
    strongMade &&
    s.legal.canRaise &&
    !(handClass === 'top-pair' && ctx.opponents > 1 && texture.wet)
  ) {
    code = 'value-check';
    status = 'consider';
    title = '这次过牌可与价值下注比较';
    reason = `当时是 ${handLabel}，公共牌${texture.label}，仍有 ${ctx.opponents} 位对手。${s.street === 3 && price.closing ? '河牌最后行动，过牌后直接摊牌，不能再诱导下注。' : ctx.inPosition ? '你有最后行动的位置优势。' : '你在其余对手之前行动，过牌可以保留诱导路线。'}${handClass === 'overpair' ? `超对可以向较弱一对${s.street < 3 ? '或部分听牌' : ''}取值，但不能忽视更强成牌。` : '当前成牌具备价值潜力，过牌是否更好仍取决于对手继续范围。'}`;
    raiseTo();
    lesson =
      s.street === 3
        ? '河牌价值下注只向更弱的成牌取值，听牌已没有改善机会。'
        : texture.wet
          ? '比较价值与保护：让较弱成牌或听牌付费，同时为面对加注保留判断。'
          : '干燥牌面可以考虑较小价值尺度，给较弱牌留下继续空间。';
    plan = `可用 ${actionLabel(s, alternative.action, alternative.amount)} 比较，若被加注，重新判断其强牌密度，不把“可下注”理解为“必须继续”。`;
  } else if (s.action === 'call' && handClass === 'top-pair' && ctx.opponents > 1 && texture.wet) {
    code = 'multiway-top-pair';
    status = 'consider';
    title = '多人湿润牌面，顶对需要谨慎实现权益';
    reason = `${handLabel} 面对 ${ctx.opponents} 位对手，公共牌${texture.label}。${priced}${estimated}多人底池中，一对的摊牌能力更容易被两对、三条或听牌追上。`;
    lesson = '保留价格判断，同时减少把顶对当成全下价值牌的倾向。';
    plan = price.closing
      ? '这次跟注后不再有下注决策，重点检验当前价格与对手范围。'
      : s.street === 3
        ? '若本轮再遇到加注，按新价格判断，不因已经跟过就继续。'
        : '若下一轮再次遇到大下注，按新牌面重算，不因已经跟过一轮就继续跟注。';
  } else if (s.action === 'fold' && price.cost > 0 && low - uncertainty > price.required + 0.08) {
    code = 'tight-fold';
    status = 'consider';
    title = '弃牌可能偏紧，值得重新核对范围';
    reason = `当时是 ${handLabel}。${priced}${estimated}在这两种范围假设下，权益有价格余量，但尚未证明对手真实范围也如此。`;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = '区分对手真实偏强与单纯害怕输牌，范围证据不足时保留两种路线。';
    plan = price.closing
      ? '重点检验对手价值牌与诈唬组合，不再依赖后续隐含收益。'
      : '如果跟注，先规划后续不利牌和再加注的应对，避免把当前权益全部当成可实现收益。';
  } else if (s.action === 'fold') {
    code = 'priced-fold';
    title = '按当前价格与风险复查这次弃牌';
    reason = `你在 ${s.position} 持 ${handLabel}，需再补 ${number(s.legal.callAmount)}。${s.street ? '公共牌' + texture.label + '。' : ''}${price.cost ? priced : ''}${draw.outs ? '当前直接成牌候选 ' + draw.outs + ' 张，下一张约 ' + percent(draw.nextChance) + '，并非保证获胜。' : '没有识别出直接的顺子或同花成牌听牌。'}`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '把退出条件建立在当前价格、牌力和位置上，已投入筹码不构成必须继续的理由。';
    plan = '重打时可以比较另一条路线，但后面发出的好牌不能反过来证明这一步应当跟注。';
  } else if (s.action === 'call') {
    code = ctx.pastCalls >= 2 ? 'multi-street-call' : 'priced-call';
    title =
      ctx.pastCalls >= 2 ? '连续多轮跟注，当前价格应独立评估' : '这次跟注需要结合价格与实现条件';
    reason = `你持 ${handLabel}，${ctx.opponents} 位对手仍在局中。${priced}${estimated}${ctx.pastCalls >= 2 ? '此前已在 ' + ctx.pastCalls + ' 个较早轮次跟注，过去投入不提高本次权益。' : ''}${draw.outs ? '直接成牌候选 ' + draw.outs + ' 张，下一张约 ' + percent(draw.nextChance) + '。' : ''}`;
    lesson = price.closing
      ? '本次无需再为后续下注预留筹码，重点比较范围假设与价格。'
      : '有价格空间不等于可以自动跟到底，继续行动和权益实现仍有风险。';
    plan = price.closing
      ? '用不同对手范围重算这一跟注，观察结论是否稳定。'
      : `留意 ${ctx.pendingOthers} 位尚可行动的玩家，以及下一张牌是否形成更强的顺子或同花结构。`;
  } else if (s.action === 'raise') {
    code = valueTarget ? 'value-bet' : draw.outs ? 'draw-bet' : 'pressure-bet';
    title = valueTarget
      ? !s.street && pre.raises >= 2 && !(s.hole[0].rank === s.hole[1].rank && s.hole[0].rank >= 13)
        ? '多次加注后的进攻，需要核对取值与弃牌条件'
        : '这次下注有价值目标可核对'
      : draw.outs
        ? '带听牌主动下注，要同时考虑被跟注后权益'
        : '主动施压的收益依赖对手退出范围';
    reason = `${handLabel} 额外投入 ${number(ctx.extra)}，约底池的 ${percent(ctx.betRatio)}，公共牌${s.street ? texture.label : '尚未发出'}，${ctx.opponents} 位对手尚在。${draw.outs ? '同时有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '。' : valueTarget ? '可以尝试从较弱的牌取得价值，对手愿意跟哪些牌仍需判断。' : '当前未识别出直接的顺子或同花听牌，不能默认被跟注后有足够改善机会。'}`;
    alternative = { action: 'raise', amount: s.amount };
    if (s.street > 0 && !valueTarget && !draw.outs) {
      status = 'consider';
      const affordableMade =
        ctx.made.score[0] >= 1 &&
        !['board', 'board-pair'].includes(ctx.handClass) &&
        low - uncertainty > price.required + 0.05;
      alternative = s.legal.canCheck
        ? { action: 'check', amount: 0 }
        : affordableMade
          ? { action: 'call', amount: s.legal.callAmount }
          : { action: 'fold', amount: 0 };
    }
    lesson = valueTarget
      ? '具体列出愿意付费的较弱牌，不把牌型名称当成最优尺度的证明。'
      : '先确定哪些对手范围会退出，再衡量被跟注后是否能继续。';
    plan = s.legal.isShortAllin
      ? '这是不足完整加注的全下，对已经行动的玩家不一定重新开放加注权。'
      : s.amount === s.legal.maxRaiseTo
        ? '已投入全部筹码，优化应放在全下前的价格、范围与尺度判断。'
        : s.street === 3
          ? '若被再加注，重新比较价格与范围，被跟注后直接摊牌。'
          : '若被再加注，重新比较价格与范围，若被跟注，按下一轮牌面重新制定价值或退出路线。';
  } else {
    code = handClass === 'board' ? 'board-check' : draw.outs ? 'draw-check' : 'pot-control';
    title =
      handClass === 'board'
        ? '公共牌已成牌，底牌没有额外优势'
        : draw.outs
          ? '过牌保留听牌，避免提前放大底池'
          : '这次过牌可用于控制底池';
    reason = `当时是 ${handLabel}，公共牌${texture.label}，无需补筹码。${draw.outs ? '有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '，过牌不额外支付这个机会。' : ctx.pendingOthers ? '之后还有 ' + ctx.pendingOthers + ' 位玩家可行动，过牌并不保证免费看到下一张。' : '你可以观察后面的牌面或进入摊牌。'}`;
    alternative = { action: 'check', amount: 0 };
    lesson =
      s.street === 3 && price.closing
        ? '这是最后行动，过牌直接摊牌，比较的是免费摊牌与主动取值。'
        : '过牌后仍应区分免费机会与面对下注时的继续条件。';
    plan =
      s.street === 3 && price.closing
        ? '重打时比较能否向更弱成牌取值，公共牌单独成牌时，先考虑平分权益。'
        : '遇到下注后按实际金额重算，若公共牌单独成牌，先考虑平分权益，不虚构底牌带来的优势。';
  }
  if (alternative.action === 'raise' && !s.legal.canRaise)
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  if (alternative.action === 'call' && s.legal.canCheck)
    alternative = { action: 'check', amount: 0 };
  if (
    alternative.action === 'call' &&
    price.cost > 0 &&
    high + uncertainty < price.required &&
    !ctx.positionedEntry?.eligible
  ) {
    alternative = { action: 'fold', amount: 0 };
    status = 'consider';
    reason += ' 两种范围下较乐观的权益估计加上抽样余量仍低于当前保本门槛，缺少按此价格跟注的依据。';
    lesson = '修正过大的进攻时，跟注也必须单独通过价格检查，不能自动作为安全备选。';
  }
  const evidence = [
    `位置 ${s.position}，${ctx.opponents} 位未弃牌对手${s.street ? '，' + (ctx.inPosition ? '有位置' : '无最后行动优势') : ''}`,
    `底牌 ${cardText(s.hole)}，当时牌力：${handLabel}${draw.outs ? '，' + drawLabel(draw) : ''}`,
    s.street
      ? `公共牌 ${cardText(s.board)}，${texture.label}`
      : `翻牌前加注 ${ctx.preflopRaises} 次，本轮还有 ${ctx.pendingOthers} 位对手等待回应`,
    investmentText(s, ctx, price),
  ];
  if (draw.outs)
    evidence.push(
      `顺子／同花改善候选 ${draw.outs} 张，下一张约 ${percent(draw.nextChance)}，部分补牌也可能让对手成更大的牌。`,
    );
  if ((price.cost || s.legal.callAmount) && ['call', 'fold'].includes(s.action))
    evidence.push(priced);
  if (s.action === 'raise')
    evidence.push(`实际${actionLabel(s)}，额外投入是当时底池的 ${ctx.betRatio.toFixed(1)} 倍。`);
  if (pre) {
    const level = pre.raises ? `最高 ${pre.raises + 1}-bet` : pre.label;
    evidence.push(`入池情境：${level}，跛入 ${pre.limpers} 人`);
  }
  let routes = comparisonRoutes(s, ctx, { code, status, alternative, pre });
  let simulation = null;
  if (
    rollouts &&
    !ctx.guaranteedBoard &&
    Number.isInteger(s.dealer) &&
    s.players.every((p) => 'actedTo' in p)
  ) {
    simulation = compareCandidateActions(s, [routes.primary, alternative, routes.secondary], {
      trials: rolloutTrials,
    });
    if (!simulation.stable && status !== 'attention')
      confidence = '范围与后续策略敏感，未证明唯一最优';
    if (
      simulation.stable &&
      simulation.comparisonReady &&
      simulation.rows
        .find(
          (row) =>
            row.action.action === simulation.best.action &&
            row.action.amount === simulation.best.amount,
        )
        .scenarios.every(
          (v) =>
            v.vsActual.informative &&
            v.vsActual.lower > Math.max(0.2 * bigBlindOf(s), s.pot * 0.01),
        ) &&
      !['free-fold', 'expensive-call', 'weak-threebet-defense', 'weak-fourbet-defense'].includes(
        code,
      ) &&
      (simulation.best.action !== alternative.action ||
        (simulation.best.action === 'raise' && simulation.best.amount !== alternative.amount))
    ) {
      const previous = alternative;
      alternative = simulation.best;
      status = 'consider';
      confidence = '两种范围抽样一致，但后续策略仍是模型';
      reason += ` 候选行动模拟中，${actionLabel(s, alternative.action, alternative.amount)} 在两种范围下均有较明确的筹码收益优势，值得替代原启发式建议进行练习，这个优势依赖模拟继续策略，不是最优打法证明。`;
      routes = {
        primary: {
          ...alternative,
          label: actionLabel(s, alternative.action, alternative.amount),
          summary: '模拟候选：' + actionLabel(s, alternative.action, alternative.amount),
          condition: '本次公开风格、两种起始范围及均衡后续策略能代表练习对局时。',
          tradeoff: '抽样结果支持优先比较，但真实继续范围与更好的后续打法仍可能改变排序。',
        },
        secondary: {
          ...previous,
          label: actionLabel(s, previous.action, previous.amount),
          condition: '改变对手范围或后续策略时，保留原保守／价值路线作对照。',
          tradeoff: '结合下方数字与具体条件判断，不把模拟领先当成必须执行。',
        },
      };
      plan += ' 重打时优先对照模拟候选与原路线，若对手的防守方式明显不同，重新分析。';
    }
  }
  if (!rollouts && status !== 'attention') confidence = '范围与后续策略敏感，未证明唯一最优';
  const result = {
    index: s.index,
    status,
    code,
    title,
    reason,
    lesson,
    plan,
    confidence,
    evidence,
    alternative,
    alternativeLabel: actionLabel(s, alternative.action, alternative.amount),
    routes,
    recommendation: routes.primary.summary,
    simulation,
    metrics: {
      required: price.required,
      equityLow: low,
      equityHigh: high,
      randomEquity: wide.equity,
      weightedEquity: strong.equity,
      uncertainty,
      callCost: price.cost,
      contestable: price.contestable,
      closing: price.closing,
      sidePots: price.pots.length > 1,
      trials: wide.samples || trials,
      method: wide.method || 'sampling',
      randomEV: wide.ev,
      weightedEV: strong.ev,
    },
    draw,
    context: ctx,
  };
  result.coaching = coachDecision(s, result);
  ctx.publicStrategy = reviewStrategy(s, ctx, price);
  result.coaching = enrichStrategy(
    result.coaching,
    s,
    ctx.publicStrategy,
    result.coaching.recommendedAction,
  );
  return result;
}
export function summarizeReview(input, steps) {
  const overview = buildOverview(input, steps);
  return {
    steps,
    priorityIndex: overview.priorityIndex,
    attention: steps.filter((s) => s.coaching.kind === 'improve').length,
    consider: steps.filter((s) => ['compare', 'value'].includes(s.coaching.kind)).length,
    themes: [...new Set(steps.filter((s) => s.coaching.kind !== 'keep').map((s) => s.title))],
    title: overview.title,
    summary: overview.summary,
    overview,
  };
}
export function analyzeReview(input, options) {
  return summarizeReview(
    input,
    input.decisions.map((s) => analyzeDecision(s, options)),
  );
}
