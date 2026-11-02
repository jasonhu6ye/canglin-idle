import { ITEMS } from './data';
import { qualityOf } from './quality';
import type { GameState } from './types';

/*
 * 装备来源记录（11-02）：服务器结算时记下每件装备是怎么来的，查有没有人凭空刷出高品质装备。
 * - craft：每个配方做了几次、失败几次、一共用掉多少材料、做出了哪些装备（各品质多少件）
 * - drop：每种怪掉了哪些装备
 * - other：其他来源（开宝箱、领邮件、买东西……按指令名记；交易/公会仓库这类在服务器表里改的记成 outside）
 * - ev：传说以上逐件记：什么时候、从哪来、是这个配方第几次做出的 / 这种怪第几只掉的
 * - base：开始记录时就已经有的装备（以前得到的，查不到来源）
 * 只在服务器结算的结果算数（存档玩家不能直接写）。
 */

/**
 * 一件传说以上装备的来历。n：这个来源上次出传说以上之后又做/打了几次（含这次），
 * ms：这期间干了多久，cost：这期间用掉的材料，p：每次出这个品质（掉落：掉这件）的概率（0-1）
 */
export interface ProvEv { t: number; id: string; src: string; n?: number; ms?: number; cost?: Record<string, number>; p?: number }
/** 某个来源从上次出传说以上到现在攒的：次数、时长、材料 */
export interface ProvPend { n: number; ms: number; in?: Record<string, number>; last?: number }
export interface ProvCraft { n: number; fail?: number; ms?: number; in: Record<string, number>; out: Record<string, number> }
export interface ProvDrop { k: number; ms?: number; out: Record<string, number> }
export interface Prov {
  since: number;
  base: Record<string, number>;
  /** 上次服务器结算完时身上的装备（下次结算前多出来的 = 交易/公会仓库这类外面来的） */
  held: Record<string, number>;
  /** 同上，材料 */
  matHeld?: Record<string, number>;
  craft: Record<string, ProvCraft>;
  drop: Record<string, ProvDrop>;
  other: Record<string, Record<string, number>>;
  pend: Record<string, ProvPend>;
  /** 材料（非装备、非金币）从哪来：物品 → 来源 → 数量。来源同上（skill:动作 / drop:怪 / cmd:指令 / outside / auto） */
  mats: Record<string, Record<string, number>>;
  ev: ProvEv[];
}

/** 这个品质以上逐件记（用户 11-02：只记传说、神话） */
export const PROV_EV_Q = 4;
export const PROV_EV_CAP = 300;

export const isGear = (id: string) => !!ITEMS[id]?.equip;

/** 身上所有的装备：仓库 + 背包 + 穿着的 */
export function gearHeld(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n: number) => { if (n > 0 && isGear(id)) out[id] = (out[id] ?? 0) + n; };
  for (const [id, n] of Object.entries(s.bank)) add(id, n);
  for (const [id, n] of Object.entries(s.bag)) add(id, n);
  for (const id of Object.values(s.equipment)) if (id) add(id, 1);
  return out;
}

export function newProv(s: GameState, now: number): Prov {
  const held = gearHeld(s);
  return { since: now, base: { ...held }, held, craft: {}, drop: {}, other: {}, pend: {}, mats: {}, ev: [] };
}

const rec = (o: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(o && typeof o === 'object' ? (o as Record<string, unknown>) : {})
    .filter(([, n]) => Number.isFinite(n) && (n as number) > 0).map(([k, n]) => [k, Math.floor(n as number)]));
const recOf = (o: unknown): Record<string, Record<string, number>> =>
  Object.fromEntries(Object.entries(o && typeof o === 'object' ? (o as Record<string, unknown>) : {}).map(([k, v]) => [k, rec(v)]));

