import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { root, readJson, mobileMetadata, directoryDigest, sourceDigest } from './mobile-lib.mjs';
import {
  writeBundledAssetManifest,
  verifyBundledAssetDirectory,
  verifyBundledArtifact,
} from './bundled-assets.mjs';

process.chdir(root);
const command = process.argv[2] ?? 'sync';
const platform = process.argv[3];
const platforms = platform ? [platform] : ['ios', 'android'];
if (platforms.some((p) => !['ios', 'android'].includes(p))) throw Error('Use ios or android');
const webDir = path.join(root, readJson('capacitor.config.json').webDir);
const output = path.join(root, '.artifacts/mobile');
const metadata = mobileMetadata();
const run = (binary, args, options = {}) => {
  const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${binary} failed (${result.status})`);
};
const cap = (...args) =>
  run(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), ...args]);
const destinations = {
  ios: path.join(root, 'ios/App/App/public'),
  android: path.join(root, 'android/app/src/main/assets/public'),
};

function lockBuild() {
  mkdirSync(output, { recursive: true });
  const lock = path.join(output, '.build-lock');
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8'));
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch {
      alive = false;
    }
    if (alive)
      throw Error('Another mobile build is preparing Web resources; retry after it completes');
    rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock);
  }
  writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
  const release = () => rmSync(lock, { recursive: true, force: true });
  process.once('exit', release);
  return release;
}

function buildWeb() {
  const fingerprint = sourceDigest();
  run(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    'build',
    '--mode',
    'native',
    '--outDir',
    path.relative(root, webDir),
  ]);
  if (sourceDigest() !== fingerprint)
    throw Error('Web source changed during the build. Retry after saving your edits');
  // Native builds retain the same local portraits and images as the shared Web app.
  writeBundledAssetManifest(webDir);
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  writeFileSync(
    path.join(webDir, 'build-info.json'),
    JSON.stringify(
      {
        ...metadata,
        sourceDigest: fingerprint,
        sourceCommit: git.status === 0 ? git.stdout.trim() : null,
        sourceDirty: Boolean(dirty.stdout?.trim()),
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  for (const file of readdirSync(path.join(webDir, 'assets'))) {
    if (
      file.endsWith('.css') &&
      /fonts\.(googleapis|gstatic)\.com/.test(
        readFileSync(path.join(webDir, 'assets', file), 'utf8'),
      )
    )
      throw Error('Native CSS must not request remote fonts');
  }
}

function verifyCopies(selected) {
  const info = JSON.parse(readFileSync(path.join(webDir, 'build-info.json'), 'utf8'));
  for (const key of ['appId', 'appName', 'version', 'buildNumber']) {
    if (info[key] !== metadata[key])
      throw Error(`Native ${key} changed since the last build. Run npm run mobile:sync`);
  }
  if (info.sourceDigest !== sourceDigest())
    throw Error('Web source changed since the last native build. Run npm run mobile:sync');
  const digest = directoryDigest(webDir);
  const images = verifyBundledAssetDirectory(webDir);
  for (const target of selected) {
    if (
      !existsSync(path.join(destinations[target], 'index.html')) ||
      directoryDigest(destinations[target]) !== digest
    )
      throw Error(`${target} assets are stale. Run npm run mobile:sync`);
    verifyBundledAssetDirectory(destinations[target]);
  }
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, 'sync-report.json'),
    JSON.stringify(
      {
        ...metadata,
        assetDigest: digest,
        ...images,
        platforms: selected,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `Verified latest bundled Web assets: ${selected.join(', ')} (${digest.slice(0, 12)})`,
  );
}

function updateVersions() {
  // Both native targets read the same package version and release build number.
  const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  let source = readFileSync(pbx, 'utf8');
  source = source
    .replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${metadata.buildNumber};`,
    )
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${metadata.version};`);
  if (!source.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${metadata.appId};`))
    throw Error('appId differs from the iOS project. Update native identifiers before publishing');
  writeFileSync(pbx, source);
  const gradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  if (!gradle.includes(`applicationId "${metadata.appId}"`))
    throw Error(
      'appId differs from the Android project. Update native identifiers before publishing',
    );
}

function checkTool(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  return result.status === 0
    ? (result.stdout + result.stderr).trim().split('\n').slice(0, 2).join(' ')
    : 'NOT AVAILABLE';
}

