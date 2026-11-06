import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
} from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Backdrop, useFonts } from "./StoreFilm";
import { typography } from "./assets";
import { IPhoneFrame } from "./IPhoneFrame";
import sharpFrames from "./sharp-frames.json";
import taps from "./shared-taps.json";
import board from "../storyboard.json";

type Lang = "zh-CN" | "en";
type Props = { language: Lang };
type Cue = { frame: number; x: number; y: number; name: string };
const ids = [
  "tutorial",
  "practice",
  "review",
  "retry",
  "records",
  "calculator",
] as const;
const headlines = {
  "zh-CN": [
    "跟着实战，\n学会规则。",
    "每步行动，\n实时看清。",
    "点开复盘，\n看懂理由。",
    "重打原牌，\n换种决策。",
    "对局记录，\n随时回看。",
    "胜率与 Outs，\n一眼看清。",
  ],
  en: [
    "Learn at\nthe table.",
    "Every action.\nAs it happens.",
    "Tap Review.\nFind the reason.",
    "Same deal.\nA new decision.",
    "Your hands.\nWorth revisiting.",
    "Win rate.\nAnd your outs.",
  ],
};
const details = {
  "zh-CN": [
    "从互动引导\n到自己完成一手牌",
    "正常对局，随时下滑\n查看本手动态实时更新",
    "一手结束，点击复盘\n连接当时信息与行动理由",
    "结算后点击“重打本手”\n用原牌尝试另一种选择",
    "打开菜单里的对局记录\n再进入这一手的记录详情",
    "胜率 56.06% · Outs 16\n看清哪些补牌能让这手牌领先",
  ],
  en: [
    "Guided hands.\nLearn by making real choices.",
    "Play your hand.\nFollow its live action history.",
    "Finish the hand. Tap Review.\nConnect choices with their reasons.",
    "Tap Replay hand.\nSame cards. A different decision.",
    "Menu → Game records → Hand details.\nReturn to the moments that matter.",
    "Win rate 56.06% · 16 outs\nSee which cards can take the lead.",
  ],
};
const sub = (lang: Lang, i: number) =>
  i === 5
    ? board.scenes[5][lang === "en" ? "sharedVoiceEn" : "sharedVoiceZh"]
    : board.scenes[i][lang === "en" ? "voiceEn" : "voiceZh"];
const ease = (f: number, a: number, b: number, x: number, y: number) =>
  interpolate(f, [a, b], [x, y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.78, 0.32, 1),
  });
const Pointer = ({ cue, f, size }: { cue: Cue; f: number; size: number }) => {
  const d = f - cue.frame;
  if (d < -17 || d > 7) return null;
  const alpha = Math.min(ease(d, -17, -11, 0, 1), ease(d, 0, 7, 1, 0));
  const drift = ease(d, -15, -2, 13, 0),
    press = 1 - 0.15 * ease(d, -6, -1, 0, 1) + 0.15 * ease(d, 0, 6, 0, 1);
  const ring = ease(d, -4, 7, 4, 20);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      style={{
        position: "absolute",
        left: (cue.x / 402) * 100 + "%",
        top: (cue.y / 874) * 100 + "%",
        overflow: "visible",
        pointerEvents: "none",
        opacity: alpha,
        transform: "translate(-23%, -24%)",
      }}
    >
      <circle
        cx="18.4"
        cy="19.2"
        r={ring}
        fill="none"
        stroke="#91ffcf"
        strokeWidth="2.8"
        opacity={1 - ease(d, 1, 7, 0, 1)}
      />
      <g
        transform={`translate(${18.4 + drift},${19.2 + drift}) scale(${press}) rotate(-19)`}
        style={{ filter: "drop-shadow(0px 2px 3px #02140d)" }}
      >
        <path
          d="M-3.6 3.6Q-3.6 -1 0 0Q3.4 .1 3.7 3.8L4.5 16.5L5.3 13.5Q7.3 9.5 10.6 12L12.1 14.7Q14.1 9.7 17.5 13.5L19.2 16.4Q22.3 13.5 25 17Q28.2 22 27.1 30.8L25.3 41Q24.7 44.9 21 45L7 45Q3.7 45 1.5 41.7L-8.1 27.7Q-11 23.8 -8.8 21.5Q-6.5 19.7 -3.1 23.2L.2 26.9Z"
          fill="#fff9e8"
          stroke="#143c31"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};
