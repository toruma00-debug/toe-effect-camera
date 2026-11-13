/* App — camera, library of presets in folders, adjust sheet, capture, install */
const $ = id => document.getElementById(id);
const canvas = $('view'); let engine;
try { engine = new Engine(canvas); } catch (e) { $('note').textContent = 'このブラウザでは WebGL2 が使えないため、エフェクトを表示できません。'; throw e; }
engine.text = 'TOE';
const store = { read() { try { return JSON.parse(localStorage.getItem('toecam') || '{}'); } catch (e) { return {}; } }, write(o) { try { localStorage.setItem('toecam', JSON.stringify(o)); } catch (e) { } } };
const saved = store.read();
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const LIB = FOLDERS.map(f => ({ id: f.id, jp: f.jp, items: ORIGINALS.filter(p => p.cat === f.id).map(p => ({ name: p.name, desc: p.desc, slug: slug(p.name), audio: /g\.(bass|kick|high)\(/.test(String(p.fn)), make: () => buildOriginal(p) })) }));
const IMPORT = { id: 'IMPORT', jp: '読み込んだ .toe', items: [] };
const folders = () => IMPORT.items.length ? LIB.concat(IMPORT) : LIB;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, coarse = matchMedia('(pointer: coarse)').matches;
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), inApp = /\bLine\/|Instagram|FBAN|FBAV|Twitter|MicroMessenger|TikTok/i.test(navigator.userAgent);
const QSTEPS = [360, 432, 540, 720, 1080], weak = coarse && ((navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4);
const state = { cat: 0, idx: 0, fav: new Set(saved.fav || []), favOnly: false, mode: 'photo', facing: 'user', stream: null, srcLabel: '', quality: saved.quality || 'auto', base: QSTEPS.includes(saved.base) ? saved.base : (weak ? 540 : 720), autoQ: 0, slow: 0, settle: 0, drops: 0 };
state.autoQ = state.base;
const shortSide = () => state.quality === 'auto' ? state.autoQ : +state.quality;
const cur = () => folders()[state.cat].items[state.idx];
const persist = () => store.write({ fav: [...state.fav], quality: state.quality, base: state.base, last: cur().slug });
const t0 = performance.now(), pad = n => String(n).padStart(2, '0');

/* ---------- audio ---------- */
const audio = { mode: 'demo', an: null, data: null, hz: 23.4,
  update() { if (this.an) this.an.getByteFrequencyData(this.data); },
  band(lo, hi) { if (this.mode === 'demo') { const t = (performance.now() - t0) / 1000, k = Math.exp(-5 * ((t * 2) % 1)); return lo < 200 ? k * .8 : .25 + .2 * Math.sin(t * 3) + k * .2; }
    if (!this.an) return 0; const a = Math.max(0, Math.floor(lo / this.hz)), b = Math.min(this.data.length - 1, Math.max(a + 1, Math.ceil(hi / this.hz))); let s = 0;
    for (let i = a; i <= b; i++) s += this.data[i]; return Math.min(1, Math.pow(s / (b - a + 1) / 255, 1.3) * 1.5); },
  spec(u) { if (this.mode === 'demo') { const t = (performance.now() - t0) / 1000; return Math.min(1, (.25 + .6 * Math.abs(Math.sin(u * 9 + t * 2))) * Math.exp(-1.6 * u)); } return this.an ? this.data[Math.min(this.data.length - 1, Math.floor(u * 8000 / this.hz))] / 255 : 0; },
  level() { return this.band(0, 6000); },
  peak() { if (this.mode === 'demo') return this.band(0, 100); if (!this.an) return 0; let m = 0; for (let i = 0; i < this.data.length; i++) if (this.data[i] > m) m = this.data[i]; return m / 255; } };
engine.audio = audio;
function soundUI(msg) { $('bBeat').setAttribute('aria-pressed', audio.mode === 'demo'); $('bMic').setAttribute('aria-pressed', audio.mode === 'mic'); $('micState').textContent = msg; }
async function startMic() {
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .55; ctx.createMediaStreamSource(s).connect(an);
    Object.assign(audio, { an, data: new Uint8Array(an.frequencyBinCount), hz: ctx.sampleRate / an.fftSize, mode: 'mic' }); soundUI('マイクの音に反応しています。');
  } catch (e) { audio.mode = 'demo'; soundUI('マイクを使えなかったので、オートビート（120BPM）で動かしています。'); } }

