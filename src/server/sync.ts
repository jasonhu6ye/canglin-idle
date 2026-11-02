import type { GameState, GmBuff, ItemStack, SkillId } from '../core/types';
import { advance, combatLevel, level, migrate, newGame, setSettings } from '../core/sim';
import { setGmBuffs } from '../core/gm';
import { setGuildLv } from '../core/guild';
import { sendMail, stepMail } from '../core/mail';
import { ITEMS } from '../core/data';
import { applyCmd, type Cmd } from '../core/commands';
import { clearMateHits, setAggroMates, setDgCrew, setFieldCrew } from '../core/aggro';
import { setPartySize } from '../core/party';
import { flag, setGuard, type Flag, type Guard, type MateRun } from '../core/guard';
import type { DungeonGate } from '../core/types';

/** 组队相关的全局状态清零（服务器一次处理一个玩家，算完不能留给下一个） */
function resetShared(party = 0) {
  setPartySize(party);
  setFieldCrew(0);
  setDgCrew(0);
  setAggroMates([]);
  clearMateHits();
  setGuard(null);
}

/*
 * 服务器结算（11-02 用户要求：存档交给服务器算，防网页变速）。这一份同时跑在服务器（Supabase Edge Function，
 * 见 server/edge.ts）和本机测试里：从服务器存着的存档出发，按服务器时钟结算到每条指令的时刻，执行指令，
 * 最后结算到「现在」。指令带的时间不能早于上次结算、不能晚于现在，所以把本机时钟调快、开变速都没用。
 */

/** 一次最多收这么多条指令（离线玩了很久攒下来的也够用） */
export const MAX_CMDS = 3000;
/**
 * 指令时间最多往回算这么久（11-02）：不然攒着不发、过几小时再把指令时间填成以前，
 * 就能补领错过的每日/每小时奖励、限时首领。正常玩家点了几秒内就送到（net/sync.ts）
 */
export const BACKDATE_MS = 30 * 60_000;

/** 服务器从数据库查出来、要合进存档的东西 */
export interface SyncExtras {
  /** 正在生效的 GM 增益 */
  gmBuffs: GmBuff[];
  /** 公会等级（没加公会 0）和科技 */
  guildLv: number;
  guildTech?: unknown;
  /** 还没领的 GM 赠送邮件 */
  mails: { id: string; title: string; body: string; items: ItemStack[] }[];
  /** 建角色时选的外观（新档用） */
  outfit?: string;
  /** 服务器回档版本 */
  epoch?: number;
  /** 队伍人数（组队经验加成，没组队 0） */
  partySize?: number;
  /** 自己的玩家 id、同队的人（含自己） */
  me?: string;
  party?: string[];
  /** 队友存档里开着的洞口、各洞口打到哪了（核对跟队友进副本、队友进度用） */
  mateGates?: DungeonGate[];
  mateRuns?: MateRun[];
  /** 被 GM 封禁：进度冻结（不执行指令、不结算，时间直接跳到现在，解封后也补不回来） */
  frozen?: boolean;
}

export interface SyncOut { state: GameState; applied: number; mailIds: string[]; /** 这台设备的指令收到了第几条 */ ack: number; /** 可疑操作 */ flags?: Flag[] }

export function runSync(saved: unknown, cmds: unknown, now: number, ex: SyncExtras, device = '', seed?: number): SyncOut {
  resetShared(ex.partySize ?? 0);
  const keep = ((saved as { _g?: Partial<Guard> } | null)?._g ?? {}) as Partial<Guard>;
  const G: Guard = {
    me: ex.me ?? '', party: ex.party?.length ? ex.party : ex.me ? [ex.me] : [], gates: ex.mateGates ?? [], runs: ex.mateRuns ?? [],
    mv: keep.mv && Array.isArray(keep.mv.pts) ? keep.mv : undefined, coopAt: Number(keep.coopAt) || undefined,
  };
  setGuard(G);
  try {
    const out = syncInner(saved, cmds, now, ex, device, seed);
    (out.state as GameState & { _g?: Partial<Guard> })._g = { ...(G.mv && { mv: G.mv }), ...(G.coopAt && { coopAt: G.coopAt }) };
    return { ...out, flags: G.flags ?? [] };
  } finally {
    resetShared();
  }
}

