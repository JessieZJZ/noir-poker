import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectIOSSimulator } from '../../scripts/native-device.mjs';
import { writeBundledAssetManifest } from '../../scripts/bundled-assets.mjs';
import { sourceDigest } from '../../scripts/mobile-lib.mjs';
import { nativeScenarios } from '../native/scenarios.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const phone = (generation, suffix = '') => ({
  name: `iPhone ${generation}${suffix}`,
  identifier: `phone-${generation}${suffix}`,
});
const runtime = (version, phones) => ({
  version,
  identifier: `iOS-${version}`,
  isAvailable: true,
  supportedDeviceTypes: phones,
});
function inventory() {
  const phones = [phone(16, ' Pro Max'), phone(16), phone(17), phone(17, ' Pro')];
  return {
    devices: {},
    runtimes: [runtime('18.5', [phones[1]]), runtime('26.0', phones)],
    devicetypes: phones,
  };
}

test('iOS selects a compatible standard phone independently of inventory order', () => {
  const input = inventory();
  const selected = selectIOSSimulator(input);
  assert.equal(selected.runtime.identifier, 'iOS-26.0');
  assert.equal(selected.phone.identifier, 'phone-17');
  input.devicetypes.reverse();
  input.runtimes.reverse();
  assert.deepEqual(selectIOSSimulator(input), selected);
  assert.equal(
    selectIOSSimulator(input, { runtimeIdentifier: 'iOS-18.5' }).phone.identifier,
    'phone-16',
  );
});

test('iOS only reuses the dedicated simulator on the selected runtime and device type', () => {
  const input = inventory();
  const device = {
    name: 'Noir Poker E2E',
    isAvailable: true,
    deviceTypeIdentifier: 'phone-17',
    udid: 'selected-device',
  };
  input.devices['iOS-18.5'] = [device];
  input.devices['iOS-26.0'] = [{ ...device, deviceTypeIdentifier: 'phone-16' }];
  assert.equal(selectIOSSimulator(input).existing, undefined);
  input.devices['iOS-26.0'].push(device);
  assert.equal(selectIOSSimulator(input).existing.udid, 'selected-device');
});

test('explicit unavailable or incompatible iOS selections fail rather than silently drifting', () => {
  const input = inventory();
  assert.throws(
    () => selectIOSSimulator(input, { runtimeIdentifier: 'iOS-99' }),
    /No available iOS/,
  );
  input.runtimes[1].isAvailable = false;
  assert.throws(
    () => selectIOSSimulator(input, { deviceTypeIdentifier: 'phone-17' }),
    /No compatible iPhone/,
  );
});

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-native-runner-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'results');
  const execute = (platform, args = [], env = {}) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/native-e2e.mjs', platform, '--output', output, ...args],
      { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15000 },
    );
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.ok(report.completedAt);
    assert.deepEqual(report.scenarios, []);
    return report;
  };
  return { directory, execute };
}

test('missing native artifacts produce a failed preflight report before device operations', (t) => {
  const { directory, execute } = fixture(t);
  const report = execute('android', ['--app', path.join(directory, 'missing.apk')]);
  assert.equal(report.phase, 'preflight');
  assert.match(report.error, /Build the actual android app first/);
});

test('iOS boot-status failure records the device and shuts down a simulator the runner booted', (t) => {
  const { directory, execute } = fixture(t);
  const app = path.join(directory, 'App.app');
  const web = path.join(app, 'public');
  cpSync(path.join(root, 'public'), web, { recursive: true });
  writeBundledAssetManifest(web);
  writeFileSync(
    path.join(web, 'build-info.json'),
    JSON.stringify({ sourceDigest: sourceDigest() }),
  );
  const bin = path.join(directory, 'bin');
  mkdirSync(bin);
  const toolLog = path.join(directory, 'tools.jsonl');
  // This protocol fixture exercises cleanup without booting a real simulator.
  writeFileSync(
    path.join(bin, 'xcrun'),
    `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.NOIR_TEST_TOOL_LOG, JSON.stringify(args) + '\\n');
if (args[1] === 'list') {
  const output = args[2] === 'devices' ? { devices: {} }
    : args[2] === 'runtimes' ? { runtimes: [{identifier:'iOS-26',version:'26',isAvailable:true}] }
    : { devicetypes: [{name:'iPhone 17',identifier:'phone-17'}] };
  console.log(JSON.stringify(output));
} else if (args[1] === 'create') console.log('fake-simulator');
else if (args[1] === 'bootstatus') { console.error('fixture bootstatus failed'); process.exit(1); }
`,
    { mode: 0o755 },
  );
  const report = execute('ios', ['--app', app], {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    NOIR_IOS_UDID: '',
    NOIR_IOS_RUNTIME: '',
    NOIR_IOS_DEVICE_TYPE: '',
    NOIR_TEST_TOOL_LOG: toolLog,
  });
  assert.equal(report.phase, 'device');
  assert.equal(report.udid, 'fake-simulator');
  assert.match(report.error, /fixture bootstatus failed/);
  assert.ok(report.bundledAssets.portraitCount >= 8);
  const calls = readFileSync(toolLog, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.at(-1), ['simctl', 'shutdown', 'fake-simulator']);
});

test('a native scenario failure is recorded without turning it into a partial pass', async () => {
  const entries = [];
  const error = Error('WebView layout read failed');
  await assert.rejects(
    nativeScenarios({
      waitFor: async (read) => read(),
      evaluate: async () => {
        throw error;
      },
      record: (entry) => entries.push(entry),
    }),
    (value) => value === error,
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'local-launch-and-no-login');
  assert.equal(entries[0].status, 'failed');
  assert.match(entries[0].error, /WebView layout read failed/);
});
