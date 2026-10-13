import { callPrice, sampleValue } from './equity.js';
import { decisionContext, startingTier, drawInfo } from './context.js';
import { preflopContext } from './preflop.js';
import { comparisonRoutes } from './routes.js';
import { compareCandidateActions } from './counterfactual.js';
import { coachDecision, buildOverview } from './coaching.js';
import { drawLabel } from './narrative.js';
import { actionLabel } from '../engine/action-labels.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';
export { actionLabel } from '../engine/action-labels.js';
export { callPrice } from './equity.js';
export { startingTier, drawInfo } from './context.js';

export const STREET_NAMES = ['翻牌前', '翻牌', '转牌', '河牌'];
const number = (n) => Math.round(n).toLocaleString('en-US');
const percent = (n) => Math.round(n * 100) + '%';
const rangeText = (low, high) =>
  percent(low) === percent(high) ? '约 ' + percent(low) : percent(low) + '–' + percent(high);
export function createReviewInput(g) {
  if (g.phase !== 'done') throw Error('牌局结束后才能复盘。');
  return JSON.parse(
    JSON.stringify({
      hand: g.hand,
      hole: g.players[0].hole,
      decisions: g.decisions || [],
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
  { trials = 600, rolloutTrials = Math.max(12, Math.min(64, Math.round(trials / 15))) } = {},
) {
  if (!Number.isInteger(trials) || trials < 1) throw Error('抽样次数必须是正整数。');
  const price = callPrice(s),
    wide = sampleValue(s, price, trials, false),
    strong = sampleValue(s, price, trials, true),
    ctx = decisionContext(s);
  const pre = s.street === 0 ? preflopContext(s) : null;
  const low = Math.min(wide.equity, strong.equity),
    high = Math.max(wide.equity, strong.equity),
    uncertainty = Math.max(wide.margin, strong.margin);
  const { draw, texture, handClass, handLabel, tier } = ctx,
    early = ['UTG', 'UTG+1', 'MP', 'LJ'].includes(s.position),
    deep = ctx.effective >= 2500;
  const priced = `本次有效跟注成本 ${number(price.cost)}，跟注后可争夺 ${number(price.contestable)}，盈亏平衡权益约 ${percent(price.required)}。`;
  const estimated = `随机范围与行动加权范围下，底池权益分别约 ${percent(wide.equity)} / ${percent(strong.equity)}。`;
  const strongMade =
    s.street > 0 &&
    !['high', 'underpair', 'middle-pair', 'board', 'board-pair'].includes(handClass) &&
    !(texture.maxSuit >= 4 && ctx.made.score[0] < 5);
  const valueTarget = strongMade || (s.street === 0 && tier >= 2);
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
      const limpers = s.history.filter((a) => a.street === 0 && a.action === 'call').length;
      target = s.currentBet <= 50 ? 150 + 50 * limpers : s.currentBet * (ctx.inPosition ? 3 : 4);
    } else if (s.currentBet > 0) target = s.currentBet * (ctx.inPosition ? 2.5 : 3);
    else target = s.pot * (texture.wet || ctx.opponents > 1 ? 0.65 : 0.4);
    alternative = {
      action: 'raise',
      amount: legalRaiseTo(target, s.legal),
    };
  };
  if (s.action === 'fold' && s.legal.canCheck) {
    code = 'free-fold';
    status = 'attention';
    confidence = '规则与成本明确';
    title = '无需补筹码，弃牌放弃了免费机会';
    reason = `当时你在 ${s.position}，跟注成本为 0。过牌保留本手权益，不会增加投入；${ctx.pendingOthers ? '后面还有 ' + ctx.pendingOthers + ' 位玩家可以行动。' : '本轮没有必须补齐的下注。'}`;
    alternative = { action: 'check', amount: 0 };
    lesson = '先免费过牌，面对后续下注再评估价格。';
    plan = '下一步若有人下注，按新的金额和参与人数重新计算，不预先承诺跟到底。';
  } else if (
    pre?.unopened &&
    pre.late &&
    pre.openingCandidate &&
    tier < 2 &&
    s.action === 'raise' &&
    ctx.extra <= 400 &&
    s.amount < s.legal.maxRaiseTo
  ) {
    code = pre.limpers ? 'late-isolation' : 'late-open';
    title = pre.limpers ? '后位隔离加注，要区分人数与跟注倾向' : '后位主动开池有位置与弃牌权益依据';
    reason = `${handLabel} 在 ${s.position} ${pre.limpers ? '面对 ' + pre.limpers + ' 位跛入者' : '行动弃到你，前面没有开池'}，加注至 ${number(s.amount)}（${(s.amount / 50).toFixed(1)} BB）。${pre.ace ? 'A 底牌阻断部分 AA、AK、AQ 组合；后位允许比早位更宽的开池范围。' : '后位能以较宽范围争夺盲注，并在翻后获得位置优势。'}加注可让部分弱连张和高牌退出，收益包含弃牌权益；被跟注后，留下的范围可能更强${pre.weakAce ? '，A' + pre.kicker + ' 成顶对仍容易被更好的 A 踢脚压制' : ''}。${pre.limpers ? '这里是隔离加注；已有开池再加平跟后才叫挤压加注。' : '这里是开池／偷盲，不是挤压加注。'}`;
    alternative = {
      action: 'raise',
      amount: legalRaiseTo(125 + pre.limpers * 50, s.legal),
    };
    lesson = '开池能力与接再加注能力分开判断；A high 不是必须弃牌的理由，也不是跟到底的理由。';
    plan = `${pre.limpers ? '跛入者跟注较多时，提高隔离尺度并收紧范围；多人跟注后减少无依据持续施压。' : '比较 2–3 BB 开池：较小尺度降低偷盲成本，较大尺度提高即时压力，但要看盲位的继续范围。'}面对小额、宽范围 3-bet 才考虑有位置防守；大尺度或 4-bet 优先收紧。翻后顶对弱踢脚以控池为主，未中牌时结合牌面与对手范围决定是否持续下注。`;
  } else if (
    pre &&
    pre.raises >= 2 &&
    (pre.weakAce || tier === 0) &&
    ['call', 'raise'].includes(s.action)
  ) {
    code = pre.raises >= 3 ? 'weak-fourbet-defense' : 'weak-threebet-defense';
    status = pre.raises >= 3 || price.cost >= s.stack * 0.1 ? 'attention' : 'consider';
    title = pre.raises >= 3 ? '多次再加注下，弱牌防守缺少支撑' : '可开池的牌，不等于可以宽接 3-bet';
    reason = `${handLabel} 在 ${s.position}，${pre.label}，最新总额 ${number(s.currentBet)}，约上一次的 ${pre.ratio.toFixed(1)} 倍。${priced}${estimated}${pre.ownOpen ? '你此前的开池有合理依据，但这一跟注是新的独立决策。' : ''}${pre.weakAce ? '较强 Ax 压制你的踢脚，单靠持有 A 的阻断不够支持大额跟注。' : '弱牌被强范围压制，缺少稳健的翻后实现条件。'}${ctx.pendingOthers ? '后面仍有 ' + ctx.pendingOthers + ' 人可再次行动。' : ''}`;
    alternative = { action: 'fold', amount: 0 };
    lesson =
      pre.raises >= 3
        ? '已投入的开池和跟注不能成为继续接 4-bet 的依据。'
        : '区分偷盲范围与防守再加注范围，核对尺度、位置、同花潜力和对手宽度。';
    plan =
      pre.raises >= 3
        ? '对多次加注且缺少宽范围依据的情形，优先停止新增投入；只有清晰的极宽范围证据与有利价格才重新讨论防守。'
        : `备选为小额有位置跟注，但需要对手 3-bet 足够宽、价格有余量${pre.suited ? '，同花潜力有助于实现权益' : '；不同花弱 A 需要更严格的防守条件'}。低 SPR 或大尺度压力下不要仅为看翻牌继续。`;
  } else if (
    pre?.unopened &&
    pre.late &&
    pre.openingCandidate &&
    tier < 2 &&
    !pre.limpers &&
    ctx.effective >= 500 &&
    s.legal.canRaise &&
    ['fold', 'call'].includes(s.action)
  ) {
    code = 'late-passive-entry';
    status = 'consider';
    title = '后位可比较主动开池，而非只看起手牌档位';
    reason = `${handLabel} 在 ${s.position}，无人主动入池。${pre.ace ? 'A 阻断部分强 Ax，后位允许更宽地争夺盲注。' : '翻后位置与对手退出空间支持比较主动开池。'}${s.action === 'call' ? '单纯跛入让盲位低成本看牌，缺少主动弃牌权益。' : '弃牌避免投入，但也放弃了后位争夺盲注的机会。'}这不等于被加注后还应继续；盲位很黏或有效筹码很短时需要另行调整。`;
    alternative = {
      action: 'raise',
      amount: legalRaiseTo(125, s.legal),
    };
    lesson = '把主动开池与接再加注拆成两套继续条件。';
    plan =
      '比较 2–3 BB 开池与当前保守路线；若遇大尺度 3-bet 或 4-bet，弱 A 优先收紧。顶对弱踢脚时避免自动把筹码打光。';
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
    reason = `${handLabel} 在 ${s.position}，已有开池及 ${pre.callersAfterOpen} 次平跟，你再加注至 ${number(s.amount)}，属于挤压加注。A 阻断部分强 A 组合，可帮助挑选诈唬候选；但不同花弱 A 被跟注后仍可能被更强 Ax 压制。是否值得挤压，关键是开池者是否足够宽、平跟者是否会退出，以及你面对 4-bet 能否及时停止。`;
    alternative = { action: 'fold', amount: 0 };
    lesson = '减少人数不是收益证明；即刻弃牌权益与被继续后的牌力要分开评估。';
    plan =
      '没有对手范围与弃牌倾向证据时优先收紧；具备宽开池／可弃平跟的证据时，重打比较有位置挤压与弃牌，避免把持有 A 当成无条件进攻依据。';
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
    reason = `${handLabel} 确实是同花牌，具备同花潜力；不能按不同花弱牌处理。你在 ${s.position}，后面仍有 ${ctx.pendingOthers} 人可行动。${pre.kicker <= 8 ? '较小踢脚使顶对容易被更强同点数高牌压制，' : ''}同花潜力并不能消除无位置和再加注压力。常规收紧范围可选择弃牌；若后面明显过紧、很少 3-bet，则可以比较小尺度开池利用其弃牌。`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '同花、位置、踢脚与防守倾向一起判断，不能只根据“有高张／同花”入池或根据档位直接判错。';
    plan =
      '把当前开池与弃牌放进候选行动模拟，查看对手范围改变时哪条路线占优。面对 3-bet 收紧，顶对弱踢脚控制底池；同花听牌仍按实际价格和后续付费判断。';
  } else if (
    s.street === 0 &&
    tier === 0 &&
    (s.action === 'call' || s.action === 'raise') &&
    ((pre.raises > 0 && s.currentBet >= 150) || early)
  ) {
    code = 'weak-entry';
    status = early && !pre.raises ? 'attention' : 'consider';
    title = early && !pre.raises ? '早位弱牌入池缺少位置支持' : '面对开池，先核对价格与被压制风险';
    reason = `你拿 ${handLabel}，处于 ${s.position}，当前需补 ${number(s.legal.callAmount)}；仍有 ${ctx.pendingOthers} 位玩家尚可行动。${early ? '早位缺少位置优势，' + (pre.suited ? '同花潜力仍需承担踢脚、连接性及再加注风险。' : '不同花边缘牌更难实现权益。') : '前面已有加注，弱牌被更好顶对或更高踢脚压制的风险增加。'}`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '主动开池、平跟已有开池和防守再加注需要不同范围，不能只按起手牌档位判断。';
    plan = '若以后在大盲面对很小加注，应重新按价格判断，不能把“弱牌”直接等同于必须弃牌。';
  } else if (
    s.action === 'raise' &&
    s.amount === s.legal.maxRaiseTo &&
    deep &&
    ctx.betRatio > 4 &&
    s.street === 0 &&
    tier >= 2
  ) {
    code = 'deep-value-shove';
    status = 'consider';
    title = '深筹码强牌直接全下，可能压缩价值空间';
    reason = `${handLabel} 有价值，但这次额外投入 ${number(ctx.extra)}（约 ${Math.round(ctx.extra / 50)} BB），是当时底池 ${number(s.pot)} 的 ${ctx.betRatio.toFixed(1)} 倍；有效剩余筹码约 ${Math.round(ctx.effective / 50)} BB。如此大的压力可能让愿意跟常规加注的较弱牌退出，不能仅凭强牌认定全下最好。`;
    raiseTo();
    lesson = '优先比较正常开池或再加注与全下，让较弱范围有机会付费。';
    plan = `可以先用 ${actionLabel(s, alternative.action, alternative.amount)} 这条路线练习；若对手再加注，再结合其范围和有效筹码决定继续。此尺度是练习候选，不保证多赚。`;
  } else if (s.action === 'call' && price.cost > 0 && high + uncertainty + 0.035 < price.required) {
    code = 'expensive-call';
    status = price.closing ? 'attention' : 'consider';
    title = price.closing ? '这次跟注的价格缺少权益支持' : '跟注偏贵，后续压力还需额外考虑';
    reason = `当时是 ${handLabel}，面对 ${ctx.opponents} 位未弃牌对手。${priced}${estimated}${draw.outs ? '当前有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '；成牌仍可能输给更强牌。' : ''}`;
    alternative = { action: 'fold', amount: 0 };
    lesson = price.closing
      ? '在这两种假设下，跟注价格高于估计权益，倾向停止投入。'
      : '抽到最终摊牌的权益不等于实际能实现的权益；跟注后还可能再付费。';
    plan = price.closing
      ? '本次跟注将结束你的下注决策，重点核对对手是否有足够诈唬，不能把未来额外收益作为理由。'
      : `后面尚有 ${ctx.pendingOthers} 位玩家可能行动；若跟注，先设定面对再加注或不利转牌时的退出条件。`;
  } else if (s.street === 0 && tier === 3 && s.action === 'fold') {
    code = 'premium-fold';
    status = 'consider';
    title = '强起手牌的弃牌需要解释下注压力';
    reason = `你持有 ${handLabel}，当前 ${number(s.currentBet)}、需补 ${number(s.legal.callAmount)}，有效筹码约 ${Math.round(ctx.effective / 50)} BB；本手已出现 ${ctx.preflopRaises} 次翻牌前加注。${ctx.preflopRaises >= 2 ? '多次再加注会收紧对手范围，不能仅用强牌标签否定弃牌。' : '常规压力下，这组牌通常值得继续比较跟注或再加注。'}`;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = '把强牌与实际下注强度一起判断，避免机械全下或机械弃牌。';
    plan =
      ctx.preflopRaises >= 2
        ? '重点辨别这是宽范围争夺还是少诈唬的强范围；证据不足时将结论保留为讨论项。'
        : '可以重打本手，比较主动加注和跟注两条路线。';
  } else if (s.street === 0 && tier === 3 && s.action === 'call' && s.legal.canRaise) {
    code = 'premium-flat';
    status = 'consider';
    title = '强起手牌可比较主动建立底池';
    reason = `${handLabel} 在 ${s.position} 跟注 ${number(s.legal.callAmount)}，${ctx.opponents} 位对手仍在局中，${ctx.pendingOthers} 位尚可行动。${ctx.preflopRaises ? '面对已有加注，平跟能保留较宽范围，但也可能把底池带入多人。' : '未加注底池中，单纯跟注让其他人低成本入池。'}`;
    raiseTo();
    lesson = '用加注获取价值，同时保留平跟诱导等替代路线，结合对手倾向选择。';
    plan = `练习候选为 ${actionLabel(s, alternative.action, alternative.amount)}；若有人再次加注，不自动把当前建议延伸为必须打光筹码。`;
  } else if (
    s.action === 'raise' &&
    ctx.extra > Math.max(500, s.pot * 2.5) &&
    !strongMade &&
    !draw.outs &&
    (s.street !== 0 || tier < 2)
  ) {
    code = 'large-unbacked-bet';
    status = 'consider';
    title =
      s.street === 3 ? '河牌大额下注，需要明确哪些牌会弃牌' : '大额投入缺少明显牌力或听牌支持';
    reason = `你当时是 ${handLabel}，额外下注 ${number(ctx.extra)}，约 ${ctx.betRatio.toFixed(1)} 倍底池；${ctx.opponents} 位对手尚未弃牌。${ctx.missedDraw ? '此前听牌在河牌落空。' : ''}${ctx.nutFlushBlocker ? '你有该花色 A，能阻断部分坚果同花，但不代表对手一定弃牌。' : '没有识别出坚果同花 A 阻断，不能据此假设对手会频繁弃牌。'}`;
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
    lesson = '给诈唬一个明确目标范围，而不是用很大金额补偿弱牌。';
    plan = '若没有对手弃牌倾向的依据，先比较过牌或小投入路线；这里没有计算诈唬的精确收益。';
  } else if (
    s.action === 'check' &&
    strongMade &&
    s.legal.canRaise &&
    !(handClass === 'top-pair' && ctx.opponents > 1 && texture.wet)
  ) {
    code = 'value-check';
    status = 'consider';
    title = '这次过牌可与价值下注比较';
    reason = `当时是 ${handLabel}，公共牌${texture.label}，仍有 ${ctx.opponents} 位对手。${s.street === 3 && price.closing ? '河牌最后行动，过牌后直接摊牌，不能再诱导下注。' : ctx.inPosition ? '你有最后行动的位置优势。' : '你在其余对手之前行动，过牌可以保留诱导路线。'}${handClass === 'overpair' ? `超对可以向较弱一对${s.street < 3 ? '或部分听牌' : ''}取值，但不能忽视更强成牌。` : '当前成牌具备价值潜力；过牌是否更好仍取决于对手继续范围。'}`;
    raiseTo();
    lesson =
      s.street === 3
        ? '河牌价值下注只向更弱的成牌取值，听牌已没有改善机会。'
        : texture.wet
          ? '比较价值与保护：让较弱成牌或听牌付费，同时为面对加注保留判断。'
          : '干燥牌面可以考虑较小价值尺度，给较弱牌留下继续空间。';
    plan = `可用 ${actionLabel(s, alternative.action, alternative.amount)} 比较；若被加注，重新判断其强牌密度，不把“可下注”理解为“必须继续”。`;
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
        : '若下一轮再次遇到大下注，按新牌面重算；不因已经跟过一轮就继续跟注。';
  } else if (s.action === 'fold' && price.cost > 0 && low - uncertainty > price.required + 0.08) {
    code = 'tight-fold';
    status = 'consider';
    title = '弃牌可能偏紧，值得重新核对范围';
    reason = `当时是 ${handLabel}。${priced}${estimated}在这两种范围假设下，权益有价格余量，但尚未证明对手真实范围也如此。`;
    alternative = { action: 'call', amount: s.legal.callAmount };
    lesson = '区分对手真实偏强与单纯害怕输牌；范围证据不足时保留两种路线。';
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
      : '有价格空间不等于可以自动跟到底；继续行动和权益实现仍有风险。';
    plan = price.closing
      ? '用不同对手范围重算这一跟注，观察结论是否稳定。'
      : `留意 ${ctx.pendingOthers} 位尚可行动的玩家，以及下一张牌是否形成更强的顺子或同花结构。`;
  } else if (s.action === 'raise') {
    code = valueTarget ? 'value-bet' : draw.outs ? 'draw-bet' : 'pressure-bet';
    title = valueTarget
      ? '这次下注有价值目标可核对'
      : draw.outs
        ? '带听牌主动下注，要同时考虑被跟注后权益'
        : '主动施压的收益依赖对手退出范围';
    reason = `${handLabel} 额外投入 ${number(ctx.extra)}，约底池的 ${percent(ctx.betRatio)}；公共牌${s.street ? texture.label : '尚未发出'}，${ctx.opponents} 位对手尚在。${draw.outs ? '同时有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '。' : valueTarget ? '可以尝试从较弱的牌取得价值；对手愿意跟哪些牌仍需判断。' : '当前未识别出直接的顺子或同花听牌，不能默认被跟注后有足够改善机会。'}`;
    alternative = { action: 'raise', amount: s.amount };
    lesson = valueTarget
      ? '具体列出愿意付费的较弱牌，不把牌型名称当成最优尺度的证明。'
      : '先确定哪些对手范围会退出，再衡量被跟注后是否能继续。';
    plan = s.legal.isShortAllin
      ? '这是不足完整加注的全下，对已经行动的玩家不一定重新开放加注权。'
      : s.amount === s.legal.maxRaiseTo
        ? '已投入全部筹码，优化应放在全下前的价格、范围与尺度判断。'
        : s.street === 3
          ? '若被再加注，重新比较价格与范围；被跟注后直接摊牌。'
          : '若被再加注，重新比较价格与范围；若被跟注，按下一轮牌面重新制定价值或退出路线。';
  } else {
    code = handClass === 'board' ? 'board-check' : draw.outs ? 'draw-check' : 'pot-control';
    title =
      handClass === 'board'
        ? '公共牌已成牌，底牌没有额外优势'
        : draw.outs
          ? '过牌保留听牌，避免提前放大底池'
          : '这次过牌可用于控制底池';
    reason = `当时是 ${handLabel}，公共牌${texture.label}，无需补筹码。${draw.outs ? '有 ' + draw.outs + ' 张直接成牌候选，下一张约 ' + percent(draw.nextChance) + '；过牌不额外支付这个机会。' : ctx.pendingOthers ? '之后还有 ' + ctx.pendingOthers + ' 位玩家可行动，过牌并不保证免费看到下一张。' : '你可以观察后面的牌面或进入摊牌。'}`;
    alternative = { action: 'check', amount: 0 };
    lesson =
      s.street === 3 && price.closing
        ? '这是最后行动，过牌直接摊牌，比较的是免费摊牌与主动取值。'
        : '过牌后仍应区分免费机会与面对下注时的继续条件。';
    plan =
      s.street === 3 && price.closing
        ? '重打时比较能否向更弱成牌取值；公共牌单独成牌时，先考虑平分权益。'
        : '遇到下注后按实际金额重算；若公共牌单独成牌，先考虑平分权益，不虚构底牌带来的优势。';
  }
  if (alternative.action === 'raise' && !s.legal.canRaise)
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  if (alternative.action === 'call' && s.legal.canCheck)
    alternative = { action: 'check', amount: 0 };
  const evidence = [
    `位置 ${s.position} · ${ctx.opponents} 位未弃牌对手${s.street ? ' · ' + (ctx.inPosition ? '有位置' : '无最后行动优势') : ''}`,
    `当时牌力：${handLabel}${draw.outs ? ' · ' + drawLabel(draw) : ''}`,
    s.street
      ? `公共牌：${texture.label}`
      : `翻牌前加注 ${ctx.preflopRaises} 次 · 尚可行动 ${ctx.pendingOthers} 人`,
    `有效剩余约 ${number(ctx.effective)} · 新增投入 ${number(ctx.extra)}`,
  ];
  if (draw.outs)
    evidence.push(
      `直接成牌候选 ${draw.outs} 张（已去重）· 下一张约 ${percent(draw.nextChance)}，不等于获胜率`,
    );
  if (price.cost) evidence.push(priced);
  if (pre)
    evidence.push(
      `入池情境：${pre.label} · 跛入 ${pre.limpers} 人${pre.ace ? ' · A 阻断不等于被跟注后优势' : ''}`,
    );
  let routes = comparisonRoutes(s, ctx, { code, status, alternative, pre });
  let simulation = null;
  if (Number.isInteger(s.dealer) && s.players.every((p) => 'actedTo' in p)) {
    simulation = compareCandidateActions(s, [alternative, routes.secondary], {
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
          (v) => v.vsActual.informative && v.vsActual.lower > Math.max(10, s.pot * 0.01),
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
      reason += ` 候选行动模拟中，${actionLabel(s, alternative.action, alternative.amount)} 在两种范围下均有较明确的筹码收益优势，值得替代原启发式建议进行练习；这个优势依赖模拟继续策略，不是最优打法证明。`;
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
      plan += ' 重打时优先对照模拟候选与原路线；若对手的防守方式明显不同，重新分析。';
    }
  }
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
