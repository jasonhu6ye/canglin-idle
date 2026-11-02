import { mix, phash, Pix } from './pix';

/*
 * 坐骑「圣辉白龙」（用户 11-02 给的参考图）：珍珠白的西方龙，金色符文甲（胸甲、肩甲、护腿、鞍具），镶着蓝水晶，
 * 头顶金色的冠角、额头一颗蓝晶、眼睛发蓝光，脑后和脖颈一道蓝色的焰鬃，翼尖和尾巴尖燃着蓝焰。
 * 全部逐像素画，帧 96×84（比狼大），脚底在第 82 行；每帧分「后层」「前层」两张，骑手夹在中间：
 *   侧面：两只翅膀、远侧腿、尾巴在后层，身体、近侧腿、头在前层（骑手画在整只龙前面）
 *   正面：翅膀、身体、鞍、后腿、尾巴在后层，脖子、头、前腿、胸甲在前层
 *   背面：头、脖子、翅膀、前腿在后层，后半身、鞍背、后腿、尾巴在前层
 * 动作：奔跑（跑起来翅膀扇、焰鬃往后飘）、待机（呼吸、翅膀微动、尾巴摆）、趴下（主角干活时）、召唤（人立起来展翅仰天喷蓝焰）。
 */

export const DR_W = 96;
export const DR_H = 84;
export const DR_FEET = 82;
const FEET = DR_FEET;
const TAU = Math.PI * 2;

const WHITE = ['#5a5e8e', '#8c92bc', '#bcc2e0', '#e2e6f6', '#fbfcff'];
const GOLD = ['#5a3608', '#9c6a14', '#d8a22a', '#f2cc52', '#fff2b0'];
const CRY = ['#1448a0', '#2488e8', '#58ccff', '#b4f0ff', '#ffffff'];
const NAVY = ['#141832', '#232a52', '#343c70', '#4a5494', '#6a74b4'];
const FLAME = ['#1c58c0', '#2a94f0', '#50d8ff', '#a8f4ff', '#f0ffff'];
const CLAW = ['#8a90a8', '#d8dce8'];
const EYE = '#40d8ff';
const EYE_HI = '#e8ffff';
const OUT = '#141430';

/** 明暗：左上亮，右下暗 */
function shade(R: string[], nx: number, ny: number, dim = 0) {
  const s = -nx * 0.5 - ny * 0.7 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5;
  const i = s > 0.8 ? 4 : s > 0.45 ? 3 : s > 0.05 ? 2 : s > -0.35 ? 1 : 0;
  return R[Math.max(0, Math.min(R.length - 1, i - dim))];
}

/** 光滑的椭球（鳞片质感：隔几格一道淡淡的弧线） */
function ball(p: Pix, cx: number, cy: number, rx: number, ry: number, R: string[], dim = 0, scale = true, seed = 0) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      let c = shade(R, nx, ny, dim);
      if (scale && ((x + y * 2 + seed) % 5 === 0) && nx * nx + ny * ny < 0.8 && phash(x, y, seed) < 0.6) c = R[Math.max(0, R.indexOf(c) - 1)];
      p.set(x, y, c);
    }
  }
}

/** 粗细渐变的肢体、脖子或尾巴 */
function limb(p: Pix, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, R: string[], dim = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const rm = Math.max(r0, r1);
  for (let y = Math.floor(Math.min(y0, y1) - rm); y <= Math.ceil(Math.max(y0, y1) + rm); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - rm); x <= Math.ceil(Math.max(x0, x1) + rm); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
      const r = r0 + (r1 - r0) * t;
      const ex = px - (x0 + dx * t);
      const ey = py - (y0 + dy * t);
      if (ex * ex + ey * ey > r * r) continue;
      p.set(x, y, shade(R, ex / r, ey / r, dim));
    }
  }
}

/** 多边形填充，颜色按 (x,y) 算 */
function poly(p: Pix, pts: [number, number][], col: (x: number, y: number) => string | null) {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let c = false;
      for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
        if ((ys[k] > py) !== (ys[j] > py) && px < ((xs[j] - xs[k]) * (py - ys[k])) / (ys[j] - ys[k]) + xs[k]) c = !c;
      }
      if (!c) continue;
      const v = col(x, y);
      if (v) p.set(x, y, v);
    }
  }
}

/** 两节骨头的反向运动学：已知根部和末端，求中间关节；forward = 关节往前（+x）凸 */
function ik(hx: number, hy: number, fx: number, fy: number, L1: number, L2: number, forward: boolean): [number, number, number, number] {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a = forward ? base - A : base + A;
  return [hx + Math.cos(a) * L1, hy + Math.sin(a) * L1, hx + dx, hy + dy];
}

/** 把一部分单独画好、描一圈深色边再盖上去，和同色的身体分得开；minY 以上（贴着身体的根部）不描边 */
function stamp(dst: Pix, minY: number, draw: (p: Pix) => void) {
  const tmp = new Pix(dst.w, dst.h);
  draw(tmp);
  const body = tmp.data.slice();
  tmp.outlineTinted(OUT, 0.7);
  for (let i = 0; i < tmp.data.length; i++) {
    const c = tmp.data[i];
    if (!c) continue;
    if (!body[i] && Math.floor(i / dst.w) < minY) continue;
    dst.data[i] = c;
  }
}

