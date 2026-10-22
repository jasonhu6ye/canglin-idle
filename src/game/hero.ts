import { Pix } from './pix';

/*
 * 主角多帧动画：头、身体、双臂、双腿、披风分开画，每一帧按姿势参数重新拼一次，
 * 工具和武器跟着手的角度旋转，最后统一描边。生成一张精灵表，交给 Phaser 播放。
 *
 * 角度约定：0 = 朝下，π/2 = 朝前（脸朝的方向），π = 朝上，再大就是往身后。
 */

export const HERO_W = 28;
export const HERO_H = 30;
/** 脚底所在的行，精灵原点放在这里 */
export const HERO_FEET = 27;

const HOOD = ['#2f2547', '#3b2c5c', '#5a4385', '#7a63a8'];
const SKIN = ['#c8946a', '#f0c8a0'];
const PANTS = ['#2e2836', '#463e52'];
const BOOT = ['#2a1a10', '#5a3a22'];
const GOLD = '#e8b84a';
const EYE = '#1a1a1a';
const WOOD = ['#5a3a22', '#8a5c34'];
const STEEL = ['#6a7078', '#c5cad2', '#ffffff'];

export type HeroDir = 'down' | 'up' | 'side';
export type HeroTool = 'pickaxe' | 'axe' | 'hoe' | 'sickle' | 'rod' | 'hammer' | 'knife' | 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'none';

interface Pose {
  dir: HeroDir;
  /** 整体上下浮动（负数向上） */
  bob?: number;
  /** 下蹲多少像素 */
  crouch?: number;
  /** 侧面：两条腿的摆角；正面/背面：抬脚高度 */
  legF?: number;
  legB?: number;
  /** 侧面手臂角度 */
  armF?: number;
  armB?: number;
  /** 正面/背面手臂上下摆动 */
  armLift?: [number, number];
  tool?: HeroTool;
  /** 工具相对手臂再转多少 */
  toolTurn?: number;
  /** 手往前推出去的像素（刺、拉弓） */
  reach?: number;
  /** 弓弦拉开程度 0-1 */
  draw?: number;
  /** 披风飘动 */
  cape?: number;
  /** 法杖顶端发光 */
  glow?: boolean;
  /** 鱼线：浮漂相对身体的位置 */
  bobber?: [number, number];
}

const v = (a: number, len: number): [number, number] => [Math.sin(a) * len, Math.cos(a) * len];

function thick(p: Pix, x0: number, y0: number, x1: number, y1: number, c: string, w = 2) {
  p.line(x0, y0, x1, y1, c);
  if (w > 1) p.line(x0 + 1, y0, x1 + 1, y1, c);
}

