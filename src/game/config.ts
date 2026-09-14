import type {
  BuildingDef,
  BuildingType,
  Difficulty,
  RaceDef,
  RaceId,
  UnitDef,
  UnitType,
} from "./types";

export const CELL = 32;
export const TICK = 1 / 20;
export const SHIELD_SECONDS = 75;
export const START_ORE = 400;
export const START_FLUX = 0;

/** Prefix public assets so GitHub Pages (`/rift-command/`) and the live app (`/`) both resolve. */
export function assetUrl(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}
export const START_WORKERS = 6;
export const START_SUPPLY = 0;
export const CORE_SUPPLY = 8;
export const HARVEST_TIME = 1.35;
export const HARVEST_ORE = 8;
export const HARVEST_FLUX = 6;
export const MAX_UNITS = 360;
export const MAX_QUEUE = 5;
export const SIGHT = 220;

export const RACES: Record<RaceId, RaceDef> = {
  aegis: {
    id: "aegis",
    name: "Aegis",
    blurb: "Tougher hulls, slower stride. Holds a choke.",
    hp: 1.12,
    speed: 0.92,
    build: 1,
    dmg: 1,
  },
  striker: {
    id: "striker",
    name: "Striker",
    blurb: "Faster units, thinner plating. Wins on the move.",
    hp: 0.92,
    speed: 1.12,
    build: 1,
    dmg: 1,
  },
  foundry: {
    id: "foundry",
    name: "Foundry",
    blurb: "Faster production, lighter hits. Floods the field.",
    hp: 1,
    speed: 1,
    build: 0.84,
    dmg: 0.92,
  },
};

export const UNITS: Record<UnitType, UnitDef> = {
  worker: {
    type: "worker",
    name: "Rigger",
    hp: 45,
    speed: 88,
    range: 16,
    dmg: 5,
    cooldown: 1.1,
    ore: 50,
    flux: 0,
    supply: 1,
    radius: 10,
    air: false,
    splash: 0,
    train: 12,
    bonusBuilding: 1,
  },
  infantry: {
    type: "infantry",
    name: "Vanguard",
    hp: 70,
    speed: 82,
    range: 36,
    dmg: 9,
    cooldown: 0.82,
    ore: 50,
    flux: 0,
    supply: 1,
    radius: 11,
    air: false,
    splash: 0,
    train: 14,
    bonusBuilding: 1,
  },
  ranger: {
    type: "ranger",
    name: "Marksman",
    hp: 55,
    speed: 86,
    range: 145,
    dmg: 8,
    cooldown: 0.88,
    ore: 50,
    flux: 25,
    supply: 1,
    radius: 11,
    air: false,
    splash: 0,
    train: 16,
    bonusBuilding: 1,
  },
  armor: {
    type: "armor",
    name: "Bulwark",
    hp: 190,
    speed: 58,
    range: 38,
    dmg: 18,
    cooldown: 1.12,
    ore: 125,
    flux: 50,
    supply: 2,
    radius: 16,
    air: false,
    splash: 18,
    train: 24,
    bonusBuilding: 1,
  },
  siege: {
    type: "siege",
    name: "Breach",
    hp: 120,
    speed: 46,
    range: 230,
    dmg: 34,
    cooldown: 2.15,
    ore: 150,
    flux: 100,
    supply: 3,
    radius: 16,
    air: false,
    splash: 55,
    train: 32,
    bonusBuilding: 1.85,
  },
  fighter: {
    type: "fighter",
    name: "Lance",
    hp: 90,
    speed: 128,
    range: 115,
    dmg: 12,
    cooldown: 0.68,
    ore: 100,
    flux: 75,
    supply: 2,
    radius: 13,
    air: true,
    splash: 0,
    train: 22,
    bonusBuilding: 1,
  },
};

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  core: {
    type: "core",
    name: "Nexus",
    hp: 1400,
    ore: 400,
    flux: 0,
    w: 4,
    h: 4,
    build: 70,
    supply: 8,
    produces: ["worker"],
    range: 0,
    dmg: 0,
    cooldown: 0,
  },
  barracks: {
    type: "barracks",
    name: "Barracks",
    hp: 420,
    ore: 150,
    flux: 0,
    w: 3,
    h: 3,
    build: 32,
    supply: 0,
    produces: ["infantry", "ranger"],
    range: 0,
    dmg: 0,
    cooldown: 0,
  },
  workshop: {
    type: "workshop",
    name: "Works",
    hp: 460,
    ore: 150,
    flux: 50,
    w: 3,
    h: 3,
    build: 36,
    supply: 0,
    produces: ["armor", "siege"],
    range: 0,
    dmg: 0,
    cooldown: 0,
  },
  spire: {
    type: "spire",
    name: "Spire",
    hp: 400,
    ore: 150,
    flux: 100,
    w: 3,
    h: 3,
    build: 40,
    supply: 0,
    produces: ["fighter"],
    range: 0,
    dmg: 0,
    cooldown: 0,
  },
  depot: {
    type: "depot",
    name: "Depot",
    hp: 220,
    ore: 100,
    flux: 0,
    w: 2,
    h: 2,
    build: 18,
    supply: 8,
    produces: [],
    range: 0,
    dmg: 0,
    cooldown: 0,
  },
  turret: {
    type: "turret",
    name: "Sentry",
    hp: 240,
    ore: 75,
    flux: 25,
    w: 2,
    h: 2,
    build: 20,
    supply: 0,
    produces: [],
    range: 185,
    dmg: 13,
    cooldown: 0.7,
  },
};

export const DIFFICULTY: Record<
  Difficulty,
  { eco: number; prod: number; attackAt: number; army: number; micro: number }
> = {
  idle: { eco: 0.25, prod: 0.2, attackAt: 9999, army: 0, micro: 0 },
  easy: { eco: 0.7, prod: 0.65, attackAt: 150, army: 8, micro: 0.15 },
  standard: { eco: 1, prod: 1, attackAt: 95, army: 12, micro: 0.45 },
  hard: { eco: 1.2, prod: 1.2, attackAt: 70, army: 14, micro: 0.75 },
  insane: { eco: 1.45, prod: 1.4, attackAt: 50, army: 16, micro: 1 },
};

export const TEAM_COLORS = ["#6db3d4", "#d46d6d", "#7dba7a", "#c4a06a", "#8f9ad4", "#d4895a"];

export const UNIT_SPRITE: Record<UnitType, string> = {
  worker: assetUrl("game/sprites/worker.png"),
  infantry: assetUrl("game/sprites/infantry.png"),
  ranger: assetUrl("game/sprites/ranger.png"),
  armor: assetUrl("game/sprites/armor.png"),
  siege: assetUrl("game/sprites/siege.png"),
  fighter: assetUrl("game/sprites/fighter.png"),
};

export const BUILDING_SPRITE: Record<BuildingType, string> = {
  core: assetUrl("game/sprites/core.png"),
  barracks: assetUrl("game/sprites/barracks.png"),
  workshop: assetUrl("game/sprites/workshop.png"),
  spire: assetUrl("game/sprites/spire.png"),
  depot: assetUrl("game/sprites/depot.png"),
  turret: assetUrl("game/sprites/turret.png"),
};

export function raceOf(id: RaceId): RaceDef {
  return RACES[id];
}

export const UNIT_LIST: UnitType[] = ["worker", "infantry", "ranger", "armor", "siege", "fighter"];
export const BUILDING_LIST: BuildingType[] = [
  "core",
  "barracks",
  "workshop",
  "spire",
  "depot",
  "turret",
];
