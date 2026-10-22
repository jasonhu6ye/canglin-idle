import { useState } from 'react';
import { ACTIONS, ITEMS, MONSTERS, NODES, REGIONS, SKILLS } from '../core/data';
import {
  actionDuration, bestAmmo, bestFood, combatStats, enqueue, level, MAX_QUEUE, setSettings, startNow, weaponStyle, xpPerHour,
} from '../core/sim';
import type { ActionDef, GameState, TaskMode } from '../core/types';
import { store } from '../store';
import { fmtNum, stacks } from './format';
import { Icon, SkillIcon } from './icons';

const COUNTS = [10, 50, 100, 500];
const TIMES = [10, 30, 60, 240];
const THRESHOLDS = [0.25, 0.5, 0.75];
/** 列表默认只显示已解锁的和接下来几个，避免铁匠铺一屏几十项 */
const PREVIEW_LOCKED = 3;

const isLocked = (s: GameState, a: ActionDef) => a.kind === 'skill' && level(s, a.skill) < a.level;

export function ActionSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [modeType, setModeType] = useState<TaskMode['type']>('infinite');
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const [showAll, setShowAll] = useState(false);

  const mode = (): TaskMode =>
    modeType === 'count' ? { type: 'count', count } : modeType === 'time' ? { type: 'time', ms: minutes * 60000 } : { type: 'infinite' };

  const go = (now: boolean) => {
    if (!selected) return;
    store.dispatch((g) => (now ? startNow(g, selected, mode()) : enqueue(g, selected, mode())));
    onClose();
  };

  const queueFull = s.queue.length >= MAX_QUEUE;
  const all = node.actions;
  const unlocked = all.filter((id) => !isLocked(s, ACTIONS[id]));
  const locked = all.filter((id) => isLocked(s, ACTIONS[id]));
  // 已解锁的按等级从高到低（最好的在上面），未解锁的按等级从低到高
  const byLevel = (a: string, b: string) => ACTIONS[a].level - ACTIONS[b].level;
  const shown = showAll ? all : [...unlocked.sort(byLevel).reverse(), ...locked.sort(byLevel).slice(0, PREVIEW_LOCKED)];
  const hidden = all.length - shown.length;

  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{node.name}</h2>
        <small className="muted">{REGIONS[node.region].name}{!node.town && ` · Lv${node.lv[0]}-${node.lv[1]}`}</small>
      </div>
      <ul className="action-list">
        {shown.map((id) => {
          const a = ACTIONS[id];
          const lock = isLocked(s, a);
          const icon = a.kind === 'skill' ? (a.outputs[0] && a.outputs[0].item !== 'coins' ? <Icon item={a.outputs[0].item} size={30} /> : <SkillIcon skill={a.skill} size={30} />) : <SkillIcon skill={weaponStyle(s)} size={30} />;
          return (
            <li key={id} className={`${selected === id ? 'sel' : ''} ${lock ? 'locked' : ''}`} onClick={() => !lock && setSelected(id)}>
              <span className="act-icon">{icon}</span>
              <span className="act-body">
                <span className="row1">
                  <b>{a.name}</b>
                  <span className="xph">{fmtNum(xpPerHour(s, id))} 经验/时</span>
                </span>
                <span className="row2">
                  {a.kind === 'combat' ? (
                    <>
                      <span className={`diff ${a.difficulty}`}>{MONSTERS[a.monster].boss ? 'BOSS' : a.difficulty}</span> {MONSTERS[a.monster].name} {MONSTERS[a.monster].level} 级 · 生命 {MONSTERS[a.monster].hp}
                    </>
                  ) : (
                    <>
                      {SKILLS[a.skill].name} {a.level} 级 · {(actionDuration(s, a) / 1000).toFixed(1)} 秒
                      {a.inputs && <> · 消耗 {stacks(a.inputs)}</>}
                      {' '}→ {stacks(a.outputs.filter((o) => !o.chance))}
                    </>
                  )}
                </span>
                {selected === id && a.kind === 'combat' && <CombatInfo s={s} monster={a.monster} />}
              </span>
            </li>
          );
        })}
        {hidden > 0 && <li className="more" onClick={() => setShowAll(true)}>还有 {hidden} 项更高等级的，点击展开</li>}
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
          <>
            <div className="opts">
              <span className="lbl">进食阈值</span>
              {THRESHOLDS.map((t) => (
                <button key={t} className={s.settings.eatThreshold === t ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { eatThreshold: t }))}>
                  {t * 100}%
                </button>
              ))}
            </div>
            <div className="opts">
              <span className="lbl">带食物</span>
              {[20, 50, 100, -1].map((n) => (
                <button key={n} className={s.settings.carryFood === n ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryFood: n }))}>
                  {n < 0 ? '全部' : n}
                </button>
              ))}
            </div>
          </>
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
  const food = bestFood(s) ?? bestFood(s, s.bank);
  const ammo = bestAmmo(s);
  const foodCount = [s.bank, s.bag].reduce((n, rec) => n + Object.entries(rec).reduce((m, [id, q]) => m + (ITEMS[id]?.heals ? q : 0), 0), 0);
  return (
    <span className="combat-info">
      <span>你用{SKILLS[st.style].name}：命中 {Math.round(st.playerHit * 100)}% · 最高 {st.playerMaxHit}</span>
      <span>它的命中 {Math.round(st.monsterHit * 100)}% · 最高 {st.monsterMaxHit}</span>
      {st.style !== 'melee' && (
        <span className={ammo ? '' : 'warn'}>{ammo ? `弹药：${ITEMS[ammo.id].name}` : `没有${st.style === 'ranged' ? '箭' : '符文'}！会立刻停止`}</span>
      )}
      <span>掉落：{m.drops.map((d) => ITEMS[d.item].name).join('、') || '无'}</span>
      <span className={food ? '' : 'warn'}>{food ? `食物：最好的是${ITEMS[food].name}，共 ${fmtNum(foodCount)} 份` : '没有食物！挂机可能阵亡'}</span>
    </span>
  );
}
