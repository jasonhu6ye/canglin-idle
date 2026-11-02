import { afterEach, describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, MONSTERS, TIERS } from './data';
import { setAggroMates, targetChance, threatOf, THREAT_BASE, tieBreak } from './aggro';
import { advance, combatEstimate, newGame, startNow } from './sim';

const T0 = 1_800_000_000_000;

describe('组队嘲讽（10-26）', () => {
  afterEach(() => setAggroMates([]));

  it('板甲和双手大盾有嘲讽，其他护甲没有', () => {
    TIERS.forEach((t) => {
      expect(ITEMS[`${t.id}_greatshield`].equip!.threat).toBe(150);
      expect(ITEMS[`${t.id}_plate_body`].equip!.threat).toBe(60);
      expect(ITEMS[`${t.id}_leather_body`].equip!.threat).toBeUndefined();
      expect(ITEMS[`${t.id}_cloth_hands`].equip!.threat).toBeUndefined();
    });
    expect(threatOf({})).toBe(THREAT_BASE);
    const tank = ['head', 'body', 'feet', 'hands'].map((p) => `iron_plate_${p}`).concat('iron_greatshield');
    expect(threatOf(Object.fromEntries(tank.map((id, i) => [i, id])))).toBe(100 + 138 + 150);
  });

  it('选目标：只打嘲讽最高的一个人（11-02），并列时按 id 定', () => {
    expect(targetChance(100, [])).toBe(1);
    expect(targetChance(100, [388])).toBe(0);
    expect(targetChance(388, [100])).toBe(1);
    expect(targetChance(100, [100, 99])).toBe(1);
    // 两个人一样：各家按 id 把对方 ±1，只有 id 小的那个挨打
    const a = targetChance(100, [tieBreak(100, 100, 'a', 'b')]);
    const b = targetChance(100, [tieBreak(100, 100, 'b', 'a')]);
    expect(a + b).toBe(1);
    expect(a).toBe(1);
  });

  it('有坦克队友时自己挨打少很多，大招仍然打到自己', () => {
    const id = Object.values(ACTIONS).filter((a) => a.kind === 'combat' && MONSTERS[a.monster].rank === 'normal' && MONSTERS[a.monster].maxHit > 0 && !MONSTERS[a.monster].event)
      .sort((a, b) => MONSTERS[(a as { monster: string }).monster].level - MONSTERS[(b as { monster: string }).monster].level)[0].id;
    const run = () => {
      let g = startNow(newGame(T0, 7), id, { type: 'infinite' });
      g.equipment.weapon = 'wood_dagger';
      let hits = 0, mate = 0, last = 0;
      for (let k = 1; k <= 1200; k++) {
        g = advance(g, T0 + k * 500).state;
        const c = g.combat;
        if (c && (c.mSwings ?? 0) !== last) {
          last = c.mSwings ?? 0;
          if (c.mDmg === -2) mate++; else hits++;
        }
      }
      return { hits, mate };
    };
    const solo = run();
    expect(solo.mate).toBe(0);
    setAggroMates([388]);
    const duo = run();
    expect(duo.mate).toBeGreaterThan(duo.hits * 5);
    const m = MONSTERS[(ACTIONS[id] as { monster: string }).monster];
    const s = newGame(T0, 1);
    s.equipment.weapon = 'wood_dagger';
    setAggroMates([]);
    const a = combatEstimate(s, m).taken;
    setAggroMates([388]);
    expect(combatEstimate(s, m).taken).toBeLessThan(a * 0.1);
  });
});
