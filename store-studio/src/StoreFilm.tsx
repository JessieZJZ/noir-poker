import React from "react";
import {
  AbsoluteFill,
  Img,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { BasicCaptions } from "./basic-captions";
import { DeviceFrame } from "./DeviceFrame";
import { fontsReady, palette as c, typography } from "./assets";
import plan from "./media-plan.json";
export type FilmProps = {
  language: "en" | "zh-CN";
  platform: "ios" | "android";
  presentation: "apple" | "google";
  narration: boolean;
};
type SceneId =
  | "tutorial"
  | "practice"
  | "review"
  | "retry"
  | "records"
  | "calculator";
const headlines = {
  en: [
    "Learn at\nthe table.",
    "Every action.\nAs it happens.",
    "Tap Review.\nFind the reason.",
    "Same deal.\nA new decision.",
    "Your hands.\nWorth revisiting.",
    "Choose the cards.\nSee the odds.",
  ],
  "zh-CN": [
    "跟着实战，\n学会规则。",
    "每步行动，\n实时看清。",
    "点开复盘，\n看懂理由。",
    "重打原牌，\n换种决策。",
    "对局记录，\n随时回看。",
    "选好牌，\n看清胜率。",
  ],
};
const details = {
  en: [
    "Guided hands.\nLearn by making real choices.",
    "Play your hand.\nFollow its live action history.",
    "Finish the hand. Tap Review.\nConnect choices with their reasons.",
    "Tap Replay hand.\nSame cards. A different decision.",
    "Game records → Hand details.\nReturn to the moments that matter.",
    "Choose hole cards and the board.\nSee win, tie and outs.",
  ],
  "zh-CN": [
    "从互动引导\n到自己完成一手牌",
    "正常对局，随时下滑\n查看本手动态实时更新",
    "一手结束，点击复盘\n连接当时信息与行动理由",
    "结算后点击“重打本手”\n用原牌尝试另一种选择",
    "打开对局记录，再进入详情\n回看牌桌、结算与行动过程",
    "设置底牌与公共牌\n查看获胜、平局与 Outs",
  ],
};
export const useFonts = () => {
  const [handle] = React.useState(() =>
    delayRender("Loading local brand fonts"),
  );
  React.useEffect(() => {
    fontsReady.then(() => continueRender(handle));
  }, [handle]);
};
export const Backdrop = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at 78% 35%,#315c4d65 0%,transparent 56%),linear-gradient(130deg,${c.ink},#0c1a20 60%,#0a141a)`,
    }}
  >
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", opacity: 0.13 }}
    >
      <ellipse
        cx="1460"
        cy="550"
        rx="700"
        ry="820"
        fill="none"
        stroke={c.mint}
      />
      <ellipse
        cx="1460"
        cy="550"
        rx="645"
        ry="765"
        fill="none"
        stroke={c.mint}
      />
      <path d="M0 960H1920" stroke={c.mint} />
    </svg>
  </AbsoluteFill>
);
const media = (platform: string, language: string, id: SceneId) => {
  const p = plan as unknown as Record<
    string,
    Record<string, Record<string, string>>
  >;
  return p[platform]?.[language]?.[id] || "assets/capture-in-progress.png";
};
const Footage = ({ src }: { src: string }) =>
  src.endsWith(".png") ? (
    <Img
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  ) : (
    <Video
      src={staticFile(src)}
      muted
      style={{ width: "100%", height: "100%" }}
      objectFit="contain"
    />
  );
