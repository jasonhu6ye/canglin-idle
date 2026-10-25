import { tl } from '../i18n';
/*
 * 畜牧站养马（用户 10-24）：野马有几率掉小马崽，拿到城镇畜牧站的栏里养 1 小时长成坐骑马。
 * 养殖等级越高长得越快（线性），每养大一匹给养殖经验。马的速度资质 50%-200% 随机，成年才揭晓。
 */
export const FOAL = 'foal';
export const RANCH = 'ranch';
/** 畜牧站有几个栏位 */
export const RANCH_PENS = 3;
export const FOAL_MS = 3_600_000;
/** 每升一级成长时间少 0.6%，最多少到 40%（约 100 级封顶） */
export const growMs = (lv: number) => Math.round(FOAL_MS * Math.max(0.4, 1 - 0.006 * (lv - 1)));
export const APT_MIN = 50;
export const APT_MAX = 200;
/** 养大一匹给多少养殖经验 */
export const HORSE_XP = 600;
export const horseItem = (apt: number) => `mount_horse_${apt}`;
/** 坐骑马的速度资质（百分比），不是马返回 0 */
export const aptOf = (id: string | undefined) => {
  const m = /^mount_horse_(\d+)$/.exec(id ?? '');
  return m ? Number(m[1]) : 0;
};
/** 小马崽掉落几率：普通野马 3%，精英 6% */
export const FOAL_CHANCE = { normal: 0.03, elite: 0.06, boss: 0.1 } as const;
/** 毛色按资质分四档：栗色 50-99、乌骓 100-149、银白 150-189、金鬃 190-200 */
export const coatOf = (apt: number) => (apt >= 190 ? 3 : apt >= 150 ? 2 : apt >= 100 ? 1 : 0);
export const COAT_NAME = [tl('栗色骏马'), tl('乌骓马'), tl('银白骏马'), tl('金鬃神驹')];
