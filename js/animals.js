// 動物：草原上的乳牛、母雞、鴨子和小狗，山腳的土撥鼠，停在高處的貓頭鷹，黑化走廊裡的黑貓。
// 每隻動物的日常行程（走去哪、停下來做什麼）由「動物編號 + 現在是第幾段時間」算出來，
// 每位訪客的畫面算出同一個結果，不用傳任何資料。對玩家的反應（狗跑過來、雞被嚇跑）只演在自己的畫面上，
// 演完再走回行程。摸摸用廣播同步，跟跳躍一樣只傳「誰摸了哪一隻」。
// 搭船來的訪客（visitors.js）走過草原時，小狗會跑去迎接，雞和鴨會讓開，同樣只演在自己的畫面上。
// 每種動物的零件合併成幾個網格，同種共用；一隻大約五到八次繪製。全部放在圖層 1，海面反射不畫牠們。
import * as THREE from 'three';
import { Kit, mergeBucket, rng } from './props.js';

export const LIT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });   // 貓眼睛在暗處也看得到
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);
export const ANIMAL_LAYER = 1;

const QUAD = [0, Math.PI, Math.PI, 0];   // 左前、右前、左後、右後：對角的兩隻腳一起動
const BIPED = [0, Math.PI];
const smooth = (t) => t * t * (3 - 2 * t);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// 三個整數雜湊成 [0, 1)。行程全靠它，各台裝置算出來一樣
export function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pickAct(acts, u) {
  let sum = 0;
  for (const [, w] of acts) sum += w;
  for (const [a, w] of acts) if ((u -= w / sum) < 0) return a;
  return acts[acts.length - 1][0];
}

// ---------- 造型 ----------
// 每個零件用 Kit 拼好再合併成一個幾何，原點在關節上。身體的原點在身體中心（離地 cy），動物面向 +z

export function geo(build) {
  const k = new Kit(null);
  build(k);
  return mergeBucket(k.lit, false);
}

const models = new Map();
function model(key, build) {
  if (!models.has(key)) models.set(key, build());
  return models.get(key);
}

const COWS = {
  holstein: { base: '#f1ece2', spot: '#2a2624', nose: '#e9a8a0' },
  jersey:   { base: '#a8693c', spot: '#e8dcc8', nose: '#c88a80' },
};
function cowModel(c) {
  const horn = '#e8dcc0', hoof = '#3a2c24';
  return {
    cy: 0.95, shadow: [1.3, 2.3],
    body: geo((k) => {
      k.add(new THREE.CapsuleGeometry(0.4, 0.75, 3, 10), c.base, 0, 0, 0, { rx: Math.PI / 2, sx: 0.92 });
      k.ball(0.22, c.spot, 0.3, 0.08, 0.15, { sx: 0.45, sy: 0.9, sz: 1.2 });
      k.ball(0.19, c.spot, -0.31, 0.12, -0.28, { sx: 0.45, sy: 0.8, sz: 1.1 });
      k.ball(0.2, c.spot, 0.05, 0.34, -0.38, { sx: 1.2, sy: 0.35, sz: 1 });
      k.box(0.34, 0.4, 0.36, c.base, 0, 0.15, 0.62, { rx: -0.5 });
      k.ball(0.14, c.nose, 0, -0.36, -0.42, { sy: 0.7 });
    }),
    head: { at: [0, 0.3, 0.8], geo: geo((k) => {
      k.box(0.4, 0.38, 0.42, c.base, 0, 0, 0.18);
      k.box(0.42, 0.26, 0.2, c.nose, 0, -0.08, 0.44);
      for (const s of [-1, 1]) {
        k.box(0.05, 0.04, 0.02, '#3a2420', s * 0.09, -0.06, 0.545);
        k.ball(0.035, '#1a1412', s * 0.2, 0.06, 0.3);
        k.cone(0.045, 0.18, horn, s * 0.16, 0.24, 0.12, { rz: -s * 0.6 });
        k.box(0.18, 0.07, 0.1, c.base, s * 0.27, 0.08, 0.08, { rz: s * 0.3 });
      }
      k.ball(0.12, c.spot, 0.1, 0.12, 0.2, { sz: 1.4, sy: 0.5 });
    }) },
    legs: { at: [[-0.24, -0.33, 0.5], [0.24, -0.33, 0.5], [-0.24, -0.33, -0.5], [0.24, -0.33, -0.5]], geo: geo((k) => {
      k.box(0.16, 0.56, 0.16, c.base, 0, -0.28, 0);
      k.box(0.18, 0.08, 0.18, hoof, 0, -0.58, 0);
    }) },
    tail: { at: [0, 0.25, -0.8], geo: geo((k) => {
      k.box(0.05, 0.6, 0.05, c.base, 0, -0.3, 0);
      k.ball(0.07, c.spot, 0, -0.62, 0, { sy: 1.6 });
    }) },
  };
}

const CHICKENS = {
  white: { body: '#f4efe5', wing: '#e2dacb', tail: '#e6dfd2' },
  brown: { body: '#b8693a', wing: '#8a4826', tail: '#3a2a24' },
};
function chickenModel(c) {
  const comb = '#d8322a', beak = '#e8a83a';
  return {
    cy: 0.28, shadow: [0.5, 0.6],
    body: geo((k) => {
      k.ball(0.17, c.body, 0, 0, 0, { sx: 0.95, sy: 0.9, sz: 1.2 });
      for (const s of [-1, 1]) k.ball(0.12, c.wing, s * 0.14, 0.01, -0.02, { sx: 0.35, sy: 0.75, sz: 1.3 });
      k.cone(0.09, 0.22, c.tail, 0, 0.1, -0.2, { rx: -0.7 });
    }),
    head: { at: [0, 0.12, 0.15], geo: geo((k) => {
      k.ball(0.085, c.body, 0, 0.07, 0.02);
      k.ball(0.03, comb, 0, 0.155, 0.05);
      k.ball(0.032, comb, 0, 0.165, 0.0);
      k.ball(0.026, comb, 0, 0.15, -0.045);
      k.cone(0.03, 0.07, beak, 0, 0.065, 0.12, { rx: Math.PI / 2 });
      k.ball(0.022, comb, 0, 0.02, 0.1, { sy: 1.5 });
      for (const s of [-1, 1]) k.ball(0.014, '#1a1412', s * 0.06, 0.09, 0.07);
    }) },
    legs: { at: [[-0.06, -0.12, 0], [0.06, -0.12, 0]], geo: geo((k) => {
      k.cyl(0.012, 0.012, 0.15, beak, 0, -0.08, 0, {}, 5);
      k.box(0.06, 0.012, 0.07, beak, 0, -0.155, 0.02);
    }) },
  };
}

const DUCKS = {
  white:    { body: '#f4f1ea', wing: '#e4e0d6', head: '#f4f1ea', bill: '#f0a030' },
  drake:    { body: '#9a8a78', wing: '#6a5a4a', head: '#2a6a40', bill: '#e0c040', ring: '#f4f1ea', chest: '#7a4a32' },
  hen:      { body: '#a07a52', wing: '#7a5a3a', head: '#8a6a48', bill: '#c88a3a' },
  duckling: { body: '#f6d84e', wing: '#e8c43a', head: '#f6d84e', bill: '#e89a30' },
};
function duckModel(c) {
  return {
    cy: 0.24, shadow: [0.5, 0.65],
    body: geo((k) => {
      k.ball(0.16, c.body, 0, 0, 0, { sx: 0.95, sy: 0.8, sz: 1.35 });
      if (c.chest) k.ball(0.12, c.chest, 0, 0.02, 0.12, { sx: 1.05, sy: 0.9 });
      for (const s of [-1, 1]) k.ball(0.11, c.wing, s * 0.12, 0.03, -0.03, { sx: 0.35, sy: 0.7, sz: 1.4 });
      k.cone(0.07, 0.14, c.wing, 0, 0.06, -0.22, { rx: -1.0 });
    }),
    head: { at: [0, 0.08, 0.16], geo: geo((k) => {
      k.cyl(0.05, 0.06, 0.16, c.head, 0, 0.07, 0, {}, 7);
      if (c.ring) k.cyl(0.056, 0.058, 0.02, c.ring, 0, 0.03, 0, {}, 7);
      k.ball(0.085, c.head, 0, 0.17, 0.03);
      k.box(0.08, 0.03, 0.12, c.bill, 0, 0.14, 0.13);
      for (const s of [-1, 1]) k.ball(0.014, '#1a1412', s * 0.065, 0.19, 0.06);
    }) },
    legs: { at: [[-0.065, -0.1, 0.02], [0.065, -0.1, 0.02]], geo: geo((k) => {
      k.cyl(0.014, 0.014, 0.11, '#e89a30', 0, -0.06, 0, {}, 5);
      k.box(0.07, 0.012, 0.09, '#e89a30', 0, -0.135, 0.03);
    }) },
  };
}

