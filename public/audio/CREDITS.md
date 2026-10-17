# NOIR Poker 背景音乐来源

曲目：夜色牌桌 / Midnight Felt。2026-10-16 为本项目以 AI 辅助编写旋律、和声与编配，并用本地 DSP 合成；没有引用第三方歌曲、录音、人声、采样包、MIDI 或音源库。

- 原始无损母带：`audio-studio/noir-background-music/masters/01-midnight-felt.flac`
- 制作脚本与显式乐谱：`audio-studio/noir-background-music/source/`
- 游戏资源：AAC、48 kHz、双声道、96 kbps，1162422 字节，完整保留约 93.659 秒循环。
- 母带 SHA-256：`96d878b64a7eddae7e18b46c7eef6f95679f44fcf1d660ab688602a8a1724e2e`
- 游戏资源 SHA-256：`566a6c8d8d16e72be394fee5202573ad36a48af5f46446c856b42f9dba9ecd18`

2026-10-17 手机外放重混：80 Hz 高通、1.6 kHz 宽带提升、响度压缩与峰值余量；乐谱与原母带不变，没有新增外部音源。处理三个连续循环后取中间一轮，避免滤波器从零状态起步；首尾各 4 ms 去点击，不增加静音或改变长度。本次进一步收紧峰值，编码后测量约 −18.97 LUFS、−10.77 dBTP，以 1.0 增益播放，比前版实际输出约提高 2.36 dB。

重制：

```sh
ffmpeg -stream_loop 2 -i audio-studio/noir-background-music/masters/01-midnight-felt.flac \
  -af 'highpass=f=80,equalizer=f=1600:t=o:w=2:g=3,loudnorm=I=-14:TP=-9:LRA=5,aresample=48000,alimiter=limit=0.23:attack=5:release=80:level=false:latency=true,atrim=start_sample=4495610:end_sample=8991220,asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=93.654542:d=0.004' \
  -ar 48000 \
  -map_metadata -1 -c:a aac -b:a 96k -movflags +faststart \
  public/audio/background-music.m4a
```

编码器不是曲库授权来源。原创合成减少外部录音/采样授权风险，不构成全球曲库相似性比对或绝对零风险保证。详见音乐工作室 README 的来源与使用边界。

## 筹码操作音效

[Joma86 — AllInPushChips2.wav](https://freesound.org/people/Joma86/sounds/532860/)，CC0。作者使用 Behringer C-1 录制推入一摞真实筹码的声音。本项目采用页面公开 HQ 预览的 0.15–0.75 秒，做首尾淡化、增益及峰值控制。Web/App 共用内嵌 PCM，微信生成相同的本地 WAV；详细处理与来源指纹见 `audio-studio/chip-stack/README.md`。
