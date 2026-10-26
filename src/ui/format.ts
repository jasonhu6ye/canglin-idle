import { ACTIONS, ITEMS } from '../core/data';
import type { ItemStack, TaskMode } from '../core/types';
import { isEn, tl } from '../i18n';

export function fmtNum(n: number): string {
  n = Math.floor(n);
  if (isEn) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString('en-US');
  }
  if (n >= 1e8) return tl`${(n / 1e8).toFixed(1)}亿`;
  if (n >= 1e4) return tl`${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return tl`${h}小时${m}分`;
  if (h) return tl`${h}小时`;
  if (m) return tl`${m}分钟`;
  return tl`${Math.floor(ms / 1000)}秒`;
}

export function modeLabel(mode: TaskMode): string {
  if (mode.type === 'count') return `×${mode.count}`;
  if (mode.type === 'time') return fmtDuration(mode.ms);
  return '∞';
}

export const actionName = (id: string) => ACTIONS[id]?.name ?? id;

export const stacks = (list: ItemStack[] | undefined) =>
  (list ?? []).map((s) => `${ITEMS[s.item].name}×${s.qty}`).join(' + ');

/** 注册时间和账号年龄（点开玩家名片看，用户 10-26）：「2026-10-25」「3 天」 */
export function joinedText(t: number, now = Date.now()) {
  const d = new Date(t);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  const age = days === 0 ? tl('今天刚注册') : days < 365 ? tl`${days} 天` : tl`${Math.floor(days / 365)} 年 ${days % 365} 天`;
  return { date, age };
}
