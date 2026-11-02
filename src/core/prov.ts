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
  /** 一共记过几件（ev 只留最近的，用这个找出这次结算新记的） */
  seq?: number;
  /** 金币也记来源了（11-02 之后）；没有这个标记的老记录，matHeld 里没算金币 */
  coinV?: 1;
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
  return { since: now, base: { ...held }, held, craft: {}, drop: {}, other: {}, pend: {}, mats: {}, ev: [], coinV: 1 };
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
  return { since: p.since!, base: rec(p.base), held: rec(p.held), ...(p.matHeld && { matHeld: rec(p.matHeld) }), craft, drop, other: recOf(p.other), pend, mats: recOf(p.mats), ev, ...(Number.isInteger(p.seq) && p.seq! >= ev.length && { seq: p.seq }), ...(p.coinV === 1 && { coinV: 1 as const }) };
}

const pushEv = (p: Prov, e: ProvEv) => {
  p.seq = (p.seq ?? p.ev.length) + 1;
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
    for (let k = 0; k < n; k++) addMark(s, id);
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

/** 材料：除了装备都算（11-02 起金币也记来源），仓库 + 背包 + 食物/药水栏 */
const isMat = (id: string) => !!ITEMS[id] && !isGear(id);
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

/**
 * 直接知道来源的一笔（比如领邮件按邮件种类记 mail:gm / mail:quest）：装备记进 other（传说以上逐件记），其他记进 mats。
 * 记过的这一步结束时 provSettle / provSettleMats 不会再记一遍
 */
export function provGot(s: GameState, id: string, qty: number, src: string, t: number) {
  const p = s.prov;
  if (!p || qty <= 0 || !ITEMS[id]) return;
  if (!isGear(id)) { provMat(s, id, qty, src); return; }
  const o = (p.other[src] ??= {});
  o[id] = (o[id] ?? 0) + qty;
  if (qualityOf(id) >= PROV_EV_Q) for (let k = 0; k < Math.min(qty, 5); k++) pushEv(p, { t, id, src });
}

/**
 * 所有来源的累计，摊平成「来源|物品 → 数量」（11-02 用户要求每个活跃玩家每样东西怎么来的都留记录）：
 * 结算前后一减就是这次新得到的，服务器按天存进 item_log 表（存档回档、改档也不会丢）
 */
export function provFlat(p: Prov | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!p) return out;
  const add = (src: string, r: Record<string, number>) => { for (const [id, n] of Object.entries(r)) if (n > 0) out[`${src}|${id}`] = (out[`${src}|${id}`] ?? 0) + n; };
  for (const [a, c] of Object.entries(p.craft)) add(`craft:${a}`, c.out);
  for (const [m, d] of Object.entries(p.drop)) add(`drop:${m}`, d.out);
  for (const [src, r] of Object.entries(p.other)) add(src, r);
  for (const [id, r] of Object.entries(p.mats)) for (const [src, n] of Object.entries(r)) if (n > 0) out[`${src}|${id}`] = (out[`${src}|${id}`] ?? 0) + n;
  return out;
}

