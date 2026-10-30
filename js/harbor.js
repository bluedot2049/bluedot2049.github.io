// 海灣：草原右前方伸進海裡的木棧橋和繫在旁邊的小划船，海灣中間的小島和施了魔法的白塔，
// 還有偶爾從霧裡來、停在白塔下的黑袍訪客的小船。
// 座標跟 outdoor.js 一樣：rel 是離後門的距離，往海的方向為正，x 往右為正
import * as THREE from 'three';
import { Kit, newBucket, rng } from './props.js';

// 木棧橋：從草原右前方的邊上筆直伸出去，海灣正中間留給夕陽和白塔。盡頭是一塊方台。hw 是橋面半寬，ehw 是方台半寬
// 橋面寬到兩個人錯身也走得過；邊上只留六成的角色半徑，走到橋邊不會先被擋住
export const JETTY = { x: 9, r0: 32, r1: 55, end: 59, hw: 1.3, ehw: 2.2 };
export const onJetty = (x, rel, m = 0) => {
  const e = m > 0 ? m * 0.6 : m;
  return (Math.abs(x - JETTY.x) < JETTY.hw - e && rel > JETTY.r0 && rel < JETTY.r1 + 0.5) ||
    (Math.abs(x - JETTY.x) < JETTY.ehw - e && rel > JETTY.r1 && rel < JETTY.end - e);
};

const GOLD = '#d4a54a', POST = '#3e2c20';
const ROBE = '#1c1822', ROBE_HI = '#3a3046';

