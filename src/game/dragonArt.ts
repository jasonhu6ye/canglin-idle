import { mix, phash, Pix } from './pix';

/*
 * 坐骑「守护者的曙光」（第三版，照用户 11-02 第二张参考图重画）：
 * 珍珠白的长身龙，长脖子、细长的尾巴，头上一对往后掠的金色鹿角式长角，脖背一道金色的脊棘；
 * 没有蹼翼——背上从肩后升起一大团白金蓝的火焰当翅膀，尾巴整条拖着同样的火焰；
 * 金饰轻薄：颊饰、项圈、肩饰、髋饰、护踝、小小的深蓝鞍。眼睛蓝光。
 *
 * 画法：身体用「等势面」——椭圆和胶囊当软体合在一起（Field），每个像素按合成后的法线打光，
 * 七阶渐变（细腻、不要硬色块）；部件单独算再叠上，描边是柔和的同色深边。
 * 火焰：一团团火舌（tongue），根部白、中段金黄、尖端透蓝，一跳一跳地飘。
 *
 * 帧 120×96，脚底在第 92 行；每帧「后层」「前层」两张，骑手夹在中间（侧面骑手画在整只龙前面）：
 *   侧面：远侧腿、尾巴、尾焰、背焰、焰鬃在后层；身体、饰物、脖子、头、近侧腿在前层
 *   正面：背焰、尾巴、后腿、身体、鞍在后层；脖子、头、胸饰、前腿在前层
 *   背面：头、脖子、前腿、背焰在后层；后半身、鞍、后腿、尾巴在前层
 * 动作：奔跑（四足奔跑、火焰往后拉长）、待机（呼吸、眨眼、尾巴摆、火焰飘）、趴下、召唤（人立仰天喷火）。
 */

export const DR_W = 120;
export const DR_H = 96;
export const DR_FEET = 92;
const FEET = DR_FEET;
const TAU = Math.PI * 2;

// 珍珠白七阶：暗部偏冷紫，亮部近乎纯白
const WHITE = ['#646894', '#8a8fbd', '#aab0d4', '#c9cde8', '#e1e4f4', '#f3f4fb', '#ffffff'];
const GOLD = ['#6a4210', '#9a6a18', '#c48c22', '#e0ac34', '#f2cc5a', '#fbe38c', '#fff6c8'];
const CRY = ['#1448a0', '#2488e8', '#58ccff', '#b4f0ff', '#ffffff'];
const NAVY = ['#121630', '#1c2248', '#283060', '#36407a', '#485494', '#5c68ac', '#7480c0'];
/** 火焰：根部白 → 淡金 → 金 → 淡蓝 → 蓝 */
const FIRE = ['#62b4ff', '#ffc24e', '#ffdc86', '#fff2c8', '#ffffff'];
/** 眼睛、鬃毛用的纯蓝焰 */
const BLUE = ['#1c58c0', '#2a94f0', '#50d8ff', '#a8f4ff', '#f0ffff'];
const CLAW = ['#8a8ea8', '#d2d6e4', '#ffffff'];
const EYE = '#40d8ff';
const EYE_HI = '#e8ffff';
const OUT = '#1a1a3a';

// ---------------------------------------------------------------- 软体渲染

/** 一组软体形状（椭圆、胶囊），合在一起算等势面 */
class Field {
  private ells: { x: number; y: number; rx: number; ry: number; c: number; s: number }[] = [];
  private caps: { x0: number; y0: number; dx: number; dy: number; l2: number; r0: number; r1: number }[] = [];
  minX = 1e9; minY = 1e9; maxX = -1e9; maxY = -1e9;
  /** 等势面让形状看起来比给的半径小一圈，这里补回来 */
  private static K = 1.35;
  ell(x: number, y: number, rx: number, ry: number, rot = 0) {
    rx *= Field.K; ry *= Field.K;
    this.ells.push({ x, y, rx, ry, c: Math.cos(rot), s: Math.sin(rot) });
    const m = Math.max(rx, ry);
    this.grow(x - m, y - m, x + m, y + m);
    return this;
  }
  cap(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) {
    r0 *= Field.K; r1 *= Field.K;
    const dx = x1 - x0, dy = y1 - y0;
    this.caps.push({ x0, y0, dx, dy, l2: dx * dx + dy * dy || 1e-6, r0, r1 });
    const m = Math.max(r0, r1);
    this.grow(Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m);
    return this;
  }
  private grow(a: number, b: number, c: number, d: number) {
    this.minX = Math.min(this.minX, a); this.minY = Math.min(this.minY, b);
    this.maxX = Math.max(this.maxX, c); this.maxY = Math.max(this.maxY, d);
  }
  at(x: number, y: number) {
    let f = 0;
    for (const e of this.ells) {
      const dx = x - e.x, dy = y - e.y;
      const lx = (dx * e.c + dy * e.s) / e.rx, ly = (-dx * e.s + dy * e.c) / e.ry;
      const d = lx * lx + ly * ly;
      if (d < 1) f += (1 - d) * (1 - d);
    }
    for (const c of this.caps) {
      const t = Math.max(0, Math.min(1, ((x - c.x0) * c.dx + (y - c.y0) * c.dy) / c.l2));
      const px = c.x0 + c.dx * t - x, py = c.y0 + c.dy * t - y;
      const r = c.r0 + (c.r1 - c.r0) * t;
      const d = (px * px + py * py) / (r * r);
      if (d < 1) f += (1 - d) * (1 - d);
    }
    return f;
  }
}

const T = 0.2;
const LX = -0.46, LY = -0.64, LZ = 0.62;

/**
 * 把软体画到 p 上：按法线分 R.length 阶明暗（左上亮右下暗），tex 1 铺鳞片、2 铺腹部横纹；
 * dim 远侧整体暗一阶。只画等势面以内的像素；over=false 时不盖已有像素。
 */
function render(p: Pix, F: Field, R: string[], dim = 0, tex = 0, seed = 0, over = true) {
  const x0 = Math.max(0, Math.floor(F.minX) - 1), x1 = Math.min(p.w - 1, Math.ceil(F.maxX) + 1);
  const y0 = Math.max(0, Math.floor(F.minY) - 1), y1 = Math.min(p.h - 1, Math.ceil(F.maxY) + 1);
  const n = R.length - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const f = F.at(x + 0.5, y + 0.5);
      if (f < T) continue;
      if (!over && p.get(x, y)) continue;
      const h = Math.min(1, (f - T) / (0.9 - T));
      const gx = F.at(x + 1.5, y + 0.5) - F.at(x - 0.5, y + 0.5);
      const gy = F.at(x + 0.5, y + 1.5) - F.at(x + 0.5, y - 0.5);
      const g = Math.hypot(gx, gy) || 1;
      const lat = Math.pow(1 - h, 0.5);
      const nx = (gx / g) * lat, ny = (gy / g) * lat, nz = Math.sqrt(Math.max(0, 1 - lat * lat));
      const s = nx * LX + ny * LY + nz * LZ;
      // 正对镜头的亮度落在倒数第二阶；高光只在左上一小块
      let i = Math.round(Math.pow(Math.max(0, (s + 0.55) / 1.55), 1.25) * n);
      if (tex === 1 && h > 0.25 && i >= 2) {
        // 鳞片：一行行交错的短弧，只暗一阶，很淡
        const row = Math.floor((y + seed) / 5);
        const u = ((x + row * 3 + seed) % 6 + 6) % 6;
        if (((y + seed) % 5 + 5) % 5 === 0 && u >= 1 && u <= 3) i--;
      } else if (tex === 2 && h > 0.1 && i >= 1) {
        if (((y + seed) % 4 + 4) % 4 === 0) i--;
      }
      p.set(x, y, R[Math.max(0, Math.min(n, i - dim))]);
    }
  }
}

