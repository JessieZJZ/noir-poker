import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_PORTRAITS } from '../src/ui/portraits.js';
import { root } from './mobile-lib.mjs';

export const BUNDLED_ASSET_MANIFEST = 'bundled-assets.json';
const imageExtension = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i;
const audioExtension = /\.(?:m4a|mp3|ogg|opus|wav|flac)$/i;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function assetPath(value) {
  const relative = value.replace(/^\//, '');
  if (
    !relative ||
    relative.includes('\\') ||
    relative.split('/').some((part) => !part || part === '.' || part === '..') ||
    /^[a-z][a-z0-9+.-]*:/i.test(relative)
  )
    throw Error(`Bundled images must use a local public path: ${value}`);
  return relative;
}

/** Public images and audio are checked byte-for-byte in every native package. */
export function createBundledAssetManifest({
  publicDir = path.join(root, 'public'),
  portraits = PROFILE_PORTRAITS,
} = {}) {
  const portraitPaths = new Map(
    Object.entries(portraits).map(([id, photo]) => [assetPath(photo.src), id]),
  );
  const assets = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile() && (imageExtension.test(relative) || audioExtension.test(relative))) {
        const bytes = readFileSync(path.join(directory, entry.name));
        if (!bytes.length) throw Error(`Source image is empty: ${relative}`);
        assets.push({
          path: relative,
          bytes: bytes.length,
          sha256: sha256(bytes),
          ...(portraitPaths.has(relative) ? { profileId: portraitPaths.get(relative) } : {}),
        });
      }
    }
  }
  visit(publicDir);
  for (const [relative, id] of portraitPaths)
    if (!assets.some((asset) => asset.path === relative))
      throw Error(`Portrait ${id} is missing from public/: ${relative}`);
  return { version: 1, assets, sourceAssetDigest: sha256(JSON.stringify(assets)) };
}

export function writeBundledAssetManifest(webDir, options = {}) {
  const manifest = createBundledAssetManifest(options);
  writeFileSync(
    path.join(webDir, BUNDLED_ASSET_MANIFEST),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  verifyBundledAssetDirectory(webDir, options);
  return manifest;
}

function verifyAssets(read, options = {}) {
  const expected = createBundledAssetManifest(options);
  let actual;
  try {
    actual = JSON.parse(read(BUNDLED_ASSET_MANIFEST).toString('utf8'));
  } catch (error) {
    throw Error(`Bundled image manifest is missing or invalid: ${error.message}`);
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error('Bundled image manifest differs from the latest source. Rebuild this artifact');
  for (const asset of expected.assets) {
    let bytes;
    try {
      bytes = read(asset.path);
    } catch (error) {
      throw Error(`Bundled image is missing: ${asset.path} (${error.message})`);
    }
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
      throw Error(`Bundled image differs from source: ${asset.path}`);
  }
  return {
    sourceAssetDigest: expected.sourceAssetDigest,
    imageCount: expected.assets.filter((asset) => imageExtension.test(asset.path)).length,
    audioCount: expected.assets.filter((asset) => audioExtension.test(asset.path)).length,
    portraitCount: expected.assets.filter((asset) => asset.profileId).length,
  };
}

export function verifyBundledAssetDirectory(webDir, options = {}) {
  return verifyAssets((relative) => readFileSync(path.join(webDir, relative)), options);
}

function zipEntry(archive, entry) {
  const result = spawnSync('unzip', ['-p', archive, entry], { maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(result.stderr.toString('utf8').trim() || `Missing archive entry: ${entry}`);
  return result.stdout;
}

/** Inspect final compiled artifacts, rather than trusting the pre-build asset copy. */
export function verifyBundledArtifact(artifact, options = {}) {
  artifact = path.resolve(artifact);
  if (!existsSync(artifact)) throw Error(`Native artifact does not exist: ${artifact}`);
  let report;
  if (artifact.endsWith('.app')) {
    report = verifyBundledAssetDirectory(path.join(artifact, 'public'), options);
  } else if (artifact.endsWith('.xcarchive')) {
    const applications = path.join(artifact, 'Products/Applications');
    const apps = readdirSync(applications).filter((name) => name.endsWith('.app'));
    if (apps.length !== 1) throw Error('Expected one iOS application in the archive');
    report = verifyBundledAssetDirectory(path.join(applications, apps[0], 'public'), options);
  } else {
    let prefix;
    if (artifact.endsWith('.apk')) prefix = 'assets/public/';
    else if (artifact.endsWith('.aab')) prefix = 'base/assets/public/';
    else throw Error('Use a compiled .app, .xcarchive, .apk or .aab artifact');
    report = verifyAssets((relative) => zipEntry(artifact, prefix + relative), options);
  }
  return { artifact, ...report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [command, ...targets] = process.argv.slice(2);
  if (!targets.length || !['write', 'verify', 'artifact'].includes(command))
    throw Error(
      'Use bundled-assets.mjs write|verify <Web directory> or artifact <native artifact...>',
    );
  for (const target of targets) {
    const report =
      command === 'write'
        ? writeBundledAssetManifest(path.resolve(target))
        : command === 'verify'
          ? verifyBundledAssetDirectory(path.resolve(target))
          : verifyBundledArtifact(target);
    console.log(JSON.stringify(report));
  }
}