/* ---------- video sources ---------- */
const demo = document.createElement('canvas'); demo.width = 640; demo.height = 360; const dc = demo.getContext('2d'); let demoOn = false;
function drawDemo(t) { const w = 640, h = 360, g = dc.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d2b55'); g.addColorStop(.6, '#b85a3c'); g.addColorStop(1, '#efc079'); dc.fillStyle = g; dc.fillRect(0, 0, w, h);
  dc.fillStyle = '#fff3d6'; dc.beginPath(); dc.arc(320 + Math.cos(t * .4) * 170, 150 + Math.sin(t * .6) * 60, 54, 0, 7); dc.fill();
  for (let i = 0; i < 5; i++) { dc.save(); dc.translate(110 + i * 105, 250 + Math.sin(t * .9 + i) * 34); dc.rotate(t * .5 + i); dc.fillStyle = ['#0e1320', '#e9e4d8', '#2a6f77', '#101010', '#d94f30'][i]; dc.fillRect(-34, -34, 68, 68); dc.restore(); }
  dc.fillStyle = '#0b0d14'; for (let i = 0; i < 9; i++) dc.fillRect(((i * 80 + t * 40) % 720) - 40, 318, 34, 42); }
const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.loop = true; video.autoplay = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.setAttribute('webkit-playsinline', '');
video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1'; document.body.append(video);
function stopStream() { if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; } }
function useDemo(msg) { stopStream(); demoOn = true; engine.source = demo; engine.mirror = false; state.srcLabel = 'demo'; $('srcState').textContent = msg || 'デモ映像を表示しています。'; $('bMirror').setAttribute('aria-pressed', 'false'); }
function camFail(msg) { useDemo(msg); $('note').textContent = msg + ' いまはデモ映像にエフェクトをかけています。'; if (!inViewer) $('bCamRetry').classList.remove('hide'); }
let camBusy = false, camAt = 0;
async function startCam() {
  if (camBusy) return; camBusy = true; camAt = performance.now();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFail(inApp ? 'このアプリ内ブラウザではカメラを使えません。右上のメニューから Safari か Chrome で開いてください。' : 'このブラウザ（または HTTPS でないページ）ではカメラを使えません。'); return; }
    stopStream(); let s;
    try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
    catch (e) { if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError') s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); else throw e; }
    state.stream = s; video.removeAttribute('src'); video.srcObject = s; try { await video.play(); } catch (e) { }
    const tr = s.getVideoTracks()[0]; if (tr) tr.addEventListener('ended', () => { if (state.stream === s && document.visibilityState === 'visible' && performance.now() - camAt > 3000) startCam(); });
    demoOn = false; engine.source = video; engine.mirror = state.facing === 'user'; state.srcLabel = 'camera';
    $('srcState').textContent = 'カメラ映像に適用しています。'; $('note').textContent = ''; $('bCamRetry').classList.add('hide'); $('bMirror').setAttribute('aria-pressed', engine.mirror);
  } catch (e) { const n = e && e.name;
    camFail(n === 'NotAllowedError' || n === 'SecurityError' ? (standalone && iOS ? 'カメラを使えませんでした。ホーム画面のアプリで動かないときは、Safari で開いてください。' : inApp ? 'カメラを使えませんでした。アプリ内ブラウザでは使えないことがあります。Safari か Chrome で開いてください。' : 'カメラが許可されていません。ブラウザのサイト設定でカメラを許可してください。')
      : n === 'NotReadableError' || n === 'AbortError' ? 'カメラをほかのアプリが使っているようです。' : n === 'NotFoundError' ? 'カメラが見つかりませんでした。' : 'カメラを使えませんでした（' + (n || 'エラー') + '）。');
  } finally { camBusy = false; } }
