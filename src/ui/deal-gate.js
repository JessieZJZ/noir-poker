// The longest nine-seat deal finishes at 8 * 65 + 140 + 600 = 1260 ms.
// Keep presentation timing outside the rules engine, shared by every platform.
export const DEAL_PRESENTATION_MS = 1300;

export function createDealGate({
  complete,
  schedule = setTimeout,
  unschedule = clearTimeout,
  now = Date.now,
  active = true,
} = {}) {
  let timer = null;
  let pending = false;
  let remaining = 0;
  let deadline = 0;
  let epoch = 0;
  function clear() {
    epoch++;
    if (timer !== null) unschedule(timer);
    timer = null;
  }
  function arm() {
    if (!pending || !active) return;
    const ticket = epoch;
    deadline = now() + remaining;
    timer = schedule(() => {
      if (ticket !== epoch || !pending || !active) return;
      timer = null;
      pending = false;
      remaining = 0;
      complete?.();
    }, remaining);
  }
  return {
    get pending() {
      return pending;
    },
    begin() {
      clear();
      pending = true;
      remaining = DEAL_PRESENTATION_MS;
      arm();
    },
    setActive(value) {
      value = Boolean(value);
      if (active === value) return;
      if (pending && active) remaining = Math.max(0, deadline - now());
      clear();
      active = value;
      arm();
    },
    cancel() {
      clear();
      pending = false;
      remaining = 0;
    },
  };
}
