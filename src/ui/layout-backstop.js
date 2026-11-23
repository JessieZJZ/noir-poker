// Resize/media/observer notifications can all lag behind a WebKit rotation.
// Check only the layout inputs, and repair once when those inputs have changed.
export function createLayoutBackstop({
  read,
  repair,
  canRepair,
  active = true,
  interval = 250,
  schedule = (callback, delay) => setTimeout(callback, delay),
  unschedule = (id) => clearTimeout(id),
}) {
  let previous = null,
    timer = null,
    generation = 0,
    destroyed = false;

  function record() {
    if (!destroyed && active && canRepair()) previous = [...read()];
  }
  function check() {
    if (!canRepair()) return;
    const current = read();
    if (
      previous &&
      current.length === previous.length &&
      current.every((value, index) => Object.is(value, previous[index]))
    )
      return;
    if (repair() === true) record();
  }
  function arm() {
    if (destroyed || !active || timer !== null) return;
    const token = generation;
    timer = schedule(() => {
      if (destroyed || !active || token !== generation) return;
      timer = null;
      try {
        check();
      } finally {
        arm();
      }
    }, interval);
  }
  function cancel() {
    generation++;
    if (timer !== null) unschedule(timer);
    timer = null;
  }
  arm();
  return {
    record,
    setActive(next) {
      if (destroyed || active === next) return;
      active = next;
      cancel();
      arm();
    },
    destroy() {
      destroyed = true;
      cancel();
    },
  };
}
