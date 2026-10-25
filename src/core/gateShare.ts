import type { DungeonGate, GameState } from './types';

/*
 * 队友的副本洞口（用户 10-25：队长可以召集队员参与副本）。
 * 联机层把队友在线状态里带的洞口放进来，地图上也画出来，队友可以进同一个洞口（地形一样，各打各的）。
 */
let shared: DungeonGate[] = [];
const subs = new Set<() => void>();
export function setSharedGates(g: DungeonGate[]) {
  const key = (l: DungeonGate[]) => l.map((x) => x.id).sort().join();
  if (key(g) === key(shared)) return;
  shared = g;
  subs.forEach((f) => f());
}
export const onSharedGates = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** 地图上要画的洞口：自己的 + 队友的（没过期的） */
export function allGates(s: GameState, now = Date.now()): DungeonGate[] {
  const own = s.gates ?? [];
  return [...own, ...shared.filter((g) => !own.some((o) => o.id === g.id))].filter((g) => g.expires > now);
}
