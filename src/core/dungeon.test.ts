import { describe, expect, it } from 'vitest';
import { ITEMS, MONSTERS, TIERS, keyId } from './data';
import { buffMob, chestOdds, dungeonFloor, GATE_CD, mobBuff, rollChest, rollFloors, teamChest, totalMobs } from './dungeon';
import { advance, markContrib, combatEstimate, enterDungeon, syncDungeon, gateBlock, gateOpenBlock, leaveDungeon, migrate, newGame, openDungeonChest, openGate, useTownScroll } from './sim';
import { nextRandom } from './rng';
import { XP_TABLE } from './xp';
import type { DungeonGate, GameState } from './types';

const T0 = Date.UTC(2026, 9, 25, 12);

const gate = (kind: 'green' | 'blue', tier: number, floors: number, seed: number): DungeonGate =>
  ({ id: `g${seed}`, kind, tier, x: 100, y: 100, at: T0, expires: T0 + 1_800_000, seed, floors });

/** 高出 lv 级、穿同阶板甲拿剑、背包里带满食物 */
function strong(tier: number, plus = 8): GameState {
  const s = newGame(T0, 1);
  const lv = TIERS[tier].level + plus;
  for (const k of Object.keys(s.xp) as (keyof typeof s.xp)[]) s.xp[k] = XP_TABLE[lv];
  const t = TIERS[tier];
  for (const [id, it] of Object.entries(ITEMS)) {
    const e = it.equip;
    if (!e || !id.startsWith(`${t.id}_`) || id.startsWith('mount')) continue;
    if (e.slot === 'weapon' ? !id.includes('sword') : e.defence && !id.includes('plate')) continue;
    s.equipment[e.slot] = id;
  }
  const food = Object.values(ITEMS).filter((i) => i.heals && i.category === 'food').sort((a, b) => b.heals! - a.heals!)[0].id;
  s.bag[food] = 600;
  s.hp = 99999;
  return s;
}

describe('副本地形（10-25）', () => {
  it('每层都能走通：所有停靠点从起点都走得到，最后一层是宝箱，其余是楼梯', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = gate(seed % 2 ? 'green' : 'blue', 3 + (seed % 5), 1 + (seed % 7), seed * 7919);
      for (let f = 0; f < g.floors; f++) {
        const F = dungeonFloor(g, f);
        expect(F.stops.length, `${seed}/${f}`).toBeGreaterThan(2);
        expect(F.stops[F.stops.length - 1].kind).toBe(f === g.floors - 1 ? 'chest' : 'stairs');
        // 每段路都接得上：相邻两格只差一步
        let cur = F.start;
        F.legs.forEach((leg) => {
          for (const p of leg) {
            expect(Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y)).toBe(1);
            expect(F.grid[p.y * F.w + p.x]).toBe(1);
            cur = p;
          }
        });
        // 每只怪都走到了跟前
        F.stops.forEach((st, i) => {
          const end = F.legs[i].length ? F.legs[i][F.legs[i].length - 1] : null;
          if (end) expect(Math.abs(end.x - st.x) + Math.abs(end.y - st.y)).toBeLessThanOrEqual(1);
        });
        // 最后一层：首领守宝箱
        if (f === g.floors - 1) expect(F.stops.some((st) => st.monster && MONSTERS[st.monster].rank === 'boss')).toBe(true);
        for (const st of F.stops) if (st.monster) expect(MONSTERS[st.monster], st.monster).toBeTruthy();
      }
    }
  });

  it('同一个洞口每次生成一样，不同洞口地形不一样', () => {
    const a = dungeonFloor(gate('green', 4, 2, 111), 0);
    const b = dungeonFloor({ ...gate('green', 4, 2, 111), id: 'other' }, 0);
    const c = dungeonFloor(gate('green', 4, 2, 222), 0);
    expect([...b.grid]).toEqual([...a.grid]);
    expect([...c.grid]).not.toEqual([...a.grid]);
  });

  it('层数：绿洞 1-4、蓝洞 2-7', () => {
    let r = 5;
    for (let i = 0; i < 2000; i++) {
      const [x, n] = nextRandom(r);
      r = n;
      const g = rollFloors('green', x);
      const b = rollFloors('blue', x);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(4);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(7);
    }
  });

  it('越深越强，蓝洞比绿洞强', () => {
    const f0 = dungeonFloor(gate('green', 5, 4, 3), 0).stops.find((s) => s.monster)!.monster!;
    const id = (kind: string, floor: number) => f0.replace(/^dg\|\w+\|(\d)\|\d\|/, `dg|${kind}|$1|${floor}|`);
    const m0 = MONSTERS[id('green', 0)];
    const m3 = MONSTERS[id('green', 3)];
    const b0 = MONSTERS[id('blue', 0)];
    expect(m3.hp).toBeGreaterThan(m0.hp);
    expect(m3.maxHit).toBeGreaterThan(m0.maxHit);
    expect(b0.hp).toBeGreaterThan(m0.hp);
    expect(b0.maxHit).toBeGreaterThan(m0.maxHit);
  });
});

