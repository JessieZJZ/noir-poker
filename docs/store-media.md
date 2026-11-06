# PR #70 · 11 种语言上架资料

V6 为应用现有的 11 种语言分别准备视频、截图和可复制的商店字段：简体中文、英文、繁体中文、日语、韩语、西班牙语、意大利语、巴西葡萄牙语、德语、法语、俄语。制作代码位于 `store-studio/`，生成媒体不进入 Git；交付采用 11 个语言文件夹、11 个独立 ZIP 和一个总 ZIP，附离线预览页。

产品依据 PR #70 的 `94e56b1ef009f0729508491e5f2155fd37d2bf99`，本轮重新核对 PR 头未变化。实际安装 App 的源码摘要为 `392adab3981eccbe478c517af67ba17873a7f24c2ef2ba32262c7d2cdf0a2e81`。本轮没有修改产品源码、规则或 App 翻译词库。

## 表单字段与文件

以下路径均相对于各语言文件夹。

| 后台字段               | 文件                                                | 规格                                            |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Google 名称            | `google/text/name.txt`                              | 30 字符以内                                     |
| Google 简短说明        | `google/text/short-description.txt`                 | 80 字符以内                                     |
| Google 完整说明        | `google/text/full-description.txt`                  | 4,000 字符以内                                  |
| Google 图标            | `google/icon-512.png`                               | 512 × 512，1 MiB 以内                           |
| Google 置顶大图        | `google/feature-graphic.png`                        | 1024 × 500，RGB PNG                             |
| Google 手机            | `google/phone/01.png` 至 `08.png`                   | 1080 × 1920                                     |
| Google 7 / 10 英寸平板 | `google/tablet-7/`、`google/tablet-10/`             | 各 8 张，1920 × 1080                            |
| Google 桌面资源        | `google/desktop/`                                   | 8 张，1920 × 1080；实际生产 Web 界面            |
| Apple 名称、副标题     | `apple/text/name.txt`、`subtitle.txt`               | 各 30 字符以内                                  |
| Apple 宣传文本         | `apple/text/promotional-text.txt`                   | 170 字符以内                                    |
| Apple 描述、关键词     | `apple/text/description.txt`、`keywords.txt`        | 4,000 字符 / 保守 100 UTF-8 字节以内            |
| Apple 审核说明         | `apple/text/review-notes.txt`                       | 无需账号、离线、虚拟筹码及操作路径              |
| Apple 图标             | `apple/icon-1024.png`                               | 1024 × 1024，RGB PNG                            |
| iPhone 截图            | `apple/iphone-large/`、`iphone-medium/`             | 各 8 张，1290 × 2796 / 1206 × 2622              |
| iPad 截图              | `apple/ipad-13/`                                    | 8 张，2752 × 2064                               |
| 两家共用视频           | `video/shared-preview.mp4`                          | 29.8 秒，1920 × 886，30 fps，H.264 / AAC 双声道 |
| 高清母版               | `video/master-3840.mp4`                             | 同一内容，3840 × 1772，供查看或编辑             |
| 字幕、旁白、封面       | `video/captions.srt`、`narration.txt`、`poster.png` | 对应本语言，成片已有画内字幕                    |
| YouTube 缩略图         | `video/youtube-thumbnail-1280x720.png`              | 1280 × 720                                      |

每语言共有 56 张上传截图、1 张置顶大图、2 个图标。11 种语言合计 616 张上传截图、11 张置顶大图、22 个图标和 22 个视频文件。标准片与母版是同一支视频的两个尺寸，没有制作竖屏版。

`field-validation.json` 记录字段长度，`technical-verification.json` 记录本语言技术规格。`captions-and-screenshots.csv` 汇总八张截图的标题与说明；`README-填写指南.md` 给出实际填写位置。总目录的 `打开预览.html` 可直接查看各语言成片、截图概览与可复制文案。

## 语言与表达

