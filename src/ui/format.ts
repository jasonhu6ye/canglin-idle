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

/** 饰品（10-26）的加成写成一句：攻、力、防、生命、各种百分比，没有的不写 */
export function jewelLine(e: NonNullable<import('../core/types').ItemDef['equip']>) {
  const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const out: string[] = [];
  if (e.attack) out.push(tl`攻击 +${e.attack}`);
  if (e.strength) out.push(tl`力量 +${e.strength}`);
  if (e.defence) out.push(tl`防御 +${e.defence}`);
  if (e.hp) out.push(tl`生命上限 +${e.hp}`);
  if (e.haste) out.push(tl`攻速 +${pc(e.haste)}`);
  if (e.xp) out.push(tl`所有经验 +${pc(e.xp)}`);
  if (e.luck) out.push(tl`几率掉落 +${pc(e.luck)}`);
  if (e.crit) out.push(tl`暴击几率 +${pc(e.crit)}`);
  if (e.dodge) out.push(tl`闪避几率 +${pc(e.dodge)}`);
  if (e.work) out.push(tl`采集和制作速度 +${pc(e.work)}`);
  return out.join(' · ');
}