/* phones stop the camera while the page is in the background: bring it back on return */
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' || state.srcLabel !== 'camera') return; const tr = state.stream && state.stream.getVideoTracks()[0];
  if (!tr || tr.readyState !== 'live') startCam(); else video.play().catch(() => { }); });
addEventListener('pointerdown', () => { if (state.srcLabel === 'camera' && video.paused) video.play().catch(() => { }); }, true);
function useFile(f) { stopStream(); demoOn = false; const url = URL.createObjectURL(f);
  if (f.type.startsWith('image/')) { const im = new Image(); im.onload = () => { engine.source = im; engine.srcOk = false; }; im.src = url; } else { video.srcObject = null; video.src = url; video.play().catch(() => { }); engine.source = video; }
  $('bCamRetry').classList.add('hide');
  engine.mirror = false; state.srcLabel = 'file'; $('srcState').textContent = f.name + ' に適用しています。'; $('note').textContent = ''; $('bMirror').setAttribute('aria-pressed', 'false'); }

/* ---------- presets ---------- */
let titleTimer = 0;
function select(cat, idx, quiet) { const F = folders(); cat = (cat + F.length) % F.length; const n = F[cat].items.length; idx = (idx + n) % n; const catChanged = cat !== state.cat; state.cat = cat; state.idx = idx;
  const it = cur(); if (!it.graph) it.graph = it.make(); engine.setGraph(it.graph, it.adapt || {}); engine.intensity = 1;
  state.slow = 0; state.settle = 3; if (state.quality === 'auto') { const q = Math.min(it.q || state.base, state.base); if (q !== state.autoQ) { state.autoQ = q; fit(); } }
  $('tOver').textContent = F[cat].id + '  ' + pad(idx + 1) + ' / ' + pad(n); $('tName').textContent = it.name; $('tDesc').textContent = it.desc;
  $('title').classList.remove('idle'); clearTimeout(titleTimer); titleTimer = setTimeout(() => $('title').classList.add('idle'), 3200);
  if (catChanged || !$('strip').children.length || $('strip').dataset.cat !== F[cat].id) buildStrip();
  for (const b of $('cats').children) b.setAttribute('aria-pressed', b.dataset.cat === F[cat].id);
  [...$('strip').children].forEach((b, i) => { b.setAttribute('aria-selected', i === idx); if (i === idx) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: quiet ? 'auto' : 'smooth' }); });
  if (!standalone) try { history.replaceState(null, '', '#' + it.slug); } catch (e) { }
  persist(); if ($('adj').classList.contains('open')) buildAdjust(); if ($('lib').classList.contains('open')) markLib(); }
function buildCats() { const box = $('cats'); box.textContent = ''; folders().forEach((f, i) => { const b = document.createElement('button'); b.textContent = f.id; b.dataset.cat = f.id; b.setAttribute('aria-pressed', 'false'); b.onclick = () => select(i, i === state.cat ? state.idx : 0); box.append(b); }); }
function buildStrip() { const box = $('strip'), F = folders()[state.cat]; box.textContent = ''; box.dataset.cat = F.id;
  F.items.forEach((it, i) => { const b = document.createElement('button'); b.setAttribute('role', 'option'); b.innerHTML = '<i></i>'; b.firstChild.textContent = pad(i + 1); b.append(it.name);
    if (it.audio) { const a = document.createElement('span'); a.className = 'au'; a.textContent = '♪'; a.title = '音に反応'; b.append(a); }
    b.onclick = () => select(state.cat, i); box.append(b); }); }
function findSlug(s) { const F = folders(); for (let c = 0; c < F.length; c++) { const i = F[c].items.findIndex(x => x.slug === s); if (i >= 0) return [c, i]; } return null; }
async function loadToe(f) { try { const g = TOE.load(new Uint8Array(await f.arrayBuffer())); if (!Object.values(g.nodes).some(n => n.fam === 'TOP')) throw new Error('TOP が見つかりませんでした');
    const name = f.name.replace(/\.(toe|tox)$/i, ''); let it = IMPORT.items.find(x => x.name === name); if (!it) { it = { name, desc: '読み込んだ .toe の TOP ネットワーク', slug: 'import-' + slug(name) }; IMPORT.items.push(it); } it.graph = g;
    buildCats(); buildLib(); closeSheets(); select(folders().length - 1, IMPORT.items.indexOf(it)); $('note').textContent = '';
  } catch (e) { $('note').textContent = f.name + ' を読み込めませんでした：' + (e.message || e); } }

