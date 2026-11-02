import { onlinePartySize, setPartySize } from '../core/party';
import { fieldKey, threatOf, tieBreak } from '../core/aggro';
import type { GameState } from '../core/types';
import { useEffect, useState } from 'react';
import { worldResetAt } from './bots';
import { online, type DungeonPresence, type Presence, type ChatChannel, type ChatMsg, type Friend, type Party, type PartyInvite, type Trade } from './index';
import { ACTIONS, ITEMS, NODES } from '../core/data';
import { store } from '../store';
import { setGmBuffs } from '../core/gm';
import { pushNow } from './sync';

/**
 * 聊天和好友（10-25 用户要求：世界 / 公会 / 队伍 / 私聊，玩家数字 ID 加好友）。
 * 登录后全局只订阅一次，聊天栏和联机页共用。
 */
const KEEP = 300;

interface State {
  msgs: ChatMsg[];
  friends: Friend[];
  party: Party | null;
  invites: PartyInvite[];
  trades: Trade[];
  /** 聊天栏当前频道和私聊对象 */
  channel: ChatChannel;
  to: string | null;
  open: boolean;
  /** 各频道未读条数 */
  unread: Record<ChatChannel, number>;
}
const st: State = {
  msgs: [], friends: [], party: null, invites: [], trades: [], channel: 'world', to: null, open: false,
  unread: { world: 0, guild: 0, party: 0, private: 0 },
};
type Fn = () => void;
const fns = new Set<Fn>();
/** 地图上在线的玩家（组队经验只算在线的队员，11-02） */
let onlineIds = new Set<string>();
const updateParty = () => {
  const me = online.me()?.id ?? '';
  setPartySize(st.party ? onlinePartySize(st.party.members.map((m) => m.playerId), me, (id) => onlineIds.has(id)) : 0);
};
const emit = () => {
  // 组队经验加成按在线的队员人数算（用户 10-25；11-02 起离线队员不算）
  updateParty();
  fns.forEach((f) => f());
};

export function useSocial() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    fns.add(f);
    return () => { fns.delete(f); };
  }, []);
  return st;
}

let offs: (() => void)[] = [];
let forId: string | null = null;

export async function refreshSocial() {
  if (!online.me()) return;
  try {
    const [friends, party, invites, trades] = await Promise.all([online.friends(), online.party(), online.partyInvites(), online.trades()]);
    Object.assign(st, { friends, party, invites, trades });
    for (const t of trades) if (t.status === 'done' && !t.claimed) await claim(t);
    if (st.channel === 'party' && !party) st.channel = 'world';
    emit();
  } catch { /* 连不上就算了 */ }
}

/** 登录状态变了时调用：换人就重新订阅 */
export function syncSocial() {
  const me = online.me();
  if ((me?.id ?? null) === forId) return;
  offs.forEach((f) => f());
  offs = [];
  Object.assign(st, { msgs: [], friends: [], party: null, invites: [], trades: [], to: null, channel: 'world', unread: { world: 0, guild: 0, party: 0, private: 0 } });
  forId = me?.id ?? null;
  if (!me) { emit(); return; }
  offs.push(online.onChat((m) => {
    if (st.msgs.some((x) => x.id === m.id)) return;
    // 世界频道每天北京时间 0 点清空
    if (m.channel === 'world' && m.at < worldResetAt()) return;
    const cut = worldResetAt();
    st.msgs = [...st.msgs, m].filter((x) => x.channel !== 'world' || x.at >= cut).sort((a, b) => a.at - b.at).slice(-KEEP);
    const seen = st.open && st.channel === m.channel && (m.channel !== 'private' || st.to === m.playerId || m.playerId === me.id);
    if (!seen && m.playerId !== me.id && Date.now() - m.at < 60_000) st.unread[m.channel]++;
    emit();
  }));
  offs.push(online.onSocial(() => void refreshSocial()));
  offs.push(online.onPresence((all) => { onlineIds = new Set(all.map((p) => p.playerId)); updateParty(); }));
  void refreshSocial();
  // GM 增益（10-26）：登录后马上拉一次，之后每分钟一次
  void pullGm();
  const t = setInterval(() => void pullGm(), GM_POLL_MS);
  offs.push(() => clearInterval(t));
  // 队伍、好友、交易每 30 秒对一次（10-26）：实时推送偶尔会漏，漏了以前要刷新页面才看得到；切回页面时也马上对一次
  const r = setInterval(() => { if (!document.hidden) void refreshSocial(); }, SOCIAL_POLL_MS);
  const vis = () => { if (!document.hidden) void refreshSocial(); };
  document.addEventListener('visibilitychange', vis);
  offs.push(() => { clearInterval(r); document.removeEventListener('visibilitychange', vis); });
}

