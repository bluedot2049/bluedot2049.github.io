// 海市的字（毛筆版）。招牌、牌樓、明信片郵戳都用這套：筆法取自「譜最新」的毛筆火柴人與東皇太一字標。
// 這一版每字只有 2–5 筆。
// 一筆 = 幾個控制點連成的中心線（Catmull-Rom）+ 沿弧長變化的筆寬 → 外框多邊形（兩端圓頭）。
// 筆只有幾種：楔（圓頭重按收尖：豎撇點提）、肢（兩端細中段粗：橫）、捺（由細漸粗）、折（橫折，轉角厚）。
// 結構沿用部首規則：同部首的字共用同一組筆畫，其餘部分由字碼當種子生成。
// 畫到 canvas 時先把交接處磨圓，再在筆尾刷出飛白（刷痕）。

const BASE_W = 11;         // 最粗筆寬（每字 100 單位；東皇太一字標是 7.8；筆畫少，再加粗）
const MIN_W = 1.7;         // 筆尖最細（縮到招牌大小仍有 1–2 px）

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const WIDTH = {
  w: (s) => 0.1 + 0.9 * (1 - s) ** 0.85 * (1 - 0.12 * Math.exp(-((s / 0.06) ** 2))),     // 楔
  l: (s) => 0.26 + 0.74 * Math.sin(Math.PI * s) ** 1.15,                                // 肢
  s: (s) => 0.14 + 0.86 * (1 - s) ** 0.9,                                               // 點
  n: (s) => (0.18 + 0.82 * s ** 0.8) * (1 - 0.8 * smooth(0.82, 1, s)),                   // 捺
  e: (s) => 0.3 + 0.7 * Math.sin(Math.PI * s) ** 0.7,                                  // 圓相：起收細、中段飽
  f: (s) => (0.62 + 0.38 * Math.sin(Math.PI * s) ** 0.6) * (1 - 0.7 * smooth(0.88, 1, s)), // 折
};

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 筆 ----------
function catmull(pts, n = 16) {
  const P = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts.at(-1)[0] - pts.at(-2)[0], 2 * pts.at(-1)[1] - pts.at(-2)[1]]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(P.at(-2));
  return out;
}

// brush_figure.outline：法線平滑後往兩側展開，兩端接半圓
function build(kind, pts, r) {
  if (kind === 'o') {
    const [x, y] = pts[0], poly = Array.from({ length: 32 }, (_, i) => [x + r * Math.cos((i / 32) * Math.PI * 2), y + r * Math.sin((i / 32) * Math.PI * 2)]);
    return { kind, poly, c: [], w: [], nrm: [], len: 0 };
  }
  const c = catmull(pts.length === 2 ? [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]] : pts);
  const L = [0];
  for (let i = 1; i < c.length; i++) L.push(L[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]));
  const len = L.at(-1) || 1;
  const w = L.map((l) => Math.max(MIN_W, BASE_W * WIDTH[kind](l / len)));
  const d = c.map((_, i) => { const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; });
  const K = 3, nrm = d.map((_, i) => {
    let x = 0, y = 0;
    for (let j = -K; j <= K; j++) { const q = d[Math.min(d.length - 1, Math.max(0, i + j))]; x += q[0]; y += q[1]; }
    const m = Math.hypot(x, y) || 1;
    return [-y / m, x / m];
  });
  const left = c.map((p, i) => [p[0] + nrm[i][0] * w[i] / 2, p[1] + nrm[i][1] * w[i] / 2]);
  const right = c.map((p, i) => [p[0] - nrm[i][0] * w[i] / 2, p[1] - nrm[i][1] * w[i] / 2]);
  const cap = (p, r, ang) => Array.from({ length: 13 }, (_, k) => [p[0] + r * Math.cos(ang - (Math.PI * k) / 12), p[1] + r * Math.sin(ang - (Math.PI * k) / 12)]);
  const n0 = nrm[0], n1 = nrm.at(-1);
  const poly = [...left, ...cap(c.at(-1), w.at(-1) / 2, Math.atan2(n1[1], n1[0])), ...right.reverse(), ...cap(c[0], w[0] / 2, Math.atan2(-n0[1], -n0[0]))];
  return { kind, poly, c, w, nrm, len };
}