function dogModel() {
  const tan = '#c8803e', cream = '#f2e0c4', dark = '#2a1e18';
  return {
    cy: 0.4, shadow: [0.75, 1.0],
    body: geo((k) => {
      k.add(new THREE.CapsuleGeometry(0.16, 0.36, 3, 8), tan, 0, 0, 0, { rx: Math.PI / 2 });
      k.ball(0.15, cream, 0, -0.04, 0.2, { sx: 0.85, sy: 0.85, sz: 0.9 });
    }),
    head: { at: [0, 0.16, 0.3], geo: geo((k) => {
      k.ball(0.14, tan, 0, 0.06, 0.04, { sz: 1.05 });
      k.box(0.13, 0.1, 0.13, cream, 0, 0.0, 0.17);
      k.box(0.05, 0.04, 0.03, dark, 0, 0.03, 0.245);
      for (const s of [-1, 1]) {
        k.ball(0.02, dark, s * 0.065, 0.1, 0.14);
        k.cone(0.05, 0.11, tan, s * 0.08, 0.19, 0.0, { rz: -s * 0.2 });
        k.ball(0.05, cream, s * 0.08, 0.02, 0.1, { sz: 0.8 });
      }
    }) },
    legs: { at: [[-0.09, -0.12, 0.2], [0.09, -0.12, 0.2], [-0.09, -0.12, -0.2], [0.09, -0.12, -0.2]], geo: geo((k) => {
      k.box(0.07, 0.25, 0.07, tan, 0, -0.13, 0);
      k.box(0.08, 0.05, 0.1, cream, 0, -0.255, 0.01);
    }) },
    tail: { at: [0, 0.12, -0.3], geo: geo((k) => {
      k.box(0.05, 0.18, 0.05, tan, 0, 0.09, 0, { rx: -0.4 });
      k.ball(0.06, cream, 0, 0.2, 0.05);
    }) },
  };
}

function catModel() {
  const B = '#1d1b22', B2 = '#2b2833';
  return {
    cy: 0.22, shadow: [0.55, 0.8],
    body: geo((k) => {
      k.add(new THREE.CapsuleGeometry(0.1, 0.26, 3, 8), B, 0, 0, 0, { rx: Math.PI / 2 });
      k.ball(0.1, B2, 0, -0.02, 0.12, { sx: 0.9 });
    }),
    head: { at: [0, 0.12, 0.2], geo: geo((k) => {
      k.ball(0.095, B, 0, 0.05, 0.03, { sx: 1.1, sy: 0.95 });
      k.ball(0.04, B2, 0, 0.02, 0.1, { sx: 1.3, sy: 0.8 });
      k.box(0.02, 0.015, 0.01, '#d88a9a', 0, 0.04, 0.125);
      for (const s of [-1, 1]) k.cone(0.04, 0.08, B, s * 0.055, 0.14, 0.02, { rz: -s * 0.25 });
    }) },
    eyes: geo((k) => {
      for (const s of [-1, 1]) {
        k.ball(0.022, '#e8d24a', s * 0.045, 0.07, 0.1, { sz: 0.5 });
        k.box(0.006, 0.03, 0.01, '#000000', s * 0.045, 0.07, 0.112);
      }
    }),
    legs: { at: [[-0.05, -0.08, 0.13], [0.05, -0.08, 0.13], [-0.05, -0.08, -0.13], [0.05, -0.08, -0.13]], geo: geo((k) => {
      k.cyl(0.022, 0.02, 0.13, B, 0, -0.07, 0, {}, 6);
      k.ball(0.025, B, 0, -0.135, 0.01, { sy: 0.6 });
    }) },
    tail: { at: [0, 0.04, -0.22], geo: geo((k) => {
      k.cyl(0.018, 0.022, 0.2, B, 0, 0.1, 0, {}, 6);
      k.cyl(0.016, 0.018, 0.14, B, 0, 0.25, 0.04, { rx: 0.5 }, 6);
    }) },
  };
}

// 胖土撥鼠：圓滾滾的身體、短腿、兩顆門牙
function marmotModel() {
  const fur = '#8a6644', belly = '#c9a77c', dark = '#4e3826';
  return {
    cy: 0.16, shadow: [0.5, 0.65],
    body: geo((k) => {
      k.ball(0.17, fur, 0, 0, 0, { sx: 1.08, sy: 0.92, sz: 1.3, color2: '#a07a52' });
      k.ball(0.13, belly, 0, -0.045, 0.07, { sx: 0.95, sy: 0.8, sz: 1.2 });
    }),
    head: { at: [0, 0.07, 0.19], geo: geo((k) => {
      k.ball(0.11, fur, 0, 0.03, 0.03, { sx: 1.12, sy: 0.95 });
      k.ball(0.06, belly, 0, -0.01, 0.1, { sx: 1.25, sy: 0.8 });
      k.box(0.035, 0.022, 0.02, '#2a1a12', 0, 0.018, 0.16);
      k.box(0.024, 0.032, 0.01, '#f4efe2', 0, -0.045, 0.142);
      for (const s of [-1, 1]) {
        k.ball(0.017, '#14100c', s * 0.055, 0.06, 0.1);
        k.ball(0.03, dark, s * 0.078, 0.11, 0.0, { sz: 0.5 });
      }
    }) },
    legs: { at: [[-0.1, -0.09, 0.12], [0.1, -0.09, 0.12], [-0.1, -0.09, -0.12], [0.1, -0.09, -0.12]], geo: geo((k) => {
      k.box(0.06, 0.08, 0.065, dark, 0, -0.035, 0);
      k.ball(0.035, dark, 0, -0.07, 0.015, { sy: 0.6 });
    }) },
    tail: { at: [0, -0.01, -0.21], geo: geo((k) => k.ball(0.045, dark, 0, 0, -0.04, { sz: 1.6 })) },
  };
}

// 貓頭鷹：蛋形的身體、圓臉盤、一對大眼睛和耳羽，兩片翅膀各自能拍
function owlModel() {
  const B = '#7a5a3e', B2 = '#5a4230', face = '#e4d4b4';
  return {
    cy: 0.22, shadow: [0.4, 0.4],
    body: geo((k) => {
      k.ball(0.16, B, 0, 0, 0, { sy: 1.32, sz: 0.95, color2: '#9a7a56' });
      k.ball(0.12, '#d8c49e', 0, -0.03, 0.075, { sy: 1.25, sz: 0.55 });
      for (const [x, y] of [[-0.04, 0.02], [0.04, -0.03], [-0.02, -0.09], [0.05, -0.13], [0.0, 0.07]]) k.box(0.022, 0.012, 0.01, B2, x, y, 0.135);
      k.box(0.13, 0.03, 0.12, B2, 0, -0.18, -0.12, { rx: -0.5 });
    }),
    head: { at: [0, 0.2, 0.0], geo: geo((k) => {
      k.ball(0.135, B, 0, 0.04, 0, { sx: 1.18, sy: 0.92 });
      for (const s of [-1, 1]) {
        k.ball(0.065, face, s * 0.056, 0.035, 0.085, { sz: 0.42 });
        k.cone(0.035, 0.1, B2, s * 0.09, 0.15, 0.0, { rz: -s * 0.35 });
      }
      k.cone(0.018, 0.05, '#c8a040', 0, 0.01, 0.13, { rx: Math.PI * 0.75 });
    }) },
    eyes: geo((k) => {
      for (const s of [-1, 1]) {
        k.ball(0.03, '#f0b830', s * 0.056, 0.045, 0.11, { sz: 0.45 });
        k.ball(0.016, '#0a0806', s * 0.056, 0.045, 0.122, { sz: 0.5 });
      }
    }),
    wings: { at: [[-0.15, 0.1, -0.01], [0.15, 0.1, -0.01]], geos: [-1, 1].map((s) => geo((k) => {
      k.ball(0.15, B2, s * 0.01, -0.12, -0.01, { sx: 0.22, sy: 1.0, sz: 0.72, color2: B });
    })) },
    legs: { at: [[-0.05, -0.2, 0.03], [0.05, -0.2, 0.03]], geo: geo((k) => {
      k.box(0.05, 0.02, 0.06, '#c8a040', 0, -0.01, 0.01);
    }) },
  };
}

