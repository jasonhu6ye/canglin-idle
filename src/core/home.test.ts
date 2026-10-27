import { describe, expect, it } from 'vitest';
import {
  canPlace, enterHome, HOME_SPAWN, homeCan, homeChest, leaveHome, migrateHome, placeBuild, removeAt, upgradeHome, atPortal,
  BUILDS, collectHome, homeProduce, produceMs, comfortLevel, homeComfort, homePct, homePlots, homePlotCells, HOME_PLOT_MAX, PORTAL_IDS, homeNode,
} from './home';
import { ITEMS } from './data';
import { fieldCounts, fieldCrops, harvestAll, installSprinkler, nearField, plantAll, tendPlot } from './farm';
import { advance, migrate } from './sim';
import { NODES, standOf } from './data';
import { atBank, atMarket, nearNode, newGame } from './sim';
import type { GameState } from './types';

const portal = NODES.find((n) => n.id === 'portal_home')!;
function onIsland(): GameState {
  const s = newGame(1_700_000_000_000);
  s.loc = { x: portal.x, y: portal.y + 1 };
  s.travel = null; s.walk = null;
  s.bank = { plank_1: 100, stone: 200, copper_bar: 20, coins: 50_000, plank_2: 300 };
  return enterHome(s);
}
const X = HOME_SPAWN.x + 4;
const Y = HOME_SPAWN.y + 4;

describe('家园岛屿', () => {
  it('站在传送门旁才能进岛，进岛后 inside', () => {
    const s = newGame(1);
    expect(enterHome(s)).toBe(s);
    const a = onIsland();
    expect(a.home?.inside).toBe(true);
    expect(a.home?.from).toBe('portal_home');
    expect(atPortal({ ...a, loc: { x: 0, y: 0 } })).toBeUndefined();
  });

  it('放置扣仓库材料，拆除全额退回', () => {
    const s = onIsland();
    const a = placeBuild(s, 'wall_wood', X, Y);
    expect(a.home!.things).toHaveLength(1);
    expect(a.bank.plank_1).toBe(98);
    expect(canPlace(a, 'wall_wood', X, Y)).toBe('这里已经有东西了');
    const b = removeAt(a, X, Y);
    expect(b.home!.things).toHaveLength(0);
    expect(b.bank.plank_1).toBe(100);
  });

  it('地板换地板会退旧料；不能盖在海里或传送门上', () => {
    const s = onIsland();
    const a = placeBuild(placeBuild(s, 'floor_wood', X, Y), 'path', X, Y);
    expect(a.home!.floors[`${X},${Y}`]).toBe('path');
    expect(a.bank.plank_1).toBe(100);
    expect(a.bank.stone).toBe(199);
    expect(canPlace(s, 'wall_wood', 2, 2)).toBe('只能盖在陆地上');
    expect(canPlace(s, 'wall_wood', HOME_SPAWN.x, HOME_SPAWN.y - 3)).toBe('传送门旁边要留出来');
    expect(canPlace({ ...s, bank: {} , bag: {} }, 'statue', X, Y)).toBe('材料不够');
  });

  it('制作台让岛上能直接做城里同名建筑的动作，储物箱算仓库', () => {
    const kitchen = NODES.find((n) => n.id === 'kitchen')!;
    let s = onIsland();
    expect(homeCan(s, kitchen.actions[0])).toBe(false);
    s = placeBuild(s, 'st_kitchen', X, Y);
    expect(homeCan(s, kitchen.actions[0])).toBe(true);
    expect(atBank(s)).toBe(false);
    s = placeBuild(s, 'chest', X, Y + 3);
    expect(homeChest(s)).toBe(true);
    expect(atBank(s)).toBe(true);
    // 出了岛就不算
    const out = leaveHome(s);
    expect(homeCan(out, kitchen.actions[0])).toBe(false);
    expect(atBank({ ...out, loc: standOf(portal) })).toBe(false);
  });

  it('扩建扣金币和材料，岛屿变大', () => {
    const s = onIsland();
    s.bank.stone = 300;
    const a = upgradeHome(s);
    expect(a.home!.lv).toBe(1);
    expect(a.bank.coins).toBe(30_000);
  });

  it('读档清掉不存在的东西', () => {
    const h = migrateHome({ lv: 9, floors: { '1,1': 'nope', '2,2': 'path' }, things: [{ id: 'nope', x: 1, y: 1 }, { id: 'bed', x: 3, y: 3 }], inside: true, from: 'bad' });
    expect(h).toEqual({ lv: 2, floors: { '2,2': 'path' }, things: [{ id: 'bed', x: 3, y: 3 }], inside: true });
  });

  it('人在岛上够不着城里的仓库、集市、建筑；进岛落脚的格子不能盖', () => {
    const s = onIsland();
    const bank = NODES.find((n) => n.opens === 'bank')!;
    const market = NODES.find((n) => n.id === 'market')!;
    const kitchen = NODES.find((n) => n.id === 'kitchen')!;
    for (const n of [bank, market, kitchen]) {
      const here = { ...s, loc: standOf(n) };
      expect(nearNode(here, n)).toBe(false);
      expect(nearNode({ ...here, home: { ...here.home!, inside: false } }, n)).toBe(true);
    }
    expect(atMarket({ ...s, loc: standOf(market) })).toBe(false);
    expect(canPlace(s, 'wall_wood', HOME_SPAWN.x, HOME_SPAWN.y)).toBe('传送门旁边要留出来');
  });
});

