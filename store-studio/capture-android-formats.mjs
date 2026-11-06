import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd(),
  sdk = "/Users/zjz/Library/Android/sdk",
  adb = path.join(sdk, "platform-tools/adb"),
  serial = "emulator-5584",
  avd = "Noir_Store_Media_API35_PR70";
const logDir = path.join(root, ".artifacts/store-media-v6/qa");
fs.mkdirSync(logDir, { recursive: true });
const run = (args, timeout = 120000) => {
  const r = spawnSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout,
  });
  if (r.status !== 0) throw Error(r.stderr || r.error);
  return r.stdout.trim();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let emulator,
  completedSinceBoot = 0;
const online = () => {
  try {
    return run(["shell", "getprop", "sys.boot_completed"], 8000) === "1";
  } catch {
    return false;
  }
};
async function stop() {
  try {
    run(["emu", "kill"], 10000);
  } catch {}
  if (emulator) {
    for (let i = 0; i < 20 && emulator.exitCode === null; i++) await sleep(250);
    if (emulator.exitCode === null) emulator.kill("SIGTERM");
    emulator = undefined;
  }
  completedSinceBoot = 0;
}
async function boot() {
  if (online() && completedSinceBoot < 5) return;
  await stop();
  const log = fs.openSync(path.join(logDir, "android-lifecycle.log"), "a");
  emulator = spawn(
    path.join(sdk, "emulator/emulator"),
    [
      "-avd",
      avd,
      "-port",
      "5584",
      "-no-window",
      "-no-snapshot-load",
      "-no-snapshot-save",
      "-gpu",
      "swiftshader",
      "-feature",
      "-Vulkan",
      "-memory",
      "2048",
      "-cores",
      "2",
    ],
    { stdio: ["ignore", log, log] },
  );
  fs.closeSync(log);
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    if (online()) return;
    await sleep(1000);
  }
  throw Error("Dedicated Android capture device failed to boot");
}
try {
  for (const [name, size, density] of [
    ["phone", "1080x2400", "420"],
    ["tablet7", "1280x800", "213"],
    ["tablet10", "1920x1200", "240"],
  ]) {
    for (const locale of (
      process.env.NOIR_STORE_LOCALES || "zh-CN,en,zh-TW,ja,ko,es,it,pt,de,fr,ru"
    ).split(",")) {
      const out = path.join(
        root,
        ".artifacts/store-media-v6/raw/android-" + name,
        locale,
      );
      fs.mkdirSync(out, { recursive: true });
      const report = path.join(out, "report.json");
      if (
        fs.existsSync(report) &&
        JSON.parse(fs.readFileSync(report)).status === "captured"
      )
        continue;
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        await boot();
        run(["shell", "wm", "size", size]);
        run(["shell", "wm", "density", density]);
        console.log(
          "Capturing Android " +
            name +
            " " +
            locale +
            " attempt " +
            attempt +
            " " +
            size +
            " " +
            density,
        );
        const result = spawnSync(
          process.execPath,
          ["store-studio/capture-android-cdp.mjs", serial, out],
          {
            stdio: "inherit",
            timeout: 540000,
            env: {
              ...process.env,
              ANDROID_HOME: sdk,
              NOIR_STORE_MODE: "stills-locales",
              NOIR_STORE_STILLS_ONLY: "1",
              NOIR_STORE_LOCALES: locale,
            },
          },
        );
        ok =
          result.status === 0 &&
          fs.existsSync(report) &&
          JSON.parse(fs.readFileSync(report)).status === "captured";
        if (ok) completedSinceBoot++;
        else {
          if (fs.existsSync(report))
            fs.copyFileSync(
              report,
              path.join(
                logDir,
                "failed-first-pass",
                name + "-" + locale + "-" + attempt + ".json",
              ),
            );
          await stop();
        }
      }
      if (!ok)
        throw Error(
          "Native capture failed after dedicated-device recovery: " +
            name +
            " " +
            locale,
        );
    }
  }
} finally {
  try {
    run(["shell", "wm", "size", "reset"], 10000);
    run(["shell", "wm", "density", "reset"], 10000);
  } catch {}
  await stop();
}
