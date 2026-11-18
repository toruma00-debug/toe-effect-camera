/* Original presets — 5 folders x 20. Each preset is a small operator network (the same graph format the engine
   reads from .toe files): camera -> TOPs / GLSL nodes -> out1, with CHOPs (LFO, noise, audio) driving parameters. */
class GraphBuilder {
  constructor() { this.nodes = {}; this.count = {}; this.audio = false; }
  _name(t) { this.count[t] = (this.count[t] || 0) + 1; return t + this.count[t]; }
  _par(o) { const r = {}; for (const k in o) { const v = o[k]; if (v === undefined) continue; r[k] = typeof v === 'string' && v[0] === '=' ? { v: '0', e: v.slice(1) } : { v: String(v) }; } return r; }
  top(type, ins, par, name) { name = name || this._name(type); this.nodes[name] = { fam: 'TOP', type, inputs: [].concat(ins || []).map(x => x || null), params: this._par(par || {}) }; return name; }
  chop(type, ins, par, name) { name = name || this._name(type); this.nodes[name] = { fam: 'CHOP', type, inputs: [].concat(ins || []), params: this._par(par || {}) }; return name; }
  get cam() { if (!this.nodes.cam) this.top('moviefilein', [], {}, 'cam'); return 'cam'; }
  fx(name, ins, par, node) { return this.top('glsl', ins, Object.assign({ fx: name }, par), node || this._name(name)); }
  out(x) { return this.top('out', [x], {}, 'out1'); }
  level(x, par, name) { return this.top('level', [x], par, name); }
  blur(x, size) { return this.top('blur', [x], { size }); }
  half(x) { return this.top('res', [x], { outputresolution: 'half' }); }
  xf(x, par) { return this.top('transform', [x], par); }
  glow(x, par) { return this.top('glow', [x], par); }
  comp(op, ins, name) { return this.top('comp', ins, { operand: op }, name); }
  blend(a, b, mode, opacity, name) { return this.fx('blend', [a, b], { mode: { normal: 0, add: 1, screen: 2, multiply: 3, overlay: 4, lighten: 5, darken: 6, difference: 7, subtract: 8, ghost: 9 }[mode], opacity: opacity ?? 1 }, name); }
  /** a parameter shown as a main slider in the Adjust sheet */
  key(node, param, label, min, max, def) { (this.keys = this.keys || []).push({ node, param, label, min, max, def }); return this; }
  /** Ramp TOP from colour keys [[pos, r, g, b, a], ...] */
  ramp(keys, par) { return this.top('ramp', [], Object.assign({ keys: JSON.stringify(keys) }, par)); }
  /** last frame's output of the named node (a Feedback TOP) */
  fb(target, init) { return this.top('feedback', [init || this.cam], { top: target }); }
  prev(x) { return this.top('feedback', [x], { top: x }); }
  cache(x, n, step) { return this.top('tex3d', [x], { cachesize: n, step: step || 1 }); }
  tima(cache, map, black, white) { return this.top('tima', [cache, map], { blackoffset: black, whiteoffset: white }); }
  lfo(freq, lo, hi, wave) { const one = wave === 'pulse', n = this.chop('lfo', [], { frequency: freq, offset: one ? lo : (lo + hi) / 2, amp: one ? hi - lo : (hi - lo) / 2, wavetype: wave || 'sin' }); return `op('${n}')['chan1']`; }
  wob(rate, lo, hi, seed) { const n = this.chop('noise', [], { rate, offset: (lo + hi) / 2, amp: (hi - lo) / 2, seed: seed || 1 }); return `op('${n}')['chan1']`; }
  _audio() { if (this.audio) return; this.audio = true; this.chop('audiofilter', [], { cutofffrequency: 140, filter: 'lowpass' }, 'bassraw'); this.chop('lag', ['bassraw'], { lag1: .07 }, 'bass');
    this.chop('trigger', ['bassraw'], { threshup: .45 }, 'kick'); this.chop('audiofilter', [], { cutofffrequency: 4500, filter: 'highpass' }, 'highraw'); this.chop('lag', ['highraw'], { lag1: .06 }, 'high'); }
  bass(lo, hi) { this._audio(); return `(${lo}+op('bass')['chan1']*${(hi - lo).toFixed(4)})`; }
  high(lo, hi) { this._audio(); return `(${lo}+op('high')['chan1']*${(hi - lo).toFixed(4)})`; }
  kick() { this._audio(); return `op('kick')['chan1']`; }
}
const T = 'absTime.seconds';
const FOLDERS = [
  { id: 'FILM', jp: 'フィルムとアナログの質感' }, { id: 'GLITCH', jp: 'デジタルの乱れと信号' }, { id: 'LIGHT', jp: '光・グロー・残像' },
  { id: 'GRAPHIC', jp: '印刷とイラストレーション' }, { id: 'SPACE', jp: '歪み・時間・立体' }, { id: 'SENSOR', jp: '追跡・サーマル・時間のずれ' }];
const ORIGINALS = [];
const def = (cat, name, desc, fn) => ORIGINALS.push({ cat, name, desc, fn });

/* ───────── FILM ───────── */
/* ---- systems ported from .toe files -------------------------------------------------------------------------
   Film_Look_Color_Granding.toe : level -> threshold(soft) -> blur -> screen over the picture -> Bloom TOP -> Noise TOP used as grain.
     out1 = colour look, out2 = the same summed with the picture then mono, out4 = red halation through a Lookup TOP + a ramp wash.
   thermal_vision_effect.toe     : Luma Level (inverted) -> Feedback/Blur/Level loop composited Over itself -> Lookup TOP with a 5-key ramp
     (RGBA independent) -> Noise -> Displace -> Overlay.
   pixelate_effect.toe           : Edge -> palette Pixelate (4x2) used both as the picture and as the Time Machine map, shown through a
     Matte TOP whose matte is a thresholded Noise TOP.
   Parameter values are the ones stored in the files; the grain seed and the noise drift are animated here. */
const filmGrain = (g, x, spread) => { const n = g.top('noise', [x], { seed: '=9999+floor(' + T + '*24)', period: 0, harmon: 1, spread, gain: 2, amp: .06, offset: 0 }); g.key(n, 'amp', 'Grain', 0, .25); return n; };
/* the file lifts the picture x2 before the threshold, which suits dark footage; for a live camera the lift starts lower and is a slider */
const filmBloom = (g, lift) => { const c = g.cam, pre = g.level(c, { brightness1: lift, gamma1: 1.1 }), hi = g.top('thresh', [pre], { rgb: 'rgbaverage', threshold: .7, soften: 1 }); g.key(pre, 'brightness1', 'Glow', .5, 2);
  return g.top('bloom', [g.comp('screen', [g.top('blur', [hi], { preshrink: 8, size: 32 }), c])], { preblacklevel: .963 }); };
