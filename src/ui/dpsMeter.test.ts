import { describe, expect, it } from 'vitest';
import { dpsReport, FIGHT_GAP, ME, type DpsHit } from './dpsMeter';

const h = (t: number, who: string, dmg: number): DpsHit => ({ t, who, name: who, i: 0, dmg });

describe('伤害统计（11-02）', () => {
  it('这一场：按人汇总伤害、DPS、占比，隔太久的算上一场', () => {
    const list = [h(0, ME, 100), h(FIGHT_GAP + 1000, ME, 10), h(FIGHT_GAP + 2000, 'a', 30), h(FIGHT_GAP + 11_000, ME, 10)];
    const r = dpsReport('fight', FIGHT_GAP + 11_000, list);
    expect(r.ms).toBe(10_000);
    expect(r.total).toBe(50);
    expect(r.rows.map((x) => x.who)).toEqual(['a', ME]);
    expect(r.rows[1].dps).toBeCloseTo(2);
    expect(r.rows[0].share).toBeCloseTo(0.6);
  });
  it('打完了：时长停在最后一下', () => {
    const list = [h(0, ME, 10), h(4000, ME, 10)];
    expect(dpsReport('fight', 100_000, list).ms).toBe(4000);
    expect(dpsReport('fight', 100_000, []).rows).toEqual([]);
  });
});
