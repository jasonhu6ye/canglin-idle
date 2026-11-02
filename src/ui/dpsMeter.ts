/**
 * 伤害统计（用户 11-02：日志里显示自己和队友的 DPS）。
 * 地图、副本场景飘伤害数字时顺便记一笔（和玩家看到的数字一致），这里按人汇总。
 * 只在本机记，不进存档；刷新页面就从头算。
 */
export interface DpsHit { t: number; who: string; name: string; i: number; dmg: number }
/** 自己的 who */
export const ME = 'me';
/** 隔这么久没人出手，下一下算新的一场 */
export const FIGHT_GAP = 15_000;
const KEEP_MS = 10 * 60_000;

let hits: DpsHit[] = [];
type Fn = () => void;
const subs = new Set<Fn>();
let queued = false;
const notify = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; subs.forEach((f) => f()); }, 250);
};
export const onDps = (f: Fn) => { subs.add(f); return () => { subs.delete(f); }; };

export function recordHit(who: string, name: string, i: number, dmg: number, t = Date.now()) {
  if (!(dmg > 0) || !Number.isFinite(dmg)) return;
  hits.push({ t, who, name, i, dmg });
  if (hits.length > 5000 || hits[0].t < t - KEEP_MS) hits = hits.filter((h) => h.t >= t - KEEP_MS).slice(-5000);
  notify();
}
export function clearDps() { hits = []; notify(); }

export interface DpsRow { who: string; name: string; i: number; dmg: number; dps: number; share: number; hits: number }
export interface DpsReport { rows: DpsRow[]; total: number; ms: number; from: number }

/**
 * 汇总：mode = 'fight' 只算这一场（从最近一段连续出手的开头算起），'5m' 算最近 5 分钟。
 * 时长按「第一下到现在」算，这一场打完了按「第一下到最后一下」算（最少 1 秒）。
 */
export function dpsReport(mode: 'fight' | '5m', now = Date.now(), list = hits): DpsReport {
  let from: number;
  let end = now;
  if (mode === '5m') {
    from = now - 5 * 60_000;
  } else {
    let i = list.length - 1;
    if (i < 0) return { rows: [], total: 0, ms: 0, from: now };
    while (i > 0 && list[i].t - list[i - 1].t < FIGHT_GAP) i--;
    from = list[i].t;
    const last = list[list.length - 1].t;
    if (now - last >= FIGHT_GAP) end = last;
  }
  const pick = list.filter((h) => h.t >= from && h.t <= end);
  if (!pick.length) return { rows: [], total: 0, ms: 0, from };
  const start = mode === '5m' ? pick[0].t : from;
  const ms = Math.max(1000, end - start);
  const by = new Map<string, DpsRow>();
  for (const h of pick) {
    const r = by.get(h.who) ?? { who: h.who, name: h.name, i: h.i, dmg: 0, dps: 0, share: 0, hits: 0 };
    r.dmg += h.dmg;
    r.hits++;
    r.name = h.name || r.name;
    by.set(h.who, r);
  }
  const total = [...by.values()].reduce((a, r) => a + r.dmg, 0);
  const rows = [...by.values()].map((r) => ({ ...r, dps: (r.dmg * 1000) / ms, share: total ? r.dmg / total : 0 })).sort((a, b) => b.dmg - a.dmg);
  return { rows, total, ms, from: start };
}
