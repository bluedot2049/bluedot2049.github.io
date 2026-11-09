// 照一張參考圖（概念圖、使用者的插畫、之前的截圖）算出這一區調色的紅綠藍三條曲線，貼回 zone-*.js 的 grade.curves 或調色台。
// 借自 F:\遊戲專案 洞窟「濾鏡拿概念圖量出來」的做法，改成對齊每個色版的分佈：參考圖不用跟遊戲同一個構圖，
// 但畫面裡天空、地面、暗部各佔多少要差不多，不然會把「這張比較多天空」當成「天空色要變」。站位挑跟參考圖像的地方。
//   node tools/grade-fit.mjs haishi --ref="C:/Users/user/Desktop/插圖23.jpg"
//   --view=x,z,面向,距離,俯角 或 --cam=鏡頭xyz,看的點xyz,視角（同 shoot.mjs）   --wide 電腦寬畫面（預設手機直）
//   --mix=0.6  只往參考圖走六成（預設 1）　--wait=3000
// 輸出 tools/out/grade-fit/：<區>-now.png（現在的曲線）、-off.png（曲線全拿掉）、-fit.png（換成算出來的）、-ref.png（參考圖縮小）
// 印出 curves（亮度一條、紅綠藍各一條直線）。區域分區各自有曲線時，算的是鏡頭所在位置那一組
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser, sleep, ROOT } from './headless.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const zone = argv.find((a) => !a.startsWith('--')) || 'haishi';
const ref = opt('ref');
if (!ref || !fs.existsSync(ref)) { console.log('要給 --ref=參考圖路徑'); process.exit(1); }
const wide = !!opt('wide'), mix = Math.min(1, Math.max(0, +(opt('mix') ?? 1)));
const [w, h] = wide ? [1280, 800] : [390, 844];
const cam = opt('cam') ? opt('cam').split(',').map(Number) : null;
const OUT = path.join(ROOT, 'tools/out/grade-fit');
fs.mkdirSync(OUT, { recursive: true });

const q = new URLSearchParams({ z: zone, q: 'mid', debug: '', crowd: '0', beast: '0', happen: '0', act: '0', rain: '0', dust: '0.5', from: zone === 'gallery' ? 'haishi' : 'gallery' });
if (opt('view')) q.set('view', opt('view'));

