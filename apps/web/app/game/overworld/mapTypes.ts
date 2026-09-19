import type { RouteTheme } from '../art/themes';

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export type NpcSprite = 'npc_1' | 'npc_2' | 'npc_3';

export interface SpawnSpec { x: number; y: number; facing: Dir }

export interface NpcSpec {
  id: string;
  name: string;
  sprite: NpcSprite;
  x: number;
  y: number;
  facing: Dir;
  dialog: string[];
  /** > 0 makes the NPC wander inside this radius (tiles). */
  wander: number;
  /** 'teller' heals the player; everything else just talks. */
  role: 'townsfolk' | 'teller';
}

export interface TrainerSpec {
  id: string;
  name: string;
  sprite: NpcSprite;
  x: number;
  y: number;
  facing: Dir;
  /** How far the trainer can see along `facing`. */
  range: number;
  intro: string[];
  /** Said while the trainer is recovering after a battle. */
  after: string[];
}

export interface SignSpec { id: string; x: number; y: number; text: string[] }

/** Stepping on (x,y) moves the player to `to` (an interior or back to the route). */
export interface WarpSpec { id: string; x: number; y: number; to: string; spawn: SpawnSpec }

export interface MapMeta {
  key: string;
  theme: RouteTheme;
  kind: 'route' | 'interior';
  title: string;
  width: number;
  height: number;
  spawn: SpawnSpec;
  warps: WarpSpec[];
  signs: SignSpec[];
  npcs: NpcSpec[];
  trainers: TrainerSpec[];
  /** Tiles that open the "Leave route?" prompt. */
  exits: Array<{ x: number; y: number }>;
}

export interface TiledProperty { name: string; type: 'bool' | 'string' | 'int'; value: boolean | string | number }
export interface TiledTileLayer {
  id: number; name: string; type: 'tilelayer'; x: 0; y: 0; width: number; height: number;
  visible: boolean; opacity: number; data: number[]; properties?: TiledProperty[];
}
export interface TiledObject {
  id: number; name: string; type: string; x: number; y: number; width: 0; height: 0; rotation: 0;
  visible: true; point: true; properties: TiledProperty[];
}
export interface TiledObjectLayer {
  id: number; name: string; type: 'objectgroup'; draworder: 'topdown'; x: 0; y: 0; visible: boolean; opacity: number;
  objects: TiledObject[];
}
export interface TiledTileset {
  firstgid: number; name: string; image: string; imagewidth: number; imageheight: number;
  tilewidth: number; tileheight: number; tilecount: number; columns: number; margin: number; spacing: number;
  tiles: Array<{ id: number; properties: TiledProperty[] }>;
}
export interface TiledMapJson {
  compressionlevel: -1; width: number; height: number; tilewidth: 16; tileheight: 16; infinite: false;
  orientation: 'orthogonal'; renderorder: 'right-down'; type: 'map'; version: string; tiledversion: string;
  nextlayerid: number; nextobjectid: number;
  layers: Array<TiledTileLayer | TiledObjectLayer>;
  tilesets: TiledTileset[];
  properties: TiledProperty[];
}

export interface BuiltMap { key: string; json: TiledMapJson; meta: MapMeta }

export const LAYER = {
  ground: 'ground', paths: 'paths', anim0: 'anim0', anim1: 'anim1', decor: 'decor',
  collision: 'collision', overhead: 'overhead', objects: 'objects',
} as const;
