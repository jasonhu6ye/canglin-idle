import { describe, expect, it } from 'vitest';
import { advance, aimCrit, combatEstimate, combatStats, newGame, piercePct, startNow } from './sim';
import { COMMON_EQUIP, EQUIP_TYPES, ITEMS, MONSTERS, nodeOfAction, standOf, TIERS } from './data';
import { rollChest } from './dungeon';
import { nextRandom } from './rng';
import { XP_TABLE } from './xp';
import type { GameState } from './types';
import { weaponScores } from './balance.test';

const T0 = 1_700_000_000_000;
const T8 = TIERS[7].id;

function shooter(weapon: string, offhand?: string, lv = 110, tier = 7) {
  const t = TIERS[tier];
  const s = newGame(T0, 9);
  for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[lv];
  for (const sl of ['head', 'body', 'feet', 'hands'] as const) s.equipment[sl] = `${t.id}_plate_${sl}`;
  s.equipment.weapon = `${t.id}_${weapon}`;
  if (offhand) s.equipment.offhand = `${t.id}_${offhand}`;
  return s;
}
/** 精英、首领在同阶附近的平均每小时击杀数 */
function bossKph(ti: number, w: string) {
  const t = TIERS[ti];
  const mons = Object.values(MONSTERS).filter((m) => !m.world && m.rank !== 'normal' && m.level >= t.level - 3 && m.level <= t.level + 8);
  const s = shooter(w, 'lantern', t.level + 5, ti);
  let k = 0;
  for (const m of mons) k += 3_600_000 / combatEstimate(s, m).killMs;
  return k / mons.length;
}
const action = (() => {
  const m = Object.values(MONSTERS).find((m) => !m.world && m.rank === 'normal' && m.level >= 95 && m.level <= 100 && m.maxHit > 0 && nodeOfAction(`fight_${m.id}`) && !nodeOfAction(`fight_${m.id}`)!.timed)!;
  return `fight_${m.id}`;
})();

