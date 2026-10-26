import { BAR_VALUE, dungeonMonsterId, EQUIP_TYPES, ITEMS, keyId, MAT_LINE_IDS, SCROLL_TOWN, TIERS } from './data';
import { SPECIES } from './bestiary';
import { qid, rollQuality } from './quality';
import { nextRandom } from './rng';
import type { DungeonGate, MonsterDef } from './types';
import { tl } from '../i18n';

/*
 * 地下副本（用户 10-25，参考阿尔比恩的绿洞/蓝洞）。
 * 绿洞：单人地下副本，1-4 层，一个人或组队都能进；蓝洞：多人地下副本，2-7 层，必须组队。
 * 用钥匙在地表开出洞口（30 分钟后消失），进去后每层地形、路线、怪物都按洞口的随机种子现生成，
 * 每次都不一样；同一个洞口队友进去看到的一样。
 * 要清完所有层的所有怪（最后一层是首领）才能打开最后的宝箱建筑。宝箱分绿/蓝/紫/金。
 */

export const GATE_MS = 30 * 60_000;
/** 每人同时最多开着几个洞口、两次开洞口之间的冷却（用户 10-25：不能开太多） */
export const GATE_MAX = 2;
export const GATE_CD = 5 * 60_000;
/** 通关（开了宝箱）后洞口只再留多久（用户 10-26） */
export const GATE_AFTER_CLEAR = 60_000;
/** 站在洞口几格内才能进 */
export const GATE_REACH = 3;
/** 副本里走一格多少毫秒（每秒 4 格，和步行一样，副本里不能骑坐骑） */
export const DG_TILE_MS = 250;
/** 绿洞 1-4 层、蓝洞 2-7 层的概率 */
export const FLOOR_ODDS: Record<'green' | 'blue', [number, number][]> = {
  green: [[1, 45], [2, 30], [3, 17], [4, 8]],
  blue: [[2, 34], [3, 26], [4, 18], [5, 12], [6, 7], [7, 3]],
};
/** 蓝洞协战：队伍里每多一个人伤害 +12%、受到伤害 -6%（最多算 4 个队友） */
export const COOP_DMG = 0.12;
export const COOP_DEF = 0.06;
export const coopMates = (party: number) => Math.max(0, Math.min(4, party - 1));

export const DG_NAME = { green: tl('绿洞'), blue: tl('蓝洞') } as const;
export const CHEST_Q = 4;

/** 一个可复现的随机数流 */
function stream(seed: number) {
  let st = seed | 0;
  return () => {
    const [r, next] = nextRandom(st);
    st = next;
    return r;
  };
}
const pickW = <T,>(r: number, list: [T, number][]) => {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [v, w] of list) if ((x -= w) < 0) return v;
  return list[list.length - 1][0];
};

export function rollFloors(kind: 'green' | 'blue', r: number) {
  return pickW(r, FLOOR_ODDS[kind]);
}

// ---- 地形 ----

export const DG_THEMES = ['earth', 'ice', 'lava', 'crystal', 'fungus', 'crypt'] as const;
export type DgTheme = (typeof DG_THEMES)[number];
export interface DgStop {
  x: number;
  y: number;
  kind: 'mob' | 'stairs' | 'chest';
  monster?: string;
}
export interface DgFloor {
  w: number;
  h: number;
  /** 1 = 能走的地面，0 = 岩壁 */
  grid: Uint8Array;
  theme: DgTheme;
  start: { x: number; y: number };
  /** 按顺序要去的停靠点：怪（打完才走）、最后是楼梯或宝箱 */
  stops: DgStop[];
  /** legs[i]：从上一个位置走到第 i 个停靠点旁边的路径（不含起点） */
  legs: { x: number; y: number }[][];
  decor: { x: number; y: number; kind: number }[];
  /** 最后一层：首领守着的宝箱位置 */
  chest?: { x: number; y: number };
  stairs?: { x: number; y: number };
}

const W = 58;
const H = 46;
const floorCache = new Map<string, DgFloor>();

/** 各阶能出现在副本里的怪：同阶的普通、精英、首领（世界首领、活动首领、野马除外） */
const POOLS = new Map<string, string[]>();
function pool(tier: number, rank: MonsterDef['rank']) {
  const k = `${tier}${rank}`;
  let p = POOLS.get(k);
  if (!p) {
    p = SPECIES.filter((sp) => sp.tier === tier && sp.rank === rank && !sp.world && !sp.event && !sp.horse && sp.id !== 'dummy').map((sp) => sp.id);
    // 某阶没有这一级的怪就用普通的顶上
    if (!p.length) p = SPECIES.filter((sp) => sp.tier === tier && !sp.world && !sp.event && !sp.horse).map((sp) => sp.id);
    POOLS.set(k, p);
  }
  return p;
}