def('FILM', 'Amber 400', '暖色ネガの色と粒子、淡いハレーション', g => { let x = g.fx('grade', g.cam, { temp: .28, tint: .05, contrast: 1.08, sat: 1.12, fade: .18, sh: '#7a8088', hi: '#8a8272' });
  x = g.glow(x, { threshold: .72, size: 26, intensity: .4, tint: '#ff8a4a' }); x = g.fx('grain', x, { amount: .13, size: 1.7 }); g.out(g.fx('vignette', x, { amount: .35 })); });
def('FILM', 'Halation', 'ハイライトのまわりに赤くにじむ光', g => { let x = g.fx('grade', g.cam, { contrast: 1.15, sat: 1.05, fade: .08, temp: .06 });
  x = g.glow(x, { threshold: .7, size: 38, intensity: .8, tint: '#ff3b1c', gamma: 1.6 }); x = g.glow(x, { threshold: .82, size: 10, intensity: .3, tint: '#ffb070' }); g.out(g.fx('grain', x, { amount: .09 })); });
def('FILM', 'Super 8', '揺れ・傷・フリッカーのある8mmフィルム', g => { let x = g.xf(g.cam, { tx: '=' + g.wob(9, -.004, .004, 1), ty: '=' + g.wob(7, -.006, .006, 2), sx: 1.04, sy: 1.04 });
  x = g.fx('grade', x, { temp: .35, sat: .85, contrast: 1.2, fade: .25, gamma: 1.05, sh: '#70808a', hi: '#8c8468' }); x = g.blur(x, 2.2); x = g.fx('dust', x, { density: .7, scratch: .6, flicker: .18 });
  x = g.fx('grain', x, { amount: .22, size: 2.4, color: .3 }); g.out(g.fx('vignette', x, { amount: .8, radius: .78, soft: .25, round: .2 })); });
def('FILM', 'Bleach Bypass', '銀残し。低彩度でコントラストの強い画', g => { let x = g.fx('grade', g.cam, { sat: .35, contrast: 1.5, gamma: .95, sh: '#7c8084', hi: '#84827c' }); x = g.fx('grain', x, { amount: .1 }); g.out(g.fx('vignette', x, { amount: .3 })); });
def('FILM', 'Cross Process', 'クロスプロセスの色転び', g => { let x = g.fx('grade', g.cam, { contrast: 1.3, sat: 1.35, tint: -.25, gamma: 1.05, sh: '#5a8a78', hi: '#a09050' }); x = g.fx('vignette', x, { amount: .5, radius: .68 }); g.out(g.fx('grain', x, { amount: .1, color: .5 })); });
def('FILM', 'Tri-X Push', '増感現像したモノクロ。飛び気味のハイライトと粒子', g => { let x = g.top('add', [filmBloom(g, 1.1), g.level(g.cam, { opacity: .15 })]); x = g.top('mono', [filmGrain(g, x, 10.2)]);
  x = g.level(x, { blacklevel: .1, contrast: 1.2 }); x = g.fx('grain', x, { amount: .14, size: 2.2, luma: .3, color: 0 }); g.out(g.fx('vignette', x, { amount: .35 })); });
def('FILM', 'Aerochrome', '赤外カラーフィルム。緑が赤紫に転ぶ', g => { let x = g.fx('hueshift', g.cam, { from: .3, to: .93, width: .17, sat: 1.5 }); x = g.fx('grade', x, { contrast: 1.12, sat: 1.1, sh: '#78828c', hi: '#868078' }); g.out(g.fx('grain', x, { amount: .1 })); });
def('FILM', 'Instant Fade', '褪せたインスタント写真', g => { let x = g.fx('grade', g.cam, { exposure: .3, fade: .5, contrast: .9, sat: .8, temp: .12, gamma: 1.1, sh: '#6c8490', hi: '#908a78' }); x = g.blur(x, 1.5);
  x = g.fx('vignette', x, { amount: .45, soft: .6 }); g.out(g.fx('grain', x, { amount: .08 })); });
def('FILM', 'Light Leak', 'フィルムに漏れたオレンジの光', g => { let x = g.fx('grade', g.cam, { temp: .15, fade: .22, contrast: 1.05 }); x = g.fx('leak', x, { amount: 1.1 }); g.out(g.fx('grain', x, { amount: .12 })); });
def('FILM', 'VHS Rental', '色にじみとトラッキングノイズのビデオテープ', g => { let x = g.blur(g.cam, 2.5); x = g.fx('vhs', x, {}); x = g.fx('grade', x, { contrast: 1.05, fade: .2, sat: 1.1 });
  x = g.fx('scanlines', x, { amount: .18, count: 240 }); g.out(g.top('osd', [x], { style: 'play' })); });
def('FILM', 'Handycam 98', '日付入りの家庭用ビデオカメラ', g => { let x = g.fx('sharpen', g.cam, { amount: 1.6, radius: 1.8 }); x = g.fx('interlace', [x, g.prev(x)], { lines: 1.5 });
  x = g.fx('grade', x, { sat: .88, tint: -.08, contrast: 1.1, fade: .1, gamma: 1.08 }); x = g.fx('chroma', x, { amount: .0025, radial: 0 }); x = g.fx('grain', x, { amount: .07, color: .6 }); g.out(g.top('osd', [x], { style: 'cam' })); });
def('FILM', 'CRT Arcade', '走査線とRGBマスクのブラウン管', g => { let x = g.fx('grade', g.cam, { sat: 1.25, contrast: 1.1 }); x = g.fx('crt', x, {}); g.out(g.glow(x, { threshold: .5, size: 14, intensity: .5 })); });
def('FILM', 'Tintype', '周辺がぼける湿板写真', g => { let x = g.fx('duotone', g.cam, { contrast: 1.2, c1: '#0d0f12', c2: '#7a828a', c3: '#e2e5df' }); x = g.fx('focus', [x, g.blur(x, 10)], { radial: 1, width: .28, soft: .35 });
  x = g.fx('dust', x, { density: .8, scratch: .2, flicker: .05 }); x = g.fx('vignette', x, { amount: .8, radius: .7 }); g.out(g.fx('grain', x, { amount: .16, color: 0 })); });
def('FILM', 'Sepia Reel', 'セピアに焼けた古い映画フィルム', g => { let x = g.xf(g.cam, { ty: '=' + g.wob(6, -.005, .005, 3), sx: 1.02, sy: 1.02 }); x = g.fx('duotone', x, { contrast: 1.2, c1: '#1a0f08', c2: '#a8835a', c3: '#f3e3c3' });
  x = g.fx('dust', x, { density: .9, scratch: .8, flicker: .22 }); x = g.fx('vignette', x, { amount: .6, radius: .72 }); g.out(g.fx('grain', x, { amount: .2, size: 2, color: 0 })); });
