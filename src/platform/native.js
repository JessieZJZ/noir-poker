import { localizeText, localizeHTML } from '../i18n/index.js';
import { Capacitor } from '@capacitor/core';
import { preferenceStorage } from './storage.js';
let appActive = true;
export const isAppActive = () => appActive;

export function handleAndroidBack(document, app) {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  if (dialogs.some((dialog) => dialog.id === 'orientation-dialog')) return;
  if (dialogs.length) dialogs.at(-1).close();
  else return app.minimizeApp();
}

export async function preparePlatform() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');
  const [{ App }, { Preferences }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/preferences'),
  ]);
  try {
    await preferenceStorage.connect(Preferences);
  } catch {
    // Keep device-local WebView storage available when native storage fails.
  }
  await App.addListener('appStateChange', ({ isActive }) => {
    appActive = isActive;
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: isActive } }));
    if (!isActive) void preferenceStorage.flush();
  });
  try {
    appActive = (await App.getState()).isActive;
  } catch {}
  if (Capacitor.getPlatform() === 'android')
    await App.addListener('backButton', () => {
      void Promise.resolve(handleAndroidBack(document, App)).catch(() => {});
    });
  try {
    installNativeAbout(await App.getInfo());
  } catch {
    installNativeAbout({ version: '开发版', build: '未知' });
  }
}

function installNativeAbout(info) {
  const button = document.createElement('button');
  button.textContent = localizeText('关于与隐私');
  button.id = 'native-about-button';
  const dialog = document.createElement('dialog');
  dialog.id = 'native-about-dialog';
  const close = document.createElement('button');
  close.className = 'close-dialog';
  close.setAttribute('aria-label', localizeText('关闭关于与隐私'));
  close.textContent = localizeText('×');
  close.onclick = () => dialog.close();
  const heading = document.createElement('h2');
  heading.textContent = localizeText(`NOIR Poker ${info.version} (${info.build})`);
  dialog.append(close, heading);
  for (const text of [
    '本地德州扑克练习。所有筹码均为虚拟筹码，无现金兑换、奖金或真人赌注。',
    '牌局和复盘在设备上计算；本应用没有账号、广告、追踪或分析服务。',
    '人数、难度、对手风格、声音和提示设置仅保存在此设备，不上传到本应用服务器；当前牌局只保留在运行内存中。',
    '仅当你主动打开资料来源或帮助链接时，系统浏览器会访问对应网站，第三方按其自身隐私政策处理该次访问。',
  ]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = localizeText(text);
    dialog.append(paragraph);
  }
  const link = document.createElement('a');
  link.href = 'mailto:958182284@qq.com';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = localizeText('联系与支持');
  const publisher = document.createElement('p');
  publisher.textContent = localizeText('发行者：郑建宙 · 958182284@qq.com');
  const policy = document.createElement('a');
  policy.href = './app-privacy.html';
  policy.textContent = localizeText('隐私政策');
  dialog.append(publisher, policy, document.createElement('br'), link);
  document.body.append(dialog);
  document.querySelector('.table-footer').append(button);
  button.onclick = () => dialog.showModal();
}
