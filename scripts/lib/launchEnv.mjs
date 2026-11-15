import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";

const list = (entries) =>
  Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => (value === true ? key : `${key}=${value}`))
    .join(",");

export function launchVariables({ instance = {}, test = {}, trace = [], switchOverrides = {} } = {}) {
  const env = {};
  const instanceList = list(instance);
  const testList = list(test);
  const switchList = Object.entries(switchOverrides).map(([name, on]) => `${name}=${on ? "on" : "off"}`).join(",");
  if (instanceList) env.VOYAGER_INSTANCE = instanceList;
  if (testList) env.VOYAGER_TEST = testList;
  if (trace.length) env.VOYAGER_TRACE = trace.join(",");
  if (switchList) env.VOYAGER_SWITCHES = switchList;
  return env;
}

const OLD_INSTANCE = {
  jsLocation: "VOYAGER_JS_LOCATION", chromiumSwitches: "VOYAGER_CHROMIUM_SWITCHES", downloadsDir: "VOYAGER_DOWNLOADS_DIR",
  updateFeed: "VOYAGER_UPDATE_FEED_URL", allowAudio: "VOYAGER_ALLOW_AUDIO", allowOcclusion: "VOYAGER_ALLOW_OCCLUSION",
  releaseNotes: "VOYAGER_RELEASE_NOTES", cliHome: "VOYAGER_CLI_HOME", cliBinDir: "VOYAGER_CLI_BIN_DIR", cliUrl: "VOYAGER_CLI_URL",
  syncFolder: "VOYAGER_SYNC_DEFAULT_FOLDER", importSourceDir: "VOYAGER_IMPORT_SOURCE_DIR", importSafariHome: "VOYAGER_IMPORT_SAFARI_HOME",
};
const OLD_TEST = {
  keychain: "VOYAGER_TEST_KEYCHAIN", keychainHiddenReads: "VOYAGER_TEST_KEYCHAIN_HIDDEN_READS", keychainFail: "VOYAGER_TEST_KEYCHAIN_FAIL",
  safeStorageAnswer: "VOYAGER_TEST_SAFE_STORAGE_ANSWER", reauth: "VOYAGER_TEST_REAUTH", pipSelfTest: "VOYAGER_PIP_SELFTEST",
  pipHover: "VOYAGER_PIP_HOVER", fakeFullScreenMs: "VOYAGER_FAKE_FULLSCREEN_MS", shadersKeyWindow: "VOYAGER_SHADERS_FORCE_KEY",
  peekStrict: "VOYAGER_PEEK_STRICT", importSecret: "VOYAGER_IMPORT_TEST_SECRET", importDiaBundleId: "VOYAGER_IMPORT_DIA_BUNDLE_ID",
  cliInstallScript: "VOYAGER_CLI_INSTALL_SCRIPT", legacySource: "VOYAGER_LEGACY_SOURCE", legacyCrashAfter: "VOYAGER_LEGACY_CRASH_AFTER",
  bangsUrl: "VOYAGER_BANGS_URL", onboarding: "VOYAGER_ONBOARDING", whatsNew: "VOYAGER_WHATS_NEW", telemetry: "VOYAGER_TELEMETRY",
  liveMock: "VOYAGER_LIVE_MOCK", calendarFixture: "VOYAGER_CALENDAR_FIXTURE",
};
const OLD_TEST_SWITCH = {
  bluetoothChooser: "--ardia-test-bluetooth-chooser", externalProtocolNoLaunch: "--ardia-test-external-protocol-no-launch",
  mediaRouteProvider: "--ardia-test-media-route-provider", systemMediaPermission: "--ardia-test-system-media-permission",
  applyProfileGate: "--ardia-apply-profile-gate",
};
const OLD_TRACE = { visibility: "VOYAGER_TRACE_VISIBILITY", pip: "VOYAGER_TRACE_PIP", pipZoom: "VOYAGER_PIP_ZOOM_TRACE" };

export const INSTANCE_KEYS = [
  "jsLocation", "chromiumSwitches", "downloadsDir", "updateFeed", "allowAudio", "allowOcclusion", "releaseNotes",
  "cliHome", "cliBinDir", "cliUrl", "syncFolder", "sharedFolders", "importSourceDir", "importSafariHome",
];
export const TEST_KEYS = [
  "keychain", "keychainHiddenReads", "keychainFail", "safeStorageAnswer", "reauth", "bluetoothChooser",
  "externalProtocolNoLaunch", "externalProtocolApp", "mediaRouteProvider", "systemMediaPermission", "applyProfileGate", "contextMenu",
  "loginsDelay", "loginsReleaseAfter", "cdpTabsVisible", "nativeDragRefused",
  "pipSelfTest", "pipHover", "fakeFullScreenMs", "shadersKeyWindow", "peekStrict", "importSecret", "importDiaBundleId", "importDiaWindows",
  "cliInstallScript", "legacySource", "legacyCrashAfter", "bangsUrl", "onboarding", "whatsNew", "telemetry",
  "liveMock", "calendarFixture", "appMenu", "appDialog", "loginsTimeout", "screenRecording", "systemLocationPermission",
];
export const COMMA_KEYS = [
  "chromiumSwitches", "downloadsDir", "updateFeed", "cliHome", "cliBinDir", "cliUrl", "syncFolder", "sharedFolders", "importSourceDir",
  "importSafariHome", "importSecret", "cliInstallScript", "legacySource", "bangsUrl", "liveMock",
];

