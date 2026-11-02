import { mix, phash, Pix } from './pix';

/*
 * 坐骑「守护者的曙光」（用户 11-02 给的参考图，11-02 第二版：第一版被嫌太粗糙，整只重画）：
 * 珍珠白的西方龙，金色符文甲（胸甲、肩甲、髋甲、护腿、项圈、鞍具）镶蓝水晶，头顶一冠往后掠的金角、额头蓝晶、
 * 蓝光的眼睛，脑后和脖颈一道蓝色的焰鬃，翼尖、翼缘和尾巴尖燃着蓝焰。
 *
 * 画法：身体不再用一个个椭圆叠，而是「等势面」——把椭圆和胶囊当成软体合在一起（Field），每个像素按合成后的
 * 法线打光（左上方的光），再铺鳞片的菱格纹理；每个部件（身体、每条腿、头、尾巴、每片甲）单独算、单独描边，
 * 叠上去就有像素画该有的分块感。翅膀是骨架 + 扇形的膜（膜面从根部的白往外缘透成淡蓝，外缘一瓣一瓣内凹）。
 *
 * 帧 120×96，脚底在第 92 行；每帧分「后层」「前层」两张，骑手夹在中间（侧面骑手画在整只龙前面）：
 *   侧面：远侧翅膀、远侧腿、尾巴、焰鬃、近侧翅膀在后层；身体、甲、脖子、头、近侧腿在前层
 *   正面：翅膀、尾巴、后腿、身体、鞍在后层；脖子、头、胸甲、前腿在前层
 *   背面：头、脖子、前腿、翅膀在后层；后半身、鞍背、后腿、尾巴在前层
 * 动作：奔跑（四足交替奔跑 + 翅膀缓缓扇、焰鬃往后飘）、待机（呼吸、眨眼、尾巴摆、翅膀微动）、
 * 趴下（主角干活时）、召唤（人立起来、展翅、仰天喷蓝焰）。
 */

export const DR_W = 120;
export const DR_H = 96;
export const DR_FEET = 92;
const FEET = DR_FEET;
const TAU = Math.PI * 2;

// 珍珠白：暗部偏冷紫，亮部近乎纯白
const WHITE = ['#5c5f90', '#9096c2', '#c4c9e4', '#e8ebf8', '#ffffff'];
const GOLD = ['#5e3a08', '#a06c14', '#dca62c', '#f6d25a', '#fff6c0'];
const CRY = ['#1448a0', '#2488e8', '#58ccff', '#b4f0ff', '#ffffff'];
const NAVY = ['#121630', '#202650', '#30386e', '#465090', '#6670b0'];
const FLAME = ['#1c58c0', '#2a94f0', '#50d8ff', '#a8f4ff', '#f0ffff'];
const CLAW = ['#7a7e98', '#c8ccdc', '#f4f6ff'];
const EYE = '#40d8ff';
const EYE_HI = '#e8ffff';
const OUT = '#141430';

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
const LX = -0.48, LY = -0.66, LZ = 0.58;

/**
 * 把软体画到 p 上：按法线分 5 阶明暗（左上亮右下暗），tex 1 铺鳞片菱格、2 铺腹部横纹；dim 远侧整体暗一阶。
 * 只画等势面以内的像素；over=false 时不盖已有像素。
 */
function render(p: Pix, F: Field, R: string[], dim = 0, tex = 0, seed = 0, over = true) {
  const x0 = Math.max(0, Math.floor(F.minX) - 1), x1 = Math.min(p.w - 1, Math.ceil(F.maxX) + 1);
  const y0 = Math.max(0, Math.floor(F.minY) - 1), y1 = Math.min(p.h - 1, Math.ceil(F.maxY) + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const f = F.at(x + 0.5, y + 0.5);
      if (f < T) continue;
      if (!over && p.get(x, y)) continue;
      const h = Math.min(1, (f - T) / (0.9 - T));
      const gx = F.at(x + 1.5, y + 0.5) - F.at(x - 0.5, y + 0.5);
      const gy = F.at(x + 0.5, y + 1.5) - F.at(x + 0.5, y - 0.5);
      const g = Math.hypot(gx, gy) || 1;
      const lat = Math.pow(1 - h, 0.55);
      const nx = (gx / g) * lat, ny = (gy / g) * lat, nz = Math.sqrt(Math.max(0, 1 - lat * lat));
      let s = nx * LX + ny * LY + nz * LZ;
      s += (phash(x, y, seed + 9) - 0.5) * 0.06;
      let i = s > 0.8 ? 4 : s > 0.48 ? 3 : s > 0.12 ? 2 : s > -0.26 ? 1 : 0;
      if (tex === 1 && i >= 2 && i <= 3 && h > 0.12) {
        // 鳞片：菱格的两条边各隔 5 格一道，带点随机断开
        const u = ((x + y + seed) % 5 + 5) % 5, v = ((x - y + seed * 3) % 5 + 5) % 5;
        if ((u === 0 || v === 0) && phash(x, y, seed + 1) < 0.62) i--;
      } else if (tex === 2 && i >= 1 && h > 0.1) {
        // 腹甲：隔 4 行一道暗线，每格里再隔几列一道
        if (((y + seed) % 4 + 4) % 4 === 0) i = Math.max(0, i - 1);
        else if (((x + y * 2 + seed) % 6 + 6) % 6 === 0 && i >= 2) i--;
      }
      p.set(x, y, R[Math.max(0, Math.min(R.length - 1, i - dim))]);
    }
  }
}

