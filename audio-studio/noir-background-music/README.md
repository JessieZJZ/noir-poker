# NOIR Poker 原创背景音乐候选

2026-10-16 制作。四版均为本次编写的旋律、和声与编配，通过本地 DSP 合成直接生成音频。没有下载或引用歌曲、录音、采样、MIDI、预训练音乐模型或第三方音源库。此目录是选曲素材，尚未接入游戏播放，也不进入 Web、原生或微信的生产包。

## 先听哪一版

| 版本                        | 方向                                   | 速度   | 循环长度 | 适合的场景                             |
| --------------------------- | -------------------------------------- | ------ | -------- | -------------------------------------- |
| 01 夜色牌桌 · Midnight Felt | 温暖电钢琴、圆润低音、轻刷鼓、少量泛音 | 82 BPM | 约 1:34  | 推荐优先试听；默认对局，兼顾质感与专注 |
| 02 薄荷暗流 · Mint Circuit  | 短拨弦、柔和电子铺底、轻量切分节奏     | 94 BPM | 约 1:22  | 连续练习，希望音乐稍有推动力           |
| 03 丝绒会客室 · Velvet Room | 毡音钢琴、合成拨弦低音、刷鼓与颤音琴   | 76 BPM | 约 1:41  | 更温暖、放松，适合长时间休闲对局       |
| 04 静夜推演 · Quiet Equity  | 稀疏钢琴、缓慢和声、低频呼吸、远处泛音 | 68 BPM | 约 1:53  | 鼓点最少，适合思考和复盘               |

每版 32 小节，4/4 拍，以 8 小节为单位做细微变化。保留稳定的核心节奏，没有人声、赌场环境录音、突发高潮或结尾胜利式收束。配色与方向对应游戏现有深色、薄荷绿的视觉；速度参考当前机器人 1.2–8 秒的行动思考范围，而非与单次下注绑定。

直接打开 `audio/*.m4a` 即可试听。AAC 预览跨端容易播放，但不作为精确循环母带。也可以运行独立试听页：

```sh
cd /Users/zjz/code/noir-poker
python3 -m http.server 8788 --bind 127.0.0.1 --directory audio-studio/noir-background-music
```

打开 <http://127.0.0.1:8788/listen.html>，点击「播放 · 循环」。本页解码无损 FLAC，以音频采样时钟循环，切换时仅做短淡入淡出；循环点本身没有淡出。「听循环接缝」播放末尾 4 秒与开头 6 秒。离开页面会停止试听。试听页服务仅供本机选曲使用，与游戏开发端口独立。

## 文件与精确循环

- `masters/*.flac`：48 kHz、双声道、24-bit 无损母带；解码 PCM 与本地 WAV 母带完全一致。
- `audio/*.m4a`：192 kbps AAC 试听文件。
- `audio/*.opus`：Opus 160 kbps 压缩候选；集成前仍需检查目标平台的解码、采样长度和循环行为。
- `manifest.json`：每首精确帧数、BPM、响度、真峰值、输出文件 SHA-256，以及渲染脚本指纹。
- `source/*.score.json`：和声、动机、种子及实际生成的全部音符与打击乐事件。
- `source/render.py`：音色、编排、混响、母带与导出逻辑；不联网。
- `verification.json`：离线音频检查结果，具体证据范围写在报告内。

循环起点为第 0 帧，终点为 `manifest.json` 的 `loopEndFrameExclusive`，不包含终点帧。每首按 `round(32 × 4 × 60 / BPM × 48000)` 生成完整周期。音符尾音、节拍延迟与混响均环绕回周期起点，滤波器从上一周期预热，不在接缝处重置。

统一目标约 **−20 LUFS**，真峰值低于 **−3 dBTP**。母带用单一静态增益匹配响度，不对整曲执行会改变时长的动态响度归一化。首尾没有为循环添加静音或淡出。

本地另有 `.artifacts/background-music/wav/*.wav`（24-bit WAV）、`seams/*-seam.wav`（10 秒循环接缝）和交付 ZIP。WAV 可从已跟踪的 FLAC 无损恢复：

