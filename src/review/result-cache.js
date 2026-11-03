// Derived results are disposable and never live inside a saved hand. The build
// supplies a digest of all engine/review sources, so strategy or wording changes
// cannot reuse an earlier analysis. Unbundled callers use an isolated revision.
export const REVIEW_CACHE_REVISION =
  typeof __NOIR_REVIEW_REVISION__ === 'string' ? __NOIR_REVIEW_REVISION__ : 'unbundled-v1';
export const REVIEW_CACHE_KEY = 'noir-review-cache-v1';
export const REVIEW_CACHE_BYTES = 1024 * 1024;

const valid = (kind, result) =>
  kind === 'decision'
    ? !!(result?.coaching?.paragraphs && result.context && result.evidence)
    : kind === 'opponent' && !!(result?.paragraphs && result.reasons && result.detail);

export function createReviewCache({
  storage = () => globalThis.localStorage,
  revision = REVIEW_CACHE_REVISION,
  maxBytes = REVIEW_CACHE_BYTES,
  maxEntries = 48,
} = {}) {
  const entries = new Map();
  let loaded = false;
  const target = () => (typeof storage === 'function' ? storage() : storage);
  const keyOf = (kind, snapshot) => JSON.stringify([kind, snapshot]);
  const serialize = () => JSON.stringify({ revision, entries: [...entries] });
  // Three bytes per UTF-16 code unit bounds UTF-8 (including surrogate pairs),
  // and also bounds Web Storage's UTF-16 accounting. Stay below wx's 1 MiB/key.
  const trim = () => {
    while (entries.size && (entries.size > maxEntries || serialize().length * 3 > maxBytes))
      entries.delete(entries.keys().next().value);
  };
  function load(refresh = false) {
    if (loaded && !refresh) return;
    loaded = true;
    try {
      const text = target()?.getItem(REVIEW_CACHE_KEY);
      if (!text || text.length * 3 > maxBytes) return;
      const saved = JSON.parse(text);
      if (saved.revision !== revision || !Array.isArray(saved.entries)) return;
      const restored = [];
      for (const [key, value] of saved.entries) {
        const [kind] = JSON.parse(key);
        if (typeof value === 'string' && valid(kind, JSON.parse(value)))
          restored.push([key, value]);
      }
      for (const [key, value] of restored) entries.set(key, value);
      trim();
    } catch {
      // Keep useful in-memory entries if persistent storage becomes unavailable.
    }
  }
  return {
    get(kind, snapshot) {
      load();
      const key = keyOf(kind, snapshot);
      // Another table/history controller may have completed it in the meantime.
      if (!entries.has(key)) load(true);
      const value = entries.get(key);
      if (!value) return null;
      entries.delete(key);
      entries.set(key, value);
      return JSON.parse(value);
    },
    set(kind, snapshot, result) {
      if (!valid(kind, result)) return;
      load(true);
      const key = keyOf(kind, snapshot);
      const value = JSON.stringify(result);
      if (JSON.stringify({ revision, entries: [[key, value]] }).length * 3 > maxBytes) return;
      entries.delete(key);
      entries.set(key, value);
      trim();
      try {
        target()?.setItem(REVIEW_CACHE_KEY, serialize());
      } catch {
        // Quota/private-mode failures never interrupt a review or its raw record.
      }
    },
  };
}

export const reviewResultCache = createReviewCache();
