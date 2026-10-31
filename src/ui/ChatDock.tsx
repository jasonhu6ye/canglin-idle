import { useEffect, useRef, useState } from 'react';
import type { ChatChannel } from '../net';
import { online } from '../net';
import { channelMsgs, closeChat, openChat, send, useSocial } from '../net/social';
import { errText } from './Login';
import { tl } from '../i18n';

/**
 * 聊天页（10-25 用户要求单独一个页面）：世界 / 公会 / 队伍 / 私聊。好友在单独的好友页。
 * 地图左下角只留一行最新消息，点了打开这一页。
 */
const CH: [ChatChannel, string][] = [['world', tl('世界')], ['guild', tl('公会')], ['party', tl('队伍')], ['private', tl('私聊')]];
const CH_NAME = Object.fromEntries(CH) as Record<ChatChannel, string>;
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

type Fn = () => void;
const fns = new Set<Fn>();
/** 打开聊天页（App 切到聊天标签） */
export const openChatPage = (channel?: ChatChannel, to?: string | null) => { openChat(channel, to); fns.forEach((f) => f()); };
export const onOpenChatPage = (f: Fn) => { fns.add(f); return () => { fns.delete(f); }; };

/** 点聊天里的名字弹玩家名片（App 里接住，和地图上点人一样） */
export const PLAYER_CARD = 'canglin-player-card';
const openCard = (id: string) => window.dispatchEvent(new CustomEvent(PLAYER_CARD, { detail: id }));

/** 世界频道发言间隔（防刷屏） */
const WORLD_GAP = 3000;
/** 快捷短语（手机上不用打字） */
const QUICK = [tl('组队吗？'), tl('谢谢！'), tl('求带'), tl('哈哈'), tl('晚安'), '👍', '🎃'];
/** 两条消息隔多久算一段（分段处显示时间） */
const GROUP_GAP = 5 * 60_000;
const dayText = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return same(d, today) ? tl('今天') : same(d, y) ? tl('昨天') : d.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
};

