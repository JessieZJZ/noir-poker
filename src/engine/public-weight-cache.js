// Pure range likelihoods only: fully keyed public evidence plus a candidate
// class/pair. Nothing here retains a sampled hand, policy result or RNG state.
const owners = new WeakMap();
const MAX_CONTEXTS = 24;
export function publicWeightMemo(cache, descriptor, board, { evaluate, features, compare }) {
  // JSON maps non-finite numbers to null. Such malformed observations must
  // never alias a valid descriptor; bypass this optional optimization.
  let finite = true;
  const key = JSON.stringify([descriptor, board], (_, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) finite = false;
    return value;
  });
  if (!finite) return (_, calculate) => calculate();
  const owner = cache.fixed instanceof Map ? cache.fixed : cache;
  let group = owners.get(owner);
  if (
    !group ||
    group.evaluate !== evaluate ||
    group.features !== features ||
    group.compare !== compare
  ) {
    group = { evaluate, features, compare, contexts: new Map() };
    owners.set(owner, group);
  }
  let values = group.contexts.get(key);
  if (!values) {
    if (group.contexts.size >= MAX_CONTEXTS)
      group.contexts.delete(group.contexts.keys().next().value);
    values = new Float64Array(board.length < 3 ? 450 : 2704).fill(NaN);
    group.contexts.set(key, values);
  } else {
    group.contexts.delete(key);
    group.contexts.set(key, values);
  }
  const preflop = board.length < 3;
  return (pair, calculate) => {
    if (
      pair.length !== 2 ||
      pair.some(
        (c) =>
          !Number.isInteger(c.rank) ||
          c.rank < 2 ||
          c.rank > 14 ||
          !Number.isInteger(c.suit) ||
          c.suit < 0 ||
          c.suit > 3,
      )
    )
      return calculate();
    const a = pair[0],
      b = pair[1];
    let index;
    if (preflop)
      index =
        Math.max(a.rank, b.rank) * 30 + Math.min(a.rank, b.rank) * 2 + (a.suit === b.suit ? 1 : 0);
    else {
      const x = a.suit * 13 + a.rank - 2,
        y = b.suit * 13 + b.rank - 2;
      index = Math.min(x, y) * 52 + Math.max(x, y);
    }
    if (Number.isNaN(values[index])) values[index] = calculate();
    return values[index];
  };
}
