# PR #70 商店介绍素材

本次为英文、简体中文准备商店视频、截图和可粘贴文案。依据 PR #70 的 `38337032eacf30eae24fdeb00da07451b1e7a099`；这个提交包含新手引导、复盘、胜率计算器、递增盲注和决赛桌等当前功能。素材制作工程位于 `store-studio/`，与应用运行依赖分开。

## 应用信息的填写位置

| 后台字段               | 交付文件                                               | 说明                                                                  |
| ---------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Apple 名称、副标题     | `copy/apple-name.txt`、`apple-subtitle.txt`            | 30 字符以内                                                           |
| Apple 宣传文本         | `copy/apple-promotionalText.txt`                       | 170 字符以内                                                          |
| Apple 描述、关键词     | `copy/apple-description.txt`、`apple-keywords.txt`     | 分别 4,000 字符 / 100 字节以内                                        |
| Google 名称、简短描述  | `copy/google-name.txt`、`google-short-description.txt` | 分别 30 / 80 字符以内                                                 |
| Google 完整描述        | `copy/google-full-description.txt`                     | 与本语言长描述一致                                                    |
| 审核说明               | `copy/review-notes.txt`                                | 无需账号，说明离线与虚拟筹码边界                                      |
| Apple App Preview      | `apple/preview-narrated.mp4` 或 `preview-music.mp4`    | 每语言选一版上传；29 秒、886 × 1920、H.264、30 fps、AAC 立体声        |
| Apple 视频封面         | 对应 `*-poster.png`                                    | 从视频第 5 秒提取，后台也可再选择                                     |
| iPhone 截图            | `apple/iphone-medium/` 与 `iphone-large/`              | 1206 × 2622、1290 × 2796；按 01–06 顺序                               |
| iPad 截图              | `apple/ipad-13/`                                       | 2752 × 2064；界面来自 iPad 原生安装包                                 |
| Google 手机截图        | `google/phone/`                                        | 1080 × 1920，RGB PNG                                                  |
| Google Feature Graphic | `google/feature-graphic.png`                           | 1024 × 500，无透明通道                                                |
| Google 预览视频        | `google/preview-narrated.mp4` 或音乐版                 | 上传到你自己的 YouTube 后填写该视频 URL；交付包本身不产生 YouTube URL |
| 图标                   | `icons/apple-1024.png`、`google-512.png`               | 沿用应用原有品牌图标                                                  |

交付目录按 `en/` 和 `zh-CN/` 区分。Apple 本地化标识为 `en-US` / `zh-Hans`，Google 可选择对应英文与简体中文条目。`listings.json` 同时保留结构化字段和字符校验来源。

## 素材表达

视频以真实界面串联“入座练习 → 互动引导 → 决策复盘 → 重打原牌 → 胜率计算”。所有实际金额、底牌、公共牌与概率来自所录界面，没有重绘或伪造 UI。剪辑可以截取片段、加入淡化转场和字幕，必要时延长最后一帧；不改变牌局状态或宣称连续镜头是同一手牌。

复盘介绍只宣称利用行动前可见信息、假设范围、启发式与模拟估算，不宣传精确 GTO、保证获利或真人职业牌手复刻。计算器说明区分枚举与抽样。虚拟筹码无现金价值、不能购买或兑换、没有奖金或真钱下注，这些边界保留在介绍中。买断制与当前 `mobile/release.json` 一致。

## 上架仍需实际填写的内容

`mobile/store-readiness.json` 的公开隐私政策 URL 当前为空。正式填写时需提供长期可访问的政策页面；支持邮箱与支持链接沿用仓库已配置的信息。Google 视频 URL 需在自己的 YouTube 账号上传后取得。应用定价、销售地区、隐私/数据安全与模拟扑克内容评级问卷，均需按最终发行包和各后台实际问题填写；本次没有代填或提交这些后台内容。

原生截图和录屏来自 Simulator / Emulator，不是签名实体设备验证。最终上架前还要核对正式签名包与素材界面一致，并完成项目既有的真机验收。`verification.json` 的技术校验不表示商店审核通过。

## 官方规范与制作流程

规范核对日期：2026-11-06。上传时仍以后台实际设备槽位和校验为准。

- [Apple App Preview 技术规格](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/)
- [Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Apple 元数据字段规格](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [Apple 预览制作建议](https://developer.apple.com/app-store/app-previews/)
- [Google Play 预览资产要求](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Remotion 官方 Agent Skills](https://www.remotion.dev/docs/ai/skills)

重做、预览、原生采集和导出命令见 [素材工程 README](../store-studio/README.md)。不修改生成的 `dist/`、微信产物或原生 Web 副本，不包含签名材料和发布凭据。
