import type { BrowserState } from "../browser/store";
import { innermostGroupOf } from "./groupNesting";

type Placement = Pick<BrowserState, "tabs" | "groups">;

export function rememberTidyMove<T extends Placement>(before: Placement, after: T, ids: string[]): T {
  if (before.groups === after.groups) return after;
  let tabs = after.tabs;
  for (const id of ids) {
    const tab = after.tabs[id];
    if (!tab) continue;
    const from = innermostGroupOf(before.groups, id)?.tidyKey;
    const to = innermostGroupOf(after.groups, id)?.tidyKey;
    if (from === to) continue;
    const rejected = (tab.tidyChoice?.rejected ?? []).filter((key) => key !== to);
    if (from && !rejected.includes(from)) rejected.push(from);
    if (tabs === after.tabs) tabs = { ...tabs };
    tabs[id] = { ...tab, tidyChoice: { preferred: to ?? null, ...(rejected.length ? { rejected } : {}) } };
  }
  return tabs === after.tabs ? after : { ...after, tabs };
}
