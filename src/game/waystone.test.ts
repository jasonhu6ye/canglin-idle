import { NODES, WAYSTONES } from '../core/data';
import { findPath, isBuilding, isWalkable, SPAWN, standTile } from './world';

describe('传说石碑', () => {
  it('每座石碑都能站过去，不在房子里，从城里能走到', () => {
    expect(WAYSTONES.length).toBeGreaterThanOrEqual(15);
    for (const n of WAYSTONES) {
      const st = standTile(n);
      expect(isWalkable(st.x, st.y), n.id).toBe(true);
      expect(isBuilding(n.x, n.y), n.id).toBe(false);
      const close = NODES.filter((m) => m !== n && Math.hypot(m.x - n.x, m.y - n.y) < 4).map((m) => m.id);
      expect(close, n.id).toEqual([]);
      expect(findPath(SPAWN, st, 400000), n.id).not.toBeNull();
    }
  });
});
