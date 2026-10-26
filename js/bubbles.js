// 對話框不互相蓋住：每一幀把畫面上顯示中的對話框（訪客、海牛）由下往上排，碰到已經排好的就往上推。
// 各自的位置照舊由說話的人算（頭頂在螢幕上的點），這裡只決定要往上推多少、超出螢幕左右邊時往內收多少，推的時候 CSS 有短動畫
const GAP = 6;       // 對話框之間至少留幾像素
const TAIL = 14;     // 對話框底邊離頭頂的距離，跟 CSS 的 translate 一樣
const EDGE = 8;      // 離螢幕左右邊至少留幾像素

export function layoutBubbles() {
  const list = [];
  for (const el of document.querySelectorAll('.speech.show')) {
    if (el.style.visibility === 'hidden') continue;
    const w = el.offsetWidth, ax = parseFloat(el.style.left);
    const x = Math.min(Math.max(ax, EDGE + w / 2), window.innerWidth - EDGE - w / 2);
    list.push({ el, x, dx: Math.round(x - ax), y: parseFloat(el.style.top), w, h: el.offsetHeight });
  }
  if (!list.length) return;
  // 頭頂在畫面越下面的（通常離鏡頭越近）先排，留在原位
  list.sort((a, b) => b.y - a.y);
  const placed = [];
  for (const b of list) {
    let bottom = b.y - TAIL;
    for (let moved = true, n = 0; moved && n < 10; n++) {
      moved = false;
      for (const p of placed) {
        const side = Math.abs(b.x - p.x) < (b.w + p.w) / 2 + GAP;
        if (side && bottom > p.top - GAP && bottom - b.h < p.bottom + GAP) {
          bottom = p.top - GAP;
          moved = true;
        }
      }
    }
    placed.push({ x: b.x, w: b.w, top: bottom - b.h, bottom });
    const lift = Math.round(b.y - TAIL - bottom);
    if (b.el.dataset.lift !== String(lift)) {
      b.el.dataset.lift = lift;
      b.el.style.setProperty('--lift', lift + 'px');
    }
    if (b.el.dataset.dx !== String(b.dx)) {
      b.el.dataset.dx = b.dx;
      b.el.style.setProperty('--dx', b.dx + 'px');
    }
  }
}