/** 读档：坏数据丢掉 */
export function migrateProv(raw: unknown): Prov | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Partial<Prov>;
  if (!Number.isFinite(p.since)) return undefined;
  const craft: Record<string, ProvCraft> = {};
  for (const [k, v] of Object.entries(p.craft && typeof p.craft === 'object' ? p.craft : {})) {
    if (!v || typeof v !== 'object') continue;
    craft[k] = { n: Math.max(0, Math.floor(Number(v.n) || 0)), ...(Number(v.fail) > 0 && { fail: Math.floor(Number(v.fail)) }), ...(Number(v.ms) > 0 && { ms: Number(v.ms) }), in: rec(v.in), out: rec(v.out) };
  }
  const drop: Record<string, ProvDrop> = {};
  for (const [k, v] of Object.entries(p.drop && typeof p.drop === 'object' ? p.drop : {})) {
    if (!v || typeof v !== 'object') continue;
    drop[k] = { k: Math.max(0, Math.floor(Number(v.k) || 0)), ...(Number(v.ms) > 0 && { ms: Number(v.ms) }), out: rec(v.out) };
  }
  const pend: Record<string, ProvPend> = {};
  for (const [k, v] of Object.entries(p.pend && typeof p.pend === 'object' ? p.pend : {})) {
    if (!v || typeof v !== 'object') continue;
    pend[k] = { n: Math.max(0, Math.floor(Number(v.n) || 0)), ms: Math.max(0, Number(v.ms) || 0), ...(v.in && { in: rec(v.in) }), ...(Number.isFinite(v.last) && { last: v.last }) };
  }
  const ev = (Array.isArray(p.ev) ? p.ev : [])
    .filter((e) => e && typeof e.id === 'string' && typeof e.src === 'string' && Number.isFinite(e.t))
    .map((e): ProvEv => ({
      t: e.t, id: e.id, src: e.src.slice(0, 60), ...(Number.isFinite(e.n) && { n: e.n }), ...(Number.isFinite(e.ms) && { ms: e.ms }),
      ...(e.cost && { cost: rec(e.cost) }), ...(Number.isFinite(e.p) && { p: e.p }),
    }))
    .slice(-PROV_EV_CAP);
  return { since: p.since!, base: rec(p.base), held: rec(p.held), ...(p.matHeld && { matHeld: rec(p.matHeld) }), craft, drop, other: recOf(p.other), pend, mats: recOf(p.mats), ev };
}

const pushEv = (p: Prov, e: ProvEv) => {
  p.ev.push(e);
  if (p.ev.length > PROV_EV_CAP) p.ev.splice(0, p.ev.length - PROV_EV_CAP);
};

/**
 * 做完一次（配方产出或用到装备）：记材料、时长和产出。
 * used：这次真的用掉的材料（等级加成省掉了就是 null），ms：这一次做了多久，odds(id)：做出这件的概率
 */
export function provCraft(s: GameState, action: string, used: Record<string, number> | null, got: Record<string, number>, failed: boolean, t: number, ms: number, odds: (id: string) => number | undefined) {
  const p = s.prov;
  if (!p) return;
  const c = (p.craft[action] ??= { n: 0, in: {}, out: {} });
  c.n++;
  c.ms = (c.ms ?? 0) + ms;
  if (failed) c.fail = (c.fail ?? 0) + 1;
  const key = `craft:${action}`;
  const pd = (p.pend[key] ??= { n: 0, ms: 0 });
  pd.n++;
  pd.ms += ms;
  if (used) for (const [id, n] of Object.entries(used)) {
    c.in[id] = (c.in[id] ?? 0) + n;
    (pd.in ??= {})[id] = (pd.in[id] ?? 0) + n;
  }
  let hi = false;
  for (const [id, n] of Object.entries(got)) {
    if (!isGear(id) || n <= 0) continue;
    c.out[id] = (c.out[id] ?? 0) + n;
    if (qualityOf(id) < PROV_EV_Q) continue;
    hi = true;
    pushEv(p, { t, id, src: key, n: pd.n, ms: Math.round(pd.ms), cost: { ...pd.in }, p: odds(id) });
  }
  if (hi) delete p.pend[key];
}

/** 战斗中两只怪间隔超过这么久就当中途停过，不算进「打了多久」 */
const GAP_MS = 5 * 60_000;

/**
 * 打死一只（会掉装备的）怪：记击杀数、时长、掉的装备。odds(id)：掉这件的概率
 */