/** 把一部分单独画好、描一圈深色边再盖上去，和同色的身体分得开 */
function stamp(dst: Pix, draw: (p: Pix) => void, k = 0.68) {
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

/** 两段式反向运动学：从 a 到 c，中间关节 b 往 forward 指定的一侧凸 */
function ik(ax: number, ay: number, cx: number, cy: number, L1: number, L2: number, forward: boolean): [number, number] {
  const dx = cx - ax, dy = cy - ay;
  const d = Math.max(1e-3, Math.min(Math.hypot(dx, dy), L1 + L2 - 0.5));
  const a1 = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const base = Math.atan2(dy, dx);
  const a = base + (forward ? -a1 : a1);
  return [ax + Math.cos(a) * L1, ay + Math.sin(a) * L1];
}

// ---------------------------------------------------------------- 小部件

/** 一颗蓝水晶：菱形切面，左上亮；r=1 小粒，r=2、3 大颗，外面一圈金托 */
function gem(p: Pix, x: number, y: number, r: number, frame = true) {
  x = Math.round(x); y = Math.round(y);
  if (frame) for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    if (Math.abs(dx) + Math.abs(dy) === r + 1) p.set(x + dx, y + dy, dx + dy < 0 ? GOLD[3] : GOLD[1]);
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

/** 金甲片：一块有倒角的椭圆板，上缘亮、下缘暗，表面带一道符文刻痕 */
function plate(p: Pix, x: number, y: number, rx: number, ry: number, rot = 0, dim = 0, rune = true, seed = 0) {
  render(p, new Field().ell(x, y, rx, ry, rot), GOLD, dim, 0, seed);
  // 刻痕：一道弧线和几个小点
  if (rune && rx >= 4) {
    for (let k = -2; k <= 2; k++) {
      const q: [number, number] = [x + k * (rx / 3.2), y + ry * 0.42 - Math.abs(k) * 0.4];
      p.paint(q[0], q[1], GOLD[1 - Math.min(1, dim)]);
    }
    p.paint(x - rx * 0.5, y - ry * 0.35, GOLD[4]);
  }
}

/** 一道金边（带亮面暗面的条） */
function band(p: Pix, x0: number, y0: number, x1: number, y1: number, r: number, dim = 0) {
  render(p, new Field().cap(x0, y0, x1, y1, r, r), GOLD, dim, 0, 3);
}

/** 挂在甲片下面的小坠子：一截金链 + 一粒蓝晶 */
function pendant(p: Pix, x: number, y: number, len: number, sway = 0) {
  for (let k = 0; k < len; k++) p.set(x + sway * (k / len), y + k, k % 2 ? GOLD[2] : GOLD[3]);
  gem(p, x + sway, y + len + 1, 1);
}

/**
 * 蓝色火舌：从 (x0,y0) 朝 (dx,dy) 方向烧 len 长，w 根部半宽，phase 让它一跳一跳；
 * over=false 只填空像素（不盖住身体），over=true 盖上去
 */
function tongue(p: Pix, x0: number, y0: number, dx: number, dy: number, len: number, w: number, phase: number, salt: number, over = false) {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const px = -uy, py = ux;
  const L = len * (0.78 + 0.22 * Math.sin(phase * TAU * 2 + salt * 1.7));
  if (L < 1) return;
  for (let s = 0; s <= L; s += 0.5) {
    const f = s / L;
    const ww = w * Math.pow(1 - f, 0.7) + 0.3;
    const wig = Math.sin(s * 0.8 - phase * TAU * 3 + salt) * 1.1 * f;
    const cx = x0 + ux * s + px * wig;
    const cy = y0 + uy * s + py * wig;
    const c = f < 0.18 ? FLAME[4] : f < 0.4 ? FLAME[3] : f < 0.64 ? FLAME[2] : f < 0.85 ? FLAME[1] : FLAME[0];
    for (let d = -ww; d <= ww; d += 0.5) {
      const x = cx + px * d, y = cy + py * d;
      const edge = Math.abs(d) > ww - 0.7 && f > 0.2;
      const col = edge ? FLAME[Math.max(0, FLAME.indexOf(c) - 1)] : c;
      if (over || !p.get(Math.round(x), Math.round(y))) p.set(x, y, col);
    }
  }
  // 火尖断开飘走的一两点
  const u = (phase * 2 + salt * 0.37) % 1;
  const tx = x0 + ux * (L + 1.5 + u * 4) + px * Math.sin(salt) * 1.5, ty = y0 + uy * (L + 1.5 + u * 4);
  if (over || !p.get(Math.round(tx), Math.round(ty))) p.set(tx, ty, u < 0.5 ? FLAME[3] : FLAME[2]);
}

/** 弯角：从 (x,y) 按角度 a 出发，边走边转 curl，粗到细，金色带倒角 */
function horn(p: Pix, at: (x: number, y: number) => [number, number], x: number, y: number, a: number, len: number, curl: number, r: number, dim = 0) {
  const F = new Field();
  let cx = x, cy = y, ca = a;
  const n = 6;
  const pts: [number, number][] = [at(cx, cy)];
  for (let k = 0; k < n; k++) {
    cx += Math.cos(ca) * (len / n); cy += Math.sin(ca) * (len / n); ca += curl / n;
    pts.push(at(cx, cy));
  }
  for (let k = 0; k < n; k++) F.cap(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], r * (1 - k / n) + 0.45, r * (1 - (k + 1) / n) + 0.45);
  render(p, F, GOLD, dim, 0, 11);
  p.set(pts[n][0], pts[n][1], GOLD[4]);
  // 角根一圈环纹
  const q = pts[1];
  p.paint(q[0], q[1] + 1, GOLD[1]);
}

/** 爪子（侧面，朝 dir）：掌、三根银白的趾甲、金护腿镶蓝晶；lift 0-1 抬脚时趾尖下垂 */
function pawSide(p: Pix, x: number, y: number, dir: number, dim: number, lift = 0) {
  const toe = y - 1.6 + lift * 1.5;
  render(p, new Field().cap(x - dir * 1.5, y - 5.5, x + dir * 3, toe, 2.7, 2.1), WHITE, dim, 0, 5);
  for (let k = 0; k < 3; k++) {
    const bx = x + dir * (4.2 - k * 1.1), by = toe - 0.6 + k * 0.9 + lift;
    p.set(bx, by, CLAW[1]); p.set(bx + dir, by + 0.6 + lift * 0.5, k === 1 ? CLAW[2] : CLAW[1]); p.set(bx + dir * 2, by + 1.2 + lift, CLAW[0]);
  }
  plate(p, x - dir * 0.6, y - 7.2, 3.6, 2.5, 0, dim, false, 7);
  gem(p, x - dir * 0.6, y - 7.2, 1, false);
}

/** 爪子（正面 / 背面）：三根趾甲朝镜头 */
function pawFront(p: Pix, x: number, y: number, dim: number, back = false) {
  render(p, new Field().ell(x, y - 2.5, 3.6, 2.4), WHITE, dim, 0, 5);
  if (!back) for (const dx of [-2.4, 0, 2.4]) { p.set(x + dx, y - 0.5, CLAW[1]); p.set(x + dx, y + 0.5, CLAW[2]); }
  plate(p, x, y - 6.5, 3.8, 2.4, 0, dim, false, 7);
  gem(p, x, y - 6.5, 1, false);
}

// ---------------------------------------------------------------- 翅膀

/**
 * 翅膀：root 翅根，ang 整只翅膀绕翅根转的角度，spread 0 收拢 1 完全张开，
 * dir 1 朝右的侧面（翅膀往左后方伸），-1 镜像；dim 远侧翅膀暗一号；flame 翼缘火焰长度。
 * 骨架：翅根 → 肘（上臂）→ 腕（前臂）→ 四根指骨呈扇形；膜从腕部扇到身侧 body 点，外缘一瓣瓣内凹，边上燃着蓝焰。
 */
function wing(p: Pix, rx: number, ry: number, ang: number, spread: number, dir: number, dim: number, flame: number, phase: number, salt: number, span = 1, bodyPt: [number, number] = [-6, 12]) {
  const rot = (x: number, y: number): [number, number] => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [rx + (x * c - y * s) * dir * span, ry + (x * s + y * c) * span];
  };
  const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const E = rot(-13, -24);
  const W = rot(-24, -36);
  const open: [number, number][] = [[-42, -46], [-52, -30], [-50, -15], [-42, -4]];
  const fold: [number, number][] = [[-36, -34], [-38, -26], [-36, -18], [-32, -10]];
  const tips = open.map((o, k) => rot(...lerp(fold[k], o, spread)));
  const B = rot(bodyPt[0], bodyPt[1]);
  // 膜：腕 → 各指尖（指尖之间一瓣瓣往腕内凹）→ 身侧
  const edge: [number, number][] = [W];
  const scallops: [number, number][][] = [];
  const chain = [...tips, B];
  for (let k = 0; k < chain.length - 1; k++) {
    const a = chain[k], b = chain[k + 1];
    const seg: [number, number][] = [];
    const n = 8;
    const sag = (k === chain.length - 2 ? 0.1 : 0.2) * (0.5 + 0.5 * spread);
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const m = lerp(a, b, t);
      const q = lerp(m, W, Math.sin(t * Math.PI) * sag);
      seg.push(q);
      if (j > 0) edge.push(q);
    }
    scallops.push(seg);
  }
  const span2 = Math.max(1, ...tips.map((t) => Math.hypot(t[0] - W[0], t[1] - W[1])));
  poly(p, edge, (x, y) => {
    const d = Math.hypot(x - W[0], y - W[1]) / span2;
    const n = phash(x, y, salt);
    const i = d > 0.88 ? 4 : d > 0.62 ? 3 : d > 0.3 ? 3 : 2;
    if (d > 0.5 && n < 0.05) return CRY[2 - Math.min(1, dim)];
    if (d > 0.8 && n < 0.35) return CRY[3 - Math.min(1, dim)];
    // 膜上顺着指骨方向的淡淡褶皱
    const fold2 = Math.sin((x - W[0]) * 0.45 + (y - W[1]) * 0.3 + salt) > 0.92;
    return WHITE[Math.max(0, (fold2 ? i - 1 : i) - dim)];
  });
  // 膜的外缘描一道蓝
  for (const q of edge) p.set(q[0], q[1], CRY[2 - Math.min(1, dim)]);
  // 骨头：金色，带倒角
  const bones = new Field();
  bones.cap(rx, ry, E[0], E[1], 3, 2.4).cap(E[0], E[1], W[0], W[1], 2.4, 1.9);
  for (const t of tips) bones.cap(W[0], W[1], t[0], t[1], 1.7, 0.7);
  render(p, bones, GOLD, dim, 0, salt + 2);
  gem(p, E[0], E[1], 1);
  gem(p, W[0], W[1], 1);
  for (const t of tips) p.set(t[0], t[1], GOLD[4]);
  // 翼尖和外缘燃着蓝焰（往外）
  if (flame > 0.5) {
    tips.forEach((t, k) => tongue(p, t[0], t[1], t[0] - W[0], t[1] - W[1], flame * (k === 0 ? 1.15 : 0.9), 1.5, phase, salt + k * 3));
    scallops.forEach((seg, k) => {
      if (k === scallops.length - 1) return;
      for (const j of [2, 4, 6]) {
        const q = seg[j];
        const ox = q[0] - W[0], oy = q[1] - W[1];
        tongue(p, q[0], q[1], ox, oy, flame * (0.45 + 0.2 * Math.sin(j + k + phase * TAU)), 1.1, phase, salt + 10 + k * 3 + j);
      }
    });
  }
}

