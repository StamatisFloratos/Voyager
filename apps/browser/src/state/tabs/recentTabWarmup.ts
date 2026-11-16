import type { SystemState } from "../../platform/performance";
import { useBrowser, type BrowserState } from "../browser/store";
import { isInternalTab } from "../pages/urls";
import { holderOf } from "../pins/pinShare";
import { restoredLazily, wokenPage } from "./pageSession";
import { pageOf, usePages } from "./pageState";
import { shownTabIds } from "./shownTabs";

const store = () => useBrowser.getState();
const WARM_INTERVAL = 2000;

const foregroundLoading = (s: BrowserState) => [...shownTabIds(s)].some((id) => s.live[id]?.isLoading || pageOf(id).documentMesh !== null);

export function reloadRecentTabs(sys: SystemState) {
  const gb = sys.physicalMemory / 2 ** 30;
  const busy = sys.onBattery || sys.lowPowerMode || sys.memoryPressure !== "normal";
  const count = busy ? 0 : gb >= 32 ? 4 : gb >= 16 ? 3 : gb >= 8 ? 1 : 0;
  const s = store();
  const shown = shownTabIds(s);
  const since = Date.now() - 24 * 60 * 60_000;
  const ids = Object.values(s.tabs)
    .filter((t) => restoredLazily(t) && !shown.has(t.id) && !isInternalTab(t) && t.lastActiveAt >= since)
    .filter((t) => s.windows[t.windowId]?.profileId === t.profileId)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    .slice(0, count)
    .map((t) => t.id);
  let next = 0;
  function warmNext() {
    const now = store();
    if (foregroundLoading(now)) {
      const resumeIfIdle = () => {
        if (foregroundLoading(store())) return;
        offBrowser();
        offPages();
        setTimeout(warmNext, WARM_INTERVAL);
      };
      const offBrowser = useBrowser.subscribe((state, previous) => {
        if (state.live !== previous.live || state.windows !== previous.windows || state.tabs !== previous.tabs) resumeIfIdle();
      });
      const offPages = usePages.subscribe((state, previous) => {
        if (state.pages !== previous.pages) resumeIfIdle();
      });
      return;
    }
    while (next < ids.length) {
      const id = ids[next++]!;
      const tab = now.tabs[id];
      if (!tab || now.windows[tab.windowId]?.profileId !== tab.profileId || !restoredLazily(tab) || holderOf(now, id)) continue;
      now.updateTab(id, { page: wokenPage(tab) });
      break;
    }
    if (next < ids.length) setTimeout(warmNext, WARM_INTERVAL);
  }
  if (ids.length) setTimeout(warmNext, WARM_INTERVAL);
  return ids;
}
