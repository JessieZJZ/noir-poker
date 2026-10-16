// Pure card facts shared by bot policy and review. No game, deck or opponent private cards.
function computeBoardTexture(board) {
  const suits = [0, 1, 2, 3].map((s) => board.filter((c) => c.suit === s).length),
    counts = new Map();
  board.forEach((c) => counts.set(c.rank, (counts.get(c.rank) || 0) + 1));
  const ranks = new Set(board.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const connected = Math.max(
    0,
    ...Array.from(
      { length: 10 },
      (_, i) => Array.from({ length: 5 }, (_, j) => i + j + 1).filter((r) => ranks.has(r)).length,
    ),
  );
  const maxSuit = Math.max(0, ...suits),
    paired = [...counts.values()].some((n) => n >= 2),
    trips = [...counts.values()].some((n) => n >= 3);
  const tags = [];
  if (paired) tags.push(trips ? '公共牌三条' : '公共牌有对子');
  if (maxSuit === 5) tags.push('五张同花色');
  else if (maxSuit === 4) tags.push('四张同花色');
  else if (maxSuit === 3) tags.push('三张同花色');
  else if (board.length < 5 && maxSuit === 2) tags.push('两张同花色');
  else if (board.length === 3 && maxSuit === 1) tags.push('彩虹面');
  if (connected === 5) tags.push('五张连通');
  else if (connected === 4) tags.push('四张连通');
  else if (connected === 3) tags.push('顺子连接明显');
  return {
    paired,
    trips,
    maxSuit,
    connected,
    wet: maxSuit >= 3 || connected >= 3 || (board.length >= 3 && board.length < 5 && maxSuit === 2),
    label: tags.join('、') || '花色分散、连接较少',
  };
}

// A board's suit/rank structure is independent of every candidate holding.
// Reusing it avoids recomputing texture for each of ~1,000 public combinations.
const textures = new Map();
export function boardTexture(board) {
  const key = board.map((card) => `${card.rank}:${card.suit}`).join('|');
  if (!textures.has(key)) {
    if (textures.size >= 16) textures.delete(textures.keys().next().value);
    textures.set(key, Object.freeze(computeBoardTexture(board)));
  }
  return textures.get(key);
}

export function handFeatures(hole, board, score) {
  const known = [...hole, ...board],
    ranks = new Set(known.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const wet = boardTexture(board).wet;
  const flushDraw =
    board.length >= 3 &&
    board.length < 5 &&
    score[0] < 5 &&
    [0, 1, 2, 3].some(
      (s) => known.filter((c) => c.suit === s).length === 4 && hole.some((c) => c.suit === s),
    );
  const straightCompletions = new Set();
  const possibleStraightDraw =
    board.length >= 3 &&
    board.length < 5 &&
    score[0] < 4 &&
    Array.from({ length: 10 }, (_, i) => Array.from({ length: 5 }, (_, j) => i + j + 1)).reduce(
      (found, run) => {
        const draw =
          run.filter((r) => ranks.has(r)).length === 4 &&
          hole.some(
            (c) =>
              (run.includes(c.rank) || (c.rank === 14 && run.includes(1))) &&
              !board.some((b) => b.rank === c.rank),
          );
        if (draw)
          for (const rank of run.filter((r) => !ranks.has(r)))
            straightCompletions.add(rank === 1 ? 14 : rank);
        return found || draw;
      },
      false,
    );
  // A completion that only gives the board a higher straight is not our draw:
  // 7-2 on 9-T-J-Q cannot treat an 8 as an own straight out.
  const straightHigh = (cards, extra) => {
    const values = new Set([...cards.map((c) => c.rank), extra]);
    if (values.has(14)) values.add(1);
    return Math.max(
      0,
      ...Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => i + j + 1).every((r) => values.has(r)) ? i + 5 : 0,
      ),
    );
  };
  for (const rank of straightCompletions)
    if (straightHigh(known, rank) <= straightHigh(board, rank)) straightCompletions.delete(rank);
  const straightDraw = possibleStraightDraw && straightCompletions.size > 0;
  const highBoard = Math.max(0, ...board.map((c) => c.rank));
  const overpair = board.length >= 3 && hole[0].rank === hole[1].rank && hole[0].rank > highBoard;
  const boardCount = (rank) => board.filter((c) => c.rank === rank).length;
  const straightRanks = Array.from({ length: 5 }, (_, i) => score[1] - i).map((r) =>
    r === 1 ? 14 : r,
  );
  const flushSuit = [0, 1, 2, 3].find((s) => known.filter((c) => c.suit === s).length >= 5);
  const ownStraight = hole.some((c) => straightRanks.includes(c.rank) && !boardCount(c.rank));
  const ownFlush = hole.some((c) => c.suit === flushSuit && score.slice(1).includes(c.rank));
  const ownMade =
    board.length >= 3 &&
    (score[0] === 1
      ? hole.some((c) => c.rank === score[1])
      : score[0] === 2
        ? hole.some((c) => c.rank === score[1] || c.rank === score[2])
        : score[0] === 3
          ? hole.some((c) => c.rank === score[1])
          : score[0] === 4
            ? ownStraight
            : score[0] === 5
              ? ownFlush
              : score[0] === 6
                ? hole.some(
                    (c) =>
                      (c.rank === score[1] && boardCount(c.rank) < 3) ||
                      (c.rank === score[2] && boardCount(c.rank) < 2),
                  )
                : score[0] === 7
                  ? hole.some(
                      (c) =>
                        c.rank === score[1] ||
                        (c.rank === score[2] &&
                          c.rank >
                            Math.max(
                              0,
                              ...board.filter((b) => b.rank !== score[1]).map((b) => b.rank),
                            )),
                    )
                  : score[0] === 8
                    ? hole.some(
                        (c) =>
                          c.suit === flushSuit &&
                          straightRanks.includes(c.rank) &&
                          !board.some((b) => b.suit === flushSuit && b.rank === c.rank),
                      )
                    : false);
  const ownTwoPair =
    score[0] === 2 && [score[1], score[2]].every((rank) => hole.some((c) => c.rank === rank));
  const drawCards = new Set();
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 2; rank <= 14; rank++) {
      if (known.some((c) => c.rank === rank && c.suit === suit)) continue;
      if (
        straightCompletions.has(rank) ||
        (flushDraw && known.filter((c) => c.suit === suit).length === 4)
      )
        drawCards.add(`${suit}-${rank}`);
    }
  return {
    wet,
    madeCategory: score[0],
    ownMade,
    strongMade: ownMade && (ownTwoPair || score[0] >= 3),
    draw: flushDraw || straightDraw,
    drawOuts: drawCards.size,
    overpair,
    flushDraw,
    straightOuts: straightCompletions.size * 4,
    ownPair: score[0] === 1 && ownMade,
    pairedBoard: new Set(board.map((c) => c.rank)).size < board.length,
  };
}
