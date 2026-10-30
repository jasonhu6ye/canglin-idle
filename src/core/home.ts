import { ITEMS, NODES, type MapNode } from './data';
import type { GameState, HomeOrder, HomeThing, ItemStack } from './types';
import { tl } from '../i18n';
import { dayKey } from './mail';

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
/** 城里的家园传送门：两座主城和几座外圈城镇都有（以前只认两座主城的，外圈城的进不去） */
export const PORTAL_IDS = NODES.filter((n) => n.portal).map((n) => n.id);

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

export type BuildCat = 'struct' | 'floor' | 'furniture' | 'decor' | 'station' | 'farm' | 'outdoor' | 'trophy';
export const BUILD_CATS: { id: BuildCat; name: string }[] = [
  { id: 'struct', name: tl('墙和门') }, { id: 'floor', name: tl('地板') }, { id: 'furniture', name: tl('家具') },
  { id: 'decor', name: tl('饰品') }, { id: 'station', name: tl('制作台') }, { id: 'farm', name: tl('农田') },
  { id: 'outdoor', name: tl('户外') }, { id: 'trophy', name: tl('战利品') },
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
  /** 家园农田：一块 4×4 的地，能种所有已解锁的作物，最多 8 块 */
  plot?: boolean;
  /** 舒适度（不写就按种类给默认值，见 comfortOf） */
  comfort?: number;
  /** 会自己产出东西：每 min 分钟一个 item，最多攒 cap 个（人不在、离线也攒） */
  produce?: { item: string; min: number; cap: number };
  /** 岛屿声望到几级才能盖（10-29） */
  rep?: number;
  desc?: string;
}

const c = (item: string, qty: number): ItemStack => ({ item, qty });
const b = (id: string, name: string, cat: BuildCat, w: number, h: number, cost: ItemStack[], extra: Partial<BuildDef> = {}): BuildDef =>
  ({ id, name, cat, w, h, cost, ...extra });

