// Public card facts and conditional teaching prompts, never a claim that an
// unseen opponent will call, or that a textured board proves a shove loses EV.
export function valueDrawNote(s, c) {
  if (s.street < 1 || s.street > 2 || s.action !== 'raise' || c.made.score[0] < 1) return '';
  const types = c.matchups?.weakerDrawTypes || [];
  return types.includes('flush') && types.includes('straight')
    ? '取值也可能来自顺子听牌或同花听牌的跟注，前提是对手愿意支付这个尺度。'
    : types.includes('flush')
      ? '取值也可能来自同花听牌的跟注，前提是对手愿意支付这个尺度。'
      : types.includes('straight')
        ? '取值也可能来自顺子听牌的跟注，前提是对手愿意支付这个尺度。'
        : '';
}

export function flushBoardShove(s, c) {
  return (
    s.street >= 2 &&
    s.action === 'raise' &&
    s.amount === s.legal.maxRaiseTo &&
    c.made.score[0] >= 1 &&
    c.made.score[0] <= 2 &&
    c.texture.maxSuit >= 3 &&
    !c.draw.flush &&
    c.extra >= s.pot * 0.4 &&
    !c.matchups?.nut
  );
}

export function flushCompletionNote(s, c) {
  if (s.street !== 2 || c.made.score[0] >= 5) return '';
  const suit = s.board.at(-1)?.suit;
  if (s.board.filter((card) => card.suit === suit).length !== 3) return '';
  if (s.board.slice(0, -1).filter((card) => card.suit === suit).length !== 2) return '';
  const name = ['黑桃', '红桃', '梅花', '方块'][suit];
  return `转牌补出了第三张${name}，原本持两张${name}的听牌现在已成同花。`;
}
