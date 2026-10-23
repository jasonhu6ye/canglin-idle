import { useEffect, useState } from 'react';
import { ITEMS, MONSTERS, SKILLS } from '../core/data';
import type { CombatLogEntry, SkillId } from '../core/types';
import { store, useGame } from '../store';
import { MonsterIcon } from './Bestiary';
import { fmtNum } from './format';
import { Icon, SkillIcon } from './icons';

/** 战斗日志（用户 10-23 要求）：每只怪的掉落和经验、阵亡记录；点击击杀统计或按 L 打开 */
type Fn = () => void;
const fns = new Set<Fn>();
export const openCombatLog = () => fns.forEach((f) => f());
export const onOpenCombatLog = (f: Fn) => {
  fns.add(f);
  return () => { fns.delete(f); };
};

const clock = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

type Filter = 'all' | 'loot' | 'death';

export function CombatLog({ onClose }: { onClose: () => void }) {
  useGame();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const all = store.combatLog;
  const kills = all.filter((e) => e.kind === 'kill');
  // 汇总：日志里所有击杀的经验和掉落
  const xp: Partial<Record<SkillId, number>> = {};
  const items: Record<string, number> = {};
  for (const e of kills) {
    for (const [k, v] of Object.entries(e.xp) as [SkillId, number][]) xp[k] = (xp[k] ?? 0) + v;
    for (const [k, v] of Object.entries(e.items)) items[k] = (items[k] ?? 0) + v;
  }
  const shown = all
    .filter((e) => filter === 'all' || (filter === 'death' ? e.kind === 'death' : e.kind === 'kill' && Object.keys(e.items).length > 0))
    .slice()
    .reverse();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal frame combat-log" onClick={(e) => e.stopPropagation()}>
        <div className="row1">
          <h2>战斗日志</h2>
          <button className="x" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <p className="muted">最近 {all.length} 条记录 · 击杀 {kills.length} · 阵亡 {all.length - kills.length}</p>
        {kills.length > 0 && (
          <div className="log-total">
            {(Object.entries(xp) as [SkillId, number][]).map(([k, v]) => (
              <span key={k} className="with-icon"><SkillIcon skill={k} size={14} /> <span style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</span> +{fmtNum(v)}</span>
            ))}
            <div className="loot">
              {Object.entries(items).filter(([id]) => ITEMS[id]).map(([id, q]) => (
                <span key={id}><Icon item={id} size={18} /> {ITEMS[id].name} ×{fmtNum(q)}</span>
              ))}
            </div>
          </div>
        )}
        <div className="tabs3">
          {([['all', '全部'], ['loot', '有掉落'], ['death', '阵亡']] as [Filter, string][]).map(([id, name]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{name}</button>
          ))}
        </div>
        <ul className="log-list">
          {shown.length === 0 && <li className="muted">还没有记录。去打怪吧！</li>}
          {shown.map((e, i) => <Entry key={`${e.t}-${i}`} e={e} />)}
        </ul>
        {all.length > 0 && (confirm
          ? <div className="go"><button className="danger" onClick={() => { store.clearLog(); setConfirm(false); }}>确定清空</button><button onClick={() => setConfirm(false)}>取消</button></div>
          : <button className="pill log-clear" onClick={() => setConfirm(true)}>清空日志</button>)}
      </div>
    </div>
  );
}

function Entry({ e }: { e: CombatLogEntry }) {
  const m = MONSTERS[e.monster];
  if (!m) return null;
  const rank = m.rank === 'boss' ? '首领 ' : m.rank === 'elite' ? '精英 ' : '';
  if (e.kind === 'death') {
    return (
      <li className="death">
        <time>{clock(e.t)}</time>
        <span className="with-icon"><MonsterIcon m={m} size={20} /> 你被 {rank}{m.name} 击败了，回城复活</span>
      </li>
    );
  }
  const xp = Object.entries(e.xp) as [SkillId, number][];
  const items = Object.entries(e.items).filter(([id]) => ITEMS[id]);
  return (
    <li>
      <time>{clock(e.t)}</time>
      <span className="with-icon"><MonsterIcon m={m} size={20} /> 击败 <b className={m.rank !== 'normal' ? 'gold' : ''}>{rank}{m.name}</b> <small className="muted">Lv{m.level}</small></span>
      <span className="log-xp">
        {xp.map(([k, v]) => <span key={k} style={{ color: SKILLS[k].color }}>{SKILLS[k].name} +{fmtNum(v)}</span>)}
      </span>
      {items.length > 0 && (
        <span className="loot">
          {items.map(([id, q]) => <span key={id}><Icon item={id} size={16} /> {ITEMS[id].name}{q > 1 ? ` ×${q}` : ''}</span>)}
        </span>
      )}
    </li>
  );
}
