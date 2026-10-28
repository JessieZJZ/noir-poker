// Phones keep portrait pages. Full-screen dimensions identify tablets even
// while their current window is narrow (split screen) or the keyboard is open.
// iPad also uses app.json's resizable flag, which applies to every page.
function pageOrientation(api, info, app) {
  if (app.noirPageOrientation) return app.noirPageOrientation;
  let device;
  try {
    device = api.getDeviceInfo?.();
  } catch {}
  const shortestScreen = Math.min(Number(info.screenWidth), Number(info.screenHeight));
  const shortestWindow = Math.min(Number(info.windowWidth), Number(info.windowHeight));
  const tablet =
    /ipad|tablet/i.test(device?.model || '') ||
    (shortestScreen > 0 ? shortestScreen >= 600 : shortestWindow >= 600);
  const orientation = tablet ? 'auto' : 'portrait';
  // Cache a hardware-based classification, not a temporary viewport fallback.
  if (shortestScreen > 0 || device?.model) app.noirPageOrientation = orientation;
  return orientation;
}
module.exports = { pageOrientation };
