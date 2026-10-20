# 背景音乐与独立振动

Web、iOS、Android 和微信小程序的设置提供两个开关：

- **音效与音乐**：统一控制操作音效及「夜色牌桌」循环背景音乐。
- **振动**：独立控制轮到玩家行动时的一次轻振提醒。Web 取决于浏览器的振动 API；原生使用 Haptics，小程序使用 `wx.vibrateShort`。

新设备两项均默认开启。Web/App 分别保存到 `noir-sound`、`noir-vibration`，App 启动前从 Capacitor Preferences 恢复；微信保存到原有设置对象的 `sound`、`vibration` 字段。旧版组合静音且没有独立振动设置时，两项保持关闭；首次分别修改后，声音开关不再改变振动。

音乐与音效共用声音偏好、采用独立音量。桌面与手机使用同源的不同响度母带，播放增益均为 1.0；桌面约 −18.97 LUFS，App、触摸浏览器与微信约 −13.67 LUFS。进入待入座牌桌后，音乐从头播放并用 2400 ms 平滑渐入。设置界面、换手、重打、重新练习和查看对局记录都不会重新创建音乐或从头播放。关闭声音立即暂停，重新打开从原位置继续并用 700 ms 渐入。详见[入座体验](entry-experience.md)。

弃牌、获胜提示增强中频及持续响度，完整提示 RMS 分别约 0.214、0.238。跟注／下注／加注使用用户在 2026-10-18 确认的「01 原视频节奏」：从用户提供视频截取 510ms 下注声，保留碰撞节奏与动态，RMS 约 0.05486、峰值约 0.77997；不再经过合成提示音的响度压缩。其他提示仍保持原先 PCM 及 0.7 峰值上限。音源与处理见 [筹码声试听](../audio-studio/chip-stack/README.md)。这些是信号测量，不是特定手机扬声器或室外环境的声压测量。已经较清楚的过牌、发牌／开局 PCM 保持不变。

切到后台、页面离开或手机方向阻塞时暂停音乐；回到活动前台后按保存的声音选择恢复。Web 的隐藏标签页暂停音乐而不改变原有电脑行动时钟。浏览器可能阻止无手势播放，默认开启表示播放意愿；首次真实点击或按键会同时解锁音乐与音效，不能通过计时器绕过浏览器限制。参见 [MDN 自动播放指南](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。

## 本地资源与包体

`public/audio/background-music.m4a` 为「夜色牌桌」的 48 kHz、双声道、96 kbps AAC，约 1.1 MiB，完整保留约 93.659 秒。来源、母带与文件指纹见 [CREDITS](../public/audio/CREDITS.md)。四版无损候选留在 `audio-studio/`，不会全部进入产品。

Web/App 使用同一包内文件、同一个循环 audio 元素；BGM 通过独立 GainNode 接到现有 AudioContext，兼容不支持元素音量调整的 iOS。音乐与音效共同进入最终限幅器，混音峰值不超过 0.92。音频资源与全部图片共同进入原生资源指纹，并在最终 `.app` / `.apk` / `.aab` 中逐字节验证。没有生产 `server.url` 或远程音乐地址。

小程序把手机版 AAC 文件复制到本地 `music` 分包；仅在声音开启时通过 `require.async` 加载分包的资源入口，使用单独的 `InnerAudioContext`，`loop=true`、`volume=1.0`。小程序仅保留最新的动作提示，音乐编码后的真峰值约 −6.94 dBTP；动作期间音乐临时降至 0.45，650 ms 后恢复 1.0，与新版单条筹码音效的保守峰值之和小于 0.99，留出混音余量。App 生命周期控制音乐，音效池停止或重建不影响它。分包完成与音频就绪回调都检查当前播放意愿；关闭或销毁后的旧回调不能重新启动音乐。加载方式遵循[微信分包异步化](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)，采用[腾讯官方接入示例](https://cloud.tencent.com/document/product/679/116623)同样的 Promise 模块接口。

构建保留主包和各分包各自 2 MiB、总包 20 MiB 的预算，在 `build-info.json.packageBytes` 写入每包大小；文件缺失、损坏或与公共资源不一致均阻止验证。

## 回归与验收范围

```sh
npm run check
npm run test:e2e
npm run i18n:check
npm run format:check
npm run mobile:sync
npm run mobile:verify
npm run wechat:verify
npm run wechat:check
```

单元回归覆盖默认值、旧静音迁移、独立保存、迟到播放/分包回调、后台/销毁后取消，以及主包/音乐包大小边界和音频字节校验。浏览器回归检查真实本地 AAC 解码、跨首尾循环、前后台、声音与振动独立、刷新持久化和换手不增加播放器。所有新增控制文案均进入 Web/App 的 11 种语言与字体子集。

安装后的原生专项名称为 `combined-feedback-preference`、`background-music-loop-and-independent-vibration`：验证音效 dispatch 与 Haptics 分别开关，实际音频时间推进和循环，真实 App 前后台与重启持久保存，并保留截图。此证据不等于实体手机的扬声器听感或振动马达验收。微信编译、mock 与 DevTools 运行分别记录，不能互相替代。

微信开发者工具打开最新生成的工程并启用自动化后，可执行音乐专项，端口替换为当前 CLI 的 `--auto-port`：

```sh
node tests/wechat/background-music.mjs ws://127.0.0.1:9462 .artifacts/background-music/wechat
```

该脚本观察真实 `InnerAudioContext` 的解码、时间推进和首尾循环，点击两项开关，验证页面重开后的独立保存。生命周期部分调用实际 App 的 `onHide` / `onShow` 处理器，在报告中与实体微信客户端切后台区分。测试前保存设置，结束后恢复，并保留报告及截图。

本次筹码声音色替换的来源、测量与试听见 [筹码声试听](../audio-studio/chip-stack/README.md)。按用户要求不运行回归测试。
