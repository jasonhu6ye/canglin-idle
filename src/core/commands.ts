import type { BeltSlot, DungeonGate, EquipSlot, GameState, Summary, TaskMode } from './types';
import { ITEMS, keyOf } from './data';
import {
  bagRoomFor, bagSlots, beltSlotOf, buyGoods, buyHwSkin, buyKey, buyPumpkinMount, buySeed, cancelRealmChest, collectHorse, combineShards,
  depositLoot, dismissStop, markContrib, syncDungeon, eat, enqueue, enterDungeon, equip, finishRealmChest, fromBelt, leaveDungeon, leaveWork, openContainer,
  openDungeonChest, openGate, placeFoal, redeemCode, removeTask, resumeWork, salvage, sell, setLoc, setSettings, sortBank, startAt,
  newGame, startNow, startRealmChest, startWalk, summonPumpkin, teleport, toBag, toBank, toBelt, toggleMount, unequip, unlockWaystone, useGate,
  useTownScroll, useWaystone,
} from './sim';
import { claimRepReward, collectHome, deliverOrder, enterHome, leaveHome, petPet, placeBuild, removeAt, upgradeHome } from './home';
import { harvestAll, installSprinkler, plantAll, tendPlot, waterAll } from './farm';
import { claimMail, clearMail, readMail } from './mail';
import type { TeamMember } from './dungeon';
import { pushMateHit, setAggroMates, setDgCrew, setFieldCrew } from './aggro';

/**
 * 组队同打（11-02）：一起打的队友人数、嘲讽、队友新打出的伤害，本机从联机层收到后作为指令执行，
 * 服务器结算时也按同样的时刻用上（和本机一样只在实时结算时生效）。伤害每条最多算怪物血量的一半，防止乱报
 */
export interface Coop { crew: number; dg: number; mates: number[]; hits: [string, number][] }
function coop(s: GameState, c: unknown): GameState {
  const o = (c ?? {}) as Partial<Coop>;
  setFieldCrew(int(o.crew, 0, 4));
  setDgCrew(int(o.dg, 0, 4));
  setAggroMates((Array.isArray(o.mates) ? o.mates : []).slice(0, 4).map((x) => int(x, 1, 5000)));
  const cap = Math.max(1, (s.combat?.monsterMax ?? s.combat?.monsterHp ?? 1000) * 0.5);
  for (const h of (Array.isArray(o.hits) ? o.hits : []).slice(0, 20)) {
    if (Array.isArray(h)) pushMateHit(str(h[0], 80), Math.min(cap, num(h[1], 0, 1e9)));
  }
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
  startNow: (s, _t, a, m) => startNow(s, str(a), mode(m)),
  enqueue: (s, _t, a, m) => enqueue(s, str(a), mode(m)),
  startAt: (s, _t, a, node, m?: unknown) => startAt(s, str(a), str(node), m === undefined ? undefined : mode(m)),
  removeTask: (s, _t, i) => removeTask(s, int(i, 0, 100)),
  dismissStop: (s) => dismissStop(s),
  resumeWork: (s) => resumeWork(s),
  leaveWork: (s) => leaveWork(s),
  // 走路、坐骑、传送
  mount: (s, _t, on?: unknown) => toggleMount(s, on === undefined ? undefined : bool(on)),
  setLoc: (s, _t, x, y) => setLoc(s, int(x, -10000, 100000), int(y, -10000, 100000)),
  leaveAndSetLoc: (s, _t, x, y) => setLoc(leaveWork(s), int(x, -10000, 100000), int(y, -10000, 100000)),
  walk: (s, _t, a, b, ms) => startWalk(s, xy(a), xy(b), num(ms, 0, 24 * 3600_000)),
  teleport: (s, _t, node) => teleport(s, str(node)),
  useWaystone: (s, _t, id) => useWaystone(s, str(id)),
  unlockWaystone: (s, _t, at) => unlockWaystone(s, xy(at)),
  useGate: (s, _t, id) => useGate(s, str(id)),
  townScroll: (s, _t, bank) => useTownScroll(s, str(bank)),
  // 组队同打
  coop: (s, _t, c) => coop(s, c),
  // 副本
  openGate: (s, t, key, at) => openGate(s, str(key), xy(at), t),
  enterDungeon: (s, t, gate, party, team) => enterDungeon(s, gate as DungeonGate, int(party, 1, 10), t,
    team ? (team as { members: TeamMember[]; me: string }) : undefined),
  leaveDungeon: (s) => leaveDungeon(s),
  markContrib: (s, _t, id) => markContrib(s, str(id)),
  syncDungeon: (s, _t, d) => {
    const m = (d ?? {}) as Record<string, unknown>;
    return syncDungeon(s, { gate: str(m.gate), floor: int(m.floor, 0, 1000), idx: int(m.idx, 0, 1000), phase: str(m.phase, 16) });
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
  const f = (COMMANDS as Record<string, Fn>)[n];
  if (!f || !Array.isArray(a)) return { state: s };
  try {
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
