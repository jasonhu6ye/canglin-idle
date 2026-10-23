import { MAP_H, MAP_W, NODES, townXY, type MapNode } from '../core/data';
import type { RegionId } from '../core/types';

/*
 * 2188×2188 的世界，按区域图生成。格子太多，整张图一次算完在手机上要好几秒，所以分两层：
 * - 启动时只算粗网格（每 4×4 格一个点）：区域归属、道路走向
 * - 地面和装饰物按 32×32 的块懒加载，第一次用到哪块才算哪块（渲染、寻路都走这里）
 * 全部是确定性的，同一份代码每次生成的世界都一样。
 */

type Pt = { x: number; y: number };

export const GROUNDS = [
  'grass', 'meadow', 'darkgrass', 'moss', 'cobble', 'road', 'roadsnow', 'roadsand', 'roaddark', 'farm',
  'sand', 'beach', 'snow', 'ice', 'rock', 'gravel', 'ash', 'basalt', 'abyss', 'glowmoss', 'mud', 'bridge',
  'water', 'ocean', 'swampwater', 'lava', 'chasm', 'cliff',
] as const;
export type Ground = (typeof GROUNDS)[number];
const G = Object.fromEntries(GROUNDS.map((g, i) => [g, i])) as Record<Ground, number>;
/** 走不过去的地面 */
export const BLOCKED_GROUNDS: Ground[] = ['water', 'ocean', 'swampwater', 'lava', 'chasm', 'cliff'];
/** 有岸边描边的地面 */
export const LIQUIDS: Ground[] = ['water', 'ocean', 'swampwater', 'lava', 'chasm', 'cliff'];
const blockedG = new Uint8Array(GROUNDS.length);
for (const g of BLOCKED_GROUNDS) blockedG[G[g]] = 1;

export const REGION_IDS: RegionId[] = ['town', 'snow', 'highland', 'coast', 'lava', 'abyss', 'swamp', 'woodland', 'giantwood'];

const N = MAP_W * MAP_H;
const idx = (x: number, y: number) => y * MAP_W + x;
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const clampX = (x: number) => Math.max(0, Math.min(MAP_W - 1, x));
const clampY = (y: number) => Math.max(0, Math.min(MAP_H - 1, y));