/** 把一部分单独画好、描一圈柔和的深边再盖上去 */
function stamp(dst: Pix, draw: (p: Pix) => void, k = 0.6) {
  const tmp = new Pix(dst.w, dst.h);
  draw(tmp);
  tmp.outlineTinted(OUT, k);
  for (let i = 0; i < tmp.data.length; i++) if (tmp.data[i]) dst.data[i] = tmp.data[i];
}

/** 填多边形，col 返回 null 跳过 */
function poly(p: Pix, pts: [number, number][], col: (x: number, y: number) => string | null) {
  const ys = pts.map((q) => q[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(p.h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    const cy = y + 0.5;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(p.w, Math.round(xs[k + 1])); x++) {
        const c = col(x, y);
        if (c) p.set(x, y, c);
      }
    }
  }
}

/** 两段式反向运动学：从 a 到 c，中间关节往 forward 指定的一侧凸 */
function ik(ax: number, ay: number, cx: number, cy: number, L1: number, L2: number, forward: boolean): [number, number] {
  const dx = cx - ax, dy = cy - ay;
  const d = Math.max(1e-3, Math.min(Math.hypot(dx, dy), L1 + L2 - 0.5));
  const a1 = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const base = Math.atan2(dy, dx);
  const a = base + (forward ? -a1 : a1);
  return [ax + Math.cos(a) * L1, ay + Math.sin(a) * L1];
}

// ---------------------------------------------------------------- 小部件

/** 一颗蓝水晶：菱形切面，左上亮；外面一圈金托 */
function gem(p: Pix, x: number, y: number, r: number, frame = true) {
  x = Math.round(x); y = Math.round(y);
  if (frame) for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    if (Math.abs(dx) + Math.abs(dy) === r + 1) p.set(x + dx, y + dy, dx + dy < 0 ? GOLD[5] : GOLD[2]);
  }
  for (let dy = -r; dy <= r; dy++) {
    const hw = r - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) {
      const k = dx + dy;
      p.set(x + dx, y + dy, k < -r * 0.7 ? CRY[4] : k < 0 ? CRY[3] : k < r * 0.6 ? CRY[2] : CRY[1]);
    }
  }
  if (r >= 2) { p.set(x - 1, y - 1, CRY[4]); p.set(x + 1, y + 1, CRY[0]); p.set(x, y, CRY[3]); }
}

/** 金饰片：有倒角的椭圆板 */
function plate(p: Pix, x: number, y: number, rx: number, ry: number, rot = 0, dim = 0, seed = 0) {
  render(p, new Field().ell(x, y, rx, ry, rot), GOLD, dim, 0, seed);
}

/** 一道金边 */
function band(p: Pix, x0: number, y0: number, x1: number, y1: number, r: number, dim = 0) {
  render(p, new Field().cap(x0, y0, x1, y1, r, r), GOLD, dim, 0, 3);
}

/**
 * 火舌：从 (x0,y0) 朝 (dx,dy) 方向烧 len 长，w 根部半宽，phase 让它一跳一跳地飘；
 * pal 尖端到根部的五个颜色；over=false 只填空像素
 */
function tongue(p: Pix, x0: number, y0: number, dx: number, dy: number, len: number, w: number, phase: number, salt: number, over = false, pal = FIRE) {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const px = -uy, py = ux;
  const L = len * (0.78 + 0.22 * Math.sin(phase * TAU * 2 + salt * 1.7));
  if (L < 1) return;
  for (let s = 0; s <= L; s += 0.5) {
    const f = s / L;
    const ww = w * Math.pow(1 - f, 0.6) + 0.4;
    const wig = Math.sin(s * 0.5 - phase * TAU * 2.5 + salt) * 1.0 * f;
    const cx = x0 + ux * s + px * wig;
    const cy = y0 + uy * s + py * wig;
    const c = f < 0.2 ? pal[4] : f < 0.45 ? pal[3] : f < 0.7 ? pal[2] : f < 0.88 ? pal[1] : pal[0];
    for (let d = -ww; d <= ww; d += 0.5) {
      const x = cx + px * d, y = cy + py * d;
      const edge = Math.abs(d) > ww - 0.8 && f > 0.15;
      const col = edge ? pal[Math.max(0, pal.indexOf(c) - 1)] : c;
      if (over || !p.get(Math.round(x), Math.round(y))) p.set(x, y, col);
    }
  }
  // 火尖断开飘走的一两点
  const u = (phase * 2 + salt * 0.37) % 1;
  const tx = x0 + ux * (L + 1.5 + u * 5) + px * Math.sin(salt) * 2, ty = y0 + uy * (L + 1.5 + u * 5);
  if (over || !p.get(Math.round(tx), Math.round(ty))) p.set(tx, ty, u < 0.5 ? pal[1] : pal[0]);
}

/**
 * 一团火焰：以 (x,y) 为根，朝 (dx,dy) 方向，n 条火舌扇开 spread 弧度，长 len 左右；
 * 先画蓝色外焰（粗、长一点），再画白金内焰（细），周围撒几点火星
 */
function plume(p: Pix, x: number, y: number, dx: number, dy: number, len: number, w: number, n: number, spread: number, phase: number, salt: number, over = true) {
  // over=false：先画到一张空图上，再只填目标里空着的像素（火焰自己内部还是内焰盖外焰）
  const dst = over ? p : new Pix(p.w, p.h);
  const a0 = Math.atan2(dy, dx);
  const px = -dy / (Math.hypot(dx, dy) || 1), py = dx / (Math.hypot(dx, dy) || 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1);
      const a = a0 + (t - 0.5) * spread * (pass ? 0.9 : 1) + Math.sin(phase * TAU + salt + k) * 0.08;
      const L = len * (0.7 + 0.3 * Math.sin(k * 2.3 + salt)) * (pass ? 1 : 1.12);
      const off = (t - 0.5) * w * 1.6;
      tongue(dst, x + px * off, y + py * off, Math.cos(a), Math.sin(a), L, w * (pass ? 1 : 1.3), phase, salt + k * 7, true, pass ? FIRE : BLUE);
    }
  }
  for (let k = 0; k < Math.ceil(n * 1.5); k++) {
    const u = (phase + k * 0.173 + salt * 0.01) % 1;
    const a = a0 + (phash(k, salt, 1) - 0.5) * (spread + 0.6);
    const d = len * (0.5 + u * 0.9);
    const sx = x + Math.cos(a) * d + (phash(k, salt, 2) - 0.5) * w * 3, sy = y + Math.sin(a) * d;
    dst.set(sx, sy, u < 0.4 ? FIRE[3] : u < 0.7 ? BLUE[2] : BLUE[1]);
  }
  if (!over) for (let i = 0; i < dst.data.length; i++) if (dst.data[i] && !p.data[i]) p.data[i] = dst.data[i];
}