def('FILM', 'Two-Strip', '赤とシアンだけで刷る2色法', g => { let x = g.fx('mixer', g.cam, { r: '#ff3018', g: '#18b0a0', b: '#085858' }); x = g.fx('grade', x, { contrast: 1.15, sat: 1.1, fade: .1 }); x = g.fx('grain', x, { amount: .12 }); g.out(g.fx('vignette', x, { amount: .4 })); });
def('FILM', 'Cyanotype', '青一色の日光写真', g => { let x = g.fx('duotone', g.cam, { contrast: 1.15, c1: '#06223f', c2: '#2f6ea3', c3: '#eef4f6' }); x = g.fx('paper', x, { amount: .5 }); x = g.fx('dust', x, { density: .3, scratch: 0, flicker: 0 }); g.out(g.fx('vignette', x, { amount: .3 })); });
def('FILM', 'Expired Roll', '期限切れフィルムの紫かぶりと、ハイライトの赤いにじみ', g => { const c = g.cam;
  const hi = g.top('thresh', [g.level(c, { brightness1: 2, gamma1: 1.1 })], { rgb: 'rgbaverage', threshold: 1, soften: .244 });
  const red = g.top('lookup', [hi, g.ramp([[0, 0, 0, 0, 1], [1, .862, 0, 0, 1]])], { index1: 0, index2: 8, lightuv1: 20, lightuv2: 19.5 });
  const wash = g.level(g.ramp([[0, 0, 0, 0, 1], [.002538071, .681, .64695, 0, .874], [.002538071, .1500001, 0, 1, 1], [1, 1, 0, .9833331, .369]]), { invert: .145 }); g.key(wash, 'opacity', 'Cast', 0, 1, 1);
  let x = g.comp('screen', [wash, g.comp('screen', [g.top('blur', [red], { size: 32 }), c])]); x = g.level(x, { brightness1: .86, gamma1: .88, contrast: .87 }); g.out(filmGrain(g, x, 10.1)); });
def('FILM', 'Tungsten 800', '夜の青緑と、灯りの赤いハレーション', g => { let x = g.fx('grade', g.cam, { temp: -.35, tint: -.05, contrast: 1.15, sat: 1.1, sh: '#6a8088', hi: '#808890' }); x = g.glow(x, { threshold: .78, size: 34, intensity: .7, tint: '#ff2a1a' }); g.out(g.fx('grain', x, { amount: .16 })); });
def('FILM', 'Anamorphic', '横に伸びる青いフレアとシネスコの帯', g => { const c = g.cam; let s = g.half(g.level(c, { blacklevel: .8, brightness1: 3 })); s = g.fx('dirblur', s, { len: .4, angle: 0, decay: 1.6, gain: 1.2 }); s = g.fx('tint', s, { c: '#3f9cff', gain: .8 });
  let x = g.fx('grade', c, { contrast: 1.12, sat: 1.1, sh: '#6e8690', hi: '#928670' }); x = g.blend(x, s, 'add'); x = g.fx('chroma', x, { amount: .004 }); x = g.fx('bars', x, { bars: .11 }); g.out(g.fx('grain', x, { amount: .07 })); });
def('FILM', 'Film Look', 'ハイライトのにじみとブルーム、細かい粒子のフィルムルック', g => g.out(filmGrain(g, filmBloom(g, 1.1), 10.4)));
def('GLITCH', 'RGB Split', '音で開く色ずれ', g => { let x = g.fx('chroma', g.cam, { amount: '=' + g.bass(.006, .035), radial: 0, angle: '=' + T + '*40' }); g.out(g.fx('tear', x, { amount: .012, band: .03, speed: 6 })); });
def('GLITCH', 'Datamosh', '動きだけが画を押し流すデータモッシュ', g => { const c = g.cam, lo = g.top('res', [g.blur(c, 6)], { outputresolution: 'quarter' }, 'lo'); const fl = g.blur(g.fx('flow', [lo, g.prev(lo)], { gain: 1.5 }), 4);
  g.fx('mosh', [g.fb('mosh1', c), fl, c], { carry: 2.2, refresh: .004, key: '=' + g.lfo(.12, 0, 1, 'pulse'), block: 14 }, 'mosh1'); g.out('mosh1'); });
def('GLITCH', 'Pixel Stretch', '明るい部分が縦に引き伸びるピクセルソート風', g => g.out(g.fx('pixelstretch', g.cam, { thresh: .55, len: .4 })));
def('GLITCH', 'Block Error', 'ブロック単位でずれる圧縮エラー', g => { let x = g.fx('jpeg', g.cam, { block: 8, q: 9, chroma: 2 }); g.out(g.fx('blockglitch', x, { amount: '=' + g.bass(.25, .95) })); });
def('GLITCH', 'Sync Tear', '同期が外れて横に裂ける画面', g => { let x = g.fx('tear', g.cam, { amount: .06, band: .08, roll: .15 }); x = g.fx('chroma', x, { amount: .006, radial: 0 }); g.out(g.fx('scanlines', x, { amount: .25, count: 300 })); });
def('GLITCH', 'Pixelate', 'ブロック化した輪郭線に、ノイズの穴から遅れた映像がのぞく', g => { const c = g.cam, ed = g.top('edge', [c], { strength: 10 }), px = g.top('pixelate', [ed], { horsize: 4, vertsize: 2 });
  const n = g.top('noise', [g.level(c, { invert: .228, blacklevel: .5, brightness1: .37, gamma1: .93, contrast: 1.05 })], { seed: 1451, period: .35, harmon: 0, spread: 5.4, gain: 2, exp: 4, amp: 2, offset: 1, mono: 'off', tz: '=' + T + '*.05' });
  const tm = g.tima(g.cache(c, 64, 2), px, 0, -87); g.key(px, 'horsize', 'Pixel', 1, 40).key(ed, 'strength', 'Edge', 1, 20).key(n, 'amp', 'Holes', 0, 6).key(tm, 'whiteoffset', 'Delay', -120, 0);
  g.out(g.top('matte', [px, tm, g.top('thresh', [n], { threshold: 1 })])); });
def('GLITCH', 'ASCII Term', '文字だけで描く緑の端末', g => g.out(g.glow(g.fx('ascii', g.cam, {}), { threshold: .3, size: 10, intensity: .5 })));
def('GLITCH', 'Code Rain', '映像の明るさに沿って流れ落ちる文字', g => g.out(g.glow(g.fx('matrix', g.cam, { gain: 2.2 }), { threshold: .25, size: 12, intensity: .8 })));
def('GLITCH', 'Thermal', '明暗を反転して熱の残像を重ね、色の帯に置き換えるサーマルビジョン', g => { const ll = g.top('lumalevel', [g.cam], { invert: 1, blacklevel: .38, brightness1: 2, gamma1: 3, contrast: .8 });
  const trail = g.level(g.top('blur', [g.fb('heat', ll)], { preshrink: 3, size: 6 }), { opacity: .924 }); g.comp('over', [trail, ll], 'heat');
  const lk = g.top('lookup', ['heat', g.ramp([[0, 0, 0, 0, 0], [.30964467, .83739996, 1, .729, 1], [.51522845, .70719993, .634, 1, .518], [.70558375, 0, 1, .73333335, 1], [1, .587, .60765, 1, 1]])]);
  const n = g.top('noise', [lk], { seed: 9999, period: 0, spread: 0, gain: .25, exp: 2.88, amp: .5, offset: 0 }); g.key(trail, 'opacity', 'Trail', 0, .98).key(n, 'amp', 'Grain', 0, 1).key(ll, 'blacklevel', 'Level', 0, .8);
  g.out(g.comp('overlay', [g.top('displace', [g.top('blur', [g.level(n, { blacklevel: .1, brightness1: .9 })], { size: 2 }), n], { vertsource: 'blue', displaceweightx: .01, displaceweighty: .01 }), n])); });
