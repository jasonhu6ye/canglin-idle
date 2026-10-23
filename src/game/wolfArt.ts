import { mix, phash, Pix } from './pix';

/*
 * 坐骑「丹麦佬」（用户 10-23 给的参考图）：黑毛巨狼，银白鬃毛和大尾巴，红眼，脸上和身上有旧伤疤。
 * 全部逐像素画：侧面奔跑 24 帧、正面/背面奔跑各 16 帧、待机、坐下、仰头长嚎。
 * 每帧分成「后层」和「前层」两张，骑手夹在中间：侧面的远侧腿和尾巴在后，正面的尾巴在后，背面的头在后。
 */

export const WOLF_W = 64;
export const WOLF_H = 44;
/** 脚底所在的行 */
export const WOLF_FEET = 42;

const FUR = ['#0c0a10', '#17151d', '#23212b', '#33313d', '#4a4856'];
const MANE = ['#5c5c6c', '#8a8a9a', '#b4b4c2', '#d8d8e2', '#f4f4fa'];
const SCAR = '#8a4a50';
const SCAR_HI = '#b06a6e';
const EYE = '#ff2a2a';
const EYE_HI = '#ffb0a0';
const CLAW = '#c8c8d0';
const NOSE = '#050407';

const TAU = Math.PI * 2;

/** 明暗：左上亮，右下暗 */
function shade(R: string[], nx: number, ny: number, dim = 0) {
  const s = -nx * 0.55 - ny * 0.75 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.45;
  const i = s > 0.75 ? 4 : s > 0.45 ? 3 : s > 0.1 ? 2 : s > -0.3 ? 1 : 0;
  return R[Math.max(0, Math.min(R.length - 1, i - dim))];
}

/** 带毛边的椭球：边缘按噪声缺几个像素，像一簇簇的毛 */
function furBall(p: Pix, cx: number, cy: number, rx: number, ry: number, R: string[], seed: number, dim = 0, rough = 0.28) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1 + (phash(x, y, seed) - 0.5) * rough * 2) continue;
      let c = shade(R, Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)), dim);
      // 毛的走向：一道道斜的暗纹
      if (phash(x * 3 + y, y, seed + 7) < 0.16) c = R[Math.max(0, R.indexOf(c) - 1)];
      p.set(x, y, c);
    }
  }
}

/** 粗细渐变的肢体或尾巴：从 (x0,y0) 半径 r0 到 (x1,y1) 半径 r1 */
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

/** 爪子：一小团加三根浅色趾甲 */
function paw(p: Pix, x: number, y: number, dir: number, R: string[], dim = 0) {
  furBall(p, x + dir * 0.6, y - 0.6, 2.2, 1.5, R, 11, dim, 0.1);
  for (let k = 0; k < 3; k++) p.set(x + dir * 1.8 + (k - 1) * 0.9 * (dir === 0 ? 1.2 : 0.3), y + (dir === 0 ? 0.6 : 0.2 - k * 0.6), CLAW);
}

/** 一条腿：髋/肩 → 膝 → 爪；a 是大腿摆角（0 竖直向下，正数向前），bend 是小腿往后折多少 */
function leg(p: Pix, hx: number, hy: number, a: number, bend: number, len: number, hind: boolean, dim: number) {
  const R = FUR;
  const kx = hx + Math.sin(a) * len;
  const ky = hy + Math.cos(a) * len;
  // 后腿的跗关节往后翘，前腿的腕往后折
  const b = hind ? a - 0.55 - bend : a - bend;
  const fx = kx + Math.sin(b) * len * (hind ? 1.05 : 0.95);
  const fy = Math.min(WOLF_FEET, ky + Math.cos(b) * len * (hind ? 1.05 : 0.95));
  limb(p, hx, hy, kx, ky, hind ? 4 : 3.2, 2.2, R, dim);
  limb(p, kx, ky, fx, fy, 2.2, 1.7, R, dim);
  paw(p, fx, fy, 1, R, dim);
}