/** 一颗蓝水晶：菱形，左上亮 */
function gem(p: Pix, x: number, y: number, r: number) {
  for (let dy = -r; dy <= r; dy++) {
    const hw = r - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) p.set(x + dx, y + dy, dx + dy < -r * 0.6 ? CRY[4] : dx + dy < 0 ? CRY[3] : dx + dy < r * 0.5 ? CRY[2] : CRY[1]);
  }
  // 周围一圈金托
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    const hw = r + 1 - Math.abs(dy);
    for (let dx = -hw; dx <= hw; dx++) if (Math.abs(dx) + Math.abs(dy) === r + 1) p.set(x + dx, y + dy, dy < 0 ? GOLD[3] : GOLD[1]);
  }
}

/** 蓝色火舌：从 (x0,y0) 朝 (dx,dy) 方向烧 len 长，w 根部半宽，phase 让它一跳一跳；只填空像素，不盖住身体 */
function tongue(p: Pix, x0: number, y0: number, dx: number, dy: number, len: number, w: number, phase: number, salt: number, over = false) {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const px = -uy, py = ux;
  const L = len * (0.75 + 0.25 * Math.sin(phase * TAU * 2 + salt * 1.7));
  for (let s = 0; s <= L; s += 0.5) {
    const f = s / L;
    const ww = w * Math.pow(1 - f, 0.75) + 0.3;
    const wig = Math.sin(s * 0.9 - phase * TAU * 3 + salt) * 0.9 * f;
    const cx = x0 + ux * s + px * wig;
    const cy = y0 + uy * s + py * wig;
    const c = f < 0.15 ? FLAME[4] : f < 0.35 ? FLAME[3] : f < 0.6 ? FLAME[2] : f < 0.82 ? FLAME[1] : FLAME[0];
    for (let d = -ww; d <= ww; d += 0.5) {
      const x = cx + px * d, y = cy + py * d;
      const edge = Math.abs(d) > ww - 0.6 && f > 0.25;
      const col = edge ? FLAME[Math.max(0, FLAME.indexOf(c) - 1)] : c;
      if (over || !p.get(Math.round(x), Math.round(y))) p.set(x, y, col);
    }
  }
  // 火尖断开飘走的一点
  const u = (phase * 2 + salt * 0.37) % 1;
  const tx = x0 + ux * (L + 1.5 + u * 3), ty = y0 + uy * (L + 1.5 + u * 3);
  if (over || !p.get(Math.round(tx), Math.round(ty))) p.set(tx, ty, u < 0.5 ? FLAME[3] : FLAME[2]);
}

/** 爪子：掌心加三根银白的趾甲；金色护腿套在脚踝上，镶一颗小蓝晶 */
function paw(p: Pix, x: number, y: number, dir: number, dim: number, armor = true) {
  ball(p, x + dir * 0.6, y - 0.8, 2.6, 1.7, WHITE, dim, false);
  for (let k = 0; k < 3; k++) p.set(x + dir * 2.2 + (k - 1) * (dir === 0 ? 1.3 : 0.4), y + (dir === 0 ? 0.8 : 0.3 - k * 0.7), k === 1 ? CLAW[1] : CLAW[0]);
  if (!armor) return;
  for (let dy = -5; dy <= -2.5; dy++) for (let dx = -2.4; dx <= 2.4; dx++) p.paint(x + dx, y + dy, dx < -1.2 ? GOLD[3] : dx < 1 ? GOLD[2] : GOLD[1]);
  for (let dx = -2.6; dx <= 2.6; dx++) { p.paint(x + dx, y - 5.5, GOLD[4]); p.paint(x + dx, y - 2, GOLD[0]); }
  p.paint(x, y - 3.8, CRY[3]);
  p.paint(x + 0.6, y - 3.2, CRY[1]);
}

/** 前腿（侧面）：肩 → 肘（往后凸）→ 腕 → 爪 */
function foreLeg(p: Pix, sx: number, sy: number, px: number, py: number, fold: number, dim: number) {
  const vx = 1 + (-3.4 - 1) * fold;
  const vy = 3.6 + (1.0 - 3.6) * fold;
  const [ex, ey, cx, cy] = ik(sx, sy, px - vx, py - vy, 9.5, 8.5, false);
  limb(p, sx, sy, ex, ey, 3.8, 2.6, WHITE, dim);
  limb(p, ex, ey, cx, cy, 2.6, 2.1, WHITE, dim);
  limb(p, cx, cy, cx + vx, cy + vy, 2.1, 1.9, WHITE, dim);
  paw(p, cx + vx, cy + vy, 1, dim);
}

/** 后腿（侧面）：髋 → 膝（往前凸）→ 跗 → 爪 */
function hindLeg(p: Pix, hx: number, hy: number, px: number, py: number, push: number, dim: number) {
  const vx = 2.2 + (-2.4 - 2.2) * push;
  const vy = 5.6 + (4.4 - 5.6) * push;
  const [kx, ky, jx, jy] = ik(hx, hy, px - vx, py - vy, 9, 8.5, true);
  ball(p, hx + (kx - hx) * 0.35, hy + (ky - hy) * 0.35, 4.8, 5.2, WHITE, dim);
  limb(p, kx, ky, jx, jy, 2.9, 2.1, WHITE, dim);
  limb(p, jx, jy, jx + vx, jy + vy, 2.1, 1.8, WHITE, dim);
  paw(p, jx + vx, jy + vy, 1, dim);
}