export const BUILDS: BuildDef[] = [
  b('wall_wood', tl('木墙'), 'struct', 1, 1, [c('plank_1', 2)], { wall: true }),
  b('wall_stone', tl('石墙'), 'struct', 1, 1, [c('stone', 4)], { wall: true }),
  b('wall_brick', tl('红砖墙'), 'struct', 1, 1, [c('stone', 3), c('copper_bar', 1)], { wall: true }),
  b('wall_white', tl('白灰墙'), 'struct', 1, 1, [c('stone', 3), c('tin_bar', 1)], { wall: true }),
  b('door_wood', tl('木门'), 'struct', 1, 1, [c('plank_1', 4)], { walk: true }),
  b('door_iron', tl('铁门'), 'struct', 1, 1, [c('iron_bar', 3)], { walk: true }),
  b('fence', tl('木篱笆'), 'struct', 1, 1, [c('plain_log', 1)], { wall: true }),
  b('floor_wood', tl('木地板'), 'floor', 1, 1, [c('plank_1', 1)], { floor: true }),
  b('floor_dark', tl('深色木地板'), 'floor', 1, 1, [c('plank_3', 1)], { floor: true }),
  b('floor_stone', tl('石砖地'), 'floor', 1, 1, [c('stone', 2)], { floor: true }),
  b('floor_marble', tl('大理石地'), 'floor', 1, 1, [c('stone', 3), c('tin_bar', 1)], { floor: true }),
  b('carpet_red', tl('红地毯'), 'floor', 1, 1, [c('cloth_1', 2)], { floor: true }),
  b('carpet_blue', tl('蓝地毯'), 'floor', 1, 1, [c('cloth_2', 2)], { floor: true }),
  b('path', tl('石板路'), 'floor', 1, 1, [c('stone', 1)], { floor: true }),
  b('bed', tl('木床'), 'furniture', 1, 2, [c('plank_1', 6), c('cloth_1', 4)]),
  b('bed_double', tl('双人床'), 'furniture', 2, 2, [c('plank_2', 10), c('cloth_2', 8)]),
  b('table', tl('木桌'), 'furniture', 2, 1, [c('plank_1', 4)]),
  b('chair', tl('木椅'), 'furniture', 1, 1, [c('plank_1', 2)]),
  b('chest', tl('储物箱'), 'furniture', 1, 1, [c('plank_1', 8), c('copper_bar', 2)], { chest: true, desc: tl('岛上有储物箱，就能在岛上存取仓库，干活背包满了也直接存进去。') }),
  b('shelf', tl('书架'), 'furniture', 2, 1, [c('plank_2', 6)]),
  b('wardrobe', tl('衣柜'), 'furniture', 1, 1, [c('plank_2', 8)]),
  b('lamp', tl('落地灯'), 'furniture', 1, 1, [c('copper_bar', 2), c('cloth_1', 1)], { light: true }),
  b('fireplace', tl('壁炉'), 'furniture', 2, 1, [c('stone', 20)], { light: true }),
  b('plant_pot', tl('盆栽'), 'furniture', 1, 1, [c('stone', 2), c('green_herb', 1)]),
  b('rug_round', tl('圆地垫'), 'furniture', 2, 2, [c('cloth_1', 6)], { floor: true }),
  b('st_kitchen', tl('灶台'), 'station', 2, 1, [c('stone', 15), c('copper_bar', 2)], { station: 'kitchen', light: true }),
  b('st_furnace', tl('熔炉'), 'station', 2, 2, [c('stone', 30)], { station: 'furnace', light: true }),
  b('st_smithy', tl('铁砧'), 'station', 2, 1, [c('copper_bar', 10), c('stone', 5)], { station: 'smithy' }),
  b('st_workshop', tl('工作台'), 'station', 2, 1, [c('plank_1', 10), c('copper_bar', 2)], { station: 'workshop' }),
  b('st_bowyer', tl('制弓台'), 'station', 2, 1, [c('plank_2', 10)], { station: 'bowyer' }),
  b('st_apothecary', tl('药剂台'), 'station', 2, 1, [c('plank_1', 6), c('green_herb', 10)], { station: 'apothecary' }),
  b('tree', tl('小树'), 'outdoor', 1, 1, [c('plain_log', 5)]),
  b('flowerbed', tl('花坛'), 'outdoor', 2, 1, [c('stone', 4), c('green_herb', 2)]),
  b('bench', tl('长椅'), 'outdoor', 2, 1, [c('plank_1', 5)]),
  b('streetlamp', tl('路灯'), 'outdoor', 1, 1, [c('copper_bar', 3), c('stone', 2)], { light: true }),
  b('well', tl('水井'), 'outdoor', 2, 2, [c('stone', 25), c('plank_1', 4)]),
  b('statue', tl('石像'), 'outdoor', 2, 2, [c('stone', 60)]),
  // ───── 10-24 新增 ─────
  b('wall_log', tl('原木墙'), 'struct', 1, 1, [c('plain_log', 3)], { wall: true }),
  b('wall_dark', tl('深色木墙'), 'struct', 1, 1, [c('plank_3', 2)], { wall: true }),
  b('wall_window', tl('带窗木墙'), 'struct', 1, 1, [c('plank_1', 2), c('tin_bar', 1)], { wall: true }),
  b('wall_moss', tl('青苔石墙'), 'struct', 1, 1, [c('stone', 4), c('green_herb', 1)], { wall: true }),
  b('wall_marble', tl('大理石墙'), 'struct', 1, 1, [c('stone', 5), c('titanium_bar', 1)], { wall: true }),
  b('hedge', tl('树篱'), 'struct', 1, 1, [c('plain_log', 1), c('green_herb', 2)], { wall: true }),
  b('fence_iron', tl('铁栅栏'), 'struct', 1, 1, [c('iron_bar', 2)], { wall: true }),
  b('door_gold', tl('镶金大门'), 'struct', 1, 1, [c('plank_4', 4), c('runic_bar', 1)], { walk: true }),
  b('door_arch', tl('花拱门'), 'struct', 1, 1, [c('plank_1', 3), c('green_herb', 3)], { walk: true }),
  b('floor_birch', tl('桦木地板'), 'floor', 1, 1, [c('plank_2', 1)], { floor: true }),
  b('floor_herring', tl('人字纹地板'), 'floor', 1, 1, [c('plank_4', 1)], { floor: true }),
  b('floor_check', tl('黑白格地砖'), 'floor', 1, 1, [c('stone', 2), c('iron_bar', 1)], { floor: true }),
  b('floor_mosaic', tl('马赛克地砖'), 'floor', 1, 1, [c('stone', 2), c('sapphire', 1)], { floor: true }),
  b('carpet_green', tl('绿地毯'), 'floor', 1, 1, [c('cloth_3', 2)], { floor: true }),
  b('carpet_purple', tl('紫地毯'), 'floor', 1, 1, [c('cloth_5', 2)], { floor: true }),
  b('floor_hay', tl('干草地'), 'floor', 1, 1, [c('wheat', 2)], { floor: true }),
  b('gravel', tl('碎石路'), 'floor', 1, 1, [c('stone', 1)], { floor: true }),
  b('sofa', tl('布沙发'), 'furniture', 2, 1, [c('plank_2', 6), c('cloth_2', 8)]),
  b('armchair', tl('扶手椅'), 'furniture', 1, 1, [c('plank_2', 4), c('cloth_2', 4)]),
  b('stool', tl('小板凳'), 'furniture', 1, 1, [c('plank_1', 1)]),
  b('dining_table', tl('长餐桌'), 'furniture', 3, 2, [c('plank_3', 12)]),
  b('desk', tl('书桌'), 'furniture', 2, 1, [c('plank_2', 8), c('cloth_1', 1)]),
  b('cabinet', tl('橱柜'), 'furniture', 2, 1, [c('plank_2', 10), c('copper_bar', 2)]),
  b('nightstand', tl('床头柜'), 'furniture', 1, 1, [c('plank_1', 4)]),
  b('dresser', tl('梳妆台'), 'furniture', 2, 1, [c('plank_3', 8), c('tin_bar', 2)]),
  b('mirror', tl('落地镜'), 'furniture', 1, 1, [c('plank_2', 3), c('tin_bar', 3)]),
  b('clock', tl('落地钟'), 'furniture', 1, 1, [c('plank_3', 6), c('copper_bar', 4)]),
  b('piano', tl('钢琴'), 'furniture', 2, 1, [c('plank_5', 12), c('iron_bar', 6)]),
  b('bathtub', tl('浴缸'), 'furniture', 2, 1, [c('iron_bar', 10), c('stone', 10)]),
  b('candelabra', tl('烛台'), 'furniture', 1, 1, [c('copper_bar', 3)], { light: true }),
  b('globe', tl('地球仪'), 'furniture', 1, 1, [c('plank_2', 2), c('copper_bar', 2), c('cloth_2', 1)]),
  b('easel', tl('画架'), 'furniture', 1, 1, [c('plank_1', 4), c('cloth_1', 2)]),
  b('weapon_rack', tl('兵器架'), 'furniture', 2, 1, [c('plank_2', 6), c('iron_bar', 4)]),
  b('armor_stand', tl('盔甲架'), 'furniture', 1, 1, [c('plank_1', 3), c('iron_bar', 6)]),
  b('barrel', tl('木桶'), 'furniture', 1, 1, [c('plank_1', 4), c('copper_bar', 1)]),
  b('crates', tl('木箱堆'), 'furniture', 2, 1, [c('plank_1', 8)]),
  b('vase', tl('花瓶'), 'furniture', 1, 1, [c('stone', 3), c('green_herb', 2)]),
  b('fishtank', tl('鱼缸'), 'furniture', 2, 1, [c('tin_bar', 4), c('minnow', 3)]),
  b('cat_bed', tl('猫窝'), 'furniture', 1, 1, [c('cloth_1', 4)]),
  b('rug_long', tl('长地毯'), 'furniture', 3, 2, [c('cloth_3', 10)], { floor: true }),
  b('fountain', tl('喷泉'), 'outdoor', 3, 3, [c('stone', 120), c('copper_bar', 10)]),
  b('pond', tl('小池塘'), 'outdoor', 2, 2, [c('stone', 20), c('minnow', 2)]),
  b('pine_tree', tl('松树'), 'outdoor', 1, 1, [c('pine_log', 5)]),
  b('cherry_tree', tl('樱花树'), 'outdoor', 1, 1, [c('oak_log', 5), c('green_herb', 3)]),
  b('bush', tl('灌木'), 'outdoor', 1, 1, [c('green_herb', 2)]),
  b('rock', tl('大石头'), 'outdoor', 1, 1, [c('stone', 15)]),
  b('haystack', tl('草堆'), 'outdoor', 1, 1, [c('wheat', 10)]),
  b('scarecrow', tl('稻草人'), 'outdoor', 1, 1, [c('plain_log', 2), c('wheat', 5), c('cloth_1', 1)]),
  b('signpost', tl('路牌'), 'outdoor', 1, 1, [c('plank_1', 3)]),
  b('mailbox', tl('信箱'), 'outdoor', 1, 1, [c('plank_1', 2), c('iron_bar', 1)]),
  b('campfire', tl('篝火'), 'outdoor', 1, 1, [c('plain_log', 4), c('stone', 6)], { light: true }),
  b('torch', tl('火把'), 'outdoor', 1, 1, [c('plain_log', 1), c('cloth_1', 1)], { light: true }),
  b('stone_lantern', tl('石灯笼'), 'outdoor', 1, 1, [c('stone', 12)], { light: true }),
  b('tent', tl('帐篷'), 'outdoor', 2, 2, [c('plank_1', 6), c('cloth_2', 12)]),
  b('beehive', tl('蜂箱'), 'outdoor', 1, 1, [c('plank_2', 4)], { produce: { item: 'honey', min: 30, cap: 8 }, desc: tl('每 30 分钟产 1 份蜂蜜，最多攒 8 份。岛上每有一个花坛或花车，产蜜快 10%（最多快 50%）。') }),
  b('dog_house', tl('狗屋'), 'outdoor', 2, 1, [c('plank_2', 8)]),
  b('birdbath', tl('鸟浴盆'), 'outdoor', 1, 1, [c('stone', 10)]),
  b('garden_bed', tl('菜畦'), 'outdoor', 2, 1, [c('plank_1', 4), c('seed_potato', 2)]),
  b('windmill', tl('小风车'), 'outdoor', 2, 2, [c('plank_3', 20), c('cloth_3', 6)]),
  b('st_atelier', tl('珍材台'), 'station', 2, 1, [c('plank_4', 10), c('crystal_1', 5)], { station: 'atelier' }),
  // ───── 10-27 新增：农田、饰品、家具、户外 ─────
  b('farm_plot', tl('家园农田'), 'farm', 4, 4, [c('plank_2', 16), c('stone', 30), c('fert_basic', 4)], {
    plot: true, comfort: 2, desc: tl('一块 4×4 的田，能种所有已经解锁的作物（不分阶级），岛上任何地方都能打理，也能开自动补种、施肥、装洒水器。最多 8 块。'),
  }),
  b('water_barrel', tl('雨水桶'), 'farm', 1, 1, [c('plank_1', 4), c('iron_bar', 1)], { desc: tl('岛上有雨水桶，家园农田新种下的作物自动浇水（和洒水器一样）。') }),
  b('compost', tl('堆肥箱'), 'farm', 1, 1, [c('plank_1', 6), c('green_herb', 4)], { produce: { item: 'fert_basic', min: 60, cap: 6 }, desc: tl('每 60 分钟堆出 1 份普通肥料，最多攒 6 份。') }),
  b('painting', tl('风景画'), 'decor', 1, 1, [c('plank_1', 2), c('cloth_1', 2), c('green_herb', 2)]),
  b('candle', tl('烛火'), 'decor', 1, 1, [c('copper_bar', 1), c('wheat', 2)], { light: true }),
  b('teddy', tl('布偶熊'), 'decor', 1, 1, [c('cloth_2', 3), c('hide_1', 2)]),
  b('books', tl('书堆'), 'decor', 1, 1, [c('plank_1', 1), c('cloth_1', 2)]),
  b('tea_set', tl('茶具'), 'decor', 1, 1, [c('stone', 4), c('tin_bar', 1)]),
  b('music_box', tl('八音盒'), 'decor', 1, 1, [c('plank_3', 2), c('copper_bar', 2), c('sapphire', 1)], { comfort: 8 }),
  b('crystal_ball', tl('水晶球'), 'decor', 1, 1, [c('crystal_2', 4), c('tin_bar', 1)], { light: true, comfort: 8 }),
  b('bonsai', tl('盆景'), 'decor', 1, 1, [c('stone', 3), c('pine_log', 2)]),
  b('paper_lantern', tl('纸灯笼'), 'decor', 1, 1, [c('cloth_1', 2), c('plank_1', 1)], { light: true }),
  b('hourglass', tl('沙漏'), 'decor', 1, 1, [c('plank_2', 2), c('tin_bar', 2)]),
  b('ship_model', tl('帆船模型'), 'decor', 1, 1, [c('plank_3', 3), c('cloth_2', 2)], { comfort: 7 }),
  b('gem_case', tl('宝石展柜'), 'decor', 1, 1, [c('plank_4', 3), c('ruby', 1), c('sapphire', 1)], { comfort: 10 }),
  b('pumpkin_lamp', tl('南瓜灯'), 'decor', 1, 1, [c('pumpkin', 3)], { light: true }),
  b('plush_cat', tl('猫咪玩偶'), 'decor', 1, 1, [c('cloth_3', 3)]),
  b('trophy_cup', tl('金奖杯'), 'decor', 1, 1, [c('runic_bar', 2), c('plank_4', 1)], { comfort: 12 }),
  b('bunk_bed', tl('上下铺'), 'furniture', 1, 2, [c('plank_2', 10), c('cloth_2', 6)]),
  b('bookcase_tall', tl('大书柜'), 'furniture', 2, 1, [c('plank_3', 12), c('cloth_2', 4)], { comfort: 7 }),
  b('counter', tl('料理台'), 'furniture', 2, 1, [c('plank_2', 6), c('stone', 8)]),
  b('round_table', tl('圆桌'), 'furniture', 2, 2, [c('plank_3', 10)]),
  b('throne', tl('王座'), 'furniture', 1, 1, [c('plank_5', 8), c('cloth_5', 6), c('runic_bar', 2)], { comfort: 14 }),
  b('bed_royal', tl('华丽大床'), 'furniture', 2, 2, [c('plank_5', 14), c('cloth_5', 12), c('titanium_bar', 2)], { comfort: 14 }),
  // ───── 10-27 第二批家具 ─────
  b('cupboard', tl('碗柜'), 'furniture', 2, 1, [c('plank_2', 10), c('stone', 6)], { comfort: 6 }),
  b('wine_rack', tl('酒架'), 'furniture', 2, 1, [c('plank_3', 8), c('wheat', 6)], { comfort: 6 }),
  b('coffee_table', tl('茶几'), 'furniture', 2, 1, [c('plank_3', 6)]),
  b('canopy_bed', tl('四柱帐床'), 'furniture', 2, 2, [c('plank_4', 14), c('cloth_4', 10)], { comfort: 12 }),
  b('bar_counter', tl('吧台'), 'furniture', 3, 1, [c('plank_3', 14), c('copper_bar', 4)], { comfort: 7 }),
  b('bar_stool', tl('吧凳'), 'furniture', 1, 1, [c('iron_bar', 1), c('cloth_2', 1)]),
  b('bookshelf_low', tl('矮书架'), 'furniture', 2, 1, [c('plank_2', 8), c('cloth_1', 3)], { comfort: 5 }),
  b('grand_piano', tl('三角钢琴'), 'furniture', 2, 2, [c('plank_5', 12), c('iron_bar', 6), c('crystal_2', 2)], { comfort: 14 }),
  b('harp', tl('竖琴'), 'furniture', 1, 1, [c('plank_4', 4), c('runic_bar', 1)], { comfort: 9 }),
  b('sewing_table', tl('缝纫台'), 'furniture', 2, 1, [c('plank_2', 6), c('iron_bar', 2), c('cloth_2', 4)]),
  b('folding_screen', tl('屏风'), 'furniture', 2, 1, [c('plank_3', 6), c('cloth_3', 6)], { comfort: 6 }),
  b('potted_tree', tl('大盆栽'), 'furniture', 1, 1, [c('stone', 6), c('pine_log', 3)]),
  b('wash_basin', tl('洗脸架'), 'furniture', 1, 1, [c('plank_1', 3), c('tin_bar', 2)]),
  b('rocking_chair', tl('摇椅'), 'furniture', 1, 1, [c('plank_3', 5), c('cloth_2', 2)], { comfort: 6 }),
  b('chess_table', tl('棋桌'), 'furniture', 1, 1, [c('plank_4', 4), c('stone', 4)], { comfort: 6 }),
  b('bird_cage', tl('鸟笼'), 'furniture', 1, 1, [c('copper_bar', 3), c('wheat', 4)], { comfort: 6 }),
  b('coat_rack', tl('衣帽架'), 'furniture', 1, 1, [c('plank_2', 3), c('cloth_2', 2)]),
  b('gazebo', tl('凉亭'), 'outdoor', 3, 3, [c('plank_3', 30), c('stone', 40)], { comfort: 14 }),
  b('swing', tl('秋千'), 'outdoor', 2, 1, [c('plank_2', 8), c('iron_bar', 2)], { comfort: 6 }),
  b('maple_tree', tl('枫树'), 'outdoor', 1, 1, [c('oak_log', 5), c('green_herb', 2)]),
  b('palm_tree', tl('椰子树'), 'outdoor', 1, 1, [c('cedar_log', 5)]),
  b('boat', tl('小木船'), 'outdoor', 3, 1, [c('plank_3', 16), c('cloth_2', 4)], { comfort: 6 }),
  b('coop', tl('鸡舍'), 'outdoor', 2, 2, [c('plank_2', 14), c('wheat', 10)], { comfort: 6, produce: { item: 'egg', min: 20, cap: 12 }, desc: tl('每 20 分钟下 1 个鸡蛋，最多攒 12 个。鸡蛋能在灶台做煎蛋、蜂蜜蛋糕。') }),
  b('apple_tree', tl('苹果树'), 'outdoor', 1, 1, [c('oak_log', 6), c('green_herb', 4), c('fert_basic', 2)], { produce: { item: 'apple', min: 40, cap: 6 }, desc: tl('每 40 分钟结 1 个苹果，最多挂 6 个。苹果能在灶台烤苹果派。') }),
  b('telescope', tl('望远镜'), 'outdoor', 1, 1, [c('iron_bar', 4), c('sapphire', 1)], { comfort: 7 }),
  b('totem', tl('图腾柱'), 'outdoor', 1, 1, [c('oak_log', 6), c('ruby', 1)], { comfort: 7 }),
  b('flower_cart', tl('花车'), 'outdoor', 2, 1, [c('plank_2', 8), c('green_herb', 6)]),
  // ───── 10-29 访客订单和岛屿声望 ─────
  b('order_board', tl('订单告示板'), 'outdoor', 2, 1, [c('plank_1', 6), c('cloth_1', 2)], { desc: tl('每天有 3 位访客在告示板上贴订单，交上家园产出的东西换金币和岛屿声望。声望升级能解锁新建筑。') }),
  b('fish_pond', tl('鱼塘'), 'outdoor', 3, 3, [c('stone', 40), c('plank_2', 10), c('raw_minnow', 5)], { rep: 1, comfort: 6, produce: { item: 'raw_minnow', min: 25, cap: 10 }, desc: tl('每 25 分钟养出 1 条生银鱼，最多攒 10 条。') }),
  b('sheep_pen', tl('羊圈'), 'outdoor', 3, 2, [c('plank_2', 20), c('wheat', 20)], { rep: 2, comfort: 6, produce: { item: 'wool', min: 45, cap: 8 }, desc: tl('每 45 分钟剪下 1 份羊毛，最多攒 8 份。羊毛能在工坊纺成粗布。') }),
  b('lighthouse', tl('灯塔'), 'outdoor', 2, 2, [c('stone', 60), c('copper_bar', 6), c('crystal_1', 2)], { rep: 3, light: true, comfort: 12 }),
  b('hot_balloon', tl('热气球'), 'outdoor', 3, 3, [c('cloth_3', 14), c('plank_3', 10), c('iron_bar', 4)], { rep: 4, comfort: 14 }),
  b('gold_statue', tl('黄金雕像'), 'outdoor', 2, 2, [c('stone', 40), c('runic_bar', 4), c('titanium_bar', 2)], { rep: 5, comfort: 16, desc: tl('岛屿声望 5 级的纪念雕像。') }),
];
for (const d of BUILDS) if (d.station && !d.desc) d.desc = tl`能做${NODES.find((n) => n.id === d.station)?.name.replace(tl('落霞城·'), '')}里的所有东西，站在岛上就能直接干活。`;
export const BUILD_BY_ID: Record<string, BuildDef> = Object.fromEntries(BUILDS.map((d) => [d.id, d]));