describe('宝箱', () => {
  it('层数越多高品质概率越大', () => {
    const g1 = chestOdds('green', 1);
    const g4 = chestOdds('green', 4);
    const b7 = chestOdds('blue', 7);
    expect(g4[3]).toBeGreaterThan(g1[3]);
    expect(b7[3]).toBeGreaterThan(g4[3]);
    expect(b7[0]).toBeLessThan(g1[0]);
  });

  it('开出来的都是存在的物品，一定有金币；T6 绿洞很难出 T7 以上装备', () => {
    let r = 9;
    const rand = () => { const [x, n] = nextRandom(r); r = n; return x; };
    let high = 0;
    let gear = 0;
    for (let i = 0; i < 3000; i++) {
      const got = rollChest(gate('green', 5, 3, i), i % 4, rand);
      expect(got.coins).toBeGreaterThan(0);
      for (const id of Object.keys(got)) {
        expect(ITEMS[id], id).toBeTruthy();
        const it = ITEMS[id];
        if (it.equip) { gear++; if ((it.tier ?? 0) >= 6) high++; }
      }
    }
    expect(gear).toBeGreaterThan(100);
    expect(high / gear).toBeLessThan(0.08);
  });
});

describe('组队宝箱掷点分配', () => {
  const team = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }];
  it('每个人算出来的结果一样，人人有份，装备钥匙强化石按掷点给最高的人', () => {
    for (let seed = 1; seed < 60; seed++) {
      const g = gate('blue', 5, 5, seed);
      const x = teamChest(g, seed % 4, team);
      const y = teamChest(g, seed % 4, [...team]);
      expect(y).toEqual(x);
      for (const sh of x.shares) {
        expect(sh.coins).toBeGreaterThan(0);
        expect(Object.keys(sh).length).toBeGreaterThan(1);
      }
      for (const r of x.rolls) {
        expect(r.rolls.length).toBe(3);
        expect(r.rolls[r.winner]).toBe(Math.max(...r.rolls));
      }
    }
  });

  it('副本里组队开箱：拿到自己那一份', () => {
    let s = strong(4);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('blue', 4, 2, 31), x: 300, y: 300 };
    s = enterDungeon(s, g, 3, T0, { members: team, me: 'b' });
    s = advance(s, T0 + 3 * 3600_000).state;
    expect(s.dungeon?.phase).toBe('chest');
    // 三个人都打出过伤害（10-26：宝箱只分给有输出的人）
    s = { ...s, dungeon: { ...s.dungeon!, contrib: ['a', 'b', 'c'] } };
    const [s2, got] = openDungeonChest(s);
    const t = teamChest(g, s2.dungeon!.chest!, team);
    expect(got).toEqual(t.shares[1]);
    expect(s2.dungeon!.split).toEqual(t.shares);
  });

  it('只分给打出过伤害的队友：没参与的不分，只有自己打就按单人开', () => {
    let s = strong(4);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('green', 4, 2, 32), x: 300, y: 300 };
    s = enterDungeon(s, g, 3, T0, { members: team, me: 'b' });
    s = advance(s, T0 + 3 * 3600_000).state;
    expect(s.dungeon?.phase).toBe('chest');
    expect(s.dungeon!.contrib).toEqual(['b']);
    const [solo] = openDungeonChest(s);
    expect(solo.dungeon!.split).toBeUndefined();
    const two = markContrib(s, 'a');
    const [s2, got] = openDungeonChest(two);
    const crew = team.filter((m) => m.id !== 'c');
    const t = teamChest(g, s2.dungeon!.chest!, crew);
    expect(got).toEqual(t.shares[crew.findIndex((m) => m.id === 'b')]);
    expect(s2.dungeon!.split![team.findIndex((m) => m.id === 'c')]).toEqual({});
  });
});

