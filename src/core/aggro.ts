import { ITEMS } from './data';

/*
 * 嘲讽和仇恨（用户 10-26）：组队打同一个目标时，怪物的普通攻击只打一个人。
 * 11-02 用户要求「怪物只能攻击一个目标，除非使用特殊技能」：不再按几率掷，固定打嘲讽最高的那个人；
 * 一样高时按玩家 id 定（联机层把并列的队友嘲讽 ±1 再塞进来，各家算出来是同一个人）。精英、首领的大招打全体。
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

/** 怪物的普通攻击打不打嘲讽值为 mine 的人：1 = 打自己（嘲讽最高），0 = 打别人 */
export function targetChance(mine: number, others: number[]): number {
  if (!others.length) return 1;
  return mine >= Math.max(...others) ? 1 : 0;
}

/** 联机层：并列最高时按 id 小的挨打，把队友的嘲讽 ±1 区分开 */
export function tieBreak(mine: number, mate: number, myId: string, mateId: string): number {
  if (mate !== mine) return mate;
  return mateId < myId ? mate + 1 : mate - 1;
}

let mates: number[] = [];
/** 正和自己打同一个目标的队友的嘲讽值（联机层每半秒更新） */
export function setAggroMates(t: number[]) {
  mates = t.slice(0, 4);
}
export const aggroMates = () => mates;

/*
 * 副本组队同打一只怪（用户 10-26）：每个人的游戏各自结算战斗，但队友打出的伤害会通过联机层
 * 传过来，记到自己这边同一只怪身上，所以大家看到的怪物血量一致、一起打死。
 * crew：同一个洞口里在线的队友人数（怪物血量按它加厚）；离线补算时都是 0。
 */
let crew = 0;
export function setDgCrew(n: number) {
  crew = Math.max(0, Math.min(4, Math.floor(n)));
}
export const dgCrew = () => crew;

const mateHits = new Map<string, number>();
/** 洞口 + 层 + 停靠点，标识「哪一只怪」 */
export const stopKey = (gate: string, floor: number, idx: number) => `${gate}:${floor}:${idx}`;
/** 队友对这只怪打出了 dmg 伤害（联机层收到后调用） */
export function pushMateHit(key: string, dmg: number) {
  if (!(dmg > 0)) return;
  mateHits.set(key, (mateHits.get(key) ?? 0) + dmg);
  // 只留最近的几只怪，旧的丢掉
  if (mateHits.size > 20) mateHits.delete(mateHits.keys().next().value!);
}
/** 清掉所有还没算的队友伤害（服务器每次结算完清空） */
export function clearMateHits() { mateHits.clear(); }
/** 取出还没算进去的队友伤害 */
export function takeMateHits(key: string): number {
  const n = mateHits.get(key) ?? 0;
  if (n) mateHits.delete(key);
  return n;
}

/*
 * 野外组队同打一只怪（用户 10-27）：和副本一样，队友打出的伤害也记到自己这边的怪身上，
 * 怪的血量按正一起打的队友人数加厚（每人 +60%，伤害是叠加的，所以组队打得更快、更安全）。
 * fieldCrew 由联机层每半秒更新；离线补算、隔了很久的大段结算一律按单人算。
 */
let field = 0;
export function setFieldCrew(n: number) {
  field = Math.max(0, Math.min(4, Math.floor(n)));
}
export const fieldCrew = () => field;
/** 野外的怪按动作区分（同一个点的同一种怪） */
export const fieldKey = (action: string) => `field:${action}`;
