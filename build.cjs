// Builds the app into the repository root: one self-contained index.html plus the PWA files.
//   node build.cjs            (no dependencies)
// classic/ holds the earlier 17-preset version built from .toe files and is left untouched.
const fs = require('fs'), path = require('path');
const strip = s => s.replace(/\nif \(typeof module[^\n]*\n?/g, '\n');
const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const VERSION = '2.0.' + (process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, ''));
const font = w => `@font-face{font-family:"Jost";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'assets/jost-latin-' + w + '-normal.woff2')).toString('base64')}) format("woff2")}`;
let html = rd('src/index.html');
html = html.replace(/<link rel="preconnect"[^\n]*\n/, '').replace(/<link href="https:\/\/fonts\.googleapis[^\n]*\n/, '');
html = html.replace('<style>', () => '<style>\n/* Jost — SIL Open Font License 1.1, The Jost Project Authors */\n' + [400, 500, 600].map(font).join('\n'));
html = html.replace('/*__TOE__*/', () => strip(rd('src/toe.js'))).replace('/*__ENGINE__*/', () => strip(rd('src/engine.js'))).replace('/*__FX__*/', () => strip(rd('src/fx.js')))
  .replace('/*__PRESETS__*/', () => strip(rd('src/presets.js'))).replace('/*__APP__*/', () => rd('src/app.js'));
if (/fonts\.googleapis|__[A-Z]+__/.test(html)) throw new Error('unreplaced placeholder');
const out = __dirname; fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'TOE Effect Camera', short_name: 'TOE Cam', description: '100種類のリアルタイムエフェクトを備えたカメラ', lang: 'ja', start_url: './', scope: './', id: './',
  display: 'standalone', orientation: 'any', background_color: '#0b0b0c', theme_color: '#0b0b0c', categories: ['photo', 'video', 'entertainment'],
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 1));
fs.writeFileSync(path.join(out, 'sw.js'), `/* offline cache for the app shell — the page is asked from the network first so updates arrive, then falls back to the cache */
const CACHE = 'toecam-${VERSION}', SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('toecam-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./')))); });
`);
for (const f of fs.readdirSync(path.join(__dirname, 'assets/icons'))) fs.copyFileSync(path.join(__dirname, 'assets/icons', f), path.join(out, 'icons', f));
console.log('index.html', (html.length / 1024).toFixed(1) + 'KB', VERSION);
