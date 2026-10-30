// 玩家角色：照捏好的外觀組出來，預設是戴尖帽的小煉金學徒。面向本地 +z。
// 身體、頭、帽子、手、腳各自合併成一個網格，換外觀時整個重建。自己畫的臉是一片貼在臉上的貼圖。
import * as THREE from 'three';
import { Kit, mergeBucket } from './props.js';
import { HEADS, rod } from './heads.js';
import { HAT_COLORS, HAIR_COLORS, SKINS, CLOTH, FACE, FACE_INK, raceOf, sizes, sanitizeLook, lookKey, decodeFace } from './looks.js';
import { HIP, HOODED, HAND_POSE, bodyGeo, armGeo, legGeo, capeGeo, capeAt, wingGeo, wingAt, hasWings, tailGeo, tailAt, handGeo, hood } from './clothes.js';

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export const JUMP_V = 4.2, GRAVITY = 14;
const ACT_TIME = 1.6;
const PET_TIME = 2.4;      // 摸動物摸多久
// 長袍上窄下寬，手臂要從肩膀往外張開一點，手才會沿著袍子外側垂下，不會插進身體
const ARM_OUT = 0.28;
const NECK = 0.8;          // 頭的原點（脖子）離腳底多高，身高另外整個縮放
const SIT_TIME = 0.8;      // 坐下或站起來花幾秒
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const WHITE = '#f4f2ec', GOLD = '#d4a54a';
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// ---------- 組零件 ----------

const EMPTY = new THREE.BufferGeometry();
function build(fn) {
  const k = new Kit(null);
  fn(k);
  return mergeBucket(k.lit, false);
}
// 換掉網格的幾何，舊的丟掉。沒有東西就藏起來
function swap(m, geo) {
  if (m.geometry !== EMPTY) m.geometry.dispose();
  m.geometry = geo || EMPTY;
  m.visible = !!geo;
}

// 臉的範圍：以 (0, cy) 為中心、半邊 R 的正方形。從正前方對頭打 (FN + 1)² 條射線，記下每一點臉的表面在哪。
// 自己畫的臉照這張深度彎成曲面貼上去，眼睛嘴巴也靠它找到臉的表面。每個種族只算一次
const FN = 32;
const faceMaps = new Map();
export function faceMap(race) {
  let m = faceMaps.get(race.id);
  if (m) return m;
  const fs = race.fs ?? 1, R = 0.26 * fs, cy = race.ey - 0.05 * fs, N1 = FN + 1;
  const geo = build((k) => HEADS[race.head](k, '#808080', '#a0a0a0'));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster(), from = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, -1);
  const z = new Float32Array(N1 * N1);
  let known = new Uint8Array(N1 * N1);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    rc.set(from.set(-R + (2 * R * i) / FN, cy + R - (2 * R * j) / FN, 2), dir);
    const h = rc.intersectObject(mesh, false)[0];
    if (h) { z[j * N1 + i] = h.point.z; known[j * N1 + i] = 1; }
  }
  const hit = known.slice();
  // 打空的點往外補成旁邊的平均，畫到頭外面的部分就像一片紙板立在頭的邊上
  let left = known.reduce((n, v) => n + (v ? 0 : 1), 0);
  if (left === known.length) { z.fill(0.2); left = 0; }
  while (left > 0) {
    const next = known.slice();
    for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
      const at = j * N1 + i;
      if (known[at]) continue;
      let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a >= 0 && a < N1 && b >= 0 && b < N1 && known[b * N1 + a]) { s += z[b * N1 + a]; n++; }
      }
      if (n) { z[at] = s / n - 0.004; next[at] = 1; left--; }
    }
    known = next;
  }
  geo.dispose();
  mesh.material.dispose();
  m = { R, cy, N1, z, hit };
  faceMaps.set(race.id, m);
  return m;
}

// 臉在 (x, y) 這一點的表面有多前面
function surf(m, x, y) {
  const { R, cy, N1, z } = m;
  const fx = Math.min(FN, Math.max(0, ((x + R) / (2 * R)) * FN)), fy = Math.min(FN, Math.max(0, ((cy + R - y) / (2 * R)) * FN));
  const i = Math.min(FN - 1, Math.floor(fx)), j = Math.min(FN - 1, Math.floor(fy)), u = fx - i, v = fy - j;
  const a = z[j * N1 + i], b = z[j * N1 + i + 1], c = z[(j + 1) * N1 + i], d = z[(j + 1) * N1 + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// 自己畫的臉：一片照臉的深度彎過的方格
function decalGeo(m) {
  const g = new THREE.PlaneGeometry(m.R * 2, m.R * 2, FN, FN), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + m.cy);
    pos.setZ(i, m.z[i] + 0.006);
  }
  g.computeVertexNormals();
  return g;
}

const INK_RGB = FACE_INK.map((c) => (c ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null));

