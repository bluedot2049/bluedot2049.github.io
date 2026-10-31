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
import { Fader } from './fade.js';
import { drawText } from './glyphs.js';

const SEA = -0.6;
const RISE = 0.2;          // 石階每階高度
const MARGIN = 0.32;       // 角色半徑

// 走得到的地方：一塊一塊的長方形。y 是平地的高度。
// 石階寫 lo、hi 和 dir：n 往北爬（高的那頭在 z0），w 往西爬（高的那頭在 x0），e 往東爬（高的那頭在 x1）
// 坡道也一樣寫 lo、hi、dir，再加 slope: true，整段平平地斜上去，沒有一階一階
// 相鄰的兩塊只在石階的上下口接起來，高度一定對得上（tools/check-haishi.mjs 會掃一遍）
const AREAS = [
  { id: 'pier', x0: -1.2, x1: 1.2, z0: 12, z1: 30, y: 0 },
  { id: 'quay', x0: -8, x1: 8, z0: 5, z1: 12, y: 0 },
  { id: 'scala', x0: -1.4, x1: 1.4, z0: -1, z1: 5, lo: 0, hi: 2.4, dir: 'n' },
  { id: 'gate', x0: -4.5, x1: 4.5, z0: -4.5, z1: -1, y: 2.4 },
  { id: 'sB', x0: -12, x1: -4.5, z0: -4.2, z1: -1.8, lo: 2.4, hi: 4.8, dir: 'w' },
  { id: 'bend1', x0: -15, x1: -12, z0: -6, z1: -1, y: 4.8 },
  { id: 'sC', x0: -14.6, x1: -12.4, z0: -10, z1: -6, lo: 4.8, hi: 6.8, dir: 'n' },
  // 下街：三段寬窄不一。中段往北凹進去，是一個小廣場；東段高兩階，中間一小段坡接上去。
  // street 是同一條街的名字（走進去時報的地名、攤位落在哪一條街）。rowFrom：北邊那排房子從哪裡開始排
  { id: 'lower', street: 'lower', x0: -16, x1: -6, z0: -16.5, z1: -10, y: 6.8 },
  { id: 'lowerB', street: 'lower', x0: -6, x1: 4, z0: -19, z1: -11.5, y: 6.8 },
  { id: 'lowerR', street: 'lower', x0: 4, x1: 5.5, z0: -15, z1: -11.5, lo: 6.8, hi: 7.2, dir: 'e', slope: true },
  { id: 'lowerC', street: 'lower', x0: 5.5, x1: 14, z0: -15, z1: -10, y: 7.2, rowFrom: 4 },
  // 下街到燈巷：三條穿過房子之間的窄巷，各是一段石階
  { id: 'aL1', x0: -12, x1: -10.4, z0: -21.5, z1: -16.5, lo: 6.8, hi: 9.2, dir: 'n' },
  { id: 'aL2', x0: -1.5, x1: 0.3, z0: -24, z1: -19, lo: 6.8, hi: 9.2, dir: 'n' },
  { id: 'aL3', x0: 6.3, x1: 8.1, z0: -20, z1: -15, lo: 7.2, hi: 9.2, dir: 'n' },
  // 燈巷：三段錯開，接口窄窄的
  { id: 'lantern', street: 'lantern', x0: -15, x1: -5, z0: -27, z1: -21.5, y: 9.2 },
  { id: 'lanternB', street: 'lantern', x0: -5, x1: 4, z0: -29, z1: -24, y: 9.2 },
  { id: 'lanternC', street: 'lantern', x0: 4, x1: 12, z0: -26.5, z1: -20, y: 9.2 },
  { id: 'aU1', x0: -8, x1: -6.4, z0: -32, z1: -27, lo: 9.2, hi: 11.6, dir: 'n' },
  { id: 'aU2', x0: 1.6, x1: 3.2, z0: -34, z1: -29, lo: 9.2, hi: 11.6, dir: 'n' },
  { id: 'aU3', x0: 10, x1: 11.8, z0: -31.5, z1: -26.5, lo: 9.2, hi: 12, dir: 'n' },
  // 工坊街：東段高兩階
  { id: 'upper', street: 'upper', x0: -11, x1: -2, z0: -37, z1: -32, y: 11.6 },
  { id: 'upperB', street: 'upper', x0: -2, x1: 7.5, z0: -38, z1: -34, y: 11.6 },
  { id: 'upperS', street: 'upper', x0: 7.5, x1: 8.5, z0: -35.5, z1: -34, lo: 11.6, hi: 12, dir: 'e' },
  { id: 'upperC', street: 'upper', x0: 8.5, x1: 14, z0: -35.5, z1: -31.5, y: 12, rowFrom: 7.5 },
  // 星台，再往西轉兩段石階上遠眺台
  { id: 'sF', x0: -8, x1: -6, z0: -42, z1: -37, lo: 11.6, hi: 14, dir: 'n' },
  { id: 'sF2', x0: -0.5, x1: 1.3, z0: -43, z1: -38, lo: 11.6, hi: 14, dir: 'n' },
  { id: 'specula', street: 'specula', x0: -16, x1: -4, z0: -48, z1: -42, y: 14 },
  { id: 'speculaB', street: 'specula', x0: -4, x1: 4, z0: -46, z1: -43, y: 14 },
  { id: 'sG', x0: -23, x1: -16, z0: -46.4, z1: -44.4, lo: 14, hi: 16.4, dir: 'w' },
  { id: 'bend2', x0: -26.5, x1: -23, z0: -48, z1: -43, y: 16.4 },
  { id: 'sH', x0: -26, x1: -23.6, z0: -55, z1: -48, lo: 16.4, hi: 19.2, dir: 'n' },
  { id: 'summit', x0: -31, x1: -19, z0: -62, z1: -55, y: 19.2 },
  // 港口：碼頭往東西兩邊接出濱海的岸壁。西邊是漁港，三道木頭小棧橋，外面一道防波堤；東邊是渡船口，一道石砌的長堤
  { id: 'wharfW', x0: -27, x1: -8, z0: 5, z1: 9, y: 0 },
  { id: 'wharfE', x0: 8, x1: 15, z0: 5, z1: 9, y: 0 },
  { id: 'fp1', x0: -24.2, x1: -22.8, z0: 9, z1: 17, y: 0, deck: true },
  { id: 'fp2', x0: -19.2, x1: -17.8, z0: 9, z1: 16, y: 0, deck: true },
  { id: 'fp3', x0: -14.2, x1: -12.8, z0: 9, z1: 15, y: 0, deck: true },
  { id: 'mole', x0: -29, x1: -27, z0: 5, z1: 27, y: 0 },
  { id: 'ferry', x0: 10, x1: 13, z0: 9, z1: 21, y: 0 },
  // 從漁港上山的小路：石階爬到小祠前的平台，再往東爬上轉角平台，接回往下街的那段石階
  { id: 'sW1', x0: -23.5, x1: -21.5, z0: -1.5, z1: 5, lo: 0, hi: 2.4, dir: 'n' },
  { id: 'shrine', x0: -24, x1: -19.5, z0: -4.5, z1: -1.5, y: 2.4 },
  { id: 'sW2', x0: -19.5, x1: -15, z0: -4, z1: -1.5, lo: 2.4, hi: 4.8, dir: 'e' },
  // 牌樓往東的另一條路：跟西邊對稱，一段往東爬的石階、一個轉角平台，再往北接到下街的東頭
  { id: 'sEa', x0: 4.5, x1: 10, z0: -4.2, z1: -1.8, lo: 2.4, hi: 4.8, dir: 'e' },
  { id: 'bend3', x0: 10, x1: 13, z0: -6, z1: -1, y: 4.8 },
  { id: 'sEb', x0: 10.4, x1: 12.6, z0: -10, z1: -6, lo: 4.8, hi: 7.2, dir: 'n' },
];
for (const a of AREAS) if (a.y == null) a.n = Math.round((a.hi - a.lo) / RISE);
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// 走進去時報的地名。碼頭不報，剛下船時畫面上已經是「海市」。
// 同一個地名跨兩塊地的要共用同一個物件，在兩塊之間走來走去才不會一直報
const TRAIECTUS = { name: '渡船口', subtitle: 'Traiectus' };
const PLACES = {
  wharfW: { name: '漁港', subtitle: 'Portus' },
  mole: { name: '防波堤', subtitle: 'Moles' },
  wharfE: TRAIECTUS,
  ferry: TRAIECTUS,
  shrine: { name: '小祠', subtitle: 'Sacellum' },
  scala: { name: '梯', subtitle: 'Scala' },
  lower: { name: '下街', subtitle: 'Via Inferior' },
  lantern: { name: '燈巷', subtitle: 'Via Lucernarum' },
  upper: { name: '工坊街', subtitle: 'Via Fabrorum' },
  specula: { name: '星台', subtitle: 'Specula' },
  summit: { name: '遠眺台', subtitle: 'Prospectus' },
};

// 店：沿著各層街道靠山的那一側（北邊）。at 是哪一條街，x 決定落在那條街的哪一段，店面開在那一段的北邊上
// 攤販的樣子和台詞在 vendors.js，用 id 對起來
export const SHOPS = [
  { id: 'post', at: 'quay', x: -4.6, awning: '#a8322a', goods: 'post', sign: '信' },
  { id: 'fish', at: 'quay', x: 4.6, awning: '#2e5a7a', goods: 'fish', sign: '鮮魚' },
  { id: 'pigment', at: 'lower', x: -14, awning: '#2e4a9a', goods: 'pigment', sign: '顏料' },
  { id: 'bakery', at: 'lower', x: -7.6, awning: '#c8803a', goods: 'bread', sign: '麵包' },
  { id: 'candle', at: 'lower', x: -3.3, awning: '#7a2a4a', goods: 'candle', sign: '蠟燭' },
  { id: 'tea', at: 'lower', x: 2, awning: '#4a7a4a', goods: 'tea', sign: '茶' },
  { id: 'tailor', at: 'lower', x: 10.4, awning: '#8a4a8a', goods: 'tailor', sign: '裁縫' },
  { id: 'junk', at: 'lantern', x: -10, awning: '#6a5a3a', goods: 'junk', sign: '古物' },
  { id: 'herbs', at: 'lantern', x: -3.2, awning: '#3a6a4a', goods: 'herbs', sign: '藥草' },
  { id: 'lanterns', at: 'lantern', x: 7.5, awning: '#a8322a', goods: 'lanterns', sign: '燈籠' },
  { id: 'glass', at: 'upper', x: 3, awning: '#3a6a8a', goods: 'glass', sign: '玻璃' },
  { id: 'frames', at: 'upper', x: 10.5, awning: '#8a6a2a', goods: 'frames', sign: '木工' },
  { id: 'maps', at: 'specula', x: -6, awning: '#2a3a6a', goods: 'maps', sign: '海圖' },
];
// 小吃推車：擺在街上沒有店的那一側，碼頭上是左右兩邊。at 是哪一塊路面，ry 是客人那一邊朝的方向（0 朝南）
export const CARTS = [
  { id: 'squid', at: 'quay', x: -6.5, z: 8.2, ry: Math.PI / 2, food: 'squid', color: '#a8322a', text: '烤魷魚' },
  { id: 'oden', at: 'quay', x: 6.5, z: 8.2, ry: -Math.PI / 2, food: 'oden', color: '#2a3a6a', text: '關東煮' },
  { id: 'takoyaki', at: 'lower', x: -9.4, z: -11.2, ry: Math.PI, food: 'takoyaki', color: '#c8602a', text: '章魚燒' },
  { id: 'baozi', at: 'lowerC', x: 6.6, z: -11.2, ry: Math.PI, food: 'baozi', color: '#3a5a3a', text: '包子' },
  { id: 'tanghulu', at: 'lanternB', x: -3.5, z: -25.2, ry: Math.PI, food: 'tanghulu', color: '#b82a3a', text: '糖葫蘆' },
  { id: 'potato', at: 'upper', x: -4.5, z: -33.2, ry: Math.PI, food: 'potato', color: '#6a3a5a', text: '烤番薯' },
];

// 白牆、木板牆、瓦。瓦大多是深灰，少數是紅瓦和銅綠
const PLASTER = ['#ece2cc', '#e2d6bc', '#f0e8d8', '#d8cab0', '#e6d2b8'];
const TIMBER = ['#5a3826', '#4a2e20', '#6a4430', '#3e2a20', '#563a2c', '#704a32'];
const TILES = ['#33373f', '#2c3038', '#3a3c46', '#2a2c32', '#2e3a3a', '#6a3428', '#3a4a48'];
const NOREN = ['#2a3a6a', '#7a2a2a', '#2a4a3a', '#5a3a6a', '#8a5a2a', '#1e2a4a'];
// 石頭是偏冷的灰：背光處跟著夜色帶一點藍，燈籠照到的地方才暖起來
const WOOD = '#4a3428', DARK = '#2a201c', BEAM = '#3a2a22', STONE = '#68686e', PAVE = '#8c8c90', CREAM = '#efe4c8';
const LAMP = '#ff4a2a', LAMP_HI = '#ffa060', WARM = '#ffc070', PAPER = '#ffd8a0', GOLD = '#d4a54a';
// 屋簷下掛的招牌：沒有櫃台的房子也有，夜市整條街都是字
const HOUSE_SIGNS = ['湯', '酒', '宿', '茶屋', '麵', '甘味', '飯', '餅', '燒', '團子', '粥', '冰', '豆花', '當'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const shade = (c, l) => new THREE.Color(c).offsetHSL(0, 0, l).getStyle();

// ---------- 地形 ----------
// 沿著 z 的高度。岸邊照幾個固定的點往海裡斜下去；鎮子裡從 AREAS 算：每個 z 取那一排最低的路面再往下 0.6，
// 山坡永遠壓在石台和石階底下，不會從路面冒出來。最上面那層再往後，山繼續往上爬
const SHORE = [[40, -3.2], [12, -1.6], [5, -0.9], [-1, 1.3]];
const TK = (() => {
  const low = (a, z) => (a.y != null ? a.y : a.dir === 'n' ? heightIn(a, 0, z) : a.lo);
  const end = Math.min(...AREAS.map((a) => a.z0)), pts = [...SHORE];
  let cap = 1.3;
  for (let z = -1.5; z >= end; z -= 0.5) {
    const here = AREAS.filter((a) => z >= a.z0 && z <= a.z1);
    if (here.length) cap = Math.min(...here.map((a) => low(a, z))) - 0.6;
    pts.push([z, cap]);
  }
  pts.push([end - 6, cap + 4.5], [end - 78, cap + 47.5]);
  return pts;
})();
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
  if (a.slope) return a.lo + (a.hi - a.lo) * Math.min(1, Math.max(0, t));
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
      // 逆時針從上面看才是正面；反過來的話只有從坡底往上看得到，站上遠眺台往下看整片山坡會不見
      pos.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// 銀河那個大圓的法線：帶子從西南的海面斜斜跨過頭頂，落到東北的山後面
const BAND = new THREE.Vector3(0.55, 0.45, -0.7).normalize();

// 藍調時刻的天空：地平線和霧同色，往上漸深，西邊殘留一點夕陽的暖色。
// uStars 越往山上越大：天頂再暗一點，淡淡浮出一條銀河
function skyDome(bg) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLow: { value: new THREE.Color(bg) }, uTop: { value: new THREE.Color('#121735') }, uWarm: { value: new THREE.Color('#c27c7c') },
      uBand: { value: BAND }, uMilk: { value: new THREE.Color('#4c5288') }, uStars: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uLow; uniform vec3 uTop; uniform vec3 uWarm; uniform vec3 uBand; uniform vec3 uMilk; uniform float uStars;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uLow, uTop * (1.0 - 0.35 * uStars), smoothstep(0.0, 0.55, h));
        // 銀河：沿著大圓的一條光帶，幾道正弦交疊出明暗的雲團，中間一道暗縫
        float b = dot(d, uBand);
        float lump = 0.55 + 0.45 * sin(d.x * 7.0 + sin(d.z * 5.0) * 2.0) * sin(d.z * 9.0 - d.y * 6.0 + 1.3);
        float milk = exp(-b * b * 22.0) * lump * (1.0 - 0.6 * exp(-(b - 0.025) * (b - 0.025) * 900.0));
        c += uMilk * milk * uStars * smoothstep(0.02, 0.35, h);
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

