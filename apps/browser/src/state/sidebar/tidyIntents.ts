import { webUrl } from "../../lib/urlParts";
import type { Tab } from "../browser/types";

type Page = Pick<Tab, "id" | "title" | "url" | "tidyContent" | "tidyChoice">;

const ignored = new Set((
  "a an and are as at be by can do for from how in into is it its of on or our that the their this to was what when where which who why will with you your " +
  "about account all app article articles author best blog browse buy buying cart category categories cheap click collection collections compare comparison " +
  "content dashboard deal deals default delivery details discover download edit en english everything example explore faq find first free getting great guide guides help " +
  "home homepage html htm http https ideas index info introduction item items latest learn learning list listing listings login main more most new news official " +
  "online overview page pages post posts price prices pricing product products profile project projects read reading related resource resources result results " +
  "review reviews sale search shop shopping sign site sites start started store story support test tips today top uk usa user video videos web website www"
).split(/\s+/));

const modifiers = new Set((
  "black blue brown white green grey gray red navy camel cream beige pink yellow orange silver gold " +
  "men mens women womens ladies kids children unisex size small medium large long short slim fit " +
  "wool woollen woolen blend cotton linen leather double single breasted belted lightweight warm waterproof winter summer spring autumn fall"
).split(/\s+/));
const weakAlone = new Set((
  "basic better classic common complete current daily day different easy electric everyday essential extra false fast field final full future general good great " +
  "high history important initial last latest little local low major modern month natural normal original personal popular possible practical real regular " +
  "right simple smart special standard true typical ultimate universal useful way week weekly world year " +
  "adjustable advanced compact digital ergonomic handmade luxury mini portable premium professional rechargeable smart universal wireless"
).split(/\s+/));
const outerwear = new Set("coat coats overcoat overcoats topcoat topcoats peacoat peacoats raincoat raincoats parka parkas puffer puffers anorak anoraks jacket jackets".split(" "));
const shoppingWords = /\b(buy|buying|shop|shopping|price|prices|sale|deals|add to (?:bag|cart|basket))\b|[$£€]\s*\d/i;
const productPath = /\/(?:products?|items?|listings?|collections?|shop|store|catalog|dp|itm|pdp|sku|p)(?:\/|$)/i;
const marketplace = /(?:^|\.)(?:amazon|ebay)\.(?:com|co\.uk)$|(?:^|\.)etsy\.com$/;
const searchParam = /^(?:q|query|search|s|k|keywords?|search_query|searchterms?|searchquery)$/i;
const identityParam = /^(?:id|sku|pid|asin|v|variant|(?:product|item|article|style)_?id)$/i;
const editorial = /\b(?:how|why|history|meaning|recipe|repair|clean|paint|painting|heraldry|arms|grooming)\b|\b(?:dog|cat|animal)['’]?s?\b.*\bcoat\b/i;
const lexemes = /[\p{L}\p{N}]+/gu;
const cache = new WeakMap<Page, ReturnType<typeof readPage>>();

function decode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return "";
  }
}

function subject(word: string, shopping: boolean) {
  if (shopping && outerwear.has(word)) return "coat";
  if (word.length < 3 || word.length > 28 || ignored.has(word) || (shopping && modifiers.has(word)) || /\d/.test(word)) return "";
  if (!shopping) return word;
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("s") && !/(ss|is|us|ous|ics|ness)$/.test(word)) return word.slice(0, -1);
  return word;
}

function terms(parts: { text: string; weight: number }[], shopping: boolean, hostWords: Set<string>) {
  const result = new Map<string, number>();
  function add(key: string, weight: number) {
    if (weight > (result.get(key) ?? 0)) result.set(key, weight);
  }
  for (const { text, weight } of parts) {
    let previous = "";
    for (const word of text.toLowerCase().match(lexemes) ?? []) {
      const next = hostWords.has(word) ? "" : subject(word, shopping);
      if (next) {
        if (next.length >= 4 && !weakAlone.has(next)) add(next, weight);
        if (previous && previous !== next) add(previous + " " + next, weight);
      }
      previous = next;
    }
  }
  return result;
}

