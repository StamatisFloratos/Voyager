import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Visit the printed 127.0.0.1 URL in a disposable browser. The localhost iframe
// is cross-site. It reads its canvas 240 ms into the first wheel gesture on each
// visit. A second gesture on the same document serves as the no-read control.
export async function startCanvasScrollFixture(size = 'big', frequent = false) {
  const big = size !== 'small';
  const width = big ? 2304 : 1024;
  const height = big ? 1408 : 640;
  const count = size === 'dense' ? 300 : big ? 128 : 32;

  const child = `<!doctype html><meta charset=utf-8><title>Print preview thumbnail</title>
<canvas width="${width}" height="${height}"></canvas>
<script>
addEventListener('message', function renderPreview(event) {
  if (event.data !== 'render' || event.source !== parent) return;
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d'${frequent ? ', {willReadFrequently: true}' : ''});
  const { width: w, height: h } = canvas;
  performance.mark('offline-preview-start');
  const started = performance.now();
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createLinearGradient(10, 0, w, h);
  gradient.addColorStop(0, '#387c92');
  gradient.addColorStop(.61, '#cc7642');
  gradient.addColorStop(1, '#413f79');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < ${count}; i++) {
    ctx.save();
    ctx.translate(i * 39 % w, i * 109 % h);
    ctx.rotate(i * .16);
    ctx.shadowColor = '#324a7290';
    ctx.shadowBlur = ${big ? 18 : 6};
    ctx.fillStyle = 'hsla(' + (16 * i % 360) + ' 64% 70% / .8)';
    ctx.beginPath();
    ctx.roundRect(-32, -28, ${big ? 278 : 146}, ${big ? 144 : 64}, 14);
    ctx.fill();
    ctx.restore();
  }
  ctx.font = '48px system-ui';
  ctx.fillStyle = 'white';
  ctx.fillText('Field notes', 32, 90);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.filter = 'blur(3px)';
  ctx.drawImage(canvas, 0, 0, w / 2, h / 2, w - 260, h - 160, 180, 100);
  ctx.restore();
  performance.mark('offline-preview-read-start');
  const rgb = ctx.getImageData(0, 0, ${big ? 1536 : 640}, ${big ? 960 : 480});
  const colors = new Set();
  let minAlpha = 255;
  let sumRGB = 0;
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 11; col++) {
      const i = 4 * (Math.floor(row * rgb.height / 8) * rgb.width + Math.floor(col * rgb.width / 12));
      const [r, g, b, a] = rgb.data.subarray(i, i + 4);
      colors.add(r * 65536 + g * 256 + b);
      minAlpha = Math.min(minAlpha, a);
      sumRGB += r + g + b;
    }
  }
  performance.mark('offline-preview-end');
  parent.postMessage({preview: performance.now() - started, output: {uniqueRGB: colors.size, minAlpha, sumRGB, samples: 77}}, event.origin);
});
parent.postMessage('preview-loaded', '*');
</script>`;

  const cards = Array.from({length: 72}, (_, i) => `<article style="--h:${i * 79 % 360};--l:${52 + i % 5 * 5}%"><header>Library ${i + 1}</header><p>Illustrated document ${i * i + 5}</p></article>`).join('');
  const server = createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    if (req.url === '/preview-child') return res.end(child);
    const childOrigin = `http://localhost:${server.address().port}`;
    res.end(`<!doctype html><meta charset=utf-8><title>Canvas scroll fixture</title>
<style>
*{box-sizing:border-box}body{margin:0;font:18px system-ui;background:#eff1ed;color:#161521}
main{display:grid;grid-template-columns:1fr 1fr 1fr;gap:13px;padding:12px}
article{height:180px;margin:0;padding:18px;background:hsl(var(--h) 50% var(--l))}
header{font-size:24px}p{font-size:14px}iframe{width:128px;height:96px;position:absolute;top:1400px;left:12px;border:0}
</style>
<script>
addEventListener('message', function (e) {
  if (e.origin !== '${childOrigin}' || e.source !== document.querySelector('iframe')?.contentWindow) return;
  if (e.data === 'preview-loaded') {
    window.previewLoaded = true;
    addEventListener('wheel', () => setTimeout(() => {
      document.querySelector('iframe').contentWindow.postMessage('render', '${childOrigin}');
    }, 240), {once:true, passive:true});
  }
  if (e.data?.preview) window.previewResult = e.data;
});
</script><iframe title="Remote print preview" src="${childOrigin}/preview-child"></iframe><main>${cards}</main>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url: `http://127.0.0.1:${server.address().port}/`, server};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.includes('--help')) {
    console.log('node canvas-scroll-repro.mjs [small|big|dense] [frequent]\nOpen the printed URL and scroll twice. "frequent" requests a canvas optimized for readback.');
  } else {
    const { url } = await startCanvasScrollFixture(process.argv[2], process.argv[3] === 'frequent');
    console.log(url);
  }
}
