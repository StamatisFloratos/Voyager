export const viewportReadiness = String.raw`(painted, paintTiming) => {
  if (!document.documentElement || !innerWidth || !innerHeight) return "paint";
  if (document.documentElement.namespaceURI !== "http://www.w3.org/1999/xhtml") return "ready";
  if (paintTiming && !painted) return "paint";
  const width = innerWidth, height = innerHeight;
  const styles = new Map(), states = new Map(), resources = new Map(), pictures = new Map();
  function style(el) {
    if (!styles.has(el)) styles.set(el, getComputedStyle(el));
    return styles.get(el);
  }
  function received(url) {
    if (!resources.has(url)) resources.set(url, /^(data|blob):/.test(url) || performance.getEntriesByName(url, "resource").length > 0);
    return resources.get(url);
  }
  function state(el) {
    if (states.has(el)) return states.get(el);
    let value;
    if (el.localName === "img") {
      const lazy = el.hasAttribute("data-src") || el.hasAttribute("data-srcset");
      value = !el.complete || (lazy && !el.currentSrc) ? "waiting" : el.naturalWidth ? "shown" : "unavailable";
    } else if (el.localName === "video") {
      if (el.readyState >= 2 || el.poster && received(el.poster)) value = "shown";
      else if (!el.poster && (el.error || el.networkState === 3 || !el.autoplay)) value = "unavailable";
      else value = "waiting";
    } else if (el.localName === "canvas" || el.localName === "iframe" || el.localName === "svg") {
      value = "shown";
    } else {
      const image = style(el).backgroundImage;
      const tokens = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*?))\s*\)/g;
      if (image.length <= 8192) for (const token of image.matchAll(tokens)) {
        const url = token[1] ?? token[2] ?? token[3];
        if (/^(data:|blob:|#)/.test(url)) continue;
        value = received(url) ? "shown" : "waiting";
        break;
      }
    }
    states.set(el, value);
    return value;
  }
  function visible(el) {
    return !el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  }
  function pendingPicture(el) {
    const picture = el.localName === "picture" ? el : el.localName === "img" && el.parentElement?.localName === "picture" ? el.parentElement : null;
    if (!picture || picture.closest('[aria-hidden="true"], [inert]')) return null;
    if (!pictures.has(picture)) {
      const img = picture.querySelector("img");
      const broken = img?.complete && img.currentSrc && !img.naturalWidth;
      const laidOut = !picture.checkVisibility || picture.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
      const loading = img ? !img.currentSrc || !img.complete || !visible(img) : !!picture.querySelector("source");
      pictures.set(picture, laidOut && !broken && loading);
    }
    return pictures.get(picture) ? picture : null;
  }
  function opaque(el) {
    const s = style(el);
    return Number(s.opacity) === 1 && /^rgb\(/.test(s.backgroundColor);
  }

  const points = [], pending = new Map(), emptyRegions = new Map(), images = new Map();
  let hero = null;
  let shown = 0, waiting = 0, content = false;
  function note(el) { pending.set(el, (pending.get(el) || 0) + 1); }
  for (const y of [.15, .5, .85]) for (const x of [.17, .5, .83]) {
    const px = width * x, py = height * y;
    const stack = document.elementsFromPoint(px, py).slice(0, 8);
    points.push({ px, py, stack });
    const front = stack[0];
    if (front?.localName === "div" && !front.firstElementChild && !front.textContent?.trim() &&
        front.closest?.('main, [role="main"]') && style(front).backgroundImage === "none") {
      emptyRegions.set(front, (emptyRegions.get(front) || 0) + 1);
    }
    for (const el of stack) {
      const picture = pendingPicture(el);
      if (picture) { waiting++; note(picture); break; }
      if (!visible(el)) continue;
      const media = state(el);
      if (media === "shown") {
        shown++;
        content = true;
        if (el.localName === "img") images.set(el, (images.get(el) || 0) + 1);
        break;
      }
      if (media === "waiting") { waiting++; note(el); break; }
      if (/^(button|input|textarea|select|object|embed)$/.test(el.localName)) content = true;
      if (opaque(el)) break;
    }
  }
  function exposed(el, stack) {
    for (const layer of stack) {
      if (layer.contains(el)) return true;
      if (!visible(layer)) continue;
      if (opaque(layer) || (/^(img|video|canvas|iframe)$/.test(layer.localName) && state(layer) === "shown")) return false;
    }
    return true;
  }
  function inspectMedia(el) {
    const r = el.getBoundingClientRect();
    const left = Math.max(0, r.left), top = Math.max(0, r.top);
    const right = Math.min(width, r.right), bottom = Math.min(height, r.bottom);
    if (right <= left || bottom <= top || !visible(el)) return;
    const area = (right - left) * (bottom - top) / (width * height);
    if (area < .008) return;
    const media = state(el);
    if (!content && media === "shown") {
      const stack = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
      if (exposed(el, stack.slice(0, 8))) content = true;
    }
    if (area < .15 || (media !== "waiting" && (media !== "shown" || el.localName !== "img"))) return;
    let hits = 0, uncovered = 0;
    for (const { px, py, stack } of points) {
      if (px < left || px >= right || py < top || py >= bottom) continue;
      hits++;
      if (exposed(el, stack)) uncovered++;
    }
    if (uncovered && area * uncovered / hits >= .15) {
      if (media === "waiting") pending.set(el, 2);
      else images.set(el, Math.max(images.get(el) ?? 0, 2));
    }
  }
  for (const [items, limit] of [[document.getElementsByTagName("video"), 6], [document.images, 12]]) {
    for (let i = 0; i < limit && items[i]; i++) inspectMedia(items[i]);
  }
  function waitingGallery() {
    const links = new Set(), sections = new Set(), landmarks = new Set();
    for (const { stack } of points) {
      const link = stack[0]?.closest?.("a[href]");
      if (link?.localName === "a") links.add(link);
      const main = stack.find(el => el.localName === "main" || el.getAttribute?.("role") === "main") ??
        stack[0]?.closest?.('main, [role="main"]');
      if (main?.children) landmarks.add(main);
      for (const el of stack) {
        if (sections.has(el)) break;
        if (!el.firstElementChild || el === document.body || el === document.documentElement) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= width * .45 && r.height >= 60 && r.height <= height * 2) {
          sections.add(el);
          break;
        }
      }
    }
    const nearby = new Set();
    function include(el) {
      if (!el?.firstElementChild || nearby.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.left < width && r.right > 0 && r.top < height && r.bottom > 0) nearby.add(el);
    }
    for (const main of landmarks) {
      for (let i = 0; i < 16 && main.children[i]; i++) include(main.children[i]);
    }
    if (!landmarks.size) for (const section of sections) {
      let region = section;
      for (let i = 0; i < 3 && region && region !== document.body; i++, region = region.parentElement) {
        include(region.previousElementSibling);
        include(region.nextElementSibling);
      }
    }
    for (const section of new Set([...nearby, ...sections])) {
      const items = section.getElementsByTagName("a");
      for (let i = 0; i < 18 && links.size < 64 && items[i]; i++) links.add(items[i]);
    }
    const groups = [];
    for (const link of links) {
      const r = link.getBoundingClientRect();
      const left = Math.max(0, r.left), right = Math.min(width, r.right);
      const top = Math.max(0, r.top), bottom = Math.min(height, r.bottom);
      if (right - left < Math.max(48, r.width * .35) || bottom - top < Math.max(40, r.height * .35) ||
          !link.hasAttribute("href") || !visible(link) || link.closest('nav, header, [role="navigation"], [aria-hidden="true"], [inert]')) continue;
      const img = link.querySelector("picture img") ?? link.querySelector("img");
      if (!img) continue;
      const box = img.getBoundingClientRect();
      if (box.width < Math.max(48, r.width * .6)) continue;
      const lazy = img.hasAttribute("data-src") || img.hasAttribute("data-srcset") ||
        img.parentElement?.localName === "picture" && img.parentElement.querySelector("source[data-srcset]");
      const waiting = !img.complete || lazy && (!img.currentSrc || !visible(img) ||
        img.naturalWidth <= 2 && img.naturalHeight <= 2 && img.currentSrc.startsWith("data:"));
      const unsizedLazyImage = lazy && waiting && !img.hasAttribute("height");
      if (img.complete && img.currentSrc && !img.naturalWidth || !waiting && !img.naturalWidth ||
          box.height < r.height * .35 && !unsizedLazyImage) continue;
      const front = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (!front || !link.contains(front) && !front.contains(link)) continue;
      let group = groups.find(g => Math.abs(g.width - r.width) <= r.width * .25 && Math.abs(g.height - r.height) <= r.height * .45);
      if (!group) { group = { width: r.width, height: r.height, count: 0, area: 0, waiting: 0 }; groups.push(group); }
      group.count++;
      group.area += (right - left) * (bottom - top);
      if (waiting) group.waiting++;
    }
    return groups.some(group => group.count >= 3 && group.area >= width * height * .08 && group.waiting > group.count / 2);
  }
  if (document.images.length >= 3 && waitingGallery()) return "gallery";
  let largePending = false;
  for (const [el, count] of pending) {
    if (count < 2) continue;
    if (el.localName === "picture" || (el.localName === "img" && !el.complete) ||
        (el.localName === "video" && (el.poster || el.autoplay && el.networkState === 2))) return "hero";
    largePending = true;
  }
  if (largePending || (waiting >= 5 && shown < 2)) return "media";
  if (!shown && [...emptyRegions.values()].some(count => count >= 6)) {
    return "shell";
  }
  for (const [el, count] of images) {
    if (count >= 2 && (!hero || count > images.get(hero))) hero = el;
  }
  if (hero?.decode) {
    const source = hero.currentSrc;
    return hero.decode().then(() => new Promise(resolve => {
      requestAnimationFrame(() => setTimeout(() => resolve(visible(hero) && hero.currentSrc === source ? "ready" : "media"), 0));
    }), () => hero.currentSrc === source ? "ready" : "media");
  }
  if (!content && !shown && document.body) {
    const range = document.createRange();
    function hasText(node) {
      const el = node?.parentElement;
      if (node?.nodeType !== 3 || !el || /^(script|style|noscript|template)$/.test(el.localName) ||
          !node.nodeValue.trim() || !visible(el)) return false;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < width && r.right > 0 && r.top < height && r.bottom > 0;
    }
    for (const { px, py } of points) {
      const node = document.caretPositionFromPoint?.(px, py)?.offsetNode ?? document.caretRangeFromPoint?.(px, py)?.startContainer;
      if (hasText(node)) return "ready";
    }
    const walker = document.createTreeWalker(document.body, 4);
    for (let i = 0, node; i < 32 && (node = walker.nextNode()); i++) if (hasText(node)) return "ready";
  }
  return content ? "ready" : "content";
}`;
