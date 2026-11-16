import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { webviewRef } from "../../platform/webviews.ts";
import { documentLoad } from "./documentLoad.ts";
import { viewportPaletteProbe, viewportProbe } from "./documentPaint.ts";
import { pageOf } from "./pageState.ts";

const url = "https://example.test/";
const background = "#ffffff";
function fixture(t, evaluate, restored) {
  const id = t.name;
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const register = webviewRef(id);
  const load = documentLoad(id, background, restored);
  const firstRender = load.currentMesh();
  const calls = [];
  const frame = { url, start: 9950, ready: false, painted: false, background };
  const wrapped = load.wrap({
    evaluate: async (code) => {
      if (code !== viewportProbe && code !== viewportPaletteProbe) {
        calls.push("location");
        return frame.url;
      }
      const readiness = code === viewportProbe;
      calls.push(readiness ? "frame" : "palette");
      return evaluate ? evaluate(readiness, frame) : readiness ? { ...frame } : { ...frame, colors: [] };
    },
    loadUrl() { calls.push("navigate"); }, reload() { calls.push("reload"); },
    forceReload() { calls.push("forceReload"); }, stopLoading() { calls.push("stop"); },
  });
  register(wrapped);
  const hide = load.watchPaint("webkit");
  t.after(() => { hide(); register(null); });
  return { calls, frame, load, wrapped, register, hide, firstRender, mesh: () => pageOf(id).documentMesh,
    async tick(ms) { t.mock.timers.tick(ms); await nextTurn(); } };
}

test("a cold restore has one opaque cover from its first render through history adoption and the real first screen", async t => {
  const f = fixture(t, undefined, { url, covered: true });
  const initial = f.firstRender;
  assert.equal(initial.background, background);
  assert.deepEqual(initial.colors, []);
  assert.equal(initial.waitingForFrame, true);
  assert.equal(f.mesh(), initial);
  assert.deepEqual(f.calls, []);

  f.wrapped.loadUrl(url);
  f.load.navigation("", 0, background);
  Object.assign(f.frame, { url: "about:blank", reason: "paint" });
  f.load.navigation(url, 0);
  await f.tick(99);
  assert.equal(f.mesh().waitingForFrame, true);
  await f.tick(1);
  assert.equal(f.mesh().id, initial.id);
  assert.ok(!f.mesh().waitingForFrame);
  assert.deepEqual(f.calls, ["navigate", "frame"]);

  Object.assign(f.frame, { url, reason: "hero", painted: true, background: "#234567" });
  const committed = Date.now();
  f.load.navigation(url, committed);
  assert.equal(f.load.currentMesh().id, initial.id);
  await f.tick(0);
  assert.equal(f.mesh().background, "#234567");
  assert.equal(f.mesh().id, initial.id);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
  f.load.navigation(url, 0, background);
  f.load.navigation(url, committed, null);
  await f.tick(500);
  assert.equal(f.load.currentMesh(), null);
  assert.equal(f.mesh(), null);
});

test("a cached restored first screen clears the pending backing before it becomes an animated mesh", async t => {
  const f = fixture(t, undefined, { url, covered: true });
  assert.equal(f.firstRender.waitingForFrame, true);
  await f.tick(25);
  Object.assign(f.frame, { ready: true, painted: true });
  const committed = Date.now();
  f.load.navigation(url, committed);
  await f.tick(0);
  assert.equal(f.mesh(), null);
  assert.equal(f.load.currentMesh(), null);
  f.load.navigation(url, committed, null);
  await f.tick(500);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame"]);
});

test("a restore already exposed by the host stays clear across late loading notifications", async t => {
  const f = fixture(t, undefined, { url, covered: false });
  assert.equal(f.firstRender, null);
  f.load.navigation("", 0, background);
  await f.tick(200);
  f.load.navigation(url, 0);
  await f.tick(200);
  f.load.navigation(url, Date.now());
  await f.tick(200);
  f.load.navigation(url, 0, null);
  await f.tick(200);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, []);

  const next = url + "next";
  f.wrapped.loadUrl(next);
  await f.tick(100);
  const cover = f.mesh();
  assert.ok(cover);
  Object.assign(f.frame, { url: next, reason: "hero", painted: true });
  f.load.navigation(next, Date.now());
  await f.tick(0);
  assert.equal(f.mesh().id, cover.id);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("a cold restore with no native navigation reply eventually releases its initial cover", async t => {
  const f = fixture(t, undefined, { url, covered: true });
  assert.equal(f.mesh(), f.firstRender);
  await f.tick(45000);
  assert.equal(f.load.currentMesh(), null);
  f.load.navigation(url, 0, null);
  await f.tick(500);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, []);
});

