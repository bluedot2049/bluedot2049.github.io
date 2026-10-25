// 海牛頭人：站在前廳的黑暗法師 NPC，造型取自遊戲專案的「豆子」身形。面向本地 +z。
import * as THREE from 'three';

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

const SKIN = 0x91abb0;
const SAY_TIME = 3500, GREET_DIST = 3.5, NEAR = 6;
const GREETINGS = ['歡迎光臨哈哈', '歡迎光臨', '歡迎到處看看', '你好哈哈', '你好', '讚'];
export const TABLE_LINES = ['要吃自己拿', '都可以吃', '桌上可以拿去吃', '你要吃東西嗎 這裡有', '要吃一點嗎'];
const SURPRISED = ['天啊不是吧!', '蛤!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 身體輪廓 [高度, 半寬]，取自遊戲專案 character_model.gd 的 PROFILE
const PROFILE = [
  [0.12, 0.0], [0.15, 0.2], [0.21, 0.3], [0.3, 0.355], [0.4, 0.37], [0.52, 0.35], [0.61, 0.338],
  [0.71, 0.362], [0.83, 0.385], [0.95, 0.378], [1.06, 0.345], [1.16, 0.282], [1.24, 0.19], [1.295, 0.085], [1.31, 0.0],
];
const FACE_Y = 0.91, FACE_W = 0.6, FACE_H = 0.62;

function radiusAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i], [y1, r1] = PROFILE[i + 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

// 沿著身體輪廓、比身體大一點點的弧形面，臉才會貼著身體不飄也不穿
function facePatch() {
  const rows = 12, cols = 16, pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = FACE_Y - FACE_H / 2 + v * FACE_H, r = radiusAt(y) + 0.012;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, phi = (u - 0.5) * (FACE_W / 0.38);
      pos.push(Math.sin(phi) * r, y, Math.cos(phi) * r);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Manatee {
  constructor(shadowTex, x, z, extraLines = []) {
    this.lines = GREETINGS.concat(extraLines);
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    const skin = mat(SKIN), black = mat(0x0b0b10, { side: THREE.DoubleSide }), wood = mat(0x2a1a16);

    // 頭身一體的豆子，前後略扁
    const bean = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([y, r]) => new THREE.Vector2(r, y)).reverse(), 20), skin);
    bean.scale.z = 0.76;
    body.add(bean);

    // 手繪臉：貼在豆子正面的一片弧形
    const tex = new THREE.TextureLoader().load('assets/manatee_face.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(
      facePatch(),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    face.scale.z = 0.76;
    body.add(face);

    // 破邊披風 + 尖角立領
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.8, 14, 1, true, Math.PI * 0.45, Math.PI * 1.1), black);
    cape.position.y = 0.66;
    cape.scale.z = 0.8;
    body.add(cape);
    const spike = new THREE.ConeGeometry(0.06, 0.28, 4);
    for (let i = 0; i < 7; i++) {
      const th = Math.PI + (i - 3) * 0.38;
      const s = new THREE.Mesh(spike, black);
      const h = 0.5 + (1 - Math.abs(i - 3) / 3) * 0.12;
      s.position.set(Math.sin(th) * 0.4, 1.12, Math.cos(th) * 0.34);
      s.rotation.x = -Math.cos(th) * 0.25;
      s.rotation.z = Math.sin(th) * 0.25;
      s.scale.y = h * 1.4;
      body.add(s);
    }

    // 短手、短胖腿
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.16, 2, 6);
    const arm = (side) => {
      const p = new THREE.Group();
      p.position.set(0.33 * side, 0.82, 0.02);
      const m = new THREE.Mesh(armGeo, skin);
      m.position.y = -0.14;
      p.add(m);
      body.add(p);
      return p;
    };
    this.armL = arm(-1);
    this.armR = arm(1);
    this.armL.rotation.z = -0.35;
    this.armR.rotation.z = 0.2;
    this.armR.rotation.x = -0.9;   // 右手舉著魔杖

    // 魔杖與冰晶
    const wand = new THREE.Group();
    wand.position.set(0, -0.3, 0.02);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.9, 6), wood);
    shaft.position.y = 0.3;
    wand.add(shaft);
    this.ice = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0x9ee6ff }));
    this.ice.scale.y = 1.6;
    this.ice.position.y = 0.82;
    wand.add(this.ice);
    this.armR.add(wand);
    wand.rotation.x = 0.9;

    const legGeo = new THREE.CapsuleGeometry(0.1, 0.06, 2, 6);
    for (const x of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(legGeo, skin);
      leg.position.set(x, 0.14, 0.02);
      leg.scale.set(1, 0.9, 1.1);
      body.add(leg);
    }

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);

    g.position.set(x, 0, z);
    this.group = g;
    this.body = body;
    this.heading = 0;
    this.time = 0;
    this.greeted = false;
    this.bubble = document.createElement('div');
    this.bubble.className = 'speech';
    document.body.appendChild(this.bubble);
    this.hideTimer = 0;
  }

  // 漫畫對話框：彈出後停 SAY_TIME 毫秒，再淡出
  say(text) {
    clearTimeout(this.hideTimer);
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    this.hideTimer = setTimeout(() => this.bubble.classList.remove('show'), SAY_TIME);
  }

  hush() {
    clearTimeout(this.hideTimer);
    this.bubble.classList.remove('show');
  }

  // 玩家對海牛用驚訝表情
  startled(px, pz) {
    const g = this.group.position;
    if (Math.hypot(px - g.x, pz - g.z) < NEAR) this.say(pick(SURPRISED));
  }

  placeBubble(camera) {
    const v = this.group.position.clone();
    v.y += 1.7;
    v.project(camera);
    const b = this.bubble.style;
    if (v.z > 1) { b.visibility = 'hidden'; return; }
    b.visibility = '';
    b.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
    b.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
  }

  update(dt, px, pz, camera) {
    this.time += dt;
    const g = this.group;
    const dx = px - g.position.x, dz = pz - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < GREET_DIST && !this.greeted) {
      this.greeted = true;
      this.say(pick(this.lines));
    } else if (dist > GREET_DIST + 3) {
      this.greeted = false;
    }
    if (this.bubble.classList.contains('show')) this.placeBubble(camera);
    const near = dist < 6;
    if (near) {
      const want = Math.atan2(dx, dz);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += d * Math.min(1, dt * 3);
      g.rotation.y = this.heading;
    }
    const breath = Math.sin(this.time * 2.2);
    this.body.scale.y = 1 + breath * 0.015;
    this.armL.rotation.x = Math.sin(this.time * 1.3) * 0.05;
    this.ice.rotation.y = this.time * 1.5;
    const s = 1 + Math.sin(this.time * 3) * 0.1;
    this.ice.scale.set(s, 1.6 * s, s);
  }
}