const videoStyle: React.CSSProperties = {
  position: "absolute",
  width: "100%",
  height: "100%",
  objectFit: "contain",
};
const Src = ({
  src,
  cues,
  f,
  size,
}: {
  src: string;
  cues: Cue[];
  f: number;
  size: number;
}) => (
  <AbsoluteFill>
    <Img src={staticFile(src)} style={videoStyle} />
    {cues.map((c) => (
      <Pointer key={c.name} cue={c} f={f} size={size} />
    ))}
  </AbsoluteFill>
);

// One complete portrait recording inside one phone. Layout is based on the
// supplied reference: copy on the left, a full phone on the right.
const Shot = ({ i, language }: { i: number; language: Lang }) => {
  const f = useCurrentFrame(),
    id = ids[i],
    zhCN = language === "zh-CN";
  const cues: Cue[] =
    id === "review" || id === "retry" || id === "records"
      ? taps[language][id]
      : [];
  const frames = sharpFrames[language][id].frames;
  const src = `sharp-frames/${language}/${id}/${frames[Math.max(0, Math.min(f, frames.length - 1))]}`;
  const voice = `${i === 5 ? "voice-v3" : "voice-v2"}/${language}/${id}.wav`;
  return (
    <AbsoluteFill style={{ fontFamily: typography, color: "#f2f4ea" }}>
      <Backdrop />
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 74,
          fontSize: 23,
          letterSpacing: 6,
          color: "#9de7cd",
        }}
      >
        NOIR POKER
      </div>
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 199,
          width: 1060,
          transform: `translateY(${ease(f, 0, 14, 10, 0)}px)`,
          opacity: ease(f, 0, 9, 0, 1),
        }}
      >
        <div
          style={{
            fontSize: 27,
            fontWeight: 650,
            letterSpacing: 2.6,
            color: "#dfbd79",
            marginBottom: 29,
          }}
        >
          {String(i + 1).padStart(2, "0")} /{" "}
          {zhCN ? "让每次练习都有收获" : "PRACTICE WITH PURPOSE"}
        </div>
        <h1
          style={{
            fontSize: zhCN ? 94 : 96,
            lineHeight: 1.14,
            letterSpacing: -2.5,
            fontWeight: 700,
            whiteSpace: "pre-line",
            margin: 0,
          }}
        >
          {headlines[language][i]}
        </h1>
        <div
          style={{
            width: 72,
            height: 3,
            background: "#9de7cd",
            margin: "32px 0",
          }}
        />
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.65,
            whiteSpace: "pre-line",
            color: "#b1c6bd",
          }}
        >
          {details[language][i]}
        </div>
      </div>
      <div style={{ position: "absolute", left: 1285, top: 32 }}>
        <IPhoneFrame width={390} height={822}>
          <Src src={src} cues={cues} f={f} size={58} />
        </IPhoneFrame>
      </div>
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 737,
          width: 1050,
          color: "#e7efe7",
          fontSize: zhCN ? 31 : 30,
          lineHeight: 1.45,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span
          style={{ width: 3, height: 30, flexShrink: 0, background: "#9de7cd" }}
        />
        <span>{sub(language, i)}</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: 118,
          bottom: 32,
          fontSize: 17,
          letterSpacing: 2,
          color: "#91b2a5",
        }}
      >
        {zhCN ? "离线练习 · 虚拟筹码" : "OFFLINE PRACTICE · VIRTUAL CHIPS"}
      </div>
      <Sequence from={9} name={id + " voice"}>
        <Audio src={staticFile(voice)} />
      </Sequence>
    </AbsoluteFill>
  );
};
export const SharedFilm = ({ language }: Props) => {
  useFonts();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        {ids.flatMap((id, i) => [
          ...(i
            ? [
                <TransitionSeries.Transition
                  key={id + "-in"}
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: 6 })}
                />,
              ]
            : []),
          <TransitionSeries.Sequence
            key={id}
            name={id}
            durationInFrames={board.scenes[i].durationFrames}
          >
            <Shot i={i} language={language} />
          </TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      <Audio
        src={staticFile("assets/background-music-mobile.m4a")}
        volume={(f) =>
          0.3 * Math.min(ease(f, 0, 19, 0, 1), ease(f, 863, 893, 1, 0))
        }
      />
    </AbsoluteFill>
  );
};
