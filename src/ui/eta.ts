import { routeFrom, standOf, type MapNode, type Route } from '../core/data';
import { moveSpeed, walkPos } from '../core/sim';
import type { GameState } from '../core/types';
import { tl } from '../i18n';

let memo: { key: string; f: (to: { x: number; y: number }) => Route } | null = null;
/** 从角色现在的位置出发去各处的最快路线（走路或顺路用石碑），同一位置算一次 */
export function routeFromHere(s: GameState): (to: { x: number; y: number }) => Route {
  const p = walkPos(s);
  const sp = moveSpeed(s);
  const key = `${p.x},${p.y},${sp},${(s.waystones ?? []).join(',')}`;
  if (memo?.key !== key) memo = { key, f: routeFrom(s.waystones, p, sp) };
  return memo.f;
}
export const routeToNode = (s: GameState, n: MapNode) => routeFromHere(s)(standOf(n));
/** 几个地点里离角色最近（过去最快）的那个 */
export const nearestNode = (s: GameState, nodes: MapNode[]) => {
  if (!nodes.length) return undefined;
  const r = routeFromHere(s);
  let best: { node: MapNode; route: Route } | undefined;
  for (const node of nodes) {
    const route = r(standOf(node));
    if (!best || route.ms < best.route.ms) best = { node, route };
  }
  return best;
};

/** 路上要多久：不到 1 分钟按秒，不到 10 分钟按分秒，再久按分钟/小时 */
export function etaTime(ms: number): string {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return tl`${sec} 秒`;
  const m = Math.floor(sec / 60);
  if (m < 10) return sec % 60 ? tl`${m} 分 ${sec % 60} 秒` : tl`${m} 分钟`;
  if (m < 60) return tl`${m} 分钟`;
  return m % 60 ? tl`${Math.floor(m / 60)} 小时 ${m % 60} 分` : tl`${Math.floor(m / 60)} 小时`;
}
/** 「约 1 分 20 秒」/「经石碑约 40 秒」；就在旁边返回「就在旁边」 */
export function etaText(r: Route): string {
  if (r.ms < 1500) return tl('就在旁边');
  return r.via ? tl`经石碑约 ${etaTime(r.ms)}` : tl`约 ${etaTime(r.ms)}`;
}
