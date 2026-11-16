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
  let samples = 0, posted;
  const document = {
    documentElement: root, body,
    createElement(name) { assert.fail(`Unexpected ${name} in CSS-only sampling`); },
    elementsFromPoint(x, y) {
      samples++;
      const col = Math.floor(x / 250), row = Math.floor(y / 200);
      return [panel(`rgb(${col * 50}, ${row * 60}, 140)`), body, root];
    },
  };
  runInNewContext(viewportPaletteProbe, {
    document, innerWidth: 1000, innerHeight: 600, location: { href: "https://site.test/" },
    performance: { now: () => 0, timeOrigin: 7 }, getComputedStyle: el => el, post(_key, data) { posted = JSON.parse(data); },
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
  let accentRow = false, result;
  const document = {
    documentElement: backing, body: backing,
    createElement(name) { assert.fail(`Unexpected ${name} in SVG sampling`); },
    elementsFromPoint: (_, y) => y < 360 ? [logo, backing] : accentRow ? [panel("rgb(255, 150, 0)"), backing] : [backing],
  };
  const sample = () => {
    runInNewContext(viewportPaletteProbe, {
      document, innerWidth: 900, innerHeight: 720, location: { href: "https://test.local" },
      performance: { now: () => 0, timeOrigin: 1, getEntriesByName: () => [{ startTime: 10 }] }, getComputedStyle: el => el, post: (_, json) => result = JSON.parse(json),
    });
    return result.colors;
  };
  assert.deepEqual(sample().slice(0, 4), ["#3b007a", "#00ff00", "#00ff00", "#3b007a"]);
  accentRow = true;
  assert.deepEqual(sample().slice(0, 4), Array(4).fill("#3b007a"));
});

test("gradient and translucent layers retain their spatial colors without a drawing surface", async () => {
  const body = panel("rgb(255, 255, 255)"), gradient = panel("rgba(0, 0, 0, 0)"), glaze = panel("rgba(0, 0, 255, 0.5)");
  gradient.backgroundImage = "linear-gradient(to right, rgb(255, 0, 0), rgb(0, 255, 0))";
  gradient.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
  glaze.opacity = "0.5";
  let result;
  await runInNewContext(viewportPaletteProbe, {
    document: {
      documentElement: body, body, elementsFromPoint: () => [glaze, gradient, body],
      createElement(name) { assert.fail(`Unexpected ${name} for CSS gradients`); },
    },
    location: { href: "https://test.local/" }, innerWidth: 400, innerHeight: 300, getComputedStyle: el => el,
    performance: { now: () => 0, timeOrigin: 7, getEntriesByName: () => [{ startTime: 10 }] }, post: (_, json) => result = JSON.parse(json),
  });
  assert.deepEqual(result.colors.slice(0, 4), ["#a71840", "#784840", "#487840", "#18a740"]);
});

test("photo pixels are read only after contentful paint and a successful decode of an eligible visible image", async () => {
  const body = panel("rgb(255, 255, 255)");
  const location = { origin: "https://test.local", href: "https://test.local/page" };
  let canvases = 0, decodes = 0, pixels = 0, loaded = false;
  const attrs = {
    ...panel("rgba(0, 0, 0, 0)"), localName: "img", complete: true, isConnected: true,
    naturalWidth: 300, naturalHeight: 200, currentSrc: location.origin + "/coast.jpg",
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    async decode() { decodes++; if (!loaded) throw Error("unavailable image"); },
  };
  const read = async (painted, overrides = {}) => {
    const img = { ...attrs, ...overrides };
    const ctx = {
      clearRect() {}, drawImage(source) { assert.equal(source, img); },
      getImageData() { pixels++; return { data: [215, 55, 35, 255] }; },
    };
    let result;
    await runInNewContext(viewportPaletteProbe, {
      document: {
        documentElement: body, body, elementsFromPoint: () => [img, body],
        createElement(name) { assert.equal(name, "canvas"); canvases++; return { getContext: () => ctx }; },
      },
      innerWidth: 400, innerHeight: 300, getComputedStyle: el => el, location, setTimeout, clearTimeout,
      performance: { now: () => 0, timeOrigin: 7, getEntriesByName: () => painted ? [{ startTime: 10 }] : [] },
      post: (_, json) => result = JSON.parse(json),
    });
    return result.colors;
  };
  assert.deepEqual(await read(false), Array(12).fill("#ffffff"));
  for (const overrides of [
    { complete: false }, { naturalWidth: 0 }, { naturalHeight: 4000, naturalWidth: 4000 },
    { currentSrc: "https://elsewhere.test/image.jpg" }, { currentSrc: location.origin + "/badge.svg?cache" },
  ]) assert.deepEqual(await read(true, overrides), Array(12).fill("#ffffff"));
  assert.deepEqual([canvases, decodes, pixels], [0, 0, 0]);
  assert.deepEqual(await read(true), Array(12).fill("#ffffff"));
  assert.deepEqual([canvases, decodes, pixels], [0, 1, 0]);
  let finishDecode;
  const slow = read(true, { decode: () => new Promise(resolve => { finishDecode = resolve; }) });
  assert.deepEqual(await slow, Array(12).fill("#ffffff"));
  finishDecode();
  await Promise.resolve();
  assert.deepEqual([canvases, pixels], [0, 0]);
  loaded = true;
  assert.deepEqual(await read(true), Array(12).fill("#d73723"));
  assert.deepEqual([canvases, decodes, pixels], [1, 2, 12]);
});
