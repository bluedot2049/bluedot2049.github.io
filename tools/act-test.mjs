// 一幕劇走一遍（core/act.js、zones/haishi/haishi-acts.js）：無頭 Edge 在海市按魚桶「看看」開演，跟在魚後面，
// 每一拍躲好時從旁邊拍一張（tools/out/act/），再站上去面對牠讓牠飛走，到星廟鑽進火盆演完（火盆近看、火傳下山各拍一張），看演到一半存檔沒記、演完才記、頁面沒有錯誤。約兩分鐘
//   node tools/act-test.mjs
// 改 haishi-acts.js 的位置、姿勢、找到的條件，或 act.js、黑眼那一行之後跑
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser, sleep, ROOT } from './headless.mjs';

const OUT = path.join(ROOT, 'tools/out/act');
fs.mkdirSync(OUT, { recursive: true });
const b = await openBrowser({ port: 8191, dbg: 9391, window: '800,900' });
const log = (...a) => console.log(...a);
const errs = [];
try {
  await b.send('Runtime.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 780, height: 860, deviceScaleFactor: 1, mobile: false });
  if (!(await b.load('z=haishi&q=mid&debug&crowd=0&beast=0&happen=0&rain=0&dust=0.5&from=gallery'))) log('載入逾時');
  await b.ev(`window.__errs = []; addEventListener('error', (e) => __errs.push(String(e.message)));`);
  const st = () => b.ev(`(() => { const a = __act.acts[0]; const p = a.spots; return JSON.stringify({ b: a.state.b, done: a.state.done, phase: a.phase }); })()`).then(JSON.parse);
  log('開始', await st());
  // 鏡頭固定看某一點拍一張（角色站遠一點，不會觸發）
  const snap = async (name, eye, at) => {
    await b.ev(`(() => { const g = __g, c = g.camera, L = new c.position.constructor(${at.join(',')});
      g.player.update = () => { c.position.set(${eye.join(',')}); c.lookAt(L); c.updateProjectionMatrix(); g.player.camPos.copy(c.position); }; })()`);
    await sleep(1500);
    fs.writeFileSync(path.join(OUT, name + '.png'), await b.canvasPNG());
    await b.ev(`delete __g.player.update`);
  };
  // 魚桶
  await b.ev(`__g.player.place(-6, 10, 0)`);
  await snap('0-bucket', [1.2, 1.6, 9.2], [2.9, 0.4, 6.6]);
  // 走到桶旁按「看看」
  await b.ev(`__g.player.place(2.9, 8.3, Math.PI); __g.player.snapCamera?.()`);
  await sleep(500);
  const t = await b.ev(`JSON.stringify(__g.player.actionTarget() && { kind: __g.player.actionTarget().kind, label: __g.player.actionTarget().p?.actionLabel })`);
  log('互動鍵', t);
  await b.ev(`__g.player.action()`);
  const saved = () => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('save') || '{}').acts ?? [])`);
  const mid = [];
  for (let k = 1; k <= 6; k++) {
    // 跟著飛：每 0.3 秒站到魚後面 3 公尺
    let s, n = 0;
    while ((s = await st()).phase !== 'hide' && s.phase !== 'finale' && n++ < 400) {
      await b.ev(`(() => { const g = __g, a = __act.acts[0], f = a.actors[0].subject?.()?.center; if (!f) return; const p = g.player.pos;
        const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1; if (d > 3) { const w = g.world.findWalkable(f.x - dx / d * 3, f.z - dz / d * 3, p.x, p.z); if (w) g.player.place(w.x, w.z, Math.atan2(dx, dz)); } })()`);
      await sleep(300);
    }
    log(`第 ${k} 拍`, s, `跟了 ${(n * 0.3).toFixed(1)} 秒`);
    const sp = JSON.parse(await b.ev(`JSON.stringify(__act.acts[0].spots[${k}])`));
    const f = [sp.fish.x, sp.fish.y, sp.fish.z], gy = await b.ev(`__g.world.groundY(${sp.at[0]}, ${sp.at[1]})`);
    // 站遠一點拍躲著的樣子：從站的點往後退
    const dx = sp.at[0] - sp.fish.x, dz = sp.at[1] - sp.fish.z, d = Math.hypot(dx, dz) || 1;
    await b.ev(`__g.player.place(${sp.at[0] + dx / d * 12}, ${sp.at[1] + dz / d * 12}, 0)`);
    await snap(`${k}-${sp.id}`, [sp.at[0] + dx / d * 2.2, gy + 1.7, sp.at[1] + dz / d * 2.2], f);
    // 站上去面對牠
    await b.ev(`(() => { const p = __g.player; p.place(${sp.at[0]}, ${sp.at[1]}, Math.atan2(${sp.fish.x - sp.at[0]}, ${sp.fish.z - sp.at[1]})); p.camYaw = p.heading + Math.PI; p.snapCamera?.(); })()`);
    let m = 0;
    while ((s = await st()).b === k && s.phase !== 'finale' && m++ < 30) await sleep(200);
    log('  找到之後', s);
    if (k < 6) mid.push(await saved());
  }
  let m = 0, s;
  while ((s = await st()).phase === 'finale' && m++ < 80) await sleep(250);
  const end = await saved();
  // 火魚鑽進火盆：火盆燒著，近看一張；等火傳到海邊，從廟埕往南看整座鎮一張（haishi-brazier.js）
  const lit = await b.ev(`__act.acts[0].brazier.lit`);
  log('火盆', lit ? '燒著' : '沒燒');
  await b.ev(`__g.player.place(-6, -101, 0)`);
  await snap('7-brazier', [-5.2, 48.2, -105.6], [-1.8, 47.5, -108.25]);
  let w = 0;
  while ((await b.ev(`__act.acts[0].brazier.age`)) < 19 && w++ < 80) await sleep(250);
  await snap('8-town', [-3.5, 49.5, -104.5], [0, 14, -15]);
  log('演到一半的存檔', [...new Set(mid)].join(' '), '演完', s, '存檔', end);
  const midOk = mid.every((v) => v === '[]'), endOk = end === '["fish"]';
  const e = JSON.parse(await b.ev(`JSON.stringify(__errs)`));
  log(s.done && s.b === 0 && midOk && endOk && lit && !e.length ? '✓ 演完了' : `✗ ${!midOk ? '演到一半就存了' : !endOk ? '存檔不對' : !lit ? '火盆沒燒' : '沒演完或有錯'}`, e.length ? e : '');
} finally {
  b.close();
}
process.exit(0);
