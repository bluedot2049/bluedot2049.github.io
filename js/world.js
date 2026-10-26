// 依 gallery.json 的順序，把房間一間接一間往 -z 方向排。
// 每間房的入口在 z = zStart，出口在 z = zEnd，門都開在 x = 0。
// 牆分成一段一段（entry），擋住鏡頭和角色之間的那段會自動降成矮牆。
import * as THREE from 'three';
import * as TX from './textures.js';
import { PROPS, SETS, Kit, rng, newBucket, mergeBucket, weightedPick, buildWindow } from './props.js';
import { buildMirror } from './mirror.js';
import { buildOutdoor, OUTDOOR_ROOM } from './outdoor.js';
import { catRoomOf } from './animals.js';

export const WALL_H = 3.2;
export const DOOR_W = 2;
export const DOOR_H = 2.4;
const MARGIN = 0.32;       // 角色半徑
const STUB_H = 0.5;        // 降下後的矮牆高度
const WALL_T = 0.12;
const PAINT_SCALE = 1.5;   // 實際尺寸放大倍數

const ROOM_TYPES = {
  hall:     { w: 8, d: 8 },
  corridor: { w: 5, d: 12 },
  rotunda:  { r: 5, d: 10 },
  outdoor:  { w: 40, d: 62 },   // 深度要蓋到棧橋盡頭，尋路的格子才鋪得到
};

// 每種房型的預設：牆色、家具主題、地毯配色
const DEFAULTS = {
  hall:     { color: '#d9b98c', props: 'studio' },
  corridor: { color: '#9fae8a', props: 'library' },
  rotunda:  { color: '#c98a6e', props: 'lab' },
  outdoor:  { color: '#d9b98c', props: 'studio' },
};
const isFlat = (r) => r.type === 'hall' || r.type === 'corridor';
const RUGS = {
  studio:  ['#8a3b2e', '#e0b062'],
  library: ['#2e4a62', '#d9b98c'],
  lab:     ['#4a2f66', '#e0b062'],
};
const FRAMES = [0x5a3a22, 0xb08a45, 0x2a2220, 0xa87b4f];

export const uTime = { value: 0 };

let S;
function shared() {
  if (S) return S;
  const pr = Math.min(window.devicePixelRatio, 2);
  S = {
    glow: TX.glowTexture(),
    shadow: TX.shadowTexture(),
    beam: TX.beamTexture(),
    floor: TX.floorTexture(),
    stub: new THREE.MeshLambertMaterial({ color: 0x5a3824 }),
    stub2: new THREE.MeshLambertMaterial({ color: 0x5a3824, side: THREE.DoubleSide }),
    cap: new THREE.MeshLambertMaterial({ color: 0x3a2416 }),
    cap2: new THREE.MeshLambertMaterial({ color: 0x3a2416, side: THREE.DoubleSide }),
    door: new THREE.MeshLambertMaterial({ color: 0x6b4329 }),
    lit: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glowMat: new THREE.MeshBasicMaterial({ vertexColors: true }),
    brass: new THREE.MeshLambertMaterial({ color: 0xb08a45, emissive: 0x2a1c08 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
    wire: new THREE.LineBasicMaterial({ color: 0x2a1a10 }),
    frames: FRAMES.map((c) => new THREE.MeshLambertMaterial({ color: c })),
    pr,
  };
  S.shadowMat = new THREE.MeshBasicMaterial({ map: S.shadow, transparent: true, depthWrite: false });
  return S;
}

// ---------- 幾何小工具 ----------

function setUV(geo, u0, u1, v0, v1) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return geo;
}

function tag(mesh, kind) {
  mesh.userData.kind = kind;
  return mesh;
}

function wallPlane(mat, width, y0, y1, cx, cz, rotY) {
  const geo = setUV(new THREE.PlaneGeometry(width, y1 - y0), 0, width / 4, y0 / WALL_H, y1 / WALL_H);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, (y0 + y1) / 2, cz);
  m.rotation.y = rotY;
  return tag(m, 'wall');
}

// 平面牆（可開門）。rotY 決定牆面朝向：法線 = (sin rotY, cos rotY)
function flatWall(out, mat, cx, cz, rotY, width, door) {
  const tx = Math.cos(rotY), tz = -Math.sin(rotY);
  const put = (w, y0, y1, o) => out.push(wallPlane(mat, w, y0, y1, cx + tx * o, cz + tz * o, rotY));
  if (!door) return put(width, 0, WALL_H, 0);
  const side = (width - DOOR_W) / 2, off = DOOR_W / 2 + side / 2;
  put(side, 0, WALL_H, -off);
  put(side, 0, WALL_H, off);
  put(DOOR_W, DOOR_H, WALL_H, 0);
}

function wallBox(mat, w, h, d, cx, y, cz, rotY) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, y, cz);
  m.rotation.y = rotY;
  return tag(m, 'wall');
}

// 矮牆和牆頂飾條
function stubAndCap(e, cx, cz, rotY, width, door) {
  const s = shared(), tx = Math.cos(rotY), tz = -Math.sin(rotY);
  if (door) {
    const side = (width - DOOR_W) / 2, off = DOOR_W / 2 + side / 2;
    for (const o of [-off, off]) e.stub.push(wallBox(s.stub, side, STUB_H, WALL_T, cx + tx * o, STUB_H / 2, cz + tz * o, rotY));
  } else {
    e.stub.push(wallBox(s.stub, width, STUB_H, WALL_T, cx, STUB_H / 2, cz, rotY));
  }
  e.full.push(wallBox(s.cap, width + WALL_T, 0.1, WALL_T + 0.04, cx, WALL_H + 0.05, cz, rotY));
}

function makeEntry(rooms, px, pz, nx, nz, half, outerRoom = null) {
  return { rooms, px, pz, nx, nz, tx: -nz, tz: nx, half, outerRoom, full: [], stub: [], tall: [], paintings: [], faded: false };
}

