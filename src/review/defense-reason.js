import { compactChips as n } from '../engine/chip-format.js';

export function straightSplitReason(snapshot, context, matchups) {
  const stronger = new Set(matchups?.strongerMadeCategories || []);
  return snapshot.street === 3 &&
    context.made?.score[0] === 4 &&
    stronger.size === 1 &&
    stronger.has(4) &&
    matchups.tied?.length
    ? `${snapshot.reviewSubject || '对手'}的顺子可与 ${matchups.tied[0].text} 平分，只输给更高顺子；弃牌需要对手范围明显偏向后者。`
    : '';
}

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
  const examples = (matchups?.behind || []).slice(0, 2);
  const subject = snapshot.reviewSubject || '对手';
  const represented = new Set(examples.map((hand) => hand.score[0]));
  const stronger = new Set(matchups?.strongerMadeCategories || []);
  const split = straightSplitReason(snapshot, context, matchups);
  if (split) clauses.push(split);
  const remaining = [
    [5, '同花'],
    [4, '顺子'],
    [6, '葫芦'],
    [7, '四条'],
  ]
    .filter(([category]) => stronger.has(category) && !represented.has(category))
    .slice(0, 2)
    .map(([, label]) => label);
  if (examples.length) {
    const extra = remaining.length ? `，还需防范${remaining.join('、')}` : '';
    clauses.push(
      `${subject}判断自己可能落后于 ${examples.map((example) => `${example.text}（${example.label}）`).join('、')}${extra}。`,
    );
  }
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
  return clauses;
}
