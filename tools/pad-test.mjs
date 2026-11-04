// 手把測試：無頭 Edge 開畫廊，塞一支假手把（navigator.getGamepads），照劇本推搖桿、按鍵，看角色和介面有沒有照 docs/介面原則.md 第八節走。
//   node tools/pad-test.mjs
// 假手把的名字是 Windows 上 XInput 通用的那個（8BitDo 的 X 模式也是這個），認不出牌子，會先問「印著 A 的那顆」；這裡照 8BitDo 答右邊（任天堂字）
import { openBrowser, sleep } from './headless.mjs';

// 假手把：17 顆鍵、4 個軸，按了才看得到（跟真的瀏覽器一樣）
const FAKE = `(() => {
  const btn = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true, timestamp: 0,
    buttons: Array.from({ length: 17 }, btn), axes: [0, 0, 0, 0],
    vibrationActuator: { type: 'dual-rumble', effects: ['dual-rumble'], playEffect: () => Promise.resolve('complete') } };
  let shown = false;
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { if (!shown) return [null, null, null, null]; pad.timestamp = performance.now(); return [pad, null, null, null]; } });
  window.__fakePad = {
    show() { shown = true; },
    set(i, v) { const b = pad.buttons[i]; b.value = v; b.pressed = v > 0.5; b.touched = v > 0; },
    axes(a) { pad.axes = a.slice(); },
    unplug() { shown = false; pad.connected = false; window.dispatchEvent(Object.assign(new Event('gamepaddisconnected'), { gamepad: pad })); },
  };
})();`;