describe('副本组队同步', () => {
  const team = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }];
  it('队友打得靠前就把自己拉上去，清掉的怪算上、分到经验；只往前不往后', () => {
    let s = strong(4);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('green', 4, 3, 77), x: 300, y: 300 };
    s = enterDungeon(s, g, 2, T0, { members: team, me: 'a' });
    const xp0 = Object.values(s.xp).reduce((a, b) => a + b, 0);
    const F0 = dungeonFloor(g, 0);
    const s1 = syncDungeon(s, { gate: g.id, floor: 1, idx: 2, phase: 'walk' });
    const mobs0 = F0.stops.filter((x) => x.kind === 'mob').length;
    const mobs1 = dungeonFloor(g, 1).stops.slice(0, 2).filter((x) => x.kind === 'mob').length;
    expect(s1.dungeon!.floor).toBe(1);
    expect(s1.dungeon!.idx).toBe(2);
    expect(s1.dungeon!.kills).toBe(mobs0 + mobs1);
    expect(Object.values(s1.xp).reduce((a, b) => a + b, 0)).toBeGreaterThan(xp0);
    // 往回的不理
    expect(syncDungeon(s1, { gate: g.id, floor: 0, idx: 5, phase: 'walk' })).toBe(s1);
    // 别的洞口不理
    expect(syncDungeon(s1, { gate: 'x', floor: 2, idx: 1, phase: 'walk' })).toBe(s1);
    // 队友到了宝箱：自己也能开箱
    const s2 = syncDungeon(s1, { gate: g.id, floor: 2, idx: 0, phase: 'chest' });
    expect(s2.dungeon!.phase).toBe('chest');
    expect(s2.dungeon!.kills).toBe(totalMobs(g));
    expect(s2.dungeon!.chest).toBeGreaterThanOrEqual(0);
    expect(openDungeonChest(s2)[1].coins).toBeGreaterThan(0);
  });

  it('组队时怪物每多一人全属性 +5%，最多 +20%', () => {
    expect(mobBuff(1)).toBe(0);
    expect(mobBuff(2)).toBeCloseTo(0.05);
    expect(mobBuff(5)).toBeCloseTo(0.2);
    expect(mobBuff(8)).toBeCloseTo(0.2);
    const m = MONSTERS[dungeonFloor(gate('blue', 4, 3, 5), 0).stops.find((x) => x.monster)!.monster!];
    const b = buffMob(m, 3);
    expect(b.hp).toBe(Math.round(m.hp * 1.1));
    expect(b.attack).toBe(Math.round(m.attack * 1.1));
  });
});

