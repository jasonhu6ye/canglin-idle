import { useSticky } from './sticky';
import { useEffect, useState, type ReactNode } from 'react';
import { ACTIONS, BUFF_NAME, buffText, cropsOfField, nodesOfAction, WAYSTONES, ITEMS, MAP_H, MAP_W, MONSTERS, NODES, tierName, REGIONS, SKILL_GROUPS, SKILLS, type MapNode } from '../core/data';
import {
  atBank, atMarket, nearestBank, nearestMarket, BAG_SLOTS, BELT_CAP, beltSlotOf, eat, fromBelt, POTION_AT, toBelt, BAG_STACK, bagRoomFor, stackOf, bagSlotsUsed, combatLevel, equip, level, playerBonuses, armorPerks, sell, setSettings, toBag, toBank, depositLoot, slotSpeed, unequip, openContainer,
  weaponStyle, buffPct, levelSpeed, maxHp, moveSpeed, playerAttackMs,
  redeemCode, toggleMount,
} from '../core/sim';
import type { BuffKind, EquipSlot, GameState, ItemCategory, SkillId, Summary } from '../core/types';
import { openCombatLog } from './CombatLog';
import { XP_TABLE, levelProgress, speedForLevel, SPEED_CAP, BONUS_PER_LEVEL } from '../core/xp';
import { store } from '../store';
import { RAIN_FISH } from '../core/weather';
import { fmtDuration, fmtNum } from './format';
import { Codex } from './Codex';
import { Handbook } from './Handbook';
import { TOWNS } from '../core/towns';
import { RANCH } from '../core/ranch';
import { Wardrobe } from './Wardrobe';
import { exportSave, importError, importSave } from '../saveCode';
import { outfitOf } from '../game/hero';
import { Icon, SkillIcon } from './icons';
import { FINE_POINTER, openItem, showLoot } from './itemOpen';
import { openGuide } from './Guide';
import { openNews } from './News';
import { openHalloween } from './Halloween';
import { hwOpen } from '../core/halloween';
import { stopText } from './hud';
import { actionName } from './format';
import { AccountSettings, LeaderboardPage } from './Guild';
import { online } from '../net';
import { gameFps } from './GameCanvas';
import { tl } from '../i18n';

export const GEAR_SLOTS: [EquipSlot, string][] = [
  ['head', tl('头部')], ['neck', tl('项链')], ['weapon', tl('武器')], ['body', tl('身体')], ['hands', tl('手部')], ['feet', tl('脚部')], ['ring', tl('戒指')],
];
export const TOOL_SLOTS: [EquipSlot, string, SkillId][] = [
  ['axe', tl('斧头'), 'woodcutting'], ['pickaxe', tl('镐子'), 'mining'], ['sickle', tl('镰刀'), 'gathering'], ['knife', tl('刮皮刀'), 'hunting'],
  ['rod', tl('鱼竿'), 'fishing'], ['hoe', tl('锄头'), 'farming'], ['hammer', tl('锻造锤'), 'smithing'], ['needle', tl('缝纫针'), 'crafting'],
];
const STYLE_NAME = { melee: tl('近战'), ranged: tl('远程'), magic: tl('魔法') };

const CATEGORIES: [ItemCategory | 'all', string][] = [
  ['all', tl('全部')], ['resource', tl('资源')], ['material', tl('材料')], ['food', tl('食物')], ['potion', tl('药水')],
  ['gear', tl('装备')], ['tool', tl('工具')], ['loot', tl('战利品')], ['deco', tl('装饰')], ['misc', tl('其他')],
];

/** 不在仓库旁时的提示和寻路按钮 */
function FarFromBank() {
  return (
    <div className="go far-bank">
      <span className="muted">{tl('要走到城镇的仓库旁边才能存取')}</span>
      <button onClick={() => store.requestWalk(nearestBank(store.state.loc).id)}>{tl('寻路去仓库')}</button>
    </div>
  );
}

/** 选中物品后的详情和操作 */
function ItemDetail({ s, id, from }: { s: GameState; id: string; from: 'bank' | 'bag' }) {
  const item = ITEMS[id];
  const qty = (from === 'bank' ? s.bank[id] : s.bag[id]) ?? 0;
  if (!item || qty <= 0) return null;
  const e = item.equip;
  const near = atBank(s);
  const canEquip = e && level(s, e.skill) >= e.level && (from === 'bag' || near);
  return (
    <div className="item-detail frame">
      <div className="row1">
        <span className="with-icon"><Icon item={id} size={28} /> <b>{item.tier !== undefined && `${tierName(item.tier)} `}{item.name}</b></span>
        <span className="muted">{tl`×${fmtNum(qty)} · 单价 ${item.value}`}</span>
      </div>
      {item.heals && <span>{tl`回复 ${item.heals} 生命`}{item.buff && <b className="gold"> · {buffText(item.buff)}</b>}</span>}
      {item.desc && <span className="muted">{item.desc}</span>}
      {e && (
        <span className={canEquip ? '' : 'warn'}>
          {e.move ? tl`坐骑 · 骑乘时移动速度 +${Math.round(e.move * 100)}%` : tl`需要${SKILLS[e.skill].name} ${e.level} 级`}
          {e.move ? '' : e.speed ? tl` · ${SKILLS[e.skill].name}速度 +${Math.round(e.speed * 100)}%` : tl` · 攻 +${e.attack} 力 +${e.strength} 防 +${e.defence}${e.attackMs ? tl` · 攻速 ${(e.attackMs / 1000).toFixed(1)} 秒` : ''}`}
          {e.style && e.slot !== 'weapon' && tl`（攻、力只对${STYLE_NAME[e.style]}生效）`}
        </span>
      )}
      <div className="go">
        {item.opens && (
          <>
            <button className="primary" disabled={from === 'bank' && !near} onClick={() => openBox(id, from, 1)}>{tl('打开')}</button>
            {qty > 1 && <button disabled={from === 'bank' && !near} onClick={() => openBox(id, from, Math.min(qty, 50))}>{tl`打开 ${Math.min(qty, 50)} 个`}</button>}
          </>
        )}
        {e && <button className="primary" disabled={!canEquip} onClick={() => store.dispatch((g) => equip(g, id))}>{tl('装备')}</button>}
        {from === 'bag' && item.heals && <button className="primary" onClick={() => store.dispatch((g) => eat(g, id))}>{tl('吃一个')}</button>}
        {beltSlotOf(id) && (from === 'bag' || near) && (
          <button onClick={() => store.dispatch((g) => toBelt(g, id))}>{tl`放进${beltSlotOf(id) === 'food' ? tl('食物栏') : tl('药水栏')}`}</button>
        )}
        {from === 'bank' && id !== 'coins' && (
          <button disabled={!near || bagRoomFor(s.bag, id) <= 0} onClick={() => store.dispatch((g) => toBag(g, id, qty))}>
            {bagRoomFor(s.bag, id) > 0 ? tl('放入背包') : tl('背包已满')}
          </button>
        )}
        {from === 'bank' && id !== 'coins' && (
          <>
            <button disabled={!atMarket(s)} onClick={() => store.dispatch((g) => sell(g, id, 1))}>{tl('卖 1 个')}</button>
            <button disabled={!atMarket(s)} onClick={() => store.dispatch((g) => sell(g, id, qty))}>{tl('全部卖出')}</button>
          </>
        )}
      </div>
      {from === 'bank' && id !== 'coins' && !atMarket(s) && (
        <div className="go far-bank">
          <span className="muted">{tl('卖东西要走到城镇的集市')}</span>
          <button onClick={() => store.requestWalk(nearestMarket(s.loc).id)}>{tl('寻路去集市')}</button>
        </div>
      )}
      <div className="go">
        {from === 'bag' && <button className="primary" disabled={!near} onClick={() => store.dispatch((g) => toBank(g, id, qty))}>{tl('放回仓库')}</button>}
      </div>
    </div>
  );
}

