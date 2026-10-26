import { describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, JEWEL_TYPES, jewelId, TIERS } from './data';
import { advance, armorPerks, gearSum, maxHp, migrate, newGame, playerHaste, startNow } from './sim';

const T0 = 1_800_000_000_000;

describe('饰品（10-26 重做）', () => {
  it('每阶 10 种：项链 5、戒指 5，都能在工艺里做，晶石有用途了', () => {
    expect(JEWEL_TYPES.filter((j) => j.slot === 'neck')).toHaveLength(5);
    expect(JEWEL_TYPES.filter((j) => j.slot === 'ring')).toHaveLength(5);
    TIERS.forEach((_, i) => {
      for (const j of JEWEL_TYPES) {
        const id = jewelId(i, j.key);
        expect(ITEMS[id]?.equip?.slot, id).toBe(j.slot);
        const a = ACTIONS[`craft_${id}`];
        expect(a, id).toBeTruthy();
        expect(a.kind === 'skill' && a.inputs?.some((x) => x.item === `crystal_${i + 1}`), id).toBe(true);
        expect(ITEMS[id].value).toBeGreaterThan(0);
      }
    });
    expect(ITEMS.sapphire_ring).toBeUndefined();
  });

  it('加成生效：生命、攻速、暴击、闪避；经验戒/项链让经验变多', () => {
    const s = newGame(T0, 1);
    const base = { hp: maxHp(s), haste: playerHaste(s), ...armorPerks(s) };
    s.equipment.ring = jewelId(3, 'ring_life');
    expect(maxHp(s)).toBe(base.hp + ITEMS[jewelId(3, 'ring_life')].equip!.hp!);
    s.equipment.ring = jewelId(3, 'ring_fury');
    expect(armorPerks(s).crit).toBeCloseTo(base.crit + 0.025);
    s.equipment.ring = jewelId(3, 'ring_shadow');
    expect(armorPerks(s).dodge).toBeCloseTo(base.dodge + 0.025);
    s.equipment.neck = jewelId(7, 'neck_swift');
    expect(playerHaste(s)).toBeCloseTo(0.1);
    const run = (neck?: string) => {
      const g = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
      if (neck) g.equipment.neck = neck;
      return advance(g, T0 + 3600_000).state.xp.mining;
    };
    expect(run(jewelId(7, 'neck_sage')) / run()).toBeGreaterThan(1.08);
    expect(gearSum(s, 'xp')).toBe(0);
  });

  it('旧饰品读档时按售价折成金币（背包、仓库、身上，含品质）', () => {
    const s = newGame(T0, 1) as unknown as Record<string, unknown>;
    const st = s as unknown as ReturnType<typeof newGame>;
    const coins = st.bank.coins ?? 0;
    const raw = JSON.parse(JSON.stringify({ ...s, bag: { sapphire_ring: 2 }, bank: { ...st.bank, 'ruby_amulet@q2': 1 }, equipment: { ...st.equipment, ring: 'diamond_ring' } }));
    const m = migrate(raw)!;
    expect(m.bag.sapphire_ring).toBeUndefined();
    expect(m.equipment.ring).toBeUndefined();
    expect(m.bank.coins - coins).toBe(520 * 2 + 740 * 2.5 + 1000);
  });
});