const idx = (x: number, y: number) => y * W + x;

function bfs(grid: Uint8Array, from: { x: number; y: number }) {
  const dist = new Int32Array(W * H).fill(-1);
  const q = [idx(from.x, from.y)];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (!grid[j] || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

/** 最短路径（不含起点），走到 to 本身 */
function pathTo(grid: Uint8Array, from: { x: number; y: number }, to: { x: number; y: number }) {
  const dist = bfs(grid, to);
  const out: { x: number; y: number }[] = [];
  let x = from.x;
  let y = from.y;
  if (dist[idx(x, y)] < 0) return out;
  while (x !== to.x || y !== to.y) {
    const d = dist[idx(x, y)];
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (dist[idx(nx, ny)] === d - 1) { x = nx; y = ny; moved = true; break; }
    }
    if (!moved) break;
    out.push({ x, y });
  }
  return out;
}

interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number }

/**
 * 生成一层：随机放 6-10 个大小不一的洞室，用弯曲的通道连起来（再加一两条环路），
 * 墙边随机磨掉一些让边缘像天然洞穴。起点是第一个洞室，终点是离起点最远的洞室。
 */
export function dungeonFloor(gate: DungeonGate, floor: number): DgFloor {
  const key = `${gate.id}:${gate.seed}:${floor}`;
  const hit = floorCache.get(key);
  if (hit) return hit;
  const rand = stream((gate.seed ^ Math.imul(floor + 1, 0x9e3779b1)) | 0);
  const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const grid = new Uint8Array(W * H);
  const last = floor === gate.floors - 1;
  // 洞室
  const rooms: Room[] = [];
  const want = ri(6, 9) + (gate.kind === 'blue' ? 1 : 0);
  for (let tries = 0; rooms.length < want && tries < 400; tries++) {
    const w = ri(6, 12);
    const h = ri(5, 9);
    const x = ri(2, W - w - 3);
    const y = ri(2, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  for (const r of rooms) {
    // 洞室是圆角的不规则形状
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const dx = (x + 0.5 - (r.x + r.w / 2)) / (r.w / 2);
        const dy = (y + 0.5 - (r.y + r.h / 2)) / (r.h / 2);
        if (dx * dx + dy * dy <= 1.15 + (rand() - 0.5) * 0.35) grid[idx(x, y)] = 1;
      }
    }
    grid[idx(r.cx, r.cy)] = 1;
  }
  // 通道：最小生成树连起来，再随机加一两条环路；通道一路随机拐弯
  const carve = (a: Room, b: Room) => {
    let x = a.cx;
    let y = a.cy;
    let guard = 0;
    while ((x !== b.cx || y !== b.cy) && guard++ < 400) {
      const toward = rand() < 0.75;
      if (toward) {
        if (x !== b.cx && (y === b.cy || rand() < 0.5)) x += Math.sign(b.cx - x);
        else y += Math.sign(b.cy - y);
      } else if (rand() < 0.5) x = Math.max(2, Math.min(W - 3, x + (rand() < 0.5 ? 1 : -1)));
      else y = Math.max(2, Math.min(H - 3, y + (rand() < 0.5 ? 1 : -1)));
      grid[idx(x, y)] = 1;
      // 通道两格宽
      if (x + 1 < W - 1) grid[idx(x + 1, y)] = 1;
      if (y + 1 < H - 1) grid[idx(x, y + 1)] = 1;
    }
  };
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best: [number, number, number] | null = null;
    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy);
        if (!best || d < best[2]) best = [i, j, d];
      }
    }
    if (!best) break;
    carve(rooms[best[0]], rooms[best[1]]);
    inTree.add(best[1]);
  }
  for (let k = ri(1, 2); k > 0 && rooms.length > 3; k--) carve(rooms[ri(0, rooms.length - 1)], rooms[ri(0, rooms.length - 1)]);
  // 墙边磨一磨
  const edge: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (grid[idx(x, y)]) continue;
      const n = grid[idx(x + 1, y)] + grid[idx(x - 1, y)] + grid[idx(x, y + 1)] + grid[idx(x, y - 1)];
      if (n >= 2 && rand() < 0.35) edge.push(idx(x, y));
    }
  }
  for (const i of edge) grid[i] = 1;
  // 起点、终点
  const start = { x: rooms[0].cx, y: rooms[0].cy };
  const dist0 = bfs(grid, start);
  let endRoom = rooms[rooms.length - 1];
  for (const r of rooms) if (dist0[idx(r.cx, r.cy)] > dist0[idx(endRoom.cx, endRoom.cy)]) endRoom = r;
  // 怪：除起点外每个洞室 1-3 只（终点洞室另算）
  const used = new Set<number>([idx(start.x, start.y)]);
  const spot = (r: Room) => {
    for (let t = 0; t < 40; t++) {
      const x = ri(r.x + 1, r.x + r.w - 2);
      const y = ri(r.y + 1, r.y + r.h - 2);
      const i = idx(x, y);
      if (!grid[i] || dist0[i] < 0) continue;
      if ([...used].some((u) => Math.abs((u % W) - x) + Math.abs(((u / W) | 0) - y) < 3)) continue;
      used.add(i);
      return { x, y };
    }
    return null;
  };
  const eliteChance = 0.15 + 0.03 * floor + (gate.kind === 'blue' ? 0.05 : 0);
  const mob = (rank: MonsterDef['rank']) => {
    const p = pool(gate.tier, rank);
    return dungeonMonsterId(gate.kind, gate.tier, floor, rank, p[Math.floor(rand() * p.length)]);
  };
  const mobs: DgStop[] = [];
  for (const r of rooms) {
    if (r === rooms[0] || r === endRoom) continue;
    for (let k = ri(1, 3); k > 0; k--) {
      const at = spot(r);
      if (at) mobs.push({ ...at, kind: 'mob', monster: mob(rand() < eliteChance ? 'elite' : 'normal') });
    }
  }
  // 终点洞室：中间是楼梯或宝箱；最后一层首领守在宝箱前，其他层一只精英守楼梯
  const end = { x: endRoom.cx, y: endRoom.cy };
  used.add(idx(end.x, end.y));
  const guards: DgStop[] = [];
  const g = (() => {
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, 2], [0, -2], [-2, 1], [2, -1]]) {
      const x = end.x + dx;
      const y = end.y + dy;
      if (grid[idx(x, y)] && dist0[idx(x, y)] >= 0) return { x, y };
    }
    return { x: end.x, y: end.y };
  })();
  used.add(idx(g.x, g.y));
  guards.push({ ...g, kind: 'mob', monster: mob(last ? 'boss' : 'elite') });
  for (let k = last ? ri(1, 2) : ri(0, 1); k > 0; k--) {
    const at = spot(endRoom);
    if (at) guards.unshift({ ...at, kind: 'mob', monster: mob('normal') });
  }
  // 路线：从起点每次去最近的下一只怪，终点洞室的怪最后打，最后走到楼梯/宝箱
  const order: DgStop[] = [];
  let cur = start;
  const left = [...mobs];
  while (left.length) {
    const d = bfs(grid, cur);
    left.sort((a, b) => d[idx(a.x, a.y)] - d[idx(b.x, b.y)]);
    const nxt = left.shift()!;
    order.push(nxt);
    cur = nxt;
  }
  order.push(...guards, { ...end, kind: last ? 'chest' : 'stairs' });
  // 每段路：走到停靠点旁边一格（怪和宝箱不能踩上去）
  const legs: { x: number; y: number }[][] = [];
  cur = start;
  for (const st of order) {
    const p = pathTo(grid, cur, st);
    if (p.length > 1) p.pop();
    legs.push(p);
    cur = p.length ? p[p.length - 1] : cur;
  }
  // 装饰：靠墙的地面上随机摆
  const decor: DgFloor['decor'] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (!grid[i] || used.has(i)) continue;
      const nearWall = !grid[idx(x + 1, y)] || !grid[idx(x - 1, y)] || !grid[idx(x, y - 1)] || !grid[idx(x, y + 1)];
      if (nearWall && rand() < 0.08) decor.push({ x, y, kind: Math.floor(rand() * 4) });
    }
  }
  const theme = DG_THEMES[Math.floor(rand() * DG_THEMES.length)];
  const F: DgFloor = { w: W, h: H, grid, theme, start, stops: order, legs, decor, ...(last ? { chest: end } : { stairs: end }) };
  if (floorCache.size > 24) floorCache.clear();
  floorCache.set(key, F);
  return F;
}

