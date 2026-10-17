# 筹码声试听

`chip-stack.wav` 为游戏当前跟注、下注、加注共用的 340ms、44.1kHz 单声道 16-bit PCM。

2026-10-17 按用户视频中的筹码碰撞节奏与频段重新合成：13 次强弱不一的短接触、宽带颗粒与很短的不谐和振动，去掉此前较明显的固定音高。参考视频及其音轨不入库、不采样；音频全部来自 `src/ui/sound-cues.js` 的确定性本地合成。

整段 RMS 约 0.2179，峰值不超过 0.7，保持上一版的信号能量。参考音频两个筹码片段的能量加权频率中心约 5.25/5.81kHz，新合成声约 5.53kHz；这些是音频分析，不是人工听感或手机扬声器验收。

重新导出：

```sh
node --input-type=module - <<'JS'
import { writeFileSync } from 'node:fs';
import { soundWave } from './scripts/wechat.mjs';
writeFileSync('audio-studio/chip-stack/chip-stack.wav', soundWave('chip'));
JS
```

本次按用户要求不运行单元、浏览器、微信或安装版回归。音频本身的包络、频段、时长与峰值确认和发布打包单独记录，不冒充回归通过。
