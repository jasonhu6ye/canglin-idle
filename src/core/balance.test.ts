import { describe, expect, it } from 'vitest';
import { combatEstimate, newGame } from './sim';
import { EQUIP_TYPES, ITEMS, MONSTERS, TIERS } from './data';
import { XP_TABLE } from './xp';

/*
 * 武器平衡（用户 10-31：各有优劣，可以有的稍强，但不许差太多、不许超模）。
 * 每把武器在 T2/T4/T6/T8：同阶板甲 + 灯笼（双手武器没副手），比上一阶等级高 5 级，
 * 打同阶附近所有怪（不含世界首领）的平均每小时击杀数，以剑为 100。双手大盾是坦克，不算。
 */
const WEAPONS = EQUIP_TYPES.filter((e) => e.slot === 'weapon' && e.key !== 'greatshield' && e.minTier === undefined).map((e) => e.key);

/** offhand：单手武器配的副手（默认灯笼）；extra：额外比较的武器（特殊装备） */
export function weaponScores(ti: number, extra: string[] = [], offhand = 'lantern') {
  const t = TIERS[ti];
  const lv = t.level + 5;
  const mons = Object.values(MONSTERS).filter((m) => !m.world && m.level >= t.level - 3 && m.level <= t.level + 8);
  const res: Record<string, number> = {};
  for (const w of [...WEAPONS, ...extra]) {
    const s = newGame(1_700_000_000_000, 1);
    for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[lv];
    for (const sl of ['head', 'body', 'feet', 'hands'] as const) s.equipment[sl] = `${t.id}_plate_${sl}`;
    s.equipment.weapon = `${t.id}_${w}`;
    if (!ITEMS[`${t.id}_${w}`].equip!.twoHanded) s.equipment.offhand = `${t.id}_${w === 'sword' ? 'lantern' : offhand}`;
    let kph = 0;
    for (const m of mons) kph += 3_600_000 / combatEstimate(s, m).killMs;
    res[w] = kph / mons.length;
  }
  const base = res.sword;
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Math.round((v / base) * 100)]));
}

describe('武器平衡（10-31）', () => {
  it('特殊装备（T7/T8）：幽魂链刃比普通武器强一点但不超模，配提灯再强一点', () => {
    for (const ti of [6, 7]) {
      const lan = weaponScores(ti, ['chainblade']).chainblade;
      const lamp = weaponScores(ti, ['chainblade'], 'soullamp').chainblade;
      expect(lan, `T${ti + 1} 链刃+灯笼`).toBeGreaterThanOrEqual(104);
      expect(lan, `T${ti + 1} 链刃+灯笼`).toBeLessThanOrEqual(114);
      expect(lamp, `T${ti + 1} 链刃+提灯`).toBeGreaterThan(lan);
      expect(lamp, `T${ti + 1} 链刃+提灯`).toBeLessThanOrEqual(120);
    }
    // 品质越高连斩概率越高（用户 10-31）
    const ch = [0, 1, 2, 3, 4, 5].map((q) => ITEMS[`t7_chainblade${q ? `@q${q}` : ''}`]?.equip?.chain ?? ITEMS[`${TIERS[6].id}_chainblade${q ? `@q${q}` : ''}`].equip!.chain!);
    expect(ch[0]).toBe(0.17);
    expect(ch[5]).toBe(0.34);
    for (let q = 1; q < 6; q++) expect(ch[q]).toBeGreaterThan(ch[q - 1]);
  });

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
