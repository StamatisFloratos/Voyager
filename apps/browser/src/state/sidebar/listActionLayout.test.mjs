import assert from "node:assert/strict";
import { test } from "node:test";

const { useBrowser } = await import("../browser/store.ts");
const { tidyTabs } = await import("./tidyTabs.ts");
const { listActionLayout } = await import("./listActionLayout.ts");
const { rowSpan } = await import("./geometry.ts");
const { entryKey } = await import("./entryKey.ts");
const { SIDEBAR_GROUP } = await import("../../lib/sidebarMetrics.ts");

const state = () => useBrowser.getState();
const tab = (windowId, url) => state().newTab(windowId, { url, background: true });

test("a row moving into a category starts at its former position and moves only once with its parent", () => {
  state().hydrate({});
  const w = state().createWindow({ url: "https://github.com/first" });
  const profile = state().windows[w].profileId;
  const first = state().windows[w].activeTabIds[profile];
  const kept = tab(w, "https://one.example");
  const manual = state().createGroup([kept], { name: "Reading" });
  const last = tab(w, "https://gitlab.com/second");
  const before = state();
  tidyTabs(w, profile);
  const after = state();
  const plan = listActionLayout(before, after, w, profile);
  const delta = (id) => rowSpan(before, w, profile, id, false).top - rowSpan(after, w, profile, id, false).top;
  for (const id of [first, last]) assert.equal(plan.rows.get(entryKey("tab", id)), delta(id));
  assert.equal(plan.rows.get(entryKey("group", manual)), delta(kept));
  assert.ok(!plan.rows.has(entryKey("tab", kept)));
  assert.deepEqual(plan.departures, []);
  assert.ok(plan.tail < 0);
});

test("a loose tab joining a folded category travels to its visible header", () => {
  state().hydrate({});
  const w = state().createWindow({ url: "https://home.example" });
  const profile = state().windows[w].profileId;
  const a = tab(w, "https://github.com/first");
  tab(w, "https://gitlab.com/second");
  tidyTabs(w, profile);
  const category = Object.values(state().groups)[0].id;
  state().updateGroup(category, { collapsed: true });
  const extra = tab(w, "https://github.com/third");
  const before = state();
  tidyTabs(w, profile);
  const after = state();
  const { departures } = listActionLayout(before, after, w, profile);
  assert.deepEqual(departures.map((d) => d.key), [entryKey("tab", extra)]);
  assert.equal(departures[0].top, rowSpan(before, w, profile, extra, false).top);
  assert.equal(departures[0].destination + SIDEBAR_GROUP.border, rowSpan(after, w, profile, a, false).top);
});

test("Clear fades a closed category once and keeps the surviving tab moving independently of its disappearing header", () => {
  state().hydrate({});
  const w = state().createWindow({ url: "https://home.example" });
  const profile = state().windows[w].profileId;
  const active = state().windows[w].activeTabIds[profile];
  const leaving = tab(w, "https://sibling.example");
  const dissolving = state().createGroup([active, leaving]);
  const whole = state().createGroup([tab(w, "https://a.example"), tab(w, "https://b.example")]);
  const groups = state().groups;
  useBrowser.setState({ groups: { ...groups, [dissolving]: { ...groups[dissolving], autoUngroup: true } } });
  const before = state();
  state().clearUnpinnedTabs(w);
  const plan = listActionLayout(before, state(), w, profile);
  const byKey = new Map(plan.departures.map((d) => [d.key, d]));
  assert.equal(byKey.size, 3);
  assert.equal(byKey.get(entryKey("group", whole)).wholeGroup, true);
  assert.equal(byKey.get(entryKey("group", dissolving)).wholeGroup, false);
  assert.equal(byKey.get(entryKey("tab", leaving)).depth, 1);
  assert.equal(plan.rows.get(entryKey("tab", active)), rowSpan(before, w, profile, active, false).top);
});
