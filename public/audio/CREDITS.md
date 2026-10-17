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

## 手机专用响度版本（2026-10-17）

桌面继续使用上述文件，字节及播放增益不变。原生 App、触摸设备浏览器和微信使用 `background-music-mobile.m4a`；微信仅复制手机版本到音乐分包，不增加第二份文件。

手机版本从原始无损母带制作：100 Hz 高通、1.6 kHz 提升、动态压缩、响度处理和峰值控制，保留同一曲目和 93.659 秒循环。AAC 128 kbps / 48 kHz / 双声道，1,570,495 字节；编码后实测约 −13.67 LUFS、−6.94 dBTP，相比桌面版平均响度提高 5.30 dB。SHA-256：`411fea885fc40696dfa6202c6c04e12da523c6bdbe9f063a565e71d7b6cbf58d`。

App 继续共用最终混音限幅。微信动作音效响起时音乐临时降至 0.45，650 ms 后恢复 1.0；连续动作延长保护窗口，关闭声音、进入后台或释放播放器均取消恢复计时，避免迟到回调影响下一次播放。该余量按解码后峰值和单个动作音效上限检查。

```sh
ffmpeg -stream_loop 2 -i audio-studio/noir-background-music/masters/01-midnight-felt.flac \
  -af 'highpass=f=100,equalizer=f=1600:t=o:w=2:g=4,acompressor=threshold=0.035:ratio=4:attack=5:release=100:makeup=4,loudnorm=I=-12:TP=-2:LRA=3,aresample=48000,alimiter=limit=0.4:attack=5:release=80:level=false:latency=true,atrim=start_sample=4495610:end_sample=8991220,asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=93.654542:d=0.004' \
  -ar 48000 -map_metadata -1 -c:a aac -b:a 128k -movflags +faststart \
  public/audio/background-music-mobile.m4a
```

手机半音量在嘈杂环境中的实际听感仍受设备扬声器、系统音量曲线与环境噪声影响；本机解码、响度和模拟器结果不代替实体手机听音。

## 筹码操作音效

2026-10-18 按用户确认采用其提供视频 `43b358c5c3da4c38bcc9103f3a7cc290.mp4` 中 1.458–1.968 秒的下注声，版本「01 原视频节奏」。仅作边缘淡化和线性增益，保留原碰撞节奏；不再采用此前 Joma86 录音。Web/App 共享内嵌 PCM，微信生成完全相同的本地 WAV。文件指纹与处理说明见 `audio-studio/chip-stack/README.md`。
