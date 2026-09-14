export type RaceId = "aegis" | "striker" | "foundry";
export type UnitType = "worker" | "infantry" | "ranger" | "armor" | "siege" | "fighter";
export type BuildingType = "core" | "barracks" | "workshop" | "spire" | "depot" | "turret";
export type Difficulty = "idle" | "easy" | "standard" | "hard" | "insane";
export type GameType = "ffa" | "teams";
export type SlotKind = "open" | "human" | "cpu" | "closed";
export type MapId = "bastion" | "crucible" | "hexgate";

export type OrderKind =
  | "idle"
  | "move"
  | "attackMove"
  | "attack"
  | "gather"
  | "build"
  | "return";

export interface RaceDef {
  id: RaceId;
  name: string;
  blurb: string;
  hp: number;
  speed: number;
  build: number;
  dmg: number;
}

export interface UnitDef {
  type: UnitType;
  name: string;
  hp: number;
  speed: number;
  range: number;
  dmg: number;
  cooldown: number;
  ore: number;
  flux: number;
  supply: number;
  radius: number;
  air: boolean;
  splash: number;
  train: number;
  bonusBuilding: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  hp: number;
  ore: number;
  flux: number;
  w: number;
  h: number;
  build: number;
  supply: number;
  produces: UnitType[];
  range: number;
  dmg: number;
  cooldown: number;
}

export interface SlotConfig {
  kind: SlotKind;
  name: string;
  race: RaceId;
  difficulty: Difficulty;
  peerId?: string;
  team: number;
}

export interface MatchSetup {
  mapId: MapId;
  gameType: GameType;
  slots: SlotConfig[];
  localOwner: number;
  hostPeer?: string;
}

export interface Vec {
  x: number;
  y: number;
}

export interface Unit {
  id: number;
  owner: number;
  type: UnitType;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  facing: number;
  order: OrderKind;
  path: Vec[] | null;
  pathI: number;
  targetId: number;
  nodeId: number;
  cargo: 0 | 1 | 2;
  harvest: number;
  buildType: BuildingType | null;
  buildGx: number;
  buildGy: number;
  cooldown: number;
  air: boolean;
  radius: number;
}

export interface Building {
  id: number;
  owner: number;
  type: BuildingType;
  gx: number;
  gy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  progress: number;
  queue: UnitType[];
  train: number;
  rallyX: number;
  rallyY: number;
  cooldown: number;
  builderId: number;
}

export interface ResourceNode {
  id: number;
  kind: 1 | 2;
  x: number;
  y: number;
  gx: number;
  gy: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  splash: number;
  owner: number;
  targetId: number;
  airOk: boolean;
  groundOk: boolean;
  life: number;
  bonusBuilding: number;
}

export interface PlayerState {
  id: number;
  name: string;
  race: RaceId;
  team: number;
  kind: SlotKind;
  difficulty: Difficulty;
  ore: number;
  flux: number;
  supply: number;
  supplyMax: number;
  alive: boolean;
  peerId?: string;
}

export interface SpawnZone {
  x: number;
  y: number;
  cx: number;
  cy: number;
  cells: number[];
  chokeX: number;
  chokeY: number;
}

export interface GameMap {
  id: MapId;
  name: string;
  blurb: string;
  maxPlayers: number;
  w: number;
  h: number;
  cell: number;
  tiles: Uint8Array;
  occ: Int16Array;
  spawns: SpawnZone[];
  thumb: string;
}

export type Command =
  | { k: "move"; ids: number[]; x: number; y: number; am: boolean }
  | { k: "stop"; ids: number[] }
  | { k: "attack"; ids: number[]; tid: number }
  | { k: "gather"; ids: number[]; nid: number }
  | { k: "build"; workerId: number; btype: BuildingType; gx: number; gy: number }
  | { k: "train"; bid: number; utype: UnitType }
  | { k: "rally"; bid: number; x: number; y: number }
  | { k: "cancel"; bid: number };

export interface LobbyState {
  hostId: string;
  mapId: MapId;
  gameType: GameType;
  slots: SlotConfig[];
  started: boolean;
}

export const TILE_VOID = 0;
export const TILE_GROUND = 1;
export const TILE_HIGH = 2;
export const TILE_RAMP = 3;
export const TILE_SPAWN = 4;
