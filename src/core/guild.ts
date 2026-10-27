import type { GameState } from './types';
import { ITEMS, SCROLL_TOWN, TIERS } from './data';
import { tl } from '../i18n';
import { nextRandom } from './rng';

/*
 * 公会等级、贡献、每日任务（用户 10-26）、科技和商店（10-27）。服务器记账（supabase/schema.sql 的 exchange_items / contribute / guild_deposit…），
 * 等级表和任务生成在这里，两边的数要对得上：GUILD_XP 改了要同步改 SQL 里的 guild_xp_table()；
 * 物品价格和商店在 supabase/guild-data.sql，由 guildSql.ts 生成（guild.test 会检查是不是最新的）。
 */

/** 升到第 n 级要的累计公会经验（下标 0 = 1 级），最高 10 级 */
export const GUILD_XP = [0, 5000, 15000, 35000, 70000, 120000, 200000, 320000, 500000, 800000];
export const GUILD_MAX_LV = GUILD_XP.length;
export const guildLevelOf = (xp: number) => GUILD_XP.filter((x) => x <= xp).length || 1;
/** 人数上限、仓库格子（种类数），和 SQL 一致 */
export const guildMembersCap = (lv: number) => 30 + 2 * (Math.max(1, lv) - 1);
export const guildSlots = (lv: number) => 30 + 10 * (Math.max(1, lv) - 1);

/**
 * 贡献靠物品兑换（用户 10-26）：每 10 金币价值 = 1 点贡献，同时给公会 1 点经验和 1 点公会贡献值；每人每天最多换 2000 贡献。
 * 公会贡献值（Guild.points）由会长和副会长花，用来开私人仓库。
 */
export const VALUE_PER_CONTRIB = 10;
export const EXCHANGE_DAY_MAX = 2000;
/** 一次兑换 qty 个能得几点贡献 */
export const exchangeGain = (value: number, qty: number) => Math.floor((Math.max(1, value) * qty) / VALUE_PER_CONTRIB);
/** 私人仓库：最多 3 个，第 1/2/3 个花的公会贡献值，每个放 30 种（和 SQL vault_cost 一致） */
export const VAULT_COST = [5000, 15000, 40000];
export const VAULT_SLOTS = 30;

/** 公会加成：2 级起每级经验 +1%、金币 +2%，每两级干活速度 +1%。加在所有成员身上，离线也算（等级存在存档里） */
export type GuildPerk = 'xp' | 'coins' | 'speed';
export function guildPerks(lv: number): Record<GuildPerk, number> {
  const n = Math.max(0, Math.min(GUILD_MAX_LV, lv) - 1);
  return { xp: n * 0.01, coins: n * 0.02, speed: Math.floor(n / 2) * 0.01 };
}
/**
 * 公会科技（10-27）：会长和副会长花公会贡献值升级，每项最高 5 级、不超过公会等级的一半。
 * 第 n 级花 3000×2^(n-1)，和 SQL upgrade_tech 一致
 */
export type TechId = 'xp' | 'speed' | 'coins' | 'drop';
export const GUILD_TECH: { id: TechId; name: string; desc: string; per: number }[] = [
  { id: 'xp', name: tl('经验研习'), desc: tl('所有技能获得的经验'), per: 0.01 },
  { id: 'speed', name: tl('工艺精进'), desc: tl('采集和制作的速度'), per: 0.01 },
  { id: 'coins', name: tl('商路拓展'), desc: tl('打怪掉的金币'), per: 0.02 },
  { id: 'drop', name: tl('寻宝秘术'), desc: tl('几率掉落物的掉率'), per: 0.02 },
];
export const TECH_MAX = 5;
export const techCap = (guildLv: number) => Math.min(TECH_MAX, Math.floor(guildLv / 2));
export const techCost = (cur: number) => 3000 * 2 ** cur;
/** 存档里记的科技等级（只留认识的、0-5） */
export function cleanTech(t: unknown): Partial<Record<TechId, number>> | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const out: Partial<Record<TechId, number>> = {};
  for (const k of GUILD_TECH) {
    const v = Math.floor(Number((t as Record<string, unknown>)[k.id]));
    if (v > 0) out[k.id] = Math.min(TECH_MAX, v);
  }
  return Object.keys(out).length ? out : undefined;
}

