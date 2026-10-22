export const MAX_LEVEL = 99;

/** XP_TABLE[L] = 达到 L 级所需的总经验（RuneScape 式指数曲线，99 级约 1300 万） */
export const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

export function levelForXp(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
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
  if (lvl >= MAX_LEVEL) return 1;
  const start = XP_TABLE[lvl];
  return (xp - start) / (XP_TABLE[lvl + 1] - start);
}
