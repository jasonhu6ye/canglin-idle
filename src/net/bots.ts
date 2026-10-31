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
// {X} 换成另一个 AI 的名字
const LINES = [
  // 游戏
  'anyone else grinding mining rn?', 'finally got my pickaxe upgraded', 'this fishing spot is so relaxing', 'gm everyone', 'gm gm',
  'morning all', 'just hit a new lvl in woodcutting', 'how long does the dungeon usually take?', 'lol i died to a wolf again',
  'the sunset in this game is so pretty', 'anyone wanna party up for some fights?', 'need more ingots, smithing eats everything',
  'tip: eat food before long fights', 'my bank is getting full lol', 'cooking is underrated tbh', 'the pumpkin mount looks sick ngl',
  'is the world boss up today?', 'love the pixel art in this game', 'afk mining overnight again', 'just found a rare drop!!',
  'whats the best place to train ranged?', 'magic feels op at higher lvls', 'anyone know a good spot for herbs?', 'waystones save sooo much walking',
  'got a horse from the ranch, so much faster now', 'guild recruiting! dm me', 'gg', 'nice', 'ty', 'thx', 'np', 'lol', 'lmao', 'rip',
  'got stunned stealing again haha', 'smithing to 50 took forever', 'night time mobs are scary af', 'does anyone sell bait?', 'map is massive now',
  'I keep getting lost lol', 'fletching arrows all day', 'just crafted my first full set', 'anyone up?', 'chilling at the pond',
  'dungeon chest gave me nothing again smh', 'backpack upgrade is so worth it', 'potatoes for days', 'grats on the lvls everyone',
  'whats everyone working on?', 'one more lvl then bed. ok maybe two', 'rng hates me today', 'idk why but chopping trees is so calming',
  'brb', 'back', 'brb dinner', 'brb gotta walk the dog', 'afk 10 min', 'bk', 'ok im back what did i miss', 'ugh dc again',
  '{X} gz on the lvl!', 'thx for the help earlier {X}', '{X} u still in that dungeon?', 'wb {X}', 'did u see {X} on the leaderboard?? insane',
  '{X} is always online lol do u ever sleep', 'shoutout to {X} for the tips',
  // 家常、八卦
  'just got home from work, time to grind', 'my cat keeps walking on my keyboard lol', 'its 3am here and im still playing, send help',
  'my boss thinks im working rn lmao', 'cant sleep so here i am', 'coffee #3 today', 'its raining here irl, perfect game weather',
  'anyone else on their lunch break?', 'my mom just yelled at me to eat lol', 'kids finally asleep, gaming time', 'school tmr ugh',
  'exams next week and im here mining copper', 'ordered pizza, best decision today', 'my wifi is trash today', 'phone at 5% dont leave me',
  'happy halloween everyone!!', 'anyone dressing up for halloween?', 'got so much candy for the trick or treaters lol', 'carved a pumpkin irl today',
  'my neighbor has the scariest halloween decor', 'it snowed here already wtf', 'monday again huh', 'tgif', 'weekend vibes',
  'my dog just stole my sandwich', 'binge watching a show while afk fishing', 'just woke up, gm', 'idk what to have for dinner',
  'my roommate thinks this game is a screensaver lol', 'gonna touch grass brb', 'stuck in traffic, playing on phone (not driving lol)',
  'anyone here from australia?', 'hi from the philippines', 'hello from germany', 'greetings from brazil', 'hey from texas',
  'my gf is watching me play and judging my outfit lol', 'my little brother wants my account smh', 'birthday today ^^', 'so tired lol',
];
/** 问一句，过一会有别的 AI 接话 */
const PAIRS: [string, string[]][] = [
  ['where do u guys train combat?', ['wolves outside town are good early', 'forest east of town', 'dungeons once u got decent gear']],
  ['how do I get a mount?', ['raise a foal at the ranch', 'kill wild horses for a foal, then ranch it']],
  ['magic or ranged?', ['both fine, pick what u like', 'ranged is easier early imo', 'magic hits hard later tho']],
  ['how do u make money fast?', ['sell ingots', 'salvage gear u dont need', 'fishing + cooking is steady coins']],
  ['anyone wanna group for a dungeon?', ['sure add me', 'maybe later, busy mining', 'ill join in a bit']],
  ['what lvl for the first dungeon?', ['combat 20ish', 'bring food and ull be fine']],
  ['hi everyone, new here', ['welcome!', 'welcome, have fun :)', 'hey! check the handbook, its helpful', 'wb... oh wait new lol, welcome']],
  ['is cooking worth it?', ['yes food buffs are great', 'def, u need food for fights']],
  ['what time is it for u guys?', ['9pm here', 'like 4am lol', 'lunch time', 'noon here']],
  ['what are u guys eating', ['ramen again lol', 'nothing, too lazy', 'tacos', 'leftover pizza']],
  ['anyone watching the game tonight?', ['ya cant wait', 'nah busy grinding', 'which game lol']],
  ['is it just me or is it laggy', ['just u', 'fine for me', 'bit laggy here too']],
];
/** 几个人你一句我一句：A/B/C 是不同的 AI，{A}{B}{C} 换成他们的名字 */
const CONVOS: [number, string][][] = [
  [[0, 'are u from the us?'], [1, 'nah uk lol'], [0, 'oh nice, its so late there'], [1, 'ya i should sleep but one more lvl']],
  [[0, 'hey {B} are u still selling ingots?'], [1, 'ya how many u need'], [0, 'like 50'], [1, 'ok trade me in a bit'], [0, 'thx!!']],
  [[0, 'omg my cat just knocked my drink over'], [1, 'lmaooo'], [2, 'classic cat'], [0, 'all over my desk too smh']],
  [[0, 'anyone know whats up with {C}? havent seen them in days'], [1, 'idk maybe on vacation'], [2, 'i saw them yesterday mining lol'], [0, 'ah ok']],
  [[0, 'did u guys hear {C} left their guild?'], [1, 'wait what really'], [0, 'ya some drama lol'], [1, 'oof'], [2, 'tea pls']],
  [[0, 'whats ur favorite skill'], [1, 'fishing, so chill'], [2, 'smithing tbh'], [0, 'same i love smithing'], [1, 'nerds lol']],
  [[0, 'ugh work tmr'], [1, 'same :('], [0, 'what do u do'], [1, 'nurse, night shifts'], [0, 'respect']],
  [[0, 'how old r u guys'], [1, '24'], [2, 'old enough lol'], [0, 'fair']],
  [[0, 'gonna go eat, brb'], [1, 'enjoy'], [0, 'thx']],
  [[0, 'got a rare drop!!!'], [1, 'gz!'], [2, 'nice what was it'], [0, 'a ring, finally'], [1, 'lucky']],
  [[0, 'is anyone else getting rained on irl'], [1, 'ya storm here'], [2, 'sunny here lol'], [0, 'jealous']],
  [[0, 'whos up for the world boss'], [1, 'me'], [2, 'me too, give me 5'], [0, 'ok meet at the waystone']],
  [[0, 'my kid just asked if the horse in my game is real lol'], [1, 'haha cute'], [2, 'tell them yes'], [0, 'lol i did']],
  [[0, 'i think {B} is the richest player here'], [1, 'lol no way'], [2, 'nah its def {B}'], [1, 'ok maybe']],
  [[0, 'are u guys doing anything for halloween?'], [1, 'party at a friends'], [2, 'staying home giving out candy'], [0, 'nice, im just gaming lol']],
  [[0, 'good night everyone'], [1, 'gn!'], [2, 'night'], [0, 'cya tmr']],
  [[0, 'anyone know a good movie'], [1, 'what genre'], [0, 'idc anything scary'], [2, 'it follows is good'], [0, 'ty ill check it']],
];
/** 有一半的 AI 打字全小写、不打句号 */
function styled(text: string, b: AiPlayer) {
  if (rnd(b.seed, 90) < 0.5) return text.toLowerCase().replace(/\.$/, '');
  return text;
}
const SLOT = 75_000;
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
    if (r < 0.25 && cast.length >= 3) {
      // {C} 是被聊到的人，不在对话里：三个人说话，第四个人被八卦
      const ok = cast.length >= 4 ? CONVOS : CONVOS.filter((c) => !c.some(([, x]) => x.includes('{C}')));
      const convo = pick(ok, rnd(781, i));
      let t = at;
      convo.forEach(([who, text], k) => {
        if (k) t += 6_000 + Math.floor(rnd(787, i, k) * 22_000);
        say(text, cast[Math.min(who, 2)], t, `c${k}`);
      });
    } else if (r < 0.4 && cast.length > 1) {
      const [q, answers] = pick(PAIRS, rnd(782, i));
      say(q, a, at, '');
      say(pick(answers, rnd(783, i)), cast[1], at + 10_000 + Math.floor(rnd(784, i) * 25_000), 'r');
    } else {
      const line = pick(LINES, rnd(785, i));
      if (line.includes('{X}') && cast.length < 2) continue;
      say(line, a, at, '');
    }
  }
  return out.sort((x, y) => x.at - y.at);
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
      const off = base.onChat(f);
      let last = Date.now() - 20 * MIN;
      const tick = () => {
        const now = Date.now();
        // 名单还没拉下来时先不往前走，拉到了再补
        if (!list.length) { last = Math.max(last, now - 20 * MIN); return; }
        for (const m of botChat(list, last + 1, now)) f(m);
        last = now;
      };
      // 等名单拉下来再补最近 20 分钟的
      void refreshBots().then(tick);
      const t = setInterval(tick, 5000);
      return () => { off(); clearInterval(t); };
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
