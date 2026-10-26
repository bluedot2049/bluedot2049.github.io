// 訪客：不定期從西邊海上來的旅人。搭小帆船靠在棧橋盡頭，上岸先跟長桌的海牛聊天，
// 吃點心、進屋看畫、坐一坐，有的去看夕陽、看動物、爬上涼亭，最後走回船上，船開回霧裡。
// 每位訪客是一個種族加一種職業：冒險者、吟遊詩人、學者、商人、信差、漁夫、畫家，職業決定穿什麼、帶什麼、做什麼。
// 另外有幾位熟客，隔一陣子搭船來一次，每次接著講上次的事。
// 跟動物一樣，哪一段時間有誰來、走去哪、做什麼、說什麼，都由「現在是第幾段時間」雜湊算出來，
// 每位玩家看到的一樣，不用傳任何資料。台詞在 visitor-lines.js。
// 要去的地方（畫、長桌的座位、海牛、鏡子、長椅、牛、土撥鼠的洞、貓頭鷹的樹、涼亭）都是建好世界之後才從世界資料裡找，
// 房間格局或畫作換了，訪客自己會跟上。行程只用直線距離估時間，尋路等走到那一段才算。
// 跟玩家的互動（轉頭、打招呼、聊天）只演在自己的畫面上，位置不離開行程。
// 玩家不能穿過站在地上的訪客；小狗會跑去迎接走在草原上的訪客，雞和鴨會被他們嚇跑（見 animals.js）。
// 每位訪客合併成六七個網格，最多三位；沒有訪客的時段整個模組只算一個時段編號。
import * as THREE from 'three';
import { hull, JETTY } from './harbor.js';
import { REFLECT_LAYER } from './outdoor.js';
import { ANIMAL_LAYER, LIT, GLOW, geo, hash, wrapAngle, along } from './animals.js';
import { LINES, HOST, VOICES, ROLE_LINES, BOAT, REGULARS, ORIGINS, EVENTS, NEXTS } from './visitor-lines.js';

const SLOT = 600;          // 每段幾秒，一段最多來一船
const CHANCE = 0.6;        // 一段有船來的機率
const REGULAR_EVERY = 9;   // 熟客每隔幾段排一次班（那一段剛好有船才會來）
const BOAT_V = 3, EASE = 10;   // 船速（公尺／秒）；靠岸減速、離岸加速的距離
const HOP = 1;             // 上下船跳一下幾秒
const HEAR = 16, GREET_R = 3.2;
const DODGE = 0.7;        // 側身讓開時跟玩家留的距離
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const tag = (s) => { let h = 7; for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h; };

// ---------- 台詞 ----------

const FOODS = [
  { name: '麵包', build: (k) => k.ball(0.07, '#c8843f', 0, 0, 0, { sx: 1.5, sy: 0.75, sz: 0.9 }) },
  { name: '蘋果', build: (k) => { k.ball(0.055, '#c8382a', 0, 0, 0); k.box(0.008, 0.03, 0.008, '#4a3020', 0, 0.065, 0); } },
  { name: '起司', build: (k) => k.cyl(0.08, 0.08, 0.06, '#f0cc70', 0, 0, 0, {}, 3) },
];

// 填空：資料裡沒有的（null）就不選那一句。{S}{R}{A} 這種旗標的值是空字串，只決定能不能選
function fill(tpl, ctx) {
  let ok = true;
  const s = tpl.replace(/\{(\w)\}/g, (_, c) => {
    const v = ctx[c];
    if (v == null) ok = false;
    return v ?? '';
  });
  return ok ? s : null;
}

// 看畫時能講的：畫名、媒材、年份、標價，還有賣掉了沒
function paintCtx(d) {
  const sold = d.status === 'sold', held = d.status === 'reserved';
  return {
    t: d.title || null, m: d.medium ? d.medium.split(/[、,，]/)[0] : null, y: d.year || null,
    p: d.price ? Number(d.price).toLocaleString('en-US') : null,
    S: sold ? '' : null, R: held ? '' : null, A: !sold && !held && d.price ? '' : null,
  };
}

// ---------- 造型 ----------
// 共用一副身體：原點在腳底，面向 +z。頭、手、腳各自繞關節轉。L.W 是身體的寬度倍數

const TUNICS = ['#3d5a7a', '#7a3b2e', '#4a6a3a', '#6b4a7a', '#8a6a2f', '#2f5d62', '#7a5a4a', '#4a4a5a', '#8a4a5a', '#5a6a8a'];
const CLOAKS = ['#2a3a2a', '#5a2a2a', '#2a2a4a', '#4a3a2a', '#6a5a3a', '#3a2a3a', '#7a4a2a', '#2a4a4a'];
const BUILDS = [0.88, 1, 1, 1, 1.12, 1.25];   // 瘦、一般、壯、圓滾滾
const LEATHER = '#5a3a24', DARK = '#2a1e18', METAL = '#a0a6ae', GOLD = '#d4a54a', WOOD = '#7a5432';
const HIP = 0.42, SHOULDER = 0.84, NECK = 0.92;

// 兩點之間的一根棍子（圓柱或方條），軸向對準 a → b
function rod(k, a, b, r, c, o = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  const at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot = { rx: Math.acos(dy / L), ry: Math.atan2(dx, dz) };
  if (o.flat) k.box(r * 2, L, o.flat, c, ...at, rot);
  else k.cyl(r, o.r2 ?? r, L, c, ...at, rot, o.seg || 6);
}

const eyes = (k, x, y, z, r = 0.03, c = '#1a1412') => { for (const s of [-1, 1]) k.ball(r, c, s * x, y, z); };

