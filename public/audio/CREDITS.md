# NOIR Poker 背景音乐来源

曲目：夜色牌桌 / Midnight Felt。2026-10-16 为本项目以 AI 辅助编写旋律、和声与编配，并用本地 DSP 合成；没有引用第三方歌曲、录音、人声、采样包、MIDI 或音源库。

- 原始无损母带：`audio-studio/noir-background-music/masters/01-midnight-felt.flac`
- 制作脚本与显式乐谱：`audio-studio/noir-background-music/source/`
- 游戏资源：AAC、48 kHz、双声道、96 kbps，1165542 字节，完整保留约 93.659 秒循环。
- 母带 SHA-256：`96d878b64a7eddae7e18b46c7eef6f95679f44fcf1d660ab688602a8a1724e2e`
- 游戏资源 SHA-256：`95df75d4c160c760f5655bb35488264202d5a5992d33972bb43c4a82aa216bd4`

2026-10-17 手机外放重混：80 Hz 高通、1.6 kHz 宽带提升、响度压缩与峰值余量；乐谱与原母带不变，没有新增外部音源。处理三个连续循环后取中间一轮，避免滤波器从零状态起步；首尾各 4 ms 去点击，不增加静音或改变长度。编码后测量约 −19.39 LUFS、−9.50 dBTP；0.8 播放增益后约 −21.33 LUFS。

重制：

```sh
ffmpeg -stream_loop 2 -i audio-studio/noir-background-music/masters/01-midnight-felt.flac \
  -af 'highpass=f=80,equalizer=f=1600:t=o:w=2:g=3,loudnorm=I=-17:TP=-9:LRA=7,volume=-1.5dB,aresample=48000,atrim=start_sample=4495610:end_sample=8991220,asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=93.654542:d=0.004' \
  -ar 48000 \
  -map_metadata -1 -c:a aac -b:a 96k -movflags +faststart \
  public/audio/background-music.m4a
```

编码器不是曲库授权来源。原创合成减少外部录音/采样授权风险，不构成全球曲库相似性比对或绝对零风险保证。详见音乐工作室 README 的来源与使用边界。
