# 筹码声试听

`chip-stack.wav` 为游戏当前跟注、下注、加注共用的 600ms、44.1kHz 单声道 16-bit PCM。

本版采用真实录音：[Joma86 — AllInPushChips2.wav](https://freesound.org/people/Joma86/sounds/532860/)。作者说明为使用 Behringer C-1 录下推入一摞筹码的动作，源素材采用 CC0。使用该页面公开提供的 HQ MP3 预览，原始预览 SHA-256：`9864117fdf8364cc29bafbabcc4ef3dd3068c5e1a179fc6f55077d129fa803e4`。

截取原录音 0.15–0.75 秒，保留实际碰撞节奏和落稳尾音；仅做首尾淡化、统一增益与柔和峰值限制，不添加振荡器、合成碰撞或音高变化。原始片段 PCM 保存在 `src/ui/chip-recording.js`，游戏共用母带后 RMS 约 0.1861、峰值约 0.7000。音频信号测量不等于实体手机听感验收。

Web、iOS、Android 从同一 PCM 播放；微信打包同一 PCM 为 `chip.wav`，跟注、下注、加注共用文件，避免重复占用主包。

重新导出：

```sh
node --input-type=module - <<'JS'
import { writeFileSync } from 'node:fs';
import { soundWave } from './scripts/wechat.mjs';
writeFileSync('audio-studio/chip-stack/chip-stack.wav', soundWave('chip'));
JS
```

按用户要求，本次不运行音频回归测试；更新旧测试中的音频时长、音量范围及资产路径，避免保留过期合成音契约。指南吸顶检查与构建打包单独记录。
