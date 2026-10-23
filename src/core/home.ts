import { ITEMS, NODES, type MapNode } from './data';
import type { GameState, HomeThing, ItemStack } from './types';

/**
 * 家园岛屿（用户 10-23）：两座城各有一个传送门，进去是一座自己的海岛。
 * 岛上能像环世界那样一格一格地盖墙、铺地板、装门、摆家具，也能放制作台和储物箱，站在岛上就能干活。
 * 岛一开始 198×198，以后花金币和材料扩建。
 */

/** 岛屿地图的边长（含四周的海），扩建到最大也装得下 */
export const ISLAND = 340;
export const ISLAND_C = ISLAND / 2;
/** 每一级岛的陆地边长（用户定：初始 198×198） */
export const HOME_SIZES = [198, 238, 278];
/** 扩建到下一级的花费 */
export const HOME_UPGRADES: { coins: number; items: ItemStack[] }[] = [
  { coins: 20_000, items: [{ item: 'plank_2', qty: 200 }, { item: 'stone', qty: 300 }] },
  { coins: 100_000, items: [{ item: 'plank_4', qty: 300 }, { item: 'iron_bar', qty: 100 }] },
];
export const homeLevel = (s: GameState) => s.home?.lv ?? 0;
export const homeSize = (s: GameState) => HOME_SIZES[homeLevel(s)];

/** 岛上的传送门（3×2，占着不能盖东西），进岛后站在它下面 */
export const HOME_PORTAL = { x: ISLAND_C - 1, y: ISLAND_C + 6, w: 3, h: 2 };
export const HOME_SPAWN = { x: ISLAND_C, y: ISLAND_C + 9 };
/** 城里的两个传送门 */
export const PORTAL_IDS = ['portal_home', 'portal_home2'];

function hash(x: number, y: number, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 平滑的低频噪声，让海岸线弯弯曲曲 */
function wobble(t: number, salt: number) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i, salt);
  const b = hash(i + 1, salt);
  return a + (b - a) * f * f * (3 - 2 * f);
}

/**
 * 这一格是什么地：草地、沙滩、浅水还是海。陆地是一个圆角方块，边上加一点起伏；
 * 最外 3 格是沙滩。size 是这一级岛的边长。
 */
export function islandGround(x: number, y: number, size: number): 'grass' | 'sand' | 'shallows' | 'ocean' {
  const half = size / 2;
  const dx = Math.abs(x + 0.5 - ISLAND_C);
  const dy = Math.abs(y + 0.5 - ISLAND_C);
  // 圆角：四个角削成半径 24 的圆
  const r = 24;
  const ex = Math.max(0, dx - (half - r));
  const ey = Math.max(0, dy - (half - r));
  const out = Math.hypot(ex, ey) - r;
  const edge = (dx > dy ? wobble(y / 9, 3 + (x > ISLAND_C ? 1 : 0)) : wobble(x / 9, 5 + (y > ISLAND_C ? 1 : 0))) * 2.5;
  const d = Math.max(out, Math.max(dx, dy) - half) + edge;
  if (d <= -3) return 'grass';
  if (d <= 0) return 'sand';
  if (d <= 3) return 'shallows';
  return 'ocean';
}
export const isHomeLand = (x: number, y: number, size: number) => {
  const g = islandGround(x, y, size);
  return g === 'grass' || g === 'sand';
};

export type BuildCat = 'struct' | 'floor' | 'furniture' | 'station' | 'outdoor' | 'trophy';
export const BUILD_CATS: { id: BuildCat; name: string }[] = [
  { id: 'struct', name: '墙和门' }, { id: 'floor', name: '地板' }, { id: 'furniture', name: '家具' },
  { id: 'station', name: '制作台' }, { id: 'outdoor', name: '户外' }, { id: 'trophy', name: '战利品' },
];

export interface BuildDef {
  id: string;
  name: string;
  cat: BuildCat;
  w: number;
  h: number;
  cost: ItemStack[];
  /** 地板：铺在地上，人能走，上面还能摆家具 */
  floor?: boolean;
  /** 门：人能穿过 */
  walk?: boolean;
  /** 墙：画的时候和相邻的墙连起来 */
  wall?: boolean;
  /** 制作台：能做哪座城镇建筑里的东西 */
  station?: string;
  /** 储物箱：站在岛上就能存取仓库 */
  chest?: boolean;
  /** 晚上会亮 */
  light?: boolean;
  desc?: string;
}

const c = (item: string, qty: number): ItemStack => ({ item, qty });
const b = (id: string, name: string, cat: BuildCat, w: number, h: number, cost: ItemStack[], extra: Partial<BuildDef> = {}): BuildDef =>
  ({ id, name, cat, w, h, cost, ...extra });

