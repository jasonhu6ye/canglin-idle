import { describe, expect, it } from 'vitest';
import { ACTIONS, ITEMS, nodesOfAction, packId, sagePackId, TIERS } from './data';
import { BAG_SLOTS, bagRoomFor, bagSlots, equip, newGame, sageXp, unequip } from './sim';
import { rollChest } from './dungeon';
import type { DungeonGate } from './types';

describe('背包和洞察者背包（10-26）', () => {
  it('每阶两种背包，名字不带「x制」，有配方，洞察者背包要洞察之瞳、等级更高', () => {
    TIERS.forEach((t, i) => {
      const a = ITEMS[packId(i)];
      const b = ITEMS[sagePackId(i)];
      expect(a.name.startsWith(`T${i + 1} `)).toBe(true);
      expect(a.name).not.toMatch(/制/);
      expect(a.equip!.bag).toBeGreaterThan(0);
      expect(b.equip!.sage).toBeGreaterThan(0);
      const ra = ACTIONS[`craft_${packId(i)}`];
      const rb = ACTIONS[`craft_${sagePackId(i)}`];
      expect(ra && rb).toBeTruthy();
      expect(nodesOfAction(rb.id).length).toBeGreaterThan(0);
      expect(rb.level).toBeGreaterThan(ra.level);
      expect(rb.kind === 'skill' && rb.inputs?.some((x) => x.item === `sageeye_${i + 1}`)).toBe(true);
      expect(ITEMS[`${packId(i)}@q1`]).toBeUndefined();
    });
  });

  it('背上背包多格子；装不下时不能卸', () => {
    let s = newGame(0);
    s.bag[packId(0)] = 1;
    s = equip(s, packId(0));
    expect(s.equipment.pack).toBe(packId(0));
    expect(bagSlots(s)).toBe(BAG_SLOTS + ITEMS[packId(0)].equip!.bag!);
    const gear = Object.keys(ITEMS).filter((id) => ITEMS[id].equip && !ITEMS[id].equip!.move && ITEMS[id].equip!.slot !== 'pack').slice(0, BAG_SLOTS + 2);
    for (const id of gear) s.bag[id] = 1;
    expect(bagRoomFor(s.bag, 'stone', bagSlots(s))).toBeGreaterThan(0);
    expect(unequip(s, 'pack')).toBe(s);
  });

  it('洞察者背包：多拿的经验按 1:1 扣金币，金币不够只加付得起的', () => {
    const s = newGame(0);
    s.equipment.pack = sagePackId(7);
    s.bank.coins = 10;
    const k = ITEMS[sagePackId(7)].equip!.sage!;
    expect(sageXp(s, 100, 100)).toBe(100 + Math.min(10, Math.round(100 * k)));
    expect(s.bank.coins ?? 0).toBe(10 - Math.min(10, Math.round(100 * k)));
    s.bank.coins = 1000;
    expect(sageXp(s, 100, 100)).toBe(100 + Math.round(100 * k));
    expect(s.bank.coins).toBe(1000 - Math.round(100 * k));
  });

  it('副本宝箱会开出洞察之瞳（含低阶）', () => {
    const gate: DungeonGate = { id: 'g', kind: 'green', tier: 4, floors: 3, seed: 1, x: 0, y: 0, expires: 1e15 } as DungeonGate;
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const got = new Set<string>();
    for (let k = 0; k < 400; k++) for (const id of Object.keys(rollChest(gate, k % 4, rand))) if (id.startsWith('sageeye_')) got.add(id);
    expect(got.has('sageeye_5')).toBe(true);
    expect([...got].some((id) => Number(id.split('_')[1]) < 5)).toBe(true);
  });
});