def('GLITCH', 'Night Vision', '緑の暗視スコープ', g => { let x = g.fx('thermal', g.fx('grade', g.cam, { exposure: .8, contrast: 1.2 }), { mode: 3 }); x = g.fx('grain', x, { amount: .25, size: 2, color: 0 }); x = g.glow(x, { threshold: .55, size: 16, intensity: .6 });
  x = g.fx('scanlines', x, { amount: .2, count: 360 }); g.out(g.fx('vignette', x, { amount: 1.2, radius: .8, soft: .25, round: 1 })); });
def('GLITCH', 'X-Ray', '反転した青い透過像と輪郭', g => { const c = g.cam; let x = g.fx('duotone', g.level(c, { invert: 1 }), { contrast: 1, c1: '#020812', c2: '#2a6fb0', c3: '#cfe6f5' }); x = g.blend(x, g.fx('edges', c, { strength: 3 }), 'add', .5); g.out(g.glow(x, { threshold: .7, size: 14, intensity: .25 })); });
def('GLITCH', 'Time Bands', '横の帯ごとに時間がずれる', g => { const c = g.cam; g.out(g.tima(g.cache(c, 48), g.fx('gen', [], { mode: 3, scale: 24, speed: .5 }), -40, 0)); });
def('GLITCH', 'Corrupt Loop', '壊れながら循環するフィードバック', g => { const c = g.cam; let f = g.top('displace', [g.fb('mix1', c), g.fx('gen', [], { mode: 4, scale: 9, speed: 1.5, seed: 3 })], { displaceweightx: .03, displaceweighty: 0, horzsource: 'red', vertsource: 'none' });
  f = g.level(g.fx('hue', f, { shift: .02, sat: 1.04 }), { opacity: .97 }); g.blend(f, c, 'normal', .12, 'mix1'); g.out(g.fx('blockglitch', 'mix1', { amount: .25 })); });
def('GLITCH', 'Interlace', '動くと櫛状に割れるインターレース', g => { const c = g.cam; g.out(g.fx('interlace', [c, g.tima(g.cache(c, 8), null, -4, -4)], { lines: 2 })); });
def('GLITCH', 'JPEG 10%', '潰れるまで圧縮したJPEG', g => g.out(g.fx('jpeg', g.cam, { block: 12, q: 5, chroma: 2 })));
def('GLITCH', 'No Signal', '砂嵐が割り込む受信不良', g => { let x = g.fx('tear', g.cam, { amount: .03, roll: .08 }); g.out(g.fx('static', x, { amount: '=' + g.wob(.8, .05, .75, 4), bars: .0 })); });
def('GLITCH', 'Hologram', '走査線とゆらぎのある青い投影像', g => g.out(g.glow(g.fx('holo', g.cam, {}), { threshold: .5, size: 18, intensity: .35, tint: '#3ad7ff' })));
def('GLITCH', 'Motion Extract', '動いた部分だけが残る', g => { const c = g.cam, d = g.fx('framediff', [c, g.prev(c)], { gain: 10, thresh: .015, mode: 1 }); g.comp('maximum', [g.level(g.fb('acc', d), { opacity: .9 }), d], 'acc'); g.out(g.blend(g.level(c, { brightness1: .25 }), 'acc', 'add')); });
def('GLITCH', 'Channel Drift', 'R・G・B が別々の時間を映す', g => { const k = g.cache(g.cam, 24); g.out(g.top('reorder', [g.tima(k, null, 0, 0), g.tima(k, null, -6, -6), g.tima(k, null, -12, -12)],
  { outputred: 'input1', outputredchan: 'red', outputgreen: 'input2', outputgreenchan: 'green', outputblue: 'input3', outputbluechan: 'blue', outputalphachan: 'one' })); });
def('GLITCH', 'Lidar Scan', '輪郭を点で拾う走査', g => { const c = g.cam; let x = g.fx('dotgrid', c, {}); x = g.blend(x, g.fx('tint', g.fx('sweep', g.fx('edges', c, { strength: 3 }), { speed: .3, width: .08 }), { c: '#00ffa8' }), 'add'); g.out(g.glow(x, { threshold: .3, size: 12, intensity: .7 })); });

/* ───────── LIGHT ───────── */
def('LIGHT', 'Neon Edge', '輪郭がネオン管になる', g => { const c = g.cam; const col = g.fx('colorize', g.fx('edges', g.blur(c, 2), { strength: 3 }), { range: .8, speed: .15, gain: 1.6 }); g.out(g.blend(g.level(c, { brightness1: .18 }), g.glow(col, { threshold: .1, size: 22, intensity: 1.6 }), 'add')); });
def('LIGHT', 'Aura', '輪郭から外へ広がる光の輪', g => { const c = g.cam; const e = g.fx('colorize', g.fx('edges', g.blur(c, 2), { strength: 2, thresh: .15 }), { range: .3, speed: .08, gain: .9 });
  const f = g.level(g.fx('hue', g.xf(g.fb('acc', e), { sx: 1.035, sy: 1.035 }), { shift: .01 }), { opacity: .86 }); g.comp('maximum', [f, e], 'acc'); g.out(g.blend(g.level(c, { brightness1: .6 }), 'acc', 'add')); });
def('LIGHT', 'Light Trails', '光が尾を引く長時間露光', g => { const c = g.cam, b = g.level(c, { blacklevel: .6, brightness1: 2.2 }); g.comp('maximum', [g.level(g.fb('acc', b), { opacity: .965 }), b], 'acc'); g.out(g.blend(c, 'acc', 'screen')); });
def('LIGHT', 'Ghost Echo', '動きが溶けて重なる残像', g => { const c = g.cam; g.blend(g.fb('mix1', c), c, 'normal', .12, 'mix1'); g.out('mix1'); });
def('LIGHT', 'Prism', '虹色に分かれて重なる像', g => g.out(g.fx('prism', g.cam, { amount: '=' + g.bass(.012, .045), n: 6 })));
def('LIGHT', 'Rainbow Echo', '過去の姿が色違いで追いかける', g => { const c = g.cam, k = g.cache(c, 40); let acc = c;
  ['#ff3b3b', '#ffb13b', '#3bff8a', '#3bb6ff', '#b03bff'].forEach((col, i) => { acc = g.blend(acc, g.fx('tint', g.fx('framediff', [g.tima(k, null, -(i + 1) * 6, -(i + 1) * 6), c], { gain: 1.3, thresh: 0, mode: 1 }), { c: col, gain: 1 }), 'add'); }); g.out(acc); });
