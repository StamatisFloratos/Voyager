import assert from "node:assert/strict";
import { test } from "node:test";
import { useBrowser } from "../browser/store.ts";
import { resolveDrop } from "../drag/drops.ts";
import { flushPersistence, loadSession, startPersistence } from "../session/persist.ts";
import { tidyTabs } from "./tidyTabs.ts";

const S = () => useBrowser.getState();
const groupOf = (id) => Object.values(S().groups).find((g) => g.tabIds.includes(id));
const tidy = (w) => tidyTabs(w, S().windows[w].profileId);
const add = (w, url) => S().newTab(w, { url, background: true });

function socialWindow() {
  S().hydrate({});
  const w = S().createWindow({ url: "https://x.com/" });
  const first = S().windows[w].tabIds[0];
  const second = add(w, "https://bsky.app/");
  tidy(w);
  return { w, first, second, group: groupOf(first) };
}

test("dragging a tab out keeps that page loose through another Tidy and close/reopen", () => {
  const { w, first, second } = socialWindow();
  const drop = resolveDrop(S(), { kind: "tab" }, { zone: "list", beforeId: null });
  assert.equal(S().dropTabs([first], drop), true);
  S().updateTab(first, { url: "https://x.com/#timeline" });
  const another = add(w, "https://reddit.com/");
  assert.equal(tidy(w), true);
  assert.equal(groupOf(first), undefined);
  assert.deepEqual(new Set(groupOf(another).tabIds), new Set([second, another]));

  S().closeTab(first);
  S().reopenClosed(w);
  const restored = S().windows[w].tabIds.find((id) => S().tabs[id].url === "https://x.com/#timeline");
  assert.ok(restored);
  assert.equal(tidy(w), false);
  assert.equal(groupOf(restored), undefined);

  S().updateTab(restored, { url: "https://instagram.com/" });
  assert.equal(tidy(w), true);
  assert.equal(groupOf(restored).id, groupOf(second).id);
});

test("removing a whole Tidy category respects its former members and allows new tabs to form that category", () => {
  const { w, first, second, group } = socialWindow();
  S().ungroup(group.id);
  const a = add(w, "https://threads.net/");
  const b = add(w, "https://discord.com/");
  assert.equal(tidy(w), true);
  assert.deepEqual(new Set(groupOf(a).tabIds), new Set([a, b]));
  assert.equal(groupOf(first), undefined);
  assert.equal(groupOf(second), undefined);
  assert.equal(tidy(w), false);
});

test("Move to Category holds a deliberate placement in Other while other matching tabs get filed", () => {
  const stopSaving = startPersistence();
  const { w, first, second, group } = socialWindow();
  const solo = add(w, "https://poetry.example/");
  tidy(w);
  const other = groupOf(solo);
  S().placeTabs([first], { pinned: false, groupId: other.id });
  flushPersistence();
  stopSaving();
  S().hydrate(loadSession());
  const third = add(w, "https://reddit.com/");
  assert.equal(tidy(w), true);
  assert.equal(groupOf(first).id, other.id);
  assert.deepEqual(new Set(S().groups[group.id].tabIds), new Set([second, third]));

  S().placeTabs([first], { pinned: false, groupId: group.id });
  S().removeTabsFromGroup([first]);
  assert.equal(tidy(w), false);
  assert.equal(groupOf(first), undefined);
});

test("an automatic placement does not teach Tidy a preference", () => {
  const { w, first, second, group } = socialWindow();
  const solo = add(w, "https://poetry.example/");
  tidy(w);
  S().addTabsToGroup(groupOf(solo).id, [first], { automatic: true });
  assert.equal(tidy(w), true);
  assert.deepEqual(new Set(S().groups[group.id].tabIds), new Set([first, second]));
});