export const BUILDS: BuildDef[] = [
  b('wall_wood', '木墙', 'struct', 1, 1, [c('plank_1', 2)], { wall: true }),
  b('wall_stone', '石墙', 'struct', 1, 1, [c('stone', 4)], { wall: true }),
  b('wall_brick', '红砖墙', 'struct', 1, 1, [c('stone', 3), c('copper_bar', 1)], { wall: true }),
  b('wall_white', '白灰墙', 'struct', 1, 1, [c('stone', 3), c('tin_bar', 1)], { wall: true }),
  b('door_wood', '木门', 'struct', 1, 1, [c('plank_1', 4)], { walk: true }),
  b('door_iron', '铁门', 'struct', 1, 1, [c('iron_bar', 3)], { walk: true }),
  b('fence', '木篱笆', 'struct', 1, 1, [c('plain_log', 1)], { wall: true }),
  b('floor_wood', '木地板', 'floor', 1, 1, [c('plank_1', 1)], { floor: true }),
  b('floor_dark', '深色木地板', 'floor', 1, 1, [c('plank_3', 1)], { floor: true }),
  b('floor_stone', '石砖地', 'floor', 1, 1, [c('stone', 2)], { floor: true }),
  b('floor_marble', '大理石地', 'floor', 1, 1, [c('stone', 3), c('tin_bar', 1)], { floor: true }),
  b('carpet_red', '红地毯', 'floor', 1, 1, [c('cloth_1', 2)], { floor: true }),
  b('carpet_blue', '蓝地毯', 'floor', 1, 1, [c('cloth_2', 2)], { floor: true }),
  b('path', '石板路', 'floor', 1, 1, [c('stone', 1)], { floor: true }),
  b('bed', '木床', 'furniture', 1, 2, [c('plank_1', 6), c('cloth_1', 4)]),
  b('bed_double', '双人床', 'furniture', 2, 2, [c('plank_2', 10), c('cloth_2', 8)]),
  b('table', '木桌', 'furniture', 2, 1, [c('plank_1', 4)]),
  b('chair', '木椅', 'furniture', 1, 1, [c('plank_1', 2)]),
  b('chest', '储物箱', 'furniture', 1, 1, [c('plank_1', 8), c('copper_bar', 2)], { chest: true, desc: '岛上有储物箱，就能在岛上存取仓库，干活背包满了也直接存进去。' }),
  b('shelf', '书架', 'furniture', 2, 1, [c('plank_2', 6)]),
  b('wardrobe', '衣柜', 'furniture', 1, 1, [c('plank_2', 8)]),
  b('lamp', '落地灯', 'furniture', 1, 1, [c('copper_bar', 2), c('cloth_1', 1)], { light: true }),
  b('fireplace', '壁炉', 'furniture', 2, 1, [c('stone', 20)], { light: true }),
  b('plant_pot', '盆栽', 'furniture', 1, 1, [c('stone', 2), c('green_herb', 1)]),
  b('rug_round', '圆地垫', 'furniture', 2, 2, [c('cloth_1', 6)], { floor: true }),
  b('st_kitchen', '灶台', 'station', 2, 1, [c('stone', 15), c('copper_bar', 2)], { station: 'kitchen', light: true }),
  b('st_furnace', '熔炉', 'station', 2, 2, [c('stone', 30)], { station: 'furnace', light: true }),
  b('st_smithy', '铁砧', 'station', 2, 1, [c('copper_bar', 10), c('stone', 5)], { station: 'smithy' }),
  b('st_workshop', '工作台', 'station', 2, 1, [c('plank_1', 10), c('copper_bar', 2)], { station: 'workshop' }),
  b('st_bowyer', '制弓台', 'station', 2, 1, [c('plank_2', 10)], { station: 'bowyer' }),
  b('st_apothecary', '药剂台', 'station', 2, 1, [c('plank_1', 6), c('green_herb', 10)], { station: 'apothecary' }),
  b('tree', '小树', 'outdoor', 1, 1, [c('plain_log', 5)]),
  b('flowerbed', '花坛', 'outdoor', 2, 1, [c('stone', 4), c('green_herb', 2)]),
  b('bench', '长椅', 'outdoor', 2, 1, [c('plank_1', 5)]),
  b('streetlamp', '路灯', 'outdoor', 1, 1, [c('copper_bar', 3), c('stone', 2)], { light: true }),
  b('well', '水井', 'outdoor', 2, 2, [c('stone', 25), c('plank_1', 4)]),
  b('statue', '石像', 'outdoor', 2, 2, [c('stone', 60)]),
];
for (const d of BUILDS) if (d.station && !d.desc) d.desc = `能做${NODES.find((n) => n.id === d.station)?.name}里的所有东西，站在岛上就能直接干活。`;
export const BUILD_BY_ID: Record<string, BuildDef> = Object.fromEntries(BUILDS.map((d) => [d.id, d]));

