// 所有材質都在瀏覽器裡用 canvas 畫出來，不需要額外下載圖檔。
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function addNoise(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

function toTexture(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// 牆面：上半部灰泥，下半部直條木護牆板。貼圖對應 4m 寬、整面牆高。
export function wallTexture(base, wallHeight) {
  const W = 512, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(base, 0.82));
  g.addColorStop(0.5, shade(base, 1.0));
  g.addColorStop(1, shade(base, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 灰泥的斑駁
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * 0.06;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,240,220,${a})` : `rgba(60,40,20,${a})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H * 0.7, Math.random() * 40 + 10, 0, Math.PI * 2);
    ctx.fill();
  }

  const wainscot = Math.round(H * (0.95 / wallHeight));
  const top = H - wainscot;
  ctx.fillStyle = '#6b4329';
  ctx.fillRect(0, top, W, wainscot);
  for (let x = 0; x < W; x += 32) {
    ctx.fillStyle = shade('#6b4329', 0.85 + Math.random() * 0.3);
    ctx.fillRect(x + 2, top + 6, 28, wainscot - 14);
  }
  ctx.fillStyle = '#4a2d1b';
  ctx.fillRect(0, top - 6, W, 10);
  ctx.fillStyle = '#3a2214';
  ctx.fillRect(0, H - 12, W, 12);

  addNoise(ctx, W, H, 12);
  return toTexture(c);
}

// 木地板：沿 z 方向的長條木板。每張貼圖 2m x 2m。
export function floorTexture() {
  const W = 512, H = 512, rows = 8, s = W / rows;
  const [c, ctx] = makeCanvas(W, H);
  const tones = ['#7a4e2f', '#86573a', '#6e4428', '#8f6040', '#744a2c'];
  for (let col = 0; col < rows; col++) {
    let y = -Math.random() * H;
    while (y < H) {
      const len = 160 + Math.random() * 260;
      ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
      ctx.fillRect(col * s, y, s, len);
      // 木紋
      ctx.strokeStyle = 'rgba(40,22,10,0.18)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const x = col * s + 6 + Math.random() * (s - 12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 4, y + len * 0.3, x - 4, y + len * 0.6, x + 2, y + len);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,16,8,0.6)';
      ctx.fillRect(col * s, y, s, 2);
      y += len;
    }
    ctx.fillStyle = 'rgba(30,16,8,0.55)';
    ctx.fillRect(col * s, 0, 2, H);
  }
  addNoise(ctx, W, H, 14);
  return toTexture(c);
}

// 煉成陣的線稿，地毯中央會用到
function drawSigil(ctx, cx, cy, R, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const ring = (r, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); };
  const poly = (r, sides, rot, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  const u = R / 500;
  ring(500 * u, 6 * u); ring(460 * u, 3 * u); ring(320 * u, 4 * u); ring(140 * u, 3 * u);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 460 * u, cy + Math.sin(a) * 460 * u);
    ctx.lineTo(cx + Math.cos(a) * (i % 4 ? 440 : 410) * u, cy + Math.sin(a) * (i % 4 ? 440 : 410) * u);
    ctx.stroke();
  }
  poly(460 * u, 3, -Math.PI / 2, 4 * u);
  poly(460 * u, 3, Math.PI / 2, 4 * u);
  poly(320 * u, 4, Math.PI / 4, 3 * u);
  ring(60 * u, 3 * u);
  ctx.restore();
}

// 地毯：邊框花紋加中央煉成陣
export function rugTexture(base, accent, round = false) {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  if (round) {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = accent;
  if (round) {
    for (const [r, w] of [[240, 10], [222, 3], [200, 6]]) {
      ctx.lineWidth = w; ctx.beginPath(); ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    for (const [m, w] of [[14, 10], [34, 3], [50, 6]]) {
      ctx.lineWidth = w; ctx.strokeRect(m, m, S - m * 2, S - m * 2);
    }
    // 邊框的菱形
    ctx.fillStyle = accent;
    for (let i = 70; i < S - 60; i += 28) {
      for (const [x, y] of [[i, 24], [i, S - 24], [24, i], [S - 24, i]]) {
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.fill();
      }
    }
  }
  drawSigil(ctx, S / 2, S / 2, round ? 170 : 160, accent);
  addNoise(ctx, S, S, 30);
  return toTexture(c, false);
}

export function glowTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, false);
}

// 家具和角色腳下的影子
export function shadowTexture() {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(20,10,4,0.55)');
  g.addColorStop(0.6, 'rgba(20,10,4,0.3)');
  g.addColorStop(1, 'rgba(20,10,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, false);
}

// 從窗戶斜射進來的光束，上亮下淡
export function beamTexture() {
  const W = 64, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,214,150,0.55)');
  g.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const side = ctx.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.2, 'rgba(0,0,0,0)');
  side.addColorStop(0.8, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, W, H);
  return toTexture(c, false);
}

// 畫作下方的小名牌
export function plaqueTexture(title, line2) {
  const W = 512, H = 160;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#efe2c4';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = '#2a1a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = '"Noto Serif TC","Songti TC","PMingLiU",serif';
  ctx.font = `600 46px ${font}`;
  ctx.fillText(title, W / 2, 62, W - 40);
  ctx.fillStyle = '#6a5440';
  ctx.font = `30px ${font}`;
  ctx.fillText(line2, W / 2, 116, W - 40);
  return toTexture(c, false);
}
