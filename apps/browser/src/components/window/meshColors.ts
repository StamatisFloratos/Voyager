import { luminance, mix, parseColor, toHex } from "../../lib/color";
import { NAVIGATION_MESH as mesh } from "./tokens";

const tones = [-0.085, 0.085, 0.11, -0.045, -0.035, 0.075];
const accentShares = [0.28, 0.82, 0.68, 0.36, 0.14, 0.18];

export function meshColors(background: string, samples: readonly string[]) {
  const rgb = samples.map(parseColor);
  const middle = [0, 1, 2].map((channel) => {
    const levels = rgb.map((color) => color[channel]!).sort((a, b) => a - b);
    return levels[Math.floor(levels.length / 2)] ?? 0;
  });
  const accents = samples.filter((_, index) => {
    const [r, g, b] = rgb[index]!;
    const distance = Math.abs(r - middle[0]!) + Math.abs(g - middle[1]!) + Math.abs(b - middle[2]!);
    return distance > 65 && Math.max(r, g, b) - Math.min(r, g, b) > 28;
  });
  const base = samples.length ? toHex(middle) : background;
  const spread = Math.min(1, accents.length / 3) * (luminance(base) > 0.75 ? 0.25 : 1);
  const fields = tones.map((tone, index) => {
    const first = samples[index * 2] ?? background;
    const second = samples[index * 2 + 1] ?? first;
    const local = mix(first, second, 0.5);
    const accent = accents.length ? accents[(index * 5 + 1) % accents.length]! : local;
    const share = 0.12 + (accentShares[index]! - 0.12) * spread;
    const color = mix(local, accent, share);
    return mix(color, tone < 0 ? mesh.shadow : mesh.light, Math.abs(tone));
  });
  return { base, fields };
}