/** 首领战旗、战利品这类装饰：仓库里有就能摆，id 写作 deco:物品 id */
export function buildDef(id: string): BuildDef | undefined {
  if (BUILD_BY_ID[id]) return BUILD_BY_ID[id];
  if (!id.startsWith('deco:')) return undefined;
  const it = ITEMS[id.slice(5)];
  if (!it) return undefined;
  return { id, name: it.name, cat: 'trophy', w: 1, h: 1, cost: [c(it.id, 1)], desc: tl('首领的专属战利品，摆在家里显摆。') };
}
/** 能当战利品摆出来的物品 */
export const isTrophy = (itemId: string) => ITEMS[itemId]?.category === 'deco' || ITEMS[itemId]?.category === 'loot' && !ITEMS[itemId]?.opens;

const key = (x: number, y: number) => `${x},${y}`;
const emptyHome = (): NonNullable<GameState['home']> => ({ lv: 0, floors: {}, things: [] });

/**
 * 地毯这类「铺在地上的家具」（floor 标记但不是地板）在下层，桌椅床在上层：上面能压着地毯摆家具（10-27 修）。
 * 农田也算下层：田上不能摆东西，田和地毯也不能叠。
 */
export const underLayer = (d: BuildDef) => !!d.floor || !!d.plot;