/** 两节骨头的反向运动学：已知根部和末端，求中间关节；forward = 关节往前（+x）凸 */
function ik(hx: number, hy: number, fx: number, fy: number, L1: number, L2: number, forward: boolean): [number, number, number, number] {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.05;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a = forward ? base - A : base + A;
  return [hx + Math.cos(a) * L1, hy + Math.sin(a) * L1, hx + dx, hy + dy];
}

/** 前腿：肩 → 肘（往后凸）→ 腕 → 爪；fold 0-1 是抬脚时腕关节往后折的程度 */
function foreLeg(p: Pix, sx: number, sy: number, px: number, py: number, fold: number, dim: number) {
  const vx = 1 + (-3.4 - 1) * fold;
  const vy = 3.6 + (1.0 - 3.6) * fold;
  const [ex, ey, cx, cy] = ik(sx, sy, px - vx, py - vy, 9, 8.5, false);
  limb(p, sx, sy, ex, ey, 3.4, 2.4, FUR, dim);
  limb(p, ex, ey, cx, cy, 2.4, 1.9, FUR, dim);
  limb(p, cx, cy, cx + vx, cy + vy, 1.9, 1.7, FUR, dim);
  paw(p, cx + vx, cy + vy, 1, FUR, dim);
}

/** 后腿：髋 → 膝（往前凸）→ 跗（往后翘）→ 爪；push 0-1 是蹬地后脚掌往后甩的程度 */
function hindLeg(p: Pix, hx: number, hy: number, px: number, py: number, push: number, dim: number) {
  const vx = 2.2 + (-2.4 - 2.2) * push;
  const vy = 5.6 + (4.4 - 5.6) * push;
  const [kx, ky, jx, jy] = ik(hx, hy, px - vx, py - vy, 8.5, 8, true);
  // 大腿肌肉
  furBall(p, hx + (kx - hx) * 0.35, hy + (ky - hy) * 0.35, 4.2, 4.8, FUR, 13, dim, 0.15);
  limb(p, kx, ky, jx, jy, 2.6, 1.9, FUR, dim);
  limb(p, jx, jy, jx + vx, jy + vy, 1.9, 1.6, FUR, dim);
  paw(p, jx + vx, jy + vy, 1, FUR, dim);
}

/** 周期插值：keys 首尾相接 */
function loopKeys(k: [number, number][], t: number) {
  const u = ((t % 1) + 1) % 1;
  for (let i = 1; i < k.length; i++) {
    if (u <= k[i][0]) {
      const a = (u - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const e = a * a * (3 - 2 * a);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * e;
    }
  }
  return k[k.length - 1][1];
}

/** 尾巴：一串由粗到细的毛团，黑灰相间 */
function tail(p: Pix, pts: [number, number][], r0: number, dim = 0) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = r0 * (t < 0.6 ? 0.7 + t * 0.6 : 1.06 - (t - 0.6) * 1.9);
    const band = Math.floor(t * 5) % 2 === 0;
    furBall(p, pts[i][0], pts[i][1], Math.max(1.2, r), Math.max(1.2, r * 0.9), t > 0.82 || band ? MANE : FUR, 40 + i, dim, 0.4);
  }
}

/** 二次贝塞尔取点 */
function curve(a: [number, number], b: [number, number], c: [number, number], n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
  });
}

/** 鬃毛：一圈往外支棱的白毛尖 */
function maneSpikes(p: Pix, cx: number, cy: number, rx: number, ry: number, from: number, to: number, count: number, len: number, sway: number, seed: number) {
  for (let k = 0; k < count; k++) {
    const a = from + ((to - from) * (k + 0.5)) / count + Math.sin(k * 1.7 + seed) * 0.08;
    const L = len * (0.7 + phash(k, seed, 3) * 0.6);
    const bx = cx + Math.cos(a) * rx * 0.8;
    const by = cy + Math.sin(a) * ry * 0.8;
    const tx = cx + Math.cos(a + sway) * (rx + L);
    const ty = cy + Math.sin(a + sway) * (ry + L);
    limb(p, bx, by, tx, ty, 2.4, 0.5, MANE);
  }
}

// ---- 侧面（朝右） ----

