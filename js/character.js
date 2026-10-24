// 玩家角色：戴尖帽的小煉金學徒。面向本地 +z。
import * as THREE from 'three';

function mat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// 換裝的三個部位，各 8 色。第 i 套預設配色就是三排各取第 i 個
export const ROBES = [0x2f5d62, 0x7a3b2e, 0x3d5a2a, 0x5b3f78, 0x8a6a2f, 0x2a3f6b, 0x6b2a4a, 0x4a4a52];
export const HATS = [0x4a2f66, 0x2c3e50, 0x6b3a1f, 0x1f5a4a, 0x2b1f3d, 0x7a2a3a, 0x2f4a3a, 0x8a2a2a];
export const SCARVES = [0xc0392b, 0xe0b44c, 0xd9d2c0, 0xe58a3a, 0x4fa3a5, 0xe27a9a, 0x9ad0e0, 0x6fbf73];
export const JUMP_V = 4.2, GRAVITY = 14;
const ACT_TIME = 1.6;

export const presetOutfit = (i) => [i, i, i];
export const randomOutfit = () => presetOutfit(Math.floor(Math.random() * ROBES.length));
// 長袍、帽子、圍巾的色號；外來資料要先過這關
export const isOutfit = (o) => Array.isArray(o) && o.length === 3 && o.every((v) => Number.isInteger(v) && v >= 0 && v < ROBES.length);

const smooth = (t) => t * t * (3 - 2 * t);

export class Character {
  constructor(shadowTex, outfit) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    const robe = mat(0), skin = mat(0xf1c9a5), hat = mat(0), dark = mat(0x3a2414), scarf = mat(0), hair = mat(0x5a3a22);
    this.mats = [robe, hat, scarf];

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.7, 8), robe);
    torso.position.y = 0.45;
    body.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.225, 0.05, 8), dark);
    belt.position.y = 0.55;
    body.add(belt);
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 5, 10), scarf);
    scarfRing.rotation.x = Math.PI / 2;
    scarfRing.position.y = 0.8;
    body.add(scarfRing);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.04), scarf);
    scarfTail.position.set(0.08, 0.68, -0.17);
    scarfTail.rotation.x = 0.2;
    body.add(scarfTail);
    this.scarfTail = scarfTail;

    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.08), dark);
    bag.position.set(-0.24, 0.42, 0.02);
    bag.rotation.z = 0.15;
    body.add(bag);

    const head = new THREE.Group();
    head.position.y = 1.0;
    body.add(head);
    const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), skin);
    head.add(face);
    const hairM = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), hair);
    hairM.position.set(0, 0.03, -0.04);
    hairM.scale.set(1, 0.9, 0.95);
    head.add(hairM);
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a120c });
    for (const x of [-0.07, 0.07]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(x, 0, 0.185);
      head.add(e);
    }
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf29a8a });
    for (const x of [-0.12, 0.12]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), blushMat);
      b.position.set(x, -0.05, 0.172);
      b.rotation.y = x * 2.5;
      head.add(b);
    }

    const hatG = new THREE.Group();
    hatG.position.y = 0.13;
    hatG.rotation.z = -0.12;
    head.add(hatG);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 12), hat);
    hatG.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 9), hat);
    cone.position.set(0.03, 0.25, 0);
    cone.rotation.z = -0.25;
    hatG.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.05, 9), mat(0xd4a54a));
    band.position.y = 0.04;
    hatG.add(band);
    this.hat = hatG;

    // 手和腳用 pivot 讓它們能擺動
    const limb = (geo, m, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(geo, m);
      pivot.add(mesh);
      body.add(pivot);
      return [pivot, mesh];
    };
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.25, 2, 6);
    [this.armL] = limb(armGeo, robe, -0.22, 0.72);
    [this.armR] = limb(armGeo, robe, 0.22, 0.72);
    for (const a of [this.armL, this.armR]) {
      a.children[0].position.y = -0.16;
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), skin);
      hand.position.y = -0.33;
      a.add(hand);
    }
    this.armL.rotation.z = -0.15;
    this.armR.rotation.z = 0.15;

    const footGeo = new THREE.BoxGeometry(0.1, 0.08, 0.18);
    [this.footL] = limb(footGeo, dark, -0.1, 0.04);
    [this.footR] = limb(footGeo, dark, 0.1, 0.04);
    this.footL.children[0].position.z = 0.03;
    this.footR.children[0].position.z = 0.03;

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
    this.setOutfit(outfit);
  }

  setOutfit(o) {
    if (!isOutfit(o)) o = presetOutfit(0);
    this.outfit = o.slice();
    [ROBES, HATS, SCARVES].forEach((list, i) => this.mats[i].color.setHex(list[o[i]]));
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

  // 還有動畫在播（跳躍、表情），主迴圈不能降幀
  get busy() {
    return this.airborne || !!this.act;
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
    this.footL.rotation.x = -s * 0.6 * w;
    this.footR.rotation.x = s * 0.6 * w;
    this.footL.position.z = -s * 0.08 * w;
    this.footR.position.z = s * 0.08 * w;

    // 站著時輕輕呼吸，帽子跟著晃
    const breath = Math.sin(this.time * 2.2) * (1 - w);
    this.body.scale.y = 1 + breath * 0.015;
    this.hat.rotation.z = -0.12 + Math.sin(this.time * 1.7) * 0.04 * (1 - w) + s * 0.06 * w;
    this.scarfTail.rotation.x = 0.2 + w * 0.5 + Math.sin(this.time * 6) * 0.08 * w;
    this.body.rotation.y = 0;
    this.hat.position.y = 0.13;

    if (this.airborne) {
      this.jumpV -= GRAVITY * dt;
      this.jumpY = Math.max(0, this.jumpY + this.jumpV * dt);
      if (this.jumpY === 0) this.jumpV = 0;
    }
    this.group.position.y = this.jumpY;
    // 影子留在地面，越高越小
    this.shadow.position.y = 0.012 - this.jumpY;
    this.shadow.scale.setScalar(1 - Math.min(0.4, this.jumpY * 0.5));

    if (this.act) this.pose(dt, w);
  }

  // 表情動作疊在走路動作上面。走路時只動手，站著時整個身體一起演
  pose(dt, walk) {
    const a = this.act;
    a.t += dt;
    const t = a.t;
    if (t >= ACT_TIME) { this.act = null; return; }
    const k = smooth(Math.min(1, t / 0.15, (ACT_TIME - t) / 0.25));
    const kb = k * (1 - walk);
    const L = this.armL.rotation, R = this.armR.rotation, B = this.body.rotation;
    const arms = (lx, lz, rx, rz) => {
      L.x += (lx - L.x) * k; L.z += (lz - L.z) * k;
      R.x += (rx - R.x) * k; R.z += (rz - R.z) * k;
    };
    switch (a.e) {
      case '👋':
        arms(L.x, L.z, -0.25, 2.5 + Math.sin(t * 12) * 0.35);
        B.z += -0.06 * kb;
        break;
      case '👏': {
        const open = Math.abs(Math.sin(t * Math.PI * 3)) * 0.45;
        arms(-1.3, 0.6 - open, -1.3, -0.6 + open);
        B.x += 0.06 * kb;
        break;
      }
      case '❤️':
        arms(-1.0, 0.75, -1.0, -0.75);
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
        arms(-2.2, 0.5, -2.2, -0.5);
        B.x += -0.25 * kb;
        this.hat.position.y += Math.max(0, Math.sin(Math.min(1, t / 0.35) * Math.PI)) * 0.1 * kb;
        break;
    }
  }
}
