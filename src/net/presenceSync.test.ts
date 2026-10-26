import { describe, expect, it } from 'vitest';
import type { Presence } from './api';
import { fastOf, moveCadence, readFast, slowKey, withMove } from './presenceSync';

const base: Presence = { playerId: 'a', name: '甲', x: 10, y: 10, outfit: 'ranger', total: 50, hp: 80, maxHp: 100, anim: 'work-mine', at: 0, s: 100 };

describe('在线状态拆成慢变 + 移动广播（10-26 优化延迟）', () => {
  it('只是走路、换动作、掉血不改变慢变指纹；换装备、换外观会变', () => {
    const k = slowKey(base);
    expect(slowKey({ ...base, x: 99, y: 3, anim: undefined, hp: 1, s: 999, at: 5 })).toBe(k);
    expect(slowKey({ ...base, outfit: 'knight' })).not.toBe(k);
    expect(slowKey({ ...base, equip: { weapon: 'iron_sword' } })).not.toBe(k);
  });
  it('更新的移动叠上去（停下干活时清掉动作），旧的不叠', () => {
    const m = fastOf({ x: 12, y: 11, hp: 70 }, 200);
    const p = withMove(base, m);
    expect([p.x, p.y, p.hp, p.anim, p.s]).toEqual([12, 11, 70, undefined, 200]);
    expect(withMove(base, fastOf({ x: 1, y: 1 }, 50))).toBe(base);
    expect(withMove(base, undefined)).toBe(base);
  });
  it('收到的广播格式不对就丢掉', () => {
    expect(readFast({ id: 'a', s: 1, x: 1, y: 2, anim: 'walk' })).toMatchObject({ id: 'a', x: 1, y: 2, anim: 'walk' });
    expect(readFast({ id: 'a', s: 1, x: 'x', y: 2 })).toBeNull();
    expect(readFast({ id: 'a', s: 1, x: Infinity, y: 2 })).toBeNull();
    expect(readFast(null)).toBeNull();
  });
  it('附近没人看时发得慢，有人时快，人多了放慢但有上限', () => {
    expect(moveCadence(0, false)[0]).toBeGreaterThanOrEqual(1000);
    expect(moveCadence(1, true)[0]).toBeLessThanOrEqual(200);
    expect(moveCadence(1, false)[0]).toBeLessThan(moveCadence(20, false)[0]);
    expect(moveCadence(100, false)[0]).toBeLessThanOrEqual(2000);
  });
});
