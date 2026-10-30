// 海市：海的另一邊，蓋在山坡上的夜市小鎮。長長的棧橋接到碼頭，石階轉幾個彎一層一層往上爬：
// 牌樓、下街、燈巷、工坊街、星台，最上面是山頂暗暗的遠眺台。
// 房子是木頭和白牆的東洋町屋，瓦頂翹角，屋簷下一排紅燈籠；街上擺著小吃推車，冒著煙和蒸氣。
// 座標：海在南邊（+z），山往北（-z）升高。整片山坡是一張起伏的地形，石台、石階、房子蓋在上面。
// 每個 x、z 只有一層地面，沒有天橋，尋路格子才能維持平面的
import * as THREE from 'three';
import { Kit, rng, newBucket } from './props.js';
import { bucketObjects, glowPoints, uTime } from './world.js';
import { makePathfinder } from './pathgrid.js';
import { hull, towerPhase, bump } from './harbor.js';
import { addRoof, roofGeo, Signs } from './eaves.js';
import { yatai } from './yatai.js';
import { mist, smoke, pools, ripples } from './haze.js';

const SEA = -0.6;
const RISE = 0.2;          // 石階每階高度
const MARGIN = 0.32;       // 角色半徑

// 走得到的地方：一塊一塊的長方形。y 是平地的高度。
// 石階寫 lo、hi 和 dir：n 往北爬（高的那頭在 z0），w 往西爬（高的那頭在 x0），e 往東爬（高的那頭在 x1）
// 相鄰的兩塊只在石階的上下口接起來，高度一定對得上
const AREAS = [
  { id: 'pier', x0: -1.2, x1: 1.2, z0: 12, z1: 30, y: 0 },
  { id: 'quay', x0: -8, x1: 8, z0: 5, z1: 12, y: 0 },
  { id: 'scala', x0: -1.4, x1: 1.4, z0: -1, z1: 5, lo: 0, hi: 2.4, dir: 'n' },
  { id: 'gate', x0: -4.5, x1: 4.5, z0: -4.5, z1: -1, y: 2.4 },
  { id: 'sB', x0: -12, x1: -4.5, z0: -4.2, z1: -1.8, lo: 2.4, hi: 4.8, dir: 'w' },
  { id: 'bend1', x0: -15, x1: -12, z0: -6, z1: -1, y: 4.8 },
  { id: 'sC', x0: -14.6, x1: -12.4, z0: -10, z1: -6, lo: 4.8, hi: 6.8, dir: 'n' },
  { id: 'lower', x0: -15, x1: 13, z0: -15, z1: -10, y: 6.8 },
  { id: 'sD', x0: 5, x1: 7.4, z0: -20, z1: -15, lo: 6.8, hi: 9.2, dir: 'n' },
  { id: 'sD2', x0: -11, x1: -8.8, z0: -20, z1: -15, lo: 6.8, hi: 9.2, dir: 'n' },
  { id: 'lantern', x0: -13, x1: 11, z0: -25, z1: -20, y: 9.2 },
  { id: 'sE', x0: 8, x1: 10.4, z0: -30, z1: -25, lo: 9.2, hi: 11.6, dir: 'n' },
  { id: 'upper', x0: -7, x1: 13, z0: -35, z1: -30, y: 11.6 },
  { id: 'sF', x0: -6, x1: -3.8, z0: -40, z1: -35, lo: 11.6, hi: 14, dir: 'n' },
  { id: 'specula', x0: -12, x1: 0, z0: -45, z1: -40, y: 14 },
  { id: 'sG', x0: -19, x1: -12, z0: -43.4, z1: -41.4, lo: 14, hi: 16.4, dir: 'w' },
  { id: 'bend2', x0: -22.5, x1: -19, z0: -45, z1: -40, y: 16.4 },
  { id: 'sH', x0: -22, x1: -19.6, z0: -52, z1: -45, lo: 16.4, hi: 19.2, dir: 'n' },
  { id: 'summit', x0: -27, x1: -15, z0: -59, z1: -52, y: 19.2 },
];
for (const a of AREAS) if (a.y == null) a.n = Math.round((a.hi - a.lo) / RISE);
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// 走進去時報的地名。碼頭不報，剛下船時畫面上已經是「海市」
const PLACES = {
  scala: { name: '梯', subtitle: 'Scala' },
  lower: { name: '下街', subtitle: 'Via Inferior' },
  lantern: { name: '燈巷', subtitle: 'Via Lucernarum' },
  upper: { name: '工坊街', subtitle: 'Via Fabrorum' },
  specula: { name: '星台', subtitle: 'Specula' },
  summit: { name: '遠眺台', subtitle: 'Prospectus' },
};

// 店：沿著各層街道靠山的那一側。FRONT 是那一排房子正面的 z，櫃台和攤販都在正面前面
// 攤販的樣子和台詞在 vendors.js，用 id 對起來
const FRONT = { quay: 5, lower: -15.1, lantern: -25.1, upper: -35.1, specula: -45.1 };
export const SHOPS = [
  { id: 'post', at: 'quay', x: -4.6, awning: '#a8322a', goods: 'post', sign: '信' },
  { id: 'fish', at: 'quay', x: 4.6, awning: '#2e5a7a', goods: 'fish', sign: '鮮魚' },
  { id: 'pigment', at: 'lower', x: -13, awning: '#2e4a9a', goods: 'pigment', sign: '顏料' },
  { id: 'bakery', at: 'lower', x: -6.5, awning: '#c8803a', goods: 'bread', sign: '麵包' },
  { id: 'candle', at: 'lower', x: -2.4, awning: '#7a2a4a', goods: 'candle', sign: '蠟燭' },
  { id: 'tea', at: 'lower', x: 2, awning: '#4a7a4a', goods: 'tea', sign: '茶' },
  { id: 'tailor', at: 'lower', x: 10.4, awning: '#8a4a8a', goods: 'tailor', sign: '裁縫' },
  { id: 'junk', at: 'lantern', x: -10, awning: '#6a5a3a', goods: 'junk', sign: '古物' },
  { id: 'herbs', at: 'lantern', x: -4, awning: '#3a6a4a', goods: 'herbs', sign: '藥草' },
  { id: 'lanterns', at: 'lantern', x: 3, awning: '#a8322a', goods: 'lanterns', sign: '燈籠' },
  { id: 'glass', at: 'upper', x: 3, awning: '#3a6a8a', goods: 'glass', sign: '玻璃' },
  { id: 'frames', at: 'upper', x: 9, awning: '#8a6a2a', goods: 'frames', sign: '木工' },
  { id: 'maps', at: 'specula', x: -6, awning: '#2a3a6a', goods: 'maps', sign: '海圖' },
];
// 小吃推車：擺在街上沒有店的那一側，碼頭上是左右兩邊。ry 是客人那一邊朝的方向（0 朝南）
export const CARTS = [
  { id: 'squid', at: 'quay', x: -6.5, z: 8.2, ry: Math.PI / 2, food: 'squid', color: '#a8322a', text: '烤魷魚' },
  { id: 'oden', at: 'quay', x: 6.5, z: 8.2, ry: -Math.PI / 2, food: 'oden', color: '#2a3a6a', text: '關東煮' },
  { id: 'takoyaki', at: 'lower', x: -9.4, z: -11.2, ry: Math.PI, food: 'takoyaki', color: '#c8602a', text: '章魚燒' },
  { id: 'baozi', at: 'lower', x: 6.6, z: -11.2, ry: Math.PI, food: 'baozi', color: '#3a5a3a', text: '包子' },
  { id: 'tanghulu', at: 'lantern', x: -1, z: -21.2, ry: Math.PI, food: 'tanghulu', color: '#b82a3a', text: '糖葫蘆' },
  { id: 'potato', at: 'upper', x: -2, z: -31.2, ry: Math.PI, food: 'potato', color: '#6a3a5a', text: '烤番薯' },
];

