// Local startup diagnostics identify a stalled await without exposing an
// unfinished table or changing readiness, preferences, or playback behavior.
export function createStartupState({
  document = globalThis.document,
  now = () => performance.now(),
} = {}) {
  const started = now();
  const state = { stage: 'entry', history: [], error: null };
  function stage(value) {
    state.stage = value;
    state.history.push({ stage: value, elapsedMs: Math.round(now() - started) });
    document.documentElement.dataset.startupStage = value;
  }
  stage('entry');
  return {
    state,
    stage,
    fail(error) {
      state.error = {
        stage: state.stage,
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? ''),
      };
      stage('failed');
    },
  };
}