// 頭：原點在脖子上。c 是毛色或膚色，c2 是嘴邊或花紋
const HEADS = {
  bull(k, c, c2) {
    k.ball(0.22, c, 0, 0.2, 0, { sx: 1.05 });
    k.box(0.27, 0.2, 0.2, c2, 0, 0.12, 0.18);
    for (const s of [-1, 1]) {
      k.ball(0.028, '#1a1210', s * 0.06, 0.15, 0.285);
      k.cone(0.06, 0.3, '#e8dcc0', s * 0.27, 0.33, 0, { rz: -s * 1.15 });
      k.cone(0.042, 0.2, '#f4ecd8', s * 0.41, 0.46, 0, { rz: -s * 0.25 });
      k.box(0.15, 0.06, 0.09, c, s * 0.25, 0.22, -0.03, { rz: s * 0.4 });
    }
    k.torus(0.045, 0.012, Math.PI * 2, GOLD, 0, 0.05, 0.285);
    eyes(k, 0.11, 0.26, 0.17);
    k.ball(0.08, c2, 0, 0.38, 0.06, { sy: 0.6 });
  },
  cat(k, c, c2) {
    k.ball(0.2, c, 0, 0.21, 0, { sy: 0.95 });
    k.ball(0.08, c2, 0, 0.13, 0.16, { sx: 1.3, sy: 0.8 });
    k.box(0.04, 0.025, 0.02, '#d88a9a', 0, 0.17, 0.235);
    for (const s of [-1, 1]) {
      k.cone(0.075, 0.15, c, s * 0.115, 0.37, -0.01, { rz: -s * 0.3 });
      k.cone(0.04, 0.09, '#e8b0b0', s * 0.112, 0.36, 0.02, { rz: -s * 0.3 });
      k.ball(0.036, '#8ad04a', s * 0.08, 0.23, 0.162, { sz: 0.6 });
      k.box(0.008, 0.045, 0.01, '#000000', s * 0.08, 0.23, 0.185);
      for (const dy of [0, 0.03]) rod(k, [s * 0.06, 0.13 + dy, 0.21], [s * 0.2, 0.15 + dy * 2, 0.19], 0.003, '#f4f0e8', { seg: 3 });
    }
  },
  dog(k, c, c2) {
    k.ball(0.2, c, 0, 0.21, 0);
    k.box(0.15, 0.12, 0.2, c2, 0, 0.13, 0.2);
    k.ball(0.035, '#1a1210', 0, 0.18, 0.305);
    k.box(0.06, 0.012, 0.06, '#d8707a', 0, 0.065, 0.24);
    for (const s of [-1, 1]) k.box(0.075, 0.2, 0.11, c2, s * 0.2, 0.17, -0.01, { rz: s * 0.28 });
    eyes(k, 0.075, 0.25, 0.165);
  },
  goat(k, c, c2) {
    k.ball(0.19, c, 0, 0.21, -0.02);
    for (const [x, z] of [[-0.08, 0], [0.08, 0], [0, -0.07]]) k.ball(0.09, c, x, 0.36, z);
    k.box(0.13, 0.2, 0.15, c2, 0, 0.12, 0.13);
    k.cone(0.04, 0.12, c, 0, -0.01, 0.16, { rx: Math.PI });
    for (const s of [-1, 1]) {
      k.torus(0.08, 0.032, Math.PI * 1.6, '#8a7a62', s * 0.17, 0.3, -0.02, { ry: Math.PI / 2, rz: -0.5 });
      k.box(0.13, 0.04, 0.06, c2, s * 0.2, 0.2, 0.03, { rz: -s * 0.2 });
      k.ball(0.03, '#d8b040', s * 0.075, 0.24, 0.17);
      k.box(0.03, 0.01, 0.01, '#1a1412', s * 0.075, 0.24, 0.198);
    }
  },
  // 綠皮大眼：一雙黑亮的大眼睛、管狀的嘴，頭頂一排小刺
  bigeye(k, c, c2) {
    k.ball(0.2, c, 0, 0.22, 0, { sy: 1.1 });
    for (const s of [-1, 1]) {
      k.ball(0.075, '#0e1216', s * 0.1, 0.24, 0.13, { sx: 0.85 });
      k.cone(0.06, 0.12, c, s * 0.2, 0.3, -0.02, { rz: -s * 1.2 });
    }
    k.cone(0.05, 0.14, c2, 0, 0.12, 0.22, { rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) k.cone(0.03, 0.09, c2, 0, 0.42 - i * 0.04, -0.03 - i * 0.08, { rx: -0.5 - i * 0.35 });
  },
  // 觸鬚頭：腦後垂下兩條粗觸鬚到背上，額頭一圈金飾
  tails(k, c, c2) {
    k.ball(0.19, c, 0, 0.22, 0);
    for (const s of [-1, 1]) {
      rod(k, [s * 0.08, 0.25, -0.1], [s * 0.1, -0.32, -0.2], 0.07, c, { r2: 0.03 });
      k.ball(0.04, '#f4f0e8', s * 0.075, 0.22, 0.165, { sz: 0.6 });
      k.ball(0.02, '#2a1a3a', s * 0.075, 0.22, 0.185);
    }
    k.torus(0.19, 0.014, Math.PI * 2, GOLD, 0, 0.3, 0.01, { rx: Math.PI / 2 + 0.25 });
    k.ball(0.03, c2, 0, 0.32, 0.19);
  },
  // 錘頭：細長的脖子頂著一根橫著的頭，眼睛長在兩端
  hammer(k, c, c2) {
    k.cyl(0.07, 0.1, 0.32, c, 0, 0.14, 0.02, { rx: -0.2 });
    k.ball(0.14, c, 0, 0.36, 0.05, { sx: 1.9, sy: 0.75 });
    for (const s of [-1, 1]) {
      k.ball(0.065, c2, s * 0.24, 0.37, 0.07);
      k.ball(0.045, '#e0a030', s * 0.26, 0.38, 0.11);
    }
    k.box(0.15, 0.035, 0.05, c2, 0, 0.25, 0.14);
  },
  // 鬚臉：頭往前上方拉長，嘴邊垂下四條短觸手，眼睛在兩側
  squid(k, c, c2) {
    k.ball(0.2, c, 0, 0.23, 0.02, { sy: 1.2, sz: 1.1 });
    for (const s of [-1, 1]) {
      k.ball(0.035, '#f08a2a', s * 0.15, 0.25, 0.1);
      for (const x of [0.04, 0.11]) rod(k, [s * x, 0.12, 0.15], [s * x * 1.2, -0.12, 0.2], 0.03, c2, { r2: 0.01 });
    }
  },
  // 狐狸：尖嘴、白臉頰，大耳朵尖端是黑的
  fox(k, c, c2) {
    k.ball(0.19, c, 0, 0.21, 0, { sx: 1.05 });
    k.cone(0.085, 0.2, c2, 0, 0.15, 0.2, { rx: Math.PI / 2 });
    k.ball(0.028, '#1a1210', 0, 0.15, 0.3);
    for (const s of [-1, 1]) {
      k.cone(0.075, 0.2, c, s * 0.12, 0.42, -0.02, { rz: -s * 0.28 });
      k.cone(0.035, 0.07, '#2a1a14', s * 0.148, 0.5, -0.02, { rz: -s * 0.28 });
      k.ball(0.075, c2, s * 0.1, 0.14, 0.09, { sz: 0.7 });
    }
    eyes(k, 0.075, 0.25, 0.16);
  },
  // 熊：圓頭、圓耳朵、淺色的嘴邊
  bear(k, c, c2) {
    k.ball(0.21, c, 0, 0.21, 0);
    k.ball(0.095, c2, 0, 0.14, 0.16, { sx: 1.1, sy: 0.8, sz: 0.8 });
    k.ball(0.035, '#1a1210', 0, 0.17, 0.235, { sx: 1.3 });
    for (const s of [-1, 1]) {
      k.ball(0.07, c, s * 0.15, 0.37, -0.02);
      k.ball(0.04, c2, s * 0.15, 0.37, 0.025, { sz: 0.5 });
    }
    eyes(k, 0.075, 0.26, 0.17, 0.026);
  },
  // 青蛙：扁扁寬寬的頭，眼睛鼓在頭頂，一條長長的嘴
  frog(k, c, c2) {
    k.ball(0.2, c, 0, 0.17, 0, { sx: 1.25, sy: 0.72 });
    k.ball(0.13, c2, 0, 0.1, 0.07, { sx: 1.2, sy: 0.55 });
    k.box(0.26, 0.012, 0.02, '#2a1a14', 0, 0.13, 0.19);
    for (const s of [-1, 1]) {
      k.ball(0.075, c, s * 0.12, 0.29, 0.07);
      k.ball(0.048, '#f0e0a0', s * 0.12, 0.3, 0.125, { sz: 0.6 });
      k.box(0.05, 0.014, 0.01, '#0a0806', s * 0.12, 0.3, 0.155);
    }
  },
  // 蜥蜴：方方的長嘴、黃眼睛直瞳孔，頭頂到腦後一排小棘
  lizard(k, c, c2) {
    k.ball(0.17, c, 0, 0.22, -0.02, { sz: 1.05 });
    k.box(0.15, 0.1, 0.2, c, 0, 0.17, 0.17);
    k.box(0.13, 0.03, 0.18, c2, 0, 0.11, 0.16);
    for (const s of [-1, 1]) {
      k.ball(0.042, '#e0c030', s * 0.11, 0.26, 0.09);
      k.box(0.008, 0.045, 0.01, '#000000', s * 0.11, 0.26, 0.13);
      k.ball(0.01, '#1a1210', s * 0.03, 0.2, 0.27);
    }
    for (let i = 0; i < 4; i++) k.cone(0.03, 0.08, c2, 0, 0.4 - i * 0.03, -i * 0.07, { rx: -0.4 - i * 0.3 });
  },
  // 兔子：長耳朵、兩顆門牙、粉紅鼻頭
  rabbit(k, c, c2) {
    k.ball(0.19, c, 0, 0.21, 0);
    k.ball(0.075, c2, 0, 0.14, 0.14, { sx: 1.3, sy: 0.8 });
    k.ball(0.022, '#d88a9a', 0, 0.18, 0.2);
    k.box(0.045, 0.045, 0.01, '#ffffff', 0, 0.095, 0.19);
    for (const s of [-1, 1]) {
      k.add(new THREE.CapsuleGeometry(0.045, 0.26, 2, 6), c, s * 0.075, 0.52, -0.03, { rz: -s * 0.15, sz: 0.6 });
      k.box(0.04, 0.22, 0.01, '#e8a8b0', s * 0.08, 0.52, -0.005, { rz: -s * 0.15 });
    }
    eyes(k, 0.085, 0.24, 0.15);
  },
  // 蘑菇：臉是白白的菌柄，頭頂一朵大菌傘，傘上有白點
  mushroom(k, c, c2) {
    k.cyl(0.14, 0.16, 0.3, c2, 0, 0.15, 0, {}, 10);
    eyes(k, 0.055, 0.18, 0.14, 0.024);
    for (const s of [-1, 1]) k.ball(0.03, '#e8a0a0', s * 0.095, 0.12, 0.12, { sz: 0.4 });
    k.box(0.04, 0.01, 0.01, '#5a3020', 0, 0.1, 0.155);
    k.ball(0.3, c, 0, 0.33, 0, { sy: 0.55 });
    for (const [a, phi] of [[0.3, 0.5], [1.9, 0.75], [3.4, 0.55], [4.6, 0.9], [5.7, 0.4], [1.0, 0.15], [2.7, 1.0]]) {
      k.ball(0.045, '#f8f2e4', Math.cos(a) * 0.3 * Math.sin(phi), 0.33 + 0.165 * Math.cos(phi), Math.sin(a) * 0.3 * Math.sin(phi), { sy: 0.45 });
    }
  },
};

// 帽子：y 是戴的高度（頭頂再低一點），s 是頭的大小
const HATS = {
  helm(k, y, s) {
    k.ball(0.22 * s, METAL, 0, y - 0.03, 0, { sy: 0.62, color2: '#6a707a' });
    k.box(0.03, 0.16, 0.03, METAL, 0, y - 0.1, 0.21 * s);
  },
  feather(k, y, s, L) {
    k.ball(0.2 * s, L.cloak, 0.02, y + 0.02, 0, { sy: 0.32, rz: -0.18 });
    k.ball(0.04, '#f0e2c0', -0.1 * s, y + 0.14, -0.09, { sy: 3.2, rz: 0.55, rx: -0.35 });
  },
  wizard(k, y, s) {
    k.cyl(0.3 * s, 0.3 * s, 0.025, '#2a2f5a', 0, y, 0, {}, 12);
    k.cone(0.17 * s, 0.5, '#2a2f5a', 0, y + 0.26, -0.03, { rx: -0.18, color2: '#4a4f8a' });
    k.torus(0.165 * s, 0.015, Math.PI * 2, GOLD, 0, y + 0.04, 0, { rx: Math.PI / 2 });
  },
  wide(k, y, s) {
    k.cyl(0.34 * s, 0.34 * s, 0.03, '#5a3e2a', 0, y, 0, {}, 12);
    k.cyl(0.16 * s, 0.18 * s, 0.17, '#5a3e2a', 0, y + 0.1, 0, {}, 10);
    k.cyl(0.182 * s, 0.182 * s, 0.04, '#a0402a', 0, y + 0.04, 0, {}, 10);
  },
  cap(k, y, s, L) {
    k.ball(0.2 * s, L.tunic, 0, y - 0.02, 0, { sy: 0.48 });
    k.box(0.22 * s, 0.02, 0.15, L.tunic, 0, y - 0.04, 0.2 * s);
  },
  straw(k, y, s) {
    k.cyl(0.37 * s, 0.37 * s, 0.02, '#d8b870', 0, y, 0, { color2: '#e8cc88' }, 12);
    k.cyl(0.15 * s, 0.18 * s, 0.15, '#d8b870', 0, y + 0.08, 0, {}, 10);
    k.cyl(0.185 * s, 0.185 * s, 0.035, '#b8402a', 0, y + 0.03, 0, {}, 10);
  },
  beret(k, y, s, L) {
    k.ball(0.21 * s, L.tunic === '#7a3b2e' ? '#2a2a3a' : '#a0342a', 0.04, y, 0, { sy: 0.3, rz: -0.25 });
    k.cyl(0.012, 0.012, 0.05, '#2a1a14', 0, y + 0.06, 0);
  },
};

// 種族：名字、身形、頭、頭頂多高、帽子大小、毛色候選。冒險者帶的武器和盔甲看種族，其他職業看職業
const SPECIES = {
  minotaur: { name: '牛頭人', head: 'bull', scale: 1.3, W: 1.25, top: 0.42, hs: 1.1, skins: [['#6a4630', '#9a7058'], ['#3e2c22', '#6a5040'], ['#8a5a3a', '#b88a68']], weapons: ['greatsword', 'axe'], armor: ['plate', 'leather'] },
  cat: { name: '貓頭人', head: 'cat', scale: 1, W: 0.95, top: 0.4, hs: 1, skins: [['#d8893a', '#f4e4c8'], ['#8a8a92', '#e8e4e0'], ['#3a3036', '#c8c0c0'], ['#f0e6d8', '#ffffff']], weapons: ['dagger', 'bow', 'sword'], armor: ['cloak', 'leather'] },
  dog: { name: '狗頭人', head: 'dog', scale: 1.08, W: 1, top: 0.41, hs: 1, skins: [['#c8803e', '#f2e0c4'], ['#5a4232', '#c8a888'], ['#e8dcc8', '#a07850']], weapons: ['sword', 'bow'], armor: ['leather', 'cloak', 'plate'] },
  goat: { name: '羊頭人', head: 'goat', scale: 1.1, W: 1, top: 0.44, hs: 1, skins: [['#f0e8d8', '#c8a888'], ['#d8d0c0', '#8a6a52']], weapons: ['staff'], armor: ['cloak'] },
  bigeye: { name: '大眼睛的', head: 'bigeye', scale: 1, W: 0.95, top: 0.43, hs: 1, skins: [['#5a9a4a', '#3a6a3a'], ['#4a8a7a', '#2a5a5a']], weapons: ['sword', 'dagger'], armor: ['leather', 'cloak'] },
  tails: { name: '垂鬚的', head: 'tails', scale: 1.05, W: 0.92, top: 0.41, hs: 0.95, skins: [['#4a8ad0', '#d4a54a'], ['#d07ab0', '#6ad0c0'], ['#7ac06a', '#e05a5a']], weapons: ['staff', 'bow', 'dagger'], armor: ['cloak', 'leather'] },
  hammer: { name: '錘頭的', head: 'hammer', scale: 1.15, W: 1.05, top: 0.46, hs: 0.85, skins: [['#8a6a4a', '#c8a070'], ['#6a6a5a', '#a8a088']], weapons: ['staff', 'axe'], armor: ['cloak'] },
  squid: { name: '鬚臉的', head: 'squid', scale: 1.1, W: 1, top: 0.47, hs: 1, skins: [['#8a7aa0', '#b8a0c8'], ['#c08a7a', '#e0b0a0']], weapons: ['sword', 'staff'], armor: ['plate', 'cloak'] },
  fox: { name: '狐頭人', head: 'fox', scale: 1, W: 0.95, top: 0.4, hs: 0.95, skins: [['#d8702a', '#f4ecd8'], ['#b85a2a', '#efe2cc'], ['#e8e0d8', '#ffffff']], weapons: ['dagger', 'bow'], armor: ['leather', 'cloak'] },
  bear: { name: '熊頭人', head: 'bear', scale: 1.22, W: 1.25, top: 0.42, hs: 1.05, skins: [['#6a4a30', '#b89878'], ['#3a2e28', '#8a7a68'], ['#e8e4dc', '#c8c0b4']], weapons: ['axe', 'greatsword'], armor: ['leather', 'plate'] },
  frog: { name: '蛙頭人', head: 'frog', scale: 0.95, W: 1.05, top: 0.33, hs: 1.15, skins: [['#5a9a3a', '#d8e0a0'], ['#3a7a6a', '#c8e0c0'], ['#c8803a', '#f0d8a0']], weapons: ['staff', 'dagger'], armor: ['leather', 'cloak'] },
  lizard: { name: '蜥蜴人', head: 'lizard', scale: 1.05, W: 0.95, top: 0.38, hs: 0.95, skins: [['#4a8a5a', '#d8c070'], ['#8a6a3a', '#e0c890'], ['#3a6a8a', '#a8d0d8']], weapons: ['sword', 'bow'], armor: ['leather', 'plate'] },
  rabbit: { name: '兔頭人', head: 'rabbit', scale: 0.95, W: 0.92, top: 0.4, hs: 0.95, skins: [['#e8e0d4', '#ffffff'], ['#a88a6a', '#efe2cc'], ['#6a6a6e', '#d8d4d0']], weapons: ['bow', 'dagger'], armor: ['cloak', 'leather'] },
  mushroom: { name: '蘑菇人', head: 'mushroom', scale: 0.95, W: 1, top: 0.5, noHat: true, skins: [['#c83a2a', '#f0e6d0'], ['#a8743a', '#efe0c8'], ['#6a5a9a', '#e8e0e8']], weapons: ['staff'], armor: ['cloak'] },
};
const KINDS = Object.keys(SPECIES);

// 職業：名字、出現的機會、帽子、衣服、隨身帶的東西，還有行程怎麼排
// views 看幾幅畫、viewT 每幅看多久、eatT 吃多久的倍數、v 走路快慢的倍數
const ROLES = {
  adventurer: { name: '冒險者', w: 3, hats: [null, null, null, 'helm'] },
  bard: { name: '吟遊詩人', w: 1.2, hats: ['feather'], armor: ['vest'], gear: 'lute', views: [1, 3] },
  scholar: { name: '學者', w: 1.2, hats: ['wizard', null], armor: ['robe'], gear: 'book', views: [3, 5], viewT: 30 },
  merchant: { name: '商人', w: 1.1, hats: ['wide'], armor: ['vest', 'cloak'], gear: 'bigpack', eatT: 1.5 },
  courier: { name: '信差', w: 1, hats: ['cap'], armor: ['leather'], gear: 'satchel', v: 1.25, chatT: 20, views: [1, 2] },
  fisher: { name: '漁夫', w: 1, hats: ['straw'], armor: ['vest'], gear: 'rod', views: [1, 2] },
  painter: { name: '畫家', w: 1.1, hats: ['beret'], armor: ['smock'], gear: 'sketch', views: [2, 3] },
};
const ROLE_KEYS = Object.keys(ROLES);

function pickRole(u) {
  let sum = 0;
  for (const r of ROLE_KEYS) sum += ROLES[r].w;
  for (const r of ROLE_KEYS) if ((u -= ROLES[r].w / sum) < 0) return r;
  return 'adventurer';
}

// 一位訪客的長相：種族、職業、毛色、衣服、帽子、身材，全由 (時段, 第幾位) 雜湊決定。熟客照自己的設定
function looks(k, j, taken, reg) {
  const u = (s, n) => Math.floor(hash(k, j, s) * n);
  let kind, role;
  if (reg) ({ kind, role } = reg);
  else {
    let i = u(3, KINDS.length);
    while (taken.has(KINDS[i])) i = (i + 1) % KINDS.length;   // 同一船不重複種族
    kind = KINDS[i];
    role = pickRole(hash(k, j, 11));
  }
  const sp = SPECIES[kind], ro = ROLES[role], o = reg?.look || {}, adv = role === 'adventurer';
  const [c, c2] = sp.skins[o.skin ?? u(4, sp.skins.length)];
  const armors = adv ? sp.armor : ro.armor;
  return {
    kind, sp, role, ro, c, c2, reg,
    name: reg ? reg.name : sp.name + ro.name,
    tunic: o.tunic ?? TUNICS[u(5, TUNICS.length)], cloak: o.cloak ?? CLOAKS[u(6, CLOAKS.length)],
    armor: o.armor ?? armors[u(7, armors.length)],
    weapon: o.weapon ?? (adv ? sp.weapons[u(8, sp.weapons.length)] : null),
    gear: ro.gear || null,
    pack: adv && hash(k, j, 9) < 0.4,
    hat: sp.noHat ? null : o.hat !== undefined ? o.hat : ro.hats[u(13, ro.hats.length)],
    W: sp.W * (o.build ?? BUILDS[u(12, BUILDS.length)]),
    scale: sp.scale * (o.tall ?? 0.94 + 0.12 * hash(k, j, 14)),
  };
}

function bodyGeo(L) {
  const W = L.W, c = L.c;
  return geo((k) => {
    k.cyl(0.19 * W, 0.24 * W, 0.48, L.tunic, 0, 0.64, 0);
    k.cyl(0.24 * W, 0.29 * W, 0.2, L.tunic, 0, 0.36, 0, { color2: L.cloak });
    k.cyl(0.25 * W, 0.252 * W, 0.05, LEATHER, 0, 0.48, 0);
    k.box(0.06, 0.05, 0.02, GOLD, 0, 0.48, 0.25 * W);
    k.box(0.1, 0.1, 0.06, LEATHER, 0.2 * W, 0.41, 0.13 * W, { ry: 0.6 });
    k.cyl(0.08, 0.09, 0.1, c, 0, 0.9, 0);
    switch (L.armor) {
      case 'leather':
        k.cyl(0.205 * W, 0.25 * W, 0.34, '#6a4a30', 0, 0.68, 0, { color2: '#4a3020' });
        for (const s of [-1, 1]) k.ball(0.1, '#6a4a30', s * 0.24 * W, 0.86, 0, { sy: 0.55 });
        break;
      case 'plate':
        k.cyl(0.205 * W, 0.25 * W, 0.3, METAL, 0, 0.71, 0, { color2: '#6a707a' });
        for (const s of [-1, 1]) k.ball(0.12, METAL, s * 0.25 * W, 0.86, 0, { sy: 0.65 });
        k.cyl(0.15, 0.17, 0.06, METAL, 0, 0.87, 0);
        break;
      case 'vest':
        // 背心：前面開襟露出裡面的衣服，一排金扣子
        k.cyl(0.205 * W, 0.25 * W, 0.34, L.cloak, 0, 0.68, 0, { color2: '#2a2018' });
        k.box(0.07, 0.33, 0.02, L.tunic, 0, 0.68, 0.225 * W);
        for (const y of [0.58, 0.68, 0.78]) k.ball(0.016, GOLD, 0.05, y, 0.23 * W);
        break;
      case 'robe':
        // 長袍：從肩膀蓋到腳踝，腰上一條金帶
        k.cyl(0.21 * W, 0.34 * W, 0.78, L.tunic, 0, 0.48, 0, { color2: L.cloak });
        k.cyl(0.235 * W, 0.245 * W, 0.05, GOLD, 0, 0.55, 0);
        k.torus(0.12, 0.04, Math.PI * 2, L.tunic, 0, 0.87, 0, { rx: Math.PI / 2 });
        break;
      case 'smock': {
        // 畫家的罩衫：米白色，沾了幾點顏料
        k.cyl(0.205 * W, 0.28 * W, 0.52, '#e8dcc4', 0, 0.58, 0, { color2: '#d0c0a0' });
        const dots = ['#c83a2a', '#3a6ac8', '#e8b830', '#4a9a4a'];
        dots.forEach((d, i) => k.box(0.035, 0.03, 0.01, d, (i - 1.5) * 0.06 * W, 0.5 + (i % 2) * 0.12, 0.255 * W));
        break;
      }
      default:
        // 披風從肩上垂到膝蓋，領口一圈
        k.box(0.46 * W, 0.66, 0.03, L.cloak, 0, 0.55, -0.25 * W, { rx: 0.1 });
        k.torus(0.13, 0.05, Math.PI * 2, L.cloak, 0, 0.87, 0, { rx: Math.PI / 2 });
    }
    const back = -0.27 * W - (L.armor === 'cloak' ? 0.05 : 0);
    if (L.pack) {
      k.box(0.26 * W, 0.3, 0.14, LEATHER, 0, 0.64, back - 0.04);
      k.cyl(0.06, 0.06, 0.3 * W, '#8a7a5a', 0, 0.82, back - 0.04, { rz: Math.PI / 2 });
    }
    switch (L.gear) {
      case 'bigpack':
        // 商人的大背架：一大箱貨，上面捆著毯子，旁邊吊一只鍋
        k.box(0.42 * W, 0.56, 0.26, '#7a5a3a', 0, 0.66, back - 0.1, { color2: '#5a3e26' });
        k.cyl(0.08, 0.08, 0.46 * W, '#a0403a', 0, 0.98, back - 0.1, { rz: Math.PI / 2 });
        k.cyl(0.09, 0.07, 0.1, '#3a3a3e', 0.25 * W, 0.5, back - 0.1, {}, 8);
        k.box(0.06, 0.08, 0.06, '#ffd890', -0.25 * W, 0.55, back - 0.1);
        break;
      case 'satchel':
        // 信差斜背的郵包
        rod(k, [0.2 * W, 0.86, 0.15 * W], [-0.24 * W, 0.46, 0.2 * W], 0.02, LEATHER, { flat: 0.015 });
        rod(k, [0.2 * W, 0.86, -0.15 * W], [-0.24 * W, 0.46, -0.2 * W], 0.02, LEATHER, { flat: 0.015 });
        k.box(0.1, 0.22, 0.3, '#8a5a30', -0.28 * W, 0.42, 0.02, { color2: '#6a4220' });
        k.box(0.02, 0.06, 0.08, '#f0e8d8', -0.33 * W, 0.5, 0.06);
        break;
      case 'rod':
        // 漁夫背的魚簍
        k.cyl(0.14, 0.12, 0.3, '#b08a50', 0, 0.62, back - 0.08, { color2: '#8a6a3a' }, 9);
        break;
    }
    const wb = back - (L.pack ? 0.14 : 0.02);
    switch (L.weapon) {
      case 'sword': {
        // 左腰的劍：劍柄朝前上方
        const a = [-0.27 * W, 0.12, -0.12], b = [-0.27 * W, 0.5, 0.12];
        rod(k, a, b, 0.03, LEATHER, { flat: 0.035 });
        k.box(0.15, 0.025, 0.03, GOLD, b[0], b[1] + 0.01, b[2] + 0.01, { rx: 0.56 });
        rod(k, [b[0], b[1] + 0.02, b[2] + 0.01], [b[0], b[1] + 0.13, b[2] + 0.08], 0.017, DARK);
        k.ball(0.026, GOLD, b[0], b[1] + 0.14, b[2] + 0.09);
        break;
      }
      case 'greatsword': {
        // 背上斜背一把大劍，劍柄從右肩冒出來
        const a = [-0.22, 0.12, wb], b = [0.2, 1.0, wb];
        rod(k, a, b, 0.045, METAL, { flat: 0.02 });
        rod(k, [b[0] - 0.12, b[1] - 0.06, wb], [b[0] + 0.12, b[1] + 0.06, wb], 0.02, GOLD, { flat: 0.04 });
        rod(k, b, [b[0] + 0.07, b[1] + 0.16, wb], 0.022, DARK);
        break;
      }
      case 'axe': {
        const a = [0.2, 0.2, wb], b = [-0.18, 1.0, wb];
        rod(k, a, b, 0.022, WOOD);
        k.box(0.2, 0.16, 0.03, METAL, b[0] + 0.02, b[1] - 0.08, wb - 0.01, { rz: 0.45, color2: '#d8dce0' });
        break;
      }
      case 'bow': {
        // 背上的弓和箭筒
        const r = 0.42, a0 = -0.35 * Math.PI, arc = 0.7 * Math.PI, cx = 0.12, cy = 0.62, rz = Math.PI * 0.62;
        k.torus(r, 0.016, arc, WOOD, cx, cy, wb - 0.02, { rz: rz + a0 });
        const end = (t) => [cx + Math.cos(rz + a0 + t) * r, cy + Math.sin(rz + a0 + t) * r, wb - 0.02];
        rod(k, end(0), end(arc), 0.004, '#e8e0d0', { seg: 3 });
        const qa = [-0.08, 0.5, wb - 0.06], qb = [0.12, 0.92, wb - 0.06];
        rod(k, qa, qb, 0.06, LEATHER);
        for (let i = 0; i < 3; i++) {
          const x = qb[0] + (i - 1) * 0.03, y = qb[1] + 0.06, z = qb[2] + (i - 1) * 0.02;
          rod(k, [x - 0.02, y - 0.1, z], [x + 0.02, y + 0.06, z], 0.007, WOOD, { seg: 3 });
          k.box(0.04, 0.06, 0.006, '#f0ece0', x + 0.02, y + 0.04, z, { rz: -0.4 });
        }
        break;
      }
      case 'dagger':
        for (const s of [-1, 1]) {
          rod(k, [s * 0.22 * W, 0.28, 0.12 * W], [s * 0.24 * W, 0.46, 0.14 * W], 0.022, LEATHER, { flat: 0.02 });
          k.ball(0.022, GOLD, s * 0.245 * W, 0.53, 0.145 * W);
        }
        break;
    }
  });
}

function headGeo(L) {
  return geo((k) => {
    HEADS[L.sp.head](k, L.c, L.c2);
    if (L.hat) HATS[L.hat](k, L.sp.top - 0.05, L.sp.hs ?? 1, L);
  });
}

function armGeo(L, right) {
  const W = L.W, fist = L.kind === 'minotaur' || L.kind === 'bear' ? 0.075 : 0.06;
  const sleeve = L.armor === 'plate' ? '#7a8088' : L.armor === 'robe' ? L.tunic : L.armor === 'smock' ? '#e8dcc4' : L.tunic;
  return geo((k) => {
    k.add(new THREE.CapsuleGeometry(0.06 * Math.sqrt(W), 0.24, 2, 6), sleeve, 0, -0.17, 0);
    k.cyl(0.068, 0.065, 0.1, L.armor === 'robe' ? GOLD : LEATHER, 0, -0.3, 0);
    k.ball(fist, L.c, 0, -0.38, 0);
    // 法杖握在右手：杖腳快碰到地，頂端一顆發亮的水晶
    if (right && L.weapon === 'staff') {
      rod(k, [0, -0.85, 0.05], [0, 0.62, 0.05], 0.022, WOOD, { r2: 0.016 });
      k.torus(0.07, 0.014, Math.PI * 2, GOLD, 0, 0.64, 0.05);
      k.add(new THREE.OctahedronGeometry(0.06, 0), '#a8e8ff', 0, 0.72, 0.05, { sy: 1.6 });
    }
  });
}

function legGeo(L) {
  return geo((k) => {
    k.box(0.13 * L.W, 0.3, 0.14, '#3a2e2a', 0, -0.15, 0);
    k.box(0.15 * L.W, 0.16, 0.21, DARK, 0, -0.34, 0.025, { color2: '#4a3a30' });
  });
}

// 隨身的小東西：大家共用同一個幾何
const shared = new Map();
function once(key, build) {
  if (!shared.has(key)) shared.set(key, geo(build));
  return shared.get(key);
}
const foodGeo = (i) => once('food' + i, FOODS[i].build);
// 魯特琴：原點在琴身中心，琴頸朝 +y
const luteGeo = () => once('lute', (k) => {
  k.ball(0.15, '#a8743a', 0, 0, 0, { sz: 0.4, sy: 1.15, color2: '#c8944a' });
  k.cyl(0.035, 0.035, 0.01, '#2a1a10', 0, 0.02, 0.06, { rx: Math.PI / 2 }, 10);
  k.box(0.05, 0.36, 0.03, '#5a3a20', 0, 0.32, 0.01);
  k.box(0.07, 0.1, 0.03, '#5a3a20', 0, 0.52, -0.02, { rx: -0.5 });
});
// 書和速寫本：拿在左手
const bookGeo = () => once('book', (k) => {
  k.box(0.17, 0.22, 0.05, '#6a2a2a', 0, 0, 0, { color2: '#8a3a30' });
  k.box(0.15, 0.2, 0.052, '#f0e6d0', 0.012, 0, 0);
});
const padGeo = () => once('pad', (k) => {
  k.box(0.26, 0.19, 0.02, '#3a3a3e', 0, 0, 0);
  k.box(0.24, 0.17, 0.022, '#f4ecd8', 0, 0, 0.002);
  k.box(0.012, 0.012, 0.14, '#c8a040', 0.05, -0.02, 0.06, { rx: 0.3 });
});
// 釣竿：從右手往前上方伸出去
const ROD_TIP = [0, 0.62, 1.7];
const rodGeo = () => once('rod', (k) => {
  rod(k, [0, -0.42, -0.08], [0, ROD_TIP[1], ROD_TIP[2]], 0.016, '#6a4a2a', { r2: 0.006 });
  k.cyl(0.03, 0.03, 0.05, '#3a3a3e', 0, -0.33, 0.0, { rz: Math.PI / 2 }, 8);
});
const letterGeo = () => once('letter', (k) => {
  k.box(0.16, 0.11, 0.01, '#f4ecd8', 0, 0, 0);
  k.box(0.035, 0.035, 0.012, '#b8302a', 0, 0, 0.002);
});

// 組成骨架。geos 收在一起，訪客離開時一起丟掉（共用的小東西不丟）
function buildRig(L, shadowMat) {
  const W = L.W, root = new THREE.Group(), body = new THREE.Group(), geos = [];
  root.add(body);
  const mesh = (g, parent, own = true) => { if (own) geos.push(g); const m = new THREE.Mesh(g, LIT); parent.add(m); return m; };
  const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.order = 'YXZ'; body.add(p); return p; };
  mesh(bodyGeo(L), body);
  const head = pivot(0, NECK);
  mesh(headGeo(L), head);
  const armL = pivot(-(0.25 * W + 0.04), SHOULDER), armR = pivot(0.25 * W + 0.04, SHOULDER);
  mesh(armGeo(L, false), armL);
  mesh(armGeo(L, true), armR);
  const leg = legGeo(L);
  geos.push(leg);
  const legs = [-1, 1].map((s) => { const p = pivot(s * 0.11 * W, HIP); p.add(new THREE.Mesh(leg, LIT)); return p; });
  const food = mesh(foodGeo(0), armR, false);
  food.position.set(0, -0.42, 0.07);
  food.visible = false;
  const rig = { root, body, head, armL, armR, legs, food, geos, staff: L.weapon === 'staff' };
  if (L.gear === 'lute') {
    rig.lute = mesh(luteGeo(), body, false);
    rig.luteBack = { x: 0.06, y: 0.6, z: -0.27 * W - 0.06 };
  } else if (L.gear === 'book' || L.gear === 'sketch') {
    rig.book = mesh(L.gear === 'book' ? bookGeo() : padGeo(), armL, false);
    rig.book.position.set(0, -0.42, 0.08);
    rig.book.rotation.set(0.2, 0, Math.PI / 2);
  } else if (L.gear === 'rod') {
    rig.rod = mesh(rodGeo(), armR, false);
    rig.tip = new THREE.Object3D();
    rig.tip.position.set(...ROD_TIP);
    armR.add(rig.tip);
  } else if (L.gear === 'satchel') {
    rig.letter = mesh(letterGeo(), armR, false);
    rig.letter.position.set(0, -0.44, 0.08);
    rig.letter.rotation.x = -0.5;
    rig.letter.visible = false;
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * W, 0.8 * W), shadowMat);
  geos.push(shadow.geometry);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);
  rig.shadow = shadow;
  root.scale.setScalar(L.scale);
  root.traverse((o) => o.layers.set(ANIMAL_LAYER));
  return rig;
}