// 頭髮：只有人有。原點在脖子，頭的中心在 0.2
function hair(k, style, c) {
  const top = () => k.ball(0.21, c, 0, 0.23, -0.04, { sy: 0.9, sz: 0.95 });
  switch (style) {
    case 'short': top(); break;
    case 'bald':
      for (const x of [-0.03, 0, 0.03]) rod(k, [x, 0.395, 0.02], [x * 1.6, 0.47, 0.05], 0.004, c, { seg: 3 });
      break;
    case 'comb':
      // 地中海：兩側和後腦一圈，頭頂只剩幾絲往旁邊梳
      k.ball(0.21, c, 0, 0.17, -0.04, { sy: 0.75, sz: 0.95 });
      for (const z of [-0.05, 0, 0.05]) k.box(0.22, 0.006, 0.018, c, 0.01, 0.2 + Math.sqrt(0.04 - z * z) - 0.002, z, { rz: -0.12 });
      break;
    case 'afro':
      k.ball(0.29, c, 0, 0.3, -0.07, { sy: 0.92 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.ball(0.12, c, Math.cos(a) * 0.22, 0.36 + Math.sin(a) * 0.12, -0.1 + Math.sin(a) * 0.05);
      }
      break;
    case 'spiky':
      top();
      for (const [e, n] of [[1.25, 3], [0.75, 5], [0.3, 5]]) {
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.4 + (1.2 * (i + 0.5)) / n), d = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
          k.cone(0.05, 0.16, c, d[0] * 0.2, 0.23 + d[1] * 0.19, -0.04 + d[2] * 0.2, { rx: Math.acos(d[1]), ry: Math.atan2(d[0], d[2]) });
        }
      }
      break;
    case 'long':
      top();
      k.box(0.38, 0.42, 0.08, c, 0, 0.1, -0.15);
      for (const s of [-1, 1]) k.box(0.06, 0.3, 0.14, c, s * 0.18, 0.12, -0.06);
      break;
    case 'buns':
      top();
      for (const s of [-1, 1]) k.ball(0.085, c, s * 0.15, 0.37, -0.05);
      break;
  }
}

// 五官：照臉的表面一個一個貼上去。眼睛、眉毛、鼻子、嘴巴的位置都從眼睛的高度往下排
function features(k, L, race, S, m, skin) {
  const fs = race.fs ?? 1, ink = race.ink || '#1a120c', base = race.base || skin;
  const hc = race.hair ? hex(HAIR_COLORS[L.hairC]) : '#3a2a22';
  const ey = race.ey + S.fy, ex = race.ex * S.eg;
  // 在臉上 (x, y) 放一顆球，lift 是球心離表面多遠
  const put = (r, c, x, y, lift = 0, o) => k.ball(r, c, x, y, surf(m, x, y) + lift, o);
  const zAt = (x, y, lift = 0) => surf(m, x, y) + lift;

  const eyeOf = (s) => ({ x: s * ex, y: ey + (s < 0 ? S.odd * 0.03 : 0), r: S.es * fs * (s < 0 ? 1 + S.odd * 0.9 : 1 - S.odd * 0.45) });
  const white = (e, r = 0.055) => put(r * e.r, '#ffffff', e.x, e.y, 0, { sz: 0.5 });
  const pupil = (e, dx = 0, dy = 0, r = 0.028) => put(r * e.r, ink, e.x + dx * e.r, e.y + dy * e.r, 0.016 * e.r * (r / 0.028), { sz: 0.5 });
  const style = L.eyes === 'base' ? (race.own ? null : 'dot') : L.eyes;
  for (const s of style === 'one' ? [0] : [-1, 1]) {
    const e = s ? eyeOf(s) : { x: 0, y: ey + 0.01, r: S.es * fs * 1.4 };
    switch (style) {
      case 'dot': case 'three': put(0.026 * e.r, ink, e.x, e.y); break;
      case 'big': case 'one': white(e); pupil(e); break;
      case 'line': k.torus(0.03 * e.r, 0.007 * e.r, Math.PI, ink, e.x, e.y - 0.01 * e.r, zAt(e.x, e.y, 0.003)); break;
      case 'sleepy':
        white(e, 0.05);
        pupil(e, 0, -0.012, 0.02);
        k.box(0.11 * e.r, 0.05 * e.r, 0.03 * e.r, base, e.x, e.y + 0.022 * e.r, zAt(e.x, e.y, 0.012 * e.r));
        break;
      case 'cross': white(e); pupil(e, -s * 0.022); break;
    }
  }
  if (style === 'three') put(0.026 * S.es * fs, ink, 0, ey + 0.08 * fs);

  const by = ey + (0.035 + 0.03 * S.es) * fs, bc = race.hair ? hc : ink;
  switch (L.brows) {
    case 'thick': for (const s of [-1, 1]) k.box(0.075 * fs, 0.018 * fs, 0.012, bc, s * ex, by, zAt(s * ex, by, 0.004), { rz: s * 0.12 }); break;
    case 'uni': k.box(ex * 2 + 0.08 * fs, 0.02 * fs, 0.012, bc, 0, by, zAt(0, by, 0.004)); break;
    case 'angry': for (const s of [-1, 1]) k.box(0.075 * fs, 0.016 * fs, 0.012, bc, s * ex * 0.9, by - 0.006, zAt(s * ex, by, 0.004), { rz: s * 0.4 }); break;
    case 'sad': for (const s of [-1, 1]) k.box(0.07 * fs, 0.014 * fs, 0.012, bc, s * ex, by, zAt(s * ex, by, 0.004), { rz: -s * 0.35 }); break;
  }

  const ny = ey - 0.055 * fs;
  switch (L.nose) {
    case 'ball': put(0.022 * fs, mix(base, '#000000', 0.12), 0, ny, 0.008); break;
    case 'big': put(0.06 * fs, '#e0806a', 0, ny - 0.01 * fs, 0.025); break;
    case 'pig':
      k.cyl(0.042 * fs, 0.042 * fs, 0.04, '#f0a0a8', 0, ny, zAt(0, ny, 0.012), { rx: Math.PI / 2 }, 12);
      for (const s of [-1, 1]) k.box(0.012 * fs, 0.022 * fs, 0.005, '#6a2a3a', s * 0.014 * fs, ny, zAt(0, ny, 0.033));
      break;
    case 'long': k.cone(0.025 * fs, 0.2, base, 0, ny, zAt(0, ny, 0.1), { rx: Math.PI / 2 }); break;
  }

  const my = ey - 0.11 * fs, lip = '#5a2a22';
  const smile = (x = 0, rz = Math.PI) => k.torus(0.04 * fs, 0.008 * fs, Math.PI, lip, x, my + 0.025 * fs, zAt(x, my + 0.01, 0.004), { rz });
  switch (L.mouth) {
    case 'smile': smile(); break;
    case 'open':
      put(0.045 * fs, '#3a1418', 0, my, 0, { sy: 0.75, sz: 0.3 });
      put(0.025 * fs, '#d86a7a', 0, my - 0.012 * fs, 0.008, { sz: 0.3 });
      break;
    case 'teeth':
      k.box(0.07 * fs, 0.008, 0.01, lip, 0, my, zAt(0, my, 0.003));
      for (const s of [-1, 1]) k.box(0.024 * fs, 0.035 * fs, 0.012, '#ffffff', s * 0.013 * fs, my - 0.018 * fs, zAt(0, my, 0.01));
      break;
    case 'pout': k.torus(0.018 * fs, 0.012 * fs, Math.PI * 2, '#d8606a', 0, my, zAt(0, my, 0.012)); break;
    case 'flat': k.box(0.07 * fs, 0.009, 0.01, lip, 0, my, zAt(0, my, 0.003)); break;
    case 'wry': smile(0.03 * fs, Math.PI + 0.45); break;
    case 'tongue':
      smile();
      k.box(0.035 * fs, 0.05 * fs, 0.012, '#e06a7a', 0.01 * fs, my - 0.03 * fs, zAt(0, my, 0.012), { rx: -0.3 });
      break;
  }

  const cx = ex + 0.05 * fs, cyk = ey - 0.05 * fs;
  const mark = L.mark === 'base' ? (race.id === 'human' ? 'blush' : null) : L.mark;
  switch (mark) {
    case 'blush': for (const s of [-1, 1]) put(0.03 * fs, '#f29a8a', s * cx, cyk, 0, { sz: 0.25 }); break;
    case 'stache': for (const s of [-1, 1]) put(0.035 * fs, hc, s * 0.03 * fs, ny - 0.03 * fs, 0.006, { sx: 1.4, sy: 0.55, sz: 0.5, rz: s * 0.25 }); break;
    case 'beard': put(0.12 * fs, hc, 0, my - 0.06 * fs, -0.04, { sx: 1.1, sz: 0.7 }); break;
    case 'mole': put(0.012 * fs, '#2a1a12', ex + 0.02 * fs, my + 0.015 * fs); break;
    case 'freckle':
      for (const s of [-1, 1]) for (const [dx, dy] of [[0, 0], [0.025, 0.012], [0.02, -0.014], [-0.022, -0.006]]) put(0.007 * fs, '#a86a40', s * (cx + dx * fs), cyk + dy * fs);
      break;
    case 'bandaid':
      k.box(0.085 * fs, 0.028 * fs, 0.006, '#e8c8a0', -cx, cyk, zAt(-cx, cyk, 0.004), { rz: 0.5 });
      k.box(0.026 * fs, 0.02 * fs, 0.007, '#d0a878', -cx, cyk, zAt(-cx, cyk, 0.005), { rz: 0.5 });
      break;
  }
}