/** 弯角：从 (x,y) 按角度 a 出发，边走边转 curl，粗到细，金色；返回主干各节的点（角坐标系） */
function horn(p: Pix, at: (x: number, y: number) => [number, number], x: number, y: number, a: number, len: number, curl: number, r: number, dim = 0) {
  const F = new Field();
  let cx = x, cy = y, ca = a;
  const n = 6;
  const local: [number, number, number][] = [[cx, cy, ca]];
  const pts: [number, number][] = [at(cx, cy)];
  for (let k = 0; k < n; k++) {
    cx += Math.cos(ca) * (len / n); cy += Math.sin(ca) * (len / n); ca += curl / n;
    local.push([cx, cy, ca]);
    pts.push(at(cx, cy));
  }
  for (let k = 0; k < n; k++) F.cap(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], r * (1 - k / n) + 0.45, r * (1 - (k + 1) / n) + 0.45);
  render(p, F, GOLD, dim, 0, 11);
  p.set(pts[n][0], pts[n][1], GOLD[6]);
  return local;
}

/** 鹿角式的长角：主干再分两根小叉往上翘 */
function antler(p: Pix, at: (x: number, y: number) => [number, number], x: number, y: number, a: number, len: number, curl: number, r: number, dim = 0, side = -1) {
  const local = horn(p, at, x, y, a, len, curl, r, dim);
  for (const [k, L] of [[2, len * 0.42], [4, len * 0.3]] as [number, number][]) {
    const [bx, by, ba] = local[k];
    horn(p, at, bx, by, ba + side * 0.95, L, side * 0.3, r * 0.6, dim);
  }
}

/** 爪子（侧面，朝 dir）：掌、三根银白的趾甲、金护踝；lift 0-1 抬脚时趾尖下垂 */
function pawSide(p: Pix, x: number, y: number, dir: number, dim: number, lift = 0) {
  const toe = y - 1.6 + lift * 1.5;
  render(p, new Field().cap(x - dir * 1.5, y - 5.5, x + dir * 3.5, toe, 3, 2.4), WHITE, dim, 0, 5);
  for (let k = 0; k < 3; k++) {
    const bx = x + dir * (4.4 - k * 1.1), by = toe - 0.6 + k * 0.9 + lift;
    p.set(bx, by, CLAW[1]); p.set(bx + dir, by + 0.6 + lift * 0.5, k === 1 ? CLAW[2] : CLAW[1]); p.set(bx + dir * 2, by + 1.2 + lift, CLAW[0]);
  }
  band(p, x - dir * 3, y - 7.5, x + dir * 2.4, y - 7.5, 1.2, dim);
  p.set(x - dir * 0.5, y - 7.5, CRY[2]);
}

/** 爪子（正面 / 背面）：三根趾甲朝镜头 */
function pawFront(p: Pix, x: number, y: number, dim: number, back = false) {
  render(p, new Field().ell(x, y - 2.5, 3.6, 2.4), WHITE, dim, 0, 5);
  if (!back) for (const dx of [-2.4, 0, 2.4]) { p.set(x + dx, y - 0.5, CLAW[1]); p.set(x + dx, y + 0.5, CLAW[2]); }
  band(p, x - 3, y - 7, x + 3, y - 7, 1.2, dim);
  p.set(x, y - 7, CRY[2]);
}

// ---------------------------------------------------------------- 头

const HEAD_K = 1.15;

/**
 * 头（侧面，朝右，hx/hy 颅骨中心）：长吻、眉骨、下颌，金色颊饰，蓝光的眼睛，
 * 脑后一根往后掠的鹿角式长角和一根短角、一根小颊角；mouth 0-1 张嘴，pitch 抬头（弧度，正数鼻子朝上）
 */
function headSide(p: Pix, hx: number, hy: number, pitch: number, mouth: number, blink: boolean, dim = 0) {
  const c = Math.cos(-pitch) * HEAD_K, s = Math.sin(-pitch) * HEAD_K;
  const at = (x: number, y: number): [number, number] => [hx + x * c - y * s, hy + x * s + y * c];
  antler(p, at, -4, -3, Math.PI + 0.45, 22, -0.75, 2.2, dim, -1);
  horn(p, at, -1, -5.5, Math.PI + 0.85, 12, -0.6, 1.7, dim);
  horn(p, at, -6, 1.5, Math.PI + 0.05, 9, -0.5, 1.5, dim);
  // 下颌
  const jawDrop = mouth * 4.5;
  stamp(p, (q) => {
    const j0 = at(0, 4), j1 = at(13.5, 5 + jawDrop);
    render(q, new Field().cap(j0[0], j0[1], j1[0], j1[1], 2.8 * HEAD_K, 1.6 * HEAD_K), WHITE, dim + 1, 0, 21);
  });
  if (mouth > 0.15) {
    const m0 = at(4, 2.8), m1 = at(14, 2.8 + jawDrop * 0.55);
    render(p, new Field().cap(m0[0], m0[1], m1[0], m1[1], 1.2 + mouth * 1.6, 0.7), NAVY, 1, 0, 0);
    for (let k = 0; k < 3; k++) { const t = at(7 + k * 2.4, 2.2); p.set(t[0], t[1], CLAW[2]); p.set(t[0], t[1] + 1, CLAW[1]); }
    for (let k = 0; k < 2; k++) { const t = at(8.5 + k * 2.6, 3.6 + jawDrop * 0.8); p.set(t[0], t[1], CLAW[2]); }
  }
  // 颅骨、眉骨、吻（长而尖）
  const sk = new Field();
  sk.ell(hx, hy, 6.5 * HEAD_K, 5.6 * HEAD_K, -pitch);
  const br = at(3.5, -3.2); sk.ell(br[0], br[1], 4.8 * HEAD_K, 2.4 * HEAD_K, -pitch);
  const m0 = at(4, 0.6), m1 = at(16.5, 2.6);
  sk.cap(m0[0], m0[1], m1[0], m1[1], 4.4 * HEAD_K, 2.4 * HEAD_K);
  const ck = at(-2, 2.5); sk.ell(ck[0], ck[1], 4 * HEAD_K, 3 * HEAD_K, -pitch);
  render(p, sk, WHITE, dim, 0, 20);
  // 上唇的牙尖、鼻孔、吻上的小角、脸颊的一道暗纹
  const lip = at(15, 4.4); p.set(lip[0], lip[1], CLAW[2]);
  const lip2 = at(11.5, 4.9); p.set(lip2[0], lip2[1], CLAW[1]);
  const nz = at(16, 0.4); p.set(nz[0], nz[1], WHITE[0]); p.set(nz[0] - 1, nz[1], WHITE[1]);
  horn(p, at, 11, -2.4, -Math.PI * 0.42, 5, 0.3, 1.3, dim);
  for (let k = 0; k < 4; k++) { const q = at(-1 + k * 0.5, 1 + k); p.paint(q[0], q[1], WHITE[2]); }
  // 颊饰（金片 + 蓝晶）和眉上的金线、额晶
  const cp = at(-2.5, 2.2);
  plate(p, cp[0], cp[1], 3.2 * HEAD_K, 2.4 * HEAD_K, -pitch, dim, 22);
  gem(p, cp[0], cp[1], 1, false);
  const b0 = at(-2, -4.6), b1 = at(8.5, -3.8);
  band(p, b0[0], b0[1], b1[0], b1[1], 1.1, dim);
  const fg = at(2, -4.6);
  gem(p, fg[0], fg[1], 1, false);
  // 眼睛：眉骨下一道阴影，眼睛四格蓝光，周围一圈淡蓝
  const e = at(5.5, -1.2);
  const ex = Math.round(e[0]), ey = Math.round(e[1]);
  for (let k = -1; k <= 4; k++) p.paint(ex + k, ey - 2, WHITE[0]);
  if (blink) { for (let k = 0; k <= 3; k++) p.paint(ex + k, ey, WHITE[0]); }
  else {
    for (const [dx, dy] of [[-1, 0], [4, 0], [-1, -1], [4, -1], [0, 1], [1, 1], [2, 1], [3, 1]]) p.paint(ex + dx, ey + dy, CRY[1]);
    p.set(ex, ey - 1, CRY[3]); p.set(ex + 1, ey - 1, EYE_HI); p.set(ex + 2, ey - 1, EYE_HI); p.set(ex + 3, ey - 1, CRY[3]);
    p.set(ex, ey, EYE); p.set(ex + 1, ey, EYE); p.set(ex + 2, ey, NAVY[0]); p.set(ex + 3, ey, EYE);
  }
}

