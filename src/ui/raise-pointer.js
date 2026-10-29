// WebKit may treat a touch on an empty range track as a tap/scroll instead
// of starting a thumb drag. Keep the existing range artwork and keyboard UI,
// but own touch/pen movement across the full rail.
export function attachRaisePointer(input, { context, limit }) {
  let gesture = null;
  const cancel = () => {
    const previous = gesture;
    gesture = null;
    if (previous && input.hasPointerCapture?.(previous.id))
      input.releasePointerCapture(previous.id);
  };
  const move = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (input.disabled || gesture.context !== context()) return cancel();
    event.preventDefault();
    const rect = input.getBoundingClientRect();
    const thumb = parseFloat(getComputedStyle(input).getPropertyValue('--raise-thumb-size')) || 15;
    const width = rect.width - thumb;
    if (width <= 0) return;
    input.value = String(
      Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - thumb / 2) / width)) * limit),
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const start = (event) => {
    if (!['touch', 'pen'].includes(event.pointerType) || input.disabled || gesture) return;
    event.preventDefault();
    gesture = { id: event.pointerId, context: context() };
    input.setPointerCapture?.(event.pointerId);
    move(event);
  };
  const end = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const commit = !input.disabled && gesture.context === context();
    event.preventDefault();
    cancel();
    if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const interrupted = (event) => {
    if (gesture?.id === event.pointerId) cancel();
  };
  const hidden = () => {
    if (document.hidden) cancel();
  };
  input.addEventListener('pointerdown', start);
  input.addEventListener('pointermove', move);
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', interrupted);
  input.addEventListener('lostpointercapture', interrupted);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    cancel();
    input.removeEventListener('pointerdown', start);
    input.removeEventListener('pointermove', move);
    input.removeEventListener('pointerup', end);
    input.removeEventListener('pointercancel', interrupted);
    input.removeEventListener('lostpointercapture', interrupted);
    document.removeEventListener('visibilitychange', hidden);
  };
}
