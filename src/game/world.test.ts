import { findPath, isWalkable, reachableNear, regionAt, SPAWN, standTile } from './world';
import { ACTIONS, MAP_W, NODES, townXY } from '../core/data';

describe('世界', { timeout: 30_000 }, () => {
  it('每个资源点都在区域图上规定的区域里', () => {
    for (const n of NODES) expect(regionAt(n.x, n.y), n.name).toBe(n.region);
  });

  it('从城镇能走到每个资源点', () => {
    for (const n of NODES) {
      const s = standTile(n);
      const path = findPath(SPAWN, s);
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
