import { preparePlatform } from './platform/native.js';
import { prepareOrientation } from './platform/orientation.js';

await preparePlatform();
const { prepareLocale } = await import('./i18n/index.js');
await prepareLocale();
prepareOrientation(window, document);
await import('./ui/table-controller.js');
const { prepareDropdowns } = await import('./ui/dropdowns.js');
prepareDropdowns();
const { prepareNameTooltips } = await import('./ui/name-tooltip.js');
prepareNameTooltips();
// Keep the first hand measurable while hidden, then publish it atomically.
document.documentElement.dataset.appReady = 'true';
document.body.inert = false;
