// 明信片：在海市的信差站拍的照片，外面加一圈紙邊，右上角貼郵票、蓋郵戳，下面寫寄自哪裡和日期。
// 輸入攝影模式拍好的畫布，回傳一張新的畫布
const PAPER = '#f2ead8', INK = 'rgba(52, 36, 28, 0.62)', BROWN = '#4a3022';

function stampArt(g, x, y, s) {
  // 郵票：齒孔邊、夜色裡一輪月亮和三盞燈籠，底下寫海市
  g.save();
  g.translate(x, y);
  g.rotate(-0.06);
  g.fillStyle = '#fbf6ea';
  g.fillRect(-s / 2, -s * 0.6, s, s * 1.2);
  const r = s * 0.035;
  g.fillStyle = PAPER;
  for (let i = 0; i <= 12; i++) {
    const t = -s / 2 + (s * i) / 12;
    for (const yy of [-s * 0.6, s * 0.6]) { g.beginPath(); g.arc(t, yy, r, 0, Math.PI * 2); g.fill(); }
  }
  for (let i = 0; i <= 14; i++) {
    const t = -s * 0.6 + (s * 1.2 * i) / 14;
    for (const xx of [-s / 2, s / 2]) { g.beginPath(); g.arc(xx, t, r, 0, Math.PI * 2); g.fill(); }
  }
  const ix = -s * 0.42, iy = -s * 0.52, iw = s * 0.84, ih = s * 0.84;
  const sky = g.createLinearGradient(0, iy, 0, iy + ih);
  sky.addColorStop(0, '#1c2048');
  sky.addColorStop(1, '#5a4a7a');
  g.fillStyle = sky;
  g.fillRect(ix, iy, iw, ih);
  g.fillStyle = '#fff4dc';
  g.beginPath();
  g.arc(ix + iw * 0.72, iy + ih * 0.28, s * 0.1, 0, Math.PI * 2);
  g.fill();
  // 山的剪影
  g.fillStyle = '#2a2a40';
  g.beginPath();
  g.moveTo(ix, iy + ih);
  g.lineTo(ix + iw * 0.18, iy + ih * 0.62);
  g.lineTo(ix + iw * 0.42, iy + ih * 0.48);
  g.lineTo(ix + iw * 0.7, iy + ih * 0.66);
  g.lineTo(ix + iw, iy + ih * 0.58);
  g.lineTo(ix + iw, iy + ih);
  g.fill();
  g.fillStyle = '#ff7a4a';
  for (const [u, v] of [[0.3, 0.72], [0.45, 0.62], [0.6, 0.76]]) { g.beginPath(); g.arc(ix + iw * u, iy + ih * v, s * 0.035, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = BROWN;
  g.font = `600 ${Math.round(s * 0.16)}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('海市', 0, s * 0.45);
  g.restore();
}

function postmark(g, x, y, r, date) {
  // 郵戳：一個圓圈，上面寫海市、下面寫日期，左邊拖幾道波浪線
  g.save();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = Math.max(2, r * 0.05);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.78, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(r * 0.36)}px serif`;
  g.fillText('海市', x, y - r * 0.2);
  g.font = `${Math.round(r * 0.2)}px "Cormorant Garamond", serif`;
  g.fillText(date, x, y + r * 0.3);
  for (let i = 0; i < 4; i++) {
    const yy = y - r * 0.45 + i * r * 0.3;
    g.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const xx = x - r * 1.15 - t * r * 2.6;
      g[t ? 'lineTo' : 'moveTo'](xx, yy + Math.sin(t * Math.PI * 4) * r * 0.08);
    }
    g.stroke();
  }
  g.restore();
}

export function makePostcard(photo, date = new Date()) {
  const pw = photo.width, ph = photo.height, long = Math.max(pw, ph);
  const m = Math.round(long * 0.045), foot = Math.round(long * 0.1);
  const c = document.createElement('canvas');
  c.width = pw + m * 2;
  c.height = ph + m + foot;
  const g = c.getContext('2d');
  g.fillStyle = PAPER;
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(photo, m, m);
  g.strokeStyle = 'rgba(120, 96, 64, 0.35)';
  g.lineWidth = Math.max(1, long * 0.0015);
  g.strokeRect(m - long * 0.004, m - long * 0.004, pw + long * 0.008, ph + long * 0.008);

  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const base = m + ph + foot * 0.55;
  g.fillStyle = BROWN;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `600 ${Math.round(foot * 0.34)}px serif`;
  g.fillText('寄自海市', m, base);
  const w = g.measureText('寄自海市').width;
  g.font = `italic ${Math.round(foot * 0.26)}px "Cormorant Garamond", serif`;
  g.fillStyle = 'rgba(74, 48, 34, 0.7)';
  g.fillText('Fata Morgana', m + w + foot * 0.3, base + foot * 0.02);
  g.textAlign = 'right';
  g.fillText(d, m + pw, base + foot * 0.02);

  const s = Math.round(Math.min(pw, ph) * 0.17);
  stampArt(g, m + pw - s * 0.62, m + s * 0.72, s);
  postmark(g, m + pw - s * 1.5, m + s * 1.45, s * 0.48, d);
  return c;
}
