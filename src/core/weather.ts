import type { RegionId } from './types';

/**
 * 昼夜和天气（纯按现实时间算，地图画面和结算用同一个钟）：
 * 一个游戏日 = 现实 24 分钟；天气按 8 分钟一段随机。
 */
export const DAY_MS = 24 * 60 * 1000;
const WEATHER_MS = 8 * 60 * 1000;

/** 当前游戏内的小时（0-24，带小数） */
export const gameHour = (now = Date.now()) => ((now % DAY_MS) / DAY_MS) * 24;

function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 雨只下在会下雨的地方：雪原下雪、熔岩和深渊不下 */
const RAINY: Partial<Record<RegionId, number>> = {
  town: 0.3, woodland: 0.45, giantwood: 0.4, swamp: 0.55, coast: 0.35, highland: 0.3,
  savanna: 0.15, autumn: 0.35, jungle: 0.65, tropic: 0.4, canyon: 0.08,
};
export const isRaining = (region: RegionId, now = Date.now()) =>
  hash(Math.floor(now / WEATHER_MS), 7, 31) < (RAINY[region] ?? 0);

/** 雨天钓鱼（用户 10-23）：在下雨的地方钓鱼快 25%，雨停就没了 */
export const RAIN_FISH = 0.25;
