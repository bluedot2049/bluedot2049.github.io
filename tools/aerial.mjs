// 渡海過場用的目的地空拍：用無頭 Edge 開遊戲，把鏡頭擺到 aerial-shots.json 記的機位，藏起自己和路人，拍下畫布。
//   node tools/aerial.mjs                 每一區、每個機位都拍
//   node tools/aerial.mjs haishi          只拍海市
//   node tools/aerial.mjs haishi 後山     只拍海市名字含「後山」的機位
//   node tools/aerial.mjs --encode        不重拍，只把 tools/out/aerial/ 裡的原圖重新壓一次
//   node tools/aerial.mjs --raw ting      驗收用：只拍、不壓、不放進 assets/（原圖在 tools/out/aerial/），改完美術拍一輪跟上次的對照
// 機位：pos 鏡頭位置、look 看哪裡、fov 直的視角（度）、size 寬,高（橫的 1920,1080，直的 1080,2160）。
// 用兩倍解析度畫（中畫質，無頭模式開高畫質是黑的），原圖存 tools/out/aerial/，再交給 ffmpeg 縮小、轉 AVIF/WebP，放進 assets/aerial/。
// AVIF 用 10 位元：夜空是一大片很暗的漸層，8 位元會出現一圈一圈的色階。crf 30 以上燈籠和路燈柱就糊了
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openBrowser, sleep, ROOT } from './headless.mjs';

const OUT = path.join(ROOT, 'tools/out/aerial');
const WEB = path.join(ROOT, 'assets/aerial');
const SHOTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/aerial-shots.json'), 'utf8'));
const encodeOnly = process.argv.includes('--encode'), rawOnly = process.argv.includes('--raw');
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
const SCALE = 2;
fs.mkdirSync(OUT, { recursive: true });
const b = await openBrowser({ port: 8171, dbg: 9371 });
const { send, ev } = b;

for (const { zone, shot } of picked) {
  const [w, h] = shot.size;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: SCALE, mobile: false });
  // 當成從另一區搭船過來：不會停在第一次來的門口等人按「進入」；畫廊會在碼頭上岸，戶外才是打開的、光線和霧也是戶外那組
  const from = zone === 'gallery' ? 'haishi' : 'gallery';
  await b.load(`z=${zone}&q=mid&debug&crowd=0&beast=0&happen=0&rain=0&dust=0.5&from=${from}`);
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
    for (const w of g.walkers || []) {
      w.update = () => {};
      w.hidden = true;
      for (const e of w.pool?.list || w.pool || []) e.ch.group.visible = false;
    }
  })()`);
  // 讓海、霧、燈跑幾秒穩下來
  await sleep(4000);
  const file = path.join(OUT, `${zone}-${shot.name}.png`);
  fs.writeFileSync(file, await b.canvasPNG());
  console.log('拍好', path.relative(ROOT, file), await ev(`__g.renderer.domElement.width + 'x' + __g.renderer.domElement.height`));
  if (!rawOnly) encode(file, `${zone}-${shot.name}`, h > w);
}
b.close();
process.exit(0);