// 眼鏡：架在眼睛的位置，畫了臉也照樣戴著
function glasses(k, L, race, S, m) {
  if (L.glasses === 'none') return;
  const fs = race.fs ?? 1, ey = race.ey + S.fy, ex = race.ex * S.eg;
  const gr = 0.045 * fs * Math.max(1, S.es * 0.8), frame = '#2a2220';
  const zAt = (x) => surf(m, x, ey) + 0.015 + 0.03 * S.es * fs;
  const bridge = (c, t = 0.007) => k.box(Math.max(0.01, 2 * (ex - gr)), t, t, c, 0, ey + gr * 0.3, zAt(0));
  switch (L.glasses) {
    case 'round':
      for (const s of [-1, 1]) {
        k.torus(gr, 0.007, Math.PI * 2, frame, s * ex, ey, zAt(s * ex));
        rod(k, [s * (ex + gr), ey, zAt(s * ex)], [s * (ex + gr + 0.02), ey + 0.01, zAt(s * ex) - 0.2], 0.005, frame, { seg: 4 });
      }
      bridge(frame);
      break;
    case 'shades':
      for (const s of [-1, 1]) k.box(gr * 2.3, gr * 1.4, 0.012, '#141418', s * ex, ey, zAt(s * ex));
      bridge('#141418', 0.012);
      break;
    case 'mono':
      k.torus(gr, 0.007, Math.PI * 2, GOLD, ex, ey, zAt(ex));
      rod(k, [ex, ey - gr, zAt(ex)], [ex + gr + 0.04, ey - 0.22, zAt(ex) - 0.08], 0.003, GOLD, { seg: 3 });
      break;
    case 'groucho':
      for (const s of [-1, 1]) {
        k.torus(gr, 0.013, Math.PI * 2, '#141012', s * ex, ey, zAt(s * ex));
        k.box(gr * 2.2, 0.03 * fs, 0.025, '#141012', s * ex, ey + gr + 0.02 * fs, zAt(s * ex), { rz: -s * 0.15 });
        k.ball(0.04 * fs, '#141012', s * 0.035 * fs, ey - 0.13 * fs, zAt(0) + 0.02, { sx: 1.4, sy: 0.6, sz: 0.6, rz: s * 0.2 });
      }
      bridge('#141012', 0.013);
      k.ball(0.05 * fs, '#e8a888', 0, ey - 0.06 * fs, zAt(0) + 0.03);
      break;
    case '3d':
      k.box(2 * ex + 2.4 * gr, gr * 1.5, 0.01, '#f4f2ec', 0, ey, zAt(0));
      k.box(gr * 1.8, gr * 1.1, 0.012, '#d83a3a', -ex, ey, zAt(0) + 0.004);
      k.box(gr * 1.8, gr * 1.1, 0.012, '#3a7ad8', ex, ey, zAt(0) + 0.004);
      break;
  }
}