interface SidePose {
  /** 身体上下起伏 */
  bob: number;
  /** 前后腿摆角：近前、远前、近后、远后 */
  legs: [number, number, number, number];
  bends: [number, number, number, number];
  /** 尾巴甩动 -1..1 */
  tail: number;
  /** 头抬起多少（像素，正数向上），长嚎时用 */
  headUp: number;
  /** 张嘴 */
  mouth: number;
  /** 鬃毛随风往后倒 */
  wind: number;
  blink: boolean;
  /** 坐下：后半身降低 */
  sit: number;
  ear: number;
  /** 奔跑：身体伸展（肩和臀拉开多少像素）和前后俯仰（正数前高） */
  stretch?: number;
  pitch?: number;
  /** 奔跑：四只爪子的位置（相对肩/臀的 x 偏移、离地高度）和关节折叠量；有它就按关节算腿 */
  feet?: { dx: number; up: number; fold: number }[];
  /** 尾巴往后飘（奔跑时） */
  stream?: number;
}

/** 侧面整只狼往右挪，给尾巴和鼻尖留地方 */
const OX = 4;

function sideHead(p: Pix, hx: number, hy: number, P: SidePose) {
  // 远侧耳朵（暗）和近侧耳朵
  const ear = (ex: number, dim: number, tilt: number) => {
    for (let y = 0; y < 7; y++) {
      const w = (7 - y) * 0.45;
      for (let x = -w; x <= w; x++) p.set(ex + x + y * tilt, hy - 4 - y, shade(FUR, x / (w + 0.5), -0.3, dim));
    }
    p.set(ex + 3 * tilt, hy - 6, mix(MANE[1], FUR[2], dim * 0.4));
    p.set(ex + 4 * tilt, hy - 7, mix(MANE[0], FUR[2], dim * 0.4));
  };
  ear(hx - 3, 1, -0.15 + P.ear * 0.1);
  // 头骨
  furBall(p, hx, hy, 6, 5.2, FUR, 21, 0, 0.12);
  ear(hx + 0.5, 0, 0.1 + P.ear * 0.15);
  // 吻部：往前伸出的楔形，下颌可以张开
  for (let x = 0; x <= 7; x++) {
    const top = hy - 1.5 + x * 0.25;
    const bot = hy + 3 - x * 0.2;
    for (let y = Math.round(top); y <= Math.round(bot); y++) p.set(hx + 4 + x, y, y === Math.round(top) ? FUR[3] : FUR[2]);
  }
  if (P.mouth > 0) {
    for (let x = 1; x <= 6; x++) {
      p.set(hx + 4 + x, hy + 3.4 - x * 0.1 + P.mouth * 0.4, '#3a0c10');
      p.set(hx + 4 + x, hy + 4.4 - x * 0.1 + P.mouth, FUR[2]);
    }
    p.set(hx + 7, hy + 3.4 + P.mouth * 0.4, '#e8e0d8');
  } else {
    p.line(hx + 6, hy + 3, hx + 10, hy + 2.4, FUR[0]);
  }
  p.set(hx + 11, hy - 0.4, NOSE);
  p.set(hx + 11, hy + 0.6, NOSE);
  p.set(hx + 10, hy - 0.6, NOSE);
  // 脸颊的灰毛
  furBall(p, hx - 1, hy + 3, 3, 2.2, MANE, 23, 1, 0.5);
  // 红眼：压低的眉骨
  if (!P.blink) {
    p.set(hx + 3, hy - 1, EYE);
    p.set(hx + 4, hy - 1, EYE_HI);
    p.set(hx + 3, hy - 2, FUR[0]);
    p.set(hx + 5, hy - 2, FUR[0]);
  } else {
    p.line(hx + 3, hy - 1, hx + 5, hy - 1, FUR[0]);
  }
  // 脸上那道疤
  p.line(hx + 1, hy - 4, hx + 5, hy + 2, SCAR);
  p.set(hx + 2, hy - 3, SCAR_HI);
}