/** 工具：从手的位置沿角度 a 伸出去 */
function drawTool(p: Pix, tool: HeroTool, hx: number, hy: number, a: number, pose: Pose) {
  const along = (t: number) => {
    const [dx, dy] = v(a, t);
    return [hx + dx, hy + dy] as [number, number];
  };
  const perp = (x: number, y: number, t: number) => {
    const [dx, dy] = v(a + Math.PI / 2, t);
    return [x + dx, y + dy] as [number, number];
  };
  const handle = (len: number, c = WOOD) => {
    const [bx, by] = along(-2);
    const [ex, ey] = along(len);
    p.line(bx, by, ex, ey, c[1]);
    return [ex, ey] as [number, number];
  };
  if (tool === 'pickaxe') {
    const [ex, ey] = handle(8);
    const [ax, ay] = perp(ex, ey, 4);
    const [bx, by] = perp(ex, ey, -4);
    const [mx, my] = along(9);
    p.line(ax, ay, mx, my, STEEL[1]);
    p.line(mx, my, bx, by, STEEL[0]);
    p.set(ax, ay, STEEL[2]);
  } else if (tool === 'axe') {
    const [ex, ey] = handle(8);
    for (let i = 0; i < 4; i++) {
      const [x, y] = along(5.5 + i * 0.9);
      const [fx, fy] = perp(x, y, 3.5);
      p.line(x, y, fx, fy, i === 0 ? STEEL[2] : STEEL[1]);
    }
    p.set(ex, ey, STEEL[0]);
  } else if (tool === 'hoe') {
    const [ex, ey] = handle(9);
    const [fx, fy] = perp(ex, ey, 3);
    p.line(ex, ey, fx, fy, STEEL[1]);
  } else if (tool === 'sickle') {
    const [ex, ey] = handle(3);
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI * 0.9;
      const [x, y] = along(3 + Math.sin(t) * 3);
      const [fx, fy] = perp(x, y, (1 - Math.cos(t)) * 2.2);
      p.set(fx, fy, i < 2 ? STEEL[0] : STEEL[1]);
    }
    p.set(ex, ey, STEEL[0]);
  } else if (tool === 'hammer') {
    const [ex, ey] = handle(5);
    for (let i = -1; i <= 1; i++) {
      const [x, y] = perp(ex, ey, i * 1.5);
      p.set(x, y, STEEL[1]);
      const [x2, y2] = along(6);
      const [fx, fy] = perp(x2, y2, i * 1.5);
      p.set(fx, fy, STEEL[0]);
    }
  } else if (tool === 'knife' || tool === 'dagger') {
    handle(0.5);
    const [ex, ey] = along(tool === 'dagger' ? 5 : 4);
    const [sx, sy] = along(1);
    p.line(sx, sy, ex, ey, STEEL[1]);
    if (tool === 'dagger') p.set(sx, sy, GOLD);
  } else if (tool === 'sword') {
    const [gx, gy] = along(1);
    const [ax, ay] = perp(gx, gy, 2);
    const [bx, by] = perp(gx, gy, -2);
    p.line(ax, ay, bx, by, GOLD);
    const [ex, ey] = along(10);
    p.line(gx, gy, ex, ey, STEEL[1]);
    const [hx2, hy2] = along(-2);
    p.line(hx2, hy2, hx, hy, WOOD[0]);
    p.set(ex, ey, STEEL[2]);
  } else if (tool === 'spear') {
    const [ex, ey] = handle(12);
    const [tx, ty] = along(15);
    p.line(ex, ey, tx, ty, STEEL[1]);
    p.set(tx, ty, STEEL[2]);
    const [ax, ay] = perp(ex, ey, 1);
    const [bx, by] = perp(ex, ey, -1);
    p.set(ax, ay, STEEL[0]);
    p.set(bx, by, STEEL[0]);
  } else if (tool === 'staff') {
    const [ex, ey] = handle(11);
    const [ox, oy] = along(12.5);
    p.rect(Math.round(ox) - 1, Math.round(oy) - 1, 3, 3, pose.glow ? '#b8f0ff' : '#5ad8e0');
    p.set(ox, oy, '#ffffff');
    p.set(ex, ey, GOLD);
  } else if (tool === 'rod') {
    const [ex, ey] = handle(13);
    if (pose.bobber) {
      const [bx, by] = pose.bobber;
      p.line(ex, ey, bx, by, '#e8e8e8');
      p.set(bx, by, '#e04a4a');
      p.set(bx, by - 1, '#ffffff');
    }
  } else if (tool === 'bow') {
    // 弓竖在手里，弓背朝前
    for (let i = -7; i <= 7; i++) {
      const bulge = Math.round((1 - (i * i) / 49) * 3);
      p.set(hx + bulge, hy + i, Math.abs(i) > 5 ? WOOD[0] : WOOD[1]);
    }
    const pull = (pose.draw ?? 0) * 5;
    p.line(hx, hy - 7, hx - pull, hy, '#e8e8e8');
    p.line(hx - pull, hy, hx, hy + 7, '#e8e8e8');
    if (pose.draw && pose.draw > 0.2) {
      p.line(hx - pull, hy, hx + 4, hy, WOOD[1]);
      p.set(hx + 4, hy, STEEL[1]);
      p.set(hx + 5, hy, STEEL[2]);
    }
  }
}

