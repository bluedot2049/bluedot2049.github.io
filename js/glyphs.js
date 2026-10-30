// 海市的字：一套看起來像東洋文字、其實是用打擊譜零件拼出來的符號。
// 做法照「譜最新」的黑盒子 sbox：先有一池零件（符頭、符桿、連桿、符尾、重音、休止符），
// 再由規則把它們排進一個方格，輸出成 SVG 路徑（m/l/c/h 線段 → d 字串）。
// 每個漢字用它的字碼當種子，所以同一個字永遠長一樣：「茶」和「茶屋」的第一個字是同一個符號。
//
// 主要入口：
//   glyph(ch)                       一個字 → 物件清單（每個物件 { segs, paint, lw, rule, name }）
//   drawGlyph(g, ch, cx, cy, size)  畫到 canvas（Path2D 吃 SVG 的 d 字串）
//   drawText(g, text, opts)         一串字，直排或橫排
//   textSVG(text, opts)             一串字 → 完整的 <svg> 字串（看樣張、輸出用）

// 方格 0–100，y 往下。比例取自 sbox engrave.STYLE（總譜譜線距 3.9 pt），換成一個譜線距 U
const U = 14;
const STYLE = {
  stemW: 0.52 * U,                // 符桿（毛筆的豎，比樂譜粗）
  stemLen: 3.5 * U,               // stem_len 13.64 / 3.9
  headRx: 0.7 * U, headRy: 0.48 * U, headTilt: -0.36,
  stemDx: 0.64 * U,               // 符桿貼在符頭邊上（stem_dx_up 5.24 / 3.9 的一半）
  beamTh: 0.64 * U,               // beam_th 1.95 / 3.9 = 0.5，加粗一點
  beamGap: 0.82 * U,              // beam_gap 2.92 / 3.9 = 0.75
  dotR: 0.27 * U, dotDx: 1.6 * U,
  markLw: 0.24 * U,
};

