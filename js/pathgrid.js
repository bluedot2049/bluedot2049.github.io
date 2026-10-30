// 尋路：地面切成格子跑 A*，再把折線拉直。walkable(x, z) 決定哪裡能走，格子蓋住 x0..x1、z0..z1
const CELL = 0.25;

export function makePathfinder(walkable, x0, z0, x1, z1) {
  const gx0 = x0, gz0 = z0;
  const cols = Math.ceil((x1 - x0) / CELL), rows = Math.ceil((z1 - z0) / CELL);
  const grid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) grid[r * cols + c] = walkable(gx0 + (c + 0.5) * CELL, gz0 + (r + 0.5) * CELL) ? 1 : 0;
  }
  // 比一格還窄的縫（桌尾和陽台前緣之間只有 0.23 公尺）取樣點剛好落不進去，整條走道就被當成封死。
  // 格子中心走不到、但偏 0.1 公尺的四個點有一個走得到，而且旁邊有開著的格子，也算開著（記成 2）。
  // 路線上的轉折點再換成那個走得到的點
  // 平常只走中心走得到的格子；這樣找不到路時才放寬再找一次，原本走得通的路線不會被推到邊緣
  let loose = false;
  const EDGE = 0.1, OFFS = [[EDGE, EDGE], [-EDGE, EDGE], [EDGE, -EDGE], [-EDGE, -EDGE]];
  const cellPoint = (c, r) => {
    const x = gx0 + (c + 0.5) * CELL, z = gz0 + (r + 0.5) * CELL;
    if (grid[r * cols + c] === 1) return { x, z };
    for (const [dx, dz] of OFFS) if (walkable(x + dx, z + dz)) return { x: x + dx, z: z + dz };
    return { x, z };
  };
  {
    const edge = [];
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      const k = r * cols + c;
      if (grid[k] === 0 && (grid[k - 1] === 1 || grid[k + 1] === 1 || grid[k - cols] === 1 || grid[k + cols] === 1)) edge.push(k);
    }
    for (const k of edge) {
      const c = k % cols, r = (k / cols) | 0, x = gx0 + (c + 0.5) * CELL, z = gz0 + (r + 0.5) * CELL;
      if (OFFS.some(([dx, dz]) => walkable(x + dx, z + dz))) grid[k] = 2;
    }
  }
  const cellOf = (x, zz) => [Math.floor((x - gx0) / CELL), Math.floor((zz - gz0) / CELL)];
  const open = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && (grid[r * cols + c] === 1 || (loose && grid[r * cols + c] === 2));

  function nearestOpen(x, zz) {
    const [c0, r0] = cellOf(x, zz);
    for (let rad = 0; rad <= 6; rad++) {
      let best = null, bd = Infinity;
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad || !open(c0 + dc, r0 + dr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bd) { bd = d; best = [c0 + dc, r0 + dr]; }
      }
      if (best) return best;
    }
    return null;
  }

  function lineClear(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let i = 1; i <= n; i++) if (!walkable(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
    return true;
  }

  // A* 用的陣列只配一次，每次尋路換一個戳記，不用每次清空
  const N = cols * rows, gScore = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), done = new Uint32Array(N);
  let stamp = 0;

  function findPath(sx, sz, tx, tz) {
    if (walkable(tx, tz) && lineClear(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    loose = false;
    let path = gridPath(sx, sz, tx, tz);
    if (!path) {
      loose = true;
      path = gridPath(sx, sz, tx, tz);
      loose = false;
    }
    return path;
  }

  function gridPath(sx, sz, tx, tz) {
    const s = nearestOpen(sx, sz), t = nearestOpen(tx, tz);
    if (!s || !t) return null;
    const key = (c, r) => r * cols + c, cur = ++stamp;
    const g = (k) => (seen[k] === cur ? gScore[k] : Infinity);
    const heap = [];
    const push = (k, f) => {
      heap.push([f, k]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top[1];
    };
    const h = (c, r) => Math.hypot(c - t[0], r - t[1]);
    const sk = key(s[0], s[1]), tk = key(t[0], t[1]);
    seen[sk] = cur;
    gScore[sk] = 0;
    from[sk] = -1;
    push(sk, h(s[0], s[1]));
    let found = sk === tk;
    while (heap.length) {
      const k = pop();
      if (k === tk) { found = true; break; }
      if (done[k] === cur) continue;
      done[k] = cur;
      const c = k % cols, r = (k / cols) | 0, gk = gScore[k];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!open(nc, nr)) continue;
        if (dr && dc && (!open(c + dc, r) || !open(c, r + dr))) continue;   // 不切角
        const nk = key(nc, nr), ng = gk + (dr && dc ? 1.414 : 1);
        if (ng < g(nk)) { seen[nk] = cur; gScore[nk] = ng; from[nk] = k; push(nk, ng + h(nc, nr)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = tk; k !== -1; k = from[k]) cells.push(cellPoint(k % cols, (k / cols) | 0));
    cells.reverse();
    if (walkable(tx, tz)) cells.push({ x: tx, z: tz });
    // 拉直：只在格子路線轉彎的地方試，看從上一個轉折能不能直線走過去，走不過去就把前一個彎留下來
    const turns = cells.filter((p, i) => {
      if (i === 0 || i === cells.length - 1) return true;
      const a = cells[i - 1], b = cells[i + 1];
      return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-6;
    });
    const out = [];
    let ax = sx, az = sz, prev = null;
    for (const p of turns) {
      if (prev && !lineClear(ax, az, p.x, p.z)) {
        out.push(prev);
        ax = prev.x; az = prev.z;
      }
      prev = p;
    }
    out.push(prev);
    return out;
  }

  return { findPath };
}
