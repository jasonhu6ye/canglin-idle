import type { DungeonGate, GameState } from './types';
import { ITEMS, WALK_TILES_PER_SEC } from './data';

/*
 * 服务器结算时的「核对」信息（11-02）：玩家发来的指令参数可以被改，凡是本机说了算的东西（站在哪、
 * 队友是谁、队友打到哪、队友打了多少伤害），服务器都要拿自己查到的数据核对一遍。
 * 只在服务器结算时设置（runSync 进出时设/清）；本机执行指令时为 null，照旧按界面传来的算（结果以服务器为准）。
 */
export interface MateRun { gate: string; floor: number; idx: number; phase: string }
export interface Guard {
  /** 自己的玩家 id */
  me: string;
  /** 同队的人（含自己）；没组队只有自己 */
  party: string[];
  /** 队友身上开着的洞口（可以跟进去的） */
  gates: DungeonGate[];
  /** 队友存档里各个洞口打到哪了（通关的 phase = open） */
  runs: MateRun[];
  /** 上次核对过的位置：几个可能的点、半径（格）、时刻 */
  mv?: { pts: { x: number; y: number; r: number; t: number }[]; t: number };
  /** 上次收队友伤害的时刻 */
  coopAt?: number;
  /** 这次结算里发现的可疑操作（服务器记进防作弊记录，同一类只记一条） */
  flags?: Flag[];
}
export interface Flag { kind: string; severe: boolean; detail: Record<string, unknown> }

let g: Guard | null = null;
export const setGuard = (x: Guard | null) => { g = x; };
export const guard = () => g;
/** 记一条可疑操作（只在服务器结算时） */
export function flag(kind: string, severe: boolean, detail: Record<string, unknown> = {}) {
  if (!g) return;
  const f = (g.flags ??= []);
  const old = f.find((x) => x.kind === kind);
  if (!old) f.push({ kind, severe, detail });
  else if (severe && !old.severe) Object.assign(old, { severe, detail });
}

/** 最快能跑多快（格/秒）：装着的坐骑全速，再放宽三成 */
export function maxSpeed(s: GameState) {
  const m = ITEMS[s.equipment.mount ?? '']?.equip?.move ?? 0;
  // GM 移速增益：存档里所有移速 buff 都算上（不看时间），宁可放宽
  const gm = (s.gmBuffs ?? []).reduce((a, b) => a + (b.kind === 'move' ? b.pct / 100 : 0), 0);
  return WALK_TILES_PER_SEC * (1 + m) * (1 + gm) * 1.3;
}
