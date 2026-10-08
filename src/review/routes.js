// Candidate routes are conditional practice plans, not solved EV rankings.
import { actionLabel } from '../engine/action-labels.js';
import { callPrice } from './equity.js';

export function comparisonRoutes(s, ctx, { code, status, alternative, pre }) {
  const label = (a) => actionLabel(s, a.action, a.amount);
  const same = (a, b) => a.action === b.action && (a.action !== 'raise' || a.amount === b.amount);
  const actual = { action: s.action, amount: s.amount };
  const closing = callPrice(s).closing;
  const primary = {
    ...alternative,
    label: label(alternative),
    summary:
      status === 'sound' && same(actual, alternative)
        ? '保留此路线，按对手范围调整'
        : label(alternative),
    condition: '使用当时已知信息；范围改变时重新判断。',
    tradeoff: '候选行动未计算完整未来策略的收益。',
  };
  let secondary;
  const raise = (amount) =>
    s.legal.canRaise
      ? {
          action: 'raise',
          amount: Math.min(
            s.legal.maxRaiseTo,
            Math.max(s.legal.minRaiseTo, Math.round(amount / 25) * 25),
          ),
        }
      : null;
  if (code === 'late-open' || code === 'late-isolation') {
    primary.summary = pre.limpers
      ? '主动隔离，尺度随跛入人数调整'
      : '保留后位开池，比较 2–3 BB 尺度';
    primary.condition = pre.limpers
      ? '跛入者范围较宽，且后面未出现明显强范围。'
      : '无人开池，盲位有可利用的弃牌率；翻后位置有利。';
    primary.tradeoff = '争夺盲注与控制成本；被跟注后不再按随机对手牌力判断。';
    secondary = raise(
      alternative.amount > 100 + 50 * pre.limpers ? 100 + 50 * pre.limpers : 150 + 50 * pre.limpers,
    );
    if (secondary)
      Object.assign(secondary, {
        condition: '重打时比较另一开池尺度，记录盲位继续频率；隔离较黏的跛入者可用较大尺度。',
        tradeoff:
          '较小尺度降低失败成本，但可能让更多牌防守；较大尺度增加压力，也可能只留下更强范围。',
      });
  } else if (code === 'early-suited-entry') {
    primary.summary = '保守基线收紧；比较有条件的小开池';
    primary.condition = '早位、多家待行动且缺少对手过度弃牌证据时，避免边缘同花牌扩大底池。';
    primary.tradeoff = '放弃潜在同花与偷盲收益，换取更少的无位置和踢脚风险。';
    secondary = raise(125);
    if (secondary)
      Object.assign(secondary, {
        condition: '后面防守过紧、较少 3-bet，且能在被继续后及时控池或退出时。',
        tradeoff:
          '主动争夺盲注，但较强 Qx/Kx 与再加注会使同花潜力难以实现；模拟结果只是该假设下的比较。',
      });
  } else if (code === 'squeeze-candidate') {
    primary.condition = '缺少开池者宽范围、平跟者可弃牌的依据时，优先收紧。';
    primary.tradeoff = '避免弱 A 被强继续范围压制；阻断部分强 A 不等于足够弃牌率。';
    secondary = raise(s.currentBet * 4.5);
    if (secondary)
      Object.assign(secondary, {
        condition: '开池者范围宽、平跟者有封顶倾向，且对手会对再加注弃牌时，才比较挤压。',
        tradeoff: '争夺多人死钱，但失败成本更大；被跟注或 4-bet 后需停止无依据施压。',
      });
  } else if (['weak-threebet-defense', 'weak-fourbet-defense', 'weak-entry'].includes(code)) {
    primary.condition = '大尺度、多人继续或少诈唬的强范围下，优先减少新增投入。';
    primary.tradeoff = '放弃当前权益，避免弱踢脚与后续压力；已投入筹码不计作继续理由。';
    secondary = s.legal.canCheck
      ? null
      : {
          action: 'call',
          amount: s.legal.callAmount,
          condition:
            pre?.raises >= 3
              ? '仅在对手极宽范围有明确证据、且价格与封口条件有利时讨论；常规强范围不适用。'
              : '小尺度、宽范围且有位置或大盲折扣时才考虑；不要默认成立。',
          tradeoff: '保留摊牌权益，但被更强 Ax 压制及面对后续下注的风险仍在。',
        };
  } else if (alternative.action === 'raise') {
    primary.condition =
      code === 'pressure-bet'
        ? '有明确较好的牌会退出，且尺度带来的弃牌率能补偿被跟注后的弱权益。'
        : ctx.draw.outs && !['overpair', 'set', 'strong', 'two-pair'].includes(ctx.handClass)
          ? '听牌有被跟注后的权益，且目标范围有足够弃牌。'
          : '列得出会付费的较弱牌，并能承担被加注后重新判断。';
    primary.tradeoff =
      s.street === 3
        ? '比较取值和弃牌收益；尺度越大，对手继续范围可能越强。'
        : '建立底池与保护权益；尺度越大，对手继续范围可能越强。';
    secondary = {
      action: s.legal.canCheck ? 'check' : 'call',
      amount: s.legal.callAmount,
      condition: ctx.inPosition
        ? '对手范围偏强或牌面不利时，利用位置控制投入。'
        : '对手会主动下注或你缺少位置优势时，保留诱导／控池路线。',
      tradeoff:
        s.street === 3
          ? '减少投入，也可能错过向更弱成牌取值的机会。'
          : '减少底池增长，也可能给听牌免费机会或错过价值。',
    };
  } else if (alternative.action === 'fold') {
    primary.condition = '当前价格缺少权益支持，或权益难以实现。';
    primary.tradeoff = '停止本次新增投入，不根据后来好牌否定弃牌。';
    secondary = !s.legal.canCheck
      ? {
          action: 'call',
          amount: s.legal.callAmount,
          condition: '只有更宽范围、足够诈唬或更有利的价格假设能提供权益余量时。',
          tradeoff: '检验范围敏感性，不代表当前跟注已经获支持。',
        }
      : null;
  } else if (alternative.action === 'call') {
    primary.condition = closing
      ? '对手范围与当前价格有足够余量；这次跟注后不再付后续下注。'
      : '对手范围与价格有足够余量，且后续压力可控。';
    primary.tradeoff = '保留较宽范围，避免把弱价值牌转成孤立强牌的加注。';
    secondary = {
      action: 'fold',
      amount: 0,
      condition: closing
        ? '对手真实价值范围比当前假设更窄，或当前价格没有足够余量时。'
        : '对手价值范围更窄、后面可能再加注，或无法承担后续投入时。',
      tradeoff: '让出部分权益，换取更低风险；不因已跟过一轮而自动续跟。',
    };
  } else {
    primary.condition =
      s.street === 3 && closing
        ? '河牌最后行动，免费摊牌优于没有跟注目标的投入时。'
        : ctx.inPosition
          ? '利用最后行动观察，控制边缘成牌或保留免费听牌。'
          : '无最后行动优势时，先观察对手下注和牌面变化。';
    primary.tradeoff =
      s.street === 3 && closing
        ? '过牌后直接摊牌；可能错过价值，但不会给听牌新的改善机会。'
        : '节省投入；不是保证免费看牌，仍需为后续下注设定条件。';
    if (ctx.handClass !== 'board' && s.legal.canRaise) {
      secondary = raise(Math.max(50, s.pot * (ctx.texture.wet ? 0.6 : 0.33)));
      if (secondary)
        Object.assign(secondary, {
          condition: ctx.draw.outs
            ? '对手有足够弃牌且听牌能承担被跟注时，比较半诈唬。'
            : '有明确较弱跟注目标，或对手会放弃较好的牌时；没有依据就保留过牌。',
          tradeoff: '换取价值或弃牌权益，但暴露于跟注／加注；没有证明这条路线更赚。',
        });
    }
  }
  if (secondary && same(primary, secondary)) secondary = null;
  if (secondary) secondary.label = label(secondary);
  return { primary, secondary };
}
