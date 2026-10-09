// A tip belongs to one decision context. Unrelated seat renders must not
// extend its lifetime, and a backgrounded app must not replay an old tip.
export function createHintNotification({
  publish,
  duration = 7000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let context = null,
    timer = null,
    ticket = 0,
    active = true,
    visible = false;
  function hide() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    ticket++;
    if (visible) publish({ visible: false });
    visible = false;
  }
  return {
    update({ enabled, key, text, stage, notify = true, force = false }) {
      if (!enabled) {
        context = null;
        hide();
        return;
      }
      if (key === context && !force) return;
      context = key;
      hide();
      if (!active || !notify || !text) return;
      visible = true;
      publish({ visible: true, text, stage });
      const current = ticket;
      timer = setTimer(() => {
        if (current === ticket) hide();
      }, duration);
    },
    setActive(nextActive) {
      active = !!nextActive;
      if (!active) hide();
    },
    destroy: hide,
  };
}
