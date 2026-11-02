import { describe, expect, it } from 'vitest';
import { advance, newGame, startNow } from './sim';
import { ACTIONS, fineMatOf, ITEMS, MONSTERS, nodeOfAction, standOf, TIERS } from './data';
import { qualityOdds, qualityOf, rollQuality } from './quality';
import { rollChest } from './dungeon';
import { nextRandom } from './rng';
import { XP_TABLE } from './xp';

const T0 = 1_700_000_000_000;

describe('精工石（11-02）', () => {
  it('只提高优秀、史诗，传说、神话不变，加起来还是 100%', () => {
    for (let t = 0; t < 8; t++) {
      const a = qualityOdds(t), b = qualityOdds(t, true);
      expect(b.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 6);
      expect(b[2]).toBeCloseTo(a[2] * 2.5, 2);
      expect(b[3]).toBeCloseTo(a[3] * 2.5, 2);
      expect(b[1]).toBe(a[1]);
      expect(b[4]).toBe(a[4]);
      expect(b[5]).toBe(a[5]);
      expect(b[0]).toBeGreaterThan(30);
    }
  });

  it('每件装备对应同阶的精工石，永霜武器用永霜精工石', () => {
    const t1 = TIERS[0].id, t8 = TIERS[7].id;
    expect(fineMatOf(`${t1}_sword`)).toBe('finecraft_1');
    expect(fineMatOf(`${t8}_chainblade`)).toBe('finecraft_8');
    expect(fineMatOf(`${TIERS[6].id}_frostbow`)).toBe('frostcraft_7');
    expect(fineMatOf(`${t8}_frostshield`)).toBe('frostcraft_8');
    expect(fineMatOf('coins')).toBeUndefined();
    for (let i = 1; i <= 8; i++) expect(ITEMS[`finecraft_${i}`]).toBeDefined();
  });

  it('副本宝箱开出同阶精工石，箱子越好越多', () => {
    for (const tier of [0, 4, 7]) {
      const got = [0, 3].map((q) => {
        let r = 12345, n = 0;
        const rand = () => { const [x, nx] = nextRandom(r); r = nx; return x; };
        for (let k = 0; k < 2000; k++) n += rollChest({ id: 'g', kind: 'green', tier, x: 0, y: 0, at: 0, expires: 1, seed: 1, floors: 3 }, q, rand)[`finecraft_${tier + 1}`] ?? 0;
        return n / 2000;
      });
      expect(got[0]).toBeGreaterThan(0.08);
      expect(got[0]).toBeLessThan(0.16);
      expect(got[1]).toBeGreaterThan(got[0] * 2.5);
    }
  });

  it('永冬首领掉永霜精工石', () => {
    for (const id of ['wb_everfrost_giant', 'wb_snow_baron']) for (const m of ['frostcraft_7', 'frostcraft_8']) expect(MONSTERS[id].drops.some((d) => d.item === m)).toBe(true);
  });

  it('打开开关后做装备每件用掉一颗，出货明显更好；没有了就按普通概率', () => {
    const t1 = TIERS[0].id;
    const act = Object.values(ACTIONS).find((a) => a.kind === 'skill' && a.outputs.some((o) => o.item === `${t1}_sword`))!;
    if (act.kind !== 'skill') throw 0;
    const run = (fine: boolean, stones: number) => {
      let s = newGame(T0, 9);
      for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[30];
      for (const i of act.inputs ?? []) s.bank[i.item] = 5000;
      s.bank.finecraft_1 = stones;
      s.settings.fineCraft = fine;
      s = startNow(s, act.id, { type: 'count', count: 400 });
      s.loc = standOf(nodeOfAction(act.id)!);
      s.queue[0].stocked = true;
      const out = advance(s, T0 + 6 * 3_600_000).state;
      const all: Record<string, number> = {};
      for (const box of [out.bank, out.bag]) for (const [id, q] of Object.entries(box)) all[id] = (all[id] ?? 0) + q;
      const made = Object.entries(all).filter(([id]) => id.startsWith(`${t1}_sword`));
      const n = made.reduce((a, [, q]) => a + q, 0);
      const good = made.filter(([id]) => qualityOf(id) === 2 || qualityOf(id) === 3).reduce((a, [, q]) => a + q, 0);
      return { n, good: good / n, left: (out.bank.finecraft_1 ?? 0) + (out.bag.finecraft_1 ?? 0) };
    };
    const off = run(false, 1000), on = run(true, 1000), none = run(true, 0);
    expect(off.left).toBe(1000);
    expect(on.left).toBe(1000 - on.n);
    expect(on.good).toBeGreaterThan(off.good * 1.8);
    expect(none.good).toBeLessThan(on.good);
    expect(rollQuality(0, 0.999, true)).toBe(0);
  });
});
