import { compactChips as n } from '../engine/chip-format.js';

// Explain the recorded range/price decision without pretending its heuristic
// is a solved fold or knowing which candidate the opponent actually holds.
export function defenseReason(snapshot, context, matchups) {
  const cost = snapshot.callPrice?.cost ?? snapshot.legal.callAmount;
  const pot = snapshot.callPrice?.contestable ?? snapshot.contestable;
  const clauses = [
    `继续要补 ${n(cost)}，可争夺跟注后的 ${n(pot)} 底池，当前保本门槛为 ${((cost / Math.max(1, pot)) * 100).toFixed(1)}%。`,
  ];
  if (!snapshot.street) {
    clauses.push('继续还是弃牌，需要结合对手范围与当前价格；强起手牌也不代表任何尺度都必须跟注。');
    if (snapshot.allIn?.line === 'multi-raise-shove' && snapshot.allIn.depthBB > 110)
      clauses.push(
        '若这条加注线主要来自较大对子和 AK，当前价格下应谨慎；若全下范围很宽，则应重新判断。',
      );
    return clauses;
  }
  const examples = (matchups?.behind || []).filter((h) => h.score[0] < 6).slice(0, 2);
  for (const example of examples)
    clauses.push(`可能领先当前手牌的组合有 ${example.text}（${example.label}）。`);
  const postflop = snapshot.history.filter((a) => a.street > 0);
  const previous = postflop.slice(
    0,
    postflop.findLastIndex((a) => a.action === 'raise'),
  );
  if (previous.length && previous.every((a) => a.action === 'check'))
    clauses.push(
      '此前一路过牌，仍可能有慢打强牌，也保留了较弱牌和诈唬，不能仅凭这次下注认定对手有大牌。',
    );
  if (context.pendingOthers)
    clauses.push('后面还有玩家可以跟注或加注，当前底池赔率不代表后续投入已经封顶。');
  clauses.push('机器人按公开行动估算后选择弃牌；这些只是可能的牌组，并非已经看到了对手底牌。');
  return clauses;
}
