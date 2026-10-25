import { at, atF, atW, OLD_BOX } from './geo';
import type { RegionId } from './types';
import { tl } from '../i18n';

/*
 * 12080 大地图的 8 座新城镇（用户 10-24：每座城镇布局都不一样，各有特点风格）。
 * 这里只放布局数据：坐标都按城中心 = (0, 0) 写，建筑门口下方一格是设施的点位（站在点位下面一格干活）。
 * data.ts 按 fac 生成设施点位，world.ts 按这里摆地面、城墙、建筑、装饰和镇民。
 */

export type TownTheme = 'village' | 'snowfort' | 'lantern' | 'port' | 'ashcamp' | 'crystal' | 'stilt' | 'ruins';
/** 城里的设施：仓库、集市、各种生产建筑、家园传送门 */
export type Facility = 'bank' | 'market' | 'smithy' | 'furnace' | 'kitchen' | 'workshop' | 'bowyer' | 'apothecary' | 'atelier';
export const FACILITY_NAME: Record<Facility, string> = {
  bank: tl('仓库'), market: tl('集市'), smithy: tl('铁匠铺'), furnace: tl('熔炉'), kitchen: tl('灶台'), workshop: tl('工坊'), bowyer: tl('制弓台'), apothecary: tl('药剂铺'), atelier: tl('珍材坊'),
};

export interface TownBuilding { kind: string; x: number; y: number; w: number; h: number; fac?: Facility }
/** 地面：矩形 [x0,y0,x1,y1]（含两端）、圆 [cx,cy,r] 或菱形 r（|x|+|y|<=r） */
export interface TownGround { g: string; rect?: [number, number, number, number]; disk?: [number, number, number]; diamond?: number }
export interface TownWalls {
  prop: string;
  shape: 'rect' | 'circle' | 'diamond';
  /** rect：半宽、半高；circle、diamond：半径 */
  hw: number;
  hh: number;
  /** 城门：沿这些方向留 5 格宽的口 */
  gates: ('n' | 's' | 'w' | 'e')[];
}
export interface TownDef {
  id: string;
  name: string;
  region: RegionId;
  c: { x: number; y: number };
  theme: TownTheme;
  /** 一句话的特点，攻略和世界地图用 */
  intro: string;
  /** 不长地貌（河、湖、山脊）的范围 [x0,y0,x1,y1] */
  clear: [number, number, number, number];
  grounds: TownGround[];
  walls?: TownWalls;
  buildings: TownBuilding[];
  props: [string, number, number][];
  wanderers: [string, number, number, number][];
  /** 路从城外接到这些点 */
  gates: [number, number][];
  stone: [number, number];
  portal?: [number, number];
  /** 码头、栈桥上的钓鱼点 */
  fish?: [number, number];
}

const b = (kind: string, x: number, y: number, w: number, h: number, fac?: Facility): TownBuilding => ({ kind, x, y, w, h, fac });
const rect = (g: string, x0: number, y0: number, x1: number, y1: number): TownGround => ({ g, rect: [x0, y0, x1, y1] });
/** 一排间隔 step 的同种装饰 */
const row = (k: string, x0: number, x1: number, y: number, step: number): [string, number, number][] => {
  const out: [string, number, number][] = [];
  for (let x = x0; x <= x1; x += step) out.push([k, x, y]);
  return out;
};
const col = (k: string, x: number, y0: number, y1: number, step: number): [string, number, number][] => {
  const out: [string, number, number][] = [];
  for (let y = y0; y <= y1; y += step) out.push([k, x, y]);
  return out;
};

