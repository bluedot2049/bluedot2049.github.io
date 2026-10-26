// 戶外：赤化的後門出去是陽台「宴」，石階往下到草原。
// 房子和陽台蓋在石砌台基上，草原比室內低 DROP 公尺。整個畫廊只有這裡的地面不在高度 0。
// 座標：rel 是離後門的距離，往草原方向為正，世界座標 z = z0 - rel。
import * as THREE from 'three';
import { Water } from '../vendor/Water.js';
import { Kit, newBucket, mergeBucket, rng, buildWindow } from './props.js';
import { buildArcane } from './arcane.js';
import { buildHarbor, onJetty, JETTY } from './harbor.js';
import { buildLore } from './lore.js';

export const DROP = 1.6;
const TW = 6, TD = 7;                  // 陽台半寬、深度
const SW = 1.2, SD = 3, STEPS = 8;     // 石階半寬、水平長度、階數
const MEADOW = { c: 22.5, rx: 18, rz: 13 };   // 走得到的草原是橢圓，c 是中心離門口多遠
// 左邊山坡的小徑：(x, rel)，從草原裡的步道口先往房子那頭斜上，再折回來爬到坡頂，從上坡那側走進涼亭
const TRAIL = [[-13, 17], [-18, 13.2], [-22.5, 10], [-27, 8], [-31, 8.2], [-34.5, 11], [-38, 14.8], [-41.5, 19], [-44, 23], [-44, 27.2]];
const TRAIL_W = 1.4;                       // 小徑半寬，比踏石寬得多，用搖桿或鍵盤走不必對得很準
const PAV = { x: -40, rel: 30, r: 2.8 };   // 涼亭石台的中心和半徑
const BW = 5.6, EAVE = 4.2, RIDGE = 6.0;      // 房子外殼的半寬、屋簷高、屋脊高
const YB = -DROP - 0.2;                // 台基埋進土裡的底部
const SEA_LEVEL = -DROP - 0.9, SEA_BED = -DROP - 2.4;   // 草原盡頭的海：水面和海底的高度
// 海面反射的鏡頭只看這個圖層。從草原看海只映得到天空、遠山、山坡和坡上的樹，草地、家具、房子、人都不用多畫一次
export const REFLECT_LAYER = 2;
export const SUN_DIR = new THREE.Vector3(-0.35, 0.07, -1).normalize();
export const HORIZON = 0xe3a47e;

export const OUTDOOR_ROOM = { id: 'outdoor', name: '宴', subtitle: 'Convivium', type: 'outdoor', paintings: [] };
export const MEADOW_NAME = { name: '原野', subtitle: 'Prima Materia' };
export const JETTY_NAME = { name: '渡口', subtitle: 'Ad Occidentem' };

// ---------- 貼圖 ----------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function noise(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function texture(c, wrapT = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = wrapT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// 陶磚地，一張貼圖 2m 見方、4×4 塊
function tileTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#6e3f2a';
  g.fillRect(0, 0, 256, 256);
  const tones = ['#b0643e', '#a35a37', '#bb7048', '#9c5534', '#c07a4e'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = tones[(i * 7 + j * 3) % tones.length];
    g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
  }
  noise(g, 256, 256, 26);
  return texture(c);
}

// 台基的石塊，一張貼圖 2m 寬、1m 高
function stoneTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#5f5248';
  g.fillRect(0, 0, 256, 128);
  const tones = ['#a8988a', '#9a8a7c', '#b4a596', '#8f8174'];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 32 : 0;
    for (let x = -off; x < 256; x += 64) {
      g.fillStyle = tones[(row * 5 + x / 64 + 9) % tones.length | 0];
      g.fillRect(x + 2, row * 32 + 2, 60, 28);
    }
  }
  noise(g, 256, 128, 30);
  return texture(c);
}

// 房子外牆：下段石砌台基、一道木帶、上段灰泥。一張貼圖 4m 寬、從台基底到屋簷
function facadeTexture() {
  const H = 384, [c, g] = canvas(256, H);
  const stoneH = Math.round(H * (0 - YB) / (EAVE - YB));
  g.fillStyle = '#dcc7a4';
  g.fillRect(0, 0, 256, H - stoneH);
  // 灰泥剝落露出的磚
  for (const [x, y] of [[30, 90], [180, 40], [120, 180]]) {
    g.fillStyle = '#a4664a';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.fillRect(x + i * 15 + (j % 2) * 7, y + j * 8, 13, 6);
  }
  g.fillStyle = '#5a3a24';
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, H - stoneH - 10, 256, 10);
  const tones = ['#9a8a7c', '#a8988a', '#8f8174'];
  for (let y = H - stoneH, row = 0; y < H; y += 26, row++) {
    for (let x = row % 2 ? -32 : 0; x < 256; x += 64) {
      g.fillStyle = tones[(row + x / 32 + 6) % 3 | 0];
      g.fillRect(x + 2, y + 2, 60, 22);
    }
  }
  noise(g, 256, H, 24);
  return texture(c, false);
}

// ---------- 幾何小工具 ----------

// 直立的牆片：寬 w、從 y0 到 y1，中心 (cx, cz)，法線 = (sin rotY, cos rotY)。uScale 公尺換一次貼圖
function face(mat, w, y0, y1, cx, cz, rotY, uScale, v0, v1) {
  const geo = new THREE.PlaneGeometry(w, y1 - y0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uScale, v0 + uv.getY(i) * (v1 - v0));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, (y0 + y1) / 2, cz);
  m.rotation.y = rotY;
  return m;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};
// 山坡上一塊一塊的分區：小於 0.4 是樹林，大於 0.6 是花田。地面上色和種樹都看這個，樹才會長在深色那幾塊
const patch = (x, z) => vnoise(x * 0.045 + 7.3, z * 0.045 - 3.1);
const FIELDS = ['#9a8ad0', '#d8c050'];

// 草原的地形：走得到的範圍是平的，往外慢慢隆起成丘陵，房子附近保持平地
function makeTerrain(z0) {
  return (x, z) => {
    const rel = z0 - z;
    const e = Math.hypot(x / MEADOW.rx, (rel - MEADOW.c) / MEADOW.rz);
    if (e < 1.25) return -DROP;
    let h = Math.pow(e - 1.25, 1.5) * 3.2 + vnoise(x * 0.04, z * 0.04) * 4 * Math.min(1, e - 1.25);
    // 夕陽那一側壓成低緩的谷地，坐在草原上才看得到天邊
    const ahead = (rel - MEADOW.c) / Math.max(1, Math.hypot(x, rel - MEADOW.c));
    h *= 1 - 0.88 * smooth(0.2, 0.85, ahead);
    // 房子後方和兩側壓平，不然整棟會埋進山坡
    const dx = Math.max(0, Math.abs(x) - BW - 1), dz = Math.max(0, rel - TD, -rel - 40);
    h = Math.min(h, Math.max(0, Math.hypot(dx, dz) - 3) * 0.6);
    // 夕陽那一側盡頭挖成海灣，兩側的丘陵留著
    const sea = smooth(39, 47, rel) * (1 - smooth(34, 80, Math.abs(x)));
    const y = -DROP + Math.min(h, 40);
    return y + (SEA_BED - y) * sea;
  };
}

// ---------- 家具和食物（全部用 Kit 組，最後合併） ----------

const WOOD = '#7a4a2a', DARK_WOOD = '#4e2e1a', STONE = '#d6c6a6', COPPER = '#b8733a', GOLD = '#d4a54a';

function bread(k, x, y, z, ry = 0) {
  k.ball(0.11, '#b8753a', x, y + 0.05, z, { sx: 1.5, sy: 0.65, sz: 0.9, ry, color2: '#d89a54' });
  for (const o of [-0.06, 0, 0.06]) k.box(0.012, 0.01, 0.1, '#f0d8a8', x + Math.cos(ry) * o, y + 0.115, z - Math.sin(ry) * o, { ry: ry + 0.4 });
}

function fruit(k, kind, x, y, z) {
  if (kind === 'pomegranate') {
    k.ball(0.055, '#9c1f2a', x, y + 0.055, z);
    k.cone(0.022, 0.035, '#7a1820', x, y + 0.115, z);
  } else if (kind === 'golden') {
    k.ball(0.05, '#e8b430', x, y + 0.05, z, { color2: '#f6d872' });
    k.box(0.006, 0.03, 0.006, '#4a3020', x, y + 0.11, z);
  } else {
    k.ball(0.048, '#c8382a', x, y + 0.048, z, { color2: '#e05a3a' });
    k.box(0.006, 0.03, 0.006, '#4a3020', x, y + 0.105, z);
  }
}

function grapes(k, x, y, z) {
  const R = k.R;
  for (let i = 0; i < 11; i++) {
    const row = Math.floor(i / 4);
    k.ball(0.022, i % 3 ? '#5a2a5a' : '#7a3a6a', x + (R() - 0.5) * 0.09, y + 0.02 + row * 0.03, z + (R() - 0.5) * 0.09 - row * 0.02);
  }
}

function candle(k, x, y, z) {
  k.cyl(0.035, 0.045, 0.02, GOLD, x, y + 0.01, z, {}, 8);
  k.cyl(0.018, 0.018, 0.16, '#f2ead8', x, y + 0.1, z, {}, 6);
  k.cone(0.012, 0.035, '#ffcf6a', x, y + 0.2, z, { glow: true });
  k.light(x, y + 0.21, z, '#ffcf8a', 0.7);
}

function jar(k, x, y, z, color) {
  k.cyl(0.045, 0.045, 0.11, color, x, y + 0.055, z, { glow: true }, 8);
  k.cyl(0.048, 0.048, 0.02, '#e8dcc0', x, y + 0.12, z, {}, 8);
  k.light(x, y + 0.06, z, color, 0.35);
}

function goblet(k, x, y, z) {
  k.cyl(0.03, 0.035, 0.008, GOLD, x, y + 0.004, z, {}, 7);
  k.cyl(0.006, 0.006, 0.06, GOLD, x, y + 0.04, z, {}, 5);
  k.cyl(0.035, 0.018, 0.06, GOLD, x, y + 0.1, z, {}, 7);
}

