import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { useBrowser } from "../browser/store.ts";
import { webviews } from "../../platform/webviews.ts";
import { tidyContentProbe, tidyContentReader } from "./tidyPageContent.ts";
import { flushPersistence, startPersistence } from "../session/persist.ts";
import { SESSION_DOCUMENT } from "../session/sessionDocument.ts";
import { docs } from "../../test-native/index.ts";

const S = () => useBrowser.getState();
const url = "https://boutique.test/items/31";

test("the heading probe reads bounded public heading text and explicit product metadata", () => {
  const headingIn = (parent) => ({ closest: (selector) => selector.split(/,\s*/).includes(parent) ? {} : null });
  const h1 = headingIn("main");
  const headings = [headingIn("nav"), headingIn("[contenteditable]"), h1];
  const nodes = [
    { nodeType: 3, parentElement: h1, data: "  Espresso " },
    { nodeType: 3, parentElement: { closest: () => ({}) }, data: "typed in editor" },
    { nodeType: 3, parentElement: h1, data: " grinder" },
  ];
  const meta = { "og:type": "product", "og:title": "Alternative heading" };
  const document = {
    getElementsByTagName: () => headings,
    createTreeWalker(selected) { assert.equal(selected, h1); const visited = [...nodes]; return { nextNode: () => visited.shift() }; },
    head: { querySelector: (s) => ({ getAttribute: () => meta[s.match(/"(.+?)"/)[1]] }) },
  };
  function probe() {
    let result;
    runInNewContext(`(() => {${tidyContentProbe}})()`, { document, location: new URL(url), NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, post: (_kind, json) => { result = JSON.parse(json); } });
    return result;
  }
  assert.deepEqual(probe(), { url, heading: "Espresso grinder", product: true });
  headings.pop();
  assert.equal(probe().heading, "Alternative heading");
  meta["og:title"] = "A".repeat(2000);
  assert.equal(probe().heading.length, 160);
  document.designMode = "on";
  assert.equal(probe(), null);
});

test("late results from a previous page or reload cannot overwrite the current tab's content", async () => {
  S().hydrate({});
  const w = S().createWindow({ url });
  const id = S().windows[w].tabIds[0];
  const reader = tidyContentReader(id);
  let pending;
  let calls = 0;
  const handle = { evaluate: () => { calls++; return new Promise((resolve) => { pending = resolve; }); } };
  webviews.set(id, handle);
  try {
    const old = reader.navigation(url, "Item", false, 12);
    const oldReply = pending;
    const next = url + "#other-item";
    S().updateTab(id, { url: next });
    const fresh = reader.navigation(next, "Item", false, 12);
    pending({ url: next, heading: "Espresso grinder", product: true });
    await fresh;
    oldReply({ url, heading: "Old handbag", product: true });
    await old;
    assert.deepEqual(S().tabs[id].tidyContent, { url: next, heading: "Espresso grinder", product: true });
    await reader.navigation(next, "Item", false, 12);
    assert.equal(calls, 2);
    await reader.navigation(next, "Item", true, 12);
    assert.equal(S().tabs[id].tidyContent, undefined);
    const reload = reader.navigation(next, "Item", false, 13);
    reader.cancel();
    pending({ url: next, heading: "Discarded result", product: true });
    await reload;
    assert.equal(S().tabs[id].tidyContent, undefined);
  } finally {
    webviews.delete(id);
  }
});

test("heading evidence is excluded from session files and recently closed windows", () => {
  S().hydrate({});
  docs.clear();
  const stop = startPersistence();
  try {
    const w = S().createWindow({ url });
    const id = S().windows[w].tabIds[0];
    S().updateTab(id, { tidyContent: { url, heading: "Unique local heading", product: true } });
    flushPersistence();
    const json = docs.get(SESSION_DOCUMENT);
    assert.ok(JSON.parse(json).tabs.some((tab) => tab.id === id));
    assert.doesNotMatch(json, /Unique local heading|tidyContent/);
    S().closeWindow(w);
    assert.ok(S().closedWindows.some((entry) => entry.tabs.some((tab) => tab.url === url)));
    assert.doesNotMatch(JSON.stringify(S().closedWindows), /Unique local heading|tidyContent/);
  } finally {
    stop();
  }
});
