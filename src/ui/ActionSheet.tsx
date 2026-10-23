import { MonsterDetail, MonsterIcon, TraitChips } from './Bestiary';
import { useState } from 'react';
import { ACTIONS, ITEMS, MONSTERS, NODES, REGIONS, SEED_PRICE, SEED_SHOP, SKILLS, tierName } from '../core/data';
import {
  actionDuration, atMarket, bestAmmo, bestFood, buySeed, combatStats, enqueue, level, MAX_QUEUE, nearNode, setSettings, startNow, weaponStyle, xpPerHour,
} from '../core/sim';
import type { ActionDef, GameState, SkillAction, TaskMode } from '../core/types';
import type { MapNode } from '../core/data';
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
  const [showAll, setShowAll] = useState(false);
  // 野外的怪物不在点位页面里列出，直接点地图上的怪物（用户 10-22 要求）；城镇的训练假人保留
  const all = node.town ? node.actions : node.actions.filter((id) => ACTIONS[id].kind !== 'combat');
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
        <small className="muted">{REGIONS[node.region].name}{!node.town && !node.cave && ` · Lv${node.lv[0]}-${node.lv[1]}`}</small>
      </div>
      <ul className="action-list">
        {shown.map((id) => {
          const a = ACTIONS[id];
          const lock = isLocked(s, a);
          const icon = a.kind === 'skill' ? (a.outputs[0] && a.outputs[0].item !== 'coins' ? <Icon item={a.outputs[0].item} size={30} info={false} /> : <SkillIcon skill={a.skill} size={30} />) : <MonsterIcon m={MONSTERS[a.monster]} size={34} />;
          return (
            <li key={id} className={`${selected === id ? 'sel' : ''} ${lock ? 'locked' : ''}`} onClick={() => !lock && setSelected(id)}>
              <span className="act-icon">{icon}</span>
              <span className="act-body">
                <span className="row1">
                  <b>{a.kind === 'skill' && !a.inputs && ITEMS[a.outputs[0]?.item]?.tier !== undefined && `${tierName(ITEMS[a.outputs[0].item].tier!)} `}{a.name}</b>
                  <span className="xph">{fmtNum(xpPerHour(s, id))} 经验/时</span>
                </span>
                <span className="row2">
                  {a.kind === 'combat' ? (
                    <>
                      <span className={`diff ${a.difficulty}`}>{MONSTERS[a.monster].boss ? 'BOSS' : MONSTERS[a.monster].rank === 'elite' ? '精英' : a.difficulty}</span> {tierName(MONSTERS[a.monster].tier)} · {MONSTERS[a.monster].level} 级 · 生命 {fmtNum(MONSTERS[a.monster].hp)}
                      <TraitChips m={MONSTERS[a.monster]} />
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
                {selected === id && a.kind === 'skill' && <Recipe s={s} a={a} />}
              </span>
            </li>
          );
        })}
        {hidden > 0 && <li className="more" onClick={() => setShowAll(true)}>还有 {hidden} 项更高等级的，点击展开</li>}
      </ul>

      {node.sprite === 'market' && <SeedShop s={s} />}
      {node.cave && <p className="muted pad">大型洞窟入口。里面的内容还在筹备，暂未开放，敬请期待。</p>}
      {!all.length && !node.cave && <p className="muted pad">这里是怪物出没的地方。点地图上的怪物或生物，就能查看它的信息并开打。</p>}
      {all.length > 0 && <TaskConfig s={s} action={selected} onDone={onClose} far={node.town && !nearNode(s, node) ? node : undefined} />}
    </div>
  );
}

/** 选中的配方：材料和产物都画成图标，点图标看物品详情 */
function Recipe({ s, a }: { s: GameState; a: SkillAction }) {
  const cell = (st: { item: string; qty: number; chance?: number }, need: boolean) => (
    <span key={st.item} className="rc-cell">
      <Icon item={st.item} size={24} />
      <small>
        ×{st.qty}{st.chance !== undefined && ` ${Math.round(st.chance * 1000) / 10}%`}
        {need && <i className={(s.bank[st.item] ?? 0) >= st.qty ? '' : 'warn'}> / {fmtNum(s.bank[st.item] ?? 0)}</i>}
      </small>
    </span>
  );
  return (
    <span className="recipe">
      {a.inputs?.map((st) => cell(st, true))}
      {a.inputs && <b className="rc-arrow">→</b>}
      {a.outputs.map((st) => cell(st, false))}
      <small className="muted rc-tip">点图标看物品详情</small>
    </span>
  );
}

