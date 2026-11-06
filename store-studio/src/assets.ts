import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const fontsReady = Promise.all([
  loadFont({ family: "Manrope", url: staticFile("assets/manrope.woff2") }),
  loadFont({ family: "Noto", url: staticFile("assets/noto-sans-sc.woff2") }),
  loadFont({
    family: "Barlow",
    url: staticFile("assets/barlow-condensed.woff2"),
  }),
]);

export const palette = {
  ink: "#080e15",
  felt: "#123d35",
  mint: "#9de7cd",
  paper: "#f2f4ea",
  muted: "#b1c6bd",
  gold: "#dfbd79",
};
export const typography = "Manrope, Noto, sans-serif";
