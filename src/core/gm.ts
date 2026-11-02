import type { GameState, GmBuff, GmKind } from './types';
import { tl } from '../i18n';

/**
 * GM 增益（用户 10-26）：管理员在「更多 → GM 面板」给指定玩家或全服加的 buff。
 * 服务器 gm_buffs 表下发，客户端存进存档 gmBuffs（带开始和结束时间），离线结算也按时间段算。
 */
export const GM_PIDS = [10000001];
export const isGmPid = (pid?: number) => !!pid && GM_PIDS.includes(pid);

/** 面板里按这几组排 */
export const GM_GROUPS = [
  { id: 'xp', name: tl('经验') },
  { id: 'loot', name: tl('掉落和产出') },
  { id: 'fight', name: tl('战斗') },
  { id: 'misc', name: tl('其他') },
] as const;
export type GmGroup = (typeof GM_GROUPS)[number]['id'];
const GROUP_OF: Record<GmKind, GmGroup> = {
  xp: 'xp', xp_combat: 'xp', xp_gather: 'xp', xp_produce: 'xp',
  drop: 'loot', coins: 'loot', yield: 'loot', quality: 'loot',
  atk: 'fight', str: 'fight', def: 'fight', hp: 'fight', crit: 'fight', critdmg: 'fight', dodge: 'fight', haste: 'fight', leech: 'fight', reduce: 'fight',
  speed: 'misc', regen: 'misc', move: 'misc',
};
export const gmGroupOf = (k: GmKind) => GROUP_OF[k];

export const GM_KINDS: { id: GmKind; name: string; desc: string }[] = [
  { id: 'xp', name: tl('经验'), desc: tl('所有技能获得的经验') },
  { id: 'drop', name: tl('稀有掉落'), desc: tl('打怪和采集的几率掉落物的掉率（必掉的不变）') },
  { id: 'coins', name: tl('金币'), desc: tl('打怪掉的金币数量') },
  { id: 'yield', name: tl('双倍产出'), desc: tl('采集时额外多一份产出的几率（加的是百分点）') },
  { id: 'speed', name: tl('干活速度'), desc: tl('采集和制作的速度') },
  { id: 'atk', name: tl('命中'), desc: tl('战斗命中') },
  { id: 'str', name: tl('最高伤害'), desc: tl('战斗最高伤害') },
  { id: 'def', name: tl('防御'), desc: tl('战斗防御') },
  { id: 'hp', name: tl('生命上限'), desc: tl('最大生命值') },
  // 11-02 新增
  { id: 'xp_combat', name: tl('战斗经验'), desc: tl('只加战斗类技能（攻击、力量、防御、远程、生命）的经验') },
  { id: 'xp_gather', name: tl('采集经验'), desc: tl('只加采集类技能（挖矿、伐木、钓鱼、采集、种植等）的经验') },
  { id: 'xp_produce', name: tl('制作经验'), desc: tl('只加制作类技能（锻造、烹饪、制衣等）的经验') },
  { id: 'crit', name: tl('暴击率'), desc: tl('暴击几率，加的是百分点（+10% = 暴击率多 10 个点）') },
  { id: 'critdmg', name: tl('暴击伤害'), desc: tl('暴击时的伤害倍率（原本 150%，+50% 就是 200%）') },
  { id: 'dodge', name: tl('闪避'), desc: tl('闪避几率，加的是百分点，总闪避最多 75%') },
  { id: 'haste', name: tl('攻击速度'), desc: tl('出手速度（+100% = 攻击间隔减半）') },
  { id: 'leech', name: tl('吸血'), desc: tl('打出伤害的这么多百分比回成生命') },
  { id: 'reduce', name: tl('减伤'), desc: tl('受到的伤害减少，加的是百分点，总减伤最多 75%') },
  { id: 'regen', name: tl('回血速度'), desc: tl('不打架时自然回血的速度') },
  { id: 'move', name: tl('移动速度'), desc: tl('走路和骑坐骑的速度') },
  { id: 'quality', name: tl('制作品质'), desc: tl('制作装备出良好、优秀、史诗的几率（传说、神话不变）') },
];
export const GM_KIND_NAME = Object.fromEntries(GM_KINDS.map((k) => [k.id, k.name])) as Record<GmKind, string>;
/** 加的是百分点、还要封顶的几种（闪避、减伤），总量最多到这里 */
export const GM_CAP = 0.75;
/** 单个 buff 数值上限（百分比） */
export const GM_PCT_MAX = 1000;

/** 结算时的「当前时间」：advance 一段一段往前推时设成那一段的时间，其他时候用现在 */
let clock: number | null = null;
export const setGmClock = (t: number | null) => { clock = t; };

/** 某种 GM 增益现在加多少（0.5 = +50%），同类叠加 */
export function gmPct(s: GameState, k: GmKind, t = clock ?? Date.now()) {
  let sum = 0;
  for (const b of s.gmBuffs ?? []) if (b.kind === k && b.from <= t && t < b.to) sum += b.pct;
  return sum / 100;
}

/** 正在生效的（界面用） */
export const activeGm = (s: GameState, t = Date.now()) => (s.gmBuffs ?? []).filter((b) => b.from <= t && t < b.to);

const KINDS = new Set(GM_KINDS.map((k) => k.id));
/** 服务器来的数据先洗一遍：类型、数值范围、名字长度 */
export function cleanGm(list: unknown): GmBuff[] {
  if (!Array.isArray(list)) return [];
  const out: GmBuff[] = [];
  for (const b of list as Partial<GmBuff>[]) {
    if (!b || typeof b.id !== 'string' || !KINDS.has(b.kind as GmKind)) continue;
    const pct = Number(b.pct), from = Number(b.from), to = Number(b.to);
    if (!Number.isFinite(pct) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    out.push({
      id: b.id, kind: b.kind as GmKind, pct: Math.max(0, Math.min(GM_PCT_MAX, pct)), from, to,
      name: String(b.name ?? '').slice(0, 20), tag: String(b.tag ?? '').slice(0, 4), all: !!b.all,
    });
  }
  return out.slice(0, 50);
}

/** 换成服务器最新的一份；过期一天以上的不再留着 */
export function setGmBuffs(prev: GameState, list: GmBuff[], now = Date.now()): GameState {
  const next = cleanGm(list).filter((b) => b.to > now - 86_400_000);
  if (JSON.stringify(next) === JSON.stringify(prev.gmBuffs ?? [])) return prev;
  return { ...prev, gmBuffs: next };
}