/** 首领战旗、战利品这类装饰：仓库里有就能摆，id 写作 deco:物品 id */
export function buildDef(id: string): BuildDef | undefined {
  if (BUILD_BY_ID[id]) return BUILD_BY_ID[id];
  if (!id.startsWith('deco:')) return undefined;
  const it = ITEMS[id.slice(5)];
  if (!it) return undefined;
  return { id, name: it.name, cat: 'trophy', w: 1, h: 1, cost: [c(it.id, 1)], desc: '首领的专属战利品，摆在家里显摆。' };
}
/** 能当战利品摆出来的物品 */
export const isTrophy = (itemId: string) => ITEMS[itemId]?.category === 'deco' || ITEMS[itemId]?.category === 'loot' && !ITEMS[itemId]?.opens;

const key = (x: number, y: number) => `${x},${y}`;
const emptyHome = (): NonNullable<GameState['home']> => ({ lv: 0, floors: {}, things: [] });

/** 每一格上摆的是哪件东西（things 的下标） */
export function thingGrid(home: GameState['home']): Map<string, number> {
  const m = new Map<string, number>();
  (home?.things ?? []).forEach((t, i) => {
    const d = buildDef(t.id);
    if (!d) return;
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) m.set(key(t.x + dx, t.y + dy), i);
  });
  return m;
}

const inPortal = (x: number, y: number) =>
  x >= HOME_PORTAL.x - 1 && x < HOME_PORTAL.x + HOME_PORTAL.w + 1 && y >= HOME_PORTAL.y - 1 && y < HOME_PORTAL.y + HOME_PORTAL.h + 1;

const have = (s: GameState, item: string) => (s.bag[item] ?? 0) + (s.bank[item] ?? 0);
export const affordable = (s: GameState, cost: ItemStack[]) => cost.every((i) => have(s, i.item) >= i.qty);

/** 能不能在 (x, y) 放这件东西；不能就返回原因 */
export function canPlace(s: GameState, id: string, x: number, y: number, grid = thingGrid(s.home)): string | null {
  const d = buildDef(id);
  if (!d) return '没有这种东西';
  if (!s.home?.inside) return '要在岛上才能建造';
  const size = homeSize(s);
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const cx = x + dx;
    const cy = y + dy;
    if (!isHomeLand(cx, cy, size)) return '只能盖在陆地上';
    if (inPortal(cx, cy)) return '传送门旁边要留出来';
    if (d.floor && d.cat === 'floor') {
      if (s.home.floors[key(cx, cy)] === id) return '已经铺过了';
    } else if (grid.has(key(cx, cy))) return '这里已经有东西了';
  }
  if (!affordable(s, d.cost)) return '材料不够';
  return null;
}

function spend(s: GameState, cost: ItemStack[]) {
  for (const { item, qty } of cost) {
    let left = qty;
    for (const box of [s.bank, s.bag]) {
      const n = Math.min(left, box[item] ?? 0);
      box[item] = (box[item] ?? 0) - n;
      if (box[item] <= 0) delete box[item];
      left -= n;
    }
  }
}
function refund(s: GameState, cost: ItemStack[]) {
  for (const { item, qty } of cost) s.bank[item] = (s.bank[item] ?? 0) + qty;
}
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

/** 放一件东西：材料先扣仓库再扣背包。地板铺在别的地板上就换掉，旧的退料 */
export function placeBuild(prev: GameState, id: string, x: number, y: number): GameState {
  if (canPlace(prev, id, x, y)) return prev;
  const s = clone(prev);
  const home = (s.home ??= emptyHome());
  const d = buildDef(id)!;
  spend(s, d.cost);
  if (d.cat === 'floor') {
    const old = home.floors[key(x, y)];
    if (old) refund(s, BUILD_BY_ID[old]?.cost ?? []);
    home.floors[key(x, y)] = id;
  } else home.things.push({ id, x, y });
  return s;
}

