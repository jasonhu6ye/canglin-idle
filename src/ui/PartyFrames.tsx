import { useEffect, useState } from 'react';
import { online } from '../net';
import { sendRally, useSocial } from '../net/social';
import { tl } from '../i18n';
import { actionName } from './format';
import { emitToGame } from './GameCanvas';
import { ACTIONS } from '../core/data';
import { startNow, walkPos } from '../core/sim';
import { store } from '../store';
import { portrait } from './hud';
import { setAutoGate } from './Dungeon';

/** 召集只认最近 2 分钟的，刷新页面不会被旧召集拉走 */
const RALLY_FRESH = 120_000;
let answered = 0;
/** 自动跟随队长（用户 10-25）：跟着队长走，队长打哪只怪就一起打 */
const FOLLOW_KEY = 'canglin-follow-leader';
let follow = (() => { try { return localStorage.getItem(FOLLOW_KEY) === '1'; } catch { return false; } })();
let lastChase = 0;
let chaseTo: { x: number; y: number } | null = null;

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
  // 跟随队长：队长在打怪就开打同一只（角色会自己走过去）；没在打怪就走到队长身边
  const [followOn, setFollowOn] = useState(follow);
  const toggleFollow = () => {
    follow = !follow;
    setFollowOn(follow);
    try { localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0'); } catch { /* 存不了就算了 */ }
    if (!follow) setAutoGate(null);
    setNote(follow ? tl('开始跟随队长：跟着队长走，队长打哪只怪就一起打') : tl('已停止跟随队长'));
  };
  useEffect(() => {
    if (!followOn || !leader) return;
    const s = store.state;
    if (s.dungeon || s.home?.inside) return;
    // 队长进了副本（用户 10-26：以前队员走到洞口就发呆）：走到同一个洞口进去，阵亡了也会再走回来
    if (leader.dg?.gate) {
      if (!s.gatesUsed?.includes(leader.dg.gate)) setAutoGate(leader.dg.gate, 'follow');
      return;
    }
    const a = leader.action ? ACTIONS[leader.action] : undefined;
    if (a?.kind === 'combat') {
      if (s.queue[0]?.action !== leader.action || s.paused) store.dispatch((g) => startNow(g, leader.action!, { type: 'infinite' }));
      return;
    }
    const me = walkPos(s);
    const far = Math.abs(leader.x - me.x) + Math.abs(leader.y - me.y) > 3;
    // 远路重新规划很费时：还在往队长那边走、队长也没走远，就不重算（以前每 3 秒重算一次，远路会一顿一顿的）
    const moved = !chaseTo || Math.hypot(leader.x - chaseTo.x, leader.y - chaseTo.y) > 6;
    if (far && (moved || !s.walk) && Date.now() - lastChase > 3000) {
      lastChase = Date.now();
      chaseTo = { x: leader.x, y: leader.y };
      emitToGame('walktile', leader.x, leader.y);
    }
  }, [followOn, leader?.x, leader?.y, leader?.action, leader?.dg?.gate, store.state.dungeon?.gate.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
              {p && <span className="bar"><i style={{ width: `${pct}%` }} /></span>}
              <small className="pf-hp">{p ? (max > 0 ? `${p.hp ?? max}/${max}` : '') : tl('不在线')}</small>
            </span>
          </button>
        );
      })}
      {!lead && party && <button className={`pill pf-rally ${followOn ? 'on' : ''}`} onClick={toggleFollow}>{followOn ? tl('跟随队长中（点击停止）') : tl('跟随队长')}</button>}
      {lead && <button className="pill pf-rally" onClick={() => { sendRally(); setNote(tl('已发出召集，在线队友会自动寻路到你身边')); }}>{tl('召集队友')}</button>}
      {note && <div className="chip pf-note">{note}</div>}
    </div>
  );
}
