import { describe, expect, it } from 'vitest';
import { advance, combatEstimate, newGame, startNow, FROST } from './sim';
import { COMMON_EQUIP, EQUIP_TYPES, ITEMS, MONSTERS, NODES, nodeOfAction, standOf, TIERS } from './data';
import { XP_TABLE } from './xp';
import type { GameState } from './types';
import { weaponScores } from './balance.test';

const T0 = 1_700_000_000_000;
const T8 = TIERS[7].id;

function fighter(weapon: string, seed = 3) {
  const s = newGame(T0, seed);
  for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[110];
  for (const sl of ['head', 'body', 'feet', 'hands'] as const) s.equipment[sl] = `${T8}_plate_${sl}`;
  s.equipment.weapon = `${T8}_${weapon}`;
  return s;
}
/** 找一只 T8 附近、会还手的普通怪 */
const action = (() => {
  const m = Object.values(MONSTERS).find((m) => !m.world && m.rank === 'normal' && m.level >= 95 && m.level <= 100 && m.maxHit > 0 && nodeOfAction(`fight_${m.id}`) && !nodeOfAction(`fight_${m.id}`)!.timed)!;
  return `fight_${m.id}`;
})();

/** 一小段一小段推进，数出手、触发次数 */
function run(s0: GameState, ms: number) {
  let s = startNow(s0, action, { type: 'infinite' });
  s.loc = standOf(nodeOfAction(action)!);
  s.queue[0].stocked = true;
  s.settings.carryFood = 0;
  let t = T0, swings = 0, frost = 0, mHits = 0, guard = 0, lastP = 0, lastM = 0;
  while (t < T0 + ms) {
    t += 100;
    s = advance(s, t).state;
    s.hp = 1e6; // 不让人死，只看触发
    const c = s.combat;
    if (!c) continue;
    if ((c.pSwings ?? 0) !== lastP) { lastP = c.pSwings ?? 0; if ((c.pDmg ?? -1) > 0) { swings++; if (c.pFrost) frost++; } }
    if ((c.mSwings ?? 0) !== lastM) { lastM = c.mSwings ?? 0; if ((c.mDmg ?? -1) > 0) { mHits++; if (c.mFrost) guard++; } }
  }
  return { swings, frost, mHits, guard, s };
}

describe('永霜之弓、永霜盾（11-02）', () => {
  it('只有 T7、T8，双手，不在野外/福袋/宝箱掉，材料永霜之心', () => {
    expect(ITEMS[`${TIERS[5].id}_frostbow`]).toBeUndefined();
    expect(ITEMS[`${TIERS[6].id}_frostbow`]).toBeDefined();
    expect(ITEMS[`${TIERS[6].id}_frostshield`]).toBeDefined();
    expect(ITEMS.frostheart_7).toBeDefined();
    for (const k of ['frostbow', 'frostshield']) {
      const e = ITEMS[`${T8}_${k}`].equip!;
      expect(e.twoHanded).toBe(true);
      expect(COMMON_EQUIP().some((x) => x.key === k)).toBe(false);
      expect(EQUIP_TYPES.find((x) => x.key === k)!.mats.some(([m]) => m === 'frostheart')).toBe(true);
      // 品质不改触发概率
      expect(ITEMS[`${T8}_${k}@q5`].equip!.frost ?? ITEMS[`${T8}_${k}@q5`].equip!.guard).toBe(k === 'frostbow' ? 0.12 : 0.17);
    }
    expect(ITEMS[`${T8}_frostbow`].equip!.style).toBe('ranged');
    expect(ITEMS.frostheart_8).toBeDefined();
  });

  it('永冬首领会掉永霜之心', () => {
    for (const id of ['wb_everfrost_giant', 'wb_snow_baron']) for (const h of ['frostheart_7', 'frostheart_8']) expect(MONSTERS[id].drops.some((d) => d.item === h)).toBe(true);
    // 普通怪不掉
    expect(Object.values(MONSTERS).filter((m) => !m.winter).some((m) => m.drops.some((d) => d.item.startsWith('frostheart_')))).toBe(false);
    expect(NODES.length).toBeGreaterThan(0);
  });

  it('永霜之弓：大约 12% 的命中触发冻结', () => {
    const r = run(fighter('frostbow'), 3 * 3_600_000);
    expect(r.swings).toBeGreaterThan(1500);
    const p = r.frost / r.swings;
    expect(p).toBeGreaterThan(0.09);
    expect(p).toBeLessThan(0.15);
    // 别的武器从不触发
    expect(run(fighter('arbalest'), 600_000).frost).toBe(0);
  });

  it('永霜盾：大约 17% 的被打中触发寒冰护体，护体 7 秒后消失', () => {
    const r = run(fighter('frostshield'), 3 * 3_600_000);
    expect(r.mHits).toBeGreaterThan(300);
    const p = r.guard / r.mHits;
    expect(p).toBeGreaterThan(0.12);
    expect(p).toBeLessThan(0.22);
    const s = { ...r.s, frostGuard: FROST.guardMs, queue: [], combat: null };
    const later = advance(s, r.s.lastTick + FROST.guardMs + 10).state;
    expect(later.frostGuard).toBeUndefined();
  });

  it('寒冰护体期间怪物命中率明显降低；评估里永霜盾比双手大盾掉血少', () => {
    const s = fighter('frostshield');
    const m = MONSTERS[action.slice(6)];
    const a = combatEstimate(s, m);
    const g = combatEstimate({ ...s, equipment: { ...s.equipment, weapon: `${T8}_greatshield` } }, m);
    expect(a.taken / a.killMs).toBeLessThan(g.taken / g.killMs);
  });

  it('强度：永霜之弓和幽魂链刃差不多，不超过链刃配提灯（T7、T8）', () => {
    for (const ti of [6, 7]) {
      const sc = weaponScores(ti, ['frostbow', 'chainblade']);
      const lamp = weaponScores(ti, ['chainblade'], 'soullamp').chainblade;
      expect(sc.frostbow, `T${ti + 1}`).toBeGreaterThanOrEqual(104);
      expect(sc.frostbow, `T${ti + 1}`).toBeLessThanOrEqual(lamp);
    }
  });
});
