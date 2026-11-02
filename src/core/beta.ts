import { ACTIONS, ITEMS, MONSTERS } from './data';
import { baseOf, qualityOf } from './quality';
import { isGear, PROV_EV_Q, type Prov } from './prov';
import { levelForXp } from './xp';
import type { Mail, SkillId } from './types';

/*
 * 公测审查（11-02 用户要求）：内测账号不删档进公测，自动判断每个玩家身上的东西哪些能带过去。
 * 只做标记给 GM 看，不动存档。
 * - recall 回收：GM 邮件、兑换码发的（gmGot 和服务器 gm_grants 取大的）
 * - review 待人工看：交易 / 公会仓库 / GM 改档来的（outside）；有未处理可疑标记的传说以上装备；
 *   记录开始前就有、查不到来历的传说以上装备；查不到来历、以他现在的等级也做不出来、又不是怪物掉落的装备
 * - keep 保留：自己采集、制作、打怪、系统奖励（新手任务、全服赠礼、活动礼物）得到的，和记录开始前就有的普通东西
 * 同一种东西有好几个来源时按「先算回收，再算待看，剩下的保留」分，宁可多看几件。
 * 防偷跑：GM 发的东西已经不在身上（卖掉、做成别的、用掉、转给别人）的，按物品价值记成「欠」，公测时从金币里扣；
 * 交易 / 公会仓库转出去过同种东西的标出接收人（接收方那边会是 outside，也会被标待看）。
 */

export type BetaVerdict = 'keep' | 'review' | 'recall';
export interface BetaLine {
  item: string; held: number; recall: number; review: number; keep: number; why: string[];
  /** GM 发的、已经不在身上的件数，和折算的金币 */
  short?: number; owe?: number;
  /** 这种东西转出去给过谁（交易对象「名字#数字ID」或「公会仓库」） */
  to?: string[];
}
/** 转出去的东西：交易给别人、存进公会仓库 */
export interface BetaSent { to: string; items: Record<string, number> }
export interface BetaInput {
  bank: Record<string, number>;
  bag: Record<string, number>;
  equipment: Record<string, string | undefined>;
  belt?: Record<string, { id: string; qty: number } | null | undefined>;
  xp?: Partial<Record<SkillId, number>>;
  prov: Prov | null;
  /** 存档里领到的 GM / 兑换码邮件物品 */
  gmGot?: Record<string, number>;
  /** 服务器 gm_grants：已送进邮箱的（含还没领的） */
  grants?: Record<string, number>;
  /** 存档邮箱（扣掉还没领的 GM 邮件） */
  mail?: Mail[];
  /** 还没处理的可疑装备标记（物品 id） */
  flagged?: string[];
  sent?: BetaSent[];
}

/** 身上所有东西：仓库 + 背包 + 穿着的 + 食物药水栏 */
export function allHeld(x: Pick<BetaInput, 'bank' | 'bag' | 'equipment' | 'belt'>): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string | undefined, n: number) => { if (id && n > 0 && ITEMS[id]) out[id] = (out[id] ?? 0) + n; };
  for (const [id, n] of Object.entries(x.bank ?? {})) add(id, n);
  for (const [id, n] of Object.entries(x.bag ?? {})) add(id, n);
  for (const id of Object.values(x.equipment ?? {})) add(id, 1);
  for (const b of Object.values(x.belt ?? {})) if (b) add(b.id, b.qty);
  return out;
}

/** 来源分三类：自己的、外面来的、GM 发的 */
function kindOfSrc(src: string): 'own' | 'outside' | 'gm' {
  if (src === 'outside') return 'outside';
  if (src === 'mail:gm' || src === 'mail:code' || src === 'mail:custom' || src === 'mail:redeem') return 'gm';
  return 'own';
}

/** 这件装备以他的等级能不能做出来，或者是不是有怪物掉 */
function canGetNormally(id: string, xp: BetaInput['xp']): boolean {
  const base = baseOf(id);
  for (const a of Object.values(ACTIONS)) {
    if (a.kind !== 'skill' || !a.outputs.some((o) => baseOf(o.item) === base)) continue;
    if (levelForXp(xp?.[a.skill] ?? 0) >= a.level) return true;
  }
  return Object.values(MONSTERS).some((m) => m.drops.some((d) => baseOf(d.item) === base));
}

