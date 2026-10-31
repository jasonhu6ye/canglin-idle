import { describe, expect, it } from 'vitest';
import { combatEstimate, newGame } from './sim';
import { EQUIP_TYPES, ITEMS, MONSTERS, TIERS } from './data';
import { XP_TABLE } from './xp';

/*
 * 武器平衡（用户 10-31：各有优劣，可以有的稍强，但不许差太多、不许超模）。
 * 每把武器在 T2/T4/T6/T8：同阶板甲 + 灯笼（双手武器没副手），比上一阶等级高 5 级，
 * 打同阶附近所有怪（不含世界首领）的平均每小时击杀数，以剑为 100。双手大盾是坦克，不算。
 */
const WEAPONS = EQUIP_TYPES.filter((e) => e.slot === 'weapon' && e.key !== 'greatshield').map((e) => e.key);

export function weaponScores(ti: number) {
  const t = TIERS[ti];
  const lv = t.level + 5;
  const mons = Object.values(MONSTERS).filter((m) => !m.world && m.level >= t.level - 3 && m.level <= t.level + 8);
  const res: Record<string, number> = {};
  for (const w of WEAPONS) {
    const s = newGame(1_700_000_000_000, 1);
    for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[lv];
    for (const sl of ['head', 'body', 'feet', 'hands'] as const) s.equipment[sl] = `${t.id}_plate_${sl}`;
    s.equipment.weapon = `${t.id}_${w}`;
    if (!ITEMS[`${t.id}_${w}`].equip!.twoHanded) s.equipment.offhand = `${t.id}_lantern`;
    let kph = 0;
    for (const m of mons) kph += 3_600_000 / combatEstimate(s, m).killMs;
    res[w] = kph / mons.length;
  }
  const base = res.sword;
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Math.round((v / base) * 100)]));
}

describe('武器平衡（10-31）', () => {
  it('每一阶所有输出武器都在剑的 92%-112% 之间', () => {
    for (const ti of [1, 3, 5, 7]) {
      const sc = weaponScores(ti);
      for (const [w, v] of Object.entries(sc)) {
        expect(v, `T${ti + 1} ${w}`).toBeGreaterThanOrEqual(92);
        expect(v, `T${ti + 1} ${w}`).toBeLessThanOrEqual(112);
      }
    }
  });
});