// 把造型組成可以動的骨架：root 放在地上、轉向；body 在身體中心，趴下、坐下、翻肚都轉它
function buildRig(m, shadowMat, scale) {
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.y = m.cy;
  root.add(body);
  const mesh = (g, parent, mat = LIT) => { const o = new THREE.Mesh(g, mat); parent.add(o); return o; };
  const pivot = (at) => {
    const p = new THREE.Group();
    p.position.set(...at);
    p.rotation.order = 'YXZ';
    body.add(p);
    return p;
  };
  const main = mesh(m.body, body);
  const head = pivot(m.head.at);
  const headMesh = mesh(m.head.geo, head);
  const eyes = m.eyes ? mesh(m.eyes, head, GLOW) : null;
  const legs = m.legs.at.map((at) => { const p = pivot(at); mesh(m.legs.geo, p); return p; });
  const tail = m.tail ? pivot(m.tail.at) : null;
  if (tail) mesh(m.tail.geo, tail);
  const wings = m.wings ? m.wings.at.map((at, i) => { const p = pivot(at); mesh(m.wings.geos[i], p); return p; }) : null;
  const shadow = new THREE.Mesh(SHADOW_GEO, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.scale.set(m.shadow[0], m.shadow[1], 1);
  root.add(shadow);
  root.scale.setScalar(scale);
  root.traverse((o) => o.layers.set(ANIMAL_LAYER));
  return { root, body, head, legs, tail, wings, eyes, main, shadow, hits: [main, headMesh], cy: m.cy, headAt: head.position.clone() };
}

// ---------- 動作 ----------
// 每幀從頭擺一次姿勢：走路的擺腿 + 正在做的事（吃草、啄地、坐、睡）按權重疊上去

function swing(r, a, amp, offs) {
  for (let i = 0; i < r.legs.length; i++) r.legs[i].rotation.set(Math.sin(a.phase + offs[i]) * amp * a.walk, 0, 0);
}

const POSES = {
  cow(r, a, W) {
    const t = a.time, s = Math.sin(a.phase), B = r.body, H = r.head;
    const graze = W('graze'), lie = W('lie'), chew = W('chew'), pet = W('petted');
    swing(r, a, 0.42, QUAD);
    B.position.y = r.cy + Math.abs(s) * 0.02 * a.walk - 0.5 * lie;
    B.rotation.set(0, 0, s * 0.02 * a.walk);
    // 趴下：前腳往後收、後腳往前收
    r.legs.forEach((L, i) => { L.rotation.x += ((i < 2 ? 1.5 : -1.5) - L.rotation.x) * lie; });
    // 被摸的時候把鼻子低下來湊過去
    H.rotation.x = 0.12 + graze * (1.0 + Math.sin(t * 5) * 0.06) + 0.25 * lie + pet * (0.6 + Math.sin(t * 3) * 0.08);
    H.rotation.y = a.look * (1 - graze);
    H.rotation.z = Math.sin(t * 3.2) * 0.05 * (chew + lie);   // 反芻，嘴巴左右磨
    r.tail.rotation.set(0.15, 0, Math.sin(t * 1.7 + a.seed) * 0.2 + Math.sin(t * 9) * 0.4 * pet);
  },

  chicken(r, a, W) {
    const t = a.time + a.seed, s = Math.sin(a.phase), B = r.body, H = r.head;
    const peck = W('peck'), look = W('look'), scratch = W('scratch'), pet = W('petted');
    swing(r, a, 0.75, BIPED);
    const pk = Math.max(0, Math.sin(t * 4.3)) ** 6 * peck;   // 啄下去很快，抬頭比較慢
    const hop = a.speed > 1.5 ? Math.abs(Math.sin(a.phase * 0.5)) * 0.08 : 0;
    B.position.y = r.cy + Math.abs(s) * 0.025 * a.walk + hop;
    B.rotation.set(0.12 * a.walk + 0.35 * pk + 0.2 * scratch, 0, 0);
    H.position.z = r.headAt.z + Math.sin(a.phase * 2) * 0.025 * a.walk;   // 走路時頭一伸一縮
    H.rotation.x = 1.1 * pk - 0.1 * look;
    H.rotation.y = a.look + Math.round(Math.sin(t * 1.1) * 2) * 0.35 * look;   // 一頓一頓地轉頭
    H.rotation.z = Math.sin(t * 3) * 0.3 * pet;
    if (scratch) r.legs.forEach((L, i) => { L.rotation.x += Math.max(0, Math.sin(t * 7 + i * Math.PI)) * 0.9 * scratch; });
    const fluff = 1 + Math.max(0, Math.sin(t * 9)) * 0.08 * pet;   // 被摸得蓬起來
    r.main.scale.set(fluff, fluff, 1);
  },

  duck(r, a, W) {
    const t = a.time + a.seed, s = Math.sin(a.phase), B = r.body, H = r.head;
    const peck = W('peck'), preen = W('preen'), pet = W('petted');
    swing(r, a, 0.6, BIPED);
    const dab = (0.5 + 0.5 * Math.sin(t * 2.2)) * peck;
    B.position.y = r.cy + Math.abs(s) * 0.015 * a.walk;
    // 搖搖擺擺地走；被摸的時候原地搖
    B.rotation.set(0.25 * dab, 0, Math.sin(a.phase) * 0.16 * a.walk + Math.sin(t * 9) * 0.14 * pet);
    H.rotation.x = 1.0 * dab - 0.35 * pet + preen * (0.5 + Math.sin(t * 7) * 0.08);
    H.rotation.y = a.look + 2.3 * preen;   // 回頭理羽毛
    H.rotation.z = 0;
  },

  dog(r, a, W) {
    const t = a.time + a.seed, s = Math.sin(a.phase), B = r.body, H = r.head;
    const sit = W('sit'), lie = W('lie'), sniff = W('sniff'), belly = W('petted'), hop = W('hop');
    const run = Math.min(1, Math.max(0, (a.speed - 1.6) / 1.2));
    swing(r, a, 0.55 + 0.35 * run, QUAD);
    B.position.y = r.cy + Math.abs(s) * (0.03 + 0.05 * run) * a.walk - 0.1 * sit - 0.22 * lie - 0.2 * belly
      + Math.abs(Math.sin(t * 9)) * 0.15 * hop;
    // 坐：後半身往下，前腳撐直。翻肚：側躺，四腳在空中亂踢
    B.rotation.set(-0.5 * sit, 0, 1.7 * belly);
    r.legs.forEach((L, i) => {
      const front = i < 2;
      L.rotation.x += (front ? 0.5 : -1.3) * sit;
      L.rotation.x += ((front ? -1.4 : -1.3) - L.rotation.x) * lie;
      L.rotation.x += Math.sin(t * 11 + i * 1.7) * 0.5 * belly;
    });
    H.rotation.x = 0.5 * sit + sniff * (0.6 + Math.sin(t * 10) * 0.06) + 0.2 * lie;
    H.rotation.y = a.look;
    H.rotation.z = Math.sin(t * 2) * 0.15 * a.happy;
    r.tail.rotation.set(-0.2, 0, Math.sin(t * (9 + 9 * a.happy)) * (0.3 + 0.5 * a.happy));
  },

  // 站起來：身體立直、頭擺正、前腳收在肚子前面。吃東西是坐著用前腳捧著啃
  marmot(r, a, W) {
    const t = a.time + a.seed, s = Math.sin(a.phase), B = r.body, H = r.head;
    const stand = W('stand'), eat = W('eat'), dig = W('dig'), groom = W('groom'), pet = W('petted');
    const up = Math.min(1, stand + eat * 0.8 + groom * 0.8);
    swing(r, a, 0.75, QUAD);
    B.position.set(0, r.cy + Math.abs(s) * 0.02 * a.walk + up * 0.13 + pet * 0.02, -0.1 * up);
    // 翻肚：側滾成仰躺，四隻腳在空中划
    B.rotation.set(-1.3 * up + 0.4 * dig, 0, Math.sin(a.phase) * 0.14 * a.walk + 2.7 * pet);
    r.legs.forEach((L, i) => {
      const front = i < 2;
      L.rotation.x += (front ? 0.85 : 1.3) * up;
      if (front) {
        L.rotation.x += -0.9 * eat + Math.sin(t * 6) * 0.15 * eat + Math.sin(t * 9 + i) * 0.4 * groom;
        L.rotation.x += Math.sin(t * 17 + i * Math.PI) * 0.9 * dig;
      }
      L.rotation.x += Math.sin(t * 10 + i * 1.9) * 0.6 * pet;
    });
    H.rotation.x = 1.15 * up - 0.25 * stand + 0.5 * dig + Math.max(0, Math.sin(t * 7)) * 0.12 * eat + 0.35 * groom;
    H.rotation.y = a.look + Math.round(Math.sin(t * 0.9) * 1.5) * 0.3 * stand;   // 站崗時一頓一頓地東張西望
    H.rotation.z = Math.sin(t * 2) * 0.2 * pet;
    r.tail.rotation.set(0.2 * up, Math.sin(t * 3) * 0.3 * (a.walk + pet), 0);
  },

  // 停著：半睡半醒、頭跟著人轉。飛：身體往前倒平，翅膀張開上下拍，起飛和降落時拍得快
  owl(r, a, W) {
    const t = a.time + a.seed, B = r.body, H = r.head, f = a.flyW, doze = W('doze'), preen = W('preen');
    const flap = Math.sin(t * 15) * (0.35 + 0.5 * a.flap);
    B.position.y = r.cy + Math.sin(t * 1.3) * 0.004;
    B.rotation.set(1.1 * f, 0, 0);
    B.scale.set(1 + 0.06 * doze, 1 - 0.04 * doze, 1);
    r.wings.forEach((w, i) => {
      const sgn = i ? 1 : -1;
      w.rotation.set(0, 0, sgn * (f * (1.35 + flap) + 0.25 * preen * i));
    });
    for (const L of r.legs) L.rotation.x = 1.0 * f;
    H.rotation.x = -1.0 * f + 0.25 * doze + 0.55 * preen;
    H.rotation.y = a.look * (1 - f) + 2.2 * preen;
    H.rotation.z = Math.sin(t * 0.6) * 0.3 * a.tilt;   // 歪頭
    const blink = (t % 5.1) < 0.14;
    r.eyes.scale.y = blink ? 0.1 : 1 - 0.82 * doze;
  },

  cat(r, a, W) {
    const t = a.time + a.seed, B = r.body, H = r.head;
    const sleep = W('sleep'), groom = W('groom'), pet = W('petted');
    const sit = Math.min(1, W('sit') + pet + groom);
    swing(r, a, 0.5, QUAD);
    B.position.y = r.cy - 0.06 * sit - 0.12 * sleep;
    B.rotation.set(-0.6 * sit, 0, 0);
    // 睡覺：四腳收在身體底下，頭擱著，尾巴繞到旁邊
    r.legs.forEach((L, i) => {
      const front = i < 2;
      L.rotation.x += (front ? 0.6 : -1.4) * sit;
      L.rotation.x += ((front ? 1.5 : -1.5) - L.rotation.x) * sleep;
    });
    H.position.y = r.headAt.y - 0.05 * sleep;
    H.rotation.x = 0.6 * sit + 0.5 * sleep + groom * (0.7 + Math.sin(t * 7) * 0.1) - 0.2 * pet;
    H.rotation.y = a.look * (1 - sleep) + 0.8 * sleep;
    H.rotation.z = Math.sin(t * 2.4) * 0.35 * pet + 0.4 * groom;   // 被摸時用頭蹭
    const blink = t % 4.3 < 0.13;
    r.eyes.scale.y = sleep > 0.5 || blink ? 0.12 : 1;
    const rest = 1 - a.walk;
    r.tail.rotation.set(-0.5 - 0.8 * rest - 0.25 * sleep, 1.6 * sleep, Math.sin(t * 1.5) * 0.15 + Math.sin(t * 14) * 0.06 * pet);
  },
};

// ---------- 物種 ----------
// L：行程每段幾秒。acts：停下來做的事和權重。stand：被摸時人站多遠（造型尺寸）。
// hear：叫聲傳多遠。bump：人走太近會讓開的距離。high：摸的時候手往上伸（乳牛）

const SPECIES = {
  cow: { name: '乳牛', pose: 'cow', L: 26, walkV: 0.45, gait: 9, turn: 1.5, acts: [['graze', 5], ['chew', 2], ['lie', 2]],
    stand: 1.67, high: true, petTime: 3.2, hear: 24, vol: 0.4, voice: 'moo', every: [25, 50], lookR: 4.5, lookMax: 0.7, solid: true },
  chicken: { name: '母雞', pose: 'chicken', L: 7, walkV: 0.7, gait: 40, turn: 8, acts: [['peck', 5], ['look', 3], ['scratch', 2]],
    stand: 0.62, petTime: 2.4, hear: 10, vol: 0.13, voice: 'cluck', every: [6, 16], lookR: 2.5, lookMax: 1, bump: 0.8, fleeV: 2.4, skittish: true },
  duck: { name: '鴨子', pose: 'duck', L: 9, walkV: 0.55, gait: 30, turn: 6, acts: [['peck', 3], ['preen', 2], ['idle', 2]],
    stand: 0.62, petTime: 2.4, hear: 12, vol: 0.2, voice: 'quack', every: [8, 20], lookR: 2.5, lookMax: 0.9, bump: 0.75, fleeV: 1.8, skittish: true },
  duckling: { name: '小鴨', pose: 'duck', L: 9, walkV: 0.55, gait: 30, turn: 8, acts: [['peck', 3], ['idle', 2]],
    stand: 0.95, petTime: 2.2, hear: 8, vol: 0.09, voice: 'peep', every: [3, 9], lookR: 2, lookMax: 0.9, bump: 1.2, fleeV: 1.8, skittish: true },
  dog: { name: '小狗', pose: 'dog', L: 11, walkV: 1.1, runV: 3.2, runChance: 0.3, gait: 14, turn: 7, acts: [['sniff', 3], ['sit', 3], ['zoom', 2], ['lie', 1]],
    stand: 0.8, petTime: 3, hear: 18, vol: 0.28, voice: 'bark', every: [30, 70], lookR: 6, lookMax: 0.9, greets: true },
  marmot: { name: '土撥鼠', pose: 'marmot', L: 13, walkV: 0.5, gait: 26, turn: 6, acts: [['stand', 4], ['eat', 3], ['dig', 2], ['groom', 1]],
    stand: 0.6, petTime: 3.2, hear: 14, vol: 0.2, voice: 'chirp', every: [20, 50], lookR: 4, lookMax: 0.9, bump: 1.3, fleeV: 2.6, skittish: true, burrow: true },
  owl: { name: '貓頭鷹', pose: 'owl', L: 170, turn: 4, acts: [['doze', 4], ['look', 3], ['preen', 1]],
    hear: 26, vol: 0.32, voice: 'hoot', every: [35, 80], lookR: 11, lookMax: 2.6, noPet: true },
  cat: { name: '黑貓', pose: 'cat', L: 45, walkV: 0.55, gait: 16, turn: 5, acts: [['sleep', 5], ['sit', 2], ['groom', 2]],
    stand: 0.68, petTime: 3.4, hear: 9, vol: 0.2, voice: 'meow', every: [40, 90], lookR: 3, lookMax: 0.8, bump: 0.85, fleeV: 2.2, aloof: true },
};
const NO_LOOK = new Set(['graze', 'peck', 'preen', 'sleep', 'groom', 'sniff', 'scratch', 'petted', 'dig']);

class Animal {
  constructor(set, o) {
    this.set = set;
    this.world = set.world;
    this.index = o.index;
    this.spec = SPECIES[o.species];
    this.seed = o.seed;
    this.room = o.room;
    this.area = o.area;
    this.home = o.home;
    this.leader = o.leader || null;
    this.back = o.back || 0;
    this.side = o.side || 0;
    this.pitch = o.pitch || 1;
    this.scale = o.scale || 1;
    this.phase0 = hash(o.seed, 0, 99);
    this.rig = buildRig(o.model, set.shadowMat, this.scale);
    if (!this.spec.noPet) for (const m of this.rig.hits) {
      m.userData.animal = this;
      this.world.raycastTargets.push(m);
    }
    this.room.group.add(this.rig.root);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.walk = 0;
    this.phase = 0;
    this.time = 0;
    this.act = null;
    this.actW = 0;
    this.look = 0;
    this.happy = 0;
    this.react = null;
    this.mode = 'sched';     // sched 照行程、return 演完反應走回行程
    this.placed = false;
    this.plans = new Map();
    this.route = null;
    this.routeT = 0;
    this.nextVoice = performance.now() / 1000 + this.spec.every[0] * Math.random();
    this.nextGreet = 0;
    this.nextGreetV = 0;     // 迎接訪客另外算
    this.sink = 0;           // 土撥鼠鑽進洞裡：0 在地面上，1 整隻在洞裡
  }

  get name() { return this.spec.name; }
  get shown() { return this.room.group.visible; }

  allowed(x, z) {
    return this.world.walkable(x, z) && this.area(x, z);
  }

  // 直線上每隔一小段都走得到
  clear(x, z) {
    const n = Math.max(2, Math.ceil(Math.hypot(x - this.pos.x, z - this.pos.z) / 0.25));
    for (let i = 1; i <= n; i++) if (!this.allowed(this.pos.x + ((x - this.pos.x) * i) / n, this.pos.z + ((z - this.pos.z) * i) / n)) return false;
    return true;
  }

  // ---- 行程 ----

  // 第 k 段結束時要走到的點
  spot(k) {
    const h = this.home;
    if (h.spots) return h.spots[Math.floor(hash(this.seed, k, 1) * h.spots.length)];
    for (let j = 0; j < 16; j++) {
      const a = hash(this.seed, k, j * 2 + 10) * Math.PI * 2, d = h.r * Math.sqrt(hash(this.seed, k, j * 2 + 11));
      const x = h.x + Math.sin(a) * d, z = h.z + Math.cos(a) * d;
      if (this.allowed(x, z)) return { x, z };
    }
    return { x: h.x, z: h.z };
  }

  seg(now) {
    const u = now / this.spec.L + this.phase0, k = Math.floor(u);
    return { k, tau: (u - k) * this.spec.L };
  }

  // 第 k 段：先沿著尋路的路線走到下一個點，剩下的時間停在那裡做事
  plan(k) {
    let P = this.plans.get(k);
    if (P) return P;
    if (this.plans.size > 5) for (const key of this.plans.keys()) if (Math.abs(key - k) > 2) this.plans.delete(key);
    const sp = this.spec, a = this.spot(k), b = this.spot(k + 1);
    const path = this.world.findPath(a.x, a.z, b.x, b.z);
    const pts = [a, ...(path && path.length ? path : [b])], cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const D = cum[cum.length - 1];
    let v = sp.runV && hash(this.seed, k, 8) < sp.runChance ? sp.runV : sp.walkV * (0.85 + 0.3 * hash(this.seed, k, 7));
    const maxT = sp.L * 0.7;
    if (D / v > maxT) v = D / maxT;
    const n = pts.length, last = pts[n - 1], prev = pts[n - 2];
    const h = D > 0.01 ? Math.atan2(last.x - prev.x, last.z - prev.z) : hash(this.seed, k, 6) * Math.PI * 2;
    P = { pts, cum, D, v, T: D / v, h, act: pickAct(sp.acts, hash(this.seed, k, 9)), zoom: null };
    // 狗暴衝：繞著停下來的點跑兩圈，跑的範圍都要走得到，不然就改成坐著
    if (P.act === 'zoom') {
      const r = 1.3 + hash(this.seed, k, 5) * 0.6, a0 = hash(this.seed, k, 4) * Math.PI * 2;
      const z = { r, a0, dir: hash(this.seed, k, 3) < 0.5 ? 1 : -1, cx: last.x - Math.sin(a0) * r, cz: last.z - Math.cos(a0) * r, dur: 5 };
      let ok = true;
      for (let i = 0; i < 12 && ok; i++) {
        const th = a0 + (i / 12) * Math.PI * 2;
        ok = this.allowed(z.cx + Math.sin(th) * r, z.cz + Math.cos(th) * r);
      }
      if (ok) P.zoom = z;
      else P.act = 'sit';
    }
    this.plans.set(k, P);
    return P;
  }

  // 現在照行程該在哪裡、面向哪、在做什麼
  sched(now) {
    if (this.leader) return this.follow(now);
    const sp = this.spec, { tau, k } = this.seg(now), P = this.plan(k);
    if (tau < P.T) {
      const q = along(P, tau * P.v);
      return { x: q.x, z: q.z, h: q.h, act: null, v: P.v };
    }
    const e = P.pts[P.pts.length - 1];
    const doing = tau > P.T + 0.4 && tau < sp.L - 1.0;
    if (P.zoom && doing) {
      const z = P.zoom, p = (tau - P.T - 0.4) / z.dur;
      if (p < 1) {
        const th = z.a0 + z.dir * Math.PI * 4 * smooth(p);
        return { x: z.cx + Math.sin(th) * z.r, z: z.cz + Math.cos(th) * z.r, h: P.h, act: null, v: sp.runV };
      }
      return { x: e.x, z: e.z, h: P.h, act: 'sit', v: 0 };
    }
    return { x: e.x, z: e.z, h: P.h, act: doing ? P.act : null, v: 0 };
  }

  // 帶頭的走過的路線上，往回 back 公尺的位置。小鴨跟在媽媽後面排成一列就靠這個
  trail(now, back) {
    const { k, tau } = this.seg(now);
    let P = this.plan(k), s = Math.min(tau, P.T) * P.v - back;
    if (s < 0) {
      P = this.plan(k - 1);
      s = Math.max(0, P.D + s);
    }
    return along(P, s);
  }

  follow(now) {
    const L = this.leader, q = L.trail(now, this.back), S = L.sched(now);
    const act = S.act ? pickAct(this.spec.acts, hash(this.seed, L.seg(now).k, 9)) : null;
    return { x: q.x + Math.cos(q.h) * this.side, z: q.z - Math.sin(q.h) * this.side, h: q.h, act, v: Math.max(S.v, L.spec.walkV) };
  }

  // ---- 自己畫面上的反應 ----

  step(tx, tz, v, dt, stop) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    const s = Math.min(v * dt, d - stop), nx = this.pos.x + (dx / d) * s, nz = this.pos.z + (dz / d) * s;
    if (this.allowed(nx, nz) || !this.allowed(this.pos.x, this.pos.z)) { this.pos.x = nx; this.pos.z = nz; }
    else if (this.allowed(nx, this.pos.z)) this.pos.x = nx;
    else if (this.allowed(this.pos.x, nz)) this.pos.z = nz;
    return false;
  }

  // 繞過障礙走到 (tx, tz)，離目標 stop 公尺內算到了。目標會動（人、行程），每隔一下重算路線
  goVia(tx, tz, v, dt, stop) {
    const r = this.route;
    this.routeT -= dt;
    if (!r || this.routeT <= 0 || Math.hypot(r.tx - tx, r.tz - tz) > 0.8) {
      const path = this.world.findPath(this.pos.x, this.pos.z, tx, tz);
      this.route = { pts: path && path.length ? path : [{ x: tx, z: tz }], tx, tz };
      this.routeT = 1.5;
    }
    const pts = this.route.pts, last = pts.length === 1;
    if (!this.step(pts[0].x, pts[0].z, v, dt, last ? stop : 0.05)) return false;
    if (last) return true;
    pts.shift();
    return false;
  }

  get calm() {
    return !this.react || (this.react.kind !== 'petted' && this.react.kind !== 'wait');
  }

  // 往遠離 (fx, fz) 的方向跑開，正後方走不了就往兩側偏
  flee(fx, fz, dist, v) {
    if (!this.calm) return false;
    if (this.spec.burrow) return this.hide();
    const base = Math.atan2(this.pos.x - fx, this.pos.z - fz);
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
      const a = base + off + (Math.random() - 0.5) * 0.4, d = dist * (0.8 + Math.random() * 0.4);
      const x = this.pos.x + Math.sin(a) * d, z = this.pos.z + Math.cos(a) * d;
      if (this.clear(x, z)) {
        this.react = { kind: 'flee', t: 0, x, z, v };
        this.route = null;
        return true;
      }
    }
    return false;
  }

  // 土撥鼠被嚇到：吹一聲哨，跑回洞口鑽進去，躲一陣子探頭看看，沒事才出來
  hide() {
    if (this.react?.kind === 'hide') return false;
    this.react = { kind: 'hide', t: 0, stage: 'run', stay: 5 + Math.random() * 5 };
    this.route = null;
    this.say('whistle', 1.3);
    return true;
  }

  // 有人跳起來嚇到牠
  startle(x, z) {
    const sp = this.spec;
    if (!this.calm) return;
    if (sp.burrow) this.hide();
    else if (sp.skittish || sp.aloof) {
      if (this.flee(x, z, sp.aloof ? 3 : 2.6, sp.fleeV)) this.say(sp.voice);
    } else if (sp.greets) {
      if (this.react?.kind !== 'greet') this.react = { kind: 'hop', t: 0, from: { x, z } };
      this.say('bark');
    } else if (Math.random() < 0.3) this.say(sp.voice);
  }

  // 有人走過來要摸：停下來轉向那個人，等到對方差不多走得到的時間
  waitFor(player) {
    const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.react = { kind: 'wait', t: 0, limit: 3 + d / 2 };
  }

  // 人走到了，牠還在伸手摸得到的地方
  within(player) {
    return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < this.spec.stand * this.scale + 0.6;
  }

  pettedBy(from) {
    this.react = { kind: 'petted', t: 0, from: { x: from.x, z: from.z } };
    const sp = this.spec;
    if (sp.aloof) {
      this.say('purr');
      setTimeout(() => this.say('meow'), 900);
    } else this.say(sp.voice, 1.2);
  }

  // 要摸這隻時人站的位置：從牠往人的方向退 stand 公尺
  planPet(player) {
    let dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = Math.sin(this.heading); dz = Math.cos(this.heading); d = 1; }
    const s = this.spec.stand * this.scale;
    const st = this.world.findWalkable(this.pos.x + (dx / d) * s, this.pos.z + (dz / d) * s, player.pos.x, player.pos.z) || { x: player.pos.x, z: player.pos.z };
    const nx = st.x - this.pos.x, nz = st.z - this.pos.z, nl = Math.hypot(nx, nz) || 1;
    return { kind: 'pet', a: this, stand: st, n: { x: nx / nl, z: nz / nl } };
  }

  say(kind, loud = 1) {
    this.set.say(this, kind, loud);
  }

  runReact(dt, env) {
    const r = this.react, sp = this.spec, P = env.player;
    r.t += dt;
    r.face = null;
    r.act = null;
    switch (r.kind) {
      case 'wait':
        r.face = P.pos;
        return r.t < r.limit && (r.t < 0.3 || P.pending?.a === this || P.focus?.a === this);
      case 'petted':
        r.face = r.from;
        r.act = 'petted';
        return r.t < sp.petTime;
      case 'flee':
        return !this.goVia(r.x, r.z, r.v, dt, 0.1) && r.t < 5;
      case 'hide': {
        const b = this.home.burrow;
        if (r.stage === 'run') {
          if (this.goVia(b.x, b.z, sp.fleeV, dt, 0.05) || r.t > 6) { r.stage = 'in'; r.t0 = r.t; }
          return true;
        }
        const u = r.t - r.t0;
        this.pos.x = b.x;
        this.pos.z = b.z;
        if (u < r.stay) r.sink = 1;
        else if (u < r.stay + 3) { r.sink = 0.55; r.act = 'stand'; r.face = P.pos; }   // 探頭出來看看
        else r.sink = 0;
        return u < r.stay + 3.6;
      }
      case 'hop':
        r.face = r.from;
        r.act = 'hop';
        return r.t < 1.2;
      case 'greet': {
        // 狗看到人就跑過來，坐在旁邊；人走開就跟上去，過一陣子才回去玩。迎接訪客的時間短一點
        const who = r.who || P, d = Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z);
        if (r.t > (r.who ? 10 : 18) || d > 14 || !(r.who ? who.meadow : env.inMeadow)) return false;
        r.face = who.pos;
        if (d > (r.near ? 2.4 : 1.3)) {
          r.near = false;
          this.goVia(who.pos.x, who.pos.z, d > 4 ? sp.runV : sp.walkV * 1.5, dt, 1.1);
        } else {
          r.near = true;
          r.act = who.speed > 0.1 ? null : 'sit';
        }
        return true;
      }
    }
    return false;
  }

  update(dt, now, env) {
    if (!this.shown) {
      this.placed = false;
      this.react = null;
      this.mode = 'sched';
      return;
    }
    const sp = this.spec, P = env.player, clock = env.clock;
    this.time += dt;
    const S = this.sched(now);
    if (!this.placed) {
      this.placed = true;
      this.pos.set(S.x, 0, S.z);
      this.heading = S.h;
    }
    const ox = this.pos.x, oz = this.pos.z;
    const pd = Math.hypot(P.pos.x - ox, P.pos.z - oz);

    // 自己的反應：狗跑來打招呼、人走太近就讓開
    if (!this.react) {
      if (sp.greets && env.inMeadow && clock > this.nextGreet && pd < 8) {
        this.react = { kind: 'greet', t: 0 };
        this.route = null;
        this.nextGreet = clock + 60 + Math.random() * 30;
        this.say('bark');
      } else if (sp.bump && pd < sp.bump * this.scale && P.speed > 0.4 && P.pending?.a !== this) {
        this.flee(P.pos.x, P.pos.z, sp.aloof ? 1.6 : 1.8, sp.fleeV * 0.7);
      } else if (sp.greets && clock > this.nextGreetV) {
        const v = env.walkers.find((w) => Math.hypot(w.pos.x - ox, w.pos.z - oz) < 8);
        if (v) {
          this.react = { kind: 'greet', t: 0, who: v };
          this.route = null;
          this.nextGreetV = clock + 45 + Math.random() * 30;
          this.say('bark');
          v.greetedBy();
        }
      } else if (sp.bump) {
        const v = env.walkers.find((w) => w.speed > 0.4 && Math.hypot(w.pos.x - ox, w.pos.z - oz) < sp.bump * this.scale);
        if (v) this.flee(v.pos.x, v.pos.z, sp.aloof ? 1.6 : 1.8, sp.fleeV * 0.7);
      }
    }

    let want = null, face = null;
    if (this.react && !this.runReact(dt, env)) {
      this.react = null;
      this.mode = 'return';
      this.route = null;
    }
    if (this.react) {
      want = this.react.act;
      face = this.react.face;
    } else if (this.mode === 'return') {
      if (this.goVia(S.x, S.z, Math.max(sp.walkV * 1.6, S.v * 1.3), dt, 0.08)) this.mode = 'sched';
    } else {
      this.pos.x = S.x;
      this.pos.z = S.z;
      want = S.act;
    }

    // 轉向：走路時面向前進方向，停下來時面向要看的人，或行程上的方向
    const mx = this.pos.x - ox, mz = this.pos.z - oz;
    this.speed = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    let wantH = null;
    if (this.speed > 0.05) wantH = Math.atan2(mx, mz);
    else if (face) wantH = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
    else if (!this.react && this.mode === 'sched') wantH = S.h;
    if (wantH !== null) this.heading += wrapAngle(wantH - this.heading) * Math.min(1, dt * sp.turn);

    this.walk += ((this.speed > 0.05 ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * sp.gait / this.scale;
    // 換動作時先把前一個收回去，再做下一個
    if (want !== this.act) {
      this.actW -= dt * 2.5;
      if (this.actW <= 0) { this.actW = 0; this.act = want; }
    } else this.actW = Math.min(1, this.actW + dt * 1.5);
    const k = this.react?.kind;
    this.happy += ((k === 'petted' || k === 'greet' || k === 'hop' ? 1 : 0) - this.happy) * Math.min(1, dt * 3);
    // 人靠近時轉頭看
    let look = 0;
    if (pd < sp.lookR && this.walk < 0.5 && !NO_LOOK.has(this.act)) {
      look = Math.max(-sp.lookMax, Math.min(sp.lookMax, wrapAngle(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.heading)));
    }
    this.look += (look - this.look) * Math.min(1, dt * 3);

    this.sink += ((this.react?.sink ?? 0) - this.sink) * Math.min(1, dt * 7);
    const root = this.rig.root;
    root.position.set(this.pos.x, this.world.groundY(this.pos.x, this.pos.z) - this.sink * 0.5 * this.scale, this.pos.z);
    root.rotation.y = this.heading;
    POSES[sp.pose](this.rig, this, (n) => (this.act === n ? this.actW : 0));

    // 平常偶爾叫一聲，睡著的不叫
    if (clock > this.nextVoice) {
      this.nextVoice = clock + sp.every[0] + Math.random() * (sp.every[1] - sp.every[0]);
      if (this.act !== 'sleep' && !this.react) this.say(sp.voice, 0.7);
    }
  }
}

// ---------- 貓頭鷹 ----------
// 不在地上走：停在幾個高處，每一段時間由雜湊決定停哪裡，換地方就飛過去。大部分時間停在大樹上半睡半醒。
// 人走近時頭跟著人轉，可以轉到背後；有人在附近跳起來就飛到別處，下一段時間再照行程回來
class Owl extends Animal {
  constructor(set, o) {
    super(set, o);
    this.perches = o.perches;
    this.at = -1;
    this.fly = null;
    this.away = null;
    this.y = 0;
    this.flyW = 0;
    this.flap = 0;
    this.tilt = 0;
    this.lookGoal = 0;
    this.rig.shadow.visible = false;   // 停在高處，地上不畫影子
  }

  get perched() { return !this.fly && this.at >= 0; }

  perchFor(now) {
    const k = Math.floor(now / this.spec.L + this.phase0);
    let sum = 0;
    for (const p of this.perches) sum += p.w;
    let u = hash(this.seed, k, 1) * sum;
    for (let i = 0; i < this.perches.length; i++) if ((u -= this.perches[i].w) < 0) return { i, k };
    return { i: 0, k };
  }

  takeOff(to) {
    const a = this.at >= 0 ? this.perches[this.at] : { x: this.pos.x, y: this.y, z: this.pos.z }, b = this.perches[to];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    this.fly = { a, b, to, t: 0, T: 2.2 + d / 5.5, arc: 1.5 + d * 0.06 };
    this.at = -1;
  }

  startle(x, z) {
    if (this.fly || Math.hypot(this.pos.x - x, this.pos.z - z) > 6) return;
    const n = this.perches.length, to = (this.at + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.away = this.perchFor(Date.now() / 1000).k;
    this.takeOff(to);
    this.say('hoot', 0.6);
  }

  update(dt, now, env) {
    if (!this.shown) {
      this.placed = false;
      this.fly = null;
      return;
    }
    const sp = this.spec, P = env.player, clock = env.clock, plan = this.perchFor(now);
    this.time += dt;
    if (!this.placed) {
      this.placed = true;
      this.at = plan.i;
      this.away = null;
    }
    if (this.away !== null && this.away !== plan.k) this.away = null;
    if (!this.fly && this.away === null && this.at !== plan.i) this.takeOff(plan.i);

    let x, y, z, h;
    if (this.fly) {
      const F = this.fly, u = Math.min(1, (F.t += dt) / F.T), e = smooth(u);
      x = F.a.x + (F.b.x - F.a.x) * e;
      z = F.a.z + (F.b.z - F.a.z) * e;
      y = F.a.y + (F.b.y - F.a.y) * e + Math.sin(u * Math.PI) * F.arc;
      h = Math.atan2(F.b.x - F.a.x, F.b.z - F.a.z);
      this.flap = Math.max(1 - u / 0.25, (u - 0.8) / 0.2, 0.15);
      if (u >= 1) {
        this.at = F.to;
        this.fly = null;
      }
    } else {
      const p = this.perches[this.at];
      x = p.x; y = p.y; z = p.z; h = p.h;
    }
    this.pos.set(x, 0, z);
    this.y = y;
    const flying = this.fly && this.fly.t > 0.15 && this.fly.t < this.fly.T - 0.25;
    this.flyW += ((flying ? 1 : 0) - this.flyW) * Math.min(1, dt * 6);
    this.heading += wrapAngle(h - this.heading) * Math.min(1, dt * (this.fly ? 6 : sp.turn));

    // 停著的時候做什麼：每十二秒換一次；有人在附近就醒著
    const pd = Math.hypot(P.pos.x - x, P.pos.z - z);
    let want = this.fly ? null : pickAct(sp.acts, hash(this.seed, Math.floor(now / 12), 3));
    if (want === 'doze' && pd < 7) want = 'look';
    if (want !== this.act) {
      this.actW -= dt * 2;
      if (this.actW <= 0) { this.actW = 0; this.act = want; }
    } else this.actW = Math.min(1, this.actW + dt * 1.2);

    // 頭一頓一頓地轉向人，轉到背後也可以
    if (!this.fly && pd < sp.lookR && this.act !== 'doze' && this.act !== 'preen') {
      const g = Math.max(-sp.lookMax, Math.min(sp.lookMax, wrapAngle(Math.atan2(P.pos.x - x, P.pos.z - z) - this.heading)));
      if (Math.abs(g - this.lookGoal) > 0.3) this.lookGoal = g;
    } else if (this.act === 'look' && !this.fly) {
      this.lookGoal = Math.round(Math.sin(now * 0.37 + this.seed) * 2) * 0.6;
    } else this.lookGoal = 0;
    this.look += (this.lookGoal - this.look) * Math.min(1, dt * 9);
    this.tilt += ((this.act === 'look' || pd < 4 ? 1 : 0) - this.tilt) * Math.min(1, dt * 2);

    const root = this.rig.root;
    root.position.set(x, y, z);
    root.rotation.y = this.heading;
    POSES.owl(this.rig, this, (n) => (this.act === n ? this.actW : 0));

    if (clock > this.nextVoice) {
      this.nextVoice = clock + sp.every[0] + Math.random() * (sp.every[1] - sp.every[0]);
      if (this.act !== 'doze' && !this.fly) this.say(sp.voice, 0.8);
    }
  }
}

// 黑貓住哪一間：黑化，沒有就第二間室內房。家具那邊靠這個避開，同一間不再擺睡著的貓擺設
export function catRoomOf(rooms) {
  const r = rooms.find((x) => /nigredo/i.test(x.id)) || rooms.find((x) => x.type !== 'outdoor' && x.index > 0) || rooms[0];
  return r && r.type !== 'outdoor' ? r : null;
}

export function along(P, s) {
  const { pts, cum } = P;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], len = cum[i] - cum[i - 1];
  const f = len > 0 ? Math.min(1, Math.max(0, (s - cum[i - 1]) / len)) : 1;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, h: len > 0 ? Math.atan2(b.x - a.x, b.z - a.z) : P.h };
}