// 長桌：沿 z 方向擺，中心在 (x, z)
function banquet(k, x, z, len) {
  const H = 0.78, W = 1.0;
  k.box(W, 0.06, len, WOOD, x, H - 0.03, z);
  for (const dz of [-len / 2 + 0.2, len / 2 - 0.2]) {
    k.box(0.08, H - 0.06, 0.08, DARK_WOOD, x - W / 2 + 0.12, (H - 0.06) / 2, z + dz);
    k.box(0.08, H - 0.06, 0.08, DARK_WOOD, x + W / 2 - 0.12, (H - 0.06) / 2, z + dz);
  }
  k.box(0.06, 0.06, len - 0.4, DARK_WOOD, x, 0.25, z);
  // 赤化的紅桌旗
  k.box(0.42, 0.005, len + 0.2, '#8a2a2a', x, H + 0.003, z);
  k.box(0.42, 0.18, 0.005, '#8a2a2a', x, H - 0.09, z - len / 2 - 0.1);
  k.box(0.42, 0.18, 0.005, '#8a2a2a', x, H - 0.09, z + len / 2 + 0.1);
  // 兩側長凳
  for (const bx of [x - W / 2 - 0.42, x + W / 2 + 0.42]) {
    k.box(0.34, 0.06, len - 0.2, WOOD, bx, 0.42, z);
    for (const dz of [-len / 2 + 0.3, len / 2 - 0.3]) k.box(0.26, 0.39, 0.06, DARK_WOOD, bx, 0.195, z + dz);
  }

  const y = H, R = k.R;
  // 每個座位前一個盤子和高腳杯
  for (const side of [-1, 1]) for (const dz of [-1.2, 0, 1.2]) {
    const px = x + side * 0.32, pz = z + dz;
    k.cyl(0.11, 0.09, 0.015, '#efe6d2', px, y + 0.008, pz, {}, 10);
    goblet(k, px + side * -0.05, y, pz + 0.18);
  }
  // 中央：銅製蒸餾器，接著一瓶剛蒸出來的金色果酒
  k.cyl(0.13, 0.15, 0.2, COPPER, x, y + 0.1, z, {}, 10);
  k.ball(0.13, COPPER, x, y + 0.22, z, { sy: 0.7 });
  k.cyl(0.02, 0.02, 0.14, COPPER, x, y + 0.36, z, {}, 6);
  k.cyl(0.015, 0.015, 0.42, COPPER, x, y + 0.36, z + 0.18, { rx: 1.25 }, 6);
  k.ball(0.07, '#ffcf6a', x, y + 0.08, z + 0.38, { glow: true });
  k.cyl(0.018, 0.018, 0.08, '#ffcf6a', x, y + 0.17, z + 0.38, { glow: true }, 6);
  k.light(x, y + 0.1, z + 0.38, '#ffcf6a', 0.6);
  // 麵包板
  k.box(0.3, 0.025, 0.5, '#a8743e', x, y + 0.013, z - 0.62);
  bread(k, x - 0.05, y + 0.025, z - 0.7, 0.2);
  bread(k, x + 0.06, y + 0.025, z - 0.5, -0.3);
  // 起司：一整輪加一角
  k.cyl(0.12, 0.12, 0.08, '#e8c060', x + 0.02, y + 0.04, z - 1.15, {}, 12);
  k.cyl(0.1, 0.1, 0.07, '#f0cc70', x - 0.12, y + 0.035, z - 0.98, { ry: 0.6 }, 3);
  // 水果盤：石榴、紅蘋果、金蘋果
  k.cyl(0.2, 0.12, 0.06, '#c8a878', x, y + 0.03, z + 0.75, {}, 10);
  const fr = ['pomegranate', 'apple', 'golden', 'pomegranate', 'golden', 'apple', 'pomegranate'];
  fr.forEach((f, i) => {
    const a = (i / fr.length) * Math.PI * 2, r = i === 0 ? 0 : 0.11;
    fruit(k, f, x + Math.cos(a) * r, y + 0.05 + (i === 0 ? 0.05 : 0), z + 0.75 + Math.sin(a) * r);
  });
  grapes(k, x - 0.18, y, z + 1.08);
  grapes(k, x + 0.16, y, z - 1.4);
  // 一碗蛋，煉金術說的「哲學之卵」
  k.cyl(0.11, 0.07, 0.07, '#8a6a4a', x + 0.04, y + 0.035, z + 1.3, {}, 9);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    k.ball(0.035, '#f2e6cc', x + 0.04 + Math.cos(a) * 0.045, y + 0.08, z + 1.3 + Math.sin(a) * 0.045, { sy: 1.3 });
  }
  // 蜂蜜和發光的果醬
  jar(k, x - 0.14, y, z + 0.32, '#f0a830');
  jar(k, x + 0.15, y, z - 0.3, '#e05a8a');
  jar(k, x - 0.15, y, z - 0.25, '#7ad06a');
  // 酒瓶
  for (const dz of [0.45, -0.85]) {
    k.cyl(0.04, 0.045, 0.22, '#2a4a32', x + 0.15, y + 0.11, z + dz, {}, 8);
    k.cyl(0.015, 0.02, 0.08, '#2a4a32', x + 0.15, y + 0.26, z + dz, {}, 6);
  }
  for (const dz of [-1.6, -0.35, 0.95, 1.6]) candle(k, x + (R() - 0.5) * 0.1, y, z + dz);
}

// 小圓桌：茶具和一塊蛋糕
function bistro(k, x, z) {
  const H = 0.72;
  k.cyl(0.36, 0.36, 0.04, DARK_WOOD, x, H - 0.02, z, {}, 14);
  k.cyl(0.04, 0.05, H - 0.04, '#2a2220', x, (H - 0.04) / 2, z, {}, 6);
  k.cyl(0.2, 0.22, 0.03, '#2a2220', x, 0.015, z, {}, 10);
  k.ball(0.08, '#e8dcc0', x - 0.08, H + 0.07, z, { sy: 0.8 });
  k.cyl(0.012, 0.012, 0.1, '#e8dcc0', x + 0.0, H + 0.08, z, { rz: -0.9 }, 5);
  for (const dx of [0.13, -0.2]) k.cyl(0.035, 0.03, 0.05, '#efe6d2', x + dx, H + 0.025, z + 0.14, {}, 7);
  k.cyl(0.1, 0.1, 0.012, '#efe6d2', x + 0.12, H + 0.006, z - 0.12, {}, 10);
  k.cyl(0.07, 0.07, 0.07, '#e8c4a0', x + 0.12, H + 0.045, z - 0.12, { ry: 0.3 }, 3);
  k.ball(0.02, '#c8382a', x + 0.12, H + 0.09, z - 0.12);
  candle(k, x - 0.05, H, z - 0.18);
}

// 椅子：本地座標面向 +z，椅背在 -z
function chair(k) {
  k.box(0.44, 0.05, 0.42, WOOD, 0, 0.43, 0);
  for (const [dx, dz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) k.box(0.04, 0.42, 0.04, DARK_WOOD, dx, 0.21, dz);
  k.box(0.44, 0.5, 0.04, WOOD, 0, 0.7, -0.19);
}

// 長椅：本地座標面向 +z，椅背在 -z，坐面離地 0.45
function parkBench(k, Y) {
  for (let i = 0; i < 3; i++) k.box(1.6, 0.04, 0.12, WOOD, 0, Y + 0.43, -0.14 + i * 0.14);
  for (let i = 0; i < 2; i++) k.box(1.6, 0.1, 0.03, WOOD, 0, Y + 0.65 + i * 0.16, -0.24, { rx: -0.15 });
  for (const x of [-0.7, 0.7]) {
    k.box(0.05, 0.43, 0.05, '#2a2220', x, Y + 0.215, 0.12);
    k.box(0.05, 0.9, 0.05, '#2a2220', x, Y + 0.45, -0.22, { rx: -0.1 });
    k.box(0.05, 0.04, 0.4, '#2a2220', x, Y + 0.6, -0.02);
  }
}

// 涼亭：圓形石台上八根石柱，八角石板屋頂，頂上一顆金球套著斜斜的金環，跟塔樓同一套顏色
// ent 是入口的方向（世界座標 xz 平面上的角度）。入口兩根柱子拉開到左右各 30 度，其餘六根平均排在另一邊；base 是石台埋進土裡的底
function pavilion(k, cx, cz, F, base, ent) {
  const R = PAV.r, o = { ao: false };
  k.cyl(R, R + 0.12, F - base, '#a8988a', cx, (F + base) / 2, cz, { ...o, color2: '#c4b4a2' }, 16);
  k.cyl(R - 0.1, R - 0.1, 0.04, '#cdbd9f', cx, F - 0.01, cz, o, 16);
  k.torus(1.5, 0.025, Math.PI * 2, GOLD, cx, F + 0.02, cz, { ...o, rx: Math.PI / 2 });
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const a = ent + Math.PI / 6 + (i * Math.PI * 5) / 21, x = cx + Math.cos(a) * 2.45, z = cz + Math.sin(a) * 2.45;
    k.box(0.34, 0.14, 0.34, STONE, x, F + 0.07, z, o);
    k.cyl(0.11, 0.13, 2.4, STONE, x, F + 1.34, z, o, 8);
    k.box(0.32, 0.12, 0.32, STONE, x, F + 2.6, z, o);
    cols.push({ x, z });
  }
  k.cyl(2.74, 2.74, 0.06, COPPER, cx, F + 2.69, cz, o, 16);
  k.cyl(2.7, 2.7, 0.24, '#bba88c', cx, F + 2.84, cz, o, 16);
  k.add(new THREE.ConeGeometry(3.15, 1.6, 8), '#4e3e4c', cx, F + 3.76, cz, { ...o, color2: '#7a6478', ry: Math.PI / 8 });
  k.cyl(0.04, 0.06, 0.5, GOLD, cx, F + 4.7, cz, o, 6);
  k.ball(0.14, GOLD, cx, F + 5.0, cz, o);
  k.torus(0.3, 0.02, Math.PI * 2, GOLD, cx, F + 5.0, cz, { ...o, rx: 0.5 });
  // 屋頂下吊一盞小燈
  k.cyl(0.01, 0.01, 0.2, '#2a1a10', cx, F + 2.62, cz, o, 4);
  k.cyl(0.07, 0.07, 0.18, '#ffd890', cx, F + 2.43, cz, { glow: true });
  k.light(cx, F + 2.43, cz, '#ffcf80', 0.3);
  // 入口的三階石階，往下接小徑
  const dx = Math.cos(ent), dz = Math.sin(ent), ry = Math.atan2(dx, dz);
  for (let i = 0; i < 3; i++) {
    const d = R + 0.15 + i * 0.3, top = F - 0.15 * (i + 1);
    k.box(2.2, 0.6, 0.3, '#a8988a', cx + dx * d, top - 0.3, cz + dz * d, { ...o, ry });
  }
  return cols;
}

// 點到折線的最近距離。s 是最近點沿著折線走了多遠，(x, z) 是最近點。結果寫進同一個物件，不另外配置
const _near = { d: 0, s: 0, x: 0, z: 0 };
function nearestOnLine(pts, cum, x, z) {
  _near.d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, L = cum[i] - cum[i - 1];
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (L * L)));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < _near.d) { _near.d = d; _near.s = cum[i - 1] + L * t; _near.x = px; _near.z = pz; }
  }
  return _near;
}