// ---------------------------------------------------------------- 头

/**
 * 头（侧面，朝右，hx/hy 颅骨中心）：长吻、眉骨、下颌，金色的眉甲和颊甲，额头蓝晶，蓝光的眼睛，
 * 脑后一冠五根往后掠的金角；mouth 0-1 张嘴，pitch 抬头（弧度，正数鼻子朝上）
 */
function headSide(p: Pix, hx: number, hy: number, pitch: number, mouth: number, blink: boolean, dim = 0) {
  const c = Math.cos(-pitch), s = Math.sin(-pitch);
  const at = (x: number, y: number): [number, number] => [hx + x * c - y * s, hy + x * s + y * c];
  // 冠角（画在最后面）
  horn(p, at, -5, -3, Math.PI + 0.25, 17, -1.0, 2.4, dim);
  horn(p, at, -3, -5.5, Math.PI + 0.6, 15, -0.9, 2.1, dim);
  horn(p, at, 0, -6.5, Math.PI + 1.0, 12, -0.8, 1.8, dim);
  horn(p, at, -6, 0.5, Math.PI + 0.05, 12, -0.7, 1.9, dim);
  horn(p, at, -6, 3.5, Math.PI - 0.15, 8, -0.4, 1.5, dim);
  // 下颌（单独描边，和吻分开）
  const jawDrop = mouth * 4.5;
  stamp(p, (q) => {
    const j0 = at(0, 4), j1 = at(13, 5 + jawDrop);
    render(q, new Field().cap(j0[0], j0[1], j1[0], j1[1], 2.8, 1.6), WHITE, dim + 1, 0, 21);
  });
  if (mouth > 0.15) {
    // 口腔和牙
    const m0 = at(4, 2.8), m1 = at(13.5, 2.8 + jawDrop * 0.55);
    render(p, new Field().cap(m0[0], m0[1], m1[0], m1[1], 1.2 + mouth * 1.6, 0.7), NAVY, 1, 0, 0);
    for (let k = 0; k < 3; k++) { const t = at(7 + k * 2.4, 2.2); p.set(t[0], t[1], CLAW[2]); p.set(t[0], t[1] + 1, CLAW[1]); }
    for (let k = 0; k < 2; k++) { const t = at(8.5 + k * 2.6, 3.6 + jawDrop * 0.8); p.set(t[0], t[1], CLAW[2]); }
  }
  // 颅骨、眉骨、吻
  const sk = new Field();
  sk.ell(hx, hy, 7, 5.8, -pitch);
  const br = at(3.5, -3.2); sk.ell(br[0], br[1], 4.5, 2.4, -pitch);
  const m0 = at(4, 0.5), m1 = at(15.5, 2.6);
  sk.cap(m0[0], m0[1], m1[0], m1[1], 4.6, 2.9);
  const ck = at(-2, 2.5); sk.ell(ck[0], ck[1], 4, 3.2, -pitch);
  render(p, sk, WHITE, dim, 0, 20);
  // 上唇的牙尖、鼻孔、吻上的小角
  const lip = at(14.5, 4.6); p.set(lip[0], lip[1], CLAW[2]);
  const lip2 = at(11.5, 5); p.set(lip2[0], lip2[1], CLAW[1]);
  const nz = at(15, 0.6); p.set(nz[0], nz[1], WHITE[0]); p.set(nz[0] - 1, nz[1], WHITE[1]);
  horn(p, at, 10.5, -2.2, -Math.PI * 0.42, 5, 0.3, 1.3, dim);
  // 眉甲（金）和颊甲（金 + 蓝晶）
  const b0 = at(-2.5, -5), b1 = at(8, -4.2);
  band(p, b0[0], b0[1], b1[0], b1[1], 1.5, dim);
  const cp = at(-2.5, 2.5);
  plate(p, cp[0], cp[1], 3.4, 2.6, -pitch, dim, false, 22);
  gem(p, cp[0], cp[1], 1, false);
  // 额头的蓝晶
  const fg = at(1.5, -4.2);
  gem(p, fg[0], fg[1], 1);
  // 眼睛：眉骨下一道阴影，眼睛三格蓝光，周围一圈淡蓝
  const e = at(5, -1.4);
  const ex = Math.round(e[0]), ey = Math.round(e[1]);
  for (let k = -1; k <= 3; k++) p.paint(ex + k, ey - 2, WHITE[0]);
  if (blink) { for (let k = 0; k <= 2; k++) p.paint(ex + k, ey, WHITE[0]); }
  else {
    for (const [dx, dy] of [[-1, 0], [3, 0], [-1, -1], [3, -1], [0, 1], [1, 1], [2, 1]]) p.paint(ex + dx, ey + dy, CRY[1]);
    p.set(ex, ey - 1, CRY[3]); p.set(ex + 1, ey - 1, EYE_HI); p.set(ex + 2, ey - 1, CRY[3]);
    p.set(ex, ey, EYE); p.set(ex + 1, ey, EYE); p.set(ex + 2, ey, EYE);
    p.set(ex + 1, ey, NAVY[0]);
  }
}

