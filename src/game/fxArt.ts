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

/**
 * 田里的作物，四个生长阶段：0 刚冒芽、1 小苗、2 长叶、3 成熟（结出作物颜色的果实或穗）。
 * 谷物是一丛直立的秆，蔬菜是一团叶子加果实。
 */
export function paintCrop(color: string, kind: 'veg' | 'grain', stage: number): HTMLCanvasElement {
  const p = new Pix(12, 14);
  const L = ['#2e5a1e', '#3e7a28', '#5a9a34', '#86c050'];
  const base = 13;
  if (stage === 0) {
    p.set(5, base, L[1]); p.set(6, base, L[1]); p.set(5, base - 1, L[2]); p.set(4, base - 2, L[3]); p.set(7, base - 1, L[3]);
    return p.outlineTinted().canvas();
  }
  if (kind === 'grain') {
    const h = stage === 1 ? 4 : stage === 2 ? 8 : 10;
    const stalk = stage === 3 ? ['#8a7a2a', '#b0a040', '#d8c860'] : [L[0], L[1], L[2]];
    for (const [x, dh] of [[3, -1], [5, 0], [7, 0], [9, -2]] as const) {
      for (let y = 0; y < h + dh; y++) p.set(x + (y > h - 3 ? (x < 6 ? -0.4 : 0.4) : 0), base - y, y % 3 === 1 ? stalk[2] : stalk[1]);
      if (stage >= 2) p.set(x + 1, base - Math.floor(h / 2), L[2]);
      if (stage === 3) {
        // 穗：作物本色，上面亮一点
        for (let k = 0; k < 3; k++) p.set(x, base - (h + dh) - k, k === 2 ? mixLight(color) : color);
      }
    }
    return p.outlineTinted().canvas();
  }
  // 蔬菜：一团叶子
  const r = stage === 1 ? 2 : stage === 2 ? 3.6 : 4.2;
  const cy = base - r;
  for (let y = Math.floor(cy - r); y <= base; y++) {
    for (let x = 0; x < 12; x++) {
      const dx = (x - 5.5) / (r + 0.6);
      const dy = (y - cy) / r;
      if (dx * dx + dy * dy > 1) continue;
      const lit = -dx * 0.6 - dy * 0.8;
      p.set(x, y, lit > 0.5 ? L[3] : lit > -0.1 ? L[2] : lit > -0.6 ? L[1] : L[0]);
    }
  }
  if (stage === 3) {
    // 果实：三颗作物颜色的圆点，带高光
    for (const [x, y] of [[3, cy + 1], [7, cy - 1], [6, cy + 2]] as const) {
      p.rect(x, y, 2, 2, color);
      p.set(x, y, mixLight(color));
    }
  }
  return p.outlineTinted().canvas();
}

const mixLight = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (s: number) => Math.min(255, ((n >> s) & 255) + 60);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
};