/** 每一格上摆的是哪件东西（things 的下标）；layer 不写 = 两层都算，上层优先 */
export function thingGrid(home: GameState['home'], layer?: 'top' | 'under'): Map<string, number> {
  const m = new Map<string, number>();
  const put = (under: boolean) => (home?.things ?? []).forEach((t, i) => {
    const d = buildDef(t.id);
    if (!d || underLayer(d) !== under) return;
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) m.set(key(t.x + dx, t.y + dy), i);
  });
  if (layer !== 'top') put(true);
  if (layer !== 'under') put(false);
  return m;
}

/** 传送门一圈，加上门前进岛落脚的那几格，都不许盖东西（不然一进岛就被围住） */
const inPortal = (x: number, y: number) =>
  x >= HOME_PORTAL.x - 1 && x < HOME_PORTAL.x + HOME_PORTAL.w + 1 && y >= HOME_PORTAL.y - 1 && y <= HOME_SPAWN.y;

const have = (s: GameState, item: string) => (s.bag[item] ?? 0) + (s.bank[item] ?? 0);
export const affordable = (s: GameState, cost: ItemStack[]) => cost.every((i) => have(s, i.item) >= i.qty);

/** 能不能在 (x, y) 放这件东西；不能就返回原因 */
export function canPlace(s: GameState, id: string, x: number, y: number): string | null {
  const d = buildDef(id);
  if (!d) return tl('没有这种东西');
  if (!s.home?.inside) return tl('要在岛上才能建造');
  if (d.plot && homePlots(s).length >= HOME_PLOT_MAX) return tl`农田最多 ${HOME_PLOT_MAX} 块`;
  if (d.rep && repLevel(s.home.rep ?? 0) < d.rep) return tl`岛屿声望 ${d.rep} 级解锁`;
  const size = homeSize(s);
  const top = thingGrid(s.home, 'top');
  const under = thingGrid(s.home, 'under');
  const things = s.home.things;
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const cx = x + dx;
    const cy = y + dy;
    const k = key(cx, cy);
    if (!isHomeLand(cx, cy, size)) return tl('只能盖在陆地上');
    if (inPortal(cx, cy)) return tl('传送门旁边要留出来');
    if (d.cat === 'floor') {
      if (s.home.floors[k] === id) return tl('已经铺过了');
      const u = under.get(k);
      if (u !== undefined && buildDef(things[u].id)?.plot) return tl('田里不能铺地板');
    } else if (d.plot) {
      if (top.has(k) || under.has(k)) return tl('这里已经有东西了');
    } else if (underLayer(d)) {
      if (under.has(k)) return tl('这里已经有东西了');
    } else {
      if (top.has(k)) return tl('这里已经有东西了');
      const u = under.get(k);
      if (u !== undefined && buildDef(things[u].id)?.plot) return tl('田里不能摆东西');
    }
  }
  if (!affordable(s, d.cost)) return tl('材料不够');
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
export function placeBuild(prev: GameState, id: string, x: number, y: number, now = Date.now()): GameState {
  if (canPlace(prev, id, x, y)) return prev;
  const s = clone(prev);
  const home = (s.home ??= emptyHome());
  const d = buildDef(id)!;
  spend(s, d.cost);
  if (d.cat === 'floor') {
    const old = home.floors[key(x, y)];
    if (old) refund(s, BUILD_BY_ID[old]?.cost ?? []);
    home.floors[key(x, y)] = id;
  } else if (d.plot) {
    // 田的编号 1-8：拆了的号空出来给下一块用
    const used = new Set(homePlots(s).map((t) => t.n));
    let n = 1;
    while (used.has(n)) n++;
    home.things.push({ id, x, y, n });
  } else home.things.push({ id, x, y, ...(d.produce ? { at: now } : {}) });
  return s;
}