/** 头（正面，朝镜头）：hx/hy 颅骨中心 */
function headFront(p: Pix, hx: number, hy: number, mouth: number, blink: boolean, dim = 0, back = false) {
  const atF = (x: number, y: number): [number, number] => [hx + x, hy + y];
  // 冠角：正面看是从头后面冒出来、往两边掠开的短角；两根颊角往外下
  horn(p, atF, -5, -2.5, -Math.PI * 0.86, 9, -0.7, 2.1, dim);
  horn(p, atF, 5, -2.5, -Math.PI * 0.14, 9, 0.7, 2.1, dim);
  horn(p, atF, -3, -4.5, -Math.PI * 0.72, 8, -0.5, 1.8, dim);
  horn(p, atF, 3, -4.5, -Math.PI * 0.28, 8, 0.5, 1.8, dim);
  horn(p, atF, 0, -5.5, -Math.PI * 0.5, 6.5, 0, 1.6, dim);
  horn(p, atF, -7.5, 1.5, Math.PI * 0.86, 6, -0.6, 1.4, dim);
  horn(p, atF, 7.5, 1.5, Math.PI * 0.14, 6, 0.6, 1.4, dim);
  // 颅骨 + 两道眉骨；正面还有朝镜头的吻（在眼睛下面，压短了）
  const sk = new Field().ell(hx, hy, 8.2, 6.6).ell(hx - 4, hy - 3, 3.6, 2.2).ell(hx + 4, hy - 3, 3.6, 2.2);
  if (!back) sk.ell(hx, hy + 4.5, 5.4, 4).ell(hx, hy + 8.5, 3.6, 3);
  render(p, sk, WHITE, dim, back ? 1 : 0, 20);
  if (back) {
    // 后脑勺：一道脊线
    for (let k = -2; k <= 3; k++) p.paint(hx, hy + k, WHITE[1]);
    return;
  }
  // 吻端：鼻孔、上唇线、两颗獠牙；下颌
  for (const sx of [-1, 1]) { p.set(hx + sx * 1.6, hy + 9, WHITE[0]); p.set(hx + sx * 1.6, hy + 8, WHITE[1]); }
  if (mouth > 0.15) stamp(p, (q) => render(q, new Field().ell(hx, hy + 12 + mouth * 2.5, 3.2, 1.4), WHITE, dim + 1, 0, 21));
  if (mouth > 0.15) {
    render(p, new Field().ell(hx, hy + 10.5 + mouth, 3.2, 0.8 + mouth * 1.6), NAVY, 1, 0, 0);
    for (const sx of [-2.2, 0, 2.2]) p.set(hx + sx, hy + 9.8, CLAW[2]);
  }
  for (const sx of [-1, 1]) { p.set(hx + sx * 2.4, hy + 11.2, CLAW[2]); p.set(hx + sx * 2.4, hy + 12, CLAW[1]); }
  // 眉甲、颊甲、额晶
  band(p, hx - 6.5, hy - 4.2, hx + 6.5, hy - 4.2, 1.4, dim);
  for (const sx of [-1, 1]) { plate(p, hx + sx * 6.5, hy + 2.5, 2.6, 3.2, 0, dim, false, 22); gem(p, hx + sx * 6.5, hy + 2.5, 1, false); }
  gem(p, hx, hy - 6, 1);
  // 眼睛：眉骨下的阴影里一道蓝光
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

/** 一帧的姿势 */
interface Pose {
  /** 离地（跑步起伏、召唤人立时身体抬高；趴下为负） */
  rise: number;
  /** 身体前倾（正数头抬高尾巴低） */
  tilt: number;
  /** 呼吸 */
  breath: number;
  /** 四条腿：近前、远前、近后、远后的脚相对站位的位移和抬脚程度 */
  legs: { x: number; y: number; k: number }[];
  /** 翅膀角度与张开程度 */
  wingAng: number;
  spread: number;
  /** 尾巴摆动 */
  tail: number;
  /** 脖子抬起程度（0 平常，1 仰天） */
  neck: number;
  /** 头的俯仰、张嘴、眨眼 */
  pitch: number;
  mouth: number;
  blink: boolean;
  /** 焰鬃长度、翼缘火焰、尾焰 */
  mane: number;
  flame: number;
  tailFlame: number;
  phase: number;
  /** 趴着 */
  lying: boolean;
  /** 召唤时朝天喷的火 */
  breathFire: number;
  /** 焰鬃往后飘的程度（跑起来 1） */
  back: number;
}

const flick = (i: number) => 0.8 + 0.2 * Math.sin(i * 2.7) + 0.15 * Math.sin(i * 7.3 + 1);
const still = { x: 0, y: 0, k: 0 };

/**
 * 奔跑：四足的跑步（后腿一对先蹬、前腿一对再落，中间有腾空），
 * 每条腿 55% 时间着地（脚相对身体往后滑），45% 时间抬起往前摆；翅膀一步缓缓扇一次。
 */
function run(t: number, i: number): Pose {
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
    wingAng: -0.15 + Math.sin(t * TAU + 0.8) * 0.3, spread: 0.9 + Math.sin(t * TAU + 0.8) * 0.1,
    tail: Math.sin(t * TAU) * 0.7, neck: 0.1, pitch: 0.1 + Math.sin(t * TAU + 0.5) * 0.04, mouth: 0.1 + 0.1 * Math.sin(t * TAU), blink: false,
    mane: 15, flame: 9 + Math.sin(t * TAU * 2) * 1.5, tailFlame: 11, phase: t, lying: false, breathFire: 0, back: 1,
  };
}
function idle(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: 0, tilt: 0, breath: br,
    legs: [still, still, still, still],
    wingAng: 0.12 + br * 0.05, spread: 0.72 + br * 0.08,
    tail: br * 0.5, neck: 0.05 + Math.max(0, Math.sin(t * TAU + 1)) * 0.06, pitch: 0.08 + br * 0.04, mouth: 0, blink: i === 15 || i === 16,
    mane: 11 + br, flame: 7 + flick(i) * 2, tailFlame: 8, phase: t, lying: false, breathFire: 0, back: 0.35,
  };
}
function sit(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: -15, tilt: -0.02, breath: br * 0.5,
    legs: [still, still, still, still],
    wingAng: -0.95, spread: 0.05,
    tail: br * 0.3, neck: -0.25, pitch: -0.12 + br * 0.03, mouth: 0, blink: i % 16 < 9,
    mane: 5 + br * 0.5, flame: 2.5 + flick(i), tailFlame: 4, phase: t, lying: true, breathFire: 0, back: 0.2,
  };
}
/** 召唤：前腿抬起人立、翅膀猛地张开、仰头朝天喷一道蓝焰，再落回地上 */
function howl(t: number, i: number): Pose {
  const up = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.5) : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
  const roar = t > 0.25 && t < 0.72;
  return {
    rise: 0, tilt: 0.3 * up, breath: 0,
    legs: [{ x: 7 * up, y: -13 * up, k: up }, { x: 5 * up, y: -12 * up, k: up }, still, still],
    wingAng: 0.12 - up * 0.7 + Math.sin(t * TAU * 2) * 0.08 * up, spread: 0.5 + up * 0.5,
    tail: Math.sin(t * TAU * 2) * 0.6, neck: up * 0.2, pitch: 0.1 + up * 0.6, mouth: roar ? 1 : 0.3 * up, blink: false,
    mane: 8 + up * 6, flame: 6 + up * 7, tailFlame: 6 + up * 6, phase: t, lying: false, breathFire: roar ? 1 : 0, back: 0.5 + up * 0.5,
  };
}

