import type { RegionId } from './types';

/*
 * 永冬冰原（用户 11-01）：3680×3680 的特殊地图，放在 12080 主大陆东边、隔着一道深海。
 * 和主大陆用同一套坐标（地图宽度从 12080 加到 16160），所以地点、寻路、战斗都照旧能用；
 * 两边之间只能走「永冬传送门」：苍岭城、落霞城城外各一座，冰原南边的永冬营地有一座回程门。
 * 冰原上没有采集资源，只有限时刷出的怪物、首领和宝箱（见 core/realmSpawns.ts）。
 *
 * 地形（从南往北）：营地 → 冻土荒原 → 西霜松冻林 / 东冰湖群 → 横贯的冰裂峡谷（3 座冰桥）
 * → 西北冰川山脉 / 东北冰封废墟 → 北部极光高地 → 最北的永冬裂隙。等级 95-135，越往北越难。
 */

/** 主大陆（12080）的边长：老坐标、存档位置换算、外海轮廓都按这个算 */
export const MAIN_SIZE = 12080;
/** 冰原方框：主大陆东边隔 400 格深海，南北居中 */
export const REALM_BOX = { x: MAIN_SIZE + 400, y: Math.round((MAIN_SIZE - 3680) / 2), size: 3680 };
/** 整张世界的宽高：宽度包含冰原 */
export const WORLD_W = REALM_BOX.x + REALM_BOX.size;
export const WORLD_H = MAIN_SIZE;

/** 冰原那一边（包括中间的深海） */
export const inRealm = (p: { x: number; y: number }) => p.x >= MAIN_SIZE;
/** 冰原方框里的相对坐标 */
export const atR = (u: number, v: number) => ({ x: REALM_BOX.x + Math.round(u * (REALM_BOX.size - 1)), y: REALM_BOX.y + Math.round(v * (REALM_BOX.size - 1)) });

export const REALM_REGIONS = ['tundra', 'frostpine', 'icelakes', 'icerift', 'glacier', 'frozenruins', 'aurorahigh', 'everrift'] as const satisfies readonly RegionId[];
export type RealmRegion = (typeof REALM_REGIONS)[number];
export const isRealmRegion = (r: RegionId): r is RealmRegion => (REALM_REGIONS as readonly string[]).includes(r);

/** 各区的等级范围（用户 11-01：统一调高，别太简单） */
export const REALM_LEVELS: Record<RealmRegion, [number, number]> = {
  tundra: [95, 105],
  frostpine: [100, 110],
  icelakes: [100, 110],
  icerift: [105, 115],
  glacier: [110, 122],
  frozenruins: [110, 122],
  aurorahigh: [118, 128],
  everrift: [125, 135],
};

/** 区域形状点（冰原方框里的相对坐标） */
export const REALM_SEEDS: [number, number, RealmRegion][] = [
  [0.12, 0.92, 'tundra'], [0.3, 0.88, 'tundra'], [0.5, 0.83, 'tundra'], [0.7, 0.88, 'tundra'], [0.88, 0.92, 'tundra'], [0.5, 0.97, 'tundra'], [0.2, 0.97, 'tundra'], [0.8, 0.97, 'tundra'],
  [0.12, 0.68, 'frostpine'], [0.26, 0.62, 'frostpine'], [0.38, 0.7, 'frostpine'], [0.16, 0.76, 'frostpine'], [0.3, 0.76, 'frostpine'],
  [0.62, 0.7, 'icelakes'], [0.74, 0.62, 'icelakes'], [0.88, 0.68, 'icelakes'], [0.7, 0.76, 'icelakes'], [0.84, 0.77, 'icelakes'],
  // 峡谷本身是深谷，形状点放在两岸
  [0.08, 0.44, 'icerift'], [0.24, 0.565, 'icerift'], [0.4, 0.44, 'icerift'], [0.56, 0.565, 'icerift'], [0.72, 0.44, 'icerift'], [0.9, 0.565, 'icerift'],
  [0.1, 0.3, 'glacier'], [0.22, 0.24, 'glacier'], [0.32, 0.34, 'glacier'], [0.12, 0.16, 'glacier'],
  [0.68, 0.34, 'frozenruins'], [0.8, 0.26, 'frozenruins'], [0.9, 0.34, 'frozenruins'], [0.88, 0.16, 'frozenruins'],
  [0.42, 0.22, 'aurorahigh'], [0.5, 0.3, 'aurorahigh'], [0.58, 0.22, 'aurorahigh'], [0.36, 0.12, 'aurorahigh'], [0.64, 0.12, 'aurorahigh'],
  [0.5, 0.06, 'everrift'], [0.4, 0.03, 'everrift'], [0.6, 0.03, 'everrift'], [0.26, 0.04, 'everrift'], [0.74, 0.04, 'everrift'],
];