function seeded(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 零件 ----------
const obj = (name, segs, paint = 'f', extra = {}) => ({ name, segs, paint, rule: 'nonzero', lw: 0, ...extra });

// 符桿：頂端斜切（下筆），往下略收
function stem(x, y0, y1) {
  const w = STYLE.stemW;
  return obj('stem', [['m', x - w / 2, y0 + w * 0.45], ['l', x + w / 2, y0 - w * 0.1], ['l', x + w * 0.4, y1], ['l', x - w * 0.4, y1], ['h']]);
}

// 連桿：兩端直切的平行四邊形（樂譜的 beam，也是毛筆的橫）
function beam(x0, y0, x1, y1, th = STYLE.beamTh) {
  return obj('beam', [['m', x0, y0 - th / 2], ['l', x1, y1 - th / 2], ['l', x1, y1 + th / 2], ['l', x0, y0 + th / 2], ['h']]);
}

function ellipse(cx, cy, rx, ry, rot, rev = false) {
  const K = 0.5523, c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
  let pts = [[rx, 0], [rx, ry * K], [rx * K, ry], [0, ry], [-rx * K, ry], [-rx, ry * K], [-rx, 0], [-rx, -ry * K], [-rx * K, -ry], [0, -ry], [rx * K, -ry], [rx, -ry * K], [rx, 0]];
  if (rev) pts = pts.reverse();
  pts = pts.map(([u, v]) => P(u, v));
  const segs = [['m', ...pts[0]]];
  for (let i = 1; i < pts.length; i += 3) segs.push(['c', ...pts[i], ...pts[i + 1], ...pts[i + 2]]);
  segs.push(['h']);
  return segs;
}

// 符頭四種：實心、空心（二分音符）、三角（敲鼓框）、叉（悶擊）
function head(cx, cy, kind) {
  const { headRx: rx, headRy: ry, headTilt: t } = STYLE;
  if (kind === 'hollow') return obj('head_hollow', [...ellipse(cx, cy, rx, ry, t), ...ellipse(cx, cy, rx * 0.72, ry * 0.42, t - 0.3, true)], 'f', { rule: 'evenodd' });
  if (kind === 'tri') {
    // sbox.engrave.make_tri：外三角減內三角
    const w = rx * 2, h = w * 0.9, k = 1 - 2.2 * 0.2, tri = (w_, h_, oy) => [[cx - w_ / 2, cy + oy + h_ / 2], [cx + w_ / 2, cy + oy + h_ / 2], [cx, cy + oy - h_ / 2]];
    const o = tri(w, h, 0), i = tri(w * k, h * k, h * 0.07).reverse();
    return obj('head_tri', [['m', ...o[0]], ['l', ...o[1]], ['l', ...o[2]], ['h'], ['m', ...i[0]], ['l', ...i[1]], ['l', ...i[2]], ['h']], 'f', { rule: 'evenodd' });
  }
  if (kind === 'x') {
    const d = rx * 0.8;
    return obj('head_x', [['m', cx - d, cy - d], ['l', cx + d, cy + d], ['m', cx + d, cy - d], ['l', cx - d, cy + d]], 'S', { lw: STYLE.markLw * 1.3 });
  }
  return obj('head', ellipse(cx, cy, rx, ry, t));
}

// 符尾：從符桿頂端往右下彎（dir=1 符桿朝上；-1 朝下時上下翻）
function flag(x, y, dir = 1) {
  const p = (dx, dy) => [x + dx, y + dir * dy];
  return obj('flag', [['m', ...p(0, 0)], ['c', ...p(3, 10), ...p(17, 12), ...p(14, 30)], ['c', ...p(13, 19), ...p(5, 15), ...p(0, 13)], ['h']]);
}

const dot = (cx, cy, r = STYLE.dotR) => obj('dot', ellipse(cx, cy, r, r, 0));

// 記號：重音 >、強重音 ^、斷音點、+（悶音）
function mark(kind, x, y) {
  const lw = STYLE.markLw;
  if (kind === 'accent') return obj('accent', [['m', x - 9, y - 6], ['l', x + 9, y], ['l', x - 9, y + 6]], 'S', { lw });
  if (kind === 'marcato') return obj('marcato', [['m', x - 8, y + 7], ['l', x, y - 8], ['l', x + 8, y + 7], ['l', x + 4.4, y + 7], ['l', x, y - 1], ['l', x - 4.4, y + 7], ['h']]);
  if (kind === 'plus') return obj('plus', [['m', x - 8, y], ['l', x + 8, y], ['m', x, y - 8], ['l', x, y + 8]], 'S', { lw: lw * 1.2 });
  return dot(x, y, STYLE.dotR * 0.9);
}

// 八分休止符：一個點拖一筆斜下來，像假名
function rest8(x, y) {
  return [dot(x - 6, y, STYLE.dotR * 1.5), obj('rest', [['m', x - 7, y + 4], ['c', x - 1, y + 7, x + 6, y + 4, x + 10, y - 2], ['l', x + 12, y - 1], ['l', x - 2, y + 40], ['l', x - 6, y + 39], ['l', x + 5, y + 7], ['c', x + 1, y + 9, x - 4, y + 9, x - 7, y + 4], ['h']])];
}

// 一個音：符頭 + 符桿（up=符桿朝上），回傳 [物件, 符桿頂/底端]
function note(hx, hy, kind, up, len = STYLE.stemLen) {
  const sx = up ? hx + STYLE.stemDx : hx - STYLE.stemDx, tip = up ? hy - len : hy + len;
  return [[head(hx, hy, kind), up ? stem(sx, tip, hy - 1) : stem(sx, hy + 1, tip)], sx, tip];
}

// ---------- 規則：一個字 → 一組零件 ----------
const pickW = (R, w) => {
  let t = R() * w.reduce((a, b) => a + b[1], 0);
  for (const [v, p] of w) if ((t -= p) <= 0) return v;
  return w[0][0];
};
const HEADS = [['fill', 5], ['hollow', 2], ['tri', 1.5], ['x', 1.5]];
const MARKS = ['accent', 'marcato', 'stacc', 'plus'];

const LAYOUTS = {
  // 單音：一根符桿，可帶符尾、附點、記號
  single(R, out) {
    const up = R() < 0.6, k = pickW(R, HEADS), hx = 44, hy = up ? 76 : 26;
    const [o, sx, tip] = note(hx, hy, k, up, 3.7 * U);
    out.push(...o);
    if (R() < 0.6) out.push(flag(sx + STYLE.stemW * 0.3, tip, up ? 1 : -1));
    if (R() < 0.45) out.push(dot(hx + STYLE.dotDx, hy - 4));
    if (R() < 0.6) out.push(mark(MARKS[(R() * 4) | 0], up ? 24 : 66, up ? 22 : 82));
  },
  // 兩音連桿：像 ♫，兩根豎一兩道橫
  pair(R, out) {
    const up = R() < 0.65, n = R() < 0.55 ? 1 : 2, slope = (R() - 0.5) * 12;
    const ka = pickW(R, HEADS), kb = R() < 0.6 ? ka : pickW(R, HEADS);
    const xa = 28, xb = 66, base = up ? 78 : 22;
    const [oa, sa] = note(xa, base + slope / 2, ka, up, 0), [ob, sb] = note(xb, base - slope / 2, kb, up, 0);
    out.push(oa[0], ob[0]);
    const top = up ? 20 : 80, ya = top + slope / 2 * 0.4, yb = top - slope / 2 * 0.4, d = up ? 1 : -1;
    out.push(up ? stem(sa, ya, base + slope / 2 - 1) : stem(sa, base + slope / 2 + 1, ya));
    out.push(up ? stem(sb, yb, base - slope / 2 - 1) : stem(sb, base - slope / 2 + 1, yb));
    for (let i = 0; i < n; i++) out.push(beam(sa - STYLE.stemW / 2, ya + d * (STYLE.beamTh / 2 + i * STYLE.beamGap), sb + STYLE.stemW / 2, yb + d * (STYLE.beamTh / 2 + i * STYLE.beamGap)));
    if (R() < 0.35) out.push(mark(MARKS[(R() * 4) | 0], xa, up ? 92 : 8));
  },
  // 冖：上面一道連桿兩端垂下，底下放一個小結構
  roof(R, out) {
    const y = 20 + R() * 4, s = (R() - 0.5) * 6;
    out.push(beam(16, y + s, 84, y - s), stem(19, y + s - 2, y + s + 15), stem(81, y - s - 2, y - s + 15));
    const sub = (R() * 4) | 0;
    if (sub === 0) {
      // 三顆符頭排成品字
      const k = pickW(R, HEADS);
      out.push(head(50, 46, k), head(33, 74, R() < 0.5 ? k : 'fill'), head(67, 74, R() < 0.5 ? k : 'fill'));
    } else if (sub === 1) {
      const [o] = note(46, 48, pickW(R, HEADS), false, 2.9 * U);
      out.push(...o);
      if (R() < 0.6) out.push(dot(46 + STYLE.dotDx, 46));
    } else if (sub === 2) {
      out.push(...rest8(50, 44));
    } else {
      out.push(beam(30, 52, 70, 52, STYLE.beamTh * 0.8), head(36, 76, pickW(R, HEADS)), head(64, 76, pickW(R, HEADS)));
    }
  },
  // 口：一個框，裡面一顆符頭或休止；可以有一豎穿出頭（像「中」）
  frame(R, out) {
    const x0 = 22, x1 = 78, y0 = 30 + R() * 6, y1 = 82, through = R() < 0.4;
    out.push(stem(x0, y0, y1), stem(x1, y0 - 1, y1), beam(x0, y0, x1, y0 - 1), beam(x0 - 1, y1 - 2, x1 + 1, y1 - 2, STYLE.beamTh * 0.8));
    if (through) out.push(stem(50, 12, y1 - 3), head(36, (y0 + y1) / 2, pickW(R, HEADS)), R() < 0.5 ? dot(64, (y0 + y1) / 2) : mark('accent', 65, (y0 + y1) / 2));
    else {
      out.push(head(50, (y0 + y1) / 2, pickW(R, HEADS)));
      if (R() < 0.7) out.push(mark(MARKS[(R() * 4) | 0], 50, 16));
    }
  },
  // 和弦：一根長豎，符頭左右交錯掛上去（像「彡」穿過「丨」）
  chord(R, out) {
    const n = 2 + ((R() * 2) | 0), sx = 52, k = pickW(R, HEADS), up = R() < 0.5;
    out.push(stem(sx, 14, 88));
    for (let i = 0; i < n; i++) {
      const y = 34 + i * (44 / (n - 1 || 1)), left = (i % 2 === 0) !== up;
      out.push(head(left ? sx - STYLE.stemDx : sx + STYLE.stemDx, y, i === n - 1 ? k : 'fill'));
    }
    if (R() < 0.5) out.push(flag(sx + STYLE.stemW * 0.3, 14));
  },
  // 震音：一根豎被兩三道斜槓劃過（像「手」「丰」）
  tremolo(R, out) {
    const n = 2 + ((R() * 2) | 0), up = R() < 0.7, k = pickW(R, HEADS);
    const [o, sx] = note(42, up ? 80 : 22, k, up, 4.1 * U);
    out.push(...o);
    const yc = up ? 44 : 58;
    for (let i = 0; i < n; i++) {
      const y = yc + (i - (n - 1) / 2) * STYLE.beamGap * 1.25;
      out.push(beam(sx - 15, y + 4, sx + 15, y - 4, STYLE.beamTh * 0.85));
    }
    if (R() < 0.4) out.push(mark(MARKS[(R() * 4) | 0], 76, up ? 80 : 22));
  },
  // 上下兩層：上面記號，中間一橫，下面兩顆符頭
  stack(R, out) {
    out.push(mark(R() < 0.5 ? 'marcato' : 'plus', 50, 17));
    out.push(beam(16, 36, 84, 34));
    if (R() < 0.5) {
      out.push(head(32, 64, pickW(R, HEADS)), head(68, 64, pickW(R, HEADS)));
      out.push(obj('staff', [['m', 14, 64], ['l', 86, 64]], 'S', { lw: STYLE.markLw * 0.6 }));
    } else {
      const [o, sx, tip] = note(40, 80, pickW(R, HEADS), true, 2.6 * U);
      out.push(...o);
      if (R() < 0.6) out.push(flag(sx + STYLE.stemW * 0.3, tip));
      out.push(dot(74, 76));
    }
  },
  // 單獨的八分休止，旁邊一個附點或記號（像假名）
  rest(R, out) {
    out.push(...rest8(46, 30));
    if (R() < 0.6) out.push(mark(R() < 0.5 ? 'stacc' : 'accent', 76, 26));
    out.push(beam(22, 86, 78, 84, STYLE.beamTh * 0.7));
  },
};
const LAYOUT_W = [['single', 3], ['pair', 4], ['roof', 2.5], ['frame', 2], ['chord', 2], ['tremolo', 2], ['stack', 1.5], ['rest', 1]];

// ---------- 部首 ----------
// 同部首的字共用同一個零件（燈燭燒烤都帶「火」、茶藥草都帶「艸」），看起來才像一套文字。
// 部首直接畫在整字的座標上；其餘部分（聲旁）交給 LAYOUTS，縮進剩下的格子。
const small = (cx, cy, k = 0.62) => {
  const o = head(cx, cy, 'fill');
  o.segs = o.segs.map(([op, ...v]) => [op, ...v.map((n, i) => (i % 2 ? cy + (n - cy) * k : cx + (n - cx) * k))]);
  return o;
};
const frameBox = (x0, y0, x1, y1, th = STYLE.beamTh * 0.75) => [stem(x0, y0, y1), stem(x1, y0, y1), beam(x0, y0, x1, y0, th), beam(x0, y1 - th / 2, x1, y1 - th / 2, th)];

const RADICALS = {
  水: { at: 'left', draw: (o) => o.push(small(14, 20), small(11, 44), beam(5, 88, 29, 62, STYLE.beamTh * 0.8)) },
  冰: { at: 'left', draw: (o) => o.push(small(14, 32), beam(5, 82, 29, 58, STYLE.beamTh * 0.8)) },
  火: { at: 'left', draw: (o) => o.push(dot(7, 38), dot(29, 32), stem(18, 18, 66), beam(18, 62, 4, 90, STYLE.beamTh * 0.85)) },
  魚: { at: 'left', draw: (o) => o.push(mark('marcato', 18, 10), ...frameBox(7, 24, 29, 62), mark('plus', 18, 43), ...[6, 14, 22, 30].map((x) => dot(x, 84))) },
  米: { at: 'left', draw: (o) => o.push(dot(8, 26), dot(28, 26), beam(4, 46, 32, 46), stem(18, 12, 92), dot(7, 70), dot(29, 70)) },
  糸: { at: 'left', draw: (o) => o.push(mark('accent', 17, 20), mark('accent', 17, 40), stem(17, 50, 92), dot(6, 78), dot(29, 78)) },
  玉: { at: 'left', draw: (o) => o.push(beam(5, 22, 31, 22), beam(6, 52, 30, 52), beam(4, 86, 32, 78), stem(18, 22, 82)) },
  食: { at: 'left', draw: (o) => o.push(mark('marcato', 18, 10), ...frameBox(8, 26, 29, 56), head(18, 41, 'hollow'), stem(9, 56, 92), mark('accent', 25, 78)) },
  口: { at: 'left', draw: (o) => o.push(...frameBox(7, 36, 29, 70)) },
  人: { at: 'left', draw: (o) => o.push(beam(27, 10, 6, 46, STYLE.beamTh * 0.85), stem(18, 30, 92)) },
  手: { at: 'left', draw: (o) => o.push(beam(5, 34, 31, 32), stem(18, 12, 90), beam(4, 74, 31, 58, STYLE.beamTh * 0.8)) },
  虫: { at: 'left', draw: (o) => o.push(...frameBox(7, 20, 29, 54), stem(18, 10, 76), beam(4, 88, 31, 74, STYLE.beamTh * 0.8), dot(29, 84)) },
  艸: { at: 'top', draw: (o) => o.push(beam(8, 18, 92, 18, STYLE.beamTh * 0.85), stem(31, 5, 31), stem(69, 5, 31)) },
  竹: { at: 'top', draw: (o) => { for (const x of [0, 48]) o.push(beam(x + 30, 4, x + 10, 24, STYLE.beamTh * 0.8), beam(x + 22, 13, x + 44, 13, STYLE.beamTh * 0.75), dot(x + 37, 25)); } },
  宀: { at: 'top', draw: (o) => o.push(mark('marcato', 50, 8), beam(12, 21, 88, 21), stem(14, 19, 32), stem(86, 19, 32)) },
  灬: { at: 'bottom', draw: (o) => o.push(small(16, 88), small(38, 88), small(62, 88), small(84, 88)) },
  囗: { at: 'enclose', draw: (o) => o.push(...frameBox(8, 8, 92, 92)) },
  門: { at: 'enclose', draw: (o) => o.push(...frameBox(8, 8, 36, 32), ...frameBox(64, 8, 92, 32), stem(8, 30, 94), stem(92, 30, 94), flag(92, 94, -1)) },
};
// 海市用得到的字。查不到的字由種子決定要不要配一個部首
const RADICAL_OF = {};
for (const [r, s] of Object.entries({
  水: '海湯酒洋港池', 冰: '冰冷', 火: '燭燈烤燒炸炒', 魚: '鮮魷鯛鰻', 米: '料糖粥粉', 糸: '縫線紙', 玉: '玻璃珠', 食: '飯餅館',
  口: '味喫', 人: '信住', 手: '物', 虫: '蠟', 艸: '茶藥草葫蘆薯花菓', 竹: '籠箱', 宀: '宿', 灬: '煮', 囗: '圖團', 門: '關',
})) for (const c of s) RADICAL_OF[c] = r;
const BOX = { left: [26, 0, 104, 100], top: [0, 24, 100, 102], bottom: [0, -6, 100, 76], enclose: [14, 16, 86, 86] };

// 把 0–100 方格裡的零件縮進 [x0, y0, x1, y1]
function place(list, [x0, y0, x1, y1]) {
  const sx = (x1 - x0) / 100, sy = (y1 - y0) / 100;
  return list.map((o) => ({ ...o, lw: o.lw * Math.sqrt(sx * sy), segs: o.segs.map(([op, ...v]) => [op, ...v.map((n, i) => (i % 2 ? y0 + n * sy : x0 + n * sx))]) }));
}
const flipX = (list) => list.map((o) => ({ ...o, segs: o.segs.map(([op, ...v]) => [op, ...v.map((n, i) => (i % 2 ? n : 100 - n))]) }));
// 整字只有一個結構時，單音和休止太空，不用
const WHOLE_W = LAYOUT_W.filter(([k]) => k !== 'single' && k !== 'rest');
function part(R, w = LAYOUT_W) {
  const out = [];
  LAYOUTS[pickW(R, w)](R, out);
  return R() < 0.35 ? flipX(out) : out;
}

const CACHE = new Map();
export function glyph(ch) {
  if (CACHE.has(ch)) return CACHE.get(ch);
  const R = seeded('海市' + ch), keys = Object.keys(RADICALS);
  let rad = RADICAL_OF[ch];
  if (!rad && R() < 0.3) rad = keys[(R() * 12) | 0];          // 只從左邊的部首挑
  let out;
  if (rad) {
    const r = RADICALS[rad];
    out = [];
    r.draw(out);
    out.push(...place(part(R), BOX[r.at]));
  } else if (R() < 0.65) {
    // 沒有部首的字：多半拆成左右或上下兩塊，其餘整字一個結構
    const lr = R() < 0.6;
    out = [...place(part(R), lr ? [-4, 0, 56, 100] : [0, -6, 100, 54]), ...place(part(R), lr ? [40, 0, 104, 100] : [0, 42, 100, 106])];
  } else out = part(R, WHOLE_W);
  CACHE.set(ch, out);
  return out;
}

// ---------- 輸出 ----------
const f = (n) => +n.toFixed(2);
export function segsD(segs) {
  return segs.map(([op, ...v]) => (op === 'h' ? 'Z' : op.toUpperCase() + v.map(f).join(' '))).join('');
}

const PATHS = new Map();
function paths(ch) {
  if (!PATHS.has(ch)) PATHS.set(ch, glyph(ch).map((o) => ({ o, p: new Path2D(segsD(o.segs)) })));
  return PATHS.get(ch);
}

// size = 方格邊長（px）；(cx, cy) = 方格中心
export function drawGlyph(g, ch, cx, cy, size, color = '#000') {
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(size / 100, size / 100);
  g.fillStyle = g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const { o, p } of paths(ch)) {
    if (o.paint === 'S') {
      g.lineWidth = o.lw;
      g.stroke(p);
    } else g.fill(p, o.rule);
  }
  g.restore();
}

// 一串字。直排由上往下，橫排由左往右；step 是字距（預設 = size）
export function drawText(g, text, { x, y, size, vertical = false, step = size, color = '#000' }) {
  const chars = [...text].filter((c) => c.trim());
  const n = chars.length, s0 = -((n - 1) * step) / 2;
  chars.forEach((c, i) => drawGlyph(g, c, vertical ? x : x + s0 + i * step, vertical ? y + s0 + i * step : y, size, color));
}

export function textSVG(text, { size = 100, vertical = false, color = '#000' } = {}) {
  const chars = [...text].filter((c) => c.trim()), n = chars.length;
  const w = vertical ? size : size * n, h = vertical ? size * n : size, k = size / 100;
  const body = chars.map((c, i) => {
    const tx = vertical ? 0 : i * size, ty = vertical ? i * size : 0;
    const ps = glyph(c).map((o) => (o.paint === 'S'
      ? `<path d="${segsD(o.segs)}" fill="none" stroke="${color}" stroke-width="${f(o.lw)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${segsD(o.segs)}" fill="${color}" fill-rule="${o.rule}"/>`));
    return `<g transform="translate(${tx} ${ty}) scale(${k})">${ps.join('')}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body.join('')}</svg>`;
}
