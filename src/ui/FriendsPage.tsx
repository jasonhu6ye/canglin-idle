import { useEffect, useMemo, useState } from 'react';
import { ITEMS } from '../core/data';
import type { GameState } from '../core/types';
import { online, type Friend, type Trade } from '../net';
import { lacking, refreshSocial, useSocial } from '../net/social';
import { pushNow, useOnline } from '../net/sync';
import { openChatPage } from './ChatDock';
import { fmtNum } from './format';
import { Icon } from './icons';
import { errText } from './Login';

/**
 * 好友页（10-25 用户要求）：按 ID 加好友、看好友信息、邀请组队、和好友交易。
 * 交易：双方各从仓库放东西，都点确认才成交，改了东西要重新确认。
 */

function useAct() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await f(); await refreshSocial(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

const ago = (t?: number) => {
  if (!t) return '很久没上线';
  const m = Math.floor((Date.now() - t) / 60_000);
  return m < 60 ? `${Math.max(1, m)} 分钟前在线` : m < 1440 ? `${Math.floor(m / 60)} 小时前在线` : `${Math.floor(m / 1440)} 天前在线`;
};

export function FriendsPage({ s, onClose }: { s: GameState; onClose: () => void }) {
  const { me } = useOnline();
  const st = useSocial();
  const [pick, setPick] = useState<string | null>(null);
  const [pid, setPid] = useState('');
  const [note, setNote] = useState('');
  const act = useAct();
  const [, tick] = useState(0);
  useEffect(() => { void refreshSocial(); const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  if (!me) {
    return (
      <div className="page guild">
        <div className="sheet-head"><button className="back" onClick={onClose}>‹ 返回</button><h2>好友</h2></div>
        <p className="muted">离线游玩中，连上服务器后才能加好友。可以在「更多 → 设置」里重新连接。</p>
      </div>
    );
  }
  const onlineIds = online.onlineIds();
  const mine = st.friends.filter((f) => f.accepted)
    .sort((a, b) => Number(onlineIds.has(b.playerId)) - Number(onlineIds.has(a.playerId)) || (b.totalLevel ?? 0) - (a.totalLevel ?? 0));
  const incoming = st.friends.filter((f) => !f.accepted && f.incoming);
  const outgoing = st.friends.filter((f) => !f.accepted && !f.incoming);
  const sel = mine.find((f) => f.playerId === pick);
  if (sel) return <FriendDetail s={s} f={sel} online={onlineIds.has(sel.playerId)} onBack={() => setPick(null)} />;
  const openTrades = st.trades.filter((t) => t.status === 'open');
  const add = () => {
    const n = Number(pid.replace(/\D/g, ''));
    if (!n) { act.setErr('输入对方的数字 ID'); return; }
    setNote('');
    void act.run(async () => {
      const r = await online.addFriend(n);
      setPid('');
      setNote(r === 'accepted' ? '对方也加过你，已经是好友了' : '好友申请已发送，等对方同意');
    });
  };
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>好友</h2>
        <small className="muted">{mine.filter((f) => onlineIds.has(f.playerId)).length} / {mine.length} 在线</small>
      </div>
      <div className="frame guild-card my-id">
        <div>
          <small className="muted">我的 ID（发给朋友加你好友）</small>
          <div className="id-row">
            <b className="pid">{me.pid ?? '—'}</b>
            {me.pid && <button className="small" onClick={() => { void navigator.clipboard?.writeText(String(me.pid)).then(() => setNote('已复制 ID')); }}>复制</button>}
          </div>
        </div>
      </div>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input inputMode="numeric" placeholder="输入对方的 ID 加好友" maxLength={12} value={pid} onChange={(e) => setPid(e.target.value)} />
        <button className="primary" disabled={act.busy}>加好友</button>
      </form>
      {note && <p className="muted small-note">{note}</p>}
      {act.err && <p className="err">{act.err}</p>}

      {(incoming.length > 0 || st.invites.length > 0 || openTrades.length > 0) && <h3>待处理</h3>}
      <ul className="guild-list">
        {incoming.map((f) => (
          <li key={f.playerId}>
            <span>{f.name} <small className="muted">#{f.pid} 想加你好友</small></span>
            <span className="row-tools">
              <button className="small primary" disabled={act.busy} onClick={() => act.run(() => online.answerFriend(f.playerId, true))}>同意</button>
              <button className="small" disabled={act.busy} onClick={() => act.run(() => online.answerFriend(f.playerId, false))}>拒绝</button>
            </span>
          </li>
        ))}
        {st.invites.map((i) => (
          <li key={i.partyId}>
            <span>{i.fromName} <small className="muted">邀请你组队</small></span>
            <span className="row-tools">
              <button className="small primary" disabled={act.busy} onClick={() => act.run(() => online.answerParty(i.partyId, true))}>加入</button>
              <button className="small" disabled={act.busy} onClick={() => act.run(() => online.answerParty(i.partyId, false))}>拒绝</button>
            </span>
          </li>
        ))}
        {openTrades.map((t) => {
          const f = mine.find((x) => x.playerId === t.otherId);
          return (
            <li key={t.id}>
              <span>和 {f?.name ?? '?'} 的交易 <small className="muted">{t.theirOk ? '对方已确认' : t.myOk ? '等对方确认' : '进行中'}</small></span>
              <button className="small primary" onClick={() => setPick(t.otherId)}>查看</button>
            </li>
          );
        })}
      </ul>

      {st.party && (
        <>
          <h3>我的队伍 <small className="muted">{st.party.members.length} / 5</small></h3>
          <ul className="guild-list">
            {st.party.members.map((m) => (
              <li key={m.playerId}>
                <span>{m.name}{m.playerId === me.id && <small className="muted">（你）</small>}</span>
                <small className="muted">{m.playerId === st.party!.leader ? '队长' : '队员'}</small>
              </li>
            ))}
          </ul>
          <div className="go">
            <button onClick={() => openChatPage('party')}>队伍聊天</button>
            <button disabled={act.busy} onClick={() => confirm('退出队伍？') && void act.run(() => online.leaveParty())}>退出队伍</button>
          </div>
        </>
      )}

      <h3>好友 <small className="muted">{mine.length}</small></h3>
      <ul className="guild-list friend-list">
        {!mine.length && <li className="ghost">还没有好友，把你的 ID 发给朋友吧</li>}
        {mine.map((f) => {
          const on = onlineIds.has(f.playerId);
          return (
            <li key={f.playerId} className="clickable" onClick={() => setPick(f.playerId)}>
              <span><i className={`dot ${on ? 'on' : ''}`} />{f.guildTag && <small className="muted">[{f.guildTag}] </small>}{f.name}</span>
              <small className="muted">{f.totalLevel != null ? `总等级 ${f.totalLevel} · ` : ''}{on ? '在线' : ago(f.lastSeen)} ›</small>
            </li>
          );
        })}
        {outgoing.map((f) => (
          <li key={f.playerId} className="ghost">
            <span>{f.name} <small className="muted">#{f.pid}</small></span>
            <span className="row-tools">
              <small className="muted">等对方同意</small>
              <button className="small" disabled={act.busy} onClick={() => act.run(() => online.removeFriend(f.playerId))}>撤回</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FriendDetail({ s, f, online: on, onBack }: { s: GameState; f: Friend; online: boolean; onBack: () => void }) {
  const st = useSocial();
  const act = useAct();
  const [note, setNote] = useState('');
  const trade = st.trades.find((t) => t.otherId === f.playerId && (t.status === 'open' || (t.status === 'done' && Date.now() - t.updatedAt < 60_000)));
  const inParty = st.party?.members.some((m) => m.playerId === f.playerId);
  const partyFull = (st.party?.members.length ?? 0) >= 5;
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onBack}>‹ 好友</button>
        <h2>{f.name}</h2>
        <small className="muted">#{f.pid}</small>
      </div>
      <div className="frame friend-card">
        <div><small>状态</small><b className={on ? 'good' : ''}>{on ? '在线' : ago(f.lastSeen)}</b></div>
        <div><small>总等级</small><b>{f.totalLevel ?? '—'}</b></div>
        <div><small>战斗等级</small><b>{f.combat ?? '—'}</b></div>
        <div><small>公会</small><b>{f.guildTag ? `[${f.guildTag}]` : '无'}</b></div>
      </div>
      <div className="go friend-actions">
        <button className="primary" onClick={() => openChatPage('private', f.playerId)}>私聊</button>
        <button disabled={act.busy || inParty || partyFull} onClick={() => act.run(async () => { await online.inviteParty(f.playerId); setNote(`已邀请 ${f.name} 组队，等对方同意`); })}>
          {inParty ? '已在队伍里' : '邀请组队'}
        </button>
        <button disabled={act.busy || !!trade} onClick={() => act.run(() => online.startTrade(f.playerId))}>发起交易</button>
      </div>
      {note && <p className="muted small-note">{note}</p>}
      {act.err && <p className="err">{act.err}</p>}
      {trade && <TradeView s={s} t={trade} name={f.name} />}
      <div className="go">
        <button className="danger" disabled={act.busy} onClick={() => confirm(`删除好友 ${f.name}？`) && void act.run(async () => { await online.removeFriend(f.playerId); onBack(); })}>删除好友</button>
      </div>
    </div>
  );
}

function Items({ items, onRemove }: { items: Record<string, number>; onRemove?: (id: string) => void }) {
  const list = Object.entries(items).filter(([id]) => ITEMS[id]);
  if (!list.length) return <p className="muted small-note">还没放东西</p>;
  return (
    <ul className="trade-items">
      {list.map(([id, n]) => (
        <li key={id}>
          <Icon item={id} size={24} />
          <span className="nm">{ITEMS[id].name}</span>
          <b>×{fmtNum(n)}</b>
          {onRemove && <button className="small" onClick={() => onRemove(id)}>拿回</button>}
        </li>
      ))}
    </ul>
  );
}

function TradeView({ s, t, name }: { s: GameState; t: Trade; name: string }) {
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const setOffer = (items: Record<string, number>) => act.run(() => online.setOffer(t.id, items));
  if (t.status === 'done') {
    return (
      <div className="frame trade done">
        <b className="good">交易完成</b>
        <p className="muted small-note">收到的东西已经放进仓库。</p>
        <Items items={t.theirs} />
      </div>
    );
  }
  const short = lacking(t.mine);
  return (
    <div className="frame trade">
      <div className="trade-cols">
        <div>
          <h4>我放的 {t.myOk && <small className="good">✓ 已确认</small>}</h4>
          <Items items={t.mine} onRemove={t.myOk ? undefined : (id) => { const m = { ...t.mine }; delete m[id]; void setOffer(m); }} />
          {!t.myOk && <button className="small" onClick={() => setAdding(true)}>＋ 从仓库放东西</button>}
        </div>
        <div>
          <h4>{name} 放的 {t.theirOk && <small className="good">✓ 已确认</small>}</h4>
          <Items items={t.theirs} />
        </div>
      </div>
      {short.length > 0 && <p className="err">仓库里不够：{short.join('、')}</p>}
      <p className="muted small-note">东西从仓库出、进仓库。任何一方改了东西，双方都要重新确认。</p>
      <div className="go">
        {t.myOk
          ? <button disabled={act.busy} onClick={() => act.run(() => online.confirmTrade(t.id, false))}>取消确认</button>
          : <button className="primary" disabled={act.busy || short.length > 0} onClick={() => act.run(async () => { if ((await online.confirmTrade(t.id, true)) === 'done') void pushNow(); })}>确认交易</button>}
        <button disabled={act.busy} onClick={() => confirm('取消这笔交易？') && void act.run(() => online.cancelTrade(t.id))}>取消交易</button>
      </div>
      {act.err && <p className="err">{act.err}</p>}
      {adding && <BankPicker s={s} have={t.mine} onClose={() => setAdding(false)} onPick={(id, n) => { setAdding(false); void setOffer({ ...t.mine, [id]: n }); }} />}
    </div>
  );
}

/** 从仓库挑东西放上交易台 */
function BankPicker({ s, have, onPick, onClose }: { s: GameState; have: Record<string, number>; onPick: (id: string, n: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [n, setN] = useState('1');
  const list = useMemo(() => Object.entries(s.bank)
    .filter(([id, c]) => c > 0 && ITEMS[id] && (!q || ITEMS[id].name.includes(q)))
    .sort((a, b) => (a[0] === 'coins' ? -1 : b[0] === 'coins' ? 1 : ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name))), [s.bank, q]);
  const max = sel ? s.bank[sel] ?? 0 : 0;
  return (
    <div className="bank-picker frame">
      <div className="search-row">
        <input placeholder="搜索仓库里的物品" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={onClose}>关闭</button>
      </div>
      <ul className="trade-items pick">
        {list.length === 0 && <li className="muted">仓库里没有</li>}
        {list.map(([id, c]) => (
          <li key={id} className={sel === id ? 'on' : ''} onClick={() => { setSel(id); setN(String(have[id] ?? Math.min(c, 1))); }}>
            <Icon item={id} size={24} info={false} />
            <span className="nm">{ITEMS[id].name}</span>
            <small className="muted">仓库 {fmtNum(c)}</small>
          </li>
        ))}
      </ul>
      {sel && (
        <form className="search-row" onSubmit={(e) => { e.preventDefault(); const v = Math.floor(Number(n)); if (v > 0 && v <= max) onPick(sel, v); }}>
          <span className="pick-name">{ITEMS[sel].name}</span>
          <input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} />
          <button type="button" onClick={() => setN(String(max))}>全部</button>
          <button className="primary" disabled={!(Number(n) > 0 && Number(n) <= max)}>放上去</button>
        </form>
      )}
    </div>
  );
}
