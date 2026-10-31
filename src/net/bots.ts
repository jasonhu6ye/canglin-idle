import { ACTIONS, ITEMS, MONSTERS, NODES, SKILLS, standOf, WALK_TILES_PER_SEC, type MapNode } from '../core/data';
import { baseOf } from '../core/quality';
import { APT_MAX, APT_MIN, horseItem } from '../core/ranch';
import type { EquipSlot, SkillId } from '../core/types';
import { XP_TABLE } from '../core/xp';
import { fightWeapon, OUTFITS } from '../game/hero';
import { findPath, isWalkable } from '../game/world';
import type { AiPlayer, Board, ChatMsg, OnlineApi, Presence, RankRow } from './api';

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
/** 一个 AI 某一天的样子（等级每天涨一点） */
export function botProfile(b: AiPlayer, t = Date.now()): BotProfile {
  const day = Math.floor(t / DAY);
  const key = `${b.id}:${b.seed}:${b.name}:${day}`;
  const hit = profiles.get(key);
  if (hit) return hit;
  if (profiles.size > 2000) profiles.clear();
  const s = b.seed;
  // 加进来时已经玩了 3-360 小时，之后每天再玩 0.5-4.5 小时
  const h0 = 3 * Math.pow(120, rnd(s, 1) ** 1.4);
  const rate = 0.5 + 4 * rnd(s, 2);
  const hours = h0 + (rate * Math.max(0, day * DAY - b.at)) / DAY;
  const style = pick(ATTACK, rnd(s, 3)) as Style;
  const w = {} as Record<SkillId, number>;
  for (const k of SKILL_IDS) w[k] = rnd(s, 10, k.length, k.charCodeAt(0), k.charCodeAt(2)) ** 2;
  w.enhancing *= 0.2;
  w.husbandry *= 0.3;
  for (const a of ATTACK) w[a] = a === style ? 1.2 + rnd(s, 4) : w[a] * 0.15;
  w.defence = 0.5 + rnd(s, 5) * 0.7;
  w.hitpoints = 0;
  const sum = Object.values(w).reduce((a, x) => a + x, 0);
  // 一边干活一边离线结算，各技能加起来的时间比实际在线还多一些
  const levels = {} as Record<SkillId, number>;
  for (const k of SKILL_IDS) levels[k] = levelOfHours((hours * 1.6 * w[k]) / sum);
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

/** 一个 AI 现在的在线状态（和真人的 Presence 一样画在地图上） */
export function botPresence(b: AiPlayer, t = Date.now()): Presence | null {
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
];
/** 有一半的 AI 打字全小写、不打句号 */
function styled(text: string, b: AiPlayer) {
  if (rnd(b.seed, 90) < 0.5) return text.toLowerCase().replace(/\.$/, '');
  return text;
}
const SLOT = 75_000;
const lineAt = (i: number, k: number) => pick(rnd(788, i, k) < 0.2 ? GAME_LINES : LIFE_LINES, rnd(785, i, k));
/** 某个时间段里 AI 说的话（按时间排好） */
export function botChat(bots: AiPlayer[], from: number, to: number): ChatMsg[] {
  if (!bots.length) return [];
  const out: ChatMsg[] = [];
  const p = Math.min(0.8, 0.05 + bots.length * 0.04);
  // 往前多看几段：前面开始的对话可能还在接着说
  for (let i = Math.floor(from / SLOT) - 4; i <= Math.floor(to / SLOT); i++) {
    if (rnd(777, i) >= p) continue;
    const a = bots[Math.floor(rnd(778, i) * bots.length)];
    const at = i * SLOT + Math.floor(rnd(779, i) * 50_000);
    // 对话里出现的其他人：不重复的几个 AI
    const cast = [a];
    for (let j = 0; j < 6 && cast.length < 4 && cast.length < bots.length; j++) {
      const c = bots[Math.floor(rnd(786, i, j) * bots.length)];
      if (!cast.includes(c)) cast.push(c);
    }
    const fill = (text: string) => text
      .replace(/\{A\}/g, cast[0].name).replace(/\{B\}/g, (cast[1] ?? cast[0]).name)
      .replace(/\{C\}/g, (cast[3] ?? cast[2] ?? cast[1] ?? cast[0]).name).replace(/\{X\}/g, (cast[1] ?? cast[0]).name);
    const say = (text: string, b: AiPlayer, t: number, suf: string) => {
      if (t >= from && t <= to) out.push({ id: `bot-${i}${suf}`, channel: 'world', playerId: botKey(b.id), name: b.name, text: styled(fill(text), b), at: t });
    };
    const r = rnd(780, i);
    if (r < 0.3 && cast.length >= 3) {
      // {C} 是被聊到的人，不在对话里：三个人说话，第四个人被八卦
      const ok = cast.length >= 4 ? CONVOS : CONVOS.filter((c) => !c.some(([, x]) => x.includes('{C}')));
      const convo = pick(ok, rnd(781, i));
      let t = at;
      convo.forEach(([who, text], k) => {
        if (k) t += 6_000 + Math.floor(rnd(787, i, k) * 22_000);
        say(text, cast[Math.min(who, 2)], t, `c${k}`);
      });
    } else if (r < 0.38 && cast.length > 1) {
      const [q, answers] = pick(PAIRS, rnd(782, i));
      say(q, a, at, '');
      say(pick(answers, rnd(783, i)), cast[1], at + 10_000 + Math.floor(rnd(784, i) * 25_000), 'r');
    } else {
      // 和前两段抽到的不一样，免得两个人前后脚说同一句
      let line = lineAt(i, 0);
      for (let k = 1; k < 4 && (line === lineAt(i - 1, 0) || line === lineAt(i - 2, 0)); k++) line = lineAt(i, k);
      if (line.includes('{X}') && cast.length < 2) continue;
      say(line, a, at, '');
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

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
  [/\?/, ['idk tbh', 'not sure', 'check the handbook maybe', 'good question lol', 'no clue sorry', 'hmm idk']],
];
const GENERIC = ['true', 'fr', 'ya', 'lol', 'nice', 'same', 'facts', 'ok', 'real', 'mood'];
/** 真人在世界频道说了一句：哪个 AI 接、说什么、几秒后（各家算出来一样）；点到名的 AI 一定回 */
export function botReplies(m: ChatMsg, bots: AiPlayer[]): ChatMsg[] {
  if (!bots.length || m.channel !== 'world' || isBotId(m.playerId)) return [];
  const h = strHash(m.id + m.text);
  const low = m.text.toLowerCase();
  // 名字长的先比，免得 Kai 抢了 Kairo 的话
  const named = [...bots].sort((a, b) => b.name.length - a.name.length).find((b) => b.name.length >= 3 && low.includes(b.name.toLowerCase()));
  const en = isEnglish(m.text);
  const topic = en ? TOPICS.find(([re]) => re.test(m.text)) : undefined;
  const chance = named ? 1 : !en ? 0.45 : topic ? (topic[1] === TOPICS[TOPICS.length - 1][1] ? 0.55 : 0.7) : 0.25;
  if (rnd(h, 1) >= chance) return [];
  const who = named ?? bots[Math.floor(rnd(h, 2) * bots.length)];
  const text = !en ? pick(HUH, rnd(h, 3)) : pick(topic ? topic[1] : GENERIC, rnd(h, 4));
  const at = m.at + 3_000 + Math.floor(rnd(h, 5) * (en ? 12_000 : 6_000));
  // 有些回话会带上对方名字
  const out = en && rnd(h, 6) < 0.4 ? `${m.name} ${text}` : text;
  return [{ id: `bot-re-${m.id}`, channel: 'world', playerId: botKey(who.id), name: who.name, text: styled(out, who), at }];
}

// ---- 混进联机接口 ----
let list: AiPlayer[] = [];
let loadedAt = 0;
let loading: Promise<void> | null = null;
let api: OnlineApi | null = null;
const REFRESH_MS = 120_000;
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
      return n == null ? null : n + list.length;
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
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const off = base.onChat((m) => {
        f(m);
        if (m.channel === 'world' && !isBotId(m.playerId) && !seen.has(m.id)) { seen.add(m.id); heard.push(m); }
      });
      let last = Date.now() - 20 * MIN;
      const tick = () => {
        const now = Date.now();
        // 名单还没拉下来时先不往前走，拉到了再补
        if (!list.length) { last = Math.max(last, now - 20 * MIN); return; }
        for (const m of botChat(list, last + 1, now)) f(m);
        last = now;
        for (const m of heard.splice(0)) {
          for (const r of botReplies(m, list)) {
            const wait = r.at - Date.now();
            if (wait <= 0) { f(r); continue; }
            const h = setTimeout(() => { timers.delete(h); f(r); }, wait);
            timers.add(h);
          }
        }
      };
      // 等名单拉下来再补最近 20 分钟的
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
