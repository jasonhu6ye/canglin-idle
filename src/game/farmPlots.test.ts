import { FARM_NODES, FARM_PLOTS, plotsOf } from '../core/data';
import { groundAt, isWalkable } from './world';

describe('田里的地块', () => {
  it('每块田 56 格，都在耕地上，旁边有能站的地方', () => {
    for (const n of FARM_NODES) expect(plotsOf(n.id).length, n.id).toBe(24);
    const keys = new Set(FARM_PLOTS.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(FARM_PLOTS.length);
    for (const p of FARM_PLOTS) {
      expect(groundAt(p.x, p.y), p.id).toBe('farm');
      const side = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => isWalkable(p.x + dx, p.y + dy) && !keys.has(`${p.x + dx},${p.y + dy}`));
      expect(side, p.id).toBe(true);
    }
  });
});
