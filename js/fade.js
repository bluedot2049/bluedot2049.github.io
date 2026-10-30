// 海市擋住視線的東西：房子、塔、攤位和推車的屋頂、楓樹的樹冠。每一組有一個編號，頂點帶著編號，
// 鏡頭和角色（還有旁邊攤販）之間被哪一組擋住，那一組就淡掉；鏡頭整個鑽進去的那一組直接藏起來。
// 淡掉是在著色器裡丟掉一部分像素（網點），不用半透明：合併成一大塊的網格不用拆，前後也不會排錯。
// 鏡頭本身不再被房子推來推去，距離和斜度都照玩家拖的
import * as THREE from 'three';

const FADED = 0.22;   // 擋住時留下幾成像素，看得出輪廓
const SPEED = 4;      // 淡出、淡回的速度（每秒）
const HOLD = 0.3;     // 不擋了以後再等一下才淡回來，走過房子之間的空隙不會一閃一閃

// 線段 p→q 有沒有穿過盒子 b = [x0, y0, z0, x1, y1, z1]
function cross(p, q, b) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const a = i === 0 ? 'x' : i === 1 ? 'y' : 'z', d = q[a] - p[a];
    if (Math.abs(d) < 1e-6) {
      if (p[a] < b[i] || p[a] > b[i + 3]) return false;
      continue;
    }
    let u = (b[i] - p[a]) / d, v = (b[i + 3] - p[a]) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}
const inside = (p, b, pad) => p.x > b[0] - pad && p.x < b[3] + pad && p.y > b[1] - pad && p.y < b[4] + pad && p.z > b[2] - pad && p.z < b[5] + pad;

export class Fader {
  constructor() {
    this.units = [null];   // 0 號是不會淡的東西
  }

  // boxes：這一組佔的範圍，可以好幾塊；objs：跟著一起藏的獨立物件（牌樓的匾）。回傳的編號給 Kit 的 fid
  add(boxes, objs = []) {
    this.units.push({ boxes, objs, a: 1, want: 1, hold: 0 });
    return this.units.length - 1;
  }

  // 合併網格之前：每個零件補上編號的頂點屬性，沒編號的是 0
  tag(list) {
    for (const g of list) {
      const n = g.attributes.position.count;
      g.setAttribute('aFid', new THREE.BufferAttribute(new Float32Array(n).fill(g.userData.fid || 0), 1));
    }
  }

  // 所有組都加完以後：一組一格的淡出貼圖
  build() {
    const n = this.units.length;
    this.data = new Uint8Array(n * 4).fill(255);
    this.tex = new THREE.DataTexture(this.data, n, 1);
    this.tex.needsUpdate = true;
    this.uniforms = { uFadeTex: { value: this.tex }, uFadeN: { value: n } };
  }

  // 材質各複製一份，加上照編號丟像素的那幾行
  patch(mat) {
    const m = mat.clone();
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFid; uniform sampler2D uFadeTex; uniform float uFadeN; varying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = texture2D(uFadeTex, vec2((aFid + 0.5) / uFadeN, 0.5)).r;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('void main() {', 'void main() {\nif (vFade < 0.996 && vFade <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
    };
    m.customProgramCacheKey = () => 'haishi-fade';
    return m;
  }

  // cam：鏡頭位置；eyes：要看得到的點；off：拍照時全部照原樣，拍到什麼就是什麼
  update(dt, cam, eyes, off) {
    let dirty = false;
    for (let i = 1; i < this.units.length; i++) {
      const u = this.units[i];
      if (off) {
        u.want = 1;
        u.hold = 0;
        if (u.a !== 1) { u.a = 1; dirty = true; this.show(i, u); }
        continue;
      }
      let want = 1;
      if (u.boxes.some((b) => inside(cam, b, 0.6))) want = 0;
      else if (eyes.some((e) => u.boxes.some((b) => cross(e, cam, b)))) want = FADED;
      if (want < 1) { u.want = want; u.hold = HOLD; }
      else if ((u.hold -= dt) <= 0) u.want = 1;
      if (u.a === u.want) continue;
      u.a = u.a < u.want ? Math.min(u.want, u.a + dt * SPEED) : Math.max(u.want, u.a - dt * SPEED);
      dirty = true;
      this.show(i, u);
    }
    if (dirty) this.tex.needsUpdate = true;
  }

  show(i, u) {
    this.data[i * 4] = Math.round(u.a * 255);
    for (const o of u.objs) o.visible = u.a > 0.5;
  }
}
