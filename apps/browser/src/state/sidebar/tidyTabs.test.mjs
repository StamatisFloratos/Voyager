import assert from "node:assert/strict";
import { test } from "node:test";

const { useBrowser } = await import("../browser/store.ts");
const { canTidyTabs, tidyTabs } = await import("./tidyTabs.ts");
const { sidebarEntries } = await import("./entries.ts");
const { parseEntry } = await import("./entryKey.ts");
const S = () => useBrowser.getState();
const add = (w, url, extra = {}) => S().newTab(w, { url, background: true, ...extra });
const profile = (w) => S().windows[w].profileId;
const tidy = (w) => tidyTabs(w, profile(w));
const top = (w) => sidebarEntries(S(), w).list.map((key) => parseEntry(key).id);

test("Tidy makes ordered topic and same-site categories in a single edit, keeping duplicate pages and selection", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://unrelated.test/" });
  const solo = S().windows[w].tabIds[0];
  const a = add(w, "https://x.com/post");
  const b = add(w, "http://127.0.0.1:8814/");
  const c = add(w, "https://lab.example/1");
  const d = add(w, "https://bsky.app/profile/foo");
  const e = add(w, "http://localhost:8790/");
  const f = add(w, "https://www.lab.example/2");
  const g = add(w, "https://x.com/post");
  const lookalike = add(w, "https://x.com.example/");
  const extension = add(w, "chrome-extension://abc/new");
  const active = S().windows[w].activeTabIds;
  const tabs = S().tabs;
  assert.equal(canTidyTabs(S(), w, profile(w)), true);
  let changes = 0;
  const stop = useBrowser.subscribe(() => changes++);
  try {
    assert.equal(tidy(w), true);
    const groups = Object.values(S().groups);
    assert.deepEqual(groups.map((g) => g.name), ["Social", "Local Development", "Lab", "Other"]);
    assert.deepEqual(groups.map((g) => g.tabIds), [[a, d, g], [b, e], [c, f], [solo, lookalike, extension]]);
    assert.deepEqual(top(w), groups.map((g) => g.id));
    assert.equal(S().tabs, tabs);
    assert.equal(S().windows[w].activeTabIds, active);
    assert.equal(canTidyTabs(S(), w, profile(w)), false);
    assert.equal(tidy(w), false);
    assert.equal(changes, 1);
  } finally {
    stop();
  }
});

test("a new related tab joins its existing category after renaming; a manual category with the same original name stays intact", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://home.example/" });
  const manual = S().createGroup([add(w, "https://github.com/manual")], { name: "Development" });
  const a = add(w, "https://github.com/project");
  const b = add(w, "https://developer.mozilla.org/docs");
  assert.equal(tidy(w), true);
  const category = Object.values(S().groups).find((g) => g.tidyKey === "topic:Development").id;
  const original = S().groups[manual];
  S().updateGroup(category, { name: "Projects", collapsed: true });
  const c = add(w, "https://gitlab.com/project");
  assert.equal(tidy(w), true);
  assert.deepEqual(S().groups[category].tabIds, [a, b, c]);
  assert.equal(S().groups[category].name, "Projects");
  assert.equal(S().groups[category].collapsed, true);
  assert.equal(S().groups[manual], original);
  assert.equal(Object.keys(S().groups).length, 3);
});