function doorFrame(e, z) {
  const s = shared(), t = 0.22, depth = 0.5;
  for (const sx of [-1, 1]) e.full.push(wallBox(s.door, t, DOOR_H + t, depth, sx * (DOOR_W / 2 + t / 2), (DOOR_H + t) / 2, z, 0));
  e.full.push(wallBox(s.door, DOOR_W + t * 2, t, depth, 0, DOOR_H + t / 2, z, 0));
}

// 把桶子裡的零件合併成網格
// ghost：靠牆的高家具，牆降下時要能變半透明，所以材質各自一份
function bucketObjects(b, ghost = false) {
  const s = shared(), out = [];
  const mat = (m) => (ghost ? Object.assign(m.clone(), { transparent: true }) : m);
  const lit = mergeBucket(b.lit, true);
  if (lit) out.push(tag(new THREE.Mesh(lit, mat(s.lit)), 'prop'));
  const glow = mergeBucket(b.glow, false);
  if (glow) out.push(tag(new THREE.Mesh(glow, mat(s.glowMat)), 'prop'));
  if (b.glows.length) out.push(glowPoints(b.glows));
  return out;
}

function glowPoints(list) {
  const n = list.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  const c = new THREE.Color();
  list.forEach((g, i) => {
    pos.set([g.x, g.y, g.z], i * 3);
    c.set(g.color);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = g.size;
    phase[i] = Math.random() * 10;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uScale: { value: 150 * shared().pr } },
    vertexShader: `
      uniform float uTime; uniform float uScale;
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      varying vec3 vC; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
        vC = aColor;
        vA = 0.5 + 0.08 * sin(uTime * 7.0 + aPhase) + 0.05 * sin(uTime * 13.0 + aPhase * 2.0);
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.0) * vA;
        gl_FragColor = vec4(vC * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

function dust(room) {
  const count = 30, pos = new Float32Array(count * 3), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 2 - 1) * (room.halfW - 0.5);
    const z = room.zStart - 0.5 - Math.random() * (room.d - 1);
    pos.set([x, 0.4 + Math.random() * 2.4, z], i * 3);
    phase[i] = Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: 40 * shared().pr } },
    vertexShader: `
      uniform float uTime; uniform float uSize;
      attribute float aPhase; varying float vA;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.3 + aPhase) * 0.3;
        p.x += cos(uTime * 0.2 + aPhase * 1.3) * 0.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize / -mv.z;
        gl_Position = projectionMatrix * mv;
        vA = 0.35 + 0.3 * sin(uTime * 1.1 + aPhase * 3.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        gl_FragColor = vec4(1.0, 0.85, 0.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// ---------- 房間 ----------

function lineSpan(entry, ox, oz, dx, dz, nx, nz, length) {
  return { entry, length, occ: [], at: (s) => ({ x: ox + dx * s, z: oz + dz * s, nx, nz }) };
}

function buildBoxShell(room, mat, entries) {
  const { w, d, zStart, zEnd } = room, zc = zStart - d / 2;
  const L = makeEntry([room.index], -w / 2, zc, 1, 0, d / 2, room.index);
  flatWall(L.full, mat, -w / 2, zc, Math.PI / 2, d, false);
  stubAndCap(L, -w / 2, zc, Math.PI / 2, d, false);
  const Rt = makeEntry([room.index], w / 2, zc, -1, 0, d / 2, room.index);
  flatWall(Rt.full, mat, w / 2, zc, -Math.PI / 2, d, false);
  stubAndCap(Rt, w / 2, zc, -Math.PI / 2, d, false);
  entries.push(L, Rt);
  room.spans = [
    lineSpan(L, -w / 2, zStart, 0, -1, 1, 0, d),
    lineSpan(Rt, w / 2, zStart, 0, -1, -1, 0, d),
  ];
  if (!room.hasEntry) {
    const F = makeEntry([room.index], 0, zStart, 0, -1, w / 2, room.index);
    flatWall(F.full, mat, 0, zStart, Math.PI, w, false);
    stubAndCap(F, 0, zStart, Math.PI, w, false);
    entries.push(F);
    room.frontEntry = F;
    room.spans.push(lineSpan(F, -w / 2, zStart, 1, 0, 0, -1, w));
  }
  if (!room.hasExit) {
    const B = makeEntry([room.index], 0, zEnd, 0, 1, w / 2, room.index);
    flatWall(B.full, mat, 0, zEnd, 0, w, false);
    stubAndCap(B, 0, zEnd, 0, w, false);
    entries.push(B);
    room.backEntry = B;
    room.spans.push(lineSpan(B, -w / 2, zEnd, 1, 0, 0, 1, w));
  }

  const floor = new THREE.Mesh(setUV(new THREE.PlaneGeometry(w, d), 0, w / 2, 0, d / 2), room.floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zc);
  room.floor = tag(floor, 'floor');
}

function buildRotundaShell(room, mat, entries) {
  const s = shared(), { r, zStart } = room, cz = zStart - r;
  const gap = Math.asin((DOOR_W / 2) / r) + 0.02;
  room.gap = gap;
  const gaps = [];
  if (room.hasEntry) gaps.push(0);
  if (room.hasExit) gaps.push(Math.PI);
  const segs = [];
  if (!gaps.length) segs.push([0, Math.PI * 2]);
  else if (gaps.length === 1) segs.push([gaps[0] + gap, Math.PI * 2 - gap * 2]);
  else segs.push([gap, Math.PI - gap * 2], [Math.PI + gap, Math.PI - gap * 2]);

  const wallMat = mat.clone();
  wallMat.side = THREE.BackSide;
  room.spans = [];
  for (const [start, len] of segs) {
    const k = Math.ceil(len / (Math.PI / 6));
    for (let i = 0; i < k; i++) {
      const s0 = start + (len / k) * i, sl = len / k, mid = s0 + sl / 2;
      const segN = Math.max(3, Math.round(sl * 8));
      const e = makeEntry([room.index], Math.sin(mid) * r, cz + Math.cos(mid) * r, -Math.sin(mid), -Math.cos(mid), r * Math.sin(sl / 2), room.index);
      const wall = new THREE.Mesh(setUV(new THREE.CylinderGeometry(r, r, WALL_H, segN, 1, true, s0, sl), 0, (r * sl) / 4, 0, 1), wallMat);
      wall.position.set(0, WALL_H / 2, cz);
      e.full.push(tag(wall, 'wall'));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.1, segN, 1, true, s0, sl), s.cap2);
      cap.position.set(0, WALL_H + 0.05, cz);
      e.full.push(tag(cap, 'wall'));
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, STUB_H, segN, 1, true, s0, sl), s.stub2);
      stub.position.set(0, STUB_H / 2, cz);
      e.stub.push(tag(stub, 'wall'));
      entries.push(e);
      room.spans.push({
        entry: e, length: r * sl, occ: [], s0,
        at: (sp) => { const th = s0 + sp / r; return { x: Math.sin(th) * r * 0.97, z: cz + Math.cos(th) * r * 0.97, nx: -Math.sin(th), nz: -Math.cos(th) }; },
      });
    }
  }
  const floor = new THREE.Mesh(setUV(new THREE.CircleGeometry(r, 40), 0, r, 0, r), room.floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, cz);
  room.floor = tag(floor, 'floor');
}

