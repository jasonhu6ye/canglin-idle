// 重新生成步行距离表：npx vite-node scripts/nav-table.ts
// 地点、石碑、传送门的位置或地图地形改了要重跑（nav.test.ts 会检查表是不是最新的）
import { writeFileSync } from 'node:fs';
import { navAnchors, navHash, NAV_LOG } from '../src/core/data';
import { inRealm } from '../src/core/realm';
import { navField, warmNav } from '../src/game/world';

while (!warmNav(1e9));
const pts = navAnchors();
const out: string[] = [];
for (const side of [0, 1]) {
  const list = pts.filter((p) => (inRealm(p) ? 1 : 0) === side);
  const n = list.length;
  const bytes = new Uint8Array((n * (n - 1)) / 2);
  // 块图估的距离两个方向不一样（都偏长），取短的那个
  const D = list.map((p) => { const f = navField([p]); return list.map((q) => f(q).d); });
  let k = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = Math.min(D[a][b], D[b][a]);
      const line = Math.max(1, Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y));
      bytes[k++] = Number.isFinite(d) ? Math.max(0, Math.min(254, Math.round((Math.log(Math.max(1, d / line)) / NAV_LOG) * 254))) : 255;
    }
    if (a % 50 === 0) console.log(`side ${side}: ${a}/${n}`);
  }
  out.push(Buffer.from(bytes).toString('base64'));
}
writeFileSync(new URL('../src/core/navTable.gen.ts', import.meta.url),
  `// 自动生成：npx vite-node scripts/nav-table.ts（地点、石碑位置变了要重新生成）\nexport const NAV_TABLE = { hash: '${navHash(pts)}', main: '${out[0]}', realm: '${out[1]}' };\n`);
console.log(`src/core/navTable.gen.ts 已更新：${pts.length} 个点`);