// 釣線和浮標：從竿尖垂到水面，另外放在場景裡，不跟著人轉
const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a2420 });
function fishingLine(scene) {
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 3), lineMat);
  const bob = new THREE.Mesh(geo((k) => { k.ball(0.04, '#d83a2a', 0, 0.02, 0); k.ball(0.035, '#f4f0e8', 0, -0.02, 0); }), LIT);
  for (const o of [line, bob]) { o.visible = false; o.layers.set(ANIMAL_LAYER); scene.add(o); }
  return { line, bob };
}

// ---------- 冒險者的船 ----------
// 小帆船：船身、桅杆、一面帆，船尾一盞燈。甲板在船舷下 0.28 公尺，水面再往下 0.27 公尺
const BOAT_DIM = { len: 5.4, beam: 1.9, depth: 0.8, rise: 0.55 };
const DECK_Y = -BOAT_DIM.depth * 0.35;
// 甲板上三個人站的位置（船的座標，船頭 +z），避開桅杆
const SPOTS = [[0.3, 1.7], [-0.3, -0.3], [0.28, -1.5]];
function boatModel() {
  const { len: L, beam: B, depth: D } = BOAT_DIM, o = { ao: false };
  const lit = geo((k) => {
    k.add(hull(L, B, D, { y: 0.35, w: 0.86 }), '#5a3a26', 0, 0, 0, { ...o, color2: '#8a5a3a' });
    for (const sx of [-1, 1]) k.box(0.05, 0.06, L * 0.72, '#c89a50', sx * (B / 2 - 0.03), -0.02, 0, o);
    k.cyl(0.05, 0.065, 2.9, '#4a3020', 0, 1.15, 0.7, o);
    k.box(1.8, 0.05, 0.05, '#4a3020', 0, 2.35, 0.74, o);
    k.box(1.65, 1.55, 0.025, '#e8dcc0', 0, 1.55, 0.78, { ...o, color2: '#c8b890' });
    k.box(0.36, 0.36, 0.035, '#8a3a2a', 0, 1.62, 0.78, { ...o, rz: Math.PI / 4 });
    k.box(0.36, 0.2, 0.012, '#c0392b', 0.2, 2.5, 0.7, o);
    k.box(0.45, 0.35, 0.4, '#7a5a3a', -0.35, DECK_Y + 0.175, -2.05, o);
    k.cyl(0.16, 0.16, 0.4, '#6a4a2a', 0.45, DECK_Y + 0.2, 0.2, o, 8);
    k.cyl(0.025, 0.025, 1.3, '#4a3020', 0, DECK_Y + 0.65, -2.45, o, 4);
  });
  const glow = geo((k) => k.cyl(0.07, 0.07, 0.18, '#ffd890', 0, DECK_Y + 1.25, -2.45, {}, 6));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lit, LIT), new THREE.Mesh(glow, GLOW));
  g.rotation.order = 'YXZ';
  g.traverse((c) => c.layers.enable(REFLECT_LAYER));
  return g;
}