/** 头（正面，朝镜头）：hx/hy 颅骨中心 */
function headFront(p: Pix, hx: number, hy: number, mouth: number, blink: boolean, dim = 0, back = false) {
  const atF = (x: number, y: number): [number, number] => [hx + x, hy + y];
  antler(p, atF, -4.5, -3, -Math.PI * 0.8, 15, -0.5, 2, dim, -1);
  antler(p, atF, 4.5, -3, -Math.PI * 0.2, 15, 0.5, 2, dim, 1);
  horn(p, atF, -2, -5.5, -Math.PI * 0.62, 8, -0.3, 1.5, dim);
  horn(p, atF, 2, -5.5, -Math.PI * 0.38, 8, 0.3, 1.5, dim);
  horn(p, atF, -7.5, 1.5, Math.PI * 0.86, 6, -0.6, 1.4, dim);
  horn(p, atF, 7.5, 1.5, Math.PI * 0.14, 6, 0.6, 1.4, dim);
  const sk = new Field().ell(hx, hy, 7.8, 6.4).ell(hx - 4, hy - 3, 3.6, 2.2).ell(hx + 4, hy - 3, 3.6, 2.2);
  if (!back) sk.ell(hx, hy + 4.5, 5.2, 4).ell(hx, hy + 8.5, 3.4, 3);
  render(p, sk, WHITE, dim, back ? 1 : 0, 20);
  if (back) {
    for (let k = -2; k <= 3; k++) p.paint(hx, hy + k, WHITE[2]);
    return;
  }
  for (const sx of [-1, 1]) { p.set(hx + sx * 1.6, hy + 9, WHITE[0]); p.set(hx + sx * 1.6, hy + 8, WHITE[1]); }
  if (mouth > 0.15) {
    stamp(p, (q) => render(q, new Field().ell(hx, hy + 12 + mouth * 2.5, 3.2, 1.4), WHITE, dim + 1, 0, 21));
    render(p, new Field().ell(hx, hy + 10.5 + mouth, 3.2, 0.8 + mouth * 1.6), NAVY, 1, 0, 0);
    for (const sx of [-2.2, 0, 2.2]) p.set(hx + sx, hy + 9.8, CLAW[2]);
  }
  for (const sx of [-1, 1]) { p.set(hx + sx * 2.4, hy + 11.2, CLAW[2]); p.set(hx + sx * 2.4, hy + 12, CLAW[1]); }
  band(p, hx - 6.5, hy - 4.2, hx + 6.5, hy - 4.2, 1.1, dim);
  for (const sx of [-1, 1]) { plate(p, hx + sx * 6.5, hy + 2.5, 2.4, 3, 0, dim, 22); gem(p, hx + sx * 6.5, hy + 2.5, 1, false); }
  gem(p, hx, hy - 6, 1, false);
  for (const sx of [-1, 1]) {
    const ex = hx + sx * 4, ey = hy - 0.5;
    for (let k = -2; k <= 2; k++) p.paint(ex + k, ey - 2, WHITE[0]);
    if (blink) { for (let k = -1; k <= 1; k++) p.paint(ex + k, ey, WHITE[0]); continue; }
    for (const [dx, dy] of [[-2, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-2, -1], [2, -1]]) p.paint(ex + dx, ey + dy, CRY[1]);
    p.set(ex - 1, ey - 1, CRY[3]); p.set(ex, ey - 1, EYE_HI); p.set(ex + 1, ey - 1, CRY[3]);
    p.set(ex - 1, ey, EYE); p.set(ex, ey, NAVY[0]); p.set(ex + 1, ey, EYE);
  }
}

// ---------------------------------------------------------------- 姿势

interface Pose {
  /** 离地（跑步起伏、召唤人立时身体抬高；趴下为负） */
  rise: number;
  /** 身体前倾（正数头抬高尾巴低） */
  tilt: number;
  breath: number;
  /** 四条腿：近前、远前、近后、远后的脚相对站位的位移和抬脚程度 */
  legs: { x: number; y: number; k: number }[];
  /** 背焰的大小（1 平常）和往后倒的程度（0 竖直往上，1 几乎平着往后） */
  fire: number;
  lean: number;
  tail: number;
  /** 脖子抬起程度（0 平常，1 仰天） */
  neck: number;
  pitch: number;
  mouth: number;
  blink: boolean;
  /** 焰鬃长度、尾焰大小 */
  mane: number;
  tailFlame: number;
  phase: number;
  lying: boolean;
  /** 召唤时朝天喷的火 */
  breathFire: number;
}

const still = { x: 0, y: 0, k: 0 };

/** 奔跑：四足奔跑（后腿一对先蹬、前腿一对再落），每条腿 55% 时间着地往后滑、45% 抬起往前摆 */
function run(t: number): Pose {
  const leg = (ph: number, stride: number, lift: number) => {
    const u = (t + ph) % 1;
    const st = 0.55;
    if (u < st) { const v = u / st; return { x: stride * (1 - 2 * v), y: 0, k: 0 }; }
    const v = (u - st) / (1 - st);
    return { x: stride * (-1 + 2 * v), y: -Math.sin(v * Math.PI) * lift, k: Math.sin(v * Math.PI) };
  };
  const bounce = Math.sin(t * TAU) * 1.6;
  return {
    rise: 2.5 + bounce, tilt: 0.06 + Math.sin(t * TAU + 0.5) * 0.045, breath: 0,
    legs: [leg(0, 7, 7), leg(0.13, 7, 7), leg(0.52, 7.5, 7.5), leg(0.65, 7.5, 7.5)],
    fire: 1.2, lean: 0.85,
    tail: Math.sin(t * TAU) * 0.7, neck: 0.1, pitch: 0.1 + Math.sin(t * TAU + 0.5) * 0.04, mouth: 0.1 + 0.1 * Math.sin(t * TAU), blink: false,
    mane: 14, tailFlame: 1.3, phase: t, lying: false, breathFire: 0,
  };
}
function idle(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: 0, tilt: 0, breath: br,
    legs: [still, still, still, still],
    fire: 1 + br * 0.08, lean: 0.35,
    tail: br * 0.5, neck: 0.05 + Math.max(0, Math.sin(t * TAU + 1)) * 0.06, pitch: 0.08 + br * 0.04, mouth: 0, blink: i === 15 || i === 16,
    mane: 10 + br, tailFlame: 1, phase: t, lying: false, breathFire: 0,
  };
}
function sit(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: -15, tilt: -0.02, breath: br * 0.5,
    legs: [still, still, still, still],
    fire: 0.55, lean: 0.5,
    tail: br * 0.3, neck: -0.25, pitch: -0.12 + br * 0.03, mouth: 0, blink: i % 16 < 9,
    mane: 6 + br * 0.5, tailFlame: 0.6, phase: t, lying: true, breathFire: 0,
  };
}
/** 召唤：前腿抬起人立、火焰猛地窜高、仰头朝天喷火，再落回地上 */
function howl(t: number): Pose {
  const up = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.5) : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
  const roar = t > 0.25 && t < 0.72;
  return {
    rise: 0, tilt: 0.3 * up, breath: 0,
    legs: [{ x: 7 * up, y: -13 * up, k: up }, { x: 5 * up, y: -12 * up, k: up }, still, still],
    fire: 1 + up * 0.7, lean: 0.2,
    tail: Math.sin(t * TAU * 2) * 0.6, neck: up * 0.2, pitch: 0.1 + up * 0.6, mouth: roar ? 1 : 0.3 * up, blink: false,
    mane: 10 + up * 6, tailFlame: 1 + up * 0.6, phase: t, lying: false, breathFire: roar ? 1 : 0,
  };
}