// 一串三角形做成幾何。正反兩面都放，材質只畫正面，從哪一側看都有面，不必管頂點的繞向
function tris(list) {
  const pos = [];
  for (const [a, b, c] of list) pos.push(...a, ...b, ...c, ...a, ...c, ...b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const quad = (out, a, b, c, d) => out.push([a, b, c], [a, c, d]);

// 船身：船頭朝 +z，橫切面是 V 字，兩頭收尖、往上翹，船頭翹得多。gunwale 在 y = 0，龍骨在 -depth
// deck 是船艙地板 { y: 離 gunwale 幾成船深, w: 佔那一圈船寬幾成 }；不給就不鋪。地板要高過水面，水面才不會從船艙裡透出來
export function hull(len, beam, depth, deck) {
  const N = 12, rings = [];
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1, z = (u * len) / 2;
    const w = (beam / 2) * Math.sqrt(Math.max(0, 1 - Math.abs(u) ** (u > 0 ? 2 : 3)));
    const top = depth * 0.3 * u * u * (u > 0 ? 1.5 : 1);
    rings.push([[-w, top, z], [-w * 0.75, -depth * 0.6, z], [0, -depth, z], [w * 0.75, -depth * 0.6, z], [w, top, z]]);
  }
  const f = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) quad(f, rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
  if (deck) {
    const y = -depth * deck.y;
    for (let i = 0; i < N; i++) {
      const w0 = rings[i][4][0] * deck.w, w1 = rings[i + 1][4][0] * deck.w, z0 = rings[i][0][2], z1 = rings[i + 1][0][2];
      quad(f, [-w0, y, z0], [w0, y, z0], [w1, y, z1], [-w1, y, z1]);
    }
  }
  return tris(f);
}

// 彎頸燈柱：一根木柱，頂上往 dir 那邊伸一截橫木，吊一盞燈
function lamp(k, x, y, z, dir, s = 1) {
  const ax = Math.sin(dir), az = Math.cos(dir);
  k.box(0.12 * s, 2.3 * s, 0.12 * s, POST, x, y + 1.15 * s, z);
  k.box(0.08 * s, 0.08 * s, 0.6 * s, POST, x + ax * 0.27 * s, y + 2.25 * s, z + az * 0.27 * s, { ry: dir });
  const lx = x + ax * 0.52 * s, lz = z + az * 0.52 * s, ly = y + 1.95 * s;
  k.box(0.22 * s, 0.05 * s, 0.22 * s, '#2a201a', lx, ly + 0.17 * s, lz);
  k.cyl(0.07 * s, 0.08 * s, 0.24 * s, '#ffd890', lx, ly, lz, { glow: true }, 6);
  k.light(lx, ly, lz, '#ffcf80', 0.45 * s);
}

// 黑袍的人：長袍、肩膀、尖尖的兜帽，看不到臉
function robed(k, x, y, z, s = 1) {
  k.cone(0.34 * s, 1.5 * s, ROBE, x, y + 0.75 * s, z, { color2: ROBE_HI });
  k.ball(0.21 * s, ROBE, x, y + 1.5 * s, z);
  k.cone(0.2 * s, 0.5 * s, ROBE, x, y + 1.78 * s, z - 0.05 * s, { rx: -0.25 });
}

// 小樹：樹幹加兩層錐，島上用
function pine(k, x, y, z, s) {
  k.cyl(0.12 * s, 0.18 * s, 1 * s, '#3e2c20', x, y + 0.5 * s, z, { ao: false }, 5);
  k.cone(1.1 * s, 2.2 * s, '#1f3a34', x, y + 1.9 * s, z, { color2: '#47664c', ao: false });
  k.cone(0.8 * s, 1.8 * s, '#1f3a34', x, y + 2.9 * s, z, { color2: '#5a7a52', ao: false });
}

// ---------- 黑袍訪客的船 ----------
// 一艘低低的小船，沒有帆也沒有槳，自己滑過水面。天鵝頸的船頭、捲起來的船尾，
// 船上只有一個黑袍的人站在船頭，提著一盞冷白的燈
const BOAT = { len: 8, beam: 2.2, depth: 1.2 };
function boat(k) {
  const { len: L, beam: B, depth: D } = BOAT, deck = -D * 0.12, o = { ao: false };
  k.add(hull(L, B, D, { y: 0.12, w: 0.9 }), '#2a2230', 0, 0, 0, { ...o, color2: '#54445a' });
  for (const sx of [-1, 1]) k.box(0.05, 0.07, L * 0.75, GOLD, sx * (B / 2 - 0.03), -0.03, 0, o);
  // 船頭的頸子從船尖往上長、往後彎，頭朝前，金色的喙往前下方
  const by = D * 0.45, r = 1, end = Math.PI * 0.55;
  k.torus(r, 0.14, end, '#2a2230', 0, by, L / 2 - r, { ...o, ry: -Math.PI / 2 });
  const hy = by + Math.sin(end) * r, hz = L / 2 - r + Math.cos(end) * r;
  k.ball(0.2, '#2a2230', 0, hy, hz + 0.05, o);
  k.cone(0.07, 0.34, GOLD, 0, hy - 0.07, hz + 0.3, { ...o, rx: Math.PI / 2 + 0.3 });
  k.torus(0.45, 0.1, Math.PI * 0.6, '#2a2230', 0, D * 0.3, -L / 2 + 0.45, { ...o, ry: Math.PI / 2 });
  robed(k, 0, deck, 1.6);
}
// 船頭那人提的燈另外做：靠岸時他把燈留在白塔的石階上，船開走時船上就沒有燈了
function boatLamp(k) {
  const deck = -BOAT.depth * 0.12;
  k.cyl(0.025, 0.025, 2.1, POST, 0.28, deck + 1.2, 1.85, { ao: false }, 4);
  k.cyl(0.08, 0.08, 0.2, '#e4ecff', 0.28, deck + 2.2, 1.85, { glow: true }, 6);
  k.light(0.28, deck + 2.2, 1.85, '#cfdcff', 1.6);
}
// 留在石階上的那盞燈
function keptLamp(k) {
  k.box(0.22, 0.04, 0.22, '#2a201a', 0, 0.02, 0);
  k.cyl(0.08, 0.08, 0.22, '#e4ecff', 0, 0.15, 0, { glow: true }, 6);
  k.box(0.24, 0.04, 0.24, '#2a201a', 0, 0.28, 0);
  k.cyl(0.012, 0.012, 0.14, '#2a201a', 0, 0.37, 0, {}, 4);
  k.light(0, 0.15, 0, '#cfdcff', 2.2);
}

// 船走的航線：從霧裡沿海灣左側進來，停在小島白塔下的石階邊，再從右側回到霧裡
// 第一個點是泊位，FAR 是霧裡最遠的那一點，船在那裡等，下一趟才再出現。整圈閉合，船永遠往前開
const ROUTE = [[3.5, 132.6], [11, 133.5], [18, 146], [22, 190], [12, 300], [-22, 290], [-14, 190], [-10, 145], [-4, 133]];
const FAR = 4;
const SPEED = 1.8, EASE = 12, MOOR = 50, EVERY = 420;   // 公尺／秒；靠岸加減速的距離；停幾秒；幾秒來一趟
const KEEP = 140;   // 燈放在石階上，船開走後還亮多久（從靠岸算起）

// 冒險者的船（visitors.js）：第一個點是泊位，貼著棧橋方台西側、船頭朝海。從右邊的霧裡進來，
// 在方台前面的水上掉頭靠岸，走的時候直接往前開回霧裡。整條航線都在小島和黑袍船的右側
const VISIT_ROUTE = [[5.6, 57.3], [7, 70], [18, 96], [42, 160], [55, 260], [30, 245], [25, 150], [12, 88], [3, 64], [0.6, 53], [2.6, 48.6], [5, 51.5]];
const VISIT_FAR = 4;

// 白塔的脈動：每 PULSE 秒一輪，towerPhase 是這一輪走到哪裡，石頭在 0.5 亮起。西方的星（lore.js）跟著一起閃
export const PULSE = 14;
export const towerPhase = (now) => (now % PULSE) / PULSE;
export const bump = (f, at, w) => Math.exp(-(((f - at) / w) ** 2));

// 船的霧：近處只蓋三分之一，夕陽前仍是深色的剪影；往遠處慢慢加厚，到霧裡最遠那一點就完全看不見
function thinFog(mat) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar * 1.6, vFogDepth));
    #endif`);
  };
  m.customProgramCacheKey = () => 'thinFog';
  return m;
}