/** 确定性哈希：同一格子每次生成的结果都一样 */
export function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, salt: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const a = hash(xi, yi, salt);
  const b = hash(xi + 1, yi, salt);
  const c = hash(xi, yi + 1, salt);
  const d = hash(xi + 1, yi + 1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** 0-1 的分形噪声，scale 是最大一层的格子大小 */
export function fbm(x: number, y: number, salt: number, scale = 24) {
  return vnoise(x / scale, y / scale, salt) * 0.55 + vnoise((x * 2.3) / scale, (y * 2.3) / scale, salt + 1) * 0.3
    + vnoise((x * 5.1) / scale, (y * 5.1) / scale, salt + 2) * 0.15;
}

// ---- 1. 区域（粗网格） ----

const SHAPE_SEEDS: [number, number, RegionId][] = [
  [0.48, 0.49, 'town'], [0.41, 0.57, 'town'], [0.37, 0.63, 'town'], [0.55, 0.45, 'town'], [0.47, 0.42, 'town'], [0.54, 0.56, 'town'],
  [0.50, 0.05, 'snow'], [0.37, 0.24, 'snow'], [0.60, 0.10, 'snow'], [0.58, 0.29, 'snow'], [0.33, 0.04, 'snow'],
  [0.73, 0.28, 'highland'], [0.93, 0.07, 'highland'], [0.95, 0.31, 'highland'], [0.68, 0.05, 'highland'], [0.62, 0.38, 'highland'],
  [0.95, 0.47, 'coast'], [0.80, 0.56, 'coast'], [0.96, 0.66, 'coast'], [0.66, 0.52, 'coast'],
  [0.75, 0.78, 'lava'], [0.95, 0.95, 'lava'], [0.63, 0.86, 'lava'], [0.72, 0.66, 'lava'], [0.58, 0.70, 'lava'],
  [0.50, 0.82, 'abyss'], [0.40, 0.97, 'abyss'], [0.56, 0.96, 'abyss'], [0.46, 0.75, 'abyss'],
  [0.20, 0.86, 'swamp'], [0.04, 0.97, 'swamp'], [0.26, 0.77, 'swamp'], [0.17, 0.96, 'swamp'], [0.31, 0.88, 'swamp'], [0.07, 0.80, 'swamp'], [0.27, 0.97, 'swamp'],
  [0.21, 0.45, 'woodland'], [0.04, 0.47, 'woodland'], [0.31, 0.53, 'woodland'], [0.16, 0.71, 'woodland'], [0.29, 0.38, 'woodland'],
  [0.10, 0.05, 'giantwood'], [0.19, 0.21, 'giantwood'], [0.03, 0.22, 'giantwood'], [0.30, 0.18, 'giantwood'],
];
const SEEDS: { x: number; y: number; r: number }[] = [
  ...SHAPE_SEEDS.map(([u, v, r]) => ({ x: u * (MAP_W - 1), y: v * (MAP_H - 1), r: REGION_IDS.indexOf(r) })),
  ...NODES.filter((n) => !n.town || n.pond).map((n) => ({ x: n.x, y: n.y, r: REGION_IDS.indexOf(n.region) })),
];
/** 区域边界扰动的幅度和尺度（格） */
const WARP = Math.round((90 * MAP_W) / 1080);
const WARP_SCALE = Math.round((130 * MAP_W) / 1080);

function regionRaw(x: number, y: number) {
  const wx = x + (fbm(x, y, 11, WARP_SCALE) - 0.5) * WARP;
  const wy = y + (fbm(x, y, 12, WARP_SCALE) - 0.5) * WARP;
  let best = 0;
  let bestD = Infinity;
  for (const s of SEEDS) {
    const d = (s.x - wx) ** 2 + (s.y - wy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.r;
    }
  }
  return best;
}

/** 粗网格：每格代表 4×4 个地块 */
const C = 4;
const CW = Math.ceil(MAP_W / C);
const CH = Math.ceil(MAP_H / C);
/** 区域图用更粗的 8×8 网格：边界本来就有扰动，看不出差别，生成快 4 倍 */
const RC = 8;
const RW = Math.ceil(MAP_W / RC);
const RH = Math.ceil(MAP_H / RC);
const coarseRegion = new Uint8Array(RW * RH);
for (let cy = 0; cy < RH; cy++) for (let cx = 0; cx < RW; cx++) coarseRegion[cy * RW + cx] = regionRaw(cx * RC + 4, cy * RC + 4);
const regionIdx = (x: number, y: number) => coarseRegion[(clampY(y) >> 3) * RW + (clampX(x) >> 3)];
export const regionAt = (x: number, y: number): RegionId => REGION_IDS[regionIdx(Math.round(x), Math.round(y))];

// ---- 2. 地面规则 ----

const T0 = townXY(0, 0);
const tx = (x: number) => x + T0.x;
const ty = (y: number) => y + T0.y;
export const PLAZA = { x0: tx(145), y0: ty(148), x1: tx(190), y1: ty(189) };
const inPlaza = (x: number, y: number) => x >= PLAZA.x0 && x <= PLAZA.x1 && y >= PLAZA.y0 && y <= PLAZA.y1;
/** 城镇周围的四块田：田垄范围和中间留空给地点标记的位置 */
const FARMS = [
  { x0: 134, y0: 191, x1: 160, y1: 206, node: [148, 198] },
  { x0: 134, y0: 211, x1: 160, y1: 223, node: [147, 217] },
  { x0: 175, y0: 206, x1: 200, y1: 220, node: [187, 213] },
  { x0: 106, y0: 196, x1: 124, y1: 210, node: [115, 203] },
].map((f) => ({ x0: tx(f.x0), y0: ty(f.y0), x1: tx(f.x1), y1: ty(f.y1), local: f, node: townXY(f.node[0], f.node[1]) }));
const SPAWN_GUESS = townXY(167, 175);
/** 东边是海 */
const coastLine = (y: number) => MAP_W - 18 + (fbm(0, y, 9, 60) - 0.5) * 24;

function baseGround(x: number, y: number, r: RegionId): Ground {
  const d = fbm(x, y, 5, 10);
  switch (r) {
    case 'town': return d > 0.62 ? 'meadow' : 'grass';
    case 'snow': return 'snow';
    case 'highland': return d > 0.56 ? 'gravel' : 'rock';
    case 'coast': return d > 0.68 ? 'beach' : 'sand';
    case 'lava': return d > 0.56 ? 'basalt' : 'ash';
    case 'abyss': return d > 0.66 ? 'glowmoss' : 'abyss';
    case 'swamp': return d > 0.6 ? 'darkgrass' : 'mud';
    case 'woodland': return d > 0.62 ? 'grass' : 'darkgrass';
    case 'giantwood': return d > 0.6 ? 'darkgrass' : 'moss';
  }
}

/** 区域里的大块地貌：冰面、悬崖、熔岩湖、裂谷、沼泽水、林间小湖 */
function feature(x: number, y: number, r: RegionId): Ground | null {
  const n = fbm(x, y, 3, 22);
  switch (r) {
    case 'snow': return n > 0.7 ? 'ice' : null;
    case 'highland': return n > 0.73 ? 'cliff' : null;
    case 'lava': return n > 0.7 ? 'lava' : null;
    case 'abyss': return n > 0.68 ? 'chasm' : null;
    case 'swamp': return n > 0.6 ? 'swampwater' : null;
    case 'woodland': return n > 0.78 ? 'water' : null;
    default: return null;
  }
}

/** 跨区域的大地貌：蜿蜒的河、成片的湖、山脊、火山口、花海、沙丘（用户 10-22 要求加新地貌） */
const RIVER: Partial<Record<RegionId, Ground>> = {
  town: 'water', woodland: 'water', giantwood: 'water', coast: 'water', highland: 'water',
  snow: 'ice', swamp: 'swampwater', lava: 'lava', abyss: 'chasm',
};
/** 特色地点的地貌（用户 10-23 要求新地貌）：以地点为圆心、半径 r 的一片，中心留空地 */
const SITES = NODES.filter((n) => n.site).map((n) => ({ x: n.x, y: n.y, ...n.site! }));
function siteGround(x: number, y: number): Ground | null | undefined {
  for (const S of SITES) {
    const dx = x - S.x;
    const dy = y - S.y;
    if (Math.abs(dx) > S.r || Math.abs(dy) > S.r) continue;
    // 边缘用噪声抖一抖，不是正圆
    const d = Math.hypot(dx, dy) / S.r + (fbm(x, y, 300, 30) - 0.5) * (S.kind === 'crater' ? 0.06 : 0.25);
    if (d > 1) continue;
    if (d < 0.1) return null;
    const n = fbm(x, y, 301, 18);
    // 东西、南北各一条十字通道，保证从外面能走到中心
    const lane = Math.abs(dx) < 2 || Math.abs(dy) < 2;
    switch (S.kind) {
      case 'islands': // 千岛湖：大湖里散着小岛，湖边沙滩
        if (lane) return 'beach';
        return n > 0.5 - d * 0.12 ? 'water' : n > 0.46 - d * 0.12 ? 'beach' : 'meadow';
      case 'bamboo': // 雾隐竹海：暗草地，林间小水洼
        return !lane && fbm(x, y, 311, 9) > 0.7 ? 'water' : n > 0.55 ? 'moss' : 'darkgrass';
      case 'saltflat': { // 盐晶荒原：白色盐壳，龟裂纹，零星盐水池
        if (!lane && n > 0.74) return 'water';
        return Math.abs(fbm(x, y, 321, 12) - 0.5) < 0.025 ? 'sand' : 'beach';
      }
      case 'crater': { // 碎星陨坑：一圈环形山，四个缺口，坑底焦土和发光苔
        if (d > 0.62 && d < 0.74) return lane ? 'gravel' : 'cliff';
        if (d >= 0.74) return 'gravel';
        return d < 0.3 ? 'glowmoss' : n > 0.6 ? 'basalt' : 'ash';
      }
      case 'fungal': // 菌丝深谷：发光苔藓和普通苔藓交错，沼水洼
        if (!lane && n > 0.76) return 'swampwater';
        return fbm(x, y, 331, 10) > 0.5 ? 'glowmoss' : 'moss';
      case 'glacier': { // 冰川裂谷：大片冰面，一道道冰裂缝，裂缝上隔一段有冰桥
        const crack = Math.abs(fbm(x, y, 341, 26) - 0.5) < 0.018;
        if (crack && !lane && fbm(x, y, 342, 14) < 0.62) return 'chasm';
        return n > 0.45 ? 'ice' : 'snow';
      }
      case 'obsidian': { // 黑曜火山群：玄武岩，熔岩小河，几座小火山口
        const river = Math.abs(fbm(x, y, 351, 30) - 0.5) < 0.02;
        if (river && !lane && fbm(x, y, 352, 14) < 0.65) return 'lava';
        const cone = fbm(x, y, 353, 16);
        if (cone > 0.78) return 'lava';
        if (cone > 0.72) return 'cliff';
        return n > 0.55 ? 'basalt' : 'ash';
      }
      case 'starabyss': { // 星渊祭坛：深渊地面上一圈圈发光的环，外圈有裂口
        const ring = (d * 6) % 1;
        if (!lane && d > 0.5 && n > 0.72) return 'chasm';
        return ring < 0.14 ? 'glowmoss' : 'abyss';
      }
    }
  }
  return undefined;
}

function landform(x: number, y: number, r: RegionId): Ground | null {
  const sg = siteGround(x, y);
  if (sg !== undefined) return sg;
  if (r === 'town' && Math.hypot(x - SPAWN_GUESS.x, y - SPAWN_GUESS.y) < 70) return null;
  // 河：大尺度噪声的等值线，宽度随位置起伏
  const rv = fbm(x, y, 51, 170);
  const width = 0.006 + fbm(x, y, 52, 60) * 0.008;
  if (Math.abs(rv - 0.5) < width) return RIVER[r] ?? null;
  if (Math.abs(rv - 0.5) < width + 0.004 && (r === 'town' || r === 'woodland' || r === 'giantwood')) return 'meadow';
  // 山脊：脊状噪声，中间留缺口能翻过去
  if (r === 'highland' || r === 'snow' || r === 'giantwood') {
    const ridge = 1 - Math.abs(fbm(x, y, 71, 110) * 2 - 1);
    if (ridge > 0.965 && fbm(x, y, 72, 45) > 0.42) return 'cliff';
    if (ridge > 0.94 && r !== 'giantwood') return r === 'snow' ? 'rock' : 'gravel';
  }
  const big = fbm(x, y, 81, 120);
  switch (r) {
    case 'town':
    case 'woodland':
      if (big > 0.76) return 'water';
      if (big > 0.73) return 'beach';
      if (fbm(x, y, 91, 40) > 0.7) return 'meadow';
      return null;
    case 'giantwood': return big > 0.77 ? 'water' : big > 0.75 ? 'moss' : null;
    case 'coast': return big > 0.79 ? 'water' : fbm(x, y, 92, 18) > 0.66 ? 'beach' : null;
    case 'lava': return big > 0.8 ? 'lava' : big > 0.74 ? 'basalt' : null;
    case 'abyss': return big > 0.78 ? 'glowmoss' : null;
    case 'swamp': return big > 0.74 ? 'moss' : null;
    case 'snow': return big > 0.78 ? 'ice' : null;
    default: return null;
  }
}

/** 不考虑道路和局部修改的原始地面，粗网格寻路和世界地图缩略图用 */
function rawGround(x: number, y: number): Ground {
  const r = REGION_IDS[regionIdx(x, y)];
  const cl = coastLine(y);
  if (x > cl) return 'ocean';
  if (inPlaza(x, y)) return 'cobble';
  if (x > cl - 3 - hash(x, y, 8) * 2) return r === 'highland' ? 'gravel' : 'beach';
  const p = pondAt(x, y);
  if (p) return p;
  return landform(x, y, r) ?? feature(x, y, r) ?? baseGround(x, y, r);
}

// ---- 3. 水塘、资源点周边、城镇 ----

const POND_KIND: Partial<Record<RegionId, Ground>> = { swamp: 'swampwater', lava: 'lava', abyss: 'ocean' };

/** 资源点前面一格是角色干活时站的位置 */
export const standTile = (n: MapNode): Pt => ({ x: n.x, y: n.y + 1 });

const PONDS = NODES.filter((n) => n.pond).map((n) => {
  const big = n.id === 'town_lake' || n.id === 'abyss_eye';
  const rx = big ? 11 : 7;
  const ry = big ? 7 : 5;
  return { n, rx, ry, cx: n.x, cy: n.y - ry - 1, kind: POND_KIND[n.region] ?? 'water' };
});

function pondAt(x: number, y: number): Ground | null {
  for (const p of PONDS) {
    if (y > p.n.y || Math.abs(x - p.cx) > p.rx + 2 || Math.abs(y - p.cy) > p.ry + 2) continue;
    const wob = (fbm(x, y, 17, 6) - 0.5) * 0.5;
    if (((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 < 1 + wob) return p.kind;
  }
  return null;
}

/**
 * 每格的标记位，四种合成一个字节省内存（5088 地图有 2600 万格）：
 * 资源点周围的空地、建筑、道路、挡路的摆设
 */
const flags = new Uint8Array(N);
const F_NEAR = 1;
const F_BUILD = 2;
const F_ROAD = 4;
const F_PROP = 8;

/** 资源点周围要清出的空地 */
for (const n of NODES) {
  for (let y = n.y - 2; y <= n.y + 3; y++) for (let x = n.x - 3; x <= n.x + 3; x++) if (inMap(x, y)) flags[idx(x, y)] |= F_NEAR;
}

export type BuildingKind =
  | 'bank' | 'hall' | 'smithy' | 'inn' | 'workshop' | 'bowyer' | 'apothecary' | 'tower'
  | 'house' | 'house2' | 'house3' | 'stall' | 'windmill' | 'fountain' | 'barn' | 'well';
export interface Building { kind: BuildingKind; x: number; y: number; w: number; h: number }

const B = (kind: BuildingKind, x: number, y: number, w: number, h: number): Building => ({ kind, x: tx(x), y: ty(y), w, h });
export const BUILDINGS: Building[] = [
  B('bank', 148, 153, 6, 5), B('hall', 158, 150, 9, 7), B('smithy', 171, 153, 7, 5), B('inn', 181, 153, 6, 5),
  B('workshop', 148, 165, 6, 5), B('bowyer', 157, 166, 5, 4), B('apothecary', 174, 165, 6, 5), B('tower', 184, 164, 3, 6),
  B('fountain', 165, 168, 4, 4), B('stall', 149, 178, 3, 2), B('stall', 153, 178, 3, 2), B('stall', 157, 178, 3, 2),
  B('house', 162, 177, 5, 4), B('house2', 169, 177, 5, 4),
  // 镇外的民居和农舍
  B('house3', 133, 151, 5, 4), B('house', 135, 166, 5, 4), B('house2', 197, 152, 5, 4), B('house3', 199, 168, 5, 4),
  B('house', 194, 185, 5, 4), B('house2', 172, 196, 5, 4), B('house3', 186, 199, 5, 4), B('house', 156, 136, 5, 4),
  B('house2', 178, 137, 5, 4), B('windmill', 163, 193, 3, 4), B('barn', 127, 194, 5, 4), B('well', 140, 186, 1, 1),
];

for (const b of BUILDINGS) {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) flags[idx(x, y)] |= F_BUILD;
}
export const isBuilding = (x: number, y: number) => (flags[idx(x, y)] & F_BUILD) !== 0;

export const SPAWN: Pt = townXY(167, 175);

// ---- 4. 道路：粗网格上从镇中心跑一次 Dijkstra，按最短路树把每个资源点接上，再画到细网格 ----

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, key: number) {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0], this.keys[0]];
    const id = this.ids.pop()!;
    const key = this.keys.pop()!;
    if (this.ids.length) {
      let i = 0;
      const n = this.ids.length;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const c = l + 1 < n && this.keys[l + 1] < this.keys[l] ? l + 1 : l;
        if (this.keys[c] >= key) break;
        this.ids[i] = this.ids[c];
        this.keys[i] = this.keys[c];
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }
}