// 樹冠殼：在樹林範圍上方鋪一層 3 公尺一格的網格，高出地面三到六公尺，一團一團起伏，邊緣往下收進土裡
// 每個三角形一個顏色、法線各自朝外，看起來跟山坡上的樹冠一樣是一塊塊的切面。整片林子只有這一個幾何
// 顏色跟著夕陽走：綠色的陰面偏冷、受光面偏暖的橄欖色；開花林是晚霞同一家的玫瑰粉和杏桃色，
// 紫色壓低飽和，貼近遠山的煙紫；金色是琥珀。遠近的真樹也用同一套（見 ROUND、BLOSSOM）
const CANOPY = {
  green: ['#2c4632', '#7f9446'], sage: ['#3a4e38', '#a0a466'], pine: ['#1f3a34', '#47664c'],
  rose: ['#a85a6e', '#e8aab0'], peach: ['#b86a50', '#f0b88a'], mauve: ['#6e557e', '#b898bc'], amber: ['#b07028', '#e8b45c'],
};
// coarse：手機格子放粗、範圍縮小，三角形大約少一半
function canopy(forest, heightAt, mz, coarse) {
  const STEP = coarse ? 4 : 3, HALF = coarse ? 115 : 135, N = Math.round((HALF * 2) / STEP), row = N + 1;
  const px = new Float32Array(row * row), py = new Float32Array(row * row), pz = new Float32Array(row * row), fm = new Float32Array(row * row);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * row + i;
    // 頂點在水平方向抖一點，切面才不會排得整整齊齊
    const x = i * STEP - HALF + (hash(i, j) - 0.5) * 1.4, z = mz + j * STEP - HALF + (hash(j + 7, i - 3) - 0.5) * 1.4;
    const f = forest(x, z);
    // 一團約五公尺寬，每個頂點再各自高低一點，切面才碎
    const lump = vnoise(x * 0.2 + 11, z * 0.2 - 5) * 0.65 + hash(i + 31, j - 17) * 0.35;
    px[k] = x; pz[k] = z; fm[k] = f;
    py[k] = heightAt(x, z) + (f > 0 ? f * (3 + lump * 3.6) - (1 - f) * 1.5 : -2);
  }
  const pos = [], col = [], c = new THREE.Color(), lo = new THREE.Color(), hi = new THREE.Color();
  const tri = (a, b, d) => {
    if (fm[a] <= 0 && fm[b] <= 0 && fm[d] <= 0) return;   // 整個埋在土裡的不要
    const cx = (px[a] + px[b] + px[d]) / 3, cz = (pz[a] + pz[b] + pz[d]) / 3;
    // 開花林一塊約十幾公尺，琥珀色更小更少；綠色裡再分深淺兩種，大片的林子才不會一個顏色
    const kind = vnoise(cx * 0.07 + 3, cz * 0.07 + 9), gold = vnoise(cx * 0.14 - 7, cz * 0.14 + 4);
    const pal = gold > 0.87 ? CANOPY.amber
      : kind > 0.8 ? (vnoise(cx * 0.05 - 2, cz * 0.05 + 6) > 0.5 ? CANOPY.rose : CANOPY.peach)
      : kind < 0.1 ? CANOPY.mauve
      : patch(cx, cz) < 0.3 ? CANOPY.pine
      : vnoise(cx * 0.045 + 8, cz * 0.045 - 1) > 0.55 ? CANOPY.sage : CANOPY.green;
    // 越高的那一團越亮，像頂上照著夕陽；再加一點雜訊，相鄰的切面才分得出來
    const t = Math.min(1, Math.max(0, vnoise(cx * 0.2 + 11, cz * 0.2 - 5) * 0.8 + hash(cx, cz) * 0.35 - 0.1));
    c.copy(lo.set(pal[0])).lerp(hi.set(pal[1]), t);
    // 從上往下看是逆時針，正面朝上
    for (const k of [a, b, d]) { pos.push(px[k], py[k], pz[k]); col.push(c.r, c.g, c.b); }
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * row + i, b = a + 1, d = a + row, e = d + 1;
    // 對角線交錯著切，切面的方向才不會一致
    if ((i + j) % 2) { tri(a, d, b); tri(b, d, e); } else { tri(a, d, e); tri(a, e, b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.userData.noAO = true;
  return geo;
}

function pot(k, x, z, Y, big = false) {
  const s = big ? 1.4 : 1;
  k.cyl(0.2 * s, 0.15 * s, 0.32 * s, '#b5643c', x, Y + 0.16 * s, z, {}, 9);
  k.cyl(0.22 * s, 0.22 * s, 0.05 * s, '#9c5232', x, Y + 0.32 * s, z, {}, 9);
  if (big) {
    // 小檸檬樹
    k.cyl(0.03, 0.04, 0.6, '#5a3a24', x, Y + 0.75, z, {}, 5);
    k.rock(0.38, '#4f7a34', x, Y + 1.2, z, { sy: 0.9 });
    k.rock(0.26, '#5f8a3a', x + 0.2, Y + 1.35, z + 0.1);
    for (const [dx, dy, dz] of [[0.25, 1.1, 0.2], [-0.2, 1.3, 0.25], [0.05, 1.45, -0.3], [-0.3, 1.05, -0.1]]) k.ball(0.045, '#f0d040', x + dx, Y + dy, z + dz);
  } else {
    for (let i = 0; i < 4; i++) k.rock(0.13, i % 2 ? '#5f8f45' : '#4a7a3a', x + Math.cos(i * 1.6) * 0.09, Y + 0.42 + (i % 2) * 0.06, z + Math.sin(i * 1.6) * 0.09);
  }
}

function barrel(k, x, z, Y) {
  k.cyl(0.3, 0.26, 0.8, '#8a5a32', x, Y + 0.4, z, {}, 10);
  for (const y of [0.12, 0.4, 0.68]) k.cyl(0.305, 0.305, 0.04, '#3a3030', x, Y + y, z, {}, 10);
}

function appleCrate(k, x, z, Y, ry) {
  k.box(0.6, 0.32, 0.42, '#a87a4a', x, Y + 0.16, z, { ry });
  for (let i = 0; i < 9; i++) {
    const dx = ((i % 3) - 1) * 0.16, dz = (Math.floor(i / 3) - 1) * 0.11;
    const c = Math.cos(ry), s = Math.sin(ry);
    fruit(k, i % 4 ? 'apple' : 'golden', x + dx * c + dz * s, Y + 0.29, z - dx * s + dz * c);
  }
}

// ---------- 主程式 ----------

export function buildOutdoor(room, h) {
  const z0 = room.zStart, Z = (rel) => z0 - rel;
  const R = rng('outdoor');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const group = room.group;
  const shell = new THREE.Group();     // 房子外殼：玩家在室內時整個藏起來
  const meadowGroup = new THREE.Group();
  group.add(shell, meadowGroup);
  const terrain = makeTerrain(z0);
  const bucket = newBucket();
  const obstacles = room.obstacles;
  const block = (x, z, hw, hd, rot = 0) => obstacles.push({ x, z, hw, hd, rot });

  // ---- 房子外殼 ----
  const facadeMat = new THREE.MeshLambertMaterial({ map: facadeTexture() });
  const vOf = (y) => (y - YB) / (EAVE - YB);
  const zFront = 0.3, depth = zFront - z0, zMid = (zFront + z0) / 2;
  const side = BW - 1;
  shell.add(
    face(facadeMat, side, YB, EAVE, -(1 + side / 2), z0, Math.PI, 4, 0, 1),
    face(facadeMat, side, YB, EAVE, 1 + side / 2, z0, Math.PI, 4, 0, 1),
    face(facadeMat, 2, 2.4, EAVE, 0, z0, Math.PI, 4, vOf(2.4), 1),
    face(facadeMat, depth, YB, EAVE, BW, zMid, Math.PI / 2, 4, 0, 1),
    face(facadeMat, depth, YB, EAVE, -BW, zMid, -Math.PI / 2, 4, 0, 1),
    face(facadeMat, BW * 2, YB, EAVE, 0, zFront, 0, 4, 0, 1),
  );
  const sk = new Kit(R), shellBucket = newBucket();
  // 屋頂：沿 z 的雙斜面，深紫灰石板
  const run = BW + 0.45, rise = RIDGE - EAVE, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  for (const sx of [-1, 1]) {
    sk.box(slope + 0.1, 0.14, depth + 0.8, '#4e3e4c', sx * run / 2, EAVE + rise / 2 + 0.05, zMid, { rz: -sx * ang, color2: '#6a5468' });
  }
  sk.box(0.2, 0.2, depth + 0.85, '#3a2e38', 0, RIDGE + 0.12, zMid);
  // 山牆
  const tri = new THREE.Shape([new THREE.Vector2(-BW, 0), new THREE.Vector2(BW, 0), new THREE.Vector2(0, rise)]);
  for (const zz of [z0, zFront - 0.12]) sk.add(new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }), '#d2bc98', 0, EAVE, zz);
  // 煙囪在赤化的正上方，冒玫瑰色的煙
  const chim = { x: 2.6, z: z0 + 5 };
  sk.box(0.7, 2.2, 0.7, '#8a5a48', chim.x, EAVE + 1.6, chim.z);
  sk.box(0.85, 0.15, 0.85, '#5a3a30', chim.x, EAVE + 2.75, chim.z);
  // 後門兩側的窗和壁燈
  for (const x of [-3.3, 3.3]) {
    const wk = new Kit(R);
    buildWindow(wk, 1.1, 1.3, 0.9);
    wk.emit(shellBucket, x, z0 - 0.01, Math.PI);
  }
  for (const x of [-1.45, 1.45]) {
    sk.box(0.06, 0.25, 0.12, '#2a2220', x, 2.3, z0 - 0.06);
    sk.box(0.16, 0.22, 0.16, '#ffd890', x, 2.15, z0 - 0.14, { glow: true });
    sk.box(0.2, 0.04, 0.2, '#2a2220', x, 2.28, z0 - 0.14);
    sk.light(x, 2.15, z0 - 0.14, '#ffc870', 1.6);
  }
  sk.emit(shellBucket, 0, 0, 0);
  for (const o of h.bucketObjects(shellBucket)) shell.add(o);
  shell.add(smoke(chim.x, EAVE + 2.85, chim.z));
  // 塔樓、玫瑰窗、符文、圓陣、漂浮物這些魔法裝飾在 arcane.js
  const arcane = buildArcane({ shell, group, h, R, z0, Z, d: { BW, EAVE, RIDGE, YB, TW, TD, SW, G: -DROP } });

  // ---- 陽台 ----
  const tile = tileTexture();
  tile.repeat.set(TW, TD / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW * 2, TD), new THREE.MeshLambertMaterial({ map: tile }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, Z(TD / 2));
  group.add(h.tag(floor, 'floor'));
  room.floor = floor;

  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  const sv = (y) => y - YB;   // 石牆貼圖一公尺一格
  const fw = TW - SW - 0.3;
  group.add(
    h.tag(face(stoneMat, fw, YB, 0, -(TW - fw / 2), Z(TD), Math.PI, 2, 0, sv(0)), 'wall'),
    h.tag(face(stoneMat, fw, YB, 0, TW - fw / 2, Z(TD), Math.PI, 2, 0, sv(0)), 'wall'),
    h.tag(face(stoneMat, TD, YB, 0, TW, Z(TD / 2), Math.PI / 2, 2, 0, sv(0)), 'wall'),
    h.tag(face(stoneMat, TD, YB, 0, -TW, Z(TD / 2), -Math.PI / 2, 2, 0, sv(0)), 'wall'),
    h.tag(face(stoneMat, TW - BW, YB, 0, (TW + BW) / 2, z0, 0, 2, 0, sv(0)), 'wall'),
    h.tag(face(stoneMat, TW - BW, YB, 0, -(TW + BW) / 2, z0, 0, 2, 0, sv(0)), 'wall'),
  );

  const k = new Kit(R);
  const vk = new Kit(rng('hills'));   // 山坡上的樹和灌木另用一組亂數，加減樹不會動到陽台和草原的擺設
  // 欄杆：前緣（石階開口兩側）和左右兩邊
  const rail = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    k.box(0.22, 0.1, len, STONE, cx, 0.05, cz, { ry });
    k.box(0.2, 0.08, len, STONE, cx, 0.92, cz, { ry });
    const n = Math.floor(len / 0.3);
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1), x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      k.cyl(0.035, 0.05, 0.4, STONE, x, 0.3, z, {}, 6);
      k.cyl(0.05, 0.035, 0.38, STONE, x, 0.69, z, {}, 6);
    }
  };
  const E = 0.1;   // 欄杆往陽台內縮一點
  rail(-TW + E, Z(TD - E), -SW - 0.3, Z(TD - E));
  rail(SW + 0.3, Z(TD - E), TW - E, Z(TD - E));
  rail(-TW + E, Z(0.4), -TW + E, Z(TD - E));
  rail(TW - E, Z(0.4), TW - E, Z(TD - E));
  // 柱墩：四個角和石階口，石階口的柱上點燈
  for (const [x, rel, lamp] of [[-TW + E, TD - E, false], [TW - E, TD - E, false], [-SW - 0.3, TD - E, true], [SW + 0.3, TD - E, true], [-TW + E, 0.4, false], [TW - E, 0.4, false]]) {
    k.box(0.32, 1.05, 0.32, '#cdbb98', x, 0.525, Z(rel));
    k.box(0.38, 0.08, 0.38, STONE, x, 1.09, Z(rel));
    if (lamp) {
      k.box(0.16, 0.24, 0.16, '#ffd890', x, 1.25, Z(rel), { glow: true });
      k.cone(0.14, 0.12, '#2a2220', x, 1.43, Z(rel));
      k.light(x, 1.25, Z(rel), '#ffc870', 1.5);
    }
  }

  // 石階：每一階的踏面正好落在走路用的斜坡高度上
  const tread = SD / STEPS, riseS = DROP / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const top = -riseS * (i + 0.5), rel = TD + tread * (i + 0.5);
    k.box(SW * 2, top - YB, tread + 0.02, i % 2 ? '#b0a090' : '#a89888', 0, (top + YB) / 2, Z(rel));
    for (const sx of [-1, 1]) k.box(0.3, top + 0.35 - YB, tread + 0.02, '#9a8a7c', sx * (SW + 0.15), (top + 0.35 + YB) / 2, Z(rel));
  }

  // 長桌在左邊，主人（海牛頭人）站在桌頭
  const tableX = -3.6, tableRel = 3.4, tableLen = 3.6;
  banquet(k, tableX, Z(tableRel), tableLen);
  block(tableX, Z(tableRel), 1.05, tableLen / 2 + 0.1);
  const host = { x: tableX, z: Z(tableRel + tableLen / 2 + 0.55) };
  block(host.x, host.z, 0.4, 0.4);

  // 右邊靠欄杆的小圓桌和兩張椅子，面向草原
  const bx = 3.9, bRel = 6.0;
  bistro(k, bx, Z(bRel));
  block(bx, Z(bRel), 0.38, 0.38);
  for (const cx of [bx - 0.85, bx + 0.85]) {
    const ck = new Kit(R);
    chair(ck);
    ck.emit(bucket, cx, Z(bRel), Math.PI);
    block(cx, Z(bRel), 0.24, 0.24);
  }

  // 酒桶、蘋果箱、盆栽
  barrel(k, 4.9, Z(1.0), 0);
  barrel(k, 5.25, Z(1.75), 0);
  appleCrate(k, 4.3, Z(1.1), 0, 0.3);
  block(4.85, Z(1.35), 0.75, 0.75);
  pot(k, -5.3, Z(0.8), 0, true);
  block(-5.3, Z(0.8), 0.32, 0.32);
  pot(k, 5.4, Z(4.0), 0);
  pot(k, -5.4, Z(6.3), 0);

  // 陽台上方的燈串，掛在四角的木柱間
  const wire = [];
  const poles = [[-TW + 0.3, 0.3], [TW - 0.3, 0.3], [-TW + 0.3, TD - 0.35], [TW - 0.3, TD - 0.35]];
  for (const [x, rel] of poles) k.box(0.08, 2.9, 0.08, DARK_WOOD, x, 1.45, Z(rel));
  const bulbs = ['#ffd27a', '#ffb35c', '#fff0c0', '#ff9a6a'];
  const strand = (a, b, sag) => {
    const n = Math.max(6, Math.round(a.distanceTo(b) / 0.5));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      if (prev) wire.push(prev, p);
      prev = p;
      if (i > 0 && i < n) {
        const c = bulbs[i % bulbs.length];
        k.ball(0.04, c, p.x, p.y - 0.05, p.z, { glow: true });
        if (i % 2 === 0) k.light(p.x, p.y - 0.05, p.z, c, 0.5);
      }
    }
  };
  const P = poles.map(([x, rel]) => new THREE.Vector3(x, 2.85, Z(rel)));
  strand(P[0], P[3], 0.6);
  strand(P[1], P[2], 0.6);
  strand(P[0], P[2], 0.45);
  strand(P[1], P[3], 0.45);
  strand(new THREE.Vector3(-1.6, 2.6, z0 - 0.05), P[2].clone().lerp(P[3], 0.35), 0.4);
  strand(new THREE.Vector3(1.6, 2.6, z0 - 0.05), P[3].clone().lerp(P[2], 0.35), 0.4);
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x2a1a10 })));

  // ---- 草原 ----
  const G = -DROP, mz = Z(MEADOW.c);
  const { mesh: ground, heightAt } = groundMesh(terrain, mz);
  ground.layers.enable(REFLECT_LAYER);
  meadowGroup.add(h.tag(ground, 'floor'));
  const inField = (x, z) => (x / MEADOW.rx) ** 2 + ((z0 - z - MEADOW.c) / MEADOW.rz) ** 2 < 1;

  // ---- 左邊山坡的小徑和涼亭 ----
  // 小徑最後一段接到石台邊上的入口。石台頂面比坡上最高的地面再高一點，下坡那側就整個露出來
  const pc = { x: PAV.x, z: Z(PAV.rel) };
  const trailPts = TRAIL.map(([x, rel]) => ({ x, z: Z(rel) }));
  const tail = trailPts[trailPts.length - 1], ent = Math.atan2(tail.z - pc.z, tail.x - pc.x);
  // 入口正前方多一個轉折點，從入口前的空地走進涼亭時一定先對準入口，不會斜切去撞台基的邊
  trailPts.push({ x: pc.x + Math.cos(ent) * (PAV.r + 1.4), z: pc.z + Math.sin(ent) * (PAV.r + 1.4) });
  trailPts.push({ x: pc.x + Math.cos(ent) * PAV.r, z: pc.z + Math.sin(ent) * PAV.r });
  const trailCum = [0];
  for (let i = 1; i < trailPts.length; i++) trailCum.push(trailCum[i - 1] + Math.hypot(trailPts[i].x - trailPts[i - 1].x, trailPts[i].z - trailPts[i - 1].z));
  const trailEnd = trailCum[trailCum.length - 1];
  const entPts = trailPts.slice(-2), entCum = trailCum.slice(-2);   // 入口前最後一段
  const porchS = trailCum[trailCum.length - 2];
  let padTop = -Infinity, padLow = Infinity;
  for (let i = 0; i < 48; i++) for (const r of [0, 1, 2, PAV.r]) {
    const y = heightAt(pc.x + Math.cos(i / 48 * Math.PI * 2) * r, pc.z + Math.sin(i / 48 * Math.PI * 2) * r);
    padTop = Math.max(padTop, y);
    padLow = Math.min(padLow, y);
  }
  const F = padTop + 0.15;
  // 坡頂：涼亭四周 PLAZA 公尺內都走得到。台基比外面地面高不到 0.45 的那幾面（上坡那側）直接跨得上去
  const PLAZA = PAV.r + 6.5;
  const lowRim = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    lowRim.push(F - heightAt(pc.x + Math.cos(a) * (PAV.r + 0.4), pc.z + Math.sin(a) * (PAV.r + 0.4)) < 0.45);
  }
  const rimLow = (dx, dz) => lowRim[Math.round(((Math.atan2(dz, dx) / (Math.PI * 2)) * 72 + 72)) % 72];
  const nearTrail = (x, z, r) => nearestOnLine(trailPts, trailCum, x, z).d < r || Math.hypot(x - pc.x, z - pc.z) < PAV.r + r;
  for (const c of pavilion(k, pc.x, pc.z, F, padLow - 0.4, ent)) block(c.x, c.z, 0.13, 0.13);
  // 面向海的石凳，從涼亭中間那側跨過去坐
  const pavBench = { x: pc.x, z: pc.z - 1.3 };
  k.box(1.8, 0.09, 0.42, '#cdbd9f', pavBench.x, F + 0.405, pavBench.z, { ao: false });
  for (const dx of [-0.6, 0.6]) k.box(0.3, 0.36, 0.34, '#b4a48e', pavBench.x + dx, F + 0.18, pavBench.z, { ao: false });
  block(pavBench.x, pavBench.z, 0.9, 0.21);
  // 踏石：一塊塊鋪到石階下。坡上的石塊頂面對齊腳下，底部往下延伸到最低的那一角，不會懸空
  {
    const TR = rng('trail');   // 小徑另用一組亂數，草原上其他擺設的位置才不會跟著變
    let s = 0.4, i = 1;
    while (s < trailEnd) {
      while (trailCum[i] < s) i++;
      const a = trailPts[i - 1], b = trailPts[i], t = (s - trailCum[i - 1]) / (trailCum[i] - trailCum[i - 1]);
      const ux = (b.x - a.x) / (trailCum[i] - trailCum[i - 1]), uz = (b.z - a.z) / (trailCum[i] - trailCum[i - 1]);
      const x = a.x + (b.x - a.x) * t + (TR() - 0.5) * 0.12, z = a.z + (b.z - a.z) * t + (TR() - 0.5) * 0.12;
      if (Math.hypot(x - pc.x, z - pc.z) > PAV.r + 1.0) {
        const top = heightAt(x, z) + 0.04;
        let low = top;
        for (const [p, q] of [[0.4, 0.28], [-0.4, 0.28], [0.4, -0.28], [-0.4, -0.28]]) low = Math.min(low, heightAt(x - uz * p + ux * q, z + ux * p + uz * q));
        const hgt = top - low + 0.06, w = 0.75 + TR() * 0.15;
        k.box(w, hgt, 0.5 + TR() * 0.08, TR() < 0.5 ? '#7a6e60' : '#6e6356', x, top - hgt / 2, z, { ry: Math.atan2(ux, uz) + (TR() - 0.5) * 0.25, ao: false });
      }
      s += 0.68;
    }
  }

  // 大樹和樹下的長椅，長椅面向夕陽
  const tree = { x: 5.3, z: Z(22.4) };   // 在長椅旁邊，樹冠遮著長椅，不擋坐著往前看的視線
  buildTree(k, tree.x, tree.z, G);
  block(tree.x, tree.z, 0.4, 0.4);
  const benchAt = { x: 7.5, z: Z(23.0) };
  const bk = new Kit(R);
  parkBench(bk, G);
  bk.emit(bucket, benchAt.x, benchAt.z, Math.PI);
  block(benchAt.x, benchAt.z, 0.85, 0.3);

  // 海灣：棧橋、小島的白塔和黑袍訪客的船。棧橋盡頭的方台上一張長椅，面向夕陽
  const harbor = buildHarbor({ group, h, Z, G, SEA_LEVEL, SEA_BED, REFLECT_LAYER });
  for (const b of harbor.blocks) block(b.x, b.z, b.hw, b.hd);
  const jettyBench = { x: JETTY.x, z: Z(JETTY.end - 2.4) };
  const jk = new Kit(R);
  parkBench(jk, G + 0.1);
  jk.emit(bucket, jettyBench.x, jettyBench.z, Math.PI);
  block(jettyBench.x, jettyBench.z, 0.85, 0.3);

  // 野餐墊和籃子
  const pic = { x: -6.5, z: Z(19.4) };
  const stripes = ['#b8423a', '#efe2c8'];
  for (let i = 0; i < 7; i++) k.box(1.9, 0.01, 0.2, stripes[i % 2], pic.x, G + 0.01, pic.z - 0.6 + i * 0.2);
  k.cyl(0.22, 0.18, 0.24, '#a87a40', pic.x + 1.25, G + 0.12, pic.z - 0.2, {}, 9);
  k.torus(0.18, 0.02, Math.PI, '#8a5a30', pic.x + 1.25, G + 0.24, pic.z - 0.2);
  bread(k, pic.x + 0.55, G + 0.02, pic.z + 0.35, 0.8);
  fruit(k, 'apple', pic.x + 0.2, G + 0.02, pic.z + 0.4);
  fruit(k, 'golden', pic.x + 0.32, G + 0.02, pic.z + 0.5);
  k.cyl(0.04, 0.045, 0.22, '#2a4a32', pic.x + 0.75, G + 0.12, pic.z - 0.35, {}, 8);
  goblet(k, pic.x - 0.2, G + 0.01, pic.z + 0.45);
  block(pic.x + 1.25, pic.z - 0.2, 0.25, 0.25);

  // 石階下來的踏腳石，一路分到大樹和野餐墊
  const path = (x1, r1, cx, cr, x2, r2) => {
    const steps = Math.round(Math.hypot(x2 - x1, r2 - r1) / 0.75);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * x1 + 2 * u * t * cx + t * t * x2 + (R() - 0.5) * 0.2;
      const rel = u * u * r1 + 2 * u * t * cr + t * t * r2 + (R() - 0.5) * 0.2;
      const r = 0.24 + R() * 0.1;
      k.cyl(r, r + 0.03, 0.05, R() < 0.5 ? '#a89a88' : '#9a8c7a', x, G + 0.02, Z(rel), { sx: 1 + R() * 0.3, ry: R() * 3 }, 7);
    }
  };
  path(0, TD + SD, 0.5, 15, 7.3, 22.2);
  path(0, TD + SD, -1, 14, -5.6, 18.6);

  // 草原邊上的石頭和灌木。擋到小徑的不擺，但亂數照取，其他的位置才不會跟著變
  const skipK = new Kit(R), skipV = new Kit(vk.R);
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, e = 0.92 + R() * 0.35;
    const x = Math.cos(a) * MEADOW.rx * e, rel = MEADOW.c + Math.sin(a) * MEADOW.rz * e;
    if (rel < TD + 2) continue;
    const y = heightAt(x, Z(rel)), skip = nearTrail(x, Z(rel), 1.4) || onJetty(x, rel, -1.2);
    if (R() < 0.5) {
      const r = 0.25 + R() * 0.35;
      (skip ? skipK : k).rock(r, R() < 0.5 ? '#8a8078' : '#7a7068', x, y + r * 0.4, Z(rel), { sy: 0.7, ry: R() * 3 });
      if (e < 1 && !skip) block(x, Z(rel), r, r);
    } else {
      for (let j = 0; j < 3; j++) R(), R(), R();   // 照舊取亂數，後面的花叢位置才不會跟著變
      bush(skip ? skipV : vk, x, y, Z(rel), 1, 9);
      if (e < 1 && !skip) block(x, Z(rel), 0.5, 0.5);
    }
  }
  // 房子周圍的花叢：台基前緣、陽台兩側、石階口、房子外牆腳下
  const walkable = (x, rel) => (x / MEADOW.rx) ** 2 + ((rel - MEADOW.c) / MEADOW.rz) ** 2 < 1;
  const bed = (x, rel, s) => {
    flowerBed(k, x, G, Z(rel), s);
    if (walkable(x, rel)) block(x, Z(rel), 0.55 * s, 0.55 * s);
  };
  for (let x = -TW - 0.6; x < TW + 0.6; x += 0.9 + R() * 0.5) {
    if (Math.abs(x) < SW + 0.8) continue;
    bed(x, TD + 0.45 + R() * 0.3, 0.9 + R() * 0.4);
    if (R() < 0.6) bed(x + 0.4, TD + 1.3 + R() * 0.5, 0.6 + R() * 0.3);
  }
  for (const sx of [-1, 1]) {
    for (let rel = 0.6; rel < TD + 0.5; rel += 1 + R() * 0.5) bed(sx * (TW + 0.6 + R() * 0.3), rel, 0.9 + R() * 0.4);
    for (let rel = sx < 0 ? -2.4 : -1; rel > -9; rel -= 1.3 + R() * 0.7) bed(sx * (BW + 0.6 + R() * 0.3), rel, 0.8 + R() * 0.4);
    bed(sx * (SW + 1.1), TD + SD + 0.4, 0.8);
    bed(sx * (SW + 1.9), TD + SD - 0.3, 1);
  }
  // 遠處山坡的樹林：林子裡面是一整片起伏的樹冠殼，真樹只種在林緣、小徑兩旁和空地上，坡腳是開花的灌木
  // 全部另外合併成一個網格，海面反射只畫這一個，不用連草原的家具一起畫
  // forest(x, z)：0 是空地，1 是林子深處。樹冠殼的高度和真樹種在哪裡都看這個
  const toMeadow = [pc, { x: -18, z: Z(24) }], toMeadowCum = [0, Math.hypot(toMeadow[1].x - pc.x, toMeadow[1].z - pc.z)];
  const forest = (x, z) => {
    const rel = z0 - z, e = Math.hypot(x / MEADOW.rx, (rel - MEADOW.c) / MEADOW.rz);
    let m = smooth(1.4, 1.75, e);
    if (m <= 0) return 0;
    m *= 1 - smooth(0.22, 0.4, (rel - MEADOW.c) / (MEADOW.rz * e));   // 夕陽那一側留空，坐著才看得到遠方
    m *= 1 - smooth(0.5, 0.6, patch(x, z));                           // 花田
    m *= 1 - smooth(118, 135, Math.hypot(x, z - mz));                 // 再遠就是遠山
    m *= 1 - smooth(0.05, 0.3, smooth(39, 47, rel) * (1 - smooth(34, 80, Math.abs(x))));   // 海灣的岸邊
    if (m <= 0) return 0;
    // 房子、陽台四周和小徑兩旁空出來；涼亭往草原那一面也空著，坐在亭子裡看得到草原和房子
    m *= smooth(6, 11, Math.hypot(Math.max(0, Math.abs(x) - TW), Math.max(0, rel - TD, -depth - rel)));
    m *= smooth(5, 10, nearestOnLine(trailPts, trailCum, x, z).d);   // 近看會穿幫，殼退開一段，中間交給真樹
    m *= smooth(PLAZA + 1.5, PLAZA + 6, Math.hypot(x - pc.x, z - pc.z));   // 坡頂走得到的範圍外再退一點
    m *= smooth(6, 10, nearestOnLine(toMeadow, toMeadowCum, x, z).d);
    return m;
  };
  vk.lit.push(canopy(forest, heightAt, mz, coarse));
  // 鏡頭最低只到樹冠殼頂上，不會退進林子裡。高度取樹冠殼起伏的上限，再留一點空
  const camFloor = (x, z) => {
    const y = groundY(x, z), f = z0 - z > TD ? forest(x, z) : 0;
    // 棧橋上往下看時，鏡頭不會鑽進海裡
    return Math.max(SEA_LEVEL + 0.4, f > 0 ? Math.max(y, heightAt(x, z) + f * (3.8 + vnoise(x * 0.2 + 11, z * 0.2 - 5) * 2.4) + 0.8) : y);
  };
  {
    const VR = vk.R, nTree = coarse ? 70 : 120, nBush = coarse ? 60 : 100;
    const spot = (eMin, eSpan, open) => {
      const a = VR() * Math.PI * 2, e = eMin + VR() * eSpan;
      const x = Math.cos(a) * MEADOW.rx * e, rel = MEADOW.c + Math.sin(a) * MEADOW.rz * e;
      if (rel < TD + 4 && Math.abs(x) < BW + 6) return null;
      if (Math.sin(a) > open) return null;   // 夕陽那一側留空，坐著才看得到遠方
      return { x, z: Z(rel), n: patch(x, Z(rel)) };
    };
    for (let placed = 0, tries = 0; placed < nTree && tries < 6000; tries++) {
      const p = spot(1.45, 4, 0.35);
      if (!p) continue;
      // 林子深處被樹冠殼蓋住，不用種；空地上只零星種幾棵
      const f = forest(p.x, p.z);
      if (f > 0.7 || (f < 0.05 && VR() < 0.8)) continue;
      const roll = VR(), s = 0.8 + VR() * 0.7;
      // 樹林中心多針葉樹，靠近林緣開花的樹變多
      const kind = p.n < 0.33 ? (roll < 0.5 ? 'pine' : roll < 0.88 ? 'round' : 'bloom') : (roll < 0.2 ? 'pine' : roll < 0.55 ? 'round' : 'bloom');
      // 小徑兩旁和涼亭四周空出來。被跳過的樹照樣取亂數，其他樹的位置才不會跟著變
      // 坡頂外圍多清幾公尺，站在涼亭邊上時鏡頭退到後面也不會卡進樹冠
      const clear = nearTrail(p.x, p.z, 2.2) || Math.hypot(p.x - pc.x, p.z - pc.z) < PLAZA + 4;
      farTree(clear ? skipV : vk, kind, p.x, heightAt(p.x, p.z), p.z, s);
      placed++;
    }
    for (let placed = 0, tries = 0; placed < nBush && tries < 4000; tries++) {
      const p = spot(1.2, 1.4, 0.5);
      if (!p || (p.n > 0.3 && p.n < 0.62 && VR() < 0.7)) continue;
      const hidden = nearTrail(p.x, p.z, 1.8) || Math.hypot(p.x - pc.x, p.z - pc.z) < PLAZA || forest(p.x, p.z) > 0.6;
      bush(hidden ? skipV : vk, p.x, heightAt(p.x, p.z), p.z, 0.9 + VR() * 0.7, 3, false);
      placed++;
    }
  }


  // ---- 座位 ----
  const seats = [];
  // heading：坐下時面向的方向（同角色的 heading，atan2(dx, dz)）
  // table：坐在長桌邊，伸手就拿得到點心。(ax, az) 是入座前站的位置，預設在座位後面（跨過長凳）
  const seat = (x, z, lift, heading, table = false, ax, az) => {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    seats.push({ x, z, lift, h: heading, ax: ax ?? x - fx * 0.75, az: az ?? z - fz * 0.75, table });
  };
  for (const dz of [-1.2, 0, 1.2]) {
    seat(tableX - 0.92, Z(tableRel) + dz, 0.45, Math.PI / 2, true);
    seat(tableX + 0.92, Z(tableRel) + dz, 0.45, -Math.PI / 2, true);
  }
  // 椅子從外側入座，有椅背的長椅從前面走過來再轉身坐下
  for (const sx of [-1, 1]) seat(bx + sx * 0.85, Z(bRel), 0.45, Math.PI, false, bx + sx * 1.45, Z(bRel));
  for (const dx of [-0.4, 0.4]) seat(benchAt.x + dx, benchAt.z, 0.45, Math.PI, false, benchAt.x + dx, benchAt.z - 0.75);
  for (const dx of [-0.45, 0.45]) seat(pic.x + dx, pic.z, 0.02, Math.PI);
  // 涼亭的石凳面向海。新座位一律加在最後，舊的座位編號不變，多人同步才對得上
  for (const dx of [-0.45, 0.45]) seat(pavBench.x + dx, pavBench.z, 0.45, Math.PI);
  for (const dx of [-0.4, 0.4]) seat(jettyBench.x + dx, jettyBench.z, 0.45, Math.PI, false, jettyBench.x + dx, jettyBench.z - 0.75);

  // ---- 合併 ----
  k.emit(bucket, 0, 0, 0);
  for (const o of h.bucketObjects(bucket)) group.add(o);
  const hillBucket = newBucket();
  vk.emit(hillBucket, 0, 0, 0);
  for (const o of h.bucketObjects(hillBucket)) { o.layers.enable(REFLECT_LAYER); group.add(o); }
  meadowGroup.add(grass(terrain, z0, coarse ? 10000 : 20000, h.uTime, (x, z) => nearTrail(x, z, 0.6) || onJetty(x, z0 - z, -0.15)));
  meadowGroup.add(seeds(mz, h.uTime));
  meadowGroup.add(h.glowPoints(Array.from({ length: 28 }, () => {
    const a = R() * Math.PI * 2, e = Math.sqrt(R()) * 1.1;
    return { x: Math.cos(a) * MEADOW.rx * e, y: G + 0.3 + R() * 1.1, z: mz - Math.sin(a) * MEADOW.rz * e, color: '#fff3a0', size: 0.12 };
  })));
  const sky = buildSky();
  const far = buildFar(mz, R);
  sky.layers.enable(REFLECT_LAYER);
  far.layers.enable(REFLECT_LAYER);
  group.add(sky, far);
  const lore = buildLore({ group, sky, h, Z, heightAt, SUN_DIR, REFLECT_LAYER });
  const water = buildSea(mz, coarse);
  group.add(water);

  // 樹的影子
  const sh = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), h.shadowMat);
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(tree.x - 0.4, G + 0.015, tree.z - 0.3);
  meadowGroup.add(sh);

  // ---- 地面規則 ----
  room.inside = (x, z, m) => {
    const rel = z0 - z;
    if (rel > m && rel < TD - m && Math.abs(x) < TW - m) return true;
    if (rel > TD - 1 && rel < TD + SD + 0.6 && Math.abs(x) < SW - m) return true;
    const ex = x / (MEADOW.rx - m), ez = (rel - MEADOW.c) / (MEADOW.rz - m);
    if (ex * ex + ez * ez < 1) return true;
    if (Math.hypot(x - pc.x, z - pc.z) < PAV.r - m) return true;
    // 跨進台基的那一段跟石階和兩根柱子之間一樣寬
    if (nearestOnLine(entPts, entCum, x, z).d < 1.3 - m) return true;
    const dp = Math.hypot(x - pc.x, z - pc.z);
    if (dp < PLAZA - m && (dp > PAV.r + m || rimLow(x - pc.x, z - pc.z))) return true;
    if (onJetty(x, rel, m)) return true;
    return nearestOnLine(trailPts, trailCum, x, z).d < TRAIL_W - m;
  };
  // 點在小徑或涼亭旁邊時，拉回小徑上（不然會被拉回草原中心那條線上）
  room.snap = (x, z) => {
    const dp = Math.hypot(x - pc.x, z - pc.z);
    if (dp < PAV.r + 1.5) {
      const k = Math.min(1, (PAV.r - 0.6) / Math.max(dp, 1e-4));
      return { x: pc.x + (x - pc.x) * k, z: pc.z + (z - pc.z) * k };
    }
    const n = nearestOnLine(trailPts, trailCum, x, z);
    return n.d < 3 ? { x: n.x, z: n.z } : null;
  };
  room.anchor = (x, z) => (z0 - z < TD ? { x: 0, z: Z(TD / 2) } : { x: 0, z: mz });
  const groundY = (x, z) => {
    const rel = z0 - z;
    if (rel <= TD) return 0;
    if (Math.abs(x) < SW + 0.35 && rel < TD + SD) return -DROP * (rel - TD) / SD;
    // 涼亭石台上是平的；入口石階那一條接一道斜坡，走上去不會突然跳一格。台基其他幾面就是地面
    const dx = x - pc.x, dz = z - pc.z, dp = Math.hypot(dx, dz);
    if (dp < PAV.r) return F;
    if (onJetty(x, rel)) return G + 0.1;
    const y = heightAt(x, z);
    const side = Math.abs(dx * Math.sin(ent) - dz * Math.cos(ent)), front = dx * Math.cos(ent) + dz * Math.sin(ent);
    const ramp = (front > 0 && side < 1.3) || rimLow(dx, dz);
    return dp < PAV.r + 3 && ramp ? Math.max(y, F - (dp - PAV.r) * 0.5) : y;
  };

  return {
    shell, sky, far, water, seats, host, groundY, camFloor,
    // 看得到海面的範圍：海灣起點往外一直到海的盡頭，左右放寬到整片海。鏡頭沒看到這塊就不用算倒影
    seaBox: new THREE.Box3(new THREE.Vector3(-300, SEA_LEVEL, mz - 300), new THREE.Vector3(300, SEA_LEVEL, Z(39))),
    update(t, target) {
      arcane.update(t);
      harbor.update(t);
      lore.update(t, target);
    },
    table: { x: tableX, z: Z(tableRel), hw: 0.5, hd: tableLen / 2 },
    dock: harbor.dock,
    door: z0,
    // 室內 0、走出後門 1，主程式用來切換光線和霧
    outdoorness: (z) => smooth(z0 + 3, z0 - 2, z),
    inMeadow: (z) => z0 - z > TD + SD * 0.6,
    // 草原上這一點的地名：走到棧橋盡頭的方台是「渡口」，其他地方都是「原野」
    placeAt: (x, z) => (onJetty(x, z0 - z) && z0 - z > JETTY.r1 ? JETTY_NAME : MEADOW_NAME),
    insideShell: (p) => Math.abs(p.x) < BW + 0.3 && p.z > z0 - 0.2 && p.z < zFront + 0.3,
    inField,
    // 小徑：草原外的部分不在尋路格子裡，沿著折線走
    trail: {
      pts: trailPts,
      // 人在草原外的小徑或涼亭上：回傳沿小徑走了多遠，不然是 null
      // 涼亭裡算成比入口再遠一點，進出涼亭的路線才一定會經過入口
      at(x, z) {
        if (inField(x, z)) return null;
        if (Math.hypot(x - pc.x, z - pc.z) < PAV.r + 0.3) return trailEnd + 1;
        const n = nearestOnLine(trailPts, trailCum, x, z);
        // 坡頂算在入口轉折點之前，進出涼亭都會經過那一點
        if (Math.hypot(x - pc.x, z - pc.z) < PLAZA) return Math.min(n.s, porchS - 0.01);
        return n.d < TRAIL_W + 0.3 ? n.s : null;
      },
      // 路線上有一段直線穿過台基時，沿著台基外圍繞過去
      around(sx, sz, path) {
        const out = [], Rr = PAV.r + 0.75;
        let ax = sx, az = sz;
        for (const q of path) {
          const da = Math.hypot(ax - pc.x, az - pc.z), db = Math.hypot(q.x - pc.x, q.z - pc.z);
          const vx = q.x - ax, vz = q.z - az, L2 = vx * vx + vz * vz || 1e-6;
          const t = Math.min(1, Math.max(0, ((pc.x - ax) * vx + (pc.z - az) * vz) / L2));
          const close = Math.hypot(ax + vx * t - pc.x, az + vz * t - pc.z);
          if (da > PAV.r + 0.3 && db > PAV.r + 0.3 && close < PAV.r + 0.5) {
            const ta = Math.atan2(az - pc.z, ax - pc.x);
            let dt = Math.atan2(q.z - pc.z, q.x - pc.x) - ta;
            dt = Math.atan2(Math.sin(dt), Math.cos(dt));
            const n = Math.ceil(Math.abs(dt) / 0.4);
            for (let i = 0; i <= n; i++) out.push({ x: pc.x + Math.cos(ta + (dt * i) / n) * Rr, z: pc.z + Math.sin(ta + (dt * i) / n) * Rr });
          }
          out.push(q);
          ax = q.x; az = q.z;
        }
        return out;
      },
      // 從 a 走到 b 會經過的轉折點，包含 b 那一端的點
      between(a, b) {
        const out = [];
        if (a < b) { for (let i = 0; i < trailPts.length; i++) if (trailCum[i] > a && trailCum[i] <= b) out.push(trailPts[i]); }
        else for (let i = trailPts.length - 1; i >= 0; i--) if (trailCum[i] < a && trailCum[i] >= b) out.push(trailPts[i]);
        return out;
      },
    },
  };
}