const knownKeys = { instance: INSTANCE_KEYS, test: TEST_KEYS };
const commaKeys = new Set(COMMA_KEYS);

export const instanceEntries = (text) => entriesOf(text, knownKeys.instance);

const LIST_VARIABLES = new Set(["VOYAGER_INSTANCE", "VOYAGER_TEST", "VOYAGER_TRACE", "VOYAGER_SWITCHES"]);

export function mergeLaunchEnv(...envs) {
  const out = {};
  const instance = {}, test = {}, switches = {};
  const trace = new Set();
  for (const env of envs) {
    for (const [name, value] of Object.entries(env ?? {})) {
      if (!LIST_VARIABLES.has(name) || value === null || value === undefined) {
        out[name] = value;
        continue;
      }
      if (name === "VOYAGER_INSTANCE") Object.assign(instance, entriesOf(value, knownKeys.instance));
      else if (name === "VOYAGER_TEST") Object.assign(test, entriesOf(value, knownKeys.test));
      else if (name === "VOYAGER_TRACE") for (const area of value.split(",").map((a) => a.trim()).filter(Boolean)) trace.add(area);
      else
        for (const piece of value.split(",")) {
          const [switchName, on] = piece.split("=").map((s) => s.trim());
          if (switchName && on) switches[switchName] = ["on", "1", "true"].includes(on);
        }
    }
  }
  const bare = (entries) => Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value === "1" ? true : value]));
  return { ...out, ...launchVariables({ instance: bare(instance), test: bare(test), trace: [...trace], switchOverrides: switches }) };
}

function entriesOf(text, known) {
  const entries = {};
  let last = null;
  for (const piece of (text ?? "").split(",")) {
    const key = piece.split("=")[0].trim();
    if (!known.includes(key) && commaKeys.has(last)) {
      entries[last] += `,${piece}`;
      continue;
    }
    const at = piece.indexOf("=");
    if (key) entries[key] = at < 0 ? "1" : piece.slice(at + 1).trim();
    last = key;
  }
  return entries;
}

const readsLaunchConfig = new Map();
function binaryReadsLaunchConfig(binary) {
  const debugDylib = `${binary}.debug.dylib`;
  if (existsSync(debugDylib)) binary = debugDylib;
  if (readsLaunchConfig.has(binary)) return readsLaunchConfig.get(binary);
  const needle = Buffer.from("VOYAGER_INSTANCE");
  const fd = openSync(binary, "r");
  const chunk = Buffer.alloc(1 << 22);
  let found = false;
  try {
    const size = statSync(binary).size;
    for (let at = 0; at < size && !found; at += chunk.length - needle.length) {
      const read = readSync(fd, chunk, 0, chunk.length, at);
      found = chunk.subarray(0, read).includes(needle);
    }
  } finally {
    closeSync(fd);
  }
  readsLaunchConfig.set(binary, found);
  return found;
}

export function forBuild(binary, env) {
  if (binaryReadsLaunchConfig(binary)) return env;
  const { VOYAGER_INSTANCE, VOYAGER_TEST, VOYAGER_TRACE, ...rest } = env;
  const instance = entriesOf(VOYAGER_INSTANCE, knownKeys.instance);
  const test = entriesOf(VOYAGER_TEST, knownKeys.test);
  const out = { ...rest };
  for (const [key, value] of Object.entries(instance)) if (OLD_INSTANCE[key]) out[OLD_INSTANCE[key]] = value;
  for (const [key, value] of Object.entries(test)) if (OLD_TEST[key]) out[OLD_TEST[key]] = value;
  const switches = Object.entries(test).filter(([key]) => OLD_TEST_SWITCH[key])
    .map(([key, value]) => (value === "1" ? OLD_TEST_SWITCH[key] : `${OLD_TEST_SWITCH[key]}=${value}`));
  const data = env.VOYAGER_DATA_DIR;
  if (test.contextMenu && data) out.VOYAGER_CONTEXT_MENU_LOG = `${data}/context-menu.json`;
  for (const area of (VOYAGER_TRACE ?? "").split(",").filter(Boolean)) {
    if (OLD_TRACE[area]) out[OLD_TRACE[area]] = "1";
    if (area === "trafficLights" && data) out.VOYAGER_TRAFFIC_LIGHTS_LOG = `${data}/traffic-lights.log`;
    if (area === "profileGate") switches.push("--ardia-show-profile-gate");
  }
  if (switches.length) out.VOYAGER_CHROMIUM_SWITCHES = [out.VOYAGER_CHROMIUM_SWITCHES, ...switches].filter(Boolean).join(" ");
  return out;
}
