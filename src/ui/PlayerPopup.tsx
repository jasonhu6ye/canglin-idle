import { useEffect, useState } from 'react';
import { ITEMS } from '../core/data';
import { online, type Presence } from '../net';
import { refreshSocial, useSocial } from '../net/social';
import { tl } from '../i18n';
import { openChatPage } from './ChatDock';
import { emitToGame } from './GameCanvas';
import { actionName, joinedText } from './format';
import { Icon } from './icons';
import { errText } from './Login';
import { GEAR_SLOTS, gearStats, TOOL_SLOTS } from './panels';
import { openTrade } from './SocialPopups';

/** 地图上点别的玩家弹出的菜单（用户 10-25）：查看信息、装备，加好友、私聊、组队、交易 */
export function PlayerPopup({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const st = useSocial();
  const [p, setP] = useState<Presence | undefined>(() => online.presenceOf(playerId));
  const [view, setView] = useState<'info' | 'gear'>('info');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [joined, setJoined] = useState<number | null | undefined>(undefined);
  useEffect(() => { let live = true; online.joinedAt(playerId).then((t) => live && setJoined(t)).catch(() => live && setJoined(null)); return () => { live = false; }; }, [playerId]);
  // 对方还在线就跟着刷新
  useEffect(() => { const t = setInterval(() => setP(online.presenceOf(playerId) ?? p), 2000); return () => clearInterval(t); }, [playerId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!p) return null;
  const f = st.friends.find((x) => x.playerId === playerId);
  const friend = !!f?.accepted;
  const mate = !!st.party?.members.some((m) => m.playerId === playerId);
  const lead = st.party?.leader === online.me()?.id;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg('');
    try { await fn(); await refreshSocial(); setMsg(ok); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const needFriend = tl('先加好友才能私聊、组队和交易');
  const gear = [...GEAR_SLOTS, ...TOOL_SLOTS.map(([slot, name]) => [slot, name] as const)].filter(([slot]) => p.equip?.[slot] && ITEMS[p.equip[slot]!]);
  return (
    <div className="modal-back player-pop-back" onClick={onClose}>
      <div className="player-pop frame" onClick={(e) => e.stopPropagation()}>
        <div className="pp-head">
          <div>
            <b>{p.guildTag && <small className="muted">[{p.guildTag}] </small>}{p.name}</b>
            {p.pid && <small className="muted"> #{p.pid}</small>}
          </div>
          <button className="pill" onClick={onClose}>✕</button>
        </div>
        <div className="tabs-row">
          <button className={`pill ${view === 'info' ? 'on' : ''}`} onClick={() => setView('info')}>{tl('查看信息')}</button>
          <button className={`pill ${view === 'gear' ? 'on' : ''}`} onClick={() => setView('gear')}>{tl('查看装备')}</button>
        </div>
        {view === 'info' ? (
          <div className="friend-card">
            <div><small>{tl('总等级')}</small><b>{p.total ?? '—'}</b></div>
            <div><small>{tl('战斗等级')}</small><b>{p.combat ?? '—'}</b></div>
            <div><small>{tl('公会')}</small><b>{p.guildTag ? `[${p.guildTag}]` : tl('无')}</b></div>
            <div><small>{tl('正在')}</small><b className="pp-doing">{p.action ? actionName(p.action) : tl('空闲')}</b></div>
            <div><small>{tl('注册时间')}</small><b>{joined ? joinedText(joined).date : joined === undefined ? '…' : '—'}</b></div>
            <div><small>{tl('账号年龄')}</small><b>{joined ? joinedText(joined).age : joined === undefined ? '…' : '—'}</b></div>
          </div>
        ) : (
          <ul className="trade-items pp-gear">
            {!gear.length && <li className="muted">{tl('身上没有装备')}</li>}
            {gear.map(([slot, name]) => {
              const id = p.equip![slot]!;
              return (
                <li key={slot}>
                  <Icon item={id} size={24} />
                  <span className="nm">{ITEMS[id].name}<br /><small className="muted">{name}{gearStats(id) && ` · ${gearStats(id)}`}</small></span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="go pp-actions">
          <button className="primary" onClick={() => { emitToGame('walktile', p.x, p.y); onClose(); }}>{tl('寻路过去')}</button>
          {mate && lead && <button disabled={busy} onClick={() => confirm(tl`把队长转给 ${p.name}？`) && void run(() => online.promoteParty(playerId), tl`${p.name} 现在是队长了`)}>{tl('转让队长')}</button>}
          {mate && lead && <button disabled={busy} onClick={() => confirm(tl`把 ${p.name} 踢出队伍？`) && void run(async () => { await online.kickParty(playerId); onClose(); }, '')}>{tl('踢出队伍')}</button>}
          {!f && p.pid && <button className="primary" disabled={busy} onClick={() => run(() => online.addFriend(p.pid!), tl('好友申请已发送，等对方同意'))}>{tl('加好友')}</button>}
          {f && !f.accepted && f.incoming && <button className="primary" disabled={busy} onClick={() => run(() => online.answerFriend(playerId, true), tl('已经是好友了'))}>{tl('同意好友申请')}</button>}
          {f && !f.accepted && !f.incoming && <button disabled>{tl('等对方同意')}</button>}
          <button disabled={!friend} title={friend ? '' : needFriend} onClick={() => { openChatPage('private', playerId); onClose(); }}>{tl('私聊')}</button>
          {!mate && <button disabled={!friend || busy} title={friend ? '' : needFriend} onClick={() => run(() => online.inviteParty(playerId), tl`已邀请 ${p.name} 组队，等对方同意`)}>{tl('邀请组队')}</button>}
          <button disabled={!friend || busy} title={friend ? '' : needFriend}
            onClick={() => run(async () => { openTrade(await online.startTrade(playerId)); onClose(); }, '')}>{tl('交易')}</button>
        </div>
        {!friend && <p className="muted small-note">{needFriend}</p>}
        {msg && <p className="muted small-note">{msg}</p>}
      </div>
    </div>
  );
}