export const legMs = (F: DgFloor, i: number) => Math.max(300, (F.legs[i]?.length ?? 0) * DG_TILE_MS);
/** 这个副本一共多少只怪（进度显示用） */
export function totalMobs(gate: DungeonGate) {
  let n = 0;
  for (let f = 0; f < gate.floors; f++) n += dungeonFloor(gate, f).stops.filter((s) => s.kind === 'mob').length;
  return n;
}

// ---- 宝箱 ----

export const CHEST_NAME = [tl('绿色宝箱'), tl('蓝色宝箱'), tl('紫色宝箱'), tl('金色宝箱')] as const;
export const CHEST_COLOR = ['#5ad06a', '#4a9aff', '#c06aff', '#ffc840'];

/** 宝箱品质概率：按「难度分」在几个锚点之间插值。绿洞分 = 层数，蓝洞 2 层约 3.8、7 层 8.5 */
const Q_ANCHORS: [number, number[]][] = [[1, [70, 25, 5, 0]], [4, [36, 40, 19, 5]], [8.5, [5, 25, 40, 30]]];
export function chestOdds(kind: 'green' | 'blue', floors: number): number[] {
  const score = kind === 'green' ? floors : 3.8 + (floors - 2) * 0.94;
  for (let i = 1; i < Q_ANCHORS.length; i++) {
    const [s0, a] = Q_ANCHORS[i - 1];
    const [s1, b] = Q_ANCHORS[i];
    if (score <= s1) {
      const t = Math.max(0, (score - s0) / (s1 - s0));
      return a.map((v, k) => v + (b[k] - v) * t);
    }
  }
  return Q_ANCHORS[Q_ANCHORS.length - 1][1];
}
export function rollChestQuality(kind: 'green' | 'blue', floors: number, r: number) {
  const o = chestOdds(kind, floors);
  return pickW(r, o.map((w, i) => [i, w] as [number, number]));
}