/** 拆掉一格上的东西：先拆家具和墙，没有再拆地板；材料全退回仓库 */
export function removeAt(prev: GameState, x: number, y: number): GameState {
  if (!prev.home?.inside) return prev;
  // 先拆上层（家具），再拆下层（地毯、农田），最后拆地板
  const i = thingGrid(prev.home, 'top').get(key(x, y)) ?? thingGrid(prev.home, 'under').get(key(x, y));
  const floor = prev.home.floors[key(x, y)];
  if (i === undefined && !floor) return prev;
  const s = clone(prev);
  const home = s.home!;
  if (i !== undefined) {
    const t = home.things.splice(i, 1)[0];
    refund(s, buildDef(t.id)?.cost ?? []);
    // 拆鸡舍、蜂箱这类：攒着的东西一起收进仓库，不白白丢掉
    const p = buildDef(t.id)?.produce;
    const ready = p ? produceReady(prev.home, t, Date.now()) : 0;
    if (p && ready) s.bank[p.item] = (s.bank[p.item] ?? 0) + ready;
    if (t.n) clearPlot(s, t.n);
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
  if (!s.bank.coins) delete s.bank.coins;
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

// ───────── 家园农田（10-27） ─────────
export const HOME_PLOT_MAX = 8;
export const PLOT_W = 4;
export const PLOT_H = 4;
export const HOME_FIELD = 'hfield';
/** 第 n 块家园农田的「田」id，和城里的田一样用来记设置（种子、自动补种、肥料、洒水器） */
export const homeFieldId = (n: number) => `${HOME_FIELD}${n}`;
export const isHomeField = (field: string) => /^hfield\d+$/.test(field);
export const homePlots = (s: GameState) => (s.home?.things ?? []).filter((t) => t.n && buildDef(t.id)?.plot);
/** 一块家园农田的每格地：id 和岛上的坐标 */
export function homePlotCells(t: HomeThing): { id: string; x: number; y: number }[] {
  const out: { id: string; x: number; y: number }[] = [];
  for (let k = 0; k < PLOT_W * PLOT_H; k++) out.push({ id: `${homeFieldId(t.n!)}:${k}`, x: t.x + (k % PLOT_W), y: t.y + Math.floor(k / PLOT_W) });
  return out;
}
/** 拆田：种着的作物退回种子，装的洒水器退回仓库，设置清掉 */
function clearPlot(s: GameState, n: number) {
  const field = homeFieldId(n);
  for (const [id, p] of Object.entries(s.farm ?? {})) {
    if (!id.startsWith(`${field}:`)) continue;
    delete s.farm![id];
    const seed = `seed_${p.crop}`;
    if (ITEMS[seed]) s.bank[seed] = (s.bank[seed] ?? 0) + 1;
  }
  if (s.sprinklers?.includes(field)) {
    s.sprinklers = s.sprinklers.filter((f) => f !== field);
    s.bank.sprinkler = (s.bank.sprinkler ?? 0) + 1;
  }
  for (const k of ['farmSeed', 'farmFert', 'autoFarm'] as const) {
    const m = s.settings[k] as Record<string, unknown> | undefined;
    if (m && field in m) { const next = { ...m }; delete next[field]; (s.settings as unknown as Record<string, unknown>)[k] = next; }
  }
}

// ───────── 舒适度（10-27 家园玩法） ─────────
/** 默认舒适度：家具 4、饰品 5、户外 3、战利品 10，墙地板和制作台不算 */
export function comfortOf(d: BuildDef): number {
  if (d.comfort !== undefined) return d.comfort;
  if (d.cat === 'trophy') return 10;
  if (d.cat === 'decor') return 5;
  if (d.cat === 'furniture') return d.chest ? 1 : d.floor ? 3 : 4;
  if (d.cat === 'outdoor') return 3;
  return 0;
}
/** 每档舒适度要多少分；档数 = 加成等级 */
export const COMFORT_STEPS = [15, 40, 75, 120, 180, 250, 340, 450, 580, 750];
/** 每档：经验 +0.5%、干活速度 +0.3%（最高 10 档 +5% / +3%） */
export const COMFORT_XP = 0.01;
export const COMFORT_SPEED = 0.005;
/**
 * 岛上摆设的舒适度：同一种东西摆得越多加得越少（第 2 件一半、第 3 件四分之一……最多算 6 件），
 * 鼓励多摆不同的东西；地板每格 0.05 分，最多 30 分
 */
export function homeComfort(home: GameState['home']): number {
  if (!home) return 0;
  const count = new Map<string, number>();
  for (const t of home.things) count.set(t.id, (count.get(t.id) ?? 0) + 1);
  let sum = 0;
  for (const [id, n] of count) {
    const d = buildDef(id);
    if (!d) continue;
    const base = comfortOf(d);
    for (let i = 0; i < Math.min(n, 6); i++) sum += base * 0.5 ** i;
  }
  sum += Math.min(30, Object.keys(home.floors).length * 0.05);
  return Math.round(sum);
}
export const comfortLevel = (score: number) => COMFORT_STEPS.filter((x) => score >= x).length;
/** 舒适度加成：岛上摆得越舒服，经验和干活速度越高（不管人在不在岛上，离线也算） */
const comfortCache = { home: undefined as GameState['home'], lv: 0 };
export function homePct(s: GameState, kind: string): number {
  if (!s.home) return 0;
  if (comfortCache.home !== s.home) { comfortCache.home = s.home; comfortCache.lv = comfortLevel(homeComfort(s.home)); }
  const lv = comfortCache.lv;
  return kind === 'xp' ? lv * COMFORT_XP : kind === 'speed' ? lv * COMFORT_SPEED : 0;
}

/** 读档时给农田排号：编号坏了或重复就补一个空号，超过 8 块的丢掉 */
function plotNumbers() {
  const used = new Set<number>();
  const fix: HomeThing[] = [];
  return (t: HomeThing) => {
    if (!buildDef(t.id)?.plot) return true;
    if (Number.isInteger(t.n) && t.n! >= 1 && t.n! <= HOME_PLOT_MAX && !used.has(t.n!)) { used.add(t.n!); return true; }
    let n = 1;
    while (used.has(n)) n++;
    if (n > HOME_PLOT_MAX) return false;
    used.add(n);
    t.n = n;
    fix.push(t);
    return true;
  };
}

/** 读档：清掉改过名或删掉的东西 */
export function migrateHome(h: GameState['home']): GameState['home'] {
  if (!h) return undefined;
  const lv = Math.max(0, Math.min(HOME_SIZES.length - 1, h.lv ?? 0));
  return {
    lv,
    floors: Object.fromEntries(Object.entries(h.floors ?? {}).filter(([, id]) => BUILD_BY_ID[id]?.cat === 'floor')),
    things: (h.things ?? []).filter((t: HomeThing) => t && buildDef(t.id) && Number.isFinite(t.x) && Number.isFinite(t.y))
      .map((t: HomeThing) => ({ id: t.id, x: t.x, y: t.y, ...(buildDef(t.id)?.plot ? { n: t.n } : {}), ...(buildDef(t.id)?.produce ? { at: Number.isFinite(t.at) ? t.at : Date.now() } : {}) }))
      .filter(plotNumbers()),
    inside: !!h.inside,
    ...(h.from && PORTAL_IDS.includes(h.from) ? { from: h.from } : {}),
    ...(Number.isFinite(h.rep) && h.rep! > 0 ? { rep: Math.floor(h.rep!) } : {}),
    ...(h.orders && typeof h.orders.day === 'string' && Array.isArray(h.orders.list)
      ? { orders: { day: h.orders.day, list: h.orders.list.filter((o) => o && ITEMS[o.item] && o.qty > 0).map((o) => ({ ...o })) } } : {}),
    ...(h.petted && typeof h.petted === 'object' ? { petted: Object.fromEntries(Object.entries(h.petted).filter(([k, v]) => PETS[k] && typeof v === 'string')) } : {}),
    ...(h.love && typeof h.love === 'object' ? { love: Object.fromEntries(Object.entries(h.love).filter(([k, v]) => PETS[k] && Number.isFinite(v) && v > 0).map(([k, v]) => [k, Math.floor(v)])) } : {}),
    ...(Number.isFinite(h.repGot) && h.repGot! > 0 ? { repGot: Math.min(REP_STEPS.length, Math.floor(h.repGot!)) } : {}),
  };
}

/**
 * 岛上制作台、储物箱对应的「地点」：打开制作页、仓库用，不画在大地图上。
 * 动作列表和城里同名建筑一样
 */
export const HOME_NODES: MapNode[] = BUILDS.filter((d) => d.station || d.chest).map((d) => {
  const town = NODES.find((n) => n.id === d.station);
  return {
    id: `home_${d.id}`, name: tl`家园·${d.name}`, x: -1, y: -1, region: 'town', lv: [1, 1],
    sprite: town?.sprite ?? 'bank', actions: town?.actions ?? [], town: true,
    ...(d.chest ? { opens: 'bank' as const } : {}),
  };
});
/** 家园农田的「地点」：打开田地面板用，什么阶级的作物都能种 */
const homeFieldNode = (id: string): MapNode | undefined => {
  if (!isHomeField(id)) return undefined;
  return { id, name: tl`家园农田 ${id.slice(HOME_FIELD.length)}`, x: -1, y: -1, region: 'town', lv: [1, 1], sprite: 'farm', actions: [], farm: [0, 1, 2, 3, 4, 5, 6, 7] };
};
export const homeNode = (id: string) => HOME_NODES.find((n) => n.id === id) ?? homeFieldNode(id);

// ───────── 家园产出（10-27）：鸡舍下蛋、蜂箱产蜜、苹果树结果、堆肥箱出肥料 ─────────
const FLOWERS = new Set(['flowerbed', 'flower_cart']);
/** 一件产出建筑多久出一个（毫秒）：蜂箱看岛上有几个花坛 */
export function produceMs(home: GameState['home'], id: string): number {
  const p = buildDef(id)?.produce;
  if (!p) return Infinity;
  let k = 1;
  if (id === 'beehive') k += Math.min(0.5, 0.1 * (home?.things.filter((t) => FLOWERS.has(t.id)).length ?? 0));
  return (p.min * 60_000) / k;
}
/** 这件东西现在攒了几个 */
export function produceReady(home: GameState['home'], t: HomeThing, now: number): number {
  const p = buildDef(t.id)?.produce;
  if (!p || t.at === undefined) return 0;
  return Math.max(0, Math.min(p.cap, Math.floor((now - t.at) / produceMs(home, t.id))));
}
/** 岛上一共攒了多少（按物品） */
export function homeProduce(home: GameState['home'], now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of home?.things ?? []) {
    const n = produceReady(home, t, now);
    if (n) out[buildDef(t.id)!.produce!.item] = (out[buildDef(t.id)!.produce!.item] ?? 0) + n;
  }
  return out;
}
/**
 * 收取产出，进仓库。at 填了就只收那一格上的那件。没攒满的零头接着算，攒满了从现在重新算。
 * 返回收到的东西（没收到就原样返回存档）
 */
export function collectHome(prev: GameState, now: number, at?: { x: number; y: number }): { state: GameState; got: Record<string, number> } {
  const got: Record<string, number> = {};
  if (!prev.home?.inside) return { state: prev, got };
  const only = at ? thingGrid(prev.home, 'top').get(key(at.x, at.y)) : undefined;
  if (at && only === undefined) return { state: prev, got };
  const s = clone(prev);
  const home = s.home!;
  home.things = home.things.map((t, i) => {
    if (only !== undefined && i !== only) return t;
    const n = produceReady(prev.home, t, now);
    if (!n) return t;
    const p = buildDef(t.id)!.produce!;
    got[p.item] = (got[p.item] ?? 0) + n;
    return { ...t, at: n >= p.cap ? now : t.at! + n * produceMs(prev.home, t.id) };
  });
  if (!Object.keys(got).length) return { state: prev, got };
  for (const [item, n] of Object.entries(got)) s.bank[item] = (s.bank[item] ?? 0) + n;
  return { state: s, got };
}
/** 岛上有雨水桶：家园农田新种的自动浇水 */
export const homeBarrel = (s: GameState) => !!s.home?.things.some((t) => t.id === 'water_barrel');

/** 存档里家园农田现有的全部地块 id（读档时校验 state.farm、洒水器用） */
export function homeCellIds(home: GameState['home']): Set<string> {
  const out = new Set<string>();
  for (const t of home?.things ?? []) if (buildDef(t.id)?.plot && t.n) for (const c of homePlotCells(t)) out.add(c.id);
  return out;
}


// ───────── 访客订单和岛屿声望（用户 10-29「增加家园岛屿玩法内容」） ─────────

/** 声望到这些分数升一级，最高 7 级 */
export const REP_STEPS = [20, 60, 140, 280, 500, 800, 1200];
export const repLevel = (rep: number) => REP_STEPS.filter((x) => rep >= x).length;
/** 每升一级订单金币多给 5% */
export const REP_COIN_BONUS = 0.05;
export const ORDERS_PER_DAY = 3;
/** 一天 3 单全交完额外给的声望 */
export const ORDER_ALL_BONUS = 5;
/** 摸一次宠物（每只每天一次）给的声望 */
export const PET_REP = 2;
/** 访客的名字，订单里的 who 是下标 */
export const VISITORS = [tl('渔夫老周'), tl('面包师阿香'), tl('行商胡三'), tl('小学徒豆豆'), tl('巡逻兵铁柱'), tl('药婆婆'), tl('吟游诗人林歌'), tl('灯塔守望人')];
/** 宠物：哪件建筑招来它 */
export const PETS: Record<string, { name: string; home: string }> = {
  cat: { name: tl('猫咪'), home: 'cat_bed' },
  dog: { name: tl('小狗'), home: 'dog_house' },
};
/** 订单能要的东西：[物品, 最少, 最多, 声望几级起] */
const ORDER_POOL: [string, number, number, number][] = [
  ['egg', 4, 8, 0], ['apple', 2, 5, 0], ['honey', 2, 4, 0], ['potato', 6, 12, 0], ['wheat', 6, 12, 0], ['carrot', 5, 10, 0],
  ['cabbage', 4, 8, 0], ['raw_minnow', 3, 6, 0], ['fert_basic', 2, 4, 0], ['fried_egg', 2, 4, 0],
  ['onion', 4, 8, 1], ['corn', 4, 8, 1], ['tomato', 4, 8, 1], ['pea', 4, 8, 1], ['apple_pie', 1, 3, 1],
  ['wool', 2, 5, 2], ['pumpkin', 3, 6, 2], ['pepper', 3, 6, 2], ['eggplant', 3, 6, 2], ['strawberry', 3, 6, 2],
  ['honey_cake', 1, 2, 3], ['garlic', 3, 6, 3], ['beet', 3, 6, 3], ['watermelon', 2, 4, 4], ['rice', 3, 6, 4],
];

function strHash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 按日期和当时的声望等级排出当天的订单（同一天、同一等级永远一样） */
export function makeOrders(day: string, rep: number): HomeOrder[] {
  const lv = repLevel(rep);
  const pool = ORDER_POOL.filter((p) => p[3] <= lv && ITEMS[p[0]]);
  let h = strHash(`${day}#${lv}`);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9 >>> 0) % 10000) / 10000;
  const list: HomeOrder[] = [];
  const used = new Set<string>();
  const who = new Set<number>();
  while (list.length < ORDERS_PER_DAY && used.size < pool.length) {
    const [item, lo, hi, need] = pool[Math.floor(rnd() * pool.length)];
    if (used.has(item)) continue;
    used.add(item);
    let w = Math.floor(rnd() * VISITORS.length);
    while (who.has(w)) w = (w + 1) % VISITORS.length;
    who.add(w);
    const qty = lo + Math.floor(rnd() * (hi - lo + 1));
    const coins = Math.round((ITEMS[item].value * qty * 3 + 40 * (need + 1)) * (1 + REP_COIN_BONUS * lv) / 5) * 5;
    list.push({ item, qty, coins, rep: 6 + 2 * need, who: w });
  }
  return list;
}

