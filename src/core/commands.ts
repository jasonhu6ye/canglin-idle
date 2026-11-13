import type { BeltSlot, DungeonGate, EquipSlot, GameState, Summary, TaskMode } from './types';
import { ACTIONS, fineMatOf, ITEMS, MONSTERS, NODES, jumpNode, keyOf, nodesOfAction, standOf } from './data';
import {
  bagRoomFor, bagSlots, beltSlotOf, buyGoods, buyHwSkin, buyKey, buyPumpkinMount, buySeed, cancelRealmChest, collectHorse, combineShards,
  depositLoot, dismissStop, markContrib, syncDungeon, eat, enqueue, enterDungeon, equip, finishRealmChest, fromBelt, leaveDungeon, leaveWork, openContainer,
  openDungeonChest, openGate, placeFoal, redeemCode, removeTask, resumeWork, salvage, sell, setLoc, setSettings, skinAllowed, sortBank, startAt,
  newGame, startNow, startRealmChest, startWalk, summonPumpkin, teleport, toBag, toBank, toBelt, toggleMount, unequip, unlockWaystone, useGate,
  useTownScroll, useWaystone, walkPos, moveSpeed, combatStats, playerAttackMs, fieldMob,
} from './sim';
import { dungeonFloor } from './dungeon';
import { flag, guard, maxSpeed } from './guard';
import { claimRepReward, collectHome, deliverOrder, enterHome, leaveHome, petPet, placeBuild, removeAt, startProcess, digTreasure, upgradeHome } from './home';
import { harvestAll, installSprinkler, plantAll, tendPlot, waterAll } from './farm';
import { claimMail, clearMail, readMail } from './mail';
import type { TeamMember } from './dungeon';
import { fieldKey, pushMateHit, setAggroMates, setDgCrew, setFieldCrew, stopKey } from './aggro';

/*
 * 位置核对（11-02，只在服务器结算时）：「我走到了哪」是地图画面报上来的，改过的客户端可以乱报（瞬移、
 * 隔空激活石碑、站到仓库旁）。服务器按存档里能确定的位置（站的点、正在走的路、寻路走了多久、最近报过的点）
 * 加上最快跑速，算出现在可能在的范围，报的位置不在范围里就不认。
 */