// ---------- 字的寫法（座標 0–100，y 往下） ----------
// 每個字 2–5 筆。語彙取自毛筆火柴人與陣型圖：墨點（頭）、一道大弧（雙臂）、成對的楔（雙腿）、
// 一豎（軀幹）、圓相（大鼓）。多數字左右對稱，像陣型圖那樣。
const ARC = (y, span, depth, tilt = 0, cx = 50) => ['l', [-1, -0.5, 0, 0.5, 1].map((t) => [cx + t * span, y + depth * t * t + tilt * t])]; // depth>0 ⌒，<0 ︶
const V = (x, y0, y1, b = 0.9) => ['w', [[x, y0], [x + b, (y0 + y1) / 2], [x - b * 0.3, y1]]];
const D = (x, y, dx = 4, dy = 9) => ['s', [[x, y], [x + dx * 0.45, y + dy * 0.55], [x + dx, y + dy]]];
const DOT = (x, y, r) => ['o', [[x, y]], r];
// 圓相：一筆繞一圈多一點，筆寬呼吸，略不正
const RING = (x, y, r, a0 = -2.2, k = 1.04) => ['e', Array.from({ length: 11 }, (_, i) => { const a = a0 + (i / 10) * Math.PI * 2.12; return [x + Math.cos(a) * r * k, y + Math.sin(a) * r]; })];
const M = ([k, pts, r]) => [k, pts.map(([x, y]) => [100 - x, y]), r];
// 一對腿：從 (50±g, y0) 往外下方張開，腿根粗、腳端尖
const LEGS = (y0, spread, y1, g = 3) => { const L = ['w', [[50 - g, y0], [50 - g - spread * 0.3, y0 + (y1 - y0) * 0.55], [50 - spread, y1]]]; return [L, M(L)]; };

const BODIES = {
  figure(R) { // 頭、雙臂、雙腿
    const o = [];
    if (R() < 0.7) o.push(DOT(50, 14, 7 + R() * 2));
    o.push(ARC(36 + R() * 6, 34 + R() * 8, 8 + R() * 8, (R() - 0.5) * 6), ...LEGS(46, 26 + R() * 10, 94));
    return o;
  },
  gate(R) { // 一道拱、兩柱
    const sp = 22 + R() * 6, o = [ARC(22, 42, 9 + R() * 5), V(50 - sp, 26, 94, -1), V(50 + sp, 26, 94, 1)];
    if (R() < 0.5) o.push(DOT(50, 60, 6));
    return o;
  },
  bowl(R) { // 碗：一道下弧，上面一點或一圈
    const o = [ARC(70, 40, -(12 + R() * 6))];
    o.push(R() < 0.5 ? DOT(50, 36, 10) : RING(50, 34, 17));
    if (R() < 0.3) o.push(D(18, 20, 3, 10), M(D(18, 20, 3, 10)));
    return o;
  },
  spine(R) { // 一豎貫穿，一道弧橫過
    const y = 30 + R() * 16, o = [V(50, 4, 96), ARC(y, 38, R() < 0.6 ? 10 : -10)];
    if (R() < 0.6) o.push(DOT(25, y + 32, 5), DOT(75, y + 32, 5));
    return o;
  },
  ring(R) { // 圓相，下面一豎或一弧
    return [RING(50, 40, 24), R() < 0.5 ? V(50, 66, 98) : ARC(88, 34, -6)];
  },
  stack(R) { // 兩道弧，中間一點
    const o = [ARC(30, 30 + R() * 8, 8), ARC(70, 40 + R() * 4, R() < 0.5 ? -10 : 9)];
    if (R() < 0.6) o.push(DOT(50, 50, 5.5));
    return o;
  },
  fork(R) { // 上半一豎，下半分腿
    const o = [V(50, R() < 0.4 ? 24 : 6, 48), ...LEGS(46, 30 + R() * 6, 94, 1)];
    if (o[0][1][0][1] > 20) o.push(DOT(50, 10, 6.5));
    return o;
  },
};
const BODY_W = [['figure', 2], ['gate', 2.5], ['bowl', 2.5], ['spine', 2.5], ['ring', 2], ['stack', 2], ['fork', 1.3]];
const pickW = (R, w) => { let t = R() * w.reduce((a, b) => a + b[1], 0); for (const [v, p] of w) if ((t -= p) <= 0) return v; return w[0][0]; };

