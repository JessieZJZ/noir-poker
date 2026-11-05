import React from "react";
import { Composition, Folder, Still } from "remotion";
import { StoreFilm } from "./StoreFilm";
import { StoreStill } from "./StoreStill";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Apple-Preview">
      <Composition
        id="Apple-EN"
        component={StoreFilm}
        width={886}
        height={1920}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "en",
          platform: "ios",
          presentation: "apple",
          narration: true,
        }}
      />
      <Composition
        id="Apple-ZH"
        component={StoreFilm}
        width={886}
        height={1920}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "zh-CN",
          platform: "ios",
          presentation: "apple",
          narration: true,
        }}
      />
      <Composition
        id="Apple-EN-Music"
        component={StoreFilm}
        width={886}
        height={1920}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "en",
          platform: "ios",
          presentation: "apple",
          narration: false,
        }}
      />
      <Composition
        id="Apple-ZH-Music"
        component={StoreFilm}
        width={886}
        height={1920}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "zh-CN",
          platform: "ios",
          presentation: "apple",
          narration: false,
        }}
      />
    </Folder>
    <Folder name="Google-Play-Promo">
      <Composition
        id="Google-EN"
        component={StoreFilm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "en",
          platform: "android",
          presentation: "google",
          narration: true,
        }}
      />
      <Composition
        id="Google-ZH"
        component={StoreFilm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "zh-CN",
          platform: "android",
          presentation: "google",
          narration: true,
        }}
      />
      <Composition
        id="Google-EN-Music"
        component={StoreFilm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "en",
          platform: "android",
          presentation: "google",
          narration: false,
        }}
      />
      <Composition
        id="Google-ZH-Music"
        component={StoreFilm}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={870}
        defaultProps={{
          language: "zh-CN",
          platform: "android",
          presentation: "google",
          narration: false,
        }}
      />
    </Folder>
    <Folder name="Store-Screenshots">
      {(["en", "zh-CN"] as const).flatMap((language) =>
        (["ios", "android", "ipad"] as const).flatMap((platform) =>
          Array.from({ length: 6 }, (_, feature) => (
            <Still
              key={`${platform}-${language}-${feature}`}
              id={`Screen-${platform}-${language}-${feature + 1}`}
              component={StoreStill}
              width={
                platform === "ipad" ? 2752 : platform === "ios" ? 1290 : 1080
              }
              height={
                platform === "ipad" ? 2064 : platform === "ios" ? 2796 : 1920
              }
              defaultProps={{ language, platform, feature, kind: "screenshot" }}
            />
          )),
        ),
      )}
    </Folder>
    <Folder name="Feature-Graphics">
      <Still
        id="Feature-EN"
        component={StoreStill}
        width={1024}
        height={500}
        defaultProps={{
          language: "en",
          platform: "android",
          feature: 0,
          kind: "feature-graphic",
        }}
      />
      <Still
        id="Feature-ZH"
        component={StoreStill}
        width={1024}
        height={500}
        defaultProps={{
          language: "zh-CN",
          platform: "android",
          feature: 0,
          kind: "feature-graphic",
        }}
      />
    </Folder>
  </>
);
