import { BUILDINGS, DIFFICULTY, UNITS } from "./config";
import type { World } from "./sim";
import type { BuildingType, UnitType } from "./types";

export function stepAI(world: World, owner: number) {
  const p = world.players[owner];
  if (!p || p.kind !== "cpu" || !p.alive) return;
  const d = DIFFICULTY[p.difficulty];
  const cores = world.buildings.filter((b) => b.owner === owner && b.type === "core" && b.progress >= 1);
  if (!cores.length) return;
  const core = cores[0];
  const workers = world.units.filter((u) => u.owner === owner && u.type === "worker");
  const army = world.units.filter((u) => u.owner === owner && u.type !== "worker");
  const barracks = world.buildings.filter((b) => b.owner === owner && b.type === "barracks" && b.progress >= 1);
  const works = world.buildings.filter((b) => b.owner === owner && b.type === "workshop" && b.progress >= 1);
  const spires = world.buildings.filter((b) => b.owner === owner && b.type === "spire" && b.progress >= 1);
  const depots = world.buildings.filter((b) => b.owner === owner && b.type === "depot");
  const turrets = world.buildings.filter((b) => b.owner === owner && b.type === "turret");

  const wantWorkers = Math.round(10 * d.eco);
  if (workers.length < wantWorkers && cores.some((c) => c.queue.length < 2)) {
    tryTrain(world, owner, cores[0].id, "worker");
  }

  if (p.supply + 2 >= p.supplyMax && depots.length < 6) {
    tryBuild(world, owner, "depot", core.gx + 5 + depots.length, core.gy + (depots.length % 2) * 3);
  }

  if (!barracks.length && p.ore >= BUILDINGS.barracks.ore) {
    tryBuild(world, owner, "barracks", core.gx - 5, core.gy + 1);
  }

  if (barracks.length && !works.length && p.ore >= 150 && p.flux >= 50 && world.time > 40) {
    tryBuild(world, owner, "workshop", core.gx + 1, core.gy - 6);
  }

  if (works.length && !spires.length && p.flux >= 100 && world.time > 70) {
    tryBuild(world, owner, "spire", core.gx - 6, core.gy - 5);
  }

  if (turrets.length < (p.difficulty === "idle" ? 0 : 2) && world.time > 35) {
    const spawn = world.map.spawns[owner];
    if (spawn) tryBuild(world, owner, "turret", spawn.chokeX - 1, spawn.chokeY - 1);
  }

  const idleProd = [...barracks, ...works, ...spires].filter((b) => b.queue.length < 2);
  for (const b of idleProd) {
    const choice = pickUnit(b.type, p.flux, d.prod);
    if (choice) tryTrain(world, owner, b.id, choice);
  }

  if (p.difficulty === "idle") return;

  const attackReady =
    world.shield <= 0 &&
    world.time >= d.attackAt &&
    army.length >= Math.max(4, Math.round(d.army * d.prod));

  if (attackReady) {
    const enemy = nearestEnemyCore(world, owner);
    if (enemy) {
      const ids = army.filter((u) => u.order !== "attack" && u.order !== "attackMove").map((u) => u.id);
      if (ids.length) {
        world.apply(owner, { k: "move", ids, x: enemy.x, y: enemy.y, am: true });
      }
    }
  } else if (d.micro > 0.4 && army.length) {
    const threat = world.units.find(
      (u) => u.owner !== owner && world.players[u.owner].team !== p.team && u.hp > 0,
    );
    if (threat) {
      const defenders = army.filter((u) => {
        const dx = u.x - core.x;
        const dy = u.y - core.y;
        return dx * dx + dy * dy < 280 * 280;
      });
      if (defenders.length && Math.hypot(threat.x - core.x, threat.y - core.y) < 340) {
        world.apply(owner, {
          k: "move",
          ids: defenders.map((u) => u.id),
          x: threat.x,
          y: threat.y,
          am: true,
        });
      }
    }
  }
}

function pickUnit(btype: string, flux: number, prod: number): UnitType | null {
  if (btype === "barracks") {
    if (flux >= 25 && Math.random() < 0.45 * prod) return "ranger";
    return "infantry";
  }
  if (btype === "workshop") {
    if (flux >= 100 && Math.random() < 0.35) return "siege";
    return "armor";
  }
  if (btype === "spire") return "fighter";
  return null;
}

function tryTrain(world: World, owner: number, bid: number, utype: UnitType) {
  const def = UNITS[utype];
  const p = world.players[owner];
  if (p.ore < def.ore || p.flux < def.flux) return;
  world.apply(owner, { k: "train", bid, utype });
}

function tryBuild(world: World, owner: number, btype: BuildingType, gx: number, gy: number) {
  const def = BUILDINGS[btype];
  const p = world.players[owner];
  if (p.ore < def.ore || p.flux < def.flux) return;
  const worker = world.units.find(
    (u) => u.owner === owner && u.type === "worker" && (u.order === "idle" || u.order === "gather") && !u.cargo,
  );
  if (!worker) return;
  let x = gx;
  let y = gy;
  for (let i = 0; i < 18; i++) {
    if (world.canPlace(x, y, def.w, def.h, owner)) {
      world.apply(owner, { k: "build", workerId: worker.id, btype, gx: x, gy: y });
      return;
    }
    x = gx + ((i % 5) - 2);
    y = gy + (((i / 5) | 0) - 1);
  }
}

function nearestEnemyCore(world: World, owner: number) {
  const team = world.players[owner].team;
  let best = null as (typeof world.buildings)[0] | null;
  let bd = Infinity;
  const me = world.map.spawns[owner];
  for (const b of world.buildings) {
    if (b.type !== "core" || b.hp <= 0) continue;
    if (world.players[b.owner].team === team) continue;
    const d = Math.hypot(b.x - (me?.cx ?? 0), b.y - (me?.cy ?? 0));
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}