// 船在一段時間裡的行程：從霧裡最遠那一點開進來，減速靠岸，停 moor 秒，加速離開開回霧裡
function boatTimes(route, far) {
  const curve = new THREE.CatmullRomCurve3(route, true, 'centripetal');
  const LEN = curve.getLength(), lens = curve.getLengths(route.length * 40), sFar = lens[far * 40];
  const ta = (2 * EASE) / BOAT_V, dIn = LEN - sFar;
  const tc = (dIn - EASE) / BOAT_V, tIn = tc + ta, tOut = ta + (sFar - EASE) / BOAT_V;
  const moor = SLOT - tIn - tOut - 10;
  // 這段時間第 c 秒走到航線的哪裡（0 是泊位）；回傳 null 表示在霧裡等
  const at = (c) => {
    if (c < tc) return sFar + BOAT_V * c;
    if (c < tIn) { const u = c - tc; return LEN - EASE + BOAT_V * u - (BOAT_V * u * u) / (2 * ta); }
    if (c < tIn + moor) return LEN;
    const τ = c - tIn - moor;
    if (τ < ta) return (BOAT_V * τ * τ) / (2 * ta);
    const s = EASE + BOAT_V * (τ - ta);
    return s < sFar ? s : null;
  };
  return { curve, LEN, tIn, moor, at };
}