test("Tidy leaves tiles, pinned rows, split panes, other profiles, and other windows alone", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://x.com/regular" });
  const pin = add(w, "https://x.com/pin");
  const tile = add(w, "https://x.com/tile");
  S().pinTabs([pin], true, true);
  S().pinTabs([tile], true, false);
  const left = add(w, "https://x.com/split");
  const right = add(w, "https://bsky.app/split");
  S().createSplit([left, right]);
  const p = S().createProfile({ name: "Work" });
  add(w, "https://x.com/work", { profileId: p });
  add(w, "https://bsky.app/work", { profileId: p });
  const other = S().createWindow({ url: "https://x.com/another" });
  const priv = S().createWindow({ kind: "private", url: "https://x.com/private" });
  add(priv, "https://bsky.app/private");
  assert.equal(tidyTabs(w, p), false);
  assert.equal(tidy(w), true);
  assert.deepEqual(Object.values(S().groups).map((g) => [g.name, g.tabIds]), [["Other", [S().windows[w].activeTabIds[profile(w)]]]]);
  assert.equal(tidy(priv), true);
  assert.deepEqual(Object.values(S().groups).map((g) => [g.windowId, g.profileId]), [[w, profile(w)], [priv, profile(priv)]]);
  const before = S();
  const extra = add(w, "https://bsky.app/regular");
  const tabs = S().tabs;
  assert.equal(tidy(w), true);
  const local = Object.values(S().groups).find((g) => g.windowId === w);
  assert.deepEqual(local.tabIds, [before.windows[w].activeTabIds[profile(w)], extra]);
  assert.equal(S().tabs, tabs);
  assert.equal(S().splits, before.splits);
  assert.equal(S().windows[other], before.windows[other]);
  assert.equal(S().windows[priv], before.windows[priv]);
});

test("a reopened category still accepts matching tabs", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://home.example/" });
  add(w, "https://figma.com/one");
  add(w, "https://behance.net/two");
  tidy(w);
  S().closeGroup(Object.keys(S().groups)[0]);
  S().reopenClosed(w);
  const restored = Object.values(S().groups).find((g) => g.tidyKey === "topic:Design");
  const third = add(w, "https://dribbble.com/three");
  assert.equal(tidy(w), true);
  assert.deepEqual(S().groups[restored.id].tabIds, [...restored.tabIds, third]);
});

test("Other is stable, protects user categories, and releases tabs when they gain a match", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://one.example/first" });
  const first = S().windows[w].tabIds[0];
  const second = add(w, "https://gitlab.com/second");
  const manualTab = add(w, "https://one.example/manual");
  const manual = S().createGroup([manualTab], { name: "Other" });
  tidy(w);
  const other = Object.values(S().groups).find((g) => g.tidyKey === "other").id;
  S().updateGroup(other, { name: "Misc", collapsed: true });
  assert.deepEqual(S().groups[other].tabIds, [first, second]);
  assert.equal(tidy(w), false);

  const related = add(w, "https://github.com/related");
  assert.equal(tidy(w), true);
  assert.equal(S().groups[other].name, "Misc");
  assert.equal(S().groups[other].collapsed, true);
  assert.deepEqual(S().groups[other].tabIds, [first]);
  assert.equal(top(w).at(-1), other);
  assert.deepEqual(Object.values(S().groups).find((g) => g.name === "Development").tabIds, [second, related]);
  assert.equal(tidy(w), false);

  const match = add(w, "https://one.example/another");
  assert.equal(tidy(w), true);
  assert.equal(S().groups[other], undefined);
  assert.deepEqual(S().groups[manual].tabIds, [manualTab]);
  assert.deepEqual(Object.values(S().groups).find((g) => g.tidyKey === "site:one.example").tabIds, [first, match]);
  assert.equal(tidy(w), false);
});

test("rechecking Other only considers its direct single tabs", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://x.com/first" });
  const social = S().windows[w].tabIds[0];
  const left = add(w, "https://github.com/left");
  const right = add(w, "https://figma.com/right");
  tidy(w);
  const other = Object.values(S().groups).find((g) => g.tidyKey === "other").id;
  const split = S().createSplit([left, right]);
  const keep = add(w, "https://twitter.com/manual");
  const manual = S().createGroup([keep], { name: "Reading" });
  S().moveGroup(manual, { pinned: false, parentId: other });
  assert.equal(tidy(w), false);
  const match = add(w, "https://bsky.app/new");
  const splits = S().splits;
  assert.equal(tidy(w), true);
  assert.equal(S().splits, splits);
  assert.ok(S().splits[split]);
  assert.deepEqual(S().groups[manual].tabIds, [keep]);
  assert.deepEqual(new Set(S().groups[other].tabIds), new Set([left, right, keep]));
  assert.deepEqual(Object.values(S().groups).find((g) => g.name === "Social").tabIds, [social, match]);
  assert.equal(tidy(w), false);
});