// 海：three.js 範例的 Water（MIT）。反射要多畫一次場景，所以解析度壓低，人不在戶外時由 world 關掉
function buildSea(mz, coarse) {
  const normals = new THREE.TextureLoader().load('assets/waternormals.jpg');
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  const water = new Water(new THREE.PlaneGeometry(600, 600), {
    textureWidth: coarse ? 256 : 512,
    textureHeight: coarse ? 256 : 512,
    waterNormals: normals,
    sunDirection: SUN_DIR.clone(),
    sunColor: 0xffc890,
    waterColor: 0x2a4a58,
    distortionScale: 2.2,
    size: 2,
    fog: true,
    layer: REFLECT_LAYER,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, SEA_LEVEL, mz);
  water.visible = false;
  return water;
}

// 大地：一整片，中間平、外圍慢慢隆起
function groundMesh(terrain, mz) {
  const S = 340, N = 85;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, mz);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const near = new THREE.Color('#5c7a36'), far = new THREE.Color('#84904a'), sand = new THREE.Color('#c9a878'), c = new THREE.Color();
  const forest = new THREE.Color('#3a5430'), fields = FIELDS.map((f) => new THREE.Color(f)), fc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrain(x, z);
    pos.setY(i, y);
    const d = Math.hypot(x / MEADOW.rx, (z - mz) / MEADOW.rz);
    c.copy(near).lerp(far, Math.min(1, Math.max(0, (d - 1) / 3)));
    c.offsetHSL(0, 0, (Math.sin(x * 0.7) * Math.cos(z * 0.5)) * 0.03);
    // 山坡上的樹林和花田。花田的顏色用更大塊的雜訊挑，一整塊大致同色
    const hill = smooth(1.25, 1.7, d), n = patch(x, z);
    c.lerp(forest, hill * smooth(0.42, 0.3, n) * 0.85);
    fc.copy(fields[Math.min(fields.length - 1, Math.floor(vnoise(x * 0.018 - 4, z * 0.018 + 2) * fields.length * 1.3) % fields.length)]);
    c.lerp(fc, hill * smooth(0.58, 0.7, n) * (0.2 + 0.25 * vnoise(x * 0.2, z * 0.2)));
    c.lerp(sand, smooth(-DROP - 0.3, -DROP - 1.1, y));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // 畫出來的地面每格 S / N 公尺，山坡上跟 terrain() 會差到半公尺。腳下的高度照網格的三角形內插，才會踩在看得到的地面上
  // PlaneGeometry 每格沿著 (ix, iz + 1)–(ix + 1, iz) 那條對角線切成兩個三角形
  const step = S / N, row = N + 1;
  const heightAt = (x, z) => {
    const fx = (x + S / 2) / step, fz = (z - mz + S / 2) / step;
    const ix = Math.min(N - 1, Math.max(0, Math.floor(fx))), iz = Math.min(N - 1, Math.max(0, Math.floor(fz)));
    const u = fx - ix, v = fz - iz, y = (i, j) => pos.getY((iz + j) * row + ix + i);
    return u + v <= 1
      ? y(0, 0) + (y(1, 0) - y(0, 0)) * u + (y(0, 1) - y(0, 0)) * v
      : y(1, 1) + (y(0, 1) - y(1, 1)) * (1 - u) + (y(1, 0) - y(1, 1)) * (1 - v);
  };
  return { mesh: new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })), heightAt };
}

