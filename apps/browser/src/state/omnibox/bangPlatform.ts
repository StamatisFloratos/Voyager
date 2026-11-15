export const refreshesBangs = true;

export const loadBundledBangs = (): Promise<typeof import("@voyager/core/src/bangList.ts")> =>
  Promise.resolve().then(() => require("@voyager/core/src/bangList.ts"));
