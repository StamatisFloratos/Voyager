import { isWebPageUrl, samePage } from "../../lib/url";
import { observePageCommits, type PageEngine, type WebViewHandle } from "../../platform/tabs";
import { webviews } from "../../platform/webviews";
import { viewportPaletteProbe, viewportProbe } from "./documentPaint";
import { setPageProgress } from "./pageProgress";
import { type DocumentMesh, patchPage } from "./pageState";

const FIRST_FRAME_MS = 100;
const RELOAD_FRAME_MS = 500;
const PROBE_MS = 40;
const PALETTE_MS = 200;
const NO_RESPONSE_MS = 1500;
const UNPAINTED_RESPONSE_MS = 6000;
const PRIMARY_CONTENT_RESPONSE_MS = 4000;
const MEDIA_LIMIT_MS = 3500;
const NAVIGATION_LIMIT_MS = 45000;
const hexColor = (value: unknown): value is string => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
type Viewport = { url: string; start: number; ready: boolean; painted: boolean; reason: string; background: string };
type Palette = { url: string; start: number; colors: string[] };
type RestoredDocument = { url: string; covered: boolean };

export function documentLoad(tabId: string, blankCanvas: string, restored?: RestoredDocument) {
  let watching = false;
  let visibleSince = 0;
  let commit = 0;
  let nativeCommit = 0;
  let destination = "";
  let firstCanvas: string | undefined;
  let checkingHistoryEntry = false;
  let needsInspection = false;
  let awaitingReload = false;
  let frameWait = FIRST_FRAME_MS;
  let generation = 0;
  let mesh: DocumentMesh | null = restored?.covered ? { id: generation, background: blankCanvas, colors: [], waitingForFrame: true } : null;
  let restoreLoaded = false;
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let paletteTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  function clearTimers() {
    clearTimeout(probeTimer);
    clearTimeout(paletteTimer);
    clearTimeout(deadline);
  }

  function stopWatchingFrame() {
    ++generation;
    clearTimeout(restoreTimer);
    clearTimers();
    if (mesh) {
      mesh = null;
      patchPage(tabId, { documentMesh: null });
    }
  }

  function cancel() {
    firstCanvas = undefined;
    checkingHistoryEntry = false;
    needsInspection = false;
    stopWatchingFrame();
  }

  function showCanvas(background: string) {
    mesh = { id: generation, background, colors: [] };
    patchPage(tabId, { documentMesh: mesh });
  }

  function awaitFirstDocument() {
    if (!watching) return;
    const id = generation;
    probeTimer = setTimeout(async () => {
      const view = webviews.get(tabId);
      if (!firstCanvas || !view) return;
      if (isWebPageUrl(destination) && !checkingHistoryEntry) {
        const previous = destination;
        const url = await view.evaluate<string>('post("result", JSON.stringify(location.href));').catch(() => null);
        if (id !== generation || view !== webviews.get(tabId) || !firstCanvas || !url || !samePage(url, previous)) return;
      }
      showCanvas(firstCanvas);
      deadline = setTimeout(cancel, NAVIGATION_LIMIT_MS);
    }, FIRST_FRAME_MS);
  }

  function approaching(url: string) {
    if ((restored && (!restoreLoaded || (mesh && !nativeCommit))) || firstCanvas || awaitingReload || !isWebPageUrl(destination) || !isWebPageUrl(url) || samePage(destination, url)) return;
    restored = undefined;
    cancel();
    firstCanvas = blankCanvas;
    awaitFirstDocument();
  }

  function observe() {
    const view = webviews.get(tabId);
    if (!view || !watching || !needsInspection) return;
    let url = destination;
    const evaluate = view.evaluate;
    const id = generation;
    let documentStart: number | undefined;
    const current = () => id === generation && view === webviews.get(tabId);
    const navigationLimit = commit + NAVIGATION_LIMIT_MS;
    let mediaLimit = navigationLimit;
    if (Date.now() >= navigationLimit) return cancel();

    function armDeadline(responseMs = NO_RESPONSE_MS) {
      clearTimeout(deadline);
      const left = Math.min(responseMs, mediaLimit - Date.now());
      deadline = setTimeout(cancel, Math.max(0, left));
    }

    async function sample(start: number) {
      const palette = await evaluate<Palette>(viewportPaletteProbe).catch(() => null);
      if (!current() || !mesh) return;
      const colors = palette?.start === start && typeof palette.url === "string" && samePage(palette.url, url) ? palette.colors : null;
      const previous = mesh.colors;
      if (Array.isArray(colors) && colors.length === 12 && colors.every(hexColor) &&
          colors.some((color, index) => color !== previous[index])) {
        mesh = { ...mesh, colors };
        patchPage(tabId, { documentMesh: mesh });
      }
      paletteTimer = setTimeout(() => void sample(start), PALETTE_MS);
    }

    async function inspect() {
      const frame = await evaluate<Viewport>(viewportProbe).catch(() => null);
      if (!current()) return;
      if (!frame || frame.ready !== false || !Number.isFinite(frame.start) || typeof frame.url !== "string" ||
          !hexColor(frame.background)) return cancel();
      if (restored && checkingHistoryEntry && isWebPageUrl(frame.url)) url = frame.url;
      if (!samePage(frame.url, url)) {
        if (checkingHistoryEntry && frame.url === "about:blank" && frame.reason === "paint") {
          firstCanvas = frame.background;
          if (!mesh) showCanvas(firstCanvas);
          armDeadline(navigationLimit - Date.now());
          return;
        }
        return cancel();
      }
      checkingHistoryEntry = false;
      if (!mesh && frame.painted) return cancel();
      if (documentStart !== undefined && frame.start !== documentStart) return cancel();
      const firstSample = documentStart === undefined;
      documentStart = frame.start;
      const empty = frame.reason === "shell" || frame.reason === "paint";
      const primaryPending = frame.reason === "shell" || frame.reason === "hero" || frame.reason === "gallery";
      if (frame.reason === "paint" || primaryPending) mediaLimit = navigationLimit;
      else if (mediaLimit === navigationLimit) {
        mediaLimit = Math.min(navigationLimit, Date.now() + MEDIA_LIMIT_MS);
      }
      const responseMs = frame.reason === "paint" ? UNPAINTED_RESPONSE_MS : primaryPending ? PRIMARY_CONTENT_RESPONSE_MS : NO_RESPONSE_MS;
      armDeadline(responseMs);
      if (!mesh) {
        mesh = { id, background: frame.background, colors: [] };
        patchPage(tabId, { documentMesh: mesh });
      } else if (mesh.background !== frame.background) {
        mesh = { ...mesh, background: frame.background };
        patchPage(tabId, { documentMesh: mesh });
      }
      if (firstSample) void sample(frame.start);
      probeTimer = setTimeout(inspect, empty ? 2 * PROBE_MS : PROBE_MS);
    }

    armDeadline();
    const firstFrame = Math.max(commit + frameWait, visibleSince + FIRST_FRAME_MS);
    probeTimer = setTimeout(inspect, mesh ? 0 : Math.max(0, firstFrame - Date.now()));
  }

  function restoreNavigation(url: string | undefined, at: number | undefined, finished: boolean) {
    if (!restored) return false;
    if (at && at < nativeCommit) return true;
    if ((at && nativeCommit && at > nativeCommit) || (at && url && !isWebPageUrl(url))) {
      restored = undefined;
      return false;
    }
    if (!url || !isWebPageUrl(url)) return true;
    if (at || finished) restoreLoaded = true;
    if (commit && (!at || at === nativeCommit) && samePage(destination, url) && !(finished && firstCanvas)) return true;
    ++generation;
    clearTimers();
    firstCanvas = undefined;
    checkingHistoryEntry = !at;
    nativeCommit = at || nativeCommit;
    commit = at || Date.now();
    destination = url;
    needsInspection = !!mesh;
    observe();
    return true;
  }

  return {
    cancel,
    approaching,
    currentMesh: () => mesh,
    watchPaint(engine: PageEngine) {
      watching = true;
      visibleSince = Date.now();
      const release = engine === "chromium" ? observePageCommits() : undefined;
      if (restored && mesh) {
        patchPage(tabId, { documentMesh: mesh });
        restoreTimer = setTimeout(() => {
          if (!mesh?.waitingForFrame) return;
          const { waitingForFrame, ...animated } = mesh;
          mesh = animated;
          patchPage(tabId, { documentMesh: mesh });
        }, FIRST_FRAME_MS);
        deadline = setTimeout(cancel, NAVIGATION_LIMIT_MS);
        observe();
      } else if (firstCanvas) awaitFirstDocument();
      else observe();
      return () => {
        watching = false;
        if (restored) cancel();
        else stopWatchingFrame();
        release?.();
      };
    },
    navigation(url: string | undefined, at: number | undefined, pendingCanvas?: string | null) {
      if (restoreNavigation(url, at, pendingCanvas === null)) return;
      if (pendingCanvas && !awaitingReload && !isWebPageUrl(destination)) {
        if (!firstCanvas) {
          firstCanvas = pendingCanvas;
          awaitFirstDocument();
        }
        return;
      }
      const web = !!url && isWebPageUrl(url);
      const adopted = !at && !commit && !awaitingReload && web;
      const resolved = !!at && at === nativeCommit && !destination && web;
      if (!adopted && !resolved && (!at || at <= nativeCommit)) {
        if (checkingHistoryEntry && pendingCanvas === null) {
          checkingHistoryEntry = false;
          if (firstCanvas) {
            firstCanvas = undefined;
            clearTimers();
            observe();
          }
          return;
        }
        if (firstCanvas && pendingCanvas === null) cancel();
        return;
      }
      const firstDocument = !!firstCanvas || checkingHistoryEntry;
      if (firstCanvas && web) {
        clearTimers();
        firstCanvas = undefined;
      } else cancel();
      frameWait = !firstDocument && destination && url && samePage(destination, url) ? RELOAD_FRAME_MS : FIRST_FRAME_MS;
      nativeCommit = at ?? 0;
      commit = at || Date.now();
      awaitingReload = false;
      checkingHistoryEntry = adopted && pendingCanvas !== null;
      destination = url ?? "";
      needsInspection = web;
      observe();
    },
    wrap(view: WebViewHandle): WebViewHandle {
      return {
        ...view,
        loadUrl(url, options) {
          if (restored && !nativeCommit && samePage(restored.url, url)) return view.loadUrl(url, options);
          restored = undefined;
          cancel();
          awaitingReload = false;
          approaching(url);
          return view.loadUrl(url, options);
        },
        reload() {
          restored = undefined;
          cancel();
          awaitingReload = true;
          setPageProgress(tabId, 0);
          return view.reload();
        },
        forceReload() {
          restored = undefined;
          cancel();
          awaitingReload = true;
          setPageProgress(tabId, 0);
          return view.forceReload();
        },
        stopLoading() {
          cancel();
          return view.stopLoading();
        },
      };
    },
  };
}
