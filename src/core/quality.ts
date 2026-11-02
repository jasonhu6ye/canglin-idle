import { tl, tlc } from '../i18n';

/*
 * 装备和工具的品质（用户 10-25）：普通/良好/优秀/史诗/传说/神话，白/绿/蓝/紫/金/红。
 * 制作时随机出品质；T 级越高，高品质越难出。品质高的属性更高、卖价和分解金币更多。
 * 物品 id：普通就是原来的 id（老存档不用改），其余是「原 id@q1」…「原 id@q5」。
 */
export const QUALITY_NAME = [tlc('quality', '普通'), tl('良好'), tl('优秀'), tl('史诗'), tl('传说'), tl('神话')];
export const QUALITY_COLOR = ['#e8e8e8', '#5ad05a', '#4a9aff', '#b060ff', '#ffb020', '#ff4040'];
/** 攻击、力量、防御乘这个 */
export const QUALITY_STAT = [1, 1.1, 1.22, 1.36, 1.55, 1.8];
/** 工具速度加成乘这个 */
export const QUALITY_SPEED = [1, 1.1, 1.2, 1.32, 1.48, 1.7];
/** 幽魂链刃的连斩概率乘这个（10-31）：17% → 19/21/24/28/34% */
export const CHAIN_QUALITY = [1, 1.12, 1.25, 1.42, 1.65, 2];
/** 卖价、分解金币乘这个 */
export const QUALITY_VALUE = [1, 1.5, 2.5, 4, 7, 12];
/** T1 的出货率（百分比）：普通 60、良好 26、优秀 9.5、史诗 3.2、传说 1、神话 0.3 */
const ODDS_T1 = [60, 26, 9.5, 3.2, 1, 0.3];

export const qid = (base: string, q: number) => (q > 0 ? `${base}@q${q}` : base);
export const qualityOf = (id: string) => {
  const m = /@q(\d)$/.exec(id);
  return m ? Number(m[1]) : 0;
};
/** 名字上色用的 class：普通没有 */
export const qClass = (q: number | undefined) => (q ? `qn${q}` : '');
export const baseOf = (id: string) => id.replace(/@q\d$/, '');

/**
 * 精炼石（用户 11-02）：制作装备时加一颗，优秀、史诗的概率 ×2.5，传说、神话不变，多出来的从普通里扣。
 * 例：T1 优秀 9.5% → 23.75%、史诗 3.2% → 8%；T8 优秀 4.85% → 12.1%、史诗 1.63% → 4.1%
 */
export const FINE_MULT = 2.5;
/** 某个 T 级（0 = T1）各品质的出货率，百分比，加起来 100。每高一阶，良好以上的概率乘 (1 - 7%×阶)；fine = 加了精炼石 */
export function qualityOdds(tier = 0, fine = false, gm = 0): number[] {
  const f = Math.max(0.3, 1 - 0.07 * tier);
  // gm = GM「制作品质」增益（0.5 = +50%）：良好、优秀、史诗再乘 (1+gm)，传说神话不变；普通最少留 5%
  const g = (i: number) => (gm > 0 && i <= 2 ? 1 + gm : 1);
  let hi = ODDS_T1.slice(1).map((p, i) => p * f * (fine && (i === 1 || i === 2) ? FINE_MULT : 1) * g(i));
  const top = hi.reduce((a, b) => a + b, 0);
  if (gm > 0 && top > 95) {
    const fixed = hi.slice(3).reduce((a, b) => a + b, 0), boosted = top - fixed;
    hi = hi.map((p, i) => (i <= 2 ? (p * (95 - fixed)) / boosted : p));
  }
  hi = hi.map((p) => Math.round(p * 1000) / 1000);
  return [Math.round((100 - hi.reduce((a, b) => a + b, 0)) * 1000) / 1000, ...hi];
}

/** r 是 0-1 的随机数 */
export function rollQuality(tier: number | undefined, r: number, fine = false, gm = 0): number {
  const odds = qualityOdds(tier ?? 0, fine, gm);
  let x = r * 100;
  for (let q = odds.length - 1; q > 0; q--) {
    if (x < odds[q]) return q;
    x -= odds[q];
  }
  return 0;
}
