const styles = import('./styles/app.js');
const { preparePlatform } = await import('./platform/native.js');
await preparePlatform();
const { prepareLocale } = await import('./i18n/index.js');
await prepareLocale();
await styles;
const { prepareOrientation } = await import('./platform/orientation.js');
prepareOrientation(window, document);
await import('./ui/table-controller.js');
const { prepareDropdowns } = await import('./ui/dropdowns.js');
prepareDropdowns();
const { prepareNameTooltips } = await import('./ui/name-tooltip.js');
prepareNameTooltips();
// Allow scheduled table fitting to finish behind the startup artwork.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
document.documentElement.dataset.appReady = 'true';
document.body.inert = false;
