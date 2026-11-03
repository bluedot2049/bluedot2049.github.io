// 渡海過場用的目的地空拍：用無頭 Edge 開遊戲，把鏡頭擺到 aerial-shots.json 記的機位，藏起自己和路人，拍下畫布。
//   node tools/aerial.mjs                 每一區、每個機位都拍
//   node tools/aerial.mjs haishi          只拍海市
//   node tools/aerial.mjs haishi 後山     只拍海市名字含「後山」的機位
//   node tools/aerial.mjs --encode        不重拍，只把 tools/out/aerial/ 裡的原圖重新壓一次
// 機位：pos 鏡頭位置、look 看哪裡、fov 直的視角（度）、size 寬,高（橫的 1920,1080，直的 1080,2160）。
// 用兩倍解析度畫（中畫質，無頭模式開高畫質是黑的），原圖存 tools/out/aerial/，再交給 ffmpeg 縮小、轉 AVIF/WebP，放進 assets/aerial/。
// AVIF 用 10 位元：夜空是一大片很暗的漸層，8 位元會出現一圈一圈的色階。crf 30 以上燈籠和路燈柱就糊了
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/out/aerial');
const WEB = path.join(ROOT, 'assets/aerial');
const SHOTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/aerial-shots.json'), 'utf8'));
const encodeOnly = process.argv.includes('--encode');
const [onlyZone, onlyName] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
// 瀏覽器照螢幕挑一張：橫的看寬度，直的看手機那條直畫面
const WIDTHS = { wide: [1280, 1920, 2560], tall: [720, 1080, 1440] };

function encode(src, base, tall) {
  for (const w of WIDTHS[tall ? 'tall' : 'wide']) {
    const vf = ['-vf', `scale=${w}:-2:flags=lanczos`];
    const out = path.join(WEB, `${base}-${w}`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, ...vf, '-c:v', 'libaom-av1', '-still-picture', '1', '-cpu-used', '4', '-crf', '22', '-pix_fmt', 'yuv420p10le', out + '.avif']);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, ...vf, '-c:v', 'libwebp', '-quality', '82', '-preset', 'picture', out + '.webp']);
    console.log('  ', path.relative(ROOT, out), Math.round(fs.statSync(out + '.avif').size / 1024) + 'KB', Math.round(fs.statSync(out + '.webp').size / 1024) + 'KB');
  }
}

const picked = Object.entries(SHOTS).flatMap(([zone, shots]) => shots.map((shot) => ({ zone, shot })))
  .filter(({ zone, shot }) => (!onlyZone || zone === onlyZone) && (!onlyName || shot.name.includes(onlyName)));
fs.mkdirSync(WEB, { recursive: true });
if (encodeOnly) {
  for (const { zone, shot } of picked) {
    const src = path.join(OUT, `${zone}-${shot.name}.png`);
    if (fs.existsSync(src)) encode(src, `${zone}-${shot.name}`, shot.size[1] > shot.size[0]);
  }
  process.exit(0);
}
const PORT = 8171, DBG = 9371, SCALE = 2;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.m4a': 'audio/mp4' };

fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
}).listen(PORT);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'aerial-'));
// 多人頻道的 WebSocket 擋不掉（Network.setBlockedURLs 只管一般請求），直接讓 supabase.co 查不到網址，拍照的角色才不會出現在線上
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND', '--window-size=1920,2160', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tgt;
for (let i = 0; i < 90 && !tgt; i++) {
  try { tgt = (await (await fetch(`http://127.0.0.1:${DBG}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  if (!tgt) await sleep(1000);
}
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const wait = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') console.log('頁面錯誤', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
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
// 一般請求也擋掉（WebSocket 靠上面啟動時的 --host-resolver-rules）
await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });

for (const { zone, shot } of picked) {
  const [w, h] = shot.size;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: SCALE, mobile: false });
  // 當成從另一區搭船過來：不會停在第一次來的門口等人按「進入」；畫廊會在碼頭上岸，戶外才是打開的、光線和霧也是戶外那組
  const from = zone === 'gallery' ? 'haishi' : 'gallery';
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?z=${zone}&q=mid&debug&crowd=0&beast=0&rain=0&dust=0.5&from=${from}` });
  for (let i = 0; i < 240; i++) {
    await sleep(250);
    if (await ev(`!!window.__g && document.getElementById('loading')?.classList.contains('done')`).catch(() => false)) break;
  }
  // 鏡頭交給我們：角色那套跟拍、牆淡掉都停掉；自己和路人藏起來
  await ev(`(() => {
    const g = __g, cam = g.camera, s = ${JSON.stringify(shot)};
    g.quality.set(${SCALE});
    g.quality.pause(1e9);
    g.player.character.group.visible = false;
    // 海市的房子擋在鏡頭和目標之間會淡掉，給 null 全部照原樣；畫廊的牆、樹、碑文要一個目標點，給看的那一點（都在戶外，牆不會降）
    const look = new cam.position.constructor(...s.look);
    g.player.fadeTarget = () => (${JSON.stringify(zone)} === 'gallery' ? look : null);
    g.player.update = () => {
      cam.fov = s.fov;
      cam.position.set(...s.pos);
      cam.lookAt(...s.look);
      cam.updateProjectionMatrix();
      g.player.camPos.copy(cam.position);
      g.player.pos.set(s.look[0], g.player.pos.y, s.look[2]);
    };
    if (g.passers) {
      g.passers.update = () => {};
      for (const e of g.passers.pool) e.ch.group.visible = false;
    }
  })()`);
  // 讓海、霧、燈跑幾秒穩下來
  await sleep(4000);
  const data = await ev(`new Promise((res) => {
    const g = __g, after = g.photo.afterRender;
    g.photo.afterRender = function () {
      after.call(this);
      g.photo.afterRender = after;
      res(g.renderer.domElement.toDataURL('image/png'));
    };
  })`);
  const file = path.join(OUT, `${zone}-${shot.name}.png`);
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log('拍好', path.relative(ROOT, file), await ev(`__g.renderer.domElement.width + 'x' + __g.renderer.domElement.height`));
  encode(file, `${zone}-${shot.name}`, h > w);
}
ws.close();
edge.kill();
srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
