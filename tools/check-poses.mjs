// 顏文字姿勢穿模檢查：每樣手上的東西 × 每種手勢 × 每種身體（再換幾頂帽子、胖瘦）在 Node 裡擺好、撐著，
// 量最後畫出來的網格穿進去多深：手上的東西對身體、頭、帽子、胸前的相機、拿著它的手臂（手心握的那段不算）、另一隻手、地板；兩隻手對頭、帽子，手心對身體、地板。
// 站著拿東西就穿的另外列在最前面（顏文字的統計會扣掉它們）
// 新增手上的東西、手勢、身體、帽子之後跑一次，列出最糟的組合，再去 experiments/clip_sheet.html?set=kaohand 看圖。
//   node tools/check-poses.mjs                 全部，印最糟的 30 個、每種手勢和身體各自最糟的
//   node tools/check-poses.mjs --top=60        多印幾個
//   node tools/check-poses.mjs --hand=staff    只看一樣東西（逗號隔開）
//   node tools/check-poses.mjs --min=0.02      穿不到這麼深（公尺）的不算
import { installDom } from './zone-env.mjs';

installDom();
const THREE = await import('three');
const { Character } = await import('../js/avatar/character.js');
const { OPTIONS, presetLook } = await import('../js/avatar/looks.js');
const { HANDS, BODIES, kaoCode, kaoText } = await import('../js/avatar/kaomoji-parts.js');
const { shapeOf, depth } = await import('../js/avatar/handclear.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const TOP = +opt('top', 30), MIN = +opt('min', 0.015);
const items = opt('hand', null)?.split(',') ?? OPTIONS.hand.map(([id]) => id);
const PALM = 0.33, ARM_R = 0.045, GRIP = 0.08;   // GRIP：離手心這麼近的算握在手裡，不算穿進手臂（handclear.js 同一個數）
// 外觀：預設學徒（尖帽）、斗笠（帽緣寬）、不戴帽子胖一點、竹蜻蜓、帶相機
const LOOKS = [
  { name: '尖帽', L: {} },
  { name: '斗笠', L: { hat: 'straw' } },
  { name: '胖', L: { hat: 'none', fat: 10 } },
  { name: '相機', L: { hat: 'propeller' }, cam: 'bulb' },
];

const ch = new Character(null, {});
const v = new THREE.Vector3(), w = new THREE.Vector3(), inv = new THREE.Matrix4(), seg = new THREE.Line3();
const meshShape = new Map();
// 網格量成「高度 × 方位 → 最遠半徑」的表（handclear.js 那套），同一個幾何只量一次
const shapeFor = (mesh) => {
  if (!mesh.visible || !mesh.geometry?.attributes?.position?.count) return null;
  if (!meshShape.has(mesh.geometry)) meshShape.set(mesh.geometry, shapeOf([{ geo: mesh.geometry }]));
  return meshShape.get(mesh.geometry);
};
// 世界座標的一點陷進網格多深（公尺）
const sink = (mesh, sh, p, m = 0) => {
  if (!sh) return 0;
  inv.copy(mesh.matrixWorld).invert();
  v.copy(p).applyMatrix4(inv);
  const k = w.setFromMatrixColumn(mesh.matrixWorld, 0).length();
  return depth(sh, v.x, v.y, v.z, m / k) * k;
};
const armSeg = (arm, out) => {
  out.start.set(0, 0, 0).applyMatrix4(arm.matrixWorld);
  out.end.set(0, -PALM, 0).applyMatrix4(arm.matrixWorld);
  return out;
};

function pose(look, code) {
  ch.setLook({ ...presetLook(2), neck: 'none', back: 'none', ...look.L });
  ch.setCamera(look.cam || null);
  ch.sitting = ch.lying = false;
  ch.lift = 0;
  ch.act = null;
  ch.setAim(null);
  ch.setKao(0);
  ch.swX = ch.swZ = ch.swVX = ch.swVZ = 0;
  ch.hpOk = ch.hvOk = false;
  for (let i = 0; i < 3; i++) { ch.group.position.set(0, 0, 0); ch.update(1, 0); }
  ch.setKao(code);
  ch.brace(true);
  for (let i = 0; i < 50; i++) { ch.group.position.set(0, 0, 0); ch.update(1 / 60, 0); }
  ch.group.updateMatrixWorld(true);
}

// 量一個擺好的姿勢：回傳 [{ what, d }]，d 是公尺
function measure() {
  const out = [];
  const add = (what, d) => { if (d > MIN) out.push({ what, d }); };
  const torso = [ch.torso, shapeFor(ch.torso)], head = [ch.headMesh, shapeFor(ch.headMesh)], hat = [ch.hatMesh, shapeFor(ch.hatMesh)];
  const cam = ch.camMesh.visible && ch.camMesh.geometry.attributes.position?.count ? [ch.camMesh, shapeFor(ch.camMesh)] : null;
  const other = armSeg(ch.armR, new THREE.Line3()), own = armSeg(ch.armL, new THREE.Line3());
  // 手上的東西：網格上取的點（handclear 量好的）
  const P = ch.clear.pts;
  if (P && ch.handMesh.visible && ch.handSwing.visible) {
    let dT = 0, dH = 0, dC = 0, dF = 0, dA = 0, dK = 0, dO = 0;
    const p = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 3) {
      p.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(ch.handMesh.matrixWorld);
      dT = Math.max(dT, sink(...torso, p));
      dH = Math.max(dH, sink(...head, p));
      dC = Math.max(dC, sink(...hat, p));
      if (cam) dK = Math.max(dK, sink(...cam, p));
      dF = Math.max(dF, -p.y);
      other.closestPointToPoint(p, true, c);
      dA = Math.max(dA, ARM_R - p.distanceTo(c));
      if (p.distanceTo(own.end) > GRIP) { own.closestPointToPoint(p, true, c); dO = Math.max(dO, ARM_R - p.distanceTo(c)); }
    }
    add('東西→身體', dT); add('東西→頭', dH); add('東西→帽子', dC); add('東西→相機', dK); add('東西→地板', dF); add('東西→左手', dA); add('東西→右手臂', dO);
  }
  // 兩隻手：從手肘那段到手心對頭和帽子，手心對身體和地板
  for (const [arm, name] of [[ch.armL, '右手'], [ch.armR, '左手']]) {
    const s = armSeg(arm, new THREE.Line3()), p = new THREE.Vector3();
    let dH = 0, dC = 0, dT = 0;
    for (let t = 0.4; t <= 1.001; t += 0.15) {
      s.at(t, p);
      dH = Math.max(dH, sink(...head, p, ARM_R));
      dC = Math.max(dC, sink(...hat, p, ARM_R));
    }
    dT = sink(...torso, s.end, ARM_R * 0.6);
    add(`${name}→頭`, dH); add(`${name}→帽子`, dC); add(`${name}手心→身體`, dT); add(`${name}手心→地板`, ARM_R * 0.5 - s.end.y);
  }
  return out;
}