def('LIGHT', 'God Rays', '明るい所から伸びる光の筋', g => { const c = g.cam; g.out(g.blend(c, g.fx('zoom', g.half(g.level(c, { blacklevel: .75, brightness1: 2 })), { amount: .45, gain: 1 }), 'add', .7)); });
def('LIGHT', 'Star Filter', '光源が六条に伸びるクロスフィルター', g => { const c = g.cam, b = g.half(g.level(c, { blacklevel: .82, brightness1: 2.5 })); const s = a => g.fx('dirblur', b, { len: .22, angle: a, decay: 3, gain: .9 });
  g.out(g.blend(c, g.comp('add', [s(30), s(150), s(90)]), 'add')); });
def('LIGHT', 'Bokeh', '大きな丸ぼけ', g => g.out(g.fx('bokeh', g.cam, { radius: 14, boost: 5 })));
def('LIGHT', 'Glow Wire', '光る輪郭線が滲んで残る', g => { const c = g.cam, e = g.fx('edges', g.blur(c, 2), { strength: 3, thresh: .12 }); g.comp('maximum', [g.level(g.blur(g.fb('acc', e), 6), { opacity: .82 }), e], 'acc'); g.out(g.glow(g.fx('tint', 'acc', { c: '#7fe9ff', gain: 1.2 }), { threshold: .2, size: 20, intensity: .6 })); });
def('LIGHT', 'Laser Sweep', '光の線が輪郭をなぞっていく', g => { const c = g.cam, sw = g.fx('sweep', g.fx('edges', c, { strength: 3.5 }), { speed: .28, width: .05 }); g.comp('maximum', [g.level(g.fb('acc', sw), { opacity: .95 }), sw], 'acc');
  g.out(g.blend(g.level(c, { brightness1: .3 }), g.glow(g.fx('tint', 'acc', { c: '#5dff7a', gain: 1.5 }), { threshold: .2, size: 16, intensity: 1 }), 'add')); });
def('LIGHT', 'Chroma Loop', '色相を回しながら広がるフィードバック', g => { const c = g.cam; const f = g.fx('hue', g.xf(g.fb('mix1', c), { sx: 1.03, sy: 1.03, rotate: 1.2 }), { shift: .035 }); g.blend(f, c, 'normal', .16, 'mix1'); g.out('mix1'); });
def('LIGHT', 'Solar Flare', 'ソラリゼーションと強いグロー', g => { let x = g.fx('solar', g.cam, { thresh: .55, soft: .3 }); x = g.glow(x, { threshold: .55, size: 28, intensity: .9, tint: '#ffcf8a' }); g.out(g.fx('grade', x, { contrast: 1.15, temp: .1 })); });
def('LIGHT', 'Soft Focus', '芯を残してやわらかく包むソフトフォーカス', g => { const c = g.cam; g.out(g.fx('grade', g.blend(c, g.blur(c, 18), 'screen', .6), { contrast: .95, exposure: -.15 })); });
def('LIGHT', 'Afterimage', '補色の残像が遅れて浮かぶ', g => { const c = g.cam; g.blend(g.fb('slow', c), c, 'normal', .04, 'slow'); g.out(g.blend(c, 'slow', 'ghost')); });
def('LIGHT', 'Strobe Hold', 'キックのたびに閃光で静止する', g => { const k = g.kick(); let x = g.level(g.top('hold', [g.cam], { trigger: '=' + k }), { brightness1: '=1+' + k + '*0.5', contrast: 1.15 }); g.out(g.fx('chroma', x, { amount: '=' + k + '*0.02' })); });
def('LIGHT', 'Light Painting', '動いた軌跡が光の線として残る', g => { const c = g.cam; const col = g.fx('colorize', g.blur(g.fx('framediff', [c, g.prev(c)], { gain: 14, thresh: .03 }), 3), { h0: '=' + T + '*0.07', range: .15, speed: 0, gain: 1.4 });
  g.comp('maximum', [g.level(g.fb('acc', col), { opacity: .99 }), col], 'acc'); g.out(g.blend(g.level(c, { brightness1: .35 }), g.glow('acc', { threshold: .2, size: 14, intensity: .8 }), 'screen')); });
def('LIGHT', 'Iridescent', '輪郭に乗る玉虫色の薄膜', g => g.out(g.fx('thinfilm', g.cam, {})));
def('LIGHT', 'Club Lights', '音に合わせて動く色つきの照明', g => { let x = g.fx('lights', g.cam, { amount: '=' + g.bass(.6, 1.9), speed: .8, ambient: .4 }); g.out(g.glow(g.fx('grade', x, { contrast: 1.15 }), { threshold: .6, size: 22, intensity: .6 })); });
def('LIGHT', 'Blacklight', '紫と蛍光色のブラックライト', g => { const c = g.cam; let x = g.fx('duotone', g.fx('poster', c, { levels: 4, dither: .3 }), { c1: '#05010f', c2: '#5a12d6', c3: '#39ffb0', contrast: 1.3 });
  x = g.blend(x, g.fx('colorize', g.fx('edges', c, { strength: 2.5 }), { h0: .8, range: .25, gain: 1.2 }), 'add'); g.out(g.glow(x, { threshold: .45, size: 20, intensity: .9 })); });

/* ───────── GRAPHIC ───────── */
def('GRAPHIC', 'Halftone', '網点だけで描くモノクロ印刷', g => g.out(g.fx('halftone', g.cam, { gain: 1.3 })));
def('GRAPHIC', 'CMYK Print', '4色の網点がずれて重なるオフセット印刷', g => g.out(g.fx('paper', g.fx('halftone', g.cam, { mode: 1, scale: 6, gain: 1.1 }), { amount: .4 })));
def('GRAPHIC', 'Risograph', '版ずれと粒状感のある2色刷り', g => g.out(g.fx('paper', g.fx('riso', g.cam, {}), { amount: .5 })));
def('GRAPHIC', 'Engraving', '線の太さで濃淡を刻む銅版画', g => g.out(g.fx('linescreen', g.cam, { freq: 110, wave: .3 })));
def('GRAPHIC', '1-Bit Dither', '白と黒の点だけの1ビット画像', g => g.out(g.fx('dither', g.cam, {})));
def('GRAPHIC', 'Pocket Game', '4階調の緑の携帯ゲーム画面', g => g.out(g.fx('palette4', g.cam, {})));
def('GRAPHIC', 'Pixel 16', '色数を絞ったドット絵', g => g.out(g.fx('poster', g.cam, { levels: 4, dither: .6, px: 6, sat: 1.3 })));
def('GRAPHIC', 'Toon', '塗り分けと黒い輪郭のアニメ調', g => g.out(g.fx('toon', g.fx('kuwahara', g.cam, { radius: 2 }), {})));
def('GRAPHIC', 'Ink Sketch', '紙にペンで引いた線画', g => { const c = g.cam; g.out(g.fx('paper', g.fx('dog', [g.blur(c, 1.5), g.blur(c, 5)], {}), { amount: .5 })); });
def('GRAPHIC', 'Crosshatch', '斜線の重なりで陰影をつけるハッチング', g => g.out(g.fx('paper', g.fx('hatch', g.cam, {}), { amount: .4 })));
def('GRAPHIC', 'Oil Paint', '筆の塊でまとめる油彩', g => g.out(g.fx('grade', g.fx('kuwahara', g.cam, { radius: 4, step: 1.6 }), { sat: 1.25, contrast: 1.08 })));
def('GRAPHIC', 'Watercolor', '紙ににじむ淡い水彩', g => { const c = g.cam; let x = g.fx('grade', g.fx('kuwahara', c, { radius: 5, step: 2 }), { fade: .35, sat: 1.15, exposure: .25 });
  x = g.blend(x, g.fx('dog', [g.blur(c, 2), g.blur(c, 7)], { sharp: 12, ink: '#6a6660', paper: '#ffffff' }), 'multiply', .55); g.out(g.fx('paper', x, { amount: .8 })); });