/** 今天的订单（没交过就现排，不写进存档） */
export function homeOrders(s: GameState, now: number) {
  const day = dayKey(now);
  const o = s.home?.orders;
  return o && o.day === day ? o.list : makeOrders(day, s.home?.rep ?? 0);
}
/** 把今天的订单定下来写进存档（交单、摸宠物改声望之前调，免得声望一变订单跟着变） */
function pinOrders(s: GameState, now: number) {
  const home = s.home!;
  const day = dayKey(now);
  if (home.orders?.day !== day) home.orders = { day, list: makeOrders(day, home.rep ?? 0) };
}
export const homeHasBoard = (s: GameState) => !!s.home?.things.some((t) => t.id === 'order_board');

/** 交第 idx 单：东西先扣仓库再扣背包，金币进仓库。不能交就原样返回 */
export function deliverOrder(prev: GameState, idx: number, now: number): GameState {
  if (!prev.home?.inside || !homeHasBoard(prev)) return prev;
  const o = homeOrders(prev, now)[idx];
  if (!o || o.done || have(prev, o.item) < o.qty) return prev;
  const s = clone(prev);
  pinOrders(s, now);
  const home = s.home!;
  const order = home.orders!.list[idx];
  spend(s, [{ item: order.item, qty: order.qty }]);
  order.done = true;
  s.bank.coins = (s.bank.coins ?? 0) + order.coins;
  home.rep = (home.rep ?? 0) + order.rep + (home.orders!.list.every((x) => x.done) ? ORDER_ALL_BONUS : 0);
  return s;
}

