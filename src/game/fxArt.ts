/*
 * 氛围和战斗特效用的小贴图：雨丝、飞鸟、蝴蝶、刀光、箭、命中火花。
 * 都很小，直接逐像素画。
 */
import { Pix } from './pix';

const canvasOf = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
};

/** 斜着落的雨丝 */
export const paintRain = () => canvasOf(3, 7, (ctx) => {
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(190,215,255,${0.25 + i * 0.1})`;
    ctx.fillRect(2 - Math.floor(i / 3), i, 1, 1);
  }
});

/** 雨点溅起的小水花 */
export const paintSplash = () => canvasOf(5, 2, (ctx) => {
  ctx.fillStyle = 'rgba(200,225,255,0.8)';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillRect(4, 0, 1, 1);
  ctx.fillRect(1, 1, 3, 1);
});

/** 飞鸟两帧：翅膀上扬 / 下压，横着排 */
export function paintBird(): HTMLCanvasElement {
  const p = new Pix(18, 6);
  const body = '#2a2228';
  const wing = '#4a3e44';
  // 帧 0：翅膀上扬
  p.line(1, 1, 4, 3, wing); p.line(4, 3, 7, 1, wing); p.rect(3, 3, 3, 1, body); p.set(6, 3, '#e8a040');
  // 帧 1：翅膀下压
  p.line(10, 3, 13, 3, wing); p.line(13, 3, 16, 3, wing); p.set(10, 4, wing); p.set(16, 4, wing); p.rect(12, 3, 3, 1, body); p.set(15, 3, '#e8a040');
  return p.canvas();
}

/** 蝴蝶两帧：张开 / 合拢 */
export function paintButterfly(col: string, dark: string): HTMLCanvasElement {
  const p = new Pix(10, 5);
  p.rect(0, 0, 2, 2, col); p.rect(3, 0, 2, 2, col); p.set(0, 2, dark); p.set(4, 2, dark); p.rect(2, 1, 1, 3, '#2a1e17');
  p.rect(6, 1, 1, 2, col); p.rect(8, 1, 1, 2, col); p.rect(7, 1, 1, 3, '#2a1e17');
  return p.canvas();
}

/** 近战刀光：一道月牙弧，从亮到透明 */
export const paintSlash = () => canvasOf(18, 18, (ctx) => {
  for (let a = -1.1; a <= 1.1; a += 0.04) {
    const t = (a + 1.1) / 2.2;
    for (let r = 6; r <= 8.5; r += 0.5) {
      const x = 9 + Math.cos(a) * r;
      const y = 9 + Math.sin(a) * r;
      const inner = r > 7.5;
      ctx.fillStyle = inner ? `rgba(255,255,255,${0.25 + t * 0.75})` : `rgba(255,220,140,${t * 0.6})`;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
});

/** 箭：木杆 + 铁头 + 尾羽 */
export function paintArrow(): HTMLCanvasElement {
  const p = new Pix(9, 3);
  p.rect(1, 1, 6, 1, '#a07a4a');
  p.set(7, 1, '#d8dce4'); p.set(8, 1, '#ffffff'); p.set(7, 0, '#9aa0a8'); p.set(7, 2, '#9aa0a8');
  p.set(0, 0, '#e8e0d0'); p.set(0, 2, '#e8e0d0'); p.set(1, 0, '#c84a3a'); p.set(1, 2, '#c84a3a');
  return p.canvas();
}

/** 命中火花：十字星芒 */
export const paintHit = () => canvasOf(9, 9, (ctx) => {
  const px = (x: number, y: number, a: number) => { ctx.fillStyle = `rgba(255,248,220,${a})`; ctx.fillRect(x, y, 1, 1); };
  for (let i = 0; i < 5; i++) {
    const a = 1 - i * 0.2;
    px(4 + i, 4, a); px(4 - i, 4, a); px(4, 4 + i, a); px(4, 4 - i, a);
  }
  px(3, 3, 0.6); px(5, 5, 0.6); px(3, 5, 0.6); px(5, 3, 0.6);
});