```sh
ffmpeg -i audio-studio/noir-background-music/masters/01-midnight-felt.flac \
  -c:a pcm_s24le .artifacts/background-music/01-midnight-felt.wav
```

## 来源与使用边界

| 层次           | 本次来源                                                               |
| -------------- | ---------------------------------------------------------------------- |
| 旋律与编配     | 本次由 AI 辅助编写的显式音符、和声、节奏与结构；乐谱和种子随交付保留   |
| 旋律参考       | 没有指定歌曲、艺人或录音作为模仿参考                                   |
| 乐器与打击乐   | 正弦及加法/FM 合成、滤波噪声、包络；无外部采样或声音字体               |
| 空间效果       | 本地生成的混响脉冲与圆周节拍延迟；没有加载外部混响脉冲响应             |
| 导出           | FFmpeg 编码为 FLAC、AAC 与 Opus；工具与编码器不是曲库授权来源          |
| 第三方音频授权 | 无第三方音频素材，故没有引入曲库的署名、非商用、分成或相同方式共享条款 |

这些制作措施减少第三方录音和采样的授权风险，但不能证明全球所有旋律均不存在相似片段，也不能承诺绝不会遇到 Content ID 误报或权利争议。本次未做全球曲库相似性比对或版权登记；数值检查也不构成此类证明。

**可用于项目的素材来源审计，与是否取得排他版权是两个问题。** 例如，美国版权局对 AI 输出的可版权性要求足够的人类创作表达，仅提供提示词并不充分，见[官方说明](https://www.copyright.gov/newsnet/2025/1060.html)。此处记录的是本次制作与来源事实，不提供绝对法律保证，也不擅自将你的项目素材按 CC0 公开放弃权利。CC0 本身同样不附带权利状态保证，见 [Creative Commons 官方说明](https://creativecommons.org/publicdomain/zero/1.0/)。

## 重新生成与验证

本机已验证的制作环境为 Python 3.14、NumPy 2.5.4、SciPy 1.18.1 与系统 FFmpeg。依赖仅用于离线制作，不加入游戏依赖或原生包。其他 Python 版本需自行选择兼容的 NumPy/SciPy。

```sh
cd /Users/zjz/code/noir-poker
python3 -m venv .artifacts/music-tools
.artifacts/music-tools/bin/python -m pip install \
  -r audio-studio/noir-background-music/source/requirements.txt
.artifacts/music-tools/bin/python audio-studio/noir-background-music/source/render.py
.artifacts/music-tools/bin/python audio-studio/noir-background-music/source/verify.py
```

只重做一版可在渲染命令后追加 `--track 01`、`02`、`03` 或 `04`。也可用 `--output` 将全部派生文件写到另一目录，避免覆盖选曲结果。不同 NumPy/SciPy 或 FFmpeg 版本可能改变编码文件哈希，具体来源以对应清单为准。

验证覆盖：四版输出文件哈希、无损解码、精确音乐周期、非静音首尾、接缝相邻采样差、无非有限数和削波、响度与真峰值，以及压缩文件可解码。若本地 WAV 存在，还逐采样比较 FLAC/WAV。保留压缩编码的额外解码帧数，以免把 AAC 或 Opus 的容器长度直接当作无损循环帧数。

技术检查不能代替主观听感，也不等于 Web/App/微信游戏内播放通过。此轮只交付候选音乐和独立试听工具；游戏尚未增加背景音乐控制、后台策略或播放器。

## 后续游戏集成建议

先选定方向与音量，再把选中素材接入游戏。让音乐和现有 `src/ui/sound-cues.js` 音效使用独立音量；BGM 可从 20%–30% 开始调听，重点确认筹码、发牌与轮到行动的提示清晰。不要把四版无损母带全部复制进微信主包。

Web 可从解码后的 AudioBuffer 按精确长度循环；避免在 JavaScript 计时器里一段段重新开始音乐。原生保持本地资源，并处理退后台、音频中断、重进牌桌与用户手动静音。微信应单独验证支持的编码、包体和切换时的实际接缝。三端接入后，才分别报告 Web、安装后的模拟器 App 与 DevTools/设备的播放证据。