/** 岛上有哪些宠物（有猫窝就有猫，有狗屋就有狗） */
export const homePets = (home: GameState['home']) =>
  Object.keys(PETS).filter((k) => home?.things.some((t) => t.id === PETS[k].home));
/** 今天还能不能摸这只 */
export const canPet = (s: GameState, kind: string, now: number) =>
  !!s.home?.inside && homePets(s.home).includes(kind) && s.home.petted?.[kind] !== dayKey(now);

// ───────── 宠物亲密度和小礼物（用户 10-30「继续增加家园内容 更多游戏细节」） ─────────

/** 摸够这么多天升一颗心，最多 5 颗 */
export const LOVE_STEPS = [3, 7, 14, 30, 60];
export const loveHearts = (love: number) => LOVE_STEPS.filter((x) => love >= x).length;
/** 宠物叼来的礼物：[物品, 最少, 最多, 几颗心起, 权重]。coins 是金币 */
const PET_GIFTS: Record<string, [string, number, number, number, number][]> = {
  cat: [['raw_minnow', 2, 4, 1, 6], ['green_herb', 2, 3, 1, 3], ['raw_trout', 1, 2, 2, 4], ['fert_rich', 1, 2, 3, 2], ['sapphire', 1, 1, 4, 1]],
  dog: [['coins', 30, 80, 1, 5], ['seed_carrot', 3, 6, 1, 3], ['hide_1', 2, 4, 1, 3], ['plain_log', 3, 6, 2, 2], ['coins', 150, 300, 3, 2], ['ruby', 1, 1, 5, 1]],
};
/** 今天摸这只能拿到的礼物（按日期定好，同一天一样）；心不够就没有 */
export function petGift(kind: string, love: number, day: string): { item: string; qty: number } | null {
  const hearts = loveHearts(love);
  const pool = (PET_GIFTS[kind] ?? []).filter((g) => g[3] <= hearts && (g[0] === 'coins' || ITEMS[g[0]]));
  if (!pool.length) return null;
  let h = strHash(`${day}~${kind}`);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9 >>> 0) % 10000) / 10000;
  let r = rnd() * pool.reduce((a, g) => a + g[4], 0);
  const g = pool.find((x) => (r -= x[4]) < 0) ?? pool[0];
  return { item: g[0], qty: g[1] + Math.floor(rnd() * (g[2] - g[1] + 1)) };
}

