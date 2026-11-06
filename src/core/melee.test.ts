import { describe, expect, it } from 'vitest';
import { advance, combatEstimate, combatStats, critDmgBonus, newGame, startNow, thornsPct } from './sim';
import { COMMON_EQUIP, EQUIP_TYPES, ITEMS, MONSTERS, nodeOfAction, standOf, TIERS } from './data';
import { rollChest } from './dungeon';
import { nextRandom } from './rng';
import { XP_TABLE } from './xp';
import type { GameState } from './types';
import { weaponScores } from './balance.test';

const T0 = 1_700_000_000_000;
const T8 = TIERS[7].id;

function fighter(weapon: string, offhand?: string, seed = 5) {
  const s = newGame(T0, seed);
  for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[110];
  for (const sl of ['head', 'body', 'feet', 'hands'] as const) s.equipment[sl] = `${T8}_plate_${sl}`;
  s.equipment.weapon = `${T8}_${weapon}`;
  if (offhand) s.equipment.offhand = `${T8}_${offhand}`;
  return s;
}
const action = (() => {
  const m = Object.values(MONSTERS).find((m) => !m.world && m.rank === 'normal' && m.level >= 95 && m.level <= 100 && m.maxHit > 0 && nodeOfAction(`fight_${m.id}`) && !nodeOfAction(`fight_${m.id}`)!.timed)!;
  return `fight_${m.id}`;
})();

function run(s0: GameState, ms: number) {
  let s = startNow(s0, action, { type: 'infinite' });
  s.loc = standOf(nodeOfAction(action)!);
  s.queue[0].stocked = true;
  s.settings.carryFood = 0;
  let t = T0, hits = 0, sunder = 0, exec = 0, execHigh = 0, mHits = 0, thorns = 0, lastP = 0, lastM = 0;
  while (t < T0 + ms) {
    t += 100;
    const before = s.combat ? { hp: s.combat.monsterHp } : null;
    s = advance(s, t).state;
    s.hp = 1e6;
    const c = s.combat;
    if (!c) continue;
    if ((c.pSwings ?? 0) !== lastP) {
      lastP = c.pSwings ?? 0;
      if ((c.pDmg ?? -1) > 0) {
        hits++;
        if (c.pSunder) sunder++;
        if (c.pExec) { exec++; if (before && before.hp >= MONSTERS[action.slice(6)].hp * 0.3) execHigh++; }
      }
    }
    if ((c.mSwings ?? 0) !== lastM) { lastM = c.mSwings ?? 0; if ((c.mDmg ?? -1) > 0) { mHits++; if (c.mThorns) thorns++; } }
  }
  return { hits, sunder, exec, execHigh, mHits, thorns, s };
}