const poseOf = (key: string, t: number, i: number) => (key.startsWith('run') ? run(t, i) : key.startsWith('idle') ? idle(t, i) : key === 'sit' ? sit(t, i) : howl(t, i));

// ---------------------------------------------------------------- 侧面

/** 侧面身体的骨架点：以髋为轴，tilt 让前半身抬起来 */
function sideRig(o: Pose) {
  const hipX = 44, hipY = FEET - 30 - o.rise;
  const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
  const at = (x: number, y: number): [number, number] => [hipX + x * c + y * s, hipY - x * s + y * c];
  // 脖子：从胸前上方起，弧线到头
  const n0 = at(28, -10);
  const lift = o.neck;
  const ctrl = at(40 - lift * 6, -16 - lift * 10);
  const head = at(50 - lift * 10, -30 - lift * 14 + o.breath * 0.3);
  const neck = (q: number): [number, number] => {
    const u = 1 - q;
    return [u * u * n0[0] + 2 * u * q * ctrl[0] + q * q * head[0], u * u * n0[1] + 2 * u * q * ctrl[1] + q * q * head[1]];
  };
  return { hipX, hipY, at, neck, head, n0 };
}

/** 侧面尾巴：从髋后往后、再卷起来 */
function sideTail(o: Pose, hipX: number, hipY: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = hipX - 7, y = hipY + 2;
  let th = Math.PI - 0.5;
  const n = 10;
  const curl = o.lying ? 0.5 : 2.3;
  for (let k = 0; k <= n; k++) {
    pts.push([x, y]);
    const step = 4.3;
    x += Math.cos(th) * step; y += Math.sin(th) * step;
    // 前半段贴着地往后走，后半段卷起来
    th += (k < 3 ? curl * 0.06 : curl * 0.124) + Math.sin(o.tail + k * 0.6) * 0.05 * (k / n);
    if (o.lying && y > FEET - 3) y = FEET - 3;
  }
  return pts;
}

