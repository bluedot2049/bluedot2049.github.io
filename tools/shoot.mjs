// 查東西用的截圖：無頭 Edge 開一區，站到指定的地方拍一張，調色台、幀率這些開發用的介面不會入鏡。
//   node tools/shoot.mjs haishi                              手機直畫面（390×844、觸控），只拍畫布
//   node tools/shoot.mjs haishi --ui                         拍整頁：遊戲介面（搖桿、按鈕、面板）一起拍，開發介面藏起來
//   node tools/shoot.mjs haishi --wide                       電腦寬螢幕 1280×800、滑鼠
//   node tools/shoot.mjs haishi --view=12,-30,180,6,20       站位，跟網址的 ?view= 一樣（x,z,面向,距離,俯角）
//   node tools/shoot.mjs haishi --cam=-10,62,-96,0,0,10,48   固定鏡頭（鏡頭 xyz、看的點 xyz、直的視角），自己和路人藏起來，跟 aerial 一樣
//   node tools/shoot.mjs haishi --q="rain=1&crowd=1"         另外的網址參數，同名的蓋掉預設（預設 crowd=0 beast=0 rain=0 dust=0.5）
//   node tools/shoot.mjs haishi --eval="__g.ui.openPack()"   載完、拍之前在頁面裡跑一段
//   node tools/shoot.mjs gallery --from=none                 不當成搭船來（畫廊會停在前門）；預設跟 aerial 一樣，畫廊從碼頭上岸、別區從畫廊來
//   --wait=3000 載完等幾毫秒再拍（海、霧、燈要穩）　--name=xxx 檔名　--size=寬,高 自訂畫面
// 拍好存在 tools/out/shoot/<區>[-名字][-wide][-ui].png，印出路徑
import fs from 'node:fs';
import path from 'node:path';
import { openBrowser, sleep, ROOT } from './headless.mjs';

const argv = process.argv.slice(2);
const opt = (k) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const zone = argv.find((a) => !a.startsWith('--')) || 'haishi';
const ui = !!opt('ui'), wide = !!opt('wide');
const [w, h] = opt('size') ? opt('size').split(',').map(Number) : wide ? [1280, 800] : [390, 844];
const cam = opt('cam') ? opt('cam').split(',').map(Number) : null;
const OUT = path.join(ROOT, 'tools/out/shoot');
fs.mkdirSync(OUT, { recursive: true });

const q = new URLSearchParams({ z: zone, q: 'mid', debug: '', crowd: '0', beast: '0', rain: '0', dust: '0.5' });
const from = opt('from') ?? (zone === 'gallery' ? 'haishi' : 'gallery');
if (from !== 'none') q.set('from', from);
if (opt('view')) q.set('view', opt('view'));
for (const [k, v] of new URLSearchParams(opt('q') || '')) q.set(k, v);

const b = await openBrowser({ port: 8175, dbg: 9375, window: `${Math.max(w, 400)},${Math.max(h, 400)}` });
// 中途出錯也要收掉 Edge 和暫存資料夾，不然留在背景、塞滿 TEMP
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: wide ? 1 : 2, mobile: !wide });
  // 觸控模擬開了 (pointer: coarse) 才成立，手機版的介面（拇指弧、貼底）才會出來
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: !wide, maxTouchPoints: wide ? 0 : 5 });
  if (!(await b.load(q.toString()))) console.log('載入逾時，照樣拍');

  if (cam) {
    // 鏡頭交給我們：角色那套跟拍、牆淡掉都停掉；自己和路人藏起來（同 aerial.mjs）
    await b.ev(`(() => {
      const g = __g, c = g.camera, [px, py, pz, lx, ly, lz, fov] = ${JSON.stringify(cam)};
      const look = new c.position.constructor(lx, ly, lz);
      g.player.character.group.visible = false;
      g.player.fadeTarget = () => (${JSON.stringify(zone)} === 'gallery' ? look : null);
      g.player.update = () => {
        if (fov) c.fov = fov;
        c.position.set(px, py, pz);
        c.lookAt(look);
        c.updateProjectionMatrix();
        g.player.camPos.copy(c.position);
        g.player.pos.set(lx, g.player.pos.y, lz);
      };
      for (const w of g.walkers || []) {
        w.update = () => {};
        w.hidden = true;
        for (const e of w.pool?.list || w.pool || []) e.ch.group.visible = false;
      }
    })()`);
  }
  if (opt('eval')) console.log('eval →', await b.ev(opt('eval')));
  await sleep(+(opt('wait') || 3000));

  const name = [zone, opt('name'), wide && 'wide', ui && 'ui'].filter((x) => typeof x === 'string').join('-');
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, ui ? await b.pagePNG() : await b.canvasPNG());
  console.log(path.relative(ROOT, file).replaceAll('\\', '/'), `${w}x${h}`, wide ? '電腦' : '手機', ui ? '整頁' : '畫布');
} finally {
  b.close();
}
process.exit(0);
