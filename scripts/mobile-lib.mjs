import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const readJson = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));

export function mobileMetadata(env = process.env) {
  const config = readJson('capacitor.config.json');
  const release = readJson('mobile/release.json');
  const version = readJson('package.json').version;
  const buildNumber = Number(env.NOIR_BUILD_NUMBER ?? release.buildNumber);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('package.json version must be x.y.z');
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1 || buildNumber > 2100000000)
    throw Error('NOIR_BUILD_NUMBER must be a positive Android-compatible integer');
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(config.appId))
    throw Error('Invalid Capacitor appId');
  if (config.server?.url || config.android?.allowMixedContent)
    throw Error('Store builds must bundle local assets and disable mixed content');
  return { appId: config.appId, appName: config.appName, version, buildNumber };
}

export function directoryDigest(directory) {
  const hash = createHash('sha256');
  function visit(current, prefix = '') {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative + '/');
      else if (
        entry.isFile() &&
        !['capacitor.js', 'capacitor_plugins.js', 'cordova.js', 'cordova_plugins.js'].includes(
          relative,
        )
      ) {
        hash.update(relative + '\0');
        hash.update(readFileSync(path.join(current, entry.name)));
      }
    }
  }
  visit(directory);
  return hash.digest('hex');
}

export function sourceDigest() {
  const hash = createHash('sha256');
  for (const directory of ['src', 'public', 'scripts'])
    hash.update(directoryDigest(path.join(root, directory)));
  for (const name of [
    'index.html',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'capacitor.config.json',
    'mobile/release.json',
    'mobile/icon.svg',
  ]) {
    hash.update(name + '\0');
    hash.update(readFileSync(path.join(root, name)));
  }
  return hash.digest('hex');
}