type Pt = { x: number; y: number; r: number; t: number };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** 画面上的格子和存档里的格子差这么多以内都算对得上 */
const SLACK = 8;
/** 报过的位置留多久（够「停下来、换方向走」连着几条指令用） */
const MV_KEEP = 20_000;
/** 记下的点最多留多久（一次自动寻路最长也就十几分钟） */
const MV_LONG = 20 * 60_000;
/** 位置差多少格以上才记可疑（差得少多半是本机和服务器步调不一致） */
const MOVE_FLAG_OVER = 400;
function anchors(s: GameState, t: number): Pt[] {
  const G = guard();
  const out: Pt[] = [{ ...walkPos(s), r: SLACK, t }, { ...s.loc, r: SLACK, t }];
  if (s.walk) out.push({ ...s.walk.from, r: SLACK, t: t - (s.walk.total - s.walk.ms) }, { ...s.walk.to, r: SLACK, t });
  if (s.travel) {
    const from = t - (s.travel.total - s.travel.ms);
    out.push({ ...s.loc, r: SLACK, t: from });
    const dest = NODES.find((n) => n.id === s.travel!.to);
    if (dest) out.push({ ...standOf(dest), r: SLACK, t });
    for (const id of [...(s.travel.via ?? []), ...(s.travel.hops ?? []).flat()]) {
      const n = jumpNode(id);
      if (n) out.push({ ...standOf(n), r: SLACK, t: from });
    }
  }
  // 以前记下的点：按「记下时那一刻」的时间放宽（11-02：以前只留 20 秒内的，自动寻路走了几十秒后手动点地面，
  // 出发点被丢掉，服务器只剩寻路起点、对不上，把人拉回起点还记成瞬移）
  if (G?.mv && t - G.mv.t <= MV_KEEP) for (const p of G.mv.pts) if (t - p.t <= MV_LONG) out.push(p);
  return out;
}
/** 服务器结算：p 是不是现在可能站的位置（extra：再放宽几格）。对不上记一条可疑操作（差得很远算严重） */
function canBe(s: GameState, t: number, p: { x: number; y: number }, extra = 0, what = 'move'): boolean {
  if (!guard()) return true;
  const sp = maxSpeed(s) / 1000;
  let over = Infinity;
  for (const a of anchors(s, t)) over = Math.min(over, Math.hypot(p.x - a.x, p.y - a.y) - (a.r + extra + sp * Math.max(0, t - a.t)));
  if (over <= 0) return true;
  // 不算严重：本机和服务器的寻路时间可能差一点，画面上的人会比服务器早到或晚到。
  // 报的位置不认、照服务器的位置算，作弊也拿不到好处，所以差得不多就不记（11-02：正常玩家也常被记，GM 页一堆误报）
  if (over > MOVE_FLAG_OVER) flag('move', false, { what, x: p.x, y: p.y, at: walkPos(s), over: Math.round(over) });
  return false;
}
/** 每条指令执行前记下当时可能的位置（停下工作、换路走之后还能对上之前的路） */
function remember(s: GameState, t: number) {
  const G = guard();
  if (!G) return;
  const seen = new Set<string>();
  const pts = anchors(s, t).filter((p) => {
    const k = `${p.x},${p.y},${p.t}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  G.mv = { pts: pts.slice(-32), t };
}

/**
 * 组队同打（11-02）：一起打的队友人数、嘲讽、队友新打出的伤害，本机从联机层收到后作为指令执行，
 * 服务器结算时也按同样的时刻用上（和本机一样只在实时结算时生效）。伤害每条最多算怪物血量的一半，防止乱报
 */
export interface Coop { crew: number; dg: number; mates: number[]; hits: [string, number][] }
/** 永冬冰原的限时精英、首领：附近的人不组队也能一起打 */
const SHARED = new Set(NODES.filter((n) => n.timed && (n.timed.kind === 'elite' || n.timed.kind === 'boss')).flatMap((n) => n.actions));
/** 正在打的这只怪（副本里的停靠点或野外动作）和它的标识 */
function target(s: GameState): { key: string; m: (typeof MONSTERS)[string] } | null {
  const r = s.dungeon;
  if (r) {
    const st = dungeonFloor(r.gate, r.floor).stops[r.idx];
    return st?.kind === 'mob' && st.monster && MONSTERS[st.monster] ? { key: stopKey(r.gate.id, r.floor, r.idx), m: MONSTERS[st.monster] } : null;
  }
  const a = s.paused ? undefined : ACTIONS[s.queue[0]?.action ?? ''];
  return a?.kind === 'combat' && MONSTERS[a.monster] ? { key: fieldKey(a.id), m: MONSTERS[a.monster] } : null;
}
function coop(s: GameState, t: number, c: unknown): GameState {
  const o = (c ?? {}) as Partial<Coop>;
  const G = guard();
  // 服务器：一起打的人数不能超过队伍里的其他人（冰原同打不用组队，最多 4 人）
  const tgt = target(s);
  const most = !G ? 4 : Math.min(4, Math.max(G.party.length - 1, !s.dungeon && tgt && SHARED.has(s.queue[0]?.action ?? '') ? 4 : 0));
  const crewN = Math.min(most, int(o.crew, 0, 4));
  setFieldCrew(crewN);
  // 队友刚加入（11-02）：正在打的这只马上算一起打（以前要等下一只刷出来，队友到了十几秒都没伤害）
  if (crewN > 0 && !s.dungeon && s.combat && !s.combat.crew && s.combat.respawnMs <= 0 && tgt) {
    const max0 = s.combat.monsterMax ?? tgt.m.hp;
    const max = fieldMob(tgt.m, crewN).hp;
    s = { ...s, combat: { ...s.combat, crew: crewN, monsterMax: max, monsterHp: s.combat.monsterHp + (max - max0), pTotal: 0 } };
  }
  // 队友走了（11-02）：正在打的这只血量跟着降回来，不用一个人磨一只加了血的怪
  else if (!s.dungeon && s.combat?.crew && crewN < s.combat.crew && s.combat.respawnMs <= 0 && tgt) {
    const max0 = s.combat.monsterMax ?? fieldMob(tgt.m, s.combat.crew).hp;
    const max = fieldMob(tgt.m, crewN).hp;
    const hp = Math.max(1, Math.round(s.combat.monsterHp * (max / max0)));
    s = { ...s, combat: { ...s.combat, crew: crewN || undefined, monsterMax: crewN ? max : undefined, monsterHp: hp, pTotal: crewN ? s.combat.pTotal : undefined } };
  }
  setDgCrew(Math.min(most, int(o.dg, 0, 4)));
  const mates = (Array.isArray(o.mates) ? o.mates : []).slice(0, most).map((x) => int(x, 1, 5000));
  setAggroMates(mates);
  if (G) G.coop = { crew: Math.min(most, int(o.crew, 0, 4)), dg: Math.min(most, int(o.dg, 0, 4)), mates, t };
  const hits = (Array.isArray(o.hits) ? o.hits : []).slice(0, 20).filter((h): h is [string, number] => Array.isArray(h));
  if (G) {
    // 服务器：只收正在打的这只怪的伤害，按队友人数和时间限量（每人最多按自己输出的 8 倍、每秒至少怪物血量的 5%）
    const since = Math.min(10_000, Math.max(0, t - (G.coopAt ?? t - 1000)));
    G.coopAt = t;
    const asked = hits.reduce((n, h) => n + num(h[1], 0, 1e9), 0);
    if (!tgt || most <= 0) {
      if (asked > 0 && most <= 0 && tgt) flag('fake_hits', false, { solo: true, dmg: Math.round(asked) });
      return { ...s };
    }
    const st = combatStats(s, tgt.m);
    const dps = (st.playerMaxHit * Math.max(1, st.critMult)) / Math.max(200, playerAttackMs(s));
    const rate = most * Math.max(dps * 8, tgt.m.hp * 0.05 / 1000);
    // 额度攒着用（11-02）：以前每次只给这半秒的额度，队友一箭暴击就被截掉一截，两边怪物血量越差越多
    let left = Math.min(rate * 10_000, (G.coopBank ?? rate * 2000) + rate * since);
    for (const h of hits) {
      if (str(h[0], 80) !== tgt.key || left <= 0) continue;
      const d = Math.min(left, num(h[1], 0, 1e9));
      left -= d;
      pushMateHit(tgt.key, d);
    }
    G.coopBank = Math.max(0, left);
    if (left <= 0 && asked > 3 * rate * 10_000) flag('fake_hits', false, { dmg: Math.round(asked) });
    return { ...s };
  }
  const cap = Math.max(1, (s.combat?.monsterMax ?? s.combat?.monsterHp ?? 1000) * 0.5);
  for (const h of hits) pushMateHit(str(h[0], 80), Math.min(cap, num(h[1], 0, 1e9)));
  // 存档本身没变，返回新对象好让它被记成指令
  return { ...s };
}

/*
 * 玩家操作 = 指令（11-02 改服务器运算）：每个会改存档的操作都有名字和参数（只能是 JSON），
 * 本机照常马上执行（显示不卡），同时记下来连同时间发给服务器；服务器从它保存的存档出发、按服务器时钟
 * 重新结算并执行同样的指令，结果才是真的存档。参数来自玩家，服务器那边会被乱传，所以每个指令先把参数洗一遍。
 */

/** 指令：名字、参数、执行时刻（本机游戏时间；服务器会夹到「上次结算 ~ 现在」之间） */
export interface Cmd { n: CmdName; a: unknown[]; t: number; /** 这台设备上的指令序号（服务器记下收到第几条，重发不会执行两次） */ q: number }
/** 指令执行结果：新存档，加上给界面看的东西（开箱拿到什么等） */
export interface CmdResult { state: GameState; out?: unknown; summary?: Summary }

/** constructor、toString 这类名字在普通对象上都「有」（原型上的），当物品/动作 id 用会骗过 ITEMS[id] 这种判断，一律当空（11-13 检查：排进队列后存档每次结算都出错） */
const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype));
const str = (x: unknown, max = 64) => (typeof x === 'string' && !PROTO.has(x) ? x.slice(0, max) : '');
const int = (x: unknown, lo = 0, hi = 1e9) => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const num = (x: unknown, lo = -1e9, hi = 1e9) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
const bool = (x: unknown) => x === true;
const xy = (x: unknown) => {
  const o = (x ?? {}) as { x?: unknown; y?: unknown };
  return { x: int(o.x, -10000, 100000), y: int(o.y, -10000, 100000) };
};
const from = (x: unknown): 'bag' | 'bank' => (x === 'bank' ? 'bank' : 'bag');
const mode = (x: unknown): TaskMode => {
  const m = (x ?? {}) as { type?: unknown; count?: unknown; ms?: unknown };
  if (m.type === 'count') return { type: 'count', count: int(m.count, 1, 1e6) };
  if (m.type === 'time') return { type: 'time', ms: int(m.ms, 1000, 7 * 24 * 3600_000) };
  return { type: 'infinite' };
};
const items = (x: unknown) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((x ?? {}) as Record<string, unknown>).slice(0, 500)) {
    const n = int(v, 0, 1e9);
    if (own(ITEMS, k) && n > 0) out[k] = n;
  }
  return out;
};
/** 设置：只能改这些（外观另外检查有没有解锁，在 settings 指令里） */
const SETTING_KEYS = ['eatThreshold', 'carryFood', 'carryPotion', 'farmSeed', 'farmFert', 'autoFarm', 'skin', 'fineCraft'] as const;
const settings = (x: unknown) => {
  const p = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) if (k in p) out[k] = p[k];
  // 11-02 复查：数值和开关洗一遍，免得乱传 NaN、超大数、对象把存档弄坏
  if ('eatThreshold' in out) out.eatThreshold = num(out.eatThreshold, 0, 1);
  if ('carryFood' in out) out.carryFood = int(out.carryFood, -1, 100000);
  if ('carryPotion' in out) out.carryPotion = out.carryPotion !== false;
  if ('skin' in out) { if (typeof out.skin === 'string') out.skin = str(out.skin, 40); else delete out.skin; }
  for (const k of ['farmSeed', 'farmFert'] as const) if (k in out) {
    const o = (out[k] && typeof out[k] === 'object' ? out[k] : {}) as Record<string, unknown>;
    out[k] = Object.fromEntries(Object.entries(o).slice(0, 50).filter(([, v]) => typeof v === 'string').map(([a, v]) => [str(a, 40), str(v, 40)]));
  }
  if ('autoFarm' in out) {
    const o = (out.autoFarm && typeof out.autoFarm === 'object' ? out.autoFarm : {}) as Record<string, unknown>;
    out.autoFarm = Object.fromEntries(Object.entries(o).slice(0, 50).map(([a, v]) => [str(a, 40), v === true]));
  }
  // 精炼石开关：只留真的会做出装备的配方，最多 300 个
  if ('fineCraft' in out) {
    const fc: Record<string, true> = {};
    const src = (out.fineCraft ?? {}) as Record<string, unknown>;
    if (typeof src === 'object') for (const [a, v] of Object.entries(src).slice(0, 300)) {
      const act = own(ACTIONS, a) ? ACTIONS[a] : undefined;
      if (v === true && act?.kind === 'skill' && act.outputs.some((o) => fineMatOf(o.item))) fc[a] = true;
    }
    out.fineCraft = fc;
  }
  return out as Partial<GameState['settings']>;
};

/** 背包里点物品：能穿就穿，食物药水放进补给栏，碎片合成（开箱、钥匙由界面另外发指令） */
export function quickUse(g: GameState, id: string) {
  const it = ITEMS[id];
  if (it?.equip) return equip(g, id);
  if (beltSlotOf(id)) return toBelt(g, id);
  if (/^enhshard_/.test(id)) return combineShards(g, id, 'bag');
  return g;
}
export const quickUseOpens = (g: GameState, id: string) => ({ box: !!ITEMS[id]?.opens, key: !!keyOf(id) && !g.dungeon && !g.home?.inside });

/** 动作存在、地图上有地方做（乱传的动作名会让结算出错） */
const canDo = (a: string) => own(ACTIONS, a) && nodesOfAction(a).length > 0;

/** 只认洞口本身的这几样（其余字段客户端传什么都不要） */
function cleanGate(x: unknown): DungeonGate | null {
  const o = (x ?? {}) as Record<string, unknown>;
  if ((o.kind !== 'green' && o.kind !== 'blue') || typeof o.id !== 'string') return null;
  return {
    id: str(o.id, 40), kind: o.kind, tier: int(o.tier, 1, 99), x: int(o.x, -10000, 100000), y: int(o.y, -10000, 100000),
    at: num(o.at, 0, 1e15), expires: num(o.expires, 0, 1e15), seed: int(o.seed, 0, 2 ** 31), floors: int(o.floors, 1, 20),
  };
}
/**
 * 进洞口：服务器只认真的洞口（自己开的、或者队友存档里开着的），洞口的层数、阶级、过期时间都用查到的那份；
 * 队伍人数、队员名单按服务器查到的队伍来
 */
function enterGate(s: GameState, t: number, gate: unknown, party: unknown, team: unknown): GameState {
  const G = guard();
  const want = cleanGate(gate);
  if (!want) return s;
  // 自己开的洞口：编号里带开的时刻和随机数，手机和服务器差一两秒（或随机数不同步）编号就对不上，
  // 所以同种、同阶、同一个位置的也认（11-02 误报：正常开洞口进去被记成「伪造洞口」还会自动处罚）
  const same = (x: DungeonGate) => x.kind === want.kind && x.tier === want.tier && Math.abs(x.x - want.x) <= 2 && Math.abs(x.y - want.y) <= 2;
  const real = !G ? want : (s.gates ?? []).find((x) => x.id === want.id) ?? G.gates.find((x) => x.id === want.id) ?? (s.gates ?? []).find(same);
  if (!real) {
    // 没组队也报一个不存在的洞口：只能是改出来的（组队时可能是队友刚开、还没同步）
    // 刚开过洞口（服务器那边没开成，比如位置没对上）就不算严重
    const opened = (s.lastGateAt ?? 0) > t - 30 * 60_000;
    flag('fake_gate', G!.party.length <= 1 && !opened, { gate: want.id, kind: want.kind, tier: want.tier, floors: want.floors });
    return s;
  }
  let n = int(party, 1, 10);
  const tm = (team ?? null) as { members?: unknown; me?: unknown } | null;
  let members = Array.isArray(tm?.members)
    ? (tm!.members as unknown[]).slice(0, 10).map((m) => ({ id: str((m as TeamMember)?.id, 64), name: str((m as TeamMember)?.name, 40) })).filter((m) => m.id)
    : [];
  let me = str(tm?.me, 64);
  if (G) {
    n = Math.min(n, Math.max(1, G.party.length));
    members = members.filter((m) => G.party.includes(m.id));
    me = G.me;
  }
  const ok = members.length > 1 && members.some((m) => m.id === me);
  return enterDungeon(s, { ...real }, n, t, ok ? { members, me } : undefined);
}
/** 服务器：队友真的打到了这里（按队友存档里的进度） */
function mateAt(m: { gate: string; floor: number; idx: number; phase: string }): boolean {
  const G = guard();
  if (!G) return true;
  const done = (p: string) => p === 'chest' || p === 'open';
  return G.runs.some((r) => r.gate === m.gate && (done(r.phase) || (!done(m.phase) && (r.floor > m.floor || (r.floor === m.floor && r.idx >= m.idx)))));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (s: GameState, t: number, ...a: any[]) => GameState | [GameState, unknown] | { state: GameState; [k: string]: unknown };

export const COMMANDS = {
  // 背包、仓库、装备
  equip: (s, _t, id) => equip(s, str(id)),
  unequip: (s, _t, slot) => unequip(s, str(slot) as EquipSlot),
  eat: (s, _t, id) => eat(s, str(id)),
  toBelt: (s, _t, id) => toBelt(s, str(id)),
  fromBelt: (s, _t, k) => fromBelt(s, (k === 'potion' ? 'potion' : 'food') as BeltSlot),
  toBag: (s, _t, id, n) => toBag(s, str(id), int(n)),
  toBank: (s, _t, id, n) => toBank(s, str(id), int(n)),
  sell: (s, _t, id, n) => sell(s, str(id), int(n)),
  sortBank: (s) => sortBank(s),
  depositLoot: (s) => depositLoot(s),
  combineShards: (s, _t, id, f) => combineShards(s, str(id), from(f)),
  openContainer: (s, _t, id, f, n) => openContainer(s, str(id), from(f), int(n, 1, 1000)),
  salvage: (s, _t, list) => salvage(s, items(list)),
  quickUse: (s, _t, id) => quickUse(s, str(id)),
  redeem: (s, _t, code) => redeemCode(s, str(code, 32)),
  settings: (s, _t, patch) => {
    const p = settings(patch);
    if (typeof p.skin === 'string' && !skinAllowed(s, p.skin)) delete p.skin;
    return setSettings(s, p);
  },
  /** 删除进度从头开始 */
  reset: (s, t) => newGame(t, s.rng),
  // 干活和任务
  startNow: (s, _t, a, m) => (canDo(str(a)) ? startNow(s, str(a), mode(m)) : s),
  enqueue: (s, _t, a, m) => enqueue(s, str(a), mode(m)),
  startAt: (s, _t, a, node, m?: unknown) => startAt(s, str(a), str(node), m === undefined ? undefined : mode(m)),
  removeTask: (s, _t, i) => removeTask(s, int(i, 0, 100)),
  dismissStop: (s) => dismissStop(s),
  resumeWork: (s) => resumeWork(s),
  leaveWork: (s) => leaveWork(s),
  // 走路、坐骑、传送
  mount: (s, _t, on?: unknown) => toggleMount(s, on === undefined ? undefined : bool(on)),
  setLoc: (s, t, x, y) => {
    const p = xy({ x, y });
    return canBe(s, t, p) ? setLoc(s, p.x, p.y) : s;
  },
  leaveAndSetLoc: (s, t, x, y) => {
    const p = xy({ x, y });
    return canBe(s, t, p) ? setLoc(leaveWork(s), p.x, p.y) : leaveWork(s);
  },
  walk: (s, t, a, b, ms) => {
    // 服务器：起点要对得上，时间不能比直线跑过去还短（报短了按最快速度算）
    const ok = canBe(s, t, xy(a), 0, 'walk');
    const from = ok ? xy(a) : walkPos(s);
    const to = xy(b);
    const least = guard() ? (Math.hypot(to.x - from.x, to.y - from.y) / moveSpeed(s)) * 1000 * 0.9 : 0;
    const want = num(ms, 0, 24 * 3600_000);
    // 报的时间比最快跑过去还短很多：改了走路速度。
    // 只在起点对得上时判（11-02 误报：起点对不上时以前拿服务器的位置算距离，本机只走一小段也被当成「瞬间跑完一大段」，还会被自动处罚）
    const fastest = (Math.hypot(to.x - from.x, to.y - from.y) / (maxSpeed(s) / 1.3)) * 1000;
    if (ok && want < fastest * 0.4 && fastest > 3000) flag('walk_fast', true, { ms: Math.round(want), least: Math.round(fastest) });
    return startWalk(s, from, to, Math.max(least, want));
  },
  /** 回城卷轴用过之后画面上把人挪过去（存档里卷轴已经挪过了）：服务器只在本来就站在那里时才认 */
  teleport: (s, t, node) => {
    const n = NODES.find((x) => x.id === str(node));
    return n && canBe(s, t, standOf(n), -SLACK + 2, 'teleport') ? teleport(s, n.id) : s;
  },
  useWaystone: (s, _t, id) => useWaystone(s, str(id)),
  unlockWaystone: (s, t, at) => unlockWaystone(s, canBe(s, t, xy(at), 0, 'waystone') ? xy(at) : walkPos(s)),
  useGate: (s, _t, id) => useGate(s, str(id)),
  townScroll: (s, _t, bank) => useTownScroll(s, str(bank)),
  // 组队同打
  coop: (s, t, c) => coop(s, t, c),
  // 副本
  // 洞口开在身边找好的空地（在城里会开到最近的城外，最远九十来格）
  openGate: (s, t, key, at) => (canBe(s, t, xy(at), 92, 'gate') ? openGate(s, str(key), xy(at), t) : [s, null]),
  enterDungeon: (s, t, gate, party, team) => enterGate(s, t, gate, party, team),
  leaveDungeon: (s) => leaveDungeon(s),
  markContrib: (s, _t, id) => (guard() && !guard()!.party.includes(str(id)) ? s : markContrib(s, str(id))),
  syncDungeon: (s, _t, d) => {
    const m = (d ?? {}) as Record<string, unknown>;
    const mate = { gate: str(m.gate), floor: int(m.floor, 0, 1000), idx: int(m.idx, 0, 1000), phase: str(m.phase, 16) };
    return mateAt(mate) ? syncDungeon(s, mate) : s;
  },
  dungeonChest: (s, t) => openDungeonChest(s, t),
  buyKey: (s, _t, key, n) => buyKey(s, str(key), int(n, 1, 100)),
  buyGoods: (s, t, id, n) => buyGoods(s, str(id), int(n, 1, 10000), t),
  // 冰原宝箱
  realmChest: (s, t, id) => startRealmChest(s, str(id), t),
  realmChestDone: (s, t) => finishRealmChest(s, t),
  realmChestCancel: (s) => cancelRealmChest(s),
  // 牧场、商店、万圣节
  placeFoal: (s, t, i) => placeFoal(s, int(i, 0, 100), t),
  collectHorse: (s, t, i) => collectHorse(s, int(i, 0, 100), t),
  buySeed: (s, _t, id, n) => buySeed(s, str(id), int(n, 1, 10000)),
  hwSkin: (s, t, id) => buyHwSkin(s, str(id), t),
  hwMount: (s, t) => buyPumpkinMount(s, t),
  hwSummon: (s, t, d) => summonPumpkin(s, int(d, 0, 100), t),
  // 家园
  enterHome: (s) => enterHome(s),
  leaveHome: (s) => leaveHome(s),
  collectHome: (s, t, at?: unknown) => collectHome(s, t, at === undefined ? undefined : xy(at)),
  homeProcess: (s, t, at, r, n) => startProcess(s, t, xy(at), int(r, 0, 10), int(n, 1, 10)),
  homeDig: (s, t, i) => digTreasure(s, t, int(i, 0, 8)),
  upgradeHome: (s) => upgradeHome(s),
  repReward: (s) => claimRepReward(s),
  deliverOrder: (s, t, i) => deliverOrder(s, int(i, 0, 100), t),
  placeBuild: (s, t, id, x, y) => placeBuild(s, str(id), int(x, -1000, 1000), int(y, -1000, 1000), t),
  removeAt: (s, _t, x, y) => removeAt(s, int(x, -1000, 1000), int(y, -1000, 1000)),
  petPet: (s, t, kind) => petPet(s, str(kind), t),
  // 种田
  plantAll: (s, t, field, crop) => plantAll(s, str(field), str(crop), t),
  waterAll: (s, t, field) => waterAll(s, str(field), t),
  harvestAll: (s, t, field) => harvestAll(s, str(field), t),
  sprinkler: (s, t, field) => installSprinkler(s, str(field), t),
  tendPlot: (s, t, id, crop) => tendPlot(s, str(id), crop === undefined || crop === null ? undefined : str(crop), t),
  // 邮箱
  readMail: (s, _t, id) => readMail(s, int(id)),
  clearMail: (s) => clearMail(s),
  claimMail: (s, _t, id) => claimMail(s, id === 'all' ? 'all' : int(id), (bag, item) => bagRoomFor(bag, item, bagSlots(s))),
} satisfies Record<string, Fn>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type CmdName = keyof typeof COMMANDS;
type Rest<F> = F extends (s: GameState, t: number, ...a: infer A) => unknown ? A : never;
export type CmdArgs<N extends CmdName> = Rest<(typeof COMMANDS)[N]>;

/** 执行一条指令；名字不认识、参数乱传导致出错，都当这条没执行 */
/**
 * 开箱、副本宝箱、领小马、限时宝箱（11-02）：服务器结算时先把随机数和只有服务器知道的密钥混一下，
 * 本机就算看得到存档里的随机数，也算不出开出来什么（没法挑时机开）。结果以服务器回复为准（store.runServer）。
 */
export const SECRET_RNG = new Set<string>(['openContainer', 'dungeonChest', 'collectHorse', 'realmChestDone']);
export function saltRng(rng: number, salt: string, q: number) {
  let h = (rng ^ Math.imul(q | 0, 0x9e3779b1)) | 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h | 0;
}

export function applyCmd(s: GameState, n: string, a: unknown[], t: number): CmdResult {
  const f = own(COMMANDS, n) ? (COMMANDS as Record<string, Fn>)[n] : undefined;
  if (!f || !Array.isArray(a)) {
    flag('bad_cmd', false, { n: String(n).slice(0, 40) });
    return { state: s };
  }
  try {
    remember(s, t);
    const r = f(s, t, ...a);
    if (Array.isArray(r)) return { state: r[0], out: r[1] };
    if (r && typeof r === 'object' && 'state' in r && (r as { state: unknown }).state && typeof (r as { state: unknown }).state === 'object' && !('bank' in r)) {
      const { state, summary, ...rest } = r as { state: GameState; summary?: Summary };
      return { state, summary, out: rest };
    }
    return { state: r as GameState };
  } catch {
    return { state: s };
  }
}