/** 粗网格每格中心的原始地面，修路和大范围寻路共用 */
const coarseGround = new Uint8Array(CW * CH);
for (let c = 0; c < CW * CH; c++) coarseGround[c] = G[rawGround(clampX((c % CW) * C + 2), clampY(Math.floor(c / CW) * C + 2))];
{
  // 每格代价先算好：Dijkstra 每格会被四个邻居各问一次，现算噪声太慢
  const costs = new Float32Array(CW * CH);
  for (let c = 0; c < CW * CH; c++) {
    const g = GROUNDS[coarseGround[c]];
    costs[c] = g === 'ocean' ? Infinity : g === 'cobble' ? 0.6
      : (blockedG[G[g]] ? 14 : 1) + vnoise(((c % CW) * C + 2) / 40, (Math.floor(c / CW) * C + 2) / 40, 61) * 1.6;
  }
  const cost = (c: number) => costs[c];
  const dist = new Float64Array(CW * CH).fill(Infinity);
  const prev = new Int32Array(CW * CH).fill(-1);
  const cell = (p: Pt) => (p.y >> 2) * CW + (p.x >> 2);
  const start = cell(SPAWN);
  dist[start] = 0;
  const heap = new Heap();
  heap.push(start, 0);
  while (heap.size) {
    const [i, d] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % CW;
    const y = (i / CW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
      const j = ny * CW + nx;
      const nd = d + cost(j);
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = i;
        heap.push(j, nd);
      }
    }
  }
  /** 画一段 2 格宽的直线路（2×2 笔刷，斜线也是连通的） */
  const paint = (a: Pt, b: Pt) => {
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
    for (let i = 0; i <= n; i++) {
      const px = Math.round(a.x + ((b.x - a.x) * i) / n);
      const py = Math.round(a.y + ((b.y - a.y) * i) / n);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const qx = px + ox;
        const qy = py + oy;
        if (inMap(qx, qy) && !(flags[idx(qx, qy)] & F_BUILD)) flags[idx(qx, qy)] |= F_ROAD;
      }
    }
  };
  const center = (c: number): Pt => ({ x: (c % CW) * C + 1, y: Math.floor(c / CW) * C + 1 });
  for (const n of NODES) {
    if (n.town && !n.pond && n.sprite !== 'farm') continue;
    const s = standTile(n);
    // 粗网格上的折线每隔几个点取一个再连直线，路就不是一格一格的台阶了
    const pts: Pt[] = [s];
    for (let c = cell(s); c !== -1; c = prev[c]) pts.push(center(c));
    let last = pts[0];
    for (let i = 3; i < pts.length; i += 3) {
      paint(last, pts[i]);
      last = pts[i];
    }
    paint(last, pts[pts.length - 1]);
  }
}
export const isRoad = (x: number, y: number) => (flags[idx(x, y)] & F_ROAD) !== 0;