/** 侧面（朝右） */
function drawSide(back: Pix, front: Pix, o: Pose) {
  const { hipX, hipY, at, neck, head } = sideRig(o);
  const shoulder = at(26, 2);
  const wingRoot = at(10, -11);
  const legY = FEET;
  const wingBody: [number, number] = [-6, 1];
  // ---- 后层 ----
  // 远侧翅膀
  wing(back, wingRoot[0] - 8, wingRoot[1] - 4, o.wingAng + 0.22, o.spread, 1, 1, o.flame * 0.75, o.phase + 0.3, 7, 0.9, wingBody);
  // 远侧腿
  if (!o.lying) {
    stamp(back, (p) => hindLegSide(p, hipX - 4, hipY + 4, hipX - 1 + o.legs[3].x, legY + o.legs[3].y, o.legs[3].k, 1));
    stamp(back, (p) => foreLegSide(p, shoulder[0] - 4, shoulder[1], shoulder[0] - 1 + o.legs[1].x, legY + o.legs[1].y, o.legs[1].k, 1));
  }
  // 近侧翅膀
  wing(back, wingRoot[0], wingRoot[1], o.wingAng, o.spread, 1, 0, o.flame, o.phase, 3, 1.05, wingBody);
  // 尾巴
  const tp = sideTail(o, hipX, hipY);
  stamp(back, (p) => {
    const F = new Field();
    for (let k = 0; k + 1 < tp.length; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 5.4 - k * 0.4, 5.4 - (k + 1) * 0.4);
    render(p, F, WHITE, 0, 1, 31);
    // 尾脊一排小金棘
    for (let k = 1; k < tp.length - 1; k += 2) {
      const a = tp[k], b = tp[k + 1];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1;
      const r = 5.2 - k * 0.4;
      p.set(a[0] + (nx / n) * (r + 0.5), a[1] + (ny / n) * (r + 0.5), GOLD[3]);
      p.set(a[0] + (nx / n) * (r + 1.5), a[1] + (ny / n) * (r + 1.5), GOLD[2]);
    }
    // 两道金环镶蓝晶
    for (const k of [3, 7]) {
      const a = tp[k], b = tp[k + 1];
      const nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1;
      const r = 5.4 - k * 0.4;
      band(p, a[0] - (nx / n) * r, a[1] - (ny / n) * r, a[0] + (nx / n) * r, a[1] + (ny / n) * r, 1.1);
      gem(p, a[0], a[1], k === 3 ? 1 : 0, false);
    }
  });
  // 尾焰：尾尖和末三节往外冒
  const tip = tp[tp.length - 1], pre = tp[tp.length - 2];
  tongue(back, tip[0], tip[1], tip[0] - pre[0], tip[1] - pre[1], o.tailFlame * 1.2, 2.8, o.phase, 31);
  tongue(back, tip[0] - 2, tip[1] + 1, tip[0] - pre[0] - 1, tip[1] - pre[1], o.tailFlame * 0.8, 2, o.phase, 32);
  for (let k = tp.length - 5; k < tp.length - 1; k++) {
    const a = tp[k], b = tp[k + 1];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0];
    tongue(back, a[0] + nx * 0.4, a[1] + ny * 0.4, nx - (b[0] - a[0]) * 0.3, ny - (b[1] - a[1]) * 0.3, o.tailFlame * 0.55, 1.3, o.phase, 34 + k);
  }
  // 焰鬃：脑后一簇大的，沿着脖子背面一排，都画在后层（从头和脖子后面冒出来）
  const bk = o.back;
  for (let k = 0; k < 6; k++) {
    const q = 1 - k * 0.16;
    const [nx, ny] = neck(q);
    const [px, py] = neck(Math.min(1, q + 0.05));
    const tx = -(py - ny), ty = px - nx;
    const n = Math.hypot(tx, ty) || 1;
    const r = 5.5 + (1 - q) * 1.5;
    const bx = nx + (tx / n) * r * 0.95, by = ny + (ty / n) * r * 0.95;
    const dx = -1 - bk * 0.6 + (tx / n) * 0.6, dy = -0.9 + bk * 0.8 + (ty / n) * 0.6;
    tongue(back, bx, by, dx, dy, o.mane * (1.35 - k * 0.13), 3.2 - k * 0.25, o.phase, 20 + k, true);
  }
  // 脑后的焰冠
  for (let k = 0; k < 4; k++) tongue(back, head[0] - 5, head[1] - 3 + k * 2.2, -1 - bk * 0.5, -0.7 + k * 0.45 + bk * 0.5, o.mane * (1.25 - k * 0.2), 2.8, o.phase, 26 + k, true);
  // ---- 前层：身体 ----
  const body = new Field();
  body.ell(hipX, hipY, 11, 10.5, 0);
  const mid = at(13, 1.5); body.ell(mid[0], mid[1], 14, 10 + o.breath * 0.4, -o.tilt);
  const chest = at(26, -1); body.ell(chest[0], chest[1], 11, 10.5, -o.tilt);
  const sh = at(26, -7); body.ell(sh[0], sh[1], 8, 6, -o.tilt);
  const n0 = at(29, -9); body.ell(n0[0], n0[1], 7.5, 7, -o.tilt);
  for (let k = 0; k < 6; k++) {
    const a = neck(k / 6), b = neck((k + 1) / 6);
    body.cap(a[0], a[1], b[0], b[1], 7 - k * 0.3, 7 - (k + 1) * 0.3);
  }
  render(front, body, WHITE, 0, 1, 1);
  // 腹部：浅色的腹甲横纹
  const belly = new Field();
  const b0 = at(2, 8), b1 = at(26, 7);
  belly.cap(b0[0], b0[1], b1[0], b1[1], 3.6, 3.4);
  render(front, belly, WHITE, 0, 2, 4, false);
  for (let k = 0; k <= 6; k++) {
    const q = at(2 + k * 4, 9.5);
    for (let dx = -1; dx <= 1; dx++) front.paint(q[0] + dx, q[1] + (Math.abs(dx) ? -0.6 : 0), WHITE[3]);
    front.paint(q[0], q[1] + 2, WHITE[1]);
  }
  // 背脊：一排小金棘（从髋到翅根）
  for (let k = 0; k < 5; k++) {
    const q = at(-2 + k * 3.2, -11.5 - (k === 2 ? 0.5 : 0));
    front.set(q[0], q[1], GOLD[3]); front.set(q[0], q[1] - 1, GOLD[4]);
  }
  // ---- 甲胄 ----
  // 鞍：坐垫 + 垂下的鞍褥（深蓝、金边、菱纹、蓝晶坠）
  const sd0 = at(5, -10.5), sd1 = at(19, -10.5);
  render(front, new Field().cap(sd0[0], sd0[1], sd1[0], sd1[1], 3.6, 3.6), NAVY, 0, 0, 0);
  for (let k = 0; k <= 14; k++) { const q = at(5 + k, -13.6); front.set(q[0], q[1], k % 4 === 2 ? GOLD[4] : GOLD[3]); }
  poly(front, [at(4, -8), at(21, -8), at(20, 4), at(5, 4)], (x, y) => (((x + y) % 6 === 0 || (x - y) % 6 === 0) ? NAVY[2] : NAVY[1]));
  for (let k = 0; k <= 16; k++) { const q = at(4.5 + k, 4); front.set(q[0], q[1], k % 2 ? GOLD[3] : GOLD[2]); }
  for (let k = 0; k <= 12; k++) { const a = at(4.5, -8 + k), b = at(20.5, -8 + k); front.set(a[0], a[1], GOLD[2]); front.set(b[0], b[1], GOLD[2]); }
  const sg = at(12.5, -2.5);
  gem(front, sg[0], sg[1], 2);
  for (const k of [7, 18]) { const q = at(k, 5); pendant(front, q[0], q[1], 2, 0); }
  // 肚带：从鞍褥下面绕过肚子
  const g0 = at(12, 4), g1 = at(12, 11);
  band(front, g0[0], g0[1], g1[0], g1[1], 1.2);
  // 胸带：从鞍前斜下到胸甲
  const s0 = at(21, -8), s1 = at(31, 4);
  band(front, s0[0], s0[1], s1[0], s1[1], 1.5);
  gem(front, (s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2, 1, false);
  // 肩甲：金板 + 蓝晶 + 两根小棘；髋甲同款
  const pa = at(25, -4);
  plate(front, pa[0], pa[1], 6.5, 5, -o.tilt, 0, true, 12);
  gem(front, pa[0], pa[1], 2);
  const hp = at(0, -5);
  plate(front, hp[0], hp[1], 5.5, 4.4, -o.tilt, 0, true, 13);
  gem(front, hp[0], hp[1], 1);
  pendant(front, hp[0] - 1, hp[1] + 5, 2);
  // 胸甲：大金板，正中一颗大蓝晶，下面挂坠子
  const cp = at(31, 2);
  plate(front, cp[0], cp[1], 6.5, 7, -o.tilt, 0, true, 14);
  gem(front, cp[0], cp[1], 2);
  pendant(front, cp[0], cp[1] + 8, 2);
  // 项圈：绕在脖子根上
  {
    const a = neck(0.18), b = neck(0.25);
    const tx = -(b[1] - a[1]), ty = b[0] - a[0];
    const n = Math.hypot(tx, ty) || 1;
    band(front, a[0] - (tx / n) * 7.2, a[1] - (ty / n) * 7.2, a[0] + (tx / n) * 7.2, a[1] + (ty / n) * 7.2, 1.7);
    gem(front, a[0] + (tx / n) * 2, a[1] + (ty / n) * 2, 1, false);
    // 脖子上的一排金鳞
    for (let k = 2; k <= 5; k++) {
      const q = neck(k / 6.5), q2 = neck(k / 6.5 + 0.05);
      const ux = -(q2[1] - q[1]), uy = q2[0] - q[0];
      const m = Math.hypot(ux, uy) || 1;
      const r = 6.8 - k * 0.3;
      front.paint(q[0] + (ux / m) * (r - 0.8), q[1] + (uy / m) * (r - 0.8), GOLD[3]);
    }
  }
  // 头
  headSide(front, head[0], head[1], o.pitch + o.tilt * 0.5, o.mouth, o.blink);
  // 近侧腿（压在身体前面）
  if (!o.lying) {
    stamp(front, (p) => hindLegSide(p, hipX + 1, hipY + 4, hipX + 4 + o.legs[2].x, legY + o.legs[2].y, o.legs[2].k, 0));
    stamp(front, (p) => foreLegSide(p, shoulder[0] + 1, shoulder[1], shoulder[0] + 4 + o.legs[0].x, legY + o.legs[0].y, o.legs[0].k, 0));
  } else {
    // 趴着：前腿往前伸平、后腿折在身下
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
  // 召唤时朝天喷的蓝焰
  if (o.breathFire > 0) {
    const a = -(o.pitch + o.tilt * 0.5);
    const m = [head[0] + 15 * Math.cos(a) + 1, head[1] + 15 * Math.sin(a) + 3];
    for (let k = 0; k < 3; k++) tongue(front, m[0], m[1], Math.cos(a - 0.25 + k * 0.25), Math.sin(a - 0.25 + k * 0.25), 18 - k * 2, 3.2 - k * 0.5, o.phase, 40 + k, true);
  }
}

/** 前腿（侧面）：肩 → 肘（往后凸）→ 腕 → 爪 */
function foreLegSide(p: Pix, sx: number, sy: number, px: number, py: number, fold: number, dim: number) {
  const [ex, ey] = ik(sx, sy, px - 1.5 + fold * 2, py - 6, 13, 12, false);
  const F = new Field();
  F.ell(sx, sy + 2, 5, 6).cap(sx, sy, ex, ey, 4.4, 3).cap(ex, ey, px - 1 + fold * 2, py - 6, 3, 2.4);
  render(p, F, WHITE, dim, 1, 15);
  pawSide(p, px, py, 1, dim, fold);
}

/** 后腿（侧面）：髋（大腿肌肉）→ 膝（往前凸）→ 跗（往后）→ 爪 */
function hindLegSide(p: Pix, hx: number, hy: number, px: number, py: number, push: number, dim: number) {
  const [kx, ky] = ik(hx, hy, px - 4 + push * 3, py - 6, 13, 11, true);
  const F = new Field();
  F.ell(hx + 1, hy + 2, 7, 8.5).cap(hx, hy + 2, kx, ky, 5, 3.4).cap(kx, ky, px - 3.5 + push * 3, py - 6, 3.4, 2.5);
  render(p, F, WHITE, dim, 1, 16);
  pawSide(p, px, py, 1, dim, push);
}

// ---------------------------------------------------------------- 正面 / 背面

/** 正面时脖子和头往左偏这么多，骑手坐在脖子右边才看得见 */
export const HEAD_OFF = 7;

/** 正面、背面共用的骨架 */
function faceRig(o: Pose) {
  const cx = 60;
  const by = FEET - 28 - o.rise + (o.lying ? 4 : 0);
  const hy = by - 27 - o.neck * 5 + (o.lying ? 9 : 0);
  return { cx, by, hy, legY: FEET };
}

/** 正面、背面的两只翅膀：从背上两侧往上往外张成 V 形 */
function wingsFB(p: Pix, cx: number, by: number, o: Pose) {
  const wa = -0.5 + o.wingAng * 0.5;
  wing(p, cx - 10, by - 12, wa, o.spread, 1, 0, o.flame, o.phase, 3, 0.8, [-4, 10]);
  wing(p, cx + 10, by - 12, wa, o.spread, -1, 0, o.flame, o.phase + 0.5, 5, 0.8, [-4, 10]);
}

/** 正面（朝镜头） */
function drawFront(back: Pix, front: Pix, o: Pose) {
  const { cx, by, hy, legY } = faceRig(o);
  // 后层：翅膀、尾巴、后腿、身体、鞍
  wingsFB(back, cx, by, o);
  const tp: [number, number][] = [];
  for (let k = 0; k <= 7; k++) { const q = k / 7; tp.push([cx + 13 + q * 22 - q * q * 6 + Math.sin(q * 3 + o.tail) * 2.5, by + 12 - q * 24 + q * q * 8 + (o.lying ? q * 12 : 0)]); }
  stamp(back, (p) => {
    const F = new Field();
    for (let k = 0; k < 7; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 4.6 - k * 0.5, 4.6 - (k + 1) * 0.5);
    render(p, F, WHITE, 1, 1, 31);
    for (const k of [2, 5]) { band(p, tp[k][0] - 2.5, tp[k][1] - 1, tp[k][0] + 2.5, tp[k][1] + 1, 1, 1); gem(p, tp[k][0], tp[k][1], 0, false); }
  });
  tongue(back, tp[7][0], tp[7][1], tp[7][0] - tp[6][0], tp[7][1] - tp[6][1], o.tailFlame * 1.1, 2.4, o.phase, 31);
  tongue(back, tp[6][0] + 2, tp[6][1], 1, -0.5, o.tailFlame * 0.6, 1.4, o.phase, 33);
  tongue(back, tp[5][0] + 2, tp[5][1], 1, 0, o.tailFlame * 0.45, 1.2, o.phase, 35);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 3 : 2];
    stamp(back, (p) => { render(p, new Field().ell(cx + sx * 12, by + 8, 6, 7).cap(cx + sx * 12, by + 10, cx + sx * 14, legY - 3 + L.y * 0.5, 3.8, 2.9), WHITE, 1, 1, 16); pawFront(p, cx + sx * 14, legY + L.y * 0.5, 1); });
  } else for (const sx of [-1, 1]) stamp(back, (p) => { render(p, new Field().ell(cx + sx * 13, by + 10, 6, 5), WHITE, 1, 1, 16); });
  render(back, new Field().ell(cx, by + 4, 17, 13 + o.breath * 0.4).ell(cx, by - 8, 14, 7.5), WHITE, 0, 1, 1);
  render(back, new Field().ell(cx, by + 9, 9.5, 7), WHITE, 0, 2, 4, false);
  // 鞍（骑手坐在上面）：深蓝垫子、金边
  render(back, new Field().cap(cx - 7, by - 12, cx + 7, by - 12, 3.8, 3.8), NAVY, 0, 0, 0);
  for (let k = -8; k <= 8; k++) back.set(cx + k, by - 15.5, k % 4 === 0 ? GOLD[4] : GOLD[3]);
  // 肩甲在两侧
  for (const sx of [-1, 1]) { plate(back, cx + sx * 13, by - 7, 5.2, 4.4, 0, 0, true, 12); gem(back, cx + sx * 13, by - 7, 1); pendant(back, cx + sx * 15, by - 2, 2); }
  // 前层：脖子、项圈、焰鬃、头、胸甲、前腿
  const hx = cx - HEAD_OFF;
  render(front, new Field().cap(cx - 2, by - 9, hx, hy + 6, 7.4, 6), WHITE, 0, 1, 2);
  for (let k = 0; k < 4; k++) { front.paint(hx + k * 0.5, hy + 12 + k * 3, WHITE[3]); front.paint(hx - 1 + k * 0.5, hy + 13 + k * 3, WHITE[3]); front.paint(hx + 1 + k * 0.5, hy + 13 + k * 3, WHITE[3]); }
  band(front, cx - 8.8, by - 13, cx + 4.8, by - 13, 1.7);
  gem(front, cx - 2, by - 13, 1, false);
  for (let k = 0; k < 6; k++) {
    const sx = k < 3 ? -1 : 1, j = k % 3;
    tongue(front, hx + sx * (6 + j * 2), hy - 3 + j * 3, sx * (0.5 + j * 0.3), -1 + j * 0.35, o.mane * (0.75 - j * 0.12), 1.8, o.phase, 20 + k);
  }
  tongue(front, hx, hy - 7, 0, -1, o.mane * 0.6, 1.6, o.phase, 27);
  headFront(front, hx, hy, o.mouth, o.blink);
  plate(front, cx, by - 1, 7.5, 6.8, 0, 0, true, 14);
  gem(front, cx, by - 1, 2);
  pendant(front, cx, by + 7, 2);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 1 : 0];
    stamp(front, (p) => { render(p, new Field().ell(cx + sx * 9, by + 4, 5, 5.5).cap(cx + sx * 9, by + 5, cx + sx * 10, legY - 3 + L.y * 0.6, 3.8, 2.9), WHITE, 0, 1, 15); pawFront(p, cx + sx * 10, legY + L.y * 0.6, 0); });
  } else for (const sx of [-1, 1]) stamp(front, (p) => { render(p, new Field().cap(cx + sx * 9, by + 6, cx + sx * 13, FEET - 3, 3.4, 2.6), WHITE, 0, 0, 15); pawFront(p, cx + sx * 13, FEET, 0); });
  if (o.breathFire > 0) for (let k = -1; k <= 1; k++) tongue(front, hx + k * 2, hy + 9, k * 0.3, -1, 16, 2.8, o.phase, 40 + k, true);
}

