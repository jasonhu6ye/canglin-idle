/* 地图尺寸和几层方框的坐标换算，data.ts、towns.ts 共用 */

/** 世界大小：1080 → 1480 → 2188 → 5088 → 8848 → 12080（用户 10-24 给了新版世界地图） */
export const MAP_W = 12080;
export const MAP_H = 12080;
/**
 * 12080 大地图（用户 10-24）：原来 8848 的世界原样放在正中间这个方框里（格子尺寸不变，老地方之间走路时间不变），
 * 外面一圈是海、群岛和 8 个新群系
 */
export const MID_BOX = { x: 1616, y: 1616, size: 8848 };
/** 再往里：5088 时代的老地图（8848 的时候放在 1880,1880） */
export const OLD_BOX = { x: MID_BOX.x + 1880, y: MID_BOX.y + 1880, size: 5088 };

/** 5088 老地图（最里面的方框）里的相对坐标 */
export const at = (u: number, v: number) => ({ x: OLD_BOX.x + Math.round(u * (OLD_BOX.size - 1)), y: OLD_BOX.y + Math.round(v * (OLD_BOX.size - 1)) });
/** 8848 方框里的相对坐标（10-23 那一圈外圈区域用） */
export const atW = (u: number, v: number) => ({ x: MID_BOX.x + Math.round(u * (MID_BOX.size - 1)), y: MID_BOX.y + Math.round(v * (MID_BOX.size - 1)) });
/** 整张 12080 大地图的相对坐标（10-24 最外圈的新群系用） */
export const atF = (u: number, v: number) => ({ x: Math.round(u * (MAP_W - 1)), y: Math.round(v * (MAP_H - 1)) });
