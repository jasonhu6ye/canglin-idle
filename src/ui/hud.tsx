import { ACTIONS, MONSTERS, NODES, SKILLS } from '../core/data';
import { actionDuration, combatLevel, level, maxHp, removeTask, resumeWork, weaponStyle } from '../core/sim';
import type { GameState, SkillId } from '../core/types';
import { HERO_W, outfitOf, paintHeroSheet } from '../game/hero';
import { store } from '../store';
import { emitToGame } from './GameCanvas';
import { actionName, fmtNum, modeLabel } from './format';
import { SkillIcon, TplIcon } from './icons';

/** 顶栏头像：取当前外观正面站立帧的上半身 */
const portraits = new Map<string, string>();
function portrait(skin?: string): string {
  const o = outfitOf(skin);
  let url = portraits.get(o.id);
  if (!url) {
    const sheet = paintHeroSheet(o);
    const f = sheet.frames.find((x) => x.name === 'idle-down-0')!;
    const c = document.createElement('canvas');
    c.width = c.height = HERO_W;
    c.getContext('2d')!.drawImage(sheet.canvas, f.x, f.y, HERO_W, HERO_W, 0, 0, HERO_W, HERO_W);
    url = c.toDataURL();
    portraits.set(o.id, url);
  }
  return url;
}

export function TopBar({ s }: { s: GameState }) {
  const total = (Object.keys(SKILLS) as SkillId[]).reduce((n, k) => n + level(s, k), 0);
  const hpPct = (s.hp / maxHp(s)) * 100;
  return (
    <header className="topbar">
      <span className="avatar"><img src={portrait(s.settings.skin)} alt="" /></span>
      <span className="stat" title="战斗等级 / 总等级"><SkillIcon skill="melee" size={16} /> {combatLevel(s)} <small className="muted">/ {total}</small></span>
      <span className="hp" title="生命">
        <SkillIcon skill="hitpoints" size={16} /> <span className="bar"><i style={{ width: `${hpPct}%` }} /></span> {s.hp}
      </span>
      <span className="coins" title="金币"><TplIcon tpl="coins" tint="#f0c850" size={16} /> {fmtNum(s.bank.coins ?? 0)}</span>
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
  if (task && s.paused) {
    body = (
      <>
        <b style={{ color: '#9aa0a8' }}>已暂停</b> · 你离开了{actionName(task.action)}的地点
        <button className="pill on" onClick={() => store.dispatch(resumeWork)}>继续工作</button>
      </>
    );
  } else if (s.travel) {
    const n = NODES.find((x) => x.id === s.travel!.to);
    const pct = (1 - s.travel.ms / s.travel.total) * 100;
    body = (
      <>
        <b style={{ color: '#e8b84a' }}>{s.travel.to === 'bank' ? '背包满了' : '寻路中'}</b> · {s.travel.to === 'bank' ? '回仓库存东西' : `前往${n?.name}`} · 还要 {Math.ceil(s.travel.ms / 1000)} 秒
        <span className="bar wide"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  } else if (a?.kind === 'skill') {
    const pct = (Math.max(0, s.progressMs) / actionDuration(s, a)) * 100;
    body = (
      <>
        <SkillIcon skill={a.skill} size={14} /> <b style={{ color: SKILLS[a.skill].color }}>{SKILLS[a.skill].name}</b> · {a.name}
        {s.progressMs < 0 && <em> 晕眩中</em>}
        <span className="bar wide"><i style={{ width: `${pct}%` }} /></span>
      </>
    );
  } else if (a?.kind === 'combat') {
    const m = MONSTERS[a.monster];
    const hp = s.combat?.monsterHp ?? m.hp;
    const style = weaponStyle(s);
    body = (
      <>
        <SkillIcon skill={style} size={14} /> <b style={{ color: SKILLS[style].color }}>{SKILLS[style].name}</b> · {m.name}
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

export function MapButtons({ onWorldMap }: { onWorldMap: () => void }) {
  return (
    <div className="map-buttons">
      <button onClick={onWorldMap} title="世界地图">▦</button>
      <button onClick={() => emitToGame('zoom', 0.5)}>＋</button>
      <button onClick={() => emitToGame('zoom', -0.5)}>－</button>
      <button onClick={() => emitToGame('recenter')} title="回到角色">◎</button>
    </div>
  );
}
