import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreWebviewContext } from '../../scripts/native-context.mjs';

const appId = 'io.github.jessiezjz.noirpoker';
const appContext = `WEBVIEW_${appId}`;
function clock() {
  let elapsed = 0;
  return {
    now: () => elapsed,
    pause: async (ms) => {
      elapsed += ms;
    },
  };
}

test('native screenshot recovery retries the Android CDP discovery and switch race', async () => {
  const calls = [];
  const observations = [];
  let discovery = 0;
  const command = async (method, endpoint, body) => {
    calls.push({ method, endpoint, body });
    if (endpoint === '/contexts') {
      discovery += 1;
      return discovery === 1 || discovery === 3 ? ['NATIVE_APP'] : ['NATIVE_APP', appContext];
    }
    if (discovery === 2) throw Error('No such context found');
    return null;
  };
  const result = await restoreWebviewContext(command, {
    appId,
    platform: 'android',
    preferred: appContext,
    ...clock(),
    onAttempt: (value) => observations.push(value),
  });
  assert.equal(result, appContext);
  assert.deepEqual(
    calls.map((call) => call.endpoint),
    ['/contexts', '/contexts', '/context', '/contexts', '/contexts', '/context'],
  );
  assert.deepEqual(
    observations.map((value) => value.restored),
    [false, false, false, true],
  );
  assert.match(observations[1].error, /No such context/);
});

test('recreated iOS page contexts replace the remembered context', async () => {
  const switches = [];
  const result = await restoreWebviewContext(
    async (method, endpoint, body) => {
      if (endpoint === '/contexts') return ['NATIVE_APP', 'WEBVIEW_27'];
      switches.push(body.name);
    },
    { appId, platform: 'ios', preferred: 'WEBVIEW_8', ...clock() },
  );
  assert.equal(result, 'WEBVIEW_27');
  assert.deepEqual(switches, ['WEBVIEW_27']);
});

test('Android recovery cannot substitute an unrelated browser for the installed app', async () => {
  let switched = false;
  await assert.rejects(
    restoreWebviewContext(
      async (method, endpoint) => {
        if (endpoint === '/contexts') return ['NATIVE_APP', 'WEBVIEW_com.android.chrome'];
        switched = true;
      },
      { appId, platform: 'android', timeoutMs: 600, ...clock() },
    ),
    /could not be restored within 600ms/,
  );
  assert.equal(switched, false);
});

test('persistent switch failure remains a failure with the original error and evidence', async () => {
  const original = Error('No such context found');
  const observations = [];
  await assert.rejects(
    restoreWebviewContext(
      async (method, endpoint) => {
        if (endpoint === '/contexts') return ['NATIVE_APP', appContext];
        throw original;
      },
      {
        appId,
        platform: 'android',
        timeoutMs: 900,
        ...clock(),
        onAttempt: (value) => observations.push(value),
      },
    ),
    (error) => error.cause === original && /No such context found/.test(error.message),
  );
  assert.equal(observations.length, 3);
  assert.ok(observations.every((value) => !value.restored));
});