const GM_POLL_MS = 60_000;
const SOCIAL_POLL_MS = 30_000;
export async function pullGm() {
  if (!online.me()) return;
  try {
    const list = await online.myGmBuffs();
    store.dispatch((s) => setGmBuffs(s, list));
  } catch { /* 连不上就下次再拉，存档里的照旧生效 */ }
  // GM 赠送物品（10-26）：11-02 起由服务器同步时放进邮箱（只放一次），这里看到有新的就马上同步一次
  try {
    if ((await online.myGmMail()).length) void pushNow();
  } catch { /* 下次再拉 */ }
}

export function openChat(channel?: ChatChannel, to?: string | null) {
  st.open = true;
  if (channel) st.channel = channel;
  if (to !== undefined) st.to = to;
  st.unread[st.channel] = 0;
  emit();
}
let rallyAt = 0;
/** 队长召集：跟着位置一起发出去，队友收到后自动寻路过来 */
export function sendRally() { rallyAt = Date.now(); emit(); }
export const rallyTime = () => rallyAt;
let assistAt = 0;
/** 叫队友一起打（用户 11-02）：自己在打怪时发出，队友收到弹窗，点「一起打」就去打同一只 */
export function sendAssist() { assistAt = Date.now(); emit(); }
export const assistTime = () => assistAt;

export function closeChat() { st.open = false; emit(); }

/** 某个频道里要显示的消息（私聊只看和当前好友的） */
export function channelMsgs(channel: ChatChannel, to: string | null) {
  const me = online.me()?.id;
  return st.msgs.filter((m) => m.channel === channel
    && (channel !== 'private' || (to && ((m.playerId === me && m.toId === to) || (m.playerId === to && m.toId === me)))));
}

export async function send(text: string) {
  await online.sendChat(st.channel, text, st.channel === 'private' ? st.to ?? undefined : undefined);
}

/** 成交了：东西已经由服务器在双方存档里换好（11-02），这里登记一下、同步拿回最新存档 */
async function claim(t: Trade) {
  if (!(await online.claimTrade(t.id))) return;
  t.claimed = true;
  void pushNow();
  emit();
}

/** 自己有多少（仓库 + 背包），交易能放的上限 */
export const ownCount = (id: string) => (store.state.bank[id] ?? 0) + (store.state.bag[id] ?? 0);

/** 仓库加背包够不够放上交易台 */
export function lacking(items: Record<string, number>) {
  return Object.entries(items).filter(([id, n]) => ownCount(id) < n).map(([id]) => ITEMS[id]?.name ?? id);
}

/**
 * 永冬冰原的限时精英和首领（用户 11-01「可以几个人攻击同一个怪」）：不用组队，
 * 附近打同一只的所有人都算一起打——伤害互相记到对方的怪上，血量按人数加厚（和野外组队一样）。
 */
const SHARED = new Set(NODES.filter((n) => n.timed && (n.timed.kind === 'elite' || n.timed.kind === 'boss')).flatMap((n) => n.actions));
/**
 * 野外打同一种怪、离多近算一起打同一只（格）。11-02 从 10 放宽到 30：同一个刷怪点上各自站的位置
 * 可能差十几格（用户截图：冰原猛犸两人隔着半个屏幕各打各的）。不同刷怪点之间远得多，不会算错
 */
export const FIELD_CREW = 30;
/** 队友停手（等刷新、换下一只）多久之内仍算一起打 */
const MATE_HOLD_MS = 8000;
const mateFightAt = new Map<string, number>();
export const sharedFight = (action: string | undefined) => !!action && SHARED.has(action);
/** 最近一次收到的所有在线玩家（打冰原精英/首领时找一起打的人） */
let lastAll: Presence[] = [];
/** 一起打的人：队友，加上（冰原精英/首领时）附近所有人 */
function fightMates(action: string | undefined, meId: string): { id: string; name: string; i: number }[] {
  // i：队友按队伍里的位置（飘字颜色和以前一样），不是队友的排在后面
  const out = new Map<string, { name: string; i: number }>();
  (st.party?.members ?? []).forEach((m, i) => { if (m.playerId !== meId) out.set(m.playerId, { name: m.name, i }); });
  let k = 4;
  if (sharedFight(action)) for (const p of lastAll) if (p.playerId !== meId && !out.has(p.playerId)) out.set(p.playerId, { name: p.name, i: k++ });
  return [...out].map(([id, v]) => ({ id, ...v }));
}

