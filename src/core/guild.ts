import type { GameState } from './types';
import { ITEMS, TIERS } from './data';
import { nextRandom } from './rng';

/*
 * 公会等级、贡献、每日任务（用户 10-26）。服务器只记账（supabase/schema.sql 的 donate_coins / contribute / guild_deposit），
 * 等级表和任务生成在这里，两边的数要对得上：GUILD_XP 改了要同步改 SQL 里的 guild_xp_table()。
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
/** 存档里记的公会等级对应的加成（没加公会是 0） */
export const guildPct = (s: GameState, k: string) => (s.guildLv ? guildPerks(s.guildLv)[k as GuildPerk] ?? 0 : 0);

/** 换成服务器最新的公会等级（退会了传 0） */
export function setGuildLv(s: GameState, lv: number): GameState {
  const v = Math.max(0, Math.min(GUILD_MAX_LV, Math.floor(lv) || 0));
  return (s.guildLv ?? 0) === v ? s : { ...s, guildLv: v || undefined };
}

/** UTC 日期（每日任务和每日捐献按这个换天），和每周一 0 点的那天（每周贡献清零） */
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export function utcWeek(t = Date.now()) {
  const d = new Date(t);
  const back = (d.getUTCDay() + 6) % 7;
  return utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}

/** 每日任务能出的物品：每阶的矿、木头、锭、板材、棉花、兽皮、皮革、布料、烤兽肉 */
function pool(tier: number) {
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
    const list = pool(tier);
    const target = list[Math.floor(rnd() * list.length)];
    if (out.some((t) => t.target === target)) continue;
    const value = ITEMS[target].value;
    const need = Math.max(10, Math.min(300, Math.round(1500 / value / 5) * 5));
    const per = Math.max(1, Math.round((value * 1.5) / VALUE_PER_CONTRIB));
    out.push({ target, need, per, reward: Math.round(need * per * 0.5) + 100 * lv });
  }
  return out;
}
