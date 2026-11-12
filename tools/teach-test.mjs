// 教學測試：無頭 Edge 開畫廊，電腦、橫拿的觸控各從前門進來一次，看教學表（js/controls/lessons.js）照時機說、照操作寫、做了收掉。
//   node tools/teach-test.mjs
// 看的是：進門教走（帶示範圖）→ 走過 8 公尺教轉 → 照完鏡子走開教存讀檔 → 第一次拍到照片教行囊、行囊鈕亮 →「有空再說」照順序一則一則（__lessons.next 不等時間）、說到的鈕閃到用過
import { openBrowser, sleep } from './headless.mjs';

let failed = 0;
const check = (ok, what, got = '') => {
  console.log(`${ok ? '✓' : '✗'} ${what}${got !== '' ? `　${got}` : ''}`);
  if (!ok) failed++;
};

async function run(touch) {
  const problems = [];
  const b = await openBrowser({ port: touch ? 8182 : 8181, dbg: touch ? 9382 : 9381, window: touch ? '900,900' : '1280,800', onEvent: (d) => {
    if (d.method === 'Runtime.exceptionThrown') problems.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
  } });
  const { send, ev } = b;
  const name = touch ? '觸控' : '電腦';
  // 字（示範圖 SVG 裡的鍵帽字不算，只看 #hint 的文字節點）、亮金的鈕
  const hint = () => ev(`!document.getElementById('hint').classList.contains('show') ? '' : [...document.getElementById('hint').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')`);
  const lit = () => ev(`[...document.querySelectorAll('.beckon')].map((e) => '#' + e.id).join(',')`);
  const until = async (expr, n = 40) => { for (let t = 0; t < n; t++) { if (await ev(expr)) return true; await sleep(250); } return false; };
  const waitHint = async (re, n = 40) => { let h = ''; for (let t = 0; t < n && !re.test(h); t++) { await sleep(250); h = await hint(); } return h; };
  try {
    if (touch) {
      await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    // 從前門進來（不帶 from），來過的人（不跳門口的告示），設定、教學次數清空
    const Q = 'z=gallery&q=mid&debug&crowd=0&beast=0&happen=0&act=0&rain=0&dust=0.5';
    await b.load(Q);
    await ev(`localStorage.clear(); localStorage.setItem('entered', '1'); localStorage.setItem('guideOff', '1'); sessionStorage.clear(); 1`);
    check(await b.load(Q), `${name}：畫廊載入`);
    await ev(`document.documentElement.classList.add('no-dev'); 1`);

    // 進門：門關上、房名跳完才教走
    let h = await waitHint(/移動/, 40);
    const demo = await ev(`!!document.querySelector('#hint .demo')`);
    check(/移動/.test(h) && demo, `${name}：進門教走，前面有示範圖`, h);
    if (touch) check(await ev(`!!document.querySelector('.demo-on.show')`), '觸控：示範疊在搖桿上');
    else check(/WASD/.test(h), '電腦：寫 WASD', h);

    // 走去鏡子（幾公尺）：先收掉「走」；到了教轉身，走開教存讀檔
    await ev(`__g.player.goToMirror(); 1`);
    let seen = JSON.parse(await ev(`localStorage.getItem('tipsSeen')`) || '{}');
    check(await until(`__g.player.focus?.kind === 'mirror'`, 80), `${name}：走到鏡子前`);
    h = await waitHint(/轉身/, 20);
    check(/轉身/.test(h), `${name}：照鏡子教轉身`, h);
    seen = JSON.parse(await ev(`localStorage.getItem('tipsSeen')`) || '{}');
    check(seen[`move-${touch ? 'touch' : 'desk'}`] === 'done', `${name}：走過就記成學會了`, JSON.stringify(seen));
    await ev(`__g.player.exitFocus(); 1`);
    h = await waitHint(/存檔／讀檔/, 20);
    check(/存檔／讀檔/.test(h), `${name}：照完鏡子走開教存讀檔`, h);
    await sleep(300);
    if (touch) check(/#pack-btn/.test(await lit()), '觸控：行囊鈕亮金');

    // 再走去下一間的中間：從進門算過了 8 公尺還沒轉過視角，教轉
    await ev(`__g.ui.hideHint(); (() => { const c = __g.world.rooms[1].center; __g.player.walkTo(c.x, c.z); return 1; })()`);
    h = await waitHint(/轉動視角/, 60);
    check(/轉動視角/.test(h), `${name}：走過 8 公尺教轉視角`, h + '　' + await ev(`__g.player.pos.x.toFixed(1) + ',' + __g.player.pos.z.toFixed(1)`));
    if (!touch) check(/跳/.test(h) && /坐/.test(h), '電腦：轉視角那句帶跳、坐的鍵', h);

    // 第一次拍到照片：照片在行囊
    await ev(`__g.ui.hideHint(); dispatchEvent(new CustomEvent('photoadd', { detail: { kind: 'test' } })); 1`);
    h = await waitHint(/行囊/, 20);
    check(/行囊/.test(h), `${name}：拍到照片教行囊`, h);

    // 有空再說：一則一則，說到的鈕亮金
    const said = [];
    for (let i = 0; i < 10; i++) {
      await ev(`__g.ui.hideHint(); document.querySelectorAll('.beckon').forEach((e) => e.classList.remove('beckon')); 1`);
      await sleep(150);
      if (!(await ev(`__lessons.next()`))) break;
      await sleep(250);
      said.push(`${await hint()}［${await lit() || '—'}］`);
    }
    console.log(`  ${name}有空再說：\n    ` + said.join('\n    '));
    check(said.length >= 3, `${name}：有空再說說了 ${said.length} 則`);
    check(said.every((s) => !/［—］/.test(s) || !touch), `${name}：手機每則都有一顆亮著`);
    // 亮的鈕一直閃到用過：等 6 秒還亮著；按了那個功能的鍵（手把也走這條，keymap.js 的 fire）、或點了那顆才停
    const L = `import('/js/controls/lessons.js')`, K = `import('/js/controls/keymap.js')`;
    await ev(`${L}.then((m) => m.beckon('#more-btn', ['tidy']))`);
    await sleep(6000);
    check(/#more-btn/.test(await lit()), `${name}：沒用過一直閃`);
    await ev(`${K}.then((m) => { m.fire('tidy'); m.fire('tidy'); return 1; })`);
    await sleep(200);
    check(!/#more-btn/.test(await lit()), `${name}：按了鍵就不閃`);
    await ev(`${L}.then((m) => m.beckon('#emote-btn'))`);
    await ev(`document.querySelector('#emote-btn').click(); 1`);
    await sleep(200);
    check(!/#emote-btn/.test(await lit()), `${name}：點了就不閃`);
    check(!problems.length, `${name}：沒有頁面錯誤`, problems.slice(0, 3).join(' | '));
  } finally {
    await b.close();
  }
}

await run(false);
await run(true);
console.log(failed ? `\n${failed} 項沒過` : '\n全部通過');
process.exit(failed ? 1 : 0);
