import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { COMMA_KEYS, INSTANCE_KEYS, TEST_KEYS, launchVariables, mergeLaunchEnv } from "./launchEnv.mjs";

test("an extra VOYAGER_INSTANCE adds to the defaults instead of replacing them", () => {
  const base = { VOYAGER_BACKGROUND: "1", ...launchVariables({ instance: { updateFeed: "http://127.0.0.1:1/appcast.xml", allowOcclusion: true } }) };
  const merged = mergeLaunchEnv(base, { VOYAGER_INSTANCE: "chromiumSwitches=--enable-features=A,B --x" });
  assert.equal(merged.VOYAGER_BACKGROUND, "1");
  assert.equal(merged.VOYAGER_INSTANCE, "updateFeed=http://127.0.0.1:1/appcast.xml,allowOcclusion,chromiumSwitches=--enable-features=A,B --x");
});

test("a later entry for the same key wins, and test, trace and switch lists merge the same way", () => {
  const merged = mergeLaunchEnv(
    launchVariables({ instance: { downloadsDir: "/a" }, test: { reauth: "granted" }, trace: ["pip"], switchOverrides: { launchTab: false } }),
    { VOYAGER_INSTANCE: "downloadsDir=/b", VOYAGER_TEST: "keychain=file", VOYAGER_TRACE: "visibility,pip", VOYAGER_SWITCHES: "launchTab=on,webkitSignIn=on" },
  );
  assert.equal(merged.VOYAGER_INSTANCE, "downloadsDir=/b");
  assert.equal(merged.VOYAGER_TEST, "reauth=granted,keychain=file");
  assert.equal(merged.VOYAGER_TRACE, "pip,visibility");
  assert.equal(merged.VOYAGER_SWITCHES, "launchTab=on,webkitSignIn=on");
});

test("repeated entries of one variable each add their keys", () => {
  const merged = mergeLaunchEnv({ VOYAGER_INSTANCE: "allowAudio" }, { VOYAGER_INSTANCE: "allowOcclusion" }, { VOYAGER_TEST: "reauth=granted" }, { VOYAGER_TEST: "contextMenu" });
  assert.equal(merged.VOYAGER_INSTANCE, "allowAudio,allowOcclusion");
  assert.equal(merged.VOYAGER_TEST, "reauth=granted,contextMenu");
});

test("other variables pass through, a null one included (it unsets the variable)", () => {
  assert.deepEqual(mergeLaunchEnv({ HOME: "/h", VOYAGER_DATA_DIR: "/d" }, { VOYAGER_DATA_DIR: null }), { HOME: "/h", VOYAGER_DATA_DIR: null });
});

test("a comma-holding value stops at the next key the app knows", () => {
  const merged = mergeLaunchEnv({ VOYAGER_TEST: "liveMock=http://x/a,b" }, { VOYAGER_TEST: "appMenu" }, { VOYAGER_TEST: "importDiaWindows=2" });
  assert.equal(merged.VOYAGER_TEST, "liveMock=http://x/a,b,appMenu,importDiaWindows=2");
});

test("the key tables match the ones ArdiaLaunchConfig.mm reads", () => {
  const source = readFileSync(new URL("../../packages/ardiacore/ios/ArdiaLaunchConfig.mm", import.meta.url), "utf8");
  const keysOf = (fn) => {
    const body = source.match(new RegExp(`\\*${fn}\\(\\) \\{\\n  return @\\[([^\\]]*)\\]`))?.[1];
    assert.ok(body, `${fn}() not found in ArdiaLaunchConfig.mm`);
    return [...body.matchAll(/@"(\w+)"/g)].map((m) => m[1]);
  };
  assert.deepEqual(new Set(INSTANCE_KEYS), new Set(keysOf("InstanceKeys")));
  assert.deepEqual(new Set(TEST_KEYS), new Set([...keysOf("EngineTestKeys"), ...keysOf("AppTestKeys")]));
  assert.deepEqual(new Set(COMMA_KEYS), new Set(keysOf("KeysWhoseValuesHoldCommas")));
});