// ---------- 一位訪客 ----------

// 在做這件事時被玩家搭話，回這一類的話
const TALK_ABOUT = { view: 'talkView', eat: 'talkEat', fish: 'talkFish', sketch: 'talkSketch', play: 'talkPlay' };
// 走過這些動物旁邊會講一句：多近才算看到
const SEE = { owl: 5.5, marmot: 4.5, cow: 3.5 };

class Visitor {
  constructor(set, k, j, n, L) {
    this.set = set;
    this.k = k;
    this.j = j;
    this.L = L;
    this.seed = k * 8 + j;
    this.name = L.name;
    this.bags = new Map();
    // 熟客隨口聊的話：平常那幾句加上這一章的故事
    this.own = L.reg ? { talk: [...L.reg.talk, ...L.reg.chapters[L.chapter]] } : {};
    this.rig = buildRig(L, set.shadowMat);
    set.scene.add(this.rig.root);
    if (this.rig.rod) Object.assign(this.rig, fishingLine(set.scene));
    this.v = (1.05 + 0.25 * hash(k, j, 10)) * (L.ro.v ?? 1);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.walk = 0;
    this.phase = 0;
    this.time = 0;
    this.act = null;
    this.actW = 0;
    this.look = 0;
    this.lastLine = null;
    this.nextGreet = 0;
    this.nextSee = 0;
    this.saw = new Set();
    this.talk = null;          // 玩家找他聊天：{ until }
    this.aboard = true;        // 在船上或正在上下船
    this.speed = 0;
    this.dodge = { x: 0, z: 0 };
    this.meadow = false;       // 走在草原上，小狗會跑過來
    this.bubble = null;
    this.hideTimer = 0;
    this.segs = set.agenda(this, n);
  }