def('GRAPHIC', 'Pop Quad', '4つの配色で並べるポップアート', g => g.out(g.fx('popquad', g.cam, {})));
def('GRAPHIC', 'Duotone', '2色のインクで刷るデュオトーン', g => g.out(g.fx('duotone', g.cam, {})));
def('GRAPHIC', 'Paper Cut', '色紙を重ねた切り絵', g => g.out(g.fx('paper', g.fx('cutout', g.blur(g.cam, 14), {}), { amount: .5 })));
def('GRAPHIC', 'Stained Glass', '鉛線で区切られたステンドグラス', g => g.out(g.glow(g.fx('voronoi', g.cam, {}), { threshold: .7, size: 12, intensity: .35 })));
def('GRAPHIC', 'Brick Toy', '突起のあるブロックで組んだ絵', g => g.out(g.fx('pixelate', g.fx('poster', g.cam, { levels: 5, dither: 0, sat: 1.3 }), { px: 22, stud: .9, gap: .08 })));
def('GRAPHIC', 'Blueprint', '青地に白線の設計図', g => g.out(g.fx('blueprint', g.fx('edges', g.blur(g.cam, 1.5), { strength: 3 }), {})));
def('GRAPHIC', 'Stipple', '大小の点を打って描く点描', g => g.out(g.fx('stipple', g.cam, {})));
def('GRAPHIC', 'Tri Mosaic', '三角形の面で割るローポリ', g => g.out(g.fx('pixelate', g.cam, { mode: 2, px: 26 })));

/* ───────── SPACE ───────── */
def('SPACE', 'Kaleido', '6枚鏡の万華鏡', g => g.out(g.fx('kaleido', g.cam, {})));
def('SPACE', 'Mirror', '左右対称の鏡像', g => g.out(g.fx('mirror', g.cam, {})));
def('SPACE', 'Liquid', '水面のようにゆっくり揺らぐ', g => { const n = g.top('noise', [], { mono: 'off', period: .45, harmon: 2, amp: .5, offset: .5, tz: '=' + T + '*0.2' }); g.out(g.top('displace', [g.cam, n], { displaceweightx: .12, displaceweighty: .12 })); });
def('SPACE', 'Ripple', '中心から広がる波紋。音で大きくなる', g => g.out(g.fx('ripple', g.cam, { amp: '=' + g.bass(.012, .05), decay: .8 })));
def('SPACE', 'Bubble Lens', '中央がふくらむ魚眼レンズ', g => { let x = g.fx('bulge', g.cam, { amount: .7 }); x = g.fx('chroma', x, { amount: .006 }); g.out(g.fx('vignette', x, { amount: .6, round: 1 })); });
def('SPACE', 'Feedback Tunnel', '回りながら奥へ続くビデオフィードバック', g => { const c = g.cam; const f = g.level(g.xf(g.fb('mix1', c), { sx: 1.06, sy: 1.06, rotate: 2 }), { opacity: .94 }); g.blend(f, c, 'lighten', 1, 'mix1'); g.out('mix1'); });
def('SPACE', 'Slit Scan', '左から右へ時間が遅れていくスリットスキャン', g => g.out(g.tima(g.cache(g.cam, 90), g.fx('gen', [], { mode: 0 }), -90, 0)));
def('SPACE', 'Time Melt', '暗い所ほど過去が残る', g => { const c = g.cam; g.out(g.tima(g.cache(c, 60), g.blur(c, 12), -60, 0)); });
def('SPACE', 'Echo Grid', 'タイルごとに違う時間を映す', g => g.out(g.tima(g.cache(g.cam, 64), g.fx('gen', [], { mode: 4, scale: 4, seed: 5 }), -60, 0)));
def('SPACE', 'Glass Blocks', 'ガラスブロック越しの像', g => g.out(g.fx('tiles', g.cam, { cells: 8, refract: .25 })));
def('SPACE', 'Rain Glass', '雨粒のついた窓ガラス', g => { const c = g.cam; g.out(g.fx('drops', [c, g.blur(c, 14)], {})); });
def('SPACE', 'Heat Haze', '熱でゆらぐ陽炎', g => { const n = g.top('noise', [], { mono: 'off', period: .12, harmon: 1, amp: .5, offset: .5, ty: '=' + T + '*0.6', tz: '=' + T + '*0.9' });
  g.out(g.fx('grade', g.glow(g.top('displace', [g.cam, n], { displaceweightx: .008, displaceweighty: .014 }), { threshold: .6, size: 22, intensity: .35 }), { temp: .12 })); });
def('SPACE', 'Point Cloud', '明るさを奥行きにした点群', g => { g.top('constant', [], { colorr: 0, colorg: 0, colorb: 0 }, 'bg'); g.out(g.comp('over', [g.top('pointcloud', [g.blur(g.cam, 2)], { cols: 240, depth: 1.1, orbit: .35 }), 'bg'])); });
def('SPACE', 'Scan Terrain', '明るさが起伏になる走査線の地形', g => { g.top('constant', [], { colorr: 0, colorg: 0, colorb: 0 }, 'bg'); g.out(g.comp('over', [g.top('scanmesh', [g.blur(g.cam, 5)], { rows: 80, cols: 240, depth: .7, tilt: -.95, sx: 1.3, sy: 2.4 }), 'bg'])); });
def('SPACE', 'Contour Map', '明るさの等高線', g => g.out(g.fx('contour', g.blur(g.cam, 12), { levels: 6 })));
def('SPACE', 'Vortex', '中心へ巻き込む渦', g => g.out(g.fx('swirl', g.cam, { angle: '=' + g.lfo(.12, -3.5, 3.5) })));
def('SPACE', 'Tiny Planet', '地平線を丸めた小さな惑星', g => g.out(g.fx('polar', g.cam, { spin: .05 })));
def('SPACE', 'Slit Stretch', '中央の帯だけ残して外側が伸びる', g => g.out(g.fx('stretch', g.cam, { pos: '=' + g.lfo(.07, .4, .6), width: .22 })));
def('SPACE', 'Infinity Mirror', '画面の中に画面が続く合わせ鏡', g => { const c = g.cam; const f = g.level(g.xf(g.fb('mix1', c), { sx: .84, sy: .84, rotate: '=sin(' + T + '*0.3)*3', extend: 'zero' }), { brightness1: .96 }); g.comp('over', [f, c], 'mix1'); g.out('mix1'); });
def('SPACE', 'Shatter', '割れたガラスのようにずれる破片', g => g.out(g.fx('shards', g.cam, {})));