const Q_COINS = [1, 1.7, 2.8, 4.5];
const Q_STONE = [0.1, 0.18, 0.3, 0.45];
const Q_GEAR_TRIES = [1, 2, 3, 4];
const Q_UP1 = [0.02, 0.03, 0.05, 0.08];
const Q_UP2 = [0, 0.002, 0.005, 0.01];
const Q_KEY = [0.06, 0.1, 0.15, 0.22];
const Q_POTION = [0.3, 0.4, 0.5, 0.6];
const Q_EYE = [0.06, 0.1, 0.16, 0.26];
const POTIONS = () => Object.values(ITEMS).filter((i) => i.category === 'potion').sort((a, b) => a.value - b.value).map((i) => i.id);
const GEAR = EQUIP_TYPES.filter((e) => !e.stats.speed && e.slot !== 'ring' && e.slot !== 'neck').map((e) => e.key);

/**
 * 开宝箱：每一项单独随机，不一定都有，运气差会很穷。金币一定有。
 * 装备多是钥匙本阶，有时低一阶；高一阶、高两阶很难出（T6 绿洞很难出 T7 以上）。
 */
export function rollChest(gate: DungeonGate, q: number, rand: () => number): Record<string, number> {
  const t = gate.tier;
  const n = t + 1;
  const T = TIERS[t];
  const v = BAR_VALUE[t];
  const out: Record<string, number> = {};
  const add = (id: string, k: number) => { if (ITEMS[id] && k > 0) out[id] = (out[id] ?? 0) + k; };
  const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const qm = Q_COINS[q];
  add('coins', Math.round(v * (15 + rand() * 45) * qm * (gate.kind === 'blue' ? 1.3 : 1)));
  // 材料：挑 1-3 种本阶材料
  if (rand() < 0.6 + 0.1 * q) {
    const mats = [`${T.id}_bar`, T.ore, `${T.wood}_log`, `hide_${n}`, `cotton_${n}`, `core_${n}`, ...MAT_LINE_IDS.map((l) => `${l}_${n}`)].filter((id) => ITEMS[id]);
    for (let k = ri(1, 3); k > 0; k--) add(mats[Math.floor(rand() * mats.length)], Math.round(ri(3, 10) * qm));
  }
  if (rand() < 0.55 + 0.1 * q) add(`enhshard_${n}`, Math.round(ri(2, 6) * qm));
  if (rand() < Q_STONE[q]) add(`enhstone_${n}`, q >= 3 ? ri(1, 2) : 1);
  if (rand() < 0.25) add(SCROLL_TOWN, ri(1, 2));
  for (let k = 0; k < Q_GEAR_TRIES[q]; k++) {
    if (rand() >= 0.35) continue;
    const r = rand();
    const gt = r < Q_UP2[q] ? t + 2 : r < Q_UP2[q] + Q_UP1[q] ? t + 1 : r < 0.3 ? t - 1 : t;
    const tier = Math.max(0, Math.min(7, gt));
    const base = `${TIERS[tier].id}_${GEAR[Math.floor(rand() * GEAR.length)]}`;
    if (!ITEMS[base]) continue;
    // 紫箱、金箱多抽几次品质取最好的
    let best = 0;
    for (let j = 0; j < (q >= 3 ? 3 : q >= 2 ? 2 : 1); j++) best = Math.max(best, rollQuality(tier, rand()));
    add(qid(base, best), 1);
  }
  if (rand() < Q_POTION[q]) {
    const p = POTIONS();
    if (p.length) add(p[Math.min(p.length - 1, Math.round((t / 7) * (p.length - 1)))], ri(2, 5));
  }
  if (rand() < Q_KEY[q]) {
    const kind = rand() < 0.65 ? gate.kind : gate.kind === 'green' ? 'blue' : 'green';
    const kt = rand() < 0.12 ? Math.min(7, t + 1) : t;
    add(keyId(kind, kt), 1);
  }
  // 洞察之瞳（10-26）：本阶的不常出，低阶的多一些（T1-T3 只能这样得到）
  if (rand() < Q_EYE[q] * (gate.kind === 'blue' ? 1.3 : 1)) add(`sageeye_${n}`, q >= 3 ? ri(1, 2) : 1);
  if (t > 0 && rand() < Q_EYE[q] * 1.6) add(`sageeye_${ri(1, t)}`, ri(1, 2));
  return out;
}