/** 背面（看到后脑勺和背） */
function drawBack(back: Pix, front: Pix, o: Pose) {
  const { cx, by, hy, legY } = faceRig(o);
  // 后层：脖子、头、焰鬃、前腿、翅膀
  render(back, new Field().cap(cx, by - 9, cx, hy + 6, 7.4, 6), WHITE, 1, 1, 2);
  band(back, cx - 6.8, by - 13, cx + 6.8, by - 13, 1.7, 1);
  headFront(back, cx, hy, 0, false, 1, true);
  for (let k = 0; k < 7; k++) tongue(back, cx - 7.5 + k * 2.5, hy + 2 + Math.abs(k - 3) * 1.2, (k - 3) * 0.3, -1, o.mane * (0.95 - Math.abs(k - 3) * 0.1), 1.9, o.phase, 20 + k);
  for (let k = 0; k < 5; k++) tongue(back, cx - 4 + k * 2, hy + 8 + k * 2.5, (k - 2) * 0.15, -1, o.mane * 0.55, 1.5, o.phase, 27 + k);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 0 : 1];
    stamp(back, (p) => { render(p, new Field().cap(cx + sx * 9, by + 2, cx + sx * 10, legY - 3 + L.y * 0.6, 4, 2.9), WHITE, 1, 1, 15); pawFront(p, cx + sx * 10, legY + L.y * 0.6, 1, true); });
  }
  wingsFB(back, cx, by, o);
  // 前层：后半身、背脊金棘、鞍背、鞍褥、髋甲、后腿、尾巴朝镜头卷
  render(front, new Field().ell(cx, by + 5, 17, 13 + o.breath * 0.4).ell(cx, by - 7, 14, 7.5), WHITE, 0, 1, 1);
  for (let k = -1; k <= 1; k++) { front.set(cx + k * 5, by - 3, GOLD[3]); front.set(cx + k * 5, by - 4, GOLD[4]); }
  render(front, new Field().cap(cx - 7, by - 10, cx + 7, by - 10, 3.6, 3.6), NAVY, 0, 0, 0);
  for (let k = -8; k <= 8; k++) front.set(cx + k, by - 13.5, k % 4 === 0 ? GOLD[4] : GOLD[3]);
  poly(front, [[cx - 9, by - 7], [cx + 9, by - 7], [cx + 10, by + 6], [cx - 10, by + 6]], (x, y) => (((x + y) % 6 === 0 || (x - y) % 6 === 0) ? NAVY[2] : NAVY[1]));
  for (let k = -10; k <= 10; k++) front.set(cx + k, by + 6, k % 2 ? GOLD[3] : GOLD[2]);
  for (let k = -7; k <= 6; k++) { front.set(cx - 9.5, by + k, GOLD[2]); front.set(cx + 9.5, by + k, GOLD[2]); }
  gem(front, cx, by, 2);
  for (const sx of [-1, 1]) { plate(front, cx + sx * 13, by + 2, 5.2, 4.4, 0, 0, true, 13); gem(front, cx + sx * 13, by + 2, 1); }
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 2 : 3];
    stamp(front, (p) => { render(p, new Field().ell(cx + sx * 12, by + 9, 6, 7).cap(cx + sx * 12, by + 11, cx + sx * 14, legY - 3 + L.y * 0.5, 4, 2.9), WHITE, 0, 1, 16); pawFront(p, cx + sx * 14, legY + L.y * 0.5, 0, true); });
  } else for (const sx of [-1, 1]) stamp(front, (p) => { render(p, new Field().ell(cx + sx * 13, by + 10, 6.5, 5.5), WHITE, 0, 1, 16); });
  // 尾巴：从身后往右下卷到镜头前，再翘起来
  const tp: [number, number][] = [];
  for (let k = 0; k <= 7; k++) { const q = k / 7; tp.push([cx + 3 + q * 24 - q * q * 8 + Math.sin(q * 3 + o.tail) * 3, by + 12 + q * 14 - q * q * 10 - (o.lying ? q * 4 : 0)]); }
  stamp(front, (p) => {
    const F = new Field();
    for (let k = 0; k < 7; k++) F.cap(tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 5.4 - k * 0.6, 5.4 - (k + 1) * 0.6);
    render(p, F, WHITE, 0, 1, 31);
    for (const k of [2, 5]) { band(p, tp[k][0] - 2.5, tp[k][1] - 2, tp[k][0] + 2.5, tp[k][1] + 2, 1); gem(p, tp[k][0], tp[k][1], 0, false); }
  });
  tongue(front, tp[7][0], tp[7][1], tp[7][0] - tp[6][0], tp[7][1] - tp[6][1] - 1, o.tailFlame * 0.9, 2.2, o.phase, 31);
  tongue(front, tp[6][0], tp[6][1] - 3, 0.3, -1, o.tailFlame * 0.5, 1.4, o.phase, 33);
  if (o.breathFire > 0) for (let k = -1; k <= 1; k++) tongue(back, cx + k * 2, hy - 6, k * 0.3, -1, 16, 2.8, o.phase, 40 + k, true);
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
  back.outlineTinted(OUT, 0.62);
  front.outlineTinted(OUT, 0.62);
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
  const pc = Math.cos(a2), ps = Math.sin(a2);
  return [[head[0] + 6 * pc - (-1.4) * ps - DR_W / 2, head[1] + 6 * ps + (-1.4) * pc - FEET]];
}