let aggroAt = 0;
/**
 * 嘲讽（用户 10-26）：找出正和我打同一个目标的队友，把他们的嘲讽值交给 sim。
 * 副本里看同一个洞口、同一层、同一个停靠点都在打；野外看同一个战斗动作、都在出手、离得近（FIELD_CREW 格内）。
 * 地图和副本场景每帧发位置时顺便调用，半秒算一次。
 */
export function updateAggro(s: GameState, x: number, y: number, fighting: boolean, dg?: DungeonPresence) {
  const now = Date.now();
  if (now - aggroAt < 500) return;
  aggroAt = now;
  const me = online.me();
  const action = s.paused ? undefined : s.queue[0]?.action;
  const inFight = dg ? dg.phase === 'fight' : fighting && !!action && ACTIONS[action]?.kind === 'combat';
  // 同一个洞口里在线的队友（10-26）：怪物血量按人数加厚
  const run = s.dungeon;
  const dgN = me && run?.members ? run.members.filter((m) => {
    if (m.id === me.id) return false;
    const p = online.presenceOf(m.id);
    return !!p && now - p.at < 30_000 && p.dg?.gate === run.gate.id;
  }).length : 0;
  if (!me || (!st.party && !sharedFight(action)) || !inFight) return sendCoop(0, dgN, []);
  const out: number[] = [];
  for (const m of fightMates(action, me.id)) {
    const p = online.presenceOf(m.id);
    if (!p || now - p.at > 60_000) continue;
    // 野外：队友打死一只、等下一只刷新时不在出手，几秒内仍算一起打（11-02：以前这几秒算单人，
    // 这时刷出来的那只整只都没有队友伤害，看起来队友莫名其妙断了伤害）
    const near = !p.dg && p.action === action && Math.abs(p.x - x) + Math.abs(p.y - y) <= FIELD_CREW;
    if (near && p.anim?.startsWith('fight-')) mateFightAt.set(m.id, now);
    const same = dg
      ? p.dg && p.dg.gate === dg.gate && p.dg.floor === dg.floor && p.dg.idx === dg.idx && p.dg.phase === 'fight'
      : near && now - (mateFightAt.get(m.id) ?? 0) < MATE_HOLD_MS;
    if (same) out.push(tieBreak(threatOf(s.equipment), threatOf(p.equip ?? {}), me.id, m.id));
  }
  sendCoop(dg ? 0 : out.length, dgN, out);
}

/**
 * 组队同打的人数、嘲讽、队友伤害（11-02 服务器结算）：作为指令执行，服务器结算时也按同样的时刻算上。
 * 有变化、有新伤害就发；一直在一起打的话每 4 秒补一条（服务器只在实时结算时算组队）
 */
let coopLast = '';
let coopAt = 0;
let coopHits: [string, number][] = [];
export function coopHit(key: string, dmg: number) {
  if (dmg > 0) coopHits.push([key, dmg]);
}
function sendCoop(crew: number, dg: number, mates: number[]) {
  const key = JSON.stringify([crew, dg, mates]);
  const now = Date.now();
  const busy = crew > 0 || dg > 0 || mates.length > 0;
  if (key === coopLast && !coopHits.length && !(busy && now - coopAt > 4000)) return;
  coopLast = key;
  coopAt = now;
  const hits = coopHits;
  coopHits = [];
  store.run('coop', { crew, dg, mates, hits });
}

/** 每个队友上次报的野外伤害：哪个点、第几只、累计多少 */
const fieldSeen = new Map<string, { k: string; n: number; dmg: number }>();
/**
 * 野外组队（10-27）：队友对同一个点的怪新打了多少伤害，记到自己这边的怪上，返回给画面飘字用。
 * 队友换了一只（n 变了）就从 0 算起。
 */
