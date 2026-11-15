import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REPO } from "./repo.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the browser and CLI release tools point to Voyager", () => {
  assert.equal(/^REPO="([^"]+)"$/m.exec(read("scripts/lib/releases.sh"))?.[1], REPO);
  assert.equal(/^repo=(\S+)$/m.exec(read("apps/cli/install.sh"))?.[1], REPO);
  const plist = read("apps/browser/macos/Voyager-macOS/Info.plist");
  const url = (key) => new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`).exec(plist)?.[1];
  assert.equal(url("ACReleaseNotesURL"), `https://github.com/${REPO}/releases`);
  assert.ok(url("ACFeedbackURL")?.startsWith(`https://github.com/${REPO}/issues/new`));
});

test("the archived website links to the upstream releases it describes", () => {
  const upstream = /^export const REPO_SLUG = "([^"]+)";$/m.exec(read("apps/site/src/data/release.ts"))?.[1];
  assert.ok(["ardia-browser/ardia", "mantrakp04/ardia"].includes(upstream));
  const nginx = [...read("infra/site/nginx.conf").matchAll(/github(?:usercontent)?\.com\/([\w-]+\/[\w-]+)\//g)].map((m) => m[1]);
  assert.ok(nginx.length >= 3);
  assert.deepEqual([...new Set(nginx)], [upstream]);
});
