// 冒煙測試：改完程式（尤其是搬檔、拆檔）跑一次，確認每一區都載得起來、沒有錯誤。
//   node tools/smoke.mjs                 三個區域＋experiments 的預覽頁
//   node tools/smoke.mjs --save base     指紋存成 tools/out/smoke-base.json
//   node tools/smoke.mjs --diff base     跟存好的指紋比對，場景有任何不同就列出來
// 每一區：無頭 Edge 開 ?q=mid&debug&crowd=0，亂數固定成同一串，等載入畫面收掉，記下
//   頁面錯誤、console.error、載不到的檔案（404）
//   場景指紋：每種物件幾個、頂點總數、材質種類。同樣的亂數，搬檔前後應該一模一樣
// 最後在頁面裡把 js/ 底下每一個檔案都 import 一次：沒被這三區載到的模組，路徑寫錯也抓得到
// 截圖存在 tools/out/smoke-<區域>.png，要看畫面時打開對照
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/out');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const saveAs = arg('--save'), diffWith = arg('--diff');
const ZONES = ['gallery', 'haishi', 'shenlou'];
const PORT = 8173, DBG = 9373;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json' };

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const MODULES = walk(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.relative(ROOT, f).replaceAll('\\', '/')).sort();
const PAGES = fs.readdirSync(path.join(ROOT, 'experiments')).filter((f) => f.endsWith('.html')).map((f) => 'experiments/' + f);

fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
}).listen(PORT);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tgt;
for (let i = 0; i < 90 && !tgt; i++) {
  try { tgt = (await (await fetch(`http://127.0.0.1:${DBG}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!tgt) await sleep(1000);
}
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0, problems = [];
const wait = new Map();
const local = (u) => u.startsWith(`http://127.0.0.1:${PORT}/`);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') problems.push('錯誤 ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && local(d.params.response.url) && !d.params.response.url.endsWith('/favicon.ico')) problems.push(`${d.params.response.status} ${d.params.response.url.slice(22)}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
// 亂數固定：每次重新整理都從同一個種子開始。時鐘也從同一刻（台灣時間 11/1 晚上八點）開始走：訪客、船照真實時間排班，每次才會一樣
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const RD = Date, T0 = RD.UTC(2026, 10, 1, 12), P0 = performance.now(), now = () => T0 + (performance.now() - P0);
  class D extends RD { constructor(...a) { super(...(a.length ? a : [now()])); } static now() { return now(); } }
  globalThis.Date = D;
})();` });

const prints = {};
let bad = 0;
const report = (name, extra = '') => {
  console.log(problems.length ? `✗ ${name}${extra}` : `✓ ${name}${extra}`);
  for (const p of [...new Set(problems)]) console.log('    ' + p);
  bad += problems.length;
  problems = [];
};

for (const zone of ZONES) {
  // 測試用的瀏覽器每次都是新的：清掉存檔，大家都從第一次來開始
  await send('Network.clearBrowserCookies');
  await ev(`try { localStorage.clear(); } catch (e) {}`).catch(() => {});
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?z=${zone}&q=mid&debug&crowd=0&from=${zone === 'gallery' ? 'haishi' : 'gallery'}` });
  let ok = false;
  for (let i = 0; i < 240 && !ok; i++) {
    await sleep(250);
    ok = await ev(`!!window.__g && document.getElementById('loading')?.classList.contains('done')`).catch(() => false);
  }
  if (!ok) problems.push('載入畫面一直沒收掉');
  await sleep(1500);
  prints[zone] = ok ? await ev(`(() => {
    const kinds = {}, mats = {};
    let verts = 0, root = __g.player.character.group;
    while (root.parent) root = root.parent;
    root.traverse((o) => {
      kinds[o.type] = (kinds[o.type] || 0) + 1;
      if (o.geometry?.attributes?.position) verts += o.geometry.attributes.position.count * (o.instanceMatrix?.count || 1);
      for (const m of [].concat(o.material || [])) mats[m.type] = (mats[m.type] || 0) + 1;
    });
    const list = [];
    const skip = (o) => { for (let p = o; p; p = p.parent) if (p.userData.character) return true; return false; };
    root.traverse((o) => { if (o.geometry?.attributes?.position && !skip(o)) {
      // 頂點座標的校驗和：形狀、擺的位置（合併過的網格）有一點不同就會變。粒子（煙、光點）每幀在動，不算
      const a = o.geometry.attributes.position.array;
      let sum = 0;
      if (!o.isPoints) for (let i = 0; i < a.length; i++) sum += a[i] * ((i % 7) + 1);
      list.push(o.type + ':' + (o.name || o.parent?.name || '') + ':' + o.geometry.attributes.position.count + 'x' + (o.instanceMatrix?.count || 1) + ':' + sum.toFixed(2));
    } });
    return { kinds, mats, verts, list: list.sort() };
  })()`).catch((e) => (problems.push('指紋 ' + e.message), null)) : null;
  if (ok) {
    const png = await ev(`new Promise((res) => {
      const g = __g, after = g.photo.afterRender;
      g.photo.afterRender = function () { after.call(this); g.photo.afterRender = after; res(g.renderer.domElement.toDataURL('image/png')); };
      setTimeout(() => res(null), 3000);
    })`).catch(() => null);
    if (png) fs.writeFileSync(path.join(OUT, `smoke-${zone}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  report(zone, prints[zone] ? `  頂點 ${prints[zone].verts}` : '');
}

// 每一個模組都 import 一次（在畫廊頁裡，importmap 已經有了）
const failed = await ev(`Promise.all(${JSON.stringify(MODULES)}.map((f) => import('./' + f).then(() => null, (e) => f + ': ' + e.message))).then((r) => r.filter(Boolean))`).catch((e) => [e.message]);
problems.push(...failed);
report(`import 全部 ${MODULES.length} 個模組`);

for (const page of PAGES) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
  await sleep(4000);
  report(page);
}

if (saveAs) {
  fs.writeFileSync(path.join(OUT, `smoke-${saveAs}.json`), JSON.stringify(prints, null, 1));
  console.log(`指紋存好：tools/out/smoke-${saveAs}.json`);
}
if (diffWith) {
  const base = JSON.parse(fs.readFileSync(path.join(OUT, `smoke-${diffWith}.json`), 'utf8'));
  for (const zone of ZONES) {
    // 逐一比對每個有網格的物件（種類:名字:頂點數x實例數），列出多的、少的
    // 海市偶爾會差一兩個沒名字的網格（載入時機不同），連跑兩次都一樣才算真的不同
    const count = (l) => (l || []).reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    const a = count(base[zone]?.list), b = count(prints[zone]?.list), diff = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) || 0) !== (b.get(k) || 0)) diff.push(`${k}  ${a.get(k) || 0} → ${b.get(k) || 0}`);
    console.log(diff.length ? `✗ ${zone} 指紋不同\n    ${diff.join('\n    ')}` : `✓ ${zone} 指紋一樣`);
    if (diff.length) bad++;
  }
}
ws.close();
edge.kill();
srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
console.log(bad ? `\n有 ${bad} 個問題` : '\n全部通過');
process.exit(bad ? 1 : 0);
