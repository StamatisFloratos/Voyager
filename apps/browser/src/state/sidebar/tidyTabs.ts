import { hostOf } from "@voyager/core";
import { newId } from "../browser/model";
import { useBrowser, type BrowserState } from "../browser/store";
import { splitIndex } from "../browser/structure";
import { siteName } from "../groups/groupNames";
import { withGroupsPlaced } from "../groups/groups";
import { groupEntries, sidebarEntries } from "./entries";
import { parseEntry } from "./entryKey";

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

function tidyPlan(s: BrowserState, windowId: string, profileId: string): Plan {
  const window = s.windows[windowId];
  if (!window || window.profileId !== profileId || window.kind === "small") return [];
  const { list } = sidebarEntries(s, windowId, profileId);
  const cached = planCache.get(list);
  if (cached && cached.tabs === s.tabs && cached.groups === s.groups && cached.splits === s.splits) return cached.plan;
  const splitMembers = splitIndex(s.splits);
  const existing = new Map<string, string>();
  const candidates = new Map<string, string[]>();
  function consider(entry: string) {
    const { kind, id } = parseEntry(entry);
    const tab = s.tabs[id];
    if (kind !== "tab" || splitMembers.has(id) || !tab || tab.pin || tab.liveItem || tab.windowId !== windowId || tab.profileId !== profileId) return;
    const key = categoryKey(tab.url) ?? OTHER_KEY;
    const tabIds = candidates.get(key);
    if (tabIds) tabIds.push(id);
    else candidates.set(key, [id]);
  }
  for (const entry of list) {
    const { kind, id } = parseEntry(entry);
    if (kind !== "group") {
      consider(entry);
      continue;
    }
    const group = s.groups[id]!;
    if (!group.tidyKey || group.parentId || group.pinned || group.profileId !== profileId || group.windowId !== windowId || existing.has(group.tidyKey)) continue;
    existing.set(group.tidyKey, id);
    if (group.tidyKey === OTHER_KEY) groupEntries(s, id).forEach(consider);
  }

  const otherId = existing.get(OTHER_KEY);
  const oldOther = otherId ? s.groups[otherId]!.tabIds : [];
  const otherMembers = new Set(oldOther);
  const newcomers: string[] = [];
  const promoted = new Set<string>();
  const plan: Plan = [];
  for (const [key, tabIds] of candidates) {
    const groupId = existing.get(key);
    if (key !== OTHER_KEY && (groupId || tabIds.length >= 2)) {
      const members = groupId ? [...s.groups[groupId]!.tabIds, ...tabIds] : tabIds;
      plan.push({ key, tabIds: members, groupId });
      for (const id of tabIds) if (otherMembers.has(id)) promoted.add(id);
    } else {
      for (const id of tabIds) if (!otherMembers.has(id)) newcomers.push(id);
    }
  }
  if (newcomers.length || promoted.size) {
    plan.push({ key: OTHER_KEY, tabIds: [...oldOther.filter((id) => !promoted.has(id)), ...newcomers], groupId: otherId });
  }
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
      if (key === OTHER_KEY && group.shownTabIds) {
        const shown = group.shownTabIds.filter((id) => tabIds.includes(id));
        if (shown.length) groups[groupId].shownTabIds = shown;
        else delete groups[groupId].shownTabIds;
      }
    } else {
      const id = newId("g");
      const name = key === OTHER_KEY ? "Other" : key.startsWith("site:") ? siteName(tabIds.map((id) => s.tabs[id]!)) : key.slice("topic:".length);
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
