import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { online } from '../net';
import { refreshSocial, useSocial } from '../net/social';
import { tl } from '../i18n';
import { TradeView } from './FriendsPage';
import { errText } from './Login';

/**
 * 屏幕中间弹出的交易窗和组队邀请（用户 10-25）。
 * 有新的交易或邀请会自动弹出；点 ✕ 只是先关掉，之后还能在好友页里处理。
 */

type Fn = () => void;
const fns = new Set<Fn>();
let shown: string | null = null;
const dismissed = new Set<string>();
const bumpAll = () => fns.forEach((f) => f());
/** 打开某笔交易的弹窗 */
export const openTrade = (id: string) => { shown = id; dismissed.delete(id); bumpAll(); };

function useBump() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); fns.add(f); return () => { fns.delete(f); }; }, []);
  return () => set((n) => n + 1);
}

function useEsc(onClose: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [on, onClose]);
}

export function TradePopup({ s }: { s: GameState }) {
  const st = useSocial();
  const bump = useBump();
  useEffect(() => {
    const cur = shown && st.trades.find((t) => t.id === shown);
    if (cur && cur.status !== 'cancelled') return;
    const next = st.trades.find((t) => t.status === 'open' && !dismissed.has(t.id));
    if (next) { shown = next.id; bump(); }
  }, [st.trades]);
  const close = () => { if (shown) dismissed.add(shown); shown = null; bump(); };
  useEsc(close, !!shown);
  if (!shown) return null;
  const t = st.trades.find((x) => x.id === shown);
  const other = t && st.friends.find((f) => f.playerId === t.otherId);
  const name = other?.name ?? (t && online.presenceOf(t.otherId)?.name) ?? '?';
  return (
    <div className="modal-back center-pop-back trade-pop-back" onClick={close}>
      <div className="center-pop frame" onClick={(e) => e.stopPropagation()}>
        <div className="pp-head">
          <b>{tl`和 ${name} 交易`}</b>
          <button className="pill" onClick={close}>✕</button>
        </div>
        {t && t.status !== 'cancelled'
          ? <TradeView s={s} t={t} name={name} />
          : <p className="muted small-note">{tl('这笔交易已经取消了。')}</p>}
      </div>
    </div>
  );
}

export function PartyInvitePopup() {
  const st = useSocial();
  const bump = useBump();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inv = st.invites.find((i) => !dismissed.has(`party:${i.partyId}`));
  const close = () => { if (inv) dismissed.add(`party:${inv.partyId}`); setErr(''); bump(); };
  useEsc(close, !!inv && !shown);
  if (!inv || shown) return null;
  const answer = async (yes: boolean) => {
    setBusy(true); setErr('');
    try { await online.answerParty(inv.partyId, yes); await refreshSocial(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="modal-back center-pop-back" onClick={close}>
      <div className="center-pop frame" onClick={(e) => e.stopPropagation()}>
        <div className="pp-head">
          <b>{tl('组队邀请')}</b>
          <button className="pill" onClick={close}>✕</button>
        </div>
        <p>{tl`${inv.fromName} 邀请你加入队伍。`}</p>
        <p className="muted small-note">{tl('加入后队伍有自己的聊天频道；已经在别的队伍里要先退出。')}</p>
        <div className="go pp-actions">
          <button className="primary" disabled={busy} onClick={() => void answer(true)}>{tl('加入')}</button>
          <button disabled={busy} onClick={() => void answer(false)}>{tl('拒绝')}</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
