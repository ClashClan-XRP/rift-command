import { BUILDING_SPRITE, CELL, TEAM_COLORS, UNIT_SPRITE, assetUrl } from "./config";
import type { World } from "./sim";
import { TILE_GROUND, TILE_HIGH, TILE_RAMP, TILE_SPAWN, TILE_VOID } from "./types";
import type { BuildingType, UnitType } from "./types";

export interface Cam {
  x: number;
  y: number;
  z: number;
}

const images = new Map<string, HTMLImageElement>();
let groundPat: CanvasPattern | null = null;
let highPat: CanvasPattern | null = null;
let riftPat: CanvasPattern | null = null;
let ready = false;

export function loadArt(): Promise<void> {
  if (ready) return Promise.resolve();
  const urls = [
    assetUrl("game/tiles/ground.jpg"),
    assetUrl("game/tiles/high.jpg"),
    assetUrl("game/tiles/rift.jpg"),
    ...Object.values(UNIT_SPRITE),
    ...Object.values(BUILDING_SPRITE),
    assetUrl("game/sprites/ore.png"),
    assetUrl("game/sprites/ore2.png"),
    assetUrl("game/sprites/flux.png"),
    assetUrl("game/sprites/flux2.png"),
  ];
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            images.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => {
    ready = true;
  });
}

function img(src: string) {
  return images.get(src) ?? null;
}

function pattern(ctx: CanvasRenderingContext2D, src: string, scale: number) {
  const im = img(src);
  if (!im) return null;
  const off = document.createElement("canvas");
  off.width = Math.max(32, (im.width * scale) | 0);
  off.height = Math.max(32, (im.height * scale) | 0);
  const o = off.getContext("2d")!;
  o.drawImage(im, 0, 0, off.width, off.height);
  return ctx.createPattern(off, "repeat");
}

