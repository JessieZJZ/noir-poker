import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restartNativeApplication } from '../../scripts/native-lifecycle.mjs';

test('native restart refreshes the driver application handle and affects only the selected app', async () => {
  const selected = 'io.github.jessiezjz.noirpoker';
  const applications = new Map([
    [selected, { pid: 10, handle: 10, running: true }],
    ['another.test.app', { pid: 20, handle: 20, running: true }],
  ]);
  let context = 'WEBVIEW_noir';
  const command = async (method, endpoint, body) => {
    if (endpoint === '/context') {
      context = body.name;
      return;
    }
    assert.equal(context, 'NATIVE_APP');
    const app = applications.get(body.appId);
    if (endpoint === '/appium/device/terminate_app') app.running = false;
    else if (endpoint === '/appium/device/activate_app') {
      assert.equal(app.running, false);
      app.pid += 1;
      app.handle = app.pid;
      app.running = true;
    } else throw Error(`Unexpected driver operation: ${method} ${endpoint}`);
  };
  await restartNativeApplication(command, selected);
  const app = applications.get(selected);
  assert.ok(app.running && app.handle === app.pid, 'Native source must use the relaunched process');
  assert.deepEqual(applications.get('another.test.app'), { pid: 20, handle: 20, running: true });
});

test('native restart propagates activation failure instead of continuing with a stale application', async () => {
  const error = Error('Selected simulator could not activate the app');
  await assert.rejects(
    restartNativeApplication(async (_method, endpoint) => {
      if (endpoint === '/appium/device/activate_app') throw error;
    }, 'io.github.jessiezjz.noirpoker'),
    (received) => received === error,
  );
});
