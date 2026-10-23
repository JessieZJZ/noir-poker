import { createStartupState } from './platform/startup-state.js';

const startup = createStartupState();
globalThis.__noirStartup = startup.state;
try {
  startup.stage('platform-import');
  const styles = import('./styles/app.js');
  const { preparePlatform } = await import('./platform/native.js');
  startup.stage('platform-prepare');
  await preparePlatform();
  startup.stage('locale-import');
  const { prepareLocale } = await import('./i18n/index.js');
  startup.stage('locale-prepare');
  await prepareLocale();
  startup.stage('styles');
  await styles;
  startup.stage('orientation');
  const { prepareOrientation } = await import('./platform/orientation.js');
  prepareOrientation(window, document);
  startup.stage('records');
  const { recordSnapshots } = await import('./platform/record-snapshots.js');
  await recordSnapshots.prepare();
  startup.stage('table');
  await import('./ui/table-controller.js');
  startup.stage('controls');
  const { prepareDropdowns } = await import('./ui/dropdowns.js');
  prepareDropdowns();
  const { prepareNameTooltips } = await import('./ui/name-tooltip.js');
  prepareNameTooltips();
  // The controller has prepared the waiting table and its pre-paint fitting.
  // Readiness must also complete while the page's animation clock is paused.
  document.documentElement.dataset.appReady = 'true';
  document.body.inert = false;
  startup.stage('ready');

  document.dispatchEvent(new Event('noir:ready'));
} catch (error) {
  startup.fail(error);
  throw error;
}