const poseOf = (key: string, t: number, i: number) => (key.startsWith('run') ? run(t) : key.startsWith('idle') ? idle(t, i) : key === 'sit' ? sit(t, i) : howl(t));

// ---------------------------------------------------------------- 侧面

/** 侧面身体的骨架点：以髋为轴，tilt 让前半身抬起来 */
function sideRig(o: Pose) {
  const hipX = 46, hipY = FEET - 30 - o.rise;
  const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
  const at = (x: number, y: number): [number, number] => [hipX + x * c + y * s, hipY - x * s + y * c];
  const n0 = at(28, -9);
  const lift = o.neck;
  const ctrl = at(42 - lift * 6, -17 - lift * 10);
  const head = at(52 - lift * 10, -32 - lift * 14 + o.breath * 0.3);
  const neck = (q: number): [number, number] => {
    const u = 1 - q;
    return [u * u * n0[0] + 2 * u * q * ctrl[0] + q * q * head[0], u * u * n0[1] + 2 * u * q * ctrl[1] + q * q * head[1]];
  };
  return { hipX, hipY, at, neck, head, n0 };
}

/** 侧面尾巴：从髋后往后拖，略微下垂再平着伸出去 */
function sideTail(o: Pose, hipX: number, hipY: number): [number, number][] {
  const pts: [number, number][] = [];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    const x = hipX - 6 - q * 40;
    const y = hipY + 3 + Math.sin(q * Math.PI) * (o.lying ? 10 : 7) - q * q * (o.lying ? -4 : 6) + Math.sin(o.tail + q * 3) * 2 * q;
    pts.push([x, o.lying ? Math.min(y, FEET - 2.5) : y]);
  }
  return pts;
}

