import { setPartySize } from '../core/party';
import { useEffect, useState } from 'react';
import { online, type ChatChannel, type ChatMsg, type Friend, type Party, type PartyInvite, type Trade } from './index';
import { ITEMS } from '../core/data';
import { store } from '../store';

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
const emit = () => {
  // 组队经验加成按队伍人数算（用户 10-25）
  setPartySize(st.party?.members.length ?? 0);
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
    st.msgs = [...st.msgs, m].sort((a, b) => a.at - b.at).slice(-KEEP);
    const seen = st.open && st.channel === m.channel && (m.channel !== 'private' || st.to === m.playerId || m.playerId === me.id);
    if (!seen && m.playerId !== me.id && Date.now() - m.at < 60_000) st.unread[m.channel]++;
    emit();
  }));
  offs.push(online.onSocial(() => void refreshSocial()));
  void refreshSocial();
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

/** 成交了：先在服务器上登记领取（只成功一次），再从仓库扣掉给出去的、加上收到的 */
async function claim(t: Trade) {
  if (!(await online.claimTrade(t.id))) return;
  t.claimed = true;
  store.dispatch((g) => {
    const bank = { ...g.bank };
    for (const [id, n] of Object.entries(t.mine)) if (ITEMS[id]) bank[id] = Math.max(0, (bank[id] ?? 0) - n);
    for (const [id, n] of Object.entries(t.theirs)) if (ITEMS[id]) bank[id] = (bank[id] ?? 0) + n;
    for (const id of Object.keys(bank)) if (!bank[id]) delete bank[id];
    return { ...g, bank, seen: { ...g.seen, ...Object.fromEntries(Object.keys(t.theirs).filter((id) => ITEMS[id]).map((id) => [id, 1 as const])) } };
  });
  emit();
}

/** 仓库里够不够放上交易台 */
export function lacking(items: Record<string, number>) {
  const bank = store.state.bank;
  return Object.entries(items).filter(([id, n]) => (bank[id] ?? 0) < n).map(([id]) => ITEMS[id]?.name ?? id);
}
