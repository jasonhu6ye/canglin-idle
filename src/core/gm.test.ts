import { describe, expect, it } from 'vitest';
import { advance, maxHp, migrate, newGame, startNow } from './sim';
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