/* ───────── SENSOR ─────────
   Twenty presets put together from four .toe networks studied side by side:
     NewProject.2.toe          Noise (over the picture) -> Displace (x .04, y 1) as the Time Machine map, a Cache TOP used as an 8-frame delay,
                               and a Blob Track TOP whose second input is that delayed picture (background subtraction -> rectangles on what moved)
     thermal_vision_effect.toe Luma Level, the Feedback/Blur/Level loop composited Over itself, Lookup TOP + colour-key Ramp, Noise -> Displace -> Overlay
     pixelate_effect.toe       Edge -> Pixelate as a Time Machine map, Matte TOP driven by a thresholded Noise
     Film_Look_…toe            Level -> Threshold -> Blur -> Screen, Lookup with a black-to-red ramp as halation, Noise TOP as grain
   RAINBOW is the unused 8-key ramp stored in the thermal file; the other ramps are written here. */
const IRON = [[0, 0, 0, .03, 1], [.2, .16, 0, .42, 1], [.42, .62, .02, .5, 1], [.62, .95, .28, .06, 1], [.82, 1, .72, .05, 1], [1, 1, 1, .92, 1]];
const RAINBOW = [[0, 0, 0, 0, .021], [.0888, 0, 0, 0, 1], [.2284, 0, .05, 1, .503], [.3198, .1167, 1, 0, 1], [.4619, 1, .9333, 0, 1], [.7843, 1, .3833, 0, 1], [1, 1, .0833, 0, 1], [1, 1, 0, 0, 1]];
const ARCTIC = [[0, 0, .01, .06, 1], [.3, .02, .1, .34, 1], [.6, .08, .42, .78, 1], [.85, .55, .88, .97, 1], [1, 1, 1, 1, 1]];
const WHITE = { blobcolorr: 1, blobcolorg: 1, blobcolorb: 1 };
/** Cache TOP as a delay of n frames (NewProject.2) */
const delayed = (g, x, n) => g.top('cache', [x], { cachesize: n + 1, outputindex: -n });
/** the heat-persistence loop of the thermal file: the blurred last frame, dimmed by `hold`, is composited Over the live picture */
const heatLoop = (g, src, hold, name) => { name = name || 'heat'; const tr = g.level(g.top('blur', [g.fb(name, src)], { preshrink: 3, size: 6 }), { opacity: hold }); g.comp('over', [tr, src], name); g.key(tr, 'opacity', 'Trail', 0, .98); return name; };
const thermal = (g, keys, hold) => g.top('lookup', [heatLoop(g, g.top('mono', [g.blur(g.cam, 4)]), hold ?? .8), g.ramp(keys)], { channel: 'luminance' });
const sensorGrain = (g, x, amp) => { const n = g.top('noise', [x], { seed: '=9999+floor(' + T + '*24)', period: 0, spread: 0, gain: .25, exp: 2.88, amp, offset: 0 }); g.key(n, 'amp', 'Grain', 0, .6); return n; };
/** NewProject.2's melt: the picture plus coloured noise is the displacement map, with almost all of the weight on the vertical axis */
const drip = (g, c, wy) => { const n = g.top('noise', [c], { seed: 5590, period: 1.18, harmon: 9, spread: 0, gain: 0, exp: 1.74, amp: .55, offset: .435, mono: 'off', tz: '=' + T + '*.06' });
  const d = g.top('displace', [c, n], { displaceweightx: .04, displaceweighty: wy }); g.key(d, 'displaceweighty', 'Melt', 0, 1.2); return d; };
/** Blob Track TOP: a = picture to analyse, b = background (the delayed picture -> only what moved), onto = picture the marks are drawn on */
const track = (g, a, b, onto, par) => { const t = g.top('blobtrack', [a, b, onto], Object.assign({ threshold: .169, minblobsize: .018, maxblobsize: .81, maxmovedistance: .48 }, par)); g.key(t, 'threshold', 'Sense', .02, .6); return t; };
const motion = (g, onto, par) => track(g, g.cam, delayed(g, g.cam, 6), onto, Object.assign({ threshold: .12, minblobsize: .05, maxmovedistance: .3 }, par));

def('SENSOR', 'Tracker', '動いた所を四角で追う。映像はノイズで時間が溶ける', g => { const c = g.cam, tm = g.tima(g.cache(c, 100), drip(g, c, 1), -30, 0); g.key(tm, 'blackoffset', 'Delay', -99, 0); g.out(track(g, tm, delayed(g, tm, 8), null, {})); });
def('SENSOR', 'Motion Boxes', '動くものを白い枠と番号で追跡する', g => g.out(motion(g, g.level(g.cam, { contrast: 1.08 }), Object.assign({ style: 'hud' }, WHITE))));
def('SENSOR', 'Constellation', '動きの中心を線で結ぶ。座標つきの星座', g => g.out(motion(g, g.level(g.top('mono', [g.cam]), { brightness1: .5, contrast: 1.25 }), Object.assign({ threshold: .1, minblobsize: .03, maxblobs: 16, style: 'net' }, WHITE))));
def('SENSOR', 'Auto Mosaic', '動いた所だけが自動でモザイクになる', g => { const c = g.cam, px = g.top('pixelate', [c], { horsize: 26, squarepixels: 1 }); g.key(px, 'horsize', 'Pixel', 6, 60);
  g.out(g.top('matte', [px, c, motion(g, null, { threshold: .1, minblobsize: .06, style: 'mask', grow: .03 })])); });
def('SENSOR', 'Spotlight', '動くものだけ色が残り、ほかは暗いモノクロに沈む', g => { const c = g.cam;
  g.out(g.top('matte', [c, g.level(g.top('mono', [c]), { brightness1: .32 }), g.top('blur', [motion(g, null, { threshold: .1, minblobsize: .06, style: 'mask', grow: .05 })], { preshrink: 4, size: 44 })])); });
def('SENSOR', 'Heat Seeker', 'サーモグラフィの上で、いちばん明るい所を照準が追う', g =>
  g.out(track(g, g.blur(g.cam, 6), null, thermal(g, IRON), Object.assign({ threshold: .78, minblobsize: .05, maxblobsize: .6, maxmovedistance: .3, maxblobs: 3, style: 'cross' }, WHITE))));
def('SENSOR', 'Ghost Diff', '止まっているものは沈み、動いた差分だけが光る', g => { const c = g.cam, df = g.level(g.top('mono', [g.comp('difference', [c, delayed(g, c, 8)])]), { brightness1: 3.2 }); g.key(df, 'brightness1', 'Gain', .5, 8);
  g.out(g.top('add', [g.level(c, { brightness1: .28 }), g.top('lookup', [g.blur(df, 3), g.ramp([[0, 0, 0, 0, 1], [.35, 0, .55, .9, 1], [.75, .7, 1, 1, 1], [1, 1, 1, 1, 1]])], { channel: 'luminance' })])); });
