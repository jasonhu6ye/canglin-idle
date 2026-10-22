import { useState } from 'react';
import { ACTIONS, ITEMS, MONSTERS, NODES, SKILLS } from '../core/data';
import { bestFood, combatStats, enqueue, level, MAX_QUEUE, startNow, xpPerHour } from '../core/sim';
import type { ActionDef, GameState, TaskMode } from '../core/types';
import { store } from '../store';
import { fmtNum, stacks } from './format';

const COUNTS = [10, 50, 100, 500];
const TIMES = [10, 30, 60, 240];
const THRESHOLDS = [0.25, 0.5, 0.75];

function requiredLevel(a: ActionDef) {
  return a.kind === 'skill' ? { skill: a.skill, level: a.level } : { skill: 'melee' as const, level: a.level };
}

export function ActionSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [modeType, setModeType] = useState<TaskMode['type']>('infinite');
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);

  const mode = (): TaskMode =>
    modeType === 'count' ? { type: 'count', count } : modeType === 'time' ? { type: 'time', ms: minutes * 60000 } : { type: 'infinite' };

  const go = (now: boolean) => {
    if (!selected) return;
    store.dispatch((g) => (now ? startNow(g, selected, mode()) : enqueue(g, selected, mode())));
    onClose();
  };

  const queueFull = s.queue.length >= MAX_QUEUE;

  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
      </div>
      <ul className="action-list">
        {node.actions.map((id) => {
          const a = ACTIONS[id];
          const req = requiredLevel(a);
          const locked = a.kind === 'skill' && level(s, req.skill) < req.level;
          return (
            <li key={id} className={`${selected === id ? 'sel' : ''} ${locked ? 'locked' : ''}`} onClick={() => !locked && setSelected(id)}>
              <div className="row1">
                <b>{a.name}</b>
                <span className="xph">{fmtNum(xpPerHour(s, id))} 经验/小时</span>
              </div>
              <div className="row2">
                {a.kind === 'combat' ? (
                  <>
                    <span className={`diff ${a.difficulty}`}>{a.difficulty}</span> {MONSTERS[a.monster].name}，{MONSTERS[a.monster].level} 级 · 推荐近战 {a.level}
                  </>
                ) : (
                  <>
                    {SKILLS[a.skill].name} {a.level} 级 · {(a.durationMs / 1000).toFixed(1)} 秒
                    {a.inputs && <> · 消耗 {stacks(a.inputs)}</>}
                    {' '}→ {stacks(a.outputs.filter((o) => !o.chance))}
                  </>
                )}
              </div>
              {selected === id && a.kind === 'combat' && <CombatInfo s={s} monster={a.monster} />}
            </li>
          );
        })}
      </ul>

      <div className="config">
        <div className="tabs3">
          {(['count', 'time', 'infinite'] as const).map((t) => (
            <button key={t} className={modeType === t ? 'on' : ''} onClick={() => setModeType(t)}>
              {{ count: '× 数量', time: '◷ 时间', infinite: '∞ 无限' }[t]}
            </button>
          ))}
        </div>
        {modeType === 'count' && (
          <div className="opts">
            {COUNTS.map((c) => <button key={c} className={count === c ? 'on' : ''} onClick={() => setCount(c)}>{c}</button>)}
          </div>
        )}
        {modeType === 'time' && (
          <div className="opts">
            {TIMES.map((m) => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{m >= 60 ? `${m / 60}小时` : `${m}分`}</button>)}
          </div>
        )}
        {selected && ACTIONS[selected].kind === 'combat' && (
          <div className="opts">
            <span className="lbl">进食阈值</span>
            {THRESHOLDS.map((t) => (
              <button key={t} className={s.settings.eatThreshold === t ? 'on' : ''}
                onClick={() => store.dispatch((g) => ({ ...g, settings: { ...g.settings, eatThreshold: t } }))}>
                {t * 100}%
              </button>
            ))}
          </div>
        )}
        <div className="go">
          <button className="primary" disabled={!selected} onClick={() => go(true)}>立即开始</button>
          <button disabled={!selected || queueFull} onClick={() => go(false)}>
            {queueFull ? `队列已满 ${MAX_QUEUE}/${MAX_QUEUE}` : `加入队列 ${s.queue.length}/${MAX_QUEUE}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CombatInfo({ s, monster }: { s: GameState; monster: string }) {
  const m = MONSTERS[monster];
  const st = combatStats(s, m);
  const food = bestFood(s);
  return (
    <div className="combat-info">
      <span>生命 {m.hp}</span>
      <span>你的命中 {Math.round(st.playerHit * 100)}% · 最高 {st.playerMaxHit}</span>
      <span>它的命中 {Math.round(st.monsterHit * 100)}% · 最高 {st.monsterMaxHit}</span>
      <span>掉落：{m.drops.map((d) => ITEMS[d.item].name).join('、')}</span>
      <span className={food ? '' : 'warn'}>
        {food ? `携带食物：${ITEMS[food].name} ×${s.bank[food]}` : '没有食物！挂机可能阵亡'}
      </span>
    </div>
  );
}
