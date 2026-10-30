// 海市的路網檢查：不開瀏覽器，在 Node 裡把海市建出來，把走得到的地面切成格子掃一遍。
//   node tools/check-haishi.mjs
// 會報四件事：
//   1. 斷層：兩格相鄰都走得到，高度卻差很多（不同高度的石台碰在一起，一步就跨上去了）
//   2. 走不到：從下船的地方出發，順著地面走不到的區塊
//   3. 路網：哪幾區之間直接相通、整張網有幾個環（環越多，可以選的路越多）
//   4. 沒有欄杆的邊：走到邊上，外面往下掉一公尺以上，卻沒有欄杆、牆或房子擋著
// 有斷層，或有一大塊走不到，結束代碼是 1
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_URL = pathToFileURL(path.join(ROOT, 'vendor/three.module.min.js')).href;
register(`data:text/javascript,export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`);

// 建海市時會畫招牌、字的貼圖，給它一個什麼都不做的畫布
const ctx = new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return typeof k === 'string' ? () => {} : undefined;
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const el = () => ({ width: 64, height: 64, style: {}, getContext: () => ctx, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains: () => false } });
Object.assign(globalThis, {
  window: globalThis, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
  document: { createElement: el, body: el(), addEventListener() {} },
  matchMedia: () => ({ matches: false }),
  Path2D: class {},
});

const THREE = await import('three');
const { buildHaishi } = await import(pathToFileURL(path.join(ROOT, 'js/haishi.js')).href);
const w = buildHaishi(new THREE.Scene());
const { areas, rails, solids, obstacles } = w.debug;

const S = 0.25;            // 格子大小
const STEP = 0.3;          // 相鄰兩格高度差超過這個就算斷層（石階一格最多差一階 0.2）
const DROP = 1.0;          // 邊外面低這麼多才需要欄杆
const areaAt = (x, z) => areas.find((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
const fmt = (v) => (Math.round(v * 10) / 10).toString();

const X0 = Math.min(...areas.map((a) => a.x0)) - 1, X1 = Math.max(...areas.map((a) => a.x1)) + 1;
const Z0 = Math.min(...areas.map((a) => a.z0)) - 1, Z1 = Math.max(...areas.map((a) => a.z1)) + 1;
const cols = Math.ceil((X1 - X0) / S), rows = Math.ceil((Z1 - Z0) / S);
const cx = (c) => X0 + (c + 0.5) * S, cz = (r) => Z0 + (r + 0.5) * S;
const ok = new Uint8Array(cols * rows), hy = new Float32Array(cols * rows), aid = new Array(cols * rows);
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const i = r * cols + c, x = cx(c), z = cz(r);
  if (!w.walkable(x, z)) continue;
  ok[i] = 1;
  hy[i] = w.groundY(x, z);
  aid[i] = areaAt(x, z)?.id ?? '?';
}
const NB = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// ---------- 1. 斷層 ----------
const cliffs = new Map();
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const i = r * cols + c;
  if (!ok[i]) continue;
  for (const [dc, dr] of NB.slice(0, 2)) {
    const j = (r + dr) * cols + c + dc;
    if (c + dc >= cols || r + dr >= rows || !ok[j]) continue;
    const d = Math.abs(hy[i] - hy[j]);
    if (d <= STEP) continue;
    const key = [aid[i], aid[j]].sort().join(' ↔ ');
    const e = cliffs.get(key) || { n: 0, d: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    e.n++; e.d = Math.max(e.d, d);
    e.x0 = Math.min(e.x0, cx(c)); e.x1 = Math.max(e.x1, cx(c)); e.z0 = Math.min(e.z0, cz(r)); e.z1 = Math.max(e.z1, cz(r));
    cliffs.set(key, e);
  }
}

// ---------- 2. 走不到 ----------
const seen = new Uint8Array(cols * rows);
{
  const sc = Math.floor((w.spawn.x - X0) / S), sr = Math.floor((w.spawn.z - Z0) / S), start = sr * cols + sc;
  const q = ok[start] ? [start] : [];
  if (q.length) seen[start] = 1;
  while (q.length) {
    const i = q.pop(), c = i % cols, r = (i / cols) | 0;
    for (const [dc, dr] of NB) {
      const nc = c + dc, nr = r + dr, j = nr * cols + nc;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || !ok[j] || seen[j] || Math.abs(hy[i] - hy[j]) > STEP) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
}
const total = new Map();
for (let i = 0; i < ok.length; i++) if (ok[i]) total.set(aid[i], (total.get(aid[i]) || 0) + 1);

// ---------- 3. 路網 ----------
// 兩區之間有幾格互通、順著地面走得過去，就算一條連線
const links = new Map();
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const i = r * cols + c;
  if (!ok[i]) continue;
  for (const [dc, dr] of NB.slice(0, 2)) {
    const j = (r + dr) * cols + c + dc;
    if (c + dc >= cols || r + dr >= rows || !ok[j] || aid[i] === aid[j] || Math.abs(hy[i] - hy[j]) > STEP) continue;
    const key = [aid[i], aid[j]].sort().join(' — ');
    links.set(key, (links.get(key) || 0) + 1);
  }
}
const nodes = new Set([...total.keys()]);
// 每個連通塊多一個「根」：環的數量 = 邊 − 點 + 連通塊數
const parent = new Map([...nodes].map((n) => [n, n]));
const find = (n) => (parent.get(n) === n ? n : find(parent.get(n)));
for (const k of links.keys()) { const [a, b] = k.split(' — '); parent.set(find(a), find(b)); }
const parts = new Set([...nodes].map(find)).size;
const loops = links.size - nodes.size + parts;

// ---------- 4. 沒有欄杆的邊 ----------
const nearRail = (x, z) => rails.some((s) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < 0.7;
});
const inWall = (x, z) => solids.some((b) => !b.ground && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)
  || obstacles.some((o) => Math.abs(x - o.x) < o.hw + 0.3 && Math.abs(z - o.z) < o.hd + 0.3);
