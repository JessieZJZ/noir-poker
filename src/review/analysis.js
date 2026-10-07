import { callPrice, sampleValue } from './equity.js';
import { decisionContext, startingTier, drawInfo } from './context.js';
export { callPrice } from './equity.js';
export { startingTier, drawInfo } from './context.js';

export const STREET_NAMES = ['翻牌前', '翻牌', '转牌', '河牌'];
const number = (n) => Math.round(n).toLocaleString('en-US');
const percent = (n) => Math.round(n * 100) + '%';
const rangeText = (low, high) =>
  percent(low) === percent(high) ? '约 ' + percent(low) : percent(low) + '–' + percent(high);
export function actionLabel(step, action = step.action, amount = step.amount) {
  if (action === 'raise')
    return (
      (amount === step.legal.maxRaiseTo
        ? '全下至 '
        : step.currentBet === 0
          ? '下注至 '
          : '加注至 ') + number(amount)
    );
  if (action === 'call')
    return (
      (step.legal.callAmount === step.stack ? '全下跟注 ' : '跟注 ') + number(step.legal.callAmount)
    );
  return action === 'fold' ? '弃牌' : '过牌';
}
export function createReviewInput(g) {
  if (g.phase !== 'done') throw Error('牌局结束后才能复盘。');
  return JSON.parse(
    JSON.stringify({
      hand: g.hand,
      hole: g.players[0].hole,
      decisions: g.decisions || [],
      outcome: {
        profit: (g.payouts[0] || 0) - g.players[0].total,
        paid: g.players[0].total,
        returned: g.payouts[0] || 0,
        folded: g.players[0].folded,
        wonPot: g.winners.some((w) => w.id === 0),
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
export function analyzeDecision(s, { trials = 600 } = {}) {
  if (!Number.isInteger(trials) || trials < 1) throw Error('抽样次数必须是正整数。');
  const price = callPrice(s),
    wide = sampleValue(s, price, trials, false),
    strong = sampleValue(s, price, trials, true),
    ctx = decisionContext(s);
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
    else target = Math.round((s.pot * (texture.wet || ctx.opponents > 1 ? 0.65 : 0.4)) / 25) * 25;
    alternative = {
      action: 'raise',
      amount: Math.min(s.legal.maxRaiseTo, Math.max(s.legal.minRaiseTo, Math.round(target))),
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
    s.street === 0 &&
    tier === 0 &&
    (s.action === 'call' || s.action === 'raise') &&
    (s.currentBet >= 150 || early)
  ) {
    code = 'weak-entry';
    status = 'attention';
    title = '弱起手牌在当前入池条件下风险偏高';
    reason = `你拿 ${handLabel}，处于 ${s.position}，当前需补 ${number(s.legal.callAmount)}；仍有 ${ctx.pendingOthers} 位玩家尚可行动。${early ? '早位缺少位置优势，低点数不同花牌更难实现权益。' : '前面已有加注，弱牌被更好顶对或更高踢脚压制的风险增加。'}`;
    alternative = { action: s.legal.canCheck ? 'check' : 'fold', amount: 0 };
    lesson = '收紧这类弱牌；把筹码留给位置、同花潜力或点数更好的组合。';
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
    reason = `当时是 ${handLabel}，公共牌${texture.label}，仍有 ${ctx.opponents} 位对手。${ctx.inPosition ? '你有最后行动的位置优势。' : '你在其余对手之前行动，过牌可以保留诱导路线。'}${handClass === 'overpair' ? '超对可以向较弱一对或部分听牌取值，但不能忽视更强成牌。' : '当前成牌具备价值潜力；过牌是否更好仍取决于对手跟注和主动下注倾向。'}`;
    raiseTo();
    lesson = texture.wet
      ? '比较价值与保护：让较弱成牌或听牌付费，同时为面对加注保留判断。'
      : '干燥牌面可以考虑较小价值尺度，给较弱牌留下继续空间。';
    plan = `可用 ${actionLabel(s, alternative.action, alternative.amount)} 比较；若被加注，重新判断其强牌密度，不把“可下注”理解为“必须继续”。`;
  } else if (s.action === 'call' && handClass === 'top-pair' && ctx.opponents > 1 && texture.wet) {
    code = 'multiway-top-pair';
    status = 'consider';
    title = '多人湿润牌面，顶对需要谨慎实现权益';
    reason = `${handLabel} 面对 ${ctx.opponents} 位对手，公共牌${texture.label}。${priced}${estimated}多人底池中，一对的摊牌能力更容易被两对、三条或听牌追上。`;
    lesson = '保留价格判断，同时减少把顶对当成全下价值牌的倾向。';
    plan = '若下一轮再次遇到大下注，按新牌面重算；不因已经跟过一轮就继续跟注。';
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
    lesson = '过牌后仍应区分免费机会与面对下注时的继续条件。';
    plan = '遇到下注后按实际金额重算；若公共牌单独成牌，先考虑平分权益，不虚构底牌带来的优势。';
  }
  if (alternative.action === 'raise' && !s.legal.canRaise)
    alternative = { action: s.legal.canCheck ? 'check' : 'call', amount: s.legal.callAmount };
  if (alternative.action === 'call' && s.legal.canCheck)
    alternative = { action: 'check', amount: 0 };
  const evidence = [
    `位置 ${s.position} · ${ctx.opponents} 位未弃牌对手${s.street ? ' · ' + (ctx.inPosition ? '有位置' : '无最后行动优势') : ''}`,
    `当时牌力：${handLabel}`,
    s.street
      ? `公共牌：${texture.label}`
      : `翻牌前加注 ${ctx.preflopRaises} 次 · 尚可行动 ${ctx.pendingOthers} 人`,
    `有效剩余约 ${number(ctx.effective)} · 当前 SPR ${ctx.spr.toFixed(1)}`,
  ];
  if (draw.outs)
    evidence.push(
      `直接成牌候选 ${draw.outs} 张（已去重）· 下一张约 ${percent(draw.nextChance)}，不等于获胜率`,
    );
  if (price.cost) evidence.push(priced);
  return {
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
}
export function summarizeReview(input, steps) {
  const attention = steps.filter((s) => s.status === 'attention'),
    consider = steps.filter((s) => s.status === 'consider'),
    priority = [...steps].sort(
      (a, b) =>
        ({ attention: 2, consider: 1, sound: 0 })[b.status] -
        { attention: 2, consider: 1, sound: 0 }[a.status],
    )[0];
  const extra = input.decisions.reduce(
      (sum, s) =>
        sum +
        (s.action === 'raise' ? s.amount - s.bet : s.action === 'call' ? s.legal.callAmount : 0),
      0,
    ),
    themes = [...new Set([...attention, ...consider].map((s) => s.title))];
  const summary = priority
    ? `${input.decisions.length} 次主动决策，共新增投入 ${number(extra)}。优先回到第 ${priority.index + 1} 步（${STREET_NAMES[input.decisions[priority.index]?.street || 0]}）：${priority.title}。${themes.length > 1 ? '另有 ' + (themes.length - 1) + ' 个不同问题可逐步查看。' : ''}`
    : '本手没有主动决策；强制盲注不能归为选择失误。';
  return {
    steps,
    priorityIndex: priority?.index || 0,
    attention: attention.length,
    consider: consider.length,
    themes,
    title: attention.length
      ? '优先核对：' + priority.title
      : consider.length
        ? '值得比较：' + priority.title
        : '未发现明显决策失误',
    summary,
  };
}
export function analyzeReview(input, options) {
  return summarizeReview(
    input,
    input.decisions.map((s) => analyzeDecision(s, options)),
  );
}
