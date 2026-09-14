import { astar, makeWalkMask, nearestWalkable } from "./pathfinding";
import {
  BUILDINGS,
  CELL,
  CORE_SUPPLY,
  HARVEST_FLUX,
  HARVEST_ORE,
  HARVEST_TIME,
  MAX_QUEUE,
  MAX_UNITS,
  SHIELD_SECONDS,
  SIGHT,
  START_FLUX,
  START_ORE,
  START_WORKERS,
  TICK,
  UNITS,
  raceOf,
} from "./config";
import { buildMap } from "./maps";
import type {
  Building,
  BuildingType,
  Command,
  GameMap,
  MatchSetup,
  PlayerState,
  Projectile,
  ResourceNode,
  Unit,
  UnitType,
} from "./types";
import { TILE_VOID } from "./types";

const tmpPath: { x: number; y: number }[] = [];

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export class World {
  map: GameMap;
  nodes: ResourceNode[];
  units: Unit[] = [];
  buildings: Building[] = [];
  players: PlayerState[] = [];
  projectiles: Projectile[] = [];
  nextId = 1;
  tick = 0;
  time = 0;
  shield = SHIELD_SECONDS;
  winner: number | null = null;
  setup: MatchSetup;
  events: string[] = [];
  private hash: number[][] = [];
  private hashW = 0;
  private hashCell = 64;

  constructor(setup: MatchSetup) {
    this.setup = setup;
    const built = buildMap(setup.mapId);
    this.map = built.map;
    this.nodes = built.nodes;
    this.hashW = Math.ceil((this.map.w * CELL) / this.hashCell);
    const filled = setup.slots.filter((s) => s.kind === "human" || s.kind === "cpu");
    filled.forEach((slot, i) => {
      const spawn = this.map.spawns[i % this.map.spawns.length];
      const team =
        setup.gameType === "teams" ? (i % 2 === 0 ? 0 : 1) : i;
      this.players.push({
        id: i,
        name: slot.name || (slot.kind === "cpu" ? `CPU ${i + 1}` : `Player ${i + 1}`),
        race: slot.race,
        team,
        kind: slot.kind,
        difficulty: slot.difficulty,
        ore: START_ORE,
        flux: START_FLUX,
        supply: 0,
        supplyMax: CORE_SUPPLY,
        alive: true,
        peerId: slot.peerId,
      });
      const def = BUILDINGS.core;
      const gx = spawn.x - ((def.w / 2) | 0);
      const gy = spawn.y - ((def.h / 2) | 0);
      this.nodes = this.nodes.filter((n) => {
        return n.gx < gx || n.gy < gy || n.gx >= gx + def.w || n.gy >= gy + def.h;
      });
      this.placeBuilding(i, "core", gx, gy, true);
      const race = raceOf(slot.race);
      for (let k = 0; k < START_WORKERS; k++) {
        const ang = (k / START_WORKERS) * Math.PI * 2;
        const u = this.spawnUnit(
          i,
          "worker",
          spawn.cx + Math.cos(ang) * 96,
          spawn.cy + Math.sin(ang) * 96,
        );
        if (u) {
          u.maxHp = Math.round(u.maxHp * race.hp);
          u.hp = u.maxHp;
        }
      }
    });
    this.recountSupply();
  }

  spawnUnit(owner: number, type: UnitType, x: number, y: number): Unit | null {
    if (this.units.length >= MAX_UNITS) return null;
    const def = UNITS[type];
    const race = raceOf(this.players[owner].race);
    const u: Unit = {
      id: this.nextId++,
      owner,
      type,
      x,
      y,
      px: x,
      py: y,
      hp: Math.round(def.hp * race.hp),
      maxHp: Math.round(def.hp * race.hp),
      facing: 0,
      order: "idle",
      path: null,
      pathI: 0,
      targetId: -1,
      nodeId: -1,
      cargo: 0,
      harvest: 0,
      buildType: null,
      buildGx: 0,
      buildGy: 0,
      cooldown: 0,
      air: def.air,
      radius: def.radius,
    };
    this.units.push(u);
    return u;
  }

  placeBuilding(
    owner: number,
    type: BuildingType,
    gx: number,
    gy: number,
    instant: boolean,
  ): Building | null {
    const def = BUILDINGS[type];
    if (!this.canPlace(gx, gy, def.w, def.h, instant ? -1 : owner)) return null;
    const b: Building = {
      id: this.nextId++,
      owner,
      type,
      gx,
      gy,
      x: (gx + def.w / 2) * CELL,
      y: (gy + def.h / 2) * CELL,
      w: def.w,
      h: def.h,
      hp: instant ? def.hp : Math.max(20, (def.hp * 0.15) | 0),
      maxHp: def.hp,
      progress: instant ? 1 : 0,
      queue: [],
      train: 0,
      rallyX: (gx + def.w / 2) * CELL,
      rallyY: (gy + def.h + 1.2) * CELL,
      cooldown: 0,
      builderId: -1,
    };
    this.buildings.push(b);
    this.markOcc(b, true);
    if (instant && def.supply) this.players[owner].supplyMax += def.supply;
    return b;
  }

  canPlace(gx: number, gy: number, bw: number, bh: number, owner: number): boolean {
    const { map } = this;
    for (let y = gy; y < gy + bh; y++) {
      for (let x = gx; x < gx + bw; x++) {
        if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return false;
        const i = y * map.w + x;
        const t = map.tiles[i];
        if (t === TILE_VOID) return false;
        if (map.occ[i] !== 0) return false;
        if (this.nodes.some((n) => n.gx === x && n.gy === y)) return false;
        if (owner >= 0 && this.shield > 0 && this.enemyProtected(owner, i)) return false;
      }
    }
    return true;
  }

  markOcc(b: Building, on: boolean) {
    for (let y = b.gy; y < b.gy + b.h; y++) {
      for (let x = b.gx; x < b.gx + b.w; x++) {
        const i = y * this.map.w + x;
        this.map.occ[i] = on ? -b.id : 0;
      }
    }
  }

  enemyProtected(owner: number, cell: number): boolean {
    if (this.shield <= 0) return false;
    const team = this.players[owner].team;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].team === team) continue;
      const spawn = this.map.spawns[i];
      if (spawn && spawn.cells.includes(cell)) return true;
    }
    return false;
  }

  protectedSet(owner: number): Set<number> | undefined {
    if (this.shield <= 0) return undefined;
    const set = new Set<number>();
    const team = this.players[owner].team;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].team === team) continue;
      const spawn = this.map.spawns[i];
      if (spawn) for (const c of spawn.cells) set.add(c);
    }
    return set;
  }

  apply(owner: number, cmd: Command) {
    if (this.winner !== null) return;
    if (!this.players[owner]?.alive) return;
    switch (cmd.k) {
      case "move":
        this.issueMove(owner, cmd.ids, cmd.x, cmd.y, cmd.am);
        break;
      case "stop":
        for (const u of this.ownedUnits(owner, cmd.ids)) {
          u.order = "idle";
          u.path = null;
          u.targetId = -1;
        }
        break;
      case "attack":
        this.issueAttack(owner, cmd.ids, cmd.tid);
        break;
      case "gather":
        for (const u of this.ownedUnits(owner, cmd.ids)) {
          if (u.type !== "worker") continue;
          u.order = "gather";
          u.nodeId = cmd.nid;
          u.targetId = -1;
          u.path = null;
        }
        break;
      case "build":
        this.issueBuild(owner, cmd.workerId, cmd.btype, cmd.gx, cmd.gy);
        break;
      case "train":
        this.issueTrain(owner, cmd.bid, cmd.utype);
        break;
      case "rally": {
        const b = this.buildings.find((x) => x.id === cmd.bid && x.owner === owner);
        if (b) {
          b.rallyX = cmd.x;
          b.rallyY = cmd.y;
        }
        break;
      }
      case "cancel": {
        const b = this.buildings.find((x) => x.id === cmd.bid && x.owner === owner);
        if (b && b.queue.length) {
          const t = b.queue.pop()!;
          const def = UNITS[t];
          this.players[owner].ore += def.ore;
          this.players[owner].flux += def.flux;
        }
        break;
      }
    }
  }

  private ownedUnits(owner: number, ids: number[]) {
    const set = new Set(ids);
    return this.units.filter((u) => u.owner === owner && set.has(u.id) && u.hp > 0);
  }

  private issueMove(owner: number, ids: number[], x: number, y: number, am: boolean) {
    const list = this.ownedUnits(owner, ids);
    const cols = Math.ceil(Math.sqrt(list.length));
    list.forEach((u, i) => {
      const ox = ((i % cols) - (cols - 1) / 2) * 22;
      const oy = ((i / cols) | 0) * 22;
      u.order = am ? "attackMove" : "move";
      u.targetId = -1;
      u.nodeId = -1;
      u.buildType = null;
      this.pathUnit(u, x + ox, y + oy);
    });
  }

  private issueAttack(owner: number, ids: number[], tid: number) {
    const hasU = this.units.some((u) => u.id === tid);
    const hasB = this.buildings.some((b) => b.id === tid);
    if (!hasU && !hasB) return;
    for (const u of this.ownedUnits(owner, ids)) {
      u.order = "attack";
      u.targetId = tid;
      u.path = null;
    }
  }

  private issueBuild(owner: number, workerId: number, btype: BuildingType, gx: number, gy: number) {
    const u = this.units.find((x) => x.id === workerId && x.owner === owner && x.type === "worker");
    if (!u) return;
    const def = BUILDINGS[btype];
    const p = this.players[owner];
    if (p.ore < def.ore || p.flux < def.flux) return;
    if (!this.canPlace(gx, gy, def.w, def.h, owner)) return;
    p.ore -= def.ore;
    p.flux -= def.flux;
    const b = this.placeBuilding(owner, btype, gx, gy, false);
    if (!b) {
      p.ore += def.ore;
      p.flux += def.flux;
      return;
    }
    u.order = "build";
    u.buildType = btype;
    u.buildGx = gx;
    u.buildGy = gy;
    u.targetId = b.id;
    b.builderId = u.id;
    this.pathUnit(u, b.x, b.y);
    this.events.push("build");
  }

  private issueTrain(owner: number, bid: number, utype: UnitType) {
    const b = this.buildings.find((x) => x.id === bid && x.owner === owner);
    if (!b || b.progress < 1) return;
    const def = BUILDINGS[b.type];
    if (!def.produces.includes(utype)) return;
    if (b.queue.length >= MAX_QUEUE) return;
    const ud = UNITS[utype];
    const p = this.players[owner];
    if (p.ore < ud.ore || p.flux < ud.flux) return;
    if (p.supply + this.queuedSupply(owner) + ud.supply > p.supplyMax) return;
    p.ore -= ud.ore;
    p.flux -= ud.flux;
    b.queue.push(utype);
    this.events.push("train");
  }

  queuedSupply(owner: number) {
    let s = 0;
    for (const b of this.buildings) {
      if (b.owner !== owner) continue;
      for (const t of b.queue) s += UNITS[t].supply;
    }
    return s;
  }

  pathUnit(u: Unit, x: number, y: number) {
    const walk = makeWalkMask(
      this.map.tiles,
      this.map.occ,
      this.map.w,
      this.map.h,
      u.air,
      this.protectedSet(u.owner),
    );
    const sx = clamp((u.x / CELL) | 0, 0, this.map.w - 1);
    const sy = clamp((u.y / CELL) | 0, 0, this.map.h - 1);
    let gx = (x / CELL) | 0;
    let gy = (y / CELL) | 0;
    [gx, gy] = nearestWalkable(walk, this.map.w, this.map.h, gx, gy);
    tmpPath.length = 0;
    if (astar(walk, this.map.w, this.map.h, sx, sy, gx, gy, tmpPath, CELL)) {
      u.path = tmpPath.map((p) => ({ x: p.x, y: p.y }));
      u.pathI = 0;
    } else {
      u.path = [{ x, y }];
      u.pathI = 0;
    }
  }

  step() {
    if (this.winner !== null) return;
    this.tick++;
    this.time += TICK;
    if (this.shield > 0) this.shield = Math.max(0, this.shield - TICK);
    this.events.length = 0;
    this.rebuildHash();
    this.stepBuildings();
    this.stepUnits();
    this.stepProjectiles();
    this.separate();
    this.pruneDead();
    this.recountSupply();
    this.checkWin();
  }

  private rebuildHash() {
    const n = this.hashW * this.hashW;
    if (this.hash.length < n) {
      this.hash = Array.from({ length: n }, () => []);
    } else {
      for (let i = 0; i < n; i++) this.hash[i].length = 0;
    }
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0) continue;
      const hx = clamp((u.x / this.hashCell) | 0, 0, this.hashW - 1);
      const hy = clamp((u.y / this.hashCell) | 0, 0, this.hashW - 1);
      this.hash[hy * this.hashW + hx].push(i);
    }
  }

  queryNear(x: number, y: number, r: number, fn: (u: Unit) => void) {
    const c = this.hashCell;
    const x0 = clamp(((x - r) / c) | 0, 0, this.hashW - 1);
    const y0 = clamp(((y - r) / c) | 0, 0, this.hashW - 1);
    const x1 = clamp(((x + r) / c) | 0, 0, this.hashW - 1);
    const y1 = clamp(((y + r) / c) | 0, 0, this.hashW - 1);
    const r2 = r * r;
    for (let hy = y0; hy <= y1; hy++) {
      for (let hx = x0; hx <= x1; hx++) {
        const bucket = this.hash[hy * this.hashW + hx];
        for (const i of bucket) {
          const u = this.units[i];
          if (dist2(u.x, u.y, x, y) <= r2) fn(u);
        }
      }
    }
  }

  private stepBuildings() {
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      const race = raceOf(this.players[b.owner].race);
      if (b.progress < 1) {
        const builder = this.units.find((u) => u.id === b.builderId && u.hp > 0);
        if (builder && dist2(builder.x, builder.y, b.x, b.y) < 46 * 46) {
          const def = BUILDINGS[b.type];
          b.progress = Math.min(1, b.progress + TICK / (def.build * race.build));
          b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * TICK) / (def.build * race.build));
          if (b.progress >= 1) {
            b.progress = 1;
            b.hp = b.maxHp;
            if (def.supply) this.players[b.owner].supplyMax += def.supply;
            this.events.push("complete");
            if (builder.order === "build") builder.order = "idle";
          }
        }
        continue;
      }
      const tdef = BUILDINGS[b.type];
      if (tdef.range > 0) {
        b.cooldown = Math.max(0, b.cooldown - TICK);
        if (b.cooldown <= 0) {
          const tgt = this.acquire(b.x, b.y, tdef.range, b.owner, true);
          if (tgt) {
            this.fireAt(b.owner, b.x, b.y, tgt, tdef.dmg, 0, tdef.range, 1);
            b.cooldown = tdef.cooldown;
          }
        }
      }
      if (b.queue.length) {
        const ut = b.queue[0];
        const ud = UNITS[ut];
        b.train += TICK / (ud.train * race.build);
        if (b.train >= 1) {
          b.train = 0;
          b.queue.shift();
          const spawn = this.spawnUnit(
            b.owner,
            ut,
            b.x + (Math.random() - 0.5) * 12,
            b.y + b.h * CELL * 0.45,
          );
          if (spawn) {
            this.pathUnit(spawn, b.rallyX, b.rallyY);
            spawn.order = "move";
            this.events.push("spawn");
          }
        }
      }
    }
  }

  private stepUnits() {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      u.px = u.x;
      u.py = u.y;
      u.cooldown = Math.max(0, u.cooldown - TICK);
      if (u.order === "build") {
        const b = this.buildings.find((x) => x.id === u.targetId);
        if (!b || b.progress >= 1) {
          u.order = "idle";
        } else if (dist2(u.x, u.y, b.x, b.y) > 42 * 42) {
          this.followPath(u);
        }
        continue;
      }
      if (u.order === "gather" || (u.type === "worker" && u.order === "idle" && u.cargo)) {
        this.stepGather(u);
        continue;
      }
      if (u.order === "attack") {
        this.stepAttack(u);
        continue;
      }
      if (u.order === "attackMove") {
        const tgt = this.acquire(u.x, u.y, SIGHT, u.owner, !u.air);
        if (tgt) {
          u.targetId = tgt.kind === "u" ? tgt.u.id : tgt.b.id;
          this.stepAttack(u);
        } else {
          this.followPath(u);
          if (!u.path) u.order = "idle";
        }
        continue;
      }
      if (u.order === "move") {
        this.followPath(u);
        if (!u.path) u.order = "idle";
        continue;
      }
      if (u.type === "worker" && u.order === "idle" && !u.cargo) {
        const node = this.nearestNode(u.x, u.y, 1);
        if (node && dist2(u.x, u.y, node.x, node.y) < 220 * 220) {
          u.order = "gather";
          u.nodeId = node.id;
        }
      }
    }
  }

  private stepGather(u: Unit) {
    const race = raceOf(this.players[u.owner].race);
    const speed = UNITS[u.type].speed * race.speed;
    const steer = (tx: number, ty: number) => {
      const dx = tx - u.x;
      const dy = ty - u.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = speed * TICK;
      if (d <= step + 2) {
        u.x = tx;
        u.y = ty;
      } else {
        u.x += (dx / d) * step;
        u.y += (dy / d) * step;
      }
      u.facing = Math.atan2(dy, dx);
      u.path = null;
    };

    if (u.cargo) {
      const core = this.nearestCore(u.owner, u.x, u.y);
      if (!core) {
        u.order = "idle";
        return;
      }
      if (dist2(u.x, u.y, core.x, core.y) < 80 * 80) {
        const p = this.players[u.owner];
        if (u.cargo === 1) p.ore += HARVEST_ORE;
        else p.flux += HARVEST_FLUX;
        u.cargo = 0;
        u.harvest = 0;
        this.events.push("harvest");
        const node = this.nodes.find((n) => n.id === u.nodeId) ?? this.nearestNode(u.x, u.y);
        if (node) {
          u.nodeId = node.id;
          steer(node.x, node.y);
        }
        return;
      }
      steer(core.x, core.y);
      return;
    }
    const node = this.nodes.find((n) => n.id === u.nodeId) ?? this.nearestNode(u.x, u.y);
    if (!node) {
      u.order = "idle";
      return;
    }
    u.nodeId = node.id;
    if (dist2(u.x, u.y, node.x, node.y) < 72 * 72) {
      u.path = null;
      u.harvest += TICK;
      if (u.harvest >= HARVEST_TIME) {
        u.cargo = node.kind;
        u.harvest = 0;
        const core = this.nearestCore(u.owner, u.x, u.y);
        if (core) steer(core.x, core.y);
      }
    } else {
      steer(node.x, node.y);
    }
  }

  private stepAttack(u: Unit) {
    const tgt = this.findTarget(u.targetId);
    if (!tgt) {
      u.order = "idle";
      u.targetId = -1;
      return;
    }
    const def = UNITS[u.type];
    const range = def.range;
    const tx = tgt.kind === "u" ? tgt.u.x : tgt.b.x;
    const ty = tgt.kind === "u" ? tgt.u.y : tgt.b.y;
    const d2 = dist2(u.x, u.y, tx, ty);
    if (d2 <= range * range) {
      u.path = null;
      u.facing = Math.atan2(ty - u.y, tx - u.x);
      if (u.cooldown <= 0) {
        const race = raceOf(this.players[u.owner].race);
        this.fireAt(
          u.owner,
          u.x,
          u.y,
          tgt,
          def.dmg * race.dmg,
          def.splash,
          range,
          def.bonusBuilding,
        );
        u.cooldown = def.cooldown;
        this.events.push("shot");
      }
    } else {
      this.pathUnit(u, tx, ty);
      this.followPath(u);
    }
  }

  private fireAt(
    owner: number,
    x: number,
    y: number,
    tgt: { kind: "u"; u: Unit } | { kind: "b"; b: Building },
    dmg: number,
    splash: number,
    range: number,
    bonusBuilding: number,
  ) {
    const tx = tgt.kind === "u" ? tgt.u.x : tgt.b.x;
    const ty = tgt.kind === "u" ? tgt.u.y : tgt.b.y;
    const d = Math.hypot(tx - x, ty - y) || 1;
    const spd = range > 40 ? 420 : 900;
    if (range <= 28) {
      this.hurtTarget(tgt, dmg, bonusBuilding, owner);
      if (splash) this.splash(tx, ty, splash, dmg * 0.45, owner);
      return;
    }
    this.projectiles.push({
      x,
      y,
      vx: ((tx - x) / d) * spd,
      vy: ((ty - y) / d) * spd,
      dmg,
      splash,
      owner,
      targetId: tgt.kind === "u" ? tgt.u.id : tgt.b.id,
      airOk: true,
      groundOk: true,
      life: 1.4,
      bonusBuilding,
    });
  }

  private stepProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx * TICK;
      p.y += p.vy * TICK;
      p.life -= TICK;
      const tgt = this.findTarget(p.targetId);
      if (tgt) {
        const tx = tgt.kind === "u" ? tgt.u.x : tgt.b.x;
        const ty = tgt.kind === "u" ? tgt.u.y : tgt.b.y;
        if (dist2(p.x, p.y, tx, ty) < 16 * 16) {
          this.hurtTarget(tgt, p.dmg, p.bonusBuilding, p.owner);
          if (p.splash) this.splash(tx, ty, p.splash, p.dmg * 0.4, p.owner);
          p.life = 0;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  private hurtTarget(
    tgt: { kind: "u"; u: Unit } | { kind: "b"; b: Building },
    dmg: number,
    bonusBuilding: number,
    _owner: number,
  ) {
    if (tgt.kind === "u") {
      tgt.u.hp -= dmg;
    } else {
      tgt.b.hp -= dmg * bonusBuilding;
    }
  }

  private splash(x: number, y: number, r: number, dmg: number, owner: number) {
    const team = this.players[owner].team;
    this.queryNear(x, y, r, (u) => {
      if (this.players[u.owner].team === team) return;
      u.hp -= dmg;
    });
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      if (this.players[b.owner].team === team) continue;
      if (dist2(b.x, b.y, x, y) <= r * r) b.hp -= dmg;
    }
  }

  private findTarget(id: number): { kind: "u"; u: Unit } | { kind: "b"; b: Building } | null {
    const u = this.units.find((x) => x.id === id && x.hp > 0);
    if (u) return { kind: "u", u };
    const b = this.buildings.find((x) => x.id === id && x.hp > 0);
    if (b) return { kind: "b", b };
    return null;
  }

  acquire(
    x: number,
    y: number,
    range: number,
    owner: number,
    includeGround: boolean,
  ): { kind: "u"; u: Unit } | { kind: "b"; b: Building } | null {
    const team = this.players[owner].team;
    let best: Unit | null = null;
    let bestD = range * range;
    this.queryNear(x, y, range, (u) => {
      if (u.owner === owner) return;
      if (this.players[u.owner].team === team) return;
      if (!includeGround && !u.air) return;
      const d = dist2(u.x, u.y, x, y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    });
    if (best) return { kind: "u", u: best };
    let bb: Building | null = null;
    let bd = range * range;
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.progress < 0.2) continue;
      if (this.players[b.owner].team === team) continue;
      const d = dist2(b.x, b.y, x, y);
      if (d < bd) {
        bd = d;
        bb = b;
      }
    }
    if (bb) return { kind: "b", b: bb };
    return null;
  }

  private followPath(u: Unit) {
    if (!u.path || u.pathI >= u.path.length) {
      u.path = null;
      return;
    }
    const race = raceOf(this.players[u.owner].race);
    const speed = UNITS[u.type].speed * race.speed;
    const t = u.path[u.pathI];
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) {
      u.pathI++;
      if (u.pathI >= u.path.length) u.path = null;
      return;
    }
    const step = speed * TICK;
    const gx = ((u.x + (dx / d) * step) / CELL) | 0;
    const gy = ((u.y + (dy / d) * step) / CELL) | 0;
    const cell = gy * this.map.w + gx;
    if (this.enemyProtected(u.owner, cell)) {
      u.path = null;
      return;
    }
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    u.facing = Math.atan2(dy, dx);
  }

  private separate() {
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.hp <= 0 || a.air) continue;
      this.queryNear(a.x, a.y, 28, (b) => {
        if (b.id === a.id || b.air || b.hp <= 0) return;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        const min = a.radius + b.radius;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / 2) * 0.35;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          a.x += nx * push;
          a.y += ny * push;
        }
      });
    }
  }

  private pruneDead() {
    for (const u of this.units) {
      if (u.hp <= 0) this.events.push("die");
    }
    const deadB = this.buildings.filter((b) => b.hp <= 0);
    for (const b of deadB) {
      this.markOcc(b, false);
      this.events.push("boom");
    }
    this.units = this.units.filter((u) => u.hp > 0);
    this.buildings = this.buildings.filter((b) => b.hp > 0);
  }

  recountSupply() {
    for (const p of this.players) p.supply = 0;
    for (const u of this.units) {
      if (u.hp > 0) this.players[u.owner].supply += UNITS[u.type].supply;
    }
    for (const p of this.players) {
      let max = 0;
      for (const b of this.buildings) {
        if (b.owner === p.id && b.progress >= 1) max += BUILDINGS[b.type].supply;
      }
      p.supplyMax = max;
    }
  }

  private checkWin() {
    const cores = new Map<number, number>();
    for (const p of this.players) cores.set(p.team, 0);
    for (const b of this.buildings) {
      if (b.type === "core" && b.hp > 0) {
        const t = this.players[b.owner].team;
        cores.set(t, (cores.get(t) ?? 0) + 1);
      }
    }
    for (const p of this.players) {
      p.alive = (cores.get(p.team) ?? 0) > 0 && this.buildings.some((b) => b.owner === p.id && b.hp > 0);
    }
    const living = [...new Set(this.players.filter((p) => p.alive).map((p) => p.team))];
    if (living.length === 1) this.winner = living[0];
    if (living.length === 0) this.winner = -1;
  }

  nearestNode(x: number, y: number, kind?: 1 | 2) {
    let best: ResourceNode | null = null;
    let bd = Infinity;
    for (const n of this.nodes) {
      if (kind && n.kind !== kind) continue;
      const d = dist2(n.x, n.y, x, y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  nearestCore(owner: number, x: number, y: number) {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings) {
      if (b.owner !== owner || b.type !== "core" || b.progress < 1) continue;
      const d = dist2(b.x, b.y, x, y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  unitAt(x: number, y: number, owner?: number, slop = 8): Unit | null {
    let best: Unit | null = null;
    let bd = (28 + slop) * (28 + slop);
    for (const u of this.units) {
      if (owner !== undefined && u.owner !== owner) continue;
      const r = u.radius + slop;
      const d = dist2(u.x, u.y, x, y);
      if (d < r * r && d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  buildingAt(x: number, y: number): Building | null {
    const gx = (x / CELL) | 0;
    const gy = (y / CELL) | 0;
    for (const b of this.buildings) {
      if (gx >= b.gx && gy >= b.gy && gx < b.gx + b.w && gy < b.gy + b.h) return b;
    }
    return null;
  }

  nodeAt(x: number, y: number, slop = 56): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bd = slop * slop;
    for (const n of this.nodes) {
      const d = dist2(n.x, n.y, x, y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  snapshot() {
    return {
      tick: this.tick,
      time: this.time,
      shield: this.shield,
      winner: this.winner,
      players: this.players.map((p) => ({
        id: p.id,
        ore: p.ore,
        flux: p.flux,
        supply: p.supply,
        supplyMax: p.supplyMax,
        alive: p.alive,
      })),
      units: this.units.map((u) => [
        u.id,
        u.owner,
        u.type,
        u.x,
        u.y,
        u.hp,
        u.maxHp,
        u.facing,
        u.order,
        u.air ? 1 : 0,
      ]),
      buildings: this.buildings.map((b) => [
        b.id,
        b.owner,
        b.type,
        b.gx,
        b.gy,
        b.hp,
        b.maxHp,
        b.progress,
        b.queue.join(","),
        b.train,
      ]),
      projectiles: this.projectiles.map((p) => [p.x, p.y, p.vx, p.vy]),
    };
  }

  applySnapshot(snap: ReturnType<World["snapshot"]>) {
    this.tick = snap.tick;
    this.time = snap.time;
    this.shield = snap.shield;
    this.winner = snap.winner;
    for (const p of snap.players) {
      const d = this.players[p.id];
      if (!d) continue;
      d.ore = p.ore;
      d.flux = p.flux;
      d.supply = p.supply;
      d.supplyMax = p.supplyMax;
      d.alive = p.alive;
    }
    const oldU = new Map(this.units.map((u) => [u.id, u]));
    this.units = [];
    for (const row of snap.units) {
      const [id, owner, type, x, y, hp, maxHp, facing, order, air] = row as [
        number,
        number,
        UnitType,
        number,
        number,
        number,
        number,
        number,
        Unit["order"],
        number,
      ];
      const prev = oldU.get(id);
      const u: Unit = {
        id,
        owner,
        type,
        x,
        y,
        px: prev?.x ?? x,
        py: prev?.y ?? y,
        hp,
        maxHp,
        facing,
        order,
        path: null,
        pathI: 0,
        targetId: -1,
        nodeId: -1,
        cargo: 0,
        harvest: 0,
        buildType: null,
        buildGx: 0,
        buildGy: 0,
        cooldown: 0,
        air: !!air,
        radius: UNITS[type].radius,
      };
      this.units.push(u);
    }
    this.map.occ.fill(0);
    this.buildings = [];
    for (const row of snap.buildings) {
      const [id, owner, type, gx, gy, hp, maxHp, progress, queue, train] = row as [
        number,
        number,
        BuildingType,
        number,
        number,
        number,
        number,
        number,
        string,
        number,
      ];
      const def = BUILDINGS[type];
      const b: Building = {
        id,
        owner,
        type,
        gx,
        gy,
        x: (gx + def.w / 2) * CELL,
        y: (gy + def.h / 2) * CELL,
        w: def.w,
        h: def.h,
        hp,
        maxHp,
        progress,
        queue: queue ? (queue.split(",") as UnitType[]) : [],
        train,
        rallyX: (gx + def.w / 2) * CELL,
        rallyY: (gy + def.h + 1.2) * CELL,
        cooldown: 0,
        builderId: -1,
      };
      this.buildings.push(b);
      this.markOcc(b, true);
    }
    this.projectiles = snap.projectiles.map((p) => ({
      x: p[0],
      y: p[1],
      vx: p[2],
      vy: p[3],
      dmg: 0,
      splash: 0,
      owner: 0,
      targetId: -1,
      airOk: true,
      groundOk: true,
      life: 1,
      bonusBuilding: 1,
    }));
  }
}
