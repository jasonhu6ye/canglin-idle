import { NODES, planRoute, setNavField, travelMs, WAYSTONES, standOf } from '../core/data';
import { findPath, navField, standTile, warmNav } from './world';

const len = (a: { x: number; y: number }, p: { x: number; y: number }[]) => {
  let d = 0;
  let q = a;
  for (const r of p) { d += Math.hypot(r.x - q.x, r.y - q.y); q = r; }
  return d;
};

describe('寻路估时', () => {
  beforeAll(() => { while (!warmNav(1e9)); }, 120000);
  afterAll(() => setNavField(undefined));

  it('步行距离按真实绕路估，和实际寻路差不多', () => {
    const ns = NODES.filter((n) => !n.sea);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    while (n < 6) {
      const a = standTile(ns[Math.floor(rnd() * ns.length)]);
      const b = standTile(ns[Math.floor(rnd() * ns.length)]);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 200 || Math.hypot(a.x - b.x, a.y - b.y) > 2500) continue;
      const p = findPath(a, b);
      if (!p) continue;
      const est = navField([a])(b).d;
      const k = est / len(a, p);
      expect(k).toBeGreaterThan(0.75);
      expect(k).toBeLessThan(1.3);
      n++;
    }
  }, 300000);

  it('以前走不到、绕一倍远的路线（10-27 全图测试找出来的）：都走得到，长度和估算接近', () => {
    const N = (id: string) => standTile(NODES.find((n) => n.id === id)!);
    for (const [f, t, best] of [['stone_swamp', 'whisper_pool', 3292], ['stone_giantwood', 'pine_valley', 586], ['stone_site_obsidian', 'obsidian_pool', 894], ['yandeng_bank', 'stone_highland', 709], ['stone_site_thunder_rift', 'storm_mesa', 0]] as const) {
      const a = N(f);
      const b = N(t);
      const p = findPath(a, b);
      expect(p, `${f} → ${t}`).not.toBeNull();
      if (best) expect(len(a, p!), `${f} → ${t}`).toBeLessThan(best * 1.06);
    }
  }, 300000);

  it('估时不比直线短；石碑路线一定比直接走快', () => {
    const all = WAYSTONES.map((w) => w.id);
    for (let i = 0; i < WAYSTONES.length; i += 3) {
      const a = standOf(WAYSTONES[i]);
      const b = standOf(NODES[(i * 37) % NODES.length]);
      expect(travelMs(a, b)).toBeGreaterThanOrEqual(Math.round((Math.hypot(a.x - b.x, a.y - b.y) * 1000) / 4) - 1);
      const r = planRoute(all, a, b);
      if (r.via) expect(r.ms).toBeLessThan(travelMs(a, b));
    }
  });
});