function drawSide(back: Pix, front: Pix, P: SidePose) {
  const b = P.bob;
  const sit = P.sit;
  // 身体：肩在右、臀在左；坐下时臀部压低
  const st = P.stretch ?? 0;
  const pitch = P.pitch ?? 0;
  const shX = OX + 36 + st / 2, shY = 21 + b - pitch;
  const hipX = OX + 18 - st / 2 - sit * 2, hipY = 22 + b + pitch + sit * 9;
  const F = P.feet;
  // 爪子位置：肩、臀的「静止位置」加偏移，这样身体伸缩时爪子不会跟着滑
  const foot = (k: number, front: boolean) => [OX + (front ? 37 : 19) + F![k].dx, WOLF_FEET - F![k].up] as const;
  // ---- 后层：远侧两条腿、尾巴 ----
  const tailBase: [number, number] = [hipX - 4, hipY - 3];
  const swing = P.tail;
  const sm = P.stream ?? 0;
  const tailPts = sit > 0.5
    ? curve(tailBase, [hipX - 12, hipY + 8], [hipX + 4 + swing * 2, WOLF_FEET - 1], 9)
    : curve(tailBase, [hipX - 15 - sm * 2, hipY - 6 - swing * 4 + sm * 3], [hipX - 11 - sm * 9 + swing * 3, hipY - 18 - swing * 2 + sm * 12], 10);
  tail(back, tailPts, 4.6);
  if (sit > 0.5) {
    leg(back, shX - 1, shY + 3, 0.05, 0.05, 8.5, false, 1);
    furBall(back, hipX + 2, hipY + 3, 5, 5, FUR, 5, 1);
  } else if (F) {
    const [fx, fy] = foot(1, true);
    foreLeg(back, shX - 2, shY + 3, fx - 2, fy, F[1].fold, 1);
    const [hx, hy] = foot(3, false);
    hindLeg(back, hipX + 1, hipY + 2, hx - 1, hy, F[3].fold, 1);
  } else {
    leg(back, shX - 2, shY + 3, P.legs[1], P.bends[1], 8.5, false, 1);
    leg(back, hipX + 1, hipY + 2, P.legs[3], P.bends[3], 8.5, true, 1);
  }
  // ---- 前层：躯干、近侧腿、鬃毛、头 ----
  // 躯干：从臀到肩一串毛团，胸口更厚
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = hipX + (shX - hipX) * t;
    const y = hipY + (shY - hipY) * t - Math.sin(t * Math.PI) * 1.5;
    furBall(front, x, y, 6 + t * 1.2, 6.2 + t * 1.6, FUR, 30 + i, 0, 0.3);
  }
  // 身上的旧伤：侧腹一个叉、后腿一道
  front.line(hipX + 6, hipY - 4, hipX + 10, hipY + 1, SCAR);
  front.line(hipX + 10, hipY - 4, hipX + 6, hipY + 1, SCAR);
  front.set(hipX + 8, hipY - 2, SCAR_HI);
  if (sit > 0.5) {
    // 坐着：后腿折在身下，前腿撑直
    furBall(front, hipX + 3, hipY + 4, 5.5, 5, FUR, 6, 0, 0.2);
    paw(front, hipX + 9, WOLF_FEET, 1, FUR);
    leg(front, shX + 1, shY + 3, 0.08, 0.05, 8.5, false, 0);
  } else if (F) {
    const [hx, hy] = foot(2, false);
    hindLeg(front, hipX + 3, hipY + 3, hx + 1, hy, F[2].fold, 0);
    const [fx, fy] = foot(0, true);
    foreLeg(front, shX + 1, shY + 3, fx + 1, fy, F[0].fold, 0);
  } else {
    leg(front, hipX + 3, hipY + 3, P.legs[2], P.bends[2], 8.5, true, 0);
    front.line(hipX + 3 + Math.sin(P.legs[2]) * 6, hipY + 9, hipX + 5 + Math.sin(P.legs[2]) * 6, hipY + 12, SCAR);
    leg(front, shX + 1, shY + 3, P.legs[0], P.bends[0], 8.5, false, 0);
  }
  // 鬃毛：从后颈一直包到胸前，往后被风吹
  const nx = shX + 4, ny = shY - 6 - P.headUp * 0.4;
  furBall(front, nx, ny + 2, 8, 9, MANE, 51, 0, 0.45);
  maneSpikes(front, nx, ny + 2, 7, 8, Math.PI * 0.55, Math.PI * 1.75, 9, 5 + P.wind, -0.25 - P.wind * 0.12, 3);
  maneSpikes(front, nx + 2, ny + 6, 5, 6, Math.PI * 0.1, Math.PI * 0.6, 4, 3.5, 0.1, 9);
  // 头
  sideHead(front, shX + 10, shY - 9 - P.headUp, P);
}