export const TOWNS: TownDef[] = [
  {
    // 凤麦镇：青岚丘陵的风车麦田小镇。没有城墙，一条长街东西贯穿，一条小溪南北穿过，镇外是麦田和三座风车
    id: 'fengmai', name: tl('凤麦镇'), region: 'hills', c: atF(0.075, 0.33), theme: 'village',
    intro: tl('风车、麦田和茅草屋顶的小镇，一条长街贯穿东西，小溪从镇中间流过。适合刚出新手村的玩家落脚。'),
    clear: [-62, -42, 62, 42],
    grounds: [
      rect('farm', -46, -32, -14, -18), rect('farm', 24, -32, 50, -18), rect('farm', -46, 20, -16, 34),
      rect('meadow', -5, -14, 10, -3),
      rect('road', -48, -1, 48, 1), rect('road', -36, 12, 32, 13), rect('road', 11, -14, 12, -2),
      rect('water', -9, -40, -7, 40), rect('bridge', -9, -1, -7, 1), rect('bridge', -9, 12, -7, 13),
    ],
    buildings: [
      b('bank', 13, -7, 6, 5, 'bank'), b('inn', 21, -7, 6, 5, 'kitchen'), b('workshop', 29, -7, 6, 5, 'workshop'),
      b('thatch', -22, -6, 5, 4), b('thatch', -30, -6, 5, 4), b('thatch', -38, -6, 5, 4),
      b('stall', -4, 8, 3, 2, 'market'), b('stall', 0, 8, 3, 2), b('stall', 4, 8, 3, 2),
      b('bowyer', 10, 6, 5, 4, 'bowyer'), b('thatch', 18, 6, 5, 4), b('thatch', 26, 6, 5, 4),
      b('thatch', -22, 6, 5, 4), b('thatch', -30, 6, 5, 4),
      b('windmill', -40, -30, 3, 4), b('windmill', 40, -28, 3, 4), b('windmill', -24, 24, 3, 4),
      b('barn', 34, 18, 5, 4), b('barn', -42, 14, 5, 4), b('well', 2, -9, 1, 1),
    ],
    props: [
      ['oak', -3, -12], ['oak', 8, -12], ['bench', 0, -5], ['bench', 5, -5], ['flowers', -2, -8], ['flowers', 7, -8],
      ...row('fence', -46, -14, -33, 2), ...row('fence', -46, -14, -17, 2), ...row('fence', 24, 50, -33, 2), ...row('fence', 24, 50, -17, 2),
      ...row('fence', -46, -16, 19, 2), ...row('fence', -46, -16, 35, 2),
      ['scarecrow', -30, -25], ['scarecrow', 36, -24], ['scarecrow', -34, 28], ['hay', -18, -20], ['hay', -17, -20], ['hay', 28, -20],
      ['hay', -20, 22], ['cart', 30, 3], ['barrel', 20, -2], ['crate', 28, -2], ['lamp', -12, -2], ['lamp', 12, 2], ['lamp', -40, 2], ['lamp', 40, -2],
      ['banner', -48, -3], ['banner', 48, -3], ['flowers', 18, 15], ['flowers', -26, 15], ['flowers', 44, 4],
    ],
    wanderers: [
      ['villager', 0, 0, 8], ['villager2', 22, 2, 6], ['villager3', -26, 2, 6], ['merchant', 0, 10, 2], ['chicken', 30, 14, 3],
      ['chicken', -38, 10, 3], ['cow', 38, 24, 3], ['sheep', -30, 28, 4], ['sheep', -36, -24, 4],
    ],
    gates: [[-50, 0], [50, 0], [12, -16]],
    stone: [-14, 4], portal: [0, 4],
  },
  {
    // 雪隘堡：冰封雪原里扼守山口的石头要塞。方形厚城墙、四角哨塔，只开南北两座城门，一条大路从中间穿过
    id: 'xueai', name: tl('雪隘堡'), region: 'snow', c: at(0.56, 0.28), theme: 'snowfort',
    intro: tl('扼守雪山关隘的石头要塞，方形厚城墙、四角哨塔，只开南北两道城门。铁匠铺、熔炉齐全，是北方采矿打怪的补给站。'),
    clear: [-42, -36, 42, 36],
    grounds: [rect('roadsnow', -2, -26, 2, 26), rect('roadsnow', -26, -2, 26, 2), rect('cobble', -6, -6, 6, 6)],
    walls: { prop: 'wall', shape: 'rect', hw: 30, hh: 24, gates: ['n', 's'] },
    buildings: [
      b('keep', -27, -21, 12, 9), b('bank', 6, -18, 6, 5, 'bank'), b('smithy', 15, -18, 7, 5, 'smithy'),
      b('furnace', 21, -8, 5, 4, 'furnace'), b('inn', 7, -9, 6, 5, 'kitchen'), b('apothecary', -24, -9, 6, 5, 'apothecary'),
      b('house3', -24, 8, 6, 5), b('house3', -14, 8, 6, 5), b('house3', 8, 8, 5, 4), b('house3', 16, 8, 5, 4), b('barn', 16, 16, 5, 4),
      b('watchtower', -31, -29, 3, 6), b('watchtower', 28, -29, 3, 6), b('watchtower', -31, 19, 3, 6), b('watchtower', 28, 19, 3, 6),
    ],
    props: [
      ['banner', -4, -26], ['banner', 4, -26], ['banner', -4, 26], ['banner', 4, 26], ['lamp', -4, -4], ['lamp', 4, -4], ['lamp', -4, 4], ['lamp', 4, 4],
      ['barrel', 22, -2], ['crate', 24, -2], ['barrel', -10, -4], ['crate', -12, 4], ['drift', -20, 16], ['drift', 20, 22], ['snowrock', -26, 20],
      ['dummy', -10, 18], ['dummy', -6, 18], ['cart', -14, 20],
    ],
    wanderers: [['guard', 0, -22, 2], ['guard', 0, 22, 2], ['guard', -18, 0, 4], ['villager3', 12, 0, 5], ['villager', -10, 14, 4], ['merchant', 10, -3, 2]],
    gates: [[0, -28], [0, 28]],
    stone: [-6, 12], portal: [6, 4],
  },
  {
    // 岩灯城：灰岩高地上依山而建的三层台地城，台地之间是石崖，靠石阶上下；满城挂灯笼，顶上一座灯塔
    id: 'yandeng', name: tl('岩灯城'), region: 'highland', c: at(0.74, 0.40), theme: 'lantern',
    intro: tl('依山而建的三层台地城，台地之间只能走石阶，满城挂着灯笼，最高处是一座灯塔。矿工之城，打造和冶炼设施齐全。'),
    clear: [-46, -36, 46, 30],
    grounds: [
      rect('cobble', -38, -24, 38, 22),
      rect('cliff', -38, -8, 38, -8), rect('gravel', -2, -8, 2, -8), rect('gravel', -27, -8, -24, -8), rect('gravel', 24, -8, 27, -8),
      rect('cliff', -38, 8, 38, 8), rect('gravel', -2, 8, 2, 8), rect('gravel', -27, 8, -24, 8), rect('gravel', 24, 8, 27, 8),
      rect('road', -2, -24, 2, 24),
    ],
    buildings: [
      b('lanterntower', -3, -34, 6, 10), b('bank', -22, -21, 6, 5, 'bank'), b('house3', -32, -20, 5, 4), b('house3', 22, -20, 6, 5),
      b('stall', 8, -14, 3, 2, 'market'), b('stall', 12, -14, 3, 2), b('stall', 16, -14, 3, 2),
      b('smithy', -32, -5, 7, 5, 'smithy'), b('furnace', -21, -4, 5, 4, 'furnace'), b('workshop', 12, -5, 6, 5, 'workshop'), b('house', 22, -4, 5, 4),
      b('house', -32, 12, 5, 4), b('house', -20, 12, 5, 4), b('inn', 8, 11, 6, 5, 'kitchen'), b('house', 20, 12, 5, 4),
    ],
    props: [
      ...row('lantern', -36, 36, -10, 6), ...row('lantern', -36, 36, 6, 6), ...row('lantern', -34, 34, 21, 8),
      ['barrel', -12, -1], ['crate', -11, -1], ['cart', -12, 3], ['rock', -36, 18], ['boulder', 34, -16], ['bench', 6, 2], ['bench', -6, 2],
    ],
    wanderers: [['villager', 0, -14, 6], ['villager2', -14, 0, 6], ['villager3', 16, 16, 5], ['merchant', 12, -12, 3], ['guard', 0, 24, 2]],
    gates: [[0, 27], [-41, 0], [41, 0]],
    stone: [-6, 2], portal: [6, 18],
  },
  {
    // 珊瑚港：金沙海岸东岸的海港。白墙蓝顶的房子沿着港口大街排开，三条栈桥伸进海峡，栈桥尽头有灯塔
    id: 'coralport', name: tl('珊瑚港'), region: 'coast', c: { x: OLD_BOX.x + OLD_BOX.size - 60, y: at(0, 0.51).y }, theme: 'port',
    intro: tl('海峡边的白墙蓝顶海港，三条栈桥伸进海里，最长那条尽头立着灯塔。能在栈桥上钓海鱼，集市里有水手和渔夫。'),
    clear: [-46, -30, 92, 30],
    grounds: [
      rect('ocean', 30, -26, 92, 26), rect('beach', 24, -26, 29, 26),
      rect('cobble', -38, -1, 30, 1), rect('cobble', 18, -24, 23, 24),
      rect('bridge', 30, -1, 84, 1), rect('bridge', 30, -14, 62, -12), rect('bridge', 30, 12, 62, 14),
      rect('cobble', 76, -12, 86, -2),
    ],
    buildings: [
      b('lighthouse', 79, -14, 4, 8), b('bank', -12, -7, 6, 5, 'bank'), b('inn', -2, -7, 6, 5, 'kitchen'), b('apothecary', 8, -7, 6, 5, 'apothecary'),
      b('house', -30, -16, 5, 4), b('house2', -20, -16, 5, 4), b('warehouse', 4, -20, 8, 5),
      b('house', -30, 4, 5, 4), b('house2', -20, 4, 5, 4), b('house', -10, 4, 5, 4), b('warehouse', 2, 5, 8, 5),
      b('stall', 19, 4, 3, 2, 'market'), b('stall', 19, 8, 3, 2), b('stall', 19, -8, 3, 2),
    ],
    props: [
      ['boat', 40, -6], ['boat', 52, 6], ['boat', 68, 8], ['boat', 44, 18], ['boat', 70, -18],
      ...col('barrel', 24, -22, -16, 3), ...col('crate', 24, 16, 22, 3), ...row('lamp', 30, 84, -2, 9),
      ['banner', -38, -3], ['bench', 14, 3], ['cart', 14, -10], ['shell', 26, -4], ['shell', 27, 9], ['palm', -36, -10], ['palm', -36, 12],
    ],
    wanderers: [['villager', 0, 0, 8], ['villager2', 20, 0, 6], ['merchant', 20, 6, 2], ['villager3', -24, 0, 6], ['guard', 60, 0, 3], ['villager', 50, -13, 4]],
    gates: [[-40, 0], [0, -26], [0, 26]],
    stone: [-26, -3], portal: [14, -3], fish: [58, -15],
  },
  {
    // 灰烬营地：熔岩荒地里的前线营地。一圈尖木栅栏围成圆形，中间燃着篝火，四周是帐篷和铁匠炉
    id: 'ashcamp', name: tl('灰烬营地'), region: 'lava', c: at(0.70, 0.76), theme: 'ashcamp',
    intro: tl('火山荒地里用尖木栅栏围成的圆形营地，中间燃着篝火，四周是帐篷、铁匠炉和熔炉。熔岩区打怪的前线补给点。'),
    clear: [-40, -40, 40, 40],
    grounds: [{ g: 'roaddark', disk: [0, 0, 27] }, rect('roaddark', -2, -32, 2, 32), rect('roaddark', -32, -2, 32, 2)],
    walls: { prop: 'palisade', shape: 'circle', hw: 28, hh: 28, gates: ['n', 's', 'w', 'e'] },
    buildings: [
      b('bonfire', -1, -1, 3, 3), b('smithy', -9, -22, 7, 5, 'smithy'), b('furnace', 4, -21, 5, 4, 'furnace'),
      b('bank', -24, -8, 6, 5, 'bank'), b('apothecary', 18, -8, 6, 5, 'apothecary'), b('inn', 6, 8, 6, 5, 'kitchen'),
      b('tent', -18, -14, 4, 3), b('tent', 12, -14, 4, 3), b('tent', -20, 7, 4, 3), b('tent', 16, 16, 4, 3), b('tent', -13, 15, 4, 3), b('tent', -8, 20, 4, 3),
      b('watchtower', -24, -18, 3, 6), b('watchtower', 21, 14, 3, 6),
    ],
    props: [
      ['barrel', -6, -14], ['barrel', -5, -14], ['crate', 8, -14], ['banner', -4, -30], ['banner', 4, -30], ['banner', -30, -4], ['banner', 30, -4],
      ['ember', -8, 4], ['ember', 8, -4], ['skull', -16, 22], ['bones', 20, 4], ['dummy', -10, 6], ['cart', 22, -12], ['crate', -22, 4],
    ],
    wanderers: [['guard', 0, -26, 2], ['guard', 0, 26, 2], ['guard', -26, 0, 2], ['guard', 26, 0, 2], ['villager3', -10, 0, 6], ['merchant', 10, 2, 4]],
    gates: [[0, -32], [0, 32], [-32, 0], [32, 0]],
    stone: [-6, -6],
  },
  {
    // 晶辉要塞：晶簇荒原上的菱形晶墙要塞。东南西三个尖角是城门，北尖角是一座发光的晶塔，地面铺着白石
    id: 'crystalfort', name: tl('晶辉要塞'), region: 'crystal', c: atW(0.51, 0.9), theme: 'crystal',
    intro: tl('菱形晶墙围起来的白石要塞，东、南、西三个尖角开门，北尖角上的晶塔日夜发光。珍材坊、药剂铺、集市都在，是晶簇荒原的大本营。'),
    clear: [-46, -46, 46, 46],
    grounds: [{ g: 'marble', diamond: 33 }, rect('crystalground', -2, -15, 2, 36), rect('crystalground', -36, -2, 36, 2)],
    walls: { prop: 'crystalwall', shape: 'diamond', hw: 34, hh: 34, gates: ['s', 'w', 'e'] },
    buildings: [
      b('crystaltower', -3, -27, 7, 12), b('bank', -16, -9, 6, 5, 'bank'), b('atelier', 8, -9, 7, 5, 'atelier'),
      b('apothecary', -18, 4, 6, 5, 'apothecary'), b('stall', 7, 6, 3, 2, 'market'), b('stall', 11, 6, 3, 2),
      b('house3', -9, 14, 5, 4), b('house3', 4, 14, 5, 4),
    ],
    props: [
      ['crystalspire', -12, -18], ['crystalspire', 12, -18], ['crystalspire', -22, -6], ['crystalspire', 22, -6], ['crystal', -6, 24], ['crystal', 6, 24],
      ['lamp', -4, -4], ['lamp', 4, -4], ['lamp', -4, 4], ['lamp', 4, 4], ['bench', -8, -2], ['bench', 8, -2], ['banner', -4, 36], ['banner', 4, 36],
    ],
    wanderers: [['guard', 0, -30, 2], ['guard', 0, 30, 2], ['villager2', -8, 0, 6], ['villager3', 8, 10, 4], ['merchant', 9, 8, 2]],
    gates: [[0, 38], [-38, 0], [38, 0]],
    stone: [0, 8], portal: [-6, 8],
  },
  {
    // 遗忘哨塔：腐月湿地的高脚水上哨站。整座镇子建在紫色沼水上，靠木栈道连起来，中间一座高高的哨塔
    id: 'forgotten', name: tl('遗忘哨塔'), region: 'moonmire', c: atF(0.06, 0.8), theme: 'stilt',
    intro: tl('建在紫色沼水上的高脚哨站，房子立在木桩上，靠栈道连起来，北边的高塔亮着紫灯。能在栈道上钓月沼的鱼。'),
    clear: [-48, -40, 48, 40],
    grounds: [
      rect('moonwater', -36, -30, 36, 26),
      rect('bridge', -44, -1, 44, 1), rect('bridge', -1, -20, 1, 30), rect('bridge', -25, -17, 25, -15), rect('bridge', -25, 14, 25, 16),
      rect('bridge', -25, -17, -23, 16), rect('bridge', 23, -17, 25, 16), rect('bridge', -5, -20, 5, -18),
    ],
    buildings: [
      b('watchtower', -2, -29, 5, 9), b('bank', -14, -7, 6, 5, 'bank'), b('apothecary', 6, -7, 6, 5, 'apothecary'),
      b('inn', -14, 8, 6, 5, 'kitchen'), b('stilthouse', 6, 9, 5, 4), b('stilthouse', 14, 9, 5, 4),
      b('stilthouse', -20, 3, 5, 4), b('stilthouse', 14, -12, 5, 4), b('stilthouse', -20, -12, 5, 4),
    ],
    props: [
      ...row('lantern', -40, 40, -2, 8), ...row('lantern', -24, 24, 17, 8), ['reeds', -32, -26], ['reeds', 30, 22], ['reeds', -30, 20], ['moonflower', 28, -26],
      ['crate', 4, 2], ['barrel', -4, 2],
    ],
    wanderers: [['villager3', 0, 0, 10], ['guard', 0, -20, 2], ['villager', -24, 0, 6], ['merchant', 12, 0, 3]],
    gates: [[-46, 0], [46, 0], [0, 32]],
    stone: [-6, -1], fish: [30, -2],
  },
  {
    // 虚辉遗都：星陨晶海岛上的上古遗都。白石广场上一排排石柱，大多已经断了，中间的神殿修好了当作仓库
    id: 'voidruins', name: tl('虚辉遗都'), region: 'starsea', c: atF(0.68, 0.945), theme: 'ruins',
    intro: tl('晶海孤岛上的上古遗都，白石广场两侧是一排排断裂的石柱，中间的神殿被修好当作仓库。最外圈的终局城镇，有遗物商人和珍材坊。'),
    clear: [-44, -36, 44, 36],
    grounds: [rect('marble', -30, -22, 30, 22), rect('marble', -2, 22, 2, 30), rect('marble', -38, -2, 38, 2)],
    buildings: [
      b('temple', -6, -24, 13, 9, 'bank'), b('ruin', -26, -14, 7, 5), b('ruin', 19, -14, 7, 5), b('ruin', -26, 8, 7, 5), b('ruin', 19, 9, 6, 4),
      b('stall', -12, 6, 3, 2, 'market'), b('atelier', 5, 4, 7, 5, 'atelier'),
    ],
    props: [
      ...col('pillar', -6, -12, 18, 5), ...col('pillar', 6, -12, -2, 5), ...col('brokenpillar', 6, 3, 18, 5),
      ['brokenpillar', -16, -4], ['brokenpillar', 14, -6], ['brokenpillar', -18, 18], ['pillar', 16, 18],
      ['crystalspire', -28, -20], ['crystalspire', 28, -20], ['crystal', -28, 20], ['crystal', 28, 20], ['starshard', -14, 0], ['starshard', 14, 2],
    ],
    wanderers: [['villager3', 0, 0, 8], ['merchant', -11, 9, 2], ['guard', 0, 26, 2]],
    gates: [[0, 32], [-40, 0], [40, 0]],
    stone: [0, 10],
  },
];

export const TOWN_BY_ID: Record<string, TownDef> = Object.fromEntries(TOWNS.map((t) => [t.id, t]));
export const townAt = (t: TownDef, x: number, y: number) => ({ x: t.c.x + x, y: t.c.y + y });
/** 设施点位：建筑门口下方一格 */
export const doorOf = (t: TownDef, bd: TownBuilding) => townAt(t, bd.x + Math.floor(bd.w / 2), bd.y + bd.h);