function headGeo(L, race, S, skin) {
  const m = faceMap(race);
  return build((k) => {
    HEADS[race.head](k, skin, mix(skin, '#f8f0e4', 0.55));
    if (race.hair) hair(k, L.hair, hex(HAIR_COLORS[L.hairC]));
    if (!L.face || L.keep) features(k, L, race, S, m, skin);
    glasses(k, L, race, S, m);
    hood(k, L, race);
  });
}

// 每種帽子從帽緣往上多高，照鏡子取景用
const HAT_H = { wizard: 0.5, none: 0.08, crown: 0.2, propeller: 0.26, chef: 0.36, straw: 0.18, cone: 0.52, party: 0.4, sprout: 0.24 };

// 帽子：原點在帽緣中心。螺旋槳另外一個網格，才能轉
function hatGeo(L) {
  const c = hex(HAT_COLORS[L.hatC]);
  const main = build((k) => {
    switch (L.hat) {
      case 'wizard':
        k.cyl(0.34, 0.34, 0.03, c, 0, 0, 0, {}, 12);
        k.add(new THREE.ConeGeometry(0.22, 0.5, 9), c, 0.03, 0.25, 0, { rz: -0.25 });
        k.cyl(0.205, 0.215, 0.05, GOLD, 0, 0.04, 0, {}, 9);
        break;
      case 'crown':
        k.add(new THREE.CylinderGeometry(0.17, 0.16, 0.09, 10, 1, true), GOLD, 0, 0.07, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          k.cone(0.035, 0.09, GOLD, Math.sin(a) * 0.165, 0.155, Math.cos(a) * 0.165);
        }
        k.ball(0.022, '#c8302a', 0, 0.07, 0.17);
        for (const s of [-1, 1]) k.ball(0.018, '#3a6ac8', s * 0.12, 0.07, 0.12);
        break;
      case 'propeller':
        k.ball(0.215, c, 0, 0.04, 0, { sy: 0.6, color2: mix(c, '#ffffff', 0.3) });
        k.cyl(0.012, 0.012, 0.06, '#d8d8d8', 0, 0.19, 0);
        break;
      case 'chef':
        k.cyl(0.16, 0.15, 0.14, '#f8f6f0', 0, 0.06, 0, {}, 12);
        k.ball(0.21, '#ffffff', 0, 0.21, 0, { sy: 0.55 });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          k.ball(0.09, '#ffffff', Math.sin(a) * 0.13, 0.24, Math.cos(a) * 0.13);
        }
        break;
      case 'straw':
        k.add(new THREE.ConeGeometry(0.42, 0.2, 16), '#d8b870', 0, 0.07, 0, { color2: '#e8cc88' });
        k.ball(0.025, '#b8984a', 0, 0.17, 0);
        break;
      case 'cone':
        k.box(0.34, 0.03, 0.34, '#e8602a', 0, 0.015, 0);
        k.add(new THREE.ConeGeometry(0.14, 0.5, 12), '#f07030', 0, 0.27, 0);
        k.add(new THREE.CylinderGeometry(0.091, 0.108, 0.06, 12), WHITE, 0, 0.18, 0);
        k.add(new THREE.CylinderGeometry(0.041, 0.055, 0.05, 12), WHITE, 0, 0.36, 0);
        break;
      case 'party':
        k.add(new THREE.ConeGeometry(0.13, 0.36, 10), c, 0, 0.18, 0);
        for (const [h, a, d] of [[0.06, 0.3, '#f0c040'], [0.14, -0.6, '#4fa3a5'], [0.2, 0.9, '#f4f0e8'], [0.1, 2.4, '#e27a9a']]) {
          const r = 0.13 * (1 - h / 0.36) + 0.004;
          k.ball(0.016, d, Math.sin(a) * r, h, Math.cos(a) * r);
        }
        k.ball(0.045, '#f4f0e8', 0, 0.36, 0);
        break;
      case 'sprout':
        rod(k, [0, 0.04, 0], [0.01, 0.18, 0], 0.008, '#5a9a3a');
        for (const s of [-1, 1]) k.ball(0.045, '#6ab84a', s * 0.045 + 0.01, 0.19, 0, { sx: 1.2, sy: 0.35, sz: 0.7, rz: s * 0.4 });
        break;
    }
  });
  const prop = L.hat === 'propeller' ? build((k) => {
    k.box(0.36, 0.012, 0.05, '#e84a3a', 0, 0, 0);
    k.box(0.05, 0.012, 0.36, '#f0c040', 0, 0.002, 0);
    k.ball(0.02, '#d8d8d8', 0, 0.01, 0);
  }) : null;
  return { main, prop };
}

const smooth = (t) => t * t * (3 - 2 * t);

