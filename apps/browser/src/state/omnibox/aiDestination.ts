import { BUILT_IN_ENGINES, engineById, fixupUrl, searchUrl, type SearchEngine, type Suggestion, type SuggestionResult } from "@voyager/core";

export const AI_ENGINE_IDS = ["chatgpt"] as const;
export const aiEngine = (id: (typeof AI_ENGINE_IDS)[number]) => engineById(BUILT_IN_ENGINES, id);

const REQUESTS = [
  /^(?:(?:can|could|would|will) you|help me|walk me through|teach me)\s+/i,
  /^(?:explain|summari[sz]e|rewrite|translate|brainstorm|debug|draft|compare)\s+/i,
  /^(?:write|create|generate|plan|design|build) (?:me|an?|some|my|the)\s+/i,
  /^(?:how (?:do|can|should|would) I|how (?:does|do)|why (?:is|are|does|do)|what(?:'s| is) the difference between)\s+/i,
  /^(?:what(?:'s| is| are)|how (?:is|are|can)|why)\s+.+\?$/i,
];
const SEARCH_OPERATOR = /(?:^|\s)(?:site|filetype|inurl):/i;
const LOCAL_OR_CURRENT = /\b(?:near me|opening hours|weather (?:today|tomorrow)|stock price|latest news)\b/i;
const NAVIGATE = /^(?:can|could|would|will) you (?:open|go to|search for|look up)\b/i;

export function likelyAiRequest(query: string): boolean {
  const words = query.trim().replace(/^please\s+/i, "");
  return REQUESTS.some((request) => request.test(words)) && !SEARCH_OPERATOR.test(words) && !LOCAL_OR_CURRENT.test(words) && !NAVIGATE.test(words);
}

export function withAiDestination(result: SuggestionResult, query: string, engine: SearchEngine, preferred: boolean): SuggestionResult {
  if (!query || /^[?!]/.test(query) || fixupUrl(query)) return result;
  const searchAt = result.items.findIndex((s) => s.kind === "search" && !s.bang && !s.suggested && s.query === query);
  if (searchAt < 0 || result.items.some((s) => s.kind === "calc" || (s.kind === "search" && s.bang))) return result;
  const url = searchUrl(engine, query);
  const ask: Suggestion = { kind: "search", query, url, engine: engine.name, ai: true };
  const items = result.items.slice();
  const regular = items[searchAt]!;
  if (regular.kind === "search" && regular.url === url) {
    items[searchAt] = ask;
  } else {
    const first = items[0]!;
    const promote = preferred && (first.kind === "search" || (first.kind === "page" && !result.completion && first.title.toLowerCase() !== query.toLowerCase()));
    items.splice(promote ? 0 : searchAt + 1, 0, ask);
  }
  return { items, completion: result.completion };
}
