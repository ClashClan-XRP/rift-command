import { stepAI } from "./ai";
import { sfxBoom, sfxMove, sfxSelect, sfxShot, sfxTrain, unlockAudio } from "./audio";
import { BUILDINGS, CELL, TICK } from "./config";
import { loadArt, type Cam } from "./render";
import { World } from "./sim";
import type { BuildingType, Command, MatchSetup, UnitType } from "./types";

export type PointerMode = "pan" | "select" | "attack" | "build";

export class Session {
  world: World;
  cam: Cam;
  keys = new Set<string>();
  selUnits = new Set<number>();
  selBuildings = new Set<number>();
  mode: PointerMode = "pan";
  buildType: BuildingType | null = null;
  ghost: { gx: number; gy: number; w: number; h: number; ok: boolean } | null = null;
  localOwner: number;
  isHost: boolean;
  paused = false;
  acc = 0;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  pointers = new Map<number, { x: number; y: number }>();
  lastPinch = 0;
  hover = { x: 0, y: 0 };
  onCommand?: (cmd: Command) => void;
  hud = 0;

  constructor(setup: MatchSetup, isHost: boolean) {
    this.world = new World(setup);
    this.localOwner = setup.localOwner;
    this.isHost = isHost;
    const spawn = this.world.map.spawns[this.localOwner] ?? this.world.map.spawns[0];
    const phone = typeof window !== "undefined" && window.innerWidth < 800;
    this.cam = { x: spawn.cx, y: spawn.cy, z: phone ? 0.7 : 0.9 };
  }

  async ready() {
    await loadArt();
  }

  applyRemote(cmd: Command, owner: number) {
    this.world.apply(owner, cmd);
  }

  issue(cmd: Command) {
    if (this.isHost) this.world.apply(this.localOwner, cmd);
    this.onCommand?.(cmd);
    if (cmd.k === "move") sfxMove();
    if (cmd.k === "train") sfxTrain();
  }

  tick(dt: number) {
    if (this.paused || this.world.winner !== null) return;
    const cap = Math.min(dt, 0.1);
    this.pan(cap);
    if (!this.isHost) return;
    this.acc += cap;
    let steps = 0;
    while (this.acc >= TICK && steps < 5) {
      this.world.step();
      for (let i = 0; i < this.world.players.length; i++) {
        if (this.world.players[i].kind === "cpu") stepAI(this.world, i);
      }
      this.acc -= TICK;
      steps++;
      for (const e of this.world.events) {
        if (e === "shot") sfxShot();
        if (e === "boom" || e === "die") sfxBoom();
        if (e === "train" || e === "spawn") sfxTrain();
      }
    }
  }

  pan(dt: number) {
    const speed = 520 / this.cam.z;
    let dx = 0;
    let dy = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy += 1;
    this.cam.x += dx * speed * dt;
    this.cam.y += dy * speed * dt;
    const ww = this.world.map.w * CELL;
    const wh = this.world.map.h * CELL;
    this.cam.x = Math.max(0, Math.min(ww, this.cam.x));
    this.cam.y = Math.max(0, Math.min(wh, this.cam.y));
    this.cam.z = Math.max(0.45, Math.min(1.8, this.cam.z));
  }

  setKeys(codes: string[]) {
    this.keys = new Set(codes);
  }

