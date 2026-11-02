import type { BeltSlot, DungeonGate, EquipSlot, GameState, Summary, TaskMode } from './types';
import { ACTIONS, ITEMS, MONSTERS, NODES, jumpNode, keyOf, nodesOfAction, standOf } from './data';
import {
  bagRoomFor, bagSlots, beltSlotOf, buyGoods, buyHwSkin, buyKey, buyPumpkinMount, buySeed, cancelRealmChest, collectHorse, combineShards,
  depositLoot, dismissStop, markContrib, syncDungeon, eat, enqueue, enterDungeon, equip, finishRealmChest, fromBelt, leaveDungeon, leaveWork, openContainer,
  openDungeonChest, openGate, placeFoal, redeemCode, removeTask, resumeWork, salvage, sell, setLoc, setSettings, sortBank, startAt,
  newGame, startNow, startRealmChest, startWalk, summonPumpkin, teleport, toBag, toBank, toBelt, toggleMount, unequip, unlockWaystone, useGate,
  useTownScroll, useWaystone, walkPos, moveSpeed, combatStats, playerAttackMs,
} from './sim';
import { dungeonFloor } from './dungeon';
import { flag, guard, maxSpeed } from './guard';
import { claimRepReward, collectHome, deliverOrder, enterHome, leaveHome, petPet, placeBuild, removeAt, upgradeHome } from './home';
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
  for (const p of G?.mv?.pts ?? []) if (t - p.t <= MV_KEEP) out.push(p);
  return out;
}
/** 服务器结算：p 是不是现在可能站的位置（extra：再放宽几格）。对不上记一条可疑操作（差得很远算严重） */
function canBe(s: GameState, t: number, p: { x: number; y: number }, extra = 0, what = 'move'): boolean {
  if (!guard()) return true;
  const sp = maxSpeed(s) / 1000;
  let over = Infinity;
  for (const a of anchors(s, t)) over = Math.min(over, Math.hypot(p.x - a.x, p.y - a.y) - (a.r + extra + sp * Math.max(0, t - a.t)));
  if (over <= 0) return true;
  // 不算严重：本机和服务器的寻路时间可能差一点，画面上的人会比服务器早到或晚到
  flag('move', false, { what, x: p.x, y: p.y, at: walkPos(s), over: Math.round(over) });
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
  G.mv = { pts: pts.slice(-16), t };
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
  setFieldCrew(Math.min(most, int(o.crew, 0, 4)));
  setDgCrew(Math.min(most, int(o.dg, 0, 4)));
  setAggroMates((Array.isArray(o.mates) ? o.mates : []).slice(0, most).map((x) => int(x, 1, 5000)));
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
    let left = most * Math.max(dps * 8, tgt.m.hp * 0.05 / 1000) * since;
    for (const h of hits) {
      if (str(h[0], 80) !== tgt.key || left <= 0) continue;
      const d = Math.min(left, num(h[1], 0, 1e9));
      left -= d;
      pushMateHit(tgt.key, d);
    }
    if (left <= 0 && asked > 3 * most * Math.max(dps * 8, tgt.m.hp * 0.05 / 1000) * Math.max(since, 1000)) flag('fake_hits', false, { dmg: Math.round(asked) });
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

const str = (x: unknown, max = 64) => (typeof x === 'string' ? x.slice(0, max) : '');
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
    if (ITEMS[k] && n > 0) out[k] = n;
  }
  return out;
};
/** 设置：只能改这些（外观另外检查有没有解锁，在 setSettings 里） */
const SETTING_KEYS = ['eatThreshold', 'carryFood', 'carryPotion', 'farmSeed', 'farmFert', 'autoFarm', 'skin'] as const;
const settings = (x: unknown) => {
  const p = (x ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) if (k in p) out[k] = p[k];
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
    at: num(o.at, 0), expires: num(o.expires, 0), seed: int(o.seed, 0, 2 ** 31), floors: int(o.floors, 1, 20),
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
  const real = !G ? want : (s.gates ?? []).find((x) => x.id === want.id) ?? G.gates.find((x) => x.id === want.id);
  if (!real) {
    // 没组队也报一个不存在的洞口：只能是改出来的（组队时可能是队友刚开、还没同步）
    flag('fake_gate', G!.party.length <= 1, { gate: want.id, kind: want.kind, tier: want.tier, floors: want.floors });
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
  settings: (s, _t, patch) => setSettings(s, settings(patch)),
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
    const from = canBe(s, t, xy(a), 0, 'walk') ? xy(a) : walkPos(s);
    const to = xy(b);
    const least = guard() ? (Math.hypot(to.x - from.x, to.y - from.y) / moveSpeed(s)) * 1000 * 0.9 : 0;
    const want = num(ms, 0, 24 * 3600_000);
    // 报的时间比最快跑过去还短很多：改了走路速度
    const fastest = (Math.hypot(to.x - from.x, to.y - from.y) / (maxSpeed(s) / 1.3)) * 1000;
    if (want < fastest * 0.4 && fastest > 3000) flag('walk_fast', true, { ms: Math.round(want), least: Math.round(fastest) });
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
