// 路人的群眾品質量測：不開瀏覽器，把海市和路人建出來，模擬幾個時段、幾個玩家站位，數
//   穿模：不同組的兩個人距離小於 0.45 m 的對數（平均每一幀）、有穿模的幀佔幾成
//   疊住：距離小於 0.2 m（幾乎站在同一個點）的對數
//   跳動：同一個人相鄰兩幀位置差超過 0.3 m（被硬拉、瞬間彈跳）的次數，每千個人幀
//   同步：近處走路的角色步伐相位的集中度，1 是完全同步，18 個人隨機大約 0.25
//   以及每一幀 update 花的毫秒數，位置有沒有變成 NaN
//   node tools/check-crowd.mjs
import { THREE, w, ROOT } from './haishi-env.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { Passersby, busyAt } = await import(pathToFileURL(path.join(ROOT, 'js/passersby.js')).href);
const SPOTS = [{ name: '下街', x: -2, y: 6.8, z: -14 }, { name: '碼頭', x: 0, y: 0, z: 8 }, { name: '燈巷', x: -6, y: 9.2, z: -24 }];
const HOURS = [8, 13, 2, 20];   // 台灣時間
const WINDOWS = 4, FRAMES = 450, DT = 1 / 30;

const realNow = Date.now;
const rows = [];
for (const hour of HOURS) {
  const stat = { jumps: 0, pf: 0, nan: 0, frames: 0, bad: 0, close: 0, stack: 0, nearBad: 0, people: 0, sync: 0, syncN: 0, ms: 0, worst: 0 };
  for (const spot of SPOTS) {
    const ps = new Passersby({ scene: new THREE.Scene(), world: w, shadowTex: null });
    const player = { pos: { x: spot.x, y: spot.y, z: spot.z } };
    const lastPos = new Map();
    for (let win = 0; win < WINDOWS; win++) {
      lastPos.clear();
      const base = Date.UTC(2026, 10, 1, (hour - 8 + 24) % 24, 0, 0) + win * 71000;
      for (let f = 0; f < FRAMES; f++) {
        Date.now = () => base + f * DT * 1000;
        const a = performance.now();
        ps.update(DT, player);
        const ms = performance.now() - a;
        const cur = new Map(ps.last.map((q) => [q.key, q]));
        if (f >= 60) for (const [k, q] of cur) { const o = lastPos.get(k); if (o) { stat.pf++; if (Math.hypot(q.fx - o.fx, q.fz - o.fz) > 0.3) stat.jumps++; } }
        lastPos.clear();
        for (const [k, q] of cur) lastPos.set(k, { fx: q.fx, fz: q.fz });
        if (f < 60) continue;   // 剛開始在建角色，不算
        stat.ms += ms; stat.worst = Math.max(stat.worst, ms); stat.frames++;
        const L = ps.last;
        stat.people += L.length;
        for (const q of L) if (![q.fx, q.fy, q.fz].every(Number.isFinite)) stat.nan++;
        let c = 0, s = 0, nb = 0;
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
          const A = L[i], B = L[j];
          if (A.i === B.i || Math.abs(A.y - B.y) > 1.5) continue;
          const d = Math.hypot(A.fx - B.fx, A.fz - B.fz);
          if (d < 0.45) { c++; if (A.near && B.near) nb++; }
          if (d < 0.2) s++;
        }
        stat.close += c; stat.stack += s; stat.nearBad += nb;
        if (c) stat.bad++;
        const walkers = ps.pool.filter((e) => e.key && (e.ch.walk ?? 0) > 0.5);
        if (walkers.length >= 4) {
          let sx = 0, sz = 0;
          for (const e of walkers) { sx += Math.cos(e.ch.phase); sz += Math.sin(e.ch.phase); }
          stat.sync += Math.hypot(sx, sz) / walkers.length; stat.syncN++;
        }
      }
    }
  }
  rows.push({ hour, ...stat });
}
Date.now = realNow;
const f2 = (v) => v.toFixed(2);
const nan = rows.reduce((s, r) => s + r.nan, 0);
console.log(nan ? `!! 有 ${nan} 個位置不是數字` : '位置全部是正常的數字');
console.log('時段    人數   穿模(對/幀)  有穿模的幀  其中近處  疊住(對/幀)  跳動(次/千幀人)  步伐同步度  平均ms  最慢ms');
for (const r of rows) {
  console.log(`${String(r.hour).padStart(2)}點   ${f2(r.people / r.frames).padStart(6)}   ${f2(r.close / r.frames).padStart(8)}   ${(r.bad / r.frames * 100).toFixed(0).padStart(7)}%   ${f2(r.nearBad / r.frames).padStart(6)}   ${f2(r.stack / r.frames).padStart(8)}   ${(r.jumps / Math.max(1, r.pf) * 1000).toFixed(2).padStart(10)}   ${f2(r.syncN ? r.sync / r.syncN : 0).padStart(8)}   ${f2(r.ms / r.frames).padStart(6)}  ${r.worst.toFixed(1).padStart(6)}`);
}
