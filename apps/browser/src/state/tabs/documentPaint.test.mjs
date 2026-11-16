import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { viewportProbe } from "./documentPaint.ts";

const rect = (left = 0, top = 0, width = 1000, height = 600) => ({ left, top, width, height, right: left + width, bottom: top + height });
function element(localName, data = {}) {
  return {
    localName, backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", colorScheme: "normal",
    pointerEvents: "auto", opacity: "1", namespaceURI: "http://www.w3.org/1999/xhtml",
    checkVisibility() { return true; }, contains(el) { return el === this; }, hasAttribute() { return false; },
    getBoundingClientRect: () => rect(), ...data,
  };
}

function viewport({ paint = true, paintTiming = true, text = true } = {}) {
  const root = element("html"), body = element("body");
  const resources = new Set(), videos = [];
  const paints = new Map(paint ? [["first-contentful-paint", 80]] : []);
  let probes = 0;
  const document = {
    documentElement: root, body, images: [],
    elementsFromPoint: () => [body, root], getElementsByTagName: () => videos,
    createTreeWalker() {
      const words = { parentElement: body, nodeValue: "Page content", nodeType: 3 };
      let next = text ? words : null;
      return { nextNode() { const result = next; next = null; return result; } };
    },
    createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => rect(40, 10, 160, 32) }),
  };
  function sample(onReport = () => {}, scheduleFrame = setImmediate) {
    let result;
    runInNewContext(viewportProbe, {
      document, innerWidth: 1000, innerHeight: 600, location: { href: "https://site.test/", origin: "https://site.test" },
      getComputedStyle: el => el, requestAnimationFrame: scheduleFrame, setTimeout, PerformanceObserver: { supportedEntryTypes: paintTiming ? ["paint"] : [] },
      performance: { timeOrigin: 3000, getEntriesByName: (key, type) => {
        if (type === "paint") return paints.has(key) ? [{ startTime: paints.get(key) }] : [];
        return resources.has(key) ? [{}] : [];
      } }, post(k, value) { probes++; result = JSON.parse(value); onReport(result); },
    });
    return result;
  }
  return { document, resources, videos, root, body, paints, sample, get reports() { return probes; } };
}

test("a readable cached document is ready on the first evaluation while parsing continues", () => {
  const page = viewport();
  assert.deepEqual(page.sample(), { start: 3000, url: "https://site.test/", ready: true, painted: true, fcp: 80, reason: "ready", background: "#ffffff" });
  assert.equal(page.reports, 1);
  assert.equal(viewport({ paint: false }).sample().reason, "paint");
  assert.equal(viewport({ paint: false, paintTiming: false }).sample().ready, true);
  assert.equal(viewport({ text: false }).sample().reason, "content");
});

test("cover admission distinguishes a pending unpainted frame from an already exposed partial page", () => {
  const empty = viewport({ paint: false });
  assert.equal(empty.sample().painted, false);
  empty.paints.set("first-paint", 65);
  assert.equal(empty.sample().painted, true);
  assert.equal(empty.sample().ready, false);
  for (const paintTiming of [true, false]) {
    const page = viewport({ paint: paintTiming, paintTiming });
    const image = element("img", { currentSrc: "https://site.test/hero", complete: false, naturalWidth: 0 });
    page.document.elementsFromPoint = () => [image, page.body, page.root];
    const result = page.sample();
    assert.equal(result.reason, "hero");
    assert.equal(result.painted, true);
  }
});

test("a defining image waits only until its pixels are available", () => {
  const page = viewport();
  const image = element("img", { currentSrc: "https://site.test/hero", complete: false, naturalWidth: 0 });
  page.document.elementsFromPoint = () => [image, page.body, page.root];
  assert.equal(page.sample().reason, "hero");
  image.complete = true;
  image.naturalWidth = 1280;
  assert.equal(page.sample().ready, true);
});

test("one pending tile or below-fold transfer does not hold an otherwise usable gallery", () => {
  const page = viewport();
  const loaded = element("img", { complete: true, naturalWidth: 180 });
  const slow = element("img", { complete: false, getBoundingClientRect: () => rect(60, 0, 190, 150) });
  const below = element("img", { complete: false, pointerEvents: "none", getBoundingClientRect: () => rect(0, 1200) });
  page.document.images = [slow, loaded, below];
  page.document.elementsFromPoint = (x, y) => [x < 200 && y < 100 ? slow : loaded, page.body, page.root];
  assert.equal(page.sample().ready, true);
});

test("a mostly incomplete grid becomes usable while individual tiles continue loading", () => {
  const page = viewport();
  const tiles = Array.from({length: 9}, () => element("img", { complete: false }));
  page.document.elementsFromPoint = (x, y) => [tiles[Math.floor(y/200) * 3 + Math.floor(x/334)], page.body, page.root];
  assert.equal(page.sample().reason, "media");
  for (const tile of tiles.slice(0, 3)) Object.assign(tile, { complete: true, naturalWidth: 180 });
  assert.equal(page.sample().ready, true);
});