describe('近战特殊装备（11-06）', () => {
  it('只有 T7、T8，不在野外/福袋/宝箱直接掉，材料古龙骨、英灵徽记', () => {
    for (const k of ['sunderhammer', 'bloodsabre', 'thornguard', 'warhorn']) {
      expect(ITEMS[`${TIERS[5].id}_${k}`], k).toBeUndefined();
      expect(ITEMS[`${TIERS[6].id}_${k}`], k).toBeDefined();
      expect(COMMON_EQUIP().some((x) => x.key === k)).toBe(false);
      const mat = k === 'sunderhammer' || k === 'bloodsabre' ? 'dragonbone' : 'valor';
      expect(EQUIP_TYPES.find((x) => x.key === k)!.mats.some(([m]) => m === mat)).toBe(true);
    }
    expect(ITEMS[`${T8}_sunderhammer`].equip!.twoHanded).toBe(true);
    expect(ITEMS[`${T8}_bloodsabre`].equip!.twoHanded).toBeFalsy();
    for (const k of ['thornguard', 'warhorn']) expect(ITEMS[`${T8}_${k}`].equip!.slot).toBe('offhand');
    // 破甲、斩杀随品质涨，副手效果固定
    const q = (k: string, n: number) => ITEMS[`${T8}_${k}${n ? `@q${n}` : ''}`].equip!;
    expect(q('sunderhammer', 0).sunder).toBe(0.15);
    expect(q('sunderhammer', 5).sunder).toBe(0.3);
    expect(q('bloodsabre', 0).execute).toBe(0.5);
    expect(q('bloodsabre', 5).execute).toBe(1);
    expect(q('thornguard', 5).thorns).toBe(0.25);
    expect(q('warhorn', 5).critDmg).toBe(0.5);
  });

  it('材料只从 T7 以上的副本宝箱开出', () => {
    let r = 7;
    const rand = () => { const [x, n] = nextRandom(r); r = n; return x; };
    let bone = 0, valor = 0, low = 0;
    for (let i = 0; i < 3000; i++) {
      const out = rollChest({ kind: 'green', tier: 7, floors: 2, seed: 1 } as never, 3, rand);
      if (out.dragonbone_8) bone++;
      if (out.valor_8) valor++;
      const o6 = rollChest({ kind: 'green', tier: 5, floors: 2, seed: 1 } as never, 3, rand);
      if (Object.keys(o6).some((k) => /^(dragonbone|valor)_/.test(k))) low++;
    }
    expect(bone).toBeGreaterThan(200);
    expect(valor).toBeGreaterThan(200);
    expect(low).toBe(0);
    for (const m of Object.values(MONSTERS)) expect(m.drops.some((d) => /^(dragonbone|valor)_/.test(d.item)), m.id).toBe(false);
  });

  it('强度：两把武器和幽魂链刃差不多，战魂号角比灯笼略强，提灯配链刃仍是最强', () => {
    for (const ti of [6, 7]) {
      const lan = weaponScores(ti, ['chainblade', 'sunderhammer', 'bloodsabre']);
      for (const k of ['sunderhammer', 'bloodsabre']) {
        expect(lan[k], `T${ti + 1} ${k}`).toBeGreaterThanOrEqual(104);
        expect(lan[k], `T${ti + 1} ${k}`).toBeLessThanOrEqual(115);
        expect(Math.abs(lan[k] - lan.chainblade), `T${ti + 1} ${k}`).toBeLessThanOrEqual(4);
      }
      const horn = weaponScores(ti, ['chainblade', 'bloodsabre'], 'warhorn');
      const lamp = weaponScores(ti, ['chainblade'], 'soullamp');
      expect(horn.bloodsabre).toBeGreaterThan(lan.bloodsabre);
      expect(horn.bloodsabre - lan.bloodsabre).toBeLessThanOrEqual(5);
      expect(lamp.chainblade).toBeGreaterThanOrEqual(horn.chainblade);
    }
  });

  it('近战副手只在拿近战武器时生效', () => {
    const melee = fighter('sword', 'warhorn');
    expect(critDmgBonus(melee)).toBe(0.5);
    const m = MONSTERS[action.slice(6)];
    expect(combatStats(melee, m).critMult).toBeCloseTo(2, 5);
    const bow = fighter('warbow', 'warhorn');
    expect(critDmgBonus(bow)).toBe(0);
    expect(combatStats(bow, m).critMult).toBeCloseTo(1.5, 5);
    expect(thornsPct(fighter('sword', 'thornguard'))).toBe(0.25);
    expect(thornsPct(fighter('warbow', 'thornguard'))).toBe(0);
  });

  it('实战：破甲按概率触发、斩杀只在残血时、反伤每次挨打都弹', () => {
    const h = run(fighter('sunderhammer'), 3_600_000);
    expect(h.hits).toBeGreaterThan(300);
    expect(h.sunder / h.hits).toBeGreaterThan(0.11);
    expect(h.sunder / h.hits).toBeLessThan(0.19);
    const b = run(fighter('bloodsabre', 'thornguard'), 3_600_000);
    expect(b.exec).toBeGreaterThan(50);
    expect(b.execHigh).toBe(0);
    expect(b.mHits).toBeGreaterThan(50);
    expect(b.thorns).toBe(b.mHits);
    // 期望值和实战差不多：一小时击杀数
    const est = combatEstimate(fighter('bloodsabre', 'thornguard'), MONSTERS[action.slice(6)]);
    expect(est.perHour).toBeGreaterThan(0);
  });
});
