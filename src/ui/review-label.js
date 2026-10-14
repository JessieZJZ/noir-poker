import { getLocale, localizeText } from '../i18n/index.js';

// Keep the original identity available to localization; change only its review display.
export function reviewPlayerLabel(value) {
  const separator = ['zh-CN', 'zh-TW'].includes(getLocale()) ? '，' : ', ';
  return localizeText(value).replace(/\s*·\s*/g, separator);
}