/**
 * 翅膀：root 翅根，ang 整只翅膀绕翅根转的角度（弧度，0 = 竖直向上偏后），spread 0 收拢 1 完全张开，
 * dir 1 朝右的侧面（翅膀往左后方伸），-1 镜像；dim 远侧翅膀暗一号。
 * 骨架：翅根 → 肘（上臂）→ 四根指骨呈扇形，指间蒙着白膜，膜上透着淡淡的蓝；指尖燃着蓝焰（由 flame 决定长短）
 */
function wing(p: Pix, rx: number, ry: number, ang: number, spread: number, dir: number, dim: number, flame: number, phase: number, salt: number, span = 1) {
  const rot = (x: number, y: number): [number, number] => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [rx + (x * c - y * s) * dir * span, ry + (x * s + y * c)];
  };
  // 上臂到肘：往上往后
  const elbow = rot(-12, -22);
  // 指尖：从上往下扇开
  const open = 0.35 + 0.65 * spread;
  const tips: [number, number][] = [
    rot(-26 * open - 4, -30 * open - 2),
    rot(-34 * open - 2, -14 * open + 2),
    rot(-34 * open, 2 * open + 6),
    rot(-26 * open + 2, 14 * open + 8),
  ];
  const wristBase = rot(-8, -4);
  // 膜：相邻指尖和肘之间一片片，越靠外越透蓝
  const memb = (a: [number, number], b: [number, number], c: [number, number], k: number) => {
    poly(p, [a, b, c], (x, y) => {
      const d = Math.hypot(x - elbow[0], y - elbow[1]) / 34;
      const vein = phash(x, y, salt + k) < 0.05;
      const i = d > 0.85 ? 4 : d > 0.55 ? 3 : d > 0.25 ? 2 : 1;
      return vein ? CRY[2] : WHITE[Math.max(0, i - dim)];
    });
    // 膜的外缘：两指尖之间微微内凹的一条边，描一道蓝边
    const n = 14;
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const sag = Math.sin(t * Math.PI) * 3;
      const x = a[0] + (b[0] - a[0]) * t + (elbow[0] - (a[0] + b[0]) / 2) * (sag / 20);
      const y = a[1] + (b[1] - a[1]) * t + (elbow[1] - (a[1] + b[1]) / 2) * (sag / 20);
      p.set(x, y, dim ? CRY[1] : CRY[2]);
    }
  };
  for (let k = 0; k < tips.length - 1; k++) memb(tips[k], tips[k + 1], elbow, k);
  // 肘到翅根之间也有一片膜
  poly(p, [elbow, tips[tips.length - 1], rot(-2, 4), rot(2, -2)], () => WHITE[Math.max(0, 2 - dim)]);
  // 骨头：金色镶边的骨架
  limb(p, rx, ry, elbow[0], elbow[1], 3, 2.2, GOLD, dim);
  for (const t of tips) limb(p, elbow[0], elbow[1], t[0], t[1], 1.8, 0.8, GOLD, dim);
  limb(p, wristBase[0], wristBase[1], elbow[0], elbow[1], 1.5, 1.5, GOLD, dim);
  // 肘上的蓝晶和翅根的金扣
  gem(p, elbow[0], elbow[1], 1);
  // 指尖和外缘燃着蓝焰
  if (flame > 0) {
    for (let k = 0; k < tips.length; k++) {
      const t = tips[k];
      const ox = t[0] - elbow[0], oy = t[1] - elbow[1];
      tongue(p, t[0], t[1], ox, oy, flame * (k === 0 ? 1.2 : 0.9), 1.4, phase, salt + k * 3);
    }
  }
}

/** 焰鬃：从脑后沿着脖子背面往后飘的几条蓝火 */
function mane(p: Pix, pts: [number, number][], back: number, len: number, phase: number, over = false) {
  pts.forEach(([x, y], k) => tongue(p, x, y, -0.8 - back, -1 + k * 0.25, len * (1.3 - k * 0.14), 2.8 - k * 0.25, phase, 20 + k, over));
}

/** 一根弯角：从 (x,y) 按角度 a 出发，边走边转 curl，粗到细 */
function horn(p: Pix, at: (x: number, y: number) => [number, number], x: number, y: number, a: number, len: number, curl: number, r: number, dim = 0) {
  let cx = x, cy = y, ca = a;
  const n = 5;
  for (let k = 0; k < n; k++) {
    const nx = cx + Math.cos(ca) * (len / n), ny = cy + Math.sin(ca) * (len / n);
    const a0 = at(cx, cy), a1 = at(nx, ny);
    limb(p, a0[0], a0[1], a1[0], a1[1], r * (1 - k / n) + 0.5, r * (1 - (k + 1) / n) + 0.5, GOLD, dim);
    cx = nx; cy = ny; ca += curl / n;
  }
  const t = at(cx, cy);
  p.set(t[0], t[1], GOLD[4]);
}

