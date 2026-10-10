import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.artifacts/native-tools');
const platform = process.argv[2] ?? 'all';
if (!['all', 'ios', 'android'].includes(platform)) throw Error('Use ios, android or all');
const versions = { appium: '3.8.0', xcuitest: '12.16.0', uiautomator2: '8.7.0' };
mkdirSync(directory, { recursive: true });
function run(binary, args, env = process.env) {
  const result = spawnSync(binary, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw result.error ?? Error(`${binary} failed (${result.status})`);
}
const appium = path.join(directory, 'node_modules/appium/build/lib/main.js');
const packagePath = path.join(directory, 'node_modules/appium/package.json');
if (
  !existsSync(packagePath) ||
  JSON.parse(readFileSync(packagePath, 'utf8')).version !== versions.appium
)
  run('npm', [
    'install',
    '--prefix',
    directory,
    '--no-audit',
    '--no-fund',
    `appium@${versions.appium}`,
  ]);
const env = { ...process.env, APPIUM_HOME: path.join(directory, 'appium-home') };
for (const driver of ['xcuitest', 'uiautomator2']) {
  if (platform === 'ios' && driver !== 'xcuitest') continue;
  if (platform === 'android' && driver !== 'uiautomator2') continue;
  const installed = path.join(env.APPIUM_HOME, `node_modules/appium-${driver}-driver/package.json`);
  if (
    existsSync(installed) &&
    JSON.parse(readFileSync(installed, 'utf8')).version === versions[driver]
  )
    continue;
  if (existsSync(installed)) run(process.execPath, [appium, 'driver', 'uninstall', driver], env);
  run(
    process.execPath,
    [appium, 'driver', 'install', '--source=npm', `appium-${driver}-driver@${versions[driver]}`],
    env,
  );
}
console.log(
  `Native E2E tools ready: Appium ${versions.appium}; XCUITest ${versions.xcuitest}; UiAutomator2 ${versions.uiautomator2}`,
);