function place(list, [x0, y0, x1, y1]) {
  const sx = (x1 - x0) / 100, sy = (y1 - y0) / 100;
  return list.map(([k, pts, r]) => [k, pts.map(([x, y]) => [x0 + x * sx, y0 + y * sy]), r && r * Math.sqrt(sx * sy)]);
}
function body(R) {
  let o = BODIES[pickW(R, BODY_W)](R);
  if (R() < 0.2) o = o.map(([k, pts, r]) => [k, pts.map(([x, y]) => [x + (y - 50) * 0.12, y]), r]);   // 少數字略斜
  return o;
}

// 部首縮成一個記號（一筆或一對點），佔字的一邊；字身縮進其餘的格子
const MARKS = {
  水: ['left', () => [['w', [[13, 12], [7, 32], [14, 52], [7, 72], [12, 90]]]]],
  冰: ['left', () => [D(10, 26, 3, 10), ['w', [[5, 82], [17, 62]]]]],
  火: ['bottom', () => [DOT(30, 91, 4.8), DOT(70, 91, 4.8)]],
  魚: ['top', () => [RING(50, 9, 7.5)]],
  米: ['top', () => [D(36, 1, 3, 11), M(D(36, 1, 3, 11))]],
  糸: ['left', () => [['f', [[15, 10], [6, 32], [17, 44], [7, 70]]]]],
  玉: ['left', () => [ARC(38, 9, 2, 0, 12), ARC(62, 9, 2, 0, 12)]],
  食: ['top', () => [['w', [[50, 0], [36, 15]]], ['w', [[50, 0], [64, 15]]]]],
  口: ['left', () => [RING(12, 50, 8)]],
  人: ['left', () => [['w', [[20, 8], [14, 30], [4, 52]]]]],
  手: ['left', () => [ARC(40, 10, 1, 0, 12), V(12, 18, 84, 0.4)]],
  虫: ['left', () => [DOT(12, 28, 5), V(12, 42, 88, 0.4)]],
  艸: ['top', () => [V(34, 0, 15, 0.3), V(66, 0, 15, -0.3)]],
  竹: ['top', () => [['w', [[42, 0], [30, 15]]], ['w', [[58, 0], [70, 15]]]]],
  宀: ['top', () => [DOT(50, 7, 5.5)]],
  囗: ['enclose', () => [RING(50, 50, 45, -2.6, 1.02)]],
  門: ['enclose', () => [V(9, 4, 96, -0.6), V(91, 4, 96, 0.6)]],
};
const RADICAL_OF = {};
for (const [r, s] of Object.entries({
  水: '海湯酒洋港池', 冰: '冰冷', 火: '燭燈烤燒炸炒煮', 魚: '鮮魷鯛鰻', 米: '料糖粥粉', 糸: '縫線紙', 玉: '玻璃珠', 食: '飯餅館',
  口: '味喫', 人: '信住', 手: '物', 虫: '蠟', 艸: '茶藥草葫蘆薯花菓', 竹: '籠箱', 宀: '宿', 囗: '圖團', 門: '關',
})) for (const c of s) RADICAL_OF[c] = r;
const AREA = { left: [20, 0, 104, 100], top: [2, 18, 98, 100], bottom: [2, -2, 98, 80], enclose: [22, 24, 78, 80] };

const CACHE = new Map();
export function strokes(ch) {
  const key = ch;
  if (CACHE.has(key)) return CACHE.get(key);
  let list;
  {
    const R = seeded('海市墨二' + ch), keys = Object.keys(MARKS);
    let rad = RADICAL_OF[ch];
    if (!rad && R() < 0.4) rad = keys[(R() * keys.length) | 0];
    if (rad) {
      const [at, draw] = MARKS[rad];
      list = [...draw(), ...place(body(R), AREA[at])];
    } else list = body(R);
  }
  const out = list.map(([k, pts, r]) => build(k, pts, r));
  CACHE.set(key, out);
  return out;
}