/** 侧面（朝右） */
function drawSide(back: Pix, front: Pix, o: Pose) {
  const { hipX, hipY, at, neck, head } = sideRig(o);
  const shoulder = at(26, 2);
  const legY = FEET;
  // ---- 后层 ----
  if (!o.lying) {
    stamp(back, (p) => hindLegSide(p, hipX - 4, hipY + 4, hipX - 1 + o.legs[3].x, legY + o.legs[3].y, o.legs[3].k, 1));
    stamp(back, (p) => foreLegSide(p, shoulder[0] - 4, shoulder[1], shoulder[0] - 1 + o.legs[1].x, legY + o.legs[1].y, o.legs[1].k, 1));
  }
  // 尾巴
  const tp = sideTail(o, hipX, hipY);
  stamp(back, (p) => {
    const F = new Field();
    for (let k = 0; k + 1 < tp.length; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 5 - k * 0.42, 5 - (k + 1) * 0.42);
    render(p, F, WHITE, 0, 1, 31);
    for (let k = 1; k < tp.length - 1; k += 2) {
      const a = tp[k], b = tp[k + 1];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1;
      const r = 4.8 - k * 0.42;
      p.set(a[0] + (nx / n) * (r + 0.5), a[1] + (ny / n) * (r + 0.5), GOLD[4]);
      p.set(a[0] + (nx / n) * (r + 1.5), a[1] + (ny / n) * (r + 1.5), GOLD[3]);
    }
    for (const k of [2, 5]) {
      const a = tp[k], b = tp[k + 1];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1;
      const r = 5 - k * 0.42;
      band(p, a[0] - (nx / n) * r, a[1] - (ny / n) * r, a[0] + (nx / n) * r, a[1] + (ny / n) * r, 1);
      p.set(a[0], a[1] - r - 0.5, CRY[2]);
    }
  });
  // 尾焰：沿着尾巴后半段往后上方冒，越到尾尖越大
  for (let k = 3; k < tp.length; k++) {
    const q = k / (tp.length - 1);
    const a = tp[k];
    const big = 10 + q * 16;
    plume(back, a[0] - 1, a[1] - 3, -1, -0.55 - (1 - q) * 0.5, big * o.tailFlame, 2.5 + q * 2, 3, 0.6, o.phase, 50 + k * 5, false);
  }
  // 背焰：肩后一大团火往上往后窜（当翅膀），往后倒的程度看 lean
  const dx = -0.25 - o.lean * 0.9, dy = -1 + o.lean * 0.55;
  const fx = at(14, -10), fx2 = at(4, -9), fx3 = at(22, -11);
  plume(back, fx[0], fx[1], dx, dy, 34 * o.fire, 6.5, 7, 0.95, o.phase, 60, true);
  plume(back, fx2[0], fx2[1], dx - 0.15, dy, 26 * o.fire, 5, 4, 0.8, o.phase + 0.3, 70, true);
  plume(back, fx3[0], fx3[1], dx + 0.1, dy, 20 * o.fire, 4, 3, 0.6, o.phase + 0.6, 80, true);
  // 焰鬃：脑后到脖子背面一排蓝焰
  for (let k = 0; k < 6; k++) {
    const q = 1 - k * 0.16;
    const [nx, ny] = neck(q);
    const [px, py] = neck(Math.min(1, q + 0.05));
    const tx = -(py - ny), ty = px - nx;
    const n = Math.hypot(tx, ty) || 1;
    const r = 6 + (1 - q) * 1.5;
    const bx = nx + (tx / n) * r * 0.95, by = ny + (ty / n) * r * 0.95;
    const ddx = -1 - o.lean * 0.5 + (tx / n) * 0.6, ddy = -0.9 + o.lean * 0.7 + (ty / n) * 0.6;
    tongue(back, bx, by, ddx, ddy, o.mane * (1.2 - k * 0.13), 2.6 - k * 0.2, o.phase, 20 + k, true, BLUE);
  }
  for (let k = 0; k < 3; k++) tongue(back, head[0] - 5, head[1] - 3 + k * 2.4, -1 - o.lean * 0.5, -0.8 + k * 0.5 + o.lean * 0.5, o.mane * (1.1 - k * 0.2), 2.4, o.phase, 26 + k, true, BLUE);
  // ---- 前层：身体 ----
  const body = new Field();
  body.ell(hipX, hipY, 10.5, 10, 0);
  const mid = at(13, 1.5); body.ell(mid[0], mid[1], 14, 9 + o.breath * 0.4, -o.tilt);
  const chest = at(26, -1); body.ell(chest[0], chest[1], 11, 10.5, -o.tilt);
  const sh = at(26, -7); body.ell(sh[0], sh[1], 8, 6, -o.tilt);
  const n0 = at(29, -9); body.ell(n0[0], n0[1], 8, 7.5, -o.tilt);
  for (let k = 0; k < 6; k++) {
    const a = neck(k / 6), b = neck((k + 1) / 6);
    body.cap(a[0], a[1], b[0], b[1], 7.6 - k * 0.4, 7.6 - (k + 1) * 0.4);
  }
  render(front, body, WHITE, 0, 1, 1);
  // 腹部：浅色的腹甲横纹
  const belly = new Field();
  const b0 = at(2, 7.5), b1 = at(26, 6.5);
  belly.cap(b0[0], b0[1], b1[0], b1[1], 3.4, 3.2);
  render(front, belly, WHITE, 0, 2, 4, false);
  // 背脊：从髋到脖子一排金棘，脖子上的继续到脑后
  for (let k = 0; k < 6; k++) {
    const q = at(-4 + k * 3.4, -11 - (k > 1 && k < 5 ? 1 : 0));
    front.set(q[0], q[1], GOLD[4]); front.set(q[0], q[1] - 1, GOLD[5]); front.set(q[0] - 1, q[1], GOLD[3]);
  }
  for (let k = 1; k <= 5; k++) {
    const q = neck(k / 6.5), q2 = neck(k / 6.5 + 0.05);
    const ux = -(q2[1] - q[1]), uy = q2[0] - q[0];
    const m = Math.hypot(ux, uy) || 1;
    const r = 7.4 - k * 0.35;
    front.set(q[0] + (ux / m) * (r + 0.3), q[1] + (uy / m) * (r + 0.3), GOLD[4]);
    front.set(q[0] + (ux / m) * (r + 1.3), q[1] + (uy / m) * (r + 1.3), GOLD[5]);
  }
  // ---- 饰物 ----
  // 鞍：小小的深蓝坐垫、金边，两侧一片短鞍褥
  const sd0 = at(7, -10), sd1 = at(19, -10);
  render(front, new Field().cap(sd0[0], sd0[1], sd1[0], sd1[1], 3.2, 3.2), NAVY, 0, 0, 0);
  for (let k = 0; k <= 12; k++) { const q = at(7 + k, -12.8); front.set(q[0], q[1], k % 4 === 2 ? GOLD[6] : GOLD[4]); }
  poly(front, [at(6, -8), at(20, -8), at(19, 1), at(7, 1)], (x, y) => (((x + y) % 5 === 0) ? NAVY[3] : NAVY[2]));
  for (let k = 0; k <= 13; k++) { const q = at(6.5 + k, 1); front.set(q[0], q[1], k % 2 ? GOLD[4] : GOLD[3]); }
  for (let k = 0; k <= 9; k++) { const a = at(6, -8 + k), b = at(20, -8 + k); front.set(a[0], a[1], GOLD[3]); front.set(b[0], b[1], GOLD[3]); }
  const sg = at(13, -3.5); gem(front, sg[0], sg[1], 1);
  // 肚带、胸带
  const g0 = at(13, 1), g1 = at(13, 10.5);
  band(front, g0[0], g0[1], g1[0], g1[1], 1);
  const s0 = at(20, -7), s1 = at(30, 4);
  band(front, s0[0], s0[1], s1[0], s1[1], 1.1);
  // 肩饰、髋饰：薄薄的金弧片 + 小蓝晶
  const pa = at(25, -4);
  plate(front, pa[0], pa[1], 6, 4.2, -o.tilt - 0.3, 0, 12);
  gem(front, pa[0], pa[1], 1);
  const hp = at(0, -5);
  plate(front, hp[0], hp[1], 5, 3.6, -o.tilt + 0.3, 0, 13);
  gem(front, hp[0], hp[1], 1);
  // 胸饰：金弧 + 蓝晶
  const cp = at(31, 2);
  plate(front, cp[0], cp[1], 5, 5.5, -o.tilt, 0, 14);
  gem(front, cp[0], cp[1], 1);
  // 项圈
  {
    const a = neck(0.2), b = neck(0.27);
    const tx = -(b[1] - a[1]), ty = b[0] - a[0];
    const n = Math.hypot(tx, ty) || 1;
    band(front, a[0] - (tx / n) * 7, a[1] - (ty / n) * 7, a[0] + (tx / n) * 7, a[1] + (ty / n) * 7, 1.4);
    gem(front, a[0] + (tx / n) * 1.5, a[1] + (ty / n) * 1.5, 1, false);
  }
  headSide(front, head[0], head[1], o.pitch + o.tilt * 0.5, o.mouth, o.blink);
  // 近侧腿
  if (!o.lying) {
    stamp(front, (p) => hindLegSide(p, hipX + 1, hipY + 4, hipX + 4 + o.legs[2].x, legY + o.legs[2].y, o.legs[2].k, 0));
    stamp(front, (p) => foreLegSide(p, shoulder[0] + 1, shoulder[1], shoulder[0] + 4 + o.legs[0].x, legY + o.legs[0].y, o.legs[0].k, 0));
  } else {
    stamp(front, (p) => {
      const fl = at(26, 8);
      render(p, new Field().cap(fl[0], fl[1], fl[0] + 12, FEET - 2.5, 3.4, 2.4), WHITE, 0, 0, 5);
      pawSide(p, fl[0] + 14, FEET, 1, 0);
    });
    stamp(front, (p) => {
      render(p, new Field().ell(hipX + 4, hipY + 8, 7, 5).cap(hipX + 6, hipY + 9, hipX + 11, FEET - 2.5, 3, 2.3), WHITE, 0, 1, 6);
      pawSide(p, hipX + 13, FEET, 1, 0);
    });
  }
  // 召唤时朝天喷的火
  if (o.breathFire > 0) {
    const a = -(o.pitch + o.tilt * 0.5);
    plume(front, head[0] + 16 * Math.cos(a) + 1, head[1] + 16 * Math.sin(a) + 3, Math.cos(a), Math.sin(a), 20, 3, 3, 0.5, o.phase, 40, true);
  }
}

/** 前腿（侧面）：肩 → 肘（往后凸）→ 腕 → 爪 */
function foreLegSide(p: Pix, sx: number, sy: number, px: number, py: number, fold: number, dim: number) {
  const [ex, ey] = ik(sx, sy, px - 1.5 + fold * 2, py - 6, 13, 12, false);
  const F = new Field();
  F.ell(sx, sy + 2, 5.5, 6.5).cap(sx, sy, ex, ey, 4.8, 3.2).cap(ex, ey, px - 1 + fold * 2, py - 6, 3.2, 2.5);
  render(p, F, WHITE, dim, 0, 15);
  pawSide(p, px, py, 1, dim, fold);
}

