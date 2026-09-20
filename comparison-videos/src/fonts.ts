import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
export const fontsReady = Promise.all([
  loadFont({ family: "Noto Video", url: staticFile("fonts/noto-sc-400.woff2"), weight: "400" }),
  loadFont({ family: "Noto Video", url: staticFile("fonts/noto-sc-700.woff2"), weight: "700" }),
]);