// 草葉：每片一個三角形，整片草合成一個網格。風在頂點著色器裡算，越靠近葉尖擺越大
function grass(terrain, z0, count, uTime, skip) {
  const pos = [], col = [], bend = [];
  const base = new THREE.Color('#46652c'), c = new THREE.Color();
  const tips = ['#a8b850', '#c4bc62', '#8eaa44', '#d0b060', '#b0c058'];
  const flowers = ['#f4f0e0', '#f2c84a', '#e88aa8', '#b08ad8', '#f08a5a'];
  const mz = z0 - MEADOW.c;
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    // 四分之三種在走得到的範圍裡，其餘往外圍稀疏地鋪
    const a = Math.random() * Math.PI * 2, e = Math.random() < 0.75 ? Math.sqrt(Math.random()) * 1.05 : 1.05 + Math.random() * 0.55;
    const x = Math.cos(a) * MEADOW.rx * e, z = mz + Math.sin(a) * MEADOW.rz * e, rel = z0 - z;
    if (rel < TD + 0.3 && Math.abs(x) < TW + 0.3) continue;
    if (rel < TD + SD + 0.3 && Math.abs(x) < SW + 0.5) continue;
    if (rel < 0 && Math.abs(x) < BW + 0.3) continue;
    if (skip(x, z)) continue;
    const y = terrain(x, z) - 0.02;
    const ry = Math.random() * Math.PI, w = 0.035 + Math.random() * 0.03;
    const hgt = (e > 1 ? 0.3 : 0.12) + Math.random() * (e > 1 ? 0.35 : 0.2);
    const lx = Math.cos(ry) * w / 2, lz = Math.sin(ry) * w / 2;
    const lean = (Math.random() - 0.5) * 0.15;
    pos.push(x - lx, y, z - lz, x + lx, y, z + lz, x + lean, y + hgt, z + lean * 0.5);
    c.set(tips[placed % tips.length]);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, c.r, c.g, c.b);
    bend.push(0, 0, 1);
    // 每十幾片草夾一朵小花
    if (placed % 14 === 0) {
      c.set(flowers[(placed / 14) % flowers.length | 0]);
      const fy = y + hgt, s = 0.045;
      pos.push(x + lean - s, fy, z + lean * 0.5, x + lean + s, fy, z + lean * 0.5, x + lean, fy + s * 1.4, z + lean * 0.5 + s * 0.3);
      for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
      bend.push(1, 1, 1);
    }
    placed++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('bend', new THREE.Float32BufferAttribute(bend, 1));
  // 法線一律朝上，草地亮度才一致，不會因為葉片方向忽明忽暗
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float bend;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gust = sin(uTime * 0.6 + position.x * 0.08 - position.z * 0.12) * 0.6 + 0.4;
        float sway = sin(uTime * 1.9 + position.x * 0.45 + position.z * 0.3) * 0.5 + gust;
        float b = bend * bend;
        transformed.x += sway * 0.16 * b;
        transformed.z += sway * 0.06 * b;
        transformed.y -= abs(sway) * 0.04 * b;`);
    // 雙面材質的背面會把法線翻成朝下，草就一半亮一半黑。這裡不翻
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  // 風最多把葉尖吹開 0.16，包圍球放大一點就不會被誤裁，背對草原時整片草不用畫
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 0.3;
  return new THREE.Mesh(geo, mat);
}

// 隨風飄的蒲公英種子
function seeds(mz, uTime) {
  const n = 90, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 40, -DROP + 0.3 + Math.random() * 3.5, mz + (Math.random() - 0.5) * 30], i * 3);
    ph[i] = Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: 26 * Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      uniform float uTime; uniform float uSize;
      attribute float aPhase; varying float vA;
      void main() {
        vec3 p = position;
        p.x = mod(p.x + uTime * (0.5 + 0.3 * fract(aPhase)) + 20.0, 40.0) - 20.0;
        p.y += sin(uTime * 0.7 + aPhase * 5.0) * 0.4;
        p.z += sin(uTime * 0.45 + aPhase * 3.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(20.0, 15.0, abs(p.x)) * 0.8;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(1.0, 0.96, 0.88, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// 煙囪的煙：一顆顆往上飄、越飄越大越淡
function smoke(x, y, z) {
  const n = 14, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([x, y, z], i * 3); ph[i] = i / n; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: 260 * Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      uniform float uTime; uniform float uSize;
      attribute float aPhase; varying float vA; varying vec3 vC;
      // 煉金四階段：黑化、白化、黃化、赤化，每段二十五秒，換色時慢慢混過去
      vec3 stage(float i) {
        return i < 0.5 ? vec3(0.34, 0.29, 0.40) : i < 1.5 ? vec3(0.93, 0.93, 0.96) : i < 2.5 ? vec3(1.0, 0.82, 0.45) : vec3(0.95, 0.55, 0.6);
      }
      void main() {
        float t = fract(uTime * 0.07 + aPhase);
        // 用這顆煙冒出來的時間決定顏色，換階段時整道煙由下往上變色
        float s = mod((uTime - t / 0.07) / 25.0, 4.0), i = floor(s);
        vC = mix(stage(i), stage(mod(i + 1.0, 4.0)), smoothstep(0.75, 1.0, s - i));
        vec3 p = position + vec3(t * 2.5 + sin(aPhase * 40.0) * 0.2, t * 6.0, -t * 0.8);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.3 + t) / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = (1.0 - t) * smoothstep(0.0, 0.1, t) * 0.4;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(vC, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.onBeforeRender = () => { mat.uniforms.uTime.value = performance.now() / 1000; };
  return p;
}

// 天空：黃昏的漸層和太陽，跟著鏡頭走，永遠在最遠處
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: `
      varying vec3 vD;
      void main() {
        vD = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSun; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 horizon = vec3(0.89, 0.643, 0.494);
        vec3 low = vec3(0.96, 0.74, 0.56);
        vec3 mid = vec3(0.80, 0.56, 0.62);
        vec3 high = vec3(0.40, 0.40, 0.60);
        vec3 top = vec3(0.17, 0.20, 0.36);
        vec3 c = horizon;
        if (h > 0.0) {
          c = mix(horizon, low, smoothstep(0.0, 0.08, h));
          c = mix(c, mid, smoothstep(0.08, 0.25, h));
          c = mix(c, high, smoothstep(0.25, 0.55, h));
          c = mix(c, top, smoothstep(0.55, 1.0, h));
        }
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.75, 0.45) * pow(s, 8.0) * 0.35 + vec3(1.0, 0.9, 0.7) * pow(s, 90.0) * 0.6;
        c = mix(c, vec3(1.0, 0.97, 0.86), smoothstep(0.9988, 0.9993, s));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

