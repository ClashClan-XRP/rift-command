const INF = 0x3fffffff;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [10, 10, 10, 10, 14, 14, 14, 14];

class MinHeap {
  k: number[] = [];
  v: number[] = [];
  n = 0;

  clear() {
    this.n = 0;
  }

  push(key: number, val: number) {
    let i = this.n++;
    const k = this.k;
    const v = this.v;
    k[i] = key;
    v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      const tk = k[i];
      k[i] = k[p];
      k[p] = tk;
      const tv = v[i];
      v[i] = v[p];
      v[p] = tv;
      i = p;
    }
  }

  pop(): number {
    const k = this.k;
    const v = this.v;
    const out = v[0];
    const last = --this.n;
    if (last > 0) {
      k[0] = k[last];
      v[0] = v[last];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= last) break;
        let m = l;
        const r = l + 1;
        if (r < last && k[r] < k[l]) m = r;
        if (k[i] <= k[m]) break;
        const tk = k[i];
        k[i] = k[m];
        k[m] = tk;
        const tv = v[i];
        v[i] = v[m];
        v[m] = tv;
        i = m;
      }
    }
    return out;
  }
}

const heap = new MinHeap();
let genStamp = 1;
let seen: Int32Array | null = null;
let gScore: Int32Array | null = null;
let parent: Int32Array | null = null;
let walkBuf: Uint8Array | null = null;
let dimW = 0;
let dimH = 0;

function ensure(w: number, h: number) {
  const n = w * h;
  if (!seen || seen.length < n) {
    seen = new Int32Array(n);
    gScore = new Int32Array(n);
    parent = new Int32Array(n);
  }
  dimW = w;
  dimH = h;
}

export function astar(
  walk: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  out: { x: number; y: number }[],
  cell = 32,
): boolean {
  out.length = 0;
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= w || gx >= w || sy >= h || gy >= h) {
    return false;
  }
  const s = sy * w + sx;
  const t = gy * w + gx;
  if (!walk[s] || !walk[t]) return false;
  if (s === t) {
    out.push({ x: (gx + 0.5) * cell, y: (gy + 0.5) * cell });
    return true;
  }
  ensure(w, h);
  const stamp = ++genStamp;
  if (stamp > 2_000_000_000) {
    seen!.fill(0);
    genStamp = 1;
  }
  heap.clear();
  gScore![s] = 0;
  seen![s] = stamp;
  parent![s] = -1;
  heap.push(0, s);
  let found = false;
  let expanded = 0;
  const limit = w * h * 4;
  while (heap.n && expanded < limit) {
    const cur = heap.pop();
    if (cur === t) {
      found = true;
      break;
    }
    const cg = gScore![cur];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    expanded++;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (d >= 4 && (!walk[cy * w + nx] || !walk[ny * w + cx])) continue;
      const ni = ny * w + nx;
      if (!walk[ni]) continue;
      const ng = cg + COST[d];
      if (seen![ni] !== stamp || ng < gScore![ni]) {
        seen![ni] = stamp;
        gScore![ni] = ng;
        parent![ni] = cur;
        const hcost = (Math.abs(nx - gx) + Math.abs(ny - gy)) * 10;
        heap.push(ng + hcost, ni);
      }
    }
  }
  if (!found) return false;
  const cells: number[] = [];
  for (let c = t; c >= 0; c = parent![c]) cells.push(c);
  cells.reverse();
  let px = -999;
  let py = -999;
  for (const c of cells) {
    const x = (c % w) + 0.5;
    const y = ((c / w) | 0) + 0.5;
    if (x === px && y === py) continue;
    out.push({ x: x * cell, y: y * cell });
    px = x;
    py = y;
  }
  return out.length > 0;
}

export function nearestWalkable(
  walk: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): [number, number] {
  x = Math.max(0, Math.min(w - 1, x | 0));
  y = Math.max(0, Math.min(h - 1, y | 0));
  if (walk[y * w + x]) return [x, y];
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (walk[ny * w + nx]) return [nx, ny];
      }
    }
  }
  return [x, y];
}

export function makeWalkMask(
  tiles: Uint8Array,
  occ: Int16Array,
  w: number,
  h: number,
  air: boolean,
  blocked?: Set<number>,
): Uint8Array {
  const n = w * h;
  if (!walkBuf || walkBuf.length < n) walkBuf = new Uint8Array(n);
  const out = walkBuf;
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (t === 0) {
      out[i] = 0;
      continue;
    }
    if (!air && occ[i] < 0) {
      out[i] = 0;
      continue;
    }
    if (blocked && blocked.has(i)) {
      out[i] = 0;
      continue;
    }
    out[i] = 1;
  }
  return out;
}
