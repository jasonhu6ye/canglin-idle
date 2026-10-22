import { ACTIONS, MONSTERS, SKILLS } from '../core/data';
import { level, maxHp, removeTask } from '../core/sim';
import type { GameState, SkillId } from '../core/types';
import { store } from '../store';
import { emitToGame } from './GameCanvas';
import { actionName, fmtNum, modeLabel } from './format';

export function TopBar({ s }: { s: GameState }) {
  const total = (Object.keys(SKILLS) as SkillId[]).reduce((n, k) => n + level(s, k), 0);
  const hpPct = (s.hp / maxHp(s)) * 100;
  return (
    <header className="topbar">
      <span className="avatar">⛏</span>
      <span title="总等级">⚔ {total}</span>
      <span className="hp" title="生命">
        ♥ <span className="bar"><i style={{ width: `${hpPct}%` }} /></span> {s.hp}
      </span>
      <span className="coins" title="金币">● {fmtNum(s.bank.coins ?? 0)}</span>
    </header>
  );
}

export function QueuePanel({ s }: { s: GameState }) {
  if (!s.queue.length) {
    return <div className="panel queue idle">空闲中——点地图上的地点选个任务</div>;
  }
  return (
    <div className="panel queue">
      {s.queue.map((t, i) => (
        <div key={i} className="queue-row">
          <span>
            {i > 0 && '然后 '}
            {actionName(t.action)} {modeLabel(t.mode)}
            {t.mode.type === 'count' && i === 0 && <em> ({t.done}/{t.mode.count})</em>}
          </span>
          <button className="x" onClick={() => store.dispatch((g) => removeTask(g, i))} aria-label="移除">✕</button>
        </div>
      ))}
    </div>
  );
}

export function StatusChips({ s }: { s: GameState }) {
  const task = s.queue[0];
  const a = task && ACTIONS[task.action];
  let body = null;
  if (a?.kind === 'skill') {
    const pct = (s.progressMs / a.durationMs) * 100;
    body = (
      <>
        <b style={{ color: SKILLS[a.skill].color }}>{SKILLS[a.skill].name}</b> · {a.name}
        <span className="bar wide"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  } else if (a?.kind === 'combat') {
    const m = MONSTERS[a.monster];
    const hp = s.combat?.monsterHp ?? m.hp;
    body = (
      <>
        <b style={{ color: SKILLS.melee.color }}>战斗</b> · {m.name}
        <span className="bar wide foe"><i style={{ width: `${(hp / m.hp) * 100}%` }} /></span>
        {s.combat?.respawnMs ? <em>刷新中</em> : <em>{hp}/{m.hp}</em>}
      </>
    );
  }
  return (
    <div className="chips">
      {body && <div className="chip">{body}</div>}
      <div className="chip dim">⚔ 击杀 {fmtNum(s.stats.kills)} · 阵亡 {s.stats.deaths}</div>
    </div>
  );
}

export function MapButtons() {
  return (
    <div className="map-buttons">
      <button onClick={() => emitToGame('zoom', 0.5)}>＋</button>
      <button onClick={() => emitToGame('zoom', -0.5)}>－</button>
      <button onClick={() => emitToGame('recenter')} title="回到角色">◎</button>
    </div>
  );
}
