// 手機橫拿越肩測試：無頭 Edge 模擬觸控手機（844×390 橫拿），照劇本點越肩鈕、推搖桿、拖曳、兩指、轉直拿再轉回來、舉相機，看角色和介面有沒有照 docs/介面原則.md 第四節走。
//   node tools/touch-test.mjs
// 手指用 CDP 的 Input.dispatchTouchEvent 送（跟真的手機一樣是 pointer 事件、pointerType touch）
import { openBrowser, sleep } from './headless.mjs';

let failed = 0;
const check = (ok, what, got = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${got !== '' ? `　${got}` : ''}`);
  if (!ok) failed++;
};

const LAND = { width: 844, height: 390, screenOrientation: { type: 'landscapePrimary', angle: 90 } };
const PORT = { width: 390, height: 844, screenOrientation: { type: 'portraitPrimary', angle: 0 } };
const problems = [];
const b = await openBrowser({ port: 8176, dbg: 9376, window: '900,900', onEvent: (d) => {
  if (d.method === 'Runtime.exceptionThrown') problems.push('錯誤 ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
} });
const { send, ev } = b;
const screen = (o) => send('Emulation.setDeviceMetricsOverride', { ...o, deviceScaleFactor: 2, mobile: true });
// 手指：[[x, y], …] 一次送一組（id 照順序），空陣列是全部放開
let down = 0;
const touch = (pts) => {
  const type = !pts.length ? 'touchEnd' : down ? 'touchMove' : 'touchStart';
  down = pts.length;
  return send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
};
// 點一下按鈕：dispatchTouchEvent 不會變成 click，按鈕要用 tap 手勢
const tap = ([x, y]) => send('Input.synthesizeTapGesture', { x, y, duration: 50, gestureSourceType: 'touch' });
// 一根手指從 a 拖到 b，分幾步、每步隔幾毫秒；hold 是另外一直按著不動的手指
async function drag(a, b, { steps = 12, gap = 16, hold = null } = {}) {
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const with_ = (p) => (hold ? [hold, p] : [p]);
  if (hold) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hold[0], y: hold[1], id: 0 }] }); down = 1; await sleep(gap); }
  await send('Input.dispatchTouchEvent', { type: down ? 'touchMove' : 'touchStart', touchPoints: with_(a).map(([x, y], id) => ({ x, y, id })) });
  down = with_(a).length;
  for (let i = 1; i <= steps; i++) { await sleep(gap); await touch(with_(at(i / steps))); }
  await sleep(gap);
  await touch([]);
}

try {
  await screen(LAND);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // 來過的人（不跳門口的告示）、說明卡關著；設定清空
  const Q = 'z=gallery&q=mid&debug&crowd=0&beast=0&rain=0&dust=0.5&from=haishi';
  await b.load(Q);
  await ev(`localStorage.clear(); localStorage.setItem('entered', '1'); localStorage.setItem('guideOff', '1'); sessionStorage.clear(); 1`);
  check(await b.load(Q), '畫廊載入（橫拿、觸控）');
  // 調色台（?debug）蓋在上排按鈕上，藏起來（同 headless.mjs 的 pagePNG）
  await ev(`document.documentElement.classList.add('no-dev'); 1`);
  await sleep(1500);
  const st = () => ev(`(() => { const p = __g.player, r = getComputedStyle(document.getElementById('reticle')); return { x: p.pos.x, z: p.pos.z, yaw: p.camYaw, dist: p.shDist, heading: p.heading, shoulder: p.shoulder, ok: p.shoulderOk, coarse: p.coarse, btn: !document.getElementById('shoulder-btn').hidden, reticle: +r.opacity, photo: __g.photo.active, joyLeft: document.body.classList.contains('joy-left'), pref: localStorage.getItem('shoulder') }; })()`);
  const rect = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

  let s = await st();
  check(s.coarse && s.ok && s.btn, '橫拿：有越肩，上排的越肩鈕看得到');
  check(!s.shoulder, '沒開過：照舊是一般視角');
  check(s.joyLeft, '橫拿搖桿在左邊');

  // 點越肩鈕
  const sb = await rect('#shoulder-btn');
  await tap(sb);
  await sleep(800);
  s = await st();
  check(s.shoulder, '點越肩鈕：開了');
  check(s.reticle > 0.5, '準心出來', s.reticle);

  // 搖桿往右推：平移，鏡頭不轉
  const joy = await rect('#joy');
  let s0 = await st();
  await touch([joy]);
  for (let i = 1; i <= 6; i++) { await sleep(16); await touch([[joy[0] + i * 10, joy[1]]]); }
  await sleep(1000);
  await touch([]);
  await sleep(400);
  s = await st();
  const side = Math.hypot(s.x - s0.x, s.z - s0.z);
  // 鏡頭右邊（camYaw 的右手方向）是 (cos yaw, -sin yaw)
  const along = (s.x - s0.x) * Math.cos(s0.yaw) - (s.z - s0.z) * Math.sin(s0.yaw);
  check(side > 0.8 && along > 0.6, '搖桿往右：往右平移', `${side.toFixed(2)} 公尺、往右 ${along.toFixed(2)}`);
  check(Math.abs(s.yaw - s0.yaw) < 0.02, '搖桿往右：鏡頭不轉', (s.yaw - s0.yaw).toFixed(3));

  // 搖桿往前推
  s0 = s;
  await touch([joy]);
  for (let i = 1; i <= 6; i++) { await sleep(16); await touch([[joy[0], joy[1] - i * 10]]); }
  await sleep(1000);
  await touch([]);
  await sleep(400);
  s = await st();
  check(Math.hypot(s.x - s0.x, s.z - s0.z) > 1, '搖桿往前：走了', Math.hypot(s.x - s0.x, s.z - s0.z).toFixed(2));

  // 右半邊往右拖：跟一般視角一樣拖著畫面走，往左看（camYaw 變大），身體跟著轉
  s0 = s;
  await drag([560, 200], [760, 200]);
  await sleep(900);
  s = await st();
  const dy = s.yaw - s0.yaw;
  check(dy > 0.4, '右邊往右拖：拖著畫面往左看', dy.toFixed(2));
  const body = Math.abs(Math.atan2(Math.sin(s.heading - Math.PI - s.yaw), Math.cos(s.heading - Math.PI - s.yaw)));
  check(body < 0.2, '身體轉向視線', body.toFixed(2));

  // 緊貼搖桿外面拖：跟自由視角一樣照樣轉
  s0 = s;
  await drag([joy[0], joy[1] - 80], [joy[0] + 100, joy[1] - 80]);
  await sleep(500);
  s = await st();
  check(s.yaw - s0.yaw > 0.2, '緊貼搖桿外面拖：照樣轉視角', (s.yaw - s0.yaw).toFixed(2));

  // 搖桿那一側、外圈以外拖：照樣轉
  s0 = s;
  await drag([200, 120], [320, 120]);
  await sleep(900);
  s = await st();
  check(s.yaw - s0.yaw > 0.2, '搖桿旁邊往右拖：照樣轉視角', (s.yaw - s0.yaw).toFixed(2));

  // 左手拇指按在搖桿旁邊的畫面上不動，右手拖：照樣轉，不會變成捏合
  s0 = s;
  await drag([560, 200], [460, 200], { hold: [150, 200] });
  await sleep(700);
  s = await st();
  check(s.yaw - s0.yaw < -0.2, '左手按著、右手往左拖：拖著畫面往右看', (s.yaw - s0.yaw).toFixed(2));
  check(Math.abs(s.dist - s0.dist) < 0.01, '沒有被當成捏合（遠近沒變）', (s.dist - s0.dist).toFixed(3));

  // 右邊兩指捏：照樣拉遠拉近
  s0 = s;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 560, y: 200, id: 0 }, { x: 700, y: 200, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await sleep(16); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 560 + i * 6, y: 200, id: 0 }, { x: 700 - i * 6, y: 200, id: 1 }] }); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  down = 0;
  await sleep(500);
  s = await st();
  check(s.dist > s0.dist + 0.2, '右邊兩指捏：拉遠', `${s0.dist.toFixed(2)} → ${s.dist.toFixed(2)}`);

  // 轉直拿：退回一般視角、按鈕收起，設定留著；轉回來再開
  await screen(PORT);
  await sleep(800);
  s = await st();
  check(!s.shoulder && !s.btn, '轉直拿：退回一般視角、越肩鈕收起');
  check(s.pref === '1', '設定沒改', s.pref);
  check(s.joyLeft, '直拿搖桿留在左邊（跟著轉之前那一邊）');
  await screen(LAND);
  await sleep(800);
  s = await st();
  check(s.shoulder && s.btn, '轉回橫拿：越肩回來');

  // 相機鈕：進攝影模式，收起時回到越肩
  const pb = await rect('#photo-btn');
  await tap(pb);
  await sleep(800);
  s = await st();
  check(s.photo, '相機鈕：進攝影模式');
  await tap(pb);
  await sleep(800);
  s = await st();
  check(!s.photo && s.shoulder, '再按一下：收起，還是越肩');

  // 點越肩鈕關掉
  await tap(sb);
  await sleep(500);
  s = await st();
  check(!s.shoulder && s.pref === '0', '再點越肩鈕：關掉、記住', s.pref);
  check(s.reticle < 0.1, '準心收起', s.reticle);

  check(!problems.length, '沒有頁面錯誤', problems.length ? '\n    ' + [...new Set(problems)].join('\n    ') : '');
} catch (e) {
  console.log('✗ 測試中斷：' + e.message);
  failed++;
} finally {
  b.close();
}
console.log(failed ? `\n${failed} 項沒過` : '\n全部通過');
process.exit(failed ? 1 : 0);
