import { evaluate } from '../engine/poker.js';
import { MOOD_LABELS } from '../engine/bot-profiles.js';
import { drawInfo } from './context.js';

const pct = (v) => (v * 100).toFixed(1) + '%';
const n = (v) => Math.round(v).toLocaleString('en-US');
export const BOT_REASON_NAMES = {
  'outside-range': '起手牌未进入本次防守范围',
  'insufficient-equity': '估计权益未达到跟注门槛',
  'stack-pressure': '筹码压力触发收紧',
  'loose-exception': '随机容错保留了边缘行动',
  'premium-continue': '强起手牌分支保留继续',
  'affordable-entry': '低成本入池范围保留了继续',
  'affordable-open': '小开池的价格与有效后手支持跟入',
  'price-continue': '通过了价格与压力检查',
  'value-raise': '主动加注范围触发进攻',
  'semi-bluff': '听牌半诈唬触发进攻',
  'pure-bluff': '诈唬抽样触发主动施压',
  trap: '干燥牌面强牌触发诱导过牌',
  'free-check': '选择免费观察／控制底池',
};
export const BOT_CHECK_NAMES = {
  ...BOT_REASON_NAMES,
  'outside-range': '超出范围时的容错抽样',
  'insufficient-equity': '权益不足时的容错抽样',
  'stack-pressure': '高压力时的容错抽样',
  attack: '进攻频率抽样',
  trap: '诱导过牌抽样',
  'rare-pocket-shove': '小对子特殊全下抽样',
};
export function explainOpponent(record) {
  const t = record.trace,
    v = t.view;
  const made = evaluate([...v.hole, ...v.board]);
  const draw = drawInfo(v.hole, v.board);
  const call = record.action === 'call';
  const raises = v.history.filter((a) => a.street === v.street && a.action === 'raise');
  const comparison = t.equity + t.callTolerance;
  const reasons = [];
  if (v.street === 0)
    reasons.push(
      `起手牌强度排序约前 ${pct(t.percentile)}；本次风格、位置与公开加注线允许前 ${pct(t.range)}。${t.admitted ? '进入' : '未进入'}该范围${t.premium ? '，同时触发前 7% 强牌分支' : ''}。排序是起手牌启发式，不是胜率。`,
    );
  reasons.push(
    `它面对 ${v.rivals} 位未弃牌对手，需跟 ${n(v.legal.callAmount)}，模型可争夺 ${n(v.contestable)}，跟注门槛 ${pct(t.odds)}。`,
  );
  if (t.exceptions.length && t.reason !== 'loose-exception')
    reasons.push(
      `它曾触发 ${t.exceptions.map((code) => BOT_REASON_NAMES[code]).join('、')}，但容错抽样保留了继续，随后才进入当前行动分支；不能只凭最后的价值／诈唬标签忽略这部分风险。`,
    );
  if (t.cheapRangePassed)
    reasons.push(
      '本次通过低成本入池分支，普通权益弃牌检查没有执行；下方权益和门槛仅展示当时算出的数值，不是这一行动的触发依据。',
    );
  if (t.affordableOpen && t.affordableRangePassed)
    reasons.push(
      `本街只有一次小开池，跟完后的有效后手约 ${n(t.entryContext.effectiveBehind / 50)} BB，已有 ${t.entryContext.openCallers} 位跟入者。${t.entryContext.speculative || t.entryContext.suitedHigh ? '对子或合适同花牌的翻后潜力' : '起手牌排序与当前价格'}进入了独立跟入范围；普通的全桌随机摊牌权益弃牌检查没有执行。该近似没有证明这次跟注有正收益。`,
    );
  reasons.push(
    `当时只用自己的牌与公共牌，对随机对手范围抽样 ${t.trials} 次：原估计 ${pct(t.rawEquity)}，判断扰动 ${(t.noise >= 0 ? '+' : '') + pct(t.noise)}，决策使用 ${pct(t.equity)}。跟注倾向偏移 ${(t.callTolerance >= 0 ? '+' : '') + pct(t.callTolerance)}，比较值 ${pct(comparison)}，常规门槛含 2 个百分点保护为 ${pct(t.odds + 0.02)}。`,
  );
  let detail;
  if (t.reason === 'loose-exception')
    detail = `它本来触发了 ${t.exceptions.map((code) => BOT_REASON_NAMES[code]).join('、')}，但实际随机容错抽样保留了继续。因此这次${call ? '跟注' : '行动'}是模型刻意保留的宽松失误，不能解释为赔率已证明值得继续。`;
  else if (t.reason === 'premium-continue')
    detail =
      '它把这组牌归入强起手牌，翻前跳过了普通权益与高压力弃牌检查；这是模型近似，不意味着任何人数、价格下都应该接全下。';
  else if (t.reason === 'affordable-entry')
    detail =
      '这是未加注底池、最多补一个 BB 的低成本入池。牌进入按位置和风格扩展的入池范围，所以不再把多人对随机牌的摊牌权益与眼前盲注赔率直接比较后机械弃牌；这不是接大额加注或全下的理由。';
  else if (t.reason === 'affordable-open')
    detail =
      '这是面对一次小开池的条件跟入：开池不超过 4 BB，新增投入较小，开池者没有全下，跟完后的有效后手还足够深。位置、风格、起手牌适玩性与已有跟入者决定候选范围。允许跟入与允许再加注分别计算；3-bet、大额下注和短后手不使用这一豁免。';
  else if (t.reason === 'price-continue')
    detail =
      '本次没有触发弃牌分支。若未加注，是进攻抽样未命中、没有合适进攻目标，或合法加注权已关闭。通过程序检查并不等于对真实继续范围有正收益。';
  else if (t.reason === 'value-raise')
    detail =
      v.street === 0
        ? `这组牌进入${raises.length ? '独立的价值再加注' : '开池／隔离加注'}候选范围（约前 ${pct(t.raiseRange ?? t.openingRange)}），或触发强牌分支，并命中进攻抽样；它因此主动建立底池。允许平跟的边缘牌不会仅因入池范围扩大就自动再加注，标签不代表坚果牌。`
        : `随机范围权益超过 ${pct(v.rivals === 1 ? 0.53 : 1 / (v.rivals + 1) + 0.23)}，或符合“超对且权益超过 40%”，并命中进攻抽样。这不要求一定已有成牌，A high 也可能被宽范围估计归入此分支。若对手继续范围偏强，这个估计可能过于乐观。`;
  else if (t.reason === 'semi-bluff')
    detail =
      '它识别到自己有听牌，参与人数不超过三人，并命中半诈唬及进攻抽样。收益包含弃牌权益；成牌候选仍可能不是干净获胜 outs。';
  else if (t.reason === 'pure-bluff')
    detail =
      '它识别到后位／延续进攻／较干燥牌面的施压条件，筹码压力低于 25%，且命中诈唬和进攻抽样。没有读取你的底牌，也没有证明你一定会弃牌。';
  else if (t.reason === 'trap')
    detail =
      '它在免费过牌、干燥牌面且估计权益超过 65% 的条件下命中诱导分支，保留让对手主动下注的机会。';
  else if (t.reason === 'free-check')
    detail =
      '它无需补筹码，未执行主动加注，选择免费观察。过牌并不表示它一定弱，也可能是进攻抽样未命中。';
  else detail = `实际执行 ${BOT_REASON_NAMES[t.reason]}，没有使用后来发出的牌来决定这一步。`;
  if (draw.outs)
    reasons.push(
      `当时识别到 ${draw.outs} 张直接顺子／同花成牌候选，下一张成牌比例 ${pct(draw.nextChance)}；不是保证赢牌的概率。`,
    );
  const moodActive = t.mode !== 'off' && t.mood.kind !== 'steady';
  reasons.push(
    moodActive
      ? `模拟情绪：${MOOD_LABELS[t.mood.kind]}，来源：${t.mood.reason || '之前牌局的触发事件'}。基础／实际宽度 ${t.baseAxes[0]} / ${t.axes[0]}，进攻 ${t.baseAxes[1]} / ${t.axes[1]}，跟注 ${t.baseAxes[3]} / ${t.axes[3]}；这次状态是否改变动作仍取决于上述分支。`
      : '本次没有情绪偏移，使用风格基础参数。',
  );
  if (t.sizing && !t.sizing.executed)
    reasons.push(
      `曾尝试加注总额 ${n(t.sizing.actual)}，但触及最大值的纯诈唬全下保护条件，最终没有执行该加注；实际动作仍是上方记录的${call ? '跟注' : '过牌'}。`,
    );
  if (t.sizing?.executed)
    reasons.push(
      `尺度先产生总额 ${n(t.sizing.desired)}，再按合法区间 ${n(t.sizing.minimum)}–${n(t.sizing.maximum)} 调整到 ${n(t.sizing.actual)}。${t.sizing.opening ? '未加注底池按开池／跛入人数公式计算。' : '尺度系数约 ' + pct(t.sizing.fraction) + ' ×（当时底池 + 跟注额），再加当前下注总额。'}`,
    );
  return {
    title: BOT_REASON_NAMES[t.reason],
    detail,
    reasons,
    made: v.street ? made.label : '翻牌前起手牌',
    warning:
      call &&
      (t.exceptions.length ||
        (!t.affordableRangePassed && comparison < t.odds + 0.02) ||
        raises.length > 1)
        ? '这次继续尤其需要警惕：机器人估计的是随机范围，未完整按你的加注线收紧范围；小样本、强牌豁免或随机容错都可能产生不合理跟注。实际记录解释了原因，没有证明打法正确。'
        : '这是模拟器当时实际使用的判断记录。权益是小样本随机范围估计，未完整建模对手继续范围、权益实现或未来策略，不是职业牌手的真实心理，也不是最优打法证明。',
  };
}