/**
 * 组队宝箱分配（用户 10-25，学阿尔比恩：看运气，但每人保底有一份）：
 * 打开宝箱的那一刻归属就全部定好（不用一件件去点），全队都能看到宝箱里全部东西各归谁。
 * - 宝箱按人数开出几份合在一起；金币和材料这类成堆的东西平分，零头随机归属；
 * - 装备、钥匙、强化石每件全队暗中掷 1-100 点，最高的拿走；
 * - 一件好东西都没分到的人额外拿一份保底碎片。
 * 全部按洞口种子和队员名单算，每个队员在自己那边算出来的结果一样，不需要服务器。
 */
export interface TeamMember { id: string; name: string }
export interface LootRoll { item: string; rolls: number[]; winner: number }

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
function seeded(seed: number) {
  let r = seed || 1;
  return () => { const [x, n] = nextRandom(r); r = n; return x; };
}
/** 组队时宝箱品质按洞口算，全队一样 */
export const teamChestQuality = (gate: DungeonGate) => rollChestQuality(gate.kind, gate.floors, seeded(gate.seed ^ 0x5bd1e995)());

const rolled = (id: string) => !!ITEMS[id]?.equip || id.startsWith('dkey_') || id.startsWith('enhstone_');

export function teamChest(gate: DungeonGate, q: number, members: TeamMember[]) {
  const ids = members.map((m) => m.id);
  const rand = seeded(gate.seed ^ hashStr(ids.join('|')));
  const pool: Record<string, number> = {};
  for (let i = 0; i < members.length; i++) for (const [id, n] of Object.entries(rollChest(gate, q, rand))) pool[id] = (pool[id] ?? 0) + n;
  const shares: Record<string, number>[] = members.map(() => ({}));
  const give = (i: number, id: string, n: number) => { if (n > 0) shares[i][id] = (shares[i][id] ?? 0) + n; };
  const rolls: LootRoll[] = [];
  const roll = (item: string) => {
    const pts = members.map(() => 1 + Math.floor(rand() * 100));
    let w = 0;
    pts.forEach((p, i) => { if (p > pts[w]) w = i; });
    rolls.push({ item, rolls: pts, winner: w });
    return w;
  };
  const won = members.map(() => false);
  for (const id of Object.keys(pool).sort()) {
    const n = pool[id];
    if (rolled(id)) {
      for (let k = 0; k < n; k++) { const w = roll(id); give(w, id, 1); won[w] = true; }
      continue;
    }
    const each = Math.floor(n / members.length);
    members.forEach((_, i) => give(i, id, each));
    if (id === 'coins') { give(0, id, n - each * members.length); continue; }
    for (let k = n - each * members.length; k > 0; k--) give(roll(id), id, 1);
  }
  // 保底：一件都没掷到的人
  won.forEach((ok, i) => { if (!ok) give(i, `enhshard_${gate.tier + 1}`, 2 + q * 2); });
  return { shares, rolls };
}

/** 组队进副本，怪物变强（用户 10-25）：每多一个人全属性 +5%，最多 +20% */
export const mobBuff = (party: number) => Math.min(0.2, 0.05 * Math.max(0, party - 1));
export function buffMob(m: MonsterDef, party: number): MonsterDef {
  const k = 1 + mobBuff(party);
  if (k === 1) return m;
  return { ...m, hp: Math.round(m.hp * k), attack: Math.round(m.attack * k), defence: Math.round(m.defence * k), maxHit: Math.round(m.maxHit * k * 10) / 10 };
}