let failed = 0;
const check = (ok, what, got = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${got !== '' ? `　${got}` : ''}`);
  if (!ok) failed++;
};

const problems = [];
const b = await openBrowser({ port: 8174, dbg: 9374, window: '1280,800', onEvent: (d) => {
  if (d.method === 'Runtime.exceptionThrown') problems.push('錯誤 ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
} });
const { send, ev } = b;
try {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
  // 來過的人（不跳門口的告示）、說明卡關著；手把的設定清空，從第一次接上開始
  const Q = 'z=gallery&q=mid&debug&crowd=0&beast=0&rain=0&dust=0.5&from=haishi';
  await b.load(Q);
  await ev(`localStorage.clear(); localStorage.setItem('entered', '1'); localStorage.setItem('guideOff', '1'); sessionStorage.clear(); 1`);
  check(await b.load(Q), '畫廊載入');
  await sleep(1200);
  const press = async (i, ms = 120) => { await ev(`__fakePad.set(${i}, 1)`); await sleep(ms); await ev(`__fakePad.set(${i}, 0)`); await sleep(150); };
  const st = () => ev(`(() => { const p = __g.player; return { x: p.pos.x, z: p.pos.z, yaw: p.camYaw, pitch: p.shPitch, shoulder: p.shoulder, padOn: p.padOn, sitting: p.sitting, photo: __g.photo.active, quick: __g.photo.quick, pad: document.body.classList.contains('pad'), hint: document.getElementById('hint').textContent, pause: document.getElementById('pause').classList.contains('show'), pack: !document.getElementById('pack-card').hidden }; })()`);

  // 叫醒：按印著 A 的那顆（X 模式是 #1）讓手把出現。這一下不做事，接著問「印著 A 的那顆」
  await ev('__fakePad.set(1, 1); __fakePad.show()');
  await sleep(200);
  await ev('__fakePad.set(1, 0)');
  await sleep(200);
  let s = await st();
  check(s.pad && s.padOn, '叫醒後換成手把的樣子（body.pad）');
  check(s.shoulder, '手把一律越肩');
  check(/印著 A/.test(s.hint), '認不出牌子，問印著 A 的那顆', s.hint);
  await press(1);
  s = await st();
  const saved = await ev(`localStorage.getItem('pad')`);
  check(/nintendo/.test(saved || ''), '按右邊那顆：記成任天堂字', saved);
  check(/右邊/.test(s.hint), '回一句 A 在右邊', s.hint);

  // 左搖桿往前推一秒：角色往前走
  const p0 = await st();
  await ev('__fakePad.axes([0, -1, 0, 0])');
  await sleep(1000);
  await ev('__fakePad.axes([0, 0, 0, 0])');
  await sleep(300);
  s = await st();
  const moved = Math.hypot(s.x - p0.x, s.z - p0.z);
  check(moved > 1, '左搖桿往前：走了', `${moved.toFixed(2)} 公尺`);

  // 右搖桿往右推半秒：鏡頭往右轉（camYaw 變小）；放開以後停住
  const y0 = s.yaw;
  await ev('__fakePad.axes([0, 0, 1, 0])');
  await sleep(500);
  await ev('__fakePad.axes([0, 0, 0, 0])');
  await sleep(250);
  const y1 = (await st()).yaw;
  await sleep(300);
  const y2 = (await st()).yaw;
  check(y0 - y1 > 0.3, '右搖桿往右：鏡頭往右轉', `${(((y0 - y1) * 180) / Math.PI).toFixed(0)}°`);
  check(Math.abs(y2 - y1) < 0.01, '放開右搖桿：停住，不會一直滑', `${(((y2 - y1) * 180) / Math.PI).toFixed(2)}°`);

  // 輕輕推（在死區裡）：不動
  await ev('__fakePad.axes([0.05, -0.05, 0.06, 0])');
  await sleep(400);
  const s1 = await st();
  await sleep(300);
  const s2 = await st();
  await ev('__fakePad.axes([0, 0, 0, 0])');
  check(Math.hypot(s2.x - s1.x, s2.z - s1.z) < 0.01 && Math.abs(s2.yaw - s1.yaw) < 0.001, '推在死區裡：角色和鏡頭都不動');

  // Y（左邊那顆）坐下、B（任天堂字的 B 在下面，#0）起來
  await press(2);
  await sleep(600);
  check((await st()).sitting, 'Y：坐下');
  await press(0);
  await sleep(600);
  check(!(await st()).sitting, 'B：起來');

  // −：行囊；B 收起
  await press(8);
  await sleep(300);
  check((await st()).pack, '−：打開行囊');
  await press(0);
  await sleep(300);
  check(!(await st()).pack, 'B：收起行囊');

  // +：暫停選單，再按一次收起；手把那幾列顯示出來
  await press(9);
  await sleep(300);
  s = await st();
  const rows = await ev(`[...document.querySelectorAll('#pause .pad-set')].filter((e) => getComputedStyle(e).display !== 'none').length`);
  check(s.pause, '+：暫停選單');
  check(rows === 3, '暫停選單有手把那三列', rows);
  await press(9);
  await sleep(300);
  check(!(await st()).pause, '+ 再按：收起');

  // ZL 按住：舉相機（沒帶相機是空拍機）；ZR：拍；放開 ZL：放下
  await ev(`window.__shots = 0; { const ph = __g.photo, f = ph.shoot.bind(ph); ph.shoot = (...a) => { window.__shots++; return f(...a); }; } 1`);
  await ev('__fakePad.set(6, 1)');
  await sleep(500);
  s = await st();
  check(s.photo && s.quick, 'ZL 按住：舉起來');
  await press(7);
  await sleep(600);
  const shots = await ev('window.__shots');
  check(shots >= 1, 'ZR：拍了', shots);
  await ev('__fakePad.set(6, 0)');
  await sleep(400);
  check(!(await st()).photo, '放開 ZL：放下');

  // 沒舉著時按 ZR：先舉起來（一直舉著），B 放下
  await press(7, 80);
  await sleep(400);
  s = await st();
  check(s.photo && s.quick, '沒舉著按 ZR：舉起來、一直舉著');
  await press(0);
  await sleep(400);
  check(!(await st()).photo, 'B：放下');

  // 滑鼠一動：換回滑鼠（body.pad 拿掉），越肩留著
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 300 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 520, y: 380 });
  await sleep(200);
  s = await st();
  check(!s.pad && s.shoulder, '滑鼠一動：換回滑鼠，越肩留著');
  // 再推一下手把：換回手把
  await ev('__fakePad.axes([0, -1, 0, 0])');
  await sleep(300);
  check((await st()).pad, '再推手把：換回手把');

  // 推著走的時候拔掉：停下來
  await sleep(300);
  await ev('__fakePad.unplug()');
  await sleep(200);
  const u0 = await st();
  await sleep(500);
  const u1 = await st();
  check(!u1.pad && Math.hypot(u1.x - u0.x, u1.z - u0.z) < 0.05, '拔掉：停下、換回原本的樣子');
  check(/斷線/.test(u1.hint), '上緣說手把斷線了', u1.hint);

  check(!problems.length, '沒有頁面錯誤', problems.length ? '\n    ' + [...new Set(problems)].join('\n    ') : '');
} catch (e) {
  console.log('✗ 測試中斷：' + e.message);
  failed++;
} finally {
  b.close();
}
console.log(failed ? `\n${failed} 項沒過` : '\n全部通過');
process.exit(failed ? 1 : 0);
