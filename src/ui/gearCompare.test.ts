import { describe, expect, it } from 'vitest';
import { newGame } from '../core/sim';
import { XP_TABLE } from '../core/xp';
import { compareGear, withGear } from './GearCompare';

describe('装备对比（11-01）', () => {
  const base = () => {
    const s = newGame(1_700_000_000_000, 1);
    for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[45];
    s.equipment.weapon = 'iron_sword';
    s.equipment.offhand = 'iron_lantern';
    return s;
  };
  it('高阶武器打怪效率更高，低阶更低；逐项列出涨跌', () => {
    const s = base();
    const up = compareGear(s, 'titanium_sword')!;
    expect(up.cur).toBe('iron_sword');
    expect(up.fight!.kph).toBeGreaterThan(0);
    expect(up.rows.find((r) => r.b > r.a)).toBeDefined();
    expect(compareGear(s, 'copper_sword')!.fight!.kph).toBeLessThan(0);
    expect(compareGear(s, 'iron_sword')).toBeNull();
  });
  it('换双手武器会提示卸下副手，算效率时也不带副手', () => {
    const s = base();
    expect(compareGear(s, 'iron_warhammer')!.drops).toBe('iron_lantern');
    expect(withGear(s, 'iron_warhammer').equipment.offhand).toBeUndefined();
  });
});