/** 拆掉一格上的东西：先拆家具和墙，没有再拆地板；材料全退回仓库 */
export function removeAt(prev: GameState, x: number, y: number): GameState {
  if (!prev.home?.inside) return prev;
  const i = thingGrid(prev.home).get(key(x, y));
  const floor = prev.home.floors[key(x, y)];
  if (i === undefined && !floor) return prev;
  const s = clone(prev);
  const home = s.home!;
  if (i !== undefined) {
    const t = home.things.splice(i, 1)[0];
    refund(s, buildDef(t.id)?.cost ?? []);
  } else {
    delete home.floors[key(x, y)];
    refund(s, BUILD_BY_ID[floor]?.cost ?? []);
  }
  return s;
}

/** 扩建岛屿：金币从仓库扣 */
export function upgradeHome(prev: GameState): GameState {
  const lv = homeLevel(prev);
  const up = HOME_UPGRADES[lv];
  if (!up || !prev.home?.inside || (prev.bank.coins ?? 0) < up.coins || !affordable(prev, up.items)) return prev;
  const s = clone(prev);
  s.bank.coins -= up.coins;
  spend(s, up.items);
  s.home!.lv = lv + 1;
  return s;
}

export const homeHas = (s: GameState, pred: (d: BuildDef) => boolean) =>
  (s.home?.things ?? []).some((t) => { const d = buildDef(t.id); return !!d && pred(d); });

/** 岛上的制作台能不能做这个动作（人得在岛上） */
export function homeCan(s: GameState, action: string): boolean {
  if (!s.home?.inside) return false;
  return homeHas(s, (d) => !!d.station && !!NODES.find((n) => n.id === d.station)?.actions.includes(action));
}
export const homeChest = (s: GameState) => !!s.home?.inside && homeHas(s, (d) => !!d.chest);

/** 站在城里的传送门旁边才能进岛 */
export function atPortal(s: GameState): string | undefined {
  if (s.travel || s.walk) return undefined;
  return PORTAL_IDS.find((id) => {
    const n = NODES.find((x) => x.id === id);
    return n && Math.hypot(s.loc.x - n.x, s.loc.y - (n.y + 1)) <= 4;
  });
}

/** 进岛：手上的任务岛上做不了就先暂停（和走开一样，点「继续工作」会自己出岛去做） */
export function enterHome(prev: GameState): GameState {
  const from = atPortal(prev);
  if (!from || prev.home?.inside) return prev;
  const s = clone(prev);
  s.home = { ...(s.home ?? emptyHome()), inside: true, from };
  const task = s.queue[0];
  if (task && !s.paused && !homeCan(s, task.action)) {
    s.paused = true;
    s.progressMs = Math.min(0, s.progressMs);
    s.combat = null;
    s.travel = null;
  }
  return s;
}

export function leaveHome(prev: GameState): GameState {
  if (!prev.home?.inside) return prev;
  const s = clone(prev);
  s.home!.inside = false;
  // 岛上的制作台在干的活，出了岛就做不了了：暂停，点「继续工作」会走去城里做
  const task = s.queue[0];
  if (task && !s.paused && ACTIONS_AT_HOME(task.action)) {
    s.paused = true;
    s.progressMs = Math.min(0, s.progressMs);
  }
  return s;
}
const ACTIONS_AT_HOME = (action: string) => BUILDS.some((d) => d.station && NODES.find((n) => n.id === d.station)?.actions.includes(action));

/** 读档：清掉改过名或删掉的东西 */
export function migrateHome(h: GameState['home']): GameState['home'] {
  if (!h) return undefined;
  const lv = Math.max(0, Math.min(HOME_SIZES.length - 1, h.lv ?? 0));
  return {
    lv,
    floors: Object.fromEntries(Object.entries(h.floors ?? {}).filter(([, id]) => BUILD_BY_ID[id]?.cat === 'floor')),
    things: (h.things ?? []).filter((t: HomeThing) => t && buildDef(t.id) && Number.isFinite(t.x) && Number.isFinite(t.y)),
    inside: !!h.inside,
    ...(h.from && PORTAL_IDS.includes(h.from) ? { from: h.from } : {}),
  };
}

/**
 * 岛上制作台、储物箱对应的「地点」：打开制作页、仓库用，不画在大地图上。
 * 动作列表和城里同名建筑一样
 */
export const HOME_NODES: MapNode[] = BUILDS.filter((d) => d.station || d.chest).map((d) => {
  const town = NODES.find((n) => n.id === d.station);
  return {
    id: `home_${d.id}`, name: `家园·${d.name}`, x: -1, y: -1, region: 'town', lv: [1, 1],
    sprite: town?.sprite ?? 'bank', actions: town?.actions ?? [], town: true,
    ...(d.chest ? { opens: 'bank' as const } : {}),
  };
});
export const homeNode = (id: string) => HOME_NODES.find((n) => n.id === id);
