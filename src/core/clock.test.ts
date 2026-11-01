import { describe, expect, it } from 'vitest';
import { calibrate, clockOffset, gameNow, saveSig } from './clock';

describe('防作弊时钟', () => {
  it('本机时间准时不改动', () => {
    const t = Date.now();
    calibrate(t + 500, t, t);
    expect(Math.abs(gameNow() - Date.now())).toBeLessThan(5);
  });
  it('本机时间被调快：按服务器时间走，并报出跳了多少', () => {
    const t = Date.now();
    const jump = calibrate(t - 5 * 3600_000, t, t);
    expect(Math.round(clockOffset() / 3600_000)).toBe(-5);
    expect(Math.abs(gameNow() - (Date.now() - 5 * 3600_000))).toBeLessThan(50);
    expect(Math.round(jump / 3600_000)).toBe(5);
    calibrate(Date.now(), Date.now(), Date.now());
  });
  it('存档签名：改一个字就对不上', () => {
    const raw = JSON.stringify({ xp: { mining: 100 }, bank: { coins: 5 } });
    expect(saveSig(raw)).toBe(saveSig(raw));
    expect(saveSig(raw.replace('5', '9'))).not.toBe(saveSig(raw));
  });
});
