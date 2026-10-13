import { bigBlindOf } from '../engine/stakes.js';
import { compactChips } from '../engine/chip-format.js';
import { actionLabel } from '../engine/action-labels.js';

const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
const fmt = compactChips;
const pct = (n) => Math.round(n * 100) + '%';
const same = (a, b) => a.action === b.action && (a.action !== 'raise' || a.amount === b.amount);
const valueCodes = new Set(['premium-flat', 'value-check', 'deep-value-shove']);

function explanation(s, r) {
  const c = r.context,
    hand = c.handLabel,
    cost = fmt(r.metrics.callCost);
  const copies = {
    'free-fold':
      '当时不用补筹码。先过牌可以免费保留机会，之后遇到下注再决定，直接弃牌没有成本上的好处。',
    'late-open': `你拿 ${hand} 在 ${s.position} 主动开池，能争夺盲注，也能利用后面的位置。即使翻牌没中，也不代表这次开池错误。`,
    'late-isolation': `你拿 ${hand} 在后位加注跛入者，可以减少低成本入池的人数。对手跟得越多，越要减少后续无依据的诈唬。`,
    'late-passive-entry': `行动弃到你的 ${s.position}，${hand} 可以比较小额开池。只跟注会让盲位便宜看牌；遇到再加注仍要重新选牌。`,
    'weak-threebet-defense': `这次面对 3-bet 要重新判断。${hand} 可以用来开池，但接再加注时容易被更好的高牌和踢脚压制，不能因为已经开过池就继续。`,
    'weak-fourbet-defense': `已经出现多次再加注，继续范围通常更强。${hand} 再补 ${cost} 的风险比最初开池大得多，先前投入不是继续跟注的理由。`,
    'early-suited-entry': `同花确实增加 ${hand} 的潜力，但你在 ${s.position}，后面还有 ${c.pendingOthers} 人。小开池是否值得，取决于他们会不会经常跟注或再加注，不能只按同花判好坏。`,
    'weak-entry': `${hand} 在 ${s.position} 入池，要承担被更好踢脚压制和后续加注的风险。位置、价格和对手继续范围，比单看一张高牌更重要。`,
    'squeeze-candidate':
      '已有开池和平跟，你这次再加注是在挤压。它需要对手愿意弃牌；只有一张 A，并不能证明这次大额施压值得。',
    'deep-value-shove': `你有 ${hand}，但直接全下可能赶走本来愿意跟较小加注的弱牌。比较正常加注，让对手继续付费，再决定是否打光筹码。`,
    'expensive-call': `再补 ${cost} 需要约 ${pct(r.metrics.required)} 的底池份额，当前估计约 ${pct(r.metrics.equityLow)}–${pct(r.metrics.equityHigh)}。这个价格偏贵${r.metrics.closing ? '，而且没有后续额外收益可以补回来' : '，后面还可能继续付费'}。`,
    'premium-fold': `你有 ${hand}。如果只是常规加注，可以比较继续；如果已是大额多次再加注，弃牌仍可能合理，不能只按强起手牌判错。`,
    'premium-flat': `${hand} 可以从较弱起手牌拿价值。只跟注保留了诱导机会，但也让更多人便宜看翻牌，值得比较主动加注。`,
    'large-unbacked-bet': `拿 ${hand} 投入 ${fmt(c.extra)}，需要足够多比你好的牌弃掉，才能补偿被跟注后的风险。当前没有充分证据支持这么大的压力。`,
    'value-check': `你已有 ${hand}，可以考虑让较弱的成牌${s.street < 3 ? '或听牌' : ''}付费。${s.street === 3 && r.metrics.closing ? '你是河牌最后行动者，过牌就直接摊牌，无法再诱导下注。' : '过牌适合诱导尚未行动、爱下注的对手；如果对手偏被动，可能错过价值。'}`,
    'multiway-top-pair': `${hand} 面对 ${c.opponents} 位对手，一对的优势会下降。小额跟注和接连续大额下注是两回事，不要自动跟到底。`,
    'priced-fold': `拿 ${hand} 还要补 ${cost}。弃牌控制了新增损失；后来发出好牌，也不能证明当时应该跟注。`,
    'tight-fold': `拿 ${hand} 再补 ${cost}，两种范围估计都留有价格余量，可以比较跟注。若对手实际只用很窄的价值范围下注，弃牌仍可能合理。`,
    'multi-street-call': `你拿 ${hand} 已经跟过较早的轮次，这次仍要独立判断 ${cost} 的价格。过去投入不会让这次跟注更划算。`,
    'priced-call': `拿 ${hand} 补 ${cost} 保留了获池机会。价格是否值得，取决于对手的强牌和诈唬比例${r.metrics.closing ? '，这次之后不必再为下注付费' : '，还要考虑下一轮可能的下注'}。`,
    'value-bet': `你拿 ${hand} 主动下注，可以让更差的牌付费。优化尺度要看对手愿意跟哪些牌，单靠强牌或这次获胜不能证明下注金额最好。`,
    'draw-bet': `你目前有听牌，主动下注既可能让对手弃牌，也保留了改善机会。有人跟注后，仍要按下一张牌和新的价格决定，不能自动打完。`,
    'pressure-bet': `你拿 ${hand} 施压，主要靠对手退出获利。先想清楚哪些比你好的牌会弃掉；对手越爱跟注，越不适合无依据地持续下注。`,
    'board-check':
      '公共牌已经提供主要牌型，你的底牌没有增加优势。过牌避免把平分机会误当成独占优势来下注。',
    'draw-check': `你有听牌，过牌可以先保留改善机会。之后如果有人下注，再看实际跟注价格，而不是默认必须追。`,
    'pot-control': `你拿 ${hand} 免费过牌，控制了底池。${s.street === 3 && r.metrics.closing ? '这是河牌最后一次行动，过牌后直接摊牌。' : s.street === 3 ? '如果本轮后面的对手下注，再按它的范围和实际价格判断。' : '面对后续下注仍要重新判断，过牌不等于承诺继续跟注。'}`,
  };
  return (
    copies[r.code] ||
    `你在 ${s.position} 拿 ${hand}，这一步要结合 ${c.opponents} 位对手的公开行动判断。`
  );
}

