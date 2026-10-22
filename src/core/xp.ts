/**
 * 技能等级没有上限。XP_TABLE[L] = 达到 L 级所需的总经验。
 *
 * 每级所需经验 = 9.5 × L^1.2 × 1.075^L，99 级以后每级的增长稍放缓（×0.985^(L-99)）。
 * 按挂机挖矿的速度估算（含等级加速和对应阶级的工具，T8 在 95 级解锁）：
 *   10 级约 6 分钟，30 级约 50 分钟，50 级约 4 小时，70 级约 20 小时，
 *   95 级约 145 小时，120 级约 800 小时，140 级约 3000 小时。
 */
const TABLE_LEVELS = 1000;

export const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  for (let lvl = 1; lvl < TABLE_LEVELS; lvl++) {
    const need = 9.5 * Math.pow(lvl, 1.2) * Math.pow(1.075, lvl) * Math.pow(0.985, Math.max(0, lvl - 99));
    table.push(table[lvl] + Math.round(need));
  }
  return table;
})();

export function levelForXp(xp: number): number {
  let lo = 1;
  let hi = TABLE_LEVELS;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 当前等级内的进度 0-1 */
export function levelProgress(xp: number): number {
  const lvl = levelForXp(xp);
  if (lvl >= TABLE_LEVELS) return 1;
  const start = XP_TABLE[lvl];
  return (xp - start) / (XP_TABLE[lvl + 1] - start);
}

/** 每级收益：非战斗技能每级加快 0.5% 的动作速度 */
export const SPEED_PER_LEVEL = 0.005;
/** 等级每高出动作要求 1 级：采集类 +0.2% 双倍产出，生产类 +0.2% 不消耗材料 */
export const BONUS_PER_LEVEL = 0.002;
