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

/** 两个 #rrggbb 颜色按 t 混合 */
export function mix(a: string, b: string, t: number): string {
  const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  let out = '#';
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return out;
}

/** 暗部往冷紫偏、亮部往暖黄偏，比单纯加黑加白更像手绘 */
const COOL = '#1c1030';
const WARM = '#fff4d6';
/** 由 2-4 个给定颜色补成 5 阶色板：最暗、暗、中、亮、高光 */
export function ramp(cols: string[]): string[] {
  const [a, b, c, d] = cols;
  const deep = mix(a, COOL, 0.4);
  if (d) return [deep, a, b, c, d];
  if (c) return [deep, a, b, c, mix(c, WARM, 0.45)];
  return [deep, a, mix(a, b ?? a, 0.5), b ?? a, mix(b ?? a, WARM, 0.45)];
}

/** 每张画好的画布的高清倍数，场景按它把精灵缩回原大小 */
const CANVAS_RES = new WeakMap<HTMLCanvasElement, number>();
export const canvasRes = (c: HTMLCanvasElement) => CANVAS_RES.get(c) ?? 1;

export class Pix {
  data: (string | null)[];
  /** 画图坐标的原点偏移：角色帧四周留白时，画法照旧按原来的坐标写（outline、canvas 不受影响） */
  ox = 0;
  oy = 0;
  /** 实际像素宽高 = 逻辑宽高 × res */
  readonly pw: number;
  readonly ph: number;
  /**
   * res > 1 是「高清」画布（10-28 画质升级）：逻辑坐标、w/h 不变，但每个逻辑像素底下有 res×res 个真像素。
   * set/rect/line 照旧按整像素画（填满一块），ball/capsule 这类按法线算明暗的形状改用 sub/dot 逐个真像素画，边缘就圆了。
   */
  constructor(public w: number, public h: number, public readonly res = 1) {
    this.pw = w * res;
    this.ph = h * res;
    this.data = new Array(this.pw * this.ph).fill(null);
  }
  set(x: number, y: number, c: string | null) {
    x = Math.round(x) + this.ox;
    y = Math.round(y) + this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const r = this.res;
    if (r === 1) { this.data[y * this.w + x] = c; return; }
    const x0 = x * r, y0 = y * r;
    for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) this.data[(y0 + j) * this.pw + x0 + i] = c;
  }
  /** 真像素坐标（已含 res，不含 ox/oy 的偏移由这里加） */
  sub(sx: number, sy: number, c: string | null) {
    sx += this.ox * this.res;
    sy += this.oy * this.res;
    if (sx >= 0 && sy >= 0 && sx < this.pw && sy < this.ph) this.data[sy * this.pw + sx] = c;
  }
  /** 逻辑坐标的小数点：落在哪个真像素就画哪个 */
  dot(fx: number, fy: number, c: string | null) {
    this.sub(Math.floor(fx * this.res), Math.floor(fy * this.res), c);
  }
  getSub(sx: number, sy: number) {
    sx += this.ox * this.res;
    sy += this.oy * this.res;
    return sx >= 0 && sy >= 0 && sx < this.pw && sy < this.ph ? this.data[sy * this.pw + sx] : null;
  }
  get(x: number, y: number) {
    x = Math.round(x) + this.ox;
    y = Math.round(y) + this.oy;
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.res * this.pw + x * this.res] : null;
  }
  private raw(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.pw && y < this.ph ? this.data[y * this.pw + x] : null;
  }
  /** 只在已经有颜色的像素上画，用来加花纹 */
  paint(x: number, y: number, c: string) {
    if (this.get(Math.round(x), Math.round(y))) this.set(x, y, c);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** 有明暗的团块：左上亮右下暗，边缘带一点噪声（高清画布上按真像素画，边更圆） */
  blob(cx: number, cy: number, rx: number, ry: number, pal: string[], seed = 0) {
    const r = this.res;
    for (let sy = Math.floor((cy - ry - 1) * r); sy <= (cy + ry + 1) * r; sy++) {
      for (let sx = Math.floor((cx - rx - 1) * r); sx <= (cx + rx + 1) * r; sx++) {
        const x = r === 1 ? sx : (sx + 0.5) / r;
        const y = r === 1 ? sy : (sy + 0.5) / r;
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        const n = phash(Math.floor(x), Math.floor(y), seed);
        if (d > 1 + (n - 0.5) * 0.35) continue;
        const s = -dx * 0.55 - dy * 0.8 + (n - 0.5) * 0.6;
        const c = s > 0.75 ? pal[3] : s > 0.2 ? pal[2] : s > -0.45 ? pal[1] : pal[0];
        if (r === 1) this.set(x, y, c); else this.sub(sx, sy, c);
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
    for (let y = 0; y < this.ph; y++) {
      for (let x = 0; x < this.pw; x++) {
        if (this.raw(x, y)) continue;
        if (this.raw(x + 1, y) || this.raw(x - 1, y) || this.raw(x, y + 1) || this.raw(x, y - 1)) add.push(y * this.pw + x);
      }
    }
    for (const i of add) this.data[i] = c;
    return this;
  }
  /** 描边颜色跟着旁边像素走（深一号的同色），比统一黑边柔和 */
  outlineTinted(c = OUTLINE, k = 0.72) {
    const add: [number, string][] = [];
    for (let y = 0; y < this.ph; y++) {
      for (let x = 0; x < this.pw; x++) {
        if (this.raw(x, y)) continue;
        const n = this.raw(x, y - 1) || this.raw(x - 1, y) || this.raw(x + 1, y) || this.raw(x, y + 1);
        if (n) add.push([y * this.pw + x, mix(n, c, k)]);
      }
    }
    for (const [i, col] of add) this.data[i] = col;
    return this;
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.pw;
    c.height = this.ph;
    CANVAS_RES.set(c, this.res);
    const ctx = c.getContext('2d')!;
    // 一次性写 ImageData（以前每个像素 fillRect 一次，高清画布像素翻了 4 倍后太慢）
    const img = ctx.createImageData(this.pw, this.ph);
    const px = img.data;
    const cache = new Map<string, number>();
    for (let i = 0; i < this.data.length; i++) {
      const col = this.data[i];
      if (!col) continue;
      let v = cache.get(col);
      if (v === undefined) {
        v = col.length === 7 ? parseInt(col.slice(1), 16) : -1;
        cache.set(col, v);
      }
      const o = i * 4;
      if (v >= 0) { px[o] = v >> 16; px[o + 1] = (v >> 8) & 255; px[o + 2] = v & 255; px[o + 3] = 255; }
    }
    // 有非 #rrggbb 的颜色（极少）就先 put 再让 fillRect 盖上去：顺序反过来
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < this.data.length; i++) {
      const col = this.data[i];
      if (col && col.length !== 7) { ctx.fillStyle = col; ctx.fillRect(i % this.pw, Math.floor(i / this.pw), 1, 1); }
    }
    return c;
  }
}
