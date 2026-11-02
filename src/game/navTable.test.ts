import { setNavField } from '../core/data';
import { navField, warmNav } from './world';

// 单独一个文件：别的寻路测试会让块图「学到」一些不通的边，这里要和生成表时一样从头建的块图比
describe('步行距离表', () => {
  beforeAll(() => { while (!warmNav(1e9)); }, 120000);
  afterAll(() => setNavField(undefined));

  it('步行距离表是最新的，查表和按地图算的一样（11-02：本机和服务器都查这张表）', async () => {
    const { navAnchors, navHash, walkFrom } = await import('../core/data');
    const { NAV_TABLE } = await import('../core/navTable.gen');
    const pts = navAnchors();
    expect(NAV_TABLE.hash, '地点位置变了：跑 npx vite-node scripts/nav-table.ts').toBe(navHash(pts));
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) {
      const a = pts[Math.floor(rnd() * pts.length)];
      const b = pts[Math.floor(rnd() * pts.length)];
      const real = Math.min(navField([a])(b).d, navField([b])(a).d);
      if (!Number.isFinite(real) || real < 5) continue;
      const k = walkFrom(a)(b) / real;
      expect(k, `${JSON.stringify(a)} ${JSON.stringify(b)}`).toBeGreaterThan(0.98);
      expect(k).toBeLessThan(1.02);
    }
  });

});