export interface FieldMateHit { id: string; name: string; i: number; dmg: number; crit: boolean }
export function takeFieldHits(all: Presence[]): FieldMateHit[] {
  const me = online.me();
  const s = store.state;
  const action = s.paused ? undefined : s.queue[0]?.action;
  const out: FieldMateHit[] = [];
  lastAll = all;
  if (!me || (!st.party && !sharedFight(action)) || !action || ACTIONS[action]?.kind !== 'combat' || s.dungeon) return out;
  for (const m of fightMates(action, me.id)) {
    const p = all.find((q) => q.playerId === m.id);
    const f = p?.fd;
    if (!p) continue;
    // 队友没在打（或打的别处）：记成空账，等他开打时从第一下算起
    if (!f || p.dg || f.k !== action) {
      fieldSeen.set(p.playerId, { k: '', n: 0, dmg: 0 });
      continue;
    }
    const last = fieldSeen.get(p.playerId);
    const same = last && last.k === f.k && last.n === f.n;
    const delta = same ? f.dmg - last.dmg : f.dmg;
    fieldSeen.set(p.playerId, { k: f.k, n: f.n, dmg: same ? Math.max(f.dmg, last.dmg) : f.dmg });
    // 自己这只还在刷新、或者是第一次看到这个队友（以前打的旧账）就不记
    // 自己这只在刷新时队友打的伤害不丢：记下来算到刷出来的下一只上（两边的怪死得前后差一点，伤害不会白打）
    if (!last || delta <= 0 || !s.combat || !s.combat.crew) continue;
    // 不是队友的（冰原同打）：一次最多算怪物血量的 20%，防止改过的客户端一下把大家的首领打没
    const party = st.party?.members.some((q) => q.playerId === p.playerId);
    const cap = party ? Infinity : Math.max(1, (s.combat.monsterMax ?? s.combat.monsterHp) * 0.2);
    const dmg = Math.min(delta, cap);
    coopHit(fieldKey(action), dmg);
    out.push({ id: p.playerId, name: m.name, i: m.i, dmg, crit: !!f.crit });
  }
  syncFieldHp(action, all);
  return out;
}

/**
 * 两边的怪对齐（11-02 用户「我们应该是打同一只怪」）：各自的游戏里各有一只，伤害互相记，但开打时刻、
 * 网络延迟会让血量差一截、一前一后死。这里把「同一只」配对（两边都活着时看到的那一对），
 * 配对的那只队友那边血更少就跟到他的血量；他那边打死了，自己这只也一起倒下。差的血量作为队友伤害记账（服务器照样限量）。
 */
const pairs = new Map<string, { mine: number; theirs: number }>();
let syncAt = 0;
function syncFieldHp(action: string, all: Presence[]) {
  const me = online.me();
  const c = store.state.combat;
  // 上一次补的差还没执行（随 coop 指令半秒发一次）就先不算，免得重复补
  if (!me || !c || !c.crew || !st.party || Date.now() - syncAt < 700) return;
  const mine = c.copy ?? 0;
  let gap = 0;
  for (const m of st.party.members) {
    if (m.playerId === me.id) continue;
    const f = all.find((q) => q.playerId === m.playerId)?.fd;
    if (!f || f.k !== action || f.hp == null) { pairs.delete(m.playerId); continue; }
    const pr = pairs.get(m.playerId);
    const alive = c.respawnMs <= 0 && !f.rs;
    if (alive && (!pr || pr.mine !== mine || pr.theirs !== f.n)) {
      // 新配对：两边都刚刷出来、或者一个新的接上另一个
      if (!pr || pr.mine !== mine || f.n === pr.theirs + 1) pairs.set(m.playerId, { mine, theirs: f.n });
      continue;
    }
    if (!pr || pr.mine !== mine || c.respawnMs > 0) continue;
    if (f.n === pr.theirs && !f.rs) gap = Math.max(gap, c.monsterHp - f.hp);
    // 他把配对的那只打死了（已经在等下一只）：自己这只也一起倒
    else if (f.n > pr.theirs || f.rs) gap = Math.max(gap, c.monsterHp);
  }
  // 这次刚收到、还没执行的队友伤害先扣掉
  const key = fieldKey(action);
  gap -= coopHits.reduce((n, h) => n + (h[0] === key ? h[1] : 0), 0);
  if (gap >= 1) { coopHit(key, Math.ceil(gap)); syncAt = Date.now(); }
}
