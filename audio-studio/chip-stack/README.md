# 筹码声

当前跟注、下注、加注共用用户在 2026-10-18 确认的「01 原视频节奏」版本。

- 来源：用户提供的 `43b358c5c3da4c38bcc9103f3a7cc290.mp4`，截取 1.458–1.968 秒的下注声。
- 处理：起始 0.6 ms、末尾 25 ms 淡化及线性增益；没有压缩、限幅、变调或叠加其他录音。
- 文件：`chip-stack.wav`，510 ms、44.1 kHz、单声道、16-bit PCM；22,491 个采样，45,026 字节。
- SHA-256：`d853c5acc8657d6968603cf1dfb747d0e06267f1584a28d842a8d3c635158aa2`，与确认的单次试听 WAV 逐字节一致。
- 解码 RMS 约 0.05486，峰值约 0.77997。保留短促碰撞的动态，不再经过旧筹码声的响度压缩。

`src/ui/chip-recording.js` 内嵌上述文件的数据块，Web、iOS、Android 直接播放相同 PCM；微信打包相同的本地 `chip.wav`。最终 Web/App 混音仅在超过单音效峰值 0.78 时限幅；微信动作音效期间音乐降至 0.45，650 ms 后恢复，预留叠加余量。

重新导出：

```sh
node --input-type=module - <<'JS'
import { writeFileSync } from 'node:fs';
import { soundWave } from './scripts/wechat.mjs';
writeFileSync('audio-studio/chip-stack/chip-stack.wav', soundWave('chip'));
JS
```

按用户此前要求，本次替换不运行整套回归或模拟器回归；检查确认版与共享 PCM/WAV 一致性、构建和资源副本。同步更新现有回归契约的时长、信号范围与音频指纹，不以旧版测试报告代替本次设备听音。
