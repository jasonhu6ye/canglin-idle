import type { GameState, GmBuff, ItemStack, SkillId } from '../core/types';
import { advance, combatLevel, level, migrate, newGame, setSettings } from '../core/sim';
import { setGmBuffs } from '../core/gm';
import { setGuildLv } from '../core/guild';
import { markOldGmMail, sendMail, stepMail } from '../core/mail';
import { ITEMS } from '../core/data';
import { applyCmd, saltRng, SECRET_RNG, type Cmd } from '../core/commands';
import { clearMateHits, setAggroMates, setDgCrew, setFieldCrew } from '../core/aggro';
import { setPartySize } from '../core/party';
import { flag, setGuard, type Flag, type Guard, type MateRun } from '../core/guard';
import type { DungeonGate } from '../core/types';
import { gearHeld, gearSuspects, setMaker, trimMarks, matTotals, matsHeld, newEvents, newProv, provSettle, provSettleMats, provTotals, type GearSuspect } from '../core/prov';

/** 上次结算末尾的一起打人数，隔多久之内下次接着用 */
const COOP_KEEP_MS = 10_000;
/** 组队相关的全局状态清零（服务器一次处理一个玩家，算完不能留给下一个） */
function resetShared(party = 0) {
  setPartySize(party);
  setFieldCrew(0);
  setDgCrew(0);
  setAggroMates([]);
  clearMateHits();
  setGuard(null);
  setMaker(null);
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
  mails: { id: string; title: string; body: string; items: ItemStack[]; /** 兑换码换来的（不是管理员手发的） */ code?: boolean }[];
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
  /** 只有服务器知道的密钥：开箱这类指令的随机数和它混一下，本机算不出结果 */
  salt?: string;
  /** 制作者署名：「名字#数字ID」（做出传说以上装备时记上） */
  maker?: string;
  /** 被 GM 封禁：进度冻结（不执行指令、不结算，时间直接跳到现在，解封后也补不回来） */
  frozen?: boolean;
}

export interface SyncOut { state: GameState; applied: number; mailIds: string[]; /** 这台设备的指令收到了第几条 */ ack: number; /** 可疑操作 */ flags?: Flag[]; /** 可疑装备 */ gear?: GearSuspect[]; /** 开箱这类指令服务器算出来的结果（按指令序号） */ results?: { q: number; out: unknown }[] }

