import { useEffect, useRef, useState } from 'react';
import type { ChatChannel } from '../net';
import { online } from '../net';
import { channelMsgs, closeChat, openChat, send, useSocial } from '../net/social';
import { errText } from './Login';

/**
 * 聊天页（10-25 用户要求单独一个页面）：世界 / 公会 / 队伍 / 私聊。好友在单独的好友页。
 * 地图左下角只留一行最新消息，点了打开这一页。
 */
const CH: [ChatChannel, string][] = [['world', '世界'], ['guild', '公会'], ['party', '队伍'], ['private', '私聊']];
const CH_NAME = Object.fromEntries(CH) as Record<ChatChannel, string>;
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Fn = () => void;
const fns = new Set<Fn>();
/** 打开聊天页（App 切到聊天标签） */
export const openChatPage = (channel?: ChatChannel, to?: string | null) => { openChat(channel, to); fns.forEach((f) => f()); };
export const onOpenChatPage = (f: Fn) => { fns.add(f); return () => { fns.delete(f); }; };

export function ChatChip() {
  const st = useSocial();
  if (!online.me()) return null;
  const last = st.msgs[st.msgs.length - 1];
  const unread = Object.values(st.unread).reduce((a, b) => a + b, 0);
  return (
    <button className="chip dim log-chip chat-chip" title="聊天 (Enter)" onClick={() => openChatPage()}>
      💬 <span className="chat-last">{last ? <><span className={`ch-${last.channel}`}>[{CH_NAME[last.channel]}]</span> {last.name}：{last.text}</> : '聊天'}</span>
      {unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
      <u>▸</u>
    </button>
  );
}

export function ChatPage({ onClose }: { onClose: () => void }) {
  const st = useSocial();
  const me = online.me();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const friends = st.friends.filter((f) => f.accepted);
  const shown = channelMsgs(st.channel, st.to);
  // 打开着这一页时，当前频道的新消息不算未读
  useEffect(() => { openChat(); return closeChat; }, []);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [shown.length, st.channel, st.to]);
  if (!me) {
    return (
      <div className="page guild chat-page">
        <div className="sheet-head"><button className="back" onClick={onClose}>‹ 返回</button><h2>聊天</h2></div>
        <p className="muted">离线游玩中，连上服务器后才能聊天。可以在「更多 → 设置」里重新连接。</p>
      </div>
    );
  }
  const nameOf = (id?: string) => friends.find((f) => f.playerId === id)?.name ?? '?';
  const blocked = st.channel === 'guild' && !me.guildId ? '还没加入公会。按 G 或点底部「公会」加入一个'
    : st.channel === 'party' && !st.party ? '还没有队伍。在底部「好友」页邀请好友组队'
    : st.channel === 'private' && !friends.length ? '还没有好友。在底部「好友」页输入对方的 ID 加好友' : '';
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try { await send(t); setText(''); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="page guild chat-page">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>聊天</h2>
        <small className="muted">我的 ID {me.pid}</small>
      </div>
      <div className="tabs-row">
        {CH.map(([id, name]) => (
          <button key={id} className={`pill ${st.channel === id ? 'on' : ''}`}
            onClick={() => openChat(id, id === 'private' ? st.to ?? friends[0]?.playerId ?? null : undefined)}>
            <span className={`ch-${id}`}>{name}</span>{st.unread[id] > 0 && <b className="badge">{st.unread[id]}</b>}
          </button>
        ))}
      </div>
      <>
        {st.channel === 'private' && friends.length > 0 && (
          <select className="chat-to" value={st.to ?? ''} onChange={(e) => openChat('private', e.target.value)}>
            {!st.to && <option value="">选择好友…</option>}
            {friends.map((f) => <option key={f.playerId} value={f.playerId}>{f.name}（#{f.pid}）</option>)}
          </select>
        )}
        <div className="chat-box frame" ref={box}>
          {blocked ? <p className="muted">{blocked}</p> : !shown.length && <p className="muted">还没有消息</p>}
          {shown.map((m) => (
            <p key={m.id} className={m.playerId === me.id ? 'me' : ''}>
              <small className="muted">{time(m.at)}</small>{' '}
              {m.channel === 'private' && m.playerId === me.id ? <b>你 → {nameOf(m.toId)}</b> : <b className={`ch-${m.channel}`}>{m.name}</b>}：{m.text}
            </p>
          ))}
        </div>
        <form className="search-row" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input placeholder={`发到${CH_NAME[st.channel]}${st.channel === 'private' && st.to ? `（${nameOf(st.to)}）` : ''}，200 字以内`} maxLength={200}
            value={text} disabled={!!blocked} onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={busy || !!blocked || !text.trim()}>发送</button>
        </form>
        {err && <p className="err">{err}</p>}
      </>
    </div>
  );
}
