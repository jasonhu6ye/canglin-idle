import { describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, MONSTERS, TIERS } from './data';
import { advance, combatEstimate, gearSum, newGame, startNow } from './sim';

const T0 = 1_800_000_000_000;

describe('护甲分工和灯笼（10-26）', () => {
  it('板甲防御最高、布甲攻击力量最高、皮甲居中', () => {
    TIERS.forEach((t) => {
      const [p, l, c] = ['plate', 'leather', 'cloth'].map((m) => ITEMS[`${t.id}_${m}_body`].equip!);
      expect(p.defence).toBeGreaterThan(l.defence);
      expect(l.defence).toBeGreaterThan(c.defence);
      expect(c.attack + c.strength).toBeGreaterThan(l.attack + l.strength);
      expect(l.attack + l.strength).toBeGreaterThan(p.attack + p.strength);
      expect(p.attack + p.strength).toBeGreaterThan(0);
    });
  });

  it('灯笼：任何战斗方式都加力量，固定 5% 吸血（品质不变），打怪会回血', () => {
    TIERS.forEach((t) => {
      const e = ITEMS[`${t.id}_lantern`].equip!;
      expect(e.slot).toBe('offhand');
      expect(e.style).toBeUndefined();
      expect(e.strength).toBeGreaterThan(0);
      expect(e.leech).toBe(0.05);
      expect(ITEMS[`${t.id}_lantern@q5`].equip!.leech).toBe(0.05);
      const a = ACTIONS[`smith_${t.id}_lantern`];
      expect(a?.kind === 'skill' && a.inputs?.some((x) => x.item.startsWith('resin_'))).toBe(true);
    });
    const id = Object.values(ACTIONS).filter((a) => a.kind === 'combat' && !MONSTERS[a.monster].event && MONSTERS[a.monster].maxHit > 0).sort((a, b) => MONSTERS[(a as { monster: string }).monster].level - MONSTERS[(b as { monster: string }).monster].level)[0].id;
    const m = MONSTERS[(ACTIONS[id] as { monster: string }).monster];
    const s = newGame(T0, 1);
    s.equipment.weapon = 'wood_sword';
    const base = combatEstimate(s, m).taken;
    s.equipment.offhand = 'wood_lantern';
    expect(gearSum(s, 'leech')).toBe(0.05);
    expect(combatEstimate(s, m).taken).toBeLessThan(base);
    let g = startNow(s, id, { type: 'infinite' });
    let healed = 0;
    for (let k = 1; k <= 600 && !healed; k++) {
      g = advance(g, T0 + k * 1000).state;
      healed = g.combat?.pLeech ?? 0;
    }
    expect(healed).toBeGreaterThan(0);
  });
});
