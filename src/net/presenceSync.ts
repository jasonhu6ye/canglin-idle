import type { Presence } from './api';

/**
 * 在线状态拆成两路发（10-26 优化延迟）：
 * - 慢变的（外观、装备、等级、任务、召集、洞口）走 Realtime presence。Supabase 免费版全服每秒只许 20 条 presence，
 *   以前走路、打副本每 0.15-0.5 秒就 track 一次，几个人一起动就超限，服务器断开连接、退回 4 秒一次的轮询，看起来卡顿瞬移。
 * - 快变的（位置、动作、血量、副本进度）走 broadcast，包小、不受 presence 限额。
 * 每条都带发送时的序号 s（发送方的毫秒时钟，单调递增），收到的一边按 s 取新的那条叠上去。
 */
export const FAST_KEYS = ['x', 'y', 'anim', 'flip', 'hp', 'dg', 'fd'] as const;
export type FastKey = (typeof FAST_KEYS)[number];
export type Fast = Pick<Presence, FastKey> & { s: number };

/** 慢变字段的指纹：变了才需要重新 track */
export function slowKey(p: Partial<Presence>): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!(FAST_KEYS as readonly string[]).includes(k) && k !== 's' && k !== 'at') o[k] = v;
  return JSON.stringify(o);
}

export function fastOf(p: Partial<Presence>, s: number): Fast {
  return { x: p.x ?? 0, y: p.y ?? 0, anim: p.anim, flip: p.flip, hp: p.hp, dg: p.dg, fd: p.fd, s };
}

/** 把收到的移动叠到在线状态上：比在线状态本身新的才叠（没动作就清掉 anim，所以每个快字段都要覆盖） */
export function withMove(p: Presence, m: Fast | undefined): Presence {
  if (!m || m.s <= (p.s ?? 0)) return p;
  return { ...p, x: m.x, y: m.y, anim: m.anim, flip: m.flip, hp: m.hp ?? p.hp, dg: m.dg, fd: m.fd, s: m.s };
}

/** 收到的广播先粗查一下，别人乱发的东西不进游戏 */
export function readFast(raw: unknown): (Fast & { id: string }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.s !== 'number' || typeof r.x !== 'number' || typeof r.y !== 'number') return null;
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  return {
    id: r.id, s: r.s, x: r.x, y: r.y,
    anim: typeof r.anim === 'string' ? r.anim : undefined,
    flip: typeof r.flip === 'boolean' ? r.flip : undefined,
    hp: typeof r.hp === 'number' ? r.hp : undefined,
    dg: r.dg && typeof r.dg === 'object' ? (r.dg as Presence['dg']) : undefined,
    fd: readFieldHit(r.fd),
  };
}

function readFieldHit(v: unknown): Presence['fd'] {
  if (!v || typeof v !== 'object') return undefined;
  const f = v as Record<string, unknown>;
  if (typeof f.k !== 'string' || typeof f.n !== 'number' || typeof f.dmg !== 'number' || !Number.isFinite(f.dmg)) return undefined;
  return { k: f.k, n: f.n, dmg: f.dmg, crit: f.crit === true || undefined };
}

/**
 * 发位置的节奏：附近（同一个副本里 / 大地图视野里）有人看才发得勤，人越多越慢一点，
 * 免得全服消息数超过免费版每秒 100 条。返回 [最短间隔毫秒, 至少移动多少格才发]。
 */
export function moveCadence(watchers: number, inDungeon: boolean): [number, number] {
  if (!watchers) return [1500, 3];
  const base = inDungeon ? 150 : 250;
  return [Math.min(2000, base * Math.max(1, watchers / 2)), inDungeon ? 0.5 : 1];
}
