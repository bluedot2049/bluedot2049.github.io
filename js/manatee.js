// 海牛頭人：站在前廳的黑暗法師 NPC，造型取自遊戲專案的「豆子」身形。面向本地 +z。
import * as THREE from 'three';

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

const SKIN = 0x91abb0;
// 身體輪廓 [高度, 半寬]，取自遊戲專案 character_model.gd 的 PROFILE
const PROFILE = [
  [0.12, 0.0], [0.15, 0.2], [0.21, 0.3], [0.3, 0.355], [0.4, 0.37], [0.52, 0.35], [0.61, 0.338],
  [0.71, 0.362], [0.83, 0.385], [0.95, 0.378], [1.06, 0.345], [1.16, 0.282], [1.24, 0.19], [1.295, 0.085], [1.31, 0.0],
];
const FACE_Y = 0.91, FACE_R = 0.39;

export class Manatee {
  constructor(shadowTex, x, z) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);

    const skin = mat(SKIN), black = mat(0x0b0b10, { side: THREE.DoubleSide }), wood = mat(0x2a1a16);

    // 頭身一體的豆子，前後略扁
    const bean = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([y, r]) => new THREE.Vector2(r, y)), 20), skin);
    bean.scale.z = 0.76;
    body.add(bean);

    // 手繪臉：貼在豆子正面的一片弧形
    const tex = new THREE.TextureLoader().load('assets/manatee_face.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const arc = 0.62 / FACE_R;
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(FACE_R, FACE_R, 0.62, 16, 1, true, -arc / 2, arc),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    face.scale.z = 0.76;
    face.position.y = FACE_Y;
    body.add(face);

    // 破邊披風 + 尖角立領
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.82, 14, 1, true, Math.PI * 0.62, Math.PI * 1.76), black);
    cape.position.y = 0.62;
    cape.scale.z = 0.8;
    body.add(cape);
    const spike = new THREE.ConeGeometry(0.06, 0.28, 4);
    for (let i = 0; i < 7; i++) {
      const th = Math.PI + (i - 3) * 0.38;
      const s = new THREE.Mesh(spike, black);
      const h = 0.5 + (1 - Math.abs(i - 3) / 3) * 0.12;
      s.position.set(Math.sin(th) * 0.36, 1.0 + h * 0.12, Math.cos(th) * 0.3);
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
  }

  update(dt, px, pz) {
    this.time += dt;
    const g = this.group;
    const dx = px - g.position.x, dz = pz - g.position.z;
    const near = Math.hypot(dx, dz) < 6;
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
