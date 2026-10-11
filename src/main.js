import { preparePlatform } from './platform/native.js';

await preparePlatform();
const { prepareLocale } = await import('./i18n/index.js');
await prepareLocale();
await import('./ui/table-controller.js');
// Keep the first hand measurable while hidden, then publish it atomically.
document.documentElement.dataset.appReady = 'true';
document.body.inert = false;
