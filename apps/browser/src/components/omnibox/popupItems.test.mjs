import assert from "node:assert/strict";
import { test } from "node:test";
import { mount } from "../../test-hooks.mjs";

globalThis.__DEV__ = false;
const { useBrowser } = await import("../../state/browser/store.ts");
const { useBarItems } = await import("./useBarItems.ts");

function fixture() {
  const store = () => useBrowser.getState();
  store().hydrate({});
  const url = "https://current.example/";
  const windowId = store().createWindow({ url });
  const tabId = store().windows[windowId].activeTabIds.default;
  const lastUsed = [10, 70, 40, 30, 90, 60, 50];
  const ids = lastUsed.map((lastActiveAt, i) => {
    const id = store().newTab(windowId, { url: `https://notes${i}.example/`, background: true });
    store().updateTab(id, { title: `Notes ${i}`, lastActiveAt });
    return id;
  });
  store().updateSettings({ searchSuggestions: false });
  const props = { input: { current: null }, edited: false, selected: -1, typed: "", scope: null, suppressCompletion: true, popup: true, profileId: "default", windowId, tabId, currentUrl: url };
  return { props, ids };
}

test("a blank or prefilled popup starts with the three most recently used other tabs and preserves the field until selection", () => {
  const { props, ids } = fixture();
  const h = mount(useBarItems, { props });
  try {
    for (const typed of ["", props.currentUrl]) {
      h.rerender({ ...props, typed });
      assert.deepEqual(h.value.items.map((x) => x.tabId), [ids[4], ids[1], ids[5]]);
      assert.equal(h.value.selectedIndex, -1);
      assert.equal(h.value.value, typed);
      h.rerender({ ...props, typed, selected: 0 });
      assert.equal(h.value.current.tabId, ids[4]);
      assert.equal(h.value.previewing, true);
    }
  } finally {
    h.unmount();
  }
});

test("popup typing shares the five ranked rows with keyboard selection, including the default search, while the hero retains its full list", () => {
  const { props, ids } = fixture();
  const query = { ...props, typed: "notes", edited: true, selected: 99 };
  const h = mount(useBarItems, { props: { ...query, popup: false } });
  try {
    const ranked = h.value.items;
    assert.ok(ranked.length > 5);
    h.rerender(query);
    assert.deepEqual(h.value.items, ranked.slice(0, 5));
    assert.ok(h.value.items.some((x) => x.kind === "search"));
    assert.equal(h.value.selectedIndex, 4);
    assert.equal(h.value.current, h.value.items[4]);
    h.rerender({ ...query, typed: "", selected: -1 });
    assert.deepEqual(h.value.items.map((x) => x.tabId), [ids[4], ids[1], ids[5]]);
  } finally {
    h.unmount();
  }
});

test("a provider's default action and asynchronously loaded matches use the same five popup slots", async () => {
  const { props } = fixture();
  const config = {
    keyword: "find",
    title: "Library",
    url: "https://library.example/search?q={query}",
    rows: Array.from({ length: 8 }, (_, i) => ({ title: `Notes ${i}`, url: `https://library.example/${i}` })),
  };
  useBrowser.getState().updateSettings({ omniboxProviders: [config] });
  const { keywordScope } = await import("../../state/omnibox/scopes.ts");
  const query = { ...props, edited: true, typed: "notes", selected: 0, scope: keywordScope("find", props.windowId) };
  const h = mount(useBarItems, { props: query });
  try {
    assert.equal(h.value.items[0].url, "https://library.example/search?q=notes");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(h.value.items.map((s) => s.url), [h.value.current.url, ...config.rows.slice(0, 4).map((row) => row.url)]);
  } finally {
    h.unmount();
  }
});
