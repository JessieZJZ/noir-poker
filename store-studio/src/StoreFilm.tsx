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
import { fontsReady, palette as c, typography } from "./assets";
import plan from "./media-plan.json";

export type FilmProps = {
  language: "en" | "zh-CN";
  platform: "ios" | "android";
  presentation: "apple" | "google";
  narration: boolean;
};
type SceneId = "practice" | "tutorial" | "review" | "retry" | "calculator";
const headlines = {
  en: [
    "Your next decision\nstarts here.",
    "Learn at\nthe table.",
    "Understand\nthe decision.",
    "Same deal.\nAnother possibility.",
    "Explore\nthe odds.",
  ],
  "zh-CN": [
    "每一手，\n练习更好的判断。",
    "跟着实战，\n学会规则。",
    "看懂每次\n行动的理由。",
    "同一副牌，\n再试一种选择。",
    "看清胜率，\n让练习继续。",
  ],
};
const details = {
  en: [
    "Offline Hold’em practice.\nNo account needed.",
    "Four guided hands.\nThen one of your own.",
    "Public information.\nContext before results.",
    "Original cards and stacks.\nA different line to explore.",
    "Win, tie and outs.\nVirtual chips, no cash value.",
  ],
  "zh-CN": [
    "离线德州扑克练习\n无需登录，随时入座",
    "四手互动引导\n再独立完成一手牌",
    "结合行动前的公开信息\n理解选择与代价",
    "恢复原始牌局\n观察另一种打法",
    "获胜、平局与 Outs\n虚拟筹码，无现金价值",
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

const media = (platform: string, language: string, id: SceneId) => {
  const p = plan as unknown as Record<
    string,
    Record<string, Record<string, string>>
  >;
  return p[platform]?.[language]?.[id] || "assets/capture-in-progress.png";
};

export const Backdrop = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at 80% 35%, #24574b88 0%, transparent 52%), linear-gradient(135deg, ${c.ink}, #0c1a20 60%, #0a141a)`,
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
        cx="1500"
        cy="550"
        rx="700"
        ry="820"
        fill="none"
        stroke={c.mint}
        strokeWidth="1"
      />
      <ellipse
        cx="1500"
        cy="550"
        rx="650"
        ry="770"
        fill="none"
        stroke={c.mint}
        strokeWidth="1"
      />
      <path d="M0 940H1920M1350 0V1080" stroke={c.mint} strokeWidth="1" />
    </svg>
  </AbsoluteFill>
);

const Entrance = ({ children }: { children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [0, 15], [0, 1], {
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [0, 24], ["0px 25px", "0px 0px"], {
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {children}
    </div>
  );
};

const Footage = ({ src, apple }: { src: string; apple: boolean }) =>
  src.endsWith(".png") ? (
    <Img
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  ) : (
    <Video
      src={staticFile(src)}
      muted
      objectFit={apple ? "contain" : "cover"}
      style={{ width: "100%", height: "100%" }}
    />
  );

const CaptionLayer = ({
  index,
  language,
  apple,
}: {
  index: number;
  language: FilmProps["language"];
  apple: boolean;
}) => {
  const { width } = useVideoConfig();
  const captionStyle: React.CSSProperties = {
    position: "absolute",
    left: apple ? 60 : 145,
    top: apple ? (index === 4 ? 1500 : 170) : 880,
    fontFamily: typography,
    fontSize: apple ? 34 : 36,
    fontWeight: 600,
    lineHeight: 1.45,
  };
  return (
    <div className="noir-captions">
      <style>{`.noir-captions > div > div {font-family:Manrope,Noto,sans-serif!important;font-size:${apple ? 34 : 33}px!important;font-weight:600!important;line-height:1.45!important;background:rgba(8,14,21,.9)!important;border:1px solid #9de7cd35;border-radius:12px;padding:15px 22px!important;}`}</style>
      {language === "en" && index === 0 && (
        <BasicCaptions
          name="practice captions en"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "Your next decision starts here. Practice Hold’em offline.",
              startMs: 350,
              endMs: 5300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 1 && (
        <BasicCaptions
          name="tutorial captions en"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "Learn at the table, one guided hand at a time.",
              startMs: 350,
              endMs: 5300,
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
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "Review the reasoning behind each decision.",
              startMs: 350,
              endMs: 5300,
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
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "Replay the same deal. Explore another choice.",
              startMs: 350,
              endMs: 5300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "en" && index === 4 && (
        <BasicCaptions
          name="calculator captions en"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "Explore the odds. Virtual chips. No account needed.",
              startMs: 350,
              endMs: 5300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 0 && (
        <BasicCaptions
          name="practice captions zh-CN"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "每一手，练习更好的判断。离线德州扑克，随时开练。",
              startMs: 350,
              endMs: 5300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 1 && (
        <BasicCaptions
          name="tutorial captions zh-CN"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "跟着互动引导，在一手手实战中，学会规则。",
              startMs: 350,
              endMs: 5300,
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
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "回看关键决策，理解每次行动背后的理由。",
              startMs: 350,
              endMs: 5300,
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
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "重打同一副牌，探索另一种选择。",
              startMs: 350,
              endMs: 5300,
              timestampMs: null,
              confidence: null,
            },
          ]}
          combineTokensWithinMilliseconds={6000}
        />
      )}
      {language === "zh-CN" && index === 4 && (
        <BasicCaptions
          name="calculator captions zh-CN"
          width={apple ? width - 120 : 830}
          style={captionStyle}
          captions={[
            {
              text: "看清胜率，让练习继续。虚拟筹码，无需登录。",
              startMs: 350,
              endMs: 5300,
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

const Shot = ({
  id,
  index,
  language,
  platform,
  presentation,
  narration,
}: FilmProps & { id: SceneId; index: number }) => {
  const apple = presentation === "apple";
  const src = media(platform, language, id);
  return (
    <AbsoluteFill
      style={{ background: c.ink, fontFamily: typography, color: c.paper }}
    >
      {!apple && <Backdrop />}
      {apple ? (
        <AbsoluteFill>
          <Footage src={src} apple />
        </AbsoluteFill>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              left: 145,
              top: 105,
              fontSize: 24,
              letterSpacing: 6,
              color: c.mint,
            }}
          >
            NOIR POKER
          </div>
          <div
            style={{ position: "absolute", left: 145, top: 235, width: 940 }}
          >
            <Entrance>
              <div
                style={{
                  fontFamily: "Barlow",
                  fontSize: 30,
                  letterSpacing: 4,
                  color: c.gold,
                  marginBottom: 28,
                }}
              >
                {String(index + 1).padStart(2, "0")} /{" "}
                {language === "en"
                  ? "PRACTICE WITH PURPOSE"
                  : "让每次练习都有收获"}
              </div>
              <h1
                style={{
                  fontSize: language === "en" ? 90 : 83,
                  lineHeight: 1.12,
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
                  fontSize: 38,
                  lineHeight: 1.55,
                  whiteSpace: "pre-line",
                  margin: 0,
                  color: c.muted,
                }}
              >
                {details[language][index]}
              </p>
            </Entrance>
          </div>
          <div
            style={{
              position: "absolute",
              left: 1280,
              top: 70,
              width: 422,
              height: 922,
              borderRadius: 44,
              overflow: "hidden",
              border: "3px solid #4a70655c",
              boxShadow: "0 45px 85px #000a",
              background: "#0b1017",
            }}
          >
            <Footage src={src} apple={false} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 145,
              bottom: 70,
              fontSize: 22,
              letterSpacing: 2,
              color: "#91b2a5",
            }}
          >
            OFFLINE · VIRTUAL CHIPS · NOIR POKER
          </div>
        </>
      )}
      <CaptionLayer index={index} language={language} apple={apple} />
      {narration && (
        <Sequence from={9} name="Scene voiceover">
          <Audio src={staticFile(`voice/${language}/${id}.wav`)} volume={1} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const Music = ({ narration }: { narration: boolean }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile("assets/background-music-mobile.m4a")}
      volume={interpolate(
        frame,
        [0, 25, durationInFrames - 45, durationInFrames],
        [0, narration ? 0.16 : 0.36, narration ? 0.16 : 0.36, 0],
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
          name="01 - Offline practice"
          durationInFrames={180}
        >
          <Shot {...props} id="practice" index={0} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence
          name="02 - Guided hands"
          durationInFrames={180}
        >
          <Shot {...props} id="tutorial" index={1} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence
          name="03 - Decision review"
          durationInFrames={186}
        >
          <Shot {...props} id="review" index={2} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence
          name="04 - Replay the original deal"
          durationInFrames={180}
        >
          <Shot {...props} id="retry" index={3} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence
          name="05 - Odds and outs"
          durationInFrames={192}
        >
          <Shot {...props} id="calculator" index={4} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Music narration={props.narration} />
    </AbsoluteFill>
  );
};
