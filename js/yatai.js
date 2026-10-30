// 屋台：夜市的小吃推車。兩個木輪子、一片小屋頂，前緣掛一排暖簾，旁邊插一支寫著賣什麼的旗子。
// 每一台各自賣一種小吃，櫃台上的東西、冒的煙和蒸氣都不一樣
import * as THREE from 'three';
import { Kit } from './props.js';
import { addRoof } from './eaves.js';

const shadeOf = (c) => new THREE.Color(c).offsetHSL(0, 0, -0.12).getStyle();
const WOOD = '#6a4430', WOOD_HI = '#8a5a3a', TOP = '#a07850', DARK = '#2a201c', CREAM = '#efe4c8';

// 櫃台面上的小吃。y 是櫃台面，g 是地面。東西放在 x -0.9 到 0.9、z -0.3 到 0.4 之間；
// 攤販的臉在中間那一段後面，那裡只放矮的，高的東西擺到兩端或推車旁邊的地上
const FOODS = {
  // 烤魷魚：炭爐上一排串好的魷魚，旁邊一罐醬
  squid(k, y) {
    k.box(1.3, 0.14, 0.42, '#2a2422', -0.15, y + 0.07, 0);
    k.plane(1.2, 0.34, '#ff5a1a', -0.15, y + 0.145, 0, { rx: -Math.PI / 2, glow: true, color2: '#ffb050' });
    for (let i = 0; i < 6; i++) k.box(1.24, 0.015, 0.015, '#151210', -0.15, y + 0.16, -0.15 + i * 0.06);
    for (let i = 0; i < 6; i++) {
      const x = -0.7 + i * 0.2;
      k.cyl(0.012, 0.012, 0.6, '#d8c090', x, y + 0.19, 0.08, { rx: Math.PI / 2 }, 4);
      k.ball(0.075, i % 3 ? '#c8703a' : '#b05a2a', x, y + 0.2, -0.02, { sx: 0.85, sy: 0.45, sz: 2.4, color2: '#e8a868' });
      for (const dx of [-0.04, 0.04]) k.box(0.025, 0.02, 0.16, '#a85a30', x + dx, y + 0.19, -0.26);
    }
    k.cyl(0.09, 0.08, 0.16, '#5a2a1a', 0.7, y + 0.08, -0.1, {}, 8);
    k.cyl(0.01, 0.01, 0.28, '#d8c090', 0.72, y + 0.2, -0.1, { rz: -0.3 }, 4);
    k.light(-0.15, y + 0.2, 0, '#ff7a30', 1.1);
    k.puff(-0.15, y + 0.3, 0, 'smoke', 0.8);
    k.puff(-0.5, y + 0.25, 0.05, 'steam', 0.7);
  },
  // 關東煮：方鍋分成幾格，蘿蔔、蛋、竹輪泡在湯裡，竹籤插著。鍋子嵌進櫃台，只露出上緣
  oden(k, y) {
    const p = y - 0.16;
    k.box(1.1, 0.28, 0.56, '#8a8a92', -0.2, p + 0.14, 0, { color2: '#c0c0c8' });
    k.plane(1.04, 0.5, '#c8963a', -0.2, p + 0.25, 0, { rx: -Math.PI / 2, color2: '#d8a850' });
    for (const x of [-0.38, -0.02]) k.box(0.02, 0.12, 0.5, '#a8a8b0', x, p + 0.26, 0);
    for (let i = 0; i < 3; i++) {
      k.cyl(0.075, 0.075, 0.06, '#e8d8a0', -0.6 + i * 0.12, p + 0.27, -0.1 + (i % 2) * 0.2, {}, 8);
      k.ball(0.055, '#d8b070', -0.2 + (i - 1) * 0.11, p + 0.27, 0.12 - (i % 2) * 0.2, { sy: 0.8 });
      k.cyl(0.04, 0.04, 0.2, '#d8b888', 0.08 + i * 0.06, p + 0.28, -0.12 + i * 0.12, { rz: Math.PI / 2, ry: 0.4 }, 6);
    }
    for (let i = 0; i < 5; i++) k.cyl(0.008, 0.008, 0.3, '#d8c090', -0.65 + i * 0.25, p + 0.38, -0.05 + (i % 2) * 0.1, { rz: (i % 2 - 0.5) * 0.4 }, 4);
    for (let i = 0; i < 4; i++) k.cyl(0.05, 0.045, 0.1, CREAM, 0.6, y + 0.05 + i * 0.03, 0.05, {}, 8);
    k.cyl(0.04, 0.035, 0.12, '#c8a050', 0.75, y + 0.06, -0.2, {}, 6);
    k.light(-0.2, p + 0.4, 0, '#ffd8a0', 0.7);
    k.puff(-0.45, p + 0.3, 0, 'steam', 1.0);
    k.puff(0.05, p + 0.3, 0.05, 'steam', 0.9);
  },
  // 章魚燒：鐵板上一格一格的圓球，旁邊幾盒裝好的
  takoyaki(k, y) {
    k.box(1.0, 0.12, 0.5, '#1e1c1c', -0.25, y + 0.06, 0);
    k.plane(0.92, 0.42, '#ff6a2a', -0.25, y + 0.03, 0.252, { glow: true, color2: '#ff9a40' });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) k.rock(0.055, (r + c) % 4 ? '#c8803a' : '#a8682a', -0.65 + c * 0.16, y + 0.15, -0.14 + r * 0.14, { color2: '#e8b060' });
    for (let b = 0; b < 2; b++) {
      const bx = 0.45 + b * 0.32;
      k.box(0.26, 0.04, 0.16, '#d8c098', bx, y + 0.02, 0.1 - b * 0.18);
      for (let i = 0; i < 3; i++) k.rock(0.045, '#5a2a1a', bx - 0.08 + i * 0.08, y + 0.07, 0.1 - b * 0.18, { color2: '#8a4a2a' });
      k.box(0.2, 0.01, 0.04, '#f0e0b0', bx, y + 0.11, 0.1 - b * 0.18, { ry: 0.3 });
    }
    k.light(-0.25, y + 0.2, 0, '#ff8a40', 0.8);
    k.puff(-0.3, y + 0.22, 0, 'steam', 0.8);
  },
  // 糖葫蘆：草把子綁在竹竿上，立在推車左邊的地上，插滿一串一串紅亮亮的；櫃台上平放幾串和一鍋糖
  tanghulu(k, y, g) {
    const sx = -1.45, sz = 0.15, sy = g + 0.95;
    k.cyl(0.03, 0.035, 1.0, '#b89860', sx, g + 0.5, sz, {}, 5);
    k.cyl(0.13, 0.15, 0.6, '#c8a860', sx, sy + 0.3, sz, { color2: '#e0c880' }, 8);
    k.cyl(0.03, 0.03, 0.2, DARK, sx, sy + 0.65, sz, {}, 5);
    const fruit = ['#d8281e', '#d8281e', '#c82030', '#7ab048', '#e84050'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, tilt = 0.55 + (i % 3) * 0.12, h = 0.25 + (i % 2) * 0.15;
      const dx = Math.sin(tilt) * Math.cos(a), dz = Math.sin(tilt) * Math.sin(a), dy = Math.cos(tilt);
      const bx = sx + Math.cos(a) * 0.12, by = sy + h, bz = sz + Math.sin(a) * 0.12;
      k.cyl(0.008, 0.008, 0.5, '#d8c090', bx + dx * 0.25, by + dy * 0.25, bz + dz * 0.25, { rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt }, 4);
      const c = fruit[i % fruit.length];
      for (let j = 0; j < 4; j++) {
        const t = 0.2 + j * 0.085;
        k.ball(0.042, c, bx + dx * t, by + dy * t, bz + dz * t, { color2: '#ff9a8a' });
      }
    }
    for (let i = 0; i < 4; i++) {
      k.cyl(0.008, 0.008, 0.4, '#d8c090', 0.4 + i * 0.12, y + 0.02, 0.1, { rx: Math.PI / 2, ry: 0.2 }, 4);
      for (let j = 0; j < 3; j++) k.ball(0.04, i === 2 ? '#7ab048' : '#d8281e', 0.4 + i * 0.12 + j * 0.016, y + 0.045, 0.02 + j * 0.08, { color2: '#ff9a8a' });
    }
    k.cyl(0.12, 0.1, 0.12, '#3a3030', -0.6, y + 0.06, -0.2, {}, 8);
    k.add(new THREE.CircleGeometry(0.1, 10), '#ffb030', -0.6, y + 0.125, -0.2, { rx: -Math.PI / 2, glow: true });
    k.light(sx, sy + 0.4, sz, '#ffb070', 0.7);
    k.puff(-0.6, y + 0.15, -0.2, 'steam', 0.5);
  },
  // 包子：一疊竹蒸籠擺在櫃台左端，右端那籠打開，白白胖胖
  baozi(k, y) {
    const bx = -0.72, ox = 0.62;
    for (let i = 0; i < 3; i++) {
      k.cyl(0.3, 0.3, 0.14, '#c8a470', bx, y + 0.07 + i * 0.145, 0, { color2: '#dcb880' }, 12);
      k.cyl(0.305, 0.305, 0.025, '#a8844a', bx, y + 0.02 + i * 0.145, 0, {}, 12);
    }
    k.cone(0.31, 0.1, '#b89060', bx, y + 0.49, 0);
    k.cyl(0.04, 0.04, 0.04, '#a8844a', bx, y + 0.55, 0, {}, 6);
    k.cyl(0.28, 0.28, 0.14, '#c8a470', ox, y + 0.07, 0, { color2: '#dcb880' }, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      k.ball(0.095, '#f6f0e2', ox + Math.cos(a) * 0.13, y + 0.19, Math.sin(a) * 0.13, { sy: 0.72, color2: '#fffaf0' });
      k.rock(0.025, '#e8dcc8', ox + Math.cos(a) * 0.13, y + 0.26, Math.sin(a) * 0.13);
    }
    k.light(0, y + 0.4, 0, '#fff0d0', 0.6);
    k.puff(ox, y + 0.26, 0, 'steam', 1.3);
    k.puff(bx, y + 0.58, 0, 'steam', 1.0);
  },
  // 烤番薯：一口石頭甕坐在推車左邊的地上，底下的火口紅紅的；甕頂和櫃台上的籃子裡都是番薯
  potato(k, y, g) {
    const kx = -1.55, kz = 0.1;
    k.cyl(0.32, 0.36, 0.8, '#3a3634', kx, g + 0.4, kz, { color2: '#5a5450' }, 10);
    k.plane(0.22, 0.16, '#ff5a18', kx, g + 0.2, kz + 0.355, { glow: true, color2: '#ffb050' });
    k.cyl(0.35, 0.35, 0.03, '#1e1c1a', kx, g + 0.81, kz, {}, 10);
    for (let i = 0; i < 4; i++) k.ball(0.065, '#8a3a4a', kx - 0.15 + i * 0.1, g + 0.86, kz + (i % 2 - 0.5) * 0.15, { sx: 2.0, ry: i * 0.6, color2: '#a85060' });
    k.cyl(0.24, 0.2, 0.15, '#a07840', 0.45, y + 0.075, 0, { color2: '#c09858' }, 10);
    for (let i = 0; i < 4; i++) k.ball(0.06, '#8a3a4a', 0.38 + (i % 2) * 0.14, y + 0.17, -0.06 + Math.floor(i / 2) * 0.12, { sx: 1.9, ry: i, color2: '#a85060' });
    k.ball(0.06, '#e8b040', 0.5, y + 0.22, 0.02, { sx: 1.6, sy: 0.6 });
    for (let i = 0; i < 3; i++) k.box(0.14, 0.2, 0.08, '#c8a878', 0.82, y + 0.1, -0.2 + i * 0.12, { ry: 0.2 });
    k.light(kx, g + 0.25, kz + 0.45, '#ff6a20', 0.9);
    k.puff(kx, g + 0.92, kz, 'smoke', 0.6);
  },
};

