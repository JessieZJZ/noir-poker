# NOIR Poker 背景音乐来源

曲目：夜色牌桌 / Midnight Felt。2026-10-16 为本项目以 AI 辅助编写旋律、和声与编配，并用本地 DSP 合成；没有引用第三方歌曲、录音、人声、采样包、MIDI 或音源库。

- 原始无损母带：`audio-studio/noir-background-music/masters/01-midnight-felt.flac`
- 制作脚本与显式乐谱：`audio-studio/noir-background-music/source/`
- 游戏资源：AAC、48 kHz、双声道、96 kbps，1166747 字节，完整保留约 93.659 秒循环。
- 母带 SHA-256：`96d878b64a7eddae7e18b46c7eef6f95679f44fcf1d660ab688602a8a1724e2e`
- 游戏资源 SHA-256：`f4e9e085ba8573b516b8f904da2b9c76cc45714c7e94c50434d6c11483c80956`

重制：

```sh
ffmpeg -i audio-studio/noir-background-music/masters/01-midnight-felt.flac \
  -map_metadata -1 -c:a aac -b:a 96k -movflags +faststart \
  public/audio/background-music.m4a
```

编码器不是曲库授权来源。原创合成减少外部录音/采样授权风险，不构成全球曲库相似性比对或绝对零风险保证。详见音乐工作室 README 的来源与使用边界。