/** 集市的种子摊：T1-T2 种子，金币从仓库扣、种子进仓库 */
function SeedShop({ s }: { s: GameState }) {
  const here = atMarket(s);
  const coins = s.bank.coins ?? 0;
  return (
    <div className="seed-shop">
      <h3>种子摊 <small className="muted">金币 {fmtNum(coins)}{!here && ' · 要走到集市旁边才能买'}</small></h3>
      <ul>
        {SEED_SHOP.map((id) => {
          const price = ITEMS[id].value * SEED_PRICE;
          return (
            <li key={id}>
              <Icon item={id} size={26} />
              <span className="grow">{ITEMS[id].name}<small className="muted"> 单价 {price} · 仓库有 {fmtNum(s.bank[id] ?? 0)}</small></span>
              {[1, 10].map((n) => (
                <button key={n} disabled={!here || coins < price * n} onClick={() => store.dispatch((g) => buySeed(g, id, n))}>买 {n}</button>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 地图上点怪物弹出的页面：信息、胜算和开打 */
export function MonsterSheet({ s, actionId, onClose }: { s: GameState; actionId: string; onClose: () => void }) {
  const a = ACTIONS[actionId];
  if (!a || a.kind !== 'combat') return null;
  const m = MONSTERS[a.monster];
  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>‹ 返回</button>
        <h2>{m.name}</h2>
        <small className="muted">{fmtNum(xpPerHour(s, actionId))} 经验/时</small>
      </div>
      {/* 信息区自己滚动，开始按钮固定在底部 */}
      <div className="sheet-body">
        <MonsterDetail m={m} kills={s.bestiary?.[m.id] ?? 0} reveal />
        <div className="item-detail frame"><CombatInfo s={s} monster={m.id} /></div>
      </div>
      <TaskConfig s={s} action={actionId} onDone={onClose} />
    </div>
  );
}

/** 次数/时间/无限 + 战斗设置 + 开始按钮 */
function TaskConfig({ s, action: selected, onDone, far }: { s: GameState; action: string | null; onDone: () => void; far?: MapNode }) {
  const [modeType, setModeType] = useState<TaskMode['type']>('infinite');
  const [count, setCount] = useState(50);
  const [minutes, setMinutes] = useState(60);
  const mode = (): TaskMode =>
    modeType === 'count' ? { type: 'count', count } : modeType === 'time' ? { type: 'time', ms: minutes * 60000 } : { type: 'infinite' };
  const go = (now: boolean) => {
    if (!selected) return;
    store.dispatch((g) => (now ? startNow(g, selected, mode()) : enqueue(g, selected, mode())));
    onDone();
  };
  const queueFull = s.queue.length >= MAX_QUEUE;
  return (
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
            {[0, 20, 50, 100, -1].map((n) => (
              <button key={n} className={s.settings.carryFood === n ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryFood: n }))}>
                {n < 0 ? '全部' : n === 0 ? '不带' : n}
              </button>
            ))}
          </div>
          <div className="opts">
            <span className="lbl">带药水</span>
            {[true, false].map((v) => (
              <button key={String(v)} className={(s.settings.carryPotion !== false) === v ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryPotion: v }))}>
                {v ? '带' : '不带'}
              </button>
            ))}
          </div>
          {(s.settings.carryFood === 0 || s.settings.carryPotion === false) && (
            <p className="muted small-note">选了「不带」：开打前不回仓库拿，战斗中也不吃不喝。</p>
          )}
        </>
      )}
      {far && (
        <div className="go far-bank">
          <span className="muted">要走到{far.name}旁边才能开工（排进队列的会自己走过去）</span>
          <button onClick={() => { store.requestWalk(far.id); onDone(); }}>寻路去{far.name}</button>
        </div>
      )}
      <div className="go">
        <button className="primary" disabled={!selected || !!far} onClick={() => go(true)}>立即开始</button>
        <button disabled={!selected || queueFull} onClick={() => go(false)}>
          {queueFull ? `队列已满 ${MAX_QUEUE}/${MAX_QUEUE}` : `加入队列 ${s.queue.length}/${MAX_QUEUE}`}
        </button>
      </div>
    </div>
  );
}

function CombatInfo({ s, monster }: { s: GameState; monster: string }) {
  const m = MONSTERS[monster];
  const st = combatStats(s, m);
  const food = bestFood(s) ?? bestFood(s, s.bank);
  const ammo = bestAmmo(s, weaponStyle(s), true);
  const foodCount = [s.bank, s.bag].reduce((n, rec) => n + Object.entries(rec).reduce((m, [id, q]) => m + (ITEMS[id]?.heals ? q : 0), 0), 0);
  return (
    <span className="combat-info">
      <span>你用{SKILLS[st.style].name}：命中 {Math.round(st.playerHit * 100)}% · 最高 {st.playerMaxHit}</span>
      <span>它的命中 {Math.round(st.monsterHit * 100)}% · 最高 {st.monsterMaxHit}</span>
      {st.style !== 'melee' && (
        <span className={ammo ? '' : 'warn'}>{ammo ? `弹药：${ITEMS[ammo.id].name}${ammo.inBag ? '' : '（在仓库，开战前回去拿）'}` : `没有${st.style === 'ranged' ? '箭' : '符文'}！会立刻停止`}</span>
      )}
      <span className={food ? '' : 'warn'}>{food ? `食物：最好的是${ITEMS[food].name}，共 ${fmtNum(foodCount)} 份` : '没有食物！挂机可能阵亡'}</span>
    </span>
  );
}
