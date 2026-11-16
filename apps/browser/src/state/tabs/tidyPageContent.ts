import { webviews } from "../../platform/webviews";
import { currentTab } from "../browser/current";
import { updateTab } from "./actions";

const HEADING_LIMIT = 160;

export const tidyContentProbe = `
  if (!/^https?:$/.test(location.protocol) || document.designMode === "on") return post("result", "null");
  const meta = (property) => document.head?.querySelector('meta[property="' + property + '"]')?.getAttribute("content") || "";
  const skip = 'nav,aside,footer,form,input,textarea,select,button,script,style,template,[role="navigation"],[role="complementary"],[role="banner"],[contenteditable],[role="textbox"],[hidden],[aria-hidden="true"]';
  const headings = document.getElementsByTagName("h1");
  let h1 = null;
  for (let i = 0; i < 12 && headings[i]; i++) {
    const candidate = headings[i];
    if (candidate.closest(skip)) continue;
    if (candidate.closest('main, [role="main"], article')) { h1 = candidate; break; }
    if (!h1) h1 = candidate;
  }
  let heading = "";
  if (h1) {
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = 0; n < 32 && heading.length < ${HEADING_LIMIT}; n++) {
      const node = walker.nextNode();
      if (!node) break;
      if (node.nodeType === 3 && !node.parentElement?.closest(skip)) heading += node.data.slice(0, ${HEADING_LIMIT} - heading.length);
    }
  }
  heading = (heading.trim() || meta("og:title").slice(0, ${HEADING_LIMIT})).replace(/\\s+/g, " ").trim();
  const product = /^(?:product|product[.:]item)$/i.test(meta("og:type").slice(0, 40).trim()) || !!meta("product:price:amount");
  post("result", JSON.stringify({ url: location.href, heading, product }));
`;

export function tidyContentReader(tabId: string) {
  let generation = 0;
  let last: { url: string; title: string; commit: number; loading: boolean } | undefined;
  function cancel() {
    generation++;
    last = undefined;
  }
  async function navigation(url: string, title: string, loading: boolean, commit = 0) {
    if (last?.url === url && last.title === title && last.commit === commit && last.loading === loading) return;
    const newDocument = !last || last.url !== url || last.commit !== commit || (loading && !last.loading);
    last = { url, title, commit, loading };
    const request = ++generation;
    const tab = currentTab(tabId);
    if (!tab || tab.url !== url) return;
    if (newDocument && tab.tidyContent) updateTab(tabId, { tidyContent: undefined });
    const view = webviews.get(tabId);
    if (loading || !view || !/^https?:\/\//i.test(url) || tab.pin || tab.liveItem) return;
    const result = await view.evaluate<{ url: string; heading: string; product: boolean }>(tidyContentProbe).catch(() => null);
    const current = currentTab(tabId);
    if (request !== generation || !current || current.url !== url || current.profileId !== tab.profileId || current.pin || current.liveItem ||
        webviews.get(tabId) !== view || !result || result.url !== url ||
        typeof result.heading !== "string" || typeof result.product !== "boolean") return;
    const heading = result.heading.slice(0, HEADING_LIMIT);
    const product = result.product;
    const prior = current.tidyContent;
    if (prior?.heading === heading && prior.product === product) return;
    if (heading || product) updateTab(tabId, { tidyContent: { url, heading, product } });
    else if (prior) updateTab(tabId, { tidyContent: undefined });
  }
  return { navigation, cancel };
}
