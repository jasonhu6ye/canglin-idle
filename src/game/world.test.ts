import { findPath, isWalkable, SPAWN } from './world';
import { NODES } from '../core/data';

describe('寻路', () => {
  it('从广场能走到每个资源点', () => {
    for (const n of NODES) {
      const path = findPath(SPAWN, { x: n.x, y: n.y + 1 });
      expect(path, n.name).not.toBeNull();
      expect(path!.every((p) => isWalkable(p.x, p.y))).toBe(true);
    }
  });

  it('湖里和房子里走不进去', () => {
    expect(findPath(SPAWN, { x: 32, y: 22 })).toBeNull();
    expect(findPath(SPAWN, { x: 15, y: 7 })).toBeNull();
  });
});
