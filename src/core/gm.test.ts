import { describe, expect, it } from 'vitest';
import { advance, armorPerks, combatStats, maxHp, migrate, moveSpeed, newGame, playerAttackMs, startNow } from './sim';
import { MONSTERS } from './data';
import { qualityOdds } from './quality';
import { cleanGm, gmPct, setGmBuffs } from './gm';
import type { GmBuff } from './types';

const T0 = 1_800_000_000_000;
const buff = (p: Partial<GmBuff>): GmBuff => ({ id: 'b1', name: '双倍', tag: '双倍', kind: 'xp', pct: 100, from: T0, to: T0 + 3600_000, all: true, ...p });

describe('GM 增益', () => {
  it('经验 +100%：只在生效时间段里翻倍（离线结算也按时间段算）', () => {
    const base = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const plain = advance(base, T0 + 3600_000).state.xp.mining;
    const doubled = advance(setGmBuffs(base, [buff({})], T0), T0 + 3600_000).state.xp.mining;
    expect(doubled / plain).toBeGreaterThan(1.9);
    // 只有前一半时间生效
    const half = advance(setGmBuffs(base, [buff({ to: T0 + 1800_000 })], T0), T0 + 3600_000).state.xp.mining;
    expect(half / plain).toBeGreaterThan(1.4);
    expect(half / plain).toBeLessThan(1.6);
  });

  it('同类叠加、生命上限、过期不算', () => {
    const s = setGmBuffs(newGame(T0, 1), [buff({ kind: 'hp', pct: 50 }), buff({ id: 'b2', kind: 'hp', pct: 50 })], T0);
    expect(gmPct(s, 'hp', T0 + 1)).toBe(1);
    expect(gmPct(s, 'hp', T0 + 3600_000)).toBe(0);
    expect(maxHp(s)).toBe(maxHp(newGame(T0, 1)) * (Date.now() < T0 + 3600_000 && Date.now() >= T0 ? 2 : 1));
  });

  it('服务器数据先洗：坏类型、超范围、过期一天以上的丢掉，存档读档保留', () => {
    expect(cleanGm([{ id: 'x', kind: 'nope', pct: 1, from: 0, to: 1 }])).toEqual([]);
    expect(cleanGm([buff({ pct: 99999 })])[0].pct).toBe(1000);
    const s = setGmBuffs(newGame(T0, 1), [buff({}), buff({ id: 'old', from: T0 - 5 * 86_400_000, to: T0 - 3 * 86_400_000 })], T0);
    expect(s.gmBuffs?.map((b) => b.id)).toEqual(['b1']);
    expect(migrate(JSON.parse(JSON.stringify(s)))!.gmBuffs).toEqual(s.gmBuffs);
  });
});

describe('GM 新增益类型（11-02）', () => {
  const always = (p: Partial<GmBuff>) => buff({ from: 0, to: 9e15, ...p });
  const g = (list: Partial<GmBuff>[]) => setGmBuffs(newGame(T0, 1), list.map((p, i) => always({ id: `b${i}`, ...p })), 0);

  it('分类经验只加对应那一类', () => {
    const base = startNow(newGame(T0, 1), 'mine_stone', { type: 'infinite' });
    const plain = advance(base, T0 + 3600_000).state.xp.mining;
    const gather = advance(setGmBuffs(base, [buff({ kind: 'xp_gather' })], T0), T0 + 3600_000).state.xp.mining;
    const combat = advance(setGmBuffs(base, [buff({ kind: 'xp_combat' })], T0), T0 + 3600_000).state.xp.mining;
    expect(gather / plain).toBeGreaterThan(1.9);
    expect(combat).toBe(plain);
  });

  it('战斗类：暴击、暴击伤害、攻速、吸血；闪避和减伤最多 75%', () => {
    const s0 = newGame(T0, 1);
    const m = MONSTERS[Object.keys(MONSTERS)[0]];
    const a = combatStats(s0, m);
    const b = combatStats(g([{ kind: 'crit', pct: 20 }, { kind: 'critdmg', pct: 50 }, { kind: 'dodge', pct: 1000 }, { kind: 'reduce', pct: 30 }]), m);
    expect(b.crit - a.crit).toBeCloseTo(0.2);
    expect(b.critMult).toBeCloseTo(2);
    expect(b.dodge).toBeCloseTo(0.75);
    expect(armorPerks(g([{ kind: 'reduce', pct: 30 }])).reduce).toBeCloseTo(0.3);
    expect(playerAttackMs(g([{ kind: 'haste', pct: 100 }]))).toBe(Math.round(playerAttackMs(s0) / 2));
    expect(moveSpeed(g([{ kind: 'move', pct: 50 }]))).toBeCloseTo(moveSpeed(s0) * 1.5);
  });

  it('制作品质：良好、优秀、史诗变多，传说神话不变，普通最少留 5%', () => {
    const a = qualityOdds(0), b = qualityOdds(0, false, 1), c = qualityOdds(0, true, 10);
    for (const o of [b, c]) expect(o.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1);
    expect(b[1]).toBeCloseTo(a[1] * 2, 1);
    expect(b[3]).toBeCloseTo(a[3] * 2, 1);
    expect(b.slice(4)).toEqual(a.slice(4));
    expect(c[0]).toBeGreaterThanOrEqual(4.99);
    expect(c.slice(4)).toEqual(a.slice(4));
  });

  it('回血速度', () => {
    const hurt = (s: ReturnType<typeof newGame>) => ({ ...s, hp: 1 });
    const plain = advance(hurt(newGame(T0, 1)), T0 + 15_000).state.hp;
    const fast = advance(hurt(setGmBuffs(newGame(T0, 1), [buff({ kind: 'regen', pct: 100 })], T0)), T0 + 15_000).state.hp;
    expect(fast - 1).toBeGreaterThanOrEqual((plain - 1) * 2 - 1);
    expect(fast).toBeGreaterThan(plain);
  });
});