// 兩間房之間的牆：兩邊各自的牆面、門框、矮牆放在同一段
function buildBoundary(prev, cur, entries) {
  const zb = cur.zStart;
  const widths = [prev, cur].filter(isFlat).map((r) => r.w);
  const half = widths.length ? Math.max(...widths) / 2 : DOOR_W / 2 + 0.3;
  const e = makeEntry([prev.index, cur.index], 0, zb, 0, 1, half);
  if (isFlat(prev)) flatWall(e.full, prev.wallMat, 0, zb, 0, prev.w, true);
  if (isFlat(cur)) flatWall(e.full, cur.wallMat, 0, zb, Math.PI, cur.w, true);
  for (const [r, sign] of [[prev, 1], [cur, -1]]) {
    if (r.type !== 'rotunda') continue;
    const inset = r.r - Math.cos(r.gap) * r.r;
    e.full.push(wallPlane(r.wallMat, DOOR_W + 0.3, DOOR_H, WALL_H, 0, zb + sign * inset, sign > 0 ? 0 : Math.PI));
  }
  if (widths.length) stubAndCap(e, 0, zb, 0, half * 2, true);
  doorFrame(e, zb);
  entries.push(e);
  if (isFlat(prev)) prev.spans.push(lineSpan(e, -prev.w / 2, zb, 1, 0, 0, 1, prev.w));
  if (isFlat(cur)) cur.spans.push(lineSpan(e, -cur.w / 2, zb, 1, 0, 0, -1, cur.w));
  prev.backEntry = e;
  cur.frontEntry = e;
}

function boxSpan(room, which) {
  return room.spans.find((sp) => sp.entry === (which === 'front' ? room.frontEntry : room.backEntry) && sp.at(0).nz === (which === 'front' ? -1 : 1));
}

// 掛畫位置：回傳 { span, s }
function slotsFor(room) {
  const out = [];
  if (room.type === 'rotunda') {
    const angles = room.hasExit ? [-60, 60, -115, 115, -150, 150] : [0, -55, 55, -110, 110, -150, 150];
    for (const deg of angles) {
      const th = Math.PI + (deg * Math.PI) / 180;
      const rel = (sp) => (((th - sp.s0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const span = room.spans.find((sp) => rel(sp) < sp.length / room.r);
      if (span) out.push({ span, s: rel(span) * room.r });
    }
    return out;
  }
  const [left, right] = room.spans;
  const back = boxSpan(room, 'back');
  const { w, d } = room;
  if (room.type === 'hall') {
    out.push({ span: left, s: d * 0.3 }, { span: right, s: d * 0.3 }, { span: left, s: d * 0.7 }, { span: right, s: d * 0.7 });
    if (room.hasExit) out.push({ span: back, s: w / 2 - 2.65 }, { span: back, s: w / 2 + 2.65 });
    else out.push({ span: back, s: w / 2 }, { span: back, s: w / 2 - 2.8 }, { span: back, s: w / 2 + 2.8 });
  } else {
    for (const f of [0.2, 0.5, 0.8]) out.push({ span: left, s: d * f }, { span: right, s: d * f });
    if (!room.hasExit) out.push({ span: back, s: w / 2 });
  }
  return out;
}

function paintingSize(p) {
  let w = (p.width || 60) / 100 * PAINT_SCALE, h = (p.height || 80) / 100 * PAINT_SCALE;
  const big = Math.max(w, h);
  if (big > 2.0) { w *= 2.0 / big; h *= 2.0 / big; }
  if (big < 0.8) { w *= 0.8 / big; h *= 0.8 / big; }
  return [w, h];
}

function buildPainting(room, slot, data, index) {
  const s = shared();
  const [w, h] = paintingSize(data);
  const cy = Math.min(Math.max(1.5, h / 2 + 0.65), WALL_H - h / 2 - 0.3);
  const pt = slot.span.at(slot.s);
  const g = new THREE.Group();

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.8 + 0.6, h * 1.5 + 0.6),
    new THREE.MeshBasicMaterial({ map: s.glow, color: 0xffd9a0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.set(0, 0.15, 0.005);
  g.add(halo);

  const frameMat = s.frames[data.frame != null ? data.frame % FRAMES.length : index % FRAMES.length];
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.06), frameMat);
  frame.position.z = 0.04;
  g.add(frame);

  const canvasMat = new THREE.MeshBasicMaterial({ color: 0x3a3028 });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), canvasMat);
  canvas.position.z = 0.075;
  g.add(canvas);

  // 畫燈
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), s.brass);
  arm.position.set(0, h / 2 + 0.16, 0.12);
  g.add(arm);
  const lampHead = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.6, w * 0.5), 0.05, 0.07), s.brass);
  lampHead.position.set(0, h / 2 + 0.14, 0.24);
  g.add(lampHead);
  const lampStrip = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.56, w * 0.46), 0.03), s.lamp);
  lampStrip.rotation.x = Math.PI / 2;
  lampStrip.position.set(0, h / 2 + 0.114, 0.24);
  g.add(lampStrip);

  const meta = [data.year, data.medium].filter(Boolean).join('　');
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.16),
    new THREE.MeshBasicMaterial({ map: TX.plaqueTexture(data.title || '', meta) })
  );
  plaque.position.set(w / 2 + 0.38, -h / 2 + 0.1, 0.02);
  g.add(plaque);

  g.position.set(pt.x + pt.nx * 0.02, cy, pt.z + pt.nz * 0.02);
  g.rotation.y = Math.atan2(pt.nx, pt.nz);

  const p = {
    data, room, group: g, canvasMat, w, h, cy,
    wall: new THREE.Vector3(pt.x, 0, pt.z),
    n: new THREE.Vector3(pt.nx, 0, pt.nz),
    center: new THREE.Vector3(pt.x + pt.nx * 0.08, cy, pt.z + pt.nz * 0.08),
    url: `rooms/${room.id}/${data.image}`,
    thumbUrl: `rooms/${room.id}/${data.thumb || data.image}`,
    texture: null, loading: false, entry: slot.span.entry, near: true,
  };
  frame.userData.painting = p;
  canvas.userData.painting = p;
  slot.span.occ.push([slot.s - w / 2 - 0.5, slot.s + w / 2 + 0.75]);
  return p;
}

