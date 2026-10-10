import { readFileSync } from 'node:fs';
import { mobileMetadata } from './mobile-lib.mjs';
const config = JSON.parse(readFileSync(new URL('../mobile/store-readiness.json', import.meta.url)));
const issues = [];
const check = (condition, message) => {
  if (!condition) issues.push(message);
};
mobileMetadata();
const listings = JSON.parse(
  readFileSync(new URL('../mobile/store-listings.json', import.meta.url)),
);
for (const locale of config.locales) {
  const entry = listings[locale];
  for (const [key, limit] of Object.entries({
    name: 30,
    subtitle: 30,
    shortDescription: 80,
    description: 4000,
  })) {
    check(
      typeof entry?.[key] === 'string' &&
        entry[key].trim().length > 0 &&
        [...entry[key]].length <= limit,
      `${locale}.${key} 缺失或超过 ${limit} 字符`,
    );
  }
}
check(Boolean(config.publisher?.trim()), '缺少正式发行者名称');
check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail), '缺少有效公开支持邮箱');
for (const name of ['privacyPolicyUrl', 'supportUrl']) {
  let valid = false;
  try {
    const url = new URL(config[name]);
    valid = url.protocol === 'https:' && !url.username && !url.password;
  } catch {}
  check(valid, `${name} 需要长期有效的公开 HTTPS URL（仍需人工验证可访问）`);
}
for (const [name, label] of Object.entries({
  linguisticReviewApproved: '11 种语言的扑克术语与完整文案审校',
  rightsReviewApproved: '人物、素材及宣传权利核实',
  regionalDistributionApproved: '拟发行地区准入与评级',
  signedDeviceTestingApproved: 'TestFlight / Play 签名包真机验收',
}))
  check(config[name] === true, `尚未确认：${label}`);
check(config.businessModel === 'paid-upfront', '商业模式需要重新审查');
if (issues.length) {
  console.error('发行准备未完成：\n' + issues.map((v) => `- ${v}`).join('\n'));
  process.exitCode = 1;
} else console.log('本地发行资料预检通过；商店后台、签名、协议及地区审核仍须确认。');
