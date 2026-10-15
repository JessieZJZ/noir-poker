// Render-independent, once-per-decision notification. No private game data.
export function createHeroTurnCue(notify) {
  let notified = null;
  return {
    reset() {
      notified = null;
    },
    update({ key, enabled, active }) {
      if (!enabled || !active || key === notified) return false;
      notified = key;
      try {
        Promise.resolve(notify()).catch(() => {});
      } catch {}
      return true;
    },
  };
}

export const HERO_TURN_ENTRY_MS = 850;
export const HERO_TURN_REMINDER_MS = 8000;
export const HERO_TURN_PULSE_MS = 1000;

// Visual attention is independent of sound/haptics. Only public decision identity
// enters this controller; renders and preference changes never restart a pulse.
export function createHeroTurnAttention({
  publish,
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let key = null;
  let phase = '';
  let active = false;
  let entered = false;
  let reminded = false;
  let engaged = false;
  let timers = [];
  let revision = 0;
  const change = (next) => {
    if (phase === next) return;
    phase = next;
    publish(phase);
  };
  const cancel = () => {
    revision++;
    timers.forEach(unschedule);
    timers = [];
  };
  const later = (delay, callback) => {
    const ticket = revision;
    const id = schedule(() => {
      timers = timers.filter((timer) => timer !== id);
      if (ticket === revision && active) callback();
    }, delay);
    timers.push(id);
  };
  return {
    get phase() {
      return phase;
    },
    update(state) {
      if (key !== state.key || !state.enabled) {
        cancel();
        key = state.enabled ? state.key : null;
        entered = reminded = engaged = false;
        active = false;
        change('');
      }
      const available = !!(state.enabled && state.active);
      if (active === available) return;
      active = available;
      cancel();
      if (!active) return change('');
      change(entered ? 'waiting' : 'enter');
      if (!entered) later(HERO_TURN_ENTRY_MS, () => change('waiting'));
      entered = true;
      if (!reminded && !engaged)
        later(HERO_TURN_REMINDER_MS, () => {
          reminded = true;
          change('reminder');
          later(HERO_TURN_PULSE_MS, () => change('waiting'));
        });
    },
    engage() {
      if (!active) return;
      engaged = true;
      cancel();
      change('waiting');
    },
    reset() {
      cancel();
      key = null;
      active = entered = reminded = engaged = false;
      change('');
    },
  };
}
