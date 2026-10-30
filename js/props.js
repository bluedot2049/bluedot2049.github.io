// 家具：全部用基本形狀組成。每件家具的原點在地面中央，正面朝 +z，背面靠牆。
// 同一間房的家具最後會合併成少數幾個網格，手機才畫得動。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// 依字串產生固定的亂數，同一間房每次載入擺設都一樣
export function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const PAINT = ['#c8553d', '#e0a458', '#f2d0a4', '#588b8b', '#2f4858', '#8e5572', '#d4b483', '#6b9080', '#e4572e', '#f3a712'];
const BOOK = ['#7a2e2e', '#2e4a62', '#4a5d3a', '#8a6a2e', '#5a3a5a', '#3a3a3a', '#a0522d', '#c9b27a', '#2f5d62'];
const LIQUID = ['#66ffcc', '#ff7ad9', '#ffcc44', '#7fb2ff', '#b6ff66'];
const FABRIC = ['#9a4a3a', '#4a6a5a', '#c08a4a', '#5a5a8a', '#7a5a3a'];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// color 給 null：幾何自己已經塗好顏色（像一片一片瓦的屋頂），照原樣用
function paint(geo, color, color2) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (color == null && g.attributes.color) return g;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(color), c2 = color2 ? new THREE.Color(color2) : null;
  let minY = Infinity, maxY = -Infinity;
  if (c2) for (let i = 0; i < pos.count; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const c = c2 ? tmp.copy(c1).lerp(c2, (pos.getY(i) - minY) / (maxY - minY || 1)) : c1;
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 一件家具的零件清單
export class Kit {
  constructor(R) {
    this.R = R;
    this.lit = [];
    this.glow = [];
    this.glows = [];   // 光暈位置
    this.puffs = [];   // 冒煙、冒蒸氣的地方
    this.pools = [];   // 燈照在地上的一圈光
  }
  add(geo, color, x, y, z, o = {}) {
    const g = paint(geo, color, o.color2);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(o.sx || 1, o.sy || 1, o.sz || 1));
    g.applyMatrix4(_m);
    if (o.ao === false) g.userData.noAO = true;
    (o.glow ? this.glow : this.lit).push(g);
    return this;
  }
  box(w, h, d, c, x, y, z, o) { return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, o); }
  cyl(rt, rb, h, c, x, y, z, o, seg = 8) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, o); }
  ball(r, c, x, y, z, o) { return this.add(new THREE.IcosahedronGeometry(r, 1), c, x, y, z, o); }
  rock(r, c, x, y, z, o) { return this.add(new THREE.IcosahedronGeometry(r, 0), c, x, y, z, o); }
  cone(r, h, c, x, y, z, o) { return this.add(new THREE.ConeGeometry(r, h, 7), c, x, y, z, o); }
  torus(r, t, arc, c, x, y, z, o) { return this.add(new THREE.TorusGeometry(r, t, 5, 12, arc), c, x, y, z, o); }
  plane(w, h, c, x, y, z, o) { return this.add(new THREE.PlaneGeometry(w, h), c, x, y, z, o); }
  light(x, y, z, color, size) { this.glows.push({ x, y, z, color, size }); return this; }
  puff(x, y, z, kind = 'steam', s = 1) { this.puffs.push({ x, y, z, kind, s }); return this; }
  pool(x, y, z, r, color = '#ff9a50', a = 0.3) { this.pools.push({ x, y, z, r, color, a }); return this; }

  // 套用擺放位置，把零件倒進桶子
  emit(bucket, x, z, rotY) {
    _m.makeRotationY(rotY).setPosition(x, 0, z);
    for (const g of this.lit) bucket.lit.push(g.applyMatrix4(_m));
    for (const g of this.glow) bucket.glow.push(g.applyMatrix4(_m));
    const v = new THREE.Vector3();
    for (const [src, dst] of [[this.glows, bucket.glows], [this.puffs, bucket.puffs], [this.pools, bucket.pools]]) {
      for (const l of src) {
        v.set(l.x, l.y, l.z).applyMatrix4(_m);
        dst.push({ ...l, x: v.x, y: v.y, z: v.z });
      }
    }
  }
}

