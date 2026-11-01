import { findPath, isWalkable, reachableNear, regionAt, SPAWN, standTile } from './world';
import { ACTIONS, GATE_CAMP, MAP_W, NODES, townXY } from '../core/data';
import { inRealm } from '../core/realm';

describe('世界', { timeout: 30_000 }, () => {
  it('每个资源点都在区域图上规定的区域里', () => {
    for (const n of NODES) expect(regionAt(n.x, n.y), n.name).toBe(n.region);
  });

  it('从城镇能走到每个资源点', () => {
    for (const n of NODES) {
      const s = standTile(n);
      // 永冬冰原隔着深海（11-01）：从营地的回程门走
      const path = findPath(inRealm(n) ? standTile(GATE_CAMP) : SPAWN, s);
      // 海岛要等航行系统（用户 10-24），陆地上的都要走得到
      if (n.sea) { expect(path, `${n.name} 在海岛上，不该有桥`).toBeNull(); continue; }
      expect(path, n.name).not.toBeNull();
      expect(path!.every((p) => isWalkable(p.x, p.y))).toBe(true);
    }
  });

  it('海里和房子里走不进去', () => {
    expect(isWalkable(MAP_W - 3, 530)).toBe(false);
    expect(findPath(SPAWN, townXY(162, 152))).toBeNull();
  });
});

describe('远路', { timeout: 120_000 }, () => {
  it('野外地点能走到落霞城（粗网格不能直接穿河）', () => {
    const to = standTile(NODES.find((n) => n.id === 'bank2')!);
    for (const id of ['golden_plain', 'whisper_pool', 'town_lake', 'stone_jungle', 'python_marsh']) {
      const from = NODES.find((n) => n.id === id);
      if (from) expect(findPath(standTile(from), to), id).not.toBeNull();
    }
  });
  it('怪物刷新点都在角色走得到的地方（不刷在小岛、河对岸）', () => {
    for (const n of NODES) {
      const mons = n.actions.filter((id) => ACTIONS[id].kind === 'combat');
      mons.forEach((id, i) => {
        const ang = (i / mons.length) * Math.PI * 2 + 0.6;
        const ring = 8 + (i % 4) * 4;
        const at = { x: Math.round(n.x + Math.cos(ang) * ring), y: Math.round(n.y + 2 + Math.sin(ang) * ring * 0.6) };
        const spot = reachableNear(standTile(n), at);
        expect(spot, id).not.toBeNull();
        expect(findPath(standTile(n), spot!), id).not.toBeNull();
      });
    }
  });
});

describe('神秘区域（11-01 暂未开放）', () => {
  it('空气墙挡着，整块都走不进去', async () => {
    const { MYSTERY_BOX: M } = await import('../core/realm');
    for (let i = 0; i < 400; i++) {
      const x = M.x + ((i * 37) % M.size), y = M.y + ((i * 91) % M.size);
      expect(isWalkable(x, y), `${x},${y}`).toBe(false);
    }
    const edge = { x: M.x + (M.size >> 1), y: M.y + M.size + 20 };
    expect(findPath(standTile(GATE_CAMP), { x: edge.x, y: M.y + M.size - 30 })).toBeNull();
  });
});
