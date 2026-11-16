import { tabTitle } from "../../state/browser/model";
import { recentTabSuggestions, type Suggestion } from "@voyager/core";
import { useMemo } from "react";
import { useSettings, useWindow } from "../../state/browser/hooks";
import { usePeeks } from "../../state/peek/hooks";
import { useTabs } from "../../state/tabs/hooks";
import { openTabsByUse } from "../../state/tabs/tabShare";
import { commandBarTabLimit, keepsOpenTab } from "../../state/omnibox/commandBarStart";

const NO_TABS: Suggestion[] = [];

export function useOpenTabsStart(enabled: boolean, windowId: string, profileId: string): Suggestion[] {
  const tabs = useTabs((all) => (enabled ? all : null));
  const peeks = usePeeks((all) => (enabled ? all : null));
  const shared = useSettings((st) => !!st.shareTabsAcrossWindows);
  const start = useSettings((st) => st.commandBarStart);
  const active = useWindow(windowId, (w) => (enabled ? w?.activeTabIds[profileId] : undefined));
  return useMemo(() => {
    if (!tabs || !peeks) return NO_TABS;
    const limit = commandBarTabLimit(start);
    if (limit === 0) return NO_TABS;
    const rows = openTabsByUse(tabs, peeks, { profileId, windowId, shared })
      .filter(({ tab: t }) => keepsOpenTab(start, t.pin))
      .map(({ tab: t, lastActiveAt }) => ({ id: t.id, url: t.url, title: tabTitle(t), favicon: t.favicon, lastActiveAt }));
    return recentTabSuggestions(rows, { exclude: active, limit });
  }, [tabs, peeks, active, profileId, shared, windowId, start]);
}
