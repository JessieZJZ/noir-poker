import React from "react";
import { DeviceFrame } from "./DeviceFrame";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { Backdrop, useFonts } from "./StoreFilm";
import { palette as c, typography } from "./assets";
import plan from "./media-plan.json";

export type StillProps = {
  language: "en" | "zh-CN";
  platform: "ios" | "android" | "ipad";
  feature: number;
  kind: "screenshot" | "feature-graphic";
};
const copy = {
  en: [
    ["A table for\nyour next decision.", "Offline Hold’em. Your pace."],
    ["Learn at\nthe table.", "Guided hands. Real choices."],
    ["See the reason\nbehind the play.", "Review decisions in context."],
    [
      "Same deal.\nAnother possibility.",
      "Replay the original cards and stacks.",
    ],
    ["Make the\nodds visible.", "Win, tie and outs in one place."],
    [
      "Meet a different\nkind of opponent.",
      "Eight styles. Three difficulty levels.",
    ],
    ["Every hand,\nkept close.", "Browse locally saved game records."],
    [
      "Return to\nthe whole hand.",
      "Revisit the table, result and action history.",
    ],
  ],
  "zh-CN": [
    ["每一手，\n练习更好的判断。", "离线德州扑克，按自己的节奏开练"],
    ["跟着实战，\n学会规则。", "从互动引导，到独立完成一手牌"],
    ["看懂每次\n行动的理由。", "结合当时的信息，理解选择与代价"],
    ["同一副牌，\n再试一种选择。", "恢复原始底牌、发牌顺序与起始筹码"],
    ["看清胜率，\n让判断更有依据。", "获胜、平局与 Outs，清楚呈现"],
    ["换一种对手，\n打开新的思路。", "八种训练风格，三个难度级别"],
    ["练过的每手牌，\n都值得再看。", "按对局浏览本机保存的牌局记录"],
    ["回到当时，\n看清完整过程。", "回看牌桌、结算与每一步行动"],
  ],
};
const keys = [
  "01-practice",
  "02-tutorial",
  "03-review",
  "04-result",
  "05-calculator",
  "06-styles",
  "07-records",
  "07-record-detail",
];
const screenshot = (platform: string, language: string, feature: number) => {
  const p = plan as unknown as Record<
    string,
    Record<string, Record<string, string>>
  >;
  return (
    p[platform]?.[language]?.[keys[feature]] || "assets/capture-in-progress.png"
  );
};