export function runSync(saved: unknown, cmds: unknown, now: number, ex: SyncExtras, device = '', seed?: number): SyncOut {
  resetShared(ex.partySize ?? 0);
  const keep = ((saved as { _g?: Partial<Guard> } | null)?._g ?? {}) as Partial<Guard>;
  const G: Guard = {
    me: ex.me ?? '', party: ex.party?.length ? ex.party : ex.me ? [ex.me] : [], gates: ex.mateGates ?? [], runs: ex.mateRuns ?? [],
    mv: keep.mv && Array.isArray(keep.mv.pts) ? keep.mv : undefined, coopAt: Number(keep.coopAt) || undefined, coopBank: Number(keep.coopBank) || undefined,
  };
  setGuard(G);
  // 上次结算末尾还在一起打（10 秒内）：接着按那时的人数算，等这次的 coop 指令再更新
  const kc = keep.coop;
  const last = Number((saved as { lastTick?: number } | null)?.lastTick) || 0;
  if (kc && typeof kc === 'object' && last - Number(kc.t) < COOP_KEEP_MS && last >= Number(kc.t)) {
    // 存下来时已经按队伍人数（冰原同打最多 4 人）限过量
    setFieldCrew(Math.min(4, Math.max(0, Math.floor(Number(kc.crew) || 0))));
    setDgCrew(Math.min(4, Math.max(0, Math.floor(Number(kc.dg) || 0))));
    setAggroMates((Array.isArray(kc.mates) ? kc.mates : []).slice(0, 4).map((x) => Math.max(1, Math.min(5000, Math.floor(Number(x) || 1)))));
    G.coop = kc;
  }
  setMaker(ex.maker || null);
  try {
    const p0 = (saved as { prov?: { seq?: number; ev?: unknown[] } } | null)?.prov;
    const seq0 = Number(p0?.seq ?? (Array.isArray(p0?.ev) ? p0!.ev!.length : 0)) || 0;
    const out = syncInner(saved, cmds, now, ex, device, seed);
    // 可疑装备（11-02）：这次新记下的传说以上装备，按概率/来源/数量挑出来，交给管理员看
    const gear = p0 ? gearSuspects(out.state.prov, newEvents(out.state.prov, seq0)) : [];
    if (gear.length) out.gear = gear;
    (out.state as GameState & { _g?: Partial<Guard> })._g = { ...(G.mv && { mv: G.mv }), ...(G.coopAt && { coopAt: G.coopAt }), ...(G.coopBank && { coopBank: Math.round(G.coopBank) }), ...(G.coop && { coop: G.coop }) };
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
  // 装备来源（11-02）：第一次记的时候身上已有的算「记录前」；上次结算后多出来的是交易/公会仓库这类外面来的
  if (!s.prov) s = { ...s, prov: newProv(s, s.lastTick) };
  else {
    provSettle(s, 'outside', s.prov.held, provTotals(s.prov), s.lastTick);
    if (s.prov.matHeld) provSettleMats(s, 'outside', s.prov.matHeld, matTotals(s.prov));
  }
  /** 一步（一段结算或一条指令）前后对比，多出来又没被制作/掉落记到的装备记到 src 名下 */
  const step = (src: string, t: number, f: (x: GameState) => GameState) => {
    const before = gearHeld(s!);
    const tot = provTotals(s!.prov!);
    const mBefore = matsHeld(s!);
    const mTot = matTotals(s!.prov!);
    s = f(s!);
    if (!s.prov) s = { ...s, prov: newProv(s, t) };
    else {
      provSettle(s, src, before, tot, t);
      provSettleMats(s, src, mBefore, mTot);
    }
  };
  s = markOldGmMail(s);
  s = setGmBuffs(s, ex.gmBuffs, s.lastTick);
  s = setGuildLv(s, ex.guildLv, ex.guildTech);
  // 每日礼物、全服赠礼、过期清理：由服务器发（玩家领邮件的指令要能找到这封）
  s = stepMail(s, now);
  let applied = 0;
  const results: { q: number; out: unknown }[] = [];
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
    step('auto', t, (x) => advance(x, t).state);
    const secret = ex.salt && SECRET_RNG.has(c.n);
    if (secret) s = { ...s, rng: saltRng(s.rng, ex.salt!, q) };
    // 开副本宝箱：记下是哪种洞口、几阶、什么品质的宝箱
    const dg = c.n === 'dungeonChest' && s.dungeon ? `:${s.dungeon.gate.kind}${s.dungeon.gate.tier + 1}:${s.dungeon.chest ?? 0}` : '';
    let r: ReturnType<typeof applyCmd> | null = null;
    step(`cmd:${String(c.n).slice(0, 30)}${dg}`, t, (x) => (r = applyCmd(x, c.n, Array.isArray(c.a) ? c.a : [], t)).state);
    if (secret && results.length < 50) results.push({ q, out: r!.out ?? null });
    applied++;
  }
  step('auto', now, (x) => advance(x, now).state);
  s = stepMail(s, now);
  const mailIds: string[] = [];
  if (ex.mails.length) {
    const next: GameState = JSON.parse(JSON.stringify(s));
    for (const m of ex.mails) {
      sendMail(next, 'custom', m.items.filter((i) => ITEMS[i.item] && i.qty > 0), now, { title: m.title, body: m.body, gm: m.code ? 'code' : 'gm' });
      mailIds.push(m.id);
    }
    s = next;
  }
  const out = s as GameState & { _epoch?: number; _seq?: Record<string, number> };
  trimMarks(out);
  if (out.prov) {
    out.prov.held = gearHeld(out);
    out.prov.matHeld = matsHeld(out);
  }
  if (ex.epoch) out._epoch = ex.epoch;
  if (device) {
    seqs[device] = ack;
    // 只记最近用过的几台设备
    out._seq = Object.fromEntries(Object.entries(seqs).slice(-8));
  }
  return { state: out, applied, mailIds, ack, results };
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
