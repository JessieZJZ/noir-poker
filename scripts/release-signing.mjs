import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

// Release signing settings live outside the repository. The file holds only
// non-secret values (paths, alias, Team ID); passwords come from the macOS
// Keychain or from the environment (CI secrets), never from a file.
export const releaseConfigPath = () =>
  process.env.NOIR_RELEASE_CONFIG ?? path.join(os.homedir(), '.config/noir-poker/release.env');

export const keychainServices = {
  NOIR_ANDROID_STORE_PASSWORD: 'noir-poker-android-store',
  NOIR_ANDROID_KEY_PASSWORD: 'noir-poker-android-key',
};

const allowed = new Set(['NOIR_ANDROID_KEYSTORE', 'NOIR_ANDROID_KEY_ALIAS', 'NOIR_APPLE_TEAM_ID']);

export function parseReleaseConfig(text, file = 'release.env') {
  const values = {};
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) throw Error(`${file}:${index + 1}: expected KEY=VALUE`);
    const [, key, rawValue] = match;
    if (/PASSWORD|SECRET|TOKEN/.test(key))
      throw Error(`${file}:${index + 1}: keep ${key} in the Keychain, not in a file`);
    if (!allowed.has(key)) throw Error(`${file}:${index + 1}: unknown setting ${key}`);
    values[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  });
  return values;
}

const readKeychain = (service) => {
  const result = spawnSync('security', ['find-generic-password', '-s', service, '-w'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.replace(/\n$/, '') : '';
};

export function loadReleaseSigning({
  env = process.env,
  file = releaseConfigPath(),
  keychain = process.platform === 'darwin' ? readKeychain : () => '',
} = {}) {
  const loaded = {};
  if (existsSync(file))
    for (const [key, value] of Object.entries(parseReleaseConfig(readFileSync(file, 'utf8'), file)))
      if (!env[key]) loaded[key] = value;
  for (const [key, service] of Object.entries(keychainServices))
    if (!env[key]) {
      const value = keychain(service);
      if (value) loaded[key] = value;
    }
  // keytool gives a JKS key the store password unless -keypass is set.
  const merged = { ...env, ...loaded };
  if (!merged.NOIR_ANDROID_KEY_PASSWORD && merged.NOIR_ANDROID_STORE_PASSWORD)
    loaded.NOIR_ANDROID_KEY_PASSWORD = merged.NOIR_ANDROID_STORE_PASSWORD;
  const keystore = loaded.NOIR_ANDROID_KEYSTORE;
  if (keystore?.startsWith('~/'))
    loaded.NOIR_ANDROID_KEYSTORE = path.join(os.homedir(), keystore.slice(2));
  return loaded;
}

export function iosExportOptions(teamID, destination = 'upload') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>${destination}</string>
  <key>teamID</key>
  <string>${teamID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;
}
