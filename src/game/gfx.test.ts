import { describe, expect, it } from 'vitest';
import { gfxLevel, gfxTick, setGfxPref } from './gfx';

/** 按给定帧率喂 sec 秒的帧 */
function run(fps: number, sec: number, t0: number) {
  let t = t0;
  for (let i = 0; i < fps * sec; i++) gfxTick(1000 / fps, (t += 1000 / fps));
  return t;
}

describe('画质自动档（10-27）', () => {
  it('卡了降一档，刚降过不马上升，稳定一阵再升回来', () => {
    setGfxPref('auto');
    expect(gfxLevel()).toBe(1);
    let t = run(30, 6.5, 0);
    expect(gfxLevel()).toBe(0);
    t = run(60, 30, t);
    expect(gfxLevel()).toBe(0);
    t = run(60, 100, t);
    expect(gfxLevel()).toBe(1);
    run(60, 25, t);
    expect(gfxLevel()).toBe(2);
  });

  it('固定档位不随帧率变', () => {
    setGfxPref('low');
    run(60, 60, 1e6);
    expect(gfxLevel()).toBe(0);
    setGfxPref('auto');
  });
});
