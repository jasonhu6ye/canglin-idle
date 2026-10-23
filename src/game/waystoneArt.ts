import { mix, phash, Pix } from './pix';

/**
 * 传说石碑（用户 10-23 要求的传送点）：逐像素画的方尖石碑，立在三层石台上，碑身刻一列符文。
 * 没激活是灰石、符文暗着；激活后符文发青光，碑顶嵌的晶石也亮起来。
 */
export const STONE_W = 24;
export const STONE_H = 44;

const ROCK = ['#2e2c34', '#4a4752', '#6a6672', '#8e8a96', '#b4b0ba'];
const MOSS = ['#2e4a22', '#4a6e2e', '#6a9a3a'];

export function paintWaystone(lit: boolean): HTMLCanvasElement {
  const p = new Pix(STONE_W, STONE_H);
  const cx = STONE_W / 2;
  const tone = (nx: number, y: number, x: number) => {
    // 左上来光：左边亮右边暗，加一点石头的颗粒
    const k = -nx * 0.9 + (phash(x, y, 5) - 0.5) * 0.5;
    return ROCK[Math.max(0, Math.min(4, Math.round(2 + k * 1.6)))];
  };
  // 石台：三层，越往下越宽
  const steps: [number, number, number][] = [[STONE_H - 3, 3, 11.5], [STONE_H - 6, 3, 9.5], [STONE_H - 8, 2, 7.5]];
  for (const [top, h, half] of steps) {
    for (let y = top; y < top + h; y++) {
      for (let x = Math.ceil(cx - half); x < cx + half; x++) {
        const nx = (x + 0.5 - cx) / half;
        p.set(x, y, y === top ? mix(tone(nx, y, x), '#ffffff', 0.15) : tone(nx, y, x));
      }
    }
  }
  // 碑身：从 6 宽收到 4 宽（半宽），顶上一个尖
  const baseY = STONE_H - 8;
  const topY = 9;
  for (let y = topY; y < baseY; y++) {
    const k = (y - topY) / (baseY - topY);
    const half = 3.6 + k * 1.8;
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const nx = (x + 0.5 - cx) / half;
      p.set(x, y, tone(nx, y, x));
    }
  }
  for (let y = 2; y < topY; y++) {
    const half = ((y - 2) / (topY - 2)) * 3.6;
    for (let x = Math.floor(cx - half); x < cx + half; x++) p.set(x, y, tone((x + 0.5 - cx) / Math.max(half, 0.5), y, x));
  }
  // 碑顶嵌一颗晶石
  const gem = lit ? ['#2a8ab0', '#6ad8f0', '#d8fcff'] : ['#3a3a48', '#5a5a6a', '#7a7a8a'];
  p.set(cx - 1, topY, gem[0]);
  p.set(cx, topY, gem[1]);
  p.set(cx - 1, topY + 1, gem[1]);
  p.set(cx, topY + 1, gem[2]);
  // 一列符文：横、竖、折交替刻
  const rune = lit ? ['#5ad8f0', '#c8fcff'] : ['#25232a', '#3a3842'];
  const glyphs = [[[0, 0], [1, 0], [0, 1]], [[1, 0], [1, 1], [0, 2]], [[0, 0], [1, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 2]]];
  let gy = topY + 4;
  for (const g of glyphs) {
    if (gy + 3 >= baseY - 1) break;
    for (const [dx, dy] of g) p.set(cx - 1 + dx, gy + dy, dy === 0 ? rune[1] : rune[0]);
    gy += 5;
  }
  // 石台角上长点苔藓
  for (const [x, y] of [[1, STONE_H - 3], [2, STONE_H - 3], [STONE_W - 3, STONE_H - 3], [4, STONE_H - 6], [cx + 4, baseY - 1]] as const) {
    p.set(x, y, MOSS[Math.floor(phash(x, y, 9) * 3)]);
  }
  return p.outlineTinted().canvas();
}
