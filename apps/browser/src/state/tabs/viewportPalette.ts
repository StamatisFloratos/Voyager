const canvasColor = String.raw`() => {
  const root = document.documentElement;
  const scheme = root ? getComputedStyle(root).colorScheme.split(/\s+/) : [];
  const dark = scheme.includes("dark") && (!scheme.includes("light") || matchMedia("(prefers-color-scheme: dark)").matches);
  if (!document.body) {
    const hint = document.querySelector('meta[name="theme-color" i]')?.content.trim();
    if (/^#[0-9a-f]{6}$/i.test(hint || "")) {
      const channels = hint.slice(1).match(/../g).map(pair => parseInt(pair, 16));
      if (Math.max(...channels) - Math.min(...channels) >= 40) return hint.toLowerCase();
    }
  }
  let rgb = dark ? [18, 18, 18] : [255, 255, 255];
  for (const el of [root, document.body]) {
    if (!el) continue;
    const style = getComputedStyle(el);
    const fill = style.backgroundImage?.startsWith("linear-gradient(") || style.backgroundImage?.startsWith("radial-gradient(")
      ? style.backgroundImage.match(/rgba?\([\d.,\s]+\)/)?.[0] : null;
    const channels = /^rgba?\(([\d.,\s]+)\)$/.exec(fill ?? style.backgroundColor)?.[1].split(",").map(Number);
    if (channels) rgb = rgb.map((n, i) => n + (channels[i] - n) * (channels[3] ?? 1));
  }
  return "#" + rgb.map(n => Math.round(n).toString(16).padStart(2, "0")).join("");
}`;

export const viewportCanvasColor = `(${canvasColor})()`;

