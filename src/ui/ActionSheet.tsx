import { QualityOdds } from './Quality';
import { AltarSheet } from './Halloween';
import { RanchSheet } from './Ranch';
import { RANCH } from '../core/ranch';
import { SalvageSheet } from './Salvage';
import { MonsterDetail, MonsterIcon, TraitChips } from './Bestiary';
import { useEffect, useRef, useState } from 'react';
import { ACTIONS, nodeOfAction, ITEMS, MONSTERS, NODES, REGIONS, SEED_PRICE, SEED_SHOP, SKILLS, tierName } from '../core/data';
import {
  actionDuration, atMarket, bestFood, buySeed, combatEstimate, combatStats, enqueue, level, MAX_QUEUE, nearNode, setSettings, startNow, weaponStyle, xpPerHour,
} from '../core/sim';
import type { ActionDef, GameState, SkillAction, TaskMode } from '../core/types';
import type { MapNode } from '../core/data';
import { store } from '../store';
import { FarmSheet } from './FarmSheet';
import { openNodeSheet } from './itemOpen';
import { WaystoneSheet } from './WaystoneSheet';
import { homeNode } from '../core/home';
import { PortalSheet } from './HomeUI';
import { fmtNum, stacks } from './format';
import { Icon, SkillIcon } from './icons';
import { tl } from '../i18n';

const COUNTS = [1, 10, 50, 100, 500];
const TIMES = [10, 30, 60, 240];
const THRESHOLDS = [0.25, 0.5, 0.75];
/** 配方分类（用户 10-23：用分类和阶级筛选代替「点击展开更多」） */
const CATS = [tl('武器'), tl('护甲'), tl('首饰'), tl('工具'), tl('锭'), tl('板材·皮革·布料'), tl('料理'), tl('药水'), tl('强化石'), tl('其他')] as const;
function catOf(a: ActionDef): (typeof CATS)[number] {
  if (a.kind !== 'skill') return tl('其他');
  const id = a.outputs[0]?.item ?? '';
  const it = ITEMS[id];
  if (!it) return tl('其他');
  const slot = it.equip?.slot;
  if (slot === 'weapon') return tl('武器');
  if (slot === 'head' || slot === 'body' || slot === 'feet' || slot === 'hands') return tl('护甲');
  if (slot === 'ring' || slot === 'neck') return tl('首饰');
  if (it.category === 'tool') return tl('工具');
  if (id.endsWith('_bar')) return tl('锭');
  if (/^(plank|leather|cloth)_\d$/.test(id)) return tl('板材·皮革·布料');
  if (it.category === 'food') return tl('料理');
  if (it.category === 'potion') return tl('药水');
  if (id.startsWith('enh_')) return tl('强化石');
  return tl('其他');
}
const tierOf = (a: ActionDef) => (a.kind === 'skill' ? ITEMS[a.outputs[0]?.item]?.tier : undefined);

const isLocked = (s: GameState, a: ActionDef) => a.kind === 'skill' && level(s, a.skill) < a.level;

export function ActionSheet({ s, nodeId, onClose }: { s: GameState; nodeId: string; onClose: () => void }) {
  const node = NODES.find((n) => n.id === nodeId) ?? homeNode(nodeId)!;
  if (node.portal) return <PortalSheet s={s} node={node} onClose={onClose} />;
  if (node.farm) return <FarmSheet s={s} nodeId={nodeId} onClose={onClose} />;
  if (node.waystone) return <WaystoneSheet s={s} nodeId={nodeId} onClose={onClose} />;
  if (node.event) return <AltarSheet s={s} node={node} onClose={onClose} />;
  if (node.id === RANCH) return <RanchSheet s={s} node={node} onClose={onClose} />;
  if (node.salvage) return <SalvageSheet s={s} node={node} onClose={onClose} />;
  return <NodeSheet s={s} node={node} onClose={onClose} />;
}

/** 每个地点上次选的分类、阶级和配方：关掉再打开还停在原处（用户 10-25） */
const sheetMemo = new Map<string, { cat: string; tier: number | 'all'; selected: string | null }>();

