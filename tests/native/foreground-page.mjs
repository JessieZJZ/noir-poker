import assert from 'node:assert/strict';

let pageSequence = 0;

export function withPreservedForegroundPage(app) {
  if (app.platform !== 'android') return app;
  let pendingPage;
  const preserveForegroundPage = async () => {
    pendingPage = `native-foreground-${Date.now()}-${++pageSequence}`;
    await app.evaluate((token) => {
      window.__nativeForegroundPage = token;
    }, pendingPage);
  };
  return {
    ...app,
    preserveForegroundPage,
    async background(...args) {
      await preserveForegroundPage();
      return app.background(...args);
    },
    async activate(...args) {
      if (!pendingPage) return app.activate(...args);
      let result;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await app.activate(...args);
          break;
        } catch (error) {
          // CDP discovery can time out once while a busy WebView resumes.
          // Activate only foregrounds the existing Activity; never relaunch it.
          if (attempt >= 1 || !/No such context found/i.test(error.message)) throw error;
        }
      }
      const samePage = await app.evaluate((token) => {
        const same = window.__nativeForegroundPage === token;
        delete window.__nativeForegroundPage;
        return same;
      }, pendingPage);
      assert.equal(samePage, true, 'Native foreground must retain the same live page');
      pendingPage = undefined;
      return result;
    },
  };
}
