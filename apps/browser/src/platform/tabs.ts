import { call, nativeModule, on, type TabStripTransaction } from "@voyager/ardiacore";

export {
  sendTabStripCommand,
  type LinkRoute,
  type StripTab,
  type StripGroup,
  type StripState,
  type TabStripCommand,
  type TabStripTransaction,
  type PageEngine,
  type WebViewHandle,
  type NavigationState,
  type BlockedPopup,
  type CrashInfo,
  type MediaAccess,
  type SecurityInfo,
  type AutofillPrompt,
  type AutofillPromptAnswer,
  type PasswordPrompt,
  type PasswordPromptAnswer,
  type OpenWindowRequest,
  type WebNotification,
  type PageSelection,
  type ScrollState,
  type ProtectedMediaRequest,
  type AppBadge,
} from "@voyager/ardiacore";

const Tabs = nativeModule("ArdiaTabs");

export const prepareTabTransfer = (tabId: string) => Tabs.prepareTransfer(tabId);
export const releaseTabTransfer = (tabId: string) => Tabs.releaseTransfer(tabId);
export const claimLaunchTab = (tabId: string, url: string, profile: string) => Tabs.claimLaunchTab(tabId, url, profile);
export const revealTab = (tabId: string) => Tabs.revealTab(tabId);
export const dropTabReveals = (tabId: string) => Tabs.dropTabReveals(tabId);
export const revealOffered = (adoptId: string, overTabId: string) => Tabs.revealOffered(adoptId, overTabId);
export const discardOffered = (adoptId: string) => Tabs.discardOffered(adoptId);
export const routeLinkTabs = (urls: string[]) => call("tabs.routeLinkTabs", { urls });

export const onTabStripTransaction = (listener: (tx: TabStripTransaction) => void) => on("tabs.strips", listener);
export const tabStrips = () => call("tabs.strips");
let commitObservers = 0;

export function observePageCommits() {
  if (++commitObservers === 1) void call("tabs.reportCommits", { on: true }).catch(() => {});
  return () => {
    if (--commitObservers === 0) void call("tabs.reportCommits", { on: false }).catch(() => {});
  };
}

export const lastTabClosesWindow = () => call("tabs.lastTabPolicy").then((r) => r.closesWindow);
