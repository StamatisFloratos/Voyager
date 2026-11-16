import { SIDEBAR_GROUP, SIDEBAR_ROW } from "../../lib/sidebarMetrics";
import type { BrowserState } from "../browser/store";
import { groupIndex } from "../browser/structure";
import { groupEntries, keptEntries, sidebarEntries } from "./entries";
import { entryId, entryKey } from "./entryKey";
import { entryHeight, headGap } from "./geometry";

type Position = { top: number; depth: number; parent?: string };

function listPositions(s: BrowserState, windowId: string, profileId: string) {
  const rows = new Map<string, Position>();
  const visit = (entries: string[], top: number, depth: number, parent?: string) => {
    for (const key of entries) {
      rows.set(key, { top, parent, depth });
      const id = entryId(key, "group");
      if (id !== null) {
        const children = s.groups[id]?.collapsed ? keptEntries(s, windowId, profileId, id) : groupEntries(s, id);
        visit(children, top + SIDEBAR_GROUP.border + SIDEBAR_ROW.height + headGap(children[0]), depth + 1, key);
      }
      top += entryHeight(s, windowId, profileId, key) + SIDEBAR_ROW.gap;
    }
    return top;
  };
  const end = visit(sidebarEntries(s, windowId, profileId).list, 0, 0);
  return { rows, end };
}

export function listActionLayout(before: BrowserState, after: BrowserState, windowId: string, profileId: string) {
  const old = listPositions(before, windowId, profileId);
  const next = listPositions(after, windowId, profileId);
  const offsets = new Map<string, number>();
  const absolute = new Map<string, number>();
  for (const [key, { top, parent }] of next.rows) {
    const inherited = parent ? absolute.get(parent) ?? 0 : 0;
    const previous = old.rows.get(key);
    const delta = previous ? previous.top - top : inherited;
    if (delta !== inherited) offsets.set(key, delta - inherited);
    absolute.set(key, delta);
  }
  const departures: { key: string; top: number; depth: number; wholeGroup: boolean; destination?: number }[] = [];
  const covered = new Set<string>();
  const categories = groupIndex(after.groups);
  for (const [key, { top, parent, depth }] of old.rows) {
    if (next.rows.has(key)) continue;
    if (parent && covered.has(parent)) {
      covered.add(key);
      continue;
    }
    const groupId = entryId(key, "group");
    const wholeGroup = !!groupId && !!before.groups[groupId]?.tabIds.every((id) => !after.tabs[id]);
    if (wholeGroup) covered.add(key);
    const tabId = entryId(key, "tab");
    const category = tabId && categories.get(tabId);
    const destination = category ? next.rows.get(entryKey("group", category.id))?.top : undefined;
    departures.push({ key, top, depth, wholeGroup, destination });
  }
  return { rows: offsets, departures, tail: old.end - next.end };
}