export function newBucket() {
  return { lit: [], glow: [], glows: [], puffs: [], pools: [] };
}

// 合併成一個幾何。靠近地面的頂點稍微壓暗，當作簡單的環境光遮蔽。零件帶 ao: false 的不壓（遠處山坡上的樹）
export function mergeBucket(list, ao = true) {
  if (!list.length) return null;
  if (ao) {
    for (const g of list) {
      if (g.userData.noAO) continue;
      const pos = g.attributes.position, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const f = 0.62 + 0.38 * Math.min(1, Math.max(0, pos.getY(i)) / 1.1);
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
  }
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

// ---------------- 家具 ----------------
// w：沿牆寬度、d：深度、h：高度、tall：高家具在牆降下時一起隱藏

export const PROPS = {
  easel: { w: 0.9, d: 0.7, h: 1.9, tall: true, build(k) {
    const R = k.R, wood = '#9a6b42';
    k.box(0.05, 1.9, 0.05, wood, -0.28, 0.95, 0.1, { rz: -0.1 });
    k.box(0.05, 1.9, 0.05, wood, 0.28, 0.95, 0.1, { rz: 0.1 });
    k.box(0.05, 1.8, 0.05, wood, 0, 0.9, -0.1, { rx: 0.3 });
    k.box(0.8, 0.04, 0.14, wood, 0, 0.8, 0.15);
    const cw = 0.55 + R() * 0.3, ch = 0.5 + R() * 0.4, cy = 0.82 + ch / 2;
    k.box(cw, ch, 0.035, '#efe6d2', 0, cy, 0.12, { rx: -0.08 });
    for (let i = 0; i < 4 + R() * 4; i++) {
      const sw = 0.08 + R() * 0.25, sh = 0.04 + R() * 0.2;
      const x = (R() - 0.5) * (cw - sw), y = cy + (R() - 0.5) * (ch - sh);
      k.box(sw, sh, 0.01, pick(R, PAINT), x, y, 0.145 - (y - cy) * 0.08, { rx: -0.08 });
    }
    k.box(0.12, 0.05, 0.06, wood, 0, 0.85 + ch, 0.1);
  } },

  canvasStack: { w: 1.0, d: 0.45, h: 1.1, build(k) {
    const R = k.R, n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const cw = 0.45 + R() * 0.5, ch = 0.4 + R() * 0.6, a = -0.14 - R() * 0.1;
      const z = -0.12 + i * 0.07 + (ch / 2) * Math.sin(a);
      k.box(cw, ch, 0.03, R() < 0.35 ? '#e8dcc0' : pick(R, PAINT), (R() - 0.5) * 0.15, (ch / 2) * Math.cos(a), z, { rx: a });
    }
  } },

  worktable: { w: 1.5, d: 0.75, h: 1.2, build(k) {
    const R = k.R, wood = '#8a5a36', dark = '#5e3b22';
    k.box(1.5, 0.06, 0.72, wood, 0, 0.86, 0);
    for (const x of [-0.68, 0.68]) for (const z of [-0.3, 0.3]) k.box(0.06, 0.83, 0.06, dark, x, 0.415, z);
    k.box(1.4, 0.03, 0.6, dark, 0, 0.22, 0);
    for (let i = 0; i < 3 + R() * 4; i++) {
      const r = 0.04 + R() * 0.04, h = 0.08 + R() * 0.12;
      k.cyl(r, r, h, pick(R, PAINT), -0.65 + R() * 0.7, 0.89 + h / 2, -0.28 + R() * 0.5);
    }
    const bx = 0.25 + R() * 0.2, bz = -0.15;
    k.cyl(0.05, 0.045, 0.14, '#c9b28a', bx, 0.96, bz);
    for (let i = 0; i < 4; i++) {
      const dx = (R() - 0.5) * 0.05, dz = (R() - 0.5) * 0.05;
      k.cyl(0.008, 0.008, 0.32, '#a0703a', bx + dx, 1.06, bz + dz, { rz: -dx * 4, rx: dz * 4 }, 5);
    }
    const px = 0.5, pz = 0.12;
    k.cyl(0.2, 0.2, 0.015, '#d9c49a', px, 0.895, pz, {}, 12);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2;
      k.cyl(0.03, 0.03, 0.012, pick(R, PAINT), px + Math.cos(a) * 0.12, 0.905, pz + Math.sin(a) * 0.12, {}, 6);
    }
    k.box(0.25, 0.02, 0.2, '#d8d0c0', -0.2, 0.9, 0.2, { ry: 0.4 });
    for (let i = 0; i < 2 + R() * 3; i++) k.box(0.3, 0.05, 0.22, pick(R, BOOK), -0.4, 0.26 + i * 0.05, 0, { ry: (R() - 0.5) * 0.4 });
  } },

  stool: { w: 0.5, d: 0.5, h: 0.62, build(k) {
    const R = k.R;
    k.cyl(0.2, 0.2, 0.05, '#8a5a36', 0, 0.6, 0, {}, 10);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094 + 0.5, c = Math.cos(a), s = Math.sin(a);
      k.cyl(0.02, 0.025, 0.6, '#6b4329', c * 0.13, 0.3, s * 0.13, { rz: c * 0.15, rx: -s * 0.15 }, 5);
    }
    if (R() < 0.5) k.box(0.22, 0.03, 0.18, '#d8d0c0', 0, 0.64, 0, { ry: R() });
  } },

  plant: { w: 0.6, d: 0.6, h: 1.1, build(k) {
    const R = k.R;
    k.cyl(0.2, 0.15, 0.32, '#b5643c', 0, 0.16, 0);
    k.cyl(0.22, 0.22, 0.05, '#a0552f', 0, 0.32, 0);
    const greens = ['#4f7a3a', '#5f8f45', '#3e6a35', '#6f9a50'];
    if (R() < 0.5) {
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8 + R(), rr = 0.05 + R() * 0.15;
        k.rock(0.14 + R() * 0.08, pick(R, greens), Math.cos(a) * rr, 0.45 + R() * 0.55, Math.sin(a) * rr, { sy: 0.5 + R() * 0.5, sz: 0.6, ry: a });
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + R(), h = 0.5 + R() * 0.5;
        k.cone(0.05, h, pick(R, greens), Math.cos(a) * 0.08, 0.32 + h / 2, Math.sin(a) * 0.08, { rx: Math.sin(a) * 0.2, rz: -Math.cos(a) * 0.2 });
      }
    }
  } },

  crate: { w: 0.7, d: 0.6, h: 0.6, build(k) {
    const R = k.R;
    const one = (y, s, ry) => {
      k.box(0.62 * s, 0.5 * s, 0.52 * s, '#a87b4f', 0, y + 0.25 * s, 0, { ry });
      k.box(0.64 * s, 0.06 * s, 0.54 * s, '#8a6038', 0, y + 0.08 * s, 0, { ry });
      k.box(0.64 * s, 0.06 * s, 0.54 * s, '#8a6038', 0, y + 0.42 * s, 0, { ry });
    };
    one(0, 1, 0);
    let top = 0.5;
    if (R() < 0.45) { one(0.5, 0.75, (R() - 0.5) * 0.6); top = 0.875; }
    if (R() < 0.6) k.cyl(0.04, 0.05, 0.22, pick(R, ['#3d6b4a', '#6a3a2a', '#c9b27a']), 0.12, top + 0.11, 0.05);
  } },

  bookshelf: { w: 1.2, d: 0.4, h: 2.1, tall: true, build(k) {
    const R = k.R, wood = '#5a3a24';
    for (const x of [-0.58, 0.58]) k.box(0.04, 2.1, 0.38, wood, x, 1.05, 0);
    k.box(1.2, 2.1, 0.02, '#3e2818', 0, 1.05, -0.18);
    const ys = [0.04, 0.5, 0.95, 1.4, 1.85];
    for (const y of [...ys, 2.08]) k.box(1.16, 0.03, 0.36, wood, 0, y, 0);
    for (const sy of ys) {
      let x = -0.55;
      while (x < 0.5) {
        if (R() < 0.07) { x += 0.08 + R() * 0.12; continue; }
        const bw = 0.03 + R() * 0.05, bh = 0.2 + R() * 0.17;
        if (x + bw > 0.55) break;
        const lean = R() < 0.06 ? 0.25 : 0;
        k.box(bw, bh, 0.24 + R() * 0.08, pick(R, BOOK), x + bw / 2 + lean * 0.3 * bh, sy + 0.015 + bh / 2, 0, { rz: -lean });
        x += bw + 0.004 + lean * 0.2;
      }
    }
    if (R() < 0.6) { k.cyl(0.06, 0.06, 0.12, '#e8dcc0', 0.3, 2.16, 0); k.light(0.3, 2.3, 0.05, '#ffcf8a', 0.6); }
  } },

  armchair: { w: 1.0, d: 0.9, h: 1.0, build(k) {
    const R = k.R, f = pick(R, FABRIC), f2 = new THREE.Color(f).multiplyScalar(1.15).getStyle();
    k.box(0.9, 0.36, 0.8, f, 0, 0.26, 0.02);
    for (const x of [-0.38, 0.38]) for (const z of [-0.3, 0.34]) k.box(0.06, 0.1, 0.06, '#3a2414', x, 0.05, z);
    k.box(0.64, 0.12, 0.62, f2, 0, 0.5, 0.08);
    k.box(0.9, 0.66, 0.2, f, 0, 0.74, -0.3, { rx: -0.12 });
    for (const x of [-0.38, 0.38]) k.box(0.14, 0.28, 0.8, f, x, 0.58, 0.02);
    k.box(0.34, 0.3, 0.1, pick(R, PAINT), 0.12, 0.7, -0.14, { rx: -0.3, rz: 0.25 });
  } },

  floorLamp: { w: 0.5, d: 0.5, h: 1.75, tall: true, build(k) {
    k.cyl(0.16, 0.18, 0.04, '#3a2a1a', 0, 0.02, 0, {}, 10);
    k.cyl(0.015, 0.015, 1.5, '#b08a45', 0, 0.77, 0, {}, 5);
    k.cyl(0.12, 0.26, 0.3, '#ffdca8', 0, 1.6, 0, { glow: true, color2: '#ffefd0' }, 10);
    k.light(0, 1.5, 0, '#ffcf8a', 2.2);
  } },

  flaskTable: { w: 1.4, d: 0.7, h: 1.2, build(k) {
    const R = k.R, wood = '#4a3020';
    k.box(1.4, 0.06, 0.66, wood, 0, 0.86, 0);
    for (const x of [-0.63, 0.63]) for (const z of [-0.27, 0.27]) k.box(0.07, 0.83, 0.07, '#3a2418', x, 0.415, z);
    for (let i = 0; i < 4; i++) {
      const x = -0.55 + i * 0.3 + (R() - 0.5) * 0.1, z = (R() - 0.5) * 0.3, liq = pick(R, LIQUID);
      if (R() < 0.6) {
        const r = 0.07 + R() * 0.04;
        k.ball(r, liq, x, 0.89 + r, z, { glow: true });
        k.cyl(0.022, 0.022, 0.12, '#cfe6e0', x, 0.89 + r * 2 + 0.05, z, {}, 6);
        k.light(x, 0.89 + r, z, liq, 0.5);
      } else {
        k.cyl(0.04, 0.05, 0.22, liq, x, 1.0, z, { glow: true }, 6);
        k.cyl(0.018, 0.018, 0.06, '#8a6a4a', x, 1.14, z, {}, 5);
      }
    }
    k.cyl(0.03, 0.03, 0.12, '#f2ead8', 0.5, 0.95, 0.2, {}, 6);
    k.cone(0.015, 0.04, '#ffcf6a', 0.5, 1.03, 0.2, { glow: true });
    k.light(0.5, 1.05, 0.2, '#ffb347', 0.7);
    k.box(0.36, 0.015, 0.26, '#6a2a2a', -0.25, 0.895, 0.15, { ry: 0.2 });
    k.box(0.34, 0.02, 0.24, '#efe2c4', -0.25, 0.91, 0.15, { ry: 0.2 });
  } },

  bottleShelf: { w: 1.2, d: 0.4, h: 2.0, tall: true, build(k) {
    const R = k.R, wood = '#4a3020';
    for (const x of [-0.58, 0.58]) k.box(0.04, 2.0, 0.38, wood, x, 1.0, 0);
    k.box(1.2, 2.0, 0.02, '#32200f', 0, 1.0, -0.18);
    const ys = [0.04, 0.52, 1.0, 1.48];
    for (const y of [...ys, 1.98]) k.box(1.16, 0.03, 0.36, wood, 0, y, 0);
    for (const sy of ys) {
      let x = -0.48;
      while (x < 0.48) {
        const liq = pick(R, LIQUID), glow = R() < 0.4;
        if (R() < 0.5) {
          const r = 0.05 + R() * 0.04;
          k.ball(r, glow ? liq : '#7a8a7a', x, sy + 0.015 + r, 0, { glow });
          k.cyl(0.015, 0.015, 0.08, '#cfe6e0', x, sy + 0.015 + r * 2 + 0.03, 0, {}, 5);
          x += r * 2 + 0.06;
        } else {
          const h = 0.15 + R() * 0.15;
          k.cyl(0.04, 0.04, h, glow ? liq : pick(R, ['#5a4a3a', '#3d5a4a', '#6a5a7a']), x, sy + 0.015 + h / 2, 0, { glow }, 6);
          x += 0.12;
        }
        if (glow && R() < 0.3) k.light(x - 0.06, sy + 0.12, 0.05, liq, 0.4);
      }
    }
  } },

  cauldron: { w: 0.9, d: 0.9, h: 0.8, build(k) {
    const R = k.R;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      k.box(0.06, 0.15, 0.06, '#222226', Math.cos(a) * 0.26, 0.07, Math.sin(a) * 0.26);
    }
    k.ball(0.4, '#2b2b30', 0, 0.38, 0, { sy: 0.8 });
    k.torus(0.33, 0.045, Math.PI * 2, '#3a3a42', 0, 0.62, 0, { rx: Math.PI / 2 });
    k.cyl(0.32, 0.32, 0.02, '#7dffb0', 0, 0.61, 0, { glow: true }, 12);
    for (let i = 0; i < 3; i++) k.ball(0.03 + R() * 0.03, '#b8ffd8', (R() - 0.5) * 0.4, 0.63, (R() - 0.5) * 0.4, { glow: true });
    k.light(0, 0.8, 0, '#7dffb0', 2.2);
  } },

  booksPile: { w: 0.5, d: 0.45, h: 0.4, build(k) {
    const R = k.R;
    let y = 0;
    for (let i = 0; i < 3 + R() * 4; i++) {
      const h = 0.05 + R() * 0.03;
      k.box(0.3 + R() * 0.12, h, 0.22 + R() * 0.08, pick(R, BOOK), (R() - 0.5) * 0.04, y + h / 2, (R() - 0.5) * 0.04, { ry: (R() - 0.5) * 0.6 });
      y += h;
    }
    if (R() < 0.5) {
      k.cyl(0.03, 0.03, 0.1, '#f2ead8', 0, y + 0.05, 0, {}, 6);
      k.cone(0.015, 0.04, '#ffcf6a', 0, y + 0.12, 0, { glow: true });
      k.light(0, y + 0.14, 0, '#ffb347', 0.6);
    }
  } },

  cat: { w: 0.6, d: 0.6, h: 0.3, build(k) {
    const R = k.R, c = pick(R, ['#d9893a', '#8a8a8a', '#2a2622', '#e8d8b8']);
    k.ball(0.22, c, 0, 0.12, 0, { sx: 1.25, sy: 0.55 });
    k.ball(0.12, c, 0.2, 0.14, 0.1, { sy: 0.85 });
    k.cone(0.04, 0.07, c, 0.25, 0.25, 0.05, { rz: -0.3 });
    k.cone(0.04, 0.07, c, 0.2, 0.25, 0.16, { rz: -0.2, rx: 0.3 });
    k.torus(0.2, 0.035, Math.PI * 1.1, c, 0, 0.05, 0, { rx: Math.PI / 2, rz: 0.4 });
  } },
};

