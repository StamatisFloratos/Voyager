import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSuggestions, suggestionKey } from "@voyager/core";
import { aiEngine, likelyAiRequest, withAiDestination } from "./aiDestination.ts";
import { parseSettings } from "../settings/settings.ts";

const assistant = aiEngine("chatgpt");
const source = { history: [], tabs: [] };
const rows = (text, options) => withAiDestination(buildSuggestions(text, source, options), text.trim(), assistant, likelyAiRequest(text.trim())).items;

test("an AI request opens a ChatGPT draft for manual sending and offers a separate web search", () => {
  for (const text of ["Explain tides & the moon 🌙", "Please draft a thank-you note", "How do I make a sourdough starter?", "Could you help me rewrite this?"]) {
    const [ask, web] = rows(text);
    assert.equal(ask.ai, true);
    const url = new URL(ask.url);
    assert.equal(url.origin + url.pathname, "https://chatgpt.com/");
    assert.deepEqual(Object.fromEntries(url.searchParams), { prompt: text });
    assert.equal(web.engine, "Google");
    assert.notEqual(suggestionKey(ask), suggestionKey(web));
  }
});

test("ordinary keywords prefer the configured search engine and can be sent to the assistant manually", () => {
  for (const text of ["ceramics", "weather tomorrow in Paris", "Can you look up the train timetable?", "site:example.com explain tides"]) {
    const [web, ask] = rows(text, { engine: { name: "Kagi", url: "https://kagi.com/search?q=%s" } });
    assert.equal(web.engine, "Kagi");
    assert.equal(ask.engine, "ChatGPT");
  }
});

test("navigation, explicit web search and calculations keep their original destinations", () => {
  for (const q of ["https://example.com/", "localhost:8000", "?explain tides", "2 + 2", ""]) {
    assert.deepEqual(rows(q), buildSuggestions(q, source).items);
  }
  assert.equal(rows("Compare two shoelaces", { engine: assistant }).filter((s) => s.engine === "ChatGPT").length, 1);
});

test("old profiles and unknown AI providers fall back to the supported assistant", () => {
  assert.equal(parseSettings({}).defaultAiEngine, "chatgpt");
  assert.equal(parseSettings({ defaultAiEngine: "missing", searchEngine: "bing" }).defaultAiEngine, "chatgpt");
  assert.equal(parseSettings({ defaultAiEngine: "chatgpt", searchEngine: "bing" }).searchEngine, "bing");
});