/** 头（侧面，朝右）：长吻、金冠角、额头蓝晶、蓝眼；mouth 0-1 张嘴，pitch 抬头的角度 */
function headSide(p: Pix, hx: number, hy: number, pitch: number, mouth: number, blink: boolean, dim = 0) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const at = (x: number, y: number): [number, number] => [hx + x * c - y * s, hy + x * s + y * c];
  // 冠角：三根往后再往上弯的金角，像一顶王冠；下面一根短的颊角
  horn(p, at, -4, -1, Math.PI + 0.35, 15, -0.9, 2.4, dim);
  horn(p, at, -2, -4, Math.PI + 0.7, 14, -0.9, 2.1, dim);
  horn(p, at, 1, -6, Math.PI + 1.1, 12, -0.9, 1.8, dim);
  horn(p, at, -5, 2, Math.PI + 0.05, 8, -0.5, 1.5, dim);
  // 颅骨和吻
  ball(p, hx, hy, 6.5, 5.5, WHITE, dim, false);
  const sn = at(9, 1.5);
  limb(p, hx + 1, hy, sn[0], sn[1], 4.3, 2.6, WHITE, dim);
  // 鼻孔和吻上的小角
  const nz = at(11, 0.2);
  p.set(nz[0], nz[1], WHITE[0]);
  const nh = at(8, -3.5);
  limb(p, nh[0], nh[1] + 1, nh[0] + 1, nh[1] - 2, 1.2, 0.4, GOLD, dim);
  // 下颌（张嘴时往下开）
  const j0 = at(2, 3), j1 = at(10, 4 + mouth * 4);
  limb(p, j0[0], j0[1], j1[0], j1[1], 2.4, 1.4, WHITE, dim + 1);
  if (mouth > 0.2) {
    // 嘴里：暗的口腔和几颗牙
    const m0 = at(4, 3.2), m1 = at(10.5, 2.4 + mouth * 2.2);
    limb(p, m0[0], m0[1], m1[0], m1[1], 1.2 + mouth * 1.2, 0.5, [NAVY[0], NAVY[0], NAVY[1], NAVY[1], NAVY[1]], 0);
    for (let k = 0; k < 3; k++) { const t = at(6 + k * 1.8, 2.6); p.set(t[0], t[1], CLAW[1]); }
  }
  // 脸颊的金甲和额头的蓝晶
  const ch = at(-2, 1);
  limb(p, ch[0] - 2, ch[1] - 2, ch[0] + 3, ch[1] + 3, 1.6, 1, GOLD, dim);
  const fg = at(1, -3.5);
  gem(p, fg[0], fg[1], 1);
  // 眼睛：蓝光
  const e = at(3.5, -1.2);
  if (blink) { p.set(e[0], e[1], WHITE[0]); p.set(e[0] + 1, e[1], WHITE[0]); p.set(e[0] + 2, e[1], WHITE[0]); }
  else {
    for (const [dx, dy] of [[-1, 0], [3, 0], [1, -2], [1, 1]]) p.paint(e[0] + dx, e[1] + dy, CRY[1]);
    p.set(e[0], e[1], EYE); p.set(e[0] + 1, e[1], EYE_HI); p.set(e[0] + 2, e[1], EYE); p.set(e[0], e[1] - 1, EYE_HI); p.set(e[0] + 1, e[1] - 1, EYE_HI); p.set(e[0] + 2, e[1] - 1, EYE);
    p.set(e[0] - 1, e[1] - 1, WHITE[0]); p.set(e[0] + 3, e[1] - 1, WHITE[0]); p.set(e[0], e[1] - 2, WHITE[0]); p.set(e[0] + 1, e[1] - 2, WHITE[0]);
  }
}

/** 一帧的姿势 */
interface Pose {
  /** 离地（召唤时人立起来身体抬高） */
  rise: number;
  /** 身体前倾（正数头抬高尾巴低） */
  tilt: number;
  /** 呼吸 */
  breath: number;
  /** 四条腿：近前、远前、近后、远后的脚相对站位的位移 (dx, dy) 和折/蹬程度 */
  legs: { x: number; y: number; k: number }[];
  /** 翅膀角度与张开程度 */
  wingAng: number;
  spread: number;
  /** 尾巴摆动 */
  tail: number;
  /** 头的俯仰、张嘴、眨眼 */
  pitch: number;
  mouth: number;
  blink: boolean;
  /** 焰鬃长度、翼尖火焰、尾焰 */
  mane: number;
  flame: number;
  tailFlame: number;
  phase: number;
  /** 趴着 */
  lying: boolean;
  /** 召唤时朝天喷的火 */
  breathFire: number;
  /** 焰鬃往后飘的程度 */
  back: number;
}

const flick = (i: number) => 0.8 + 0.2 * Math.sin(i * 2.7) + 0.15 * Math.sin(i * 7.3 + 1);