export function provDrop(s: GameState, monster: string, got: Record<string, number>, t: number, odds: (id: string) => number | undefined) {
  const p = s.prov;
  if (!p) return;
  const d = (p.drop[monster] ??= { k: 0, out: {} });
  const key = `drop:${monster}`;
  const pd = (p.pend[key] ??= { n: 0, ms: 0 });
  const gap = pd.last !== undefined && t - pd.last > 0 && t - pd.last < GAP_MS ? t - pd.last : 0;
  d.k++;
  d.ms = (d.ms ?? 0) + gap;
  pd.n++;
  pd.ms += gap;
  pd.last = t;
  let hi = false;
  for (const [id, n] of Object.entries(got)) {
    if (!isGear(id) || n <= 0) continue;
    d.out[id] = (d.out[id] ?? 0) + n;
    if (qualityOf(id) < PROV_EV_Q) continue;
    hi = true;
    pushEv(p, { t, id, src: key, n: pd.n, ms: Math.round(pd.ms), p: odds(id) });
  }
  if (hi) p.pend[key] = { n: 0, ms: 0, last: t };
}

/** craft + drop + other 一共记了多少件 */
export function provTotals(p: Prov): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (r: Record<string, number>) => { for (const [id, n] of Object.entries(r)) out[id] = (out[id] ?? 0) + n; };
  for (const c of Object.values(p.craft)) add(c.out);
  for (const r of Object.values(p.drop)) add(r.out);
  for (const r of Object.values(p.other)) add(r);
  return out;
}

/**
 * 服务器结算的一步（一条指令、一段时间）做完后调：身上多出来、又没被 craft/drop 记到的装备记到 src 名下。
 * before：这一步前的 gearHeld，tot：这一步前的 provTotals
 */
export function provSettle(s: GameState, src: string, before: Record<string, number>, tot: Record<string, number>, t: number) {
  const p = s.prov;
  if (!p) return;
  const now = gearHeld(s);
  const tot2 = provTotals(p);
  for (const [id, n] of Object.entries(now)) {
    const gain = n - (before[id] ?? 0) - ((tot2[id] ?? 0) - (tot[id] ?? 0));
    if (gain <= 0) continue;
    const o = (p.other[src] ??= {});
    o[id] = (o[id] ?? 0) + gain;
    if (qualityOf(id) >= PROV_EV_Q) for (let k = 0; k < Math.min(gain, 5); k++) pushEv(p, { t, id, src });
  }
}

/** 材料：除了装备和金币，仓库 + 背包 + 食物/药水栏 */
const isMat = (id: string) => id !== 'coins' && !!ITEMS[id] && !isGear(id);
export function matsHeld(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n: number) => { if (n > 0 && isMat(id)) out[id] = (out[id] ?? 0) + n; };
  for (const [id, n] of Object.entries(s.bank)) add(id, n);
  for (const [id, n] of Object.entries(s.bag)) add(id, n);
  for (const b of Object.values(s.belt ?? {})) if (b) add(b.id, b.qty);
  return out;
}

/** 干活、打怪拿到材料（sim 里记） */
export function provMat(s: GameState, item: string, qty: number, src: string) {
  const p = s.prov;
  if (!p || qty <= 0 || !isMat(item)) return;
  const m = (p.mats[item] ??= {});
  m[src] = (m[src] ?? 0) + qty;
}

export function matTotals(p: Prov): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of Object.entries(p.mats)) out[id] = Object.values(r).reduce((a, b) => a + b, 0);
  return out;
}

/** 服务器结算一步之后：多出来、又没被 sim 记到的材料记到 src 名下（开箱、买的、邮件、交易……） */
export function provSettleMats(s: GameState, src: string, before: Record<string, number>, tot: Record<string, number>) {
  const p = s.prov;
  if (!p) return;
  const now = matsHeld(s);
  const tot2 = matTotals(p);
  for (const [id, n] of Object.entries(now)) {
    const gain = n - (before[id] ?? 0) - ((tot2[id] ?? 0) - (tot[id] ?? 0));
    if (gain > 0) provMat(s, id, gain, src);
  }
}