// ---------- 輸出 ----------
const fx = (n) => +n.toFixed(2);
const polyD = (poly) => 'M' + poly.map(([x, y]) => `${fx(x)} ${fx(y)}`).join('L') + 'Z';

export function glyphSVG(ch, size = 100, color = '#000') {
  const d = strokes(ch).map((s) => polyD(s.poly)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><path d="${d}" fill="${color}"/></svg>`;
}

// 交接處磨圓：alpha 模糊後再收邊（等於 buffer 開閉運算）
function roundJoins(c, r) {
  const g = c.getContext('2d'), W = c.width, Hh = c.height, img = g.getImageData(0, 0, W, Hh), A = new Float32Array(W * Hh);
  for (let i = 0; i < A.length; i++) A[i] = img.data[i * 4 + 3] / 255;
  const tmp = new Float32Array(A.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += A[y * W + xx]; n++; } } tmp[y * W + x] = s / n; }
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < Hh) { s += tmp[yy * W + x]; n++; } } A[y * W + x] = s / n; }
  }
  for (let i = 0; i < A.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = 255 * smooth(0.3, 0.56, A[i]); }
  g.putImageData(img, 0, 0);
}

// 刷痕：筆走到後段墨不夠，順著筆勢留下幾道白絲（飛白）。只在楔、肢、捺、折的長筆上
function dryBrush(g, list, k, R, amount) {
  g.globalCompositeOperation = 'destination-out';
  g.lineCap = 'round';
  for (const s of list) {
    if (s.kind === 's' || s.len < 20 || R() > 0.6 + amount * 0.4) continue;
    const N = s.c.length, s0 = 0.3 + R() * 0.3, n = 2 + ((R() * (1 + amount * 4)) | 0);
    for (let j = 0; j < n; j++) {
      // 越靠筆尾越寬；靠邊的絲讓筆緣破開
      const u = (R() * 2 - 1) * 0.42, a = s0 + R() * 0.15, lw0 = (0.06 + R() * 0.08) * BASE_W * k;
      let pen = false;
      for (let i = Math.floor(a * N); i < N - 1; i++) {
        if (R() < 0.05) pen = false;
        const t = (i / N - a) / (1 - a), p = s.c[i], q = s.nrm[i], off = u * s.w[i];
        const x = (p[0] + q[0] * off) * k, y = (p[1] + q[1] * off) * k;
        if (!pen) { g.beginPath(); g.moveTo(x, y); pen = true; continue; }
        g.lineWidth = lw0 * (0.4 + 1.4 * t * amount);
        g.lineTo(x, y);
        g.stroke();
        g.beginPath();
        g.moveTo(x, y);
      }
    }
  }
  g.globalCompositeOperation = 'source-over';
}

const MASKS = new Map();
function mask(ch, px, brush) {
  const key = [ch, px, brush].join('|');
  if (MASKS.has(key)) return MASKS.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d'), k = px / 100, list = strokes(ch);
  g.fillStyle = '#000';
  for (const s of list) g.fill(new Path2D(polyD(s.poly.map(([x, y]) => [x * k, y * k]))));
  roundJoins(c, Math.max(1, Math.round(px * 0.009)));
  if (brush > 0) dryBrush(g, list, k, seeded('刷' + ch), brush);
  MASKS.set(key, c);
  return c;
}

// size = 方格邊長；brush = 刷痕多寡 0–1
export function drawGlyph(g, ch, cx, cy, size, color = '#000', { brush = 0.6 } = {}) {
  const px = Math.min(320, Math.max(96, Math.ceil(size * 1.5)));
  const m = mask(ch, px, brush), t = document.createElement('canvas');
  t.width = t.height = px;
  const tg = t.getContext('2d');
  tg.drawImage(m, 0, 0);
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = color;
  tg.fillRect(0, 0, px, px);
  g.drawImage(t, cx - size / 2, cy - size / 2, size, size);
}

export function drawText(g, text, { x, y, size, vertical = false, step = size, color = '#000', brush = 0.6 }) {
  const chars = [...text].filter((c) => c.trim()), s0 = -((chars.length - 1) * step) / 2;
  chars.forEach((c, i) => drawGlyph(g, c, vertical ? x : x + s0 + i * step, vertical ? y + s0 + i * step : y, size, color, { brush }));
}