// 遠山：三圈山脊，越遠越淡越接近天邊的顏色。面向夕陽的山背光偏紫，背對夕陽的山頂映著晚霞
// 每圈是一條圍成環的帶子，上緣照雜訊起伏，底部沒入海平面以下
// 另外回傳 crest：最遠那圈在夕陽右手邊的一個山頂，比前面兩圈都高、背後只有天空，古石圈就立在那裡
function ridges(mz) {
  const N = 320, pos = [], col = [];
  const sun = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
  const haze = new THREE.Color(HORIZON), glow = new THREE.Color('#e4a0a0'), shade = new THREE.Color('#6a5884');
  const foot = new THREE.Color('#c08a90'), top = new THREE.Color(), c = new THREE.Color();
  const LAYERS = [
    { dist: 150, base: 5, amp: 34, gap: 0.6, mist: 0.12, seed: 3 },
    { dist: 188, base: 9, amp: 46, gap: 0.72, mist: 0.36, seed: 11 },
    { dist: 228, base: 14, amp: 60, gap: 0.82, mist: 0.58, seed: 23 },
  ];
  const ROWS = [0, 0.55, 1];
  let crest = null;
  for (const L of LAYERS) {
    const hs = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let h = 0, w = 0.5, f = 1.4;
      for (let o = 0; o < 5; o++, w *= 0.5, f *= 2.1) h += w * (1 - Math.abs(vnoise(Math.cos(a) * f + L.seed, Math.sin(a) * f - L.seed) * 2 - 1));
      // 夕陽正前方山脊沉進海裡，像岬角一路斜進水中，太陽底下留一段乾淨的海平線。近的那層先入海，遠的層一層層往太陽那頭多伸一點
      // 只壓扁不沉下去的話，會剩一片平頂的薄板貼在海平線上，兩頭還收成尖角
      const facing = Math.cos(a) * sun.x + Math.sin(a) * sun.y, sink = smooth(L.gap, 0.97, facing);
      hs.push(Math.max(-5, (L.base + L.amp * Math.pow(h, 1.7)) * (1 - sink) - 12 * sink));
    }
    L.hs = hs;
    const vert = (i, t) => {
      const a = (i / N) * Math.PI * 2, d = L.dist - (1 - t) * 22;
      const facing = Math.cos(a) * sun.x + Math.sin(a) * sun.y;
      // 坡往左右哪邊傾，就亮一點或暗一點，山脊才有立體感
      const slope = (hs[Math.min(N, i + 1)] - hs[Math.max(0, i - 1)]) / (2 * Math.PI * 2 * L.dist / N);
      top.copy(glow).lerp(shade, smooth(-0.3, 0.8, facing)).multiplyScalar(1 + Math.max(-0.2, Math.min(0.2, slope * 0.5)));
      c.copy(foot).lerp(top, Math.pow(t, 0.7)).lerp(haze, L.mist + (1 - t) * 0.35 * (1 - L.mist));
      pos.push(Math.cos(a) * d, SEA_LEVEL - 6 + (hs[i] + 6) * t, mz + Math.sin(a) * d);
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < ROWS.length - 1; r++) {
        const t0 = ROWS[r], t1 = ROWS[r + 1];
        vert(i, t0); vert(i + 1, t0); vert(i + 1, t1);
        vert(i, t0); vert(i + 1, t1); vert(i, t1);
      }
    }
  }
  // 石圈的位置：夕陽右手邊，最遠那圈的山頂從草原看過去要比前面兩圈高出一截，石頭才襯在天空上
  const [L0, L1, L2] = LAYERS;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, facing = Math.cos(a) * sun.x + Math.sin(a) * sun.y, side = Math.cos(a) * -sun.y + Math.sin(a) * sun.x;
    if (side <= 0 || facing < 0.45 || facing > 0.9) continue;
    const front = Math.max(L0.hs[i] / L0.dist, L1.hs[i] / L1.dist);
    if (L2.hs[i] / L2.dist > front + 0.03 && (!crest || L2.hs[i] > crest.h)) crest = { i, h: L2.hs[i], d: L2.dist, hs: L2.hs, step: (Math.PI * 2) / N };
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return { geo, crest };
}