describe('远程特殊装备（11-06）', () => {
  it('只有 T7、T8，不在野外/福袋/宝箱直接掉，材料雷鸟羽、星辉碎片', () => {
    for (const k of ['starbow', 'kingslayer', 'cloudquiver', 'hawkeye']) {
      expect(ITEMS[`${TIERS[5].id}_${k}`], k).toBeUndefined();
      expect(ITEMS[`${TIERS[6].id}_${k}`], k).toBeDefined();
      expect(ITEMS[`${T8}_${k}`].equip!.style).toBe('ranged');
      expect(COMMON_EQUIP().some((x) => x.key === k)).toBe(false);
      const mat = k === 'starbow' || k === 'kingslayer' ? 'stormplume' : 'starshard';
      expect(EQUIP_TYPES.find((x) => x.key === k)!.mats.some(([m]) => m === mat)).toBe(true);
    }
    expect(ITEMS[`${T8}_starbow`].equip!.twoHanded).toBe(true);
    expect(ITEMS[`${T8}_kingslayer`].equip!.twoHanded).toBeFalsy();
    const q = (k: string, n: number) => ITEMS[`${T8}_${k}${n ? `@q${n}` : ''}`].equip!;
    expect(q('starbow', 0).focus).toBe(0.04);
    expect(q('starbow', 5).focus).toBe(0.08);
    expect(q('kingslayer', 0).slayer).toBe(0.3);
    expect(q('kingslayer', 5).slayer).toBe(0.6);
    expect(q('cloudquiver', 5).pierce).toBe(0.1);
    expect(q('hawkeye', 5).aimCrit).toBe(0.06);
  });

  it('材料只从 T7 以上的副本宝箱开出', () => {
    let r = 11;
    const rand = () => { const [x, n] = nextRandom(r); r = n; return x; };
    let plume = 0, star = 0, low = 0;
    for (let i = 0; i < 3000; i++) {
      const out = rollChest({ kind: 'blue', tier: 6, floors: 2, seed: 1 } as never, 2, rand);
      if (out.stormplume_7) plume++;
      if (out.starshard_7) star++;
      const o6 = rollChest({ kind: 'blue', tier: 5, floors: 2, seed: 1 } as never, 3, rand);
      if (Object.keys(o6).some((k) => /^(stormplume|starshard)_/.test(k))) low++;
    }
    expect(plume).toBeGreaterThan(150);
    expect(star).toBeGreaterThan(150);
    expect(low).toBe(0);
    for (const m of Object.values(MONSTERS)) expect(m.drops.some((d) => /^(stormplume|starshard)_/.test(d.item)), m.id).toBe(false);
  });

  it('强度：追星长弓和永霜之弓差不多；猎王手弩打普通怪和战弓差不多、打精英首领明显强；两件副手比箭袋强一点', () => {
    for (const ti of [6, 7]) {
      const lan = weaponScores(ti, ['frostbow', 'starbow', 'kingslayer']);
      expect(Math.abs(lan.starbow - lan.frostbow), `T${ti + 1}`).toBeLessThanOrEqual(4);
      expect(lan.starbow, `T${ti + 1}`).toBeLessThanOrEqual(118);
      expect(Math.abs(lan.kingslayer - lan.warbow), `T${ti + 1}`).toBeLessThanOrEqual(4);
      const boss = bossKph(ti, 'kingslayer') / bossKph(ti, 'warbow');
      expect(boss, `T${ti + 1}`).toBeGreaterThan(1.2);
      expect(boss, `T${ti + 1}`).toBeLessThan(1.4);
      const quiver = weaponScores(ti, [], 'quiver').warbow;
      for (const oh of ['cloudquiver', 'hawkeye']) {
        const v = weaponScores(ti, [], oh).warbow;
        expect(v - quiver, `T${ti + 1} ${oh}`).toBeGreaterThan(0);
        expect(v - quiver, `T${ti + 1} ${oh}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('远程副手只在拿远程武器时生效', () => {
    const m = MONSTERS[action.slice(6)];
    expect(aimCrit(shooter('warbow', 'hawkeye'))).toBe(0.06);
    expect(aimCrit(shooter('sword', 'hawkeye'))).toBe(0);
    expect(combatStats(shooter('warbow', 'hawkeye'), m).crit).toBeCloseTo(combatStats(shooter('warbow', 'quiver'), m).crit + 0.06, 5);
    expect(piercePct(shooter('warbow', 'cloudquiver'))).toBe(0.1);
    expect(piercePct(shooter('sword', 'cloudquiver'))).toBe(0);
    expect(combatStats(shooter('warbow', 'cloudquiver'), m).playerHit).toBeGreaterThan(combatStats(shooter('warbow', 'quiver'), m).playerHit);
  });

  it('实战：专注连中叠层、没中清零，最多 5 层', () => {
    let s: GameState = startNow(shooter('starbow'), action, { type: 'infinite' });
    s.loc = standOf(nodeOfAction(action)!);
    s.queue[0].stocked = true;
    s.settings.carryFood = 0;
    let t = T0, last = 0, prevFocus = 0, full = 0, resets = 0, bad = 0;
    while (t < T0 + 3_600_000) {
      t += 100;
      s = advance(s, t).state;
      s.hp = 1e6;
      const c = s.combat;
      if (!c || (c.pSwings ?? 0) === last) continue;
      last = c.pSwings ?? 0;
      const f = c.focus ?? 0;
      if (f > 5) bad++;
      if ((c.pDmg ?? -1) < 0) { if (f !== 0) bad++; if (prevFocus > 0) resets++; }
      else if (f !== Math.min(5, prevFocus + 1)) bad++;
      if (c.pFocus) full++;
      prevFocus = f;
    }
    expect(bad).toBe(0);
    expect(full).toBeGreaterThan(5);
    expect(resets).toBeGreaterThan(5);
  });
});