// 依房間主題挑家具，數字是出現機率的權重
export const SETS = {
  studio:  { wall: { canvasStack: 3, easel: 2, worktable: 2, plant: 1.5, crate: 1.5, stool: 1, booksPile: 0.7 },
             inside: ['easel', 'stool', 'cat', 'booksPile', 'crate'] },
  library: { wall: { bookshelf: 4, armchair: 1.5, floorLamp: 1.5, plant: 1.2, booksPile: 1, crate: 0.6 },
             inside: ['armchair', 'floorLamp', 'cat', 'booksPile', 'plant'] },
  lab:     { wall: { bottleShelf: 3, flaskTable: 2.5, cauldron: 1, crate: 1.5, booksPile: 1, plant: 0.8 },
             inside: ['cauldron', 'crate', 'cat', 'booksPile', 'stool'] },
};

export function weightedPick(R, weights, maxW) {
  const entries = Object.entries(weights).filter(([n]) => PROPS[n].w <= maxW);
  if (!entries.length) return null;
  let t = R() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [n, w] of entries) { if ((t -= w) <= 0) return n; }
  return entries[entries.length - 1][0];
}

// 牆上的窗：木框、窗簾、夕陽色玻璃
export function buildWindow(k, ww = 1.2, wh = 1.3, y0 = 1.0) {
  const wood = '#5e3b22';
  k.plane(ww, wh, '#ffe2a8', 0, y0 + wh / 2, 0.02, { glow: true, color2: '#f08c5a' });
  k.box(ww + 0.12, 0.08, 0.1, wood, 0, y0 + wh + 0.04, 0.05);
  k.box(ww + 0.24, 0.06, 0.2, wood, 0, y0 - 0.03, 0.08);
  for (const x of [-ww / 2 - 0.03, ww / 2 + 0.03]) k.box(0.06, wh, 0.1, wood, x, y0 + wh / 2, 0.05);
  k.box(0.04, wh, 0.05, wood, 0, y0 + wh / 2, 0.04);
  k.box(ww, 0.04, 0.05, wood, 0, y0 + wh * 0.55, 0.04);
  for (const x of [-ww / 2 - 0.16, ww / 2 + 0.16]) k.box(0.18, wh + 0.4, 0.04, '#9a3b2b', x, y0 + wh / 2 - 0.05, 0.08);
  k.cyl(0.1, 0.08, 0.12, '#b5643c', ww * 0.25, y0 + 0.06, 0.08, {}, 7);
  k.rock(0.1, '#5f8f45', ww * 0.25, y0 + 0.18, 0.08);
}
