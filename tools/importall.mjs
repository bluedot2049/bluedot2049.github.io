// 在 Node 裡把 js/ 底下每一個模組 import 一次（假的 DOM），抓 import 路徑錯、匯出名字對不上、重複宣告這種一載入就炸的錯。
// 比 smoke.mjs 快很多（幾秒），改完 import、搬檔先跑這個；畫面有沒有變還是要 smoke
//   node tools/importall.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDom, ROOT } from './zone-env.mjs';

installDom();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = walk(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !f.includes(`${path.sep}boot${path.sep}`)).sort();
let bad = 0;
for (const f of files) {
  try {
    await import(pathToFileURL(f).href);
  } catch (e) {
    const msg = String(e && (e.stack || e.message || e)).split('\n');
    // 真的 DOM 才有的東西（畫布、音訊）在 Node 沒有：這種不算
    const dom = /is not a function|Cannot read properties of undefined|is not defined|not a constructor/.test(msg[0]) && !/does not provide an export|already been declared|Cannot find module|Unexpected token|SyntaxError/.test(msg[0]);
    if (dom) continue;
    bad++;
    console.log(`✗ ${path.relative(ROOT, f)}\n    ${msg.slice(0, 2).join('\n    ')}`);
  }
}
console.log(bad ? `有 ${bad} 個模組載不進來` : `✓ ${files.length} 個模組都載得進來`);
process.exit(bad ? 1 : 0);