test("a link from an already exposed restored history entry gets the usual slow-navigation cover", async t => {
  const f = fixture(t, undefined, { url, covered: false });
  f.load.navigation(url, 0, null);
  await f.tick(200);
  const next = url + "article";
  f.load.approaching(next);
  await f.tick(100);
  assert.ok(f.mesh());
  const first = f.mesh().id;
  f.frame.url = next;
  f.load.navigation(next, Date.now());
  await f.tick(0);
  assert.equal(f.mesh().id, first);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("a redirect can paint before the saved history URL updates and keeps the same cover until the new hero is ready", async t => {
  const f = fixture(t, undefined, { url, covered: true });
  f.load.navigation(url, 0, null);
  const redirected = url + "home";
  Object.assign(f.frame, { url: redirected, reason: "hero", painted: true });
  await f.tick(100);
  assert.equal(f.mesh()?.id, f.firstRender.id);
  f.load.approaching(redirected);
  const at = Date.now();
  f.load.navigation(redirected, at);
  f.load.navigation(url, at - 1);
  await f.tick(0);
  assert.equal(f.mesh()?.id, f.firstRender.id);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

for (const interrupted of ["hide", "cancel"]) {
  test(`a pending cold restore stays uncovered after ${interrupted} and a late renderer reply`, async t => {
    let reply;
    const f = fixture(t, () => new Promise(resolve => { reply = resolve; }), { url, covered: true });
    f.load.navigation(url, Date.now());
    await f.tick(0);
    assert.equal(f.mesh(), f.firstRender);
    if (interrupted === "hide") f.hide();
    else f.load.cancel();
    assert.equal(f.load.currentMesh(), null);
    reply(f.frame);
    await nextTurn();
    f.load.navigation(url, 0, background);
    await f.tick(500);
    assert.equal(f.mesh(), null);
    assert.deepEqual(f.calls, ["frame"]);
  });
}

test("a slow provisional reload leaves the old frame visible and a usable committed frame skips the cover", async t => {
  const f = fixture(t);
  f.wrapped.reload();
  f.load.navigation(url, 0);
  await f.tick(2000);
  assert.deepEqual(f.calls, ["reload"]);
  f.frame.ready = true;
  const commit = Date.now();
  f.load.navigation(url, commit);
  await f.tick(100);
  assert.equal(f.mesh(), null);
  f.load.navigation(url + "#section", commit);
  await f.tick(100);
  assert.deepEqual(f.calls, ["reload", "frame"]);
});

test("visible media readiness releases immediately even with a palette request still pending", async t => {
  let palette;
  const f = fixture(t, (readiness, frame) => readiness ? frame : new Promise(resolve => { palette = resolve; }));
  f.load.navigation(url, Date.now());
  await f.tick(100);
  assert.equal(f.mesh().background, background);
  assert.deepEqual(f.calls, ["frame", "palette"]);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
  palette({ ...f.frame, colors: Array(12).fill("#dd6699") });
  await f.tick(1000);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame", "palette", "frame"]);
});

test("repeated same-address commits, an interrupted navigation, and an unmount reject stale replies", async t => {
  const pending = [];
  const f = fixture(t, (readiness, frame) => readiness ? new Promise(resolve => pending.push(resolve)) : { ...frame, colors: [] });
  f.load.navigation(url, Date.now());
  await f.tick(100);
  f.wrapped.forceReload();
  f.load.navigation(url, Date.now());
  await f.tick(500);
  pending[0](f.frame);
  await nextTurn();
  assert.equal(f.mesh(), null);
  pending[1](f.frame);
  await nextTurn();
  assert.ok(f.mesh());
  f.wrapped.loadUrl("https://elsewhere.test/");
  assert.equal(f.mesh(), null);
  f.load.navigation(url, Date.now());
  await f.tick(500);
  f.register(null);
  pending[2](f.frame);
  await nextTurn();
  assert.equal(f.mesh(), null);
});

test("an explicit stop, a hidden tab, or a hung renderer always clears its cover", async t => {
  let answer = true;
  const f = fixture(t, (readiness, frame) => readiness && answer ? frame : new Promise(() => {}));
  for (const action of ["stop", "deadline", "hide"]) {
    f.load.navigation(url, Date.now());
    await f.tick(500);
    assert.ok(f.mesh());
    if (action === "stop") f.wrapped.stopLoading();
    if (action === "deadline") {
      answer = false;
      await f.tick(10000);
      answer = true;
    }
    if (action === "hide") f.hide();
    assert.equal(f.mesh(), null);
  }
});

test("a cached same-URL reload can present its first frame without remounting the mesh", async t => {
  const f = fixture(t);
  f.frame.ready = true;
  f.load.navigation(url, Date.now());
  await f.tick(100);
  f.wrapped.reload();
  f.frame.ready = false;
  f.load.navigation(url, Date.now());
  await f.tick(250);
  assert.equal(f.mesh(), null);
  f.frame.ready = true;
  await f.tick(250);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame", "reload", "frame"]);
});

test("content already painted at the first inspection stays visible while its hero loads", async t => {
  const f = fixture(t);
  f.frame.reason = "hero";
  f.frame.painted = true;
  f.load.navigation(url, Date.now());
  await f.tick(100);
  assert.equal(f.mesh(), null);
  await f.tick(2000);
  assert.deepEqual(f.calls, ["frame"]);
});

test("a slow replacement can cover before commit and keeps that cover until its hero is ready", async t => {
  const f = fixture(t);
  f.frame.ready = true;
  f.load.navigation(url, Date.now());
  await f.tick(100);
  const next = url + "next";
  f.wrapped.loadUrl(next);
  await f.tick(100);
  const id = f.mesh().id;
  assert.deepEqual(f.calls, ["frame", "navigate", "location"]);
  Object.assign(f.frame, { url: next, reason: "hero", ready: false, painted: true });
  f.load.navigation(next, Date.now());
  await f.tick(0);
  assert.equal(f.mesh().id, id);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("a delayed native commit cannot put a provisional cover on the new page", async t => {
  const f = fixture(t);
  f.frame.ready = true;
  f.load.navigation(url, Date.now());
  await f.tick(100);
  const next = url + "next";
  f.wrapped.loadUrl(next);
  Object.assign(f.frame, { url: next, reason: "hero", ready: false, painted: true });
  await f.tick(140);
  assert.equal(f.mesh(), null);
  f.load.navigation(next, Date.now());
  await f.tick(100);
  assert.equal(f.mesh(), null);
});

test("a slow first connection keeps the same presentation across commit and starts sampling only on the new document", async t => {
  const f = fixture(t);
  f.load.navigation("", 0, background);
  await f.tick(70);
  f.load.navigation("", 0, background);
  assert.equal(f.mesh(), null);
  await f.tick(30);
  const id = f.mesh().id;
  await f.tick(500);
  assert.deepEqual(f.calls, []);
  f.load.navigation(url, Date.now());
  assert.equal(f.mesh().id, id);
  await f.tick(0);
  assert.deepEqual(f.calls, ["frame", "palette"]);
  assert.equal(f.mesh().id, id);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("instant and aborted first connections do not leave a cover or a scheduled reveal", async t => {
  const f = fixture(t);
  f.load.navigation("", 0, background);
  await f.tick(30);
  f.load.navigation("", 0, null);
  await f.tick(250);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, []);
  f.load.navigation("", 0, background);
  await f.tick(40);
  f.frame.ready = true;
  f.load.navigation(url, Date.now());
  await f.tick(200);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame"]);
});

test("a restored document committed before attachment is inspected once and an unfinished tab is checked again on return", async t => {
  const f = fixture(t);
  f.load.navigation(url, 0);
  await f.tick(100);
  assert.ok(f.mesh());
  f.hide();
  assert.equal(f.mesh(), null);
  f.load.navigation(url, 0);
  await f.tick(300);
  assert.deepEqual(f.calls, ["frame", "palette"]);
  const leaveAgain = f.load.watchPaint("webkit");
  await f.tick(100);
  assert.ok(f.mesh());
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
  leaveAgain();
  const finalLeave = f.load.watchPaint("webkit");
  f.load.navigation(url, 0);
  await f.tick(500);
  assert.deepEqual(f.calls, ["frame", "palette", "frame", "palette", "frame"]);
  finalLeave();
});

test("a background document that paints on activation can open directly", async t => {
  const f = fixture(t);
  f.hide();
  f.load.navigation(url, Date.now());
  await f.tick(2500);
  const hide = f.load.watchPaint("webkit");
  await f.tick(50);
  assert.deepEqual(f.calls, []);
  f.frame.ready = true;
  await f.tick(50);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame"]);
  hide();
});

test("a restored history URL can point at an unpainted initial document until the first real commit", async t => {
  const f = fixture(t);
  f.frame.url = "about:blank";
  f.frame.reason = "paint";
  f.load.navigation(url, 0);
  await f.tick(100);
  const id = f.mesh().id;
  await f.tick(2400);
  assert.deepEqual(f.calls, ["frame"]);
  f.frame.url = url;
  f.frame.reason = "hero";
  f.load.navigation(url, Date.now());
  await f.tick(0);
  assert.equal(f.mesh().id, id);
  assert.deepEqual(f.calls, ["frame", "frame", "palette"]);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("a restored history entry with no new native timestamp is rechecked when loading finishes", async t => {
  const f = fixture(t);
  f.frame.url = "about:blank";
  f.frame.reason = "paint";
  f.load.navigation(url, 0);
  await f.tick(100);
  assert.ok(f.mesh());
  f.frame.url = url;
  f.frame.ready = true;
  f.load.navigation(url, 0, null);
  await f.tick(0);
  assert.equal(f.mesh(), null);
  assert.deepEqual(f.calls, ["frame", "frame"]);
});

test("a responsive empty first screen waits for its hero, while another navigation cancels it immediately", async t => {
  const f = fixture(t);
  f.frame.reason = "shell";
  f.load.navigation(url, Date.now());
  for (let ms = 0; ms < 16000; ms += 100) await f.tick(100);
  assert.ok(f.mesh());
  f.frame.reason = "hero";
  for (let ms = 0; ms < 5000; ms += 100) await f.tick(100);
  assert.ok(f.mesh());
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
  f.frame.ready = false;
  f.frame.reason = "shell";
  f.load.navigation(url, Date.now());
  await f.tick(500);
  assert.ok(f.mesh());
  f.wrapped.loadUrl("https://example.test/next");
  assert.equal(f.mesh(), null);
});

test("a visible gallery can fill after the ordinary media timeout and still reveal on its first usable sample", async t => {
  const f = fixture(t);
  f.frame.reason = "content";
  f.load.navigation(url, Date.now());
  await f.tick(100);
  const original = f.mesh();
  assert.ok(original);
  f.frame.reason = "gallery";
  for (let elapsed = 0; elapsed < 6000; elapsed += 100) await f.tick(100);
  assert.equal(f.mesh(), original);
  f.frame.ready = true;
  await f.tick(40);
  assert.equal(f.mesh(), null);
});

test("a busy renderer can finish a confirmed first-screen gallery, with a bounded wait for a lost reply", async t => {
  let reply;
  const f = fixture(t, (readiness, frame) => {
    if (!readiness) return { ...frame, colors: [] };
    return frame.reason === "busy" ? new Promise(resolve => { reply = resolve; }) : { ...frame };
  });
  for (const recovers of [true, false]) {
    f.frame.reason = "gallery";
    f.load.navigation(url, Date.now());
    await f.tick(500);
    f.frame.reason = "busy";
    await f.tick(40);
    await f.tick(2200);
    assert.ok(f.mesh());
    if (recovers) {
      reply({ ...f.frame, ready: true });
      await nextTurn();
    } else {
      await f.tick(2000);
    }
    assert.equal(f.mesh(), null);
  }
});

test("an unpainted first screen stays covered through a busy page startup, with a bounded wait", async t => {
  let reply;
  const f = fixture(t, (readiness, frame) => !readiness ? { ...frame, colors: [] } :
    frame.reason === "busy" ? new Promise(resolve => { reply = resolve; }) : { ...frame });
  for (const recovers of [true, false]) {
    f.frame.reason = "paint";
    f.load.navigation(url, Date.now());
    await f.tick(500);
    assert.ok(f.mesh());
    f.frame.reason = "busy";
    await f.tick(80);
    await f.tick(4300);
    assert.ok(f.mesh());
    if (recovers) {
      reply({ ...f.frame, ready: true });
      await nextTurn();
    } else {
      await f.tick(2000);
    }
    assert.equal(f.mesh(), null);
  }
});
