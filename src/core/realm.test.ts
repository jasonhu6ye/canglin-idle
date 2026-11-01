import { describe, expect, it } from 'vitest';
import { GATE_CAMP, MAIN_GATES, NODES, planRoute, standOf, WAYSTONES } from './data';
import { CHEST_OPEN_MS, inRealm, nextWindow, SPAWN_LIFE, timedWindow } from './realm';
import { finishRealmChest, newGame, realmChestState, startRealmChest, useGate, useWaystone } from './sim';
import type { GameState } from './types';

const at = (s: GameState, n: { x: number; y: number }): GameState => ({ ...s, loc: standOf(n as never), walk: null, travel: null });

describe('永冬冰原（11-01）', () => {
  it('限时点：每次存在 30 分钟，到点消失；所有人看到的一样', () => {
    const n = NODES.find((x) => x.timed?.kind === 'boss')!;
    const w = nextWindow(n, 1_800_000_000_000)!;
    expect(timedWindow(n, w.start)).toEqual(w);
    expect(timedWindow(n, w.start + SPAWN_LIFE - 1)).not.toBeNull();
    expect(timedWindow(n, w.start + SPAWN_LIFE)).toBeNull();
    expect(w.end - w.start).toBe(SPAWN_LIFE);
  });

  it('两个首领错开：任何时候 2 小时里各出现一次', () => {
    const lairs = NODES.filter((x) => x.timed?.kind === 'boss');
    expect(lairs).toHaveLength(2);
    const t0 = 1_800_000_000_000;
    for (const l of lairs) {
      let seen = 0;
      for (let t = t0; t < t0 + 2 * 3600_000; t += 60_000) if (timedWindow(l, t)) seen++;
      expect(seen).toBe(30);
    }
  });

  it('传送门：主大陆的门 ↔ 营地，站在门旁才行；石碑不能跨边', () => {
    const s = newGame(0, 1);
    const main = MAIN_GATES[0];
    expect(useGate(s, GATE_CAMP.id)).toBe(s);
    const there = useGate(at(s, main), GATE_CAMP.id);
    expect(inRealm(there.loc)).toBe(true);
    // 营地的门回两座城都行，主大陆的门不能互传
    expect(inRealm(useGate(there, MAIN_GATES[1].id).loc)).toBe(false);
    expect(useGate(at(s, main), MAIN_GATES[1].id).loc).toEqual(standOf(main));
    const realmStone = WAYSTONES.find(inRealm)!;
    const mainStone = WAYSTONES.find((n) => !inRealm(n))!;
    const lit = { ...at(s, mainStone), waystones: [mainStone.id, realmStone.id] };
    expect(useWaystone(lit, realmStone.id).loc).toEqual(lit.loc);
  });

  it('跨边寻路要过传送门', () => {
    const r = planRoute([], standOf(MAIN_GATES[0]), standOf(NODES.find((n) => n.id === 'realm_tundra_0')!));
    expect(r.hops?.some(([a, b]) => a === MAIN_GATES[0].id && b === GATE_CAMP.id)).toBe(true);
  });

  it('限时宝箱：站在旁边开满 10 秒才给，每人每轮一次，走开或过期作废', () => {
    const chest = NODES.find((x) => x.timed?.kind === 'chest')!;
    const w = nextWindow(chest, 1_800_000_000_000)!;
    const t = w.start + 1000;
    let s = at(newGame(0, 1), chest);
    expect(realmChestState(s, chest.id, t)).toBe('ok');
    expect(realmChestState(newGame(0, 1), chest.id, t)).toBe('far');
    s = startRealmChest(s, chest.id, t);
    const early = finishRealmChest(s, t + CHEST_OPEN_MS - 1);
    expect(early.bank.coins ?? 0).toBe(s.bank.coins ?? 0);
    const got = finishRealmChest(s, t + CHEST_OPEN_MS);
    expect(got.bank.coins).toBeGreaterThan(s.bank.coins ?? 0);
    expect(realmChestState(got, chest.id, t + CHEST_OPEN_MS)).toBe('got');
    expect(startRealmChest(got, chest.id, t + CHEST_OPEN_MS)).toBe(got);
    // 过期了才开完：不给
    const late = startRealmChest(s, chest.id, w.end - 5000);
    expect(finishRealmChest(late, w.end + 5000).bank.coins ?? 0).toBe(s.bank.coins ?? 0);
  });
});
