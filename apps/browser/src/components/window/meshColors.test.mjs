import assert from "node:assert/strict";
import { test } from "node:test";
import { parseColor } from "../../lib/color.ts";
import { meshColors } from "./meshColors.ts";

test("a white viewport stays light with enough tonal variation for motion", () => {
  for (const samples of [[], Array(12).fill("#ffffff")]) {
    const fields = meshColors("#ffffff", samples).fields.map(parseColor);
    const levels = fields.map(([r, g, b]) => Math.min(r, g, b));
    assert.ok(Math.min(...levels) >= 230);
    assert.ok(Math.max(...levels) - Math.min(...levels) >= 12);
  }
});

test("color isolated in the lower left also reaches the upper and right-hand fields", () => {
  const samples = Array(12).fill("#303030");
  samples[8] = "#00ddeb";
  const fields = meshColors("#303030", samples).fields.map(parseColor);
  for (const [r, g, b] of fields) {
    assert.ok(g > r + 18 && b > r + 18);
  }
  assert.ok(fields[4][2] > fields[0][2] + 30);
});

test("the dominant saturated purple of a game grid does not crowd out its isolated gold accent", () => {
  const samples = Array(12).fill("#401470");
  const plain = meshColors(samples[0], samples).fields.map(parseColor);
  samples[8] = "#ffb82c";
  const fields = meshColors(samples[0], samples).fields.map(parseColor);
  for (let i = 0; i < fields.length; i++) assert.ok(fields[i][0] > plain[i][0] + 16);
});

test("a gradient covering the CSS canvas colors the opaque base, too", () => {
  const result = meshColors("#ffffff", ["#8420ad", ...Array(11).fill("#441177")]);
  assert.equal(result.base, "#441177");
});

test("a lower-row game palette supplies recognizable color in the upper and middle fields", () => {
  const purple = "#410077", gold = "#ff9801", yellow = "#fff900";
  const { fields } = meshColors(purple, [...Array(8).fill(purple), gold, gold, yellow, yellow]);
  for (const i of [1, 2]) {
    const [r, g, b] = parseColor(fields[i]);
    assert.ok(r > 185 && g > 100 && g > 1.8 * b, fields[i]);
  }
  const light = meshColors("#ffffff", [...Array(10).fill("#ffffff"), gold, yellow]);
  for (const i of [0, 1, 2, 3]) assert.ok(Math.min(...parseColor(light.fields[i]).slice(0, 3)) > 180);
});
