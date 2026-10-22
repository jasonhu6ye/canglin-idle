// 把世界导出成 PPM 方便检查：npx vite-node scripts/dump-map.ts out.ppm
import { writeFileSync } from 'node:fs';
const t0 = performance.now();
const w = await import('../src/game/world');
console.log('生成耗时', Math.round(performance.now() - t0), 'ms');
import { MAP_H, MAP_W, NODES } from '../src/core/data';
const C: Record<string, number[]> = {
  grass: [96, 150, 70], meadow: [120, 165, 80], darkgrass: [60, 110, 55], moss: [50, 95, 60], cobble: [150, 140, 125],
  road: [160, 125, 80], roadsnow: [190, 190, 200], roadsand: [200, 170, 110], roaddark: [110, 100, 95], farm: [110, 75, 45],
  sand: [225, 200, 130], beach: [240, 220, 160], snow: [235, 240, 248], ice: [170, 210, 235], rock: [130, 130, 128],
  gravel: [150, 145, 135], ash: [80, 60, 55], basalt: [55, 45, 45], abyss: [60, 50, 80], glowmoss: [70, 120, 120],
  mud: [85, 80, 55], bridge: [140, 100, 60], water: [60, 120, 200], ocean: [30, 70, 150], swampwater: [60, 90, 60],
  lava: [240, 100, 30], chasm: [10, 5, 20], cliff: [70, 70, 75],
};
const buf: number[] = [];
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  let c = C[w.overviewGround(x, y)];

  if (w.isBuilding(x, y)) c = [200, 60, 60];
  buf.push(...c);
}
for (const n of NODES) for (let d = -1; d <= 1; d++) for (const [dx, dy] of [[d, 0], [0, d]]) {
  const i = ((n.y + dy) * MAP_W + n.x + dx) * 3;
  buf[i] = 255; buf[i + 1] = 0; buf[i + 2] = 255;
}
writeFileSync(process.argv[2], Buffer.concat([Buffer.from(`P6 ${MAP_W} ${MAP_H} 255\n`), Buffer.from(buf)]));
