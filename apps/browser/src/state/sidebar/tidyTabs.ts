import { hostOf } from "@voyager/core";
import { newId } from "../browser/model";
import { useBrowser, type BrowserState } from "../browser/store";
import type { Tab } from "../browser/types";
import { splitIndex } from "../browser/structure";
import { siteName } from "../groups/groupNames";
import { withGroupsPlaced } from "../groups/groups";
import { groupEntries, sidebarEntries } from "./entries";
import { parseEntry } from "./entryKey";
import { tidyIntents } from "./tidyIntents";

const topics: Record<string, string[]> = {
  Development: ["github.com", "gitlab.com", "codeberg.org", "bitbucket.org", "stackoverflow.com", "developer.mozilla.org", "npmjs.com"],
  Design: ["figma.com", "dribbble.com", "behance.net", "are.na", "pinterest.com"],
  Social: ["x.com", "twitter.com", "bsky.app", "threads.net", "threads.com", "reddit.com", "instagram.com", "facebook.com", "linkedin.com", "discord.com"],
  Video: ["youtube.com", "youtu.be", "vimeo.com", "twitch.tv"],
  Shopping: ["amazon.com", "amazon.co.uk", "ebay.com", "ebay.co.uk", "etsy.com"],
  Documents: ["docs.google.com", "sheets.google.com", "slides.google.com", "drive.google.com", "notion.so", "notion.site", "dropbox.com"],
};
const topicByHost = new Map(Object.entries(topics).flatMap(([topic, hosts]) => hosts.map((host) => [host, topic] as const)));

function categoryKey(url: string): string | undefined {
  if (!/^https?:\/\//i.test(url)) return;
  const host = hostOf(url).replace(/\.$/, "");
  if (!host) return;
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host)) return "topic:Local Development";
  let domain = host;
  while (true) {
    const topic = topicByHost.get(domain);
    if (topic) return `topic:${topic}`;
    const dot = domain.indexOf(".");
    if (dot < 0) return `site:${host}`;
    domain = domain.slice(dot + 1);
  }
}

const OTHER_KEY = "other";

type Assignment = { key: string; tabIds: string[]; groupId?: string };
type Plan = Assignment[];
const planCache = new WeakMap<string[], { tabs: BrowserState["tabs"]; groups: BrowserState["groups"]; splits: BrowserState["splits"]; plan: Plan }>();

function categoryName(key: string, ids: string[], tabs: BrowserState["tabs"]): string {
  if (key === OTHER_KEY) return "Other";
  if (key.startsWith("site:")) return siteName(ids.map((id) => tabs[id]!));
  return key.slice(key.indexOf(":") + 1);
}