  // 現在照行程該在哪裡、面向哪、在做什麼
  sched(c) {
    const segs = this.segs;
    if (c < segs[0].t0) return this.ride();
    let i = segs.length - 1;
    while (i > 0 && segs[i].t0 > c) i--;
    const sg = segs[i], tau = c - sg.t0;
    if (sg.kind === 'off' || sg.kind === 'on') {
      if (sg.kind === 'on' && tau >= HOP) return this.ride();
      const f = clamp01(tau / HOP), deck = this.deck(), land = this.set.dock.land[this.j];
      const [a, b] = sg.kind === 'off' ? [deck, land] : [land, deck];
      const ground = this.set.world.groundY(land.x, land.z);
      const ya = sg.kind === 'off' ? deck.y : ground, yb = sg.kind === 'off' ? ground : deck.y;
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: lerp(ya, yb, f) + Math.sin(f * Math.PI) * 0.35, h: Math.atan2(b.x - a.x, b.z - a.z), act: null, sg, i, tau };
    }
    if (tau < sg.W) {
      const P = this.path(sg), v = Math.max(this.v, P.D / Math.max(0.5, sg.W - 0.3)), s = tau * v;
      if (s < P.D) { const q = along(P, s); return { x: q.x, z: q.z, h: q.h, act: null, moving: true, sg, i, tau }; }
      return { x: sg.to.x, z: sg.to.z, h: sg.h, act: null, sg, i, tau };
    }
    const ta = tau - sg.W, out = { x: sg.to.x, z: sg.to.z, h: sg.h, act: sg.act, sg, i, tau, face: sg.face };
    if (sg.seat) {
      // 挪進座位坐下，時間到了再挪出來。走到時已經有玩家坐在那個位子上，就站在旁邊（只在自己的畫面上）
      const st = sg.seat;
      sg.blocked ??= this.set.playerOn(st.i);
      const f = sg.blocked ? 0 : smooth(clamp01(Math.min(ta / 0.8, (sg.T - ta) / 0.8)));
      out.x = lerp(sg.to.x, st.x, f);
      out.z = lerp(sg.to.z, st.z, f);
      out.sit = f;
      out.lift = st.lift;
    }
    return out;
  }

  ride() {
    const p = this.deck();
    return { x: p.x, z: p.z, y: p.y, h: this.set.boat.rotation.y + (this.j === 0 ? 0 : Math.PI / 2), act: null, boat: true };
  }

  deck() {
    const [x, z] = SPOTS[this.j];
    return this.set.boat.localToWorld(new THREE.Vector3(x, DECK_Y, z));
  }

  // 這一段要走的路線，第一次走到才尋路
  path(sg) {
    if (sg.P) return sg.P;
    const a = sg.from, b = sg.to, found = this.set.world.findPath(a.x, a.z, b.x, b.z);
    const pts = [a, ...(found && found.length ? found : [b])], cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    sg.P = { pts, cum, D: cum[cum.length - 1], h: sg.h };
    return sg.P;
  }

  get shown() { return this.rig.root.visible; }

  update(dt, c, env) {
    const S = this.sched(c), world = this.set.world;
    const room = S.boat || S.y != null ? world.rooms.length - 1 : world.roomIndexAt(S.z);
    const vis = world.rooms[room].group.visible && !(S.boat && !this.set.boat.visible);
    this.rig.root.visible = vis;
    this.aboard = S.y != null;
    this.sitting = !!S.sit;
    const out = world.outdoor;
    this.meadow = vis && !this.aboard && out.door - S.z > 11 && out.inField(S.x, S.z);
    if (!vis) { this.hush(); this.gear(false); return; }
    this.time += dt;
    const P = env.player, ox = this.pos.x, oz = this.pos.z;
    let pd = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
    // 玩家擋在路上就側身讓一下，讓開的地方要走得到（棧橋很窄）。只在自己的畫面上
    // 走路時玩家擋在前面，就提前往側邊讓：玩家偏哪一側就往另一側，那一側是水或牆就換邊
    let dx = 0, dz = 0;
    if (S.moving) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading), nx = fz, nz = -fx;
      const rx = P.pos.x - S.x, rz = P.pos.z - S.z, ahead = rx * fx + rz * fz, lat = rx * nx + rz * nz;
      if (ahead > -0.6 && ahead < 1.8 && Math.abs(lat) < DODGE) {
        const m = (DODGE - Math.abs(lat)) * clamp01((1.8 - ahead) / 0.8);
        let side = lat > 0 ? -1 : 1;
        if (!world.walkable(S.x + nx * side * DODGE, S.z + nz * side * DODGE)) side = -side;
        dx = nx * side * m;
        dz = nz * side * m;
      }
    }
    const kd = Math.min(1, dt * 6);
    this.dodge.x += (dx - this.dodge.x) * kd;
    this.dodge.z += (dz - this.dodge.z) * kd;
    if (world.walkable(S.x + this.dodge.x, S.z + this.dodge.z)) {
      S.x += this.dodge.x;
      S.z += this.dodge.z;
      pd = Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
    }
    this.pos.set(S.x, 0, S.z);
    // 位置照真實時間算，速度也用真實經過的時間，掉幀時 dt 被截短也不會量錯
    const speed = Math.hypot(S.x - ox, S.z - oz) / Math.max(c - (this.lastC ?? c - dt), 1e-4);
    this.lastC = c;
    const moving = speed > 0.08 && speed < 8;
    this.speed = moving ? speed : 0;
    if (this.talk && env.clock > this.talk.until) this.talk = null;

    // 玩家走近時打招呼，一陣子才一次
    if (pd < GREET_R && env.clock > this.nextGreet && !S.boat) {
      this.nextGreet = env.clock + 50 + Math.random() * 30;
      if (Math.random() < 0.7) this.say(this.pickLine('greet'));
    }
    if (!this.aboard && pd < HEAR) this.notice(S);

    let wantH = S.h;
    if (moving && !S.sit) wantH = Math.atan2(S.x - ox, S.z - oz);
    else if (this.talk && !S.sit && !S.boat) wantH = Math.atan2(P.pos.x - S.x, P.pos.z - S.z);
    else if (S.face) wantH = Math.atan2(S.face.x - S.x, S.face.z - S.z);
    this.heading += wrapAngle(wantH - this.heading) * Math.min(1, dt * (S.sit ? 10 : 6));

    // 玩家在附近就轉頭看他；在聊天的時候一定看
    let look = 0;
    if ((pd < 4 || this.talk) && !moving) look = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(P.pos.x - S.x, P.pos.z - S.z) - this.heading)));
    this.look += (look - this.look) * Math.min(1, dt * 3);

    this.walk += ((moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * (moving ? Math.min(speed, 2.5) : 0) * 7 / this.L.scale;
    const want = S.act;
    if (want !== this.act) {
      this.actW -= dt * 3;
      if (this.actW <= 0) { this.actW = 0; this.act = want; }
    } else this.actW = Math.min(1, this.actW + dt * 2);

    const r = this.rig, sc = this.L.scale, sit = S.sit || 0;
    const ground = S.y ?? world.groundY(S.x, S.z);
    const down = sit * ((S.lift ?? 0.45) + 0.07 * sc - HIP * sc);
    r.root.position.set(S.x, ground + down, S.z);
    r.root.rotation.y = this.heading;
    r.shadow.position.y = 0.012 - down / sc;
    this.pose(sit);
    this.gear(true);
    if (S.sg) this.lines(S, pd, env);
    if (this.bubble?.classList.contains('show')) this.placeBubble(env.camera);
  }

  pose(sit) {
    const r = this.rig, t = this.time, s = Math.sin(this.phase), w = this.walk;
    const W = (n) => (this.act === n ? this.actW : 0);
    const eat = W('eat'), view = W('view'), chat = W('chat'), play = W('play'), fish = W('fish'), sketch = W('sketch'), up = W('up');
    r.body.position.y = Math.abs(s) * 0.05 * w;
    r.body.rotation.set(0.06 * w, 0, s * 0.04 * w);
    r.body.scale.y = 1 + Math.sin(t * 2.1) * 0.012 * (1 - w);
    r.legs[0].rotation.set(s * 0.6 * w, 0, 0);
    r.legs[1].rotation.set(-s * 0.6 * w, 0, 0);
    const L = r.armL.rotation, R = r.armR.rotation;
    L.set(-s * 0.5 * w, 0, -0.12);
    R.set(r.staff ? -0.3 + s * 0.12 * w : s * 0.5 * w, 0, 0.12);
    // 坐下：腿伸到前面，手放在腿上
    for (const g of r.legs) g.rotation.x += (-1.45 - g.rotation.x) * sit;
    L.x += (-0.55 - L.x) * sit;
    if (!r.staff) R.x += (-0.55 - R.x) * sit;
    // 看畫：手背在後面，頭偏一點慢慢晃
    L.x += (0.4 - L.x) * view; L.z += (0.15 - L.z) * view;
    if (!r.staff) { R.x += (0.4 - R.x) * view; R.z += (-0.15 - R.z) * view; }
    // 聊天：比手畫腳
    R.x += (-0.7 + Math.sin(t * 3.1) * 0.35 - R.x) * chat;
    L.x += (-0.25 + Math.sin(t * 2.3 + 1) * 0.15 - L.x) * chat;
    r.body.rotation.z += Math.sin(t * 1.7) * 0.04 * chat;
    // 吃：右手拿著，隔一陣子送到嘴邊
    r.food.visible = this.act === 'eat' && this.actW > 0.3;
    if (eat) {
      const bite = Math.max(0, Math.sin(t * 1.4)) ** 6;
      R.x += (-0.95 - 1.1 * bite - R.x) * eat;
      R.y += (-0.5 * bite - R.y) * eat;
    }
    // 彈琴：琴從背上拿到胸前，左手托琴頸，右手在琴身上撥
    if (r.lute) {
      const b = r.luteBack, f = play;
      r.lute.position.set(lerp(b.x, 0.04, f), lerp(b.y, 0.6, f), lerp(b.z, 0.27 * this.L.W + 0.05, f));
      r.lute.rotation.set(0, lerp(Math.PI, 0, f), lerp(0.55, -1.0, f));
      L.x += (-1.05 - L.x) * play; L.z += (0.55 - L.z) * play;
      R.x += (-0.55 + Math.sin(t * 9) * 0.12 - R.x) * play; R.z += (-0.35 - R.z) * play;
      r.body.rotation.z += Math.sin(t * 2.2) * 0.05 * play;
    }
    // 釣魚：右手往前舉著竿，另一手扶著
    R.x += (-0.38 + Math.sin(t * 0.8) * 0.04 - R.x) * fish;
    L.x += (-0.45 - L.x) * fish; L.z += (0.35 - L.z) * fish;
    if (r.rod) r.rod.visible = this.act !== 'eat';
    // 素描：左手拿本子在胸前，右手在本子上畫
    L.x += (-1.15 - L.x) * sketch; L.z += (0.5 - L.z) * sketch;
    R.x += (-1.0 + Math.sin(t * 5) * 0.08 - R.x) * sketch; R.z += (-0.3 + Math.sin(t * 3.3) * 0.06 - R.z) * sketch;
    if (r.letter) r.letter.visible = this.act === 'chat' && this.actW > 0.3;
    r.head.rotation.set(
      -0.12 * view + Math.sin(t * 0.5) * 0.05 * view + 0.2 * Math.max(0, Math.sin(t * 1.4)) ** 6 * eat + 0.3 * sketch - 0.6 * up + 0.15 * fish,
      this.look, Math.sin(t * 0.37) * 0.12 * view + Math.sin(t * 1.1) * 0.15 * play,
    );
  }

  // 釣線：竿尖垂到水面，浮標在水上一上一下
  gear(on) {
    const r = this.rig;
    if (!r.line) return;
    const fishing = on && this.act === 'fish' && this.actW > 0.6;
    r.line.visible = r.bob.visible = fishing;
    if (!fishing) return;
    const tip = r.tip.getWorldPosition(new THREE.Vector3()), sea = this.set.dock.sea;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const b = new THREE.Vector3(tip.x + fx * 0.5, sea + 0.03 + Math.sin(this.time * 2.2) * 0.025, tip.z + fz * 0.5);
    r.bob.position.copy(b);
    const d = b.clone().sub(tip), len = d.length();
    r.line.position.copy(tip).addScaledVector(d, 0.5);
    r.line.scale.set(1, len, 1);
    r.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // 走過貓頭鷹、土撥鼠、牛旁邊，看到了就說一句。每種只說一次，只演在自己的畫面上
  notice(S) {
    const A = this.set.animals;
    if (!A || this.time < this.nextSee || this.talk || this.bubble?.classList.contains('show')) return;
    this.nextSee = this.time + 1.2;
    for (const a of A.list) {
      const kind = a.spec.pose, r = SEE[kind];
      if (!r || !a.shown || this.saw.has(kind) || (kind === 'owl' && !a.perched) || a.react?.kind === 'hide') continue;
      if (Math.hypot(a.pos.x - S.x, a.pos.z - S.z) > r) continue;
      this.saw.add(kind);
      if (Math.random() < 0.7) this.say(this.pickLine(kind));
      return;
    }
  }

  // 照行程到了該說的時間就說。剛進來的人只看得到最近兩秒內的那一句，不會一口氣冒一串
  lines(S, pd, env) {
    const list = S.sg.lines;
    if (!list) return;
    let i = -1;
    while (i + 1 < list.length && list[i + 1].t <= S.tau) i++;
    if (i < 0) return;
    const key = S.i * 100 + i;
    if (key === this.lastLine) return;
    this.lastLine = key;
    const ln = list[i];
    if (S.tau - ln.t > 2 || pd > HEAR) return;
    if (ln.host) {
      const h = this.set.host;
      if (h?.group.visible && !h.bubble.classList.contains('show')) h.say(ln.text);
    } else if (!this.talk) this.say(ln.text);
  }

  // 從台詞庫抽一句：熟客、職業、種族自己的先出，共用的混在後面。同一趟抽過的不再抽，整船的人也不會說同一句。
  // 排行程時照順序抽，各台裝置抽到一樣的；全部抽完才重複
  pickLine(kind, extra) {
    const ctx = extra ? { ...this.set.ctx, ...extra } : this.set.ctx;
    let bag = this.bags.get(kind);
    if (!bag) {
      const own = [...(this.own[kind] || []), ...(ROLE_LINES[this.L.role][kind] || []), ...(VOICES[this.L.kind]?.[kind] || [])];
      const salt = tag(kind), all = [...own.map((s) => [s, 0.45]), ...(LINES[kind] || []).map((s) => [s, 1])];
      bag = { list: all.map(([s, w], i) => ({ s, r: hash(this.seed, salt, i) * w })).sort((a, b) => a.r - b.r).map((x) => x.s), i: 0 };
      this.bags.set(kind, bag);
    }
    const used = this.set.used, n = bag.list.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let m = 0; m < n; m++) {
        const s = bag.list[(bag.i + m) % n];
        if (pass === 0 && used.has(s)) continue;
        const text = fill(s, ctx);
        if (!text) continue;
        bag.i = (bag.i + m + 1) % n;
        used.add(s);
        return text;
      }
    }
    return null;
  }

  // 跟海牛聊什麼：先打招呼，信差先交信，熟客接著講他的故事，其他人的話題每人順序不同
  topics() {
    const L = this.L;
    if (L.reg) return ['hello', ...L.reg.chapters[L.chapter].map((s) => ({ story: s }))];
    const rest = ['trip', 'chat', 'art', 'food', 'news', 'plan'].map((t, i) => [t, hash(this.seed, 77, i)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    return L.role === 'courier' ? ['hello', 'letter', ...rest] : ['hello', ...rest];
  }

  // 小狗跑過來迎接
  greetedBy() {
    if (Math.hypot(this.pos.x - this.set.player.pos.x, this.pos.z - this.set.player.pos.z) < HEAR) this.say(this.pickLine('dog'));
  }

  // 玩家按「聊天」：轉過來面向玩家，照正在做的事回一句
  talkTo() {
    this.talk = { until: performance.now() / 1000 + 4 };
    const about = TALK_ABOUT[this.act] || (this.sitting ? 'talkBench' : null);
    const kind = about && Math.random() < 0.55 ? about : 'talk';
    this.say(this.pickLine(kind) || this.pickLine('talk'));
  }

  // 船上說的話：人在看得到的地方才冒對話框
  boatSay(text) {
    if (this.shown && Math.hypot(this.rig.root.position.x - this.set.player.pos.x, this.rig.root.position.z - this.set.player.pos.z) < 40) this.say(text);
  }

  say(text) {
    if (!text) return;
    if (!this.bubble) {
      this.bubble = document.createElement('div');
      this.bubble.className = 'speech';
      document.body.appendChild(this.bubble);
    }
    clearTimeout(this.hideTimer);
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    this.placeBubble(this.set.camera);
    this.hideTimer = setTimeout(() => this.bubble?.classList.remove('show'), Math.min(6000, 2200 + text.length * 120));
  }

  hush() {
    clearTimeout(this.hideTimer);
    this.bubble?.classList.remove('show');
  }

  placeBubble(camera) {
    const v = this.rig.root.position.clone();
    v.y += (this.L.kind === 'rabbit' ? 1.8 : 1.55) * this.L.scale + this.j * 0.22;   // 同一船的人對話框高低錯開
    v.project(camera);
    const b = this.bubble.style;
    if (v.z > 1) { b.visibility = 'hidden'; return; }
    b.visibility = '';
    b.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
    b.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
  }

  dispose() {
    this.hush();
    this.bubble?.remove();
    this.rig.root.removeFromParent();
    for (const g of this.rig.geos) g.dispose();
    if (this.rig.line) {
      for (const o of [this.rig.line, this.rig.bob]) { o.removeFromParent(); o.geometry.dispose(); }
    }
  }
}

// ---------- 全體 ----------

export class Visitors {
  constructor({ scene, world, shadowTex, player, camera, host, animals, force = null }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.host = host;
    this.animals = animals;
    this.dock = world.outdoor?.dock;
    this.list = [];
    this.talkLines = [];
    this.k = null;
    this.offset = 0;
    this.force = null;
    if (!this.dock) return;
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    this.boatInfo = boatTimes(this.dock.route, this.dock.far);
    this.boat = boatModel();
    this.boat.visible = false;
    world.rooms[world.rooms.length - 1].group.add(this.boat);
    this.tmp = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    // ?visit：除錯用，這一段一定有船，而且從快靠岸的時候開始。?visit=1 到 5 指定哪一位熟客坐這一船
    if (force != null) {
      const now = Date.now() / 1000, k = Math.floor(now / SLOT);
      this.force = k;
      this.forceReg = REGULARS[+force - 1] || null;
      this.offset = k * SLOT + this.boatInfo.tIn - 15 - now;
    }
  }

  // ---- 行程 ----

  // 世界裡去得了的地方。每次排行程時現找，房間或畫換了就跟著換
  places() {
    const w = this.world, out = w.outdoor, A = this.animals?.list || [];
    const seats = out.seats.map((s, i) => ({ ...s, i }));
    const benches = seats.filter((s) => !s.table), land = this.dock.land[0];
    const near = (s) => Math.hypot(s.x - land.x, s.z - land.z);
    return {
      paintings: w.paintings,
      host: out.host,
      table: out.table,
      eatSeats: seats.filter((s) => s.table),
      benches,
      dockBench: benches.length ? benches.reduce((a, b) => (near(b) < near(a) ? b : a)) : null,
      mirror: w.mirror,
      cows: A.filter((a) => a.spec.pose === 'cow'),
      burrows: A.filter((a) => a.spec.burrow).map((a) => a.home.burrow),
      owl: this.animals?.owl,
      perch: out.perches?.[0],
      pavilion: out.pavilion,
      door: out.door,
    };
  }

  // 看畫站的位置：畫前一兩公尺，同一船的人左右錯開
  viewSpot(p, j) {
    const n = p.n, tx = -n.z, tz = n.x, lat = [0, 0.75, -0.75][j];
    for (const d of [2, 1.7, 2.4, 1.4]) {
      for (const l of [lat, lat * 0.5, -lat]) {
        const x = p.wall.x + n.x * d + tx * l, z = p.wall.z + n.z * d + tz * l;
        if (this.world.walkable(x, z)) return { x, z };
      }
    }
    return this.world.findWalkable(p.wall.x + n.x * 1.6, p.wall.z + n.z * 1.6, p.wall.x + n.x * 3, p.wall.z + n.z * 3);
  }

  // 一位訪客這一趟的行程：下船 → 找海牛聊天 →（吃點心、看畫、坐一坐、草原上走走，順序每人不同）→ 走回船邊 → 上船
  // 漁夫最後到棧橋盡頭釣魚，信差最後在棧橋的長椅上等船。時間不夠就少做幾件；有多的就每件做久一點
  agenda(vis, n) {
    const { k, j, L } = vis, ro = L.ro, B = this.boatInfo, pl = this.places(), w = this.world;
    const land = this.dock.land[j], Z = (rel) => pl.door - rel, mid = { x: 0, z: Z(22.5) };
    const tOff = B.tIn + 2 + j * 2.5, tEnd = B.tIn + B.moor - 6 - (n - 1 - j) * 2.5;
    const est = (a, b) => 1.5 + (Math.hypot(a.x - b.x, a.z - b.z) * 1.2) / vis.v;
    const u = (s) => hash(k, j, s);
    const shuffle = (a, s) => a.map((x, i) => [x, hash(k, j * 50 + i, s)]).sort((p, q) => p[1] - q[1]).map((x) => x[0]);
    // 站在 c 旁邊 d 公尺、朝草原中間那一側，面向 c
    const beside = (c, d) => {
      const dx = mid.x - c.x, dz = mid.z - c.z, l = Math.hypot(dx, dz) || 1;
      return w.findWalkable(c.x + (dx / l) * d, c.z + (dz / l) * d, mid.x, mid.z);
    };
    const items = [];

    // 跟海牛聊天：站在海牛背對長桌的那一側，三個人分開站
    const hp = pl.host, ax = hp.x - pl.table.x, az = hp.z - pl.table.z, base = Math.atan2(ax, az) + (j - 1) * 0.75;
    const cs = w.findWalkable(hp.x + Math.sin(base) * 1.3, hp.z + Math.cos(base) * 1.3, hp.x, hp.z);
    if (cs) items.push({ kind: 'chat', act: 'chat', to: cs, h: Math.atan2(hp.x - cs.x, hp.z - cs.z), face: hp, T: L.reg ? 30 : ro.chatT ?? 22 });

    const rest = [];
    if (pl.eatSeats.length && u(26) < 0.85) {
      const st = pl.eatSeats[(Math.floor(u(20) * pl.eatSeats.length) + j * 2) % pl.eatSeats.length];
      rest.push([{ kind: 'eat', act: 'eat', to: { x: st.ax, z: st.az }, seat: st, h: st.h, T: 38 * (ro.eatT ?? 1), food: Math.floor(u(21) * FOODS.length) }]);
    }
    // 看幾幅畫，照離後門的遠近排，走進去一路看過去。畫家有一半是站著速寫
    const [v0, v1] = ro.views ?? [2, 4];
    const ps = pl.paintings.map((p, i) => ({ p, i, r: hash(k, j * 31 + i, 22) })).sort((a, b) => a.r - b.r);
    const m = Math.min(ps.length, v0 + Math.floor(u(23) * (v1 - v0 + 1)));
    const views = ps.slice(0, m).sort((a, b) => b.i - a.i).map(({ p, i }) => {
      const to = this.viewSpot(p, j), sketch = L.role === 'painter' && hash(k, j * 31 + i, 24) < 0.5;
      return to && { kind: sketch ? 'sketch' : 'view', act: sketch ? 'sketch' : 'view', to, h: Math.atan2(-p.n.x, -p.n.z), T: ro.viewT ?? 22, p };
    }).filter(Boolean);
    if (views.length) rest.push(views);
    // 吟遊詩人一定找張椅子坐下來彈琴；其他人有時坐一下，有時照照鏡子
    if (pl.benches.length && (L.role === 'bard' || u(24) < 0.5)) {
      const st = pl.benches[(Math.floor(u(25) * pl.benches.length) + j) % pl.benches.length], bard = L.role === 'bard';
      rest.push([{ kind: bard ? 'play' : 'bench', act: bard ? 'play' : null, to: { x: st.ax, z: st.az }, seat: st, h: st.h, T: bard ? 45 : 28 }]);
    } else if (pl.mirror) {
      const mr = pl.mirror, to = w.findWalkable(mr.x + mr.n.x * 1.6, mr.z + mr.n.z * 1.6, mr.x + mr.n.x * 3, mr.z + mr.n.z * 3);
      if (to) rest.push([{ kind: 'mirror', act: 'view', to, h: Math.atan2(-mr.n.x, -mr.n.z), T: 12 }]);
    }
    // 草原上的去處：海邊看夕陽、看牛、看樹上的貓頭鷹、看土撥鼠、爬上涼亭。每人挑一兩個
    const extras = [];
    {
      const sx = -9 + j * 3 + (u(50) - 0.5) * 6, to = w.findWalkable(sx, Z(37.4), sx, Z(30));
      if (to) extras.push({ kind: 'sunset', act: 'view', to, h: Math.PI, T: 18 });
    }
    if (pl.cows.length) {
      const c = pl.cows[Math.floor(u(51) * pl.cows.length)].home, to = beside(c, c.r * 0.5 + 2);
      if (to) extras.push({ kind: 'cow', act: 'view', to, h: 0, face: { x: c.x, z: c.z }, T: 16 });
    }
    if (pl.perch && pl.owl) {
      const p = pl.perch, to = w.findWalkable(p.x + Math.sin(p.h) * 1.7, p.z + Math.cos(p.h) * 1.7, mid.x, mid.z);
      if (to) extras.push({ kind: 'owl', act: 'up', to, h: 0, face: p, T: 14, when: (t) => pl.owl.perchFor(t).i === 0 });
    }
    if (pl.burrows.length) {
      const b = pl.burrows[Math.floor(u(53) * pl.burrows.length)], to = beside(b, 3.3);
      if (to) extras.push({ kind: 'marmot', act: 'view', to, h: 0, face: b, T: 16 });
    }
    if (pl.pavilion) {
      const p = pl.pavilion, to = w.findWalkable(p.x + 1.2, p.z - p.r - 2.5, p.x, p.z);
      if (to) extras.push({ kind: 'pavilion', act: 'view', to, h: Math.PI, T: 20 });
    }
    rest.push(...shuffle(extras, 55).slice(0, 1 + (u(52) < 0.45)).map((x) => [x]));
    // 畫家另外找個地方畫海
    if (L.role === 'painter') {
      const x = -6 + u(56) * 12, to = w.findWalkable(x, Z(30 + u(57) * 4), x, Z(25));
      if (to) rest.push([{ kind: 'sketch', act: 'sketch', to, h: Math.PI, T: 40 }]);
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const r = Math.floor(u(30 + i) * (i + 1));
      [rest[i], rest[r]] = [rest[r], rest[i]];
    }
    items.push(...rest.flat());

    // 最後一件事先把時間留下來
    const last = [];
    if (L.role === 'fisher') last.push({ kind: 'fish', act: 'fish', to: { x: JETTY.x + 1.1 - j * 0.95, z: Z(JETTY.end - 0.5) }, h: Math.PI, T: 70 });
    if (L.role === 'courier' && pl.dockBench) {
      const st = pl.dockBench;
      last.push({ kind: 'bench', act: null, to: { x: st.ax, z: st.az }, seat: st, h: st.h, T: 50 });
    }
    const keep = last.reduce((s, it) => s + it.T + 2 * est(it.to, land), 0);

    let t = tOff + HOP, at = land, sumT = 0;
    const chosen = [];
    for (const it of items) {
      const W = est(at, it.to);
      if (t + W + it.T + est(it.to, land) + keep > tEnd) continue;
      if (it.when && !it.when(k * SLOT + t + W)) continue;
      chosen.push({ ...it, W });
      t += W + it.T;
      sumT += it.T;
      at = it.to;
    }
    for (const it of last) {
      const W = est(at, it.to);
      if (t + W + it.T + est(it.to, land) > tEnd) continue;
      chosen.push({ ...it, W });
      t += W + it.T;
      sumT += it.T;
      at = it.to;
    }
    const f = sumT ? Math.min(1.8, 1 + (tEnd - t - est(at, land)) / sumT) : 1;

    const segs = [{ kind: 'off', t0: tOff, lines: [{ t: HOP + 0.3, text: vis.pickLine('land') }] }];
    t = tOff + HOP;
    let from = land;
    chosen.forEach((it, i) => {
      const sg = { ...it, t0: t, T: it.T * f, from };
      sg.lines = this.script(vis, sg, i);
      segs.push(sg);
      t += sg.W + sg.T;
      from = it.to;
    });
    const W = est(from, land);
    segs.push({ kind: 'board', t0: t, W, T: 0, from, to: land, h: Math.atan2(land.x - from.x, land.z - from.z), lines: [{ t: 0.5, text: vis.pickLine('leave') }] });
    segs.push({ kind: 'on', t0: t + W, lines: null });
    return segs;
  }

  // 一段裡要說的話：時間從這一段開始算（含走路）。聊天是一來一回，海牛隔幾秒照話題回話
  script(vis, sg, i) {
    const h = (s) => hash(vis.seed, i, s), out = [];
    const outside = (p) => this.world.outdoor.inMeadow(p.z);
    if (sg.W > 15 && h(1) < 0.35) out.push({ t: 1, text: vis.pickLine(outside(sg.from) && outside(sg.to) ? 'walkOut' : 'walk') });
    const t0 = sg.W;
    const ctx = sg.p ? paintCtx(sg.p.data || {}) : sg.food != null ? { f: FOODS[sg.food].name } : null;
    if (sg.kind === 'chat') {
      const topics = vis.topics();
      for (let t = 1, n = 0; t < sg.T - 3 && n < topics.length; n++) {
        const tp = topics[n], text = tp.story ?? vis.pickLine(tp);
        if (!text) continue;
        out.push({ t: t0 + t, text });
        out.push({ t: t0 + t + 3, text: this.hostLine(tp.story ? 'story' : tp), host: true });
        t += 6.5;
      }
    } else {
      // 畫前速寫的人，畫畫的話和看畫的話輪著說
      const cats = sg.kind === 'sketch' && sg.p ? ['sketch', 'view'] : [sg.kind];
      for (let t = 2 + h(3) * 2, n = 0; t < sg.T - 2; t += 9 + h(20 + n) * 8, n++) {
        if (h(40 + n) < 0.75) out.push({ t: t0 + t, text: vis.pickLine(cats[n % cats.length], ctx) });
      }
    }
    return out.filter((l) => l.text);
  }

  // 海牛回話：同一船裡不重複
  hostLine(topic) {
    const pool = HOST[topic] || HOST.chat, n = pool.length, salt = tag(topic);
    const at = this.hostAt.get(topic) ?? Math.floor(hash(this.k, salt, 3) * n);
    for (let m = 0; m < n; m++) {
      const text = fill(pool[(at + m) % n], this.ctx);
      if (!text) continue;
      this.hostAt.set(topic, (at + m + 1) % n);
      return text;
    }
    return null;
  }

  // 船上的對話：快靠岸時一段、全員上船船要開時一段。一個人來的就自言自語
  boatScript(k) {
    const vs = this.list, n = vs.length, B = this.boatInfo, out = [];
    const add = (t0, pool, solo, salt) => {
      if (n === 1) {
        out.push({ t: t0, v: vs[0], text: fill(solo[Math.floor(hash(k, salt, 1) * solo.length)], this.ctx) });
        return;
      }
      const d = pool[Math.floor(hash(k, salt, 1) * pool.length)], s0 = Math.floor(hash(k, salt, 2) * n);
      d.forEach((line, i) => out.push({ t: t0 + i * 3.4, v: vs[(s0 + i) % n], text: fill(line, this.ctx) }));
    };
    add(B.tIn - 13, BOAT.arrive, BOAT.arriveSolo, 61);
    const aboard = Math.max(...vs.map((v) => v.segs[v.segs.length - 1].t0)) + HOP;
    add(Math.max(aboard + 1, B.tIn + B.moor - 3), BOAT.leave, BOAT.leaveSolo, 62);
    return out.filter((l) => l.text);
  }

  // ---- 每一幀 ----

  plan(k) {
    this.talkLines = [];
    if (k !== this.force && hash(k, 0, 0x71) >= CHANCE) return;
    const r = hash(k, 0, 2), n = r < 0.4 ? 1 : r < 0.8 ? 2 : 3, taken = new Set();
    // 熟客：每 REGULAR_EVERY 段輪一次班，每來一次就往下講一章
    const ri = k % REGULAR_EVERY, reg = k === this.force && this.forceReg ? this.forceReg : ri % 2 === 0 ? REGULARS[ri / 2] : null;
    const pick = (list, s) => list[Math.floor(hash(k, 0, s) * list.length)];
    this.ctx = { o: pick(ORIGINS, 3), e: pick(EVENTS, 4), n: pick(NEXTS, 5), f: pick(FOODS, 6).name };
    this.used = new Set();
    this.hostAt = new Map();
    for (let j = 0; j < n; j++) {
      const L = looks(k, j, taken, j === 0 ? reg : null);
      if (L.reg) L.chapter = Math.floor(k / REGULAR_EVERY) % L.reg.chapters.length;
      taken.add(L.kind);
      this.list.push(new Visitor(this, k, j, n, L));
    }
    for (const v of this.list) {
      const sg = v.segs.find((s) => s.kind === 'eat');
      if (sg) v.rig.food.geometry = foodGeo(sg.food);
    }
    this.talkLines = this.boatScript(k);
  }

  update(dt) {
    if (!this.dock) return;
    const now = Date.now() / 1000 + this.offset, k = Math.floor(now / SLOT), c = now - k * SLOT;
    if (k !== this.k) {
      for (const v of this.list) v.dispose();
      this.list = [];
      this.k = k;
      this.lastC = c;
      this.plan(k);
    }
    const B = this.boatInfo, outVis = this.world.rooms[this.world.rooms.length - 1].group.visible;
    const s = this.list.length ? B.at(c) : null;
    this.boat.visible = s != null && outVis;
    if (s != null) {
      const u = (s / B.LEN) % 1;
      B.curve.getPointAt(u, this.tmp);
      B.curve.getTangentAt(u, this.tan);
      this.boat.position.set(this.tmp.x, this.dock.sea + BOAT_DIM.rise + Math.sin(now * 0.9) * 0.04, this.tmp.z);
      this.boat.rotation.set(Math.sin(now * 0.7) * 0.012, Math.atan2(this.tan.x, this.tan.z), Math.sin(now * 0.55) * 0.025);
      this.boat.updateMatrixWorld();
    }
    if (!this.list.length) return;
    const env = { player: this.player, camera: this.camera, clock: performance.now() / 1000 };
    // 船在霧裡等的時候人也藏起來
    for (const v of this.list) {
      if (s == null) { v.rig.root.visible = false; v.hush(); v.gear(false); continue; }
      v.update(dt, c, env);
    }
    // 船上的對話：這一幀剛好走過的那幾句
    if (c - this.lastC > 3) this.lastC = c;
    for (const l of this.talkLines) if (l.t > this.lastC && l.t <= c) l.v.boatSay(l.text);
    this.lastC = c;
  }

  // 自己或別的玩家坐在第 i 個座位上
  playerOn(i) {
    if (this.player.sitCode - 1 === i) return true;
    if (this.mp) for (const o of this.mp.others.values()) if (o.target?.s - 1 === i) return true;
    return false;
  }

  // 第 i 個座位現在有訪客坐著，玩家就不能坐
  seatBusy(i) {
    for (const v of this.list) {
      if (!v.shown || !v.sitting) continue;
      const sg = v.segs.find((s) => s.seat?.i === i && !s.blocked);
      if (sg && Math.hypot(v.pos.x - sg.seat.x, v.pos.z - sg.seat.z) < 0.6) return true;
    }
    return false;
  }

  // 站在地上的訪客擋路：人不能穿過，但已經被擠到的人可以往外走（同乳牛）
  blocks(x, z, ox, oz) {
    for (const v of this.list) {
      if (!v.shown || v.aboard || v.sitting) continue;
      const r = 0.3 * v.L.scale * v.L.W, d = Math.hypot(x - v.pos.x, z - v.pos.z);
      if (d < r && d < Math.hypot(ox - v.pos.x, oz - v.pos.z)) return true;
    }
    return false;
  }

  // 「聊天」按鈕：附近最近的一位，在船上的不算
  nearest(x, z) {
    let best = null, bd = 1.8;
    for (const v of this.list) {
      if (!v.shown) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < bd && !v.aboard) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }

  // 長桌主人要看哪裡：有訪客在跟他聊天時看那位
  hostFocus() {
    for (const v of this.list) if (v.shown && v.act === 'chat') return v.pos;
    return null;
  }
}