function NodeSheet({ s, node, onClose }: { s: GameState; node: MapNode; onClose: () => void }) {
  // 从别的配方跳过来：直接选中要做的那个（用户 10-23）
  const focus = store.focusAction && node.actions.includes(store.focusAction) ? store.focusAction : null;
  // 家园岛上的制作台：人在岛上就算站在旁边
  const isHome = node.id.startsWith('home_');
  const near = (g: GameState) => (isHome ? !!g.home?.inside : nearNode(g, node));
  const memo = sheetMemo.get(node.id);
  const [selected, setSelectedRaw] = useState<string | null>(focus ?? memo?.selected ?? null);
  const [cat, setCat] = useState<string>(focus ? 'all' : memo?.cat ?? 'all');
  const [tier, setTier] = useState<number | 'all'>(focus ? 'all' : memo?.tier ?? 'all');
  useEffect(() => { sheetMemo.set(node.id, { cat, tier, selected }); }, [node.id, cat, tier, selected]);
  const setSelected = (id: string | null) => {
    store.focusAction = null;
    setSelectedRaw(id);
  };
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    // 从别处跳过来才滚到选中的配方；平时回到上次滚到的位置（App 记着）
    const at = focus;
    if (at) list.current?.querySelector(`[data-id="${at}"]`)?.scrollIntoView({ block: 'center' });
    if (!focus) return;
    // 已经站在这里了，选中就算用掉了
    if (!node.town || near(store.state)) store.focusAction = null;
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 野外的怪物不在点位页面里列出，直接点地图上的怪物（用户 10-22 要求）；城镇的训练假人保留
  const all = node.closed ? [] : node.town ? node.actions : node.actions.filter((id) => ACTIONS[id].kind !== 'combat');
  const unlocked = all.filter((id) => !isLocked(s, ACTIONS[id]));
  const locked = all.filter((id) => isLocked(s, ACTIONS[id]));
  // 已解锁的按等级从高到低（最好的在上面），未解锁的按等级从低到高
  const byLevel = (a: string, b: string) => ACTIONS[a].level - ACTIONS[b].level;
  const cats = CATS.filter((c) => all.some((id) => catOf(ACTIONS[id]) === c));
  const inCat = (id: string) => cat === 'all' || catOf(ACTIONS[id]) === cat;
  const tiers = [...new Set(all.filter(inCat).map((id) => tierOf(ACTIONS[id])).filter((t): t is number => t !== undefined))].sort((a, b) => a - b);
  const pass = (id: string) => inCat(id) && (tier === 'all' || tierOf(ACTIONS[id]) === tier);
  const shown = [...unlocked.filter(pass).sort(byLevel).reverse(), ...locked.filter(pass).sort(byLevel)];

  return (
    <div className="sheet">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{node.name}</h2>
        <small className="muted">{isHome ? tl('家园岛屿') : REGIONS[node.region].name}{!node.town && !node.cave && ` · Lv${node.lv[0]}-${node.lv[1]}`}</small>
      </div>
      {cats.length > 1 && (
        <div className="chips-row filter-row">
          <button className={`pill ${cat === 'all' ? 'on' : ''}`} onClick={() => { setCat('all'); setTier('all'); }}>{tl`全部 ${all.length}`}</button>
          {cats.map((c) => (
            <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => { setCat(c); setTier('all'); }}>
              {c} {all.filter((id) => catOf(ACTIONS[id]) === c).length}
            </button>
          ))}
        </div>
      )}
      {tiers.length > 1 && (
        <div className="chips-row filter-row">
          <button className={`pill ${tier === 'all' ? 'on' : ''}`} onClick={() => setTier('all')}>{tl('全部阶级')}</button>
          {tiers.map((t) => <button key={t} className={`pill ${tier === t ? 'on' : ''}`} onClick={() => setTier(t)}>{tierName(t)}</button>)}
        </div>
      )}
      <ul className="action-list" ref={list}>
        {shown.map((id) => {
          const a = ACTIONS[id];
          const lock = isLocked(s, a);
          const icon = a.kind === 'skill' ? (a.outputs[0] && a.outputs[0].item !== 'coins' ? <Icon item={a.outputs[0].item} size={30} /> : <SkillIcon skill={a.skill} size={30} />) : <MonsterIcon m={MONSTERS[a.monster]} size={34} />;
          return (
            <li key={id} data-id={id} className={`${selected === id ? 'sel' : ''} ${lock ? 'locked' : ''}`} onClick={() => !lock && setSelected(id)}>
              <span className="act-icon">{icon}</span>
              <span className="act-body">
                <span className="row1">
                  <b>{a.kind === 'skill' && !a.inputs && ITEMS[a.outputs[0]?.item]?.tier !== undefined && `${tierName(ITEMS[a.outputs[0].item].tier!)} `}{a.name}</b>
                  <span className="xph">{tl`${fmtNum(xpPerHour(s, id))} 经验/时`}</span>
                </span>
                <span className="row2">
                  {a.kind === 'combat' ? (
                    <>
                      <span className={`diff ${a.difficulty}`}>{MONSTERS[a.monster].world ? tl('世界首领') : MONSTERS[a.monster].boss ? 'BOSS' : MONSTERS[a.monster].rank === 'elite' ? tl('精英') : a.difficulty}</span> {tl`${tierName(MONSTERS[a.monster].tier)} · ${MONSTERS[a.monster].level} 级 · 生命 ${fmtNum(MONSTERS[a.monster].hp)}`}
                      <TraitChips m={MONSTERS[a.monster]} />
                    </>
                  ) : (
                    <>
                      {tl`${SKILLS[a.skill].name} ${a.level} 级 · ${(actionDuration(s, a) / 1000).toFixed(1)} 秒`}{a.inputs && <>{tl` · 消耗 ${stacks(a.inputs)}`}</>}
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
      </ul>

      {node.sprite === 'market' && <SeedShop s={s} />}
      {node.closed && <p className="muted pad">{node.sea ? tl`${node.name}在海上的岛屿，要等以后的航行系统开放才能去，敬请期待。` : tl`${node.name}暂未开放，敬请期待。`}</p>}
      {node.cave && <p className="muted pad">{tl('大型洞窟入口。里面的内容还在筹备，暂未开放，敬请期待。')}</p>}
      {!all.length && !node.cave && !node.closed && <p className="muted pad">{tl('这里是怪物出没的地方。点地图上的怪物或生物，就能查看它的信息并开打。')}</p>}
      {all.length > 0 && <TaskConfig s={s} action={selected} onDone={onClose} stay far={node.town && !near(s) ? node : undefined} />}
    </div>
  );
}

/** 选中的配方：材料和产物都画成图标，点图标看物品详情 */
function Recipe({ s, a }: { s: GameState; a: SkillAction }) {
  const have = (id: string) => (s.bag[id] ?? 0) + (s.bank[id] ?? 0);
  const cell = (st: { item: string; qty: number; chance?: number }, need: boolean) => {
    const short = need && have(st.item) < st.qty;
    const src = need ? producerOf(s, st.item) : undefined;
    return (
      <span key={st.item} className={`rc-cell ${short ? 'short' : ''} ${src ? 'jump' : ''}`}
        title={src ? tl`去做${ITEMS[st.item].name}：${NODES.find((n) => n.id === src.node)?.name}` : undefined}
        onClick={src ? (e) => { e.stopPropagation(); jumpTo(src.action, src.node); } : undefined}>
        <Icon item={st.item} size={24} info={!src} />
        <small>
          ×{st.qty}{st.chance !== undefined && ` ${Math.round(st.chance * 1000) / 10}%`}
          {need && <i className={short ? 'warn' : ''}> / {fmtNum(have(st.item))}</i>}
        </small>
        {short && src && <em className="rc-go">{tl('去做 ›')}</em>}
      </span>
    );
  };
  return (
    <span className="recipe">
      {a.inputs?.map((st) => cell(st, true))}
      {a.inputs && <b className="rc-arrow">→</b>}
      {a.outputs.map((st) => cell(st, false))}
      {a.outputs.map((st) => <QualityOdds key={`q${st.item}`} item={st.item} />)}
      <small className="muted rc-tip">{a.inputs ? tl('点材料跳到它的制作或采集地点（缺的标红）；点产物看详情') : tl('点图标看物品详情')}</small>
    </span>
  );
}

/**
 * 某样材料去哪做（用户 10-23：城镇制作不用来回找）：
 * 产出它的动作里，先挑等级够的、再挑等级最低的；地点挑离角色最近的那一处
 */
export function producerOf(s: GameState, item: string): { action: string; node: string } | undefined {
  const all = Object.values(ACTIONS).filter((x): x is SkillAction => x.kind === 'skill' && x.outputs.some((o) => o.item === item && o.chance === undefined));
  if (!all.length) return undefined;
  const best = all.sort((x, y) => Number(level(s, y.skill) >= y.level) - Number(level(s, x.skill) >= x.level) || x.level - y.level)[0];
  const node = nodeOfAction(best.id, s.loc);
  return node ? { action: best.id, node: node.id } : undefined;
}

/** 跳到那个配方：打开它所在地点的页面并选中；人不在旁边就用页面里的「寻路」，走到了会自动再打开并选中 */
export function jumpTo(action: string, node: string) {
  store.focusAction = action;
  openNodeSheet(node);
}

/** 集市的种子摊：T1-T2 种子，金币从仓库扣、种子进仓库 */
function SeedShop({ s }: { s: GameState }) {
  const here = atMarket(s);
  const coins = s.bank.coins ?? 0;
  return (
    <div className="seed-shop">
      <h3>{tl('种子摊 ')}<small className="muted">{tl`金币 ${fmtNum(coins)}`}{!here && tl(' · 要走到集市旁边才能买')}</small></h3>
      <ul>
        {SEED_SHOP.map((id) => {
          const price = ITEMS[id].value * SEED_PRICE;
          return (
            <li key={id}>
              <Icon item={id} size={26} />
              <span className="grow">{ITEMS[id].name}<small className="muted">{tl` 单价 ${price} · 仓库有 ${fmtNum(s.bank[id] ?? 0)}`}</small></span>
              {[1, 10].map((n) => (
                <button key={n} disabled={!here || coins < price * n} onClick={() => store.dispatch((g) => buySeed(g, id, n))}>{tl`买 ${n}`}</button>
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
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{m.name}</h2>
        <small className="muted">{tl`${fmtNum(xpPerHour(s, actionId))} 经验/时`}</small>
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
function TaskConfig({ s, action: selected, onDone, far, stay }: { s: GameState; action: string | null; onDone: () => void; far?: MapNode; stay?: boolean }) {
  // 地点页面开工后不关页面（用户 10-25：做完一件还要接着选下一件），只在按钮上方提示一下
  const [flash, setFlash] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);
  const [modeType, setModeType] = useState<TaskMode['type']>('infinite');
  const [count, setCount] = useState(50);
  // 做装备、工具默认只做 1 件（用户 10-23）
  useEffect(() => {
    const a = selected ? ACTIONS[selected] : null;
    if (a?.kind === 'skill' && a.outputs.some((o) => ITEMS[o.item]?.equip)) {
      setModeType('count');
      setCount(1);
    }
  }, [selected]);
  const [minutes, setMinutes] = useState(60);
  const mode = (): TaskMode =>
    modeType === 'count' ? { type: 'count', count } : modeType === 'time' ? { type: 'time', ms: minutes * 60000 } : { type: 'infinite' };
  const go = (now: boolean) => {
    if (!selected) return;
    store.dispatch((g) => (now ? startNow(g, selected, mode()) : enqueue(g, selected, mode())));
    if (!stay) return onDone();
    const name = ACTIONS[selected].name;
    setFlash((f) => ({ text: now ? tl`已开始：${name}` : tl`已加入队列：${name}`, n: (f?.n ?? 0) + 1 }));
  };
  const queueFull = s.queue.length >= MAX_QUEUE;
  return (
    <div className="config">
      <div className="tabs3">
        {(['count', 'time', 'infinite'] as const).map((t) => (
          <button key={t} className={modeType === t ? 'on' : ''} onClick={() => setModeType(t)}>
            {{ count: tl('× 数量'), time: tl('◷ 时间'), infinite: tl('∞ 无限') }[t]}
          </button>
        ))}
      </div>
      {modeType === 'count' && (
        <div className="opts">
          {COUNTS.map((c) => <button key={c} className={count === c ? 'on' : ''} onClick={() => setCount(c)}>{c}</button>)}
        </div>
      )}
      {modeType === 'count' && (
        // 自定义数量（用户 10-23）：直接输入要做几次
        <label className={`custom-count ${COUNTS.includes(count) ? '' : 'on'}`}>
          <span>{tl('自定义')}</span>
          <input type="number" inputMode="numeric" min={1} max={99999} placeholder={tl("输入次数")}
            value={COUNTS.includes(count) ? '' : count}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              if (n >= 1) setCount(Math.min(99999, n));
            }} />
          <span className="muted">{tl('次')}</span>
        </label>
      )}
      {modeType === 'time' && (
        <div className="opts">
          {TIMES.map((m) => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{m >= 60 ? tl`${m / 60}小时` : tl`${m}分`}</button>)}
        </div>
      )}
      {selected && ACTIONS[selected].kind === 'combat' && (
        <>
          <div className="opts">
            <span className="lbl">{tl('进食阈值')}</span>
            {THRESHOLDS.map((t) => (
              <button key={t} className={s.settings.eatThreshold === t ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { eatThreshold: t }))}>
                {t * 100}%
              </button>
            ))}
          </div>
          <div className="opts">
            <span className="lbl">{tl('带食物')}</span>
            {[0, 20, 50, 100, -1].map((n) => (
              <button key={n} className={s.settings.carryFood === n ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryFood: n }))}>
                {n < 0 ? tl('全部') : n === 0 ? tl('不带') : n}
              </button>
            ))}
          </div>
          <div className="opts">
            <span className="lbl">{tl('带药水')}</span>
            {[true, false].map((v) => (
              <button key={String(v)} className={(s.settings.carryPotion !== false) === v ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryPotion: v }))}>
                {v ? tl('带') : tl('不带')}
              </button>
            ))}
          </div>
          {(s.settings.carryFood === 0 || s.settings.carryPotion === false) && (
            <p className="muted small-note">{tl('选了「不带」：开打前不回仓库拿，战斗中也不吃不喝。')}</p>
          )}
        </>
      )}
      {far && (
        <div className="go far-bank">
          <span className="muted">{tl`要走到${far.name}旁边才能开工（排进队列的会自己走过去）`}</span>
          <button onClick={() => { store.requestWalk(far.id); onDone(); }}>{tl`寻路去${far.name}`}</button>
        </div>
      )}
      {flash && <div key={flash.n} className="go-flash">✓ {flash.text}</div>}
      <div className="go">
        <button className="primary" disabled={!selected || !!far} onClick={() => go(true)}>{tl('立即开始')}</button>
        <button disabled={!selected || queueFull} onClick={() => go(false)}>
          {queueFull ? tl`队列已满 ${MAX_QUEUE}/${MAX_QUEUE}` : tl`加入队列 ${s.queue.length}/${MAX_QUEUE}`}
        </button>
      </div>
    </div>
  );
}

function CombatInfo({ s, monster }: { s: GameState; monster: string }) {
  const m = MONSTERS[monster];
  const st = combatStats(s, m);
  const food = bestFood(s) ?? bestFood(s, s.bank);
  const foodCount = [s.bank, s.bag].reduce((n, rec) => n + Object.entries(rec).reduce((m, [id, q]) => m + (ITEMS[id]?.heals ? q : 0), 0), 0);
  return (
    <span className="combat-info">
      <span>{tl`你用${SKILLS[st.style].name}：命中 ${Math.round(st.playerHit * 100)}% · 最高 ${st.playerMaxHit}`}</span>
      <span>{tl`它的命中 ${Math.round(st.monsterHit * 100)}% · 最高 ${st.monsterMaxHit}`}</span>
      {(() => {
        const e = combatEstimate(s, m);
        const cls = e.rating === tl('轻松') ? 'good' : e.rating === tl('适中') ? '' : 'warn';
        return <>
          <span>{tl`暴击 ${Math.round(st.crit * 100)}% · 闪避 ${Math.round(st.dodge * 100)}%`}{st.reduce > 0 && tl` · 减伤 ${Math.round(st.reduce * 100)}%`}</span>
          {e.killMs === Infinity
            ? <span className="warn">{tl('评估：')}<b>{tl('打不动')}</b>{tl(' · 它回血比你的输出还快，先提升等级和装备')}</span>
            : <span className={cls}>{tl('评估：')}<b>{e.rating}</b>{tl` · 每只约 ${Math.max(1, Math.round(e.killMs / 1000))} 秒、掉血约 ${Math.round(e.taken)} · 每小时约 ${fmtNum(Math.floor(e.perHour))} 只`}<small className="muted">{tl('（不算回仓库的路）')}</small></span>}
        </>;
      })()}
      <span className={food ? '' : 'warn'}>{food ? tl`食物：最好的是${ITEMS[food].name}，共 ${fmtNum(foodCount)} 份` : tl('没有食物！挂机可能阵亡')}</span>
    </span>
  );
}