export function buildHarbor({ group, h, Z, G, SEA_LEVEL, SEA_BED, REFLECT_LAYER }) {
  const R = rng('harbor'), k = new Kit(R), o = { ao: false };
  const reflect = (obj) => { obj.traverse((c) => c.layers.enable(REFLECT_LAYER)); return obj; };
  const DECK = G + 0.1;

  // ---- 木棧橋 ----
  const J = JETTY;
  for (let rel = J.r0 + 0.15; rel < J.end; rel += 0.3) {
    const w = rel > J.r1 ? J.ehw * 2 : J.hw * 2, c = ['#8a6a48', '#7a5a3a', '#93724e', '#6e5034'][Math.floor(R() * 4)];
    k.box(w + (R() - 0.5) * 0.06, 0.07, 0.27, c, J.x + (R() - 0.5) * 0.04, DECK - 0.035, Z(rel), { ry: (R() - 0.5) * 0.03 });
  }
  for (const sx of [-1, 1]) k.box(0.14, 0.22, J.end - J.r0, '#4e3826', J.x + sx * (J.hw - 0.2), DECK - 0.18, Z((J.r0 + J.end) / 2));
  // 樁：橋面兩側每隔一段一根，方台四周多幾根；有幾根冒出橋面當繫船柱
  const pile = (x, rel, up) => {
    const top = DECK + up, bot = SEA_BED - 0.3;
    k.cyl(0.13, 0.15, top - bot, '#4a3626', x, (top + bot) / 2, Z(rel), { color2: '#6a5038' }, 7);
  };
  for (let rel = 40.5, i = 0; rel < J.r1; rel += 2.5, i++) for (const sx of [-1, 1]) pile(J.x + sx * (J.hw - 0.08), rel, i % 3 === 1 ? 0.55 : -0.02);
  for (const rel of [J.r1 + 0.2, (J.r1 + J.end) / 2, J.end - 0.15]) for (const sx of [-1, 1]) pile(J.x + sx * (J.ehw - 0.1), rel, 0.55);
  lamp(k, J.x - J.hw + 0.1, DECK, Z(42), Math.PI / 2);
  lamp(k, J.x + J.hw - 0.1, DECK, Z(49), -Math.PI / 2);
  lamp(k, J.x - J.ehw + 0.15, DECK, Z(J.end - 0.3), Math.PI / 2);
  lamp(k, J.x + J.ehw - 0.15, DECK, Z(J.end - 0.3), -Math.PI / 2);
  const blocks = [
    { x: J.x - J.hw + 0.1, z: Z(42), hw: 0.15, hd: 0.15 }, { x: J.x + J.hw - 0.1, z: Z(49), hw: 0.15, hd: 0.15 },
    { x: J.x - J.ehw + 0.15, z: Z(J.end - 0.3), hw: 0.15, hd: 0.15 }, { x: J.x + J.ehw - 0.15, z: Z(J.end - 0.3), hw: 0.15, hd: 0.15 },
  ];
  // 繩子盤在台上
  k.torus(0.2, 0.05, Math.PI * 2, '#b09a70', J.x + 1.5, DECK + 0.04, Z(J.r1 + 0.8), { rx: Math.PI / 2 });
  k.torus(0.14, 0.05, Math.PI * 2, '#b09a70', J.x + 1.5, DECK + 0.1, Z(J.r1 + 0.8), { rx: Math.PI / 2 });

  // ---- 海灣中間的小島：岩石堆成的島，坡上幾棵樹，頂上一座細高的白塔。塔頂敞開，四根細尖柱圍著懸空的石頭（見下面的 magic） ----
  {
    const x = 4, z = Z(145), y = SEA_LEVEL - 1.6;
    k.rock(9, '#6a5e58', x, y, z, { ...o, sy: 0.55, ry: 0.4, color2: '#8a8a5c' });
    for (const [dx, dz, r] of [[-6, 4, 4.5], [5, -5, 3.6], [3, 7, 3], [-4, -6, 3.2]]) k.rock(r, '#6e6058', x + dx, SEA_LEVEL - 0.8, z + dz, { ...o, sy: 0.6, ry: R() * 3, color2: '#8c8660' });
    const b = 0.8;
    k.cyl(1.8, 2.1, 2.4, '#b8ac98', x, b - 1, z, o, 10);
    k.cyl(0.72, 1.02, 16, '#ece6da', x, b + 8, z, { ...o, color2: '#fff4e4' }, 10);
    k.cyl(1.3, 1.1, 0.35, '#d8cdb8', x, b + 16.15, z, o, 10);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, px = x + Math.cos(a) * 1.05, pz = z + Math.sin(a) * 1.05;
      k.cyl(0.07, 0.12, 1.6, '#ece6da', px, b + 17.1, pz, o, 5);
      k.cone(0.1, 0.9, '#ece6da', px, b + 18.35, pz, { ...o, color2: '#fff4e4' });
    }
    for (const [dx, dz, s] of [[-4, 2, 1.1], [-2.5, 4.5, 0.9], [3.5, 3, 1], [2, -4, 0.8]]) pine(k, x + dx, y + 0.45 * Math.sqrt(81 - dx * dx - dz * dz) - 0.3, z + dz, s);
    // 面向草原那一側的小石台，一道石階爬上去接到塔腳；黑袍的船就停在石台邊
    const land = G - 0.35;
    k.box(3.2, land - SEA_BED, 2.2, '#a89c88', x, (land + SEA_BED) / 2, Z(134.8), { ...o, color2: '#c4b8a2' });
    for (let i = 0; i < 6; i++) {
      const t = land + (i + 1) * 0.45;
      k.box(1.6, 2.5, 1.3, '#b8ac98', x, t - 1.25, Z(136.2 + i * 1.2), o);
    }
  }

  const bucket = newBucket();
  k.emit(bucket, 0, 0, 0);
  for (const obj of h.bucketObjects(bucket)) group.add(reflect(obj));

  // ---- 會動的：繫在棧橋邊的小划船、黑袍訪客的船 ----
  const make = (build, thin = false) => {
    const kk = new Kit(R), b = newBucket(), g = new THREE.Group();
    build(kk);
    kk.emit(b, 0, 0, 0);
    for (const obj of h.bucketObjects(b)) {
      if (thin && obj.isMesh) obj.material = thinFog(obj.material);
      g.add(obj);
    }
    g.rotation.order = 'YXZ';
    group.add(reflect(g));
    return g;
  };
  const row = make((kk) => {
    // 船吃水 0.19 公尺，艙底鋪木板在水面上方，搖晃時水面也碰不到
    kk.add(hull(3.2, 1.3, 0.55, { y: 0.45, w: 0.82 }), '#6e4a30', 0, 0, 0, { color2: '#a0704a', ao: false });
    for (const x of [-0.18, 0, 0.18]) kk.box(0.15, 0.025, 2.1, '#5a3a24', x, -0.235, 0);
    for (const z of [-0.5, 0.5]) kk.box(1.05, 0.05, 0.24, '#8a6440', 0, -0.12, z);
    for (const sx of [-1, 1]) kk.cyl(0.03, 0.03, 2.6, '#a07a50', sx * 0.22, -0.06, 0.1, { rx: Math.PI / 2, ry: sx * 0.08 }, 5);
  });
  row.position.set(J.x + J.hw + 0.95, SEA_LEVEL + 0.36, Z(50));

  const pts = ROUTE.map(([x, rel]) => new THREE.Vector3(x, 0, Z(rel)));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const LEN = curve.getLength(), ta = (2 * EASE) / SPEED, tc = (LEN - 2 * EASE) / SPEED;
  // 霧裡最遠那一點離泊位多遠（沿著航線）
  const lens = curve.getLengths(ROUTE.length * 40), sFar = lens[FAR * 40];
  const tFar = ta + (sFar - EASE) / SPEED, WAIT = Math.max(0, EVERY - MOOR - 2 * ta - tc);
  // 離開泊位 τ 秒後走了多遠：先加速 EASE 公尺，等速開到霧裡最遠那一點，在那裡等 WAIT 秒，再開回來，最後 EASE 公尺減速停好
  const along = (τ) => {
    if (τ >= tFar) τ = τ < tFar + WAIT ? tFar : τ - WAIT;
    if (τ < ta) return (SPEED * τ * τ) / (2 * ta);
    if (τ < ta + tc) return EASE + SPEED * (τ - ta);
    const u = Math.min(ta, τ - ta - tc);
    return LEN - EASE + SPEED * u - (SPEED * u * u) / (2 * ta);
  };
  const ship = make(boat, true), lantern = make(boatLamp, true);
  ship.add(lantern);
  // 燈的光暈不吃霧，船開進霧裡時另外把光暈縮掉
  const halo = lantern.children.find((c) => c.isPoints), haloSize = halo.geometry.attributes.aSize, haloBase = haloSize.array.slice();
  // 靠岸停到一半，燈放上石階；船回到霧裡等下一趟時，船頭再換上一盞（那時看不見）
  const kept = make(keptLamp, true), keptHalo = kept.children.find((c) => c.isPoints).geometry.attributes.aSize;
  const keptGlow = kept.children.find((c) => c.isMesh && c.material.isMeshBasicMaterial);
  kept.position.set(4.9, G - 0.35, Z(134.3));
  const setDown = MOOR * 0.6, relit = MOOR + tFar + WAIT * 0.5;
  const meadow = new THREE.Vector3(0, 0, Z(22.5));
  const p = new THREE.Vector3(), tg = new THREE.Vector3();

  // ---- 白塔的魔法：塔頂懸著一顆淡藍的石頭，兩道金環繞著它慢慢轉；塔身三道符文環平常只微微亮著 ----
  // 每隔 PULSE 秒，一道光從塔腳順著符文環往上爬，爬到頂上石頭亮一下，一道淡淡的光柱往天上散去
  // 這些都不吃霧，遠遠看也認得出是魔法的光
  const magic = new THREE.Group(), MB = 0.8, STONE_Y = MB + 18;
  magic.position.set(4, 0, Z(145));
  const add = (geo, color, y, extra = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false, ...extra }));
    m.position.y = y;
    magic.add(m);
    return m;
  };
  const STONE = new THREE.Color('#9cc8ff'), FLASH = new THREE.Color('#f4faff');
  const stone = add(new THREE.OctahedronGeometry(0.5, 0), STONE, STONE_Y);
  stone.scale.set(0.8, 1.3, 0.8);
  const rings = [add(new THREE.TorusGeometry(1.35, 0.035, 4, 48), '#e8d6a0', STONE_Y), add(new THREE.TorusGeometry(0.8, 0.03, 4, 40), '#e8d6a0', STONE_Y)];
  const RUNE = new THREE.Color('#2a3c5c'), RUNE_LIT = new THREE.Color('#bcd8ff');
  const runes = [4, 8.5, 13].map((y) => {
    const m = add(new THREE.TorusGeometry(1.04 - y * 0.01875, 0.07, 4, 28), RUNE, MB + y, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    m.rotation.x = Math.PI / 2;
    return m;
  });
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } },
    vertexShader: `varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uA; varying float vY; void main() { float a = pow(1.0 - vY, 2.0) * uA; gl_FragColor = vec4(vec3(0.75, 0.86, 1.0) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.35, 60, 16, 1, true), beamMat);
  beam.position.y = STONE_Y + 30;
  beam.frustumCulled = false;
  magic.add(beam);
  const glow = h.glowPoints([{ x: 0, y: STONE_Y, z: 0, color: '#bcd8ff', size: 9 }]), glowSize = glow.geometry.attributes.aSize;
  magic.add(glow);
  group.add(reflect(magic));

  return {
    blocks,
    // 渡船：站在棧橋右緣、小划船旁邊就能上船；從海市回來也站在這裡
    ferry: { x: J.x + J.hw - 0.45, z: Z(50), r: 1.6 },
    // 冒險者的船：航線、霧裡最遠那一點、水面高度，上岸站的三個點在方台西側
    dock: {
      sea: SEA_LEVEL,
      route: VISIT_ROUTE.map(([x, rel]) => new THREE.Vector3(x, 0, Z(rel))),
      far: VISIT_FAR,
      land: [55.9, 57, 58.1].map((rel) => ({ x: J.x - J.ehw + 0.55, z: Z(rel) })),
    },
    update(t) {
      row.position.y = SEA_LEVEL + 0.36 + Math.sin(t * 1.3) * 0.05;
      row.rotation.set(Math.sin(t * 0.9) * 0.03, 0.12 + Math.sin(t * 0.3) * 0.05, Math.sin(t * 1.1 + 1) * 0.05);
      // 用真實時間算，每位訪客看到的船都在同一個位置
      const now = Date.now() / 1000, c = ((now % EVERY) + EVERY) % EVERY;
      const u = ((c < MOOR ? 0 : along(c - MOOR)) / LEN) % 1;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tg);
      ship.position.set(p.x, SEA_LEVEL + BOAT.depth * 0.38 + Math.sin(now * 0.9) * 0.05, p.z);
      ship.rotation.set(Math.sin(now * 0.7) * 0.015, Math.atan2(tg.x, tg.z), Math.sin(now * 0.55) * 0.03);
      const fade = 1 - Math.min(1, Math.max(0, (p.distanceTo(meadow) - 130) / 60));
      for (let i = 0; i < haloBase.length; i++) haloSize.array[i] = haloBase[i] * fade;
      haloSize.needsUpdate = true;
      lantern.visible = c < setDown || c > relit;
      const keep = c < setDown ? 0 : Math.min(1, (c - setDown) / 1.5, Math.max(0, (MOOR + KEEP - c) / 20));
      kept.visible = keep > 0;
      keptHalo.array[0] = 2.2 * keep;
      keptHalo.needsUpdate = true;
      keptGlow.material.color.setScalar(keep);

      // 白塔：0.1 起光從最下面那道符文環往上爬，0.5 到頂
      const f = towerPhase(now), flash = bump(f, 0.5, 0.06), after = bump(f, 0.58, 0.12);
      runes.forEach((m, i) => m.material.color.copy(RUNE).lerp(RUNE_LIT, 0.15 + 0.85 * bump(f, 0.14 + i * 0.12, 0.05)));
      stone.position.y = STONE_Y + Math.sin(now * 0.8) * 0.15;
      stone.rotation.y = now * 0.5;
      stone.material.color.copy(STONE).lerp(FLASH, flash);
      rings[0].rotation.set(0.5 + Math.sin(now * 0.2) * 0.2, now * 0.35, 0);
      rings[1].rotation.set(now * 0.27, 0.9, 0.4);
      glowSize.array[0] = 9 * (0.85 + 0.1 * Math.sin(now * 0.8) + 1.2 * flash);
      glowSize.needsUpdate = true;
      beamMat.uniforms.uA.value = 0.03 + 0.3 * after;
    },
  };
}