const sampleViewportPalette = String.raw`async idle => {
  const base = ${viewportCanvasColor};
  const colors = [];
  const root = document.documentElement;
  if (root && innerWidth && innerHeight) {
    const channelsOf = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const background = channelsOf(base);
    const colorCache = new Map();
    let colorInput;
    function cssColor(css) {
      if (colorCache.has(css)) return colorCache.get(css);
      const rgb = /^rgba?\(([\d.,\s]+)\)$/.exec(css);
      let channels;
      if (rgb) {
        channels = rgb[1].split(",").map(Number);
        if (channels.length === 3) channels.push(1);
      } else {
        if (!colorInput) {
          colorInput = document.createElement("input");
          colorInput.type = "color";
        }
        colorInput.value = css;
        const alpha = /\/\s*([\d.]+)(%)?\s*\)$/.exec(css);
        channels = [...channelsOf(colorInput.value), alpha ? Number(alpha[1]) / (alpha[2] ? 100 : 1) : 1];
      }
      colorCache.set(css, channels);
      return channels;
    }
    function over(pixel, color, opacity) {
      const alpha = color[3] * opacity;
      for (let i = 0; i < 3; ++i) pixel[i] += (color[i] - pixel[i]) * alpha;
    }
    const styles = new Map(), bounds = new Map(), vectorCells = [];
    const styleOf = el => {
      if (!styles.has(el)) styles.set(el, getComputedStyle(el));
      return styles.get(el);
    };
    function position(el, x, y) {
      if (!bounds.has(el)) bounds.set(el, el.getBoundingClientRect());
      const r = bounds.get(el);
      return [Math.max(0, Math.min(.999, (x-r.left)/(r.width || 1))), Math.max(0, Math.min(.999, (y-r.top)/(r.height || 1)))];
    }
    function gradient(image, u, v) {
      if (!image.includes("gradient(") || image.length > 1500) return;
      const stops = image.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]+\)/g);
      if (!stops || stops.length < 2) return;
      let t = v;
      if (image.includes("radial-gradient")) t = Math.hypot(u - .5, v - .5) * 1.5;
      else if (image.includes("to right")) t = u;
      else if (image.includes("to left")) t = 1-u;
      else {
        const angle = /gradient\(([-.\d]+)(deg|turn)/.exec(image);
        if (angle) {
          const a = Number(angle[1]) * Math.PI * (angle[2] === "turn" ? 2 : 1/180);
          t = .5 + (u-.5)*Math.sin(a) - (v-.5)*Math.cos(a);
        }
      }
      const offset = Math.max(0, Math.min(1, t)) * (stops.length - 1);
      const index = Math.min(Math.floor(offset), stops.length - 2);
      const from = cssColor(stops[index]), to = cssColor(stops[index + 1]);
      return from.map((channel, i) => channel + (to[i] - channel) * (offset - index));
    }
    const painted = !!performance.getEntriesByName?.("first-contentful-paint", "paint").length;
    const photoDeadline = Math.min(requestedAt + 50, performance.now() + Math.min(12, idle?.timeRemaining() ?? 12));
    const decoded = new Map();
    let swatch, ctx;
    async function photo(el, x, y) {
      const src = el.currentSrc;
      if (!el.complete || !el.naturalWidth || !el.naturalHeight || el.naturalWidth * el.naturalHeight > 1024 * 1024 ||
          !src || !src.startsWith(location.origin + "/") || /\.svg(?:[?#]|$)/i.test(src)) return;
      const remaining = photoDeadline - performance.now();
      if (remaining <= 0 || document.hidden || !el.isConnected) return;
      if (!decoded.has(el)) {
        let timer;
        try {
          const ready = el.decode().then(() => true, () => false);
          const expired = new Promise(resolve => { timer = setTimeout(resolve, remaining, false); });
          decoded.set(el, await Promise.race([ready, expired]) ? src : null);
        } finally { clearTimeout(timer); }
      }
      if (decoded.get(el) !== src || el.currentSrc !== src || performance.now() >= photoDeadline || !el.isConnected || document.hidden) return;
      if (!swatch) {
        swatch = document.createElement("canvas");
        swatch.width = swatch.height = 1;
        ctx = swatch.getContext("2d", { willReadFrequently: true });
      }
      if (!ctx) return;
      const [u, v] = position(el, x, y);
      try {
        ctx.clearRect(0, 0, 1, 1);
        ctx.drawImage(el, Math.floor(u * el.naturalWidth), Math.floor(v * el.naturalHeight), 1, 1, 0, 0, 1, 1);
        const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, alpha / 255];
      } catch {
        swatch.width = 1;
      }
    }
    function svgFill(image) {
      const comma = image.indexOf(",");
      const encoded = image.slice(comma + 1).replace(/["']?\)$/, "");
      try {
        const svg = image.slice(0, comma).includes(";base64") ? atob(encoded) : decodeURIComponent(encoded);
        for (const match of svg.matchAll(/\b(?:fill|stop-color)\s*=\s*["']#([\da-f]{3}|[\da-f]{6})["']/gi)) {
          const hex = match[1].length === 3 ? match[1].replace(/./g, c => c + c) : match[1];
          const channels = channelsOf("#" + hex);
          if (Math.max(...channels) - Math.min(...channels) > 64) return "#" + hex.toLowerCase();
        }
      } catch {}
    }
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const x = innerWidth * (col+.5)/4, y = innerHeight * (row+.5)/3;
      const pixel = background.slice();
      const stack = document.elementsFromPoint(x, y).slice(0, 7).reverse();
      for (const el of new Set([root, document.body, ...stack])) {
        if (!el || el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const s = styleOf(el);
        const opacity = Number(s.opacity);
        over(pixel, cssColor(s.backgroundColor), opacity);
        const image = s.backgroundImage;
        if (image.startsWith("linear-gradient") || image.startsWith("radial-gradient")) {
          const [u, v] = position(el, x, y);
          const fill = gradient(image, u, v);
          if (fill) over(pixel, fill, opacity);
        }
        if (el === stack.at(-1) && image.length <= 16384 && /^url\(["']?data:image\/svg\+xml[,;]/i.test(image)) {
          const [u, v] = position(el, x, y), rect = bounds.get(el);
          if (rect.width * rect.height >= innerWidth * innerHeight * .12 && Math.abs(u-.5) < .24 && Math.abs(v-.5) < .34) {
            vectorCells.push([colors.length, image]);
          }
        }
        if (painted && el.localName === "img") {
          const fill = await photo(el, x, y);
          if (fill) over(pixel, fill, opacity);
        }
      }
      colors.push("#" + pixel.map(n => Math.round(n).toString(16).padStart(2,"0")).join(""));
    }
    if (vectorCells.length) {
      const first = channelsOf(colors[0]);
      const uniform = colors.every(color => channelsOf(color).every((n, i) => Math.abs(n - first[i]) < 52));
      const fills = new Map();
      if (uniform) for (const [cell, image] of vectorCells) {
        if (!fills.has(image)) fills.set(image, svgFill(image));
        if (fills.get(image)) colors[cell] = fills.get(image);
      }
    }
  }
  post("result", JSON.stringify({ start: performance.timeOrigin, url: location.href, colors }));
}`;

export const viewportPaletteProbe = `
  const requestedAt = performance.now();
  const sample = ${sampleViewportPalette};
  if (typeof requestIdleCallback === "function") requestIdleCallback(sample);
  else sample();
`;