// x、y、z：推車中央的地面；ry：客人站的那一邊朝哪（0 朝 +z）。
// lamp：畫燈籠的函式（跟街上的燈籠同一種）；signs：招牌貼圖；fid：屋頂那一組的編號，擋住鏡頭時淡掉
// 回傳攤販站的位置、這台推車擋住的範圍，和屋頂的範圍
export function yatai(bucket, signs, R, o) {
  const { x, y, z, ry = 0, food, color, text, tile = '#3a3a44', lamp, fid = 0 } = o;
  const k = new Kit(R), top = new Kit(R);
  top.fid = fid;
  // 車身、櫃台、前面一條漆成招牌色的板子。櫃台到角色胸口，攤販的上半身和手露得出來
  const H = 0.62;
  k.box(2.0, H - 0.18, 0.85, WOOD, 0, y + (H + 0.06) / 2, 0, { color2: WOOD_HI });
  k.box(2.2, 0.06, 1.05, TOP, 0, y + H - 0.03, 0.08);
  k.box(2.0, 0.14, 0.02, color, 0, y + H - 0.2, 0.435);
  for (const sx of [-1, 1]) {
    k.torus(0.28, 0.045, Math.PI * 2, DARK, sx * 1.06, y + 0.28, 0, { ry: Math.PI / 2 });
    k.cyl(0.06, 0.06, 0.12, DARK, sx * 1.06, y + 0.28, 0, { rz: Math.PI / 2 }, 6);
    for (let i = 0; i < 3; i++) k.box(0.03, 0.52, 0.03, DARK, sx * 1.06, y + 0.28, 0, { rx: (i / 3) * Math.PI });
  }
  const post = 2.27 - H;
  for (const sx of [-0.98, 0.98]) for (const sz of [-0.42, 0.48]) k.box(0.07, post, 0.07, DARK, sx, y + H + post / 2, sz);
  addRoof(top, 0, y + 2.26, 0.03, 2.7, 1.6, 0.45, { tile, lift: 0.14, ridge: 1.35 });
  // 暖簾：屋簷底下一排短布，兩色交錯
  for (let i = 0; i < 4; i++) top.box(0.48, 0.38, 0.02, i % 2 ? color : shadeOf(color), -0.75 + i * 0.5, y + 2.04, 0.74);
  // 屋簷下的燈泡和兩角的紅燈籠
  top.ball(0.07, '#fff2c8', 0, y + 2.05, 0.15, { glow: true });
  top.light(0, y + 2.05, 0.15, '#ffd8a0', 1.2);
  lamp(top, -1.2, y + 1.85, 0.72, 0.8);
  lamp(top, 1.2, y + 1.85, 0.72, 0.8);
  FOODS[food](k, y + H, y);
  // 地上的光：推車前面一大圈
  k.pool(0, y, 1.0, 2.6, '#ffa060', 0.42);
  // 旗子：竹竿立在推車旁邊，橫桿上垂一塊直的布寫著賣什麼
  const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  k.cyl(0.025, 0.03, 3.0, '#b89860', 1.5, y + 1.5, 0.4, {}, 5);
  k.box(0.5, 0.025, 0.025, '#b89860', 1.73, y + 2.92, 0.4);
  k.emit(bucket, x, z, ry);
  top.emit(bucket, x, z, ry);
  const [fx, fz] = at(1.73, 0.42);
  signs.add(text, fx, y + 2.9 - 0.22 * [...text].length, fz, 0.44, ry, { bg: color, fg: CREAM });
  // 車身連同左邊地上的草把、石甕、右邊的旗竿都算進去
  const [vx, vz] = at(0, -0.85), [ox, oz] = at(0.02, 0.05);
  const side = Math.abs(s) > 0.5;
  const corners = [[-1.45, -0.8], [1.45, -0.8], [-1.45, 0.95], [1.45, 0.95]].map(([lx, lz]) => at(lx, lz));
  const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
  return {
    vendor: { x: vx, y, z: vz, heading: ry },
    obstacle: { x: ox, z: oz, hw: side ? 0.7 : 1.98, hd: side ? 1.98 : 0.7 },
    roof: [Math.min(...xs), y + 1.6, Math.min(...zs), Math.max(...xs), y + 2.95, Math.max(...zs)],
  };
}