/* ---------- library ---------- */
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
function buildLib() { const box = $('libBody'); box.textContent = ''; let total = 0;
  folders().forEach((f, c) => { const items = f.items.map((it, i) => ({ it, i })).filter(x => !state.favOnly || state.fav.has(x.it.slug)); if (!items.length) return; total += items.length;
    const sec = document.createElement('div'); sec.className = 'folder'; const h = document.createElement('h3'); h.innerHTML = '<span class="n"></span><span></span><small></small><em></em>';
    h.children[0].textContent = pad(c + 1); h.children[1].textContent = f.id; h.children[2].textContent = f.jp; h.children[3].textContent = items.length + ' / ' + f.items.length; sec.append(h);
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const { it, i } of items) { const row = document.createElement('div'); row.className = 'item'; row.dataset.slug = it.slug; const go = document.createElement('button'); go.className = 'go'; go.innerHTML = '<i></i><span></span>'; go.children[0].textContent = pad(i + 1); go.children[1].textContent = it.name; go.title = it.desc;
      go.onclick = () => { closeSheets(); select(c, i); }; const fv = document.createElement('button'); fv.className = 'fav'; fv.innerHTML = STAR; fv.setAttribute('aria-label', it.name + ' をお気に入りに登録'); fv.setAttribute('aria-pressed', state.fav.has(it.slug));
      fv.onclick = () => { state.fav.has(it.slug) ? state.fav.delete(it.slug) : state.fav.add(it.slug); persist(); if (state.favOnly) buildLib(); else fv.setAttribute('aria-pressed', state.fav.has(it.slug)); }; row.append(go, fv); grid.append(row); }
    sec.append(grid); box.append(sec); });
  if (!total) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'お気に入りはまだありません。プリセット名の右の星を押すと、ここに集まります。'; box.append(p); }
  $('libCount').textContent = (state.favOnly ? total + ' favorites' : total + ' presets'); markLib(); }
function markLib() { const s = cur().slug; for (const el of $('libBody').querySelectorAll('.item')) el.classList.toggle('cur', el.dataset.slug === s); }

/* ---------- adjust ---------- */
const SKIP_P = /^(fx|top|operand|outputresolution|resolution[wh]|cachesize|step|style|mono|type|extend|horzsource|vertsource|output\w+|wavetype|filter|file|format|pageindex|parentshortcut|inputfiltertype|filtertype)$/;
function range(name, v) { const n = name.toLowerCase();
  if (/offset$/.test(n) && Math.abs(v) > 2) return [-120, 0, 1];
  if (/opacity|invert|blacklevel|threshold|soften|alpha|dry|color[rgb]$/.test(n)) return [0, Math.max(1, v), .005];
  if (/brightness|gamma|contrast|intensity|gain/.test(n)) return [0, Math.max(4, v * 2), .01];
  if (/^t[xyz]$/.test(n)) return [-.5, .5, .001]; if (/^s[xy]$/.test(n)) return [.2, 2, .005]; if (/rotate/.test(n)) return [-180, 180, .5];
  if (/size|cols|rows/.test(n)) return [0, Math.max(64, v * 2), 1]; if (/weight/.test(n)) return [0, Math.max(.3, v * 2), .001];
  return v === 0 ? [0, 1, .005] : [Math.min(0, v * 2), Math.max(1, v * 2), Math.abs(v) / 100 || .01]; }
const fmt = v => (+v).toFixed(3).replace(/\.?0+$/, '') || '0';
function slider(label, sub, mn, mx, st, val, on) { const w = document.createElement('div'); w.className = 'ctl'; const id = 'c' + (slider.n = (slider.n || 0) + 1); const l = document.createElement('label'); l.htmlFor = id; const b = document.createElement('b'); b.textContent = label; l.append(b); if (sub) l.append(sub);
  const r = document.createElement('input'); r.type = 'range'; r.id = id; r.min = mn; r.max = mx; r.step = st; r.value = val; const o = document.createElement('output'); o.textContent = fmt(val); r.oninput = () => { o.textContent = fmt(r.value); on(+r.value); }; w.append(l, r, o); return w; }
