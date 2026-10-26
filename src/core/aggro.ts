import { ITEMS } from './data';

/*
 * 嘲讽和仇恨（用户 10-26）：组队打同一个目标时，怪物的普通攻击只打一个人，
 * 按嘲讽值挑：嘲讽高的大概率被打，低的也有小概率；大家一样就随机。精英、首领的大招打全体。
 * 嘲讽值来自装备：每人基础 100，板甲和双手大盾加嘲讽。
 * 队友是谁、穿了什么在联机层（net/social）算好塞进来；离线补算没有队友，每下都打自己。
 */
export const THREAT_BASE = 100;

/** 身上装备算出的嘲讽值 */
export function threatOf(equip: Partial<Record<string, string | undefined>>): number {
  let t = THREAT_BASE;
  for (const id of Object.values(equip)) t += (id && ITEMS[id]?.equip?.threat) || 0;
  return t;
}

/**
 * 嘲讽值为 mine 的人被这一下打中的几率。权重 = 嘲讽值³：
 * 一样就平分；嘲讽 100 对 300 时低的那个约 3.6%，100 对 200 约 11%。
 */
export function targetChance(mine: number, others: number[]): number {
  if (!others.length) return 1;
  const w = (t: number) => Math.max(1, t) ** 3;
  return w(mine) / (w(mine) + others.reduce((a, t) => a + w(t), 0));
}

let mates: number[] = [];
/** 正和自己打同一个目标的队友的嘲讽值（联机层每半秒更新） */
export function setAggroMates(t: number[]) {
  mates = t.slice(0, 4);
}
export const aggroMates = () => mates;
