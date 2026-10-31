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
function windowInfo(api, event, app) {
  const info = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
  const size = event?.detail?.size || event?.size;
  // Some runtimes update the rendered page before their synchronous window
  // API. The page-meta resize event carries the actual viewport. Retain it
  // across route changes so returning to the table cannot restore stale size.
  if (size?.windowWidth > 0 && size?.windowHeight > 0)
    app.noirWindowSize = { windowWidth: size.windowWidth, windowHeight: size.windowHeight };
  return { ...info, ...app.noirWindowSize };
}
function stopWindowWatch(page) {
  page._viewportEpoch = (page._viewportEpoch || 0) + 1;
  page._viewportObserver?.disconnect();
  page._viewportObserver = null;
}
function watchWindow(page) {
  stopWindowWatch(page);
  const epoch = page._viewportEpoch;
  const query = page.createSelectorQuery?.();
  if (!query?.selectViewport) return;
  query
    .selectViewport()
    .boundingClientRect((rect) => {
      if (page._viewportEpoch !== epoch || !(rect?.width > 0 && rect?.height > 0)) return;
      page.onResize({ detail: { size: { windowWidth: rect.width, windowHeight: rect.height } } });
      // DevTools can rotate the view without updating the service-side window
      // API or emitting Page.onResize. Watch the rendered width as well. Its
      // initial matching result is ignored; a width change remeasures once.
      if (page.createMediaQueryObserver) {
        const observer = page.createMediaQueryObserver();
        page._viewportObserver = observer;
        observer.observe(
          { minWidth: Math.floor(rect.width), maxWidth: Math.ceil(rect.width) },
          (result) => {
            if (page._viewportEpoch === epoch && !result.matches) watchWindow(page);
          },
        );
      }
    })
    .exec();
}
module.exports = { pageOrientation, windowInfo, watchWindow, stopWindowWatch };