test("a pointer-transparent hero is usable with either its poster or a decoded video frame", () => {
  const page = viewport();
  const video = element("video", { readyState: 0, poster: "https://site.test/poster", autoplay: true, pointerEvents: "none" });
  page.videos.push(video);
  page.body.contains = el => el === video;
  page.document.elementsFromPoint = () => [element("h1"), page.body, page.root];
  assert.equal(page.sample().reason, "hero");
  page.resources.add(video.poster);
  assert.equal(page.sample().ready, true);
  page.resources.clear();
  video.readyState = 2;
  assert.equal(page.sample().ready, true);
  video.readyState = 0;
  const modal = element("div", { backgroundColor: "rgb(255, 255, 255)" });
  page.document.elementsFromPoint = () => [modal, page.body, page.root];
  assert.equal(page.sample().ready, true);
});

test("a visible CSS hero is tracked without waiting for unrelated requests", () => {
  const page = viewport();
  const url = "https://site.test/hero.webp";
  const hero = element("section", { backgroundImage: 'url("' + url + '")' });
  page.document.elementsFromPoint = () => [hero, page.body, page.root];
  assert.equal(page.sample().reason, "media");
  page.resources.add(url);
  assert.equal(page.sample().ready, true);
});

test("blank, unavailable and on-demand media cannot hold visible text", () => {
  const page = viewport();
  for (const media of [
    element("img", { complete: true, naturalWidth: 0 }),
    element("video", { readyState: 0, autoplay: false, poster: "", controls: true }),
    element("video", { readyState: 0, error: {}, autoplay: true }),
  ]) {
    page.document.elementsFromPoint = () => [media, page.body, page.root];
    assert.equal(page.sample().ready, true);
  }
});

