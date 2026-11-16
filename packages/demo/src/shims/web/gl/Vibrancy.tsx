import type { CSSProperties } from "react";
import type { WindowBackdropProps } from "@voyager-real/shaders";
import { displayP3 } from "./colors";
import { vibrancyStops } from "./material";
import sandTile from "./sand.png";

const fill: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

type Props = Pick<WindowBackdropProps, "tintColor" | "tintAlpha" | "tintLightness" | "themeColors" | "themeOpacity" | "themeGrain" | "themeTexture"> & {
  dark: boolean;
};

export function Vibrancy({ dark, tintColor, tintAlpha = 0.36, tintLightness = 0.25, themeColors, themeOpacity, themeGrain = 0, themeTexture }: Props) {
  if (themeTexture === "sand" && themeOpacity === 1 && themeColors?.length === 4 && themeColors[3] === 1) {
    const backgroundColor = `color(srgb ${themeColors.slice(0, 3).join(" ")})`;
    return (
      <div style={{ ...fill, backgroundColor }}>
        {themeGrain > 0 && <div style={{ ...fill, backgroundImage: `url(${sandTile})`, backgroundSize: "64px 64px", opacity: themeGrain }} />}
      </div>
    );
  }
  const [top, bottom] = vibrancyStops(dark, tintColor, tintAlpha, tintLightness);
  return <div style={{ ...fill, background: `linear-gradient(to bottom in display-p3, ${displayP3(top, 1)}, ${displayP3(bottom, 1)})` }} />;
}