// 區間扣掉已佔用的部分
function freeIntervals(span) {
  const occ = span.occ.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of occ) {
    if (a > cur) out.push([cur, Math.min(a, span.length)]);
    cur = Math.max(cur, b);
  }
  if (cur < span.length) out.push([cur, span.length]);
  return out.filter(([a, b]) => b - a > 0.3);
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

function hitObstacle(list, x, z, pad) {
  for (const o of list) {
    const dx = x - o.x, dz = z - o.z, c = Math.cos(o.rot), s = Math.sin(o.rot);
    if (Math.abs(dx * c - dz * s) < o.hw + pad && Math.abs(dx * s + dz * c) < o.hd + pad) return true;
  }
  return false;
}

// noCat：黑貓住的房間，不再擺睡著的貓
function furnish(room, R, set, noCat) {
  const s = shared();
  const roomBucket = newBucket();
  const entryBuckets = new Map();
  const shadows = [];
  const obstacles = room.obstacles;
  const bucketFor = (entry, tall) => {
    if (!tall || !entry) return roomBucket;
    if (!entryBuckets.has(entry)) entryBuckets.set(entry, newBucket());
    return entryBuckets.get(entry);
  };
  const addShadow = (x, z, w, d, rot) => {
    const g = new THREE.PlaneGeometry(w * 1.3 + 0.2, d * 1.3 + 0.2);
    g.rotateX(-Math.PI / 2);
    g.rotateY(rot);
    g.translate(x, 0.008, z);
    shadows.push(g);
  };
  const place = (name, x, z, rot, entry) => {
    const def = PROPS[name], k = new Kit(R);
    def.build(k);
    k.emit(bucketFor(entry, def.tall), x, z, rot);
    obstacles.push({ x, z, hw: def.w / 2, hd: def.d / 2, rot });
    addShadow(x, z, def.w, def.d, rot);
  };

  // 窗戶：挑一段夠長、靠外牆的空位
  const outer = room.spans.filter((sp) => sp.entry.outerRoom === room.index);
  const winCandidates = [];
  for (const sp of outer) for (const [a, b] of freeIntervals(sp)) if (b - a > 2.0) winCandidates.push([sp, a, b]);
  if (winCandidates.length) {
    const [sp, a, b] = winCandidates[Math.floor(R() * winCandidates.length)];
    const sMid = a + 1.0 + R() * (b - a - 2.0);
    const pt = sp.at(sMid), rot = Math.atan2(pt.nx, pt.nz);
    const k = new Kit(R);
    buildWindow(k);
    k.emit(bucketFor(sp.entry, true), pt.x, pt.z, rot);
    sp.occ.push([sMid - 1.0, sMid + 1.0]);
    // 光束
    const top = new THREE.Vector3(pt.x + pt.nx * 0.05, 2.25, pt.z + pt.nz * 0.05);
    const bottom = new THREE.Vector3(pt.x + pt.nx * 2.2, 0.01, pt.z + pt.nz * 2.2);
    const v = bottom.clone().sub(top), len = v.length();
    v.normalize().negate();
    const u = new THREE.Vector3(-pt.nz, 0, pt.nx);
    const nrm = new THREE.Vector3().crossVectors(u, v);
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, len),
      new THREE.MeshBasicMaterial({ map: s.beam, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, nrm));
    beam.position.copy(top).add(bottom).multiplyScalar(0.5);
    beam.userData.hideOnFade = true;
    sp.entry.tall.push(beam);
    room.group.add(beam);
    if (R() < 0.6) {
      const low = ['crate', 'booksPile', 'plant'][Math.floor(R() * 3)];
      const d = PROPS[low].d;
      place(low, pt.x + pt.nx * (d / 2 + 0.25), pt.z + pt.nz * (d / 2 + 0.25), rot, sp.entry);
    }
  }

  // 沿牆擺家具
  for (const sp of room.spans) {
    for (const [a, b] of freeIntervals(sp)) {
      let cur = a + R() * 0.25;
      for (;;) {
        const remain = b - cur;
        if (remain < 0.5) break;
        if (R() < 0.15) { cur += 0.4 + R() * 0.5; continue; }
        const name = weightedPick(R, set.wall, remain - 0.05);
        if (!name) break;
        const def = PROPS[name];
        const sMid = cur + def.w / 2;
        const pt = sp.at(sMid);
        const off = def.d / 2 + 0.04 + (room.type === 'rotunda' ? 0.06 : 0);
        place(name, pt.x + pt.nx * off, pt.z + pt.nz * off, Math.atan2(pt.nx, pt.nz), sp.entry);
        cur += def.w + 0.05 + R() * 0.35;
      }
    }
  }

  // 房間中間的雜物：避開走道和看畫的位置
  const reserved = [[0, room.zStart + 1, 0, room.zEnd - 1, 1.15]];
  for (const p of room.paintings) {
    const vx = p.wall.x + p.n.x * 3.2, vz = p.wall.z + p.n.z * 3.2;
    reserved.push([p.wall.x, p.wall.z, vx, vz, 0.6 + p.w / 2]);
    reserved.push([vx, vz, 0, vz, 0.5]);
  }
  const inside = set.inside.slice();
  const count = { hall: 4, corridor: 1, rotunda: 3 }[room.type];
  let placed = 0, catDone = noCat;
  for (let tries = 0; tries < 80 && placed < count; tries++) {
    let name = inside[Math.floor(R() * inside.length)];
    if (name === 'cat' && catDone) continue;
    const def = PROPS[name], rad = Math.max(def.w, def.d) / 2;
    const x = (R() * 2 - 1) * (room.halfW - rad - 0.3);
    const z = room.zStart - rad - 0.3 - R() * (room.d - rad * 2 - 0.6);
    if (!room.inside(x, z, rad + 0.3)) continue;
    if (reserved.some(([ax, az, bx, bz, cl]) => segDist(x, z, ax, az, bx, bz) < rad + cl)) continue;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < rad + Math.max(o.hw, o.hd) + 0.2)) continue;
    const rot = name === 'armchair' ? Math.atan2(room.center.x - x, room.center.z - z) : R() * Math.PI * 2;
    place(name, x, z, rot, null);
    if (name === 'cat') catDone = true;
    placed++;
  }

  // 地毯
  const [rugBase, rugAccent] = RUGS[room.propSet] || RUGS.studio;
  let rugGeo;
  if (room.type === 'rotunda') rugGeo = new THREE.CircleGeometry(2.4, 32);
  else if (room.type === 'hall') rugGeo = new THREE.PlaneGeometry(3.4, 4.4);
  else rugGeo = new THREE.PlaneGeometry(1.6, room.d - 2.5);
  const rug = new THREE.Mesh(rugGeo, new THREE.MeshLambertMaterial({ map: TX.rugTexture(rugBase, rugAccent, room.type === 'rotunda'), transparent: room.type === 'rotunda' }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(room.center.x, 0.006, room.center.z);
  room.group.add(tag(rug, 'floor'));

  // 工作室地上的顏料點和紙張
  if (room.propSet === 'studio') {
    const k = new Kit(R);
    const colors = ['#c8553d', '#e0a458', '#588b8b', '#8e5572', '#f3a712', '#efe6d2'];
    for (let i = 0; i < 14; i++) {
      const x = (R() * 2 - 1) * (room.halfW - 0.6), z = room.zStart - 0.6 - R() * (room.d - 1.2);
      const r = 0.04 + R() * 0.16;
      k.cyl(r, r, 0.004, colors[Math.floor(R() * colors.length)], x, 0.009 + i * 0.0004, z, { sx: 1 + R() * 0.6 }, 9);
    }
    for (let i = 0; i < 5; i++) {
      const x = (R() * 2 - 1) * (room.halfW - 0.8), z = room.zStart - 0.8 - R() * (room.d - 1.6);
      k.box(0.21, 0.003, 0.3, '#f2ead8', x, 0.016 + i * 0.001, z, { ry: R() * 3 });
    }
    k.emit(roomBucket, 0, 0, 0);
  }

  // 燈串
  stringLights(room, R, roomBucket);

  for (const o of bucketObjects(roomBucket)) room.group.add(o);
  for (const [entry, b] of entryBuckets) {
    for (const o of bucketObjects(b, true)) { entry.tall.push(o); room.group.add(o); }
  }
  if (shadows.length) {
    const sm = new THREE.Mesh(mergeGeometriesSafe(shadows), s.shadowMat);
    room.group.add(sm);
  }
}

function mergeGeometriesSafe(list) {
  const pos = [], uv = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    uv.push(...ng.attributes.uv.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function stringLights(room, R, bucket) {
  const s = shared(), pts = [];
  const bulbColors = ['#ffd27a', '#ffb35c', '#fff0c0', '#ff9a6a'];
  const k = new Kit(R);
  const strand = (a, b, sag) => {
    const n = Math.max(6, Math.round(a.distanceTo(b) / 0.45));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      if (prev) pts.push(prev, p);
      prev = p;
      if (i > 0 && i < n) {
        const c = bulbColors[i % bulbColors.length];
        k.ball(0.035, c, p.x, p.y - 0.05, p.z, { glow: true });
        if (i % 2 === 0) k.light(p.x, p.y - 0.05, p.z, c, 0.45);
      }
    }
  };
  const y = WALL_H - 0.12;
  if (room.type === 'rotunda') {
    const c = new THREE.Vector3(room.center.x, WALL_H - 0.35, room.center.z);
    k.torus(0.3, 0.025, Math.PI * 2, '#b08a45', c.x, c.y, c.z, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.cyl(0.02, 0.02, 0.08, '#f2ead8', c.x + Math.cos(a) * 0.3, c.y + 0.05, c.z + Math.sin(a) * 0.3, {}, 5);
      k.cone(0.012, 0.035, '#ffcf6a', c.x + Math.cos(a) * 0.3, c.y + 0.11, c.z + Math.sin(a) * 0.3, { glow: true });
    }
    k.light(c.x, c.y + 0.1, c.z, '#ffcf8a', 2.4);
    pts.push(c.clone(), new THREE.Vector3(c.x, WALL_H + 0.1, c.z));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      strand(c.clone(), new THREE.Vector3(Math.sin(a) * (room.r - 0.1), y, room.center.z + Math.cos(a) * (room.r - 0.1)), 0.35);
    }
  } else {
    const n = room.type === 'hall' ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const z1 = room.zStart - (room.d / n) * (i + 0.3), z2 = room.zStart - (room.d / n) * (i + 0.8);
      strand(new THREE.Vector3(-room.w / 2 + 0.08, y, z1), new THREE.Vector3(room.w / 2 - 0.08, y, z2), 0.5);
    }
  }
  k.emit(bucket, 0, 0, 0);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  room.group.add(new THREE.LineSegments(geo, s.wire));
}

