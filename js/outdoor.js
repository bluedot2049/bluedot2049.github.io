// 戶外：赤化的後門出去是陽台「宴」，石階往下到草原。
// 房子和陽台蓋在石砌台基上，草原比室內低 DROP 公尺。整個畫廊只有這裡的地面不在高度 0。
// 座標：rel 是離後門的距離，往草原方向為正，世界座標 z = z0 - rel。
import * as THREE from 'three';
import { Kit, newBucket, mergeBucket, rng, buildWindow } from './props.js';

export const DROP = 1.6;
const TW = 6, TD = 7;                  // 陽台半寬、深度
const SW = 1.2, SD = 3, STEPS = 8;     // 石階半寬、水平長度、階數
const MEADOW = { c: 22.5, rx: 18, rz: 13 };   // 走得到的草原是橢圓，c 是中心離門口多遠
const BW = 5.6, EAVE = 4.2, RIDGE = 6.0;      // 房子外殼的半寬、屋簷高、屋脊高
const YB = -DROP - 0.2;                // 台基埋進土裡的底部
export const SUN_DIR = new THREE.Vector3(-0.35, 0.07, -1).normalize();
export const HORIZON = 0xe3a47e;

export const OUTDOOR_ROOM = { id: 'outdoor', name: '宴', subtitle: 'Convivium', type: 'outdoor', paintings: [] };
export const MEADOW_NAME = { name: '原野', subtitle: 'Prima Materia' };

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

// 草原的地形：走得到的範圍是平的，往外慢慢隆起成丘陵，房子附近保持平地
function makeTerrain(z0) {
  const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
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
    return -DROP + Math.min(h, 40);
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
  sk.add(new THREE.CircleGeometry(0.35, 12), '#ffcf8a', 0, EAVE + 0.75, z0 - 0.02, { ry: Math.PI, glow: true });
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
  const ground = groundMesh(terrain, mz);
  meadowGroup.add(h.tag(ground, 'floor'));

  // 大樹和樹下的長椅，長椅面向夕陽
  const tree = { x: 5.3, z: Z(22.4) };   // 在長椅旁邊，樹冠遮著長椅，不擋坐著往前看的視線
  buildTree(k, tree.x, tree.z, G);
  block(tree.x, tree.z, 0.4, 0.4);
  const benchAt = { x: 7.5, z: Z(23.0) };
  const bk = new Kit(R);
  parkBench(bk, G);
  bk.emit(bucket, benchAt.x, benchAt.z, Math.PI);
  block(benchAt.x, benchAt.z, 0.85, 0.3);

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

  // 草原邊上的石頭和灌木
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, e = 0.92 + R() * 0.35;
    const x = Math.cos(a) * MEADOW.rx * e, rel = MEADOW.c + Math.sin(a) * MEADOW.rz * e;
    if (rel < TD + 2) continue;
    const y = terrain(x, Z(rel));
    if (R() < 0.5) {
      const r = 0.25 + R() * 0.35;
      k.rock(r, R() < 0.5 ? '#8a8078' : '#7a7068', x, y + r * 0.4, Z(rel), { sy: 0.7, ry: R() * 3 });
      if (e < 1) block(x, Z(rel), r, r);
    } else {
      for (let j = 0; j < 3; j++) k.rock(0.35 + R() * 0.2, j % 2 ? '#4f7034' : '#5f803a', x + (R() - 0.5) * 0.6, y + 0.3, Z(rel) + (R() - 0.5) * 0.6);
      if (e < 1) block(x, Z(rel), 0.5, 0.5);
    }
  }
  // 台基腳下的灌木
  for (let x = -TW + 0.4; x < TW; x += 1.1 + R() * 0.6) {
    if (Math.abs(x) < SW + 0.7) continue;
    k.rock(0.4 + R() * 0.2, R() < 0.5 ? '#4a6a30' : '#5a7a38', x, G + 0.3, Z(TD + 0.35), { sy: 0.8 });
  }
  // 遠處山坡上的樹
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, e = 1.7 + R() * 2.2;
    const x = Math.cos(a) * MEADOW.rx * e, rel = MEADOW.c + Math.sin(a) * MEADOW.rz * e;
    if (rel < TD + 4 && Math.abs(x) < BW + 6) continue;
    if (Math.sin(a) > 0.35) continue;   // 夕陽那一側留空，坐著才看得到遠方
    const y = terrain(x, Z(rel)), s = 0.8 + R() * 0.8;
    k.cyl(0.1 * s, 0.14 * s, 0.8 * s, '#4a3424', x, y + 0.4 * s, Z(rel), {}, 5);
    k.cone(0.9 * s, 2.6 * s, R() < 0.5 ? '#3a5a3a' : '#4a6640', x, y + 2.0 * s, Z(rel));
  }

  // ---- 座位 ----
  const seats = [];
  // heading：坐下時面向的方向（同角色的 heading，atan2(dx, dz)）
  // table：坐在長桌邊，伸手就拿得到點心
  const seat = (x, z, lift, heading, table = false) => {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    seats.push({ x, z, lift, h: heading, ax: x - fx * 0.75, az: z - fz * 0.75, table });
  };
  for (const dz of [-1.2, 0, 1.2]) {
    seat(tableX - 0.92, Z(tableRel) + dz, 0.45, Math.PI / 2, true);
    seat(tableX + 0.92, Z(tableRel) + dz, 0.45, -Math.PI / 2, true);
  }
  for (const cx of [bx - 0.85, bx + 0.85]) seat(cx, Z(bRel), 0.45, Math.PI);
  for (const dx of [-0.4, 0.4]) seat(benchAt.x + dx, benchAt.z, 0.45, Math.PI);
  for (const dx of [-0.45, 0.45]) seat(pic.x + dx, pic.z, 0.02, Math.PI);

  // ---- 合併 ----
  k.emit(bucket, 0, 0, 0);
  for (const o of h.bucketObjects(bucket)) group.add(o);
  meadowGroup.add(grass(terrain, z0, coarse ? 10000 : 20000, h.uTime));
  meadowGroup.add(seeds(mz, h.uTime));
  meadowGroup.add(h.glowPoints(Array.from({ length: 28 }, () => {
    const a = R() * Math.PI * 2, e = Math.sqrt(R()) * 1.1;
    return { x: Math.cos(a) * MEADOW.rx * e, y: G + 0.3 + R() * 1.1, z: mz - Math.sin(a) * MEADOW.rz * e, color: '#fff3a0', size: 0.12 };
  })));
  const sky = buildSky();
  const far = buildFar(mz, R);
  group.add(sky, far);

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
    return ex * ex + ez * ez < 1;
  };
  room.anchor = (x, z) => (z0 - z < TD ? { x: 0, z: Z(TD / 2) } : { x: 0, z: mz });
  const groundY = (x, z) => {
    const rel = z0 - z;
    if (rel <= TD) return 0;
    if (Math.abs(x) < SW + 0.35 && rel < TD + SD) return -DROP * (rel - TD) / SD;
    return -DROP;
  };

  return {
    shell, sky, far, seats, host, groundY,
    table: { x: tableX, z: Z(tableRel), hw: 0.5, hd: tableLen / 2 },
    door: z0,
    // 室內 0、走出後門 1，主程式用來切換光線和霧
    outdoorness: (z) => smooth(z0 + 3, z0 - 2, z),
    inMeadow: (z) => z0 - z > TD + SD * 0.6,
    insideShell: (p) => Math.abs(p.x) < BW + 0.3 && p.z > z0 - 0.2 && p.z < zFront + 0.3,
  };
}