export class Animals {
  constructor({ world, shadowTex, player, camera, ambience }) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.ambience = ambience;
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    this.list = [];
    let seed = 101;
    const add = (o) => {
      const a = new Animal(this, { ...o, index: this.list.length, seed: seed++ });
      this.list.push(a);
      return a;
    };

    const out = world.outdoor;
    if (out) {
      // 草原：離後門 12 公尺以外，避開石階口的花叢，也不上山坡的小徑。家的位置用離後門的距離 rel 表示
      const room = world.rooms[world.rooms.length - 1];
      const field = (x, z) => out.door - z > 12 && out.inField(x, z);
      const home = (x, rel, r) => ({ x, z: out.door - rel, r });
      const base = { room, area: field };
      add({ ...base, species: 'cow', model: model('cow-h', () => cowModel(COWS.holstein)), home: home(-8, 26, 4.5), scale: 0.9 });
      add({ ...base, species: 'cow', model: model('cow-j', () => cowModel(COWS.jersey)), home: home(-3.5, 31, 4), scale: 0.9, pitch: 0.85 });
      ['white', 'brown', 'white', 'brown'].forEach((c, i) => {
        add({ ...base, species: 'chicken', model: model('hen-' + c, () => chickenModel(CHICKENS[c])), home: home(3, 15.5, 3), pitch: 0.9 + i * 0.08 });
      });
      // 白鴨媽媽帶三隻小鴨；綠頭鴨一對，母的跟在公的後面
      const mom = add({ ...base, species: 'duck', model: model('duck-white', () => duckModel(DUCKS.white)), home: home(1, 26, 6.5) });
      [0.5, 0.92, 1.34].forEach((back, i) => {
        add({ ...base, species: 'duckling', model: model('duckling', () => duckModel(DUCKS.duckling)), home: mom.home, leader: mom, back, side: (i - 1) * 0.08, scale: 0.55, pitch: 1 + i * 0.1 });
      });
      const drake = add({ ...base, species: 'duck', model: model('duck-drake', () => duckModel(DUCKS.drake)), home: home(10, 28, 3.5), pitch: 0.85 });
      add({ ...base, species: 'duck', model: model('duck-hen', () => duckModel(DUCKS.hen)), home: drake.home, leader: drake, back: 0.8, side: 0.1, pitch: 1.05 });
      add({ ...base, species: 'dog', model: model('dog', dogModel), home: home(0, 22, 9) });

      // 土撥鼠住在左邊山腳，各有一個洞，在洞口附近幾公尺內活動
      const burrows = [[-21.5, 13.5], [-25, 21], [-23, 30.5]].map(([x, rel]) => world.findWalkable(x, out.door - rel, -10, out.door - 20)).filter(Boolean);
      burrows.forEach((b, i) => {
        const area = (x, z) => Math.hypot(x - b.x, z - b.z) < 4.2;
        add({ room, area, species: 'marmot', model: model('marmot', marmotModel), home: { x: b.x, z: b.z, r: 3.5, burrow: b }, scale: 1 + i * 0.08, pitch: 1.1 - i * 0.08 });
      });
      if (burrows.length) {
        const m = new THREE.Mesh(geo((k) => {
          for (const b of burrows) {
            const y = world.groundY(b.x, b.z);
            k.cyl(0.3, 0.46, 0.14, '#6e5034', b.x, y + 0.03, b.z, { color2: '#8a6a48' }, 10);
            k.cyl(0.19, 0.19, 0.02, '#1a120c', b.x, y + 0.1, b.z, {}, 10);
          }
        }), LIT);
        m.layers.set(ANIMAL_LAYER);
        room.group.add(m);
      }

      // 貓頭鷹最後加，前面動物的編號不變，多人同步摸摸才對得上
      if (out.perches?.length) {
        this.owl = new Owl(this, { room, area: () => false, species: 'owl', model: model('owl', owlModel), perches: out.perches, index: this.list.length, seed: seed++ });
        this.list.push(this.owl);
      }
    }