export const StoreStill: React.FC<StillProps> = ({
  language,
  platform,
  feature,
  kind,
}) => {
  useFonts();
  const { width, height } = useVideoConfig();
  const scale = width / 1290;
  const tablet = platform === "ipad";
  const [headline, detail] = copy[language][feature];
  if (kind === "feature-graphic")
    return (
      <AbsoluteFill style={{ fontFamily: typography, color: c.paper }}>
        <Backdrop />
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 72,
            fontSize: 14,
            letterSpacing: 3.5,
            color: c.mint,
          }}
        >
          NOIR POKER
        </div>
        <h1
          style={{
            position: "absolute",
            left: 70,
            top: 122,
            margin: 0,
            fontSize: language === "en" ? 51 : 48,
            lineHeight: 1.2,
            letterSpacing: -1.4,
            whiteSpace: "pre-line",
            maxWidth: 590,
          }}
        >
          {language === "en"
            ? "Your next decision\nstarts here."
            : "每一手，\n练习更好的判断。"}
        </h1>
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 281,
            width: 48,
            height: 2,
            background: c.gold,
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 70,
            top: 310,
            fontSize: 20,
            color: c.muted,
          }}
        >
          {language === "en" ? "Offline Hold’em practice" : "离线德州扑克练习"}
        </p>
        <div style={{ position: "absolute", left: 690, top: 55 }}>
          <DeviceFrame width={236} height={510}>
            <Img
              src={staticFile(screenshot(platform, language, 0))}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </DeviceFrame>
        </div>
      </AbsoluteFill>
    );
  if (tablet)
    return (
      <AbsoluteFill
        style={{ fontFamily: typography, color: c.paper, overflow: "hidden" }}
      >
        <Backdrop />
        <div
          style={{
            position: "absolute",
            left: 125,
            top: 140,
            color: c.mint,
            fontSize: 32,
            letterSpacing: 7,
          }}
        >
          NOIR POKER
        </div>
        <div
          style={{
            position: "absolute",
            left: 125,
            top: 370,
            fontSize: 32,
            color: c.gold,
            letterSpacing: 4,
          }}
        >
          {String(feature + 1).padStart(2, "0")} / 08
        </div>
        <h1
          style={{
            position: "absolute",
            left: 125,
            top: 490,
            margin: 0,
            width: 1110,
            fontSize: language === "en" ? 110 : 112,
            lineHeight: 1.18,
            letterSpacing: -3,
            whiteSpace: "pre-line",
          }}
        >
          {headline}
        </h1>
        <div
          style={{
            position: "absolute",
            left: 130,
            top: 890,
            width: 85,
            height: 4,
            background: c.mint,
          }}
        />
        <p
          style={{
            position: "absolute",
            left: 125,
            top: 980,
            width: 1080,
            fontSize: 43,
            lineHeight: 1.7,
            color: c.muted,
          }}
        >
          {detail}
        </p>
        <div style={{ position: "absolute", left: 1320, top: 170 }}>
          <DeviceFrame width={1290} height={1720} tablet>
            <Img
              src={staticFile(screenshot(platform, language, feature))}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </DeviceFrame>
        </div>
        <div
          style={{
            position: "absolute",
            left: 125,
            bottom: 140,
            fontSize: 27,
            color: c.muted,
            letterSpacing: 3,
          }}
        >
          {language === "en"
            ? "OFFLINE PRACTICE · VIRTUAL CHIPS"
            : "离线练习 · 虚拟筹码"}
        </div>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill
      style={{ fontFamily: typography, color: c.paper, overflow: "hidden" }}
    >
      <Backdrop />
      <div
        style={{
          position: "absolute",
          left: 82 * scale,
          top: 90 * scale,
          right: 82 * scale,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 25 * scale,
          letterSpacing: 5 * scale,
        }}
      >
        <span style={{ color: c.mint }}>NOIR POKER</span>
        <span style={{ fontFamily: "Barlow", color: c.gold }}>
          {String(feature + 1).padStart(2, "0")} / 08
        </span>
      </div>
      <h1
        style={{
          position: "absolute",
          left: 82 * scale,
          top: 190 * scale,
          margin: 0,
          fontSize: (tablet ? 87 : 101) * scale,
          lineHeight: 1.12,
          letterSpacing: -3 * scale,
          fontWeight: 700,
          whiteSpace: "pre-line",
        }}
      >
        {headline}
      </h1>
      <p
        style={{
          position: "absolute",
          left: 86 * scale,
          top: (tablet ? 420 : 452) * scale,
          margin: 0,
          fontSize: (tablet ? 29 : 34) * scale,
          lineHeight: 1.5,
          color: c.muted,
        }}
      >
        {detail}
      </p>
      <div
        style={{
          position: "absolute",
          left: 86 * scale,
          top: 548 * scale,
          width: 62 * scale,
          height: 3 * scale,
          background: c.mint,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 640 * scale,
          left: (width - ((height - 770 * scale) * 1206) / 2622) / 2,
        }}
      >
        <DeviceFrame
          width={((height - 770 * scale) * 1206) / 2622}
          height={height - 770 * scale}
        >
          <Img
            src={staticFile(screenshot(platform, language, feature))}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </DeviceFrame>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 48 * scale,
          left: 86 * scale,
          right: 86 * scale,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 19 * scale,
          letterSpacing: 2 * scale,
          color: "#91b2a5",
        }}
      >
        <span>
          {language === "en"
            ? "OFFLINE PRACTICE · VIRTUAL CHIPS"
            : "离线练习 · 虚拟筹码"}
        </span>
        <span>NOIR</span>
      </div>
    </AbsoluteFill>
  );
};
