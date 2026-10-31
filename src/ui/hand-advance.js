// A finishing hand can replace its fast-finish control with “next hand” before
// a delayed native touch becomes a click. Keep the original pointer target and
// hand identity; keyboard and accessibility activation have no such pointer.
export function createHandAdvanceGuard({ button, token, root = button.ownerDocument }) {
  let pointer = null;
  const reset = () => {
    pointer = null;
  };
  const targetButton = (event) => event.target?.closest?.('button') || null;
  const down = (event) => {
    pointer = { button: targetButton(event), token: token() };
  };
  const otherClick = (event) => {
    if (targetButton(event) !== button) reset();
  };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointercancel', reset, true);
  root.addEventListener('keydown', reset, true);
  root.addEventListener('click', otherClick, true);
  root.defaultView?.addEventListener('blur', reset);
  return {
    allow(event) {
      const origin = pointer;
      reset();
      if (
        event?.defaultPrevented ||
        (origin && (origin.button !== button || origin.token !== token()))
      ) {
        event?.preventDefault();
        return false;
      }
      return true;
    },
    reset,
    destroy() {
      reset();
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointercancel', reset, true);
      root.removeEventListener('keydown', reset, true);
      root.removeEventListener('click', otherClick, true);
      root.defaultView?.removeEventListener('blur', reset);
    },
  };
}