    // 黑貓住在黑化：在房間裡挑幾個走得到的角落，輪流去睡
    const catRoom = catRoomOf(world.rooms);
    if (catRoom) {
      const area = (x, z) => world.roomIndexAt(z) === catRoom.index && catRoom.inside(x, z, 0.4);
      const R = rng('cat'), spots = [];
      for (let i = 0; i < 300 && spots.length < 10; i++) {
        const x = (R() * 2 - 1) * catRoom.halfW, z = catRoom.zEnd + R() * (catRoom.zStart - catRoom.zEnd);
        if (area(x, z) && catRoom.inside(x, z, 0.7) && world.walkable(x, z)) spots.push({ x, z });
      }
      if (spots.length) add({ room: catRoom, area, species: 'cat', model: model('cat', catModel), home: { spots } });
    }
  }

  update(dt) {
    const P = this.player, out = this.world.outdoor;
    const env = {
      player: P,
      clock: performance.now() / 1000,
      inMeadow: !!out && P.room === this.world.rooms.length - 1 && out.door - P.pos.z > 11 && out.inField(P.pos.x, P.pos.z),
      walkers: this.visitors ? this.visitors.list.filter((v) => v.meadow) : [],
    };
    const now = Date.now() / 1000;
    for (const a of this.list) a.update(dt, now, env);
    // 狗跑過去，雞和鴨會被追著跑
    for (const d of this.list) {
      if (!d.spec.greets || !d.shown || d.speed < 2) continue;
      for (const a of this.list) {
        if (a.spec.skittish && !a.react && Math.hypot(a.pos.x - d.pos.x, a.pos.z - d.pos.z) < (a.spec.burrow ? 3 : 1.4)) {
          if (a.flee(d.pos.x, d.pos.z, 2.2, a.spec.fleeV) && Math.random() < 0.5) a.say(a.spec.voice);
        }
      }
    }
  }

  // 「摸摸」按鈕：附近最近的一隻
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const a of this.list) {
      if (!a.shown || a.spec.noPet || a.react?.kind === 'flee' || a.react?.kind === 'hide') continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (d < a.spec.stand * a.scale + 1 && d < bd) { bd = d; best = a; }
    }
    return best ? { a: best, d: bd } : null;
  }

  // 乳牛擋路：人不能穿過牠，但已經被牠擠到的人可以往外走
  blocks(x, z, ox, oz) {
    for (const a of this.list) {
      if (!a.spec.solid || !a.shown) continue;
      const fx = Math.sin(a.heading) * 0.45 * a.scale, fz = Math.cos(a.heading) * 0.45 * a.scale, r = 0.7 * a.scale;
      for (const s of [-1, 1]) {
        const cx = a.pos.x + fx * s, cz = a.pos.z + fz * s, d = Math.hypot(x - cx, z - cz);
        if (d < r && d < Math.hypot(ox - cx, oz - cz)) return true;
      }
    }
    return false;
  }

  startle(x, z) {
    for (const a of this.list) {
      if (a.shown && Math.hypot(a.pos.x - x, a.pos.z - z) < (a.spec.solid || a.spec.noPet ? 4.5 : a.spec.burrow ? 5 : 3.2)) a.startle(x, z);
    }
  }

  // 別的訪客摸了第 i 隻
  remotePet(i, other) {
    const a = Number.isInteger(i) ? this.list[i] : null;
    if (!a || !a.shown || !a.calm || Math.hypot(a.pos.x - other.pos.x, a.pos.z - other.pos.z) > 4) return null;
    a.pettedBy(other.pos);
    return a;
  }

  // 叫聲照離自己的距離變小聲，左右照鏡頭的方向分
  say(a, kind, loud = 1) {
    const amb = this.ambience;
    if (!amb || !a.shown) return;
    const P = this.player.pos, dx = a.pos.x - P.x, dz = a.pos.z - P.z, d = Math.hypot(dx, dz), hear = a.spec.hear;
    if (d > hear) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const pan = d > 0.3 ? Math.max(-0.8, Math.min(0.8, (dx * right.x + dz * right.z) / d)) : 0;
    amb.voice(kind, a.spec.vol * loud * (1 - d / hear) ** 1.5, pan, a.pitch);
  }
}
