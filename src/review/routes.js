import { bigBlindOf } from '../engine/stakes.js';
// Candidate routes are conditional practice plans, not solved EV rankings.
import { actionLabel } from '../engine/action-labels.js';
import { callPrice } from './equity.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';
import { valuePlan } from './matchups.js';
import {
  foldPressure,
  foldWinNote,
  pendingRaiseOpportunity,
  coversOpponentStacks,
  heavyPreflopPressure,
} from './presentation.js';
export { valuePlan } from './matchups.js';

export function comparisonRoutes(s, ctx, { code, status, alternative, pre }) {
  const label = (a) => actionLabel(s, a.action, a.amount);
  const same = (a, b) => a.action === b.action && (a.action !== 'raise' || a.amount === b.amount);
  const actual = { action: s.action, amount: s.amount };
  const price = callPrice(s),
    callAllIn = s.stack > 0 && s.legal.callAmount >= s.stack,
    closing = price.closing || callAllIn,
    pendingCanRaise = pendingRaiseOpportunity(s),
    lastToCheck =
      s.legal.canCheck &&
      !(s.pending || []).some((id) => id !== 0 && !s.players[id]?.folded && !s.players[id]?.allin),
    weakAce = s.hole.some((card) => card.rank === 14),
    domination = weakAce ? '更强 Ax 的踢脚压制' : '更大对子或同点数高牌的更好踢脚压制',
    pressure = foldPressure(s),
    foldNote = pressure.hasAllInOpponent ? foldWinNote(s) : '';
  const primary = {
    ...alternative,
    label: label(alternative),
    summary:
      status === 'sound' && same(actual, alternative)
        ? '保留此路线，按对手范围调整'
        : label(alternative),
    condition: '使用当时已知信息，范围改变时重新判断。',
    tradeoff: '候选行动未计算完整未来策略的收益。',
  };
  let secondary;
  if (
    s.street === 3 &&
    ctx.handClass === 'board' &&
    ctx.matchups?.nut &&
    ['call', 'check'].includes(primary.action)
  ) {
    primary.summary =
      primary.action === 'call' ? '跟注争取分池，按本次成本判断' : '免费保留分池机会';
    primary.condition =
      primary.action === 'call'
        ? '公共牌已是无法被超过的最大牌型，跟注只争取分池，按有资格争夺的底池份额与本次成本比较。'
        : lastToCheck
          ? '公共牌已是无法被超过的最大牌型，过牌后直接摊牌分池。'
          : '公共牌已是无法被超过的最大牌型，先免费保留分池机会，后面有人下注时再按分池份额与跟注成本比较。';
    primary.tradeoff =
      '底牌不能在这张公共牌上取得额外牌力优势，摊牌时按各自有资格争夺的底池分池，不能当作独赢整个底池。';
    return { primary, secondary: null };
  }
  const raise = (amount) =>
    s.legal.canRaise
      ? {
          action: 'raise',
          amount: legalRaiseTo(amount, s.legal),
        }
      : null;
  if (code === 'positioned-entry') {
    const entry = ctx.positionedEntry;
    primary.condition = '跟注成本相对有效筹码较小，翻后有位置，底牌能够争取强牌或强听牌。';
    primary.tradeoff = [
      entry.waiting
        ? pendingCanRaise === false
          ? '身后的玩家还要回应，但本轮没有重新加注机会，下一街的投入仍要另算。'
          : '身后的盲位仍可能再加注，遇到新压力后要按新的价格重新判断。'
        : '本轮跟注后结束下注，下一街的投入仍要另算。',
      entry.shape === 'connector' || entry.shape === 'one-gap'
        ? '你补成同花时，也可能遇到更高同花。'
        : '',
    ].join('');
    secondary = entry.raiseTo
      ? {
          action: 'raise',
          amount: entry.raiseTo,
          condition: pre.callersAfterOpen
            ? '开池者范围较宽、平跟者有足够弃牌空间，且对手不会频繁以强再加注反击时。'
            : '开池者范围较宽、有足够弃牌空间，且对手不会频繁以强再加注反击时。',
          tradeoff: '争取直接拿池，被跟注后利用位置和底牌潜力，不能仅凭主动权认定有范围优势。',
        }
      : null;
    if (secondary) secondary.label = label(secondary);
    return { primary, secondary };
  }
  if (code === 'weak-late-limp' || code === 'weak-limper-isolation') {
    primary.condition =
      code === 'weak-limper-isolation'
        ? '缺少底牌潜力与足够弃牌空间时，不因已有跛入者的筹码就用弱散牌扩大底池。'
        : '底牌缺少同花和连接潜力，后面仍有玩家行动时，不因跟注成本低就跛入。';
    primary.tradeoff = '保留后手，也放弃本次改善与争夺盲注的机会。';
    secondary = pressure.hasAllInOpponent || pre.limpers ? null : raise(2.5 * bigBlindOf(s));
    if (secondary && secondary.amount <= 3 * bigBlindOf(s) && secondary.amount < s.legal.maxRaiseTo)
      Object.assign(secondary, {
        label: label(secondary),
        condition:
          '只有已有公开行动显示盲位过度弃牌，且能在被继续后及时控池或退出时，才考虑主动开池。',
        tradeoff: '用小尺度争夺盲注，面对跟注或再加注仍要重新判断，不能假设未观察到的弃牌倾向。',
      });
    else secondary = null;
    return { primary, secondary };
  }
  if (code === 'undersized-value-bet' && ctx.valueSizeCandidate) {
    primary.condition = '较小下注可能留住弱牌，但这个尺度是否收足价值仍需比较。';
    primary.tradeoff =
      s.street === 3
        ? '河牌只比较较弱成牌会付多少，不能因为持有强牌就认定全下最好。'
        : '小注减少对手继续成本，也可能少收价值或让听牌便宜继续。';
    secondary = {
      ...ctx.valueSizeCandidate,
      label: label(ctx.valueSizeCandidate),
      condition: '只有较弱成牌或听牌愿意支付更大尺度时，才比较增加取值。',
      tradeoff: '这只是不同价值尺度的候选，没有证明比原小注更好，不能自动推至全下。',
    };
    if (same(primary, secondary)) secondary = null;
    return { primary, secondary };
  }
  const value = ctx.valuePlan || valuePlan(s, ctx);
  if (
    value.primary &&
    same(value.primary, alternative) &&
    ![
      'free-fold',
      'expensive-call',
      'weak-threebet-defense',
      'weak-fourbet-defense',
      'weak-entry',
      'weak-sb-cold-call',
      'weak-limper-isolation',
      'dangerous-value-shove',
      'dirty-draw-bet',
      'squeeze-candidate',
      'early-suited-entry',
      'unbacked-small-pair-reraise',
      'unbacked-pair-reraise',
      'multiway-top-pair',
      'dangerous-made-check',
    ].includes(code)
  ) {
    Object.assign(primary, value.primary, {
      label: label(value.primary),
      summary: label(value.primary),
      condition: value.reason,
    });
    secondary = value.secondary;
    if (secondary && same(primary, secondary)) secondary = null;
    if (secondary) secondary = { ...secondary, label: label(secondary) };
    return { primary, secondary };
  }
  if (code === 'late-open' || code === 'late-isolation') {
    primary.summary = pre.limpers
      ? '主动隔离，尺度随跛入人数调整'
      : '保留后位开池，比较 2–3 BB 尺度';
    primary.condition = pre.limpers
      ? '跛入者范围较宽，且后面未出现明显强范围。'
      : '无人开池，盲位有可利用的弃牌率，翻后位置有利。';
    primary.tradeoff = '争夺盲注与控制成本，被跟注后不再按随机对手牌力判断。';
    secondary = raise(
      alternative.amount > (2 + pre.limpers) * bigBlindOf(s)
        ? (2 + pre.limpers) * bigBlindOf(s)
        : (3 + pre.limpers) * bigBlindOf(s),
    );
    if (secondary)
      Object.assign(secondary, {
        condition: '重打时比较另一开池尺度，记录盲位继续频率，隔离较黏的跛入者可用较大尺度。',
        tradeoff:
          '较小尺度降低失败成本，但可能让更多牌防守，较大尺度增加压力，也可能只留下更强范围。',
      });
  } else if (code === 'early-suited-entry') {
    primary.summary = '保守基线收紧，比较有条件的小开池';
    primary.condition = '早位、多家待行动且缺少对手过度弃牌证据时，避免边缘同花牌扩大底池。';
    primary.tradeoff = '放弃潜在同花与偷盲收益，换取更少的无位置和踢脚风险。';
    secondary = raise(2.5 * bigBlindOf(s));
    if (secondary)
      Object.assign(secondary, {
        condition: '后面防守过紧、较少 3-bet，且能在被继续后及时控池或退出时。',
        tradeoff:
          '主动争夺盲注，但较强 Qx/Kx 与再加注会使同花潜力难以实现，模拟结果只是该假设下的比较。',
      });
  } else if (code === 'squeeze-candidate') {
    primary.condition = pressure.hasAllInOpponent
      ? '缺少仍有筹码的对手愿意弃牌和剩余摊牌机会的依据时，优先收紧。'
      : '缺少开池者宽范围、平跟者可弃牌的依据时，优先收紧。';
    primary.tradeoff = '避免弱 A 被强继续范围压制，阻断部分强 A 不等于足够弃牌率。';
    secondary = raise(s.currentBet * 4.5);
    if (secondary)
      Object.assign(secondary, {
        condition: pressure.hasAllInOpponent
          ? '仅当仍有筹码的对手会退出，且剩余摊牌机会足以支持时讨论，不能要求已全下的玩家弃牌。'
          : '开池者范围宽、平跟者有封顶倾向，且对手会对再加注弃牌时，才比较挤压。',
        tradeoff: foldNote || '争夺多人死钱，但失败成本更大，被跟注或 4-bet 后需停止无依据施压。',
      });
  } else if (
    ['weak-threebet-defense', 'weak-fourbet-defense', 'weak-entry', 'weak-sb-cold-call'].includes(
      code,
    )
  ) {
    primary.condition = '大尺度、多人继续或少诈唬的强范围下，优先减少新增投入。';
    primary.tradeoff = '放弃当前权益，避免弱踢脚与后续压力，已投入筹码不计作继续理由。';
    secondary = s.legal.canCheck
      ? null
      : {
          action: 'call',
          amount: s.legal.callAmount,
          condition:
            pre?.raises >= 3
              ? '仅在对手极宽范围有明确证据、且价格与封口条件有利时讨论，常规强范围不适用。'
              : code === 'weak-sb-cold-call'
                ? '仅在对手范围足够宽、跟注价格足够低，且能承担翻后先行动与多人竞争时讨论，不能把已付小盲当作继续依据。'
                : '小尺度、宽范围且有位置或大盲折扣时才考虑，不要默认成立。',
          tradeoff: `保留摊牌权益，但${domination}${callAllIn ? '和一次投入全部筹码的风险仍在，跟注后本人不再行动。' : '及面对后续下注的风险仍在。'}`,
        };
  } else if (alternative.action === 'raise') {
    primary.condition = heavyPreflopPressure(s, ctx)
      ? '已有多次再加注，需分别核对较弱牌是否会跟注，以及仍有筹码的对手是否会放弃更好的牌，再比较投入尺度与剩余摊牌机会。'
      : code === 'pressure-bet'
        ? pressure.hasAllInOpponent
          ? '仍有筹码的对手会放弃较好的牌，且剩余摊牌机会与投入尺度能够支持进攻。'
          : '有明确较好的牌会退出，且尺度带来的弃牌率能补偿被跟注后的弱权益。'
        : ctx.draw.outs && !['overpair', 'set', 'strong', 'two-pair'].includes(ctx.handClass)
          ? pressure.hasAllInOpponent
            ? '听牌有摊牌改善机会，且仍有筹码的对手有足够弃牌空间。'
            : '听牌有被跟注后的权益，且目标范围有足够弃牌。'
          : primary.amount - s.bet >= s.stack
            ? '推入前列得出会付费的较弱牌，并核对被跟注后的摊牌机会与可争夺底池。'
            : coversOpponentStacks(s, primary.amount)
              ? '这次加注已达到所有对手的可投入上限，列得出会付费的较弱牌，并核对可争夺底池与摊牌机会。'
              : '列得出会付费的较弱牌，并能承担被加注后重新判断。';
    primary.tradeoff =
      foldNote ||
      (s.street === 3
        ? '比较取值和弃牌收益，尺度越大，对手继续范围可能越强。'
        : '建立底池与保护权益，尺度越大，对手继续范围可能越强。');
    const pricedOut = ctx.callAssessment?.optimistic < price.required;
    secondary = s.legal.canCheck
      ? {
          action: 'check',
          amount: 0,
          condition: lastToCheck
            ? '本轮已没有其他玩家待行动，可以先免费进入摊牌或下一街。'
            : '对手范围偏强或牌面不利时，先控制本次投入。',
          tradeoff:
            s.street === 3
              ? '减少投入，也可能错过向更弱成牌取值的机会。'
              : '减少底池增长，也可能给听牌免费机会或错过价值。',
        }
      : {
          action: pricedOut ? 'fold' : 'call',
          amount: pricedOut ? 0 : s.legal.callAmount,
          condition: pricedOut
            ? '当前价格没有权益支持时，先停止新增投入。'
            : callAllIn
              ? '推入前核对当前价格与摊牌机会，跟注后本人不再参与下注。'
              : closing
                ? '当前摊牌机会与可争夺份额能支持价格时，跟注后不再支付后续下注。'
                : '当前价格有足够权益支持时，保留较宽范围，下一次下注另行判断。',
          tradeoff: pricedOut
            ? '放弃当前权益，避免为修正过大加注继续付出没有依据的跟注。'
            : callAllIn
              ? '投入全部剩余筹码，之后只能等发牌或摊牌，不能再靠后街下注获利。'
              : closing
                ? '减少本次投入，之后只等待发牌或摊牌，不能再靠后续下注改善收益。'
                : '减少底池增长，但仍可能面对后续下注，不能把跟注当成没有风险。',
        };
  } else if (alternative.action === 'fold') {
    primary.condition = '当前价格缺少权益支持，或权益难以实现。';
    primary.tradeoff = '停止本次新增投入，不根据后来好牌否定弃牌。';
    secondary = !s.legal.canCheck
      ? {
          action: 'call',
          amount: s.legal.callAmount,
          condition: '只有更宽范围、足够诈唬或更有利的价格假设能提供权益余量时。',
          tradeoff: callAllIn
            ? '检验范围敏感性，不代表当前跟注已经获支持，跟注后本人不再参与下注。'
            : '检验范围敏感性，不代表当前跟注已经获支持。',
        }
      : null;
  } else if (alternative.action === 'call') {
    primary.condition = callAllIn
      ? '当前摊牌机会与价格有足够支持时，投入全部后手，之后本人不再参与下注。'
      : closing
        ? '对手范围与当前价格有足够余量，这次跟注后不再付后续下注。'
        : '对手范围与价格有足够余量，且后续压力可控。';
    primary.tradeoff = '保留较宽范围，避免把弱价值牌转成孤立强牌的加注。';
    secondary = {
      action: 'fold',
      amount: 0,
      condition: closing
        ? '对手真实价值范围比当前假设更窄，或当前价格没有足够余量时。'
        : pendingCanRaise === false
          ? '对手价值范围更窄，或下一街的投入难以承担时。'
          : pendingCanRaise === true
            ? '对手价值范围更窄、后面可能再加注，或无法承担后续投入时。'
            : '对手价值范围更窄，或无法承担可能的追加投入时。',
      tradeoff: '让出部分权益，换取更低风险，不因已跟过一轮而自动续跟。',
    };
  } else {
    primary.condition =
      s.street === 3 && lastToCheck
        ? '河牌最后行动，免费摊牌优于没有跟注目标的投入时。'
        : s.street === 3
          ? '河牌已发完，先过牌观察后面玩家是否下注，再按金额和范围判断。'
          : lastToCheck
            ? '本轮已没有其他玩家待行动，可以免费观察下一街，再评估新的下注。'
            : ctx.inPosition
              ? '利用最后行动观察，控制边缘成牌或保留免费听牌。'
              : '无最后行动优势时，先观察对手下注和牌面变化。';
    primary.tradeoff =
      s.street === 3 && lastToCheck
        ? '过牌后直接摊牌，可能错过价值，但不会给听牌新的改善机会。'
        : s.street === 3
          ? '过牌可能错过向弱牌取值，对手仍可下注，届时需要决定跟注或弃牌。'
          : lastToCheck
            ? '这次过牌后可免费进入下一街，下一街的下注与取值机会需要重新判断。'
            : '节省投入，不是保证免费看牌，仍需为后续下注设定条件。';
    if (ctx.handClass !== 'board' && s.legal.canRaise) {
      secondary = raise(Math.max(bigBlindOf(s), s.pot * (ctx.texture.wet ? 0.6 : 0.33)));
      if (secondary)
        Object.assign(secondary, {
          condition: ctx.draw.outs
            ? pressure.hasAllInOpponent
              ? '仍有筹码的对手有足够弃牌空间，且听牌能支持剩余摊牌机会时，比较半诈唬。'
              : '对手有足够弃牌且听牌能承担被跟注时，比较半诈唬。'
            : pressure.hasAllInOpponent
              ? '仍有筹码的对手会用弱牌跟注或放弃较好的牌时才考虑，没有依据就保留过牌。'
              : '有明确较弱跟注目标，或对手会放弃较好的牌时，没有依据就保留过牌。',
          tradeoff: foldNote || '换取价值或弃牌权益，但暴露于跟注／加注，没有证明这条路线更赚。',
        });
    }
  }
  if (secondary && same(primary, secondary)) secondary = null;
  if (secondary) secondary.label = label(secondary);
  return { primary, secondary };
}
