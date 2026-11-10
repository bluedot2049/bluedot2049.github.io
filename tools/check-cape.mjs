// 披風穿模檢查：好幾種身形、背的東西、手上的東西 × 走路一整步、顏文字（手勢 × 身體）、坐、坐椅子、躺、舉相機、往下掉、轉頭，
// 在 Node 裡擺好（披風照 bendCape 彎好），量：
//   手臂、手、手上的東西、腿從身體中線往外看有沒有穿出披風（穿出去多遠）；披風的點有沒有陷進身體（不含背的東西）、頭（頭髮、鬍子）。
// 改披風（clothes.js 的 capeGeo、character.js 的 bendCape）、手臂和腿的擺法、新種族或很大的髮型之後跑。
//   node tools/check-cape.mjs              全部，印最糟的 30 個
//   node tools/check-cape.mjs --top=60     多印幾個
//   node tools/check-cape.mjs --min=0.01   穿不到這麼深（公尺）的不算
import { installDom } from './zone-env.mjs';

installDom();
const THREE = await import('three');
const { Character } = await import('../js/avatar/character.js');
const { presetLook } = await import('../js/avatar/looks.js');
const { HANDS, BODIES, kaoCode, kaoText } = await import('../js/avatar/kaomoji-parts.js');
const { shapeOf, depth } = await import('../js/avatar/handclear.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TOP = +opt('top', 30), MIN = +opt('min', 0.01);
const ARM_R = 0.045, LEG_R = 0.05;
const CAPE = { outer: 'cape', hat: 'none', neck: 'none', back: 'none', hand: 'none' };
const LOOKS = [
  { name: '學徒', L: {} },
  { name: '胖', L: { fat: 10 } },
  { name: '瘦高', L: { fat: 0, tall: 10 } },
  { name: '大頭', L: { head: 10 } },
  { name: '長髮', L: { hair: 'long' } },
  { name: '爆炸頭', L: { hair: 'afro' } },
  { name: '矮人', L: { race: 'dwarf' } },
  { name: '精靈', L: { race: 'elf', hair: 'long' } },
  { name: '牛', L: { race: 'bull' } },
  { name: '背包', L: { back: 'backpack' } },
  { name: '吉他', L: { back: 'guitar' } },
  { name: '翅膀', L: { back: 'wingA' } },
  { name: '尾巴', L: { back: 'tail' } },
  { name: '弓箭', L: { back: 'bowpack' } },
  { name: '相機', L: {}, cam: 'bulb' },
];
const ITEMS = ['none', 'staff', 'spear', 'bow', 'sword', 'lantern', 'umbrella'];

const ch = new Character(null, {});
const inv = new THREE.Matrix4(), v = new THREE.Vector3(), w = new THREE.Vector3();
const shapes = new Map();
const shapeFor = (geo) => { if (!shapes.has(geo)) shapes.set(geo, shapeOf([{ geo }])); return shapes.get(geo); };

function reset(look, item) {
  ch.setLook({ ...presetLook(2), ...CAPE, ...look.L, hand: item });
  ch.setCamera(look.cam || null);
  ch.sitting = ch.lying = false;
  ch.lift = 0;
  ch.act = null;
  ch.setAim(null);
  ch.setKao(0);
  ch.brace(false);
  ch.gaze = null;
  ch.jumpV = ch.jumpY = ch.preT = 0;
  ch.swX = ch.swZ = ch.swVX = ch.swVZ = 0;
  ch.hpOk = ch.hvOk = false;
  ch.sitP = ch.lieP = 0;
  ch.head.rotation.set(0, 0, 0);
  for (let i = 0; i < 3; i++) { ch.group.position.set(0, 0, 0); ch.update(1, 0); }
  // 暖身用一秒一步，手上的東西會被甩到底：歸零再開始
  ch.swX = ch.swZ = ch.swVX = ch.swVZ = 0;
  ch.hpOk = ch.hvOk = false;
}
const run = (n, speed = 0, each = null) => {
  for (let i = 0; i < n; i++) {
    ch.group.position.set(0, 0, 0);
    ch.update(1 / 60, speed);
    if (each && i % 6 === 5) { ch.group.updateMatrixWorld(true); each(); }
  }
  ch.group.updateMatrixWorld(true);
};

// 披風外層的三角形（身體座標）：外層的點編號在前半
function outerTris() {
  const g = ch.capeMesh.geometry, P = g.attributes.position.array, I = g.index.array, NV = P.length / 6, out = [];
  for (let t = 0; t < I.length; t += 3) {
    if (I[t] >= NV || I[t + 1] >= NV || I[t + 2] >= NV) continue;
    out.push([I[t], I[t + 1], I[t + 2]].map((k) => new THREE.Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2])));
  }
  return out;
}
const ray = new THREE.Ray(), hit = new THREE.Vector3();
// 身體座標的一點 p 在披風哪一邊：從同高的中線往 p 看，到 p 之前穿過披風外層奇數次就在外面（回傳穿出去多遠，正的），
// 不然看 p 再往外多遠碰到披風（在裡面，回傳負的距離）；這個方向沒有披風回傳 0
function side(tris, p) {
  const o = new THREE.Vector3(0, p.y, 0), len = Math.hypot(p.x, p.z);
  if (len < 1e-4) return 0;
  ray.set(o, new THREE.Vector3(p.x, 0, p.z).divideScalar(len));
  let n = 0, near = Infinity, far = Infinity;
  for (const [a, b, c] of tris) {
    if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
    const d = hit.distanceTo(o);
    if (d < len) { n++; near = Math.min(near, d); } else far = Math.min(far, d);
  }
  return n % 2 ? len - near : far < Infinity ? -(far - len) : 0;
}
// 一樣東西（一串點，各自有粗細 r）穿過披風多深：裡外都有點才算穿過去，取淺的那邊（整個在外面或整個在裡面都不算）
function cross(tris, pts) {
  let out = 0, inn = 0;
  for (const [p, r] of pts) {
    const q = Math.hypot(p.x, p.z);
    const at = (k) => (q > 1e-4 ? new THREE.Vector3(p.x * (q + k) / q, p.y, p.z * (q + k) / q) : p);
    out = Math.max(out, side(tris, at(r)));
    inn = Math.max(inn, -side(tris, at(-r)));
  }
  return Math.min(out, inn);
}

