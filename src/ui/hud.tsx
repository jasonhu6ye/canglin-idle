import type { ReactNode } from 'react';
import { ACTIONS, MONSTERS, nodeOfAction, NODES, SKILLS } from '../core/data';
import { QUESTS, questProgress, questText } from '../core/quests';
import { actionDuration, combatLevel, isBankId, level, maxHp, removeTask, resumeWork, weaponStyle } from '../core/sim';
import type { BuffKind, GameState, SkillId } from '../core/types';
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

/** 打首领时屏幕上方常驻的大血条，名字写在血条上面（用户 10-23 要求） */
export function BossBar({ s }: { s: GameState }) {
  const a = s.queue[0] ? ACTIONS[s.queue[0].action] : undefined;
  if (a?.kind !== 'combat' || !s.combat || s.travel || s.walk) return null;
  const m = MONSTERS[a.monster];
  if (m.rank !== 'boss') return null;
  const hp = s.combat.respawnMs > 0 ? 0 : Math.max(0, s.combat.monsterHp);
  const pct = (hp / m.hp) * 100;
  return (
    <div className="boss-bar">
      <div className="name"><small>首领</small>{m.name}<span>Lv{m.level}</span></div>
      <div className="track"><i className="trail" style={{ width: `${pct}%` }} /><i className="fill" style={{ width: `${pct}%` }} />
      <div className="num">{s.combat.respawnMs > 0 ? `重新出现中… ${Math.ceil(s.combat.respawnMs / 1000)} 秒` : `${Math.ceil(hp)} / ${m.hp}`}</div></div>
    </div>
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

export function StatusChips({ s, extra }: { s: GameState; extra?: ReactNode }) {
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
    const t0 = s.queue[0];
    const supply = isBankId(s.travel.to) && t0 && ACTIONS[t0.action]?.kind === 'combat' && !t0.stocked;
    body = (
      <>
        <b style={{ color: '#e8b84a' }}>{supply ? '补给' : isBankId(s.travel.to) ? '背包满了' : '寻路中'}</b> · {supply ? '回仓库拿食物' : isBankId(s.travel.to) ? '回仓库存东西' : `前往${n?.name}`} · 还要 {Math.ceil(s.travel.ms / 1000)} 秒
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
      {extra}
      {body && <div className="chip">{body}</div>}
      {Object.keys(s.buffs ?? {}).length > 0 && (
        <div className="chip buffs">
          {(Object.entries(s.buffs ?? {}) as [BuffKind, { pct: number; ms: number }][]).map(([k, b]) => (
            <span key={k}>{BUFF_SHORT[k]} +{Math.round(b.pct * 100)}% <em>{Math.ceil(b.ms / 60000)}分</em></span>
          ))}
        </div>
      )}
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

const BUFF_SHORT: Record<BuffKind, string> = { atk: '命中', str: '伤害', def: '防御', speed: '速度', xp: '经验' };

/** 新手任务卡片：当前目标、进度、去做 */
export function QuestCard({ s, onGo }: { s: GameState; onGo: (nodeId: string) => void }) {
  const p = questProgress(s);
  if (!p) return null;
  const node = nodeOfAction(p.q.hint);
  const idx = (s.quest?.i ?? 0) + 1;
  return (
    <div className="chip quest">
      <b className="gold">新手任务 {idx}/{QUESTS.length}</b> {questText(p.q)}
      <span className="muted"> {p.have}/{p.q.goal.n} · 奖励 {p.q.reward} 金币</span>
      {node && <button className="pill" onClick={() => onGo(node.id)}>去做</button>}
      <div className="quest-tip">💡 {p.q.tip}</div>
    </div>
  );
}