/*
 * 奔跑步态（狼的旋转式跑法，一个周期 = 一步）：
 * 远后腿 → 近后腿 → 近前腿 → 远前腿 依次落地，每只脚着地约 1/3 周期，前腿离地后全身腾空一小段。
 * 着地的爪子匀速往后划（和地面一起动，不打滑），离地后抬起、折腿、往前甩。
 * 后腿着地时身体收拢、前身抬起；前腿着地时身体伸展、前身压低；腾空时最高。
 */
const RUN = {
  /** 每只脚落地的时刻：近前、远前、近后、远后 */
  touch: [0.42, 0.52, 0.12, 0.02],
  duty: 0.34,
  /** 着地时爪子从 +reach 划到 -reach */
  reach: [8, 8, 7, 7],
  lift: [8, 8, 6, 6],
};

/** 身体起伏（正数往下）：着地中段最低，腾空最高 */
const runBob = (t: number) => 1.5 * Math.cos(TAU * (t - 0.45)) + 0.4 * Math.cos(TAU * 2 * (t - 0.22));

function runFoot(t: number, k: number) {
  const u = (((t - RUN.touch[k]) % 1) + 1) % 1;
  const r = RUN.reach[k];
  if (u < RUN.duty) {
    const a = u / RUN.duty;
    // 蹬地的后半段脚掌往后翻
    return { dx: r - 2 * r * a, up: 0, fold: k >= 2 ? Math.max(0, a - 0.6) * 1.5 : 0 };
  }
  const a = (u - RUN.duty) / (1 - RUN.duty);
  const e = a * a * (3 - 2 * a);
  const front = k < 2;
  // 前腿离地先往后上方折起再往前伸；后腿贴着肚子往前收
  const up = RUN.lift[k] * Math.pow(Math.sin(Math.PI * (front ? Math.min(1, a * 1.15) : a)), front ? 0.8 : 1);
  const fold = front ? Math.sin(Math.PI * Math.min(1, a * 1.4)) : Math.max(0, 0.6 - a) * 1.2;
  return { dx: -r + 2 * r * e - (front ? Math.sin(Math.PI * a) * 2 : 0), up, fold: Math.min(1, fold) };
}

const gallop = (t: number): SidePose => {
  const bob = runBob(t);
  const pitch = 1.3 * Math.cos(TAU * (t - 0.28));
  return {
    bob, pitch,
    stretch: 3 * Math.cos(TAU * (t - 0.62)),
    legs: [0, 0, 0, 0], bends: [0, 0, 0, 0],
    feet: [0, 1, 2, 3].map((k) => runFoot(t, k)),
    // 头比身体稳：抵消一大半起伏
    tail: Math.sin(TAU * (t - 0.3)) * 0.8, stream: 1, headUp: 0.65 * (bob - pitch),
    mouth: 1, wind: 2 + Math.sin(TAU * 2 * t) * 0.8, blink: false, sit: 0, ear: -1,
  };
};

/** 骑手的鞍位跟着狼背起伏（像素，正数往下），每帧一个，地图场景按狼的当前帧读 */
export function wolfSaddle(key: string, i: number): number {
  const a = WOLF_ANIMS.find((x) => x.key === key);
  if (!a) return 0;
  const t = i / a.frames;
  if (key === 'wolf-run-side') return Math.round(runBob(t));
  if (key === 'wolf-run-down' || key === 'wolf-run-up') return Math.round(runBob(t));
  if (key.startsWith('wolf-idle')) return Math.sin(t * TAU) > 0.4 ? -1 : 0;
  return 0;
}

