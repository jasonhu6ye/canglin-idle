import { tl } from '../i18n';
/*
 * 万圣节限定活动（用户 10-24）：苍岭城东边的活动祭坛可以召唤南瓜王，
 * 5 档难度（30 级起），每小时召唤一次，打赢掉南瓜礼盒，礼盒开出南瓜积分（在祭坛面板兑换南瓜坐骑）。
 * 活动到 11 月 1 日 0 点（本地时间）关闭。这里只放常量和纯函数，data/sim/ui 都从这里取。
 */

/** 活动结束时间：2026 年 11 月 1 日 0 点（玩家本地时间） */
export const HW_END = new Date(2026, 10, 1).getTime();
/** 召唤冷却：1 小时 */
export const HW_COOLDOWN = 3_600_000;
export const HW_ALTAR = 'hw_altar';
export const HW_BOX = 'pumpkin_box';
export const HW_POINT = 'pumpkin_pt';

/** 五档难度：南瓜王等级、打赢给几个礼盒 */
export const HW_TIERS = [
  { lv: 30, boxes: 1, name: tl('难度一') },
  { lv: 50, boxes: 2, name: tl('难度二') },
  { lv: 70, boxes: 4, name: tl('难度三') },
  { lv: 95, boxes: 6, name: tl('难度四') },
  { lv: 120, boxes: 10, name: tl('难度五') },
] as const;
export const hwBossId = (d: number) => `pumpkin_king_${d + 1}`;
export const hwFight = (d: number) => `fight_${hwBossId(d)}`;
/** 南瓜王的 id 对应第几档，不是南瓜王返回 -1 */
export const hwTierOf = (monsterId: string) => {
  const m = /^pumpkin_king_(\d)$/.exec(monsterId);
  return m ? Number(m[1]) - 1 : -1;
};

/**
 * 南瓜坐骑（用户 10-27）：用南瓜积分兑换，移速 +200%。
 * 用户 10-30 要求提前公开：从 10 月 30 日 0 点（本地）起祭坛面板显示、可以兑换，祭坛旁边摆着一只；
 * 活动结束后积分还能拿来换。每个存档限一只。
 */
export const HW_MOUNT = 'mount_pumpkin';
export const HW_MOUNT_COST = 1000;
export const HW_REVEAL = new Date(2026, 9, 30).getTime();
export const hwShopOpen = (now: number) => now >= HW_REVEAL;

export const hwOpen = (now: number) => now < HW_END;
/** 还要等多久才能再召唤（毫秒，0 表示现在就行） */
export const hwWait = (last: number | undefined, now: number) => (last === undefined ? 0 : Math.max(0, last + HW_COOLDOWN - now));