function drawFrame(pose: Pose): Pix {
  const p = new Pix(HERO_W, HERO_H);
  const cx = 13;
  const crouch = pose.crouch ?? 0;
  const bob = (pose.bob ?? 0) + crouch;
  const hipY = 20 + bob;
  const shoulderY = 12 + bob;
  const headY = 7 + bob;
  const side = pose.dir === 'side';

  // ---- 披风（身后） ----
  const cape = pose.cape ?? 0;
  if (side) {
    for (let y = shoulderY; y <= hipY + 2; y++) {
      const k = (y - shoulderY) / (hipY + 2 - shoulderY);
      const x = cx - 3 - Math.round(k * (2 + cape));
      p.line(x, y, cx - 2, y, k > 0.6 ? HOOD[0] : HOOD[1]);
    }
  } else if (pose.dir === 'up') {
    for (let y = shoulderY; y <= hipY + 2; y++) {
      const k = (y - shoulderY) / (hipY + 2 - shoulderY);
      const hw = 3 + Math.round(k * 2);
      const sway = Math.round(cape * k);
      p.line(cx - hw + sway, y, cx + hw + sway, y, k > 0.7 ? HOOD[0] : HOOD[1]);
    }
  }

  // ---- 后面的手臂 ----
  const armLen = 6;
  if (side) {
    const a = pose.armB ?? 0;
    const sx = cx - 1;
    const sy = shoulderY + 1;
    const [dx, dy] = v(a, armLen);
    thick(p, sx, sy, sx + dx, sy + dy, HOOD[0]);
    p.set(sx + dx, sy + dy, SKIN[0]);
  }

  // ---- 腿 ----
  const legLen = 7 - Math.min(crouch, 3);
  if (side) {
    const leg = (a: number, back: boolean) => {
      const [dx, dy] = v(a, legLen);
      const fx = cx + dx;
      const fy = hipY + dy;
      thick(p, cx, hipY, fx, fy, back ? PANTS[0] : PANTS[1]);
      p.rect(Math.round(fx), Math.round(fy), 3, 2, back ? BOOT[0] : BOOT[1]);
    };
    // 下蹲时膝盖往前顶
    leg((pose.legB ?? 0) - crouch * 0.12, true);
    leg((pose.legF ?? 0) + crouch * 0.2, false);
  } else {
    const leg = (x: number, lift: number) => {
      const top = hipY;
      const bottom = hipY + legLen - Math.round(lift);
      p.rect(x, top, 2, bottom - top, PANTS[1]);
      p.set(x + 1, top + 1, PANTS[0]);
      p.rect(x, bottom, 2, 2, pose.dir === 'up' ? BOOT[0] : BOOT[1]);
    };
    leg(cx - 3, pose.legB ?? 0);
    leg(cx + 1, pose.legF ?? 0);
  }

  // ---- 身体（法袍） ----
  for (let y = shoulderY; y <= hipY + 2; y++) {
    const k = (y - shoulderY) / (hipY + 2 - shoulderY);
    const hw = side ? 2 + Math.round(k * 1.5) : 3 + Math.round(k * 1.6);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const s = side ? (x - cx) / (hw + 0.5) : -(x - cx) / (hw + 0.5);
      p.set(x, y, s > 0.4 ? HOOD[3] : s > -0.3 ? HOOD[2] : HOOD[1]);
    }
  }
  // 腰带和金色滚边
  const beltY = shoulderY + 5;
  p.line(cx - (side ? 3 : 4), beltY, cx + (side ? 3 : 4), beltY, '#4a3322');
  if (pose.dir !== 'up') p.set(cx + (side ? 1 : 0), beltY, GOLD);
  if (pose.dir === 'down') p.line(cx, shoulderY + 1, cx, beltY - 1, GOLD);
  p.line(cx - (side ? 3 : 4), hipY + 2, cx + (side ? 3 : 4), hipY + 2, HOOD[0]);

  // ---- 头（兜帽） ----
  const hr = 4.6;
  for (let y = Math.floor(headY - hr); y <= headY + hr; y++) {
    for (let x = Math.floor(cx - hr); x <= cx + hr + 1; x++) {
      const dx = x - cx - 0.5;
      const dy = y - headY;
      if (dx * dx + dy * dy > hr * hr + 1) continue;
      const s = (side ? dx : -dx) * 0.4 - dy * 0.5;
      p.set(x, y, s > 1.2 ? HOOD[3] : s > -0.8 ? HOOD[2] : HOOD[1]);
    }
  }
  // 兜帽尖
  if (side) {
    p.set(cx - 4, headY - 3, HOOD[2]);
    p.set(cx - 5, headY - 2 + Math.round(cape * 0.5), HOOD[1]);
  } else {
    p.set(cx, headY - 5, HOOD[2]);
    p.set(cx + 1, headY - 5, HOOD[2]);
  }
  if (pose.dir === 'down') {
    p.rect(cx - 2, headY - 1, 6, 4, SKIN[1]);
    p.line(cx - 2, headY + 2, cx + 3, headY + 2, SKIN[0]);
    p.set(cx - 1, headY, EYE);
    p.set(cx + 2, headY, EYE);
    p.line(cx - 2, headY - 2, cx + 3, headY - 2, HOOD[0]);
  } else if (side) {
    p.rect(cx + 1, headY - 1, 4, 4, SKIN[1]);
    p.line(cx + 1, headY + 2, cx + 4, headY + 2, SKIN[0]);
    p.set(cx + 3, headY, EYE);
    p.line(cx + 1, headY - 2, cx + 4, headY - 2, HOOD[0]);
    p.set(cx + 5, headY + 1, SKIN[1]);
  } else {
    p.line(cx - 1, headY + 3, cx + 2, headY + 3, HOOD[1]);
  }

  // ---- 前面的手臂和工具 ----
  if (side) {
    const a = pose.armF ?? 0;
    const sx = cx + 1 + (pose.reach ?? 0) * 0.3;
    const sy = shoulderY + 1;
    const [dx, dy] = v(a, armLen);
    const hx = sx + dx + (pose.reach ?? 0) * 0.7;
    const hy = sy + dy;
    const tool = pose.tool ?? 'none';
    // 弓：手臂伸直向前，弓画在手的位置
    if (tool !== 'none') drawTool(p, tool, hx, hy, a + (pose.toolTurn ?? 0), pose);
    thick(p, sx, sy, hx, hy, HOOD[2]);
    p.set(hx, hy, SKIN[1]);
    p.set(hx + 1, hy, SKIN[0]);
  } else {
    const [l, r] = pose.armLift ?? [0, 0];
    const arm = (x: number, lift: number) => {
      p.rect(x, shoulderY + 1 - lift, 2, 6, pose.dir === 'up' ? HOOD[1] : HOOD[2]);
      if (pose.dir === 'down') p.rect(x, shoulderY + 7 - lift, 2, 1, SKIN[1]);
    };
    arm(cx - 6, l);
    arm(cx + 5, r);
  }
  return p.outline();
}

