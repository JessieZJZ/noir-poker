const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function applicationContext(contexts, { appId, platform, preferred }) {
  const webviews = contexts.filter(
    (context) => typeof context === 'string' && context.startsWith('WEBVIEW'),
  );
  const application = webviews.find((context) => context === `WEBVIEW_${appId}`);
  if (application) return application;
  // Android exposes the package name; never attach to another application's
  // WebView. iOS exposes page IDs and already excludes Safari in capabilities.
  if (platform === 'android') return undefined;
  if (webviews.includes(preferred)) return preferred;
  return webviews.length === 1 ? webviews[0] : undefined;
}

export async function restoreWebviewContext(
  command,
  {
    appId,
    platform,
    preferred,
    timeoutMs = 90000,
    intervalMs = 300,
    now = Date.now,
    pause = sleep,
    onAttempt,
  } = {},
) {
  const deadline = now() + timeoutMs;
  let available = [];
  let lastError;
  let attempts = 0;
  while (now() < deadline) {
    attempts += 1;
    let context;
    try {
      available = await command('GET', '/contexts');
      context = applicationContext(available, { appId, platform, preferred });
      if (!context) throw Error('The application WebView is not currently discoverable');
      // A discovered context can disappear before setContext: Android's CDP
      // inspection may transiently time out and report a live WebView as empty.
      await command('POST', '/context', { name: context });
      onAttempt?.({ attempts, available, context, restored: true });
      return context;
    } catch (error) {
      lastError = error;
      onAttempt?.({ attempts, available, context, restored: false, error: error.message });
    }
    await pause(intervalMs);
  }
  throw Error(
    `Application WebView could not be restored within ${timeoutMs}ms; available contexts: ${JSON.stringify(available)}; last error: ${lastError?.message ?? 'none'}`,
    { cause: lastError },
  );
}