describe('打副本', () => {
  it('每人同时最多 2 个洞口，两次之间冷却 5 分钟', () => {
    let s = strong(3);
    s.bag[keyId('green', 3)] = 5;
    s.loc = { x: 300, y: 300 };
    const [s1, g1] = openGate(s, keyId('green', 3), { x: 302, y: 300 }, T0);
    expect(g1).toBeTruthy();
    const [, cd] = openGate(s1, keyId('green', 3), { x: 320, y: 300 }, T0 + 60_000);
    expect(cd, '冷却中').toBeNull();
    const [s2, g2] = openGate(s1, keyId('green', 3), { x: 320, y: 300 }, T0 + GATE_CD);
    expect(g2).toBeTruthy();
    const [, g3] = openGate(s2, keyId('green', 3), { x: 340, y: 300 }, T0 + 3 * GATE_CD);
    expect(g3, '已经开着 2 个').toBeNull();
    expect(gateOpenBlock(s2, T0 + 3 * GATE_CD)).toBeTruthy();
    expect(migrate(JSON.parse(JSON.stringify(s2)))!.lastGateAt).toBe(T0 + GATE_CD);
  });

  it('开门 → 进去 → 清完所有怪 → 开宝箱 → 离开回到洞口，离线也能打完', () => {
    let s = strong(3);
    s.bag[keyId('green', 3)] = 1;
    s.loc = { x: 300, y: 300 };
    const [s1, g] = openGate(s, keyId('green', 3), { x: 302, y: 300 }, T0);
    expect(g).toBeTruthy();
    expect(s1.bag.dkey_g4).toBeUndefined();
    // 蓝洞以外一个人能进；要站在洞口旁
    expect(gateBlock({ ...s1, loc: { x: 200, y: 200 } }, g!, 1, T0)).toBeTruthy();
    expect(gateBlock(s1, g!, 1, T0)).toBeNull();
    s = enterDungeon(s1, g!, 1, T0);
    expect(s.dungeon).toBeTruthy();
    // 进去后洞口过期也不影响
    const total = totalMobs(g!);
    const r = advance(s, T0 + 3 * 3600_000);
    s = r.state;
    expect(s.dungeon, '应该还在副本里等开箱').toBeTruthy();
    expect(s.dungeon!.phase).toBe('chest');
    expect(s.dungeon!.kills).toBe(total);
    expect(s.gates?.length ?? 0).toBe(0);
    const [s2, got] = openDungeonChest(s);
    expect(got.coins).toBeGreaterThan(0);
    expect(s2.dungeon!.phase).toBe('open');
    // 开过就不能再开
    expect(openDungeonChest(s2)[1]).toEqual({});
    const out = leaveDungeon(s2);
    expect(out.dungeon).toBeNull();
    expect(out.loc).toEqual({ x: g!.x, y: g!.y });
    // 同一个洞口不能再进
    expect(gateBlock(out, g!, 1, T0)).toBeTruthy();
  });

  it('分段结算和一次结算结果一样', () => {
    let s = strong(4);
    s.bag[keyId('green', 4)] = 1;
    s.loc = { x: 300, y: 300 };
    const [s1, g] = openGate(s, keyId('green', 4), { x: 300, y: 301 }, T0);
    s = enterDungeon(s1, g!, 1, T0);
    const once = advance(s, T0 + 40 * 60_000).state;
    let step = s;
    for (let t = T0; t < T0 + 40 * 60_000; t += 7_000) step = advance(step, t + 7_000).state;
    expect(step.dungeon?.kills).toBe(once.dungeon?.kills);
    expect(step.dungeon?.floor).toBe(once.dungeon?.floor);
    expect(step.xp).toEqual(once.xp);
  });

  it('蓝洞一个人进不去，组队能进', () => {
    const s = strong(4);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('blue', 4, 3, 77), x: 300, y: 300 };
    expect(gateBlock(s, g, 1, T0)).toBeTruthy();
    expect(gateBlock(s, g, 2, T0)).toBeNull();
  });

  it('太弱会阵亡被送回城；洞口没消失、没通关就能再进，接着上次的进度', () => {
    const s = newGame(T0, 1);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('green', 7, 2, 5), x: 300, y: 300, expires: T0 + 3600_000 };
    const r = advance(enterDungeon(s, g, 1, T0), T0 + 20 * 60_000);
    expect(r.state.dungeon).toBeNull();
    expect(r.summary.deaths).toBeGreaterThan(0);
    const back = { ...r.state, loc: { x: 300, y: 300 } };
    expect(back.dgResume?.[0]?.gate.id).toBe(g.id);
    expect(gateBlock(back, g, 1, T0 + 20 * 60_000)).toBeNull();
    const again = enterDungeon(back, g, 1, T0 + 20 * 60_000);
    expect(again.dungeon?.floor).toBe(back.dgResume![0].floor);
    expect(again.dungeon?.idx).toBe(back.dgResume![0].idx);
    expect(again.dungeon?.phase).toBe('walk');
    expect(again.dgResume).toEqual([]);
    // 离开也记进度；洞口消失后就进不去了
    const left = leaveDungeon(again);
    expect(left.dgResume?.length).toBe(1);
    expect(gateBlock(left, g, 1, T0 + 3600_000)).toBeTruthy();
  });

  it('同级同阶装备打得动副本里的怪（含首领）', () => {
    for (const tier of [3, 4, 5, 6, 7]) {
      const s = strong(tier, 8);
      for (const kind of ['green', 'blue'] as const) {
        const F = dungeonFloor(gate(kind, tier, kind === 'green' ? 4 : 7, 99), kind === 'green' ? 3 : 6);
        s.dungeon = { gate: gate(kind, tier, 7, 99), floor: 0, idx: 0, phase: 'walk', ms: 0, total: 0, party: kind === 'blue' ? 3 : 1, kills: 0, started: T0 };
        for (const st of F.stops) {
          if (!st.monster) continue;
          const est = combatEstimate(s, MONSTERS[st.monster]);
          expect(est.killMs, `${kind} T${tier + 1} ${st.monster}`).toBeLessThan(Infinity);
        }
      }
    }
  });

  it('回城卷轴：在副本里用直接离开，传到选的城镇', () => {
    let s = strong(3);
    s.bag.scroll_town = 2;
    s.loc = { x: 300, y: 300 };
    s = enterDungeon(s, { ...gate('green', 3, 2, 1), x: 300, y: 300 }, 1, T0);
    const out = useTownScroll(s, 'bank2');
    expect(out.dungeon).toBeNull();
    expect(out.bag.scroll_town).toBe(1);
  });

  it('旧存档：原来的强化石删掉、折成金币，副本状态能读回来', () => {
    const s = newGame(T0, 1) as GameState & Record<string, unknown>;
    const coins = s.bank.coins ?? 0;
    s.bank.enh_mid = 3;
    s.bag.enh_legend = 1;
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.bank.enh_mid).toBeUndefined();
    expect(m.bag.enh_legend).toBeUndefined();
    expect(m.bank.coins).toBe(coins + 3 * 380 + 1160);
    const inside = enterDungeon({ ...strong(3), loc: { x: 300, y: 300 } }, { ...gate('green', 3, 2, 1), x: 300, y: 300 }, 1, T0);
    const back = migrate(JSON.parse(JSON.stringify(inside)))!;
    expect(back.dungeon?.gate.seed).toBe(1);
  });
});

describe('副本队友伤害记到同一只怪上（10-26）', () => {
  it('收到队友伤害就扣自己这边的怪血，扣光了怪倒下、记下最后一击', async () => {
    const { pushMateHit, stopKey, setDgCrew } = await import('./aggro');
    let s = strong(4);
    s.loc = { x: 300, y: 300 };
    const g = { ...gate('green', 4, 2, 41), x: 300, y: 300 };
    s = enterDungeon(s, g, 1, T0);
    let t = T0;
    while (s.dungeon && s.dungeon.phase !== 'fight' && t < T0 + 600_000) s = advance(s, (t += 200)).state;
    expect(s.dungeon?.phase).toBe('fight');
    const idx = s.dungeon!.idx;
    s = advance(s, (t += 10)).state;
    expect(s.combat).toBeTruthy();
    pushMateHit(stopKey(g.id, s.dungeon!.floor, idx), s.combat!.monsterHp + 5);
    s = advance(s, (t += 10)).state;
    expect(s.dungeon!.idx).toBe(idx + 1);
    expect(s.dungeon!.lastHit).toMatchObject({ idx, mine: false });
    setDgCrew(0);
  });
});
