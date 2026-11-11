// 無頭 Edge 的共用底座：開本機伺服器、開 Edge（擋 supabase）、接 CDP，給 aerial.mjs、shoot.mjs 用。
//   const b = await openBrowser({ port, dbg });   b.send(CDP 指令)、b.ev(頁面裡跑的運算式)、b.load(網址參數)、b.canvasPNG()、b.pagePNG()、b.close()
// 網址一律加 ?q=mid（高畫質在無頭模式是黑的）。b.load 等到 window.__g 和載入畫面收掉，所以要帶 ?debug
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// Edge 的暫存設定檔（一份幾十 MB）放 TEMP。以前 kill 完馬上刪，子程序還鎖著檔案、刪不掉又沒說，累積到把 C 槽塞滿。
// 現在：開新的先清一小時前留下的；結束時整棵程序樹砍掉再刪（重試），掛在 process exit 上，出錯、Ctrl+C 也會清
export function edgeProfile(prefix) {
  const tmp = os.tmpdir(), old = Date.now() - 3600e3;
  for (const n of fs.readdirSync(tmp)) {
    if (!/^(headless|smoke)-/.test(n)) continue;
    const p = path.join(tmp, n);
    try { if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }
  return fs.mkdtempSync(path.join(tmp, `${prefix}-`));
}
export function onEdgeExit(edge, prof, more = () => {}) {
  let done = false;
  const quit = () => {
    if (done) return;
    done = true;
    try { more(); } catch {}
    try { execFileSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
    // 砍完要再等幾百毫秒才放開檔案；rmSync 自己的 maxRetries 碰到 Windows 的 EPERM 不重試，自己來
    for (let i = 0; ; i++) {
      try { fs.rmSync(prof, { recursive: true, force: true }); break; }
      catch (e) { if (i === 50) { console.log(`暫存設定檔沒刪掉：${prof}（${e.code}）`); break; } }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  };
  process.on('exit', quit);
  process.once('SIGINT', () => process.exit(130));
  return quit;
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.webmanifest': 'application/manifest+json' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// timeout：一個 CDP 指令最多等幾毫秒（0＝一直等）。頁面卡死時不會整支停住，丟出 e.timeout
export async function openBrowser({ port, dbg, window = '1920,2160', onEvent = null, timeout = 0 }) {
  const srv = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      const type = TYPES[path.extname(f)] || 'application/octet-stream';
      // 分段下載（跟 GitHub Pages 一樣）：背景音樂照伺服器時間從中間開始放（ambience.js 的 musicAt），沒有這個跳不過去
      const m = /^bytes=(\d*)-(\d*)$/.exec(q.headers.range || '');
      if (m && (m[1] || m[2])) {
        const start = m[1] ? +m[1] : Math.max(0, b.length - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], b.length - 1) : b.length - 1;
        if (start >= b.length || start > end) { r.writeHead(416, { 'content-range': `bytes */${b.length}` }); r.end(); return; }
        r.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${b.length}`, 'content-length': end - start + 1 });
        r.end(b.subarray(start, end + 1));
        return;
      }
      r.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes' });
      r.end(b);
    });
  }).listen(port);
  const prof = edgeProfile('headless');
  // 多人頻道的 WebSocket 擋不掉（Network.setBlockedURLs 只管一般請求），直接讓 supabase.co 查不到網址，測試角色才不會出現在線上
  const edge = spawn(EDGE, ['--headless=new', '--mute-audio', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`, '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND', `--window-size=${window}`, 'about:blank']);
  let ws;
  const quit = onEdgeExit(edge, prof, () => { ws?.close(); srv.close(); });
  let tgt;
  for (let i = 0; i < 90 && !tgt; i++) {
    try { tgt = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!tgt) await sleep(1000);
  }
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') console.log('頁面錯誤', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    onEvent?.(d);
  };
  const send = (method, params = {}) => new Promise((r, no) => {
    const i = ++id;
    const t = timeout && setTimeout(() => { wait.delete(i); no(Object.assign(new Error(`${method} 等了 ${timeout / 1000} 秒沒回應`), { timeout: true })); }, timeout);
    wait.set(i, (d) => { clearTimeout(t); r(d); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
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

  return {
    send, ev,
    // 開一區，等 __g 出來、載入畫面收掉
    async load(query) {
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/?${query}` });
      for (let i = 0; i < 240; i++) {
        await sleep(250);
        if (await ev(`!!window.__g && document.getElementById('loading')?.classList.contains('done')`).catch(() => false)) return true;
      }
      return false;
    },
    // 只拍畫布：等下一幀畫完直接讀，畫面上的介面一樣都不會有
    async canvasPNG() {
      const data = await ev(`new Promise((res) => {
        const g = __g, after = g.photo.afterRender;
        g.photo.afterRender = function () {
          after.call(this);
          g.photo.afterRender = after;
          res(g.renderer.domElement.toDataURL('image/png'));
        };
      })`);
      return Buffer.from(data.split(',')[1], 'base64');
    },
    // 拍整頁（含遊戲介面），調色台、幀率這些開發用的藏起來（html.no-dev，見 devtools.js）
    async pagePNG() {
      await ev(`document.documentElement.classList.add('no-dev'); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      await ev(`document.documentElement.classList.remove('no-dev')`);
      return Buffer.from(r.result.data, 'base64');
    },
    close: quit,
  };
}