function readPage(tab: Page) {
  const url = webUrl(tab.url);
  if (!url) return;
  const host = url.host.replace(/^www\./, "");
  const hostWords = new Set(host.split(/[.-]/));
  const title = /^\w+:\/\//.test(tab.title) ? "" : tab.title.slice(0, 256);
  const titleParts = title.split(/\s+[|–—·-]\s+|\s*\|\s*/).filter((part) => {
    const compact = part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return compact && !host.replace(/[.-]/g, "").includes(compact);
  });
  const pageTitle = titleParts[0] ?? "";
  const content = tab.tidyContent?.url === tab.url ? tab.tidyContent : undefined;
  const heading = content?.heading ?? "";
  const path = decode(url.path.slice(0, 1024));
  const product = !!content?.product || productPath.test(path);
  const parts = [{ text: pageTitle, weight: 3 }];
  if (heading) parts.push({ text: heading, weight: 4 });
  for (const segment of path.split("/").filter(Boolean).slice(-4)) {
    parts.push({ text: segment.replace(/\.(?:html?|php|aspx?)$/i, ""), weight: product ? 2 : 1 });
  }
  let query = "";
  const identifiers: string[] = [];
  for (const pair of url.query.slice(1, 2049).split("&")) {
    const equals = pair.indexOf("=");
    if (equals < 0) continue;
    const name = pair.slice(0, equals);
    if (!query && searchParam.test(name)) {
      query = decode(pair.slice(equals + 1).replace(/\+/g, " ")).slice(0, 256);
    } else if (identityParam.test(name)) identifiers.push(pair);
  }
  if (query) parts.push({ text: query, weight: 4 });
  const description = [pageTitle, heading, query].join(" ");
  const words = (description + " " + path).toLowerCase().match(lexemes) ?? [];
  const informational = editorial.test(words.join(" "));
  const clothing = words.some((word) => outerwear.has(word)) && !informational;
  const shopping = shoppingWords.test(description) || product || marketplace.test(host) || clothing;
  return {
    host,
    label: heading || pageTitle,
    page: host + url.path + "?" + identifiers.sort().join("&") + "#" + query,
    shopping,
    generalTerms: shopping ? undefined : terms(parts, false, hostWords),
    shoppingTerms: shopping || (query && !informational) ? terms(parts, true, hostWords) : undefined,
  };
}

type Match = { key: string; ids: string[]; pages: Set<string>; hosts: Set<string>; strength: number; phrase: boolean; shopping: boolean; commercial: boolean };

function pageEvidence(tab: Page) {
  if (!cache.has(tab)) cache.set(tab, readPage(tab));
  return cache.get(tab);
}

function exampleLabels(tab: Page, page: NonNullable<ReturnType<typeof readPage>>) {
  const keys = ["url:" + tab.url];
  const words = page.label.toLowerCase().match(lexemes) ?? [];
  if (words.length >= 2 && words.some((word) => word.length >= 4 && !ignored.has(word) && !weakAlone.has(word))) {
    keys.push(page.host + ":" + words.join(" "));
  }
  return keys;
}

export function tidyIntents(
  tabs: Page[],
  existing: ReadonlySet<string>,
  accept: (tab: Page, key: string) => boolean = () => true,
  examples: Page[] = [],
): Map<string, string> {
  const learned = new Map<string, string | null>();
  for (const tab of examples) {
    const key = tab.tidyChoice?.preferred;
    const page = pageEvidence(tab);
    if (!key || !existing.has(key) || !page) continue;
    for (const label of exampleLabels(tab, page)) {
      learned.set(label, learned.has(label) && learned.get(label) !== key ? null : key);
    }
  }

  const assigned = new Map<string, string>();
  const matches = new Map<string, Match>();
  const pageForId = new Map<string, string>();
  for (const tab of tabs) {
    const page = pageEvidence(tab);
    if (!page) continue;
    if (learned.size) {
      const label = exampleLabels(tab, page).find((value) => learned.has(value));
      const key = label && learned.get(label);
      if (key && accept(tab, key)) {
        assigned.set(tab.id, key);
        continue;
      }
    }
    pageForId.set(tab.id, page.page);
    for (const [words, shopping] of [[page.generalTerms, false], [page.shoppingTerms, true]] as const) {
      if (!words) continue;
      for (const [term, weight] of words) {
        const name = term.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
        const key = "intent:" + name + (shopping ? " Shopping" : "");
        if (!accept(tab, key)) continue;
        let match = matches.get(key);
        if (!match) {
          match = { key, ids: [], pages: new Set(), hosts: new Set(), strength: 0, phrase: term.includes(" "), shopping, commercial: false };
          matches.set(key, match);
        }
        match.ids.push(tab.id);
        match.pages.add(page.page);
        match.hosts.add(page.host);
        match.strength = Math.max(match.strength, weight);
        match.commercial ||= shopping && page.shopping;
      }
    }
  }

  const ranked: { match: Match; score: number }[] = [];
  for (const match of matches.values()) {
    const known = existing.has(match.key);
    const { shopping, phrase } = match;
    if (!known && (match.pages.size < 2 || (shopping && !match.commercial))) continue;
    if (!known && !phrase && match.strength < (shopping ? 2 : 3)) continue;
    if (!known && !shopping && match.hosts.size === 1 && (!phrase || match.strength < 3)) continue;
    const score = 5 * Math.min(match.pages.size, 8) + 6 * Number(phrase) + 8 * Number(shopping) + match.strength + 2 * Number(known);
    ranked.push({ match, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.match.key.localeCompare(b.match.key));
  for (const { match } of ranked) {
    const available = match.ids.filter((id) => !assigned.has(id));
    if (!existing.has(match.key) && new Set(available.map((id) => pageForId.get(id))).size < 2) continue;
    for (const id of available) assigned.set(id, match.key);
  }
  return assigned;
}