function openBox(id: string, from: 'bag' | 'bank', n: number) {
  let got: Record<string, number> = {};
  store.dispatch((g) => {
    const [next, r] = openContainer(g, id, from, n);
    got = r;
    return next;
  });
  if (Object.keys(got).length) showLoot({ from: n > 1 ? `${ITEMS[id].name} ×${n}` : ITEMS[id].name, got });
}

/** 背包里右键物品：能穿就穿，食物药水放进补给栏，别的不动 */
function quickUse(g: GameState, id: string) {
  const it = ITEMS[id];
  if (it?.equip) return equip(g, id);
  if (beltSlotOf(id)) return toBelt(g, id);
  if (it?.opens) queueMicrotask(() => openBox(id, 'bag', 1));
  return g;
}

function ItemGrid({ items, sel, onSel, onAct, empty = 0, split = false }: { items: [string, number][]; sel: string | null; onSel: (id: string) => void; onAct?: (id: string) => void; empty?: number; split?: boolean }) {
  // 背包按格子拆开：每格最多放一叠（物品 100 个，装备 1 件），多出来的占下一格
  const cells: [string, number, number][] = split
    ? items.flatMap(([id, n]) => {
      const k = stackOf(id);
      return Array.from({ length: Math.ceil(n / k) }, (_, i) => [id, Math.min(k, n - i * k), i] as [string, number, number]);
    })
    : items.map(([id, n]) => [id, n, 0]);
  return (
    <div className="grid">
      {cells.map(([id, n, i]) => (
        <button key={`${id}#${i}`} className={`cell ${sel === id ? 'sel' : ''}`} title={ITEMS[id].name}
          onClick={() => { onSel(id); if (FINE_POINTER) openItem(id); }}
          onContextMenu={(e) => { e.preventDefault(); onSel(id); onAct?.(id); }}>
          <Icon item={id} info={false} />
          <span className="qty">{fmtNum(n)}</span>
          <span className="nm">{ITEMS[id].name}</span>
        </button>
      ))}
      {Array.from({ length: empty }, (_, i) => <span key={`e${i}`} className="cell empty-cell" />)}
    </div>
  );
}

