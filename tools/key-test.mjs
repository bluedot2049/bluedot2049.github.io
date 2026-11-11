// 電腦按鍵測試：無頭 Edge 開畫廊，照劇本按鍵盤、滑鼠，看 keymap.js 的按鍵表、換鍵卡、存檔、提示的字有沒有照 docs/介面原則.md 走。
//   node tools/key-test.mjs
// 跳換成 J、跟坐撞到對調、側鍵當成鍵、換過的鍵手把照樣叫得到（fire）、存檔碼帶著、眼紋不帶、提示跟著換、換回原本的
import { openBrowser, sleep } from './headless.mjs';
import fs from 'node:fs';
// 按鍵表有幾個功能：數 keymap.js 的 ACTIONS 那幾行（['id', '名字', '在哪', [鍵]]），加了功能不用改這裡
const ACTIONS = { length: (fs.readFileSync(new URL('../js/controls/keymap.js', import.meta.url), 'utf8').split('export const ACTIONS')[1].split('];')[0].match(/\['\w+', '[^']+', '\w+', \[/g) || []).length };

let failed = 0;
const check = (ok, what, got = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${got !== '' ? `　${got}` : ''}`);
  if (!ok) failed++;
};

const problems = [];
const b = await openBrowser({ port: 8176, dbg: 9376, window: '1280,800', onEvent: (d) => {
  if (d.method === 'Runtime.exceptionThrown') problems.push('錯誤 ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
} });
const { send, ev } = b;
// 真的按鍵（CDP 送的是 isTrusted 的事件）
const VK = { Space: 32, Escape: 27, KeyJ: 74, KeyC: 67, KeyI: 73, KeyP: 80, KeyZ: 90, KeyW: 87 };
const keyOf = (code) => (code === 'Space' ? ' ' : code === 'Escape' ? 'Escape' : code.slice(3).toLowerCase());
const down = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyOf(code), windowsVirtualKeyCode: VK[code] });
const up = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyOf(code), windowsVirtualKeyCode: VK[code] });
const tap = async (code, ms = 80) => { await down(code); await sleep(ms); await up(code); await sleep(200); };
const click = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el?.click(); return !!el; })()`);
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const Q = 'z=gallery&q=mid&debug&crowd=0&beast=0&happen=0&act=0&rain=0&dust=0.5&from=haishi';
  await b.load(Q);
  await ev(`localStorage.clear(); localStorage.setItem('entered', '1'); sessionStorage.clear(); 1`);
  check(await b.load(Q), '畫廊載入');
  await sleep(1200);
  await ev(`(() => { const p = __g.player, j = p.jump.bind(p), s = p.toggleSit.bind(p); window.__jumps = 0; window.__sits = 0;
    p.jump = (...a) => { __jumps++; return j(...a); }; p.toggleSit = (...a) => { __sits++; return s(...a); };
    window.__kd = []; addEventListener('keydown', (e) => __kd.push(e.code), true); return 1; })()`);
  const n = () => ev(`({ j: __jumps, s: __sits })`);
  const st = () => ev(`(() => ({ pause: document.getElementById('pause').classList.contains('show'), card: document.getElementById('keymap').classList.contains('show'),
    listen: document.querySelector('#keymap .km-slot.listen kbd')?.textContent || '', hint: document.getElementById('hint').textContent,
    keys: (JSON.parse(localStorage.getItem('save')) || {}).deskKeys ?? null, jumpKbd: document.querySelector('#keymap .km-slot[data-a="jump"][data-s="0"] kbd').textContent,
    sitKbd: document.querySelector('#keymap .km-slot[data-a="sit"][data-s="0"] kbd').textContent, act: document.getElementById('action-btn').dataset.key,
    photo: __g.photo.active }))()`);

  await tap('Space');
  check((await n()).j === 1, '空白鍵：跳');

  // 暫停選單 → 鍵盤滑鼠
  await tap('Escape');
  check((await st()).pause, 'Esc：暫停選單');
  check(await click('#pause [data-act="keymap"]'), '暫停選單有「鍵盤滑鼠」');
  await sleep(200);
  let s = await st();
  const slots = await ev(`document.querySelectorAll('#keymap .km-slot').length`);
  check(s.card && !s.pause && slots === ACTIONS.length * 2, `換鍵卡打開，${ACTIONS.length} 個功能各兩格`, slots);
  await click('#keymap .km-slot[data-a="jump"][data-s="0"]');
  s = await st();
  check(/按一下/.test(s.listen), '點「跳」的第一格：等鍵', s.listen);
  await tap('KeyJ');
  s = await st();
  // 存檔：第 4 個功能（跳），J 是 CODES 的第 9 個（存成 10 = 0a），第二格空
  check(s.keys === '040a00' && /「跳」改成 J/.test(s.hint), '按 J：跳改成 J，記進存檔', `${s.keys}　${s.hint}`);
  check(s.jumpKbd === 'J', '換鍵卡上「跳」寫 J', s.jumpKbd);
  // 撞到：坐改成 J，跳拿坐原本的 C
  await click('#keymap .km-slot[data-a="sit"][data-s="0"]');
  await tap('KeyJ');
  s = await st();
  check(s.sitKbd === 'J' && s.jumpKbd === 'C' && /「坐」改成 J，「跳」改成 C/.test(s.hint), '坐也按 J：撞到對調，跳換成 C', s.hint);
  // 側鍵：等鍵時按滑鼠的「往前」側鍵
  await click('#keymap .km-slot[data-a="eye"][data-s="1"]');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 200, button: 'forward', buttons: 16, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 200, button: 'forward', buttons: 0, clickCount: 1 });
  await sleep(200);
  const eye = await ev(`[...document.querySelectorAll('#keymap .km-slot[data-a="eye"] kbd')].map((k) => k.textContent).join(' ')`);
  check(eye === 'B 側鍵前', '黑眼的第二格：側鍵前', eye);
  // Esc 不換、再一次收起回到暫停選單
  await click('#keymap .km-slot[data-a="talk"][data-s="0"]');
  await tap('Escape');
  s = await st();
  check(s.card && !s.listen, '等鍵時 Esc：不換，卡還在');
  await tap('Escape');
  s = await st();
  check(!s.card && s.pause, 'Esc：收起換鍵卡，回到暫停選單');
  await sleep(300);   // 暫停選單剛打開的 0.3 秒內不收 Esc（deskkeys.js）
  await tap('Escape');
  check(!(await st()).pause, 'Esc：收起暫停選單');

  // 新的鍵：C 跳、J 坐，空白鍵沒反應；手把照功能叫（fire）照樣跳
  const n0 = await n();
  await tap('Space');
  await tap('KeyC');
  await sleep(900);
  await tap('KeyJ');
  await sleep(300);
  await tap('KeyJ');
  let n1 = await n();
  check(n1.j - n0.j === 1 && n1.s - n0.s === 2, '換過以後：C 跳、J 坐（起），空白鍵不跳', JSON.stringify([n0, n1]));
  await sleep(800);
  await ev(`import('/js/controls/keymap.js').then((m) => { m.fire('jump'); return 1; })`);
  n1 = await n();
  check(n1.j - n0.j === 2, '手把照功能叫（fire）：鍵換過照樣跳');
  // 側鍵送出去的是虛擬的鍵 Mouse4，黑眼收到就叫出來（黑眼自己擋掉後面的人，看它有沒有動）
  const eyeNow = () => ev(`document.getElementById('eye-btn').getAttribute('aria-pressed') + ':' + document.getElementById('eye-card').classList.contains('open')`);
  const e0 = await eyeNow();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'forward', buttons: 16, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'forward', buttons: 0, clickCount: 1 });
  await sleep(400);
  const e1 = await eyeNow();
  check(e1 !== e0, '按側鍵：叫出黑眼', `${e0} → ${e1}`);
  if (/true$/.test(e1)) await tap('Escape');

  // 存檔帶著、眼紋不帶
  const codes = await ev(`Promise.all([import('/js/save/savecode.js'), import('/js/save/progress.js')]).then(([c, p]) => ({ back: c.readCode(c.saveCode())?.save.deskKeys, eye: 'deskKeys' in c.readIris(c.irisBytes(p.getSave(), 71)), now: p.getSave().deskKeys }))`);
  check(!!codes.now && codes.back === codes.now, '存檔帶著按鍵、讀得回來', codes.now);
  check(!codes.eye, '眼紋不帶按鍵');

  // 攝影模式：Z 進、空白鍵拍、Esc 出
  await ev(`window.__shots = 0; { const ph = __g.photo, f = ph.shoot.bind(ph); ph.shoot = (...a) => { window.__shots++; return f(...a); }; } 1`);
  await tap('KeyZ');
  await sleep(500);
  check((await st()).photo, 'Z：攝影模式');
  const tags = await ev(`[...document.querySelectorAll('.ph-tag')].filter((t) => getComputedStyle(t).display !== 'none').map((t) => [...t.children].filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.textContent).join('')).join(' ')`);
  check(/空白鍵/.test(tags) && /Esc/.test(tags), '快門那排底下標鍵', tags);
  await tap('Space');
  await sleep(700);
  check((await ev('window.__shots')) >= 1, '空白鍵：拍了');
  await sleep(1500);
  await tap('Escape');
  await sleep(300);
  if ((await st()).photo) await tap('Escape');
  await sleep(300);
  check(!(await st()).photo, 'Esc：離開攝影模式');

  // 換回原本的
  await tap('Escape');
  await click('#pause [data-act="keymap"]');
  await sleep(200);
  await click('#keymap .km-reset');
  s = await st();
  check(s.keys === null && s.jumpKbd === '空白鍵' && s.act === 'E', '換回原本的：存檔裡沒有按鍵、「跳」寫回空白鍵', JSON.stringify([s.keys, s.jumpKbd, s.act]));
  await tap('Escape');
  await sleep(300);
  await tap('Escape');
  check(!(await st()).pause && !(await st()).card, 'Esc 兩下：都收起來');
  check(problems.length === 0, '沒有頁面錯誤', problems.join('\n'));
} finally {
  b.close();
}
console.log(failed ? `\n${failed} 項沒過` : '\n全部通過');
process.exit(failed ? 1 : 0);