/** 粗网格能不能走：中心能走，或者格子里有路（桥） */
const coarseOpen = new Uint8Array(CW * CH);
for (let c = 0; c < CW * CH; c++) {
  let open = !blockedG[coarseGround[c]];
  const x0 = (c % CW) * C;
  const y0 = Math.floor(c / CW) * C;
  for (let k = 0; k < C * C && !open; k++) {
    const x = x0 + (k % C);
    const y = y0 + ((k / C) | 0);
    if (inMap(x, y) && (flags[idx(x, y)] & F_ROAD)) open = 1 as unknown as boolean;
  }
  coarseOpen[c] = open ? 1 : 0;
}
/** 粗格子里有路：粗寻路时便宜一半，远路基本沿着路走 */
const coarseRoad = new Uint8Array(CW * CH);
for (let c = 0; c < CW * CH; c++) {
  const x0 = (c % CW) * C;
  const y0 = Math.floor(c / CW) * C;
  for (let k = 0; k < C * C; k++) {
    const x = x0 + (k % C);
    const y = y0 + ((k / C) | 0);
    if (inMap(x, y) && (flags[idx(x, y)] & F_ROAD)) { coarseRoad[c] = 1; break; }
  }
}
const coarseG = new Float32Array(CW * CH);
const coarseSeen = new Uint32Array(CW * CH);
const coarsePrev = new Int32Array(CW * CH);
let coarseId = 0;
const cellOf = (p: Pt) => (clampY(p.y) >> 2) * CW + (clampX(p.x) >> 2);

