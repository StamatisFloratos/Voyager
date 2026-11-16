import type { SearchScope } from "@voyager/core";
import { useMemo, type RefObject } from "react";
import type { TextInput } from "react-native";
import { previewText } from "./barText";
import { offeredScope } from "../../state/omnibox/scopes";
import { useOpenTabsStart } from "./dropdownStart";
import { useInlineCompletion } from "./useInlineCompletion";
import { useSuggestions } from "./useSuggestions";

const MAX_POPUP_SUGGESTIONS = 5;

export function useBarItems({
  input,
  typed,
  edited,
  scope,
  suppressCompletion,
  selected,
  popup,
  windowId,
  profileId,
  tabId,
  currentUrl,
}: {
  input: RefObject<TextInput | null>;
  typed: string;
  edited: boolean;
  scope: SearchScope | null;
  suppressCompletion: boolean;
  selected: number;
  popup: boolean;
  windowId: string;
  profileId: string;
  tabId: string;
  currentUrl: string;
}) {
  const { items: suggested, completion } = useSuggestions({
    text: typed,
    active: edited || !!scope,
    windowId,
    profileId,
    currentTabId: tabId,
    currentUrl: currentUrl || undefined,
    scope,
    preventInline: suppressCompletion,
  });
  const idle = popup && !scope && (!edited || !typed.trim());
  const openTabs = useOpenTabsStart(idle, windowId, profileId);
  const items = useMemo(() => {
    if (idle) return openTabs;
    return popup && suggested.length > MAX_POPUP_SUGGESTIONS ? suggested.slice(0, MAX_POPUP_SUGGESTIONS) : suggested;
  }, [idle, openTabs, popup, suggested]);
  const unpreviewed = idle ? -1 : 0;
  const selectedIndex = selected < 0 && idle ? -1 : Math.min(Math.max(selected, 0), items.length - 1);
  const current = items[selectedIndex];
  const preview = selectedIndex > unpreviewed ? (previewText(current) ?? typed) : null;
  const previewing = preview !== null;
  const inline = useInlineCompletion(input, typed, suppressCompletion || scope ? "" : completion, preview);
  const shownCompletion = previewing ? "" : inline.shown;
  const value = preview ?? typed + shownCompletion;
  const tabScope = useMemo(
    () => (!scope && edited && !previewing ? offeredScope(typed, shownCompletion, windowId) : null),
    [scope, edited, previewing, typed, shownCompletion, windowId],
  );
  return { items, completion, inline, shownCompletion, value, selectedIndex, current, tabScope, previewing, unpreviewed };
}