const standing = (t: number, i: number): SidePose => ({
  bob: Math.sin(t * TAU) > 0.4 ? -1 : 0,
  legs: [0.06, -0.04, -0.05, 0.06], bends: [0.05, 0.05, 0.05, 0.05],
  tail: Math.sin(t * TAU) * 0.6, headUp: 0, mouth: i % 8 < 2 ? 0 : 0, wind: 0, blink: i === 11, sit: 0, ear: i === 6 || i === 7 ? 1 : 0,
});

const sitting = (t: number, i: number): SidePose => ({
  ...standing(t, i), sit: 1, legs: [0.05, 0.05, 0, 0], tail: Math.sin(t * TAU) * 0.8,
});

const howl = (t: number, i: number): SidePose => {
  const up = Math.sin(Math.min(1, t * 1.4) * Math.PI);
  return { ...standing(t, i), headUp: Math.round(up * 5), mouth: up > 0.4 ? 2 : 0, wind: up, blink: up > 0.6, ear: -1 };
};

// ---- 正面（朝镜头） ----

/** 正面、背面奔跑时每只脚：抬多高、离身体多远（透视里着地的爪子慢慢往身体下面收） */
function runLift(t: number, k: number) {
  const f = runFoot(t, k);
  return { up: f.up, slide: f.dx / 4 };
}

function drawFront(back: Pix, front: Pix, t: number, run: boolean, i: number) {
  const s = Math.sin(t * TAU);
  const bob = run ? runBob(t) : Math.sin(t * TAU) > 0.4 ? -1 : 0;
  const cx = WOLF_W / 2;
  // 后层：背和高高翘起的尾巴尖
  furBall(back, cx, 17 + bob, 10, 6, FUR, 61, 1);
  tail(back, curve([cx + 2, 15 + bob], [cx + 6 + s * 4, 8], [cx + 2 + s * 6, 1 + bob], 8), 3.6, 1);
  // 前层：后腿露在两边（远一点，脚落在前腿后面），前腿在中间；按奔跑步态依次抬落
  // 镜头里的右边是狼的左边：近侧（k=0、2）放左边
  const legAt = (k: number) => (run ? runLift(t, k) : { up: 0, slide: 0 });
  for (const [x, k] of [[cx - 10, 2], [cx + 10, 3]] as [number, number][]) {
    const L = legAt(k);
    const fy = WOLF_FEET - 3 - L.up * 0.8 + L.slide * 0.4;
    limb(front, x, 30 + bob, x, fy - 2, 3, 2.2, FUR, 1);
    paw(front, x, fy, 0, FUR, 1);
  }
  for (const [x, k] of [[cx - 5, 0], [cx + 5, 1]] as [number, number][]) {
    const L = legAt(k);
    // 抬起的前腿腕关节往后折：小腿变短、爪子朝后（看不到趾甲）
    const fy = WOLF_FEET - L.up * 1.0 - L.slide * 0.5;
    limb(front, x, 28 + bob, x, fy - 2, 3.2, 2.4, FUR);
    if (L.up > 3) furBall(front, x, fy - 1, 2.4, 1.8, FUR, 12, 1, 0.1);
    else paw(front, x, fy, 0, FUR);
  }
  // 胸前一大圈银白鬃毛
  furBall(front, cx, 24 + bob, 13, 9, MANE, 71, 0, 0.5);
  maneSpikes(front, cx, 24 + bob, 12, 8, Math.PI * 0.85, Math.PI * 2.15, 13, 4 + (run ? 1 : 0), 0, 5);
  // 头
  const hy = 21 + bob;
  for (const ex of [-1, 1]) {
    for (let y = 0; y < 7; y++) {
      const w = (7 - y) * 0.42;
      for (let x = -w; x <= w; x++) front.set(cx + ex * 5 + x + ex * y * 0.35, hy - 5 - y, shade(FUR, x / (w + 0.5), -0.2));
    }
    front.set(cx + ex * 5 + ex * 1.2, hy - 7, MANE[1]);
    front.set(cx + ex * 5 + ex * 1.4, hy - 8, MANE[0]);
  }
  furBall(front, cx, hy, 7, 6, FUR, 81, 0, 0.12);
  // 灰色的面颊和吻部
  furBall(front, cx - 5, hy + 3, 2.6, 2.4, MANE, 82, 1, 0.5);
  furBall(front, cx + 5, hy + 3, 2.6, 2.4, MANE, 83, 1, 0.5);
  furBall(front, cx, hy + 4, 3.2, 3, FUR, 84, 0, 0.05);
  front.set(cx, hy + 4, NOSE);
  front.set(cx - 1, hy + 4, NOSE);
  front.set(cx, hy + 5, NOSE);
  if (run) { front.set(cx - 1, hy + 7, '#3a0c10'); front.set(cx, hy + 7, '#3a0c10'); front.set(cx + 1, hy + 7, '#e8e0d8'); }
  // 眉骨压着的红眼
  if (i % 12 !== 9) {
    for (const ex of [-1, 1]) {
      front.set(cx + ex * 3, hy, EYE);
      front.set(cx + ex * 3 + (ex < 0 ? 1 : -1), hy, EYE_HI);
      front.set(cx + ex * 4, hy - 1, FUR[0]);
      front.set(cx + ex * 2, hy - 1, FUR[0]);
    }
  }
  // 疤：斜穿过左眼
  front.line(cx - 5, hy - 4, cx - 1, hy + 3, SCAR);
  front.set(cx - 4, hy - 3, SCAR_HI);
}

