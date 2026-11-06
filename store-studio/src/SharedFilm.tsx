import React from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
} from "remotion";
import { Video, Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { useFonts } from "./StoreFilm";
import { typography } from "./assets";
import { IPhoneFrame } from "./IPhoneFrame";
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
const zh = [
  "跟着引导，打出第一手",
  "牌桌上的每一步，都有迹可循",
  "打完一手，点开复盘",
  "同一手牌，换个选择",
  "从对局记录，回到那一手",
  "看清胜率，数清补牌",
];
const en = [
  "Learn one hand at a time",
  "Follow the hand as it unfolds",
  "Tap Review after the hand",
  "Same cards. A different choice.",
  "Find a hand in your history",
  "See your win rate and outs",
];
const section = {
  en: [
    "Guided hands",
    "Live hand activity",
    "Hand review",
    "Replay",
    "Game records",
    "Odds calculator",
  ],
  "zh-CN": [
    "新手引导",
    "本手动态",
    "决策复盘",
    "重打本手",
    "对局记录",
    "胜率计算器",
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
const bounded = (a: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, a));

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
  objectFit: "fill",
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
    <Video src={staticFile(src)} muted objectFit="fill" style={videoStyle} />
    {cues.map((c) => (
      <Pointer key={c.name} cue={c} f={f} size={size} />
    ))}
  </AbsoluteFill>
);

// Focus windows are in the original 402-by-874 viewport's coordinates.
// Cut the focus along with a navigation change; never point at a new page as
// if it were the control that opened it.
const focusY = (i: number, f: number, lang: Lang) => {
  if (i === 0) return lang === "en" ? 595 : 596;
  if (i === 1)
    return f < 50
      ? bounded(638 + ease(f, 3, 46, 0, 75), 45, 780)
      : lang === "en"
        ? 652
        : 657;
  if (i === 2) return f < 39 ? 720 : f < 90 ? 198 : 492;
  if (i === 3)
    return f < 39
      ? 720
      : f < 73
        ? 539
        : f < 102
          ? 635
          : f < 129
            ? 773
            : ease(f, 129, 146, 773, 653);
  if (i === 4)
    return f < taps[lang].records[1].frame
      ? 126
      : f < 105
        ? 408
        : ease(f, 118, 145, 163, 318);
  return ease(f, 8, 48, 313, 359);
};
const Shot = ({ i, language }: { i: number; language: Lang }) => {
  const f = useCurrentFrame(),
    id = ids[i],
    zhCN = language === "zh-CN";
  const cues: Cue[] =
    id === "review" || id === "retry" || id === "records"
      ? taps[language][id]
      : [];
  const src =
    i === 0
      ? `media/ios/${language}/tutorial.mp4`
      : `shared/${language}/${id}.mp4`;
  const y = focusY(i, f, language),
    calc = i === 5;
  const cx = calc ? 650 : 554,
    cy = calc ? 252 : 258,
    cw = calc ? 865 : 1264,
    ch = calc ? 493 : 457;
  const scale = cw / 402,
    top = bounded(y * scale - ch / 2, 0, 874 * scale - ch);
  const voice = `${calc ? "voice-v3" : "voice-v2"}/${language}/${id}.wav`;
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 20% 40%,#20463c 0%,#122c28 24%,#0b1d1d 53%,#071415 88%)",
        color: "#f6f3e9",
        fontFamily: typography,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 522,
          width: 1,
          background:
            "linear-gradient(transparent,#90b4a248 23%,#90b4a248 83%,transparent)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 65,
          left: 558,
          right: 94,
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 26,
          color: "#b5d0bc",
          letterSpacing: 1.5,
        }}
      >
        <b
          style={{
            fontFamily: "Barlow",
            letterSpacing: 4,
            fontSize: 33,
            color: "#efdeb1",
          }}
        >
          NOIR POKER
        </b>
        <span style={{ width: 39, height: 1, background: "#a5bca3" }} />
        <span>{section[language][i]}</span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "Barlow",
            fontSize: 29,
            letterSpacing: 4,
            color: "#9ab3a8",
          }}
        >
          {String(i + 1).padStart(2, "0")} / 06
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 132,
          left: 553,
          right: 75,
          fontSize: zhCN ? 78 : 67,
          fontWeight: 720,
          letterSpacing: zhCN ? -2 : -2.3,
          lineHeight: 1.15,
          transform: `translateY(${ease(f, 0, 12, 5, 0)}px)`,
        }}
      >
        {(zhCN ? zh : en)[i]}
      </div>
      <div style={{ position: "absolute", left: 97, top: 28 }}>
        <IPhoneFrame width={394} height={830}>
          <Src src={src} cues={cues} f={f} size={47} />
        </IPhoneFrame>
      </div>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: cw,
          height: ch,
          overflow: "hidden",
          borderRadius: 22,
          boxShadow: "0 0 0 1px #789b8b69,0 12px 36px #04100f75",
          background: "#0b1219",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -top,
            width: cw,
            height: 874 * scale,
          }}
        >
          <Src src={src} cues={cues} f={f} size={86} />
        </div>
      </div>
      {calc && (
        <div
          style={{
            position: "absolute",
            left: 1552,
            top: 342,
            width: 300,
            color: "#c9ddd0",
            fontSize: 27,
            opacity: ease(f, 9, 23, 0, 1),
            lineHeight: 1.4,
          }}
        >
          <div
            style={{
              color: "#96eac3",
              fontFamily: "Barlow",
              fontSize: 66,
              fontWeight: 600,
              lineHeight: 1.08,
            }}
          >
            56.06<span style={{ fontSize: 38 }}>%</span>
          </div>
          <div>{zhCN ? "获胜概率" : "Win rate"}</div>
          <div
            style={{
              width: 136,
              height: 1,
              background: "#708b7d",
              margin: "23px 0 18px",
            }}
          />
          <div
            style={{
              color: "#f4dda3",
              fontFamily: "Barlow",
              fontSize: 66,
              fontWeight: 600,
              lineHeight: 1.08,
            }}
          >
            16
          </div>
          <div>{zhCN ? "张补牌 · Outs" : "Outs"}</div>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 556,
          top: calc ? 774 : 757,
          right: 65,
          color: "#e8eee5",
          fontSize: zhCN ? 36 : 35,
          lineHeight: 1.45,
          display: "flex",
          alignItems: "center",
          gap: 23,
        }}
      >
        <span
          style={{
            width: 5,
            height: 33,
            borderRadius: 3,
            background: "#8be6ba",
            flexShrink: 0,
          }}
        />
        {sub(language, i)}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 556,
          right: 105,
          display: "flex",
          gap: 8,
        }}
      >
        {ids.map((s, n) => (
          <div
            key={s}
            style={{
              height: 3,
              borderRadius: 2,
              flex: 1,
              background: n <= i ? "#90c8a5" : "#29413c",
            }}
          />
        ))}
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
