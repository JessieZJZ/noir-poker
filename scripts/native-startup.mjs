export function iosLaunchProcessId(output) {
  const value = Number(output.match(/:\s*(\d+)\s*$/)?.[1]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw Error('Independent iOS launch did not return a process PID');
  return value;
}

export function iosInitialScreenReady(stderr, processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) return false;
  // A reused results directory may contain an earlier process's ready marker.
  // Only the current app's trusted native cover-removal acknowledgement counts.
  return new RegExp(
    `\\[${processId}:[^\\]]+\\] \\[NOIR startup\\] launch cover removed(?:\\r?\\n|$)`,
  ).test(stderr);
}