/** 奔跑：四条腿按马的奔跑顺序，翅膀一个周期扇一下 */
function run(t: number, i: number): Pose {
  const leg = (ph: number, stride: number, lift: number) => {
    const a = ((t + ph) % 1) * TAU;
    return { x: Math.cos(a) * stride, y: -Math.max(0, Math.sin(a)) * lift, k: Math.max(0, Math.sin(a)) };
  };
  const bounce = Math.sin(t * TAU) * 1.4;
  return {
    rise: 2 + bounce, tilt: 0.05 + Math.sin(t * TAU) * 0.04, breath: 0,
    legs: [leg(0, 6, 7), leg(0.15, 6, 7), leg(0.55, 6.5, 8), leg(0.7, 6.5, 8)],
    wingAng: -0.25 + Math.sin(t * TAU + 0.6) * 0.5, spread: 0.85 + Math.sin(t * TAU + 0.6) * 0.15,
    tail: Math.sin(t * TAU) * 0.8, pitch: 0.12, mouth: 0.15 + 0.15 * Math.sin(t * TAU), blink: false,
    mane: 11, flame: 9 + Math.sin(t * TAU * 2) * 1.5, tailFlame: 10, phase: t, lying: false, breathFire: 0, back: 1,
  };
}
function idle(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: 0, tilt: 0, breath: br,
    legs: [{ x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }],
    wingAng: 0.1 + br * 0.06, spread: 0.75 + br * 0.08,
    tail: br * 0.5, pitch: 0.18 + Math.sin(t * TAU) * 0.05, mouth: 0, blink: i === 15 || i === 16,
    mane: 7 + br, flame: 5 + flick(i) * 2, tailFlame: 6, phase: t, lying: false, breathFire: 0, back: 0.35,
  };
}
function sit(t: number, i: number): Pose {
  const br = Math.sin(t * TAU);
  return {
    rise: -9, tilt: -0.04, breath: br * 0.5,
    legs: [{ x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }],
    wingAng: 0.35, spread: 0.1,
    tail: br * 0.3, pitch: -0.1 + br * 0.03, mouth: 0, blink: i % 16 < 10,
    mane: 4 + br * 0.5, flame: 2.5 + flick(i), tailFlame: 3.5, phase: t, lying: true, breathFire: 0, back: 0.2,
  };
}
/** 召唤：前腿抬起人立、翅膀猛地张开、仰头朝天喷一道蓝焰，再落回地上 */
function howl(t: number, i: number): Pose {
  const up = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.5) : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
  const roar = t > 0.25 && t < 0.72;
  return {
    rise: 0, tilt: 0.55 * up, breath: 0,
    legs: [{ x: 6 * up, y: -12 * up, k: up }, { x: 4 * up, y: -11 * up, k: up }, { x: 0, y: 0, k: 0 }, { x: 0, y: 0, k: 0 }],
    wingAng: 0.1 - up * 0.65 + Math.sin(t * TAU * 2) * 0.1 * up, spread: 0.5 + up * 0.5,
    tail: Math.sin(t * TAU * 2) * 0.6, pitch: 0.2 + up * 0.75, mouth: roar ? 1 : 0.3 * up, blink: false,
    mane: 8 + up * 6, flame: 6 + up * 7, tailFlame: 6 + up * 6, phase: t, lying: false, breathFire: roar ? 1 : 0, back: 0.5 + up * 0.5,
  };
}

const poseOf = (key: string, t: number, i: number) => (key.startsWith('run') ? run(t, i) : key.startsWith('idle') ? idle(t, i) : key === 'sit' ? sit(t, i) : howl(t, i));