// ---- 背面（背对镜头） ----

function drawBack(back: Pix, front: Pix, t: number, run: boolean) {
  const s = Math.sin(t * TAU);
  const bob = run ? runBob(t) : Math.sin(t * TAU) > 0.4 ? -1 : 0;
  const cx = WOLF_W / 2;
  // 后层：远处的头、耳朵和一圈鬃毛
  const hy = 12 + bob;
  for (const ex of [-1, 1]) {
    for (let y = 0; y < 6; y++) {
      const w = (6 - y) * 0.45;
      for (let x = -w; x <= w; x++) back.set(cx + ex * 4 + x + ex * y * 0.3, hy - 3 - y, shade(FUR, x / (w + 0.5), -0.3, 1));
    }
  }
  furBall(back, cx, hy, 5.5, 4.6, FUR, 91, 1, 0.15);
  furBall(back, cx, hy + 6, 12, 6, MANE, 92, 0, 0.5);
  maneSpikes(back, cx, hy + 6, 11, 5, Math.PI * 1.0, Math.PI * 2.0, 10, 3.5, 0, 7);
  furBall(back, cx, hy + 11, 9, 5, FUR, 93, 1);
  // 远处的前腿：从两条后腿中间露出来，交替抬落
  const legAt = (k: number) => (run ? runLift(t, k) : { up: 0, slide: 0 });
  for (const [x, k] of [[cx - 3, 1], [cx + 3, 0]] as [number, number][]) {
    const L = legAt(k);
    const fy = WOLF_FEET - 4 - L.up * 0.5;
    limb(back, x, 28 + bob, x, fy - 1.5, 2.4, 1.9, FUR, 2);
    paw(back, x, fy, 0, FUR, 2);
  }
  // 前层：屁股、两条后腿和甩动的大尾巴
  furBall(front, cx, 26 + bob, 11, 7.5, FUR, 94, 0, 0.3);
  // 背对镜头：镜头里的左边是狼的左边（远侧 k=3），右边是近侧 k=2。腿画在屁股前面，抬起来看得清
  for (const [x, k] of [[cx - 7, 3], [cx + 7, 2]] as [number, number][]) {
    const L = legAt(k);
    const side = x < cx ? -1 : 1;
    // 后腿抬起时脚掌往后翻、朝镜头露出肉垫；蹬地时腿伸直
    const fy = WOLF_FEET - L.up * 1.2 + Math.max(0, L.slide) * 0.3;
    const sx = x + side * L.up * 0.3;
    furBall(front, x, 30 + bob, 4.2, 4.6, FUR, 95 + k, 0, 0.15);
    limb(front, x, 31 + bob, sx, fy - 2.5, 3.4, 2.2, FUR);
    paw(front, sx, fy, 0, FUR);
    if (L.up > 1.5) {
      front.set(sx, fy - 1, '#5a4044');
      front.set(sx - 1, fy - 1, '#4a3438');
      front.set(sx + 1, fy - 1, '#4a3438');
      front.set(sx, fy - 2, '#4a3438');
    }
  }
  // 背上的伤疤
  front.line(cx + 3, 22 + bob, cx + 7, 27 + bob, SCAR);
  // 尾巴高高翘起往两边甩，不挡住后腿
  const tb = run ? 3 : 0;
  tail(front, curve([cx, 25 + bob], [cx + 8 + s * 6, 18 - tb], [cx + 4 + s * 9, 7 + bob - tb], 9), 4.4);
}