export function screenToWorld(cam: Cam, sx: number, sy: number, vw: number, vh: number) {
  return {
    x: cam.x + (sx - vw / 2) / cam.z,
    y: cam.y + (sy - vh / 2) / cam.z,
  };
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Cam,
  vw: number,
  vh: number,
  alpha: number,
  selUnits: Set<number>,
  selBuildings: Set<number>,
  ghost: { gx: number; gy: number; w: number; h: number; ok: boolean; held?: boolean } | null,
  localOwner: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const dpr = ctx.canvas.width / Math.max(1, vw);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!groundPat) groundPat = pattern(ctx, assetUrl("game/tiles/ground.jpg"), 0.18);
  if (!highPat) highPat = pattern(ctx, assetUrl("game/tiles/high.jpg"), 0.18);
  if (!riftPat) riftPat = pattern(ctx, assetUrl("game/tiles/rift.jpg"), 0.22);

  ctx.fillStyle = "#07080b";
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);

  const map = world.map;
  const viewL = cam.x - vw / 2 / cam.z;
  const viewT = cam.y - vh / 2 / cam.z;
  const viewR = cam.x + vw / 2 / cam.z;
  const viewB = cam.y + vh / 2 / cam.z;
  const gx0 = Math.max(0, (viewL / CELL) | 0);
  const gy0 = Math.max(0, (viewT / CELL) | 0);
  const gx1 = Math.min(map.w - 1, (viewR / CELL + 1) | 0);
  const gy1 = Math.min(map.h - 1, (viewB / CELL + 1) | 0);

  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const t = map.tiles[gy * map.w + gx];
      const x = gx * CELL;
      const y = gy * CELL;
      if (t === TILE_VOID) ctx.fillStyle = riftPat ?? "#05060a";
      else if (t === TILE_HIGH) ctx.fillStyle = highPat ?? "#1a1c22";
      else if (t === TILE_RAMP) ctx.fillStyle = "#2a2d34";
      else if (t === TILE_SPAWN) ctx.fillStyle = groundPat ?? "#16181e";
      else if (t === TILE_GROUND) ctx.fillStyle = groundPat ?? "#12141a";
      else ctx.fillStyle = "#101218";
      ctx.fillRect(x, y, CELL + 0.5, CELL + 0.5);
    }
  }

  if (world.shield > 0) {
    ctx.save();
    ctx.globalAlpha = 0.22 + Math.sin(world.time * 3) * 0.05;
    for (let i = 0; i < world.players.length; i++) {
      const spawn = map.spawns[i];
      if (!spawn) continue;
      ctx.strokeStyle = TEAM_COLORS[i % TEAM_COLORS.length];
      ctx.lineWidth = 3;
      let minx = Infinity,
        miny = Infinity,
        maxx = -Infinity,
        maxy = -Infinity;
      for (const c of spawn.cells) {
        const x = (c % map.w) * CELL;
        const y = ((c / map.w) | 0) * CELL;
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
      ctx.strokeRect(minx, miny, maxx - minx + CELL, maxy - miny + CELL);
    }
    ctx.restore();
  }

  const mining = new Set<number>();
  for (const u of world.units) {
    if (selUnits.has(u.id) && u.nodeId > 0) mining.add(u.nodeId);
  }
  const workersPicked = [...selUnits].some((id) => {
    const u = world.units.find((x) => x.id === id);
    return u?.type === "worker";
  });

  for (const n of world.nodes) {
    if (n.x < viewL - 40 || n.y < viewT - 40 || n.x > viewR + 40 || n.y > viewB + 40) continue;
    const src =
      n.kind === 1
        ? n.id % 2 === 0
          ? assetUrl("game/sprites/ore.png")
          : assetUrl("game/sprites/ore2.png")
        : n.id % 2 === 0
          ? assetUrl("game/sprites/flux.png")
          : assetUrl("game/sprites/flux2.png");
    const im = img(src);
    const s = n.kind === 1 ? 42 : 40;
    if (workersPicked || mining.has(n.id)) {
      ctx.strokeStyle = mining.has(n.id) ? "rgba(110,196,188,0.95)" : "rgba(212,216,224,0.7)";
      ctx.lineWidth = mining.has(n.id) ? 3 : 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (im) ctx.drawImage(im, n.x - s / 2, n.y - s / 2, s, s);
    else {
      ctx.fillStyle = n.kind === 1 ? "#9bb4c8" : "#6ec4bc";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (workersPicked && !mining.has(n.id) && world.time < 24) {
      ctx.font = "700 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(9,9,11,0.75)";
      ctx.fillRect(n.x - 22, n.y - 36, 44, 14);
      ctx.fillStyle = "#f4f4f5";
      ctx.fillText(n.kind === 1 ? "MINE" : "FLUX", n.x, n.y - 25);
    }
  }

  for (const b of world.buildings) {
    if (b.x < viewL - 80 || b.y < viewT - 80 || b.x > viewR + 80 || b.y > viewB + 80) continue;
    drawBuilding(ctx, b.type, b.x, b.y, b.w, b.h, b.owner, b.progress, selBuildings.has(b.id));
    if (b.progress < 1) {
      bar(ctx, b.x, b.y - b.h * CELL * 0.55, b.progress, b.w * CELL * 0.8);
      ctx.fillStyle = "#f4f4f5";
      ctx.font = "700 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${(b.progress * 100) | 0}%`, b.x, b.y - b.h * CELL * 0.55 - 6);
    } else if (b.hp < b.maxHp || selBuildings.has(b.id)) {
      bar(ctx, b.x, b.y - b.h * CELL * 0.55, b.hp / b.maxHp, b.w * CELL * 0.8);
    }
    if (b.queue.length && b.owner === localOwner) {
      ctx.fillStyle = "rgba(197,205,216,0.85)";
      ctx.font = "10px IBM Plex Sans";
      ctx.textAlign = "center";
      ctx.fillText(`${b.queue.length}`, b.x, b.y + b.h * CELL * 0.42);
    }
  }

  if (ghost) {
    ctx.save();
    ctx.globalAlpha = ghost.held ? 0.62 : 0.48;
    ctx.fillStyle = ghost.ok ? "rgba(110,163,122,0.9)" : "rgba(196,92,74,0.9)";
    ctx.fillRect(ghost.gx * CELL, ghost.gy * CELL, ghost.w * CELL, ghost.h * CELL);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ghost.ok ? "#8fca98" : "#d07a6c";
    ctx.lineWidth = ghost.held ? 4.5 : 3;
    ctx.strokeRect(ghost.gx * CELL + 1, ghost.gy * CELL + 1, ghost.w * CELL - 2, ghost.h * CELL - 2);
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4f4f5";
    const label = ghost.held ? (ghost.ok ? "DRAG" : "BLOCKED") : ghost.ok ? "TAP" : "BLOCKED";
    ctx.fillText(
      label,
      ghost.gx * CELL + (ghost.w * CELL) / 2,
      ghost.gy * CELL + (ghost.h * CELL) / 2 + 4,
    );
    ctx.restore();
  }

  for (const u of world.units) {
    const x = u.px + (u.x - u.px) * alpha;
    const y = u.py + (u.y - u.py) * alpha;
    if (x < viewL - 40 || y < viewT - 40 || x > viewR + 40 || y > viewB + 40) continue;
    drawUnit(ctx, u.type, x, y, u.facing, u.owner, selUnits.has(u.id), u.air);
    if (u.hp < u.maxHp || selUnits.has(u.id)) bar(ctx, x, y - u.radius - 8, u.hp / u.maxHp, 22);
  }

  ctx.fillStyle = "#e8ebe6";
  for (const p of world.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (selUnits.size === 0 && selBuildings.size === 0 && world.time < 16) {
    const pulse = 0.55 + 0.45 * Math.sin(world.time * 6);
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    let tagged = 0;
    for (const u of world.units) {
      if (u.owner !== localOwner || u.type !== "worker") continue;
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      ctx.strokeStyle = `rgba(212,216,224,${0.35 + pulse * 0.55})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(x, y, 22 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      if (tagged < 2) {
        ctx.fillStyle = "rgba(9,9,11,0.75)";
        ctx.fillRect(x - 22, y - 42, 44, 16);
        ctx.fillStyle = "#f4f4f5";
        ctx.fillText("TAP", x, y - 30);
        tagged += 1;
      }
    }
  }

  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  type: UnitType,
  x: number,
  y: number,
  facing: number,
  owner: number,
  sel: boolean,
  air: boolean,
) {
  const im = img(UNIT_SPRITE[type]);
  const size = type === "armor" || type === "siege" ? 36 : type === "fighter" ? 32 : 28;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = TEAM_COLORS[owner % TEAM_COLORS.length];
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(0, 8, size * 0.38, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (sel) {
    ctx.strokeStyle = TEAM_COLORS[owner % TEAM_COLORS.length];
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.ellipse(0, 8, size * 0.55, size * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(facing + Math.PI / 2);
  if (air) ctx.translate(0, -6);
  if (im) ctx.drawImage(im, -size / 2, -size / 2, size, size);
  else ctx.fillRect(-size / 3, -size / 3, size * 0.66, size * 0.66);
  ctx.restore();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  type: BuildingType,
  x: number,
  y: number,
  w: number,
  h: number,
  owner: number,
  progress: number,
  sel: boolean,
) {
  const bw = w * CELL;
  const bh = h * CELL;
  const im = img(BUILDING_SPRITE[type]);
  ctx.save();
  ctx.globalAlpha = 0.35 + progress * 0.65;
  ctx.fillStyle = TEAM_COLORS[owner % TEAM_COLORS.length];
  ctx.globalAlpha *= 0.35;
  ctx.fillRect(x - bw / 2 + 4, y - bh / 2 + 4, bw - 8, bh - 8);
  ctx.globalAlpha = 0.35 + progress * 0.65;
  if (sel) {
    ctx.strokeStyle = TEAM_COLORS[owner % TEAM_COLORS.length];
    ctx.lineWidth = 2;
    ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  }
  if (im) ctx.drawImage(im, x - bw / 2, y - bh / 2, bw, bh);
  else ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  ctx.restore();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, w: number) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - w / 2, y, w, 3);
  ctx.fillStyle = t > 0.45 ? "#6ea37a" : t > 0.2 ? "#c4a06a" : "#c45c4a";
  ctx.fillRect(x - w / 2, y, w * Math.max(0, t), 3);
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Cam,
  vw: number,
  vh: number,
  mw: number,
  mh: number,
) {
  const map = world.map;
  const ww = map.w * CELL;
  const wh = map.h * CELL;
  const dpr = ctx.canvas.width / Math.max(1, mw);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, mw, mh);
  const sx = mw / ww;
  const sy = mh / wh;
  for (let gy = 0; gy < map.h; gy += 2) {
    for (let gx = 0; gx < map.w; gx += 2) {
      const t = map.tiles[gy * map.w + gx];
      if (t === TILE_VOID) ctx.fillStyle = "#05060a";
      else if (t === TILE_HIGH) ctx.fillStyle = "#2a2e38";
      else if (t === TILE_SPAWN) ctx.fillStyle = "#1c2430";
      else ctx.fillStyle = "#151820";
      ctx.fillRect(gx * CELL * sx, gy * CELL * sy, CELL * 2 * sx + 0.5, CELL * 2 * sy + 0.5);
    }
  }
  for (const n of world.nodes) {
    ctx.fillStyle = n.kind === 1 ? "#9bb4c8" : "#6ec4bc";
    ctx.fillRect(n.x * sx - 1, n.y * sy - 1, 2, 2);
  }
  for (const b of world.buildings) {
    ctx.fillStyle = TEAM_COLORS[b.owner % TEAM_COLORS.length];
    ctx.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4);
  }
  for (const u of world.units) {
    ctx.fillStyle = TEAM_COLORS[u.owner % TEAM_COLORS.length];
    ctx.fillRect(u.x * sx - 0.8, u.y * sy - 0.8, 1.8, 1.8);
  }
  ctx.strokeStyle = "rgba(240,240,236,0.55)";
  ctx.lineWidth = 1;
  const rw = (vw / cam.z) * sx;
  const rh = (vh / cam.z) * sy;
  ctx.strokeRect(cam.x * sx - rw / 2, cam.y * sy - rh / 2, rw, rh);
}