function measure(look) {
  const out = [];
  const add = (what, d) => { if (d > MIN) out.push({ what, d }); };
  const tris = outerTris();
  inv.copy(ch.body.matrixWorld).invert();
  const toBody = (p) => p.clone().applyMatrix4(inv);
  const limb = (j, L, r) => { const pts = []; for (let t = 0.1; t <= 1.001; t += 0.1) pts.push([toBody(new THREE.Vector3(0, -L * t, 0).applyMatrix4(j.matrixWorld)), r]); return pts; };
  add('右手臂', cross(tris, limb(ch.armL, 0.33, ARM_R)));
  add('左手臂', cross(tris, limb(ch.armR, 0.33, ARM_R)));
  add('左腿', cross(tris, limb(ch.footL, 0.42 * ch.S.leg, LEG_R)));
  add('右腿', cross(tris, limb(ch.footR, 0.42 * ch.S.leg, LEG_R)));
  const P = ch.clear.pts;
  if (P && ch.handMesh.visible && ch.handSwing.visible) {
    const pts = [];
    for (let i = 0; i < P.length; i += 3) pts.push([toBody(v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(ch.handMesh.matrixWorld)), 0.01]);
    add('手上的東西', cross(tris, pts));
  }
  // 披風的點陷進身體、頭：碰地壓平的點不算（躺下時本來就墊在身體底下）
  const g = ch.capeMesh.geometry.attributes.position, floorY = 0.005;
  const torso = look.L.back && look.L.back !== 'none' ? null : shapeFor(ch.torso.geometry), head = shapeFor(ch.headMesh.geometry);
  const headInv = new THREE.Matrix4().copy(ch.headMesh.matrixWorld).invert(), hk = w.setFromMatrixColumn(ch.headMesh.matrixWorld, 0).length();
  const bk = w.setFromMatrixColumn(ch.body.matrixWorld, 0).length();
  let dT = 0, dH = 0;
  for (let i = 0; i < g.count; i++) {
    v.fromBufferAttribute(g, i);
    const world = v.clone().applyMatrix4(ch.capeMesh.matrixWorld);
    if (world.y < floorY + 0.004) continue;
    if (torso) dT = Math.max(dT, depth(torso, v.x, v.y, v.z, 0) * bk);
    const hv = world.applyMatrix4(headInv);
    dH = Math.max(dH, depth(head, hv.x, hv.y, hv.z, 0) * hk);
  }
  add('披風→身體', dT);
  add('披風→頭', dH);
  return out;
}