export interface GotRow { src: string; item: string; n: number }
/** 两次累计之差（只要多出来的） */
export function provDiff(before: Record<string, number>, after: Record<string, number>, cap = 400): GotRow[] {
  const rows: GotRow[] = [];
  for (const [k, n] of Object.entries(after)) {
    const d = n - (before[k] ?? 0);
    if (d <= 0) continue;
    const i = k.lastIndexOf('|');
    rows.push({ src: k.slice(0, i), item: k.slice(i + 1), n: d });
  }
  return rows.sort((a, b) => b.n - a.n).slice(0, cap);
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

/*
 * 可疑装备（用户 11-02：自动标出来，等管理员处理）。服务器结算新记下的传说以上装备里：
 * - luck：按概率，这么多次里出一件的机会低于 LUCK_MIN（比如 0.3% 的东西只做了 1 次就出）
 * - outside：不是自己做的或打的，两次结算之间凭空多出来（交易、公会仓库、GM 改档）
 * - burst：一小时内出了超过 BURST_N 件
 */
export const LUCK_MIN = 0.005;
export const BURST_N = 4;
export interface GearSuspect { item: string; src: string; reason: 'luck' | 'outside' | 'burst'; t: number; detail: Record<string, unknown> }

/** 这次结算新记下的传说以上装备（seq0 = 结算前的 seq） */
export function newEvents(p: Prov | undefined, seq0: number): ProvEv[] {
  if (!p) return [];
  const n = Math.min(p.ev.length, Math.max(0, (p.seq ?? p.ev.length) - seq0));
  return n ? p.ev.slice(-n) : [];
}

export function gearSuspects(p: Prov | undefined, fresh: ProvEv[]): GearSuspect[] {
  if (!p) return [];
  const out: GearSuspect[] = [];
  for (const e of fresh) {
    const base = { item: e.id, src: e.src, t: e.t };
    const detail = { ...(e.n !== undefined && { n: e.n }), ...(e.p !== undefined && { p: e.p }), ...(e.ms !== undefined && { ms: e.ms }), ...(e.cost && { cost: e.cost }) };
    if (e.src === 'outside') { out.push({ ...base, reason: 'outside', detail }); continue; }
    if (e.p && e.n) {
      const chance = 1 - Math.pow(1 - e.p, e.n);
      if (chance < LUCK_MIN) { out.push({ ...base, reason: 'luck', detail: { ...detail, chance } }); continue; }
    }
    const mail = (src: string) => src === 'cmd:claimMail' || src.startsWith('mail:');
    const hour = p.ev.filter((x) => x.t <= e.t && x.t > e.t - 3600_000 && !mail(x.src)).length;
    if (hour > BURST_N && !mail(e.src)) out.push({ ...base, reason: 'burst', detail: { ...detail, hour } });
  }
  return out;
}

/*
 * 制作者署名（用户 11-02，学阿尔比恩）：传说、神话装备做出来时记下制作者「名字#数字ID」。
 * 存档 marks[物品 id] = 每件的制作者（同一种可能有好几件，没署名的是掉落、开箱或记录之前就有的）。
 * 交易、公会仓库搬东西时数据库会把署名一起搬走（save_take_marks / save_give_marks）。
 */
export const MARK_Q = 4;
let maker: string | null = null;
/** 服务器结算前设：这次结算的玩家（名字#数字ID），结算完清掉 */
export function setMaker(m: string | null) { maker = m; }
export const makerNow = () => maker;

/** 做出一件传说以上：记下制作者 */
export function addMark(s: GameState, id: string) {
  if (!maker || qualityOf(id) < MARK_Q) return;
  const m = (s.marks ??= {});
  (m[id] ??= []).push(maker);
}

/** 署名不能比身上的件数多（卖掉、分解、强化用掉的那几件署名去掉，后来的先去掉） */
export function trimMarks(s: GameState) {
  if (!s.marks) return;
  const held = gearHeld(s);
  for (const [id, list] of Object.entries(s.marks)) {
    const n = held[id] ?? 0;
    if (list.length > n) s.marks[id] = list.slice(0, n);
    if (!s.marks[id].length) delete s.marks[id];
  }
  if (!Object.keys(s.marks).length) delete s.marks;
}

export function migrateMarks(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ITEMS[id] || !Array.isArray(v)) continue;
    const list = v.filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.slice(0, 40)).slice(0, 500);
    if (list.length) out[id] = list;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 署名「名字#数字ID」拆开 */
export function splitMark(m: string): { name: string; pid: string } {
  const i = m.lastIndexOf('#');
  return i > 0 ? { name: m.slice(0, i), pid: m.slice(i + 1) } : { name: m, pid: '' };
}

/** 某种物品的署名按人数合起来：[[署名, 件数]]，多的在前 */
export function marksOf(s: Pick<GameState, 'marks'>, id: string): [string, number][] {
  const c: Record<string, number> = {};
  for (const m of s.marks?.[id] ?? []) c[m] = (c[m] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}