test("an inline SVG texture with its own url(#filter) never masks the underlying hero", () => {
  const page = viewport();
  const texture = element("section", { backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' filter='url(%23n)'/%3E")` });
  const hero = element("img", { complete: false, naturalWidth: 0 });
  page.document.elementsFromPoint = () => [texture, hero, page.body, page.root];
  assert.equal(page.sample().reason, "hero");
  hero.complete = true;
  hero.naturalWidth = 1536;
  assert.equal(page.sample().ready, true);
  texture.backgroundImage += ', url("https://site.test/welcome.webp")';
  page.document.elementsFromPoint = () => [texture, page.body, page.root];
  assert.equal(page.sample().reason, "media");
  page.resources.add("https://site.test/welcome.webp");
  assert.equal(page.sample().ready, true);
});

test("small visible gallery thumbnails count as usable content between grid points", () => {
  const page = viewport({ text: false });
  const image = element("img", { complete: true, naturalWidth: 360, getBoundingClientRect: () => rect(250, 230, 210, 85) });
  page.document.images = [image];
  page.document.elementsFromPoint = (x, y) => [x > 250 && x < 460 && y > 230 && y < 315 ? image : page.body, page.root];
  assert.equal(page.sample().ready, true);
});

test("a row of lazy image links waits for visible artwork even when viewport points hit gaps", () => {
  const page = viewport();
  const cards = Array.from({ length: 5 }, (_, index) => {
    const x = 40 + index * 185;
    const img = element("img", {
      currentSrc: "", complete: true, naturalWidth: 0, naturalHeight: 0, painted: false,
      hasAttribute: name => name === "data-src",
      checkVisibility() { return this.painted; },
      getBoundingClientRect() { return rect(x, 300, 144, this.painted ? 144 : [8, 22, 24, 21, 26][index]); },
    });
    const link = element("a", {
      hasAttribute: name => name === "href", querySelector: () => img, closest: () => null,
      getBoundingClientRect: () => rect(x, 300, 144, 180),
    });
    return { img, link };
  });
  const links = cards.map(card => card.link);
  const row = element("section", {
    firstElementChild: links[0], getBoundingClientRect: () => rect(0, 230, 1000, 320),
    getElementsByTagName: () => links,
  });
  const header = element("section", {
    firstElementChild: element("h1"), getBoundingClientRect: () => rect(0, 0, 1000, 160),
    getElementsByTagName: () => [],
  });
  const main = element("main", {
    firstElementChild: header, children: [header, row],
    getBoundingClientRect: () => rect(0, 0, 1000, 1700),
  });
  page.document.images = cards.map(card => card.img);
  page.document.elementsFromPoint = () => [header, main, page.body];
  page.document.elementFromPoint = x => links.find(link => {
    const r = link.getBoundingClientRect();
    return x >= r.left && x < r.right;
  });
  assert.equal(page.sample().reason, "gallery");
  for (const { img } of cards.slice(0, 3)) Object.assign(img, { currentSrc: "https://site.test/art", naturalWidth: 150, naturalHeight: 150 });
  assert.equal(page.sample().reason, "gallery");
  for (const { img } of cards.slice(0, 3)) img.painted = true;
  assert.equal(page.sample().ready, true);
  for (const { img } of cards) Object.assign(img, { currentSrc: "https://site.test/broken", naturalWidth: 0, naturalHeight: 0 });
  assert.equal(page.sample().ready, true);
});

test("small supplementary thumbnails do not hold an already readable article", () => {
  const page = viewport();
  const images = [], links = [];
  for (let index = 0; index < 3; index++) {
    const x = 20 + index * 80;
    const img = element("img", { complete: false, getBoundingClientRect: () => rect(x, 460, 64, 64) });
    images.push(img);
    links.push(element("a", {
      hasAttribute: name => name === "href", querySelector: () => img, closest: () => null,
      getBoundingClientRect: () => rect(x, 460, 64, 84),
    }));
  }
  const article = element("article", { firstElementChild: links[0], getElementsByTagName: () => links });
  page.document.images = images;
  page.document.elementsFromPoint = () => [article, page.body];
  page.document.elementFromPoint = x => links.find(link => {
    const r = link.getBoundingClientRect();
    return x >= r.left && x < r.right;
  });
  assert.equal(page.sample().ready, true);
});

test("a dominant empty region inside main waits through hydration and the hero transfer", () => {
  const page = viewport();
  const region = element("div", { textContent: "", firstElementChild: null, closest: () => page.body });
  const logo = element("img", { complete: true, naturalWidth: 120, getBoundingClientRect: () => rect(0, 0, 120, 26) });
  const hero = element("img", { complete: false, naturalWidth: 0 });
  page.document.images = [logo];
  page.document.elementsFromPoint = (_x, y) => y < 50 ? [logo, page.body] : [region, page.body];
  assert.equal(page.sample().reason, "shell");
  region.firstElementChild = hero;
  page.document.images.push(hero);
  page.document.elementsFromPoint = () => [hero, region, page.body];
  assert.equal(page.sample().reason, "hero");
  hero.complete = true;
  hero.naturalWidth = 1440;
  assert.equal(page.sample().ready, true);
  page.document.elementsFromPoint = () => [page.body];
  assert.equal(page.sample().ready, true);
});

test("only a dominant loaded image awaits decoding and the subsequent presentation frame", async () => {
  const page = viewport({ paint: false, paintTiming: false });
  let decode, frame;
  const hero = element("img", {
    currentSrc: "https://site.test/car.jpg", complete: true, naturalWidth: 1280,
    decode: () => new Promise(resolve => { decode = resolve; }),
  });
  page.document.elementsFromPoint = () => [hero, page.body];
  const report = new Promise(resolve => page.sample(resolve, fn => { frame = fn; }));
  assert.equal(page.reports, 0);
  decode();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.reports, 0);
  page.paints.set("first-contentful-paint", 120);
  frame();
  const presented = await report;
  assert.equal(presented.reason, "ready");
  assert.equal(presented.fcp, 120);
  assert.equal(presented.painted, true);

  const smallTile = element("img", {
    complete: true, naturalWidth: 200, decode() { throw Error("unexpected decode"); },
    getBoundingClientRect: () => rect(100, 80, 150, 80),
  });
  page.document.images = [smallTile];
  page.document.elementsFromPoint = (x, y) => x < 250 && y < 160 ? [smallTile, page.body] : [page.body];
  assert.equal(page.sample().reason, "ready");
});

test("a full-bleed responsive picture waits through source selection and the site's own opacity transition", () => {
  const page = viewport();
  let img, opacity = 0;
  const picture = element("picture", {
    closest: () => null, querySelector: name => name === "source" ? {} : img,
    checkVisibility: ({ opacityProperty }) => !opacityProperty || opacity > 0,
  });
  page.document.elementsFromPoint = () => img ? [img, picture, page.body] : [picture, page.body];
  assert.equal(page.sample().reason, "hero");
  img = element("img", { parentElement: picture, complete: true, currentSrc: "", naturalWidth: 0, checkVisibility: picture.checkVisibility });
  assert.equal(page.sample().reason, "hero");
  img.currentSrc = "https://site.test/car.avif";
  img.naturalWidth = 3370;
  assert.equal(page.sample().reason, "hero");
  opacity = .04;
  assert.equal(page.sample().reason, "ready");
  opacity = 0;
  picture.closest = () => picture;
  assert.equal(page.sample().reason, "ready");
});

test("a failed video source cannot release a defining poster that is still being fetched", () => {
  const page = viewport();
  const video = element("video", {
    networkState: 3, error: { code: 4 }, readyState: 0, poster: "https://site.test/slow-poster", autoplay: false,
  });
  page.document.elementsFromPoint = () => [video, page.body];
  assert.equal(page.sample().reason, "hero");
  page.resources.add(video.poster);
  assert.equal(page.sample().reason, "ready");
});

test("a pending carousel image covered by the already displayed slide cannot hold the cover", () => {
  const page = viewport();
  const front = element("img", { complete: true, currentSrc: "https://site.test/current", naturalWidth: 1680 });
  const behind = element("img", { complete: false, currentSrc: "https://site.test/next", naturalWidth: 0 });
  page.document.images = [front, behind];
  page.document.elementsFromPoint = () => [front, behind, page.body];
  assert.equal(page.sample().reason, "ready");
});