const open = new Map();
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const i = r * cols + c;
  if (!ok[i]) continue;
  for (const [dc, dr] of NB) {
    const j = (r + dr) * cols + c + dc;
    if (ok[j]) continue;
    // 往外多看一點：角色半徑那一圈還在石台上，要越過石台的邊才看得到底下
    const x = cx(c) + dc * 0.6, z = cz(r) + dr * 0.6;
    if (areaAt(x, z) || inWall(x, z) || nearRail(x, z)) continue;
    const below = w.groundY(x, z);
    if (hy[i] - below < DROP) continue;
    const id = aid[i], e = open.get(id) || { n: 0, pts: [] };
    e.n++;
    if (!e.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2)) e.pts.push([x, z]);
    open.set(id, e);
  }
}

// ---------- 報告 ----------
console.log(`海市路網：${nodes.size} 區、${links.size} 條連線、${loops} 個環\n`);
console.log('連線：');
for (const [k, n] of [...links].sort()) console.log(`  ${k}  (寬約 ${fmt(n * S)} m)`);
console.log('');
if (cliffs.size) {
  console.log('斷層（相鄰兩格高度差太多，角色會一步跨上去）：');
  for (const [k, e] of cliffs) console.log(`  ${k}：${e.n} 處，最多差 ${fmt(e.d)} m，x ${fmt(e.x0)}~${fmt(e.x1)}，z ${fmt(e.z0)}~${fmt(e.z1)}`);
} else console.log('斷層：沒有');
// 走不到的格子一塊一塊分開報，才知道是整區斷掉，還是木箱後面一個小角落
const lost = [];
{
  const done = new Uint8Array(cols * rows);
  for (let s = 0; s < ok.length; s++) {
    if (!ok[s] || seen[s] || done[s]) continue;
    const q = [s], e = { n: 0, ids: new Set(), x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    done[s] = 1;
    while (q.length) {
      const i = q.pop(), c = i % cols, r = (i / cols) | 0;
      e.n++; e.ids.add(aid[i]);
      e.x0 = Math.min(e.x0, cx(c)); e.x1 = Math.max(e.x1, cx(c)); e.z0 = Math.min(e.z0, cz(r)); e.z1 = Math.max(e.z1, cz(r));
      for (const [dc, dr] of NB) {
        const nc = c + dc, nr = r + dr, j = nr * cols + nc;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || !ok[j] || seen[j] || done[j] || Math.abs(hy[i] - hy[j]) > STEP) continue;
        done[j] = 1;
        q.push(j);
      }
    }
    lost.push(e);
  }
}
// 4 m² 以下的小角落（攤販站的地方、木箱後面）只列出來，不算錯
const NOOK = 4 / (S * S);
if (lost.length) {
  console.log('走不到（從下船的地方出發）：');
  for (const e of lost) console.log(`  ${[...e.ids].join('、')}：${e.n} 格，x ${fmt(e.x0)}~${fmt(e.x1)}，z ${fmt(e.z0)}~${fmt(e.z1)}${e.n < NOOK ? '（小角落）' : ''}`);
} else console.log('走不到：沒有');
if (open.size) {
  console.log('沒有欄杆的邊（外面往下掉 1 m 以上）：');
  for (const [id, e] of open) console.log(`  ${id}：${e.n} 格，大約在 ${e.pts.slice(0, 6).map(([x, z]) => `(${fmt(x)}, ${fmt(z)})`).join(' ')}${e.pts.length > 6 ? ' …' : ''}`);
} else console.log('沒有欄杆的邊：沒有');
process.exit(cliffs.size || lost.some((e) => e.n >= NOOK) ? 1 : 0);