// 大地：一整片，中間平、外圍慢慢隆起
function groundMesh(terrain, mz) {
  const S = 340, N = 85;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, mz);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const near = new THREE.Color('#5c7a36'), far = new THREE.Color('#9a9450'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = terrain(x, z);
    pos.setY(i, y);
    const d = Math.hypot(x / MEADOW.rx, (z - mz) / MEADOW.rz);
    c.copy(near).lerp(far, Math.min(1, Math.max(0, (d - 1) / 3)));
    c.offsetHSL(0, 0, (Math.sin(x * 0.7) * Math.cos(z * 0.5)) * 0.03);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// 草葉：每片一個三角形，整片草合成一個網格。風在頂點著色器裡算，越靠近葉尖擺越大
function grass(terrain, z0, count, uTime) {
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
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
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
      attribute float aPhase; varying float vA;
      void main() {
        float t = fract(uTime * 0.07 + aPhase);
        vec3 p = position + vec3(t * 2.5 + sin(aPhase * 40.0) * 0.2, t * 6.0, -t * 0.8);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.3 + t) / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = (1.0 - t) * smoothstep(0.0, 0.1, t) * 0.4;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(0.93, 0.78, 0.78, a);
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

// 遠山和雲：不受霧影響，自己帶空氣感的顏色
function buildFar(mz, R) {
  const k = new Kit(R);
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 16 : 20, dist = ring ? 205 : 160;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.2;
      const r = 30 + R() * 30, hgt = 18 + R() * (ring ? 30 : 22);
      const c = ring ? '#c8949e' : '#9a7290', c2 = ring ? '#e0aea0' : '#b8869a';
      k.add(new THREE.ConeGeometry(r, hgt, 6), c, Math.cos(a) * dist, -DROP - 2 + hgt / 2, mz + Math.sin(a) * dist, { color2: c2, ry: R() * 3, sz: 0.6 + R() * 0.5 });
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, dist = 120 + R() * 60, y = 30 + R() * 30;
    const cx = Math.cos(a) * dist, cz = mz + Math.sin(a) * dist;
    for (let j = 0; j < 4; j++) {
      const r = 5 + R() * 6;
      k.add(new THREE.IcosahedronGeometry(r, 1), '#b88aa8', cx + (j - 1.5) * 6 + R() * 3, y + R() * 3, cz + (R() - 0.5) * 6, { sy: 0.35, color2: '#ffd2b4' });
    }
  }
  const geo = mergeBucket(k.lit, false);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

// 大樹：幾段樹幹加一團團樹冠
function buildTree(k, x, z, G) {
  k.cyl(0.28, 0.42, 2.6, '#5a3a24', x, G + 1.3, z, {}, 7);
  for (const [a, tilt, len] of [[0.3, 0.7, 1.8], [2.4, 0.6, 1.6], [4.2, 0.75, 1.7]]) {
    const dx = Math.cos(a) * Math.sin(tilt) * len / 2, dz = Math.sin(a) * Math.sin(tilt) * len / 2;
    k.cyl(0.1, 0.18, len, '#5a3a24', x + dx, G + 2.6 + Math.cos(tilt) * len / 2, z + dz, { ry: -a + Math.PI / 2, rz: -tilt }, 6);
  }
  const R = k.R, greens = ['#4a6a2a', '#5a7a30', '#6a8a3a', '#7a8a34', '#b89a48'];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2, r = R() * 2.2;
    k.rock(0.9 + R() * 0.7, greens[i % greens.length], x + Math.cos(a) * r, G + 3.6 + R() * 1.6 - r * 0.25, z + Math.sin(a) * r, { sy: 0.8, ry: R() * 3 });
  }
}
