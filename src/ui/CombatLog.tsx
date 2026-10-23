import { useEffect, useState } from 'react';
import { ACTIONS, ITEMS, MONSTERS, SKILLS } from '../core/data';
import type { CombatLogEntry, SkillId } from '../core/types';
import { store, useGame } from '../store';
import { MonsterIcon } from './Bestiary';
import { fmtNum } from './format';
import { Icon, SkillIcon } from './icons';

/** 日志（用户 10-23 要求）：战斗每只怪的掉落和经验、阵亡；采集制作每一次的产出和经验。点击击杀统计或按 L 打开 */
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

type Filter = 'all' | 'fight' | 'work' | 'death';
const FILTERS: [Filter, string][] = [['all', '全部'], ['fight', '战斗'], ['work', '采集制作'], ['death', '阵亡']];
const isFight = (e: CombatLogEntry) => e.kind === 'kill' || e.kind === 'death';

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
  const shown = all
    .filter((e) => filter === 'all' || (filter === 'death' ? e.kind === 'death' : filter === 'fight' ? isFight(e) : !isFight(e)))
    .slice()
    .reverse();
  const kills = all.filter((e) => e.kind === 'kill').length;
  const deaths = all.filter((e) => e.kind === 'death').length;
  // 汇总：当前分类里所有记录的经验和产出
  const xp: Partial<Record<SkillId, number>> = {};
  const items: Record<string, number> = {};
  for (const e of shown) {
    for (const [k, v] of Object.entries(e.xp) as [SkillId, number][]) xp[k] = (xp[k] ?? 0) + v;
    for (const [k, v] of Object.entries(e.items)) items[k] = (items[k] ?? 0) + v;
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal frame combat-log" onClick={(e) => e.stopPropagation()}>
        <div className="row1">
          <h2>日志</h2>
          <button className="x" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <p className="muted">最近 {all.length} 条记录 · 击杀 {kills} · 阵亡 {deaths} · 采集制作 {all.length - kills - deaths} 次</p>
        {shown.length > 0 && (Object.keys(xp).length > 0 || Object.keys(items).length > 0) && (
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
          {FILTERS.map(([id, name]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{name}</button>
          ))}
        </div>
        <ul className="log-list">
          {shown.length === 0 && <li className="muted">还没有记录。去打怪或者采集吧！</li>}
          {shown.map((e, i) => <Entry key={`${e.t}-${i}`} e={e} />)}
        </ul>
        {all.length > 0 && (confirm
          ? <div className="go"><button className="danger" onClick={() => { store.clearLog(); setConfirm(false); }}>确定清空</button><button onClick={() => setConfirm(false)}>取消</button></div>
          : <button className="pill log-clear" onClick={() => setConfirm(true)}>清空日志</button>)}
      </div>
    </div>
  );
}

function Gains({ e }: { e: CombatLogEntry }) {
  const xp = Object.entries(e.xp) as [SkillId, number][];
  const items = Object.entries(e.items).filter(([id]) => ITEMS[id]);
  return (
    <>
      <span className="log-xp">
        {xp.map(([k, v]) => <span key={k} style={{ color: SKILLS[k].color }}>{SKILLS[k].name} +{fmtNum(v)}</span>)}
      </span>
      {items.length > 0 && (
        <span className="loot">
          {items.map(([id, q]) => <span key={id}><Icon item={id} size={16} /> {ITEMS[id].name}{q > 1 ? ` ×${q}` : ''}</span>)}
        </span>
      )}
    </>
  );
}

function Entry({ e }: { e: CombatLogEntry }) {
  if (e.kind === 'skill' || e.kind === 'fail') {
    const a = ACTIONS[e.action ?? ''];
    if (!a || a.kind !== 'skill') return null;
    return (
      <li className={e.kind === 'fail' ? 'fail' : 'work'}>
        <time>{clock(e.t)}</time>
        <span className="with-icon"><SkillIcon skill={a.skill} size={16} /> <span style={{ color: SKILLS[a.skill].color }}>{SKILLS[a.skill].name}</span> · {a.name}{e.kind === 'fail' && <em className="warn"> 失手了</em>}</span>
        <Gains e={e} />
      </li>
    );
  }
  const m = MONSTERS[e.monster ?? ''];
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
  return (
    <li>
      <time>{clock(e.t)}</time>
      <span className="with-icon"><MonsterIcon m={m} size={20} /> 击败 <b className={m.rank !== 'normal' ? 'gold' : ''}>{rank}{m.name}</b> <small className="muted">Lv{m.level}</small></span>
      <Gains e={e} />
    </li>
  );
}
