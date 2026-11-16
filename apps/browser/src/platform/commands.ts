import { nativeModule, type CommandEvent, type MenuState } from "@voyager/shell";

export type { CommandEvent, BrowserCommand, MenuShortcut, ShortcutModifier, MenuState, MenuBookmark } from "@voyager/shell";

const Menus = nativeModule("ArdiaMenus");

const searchItem = "newTab:search";
const searchTitle = "New Tab Search";
let usesLegacyWindowItem = false;

export const onCommand = (listener: (e: CommandEvent) => void) => Menus.addListener("onCommand", (e) => {
  listener(usesLegacyWindowItem && e.command === "newWindow" && !e.arg && e.windowId
    ? { ...e, command: "newTab", arg: "search" }
    : e);
});

export async function menuShortcuts() {
  const items = await Menus.menuShortcuts();
  usesLegacyWindowItem = items.some((item) => item.id === "newWindow") && !items.some((item) => item.id === searchItem);
  return usesLegacyWindowItem
    ? items.map((item) => item.id === "newWindow" ? { ...item, id: searchItem, title: searchTitle } : item)
    : items;
}
export const recordShortcut = () => Menus.recordShortcut();
export const cancelShortcutRecording = () => Menus.cancelRecording();

export function setMenuStateParts(state: MenuState, bookmarksChanged: boolean) {
  const { bookmarkFolders, recentBookmarks, bookmarksBar, otherBookmarks, ...rest } = state;
  if (bookmarksChanged) void Menus.setMenuBookmarks({ bookmarkFolders, recentBookmarks, bookmarksBar, otherBookmarks });
  if (usesLegacyWindowItem) {
    rest.titles = { ...rest.titles, newWindow: searchTitle };
    rest.shortcuts = { ...rest.shortcuts, newWindow: rest.shortcuts?.[searchItem] ?? [] };
  }
  return Menus.setMenuState(rest);
}
