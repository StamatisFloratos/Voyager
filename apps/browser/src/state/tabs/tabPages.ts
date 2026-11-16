import { claimLaunchTab, prepareTabTransfer, releaseTabTransfer, type PageEngine } from "../../platform/tabs";
import { isWebPageUrl } from "../../lib/url";
import { isInternalTab } from "../pages/urls";
import { useBrowser } from "../browser/store";
import { changedIds } from "../browser/changes";
import { earlyLaunchTabOn, launchTab } from "./launchTab";
import { engineProfile } from "../browser/model";
import { hasPage, navigationOf } from "./pageSession";
import { tabEngine } from "../engines/engines";
import type { Tab } from "../browser/types";
import { webviews } from "../../platform/webviews";
import { issuedSeq } from "./earlyNavigate";
import { focusedWindowOf } from "../windows/ui";

export const wantsPage = (t: Tab | undefined): t is Tab => !!t && hasPage(t) && !isInternalTab(t);

const restoring = new Map<string, string>();

export const restoringTabUrl = (tabId: string): string | undefined => restoring.get(tabId);
export function finishTabMount(tabId: string) {
  restoring.delete(tabId);
}

const atRestoreUrl = (tab: Tab, url: string) => tab.url === url && (navigationOf(tab)?.url ?? url) === url;

type Handoff = { seq: number | undefined; engine: PageEngine };
const handedOff = new Map<string, string>();
const handoffs = new Map<string, Handoff>();

export const hasTabHandOff = (tabId: string, engine: PageEngine): boolean => handoffs.get(tabId)?.engine === engine;

export function takeHandOff(tabId: string, engine: PageEngine): Handoff | null {
  const handoff = handoffs.get(tabId);
  if (!handoff || !handedOff.has(tabId)) return null;
  handoffs.delete(tabId);
  handedOff.delete(tabId);
  if (handoff.engine === engine) return handoff;
  releaseTabTransfer(tabId);
  return null;
}

export function handOff(tabId: string, profile: string, engine: PageEngine) {
  handedOff.set(tabId, profile);
  handoffs.set(tabId, { seq: issuedSeq(tabId), engine });
  prepareTabTransfer(tabId);
}

export function startTabPages() {
  for (const tab of Object.values(useBrowser.getState().tabs)) {
    if (isWebPageUrl(tab.url) && atRestoreUrl(tab, tab.url)) restoring.set(tab.id, tab.url);
  }
  claimLaunch();
  useBrowser.subscribe((s, prev) => {
    if (s.tabs === prev.tabs) return;
    for (const id of changedIds(s.tabs, prev.tabs)) {
      const tab = s.tabs[id];
      const before = prev.tabs[id];
      const restoreUrl = restoring.get(id);
      if (restoreUrl && (!tab || tab.createdAt !== before?.createdAt || !atRestoreUrl(tab, restoreUrl))) {
        restoring.delete(id);
      }
      const profile = tab && engineProfile(s, tab.profileId);
      if (tab && before && tab.windowId !== before.windowId && webviews.has(id) && profile === engineProfile(s, before.profileId)) handOff(id, profile!, tabEngine(s, id));
      const kept = handedOff.get(id);
      if (kept !== undefined && !(wantsPage(tab) && profile === kept)) {
        handedOff.delete(id);
        handoffs.delete(id);
        releaseTabTransfer(id);
      }
    }
  });
}

function claimLaunch() {
  const s = useBrowser.getState();
  const launch = earlyLaunchTabOn() ? launchTab(s, focusedWindowOf(s)) : null;
  const tab = launch ? s.tabs[launch.id] : undefined;
  const kept = launch && wantsPage(tab) && navigationOf(tab)?.url === launch.url && tabEngine(s, launch.id) === "chromium" ? launch : null;
  if (kept) {
    handedOff.set(kept.id, kept.profile);
    handoffs.set(kept.id, { seq: navigationOf(tab)?.seq, engine: "chromium" });
  }
  claimLaunchTab(kept?.id ?? "", kept?.url ?? "", kept?.profile ?? "");
}
