import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BUNDLED_ASSET_MANIFEST,
  createBundledAssetManifest,
  writeBundledAssetManifest,
  verifyBundledAssetDirectory,
  verifyBundledArtifact,
} from '../../scripts/bundled-assets.mjs';
import { PROFILE_PORTRAITS, portraitContent, portraitCredit } from '../../src/ui/portraits.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-bundled-assets-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const publicDir = path.join(directory, 'public');
  mkdirSync(path.join(publicDir, 'portraits'), { recursive: true });
  writeFileSync(path.join(publicDir, 'portraits/a.jpg'), 'portrait a bytes');
  writeFileSync(path.join(publicDir, 'portraits/b.webp'), 'portrait b bytes');
  writeFileSync(path.join(publicDir, 'favicon.svg'), '<svg />');
  writeFileSync(path.join(publicDir, 'portraits/CREDITS.md'), 'attribution');
  const options = {
    publicDir,
    portraits: { a: { src: '/portraits/a.jpg' }, b: { src: '/portraits/b.webp' } },
  };
  const webDir = path.join(directory, 'web');
  cpSync(publicDir, webDir, { recursive: true });
  writeBundledAssetManifest(webDir, options);
  return { directory, publicDir, webDir, options };
}

test('every collected portrait renders a local image and retains its attribution', () => {
  for (const [id, photo] of Object.entries(PROFILE_PORTRAITS)) {
    assert.ok(portraitContent(id, 'fallback').includes(`src="${photo.src}"`));
    assert.ok(portraitCredit(id).includes(photo.source));
  }
  assert.doesNotMatch(portraitContent('balanced', '均'), /<img/);
});

test('source manifest includes every image, even unselected portraits, with byte and hash checks', () => {
  const manifest = createBundledAssetManifest();
  assert.equal(
    manifest.assets.filter((asset) => asset.profileId).length,
    Object.keys(PROFILE_PORTRAITS).length,
  );
  assert.ok(manifest.assets.some((asset) => asset.path === 'favicon.png'));
  for (const asset of manifest.assets) {
    assert.ok(asset.bytes > 0);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test('manifest is deterministic and verifies the complete image directory', (t) => {
  const { webDir, options } = fixture(t);
  const first = createBundledAssetManifest(options);
  assert.deepEqual(createBundledAssetManifest(options), first);
  const report = verifyBundledAssetDirectory(webDir, options);
  assert.equal(report.imageCount, 3);
  assert.equal(report.portraitCount, 2);
  assert.equal(report.sourceAssetDigest, first.sourceAssetDigest);
});

test('missing, edited and newly added source images all prevent stale delivery', (t) => {
  const { publicDir, webDir, options } = fixture(t);
  const portrait = path.join(webDir, 'portraits/a.jpg');
  const original = readFileSync(portrait);
  rmSync(portrait);
  assert.throws(() => verifyBundledAssetDirectory(webDir, options), /image is missing/);
  writeFileSync(portrait, 'corrupted');
  assert.throws(() => verifyBundledAssetDirectory(webDir, options), /differs from source/);
  writeFileSync(portrait, original);
  writeFileSync(path.join(publicDir, 'new.png'), 'new source image');
  assert.throws(() => verifyBundledAssetDirectory(webDir, options), /latest source/);
});

test('referenced portraits must exist locally and cannot escape public assets', (t) => {
  const { publicDir } = fixture(t);
  for (const src of ['/portraits/missing.png', 'https://example.com/a.png', '/../a.png'])
    assert.throws(() => createBundledAssetManifest({ publicDir, portraits: { a: { src } } }));
  writeFileSync(path.join(publicDir, 'portraits/a.jpg'), '');
  assert.throws(() => createBundledAssetManifest({ publicDir, portraits: {} }), /empty/);
});

test('manifest removal or mutation cannot make the resource check pass', (t) => {
  const { webDir, options } = fixture(t);
  const manifest = path.join(webDir, BUNDLED_ASSET_MANIFEST);
  rmSync(manifest);
  assert.throws(() => verifyBundledAssetDirectory(webDir, options), /manifest is missing/);
  writeFileSync(manifest, JSON.stringify({ version: 1, assets: [] }));
  assert.throws(() => verifyBundledAssetDirectory(webDir, options), /latest source/);
});

test('compiled iOS app and distribution archive verify the actual packaged image bytes', (t) => {
  const { directory, webDir, options } = fixture(t);
  const app = path.join(directory, 'App.app');
  cpSync(webDir, path.join(app, 'public'), { recursive: true });
  assert.equal(verifyBundledArtifact(app, options).portraitCount, 2);
  const archive = path.join(directory, 'App.xcarchive');
  cpSync(app, path.join(archive, 'Products/Applications/App.app'), { recursive: true });
  assert.equal(verifyBundledArtifact(archive, options).imageCount, 3);
  rmSync(path.join(app, 'public/portraits/b.webp'));
  assert.throws(() => verifyBundledArtifact(app, options), /image is missing/);
});

for (const [extension, prefix] of [
  ['apk', 'assets/public'],
  ['aab', 'base/assets/public'],
]) {
  test(`compiled Android ${extension.toUpperCase()} verifies images inside the ZIP payload`, (t) => {
    const { directory, webDir, options } = fixture(t);
    const payload = path.join(directory, extension);
    cpSync(webDir, path.join(payload, prefix), { recursive: true });
    const artifact = path.join(directory, `app.${extension}`);
    const zip = spawnSync('zip', ['-qr', artifact, '.'], { cwd: payload });
    assert.equal(zip.status, 0, zip.stderr.toString());
    assert.equal(verifyBundledArtifact(artifact, options).portraitCount, 2);
    writeFileSync(path.join(payload, prefix, 'portraits/a.jpg'), 'broken packaged bytes');
    const changed = spawnSync('zip', ['-qr', artifact, '.'], { cwd: payload });
    assert.equal(changed.status, 0, changed.stderr.toString());
    assert.throws(() => verifyBundledArtifact(artifact, options), /differs from source/);
  });
}
