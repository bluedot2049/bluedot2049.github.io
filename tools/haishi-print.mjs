// 海市的指紋：在 Node 裡把海市建出來，把每個物件的位置、每個網格的頂點、材質顏色算成一串雜湊。
// 拆檔、整理程式之後跑一次，跟之前的比，一模一樣才表示蓋出來的東西沒變（亂數多抽少抽一次都會不同）。
//   node tools/haishi-print.mjs            印出雜湊
//   node tools/haishi-print.mjs --save     存成 tools/out/haishi-print.txt
//   node tools/haishi-print.mjs --diff     跟存好的比，列出第一個不一樣的物件
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let s = 12345;
Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
const { w, scene: root, ROOT } = await import('./haishi-env.mjs');

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
// 走得到的地方、碰撞、尋路用的資料
const dbg = w.debug || {};
for (const k of Object.keys(dbg).sort()) {
  const v = dbg[k];
  if (typeof v !== 'function') lines.push(`debug.${k} ` + crypto.createHash('md5').update(JSON.stringify(v) ?? '').digest('hex').slice(0, 10));
}
for (let x = -40; x <= 40; x += 3.7) for (let z = -120; z <= 30; z += 4.3) lines.push(`floor ${r(x)},${r(z)} ${r(w.groundY(x, z, 50))} ${r(dbg.terrain(x, z))} ${w.walkable(x, z) ? 1 : 0} ${r(w.camFloor?.(x, z) ?? NaN)}`);

const OUT = path.join(ROOT, 'tools/out/haishi-print.txt');
const hash = crypto.createHash('md5').update(lines.join('\n')).digest('hex');
console.log(`海市指紋 ${hash}（${lines.length} 行）`);
if (process.argv.includes('--save')) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, lines.join('\n')); console.log('存好 tools/out/haishi-print.txt'); }
if (process.argv.includes('--diff')) {
  const old = fs.readFileSync(OUT, 'utf8').split('\n');
  const i = old.findIndex((l, i) => l !== lines[i]);
  if (i < 0 && old.length === lines.length) console.log('✓ 跟存好的一模一樣');
  else { console.log(`✗ 第 ${i + 1} 行開始不同（之前 ${old.length} 行，現在 ${lines.length} 行）\n  之前 ${old[i]}\n  現在 ${lines[i]}`); process.exit(1); }
}
