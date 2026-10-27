import { useEffect, useState } from 'react';
import { online, type Party, type Presence } from '../net';
import { sendRally, useSocial } from '../net/social';
import { tl } from '../i18n';
import { actionName } from './format';
import { emitToGame, onGameEvent } from './GameCanvas';
import { ACTIONS, nodesOfAction } from '../core/data';
import type { GameState } from '../core/types';
import { MANUAL_MOVE } from '../game/MapScene';
import { leaveWork, level, startAt, toggleMount, walkPos } from '../core/sim';
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
 * 跟随站位（用户 10-27）：队员按名单顺序站在队长身边不同的格子，不再全挤在队长右边同一格。
 * [dx, dy] 格，相对队长
 */
const FOLLOW_SLOTS: [number, number][] = [[-1, 1], [1, 1], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1]];

/** 跟随时自己开始的那个任务（打怪、采集）：队长换了事，自己也停下；不是它、也不是队长在做的，就是玩家自己安排的 */
let ours: string | null = null;
/** 是跟随时自动骑上的坐骑（到了队长身边、队长下马了就跟着下） */
let autoMounted = false;

/** 队长做的事里，队员能一起做的采集（不耗材料、等级够） */
function canJoin(s: GameState, action: string) {
  const a = ACTIONS[action];
  return a?.kind === 'skill' && !a.inputs?.length && a.skill !== 'farming' && level(s, a.skill) >= a.level;
}
/** 离队长最近的那个地点（同一个动作可能有好几处，要去队长那一处） */
function nodeNear(action: string, x: number, y: number) {
  let best: string | undefined;
  let d = Infinity;
  for (const n of nodesOfAction(action)) {
    const e = Math.abs(n.x - x) + Math.abs(n.y - y);
    if (e < d) { d = e; best = n.id; }
  }
  return d <= 12 ? best : undefined;
}

/**
 * 跟随队长的一步（10-27 重做）：返回给队伍栏显示的状态，'manual' 表示玩家自己安排了别的事。
 * - 队长进副本：走到同一个洞口进去
 * - 队长打怪 / 采集：去队长那一处（不是离自己最近的同名地点）一起做；采集等级不够就站在旁边
 * - 队长换了事或走了：自己跟着停下，走到队长身边自己的站位
 * - 队长骑坐骑走远：有坐骑也骑上；到了、队长下马了也跟着下
 */
function followStep(leader: Presence, party: Party): string | 'manual' {
  const s = store.state;
  if (s.dungeon) return tl('在副本里跟着队长');
  if (s.home?.inside) return tl('在家园里，出来后接着跟');
  const cur = s.paused ? undefined : s.queue[0]?.action;
  if (cur && cur !== ours && cur !== leader.action) return 'manual';
  if (leader.dg?.gate) {
    if (!s.gatesUsed?.includes(leader.dg.gate)) setAutoGate(leader.dg.gate, 'follow');
    return tl('队长在副本里，正在赶往洞口');
  }
  const act = leader.action;
  const a = act ? ACTIONS[act] : undefined;
  const join = act && (a?.kind === 'combat' || canJoin(s, act)) ? act : undefined;
  const node = join ? nodeNear(join, leader.x, leader.y) : undefined;
  if (join && node) {
    ours = join;
    if (cur !== join) store.dispatch((g) => startAt(g, join, node));
    return a?.kind === 'combat' ? tl`和队长一起打 ${actionName(join)}` : tl`和队长一起 ${actionName(join)}`;
  }
  // 队长换了事、走开了（以前队员会留在原地一直打）：自己也停下，跟上去
  if (ours && cur === ours) store.dispatch(leaveWork);
  ours = null;
  const me = walkPos(s);
  const i = Math.max(0, party.members.filter((m) => m.playerId !== party.leader).findIndex((m) => m.playerId === online.me()?.id));
  const [ox, oy] = FOLLOW_SLOTS[i % FOLLOW_SLOTS.length];
  const spot = { x: Math.round(leader.x) + ox, y: Math.round(leader.y) + oy };
  const gap = Math.abs(leader.x - me.x) + Math.abs(leader.y - me.y);
  if (gap <= 3 && !s.walk) {
    if (autoMounted && s.mounted && !leader.mounted) store.dispatch((g) => toggleMount(g, false));
    autoMounted = false;
    chaseTo = null;
    return act ? tl`在队长身边（队长在${actionName(act)}，你等级不够一起做）` : tl('在队长身边');
  }
  const far = tl`正在赶往队长身边（${Math.round(gap)} 格）`;
  // 已经在往站位走、队长也没走远就不重算路：远路规划很费时，离得越远越不用算得勤
  const moved = !chaseTo || Math.hypot(spot.x - chaseTo.x, spot.y - chaseTo.y) > Math.max(3, gap * 0.25);
  if ((!moved && s.walk) || Date.now() - lastChase < 1200) return far;
  // 队长骑着坐骑走远路：自己有坐骑也骑上，不然越落越远
  if (leader.mounted && !s.mounted && s.equipment.mount && gap > 12) {
    store.dispatch((g) => toggleMount(g, true));
    autoMounted = true;
    lastChase = Date.now() - 600;
    return far;
  }
  lastChase = Date.now();
  chaseTo = spot;
  emitToGame('walktile', spot.x, spot.y, true);
  return far;
}

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
  const [status, setStatus] = useState('');
  const setFollow = (on: boolean, msg?: string) => {
    follow = on;
    setFollowOn(on);
    try { localStorage.setItem(FOLLOW_KEY, on ? '1' : '0'); } catch { /* 存不了就算了 */ }
    if (!on) { setAutoGate(null); setStatus(''); }
    chaseTo = null;
    lastChase = 0;
    // 打开跟随时手上的事算跟随接管的：队长做别的就停下它，不算玩家自己安排的
    ours = on && !store.state.paused ? store.state.queue[0]?.action ?? null : null;
    setNote(msg ?? (on ? tl('开始跟随队长：跟着队长走，队长打怪、采集你也一起') : tl('已停止跟随队长')));
  };
  // 自己点地图走开、按方向键（10-27）：像网游一样断开跟随，免得被拉回去
  useEffect(() => onGameEvent(MANUAL_MOVE, () => { if (follow) setFollow(false, tl('你自己走动了，已停止跟随队长')); }), []);
  // 不只在收到队长位置时看一次：每 0.7 秒检查一下，路被打断、队长停着不动时也能接着跟
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!followOn) return;
    const t = setInterval(() => setTick((n) => n + 1), 700);
    return () => clearInterval(t);
  }, [followOn]);
  useEffect(() => {
    if (!followOn || !party) return;
    if (!leader) { setStatus(tl('队长不在线，等他回来')); return; }
    const r = followStep(leader, party);
    if (r === 'manual') return setFollow(false, tl('你自己安排了别的事，已停止跟随队长'));
    setStatus(r);
  }, [followOn, tick, leader?.x, leader?.y, leader?.action, leader?.dg?.gate, store.state.dungeon?.gate.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {!lead && party && <button className={`pill pf-rally ${followOn ? 'on' : ''}`} onClick={() => setFollow(!followOn)}>{followOn ? tl('跟随队长中（点击停止）') : tl('跟随队长')}</button>}
      {!lead && party && followOn && status && <div className="pf-status muted">{status}</div>}
      {lead && <button className="pill pf-rally" onClick={() => { sendRally(); setNote(tl('已发出召集，在线队友会自动寻路到你身边')); }}>{tl('召集队友')}</button>}
      {note && <div className="chip pf-note">{note}</div>}
    </div>
  );
}
