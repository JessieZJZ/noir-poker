// WebDriver clicks and synchronous DOM reads can finish before WebKit has
// committed the changed page to the native compositor. Wait for two frame
// callbacks before switching out of the WebView to capture the device screen.
const paintScript = `
  const timeoutMs = arguments[0];
  const expected = arguments[1];
  const done = arguments[arguments.length - 1];
  let finished = false;
  let firstFrame = null;
  let lastState;
  const complete = (value) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done(value);
  };
  const timer = setTimeout(() => complete({
    error: 'WebView did not commit two animation frames within ' + timeoutMs +
      'ms after the required UI and card animations settled: ' + JSON.stringify(lastState)
  }), timeoutMs);
  const observe = () => {
    const dealAnimations = [...document.querySelectorAll('.game-surface .card-deal')]
      .flatMap((element) => element.getAnimations())
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity &&
        !['finished', 'idle'].includes(animation.playState));
    return {
      readyState: document.readyState,
      phase: window.noir?.getState()?.phase ?? null,
      reviewOpen: document.querySelector('#review-dialog')?.open ?? false,
      actionState: document.querySelector('.game-surface')?.dataset.actionState ?? null,
      heroCards: document.querySelectorAll('#hero-cards .playing-card').length,
      activeDealAnimations: dealAnimations.length
    };
  };
  const frame = (timestamp) => {
    if (finished) return;
    lastState = observe();
    const ready = lastState.readyState === 'complete' && !lastState.activeDealAnimations &&
      Object.entries(expected).every(([key, value]) => lastState[key] === value);
    if (!ready) firstFrame = null;
    else if (firstFrame !== null && timestamp > firstFrame) {
      complete({ firstFrame, committedFrame: timestamp, ...lastState });
      return;
    } else firstFrame = timestamp;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
`;

export async function captureNativeScreenshot(
  command,
  { waitForPaint = true, timeoutMs = 5000, expected = {}, save, restore, onPaint } = {},
) {
  if (waitForPaint) {
    const paint = await command('POST', '/execute/async', {
      script: paintScript,
      args: [timeoutMs, expected],
    });
    if (paint?.error) throw Error(paint.error);
    if (
      !paint ||
      !Number.isFinite(paint.firstFrame) ||
      !Number.isFinite(paint.committedFrame) ||
      paint.committedFrame <= paint.firstFrame
    )
      throw Error('WebView did not confirm a subsequent committed animation frame');
    onPaint?.(paint);
  }
  await command('POST', '/context', { name: 'NATIVE_APP' });
  const png = await command('GET', '/screenshot');
  // Preserve native pixels before restoring a potentially replaced WebView.
  save(png);
  if (restore) await restore();
}