// 遠方雪峰：從草原望向海灣，在右手邊遠山的後面，比遠山高出一大截。房子後面的丘陵太高，放那裡看不到尖頂一圈圈往上收，每一圈的頂點各自抖一點，切面才不整齊
// 面向夕陽的那幾面映著晚霞的粉，背光的偏紫；雪線以上是雪，以下是岩石，越往山腳越淡進天邊的顏色
function snowPeak(mz) {
  const N = 9, H = 80, RAD = 44, HF = [0, 0.3, 0.58, 0.82], RF = [1, 0.72, 0.45, 0.2];
  const ang = 2.48, dist = 260, cx = Math.sin(ang) * dist, cz = mz + Math.cos(ang) * dist, y0 = SEA_LEVEL - 6;
  const ring = HF.map((hf, k) => Array.from({ length: N }, (_, i) => {
    const a = ((i + (hash(i, k) - 0.5) * 0.3) / N) * Math.PI * 2, r = RAD * RF[k] * (0.82 + hash(k + 5, i) * 0.36);
    return new THREE.Vector3(cx + Math.cos(a) * r, y0 + (H + 6) * hf, cz + Math.sin(a) * r);
  }));
  const apex = new THREE.Vector3(cx + 3, y0 + H + 6, cz - 2);
  const sun = SUN_DIR.clone().normalize(), haze = new THREE.Color(HORIZON);
  const SNOW = [new THREE.Color('#a89cc4'), new THREE.Color('#ffd8d0')], ROCK = [new THREE.Color('#54466c'), new THREE.Color('#b07a80')];
  const pos = [], col = [], c = new THREE.Color(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), mid = new THREE.Vector3();
  const tri = (a, b, d) => {
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2).normalize();
    mid.copy(a).add(b).add(d).divideScalar(3);
    if (n.x * (mid.x - cx) + n.z * (mid.z - cz) < 0) n.negate();
    // 正對我們的這面背著夕陽，但晚霞從整片天空照下來，側面的切面也映著粉色
    const hf = (mid.y - y0) / (H + 6), lit = smooth(-0.7, 0.5, n.dot(sun));
    const pal = hf > 0.5 + (hash(mid.x, mid.z) - 0.5) * 0.14 ? SNOW : ROCK;
    c.copy(pal[0]).lerp(pal[1], lit).lerp(haze, 0.3 + (1 - hf) * 0.3);
    for (const v of [a, b, d]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
  };
  for (let k = 0; k < HF.length; k++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (k === HF.length - 1) { tri(ring[k][i], ring[k][j], apex); continue; }
    tri(ring[k][i], ring[k][j], ring[k + 1][j]);
    tri(ring[k][i], ring[k + 1][j], ring[k + 1][i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// 古石圈：山頂上一圈高高的立石，有的歪了，有一塊倒在地上。遠遠看只是山脊上一排細細的齒
// 遠山只是一圈直立的帶子，石頭得沿著帶子的上緣排，才會站在山頂上；石圈前後的深度壓扁到一公尺內
function stoneRing(k, crest, mz) {
  const R = rng('stones'), { hs, step, d } = crest, haze = new THREE.Color(HORIZON);
  const top = (u) => { const j = Math.floor(u), f = u - j, n = hs.length - 1; return hs[Math.max(0, Math.min(n, j))] * (1 - f) + hs[Math.max(0, Math.min(n, j + 1))] * f; };
  for (let s = 0; s < 9; s++) {
    const th = (s / 9) * Math.PI * 2 + R() * 0.2, off = Math.sin(th) * 7, dd = d + Math.cos(th) * 0.8;
    const u = crest.i + off / d / step, a = u * step, y = SEA_LEVEL + top(u), hgt = 3 + R() * 1.6;
    const x = Math.cos(a) * dd, z = mz + Math.sin(a) * dd, c = new THREE.Color(R() < 0.5 ? '#4a3e58' : '#564866').lerp(haze, 0.4);
    if (s === 5) k.box(1.4, 0.8, hgt, c, x, y + 0.1, z, { ry: -a + 0.6, ao: false });
    else k.box(1.4, hgt + 1.5, 0.8, c, x, y + hgt / 2 - 0.75, z, { ry: -a + Math.PI / 2, rz: (R() - 0.5) * 0.3, ao: false });
  }
}

// 遠山和雲：不受霧影響，自己帶空氣感的顏色
function buildFar(mz, R) {
  const k = new Kit(R), { geo: ridgeGeo, crest } = ridges(mz);
  k.lit.push(ridgeGeo, snowPeak(mz));
  if (crest) stoneRing(k, crest, mz);
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, dist = 120 + R() * 60, y = 30 + R() * 30;
    const cx = Math.cos(a) * dist, cz = mz + Math.sin(a) * dist;
    for (let j = 0; j < 4; j++) {
      const r = 5 + R() * 6;
      k.add(new THREE.IcosahedronGeometry(r, 1), '#b88aa8', cx + (j - 1.5) * 6 + R() * 3, y + R() * 3, cz + (R() - 0.5) * 6, { sy: 0.35, color2: '#ffd2b4' });
    }
  }
  const geo = mergeBucket(k.lit, false);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

// 一叢花：底下幾團綠葉，上面點滿同色系的花，偶爾插幾支高的穗狀花
const BLOOMS = [
  ['#e8507a', '#ff9ab8', '#f4f0e6'], ['#f2a03a', '#f6d84a', '#e8603a'], ['#9a5ad8', '#c49aee', '#f4f0e6'],
  ['#4a6ae0', '#7ad0e8', '#f4f0e6'], ['#e83a4a', '#f6d84a', '#ff9ab8'], ['#f6d84a', '#f4f0e6', '#f2a03a'],
  ['#d04aa8', '#9a5ad8', '#ff9ab8'],
];
function flowerBed(k, x, y, z, s = 1) {
  const R = k.R, pal = BLOOMS[Math.floor(R() * BLOOMS.length)];
  const mounds = [];
  for (let i = 0; i < 3; i++) {
    const r = (0.26 + R() * 0.16) * s, mx = x + (R() - 0.5) * 0.6 * s, mz = z + (R() - 0.5) * 0.6 * s;
    k.rock(r, R() < 0.5 ? '#3f6a2c' : '#557a34', mx, y + r * 0.55, mz, { sy: 0.75, ry: R() * 3, color2: '#6a8a3a' });
    mounds.push({ mx, mz, r });
  }
  for (let i = 0; i < 16; i++) {
    const m = mounds[i % 3], a = R() * Math.PI * 2, e = Math.sqrt(R()) * 0.85;
    const bx = m.mx + Math.cos(a) * m.r * e, bz = m.mz + Math.sin(a) * m.r * e;
    const by = y + m.r * 0.55 + Math.sqrt(1 - e * e) * m.r * 0.75;
    const c = pal[R() < 0.6 ? 0 : R() < 0.6 ? 1 : 2];
    k.rock((0.055 + R() * 0.035) * s, c, bx, by + 0.02, bz, { sy: 0.7, ry: R() * 3 });
  }
  // 穗狀花：一根莖，往上一顆比一顆小
  for (let i = 0, n = R() < 0.5 ? 2 + Math.floor(R() * 3) : 0; i < n; i++) {
    const sx = x + (R() - 0.5) * 0.7 * s, sz = z + (R() - 0.5) * 0.7 * s, hgt = (0.55 + R() * 0.35) * s, c = pal[Math.floor(R() * 2)];
    k.cyl(0.012, 0.016, hgt, '#4a6a2c', sx, y + hgt / 2, sz, {}, 4);
    for (let j = 0; j < 5; j++) k.rock(0.05 * s * (1 - j * 0.13), c, sx, y + hgt * (0.55 + j * 0.1), sz, { sy: 0.8, ry: R() * 3 });
  }
}

// 開花的灌木：兩三團葉子，頂上透一點花色，表面點 dots 朵花。遠處的（ao: false）花朵點大一點才看得到
const FAR_BLOOMS = [['#e8507a', '#ff9ab8', '#f4f0e6'], ['#f4f0e6', '#ffd8e0', '#f6d84a'], ['#9a5ad8', '#c49aee', '#f4f0e6'], ['#f2a03a', '#f6d84a', '#f4f0e6'], ['#d04aa8', '#ff9ab8', '#f4f0e6']];
function bush(k, x, y, z, s = 1, dots = 0, ao = true) {
  const R = k.R, list = ao ? BLOOMS : FAR_BLOOMS, pal = list[Math.floor(R() * list.length)];
  const leaf = new THREE.Color(R() < 0.5 ? '#3a6028' : '#4a7030'), tip = leaf.clone().lerp(new THREE.Color(pal[0]), 0.35);
  const mounds = [];
  for (let i = 0, n = 2 + (R() < 0.5); i < n; i++) {
    const r = (0.3 + R() * 0.16) * s, mx = x + (R() - 0.5) * 0.7 * s, mz = z + (R() - 0.5) * 0.7 * s;
    k.rock(r, leaf, mx, y + r * 0.5, mz, { sy: 0.78, ry: R() * 3, color2: tip, ao });
    mounds.push({ mx, mz, r });
  }
  // 遠處的花看不出形狀，用八面體就好，面數不到一半
  const bloom = (ao ? 0.06 : 0.11) * s;
  for (let i = 0; i < dots; i++) {
    const m = mounds[i % mounds.length], a = R() * Math.PI * 2, e = Math.sqrt(R()) * 0.8;
    const by = y + m.r * 0.5 + Math.sqrt(1 - e * e) * m.r * 0.78, r = bloom * (1 + R() * 0.5);
    const geo = ao ? new THREE.IcosahedronGeometry(r, 0) : new THREE.OctahedronGeometry(r, 0);
    k.add(geo, pal[R() < 0.6 ? 0 : 1 + Math.floor(R() * 2)], m.mx + Math.cos(a) * m.r * e, by, m.mz + Math.sin(a) * m.r * e, { sy: 0.7, ry: R() * 3, ao });
  }
}

// 遠處的樹：pine 三層錐、round 幾團圓樹冠、bloom 開滿花的樹。顏色由下往上變亮，像頂上照著夕陽
const ROUND = [CANOPY.green, CANOPY.sage, ['#2e4a30', '#6e8a44']];
const BLOSSOM = [CANOPY.rose, ['#d0bcb4', '#fff0e4'], CANOPY.peach, CANOPY.mauve, CANOPY.amber];
function farTree(k, kind, x, y, z, s) {
  const R = k.R, o = { ao: false };
  if (kind === 'pine') {
    k.cyl(0.1 * s, 0.15 * s, 0.9 * s, '#3e2c20', x, y + 0.45 * s, z, o, 5);
    for (let i = 0; i < 3; i++) {
      const r = (1 - i * 0.24) * s, hy = y + (1.2 + i * 0.85) * s;
      k.cone(r, 1.7 * r, CANOPY.pine[0], x, hy, z, { ...o, color2: CANOPY.pine[1], ry: R() * 3 });
    }
    return;
  }
  const pal = kind === 'bloom' ? BLOSSOM[Math.floor(R() * BLOSSOM.length)] : ROUND[Math.floor(R() * ROUND.length)];
  k.cyl(0.09 * s, 0.15 * s, 1.5 * s, '#4a3424', x, y + 0.75 * s, z, o, 5);
  for (let i = 0, n = 3 + (R() < 0.5); i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R(), d = i ? 0.55 * s : 0, r = (0.75 + R() * 0.3) * s;
    k.rock(r, pal[0], x + Math.cos(a) * d, y + (1.9 + (i ? 0 : 0.5) + R() * 0.3) * s, z + Math.sin(a) * d, { ...o, sy: 0.85, ry: R() * 3, color2: pal[1] });
  }
}

// 大樹：幾段樹幹加一團團樹冠
function buildTree(k, x, z, G) {
  k.cyl(0.28, 0.42, 2.6, '#5a3a24', x, G + 1.3, z, {}, 7);
  for (const [a, tilt, len] of [[0.3, 0.7, 1.8], [2.4, 0.6, 1.6], [4.2, 0.75, 1.7]]) {
    const dx = Math.cos(a) * Math.sin(tilt) * len / 2, dz = Math.sin(a) * Math.sin(tilt) * len / 2;
    k.cyl(0.1, 0.18, len, '#5a3a24', x + dx, G + 2.6 + Math.cos(tilt) * len / 2, z + dz, { ry: -a + Math.PI / 2, rz: -tilt }, 6);
  }
  // 每團樹冠底下暗、頂上亮，像頂上照著夕陽
  const R = k.R, greens = ['#4a6a2a', '#5a7a30', '#6a8a3a', '#7a8a34', '#b89a48'], tops = ['#8aa040', '#9aac46', '#a8b04a', '#b4ac48', '#d8b860'];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, r = R() * 2.2;
    k.rock(0.9 + R() * 0.7, greens[i % greens.length], x + Math.cos(a) * r, G + 3.6 + R() * 1.6 - r * 0.25, z + Math.sin(a) * r, { sy: 0.8, ry: R() * 3, color2: tops[i % tops.length] });
  }
}
