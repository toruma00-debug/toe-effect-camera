/* TOE — .toe/.tox container reader + network extractor (runs in browser and Node).
   Container layout follows the publicly documented format: "10" segments, TEA-ECB over a zlib stream. */
const TOE = (() => {
  const KEY = [0x9241fa3a, 0x59f32012, 0xc612aa09, 0xa98123d4];
  function tea(u8) {
    const n = u8.length - (u8.length % 8), out = new Uint8Array(n);
    const dv = new DataView(u8.buffer, u8.byteOffset, n), ov = new DataView(out.buffer);
    for (let i = 0; i < n; i += 8) {
      let v0 = dv.getUint32(i, true), v1 = dv.getUint32(i + 4, true), s = 0xC6EF3720;
      for (let r = 0; r < 32; r++) {
        v1 = (v1 - ((((v0 << 4) + KEY[2]) ^ (v0 + s) ^ ((v0 >>> 5) + KEY[3])) >>> 0)) >>> 0;
        v0 = (v0 - ((((v1 << 4) + KEY[0]) ^ (v1 + s) ^ ((v1 >>> 5) + KEY[1])) >>> 0)) >>> 0;
        s = (s - 0x9E3779B9) >>> 0;
      }
      ov.setUint32(i, v0, true); ov.setUint32(i + 4, v1, true);
    }
    return out;
  }
  /* minimal zlib inflate (RFC 1950/1951) */
  function inflate(src, rawLen) {
    const out = new Uint8Array(rawLen); let op = 0, ip = 2, bb = 0, bn = 0;
    const bits = n => { while (bn < n) { bb |= src[ip++] << bn; bn += 8; } const v = bb & ((1 << n) - 1); bb >>>= n; bn -= n; return v; };
    const build = lens => {
      const cnt = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lens.length);
      for (const l of lens) cnt[l]++; cnt[0] = 0;
      for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + cnt[i - 1];
      for (let i = 0; i < lens.length; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
      return { cnt, sym };
    };
    const dec = h => { let code = 0, first = 0, idx = 0;
      for (let len = 1; len < 16; len++) { code |= bits(1); const c = h.cnt[len];
        if (code - c < first) return h.sym[idx + (code - first)];
        idx += c; first += c; first <<= 1; code <<= 1; }
      throw new Error('inflate: bad code'); };
    const LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    const LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    const DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    const DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    let fixed = null, last = 0;
    while (!last) {
      last = bits(1); const type = bits(2);
      if (type === 0) { bb = 0; bn = 0; const len = src[ip] | (src[ip + 1] << 8); ip += 4; out.set(src.subarray(ip, ip + len), op); op += len; ip += len; continue; }
      let hl, hd;
      if (type === 1) {
        if (!fixed) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); fixed = [build(l), build(new Uint8Array(30).fill(5))]; }
        [hl, hd] = fixed;
      } else if (type === 2) {
        const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, ord = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
        const cl = new Uint8Array(19); for (let i = 0; i < nc; i++) cl[ord[i]] = bits(3);
        const hc = build(cl), lens = new Uint8Array(nl + nd);
        for (let i = 0; i < nl + nd;) { const s = dec(hc);
          if (s < 16) lens[i++] = s;
          else { let rep, v = 0; if (s === 16) { v = lens[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep--) lens[i++] = v; } }
        hl = build(lens.subarray(0, nl)); hd = build(lens.subarray(nl));
      } else throw new Error('inflate: bad block');
      for (;;) { const s = dec(hl);
        if (s < 256) out[op++] = s;
        else if (s === 256) break;
        else { const len = LB[s - 257] + bits(LE[s - 257]), ds = dec(hd), dist = DB[ds] + bits(DE[ds]);
          for (let k = 0; k < len; k++, op++) out[op] = out[op - dist]; } }
    }
    return out.subarray(0, op);
  }
  /** .toe bytes -> Map(path -> Uint8Array) */
  function expand(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), parts = []; let p = 0, total = 0;
    while (p + 10 <= u8.length) {
      const kind = String.fromCharCode(u8[p], u8[p + 1]);
      if (kind !== '10') throw new Error('未対応の .toe セグメント種別: ' + kind);
      const pl = dv.getUint32(p + 2), rl = dv.getUint32(p + 6); p += 10;
      const raw = inflate(tea(u8.subarray(p, p + pl)), rl); parts.push(raw); total += raw.length; p += pl;
    }
    const raw = new Uint8Array(total); let o = 0; for (const a of parts) { raw.set(a, o); o += a.length; }
    const files = new Map(), stack = [], td = new TextDecoder('utf-8'); p = 0;
    const rv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    while (p < raw.length) {
      const tag = raw[p];
      if (tag === 0x34) { const nl = raw[p + 1], cl = rv.getUint32(p + 2); const name = td.decode(raw.subarray(p + 6, p + 6 + nl)).replace(/\0+$/, ''); p += 6 + nl;
        if (name === 'TRAILER!!!') break; files.set(stack.concat(name).join('/'), raw.subarray(p, p + cl)); p += cl; }
      else if (tag === 0x36) { const nl = raw[p + 2]; stack.push(td.decode(raw.subarray(p + 3, p + 3 + nl)).replace(/\0+$/, '')); p += 3 + nl; }
      else if (tag === 0x35) { stack.pop(); p++; }
      else throw new Error('.toe アーカイブを読めません (offset ' + p + ')');
    }
    return files;
  }
  /* tokenizer for .parm / .cparm lines: bare words and "quoted \"strings\"" */
  function tokens(line) {
    const out = []; let i = 0;
    while (i < line.length) {
      if (line[i] === ' ' || line[i] === '\t') { i++; continue; }
      if (line[i] === '"') { let s = ''; i++; while (i < line.length && line[i] !== '"') { if (line[i] === '\\' && i + 1 < line.length) { i++; s += line[i] === 'n' ? '\n' : line[i]; } else s += line[i]; i++; } i++; out.push(s); }
      else { let j = i; while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++; out.push(line.slice(i, j)); i = j; }
    }
    return out;
  }
  /* .table of a Table DAT: "1\n*", then u32 version, rows, cols, 0, then per cell u32 type + u32 length + text (row-major) */
  function table(u8) { let p = 0; while (p < u8.length && u8[p] !== 0x2a) p++; p++; if (p + 16 > u8.length) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder('utf-8'), rd = () => { const v = dv.getUint32(p); p += 4; return v; };
    rd(); const rows = rd(), cols = rd(); rd(); if (rows > 4096 || cols > 256) return null; const out = [];
    for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) { if (p + 8 > u8.length) return out; rd(); const l = rd(); if (p + l > u8.length) return out; row.push(td.decode(u8.subarray(p, p + l))); p += l; } out.push(row); }
    return out; }
  const SKIP = /(^|\/)(local|perform|docsHelper|annotation)(\/|$)|(^|\/)(light|cam|button|slider)\d*\/.|networkbox|comment\d/;
  /** expanded files -> graph {build, nodes{path:{fam,type,inputs,params,bypass,compinputs,cdef}}} */
  function parse(files) {
    const td = new TextDecoder('utf-8'), text = k => files.has(k) ? td.decode(files.get(k)) : null;
    const g = { build: ((text('.build') || '').match(/build (\S+)/) || [])[1] || '?', nodes: {} };
    for (const [k] of files) {
      if (!k.endsWith('.n')) continue;
      const path = k.slice(0, -2); if (SKIP.test(path + '/')) continue;
      const src = text(k), m = src.match(/^(\w+):(\w+)/); if (!m) continue;
      const n = { fam: m[1], type: m[2], inputs: [], params: {} };
      const im = src.match(/\ninputs\n\{\n([\s\S]*?)\n\}/);
      if (im) for (const l of im[1].split('\n')) { const t = l.split('\t'); n.inputs[parseInt(t[0])] = t[t.length - 1].trim(); }
      n.inputs = Array.from(n.inputs, x => x || null);
      if (/\nflags = .*\bbypass on/.test(src)) n.bypass = true;
      const pt = text(path + '.parm');
      if (pt) for (const l of pt.split('\n')) { if (!l || l === '?') continue; const t = tokens(l); if (t.length < 3) continue;
        const mode = parseInt(t[1]) || 0, p = { v: t[2] };
        if (t.length > 3 && (mode & 1)) p.e = t[t.length - 1];
        n.params[t[0]] = p; }
      const nt = text(path + '.network');
      if (nt) { const cm = nt.match(/compinputs\n\{\n([\s\S]*?)\n\}/); if (cm) { n.compinputs = {}; const ls = cm[1].split('\n');
        for (let i = 0; i + 2 < ls.length + 1; i += 3) { const srcName = (ls[i] || '').split('\t').pop().trim().replace(/^"|"$/g, ''), inName = (ls[i + 1] || '').trim(); if (inName) n.compinputs[inName] = srcName || null; } } }
      const ct = text(path + '.cparm');
      if (ct) { n.cdef = {}; for (const l of ct.split('\n')) { const t = tokens(l); if (t.length > 12 && /^-?\d+$/.test(t[0]) && /^[A-Z]/.test(t[1])) n.cdef[t[1]] = (t[12] && isNaN(parseFloat(t[12])) && t[12] !== '') ? t[12] : t[11]; } }
      if (n.fam === 'DAT' && files.has(path + '.table')) { const tb = table(files.get(path + '.table')); if (tb) n.table = tb; }
      g.nodes[path] = n;
    }
    return g;
  }
  return { expand, parse, load: u8 => parse(expand(u8)) };
})();
if (typeof module !== 'undefined') module.exports = TOE;