// ---- 精灵表 ----

export interface WolfAnim { key: string; frames: number; rate: number }
export const WOLF_ANIMS: WolfAnim[] = [
  // 奔跑一步 0.5 秒（骑乘速度下），每方向 32 帧
  { key: 'wolf-run-side', frames: 32, rate: 64 },
  { key: 'wolf-run-down', frames: 32, rate: 64 },
  { key: 'wolf-run-up', frames: 32, rate: 64 },
  { key: 'wolf-idle-side', frames: 24, rate: 10 },
  { key: 'wolf-idle-down', frames: 24, rate: 10 },
  { key: 'wolf-idle-up', frames: 24, rate: 10 },
  { key: 'wolf-sit', frames: 16, rate: 8 },
  { key: 'wolf-howl', frames: 24, rate: 24 },
];

function drawWolf(key: string, i: number, n: number): [Pix, Pix] {
  const back = new Pix(WOLF_W, WOLF_H);
  const front = new Pix(WOLF_W, WOLF_H);
  const t = i / n;
  if (key === 'wolf-run-side') drawSide(back, front, gallop(t));
  else if (key === 'wolf-idle-side') drawSide(back, front, standing(t, i));
  else if (key === 'wolf-sit') drawSide(back, front, sitting(t, i));
  else if (key === 'wolf-howl') drawSide(back, front, howl(t, i));
  else if (key === 'wolf-run-down') drawFront(back, front, t, true, i);
  else if (key === 'wolf-idle-down') drawFront(back, front, t, false, i);
  else if (key === 'wolf-run-up') drawBack(back, front, t, true);
  else drawBack(back, front, t, false);
  // 描边：前层按两层合起来的轮廓描，避免前后层接缝处出现黑线
  back.outlineTinted('#050407', 0.6);
  front.outlineTinted('#050407', 0.6);
  return [back, front];
}

/** 整张精灵表：每帧 `${key}-${i}-b`（后层）和 `-f`（前层） */
export function paintWolfSheet() {
  const total = WOLF_ANIMS.reduce((k, a) => k + a.frames * 2, 0);
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * WOLF_W;
  canvas.height = Math.ceil(total / cols) * WOLF_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of WOLF_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      const layers = drawWolf(a.key, i, a.frames);
      layers.forEach((pix, j) => {
        const x = (k % cols) * WOLF_W;
        const y = Math.floor(k / cols) * WOLF_H;
        ctx.drawImage(pix.canvas(), x, y);
        frames.push({ name: `${a.key}-${i}-${j ? 'f' : 'b'}`, x, y });
        k++;
      });
    }
  }
  return { canvas, frames };
}

let iconUrl = '';
/** 背包、坐骑栏里的图标：侧面待机那一帧，缩到 32×32 的框里 */
export function wolfIconUrl() {
  if (iconUrl) return iconUrl;
  const [b, f] = drawWolf('wolf-idle-side', 0, 16);
  const c = document.createElement('canvas');
  c.width = 44;
  c.height = 44;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(b.canvas(), -12, 0);
  ctx.drawImage(f.canvas(), -12, 0);
  iconUrl = c.toDataURL();
  return iconUrl;
}