// 白牆、木板牆、瓦。瓦大多是深灰，少數是紅瓦和銅綠
const PLASTER = ['#ece2cc', '#e2d6bc', '#f0e8d8', '#d8cab0', '#e6d2b8'];
const TIMBER = ['#5a3826', '#4a2e20', '#6a4430', '#3e2a20', '#563a2c', '#704a32'];
const TILES = ['#33373f', '#2c3038', '#3a3c46', '#2a2c32', '#2e3a3a', '#6a3428', '#3a4a48'];
const NOREN = ['#2a3a6a', '#7a2a2a', '#2a4a3a', '#5a3a6a', '#8a5a2a', '#1e2a4a'];
const WOOD = '#4a3428', DARK = '#2a201c', BEAM = '#3a2a22', STONE = '#6e655e', PAVE = '#8e8478', CREAM = '#efe4c8';
const LAMP = '#ff4a2a', LAMP_HI = '#ffa060', WARM = '#ffc070', PAPER = '#ffd8a0', GOLD = '#d4a54a';
// 屋簷下掛的招牌：沒有櫃台的房子也有，夜市整條街都是字
const HOUSE_SIGNS = ['湯', '酒', '宿', '茶屋', '麵', '甘味', '飯', '餅', '燒', '團子', '粥', '冰', '豆花', '當'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const shade = (c, l) => new THREE.Color(c).offsetHSL(0, 0, l).getStyle();

// ---------- 地形 ----------
// 沿著 z 的高度一段一段接起來，每一段都壓在那裡的石台和石階底下，不會從路面冒出來
const TK = [[40, -3.2], [12, -1.6], [5, -0.9], [-1, 1.3], [-4.5, 1.8], [-6, 3.4], [-10, 5.6], [-15, 6.1], [-20, 8.3], [-25, 8.5],
  [-30, 10.7], [-35, 10.9], [-40, 13], [-45, 13.3], [-52, 18.3], [-59, 18.5], [-68, 23], [-140, 66]];
function tz(z) {
  if (z >= TK[0][0]) return TK[0][1];
  for (let i = 1; i < TK.length; i++) {
    const [z1, y1] = TK[i];
    if (z >= z1) { const [z0, y0] = TK[i - 1]; return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0); }
  }
  return TK[TK.length - 1][1];
}
// 鎮子在一道山谷裡，兩側的山往外升高；鎮子範圍裡的起伏只往下，不會高過路面
const TOWN_X0 = -31, TOWN_X1 = 16;
function terrain(x, z) {
  const out = Math.max(0, x - TOWN_X1) + Math.max(0, TOWN_X0 - x);
  const small = Math.sin(x * 0.23 + z * 0.11) * 0.2 + Math.sin(x * 0.07 - z * 0.17) * 0.18 - 0.4;
  const big = (Math.sin(x * 0.05 + z * 0.03) * 3 + Math.sin(x * 0.11 - z * 0.07) * 1.5) * smooth(0, 12, out);
  return tz(z) + out * 0.34 + small + big;
}