const b = await openBrowser({ port: 8176, dbg: 9376, window: `${Math.max(w, 400)},${Math.max(h, 400)}` });
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: wide ? 1 : 2, mobile: !wide });
  if (!(await b.load(q.toString()))) console.log('載入逾時，照樣算');
  if (cam) {
    await b.ev(`(() => {
      const g = __g, c = g.camera, [px, py, pz, lx, ly, lz, fov] = ${JSON.stringify(cam)};
      const look = new c.position.constructor(lx, ly, lz);
      g.player.character.group.visible = false;
      g.player.update = () => { if (fov) c.fov = fov; c.position.set(px, py, pz); c.lookAt(look); c.updateProjectionMatrix(); g.player.camPos.copy(c.position); g.player.pos.set(lx, g.player.pos.y, lz); };
    })()`);
  }
  await sleep(+(opt('wait') || 3000));
  const save = (n, buf) => { const f = path.join(OUT, `${zone}-${n}.png`); fs.writeFileSync(f, buf); return path.relative(ROOT, f).replaceAll('\\', '/'); };
  save('now', await b.canvasPNG());

  // 曲線全拿掉（全區和每個分區），拍一張當作要對齊的起點
  await b.ev(`(async () => {
    const G = await import('/js/core/grade.js');
    window.__fitKeep = JSON.parse(G.snapshot());
    window.__fitBefore = G.resolved(-1).curves;   // 色調（tone）帶的曲線也算進來
    const s = JSON.parse(G.snapshot()), I = [[0, 0], [1, 1]], none = { l: I, r: I, g: I, b: I };
    s.curves = none;   // 只寫 {} 蓋不掉色調裡的曲線，四條都寫成直線
    for (const r of s.regions || []) r.curves = none;
    G.loadSet(s);
  })()`);
  await sleep(600);
  const off = await b.canvasPNG();
  save('off', off);

  // 頁面裡解兩張圖。分兩步，三個色版不各自對齊（畫面內容不同時會把色偏放大，試過整片洋紅）：
  //   亮度：遊戲裡亮度 x 的那一份，換成參考圖同一份位置的亮度 → l 那條
  //   顏色：只看中間調（太暗、燈的亮點不算），每個色版跟亮度的比例對齊參考圖 → r、g、b 各一條直線，亮度加權後平均是 1
  const refB64 = fs.readFileSync(ref).toString('base64'), refType = /\.png$/i.test(ref) ? 'png' : 'jpeg';
  const res = await b.ev(`(async () => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const stats = (img) => {
      const s = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
      const p = x.getImageData(0, 0, c.width, c.height).data, n = p.length / 4, H = new Float64Array(256), mid = [0, 0, 0, 0];
      for (let i = 0; i < p.length; i += 4) {
        const L = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
        H[Math.round(L)]++;
        if (L > 12 && L < 215) { mid[0] += p[i]; mid[1] += p[i + 1]; mid[2] += p[i + 2]; mid[3] += L; }
      }
      const cdf = new Float64Array(256); let t = 0;
      for (let v = 0; v < 256; v++) { t += H[v]; cdf[v] = t / n; }
      return { cdf, ratio: [mid[0] / mid[3], mid[1] / mid[3], mid[2] / mid[3]], png: c.toDataURL('image/png') };
    };
    const A = stats(await load('data:image/png;base64,${off.toString('base64')}'));
    const B = stats(await load('data:image/${refType};base64,${refB64}'));
    const quant = (cdf, f) => { let v = 0; while (v < 255 && cdf[v] < f) v++; return v / 255; };
    const X = [0, 0.06, 0.13, 0.22, 0.33, 0.46, 0.6, 0.75, 0.88, 1], mix = ${mix};
    let last = 0;
    const l = X.map((x) => {
      let y = x === 0 ? Math.min(quant(B.cdf, 0.002), 0.2) : x === 1 ? Math.max(quant(B.cdf, 0.998), 0.8) : quant(B.cdf, A.cdf[Math.round(x * 255)]);
      y = x + (y - x) * mix;
      y = Math.max(last, y); last = y;
      return [x, +y.toFixed(3)];
    });
    const g0 = [0, 1, 2].map((k) => 1 + (B.ratio[k] / A.ratio[k] - 1) * mix);
    const norm = 0.2126 * g0[0] + 0.7152 * g0[1] + 0.0722 * g0[2], gain = g0.map((v) => v / norm);
    const line = (g) => (g <= 1 ? [[0, 0], [1, +g.toFixed(3)]] : [[0, 0], [+(1 / g).toFixed(3), 1], [1, 1]]);
    const curves = { l, r: line(gain[0]), g: line(gain[1]), b: line(gain[2]) };
    const G = await import('/js/core/grade.js');
    const s = JSON.parse(JSON.stringify(window.__fitKeep));
    s.curves = curves;
    for (const r of s.regions || []) r.curves = curves;
    G.loadSet(s);
    return { curves, refPng: B.png, before: window.__fitBefore || null };
  })()`);
  await sleep(600);
  console.log(save('fit', await b.canvasPNG()));
  save('ref', Buffer.from(res.refPng.split(',')[1], 'base64'));
  console.log('現在的 curves：', JSON.stringify(res.before));
  console.log('算出來的：');
  console.log(`curves: ${JSON.stringify(res.curves).replace(/"(\w)":/g, '$1: ')},`);
  console.log('四張圖在 tools/out/grade-fit/：now 現在、off 拿掉曲線、fit 換上算出來的、ref 參考圖');
} finally {
  b.close();
}
process.exit(0);