const rows = [];
const t0 = Date.now();
let poses = 0;
const take = (look, item, pose) => { poses++; for (const r of measure(look)) rows.push({ ...r, look: look.name, item, pose }); };
for (const look of LOOKS) {
  for (const item of ITEMS) {
    reset(look, item); run(30); take(look, item, '站');
    reset(look, item); run(90, 2.6, () => take(look, item, '走'));
    reset(look, item); run(90, 5, () => take(look, item, '跑'));
    reset(look, item); ch.jumpY = 2; ch.jumpV = -5; run(8); take(look, item, '往下掉');
    for (const [gz, gp] of [[1.2, 0], [-1.2, 0], [0, 0.5], [0, -0.5]]) { reset(look, item); ch.gaze = gz; ch.gazeP = gp; run(60); take(look, item, `轉頭${gz},${gp}`); }
    reset(look, item); ch.sitting = true; run(90); take(look, item, '坐地上');
    reset(look, item); ch.sitting = true; ch.lift = 0.45; run(90); take(look, item, '坐椅子');
    reset(look, item); ch.sitting = ch.lying = true; ch.update(1, 0); run(90); take(look, item, '躺');
    if (look.cam) for (let grip = 0; grip <= 4; grip++) { reset(look, item); ch.setAim({ grip, pitch: 0 }); run(60); take(look, item, `舉相機${grip}`); }
    if (item !== 'none' && item !== 'staff') continue;   // 顏文字只跟空手、法杖排（其他東西手勢一樣）
    for (let h = 0; h < HANDS.length; h++) for (let b = 0; b < BODIES.length; b++) {
      reset(look, item);
      ch.setKao(kaoCode(1, h, b));
      ch.brace(true);
      run(50);
      take(look, item, kaoText(1, h, b));
    }
  }
}
const cm = (d) => `${(d * 100).toFixed(1)} 公分`;
console.log(`擺了 ${poses} 個姿勢，${((Date.now() - t0) / 1000).toFixed(1)} 秒；穿 ${cm(MIN)} 以上的有 ${rows.length} 處\n`);
rows.sort((a, b) => b.d - a.d);
for (const r of rows.slice(0, TOP)) console.log(`  ${cm(r.d).padStart(9)}  ${r.what.padEnd(7)}  ${String(r.pose).padEnd(14)}  ${r.item.padEnd(8)}  ${r.look}`);
const by = new Map();
for (const r of rows) { const k = r.what; by.set(k, Math.max(by.get(k) || 0, r.d)); }
if (by.size) console.log('\n每一類最糟：' + [...by].map(([k, d]) => `${k} ${cm(d)}`).join('　'));
// 每一類最糟的幾個（不同姿勢）
for (const k of by.keys()) {
  const seen = new Set(), list = rows.filter((r) => r.what === k && !seen.has(r.pose + r.look) && seen.add(r.pose + r.look)).slice(0, 6);
  console.log(`\n${k}：` + list.map((r) => `${cm(r.d)} ${r.pose}/${r.item}/${r.look}`).join('　'));
}