/** 粗网格 A*：返回从起点格到终点格的格子序列（含两端） */
function coarsePath(from: Pt, to: Pt): number[] | null {
  const id = ++coarseId;
  const start = cellOf(from);
  const goal = cellOf(to);
  const gx = goal % CW;
  const gy = (goal / CW) | 0;
  const h = (i: number) => {
    const dx = Math.abs((i % CW) - gx);
    const dy = Math.abs(((i / CW) | 0) - gy);
    return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.55;
  };
  coarseSeen[start] = id;
  coarseG[start] = 0;
  coarsePrev[start] = -1;
  const heap = new Heap();
  heap.push(start, h(start));
  while (heap.size) {
    const [i, f] = heap.pop();
    if (i === goal) break;
    const g0 = coarseG[i];
    if (f - h(i) > g0 + 1e-3) continue;
    const x = i % CW;
    const y = (i / CW) | 0;
    for (const [dx, dy, c] of COARSE_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
      const j = ny * CW + nx;
      if (!coarseOpen[j] && j !== goal) continue;
      if (dx && dy && (!coarseOpen[y * CW + nx] || !coarseOpen[ny * CW + x])) continue;
      const ng = g0 + c * (coarseRoad[j] ? 0.55 : 1);
      if (coarseSeen[j] === id && coarseG[j] <= ng + 1e-3) continue;
      coarseSeen[j] = id;
      coarseG[j] = ng;
      coarsePrev[j] = i;
      heap.push(j, ng + h(j));
    }
  }
  if (coarseSeen[goal] !== id) return null;
  const out: number[] = [];
  for (let c = goal; c !== -1; c = coarsePrev[c]) out.push(c);
  return out.reverse();
}

