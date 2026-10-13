import { actionLabel } from '../engine/action-labels.js';
import { actionReason, situationNotes, continuationNote } from './narrative.js';
import { spotFacts } from './spot-facts.js';

const streets = ['翻牌前', '翻牌', '转牌', '河牌'];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n) => Math.round(n * 100) + '%';
const same = (a, b) => a.action === b.action && (a.action !== 'raise' || a.amount === b.amount);
const valueCodes = new Set(['premium-flat', 'value-check', 'deep-value-shove']);

function explanation(s, r, evKind) {
  const c = r.context,
    draw = c.draw || r.draw,
    f = spotFacts(s, c),
    hand = c.handLabel,
    cost = fmt(r.metrics.callCost);
  if (s.street === 0 && s.action === 'raise' && c.tier === 0) {
    const high = Math.max(...(s.hole || []).map((card) => card.rank));
    return high < 13
      ? `${hand}不是对子，也没有 A 或 K 阻断部分强牌组合；${f.lastAggression ? '面对 ' + fmt(s.currentBet) + ' 的开池，' : '在前面无人开池时主动进攻，'}被较高对子或强高张跟住后，不能只靠${s.hole[0].suit === s.hole[1].suit ? '同花潜力' : '偶尔补成两对或三条'}支撑这笔 ${fmt(c.extra)} 的投入。`
      : `${hand}可以阻断部分强高张组合，但这次投入 ${fmt(c.extra)} 仍需要对手放弃足够多开池牌；当前公开下注线没有提供可靠的弃牌率。`;
  }
  if (s.action === 'call' && draw.outs) {
    const drawValue =
        draw.nextChance < r.metrics.required
          ? r.metrics.closing
            ? '单靠补成顺子／同花还不够，还需要现有牌的其他摊牌获胜机会。'
            : '单靠补成顺子／同花还不够，还需要现有牌的摊牌机会或成牌后再赢筹码。'
          : '补牌机会高于这次赔率要求，但改善候选并不全是干净 outs，成牌仍可能输。',
      continuation = r.metrics.closing
        ? '这次跟注后已没有后续下注。'
        : '本次跟注不保证免费把剩余公共牌看完。',
      conditions = drawValue + continuation;
    return !r.metrics.closing || s.street === 2
      ? `跟注有效成本 ${cost}，跟注后可争夺 ${fmt(r.metrics.contestable)}，底池赔率要求至少约 ${pct(r.metrics.required)} 权益；你的 ${draw.outs} 张顺子／同花改善候选，下一张约 ${pct(draw.nextChance)}。${conditions}`
      : `跟注有效成本 ${cost}，跟注后可争夺 ${fmt(r.metrics.contestable)}，底池赔率要求至少约 ${pct(r.metrics.required)} 权益。这次跟注后已没有后续下注，可以看完剩余公共牌；这 ${draw.outs} 张只是下一张的改善候选，不能直接当成最终获胜率。`;
  }
  if (s.action === 'call' && r.metrics.closing)
    return `${hand}这次跟注后已没有后续下注，按 ${cost} 的有效成本和 ${fmt(r.metrics.contestable)} 的可争夺底池比较权益。${evKind === 'negative' ? '两种范围假设下的跟注 EV 都为负，EV 是长期平均赚亏筹码；当前建议减少这笔投入。' : '对手真实范围仍未知，模型给出的权益不能代替它这次下注的强牌与诈唬比例。'}`;
  if (s.action === 'raise' && f.shove && c.tier >= 2 && s.street === 0)
    return `${hand}可以做价值再加注，但把 ${fmt(c.extra)} 全部推向 ${fmt(s.pot)} 的底池，可能让本来会接小加注的较弱牌弃掉；这手更值得比较普通加注能留下多少价值。`;
  if (
    s.action === 'raise' &&
    !draw.outs &&
    ['high', 'underpair', 'middle-pair', 'board-pair'].includes(c.handClass)
  )
    return `在 ${f.boardText} 上，你的${hand}主要靠对手弃牌提高这笔 ${fmt(c.extra)} 投入的 EV；当前公开行动没有证明对手会放弃足够多更好的牌。`;
  if (s.action === 'check' && r.code === 'value-check')
    return s.street === 3 && r.metrics.closing
      ? `你是河牌最后行动者，${hand}过牌就直接摊牌，已经不能诱导后面的下注；比较主动下注能否让较弱成牌付费。`
      : `你已有${hand}，底池 ${fmt(s.pot)}，牌面 ${f.boardText}；过牌是诱导路线，但若剩下 ${c.opponents} 位对手都跟着过牌，会少收一轮价值。`;
  if (s.action === 'check' && c.handClass === 'board')
    return `在 ${f.boardText} 上，${f.holeText}没有提高公共牌的牌力；这手主要争取平分底池，过牌不把平分机会误当成独占价值。`;
  if (s.action === 'fold' && !s.legal.canCheck)
    return `跟注有效成本 ${cost}，跟注后可争夺 ${fmt(r.metrics.contestable)}，底池赔率要求至少约 ${pct(r.metrics.required)} 权益。${draw.outs ? '当前补牌机会需要和这笔赔率比较，不能只按“有听牌”决定追。' : s.street === 0 ? hand + '的翻后潜力还要承担当前下注线和位置带来的压力。' : hand + '能否达到这个权益要求，取决于对手这条下注线包含多少更强成牌和诈唬。'}`;
  return '';
}