/** 摸摸宠物：每只每天一次，给一点声望、涨亲密度；有心了还会叼来小礼物（进仓库） */
export function petPet(prev: GameState, kind: string, now: number): GameState {
  if (!canPet(prev, kind, now)) return prev;
  const s = clone(prev);
  pinOrders(s, now);
  const home = s.home!;
  home.petted = { ...home.petted, [kind]: dayKey(now) };
  home.rep = (home.rep ?? 0) + PET_REP;
  const love = (home.love?.[kind] ?? 0) + 1;
  home.love = { ...home.love, [kind]: love };
  const gift = petGift(kind, love, dayKey(now));
  if (gift) s.bank[gift.item] = (s.bank[gift.item] ?? 0) + gift.qty;
  return s;
}

// ───────── 声望升级奖励：每升一级领一次 ─────────
export const REP_REWARDS: { coins: number; items: ItemStack[] }[] = [
  { coins: 500, items: [{ item: 'fert_basic', qty: 10 }] },
  { coins: 1000, items: [{ item: 'seed_carrot', qty: 20 }, { item: 'fert_rich', qty: 5 }] },
  { coins: 2000, items: [{ item: 'sprinkler', qty: 1 }] },
  { coins: 3500, items: [{ item: 'sapphire', qty: 2 }] },
  { coins: 5000, items: [{ item: 'titanium_bar', qty: 3 }] },
  { coins: 8000, items: [{ item: 'runic_bar', qty: 3 }] },
  { coins: 12000, items: [{ item: 'ruby', qty: 3 }] },
];
/** 还有几级的奖励没领 */
export const repUnclaimed = (s: GameState) => Math.max(0, repLevel(s.home?.rep ?? 0) - (s.home?.repGot ?? 0));
/** 领下一份声望奖励（一次领一级），进仓库 */
export function claimRepReward(prev: GameState): GameState {
  if (!prev.home || !repUnclaimed(prev)) return prev;
  const s = clone(prev);
  const home = s.home!;
  const r = REP_REWARDS[home.repGot ?? 0];
  home.repGot = (home.repGot ?? 0) + 1;
  s.bank.coins = (s.bank.coins ?? 0) + r.coins;
  for (const i of r.items) s.bank[i.item] = (s.bank[i.item] ?? 0) + i.qty;
  return s;
}
