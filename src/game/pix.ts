/*
 * 像素画画布：先在一个颜色数组上画形状，最后统一描一圈深色描边，
 * 这样所有东西都有一致的「描边像素画」观感。不依赖地图，图标和场景共用。
 */

const OUTLINE = '#1a120e';

/** 和 world.ts 的 hash 同一个算法，单独放这里避免图标代码触发地图生成 */
export function phash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Pix {
  data: (string | null)[];
  constructor(public w: number, public h: number) {
    this.data = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : null;
  }
  /** 只在已经有颜色的像素上画，用来加花纹 */
  paint(x: number, y: number, c: string) {
    if (this.get(Math.round(x), Math.round(y))) this.set(x, y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** 有明暗的团块：左上亮右下暗，边缘带一点噪声 */
  blob(cx: number, cy: number, rx: number, ry: number, pal: string[], seed = 0) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        const n = phash(x, y, seed);
        if (d > 1 + (n - 0.5) * 0.35) continue;
        const s = -dx * 0.55 - dy * 0.8 + (n - 0.5) * 0.6;
        this.set(x, y, s > 0.75 ? pal[3] : s > 0.2 ? pal[2] : s > -0.45 ? pal[1] : pal[0]);
      }
    }
  }
  /** 树干：左亮右暗 */
  trunk(cx: number, top: number, bottom: number, width: number, pal: string[]) {
    for (let y = top; y <= bottom; y++) {
      for (let i = 0; i < width; i++) {
        const x = Math.round(cx - width / 2 + i);
        this.set(x, y, i === 0 ? pal[2] : i === width - 1 ? pal[0] : phash(x, y, 5) < 0.2 ? pal[0] : pal[1]);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  outline(c = OUTLINE) {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.data[i] = c;
    return this;
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    this.data.forEach((col, i) => {
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(i % this.w, Math.floor(i / this.w), 1, 1);
    });
    return c;
  }
}