function colorCtl(label, sub, val, on) { const w = document.createElement('div'); w.className = 'ctl'; const id = 'c' + (slider.n = (slider.n || 0) + 1); const l = document.createElement('label'); l.htmlFor = id; const b = document.createElement('b'); b.textContent = label; l.append(b); if (sub) l.append(sub);
  const sp = document.createElement('span'); const c = document.createElement('input'); c.type = 'color'; c.id = id; c.value = val; c.oninput = () => on(c.value); w.append(l, sp, c); return w; }
function nodeControls(name, n, onlyStar) { const out = [], key = k => name + '.' + k;
  if (n.type === 'glsl') { const fx = n.params.fx.v; for (const u of FXSPEC[fx] || []) { const pr = n.params[u.name]; if (onlyStar && (!u.star || u.vec)) continue;
      if (pr && pr.e) { if (!onlyStar) { const d = document.createElement('div'); d.className = 'auto'; d.textContent = u.name + '  ƒ ' + pr.e; out.push(d); } continue; }
      if (u.vec) out.push(colorCtl(u.name, onlyStar ? fx : '', engine.ov[key(u.name)] ?? (pr ? pr.v : u.def), v => { engine.ov[key(u.name)] = v; }));
      else out.push(slider(u.name, onlyStar ? fx : '', u.min, u.max, (u.max - u.min) / 200, engine.ov[key(u.name)] ?? (pr ? parseFloat(pr.v) : u.def), v => { engine.ov[key(u.name)] = v; })); } }
  else if (!onlyStar) for (const k in n.params) { if (SKIP_P.test(k)) continue; const pr = n.params[k];
      if (pr.e) { const d = document.createElement('div'); d.className = 'auto'; d.textContent = k + '  ƒ ' + pr.e; out.push(d); continue; }
      if (/^#[0-9a-f]{6}$/i.test(pr.v)) { out.push(colorCtl(k, '', engine.ov[key(k)] ?? pr.v, v => { engine.ov[key(k)] = v; })); continue; }
      const v = parseFloat(pr.v); if (!isFinite(v) || !/^-?[\d.]+(e-?\d+)?$/.test(pr.v)) continue; const [mn, mx, st] = range(k, v); out.push(slider(k, '', mn, mx, st, engine.ov[key(k)] ?? v, x => { engine.ov[key(k)] = x; })); }
  return out; }
function buildAdjust() { const it = cur(), g = it.graph, box = $('adjBody'); box.textContent = ''; $('adjName').textContent = it.name;
  box.append(slider('Intensity', '', 0, 1, .01, engine.intensity, v => { engine.intensity = v; }));
  const keys = []; for (const [name, n] of Object.entries(g.nodes)) if (n.fam === 'TOP' && !engine.hidden(name)) keys.push(...nodeControls(name, n, true)); keys.slice(0, 6).forEach(k => box.append(k));
  const det = document.createElement('details'), sm = document.createElement('summary'); sm.textContent = 'すべてのパラメータ'; det.append(sm);
  for (const [name, n] of Object.entries(g.nodes)) { if (n.fam !== 'TOP' || engine.hidden(name)) continue; const cs = nodeControls(name, n, false); if (!cs.length) continue; const nd = document.createElement('div'); nd.className = 'node';
    const h = document.createElement('h4'); h.textContent = n.type === 'glsl' ? n.params.fx.v : engine.macro[name] ? n.params.parentshortcut.v : n.type; const sm2 = document.createElement('small'); sm2.textContent = name; h.append(sm2); nd.append(h, ...cs); det.append(nd); }
  box.append(det);
  const row = document.createElement('div'); row.className = 'rowb'; const rs = document.createElement('button'); rs.className = 'btn jp'; rs.textContent = '初期値に戻す'; rs.onclick = () => { engine.ov = Object.assign({}, it.adapt && it.adapt.set); engine.intensity = 1; buildAdjust(); };
  const fv = document.createElement('button'); fv.className = 'btn jp'; const fvSet = () => { fv.textContent = state.fav.has(it.slug) ? '★ お気に入り' : '☆ お気に入りに追加'; fv.setAttribute('aria-pressed', state.fav.has(it.slug)); }; fvSet();
  fv.onclick = () => { state.fav.has(it.slug) ? state.fav.delete(it.slug) : state.fav.add(it.slug); persist(); fvSet(); buildLib(); }; row.append(fv, rs); box.append(row);
  if (engine.unsupported.length) { const d = document.createElement('div'); d.className = 'auto'; d.textContent = '未対応のため素通しのオペレーター: ' + engine.unsupported.join(', '); box.append(d); } }

/* ---------- sheets ---------- */
function closeSheets() { for (const s of document.querySelectorAll('.sheet')) s.classList.remove('open'); }
function openSheet(id) { const was = $(id).classList.contains('open'); closeSheets(); if (was) return; if (id === 'adj') buildAdjust(); if (id === 'lib') buildLib(); $(id).classList.add('open'); }
$('bLib').onclick = () => openSheet('lib'); $('bAdj').onclick = () => openSheet('adj'); $('bMenu').onclick = () => openSheet('menu');
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeSheets;
$('fAll').onclick = () => { state.favOnly = false; $('fAll').setAttribute('aria-pressed', 'true'); $('fFav').setAttribute('aria-pressed', 'false'); buildLib(); };
$('fFav').onclick = () => { state.favOnly = true; $('fAll').setAttribute('aria-pressed', 'false'); $('fFav').setAttribute('aria-pressed', 'true'); buildLib(); };

/* ---------- sizing & loop ---------- */
function fit() { const r = $('stage').getBoundingClientRect(), a = Math.max(.4, Math.min(2.5, (r.width || 16) / (r.height || 9))), q = shortSide(); engine.resize(Math.round(a >= 1 ? q * a : q), Math.round(a >= 1 ? q : q / a)); }
let frames = 0, tHud = 0, recStart = 0, glLost = false;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; }); canvas.addEventListener('webglcontextrestored', () => location.reload());
function loop(now) { requestAnimationFrame(loop); if (glLost) return; audio.update(); if (demoOn) drawDemo((now - t0) / 1000);
  try { engine.frame(now); } catch (e) { if (!loop.err) { loop.err = true; $('note').textContent = '描画エラー: ' + (e.message || e); } }
  frames++; if (now - tHud > 500) { const fps = Math.round(frames * 1000 / (now - tHud)); frames = 0; tHud = now;
    /* auto quality: when a preset is too heavy for this device, lower the resolution one step and remember it for that preset */
    if (state.quality === 'auto' && !document.hidden && !recorder) { if (state.settle > 0) state.settle--; else if (fps < 24) { if (++state.slow >= 3) { const k = QSTEPS.indexOf(state.autoQ); if (k > 0) { /* three presets too heavy at the starting size: this device starts one step lower from now on */ if (state.autoQ === state.base && ++state.drops >= 3 && state.base > 432) { state.base = QSTEPS[QSTEPS.indexOf(state.base) - 1]; state.drops = 0; }
          state.autoQ = QSTEPS[k - 1]; cur().q = state.autoQ; fit(); persist(); } state.slow = 0; state.settle = 2; } } else state.slow = 0; }
    $('status').textContent = fps + ' fps  ·  ' + engine.w + '×' + engine.h + (state.quality === 'auto' ? ' auto' : '') + '  ·  ' + state.srcLabel + (engine.errors.length ? '  ·  errors ' + engine.errors.length : '');
    if (recStart) { const s = Math.floor((now - recStart) / 1000); $('recTime').textContent = Math.floor(s / 60) + ':' + pad(s % 60); } } }

