import { ACTIONS, ITEMS } from '../core/data';
import type { ItemStack, TaskMode } from '../core/types';
import { isEn, tl } from '../i18n';

/** 数字（用户 10-26）：不到 10 万照常显示，10 万起写成 100K、1.5M、2B、1T，中英文一样 */
export function fmtNum(n: number): string {
  n = Math.floor(n);
  const a = Math.abs(n);
  if (a < 1e5) return n.toLocaleString(isEn ? 'en-US' : 'zh-CN');
  const [d, u] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
  const v = n / d;
  const txt = Math.abs(v) >= 100 ? String(Math.floor(v)) : (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return `${txt}${u}`;
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

/** 命中加成：装备的命中点数换成百分比（命中判定里是 ×(1 + 点数/64)） */
export const hitPct = (attack: number) => Math.round((attack / 64) * 100);

const STYLE_WORD = { melee: tl('近战'), ranged: tl('远程'), magic: tl('魔法') };

/**
 * 战斗装备的词条写成一句（10-26 用户定的叫法）：
 * 武器「攻击力、命中率、出手间隔」；护甲「基础防御、防御加成、伤害加成」（鞋子手套多一条攻速）；饰品、副手各写各的，没有的不写
 */
export function gearLine(e: NonNullable<import('../core/types').ItemDef['equip']>) {
  const pc = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const out: string[] = [];
  if (e.slot === 'weapon') {
    out.push(tl`攻击力 ${e.strength}`, tl`命中率 +${hitPct(e.attack)}%`);
    if (e.attackMs) out.push(tl`出手间隔 ${(e.attackMs / 1000).toFixed(1)} 秒`);
  } else {
    if (e.strength) out.push(tl`攻击力 +${e.strength}`);
    if (e.attack) out.push(tl`命中率 +${hitPct(e.attack)}%`);
  }
  if (e.defence) out.push(tl`基础防御 +${e.defence}`);
  if (e.defPct) out.push(tl`防御加成 +${pc(e.defPct)}`);
  if (e.dmgPct) out.push(tl`伤害加成 +${pc(e.dmgPct)}`);
  if (e.hp) out.push(tl`生命上限 +${e.hp}`);
  if (e.haste) out.push(tl`攻速 +${pc(e.haste)}`);
  if (e.xp) out.push(tl`所有经验 +${pc(e.xp)}`);
  if (e.luck) out.push(tl`几率掉落 +${pc(e.luck)}`);
  if (e.crit) out.push(tl`暴击几率 +${pc(e.crit)}`);
  if (e.dodge) out.push(tl`闪避几率 +${pc(e.dodge)}`);
  if (e.work) out.push(tl`采集和制作速度 +${pc(e.work)}`);
  if (e.leech) out.push(tl`吸血 ${Math.round(e.leech * 100)}%（打出伤害的 ${Math.round(e.leech * 100)}% 回成生命）`);
  if (e.threat) out.push(tl`嘲讽值 +${e.threat}`);
  if (e.bag) out.push(tl`背包 +${e.bag} 格`);
  if (e.sage) out.push(tl`经验 +${pc(e.sage)}（每多 1 点经验扣 1 金币）`);
  if (e.twoHanded) out.push(tl('双手持握，不能用副手'));
  if (e.style && e.slot !== 'weapon') out.push(tl`（只对${STYLE_WORD[e.style]}生效）`);
  return out.join(' · ');
}