function practiceFocus(s, r, action) {
  const c = r.context,
    f = spotFacts(s, c),
    suggestion = actionLabel(s, action.action, action.amount),
    actual = actionLabel(s),
    draw = c.draw || r.draw;
  if (s.legal.isShortAllin && f.shove)
    return `本次全下至 ${fmt(s.amount)} 是短全下，不一定重开其他人的加注权；重打这手先比较${suggestion}，不能选超过 ${fmt(s.legal.maxRaiseTo)} 的普通加注。`;
  if (s.street === 0 && s.action === 'raise' && c.tier === 0 && f.shove && f.potRatio > 4)
    return `重打这手 ${f.holeText}，优先选择${suggestion}。本次投入 ${fmt(c.extra)}，底池只有 ${fmt(s.pot)}，且还有 ${c.opponents} 位对手未弃牌；这手弱起手牌不适合只为抢小底池就全下。`;
  if (s.action === 'raise')
    return `重打 ${f.holeText || c.handLabel} 这手，先对照${actual}与${suggestion}：当前底池 ${fmt(s.pot)}，实际新增投入 ${fmt(c.extra)}。这里比较的是加注 EV，需要考虑对手弃牌和被跟住后的结果，跟注赔率不能证明这次加注划算。`;
  if (s.action === 'check' && c.handClass === 'board')
    return `重打 ${f.boardText} 这手时，先看 ${f.holeText || c.handLabel} 是否提高了公共牌；本次没有提高，平分机会不能算成独占底池。`;
  if (s.action === 'check')
    return `重打这手${c.handLabel}，对照免费过牌与${suggestion}。${s.street === 3 && r.metrics.closing ? '本次河牌最后行动，比较的是免费摊牌与让弱牌付费。' : '当前底池 ' + fmt(s.pot) + '，还要观察剩下 ' + c.opponents + ' 位对手能否用弱牌接下注。'}`;
  if (s.action === 'fold' && s.legal.canCheck)
    return `这手 ${f.holeText || c.handLabel} 的跟注成本为 0，重打时先选择过牌，保留免费机会。`;
  if (draw.outs && r.metrics.closing && s.street === 1)
    return `重打 ${f.holeText || c.handLabel} 这手，比较补 ${fmt(r.metrics.callCost)} 所需的 ${pct(r.metrics.required)} 权益与${suggestion}。本次跟注后能看完转牌和河牌，${draw.outs} 张只是下一张的改善候选，不能拿下一张概率直接代替最终摊牌权益。`;
  return draw.outs
    ? `重打 ${f.holeText || c.handLabel} 这手，先对照 ${draw.outs} 张改善候选、下一张约 ${pct(draw.nextChance)}，和再补 ${fmt(r.metrics.callCost)} 所需的 ${pct(r.metrics.required)} 权益；再比较${suggestion}。${r.metrics.closing ? '这次跟注后已没有后续下注，不能靠成牌后再取值补足价格。' : '只把下一张的机会算进这笔跟注，后续下注另算。'}`
    : `重打 ${f.holeText || c.handLabel} 这手，面对当前 ${fmt(s.currentBet)} 的下注线，先算补 ${fmt(r.metrics.callCost)} 至少需要约 ${pct(r.metrics.required)} 权益，再比较${suggestion}。${r.metrics.closing ? '这次跟注后已没有后续下注，重点是当前对手范围与赔率。' : '当前尚有 ' + c.pendingOthers + ' 人能行动，不把这次跟注当成投入上限。'}`;
}

// Decision quality depends only on this before-action snapshot and its analysis.
export function coachDecision(s, r) {
  const actual = { action: s.action, amount: s.amount },
    sim = r.simulation;
  const actualRow = sim?.rows.find((row) => same(row.action, actual));
  const threshold = Math.max(10, s.pot * 0.01);
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
  let followUp = practiceFocus(s, r, action),
    conciseReason = explanation(s, r, evKind),
    paragraphs = [conciseReason].filter(Boolean);
  if (s.hole && s.board && r.context.texture) {
    const f = spotFacts(s, r.context),
      facts = situationNotes(s, r.context),
      continuation = continuationNote(s, r.context, r.metrics.closing);
    let recommendation = '';
    if (kind !== 'keep') {
      const suggested = actionLabel(s, action.action, action.amount);
      recommendation = improved
        ? `本次候选模拟支持比较${suggested}，它在两种范围假设下的 EV（长期平均筹码收益）高于${actionLabel(s)}；这个排序依赖模型对手范围和后续打法。`
        : `这手建议${suggested}。${s.action === 'raise' ? '跟注 ' + fmt(r.metrics.callCost) + ' 的赔率只能评价跟注，不能拿来证明新增投入 ' + fmt(r.context.extra) + ' 的加注 EV。' : action.action === 'fold' ? '停止新增 ' + fmt(r.metrics.callCost) + ' 的投入，把剩下 ' + fmt(s.stack) + ' 留给后面的牌局。' : '围绕当前 ' + fmt(s.pot) + ' 的底池，比较这条路线与实际操作。'}`;
    }
    const supporting = conciseReason || continuation;
    paragraphs = [actionReason(s, r), facts[0], supporting, recommendation].filter(Boolean);
    if (!recommendation && continuation && continuation !== supporting)
      paragraphs.push(continuation);
    if (f.allOpponentsAllIn && !paragraphs.some((p) => p.includes('没有后手')))
      paragraphs = [paragraphs[0], facts.at(-1), ...paragraphs.slice(2)];
    conciseReason = paragraphs.join('');
  } else if (!conciseReason) {
    conciseReason = `你在 ${s.position} 拿 ${r.context.handLabel}，实际选择${actionLabel(s)}；当时底池 ${fmt(s.pot)}，新增投入 ${fmt(r.context.extra)}。`;
    paragraphs = [conciseReason];
  }
  return {
    kind,
    label: kind === 'keep' ? '值得保留' : actionLabel(s, action.action, action.amount),
    explanation: conciseReason,
    paragraphs,
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