// 陽台長桌上拿得起來的點心，編號從 1 開始，0 是空手
export const FOODS = ['bread', 'apple', 'pomegranate', 'cheese', 'grapes'];
const BITES = 3;
const BITE_TIME = 0.5;

function foodModel(kind) {
  const g = new THREE.Group();
  const add = (geo, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
  };
  switch (FOODS[kind - 1]) {
    case 'bread': add(new THREE.IcosahedronGeometry(0.07, 1), 0xc8843f, 0, 0, 0, 1.5, 0.75, 0.9); break;
    case 'apple': add(new THREE.IcosahedronGeometry(0.055, 1), 0xc8382a, 0, 0, 0); add(new THREE.BoxGeometry(0.008, 0.03, 0.008), 0x4a3020, 0, 0.065, 0); break;
    case 'pomegranate': add(new THREE.IcosahedronGeometry(0.06, 1), 0x9c1f2a, 0, 0, 0); add(new THREE.ConeGeometry(0.022, 0.035, 6), 0x7a1820, 0, 0.07, 0); break;
    case 'cheese': add(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 3), 0xf0cc70, 0, 0, 0); break;
    case 'grapes':
      for (let i = 0; i < 8; i++) add(new THREE.IcosahedronGeometry(0.024, 0), i % 3 ? 0x5a2a5a : 0x7a3a6a, ((i % 3) - 1) * 0.03, -Math.floor(i / 3) * 0.035, (i % 2) * 0.02);
      break;
  }
  return g;
}

// 外來的「手上拿什麼」：0 或 種類 × 10 + 已咬幾口
export const isFood = (f) => f === 0 || (Number.isInteger(f) && f >= 10 && Math.floor(f / 10) <= FOODS.length && f % 10 < BITES);

export class Character {
  constructor(shadowTex, look) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = (parent) => {
      const m = new THREE.Mesh(EMPTY, this.mat);
      m.visible = false;
      parent.add(m);
      return m;
    };
    this.torso = mesh(body);
    this.scarfTail = mesh(body);
    // 會動的衣服：披風、翅膀、尾巴各掛在一個關節上
    const joint = (parent) => {
      const p = new THREE.Group();
      parent.add(p);
      return [p, mesh(p)];
    };
    [this.cape, this.capeMesh] = joint(body);
    this.wings = [-1, 1].map(() => joint(body));
    [this.tail, this.tailMesh] = joint(body);