// ---- 动作表 ----

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
/** 关键帧插值：[时间, 值] */
function keys(k: [number, number][], t: number) {
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  }
  return k[k.length - 1][1];
}

export interface HeroAnim { key: string; frames: number; rate: number; pose: (t: number, i: number) => Pose }

const walk = (dir: HeroDir): HeroAnim => ({
  key: `walk-${dir}`, frames: 8, rate: 12,
  pose: (t) => {
    const s = Math.sin(t * TAU);
    const bob = Math.abs(Math.cos(t * TAU)) > 0.7 ? 0 : -1;
    return dir === 'side'
      ? { dir, bob, legF: s * 0.6, legB: -s * 0.6, armF: -s * 0.55, armB: s * 0.55, cape: 1 + Math.abs(s) }
      : { dir, bob, legF: Math.max(0, s) * 2, legB: Math.max(0, -s) * 2, armLift: [Math.round(Math.max(0, s)), Math.round(Math.max(0, -s))], cape: s };
  },
});

const idle = (dir: HeroDir): HeroAnim => ({
  key: `idle-${dir}`, frames: 4, rate: 4,
  pose: (_t, i) => ({ dir, bob: i === 2 ? 1 : 0, armF: 0.1, armB: -0.1, cape: i === 1 || i === 2 ? 1 : 0 }),
});

/** 双手挥动的工具：从 from 抡到 to */
const swing = (key: string, tool: HeroTool, from: number, to: number, crouch = 0, frames = 8): HeroAnim => ({
  key, frames, rate: 10,
  pose: (t) => {
    const a = keys([[0, to + 0.3], [0.45, from], [0.62, to], [1, to + 0.3]], t);
    return { dir: 'side', tool, armF: a, armB: a - 0.25, crouch: crouch + (t > 0.55 && t < 0.8 ? 1 : 0), legF: 0.35, legB: -0.3, cape: t > 0.5 ? 2 : 0 };
  },
});