// 滿天的星：幾千個點一次畫完，每顆一兩個像素，不跟距離縮放。大多暗暗的，少數亮一點、閃得慢一點。
// 六成撒滿整片天，四成擠在銀河附近。貼近地平線的被霧吃掉
function starField(n) {
  const R = rng('haishi-sky'), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n;) {
    v.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
    const l = v.lengthSq();
    if (l > 1 || l < 0.01) continue;
    v.normalize();
    if (i > n * 0.6) v.addScaledVector(BAND, -v.dot(BAND) * (0.7 + R() * 0.3)).normalize();
    if (v.y < -0.05) continue;
    pos.set([v.x * 285, v.y * 285, v.z * 285], i * 3);
    c.setHSL(R() < 0.75 ? 0.62 : 0.1, R() * 0.4, 0.85);
    col.set([c.r, c.g, c.b], i * 3);
    mag[i++] = Math.pow(R(), 2.6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uFade: { value: 0 }, uPr: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      uniform float uTime; uniform float uFade; uniform float uPr;
      attribute vec3 aColor; attribute float aMag;
      varying vec3 vC;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float tw = 0.7 + 0.3 * sin(uTime * (3.5 - aMag * 2.5) + position.x * 0.37 + position.z * 0.21);
        float h = smoothstep(-0.02, 0.2, position.y / 285.0);
        vC = aColor * (0.38 + 0.62 * aMag) * tw * uFade * h;
        gl_PointSize = (1.4 + aMag * 2.2) * uPr;
      }`,
    fragmentShader: `
      varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = max(0.0, 1.0 - d * d);
        gl_FragColor = vec4(vC * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
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
  drawText(g, text, { x: 128, y: 64, size: 84, step: 92, color: '#4a1e10' });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHaishi(scene, { coarse = false } = {}) {
  const R = rng('haishi'), k = new Kit(R), bucket = newBucket();
  const group = new THREE.Group(), obstacles = [], solids = [], rails = [];
  const solid = (x0, x1, z0, z1, top, ground = false) => solids.push({ x0, x1, z0, z1, top, ground });
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  // 擋住視線時會淡掉的東西，一組一組登記（見 fade.js）
  const fader = new Fader();
  // 一塊轉了 rot 的長方體換成世界座標的範圍：本地 x 在 lx0~lx1、z 在 lz0~lz1，中心放在 (cx, cz)
  const wbox = (cx, cz, rot, lx0, lx1, y0, y1, lz0, lz1) => {
    const c = Math.cos(rot), s = Math.sin(rot), xs = [], zs = [];
    for (const lx of [lx0, lx1]) for (const lz of [lz0, lz1]) { xs.push(cx + lx * c + lz * s); zs.push(cz - lx * s + lz * c); }
    return [Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs)];
  };
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
      const t = i / n, [c, hi] = STRING[Math.floor(R() * STRING.length)], px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      lantern(k, px, y - Math.sin(t * Math.PI) * 0.35, pz, 0.85, c, hi);
      // 隔一盞在石板上照出一圈暖光；石階上不放，平的光圈貼不住一階一階的地面
      const a = areaAt(px, pz);
      if (i % 2 && a?.y != null) k.pool(px, a.y, pz, 1.5, '#ffa060', 0.2);
    }
  };
  // 欄杆：從 a 到 b，地面高 y。越往上越古老：港邊一帶是竹籬，鎮上是亂石砌的矮牆，星台以上是老石欄，
  // 石望柱頂上蹲著小獸；遠眺台的柱子之間再垂一條紅繩，掛著微微發亮的符紙
  const STONES = ['#6a6870', '#5e5c64', '#74706c', '#62605a'];
  const BAMBOO = ['#8a7a4a', '#7a6c44', '#9a8a5a'];
  const OCHRE = ['#d8b888', '#c8a878', '#e0c8a0'];
  const LEAF = ['#2e4a3a', '#3a5a3e', '#44583a'];
  const rail = (ax, az, bx, bz, y) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.2) return;
    rails.push({ ax, az, bx, bz, y });
    const ry = -Math.atan2(bz - az, bx - ax), ux = (bx - ax) / len, uz = (bz - az) / len, at = (t) => [ax + ux * t, az + uz * t];
    if (y < 3.5) {
      // 竹籬：竹竿一根一根立著，高矮不齊，兩道橫的綁在上面
      for (let t = 0.1; t < len; t += 0.28 + R() * 0.12) {
        const [x, z] = at(t), h = 0.85 + R() * 0.25;
        k.cyl(0.035, 0.04, h, pick(BAMBOO), x, y + h / 2, z, {}, 5);
      }
      const [mx, mz] = at(len / 2);
      for (const hy of [0.35, 0.72]) k.cyl(0.025, 0.025, len, BAMBOO[1], mx, y + hy, mz, { ry, rz: Math.PI / 2 }, 4);
      return;
    }
    if (y < 13) {
      // 亂石矮牆：大小不一的石塊一塊接一塊，偶爾缺一塊，牆頂長草
      for (let t = 0; t < len - 0.05;) {
        const l = Math.min(len - t, 0.35 + R() * 0.45), [x, z] = at(t + l / 2), h = 0.5 + R() * 0.28, c = pick(STONES);
        if (R() > 0.06) k.box(l - 0.03, h, 0.34 + R() * 0.08, c, x, y + h / 2, z, { ry: ry + (R() - 0.5) * 0.06, color2: shade(c, 0.05) });
        if (R() < 0.12) k.rock(0.13, pick(LEAF), x, y + h + 0.04, z, { sy: 0.6, ao: false });
        t += l;
      }
      return;
    }
    // 老石欄：每隔一段一根石望柱，柱頂一隻蹲著的小獸，柱子之間嵌石板
    const n = Math.max(1, Math.round(len / 1.5)), step = len / n, rope = y > 18;
    for (let i = 0; i <= n; i++) {
      const [x, z] = at(i * step);
      k.box(0.24, 1.0, 0.24, '#6a6870', x, y + 0.5, z, { ry, color2: '#7a7880' });
      k.rock(0.13, '#5a5862', x, y + 1.1, z, { sy: 1.25, ry: R() * 3 });
      k.ball(0.06, '#5a5862', x + uz * 0.08, y + 1.24, z - ux * 0.08);
      if (i === n) continue;
      const [mx, mz] = at((i + 0.5) * step);
      k.box(step - 0.26, 0.55, 0.14, '#62606a', mx, y + 0.42, mz, { ry, color2: '#72707a' });
      k.box(step - 0.2, 0.08, 0.2, '#6e6c74', mx, y + 0.74, mz, { ry });
      if (!rope) continue;
      for (let j = 0; j < 6; j++) {
        const [rx, rz] = at(i * step + (step * (j + 0.5)) / 6);
        k.box(step / 6 + 0.03, 0.03, 0.03, '#a8221a', rx, y + 0.98 - Math.sin(((j + 0.5) / 6) * Math.PI) * 0.2, rz, { ry });
      }
      for (const side of [0, Math.PI]) k.plane(0.1, 0.26, '#e8d070', mx, y + 0.62, mz, { glow: true, ry: ry + Math.PI / 2 + side, color2: '#fff4b0' });
    }
  };

  // ---------- 房子 ----------
  // ---------- 房子 ----------
  // 海市的房子是一代一代疊上去的：最底下是最老的石砌基座，一樓是木板或石牆，二樓以上是白灰牆或木構，
  // 最上面是後來才加的竹木小閣樓、吊樓、曬衣竿。哪裡都不太對齊，但亂得有道理：
  //  1. 每間房子有自己的「手」（0.8–1.25）：門窗照它的比例做，同一間裡大小一致，隔壁那間就不一樣
  //  2. 每一層挑一種窗。格子窗、細長窗可以一排兩三扇，位置照等分的格子再抖一點，不排成一直線；
  //     圓窗、八角窗是那一層的重點，只開一扇
  //  3. 越上面越新、越輕、顏色越淡：石 → 木 → 灰牆 → 竹；上一層可以比下一層寬或窄，往旁邊歪一點，往街上挑出去
  //  4. 魔法的痕跡只點一兩處：門邊的符紙、簷角的銅鈴、屋脊的小獸，極少數屋頂上浮著一盞淡藍的燈
  // 每間各用一組零件，蓋在原點、正面朝 +z，再轉到 rot 放到 x、z。ground 是腳下的地形，石砌基座一路埋進坡裡
  // back：後面那條街的高度，房子在那一層的背面也開門開窗（九份的房子常常前後各接一條街）
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
  // 一扇窗：grid 格子窗、round 圓窗、octa 八角窗、slit 細長窗。s 是這間房子的手，ry 是窗面朝的方向
  const opening = (kk, kind, x, y, z, s, lit, ry = 0) => {
    if (kind === 'grid') return lattice(kk, x, y, z, 0.75 * s, 0.62 * s, lit, ry);
    if (kind === 'slit') return lattice(kk, x, y, z, 0.3 * s, 0.95 * s, lit, ry);
    const r = (kind === 'round' ? 0.28 : 0.26) * s, seg = kind === 'round' ? 16 : 8, f = Math.sin(ry) * 0.02, g = Math.cos(ry) * 0.02;
    kk.add(new THREE.CircleGeometry(r, seg), lit ? PAPER : '#3a3038', x, y, z, { glow: true, ry, rz: Math.PI / seg, color2: lit ? '#ffeccc' : '#4a4048' });
    kk.add(new THREE.TorusGeometry(r + 0.03, 0.045, 4, seg), BEAM, x + f, y, z + g, { ry, rz: Math.PI / seg });
    kk.box(2 * r, 0.03, 0.02, BEAM, x + f, y, z + g, { ry });
    kk.box(0.03, 2 * r, 0.02, BEAM, x + f, y, z + g, { ry });
  };
  // 一扇門：lit 亮著的格子門、plank 木板門、moon 月洞門。回傳門的寬
  const doorway = (kk, kind, x, y0, z, s, maxH, ry = 0) => {
    const f = Math.sin(ry), g = Math.cos(ry);
    if (kind === 'moon') {
      const r = Math.min(0.85 * s, (maxH - 0.1) / 2);
      kk.add(new THREE.CircleGeometry(r, 20), '#ffb060', x, y0 + r, z, { glow: true, ry, color2: '#ffd8a0' });
      kk.add(new THREE.TorusGeometry(r + 0.06, 0.09, 4, 20), pick(STONES), x + f * 0.03, y0 + r, z + g * 0.03, { ry });
      return 2 * r;
    }
    const dw = Math.min(1.3, 0.8 * s), dh = Math.min(maxH, 1.8 + (s - 1) * 0.6);
    if (kind === 'lit') lattice(kk, x, y0 + dh / 2, z, dw, dh, true, ry);
    else kk.box(dw, dh, 0.05, pick(['#3a2a20', '#4a3226', '#2e2420']), x + f * 0.02, y0 + dh / 2, z + g * 0.02, { ry });
    kk.box(dw + 0.2, 0.1, 0.08, DARK, x + f * 0.05, y0 + dh + 0.05, z + g * 0.05, { ry });
    for (const sx of [-1, 1]) kk.box(0.08, dh, 0.08, DARK, x + sx * (dw / 2 + 0.04) * g + f * 0.04, y0 + dh / 2, z - sx * (dw / 2 + 0.04) * f + g * 0.04, { ry });
    return dw;
  };
  // 符紙：門邊貼一張黃紙，微微發亮
  const talisman = (kk, x, y, z) => {
    kk.plane(0.11, 0.3, '#e8c850', x, y, z + 0.03, { glow: true, color2: '#fff0a0' });
    kk.plane(0.05, 0.05, '#a8221a', x, y + 0.06, z + 0.035);
  };
  const house = (o) => {
    const hk = new Kit(R), { w, d, y0 } = o, rot = o.rot || 0;
    const ground = o.ground ?? y0, hand = 0.8 + R() * 0.45, tile = R() < 0.07 ? '#4a7a6a' : pick(TILES), fz = d / 2 + 0.02;
    // 招牌在世界座標裡：把這間房子自己的座標轉出去
    const cr = Math.cos(rot), sr = Math.sin(rot), world = (lx, lz) => [o.x + lx * cr + lz * sr, o.z - lx * sr + lz * cr];
    // 基座：最老的石頭，從坡底砌上來，比上面的牆寬一點；砌得高的話看得到一道一道石縫
    const stone = pick(STONES);
    if (y0 - ground > 0.05) {
      hk.box(w + 0.16, y0 - ground + 0.4, d + 0.16, stone, 0, (y0 + ground - 0.4) / 2, 0, { color2: shade(stone, 0.06) });
      for (let yy = ground + 0.5; yy < y0 - 0.25; yy += 0.5 + R() * 0.35) hk.box(w + 0.18, 0.04, d + 0.18, shade(stone, -0.1), 0, yy, 0);
    }
    // 一樓：大多是深色木板，有的是石牆，少數是土黃的灰泥
    const h1 = Math.min(o.h, 2.3 + R() * 0.6), m = R();
    const wall1 = m < 0.55 ? pick(TIMBER) : m < 0.8 ? pick(STONES) : pick(OCHRE);
    hk.box(w, h1, d, wall1, 0, y0 + h1 / 2, 0, { color2: shade(wall1, 0.05) });
    for (const sx of [-1, 1]) hk.box(0.15, h1, 0.15, DARK, sx * (w / 2 - 0.05), y0 + h1 / 2, d / 2 - 0.04);
    hk.box(w + 0.04, 0.12, 0.1, DARK, 0, y0 + h1 - 0.06, fz);
    if (o.shop) {
      // 店面整片拉開，裡面亮著；門口掛暖簾，或兩邊各垂一條長布幡
      const sw = w - 0.5;
      hk.plane(sw, 1.9, '#ffb060', 0, y0 + 1.0, fz, { glow: true, color2: '#ffd8a0' });
      if (R() < 0.5) noren(hk, 0, y0 + 1.95, fz + 0.03, Math.min(sw, 2.4), pick(NOREN), 0.5);
      else for (const sx of [-1, 1]) {
        const c = pick(NOREN);
        hk.box(0.05, 0.05, 0.5, DARK, sx * (sw / 2 - 0.1), y0 + 2.2, fz + 0.25);
        hk.box(0.36, 1.2, 0.02, c, sx * (sw / 2 - 0.1), y0 + 1.55, fz + 0.48, { color2: shade(c, 0.06) });
      }
      hk.pool(0, y0, fz + 1.2, Math.min(3, w * 0.7), '#ffa860', 0.3);
    } else {
      // 門擺在等分的其中一格再抖一點，其他格放這一層的窗
      const slots = w > 3.4 ? 3 : w > 2.1 ? 2 : 1, sw = w / slots, ds = Math.floor(R() * slots);
      const dk = w > 2.4 && R() < 0.12 ? 'moon' : R() < 0.6 ? 'lit' : 'plank';
      const dx = -w / 2 + sw * (ds + 0.5) + (R() - 0.5) * sw * 0.25;
      const dw = doorway(hk, dk, dx, y0, fz, hand, h1 - 0.3);
      const kind = pick(['grid', 'grid', 'grid', 'slit', 'round']);
      for (let i = 0; i < slots; i++) {
        if (i === ds || R() < 0.25) continue;
        opening(hk, kind, -w / 2 + sw * (i + 0.5) + (R() - 0.5) * sw * 0.2, y0 + 1.25 + (R() - 0.5) * 0.3, fz, hand * (0.85 + R() * 0.3), R() < 0.75);
      }
      if (R() < 0.35) talisman(hk, dx + dw / 2 + 0.14, y0 + 1.45, fz);
      if (dk !== 'plank') hk.pool(dx, y0, fz + 0.9, 1.4, '#ffb070', 0.22);
      if (R() < 0.3) {
        // 門口一盆草
        const px = dx + (R() < 0.5 ? -1 : 1) * (dw / 2 + 0.35);
        hk.cyl(0.18, 0.14, 0.3, '#7a4a30', px, y0 + 0.15, fz + 0.25, {}, 7);
        hk.rock(0.25, pick(LEAF), px, y0 + 0.45, fz + 0.25, { sy: 0.9, ao: false });
      }
    }
    // 招牌：門口那根柱子外面掛一塊直招牌，兩面都有字
    if (R() < (o.shop ? 0.7 : 0.35)) {
      const text = pick(HOUSE_SIGNS), sx = (R() < 0.5 ? -1 : 1) * (w / 2 + 0.22), paper = R() < 0.35;
      const style = paper ? { bg: '#f0e0c0', fg: '#8a1e14' } : { bg: '#2a1a12', fg: '#e8c878' };
      hk.box(0.5, 0.05, 0.05, DARK, sx * 0.94, y0 + 2.35, fz + 0.1);
      const sh = 0.36 * Math.min(3, [...text].length), [gx, gz] = world(sx, fz + 0.1);
      for (const side of [1, -1]) signs.add(text, gx + cr * 0.012 * side, y0 + 2.3 - sh / 2, gz - sr * 0.012 * side, 0.36, rot + (side * Math.PI) / 2, style);
    }
    // 往上一層一層疊：每層寬一點窄一點、往旁邊歪一點，越上面越新、越輕
    let top = y0 + h1, pw = w, px = 0, n = 0, wall = wall1, over = 0, lampZ = fz + 0.35;
    while (o.h - (top - y0) > 1.5 && n < 3) {
      const fh = Math.min(o.h - (top - y0), 2.1 + R() * 0.6);
      const ww = Math.max(1.5, Math.min(w + 0.5, pw * (0.86 + R() * 0.24)));
      const nx = Math.max(-0.3 - (w - ww) / 2, Math.min(0.3 + (w - ww) / 2, px + (R() - 0.5) * 0.5));
      const jut = n === 0 && R() < 0.35 ? 0.3 : 0;   // 二樓往街上挑出去一點
      const plaster = R() < (n === 0 ? 0.65 : 0.45);
      wall = plaster ? pick(PLASTER) : n === 0 ? pick(TIMBER) : pick(BAMBOO);
      // 層與層之間：一道披簷，或一條木陽台，或什麼都沒有
      const between = R();
      if (between < 0.45 && !jut && over === 0) {
        addRoof(hk, px, top - 0.42, fz, pw + 0.5, 1.8, 0.42, { front: true, tile, lift: 0.14, curl: 0, seg: coarse ? 0.6 : 1 });
        if (!o.shop && n === 0) for (const sx of [-0.3, 0.3]) lantern(hk, px + sx * pw, top - 0.95, fz + 0.62, 0.7);
      }
      over = jut;
      const fz2 = d / 2 + over + 0.025;
      hk.box(ww, fh, d + over, wall, nx, top + fh / 2, over / 2, { color2: shade(wall, plaster ? -0.04 : 0.04) });
      if (plaster) {
        for (const sx of [-1, 1]) hk.box(0.1, fh, 0.05, BEAM, nx + sx * (ww / 2 - 0.05), top + fh / 2, fz2);
        hk.box(ww, 0.1, 0.05, BEAM, nx, top + fh - 0.05, fz2);
      }
      const kind = pick(['grid', 'grid', 'grid', 'slit', 'slit', 'round', 'octa']), feature = kind === 'round' || kind === 'octa';
      const cnt = feature ? 1 : Math.max(1, Math.min(3, Math.round(ww / 1.5 + (R() - 0.5))));
      for (let i = 0; i < cnt; i++) {
        opening(hk, kind, nx - ww / 2 + (ww * (i + 0.5)) / cnt + (R() - 0.5) * (feature ? ww * 0.3 : 0.3), top + fh * (0.45 + R() * 0.15), fz2, hand * (feature ? 1.15 : 0.8 + R() * 0.35), R() < 0.75);
      }
      if (between >= 0.45 && between < 0.72 && n === 0 && !jut) {
        // 木陽台：伸出來一條走廊，欄杆一根一根
        hk.box(ww + 0.2, 0.08, 0.7, WOOD, nx, top + 0.04, fz2 + 0.35);
        hk.box(ww + 0.2, 0.06, 0.06, WOOD, nx, top + 0.82, fz2 + 0.68);
        const mm = Math.max(3, Math.round(ww / 0.32));
        for (let i = 0; i <= mm; i++) hk.box(0.04, 0.78, 0.04, DARK, nx - ww / 2 - 0.1 + ((ww + 0.2) * i) / mm, top + 0.43, fz2 + 0.68);
        lampZ = fz2 + 0.45;
      }
      top += fh;
      pw = ww;
      px = nx;
      n++;
    }
    // 瓦頂：屋角翹得高；大多屋脊沿著街，有的山牆朝街，有的四面都是斜的
    const along = R() < 0.7, hip = R() < 0.3, rz = over / 2, dd = d + over;
    const RW = (along ? pw : dd) + 0.8, RD = (along ? dd : pw) + 0.9, RH = RD * (0.28 + R() * 0.16), ridge = hip ? Math.max(0.3, (RW - RD) / 2 + 0.4) : RW / 2;
    addRoof(hk, px, top, rz, RW, RD, RH, { ry: along ? 0 : Math.PI / 2, tile, end: wall, lift: 0.3 + R() * 0.3, curl: 0.14 + R() * 0.22, ridge, seg: coarse ? 0.6 : 1 });
    if (!along && !hip) lattice(hk, px, top + RH * 0.32, dd / 2 + 0.42, 0.5, 0.45, true);
    let crown = top + RH;
    // 屋脊兩頭的小獸
    if (R() < 0.4) for (const e of [-1, 1]) {
      const L = Math.max(0.2, ridge - 0.15), bx = px + (along ? e * L : 0), bz = rz + (along ? 0 : e * L);
      hk.rock(0.12, '#2a2c32', bx, top + RH + 0.08, bz, { sy: 1.4 });
      hk.ball(0.05, '#3a3c44', bx + (along ? e * 0.08 : 0), top + RH + 0.22, bz + (along ? 0 : e * 0.08));
    }
    // 屋簷下一排燈籠；簷角掛銅鈴
    if (R() < 0.65) {
      const k2 = Math.max(1, Math.floor(pw / 1.4));
      for (let i = 0; i < k2; i++) lantern(hk, px - pw / 2 + (pw * (i + 0.5)) / k2, top - 0.42, lampZ + over, 0.85);
    }
    if (R() < 0.25) for (const e of [-1, 1]) hk.cone(0.07, 0.13, GOLD, px + e * (RW / 2 - 0.25), top - 0.12, rz + RD / 2 - 0.2);
    // 後來加蓋的：屋頂上的竹木小閣樓、從二樓挑出去的吊樓、曬衣竿
    if (R() < 0.3 && pw > 1.8) {
      const aw = 0.9 + R() * 0.7, ah = 1.0 + R() * 0.5, ax = px + (R() - 0.5) * Math.max(0, pw - aw) * 0.6, ay = top + RH * 0.5, ac = pick(BAMBOO);
      hk.box(aw, ah, 1.1, ac, ax, ay + ah / 2, rz + 0.1, { color2: shade(ac, 0.06) });
      addRoof(hk, ax, ay + ah, rz + 0.1, aw + 0.5, 1.6, 0.4, { tile: pick(TILES), lift: 0.2, ridge: (aw + 0.5) / 2 });
      opening(hk, 'grid', ax, ay + ah * 0.5, rz + 0.67, 0.7, true);
      crown = Math.max(crown, ay + ah + 0.4);
    }
    if (n >= 1 && !o.shop && R() < 0.22) {
      const cw = 1.0 + R() * 0.5, side = R() < 0.5 ? -1 : 1, cx = side * (w / 2 - cw / 2), cy = y0 + h1 + 0.3, ch = 1.3, cz = fz + 0.45 + over;
      hk.box(cw, ch, 0.9, pick(BAMBOO), cx, cy + ch / 2, cz);
      for (const e of [-1, 1]) hk.box(0.06, 0.9, 0.06, DARK, cx + e * (cw / 2 - 0.1), cy - 0.3, cz + 0.05, { rx: 0.6 });
      opening(hk, 'grid', cx, cy + ch * 0.55, cz + 0.46, 0.75, true);
      addRoof(hk, cx, cy + ch, cz, cw + 0.3, 1.2, 0.3, { tile, lift: 0.1, ridge: (cw + 0.3) / 2 });
    }
    if (R() < 0.15) {
      const ly = top - 0.75, lz = d / 2 + over + 0.55;
      hk.cyl(0.025, 0.025, pw + 0.4, BAMBOO[0], px, ly, lz, { rz: Math.PI / 2 }, 4);
      for (let i = 0; i < 3; i++) hk.box(0.4, 0.55, 0.02, pick(['#e8e0d0', '#2a3a6a', '#8a2a2a', '#d8c070']), px - pw / 3 + (i * pw) / 3, ly - 0.3, lz, { ry: (R() - 0.5) * 0.3 });
    }
    // 野草和藤：屋頂上冒幾叢草，牆上垂幾條藤
    if (R() < 0.35) for (let i = 0; i < 2 + Math.floor(R() * 3); i++) hk.rock(0.12 + R() * 0.1, pick(LEAF), px + (R() - 0.5) * pw, top + RH * (0.5 + R() * 0.3), rz + (R() - 0.5) * 0.6, { sy: 0.7, ao: false });
    if (R() < 0.2) for (let i = 0; i < 2 + Math.floor(R() * 2); i++) {
      const vl = 1.2 + R() * 1.8;
      hk.box(0.12, vl, 0.03, pick(LEAF), (R() - 0.5) * (w - 0.4), top - vl / 2, fz + 0.03);
    }
    // 廚房的煙：有的屋頂上有一根短煙囪在冒煙
    if (R() < 0.25) {
      const cx = px + (R() - 0.5) * pw * 0.5, cz = rz - dd * 0.18;
      hk.box(0.3, RH * 0.7 + 0.4, 0.3, '#5a524c', cx, top + RH * 0.4 + 0.1, cz);
      hk.box(0.42, 0.08, 0.42, '#2a2622', cx, top + RH * 0.75 + 0.32, cz);
      hk.puff(cx, top + RH * 0.75 + 0.4, cz, 'smoke', 1.1);
    }
    // 魔法：少數屋頂上浮著一盞淡藍的燈，沒有繩子吊著
    if (R() < 0.06) lantern(hk, px + (R() - 0.5), crown + 0.9 + R() * 0.6, rz, 0.6, '#9ad0ff', '#e8f6ff');
    if (o.back != null && o.back + 1 < top) {
      const bz = -d / 2 - 0.02, k3 = Math.max(1, Math.floor(w / 1.5));
      const bdw = doorway(hk, R() < 0.55 ? 'lit' : 'plank', -w * 0.25, o.back, bz, hand, 2.0, Math.PI);
      const kind = pick(['grid', 'round', 'slit']);
      for (let i = 0; i < k3; i++) {
        const wx = -w / 2 + (w * (i + 0.5)) / k3;
        if (Math.abs(wx + w * 0.25) > bdw / 2 + 0.45) opening(hk, kind, wx, o.back + 1.35, bz, hand * 0.85, R() < 0.7, Math.PI);
      }
      addRoof(hk, 0, o.back + 2.0, bz, w + 0.1, 1.6, 0.3, { front: true, ry: Math.PI, tile, lift: 0.08, curl: 0 });
      lantern(hk, -w * 0.25 + 0.65, o.back + 1.6, bz - 0.55, 0.7);
      hk.pool(-w * 0.25, o.back, bz - 1.0, 1.6, '#ffa860', 0.26);
    }
    const side = Math.abs(Math.sin(rot)) > 0.5, hw = (side ? d : w) / 2 + 0.4, hd = (side ? w : d) / 2 + 0.45;
    solid(o.x - hw, o.x + hw, o.z - hd, o.z + hd, crown);
    // 淡出的範圍：屋身、往外伸的屋頂、門口上方的披簷和陽台（從頭頂以上才算，站在門口不會被算進去）
    hk.fid = fader.add([
      wbox(o.x, o.z, rot, -w / 2 - 0.3, w / 2 + 0.3, ground, top, -d / 2, d / 2 + over),
      wbox(o.x, o.z, rot, px - RW / 2 - 0.2, px + RW / 2 + 0.2, top - 0.3, crown + 0.4, rz - RD / 2 - 0.2, rz + RD / 2 + 0.2),
      wbox(o.x, o.z, rot, -w / 2 - 0.3, w / 2 + 0.3, y0 + 1.9, top, d / 2, d / 2 + 1.0 + over),
    ]);
    hk.emit(bucket, o.x, o.z, rot + (R() - 0.5) * 0.03);
  };
  const streetOf = (a) => a.street ?? a.id;
  // 一條街在 x 這裡是哪一塊平的路面
  const flatAt = (street, x) => AREAS.find((a) => streetOf(a) === street && a.y != null && x >= a.x0 && x <= a.x1);
  // 一條街靠山那一側（北邊）的一排房子：寬窄、退縮、高矮都不一樣；巷子的石階穿過去的地方留空，攤位的地方一定是店面。
  // 房子背面一路伸到上一層街 up 的南邊，那一層也開門；上面沒有街的話深 depth
  const frontage = (a, up = null, depth = 4.2) => {
    const x0 = a.rowFrom ?? a.x0;
    const lots = SHOPS.filter((s) => flatAt(s.at, s.x) === a).map((s) => ({ x0: s.x - 1.5, x1: s.x + 1.5, shop: true }));
    const cuts = AREAS.filter((s) => s.dir === 'n' && Math.abs(s.z1 - a.z0) < 0.01 && s.x0 < a.x1 && s.x1 > x0).map((s) => ({ x0: s.x0 - 0.15, x1: s.x1 + 0.15 }));
    let free = [[x0, a.x1]];
    for (const b of [...cuts, ...lots]) free = free.flatMap(([f0, f1]) => (b.x1 <= f0 || b.x0 >= f1 ? [[f0, f1]] : [[f0, b.x0], [b.x1, f1]].filter(([u, v]) => v - u > 0.05)));
    for (const [f0, f1] of free) {
      for (let x = f0; f1 - x > 0.9;) {
        let w = 1.8 + R() * 2.6;
        if (f1 - x - w < 1.6) w = f1 - x;
        lots.push({ x0: x, x1: x + w, shop: false });
        x += w;
      }
    }
    for (const l of lots) {
      const ups = up ? AREAS.filter((b) => streetOf(b) === up && b.y != null && b.x0 < l.x1 - 0.2 && b.x1 > l.x0 + 0.2) : [];
      const back = ups.length ? Math.max(...ups.map((b) => b.z1)) : a.z0 - depth;
      const zf = a.z0 - 0.1 - (l.shop || R() < 0.5 ? 0 : R() * 0.5), d = zf - back - 0.05;
      if (d < 1.4) continue;
      const by = ups.length ? ups[0].y : null, h = (by != null ? by - a.y + 2.4 : 2.6) + R() * 2.3;
      house({ x: (l.x0 + l.x1) / 2, z: zf - d / 2, w: l.x1 - l.x0 - 0.08, d, y0: a.y, h, ground: groundUnder(l.x0, l.x1, back, zf), shop: l.shop, back: by });
    }
  };
  // 街道南邊的崖邊也長出房子：前門朝街，後面一路砌到坡底
  const perch = (a, x0, x1, y = a.y) => {
    for (let x = x0; x1 - x > 0.9;) {
      let w = 2 + R() * 1.8;
      if (x1 - x - w < 1.4) w = x1 - x;
      const d = 2.2 + R() * 0.4, zf = a.z1 + 0.05;
      house({ x: x + w / 2, z: zf + d / 2, w: w - 0.08, d, y0: y, h: 2.6 + R() * 1.6, rot: Math.PI, ground: groundUnder(x, x + w, zf, zf + d), shop: false });
      x += w;
    }
  };
  // 塔：方形的樓閣，一層一層往上收，每層翹角的屋簷四角掛燈籠，頂上一根金色的塔剎
  const tower = (x, z, r, y0, h) => {
    const tk = new Kit(R), tile = pick(TILES), ground = groundUnder(x - r, x + r, z - r, z + r);
    tk.box(2 * r + 0.3, y0 + 0.1 - ground + 0.4, 2 * r + 0.3, '#5a5a60', 0, (y0 + 0.1 + ground - 0.4) / 2, 0, { color2: '#74747a' });
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
    tk.fid = fader.add([[x - r - 0.7, ground, z - r - 0.7, x + r + 0.7, sy + 1.6, z + r + 0.7]]);
    tk.emit(bucket, x, z, 0);
  };

  // ---------- 地面：碼頭、各層石台，側面就是擋土牆 ----------
  for (const a of AREAS) {
    if (a.id === 'pier' || a.deck) continue;   // 木頭的棧橋另外鋪
    const yb = groundUnder(a.x0, a.x1, a.z0, a.z1);
    if (a.y != null) {
      const top = a.id === 'summit' ? '#4a4852' : PAVE;
      k.box(a.x1 - a.x0, a.y - yb, a.z1 - a.z0, a.id === 'summit' ? '#3a3840' : STONE, (a.x0 + a.x1) / 2, (a.y + yb) / 2, (a.z0 + a.z1) / 2, { color2: top });
      solid(a.x0, a.x1, a.z0, a.z1, a.y, true);
      continue;
    }
    // 坡道：一塊石台把頂面的四個角各自抬到那裡的高度，側面一樣是擋土牆。
    // 跟石階一樣不登記成地板，鏡頭的地板照坡面的實際高度走
    if (a.slope) {
      const g = new THREE.BoxGeometry(a.x1 - a.x0, 1, a.z1 - a.z0).toNonIndexed();
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3), cTop = new THREE.Color(PAVE), cLow = new THREE.Color(STONE);
      for (let i = 0; i < pos.count; i++) {
        const x = (a.x0 + a.x1) / 2 + pos.getX(i), z = (a.z0 + a.z1) / 2 + pos.getZ(i), up = pos.getY(i) > 0;
        pos.setXYZ(i, x, up ? heightIn(a, x, z) : yb, z);
        (up ? cTop : cLow).toArray(col, i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      k.add(g, null, 0, 0, 0);
      solid(a.x0 - 0.3, a.x1 + 0.3, a.z0 - 0.3, a.z1 + 0.3, a.hi + 0.5);
      continue;
    }
    // 石階：一階一階疊上去，兩側是矮牆，牆上立著燈籠
    const ns = a.dir === 'n', len = ns ? a.z1 - a.z0 : a.x1 - a.x0, tread = len / a.n;
    const along = (s) => (ns ? a.z1 - s : a.dir === 'w' ? a.x1 - s : a.x0 + s);
    for (let i = 0; i < a.n; i++) {
      const top = a.lo + RISE * (i + 1), c = i % 2 ? '#88888c' : '#7c7c82', p = along((i + 0.5) * tread);
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
    // 只拿來擋灌木；鏡頭的地板用一階一階的實際高度（groundY），整段當平頂會把往坡上看的鏡頭推到臉上
    solid(a.x0 - 0.3, a.x1 + 0.3, a.z0 - 0.3, a.z1 + 0.3, a.hi + 0.5);
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
  // 碼頭邊的石頭和木箱
  // 亂數照原本的順序抽完再決定放不放，後面的房子才不會因為少抽幾次整排換樣子
  for (let i = 0; i < 46; i++) {
    const sx = R() < 0.5 ? -1 : 1, x = sx * (8.4 + R() * 9), z = 3 + R() * 9;
    const r = 0.5 + R() * 0.9, y = SEA + R() * 0.3, ry = R() * 3;
    if (AREAS.some((a) => x > a.x0 - r && x < a.x1 + r && z > a.z0 - r && z < a.z1 + r)) continue;
    if (z > 8.5 && x < 16) continue;   // 港內停船的水面

    k.rock(r, '#4e4a4a', x, y, z, { sy: 0.6, ry, color2: '#6a625c', ao: false });
  }
  for (const [x, z, s] of [[-7.1, 10.6, 0.7], [-6.4, 10.9, 0.55], [-7.0, 9.9, 0.5], [6.9, 10.4, 0.65]]) {
    k.box(s, s, s, '#7a5a3a', x, s / 2, z, { ry: R() * 0.6, color2: '#9a7a52' });
    obstacles.push({ x, z, hw: s * 0.6, hd: s * 0.6 });
  }

  // ---------- 欄杆 ----------
  // 碼頭靠海的三邊不圍欄杆，只壓一道深色的邊石，跟兩邊的岸壁一樣
  for (const [x0, x1] of [[-8, -1.2], [1.2, 8]]) k.box(x1 - x0, 0.1, 0.22, '#4a4a50', (x0 + x1) / 2, 0.05, 11.89);
  for (const sx of [-1, 1]) k.box(0.22, 0.1, 3, '#4a4a50', sx * 7.89, 0.05, 10.5);
  rail(-2.1, 5.05, -1.45, 5.05, 0); rail(1.45, 5.05, 2.1, 5.05, 0);

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
    // 橫樑、匾和屋頂一組，從底下走過、鏡頭在另一邊時淡掉
    const gk = new Kit(R);
    gk.box(4.4, 0.22, 0.32, red, 0, y + 3.05, z);
    gk.box(4.0, 0.16, 0.26, red, 0, y + 3.5, z);
    for (const sx of [-1.8, 1.8]) gk.box(0.12, 0.3, 0.2, GOLD, sx, y + 3.3, z);
    addRoof(gk, 0, y + 3.6, z, 5.6, 1.5, 0.8, { ridge: 2.1, lift: 0.45, tile: '#2a2c32' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), new THREE.MeshBasicMaterial({ map: signTexture('海市') }));
    sign.position.set(0, y + 3.28, z + 0.17);
    group.add(sign);
    gk.fid = fader.add([[-2.9, y + 2.9, z - 0.85, 2.9, y + 5.0, z + 0.85]], [sign]);
    gk.emit(bucket, 0, 0, 0);
  }

  // ---------- 房子 ----------
  // 碼頭上的信差站和魚市
  house({ x: -4.9, z: 3.2, w: 5.2, d: 3.6, y0: 0, h: 3.4, ground: groundUnder(-7.5, -2.3, 1.4, 5), shop: true });
  house({ x: 4.9, z: 3.2, w: 5.2, d: 3.6, y0: 0, h: 3.0, ground: groundUnder(2.3, 7.5, 1.4, 5), shop: true });
  // 牌樓後面一排，後面沒有街
  frontage(AREA.gate, null, 4);
  // 東邊轉角平台的外側一間，面朝平台
  house({ x: 15.25, z: -3.5, w: 3.8, d: 3.4, y0: 4.8, h: 3.4, rot: -Math.PI / 2, ground: groundUnder(13.55, 16.95, -5.4, -1.6), shop: false });
  // 往西那段石階旁邊，房子跟著石階一間比一間高
  // 排到轉角平台（x = -12）前面就停，不壓到平台和往上的石階
  for (let x = -5; x > -11.2;) {
    const w = Math.min(x + 11.9, 2.1 + R() * 0.6), cx = x - w / 2, y0 = heightIn(AREA.sB, cx, 0) - 0.1;
    house({ x: cx, z: -6.3, w: w - 0.1, d: 3.6, y0, h: 2.6 + R() * 1.0, ground: groundUnder(cx - w / 2, cx + w / 2, -8.1, -4.5), shop: false });
    x -= w;
  }
  // 下街、燈巷、工坊街、星台：每一段靠山那一側一排，背面接上一層的街
  for (const [street, up] of [['lower', 'lantern'], ['lantern', 'upper'], ['upper', 'specula'], ['specula', null]]) {
    for (const a of AREAS.filter((b) => streetOf(b) === street && b.y != null)) frontage(a, up);
  }
  // 下街中段的南邊是崖，崖邊也長了一排房子，前門朝廣場，後牆一路砌到牌樓後面
  perch(AREA.lowerB, -5.6, 5.5);
  // 街的兩頭：塔、側著開門的房子
  tower(-18, -12.4, 1.7, 6.8, 6.8);
  tower(16.2, -12.6, 1.6, 7.2, 5.6);
  house({ x: -16.3, z: -24.2, w: 4.6, d: 2.2, y0: 9.2, h: 4.2, rot: Math.PI / 2, ground: groundUnder(-17.4, -15.2, -26.5, -21.9), shop: false });
  house({ x: 13.3, z: -23, w: 4.6, d: 2.2, y0: 9.2, h: 3.8, rot: -Math.PI / 2, ground: groundUnder(12.2, 14.4, -25.3, -20.7), shop: false });
  house({ x: 15.4, z: -33.5, w: 3.6, d: 2.2, y0: 12, h: 4.0, rot: -Math.PI / 2, ground: groundUnder(14.3, 16.5, -35.3, -31.7), shop: false });
  // 星台東頭一座小圓塔
  tower(5.9, -44.5, 1.5, 14, 4.6);

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
      for (let i = 0; i < 6; i++) kk.cone(0.07, 0.3, pick(['#5a8a4a', '#8a6aa8', '#a8a04a']), x - 0.8 + i * 0.32, y + 1.6, z + 0.1, { rx: Math.PI });
      for (let i = 0; i < 4; i++) kk.cyl(0.08, 0.08, 0.18, '#a8c8b0', x - 0.5 + i * 0.32, y + 0.09, z);
    },
    lanterns(kk, x, y, z) {
      ['#e04a3a', '#e8a040', '#d86a9a', '#4a8ac8'].forEach((c, i) => lantern(kk, x - 0.8 + i * 0.53, y + 1.5, z + 0.2, 0.6, c, shade(c, 0.2)));
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
  // 櫃台到角色胸口（0.6），攤販的上半身和手露得出來；貨物大多是矮的，高的掛在上面
  const COUNTER = 0.6;
  const shops = SHOPS.map((s) => {
    const a = flatAt(s.at, s.x), y = a.y, front = a.z0 - 0.1, cz = front + 1.1;
    k.box(2.3, COUNTER - 0.04, 0.6, WOOD, s.x, y + (COUNTER - 0.04) / 2, cz, { color2: '#6a4a34' });
    k.box(2.4, 0.04, 0.7, '#a07850', s.x, y + COUNTER - 0.02, cz);
    k.box(2.32, 0.14, 0.02, s.awning, s.x, y + COUNTER - 0.17, cz + 0.31);
    for (const sx of [-1.12, 1.12]) k.box(0.08, 2.3, 0.08, DARK, s.x + sx, y + 1.15, cz + 0.26);
    // 從房子正面斜斜伸出來的小瓦頂，前緣一排短暖簾，右邊柱子掛一塊直招牌。瓦頂和暖簾一組，擋住攤販時淡掉
    const ck = new Kit(R);
    addRoof(ck, s.x, y + 1.98, front + 0.02, 2.9, 3.6, 0.32, { front: true, tile: pick(TILES), lift: 0.12, curl: 0 });
    noren(ck, s.x, y + 1.95, front + 1.7, 2.5, s.awning, 0.28);
    ck.fid = fader.add([[s.x - 1.5, y + 1.6, front - 0.05, s.x + 1.5, y + 2.45, front + 1.9]]);
    ck.emit(bucket, 0, 0, 0);
    const sh = 0.34 * [...s.sign].length;
    signs.add(s.sign, s.x + 1.31, y + 1.9 - sh / 2, cz + 0.32, 0.34, 0, { bg: '#2a1a12', fg: '#e8c878' });
    lantern(k, s.x - 1.12, y + 1.62, cz + 0.42, 0.75);
    k.pool(s.x, y, front + 2.0, 2.4, '#ffa060', 0.36);
    GOODS[s.goods](k, s.x, y + COUNTER, cz);
    obstacles.push({ x: s.x, z: front + 0.75, hw: 1.25, hd: 0.75 });
    return { id: s.id, x: s.x, y, z: front + 0.45, heading: 0 };
  });
  // 小吃推車：攤販站在推車後面，客人那邊朝街心
  for (const c of CARTS) {
    const fid = fader.add([]);
    const r = yatai(bucket, signs, R, { ...c, y: AREA[c.at].y, tile: pick(TILES), lamp: lantern, fid });
    fader.units[fid].boxes.push(r.roof);
    obstacles.push(r.obstacle);
    shops.push({ id: c.id, ...r.vendor });
  }
  // 碼頭上兩張矮桌和矮板凳，桌上擺著碗筷。桌面到角色腰，板凳比屁股低一點
  for (const sx of [-1, 1]) {
    const x = sx * 3.7, z = 9.7, T = 0.45, B = 0.26;
    k.box(1.5, 0.06, 0.75, '#8a5a36', x, T - 0.03, z, { color2: '#a07048' });
    for (const lx of [-0.65, 0.65]) for (const lz of [-0.3, 0.3]) k.box(0.06, T - 0.06, 0.06, DARK, x + lx, (T - 0.06) / 2, z + lz);
    for (const bz of [-0.7, 0.7]) {
      k.box(1.5, 0.05, 0.28, '#7a4e30', x, B - 0.025, z + bz);
      for (const lx of [-0.6, 0.6]) k.box(0.05, B - 0.05, 0.22, DARK, x + lx, (B - 0.05) / 2, z + bz);
    }
    for (let i = 0; i < 3; i++) {
      const bx = x - 0.45 + i * 0.45, bz = z + (i % 2 ? 0.15 : -0.15);
      k.cyl(0.11, 0.07, 0.08, i % 2 ? '#e8e0d0' : '#2a3a6a', bx, T + 0.04, bz, {}, 10);
      k.box(0.2, 0.01, 0.01, '#c8a878', bx + 0.08, T + 0.09, bz + 0.1, { ry: 0.3 });
      if (i !== 1) k.puff(bx, T + 0.1, bz, 'steam', 0.45);
    }
    k.cyl(0.05, 0.05, 0.12, '#c8b898', x + 0.6, T + 0.06, z - 0.2, {}, 8);
    lantern(k, x, 2.2, z, 0.8);
    k.box(0.02, 1.2, 0.02, DARK, x, 3.0, z);
    k.pool(x, 0, z, 2.2, '#ffa060', 0.3);
    obstacles.push({ x, z, hw: 0.85, hd: 1.0 });
  }
  // 信差站門口的紅郵筒，玻璃工坊裡的爐火（店面在 shops 裡，z 是攤販站的地方，正面再往北 0.45）
  k.cyl(0.22, 0.22, 1.0, '#b8322a', -3.0, 0.5, 6.0, {}, 10);
  k.ball(0.23, '#b8322a', -3.0, 1.0, 6.0, { sy: 0.6 });
  obstacles.push({ x: -3.0, z: 6.0, hw: 0.28, hd: 0.28 });
  {
    const g = shops.find((s) => s.id === 'glass');
    k.plane(1.0, 0.8, '#ff8a3a', g.x, g.y + 0.9, g.z - 0.38, { glow: true, color2: '#ffd070' });
    k.light(g.x, g.y + 0.9, g.z + 0.05, '#ff8a3a', 1.4);
  }

  // ---------- 街上的燈籠串 ----------
  // 碼頭：兩角立竹竿，拉三條到信差站和魚市的屋簷
  for (const sx of [-1, 1]) {
    k.box(0.1, 3.8, 0.1, DARK, sx * 7.75, 1.9, 11.75);
    k.box(0.1, 3.8, 0.1, DARK, sx * 7.75, 1.9, 6.4);
    string(sx * 7.75, 11.75, sx * 2.4, 5.3, 3.3, 1.5);
    string(sx * 7.75, 6.4, sx * 7.75, 11.75, 3.4, 1.4);
  }
  string(-7.75, 9.1, 7.75, 9.1, 3.7, 1.6);
  // 鎮上：每一段街的上空斜斜地來回拉，寬的地方再橫拉一條
  for (const a of AREAS) {
    if (a.y == null || !a.street) continue;
    const y = a.y + 2.9;
    for (let x = a.x0 + 0.4; x < a.x1 - 1.2; x += 3 + R() * 1.2) string(x, a.z1 - 0.4, Math.min(a.x1 - 0.3, x + 3.2), a.z0 + 0.7, y + R() * 0.3, 1.25);
    if (a.z1 - a.z0 > 5.5) string(a.x0 + 0.3, (a.z0 + a.z1) / 2, a.x1 - 0.3, (a.z0 + a.z1) / 2 + (R() - 0.5), y + 0.45, 1.6);
  }
  // 星台四角的燈柱
  const SP = AREA.specula;
  for (const [x, z] of [[SP.x0 + 0.4, SP.z0 + 0.4], [SP.x1 - 0.6, SP.z0 + 0.4], [SP.x0 + 0.4, SP.z1 - 0.4], [SP.x1 - 0.6, SP.z1 - 0.4]]) {
    k.box(0.12, 2.2, 0.12, DARK, x, 14 + 1.1, z);
    lantern(k, x, 14 + 2.0, z, 0.9);
    obstacles.push({ x, z, hw: 0.12, hd: 0.12 });
  }
  // 星台上的望遠鏡
  {
    const x = -12, z = -45, y = 14;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.cyl(0.03, 0.03, 1.3, '#8a6a3a', x + Math.cos(a) * 0.25, y + 0.62, z + Math.sin(a) * 0.25, { rx: Math.sin(a) * 0.2, rz: -Math.cos(a) * 0.2 }, 5);
    }
    k.cyl(0.08, 0.12, 1.1, GOLD, x, y + 1.45, z + 0.1, { rx: 1.1 }, 8);
    obstacles.push({ x, z, hw: 0.4, hd: 0.4 });
  }

  // ---------- 遠眺台：山頂一圈矮石牆和幾塊立石，只有一盞冷冷的小燈，看得到整座鎮和海 ----------
  {
    const S = AREA.summit, y = S.y, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = cx + Math.cos(a) * 3.4, z = cz + Math.sin(a) * 1.9, h = 1.2 + R() * 0.8;
      if (z > cz - 0.3) continue;   // 只立在北側，往海那邊不擋
      k.box(0.5, h, 0.32, '#5a5862', x, y + h / 2, z, { ry: -a, color2: '#6a6872' });
      obstacles.push({ x, z, hw: 0.32, hd: 0.32 });
    }
    const lx = S.x1 - 1, lz = S.z0 + 0.6;
    k.box(0.1, 1.8, 0.1, DARK, lx, y + 0.9, lz);
    k.cyl(0.06, 0.07, 0.18, '#a8c8ff', lx, y + 1.9, lz, { glow: true });
    k.light(lx, y + 1.9, lz, '#8ab0ff', 0.35);
    obstacles.push({ x: lx, z: lz, hw: 0.12, hd: 0.12 });
  }

  // 工坊街西邊那棵大楓樹：彎彎曲曲的樹幹，紅葉裡掛著一盞一盞小紙燈
  {
    const x = -13.8, z = -34.6, y = terrain(x, z);
    k.cyl(0.5, 0.8, 4.5, '#4a3428', x, y + 2.25, z, { rz: 0.12 }, 7);
    k.cyl(0.3, 0.45, 3, '#4a3428', x + 0.6, y + 5.2, z - 0.2, { rz: -0.4 }, 6);
    // 樹冠和裡面的紙燈一組，擋住鏡頭時淡掉。紅要比瓦頂亮一截，夜裡才不會變成一團暗褐
    const ck = new Kit(R);
    for (const [dx, dy, dz, r] of [[0.8, 7.4, 0, 1.8], [-1.4, 6.5, 0.6, 1.6], [1.8, 6.1, -1.0, 1.5], [-0.4, 8.4, -0.8, 1.4], [2.2, 7.4, 0.8, 1.3], [-1.8, 7.6, -1.0, 1.3], [0.4, 6.0, 1.6, 1.4]]) {
      const c = pick(['#a8342a', '#b84430', '#963026', '#c45a34']);
      ck.rock(r, c, x + dx, y + dy, z + dz, { sy: 0.7, ry: R() * 3, color2: shade(c, 0.08), ao: false });
    }
    for (let i = 0; i < 12; i++) {
      const a = R() * Math.PI * 2, fy = y + 5.2 + R() * 2.6, fr = 2.0 + R() * 0.7, fx = x + 0.2 + Math.cos(a) * fr, fz = z - 0.2 + Math.sin(a) * fr;
      lantern(ck, fx, fy, fz, 0.55, i % 3 ? PAPER : LAMP, '#fff0d0');
    }
    ck.fid = fader.add([[x - 3.6, y + 4.3, z - 3.6, x + 3.6, y + 9.8, z + 3.6]]);
    ck.emit(bucket, 0, 0, 0);
    solid(x - 3, x + 3, z - 3, z + 3, y + 10);
  }

  // ---------- 港口：漁港、防波堤、渡船口 ----------
  // 西邊的漁港停著亮集魚燈的漁船，三道小棧橋，最外面一道防波堤，盡頭一座紅燈塔。
  // 東邊的渡船口是一道石堤，大渡船照時刻進出，靠岸時吊桿把貨吊上來；海上有小舢舨划來划去，外海一艘屋形船慢慢繞。
  // 船怎麼動只看現在幾點，每個人看到的一樣（harborFx，在 update 裡算）。
  // 這一段放在鎮上的房子後面才蓋，前面每間房子抽到的亂數都不變
  const harborFx = [], shimmerMore = [];
  // 繫船柱：岸邊一根矮矮的鐵墩
  const bollard = (x, z, y = 0) => {
    k.cyl(0.11, 0.14, 0.36, '#2a2a2e', x, y + 0.18, z, {}, 8);
    k.cyl(0.17, 0.17, 0.06, '#2a2a2e', x, y + 0.38, z, {}, 8);
    obstacles.push({ x, z, hw: 0.15, hd: 0.15 });
  };
  // 岸邊的燈柱：木柱頂上一盞燈籠，燈影落在海上
  const quayLamp = (x, z) => {
    k.box(0.1, 2.2, 0.1, DARK, x, 1.1, z);
    lantern(k, x, 2.45, z, 0.85);
    k.pool(x, 0, z - 0.5, 1.6, '#ffa060', 0.22);
    obstacles.push({ x, z, hw: 0.08, hd: 0.08 });
    shimmerMore.push({ x: x + (R() - 0.5) * 0.3, z: z + 0.4, w: 0.32, l: 3 + R() * 2, color: '#ff7a40', a: 0.5 });
  };
  // 會跟著時間動的東西：零件在原點蓋好，整組放進一個 group
  const vessel = (build) => {
    const vk = new Kit(R), vb = newBucket(), g = new THREE.Group();
    build(vk);
    vk.emit(vb, 0, 0, 0);
    for (const o of bucketObjects(vb)) g.add(o);
    g.rotation.order = 'YXZ';
    group.add(g);
    return g;
  };
  const bob = (g, now, ph, y) => {
    g.position.y = y + Math.sin(now * 1.2 + ph) * 0.05;
    g.rotation.x = Math.sin(now * 0.8 + ph) * 0.025;
    g.rotation.z = Math.sin(now * 1.0 + ph * 1.7) * 0.04;
  };
  // 往 (dx, dz) 走的時候船頭（本地 +z）要轉的角度
  const headingOf = (dx, dz) => Math.atan2(dx, dz);

  // 木頭小棧橋：跟長棧橋一樣一片一片木板，底下一排木樁，盡頭兩根繫船柱和一盞燈
  for (const a of AREAS.filter((a) => a.deck)) {
    const w = a.x1 - a.x0, cx = (a.x0 + a.x1) / 2;
    for (let z = a.z0 + 0.15; z < a.z1; z += 0.3) k.box(w, 0.08, 0.27, pick(['#8a6a48', '#7a5a3a', '#93724e']), cx, -0.04, z, { ry: (R() - 0.5) * 0.03 });
    for (let z = a.z0 + 1; z < a.z1; z += 2.5) for (const sx of [a.x0 + 0.08, a.x1 - 0.08]) k.cyl(0.11, 0.13, 2.4, '#4a3626', sx, -1.1, z, {}, 7);
    k.box(0.1, 1.5, 0.1, DARK, a.x1 - 0.1, 0.75, a.z1 - 0.15);
    lantern(k, a.x1 - 0.1, 1.75, a.z1 - 0.15, 0.75);
    shimmerMore.push({ x: a.x1 - 0.1, z: a.z1 + 0.3, w: 0.3, l: 3 + R() * 1.5, color: '#ff7a40', a: 0.5 });
  }

  // 岸壁：靠海的邊上一道深色的壓邊石，一排繫船柱和燈柱，燈柱之間拉燈籠串
  for (const [x0, x1] of [[-27, -24.2], [-22.8, -19.2], [-17.8, -14.2], [-12.8, -8], [8, 10], [13, 15]]) {
    k.box(x1 - x0, 0.1, 0.22, '#4a4a50', (x0 + x1) / 2, 0.05, 8.89);
  }
  for (const x of [-25.6, -21.2, -16.0, -11.6, 9.3, 14.2]) bollard(x, 8.78);
  const lampsW = [-26.4, -20.6, -15.2, -9.6], lampsE = [8.6, 14.6];
  for (const x of [...lampsW, ...lampsE]) quayLamp(x, 8.84);
  for (let i = 0; i < lampsW.length - 1; i++) string(lampsW[i], 8.84, lampsW[i + 1], 8.84, 2.5, 1.4);

  // 倉庫：石砌牆腳，下半截黑色雨淋板，上半截白灰牆，大門上一道小披簷，正面掛屋號。
  // zf 是正面的 z，房子往北長 d。open 的大門開著，裡面亮燈、堆著貨
  const warehouse = (cx, zf, w, d, h, mark, open) => {
    const wk = new Kit(R), zc = zf - d / 2, ground = groundUnder(cx - w / 2, cx + w / 2, zf - d, zf), tile = pick(TILES), wall = pick(PLASTER);
    wk.box(w + 0.1, 0.7 - ground, d + 0.1, '#5a5a60', cx, (0.3 + ground - 0.4) / 2, zc, { color2: '#74747a' });
    wk.box(w, 1.4, d, '#2e2622', cx, 1.0, zc, { color2: '#3a302a' });
    wk.box(w - 0.04, h - 1.7, d - 0.04, wall, cx, (h + 1.7) / 2, zc, { color2: shade(wall, -0.03) });
    for (const sx of [-1, 1]) wk.box(0.16, h - 0.3, 0.16, DARK, cx + sx * (w / 2 - 0.06), (h + 0.3) / 2, zf - 0.06);
    const dw = Math.min(2.6, w * 0.45);
    if (open) {
      wk.plane(dw, 2.2, '#ffb060', cx, 1.4, zf + 0.02, { glow: true, color2: '#ffd8a0' });
      for (let i = 0; i < 3; i++) wk.box(0.55, 0.45, 0.5, '#7a5a3a', cx - dw / 2 + 0.45 + i * 0.6, 0.53 + (i === 1 ? 0.45 : 0), zf - 0.3, { color2: '#9a7a52' });
      k.pool(cx, 0, zf + 1.3, 2.4, '#ffa860', 0.3);
    } else {
      wk.box(dw, 2.2, 0.06, '#4a3428', cx, 1.4, zf + 0.03, { color2: '#5a4030' });
      wk.box(0.04, 2.2, 0.08, DARK, cx, 1.4, zf + 0.06);
    }
    wk.box(dw + 0.3, 0.16, 0.12, DARK, cx, 2.58, zf + 0.06);
    addRoof(wk, cx, 2.85, zf, dw + 1.4, 1.5, 0.32, { front: true, tile, lift: 0.08, curl: 0 });
    for (const sx of [-1, 1]) {
      lattice(wk, cx + sx * w * 0.32, h - 0.85, zf + 0.025, 0.7, 0.6, R() < 0.6);
      lantern(wk, cx + sx * (dw / 2 + 0.35), 2.35, zf + 0.4, 0.8);
    }
    signs.add(mark, cx, h - 0.85, zf + 0.04, 0.5, 0, { bg: '#2a1a12', fg: '#e8c878' });
    const RH = d * 0.3;
    addRoof(wk, cx, h, zc, w + 0.7, d + 0.9, RH, { tile, end: wall, lift: 0.18, ridge: (w + 0.7) / 2, seg: coarse ? 0.6 : 1 });
    solid(cx - w / 2 - 0.4, cx + w / 2 + 0.4, zf - d - 0.45, zf + 0.45, h + RH);
    wk.fid = fader.add([[cx - w / 2 - 0.4, ground, zf - d - 0.5, cx + w / 2 + 0.4, h + RH + 0.2, zf + 0.9]]);
    wk.emit(bucket, 0, 0, 0);
  };
  warehouse(-18.3, 4.95, 5.2, 4.2, 4.4, '丸', false);
  warehouse(-12.1, 4.95, 6.0, 4.2, 4.8, '海', true);
  warehouse(11.9, 4.95, 5.4, 4.2, 4.2, '渡', true);

  // 晒網小屋：石階西邊，只有後牆和屋頂，柱子上掛著漁網和浮球
  {
    const cx = -25.4, zf = 4.95, w = 2.6, d = 2.4, nk = new Kit(R), ground = groundUnder(cx - w / 2, cx + w / 2, zf - d, zf);
    nk.box(w, 2.4 - ground, 0.12, '#4a3428', cx, (2.4 + ground) / 2, zf - d, { color2: '#5a4030' });
    for (const sx of [-1, 1]) for (const z of [zf - 0.1, zf - d + 0.1]) nk.box(0.12, 2.5 - ground, 0.12, DARK, cx + sx * (w / 2 - 0.06), (2.5 + ground) / 2, z);
    addRoof(nk, cx, 2.5, zf - d / 2, w + 0.6, d + 0.8, 0.6, { tile: pick(TILES), lift: 0.12, ridge: (w + 0.6) / 2 });
    for (let i = 0; i < 3; i++) nk.box(0.7, 1.4 + R() * 0.4, 0.03, pick(['#2a4a3a', '#3a5a4a', '#4a5a3a']), cx - 0.85 + i * 0.85, 1.4, zf - 0.2, { ry: (R() - 0.5) * 0.3 });
    for (let i = 0; i < 5; i++) nk.ball(0.1, i % 2 ? '#e8602a' : '#f0e8d8', cx - 1 + i * 0.5, 2.1 - (i % 2) * 0.15, zf - 0.15);
    lantern(nk, cx + w / 2 - 0.1, 2.15, zf + 0.15, 0.75);
    solid(cx - w / 2 - 0.3, cx + w / 2 + 0.3, zf - d - 0.3, zf + 0.3, 3.2);
    nk.fid = fader.add([[cx - w / 2 - 0.4, ground, zf - d - 0.4, cx + w / 2 + 0.4, 3.2, zf + 0.5]]);
    nk.emit(bucket, 0, 0, 0);
  }

  // 岸上的雜物：木箱、魚箱、木桶、一台手推車、一堆漁網。都靠著倉庫那一側，靠海那邊留給人走
  const crate = (x, z, s = 0.6, y = 0) => {
    k.box(s, s * 0.8, s, '#7a5a3a', x, y + s * 0.4, z, { ry: (R() - 0.5) * 0.4, color2: '#9a7a52' });
  };
  for (const [x, z, n] of [[-14.6, 5.55, 3], [-9.5, 5.5, 2], [-20.4, 5.5, 2], [9.7, 5.5, 3]]) {
    for (let i = 0; i < n; i++) crate(x + (i % 2) * 0.62, z, 0.6, i > 1 ? 0.48 : 0);
    obstacles.push({ x: x + 0.3, z, hw: 0.7, hd: 0.4 });
  }
  // 魚箱：一排藍白相間的淺箱子，鋪著冰，躺著幾條魚
  for (let i = 0; i < 5; i++) {
    const x = -12.6 + i * 0.62, z = 5.75;
    k.box(0.56, 0.16, 0.4, i % 2 ? '#2a4a8a' : '#e8e8ec', x, 0.08, z);
    k.box(0.5, 0.02, 0.34, '#d8eef4', x, 0.17, z);
    for (let f = 0; f < 2; f++) k.ball(0.06, pick(['#b8c4cc', '#e0a050', '#c8a8b8']), x - 0.1 + f * 0.2, 0.2, z, { sx: 2.2, sy: 0.5 });
  }
  obstacles.push({ x: -11.36, z: 5.75, hw: 1.5, hd: 0.3 });
  for (const [x, z] of [[-16.4, 5.45], [-15.9, 5.6], [8.7, 5.45]]) {
    k.cyl(0.25, 0.25, 0.65, '#6a4a30', x, 0.33, z, { color2: '#8a6440' }, 10);
    k.torus(0.25, 0.025, Math.PI * 2, DARK, x, 0.15, z, { rx: Math.PI / 2 });
    k.torus(0.25, 0.025, Math.PI * 2, DARK, x, 0.5, z, { rx: Math.PI / 2 });
    obstacles.push({ x, z, hw: 0.28, hd: 0.28 });
  }
  {
    const x = -18.6, z = 5.7;
    k.box(1.1, 0.08, 0.7, '#8a6440', x, 0.55, z);
    for (const sz of [-1, 1]) k.box(1.1, 0.25, 0.04, '#7a5636', x, 0.7, z + sz * 0.33);
    for (const sz of [-1, 1]) k.torus(0.28, 0.05, Math.PI * 2, DARK, x - 0.1, 0.28, z + sz * 0.42);
    for (const sz of [-1, 1]) k.box(0.9, 0.05, 0.05, WOOD, x + 0.9, 0.62, z + sz * 0.28, { rz: 0.15 });
    crate(x - 0.2, z, 0.45, 0.6);
    obstacles.push({ x: x + 0.3, z, hw: 0.9, hd: 0.45 });
  }
  k.rock(0.55, '#2a4a3a', -24.6, 0.12, 6.0, { sy: 0.4, sx: 1.4, color2: '#3a5a48' });
  obstacles.push({ x: -24.6, z: 6.0, hw: 0.7, hd: 0.45 });

  // 防波堤：外側堆一排大石塊擋浪，靠港內那邊三盞燈，盡頭一座紅白相間的燈塔，紅燈一閃一閃
  {
    const M = AREA.mole;
    for (let z = M.z0 + 1; z < M.z1 + 1.5; z += 1.1 + R() * 0.4) {
      k.rock(0.6 + R() * 0.5, pick(['#5a5a60', '#62626a', '#54545a']), M.x0 - 0.5 - R() * 0.5, SEA + 0.1 + R() * 0.35, z, { sy: 0.8, ry: R() * 3, color2: '#7a7a80', ao: false });
    }
    for (let i = 0; i < 4; i++) k.rock(0.6 + R() * 0.4, '#5a5a60', M.x0 + 0.4 + i * 0.5, SEA + 0.15, M.z1 + 0.6 + R() * 0.4, { sy: 0.8, ry: R() * 3, ao: false });
    for (const z of [12, 18]) {
      k.box(0.1, 1.6, 0.1, DARK, M.x1 - 0.12, 0.8, z);
      lantern(k, M.x1 - 0.12, 1.85, z, 0.8);
      obstacles.push({ x: M.x1 - 0.12, z, hw: 0.08, hd: 0.08 });
      shimmerMore.push({ x: M.x1 + 0.2, z: z + 0.2, w: 0.3, l: 3.5, color: '#ff7a40', a: 0.45 });
    }
    const lx = (M.x0 + M.x1) / 2, lz = M.z1 - 0.9;
    k.cyl(0.62, 0.78, 4.2, '#ece6dc', lx, 2.1, lz, { color2: '#f4f0e8' }, 12);
    for (const y of [1.0, 2.6]) k.cyl(0.66, 0.7, 0.45, '#a8322a', lx, y, lz, {}, 12);
    k.cyl(0.85, 0.85, 0.1, DARK, lx, 4.25, lz, {}, 12);
    k.cyl(0.42, 0.42, 0.6, '#ffd8c0', lx, 4.6, lz, { glow: true }, 10);
    k.cone(0.55, 0.6, '#a8322a', lx, 5.2, lz);
    obstacles.push({ x: lx, z: lz, hw: 0.8, hd: 0.8 });
    const beacon = glowPoints([{ x: lx, y: 4.6, z: lz, color: '#ff4a2a', size: 16 }]), bs = beacon.geometry.attributes.aSize;
    group.add(beacon);
    shimmerMore.push({ x: lx, z: lz + 1, w: 0.5, l: 6, color: '#ff4a2a', a: 0.35 });
    // 每六秒閃兩下
    harborFx.push((now) => {
      const f = now % 6;
      bs.setX(0, 4 + 30 * (bump(f, 0.3, 0.12) + bump(f, 0.9, 0.12)));
      bs.needsUpdate = true;
    });
  }

  // 渡船口：石堤入口一座木門框掛著「渡」字，西邊一排燈，東邊一排繫船柱，靠岸處有吊桿；岸上一座小售票亭
  {
    const F = AREA.ferry;
    for (const sx of [F.x0 + 0.2, F.x1 - 0.2]) {
      k.box(0.18, 3.2, 0.18, '#8a2a22', sx, 1.6, F.z0 + 0.4);
      obstacles.push({ x: sx, z: F.z0 + 0.4, hw: 0.1, hd: 0.1 });
    }
    k.box(F.x1 - F.x0 + 0.3, 0.16, 0.24, '#8a2a22', (F.x0 + F.x1) / 2, 3.1, F.z0 + 0.4);
    k.box(F.x1 - F.x0 + 0.6, 0.1, 0.3, DARK, (F.x0 + F.x1) / 2, 3.24, F.z0 + 0.4);
    for (const [dz, ry] of [[0.14, 0], [-0.14, Math.PI]]) signs.add('渡', (F.x0 + F.x1) / 2, 2.72, F.z0 + 0.4 + dz, 0.42, ry, { bg: '#f0e0c0', fg: '#8a1e14' });
    for (const sx of [F.x0 + 0.2, F.x1 - 0.2]) lantern(k, sx, 2.75, F.z0 + 0.62, 0.8);
    const jl = [12.5, 16.5, 20.4];
    for (const z of jl) quayLamp(F.x0 + 0.15, z);
    for (let i = 0; i < jl.length - 1; i++) string(F.x0 + 0.15, jl[i], F.x0 + 0.15, jl[i + 1], 2.5, 1.4);
    for (const z of [11.2, 13.8, 17.2, 20.2]) bollard(F.x1 - 0.2, z);
    // 售票亭
    const bx = 14.2, bz = 6.2, tk = new Kit(R);
    tk.box(1.3, 2.1, 1.2, '#4a3428', bx, 1.05, bz, { color2: '#5a4030' });
    tk.plane(0.8, 0.6, PAPER, bx - 0.66, 1.35, bz, { glow: true, ry: -Math.PI / 2, color2: '#ffeccc' });
    tk.plane(0.8, 0.6, PAPER, bx, 1.35, bz + 0.61, { glow: true, color2: '#ffeccc' });
    addRoof(tk, bx, 2.1, bz, 1.9, 1.8, 0.5, { tile: pick(TILES), lift: 0.15, ridge: 0.95 });
    signs.add('渡船', bx - 0.67, 1.95 - 0.36, bz + 0.4, 0.3, -Math.PI / 2, { bg: '#2a1a12', fg: '#e8c878' });
    lantern(tk, bx - 0.75, 1.95, bz - 0.45, 0.7);
    tk.fid = fader.add([[bx - 1, 0, bz - 1, bx + 1, 2.8, bz + 1]]);
    tk.emit(bucket, 0, 0, 0);
    k.pool(bx - 1, 0, bz + 0.5, 1.6, '#ffa860', 0.25);
    obstacles.push({ x: bx, z: bz, hw: 0.7, hd: 0.65 });
  }

  // 小祠：漁港上去那個平台，北邊一座小小的祠，前面兩座石燈籠，石階頂上一座紅鳥居
  {
    const P = AREA.shrine, y = P.y, cx = -21.75, cz = P.z0 - 0.75, sk = new Kit(R);
    const ground = groundUnder(cx - 0.9, cx + 0.9, cz - 0.8, cz + 0.8);
    sk.box(1.9, y + 0.15 - ground, 1.6, '#5a5a60', cx, (y + 0.15 + ground) / 2, cz, { color2: '#74747a' });
    sk.box(1.2, 1.1, 0.9, '#5a3826', cx, y + 0.7, cz, { color2: '#6a4430' });
    sk.plane(0.7, 0.6, PAPER, cx, y + 0.75, cz + 0.46, { glow: true, color2: '#fff0d0' });
    for (const sx of [-0.62, 0.62]) sk.box(0.1, 1.2, 0.1, '#a8322a', cx + sx, y + 0.75, cz + 0.45);
    addRoof(sk, cx, y + 1.25, cz, 1.9, 1.7, 0.55, { tile: '#2c3038', lift: 0.22, ridge: 0.95 });
    sk.box(0.5, 0.35, 0.3, '#4a3428', cx, y + 0.18, P.z0 + 0.35, { color2: '#6a4a34' });
    sk.light(cx, y + 0.75, cz + 0.7, '#ffcf80', 0.6);
    sk.fid = fader.add([[cx - 1.1, ground, cz - 1, cx + 1.1, y + 2, cz + 1]]);
    sk.emit(bucket, 0, 0, 0);
    obstacles.push({ x: cx, z: P.z0 + 0.35, hw: 0.28, hd: 0.18 });
    solid(cx - 1.1, cx + 1.1, cz - 1, cz + 0.8, y + 2);
    // 石燈籠
    for (const x of [-23.3, -20.7]) {
      const z = P.z0 + 0.5;
      k.cyl(0.18, 0.24, 0.12, '#7a7a80', x, y + 0.06, z, {}, 6);
      k.cyl(0.07, 0.09, 0.6, '#7a7a80', x, y + 0.42, z, {}, 6);
      k.box(0.3, 0.26, 0.3, '#ffd890', x, y + 0.85, z, { glow: true, color2: '#fff0c0' });
      k.cone(0.3, 0.22, '#6a6a70', x, y + 1.09, z);
      k.light(x, y + 0.85, z, '#ffcf80', 0.5);
      obstacles.push({ x, z, hw: 0.2, hd: 0.2 });
    }
    k.pool(cx, y, P.z0 + 1.4, 2.2, '#ffa060', 0.3);
    // 鳥居：立在石階頂，柱子在石階兩邊的矮牆裡面
    const tz0 = P.z1 - 0.3, red = '#b8322a', A = AREA.sW1;
    for (const x of [A.x0 + 0.12, A.x1 - 0.12]) {
      k.cyl(0.09, 0.1, 2.4, red, x, y + 1.2, tz0, {}, 8);
      k.cyl(0.13, 0.13, 0.16, DARK, x, y + 0.08, tz0, {}, 8);
      obstacles.push({ x, z: tz0, hw: 0.1, hd: 0.1 });
    }
    k.box(A.x1 - A.x0 + 0.1, 0.09, 0.1, red, (A.x0 + A.x1) / 2, y + 2.05, tz0);
    k.box(A.x1 - A.x0 + 0.7, 0.13, 0.2, red, (A.x0 + A.x1) / 2, y + 2.42, tz0);
    k.box(A.x1 - A.x0 + 0.9, 0.08, 0.24, DARK, (A.x0 + A.x1) / 2, y + 2.53, tz0);
  }

  // 往東那段石階的北邊，房子跟著石階一間比一間高（跟西邊那段對稱）
  for (let x = 5; x < 9.6;) {
    const w = Math.min(9.9 - x, 2.1 + R() * 0.6), cx = x + w / 2, y0 = heightIn(AREA.sEa, cx, 0) - 0.1;
    house({ x: cx, z: -6.3, w: w - 0.1, d: 3.6, y0, h: 2.6 + R() * 1.0, ground: groundUnder(cx - w / 2, cx + w / 2, -8.1, -4.5), shop: false });
    x += w;
  }

  // ---------- 欄杆：自動圍 ----------
  // 每塊路面的四邊掃一遍：外面接著別的路就不圍，有房子、石階的矮牆擋著也不圍，外面往下掉才圍。
  // 港邊（高度 0）一律不圍。石階兩側本來就有矮牆，坡道照平均高度圍
  for (const a of AREAS) {
    if (a.lo != null && !a.slope) continue;
    const y = a.y ?? (a.lo + a.hi) / 2;
    if (y < 0.5) continue;
    for (const [ax, az, bx, bz, nx, nz] of [[a.x0, a.z0, a.x1, a.z0, 0, -1], [a.x0, a.z1, a.x1, a.z1, 0, 1], [a.x0, a.z0, a.x0, a.z1, -1, 0], [a.x1, a.z0, a.x1, a.z1, 1, 0]]) {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 0.25)), pt = (t) => [ax + (bx - ax) * t - nx * 0.12, az + (bz - az) * t - nz * 0.12];
      let start = -1;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, ox = x + nx * 0.3, oz = z + nz * 0.3;
        const b = areaAt(ox, oz), open = b && Math.abs(heightIn(b, ox, oz) - heightIn(a, x, z)) < 0.35;
        const walled = solids.some((s) => !s.ground && ox > s.x0 && ox < s.x1 && oz > s.z0 && oz < s.z1);
        const need = i < n && !open && !walled && groundY(ox, oz) < y - 0.8;
        if (need && start < 0) start = t;
        if (!need && start >= 0) {
          rail(...pt(start), ...pt(t), y);
          start = -1;
        }
      }
    }
  }

  // ---------- 船 ----------
  // 漁船：船身中段一頂竹蓆篷，船尾一盞紙燈籠；船頭伸出一根竿子，吊著燒柴的鐵火籠，夜裡用火光引魚
  const fishingBoat = (vk, len, beam, color) => {
    vk.add(hull(len, beam, 0.7, { y: 0.4, w: 0.86 }), color, 0, 0, 0, { color2: shade(color, 0.12), ao: false });
    const r = beam * 0.38;
    vk.add(new THREE.CylinderGeometry(r, r, len * 0.36, 9, 1, true, Math.PI / 2, Math.PI), '#8a6a3a', 0, -0.28, -len * 0.08, { rx: Math.PI / 2, color2: '#a8864a' });
    for (const dz of [-0.17, 0.17]) vk.torus(r + 0.01, 0.025, Math.PI, '#5a4028', 0, -0.28, -len * 0.08 + dz * len, {});
    lantern(vk, 0, 0.55, -len * 0.42, 0.55);
    // 火籠：竿子從船頭斜斜伸出去，尾端吊一個鐵籠子，裡面的火一團橘紅
    const bz = len * 0.42;
    vk.box(0.05, 0.05, 1.5, WOOD, 0, 0.55, bz + 0.3, { rx: -0.45 });
    const fz = bz + 0.95, fy = 0.65;
    vk.cyl(0.2, 0.13, 0.32, '#2a2622', 0, fy, fz, {}, 6);
    vk.rock(0.15, '#ff4a12', 0, fy + 0.08, fz, { glow: true, sy: 1.3, color2: '#ffa030' });
    vk.light(0, fy + 0.1, fz, '#ff8a3a', 1.3);
  };
  for (const [x, z, len, beam, color, ph] of [[-25.6, 13, 5, 1.5, '#2a4a6a', 0], [-21.95, 13.5, 4.6, 1.45, '#8a2a22', 1.7], [-20.05, 12.4, 4.2, 1.4, '#2a5a4a', 3.1], [-11.9, 12.6, 4.8, 1.5, '#e0d8c8', 4.4]]) {
    const g = vessel((vk) => fishingBoat(vk, len, beam, color));
    g.position.set(x, SEA + 0.45, z);
    g.rotation.y = R() < 0.5 ? 0 : Math.PI;
    harborFx.push((now) => bob(g, now, ph, SEA + 0.45));
    shimmerMore.push({ x, z: z + len * 0.6 * Math.cos(g.rotation.y), w: 0.5, l: 4, color: '#ff8a3a', a: 0.4 });
  }

  // 舢舨：一個人戴斗笠站在船尾搖櫓，船頭一盞燈
  const sampan = (vk, passenger) => {
    vk.add(hull(3.4, 1.1, 0.45, { y: 0.5, w: 0.8 }), '#5a3e2a', 0, 0, 0, { color2: '#7a5a3a', ao: false });
    vk.cyl(0.15, 0.2, 0.62, pick(['#2a3a6a', '#5a4a3a', '#3a4a3a']), 0, 0.1, -1.1, {}, 7);
    vk.ball(0.13, '#e0a87e', 0, 0.52, -1.1);
    vk.cone(0.34, 0.16, '#c8a860', 0, 0.68, -1.1);
    vk.box(0.04, 0.04, 1.6, WOOD, 0.18, 0.15, -1.55, { rx: 0.5 });
    if (passenger) {
      vk.box(0.4, 0.35, 0.35, pick(['#7a2a2a', '#2a4a3a', '#4a3a6a']), 0, -0.02, 0.3);
      vk.ball(0.12, '#c8946a', 0, 0.27, 0.3);
    }
    vk.cyl(0.02, 0.02, 0.9, DARK, 0, 0.3, 1.3, {}, 4);
    lantern(vk, 0, 0.82, 1.3, 0.5);
  };
  // 一艘在港外繞一個扁扁的圈，一艘從漁港的空泊位划出去、繞過棧橋外面再划回來
  {
    const g = vessel((vk) => sampan(vk, true)), T = 150;
    harborFx.push((now) => {
      const a = ((now % T) / T) * Math.PI * 2, x = -8 + Math.cos(a) * 16, z = 40 + Math.sin(a) * 4;
      g.position.x = x;
      g.position.z = z;
      g.rotation.y = headingOf(-Math.sin(a) * 16, Math.cos(a) * 4);
      bob(g, now, 2.2, SEA + 0.3);
    });
  }
  {
    const g = vessel((vk) => sampan(vk, false)), T = 110;
    const path = new THREE.CatmullRomCurve3([[-16, 13.5], [-16.4, 22], [-14.5, 30], [-9, 33], [-7.5, 28], [-10, 22.5], [-15.2, 17.2]].map(([x, z]) => new THREE.Vector3(x, 0, z)), true);
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    harborFx.push((now) => {
      const u = (now % T) / T;
      path.getPointAt(u, p);
      path.getTangentAt(u, d);
      g.position.x = p.x;
      g.position.z = p.z;
      g.rotation.y = headingOf(d.x, d.z);
      bob(g, now, 0.6, SEA + 0.3);
    });
  }

  // 畫舫：外海一艘長長的遊船，整排雕花紙窗亮著，屋頂兩頭翹起，簷下掛紅燈籠，慢慢繞一個大圈
  {
    const g = vessel((vk) => {
      vk.add(hull(7.5, 2.4, 0.6, { y: 0.45, w: 0.9 }), '#3a2a20', 0, 0, 0, { color2: '#5a4030', ao: false });
      vk.box(1.9, 1.0, 5.4, '#5a2a22', 0, 0.25, -0.2);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          vk.plane(0.75, 0.55, PAPER, sx * 0.96, 0.32, -2.3 + i * 1.05, { glow: true, ry: (sx * Math.PI) / 2, color2: '#ffeccc' });
          vk.torus(0.24, 0.03, Math.PI * 2, '#3a2a1e', sx * 0.97, 0.32, -2.3 + i * 1.05, { ry: (sx * Math.PI) / 2 });
          lantern(vk, sx * 1.15, 0.78, -2.3 + i * 1.05, 0.5);
        }
      }
      addRoof(vk, 0, 0.75, -0.2, 6.0, 2.6, 0.5, { ry: Math.PI / 2, tile: '#2a2c32', lift: 0.35, ridge: 3.0, curl: 0.3 });
    });
    const T = 420;
    harborFx.push((now) => {
      const a = ((now % T) / T) * Math.PI * 2, x = -5 + Math.cos(a) * 45, z = 70 + Math.sin(a) * 10;
      g.position.x = x;
      g.position.z = z;
      g.rotation.y = headingOf(-Math.sin(a) * 45, Math.cos(a) * 10);
      bob(g, now, 5.1, SEA + 0.3);
    });
  }

  // 大渡船：木造的樓船，兩層船樓開著一整排紙窗，中間一根桅杆掛著收起一半的竹骨硬帆。十分鐘一班：
  // 從外海開進來、船頭朝岸靠在石堤東邊，停四分多鐘；倒退出去、在港外掉頭，再往外海開走，消失在霧裡
  {
    const g = vessel((vk) => {
      vk.add(hull(9, 3, 1.2, { y: 0.35, w: 0.88 }), '#4a3226', 0, 0, 0, { color2: '#6a4a34', ao: false });
      vk.box(2.3, 1.3, 4.6, '#5a3826', 0, 0.23, -1.2, { color2: '#6a4430' });
      vk.box(1.8, 0.8, 2.4, '#5a3826', 0, 1.3, -2.0, { color2: '#6a4430' });
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 5; i++) lattice(vk, sx * 1.16, 0.4, -3.1 + i * 0.95, 0.6, 0.5, true, (sx * Math.PI) / 2);
        for (let i = 0; i < 2; i++) lattice(vk, sx * 0.91, 1.35, -2.6 + i * 1.2, 0.5, 0.4, true, (sx * Math.PI) / 2);
      }
      addRoof(vk, 0, 0.88, -1.2, 5.0, 2.8, 0.35, { ry: Math.PI / 2, tile: '#2a2c32', lift: 0.25, ridge: 2.5 });
      addRoof(vk, 0, 1.7, -2.0, 2.9, 2.2, 0.45, { ry: Math.PI / 2, tile: '#6a3428', lift: 0.3, ridge: 1.45, curl: 0.25 });
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) lantern(vk, sx * 1.4, 0.7, -3.0 + i * 1.6, 0.55);
      // 桅杆和硬帆：帆收到下半截，一道一道竹骨橫著
      const mz = 1.6;
      vk.cyl(0.08, 0.11, 5.4, '#4a3428', 0, 2.3, mz, {}, 6);
      vk.box(0.06, 1.5, 1.9, '#8a3a2a', 0, 1.35, mz - 0.1, { color2: '#a84a32' });
      for (let i = 0; i < 5; i++) vk.box(0.09, 0.05, 2.0, '#3a2a1e', 0, 0.65 + i * 0.36, mz - 0.1);
      lantern(vk, 0, 4.9, mz, 0.6);
      lantern(vk, 0, 0.9, 4.0, 0.7);
    });
    const DOCK = new THREE.Vector3(14.7, 0, 15), OUT = new THREE.Vector3(14.7, 0, 30), FAR = new THREE.Vector3(60, 0, 170);
    const inbound = new THREE.QuadraticBezierCurve3(FAR, new THREE.Vector3(18, 0, 90), DOCK);
    const outbound = new THREE.QuadraticBezierCurve3(OUT, new THREE.Vector3(16, 0, 90), FAR);
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    const ease = (t) => t * t * (3 - 2 * t);
    const T = 600, ARRIVE = 80, DOCKED = 340, BACK = 380, TURN = 405, LEAVE = 490;
    let docked = false;
    harborFx.push((now) => {
      const f = now % T;
      g.visible = f < LEAVE;
      docked = f >= ARRIVE + 10 && f < DOCKED - 10;
      if (f < ARRIVE) {
        const u = ease(f / ARRIVE);
        inbound.getPoint(u, p);
        inbound.getTangent(Math.min(u, 0.999), d);
        g.rotation.y = headingOf(d.x, d.z);
      } else if (f < DOCKED) {
        p.copy(DOCK);
        g.rotation.y = Math.PI;
      } else if (f < BACK) {
        p.lerpVectors(DOCK, OUT, ease((f - DOCKED) / (BACK - DOCKED)));
        g.rotation.y = Math.PI;
      } else if (f < TURN) {
        p.copy(OUT);
        g.rotation.y = Math.PI - Math.PI * ease((f - BACK) / (TURN - BACK));
      } else if (f < LEAVE) {
        const u = ease((f - TURN) / (LEAVE - TURN));
        outbound.getPoint(u, p);
        outbound.getTangent(Math.max(u, 0.001), d);
        g.rotation.y = headingOf(d.x, d.z);
      }
      g.position.x = p.x;
      g.position.z = p.z;
      bob(g, now, 3.3, SEA + 0.7);
    });

    // 吊桿：石堤靠船那一側一根桅柱，吊臂在船和堤之間來回擺，吊著一個木箱上上下下。船不在就收向南邊停著
    const F = AREA.ferry, mx = F.x1 - 0.55, mz = 15.2, MY = 3.5;
    k.cyl(0.14, 0.18, MY, '#4a3626', mx, MY / 2, mz, {}, 8);
    k.box(0.6, 0.3, 0.6, '#5a5a60', mx, 0.15, mz);
    obstacles.push({ x: mx, z: mz, hw: 0.3, hd: 0.3 });
    const boom = vessel((vk) => {
      vk.box(3.4, 0.12, 0.12, '#5a4030', 1.6, 0, 0, { rz: 0.18 });
      vk.cyl(0.03, 0.03, 1.2, DARK, 0.6, 0.55, 0, { rz: -1.0 }, 4);
    });
    boom.position.set(mx, MY, mz);
    const load = vessel((vk) => {
      vk.box(0.6, 0.5, 0.6, '#7a5a3a', 0, -0.25, 0, { color2: '#9a7a52' });
      vk.box(0.64, 0.05, 0.64, DARK, 0, -0.02, 0);
    });
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.025).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: '#2a201c' }));
    group.add(rope);
    // 吊臂斜斜往上，末端在柱頂外 3.27、高 0.3 的地方
    const tip = new THREE.Vector3(), REST = -Math.PI / 2, OVER = 0.1, REACH = 3.27;
    let yaw = REST, dropT = 0;
    harborFx.push((now, dt) => {
      const c = (now % 40) / 40, want = docked ? REST + (OVER - REST) * (0.5 - 0.5 * Math.cos(c * Math.PI * 2)) : REST;
      yaw += (want - yaw) * Math.min(1, dt * 2);
      boom.rotation.set(0, yaw, 0);
      // 擺到兩頭（船上、堤上）才把木箱放低，中間吊高了再擺過去；最低也在頭頂上面
      dropT += ((docked ? 0.8 + 0.8 * Math.cos(c * Math.PI * 2) ** 2 : 0.6) - dropT) * Math.min(1, dt * 1.5);
      tip.set(mx + Math.cos(yaw) * REACH, MY + 0.3, mz - Math.sin(yaw) * REACH);
      rope.position.copy(tip);
      rope.scale.y = dropT;
      load.position.set(tip.x, tip.y - dropT, tip.z);
      load.rotation.y = yaw + Math.sin(now * 0.7) * 0.15;
    });
  }

  // ---------- 山坡上的灌木和小花；兩側和後面的山上有樹和人家 ----------
  const inArea = (x, z, pad) => AREAS.some((a) => x > a.x0 - pad && x < a.x1 + pad && z > a.z0 - pad && z < a.z1 + pad);
  const inSolid = (x, z) => solids.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  for (let i = 0; i < (coarse ? 260 : 420); i++) {
    const x = TOWN_X0 + R() * (TOWN_X1 - TOWN_X0), z = 4 - R() * 68, y = terrain(x, z);
    if (y < SEA + 0.2 || inArea(x, z, 0.7) || inSolid(x, z)) continue;
    const r = 0.35 + R() * 0.6;
    k.rock(r, pick(['#2e4a3a', '#3a5a3e', '#2a4440', '#44583a']), x, y + r * 0.4, z, { sy: 0.75, ao: false });
    if (R() < 0.35) for (let f = 0; f < 4; f++) k.rock(0.06, pick(['#f0a0b8', '#f8f0d8', '#f0d060', '#b8a0f0']), x + (R() - 0.5) * r * 1.4, y + r * 0.75, z + (R() - 0.5) * r * 1.4, { ao: false });
  }
  // 山上的人家聚成幾個小聚落：幾戶沿著等高線排成一彎，臉朝山下，背後一棵老樹或一座小祠。
  // 門口有石板小路一戶接一戶，再有一條往山下彎進樹林裡。這些路只是看得到，走不上去
  const HAMLETS = [[-44, -6, 6], [-50, -28, 5], [-42, -50, 7], [-28, -80, 5], [27, -8, 5], [33, -30, 6], [27, -55, 5], [-4, -88, 6], [16, -76, 4], [-64, -60, 4], [55, -42, 4]];
  const zones = [], trails = [];
  const downhill = (x, z) => {
    const gx = terrain(x + 1, z) - terrain(x - 1, z), gz = terrain(x, z + 1) - terrain(x, z - 1), l = Math.hypot(gx, gz) || 1;
    return [-gx / l, -gz / l];
  };
  // 假路：沿著折線每隔一小段鋪一塊石板，走一段路旁立一根矮燈柱
  const trail = (pts) => {
    let walked = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
      for (let t = 0; t < len; t += 0.6) {
        const x = ax + ((bx - ax) * t) / len + (R() - 0.5) * 0.15, z = az + ((bz - az) * t) / len + (R() - 0.5) * 0.15, y = terrain(x, z);
        k.box(0.55, 0.08, 0.4, pick(STONES), x, y + 0.02, z, { ry: ry + (R() - 0.5) * 0.4, ao: false });
        trails.push([x, z]);
        walked += 0.6;
        if (walked > 7 && R() < 0.3) {
          walked = 0;
          const px = x + ((bz - az) / len) * 0.6, pz = z - ((bx - ax) / len) * 0.6, py = terrain(px, pz);
          k.box(0.08, 1.0, 0.08, DARK, px, py + 0.5, pz, { ao: false });
          lantern(k, px, py + 1.15, pz, 0.6);
        }
      }
    }
  };
  for (const [hx, hz, n] of HAMLETS) {
    const [dx, dz] = downhill(hx, hz), cx = -dz, cz = dx, face = Math.atan2(dx, dz), fronts = [];
    for (let i = 0; i < n; i++) {
      // 沿等高線排開，兩頭微微往山下彎；隔幾戶有一間往山上退一點
      const t = (i - (n - 1) / 2) * (4.4 + R() * 0.8), drop = t * t * 0.02 - (i % 3 === 1 ? 2.2 : 0) + (R() - 0.5) * 1.2;
      const x = hx + cx * t + dx * drop, z = hz + cz * t + dz * drop, y = terrain(x, z);
      if (x > TOWN_X0 - 4 && x < TOWN_X1 + 4 && z > -68) continue;   // 排到鎮子裡就不蓋
      const w = 2.8 + R() * 2.2, d = 2.8 + R() * 0.8, h = 1.8 + R() * 1.4, wall = R() < 0.5 ? pick(PLASTER) : pick(TIMBER);
      let foot = y;
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) foot = Math.min(foot, terrain(x + cx * u * w * 0.5 + dx * v * d * 0.5, z + cz * u * w * 0.5 + dz * v * d * 0.5));
      foot -= 0.6;
      // 牆腳壓暗，房子才像坐在坡上；有的頂上再疊一小間竹屋
      k.box(w, y + h - foot, d, shade(wall, -0.3), x, (y + h + foot) / 2, z, { ry: face, ao: false, color2: wall });
      k.add(roofGeo(w + 1.0, d + 1.2, 0.9 + R() * 0.5, { tile: pick(TILES), lift: 0.35 + R() * 0.2, seg: 0.3, ridge: R() < 0.5 ? (w + 1) / 2 : (w - 1) / 2 }), null, x, y + h, z, { ry: face, ao: false });
      if (R() < 0.35) {
        const w2 = w * 0.5, off = (R() - 0.5) * (w - w2) * 0.6;
        k.box(w2, 1.4, d * 0.6, pick(BAMBOO), x + cx * off, y + h + 0.5, z + cz * off, { ry: face, ao: false });
        k.add(roofGeo(w2 + 0.6, d * 0.6 + 0.9, 0.5, { tile: pick(TILES), lift: 0.25, seg: 0.3 }), null, x + cx * off, y + h + 1.2, z + cz * off, { ry: face, ao: false });
      }
      const fx = x + dx * (d / 2 + 0.03), fz = z + dz * (d / 2 + 0.03);
      if (R() < 0.85) k.plane(w * 0.45, 0.75, WARM, fx, y + h * 0.5, fz, { glow: true, ry: face, color2: PAPER });
      if (R() < 0.6) lantern(k, fx + cx * (w / 2 - 0.3) + dx * 0.4, y + h - 0.3, fz + cz * (w / 2 - 0.3) + dz * 0.4, 1.2);
      fronts.push([x + dx * (d / 2 + 1.2), z + dz * (d / 2 + 1.2)]);
    }
    if (!fronts.length) continue;
    trail(fronts);
    // 從中間那戶門口往山下彎彎曲曲走一段，進到樹林裡
    const down = [fronts[Math.floor(fronts.length / 2)]];
    for (let i = 0; i < 9; i++) {
      const [px, pz] = down[down.length - 1], [ex, ez] = downhill(px, pz), wig = (R() - 0.5) * 1.4;
      const nx = px + ex * 1.8 - ez * wig, nz = pz + ez * 1.8 + ex * wig;
      if ((nx > TOWN_X0 - 3 && nx < TOWN_X1 + 3 && nz > -66) || terrain(nx, nz) < SEA + 0.6) break;
      down.push([nx, nz]);
    }
    trail(down);
    // 聚落背後：一棵老樹，或一座小祠
    const bx = hx - dx * 3.4, bz = hz - dz * 3.4, by = terrain(bx, bz);
    if (R() < 0.5) {
      k.cyl(0.35, 0.55, 3.4, '#3a2a20', bx, by + 1.7, bz, { rz: (R() - 0.5) * 0.3, ao: false }, 6);
      for (let i = 0; i < 4; i++) k.rock(1.2 + R() * 0.6, pick(['#1e3a30', '#2a4436', '#24402e']), bx + (R() - 0.5) * 2, by + 3.6 + R() * 1.2, bz + (R() - 0.5) * 2, { sy: 0.7, ao: false });
    } else {
      k.box(1.0, 1.4, 0.8, '#5a3826', bx, by + 0.3, bz, { ry: face, ao: false });
      k.add(roofGeo(1.6, 1.4, 0.5, { tile: '#2c3038', lift: 0.3, seg: 0.3 }), null, bx, by + 1.0, bz, { ry: face, ao: false });
      k.plane(0.5, 0.45, PAPER, bx + dx * 0.42, by + 0.55, bz + dz * 0.42, { glow: true, ry: face, color2: '#fff0d0' });
      k.light(bx + dx * 0.6, by + 0.6, bz + dz * 0.6, '#ffcf80', 0.6);
    }
    zones.push([hx, hz, n * 2.6 + 4]);
  }
  // 樹：聚落和小路上不種
  for (let i = 0; i < (coarse ? 300 : 520); i++) {
    const x = -100 + R() * 190, z = 20 - R() * 150;
    if (x > TOWN_X0 - 1 && x < TOWN_X1 + 1 && z > -64) continue;
    const y = terrain(x, z);
    if (y < SEA + 0.5) continue;
    if (zones.some(([hx, hz, r]) => Math.hypot(x - hx, z - hz) < r) || trails.some(([px, pz]) => Math.abs(px - x) < 1.3 && Math.abs(pz - z) < 1.3)) continue;
    const s = 0.8 + R() * 1.4;
    k.cone(1.1 * s, 3 * s, '#1a2a2a', x, y + 1.1 * s, z, { color2: '#2e4440', ao: false });
  }
  k.add(terrainGeometry(), '#24302e', 0, 0, 0, { color2: '#46523e', ao: false });

  k.emit(bucket, 0, 0, 0);
  fader.tag(bucket.lit);
  fader.tag(bucket.glow);
  fader.build();
  const meshes = bucketObjects(bucket);
  for (const o of meshes) {
    if (o.isMesh) o.material = fader.patch(o.material);
    group.add(o);
  }
  group.add(signs.mesh());
  // 推車、蒸籠、煙囪冒的煙；燈照在地上的光
  group.add(smoke(bucket.puffs, coarse));
  group.add(pools(bucket.pools));

  // ---------- 霧：夾在層與層之間，鎮子兩側的山谷裡也有；街道上方也飄幾團，在屋頂之間 ----------
  const MR = rng('haishi-mist'), mists = [];
  for (let i = 0; mists.length < (coarse ? 20 : 36) && i < 600; i++) {
    const x = TOWN_X0 - 4 + MR() * (TOWN_X1 - TOWN_X0 + 8), z = 6 - MR() * 70, over = inArea(x, z, 1.5);
    if (over && MR() < 0.6) continue;
    mists.push({ x, y: tz(z) + (over ? 5 + MR() * 3 : 1.5 + MR() * 3.5), z, s: 9 + MR() * 9, p: MR() * 10 });
  }
  group.add(mist(mists));
  // 每條街上方一層被燈籠照暖的霧，從海上遠遠看，一層一層的街都在發光
  const glow = [];
  const glowRows = [[-6, 6, 8.5, 0], [-25, -10, 7, 0], [9, 14, 7, 0], [-3, 3, -2.8, 2.4], ...AREAS.filter((a) => a.street && a.y != null && a.y > 5 && a.y < 13).map((a) => [a.x0 + 1, a.x1 - 1, (a.z0 + a.z1) / 2, a.y])];
  for (const [x0, x1, z, y] of glowRows) {
    for (let x = x0; x <= x1; x += 5) glow.push({ x: x + (MR() - 0.5) * 2, y: y + 3.4 + MR(), z: z + (MR() - 0.5) * 2, s: 8 + MR() * 4, p: MR() * 10 });
  }
  group.add(mist(glow, { color: '#ff8a48', alpha: 0.22, warm: true }));
  // 海上的燈影：碼頭靠海那一排、棧橋兩邊的燈籠，還有整座鎮映在水上的一大片暖光
  const shimmer = [{ x: 0, z: 12.2, w: 16, l: 20, color: '#ff8a48', a: 0.16 }];
  for (let x = -7.5; x <= 7.5; x += 1.5) if (Math.abs(x) > 1.5) shimmer.push({ x: x + (MR() - 0.5) * 0.4, z: 12.2, w: 0.35, l: 4 + MR() * 3, color: '#ff7a40', a: 0.5 });
  for (const z of [16, 22, 29.6]) for (const sx of [-1, 1]) shimmer.push({ x: sx * 1.5, z: z + 0.1, w: 0.3, l: 3 + MR() * 1.5, color: '#ff7a40', a: 0.55 });
  group.add(ripples(shimmer.concat(shimmerMore), SEA));

  // ---------- 海和天 ----------
  // 海是深藍，不是黑的：夜色映在水上，燈影才有東西可以浮在上面
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), new THREE.MeshLambertMaterial({ color: '#2c3c6c' }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA, 420);
  group.add(sea);

  // 夜色深一點，霧近一點，燈才顯得亮；地面反上來的光偏暖，像整條街的燈籠照著
  const env = { bg: 0x302e58, near: 32, far: 200, sky: 0x8e98d4, ground: 0x6a3c34, hi: 1.15, sun: 0xff9a70, si: 0.55, dir: new THREE.Vector3(-6, 5, 8) };
  const sky = new THREE.Group(), dome = skyDome(env.bg), field = starField(coarse ? 2600 : 5200);
  sky.add(dome, field);
  // 星空跟著角色的高度出來：碼頭和街上燈太亮只看得到一些，爬上遠眺台整片天和銀河才都出來
  let starFade = 0.25;
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
  const { findPath } = makePathfinder(walkable, Math.min(...AREAS.map((a) => a.x0)) - 1, Math.min(...AREAS.map((a) => a.z0)) - 1,
    Math.max(...AREAS.map((a) => a.x1)) + 1, Math.max(...AREAS.map((a) => a.z1)) + 1);

  // 鏡頭用的高度圖，格子 0.5 公尺：只算地形和石台，先往外擴一點再糊開，貼著擋土牆時鏡頭不會一下前一下後。
  // 房子不算：擋在中間的房子是淡掉（fade.js），不是把鏡頭推開
  const CF = { x0: -70, z0: -80, s: 0.5, cols: 240, rows: 280 };
  const cf = new Float32Array(CF.cols * CF.rows);
  for (let r = 0; r < CF.rows; r++) {
    for (let c = 0; c < CF.cols; c++) cf[r * CF.cols + c] = groundY(CF.x0 + c * CF.s, CF.z0 + r * CF.s);
  }
  for (const b of solids) {
    const c0 = Math.max(0, Math.floor((b.x0 - CF.x0) / CF.s)), c1 = Math.min(CF.cols - 1, Math.ceil((b.x1 - CF.x0) / CF.s));
    const r0 = Math.max(0, Math.floor((b.z0 - CF.z0) / CF.s)), r1 = Math.min(CF.rows - 1, Math.ceil((b.z1 - CF.z0) / CF.s));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * CF.cols + c;
      if (b.ground) cf[i] = Math.max(cf[i], b.top);
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
  // 從角色頭部往鏡頭走，鑽進山坡或石台就停：回傳停在全程的幾成，沒被擋住是 1。
  // 只有往下拖得很低、又背對山坡時才會碰到；鏡頭沿著原本的方向往前推，斜度不變
  function camClip(a, b) {
    const n = Math.ceil(a.distanceTo(b) / 0.3);
    for (let i = Math.ceil(0.8 / 0.3); i <= n; i++) {
      const t = i / n;
      if (a.y + (b.y - a.y) * t < camFloor(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) + 0.25) return (i - 1) / n;
    }
    return 1;
  }

  let lastT = 0;
  const eyes = [], eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3();

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
    placeAt: (x, z) => {
      const a = areaAt(x, z);
      return (a && PLACES[a.street ?? a.id]) || null;
    },
    walkable, findWalkable, findPath, groundY, camFloor, camClip,
    setCurrentRoom() {},
    // 測試用：地形高度、房子和石台的範圍、欄杆、擋路的東西（tools/check-haishi.mjs）
    debug: { terrain, solids, areas: AREAS, rails, obstacles },
    // cam：鏡頭位置；target：角色站的地方；still：拍照中，擋住的東西一律不淡
    update(t, cam, target, camera, still = false) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      eyes.length = 0;
      if (target) {
        eyes.push(eyeA.set(target.x, target.y + 1.1, target.z));
        // 走到攤位前：攤販的臉也要看得到
        let best = null, bd = 3.5;
        for (const s of shops) {
          const d = Math.hypot(s.x - target.x, s.z - target.z);
          if (d < bd && Math.abs(s.y - target.y) < 1.5) { bd = d; best = s; }
        }
        if (best) eyes.push(eyeB.set(best.x, best.y + 1.05, best.z));
      }
      fader.update(dt, cam, eyes, still || !target);
      uTime.value = t;
      sky.position.copy(cam);
      if (target) starFade += (0.25 + 0.75 * smooth(11, 19, target.y) - starFade) * Math.min(1, dt * 1.5);
      field.material.uniforms.uFade.value = starFade;
      dome.material.uniforms.uStars.value = smooth(0.25, 1, starFade);
      boat.position.y = SEA + 0.36 + Math.sin(t * 1.3) * 0.05;
      boat.rotation.set(Math.sin(t * 0.9) * 0.03, 0.08 + Math.sin(t * 0.3) * 0.05, Math.sin(t * 1.1 + 1) * 0.05);
      const now = Date.now() / 1000;
      for (const f of harborFx) f(now, dt);
      towerSize.setX(0, 30 * (1 + 1.5 * bump(towerPhase(now), 0.52, 0.07)));
      towerSize.needsUpdate = true;
    },
  };
}