if (command === 'doctor') {
  console.log(
    JSON.stringify(
      {
        ...metadata,
        node: process.version,
        xcode: checkTool('xcodebuild', ['-version']),
        java: checkTool('java', ['-version']),
        androidSdk: process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? 'NOT CONFIGURED',
        note: 'iOS requires macOS + Xcode 26; Android requires JDK 21 + SDK 36',
      },
      null,
      2,
    ),
  );
} else if (command === 'verify') {
  verifyCopies(platforms);
} else if (command === 'web') {
  const release = lockBuild();
  try {
    buildWeb();
  } finally {
    release();
  }
} else if (command === 'copy' || command === 'sync') {
  if (
    command === 'copy' &&
    platform === 'ios' &&
    process.env.CURRENT_PROJECT_VERSION &&
    (Number(process.env.CURRENT_PROJECT_VERSION) !== metadata.buildNumber ||
      process.env.MARKETING_VERSION !== metadata.version)
  )
    throw Error(
      'Xcode version differs from mobile/release.json or package.json. Run npm run mobile:sync before building',
    );
  const release = lockBuild();
  try {
    run(process.execPath, [path.join(root, 'scripts/mobile-assets.mjs')]);
    buildWeb();
    if (command === 'sync') updateVersions();
    for (const target of platforms) cap(command, target);
    verifyCopies(platforms);
  } finally {
    release();
  }
} else if (['android', 'android-bundle', 'ios', 'ios-archive'].includes(command)) {
  const ios = command.startsWith('ios');
  if (
    command === 'android-bundle' &&
    [
      'NOIR_ANDROID_KEYSTORE',
      'NOIR_ANDROID_KEY_ALIAS',
      'NOIR_ANDROID_STORE_PASSWORD',
      'NOIR_ANDROID_KEY_PASSWORD',
    ].some((key) => !process.env[key])
  )
    throw Error(
      'Store AAB requires all four NOIR_ANDROID signing variables; use Gradle bundleRelease only for unsigned CI checks',
    );
  if (command === 'ios-archive' && !/^[A-Z0-9]{10}$/.test(process.env.NOIR_APPLE_TEAM_ID ?? ''))
    throw Error(
      'A signed iOS archive requires NOIR_APPLE_TEAM_ID and an installed signing certificate/profile',
    );
  // Entrypoints never consume a previous dist; sync the actual source first.
  run(process.execPath, [path.join(root, 'scripts/mobile.mjs'), 'sync', ios ? 'ios' : 'android']);
  const env = { ...process.env, NOIR_SKIP_WEB_PREPARE: '1' };
  if (ios) {
    if (process.platform !== 'darwin' || checkTool('xcodebuild', ['-version']) === 'NOT AVAILABLE')
      throw Error('Install full Xcode 26 and select it with xcode-select before building iOS');
    const args = ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App'];
    if (command === 'ios-archive')
      args.push(
        '-configuration',
        'Release',
        '-destination',
        'generic/platform=iOS',
        '-archivePath',
        '.artifacts/mobile/NOIR-Poker.xcarchive',
        `DEVELOPMENT_TEAM=${process.env.NOIR_APPLE_TEAM_ID}`,
        'CODE_SIGN_STYLE=Automatic',
        'archive',
      );
    else
      args.push(
        '-configuration',
        'Debug',
        '-sdk',
        'iphonesimulator',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        '.artifacts/mobile/ios',
        'CODE_SIGNING_ALLOWED=NO',
        'build',
      );
    run('xcodebuild', args, { env });
    const artifact = path.join(
      root,
      command === 'ios-archive'
        ? '.artifacts/mobile/NOIR-Poker.xcarchive'
        : '.artifacts/mobile/ios/Build/Products/Debug-iphonesimulator/App.app',
    );
    console.log(JSON.stringify(verifyBundledArtifact(artifact)));
  } else {
    run(
      process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
      [command === 'android' ? 'assembleDebug' : 'bundleRelease', '--no-daemon'],
      { cwd: path.join(root, 'android'), env },
    );
    const kind =
      command === 'android' ? 'apk/debug/app-debug.apk' : 'bundle/release/app-release.aab';
    const destination = path.join(
      output,
      command === 'android' ? 'noir-poker-debug.apk' : 'noir-poker-release.aab',
    );
    mkdirSync(output, { recursive: true });
    cpSync(path.join(root, 'android/app/build/outputs', kind), destination);
    console.log(JSON.stringify(verifyBundledArtifact(destination)));
    console.log(`Built ${destination}`);
  }
} else throw Error(`Unknown mobile command: ${command}`);