export const HERO_ANIMS: HeroAnim[] = [
  walk('down'), walk('up'), walk('side'),
  idle('down'), idle('up'), idle('side'),
  swing('work-mine', 'pickaxe', 3.7, 1.1),
  swing('work-chop', 'axe', 3.2, 1.5),
  swing('work-farm', 'hoe', 2.9, 0.9, 1),
  {
    key: 'work-gather', frames: 6, rate: 8,
    pose: (t) => ({ dir: 'side', tool: 'sickle', crouch: 3, armF: keys([[0, 1.0], [0.5, 1.9], [1, 1.0]], t), armB: 0.6, legF: 0.6, legB: -0.5 }),
  },
  {
    key: 'work-skin', frames: 6, rate: 8,
    pose: (t) => ({ dir: 'side', tool: 'knife', crouch: 3, armF: 1.1 + Math.sin(t * TAU) * 0.35, toolTurn: 0.4, armB: 0.9, legF: 0.6, legB: -0.5 }),
  },
  {
    key: 'work-craft', frames: 6, rate: 9,
    pose: (t) => ({ dir: 'side', tool: 'hammer', armF: keys([[0, 1.3], [0.4, 2.5], [0.6, 1.1], [1, 1.3]], t), armB: 1.2, legF: 0.2, legB: -0.2, bob: t > 0.55 && t < 0.75 ? 1 : 0 }),
  },
  {
    key: 'work-fish', frames: 10, rate: 7,
    pose: (t, i) => {
      const casting = t < 0.4;
      const a = casting ? keys([[0, 1.6], [0.2, 3.3], [0.4, 1.9]], t) : 1.9 + (i % 2 ? 0.05 : 0);
      return {
        dir: 'side', tool: 'rod', armF: a, armB: a - 0.2, toolTurn: 0.2, legF: 0.25, legB: -0.2,
        bobber: casting ? undefined : [26, 25 + (i % 3 === 0 ? 1 : 0)],
      };
    },
  },
  {
    key: 'work-steal', frames: 6, rate: 7,
    pose: (t) => ({ dir: 'side', crouch: 2, armF: keys([[0, 1.2], [0.5, 1.7], [1, 1.2]], t), reach: keys([[0, 0], [0.5, 3], [1, 0]], t), armB: -0.4, legF: 0.5, legB: -0.5, cape: 1 }),
  },
  {
    key: 'fight-sword', frames: 8, rate: 12,
    pose: (t) => {
      const a = keys([[0, 0.8], [0.35, 3.5], [0.55, 1.0], [1, 0.8]], t);
      return { dir: 'side', tool: 'sword', armF: a, armB: 0.3, legF: 0.5, legB: -0.4, cape: t > 0.4 ? 2 : 0, crouch: t > 0.5 && t < 0.7 ? 1 : 0 };
    },
  },
  {
    key: 'fight-spear', frames: 8, rate: 12,
    pose: (t) => ({ dir: 'side', tool: 'spear', armF: 1.55, armB: 1.3, reach: keys([[0, -2], [0.4, -3], [0.55, 5], [1, -2]], t), legF: 0.55, legB: -0.5, cape: 1 }),
  },
  {
    key: 'fight-dagger', frames: 8, rate: 14,
    pose: (t) => ({ dir: 'side', tool: 'dagger', armF: keys([[0, 1.0], [0.25, 2.2], [0.4, 1.4], [0.6, 2.2], [0.75, 1.4], [1, 1.0]], t), reach: keys([[0, 0], [0.4, 2], [0.75, 2], [1, 0]], t), armB: 0.4, legF: 0.5, legB: -0.4, crouch: 1 }),
  },
  {
    key: 'fight-bow', frames: 8, rate: 10,
    pose: (t) => ({ dir: 'side', tool: 'bow', armF: 1.57, armB: 1.5, draw: keys([[0, 0], [0.6, 1], [0.7, 0], [1, 0]], t), legF: 0.4, legB: -0.4 }),
  },
  {
    key: 'fight-staff', frames: 8, rate: 10,
    pose: (t) => ({ dir: 'side', tool: 'staff', armF: keys([[0, 1.0], [0.4, 2.6], [0.6, 1.6], [1, 1.0]], t), toolTurn: keys([[0, 2.2], [0.4, 0.4], [0.6, 0], [1, 2.2]], t), glow: t > 0.45 && t < 0.75, armB: 0.2, legF: 0.3, legB: -0.3, cape: t > 0.45 ? 2 : 0 }),
  },
];

/** 生成整张精灵表；frames 里是每帧在表上的位置 */
export function paintHeroSheet() {
  const total = HERO_ANIMS.reduce((n, a) => n + a.frames, 0);
  const cols = 16;
  const rows = Math.ceil(total / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * HERO_W;
  canvas.height = rows * HERO_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of HERO_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      const x = (k % cols) * HERO_W;
      const y = Math.floor(k / cols) * HERO_H;
      ctx.drawImage(drawFrame(a.pose(i / a.frames, i)).canvas(), x, y);
      frames.push({ name: `${a.key}-${i}`, x, y });
      k++;
    }
  }
  return { canvas, frames, total };
}
