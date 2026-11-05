import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _android as android } from "@playwright/test";
import { sourceDigest } from "../scripts/mobile-lib.mjs";
import { verifyBundledArtifact } from "../scripts/bundled-assets.mjs";
import { captureOSPhoto } from "./native-photo.mjs";

const studio = path.dirname(fileURLToPath(import.meta.url)),
  root = path.dirname(studio);
const [serial, folder] = process.argv.slice(2);
if (!serial?.startsWith("emulator-") || !folder)
  throw Error("Use a dedicated emulator serial and output folder");
const output = path.resolve(folder);
mkdirSync(output, { recursive: true });
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, "platform-tools/adb") : "adb";
const appId = "io.github.jessiezjz.noirpoker";
const apk = path.join(root, ".artifacts/mobile/noir-poker-debug.apk");
const run = (bin, args, { buffer = false, timeout = 30000 } = {}) => {
  const r = spawnSync(bin, args, {
    encoding: buffer ? undefined : "utf8",
    timeout,
    maxBuffer: 24 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error(`${bin}: ${r.stderr?.toString() || r.error}`);
  return buffer ? r.stdout : r.stdout.trim();
};
const device = (...args) => run(adb, ["-s", serial, ...args]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, timeout = 30000, message = "Condition timed out") {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    try {
      const v = await read();
      if (v) return v;
    } catch (e) {
      error = e;
    }
    await sleep(200);
  }
  throw Error(message + (error ? `: ${error.message}` : ""));
}
process.env.NOIR_STORE_OUTPUT = output;
process.env.NOIR_STORE_DEVICE = serial;
const report = {
  platform: "android",
  serial,
  startedAt: new Date().toISOString(),
  status: "running",
  automation:
    "Installed Android APK; Playwright AndroidWebView controls; native OS screenshots and screenrecord",
  physicalDevice: false,
  fullNativeE2E: false,
  systemDialogCheck:
    "Manual review of original OS captures; no AX dumps while filming",
  scenarios: [],
};
let nativeDevice;
try {
  report.bundledAssets = verifyBundledArtifact(apk);
  report.apkSha256 = createHash("sha256")
    .update(readFileSync(apk))
    .digest("hex");
  report.build = JSON.parse(
    run("unzip", ["-p", apk, "assets/public/build-info.json"]),
  );
  assert.equal(
    report.build.sourceDigest,
    sourceDigest(),
    "APK must contain the current source",
  );
  run(adb, ["-s", serial, "wait-for-device"], { timeout: 120000 });
  assert.equal(device("shell", "getprop", "ro.kernel.qemu"), "1");
  await waitFor(
    () => device("shell", "getprop", "sys.boot_completed") === "1",
    120000,
    "Emulator must finish booting",
  );
  // Stop only this dedicated device's stale automation instrumentation.
  for (const pkg of [
    "io.appium.uiautomator2.server",
    "io.appium.uiautomator2.server.test",
  ])
    device("shell", "am", "force-stop", pkg);
  run(adb, ["-s", serial, "install", "-r", apk], { timeout: 120000 });
  device("shell", "am", "force-stop", appId);
  device("shell", "pm", "clear", appId);
  device("shell", "am", "start", "-n", `${appId}/.MainActivity`);
  const pid = await waitFor(
    () => device("shell", "pidof", appId),
    30000,
    "Installed app must start",
  );
  report.processId = pid;
  const devices = await android.devices({ omitDriverInstall: true });
  nativeDevice = devices.find((d) => d.serial() === serial);
  assert.ok(
    nativeDevice,
    "Only the selected dedicated emulator may be attached",
  );
  const webview = await nativeDevice.webView(
    { pkg: appId },
    { timeout: 45000 },
  );
  assert.equal(webview.pkg(), appId);
  const page = await webview.page();
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
    {},
    { timeout: 90000 },
  );
  report.native = await page.evaluate(() => ({
    platform: window.Capacitor.getPlatform(),
    native: window.Capacitor.isNativePlatform(),
    url: location.href,
    qa: Boolean(window.qa),
    width: innerWidth,
    height: innerHeight,
  }));
  assert.equal(report.native.platform, "android");
  assert.equal(report.native.native, true);
  assert.equal(report.native.qa, false);
  const liveBuild = await page.evaluate(
    async () => await (await fetch("/build-info.json")).json(),
  );
  assert.equal(liveBuild.sourceDigest, report.build.sourceDigest);
  const evaluate = (fn, ...args) =>
    page.evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const visible = (selector) => page.locator(selector).isVisible();
  const click = async (selector) => {
    const node = page.locator(selector);
    await node.waitFor({ state: "visible", timeout: 30000 });
    await node.scrollIntoViewIfNeeded();
    await waitFor(
      () => node.isEnabled(),
      30000,
      `Enabled UI control required: ${selector}`,
    );
    await node.click({ timeout: 30000 });
    await sleep(120);
  };
  const state = () => page.evaluate(() => window.noir.getState());
  const app = {
    platform: "android",
    evaluate,
    visible,
    click,
    nativeTap: click,
    state,
    waitFor,
    sleep,
    log: (message) => console.log(`[android-native-capture] ${message}`),
    screenshot: async (name) =>
      captureOSPhoto({ platform: "android", udid: serial, output, name }),
    select: async function (selector, value) {
      if (
        (await evaluate((s) => document.querySelector(s).value, selector)) ===
        value
      )
        return;
      await click(`${selector} + .dropdown-trigger`);
      await click(`.dropdown-option[data-value="${value}"]`);
      await waitFor(
        () =>
          evaluate(
            (s, v) => document.querySelector(s).value === v,
            selector,
            value,
          ),
        10000,
      );
    },
    waitHero: () =>
      waitFor(
        async () => {
          const s = await state();
          return s.phase !== "done" && s.legal.enabled;
        },
        90000,
        "A legal hero turn is required",
      ),
    record: (entry) => report.scenarios.push(entry),
  };
  const { nativeScenarios } = await import("./capture-scenarios.mjs");
  await nativeScenarios(app);
  report.status = "captured";
  report.coreFlowChecks = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.stack || String(error);
  console.error(report.error);
  process.exitCode = 1;
  try {
    captureOSPhoto({
      platform: "android",
      udid: serial,
      output,
      name: "failure",
    });
  } catch {}
} finally {
  if (nativeDevice) await nativeDevice.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Native Android capture ${report.status}: ${output}`);
}