// Decision quality depends only on this before-action snapshot and its analysis.
export function coachDecision(s, r) {
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
      evText = '两种模拟范围下，这次继续投入都不如弃牌；属于当前模型下的负收益风险。';
    } else if (
      fold.scenarios.every((v) => v.vsActual.informative && v.vsActual.upper < -threshold)
    ) {
      evKind = 'positive';
      evText = '两种模拟范围下，这条路线都比弃牌收益更高，但仍依赖后续打法。';
    }
  }
  const freeFold = r.code === 'free-fold';
  const confirmed = freeFold || evKind === 'negative' || !!improved;
  const supported = !confirmed && (r.status === 'sound' || evKind === 'positive');
  let action = freeFold
    ? { action: 'check', amount: 0 }
    : improved?.action ||
      (evKind === 'negative' ? { action: 'fold', amount: 0 } : r.routes.primary);
  if (supported && !valueCodes.has(r.code)) action = actual;
  const unchanged = same(action, actual);
  const noFurtherDecision =
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
  let followUp =
    s.street === 3
      ? r.context.handClass === 'board'
        ? '主要是平分机会，别把底牌没有带来的优势算进去。'
        : '先区分更差的牌愿意跟注，还是更好的牌会弃牌，再选择下注尺度。'
      : r.code === 'late-open' || r.code === 'late-isolation'
        ? '面对大额再加注时重新收紧；顶对弱踢脚以控池为主，没中牌时按牌面和对手继续情况决定。'
        : r.code.includes('threebet') || r.code.includes('fourbet') || r.code === 'weak-entry'
          ? '如果对手明显更宽、价格更便宜，才重新比较防守；不要因为前面已投入而跟到底。'
          : valueCodes.has(r.code) || r.code === 'value-bet'
            ? '对手用弱牌跟得多时逐步加大价值下注；对手只用强牌继续时，缩小尺度或控池。'
            : r.draw.outs
              ? '改善后再争取价值；没改善又遇到大下注，按新价格决定是否退出。'
              : '下一轮按新牌面、下注金额和仍在局中的人数重新判断，不自动重复这次操作。';
  if (noFurtherDecision && s.action !== 'fold' && r.context.handClass !== 'board')
    followUp =
      s.action === 'call'
        ? '这次跟注后已没有后续下注决策。下次在相似局面，先核对价格和对手范围，再决定是否接下这笔风险。'
        : s.action === 'raise'
          ? s.legal.isShortAllin
            ? '这是不足完整加注的短全下，不一定重开其他玩家的加注权。下次先核对全下价格与对手范围，不能选择超出后手的普通加注。'
            : '全下后已没有后续下注决策。下次投入前，先比较普通加注能否留住更多愿意付费的弱牌。'
          : '这次过牌后直接摊牌。下次在相似牌面，先比较有多少更弱的成牌会接下注，再决定取值还是免费摊牌。';
  if (s.action === 'fold')
    followUp = freeFold
      ? '下次无需补筹码时，先保留免费过牌的机会；之后有人下注再判断。'
      : '下次遇到相似下注，按价格和对手范围比较继续与退出，不把已经投入的筹码当成继续理由。';
  let conciseReason = explanation(s, r);
  if (improved)
    conciseReason = `你在 ${s.position} 拿 ${r.context.handLabel}，实际选择${actionLabel(s, s.action, s.amount)}。配对模拟在两种范围下都支持改为${actionLabel(s, action.action, action.amount)}，收益高于实际操作；这个结论仍依赖对手范围和模拟后续打法。`;
  else if (evKind === 'negative' && s.action === 'call')
    conciseReason = explanation(s, { ...r, code: 'expensive-call' });
  else if (evKind === 'positive' && r.code === 'expensive-call')
    conciseReason = `当前价格分析提示风险，但完整候选模拟认为这条继续路线比弃牌更有收益。差别来自模拟中的后续弃牌和取值，不能把当前价格单独当成整条路线的收益。`;
  return {
    kind,
    label: { improve: '优先改进', value: '争取更多价值', keep: '值得保留', compare: '看对手调整' }[
      kind
    ],
    explanation: conciseReason,
    suggestedAction: actionLabel(s, action.action, action.amount),
    suggestion: unchanged
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
          : '未发现足以确认另一动作更好的证据；建议按对手继续方式调整。',
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
    summary = '获胜不能证明这次打法最好；当时仍有更值得比较的选择。少赚与长期亏损是不同的问题。';
  } else if (lost && critical) {
    title = '输了，优先改变最关键的一步';
    summary = `先看第 ${priority.index + 1} 步（${streets[priority.street]}）：${priority.suggestedAction}。重点改善重复打时的收益，而不是保证这次就能赢。`;
  } else if (lost && points.every((p) => p.supported)) {
    title = '这次输了，操作仍有合理依据';
    summary =
      '当前分析没有确认需要纠正的决定。能接受的输牌也会发生，不必为了这一结果强行改成更冒险的打法。';
  } else if (won && good.length) {
    title = '赢了，有值得保留的操作';
    summary = '下面这些选择有当时的信息支持；尚未证明整条路线最优，仍可调整尺度和后续取值。';
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
      ? '这次结果更好，不能洗掉下注时的收益问题；无法把运气和技术精确分成比例。'
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
    scope: '建议优先改善长期筹码收益；获池机会更高不一定更赚。',
  };
}
