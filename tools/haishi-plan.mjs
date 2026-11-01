// 海市的平面圖：不開瀏覽器，在 Node 裡把海市建出來，畫成一張俯視的 SVG，給畫草稿用。
//   node tools/haishi-plan.mjs            → tools/out/haishi-plan.svg
// 北（山上，-z）在上，海（+z）在下。每 1 公尺一條細線，每 5 公尺一條粗線、標座標，草稿畫在上面就知道位置。
// 底色是地形高度（越亮越高）；淺色方塊是走得到的區塊，標 id 和高度（石階標從幾公尺到幾公尺）；
// 深色是房子、牆、石台；紅線是欄杆；小方塊是燈柱、攤子這類擋路的東西；圓點是攤位，三角是下船的地方
import fs from 'node:fs';
import path from 'node:path';
import { w, ROOT } from './haishi-env.mjs';

const { areas, solids, rails, obstacles, terrain } = w.debug;
const PX = 20;   // 每公尺幾像素
const X0 = Math.floor(Math.min(...areas.map((a) => a.x0)) - 6), X1 = Math.ceil(Math.max(...areas.map((a) => a.x1)) + 6);
const Z0 = Math.floor(Math.min(...areas.map((a) => a.z0)) - 6), Z1 = Math.ceil(Math.max(...areas.map((a) => a.z1)) + 4);
const W = (X1 - X0) * PX, H = (Z1 - Z0) * PX;
const sx = (x) => ((x - X0) * PX).toFixed(1), sz = (z) => ((z - Z0) * PX).toFixed(1);
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const out = [];

// 地形：每公尺一格，依高度上色
let lo = Infinity, hi = -Infinity;
const hs = [];
for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
  const h = terrain(x + 0.5, z + 0.5);
  hs.push(h);
  lo = Math.min(lo, h);
  hi = Math.max(hi, h);
}
let k = 0;
for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
  const t = (hs[k++] - lo) / (hi - lo || 1);
  const c = `rgb(${Math.round(40 + 120 * t)},${Math.round(48 + 112 * t)},${Math.round(70 + 90 * t)})`;
  out.push(`<rect x="${sx(x)}" y="${sz(z)}" width="${PX}" height="${PX}" fill="${c}"/>`);
}

// 格線
for (let x = X0; x <= X1; x++) out.push(`<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${H}" class="${x % 5 ? 'g1' : 'g5'}"/>`);
for (let z = Z0; z <= Z1; z++) out.push(`<line x1="0" y1="${sz(z)}" x2="${W}" y2="${sz(z)}" class="${z % 5 ? 'g1' : 'g5'}"/>`);

const rect = (r, cls) => `<rect x="${sx(r.x0)}" y="${sz(r.z0)}" width="${((r.x1 - r.x0) * PX).toFixed(1)}" height="${((r.z1 - r.z0) * PX).toFixed(1)}" class="${cls}"/>`;
for (const s of solids) if (!s.ground) out.push(rect(s, 'solid'));
for (const a of areas) out.push(rect(a, a.added ? 'area added' : 'area'));
for (const r of rails) out.push(`<line x1="${sx(r.ax)}" y1="${sz(r.az)}" x2="${sx(r.bx)}" y2="${sz(r.bz)}" class="rail"/>`);
for (const o of obstacles) {
  const rot = o.rot ? ` transform="rotate(${f1((-o.rot * 180) / Math.PI)} ${sx(o.x)} ${sz(o.z)})"` : '';
  out.push(`<rect x="${sx(o.x - o.hw)}" y="${sz(o.z - o.hd)}" width="${(o.hw * 2 * PX).toFixed(1)}" height="${(o.hd * 2 * PX).toFixed(1)}" class="obst"${rot}/>`);
}
for (const s of w.shops) out.push(`<circle cx="${sx(s.x)}" cy="${sz(s.z)}" r="5" class="shop"/><text x="${sx(s.x)}" y="${sz(s.z - 0.45)}" class="shopt">${s.id}</text>`);
const sp = w.spawn;
out.push(`<path d="M${sx(sp.x)},${sz(sp.z - 0.6)} l-7,14 h14 z" class="spawn"/>`);

// 區塊標籤放在最上面，才不會被房子蓋住
for (const a of areas) {
  const h = a.y !== undefined ? f1(a.y) : `${f1(a.lo)}→${f1(a.hi)}`;
  const cx = sx((a.x0 + a.x1) / 2), cz = sz((a.z0 + a.z1) / 2);
  out.push(`<text x="${cx}" y="${cz}" class="aid">${a.id}</text><text x="${cx}" y="${(+cz + 13).toFixed(1)}" class="ah">${h} m</text>`);
}
// 座標：每 5 公尺標在上緣和左緣
for (let x = Math.ceil(X0 / 5) * 5; x <= X1; x += 5) out.push(`<text x="${sx(x)}" y="12" class="ax">x ${x}</text>`);
for (let z = Math.ceil(Z0 / 5) * 5; z <= Z1; z += 5) out.push(`<text x="4" y="${(+sz(z) - 3).toFixed(1)}" class="ax" text-anchor="start">z ${z}</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">
<style>
.g1{stroke:#fff;stroke-opacity:.08;stroke-width:1}.g5{stroke:#fff;stroke-opacity:.3;stroke-width:1}
.area{fill:#e8dcc4;fill-opacity:.55;stroke:#f6efe0;stroke-width:1}.added{fill:#c4e0d8}
.solid{fill:#1e1c26;fill-opacity:.75}.rail{stroke:#e0503a;stroke-width:2.5}.obst{fill:#6a5a4a}
.shop{fill:#ffb050;stroke:#000;stroke-width:1}.shopt{font-size:10px;fill:#ffd9a0;text-anchor:middle}
.spawn{fill:#7fd0ff}.aid,.ah{text-anchor:middle;paint-order:stroke;stroke:#efe6d2;stroke-width:3px}.aid{font-size:12px;font-weight:bold;fill:#222}.ah{font-size:10px;fill:#333}
.ax{font-size:11px;fill:#fff;fill-opacity:.8;text-anchor:middle}
</style>
${out.join('\n')}
</svg>
`;
const file = path.join(ROOT, 'tools/out/haishi-plan.svg');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, svg);
console.log(`${path.relative(ROOT, file)}  ${W}×${H} px，x ${X0}～${X1}、z ${Z0}～${Z1}，每公尺 ${PX} px`);
