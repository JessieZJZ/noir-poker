import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  delayRender,
  continueRender,
} from "remotion";
import { loadFont } from "@remotion/fonts";
import { Backdrop } from "./StoreFilm";
import { IPhoneFrame } from "./IPhoneFrame";
import { DeviceFrame } from "./DeviceFrame";
import { fontsReady, typography } from "./assets";
import copy from "../locales/catalog.json";
import media from "./locale-media.json";

type Locale = keyof typeof copy;
export type Format =
  | "phone"
  | "tablet7"
  | "tablet10"
  | "desktop"
  | "apple"
  | "ipad";
export const formats: Record<Format, [number, number]> = {
  phone: [1080, 1920],
  tablet7: [1920, 1080],
  tablet10: [1920, 1080],
  desktop: [1920, 1080],
  apple: [1290, 2796],
  ipad: [2752, 2064],
};
const keys = [
  "01-practice",
  "02-tutorial",
  "03-review-top",
  "04-result",
  "05-calculator",
  "06-styles",
  "07-records",
  "07-record-detail",
];
const native = (locale: string, format: Format, n: number) => {
  const m = media as unknown as Record<
    string,
    Record<string, Record<string, string>>
  >;
  const target = format === "apple" ? "ios" : format;
  return m[locale]?.[target]?.[keys[n]] || "assets/capture-in-progress.png";
};
const family = (locale: string) =>
  locale === "ko"
    ? "Manrope, NotoKR, Noto, StoreSC, StoreKR, sans-serif"
    : typography.replace(", sans-serif", ", StoreSC, StoreKR, sans-serif");
