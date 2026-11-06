import { ACTIONS, ITEMS, MONSTERS } from '../core/data';
import { combatEstimate, combatLevel, level } from '../core/sim';
import type { GameState, ItemDef, MonsterDef } from '../core/types';
import { hitPct } from './format';
import { tl } from '../i18n';

/*
 * 装备对比（用户 11-01）：看一件装备时，和身上同一栏正穿着的那件逐项比，涨的绿色、降的红色；
 * 战斗装备再算一下换上以后打怪的效率和掉血（对着正在打的怪，没在打怪就用和战斗等级相近的一批怪）。
 */

type Eq = NonNullable<ItemDef['equip']>;
interface Stat { label: string; get: (e: Eq) => number; fmt: (v: number) => string; lower?: boolean }
const p1 = (v: number) => `${Math.round(v * 1000) / 10}%`;
const STATS: Stat[] = [
  { label: tl('攻击力'), get: (e) => e.strength, fmt: (v) => `${v}` },
  { label: tl('命中'), get: (e) => e.attack, fmt: (v) => `${hitPct(v)}%` },
  { label: tl('出手间隔'), get: (e) => (e.slot === 'weapon' ? e.attackMs ?? 0 : 0), fmt: (v) => tl`${(v / 1000).toFixed(1)} 秒`, lower: true },
  { label: tl('防御'), get: (e) => e.defence, fmt: (v) => `${v}` },
  { label: tl('防御加成'), get: (e) => e.defPct ?? 0, fmt: p1 },
  { label: tl('伤害加成'), get: (e) => e.dmgPct ?? 0, fmt: p1 },
  { label: tl('速度'), get: (e) => e.speed ?? 0, fmt: (v) => `${Math.round(v * 100)}%` },
  { label: tl('移速'), get: (e) => e.move ?? 0, fmt: (v) => `${Math.round(v * 100)}%` },
  { label: tl('攻速'), get: (e) => e.haste ?? 0, fmt: p1 },
  { label: tl('生命'), get: (e) => e.hp ?? 0, fmt: (v) => `${v}` },
  { label: tl('背包格'), get: (e) => e.bag ?? 0, fmt: (v) => `${v}` },
  { label: tl('经验（烧金币）'), get: (e) => e.sage ?? 0, fmt: p1 },
  { label: tl('经验'), get: (e) => e.xp ?? 0, fmt: p1 },
  { label: tl('掉率'), get: (e) => e.luck ?? 0, fmt: p1 },
  { label: tl('暴击'), get: (e) => e.crit ?? 0, fmt: p1 },
  { label: tl('闪避'), get: (e) => e.dodge ?? 0, fmt: p1 },
  { label: tl('干活速度'), get: (e) => e.work ?? 0, fmt: p1 },
  { label: tl('吸血'), get: (e) => e.leech ?? 0, fmt: p1 },
  { label: tl('连斩'), get: (e) => e.chain ?? 0, fmt: p1 },
  { label: tl('冻结'), get: (e) => e.frost ?? 0, fmt: p1 },
  { label: tl('寒冰护体'), get: (e) => e.guard ?? 0, fmt: p1 },
  { label: tl('破甲'), get: (e) => e.sunder ?? 0, fmt: p1 },
  { label: tl('斩杀'), get: (e) => e.execute ?? 0, fmt: p1 },
  { label: tl('反伤'), get: (e) => e.thorns ?? 0, fmt: p1 },
  { label: tl('暴击伤害'), get: (e) => e.critDmg ?? 0, fmt: p1 },
  { label: tl('武器特效触发'), get: (e) => e.proc ?? 0, fmt: p1 },
  { label: tl('嘲讽'), get: (e) => e.threat ?? 0, fmt: (v) => `${v}` },
];
const COMBAT_SLOTS = new Set(['weapon', 'offhand', 'head', 'body', 'feet', 'hands', 'neck', 'ring']);

/** 换上 id 以后的存档（只改装备栏，不动背包）：双手武器和副手互斥，跟 equip() 一样 */
export function withGear(s: GameState, id: string): GameState {
  const e = ITEMS[id]!.equip!;
  const eq = { ...s.equipment, [e.slot]: id };
  if (e.twoHanded) delete eq.offhand;
  if (e.slot === 'offhand' && ITEMS[eq.weapon ?? '']?.equip?.twoHanded) delete eq.weapon;
  return { ...s, equipment: eq };
}

/** 拿来比较的怪：正在打的那只；没在打就挑战斗等级附近的一批普通怪 */
function refMonsters(s: GameState): MonsterDef[] {
  const a = s.queue[0] ? ACTIONS[s.queue[0].action] : undefined;
  if (a?.kind === 'combat' && MONSTERS[a.monster]) return [MONSTERS[a.monster]];
  const cl = combatLevel(s);
  const all = Object.values(MONSTERS).filter((m) => !m.world && !m.event && !m.dungeon && m.rank === 'normal');
  const near = all.filter((m) => m.level >= cl - 3 && m.level <= cl + 5);
  return (near.length ? near : all.sort((x, y) => Math.abs(x.level - cl) - Math.abs(y.level - cl)).slice(0, 8)).slice(0, 24);
}

/** 打怪效率（每小时击杀）和每只掉血，取平均 */
function fightScore(s: GameState, mons: MonsterDef[]) {
  let kph = 0, taken = 0, dps = 0;
  for (const m of mons) {
    const r = combatEstimate(s, m);
    dps += Number.isFinite(r.dps) ? r.dps : 0;
    kph += Number.isFinite(r.killMs) ? 3_600_000 / r.killMs : 0;
    taken += Number.isFinite(r.taken) ? r.taken : 1e6;
  }
  return { kph: kph / mons.length, taken: taken / mons.length, dps: dps / mons.length };
}