describe('家园农田和舒适度（10-27）', () => {
  const rich = () => {
    const s = onIsland();
    s.bank = { ...s.bank, plank_2: 2000, stone: 2000, fert_basic: 100, seed_potato: 30, plank_1: 200, cloth_1: 50, green_herb: 50, wheat: 50, copper_bar: 50 };
    return s;
  };
  /** 从岛中间往外找能放的位置 */
  const spot = (s: GameState, id: string) => {
    for (let r = 0; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = X + dx * 2, y = Y + dy * 2;
      if (!canPlace(s, id, x, y)) return { x, y };
    }
    throw new Error('no spot');
  };

  it('农田最多 8 块，编号 1-8，拆掉的空号再用', () => {
    let s = rich();
    for (let i = 0; i < HOME_PLOT_MAX; i++) { const p = spot(s, 'farm_plot'); s = placeBuild(s, 'farm_plot', p.x, p.y); }
    expect(homePlots(s).map((t) => t.n).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(canPlace(s, 'farm_plot', X + 40, Y + 40)).toBe('农田最多 8 块');
    const third = homePlots(s).find((t) => t.n === 3)!;
    s = removeAt(s, third.x + 1, third.y + 1);
    expect(homePlots(s)).toHaveLength(7);
    const p = spot(s, 'farm_plot');
    s = placeBuild(s, 'farm_plot', p.x, p.y);
    expect(homePlots(s).map((t) => t.n).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 读档保留编号
    expect(migrateHome(s.home)!.things.filter((t) => t.id === 'farm_plot').map((t) => t.n).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('家园农田在岛上就能种，什么阶级都能种；拆田退种子', () => {
    let s = rich();
    const p = spot(s, 'farm_plot');
    s = placeBuild(s, 'farm_plot', p.x, p.y);
    const t = homePlots(s)[0];
    const cells = homePlotCells(t);
    expect(cells).toHaveLength(16);
    expect(nearField(s, 'hfield1')).toBe(true);
    expect(fieldCrops('hfield1').length).toBeGreaterThan(30);
    expect(homeNode('hfield1')?.name).toBe('家园农田 1');
    const now = 1_700_000_000_000;
    const r = tendPlot(s, cells[0].id, 'potato', now);
    expect(r.state.farm?.[cells[0].id]?.crop).toBe('potato');
    const all = plantAll(r.state, 'hfield1', 'potato', now);
    expect(fieldCounts(all.state, 'hfield1', now).growing).toBe(16);
    const seeds = all.state.bank.seed_potato + (all.state.bag.seed_potato ?? 0);
    // 出岛就够不着
    expect(nearField(leaveHome(all.state), 'hfield1')).toBe(false);
    // 熟了收
    const later = now + 24 * 3_600_000;
    const h = harvestAll(all.state, 'hfield1', later);
    expect((h.state.bag.potato ?? 0) + (h.state.bank.potato ?? 0)).toBeGreaterThan(16);
    // 拆田：种着的每格退一颗种子，田里的记录清掉
    const gone = removeAt(all.state, t.x, t.y);
    expect(homePlots(gone)).toHaveLength(0);
    expect(Object.keys(gone.farm ?? {}).filter((k) => k.startsWith('hfield'))).toHaveLength(0);
    expect(gone.bank.seed_potato + (gone.bag.seed_potato ?? 0)).toBe(seeds + 16);
  });

  it('家园农田能自动补种（离线也算）', () => {
    let s = rich();
    const p = spot(s, 'farm_plot');
    s = placeBuild(s, 'farm_plot', p.x, p.y);
    s.settings.autoFarm = { hfield1: true };
    const T0 = 1_700_000_000_000;
    const r = plantAll(s, 'hfield1', 'potato', T0);
    const { state, summary } = advance(r.state, T0 + 3 * 3_600_000);
    expect(summary.items.potato).toBeGreaterThan(16);
    expect(state.bank.potato).toBeGreaterThan(0);
  });

  it('地毯上能摆家具，田里不能摆东西也不能铺地板', () => {
    let s = rich();
    s.bank = { ...s.bank, cloth_2: 100, cloth_3: 100, plank_3: 100, hide_1: 50 };
    const rug = spot(s, 'rug_round');
    s = placeBuild(s, 'rug_round', rug.x, rug.y);
    expect(canPlace(s, 'table', rug.x, rug.y)).toBeNull();
    s = placeBuild(s, 'table', rug.x, rug.y);
    // 拆除先拆上面的桌子
    const a = removeAt(s, rug.x, rug.y);
    expect(a.home!.things.map((t) => t.id)).toEqual(['rug_round']);
    const p = spot(s, 'farm_plot');
    s = placeBuild(s, 'farm_plot', p.x, p.y);
    expect(canPlace(s, 'table', p.x + 1, p.y + 1)).toBe('田里不能摆东西');
    expect(canPlace(s, 'floor_wood', p.x + 1, p.y + 1)).toBe('田里不能铺地板');
    expect(canPlace(s, 'rug_round', p.x + 2, p.y + 2)).toBe('这里已经有东西了');
  });

  it('摆饰品加舒适度，同种东西越摆越少，舒适度给经验和速度加成', () => {
    let s = rich();
    expect(homeComfort(s.home)).toBe(0);
    expect(homePct(s, 'xp')).toBe(0);
    const scores: number[] = [];
    for (let i = 0; i < 8; i++) { const p = spot(s, 'painting'); s = placeBuild(s, 'painting', p.x, p.y); scores.push(homeComfort(s.home)); }
    const gains = scores.map((v, i) => v - (scores[i - 1] ?? 0));
    expect(gains[0]).toBeGreaterThan(gains[1]);
    expect(gains[7]).toBe(0);
    for (const id of ['books', 'candle', 'flowerbed']) { const p = spot(s, id); s = placeBuild(s, id, p.x, p.y); }
    expect(comfortLevel(homeComfort(s.home))).toBeGreaterThan(0);
    expect(homePct(s, 'xp')).toBeGreaterThan(0);
    expect(homePct(s, 'speed')).toBeGreaterThan(0);
  });

  it('每个城的家园传送门都能进；所有建造材料都存在', () => {
    expect(PORTAL_IDS.length).toBe(NODES.filter((n) => n.portal).length);
    for (const id of PORTAL_IDS) {
      const n = NODES.find((x) => x.id === id)!;
      const s = newGame(1);
      s.loc = { x: n.x, y: n.y + 1 };
      s.travel = null; s.walk = null;
      expect(enterHome(s).home?.inside, id).toBe(true);
    }
    for (const d of BUILDS) for (const c of d.cost) expect(ITEMS[c.item], `${d.id}:${c.item}`).toBeTruthy();
  });
});

describe('家园产出（10-27）', () => {
  const T0 = 1_700_000_000_000;
  const MIN = 60_000;
  const setup = () => {
    const s = onIsland();
    s.bank = { ...s.bank, plank_2: 500, wheat: 100, oak_log: 50, green_herb: 50, fert_basic: 10, plank_1: 100, iron_bar: 10 };
    return s;
  };
  it('鸡舍按时下蛋，攒满封顶，收取进仓库，零头接着算', () => {
    let s = placeBuild(setup(), 'coop', X, Y, T0);
    expect(homeProduce(s.home, T0 + 19 * MIN)).toEqual({});
    expect(homeProduce(s.home, T0 + 45 * MIN)).toEqual({ egg: 2 });
    const r = collectHome(s, T0 + 45 * MIN);
    expect(r.got).toEqual({ egg: 2 });
    expect(r.state.bank.egg).toBe(2);
    // 零头 5 分钟留着：再过 15 分钟又有一个
    expect(homeProduce(r.state.home, T0 + 60 * MIN)).toEqual({ egg: 1 });
    // 离线一天也只攒 12 个，收完从头算
    s = r.state;
    const full = collectHome(s, T0 + 24 * 60 * MIN);
    expect(full.got.egg).toBe(12);
    expect(homeProduce(full.state.home, T0 + 24 * 60 * MIN + 10 * MIN)).toEqual({});
    // 不在岛上收不了
    expect(collectHome(leaveHome(s), T0 + 24 * 60 * MIN).got).toEqual({});
  });
  it('单收一件：只收点到的那件', () => {
    let s = placeBuild(setup(), 'coop', X, Y, T0);
    s = placeBuild(s, 'apple_tree', X + 4, Y, T0);
    const r = collectHome(s, T0 + 120 * MIN, { x: X + 4, y: Y });
    expect(r.got).toEqual({ apple: 3 });
    expect(homeProduce(r.state.home, T0 + 120 * MIN)).toEqual({ egg: 6 });
  });
  it('花坛让蜂箱产得快，最多快一半', () => {
    let s = placeBuild(setup(), 'beehive', X, Y, T0);
    const base = produceMs(s.home, 'beehive');
    s.bank = { ...s.bank, stone: 999, green_herb: 99 };
    for (let i = 0; i < 7; i++) s = placeBuild({ ...s, bank: { ...s.bank, stone: 999 } }, 'flowerbed', X + 2, Y + 2 + i * 2, T0);
    expect(produceMs(s.home, 'beehive')).toBeCloseTo(base / 1.5);
  });
  it('有雨水桶时家园农田新种的自动浇水', () => {
    let s = setup();
    s.bank = { ...s.bank, stone: 999, seed_potato: 10 };
    s = placeBuild(s, 'farm_plot', X, Y + 3, T0);
    s = placeBuild(s, 'water_barrel', X + 6, Y + 3, T0);
    const r = plantAll(s, 'hfield1', 'potato', T0);
    expect(Object.values(r.state.farm ?? {}).every((p) => p.water)).toBe(true);
  });
});

describe('家园读档（10-27 全面检查）', () => {
  it('读档后家园农田里的庄稼、洒水器、自动补种都还在，不会被当成旧田退掉', () => {
    let s = onIsland();
    s.bank = { ...s.bank, plank_2: 500, stone: 999, fert_basic: 10, seed_potato: 20, sprinkler: 1 };
    s = placeBuild(s, 'farm_plot', X, Y + 3);
    s.settings.autoFarm = { hfield1: true };
    const now = 1_700_000_000_000;
    s = plantAll(s, 'hfield1', 'potato', now).state;
    s = installSprinkler(s, 'hfield1', now).state;
    const seeds = s.bank.seed_potato;
    const back = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(Object.keys(back.farm ?? {}).filter((k) => k.startsWith('hfield1:'))).toHaveLength(16);
    expect(back.bank.seed_potato).toBe(seeds);
    expect(back.bank.potato ?? 0).toBe(s.bank.potato ?? 0);
    expect(back.sprinklers).toContain('hfield1');
    expect(back.settings.autoFarm?.hfield1).toBe(true);
    // 田拆了以后剩下的地块记录读档时清掉并退回
    const orphan = { ...s, home: { ...s.home!, things: [] } };
    const b2 = migrate(JSON.parse(JSON.stringify(orphan)))!;
    expect(Object.keys(b2.farm ?? {}).filter((k) => k.startsWith('hfield'))).toHaveLength(0);
    expect(b2.sprinklers ?? []).not.toContain('hfield1');
  });
  it('读档保留产出建筑的计时', () => {
    let s = onIsland();
    s.bank = { ...s.bank, plank_2: 500, wheat: 100 };
    s = placeBuild(s, 'coop', X, Y, 1_700_000_000_000);
    const back = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(back.home!.things.find((t) => t.id === 'coop')!.at).toBe(1_700_000_000_000);
  });
});

