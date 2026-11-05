import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Reuse the project's installed-app startup, native touches, build fingerprint
// checks and cleanup. The generated adapter stays outside the source digest.
const studio = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(studio);
const [platform, ...args] = process.argv.slice(2);
if (!["ios", "android"].includes(platform)) throw Error("Use ios or android");
const option = (key) => args[args.indexOf(key) + 1];
if (!args.includes("--udid") || !args.includes("--output"))
  throw Error("A dedicated --udid and --output are required");
const output = path.resolve(option("--output"));
mkdirSync(output, { recursive: true });
if (platform === "android") {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk ? path.join(sdk, "platform-tools/adb") : "adb";
  const adbPort = args.includes("--adb-port")
    ? ["-P", option("--adb-port")]
    : [];
  const connected = spawnSync(
    adb,
    [...adbPort, "-s", option("--udid"), "wait-for-device"],
    {
      encoding: "utf8",
      timeout: 120000,
    },
  );
  if (connected.status !== 0)
    throw Error(
      "The selected Android capture device did not become online: " +
        (connected.stderr || connected.error),
    );
}
let runner = readFileSync(path.join(root, "scripts/native-e2e.mjs"), "utf8");
runner = runner.replace(
  "from '../tests/native/scenarios.mjs'",
  `from ${JSON.stringify(pathToFileURL(path.join(studio, process.env.NOIR_STORE_MODE === "repair" ? "capture-repair.mjs" : "capture-scenarios.mjs")).href)}`,
);
runner = runner.replaceAll(
  /from '(\.\.?\/[^']+)'/g,
  (_, value) =>
    `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", value)).href)}`,
);
runner = runner.replace(
  "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
  `const root = ${JSON.stringify(root)};`,
);
if (process.env.NOIR_STORE_RESUME === "1")
  runner = runner
    .replace(
      "if (platform === 'ios') {\n    // Remove only this app's data",
      "if (platform === 'ios' && false) {\n    // Resume the already installed, dedicated capture app. Remove only this app's data",
    )
    .replace(
      "run('xcrun', ['simctl', 'install', udid, appPath], { timeout: 600000 });",
      "spawnSync('xcrun', ['simctl', 'terminate', udid, appId], { encoding: 'utf8' });",
    );
const adapter = path.join(
  root,
  ".artifacts",
  `store-media-runner-${platform}.mjs`,
);
mkdirSync(path.dirname(adapter), { recursive: true });
writeFileSync(adapter, runner);
const result = spawnSync(process.execPath, [adapter, platform, ...args], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NOIR_STORE_OUTPUT: output,
    NOIR_STORE_DEVICE: option("--udid"),
  },
});
process.exitCode = result.status ?? 1;
