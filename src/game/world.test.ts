import { findPath, isWalkable, regionAt, SPAWN, standTile } from './world';
import { MAP_W, NODES, townXY } from '../core/data';

describe('世界', { timeout: 30_000 }, () => {
  it('每个资源点都在区域图上规定的区域里', () => {
    for (const n of NODES) expect(regionAt(n.x, n.y), n.name).toBe(n.region);
  });

  it('从城镇能走到每个资源点', () => {
    for (const n of NODES) {
      const s = standTile(n);
      const path = findPath(SPAWN, s);
      expect(path, n.name).not.toBeNull();
      expect(path!.every((p) => isWalkable(p.x, p.y))).toBe(true);
    }
  });

  it('海里和房子里走不进去', () => {
    expect(isWalkable(MAP_W - 3, 530)).toBe(false);
    expect(findPath(SPAWN, townXY(162, 152))).toBeNull();
  });
});