def('SENSOR', 'Ironbow', '明るい所ほど熱い、定番のサーモグラフィ', g => g.out(sensorGrain(g, thermal(g, IRON), .12)));
def('SENSOR', 'White Hot', '白が熱を示す赤外線カメラ。にじむハイライトと粒子', g => { const h = heatLoop(g, g.top('lumalevel', [g.top('mono', [g.blur(g.cam, 3)])], { blacklevel: .08, gamma1: .8, contrast: 1.35 }), .7);
  const hi = g.top('thresh', [g.level(h, { brightness1: 1.3 })], { rgb: 'rgbaverage', threshold: .8, soften: .6 }); g.out(g.fx('vignette', sensorGrain(g, g.comp('screen', [g.top('blur', [hi], { preshrink: 8, size: 28 }), h]), .16), { amount: .4 })); });
def('SENSOR', 'Rainbow Heat', '黒から青・緑・黄・赤へ。虹色の熱分布', g => g.out(sensorGrain(g, thermal(g, RAINBOW), .1)));
def('SENSOR', 'Arctic', '明暗を反転した氷の色のサーモ。暗い所ほど白く光る', g => { const ll = g.top('lumalevel', [g.top('mono', [g.cam])], { invert: 1, blacklevel: .12, brightness1: 1.05, gamma1: .85, contrast: 1.1 });
  const n = g.top('noise', [g.top('lookup', [heatLoop(g, ll, .85), g.ramp(ARCTIC)], { channel: 'luminance' })], { seed: 9999, period: 0, spread: 0, gain: .25, exp: 2.88, amp: .2, offset: 0 }); g.key(n, 'amp', 'Grain', 0, 1);
  g.out(g.comp('overlay', [g.top('displace', [g.top('blur', [g.level(n, { blacklevel: .1, brightness1: .9 })], { size: 2 }), n], { vertsource: 'blue', displaceweightx: .01, displaceweighty: .01 }), n])); });
def('SENSOR', 'Heat Trail', '熱いものが通った跡が、冷めながら残る', g => { const m = g.top('mono', [g.blur(g.cam, 4)]), tr = g.level(g.top('blur', [g.fb('heat', m)], { size: 3 }), { brightness1: .965 }); g.comp('maximum', [tr, m], 'heat');
  g.key(tr, 'brightness1', 'Trail', .8, .995); g.out(sensorGrain(g, g.top('lookup', ['heat', g.ramp(IRON)], { channel: 'luminance' }), .1)); });
def('SENSOR', 'Edge Memory', '輪郭にだけ過去のコマが残り、動くと縁がほどける', g => { const c = g.cam, ed = g.top('edge', [c], { strength: 6 }), px = g.top('pixelate', [ed], { horsize: 6, vertsize: 3 }), tm = g.tima(g.cache(c, 64, 2), px, 0, -100);
  g.key(tm, 'whiteoffset', 'Delay', -126, 0).key(ed, 'strength', 'Edge', 1, 20).key(px, 'horsize', 'Pixel', 1, 40); g.out(tm); });
def('SENSOR', 'Block Delay', '明るさの違うブロックごとに、別の時刻が映る', g => { const c = g.cam, px = g.top('pixelate', [g.top('mono', [g.blur(c, 8)])], { horsize: 44, squarepixels: 1 }), tm = g.tima(g.cache(c, 60, 2), px, -110, 0);
  g.key(px, 'horsize', 'Block', 8, 120).key(tm, 'blackoffset', 'Delay', -118, 0); g.out(tm); });
def('SENSOR', 'Noise Portal', 'ノイズの穴の中だけサーモグラフィが見える', g => { const c = g.cam;
  const n = g.top('noise', [g.level(c, { invert: .228, blacklevel: .5, brightness1: .37, gamma1: .93, contrast: 1.05 })], { seed: 1451, period: .35, harmon: 0, spread: 5.4, gain: 2, exp: 4, amp: 3, offset: 1, mono: 'off', tz: '=' + T + '*.08' });
  g.key(n, 'amp', 'Holes', 0, 8); g.out(g.top('matte', [c, thermal(g, IRON), g.top('thresh', [n], { threshold: 1 })])); });
def('SENSOR', 'Drip', '映像がノイズに引かれて縦に溶け落ちる', g => g.out(drip(g, g.cam, .45)));
def('SENSOR', 'Time Drip', '溶けた形のとおりに、過去のコマが流れ込む', g => { const c = g.cam, tm = g.tima(g.cache(c, 100), drip(g, c, 1), -90, 0); g.key(tm, 'blackoffset', 'Delay', -99, 0); g.out(tm); });
def('SENSOR', 'Scanner', '走査線が上下に動き、通った側だけサーモグラフィに変わる', g => { const ph = '=sin(' + T + '*.9)*.4';
  const m = g.ramp([[0, 1, 1, 1, 1], [.5, 1, 1, 1, 1], [.5, 0, 0, 0, 0], [1, 0, 0, 0, 0]], { type: 'vertical', phase: ph }), line = g.ramp([[0, 0, 0, 0, 1], [.49, 0, 0, 0, 1], [.5, .55, 1, .85, 1], [.51, 0, 0, 0, 1], [1, 0, 0, 0, 1]], { type: 'vertical', phase: ph });
  g.out(g.top('add', [g.top('matte', [thermal(g, RAINBOW), g.cam, m]), line])); });
def('SENSOR', 'CCTV', '防犯カメラ。動体検知の枠と録画表示', g => { const m = g.level(g.top('mono', [g.cam]), { blacklevel: .04, gamma1: .9, contrast: 1.2 });
  const x = g.fx('scanlines', motion(g, m, { style: 'cctv', blobcolorr: 1, blobcolorg: .7, blobcolorb: .1 }), { amount: .16, count: 520 }); g.out(g.top('osd', [filmGrain(g, x, 10.2)], { style: 'cam' })); });
def('SENSOR', 'Red Alert', '動いたものの周りに、赤い光がにじみ出る', g => { const c = g.cam, m = g.level(g.top('mono', [c]), { blacklevel: .04, contrast: 1.2 });
  const red = g.top('lookup', [motion(g, null, { threshold: .1, minblobsize: .04, style: 'mask', grow: .01 }), g.ramp([[0, 0, 0, 0, 1], [1, .862, 0, 0, 1]])], { channel: 'luminance' });
  g.out(filmGrain(g, g.comp('screen', [g.level(g.top('blur', [red], { preshrink: 6, size: 64 }), { brightness1: 1.5 }), m]), 10.1)); });

/** build the graph for one original preset */
function buildOriginal(p) { const g = new GraphBuilder(); p.fn(g); return { build: 'original', nodes: g.nodes, audio: g.audio, keys: g.keys || [] }; }
if (typeof module !== 'undefined') module.exports = { ORIGINALS, FOLDERS, buildOriginal, GraphBuilder };
