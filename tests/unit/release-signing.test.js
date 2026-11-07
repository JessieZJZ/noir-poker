import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseReleaseConfig,
  loadReleaseSigning,
  iosExportOptions,
  keychainServices,
} from '../../scripts/release-signing.mjs';

const configFile = (text) => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'noir-release-')), 'release.env');
  writeFileSync(file, text);
  return file;
};

test('the local release file accepts paths, alias and Team ID only', () => {
  assert.deepEqual(
    parseReleaseConfig(
      '# comment\nNOIR_ANDROID_KEY_ALIAS=noir-upload\nexport NOIR_APPLE_TEAM_ID="ABCDE12345"\n\n',
    ),
    { NOIR_ANDROID_KEY_ALIAS: 'noir-upload', NOIR_APPLE_TEAM_ID: 'ABCDE12345' },
  );
  assert.throws(() => parseReleaseConfig('NOIR_ANDROID_STORE_PASSWORD=x'), /Keychain/);
  assert.throws(() => parseReleaseConfig('NOIR_OTHER=1'), /unknown setting/);
  assert.throws(() => parseReleaseConfig('not a setting'), /KEY=VALUE/);
});

test('signing settings come from the file and Keychain, and the environment wins', () => {
  const file = configFile(
    'NOIR_ANDROID_KEYSTORE=~/.config/noir-poker/upload.jks\nNOIR_ANDROID_KEY_ALIAS=noir-upload\n',
  );
  const asked = [];
  const keychain = (service) => {
    asked.push(service);
    return service === keychainServices.NOIR_ANDROID_STORE_PASSWORD ? 'from-keychain' : '';
  };
  const loaded = loadReleaseSigning({ env: {}, file, keychain });
  assert.equal(
    loaded.NOIR_ANDROID_KEYSTORE,
    path.join(os.homedir(), '.config/noir-poker/upload.jks'),
  );
  assert.equal(loaded.NOIR_ANDROID_KEY_ALIAS, 'noir-upload');
  assert.equal(loaded.NOIR_ANDROID_STORE_PASSWORD, 'from-keychain');
  // A keytool key without its own password uses the store password.
  assert.equal(loaded.NOIR_ANDROID_KEY_PASSWORD, 'from-keychain');
  assert.deepEqual(asked.sort(), Object.values(keychainServices).sort());

  const ci = loadReleaseSigning({
    env: { NOIR_ANDROID_KEY_ALIAS: 'ci', NOIR_ANDROID_STORE_PASSWORD: 'secret' },
    file,
    keychain: (service) => {
      assert.notEqual(service, keychainServices.NOIR_ANDROID_STORE_PASSWORD);
      return '';
    },
  });
  assert.equal(ci.NOIR_ANDROID_KEY_ALIAS, undefined);
  assert.equal(ci.NOIR_ANDROID_STORE_PASSWORD, undefined);
  assert.equal(ci.NOIR_ANDROID_KEY_PASSWORD, 'secret');
});

test('a missing release file loads nothing', () => {
  assert.deepEqual(
    loadReleaseSigning({ env: {}, file: '/nonexistent/release.env', keychain: () => '' }),
    {},
  );
});

test('the iOS export uploads to App Store Connect with the configured team', () => {
  const plist = iosExportOptions('ABCDE12345');
  assert.match(plist, /<key>method<\/key>\s*<string>app-store-connect<\/string>/);
  assert.match(plist, /<key>destination<\/key>\s*<string>upload<\/string>/);
  assert.match(plist, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
  assert.match(plist, /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
});