function syncInner(saved: unknown, cmds: unknown, now: number, ex: SyncExtras, device: string, seed?: number): SyncOut {
  let s = saved ? migrate(saved) : null;
  if (!s) {
    s = newGame(now, seed);
    if (ex.outfit) s = setSettings(s, { skin: ex.outfit });
  }
  // 存档时间在服务器前面（以前本机算、被调过时钟的老存档）：从现在接着算，多出来的不再给
  if (s.lastTick > now) s = { ...s, lastTick: now };
  if (ex.frozen) {
    const seqs0 = { ...((saved as { _seq?: Record<string, number> } | null)?._seq ?? {}) };
    const list0 = Array.isArray(cmds) ? (cmds as Cmd[]).slice(0, MAX_CMDS) : [];
    const ack0 = Math.max(Number(seqs0[device]) || 0, ...list0.map((c) => Number(c?.q) || 0));
    if (list0.some((c) => c && typeof c.n === 'string' && c.n !== 'coop')) flag('banned_play', false, { n: list0.length });
    const out0 = { ...s, lastTick: now } as GameState & { _epoch?: number; _seq?: Record<string, number> };
    if (ex.epoch) out0._epoch = ex.epoch;
    if (device) out0._seq = Object.fromEntries(Object.entries({ ...seqs0, [device]: ack0 }).slice(-8));
    return { state: out0, applied: 0, mailIds: [], ack: ack0 };
  }
  s = setGmBuffs(s, ex.gmBuffs, s.lastTick);
  s = setGuildLv(s, ex.guildLv, ex.guildTech);
  // 每日礼物、全服赠礼、过期清理：由服务器发（玩家领邮件的指令要能找到这封）
  s = stepMail(s, now);
  let applied = 0;
  const seqs = { ...((saved as { _seq?: Record<string, number> } | null)?._seq ?? {}) };
  let ack = Number(seqs[device]) || 0;
  const list = Array.isArray(cmds) ? (cmds as Cmd[]).slice(0, MAX_CMDS) : [];
  for (const c of list) {
    if (!c || typeof c.n !== 'string') continue;
    // 已经执行过的（上次回复丢了又重发）跳过
    const q = Number(c.q) || 0;
    if (q <= ack) continue;
    ack = q;
    const t = Math.min(now, Math.max(s.lastTick, now - BACKDATE_MS, Number(c.t) || 0));
    if ((Number(c.t) || 0) < now - BACKDATE_MS - 60_000 && Number(c.t) >= s.lastTick) flag('backdate', false, { n: String(c.n).slice(0, 40), ago: Math.round((now - Number(c.t)) / 60_000) });
    s = advance(s, t).state;
    s = applyCmd(s, c.n, Array.isArray(c.a) ? c.a : [], t).state;
    applied++;
  }
  s = advance(s, now).state;
  s = stepMail(s, now);
  const mailIds: string[] = [];
  if (ex.mails.length) {
    const next: GameState = JSON.parse(JSON.stringify(s));
    for (const m of ex.mails) {
      sendMail(next, 'custom', m.items.filter((i) => ITEMS[i.item] && i.qty > 0), now, { title: m.title, body: m.body });
      mailIds.push(m.id);
    }
    s = next;
  }
  const out = s as GameState & { _epoch?: number; _seq?: Record<string, number> };
  if (ex.epoch) out._epoch = ex.epoch;
  if (device) {
    seqs[device] = ack;
    // 只记最近用过的几台设备
    out._seq = Object.fromEntries(Object.entries(seqs).slice(-8));
  }
  return { state: out, applied, mailIds, ack };
}

/** 排行榜用的等级快照 */
export function rankOf(s: GameState) {
  const skills = {} as Record<SkillId, number>;
  let total = 0;
  for (const k of Object.keys(s.xp) as SkillId[]) {
    skills[k] = level(s, k);
    total += skills[k];
  }
  return { total, combat: combatLevel(s), skills, xp: s.xp };
}