/** 粗格子里离中心最近的能走的细格 */
function walkableIn(c: number): Pt | null {
  const cx = (c % CW) * C + 2;
  const cy = Math.floor(c / CW) * C + 2;
  // 有路就落在路上：路都是连通的，不会落到河对岸
  if (coarseRoad[c]) {
    for (let k = 0; k < C * C; k++) {
      const x = cx - 2 + (k % C);
      const y = cy - 2 + ((k / C) | 0);
      if (inMap(x, y) && (flags[idx(x, y)] & F_ROAD) && isWalkable(x, y)) return { x, y };
    }
  }
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isWalkable(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
    }
  }
  return null;
}
const COARSE_DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// ---- 5. 按块懒加载的地面 ----

export const CHUNK = 32;
const CHUNKS_X = Math.ceil(MAP_W / CHUNK);
const CHUNKS_Y = Math.ceil(MAP_H / CHUNK);
const ground = new Uint8Array(N);
const groundDone = new Uint8Array(CHUNKS_X * CHUNKS_Y);

function groundFor(x: number, y: number): Ground {
  const r = REGION_IDS[regionIdx(x, y)];
  let g = rawGround(x, y);
  // 区域交界处用抖动采样，让两种地面互相渗透一点
  if (!blockedG[G[g]] && g !== 'cobble' && g !== 'beach') {
    const jr = REGION_IDS[regionIdx(x + Math.round((hash(x, y, 41) - 0.5) * 6), y + Math.round((hash(x, y, 42) - 0.5) * 6))];
    if (jr !== r) g = feature(x, y, r) ?? baseGround(x, y, jr);
  }
  const i = idx(x, y);
  if ((flags[i] & F_NEAR) && blockedG[G[g]]) {
    const pondNode = PONDS.some((p) => Math.abs(p.n.x - x) <= 3 && y < p.n.y && y >= p.n.y - 2);
    if (!pondNode) g = inPlaza(x, y) ? 'cobble' : baseGround(x, y, r);
  }
  for (const F of FARMS) {
    if (x >= F.x0 && x <= F.x1 && y >= F.y0 && y <= F.y1 && !(Math.abs(x - F.node.x) <= 2 && y >= F.node.y - 2 && y <= F.node.y + 2)) {
      g = (y - F.y0) % 3 === 2 ? 'grass' : 'farm';
    }
  }
  if ((flags[i] & F_ROAD) && g !== 'cobble' && g !== 'ocean') {
    if (blockedG[G[g]]) return g === 'cliff' ? 'gravel' : 'bridge';
    return r === 'snow' ? 'roadsnow' : r === 'coast' ? 'roadsand' : r === 'lava' || r === 'abyss' || r === 'highland' ? 'roaddark' : 'road';
  }
  return g;
}

function ensureGround(ci: number) {
  if (groundDone[ci]) return;
  groundDone[ci] = 1;
  const x0 = (ci % CHUNKS_X) * CHUNK;
  const y0 = Math.floor(ci / CHUNKS_X) * CHUNK;
  for (let y = y0; y < Math.min(MAP_H, y0 + CHUNK); y++) {
    for (let x = x0; x < Math.min(MAP_W, x0 + CHUNK); x++) ground[idx(x, y)] = G[groundFor(x, y)];
  }
}
const chunkOf = (x: number, y: number) => Math.floor(y / CHUNK) * CHUNKS_X + Math.floor(x / CHUNK);

export function groundIndex(x: number, y: number) {
  ensureGround(chunkOf(x, y));
  return ground[idx(x, y)];
}
export const groundAt = (x: number, y: number): Ground => GROUNDS[groundIndex(x, y)];

/** 世界地图缩略图：不触发分块生成，直接按规则算颜色用的地面 */
export function overviewGround(x: number, y: number): Ground {
  const i = idx(x, y);
  if ((flags[i] & F_BUILD)) return 'cliff';
  if ((flags[i] & F_ROAD)) return 'road';
  return rawGround(x, y);
}

// ---- 6. 装饰物（同样按块懒加载） ----

export type PropKind =
  | 'oak' | 'birch' | 'maple' | 'pine' | 'snowpine' | 'redwood' | 'giant' | 'deadtree' | 'palm' | 'cactus' | 'charred'
  | 'rock' | 'boulder' | 'snowrock' | 'spike' | 'crystal' | 'stalagmite' | 'icecrystal'
  | 'bush' | 'flowers' | 'tuft' | 'fern' | 'mushroom' | 'glowshroom' | 'reeds' | 'shell' | 'bones' | 'drift' | 'ember'
  | 'grave' | 'cross' | 'lamp' | 'barrel' | 'crate' | 'bench' | 'fence' | 'hay' | 'scarecrow' | 'dummy' | 'banner' | 'cart';

export interface Prop { kind: PropKind; x: number; y: number }

export const BLOCKING = new Set<PropKind>([
  'oak', 'birch', 'maple', 'pine', 'snowpine', 'redwood', 'giant', 'deadtree', 'palm', 'cactus', 'charred',
  'rock', 'boulder', 'snowrock', 'spike', 'crystal', 'stalagmite', 'icecrystal', 'grave', 'cross',
  'barrel', 'crate', 'fence', 'hay', 'dummy', 'cart', 'lamp',
]);

