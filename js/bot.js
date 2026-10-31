// 煉金工程機器人（Alchemical Engineering Bot）— 第十一版（頂級神聖工程煉金法陣 × 徹底移除藥瓶回歸純粹重工 × 渾天雙層差速反轉法陣 × 手機極致輕量化）
// 蒸氣龐克 × 方形重裝工業底盤 (Square Heavy Boiler Chassis) × 手臂液壓邏輯化 × 巨型活動板手與純金屬重工注油壺 × 雙層渾天神聖鍊成法陣
// 徹底消除所有藥瓶感，回歸純粹俐落工程體態；法陣具備 360° 天文儀精密遊標度數環、環形海市秘傳符文銘文圈、七大金屬行星神龕壁龕、36齒重型工程齒圈與麥達昶神聖幾何全聯線網！
import * as THREE from 'three';
import { drawGlyph } from './glyphs.js';

// 建立材質（flatShading 確保 low-poly 經典手工工匠質感，效能極佳）
function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

function glowMat(color, emissive, emissiveIntensity = 1.0) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: emissive || color,
    emissiveIntensity,
    flatShading: true,
  });
}

// ==========================================
// 1. 地面柔光環境光暈貼圖 (Atmospheric Floor Bloom Glow)
// ==========================================
function createFloorBloomTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const cx = 256, cy = 256;

  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
  grad.addColorStop(0, 'rgba(44, 245, 200, 0.35)');
  grad.addColorStop(0.35, 'rgba(44, 245, 200, 0.15)');
  grad.addColorStop(0.65, 'rgba(255, 208, 86, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// ==========================================
// 2. 最外層：天文儀遊標刻度與環形海市符文盤 (Astrolabe Vernier & Runic Dial)
// 直徑大、旋轉沉穩緩慢（順時針旋轉），奠定文藝復興天文渾天儀與神聖幾何視覺基調
// ==========================================
function createAstrolabeBaseTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  const cx = 512, cy = 512;

  function ring(r, color = '#ffd056', lineWidth = 2, dashed = null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    if (dashed) ctx.setLineDash(dashed);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // (A) 最外層金銅加固邊圈與微型珠紋
  ring(498, '#ffd056', 4.5);
  ring(486, '#2cf5c8', 2);

  // 360 道精密天文角度刻度 (每 1° 一道微刻度、每 5° 一道中刻度、每 15° 一道主刻度)
  ctx.save();
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180;
    const isMajor = i % 15 === 0;
    const isMedium = i % 5 === 0;
    const r1 = 498;
    const r2 = isMajor ? 468 : (isMedium ? 478 : 486);
    ctx.strokeStyle = isMajor ? '#ffd056' : (isMedium ? '#2cf5c8' : 'rgba(44, 245, 200, 0.45)');
    ctx.lineWidth = isMajor ? 2.8 : (isMedium ? 1.8 : 1.0);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();

    // 在主刻度末端繪製微型圓珠節點
    if (isMajor) {
      ctx.fillStyle = '#ffd056';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r2 - 4), cy + Math.sin(a) * (r2 - 4), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // (B) 12 方位角度數值標籤 (0°, 30°, 60°, 90° ... 330°)
  const degrees = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  ctx.save();
  ctx.font = '600 13px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe08a';
  ctx.shadowColor = '#ffd056';
  ctx.shadowBlur = 6;
  degrees.forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(`${deg}°`, 0, -450);
    ctx.restore();
  });
  ctx.restore();

  // (C) 天球星象星座環 (Celestial Constellation Network: r = 432 ~ r = 398)
  ring(432, '#2cf5c8', 2.2);
  ring(398, '#ffd056', 2.0, [8, 6]);

  // 12 個黃道星宮節點與虛線幾何星連線
  ctx.save();
  ctx.strokeStyle = 'rgba(44, 245, 200, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const px = cx + Math.cos(a) * 415;
    const py = cy + Math.sin(a) * 415;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // 節點四芒星辰與光點
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const sx = cx + Math.cos(a) * 415;
    const sy = cy + Math.sin(a) * 415;
    ctx.fillStyle = i % 2 === 0 ? '#ffd056' : '#2cf5c8';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // (D) 環形海市秘傳符文銘文圈 (Haishi Esoteric Inscription Ribbon: r = 376)
  ring(388, '#2cf5c8', 1.5, [14, 8]);
  ring(360, '#ffd056', 2.0);

  const runeChars = ['✦', '海', '✦', '市', '✦', '鍊', '✦', '金', '✦', '工', '✦', '匠', '✦', '秘', '✦', '儀', '✦', '渾', '✦', '天', '✦', '星', '✦', '盤'];
  const numRunes = runeChars.length;
  ctx.save();
  for (let i = 0; i < numRunes; i++) {
    const a = (i * Math.PI * 2) / numRunes - Math.PI / 2;
    const ch = runeChars[i];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);
    ctx.translate(0, -374);

    if (ch === '✦') {
      ctx.fillStyle = '#2cf5c8';
      ctx.shadowColor = '#2cf5c8';
      ctx.shadowBlur = 8;
      ctx.font = 'bold 16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', 0, 0);
    } else {
      try {
        drawGlyph(ctx, ch, 0, 0, 18, '#ffd056');
      } catch (err) {
        ctx.fillStyle = '#ffd056';
        ctx.shadowColor = '#ffd056';
        ctx.shadowBlur = 6;
        ctx.font = 'bold 15px "Noto Sans TC", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, 0, 0);
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // (E) 八方向正交十字與對角精密工程工程標尺輔助線
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 208, 86, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(cx - 490, cy); ctx.lineTo(cx + 490, cy);
  ctx.moveTo(cx, cy - 490); ctx.lineTo(cx + 490, cy);
  ctx.moveTo(cx - 350, cy - 350); ctx.lineTo(cx + 350, cy + 350);
  ctx.moveTo(cx - 350, cy + 350); ctx.lineTo(cx + 350, cy - 350);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// ==========================================
// 3. 核心層：神聖幾何麥達昶矩陣與重工咬合齒輪陣 (Master Sacred Matrix & Gear Core)
// 直徑適中、逆時針反向差速旋轉，內含 36 齒主齒圈、七大行星金屬神龕、麥達昶全聯線、圓方互化與中央時空核心
// ==========================================
function createSacredCoreTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  const cx = 512, cy = 512;

  function ring(r, color = '#ffd056', lineWidth = 2, dashed = null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    if (dashed) ctx.setLineDash(dashed);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGear(x, y, rOuter, rInner, teeth, toothH, color, lineWidth = 3, fill = null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    if (fill) ctx.fillStyle = fill;

    ctx.beginPath();
    const step = (Math.PI * 2) / (teeth * 2);
    for (let i = 0; i < teeth * 2; i++) {
      const angle = i * step;
      const r = i % 2 === 0 ? rOuter + toothH : rOuter;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    if (fill) ctx.fill();

    if (rInner > 0) {
      ctx.beginPath();
      ctx.arc(x, y, rInner, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAlchemicalSymbol(x, y, type, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();

    if (type === 0) { // 太陽 (金 Gold)
      ctx.arc(x, y, size * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 1) { // 月亮 (銀 Silver)
      ctx.arc(x, y, size * 0.70, -Math.PI * 0.35, Math.PI * 0.35, true);
      ctx.arc(x + size * 0.38, y, size * 0.58, 1.82, Math.PI * 2 - 1.82, false);
      ctx.stroke();
    } else if (type === 2) { // 水星 (汞 Quicksilver)
      ctx.arc(x, y - size * 0.1, size * 0.36, 0, Math.PI * 2);
      ctx.moveTo(x + size * 0.36, y - size * 0.78);
      ctx.arc(x, y - size * 0.78, size * 0.36, 0, Math.PI);
      ctx.moveTo(x, y + size * 0.26); ctx.lineTo(x, y + size * 0.88);
      ctx.moveTo(x - size * 0.28, y + size * 0.56); ctx.lineTo(x + size * 0.28, y + size * 0.56);
      ctx.stroke();
    } else if (type === 3) { // 金星 (銅 Copper)
      ctx.arc(x, y - size * 0.26, size * 0.44, 0, Math.PI * 2);
      ctx.moveTo(x, y + size * 0.18); ctx.lineTo(x, y + size * 0.88);
      ctx.moveTo(x - size * 0.30, y + size * 0.52); ctx.lineTo(x + size * 0.30, y + size * 0.52);
      ctx.stroke();
    } else if (type === 4) { // 火星 (鐵 Iron)
      ctx.arc(x - size * 0.16, y + size * 0.16, size * 0.42, 0, Math.PI * 2);
      ctx.moveTo(x + size * 0.16, y - size * 0.16); ctx.lineTo(x + size * 0.76, y - size * 0.76);
      ctx.lineTo(x + size * 0.36, y - size * 0.76);
      ctx.moveTo(x + size * 0.76, y - size * 0.76); ctx.lineTo(x + size * 0.76, y - size * 0.36);
      ctx.stroke();
    } else if (type === 5) { // 木星 (錫 Tin)
      ctx.moveTo(x - size * 0.5, y - size * 0.3);
      ctx.bezierCurveTo(x - size * 0.4, y - size * 0.85, x + size * 0.1, y - size * 0.85, x, y - size * 0.2);
      ctx.lineTo(x - size * 0.5, y + size * 0.4);
      ctx.moveTo(x - size * 0.6, y + size * 0.3); ctx.lineTo(x + size * 0.5, y + size * 0.3);
      ctx.moveTo(x + size * 0.2, y - size * 0.7); ctx.lineTo(x + size * 0.2, y + size * 0.8);
      ctx.stroke();
    } else { // 土星 (鉛 Lead)
      ctx.moveTo(x - size * 0.2, y - size * 0.8); ctx.lineTo(x - size * 0.2, y + size * 0.2);
      ctx.moveTo(x - size * 0.5, y - size * 0.5); ctx.lineTo(x + size * 0.1, y - size * 0.5);
      ctx.moveTo(x - size * 0.2, y);
      ctx.bezierCurveTo(x + size * 0.1, y - size * 0.35, x + size * 0.55, y - size * 0.2, x + size * 0.35, y + size * 0.25);
      ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.6, x + size * 0.45, y + size * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- (A) 36 齒主重型鍊金咬合齒圈 (36-Tooth Master Chrono-Gear Rim: r = 468 ~ 438) ---
  drawGear(cx, cy, 452, 428, 36, 16, '#ffb834', 4, 'rgba(255, 184, 52, 0.04)');
  ring(428, '#2cf5c8', 2.5);

  // 18 顆加固黃銅鉚釘孔
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const a = (i * Math.PI * 2) / 18;
    ctx.fillStyle = '#ffd056';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 440, cy + Math.sin(a) * 440, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- (B) 七大金屬古典行星印記神龕壁龕帶 (Seven Planetary Medallion Niches: r = 372) ---
  ring(398, '#ffd056', 2.0, [10, 8]);
  ring(346, '#2cf5c8', 2.2);

  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 372;
    const sy = cy + Math.sin(a) * 372;

    // 圓形神龕雙重邊框
    ctx.save();
    ctx.strokeStyle = '#ffd056';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ffd056';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#2cf5c8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.stroke();

    // 4 個向心定位標記刻度
    for (let ti = 0; ti < 4; ti++) {
      const ta = (ti * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(ta) * 20, sy + Math.sin(ta) * 20);
      ctx.lineTo(sx + Math.cos(ta) * 24, sy + Math.sin(ta) * 24);
      ctx.stroke();
    }
    ctx.restore();

    // 行星金屬古典符號
    drawAlchemicalSymbol(sx, sy, i, 15, i % 2 === 0 ? '#2cf5c8' : '#fff0b8');

    // 壁龕之間的弧形連接微星
    const b = a + Math.PI / 7;
    ctx.save();
    ctx.fillStyle = '#2cf5c8';
    ctx.shadowColor = '#2cf5c8';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(b) * 372, cy + Math.sin(b) * 372, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- (C) 神聖幾何：麥達昶立方體矩陣與十二芒星全聯線 (Metatron's Matrix & Dodecagram) ---
  const starR = 310;
  const nodes = [];
  for (let j = 0; j < 12; j++) {
    const a = (j * Math.PI) / 6;
    nodes.push({ x: cx + Math.cos(a) * starR, y: cy + Math.sin(a) * starR });
  }

  // 1. 麥達昶全聯弦線網 (所有對稱節點間的細緻金色連線，層次極度震撼)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 208, 86, 0.35)';
  ctx.lineWidth = 1.0;
  ctx.shadowColor = '#ffd056';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    for (const step of [3, 4, 5]) {
      const target = (i + step) % 12;
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[target].x, nodes[target].y);
    }
  }
  ctx.stroke();
  ctx.restore();

  // 2. 4 個正三角形組成的實線十二芒星外框 (0°, 30°, 60°, 90°)
  function drawTri(rot, color, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let k = 0; k <= 3; k++) {
      const a = rot + (k * Math.PI * 2) / 3;
      const px = cx + Math.cos(a) * starR;
      const py = cy + Math.sin(a) * starR;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  drawTri(-Math.PI / 2, '#2cf5c8', 2.8);
  drawTri(Math.PI / 2, '#2cf5c8', 2.8);
  drawTri(-Math.PI / 2 + Math.PI / 6, '#ffd056', 2.2);
  drawTri(Math.PI / 2 + Math.PI / 6, '#ffd056', 2.2);

  ring(starR, '#ffd056', 1.5, [6, 8]);

  // 4 顆行星傳動微型齒輪 (90° 分佈，直徑 28)
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * Math.PI / 180;
    const gx = cx + Math.cos(a) * 265;
    const gy = cy + Math.sin(a) * 265;
    drawGear(gx, gy, 22, 10, 10, 5, '#ffd15c', 2.2);
  }

  // --- (D) 圓方互化古典幾何 (Squaring the Circle) ---
  ring(236, '#2cf5c8', 2.8);
  // 45° 菱形正方形
  ctx.save();
  ctx.strokeStyle = '#ffd056';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#ffd056';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const px = cx + Math.cos(a) * 236;
    const py = cy + Math.sin(a) * 236;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  ring(168, '#2cf5c8', 2.2);
  // 0° 正交正方形
  ctx.save();
  ctx.strokeStyle = '#ffd056';
  ctx.lineWidth = 2.2;
  ctx.shadowColor = '#ffd056';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = (i * Math.PI) / 2;
    const px = cx + Math.cos(a) * 168;
    const py = cy + Math.sin(a) * 168;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  ring(118, '#2cf5c8', 2.0);

  // --- (E) 中央時空太陽齒輪核心 (Chrono-Solar Core: 16 齒) ---
  drawGear(cx, cy, 96, 64, 16, 11, '#ffb834', 3.5, 'rgba(20, 16, 12, 0.55)');
  ring(64, '#2cf5c8', 2.5);

  // 8 芒微型太陽金芒
  ctx.save();
  ctx.strokeStyle = '#ffd056';
  ctx.lineWidth = 2.0;
  ctx.shadowColor = '#ffd056';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i * Math.PI) / 4;
    const px = cx + Math.cos(a) * 48;
    const py = cy + Math.sin(a) * 48;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // 核心超亮發光圓球與精密準星
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.8;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - 38, cy); ctx.lineTo(cx + 38, cy);
  ctx.moveTo(cx, cy - 38); ctx.lineTo(cx + 38, cy);
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

export class EngineeringBot {
  constructor(options = {}) {
    this.options = {
      scale: 1.0,
      showCircle: true,
      ...options,
    };

    this.group = new THREE.Group();
    this.group.scale.setScalar(this.options.scale);

    // ==========================================
    // 精心調配的經典蒸氣龐克工程配色盤
    // ==========================================
    const C_YELLOW = 0xe5a324;       // 卡通工程黃（偏暖橙工裝黃）
    const C_YELLOW_HI = 0xf5b534;    // 高光黃（安全帽外殼）
    const C_YELLOW_DARK = 0xb57c15;  // 陰影深黃（底座下腹收邊）
    const C_BRASS = 0xd9a441;        // 工業黃銅
    const C_BRASS_DARK = 0x9e7126;   // 氧化暗黃銅
    const C_COPPER = 0xc66e4e;       // 紅銅（導管、散熱器）
    const C_IRON = 0x3d3d44;         // 重型鑄鐵
    const C_IRON_LIGHT = 0x686c75;   // 拋光機械鋼材 / 活塞推桿
    const C_LEATHER = 0x5a3825;      // 厚牛皮工裝皮帶
    const C_NOSE = 0xec9478;         // 歐式卡通呆萌肉鼻
    const C_MUSTACHE = 0x7a7d88;     // 老工匠銀灰翹八字鬍
    const C_CYAN = 0x2cf5c8;         // 煉金魔導藍綠晶石（眼鏡發光面）
    const C_AMBER = 0xffa018;        // 警示燈琥珀金
    const C_FIRE = 0xff5a10;         // 燃燒室高溫烈焰橙紅
    const C_FLAME = 0x36f2d2;        // 焊炬高溫藍綠魔火
    const C_GLASS = 0xbcebf5;        // 玻璃材質

    // 建立通用材質（全面共用，避免重覆建立 Material，手機極佳化）
    const mYellow = mat(C_YELLOW);
    const mYellowHi = mat(C_YELLOW_HI);
    const mYellowDark = mat(C_YELLOW_DARK);
    const mBrass = mat(C_BRASS);
    const mBrassDark = mat(C_BRASS_DARK);
    const mCopper = mat(C_COPPER);
    const mIron = mat(C_IRON);
    const mIronLight = mat(C_IRON_LIGHT);
    const mLeather = mat(C_LEATHER);
    const mNose = mat(C_NOSE);
    const mMustache = mat(C_MUSTACHE);
    const mCyanGlow = glowMat(C_CYAN, 0x18d4aa, 1.4);
    const mAmberGlow = glowMat(C_AMBER, 0xd47a00, 1.4);
    const mFurnaceGlow = glowMat(C_FIRE, 0xff3b00, 1.8);
    const mFlameGlow = glowMat(C_FLAME, 0x20e5c5, 1.6);
    const mGlass = new THREE.MeshLambertMaterial({
      color: C_GLASS,
      transparent: true,
      opacity: 0.45,
      flatShading: true,
    });

    // 懸浮主身軀組
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 1.05;
    this.group.add(this.bodyGroup);

    // ==========================================
    // 1. 方形重裝鍋爐體態 (Square Heavy Boiler Chassis)
    // 採用八角倒角方箱柱體 (Chamfered Octagonal Prism)，正前、正後、兩側均為平整大方板
    // 徹底移除兩側藥瓶，線條俐落剛勁，回歸純粹蒸氣工程機甲體態！
    // ==========================================

    // (A) 上胸腔方裝甲塊 (Square Upper Chest Armor Block: 寬 0.96、高 0.34、深 0.82)
    const chestGeo = new THREE.CylinderGeometry(0.56, 0.60, 0.34, 8);
    const chest = new THREE.Mesh(chestGeo, mYellow);
    chest.rotation.y = Math.PI / 8; // 旋轉 22.5 度，使正面與兩側面成為平整大方板
    chest.position.set(0, 0.14, -0.02);
    this.bodyGroup.add(chest);

    // (B) 實心方型頸肩過渡台 (Square Neck Platform)
    const neckGeo = new THREE.BoxGeometry(0.68, 0.16, 0.62);
    const neck = new THREE.Mesh(neckGeo, mYellowDark);
    neck.position.set(0, 0.34, -0.02);
    this.bodyGroup.add(neck);

    // (C) 下腹部方型重裝鍋爐體 (Square Boiler Belly Body)
    const bellyGeo = new THREE.CylinderGeometry(0.62, 0.58, 0.38, 8);
    const belly = new THREE.Mesh(bellyGeo, mYellow);
    belly.rotation.y = Math.PI / 8;
    belly.position.set(0, -0.16, 0.00);
    this.bodyGroup.add(belly);

    // (D) 4 個垂直立角的加固黃銅角鐵條 (Brass Corner Angle Irons)
    [-0.44, 0.44].forEach((cx) => {
      [-0.32, 0.32].forEach((cz) => {
        const angleIron = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.70, 0.065), mBrass);
        angleIron.position.set(cx, -0.01, cz);
        this.bodyGroup.add(angleIron);
      });
    });

    // (E) 方形底盤座與反重力噴口 (Square Base Plate & Thrusters)
    const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.74), mYellowDark);
    basePlate.position.set(0, -0.38, 0);
    this.bodyGroup.add(basePlate);

    const nozzleGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.14, 8, 1, true);
    const nozzle = new THREE.Mesh(nozzleGeo, mBrassDark);
    nozzle.position.y = -0.47;
    this.bodyGroup.add(nozzle);

    const thrusterCoreGeo = new THREE.ConeGeometry(0.14, 0.18, 6);
    const thrusterCore = new THREE.Mesh(thrusterCoreGeo, mCyanGlow);
    thrusterCore.rotation.x = Math.PI;
    thrusterCore.position.y = -0.52;
    this.bodyGroup.add(thrusterCore);

    // ==========================================
    // 2. 方頂重工工程安全帽 (Square-Crested Victorian Mining Helmet)
    // 輪廓為八角棱面方頂鋼盔，兼具工業防護感與復古卡通呆萌感
    // ==========================================
    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 0.44, 0.01);
    this.bodyGroup.add(this.hatGroup);

    // (A) 八角棱面方拱頂盔體
    const helmetDomeGeo = new THREE.CylinderGeometry(0.36, 0.44, 0.24, 8);
    const helmetDome = new THREE.Mesh(helmetDomeGeo, mYellowHi);
    helmetDome.rotation.y = Math.PI / 8;
    helmetDome.position.y = 0.12;
    this.hatGroup.add(helmetDome);

    // 頂部方形封蓋板
    const helmetTopPlate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.54), mYellowHi);
    helmetTopPlate.position.set(0, 0.24, 0);
    this.hatGroup.add(helmetTopPlate);

    // (B) 拱形方形遮陽帽簷（前方微微上揚，絕不遮擋護目鏡，零穿模）
    const brimGeo = new THREE.BoxGeometry(0.90, 0.04, 0.20);
    const brim = new THREE.Mesh(brimGeo, mYellowHi);
    brim.position.set(0, 0.02, 0.36);
    brim.rotation.x = -0.12;
    this.hatGroup.add(brim);

    const brimRim = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.02, 0.035), mBrass);
    brimRim.position.set(0, 0.01, 0.46);
    brimRim.rotation.x = -0.12;
    this.hatGroup.add(brimRim);

    // (C) 帽身黃銅加固帶
    const rivetBand = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.05, 0.70), mBrass);
    rivetBand.position.set(0, 0.03, -0.02);
    this.hatGroup.add(rivetBand);

    // (D) 安全帽正前方：立體浮雕黃銅齒輪勳章
    const badgeGear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 8), mBrass);
    badgeGear.rotation.x = Math.PI * 0.5 - 0.15;
    badgeGear.position.set(0, 0.16, 0.42);
    this.hatGroup.add(badgeGear);

    const badgeCore = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), mCyanGlow);
    badgeCore.position.set(0, 0.165, 0.435);
    this.hatGroup.add(badgeCore);

    // (E) 帽頂中央：重型黃銅金屬護籠旋轉警示燈
    const beaconSocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), mBrass);
    beaconSocket.position.set(0, 0.28, 0);
    this.hatGroup.add(beaconSocket);

    this.beaconDome = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8), mAmberGlow);
    this.beaconDome.position.set(0, 0.37, 0);
    this.hatGroup.add(this.beaconDome);

    for (let ci = 0; ci < 4; ci++) {
      const ca = (ci * Math.PI) / 2;
      const cageBar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), mBrassDark);
      cageBar.position.set(Math.cos(ca) * 0.085, 0.37, Math.sin(ca) * 0.085);
      this.hatGroup.add(cageBar);
    }

    const cageTopRing = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.01, 4, 8), mBrass);
    cageTopRing.position.set(0, 0.44, 0);
    cageTopRing.rotation.x = Math.PI * 0.5;
    this.hatGroup.add(cageTopRing);

    // ==========================================
    // 3. 護目鏡（100% 絕對通透，無任何三角面遮擋，純淨發光藍綠鏡面）
    // 穩健鑲嵌在方正面部前方，視野極其明亮純粹
    // ==========================================
    this.faceGroup = new THREE.Group();
    this.faceGroup.position.set(0, 0.20, 0.45);
    this.bodyGroup.add(this.faceGroup);

    const goggleRadius = 0.135;
    const goggleDepth = 0.08;
    const goggleSpacing = 0.165;

    [-goggleSpacing, goggleSpacing].forEach((gx, idx) => {
      // 黃銅外框圓筒
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(goggleRadius, goggleRadius * 1.05, goggleDepth, 10),
        mBrass
      );
      rim.rotation.x = Math.PI * 0.5;
      rim.position.set(gx, 0.02, 0.05);
      this.faceGroup.add(rim);

      // 邊框滾齒輪加固圈
      const cog = new THREE.Mesh(
        new THREE.TorusGeometry(goggleRadius * 1.02, 0.015, 4, 10),
        mBrassDark
      );
      cog.position.set(gx, 0.02, 0.08);
      this.faceGroup.add(cog);

      // 【純淨發光藍綠大鏡面】
      const lens = new THREE.Mesh(new THREE.CircleGeometry(goggleRadius * 0.88, 10), mCyanGlow);
      lens.position.set(gx, 0.02, 0.092);
      this.faceGroup.add(lens);

      // 側邊皮帶
      const isLeft = idx === 0;
      const strapSide = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.26), mLeather);
      strapSide.position.set(isLeft ? gx - 0.14 : gx + 0.14, 0.02, -0.06);
      strapSide.rotation.y = isLeft ? 0.35 : -0.35;
      this.faceGroup.add(strapSide);

      // 左眼外側工匠旋轉放大鏡 (Loupe)
      if (idx === 0) {
        const loupeArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08), mBrass);
        loupeArm.position.set(gx - 0.14, 0.08, 0.06);
        loupeArm.rotation.z = 0.5;
        this.faceGroup.add(loupeArm);

        const loupeRim = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 8), mBrass);
        loupeRim.rotation.x = Math.PI * 0.5;
        loupeRim.position.set(gx - 0.18, 0.11, 0.10);
        this.faceGroup.add(loupeRim);

        const loupeLens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 8), mCyanGlow);
        loupeLens.position.set(gx - 0.18, 0.11, 0.122);
        this.faceGroup.add(loupeLens);
      }
    });

    // 護目鏡中央黃銅橋架
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.04), mBrass);
    bridge.position.set(0, 0.02, 0.07);
    this.faceGroup.add(bridge);

    // ==========================================
    // 4. 歐式卡通呆萌肉鼻 & 銀灰大翹八字鬍
    // ==========================================
    const noseGroup = new THREE.Group();
    noseGroup.position.set(0, -0.07, 0.11);
    this.faceGroup.add(noseGroup);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 6), mNose);
    nose.scale.set(1.15, 1.20, 1.25);
    noseGroup.add(nose);

    // 歐式銀灰大翹八字鬍
    const mustacheGroup = new THREE.Group();
    mustacheGroup.position.set(0, -0.17, 0.09);
    this.faceGroup.add(mustacheGroup);

    const curveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 0.03, 0.12),
      new THREE.Vector3(-0.12, 0.02, 0.13),
      new THREE.Vector3(-0.26, -0.01, 0.10),
      new THREE.Vector3(-0.40, 0.06, 0.05),
      new THREE.Vector3(-0.48, 0.18, 0.01),
      new THREE.Vector3(-0.50, 0.25, -0.02),
    ]);
    const mustacheL = new THREE.Mesh(new THREE.TubeGeometry(curveL, 6, 0.045, 5, false), mMustache);
    mustacheGroup.add(mustacheL);

    const curveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 0.03, 0.12),
      new THREE.Vector3(0.12, 0.02, 0.13),
      new THREE.Vector3(0.26, -0.01, 0.10),
      new THREE.Vector3(0.40, 0.06, 0.05),
      new THREE.Vector3(0.48, 0.18, 0.01),
      new THREE.Vector3(0.50, 0.25, -0.02),
    ]);
    const mustacheR = new THREE.Mesh(new THREE.TubeGeometry(curveR, 6, 0.045, 5, false), mMustache);
    mustacheGroup.add(mustacheR);

    // ==========================================
    // 5. 肚子中間硬派方形發光蒸氣鍋爐 (Square Boiler Firebox on Flat Belly)
    // 緊貼方型腹部平整表面（y = -0.15, z = 0.43），線條方正、高溫烈焰發光跳動！
    // ==========================================
    const boilerBellyGroup = new THREE.Group();
    boilerBellyGroup.position.set(0, -0.15, 0.43);
    this.bodyGroup.add(boilerBellyGroup);

    // (A) 方型重裝鑄鐵燃燒室爐門 (Square Cast-Iron Furnace Frame)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.05), mIron);
    doorFrame.position.set(0, 0, 0.08);
    boilerBellyGroup.add(doorFrame);

    // 爐門周圍加固邊條與鉸鏈
    const doorBorderTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.055), mBrass);
    doorBorderTop.position.set(0, 0.13, 0.08);
    boilerBellyGroup.add(doorBorderTop);

    const doorBorderBtm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.055), mBrass);
    doorBorderBtm.position.set(0, -0.13, 0.08);
    boilerBellyGroup.add(doorBorderBtm);

    const hingeL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.04), mBrassDark);
    hingeL.position.set(-0.18, 0, 0.10);
    boilerBellyGroup.add(hingeL);

    const latchArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.025), mBrass);
    latchArm.position.set(0.18, 0, 0.10);
    boilerBellyGroup.add(latchArm);

    // (B) 【核心亮點】：高溫烈焰燃燒室內部發光爐膛 (Glowing Incandescent Firebox)
    this.furnaceFlame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.02), mFurnaceGlow);
    this.furnaceFlame.position.set(0, 0, 0.098);
    boilerBellyGroup.add(this.furnaceFlame);

    for (let gi = -1.5; gi <= 1.5; gi += 1.0) {
      const grate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.22, 0.025), mIron);
      grate.position.set(gi * 0.06, 0, 0.112);
      boilerBellyGroup.add(grate);
    }

    // (C) 肚腩右上側：高壓蒸氣指針壓力錶 (Steam Pressure Dial)
    const bellyGaugeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.035, 8), mBrass);
    bellyGaugeBase.rotation.x = Math.PI * 0.5;
    bellyGaugeBase.position.set(0.27, 0.08, 0.06);
    boilerBellyGroup.add(bellyGaugeBase);

    const bellyGaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8), mat(0xfcf8ee));
    bellyGaugeFace.position.set(0.27, 0.08, 0.08);
    boilerBellyGroup.add(bellyGaugeFace);

    const bellyNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.045, 0.005), mat(0xd62828));
    bellyNeedle.position.set(0.27, 0.095, 0.083);
    bellyNeedle.rotation.z = -0.65;
    boilerBellyGroup.add(bellyNeedle);

    // (D) 肚腩左上側：輔助真空度/溫度計 (Auxiliary Vacuum/Temp Gauge)
    const bellyGauge2Base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), mBrass);
    bellyGauge2Base.rotation.x = Math.PI * 0.5;
    bellyGauge2Base.position.set(-0.27, 0.08, 0.06);
    boilerBellyGroup.add(bellyGauge2Base);

    const bellyGauge2Face = new THREE.Mesh(new THREE.CircleGeometry(0.042, 8), mat(0x18242a));
    bellyGauge2Face.position.set(-0.27, 0.08, 0.078);
    boilerBellyGroup.add(bellyGauge2Face);

    const bellyNeedle2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.005), mCyanGlow);
    bellyNeedle2.position.set(-0.27, 0.092, 0.081);
    bellyNeedle2.rotation.z = 0.8;
    boilerBellyGroup.add(bellyNeedle2);

    // 寬皮革工匠腰帶與大黃銅扣
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.08, 0.80), mLeather);
    belt.position.set(0, -0.28, 0.00);
    this.bodyGroup.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.04), mBrass);
    buckle.position.set(0, -0.28, 0.41);
    this.bodyGroup.add(buckle);

    // ==========================================
    // 6. 手臂機械邏輯優化 & 超顯眼實體工具 (Mechanically Logical Arms & Prominent Tools)
    // 清楚呈現金屬液壓推桿油缸（Piston Actuator）、關節軸承，工具尺寸加大幅度，輪廓鮮明！
    // ==========================================

    // --- (A) 主右手：液壓驅動重臂 + 【超顯眼！巨型工程活動板手】 ---
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.72, 0.14, 0.06);
    this.bodyGroup.add(this.rightArmGroup);

    // 方形肩部軸承箱 (Square Shoulder Housing)
    const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mBrass);
    this.rightArmGroup.add(shoulderR);

    // 上臂主結構骨架
    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 6), mYellow);
    upperArmR.position.set(0.08, -0.12, 0);
    upperArmR.rotation.set(0.2, 0.1, -0.62);
    this.rightArmGroup.add(upperArmR);

    // 【機械邏輯推桿】：液壓油缸外套筒 (Iron Cylinder Barrel) + 內縮鍍鉻活塞桿 (Chrome Rod)
    const pistonBarrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 6), mIron);
    pistonBarrelR.position.set(0.14, -0.04, 0.06);
    pistonBarrelR.rotation.set(0.2, 0.1, -0.65);
    this.rightArmGroup.add(pistonBarrelR);

    const pistonRodR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), mIronLight);
    pistonRodR.position.set(0.18, -0.12, 0.08);
    pistonRodR.rotation.set(0.2, 0.1, -0.65);
    this.rightArmGroup.add(pistonRodR);

    this.forearmR = new THREE.Group();
    this.forearmR.position.set(0.18, -0.24, 0.06);
    this.rightArmGroup.add(this.forearmR);

    // 肘關節齒輪關節盤
    const elbowGearR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 8), mBrassDark);
    elbowGearR.rotation.x = Math.PI * 0.5;
    this.forearmR.add(elbowGearR);

    // 前臂工裝鑄件
    const lowerArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.22, 6), mYellowDark);
    lowerArmR.position.set(0.06, -0.10, 0.10);
    lowerArmR.rotation.set(0.7, 0.3, -0.2);
    this.forearmR.add(lowerArmR);

    // 【超顯眼！巨型工程活動板手】 (Giant Heavy Adjustable Wrench)
    // 尺寸長度加大至 0.56，工裝黃色 I 型握柄 + 鑄鐵厚實開口鉗頭 + 黃銅調節蝸桿
    const wrenchGroup = new THREE.Group();
    wrenchGroup.position.set(0.16, -0.18, 0.24);
    wrenchGroup.rotation.set(0.4, 0.4, -0.6);
    this.forearmR.add(wrenchGroup);

    // 板手握柄（工裝黃色高辨識度本體）
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.032), mYellowHi);
    wrenchGroup.add(handle);

    // 柄尾懸掛圓環
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 4, 8), mIron);
    loop.position.y = -0.28;
    wrenchGroup.add(loop);

    // 鍛造鑄鐵重型鉗頭主體
    const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.04), mIron);
    headBase.position.y = 0.28;
    wrenchGroup.add(headBase);

    // 黃銅調節蝸桿 (Worm Gear)
    const wormGear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6), mBrass);
    wormGear.position.set(0, 0.23, 0.02);
    wrenchGroup.add(wormGear);

    // 兩側厚實鉗牙（強烈的工業開口幾何感）
    const jawFixed = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.038), mIron);
    jawFixed.position.set(-0.06, 0.35, 0);
    wrenchGroup.add(jawFixed);

    const jawAdjust = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.038), mIronLight);
    jawAdjust.position.set(0.06, 0.35, 0);
    wrenchGroup.add(jawAdjust);

    // --- (B) 主左手：液壓驅動重臂 + 【超顯眼！黃銅長嘴工匠注油壺】 ---
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.72, 0.14, 0.06);
    this.bodyGroup.add(this.leftArmGroup);

    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mBrass);
    this.leftArmGroup.add(shoulderL);

    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.28, 6), mYellow);
    upperArmL.position.set(-0.08, -0.12, 0);
    upperArmL.rotation.set(0.2, -0.1, 0.62);
    this.leftArmGroup.add(upperArmL);

    // 左臂液壓油缸推桿
    const pistonBarrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 6), mIron);
    pistonBarrelL.position.set(-0.14, -0.04, 0.06);
    pistonBarrelL.rotation.set(0.2, -0.1, 0.65);
    this.leftArmGroup.add(pistonBarrelL);

    const pistonRodL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 6), mIronLight);
    pistonRodL.position.set(-0.18, -0.12, 0.08);
    pistonRodL.rotation.set(0.2, -0.1, 0.65);
    this.leftArmGroup.add(pistonRodL);

    const toolClawGroup = new THREE.Group();
    toolClawGroup.position.set(-0.18, -0.24, 0.16);
    this.leftArmGroup.add(toolClawGroup);

    const clawWrist = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6), mIron);
    clawWrist.rotation.set(0.5, -0.4, 0.2);
    toolClawGroup.add(clawWrist);

    // 【超顯眼！重工黃銅長嘴工匠注油壺】 (Heavy-Duty Machine Oiler)
    // 徹底消除任何圓球藥瓶感，純粹經典機械油箱造型：金屬錐形油身、六角鎖緊螺母、頂部壓閥按柄與細長前傾紅銅油嘴
    const oilCanGroup = new THREE.Group();
    oilCanGroup.position.set(0.02, -0.06, 0.10);
    oilCanGroup.rotation.set(0.3, -0.2, 0.4);
    toolClawGroup.add(oilCanGroup);

    // 金屬錐形油壺儲油身 (Conical Machine Oiler Reservoir)
    const oilerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.088, 0.16, 8), mBrass);
    oilCanGroup.add(oilerBody);

    // 壺身中段金屬衝壓防滑滾邊加固圈
    const oilerRib = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.012, 4, 8), mBrassDark);
    oilerRib.rotation.x = Math.PI * 0.5;
    oilCanGroup.add(oilerRib);

    // 頂部黃銅六角固緊螺母領圈 (Hexagonal Collar Nut)
    const neckNut = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.03, 6), mBrassDark);
    neckNut.position.y = 0.095;
    oilCanGroup.add(neckNut);

    // 按壓式活塞頂桿與拇指壓板 (Thumb Pump Lever & Plunger)
    const pumpHousing = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.028), mIronLight);
    pumpHousing.position.set(0, 0.13, 0);
    oilCanGroup.add(pumpHousing);

    const thumbPlunger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.035), mBrass);
    thumbPlunger.position.set(-0.02, 0.16, 0);
    thumbPlunger.rotation.z = 0.3;
    oilCanGroup.add(thumbPlunger);

    // 細長優雅向前伸出的紅銅注油長嘴 (Slender Copper Machine Nozzle)
    const oilerSpout = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.28, 6), mCopper);
    oilerSpout.position.set(0.02, 0.25, 0.06);
    oilerSpout.rotation.set(0.38, 0, -0.1);
    oilCanGroup.add(oilerSpout);

    const spoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 6), mBrass);
    spoutTip.position.set(0.035, 0.38, 0.11);
    spoutTip.rotation.set(0.38, 0, -0.1);
    oilCanGroup.add(spoutTip);

    // 鍛造鑄鐵重工握持半圓手柄 (Forged Iron Loop Handle)
    const oilerHandle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.011, 4, 8, Math.PI), mIron);
    oilerHandle.position.set(-0.08, 0, 0);
    oilerHandle.rotation.z = Math.PI * 0.5;
    oilCanGroup.add(oilerHandle);

    // ==========================================
    // 7. 後背延伸重工雙吊臂 (Heavy-Duty Articulated Crane Arms)
    // 結構邏輯化：獨立回轉台、外臂液壓油缸（Pneumatic Ram）、外側銅質油路、高溫電漿火與大齒輪
    // 基座展開至 x = ±0.60，100% 幾何驗算零穿模！
    // ==========================================

    // --- (A) 右側後背：重型電漿魔導焊炬吊臂 (Arc-Welder Crane Arm) ---
    this.subArmTorchGroup = new THREE.Group();
    this.subArmTorchGroup.position.set(0.60, 0.32, -0.38);
    this.bodyGroup.add(this.subArmTorchGroup);

    const baseTurretR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), mBrass);
    this.subArmTorchGroup.add(baseTurretR);

    // 起重液壓推桿油缸 (Hydraulic Boom Actuator)
    const actuatorR = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), mIronLight);
    actuatorR.position.set(0.04, 0.10, 0.06);
    actuatorR.rotation.set(-0.5, 0, 0.2);
    this.subArmTorchGroup.add(actuatorR);

    // 第一節起重臂 (向外上方傾斜 rotation.z = -0.25，完全遠離頭盔)
    const boom1R = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.46, 0.065), mYellow);
    boom1R.position.set(0.06, 0.20, -0.04);
    boom1R.rotation.set(-0.3, 0.15, -0.25);
    this.subArmTorchGroup.add(boom1R);

    const elbowCraneR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 8), mBrassDark);
    elbowCraneR.position.set(0.12, 0.38, -0.10);
    elbowCraneR.rotation.x = Math.PI * 0.5;
    this.subArmTorchGroup.add(elbowCraneR);

    // 第二節延伸臂 (越過右肩外側上方伸向身前)
    const boom2R = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.055), mIron);
    boom2R.position.set(0.08, 0.46, 0.08);
    boom2R.rotation.set(1.15, 0.20, -0.15);
    this.subArmTorchGroup.add(boom2R);

    // 焊炬頭部
    const torchHeadGroup = new THREE.Group();
    torchHeadGroup.position.set(0.04, 0.50, 0.28);
    torchHeadGroup.rotation.set(1.3, 0.3, -0.1);
    this.subArmTorchGroup.add(torchHeadGroup);

    const nozzleCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.060, 0.12, 6), mCopper);
    torchHeadGroup.add(nozzleCyl);

    const nozzleTip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 6), mBrass);
    nozzleTip.position.y = 0.08;
    torchHeadGroup.add(nozzleTip);

    // 【超顯眼！高溫等離子電漿火焰】 (Intense Glowing Plasma Torch Flame)
    this.torchFlame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), mFlameGlow);
    this.torchFlame.position.y = 0.16;
    torchHeadGroup.add(this.torchFlame);

    // 沿臂身外側走線的高壓銅導管
    const hoseCurveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.06, 0.30, 0.06),
      new THREE.Vector3(0.12, 0.12, -0.10),
      new THREE.Vector3(-0.06, -0.08, -0.06),
    ]);
    const hoseR = new THREE.Mesh(new THREE.TubeGeometry(hoseCurveR, 6, 0.02, 4, false), mCopper);
    this.subArmTorchGroup.add(hoseR);

    // --- (B) 左側後背：重型三爪夾鉗吊臂 + 【大號黃銅機件齒輪】 ---
    this.subArmClawGroup = new THREE.Group();
    this.subArmClawGroup.position.set(-0.60, 0.32, -0.38);
    this.bodyGroup.add(this.subArmClawGroup);

    const baseTurretL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), mBrass);
    this.subArmClawGroup.add(baseTurretL);

    const actuatorL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), mIronLight);
    actuatorL.position.set(-0.04, 0.10, 0.06);
    actuatorL.rotation.set(-0.5, 0, -0.2);
    this.subArmClawGroup.add(actuatorL);

    const boom1L = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.46, 0.065), mYellow);
    boom1L.position.set(-0.06, 0.20, -0.04);
    boom1L.rotation.set(-0.3, -0.15, 0.25);
    this.subArmClawGroup.add(boom1L);

    const elbowCraneL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 8), mBrassDark);
    elbowCraneL.position.set(-0.12, 0.38, -0.10);
    elbowCraneL.rotation.x = Math.PI * 0.5;
    this.subArmClawGroup.add(elbowCraneL);

    const boom2L = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.055), mIron);
    boom2L.position.set(-0.08, 0.46, 0.08);
    boom2L.rotation.set(1.15, -0.20, 0.15);
    this.subArmClawGroup.add(boom2L);

    const chuckGroup = new THREE.Group();
    chuckGroup.position.set(-0.04, 0.50, 0.28);
    chuckGroup.rotation.set(1.3, -0.3, 0.1);
    this.subArmClawGroup.add(chuckGroup);

    const chuckBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), mBrass);
    chuckGroup.add(chuckBase);

    for (let f = 0; f < 3; f++) {
      const fa = (f * Math.PI * 2) / 3;
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.10, 0.025), mIron);
      finger.position.set(Math.cos(fa) * 0.052, 0.06, Math.sin(fa) * 0.052);
      finger.rotation.set(Math.sin(fa) * 0.4, 0, -Math.cos(fa) * 0.4);
      chuckGroup.add(finger);
    }

    // 【超顯眼！夾爪中檢測的大號黃銅工程齒輪】
    this.inspectedGear = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 10), mBrassDark);
    this.inspectedGear.position.y = 0.09;
    chuckGroup.add(this.inspectedGear);

    // ==========================================
    // 8. 硬派雙聯重型蒸氣動力背包 (Hardcore Squared Heavy-Duty Backpack)
    // 方鋼外骨骼龍骨架 + 雙聯高壓蓄壓釜 + 紅色手輪總管 + 後傾雙煙囪，100% 零穿模！
    // ==========================================
    this.backpackGroup = new THREE.Group();
    this.backpackGroup.position.set(0, 0.06, -0.44);
    this.bodyGroup.add(this.backpackGroup);

    // 左右兩根主方鋼龍骨立柱
    [-0.38, 0.38].forEach((sx) => {
      const vertPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.60, 0.06), mIron);
      vertPillar.position.set(sx, 0.02, 0);
      this.backpackGroup.add(vertPillar);

      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.045), mIron);
      brace.position.set(sx, -0.08, 0.07);
      brace.rotation.x = 0.55;
      this.backpackGroup.add(brace);
    });

    // 上中下三道方管橫梁
    const crossBeamTop = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 0.08), mIron);
    crossBeamTop.position.set(0, 0.26, 0);
    this.backpackGroup.add(crossBeamTop);

    const crossBeamMid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.06), mIron);
    crossBeamMid.position.set(0, 0.02, 0.02);
    this.backpackGroup.add(crossBeamMid);

    const crossBeamBtm = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.08, 0.08), mIron);
    crossBeamBtm.position.set(0, -0.24, 0);
    this.backpackGroup.add(crossBeamBtm);

    // 雙聯重型蒸氣耐壓蓄壓釜
    [-0.20, 0.20].forEach((tx) => {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.44, 8), mBrass);
      tank.position.set(tx, 0.01, 0.02);
      this.backpackGroup.add(tank);

      const tTop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), mBrass);
      tTop.position.set(tx, 0.23, 0.02);
      this.backpackGroup.add(tTop);

      const tBtm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mBrassDark);
      tBtm.position.set(tx, -0.21, 0.02);
      this.backpackGroup.add(tBtm);

      const tankRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.015, 4, 8), mCopper);
      tankRing.position.set(tx, 0.01, 0.02);
      tankRing.rotation.x = Math.PI * 0.5;
      this.backpackGroup.add(tankRing);

      const tankValve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 6), mCopper);
      tankValve.position.set(tx, 0.34, 0.02);
      this.backpackGroup.add(tankValve);
    });

    // 雙罐高壓平衡連通管與手輪關斷閥
    const manifoldPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.40, 6), mCopper);
    manifoldPipe.position.set(0, 0.10, 0.05);
    manifoldPipe.rotation.z = Math.PI * 0.5;
    this.backpackGroup.add(manifoldPipe);

    const valveWheel = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 4, 8), mat(0x992222));
    valveWheel.position.set(0, 0.10, 0.08);
    this.backpackGroup.add(valveWheel);

    // 中央液壓動力分配泵塊
    const pumpBlock = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.20, 0.15), mIronLight);
    pumpBlock.position.set(0, -0.08, 0.05);
    this.backpackGroup.add(pumpBlock);

    // 雙排氣煙囪系統 (向後傾斜至 z = -0.18，完全消除穿模！)
    const chimneyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 6), mCopper);
    chimneyBase.position.set(0.20, 0.40, -0.18);
    chimneyBase.rotation.set(-0.45, 0, -0.15);
    this.backpackGroup.add(chimneyBase);

    const chimneyRim = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.07, 0.08, 6), mBrass);
    chimneyRim.position.set(0.24, 0.50, -0.23);
    chimneyRim.rotation.set(-0.45, 0, -0.15);
    this.backpackGroup.add(chimneyRim);

    const bypassPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.24, 6), mIron);
    bypassPipe.position.set(-0.20, 0.40, -0.18);
    bypassPipe.rotation.set(-0.45, 0, 0.15);
    this.backpackGroup.add(bypassPipe);

    // ==========================================
    // 9. 方頭厚底重裝工程工作靴 (Chunky Square Steel-Toe Boots)
    // ==========================================
    [-0.22, 0.22].forEach((lx) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(lx, -0.46, 0.02);
      this.bodyGroup.add(legGroup);

      const hip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.12), mIron);
      legGroup.add(hip);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.16), mYellowDark);
      boot.position.set(0, -0.09, 0.04);
      legGroup.add(boot);

      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.22), mIron);
      sole.position.set(0, -0.17, 0.07);
      legGroup.add(sole);

      const steelCap = new THREE.Mesh(new THREE.BoxGeometry(0.162, 0.04, 0.08), mBrass);
      steelCap.position.set(0, -0.165, 0.14);
      legGroup.add(steelCap);
    });

    // ==========================================
    // ==========================================
    // 10. 地面雙層渾天差速神聖工程煉金法陣 (Master Gyroscopic Transmutation Circle)
    // 雙層微視差差速反轉（底層順轉、核心層逆轉），地面輔以柔和擴散光暈與垂直魔導光柱
    // ==========================================

    // (A) 地面大範圍魔導柔光光暈 (Ambient Floor Bloom Disc: 直徑 2.8m, y = 0.005)
    const bloomTex = createFloorBloomTexture();
    const bloomGeo = new THREE.PlaneGeometry(2.8, 2.8);
    const bloomMat = new THREE.MeshBasicMaterial({
      map: bloomTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.floorBloom = new THREE.Mesh(bloomGeo, bloomMat);
    this.floorBloom.rotation.x = -Math.PI * 0.5;
    this.floorBloom.position.y = 0.006;
    this.group.add(this.floorBloom);

    // (B) 底層：天文儀遊標刻度與海市符文外盤 (Outer Astrolabe Base Dial: 直徑 2.45m, y = 0.014)
    const astrolabeTex = createAstrolabeBaseTexture();
    const baseGeo = new THREE.PlaneGeometry(2.45, 2.45);
    const baseMat = new THREE.MeshBasicMaterial({
      map: astrolabeTex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.magicCircleBase = new THREE.Mesh(baseGeo, baseMat);
    this.magicCircleBase.rotation.x = -Math.PI * 0.5;
    this.magicCircleBase.position.y = 0.014;
    this.group.add(this.magicCircleBase);

    // (C) 核心層：36齒主齒圈與麥達昶神聖幾何核心 (Master Sacred Matrix Core: 直徑 1.88m, y = 0.024)
    const coreTex = createSacredCoreTexture();
    const coreGeo = new THREE.PlaneGeometry(1.88, 1.88);
    const coreMat = new THREE.MeshBasicMaterial({
      map: coreTex,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.magicCircleCore = new THREE.Mesh(coreGeo, coreMat);
    this.magicCircleCore.rotation.x = -Math.PI * 0.5;
    this.magicCircleCore.position.y = 0.024;
    this.group.add(this.magicCircleCore);

    // 相容舊引用
    this.magicCircle = this.magicCircleBase;

    // (D) 垂直鍊成魔導光柱 (Ethereal Transmutation Pillar)
    const beamGeo = new THREE.CylinderGeometry(0.40, 0.75, 1.15, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x3af5c8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lightBeam = new THREE.Mesh(beamGeo, beamMat);
    this.lightBeam.position.y = 0.58;
    this.group.add(this.lightBeam);

    // ==========================================
    // 11. 蒸氣粒子系統 (5顆重複利用，效能極高)
    // ==========================================
    this.puffs = [];
    const puffMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      flatShading: true,
    });
    const puffGeo = new THREE.IcosahedronGeometry(0.06, 0);

    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(puffGeo, puffMat.clone());
      puff.visible = false;
      puff.userData = { life: 0, maxLife: 1.5, vy: 0.4, vx: 0, vz: 0, scale: 0.1 };
      this.group.add(puff);
      this.puffs.push(puff);
    }
    this.steamTimer = 0;
    this.elapsed = 0;
  }

  // 每幀更新動畫
  update(dt = 0.016) {
    this.elapsed += dt;
    const t = this.elapsed;

    // 1. 浮空平滑上下微幅浮動
    const hoverOffset = Math.sin(t * 2.5) * 0.065;
    this.bodyGroup.position.y = 1.05 + hoverOffset;

    // 2. 懸浮時的微弱老胖敦厚搖擺
    this.bodyGroup.rotation.z = Math.sin(t * 1.6) * 0.02;
    this.bodyGroup.rotation.x = Math.sin(t * 2.0) * 0.018;

    // 3. 【雙層渾天差速反轉神聖法陣動態】
    // 外層天文儀遊標刻度盤緩慢順時針旋轉
    if (this.magicCircleBase) {
      this.magicCircleBase.rotation.z += dt * 0.10;
    }
    // 核心層 36 齒齒圈與麥達昶幾何反向逆時針旋轉，形成極致的渾天儀時空鍊成差速視覺感！
    if (this.magicCircleCore) {
      this.magicCircleCore.rotation.z -= dt * 0.18;
    }
    // 地面柔光脈動
    if (this.floorBloom && this.floorBloom.material) {
      this.floorBloom.material.opacity = 0.70 + Math.sin(t * 2.5) * 0.18;
    }

    // 4. 光柱微弱脈動
    const pulse = 0.8 + Math.sin(t * 3.5) * 0.2;
    if (this.lightBeam && this.lightBeam.material) {
      this.lightBeam.material.opacity = 0.15 * pulse;
    }

    // 5. 【肚腩爐膛燃燒烈焰動態閃爍】 (Boiler Firebox Flame Flicker)
    if (this.furnaceFlame && this.furnaceFlame.material) {
      const flamePulse = 1.0 + Math.sin(t * 14.0) * 0.28 + Math.sin(t * 23.0) * 0.16;
      this.furnaceFlame.material.emissiveIntensity = 1.4 * flamePulse;
    }

    // 6. 安全帽警示燈旋轉
    if (this.beaconDome) {
      this.beaconDome.rotation.y += dt * 8;
    }

    // 7. 主手臂工具晃動
    if (this.rightArmGroup) {
      this.rightArmGroup.rotation.x = Math.sin(t * 2.2) * 0.07;
      this.rightArmGroup.rotation.z = Math.cos(t * 1.8) * 0.03;
    }
    if (this.leftArmGroup) {
      this.leftArmGroup.rotation.x = -Math.sin(t * 1.5) * 0.04;
    }

    // 8. 【後背重型吊臂動態】
    if (this.subArmTorchGroup) {
      this.subArmTorchGroup.rotation.x = Math.sin(t * 2.8) * 0.05;
      this.subArmTorchGroup.rotation.y = Math.cos(t * 2.2) * 0.03;
    }
    if (this.torchFlame) {
      const flameFlicker = 0.85 + Math.sin(t * 18.0) * 0.25;
      this.torchFlame.scale.set(flameFlicker, flameFlicker * (0.9 + Math.random() * 0.2), flameFlicker);
    }
    if (this.subArmClawGroup) {
      this.subArmClawGroup.rotation.x = -Math.sin(t * 2.4) * 0.04;
      this.subArmClawGroup.rotation.z = Math.cos(t * 1.8) * 0.03;
    }
    if (this.inspectedGear) {
      this.inspectedGear.rotation.y += dt * 1.8;
    }

    // 9. 煙囪冒蒸氣粒子
    this.steamTimer += dt;
    if (this.steamTimer > 0.45) {
      this.steamTimer = 0;
      const freePuff = this.puffs.find((p) => !p.visible);
      if (freePuff) {
        freePuff.visible = true;
        freePuff.position.set(
          this.bodyGroup.position.x + 0.24,
          this.bodyGroup.position.y + 0.56,
          this.bodyGroup.position.z - 0.67
        );
        freePuff.scale.setScalar(0.4);
        freePuff.material.opacity = 0.65;
        freePuff.userData.life = 0;
        freePuff.userData.vy = 0.35 + Math.random() * 0.15;
        freePuff.userData.vx = (Math.random() - 0.5) * 0.08;
        freePuff.userData.vz = -0.15 - Math.random() * 0.05;
      }
    }

    for (const puff of this.puffs) {
      if (!puff.visible) continue;
      puff.userData.life += dt;
      const progress = puff.userData.life / puff.userData.maxLife;
      if (progress >= 1.0) {
        puff.visible = false;
      } else {
        puff.position.y += puff.userData.vy * dt;
        puff.position.x += puff.userData.vx * dt;
        puff.position.z += puff.userData.vz * dt;
        const curScale = 0.4 + progress * 0.8;
        puff.scale.setScalar(curScale);
        puff.material.opacity = 0.65 * (1.0 - progress);
      }
    }
  }
}
