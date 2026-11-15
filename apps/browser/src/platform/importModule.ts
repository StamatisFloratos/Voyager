import type * as ImportApi from "@voyager/import";

export type {
  BookmarkNode,
  BrowserProfile,
  BrowserSource,
  Credential,
  DiaTabsProfile,
  DiaTabsResult,
  ImportedExtension,
  ImportedFavicon,
  ImportedTab,
  ImportKind,
  ImportResult,
  SafariExport,
  SpaceSuggestion,
  SpaceSummary,
} from "@voyager/import";

let api: typeof ImportApi | undefined;

export const importModule = (): typeof ImportApi => (api ??= require("@voyager/import") as typeof ImportApi);
