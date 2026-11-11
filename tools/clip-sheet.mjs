// 穿模總表拍圖：無頭 Edge 開 experiments/clip_sheet.html，整張切成一段一段存到 tools/out/clip/（長圖一次看不清楚）。
//   node tools/clip-sheet.mjs racehat                         一組（clip_sheet.html 開頭列了有哪些 set）
//   node tools/clip-sheet.mjs racehat hood raceneck           好幾組
//   node tools/clip-sheet.mjs "raceback&rows=frog,tv&look={\"head\":9}&cell=200"    後面照樣接 clip_sheet.html 的參數
//   名字=參數：存檔的名字自己取（同一組拍兩種參數時）　@4x7：每段幾欄 × 幾列（預設 4x7）
// 改了頭、帽子、衣服、背的東西之後拍相關的幾組，一段一段看；每段的檔名、列、欄印在畫面上
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser, sleep, ROOT } from './headless.mjs';

const OUT = path.join(ROOT, 'tools/out/clip');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8178;
const jobs = process.argv.slice(2);
if (!jobs.length) { console.log('用法：node tools/clip-sheet.mjs <set>[&參數][@欄x列] ...'); process.exit(1); }
const b = await openBrowser({ port: PORT, dbg: 9378, window: '1200,900' });
for (const job of jobs) {
  const [, named, rest, tc = 4, tr = 7] = /^(?:([\w-]+)=)?(.*?)(?:@(\d+)x(\d+))?$/.exec(job);
  const query = /^set=/.test(rest) ? rest : 'set=' + rest, name = named || /set=([\w-]+)/.exec(query)[1];
  await b.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/experiments/clip_sheet.html?${encodeURI(query)}` });
  let ok = false;
  for (let i = 0; i < 900 && !ok; i++) { await sleep(300); ok = await b.ev(`!!document.getElementById('out')`).catch(() => false); }
  if (!ok) { console.log(name, '沒拍完'); continue; }
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(name + '-r')) fs.rmSync(path.join(OUT, f));
  // 每段都帶著左邊的列名和上面的欄名
  const n = await b.ev(`(() => {
    const c = document.querySelector('canvas'), { CELL, LAB, HEAD, vw, rows, cols } = window.sheetInfo, tc = ${+tc}, tr = ${+tr};
    window.tiles = [];
    for (let r0 = 0; r0 < rows.length; r0 += tr) for (let c0 = 0; c0 < cols.length; c0 += tc) {
      const nr = Math.min(tr, rows.length - r0), nc = Math.min(tc, cols.length - c0), w = nc * CELL * vw, h = nr * CELL;
      const t = document.createElement('canvas'); t.width = LAB + w; t.height = HEAD + h;
      const g = t.getContext('2d');
      g.fillStyle = '#2a1d15'; g.fillRect(0, 0, t.width, t.height);
      g.drawImage(c, 0, HEAD + r0 * CELL, LAB, h, 0, HEAD, LAB, h);
      g.drawImage(c, LAB + c0 * CELL * vw, 0, w, HEAD, LAB, 0, w, HEAD);
      g.drawImage(c, LAB + c0 * CELL * vw, HEAD + r0 * CELL, w, h, LAB, HEAD, w, h);
      window.tiles.push({ r0, c0, url: t.toDataURL('image/png'), rows: rows.slice(r0, r0 + nr), cols: cols.slice(c0, c0 + nc) });
    }
    return window.tiles.length;
  })()`);
  for (let i = 0; i < n; i++) {
    const t = await b.ev(`window.tiles[${i}]`), f = `${name}-r${t.r0}-c${t.c0}.png`;
    fs.writeFileSync(path.join(OUT, f), Buffer.from(t.url.split(',')[1], 'base64'));
    console.log(`tools/out/clip/${f}｜${t.rows.join(',')}｜${t.cols.join(',')}`);
  }
}
b.close();
process.exit(0);
