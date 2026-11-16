import assert from "node:assert/strict";
import { test } from "node:test";
import { TAB_GROUP_COLORS } from "@voyager/core";
import { groupTint } from "./tokens.ts";
import { GROUP_COLORS } from "../../state/groups/tokens.ts";

test("each saved category color supplies its header tint", () => {
  for (const color of TAB_GROUP_COLORS) {
    assert.ok(GROUP_COLORS[color], color);
    assert.equal(groupTint(color), GROUP_COLORS[color].hex, color);
  }
});

test("neutral categories inherit the theme's header ink", () => {
  assert.equal(groupTint(null), null);
  assert.equal(groupTint(undefined), null);
  assert.equal(groupTint("none"), null);
});
