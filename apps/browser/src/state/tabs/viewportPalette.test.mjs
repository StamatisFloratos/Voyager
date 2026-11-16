import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { viewportCanvasColor, viewportPaletteProbe } from "./viewportPalette.ts";

const panel = (backgroundColor, colorScheme = "normal") => ({
  backgroundColor, colorScheme, backgroundImage: "none", localName: "section", opacity: "1",
});

test("the document canvas preserves an implicitly white page on a dark desktop", () => {
  const root = panel("rgba(0, 0, 0, 0)");
  const body = panel("rgba(0, 0, 0, 0)");
  const document = { documentElement: root, body };
  const context = { document, getComputedStyle: el => el, matchMedia: () => ({ matches: true }) };
  assert.equal(runInNewContext(viewportCanvasColor, context), "#ffffff");
  root.colorScheme = "dark";
  assert.equal(runInNewContext(viewportCanvasColor, context), "#121212");
  body.backgroundColor = "rgb(255, 255, 255)";
  assert.equal(runInNewContext(viewportCanvasColor, context), "#ffffff");
});

test("the palette returns all twelve spatial samples, including every edge quadrant", () => {
  const root = panel("rgb(255, 255, 255)");
  const body = panel("rgba(0, 0, 0, 0)");
  let pixel = [255,255,255], samples = 0, posted;
  const ctx = {
    fillStyle: "", globalAlpha: 1,
    fillRect() {
      const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(this.fillStyle);
      if (m) pixel = m.slice(1).map(Number);
    },
    getImageData() { return { data: [...pixel,255] }; },
  };
  const document = {
    documentElement: root, body,
    createElement(name) { assert.equal(name, "canvas"); return { getContext() { return ctx; } }; },
    elementsFromPoint(x, y) {
      samples++;
      const col = Math.floor(x / 250), row = Math.floor(y / 200);
      return [panel(`rgb(${col * 50}, ${row * 60}, 140)`), body, root];
    },
  };
  runInNewContext(viewportPaletteProbe, {
    document, innerWidth: 1000, innerHeight: 600, location: { href: "https://site.test/" },
    performance: { timeOrigin: 7 }, getComputedStyle: el => el, post(_key, data) { posted = JSON.parse(data); },
  });
  assert.equal(samples, 12);
  assert.deepEqual(posted, {
    url: "https://site.test/", start: 7,
    colors: ["#00008c", "#32008c", "#64008c", "#96008c", "#003c8c", "#323c8c", "#643c8c", "#963c8c", "#00788c", "#32788c", "#64788c", "#96788c"],
  });
});

test("an unstyled document uses its chromatic head hint and then the visible CSS canvas", () => {
  const root = panel("rgba(0, 0, 0, 0)");
  const meta = { content: "#600090" };
  const document = { documentElement: root, body: null, querySelector: () => meta };
  const context = { document, getComputedStyle: el => el };
  assert.equal(runInNewContext(viewportCanvasColor, context), "#600090");
  meta.content = "#000000";
  assert.equal(runInNewContext(viewportCanvasColor, context), "#ffffff");
  document.body = panel("rgba(0, 0, 0, 0)");
  document.body.backgroundImage = "linear-gradient(rgb(75, 0, 130), rgb(0, 0, 128))";
  assert.equal(runInNewContext(viewportCanvasColor, context), "#4b0082");
});

test("a large inline SVG contributes an authored hue only to its central cells on an otherwise flat canvas", () => {
  const backing = panel("rgb(59, 0, 122)"), logo = panel("rgba(0, 0, 0, 0)");
  const fill = "<svg><defs><stop stop-color='#fff'/></defs><path fill='#0f0'/></svg>";
  logo.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(fill) + '")';
  logo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 360 });
  let accentRow = false, result, pixel;
  const ctx = {
    fillStyle: "", fillRect() { const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(this.fillStyle); if (rgb) pixel = rgb.slice(1).map(Number); },
    getImageData: () => ({ data: [...pixel, 255] }),
  };
  const document = {
    documentElement: backing, body: backing, createElement: () => ({ getContext: () => ctx }),
    elementsFromPoint: (_, y) => y < 360 ? [logo, backing] : accentRow ? [panel("rgb(255, 150, 0)"), backing] : [backing],
  };
  const sample = () => {
    runInNewContext(viewportPaletteProbe, {
      document, innerWidth: 900, innerHeight: 720, location: { href: "https://test.local" },
      performance: { timeOrigin: 1 }, getComputedStyle: el => el, post: (_, json) => result = JSON.parse(json),
    });
    return result.colors;
  };
  assert.deepEqual(sample().slice(0, 4), ["#3b007a", "#00ff00", "#00ff00", "#3b007a"]);
  accentRow = true;
  assert.deepEqual(sample().slice(0, 4), Array(4).fill("#3b007a"));
});