    const head = new THREE.Group();
    head.position.y = NECK;
    body.add(head);
    this.head = head;
    this.headMesh = mesh(head);
    // 自己畫的臉：64 × 64 的貼圖，透明的格子不畫
    this.faceData = new Uint8Array(FACE * FACE * 4);
    this.faceTex = new THREE.DataTexture(this.faceData, FACE, FACE);
    this.faceTex.magFilter = this.faceTex.minFilter = THREE.NearestFilter;
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceMat = new THREE.MeshLambertMaterial({ map: this.faceTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    this.decal = new THREE.Mesh(EMPTY, this.faceMat);
    this.decal.visible = false;
    head.add(this.decal);
    // 太空衣的頭盔：半透明的玻璃球罩住整顆頭
    this.glassMat = new THREE.MeshLambertMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.28, depthWrite: false });
    this.glass = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), this.glassMat);
    this.glass.visible = false;
    head.add(this.glass);

    this.hat = new THREE.Group();
    this.hat.rotation.z = -0.12;
    head.add(this.hat);
    this.hatMesh = mesh(this.hat);
    this.prop = mesh(this.hat);
    this.prop.position.y = 0.23;

    // 手和腳用 pivot 讓它們能擺動
    const pivot = (y) => {
      const p = new THREE.Group();
      p.position.y = y;
      body.add(p);
      return p;
    };
    this.armL = pivot(0.72);
    this.armR = pivot(0.72);
    this.armL.rotation.z = -ARM_OUT;
    this.armR.rotation.z = ARM_OUT;
    // 先往前擺（x）再往內收（y），手才能在胸前水平地合起來
    this.armL.rotation.order = this.armR.rotation.order = 'YXZ';
    // 腿從屁股的關節往下垂，鞋子跟著腿一起擺
    this.footL = pivot(HIP);
    this.footR = pivot(HIP);
    this.limbs = [this.armL, this.armR, this.footL, this.footR].map(mesh);
    // 左手拿的東西：每一幀抵銷手臂的轉動，一直保持直立。右手留給點心
    this.handG = new THREE.Group();
    this.handG.position.y = -0.33;
    this.handG.rotation.order = 'ZXY';
    this.armL.add(this.handG);
    this.handMesh = mesh(this.handG);
    this.handK = 0;

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);

    this.shadow = shadow;
    this.group = g;
    this.body = body;
    this.phase = 0;
    this.time = 0;
    this.jumpY = 0;
    this.jumpV = 0;
    this.act = null;               // 正在做的表情動作 { e, t }
    this.sitting = false;
    this.sitP = 0;                 // 坐下的進度：0 站著、1 坐好，站起來時倒著走
    this.lift = 0;                 // 坐的地方離地多高
    this.food = 0;                 // 手上的點心種類，0 是空手
    this.bites = 0;
    this.foodMesh = null;
    this.holdK = 0;
    this.biteT = 0;
    this.key = null;
    this.setLook(look);
  }

  // 換外觀：整個重建。外觀一樣就不動
  setLook(look) {
    const L = sanitizeLook(look), key = lookKey(L);
    if (key === this.key) return;
    this.key = key;
    this.look = L;
    const race = raceOf(L), S = sizes(L), skin = hex(SKINS[L.skin]), W = S.W;
    this.S = S;
    swap(this.torso, bodyGeo(L, W));
    swap(this.headMesh, headGeo(L, race, S, skin));
    this.head.scale.setScalar(S.hs);

    // 戴了頭套或頭盔就不戴帽子
    const hooded = HOODED.includes(L.one);
    const hat = hooded ? { main: null, prop: null } : hatGeo(L);
    swap(this.hatMesh, hat.main);
    swap(this.prop, hat.prop);
    this.glass.visible = L.one === 'astronaut';
    this.glass.position.set(0, race.top - 0.12, 0.02);
    this.glass.scale.setScalar(0.31 * race.hs);
    this.hatY = race.top;
    this.hat.position.y = race.top;
    this.hat.scale.setScalar(race.hs);

    const [aL, aR, fL, fR] = this.limbs, sh = 0.07 + 0.17 * W;
    this.armL.position.x = -sh;
    this.armR.position.x = sh;
    swap(aL, armGeo(L, W, skin));
    swap(aR, armGeo(L, W, skin));
    const fx = 0.09 * Math.max(0.75, W);
    this.footL.position.x = -fx;
    this.footR.position.x = fx;
    swap(fL, legGeo(L, W, skin, -1));
    swap(fR, legGeo(L, W, skin, 1));

    swap(this.scarfTail, L.neck === 'scarf' ? build((k) => k.box(0.08, 0.28, 0.04, hex(CLOTH[L.neckC]), 0, 0, 0)) : null);
    this.scarfTail.position.set(0.08, 0.68, -0.17 * W);
    swap(this.capeMesh, capeGeo(L, W));
    this.cape.position.set(...capeAt(W));
    this.wings.forEach(([p, m], i) => {
      const side = i ? 1 : -1;
      swap(m, wingGeo(L, side));
      p.position.set(...wingAt(W, side));
    });
    this.flaps = hasWings(L);
    swap(this.tailMesh, tailGeo(L, skin));
    this.tail.position.set(...tailAt(W));
    swap(this.handMesh, handGeo(L));
    this.handPose = HAND_POSE[L.hand] || null;

    if (race.id !== this.faceRace) {
      this.faceRace = race.id;
      swap(this.decal, decalGeo(faceMap(race)));
    }
    this.paintFace(decodeFace(L.face));

    // 照鏡子時鏡頭要知道臉和頭頂在哪
    // 頭頂算到帽尖。舉高的雨傘、氣球不算，手機上要全身入鏡，傘頂切掉一點沒關係
    const H = S.H, hs = S.hs, head = race.top + (hooded ? 0.15 : HAT_H[L.hat] ?? 0.1) * race.hs;
    this.dims = {
      faceY: H * (NECK + hs * (race.ey + S.fy)),
      topY: H * (NECK + hs * head),
      headH: H * hs * head,
    };
    this.shadowS = Math.max(0.85, W) * H;
  }

  // 自己畫的臉。畫的途中每一筆都直接更新貼圖，不用整個重建
  paintFace(cells) {
    const d = this.faceData;
    let any = false;
    for (let r = 0; r < FACE; r++) {
      for (let c = 0; c < FACE; c++) {
        const v = cells ? cells[r * FACE + c] : 0, o = ((FACE - 1 - r) * FACE + c) * 4;
        if (v) {
          const rgb = INK_RGB[v];
          d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
          any = true;
        } else d[o + 3] = 0;
      }
    }
    this.faceTex.needsUpdate = true;
    this.decal.visible = any && this.decal.geometry !== EMPTY;
  }

  dispose() {
    this.hold(0);
    this.group.traverse((o) => { if (o.geometry && o.geometry !== EMPTY) o.geometry.dispose(); });
    this.mat.dispose();
    this.faceMat.dispose();
    this.faceTex.dispose();
    this.glassMat.dispose();
    this.shadow.material.dispose();   // 影子的貼圖是共用的，不丟
  }

  // 照鏡子時太靠近淡出成半透明
  setGhost(alpha) {
    if (this._ghost === alpha) return;
    this._ghost = alpha;
    const faded = alpha < 0.99;
    // transparent 換了要重編著色器，不然不透明的版本會把 alpha 固定成 1，看不出淡出
    if (this.mat.transparent !== faded) {
      this.mat.transparent = faded;
      this.mat.depthWrite = !faded;
      this.mat.needsUpdate = true;
      this.faceMat.transparent = faded;
      this.faceMat.depthWrite = !faded;
      this.faceMat.alphaTest = faded ? 0.05 : 0.5;
      this.faceMat.needsUpdate = true;
      this.shadow.visible = !faded;
    }
    this.mat.opacity = alpha;
    this.faceMat.opacity = alpha;
    this.glassMat.opacity = 0.28 * alpha;
    if (this.foodMesh) {
      this.foodMesh.traverse((m) => {
        if (m.isMesh) {
          if (m.material.transparent !== faded) m.material.needsUpdate = true;
          m.material.transparent = faded;
          m.material.depthWrite = !faded;
          m.material.opacity = alpha;
        }
      });
    }
  }

  // 拿起點心。kind 為 0 就是空手
  hold(kind, bites = 0) {
    if (this.foodMesh) {
      this.armR.remove(this.foodMesh);
      this.foodMesh.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      this.foodMesh = null;
    }
    this.food = kind;
    this.bites = bites;
    if (!kind) return;
    this.foodMesh = foodModel(kind);
    this.foodMesh.position.set(0, -0.37, 0.07);
    this.armR.add(this.foodMesh);
    this.foodMesh.scale.setScalar(1 - bites * 0.28);
  }

  // 咬一口，咬完最後一口手上就空了
  bite() {
    if (!this.food) return;
    this.biteT = BITE_TIME;
    this.bites++;
    if (this.bites >= BITES) setTimeout(() => this.hold(0), BITE_TIME * 500);
    else this.foodMesh.scale.setScalar(1 - this.bites * 0.28);
  }

  // 傳給別人的狀態
  get foodCode() {
    return this.food ? this.food * 10 + Math.min(this.bites, BITES - 1) : 0;
  }

  setFoodCode(f) {
    if (f === this.foodCode) return;
    const kind = Math.floor(f / 10), bites = f % 10;
    if (kind === this.food && bites > this.bites) { this.bites = bites - 1; this.bite(); }
    else this.hold(kind, bites);
  }

  // 已經在空中就不再跳，回傳有沒有起跳
  jump() {
    if (this.airborne) return false;
    this.jumpV = JUMP_V;
    return true;
  }

  get airborne() {
    return this.jumpY > 0 || this.jumpV > 0;
  }

  emote(e) {
    this.act = { e, t: 0 };
  }

  // 摸動物：小動物彎腰伸手往下摸，乳牛手往前上方伸
  pet(high) {
    this.act = { e: 'pet', t: 0, high, dur: PET_TIME };
  }

  // 還有動畫在播（跳躍、表情），主迴圈不能降幀
  get busy() {
    return this.airborne || !!this.act || this.biteT > 0 || this.sitP !== (this.sitting ? 1 : 0);
  }

  update(dt, speed) {
    this.time += dt;
    const walking = speed > 0.1;
    const target = walking ? 1 : 0;
    this.walk = (this.walk ?? 0) + (target - (this.walk ?? 0)) * Math.min(1, dt * 8);
    this.phase += dt * (4 + speed * 3.5) * this.walk;

    const s = Math.sin(this.phase), w = this.walk;
    this.body.position.y = Math.abs(s) * 0.06 * w;
    this.body.rotation.x = 0.08 * w;
    this.body.rotation.z = s * 0.04 * w;
    this.armL.rotation.x = s * 0.7 * w;
    this.armR.rotation.x = -s * 0.7 * w;
    this.footL.rotation.x = -s * 0.45 * w;
    this.footR.rotation.x = s * 0.45 * w;
    this.footL.position.z = this.footR.position.z = 0;

    // 站著時輕輕呼吸，帽子跟著晃
    const breath = Math.sin(this.time * 2.2) * (1 - w);
    const H = this.S.H;
    this.body.scale.set(H, H * (1 + breath * 0.015), H);
    this.hat.rotation.z = -0.12 + Math.sin(this.time * 1.7) * 0.04 * (1 - w) + s * 0.06 * w;
    this.scarfTail.rotation.x = 0.2 + w * 0.5 + Math.sin(this.time * 6) * 0.08 * w;
    // 竹蜻蜓一直轉，走路時轉更快
    if (this.prop.visible) this.prop.rotation.y += dt * (5 + w * 12);
    // 披風走路時往後飄，往下掉的時候整片掀起來；翅膀慢慢搧，走路搧快一點；尾巴左右甩
    if (this.capeMesh.visible) this.cape.rotation.x = 0.22 + w * 0.4 + Math.sin(this.time * 5) * 0.04 * w + Math.min(0.6, Math.max(0, -this.jumpV) * 0.1);
    if (this.flaps) {
      const f = 0.35 + Math.sin(this.time * (2 + 5 * w)) * 0.25;
      this.wings[0][0].rotation.y = -f;
      this.wings[1][0].rotation.y = f;
    }
    if (this.tailMesh.visible) this.tail.rotation.z = Math.sin(this.time * 3) * 0.25 + s * 0.2 * w;
    this.body.rotation.y = 0;
    this.hat.position.y = this.hatY;
    this.armL.rotation.z = -ARM_OUT;
    this.armR.rotation.z = ARM_OUT;
    this.armL.rotation.y = this.armR.rotation.y = 0;
    this.armL.position.z = this.armR.position.z = 0;
    this.footL.position.y = this.footR.position.y = HIP;

    // 坐下的過程：身體前傾、雙手往後撐，屁股坐下去，再把腳伸到前面、手放到腿上、往後靠。
    // 站起來時同一段倒著播
    this.sitP = clamp01(this.sitP + (this.sitting ? dt : -dt) / SIT_TIME);
    const p = this.sitP;
    const lower = smooth(clamp01((p - 0.15) / 0.6));     // 身體往下（或坐上長椅）
    const tuck = smooth(clamp01((p - 0.45) / 0.55));     // 腳伸到前面、手收到腿上
    const brace = Math.sin(p * Math.PI);                 // 半路的前傾和撐手
    if (p > 0) {
      const L = this.armL.rotation, R = this.armR.rotation, B = this.body.rotation;
      const k = clamp01(p * 4);
      // 坐地上兩腿伸直平放，坐長椅腿往前斜斜垂著
      const legX = this.lift > 0.2 ? -1.0 : -1.5;
      for (const f of [this.footL, this.footR]) f.rotation.x += (legX - f.rotation.x) * tuck;
      const ax = 0.45 + (-0.5 - 0.45) * tuck, az = ARM_OUT + 0.25 * (1 - tuck);
      L.x += (ax - L.x) * k; L.z += (-az - L.z) * k;
      R.x += (ax - R.x) * k; R.z += (az - R.z) * k;
      B.x += (0.35 * brace - 0.06 * tuck - B.x) * k;
    }
    const sk = lower;

    // 左手拿著東西：垂著的照樣小幅擺動，拿在胸前的手往前抬，雨傘這種舉過頭
    this.handK += ((this.handPose ? 1 : 0) - this.handK) * Math.min(1, dt * 8);
    if (this.handPose && this.handK > 0.001) {
      const A = this.armL.rotation, hk = this.handK;
      const tx = this.handPose === 'up' ? -2.6 : this.handPose === 'hold' ? -0.75 : A.x * 0.4;
      A.x += (tx - A.x) * hk;
      if (this.handPose !== 'hang') A.z += (-0.1 - A.z) * hk;
    }

    // 拿著點心時右手舉在胸前，咬一口時送到嘴邊
    this.holdK += ((this.food ? 1 : 0) - this.holdK) * Math.min(1, dt * 8);
    if (this.holdK > 0.001) {
      const R = this.armR.rotation;
      R.x += (-0.95 - R.x) * this.holdK;
      R.z += (0.05 - R.z) * this.holdK;
    }
    if (this.biteT > 0) {
      this.biteT = Math.max(0, this.biteT - dt);
      const b = Math.sin((1 - this.biteT / BITE_TIME) * Math.PI);
      // 從前方繞到嘴邊：肩膀往前，手抬得越高才越往內收，上下的半路都不會擦到胸口
      const R = this.armR.rotation;
      R.x += (-2.12 - R.x) * b;
      const up = Math.min(1, Math.max(0, (-R.x - 0.95) / 1.17)) ** 3;
      R.y += (-0.92 - R.y) * up;
      R.z += (0.05 - R.z) * up;
      this.armR.position.z = 0.08 * b;
    }

    if (this.airborne) {
      this.jumpV -= GRAVITY * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0) this.jumpV = 0;
    }
    // 呼叫端已經把 group 放在地面高度，這裡再加上跳躍和坐下的位移
    // 坐長椅時屁股比站著還高，順勢小跳一下坐上去
    // 坐地上時整個人再往下沉，腿從屁股伸出去才會貼著地
    const hop = this.lift > 0.2 ? Math.sin(lower * Math.PI) * 0.1 : 0;
    const up = this.jumpY + (this.lift > 0.2 ? this.lift - 0.1 : -0.24) * lower + hop;
    this.group.position.y += up;
    // 影子留在地面，越高越小
    this.shadow.position.y = 0.012 - up;
    this.shadow.scale.setScalar((1 - Math.min(0.4, this.jumpY * 0.5)) * this.shadowS);

    if (this.act) this.pose(dt, Math.max(w, sk));
    // 手上的東西抵銷手臂的轉動，不管手怎麼擺都直立
    const A = this.armL.rotation;
    this.handG.rotation.set(-A.x, -A.y, -A.z);
  }

  // 表情動作疊在走路動作上面。走路時只動手，站著時整個身體一起演
  pose(dt, walk) {
    const a = this.act;
    a.t += dt;
    const t = a.t, dur = a.dur || ACT_TIME;
    if (t >= dur) { this.act = null; return; }
    const k = smooth(Math.min(1, t / 0.15, (dur - t) / 0.25));
    const kb = k * (1 - walk);
    const L = this.armL.rotation, R = this.armR.rotation, B = this.body.rotation;
    const arms = (lx, lz, rx, rz) => {
      L.x += (lx - L.x) * k; L.z += (lz - L.z) * k;
      R.x += (rx - R.x) * k; R.z += (rz - R.z) * k;
    };
    // 雙手要在身體前面合起來的動作：肩膀往前收，手臂往前抬 x、往內收 y，張開角 z。左右對稱
    const front = (x, y, z) => {
      arms(x, -z, x, z);
      L.y += (y - L.y) * k;
      R.y += (-y - R.y) * k;
      this.armL.position.z = this.armR.position.z = 0.08 * k;
    };
    switch (a.e) {
      case '👋':
        arms(L.x, L.z, -0.25, 2.5 + Math.sin(t * 12) * 0.35);
        B.z += -0.06 * kb;
        break;
      case '👏': {
        const open = Math.abs(Math.sin(t * Math.PI * 3)) * 0.3;
        front(-1.82, 0.675 - open, 0.1);
        B.x += 0.06 * kb;
        break;
      }
      case '❤️':
        front(-1.26, 0.675, 0.2);
        B.x += 0.12 * kb;
        B.z += Math.sin(t * 4) * 0.08 * kb;
        break;
      case '✨':
        arms(-0.3, -2.4, -0.3, 2.4);
        // 原地轉一圈，像施法
        B.y = smooth(Math.min(1, t / 0.8)) * Math.PI * 2 * (1 - walk);
        this.hat.rotation.z -= Math.sin(Math.min(1, t / 0.8) * Math.PI) * 0.3 * kb;
        break;
      case '😮':
        front(-2.38, 0.875, 0.28);
        B.x += -0.25 * kb;
        this.hat.position.y += Math.max(0, Math.sin(Math.min(1, t / 0.35) * Math.PI)) * 0.1 * kb;
        break;
      case 'pet': {
        // 右手來回順毛
        const s = Math.sin(t * 6) * 0.18;
        if (a.high) arms(L.x, L.z, -1.9 + s, 0.12);
        else {
          arms(L.x, L.z, -0.5 + s, 0.12);
          B.x += 0.5 * kb;
        }
        break;
      }
    }
  }
}