/* ---------- capture ---------- */
let dl = null, shotFile = null;
try { if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { dl = d; }).catch(() => { }); } catch (e) { }
function showShot(el, url, name, blob) { $('shotBox').textContent = ''; $('shotBox').append(el); $('shotSave').href = url; $('shotSave').download = name; shotFile = { name, blob };
  let can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); } catch (e) { } can = can && !(window.claude && window.claude.use); $('shotShare').classList.toggle('hide', !can); $('shotShare').classList.toggle('solid', can && coarse); $('shotSave').classList.toggle('solid', !(can && coarse));
  $('shotHelp').textContent = can && coarse ? (blob.type.startsWith('image/') ? '「Share」→「画像を保存」で写真アプリに入ります。' : '「Share」→「ビデオを保存」で写真アプリに入ります。') : ''; $('shot').classList.add('open'); }
$('shotClose').onclick = () => $('shot').classList.remove('open');
$('shotSave').onclick = async e => { if (!dl || !shotFile) return; e.preventDefault();
  try { await dl.save({ filename: shotFile.name, data: shotFile.blob }); $('shotHelp').textContent = '保存しました。'; }
  catch (err) { const c = err && err.code; $('shotHelp').textContent = c === 'declined' ? '保存をキャンセルしました。' : c === 'rate_limited' ? '少し待ってからもう一度押してください。' : 'この表示環境では保存できません。画像を長押し・右クリックして保存してください。'; } };
