import { ACTIONS, ITEMS, MONSTERS, NODES, SKILLS, standOf, WALK_TILES_PER_SEC, type MapNode } from '../core/data';
import { baseOf } from '../core/quality';
import { APT_MAX, APT_MIN, horseItem } from '../core/ranch';
import type { EquipSlot, SkillId } from '../core/types';
import { XP_TABLE } from '../core/xp';
import { fightWeapon, OUTFITS } from '../game/hero';
import { findPath, isWalkable } from '../game/world';
import type { AiPlayer, Board, ChatMsg, OnlineApi, Presence, RankRow } from './api';
import { BOT_ZH, FILL_ZH } from '../i18n/bot-zh';
import { LANG } from '../i18n';
import { EN } from '../i18n/en';

/**
 * AI 玩家（用户 10-31）：服务器 ai_players 表只存名字和种子，外观、等级、装备、去哪干活、世界频道说什么，
 * 都由种子和当前时间算出来，所以每台设备看到的同一个 AI 在同一个地方做同一件事，不用另外开服务器。
 * withBots 把它们混进在线玩家、在线人数、排行榜和世界聊天，界面那边不用改。
 */

/** 稳定的哈希随机数 [0,1) */
export function rnd(...k: number[]) {
  let x = 0x9e3779b9 | 0;
  for (const v of k) {
    x = Math.imul(x ^ (v | 0), 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
  }
  return (x >>> 0) / 4294967296;
}
const pick = <T>(a: readonly T[], r: number): T => a[Math.min(a.length - 1, Math.floor(r * a.length))];
/**
 * 轮着抽（10-31：同一段对话一小时里出现两次太假）：第 i 次从 list 里取一个，
 * 每 list.length 次为一轮，一轮里每个都只出现一次，顺序每轮打乱
 */
function cyc<T>(list: readonly T[], i: number, salt: number): T {
  const n = list.length;
  const round = Math.floor(i / n);
  let step = 1 + Math.floor(rnd(salt, round, 1) * (n - 1));
  while (gcd(step, n) !== 1) step = (step % n) + 1;
  const shift = Math.floor(rnd(salt, round, 2) * n);
  return list[((((i % n) + n) % n) * step + shift) % n];
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const DAY = 86_400_000;
const MIN = 60_000;
/** 游戏开服时间：AI 的注册时间不早于这天 */
const LAUNCH = Date.UTC(2026, 9, 20);

// ---- 名字 ----
const SYL_A = ['Ka', 'Ri', 'Mo', 'Zen', 'Lu', 'Vex', 'Ar', 'El', 'Tor', 'Ny', 'Sha', 'Bri', 'Dra', 'Fen', 'Gal', 'Io', 'Jin', 'Kel', 'Mar', 'Ori', 'Pyr', 'Quin', 'Rho', 'Syl', 'Tal', 'Ul', 'Vor', 'Wyn', 'Xan', 'Yor', 'Ash', 'Cor', 'Del', 'Eli', 'Fin', 'Hal', 'Isa', 'Kai', 'Lio', 'Nor'];
const SYL_B = ['ra', 'dor', 'lyn', 'th', 'ix', 'ane', 'is', 'ok', 'wen', 'ric', 'os', 'ia', 'en', 'us', 'el', 'a', 'o', 'iel', 'ius', 'mir', 'ven', 'nor', 'ka', 'ro'];
const ADJ = ['lazy', 'sleepy', 'mossy', 'silent', 'lucky', 'tiny', 'grumpy', 'swift', 'shiny', 'rusty', 'happy', 'frosty', 'misty', 'wild', 'odd', 'brave', 'salty', 'cozy', 'dusty', 'quiet'];
const NOUN = ['fern', 'owl', 'cat', 'fox', 'otter', 'miner', 'pickaxe', 'toast', 'mage', 'bard', 'moth', 'wolf', 'crow', 'bean', 'pebble', 'trout', 'golem', 'ranger', 'knight', 'sprout'];

/** 随机一个像真人玩家的英文名（2-12 个字母数字下划线，见 NAME_RE），不和 taken 里的重名 */
export function botName(r: () => number, taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const k = r();
    let n: string;
    if (k < 0.45) n = pick(SYL_A, r()) + pick(SYL_B, r()) + (r() < 0.3 ? pick(SYL_B, r()) : '');
    else if (k < 0.75) n = pick(ADJ, r()) + (r() < 0.5 ? '_' : '') + pick(NOUN, r());
    else n = pick(SYL_A, r()) + pick(SYL_B, r()) + Math.floor(r() * 999);
    if (r() < 0.25) n = n.toLowerCase();
    n = n.slice(0, 12);
    if (n.length >= 2 && !taken.has(n.toLowerCase())) { taken.add(n.toLowerCase()); return n; }
  }
  return `Player${Math.floor(r() * 99999)}`;
}

// ---- 等级、装备 ----
/** 某个技能玩了多少小时 → 等级（按 xp.ts 里挂机速度的估算插值） */
const HOURS_LV: [number, number][] = [[0, 1], [0.1, 10], [0.83, 30], [4, 50], [20, 70], [145, 95], [800, 120], [3000, 140]];
function levelOfHours(h: number) {
  if (h <= 0) return 1;
  for (let i = 1; i < HOURS_LV.length; i++) {
    const [h1, l1] = HOURS_LV[i];
    if (h <= h1) {
      const [h0, l0] = HOURS_LV[i - 1];
      const k = h0 ? (Math.log(h) - Math.log(h0)) / (Math.log(h1) - Math.log(h0)) : h / h1;
      return Math.max(1, Math.floor(l0 + (l1 - l0) * k));
    }
  }
  return 140;
}

const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
const ATTACK = ['melee', 'ranged', 'magic'] as const;
type Style = (typeof ATTACK)[number];
const STARTERS = OUTFITS.filter((o) => !o.code && !o.npc).map((o) => o.id);
const GEAR: EquipSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring', 'pickaxe', 'axe', 'rod', 'sickle', 'knife'];
const BY_SLOT = new Map<EquipSlot, { id: string; skill: SkillId; level: number; style?: string }[]>();
function gearOf(slot: EquipSlot) {
  let list = BY_SLOT.get(slot);
  if (!list) {
    list = Object.values(ITEMS)
      .filter((it) => it.equip?.slot === slot && baseOf(it.id) === it.id && /[一-鿿]/.test(it.name + (it.desc ?? '')))
      .map((it) => ({ id: it.id, skill: it.equip!.skill, level: it.equip!.level, style: it.equip!.style }))
      .sort((a, b) => a.level - b.level);
    BY_SLOT.set(slot, list);
  }
  return list;
}

export interface BotProfile {
  id: string;
  name: string;
  outfit: string;
  pid: number;
  joined: number;
  levels: Record<SkillId, number>;
  xp: Record<SkillId, number>;
  total: number;
  combat: number;
  equip: Partial<Record<EquipSlot, string>>;
  mount?: string;
  /** 能去的地点和在那能做的动作 */
  spots: { n: MapNode; acts: string[] }[];
}

const profiles = new Map<string, BotProfile>();
/** 一个 AI 某个小时的样子（从新号开始，等级随时间慢慢涨） */
export function botProfile(b: AiPlayer, t = Date.now()): BotProfile {
  const hour = Math.floor(t / 3600_000);
  const key = `${b.id}:${b.seed}:${b.name}:${hour}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  if (profiles.size > 2000) profiles.clear();
  const s = b.seed;
  // 加进来时是新号（玩了几分钟到半小时），之后每天再玩 0.3-2.3 小时，玩得越久涨得越慢
  const h0 = 0.05 + 0.45 * rnd(s, 1) ** 2;
  const rate = 0.3 + 2 * rnd(s, 2) ** 1.5;
  const hours = h0 + (rate * Math.max(0, hour * 3600_000 - b.at)) / DAY;
  const style = pick(ATTACK, rnd(s, 3)) as Style;
  const w = {} as Record<SkillId, number>;
  for (const k of SKILL_IDS) w[k] = rnd(s, 10, k.length, k.charCodeAt(0), k.charCodeAt(2)) ** 2;
  w.enhancing *= 0.2;
  w.husbandry *= 0.3;
  for (const a of ATTACK) w[a] = a === style ? 1.2 + rnd(s, 4) : w[a] * 0.15;
  w.defence = 0.5 + rnd(s, 5) * 0.7;
  w.hitpoints = 0;
  const sum = Object.values(w).reduce((a, x) => a + x, 0);
  const levels = {} as Record<SkillId, number>;
  for (const k of SKILL_IDS) levels[k] = levelOfHours((hours * w[k]) / sum);
  levels.hitpoints = Math.max(10, Math.round((levels[style] + levels.defence) / 2 + 3));
  const xp = {} as Record<SkillId, number>;
  for (const k of SKILL_IDS) xp[k] = XP_TABLE[levels[k]] + Math.floor(rnd(s, 20, k.charCodeAt(1)) * (XP_TABLE[levels[k] + 1] - XP_TABLE[levels[k]]));
  const total = SKILL_IDS.reduce((a, k) => a + levels[k], 0);
  const combat = Math.max(1, Math.floor((Math.max(levels.melee, levels.ranged, levels.magic) * 1.3 + levels.defence + levels.hitpoints) / 3.3));
  const equip: Partial<Record<EquipSlot, string>> = {};
  GEAR.forEach((slot, i) => {
    const ok = gearOf(slot).filter((g) => g.level <= levels[g.skill] && (!g.style || slot === 'neck' || slot === 'ring' || g.style === style));
    if (!ok.length || (slot === 'offhand' && style !== 'melee' && rnd(s, 30) < 0.5) || ((slot === 'neck' || slot === 'ring') && rnd(s, 31, i) < 0.4)) return;
    // 大多穿着够得着的最好的几件之一
    equip[slot] = ok[Math.max(0, ok.length - 1 - Math.floor(rnd(s, 40, i) ** 2 * 4))].id;
  });
  const mount = combat >= 15 || total >= 300 ? horseItem(APT_MIN + Math.floor(rnd(s, 6) ** 1.5 * (APT_MAX - APT_MIN))) : undefined;
  if (mount && ITEMS[mount]) equip.mount = mount;
  const lo = (lv: number) => Math.max(1, lv - 25);
  const doable = (id: string) => {
    const a = ACTIONS[id];
    if (!a) return false;
    if (a.kind === 'combat') {
      const m = MONSTERS[a.monster];
      return !!m && !m.world && !m.event && a.level <= combat + 3 && a.level >= lo(combat) - 10;
    }
    if (a.skill === 'farming' || a.skill === 'husbandry' || a.skill === 'enhancing') return false;
    return a.level <= levels[a.skill] && a.level >= lo(levels[a.skill]);
  };
  const spots = NODES.filter((n) => !n.sea && !n.closed && !n.portal && !n.opens && n.actions.length)
    .map((n) => ({ n, acts: n.actions.filter(doable) }))
    .filter((x) => x.acts.length);
  const joinedDays = Math.min(h0 / rate, Math.max(0, (b.at - LAUNCH) / DAY));
  const p: BotProfile = {
    id: b.id, name: b.name, outfit: pick(STARTERS, rnd(s, 7)), pid: 20000000 + Math.floor(rnd(s, 8) * 79999999),
    joined: Math.round(b.at - joinedDays * DAY - rnd(s, 9) * 3600_000), levels, xp, total, combat, equip, mount: equip.mount, spots,
  };
  profiles.set(key, p);
  return p;
}

// ---- 去哪、干什么 ----
/** 每一段在线：一开始传送到一个地点，之后在附近几个地点之间干活、走动 */
const SESSION = 40 * MIN;
const NEAR = 50;
type Pt = { x: number; y: number };
export interface BotDoing {
  /** 正在干活的动作；走路时没有 */
  action?: string;
  node: MapNode;
  /** 走路：从哪到哪、走了几成 */
  from?: MapNode;
  frac?: number;
  /** 这一段路的编号（缓存寻路用） */
  leg: string;
  /** 在城里站着挂机（10-31 用户要求） */
  idle?: boolean;
}

/** 挂机待的地方：各城的仓库、家园传送门、商人门口 */
const IDLE_SPOTS = NODES.filter((n) => n.town && !n.sea && (n.opens === 'bank' || n.portal || n.shop));
/** 每个 AI 挂机的频率不一样：大多偶尔挂一会，少数经常站在城里 */
const afkOf = (seed: number) => 0.05 + 0.4 * rnd(seed, 70) ** 2;

const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function botDoing(p: BotProfile, seed: number, t = Date.now()): BotDoing | null {
  if (!p.spots.length) return null;
  const off = rnd(seed, 50) * SESSION;
  const si = Math.floor((t + off) / SESSION);
  let tt = si * SESSION - off;
  // 这一段在线干脆在城里挂机
  if (IDLE_SPOTS.length && rnd(seed, si, 71) < afkOf(seed)) return { node: pick(IDLE_SPOTS, rnd(seed, si, 72)), leg: `${si}:idle`, idle: true };
  // 城里做东西的地点少去一些，大多在野外
  const field = p.spots.filter((x) => !x.n.town);
  const town = p.spots.filter((x) => x.n.town);
  const pool = field.length && (!town.length || rnd(seed, si, 51) < 0.8) ? field : town;
  let cur = pick(pool, rnd(seed, si, 52));
  const speed = WALK_TILES_PER_SEC * (p.mount ? 2.2 : 1);
  for (let k = 0; k < 30; k++) {
    const work = (4 + 9 * rnd(seed, si, k, 53)) * MIN;
    const action = pick(cur.acts, rnd(seed, si, k, 54));
    if (t < tt + work) return { action, node: cur.n, leg: `${si}:${k}` };
    tt += work;
    const near = p.spots.filter((x) => x !== cur && dist(x.n, cur.n) <= NEAR && x.n.town === cur.n.town);
    if (!near.length) continue;
    const next = pick(near, rnd(seed, si, k, 55));
    const walk = ((dist(next.n, cur.n) * 1.15) / speed) * 1000;
    if (t < tt + walk) return { node: next.n, from: cur.n, frac: (t - tt) / walk, leg: `${si}:${k}` };
    tt += walk;
    cur = next;
  }
  return { action: cur.acts[0], node: cur.n, leg: `${si}:x` };
}

/** 动作对应的干活动画（和 MapScene.workAnim 一样） */
function animOf(action: string, p: BotProfile) {
  const a = ACTIONS[action];
  if (!a) return undefined;
  if (a.kind === 'combat') return `fight-${fightWeapon(baseOf(p.equip.weapon ?? ''))}-ready`;
  const bySkill: Partial<Record<string, string>> = {
    mining: 'work-mine', woodcutting: 'work-chop', fishing: 'work-fish', hunting: 'work-skin', thieving: 'work-steal', gathering: 'work-gather',
  };
  return bySkill[a.skill] ?? 'work-craft';
}

// 寻路只给看得见的 AI 算（自己附近），远的直接按直线估位置
let viewer: Pt | null = null;
export const setBotViewer = (p: Pt) => { viewer = p; };
const VIEW = 110;
const paths = new Map<string, { pts: Pt[]; len: number[] } | null>();
function pathOf(key: string, a: Pt, b: Pt) {
  if (paths.has(key)) return paths.get(key)!;
  if (paths.size > 300) paths.clear();
  let pts: Pt[] | null = null;
  try { pts = findPath(a, b); } catch { pts = null; }
  const v = pts && pts.length > 1 ? { pts: [a, ...pts], len: [] as number[] } : null;
  if (v) { let acc = 0; v.len.push(0); for (let i = 1; i < v.pts.length; i++) v.len.push((acc += Math.hypot(v.pts[i].x - v.pts[i - 1].x, v.pts[i].y - v.pts[i - 1].y))); }
  paths.set(key, v);
  return v;
}

/**
 * 每个 AI 在地点周围几格内各找一个站位（10-31 用户反馈都挤在一格上）：
 * 城里的作坊门口左右散开，野外散得开一些；找不到能走的格子就站原位
 */
const spots = new Map<string, Pt>();
function spotOf(n: MapNode, seed: number, wide = false): Pt {
  const key = `${n.id}:${seed}:${wide}`;
  const hit = spots.get(key);
  if (hit) return hit;
  if (spots.size > 3000) spots.clear();
  const at = standOf(n);
  let out = at;
  const rx = wide ? 6 : n.town ? 3 : 4, ry = wide ? 4 : n.town ? 2 : 4;
  for (let i = 0; i < 16; i++) {
    const x = at.x + Math.round((rnd(seed, 60, i) * 2 - 1) * rx);
    const y = at.y + (n.town && !wide ? Math.floor(rnd(seed, 61, i) * (ry + 1)) : Math.round((rnd(seed, 61, i) * 2 - 1) * ry));
    let ok = false;
    try { ok = isWalkable(x, y); } catch { ok = false; }
    if (ok) { out = { x, y }; break; }
  }
  spots.set(key, out);
  return out;
}

// ---- 上下线（用户 10-31：要像真人）：每个 AI 有自己的时区，当地夜里睡觉那几个小时不在线 ----
const ZONES: { tz: number; en: string; zh: string }[] = [
  { tz: -5, en: 'us, east coast', zh: '美国东海岸' }, { tz: -8, en: 'us, west coast', zh: '美国西海岸' }, { tz: -6, en: 'texas', zh: '得州' },
  { tz: -5, en: 'canada', zh: '加拿大' }, { tz: -3, en: 'brazil', zh: '巴西' }, { tz: 0, en: 'uk', zh: '英国' }, { tz: 1, en: 'germany', zh: '德国' },
  { tz: 1, en: 'france', zh: '法国' }, { tz: 1, en: 'poland', zh: '波兰' }, { tz: 2, en: 'finland', zh: '芬兰' }, { tz: 8, en: 'philippines', zh: '菲律宾' },
  { tz: 8, en: 'singapore', zh: '新加坡' }, { tz: 9, en: 'japan', zh: '日本' }, { tz: 10, en: 'australia', zh: '澳大利亚' }, { tz: 7, en: 'vietnam', zh: '越南' },
];
export const zoneOf = (b: AiPlayer) => pick(ZONES, rnd(b.seed, 92));
const HOUR = 3600_000;
/** 当地几点开始睡、睡几个小时 */
function sleepOf(b: AiPlayer): [number, number] {
  return [22.5 + rnd(b.seed, 94) * 4, 5.5 + rnd(b.seed, 95) * 3];
}
/**
 * 玩家类型（用户 10-31：不是每个人都常在线，别一直高强度在线）：
 * 肝帝几乎每天上来、一天两三段每段几小时；常玩的大多数天上来一两次；休闲的隔天上来一会；偶尔玩的几天才来一次
 */
type Habit = 'hardcore' | 'regular' | 'casual' | 'rare';
export const habitOf = (b: AiPlayer): Habit => { const r = rnd(b.seed, 102); return r < 0.07 ? 'hardcore' : r < 0.35 ? 'regular' : r < 0.75 ? 'casual' : 'rare'; };
const HABIT: Record<Habit, { days: number; n: [number, number]; len: [number, number] }> = {
  hardcore: { days: 0.95, n: [2, 3], len: [2, 4.5] },
  regular: { days: 0.75, n: [1, 2], len: [1, 2.5] },
  casual: { days: 0.45, n: [1, 1], len: [0.4, 1.5] },
  rare: { days: 0.2, n: [1, 1], len: [0.3, 1] },
};
/** 当地第 d 天的几段在线时间（当地小时，可能过了午夜） */
function sessionsOf(b: AiPlayer, d: number): [number, number][] {
  const s = sleepOf(b);
  const wake = (s[0] + s[1]) % 24, bed = s[0] + (s[0] < wake ? 24 : 0);
  const c = HABIT[habitOf(b)];
  if (rnd(b.seed, 103, d) >= c.days) return [];
  const n = c.n[0] + Math.floor(rnd(b.seed, 104, d) * (c.n[1] - c.n[0] + 1));
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const len = c.len[0] + rnd(b.seed, 105, d, k) * (c.len[1] - c.len[0]);
    // 多半在下班后的晚上，也有午休、上午的
    const r = rnd(b.seed, 106, d, k);
    const at = r < 0.55 ? Math.max(wake, 18) + rnd(b.seed, 107, d, k) * 3 : wake + rnd(b.seed, 107, d, k) * Math.max(1, 17 - wake);
    const st = Math.min(at, bed - len), en = Math.min(st + len, bed);
    if (en > st && !out.some(([x, y]) => st < y + 0.5 && en > x - 0.5)) out.push([st, en]);
  }
  return out;
}
const localOf = (b: AiPlayer, t: number) => t / HOUR + zoneOf(b).tz;
/** 这个 AI 现在在不在线 */
export function botOnline(b: AiPlayer, t = Date.now()) {
  const L = localOf(b, t), d = Math.floor(L / 24), h = L - d * 24;
  return sessionsOf(b, d).some(([x, y]) => h >= x && h < y) || sessionsOf(b, d - 1).some(([x, y]) => h + 24 >= x && h + 24 < y);
}
/** 一段时间里的上线、下线时刻（打招呼用） */
function sessionsIn(b: AiPlayer, from: number, to: number) {
  const out: { key: string; on: number; off: number }[] = [];
  const tz = zoneOf(b).tz;
  for (let d = Math.floor(localOf(b, from) / 24) - 1; d <= Math.floor(localOf(b, to) / 24); d++) {
    sessionsOf(b, d).forEach(([x, y], k) => out.push({ key: `${d}-${k}`, on: (d * 24 + x - tz) * HOUR, off: (d * 24 + y - tz) * HOUR }));
  }
  return out;
}
/** 话多话少：有的 AI 一直在说，有的几乎不说话；三分之一基本只潜水 */
const chattyOf = (b: AiPlayer) => (rnd(b.seed, 96) < 0.35 ? 0.03 : 0.15 + 3 * rnd(b.seed, 91) ** 2);
function pickTalker(on: AiPlayer[], r: number) {
  const total = on.reduce((a, b) => a + chattyOf(b), 0);
  let x = r * total;
  for (const b of on) if ((x -= chattyOf(b)) < 0) return b;
  return on[on.length - 1];
}

/** 一个 AI 现在的在线状态（和真人的 Presence 一样画在地图上） */
export function botPresence(b: AiPlayer, t = Date.now()): Presence | null {
  if (!botOnline(b, t)) return null;
  const p = botProfile(b, t);
  const d = botDoing(p, b.seed, t);
  if (!d) return null;
  let at: Pt = spotOf(d.node, b.seed, d.idle);
  if (d.from && d.frac != null) {
    const a = spotOf(d.from, b.seed), z = at;
    const lin = { x: a.x + (z.x - a.x) * d.frac, y: a.y + (z.y - a.y) * d.frac };
    at = lin;
    if (viewer && dist(lin, viewer) < VIEW) {
      const path = pathOf(`${b.id}:${b.seed}:${d.leg}`, a, z);
      if (path) {
        const want = path.len[path.len.length - 1] * d.frac;
        let i = 1;
        while (i < path.len.length - 1 && path.len[i] < want) i++;
        const seg = path.len[i] - path.len[i - 1] || 1;
        const k = Math.max(0, Math.min(1, (want - path.len[i - 1]) / seg));
        at = { x: path.pts[i - 1].x + (path.pts[i].x - path.pts[i - 1].x) * k, y: path.pts[i - 1].y + (path.pts[i].y - path.pts[i - 1].y) * k };
      }
    }
    at = { x: Math.round(at.x * 4) / 4, y: Math.round(at.y * 4) / 4 };
  }
  // 城里做东西时下马，免得作坊门口挤满马
  return {
    playerId: botKey(b.id), name: p.name, outfit: p.outfit, x: at.x, y: at.y, mounted: (d.action || d.idle) && d.node.town ? undefined : p.mount, action: d.action,
    anim: d.action ? animOf(d.action, p) : undefined, flip: false, pid: p.pid, total: p.total, combat: p.combat,
    equip: { ...p.equip }, at: t, bot: true,
  };
}

export const botKey = (id: string) => `bot-${id}`;
export const isBotId = (playerId: string) => playerId.startsWith('bot-');

/** 排行榜上的值 */
function boardValue(p: BotProfile, board: Board): [number, number | undefined] {
  if (board === 'total') return [p.total, undefined];
  if (board === 'combat') return [p.combat, undefined];
  return [p.levels[board], p.xp[board]];
}
/** 真人排行榜 + AI，重新排名次 */
export function mergeBoard(real: RankRow[], bots: AiPlayer[], board: Board, limit: number, t = Date.now()): RankRow[] {
  const rows = [...real, ...bots.map((b) => {
    const p = botProfile(b, t);
    const [value, xp] = boardValue(p, board);
    return { rank: 0, playerId: botKey(b.id), name: p.name, value, xp };
  })];
  rows.sort((a, b) => b.value - a.value || (b.xp ?? 0) - (a.xp ?? 0));
  return rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- 世界频道闲聊（英文，用户 10-31：要接地气，聊游戏也聊家常八卦，多用简写） ----
// {X} 换成另一个 AI 的名字。10-31 用户：别老问游戏问题，多聊家常、八卦、吃喝、风景、工作
/** 游戏相关的，少说一点（约两成），而且基本不提问 */
const GAME_LINES = [
  'finally got my pickaxe upgraded', 'this fishing spot is so relaxing', 'lol i died to a wolf again', 'the sunset in this game is so pretty',
  'my bank is getting full lol', 'afk mining overnight again', 'just found a rare drop!!', 'rng hates me today', 'one more lvl then bed. ok maybe two',
  'idk why but chopping trees is so calming', 'chilling at the pond', 'the snow area at night looks so good', 'my horse is faster than my wifi lol',
  '{X} gz on the lvl!', 'thx for the help earlier {X}', 'wb {X}', '{X} is always online lol do u ever sleep', 'gg', 'nice', 'lol', 'rip',
];
/** 家常、吃喝、风景、工作、八卦 */
const LIFE_LINES = [
  // 打招呼、来去
  'gm everyone', 'gm gm', 'morning all', 'evening all', 'just woke up, gm', 'brb', 'back', 'bk', 'brb dinner', 'brb gotta walk the dog',
  'afk 10 min, laundry', 'ok im back what did i miss', 'gn all, early shift tmr', 'so tired lol', 'cant sleep so here i am',
  // 吃喝
  'ordered pizza, best decision today', 'coffee #3 today and its only 10am', 'making pasta, smells so good', 'ramen again lol student life',
  'just had the best tacos of my life', 'my mom made dumplings, im in heaven', 'trying to eat healthy... ate a whole bag of chips', 'idk what to have for dinner',
  'pumpkin spice everything rn lol', 'bubble tea run brb', 'burnt my toast, great start to the day', 'bbq at my uncles this weekend',
  'my roommate ate my leftovers again smh', 'hot chocolate weather finally', 'anyone else eat cereal for dinner or just me', 'sushi night',
  'learning to bake bread, its going badly lol', 'grandma sent cookies', 'too much candy already and its not even halloween night',
  // 风景、天气
  'its raining here irl, perfect game weather', 'it snowed here already wtf', 'sunset outside my window is insane rn', 'leaves are all orange here, so pretty',
  'went hiking today, my legs are dead', 'went to the beach this morning, freezing but worth it', 'thunderstorm outside, hope my power stays on',
  'so foggy here i cant see the street', 'full moon tonight, go look', 'first frost this morning', 'heatwave here lol, 35 degrees in october',
  'went for a walk by the lake, so peaceful', 'the stars are so clear tonight',
  // 工作、学习
  'just got home from work, time to relax', 'my boss thinks im working rn lmao', 'anyone else on their lunch break?', 'monday again huh', 'tgif',
  'meetings all day, my brain is mush', 'overtime again ugh', 'got a raise today!!', 'first day at the new job tmr, nervous', 'quit my job lol wish me luck',
  'school tmr ugh', 'exams next week and im here mining copper', 'finished my essay at 2am, never again', 'my coworker microwaved fish again',
  'working from home is great until the neighbor starts drilling', 'night shift is killing me', 'weekend vibes', 'only 2 more days till friday',
  // 家常
  'my cat keeps walking on my keyboard lol', 'its 3am here and im still playing, send help', 'my mom just yelled at me to eat lol',
  'kids finally asleep, peace at last', 'my dog just stole my sandwich', 'my roommate thinks this game is a screensaver lol', 'gonna touch grass brb',
  'my gf is watching me play and judging my outfit lol', 'my little brother wants my account smh', 'birthday today ^^', 'my wifi is trash today',
  'phone at 5% dont leave me', 'cleaned my whole room, feel like a new person', 'my plants are dying again', 'adopted a kitten today!!',
  'my grandpa just learned to use emojis, its chaos', 'dentist tmr, pray for me', 'moving apartments this weekend, so much stuff',
  'happy halloween everyone!!', 'carved a pumpkin irl today', 'my neighbor has the scariest halloween decor', 'binge watching a show while afk fishing',
  // 八卦
  'did u see {X} on the leaderboard?? insane', 'heard {X} has like 3 accounts lol jk', '{X} and their horse are inseparable lol',
  'my sister is dating a guy who plays this game lol small world', 'my coworker just got engaged at the office party, so cute',
  'my neighbor got caught sneaking out lmao', 'saw my ex at the grocery store, hid behind the cereal lol', 'my friend just dyed her hair green',
  'apparently my roommate has a secret girlfriend lol', 'my cousin got a dog that looks exactly like him',
];
/** 问一句，过一会有别的 AI 接话 */
const PAIRS: [string, string[]][] = [
  ['what time is it for u guys?', ['9pm here', 'like 4am lol', 'lunch time', 'noon here']],
  ['what are u guys eating', ['ramen again lol', 'nothing, too lazy', 'tacos', 'leftover pizza', 'my moms curry']],
  ['hows the weather where u are', ['raining nonstop', 'sunny and cold', 'snowing lol', 'hot af']],
  ['anyone doing anything fun this weekend?', ['road trip', 'sleeping lol', 'working sadly', 'my friends wedding']],
  ['what do u guys do for work', ['nurse', 'still in school', 'office job, boring', 'chef lol']],
  ['anyone watching a good show rn?', ['rewatching the office', 'some anime my friend recommended', 'nah just youtube']],
  ['coffee or tea?', ['coffee always', 'tea gang', 'energy drinks lol']],
  ['hi everyone', ['hey!', 'yo', 'hi :)', 'hey hey']],
  ['cats or dogs?', ['cats obviously', 'dogs!!', 'both lol', 'hamsters tbh']],
  ['pineapple on pizza yes or no', ['yes and im proud', 'absolutely not', 'only with ham']],
  ['if u could live anywhere where would it be', ['japan', 'a cabin in the woods', 'by the beach', 'right here lol']],
  ['whats everyone listening to', ['lofi', 'old rock', 'kpop lol', 'the game music actually']],
  ['would u rather fight 1 horse sized duck or 100 duck sized horses', ['100 tiny horses easy', 'the big duck, i believe in myself', 'neither lol run']],
  ['early bird or night owl?', ['night owl obviously its 3am', 'early bird, 6am gym', 'neither, i just never sleep lol']],
  ['whats ur comfort food', ['mac and cheese', 'my moms soup', 'instant noodles lol', 'ice cream']],
  ['anyone have a weird talent', ['i can touch my nose with my tongue', 'i can whistle really loud', 'i can sleep anywhere lol']],
];
/** 几个人你一句我一句：A/B/C 是不同的 AI，{A}{B}{C} 换成他们的名字 */
const CONVOS: [number, string][][] = [
  [[0, 'are u from the us?'], [1, 'nah uk lol'], [0, 'oh nice, its so late there'], [1, 'ya i should sleep but one more lvl']],
  [[0, 'omg my cat just knocked my drink over'], [1, 'lmaooo'], [2, 'classic cat'], [0, 'all over my desk too smh']],
  [[0, 'anyone know whats up with {C}? havent seen them in days'], [1, 'idk maybe on vacation'], [2, 'i saw them yesterday lol'], [0, 'ah ok']],
  [[0, 'did u guys hear {C} left their guild?'], [1, 'wait what really'], [0, 'ya some drama lol'], [1, 'oof'], [2, 'tea pls']],
  [[0, 'ugh work tmr'], [1, 'same :('], [0, 'what do u do'], [1, 'nurse, night shifts'], [0, 'respect']],
  [[0, 'gonna go eat, brb'], [1, 'enjoy'], [0, 'thx']],
  [[0, 'is anyone else getting rained on irl'], [1, 'ya storm here'], [2, 'sunny here lol'], [0, 'jealous']],
  [[0, 'my kid just asked if the horse in my game is real lol'], [1, 'haha cute'], [2, 'tell them yes'], [0, 'lol i did']],
  [[0, 'are u guys doing anything for halloween?'], [1, 'party at a friends'], [2, 'staying home giving out candy'], [0, 'nice, im just gaming lol']],
  [[0, 'good night everyone'], [1, 'gn!'], [2, 'night'], [0, 'cya tmr']],
  [[0, 'anyone know a good movie'], [1, 'what genre'], [0, 'idc anything scary'], [2, 'it follows is good'], [0, 'ty ill check it']],
  [[0, 'just made homemade pizza'], [1, 'pics or it didnt happen'], [0, 'lol trust me its ugly but tasty'], [2, 'pineapple?'], [0, 'obviously'], [1, 'ew lol']],
  [[0, 'my boss just called me on my day off'], [1, 'dont answer'], [0, 'too late lol'], [2, 'rip ur weekend']],
  [[0, 'went to the mountains today'], [1, 'jealous, how was it'], [0, 'so pretty, all the leaves are red'], [1, 'need a trip like that']],
  [[0, 'so my neighbor is building a giant halloween skeleton'], [1, 'how big'], [0, 'like 3 meters lol'], [2, 'thats amazing'], [1, 'i need one']],
  [[0, 'first snow here today'], [1, 'already?? where u live'], [0, 'canada lol'], [1, 'ah that explains it']],
  [[0, 'my coworker brought donuts'], [1, 'best coworker'], [0, 'i ate 3 dont tell anyone'], [2, 'ur secret is safe lol']],
  [[0, 'lowkey think {C} has a crush on someone in their guild'], [1, 'LOL who'], [0, 'not saying'], [2, 'spill'], [0, 'nope']],
  [[0, 'my mom wants me to visit this weekend'], [1, 'go! free food'], [0, 'true lol'], [2, 'moms cooking hits different']],
  [[0, 'anyone else hate mondays'], [1, 'everyone hates mondays'], [2, 'i work weekends so monday is my friday lol'], [0, 'lucky']],
  [[0, 'just got caught in the rain without an umbrella'], [1, 'f'], [2, 'hot shower time'], [0, 'already on it lol']],
  [[0, 'tried sushi for the first time'], [1, 'and??'], [0, 'kinda good actually'], [1, 'welcome to the club']],
  [[0, 'fun fact: octopuses have 3 hearts'], [1, 'wait really'], [0, 'ya and blue blood'], [2, 'theyre basically aliens'], [1, 'learned something today']],
  [[0, 'is a hotdog a sandwich'], [1, 'no'], [2, 'yes technically'], [1, 'absolutely not'], [0, 'this is gonna start a war lol']],
  [[0, 'a duck followed me home today'], [1, 'keep it'], [2, 'name it bob'], [0, 'bob is now my best friend']],
  [[0, 'why dont skeletons fight each other'], [1, 'why'], [0, 'they dont have the guts'], [1, 'boooo'], [2, 'lmao that was bad']],
  [[0, 'just booked a trip to japan!!'], [1, 'omg jealous'], [2, 'eat all the ramen'], [0, 'thats the plan lol']],
  [[0, 'learning guitar, any tips'], [1, 'practice every day even 10 min'], [2, 'ur fingers will hurt, its normal'], [0, 'they already do lol']],
  [[0, 'my parrot learned to copy my ringtone'], [1, 'lmao'], [0, 'i keep checking my phone for nothing'], [2, 'thats evil, i love it']],
  [[0, 'anyone into astronomy? saturn is visible tonight'], [1, 'wait really, where'], [0, 'south-east after sunset'], [1, 'going outside brb'], [2, 'cloudy here :(']],
  [[0, 'built my own pc today'], [1, 'did it boot first try?'], [0, 'no lol forgot to plug in the gpu'], [2, 'classic'], [1, 'we all did that once']],
  [[0, 'cats or dogs, go'], [1, 'cats'], [2, 'dogs'], [1, 'wrong answer lol'], [2, 'how dare u']],
  [[0, 'went to the gym first time in months'], [1, 'proud of u'], [0, 'cant lift my arms to type'], [2, 'and yet here u are typing lol']],
];
/** 10-31 用户：还要聊很多有趣的事，不一定和游戏有关——音乐、影视、运动、旅行、宠物、冷知识、脑洞、冷笑话、爱好 */
const FUN_LINES = [
  // 冷知识
  'fun fact: octopuses have three hearts', 'did u know honey never spoils? they found 3000 year old honey in egypt', 'apparently cows have best friends',
  'fun fact: bananas are berries but strawberries arent', 'sea otters hold hands when they sleep so they dont drift apart', 'a group of crows is called a murder lol',
  'wombat poop is cube shaped, look it up', 'there are more trees on earth than stars in the milky way apparently', 'flamingos are pink because of what they eat',
  'scotland has a unicorn as its national animal lol', 'sharks are older than trees, wild', 'a day on venus is longer than its year',
  // 脑洞
  'shower thought: we never see our own face, only reflections', 'if u think about it, a hotdog is a taco', 'why do we park on driveways and drive on parkways',
  'what if dogs think we go hunting every time we leave the house', 'is cereal a soup? discuss', 'if u clean a vacuum, are u the vacuum now',
  'imagine being the first person to milk a cow. like what made u do that', 'does anyone else talk to their plants or just me',
  // 冷笑话
  'why dont skeletons fight each other? they dont have the guts', 'i told my wife she draws her eyebrows too high. she looked surprised',
  'what do u call a fake noodle? an impasta', 'i used to hate facial hair but then it grew on me', 'why did the scarecrow win an award? outstanding in his field',
  'my friend told me a joke about construction. still working on it', 'i only know 25 letters of the alphabet. i dont know y',
  // 音乐
  'anyone got music recs? need new stuff for grinding', 'cant stop listening to lofi while playing', 'went to a concert last night, ears still ringing',
  'learning guitar, my fingers hurt so much', 'my neighbor plays drums at 11pm every night', 'the music in this game slaps ngl', 'karaoke night tmr, im so bad lol',
  // 影视、书
  'just finished a show and now i feel empty', 'rewatching lord of the rings for the 10th time', 'anyone read anything good lately?', 'started a new anime, im hooked',
  'horror movie marathon tonight for halloween', 'the book was better. its always better', 'fell asleep during a movie at the cinema lol', 'cried at a cartoon, no shame',
  // 运动、健身
  'went to the gym for the first time in months, cant walk', 'ran 5k this morning!!', 'yoga is harder than it looks', 'my team lost again, im done with football',
  'tried rock climbing today, so fun', 'learning to skateboard at 28, fell 20 times', 'swimming laps is so relaxing',
  // 旅行
  'just got back from japan, miss it already', 'booked a trip to iceland!!', 'airport delays are the worst', 'road trip playlist ready',
  'went camping, got eaten alive by mosquitos', 'saw the northern lights once, best night ever', 'want to visit italy just for the food lol',
  // 宠物、动物
  'my cat brought me a leaf as a gift, i feel honored', 'my dog is afraid of the vacuum lol', 'saw a squirrel steal a whole slice of pizza today',
  'my parrot learned to copy my phone ringtone, its chaos', 'found a frog in my shoe', 'my hamster escaped again', 'a duck followed me home today lol',
  // 爱好、科技
  'started knitting, made a very ugly scarf', 'building a lego set, 2000 pieces lol', 'got a new keyboard, so clicky', 'my laptop sounds like a jet engine',
  'trying to grow tomatoes on my balcony', 'painted my room blue, regret', 'finally fixed my bike myself, so proud', 'learning to cook from youtube, going ok',
  'just built my own pc!!', 'my phone screen cracked again smh', 'took up photography, everything i shoot is blurry lol',
];
/** 模板：{x} 从对应的词表里抽，能组出很多不同的句子 */
const FILL: Record<string, string[]> = {
  food: ['pizza', 'ramen', 'tacos', 'sushi', 'curry', 'pancakes', 'burgers', 'dumplings', 'pho', 'mac and cheese', 'fried chicken', 'kimchi stew', 'lasagna'],
  meal: ['breakfast', 'lunch', 'dinner', 'a midnight snack'],
  pet: ['cat', 'dog', 'parrot', 'hamster', 'bunny', 'turtle', 'puppy', 'kitten'],
  place: ['japan', 'italy', 'mexico', 'norway', 'thailand', 'greece', 'peru', 'new zealand', 'korea', 'portugal'],
  thing: ['my keys', 'my phone', 'my headphones', 'my wallet', 'the tv remote', 'my glasses'],
  show: ['a cooking show', 'a true crime doc', 'an old sitcom', 'a space documentary', 'a dating show lol', 'a nature doc about penguins'],
};
const TEMPLATES = [
  'had {food} for {meal} again lol', 'craving {food} so bad rn', 'anyone else think {food} is overrated? just me?', 'made {food} from scratch today, nailed it',
  'my {pet} is sleeping on my arm, cant move', 'my {pet} just knocked {thing} off the table', 'cant find {thing} anywhere, again', 'someday ill visit {place}',
  'my friend just got back from {place}, so jealous', 'watching {show} while i grind', 'stayed up way too late watching {show}', 'if i won the lottery id move to {place}',
  'thinking about getting a {pet}', 'my neighbor has a {pet} that screams every morning lol', '{food} for {meal}? yes', 'lost {thing} for an hour, it was in my hand',
];
/**
 * 打字习惯（用户 10-31：要像真人）：一半的 AI 全小写；有人爱在句尾加 lol、xD、:) 之类，
 * 有人一激动就连打感叹号。r 是这条消息自己的随机数
 */
const TAILS = ['', ' lol', ' xD', ' :)', ' haha', ' lmao', ' :D', ' ^^'];
function styled(text: string, b: AiPlayer, r = 0) {
  let out = text;
  if (rnd(b.seed, 102) < 0.4 && /!$/.test(out)) out = out.replace(/!+$/, '!!!');
  const tail = TAILS[Math.floor(rnd(b.seed, 103) * TAILS.length)];
  if (tail && rnd(r, 104) < 0.18 && out.length > 6 && !/(lol|lmao|haha|xd|:\)|:d|\^\^|[?!])$/i.test(out)) out += tail;
  if (rnd(b.seed, 90) < 0.5) out = out.toLowerCase().replace(/\.$/, '');
  return out;
}
/** 别的 AI 跳出来接一句（用户 10-31）：按说的内容挑反应 */
const CHIME: [RegExp, string[]][] = [
  [/fun fact|did u know|apparently|look it up|wild$|older than|longer than/i, ['wait really?', 'TIL', 'no way', 'thats so cool', 'how do u even know this lol', 'mind blown']],
  [/why (dont|did|do)|what do u call|i told my|grew on me|still working on it|dont know y|impasta/i, ['boooo', 'lmao', 'that was terrible', 'im leaving', 'ok that got me', 'dad joke alert']],
  [/\b(cat|dog|parrot|hamster|bunny|kitten|puppy|turtle|duck|frog|squirrel|pet)\b/i, ['aww', 'pics?', 'so cute', 'lol animals are the best', 'i need a pet']],
  [/\b(pizza|ramen|tacos|sushi|curry|pancakes|burgers|dumplings|pho|cookies|bread|pasta|food|eat|dinner|lunch|breakfast|candy|chips|donuts|bbq|chicken|lasagna|stew)\b/i, ['now im hungry', 'sounds so good', 'save me some', 'yum', 'ok im ordering food now lol']],
  [/\b(rain|snow|storm|sunset|stars|moon|fog|leaves|beach|lake|hiking|mountains|frost|heatwave|northern lights)\b/i, ['jealous', 'sounds nice', 'same here', 'wish i was there', 'so pretty']],
  [/\b(work|boss|job|shift|meetings|overtime|coworker|school|exams?|essay|monday)\b/i, ['mood', 'relatable', 'f', 'hang in there', 'same lol', 'rip']],
  [/\b(trip|japan|italy|iceland|travel|airport|camping|visit)\b/i, ['take me with u', 'jealous', 'have fun!', 'bring me a souvenir lol']],
  [/\b(gym|ran|5k|yoga|climbing|skateboard|swimming|football)\b/i, ['respect', 'proud of u', 'i should do that', 'my legs hurt just reading that']],
  [/\b(music|concert|guitar|drums|karaoke|lofi|song)\b/i, ['nice', 'what do u listen to?', 'rock on', 'drop a song rec']],
  [/\b(show|movie|anime|book|read)\b/i, ['which one?', 'no spoilers pls', 'i need recs', 'adding it to my list']],
  [/\b(gz|grats|rare drop|raise)\b/i, ['gz!', 'nice!', 'lucky', 'congrats!!']],
  [/\b(brb|afk|back|bk)\b/i, ['wb', 'k', 'wb!']],
  [/\b(gm|morning)\b/i, ['gm!', 'morning :)', 'gm gm']],
  [/\b(gn|night)\b/i, ['gn!', 'night', 'sleep well']],
  [/\?$/, ['idk tbh', 'good question', 'hmm', 'no clue lol', 'interesting']],
];
const CHIME_ANY = ['lol', 'same', 'fr', 'mood', 'real', 'haha', 'true', 'lmao', 'ok but same'];
const chimeFor = (text: string, r: number) => pick(CHIME.find(([re]) => re.test(text))?.[1] ?? CHIME_ANY, r);
/**
 * 群聊话题（用户 10-31）：隔一阵有人抛个话题，四五个 AI 一起你一句我一句聊几分钟，不用玩家开头。
 * lines 是各人的说法（每句只说一次），react 是穿插的附和
 */
const TOPICS_GROUP: { open: string[]; lines: string[]; react: string[] }[] = [
  { open: ['how long have u guys been playing today', 'anyone else been on all day lol'],
    lines: ['like 3 hours oops', 'just logged in', 'since breakfast lol', 'on and off all day', '30 min, on my lunch break', 'too long, dont tell my mom', 'i left it running overnight'],
    react: ['lol', 'same', 'addicted', 'no life gang', 'touch grass lol', 'respect'] },
  { open: ['what was ur first video game', 'oldest game u remember playing?'],
    lines: ['pokemon on gameboy', 'some flash games at school lol', 'mario kart', 'minecraft, im young lol', 'tetris on my dads phone', 'the sims', 'runescape back in the day', 'a pirate game on pc', 'zelda', 'solitaire counts right'],
    react: ['classic', 'nostalgia', 'oh man', 'good times', 'that takes me back', 'legend'] },
  { open: ['what music do u guys listen to while playing', 'drop ur grinding playlist vibe'],
    lines: ['lofi beats always', 'old rock, my dads influence', 'kpop lol', 'game soundtracks', 'podcasts actually', 'metal, it makes me grind faster', 'classical, very fancy', 'whatever spotify throws at me', 'the game music, its nice', 'rain sounds lol'],
    react: ['good taste', 'same', 'interesting', 'nice', 'ooh', 'valid'] },
  { open: ['favorite movie of all time?', 'whats a movie u can rewatch forever'],
    lines: ['shrek, no shame', 'spirited away', 'the lord of the rings, extended', 'back to the future', 'any harry potter tbh', 'interstellar, cried twice', 'home alone every christmas', 'mean girls lol'],
    react: ['classic', 'good taste', 'omg yes', 'never seen it', 'u have to watch it', 'legendary'] },
  { open: ['whats the weirdest dream uve had', 'had the weirdest dream last night, anyone else get weird dreams?'],
    lines: ['i dreamt my teeth fell out, classic', 'i was a pigeon running a bakery', 'my cat could talk and it was mean', 'i showed up to school without shoes', 'i dreamt i was in this game lol mining forever', 'being chased by a giant goose', 'i won the lottery and woke up broke', 'i was flying but only like 1 meter off the ground'],
    react: ['LOL', 'what does that even mean', 'ur brain is wild', 'same', 'thats terrifying', 'i need to know more'] },
  { open: ['what was ur dream job as a kid', 'what did u wanna be when u grew up'],
    lines: ['astronaut obviously', 'a vet, i loved animals', 'a dinosaur. not a paleontologist. a dinosaur', 'pro footballer lol', 'a chef', 'a youtuber, cringe', 'a pilot', 'a firefighter'],
    react: ['same!', 'cute', 'did it work out?', 'dream big', 'classic'] },
  { open: ['what do u guys do for work btw', 'curious what everyone does irl', 'whats ur job? curious', 'what do u guys do irl'],
    lines: ['nurse, night shifts', 'student, dying inside', 'software dev, i fix bugs i made', 'i work in a coffee shop', 'teacher, the kids are chaos', 'between jobs lol', 'truck driver, playing on breaks', 'graphic designer', 'chef, so i play after closing', 'retail, pray for me', 'warehouse, night shifts', 'teacher, grading papers rn actually', 'software dev, this is my break lol', 'student, should be studying', 'i drive a delivery van', 'nurse, just got off a 12h shift', 'i work at a bakery, up at 4am', 'between jobs rn, hence the grinding lol'],
    react: ['respect', 'cool', 'thats hard work', 'nice', 'oof', 'thats awesome', 'thats cool', 'same here', 'hang in there'] },
  { open: ['if u won a million dollars what would u do first', 'lottery time: what do u buy first'],
    lines: ['pay off my student loans, sad but true', 'buy a house with a big kitchen', 'quit my job immediately', 'travel everywhere', 'buy my mom a car', 'a huge gaming setup', 'invest it and be boring', 'adopt like 10 dogs', 'buy an island lol', 'open a small cafe'],
    react: ['dream', 'smart', 'same honestly', 'take me with u', 'love that', 'relatable'] },
  { open: ['where would u travel if u could go anywhere tmr', 'dream travel destination?'],
    lines: ['japan, for the food', 'iceland to see the northern lights', 'italy, pasta tour', 'new zealand for the mountains', 'somewhere with a beach and no wifi', 'korea', 'peru, machu picchu', 'norway fjords', 'just home to see my family honestly', 'the moon lol'],
    react: ['take me', 'great choice', 'so jealous', 'add it to my list', 'beautiful', 'yesss'] },
  { open: ['favorite season and why', 'summer or winter?'],
    lines: ['autumn, the colors are so nice', 'winter, hot chocolate season', 'summer, beach every weekend', 'spring, not too hot not too cold', 'winter but only when it snows', 'summer, i hate being cold', 'fall for the halloween vibes'],
    react: ['valid', 'same', 'fall gang', 'cozy', 'facts', 'nah winter is pain'] },
  { open: ['best halloween costume uve ever worn?', 'what are u guys dressing up as for halloween?'],
    lines: ['a banana, very scary', 'a vampire, classic', 'my friend and i were salt and pepper', 'a ghost with a bedsheet lol', 'a pumpkin, fits the game', 'i wore cat ears and called it a day', 'a zombie, the makeup took 2 hours', 'a skeleton onesie, comfy', 'not dressing up, im the candy guy'],
    react: ['iconic', 'love it', 'lol', 'so creative', 'classic'] },
  { open: ['whats the best snack, go', 'snack tier list time', 'best snack, go', 'whats ur go to snack while gaming'],
    lines: ['chips, salt and vinegar', 'popcorn', 'gummy bears', 'apples with peanut butter', 'cheese, just cheese', 'chocolate covered pretzels', 'instant noodles at 2am', 'grapes frozen, trust me', 'cookies', 'seaweed snacks', 'chips, always chips', 'popcorn with butter', 'grapes, healthy king', 'cheese and crackers', 'spicy peanuts', 'whatever is in the fridge lol'],
    react: ['good one', 'yum', 'underrated', 'facts', 'now i want some', 'elite', 'good pick', 'im hungry now', 'greasy keyboard gang', 'solid'] },
  { open: ['ok whats everyones favorite food, go', 'random question: favorite food?'],
    lines: ['pizza no contest', 'my grandmas dumplings', 'sushi every day if i could', 'tacos, any kind', 'mac and cheese, dont judge', 'pho on a cold day', 'honestly just a good burger', 'spicy noodles, the spicier the better', 'my own cooking lol jk its terrible', 'fresh bread with butter'],
    react: ['good choice', 'now im hungry', 'valid', 'facts', 'ooh yes', 'respect'] },
  { open: ['what are u guys having for dinner', 'dinner ideas? i got nothing'],
    lines: ['leftover pasta', 'cereal, dont judge', 'my mom made soup', 'ordering thai', 'frozen pizza again', 'grilled chicken and rice', 'instant noodles with an egg', 'tacos, its always tacos'],
    react: ['yum', 'jealous', 'now im hungry', 'good call', 'lol same'] },
  { open: ['cats or dogs, settle this once and for all', 'team cats or team dogs?'],
    lines: ['dogs, they love u unconditionally', 'cats, they respect ur space', 'both, why choose', 'cats are just tiny roommates', 'dogs because walks = exercise lol', 'i have 2 cats so cats obviously', 'my dog would be offended if i said cats', 'birds actually', 'whatever pet lets me sleep in'],
    react: ['wrong lol', 'agreed', 'traitor', 'based', 'debatable', 'fair point'] },
  { open: ['anyone have a pet? what kind', 'show of hands, who has pets'],
    lines: ['2 cats, both menaces', 'a golden retriever, best boy', 'a hamster named potato', 'no pets, my landlord said no', 'a turtle older than me', 'a bunny that hates me', 'fish, does that count', 'my parents dog, i visit it lol'],
    react: ['aww', 'pics?', 'i want one', 'so cute'] },
  { open: ['whats the best thing that happened to u this week', 'share something good that happened today'],
    lines: ['found 20 bucks in my old jacket', 'my plant finally bloomed', 'passed my driving test!!', 'my cat slept on me all night', 'got a raise lol finally', 'my friend visited from out of town', 'the bus came on time for once', 'made pancakes and they werent burnt'],
    react: ['congrats!!', 'love that', 'wholesome', 'nice!', 'small wins', 'yay'] },
  { open: ['whats everyone doing this weekend', 'any weekend plans?', 'whats everyone doing this weekend?'],
    lines: ['sleeping as much as possible', 'working sadly', 'hiking if it doesnt rain', 'family dinner', 'cleaning my apartment, its a disaster', 'concert on saturday!', 'nothing and i love it', 'my friends birthday party', 'halloween party obviously', 'gaming all weekend lol', 'sleeping in, thats the whole plan', 'my cousins birthday party', 'working both days ugh', 'gonna try a new hiking trail', 'cleaning my room finally', 'movie night with friends', 'nothing, just grinding here lol', 'farmers market then nap'],
    react: ['nice', 'have fun', 'jealous', 'rip', 'sounds perfect', 'mood', 'sounds fun', 'enjoy!', 'relaxing, love it'] },
  { open: ['unpopular opinion time', 'ok share an unpopular opinion'],
    lines: ['cold pizza is better than hot pizza', 'mornings are actually nice', 'i dont like chocolate', 'sequels are often better', 'cereal before milk is wrong... wait', 'winter is the best season', 'i hate the beach, sand everywhere', 'tea is better than coffee', 'pineapple on pizza is great', 'naps are overrated'],
    react: ['WHAT', 'ok this is a crime', 'i kinda agree', 'nope', 'hot take', 'blocked lol'] },
];
/** 长句子（用户 10-31：不只说短句） */
const LONG_LINES = [
  'ok so i finally convinced my roommate to try this game and now he wont stop asking me where to find copper lol',
  'honestly this is the only game i can play while working from home without my boss noticing, it just runs in the corner',
  'just got back from a 12 hour shift and the first thing i did was check how much my character mined while i was gone',
  'my little sister saw me playing and asked why my guy keeps hitting the same rock for an hour, couldnt really explain it',
  'i swear every time i say ill just do one more level its suddenly 2am and i have work in five hours',
  'went to my grandmas for dinner and she asked what game im always on, showed her and now she wants an account too',
  'the weather has been so bad all week that i havent left the house except for groceries, at least i got a lot of levels',
  'does anyone else feel weirdly proud when their character finishes a long task while youre asleep, like good job little guy',
  'i tried to explain idle games to my dad and he said so you pay to watch a guy work, and honestly hes not wrong',
  'my cat has decided that the warm spot next to my laptop is her bed now so i guess im not closing it tonight',
  'spent the whole morning cleaning the apartment and now i deserve to sit here and chat with you guys for a bit',
  'first time in weeks the sun is out so i took my laptop to the park, the wifi is terrible but the view is worth it',
  'i keep telling myself ill go to bed early tonight and then i end up chatting here until the birds start singing lol',
  'not gonna lie the music when it rains in game is so cozy i sometimes just leave it on while i read',
  'had a really rough day at work but logging in and seeing everyone chatting here kinda makes it better ngl',
  'my neighbors are having a halloween party and the bass is shaking my windows, so i guess im gaming till they stop',
  'tried cooking a new recipe tonight, it was supposed to be a stew but it turned into something closer to soup, still good though',
  'i think the best part of this game is that you can just chill and talk to people while your character does all the work',
];
/** 一个人连着说几句，讲件事 */
const STORIES = [
  ['so funny story', 'i was cooking dinner and my dog jumped up', 'and stole the entire chicken off the counter', 'didnt even look sorry lol'],
  ['update on my plants', 'they are alive', 'barely, but alive'],
  ['ok i need to rant real quick', 'my upstairs neighbor has been vacuuming at midnight', 'for 3 nights in a row', 'who does that'],
  ['just had the weirdest conversation with a taxi driver', 'he spent 20 min telling me about his pet snake', 'it has its own instagram apparently'],
  ['guess who got the job', 'ME', 'start on monday!!'],
  ['so my mom finally learned to video call', 'she spent the whole call showing me her ceiling', 'love her tho'],
  ['went to the store for milk', 'came back with snacks, candles and a plant', 'forgot the milk'],
  ['ok confession', 'ive never actually finished a book i started this year', 'but i have 12 half read ones lol'],
  ['the power went out for like an hour', 'had to actually talk to my family', 'they seem nice'],
  ['so i tried to surprise my gf with breakfast in bed', 'set off the smoke alarm', 'she woke up anyway lol'],
  ['booked a dentist appointment', 'canceled it', 'booked it again', 'adulting is hard'],
];
/** 上线、下线 */
const HELLO = ['hi all', 'hey guys', 'morning everyone', 'back again lol', 'yo', 'hello hello', 'evening all'];
const BYE = ['gn all', 'gotta go, cya', 'logging off, bye', 'ok sleep time, night', 'cya tmr guys', 'bed time, gn'];
/** 说自己在游戏里干什么，{what} 换成正在挖的、砍的、打的东西 */
const ACT_LINES: Record<string, string[]> = {
  mining: ['mining {what} rn, its so slow lol', 'been mining {what} for like an hour'],
  woodcutting: ['chopping {what}, so relaxing', 'still on {what}, need more logs'],
  fishing: ['fishing {what}, nothing is biting', 'caught so many {what} already lol'],
  craft: ['doing {what} rn, eating all my mats', 'grinding {what}, almost lvl up'],
  combat: ['farming {what} rn, they keep hitting me lol', '{what} dropped nothing again smh', 'anyone else killing {what}? where r u'],
  walk: ['on my way to a new spot', 'running across the map lol'],
  idle: ['just chilling in town', 'afk in town, getting snacks'],
};
const TOPIC_SLOT = 18 * MIN;
/** 打字要时间：越长的话等得越久 */
const typing = (text: string, r: number) => 3_000 + text.length * 170 + Math.floor(r * 12_000);
/** 换话题时的过渡（用户 10-31：真人聊一个话题，慢慢才拐到别的） */
const BRIDGE: [string, string][] = [
  ['speaking of which, ', '说到这个，'], ['that reminds me, ', '这让我想起来，'], ['ok slightly different question, ', '换个相关的问题，'],
  ['kinda related but ', '有点相关，'], ['on that note, ', '顺着这个说，'], ['lol ok but ', '哈哈好吧，那'],
];
/** 群聊里点名接某人的话，和被点到的人的解释 */
const FOLLOW: [string, string][] = [
  ['same!!', '我也是！！'], ['wait why', '等等，为啥'], ['no way lol', '不会吧哈哈'], ['ok tell me more', '好，展开说说'],
  ['really?', '真的吗？'], ['haha i knew it', '哈哈我就知道'], ['thats so u lol', '太像你了哈哈'], ['respect', '佩服'],
  ['omg me too', '天哪我也是'], ['how come?', '为什么呢？'],
];
const ELAB: [string, string][] = [
  ['idk it just hits different', '说不上来，就是感觉不一样'], ['long story lol', '说来话长哈哈'], ['trust me on this one', '这个信我'],
  ['ya for real', '真的'], ['dont judge me lol', '别评判我哈哈'], ['its a whole thing lol', '这事说来复杂哈哈'],
  ['always has been', '一直都是'], ['haha yep', '哈哈是的'], ['ikr', '对吧'], ['ill tell u later lol', '回头跟你说哈哈'],
];
const groupOn = (j: number) => rnd(800, j) < 0.8;
/** 第 j 段的群聊：开始时间、都谁、说哪几句（各家算出来一样）；这段没有就是 null。话题按相关顺序往下走 */
function groupAt(bots: AiPlayer[], j: number) {
  if (!groupOn(j)) return null;
  const N = TOPICS_GROUP.length;
  const tp = TOPICS_GROUP[((j % N) + N) % N];
  const start = j * TOPIC_SLOT + Math.floor(rnd(802, j) * 3 * MIN);
  const on = bots.filter((b) => botOnline(b, start));
  if (on.length < 3) return null;
  const cast: AiPlayer[] = [];
  const size = Math.min(on.length, 4 + Math.floor(rnd(803, j) * 4));
  for (let k = 0; k < 30 && cast.length < size; k++) {
    const b = pickTalker(on, rnd(804, j, k));
    if (!cast.includes(b)) cast.push(b);
  }
  // 在线的大多潜水、凑不齐几个人聊就不聊
  if (cast.length < 3) return null;
  const open = pick(tp.open, rnd(805, j));
  // 上一段也在聊：顺着过渡过来，不是突然换
  const br = groupOn(j - 1) && rnd(801, j) < 0.7 ? pick(BRIDGE, rnd(812, j)) : null;
  const msgs: { who: AiPlayer; text: string; zh?: string; at: number }[] = [
    { who: cast[0], text: br ? br[0] + open : open, zh: br && BOT_ZH[open] ? br[1] + BOT_ZH[open] : BOT_ZH[open], at: start },
  ];
  // 每人只答一次（用户 10-31：同一个人前后答得不一样很假），中间有人附和、点名追问，被问的人再解释两句
  const left = [...tp.lines];
  const order = [...cast.slice(1), cast[0]].sort((x, y) => rnd(814, j, x.seed) - rnd(814, j, y.seed));
  let t = start;
  const say = (who: AiPlayer, text: string, zh: string | undefined, k: number, slow = 1) => {
    t += typing(text, rnd(808, j, k)) + Math.floor(rnd(813, j, k) ** 2 * 20_000 * slow);
    msgs.push({ who, text, zh, at: t });
  };
  const others = (x: AiPlayer, k: number) => { const o = cast.filter((c) => c !== x); return o[Math.floor(rnd(815, j, k) * o.length)]; };
  const elab = (x: AiPlayer, k: number) => {
    const e = ELAB.filter(([en]) => !msgs.some((m) => m.text === en));
    if (e.length) { const [en, zh] = pick(e, rnd(816, j, k)); say(x, en, zh, k + 50, 0.3); }
  };
  order.forEach((x, k) => {
    if (!left.length) return;
    const ans = left.splice(Math.floor(rnd(810, j, k) * left.length), 1)[0];
    say(x, ans, BOT_ZH[ans], k);
    const r = rnd(809, j, k);
    if (r < 0.3) {
      // 点名追问 / 附和
      const y = others(x, k);
      const [en, zh] = pick(FOLLOW, rnd(817, j, k));
      say(y, `${x.name} ${en}`, `${x.name} ${zh}`, k + 20, 0.3);
      if (/\?$|why|tell me|no way/.test(en) || rnd(818, j, k) < 0.4) elab(x, k);
    } else if (r < 0.65) {
      const reacts = tp.react.filter((v) => !msgs.some((m) => m.text === v));
      if (!reacts.length) return;
      const v = pick(reacts, rnd(811, j, k));
      say(others(x, k + 7), v, BOT_ZH[v], k + 30, 0.4);
      if (v.endsWith('?')) elab(x, k + 3);
    }
  });
  return { start, end: t, msgs };
}
const SLOT = 75_000;
/** 单句：原句和中文（模板按抽到的词拼好） */
function lineAt(i: number, k: number): { en: string; zh: string } {
  const r = rnd(788, i, k);
  const plain = (en: string) => ({ en, zh: BOT_ZH[en] ?? '' });
  const n = i * 4 + k;
  if (r < 0.1) return plain(cyc(GAME_LINES, n, 820));
  if (r < 0.4) return plain(cyc(LIFE_LINES, n, 821));
  if (r < 0.65) return plain(cyc(FUN_LINES, n, 822));
  if (r < 0.82) return plain(cyc(LONG_LINES, n, 823));
  const tpl = cyc(TEMPLATES, n, 824);
  const words: Record<string, string> = {};
  let j = 0;
  const en = tpl.replace(/\{(\w+)\}/g, (all, w: string) => (FILL[w] ? (words[w] = pick(FILL[w], rnd(789, i, k, j++))) : all));
  const zh = (BOT_ZH[tpl] ?? '').replace(/\{(\w+)\}/g, (all, w: string) => (words[w] ? FILL_ZH[words[w]] ?? words[w] : all));
  return { en, zh };
}

const CJK = /[\u3400-\u9fff]/;
// 物品、怪物名字的中英文（界面是哪种语言，ACTIONS 里就是哪种）
const REV = LANG === 'en' ? new Map(Object.entries(EN).map(([k, v]) => [v, k])) : null;
const zhName = (n: string) => REV?.get(n) ?? n;
const enName = (n: string) => (LANG === 'en' ? n : EN[n] ?? n).toLowerCase();
/** 说说自己正在游戏里干什么：和它在地图上的样子对得上 */
function actLine(b: AiPlayer, t: number, r: number): { en: string; zh: string } | null {
  const d = botDoing(botProfile(b, t), b.seed, t);
  if (!d) return null;
  let key: string, what = '', whatZh = '';
  if (d.idle) key = 'idle';
  else if (!d.action) key = 'walk';
  else {
    const a = ACTIONS[d.action];
    if (!a) return null;
    if (a.kind === 'combat') { const m = MONSTERS[a.monster]; key = 'combat'; what = enName(m?.name ?? ''); whatZh = zhName(m?.name ?? ''); }
    else {
      key = a.skill in ACT_LINES ? a.skill : 'craft';
      // 做东西的说技能名；采集的说东西名，翻不出英文就也说技能名
      const sk = SKILLS[a.skill].name;
      const useSkill = key === 'craft' || CJK.test(enName(a.name));
      what = enName(useSkill ? sk : a.name); whatZh = zhName(useSkill ? sk : a.name);
    }
  }
  if (!what || CJK.test(what)) return null;
  const tpl = pick(ACT_LINES[key], r);
  return { en: tpl.replace('{what}', what), zh: (BOT_ZH[tpl] ?? '').replace('{what}', whatZh) };
}

/** 第 i 段说哪一类：对话、一问一答、讲故事、说自己在干嘛、单句 */
type Kind = 'convo' | 'pair' | 'story' | 'act' | 'line';
function kindAt(i: number): Kind {
  const r = rnd(780, i);
  return r < 0.25 ? 'convo' : r < 0.32 ? 'pair' : r < 0.42 ? 'story' : r < 0.5 ? 'act' : 'line';
}
const ITEMS_OF = { convo: [CONVOS, 825], pair: [PAIRS, 826], story: [STORIES, 827] } as const;
/** 往前一个半小时内说过的不再说（按「可能说过」算，宁可多避开） */
const RECENT = 72;
function usedRecently(kind: 'convo' | 'pair' | 'story', i: number) {
  const [list, salt] = ITEMS_OF[kind];
  const me = cyc<unknown>(list, i, salt);
  for (let w = 1; w <= RECENT; w++) if (kindAt(i - w) === kind && cyc<unknown>(list, i - w, salt) === me) return true;
  return false;
}
function lineUsedRecently(en: string, i: number) {
  for (let w = 1; w <= RECENT; w++) if (kindAt(i - w) === 'line' && lineAt(i - w, 0).en === en) return true;
  return false;
}
const slotOn = (i: number, n: number) => rnd(777, i) < Math.min(0.6, 0.05 + n * 0.035);
/** 某个时间段里 AI 说的话（按时间排好） */
export function botChat(bots: AiPlayer[], from: number, to: number): ChatMsg[] {
  if (!bots.length) return [];
  const out: ChatMsg[] = [];
  const push = (id: string, b: AiPlayer, en: string, zh: string | undefined, t: number) => {
    if (t >= from && t <= to) out.push({ id, channel: 'world', playerId: botKey(b.id), name: b.name, text: styled(en, b, strHash(id)), zh, at: t });
  };
  // 群聊：开得早的可能还没聊完，往前多看一段
  const groups: { start: number; end: number }[] = [];
  for (let j = Math.floor(from / TOPIC_SLOT) - 1; j <= Math.floor(to / TOPIC_SLOT); j++) {
    const g = groupAt(bots, j);
    if (!g) continue;
    groups.push(g);
    g.msgs.forEach((m, k) => push(`bot-g${j}-${k}`, m.who, m.text, m.zh, m.at));
  }
  // 上线打招呼、下线说再见
  for (const b of bots) {
    // 潜水的很少打招呼
    const p = Math.min(0.5, 0.1 + chattyOf(b) * 0.15);
    for (const z of sessionsIn(b, from, to)) {
      if (rnd(b.seed, 97, strHash(z.key)) < p) { const en = pick(BYE, rnd(b.seed, 98, strHash(z.key))); push(`bot-bye-${b.id}-${z.key}`, b, en, BOT_ZH[en], z.off - 40_000); }
      if (rnd(b.seed, 99, strHash(z.key)) < p) { const en = pick(HELLO, rnd(b.seed, 100, strHash(z.key))); push(`bot-hi-${b.id}-${z.key}`, b, en, BOT_ZH[en], z.on + 30_000); }
    }
  }
  // 往前多看几段：前面开始的对话可能还在接着说
  for (let i = Math.floor(from / SLOT) - 5; i <= Math.floor(to / SLOT); i++) {
    const at = i * SLOT + Math.floor(rnd(779, i) * 50_000);
    const on = bots.filter((b) => botOnline(b, at));
    if (!on.length || !slotOn(i, on.length)) continue;
    // 前两段刚有人起了话头就别再另起一个（用户 10-31：别一句一个话题）
    if (slotOn(i - 1, on.length) || slotOn(i - 2, on.length)) continue;
    // 大家正在群聊、或者刚聊完时别插别的话题
    if (groups.some((g) => at > g.start - MIN && at < g.end + 3 * MIN)) continue;
    const a = pickTalker(on, rnd(778, i));
    // 对话里出现的其他人：不重复的几个 AI（话多的更常出来）
    const cast = [a];
    for (let j = 0; j < 10 && cast.length < 4 && cast.length < on.length; j++) {
      const c = pickTalker(on, rnd(786, i, j));
      if (!cast.includes(c)) cast.push(c);
    }
    const fill = (text: string) => text
      .replace(/\{A\}/g, cast[0].name).replace(/\{B\}/g, (cast[1] ?? cast[0]).name)
      .replace(/\{C\}/g, (cast[3] ?? cast[2] ?? cast[1] ?? cast[0]).name).replace(/\{X\}/g, (cast[1] ?? cast[0]).name);
    const say = (text: string, b: AiPlayer, t: number, suf: string, zh = BOT_ZH[text]) => push(`bot-${i}${suf}`, b, fill(text), zh && fill(zh), t);
    let kind = kindAt(i);
    if ((kind === 'convo' || kind === 'pair' || kind === 'story') && usedRecently(kind, i)) kind = 'line';
    if (kind === 'convo' && (cast.length < 3 || (cast.length < 4 && cyc(CONVOS, i, 825).some(([, x]) => x.includes('{C}'))))) kind = 'line';
    if (kind === 'convo') {
      // {C} 是被聊到的人，不在对话里：三个人说话，第四个人被八卦
      const convo = cyc(CONVOS, i, 825);
      let t = at;
      convo.forEach(([who, text], k) => {
        if (k) t += typing(text, rnd(787, i, k));
        say(text, cast[Math.min(who, 2)], t, `c${k}`);
      });
    } else if (kind === 'pair' && cast.length > 1) {
      const [q, answers] = cyc(PAIRS, i, 826);
      const ans = pick(answers, rnd(783, i));
      say(q, a, at, '');
      say(ans, cast[1], at + typing(ans, rnd(784, i)) + 5_000, 'r');
    } else if (kind === 'story') {
      // 一个人连着说好几句，讲件事
      const story = cyc(STORIES, i, 827);
      let t = at;
      story.forEach((text, k) => {
        if (k) t += typing(text, rnd(794, i, k) * 0.3);
        say(text, a, t, `s${k}`);
      });
      if (cast.length > 1 && rnd(795, i) < 0.6) say(chimeFor(story.join(' '), rnd(796, i)), cast[1], t + typing('lol', rnd(797, i)), 'sj');
    } else if (kind === 'act') {
      const act = actLine(a, at, rnd(798, i));
      if (!act) continue;
      say(act.en, a, at, '', act.zh);
      if (cast.length > 1 && rnd(799, i) < 0.35) say(chimeFor(act.en, rnd(812, i)), cast[1], at + typing('nice', rnd(813, i)), 'aj');
    } else {
      // 和前两段抽到的不一样，免得两个人前后脚说同一句
      let line = lineAt(i, 0);
      for (let k = 1; k < 5 && lineUsedRecently(line.en, i); k++) line = lineAt(i, k);
      if (line.en.includes('{X}') && cast.length < 2) continue;
      // 单独抛个问题没人接很怪，问题留给一问一答和群聊
      if (/\?$/.test(line.en)) continue;
      let t = at;
      // 偶尔打错字，紧接着补一句改正
      const typo = typoOf(fill(line.en), rnd(814, i), rnd(815, i));
      if (typo && rnd(816, i) < typoRate(a)) {
        say(typo.text, a, t, '', line.zh);
        t += 2_500 + Math.floor(rnd(817, i) * 3_000);
        say(`*${typo.fix}`, a, t, 'f', `*${typo.fix}`);
      } else say(line.en, a, t, '', line.zh);
      // 别的 AI 有时会接一两句
      for (let k = 0; k < 2 && cast.length > k + 1 && rnd(790, i, k) < (k ? 0.35 : 0.6); k++) {
        const re = chimeFor(fill(line.en), rnd(792, i, k));
        t += typing(re, rnd(791, i, k));
        say(re, cast[k + 1], t, `j${k}`);
      }
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/** 打错字：挑一个长一点的词，换掉中间两个字母 */
function typoOf(text: string, r1: number, r2: number) {
  const words = text.split(' ').map((w, i) => [w, i] as const).filter(([w]) => /^[a-z]{5,}$/i.test(w));
  if (!words.length) return null;
  const [w, idx] = pick(words, r1);
  const k = 1 + Math.floor(r2 * (w.length - 3));
  const bad = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
  if (bad === w) return null;
  const parts = text.split(' ');
  parts[idx] = bad;
  return { text: parts.join(' '), fix: w };
}
const typoRate = (b: AiPlayer) => 0.03 + 0.25 * rnd(b.seed, 101) ** 2;

// ---- 接真人的话（用户 10-31）：说英文才有人用英文回，说别的语言只会得到「?」 ----
const strHash = (t: string) => { let h = 7; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193); return h; };
/** 英文：有字母，且没有中日韩等非拉丁文字 */
export const isEnglish = (t: string) => /[a-z]/i.test(t) && !/[^\x00-\x7f‘-”…]/.test(t.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''));
const HUH = ['?', '??', 'huh?', 'what?', 'wut', 'english pls?', 'sorry i only speak english', 'idk what that means lol', '???', 'eng?'];
/** 关键词 → 几种回法；按顺序找第一个对上的 */
const TOPICS: [RegExp, string[]][] = [
  [/\b(bot|ai|robot|npc)s?\b/i, ['lol no', 'beep boop jk', 'r u calling me a bot lol', 'im as real as it gets', 'lmao what']],
  [/\b(thx|thanks|thank you|ty|tysm)\b/i, ['np', 'np!', 'anytime', 'yw', 'no prob']],
  [/\b(hi|hello|hey|yo|sup|hiya|howdy)\b/i, ['hey!', 'yo', 'hi :)', 'hey hey', 'sup', 'hello!']],
  [/\b(gm|good morning)\b/i, ['gm!', 'gm gm', 'morning :)']],
  [/\b(gn|good night|night)\b/i, ['gn!', 'night', 'sleep well']],
  [/\b(where|wat|what).{0,12}\b(from|live)\b|\bwhere (are|r) (u|you)\b/i, ['uk', 'us, east coast', 'germany', 'canada', 'australia lol', 'philippines']],
  [/\b(how old|age)\b/i, ['24', 'old enough lol', '30 ugh', 'why lol']],
  [/\b(how are|how r|hows it going|how u doing|wyd)\b/i, ['good u?', 'tired lol', 'grinding as always', 'not bad', 'chillin']],
  [/\b(mount|horse|ride)\b/i, ['ranch foals, takes like an hour', 'kill wild horses for a foal', 'my horse is so slow lol']],
  [/\b(money|coins?|gold|rich)\b/i, ['sell ingots', 'salvage old gear', 'cooking is decent money', 'i am broke lol']],
  [/\b(dungeon|boss)\b/i, ['bring lots of food', 'combat 20+ for the first one', 'i can join later', 'chest rng is pain']],
  [/\b(guild)\b/i, ['dm me ill invite u', 'im not in one rn', 'which guild u in?']],
  [/\b(lvl|level|xp|exp)\b/i, ['just afk it overnight', 'grind grind grind', 'gz!', 'whats ur total lvl?']],
  [/\b(fish|fishing)\b/i, ['fishing is so chill', 'try the pond north of town', 'need a better rod for that']],
  [/\b(mine|mining|ore|pickaxe)\b/i, ['mining is the best', 'upgrade ur pickaxe asap', 'copper is east of town']],
  [/\b(party|group|team)\b/i, ['sure add me', 'maybe later', 'busy rn sorry']],
  [/\b(lol|lmao|haha|xd|rofl)\b/i, ['lol', 'lmao', 'haha', 'xD']],
  [/\b(gg|gz|grats|congrats)\b/i, ['ty!', 'thx :)', 'gg']],
  [/\b(trade|sell|buy)\b/i, ['what u selling', 'how much?', 'not rn sorry', 'got any ingots?']],
  [/\b(discord|update|patch|news|announcement|changelog)\b/i, ['ooh whats in it?', 'nice, when is it coming?', 'havent seen it, link?', 'any new skills?', 'pls be a new map', 'oh nice ty for the heads up', 'wait is there a discord?', 'hope they buff fishing lol']],
  [/\b(did|have|ha) (u|you) (see|seen|hear|heard)\b|\bu see\b/i, ['nope what happened?', 'no what is it', 'not yet, tell me', 'yea saw it', 'missed it, whats up?', 'no?? whats going on']],
  [/\b(anyone|any1|anybody|someone)\b/i, ['me maybe', 'what u need?', 'depends lol', 'i can help', 'whats up?']],
  [/\bhow (do|to|can|did)\b/i, ['i think u just keep doing it lol', 'check the handbook, it explains it', 'idk i just clicked stuff', 'took me ages to figure out too', 'hmm good question']],
  [/^why\b|\bbut why\b/i, ['no idea lol', 'good question', 'just how the game is i guess', 'dont ask me lol']],
  [/\?/, ['idk tbh', 'not sure', 'check the handbook maybe', 'good question lol', 'no clue sorry', 'hmm idk']],
];
/** 问哪里人的那一条在 TOPICS 里的位置 */
const WHERE_TOPIC = TOPICS.findIndex(([re]) => re.test('where are you from'));
const GENERIC = ['true', 'fr', 'ya', 'lol', 'nice', 'same', 'facts', 'ok', 'real', 'mood', 'oh nice', 'cool cool', 'ooh', 'wait really?', 'interesting', 'haha nice', 'oh word?', 'thats cool'];
/** 像在问问题：问号，或者用疑问词开头 */
const ASKS = /\?|^(do|does|did|are|is|was|can|could|would|will|what|wat|how|why|who|when|where|which|anyone|any1|r u|are u|u)\b/i;
/** 真人刚和某个 AI 聊过几句：接着说话时多半还是这个 AI 回（各家看到的聊天一样，算出来也一样） */
export interface ReplyCtx { bot: string; at: number }
/** 真人在世界频道说了一句：哪个 AI 接、说什么、几秒后（各家算出来一样）；点到名的 AI 一定回 */
export function botReplies(m: ChatMsg, all: AiPlayer[], prev?: ReplyCtx): ChatMsg[] {
  if (m.channel !== 'world' || isBotId(m.playerId)) return [];
  // 只有在线的 AI 会回
  const bots = all.filter((b) => botOnline(b, m.at));
  if (!bots.length) return [];
  const h = strHash(m.id + m.text);
  const low = m.text.toLowerCase();
  // 名字长的先比，免得 Kai 抢了 Kairo 的话
  const called = [...bots].sort((a, b) => b.name.length - a.name.length).find((b) => b.name.length >= 3 && low.includes(b.name.toLowerCase()));
  const named = called ?? (prev && m.at - prev.at < 4 * MIN ? bots.find((b) => b.id === prev.bot) : undefined);
  const en = isEnglish(m.text);
  const topic = en ? TOPICS.find(([re]) => re.test(m.text.trim())) : undefined;
  // 用户 10-31：真人说话别被晾着——问问题、聊到点子上基本都有人接
  const chance = called ? 1 : named ? 0.95 : !en ? 0.5 : topic ? 0.9 : ASKS.test(m.text.trim()) ? 0.85 : 0.6;
  if (rnd(h, 1) >= chance) return [];
  const who = named ?? pickTalker(bots, rnd(h, 2));
  let text = !en ? pick(HUH, rnd(h, 3)) : pick(topic ? topic[1] : GENERIC, rnd(h, 4));
  let zh0 = BOT_ZH[text];
  // 问哪里人：按这个 AI 的时区答，前后一致
  if (topic === TOPICS[WHERE_TOPIC]) { const z = zoneOf(who); text = z.en; zh0 = z.zh; }
  const at = m.at + typing(text, rnd(h, 5) * (en ? 1 : 0.4));
  // 有些回话会带上对方名字
  const named2 = en && rnd(h, 6) < 0.4;
  const out = named2 ? `${m.name} ${text}` : text;
  const zh = zh0 && (named2 ? `${m.name} ${zh0}` : zh0);
  const res: ChatMsg[] = [{ id: `bot-re-${m.id}`, channel: 'world', playerId: botKey(who.id), name: who.name, text: styled(out, who, h), zh, at }];
  // 有时另一个 AI 也跟着接一句
  if (bots.length > 1 && rnd(h, 7) < (en ? 0.35 : 0.25)) {
    const other = bots.filter((b) => b !== who);
    const b2 = pickTalker(other, rnd(h, 8));
    const t2 = !en ? pick(['lol', '??', 'what language is that', 'no idea either lol', 'google translate time'], rnd(h, 9)) : chimeFor(m.text, rnd(h, 9));
    res.push({ id: `bot-re2-${m.id}`, channel: 'world', playerId: botKey(b2.id), name: b2.name, text: styled(t2, b2, h + 1), zh: BOT_ZH[t2], at: at + typing(t2, rnd(h, 10)) });
  }
  return res;
}

// ---- 混进联机接口 ----
let list: AiPlayer[] = [];
let loadedAt = 0;
let loading: Promise<void> | null = null;
let api: OnlineApi | null = null;
const REFRESH_MS = 120_000;
/** 世界频道每天北京时间 0 点清空（用户 10-31）：这一刻之后的才显示 */
export const worldResetAt = (t = Date.now()) => Math.floor((t + 8 * HOUR) / DAY) * DAY - 8 * HOUR;
const BACKFILL_N = 200;
/** 现在的 AI 玩家（按加入时间排，各家顺序一样） */
export const aiPlayers = () => list;
export function refreshBots(force = false): Promise<void> {
  if (!api || (!force && (loading || Date.now() - loadedAt < REFRESH_MS))) return loading ?? Promise.resolve();
  loadedAt = Date.now();
  const a = api;
  loading = a.aiList()
    .then((l) => { list = [...l].sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1)); })
    .catch(() => {})
    .finally(() => { loading = null; });
  return loading;
}
const ensure = () => { if (Date.now() - loadedAt >= REFRESH_MS) void refreshBots(); };
const findBot = (playerId: string) => list.find((b) => botKey(b.id) === playerId);

export function withBots(base: OnlineApi): OnlineApi {
  api = base;
  const over: Partial<OnlineApi> = {
    onPresence(f) {
      ensure();
      let real: Presence[] = [];
      const emit = () => {
        const now = Date.now();
        f([...real, ...list.map((b) => botPresence(b, now)).filter((p): p is Presence => !!p)]);
      };
      const off = base.onPresence((all) => { real = all; emit(); });
      // AI 自己会走动，每秒更新一次
      const t = setInterval(() => { ensure(); if (list.length) emit(); }, 1000);
      return () => { off(); clearInterval(t); };
    },
    presenceOf(playerId) {
      const b = isBotId(playerId) ? findBot(playerId) : undefined;
      return b ? botPresence(b) ?? undefined : base.presenceOf(playerId);
    },
    onlineCount() {
      ensure();
      const n = base.onlineCount();
      const now = Date.now();
      return n == null ? null : n + list.filter((b) => botOnline(b, now)).length;
    },
    async leaderboard(board, limit = 100) {
      ensure();
      return mergeBoard(await base.leaderboard(board, limit), list, board, limit);
    },
    async myRank(board) {
      const r = await base.myRank(board);
      if (!r) return r;
      const above = list.filter((b) => {
        const [v, xp] = boardValue(botProfile(b), board);
        return v > r.value || (v === r.value && (xp ?? 0) > (r.xp ?? 0));
      }).length;
      return { ...r, rank: r.rank + above };
    },
    onChat(f) {
      ensure();
      // 真人在世界频道说的话：等名单在了再看要不要接话（回复时间到了才发）
      const seen = new Set<string>();
      const heard: ChatMsg[] = [];
      const lastTo = new Map<string, ReplyCtx>();
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const off = base.onChat((m) => {
        f(m);
        if (m.channel === 'world' && !isBotId(m.playerId) && !seen.has(m.id)) { seen.add(m.id); heard.push(m); }
      });
      // AI 的话不存，打开时按规则把今天（清空以后）的算出来，用户 10-31：记录别一打开就没了
      let last = 0;
      const tick = () => {
        const now = Date.now();
        // 名单还没拉下来时先不往前走，拉到了再补
        if (!list.length) return;
        let ms: ChatMsg[];
        if (!last) {
          // 从现在往前一段段算，够了就停，免得手机上一打开就卡
          ms = [];
          const cut = worldResetAt(now);
          for (let to = now; to > cut && ms.length < BACKFILL_N; to -= 2 * HOUR) ms = [...botChat(list, Math.max(cut, to - 2 * HOUR + 1), to), ...ms];
          ms = ms.slice(-BACKFILL_N);
        } else ms = botChat(list, last + 1, now);
        for (const m of ms) f(m);
        last = now;
        for (const m of heard.splice(0)) {
          const rs = botReplies(m, list, lastTo.get(m.playerId));
          const first = rs[0] && findBot(rs[0].playerId);
          if (first) lastTo.set(m.playerId, { bot: first.id, at: m.at });
          for (const r of rs) {
            const wait = r.at - Date.now();
            if (wait <= 0) { f(r); continue; }
            const h = setTimeout(() => { timers.delete(h); f(r); }, wait);
            timers.add(h);
          }
        }
      };
      // 等名单拉下来再补前面的
      void refreshBots().then(tick);
      const t = setInterval(tick, 2000);
      return () => { off(); clearInterval(t); timers.forEach(clearTimeout); };
    },
    async joinedAt(playerId) {
      const b = isBotId(playerId) ? findBot(playerId) : undefined;
      return b ? botProfile(b).joined : base.joinedAt(playerId);
    },
    async addFriend(pid) {
      // AI 不会同意，申请就当发出去了
      if (list.some((b) => botProfile(b).pid === pid)) return 'sent';
      return base.addFriend(pid);
    },
  };
  return new Proxy(base, {
    get(target, k) {
      if (k in over) return over[k as keyof OnlineApi];
      const v = Reflect.get(target, k, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
