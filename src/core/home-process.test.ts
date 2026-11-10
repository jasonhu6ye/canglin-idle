import { describe, expect, it } from 'vitest';
import { BUILDS, collectHome, enterHome, HOME_SPAWN, homeProduce, migrateHome, placeBuild, processReady, removeAt, startProcess } from './home';
import { ITEMS, NODES } from './data';
import { eat, newGame } from './sim';
import type { GameState } from './types';
import { applyCmd } from './commands';

const portal = NODES.find((n) => n.id === 'portal_home')!;
const X = HOME_SPAWN.x + 4;
const Y = HOME_SPAWN.y + 4;
const MIN = 60_000;
function withPot(): GameState {
  const s = newGame(1_700_000_000_000);
  s.loc = { x: portal.x, y: portal.y + 1 };
  s.travel = null; s.walk = null;
  s.bank = { copper_bar: 20, stone: 50, apple: 10, honey: 3 };
  return placeBuild(enterHome(s), 'jam_pot', X, Y);
}

describe('家园加工坊', () => {
  it('配方的原料和成品都是存在的物品，成品吃了有增益', () => {
    for (const d of BUILDS.filter((b) => b.process)) for (const r of d.process!) {
      expect(ITEMS[r.out], r.out).toBeTruthy();
      for (const i of r.in) expect(ITEMS[i.item], i.item).toBeTruthy();
    }
    for (const id of ['mead', 'cider', 'smoked_fish', 'jerky', 'apple_jam']) expect(ITEMS[id].buff).toBeTruthy();
  });

  it('放原料扣仓库，按时间一份份做好，收取进仓库', () => {
    const s = withPot();
    const T0 = 1_800_000_000_000;
    const a = startProcess(s, T0, { x: X, y: Y }, 0, 3);
    expect(a.bank.apple).toBe(4);
    expect(a.bank.honey ?? 0).toBe(0);
    const t = a.home!.things[0];
    expect(processReady(t, T0 + 39 * MIN)).toBe(0);
    expect(processReady(t, T0 + 81 * MIN)).toBe(2);
    expect(homeProduce(a.home, T0 + 81 * MIN)).toEqual({ apple_jam: 4 });
    // 做着的时候不能再放
    expect(startProcess(a, T0 + 81 * MIN, { x: X, y: Y }, 0, 1)).toBe(a);
    const b = collectHome(a, T0 + 81 * MIN, { x: X, y: Y });
    expect(b.got).toEqual({ apple_jam: 4 });
    expect(b.state.home!.things[0].job).toEqual({ r: 0, n: 1, at: T0 + 80 * MIN });
    const c = collectHome(b.state, T0 + 200 * MIN).state;
    expect(c.bank.apple_jam).toBe(6);
    expect(c.home!.things[0].job).toBeUndefined();
  });

  it('原料不够或份数不对就不动', () => {
    const s = withPot();
    expect(startProcess(s, 0, { x: X, y: Y }, 0, 4)).toBe(s);
    expect(startProcess(s, 0, { x: X, y: Y }, 0, 0)).toBe(s);
    expect(startProcess(s, 0, { x: X, y: Y }, 5, 1)).toBe(s);
    expect(startProcess(s, 0, { x: X + 9, y: Y }, 0, 1)).toBe(s);
  });

  it('上一批全做完，再放新的会先自动收取', () => {
    const s = startProcess(withPot(), 0, { x: X, y: Y }, 0, 1);
    const a = startProcess(s, 100 * MIN, { x: X, y: Y }, 0, 1);
    expect(a.bank.apple_jam).toBe(2);
    expect(a.home!.things[0].job).toEqual({ r: 0, n: 1, at: 100 * MIN });
  });

  it('拆掉时做好的收进仓库，没做的原料退回', () => {
    const T0 = Date.now();
    const s = startProcess(withPot(), T0 - 50 * MIN, { x: X, y: Y }, 0, 3);
    const a = removeAt(s, X, Y);
    expect(a.home!.things).toHaveLength(0);
    expect(a.bank.apple_jam).toBe(2);
    expect(a.bank.apple).toBe(8);
    expect(a.bank.honey).toBe(2);
  });

  it('读档保留加工任务，坏数据丢掉', () => {
    const s = startProcess(withPot(), 1000, { x: X, y: Y }, 0, 2);
    expect(migrateHome(structuredClone(s.home))!.things[0].job).toEqual({ r: 0, n: 2, at: 1000 });
    const bad = structuredClone(s.home)!;
    bad.things[0].job = { r: 7, n: 2, at: 1000 };
    expect(migrateHome(bad)!.things[0].job).toBeUndefined();
  });

  it('指令 homeProcess 能用，成品能吃出增益', () => {
    const s = withPot();
    const a = applyCmd(s, 'homeProcess', [{ x: X, y: Y }, 0, 2], 0);
    expect(a.state.home!.things[0].job?.n).toBe(2);
    const b = collectHome(a.state, 200 * MIN).state;
    b.bag = { apple_jam: 1 };
    const c = eat(b, 'apple_jam');
    expect(c.buffs?.atk?.pct).toBeGreaterThan(0);
  });
});