/** 界面每秒刷新好几次，同样的装备和怪就别重算（换了装备、升了级、换了怪才重算） */
const cache = new Map<string, ReturnType<typeof compareRaw>>();
export function compareGear(s: GameState, id: string) {
  const key = `${id}|${JSON.stringify(s.equipment)}|${(['melee', 'ranged', 'magic', 'defence', 'hitpoints'] as const).map((k) => level(s, k)).join(',')}|${s.queue[0]?.action ?? ''}`;
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    cache.set(key, compareRaw(s, id));
  }
  return cache.get(key)!;
}
function compareRaw(s: GameState, id: string) {
  const e = ITEMS[id]?.equip;
  if (!e) return null;
  const cur = s.equipment[e.slot];
  if (cur === id) return null;
  const c = cur ? ITEMS[cur]?.equip : undefined;
  const rows = STATS.map((st) => ({ st, a: c ? st.get(c) : 0, b: st.get(e) })).filter((r) => r.a || r.b);
  let fight: { kph: number; taken: number; mon: string; dpsA: number; dpsB: number } | null = null;
  if (COMBAT_SLOTS.has(e.slot)) {
    const mons = refMonsters(s);
    if (mons.length) {
      const before = fightScore(s, mons);
      const after = fightScore(withGear(s, id), mons);
      fight = {
        kph: before.kph > 0 ? after.kph / before.kph - 1 : after.kph > 0 ? 1 : 0,
        taken: before.taken > 0 ? after.taken / before.taken - 1 : 0,
        mon: mons.length === 1 ? mons[0].name : '',
        dpsA: before.dps, dpsB: after.dps,
      };
    }
  }
  // 换双手武器会顺带卸下副手，换副手会卸下双手武器
  const drops = e.twoHanded && s.equipment.offhand ? s.equipment.offhand
    : e.slot === 'offhand' && ITEMS[s.equipment.weapon ?? '']?.equip?.twoHanded ? s.equipment.weapon : undefined;
  return { cur, rows, fight, drops };
}

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const dpsTxt = (v: number) => (v >= 100 ? `${Math.round(v)}` : v.toFixed(1));
const pctTxt = (v: number) => `${sign(v)}${Math.abs(Math.round(v * 100))}%`;

/** 详情里的对比表 */
export function GearCompare({ s, id }: { s: GameState; id: string }) {
  const r = compareGear(s, id);
  if (!r) return ITEMS[id]?.equip && s.equipment[ITEMS[id].equip!.slot] === id ? <div className="gear-compare muted">{tl('正穿在身上')}</div> : null;
  return (
    <div className="gear-compare">
      <div className="gc-head">{r.cur ? <>{tl('对比身上的')} <b>{ITEMS[r.cur].name}</b></> : tl('这一栏现在是空的')}</div>
      {r.fight && (
        <div className="gc-fight">
          <span className={r.fight.kph > 0.005 ? 'good' : r.fight.kph < -0.005 ? 'bad' : 'muted'}>{tl`打怪效率 ${pctTxt(r.fight.kph)}`}</span>
          <span className={r.fight.taken < -0.005 ? 'good' : r.fight.taken > 0.005 ? 'bad' : 'muted'}>{tl`掉血 ${pctTxt(r.fight.taken)}`}</span>
          <small className="muted">{r.fight.mon ? tl`对着正在打的 ${r.fight.mon}` : tl('按战斗等级附近的怪估算')}</small>
        </div>
      )}
      {r.fight && (r.fight.dpsA > 0 || r.fight.dpsB > 0) && (() => {
        const { dpsA: a, dpsB: b } = r.fight!;
        const d = a > 0 ? b / a - 1 : b > 0 ? 1 : 0;
        return (
          <div className="gc-dps">
            <span>{tl('每秒伤害（DPS）')}</span>
            <span className="muted">{dpsTxt(a)}</span>
            <b>→ {dpsTxt(b)}</b>
            <span className={d > 0.005 ? 'good' : d < -0.005 ? 'bad' : 'muted'}>{Math.abs(d) < 0.005 ? tl('不变') : pctTxt(d)}</span>
          </div>
        );
      })()}
      <table>
        <tbody>
          {r.rows.map(({ st, a, b }) => {
            const d = b - a;
            const better = st.lower ? d < 0 : d > 0;
            return (
              <tr key={st.label}>
                <td className="muted">{st.label}</td>
                <td className="muted">{a ? st.fmt(a) : '—'}</td>
                <td>→ {b ? st.fmt(b) : '—'}</td>
                <td className={d === 0 ? 'muted' : better ? 'good' : 'bad'}>{d === 0 ? '' : better ? '▲' : '▼'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {r.drops && <small className="warn">{tl`换上会卸下 ${ITEMS[r.drops].name}`}</small>}
    </div>
  );
}

/** 快速换装列表里每一行的简短对比：打怪效率变化，非战斗装备给最主要的一项 */
export function CompareChip({ s, id }: { s: GameState; id: string }) {
  const r = compareGear(s, id);
  if (!r) return null;
  if (r.fight) {
    const k = r.fight.kph;
    return <small className={k > 0.005 ? 'good' : k < -0.005 ? 'bad' : 'muted'}>{tl`打怪效率 ${pctTxt(k)}`}</small>;
  }
  const top = r.rows.find((x) => x.a !== x.b);
  if (!top) return null;
  const better = top.st.lower ? top.b < top.a : top.b > top.a;
  return <small className={better ? 'good' : 'bad'}>{`${top.st.label} ${top.a ? top.st.fmt(top.a) : '—'} → ${top.b ? top.st.fmt(top.b) : '—'}`}</small>;
}
