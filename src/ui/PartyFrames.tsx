import { useEffect, useState } from 'react';
import { online } from '../net';
import { sendRally, useSocial } from '../net/social';
import { tl } from '../i18n';
import { actionName } from './format';
import { emitToGame } from './GameCanvas';
import { portrait } from './hud';

/** 召集只认最近 2 分钟的，刷新页面不会被旧召集拉走 */
const RALLY_FRESH = 120_000;
let answered = 0;

/**
 * 左上角队伍栏（用户 10-25）：队友头像、名字、血量，点一下看名片（能寻路过去）。
 * 队长能召集，队友收到后自动寻路到队长身边。
 */
export function PartyFrames({ onPick }: { onPick: (playerId: string) => void }) {
  const st = useSocial();
  const [, bump] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => online.onPresence(() => bump((n) => n + 1)), []);
  const me = online.me();
  const party = st.party;
  const lead = party?.leader === me?.id;
  const leader = party && !lead ? online.presenceOf(party.leader) : undefined;
  // 队长发了新的召集：寻路过去
  useEffect(() => {
    const r = leader?.rally;
    if (!leader || !r || r <= answered) return;
    answered = r;
    if (Date.now() - r > RALLY_FRESH) return;
    emitToGame('walktile', leader.x, leader.y);
    setNote(tl`队长 ${leader.name} 发起召集，正在赶过去`);
  }, [leader?.rally]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 6000); return () => clearTimeout(t); }, [note]);
  const mates = party?.members.filter((m) => m.playerId !== me?.id) ?? [];
  if (!mates.length) return null;
  return (
    <div className="party-frames">
      {mates.map((m) => {
        const p = online.presenceOf(m.playerId);
        const max = p?.maxHp ?? 0;
        const pct = p && max > 0 ? Math.max(0, Math.min(1, (p.hp ?? max) / max)) * 100 : 0;
        return (
          <button key={m.playerId} className={`party-frame ${p ? '' : 'off'}`} onClick={() => p && onPick(m.playerId)}
            title={p ? (p.action ? actionName(p.action) : tl('空闲')) : tl('不在线')}>
            <span className="avatar"><img src={portrait(p?.outfit)} alt="" /></span>
            <span className="pf-body">
              <span className="pf-name">
                {party!.leader === m.playerId && <span className="pf-lead" title={tl('队长')}>★</span>}
                {m.name}
                {p?.combat != null && <small> Lv{p.combat}</small>}
              </span>
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              <small className="pf-hp">{p ? (max > 0 ? `${p.hp ?? max}/${max}` : '') : tl('不在线')}</small>
            </span>
          </button>
        );
      })}
      {lead && <button className="pill pf-rally" onClick={() => { sendRally(); setNote(tl('已发出召集，在线队友会自动寻路到你身边')); }}>{tl('召集队友')}</button>}
      {note && <div className="chip pf-note">{note}</div>}
    </div>
  );
}
