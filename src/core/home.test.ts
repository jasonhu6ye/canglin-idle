import { describe, expect, it } from 'vitest';
import { canPlace, enterHome, HOME_SPAWN, homeCan, homeChest, leaveHome, migrateHome, placeBuild, removeAt, upgradeHome, atPortal } from './home';
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
