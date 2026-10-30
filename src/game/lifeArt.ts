import { Pix } from './pix';

/**
 * 家园岛上的小生命和小动静（用户 10-30「继续增加家园内容 更多游戏细节」）：
 * 鸡舍边啄食的鸡、花丛里的蝴蝶、蜂箱边的蜜蜂、鱼塘里跳出水的鱼和水花、篝火的烟、灯塔的光柱。
 * 全部逐像素画，场景第一次用到时生成。
 */

const draw = (p: Pix, rows: string[], pal: Record<string, string>, ox = 0, oy = 0) =>
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) p.set(ox + x, oy + y, pal[ch]); }));

/** 鸡：两帧，站着 / 低头啄。8×8，朝右 */
export function paintChicken(): HTMLCanvasElement[] {
  const pal = { w: '#f8f4ea', s: '#d8d0c0', r: '#e03a2a', y: '#f0a830', k: '#1a1010' };
  const stand = ['...rr...', '...wwy..', '...wk...', 'w.www...', 'wwwwww..', '.sswws..', '..ss....', '..y.y...'];
  const peck = ['........', '........', '........', 'w.......', 'wwwwrr..', '.swwwwk.', '..sswwy.', '..y.y...'];
  return [stand, peck].map((rows) => { const p = new Pix(8, 8); draw(p, rows, pal); return p.outlineTinted().canvas(); });
}

/** 蝴蝶：两帧扇翅膀，几种颜色 */
export function paintButterfly(col: string, dark: string): HTMLCanvasElement[] {
  const open = ['a...a', 'ab.ba', '.aka.', 'ab.ba', '.a.a.'];
  const shut = ['.....', '.a.a.', '.aka.', '.a.a.', '.....'];
  return [open, shut].map((rows) => { const p = new Pix(5, 5); draw(p, rows, { a: col, b: dark, k: '#2a1a1a' }); return p.canvas(); });
}

/** 蜜蜂：2×2 的黄黑小点，带一点亮翅 */
export function paintBee(): HTMLCanvasElement {
  const p = new Pix(3, 3);
  draw(p, ['.w.', 'yky', '...'], { w: '#e8f4ff', y: '#f8c830', k: '#2a1a0a' });
  return p.canvas();
}

/** 跳出水面的鱼：6×4，朝右 */
export function paintJumpFish(col: string): HTMLCanvasElement {
  const p = new Pix(6, 4);
  draw(p, ['.aa..a', 'aaaaaa', 'aaka.a', '.aa...'], { a: col, k: '#1a1a2a' });
  p.set(1, 0, '#ffffff');
  return p.canvas();
}

/** 水花：一圈白色的环，三帧从小到大 */
export function paintRipple(r: number): HTMLCanvasElement {
  const w = r * 2 + 3;
  const h = r + 3;
  const p = new Pix(w, h);
  for (let a = 0; a < Math.PI * 2; a += 0.05) p.set(w / 2 - 0.5 + Math.cos(a) * r, h / 2 - 0.5 + Math.sin(a) * r * 0.45, '#e8f6ff');
  return p.canvas();
}

/** 一小团烟：4×4 的灰色软团 */
export function paintSmoke(): HTMLCanvasElement {
  const p = new Pix(5, 5);
  draw(p, ['.aa..', 'abba.', 'abbba', '.abba', '..aa.'], { a: '#8a8890', b: '#b8b6be' });
  return p.canvas();
}

/** 灯塔的光柱：一条从灯头往外渐淡的光带（加色混合用） */
export function paintBeam(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 24;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 120; x++) {
    const half = 2 + (x / 120) * 10;
    const a = 0.55 * (1 - x / 120);
    g.fillStyle = `rgba(255,236,170,${a.toFixed(3)})`;
    g.fillRect(x, 12 - half, 1, half * 2);
  }
  return c;
}