/** 后腿（侧面）：髋（大腿肌肉）→ 膝（往前凸）→ 跗（往后）→ 爪 */
function hindLegSide(p: Pix, hx: number, hy: number, px: number, py: number, push: number, dim: number) {
  const [kx, ky] = ik(hx, hy, px - 4 + push * 3, py - 6, 13, 11, true);
  const F = new Field();
  F.ell(hx + 1, hy + 2, 7.5, 9).cap(hx, hy + 2, kx, ky, 5.2, 3.6).cap(kx, ky, px - 3.5 + push * 3, py - 6, 3.6, 2.6);
  render(p, F, WHITE, dim, 1, 16);
  pawSide(p, px, py, 1, dim, push);
}

// ---------------------------------------------------------------- 正面 / 背面

/** 正面时脖子和头往左偏这么多，骑手坐在脖子右边才看得见 */
export const HEAD_OFF = 7;

function faceRig(o: Pose) {
  const cx = 60;
  const by = FEET - 28 - o.rise + (o.lying ? 4 : 0);
  const hy = by - 28 - o.neck * 5 + (o.lying ? 9 : 0);
  return { cx, by, hy, legY: FEET };
}

/** 正面、背面的背焰：从背上两侧往上往外窜成 V 形 */
function firesFB(p: Pix, cx: number, by: number, o: Pose) {
  plume(p, cx - 9, by - 12, -0.55, -1, 32 * o.fire, 4.5, 3, 0.7, o.phase, 60, true);
  plume(p, cx + 9, by - 12, 0.55, -1, 32 * o.fire, 4.5, 3, 0.7, o.phase + 0.4, 70, true);
  plume(p, cx, by - 14, 0, -1, 22 * o.fire, 3.5, 2, 0.5, o.phase + 0.2, 80, true);
}

/** 正面（朝镜头） */
function drawFront(back: Pix, front: Pix, o: Pose) {
  const { cx, by, hy, legY } = faceRig(o);
  firesFB(back, cx, by, o);
  // 尾巴从身后右侧拖出来，尾焰往右上
  const tp: [number, number][] = [];
  for (let k = 0; k <= 7; k++) { const q = k / 7; tp.push([cx + 12 + q * 30 + Math.sin(q * 3 + o.tail) * 2.5, by + 12 - q * 10 + q * q * 4 + (o.lying ? q * 6 : 0)]); }
  stamp(back, (p) => {
    const F = new Field();
    for (let k = 0; k < 7; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 4.4 - k * 0.5, 4.4 - (k + 1) * 0.5);
    render(p, F, WHITE, 1, 1, 31);
    for (const k of [2, 5]) { band(p, tp[k][0] - 2.5, tp[k][1] - 1, tp[k][0] + 2.5, tp[k][1] + 1, 1, 1); p.set(tp[k][0], tp[k][1] - 3, CRY[2]); }
  });
  for (let k = 3; k <= 7; k++) { const q = k / 7; plume(back, tp[k][0], tp[k][1] - 3, 0.6, -1, (8 + q * 12) * o.tailFlame, 2 + q, 2, 0.5, o.phase, 50 + k * 5, false); }
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 3 : 2];
    stamp(back, (p) => { render(p, new Field().ell(cx + sx * 12, by + 8, 6, 7).cap(cx + sx * 12, by + 10, cx + sx * 14, legY - 3 + L.y * 0.5, 3.8, 2.9), WHITE, 1, 1, 16); pawFront(p, cx + sx * 14, legY + L.y * 0.5, 1); });
  } else for (const sx of [-1, 1]) stamp(back, (p) => { render(p, new Field().ell(cx + sx * 13, by + 10, 6, 5), WHITE, 1, 1, 16); });
  render(back, new Field().ell(cx, by + 4, 16, 13 + o.breath * 0.4).ell(cx, by - 8, 13, 7.5), WHITE, 0, 1, 1);
  render(back, new Field().ell(cx, by + 9, 9, 7), WHITE, 0, 2, 4, false);
  render(back, new Field().cap(cx - 6, by - 12, cx + 6, by - 12, 3.4, 3.4), NAVY, 0, 0, 0);
  for (let k = -7; k <= 7; k++) back.set(cx + k, by - 15, k % 4 === 0 ? GOLD[6] : GOLD[4]);
  for (const sx of [-1, 1]) { plate(back, cx + sx * 12, by - 7, 4.8, 3.8, sx * 0.3, 0, 12); gem(back, cx + sx * 12, by - 7, 1); }
  // 前层：脖子、项圈、焰鬃、头、胸饰、前腿
  const hx = cx - HEAD_OFF;
  render(front, new Field().cap(cx - 2, by - 9, hx, hy + 6, 7.2, 5.8), WHITE, 0, 1, 2);
  band(front, cx - 8.5, by - 13, cx + 4.5, by - 13, 1.4);
  gem(front, cx - 2, by - 13, 1, false);
  for (let k = 0; k < 6; k++) {
    const sx = k < 3 ? -1 : 1, j = k % 3;
    tongue(front, hx + sx * (6 + j * 2), hy - 3 + j * 3, sx * (0.5 + j * 0.3), -1 + j * 0.35, o.mane * (0.75 - j * 0.12), 1.8, o.phase, 20 + k, false, BLUE);
  }
  tongue(front, hx, hy - 7, 0, -1, o.mane * 0.6, 1.6, o.phase, 27, false, BLUE);
  headFront(front, hx, hy, o.mouth, o.blink);
  plate(front, cx, by - 1, 6.5, 6, 0, 0, 14);
  gem(front, cx, by - 1, 1);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 1 : 0];
    stamp(front, (p) => { render(p, new Field().ell(cx + sx * 9, by + 4, 5, 5.5).cap(cx + sx * 9, by + 5, cx + sx * 10, legY - 3 + L.y * 0.6, 3.8, 2.9), WHITE, 0, 1, 15); pawFront(p, cx + sx * 10, legY + L.y * 0.6, 0); });
  } else for (const sx of [-1, 1]) stamp(front, (p) => { render(p, new Field().cap(cx + sx * 9, by + 6, cx + sx * 13, FEET - 3, 3.4, 2.6), WHITE, 0, 0, 15); pawFront(p, cx + sx * 13, FEET, 0); });
  if (o.breathFire > 0) plume(front, hx, hy + 9, 0, -1, 18, 3, 3, 0.5, o.phase, 40, true);
}