/** 存档里记的公会等级、科技对应的加成（没加公会是 0） */
export function guildPct(s: GameState, k: string) {
  if (!s.guildLv) return 0;
  const tech = GUILD_TECH.find((t) => t.id === k);
  return (guildPerks(s.guildLv)[k as GuildPerk] ?? 0) + (tech ? (s.guildTech?.[tech.id] ?? 0) * tech.per : 0);
}

/** 换成服务器最新的公会等级和科技（退会了传 0） */
export function setGuildLv(s: GameState, lv: number, tech?: unknown): GameState {
  const v = Math.max(0, Math.min(GUILD_MAX_LV, Math.floor(lv) || 0));
  const t = v ? cleanTech(tech) : undefined;
  if ((s.guildLv ?? 0) === v && JSON.stringify(s.guildTech ?? null) === JSON.stringify(t ?? null)) return s;
  return { ...s, guildLv: v || undefined, guildTech: t };
}

/** 每日签到给的贡献 */
export const checkinGain = (lv: number) => 10 + 5 * lv;

/**
 * 公会商店（10-27）：花自己的可用贡献（累计 - 已花）买，按公会等级解锁，每样每天限购。
 * 价格 = 价值 × 1.5 ÷ 10（比兑换贵，买了再换回去会亏），和 guild-data.sql 一致
 */
export interface ShopItem { item: string; lv: number; daily: number; price: number }
export const GUILD_SHOP: ShopItem[] = [
  { item: SCROLL_TOWN, lv: 1, daily: 5 },
  ...Array.from({ length: 8 }, (_, i) => ({ item: `luckybag_${i + 1}`, lv: i + 1, daily: 3 })),
  ...Array.from({ length: 8 }, (_, i) => ({ item: `enhstone_${i + 1}`, lv: i + 2, daily: 3 })),
  ...[4, 5, 6, 7, 8].map((t) => ({ item: `dkey_g${t}`, lv: t - 1, daily: 1 })),
  ...[4, 5, 6, 7, 8].map((t) => ({ item: `dkey_b${t}`, lv: t + 2, daily: 1 })),
].filter((x) => ITEMS[x.item]).map((x) => ({ ...x, price: Math.max(10, Math.ceil((ITEMS[x.item].value * 1.5) / VALUE_PER_CONTRIB)) }));

/** UTC 日期（每日任务和每日捐献按这个换天），和每周一 0 点的那天（每周贡献清零） */
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export function utcWeek(t = Date.now()) {
  const d = new Date(t);
  const back = (d.getUTCDay() + 6) % 7;
  return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

/** 每日任务能出的物品：每阶的矿、木头、锭、板材、棉花、兽皮、皮革、布料、烤兽肉 */
export function taskPool(tier: number) {
  const T = TIERS[tier], n = tier + 1;
  return [T.ore, `${T.wood}_log`, `${T.id}_bar`, `plank_${n}`, `cotton_${n}`, `hide_${n}`, `leather_${n}`, `cloth_${n}`, `steak_${n}`].filter((id) => ITEMS[id]);
}

export interface TaskSpec { target: string; need: number; per: number; reward: number }

/**
 * 今天的三条公会任务：按公会 id 和日期定下来，同一个公会的人算出来一样，谁先打开就由谁写进服务器。
 * 公会等级越高出的阶级越高；per = 每交一个得几点贡献，reward = 交满后公会额外拿的经验。
 */
export function dailyTasks(guildId: string, day: string, lv: number): TaskSpec[] {
  let h = 0;
  for (const c of `${guildId}|${day}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  let seed = h;
  const rnd = () => { const [r, n] = nextRandom(seed); seed = n; return r; };
  const top = Math.min(TIERS.length - 1, Math.max(1, lv));
  const out: TaskSpec[] = [];
  for (let i = 0; out.length < 3 && i < 20; i++) {
    const tier = Math.floor(rnd() * (top + 1));
    const list = taskPool(tier);
    const target = list[Math.floor(rnd() * list.length)];
    if (out.some((t) => t.target === target)) continue;
    const value = ITEMS[target].value;
    const need = Math.max(10, Math.min(300, Math.round(1500 / value / 5) * 5));
    const per = Math.max(1, Math.round((value * 1.5) / VALUE_PER_CONTRIB));
    out.push({ target, need, per, reward: Math.round(need * per * 0.5) + 100 * lv });
  }
  return out;
}