/** 手工摆的城镇小物件（按「镇中心 = 167,170」的坐标） */
const TOWN_PROPS_LOCAL: [PropKind, number, number][] = [
  ['lamp', 146, 149], ['lamp', 189, 149], ['lamp', 146, 188], ['lamp', 189, 188], ['lamp', 163, 160], ['lamp', 171, 160],
  ['lamp', 163, 174], ['lamp', 171, 174], ['lamp', 156, 158], ['lamp', 179, 158],
  ['barrel', 154, 154], ['barrel', 154, 155], ['crate', 155, 155], ['barrel', 178, 154], ['crate', 179, 156],
  ['bench', 161, 172], ['bench', 172, 172], ['bench', 161, 165], ['bench', 172, 165],
  ['banner', 157, 157], ['banner', 167, 157], ['crate', 160, 179], ['barrel', 148, 180], ['cart', 147, 176],
  ['dummy', 179, 184], ['dummy', 183, 184], ['dummy', 185, 182], ['hay', 186, 186], ['hay', 187, 186],
  ['hay', 131, 199], ['hay', 132, 199], ['scarecrow', 142, 194], ['scarecrow', 156, 203],
];
for (let x = 177; x <= 188; x++) TOWN_PROPS_LOCAL.push(['fence', x, 187]);
// 每块田上下两排篱笆
for (const { local: f } of FARMS) {
  for (let x = f.x0 - 1; x <= f.x1 + 1; x++) TOWN_PROPS_LOCAL.push(['fence', x, f.y0 - 1], ['fence', x, f.y1 + 1]);
}
const TOWN_PROPS = new Map<number, PropKind>();
for (const [k, x, y] of TOWN_PROPS_LOCAL) TOWN_PROPS.set(idx(tx(x), ty(y)), k);

function wildProp(x: number, y: number, r: RegionId, g: Ground): PropKind | null {
  const p = hash(x, y, 1);
  if (p > 0.45) return null;
  if (g === 'beach') return p < 0.03 ? 'shell' : p < 0.04 ? 'palm' : null;
  if (g === 'ice' || g === 'farm' || g === 'bridge') return null;
  const f = fbm(x, y, 21, 16);
  switch (r) {
    case 'town':
      if (f > 0.64 && p < 0.3) return 'oak';
      return p < 0.03 ? 'flowers' : p < 0.07 ? 'tuft' : p < 0.08 ? 'bush' : null;
    case 'woodland': {
      const dens = f > 0.5 ? 0.42 : 0.04;
      if (p < dens) {
        const s = fbm(x, y, 31, 30);
        return s < 0.38 ? 'pine' : s < 0.6 ? 'oak' : s < 0.78 ? 'birch' : 'maple';
      }
      return p < dens + 0.02 ? 'fern' : p < dens + 0.03 ? 'flowers' : p < dens + 0.035 ? 'mushroom' : p < dens + 0.045 ? 'bush' : null;
    }
    case 'giantwood':
      if (f > 0.45 && p < 0.08) return 'giant';
      if (p < (f > 0.45 ? 0.26 : 0.05)) return 'redwood';
      return p < 0.32 ? 'fern' : p < 0.33 ? 'mushroom' : null;
    case 'snow':
      if (p < (f > 0.55 ? 0.34 : 0.02)) return 'snowpine';
      return p < 0.36 ? 'drift' : p < 0.37 ? 'snowrock' : p < 0.373 ? 'icecrystal' : null;
    case 'highland':
      if (p < (f > 0.6 ? 0.1 : 0.02)) return 'boulder';
      return p < 0.13 ? 'rock' : p < 0.15 ? 'tuft' : null;
    case 'coast':
      return p < 0.012 ? 'palm' : p < 0.03 ? 'cactus' : p < 0.045 ? 'bush' : p < 0.055 ? 'rock' : p < 0.06 ? 'bones' : null;
    case 'lava':
      return p < 0.03 ? 'charred' : p < 0.06 ? 'spike' : p < 0.09 ? 'ember' : p < 0.1 ? 'bones' : null;
    case 'abyss':
      if (p < (f > 0.5 ? 0.08 : 0.025)) return 'crystal';
      return p < 0.11 ? 'stalagmite' : p < 0.14 ? 'glowshroom' : p < 0.15 ? 'bones' : null;
    case 'swamp':
      if (p < (f > 0.55 ? 0.14 : 0.04)) return 'deadtree';
      return p < 0.21 ? 'reeds' : p < 0.24 ? 'mushroom' : p < 0.26 ? (hash(x, y, 3) < 0.6 ? 'grave' : 'cross') : null;
  }
}

/** 地图边缘一圈用本区域的树或石头围起来 */
const EDGE_WALL: Record<RegionId, PropKind> = {
  town: 'oak', snow: 'snowpine', highland: 'boulder', coast: 'palm', lava: 'spike', abyss: 'stalagmite',
  swamp: 'deadtree', woodland: 'pine', giantwood: 'redwood',
};

const propsDone = new Uint8Array(CHUNKS_X * CHUNKS_Y);
const chunkProps: Prop[][] = Array.from({ length: CHUNKS_X * CHUNKS_Y }, () => []);

function ensureProps(ci: number) {
  if (propsDone[ci]) return;
  propsDone[ci] = 1;
  ensureGround(ci);
  const x0 = (ci % CHUNKS_X) * CHUNK;
  const y0 = Math.floor(ci / CHUNKS_X) * CHUNK;
  const out = chunkProps[ci];
  for (let y = y0; y < Math.min(MAP_H, y0 + CHUNK); y++) {
    for (let x = x0; x < Math.min(MAP_W, x0 + CHUNK); x++) {
      const i = idx(x, y);
      if ((flags[i] & F_BUILD) || (flags[i] & F_ROAD)) continue;
      let k: PropKind | null | undefined = TOWN_PROPS.get(i);
      if (!k) {
        if ((flags[i] & F_NEAR) || blockedG[ground[i]] || FARMS.some((F) => x >= F.x0 && x <= F.x1 && y >= F.y0 && y <= F.y1)) continue;
        const g = GROUNDS[ground[i]];
        if (g === 'cobble' || (Math.abs(x - SPAWN.x) < 4 && Math.abs(y - SPAWN.y) < 4)) continue;
        const r = REGION_IDS[regionIdx(x, y)];
        const edge = x < 2 || y < 2 || y >= MAP_H - 2;
        k = edge ? EDGE_WALL[r] : wildProp(x, y, r, g);
      }
      if (!k) continue;
      out.push({ kind: k, x, y });
      if (BLOCKING.has(k)) flags[i] |= F_PROP;
    }
  }
}