/** 背面（看到后脑勺和背） */
function drawBack(back: Pix, front: Pix, o: Pose) {
  const { cx, by, hy, legY } = faceRig(o);
  render(back, new Field().cap(cx, by - 9, cx, hy + 6, 7.2, 5.8), WHITE, 1, 1, 2);
  band(back, cx - 6.5, by - 13, cx + 6.5, by - 13, 1.4, 1);
  headFront(back, cx, hy, 0, false, 1, true);
  for (let k = 0; k < 7; k++) tongue(back, cx - 7.5 + k * 2.5, hy + 2 + Math.abs(k - 3) * 1.2, (k - 3) * 0.3, -1, o.mane * (0.95 - Math.abs(k - 3) * 0.1), 1.9, o.phase, 20 + k, false, BLUE);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 0 : 1];
    stamp(back, (p) => { render(p, new Field().cap(cx + sx * 9, by + 2, cx + sx * 10, legY - 3 + L.y * 0.6, 4, 2.9), WHITE, 1, 1, 15); pawFront(p, cx + sx * 10, legY + L.y * 0.6, 1, true); });
  }
  firesFB(back, cx, by, o);
  // 前层：后半身、背脊金棘、鞍、髋饰、后腿、尾巴朝镜头拖
  render(front, new Field().ell(cx, by + 5, 16, 13 + o.breath * 0.4).ell(cx, by - 7, 13, 7.5), WHITE, 0, 1, 1);
  for (let k = -1; k <= 1; k++) { front.set(cx + k * 5, by - 3, GOLD[4]); front.set(cx + k * 5, by - 4, GOLD[5]); }
  render(front, new Field().cap(cx - 6, by - 10, cx + 6, by - 10, 3.2, 3.2), NAVY, 0, 0, 0);
  for (let k = -7; k <= 7; k++) front.set(cx + k, by - 13, k % 4 === 0 ? GOLD[6] : GOLD[4]);
  poly(front, [[cx - 8, by - 7], [cx + 8, by - 7], [cx + 9, by + 4], [cx - 9, by + 4]], (x, y) => (((x + y) % 5 === 0) ? NAVY[3] : NAVY[2]));
  for (let k = -9; k <= 9; k++) front.set(cx + k, by + 4, k % 2 ? GOLD[4] : GOLD[3]);
  for (let k = -7; k <= 4; k++) { front.set(cx - 8.5, by + k, GOLD[3]); front.set(cx + 8.5, by + k, GOLD[3]); }
  gem(front, cx, by - 1, 1);
  for (const sx of [-1, 1]) { plate(front, cx + sx * 12, by + 2, 4.8, 3.8, -sx * 0.3, 0, 13); gem(front, cx + sx * 12, by + 2, 1); }
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 2 : 3];
    stamp(front, (p) => { render(p, new Field().ell(cx + sx * 12, by + 9, 6, 7).cap(cx + sx * 12, by + 11, cx + sx * 14, legY - 3 + L.y * 0.5, 4, 2.9), WHITE, 0, 1, 16); pawFront(p, cx + sx * 14, legY + L.y * 0.5, 0, true); });
  } else for (const sx of [-1, 1]) stamp(front, (p) => { render(p, new Field().ell(cx + sx * 13, by + 10, 6.5, 5.5), WHITE, 0, 1, 16); });
  const tp: [number, number][] = [];
  for (let k = 0; k <= 7; k++) { const q = k / 7; tp.push([cx + 3 + q * 28 - q * q * 6 + Math.sin(q * 3 + o.tail) * 3, by + 12 + q * 12 - q * q * 10 - (o.lying ? q * 4 : 0)]); }
  stamp(front, (p) => {
    const F = new Field();
    for (let k = 0; k < 7; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 5.2 - k * 0.6, 5.2 - (k + 1) * 0.6);
    render(p, F, WHITE, 0, 1, 31);
    for (const k of [2, 5]) { band(p, tp[k][0] - 2.5, tp[k][1] - 2, tp[k][0] + 2.5, tp[k][1] + 2, 1); p.set(tp[k][0], tp[k][1] - 3.5, CRY[2]); }
  });
  for (let k = 3; k <= 7; k++) { const q = k / 7; plume(front, tp[k][0], tp[k][1] - 3, 0.5, -1, (8 + q * 12) * o.tailFlame, 2 + q, 2, 0.5, o.phase, 50 + k * 5, false); }
  if (o.breathFire > 0) plume(back, cx, hy - 6, 0, -1, 18, 3, 3, 0.5, o.phase, 40, true);
}

// ---------------------------------------------------------------- 导出

export interface DragonAnim { key: string; frames: number; rate: number }
export const DR_ANIMS: DragonAnim[] = [
  { key: 'run-side', frames: 32, rate: 64 },
  { key: 'run-down', frames: 32, rate: 64 },
  { key: 'run-up', frames: 32, rate: 64 },
  { key: 'idle-side', frames: 24, rate: 10 },
  { key: 'idle-down', frames: 24, rate: 10 },
  { key: 'idle-up', frames: 24, rate: 10 },
  { key: 'sit', frames: 16, rate: 8 },
  { key: 'howl', frames: 24, rate: 24 },
];

/** 画一帧：返回 [后层, 前层] */
export function dragonFrame(key: string, i: number, n: number): [Pix, Pix] {
  const back = new Pix(DR_W, DR_H);
  const front = new Pix(DR_W, DR_H);
  const o = poseOf(key, i / n, i);
  if (key.endsWith('-down')) drawFront(back, front, o);
  else if (key.endsWith('-up')) drawBack(back, front, o);
  else drawSide(back, front, o);
  back.outlineTinted(OUT, 0.55);
  front.outlineTinted(OUT, 0.55);
  return [back, front];
}

/** 鞍位跟着身体起伏（像素，正数往下） */
export function dragonSaddle(key: string, i: number): number {
  const a = DR_ANIMS.find((x) => x.key === key);
  if (!a) return 0;
  const o = poseOf(key, i / a.frames, i);
  return Math.round(-o.rise + (key === 'howl' ? o.tilt * 10 : 0) - o.breath * 0.4);
}

/** 整张精灵表：每帧 `dragon-${key}-${i}-b`（后层）和 `-f`（前层） */
export function paintDragonSheet() {
  const total = DR_ANIMS.reduce((k, a) => k + a.frames * 2, 0);
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * DR_W;
  canvas.height = Math.ceil(total / cols) * DR_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of DR_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      dragonFrame(a.key, i, a.frames).forEach((pix, j) => {
        const x = (k % cols) * DR_W;
        const y = Math.floor(k / cols) * DR_H;
        ctx.drawImage(pix.canvas(), x, y);
        frames.push({ name: `dragon-${a.key}-${i}-${j ? 'f' : 'b'}`, x, y });
        k++;
      });
    }
  }
  return { canvas, frames };
}

let iconUrl = '';
/** 背包、坐骑栏里的图标：侧面待机那一帧，缩进 48×48 */
export function dragonMountIconUrl() {
  if (iconUrl) return iconUrl;
  const [b, f] = dragonFrame('idle-side', 3, 24);
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(0.5, 0.5);
  ctx.drawImage(b.canvas(), -8, -4);
  ctx.drawImage(f.canvas(), -8, -4);
  ctx.restore();
  iconUrl = c.toDataURL();
  return iconUrl;
}

/** 眼睛在这一帧的位置（相对脚底中心，侧面按朝右算），地图上的眼睛光跟着它走；背面和眨眼时为空 */
export function dragonEyes(frameName: string): [number, number][] {
  const m = /^dragon-(.+)-(\d+)-[bf]$/.exec(frameName);
  if (!m) return [];
  const a = DR_ANIMS.find((x) => x.key === m[1]);
  if (!a || a.key.endsWith('-up')) return [];
  const i = +m[2];
  const o = poseOf(a.key, i / a.frames, i);
  if (o.blink) return [];
  if (a.key.endsWith('-down')) {
    const { hy } = faceRig(o);
    return [[-HEAD_OFF - 4, hy - 0.5 - FEET], [-HEAD_OFF + 4, hy - 0.5 - FEET]];
  }
  const { head } = sideRig(o);
  const a2 = -(o.pitch + o.tilt * 0.5);
  const pc = Math.cos(a2) * HEAD_K, ps = Math.sin(a2) * HEAD_K;
  return [[head[0] + 7 * pc - (-1.2) * ps - DR_W / 2, head[1] + 7 * ps + (-1.2) * pc - FEET]];
}

