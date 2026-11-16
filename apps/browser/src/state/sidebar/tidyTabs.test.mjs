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

function addPage(w, url, title) {
  const id = add(w, url);
  S().updateTab(id, { title });
  return id;
}

const groupOf = (id) => Object.values(S().groups).find((g) => g.tabIds.includes(id));

test("product headings explain opaque storefront tabs and stale headings cannot assign another page", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://rail.example/timetable" });
  const train = S().windows[w].tabIds[0];
  const a = addPage(w, "https://independent.example/a/16", "Store");
  const b = addPage(w, "https://artisan.example/b/27", "Home");
  tidy(w);
  assert.equal(groupOf(a).name, "Other");
  for (const [id, heading] of [[a, "Hand-cranked burr grinder"], [b, "Electric burr grinder"]]) {
    S().updateTab(id, { tidyContent: { url: S().tabs[id].url, heading, product: true } });
  }
  S().updateTab(train, { tidyContent: { url: "https://rail.example/old", heading: "Burr grinder", product: true } });
  assert.equal(tidy(w), true);
  const grinders = groupOf(a);
  assert.equal(grinders.name, "Burr Grinder Shopping");
  assert.deepEqual(grinders.tabIds, [a, b]);
  assert.equal(groupOf(train).name, "Other");
});

test("a hand-filed sizing guide helps with a matching guide from that store", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://north.example/products/wool-coat" });
  const coat = S().windows[w].tabIds[0];
  add(w, "https://south.example/products/raincoat");
  const guide = addPage(w, "https://north.example/support/1", "Size guide | North");
  tidy(w);
  const coats = groupOf(coat);
  S().addTabsToGroup(coats.id, [guide]);
  const next = addPage(w, "https://north.example/support/2", "Size guide | North");
  const otherStore = addPage(w, "https://furniture.example/help/3", "Size guide | Furniture");
  const account = addPage(w, "https://north.example/account", "My account | North");
  tidy(w);
  assert.equal(groupOf(next).id, coats.id);
  assert.notEqual(groupOf(otherStore)?.id, coats.id);
  assert.notEqual(groupOf(account)?.id, coats.id);
});

test("coat shopping spans a search and multiple shops, keeping duplicate listings and the selected tab", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://www.google.com/search?q=buy+coats" });
  const search = S().windows[w].activeTabIds[profile(w)];
  const coat = addPage(w, "https://www.amazon.co.uk/dp/B123456789", "Women's belted trench coat");
  const listing = "https://north-and-bay.example/products/3201";
  const wool = addPage(w, listing, "Wool-blend coat | North & Bay");
  const duplicate = addPage(w, listing, "Wool-blend coat | North & Bay");
  const trains = add(w, "https://www.google.com/search?q=train+times");
  const heraldry = addPage(w, "https://history.example/articles/108", "The royal coat of arms: a history");

  assert.equal(tidy(w), true);
  const group = groupOf(search);
  assert.match(group.name, /coat/i);
  assert.match(group.name, /shop/i);
  assert.deepEqual(new Set(group.tabIds), new Set([search, coat, wool, duplicate]));
  assert.equal(groupOf(trains).name, "Other");
  assert.equal(groupOf(heraldry).name, "Other");
  assert.equal(S().windows[w].activeTabIds[profile(w)], search);
  assert.equal(tidy(w), false);
});

test("product comparisons use a shared product name across independent stores", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://brewtown.example/products/4981" });
  const first = S().windows[w].tabIds[0];
  S().updateTab(first, { title: "Compact burr grinder | Brewtown" });
  const second = addPage(w, "https://kitchenworks.example/shop/1004", "Electric burr grinder | Kitchenworks");
  const kettle = addPage(w, "https://kitchenworks.example/shop/1008", "Electric kettle | Kitchenworks");

  assert.equal(tidy(w), true);
  const grinders = groupOf(first);
  assert.match(grinders.name, /burr grinder/i);
  assert.match(grinders.name, /shop/i);
  assert.deepEqual(new Set(grinders.tabIds), new Set([first, second]));
  assert.equal(groupOf(kettle).name, "Other");
  assert.equal(tidy(w), false);
});

test("a coat in an existing shopping category can join a new comparison, while a hand-filed coat stays put", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://www.etsy.com/listing/5800" });
  const bowl = S().windows[w].tabIds[0];
  S().updateTab(bowl, { title: "Ceramic fruit bowl" });
  const coat = addPage(w, "https://www.amazon.com/dp/B012345678", "Single-breasted wool coat");
  const saved = addPage(w, "https://closet.example/products/camel-coat", "Camel coat");
  const manual = S().createGroup([saved], { name: "Gift ideas" });
  assert.equal(tidy(w), true);
  assert.equal(groupOf(coat).id, groupOf(bowl).id);

  const second = addPage(w, "https://nightfall.example/products/100", "Buy a belted winter coat | Nightfall");
  assert.equal(tidy(w), true);
  const comparison = groupOf(second);
  assert.match(comparison.name, /coat/i);
  assert.deepEqual(new Set(comparison.tabIds), new Set([coat, second]));
  assert.deepEqual(S().groups[manual].tabIds, [saved]);
  assert.equal(tidy(w), false);
});

test("shared subjects in article titles group across sites without drawing in unrelated articles", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://skywatch.example/read/18" });
  const map = S().windows[w].tabIds[0];
  S().updateTab(map, { title: "Lunar eclipse visibility map" });
  const guide = addPage(w, "https://sciencejournal.example/articles/774", "A field guide to the lunar eclipse");
  const unrelated = addPage(w, "https://woodland.example/articles/775", "A field guide to edible fungi");

  assert.equal(tidy(w), true);
  const eclipse = groupOf(map);
  assert.match(eclipse.name, /eclipse/i);
  assert.deepEqual(new Set(eclipse.tabIds), new Set([map, guide]));
  assert.equal(groupOf(unrelated).name, "Other");
  assert.equal(tidy(w), false);
});

test("Tidy rechecks Other when titles arrive and keeps a renamed comparison for later tabs", () => {
  S().hydrate({});
  const w = S().createWindow({ url: "https://first-shop.example/id/15" });
  const first = S().windows[w].tabIds[0];
  const second = add(w, "https://second-shop.example/id/21");
  tidy(w);
  assert.equal(groupOf(first).name, "Other");
  assert.equal(canTidyTabs(S(), w, profile(w)), false);

  S().updateTab(first, { title: "Waterproof parka" });
  S().updateTab(second, { title: "Wool topcoat" });
  assert.equal(tidy(w), true);
  const coats = groupOf(first);
  assert.equal(coats.name, "Coat Shopping");
  assert.deepEqual(coats.tabIds, [first, second]);
  S().updateGroup(coats.id, { name: "Winter shortlist", collapsed: true });

  const third = addPage(w, "https://third-shop.example/id/65", "Faux fur coat");
  tidy(w);
  assert.equal(groupOf(third).id, coats.id);
  assert.equal(groupOf(third).name, "Winter shortlist");
  assert.equal(groupOf(third).collapsed, true);
  assert.equal(tidy(w), false);
});

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
