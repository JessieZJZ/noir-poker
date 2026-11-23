export function iosLaunchProcessId(output) {
  const value = Number(output.match(/:\s*(\d+)\s*$/)?.[1]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw Error('Independent iOS launch did not return a process PID');
  return value;
}

export function iosInitialScreenReady(stderr, processId, { requireBackportMarker = false } = {}) {
  if (!Number.isSafeInteger(processId) || processId < 1) return false;
  // A reused results directory may contain an earlier process's ready marker.
  // Only the current app's trusted native cover-removal acknowledgement counts.
  const ready = new RegExp(
    `\\[${processId}:[^\\]]+\\] \\[NOIR startup\\] launch cover removed(?:\\r?\\n|$)`,
  ).test(stderr);
  if (!ready || !requireBackportMarker) return ready;
  return new RegExp(
    `\\[${processId}:[^\\]]+\\] \\[NOIR startup\\] capacitor backport installed capacitor-8688-ios-8\\.5\\.3-v1(?:\\r?\\n|$)`,
  ).test(stderr);
}
