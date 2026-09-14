import { CELL } from "./config";
import type { GameMap, MapId, ResourceNode, SpawnZone } from "./types";
import { TILE_GROUND, TILE_HIGH, TILE_RAMP, TILE_SPAWN, TILE_VOID } from "./types";

export const MAP_META: {
  id: MapId;
  name: string;
  blurb: string;
  maxPlayers: number;
  size: number;
  thumb: string;
}[] = [
  {
    id: "bastion",
    name: "Bastion Ridge",
    blurb: "Two alcoves, one long valley. Each spawn sits behind a stone choke.",
    maxPlayers: 2,
    size: 68,
    thumb: "/game/maps/bastion.jpg",
  },
  {
    id: "crucible",
    name: "Iron Crucible",
    blurb: "Four corner holds around a raised plate. No instant cross-map hit.",
    maxPlayers: 4,
    size: 84,
    thumb: "/game/maps/crucible.jpg",
  },
  {
    id: "hexgate",
    name: "Hex Gate",
    blurb: "Six gated holds around a hexagonal basin. Built for a full room.",
    maxPlayers: 6,
    size: 96,
    thumb: "/game/maps/hexgate.jpg",
  },
];

function idx(x: number, y: number, w: number) {
  return y * w + x;
}

function inb(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function fillRect(
  tiles: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v: number,
) {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(w - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(h - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) tiles[idx(x, y, w)] = v;
  }
}

function carveAlcove(
  tiles: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  half = 7,
): SpawnZone {
  const cells: number[] = [];
  for (let y = cy - half - 1; y <= cy + half + 1; y++) {
    for (let x = cx - half - 1; x <= cx + half + 1; x++) {
      if (!inb(x, y, w, h)) continue;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (dx <= half && dy <= half) {
        tiles[idx(x, y, w)] = TILE_SPAWN;
        cells.push(idx(x, y, w));
      } else if (dx <= half + 1 && dy <= half + 1) {
        tiles[idx(x, y, w)] = TILE_VOID;
      }
    }
  }

  const vx = tx - cx;
  const vy = ty - cy;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const px = -uy;
  const py = ux;
  let chokeX = cx;
  let chokeY = cy;
  for (let step = half - 1; step <= half + 5; step++) {
    const bx = Math.round(cx + ux * step);
    const by = Math.round(cy + uy * step);
    for (let k = -1; k <= 1; k++) {
      const x = Math.round(bx + px * k);
      const y = Math.round(by + py * k);
      if (!inb(x, y, w, h)) continue;
      tiles[idx(x, y, w)] = step <= half ? TILE_SPAWN : TILE_GROUND;
      cells.push(idx(x, y, w));
    }
    chokeX = bx;
    chokeY = by;
  }

  return {
    x: cx,
    y: cy,
    cx: (cx + 0.5) * CELL,
    cy: (cy + 0.5) * CELL,
    cells: [...new Set(cells)],
    chokeX,
    chokeY,
  };
}

function addNode(
  nodes: ResourceNode[],
  tiles: Uint8Array,
  w: number,
  h: number,
  gx: number,
  gy: number,
  kind: 1 | 2,
) {
  if (!inb(gx, gy, w, h)) return;
  if (tiles[idx(gx, gy, w)] === TILE_VOID) return;
  nodes.push({
    id: nodes.length + 1,
    kind,
    x: (gx + 0.5) * CELL,
    y: (gy + 0.5) * CELL,
    gx,
    gy,
  });
}

export function buildMap(id: MapId): { map: GameMap; nodes: ResourceNode[] } {
  const meta = MAP_META.find((m) => m.id === id) ?? MAP_META[0];
  const w = meta.size;
  const h = meta.size;
  const tiles = new Uint8Array(w * h);
  const occ = new Int16Array(w * h);
  const nodes: ResourceNode[] = [];

  fillRect(tiles, w, h, 3, 3, w - 4, h - 4, TILE_GROUND);

  const mid = (w / 2) | 0;
  const plateau = Math.max(8, (w * 0.14) | 0);
  for (let y = mid - plateau; y <= mid + plateau; y++) {
    for (let x = mid - plateau; x <= mid + plateau; x++) {
      if (!inb(x, y, w, h)) continue;
      const dx = x - mid;
      const dy = y - mid;
      if (dx * dx + dy * dy <= plateau * plateau) tiles[idx(x, y, w)] = TILE_HIGH;
    }
  }
  const rampR = plateau + 1;
  for (const [rx, ry] of [
    [mid, mid - rampR],
    [mid, mid + rampR],
    [mid - rampR, mid],
    [mid + rampR, mid],
  ]) {
    fillRect(tiles, w, h, rx - 1, ry - 1, rx + 1, ry + 1, TILE_RAMP);
  }

  const spawns: SpawnZone[] = [];
  const n = meta.maxPlayers;
  const radius = w * 0.36;
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cx = Math.round(mid + Math.cos(angle) * radius);
    const cy = Math.round(mid + Math.sin(angle) * radius);
    const spawn = carveAlcove(tiles, w, h, cx, cy, mid, mid);
    spawns.push(spawn);

    const backx = Math.round(cx - Math.cos(angle) * 4);
    const backy = Math.round(cy - Math.sin(angle) * 4);
    const sideA = Math.round(cx - Math.sin(angle) * 3);
    const sideB = Math.round(cy + Math.cos(angle) * 3);
    addNode(nodes, tiles, w, h, backx, backy, 1);
    addNode(nodes, tiles, w, h, backx + 2, backy, 1);
    addNode(nodes, tiles, w, h, backx, backy + 2, 1);
    addNode(nodes, tiles, w, h, backx - 2, backy, 1);
    addNode(nodes, tiles, w, h, sideA, sideB, 1);
    addNode(nodes, tiles, w, h, spawn.chokeX - Math.round(Math.cos(angle) * 2), spawn.chokeY - Math.round(Math.sin(angle) * 2), 2);
  }

  addNode(nodes, tiles, w, h, mid - 6, mid, 1);
  addNode(nodes, tiles, w, h, mid + 6, mid, 1);
  addNode(nodes, tiles, w, h, mid, mid - 6, 2);
  addNode(nodes, tiles, w, h, mid, mid + 6, 2);

  if (n >= 4) {
    addNode(nodes, tiles, w, h, mid - 10, mid - 10, 1);
    addNode(nodes, tiles, w, h, mid + 10, mid + 10, 1);
  }

  return {
    map: {
      id: meta.id,
      name: meta.name,
      blurb: meta.blurb,
      maxPlayers: meta.maxPlayers,
      w,
      h,
      cell: CELL,
      tiles,
      occ,
      spawns,
      thumb: meta.thumb,
    },
    nodes,
  };
}

export function tileAt(map: GameMap, x: number, y: number): number {
  const gx = (x / map.cell) | 0;
  const gy = (y / map.cell) | 0;
  if (gx < 0 || gy < 0 || gx >= map.w || gy >= map.h) return TILE_VOID;
  return map.tiles[gy * map.w + gx];
}

export function worldSize(map: GameMap) {
  return { w: map.w * map.cell, h: map.h * map.cell };
}