  tapWorld(x: number, y: number, additive: boolean) {
    unlockAudio();
    if (this.mode === "build" && this.buildType) {
      const def = BUILDINGS[this.buildType];
      const gx = Math.round(x / CELL - def.w / 2);
      const gy = Math.round(y / CELL - def.h / 2);
      const worker = this.selectedWorkers()[0];
      if (!worker) return;
      const spot = this.world.findPlace(gx, gy, def.w, def.h, this.localOwner, 6);
      if (!spot) return;
      this.issue({ k: "build", workerId: worker.id, btype: this.buildType, gx: spot.gx, gy: spot.gy });
      this.mode = "pan";
      this.buildType = null;
      this.ghost = null;
      return;
    }
    if (this.mode === "attack") {
      const u = this.world.unitAt(x, y);
      const b = this.world.buildingAt(x, y);
      const tid = u?.id ?? b?.id;
      if (tid !== undefined) this.issue({ k: "attack", ids: [...this.selUnits], tid });
      else this.issue({ k: "move", ids: [...this.selUnits], x, y, am: true });
      this.mode = "pan";
      return;
    }
    const slop = 36;
    const node = this.world.nodeAt(x, y, 26);
    if (node && this.sendToNode(node)) return;
    const mine = this.world.unitAt(x, y, this.localOwner, slop);
    const anyU = this.world.unitAt(x, y, undefined, slop);
    const b = this.world.buildingAt(x, y);
    if (mine) {
      if (!additive) {
        this.selUnits.clear();
        this.selBuildings.clear();
      }
      this.selUnits.add(mine.id);
      sfxSelect();
      return;
    }
    if (b && b.owner === this.localOwner) {
      if (!additive) {
        this.selUnits.clear();
        this.selBuildings.clear();
      }
      this.selBuildings.add(b.id);
      sfxSelect();
      return;
    }
    if (this.selUnits.size) {
      if (anyU && anyU.owner !== this.localOwner) {
        this.issue({ k: "attack", ids: [...this.selUnits], tid: anyU.id });
      } else if (b && b.owner !== this.localOwner) {
        this.issue({ k: "attack", ids: [...this.selUnits], tid: b.id });
      } else {
        this.issue({ k: "move", ids: [...this.selUnits], x, y, am: false });
      }
      return;
    }
    if (!additive) {
      this.selUnits.clear();
      this.selBuildings.clear();
    }
  }

  sendToNode(node: { id: number; x: number; y: number }) {
    let workers = this.selectedWorkers();
    if (!workers.length) {
      if (this.selUnits.size > 0) return false;
      workers = this.world.units
        .filter(
          (u) =>
            u.owner === this.localOwner &&
            u.type === "worker" &&
            (u.order === "idle" || u.order === "gather"),
        )
        .sort((a, b) => (a.x - node.x) ** 2 + (a.y - node.y) ** 2 - ((b.x - node.x) ** 2 + (b.y - node.y) ** 2))
        .slice(0, 6);
    }
    if (!workers.length) return false;
    this.selUnits.clear();
    this.selBuildings.clear();
    for (const w of workers) this.selUnits.add(w.id);
    this.issue({ k: "gather", ids: workers.map((w) => w.id), nid: node.id });
    return true;
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean) {
    const minx = Math.min(x0, x1);
    const maxx = Math.max(x0, x1);
    const miny = Math.min(y0, y1);
    const maxy = Math.max(y0, y1);
    if (maxx - minx < 8 && maxy - miny < 8) return;
    if (!additive) {
      this.selUnits.clear();
      this.selBuildings.clear();
    }
    for (const u of this.world.units) {
      if (u.owner !== this.localOwner) continue;
      if (u.x >= minx && u.x <= maxx && u.y >= miny && u.y <= maxy) this.selUnits.add(u.id);
    }
  }

  selectedWorkers() {
    return this.world.units.filter((u) => this.selUnits.has(u.id) && u.type === "worker");
  }

  train(utype: UnitType) {
    const b = this.world.buildings.find((x) => this.selBuildings.has(x.id));
    if (b) this.issue({ k: "train", bid: b.id, utype });
  }

  beginBuild(type: BuildingType) {
    this.mode = "build";
    this.buildType = type;
    this.updateGhost(this.cam.x, this.cam.y);
  }

  stop() {
    if (this.selUnits.size) this.issue({ k: "stop", ids: [...this.selUnits] });
  }

  attackMove() {
    this.mode = "attack";
  }

  updateGhost(x: number, y: number) {
    if (this.mode !== "build" || !this.buildType) {
      this.ghost = null;
      return;
    }
    const def = BUILDINGS[this.buildType];
    const gx = Math.round(x / CELL - def.w / 2);
    const gy = Math.round(y / CELL - def.h / 2);
    const spot = this.world.findPlace(gx, gy, def.w, def.h, this.localOwner, 3);
    if (spot) {
      this.ghost = { gx: spot.gx, gy: spot.gy, w: def.w, h: def.h, ok: true };
    } else {
      this.ghost = { gx, gy, w: def.w, h: def.h, ok: false };
    }
  }
}