/** 侧面（朝右） */
function drawSide(back: Pix, front: Pix, o: Pose) {
  // 身体几何：以髋为轴，tilt 让前半身抬起来
  const hipX = 34, hipY = FEET - 21 - o.rise + (o.lying ? 0 : 0);
  const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
  const at = (x: number, y: number): [number, number] => [hipX + x * c + y * s, hipY - x * s + y * c];
  const bodyC = at(13, 0);
  const chest = at(24, 2);
  const shoulder = at(23, 4);
  const neck0 = at(27, -4);
  const neck1 = at(36, -15);
  const head = at(40, -22 + o.breath * 0.3);
  const wingRoot = at(12, -7);
  // ---- 后层：远侧翅膀、远侧腿、尾巴、近侧翅膀 ----
  const legY = FEET;
  wing(back, wingRoot[0] - 5, wingRoot[1] + 2, o.wingAng + 0.25, o.spread, 1, 1, o.flame * 0.8, o.phase, 7, 1.0);
  if (!o.lying) {
    stamp(back, 0, (p) => hindLeg(p, hipX - 4, hipY + 3, hipX - 2 + o.legs[3].x, legY + o.legs[3].y, o.legs[3].k, 1));
    stamp(back, 0, (p) => foreLeg(p, shoulder[0] - 4, shoulder[1] + 1, shoulder[0] - 1 + o.legs[1].x, legY + o.legs[1].y, o.legs[1].k, 1));
  }
  // 尾巴：从髋后往后再往上翘，尾尖燃蓝焰
  const tailPts: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const q = k / 6;
    const tx = hipX - 6 - q * 26 - (o.lying ? q * 4 : 0);
    const ty = hipY + 4 + Math.sin(q * 2.2) * 8 - q * q * (o.lying ? 2 : 10) + Math.sin(q * 3 + o.tail) * 3 * q;
    tailPts.push([tx, ty]);
  }
  for (let k = 0; k < 6; k++) limb(back, tailPts[k][0], tailPts[k][1], tailPts[k + 1][0], tailPts[k + 1][1], 4.6 - k * 0.6, 4 - k * 0.6, WHITE, 0);
  // 尾巴上的金环和尾焰
  for (const k of [2, 4]) { const [x, y] = tailPts[k]; limb(back, x - 2.5, y - 3, x + 2.5, y + 3, 1, 1, GOLD, 0); gem(back, x, y, 0); }
  const tip = tailPts[6];
  const dirx = tip[0] - tailPts[5][0], diry = tip[1] - tailPts[5][1];
  tongue(back, tip[0], tip[1], dirx, diry, o.tailFlame, 2.2, o.phase, 31);
  tongue(back, tip[0] + 1, tip[1] - 2, dirx * 0.5, diry - 2, o.tailFlame * 0.6, 1.4, o.phase, 33);
  wing(back, wingRoot[0], wingRoot[1], o.wingAng, o.spread, 1, 0, o.flame, o.phase, 3, 1.15);
  // ---- 前层：身体、鞍、胸甲、脖子、头、近侧腿 ----
  ball(front, bodyC[0], bodyC[1], 18, 10.5 + o.breath * 0.4, WHITE, 0, true, 1);
  ball(front, chest[0], chest[1], 9, 8.5, WHITE, 0, true, 2);
  ball(front, hipX, hipY, 8.5, 8.5, WHITE, 0, true, 3);
  // 肚子的深蓝甲片
  for (let k = -3; k <= 3; k++) {
    const q = at(13 + k * 4.5, 7.5);
    limb(front, q[0] - 2, q[1] + 1.5, q[0] + 2, q[1] + 1.5, 1.8, 1.8, NAVY, 0);
  }
  // 鞍：深蓝垫子、金边、挂着的蓝晶坠
  const sd0 = at(6, -8.5), sd1 = at(19, -8.5);
  limb(front, sd0[0], sd0[1], sd1[0], sd1[1], 4, 4, NAVY, 0);
  for (let k = 0; k <= 12; k++) { const q = at(6 + k, -12.2); front.set(q[0], q[1], k % 3 ? GOLD[3] : GOLD[2]); }
  for (let k = 0; k <= 3; k++) { const q = at(13, -9 + k * 2.6); front.set(q[0], q[1], GOLD[2]); }
  const sg = at(13, -4);
  // 鞍两侧垂下的深蓝鞍褥，金边，底下挂着蓝晶坠；前面一个金脚蹬
  poly(front, [at(5, -7), at(21, -7), at(20, 3), at(6, 3)], (x, y) => ((x + y) % 7 === 0 ? NAVY[2] : NAVY[1]));
  for (let k = 0; k <= 15; k++) { const q = at(5 + k, 3); front.set(q[0], q[1], k % 2 ? GOLD[3] : GOLD[2]); }
  for (let k = 0; k <= 10; k++) { const a = at(5, -7 + k), b = at(21, -7 + k); front.set(a[0], a[1], GOLD[2]); front.set(b[0], b[1], GOLD[2]); }
  gem(front, sg[0], sg[1] + 2, 1);
  const pd = at(13, 6);
  front.set(pd[0], pd[1] - 1, GOLD[3]);
  gem(front, pd[0], pd[1] + 1, 1);
  const st = at(23, 1);
  limb(front, st[0], st[1] - 4, st[0], st[1], 0.8, 0.8, GOLD, 0);
  limb(front, st[0] - 2, st[1] + 1, st[0] + 2, st[1] + 1, 1.3, 1.3, GOLD, 0);
  // 肩甲、髋甲：金色带蓝晶
  const sh = at(22, -3);
  ball(front, sh[0], sh[1], 5, 4, GOLD, 0, false);
  gem(front, sh[0], sh[1], 1);
  const hp = at(2, -3);
  ball(front, hp[0], hp[1], 4.5, 3.8, GOLD, 0, false);
  gem(front, hp[0], hp[1], 1);
  // 胸甲：金色，正中一颗大蓝晶
  const cp = at(27, 5);
  ball(front, cp[0], cp[1], 5.5, 6, GOLD, 0, false);
  gem(front, cp[0], cp[1], 2);
  // 脖子和头
  limb(front, neck0[0], neck0[1], neck1[0], neck1[1], 6.5, 5, WHITE, 0);
  limb(front, neck1[0], neck1[1], head[0], head[1], 5, 4.3, WHITE, 0);
  // 脖子的金项圈
  const nc = at(31, -9);
  limb(front, nc[0] - 3, nc[1] + 4, nc[0] + 4, nc[1] - 3, 1.6, 1.6, GOLD, 0);
  gem(front, nc[0] + 0.5, nc[1] + 0.5, 1);
  headSide(front, head[0], head[1], -o.pitch, o.mouth, o.blink);
  // 近侧腿
  if (!o.lying) {
    stamp(front, 0, (p) => hindLeg(p, hipX + 1, hipY + 3, hipX + 3 + o.legs[2].x, legY + o.legs[2].y, o.legs[2].k, 0));
    stamp(front, 0, (p) => foreLeg(p, shoulder[0] + 1, shoulder[1] + 1, shoulder[0] + 4 + o.legs[0].x, legY + o.legs[0].y, o.legs[0].k, 0));
  } else {
    // 趴着：前腿往前伸平、后腿折在身下
    const fl = at(26, 8);
    limb(front, fl[0], fl[1], fl[0] + 11, FEET - 1.5, 3, 2.2, WHITE, 0);
    paw(front, fl[0] + 12, FEET, 1, 0);
    limb(front, hipX, hipY + 5, hipX + 7, FEET - 1.5, 3.5, 2.2, WHITE, 0);
    paw(front, hipX + 8, FEET, 1, 0);
  }
  // 焰鬃：脑后到脖子背面，画在后层（从头和脖子后面冒出来）
  const mn: [number, number][] = [];
  for (let k = 0; k < 6; k++) { const q = at(32 - k * 2.6, -14 + k * 2.2); mn.push(q); }
  mane(back, mn, o.back, o.mane * 2, o.phase, true);
  // 召唤时朝天喷的蓝焰
  if (o.breathFire > 0) {
    const m = [head[0] + 12 * Math.cos(-o.pitch) + 2, head[1] + 12 * Math.sin(-o.pitch) + 2];
    for (let k = 0; k < 3; k++) tongue(front, m[0], m[1], Math.cos(-o.pitch - 0.2 + k * 0.2), Math.sin(-o.pitch - 0.2 + k * 0.2), 16 - k * 2, 3 - k * 0.5, o.phase, 40 + k, true);
  }
}

