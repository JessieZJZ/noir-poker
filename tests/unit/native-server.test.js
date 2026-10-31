import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeServerArguments } from '../../scripts/native-server.mjs';

const option = (args, name) => args[args.indexOf(name) + 1];
test('iOS startup excludes the unrelated Android driver and its download permission', () => {
  const args = nativeServerArguments('ios', 4736);
  assert.equal(option(args, '--use-drivers'), 'xcuitest');
  assert.equal(option(args, '--port'), '4736');
  assert.equal(args.includes('--allow-insecure'), false);
});
test('Android startup keeps its selected driver and scoped WebView discovery permission', () => {
  const args = nativeServerArguments('android', 4737);
  assert.equal(option(args, '--use-drivers'), 'uiautomator2');
  assert.equal(option(args, '--allow-insecure'), 'uiautomator2:chromedriver_autodownload');
  assert.throws(() => nativeServerArguments('unknown', 4737), /Unsupported/);
});