const Entrance = ({ children }: { children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [0, 12], [0, 1], {
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [0, 18], ["0px 18px", "0px 0px"], {
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {children}
    </div>
  );
};
const CaptionLayer = ({
  index,
  language,
  apple,
}: {
  index: number;
  language: FilmProps["language"];
  apple: boolean;
}) => {
  const captionStyle: React.CSSProperties = {
    position: "absolute",
    left: apple ? 510 : 118,
    top: apple ? 775 : 920,
    fontFamily: typography,
    fontSize: apple ? 32 : 34,
    lineHeight: 1.45,
  };
  return (
    <div className="noir-captions-v2">
      <style>{`.noir-captions-v2>div{justify-content:flex-start!important}.noir-captions-v2>div>div{font-family:Manrope,Noto,sans-serif!important;font-size:${apple ? 31 : 33}px!important;font-weight:500!important;line-height:1.45!important;text-align:left!important;color:#eef4ed!important;background:${apple ? "rgba(6,12,16,.86)" : "transparent"}!important;border:0!important;border-left:3px solid #9de7cd!important;border-radius:0!important;padding:8px 0 8px 22px!important;text-shadow:0 2px 14px #0009;}`}</style>
      {language === "en" && index === 0 && (
        <BasicCaptions
          name="tutorial captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Learn the rules, one guided hand at a time.",
              startMs: 300,
              endMs: 4300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 1 && (
        <BasicCaptions
          name="practice captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Follow every action as the hand unfolds.",
              startMs: 300,
              endMs: 4700,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 2 && (
        <BasicCaptions
          name="review captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Finish a hand. Tap Review. Understand the decision.",
              startMs: 300,
              endMs: 5100,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 3 && (
        <BasicCaptions
          name="retry captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Replay the same deal. Try a different decision.",
              startMs: 300,
              endMs: 5200,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 4 && (
        <BasicCaptions
          name="records captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Open your game records. Revisit every hand.",
              startMs: 300,
              endMs: 4800,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 5 && (
        <BasicCaptions
          name="calculator captions en"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "Choose your cards. Explore the odds.",
              startMs: 300,
              endMs: 4900,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 0 && (
        <BasicCaptions
          name="tutorial captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "跟着互动引导，轻松学会规则。",
              startMs: 300,
              endMs: 4300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 1 && (
        <BasicCaptions
          name="practice captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "每一步行动，本手动态实时记录。",
              startMs: 300,
              endMs: 4700,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 2 && (
        <BasicCaptions
          name="review captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "打完一手，点开复盘，理解决策。",
              startMs: 300,
              endMs: 5100,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 3 && (
        <BasicCaptions
          name="retry captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "重新打同一副牌，换一种决策。",
              startMs: 300,
              endMs: 5200,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 4 && (
        <BasicCaptions
          name="records captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "打开对局记录，随时回看每手详情。",
              startMs: 300,
              endMs: 4800,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 5 && (
        <BasicCaptions
          name="calculator captions zh-CN"
          width={apple ? 1320 : 1040}
          style={captionStyle}
          captions={[
            {
              text: "选好底牌和公共牌，看清胜率。",
              startMs: 300,
              endMs: 4900,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
    </div>
  );
};
// Only captured app pixels and explanatory overlays in the Apple variant.
const AppleView = ({ src, index }: { src: string; index: number }) => {
  const frame = useCurrentFrame();
  const y =
    index === 0
      ? 0.72
      : index === 1
        ? frame < 60
          ? 0.78
          : 0.7
        : index === 2
          ? frame < 48
            ? 0.78
            : frame < 84
              ? 0.24
              : 0.58
          : index === 3
            ? 0.76
            : index === 4
              ? frame < 36
                ? 0.2
                : frame < 84
                  ? 0.35
                  : 0.55
              : 0.42;
  return (
    <AbsoluteFill style={{ background: "#080e15" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 410,
          height: 886,
          overflow: "hidden",
        }}
      >
        <Footage src={src} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 414,
          top: 0,
          width: 1506,
          height: 886,
          overflow: "hidden",
          background: "#0b1017",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 1506,
            height: 3264,
            left: 0,
            top: interpolate(
              frame,
              [0, 25],
              [-Math.max(0, y * 3264 - 400) - 12, -Math.max(0, y * 3264 - 400)],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
            ),
          }}
        >
          <Footage src={src} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
const Shot = ({
  id,
  index,
  language,
  platform,
  presentation,
  narration,
}: FilmProps & { id: SceneId; index: number }) => {
  const apple = presentation === "apple",
    src = media(platform, language, id);
  return (
    <AbsoluteFill
      style={{ background: c.ink, fontFamily: typography, color: c.paper }}
    >
      {apple ? (
        <AppleView src={src} index={index} />
      ) : (
        <>
          <Backdrop />
          <div
            style={{
              position: "absolute",
              left: 118,
              top: 82,
              fontSize: 23,
              letterSpacing: 6,
              color: c.mint,
            }}
          >
            NOIR POKER
          </div>
          <div
            style={{ position: "absolute", left: 118, top: 225, width: 1010 }}
          >
            <Entrance>
              <div
                style={{
                  fontFamily: "Barlow",
                  fontSize: 28,
                  color: c.gold,
                  letterSpacing: 4,
                  marginBottom: 24,
                }}
              >
                {String(index + 1).padStart(2, "0")} /{" "}
                {language === "en"
                  ? "PRACTICE WITH PURPOSE"
                  : "让每次练习都有收获"}
              </div>
              <h1
                style={{
                  fontSize: language === "en" ? 96 : 94,
                  lineHeight: 1.14,
                  letterSpacing: -2.5,
                  fontWeight: 700,
                  whiteSpace: "pre-line",
                  margin: 0,
                }}
              >
                {headlines[language][index]}
              </h1>
              <div
                style={{
                  width: 72,
                  height: 3,
                  background: c.mint,
                  margin: "34px 0",
                }}
              />
              <p
                style={{
                  fontSize: 34,
                  lineHeight: 1.65,
                  whiteSpace: "pre-line",
                  margin: 0,
                  color: c.muted,
                }}
              >
                {details[language][index]}
              </p>
            </Entrance>
          </div>
          <div style={{ position: "absolute", left: 1275, top: 65 }}>
            <DeviceFrame width={438} height={950}>
              <Footage src={src} />
            </DeviceFrame>
          </div>
          <div
            style={{
              position: "absolute",
              left: 118,
              bottom: 42,
              fontSize: 17,
              letterSpacing: 2,
              color: "#91b2a5",
            }}
          >
            {language === "en"
              ? "OFFLINE PRACTICE · VIRTUAL CHIPS"
              : "离线练习 · 虚拟筹码"}
          </div>
        </>
      )}
      <CaptionLayer index={index} language={language} apple={apple} />
      {narration && (
        <Sequence from={9} name={`${id} neural voiceover`}>
          <Audio
            src={staticFile(`voice-v2/${language}/${id}.wav`)}
            volume={1}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
const Music = ({ narration }: { narration: boolean }) => {
  const frame = useCurrentFrame(),
    { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile("assets/background-music-mobile.m4a")}
      volume={interpolate(
        frame,
        [0, 25, durationInFrames - 45, durationInFrames],
        [0, narration ? 0.12 : 0.32, narration ? 0.12 : 0.32, 0],
        { extrapolateRight: "clamp" },
      )}
    />
  );
};
export const StoreFilm: React.FC<FilmProps> = (props) => {
  useFonts();
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="01 - Guided hands"
          durationInFrames={138}
        >
          <Shot {...props} id="tutorial" index={0} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 6 })}
        />
        <TransitionSeries.Sequence
          name="02 - Practice and live activity"
          durationInFrames={150}
        >
          <Shot {...props} id="practice" index={1} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 6 })}
        />
        <TransitionSeries.Sequence
          name="03 - Tap Review and read reasoning"
          durationInFrames={162}
        >
          <Shot {...props} id="review" index={2} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 6 })}
        />
        <TransitionSeries.Sequence
          name="04 - Tap Replay and choose differently"
          durationInFrames={165}
        >
          <Shot {...props} id="retry" index={3} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 6 })}
        />
        <TransitionSeries.Sequence
          name="05 - Records and hand details"
          durationInFrames={153}
        >
          <Shot {...props} id="records" index={4} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 6 })}
        />
        <TransitionSeries.Sequence
          name="06 - Odds calculator"
          durationInFrames={156}
        >
          <Shot {...props} id="calculator" index={5} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Music narration={props.narration} />
    </AbsoluteFill>
  );
};