/** 正面（朝镜头） */
function drawFront(back: Pix, front: Pix, o: Pose) {
  const cx = 48;
  const by = FEET - 20 - o.rise;
  const legY = FEET;
  // 后层：翅膀、尾巴、身体、鞍、后腿
  const wr = by - 6;
  const wa = -0.9 + o.wingAng * 0.6;
  wing(back, cx - 9, wr, wa, o.spread, -1, 0, o.flame, o.phase, 3, 1.1);
  wing(back, cx + 9, wr, wa, o.spread, 1, 0, o.flame, o.phase, 5, 1.1);
  // 尾巴从身后右侧卷出来
  const tp: [number, number][] = [];
  for (let k = 0; k <= 5; k++) { const q = k / 5; tp.push([cx + 10 + q * 14 + Math.sin(q * 3 + o.tail) * 2, by + 8 - q * 12 - Math.sin(q * 2.5) * 4]); }
  for (let k = 0; k < 5; k++) limb(back, tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 3.6 - k * 0.5, 3.1 - k * 0.5, WHITE, 1);
  tongue(back, tp[5][0], tp[5][1], 0.3, -1, o.tailFlame * 0.8, 1.8, o.phase, 31);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 3 : 2];
    stamp(back, 0, (p) => { limb(p, cx + sx * 9, by + 6, cx + sx * 11, legY - 1 + L.y * 0.5, 3.4, 2.4, WHITE, 1); paw(p, cx + sx * 11, legY + L.y * 0.5, 0, 1); });
  }
  ball(back, cx, by + 2, 16, 12 + o.breath * 0.4, WHITE, 0, true, 1);
  ball(back, cx, by - 7, 13, 6.5, WHITE, 0, true, 2);
  // 鞍（骑手坐在上面）
  limb(back, cx - 6, by - 9, cx + 6, by - 9, 3.5, 3.5, NAVY, 0);
  for (let k = -7; k <= 7; k++) back.set(cx + k, by - 12.5, k % 3 ? GOLD[3] : GOLD[2]);
  // 前层：脖子、头、前腿、胸甲
  const hy = by - 22 - o.tilt * 4;
  limb(front, cx, by - 6, cx, hy + 4, 6.5, 5, WHITE, 0);
  // 项圈
  limb(front, cx - 5, by - 10, cx + 5, by - 10, 1.6, 1.6, GOLD, 0);
  gem(front, cx, by - 10, 1);
  // 头：颅骨、吻朝镜头、冠角往上外掠、额头蓝晶、双眼
  const atF = (x: number, y: number): [number, number] => [cx + x, hy + y];
  horn(front, atF, -3, -4, -Math.PI * 0.72, 14, -0.5, 2.2);
  horn(front, atF, 3, -4, -Math.PI * 0.28, 14, 0.5, 2.2);
  horn(front, atF, -1, -6, -Math.PI * 0.62, 12, -0.4, 1.8);
  horn(front, atF, 1, -6, -Math.PI * 0.38, 12, 0.4, 1.8);
  horn(front, atF, 0, -6, -Math.PI * 0.5, 12, 0, 1.6);
  ball(front, cx, hy, 7.5, 6.5, WHITE, 0, false);
  ball(front, cx, hy + 4.5, 5, 3.8, WHITE, 0, false);
  for (const sx of [-1, 1]) front.set(cx + sx * 1.5, hy + 6, WHITE[0]);
  if (o.mouth > 0.2) { limb(front, cx - 3, hy + 7, cx + 3, hy + 7, 1 + o.mouth, 1 + o.mouth, [NAVY[0], NAVY[0], NAVY[1], NAVY[1], NAVY[1]], 0); for (const sx of [-2, 0, 2]) front.set(cx + sx, hy + 6, CLAW[1]); }
  gem(front, cx, hy - 3, 1);
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 3.5, ey = hy - 0.5;
    if (o.blink) { front.set(ex, ey, WHITE[0]); front.set(ex + sx, ey, WHITE[0]); }
    else { front.set(ex, ey, EYE); front.set(ex + sx, ey, EYE); front.set(ex, ey - 1, EYE_HI); front.set(ex + sx, ey - 1, EYE); front.set(ex - sx, ey - 1, WHITE[0]); }
  }
  // 焰鬃从头两侧往后飘（正面看是从头后面冒出来的）
  for (let k = 0; k < 4; k++) tongue(front, cx - 6 + k * 4, hy - 4, (k - 1.5) * 0.5, -1, o.mane * 0.6, 1.3, o.phase, 20 + k);
  // 胸甲
  ball(front, cx, by - 1, 7, 6, GOLD, 0, false);
  gem(front, cx, by - 1, 2);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 1 : 0];
    stamp(front, 0, (p) => { limb(p, cx + sx * 7, by + 2, cx + sx * 8, legY - 1 + L.y * 0.6, 3.4, 2.4, WHITE, 0); paw(p, cx + sx * 8, legY + L.y * 0.6, 0, 0); });
  } else for (const sx of [-1, 1]) { limb(front, cx + sx * 7, by + 4, cx + sx * 10, FEET - 1.5, 3, 2.2, WHITE, 0); paw(front, cx + sx * 10, FEET, 0, 0); }
  if (o.breathFire > 0) for (let k = -1; k <= 1; k++) tongue(front, cx + k * 2, hy + 6, k * 0.3, -1, 14, 2.6, o.phase, 40 + k, true);
}

