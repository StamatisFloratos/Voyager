import { viewportCanvasColor } from "./viewportPalette";
import { viewportReadiness } from "./viewportMedia";

export { viewportPaletteProbe } from "./viewportPalette";

export const viewportProbe = `
  const paintTime = name => performance.getEntriesByName(name, "paint")[0]?.startTime ?? null;
  const supportsPaint = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("paint");
  const result = (${viewportReadiness})(paintTime("first-contentful-paint") !== null, supportsPaint);
  const report = reason => {
    const fcp = paintTime("first-contentful-paint");
    const painted = fcp !== null || paintTime("first-paint") !== null || (!supportsPaint && reason !== "paint");
    post("result", JSON.stringify({ start: performance.timeOrigin, url: location.href, ready: reason === "ready", painted, fcp, reason, background: ${viewportCanvasColor} }));
  };
  if (typeof result === "string") report(result);
  else result.then(report, () => report("media"));
`;