$('shotShare').onclick = async () => { try { await navigator.share({ files: [new File([shotFile.blob], shotFile.name, { type: shotFile.blob.type })] }); } catch (e) { } };
function snap() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  canvas.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), im = new Image(); im.src = u; im.alt = '撮影した写真'; showShot(im, u, 'toe_' + cur().slug + '_' + Date.now() + '.jpg', b); }, 'image/jpeg', .94); }
let recorder = null;
function toggleRec() { if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder || !canvas.captureStream) { $('note').textContent = 'このブラウザでは動画を録画できません。'; return; }
  try { const mt = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)), chunks = [];
    recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mt, videoBitsPerSecond: 8e6 }); recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { const blob = new Blob(chunks, { type: mt }), u = URL.createObjectURL(blob), v = document.createElement('video'); v.src = u; v.controls = true; v.loop = true; v.playsInline = true; v.play().catch(() => { });
      showShot(v, u, 'toe_' + cur().slug + '_' + Date.now() + (mt.startsWith('video/mp4') ? '.mp4' : '.webm'), blob); recorder = null; recStart = 0; document.body.classList.remove('rec'); };
    recorder.start(); recStart = performance.now(); $('recTime').textContent = '0:00'; document.body.classList.add('rec');
  } catch (e) { recorder = null; $('note').textContent = 'このブラウザでは動画を録画できません。'; } }
$('shutter').onclick = () => state.mode === 'photo' ? snap() : toggleRec();
for (const b of $('modes').children) b.onclick = () => { if (recorder) return; state.mode = b.dataset.m; for (const x of $('modes').children) x.setAttribute('aria-pressed', x === b); document.body.classList.toggle('video', state.mode === 'video'); };

/* ---------- gestures & keys ---------- */
const next = d => select(state.cat, state.idx + d);
{ let sx = 0, sy = 0, down = false, hold = 0, held = false, keep = 1; const st = $('stage'); st.addEventListener('contextmenu', e => e.preventDefault());
  st.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; held = false; clearTimeout(hold); hold = setTimeout(() => { if (down) { held = true; keep = engine.intensity; engine.intensity = 0; } }, 380); });
  st.addEventListener('pointermove', e => { if (down && !held && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clearTimeout(hold); });
  const up = e => { if (!down) return; down = false; clearTimeout(hold); if (held) { engine.intensity = keep; return; } const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 56 && Math.abs(dy) < 70) next(dx < 0 ? 1 : -1); else if (Math.abs(dy) > 70 && Math.abs(dx) < 56) select(state.cat + (dy < 0 ? 1 : -1), 0); };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', () => { down = false; clearTimeout(hold); if (held) engine.intensity = keep; }); }
addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') next(1); else if (e.key === 'ArrowLeft') next(-1); else if (e.key === 'ArrowDown') select(state.cat + 1, 0); else if (e.key === 'ArrowUp') select(state.cat - 1, 0);
  else if (e.key === ' ') { e.preventDefault(); $('shutter').click(); } else if (e.key === 'Escape') { closeSheets(); $('shot').classList.remove('open'); } });

/* ---------- settings ---------- */
$('bCam').onclick = startCam; $('bCamRetry').onclick = startCam; $('bDemo').onclick = () => { useDemo(); $('note').textContent = ''; };
$('bFlip').onclick = () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; startCam(); };
$('bMirror').onclick = () => { engine.mirror = !engine.mirror; $('bMirror').setAttribute('aria-pressed', engine.mirror); };
$('bFile').onclick = () => $('fMedia').click(); $('fMedia').onchange = e => { if (e.target.files[0]) useFile(e.target.files[0]); e.target.value = ''; };
$('bToe').onclick = () => $('fToe').click(); $('fToe').onchange = e => { if (e.target.files[0]) loadToe(e.target.files[0]); e.target.value = ''; };
$('bMic').onclick = startMic; $('bBeat').onclick = () => { audio.mode = 'demo'; soundUI('オートビート（120BPM）で動かしています。'); };
$('quality').value = state.quality; $('quality').onchange = e => { const v = e.target.value; state.quality = v === 'auto' ? 'auto' : +v; if (v === 'auto') { state.base = weak ? 540 : 720; state.autoQ = state.base; state.drops = 0; for (const f of folders()) for (const it of f.items) delete it.q; } state.slow = 0; state.settle = 2; fit(); persist(); };
$('fText').oninput = e => { engine.text = e.target.value || 'TOE'; };
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
addEventListener('dragover', e => { e.preventDefault(); $('drop').classList.add('on'); }); addEventListener('dragleave', () => $('drop').classList.remove('on'));
addEventListener('drop', e => { e.preventDefault(); $('drop').classList.remove('on'); const f = e.dataTransfer.files[0]; if (!f) return; if (/\.(toe|tox)$/i.test(f.name)) loadToe(f); else if (/^(video|image)\//.test(f.type)) useFile(f); });
/* install as an app */
let installEvt = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('bInstall').classList.remove('hide'); });
$('bInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { } installEvt = null; $('bInstall').classList.add('hide'); };
if (standalone) $('appHelp').textContent = 'アプリとして起動しています。' + (iOS ? 'カメラが動かないときは Safari で開いてください。' : '');
else if (iOS) $('appHelp').textContent = 'Safari の共有メニュー（□に↑）から「ホーム画面に追加」で、アプリとして使えます。';
else if (/Android/.test(navigator.userAgent)) $('appHelp').textContent = 'Chrome のメニュー（⋮）の「アプリをインストール」または「ホーム画面に追加」で、アプリとして使えます。';
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && /github\.io$|^localhost$/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => { });
const hosted = /github\.io$|^localhost$/.test(location.hostname), inViewer = !!(window.claude && window.claude.use);
if (!hosted) $('aClassic').classList.add('hide');
/* inside the Claude artifact viewer the camera, microphone, sharing and installing are not available: offer no buttons for them */
if (inViewer) { for (const id of ['bCam', 'bFlip', 'bMic', 'secApp']) $(id).classList.add('hide'); }
let wake = null; const keepAwake = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { } };
document.addEventListener('visibilitychange', keepAwake);

/* ---------- boot ---------- */
buildCats(); fit(); useDemo(); soundUI('♪ の付いたプリセットは音に反応します。いまはオートビート（120BPM）です。');
{ const at = findSlug(location.hash.slice(1)) || findSlug(saved.last || '') || [0, 0]; select(at[0], at[1], true); }
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== cur().slug) { const at = findSlug(h); if (at) select(at[0], at[1]); } });
requestAnimationFrame(loop); keepAwake();
if (inViewer) { useDemo('デモ映像を表示しています。'); $('note').textContent = 'この表示ではカメラを使えません。設定から動画や画像を選ぶと、その映像にエフェクトがかかります。'; } else startCam();
window.__app = { engine, audio, select, state, folders, cur };