function tidyPlan(s: BrowserState, windowId: string, profileId: string): Plan {
  const window = s.windows[windowId];
  if (!window || window.profileId !== profileId || window.kind === "small") return [];
  const { list } = sidebarEntries(s, windowId, profileId);
  const cached = planCache.get(list);
  if (cached && cached.tabs === s.tabs && cached.groups === s.groups && cached.splits === s.splits) return cached.plan;
  const splitMembers = splitIndex(s.splits);
  const existing = new Map<string, string>();
  const tabs: Tab[] = [];
  const examples: Tab[] = [];
  const source = new Map<string, string>();
  function consider(entry: string, from?: string, reconsider = true) {
    const { kind, id } = parseEntry(entry);
    const tab = s.tabs[id];
    if (kind !== "tab" || splitMembers.has(id) || !tab || tab.pin || tab.liveItem || tab.windowId !== windowId || tab.profileId !== profileId) return;
    const choice = tab.tidyChoice;
    if (choice && choice.preferred === (from ?? null)) {
      if (from && from !== OTHER_KEY) examples.push(tab);
      return;
    }
    if (!reconsider) return;
    tabs.push(tab);
    if (from) source.set(id, from);
  }
  for (const entry of list) {
    const { kind, id } = parseEntry(entry);
    if (kind !== "group") {
      consider(entry);
      continue;
    }
    const group = s.groups[id]!;
    const key = group.tidyKey;
    if (!key || group.parentId || group.pinned || group.profileId !== profileId || group.windowId !== windowId || existing.has(key)) continue;
    existing.set(key, id);
    const reconsider = key === OTHER_KEY || (!key.startsWith("intent:") && group.name === categoryName(key, group.tabIds, s.tabs));
    if (reconsider || group.tabIds.some((tabId) => s.tabs[tabId]?.tidyChoice?.preferred === key)) {
      groupEntries(s, id).forEach((entry) => consider(entry, key, reconsider));
    }
  }

  const accepts = (tab: Pick<Tab, "id">, key: string) => !s.tabs[tab.id]?.tidyChoice?.rejected?.includes(key);
  const destinations = tidyIntents(tabs, new Set(existing.keys()), accepts, examples);
  const fallback = new Map<string, string[]>();
  for (const tab of tabs) {
    const from = source.get(tab.id);
    if (destinations.has(tab.id) || (from && from !== OTHER_KEY)) continue;
    const category = categoryKey(tab.url) ?? OTHER_KEY;
    const key = accepts(tab, category) ? category : OTHER_KEY;
    const ids = fallback.get(key);
    if (ids) ids.push(tab.id);
    else fallback.set(key, [tab.id]);
  }
  for (const [key, ids] of fallback) {
    const destination = existing.has(key) || ids.length >= 2 ? key : OTHER_KEY;
    for (const id of ids) if (accepts(s.tabs[id]!, destination)) destinations.set(id, destination);
  }

  const changes = new Map<string, Set<string>>();
  function members(key: string) {
    let ids = changes.get(key);
    if (!ids) {
      const groupId = existing.get(key);
      ids = new Set(groupId ? s.groups[groupId]!.tabIds : []);
      changes.set(key, ids);
    }
    return ids;
  }
  for (const { id } of tabs) {
    const from = source.get(id);
    const to = destinations.get(id);
    if (!to || to === from) continue;
    if (from) members(from).delete(id);
    members(to).add(id);
  }
  const plan: Plan = [];
  for (const [key, ids] of changes) {
    plan.push({ key, groupId: existing.get(key), tabIds: [...ids] });
  }
  plan.sort((a, b) => Number(a.key === OTHER_KEY) - Number(b.key === OTHER_KEY));
  planCache.set(list, { tabs: s.tabs, groups: s.groups, splits: s.splits, plan });
  return plan;
}

export const canTidyTabs = (s: BrowserState, windowId: string, profileId: string) => tidyPlan(s, windowId, profileId).length > 0;

export function tidyTabs(windowId: string, profileId: string): boolean {
  const s = useBrowser.getState();
  const plan = tidyPlan(s, windowId, profileId);
  if (!plan.length) return false;
  const groups = { ...s.groups };
  for (const { key, tabIds, groupId } of plan) {
    if (!tabIds.length && groupId) {
      delete groups[groupId];
    } else if (groupId) {
      const group = groups[groupId]!;
      groups[groupId] = { ...group, tabIds };
      if (group.shownTabIds) {
        const shown = group.shownTabIds.filter((id) => tabIds.includes(id));
        if (shown.length) groups[groupId].shownTabIds = shown;
        else delete groups[groupId].shownTabIds;
      }
    } else {
      const id = newId("g");
      const name = categoryName(key, tabIds, s.tabs);
      groups[id] = { id, windowId, profileId, tidyKey: key, name, tabIds, icon: null, color: null, pinned: false, collapsed: false, createdAt: Date.now() };
    }
  }
  const other = Object.values(groups).find((g) => g.tidyKey === OTHER_KEY && !g.parentId && !g.pinned && g.windowId === windowId && g.profileId === profileId);
  let windows = s.windows;
  if (other) {
    const window = windows[windowId]!;
    const members = new Set(other.tabIds);
    const profileTabs = window.tabIds.filter((id) => s.tabs[id]?.profileId === profileId);
    const ordered = [...profileTabs.filter((id) => !members.has(id)), ...profileTabs.filter((id) => members.has(id))];
    let index = 0;
    const tabIds = window.tabIds.map((id) => s.tabs[id]?.profileId === profileId ? ordered[index++]! : id);
    windows = { ...windows, [windowId]: { ...window, tabIds } };
  }
  useBrowser.setState(withGroupsPlaced({ ...s, windows }, windowId, groups));
  return true;
}
