/**
 * 画质（用户 10-27「提高画质的同时要优化流畅度」）：三档，设置里能选，默认「自动」。
 * - 高：按屏幕原生像素渲染（最多 3 倍），像素边缘最清楚；天气、飘落物、小动物全开
 * - 中：最多 2 倍（以前的默认），特效正常
 * - 低：1 倍，飘落物和小动物少画，水面动画放慢
 * 自动：从上次稳定的档位开始，每 3 秒看一次帧率，连续两次低于 40 帧就降一档，
 * 连续 20 秒稳在 57 帧以上再升一档（刚降过 2 分钟内不升），结果记在这台设备上，下次直接从这档开始。
 */
export type GfxPref = 'auto' | 'high' | 'mid' | 'low';
/** 0 低 1 中 2 高 */
export type GfxLevel = 0 | 1 | 2;

const KEY = 'canglin-gfx';
const AUTO_KEY = 'canglin-gfx-auto';
const PREFS: GfxPref[] = ['auto', 'high', 'mid', 'low'];
const FIXED: Record<Exclude<GfxPref, 'auto'>, GfxLevel> = { high: 2, mid: 1, low: 0 };

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 存不了就只管这一次 */ } };

let pref: GfxPref = PREFS.includes(get(KEY) as GfxPref) ? (get(KEY) as GfxPref) : 'auto';
const autoStart = (): GfxLevel => {
  const v = get(AUTO_KEY);
  const n = v === null ? NaN : Number(v);
  return n === 0 || n === 1 || n === 2 ? n : 1;
};
let level: GfxLevel = pref === 'auto' ? autoStart() : FIXED[pref];

/** 这一档画布按几倍像素渲染 */
export function dprFor(l: GfxLevel) {
  const native = Math.max(window.devicePixelRatio || 1, 1);
  return Math.min(native, l === 2 ? 3 : l === 1 ? 2 : 1);
}

const subs = new Set<() => void>();
export function onGfx(f: () => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}
function setLevel(l: GfxLevel) {
  if (l === level) return;
  level = l;
  if (pref === 'auto') put(AUTO_KEY, String(l));
  subs.forEach((f) => f());
}

export const gfxPref = () => pref;
export const gfxLevel = () => level;
/** 粒子、飘落物数量的倍数 */
export const fxScale = () => (level === 2 ? 1.25 : level === 1 ? 1 : 0.4);

export function setGfxPref(p: GfxPref) {
  pref = p;
  put(KEY, p);
  win = { ms: 0, frames: 0 };
  slow = good = 0;
  setLevel(p === 'auto' ? level : FIXED[p]);
}

/** 帧率统计（自动档用） */
let win = { ms: 0, frames: 0 };
let slow = 0;
let good = 0;
let upBlockedUntil = 0;
/** 每帧调一次（delta 毫秒） */
export function gfxTick(delta: number, now = performance.now()) {
  if (pref !== 'auto') return;
  // 切后台、卡一下（加载、换场景）的帧不算
  if (delta <= 0 || delta > 250 || (typeof document !== 'undefined' && document.hidden)) return;
  win.ms += delta;
  win.frames++;
  if (win.ms < 3000) return;
  const fps = (win.frames * 1000) / win.ms;
  win = { ms: 0, frames: 0 };
  if (fps < 40) { slow++; good = 0; } else if (fps >= 57) { good++; slow = 0; } else { slow = 0; good = 0; }
  if (slow >= 2 && level > 0) {
    slow = 0;
    upBlockedUntil = now + 120_000;
    setLevel((level - 1) as GfxLevel);
  } else if (good >= 7 && level < 2 && now > upBlockedUntil) {
    good = 0;
    setLevel((level + 1) as GfxLevel);
  }
}