// ---------- 主程式 ----------

export function buildWorld(scene, gallery) {
  const rooms = [], paintings = [], entries = [], raycastTargets = [];
  let mirror = null, outdoor = null;
  let z = 0;

  // gallery.json 的 outdoor 為 true 時，最後一間房後面接陽台和草原
  const list = gallery.outdoor ? [...gallery.rooms, OUTDOOR_ROOM] : gallery.rooms;
  list.forEach((data, i) => {
    const type = ROOM_TYPES[data.type] ? data.type : 'hall';
    const dims = ROOM_TYPES[type];
    const room = {
      index: i, id: data.id, data, type, ...dims,
      halfW: type === 'rotunda' ? dims.r : dims.w / 2,
      zStart: z, zEnd: z - dims.d,
      hasEntry: i > 0, hasExit: i < list.length - 1,
      paintings: [], obstacles: [], group: new THREE.Group(),
      propSet: SETS[data.props] ? data.props : DEFAULTS[type].props,
    };
    room.center = new THREE.Vector3(0, 0, room.zStart - dims.d / 2);
    room.inside = (x, zz, m) => type === 'rotunda'
      ? x * x + (zz - room.center.z) ** 2 < (room.r - m) ** 2
      : Math.abs(x) < room.w / 2 - m && zz < room.zStart - m && zz > room.zEnd + m;
    room.wallMat = new THREE.MeshLambertMaterial({ map: TX.wallTexture(data.color || DEFAULTS[type].color, WALL_H) });
    room.floorMat = new THREE.MeshLambertMaterial({ map: shared().floor });
    z = room.zEnd;
    rooms.push(room);
  });

  const helpers = { bucketObjects, glowPoints, tag, uTime, shadowMat: shared().shadowMat };
  for (const room of rooms) {
    room.spans = room.spans || [];
    if (room.type === 'outdoor') outdoor = room.outdoor = buildOutdoor(room, helpers);
    else if (room.type === 'rotunda') buildRotundaShell(room, room.wallMat, entries);
    else buildBoxShell(room, room.wallMat, entries);
    room.group.add(room.floor);
  }
  for (let i = 1; i < rooms.length; i++) buildBoundary(rooms[i - 1], rooms[i], entries);
  const catRoom = catRoomOf(rooms);

  for (const e of entries) {
    let owner = rooms[Math.max(...e.rooms)];
    if (owner.type === 'outdoor') owner = rooms[owner.index - 1];   // 後門的門框屬於赤化，戶外藏起來時門框還要在
    for (const m of [...e.full, ...e.stub]) owner.group.add(m);
    for (const m of e.stub) m.visible = false;
  }

  for (const room of rooms) {
    if (room.type === 'outdoor') {
      scene.add(room.group);
      continue;
    }
    // 門口前後不放家具
    for (const sp of room.spans) {
      const p0 = sp.at(0), horizontal = Math.abs(p0.nz) === 1;
      if (horizontal && room.type !== 'rotunda') {
        sp.occ.push([0, 0.95], [sp.length - 0.95, sp.length]);
        const isDoor = (p0.nz === -1 && room.hasEntry) || (p0.nz === 1 && room.hasExit);
        if (isDoor) sp.occ.push([sp.length / 2 - 1.5, sp.length / 2 + 1.5]);
      }
      if (room.type === 'rotunda') {
        const th0 = sp.s0, th1 = sp.s0 + sp.length / room.r, clear = room.gap + 0.3;
        for (const door of [room.hasEntry ? 0 : null, room.hasEntry ? Math.PI * 2 : null, room.hasExit ? Math.PI : null, room.hasExit ? Math.PI * 3 : null]) {
          if (door == null) continue;
          const a = Math.max(th0, door - clear), b = Math.min(th1, door + clear);
          if (b > a) sp.occ.push([(a - th0) * room.r, (b - th0) * room.r]);
        }
      }
    }

    // 第一間房入口那面牆留給換裝鏡（圓廳沒有平的入口牆，就不放）
    if (room.index === 0 && room.frontEntry) {
      const sp = boxSpan(room, 'front'), s0 = Math.max(1.0, room.w / 2 - 1.4);
      sp.occ.push([s0 - 0.9, s0 + 0.9]);
      const pt = sp.at(s0), rot = Math.atan2(pt.nx, pt.nz);
      const { group, glass } = buildMirror();
      const x = pt.x + pt.nx * 0.2, z = pt.z + pt.nz * 0.2;
      group.position.set(x, 0, z);
      group.rotation.y = rot;
      room.group.add(group);
      group.traverse((m) => { if (m.isMesh) sp.entry.tall.push(m); });
      room.obstacles.push({ x, z, hw: 0.55, hd: 0.25, rot });
      raycastTargets.push(glass);
      mirror = { x, z, n: { x: pt.nx, z: pt.nz } };
    }

    const slots = slotsFor(room);
    (room.data.paintings || []).forEach((pd, k) => {
      if (k >= slots.length) {
        console.warn(`房間 ${room.id} 最多掛 ${slots.length} 幅畫，第 ${k + 1} 幅沒有掛上。`);
        return;
      }
      const p = buildPainting(room, slots[k], pd, paintings.length);
      room.group.add(p.group);
      p.entry.paintings.push(p);
      room.paintings.push(p);
      paintings.push(p);
    });

    furnish(room, rng(room.id + (room.data.seed || '')), SETS[room.propSet], room === catRoom);
    room.group.add(dust(room));
    scene.add(room.group);
  }

  for (const room of rooms) {
    room.group.traverse((o) => { if (o.userData.kind || o.userData.painting) raycastTargets.push(o); });
  }

  const doorZs = rooms.slice(1).map((r) => r.zStart);

  function roomIndexAt(zz) {
    for (const r of rooms) if (zz <= r.zStart && zz > r.zEnd) return r.index;
    return zz > 0 ? 0 : rooms.length - 1;
  }

  function walkable(x, zz) {
    const i = roomIndexAt(zz);
    let ok = rooms[i].inside(x, zz, MARGIN);
    if (!ok) for (const dz of doorZs) if (Math.abs(x) < DOOR_W / 2 - 0.3 && Math.abs(zz - dz) < 0.6) ok = true;
    if (!ok) return false;
    for (let j = Math.max(0, i - 1); j <= Math.min(rooms.length - 1, i + 1); j++) {
      if (hitObstacle(rooms[j].obstacles, x, zz, MARGIN - 0.05)) return false;
    }
    return true;
  }

  // 點到牆邊或家具上時，找一個走得到的點
  function findWalkable(x, zz, fromX, fromZ) {
    const i = roomIndexAt(zz), r = rooms[i];
    const snap = r.inside(x, zz, MARGIN + 0.05) ? null : r.snap?.(x, zz);
    if (snap) {
      x = snap.x;
      zz = snap.z;
    } else if (!r.inside(x, zz, MARGIN + 0.05)) {
      // 往房間中心找最近的可走點；戶外分成陽台和草原兩塊，各有各的中心
      const c = r.anchor ? r.anchor(x, zz) : r.center;
      let lo = 0, hi = 1;
      for (let k = 0; k < 16; k++) {
        const t = (lo + hi) / 2;
        r.inside(c.x + (x - c.x) * t, c.z + (zz - c.z) * t, MARGIN + 0.05) ? (lo = t) : (hi = t);
      }
      x = c.x + (x - c.x) * lo;
      zz = c.z + (zz - c.z) * lo;
    }
    if (walkable(x, zz)) return { x, z: zz };
    for (let k = 1; k <= 24; k++) {
      const t = k / 24, px = x + (fromX - x) * t, pz = zz + (fromZ - zz) * t;
      if (walkable(px, pz)) return { x: px, z: pz };
    }
    return null;
  }

  // ---------- 尋路：地面切成格子跑 A*，再把折線拉直 ----------
  // 戶外的格子鋪到山坡和涼亭（reachW），室內那幾列只有房間範圍是空的
  const CELL = 0.25;
  const maxHalf = Math.max(...rooms.map((r) => r.reachW ?? r.halfW)) + 0.5;
  const gx0 = -maxHalf, gz0 = rooms[rooms.length - 1].zEnd - 0.5;
  const cols = Math.ceil((maxHalf * 2) / CELL), rows = Math.ceil((0.5 - gz0) / CELL);
  const grid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid[r * cols + c] = walkable(gx0 + (c + 0.5) * CELL, gz0 + (r + 0.5) * CELL) ? 1 : 0;
  }
  // 比一格還窄的縫（桌尾和陽台前緣之間只有 0.23 公尺）取樣點剛好落不進去，整條走道就被當成封死。
  // 格子中心走不到、但偏 0.1 公尺的四個點有一個走得到，而且旁邊有開著的格子，也算開著（記成 2）。
  // 路線上的轉折點再換成那個走得到的點
  // 平常只走中心走得到的格子；這樣找不到路時才放寬再找一次，原本走得通的路線不會被推到邊緣
  let loose = false;
  const EDGE = 0.1, OFFS = [[EDGE, EDGE], [-EDGE, EDGE], [EDGE, -EDGE], [-EDGE, -EDGE]];
  const cellPoint = (c, r) => {
    const x = gx0 + (c + 0.5) * CELL, z = gz0 + (r + 0.5) * CELL;
    if (grid[r * cols + c] === 1) return { x, z };
    for (const [dx, dz] of OFFS) if (walkable(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    return { x, z };
  };
  {
    const edge = [];
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      const k = r * cols + c;
      if (grid[k] === 0 && (grid[k - 1] === 1 || grid[k + 1] === 1 || grid[k - cols] === 1 || grid[k + cols] === 1)) edge.push(k);
    }
    for (const k of edge) {
      const c = k % cols, r = (k / cols) | 0, x = gx0 + (c + 0.5) * CELL, z = gz0 + (r + 0.5) * CELL;
      if (OFFS.some(([dx, dz]) => walkable(x + dx, z + dz))) grid[k] = 2;
    }
  }
  const cellOf = (x, zz) => [Math.floor((x - gx0) / CELL), Math.floor((zz - gz0) / CELL)];
  const open = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && (grid[r * cols + c] === 1 || (loose && grid[r * cols + c] === 2));

  function nearestOpen(x, zz) {
    const [c0, r0] = cellOf(x, zz);
    for (let rad = 0; rad <= 6; rad++) {
      let best = null, bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad || !open(c0 + dc, r0 + dr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bd) { bd = d; best = [c0 + dc, r0 + dr]; }
      }
      if (best) return best;
    }
    return null;
  }

  function lineClear(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let i = 1; i <= n; i++) if (!walkable(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  }

  // A* 用的陣列只配一次，每次尋路換一個戳記，不用每次清空
  const N = cols * rows, gScore = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), done = new Uint32Array(N);
  let stamp = 0;

  function findPath(sx, sz, tx, tz) {
    if (walkable(tx, tz) && lineClear(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    loose = false;
    let path = gridPath(sx, sz, tx, tz);
    if (!path) {
      loose = true;
      path = gridPath(sx, sz, tx, tz);
      loose = false;
    }
    return path;
  }

  function gridPath(sx, sz, tx, tz) {
    const s = nearestOpen(sx, sz), t = nearestOpen(tx, tz);
    if (!s || !t) return null;
    const key = (c, r) => r * cols + c, cur = ++stamp;
    const g = (k) => (seen[k] === cur ? gScore[k] : Infinity);
    const heap = [];
    const push = (k, f) => {
      heap.push([f, k]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top[1];
    };
    const h = (c, r) => Math.hypot(c - t[0], r - t[1]);
    const sk = key(s[0], s[1]), tk = key(t[0], t[1]);
    seen[sk] = cur;
    gScore[sk] = 0;
    from[sk] = -1;
    push(sk, h(s[0], s[1]));
    let found = sk === tk;
    while (heap.length) {
      const k = pop();
      if (k === tk) { found = true; break; }
      if (done[k] === cur) continue;
      done[k] = cur;
      const c = k % cols, r = (k / cols) | 0, gk = gScore[k];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!open(nc, nr)) continue;
        if (dr && dc && (!open(c + dc, r) || !open(c, r + dr))) continue;   // 不切角
        const nk = key(nc, nr), ng = gk + (dr && dc ? 1.414 : 1);
        if (ng < g(nk)) { seen[nk] = cur; gScore[nk] = ng; from[nk] = k; push(nk, ng + h(nc, nr)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = tk; k !== -1; k = from[k]) cells.push(cellPoint(k % cols, (k / cols) | 0));
    cells.reverse();
    if (walkable(tx, tz)) cells.push({ x: tx, z: tz });
    // 拉直：只在格子路線轉彎的地方試，看從上一個轉折能不能直線走過去，走不過去就把前一個彎留下來
    const turns = cells.filter((p, i) => {
      if (i === 0 || i === cells.length - 1) return true;
      const a = cells[i - 1], b = cells[i + 1];
      return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-6;
    });
    const out = [];
    let ax = sx, az = sz, prev = null;
    for (const p of turns) {
      if (prev && !lineClear(ax, az, p.x, p.z)) {
        out.push(prev);
        ax = prev.x; az = prev.z;
      }
      prev = p;
    }
    out.push(prev);
    return out;
  }

  const loader = new THREE.TextureLoader();
  let currentRoom = 0;
  function updateTextures(current) {
    for (const p of paintings) {
      const near = Math.abs(p.room.index - current) <= 1;
      if (near && !p.texture && !p.loading) {
        p.loading = true;
        loader.load(p.thumbUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          p.loading = false;
          if (Math.abs(p.room.index - currentRoom) > 2) { tex.dispose(); return; }
          p.texture = tex;
          p.canvasMat.map = tex;
          p.canvasMat.color.set(0xffffff);
          p.canvasMat.needsUpdate = true;
        }, undefined, () => {
          p.loading = false;
          console.warn('畫作圖檔讀取失敗：' + p.thumbUrl);
        });
      } else if (Math.abs(p.room.index - current) > 2 && p.texture) {
        p.texture.dispose();
        p.texture = null;
        p.canvasMat.map = null;
        p.canvasMat.color.set(0x3a3028);
        p.canvasMat.needsUpdate = true;
      }
    }
  }

  function setCurrentRoom(i) {
    currentRoom = i;
    updateTextures(i);
    for (const r of rooms) r.group.visible = Math.abs(r.index - i) <= 2;
    // 戶外很大，只有在最後一間房或已經走出去時才畫；走出去之後，室內只留赤化
    if (outdoor) {
      const last = rooms.length - 1;
      rooms[last].group.visible = i >= last - 1;
      if (i === last) for (const r of rooms) if (r.index < last - 1) r.group.visible = false;
    }
  }

  // 腳下地面的高度。只有戶外的石階和草原不是 0
  function groundY(x, zz) {
    return outdoor && zz < outdoor.door ? outdoor.groundY(x, zz) : 0;
  }

  // 鏡頭不能低於這個高度：地面，戶外再加上樹冠殼
  function camFloor(x, zz) {
    return outdoor && zz < outdoor.door ? outdoor.camFloor(x, zz) : 0;
  }

  function setFaded(e, faded) {
    e.faded = faded;
    for (const m of e.full) m.visible = !faded;
    for (const m of e.stub) m.visible = faded;
    // 高家具變半透明（碰撞還在，所以不能整個藏起來），光暈和光束直接隱藏
    for (const m of e.tall) {
      if (m.isPoints || m.userData.hideOnFade) { m.visible = !faded; continue; }
      m.material.opacity = faded ? 0.18 : 1;
      m.material.depthWrite = !faded;
      m.userData.ghost = faded;
    }
    for (const p of e.paintings) p.group.visible = !faded;
  }

  function shouldFade(e, cam, tgt) {
    const s1 = (cam.x - e.px) * e.nx + (cam.z - e.pz) * e.nz;
    const s2 = (tgt.x - e.px) * e.nx + (tgt.z - e.pz) * e.nz;
    if (e.outerRoom === currentRoom && s1 < 0) return true;
    if ((s1 < 0) === (s2 < 0)) return false;
    if (e.outerRoom === null) return true;   // 房間之間的牆：鏡頭和角色分在兩側就降下
    const k = s1 / (s1 - s2);
    const qx = cam.x + (tgt.x - cam.x) * k, qz = cam.z + (tgt.z - cam.z) * k;
    return Math.abs((qx - e.px) * e.tx + (qz - e.pz) * e.tz) < e.half + 0.8;
  }

  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4();
  function seaInView(view) {
    view.updateMatrixWorld();
    viewProj.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    return frustum.setFromProjectionMatrix(viewProj).intersectsBox(outdoor.seaBox);
  }

  function update(t, cam, target, view) {
    uTime.value = t;
    if (outdoor) {
      // 房子外殼只在人走出去、鏡頭也在屋外時出現，不然會擋住室內
      outdoor.shell.visible = currentRoom === rooms.length - 1 && !outdoor.insideShell(cam);
      outdoor.sky.position.copy(cam);
      if (rooms[rooms.length - 1].group.visible) outdoor.update(t, target);
      // 海的反射要多畫一次場景，只在人已經走到戶外、鏡頭也看得到海時才開
      const seaOn = currentRoom === rooms.length - 1 && cam.z < outdoor.door && seaInView(view);
      outdoor.water.visible = seaOn;
      if (seaOn) outdoor.water.material.uniforms.time.value = t * 0.5;
    }
    for (const e of entries) {
      const f = shouldFade(e, cam, target);
      if (f !== e.faded) setFaded(e, f);
    }
  }

  return { rooms, paintings, mirror, outdoor, raycastTargets, roomIndexAt, walkable, findWalkable, findPath, groundY, camFloor, setCurrentRoom, update };
}
