// 一區的指紋：在 Node 裡把那一區建出來，每個物件的位置、每個網格的頂點、材質顏色算成一串雜湊。
// 拆檔、整理程式之後跑一次，跟之前的比，一模一樣才表示蓋出來的東西沒變（亂數多抽少抽一次都會不同）。
// 海市另有 tools/haishi-print.mjs（連走得到的地面都逐點比，海市改地圖用那個）；這個每一區都能跑，畫廊要讀 gallery.json
//   node tools/zone-print.mjs ting            印出雜湊
//   node tools/zone-print.mjs ting --save     存成 tools/out/print-ting.txt
//   node tools/zone-print.mjs ting --diff     跟存好的比，列出第一個不一樣的物件
//   node tools/zone-print.mjs all --save      每一區（gallery、haishi、shenlou、ting、jinghai、jinggong）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { installDom, buildZone, ROOT } from './zone-env.mjs';

const ALL = ['gallery', 'haishi', 'shenlou', 'ting', 'jinghai', 'jinggong'];
const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const zones = which === 'all' ? ALL : [which];
const save = process.argv.includes('--save'), diff = process.argv.includes('--diff');
let bad = 0;

for (const zone of zones) {
  // 每一區都從同一串亂數開始；時鐘也釘在同一刻（有些東西照時間擺）
  let s = 12345;
  Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const T0 = Date.UTC(2026, 10, 1, 12);
  Date.now = () => T0;
  installDom();
  let built;
  try {
    built = await buildZone(zone);
  } catch (e) {
    console.log(`✗ ${zone} 在 Node 裡建不起來：${String(e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
    bad++;
    continue;
  }
  const { scene: root, w } = built;
  const lines = [];
  const r = (v) => (Math.round(v * 1e4) / 1e4).toString();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const e = o.matrixWorld.elements;
    let line = `${o.type} ${o.name} ${[12, 13, 14].map((i) => r(e[i])).join(',')}`;
    const pos = o.geometry?.attributes?.position;
    if (pos) line += ` v${pos.count} ` + crypto.createHash('md5').update(Buffer.from(pos.array.buffer, pos.array.byteOffset, pos.array.byteLength)).digest('hex').slice(0, 10);
    if (o.instanceMatrix) line += ' i' + crypto.createHash('md5').update(Buffer.from(o.instanceMatrix.array.buffer)).digest('hex').slice(0, 10);
    for (const m of [].concat(o.material || [])) line += ` ${m.type}${m.color ? ':' + m.color.getHexString() : ''}`;
    lines.push(line);
  });
  // 走得到的地方、地面高度：照場景的範圍取樣（有 groundY、walkable 才取）
  if (typeof w?.groundY === 'function' || typeof w?.walkable === 'function') {
    // 鏡宮有一塊每幀重算的幾何（位置還沒填），算範圍時 three.js 會印警告，先關掉
    const warn = console.warn;
    console.warn = () => {};
    const box = new built.THREE.Box3().setFromObject(root);
    console.warn = warn;
    const x0 = Math.max(-300, box.min.x), x1 = Math.min(300, box.max.x), z0 = Math.max(-300, box.min.z), z1 = Math.min(300, box.max.z);
    for (let x = x0; x <= x1; x += 3.7) for (let z = z0; z <= z1; z += 4.3) {
      let g = NaN, k = 0;
      try { g = w.groundY?.(x, z) ?? NaN; } catch {}
      try { k = w.walkable?.(x, z) ? 1 : 0; } catch {}
      lines.push(`floor ${r(x)},${r(z)} ${Number.isFinite(g) ? r(g) : 'NaN'} ${k}`);
    }
  }
  const OUT = path.join(ROOT, `tools/out/print-${zone}.txt`);
  const hash = crypto.createHash('md5').update(lines.join('\n')).digest('hex');
  console.log(`${zone} 指紋 ${hash}（${lines.length} 行）`);
  if (save) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, lines.join('\n')); console.log(`  存好 tools/out/print-${zone}.txt`); }
  if (diff) {
    if (!fs.existsSync(OUT)) { console.log('  ✗ 還沒存過，先 --save'); bad++; continue; }
    const old = fs.readFileSync(OUT, 'utf8').split('\n');
    const i = old.findIndex((l, i) => l !== lines[i]);
    if (i < 0 && old.length === lines.length) console.log('  ✓ 跟存好的一模一樣');
    else { console.log(`  ✗ 第 ${i + 1} 行開始不同（之前 ${old.length} 行，現在 ${lines.length} 行）\n    之前 ${old[i]}\n    現在 ${lines[i]}`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
