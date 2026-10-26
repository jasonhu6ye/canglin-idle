import { describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, MONSTERS, TIERS } from './data';
import { advance, armorPerks, combatEstimate, combatStats, gearSum, newGame, startNow } from './sim';

const T0 = 1_800_000_000_000;

describe('护甲分工和灯笼（10-26）', () => {
  it('护甲词条：板甲防御最高、布甲伤害加成最高、皮甲居中；衣服每项最高，鞋子手套多攻速；没有战斗方式限制', () => {
    TIERS.forEach((t) => {
      const [p, l, c] = ['plate', 'leather', 'cloth'].map((m) => ITEMS[`${t.id}_${m}_body`].equip!);
      expect(p.defence).toBeGreaterThan(l.defence);
      expect(l.defence).toBeGreaterThan(c.defence);
      expect(p.defPct!).toBeGreaterThan(l.defPct!);
      expect(l.defPct!).toBeGreaterThan(c.defPct!);
      expect(c.dmgPct!).toBeGreaterThan(l.dmgPct!);
      expect(l.dmgPct!).toBeGreaterThan(p.dmgPct!);
      for (const m of ['plate', 'leather', 'cloth']) {
        const body = ITEMS[`${t.id}_${m}_body`].equip!;
        expect(body.style).toBeUndefined();
        expect(body.attack + body.strength).toBe(0);
        expect(body.haste).toBeUndefined();
        for (const part of ['head', 'feet', 'hands']) {
          const e = ITEMS[`${t.id}_${m}_${part}`].equip!;
          expect(body.defence).toBeGreaterThan(e.defence);
          expect(body.defPct!).toBeGreaterThan(e.defPct!);
          expect(body.dmgPct!).toBeGreaterThan(e.dmgPct!);
          // 鞋子手套多一条：板甲闪避，皮甲布甲攻速
          expect((e.haste ?? 0) > 0).toBe(part !== 'head' && m !== 'plate');
          expect((e.dodge ?? 0) > 0).toBe(part !== 'head' && m === 'plate');
        }
      }
    });
  });

  it('护甲混搭：伤害加成和防御加成对弓也生效，套装效果按件算', () => {
    const s = newGame(T0, 1);
    s.equipment.weapon = 'wood_shortbow';
    const m = Object.values(MONSTERS).find((x) => x.rank === 'normal' && x.maxHit > 0 && !x.event)!;
    const base = combatStats(s, m);
    s.equipment.body = 'wood_cloth_body';
    s.equipment.head = 'wood_plate_head';
    s.equipment.feet = 'wood_leather_feet';
    s.equipment.hands = 'wood_plate_hands';
    const st = combatStats(s, m);
    expect(st.playerMaxHit).toBeGreaterThanOrEqual(base.playerMaxHit);
    expect(st.monsterHit).toBeLessThan(base.monsterHit);
    expect(armorPerks(s).reduce).toBeCloseTo(0.06);
    expect(armorPerks(s).dodge).toBeCloseTo(0.05 + ITEMS.wood_plate_hands.equip!.dodge!);
    expect(armorPerks(s).crit).toBeCloseTo(0.02);
    expect(gearSum(s, 'haste')).toBeGreaterThan(0);
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