export function propsInChunk(cx: number, cy: number): Prop[] {
  if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) return [];
  const ci = cy * CHUNKS_X + cx;
  ensureProps(ci);
  return chunkProps[ci];
}

// ---- 行走与寻路 ----

export function isWalkable(x: number, y: number) {
  if (!inMap(x, y)) return false;
  ensureProps(chunkOf(x, y));
  const i = idx(x, y);
  return !blockedG[ground[i]] && !(flags[i] & F_BUILD) && !(flags[i] & F_PROP);
}

const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
/** 单次细寻路最多展开的格子数：大地图上不能整图搜索，远路靠粗网格走廊分段 */
const MAX_NODES = 400_000;

/** A* 寻路（8 方向，斜走不切墙角）；终点不可走或走不到返回 null。返回值不含起点。 */
export function findPath(from: Pt, to: Pt, maxNodes = MAX_NODES): Pt[] | null {
  if (!isWalkable(to.x, to.y) || !inMap(from.x, from.y)) return null;
  const far = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) > 48;
  // 远路：先在粗网格上找走廊，再沿走廊一段一段细找；绕湖绕河也很快
  if (far) {
    const cp = coarsePath(from, to);
    if (cp) {
      const out: Pt[] = [];
      let cur = from;
      let ok = true;
      let k = 0;
      while (ok && k < cp.length - 1) {
        // 下一个落脚点：走廊上往前 8 格；那格走不通就再往前挪，最多试 4 次
        let seg: Pt[] | null = null;
        let wp: Pt | null = null;
        let next = k;
        for (let tries = 0; tries < 4 && !seg; tries++) {
          next = Math.min(cp.length - 1, next + 8);
          wp = next === cp.length - 1 ? to : walkableIn(cp[next]);
          if (wp) seg = astar(cur, wp, 80_000);
          if (next === cp.length - 1) break;
        }
        if (!seg || !wp) ok = false;
        else {
          out.push(...seg);
          cur = wp;
          k = next;
        }
      }
      if (ok) return out;
    }
  }
  return astar(from, to, maxNodes);
}

function astar(from: Pt, to: Pt, maxNodes: number): Pt[] | null {
  // 只记搜过的格子（不再给整张地图开数组，5088 地图那样要 300MB）
  const gBuf = new Map<number, number>();
  const prevBuf = new Map<number, number>();
  const start = idx(from.x, from.y);
  const goal = idx(to.x, to.y);
  const h = (i: number) => {
    const dx = Math.abs((i % MAP_W) - to.x);
    const dy = Math.abs(((i / MAP_W) | 0) - to.y);
    return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 1.1;
  };
  gBuf.set(start, 0);
  prevBuf.set(start, -1);
  const open = new Heap();
  open.push(start, h(start));
  let expanded = 0;
  while (open.size) {
    const [cur, f] = open.pop();
    if (cur === goal) break;
    const g0 = gBuf.get(cur)!;
    if (f - h(cur) > g0 + 1e-3) continue;
    if (++expanded > maxNodes) return null;
    const x = cur % MAP_W;
    const y = (cur / MAP_W) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(nx, ny)) continue;
      if (dx && dy && (!isWalkable(x + dx, y) || !isWalkable(x, y + dy))) continue;
      const j = idx(nx, ny);
      const ng = g0 + c;
      const old = gBuf.get(j);
      if (old !== undefined && old <= ng + 1e-3) continue;
      gBuf.set(j, ng);
      prevBuf.set(j, cur);
      open.push(j, ng + h(j));
    }
  }
  if (!gBuf.has(goal)) return null;
  const path: Pt[] = [];
  for (let k = goal; k !== start; k = prevBuf.get(k)!) path.push({ x: k % MAP_W, y: (k / MAP_W) | 0 });
  return path.reverse();
}

// ---- 镇上走动的村民 ----

export type WandererKind = 'villager' | 'villager2' | 'villager3' | 'guard' | 'merchant' | 'sheep' | 'cow' | 'chicken';

const W = (kind: WandererKind, x: number, y: number, radius: number) => ({ kind, x: tx(x), y: ty(y), radius });
export const WANDERERS = [
  W('villager', 160, 162, 4), W('villager2', 175, 162, 4), W('villager3', 165, 176, 3), W('villager', 180, 176, 3),
  W('villager2', 152, 174, 3), W('merchant', 154, 181, 2), W('merchant', 158, 181, 1), W('guard', 167, 159, 1),
  W('guard', 167, 188, 2), W('villager3', 140, 170, 4), W('sheep', 120, 186, 3), W('sheep', 123, 189, 3),
  W('cow', 118, 192, 2), W('chicken', 132, 202, 2), W('chicken', 134, 203, 2),
];
