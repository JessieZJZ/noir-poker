// Cache only pure evaluations keyed by public board and candidate cards.
// Never cache ranges, decisions, prices, random state or actual hidden hands.
class BoardCache extends Map {
  set(key, value) {
    if (!this.has(key) && this.size >= 4) this.delete(this.keys().next().value);
    return super.set(key, value);
  }
}
const cache = new BoardCache();
export const reviewCardCache = () => cache;
export const clearReviewCardCache = () => cache.clear();

// Every sampled deal of one snapshot repeats its visible flop/turn. Those
// boards' pure pair facts live in `fixed`, shared across the snapshot's
// deals; every other (sampled) board stays in this per-deal map.
export class SnapshotBoardCache extends Map {
  constructor(fixed, board) {
    super();
    this.fixed = fixed;
    this.fixedKeys = new Set(
      board.slice(2).map((_, i) =>
        board
          .slice(0, i + 3)
          .map((c) => c.key)
          .join('|'),
      ),
    );
  }
  get(key) {
    return this.fixedKeys.has(key) ? this.fixed.get(key) : super.get(key);
  }
  set(key, value) {
    if (this.fixedKeys.has(key)) this.fixed.set(key, value);
    else super.set(key, value);
    return this;
  }
}
