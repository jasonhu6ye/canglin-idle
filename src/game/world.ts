import { MAP_H, MAP_W, NODES } from '../core/data';

export type Tile = 'grass' | 'forest' | 'meadow' | 'stone' | 'dirt' | 'gravel' | 'water' | 'sand' | 'ash';

export const TILE_COLORS: Record<Tile, [string, string, string]> = {
  // 底色、深色噪点、浅色噪点
  grass: ['#5e9e45', '#4f8a3b', '#6fb252'],
  forest: ['#3f7a37', '#336a2e', '#4b8a40'],
  meadow: ['#8fa64a', '#7d9240', '#a3b85a'],
  stone: ['#8d8a83', '#77746e', '#a29f97'],
  dirt: ['#a07448', '#8a623c', '#b4885a'],
  gravel: ['#7c6f62', '#685c51', '#8f8274'],
  water: ['#3f78b5', '#356aa2', '#5a93cc'],
  sand: ['#d8c088', '#c6ad74', '#e6d09c'],
  ash: ['#4a4644', '#3b3836', '#5c5755'],
};

/** 确定性哈希：同一格子每次生成的装饰都一样 */
export function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const PLAZA = { x0: 14, y0: 10, x1: 25, y1: 18 };
export const SPAWN = { x: 19, y: 15 };
const LAKE = { cx: 32, cy: 22, rx: 6.2, ry: 4.6 };

function inLake(x: number, y: number, grow = 0) {
  const dx = (x - LAKE.cx) / (LAKE.rx + grow);
  const dy = (y - LAKE.cy) / (LAKE.ry + grow);
  return dx * dx + dy * dy <= 1;
}

/** 从广场到各资源点的 L 形土路 */
const pathTiles = new Set<string>();
for (const n of NODES) {
  const sx = SPAWN.x;
  const sy = SPAWN.y;
  const ty = n.y + 1;
  for (let x = Math.min(sx, n.x); x <= Math.max(sx, n.x); x++) pathTiles.add(`${x},${sy}`);
  for (let y = Math.min(sy, ty); y <= Math.max(sy, ty); y++) pathTiles.add(`${n.x},${y}`);
}

export function tileAt(x: number, y: number): Tile {
  if (inLake(x, y)) return 'water';
  if (inLake(x, y, 1.2)) return 'sand';
  if (x >= PLAZA.x0 && x <= PLAZA.x1 && y >= PLAZA.y0 && y <= PLAZA.y1) return 'stone';
  if (pathTiles.has(`${x},${y}`)) return 'dirt';
  if (x <= 11 && y <= 9) return 'gravel';
  if (x <= 6 && y >= 25) return 'ash';
  if (x <= 15 && y >= 19) return 'meadow';
  if (x >= 26 && y <= 11) return 'forest';
  return 'grass';
}

export const isBlocked = (x: number, y: number) =>
  x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || tileAt(x, y) === 'water';

export const HOUSES = [
  { x: 14, y: 6, roof: '#7d3b2c' },
  { x: 21, y: 6, roof: '#3d5a7d' },
  { x: 10, y: 12, roof: '#6b4a2b' },
  { x: 27, y: 10, roof: '#7d3b2c' },
];

export function isHouse(x: number, y: number) {
  return HOUSES.some((h) => x >= h.x && x < h.x + 3 && y >= h.y && y < h.y + 3);
}

/** 树和石头的装饰位置 */
export function decorations(): { x: number; y: number; kind: 'tree' | 'rock' }[] {
  const out: { x: number; y: number; kind: 'tree' | 'rock' }[] = [];
  const nodeNear = (x: number, y: number) => NODES.some((n) => Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 2);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      if (t === 'dirt' || t === 'stone' || t === 'water' || t === 'sand' || nodeNear(x, y) || isHouse(x, y)) continue;
      const r = hash(x, y, 1);
      const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
      if (t === 'forest' && r < 0.45) out.push({ x, y, kind: 'tree' });
      else if (t === 'gravel' && r < 0.18) out.push({ x, y, kind: 'rock' });
      else if ((t === 'grass' || t === 'meadow') && (edge ? r < 0.6 : r < 0.04)) out.push({ x, y, kind: 'tree' });
    }
  }
  return out;
}

/** 野外各怪物的游荡中心 */
export const MONSTER_ZONES: { monster: string; x: number; y: number }[] = [
  { monster: 'rabbit', x: 5, y: 21 },
  { monster: 'rabbit', x: 7, y: 20 },
  { monster: 'crab', x: 13, y: 21 },
  { monster: 'slime', x: 12, y: 25 },
  { monster: 'wolf', x: 9, y: 27 },
  { monster: 'ash_wraith', x: 3, y: 27 },
];

export const isWalkable = (x: number, y: number) => !isBlocked(x, y) && !isHouse(x, y);

type Pt = { x: number; y: number };
const DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/** 8 方向 BFS 寻路，斜走时不切墙角；终点不可走时返回 null */
export function findPath(from: Pt, to: Pt): Pt[] | null {
  if (!isWalkable(to.x, to.y)) return null;
  const key = (p: Pt) => p.y * MAP_W + p.x;
  const prev = new Map<number, number>([[key(from), -1]]);
  const queue: Pt[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Pt[] = [];
      for (let k = key(cur); k !== -1; k = prev.get(k)!) path.unshift({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
      return path.slice(1);
    }
    for (const d of DIRS) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      if (!isWalkable(n.x, n.y) || prev.has(key(n))) continue;
      if (d.x && d.y && (!isWalkable(cur.x + d.x, cur.y) || !isWalkable(cur.x, cur.y + d.y))) continue;
      prev.set(key(n), key(cur));
      queue.push(n);
    }
  }
  return null;
}