export function BankPanel({ s }: { s: GameState }) {
  const [cat, setCat] = useSticky<ItemCategory | 'all'>('bank.cat', 'all');
  const [sel, setSel] = useState<string | null>(null);
  const all = Object.entries(s.bank).filter(([id]) => id !== 'coins' && ITEMS[id]);
  const items = all.filter(([id]) => cat === 'all' || ITEMS[id].category === cat);
  const value = all.reduce((n, [id, q]) => n + ITEMS[id].value * q, 0);
  return (
    <div className="page">
      <h2>{tl('仓库 ')}<small className="muted">{tl`${all.length} 种 · 估值 ${fmtNum(value)} 金币`}</small></h2>
      {!atBank(s) && <FarFromBank />}
      <div className="chips-row">
        {CATEGORIES.map(([c, name]) => {
          const n = c === 'all' ? all.length : all.filter(([id]) => ITEMS[id].category === c).length;
          if (c !== 'all' && !n) return null;
          return <button key={c} className={`pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{name} {n}</button>;
        })}
      </div>
      <ItemGrid items={items} sel={sel} onSel={setSel}
        onAct={(id) => atBank(s) && store.dispatch((g) => toBag(g, id, g.bank[id] ?? 0))} />
      {!all.length && <p className="muted">{tl('仓库是空的。采集、制作和打怪得到的东西都会放进这里，容量不限。')}</p>}
      {sel && <ItemDetail s={s} id={sel} from="bank" />}
    </div>
  );
}

/** 装备一行的数值简写：攻击、力量、防御、速度、移速 */
export function gearStats(id: string) {
  const e = ITEMS[id]?.equip;
  if (!e) return '';
  const out: string[] = [];
  if (e.attack) out.push(tl`攻击 ${e.attack}`);
  if (e.strength) out.push(tl`力量 ${e.strength}`);
  if (e.defence) out.push(tl`防御 ${e.defence}`);
  if (e.speed) out.push(tl`速度 +${Math.round(e.speed * 100)}%`);
  if (e.move) out.push(tl`移速 +${Math.round(e.move * 100)}%`);
  return out.join(' · ');
}

/**
 * 快速换装（用户 10-24）：点角色页的栏位，弹出背包（站在仓库旁时也包括仓库）里
 * 所有能放进这一栏的装备，点一下就换上，不用再去背包里找
 */
function SlotPicker({ s, slot, name, onClose }: { s: GameState; slot: EquipSlot; name: string; onClose: () => void }) {
  const cur = s.equipment[slot];
  const bank = atBank(s);
  const fits = (id: string) => ITEMS[id]?.equip?.slot === slot;
  const list = [
    ...Object.keys(s.bag).filter(fits).map((id) => ({ id, from: tl('背包'), n: s.bag[id] })),
    ...(bank ? Object.keys(s.bank).filter((id) => fits(id) && !s.bag[id]).map((id) => ({ id, from: tl('仓库'), n: s.bank[id] })) : []),
  ].sort((a, b) => ITEMS[b.id].equip!.level - ITEMS[a.id].equip!.level || ITEMS[b.id].value - ITEMS[a.id].value);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal frame slot-picker" onClick={(e) => e.stopPropagation()}>
        <h2>{name}</h2>
        {cur ? (
          <div className="pick-row cur">
            <Icon item={cur} size={28} info={false} />
            <div><b>{ITEMS[cur].name}</b> <small className="muted">{tl('已装备')}</small><small className="muted">{gearStats(cur)}</small></div>
            <button onClick={() => openItem(cur)}>{tl('详情')}</button>
            <button onClick={() => { store.dispatch((g) => unequip(g, slot)); onClose(); }}>{tl('卸下')}</button>
          </div>
        ) : <p className="muted">{tl('这一栏现在是空的。')}</p>}
        <h3 className="muted">{tl`可装备 ${list.length} 件${bank ? tl('（含仓库）') : ''}`}</h3>
        <div className="pick-list">
          {list.map(({ id, from, n }) => {
            const e = ITEMS[id].equip!;
            const ok = level(s, e.skill) >= e.level;
            return (
              <div key={id} className={`pick-row ${ok ? '' : 'locked'}`}>
                <Icon item={id} size={28} info={false} />
                <div>
                  <b>{ITEMS[id].name}</b>{n > 1 && <small className="muted"> ×{n}</small>} <small className="muted">{from}</small>
                  <small className={ok ? 'muted' : 'bad'}>{tl`${SKILLS[e.skill].name} ${e.level} 级${ok ? '' : tl('（等级不够）')}`}</small>
                  <small className="muted">{gearStats(id)}</small>
                </div>
                <button onClick={() => openItem(id)}>{tl('详情')}</button>
                <button className="primary" disabled={!ok} onClick={() => { store.dispatch((g) => equip(g, id)); onClose(); }}>{cur ? tl('替换') : tl('装备')}</button>
              </div>
            );
          })}
          {!list.length && <p className="muted">{tl`背包里没有能放进这一栏的装备。${bank ? '' : tl('仓库里的装备要站在仓库旁边才会列出来。')}`}</p>}
        </div>
        <button className="close" onClick={onClose}>{tl('关闭')}</button>
      </div>
    </div>
  );
}

/** 角色：身上的装备和工具。点栏位弹出可换的装备，右键直接卸下 */
export function CharacterPanel({ s }: { s: GameState }) {
  const style = weaponStyle(s);
  const [pick, setPick] = useState<[EquipSlot, string] | null>(null);
  const slot = (slotId: EquipSlot, name: string) => {
    const id = s.equipment[slotId];
    return (
      <button key={slotId} className={`slot ${id ? 'full' : ''}`} title={FINE_POINTER ? tl('左键换装备，右键卸下') : tl('点击换装备或卸下')}
        onClick={() => setPick([slotId, name])}
        onContextMenu={(e) => { e.preventDefault(); if (id) store.dispatch((g) => unequip(g, slotId)); }}>
        {id ? <Icon item={id} size={28} info={false} /> : <span className="empty" />}
        <small>{id ? ITEMS[id].name : name}</small>
      </button>
    );
  };
  return (
    <div className="page">
      <h2>{tl('装备 ')}<small className="muted">{tl`战斗等级 ${combatLevel(s)} · ${STYLE_NAME[style]}`}</small></h2>
      <div className="equip">{GEAR_SLOTS.map(([id, name]) => slot(id, name))}</div>
      <Attributes s={s} />
      <h2>{tl('坐骑 ')}<small className="muted">{tl('骑上坐骑走路更快')}</small></h2>
      <div className="equip tools">
        {slot('mount', tl('暂无坐骑'))}
      </div>
      {!s.equipment.mount && <p className="muted">{tl('还没有坐骑。得到坐骑后从背包装备到这一栏（测试服可在「更多」页输入兑换码领取）。')}</p>}
      {s.equipment.mount && (
        <div className="go">
          <button className={s.mounted ? '' : 'primary'} onClick={() => store.dispatch((g) => toggleMount(g))}>{s.mounted ? tl('下坐骑') : tl('骑乘')}{FINE_POINTER ? ' (R)' : ''}</button>
          <span className="muted">{s.mounted ? tl`骑乘中，移动速度 +${Math.round((ITEMS[s.equipment.mount].equip?.move ?? 0) * 100)}%` : tl('未骑乘')}</span>
        </div>
      )}
      <h2>{tl('补给栏 ')}<small className="muted">{tl`各放一种，最多 ${BELT_CAP} 个，不占背包`}</small></h2>
      <div className="equip tools">
        {(['food', 'potion'] as const).map((k) => {
          const b = s.belt?.[k];
          return (
            <button key={k} className={`slot ${b ? 'full' : ''}`} title={b ? (FINE_POINTER ? tl('左键看详情，右键取下') : tl('点击取下放回背包')) : ''}
              onClick={() => b && (FINE_POINTER ? openItem(b.id) : store.dispatch((g) => fromBelt(g, k)))}
              onContextMenu={(e) => { e.preventDefault(); if (b) store.dispatch((g) => fromBelt(g, k)); }}>
              {b ? <Icon item={b.id} size={28} info={false} /> : <span className="empty" />}
              <small>{b ? `${ITEMS[b.id].name} ×${b.qty}` : k === 'food' ? tl('食物栏') : tl('药水栏')}</small>
            </button>
          );
        })}
      </div>
      <p className="muted">{tl`战斗时先吃食物栏，血量低于 ${Math.round(POTION_AT * 100)}% 先喝药水栏。回仓库补给时会把这两栏补满。在背包里点食物或药水，可以放进栏位。`}</p>
      <h2>{tl('工具')}</h2>
      <div className="equip tools">{TOOL_SLOTS.map(([id, name]) => slot(id, name))}</div>
      <p className="muted">{TOOL_SLOTS.map(([slot, name]) => `${name} +${Math.round(slotSpeed(s, slot) * 100)}%`).join(' · ')}</p>
      <p className="muted">{tl('点任意栏位会列出背包里能放进这一栏的装备，点「装备」直接换上，点「卸下」放回背包（背包满了送回仓库）。站在仓库旁时，仓库里的装备也会列出来。')}</p>
      {pick && <SlotPicker s={s} slot={pick[0]} name={pick[1]} onClose={() => setPick(null)} />}
    </div>
  );
}

const WIDE = () => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 900px)').matches;

/**
 * 人物属性（用户 10-23）：战斗属性逐项写出来自哪里（等级、装备、弹药、料理），
 * 再列各项速度加成、坐骑、天气和增益。
 */
function Attributes({ s }: { s: GameState }) {
  const style = weaponStyle(s);
  const b = playerBonuses(s, style);
  const lvl = level(s, style);
  const weapon = ITEMS[s.equipment.weapon ?? '']?.equip;
  const atkBuff = buffPct(s, 'atk');
  const strBuff = buffPct(s, 'str');
  const defBuff = buffPct(s, 'def');
  const maxHit = Math.max(1, Math.round((((lvl + 8) * (b.strength + 64)) / 64) * (1 + strBuff)));
  const atkMs = playerAttackMs(s);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const buffs = Object.entries(s.buffs ?? {}) as [BuffKind, { pct: number; ms: number }][];
  const mountMove = s.mounted ? ITEMS[s.equipment.mount ?? '']?.equip?.move ?? 0 : 0;
  const row = (name: string, value: ReactNode, from: ReactNode) => (
    <li key={name}><span>{name}</span><b>{value}</b><small className="muted">{from}</small></li>
  );
  // 手机端默认收起，点标题展开（用户 10-23）；电脑端一直展开
  const [open, setOpen] = useState(() => {
    if (WIDE()) return true;
    try { return localStorage.getItem('canglin-attr-open') === '1'; } catch { return false; }
  });
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem('canglin-attr-open', open ? '0' : '1'); } catch { /* 存不了就算了 */ }
  };
  if (!open) {
    return (
      <h2 className="fold-h" onClick={toggle}>{tl('属性 ')}<small className="muted">{tl`生命 ${s.hp}/${maxHp(s)} · 最高伤害 ${maxHit} · 防御 +${b.defence} · 展开 ▸`}</small></h2>
    );
  }
  return (
    <>
      {WIDE()
        ? <h2>{tl('属性 ')}<small className="muted">{tl('数值来自等级、装备和料理增益')}</small></h2>
        : <h2 className="fold-h" onClick={toggle}>{tl('属性 ')}<small className="muted">{tl('收起 ▾')}</small></h2>}
      <ul className="attr-list">
        {row(tl('生命'), `${s.hp}/${maxHp(s)}`, tl`生命等级 ${level(s, 'hitpoints')} ×10`)}
        {row(tl('战斗方式'), STYLE_NAME[style], weapon ? ITEMS[s.equipment.weapon!].name : tl('空手'))}
        {row(tl('攻击加成'), `+${b.attack}`, <>{tl('装备')}{atkBuff > 0 && <>{tl` · 料理命中 +${pct(atkBuff)}`}</>}{tl` · ${STYLE_NAME[style]}等级 ${lvl}`}</>)}
        {row(tl('力量加成'), `+${b.strength}`, <>{tl`装备 +${b.strength}`}{strBuff > 0 && <>{tl` · 料理伤害 +${pct(strBuff)}`}</>}</>)}
        {row(tl('最高伤害'), maxHit, tl`${STYLE_NAME[style]}等级 ${lvl} 和力量加成算出`)}
        {row(tl('攻击间隔'), tl`${(atkMs / 1000).toFixed(1)} 秒`, weapon ? tl('看武器种类：匕首快、长枪和弩慢') : tl('默认'))}
        {(() => {
          const perks = armorPerks(s);
          return <>
            {row(tl('暴击'), `${pct(0.05 + perks.crit)} · ×1.5`, <>{tl('基础 5%')}{perks.crit > 0 && <>{tl` · 布甲 +${pct(perks.crit)}`}</>}</>)}
            {row(tl('闪避'), pct(perks.dodge), <>{tl('基础 3%')}{perks.dodge > 0.03 && <>{tl` · 皮甲 +${pct(perks.dodge - 0.03)}`}</>}</>)}
            {row(tl('减伤'), pct(perks.reduce), perks.reduce > 0 ? tl('板甲每件 3%') : tl('穿板甲每件减 3%'))}
          </>;
        })()}
        {row(tl('防御加成'), `+${b.defence}`, <>{tl`全身装备 · 防御等级 ${level(s, 'defence')}`}{defBuff > 0 && <>{tl` · 料理防御 +${pct(defBuff)}`}</>}</>)}
        {row(tl('移动速度'), tl`${moveSpeed(s).toFixed(1)} 格/秒`, mountMove ? tl`步行 4 格/秒 · 坐骑 +${pct(mountMove)}` : tl('步行 4 格/秒'))}
      </ul>
      <h2>{tl('干活加速 ')}<small className="muted">{tl('动作时间 ÷（1 + 等级 + 工具 + 料理）')}</small></h2>
      <ul className="attr-list speed">
        {TOOL_SLOTS.map(([slot, name, skill]) => {
          const lv = levelSpeed(s, skill);
          const tool = slotSpeed(s, slot);
          const food = buffPct(s, 'speed');
          return row(SKILLS[skill].name, `+${pct(lv + tool + food)}`, <>{tl`等级 ${level(s, skill)} +${pct(lv)} · ${name} +${pct(tool)}`}{food > 0 && <>{tl` · 料理 +${pct(food)}`}</>}</>);
        })}
        {row(tl('钓鱼（下雨）'), `+${pct(RAIN_FISH)}`, tl('在下雨的钓点钓鱼额外加快，雨停就没了'))}
      </ul>
      <p className="muted">{tl`采集类技能等级每高出要求 1 级，多 ${pct(BONUS_PER_LEVEL)} 几率双倍产出；生产类是不消耗材料的几率。`}</p>
      {buffs.length > 0 && (
        <>
          <h2>{tl('增益')}</h2>
          <ul className="attr-list">
            {buffs.map(([k, v]) => row(BUFF_NAME[k], `+${pct(v.pct)}`, tl`还剩 ${Math.ceil(v.ms / 60000)} 分钟`))}
          </ul>
        </>
      )}
    </>
  );
}

/** 背包：随身带的东西，24 格 */
export function BagPanel({ s }: { s: GameState }) {
  const [sel, setSel] = useState<string | null>(null);
  const items = Object.entries(s.bag).filter(([id]) => ITEMS[id]);
  const used = bagSlotsUsed(s.bag);
  return (
    <div className="page">
      <h2>{tl('背包 ')}<small className="muted">{tl`${used}/${BAG_SLOTS} 格 · 物品每格 ${BAG_STACK} 个，装备每件一格`}</small></h2>
      <div className="bag-meter"><i style={{ width: `${(used / BAG_SLOTS) * 100}%` }} /></div>
      <ItemGrid items={items} sel={sel} onSel={setSel} onAct={(id) => store.dispatch((g) => quickUse(g, id))} empty={Math.max(0, BAG_SLOTS - used)} split />
      {sel && <ItemDetail s={s} id={sel} from="bag" />}
      {items.length > 0 && <button className="primary" disabled={!atBank(s)} onClick={() => store.dispatch(depositLoot)}>{tl('全部存入仓库')}</button>}
      {items.length > 0 && !atBank(s) && <FarFromBank />}
      <div className="opts">
        <span className="lbl">{tl('开战自动从仓库带食物')}</span>
        {[0, 20, 50, 100, -1].map((n) => (
          <button key={n} className={s.settings.carryFood === n ? 'on' : ''} onClick={() => store.dispatch((g) => setSettings(g, { carryFood: n }))}>
            {n < 0 ? tl('全部') : n === 0 ? tl('不带') : n}
          </button>
        ))}
      </div>
      <p className="muted">{tl('开战前背包里的食物不够设定数量，会先回仓库拿；战斗只吃背包里的食物。阵亡后回城复活，自动走回去接着打，连死 3 次才停。采集、制作和打怪的产出先放进背包；背包满了，角色会自动走回仓库存好（打怪时食物留在身上，采集制作时食物也一起存），再走回去接着干。制作时材料先用背包里的，不够再用仓库的。手动把东西在背包和仓库之间搬，要先走到城镇的仓库旁边。')}</p>
    </div>
  );
}

/** 每个技能能在哪些地点练 */
function whereToTrain(skill: SkillId): { node: MapNode; min: number; max: number }[] {
  const out: { node: MapNode; min: number; max: number }[] = [];
  for (const n of NODES) {
    const lv = n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill' && a.skill === skill).map((a) => a.level);
    if (lv.length) out.push({ node: n, min: Math.min(...lv), max: Math.max(...lv) });
  }
  return out.sort((a, b) => a.min - b.min);
}

export function SkillsPanel({ s, onPick }: { s: GameState; onPick: (nodeId: string) => void }) {
  const [open, setOpen] = useSticky<SkillId | null>('skills.open', null);
  const total = (Object.keys(SKILLS) as SkillId[]).reduce((n, k) => n + level(s, k), 0);
  return (
    <div className="page">
      <h2>{tl('技能 ')}<small className="muted">{tl`总等级 ${total} · 战斗等级 ${combatLevel(s)}`}</small></h2>
      {SKILL_GROUPS.map((g) => (
        <section key={g.id}>
          <h3>{g.name}</h3>
          <div className="skill-grid">
            {(Object.keys(SKILLS) as SkillId[]).filter((k) => SKILLS[k].group === g.id).map((k) => {
              const lvl = level(s, k);
              const xp = s.xp[k];
              return (
                <button key={k} className={`skill-card ${open === k ? 'sel' : ''}`} onClick={() => setOpen(open === k ? null : k)}>
                  <SkillIcon skill={k} size={30} />
                  <span className="sk-body">
                    <span className="row1"><b style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</b><span>{SKILLS[k].soon ? <em className="soon">{tl('即将开放')}</em> : `Lv ${lvl}`}</span></span>
                    <span className="bar wide"><i style={{ width: `${levelProgress(xp) * 100}%`, background: SKILLS[k].color }} /></span>
                    <small className="muted">{tl`${fmtNum(xp)} 经验 · 还差 ${fmtNum(XP_TABLE[lvl + 1] - xp)}`}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {open && SKILLS[open].group === g.id && <SkillDetail s={s} skill={open} onPick={onPick} />}
        </section>
      ))}
    </div>
  );
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function SkillDetail({ s, skill, onPick }: { s: GameState; skill: SkillId; onPick: (nodeId: string) => void }) {
  const places = whereToTrain(skill).filter((p) => !p.node.closed);
  const info = SKILLS[skill];
  const lvl = level(s, skill);
  // 离角色最近、且当前等级能做的地点；制作技能就是城里对应的建筑
  const usable = places.filter((p) => p.min <= Math.max(1, lvl));
  const nearest = (info.group === 'produce' ? (usable.length ? usable : places) : [])
    .slice().sort((a, b) => Math.hypot(a.node.x - s.loc.x, a.node.y - s.loc.y) - Math.hypot(b.node.x - s.loc.x, b.node.y - s.loc.y))[0];
  return (
    <div className="skill-detail frame">
      <p>{info.desc}</p>
      {skill === 'enhancing' && <p className="warn">{tl('强化台暂未开放，敬请期待。')}</p>}
      {info.soon && <p className="warn">{tl`${info.name}还在制作中，即将开放，敬请期待。`}</p>}
      {info.group !== 'combat' && !info.soon && (
        <p className="muted">{tl`等级没有上限。动作速度随等级提升，前期涨得快、后期慢，最多接近 +${pct(SPEED_CAP)}；当前 +${pct(speedForLevel(lvl))}，下一级 +${pct(speedForLevel(lvl + 1))}； 等级每高出动作要求 1 级，${info.group === 'gather' ? tl('双倍产出') : tl('不消耗材料')}几率 +${pct(BONUS_PER_LEVEL)}。`}</p>
      )}
      {info.group === 'combat' && (
        <p className="muted">{tl`等级没有上限。${skill === 'hitpoints' ? tl`每级 +10 生命上限，当前 ${lvl * 10}。` : skill === 'defence' ? tl('每级降低被怪物命中的几率。') : tl('每级提高命中率和最大伤害。')}`}
        </p>
      )}
      {info.group === 'combat' && (
        <p className="muted">
          {skill === 'defence' || skill === 'hitpoints' ? tl('每次造成伤害都会获得 1/3 的经验。') : tl`装备${info.name}武器后在任意战斗点获得经验。`}
        </p>
      )}
      {nearest && (
        // 制作类技能：直接寻路去最近的那座建筑（用户 10-23）
        <button className="primary walk-to" onClick={() => store.requestWalk(nearest.node.id)}>{tl`寻路去${nearest.node.name}${nearest.node.town ? '' : tl`（${REGIONS[nearest.node.region].name}）`}`}
        </button>
      )}
      {places.map(({ node, min, max }) => (
        <div key={node.id} className="place-row">
          <button className="place" onClick={() => onPick(node.id)}>
            <span>{node.name} <small className="muted">{REGIONS[node.region].name}</small></span>
            <small>{min === max ? tl`${min} 级` : tl`${min}-${max} 级`} ›</small>
          </button>
          <button className="place walk" title={tl("寻路过去")} onClick={() => store.requestWalk(node.id)}>{tl('寻路')}</button>
        </div>
      ))}
    </div>
  );
}

const MONSTER_COUNT = (() => {
  const all = Object.values(MONSTERS);
  return { all: all.length, elite: all.filter((m) => m.rank === 'elite').length, boss: all.filter((m) => m.rank === 'boss').length };
})();

// 语言切换的文字两种语言都要看得懂，不翻译
const LANG_TITLE = '语言 · Language'; // i18n-ignore

export function MorePanel({ s }: { s: GameState }) {
  const [page, setPage] = useSticky<'codex' | 'wardrobe' | 'book' | 'rank' | 'settings' | null>('more.page', null);
  const close = () => setPage(null);
  if (page === 'codex') return <Codex s={s} onClose={close} />;
  if (page === 'book') return <Handbook onClose={close} />;
  if (page === 'wardrobe') return <Wardrobe s={s} onClose={close} />;
  if (page === 'rank') return <LeaderboardPage onClose={close} />;
  if (page === 'settings') return <SettingsPage s={s} onClose={close} />;
  const total = Object.keys(ITEMS).length - 1;
  const got = Object.keys(s.seen).filter((id) => id !== 'coins' && ITEMS[id]).length;
  return (
    <div className="page">
      <ServerStatus />
      <h2>{tl('设置 ')}<small className="muted">{tl('账号、存档')}</small></h2>
      <button className="primary" onClick={() => setPage('settings')}>{tl('打开设置')}</button>
      <h2>{tl('排行榜 ')}<small className="muted">{tl('总等级、战斗等级、各技能')}</small></h2>
      <button className="primary" onClick={() => setPage('rank')}>{tl('查看排行榜')}</button>
      {hwOpen(Date.now()) && <>
        <h2>{tl('万圣节活动 ')}<small className="muted">{tl('11 月 1 日结束')}</small></h2>
        <button className="primary" onClick={openHalloween}>{tl('查看活动说明')}</button>
      </>}
      <h2>{tl('更新公告 ')}<small className="muted">{tl('最近更新了什么')}</small></h2>
      <button className="primary" onClick={openNews}>{tl('查看更新公告')}</button>
      <h2>{tl('新手指引')}</h2>
      <button className="primary" onClick={openGuide}>{tl('重新查看新手指引')}</button>
      <h2>{tl('攻略手册 ')}<small className="muted">{tl('每个系统的教程、城镇和首领攻略')}</small></h2>
      <button className="primary" onClick={() => setPage('book')}>{tl('打开攻略手册')}</button>
      <h2>{tl('兑换码')}</h2>
      <Redeem />
      <h2>{tl('物品图鉴 ')}<small className="muted">{tl`已收集 ${got}/${total}`}</small></h2>
      <div className="bag-meter"><i style={{ width: `${(got / total) * 100}%` }} /></div>
      <button className="primary" onClick={() => setPage('codex')}>{tl('打开图鉴')}</button>
      <h2>{tl('衣橱 ')}<small className="muted">{tl`当前：${outfitOf(s.settings.skin).name}`}</small></h2>
      <button className="primary" onClick={() => setPage('wardrobe')}>{tl('打开衣橱')}</button>
      <h2>{tl('关于')}</h2>
      <p>{tl('苍岭放置（暂定名）测试服。角色会一直执行队列里的任务，关掉网页也会在下次打开时结算离线收益，最多 24 小时。')}</p>
      <p className="muted">{tl`世界 ${MAP_W}×${MAP_H} 格，${Object.keys(REGIONS).length} 个区域，${TOWNS.length + 2} 座城镇。${Object.keys(SKILLS).length} 种技能、${Object.keys(ITEMS).length - 1} 种物品、${MONSTER_COUNT.all} 种怪物（精英 ${MONSTER_COUNT.elite}、首领 ${MONSTER_COUNT.boss}），资源、装备和怪物都是正式数值。 美术全部用代码逐像素绘制。存档跟着账号保存在云端。`}</p>
      <p className="muted">{tl('版本 ')}{__BUILD__}</p>
    </div>
  );
}

/** 更多页顶上的状态栏：全服在线人数、延迟、帧率（用户 10-25） */
function ServerStatus() {
  const [, tick] = useState(0);
  const [ping, setPing] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    let live = true;
    const measure = () => { if (online.me()) online.ping().then((ms) => live && setPing(ms)).catch(() => live && setPing(-1)); };
    measure();
    const p = setInterval(measure, 5000);
    return () => { live = false; clearInterval(t); clearInterval(p); };
  }, []);
  const n = online.onlineCount();
  const fps = gameFps();
  const rt = online.realtimeStatus();
  const lvl = (ms: number) => (ms < 0 ? 'bad' : ms < 150 ? 'good' : ms < 400 ? 'mid' : 'bad');
  return (
    <div className="server-status frame">
      <span><small>{tl('在线玩家')}</small><b>{online.me() ? n ?? '…' : tl('离线')}</b></span>
      <span><small>{tl('延迟')}</small><b className={ping == null ? '' : lvl(ping)}>{ping == null ? '…' : ping < 0 ? tl('连不上') : `${ping} ms`}</b></span>
      <span><small>FPS</small><b className={fps >= 50 ? 'good' : fps >= 25 ? 'mid' : 'bad'}>{fps ? Math.round(fps) : '…'}</b></span>
      <span><small>{tl('每帧')}</small><b>{fps ? `${(1000 / fps).toFixed(1)} ms` : '…'}</b></span>
      {rt !== 'off' && <span><small>{tl('实时同步')}</small><b className={rt === 'ok' ? 'good' : rt === 'failed' ? 'mid' : ''}>{rt === 'ok' ? tl('正常') : rt === 'failed' ? tl('慢速同步') : '…'}</b></span>}
    </div>
  );
}

/** 设置：账号和存档（用户 10-25 从联机页、更多页挪进来） */
function SettingsPage({ s, onClose }: { s: GameState; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="page guild">
      <div className="sheet-head">
        <button className="back" onClick={onClose}>{tl('‹ 返回')}</button>
        <h2>{tl('设置')}</h2>
      </div>
      <h3>{tl('补给')}</h3>
      <div className="opts">
        <span className="lbl">{tl('开战自动从仓库带食物')}</span>
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
      <p className="muted small-note">{tl('只有打怪前才会回仓库拿食物和药水；走路、寻路去队友身边、采集和制作都不会带。选「不带」就完全不回仓库拿。')}</p>
      <h3>{tl('账号')}</h3>
      <AccountSettings />
      <h3>{tl('存档备份')}</h3>
      <SaveBackup s={s} />
      {confirming ? (
        <div className="go">
          <button className="danger" onClick={() => { store.reset(); setConfirming(false); }}>{tl('确定删除')}</button>
          <button onClick={() => setConfirming(false)}>{tl('取消')}</button>
        </div>
      ) : (
        <button className="danger" onClick={() => setConfirming(true)}>{tl('删除存档，重新开始')}</button>
      )}
    </div>
  );
}

/** 兑换码（测试服）：领到的东西进背包，背包满了进仓库 */
function Redeem() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const submit = () => {
    let r = { ok: false, msg: '' };
    store.dispatch((g) => {
      const out = redeemCode(g, code);
      r = out;
      return out.state;
    });
    if (r.ok) setCode('');
    setMsg({ text: r.ok ? tl`${r.msg}。到「角色」页的坐骑栏装备，地图右下角点「骑乘」或按 R 上坐骑` : r.msg, ok: r.ok });
  };
  return (
    <div className="redeem">
      <div className="go">
        <input className="redeem-input" value={code} placeholder={tl("输入兑换码")} maxLength={32}
          onChange={(e) => { setCode(e.target.value); setMsg(null); }} onKeyDown={(e) => e.key === 'Enter' && code.trim() && submit()} />
        <button className="primary" disabled={!code.trim()} onClick={submit}>{tl('兑换')}</button>
      </div>
      {msg && <p className={msg.ok ? 'good' : 'warn'}>{msg.text}</p>}
    </div>
  );
}

/** 存档码导出/导入：换手机或浏览器清了数据时用 */
function SaveBackup({ s }: { s: GameState }) {
  const [mode, setMode] = useState<'none' | 'export' | 'import'>('none');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const doExport = async () => {
    setMode('export');
    setMsg('');
    setCode(await exportSave(s));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg(tl('已复制，找个地方（备忘录、聊天）存好'));
    } catch {
      setMsg(tl('复制失败，请长按文本框手动全选复制'));
    }
  };
  // 先解出来给玩家对比两边，确认了才覆盖，防止拿旧档盖掉新档（用户 10-23）
  const [pending, setPending] = useState<GameState | null>(null);
  const doImport = async (text = code) => {
    const next = await importSave(text);
    if (!next) return setMsg(importError || tl('存档码不对，请检查是否复制完整'));
    setMsg('');
    setPending(next);
  };
  // 存档文件：电脑下载后用 AirDrop / 微信传到手机，再选文件导入，不用复制长串（用户 10-23）
  const download = async () => {
    const text = code || await exportSave(s);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const d = new Date();
    a.download = tl`苍岭存档-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg(tl('存档文件已下载，传到另一台设备后点「从文件导入」'));
  };
  const fromFile = async (f?: File) => {
    if (!f) return;
    await doImport(await f.text());
  };
  return (
    <div className="save-backup">
      <p className="muted">{tl('存档每分钟自动传到云端。下面是手动备份：导出存档码或文件，需要时再导入。')}</p>
      <div className="go">
        <button onClick={doExport}>{tl('导出存档码')}</button>
        <button onClick={() => { setMode('import'); setCode(''); setMsg(''); }}>{tl('导入存档码')}</button>
      </div>
      <div className="go">
        <button onClick={download}>{tl('下载存档文件')}</button>
        <label className="btn-like">{tl('从文件导入')}<input type="file" accept=".txt,text/plain" hidden onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {mode !== 'none' && (
        <>
          <textarea className="save-code" value={code} readOnly={mode === 'export'} placeholder={mode === 'import' ? tl('把存档码粘贴到这里') : tl('生成中…')}
            onChange={(e) => setCode(e.target.value)} onFocus={(e) => mode === 'export' && e.target.select()} />
          {code && <p className="muted small-note">{tl`共 ${code.replace(/\s+/g, '').length} 个字符 · 开头 ${code.slice(0, 9)} · 结尾 ${code.slice(-6)}（两边对一下就知道复制全没全）`}</p>}
          <div className="go">
            {mode === 'export' ? <button className="primary" disabled={!code} onClick={copy}>{tl('复制')}</button>
              : <button className="danger" disabled={!code.trim()} onClick={() => doImport()}>{tl('导入并覆盖当前存档')}</button>}
            <button onClick={() => setMode('none')}>{tl('收起')}</button>
          </div>
        </>
      )}
      {msg && <p className="warn">{msg}</p>}
      {pending && <SaveCompare cur={s} next={pending} onCancel={() => setPending(null)} onOk={() => { setPending(null); store.replace(pending); }} />}
    </div>
  );
}

const totalLevel = (g: GameState) => (Object.keys(g.xp) as SkillId[]).reduce((n, k) => n + level(g, k), 0);
const totalXp = (g: GameState) => Object.values(g.xp).reduce((a, b) => a + b, 0);
const fmtTime = (t: number) => { const d = new Date(t); return tl`${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** 导入前对比：当前存档和要导入的存档并排，导入的更旧就红字提醒 */
function SaveCompare({ cur, next, onOk, onCancel }: { cur: GameState; next: GameState; onOk: () => void; onCancel: () => void }) {
  const rows: [string, (g: GameState) => string | number][] = [
    [tl('总等级'), totalLevel],
    [tl('战斗等级'), (g) => combatLevel(g)],
    [tl('仓库金币'), (g) => fmtNum(g.bank.coins ?? 0)],
    [tl('击杀'), (g) => fmtNum(g.stats.kills)],
    [tl('总经验'), (g) => fmtNum(totalXp(g))],
    [tl('存档时间'), (g) => (g === cur ? tl('现在') : fmtTime(g.lastTick))],
  ];
  // 当前存档的时间总是「现在」，没法比新旧，所以按进度（总经验、总等级）比
  const older = totalXp(next) < totalXp(cur);
  const lower = totalLevel(next) < totalLevel(cur);
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal frame save-compare" onClick={(e) => e.stopPropagation()}>
        <h2>{tl('确认导入存档')}</h2>
        <table>
          <thead><tr><th /><th>{tl('当前存档')}</th><th>{tl('要导入的')}</th></tr></thead>
          <tbody>{rows.map(([k, f]) => <tr key={k}><td className="muted">{k}</td><td>{f(cur)}</td><td>{f(next)}</td></tr>)}</tbody>
        </table>
        {(older || lower) && <p className="warn">{tl`要导入的存档${older ? tl('进度比现在的少') : ''}${older && lower ? tl('，') : ''}${lower ? tl('总等级更低') : ''}。确定要用它覆盖吗？覆盖后当前进度就没了。`}</p>}
        {!older && !lower && <p className="muted">{tl('要导入的存档进度更多，可以放心覆盖。')}</p>}
        <div className="go">
          <button onClick={onCancel}>{tl('取消')}</button>
          <button className={older || lower ? 'danger' : 'primary'} onClick={onOk}>{tl('覆盖当前存档')}</button>
        </div>
      </div>
    </div>
  );
}

/** 每个技能只显示最终等级，避免逐级刷屏 */
function finalLevels(sum: Summary): [SkillId, number][] {
  const last = new Map<SkillId, number>();
  for (const l of sum.levelUps) last.set(l.skill, l.level);
  return [...last];
}

export function OfflineModal({ sum }: { sum: Summary }) {
  const xp = Object.entries(sum.xp) as [SkillId, number][];
  const items = Object.entries(sum.items).filter(([id, q]) => q !== 0 && ITEMS[id]);
  const kills = Object.values(sum.kills).reduce((a, b) => a + b, 0);
  const st = store.state;
  // 中途卡住的都列出来；正常做完的只在最后队列空了时提一句
  const ends = sum.taskEnds.filter((t, i) => t.reason !== 'complete' || (i === sum.taskEnds.length - 1 && !st.queue.length));
  return (
    <div className="modal-bg">
      <div className="modal frame">
        <h2>{tl('离开期间的收获')}</h2>
        <p className="muted">{tl`你离开了 ${fmtDuration(sum.elapsedMs)}`}</p>
        {!xp.length && !items.length && <p>{tl('角色一直在发呆……下次离开前记得安排任务。')}</p>}
        {xp.map(([k, v]) => (
          <div key={k} className="row1"><span className="with-icon"><SkillIcon skill={k} size={18} /> <span style={{ color: SKILLS[k].color }}>{SKILLS[k].name}</span></span><b>{tl`+${fmtNum(v)} 经验`}</b></div>
        ))}
        {sum.levelUps.length > 0 && (
          <p className="gold">{tl`升级：${finalLevels(sum).map(([k, l]) => tl`${SKILLS[k].name} → ${l} 级`).join(tl('、'))}`}</p>
        )}
        {kills > 0 && <p>{tl`击败 ${kills} 只怪物`}{sum.foodEaten > 0 && tl`，吃掉 ${sum.foodEaten} 份食物`}</p>}
        {sum.deaths > 0 && <p className="warn">{tl`阵亡 ${sum.deaths} 次${sum.taskEnds.some((t) => t.reason === 'death') ? tl('，连续阵亡太多次，战斗已停止') : tl('，每次都回城复活后走回去接着打')}`}</p>}
        {sum.bankTrips > 0 && <p className="muted">{tl`背包满了回仓库存东西 ${sum.bankTrips} 次`}</p>}
        {sum.quests && sum.quests.length > 0 && <p className="gold">{tl`完成新手任务 ${sum.quests.length} 个`}</p>}
        {ends.length > 0 && (
          <div className="off-ends">
            {ends.map((t, i) => <p key={i} className={t.reason === 'complete' ? 'muted' : 'warn'}>⚠ {stopText(t.reason, t.action, t.reason === 'noInput' && st.lastStop?.action === t.action ? st.lastStop.item : undefined)}</p>)}
          </div>
        )}
        <p className="off-now">{tl`现在：${st.queue[0] ? `${st.paused ? tl('已暂停 · ') : ''}${actionName(st.queue[0].action)}${st.queue.length > 1 ? tl`，后面还排着 ${st.queue.length - 1} 个任务` : ''}` : tl('没有任务，角色在发呆')}`}</p>
        <div className="loot">
          {items.map(([id, q]) => (
            <span key={id} className={q < 0 ? 'neg' : ''}><Icon item={id} size={18} /> {ITEMS[id].name} {q > 0 ? '+' : ''}{fmtNum(q)}</span>
          ))}
        </div>
        <button className="primary" onClick={() => store.dismissOffline()}>{tl('收下')}</button>
      </div>
    </div>
  );
}

/** 宽屏右侧的地点列表，按区域分组 */
/** 地点列表（电脑端右侧）：按用途分类，玩家一眼知道去哪练什么（用户 10-23） */
type NodeTab = { id: string; name: string; skill?: SkillId };
const NODE_TABS: NodeTab[] = [
  { id: 'town', name: tl('城镇设施') }, { id: 'stone', name: tl('传送石碑') },
  { id: 'mining', name: tl('采矿'), skill: 'mining' }, { id: 'woodcutting', name: tl('伐木'), skill: 'woodcutting' },
  { id: 'fishing', name: tl('钓鱼'), skill: 'fishing' }, { id: 'gathering', name: tl('采集'), skill: 'gathering' },
  { id: 'hunting', name: tl('狩猎'), skill: 'hunting' }, { id: 'farming', name: tl('种植'), skill: 'farming' },
  { id: 'thieving', name: tl('偷窃'), skill: 'thieving' }, { id: 'boss', name: tl('首领') }, { id: 'cave', name: tl('洞窟') },
];
const BOSSES = Object.values(MONSTERS).filter((m) => m.rank === 'boss').sort((a, b) => a.level - b.level);
/** 设施属于哪座城：主城的设施名字不带前缀，其他城镇是「城名·设施」 */
// 设施名是「城名·设施」；英文里没有「·」，按城名前缀拆
const TOWN_NAMES = [tl('落霞城'), ...TOWNS.map((t) => t.name)].sort((a, b) => b.length - a.length);
const splitTown = (name: string): [string, string] | null => {
  if (name.includes('·')) { const i = name.indexOf('·'); return [name.slice(0, i), name.slice(i + 1)]; }
  const town = TOWN_NAMES.find((tn) => name.startsWith(`${tn} `));
  return town ? [town, name.slice(town.length + 1)] : null;
};
const townName = (n: MapNode) => (n.region === 'town' ? tl('主城') : n.waystone ? n.name.replace(tl('石碑·'), '') : splitTown(n.name)?.[0] ?? tl('落霞城'));

export function NodeList({ s, onPick }: { s: GameState; onPick: (id: string) => void }) {
  const [tabId, setTabId] = useSticky('nodes.tab', 'town');
  const tab = NODE_TABS.find((t) => t.id === tabId)!;
  let rows: { key: string; id: string; name: string; sub: string; lv?: string; dim?: boolean }[] = [];
  if (tab.id === 'town') {
    rows = NODES.filter((n) => n.town).map((n) => {
      const kinds = n.portal ? [tl('进家园岛屿')] : n.waystone ? [tl('传送')] : n.farm ? [tl('种植')] : n.id === RANCH ? [tl('养马')] : [...new Set(n.actions.map((id) => { const a = ACTIONS[id]; return a.kind === 'skill' ? SKILLS[a.skill].name : tl('战斗'); }))];
      if (n.id.includes('market')) kinds.unshift(tl('买卖'));
      return { key: n.id, id: n.id, name: n.waystone ? tl('传说石碑') : splitTown(n.name)?.[1] ?? n.name, sub: `${townName(n)} · ${n.closed ? tl('暂未开放') : n.opens === 'bank' ? tl('存取物品') : kinds.join(tl('、'))}`, dim: n.closed };
    }).sort((a, b) => (a.sub.startsWith(tl('主城')) === b.sub.startsWith(tl('主城')) ? 0 : a.sub.startsWith(tl('主城')) ? -1 : 1));
  } else if (tab.id === 'boss') {
    rows = BOSSES.map((m) => ({ key: m.id, id: `fight_${m.id}`, name: m.name, sub: `${REGIONS[m.region].name} · ${s.bestiary?.[m.id] ? tl`已击败 ${s.bestiary[m.id]} 次` : tl('未击败')}`, lv: `Lv${m.level}` }));
  } else if (tab.id === 'stone') {
    rows = WAYSTONES.map((n) => {
      const on = s.waystones?.includes(n.id);
      return { key: n.id, id: n.id, name: n.name.replace(tl('传说石碑·'), ''), sub: `${REGIONS[n.region].name} · ${on ? tl('已激活') : tl('未激活')}`, dim: !on };
    });
  } else if (tab.id === 'cave') {
    rows = NODES.filter((n) => n.cave).map((n) => ({ key: n.id, id: n.id, name: n.name, sub: tl`${REGIONS[n.region].name} · 未开放`, dim: true }));
  } else {
    rows = NODES.filter((n) => !n.town || tab.skill === 'thieving' || tab.skill === 'farming').flatMap((n) => {
      const lv = n.farm ? cropsOfField(n.id).map((c) => c.level) : n.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'skill' && a.skill === tab.skill).map((a) => a.level);
      if (!lv.length) return [];
      const lo = Math.min(...lv);
      const hi = Math.max(...lv);
      const lock = level(s, tab.skill!) < lo;
      return [{ key: n.id, id: n.id, name: n.name, sub: `${n.town ? townName(n) : REGIONS[n.region].name} · ${n.farm ? cropsOfField(n.id).map((c) => c.name).join(tl('、')) : tl`${lv.length} 项`}`, lv: lo === hi ? tl`${lo} 级` : tl`${lo}-${hi} 级`, dim: lock, lo }];
    }).sort((a, b) => a.lo - b.lo);
  }
  // 采矿、伐木、钓鱼、采集、狩猎、偷窃：按资源列出来，下面写它在哪些地点（用户 10-25：不用一个个点进地点找）
  const byRes = !!tab.skill && tab.skill !== 'farming';
  // 同一种资源在不同地点是不同的动作：按产出物品合并成一行
  const res: { key: string; name: string; item?: string; skill: SkillId; level: number; spots: { action: string; node: MapNode }[] }[] = [];
  if (byRes) {
    const by = new Map<string, (typeof res)[number]>();
    for (const a of Object.values(ACTIONS)) {
      if (a.kind !== 'skill' || a.skill !== tab.skill) continue;
      const nodes = nodesOfAction(a.id).filter((n) => !n.closed);
      if (!nodes.length) continue;
      const out = a.outputs.find((o) => !o.chance && o.item !== 'coins')?.item;
      const key = out ?? a.name;
      let r = by.get(key);
      if (!r) by.set(key, (r = { key, name: out ? ITEMS[out].name : a.name, item: out, skill: a.skill, level: a.level, spots: [] }));
      r.level = Math.min(r.level, a.level);
      for (const n of nodes) if (!r.spots.some((x) => x.node.id === n.id)) r.spots.push({ action: a.id, node: n });
    }
    res.push(...[...by.values()].sort((a, b) => a.level - b.level));
  }
  const goRes = (actionId: string, nodeId: string) => {
    store.focusAction = actionId;
    onPick(nodeId);
  };
  return (
    <div className="page node-page">
      <h2>{tl('地点 ')}<small className="muted">{tl('点地图上的地点或下面的列表选任务，右下角 ▦ 打开世界地图')}</small></h2>
      <div className="chips-row region-tabs">
        {NODE_TABS.map((t) => (
          <button key={t.id} className={`pill ${t.id === tab.id ? 'on' : ''}`} onClick={() => setTabId(t.id)}>
            {t.skill && <SkillIcon skill={t.skill} size={14} />}{t.name}
          </button>
        ))}
      </div>
      {tab.skill && <p className="muted">{tl`${SKILLS[tab.skill].name}当前 ${level(s, tab.skill)} 级，灰色的是还没到等级的地点。`}</p>}
      {byRes && (
        <ul className="res-list">
          {res.map((a) => {
            const lock = level(s, a.skill) < a.level;
            return (
              <li key={a.key} className={lock ? 'dim' : ''}>
                <div className="res-head">
                  {a.item ? <Icon item={a.item} size={26} /> : <SkillIcon skill={a.skill} size={22} />}
                  <b>{a.name}</b>
                  <small className="muted">{tl`${a.level} 级`}{tl` · ${a.spots.length} 处`}</small>
                </div>
                <div className="res-spots">
                  {a.spots.map(({ action, node: n }) => (
                    <button key={n.id} onClick={() => goRes(action, n.id)}>
                      {n.name}<small className="muted"> · {n.town ? townName(n) : REGIONS[n.region].name}</small>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="node-list grid2">
        {!byRes && rows.map((r) => (
          <li key={r.key}>
            <button onClick={() => onPick(r.id)} className={r.dim ? 'cave' : ''}>
              <span className="row1"><b>{r.name}</b>{r.lv && <small className="muted">{r.lv}</small>}</span>
              <small className="muted">{r.sub}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
