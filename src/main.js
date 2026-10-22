const styles = import('./styles/app.js');
const { preparePlatform } = await import('./platform/native.js');
await preparePlatform();
const { prepareLocale } = await import('./i18n/index.js');
await prepareLocale();
await styles;
const { prepareOrientation } = await import('./platform/orientation.js');
prepareOrientation(window, document);
const { recordSnapshots } = await import('./platform/record-snapshots.js');
await recordSnapshots.prepare();
await import('./ui/table-controller.js');
const { prepareDropdowns } = await import('./ui/dropdowns.js');
prepareDropdowns();
const { prepareNameTooltips } = await import('./ui/name-tooltip.js');
prepareNameTooltips();
// The controller has prepared the hand and scheduled its pre-paint fitting.
// Readiness must also complete while the page's animation clock is paused.
document.documentElement.dataset.appReady = 'true';
document.body.inert = false;
