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