const ready = Promise.all([
  fontsReady,
  loadFont({
    family: "StoreSC",
    url: staticFile("assets/store-extra-sc.woff2"),
  }),
  loadFont({
    family: "StoreKR",
    url: staticFile("assets/store-extra-kr.woff2"),
  }),
  loadFont({ family: "NotoKR", url: staticFile("assets/noto-sans-kr.woff2") }),
]);
const useReady = () => {
  const [ok, set] = React.useState(false),
    [h] = React.useState(() => delayRender("Local language fonts"));
  React.useEffect(() => {
    ready.then(() => {
      set(true);
      continueRender(h);
    });
  }, [h]);
  return ok;
};
const fit = (
  text: string,
  size: number,
  width: number,
  locale: string,
  weight = 700,
) => {
  if (typeof document === "undefined") return size;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return size;
  ctx.font = weight + " " + size + "px " + family(locale);
  const max = Math.max(
    ...text.split("\n").map((line) => ctx.measureText(line).width),
  );
  return Math.min(size, (size * width) / Math.max(1, max));
};
const Picture = ({ src }: { src: string }) => (
  <Img
    src={staticFile(src)}
    style={{ width: "100%", height: "100%", objectFit: "contain" }}
  />
);
export const FilmPanel = ({
  locale,
  scene,
}: {
  locale: Locale;
  scene: number;
}) => {
  useReady();
  const c = copy[locale];
  return (
    <AbsoluteFill style={{ fontFamily: family(locale), color: "#f2f4ea" }}>
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
      <div style={{ position: "absolute", left: 118, top: 199, width: 1060 }}>
        <div
          style={{
            fontSize: fit(c.ribbon, 27, 940, locale, 650),
            fontWeight: 650,
            letterSpacing: 2.6,
            color: "#dfbd79",
            marginBottom: 29,
          }}
        >
          {String(scene + 1).padStart(2, "0")} / {c.ribbon}
        </div>
        <h1
          style={{
            fontSize: fit(c.head[scene], 94, 1060, locale),
            lineHeight: 1.14,
            letterSpacing: -2.5,
            fontWeight: 700,
            whiteSpace: "pre-line",
            margin: 0,
          }}
        >
          {c.head[scene]}
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
            fontSize: fit(c.lead[scene], 34, 1050, locale, 400),
            lineHeight: 1.65,
            whiteSpace: "pre-line",
            color: "#b1c6bd",
          }}
        >
          {c.lead[scene]}
        </div>
      </div>
      <div style={{ position: "absolute", left: 1285, top: 32 }}>
        <IPhoneFrame width={390} height={822}>
          <div />
        </IPhoneFrame>
      </div>
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 737,
          width: 1050,
          color: "#e7efe7",
          fontSize: fit(c.say[scene], 31, 1000, locale, 400),
          lineHeight: 1.45,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span
          style={{ width: 3, height: 30, flexShrink: 0, background: "#9de7cd" }}
        />
        <span>{c.say[scene]}</span>
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
        {c.footer}
      </div>
    </AbsoluteFill>
  );
};
export const PosterCell = ({
  locale,
  format,
  index,
}: {
  locale: Locale;
  format: Format;
  index: number;
}) => {
  useReady();
  const c = copy[locale],
    [w, h] = formats[format],
    phone = format === "phone" || format === "apple",
    ipad = format === "ipad";
  const s = w / 1290,
    card = c.cards[index],
    src = native(locale, format, index);
  return (
    <AbsoluteFill
      style={{
        fontFamily: family(locale),
        color: "#f2f4ea",
        overflow: "hidden",
      }}
    >
      <Backdrop />
      {phone ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 82 * s,
              top: 90 * s,
              right: 82 * s,
              fontSize: 25 * s,
              letterSpacing: 5 * s,
              display: "flex",
              justifyContent: "space-between",
              color: "#9de7cd",
            }}
          >
            <span>NOIR POKER</span>
            <span style={{ color: "#dfbd79" }}>
              {String(index + 1).padStart(2, "0")} / 08
            </span>
          </div>
          <h1
            style={{
              position: "absolute",
              left: 82 * s,
              top: 190 * s,
              margin: 0,
              fontSize: fit(card[0], 101 * s, w - 164 * s, locale),
              lineHeight: 1.12,
              letterSpacing: -3 * s,
              whiteSpace: "pre-line",
            }}
          >
            {card[0]}
          </h1>
          <div
            style={{
              position: "absolute",
              left: 86 * s,
              top: 452 * s,
              width: w - 172 * s,
              fontSize: fit(card[1], 34 * s, w - 172 * s, locale, 400),
              lineHeight: 1.5,
              color: "#b1c6bd",
            }}
          >
            {card[1]}
          </div>
          <div
            style={{
              position: "absolute",
              left: 86 * s,
              top: 548 * s,
              width: 62 * s,
              height: 3 * s,
              background: "#9de7cd",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 640 * s,
              left: (w - ((h - 770 * s) * 394) / 830) / 2,
            }}
          >
            <IPhoneFrame
              width={((h - 770 * s) * 394) / 830}
              height={h - 770 * s}
            >
              <Picture src={src} />
            </IPhoneFrame>
          </div>
          <div
            style={{
              position: "absolute",
              left: 82 * s,
              bottom: 58 * s,
              fontSize: 19 * s,
              color: "#91b2a5",
              letterSpacing: 1.1 * s,
            }}
          >
            {c.footer}
          </div>
        </>
      ) : ipad ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 125,
              top: 140,
              fontSize: 32,
              letterSpacing: 7,
              color: "#9de7cd",
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
              color: "#dfbd79",
            }}
          >
            {String(index + 1).padStart(2, "0")} / 08
          </div>
          <h1
            style={{
              position: "absolute",
              left: 125,
              top: 490,
              width: 1110,
              fontSize: fit(card[0], 110, 1110, locale),
              lineHeight: 1.18,
              letterSpacing: -3,
              whiteSpace: "pre-line",
              margin: 0,
            }}
          >
            {card[0]}
          </h1>
          <div
            style={{
              position: "absolute",
              left: 125,
              top: 980,
              width: 1080,
              fontSize: fit(card[1], 43, 1080, locale, 400),
              lineHeight: 1.7,
              color: "#b1c6bd",
            }}
          >
            {card[1]}
          </div>
          <div style={{ position: "absolute", left: 1320, top: 170 }}>
            <DeviceFrame width={1290} height={1720} tablet>
              <Picture src={src} />
            </DeviceFrame>
          </div>
          <div
            style={{
              position: "absolute",
              left: 125,
              bottom: 140,
              fontSize: 27,
              color: "#91b2a5",
            }}
          >
            {c.footer}
          </div>
        </>
      ) : format === "desktop" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 118,
              top: 35,
              fontSize: 24,
              letterSpacing: 5,
              color: "#9de7cd",
            }}
          >
            NOIR POKER
          </div>
          <div
            style={{
              position: "absolute",
              left: 620,
              top: 24,
              width: 1160,
              textAlign: "right",
              fontSize: fit(card[0].replace(/\n/g, " "), 41, 1160, locale),
              fontWeight: 700,
            }}
          >
            {card[0].replace(/\n/g, " ")}
          </div>
          <div
            style={{
              position: "absolute",
              left: 119,
              top: 92,
              width: 1682,
              height: 958,
              padding: 10,
              boxSizing: "border-box",
              background:
                "linear-gradient(130deg,#69716e,#131b1b 20%,#1d2926 80%,#6d7972)",
              borderRadius: 19,
              boxShadow: "0 20px 45px #0009",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#070e15",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <Picture src={src} />
            </div>
          </div>
        </>
      ) : (
        <>
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
            style={{ position: "absolute", left: 118, top: 224, width: 575 }}
          >
            <div style={{ fontSize: 28, color: "#dfbd79", marginBottom: 28 }}>
              {String(index + 1).padStart(2, "0")} / 08
            </div>
            <h1
              style={{
                fontSize: fit(card[0], 80, 575, locale),
                lineHeight: 1.2,
                whiteSpace: "pre-line",
                margin: 0,
                letterSpacing: -2,
              }}
            >
              {card[0]}
            </h1>
            <div
              style={{
                width: 70,
                height: 3,
                background: "#9de7cd",
                margin: "32px 0",
              }}
            />
            <div
              style={{
                fontSize: fit(card[1], 30, 575, locale, 400),
                lineHeight: 1.65,
                color: "#b1c6bd",
              }}
            >
              {card[1]}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 740,
              top: 174,
              width: 1092,
              height: 697,
              padding: 16,
              boxSizing: "border-box",
              borderRadius: 34,
              background:
                "linear-gradient(125deg,#737c78,#121b1b 20%,#1a2323 80%,#718078)",
              boxShadow: "0 30px 55px #0009",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 20,
                overflow: "hidden",
                background: "#060b10",
              }}
            >
              <Picture src={src} />
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 118,
              bottom: 42,
              fontSize: 18,
              color: "#91b2a5",
              letterSpacing: 1.4,
            }}
          >
            {c.footer}
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
export const PosterSheet = ({
  locale,
  format,
}: {
  locale: Locale;
  format: Format;
}) => {
  const [w, h] = formats[format];
  return (
    <AbsoluteFill>
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: (index % 2) * w,
            top: Math.floor(index / 2) * h,
            width: w,
            height: h,
          }}
        >
          <PosterCell locale={locale} format={format} index={index} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
export const Feature = ({ locale }: { locale: Locale }) => {
  useReady();
  const c = copy[locale];
  return (
    <AbsoluteFill style={{ fontFamily: family(locale), color: "#f2f4ea" }}>
      <Backdrop />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 72,
          fontSize: 14,
          letterSpacing: 3.5,
          color: "#9de7cd",
        }}
      >
        NOIR POKER
      </div>
      <h1
        style={{
          position: "absolute",
          left: 70,
          top: 122,
          width: 590,
          fontSize: fit(c.feature, 51, 590, locale),
          lineHeight: 1.2,
          letterSpacing: -1.4,
          whiteSpace: "pre-line",
          margin: 0,
        }}
      >
        {c.feature}
      </h1>
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 281,
          width: 48,
          height: 2,
          background: "#dfbd79",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 327,
          width: 590,
          fontSize: fit(c.tag, 20, 590, locale, 400),
          color: "#b1c6bd",
        }}
      >
        {c.tag}
      </div>
      <div style={{ position: "absolute", left: 690, top: 55 }}>
        <IPhoneFrame width={236} height={510}>
          <Picture src={native(locale, "phone", 0)} />
        </IPhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
