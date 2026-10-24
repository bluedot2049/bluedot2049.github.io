// 手機右下角的虛擬搖桿。回傳 -1 ~ 1 的 x、y（往上推是 y 負值）。
export function bindJoystick(base, knob, onChange) {
  let id = null, cx = 0, cy = 0, R = 1;

  const move = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onChange(dx / R, dy / R);
  };
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transform = '';
    base.classList.remove('active');
    onChange(0, 0);
  };

  base.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    e.preventDefault();
    id = e.pointerId;
    base.setPointerCapture(id);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    R = r.width / 2 - 10;
    base.classList.add('active');
    move(e);
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}