const rows = [];
const t0 = Date.now();
for (const look of LOOKS) {
  for (const item of items) {
    look.L.hand = item;
    for (let h = 0; h < HANDS.length; h++) {
      for (let b = 0; b < BODIES.length; b++) {
        const code = kaoCode(1, h, b);
        pose(look, code);
        for (const r of measure()) rows.push({ ...r, look: look.name, item, h, b, text: kaoText(1, h, b) });
      }
    }
  }
}
// 不擺的時候本來就穿的（站著拿東西）不算顏文字的帳：同一個外觀、東西、同一種穿法，站著也有的扣掉
const base = new Map();
for (const look of LOOKS) for (const item of items) {
  look.L.hand = item;
  pose(look, 0);
  for (const r of measure()) base.set(`${look.name}|${item}|${r.what}`, r.d);
}
const still = [...base].filter(([, d]) => d > MIN).sort((a, b) => b[1] - a[1]);
if (still.length) {
  console.log(`站著拿東西就穿的 ${still.length} 處（下面顏文字的統計已扣掉）：`);
  for (const [k, d] of still.slice(0, TOP)) { const [look, item, what] = k.split('|'); console.log(`  ${(d * 100).toFixed(1).padStart(5)} 公分  ${what.padEnd(8)}  ${item}  ${look}`); }
  console.log('');
}
const worse = rows.map((r) => ({ ...r, d: r.d - (base.get(`${r.look}|${r.item}|${r.what}`) || 0) })).filter((r) => r.d > MIN);

const cm = (d) => `${(d * 100).toFixed(1)} 公分`;
console.log(`擺了 ${LOOKS.length * items.length * HANDS.length * BODIES.length} 個姿勢，${((Date.now() - t0) / 1000).toFixed(1)} 秒；站著本來就穿的已扣掉，穿 ${cm(MIN)} 以上的有 ${worse.length} 處\n`);
worse.sort((a, b) => b.d - a.d);
console.log(`最糟的 ${Math.min(TOP, worse.length)} 處：`);
for (const r of worse.slice(0, TOP)) console.log(`  ${cm(r.d).padStart(9)}  ${r.what.padEnd(8)}  ${r.text.padEnd(14)}  手${r.h} 身${r.b}  ${r.item}  ${r.look}`);
// 照手勢、身體各自統計：哪個零件最常出事
const by = (key, list, name) => {
  const m = new Map();
  for (const r of worse) {
    const k = r[key];
    const o = m.get(k) || { n: 0, d: 0, what: new Map() };
    o.n++; o.d = Math.max(o.d, r.d); o.what.set(r.what, (o.what.get(r.what) || 0) + 1);
    m.set(k, o);
  }
  console.log(`\n每種${name}：`);
  for (const [k, o] of [...m].sort((a, b) => b[1].n - a[1].n)) {
    const top = [...o.what].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, n]) => `${w}×${n}`).join('、');
    console.log(`  ${String(list(k)).padEnd(14)} ${String(o.n).padStart(4)} 處  最深 ${cm(o.d)}  ${top}`);
  }
};
by('h', (h) => HANDS[h].w, '手勢');
by('b', (b) => BODIES[b].w, '身體');
by('item', (i) => i, '東西');
process.exit(0);