export function betaAudit(x: BetaInput): BetaLine[] {
  const held = allHeld(x);
  // 还在邮箱里没领的 GM 邮件：公测时直接删，不算身上的
  const pending: Record<string, number> = {};
  for (const m of x.mail ?? []) if (!m.claimed && (m.gm || m.kind === 'custom')) for (const i of m.items) pending[i.item] = (pending[i.item] ?? 0) + i.qty;
  // 每种东西各类来源一共记了多少
  const by: Record<string, { own: number; outside: number; gm: number }> = {};
  const add = (id: string, src: string, n: number) => { const r = (by[id] ??= { own: 0, outside: 0, gm: 0 }); r[kindOfSrc(src)] += n; };
  const p = x.prov;
  if (p) {
    for (const [a, c] of Object.entries(p.craft)) for (const [id, n] of Object.entries(c.out)) add(id, `craft:${a}`, n);
    for (const [m, d] of Object.entries(p.drop)) for (const [id, n] of Object.entries(d.out)) add(id, `drop:${m}`, n);
    for (const [src, r] of Object.entries(p.other)) for (const [id, n] of Object.entries(r)) add(id, src, n);
    for (const [id, r] of Object.entries(p.mats)) for (const [src, n] of Object.entries(r)) add(id, src, n);
  }
  const flagged = new Set(x.flagged ?? []);
  const lines: BetaLine[] = [];
  const ids = new Set([...Object.keys(held), ...Object.keys(x.gmGot ?? {}), ...Object.keys(x.grants ?? {}), ...Object.entries(by).filter(([, v]) => v.gm > 0).map(([id]) => id)]);
  for (const id of ids) {
    if (!ITEMS[id]) continue;
    const n = held[id] ?? 0;
    const r = by[id] ?? { own: 0, outside: 0, gm: 0 };
    const why: string[] = [];
    const gm = Math.max(r.gm, x.gmGot?.[id] ?? 0, (x.grants?.[id] ?? 0) - (pending[id] ?? 0));
    const recall = Math.min(n, gm);
    if (recall) why.push('gm');
    let rest = n - recall;
    let review = Math.min(rest, r.outside);
    if (review) why.push('outside');
    rest -= review;
    const own = Math.min(rest, r.own);
    const unknown = rest - own;
    const hi = isGear(id) && qualityOf(id) >= PROV_EV_Q;
    if (hi && flagged.has(id) && rest > 0) { review += rest; why.push('flag'); rest = 0; }
    else if (unknown > 0 && isGear(id) && (hi || !canGetNormally(id, x.xp))) {
      review += unknown;
      why.push(hi ? 'old_hi' : 'no_way');
    } else if (unknown > 0) why.push('old');
    const line: BetaLine = { item: id, held: n, recall, review, keep: n - recall - review, why };
    if (gm > recall) {
      line.short = gm - recall;
      line.owe = line.short * (id === 'coins' ? 1 : ITEMS[id].value ?? 0);
      const to = [...new Set((x.sent ?? []).filter((e) => (e.items[id] ?? 0) > 0).map((e) => e.to))];
      if (to.length) { line.to = to.slice(0, 10); why.push('sent'); } else why.push('used');
    }
    if (!n && !line.short) continue;
    lines.push(line);
  }
  const rank = (l: BetaLine) => (l.recall || l.short ? 0 : l.review ? 1 : 2);
  return lines.sort((a, b) => rank(a) - rank(b) || qualityOf(b.item) - qualityOf(a.item) || a.item.localeCompare(b.item));
}

export const verdictOf = (l: BetaLine): BetaVerdict => (l.recall || l.short ? 'recall' : l.review ? 'review' : 'keep');

/** GM 发的东西已经不在身上，一共折合多少金币（公测时从金币里扣） */
export const oweTotal = (lines: BetaLine[]) => lines.reduce((a, l) => a + (l.owe ?? 0), 0);
