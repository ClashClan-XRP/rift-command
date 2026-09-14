import type { FormationKind, Unit, UnitType, Vec } from "./types";

const RANK: Record<UnitType, number> = {
  armor: 0,
  infantry: 1,
  worker: 2,
  siege: 3,
  ranger: 4,
  fighter: 4,
};

export const FORMATIONS: FormationKind[] = ["box", "line", "wedge", "column"];

export function formationSpacing(units: { radius: number }[]) {
  const avg = units.reduce((s, u) => s + u.radius, 0) / Math.max(1, units.length);
  return Math.max(34, avg * 2.6 + 14);
}

/** Local offsets: +y is forward (toward the destination), +x is right. */
export function formationOffsets(n: number, kind: FormationKind, spacing: number): Vec[] {
  if (n <= 1) return [{ x: 0, y: 0 }];
  if (kind === "line") return lineOffsets(n, spacing);
  if (kind === "column") return columnOffsets(n, spacing);
  if (kind === "wedge") return wedgeOffsets(n, spacing);
  return boxOffsets(n, spacing);
}

function boxOffsets(n: number, s: number): Vec[] {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    out.push({
      x: (col - (cols - 1) / 2) * s,
      y: ((rows - 1) / 2 - row) * s,
    });
  }
  return out;
}

function lineOffsets(n: number, s: number): Vec[] {
  const front = n <= 5 ? n : Math.ceil(n * 0.55);
  const back = n - front;
  const out: Vec[] = [];
  for (let i = 0; i < front; i++) {
    out.push({ x: (i - (front - 1) / 2) * s, y: back ? s * 0.45 : 0 });
  }
  for (let i = 0; i < back; i++) {
    out.push({ x: (i - (back - 1) / 2) * s, y: -s * 0.45 });
  }
  return out;
}

function columnOffsets(n: number, s: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, y: ((n - 1) / 2 - i) * s });
  return out;
}

function wedgeOffsets(n: number, s: number): Vec[] {
  const out: Vec[] = [];
  let placed = 0;
  let row = 0;
  while (placed < n) {
    const width = row + 1;
    const take = Math.min(width, n - placed);
    for (let i = 0; i < take; i++) {
      out.push({
        x: (i - (take - 1) / 2) * s,
        y: -row * s * 0.85,
      });
    }
    placed += take;
    row++;
  }
  const midY = out.reduce((a, p) => a + p.y, 0) / n;
  for (const p of out) p.y -= midY;
  return out;
}

export function slotWorld(local: Vec, origin: Vec, facing: number): Vec {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return {
    x: origin.x + c * local.y - s * local.x,
    y: origin.y + s * local.y + c * local.x,
  };
}

export function groupFacing(units: { x: number; y: number }[], dest: Vec) {
  const cx = units.reduce((s, u) => s + u.x, 0) / Math.max(1, units.length);
  const cy = units.reduce((s, u) => s + u.y, 0) / Math.max(1, units.length);
  return Math.atan2(dest.y - cy, dest.x - cx);
}

export function assignFormation(
  units: Unit[],
  dest: Vec,
  kind: FormationKind,
  facing?: number,
): { id: number; x: number; y: number; ox: number; oy: number; facing: number }[] {
  if (!units.length) return [];
  const face = facing ?? groupFacing(units, dest);
  const spacing = formationSpacing(units);
  const locals = formationOffsets(units.length, kind, spacing);
  const rankedLocals = [...locals].sort((a, b) => b.y - a.y || a.x - b.x);
  const rankedUnits = [...units].sort((a, b) => RANK[a.type] - RANK[b.type] || a.id - b.id);
  const used = new Set<number>();
  const out: { id: number; x: number; y: number; ox: number; oy: number; facing: number }[] = [];
  for (const u of rankedUnits) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < rankedLocals.length; i++) {
      if (used.has(i)) continue;
      const w = slotWorld(rankedLocals[i], dest, face);
      const d = (w.x - u.x) ** 2 + (w.y - u.y) ** 2;
      const prefer = rankedLocals[i].y * 40;
      if (d - prefer < bestD) {
        bestD = d - prefer;
        best = i;
      }
    }
    if (best < 0) best = 0;
    used.add(best);
    const local = rankedLocals[best];
    const w = slotWorld(local, dest, face);
    out.push({ id: u.id, x: w.x, y: w.y, ox: local.x, oy: local.y, facing: face });
  }
  return out;
}