function heightIn(a, x, z) {
  if (a.y != null) return a.y;
  const t = a.dir === 'n' ? (a.z1 - z) / (a.z1 - a.z0) : a.dir === 'w' ? (a.x1 - x) / (a.x1 - a.x0) : (x - a.x0) / (a.x1 - a.x0);
  const u = Math.min(a.n, Math.max(0, t * a.n)), i = Math.floor(u);
  // 碰撞上是斜坡，但每一階的前緣才往上抬，走起來是一階一階踩上去
  return i >= a.n ? a.hi : a.lo + RISE * (i + smooth(0, 0.35, u - i));
}
const areaAt = (x, z) => AREAS.find((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);

function terrainGeometry() {
  const pos = [], S = 2;
  for (let x = -100; x < 90; x += S) {
    for (let z = 32; z > -140; z -= S) {
      const v = [[x, z], [x + S, z], [x + S, z - S], [x, z - S]].map(([px, pz]) => [px, terrain(px, pz), pz]);
      pos.push(...v[0], ...v[2], ...v[1], ...v[0], ...v[3], ...v[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// 藍調時刻的天空：地平線和霧同色，往上漸深，西邊殘留一點夕陽的暖色
function skyDome(bg) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLow: { value: new THREE.Color(bg) }, uTop: { value: new THREE.Color('#121735') }, uWarm: { value: new THREE.Color('#c27c7c') } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uLow; uniform vec3 uTop; uniform vec3 uWarm;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uLow, uTop, smoothstep(0.0, 0.55, h));
        float w = pow(max(0.0, dot(normalize(vDir.xz), normalize(vec2(-1.0, 0.35)))), 3.0) * (1.0 - smoothstep(-0.02, 0.22, h));
        gl_FragColor = vec4(mix(c, uWarm, w * 0.55), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

// 牌樓上的字
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d4a0';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#6a3a1a';
  g.lineWidth = 8;
  g.strokeRect(8, 8, 240, 112);
  g.fillStyle = '#4a1e10';
  g.font = '600 72px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHaishi(scene, { coarse = false } = {}) {
  const R = rng('haishi'), k = new Kit(R), bucket = newBucket();
  const group = new THREE.Group(), obstacles = [], solids = [];
  const solid = (x0, x1, z0, z1, top, ground = false) => solids.push({ x0, x1, z0, z1, top, ground });
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  // 一塊範圍底下最低的地形，石台和石階從那裡往上砌
  const groundUnder = (x0, x1, z0, z1) => Math.min(terrain(x0, z0), terrain(x1, z0), terrain(x0, z1), terrain(x1, z1), terrain((x0 + x1) / 2, (z0 + z1) / 2)) - 0.4;

  // ---------- 燈籠、欄杆 ----------
  // 燈籠、灌木、小花數量多，都用二十面的多面體：燈籠不打光看不出稜角，灌木本來就是有稜角的畫風
  const lantern = (kk, x, y, z, s = 1, color = LAMP, hi = LAMP_HI) => {
    kk.cyl(0.07 * s, 0.09 * s, 0.06 * s, DARK, x, y + 0.27 * s, z, {}, 6);
    kk.rock(0.22 * s, color, x, y, z, { glow: true, sy: 1.25, color2: hi });
    kk.cyl(0.08 * s, 0.06 * s, 0.05 * s, DARK, x, y - 0.29 * s, z, {}, 6);
    kk.light(x, y, z, '#ff8a50', 0.9 * s);
  };
  // 一串燈籠：從 a 拉到 b，中間微微下垂。大多是紅的，偶爾夾一顆黃的、白的
  const STRING = [[LAMP, LAMP_HI], [LAMP, LAMP_HI], ['#ffa020', '#ffe080'], [LAMP, LAMP_HI], ['#f0d8b0', '#fff4e0']];
  const string = (ax, az, bx, bz, y, step = 2.2) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    k.box(len, 0.02, 0.02, DARK, (ax + bx) / 2, y + 0.3, (az + bz) / 2, { ry: -Math.atan2(bz - az, bx - ax) });
    for (let i = 1; i < n; i++) {
      const t = i / n, [c, hi] = STRING[Math.floor(R() * STRING.length)];
      lantern(k, ax + (bx - ax) * t, y - Math.sin(t * Math.PI) * 0.35, az + (bz - az) * t, 0.85, c, hi);
    }
  };
  // 欄杆：從 a 到 b，地面高 y。stone 是遠眺台的矮石牆
  const rail = (ax, az, bx, bz, y, stone = false) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.2) return;
    const ry = -Math.atan2(bz - az, bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    if (stone) {
      k.box(len, 0.75, 0.32, '#4a4650', cx, y + 0.37, cz, { ry, color2: '#5a5660' });
      return;
    }
    k.box(len, 0.07, 0.08, WOOD, cx, y + 0.92, cz, { ry });
    k.box(len, 0.04, 0.05, WOOD, cx, y + 0.45, cz, { ry });
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i <= n; i++) k.box(0.09, 0.95, 0.09, DARK, ax + ((bx - ax) * i) / n, y + 0.47, az + ((bz - az) * i) / n);
  };

  // ---------- 房子 ----------
  // 東洋的町屋：一樓深色木板牆，店面整片拉開掛暖簾；二樓白牆配深色柱樑或整片木板，開格子窗，有的伸出木陽台。
  // 一二樓之間一道披簷，最上面是翹角的瓦頂，屋簷下掛一排紅燈籠。
  // 每間各用一組零件，蓋在原點、正面朝 +z，再轉到 rot 放到 x、z。ground 是腳下的地形，石砌地基一路埋進坡裡
  // back：後面那條街比較高時，在那一層的背面也開門開窗（九份的房子常常前後各接一條街）
  const signs = new Signs();
  // 格子窗：亮著的紙窗，前面幾根細木條。ry 是窗面朝的方向
  const lattice = (kk, x, y, z, w, h, lit = R() < 0.8, ry = 0) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    kk.plane(w, h, lit ? PAPER : '#3a3038', x, y, z, { glow: true, color2: lit ? '#ffeccc' : '#4a4048', ry });
    const n = Math.max(2, Math.round(w / 0.22));
    for (let i = 1; i < n; i++) { const [px, pz] = at(-w / 2 + (w * i) / n, 0.015); kk.box(0.025, h, 0.02, BEAM, px, y, pz, { ry }); }
    const [px, pz] = at(0, 0.02);
    kk.box(w, 0.025, 0.02, BEAM, px, y, pz, { ry });
    kk.box(w + 0.12, 0.07, 0.05, BEAM, px, y - h / 2 - 0.03, pz, { ry });
    kk.box(w + 0.12, 0.07, 0.05, BEAM, px, y + h / 2 + 0.03, pz, { ry });
  };
  // 暖簾：門口上緣垂下的幾片布，y 是上緣
  const noren = (kk, x, y, z, w, color, len = 0.6) => {
    const n = Math.max(2, Math.round(w / 0.45)), sw = w / n;
    kk.cyl(0.02, 0.02, w + 0.1, DARK, x, y + 0.02, z, { rz: Math.PI / 2 }, 4);
    for (let i = 0; i < n; i++) kk.box(sw - 0.03, len, 0.02, i % 2 ? color : shade(color, 0.04), x - w / 2 + sw * (i + 0.5), y - len / 2, z, { color2: shade(color, -0.06) });
    kk.add(new THREE.CircleGeometry(Math.min(0.13, sw * 0.4), 10), CREAM, x, y - len * 0.45, z + 0.015, { ao: false });
  };
  const house = (o) => {
    const hk = new Kit(R), { w, d, y0, h } = o, rot = o.rot || 0;
    const ground = o.ground ?? y0, tile = pick(TILES), wood = pick(TIMBER);
    // 招牌在世界座標裡：把這間房子自己的座標轉出去
    const cr = Math.cos(rot), sr = Math.sin(rot), world = (lx, lz) => [o.x + lx * cr + lz * sr, o.z - lx * sr + lz * cr];
    if (y0 - ground > 0.05) hk.box(w + 0.1, y0 - ground + 0.4, d + 0.1, '#5e5852', 0, (y0 + ground - 0.4) / 2, 0, { color2: '#7a7068' });
    const h1 = Math.min(h, 2.6), fz = d / 2 + 0.02;
    hk.box(w, h1, d, wood, 0, y0 + h1 / 2, 0, { color2: shade(wood, 0.05) });
    for (const sx of [-1, 1]) hk.box(0.16, h1, 0.16, DARK, sx * (w / 2 - 0.05), y0 + h1 / 2, d / 2 - 0.04);
    hk.box(w + 0.04, 0.14, 0.1, DARK, 0, y0 + h1 - 0.07, fz);
    if (o.shop) {
      // 店面整片拉開，裡面亮著，上緣掛暖簾
      const sw = w - 0.5;
      hk.plane(sw, 1.9, '#ffb060', 0, y0 + 1.0, fz, { glow: true, color2: '#ffd8a0' });
      noren(hk, 0, y0 + 1.95, fz + 0.03, Math.min(sw, 2.4), pick(NOREN), 0.5);
      hk.pool(0, y0, fz + 1.2, Math.min(3, w * 0.7), '#ffa860', 0.3);
    } else {
      // 住家：一扇格子門、一扇格子窗，有的門口掛短暖簾
      const lit = R() < 0.75;
      lattice(hk, -w * 0.22, y0 + 0.95, fz, 0.8, 1.8, lit);
      if (w > 2.2) lattice(hk, w * 0.22, y0 + 1.3, fz, 0.8, 0.7);
      if (R() < 0.5) noren(hk, -w * 0.22, y0 + 1.82, fz + 0.03, 0.86, pick(NOREN), 0.45);
      if (lit) hk.pool(-w * 0.22, y0, fz + 0.9, 1.4, '#ffb070', 0.22);
    }
    // 招牌：門口那根柱子外面掛一塊直招牌，兩面都有字
    if (R() < (o.shop ? 0.7 : 0.4)) {
      const text = pick(HOUSE_SIGNS), sx = (R() < 0.5 ? -1 : 1) * (w / 2 + 0.22), paper = R() < 0.35;
      const style = paper ? { bg: '#f0e0c0', fg: '#8a1e14' } : { bg: '#2a1a12', fg: '#e8c878' };
      hk.box(0.5, 0.05, 0.05, DARK, sx * 0.94, y0 + 2.35, fz + 0.1);
      const sh = 0.36 * Math.min(3, [...text].length), [gx, gz] = world(sx, fz + 0.1);
      for (const side of [1, -1]) signs.add(text, gx + cr * 0.012 * side, y0 + 2.3 - sh / 2, gz - sr * 0.012 * side, 0.36, rot + (side * Math.PI) / 2, style);
    }
    let top = y0 + h1, wall2 = wood, lampZ = fz + 0.35;
    if (h > h1 + 0.4) {
      const h2 = h - h1, plaster = R() < 0.6, fz2 = d / 2 + 0.025;
      wall2 = plaster ? pick(PLASTER) : pick(TIMBER);
      hk.box(w, h2, d, wall2, 0, top + h2 / 2, 0, { color2: shade(wall2, plaster ? -0.04 : 0.04) });
      if (plaster) {
        const n = Math.max(2, Math.round(w / 1.3));
        for (let i = 0; i <= n; i++) hk.box(0.1, h2, 0.05, BEAM, -w / 2 + (w * i) / n, top + h2 / 2, fz2);
        hk.box(w, 0.1, 0.05, BEAM, 0, top + h2 - 0.05, fz2);
      }
      const n = Math.max(1, Math.floor(w / 1.3)), rows = h2 > 2.8 ? 2 : 1;
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
        lattice(hk, -w / 2 + (w * (i + 0.5)) / n, top + (h2 * (r + 0.55)) / rows, fz2, Math.min(0.9, w / n - 0.4), Math.min(0.95, h2 / rows - 0.6));
      }
      if (R() < 0.35) {
        // 木陽台：伸出來一條走廊，欄杆一根一根，柱子撐到屋簷
        hk.box(w + 0.2, 0.08, 0.7, WOOD, 0, top + 0.04, fz2 + 0.35);
        hk.box(w + 0.2, 0.06, 0.06, WOOD, 0, top + 0.82, fz2 + 0.68);
        const m = Math.max(3, Math.round(w / 0.32));
        for (let i = 0; i <= m; i++) hk.box(0.04, 0.78, 0.04, DARK, -w / 2 - 0.1 + ((w + 0.2) * i) / m, top + 0.43, fz2 + 0.68);
        for (const sx of [-1, 1]) hk.box(0.08, h2, 0.08, DARK, sx * (w / 2 + 0.06), top + h2 / 2, fz2 + 0.66);
        lampZ = fz2 + 0.45;
      } else {
        // 一二樓之間的披簷，住家的披簷下也掛兩盞
        addRoof(hk, 0, top - 0.42, fz, w + 0.5, 1.8, 0.42, { front: true, tile, lift: 0.12, curl: 0, seg: coarse ? 0.6 : 1 });
        if (!o.shop) for (const sx of [-0.3, 0.3]) lantern(hk, sx * w, top - 0.95, fz + 0.62, 0.7);
      }
      top += h2;
    }
    // 瓦頂：大多屋脊沿著街；有的山牆朝街，山牆上開一扇小格子窗；有的四面都是斜的
    const along = R() < 0.7, hip = R() < 0.3;
    const RW = (along ? w : d) + 0.8, RD = (along ? d : w) + 0.9, RH = RD * (0.28 + R() * 0.14);
    addRoof(hk, 0, top, 0, RW, RD, RH, { ry: along ? 0 : Math.PI / 2, tile, end: wall2, lift: 0.28 + R() * 0.14, ridge: hip ? Math.max(0.3, (RW - RD) / 2 + 0.4) : RW / 2, seg: coarse ? 0.6 : 1 });
    if (!along && !hip) lattice(hk, 0, top + RH * 0.32, d / 2 + 0.42, 0.5, 0.45, true);
    // 屋簷下一排紅燈籠
    if (R() < 0.8) {
      const n = Math.max(1, Math.floor(w / 1.4));
      for (let i = 0; i < n; i++) lantern(hk, -w / 2 + (w * (i + 0.5)) / n, top - 0.42, lampZ, 0.85);
    }
    // 廚房的煙：有的屋頂上有一根短煙囪在冒煙
    if (R() < 0.3) {
      const cx = (R() - 0.5) * w * 0.5, cz = -d * 0.18;
      hk.box(0.3, RH * 0.7 + 0.4, 0.3, '#5a524c', cx, top + RH * 0.4 + 0.1, cz);
      hk.box(0.42, 0.08, 0.42, '#2a2622', cx, top + RH * 0.75 + 0.32, cz);
      hk.puff(cx, top + RH * 0.75 + 0.4, cz, 'smoke', 1.1);
    }
    if (o.back != null && o.back + 1 < top) {
      const bz = -d / 2 - 0.02, n = Math.max(1, Math.floor(w / 1.5));
      lattice(hk, -w * 0.25, o.back + 0.9, bz, 0.8, 1.7, true, Math.PI);
      for (let i = 0; i < n; i++) {
        const wx = -w / 2 + (w * (i + 0.5)) / n;
        if (Math.abs(wx + w * 0.25) > 0.7) lattice(hk, wx, o.back + 1.35, bz, 0.6, 0.6, R() < 0.7, Math.PI);
      }
      addRoof(hk, 0, o.back + 2.0, bz, w + 0.1, 1.6, 0.3, { front: true, ry: Math.PI, tile, lift: 0.08, curl: 0 });
      lantern(hk, -w * 0.25 + 0.65, o.back + 1.6, bz - 0.55, 0.7);
      hk.pool(-w * 0.25, o.back, bz - 1.0, 1.6, '#ffa860', 0.26);
    }
    const side = Math.abs(Math.sin(rot)) > 0.5, hw = (side ? d : w) / 2 + 0.4, hd = (side ? w : d) / 2 + 0.45;
    solid(o.x - hw, o.x + hw, o.z - hd, o.z + hd, top + RH);
    hk.emit(bucket, o.x, o.z, rot + (R() - 0.5) * 0.03);
  };
  // 沿 x 排一整排房子，寬度不一。zf 是正面的 z（正面朝南），房子往北長 d
  const row = (ranges, zf, d, y0, hMin, hMax, o = {}) => {
    for (const [a, b] of ranges) {
      for (let x = a; x < b - 0.8;) {
        const w = Math.min(b - x, 2.2 + R() * 1.6), cx = x + w / 2, top = o.hAt ? o.hAt(cx) : hMax;
        const zz = zf - R() * 0.2 - d / 2;
        house({ x: cx, z: zz, w: w - 0.1, d, y0, h: hMin + R() * (top - hMin), ground: groundUnder(cx - w / 2, cx + w / 2, zz - d / 2, zz + d / 2), shop: o.shop ?? true, back: o.back });
        x += w;
      }
    }
  };
  // 塔：方形的樓閣，一層一層往上收，每層翹角的屋簷四角掛燈籠，頂上一根金色的塔剎
  const tower = (x, z, r, y0, h) => {
    const tk = new Kit(R), tile = pick(TILES), ground = groundUnder(x - r, x + r, z - r, z + r);
    tk.box(2 * r + 0.3, y0 + 0.1 - ground + 0.4, 2 * r + 0.3, '#5e5852', 0, (y0 + 0.1 + ground - 0.4) / 2, 0, { color2: '#7a7068' });
    const n = h > 6 ? 3 : 2, th = h / n;
    let s = 2 * r * 0.92, y = y0 + 0.1;
    for (let i = 0; i < n; i++) {
      const wall = i ? pick(PLASTER) : pick(TIMBER), last = i === n - 1, eave = s + 1.3, lift = 0.42;
      tk.box(s, th, s, wall, 0, y + th / 2, 0, { color2: shade(wall, -0.04) });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) tk.box(0.14, th, 0.14, '#8a2a22', sx * (s / 2), y + th / 2, sz * (s / 2));
      for (const [a, ox, oz] of [[0, 0, 1], [Math.PI / 2, 1, 0], [Math.PI, 0, -1], [-Math.PI / 2, -1, 0]]) {
        lattice(tk, ox * (s / 2 + 0.02), y + th * 0.5, oz * (s / 2 + 0.02), s * 0.45, th * 0.45, true, a);
      }
      addRoof(tk, 0, y + th, 0, eave, eave, last ? 1.5 : 0.6, { ridge: 0, lift, tile });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) lantern(tk, sx * eave * 0.46, y + th + lift - 0.42, sz * eave * 0.46, 0.6);
      y += th;
      s *= 0.8;
    }
    const sy = y + 1.4;
    tk.cyl(0.04, 0.06, 1.6, GOLD, 0, sy + 0.7, 0, {}, 6);
    for (let i = 0; i < 4; i++) tk.torus(0.16 - i * 0.025, 0.025, Math.PI * 2, GOLD, 0, sy + 0.3 + i * 0.22, 0, { rx: Math.PI / 2 });
    tk.ball(0.12, GOLD, 0, sy + 1.55, 0);
    solid(x - r - 0.6, x + r + 0.6, z - r - 0.6, z + r + 0.6, sy + 1.6);
    tk.emit(bucket, x, z, 0);
  };

  // ---------- 地面：碼頭、各層石台，側面就是擋土牆 ----------
  for (const a of AREAS) {
    if (a.id === 'pier') continue;
    const yb = groundUnder(a.x0, a.x1, a.z0, a.z1);
    if (a.y != null) {
      const top = a.id === 'summit' ? '#4a4852' : PAVE;
      k.box(a.x1 - a.x0, a.y - yb, a.z1 - a.z0, a.id === 'summit' ? '#3a3840' : STONE, (a.x0 + a.x1) / 2, (a.y + yb) / 2, (a.z0 + a.z1) / 2, { color2: top });
      solid(a.x0, a.x1, a.z0, a.z1, a.y, true);
      continue;
    }
    // 石階：一階一階疊上去，兩側是矮牆，牆上立著燈籠
    const ns = a.dir === 'n', len = ns ? a.z1 - a.z0 : a.x1 - a.x0, tread = len / a.n;
    const along = (s) => (ns ? a.z1 - s : a.dir === 'w' ? a.x1 - s : a.x0 + s);
    for (let i = 0; i < a.n; i++) {
      const top = a.lo + RISE * (i + 1), c = i % 2 ? '#857a70' : '#7b7066', p = along((i + 0.5) * tread);
      if (ns) k.box(a.x1 - a.x0, top - yb, tread + 0.01, c, (a.x0 + a.x1) / 2, (top + yb) / 2, p);
      else k.box(tread + 0.01, top - yb, a.z1 - a.z0, c, p, (top + yb) / 2, (a.z0 + a.z1) / 2);
    }
    for (let i = 0; i < a.n; i += 2) {
      const top = a.lo + RISE * (i + 1) + 0.5, p = along((i + 1) * tread);
      if (ns) for (const sx of [a.x0 - 0.12, a.x1 + 0.12]) k.box(0.24, top - yb, tread * 2, STONE, sx, (top + yb) / 2, p);
      else for (const sz of [a.z0 - 0.12, a.z1 + 0.12]) k.box(tread * 2, top - yb, 0.24, STONE, p, (top + yb) / 2, sz);
    }
    // 上遠眺台的那段石階要暗，只在矮牆上放幾盞冷冷的小燈
    const dim = a.id === 'sH';
    for (let s = 0.6; s < len; s += dim ? 3 : 1.5) {
      const p = along(s);
      if (dim) {
        k.cyl(0.04, 0.05, 0.12, '#a8c8ff', a.x0 - 0.12, heightIn(a, 0, p) + 0.62, p, { glow: true });
        k.light(a.x0 - 0.12, heightIn(a, 0, p) + 0.62, p, '#8ab0ff', 0.2);
      } else if (ns) for (const sx of [a.x0 - 0.12, a.x1 + 0.12]) lantern(k, sx, heightIn(a, 0, p) + 1.9, p, 0.7);
      else for (const sz of [a.z0 - 0.12, a.z1 + 0.12]) lantern(k, p, heightIn(a, p, 0) + 1.9, sz, 0.7);
    }
    solid(a.x0 - 0.3, a.x1 + 0.3, a.z0 - 0.3, a.z1 + 0.3, a.hi + 0.5, true);
  }
  // 長棧橋：從海上一路接到碼頭
  const P = AREA.pier;
  for (let z = P.z0 + 0.15; z < P.z1; z += 0.3) k.box(2.4, 0.08, 0.27, pick(['#8a6a48', '#7a5a3a', '#93724e']), 0, -0.04, z, { ry: (R() - 0.5) * 0.03 });
  for (let z = P.z0 + 1; z < P.z1; z += 3) for (const sx of [-1.05, 1.05]) k.cyl(0.12, 0.14, 2.6, '#4a3626', sx, -1.2, z, {}, 7);
  for (const z of [16, 22, 29.6]) for (const sx of [-1.12, 1.12]) {
    k.box(0.1, 1.6, 0.1, DARK, sx, 0.8, z);
    lantern(k, sx, 1.85, z, 0.9);
    obstacles.push({ x: sx, z, hw: 0.15, hd: 0.15 });
  }
  rail(-1.2, 12, -1.2, 29.9, 0);
  rail(1.2, 12, 1.2, 25.6, 0);
  rail(-1.2, 29.95, 1.2, 29.95, 0);
  // 碼頭邊的石頭和木箱
  for (let i = 0; i < 46; i++) {
    const sx = R() < 0.5 ? -1 : 1, x = sx * (8.4 + R() * 9), z = 3 + R() * 9;
    k.rock(0.5 + R() * 0.9, '#4e4a4a', x, SEA + R() * 0.3, z, { sy: 0.6, ry: R() * 3, color2: '#6a625c', ao: false });
  }
  for (const [x, z, s] of [[-7.1, 10.6, 0.7], [-6.4, 10.9, 0.55], [-7.0, 9.9, 0.5], [6.9, 10.4, 0.65]]) {
    k.box(s, s, s, '#7a5a3a', x, s / 2, z, { ry: R() * 0.6, color2: '#9a7a52' });
    obstacles.push({ x, z, hw: s * 0.6, hd: s * 0.6 });
  }

  // ---------- 欄杆 ----------
  rail(-8, 11.95, -1.2, 11.95, 0); rail(1.2, 11.95, 8, 11.95, 0);
  rail(-7.95, 5, -7.95, 11.95, 0); rail(7.95, 5, 7.95, 11.95, 0);
  rail(-2.1, 5.05, -1.45, 5.05, 0); rail(1.45, 5.05, 2.1, 5.05, 0);
  rail(-4.5, -1.05, -1.4, -1.05, 2.4); rail(1.4, -1.05, 4.5, -1.05, 2.4);
  rail(-4.45, -1.8, -4.45, -1.05, 2.4);
  rail(-15, -1.05, -12, -1.05, 4.8); rail(-14.95, -6, -14.95, -1.05, 4.8);
  rail(-11.95, -6, -11.95, -4.2, 4.8); rail(-11.95, -1.8, -11.95, -1.05, 4.8);
  rail(-15, -5.95, -14.6, -5.95, 4.8); rail(-12.4, -5.95, -12, -5.95, 4.8);
  rail(-15, -10.05, -14.6, -10.05, 6.8); rail(-12.4, -10.05, 13, -10.05, 6.8);
  rail(-14.95, -15, -14.95, -10.05, 6.8); rail(12.95, -15, 12.95, -10.05, 6.8);
  rail(-6.95, -35, -6.95, -30, 11.6);
  rail(-12, -39.95, -6, -39.95, 14); rail(-3.8, -39.95, 0, -39.95, 14);
  rail(-11.95, -45, -11.95, -43.4, 14); rail(-11.95, -41.4, -11.95, -40, 14);
  rail(-0.05, -45, -0.05, -40, 14);
  rail(-22.5, -40.05, -19, -40.05, 16.4); rail(-22.45, -45, -22.45, -40.05, 16.4);
  rail(-18.95, -41.4, -18.95, -40.05, 16.4); rail(-18.95, -45, -18.95, -43.4, 16.4);
  rail(-22.5, -44.95, -22, -44.95, 16.4); rail(-19.6, -44.95, -19, -44.95, 16.4);
  const S = AREA.summit;
  rail(S.x0, S.z1 - 0.15, -22, S.z1 - 0.15, S.y, true); rail(-19.6, S.z1 - 0.15, S.x1, S.z1 - 0.15, S.y, true);
  rail(S.x0 + 0.15, S.z0, S.x0 + 0.15, S.z1, S.y, true); rail(S.x1 - 0.15, S.z0, S.x1 - 0.15, S.z1, S.y, true);
  rail(S.x0, S.z0 + 0.15, S.x1, S.z0 + 0.15, S.y, true);

  // ---------- 牌樓：碼頭石階的頂端，掛著「海市」 ----------
  {
    const y = 2.4, z = -1.4, red = '#8a2a22';
    for (const sx of [-1.75, 1.75]) {
      k.box(0.26, 3.4, 0.26, red, sx, y + 1.7, z, { color2: '#a8382a' });
      k.box(0.44, 0.3, 0.44, STONE, sx, y + 0.15, z);
      obstacles.push({ x: sx, z, hw: 0.25, hd: 0.25 });
      lantern(k, sx * 0.62, y + 2.45, z + 0.05, 1.1);
      k.pool(sx, y, z + 1.2, 2.2, '#ff9050', 0.3);
    }
    k.box(4.4, 0.22, 0.32, red, 0, y + 3.05, z);
    k.box(4.0, 0.16, 0.26, red, 0, y + 3.5, z);
    for (const sx of [-1.8, 1.8]) k.box(0.12, 0.3, 0.2, GOLD, sx, y + 3.3, z);
    addRoof(k, 0, y + 3.6, z, 5.6, 1.5, 0.8, { ridge: 2.1, lift: 0.45, tile: '#2a2c32' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), new THREE.MeshBasicMaterial({ map: signTexture('海市') }));
    sign.position.set(0, y + 3.28, z + 0.17);
    group.add(sign);
  }

  // ---------- 房子 ----------
  // 碼頭上的信差站和魚市
  house({ x: -4.9, z: 3.2, w: 5.2, d: 3.6, y0: 0, h: 3.4, ground: groundUnder(-7.5, -2.3, 1.4, 5), shop: true });
  house({ x: 4.9, z: 3.2, w: 5.2, d: 3.6, y0: 0, h: 3.0, ground: groundUnder(2.3, 7.5, 1.4, 5), shop: true });
  // 牌樓後面和旁邊
  row([[-4.4, 4.4]], -4.6, 4.0, 2.4, 2.8, 3.8, { shop: false });
  house({ x: 6.6, z: -2.75, w: 3.8, d: 3.4, y0: 2.4, h: 3.4, ground: groundUnder(4.7, 8.5, -4.4, -1.1), shop: false });
  // 往西那段石階旁邊，房子跟著石階一間比一間高
  // 排到轉角平台（x = -12）前面就停，不壓到平台和往上的石階
  for (let x = -5; x > -11.2;) {
    const w = Math.min(x + 11.9, 2.1 + R() * 0.6), cx = x - w / 2, y0 = heightIn(AREA.sB, cx, 0) - 0.1;
    house({ x: cx, z: -6.3, w: w - 0.1, d: 3.6, y0, h: 2.6 + R() * 1.0, ground: groundUnder(cx - w / 2, cx + w / 2, -8.1, -4.5), shop: false });
    x -= w;
  }
  // 下街北側：前面是下街的店，背面在燈巷那一層也開門
  row([[-15, -11.2], [-8.6, 4.8], [7.6, 13]], -15.1, 4.7, 6.8, 4.6, 5.6, { back: 9.2 });
  tower(-16.9, -12.4, 1.7, 6.8, 6.8);
  tower(14.9, -12.6, 1.6, 6.8, 5.6);
  // 燈巷北側，背面接工坊街
  row([[-13, 7.8], [10.6, 13.5]], -25.1, 4.6, 9.2, 4.4, 5.4, { back: 11.6 });
  house({ x: -14.3, z: -22.5, w: 4.8, d: 2.2, y0: 9.2, h: 4.2, rot: Math.PI / 2, ground: groundUnder(-15.4, -13.2, -25, -20), shop: false });
  house({ x: 12.3, z: -22.5, w: 4.8, d: 2.2, y0: 9.2, h: 3.8, rot: -Math.PI / 2, ground: groundUnder(11.2, 13.4, -25, -20), shop: false });
  // 工坊街北側：星台前面那段壓低
  row([[-3.6, 13]], -35.1, 4.4, 11.6, 2.4, 4.4, { hAt: (x) => (x < 0.5 ? 2.6 : 4.4) });
  house({ x: 14.4, z: -32.5, w: 4.8, d: 2.2, y0: 11.6, h: 4.0, rot: -Math.PI / 2, ground: groundUnder(13.3, 15.5, -35, -30), shop: false });
  // 星台：航海圖店和一座小圓塔
  row([[-12, -1]], -45.1, 4.0, 14, 2.8, 3.8);
  tower(2.3, -42.5, 1.5, 14, 4.6);

  // ---------- 店 ----------
  const GOODS = {
    post(kk, x, y, z) {
      for (let i = 0; i < 6; i++) kk.box(0.28, 0.02, 0.2, i % 2 ? CREAM : '#e8dcc0', x - 0.7 + (i % 3) * 0.3, y + 0.02 + Math.floor(i / 3) * 0.03, z, { ry: (R() - 0.5) * 0.4 });
      kk.ball(0.22, '#8a6a3a', x + 0.6, y + 0.15, z, { sy: 0.8 });
    },
    fish(kk, x, y, z) {
      kk.box(1.9, 0.08, 0.5, '#d8e8f0', x, y + 0.04, z);
      for (let i = 0; i < 6; i++) kk.ball(0.1, pick(['#b8c4cc', '#e0a050', '#c8a8b8']), x - 0.75 + i * 0.3, y + 0.12, z + (i % 2 - 0.5) * 0.15, { sx: 2.4, sy: 0.6 });
      kk.ball(0.16, '#c87a8a', x + 0.5, y + 0.3, z - 0.1);
    },
    pigment(kk, x, y, z) {
      ['#2a4aa8', '#c8321e', '#e8e0d0', '#a8642a', '#3a7a4a', '#d8a832'].forEach((c, i) => {
        kk.cyl(0.09, 0.1, 0.2, c, x - 0.75 + i * 0.3, y + 0.1, z - 0.1);
        kk.cone(0.09, 0.12, c, x - 0.75 + i * 0.3, y + 0.06, z + 0.15);
      });
    },
    bread(kk, x, y, z) {
      for (let i = 0; i < 5; i++) kk.ball(0.14, '#c8904a', x - 0.7 + i * 0.35, y + 0.08, z + (i % 2) * 0.12, { sx: 1.5, sy: 0.7, color2: '#e0b070' });
      kk.cyl(0.05, 0.05, 0.7, '#d8a060', x + 0.2, y + 0.08, z - 0.15, { rz: Math.PI / 2, ry: 0.3 });
      kk.puff(x - 0.3, y + 0.15, z, 'steam', 0.6);
    },
    candle(kk, x, y, z) {
      for (let i = 0; i < 7; i++) {
        const cx = x - 0.75 + i * 0.25, h = 0.15 + (i % 3) * 0.08;
        kk.cyl(0.04, 0.04, h, pick(['#f0e4c8', '#e8a8b8', '#c8d8f0']), cx, y + h / 2, z);
        kk.rock(0.03, '#ffd890', cx, y + h + 0.04, z, { glow: true });
      }
      kk.light(x, y + 0.3, z, '#ffcf80', 0.5);
    },
    tea(kk, x, y, z) {
      kk.ball(0.16, '#6a8a6a', x - 0.3, y + 0.15, z, { sy: 0.85 });
      kk.cyl(0.02, 0.03, 0.2, '#6a8a6a', x - 0.12, y + 0.2, z, { rz: -0.8 });
      for (let i = 0; i < 4; i++) kk.cyl(0.05, 0.04, 0.07, CREAM, x + 0.1 + i * 0.18, y + 0.035, z + 0.05);
      kk.puff(x - 0.12, y + 0.3, z, 'steam', 0.5);
    },
    tailor(kk, x, y, z) {
      for (let i = 0; i < 5; i++) kk.cyl(0.07, 0.07, 0.5, pick(['#8a4a8a', '#c8a050', '#4a7a9a', '#c85a4a', '#e8dcc0']), x - 0.6 + i * 0.3, y + 0.07, z, { rx: Math.PI / 2 });
    },
    junk(kk, x, y, z) {
      kk.cyl(0.06, 0.08, 0.3, '#9ad0d8', x - 0.6, y + 0.15, z, { glow: true });
      kk.box(0.18, 0.25, 0.3, '#5a3a2a', x - 0.2, y + 0.12, z);
      kk.ball(0.15, '#b89a5a', x + 0.25, y + 0.15, z);
      kk.cyl(0.13, 0.13, 0.05, GOLD, x + 0.65, y + 0.14, z, { rx: 1.3 });
    },
    herbs(kk, x, y, z) {
      for (let i = 0; i < 6; i++) kk.cone(0.07, 0.3, pick(['#5a8a4a', '#8a6aa8', '#a8a04a']), x - 0.8 + i * 0.32, y + 1.25, z + 0.1, { rx: Math.PI });
      for (let i = 0; i < 4; i++) kk.cyl(0.08, 0.08, 0.18, '#a8c8b0', x - 0.5 + i * 0.32, y + 0.09, z);
    },
    lanterns(kk, x, y, z) {
      ['#e04a3a', '#e8a040', '#d86a9a', '#4a8ac8'].forEach((c, i) => lantern(kk, x - 0.8 + i * 0.53, y + 1.15, z + 0.2, 0.6, c, shade(c, 0.2)));
      lantern(kk, x, y + 0.2, z, 0.5);
    },
    glass(kk, x, y, z) {
      ['#66ffcc', '#ff7ad9', '#ffcc44', '#7fb2ff'].forEach((c, i) => {
        kk.ball(0.12, c, x - 0.6 + i * 0.4, y + 0.13, z, { glow: true });
        kk.cyl(0.03, 0.04, 0.16, c, x - 0.6 + i * 0.4, y + 0.3, z, { glow: true });
      });
    },
    frames(kk, x, y, z) {
      for (let i = 0; i < 3; i++) {
        const fx = x - 0.6 + i * 0.6, s = 0.5 - i * 0.08, c = i === 1 ? GOLD : '#7a4a2a';
        for (const [w, h, dx, dy] of [[s, 0.05, 0, s / 2], [s, 0.05, 0, -s / 2], [0.05, s, s / 2, 0], [0.05, s, -s / 2, 0]]) kk.box(w, h, 0.04, c, fx + dx, y + s / 2 + 0.05 + dy, z, { rx: -0.2 });
      }
    },
    maps(kk, x, y, z) {
      for (let i = 0; i < 3; i++) kk.cyl(0.05, 0.05, 0.55, CREAM, x - 0.6 + i * 0.12, y + 0.05 + i * 0.03, z, { rz: Math.PI / 2 });
      kk.cyl(0.02, 0.05, 0.15, WOOD, x + 0.5, y + 0.075, z);
      kk.ball(0.16, '#3a6a9a', x + 0.5, y + 0.3, z, { color2: '#6a9a5a' });
      kk.plane(0.5, 0.35, '#e8d8a8', x, y + 0.01, z + 0.05, { rx: -Math.PI / 2 });
    },
  };
  const shops = SHOPS.map((s) => {
    const y = AREA[s.at].y, front = FRONT[s.at], cz = front + 1.1;
    k.box(2.3, 0.91, 0.6, WOOD, s.x, y + 0.455, cz, { color2: '#6a4a34' });
    k.box(2.4, 0.04, 0.7, '#a07850', s.x, y + 0.93, cz);
    k.box(2.32, 0.14, 0.02, s.awning, s.x, y + 0.76, cz + 0.31);
    for (const sx of [-1.12, 1.12]) k.box(0.08, 2.3, 0.08, DARK, s.x + sx, y + 1.15, cz + 0.26);
    // 從房子正面斜斜伸出來的小瓦頂，前緣一排短暖簾，右邊柱子掛一塊直招牌
    addRoof(k, s.x, y + 1.98, front + 0.02, 2.9, 3.6, 0.32, { front: true, tile: pick(TILES), lift: 0.12, curl: 0 });
    noren(k, s.x, y + 1.95, front + 1.7, 2.5, s.awning, 0.28);
    const sh = 0.34 * [...s.sign].length;
    signs.add(s.sign, s.x + 1.31, y + 1.9 - sh / 2, cz + 0.32, 0.34, 0, { bg: '#2a1a12', fg: '#e8c878' });
    lantern(k, s.x - 1.12, y + 1.62, cz + 0.42, 0.75);
    k.pool(s.x, y, front + 2.0, 2.4, '#ffa060', 0.36);
    GOODS[s.goods](k, s.x, y + 0.95, cz);
    obstacles.push({ x: s.x, z: front + 0.75, hw: 1.25, hd: 0.75 });
    return { id: s.id, x: s.x, y, z: front + 0.45, heading: 0 };
  });
  // 小吃推車：攤販站在推車後面，客人那邊朝街心
  for (const c of CARTS) {
    const r = yatai(bucket, signs, R, { ...c, y: AREA[c.at].y, tile: pick(TILES), lamp: lantern });
    obstacles.push(r.obstacle);
    shops.push({ id: c.id, ...r.vendor });
  }
  // 碼頭上兩張矮桌和長板凳，桌上擺著碗筷
  for (const sx of [-1, 1]) {
    const x = sx * 3.7, z = 9.7;
    k.box(1.5, 0.06, 0.75, '#8a5a36', x, 0.72, z, { color2: '#a07048' });
    for (const lx of [-0.65, 0.65]) for (const lz of [-0.3, 0.3]) k.box(0.06, 0.7, 0.06, DARK, x + lx, 0.35, z + lz);
    for (const bz of [-0.75, 0.75]) {
      k.box(1.5, 0.05, 0.28, '#7a4e30', x, 0.42, z + bz);
      for (const lx of [-0.6, 0.6]) k.box(0.05, 0.4, 0.22, DARK, x + lx, 0.2, z + bz);
    }
    for (let i = 0; i < 3; i++) {
      const bx = x - 0.45 + i * 0.45, bz = z + (i % 2 ? 0.15 : -0.15);
      k.cyl(0.11, 0.07, 0.08, i % 2 ? '#e8e0d0' : '#2a3a6a', bx, 0.79, bz, {}, 10);
      k.box(0.2, 0.01, 0.01, '#c8a878', bx + 0.08, 0.84, bz + 0.1, { ry: 0.3 });
      if (i !== 1) k.puff(bx, 0.85, bz, 'steam', 0.45);
    }
    k.cyl(0.05, 0.05, 0.12, '#c8b898', x + 0.6, 0.81, z - 0.2, {}, 8);
    lantern(k, x, 2.2, z, 0.8);
    k.box(0.02, 1.2, 0.02, DARK, x, 3.0, z);
    k.pool(x, 0, z, 2.2, '#ffa060', 0.3);
    obstacles.push({ x, z, hw: 0.85, hd: 1.0 });
  }
  // 信差站門口的紅郵筒，玻璃工坊裡的爐火
  k.cyl(0.22, 0.22, 1.0, '#b8322a', -3.0, 0.5, 6.0, {}, 10);
  k.ball(0.23, '#b8322a', -3.0, 1.0, 6.0, { sy: 0.6 });
  obstacles.push({ x: -3.0, z: 6.0, hw: 0.28, hd: 0.28 });
  k.plane(1.0, 0.8, '#ff8a3a', 3, 11.6 + 0.9, -35.03, { glow: true, color2: '#ffd070' });
  k.light(3, 12.5, -34.6, '#ff8a3a', 1.4);

  // ---------- 街上的燈籠串 ----------
  // 碼頭：兩角立竹竿，拉三條到信差站和魚市的屋簷
  for (const sx of [-1, 1]) {
    k.box(0.1, 3.8, 0.1, DARK, sx * 7.75, 1.9, 11.75);
    k.box(0.1, 3.8, 0.1, DARK, sx * 7.75, 1.9, 6.4);
    string(sx * 7.75, 11.75, sx * 2.4, 5.3, 3.3, 1.5);
    string(sx * 7.75, 6.4, sx * 7.75, 11.75, 3.4, 1.4);
  }
  string(-7.75, 9.1, 7.75, 9.1, 3.7, 1.6);
  string(-15, -12.1, 13, -12.1, 9.6, 1.6);
  string(-15, -13.4, 13, -13.4, 9.9, 2.0);
  for (let x = -12.5; x < 10; x += 3.2) string(x, -20.2, x + 3.2, -24.8, 11.9, 1.2);
  string(-13, -22.5, 11, -22.5, 12.1, 1.4);
  string(-7, -32.4, 13, -32.4, 14.4, 1.6);
  for (let x = -6.5; x < 12; x += 3.6) string(x, -30.2, x + 3.6, -34.8, 14.2, 1.4);
  // 星台四角的燈柱
  for (const [x, z] of [[-11.6, -44.6], [-0.4, -44.6], [-11.6, -40.4], [-0.4, -40.4]]) {
    k.box(0.12, 2.2, 0.12, DARK, x, 14 + 1.1, z);
    lantern(k, x, 14 + 2.0, z, 0.9);
    obstacles.push({ x, z, hw: 0.12, hd: 0.12 });
  }
  // 星台上的望遠鏡
  {
    const x = -8.5, z = -42, y = 14;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.cyl(0.03, 0.03, 1.3, '#8a6a3a', x + Math.cos(a) * 0.25, y + 0.62, z + Math.sin(a) * 0.25, { rx: Math.sin(a) * 0.2, rz: -Math.cos(a) * 0.2 }, 5);
    }
    k.cyl(0.08, 0.12, 1.1, GOLD, x, y + 1.45, z + 0.1, { rx: 1.1 }, 8);
    obstacles.push({ x, z, hw: 0.4, hd: 0.4 });
  }

  // ---------- 遠眺台：山頂一圈矮石牆和幾塊立石，只有一盞冷冷的小燈，看得到整座鎮和海 ----------
  {
    const y = S.y;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = -21 + Math.cos(a) * 3.4, z = -56.5 + Math.sin(a) * 1.9, h = 1.2 + R() * 0.8;
      if (z > -56.8) continue;   // 只立在北側，往海那邊不擋
      k.box(0.5, h, 0.32, '#5a5862', x, y + h / 2, z, { ry: -a, color2: '#6a6872' });
      obstacles.push({ x, z, hw: 0.32, hd: 0.32 });
    }
    k.box(0.1, 1.8, 0.1, DARK, -16, y + 0.9, -58.4);
    k.cyl(0.06, 0.07, 0.18, '#a8c8ff', -16, y + 1.9, -58.4, { glow: true });
    k.light(-16, y + 1.9, -58.4, '#8ab0ff', 0.35);
    obstacles.push({ x: -16, z: -58.4, hw: 0.12, hd: 0.12 });
  }

  // 工坊街西邊那棵大楓樹：彎彎曲曲的樹幹，紅葉裡掛著一盞一盞小紙燈
  {
    const x = -10.5, z = -32.5, y = terrain(x, z);
    k.cyl(0.5, 0.8, 4.5, '#4a3428', x, y + 2.25, z, { rz: 0.12 }, 7);
    k.cyl(0.3, 0.45, 3, '#4a3428', x + 0.6, y + 5.2, z - 0.2, { rz: -0.4 }, 6);
    for (const [dx, dy, dz, r] of [[0.8, 7.4, 0, 1.8], [-1.4, 6.5, 0.6, 1.6], [1.8, 6.1, -1.0, 1.5], [-0.4, 8.4, -0.8, 1.4], [2.2, 7.4, 0.8, 1.3], [-1.8, 7.6, -1.0, 1.3], [0.4, 6.0, 1.6, 1.4]]) {
      const c = pick(['#5a2220', '#6a2a22', '#4e2422', '#7a3424']);
      k.rock(r, c, x + dx, y + dy, z + dz, { sy: 0.7, ry: R() * 3, color2: shade(c, 0.08), ao: false });
    }
    for (let i = 0; i < 12; i++) {
      const a = R() * Math.PI * 2, fy = y + 5.2 + R() * 2.6, fr = 2.0 + R() * 0.7, fx = x + 0.2 + Math.cos(a) * fr, fz = z - 0.2 + Math.sin(a) * fr;
      lantern(k, fx, fy, fz, 0.55, i % 3 ? PAPER : LAMP, '#fff0d0');
    }
    solid(x - 3, x + 3, z - 3, z + 3, y + 10);
  }

  // ---------- 山坡上的灌木和小花；兩側和後面的山上有樹和人家 ----------
  const inArea = (x, z, pad) => AREAS.some((a) => x > a.x0 - pad && x < a.x1 + pad && z > a.z0 - pad && z < a.z1 + pad);
  const inSolid = (x, z) => solids.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  for (let i = 0; i < (coarse ? 260 : 420); i++) {
    const x = TOWN_X0 + R() * (TOWN_X1 - TOWN_X0), z = 4 - R() * 64, y = terrain(x, z);
    if (y < SEA + 0.2 || inArea(x, z, 0.7) || inSolid(x, z)) continue;
    const r = 0.35 + R() * 0.6;
    k.rock(r, pick(['#2e4a3a', '#3a5a3e', '#2a4440', '#44583a']), x, y + r * 0.4, z, { sy: 0.75, ao: false });
    if (R() < 0.35) for (let f = 0; f < 4; f++) k.rock(0.06, pick(['#f0a0b8', '#f8f0d8', '#f0d060', '#b8a0f0']), x + (R() - 0.5) * r * 1.4, y + r * 0.75, z + (R() - 0.5) * r * 1.4, { ao: false });
  }
  for (let i = 0; i < (coarse ? 300 : 520); i++) {
    const x = -100 + R() * 190, z = 20 - R() * 150;
    if (x > TOWN_X0 - 1 && x < TOWN_X1 + 1 && z > -62) continue;
    const y = terrain(x, z);
    if (y < SEA + 0.5) continue;
    if (R() < 0.12) {
      // 山上的人家：矮矮寬寬的木屋，瓦頂壓得很低，門口一盞燈
      const w = 3 + R() * 2.5, h = 1.6 + R() * 1.4;
      k.box(w, h + 1.5, 3, R() < 0.5 ? pick(PLASTER) : pick(TIMBER), x, y + h / 2 - 0.75, z, { ao: false });
      k.add(roofGeo(w + 1.2, 4.2, 1.2 + R() * 0.5, { tile: pick(TILES), lift: 0.4, seg: 0.3, ridge: R() < 0.5 ? (w + 1.2) / 2 : (w - 1.2) / 2 }), null, x, y + h, z, { ao: false });
      if (R() < 0.85) k.plane(w * 0.5, 0.8, WARM, x, y + h * 0.5, z + 1.52, { glow: true, color2: PAPER });
      if (R() < 0.6) lantern(k, x + w / 2 - 0.3, y + h - 0.3, z + 1.9, 1.4);
    } else {
      const s = 0.8 + R() * 1.4;
      k.cone(1.1 * s, 3 * s, '#1a2a2a', x, y + 1.3 * s, z, { color2: '#2e4440', ao: false });
    }
  }
  k.add(terrainGeometry(), '#24302e', 0, 0, 0, { color2: '#46523e', ao: false });

  k.emit(bucket, 0, 0, 0);
  const meshes = bucketObjects(bucket);
  for (const o of meshes) group.add(o);
  group.add(signs.mesh());
  // 推車、蒸籠、煙囪冒的煙；燈照在地上的光
  group.add(smoke(bucket.puffs, coarse));
  group.add(pools(bucket.pools));

  // ---------- 霧：夾在層與層之間，鎮子兩側的山谷裡也有；街道上方也飄幾團，在屋頂之間 ----------
  const MR = rng('haishi-mist'), mists = [];
  for (let i = 0; mists.length < (coarse ? 20 : 36) && i < 600; i++) {
    const x = TOWN_X0 - 4 + MR() * (TOWN_X1 - TOWN_X0 + 8), z = 6 - MR() * 66, over = inArea(x, z, 1.5);
    if (over && MR() < 0.6) continue;
    mists.push({ x, y: tz(z) + (over ? 5 + MR() * 3 : 1.5 + MR() * 3.5), z, s: 9 + MR() * 9, p: MR() * 10 });
  }
  group.add(mist(mists));
  // 每條街上方一層被燈籠照暖的霧，從海上遠遠看，一層一層的街都在發光
  const glow = [];
  for (const [x0, x1, z, y] of [[-6, 6, 8.5, 0], [-3, 3, -2.8, 2.4], [-14, 12, -12.5, 6.8], [-12, 10, -22.5, 9.2], [-6, 12, -32.5, 11.6]]) {
    for (let x = x0; x <= x1; x += 5) glow.push({ x: x + (MR() - 0.5) * 2, y: y + 3.4 + MR(), z: z + (MR() - 0.5) * 2, s: 8 + MR() * 4, p: MR() * 10 });
  }
  group.add(mist(glow, { color: '#ff8a48', alpha: 0.22, warm: true }));
  // 海上的燈影：碼頭靠海那一排、棧橋兩邊的燈籠，還有整座鎮映在水上的一大片暖光
  const shimmer = [{ x: 0, z: 12.2, w: 9, l: 10, color: '#ff8a48', a: 0.12 }];
  for (let x = -7.5; x <= 7.5; x += 1.5) if (Math.abs(x) > 1.5) shimmer.push({ x: x + (MR() - 0.5) * 0.4, z: 12.2, w: 0.35, l: 4 + MR() * 3, color: '#ff7a40', a: 0.5 });
  for (const z of [16, 22, 29.6]) for (const sx of [-1, 1]) shimmer.push({ x: sx * 1.5, z: z + 0.1, w: 0.3, l: 3 + MR() * 1.5, color: '#ff7a40', a: 0.55 });
  group.add(ripples(shimmer, SEA));

  // ---------- 海和天 ----------
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), new THREE.MeshLambertMaterial({ color: '#1e2648' }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA, 420);
  group.add(sea);

  // 夜色深一點，霧近一點，燈才顯得亮；地面反上來的光偏暖，像整條街的燈籠照著
  const env = { bg: 0x302e58, near: 32, far: 200, sky: 0x8e98d4, ground: 0x6a3c34, hi: 1.15, sun: 0xff9a70, si: 0.55, dir: new THREE.Vector3(-6, 5, 8) };
  const sky = new THREE.Group();
  sky.add(skyDome(env.bg));
  // 星星和月亮掛在天空球上，跟著鏡頭走。月亮在山的右上方，一下船就看得到
  const SR = rng('haishi-stars'), stars = [];
  for (let i = 0; i < 80; i++) {
    const a = SR() * Math.PI * 2, e = 0.3 + SR() * 1.1;
    stars.push({ x: Math.cos(a) * Math.cos(e) * 280, y: Math.sin(e) * 280, z: Math.sin(a) * Math.cos(e) * 280, color: '#e8eeff', size: 2 + SR() * 3 });
  }
  const moonDir = new THREE.Vector3(0.5, 0.42, -1).normalize().multiplyScalar(270);
  stars.push({ ...moonDir, color: '#fff4dc', size: 70 });
  sky.add(glowPoints(stars));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: '#fff6e4', fog: false }));
  moon.position.copy(moonDir);
  moon.lookAt(0, 0, 0);
  sky.add(moon);
  group.add(sky);

  // 海的另一邊，畫廊那座白塔：遠遠一根淡淡的影子，塔頂的石頭和畫廊那邊同時亮起
  const far = new THREE.Group();
  far.position.set(-90, SEA, 260);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 22, 8), new THREE.MeshBasicMaterial({ color: '#8c88a8', fog: false }));
  shaft.position.y = 11;
  far.add(shaft);
  const isle = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4a4866', fog: false }));
  isle.scale.y = 0.35;
  far.add(isle);
  const towerGlow = glowPoints([{ x: 0, y: 24, z: 0, color: '#bcd8ff', size: 30 }]), towerSize = towerGlow.geometry.attributes.aSize;
  far.add(towerGlow);
  group.add(far);

  // ---------- 渡船：長棧橋盡頭右邊繫著一艘小划船，跟畫廊那邊的一樣 ----------
  const boatKit = new Kit(R), boatBucket = newBucket(), boat = new THREE.Group();
  boatKit.add(hull(3.2, 1.3, 0.55, { y: 0.45, w: 0.82 }), '#6e4a30', 0, 0, 0, { color2: '#a0704a', ao: false });
  for (const z of [-0.5, 0.5]) boatKit.box(1.05, 0.05, 0.24, '#8a6440', 0, -0.12, z);
  boatKit.emit(boatBucket, 0, 0, 0);
  for (const o of bucketObjects(boatBucket)) boat.add(o);
  boat.position.set(2.15, SEA + 0.36, 27.8);
  boat.rotation.order = 'YXZ';
  group.add(boat);

  scene.add(group);

  // ---------- 碰撞、高度、尋路 ----------
  const inAny = (x, z) => !!areaAt(x, z);
  const hits = (x, z, pad) => obstacles.some((o) => Math.abs(x - o.x) < o.hw + pad && Math.abs(z - o.z) < o.hd + pad);
  // 角色四周各退一個半徑都還在走得到的範圍裡，才算站得住
  function walkable(x, z) {
    if (!inAny(x, z) || !inAny(x + MARGIN, z) || !inAny(x - MARGIN, z) || !inAny(x, z + MARGIN) || !inAny(x, z - MARGIN)) return false;
    return !hits(x, z, MARGIN - 0.05);
  }
  function groundY(x, z) {
    const a = areaAt(x, z);
    return a ? heightIn(a, x, z) : Math.max(SEA, terrain(x, z));
  }
  // 點到屋頂、牆或海上時，找附近一圈一圈最近的可走點，找不到再往角色的方向找
  function findWalkable(x, z, fromX, fromZ) {
    if (walkable(x, z)) return { x, z };
    for (let r = 0.25; r <= 3; r += 0.25) {
      const n = Math.ceil(r * 8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (walkable(px, pz)) return { x: px, z: pz };
      }
    }
    for (let i = 1; i <= 24; i++) {
      const t = i / 24, px = x + (fromX - x) * t, pz = z + (fromZ - z) * t;
      if (walkable(px, pz)) return { x: px, z: pz };
    }
    return null;
  }
  const { findPath } = makePathfinder(walkable, -28, -60, 17, 31);

  // 兩張高度圖，格子 0.5 公尺：hg 是地形、石台加上房子的屋頂，用來判斷鏡頭和角色之間有沒有被擋住；
  // cf 只算地形和石台，先往外擴一點再糊開，給鏡頭當最低高度，走上石階時鏡頭是慢慢抬高，不會突然跳。
  // 房子不算進 cf：不然窄巷裡的鏡頭會被推到屋頂上，隔著屋頂看人
  const CF = { x0: -70, z0: -80, s: 0.5, cols: 240, rows: 280 };
  const cf = new Float32Array(CF.cols * CF.rows);
  for (let r = 0; r < CF.rows; r++) {
    for (let c = 0; c < CF.cols; c++) cf[r * CF.cols + c] = groundY(CF.x0 + c * CF.s, CF.z0 + r * CF.s);
  }
  const hg = cf.slice();
  for (const b of solids) {
    const c0 = Math.max(0, Math.floor((b.x0 - CF.x0) / CF.s)), c1 = Math.min(CF.cols - 1, Math.ceil((b.x1 - CF.x0) / CF.s));
    const r0 = Math.max(0, Math.floor((b.z0 - CF.z0) / CF.s)), r1 = Math.min(CF.rows - 1, Math.ceil((b.z1 - CF.z0) / CF.s));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * CF.cols + c;
      if (b.ground) cf[i] = Math.max(cf[i], b.top);
      else hg[i] = Math.max(hg[i], b.top);
    }
  }
  const pass = (max) => {
    const src = cf.slice(), C = CF.cols;
    for (let r = 1; r < CF.rows - 1; r++) for (let c = 1; c < C - 1; c++) {
      let m = max ? -Infinity : 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const v = src[(r + dr) * C + c + dc];
        m = max ? Math.max(m, v) : m + v;
      }
      cf[r * C + c] = max ? m : m / 9;
    }
  };
  pass(true);
  pass(true);
  for (let i = 0; i < 3; i++) pass(false);
  function camFloor(x, z) {
    const u = (x - CF.x0) / CF.s, v = (z - CF.z0) / CF.s;
    if (u < 0 || v < 0 || u >= CF.cols - 1 || v >= CF.rows - 1) return Math.max(SEA, terrain(x, z));
    const c = Math.floor(u), r = Math.floor(v), fu = u - c, fv = v - r, i = r * CF.cols + c;
    return (cf[i] * (1 - fu) + cf[i + 1] * fu) * (1 - fv) + (cf[i + CF.cols] * (1 - fu) + cf[i + CF.cols + 1] * fu) * fv;
  }
  const blockAt = (x, z) => {
    const c = Math.round((x - CF.x0) / CF.s), r = Math.round((z - CF.z0) / CF.s);
    return c < 0 || r < 0 || c >= CF.cols || r >= CF.rows ? -Infinity : hg[r * CF.cols + c];
  };
  // 從角色頭部往鏡頭走，碰到房子或地形就停：回傳停在全程的幾成，沒被擋住是 1。
  // 頭部附近 0.8 公尺不算，貼著店面站時屋簷那一圈不會把鏡頭拉到臉上
  function camClip(a, b) {
    const n = Math.ceil(a.distanceTo(b) / 0.3);
    for (let i = Math.ceil(0.8 / 0.3); i <= n; i++) {
      const t = i / n;
      if (a.y + (b.y - a.y) * t < blockAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) + 0.25) return (i - 1) / n;
    }
    return 1;
  }

  const room = {
    index: 0, id: 'haishi', data: { name: '海市', subtitle: 'Fata Morgana', paintings: [] },
    group, obstacles, paintings: [], center: new THREE.Vector3(0, 0, -20),
  };
  const raycastTargets = [...meshes.filter((o) => o.isMesh), sea];

  return {
    rooms: [room], paintings: [], mirror: null, outdoor: null, raycastTargets, env, shops,
    // 鏡頭可以拉到很遠，整座山城收進畫面
    camDistMax: 46,
    // 下船的地方：長棧橋的盡頭，離小船幾步，面向山上的鎮子
    spawn: { x: 0, z: 26.4, heading: Math.PI },
    exits: [{ x: 0.6, z: 27.9, r: 1.4, to: 'gallery', label: '搭船', title: '回畫廊' }],
    roomIndexAt: () => 0,
    placeAt: (x, z) => PLACES[areaAt(x, z)?.id] || null,
    walkable, findWalkable, findPath, groundY, camFloor, camClip,
    setCurrentRoom() {},
    // 測試用：地形高度、房子和石台的範圍
    debug: { terrain, solids, areas: AREAS },
    update(t, cam) {
      uTime.value = t;
      sky.position.copy(cam);
      boat.position.y = SEA + 0.36 + Math.sin(t * 1.3) * 0.05;
      boat.rotation.set(Math.sin(t * 0.9) * 0.03, 0.08 + Math.sin(t * 0.3) * 0.05, Math.sin(t * 1.1 + 1) * 0.05);
      const now = Date.now() / 1000;
      towerSize.setX(0, 30 * (1 + 1.5 * bump(towerPhase(now), 0.52, 0.07)));
      towerSize.needsUpdate = true;
    },
  };
}