| 文件夹  | Apple     | Google Play | 地区         |
| ------- | --------- | ----------- | ------------ |
| `zh-CN` | `zh-Hans` | `zh-CN`     | 简体中文     |
| `en`    | `en-US`   | `en-US`     | 美国英语     |
| `zh-TW` | `zh-Hant` | `zh-TW`     | 台湾繁体中文 |
| `ja`    | `ja`      | `ja-JP`     | 日本         |
| `ko`    | `ko`      | `ko-KR`     | 韩国         |
| `es`    | `es-ES`   | `es-ES`     | 西班牙       |
| `it`    | `it`      | `it-IT`     | 意大利       |
| `pt`    | `pt-BR`   | `pt-BR`     | 巴西         |
| `de`    | `de-DE`   | `de-DE`     | 德国         |
| `fr`    | `fr-FR`   | `fr-FR`     | 法国         |
| `ru`    | `ru`      | `ru-RU`     | 俄语         |

新增宣传标题、长短描述、字幕、旁白分别按语言改写，使用当地扑克用语；不是逐句照搬中文。`locales/editorial.json` 记录术语和 AI 审校边界。没有宣称第三方母语人员完成了人工认证。原有 App 界面仍忠实来自实际版本；已观察到的生硬词句见 `locales/known-app-copy-issues.md`，没有在图片上重绘或掩盖。今后产品词库变化需要重建、补录对应画面。

## 视频与画面来源

保持用户已确认的 V5 排版：左侧标题、简短介绍和字幕，右侧一台完整 iPhone。取消局部放大和重复画面，录屏按原比例显示。中英文直接保留已确认的 V5 成片和音轨；新增九种语言使用本语言的实际原生录屏、女声与字幕，音乐增益沿用 0.30。

六镜依次为互动教学、实战与本手动态、从牌局页点开复盘、重打原牌并改变行动、对局记录进入详情、胜率与 Outs。小手点按根据真实按钮位置与实际页面变化校准。重打核对原始底牌、目标街、具体建议和实际执行行动；不拿无关手牌或不同决策冒充更正。末镜使用真实的翻牌计算画面，56.06% 胜率、16 Outs；不混入下一街的结果。

新增语言采用 2 倍密度 Remotion 图形层、无损 FFV1 手机层和无损 RGB 场景中间片；标准片与母版从同一无损内容各做一次最终编码。保留实际画面文字、牌面和概率，不通过生成式放大重画界面。

手机、两档 Android 平板、iPad 使用实际安装 App。Android 平板按两套窗口尺寸和密度分别采集，未把手机图片拉伸成平板。桌面图来自生产 Web 页面，未验证 Google Play Games on PC 原生发行版本；仅在最终桌面发行体验一致时用于该资源栏。

标准片采用 Apple 所列的 1920 × 886 横屏技术规格，不代表 iPhone App 支持横屏操作，也不代表商店审核已经通过。Apple 上传 MP4，Google Play 视频栏需先上传至自己的 YouTube，再填写公开或不公开的视频链接。本次没有上传或发布。

## 验证与重做

制作、采集、导出、逐项验证和归档命令见 [素材工程 README](../store-studio/README.md)；实际证据范围见 [验收记录](../store-studio/VALIDATION.md)。技术检查包括字段长度、图片尺寸与通道、文件大小、视频编码、帧数、音轨、完整解码和文件哈希，另做画面审阅及归档 CRC 校验。

原生模拟器采集、原生编译、产品 E2E、商店审核是不同范围。本轮复用已编译的 PR70 安装包并验证其资源摘要，执行实际原生素材采集；不将采集脚本记为完整 App E2E。公开隐私政策、支持网址、YouTube URL、价格、地区和隐私/评级问卷仍需按最终发行包填写。本包不包含发布凭据或签名材料。

## 官方规格

本轮核对日期：2026-11-07；上传以后台实际设备槽位和校验为准。

- [Apple App Preview 技术规格](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/)
- [Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple 元数据字段](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [Google Play 预览资源要求](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Remotion 官方 Agent Skills](https://www.remotion.dev/docs/ai/skills)
