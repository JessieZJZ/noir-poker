# 买断制 App 发行准备

工程按“商店一次购买、完整使用”的付费 App 准备。商店负责购买、扣款和下载，应用内没有自建购买页，也没有订阅或内购解锁。价格、销售国家/地区、开发者主体及税务信息在两个商店后台配置；这些信息不写死在源码中。

## 打发行包

先确定包名、公开版本及递增构建号，运行测试和同步，见 [工程操作](mobile.md)。不要把密码、私钥或证书提交到 Git。

### Android

使用自己的 upload keystore，并保存可靠备份。采用 Play App Signing 时，upload key 与商店分发给用户的 app signing key 职责不同，参见 [Android 签名说明](https://developer.android.com/studio/publish/app-signing)。

发行命令需要四项签名设置。环境变量（如 CI Secrets）优先；本机未设置时，从仓库外的 `~/.config/noir-poker/release.env` 读取路径与别名，从 macOS 钥匙串读取密码：

```text
NOIR_ANDROID_KEYSTORE       keystore 的绝对路径（release.env，可写 ~/ 开头）
NOIR_ANDROID_KEY_ALIAS      别名（release.env）
NOIR_ANDROID_STORE_PASSWORD keystore 密码（钥匙串服务 noir-poker-android-store）
NOIR_ANDROID_KEY_PASSWORD   key 密码（钥匙串服务 noir-poker-android-key；未设置时使用 keystore 密码）
```

`release.env` 只接受上述路径、别名和 `NOIR_APPLE_TEAM_ID`，写入密码会报错。`NOIR_RELEASE_CONFIG` 可指向其他位置。在终端运行下面的命令，按提示输入两次 keystore 密码，密码不会出现在命令或文件里：

```sh
security add-generic-password -U -a noir-poker -s noir-poker-android-store -w
```

key 密码与 keystore 不同时，再以服务名 `noir-poker-android-key` 保存一次。然后构建：

```sh
npm run mobile:android:bundle
```

输出 `.artifacts/mobile/noir-poker-release.aab`。缺任一项配置，发行命令会失败；普通调试 APK 无需这些配置。上传前用 `jarsigner -verify -verbose -certs` 检查签名，核对包名、`versionName`、`versionCode`，再通过 Play 内部测试安装由商店生成的实际安装包。

### iOS

加入 Apple Developer Program，在 Xcode → Settings → Accounts 登录开发者账号。归档本身不签名；导出时 `-allowProvisioningUpdates` 让 Xcode 按账号创建或更新 Apple Distribution 证书与 App Store 描述文件，再签名。这样账号下不需要注册任何设备（自动签名直接归档会先要求开发描述文件，没有设备时失败）。私钥保存在登录钥匙串，不需要另设签名密码；导出 `.p12` 备份时才由钥匙串访问提示设置密码。

在 `~/.config/noir-poker/release.env` 写入 10 位 Team ID（developer.apple.com → Membership），也可用环境变量覆盖：

```sh
NOIR_APPLE_TEAM_ID=你的10位TeamID
```

```sh
npm run mobile:ios:archive   # 归档并导出已签名的 .artifacts/mobile/ios-export/App.ipa，不上传
npm run mobile:ios:upload    # 归档后导出 App Store Connect 包并上传
```

上传使用 Xcode 已登录的账号；处理完成后构建出现在 App Store Connect 的 TestFlight。构建号取自 `mobile/release.json`，每次上传前递增，导出时不由 Xcode 改写。同一构建号上传过后不能再次上传。`Info.plist` 声明 `ITSAppUsesNonExemptEncryption = NO`（离线、不联网，未自带加密算法），TestFlight 不再要求逐个构建填写出口合规；加入网络或加密库后需重新核对。也可以只运行 `mobile:ios:archive`，再用 Transporter 上传 `App.ipa`。脚本不创建商店条目、不填写税务协议、不提交审核。模拟器构建不包含发行签名，不能代替此流程。

## 付费与商店资料

- Apple 开发者主体需要完成 [Paid Apps Agreement、银行及税务资料](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/)，再设置价格和销售区域。
- Google Play 完成开发者及收款主体设置，按 [应用价格设置](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) 创建付费条目。免费转付费存在限制，正式应用应在发布前确定买断模式。
- 若将来增加数字功能解锁或订阅，需要另行接入对应商店的支付机制、购买恢复及权益验证，不能简单放一个网页收款按钮。

商店素材应说明“离线、单机、德州扑克训练、虚拟筹码”，提供实际手机/iPad截图、原创图标、支持联系渠道和隐私政策；不要承诺真人职业牌手的真实策略复刻，也不要将抽样复盘宣传为精确 GTO 或保证获利。

## 审核前要处理的内容

**风格展示。** 原生包与 Web 使用同一组以打法命名的训练风格与本地策略介绍。均衡保留文字头像，其余使用十六张原创成熟插画，不展示真人照片、姓名、履历或来源链接。图片生成记录见 [插画记录](character-artwork.md)，资源与最终安装包验证见 [移动端工程](mobile.md)。这次修改降低了既有人物素材带来的风险，不构成完整商业权利清查或上架批准。

**隐私。** 当前包无账号、广告、追踪、分析和联网复盘，设置留在设备，牌局留在进程内存。包内有“关于与隐私”，`public/app-privacy.html` 提供公开政策页面模板。正式发行者郑建宙与支持邮箱 958182284@qq.com 已填入政策；首次提交前部署长期有效的公开政策 URL，确认政策与最终包及所有 SDK 的实际行为一致，再填写 [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/) 与 [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)。iOS `PrivacyInfo.xcprivacy` 已声明 Preferences 使用的 UserDefaults 原因 `CA92.1`；增加新 SDK 后需重新核对清单。

**模拟赌博与年龄。** 当前筹码无现金价值、无提现、无奖金、无人类对赌，但内容仍是模拟扑克赌博；不要按普通休闲工具隐瞒此内容。按 [Apple 年龄评级定义](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) 如实填写，频繁模拟赌博当前对应 18+。Google 按 [内容评级问卷](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en) 及地区要求申报，部分市场还需要本地评级。若未来加入真钱、可兑换奖励或赌博推广，现有产品边界与发行准备不再适用，需重新核对 [Play 赌博政策](https://support.google.com/googleplay/android-developer/answer/18258653?hl=en&rd=4)。

**应用完整性。** 有完整离线牌局、规则结算、策略对手、设备设置和复盘等功能，但仍需通过商店审核；原生容器本身不保证获批。核对 [Apple 2.5.2 与 4.2](https://developer.apple.com/app-store/review/guidelines/) 和 [Play 功能与用户体验要求](https://support.google.com/googleplay/android-developer/answer/9898783?hl=en)，提供完整可用的产品与准确审核说明。

**测试资格。** 对于 2023-11-13 之后新建的个人 Google Play 开发者账号，申请生产发布前当前要求至少 12 名测试者连续参加封闭测试 14 天，见 [官方说明](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)。其他账号类型与后续政策可能不同，提交时重新查看后台要求。

## 真机验收

两端至少各覆盖一台真实设备，并检查：

1. 飞行模式下启动、5/9 人桌、下一手、重打、完整复盘与 Worker 计算。
2. 后台暂停后恢复，不重复机器人动作；锁屏、来电、声音静音及重新打开后的选项保存。
3. 刘海和手势条不遮挡，手机保持正向竖屏；iPad/Android 平板能切换横竖屏，字体缩放、按钮、对话框和 Android 返回键正常。
4. 真实签名包显示正确名称、图标、版本和构建号；通过 TestFlight/Play 测试渠道安装和升级后设置保留。
5. 所有许可、隐私、年龄评级、支持链接和商店描述与发行包一致。

源码更新后重新构建发行包，递增构建号、上传测试、验证，再提交商店新版本。商店规则会变化，发布时再次检查上述官方链接；本指南和工程不代表已经完成商业授权或通过商店审核。

## 多语言与全球发行

全球发行请先完成 [全球上架指导报告](global-store-report.md) 的语言、隐私、人物权利、地区评级和签名真机验收。运行 `npm run i18n:check` 与 `npm run store:check`；后者会明确报告尚未完成的发行条件。会员注册、资源同步或调试编译成功都不等于可以立即向全部地区提交。

公开发行者与邮箱、拟支持语言及验收状态保存在 `mobile/store-readiness.json`。不要在没有实际证据时把审批字段改成 `true`。包内离线政策包含 11 种语言；仍需把相同政策发布到长期有效的公开 HTTPS 页面，再填入商店和清单的政策 URL。