/** 冰裂峡谷：横贯中部的深谷（相对坐标 v 的中线和半宽），只有这三座冰桥能过 */
export const RIFT = { v: 0.5, half: 0.022, bridges: [0.2, 0.5, 0.8], bridgeHalf: 0.006 };

/**
 * 神秘区域（用户 11-01）：1444×1444，接在冰原最北边、永冬裂隙后面，暂未揭晓。
 * 地面和冰原连着，但边界上有空气墙，角色进不去；世界地图上这一块是一片黑雾「暂未开放」。
 */
export const MYSTERY_BOX = { x: REALM_BOX.x + Math.round((REALM_BOX.size - 1444) / 2), y: REALM_BOX.y - 1444, size: 1444 };
export const inMystery = (x: number, y: number) =>
  x >= MYSTERY_BOX.x && x < MYSTERY_BOX.x + MYSTERY_BOX.size && y >= MYSTERY_BOX.y && y < MYSTERY_BOX.y + MYSTERY_BOX.size;
/** 空气墙：神秘区域外面再留 4 格，角色贴不到黑雾里去 */
export const MYSTERY_WALL = 4;
export const behindAirWall = (x: number, y: number) =>
  x >= MYSTERY_BOX.x - MYSTERY_WALL && x < MYSTERY_BOX.x + MYSTERY_BOX.size + MYSTERY_WALL && y < MYSTERY_BOX.y + MYSTERY_BOX.size + MYSTERY_WALL && y >= MYSTERY_BOX.y - MYSTERY_WALL;

/** 永冬营地（安全区）：回程传送门、仓库、石碑都在这里 */
export const CAMP = atR(0.5, 0.9);
export const CAMP_R = 34;

/** 主大陆上的两座永冬传送门：苍岭城、落霞城城外，相对城中心的偏移由 data.ts 摆 */
export const PORTAL_MS = 4000;

// ---- 限时刷新（用户 11-01：冰原上只有限时怪物、限时首领和限时宝箱，每个刷出来存在 30 分钟，到时间就消失） ----

/** 每个限时点刷出来存在多久 */
export const SPAWN_LIFE = 30 * 60_000;
export type TimedKind = 'mob' | 'elite' | 'boss' | 'chest';
export interface Timed {
  kind: TimedKind;
  /** 多久轮一次（毫秒），每轮开头刷出来、存在 SPAWN_LIFE */
  period: number;
  /** 这一轮从什么时候开始算（错开各个点，不会同时刷） */
  offset: number;
  /** 每一轮刷出来的概率（确定性：同一时间所有玩家看到的一样） */
  chance: number;
}
/** 各类限时点的节奏：怪物 45 分钟一轮、精英 1 小时、首领 2 小时（两个首领错开 1 小时）、宝箱 40 分钟 */
export const TIMED_RULES: Record<TimedKind, { period: number; chance: number }> = {
  mob: { period: 45 * 60_000, chance: 0.75 },
  elite: { period: 60 * 60_000, chance: 0.6 },
  boss: { period: 120 * 60_000, chance: 1 },
  chest: { period: 40 * 60_000, chance: 0.55 },
};

/** 字符串 + 整数的确定性哈希（0-1） */
export function strHash(s: string, k: number) {
  let h = (k * 2654435761) | 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 这个限时点在 now 这一刻有没有刷出来：有就返回这一轮的开始和结束时间 */
export function timedWindow(n: { id: string; timed?: Timed }, now: number): { start: number; end: number; round: number } | null {
  const t = n.timed;
  if (!t) return null;
  const round = Math.floor((now - t.offset) / t.period);
  const start = round * t.period + t.offset;
  if (now - start >= SPAWN_LIFE) return null;
  if (strHash(n.id, round) >= t.chance) return null;
  return { start, end: start + SPAWN_LIFE, round };
}
/** 下一次刷出来是什么时候（最多往后找 48 轮） */
export function nextWindow(n: { id: string; timed?: Timed }, now: number): { start: number; end: number; round: number } | null {
  const t = n.timed;
  if (!t) return null;
  const cur = timedWindow(n, now);
  if (cur) return cur;
  const r0 = Math.floor((now - t.offset) / t.period) + 1;
  for (let round = r0; round < r0 + 48; round++) {
    if (strHash(n.id, round) < t.chance) {
      const start = round * t.period + t.offset;
      return { start, end: start + SPAWN_LIFE, round };
    }
  }
  return null;
}

/** 宝箱的品质：绿 70%、蓝 25%、金 5%（同一轮所有玩家开到的品质一样） */
export type ChestTier = 'green' | 'blue' | 'gold';
export function chestTier(id: string, round: number): ChestTier {
  const r = strHash(id, round * 7 + 3);
  return r < 0.05 ? 'gold' : r < 0.3 ? 'blue' : 'green';
}
/** 开箱要多久 */
export const CHEST_OPEN_MS = 10_000;