export function ChatChip() {
  const st = useSocial();
  const last = st.msgs[st.msgs.length - 1];
  // 来新消息时闪一下
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!last) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [last?.id]);
  if (!online.me()) return null;
  const unread = Object.values(st.unread).reduce((a, b) => a + b, 0);
  return (
    <button className={`chip dim log-chip chat-chip ${flash ? 'flash' : ''}`} title={tl("聊天 (Enter)")} onClick={() => openChatPage()}>
      💬 <span className="chat-last">{last ? <><span className={`ch-tag ch-${last.channel}`}>{CH_NAME[last.channel]}</span> <b className="chat-name">{last.name}</b>{tl`：${last.text}`}</> : tl('聊天')}</span>
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
  const [lastSent, setLastSent] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [seenLen, setSeenLen] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const friends = st.friends.filter((f) => f.accepted);
  const shown = channelMsgs(st.channel, st.to);
  // 打开着这一页时，当前频道的新消息不算未读
  useEffect(() => { openChat(); return closeChat; }, []);
  const toBottom = () => { box.current?.scrollTo(0, box.current.scrollHeight); setAtBottom(true); setSeenLen(shown.length); };
  // 在底部才跟着滚；往上翻着看旧消息时不打断，下面出一个「新消息」按钮
  useEffect(() => { if (atBottom) toBottom(); }, [shown.length]);
  useEffect(() => { toBottom(); }, [st.channel, st.to]);
  if (!me) {
    return (
      <div className="page guild chat-page">
        <div className="sheet-head"><button className="back" onClick={onClose}>{tl('‹ 返回')}</button><h2>{tl('聊天')}</h2></div>
        <p className="muted">{tl('离线游玩中，连上服务器后才能聊天。可以在「更多 → 设置」里重新连接。')}</p>
      </div>
    );
  }
  const nameOf = (id?: string) => friends.find((f) => f.playerId === id)?.name ?? '?';
  const blocked = st.channel === 'guild' && !me.guildId ? tl('还没加入公会。按 G 或点底部「公会」加入一个')
    : st.channel === 'party' && !st.party ? tl('还没有队伍。在底部「好友」页邀请好友组队')
    : st.channel === 'private' && !friends.length ? tl('还没有好友。在底部「好友」页输入对方的 ID 加好友') : '';
  const submit = async (raw = text) => {
    const t = raw.trim();
    if (!t || busy || blocked) return;
    if (st.channel === 'world' && Date.now() < lastSent + WORLD_GAP) { setErr(tl('说话太快了，等几秒再发')); return; }
    setBusy(true); setErr('');
    try {
      await send(t);
      if (raw === text) setText('');
      setLastSent(Date.now());
      toBottom();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); input.current?.focus(); }
  };
  const fresh = Math.max(0, shown.length - seenLen);
  const onScroll = () => {
    const b = box.current;
    if (!b) return;
    const bottom = b.scrollHeight - b.scrollTop - b.clientHeight < 24;
    setAtBottom(bottom);
    if (bottom) setSeenLen(shown.length);
  };
  const count = online.onlineCount();
  return (
    <div className="page guild chat-page">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('聊天')}</h2>
        <small className="muted">{count != null && <>{tl`在线 ${count} 人`} · </>}{tl('我的 ID ')}{me.pid}</small>
      </div>
      <div className="tabs-row">
        {CH.map(([id, name]) => (
          <button key={id} className={`pill ${st.channel === id ? 'on' : ''}`}
            onClick={() => openChat(id, id === 'private' ? st.to ?? friends[0]?.playerId ?? null : undefined)}>
            <span className={`ch-${id}`}>{name}</span>{st.unread[id] > 0 && <b className="badge">{st.unread[id]}</b>}
          </button>
        ))}
      </div>
      {st.channel === 'private' && friends.length > 0 && (
        <select className="chat-to" value={st.to ?? ''} onChange={(e) => openChat('private', e.target.value)}>
          {!st.to && <option value="">{tl('选择好友…')}</option>}
          {friends.map((f) => <option key={f.playerId} value={f.playerId}>{tl`${f.name}（#${f.pid}）`}</option>)}
        </select>
      )}
      <div className="chat-wrap">
        <div className="chat-box frame" ref={box} onScroll={onScroll}>
          {blocked ? <p className="muted">{blocked}</p> : !shown.length && <p className="muted chat-empty">{st.channel === 'world' ? tl('还没有消息，打个招呼吧') : tl('还没有消息')}</p>}
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const mine = m.playerId === me.id;
            const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
            const newGroup = newDay || !prev || prev.playerId !== m.playerId || m.at - prev.at > GROUP_GAP;
            const card = !mine && online.presenceOf(m.playerId);
            const who = m.channel === 'private' && mine ? tl`你 → ${nameOf(m.toId)}` : mine ? tl('我') : m.name;
            return (
              <div key={m.id} className={`chat-msg ${mine ? 'me' : ''} ${newGroup ? 'first' : ''}`}>
                {newDay && <div className="chat-day"><span>{dayText(m.at)}</span></div>}
                {newGroup && (
                  <div className="chat-head">
                    {card ? <button className={`chat-who ch-${m.channel}`} onClick={() => openCard(m.playerId)}>{who}</button>
                      : <b className={`chat-who ch-${m.channel}`}>{who}</b>}
                    <small className="muted">{time(m.at)}</small>
                  </div>
                )}
                <div className="chat-text">{m.text}</div>
              </div>
            );
          })}
        </div>
        {!atBottom && (
          <button className="chat-jump" onClick={toBottom}>{fresh > 0 ? tl`${fresh} 条新消息 ↓` : tl('回到最新 ↓')}</button>
        )}
      </div>
      {!blocked && (
        <div className="chat-quick">
          {QUICK.map((q) => <button key={q} disabled={busy} onClick={() => void submit(q)}>{q}</button>)}
        </div>
      )}
      <form className="search-row chat-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input ref={input} placeholder={tl`发到${CH_NAME[st.channel]}${st.channel === 'private' && st.to ? tl`（${nameOf(st.to)}）` : ''}`} maxLength={200}
          value={text} disabled={!!blocked} onChange={(e) => { setText(e.target.value); setErr(''); }} enterKeyHint="send" />
        {text.length > 150 && <small className="chat-count muted">{text.length}/200</small>}
        <button className="primary" disabled={busy || !!blocked || !text.trim()}>{tl('发送')}</button>
      </form>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