/** 背面（看到后脑勺和背） */
function drawBack(back: Pix, front: Pix, o: Pose) {
  const cx = 48;
  const by = FEET - 20 - o.rise;
  const legY = FEET;
  const hy = by - 22 - o.tilt * 4;
  // 后层：头、脖子、前腿、翅膀
  limb(back, cx, by - 6, cx, hy + 4, 6.5, 5, WHITE, 0);
  limb(back, cx - 5, by - 10, cx + 5, by - 10, 1.6, 1.6, GOLD, 0);
  ball(back, cx, hy, 7.5, 6.5, WHITE, 1, false);
  // 冠角从脑后往上掠（背面看得最清楚）
  const atB = (x: number, y: number): [number, number] => [cx + x, hy + y];
  horn(back, atB, -3, -3, -Math.PI * 0.75, 16, -0.5, 2.4);
  horn(back, atB, 3, -3, -Math.PI * 0.25, 16, 0.5, 2.4);
  horn(back, atB, -1, -4, -Math.PI * 0.62, 14, -0.4, 2);
  horn(back, atB, 1, -4, -Math.PI * 0.38, 14, 0.4, 2);
  horn(back, atB, 0, -5, -Math.PI * 0.5, 13, 0, 1.8);
  horn(back, atB, -4, 1, Math.PI * 0.9, 10, -0.6, 1.6);
  horn(back, atB, 4, 1, Math.PI * 0.1, 10, 0.6, 1.6);
  for (let k = 0; k < 5; k++) tongue(back, cx - 6 + k * 3, hy + 1 + Math.abs(k - 2) * 1.5, (k - 2) * 0.35, -1, o.mane * 0.8, 1.6, o.phase, 20 + k);
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 0 : 1];
    stamp(back, 0, (p) => { limb(p, cx + sx * 7, by + 2, cx + sx * 8, legY - 1 + L.y * 0.6, 3.4, 2.4, WHITE, 1); paw(p, cx + sx * 8, legY + L.y * 0.6, 0, 1); });
  }
  const wa = -0.9 + o.wingAng * 0.6;
  wing(back, cx - 9, by - 6, wa, o.spread, -1, 0, o.flame, o.phase, 3, 1.1);
  wing(back, cx + 9, by - 6, wa, o.spread, 1, 0, o.flame, o.phase, 5, 1.1);
  // 前层：后半身、鞍背、后腿、尾巴朝镜头卷
  ball(front, cx, by + 3, 16, 12 + o.breath * 0.4, WHITE, 0, true, 1);
  // 背脊一排小金棘
  for (let k = -2; k <= 2; k++) limb(front, cx + k * 4, by - 5, cx + k * 4, by - 8, 1, 0.4, GOLD, 0);
  limb(front, cx - 6, by - 8, cx + 6, by - 8, 3, 3, NAVY, 0);
  for (let k = -7; k <= 7; k++) front.set(cx + k, by - 11, k % 3 ? GOLD[3] : GOLD[2]);
  for (const sx of [-1, 1]) { ball(front, cx + sx * 9, by + 1, 4, 3.5, GOLD, 0, false); gem(front, cx + sx * 9, by + 1, 1); }
  if (!o.lying) for (const sx of [-1, 1]) {
    const L = o.legs[sx < 0 ? 2 : 3];
    stamp(front, 0, (p) => { limb(p, cx + sx * 9, by + 7, cx + sx * 11, legY - 1 + L.y * 0.5, 3.6, 2.5, WHITE, 0); paw(p, cx + sx * 11, legY + L.y * 0.5, 0, 0); });
  } else for (const sx of [-1, 1]) { limb(front, cx + sx * 9, by + 6, cx + sx * 12, FEET - 1.5, 3.2, 2.2, WHITE, 0); paw(front, cx + sx * 12, FEET, 0, 0); }
  const tp: [number, number][] = [];
  for (let k = 0; k <= 5; k++) { const q = k / 5; tp.push([cx + 2 + q * 12 + Math.sin(q * 3 + o.tail) * 3, by + 10 + q * 8 - (o.lying ? q * 3 : 0)]); }
  for (let k = 0; k < 5; k++) limb(front, tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1], 4.4 - k * 0.6, 3.8 - k * 0.6, WHITE, 0);
  for (const k of [2, 4]) { const [x, y] = tp[k]; limb(front, x - 2.5, y - 2, x + 2.5, y + 2, 1, 1, GOLD, 0); gem(front, x, y, 0); }
  tongue(front, tp[5][0], tp[5][1], 0.6, 0.4, o.tailFlame * 0.7, 2, o.phase, 31);
  if (o.breathFire > 0) for (let k = -1; k <= 1; k++) tongue(back, cx + k * 2, hy - 6, k * 0.3, -1, 14, 2.6, o.phase, 40 + k, true);
}

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
  return Math.round(-o.rise + (key === 'howl' ? o.tilt * 8 : 0) - o.breath * 0.4);
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
  ctx.drawImage(b.canvas(), -24, -14);
  ctx.drawImage(f.canvas(), -24, -14);
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
    const by = FEET - 20 - o.rise, hy = by - 22 - o.tilt * 4;
    return [[-3.5, hy - 0.5 - FEET], [3.5, hy - 0.5 - FEET]];
  }
  const hipX = 34, hipY = FEET - 21 - o.rise;
  const c = Math.cos(o.tilt), s = Math.sin(o.tilt);
  const head = [hipX + 40 * c + (-22) * s, hipY - 40 * s + (-22) * c];
  const pc = Math.cos(-o.pitch), ps = Math.sin(-o.pitch);
  return [[head[0] + 4 * pc - (-1.2) * ps - DR_W / 2, head[1] + 4 * ps + (-1.2) * pc - FEET]];
}
