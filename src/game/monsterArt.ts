import type { MonsterDef } from '../core/types';
import { sizeOf, SIZE_PX, type Form } from '../core/bestiary';
import { phash, Pix } from './pix';

/*
 * 怪物多帧动画：按外形分 16 个画法（四足兽、飞禽、虫、蛇、人形、魔像、亡灵、植物、魔眼……），
 * 每种怪用自己的主色和点缀色、体型和级别（精英、首领更大、带装饰）重画每一帧。
 * 每种 34 帧：待机 6、移动 8、攻击 8、受击 4、死亡 8。全部朝右画，朝左时翻转。
 */

export const MON_ANIMS = [
  { key: 'idle', frames: 6, rate: 6, repeat: -1 },
  { key: 'move', frames: 8, rate: 12, repeat: -1 },
  { key: 'attack', frames: 8, rate: 14, repeat: 0 },
  { key: 'hurt', frames: 4, rate: 12, repeat: 0 },
  { key: 'death', frames: 8, rate: 10, repeat: 0 },
] as const;
export type MonAnim = (typeof MON_ANIMS)[number]['key'];
export const MON_FRAMES = MON_ANIMS.reduce((n, a) => n + a.frames, 0);

interface Pose {
  anim: MonAnim;
  t: number;
  bob: number;
  lean: number;
  phase: number;
  moving: boolean;
  flap: number;
  open: number;
  raise: number;
  squash: number;
}

interface Ctx {
  p: Pix;
  S: number;
  u: number;
  g: number;
  o: Pose;
  P: string[];
  A: string[];
  m: MonsterDef;
  form: Form;
  rank: MonsterDef['rank'];
  /** 跟种类绑定的随机数，同一种怪每帧都一样 */
  r: (k: number) => number;
}

const TAU = Math.PI * 2;

// ---- 颜色 ----

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex([r, g, b]: number[]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
const mix = (a: string, b: string, k: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * k));
};
/** 一个颜色变成四档明暗：暗、中、本色、亮 */
function shades(c: string): string[] {
  return [mix(c, '#140c10', 0.55), mix(c, '#140c10', 0.25), c, mix(c, '#ffffff', 0.4)];
}

// ---- 形状 ----

function fillPoly(p: Pix, pts: [number, number][], c: string) {
  const ys = pts.map((q) => q[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) p.set(x, y, c);
  }
}
function ell(p: Pix, cx: number, cy: number, rx: number, ry: number, c: string) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / Math.max(rx, 0.5);
      const dy = (y + 0.5 - cy) / Math.max(ry, 0.5);
      if (dx * dx + dy * dy <= 1) p.set(x, y, c);
    }
  }
}
function limb(p: Pix, x0: number, y0: number, x1: number, y1: number, c: string, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    if (w <= 1) p.set(x, y, c);
    else ell(p, x, y, w / 2, w / 2, c);
  }
}
const blob = (c: Ctx, x: number, y: number, rx: number, ry: number, pal = c.P, seed = 1) => c.p.blob(x, y, Math.max(rx, 1), Math.max(ry, 1), pal, seed);
const eye = (c: Ctx, x: number, y: number, col = '#140c10', big = false) => {
  c.p.set(x, y, col);
  if (big) {
    c.p.set(x, y - 1, col);
    c.p.set(x - 1, y, '#ffffff');
  }
};

// ---- 动作参数 ----

function poseOf(anim: MonAnim, i: number, n: number): Pose {
  const t = i / n;
  const o: Pose = { anim, t, bob: 0, lean: 0, phase: 0, moving: false, flap: Math.sin(t * TAU), open: 0, raise: 0, squash: 1 };
  if (anim === 'idle') {
    o.bob = Math.sin(t * TAU) > 0.3 ? -1 : 0;
    o.squash = 1 - Math.max(0, Math.sin(t * TAU)) * 0.06;
  } else if (anim === 'move') {
    o.moving = true;
    o.phase = t * TAU;
    o.bob = -Math.round(Math.abs(Math.sin(t * TAU)) * 1.2);
    o.flap = Math.sin(t * TAU * 2);
  } else if (anim === 'attack') {
    if (t < 0.375) {
      o.raise = t / 0.375;
      o.lean = -Math.round(o.raise * 2);
      o.squash = 1 - o.raise * 0.1;
    } else if (t < 0.625) {
      o.raise = 1 - (t - 0.375) / 0.25;
      o.lean = 3;
      o.open = 1;
      o.squash = 1.08;
    } else {
      const k = 1 - (t - 0.625) / 0.375;
      o.lean = Math.round(3 * k);
      o.open = k * 0.6;
    }
    o.flap = Math.sin(t * TAU * 2);
  } else if (anim === 'hurt') {
    o.lean = -Math.round(2 * (1 - t));
    o.squash = 0.92;
  } else {
    o.lean = -1;
    o.squash = 1 - Math.min(1, t * 1.6) * 0.45;
    o.bob = Math.round(t * 2);
    o.flap = -1;
  }
  return o;
}

// ---- 四足兽 ----

const BEAST: Partial<Record<Form, { body: [number, number]; leg: number; legW: number; head: [number, number]; snout: number }>> = {
  wolf: { body: [8.5, 4.5], leg: 7, legW: 2, head: [4, 3.5], snout: 3 },
  fox: { body: [7, 3.8], leg: 5, legW: 1.5, head: [3.5, 3.2], snout: 3 },
  boar: { body: [9.5, 6], leg: 4.5, legW: 2.5, head: [4.5, 4.5], snout: 2 },
  deer: { body: [8, 4.5], leg: 9, legW: 1.5, head: [3.2, 3], snout: 2.5 },
  bear: { body: [10.5, 7], leg: 6, legW: 3.5, head: [5, 4.5], snout: 2 },
  cat: { body: [9, 4], leg: 6, legW: 2, head: [3.8, 3.5], snout: 1 },
  mammoth: { body: [12, 8], leg: 7, legW: 4, head: [6, 6], snout: 0 },
  goat: { body: [7.5, 5], leg: 6, legW: 1.5, head: [3.5, 3.2], snout: 2 },
  griffin: { body: [8, 4.5], leg: 6, legW: 2, head: [3.5, 3.5], snout: 0 },
  lizard: { body: [8, 3.5], leg: 3, legW: 2, head: [3.5, 2.8], snout: 3 },
  salamander: { body: [7.5, 3.5], leg: 3, legW: 2, head: [3.5, 2.8], snout: 2 },
  croc: { body: [11, 3.8], leg: 3, legW: 2.5, head: [4, 2.5], snout: 7 },
  drake: { body: [8.5, 5], leg: 6, legW: 3, head: [4, 3.5], snout: 3 },
  dragon: { body: [10, 6], leg: 7, legW: 3.5, head: [4.5, 4], snout: 4 },
  // 8848 外圈新增（10-23）
  lion: { body: [9.5, 5], leg: 6.5, legW: 2.5, head: [4.2, 4], snout: 1.5 },
  rhino: { body: [11, 6.5], leg: 5, legW: 3.5, head: [4.5, 4], snout: 3 },
  camel: { body: [9, 5], leg: 10, legW: 1.8, head: [3, 2.6], snout: 3 },
  panther: { body: [9.5, 3.8], leg: 6, legW: 2, head: [3.5, 3.2], snout: 1 },
  yak: { body: [10.5, 6.5], leg: 5.5, legW: 3, head: [4.2, 4], snout: 1.5 },
  hyena: { body: [8, 4.5], leg: 6, legW: 2, head: [3.8, 3.4], snout: 2.5 },
};

function beast(c: Ctx) {
  const { p, u, g, o, P, A, form } = c;
  const cfg = BEAST[form]!;
  const rx = cfg.body[0] * u;
  const ry = cfg.body[1] * u * o.squash;
  const leg = cfg.leg * u;
  const cx = c.S / 2 - 2 * u + o.lean;
  const by = g - leg - ry * 0.55 + o.bob;
  const reptile = ['lizard', 'salamander', 'croc'].includes(form);
  const winged = form === 'dragon' || form === 'griffin';
  const legX = [cx - rx * 0.6, cx + rx * 0.55];
  const drawLegs = (far: boolean) => {
    legX.forEach((lx, i) => {
      const off = (far ? Math.PI : 0) + (i ? Math.PI : 0);
      const sw = o.moving ? Math.sin(o.phase + off) : o.anim === 'attack' && i === 1 && !far ? -o.raise : 0;
      const fx = lx + sw * leg * 0.45 + (reptile ? (i ? 2 : -2) * u : 0);
      const lift = o.moving ? Math.max(0, Math.cos(o.phase + off)) * 2 * u : 0;
      const col = far ? P[0] : P[1];
      limb(p, lx + (far ? -u : 0), by + ry * 0.3, fx + (far ? -u : 0), g - lift + (o.anim === 'death' ? -1 : 0), col, cfg.legW * u);
      if (form === 'deer' || form === 'goat') p.set(fx, g - lift, '#2a1a12');
    });
  };
  // 尾巴
  const tx = cx - rx;
  const ty = by - ry * 0.2;
  const wag = Math.sin(o.t * TAU * (o.moving ? 2 : 1)) * 1.5 * u;
  if (form === 'fox') {
    blob(c, tx - 3 * u, ty + wag * 0.5, 4 * u, 2.5 * u, P, 3);
    ell(p, tx - 6 * u, ty + wag * 0.5, 1.5 * u, 1.5 * u, A[3]);
  } else if (form === 'lion') {
    // 狮尾：细长，末端一撮毛
    limb(p, tx, ty, tx - 5 * u, ty + 3 * u + wag, P[1], u);
    ell(p, tx - 5.5 * u, ty + 3.5 * u + wag, 1.4 * u, 1.4 * u, A[1]);
  } else if (form === 'panther') {
    // 豹尾：长长地往上翘
    for (let k = 0; k <= 8; k++) {
      const q = k / 8;
      ell(p, tx - q * 7 * u, ty - Math.sin(q * 2.2) * 4 * u + wag * q, 1.1 * u, 1.1 * u, P[1]);
    }
  } else if (form === 'yak' || form === 'camel') {
    limb(p, tx, ty, tx - 2 * u, ty + 4 * u + wag * 0.3, P[0], u);
    ell(p, tx - 2 * u, ty + 4.5 * u + wag * 0.3, u, 1.5 * u, P[0]);
  } else if (form === 'cat' || form === 'griffin') {
    limb(p, tx, ty, tx - 5 * u, ty - 4 * u + wag, P[1], 1.5 * u);
    if (form === 'griffin') ell(p, tx - 5 * u, ty - 4 * u + wag, 1.5 * u, 1.5 * u, P[0]);
  } else if (form === 'wolf') {
    limb(p, tx, ty, tx - 5 * u, ty + 2 * u + wag * 0.5, P[1], 2.5 * u);
  } else if (reptile || form === 'drake' || form === 'dragon') {
    const len = (form === 'croc' ? 10 : 9) * u;
    for (let k = 0; k <= 8; k++) {
      const q = k / 8;
      ell(p, tx - q * len, by + ry * 0.2 + Math.sin(q * 3 + o.t * TAU) * 1.2 * u + q * 2 * u, (1 - q * 0.8) * 2.4 * u, (1 - q * 0.8) * 2 * u, P[1]);
    }
    if (form === 'dragon' || form === 'drake') fillPoly(p, [[tx - len - 2 * u, by + ry * 0.2 + 2 * u], [tx - len + u, by - 1 * u], [tx - len + u, by + 4 * u]], A[2]);
  } else if (form !== 'mammoth' && form !== 'bear' && form !== 'rhino') {
    limb(p, tx, ty, tx - 2 * u, ty - u + wag * 0.3, P[1], 1.5 * u);
  }
  if (winged) wing(c, cx - rx * 0.1, by - ry * 0.7, 'far', form === 'dragon' ? 17 : 13, form === 'dragon');
  drawLegs(true);
  blob(c, cx, by, rx, ry, P, 2);
  // 花纹
  if (form === 'salamander' || form === 'cat') for (let k = 0; k < 5; k++) ell(p, cx - rx * 0.6 + k * rx * 0.3, by - ry * 0.3 + (k % 2) * u, u, u, A[1]);
  if (form === 'boar' || form === 'drake' || form === 'dragon' || form === 'croc')
    for (let k = 0; k < 5; k++) fillPoly(p, [[cx - rx * 0.5 + k * rx * 0.25, by - ry - u], [cx - rx * 0.6 + k * rx * 0.25, by - ry * 0.6], [cx - rx * 0.35 + k * rx * 0.25, by - ry * 0.6]], form === 'boar' ? P[0] : A[1]);
  if (form === 'mammoth' || form === 'bear' || form === 'goat') for (let k = 0; k < 8; k++) p.paint(cx - rx * 0.8 + k * rx * 0.22, by + ry * 0.7, P[0]);
  if (form === 'griffin') ell(p, cx + rx * 0.4, by - ry * 0.2, rx * 0.45, ry * 0.8, A[3]);
  if (form === 'hyena' || form === 'panther') {
    // 斑点：鬣狗是稀疏的深色斑，豹是一圈圈的环斑
    for (let k = 0; k < 9; k++) {
      const sx2 = cx - rx * 0.75 + (k % 5) * rx * 0.36 + (k > 4 ? rx * 0.18 : 0);
      const sy2 = by - ry * 0.35 + (k > 4 ? ry * 0.5 : 0);
      if (form === 'hyena') p.paint(sx2, sy2, A[1]);
      else { p.paint(sx2, sy2, A[0]); p.paint(sx2 + u, sy2, A[0]); p.paint(sx2, sy2 + u, A[0]); }
    }
    // 鬣狗背上一道竖起的鬃毛，前高后低
    if (form === 'hyena') for (let k = 0; k < 6; k++) p.set(cx - rx * 0.2 + k * rx * 0.2, by - ry - u - (k > 3 ? u : 0), A[1]);
  }
  if (form === 'camel') {
    // 驼峰：一高一低两个
    blob(c, cx - rx * 0.25, by - ry * 0.9, rx * 0.35, ry * 0.7, P, 7);
    blob(c, cx + rx * 0.25, by - ry * 0.75, rx * 0.28, ry * 0.55, P, 8);
  }
  if (form === 'yak') {
    // 牦牛：长毛裙一直垂到膝盖
    for (let k = 0; k < 12; k++) {
      const fx = cx - rx * 0.9 + k * rx * 0.16;
      limb(p, fx, by + ry * 0.4, fx + (k % 2 ? 0.5 : -0.5) * u, by + ry + 2.5 * u + (k % 3) * u * 0.5, k % 2 ? P[0] : P[1], u);
    }
    blob(c, cx + rx * 0.45, by - ry * 0.6, rx * 0.4, ry * 0.55, P, 9);
  }
  if (form === 'rhino') {
    // 犀牛：身上几道皮甲褶
    for (const k of [-0.35, 0.1, 0.5]) limb(p, cx + rx * k, by - ry * 0.8, cx + rx * k - u, by + ry * 0.6, P[0], u);
  }
  drawLegs(false);
  if (winged) wing(c, cx - rx * 0.2, by - ry * 0.7, 'near', form === 'dragon' ? 17 : 13, form === 'dragon');
  // 头
  const neckUp = form === 'camel' ? 8 * u : form === 'lion' ? 2 * u : form === 'deer' ? 6 * u : form === 'goat' || form === 'drake' ? 3 * u : form === 'dragon' ? 5 * u : form === 'griffin' ? 3 * u : reptile ? 0 : 1.5 * u;
  const hx = cx + rx * 0.85 + (o.open ? u : 0);
  const hy = by - ry * 0.4 - neckUp + (form === 'boar' || form === 'mammoth' || form === 'rhino' || form === 'yak' ? ry * 0.4 : 0) + (o.anim === 'attack' ? o.raise * -u : 0);
  if (neckUp > u) limb(p, cx + rx * 0.6, by - ry * 0.3, hx, hy, P[1], (form === 'camel' ? 2.2 : 3) * u);
  if (form === 'lion') {
    // 鬃毛：头后面一大圈蓬松的毛，用点缀色，越往外越暗
    const mane = shades(A[2]);
    blob(c, hx - u, hy + u, 6.5 * u, 6 * u, mane, 10);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + o.t * 0.6;
      p.set(hx - u + Math.cos(a) * 6.8 * u, hy + u + Math.sin(a) * 6.3 * u, mane[0]);
    }
  }
  const [hr, hh] = cfg.head;
  blob(c, hx, hy, hr * u, hh * u, P, 4);
  const sx = hx + hr * u * 0.7;
  if (cfg.snout) {
    const jaw = o.open * 2 * u;
    if (form === 'croc') {
      fillPoly(p, [[sx - u, hy - 2 * u], [sx + cfg.snout * u, hy - u - jaw * 0.5], [sx + cfg.snout * u, hy], [sx - u, hy + u]], P[2]);
      fillPoly(p, [[sx - u, hy + u + jaw * 0.2], [sx + cfg.snout * u, hy + u + jaw], [sx + cfg.snout * u - u, hy + 2 * u + jaw], [sx - u, hy + 2 * u]], P[1]);
      for (let k = 0; k < cfg.snout; k += 2) p.set(sx + k * u, hy + u + jaw * 0.5, '#ffffff');
    } else {
      blob(c, sx + cfg.snout * u * 0.3, hy + hh * u * 0.25, cfg.snout * u * 0.7 + u, hh * u * 0.55, P, 5);
      p.set(sx + cfg.snout * u, hy + hh * u * 0.1, '#140c10');
      if (o.open > 0.3) limb(p, sx, hy + hh * u * 0.6, sx + cfg.snout * u, hy + hh * u * 0.6 + jaw, '#3a0a10', u);
    }
  }
  if (form === 'griffin') fillPoly(p, [[sx - u, hy - u], [sx + 3 * u, hy], [sx + 2 * u, hy + 2.5 * u], [sx - u, hy + u]], A[2]);
  eye(c, hx + hr * u * 0.3, hy - hh * u * 0.3, reptile || form === 'drake' || form === 'dragon' ? A[3] : '#140c10', c.S >= 40);
  // 耳朵、角
  const top = hy - hh * u;
  if (['wolf', 'fox', 'cat'].includes(form)) {
    const e = form === 'fox' ? 3.5 : 2.5;
    fillPoly(p, [[hx - u, top + u], [hx, top - e * u], [hx + 1.5 * u, top + u]], P[1]);
    fillPoly(p, [[hx - 2.5 * u, top + u], [hx - 2 * u, top - e * u + u], [hx - 0.5 * u, top + u]], P[0]);
  }
  if (form === 'bear' || form === 'boar' || form === 'mammoth' || form === 'lion' || form === 'hyena' || form === 'camel') ell(p, hx - hr * u * 0.4, top + u, 1.3 * u, 1.3 * u, P[0]);
  if (form === 'panther') {
    fillPoly(p, [[hx - u, top + u], [hx - 0.5 * u, top - 2 * u], [hx + u, top + u]], P[1]);
  }
  if (form === 'rhino') {
    // 鼻角一大一小，攻击时往前顶
    const hornX = sx + cfg.snout * u * 0.6 + o.open * u;
    fillPoly(p, [[hornX - 1.5 * u, hy - u], [hornX + 1.5 * u, hy - 7 * u], [hornX + 1.5 * u, hy - u]], A[3]);
    fillPoly(p, [[hornX - 3.5 * u, hy - 2 * u], [hornX - 2.5 * u, hy - 5 * u], [hornX - 1.5 * u, hy - 2 * u]], A[2]);
  }
  if (form === 'yak') {
    // 牦牛角：向两边弯再朝上
    limb(p, hx - u, top + u, hx - 4 * u, top - u, A[3], 1.5 * u);
    limb(p, hx - 4 * u, top - u, hx - 4 * u, top - 4 * u, A[3], u);
    limb(p, hx + u, top + u, hx + 3 * u, top - 2 * u, A[2], 1.2 * u);
  }
  if (form === 'boar' || form === 'mammoth') {
    limb(p, sx + u, hy + hh * u * 0.5, sx + 3 * u, hy - (form === 'mammoth' ? -2 : 1) * u, '#f0ece0', form === 'mammoth' ? 2 * u : u);
  }
  if (form === 'mammoth') {
    const sway = Math.sin(o.t * TAU) * u;
    limb(p, sx, hy + u, sx + 2 * u + sway, g - 3 * u, P[1], 2.5 * u);
  }
  if (form === 'deer') {
    const ax = hx - u;
    limb(p, ax, top, ax - u, top - 5 * u, A[2], u);
    limb(p, ax - u, top - 3 * u, ax - 4 * u, top - 5 * u, A[2], u);
    limb(p, ax - u, top - 4 * u, ax + 2 * u, top - 7 * u, A[2], u);
  }
  if (form === 'goat' || form === 'drake' || form === 'dragon') {
    limb(p, hx - u, top + u, hx - 4 * u, top - 2 * u, A[2], 1.5 * u);
    limb(p, hx - 4 * u, top - 2 * u, hx - 5 * u, top + u, A[2], u);
  }
  if (form === 'goat') limb(p, sx, hy + hh * u, sx - u, hy + hh * u + 2 * u, A[3], u);
  if ((form === 'drake' || form === 'dragon') && o.open > 0.5) breath(c, sx + cfg.snout * u + u, hy + u);
}

function breath(c: Ctx, x: number, y: number) {
  for (let k = 0; k < 7; k++) {
    const d = k * 1.6 * c.u;
    const col = k < 2 ? '#ffffff' : k < 4 ? c.A[3] : c.A[2];
    ell(c.p, x + d, y + (phash(k, c.o.t * 10, 3) - 0.5) * 2 * c.u, c.u * (1 + k * 0.25), c.u * (1 + k * 0.2), col);
  }
}

// ---- 翅膀 ----

function wing(c: Ctx, x: number, y: number, side: 'far' | 'near', span = 9, membrane = false) {
  const { p, u, o } = c;
  // 平时翅膀略微张开向上，扇动时上下摆
  const f = c.o.anim === 'death' ? 0.8 : o.flap * 0.7 + 0.45;
  const tipX = x - span * 0.5 * u + (side === 'far' ? 2 * u : 0);
  const tipY = y - f * span * 0.8 * u - (side === 'far' ? u : 0);
  const col = side === 'far' ? c.P[0] : membrane ? mix(c.P[1], c.A[1], 0.45) : c.P[3];
  const pts: [number, number][] = [[x, y], [tipX, tipY], [tipX - 2 * u, tipY + 3 * u], [x - span * 0.6 * u, y + 2 * u], [x - 2 * u, y + 2 * u]];
  fillPoly(p, pts, col);
  if (membrane) {
    limb(p, x, y, tipX, tipY, c.P[0]);
    limb(p, x - u, y, x - span * 0.6 * u, y + 2 * u, c.P[0]);
  } else {
    for (let k = 1; k <= 3; k++) limb(p, x, y + u, tipX + (k - 2) * u, tipY + k * u, side === 'far' ? c.P[0] : c.P[1]);
  }
}

// ---- 小动物 ----

function small(c: Ctx) {
  const { p, u, g, o, P, A, form } = c;
  const hop = form === 'rabbit' || form === 'frog' ? (o.moving ? -Math.round(Math.abs(Math.sin(o.phase)) * 3 * u) : 0) : o.bob;
  const cx = c.S / 2 + o.lean;
  if (form === 'hen') {
    const by = g - 5 * u + hop;
    for (const s of [0, Math.PI]) {
      const sw = o.moving ? Math.sin(o.phase + s) * 1.5 * u : 0;
      limb(p, cx, by + 3 * u, cx + sw, g, '#e0a030', u);
    }
    fillPoly(p, [[cx - 6 * u, by - 3 * u], [cx - 3 * u, by], [cx - 6 * u, by + u]], P[1]);
    blob(c, cx, by, 5 * u, 4 * u * o.squash);
    const peck = o.open * 2 * u;
    const hx = cx + 3.5 * u;
    const hy = by - 4 * u + peck;
    blob(c, hx, hy, 2.5 * u, 2.5 * u);
    fillPoly(p, [[hx + 2 * u, hy - u], [hx + 4.5 * u, hy], [hx + 2 * u, hy + u]], '#f0b030');
    ell(p, hx, hy - 3 * u, 1.5 * u, u, A[2]);
    p.set(hx + 2 * u, hy + 2 * u, A[2]);
    eye(c, hx + u, hy - u);
    fillPoly(p, [[cx - 2 * u, by - u], [cx + 2 * u, by], [cx - 2 * u, by + 2 * u + o.flap * u]], P[1]);
    return;
  }
  if (form === 'frog') {
    const by = g - 3 * u + hop;
    const stretch = hop < 0 ? 2 * u : 0;
    limb(p, cx - 4 * u, by + u, cx - 6 * u - stretch, g, P[1], 2 * u);
    blob(c, cx, by, 5.5 * u, 3.5 * u * o.squash);
    ell(p, cx + u, by + u, 3.5 * u, 1.5 * u, A[3]);
    limb(p, cx + 3 * u, by + u, cx + 4 * u, g, P[1], 1.5 * u);
    for (const ex of [cx + 1.5 * u, cx + 4 * u]) {
      ell(p, ex, by - 3 * u, 1.5 * u, 1.5 * u, P[2]);
      p.set(ex, by - 3 * u, '#140c10');
    }
    if (o.open > 0.3) limb(p, cx + 5 * u, by, cx + 5 * u + o.open * 7 * u, by - u, '#e05070', u);
    return;
  }
  // 兔子、老鼠
  const rat = form === 'rat';
  const by = g - 3 * u + hop;
  if (rat) limb(p, cx - 4 * u, by + u, cx - 10 * u, by + Math.sin(o.t * TAU) * u + u, A[2], u);
  else ell(p, cx - 4.5 * u, by - u, 1.5 * u, 1.5 * u, '#ffffff');
  for (const s of [0, Math.PI]) {
    const sw = o.moving ? Math.sin(o.phase + s) * 1.5 * u : 0;
    limb(p, cx - 2 * u + sw, by + u, cx - 2 * u + sw, g, P[0], 1.5 * u);
    limb(p, cx + 2 * u - sw, by + u, cx + 2 * u - sw, g, P[1], 1.5 * u);
  }
  blob(c, cx, by, (rat ? 5 : 4.5) * u, (rat ? 2.8 : 3.5) * u * o.squash);
  const hx = cx + 4 * u + o.open * u;
  const hy = by - (rat ? 1 : 2.5) * u;
  blob(c, hx, hy, 2.5 * u, 2.2 * u);
  p.set(hx + 2.5 * u, hy + 0.5 * u, A[2]);
  eye(c, hx + u, hy - u);
  if (rat) ell(p, hx - u, hy - 2.5 * u, 1.3 * u, 1.3 * u, A[2]);
  else {
    const flop = o.moving ? Math.sin(o.phase) * u : 0;
    limb(p, hx - u, hy - 2 * u, hx - 2 * u + flop, hy - 7 * u, P[1], 1.5 * u);
    limb(p, hx, hy - 2 * u, hx + flop, hy - 7 * u, P[2], 1.5 * u);
  }
}

// ---- 飞禽与蝙蝠 ----

function flyer(c: Ctx) {
  const { p, u, o, P, A, form } = c;
  const bat = form === 'bat';
  const fly = o.anim === 'death' ? Math.min(1, o.t * 1.5) * (c.g - c.S * 0.45) : 0;
  const cx = c.S / 2 + o.lean;
  const by = c.S * 0.45 + o.bob + Math.round(Math.sin(o.t * TAU) * u) + fly;
  const span = bat ? 9 : 10;
  wing(c, cx, by - u, 'far', span, bat);
  if (form === 'phoenix' || form === 'hawk') {
    const len = form === 'phoenix' ? 9 : 5;
    fillPoly(p, [[cx - 3 * u, by - u], [cx - len * u, by + 2 * u + Math.sin(o.t * TAU) * u], [cx - len * u + u, by + 4 * u], [cx - 3 * u, by + 2 * u]], form === 'phoenix' ? A[2] : P[1]);
  }
  blob(c, cx, by, (bat ? 3.5 : 5) * u, (bat ? 3 : 3.5) * u);
  if (!bat) ell(p, cx + u, by + u, 3 * u, 2 * u, A[3]);
  // 爪子
  const claw = o.anim === 'attack' ? o.open * 3 * u : 0;
  limb(p, cx, by + 3 * u, cx + claw, by + 5 * u + claw * 0.3, bat ? P[0] : '#e0a030');
  const hx = cx + (bat ? 3 : 4.5) * u + (o.open ? u : 0);
  const hy = by - (bat ? 2 : 3) * u;
  blob(c, hx, hy, 2.5 * u, 2.5 * u);
  if (bat) {
    fillPoly(p, [[hx - 2 * u, hy - u], [hx - u, hy - 5 * u], [hx, hy - u]], P[1]);
    fillPoly(p, [[hx, hy - u], [hx + u, hy - 5 * u], [hx + 2 * u, hy - u]], P[2]);
    eye(c, hx + u, hy, A[2]);
    if (o.open > 0.3) p.set(hx + 2 * u, hy + 2 * u, '#ffffff');
  } else {
    fillPoly(p, [[hx + 2 * u, hy - u], [hx + 5 * u, hy + u], [hx + 2 * u, hy + 2 * u]], form === 'phoenix' ? A[3] : '#e0b030');
    eye(c, hx + u, hy - u, form === 'phoenix' ? '#ffffff' : '#140c10');
    if (form !== 'hawk' || c.rank !== 'normal') fillPoly(p, [[hx - 2 * u, hy - u], [hx - 3 * u, hy - 5 * u], [hx, hy - 2 * u]], A[2]);
  }
  wing(c, cx - u, by, 'near', span, bat);
  if (form === 'phoenix') sparks(c, cx, by, 6, A);
}

function sparks(c: Ctx, x: number, y: number, n: number, pal: string[]) {
  for (let k = 0; k < n; k++) {
    const ph = (c.o.t + k / n) % 1;
    const sx = x + (phash(k, 1, 9) - 0.5) * 12 * c.u;
    const sy = y + 6 * c.u - ph * 14 * c.u;
    c.p.set(sx, sy, ph < 0.5 ? pal[3] : pal[2]);
  }
}

// ---- 软泥 ----

function slime(c: Ctx) {
  const { p, u, g, o, P, A } = c;
  if (c.form === 'jellyfish') return jellyfish(c);
  const sq = o.anim === 'death' ? o.squash * 0.7 : o.squash;
  const jump = o.moving ? Math.round(Math.sin(o.phase) * 2 * u) : 0;
  const stretch = o.anim === 'attack' ? o.open * 3 * u : 0;
  const rx = 7 * u * (2 - sq) * 0.95 + stretch;
  const ry = 6 * u * sq;
  const cx = c.S / 2 + o.lean;
  const cy = g - ry + Math.min(0, -jump);
  blob(c, cx, cy, rx, ry, P, 6);
  ell(p, cx - rx * 0.35, cy - ry * 0.45, rx * 0.25, ry * 0.18, P[3]);
  p.set(cx - rx * 0.45, cy - ry * 0.55, '#ffffff');
  ell(p, cx + rx * 0.05, cy + ry * 0.2, rx * 0.3, ry * 0.25, A[1]);
  for (const ex of [cx + rx * 0.25, cx + rx * 0.55]) {
    ell(p, ex, cy - ry * 0.1, u, 1.5 * u, '#140c10');
    p.set(ex, cy - ry * 0.25, '#ffffff');
  }
  if (c.rank === 'boss') {
    const top = cy - ry - u;
    fillPoly(p, [[cx - 4 * u, top + 2 * u], [cx - 4 * u, top - 2 * u], [cx - 2 * u, top], [cx, top - 3 * u], [cx + 2 * u, top], [cx + 4 * u, top - 2 * u], [cx + 4 * u, top + 2 * u]], '#f0c040');
  }
}

/** 水母：半透明的伞盖一张一缩地漂着，下面一串飘动的触手 */
function jellyfish(c: Ctx) {
  const { p, u, g, o, P, A } = c;
  const pulse = o.anim === 'move' ? Math.sin(o.phase) : Math.sin(o.t * TAU);
  const cx = c.S / 2 + o.lean;
  const cy = g - 13 * u + pulse * u + o.bob + (o.anim === 'death' ? o.t * 6 * u : 0);
  const rx = (6 + pulse * 0.8) * u * (o.anim === 'attack' ? 1 + o.open * 0.2 : 1);
  const ry = (4.5 - pulse * 0.6) * u * o.squash;
  // 触手：每根是一串点，越往下越淡
  for (let k = 0; k < 6; k++) {
    const bx = cx - rx * 0.8 + (k * rx * 1.6) / 5;
    const len = (8 + (k % 3) * 2) * u + (o.anim === 'attack' ? o.open * 4 * u : 0);
    for (let j = 0; j < len; j += u) {
      const wave = Math.sin(j / (2.5 * u) + o.t * TAU + k) * 1.2 * u;
      p.set(bx + wave, cy + ry * 0.5 + j, j > len * 0.6 ? A[1] : k % 2 ? A[2] : P[1]);
    }
  }
  // 伞盖：上半椭圆，边缘一圈波浪裙边
  for (let y = Math.floor(cy - ry); y <= cy + ry * 0.4; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const lit = -dx * 0.5 - dy * 0.8;
      p.set(x, y, lit > 0.6 ? P[3] : lit > 0 ? P[2] : P[1]);
    }
  }
  for (let x = Math.floor(cx - rx); x <= cx + rx; x += u) p.set(x, cy + ry * 0.4 + (Math.floor(x / u) % 2) * u, A[2]);
  // 里面的发光内核
  ell(p, cx, cy - ry * 0.1, rx * 0.35, ry * 0.35, A[3]);
  p.set(cx - rx * 0.45, cy - ry * 0.55, '#ffffff');
  eye(c, cx + rx * 0.3, cy - ry * 0.05);
}

// ---- 虫类 ----

function insect(c: Ctx) {
  const { p, u, g, o, P, A, form } = c;
  const cx = c.S / 2 + o.lean;
  if (form === 'wasp') {
    const by = c.S * 0.45 + o.bob + Math.round(Math.sin(o.t * TAU * 2) * u) + (o.anim === 'death' ? o.t * (g - c.S * 0.45) : 0);
    const buzz = Math.sin(o.t * TAU * 4);
    fillPoly(p, [[cx, by - u], [cx - 3 * u, by - 7 * u - buzz * 2 * u], [cx + u, by - 6 * u - buzz * 2 * u]], mix(P[3], '#ffffff', 0.5));
    blob(c, cx - 3 * u, by + u, 4 * u, 3 * u, A);
    for (let k = 0; k < 3; k++) limb(p, cx - 5 * u + k * 2 * u, by - 2 * u, cx - 5 * u + k * 2 * u, by + 4 * u, P[0], u);
    fillPoly(p, [[cx - 7 * u, by + u], [cx - 10 * u - o.open * 2 * u, by + 3 * u + o.open * u], [cx - 6 * u, by + 3 * u]], '#140c10');
    blob(c, cx + 2 * u, by, 2.5 * u, 2 * u);
    blob(c, cx + 5 * u, by - u, 2 * u, 2 * u);
    eye(c, cx + 6 * u, by - 2 * u, '#c02020');
    for (let k = 0; k < 3; k++) limb(p, cx + k * 1.5 * u, by + 2 * u, cx + k * 1.5 * u - u, by + 5 * u, P[0]);
    return;
  }
  const scorp = form === 'scorpion';
  const spider = form === 'spider';
  const legs = spider ? 4 : 3;
  const bodyY = g - (spider ? 5 : form === 'mantis' ? 7 : 4) * u + o.bob;
  const drawLegs = (far: boolean) => {
    for (let k = 0; k < legs; k++) {
      const lx = cx - 3 * u + k * (spider ? 2.2 : 2.5) * u;
      const off = (k % 2 ? Math.PI : 0) + (far ? Math.PI / 2 : 0);
      const sw = o.moving ? Math.sin(o.phase * 2 + off) * 1.5 * u : 0;
      const kneeX = lx + (k - legs / 2) * 2 * u + (far ? -u : u);
      const kneeY = bodyY - (spider ? 4 : 2) * u;
      const fx = lx + (k - legs / 2) * 3.5 * u + sw;
      limb(p, lx, bodyY, kneeX, kneeY, far ? P[0] : P[1], spider ? 1.2 * u : u);
      limb(p, kneeX, kneeY, fx, g, far ? P[0] : P[1], u);
    }
  };
  drawLegs(true);
  if (scorp) {
    // 尾巴：一串节，攻击时往前蛰
    const strike = o.anim === 'attack' ? o.open : 0;
    const wind = o.raise;
    let px = cx - 5 * u;
    let py = bodyY;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 - (k / 5) * (2.2 + wind * 0.4 - strike * 0.9);
      px += Math.cos(a + Math.PI) * -2 * u * 0 + Math.sin(-a) * 0;
      const ang = Math.PI - (k / 5) * (Math.PI * 0.95 - strike * 1.2 + wind * 0.3);
      px = px + Math.cos(ang) * 2.2 * u;
      py = py - Math.sin(ang + Math.PI / 2 * 0) * 0 - 2 * u * Math.cos((k / 5) * 1.2) + (k > 3 ? strike * 2 * u : 0);
      ell(p, px, py, (1.8 - k * 0.15) * u, (1.8 - k * 0.15) * u, k % 2 ? P[1] : P[2]);
    }
    fillPoly(p, [[px, py - u], [px + 3 * u, py + 2 * u], [px, py + u]], A[2]);
  }
  if (form === 'ant') {
    blob(c, cx - 5 * u, bodyY - u, 4 * u, 3 * u, P, 7);
    blob(c, cx, bodyY - u, 2.5 * u, 2 * u);
    blob(c, cx + 4 * u, bodyY - 2 * u, 2.5 * u, 2.5 * u);
    limb(p, cx + 6 * u, bodyY - u, cx + 8 * u + o.open * u, bodyY + u - o.open * u, A[2], u);
    limb(p, cx + 4 * u, bodyY - 4 * u, cx + 6 * u, bodyY - 7 * u, P[0]);
    eye(c, cx + 5 * u, bodyY - 3 * u, '#ffffff');
  } else if (spider) {
    blob(c, cx - 4 * u, bodyY - 2 * u, 5 * u * o.squash, 4.5 * u * o.squash, P, 7);
    ell(p, cx - 4 * u, bodyY - 3 * u, 2 * u, 1.5 * u, A[2]);
    blob(c, cx + 2.5 * u, bodyY - u, 3 * u, 2.5 * u);
    for (let k = 0; k < (c.S >= 32 ? 4 : 2); k++) p.set(cx + 3 * u + (k % 2) * u, bodyY - 2 * u + Math.floor(k / 2) * u, A[3]);
    limb(p, cx + 5 * u, bodyY, cx + 6 * u + o.open * u, bodyY + 2 * u, '#140c10');
  } else if (form === 'beetle') {
    blob(c, cx - u, bodyY - 2 * u, 7 * u, 4 * u * o.squash, P, 7);
    limb(p, cx - u, bodyY - 6 * u, cx - u, bodyY + u, P[0]);
    ell(p, cx - 3 * u, bodyY - 4 * u, 2 * u, u, P[3]);
    blob(c, cx + 6 * u, bodyY - u, 2.5 * u, 2 * u, A);
    const lift = o.anim === 'attack' ? -o.open * 2 * u : 0;
    limb(p, cx + 7 * u, bodyY - 2 * u, cx + 10 * u, bodyY - 6 * u + lift, A[2], 1.5 * u);
    eye(c, cx + 7 * u, bodyY - u, '#ffffff');
  } else if (form === 'mantis') {
    blob(c, cx - 4 * u, bodyY, 5 * u, 2.5 * u, P, 7);
    fillPoly(p, [[cx - 7 * u, bodyY - 2 * u], [cx, bodyY - 3 * u], [cx - 2 * u, bodyY]], A[3]);
    limb(p, cx, bodyY - u, cx + 3 * u, bodyY - 8 * u, P[2], 2 * u);
    const hx = cx + 4 * u;
    const hy = bodyY - 10 * u;
    fillPoly(p, [[hx - 2 * u, hy - u], [hx + 2 * u, hy - 2 * u], [hx + 2 * u, hy + 2 * u]], P[2]);
    eye(c, hx + u, hy - u, A[2]);
    // 镰刀前臂
    const reach = o.anim === 'attack' ? o.open * 4 * u - o.raise * 2 * u : 0;
    limb(p, cx + 3 * u, bodyY - 6 * u, cx + 6 * u + reach, bodyY - 7 * u - o.raise * 3 * u, P[1], 1.5 * u);
    limb(p, cx + 6 * u + reach, bodyY - 7 * u - o.raise * 3 * u, cx + 5 * u + reach * 1.3, bodyY - 2 * u, A[2], u);
  } else if (scorp) {
    blob(c, cx - u, bodyY - u, 6 * u, 3 * u * o.squash, P, 7);
    for (let k = 0; k < 4; k++) p.paint(cx - 4 * u + k * 2 * u, bodyY - 3 * u, P[0]);
    // 钳子
    const snap = o.open * 2 * u;
    limb(p, cx + 4 * u, bodyY, cx + 7 * u, bodyY - 2 * u, P[1], 1.5 * u);
    ell(p, cx + 8 * u + snap, bodyY - 3 * u, 2 * u, 1.5 * u, A[1]);
    eye(c, cx + 4 * u, bodyY - 2 * u, '#ffffff');
  }
  drawLegs(false);
}

// ---- 螃蟹 ----

function crab(c: Ctx) {
  const { p, u, g, o, P, A } = c;
  const cx = c.S / 2 + o.lean + (o.moving ? Math.sin(o.phase) * u : 0);
  const by = g - 5 * u + o.bob;
  for (let k = 0; k < 3; k++) {
    const sw = o.moving ? Math.sin(o.phase * 2 + k) * u : 0;
    limb(p, cx - 4 * u + k * 2 * u, by, cx - 7 * u + k * 2 * u + sw, g, P[0], u);
    limb(p, cx + 2 * u + k * 2 * u, by, cx + 4 * u + k * 2 * u - sw, g, P[1], u);
  }
  blob(c, cx, by - u, 7 * u, 4 * u * o.squash, P, 8);
  for (let k = 0; k < 3; k++) p.paint(cx - 3 * u + k * 3 * u, by - 3 * u, P[3]);
  for (const ex of [cx + 2 * u, cx + 4 * u]) {
    limb(p, ex, by - 4 * u, ex, by - 7 * u, P[1]);
    ell(p, ex, by - 7.5 * u, u, u, '#140c10');
  }
  const lift = o.raise * 3 * u;
  const snap = o.open * 2 * u;
  for (const [x0, far] of [[cx - 6 * u, true], [cx + 6 * u, false]] as [number, boolean][]) {
    const clx = x0 + (far ? -2 : 2) * u + (far ? 0 : snap);
    const cly = by - 6 * u - lift;
    limb(p, x0, by - u, clx, cly + 2 * u, far ? P[0] : P[1], 1.5 * u);
    ell(p, clx, cly, 2.5 * u, 2 * u, far ? A[1] : A[2]);
    limb(p, clx + u, cly - u, clx + 3 * u, cly - 2 * u - snap, far ? A[0] : A[1], u);
  }
}

// ---- 蛇、鳗、蠕虫 ----

function serpent(c: Ctx) {
  const { p, u, g, o, P, A, form } = c;
  const cx = c.S / 2 + o.lean;
  const eel = form === 'eel';
  const worm = form === 'worm';
  const segs = 12;
  const len = (eel ? 22 : 18) * u;
  const w = (worm ? 3.2 : eel ? 2.2 : 2.4) * u;
  const baseY = eel ? c.S * 0.55 + o.bob : g - w;
  const pts: [number, number][] = [];
  for (let k = 0; k <= segs; k++) {
    const q = k / segs;
    const x = cx - len / 2 + q * len * (worm ? 0.6 : 0.8);
    const wave = Math.sin(q * 6 - o.t * TAU * (o.moving ? 2 : 1)) * (eel ? 2.5 : 1.5) * u;
    let y = baseY + wave;
    if (!eel && !worm && q > 0.7) y -= (q - 0.7) / 0.3 * (6 + o.raise * 3) * u;
    if (worm) y = g - Math.sin(q * Math.PI) * (8 + o.raise * 3) * u * o.squash - (q > 0.8 ? (q - 0.8) * 20 * u : 0) + w * 0.5;
    pts.push([x, y]);
  }
  pts.forEach(([x, y], k) => {
    const q = k / segs;
    const r = w * (worm ? 1 : 0.6 + q * 0.5);
    ell(p, x, y, r, r, k % 3 === 0 ? P[1] : P[2]);
    if (!worm && k % 2) p.set(x, y + r * 0.6, A[3]);
  });
  if (eel) fillPoly(p, [[pts[3][0], pts[3][1] - w], [pts[8][0], pts[8][1] - w * 2], [pts[9][0], pts[9][1] - w]], A[1]);
  const [hx0, hy0] = pts[segs];
  const hx = hx0 + 2 * u + (o.anim === 'attack' ? o.open * 3 * u : 0);
  const hy = hy0 - u;
  if (worm) {
    ell(p, hx, hy, w * 1.2, w * 1.2, P[1]);
    ell(p, hx + u, hy, w * 0.7, w * 0.8 + o.open * u, '#3a0a10');
    for (let k = 0; k < 4; k++) p.set(hx + u + Math.cos(k * 1.6) * w * 0.6, hy + Math.sin(k * 1.6) * w * 0.6, '#ffffff');
    for (let k = 0; k < 4; k++) ell(p, cx - len * 0.3 + k * 3 * u, g, 2 * u, u, '#5a4030');
    return;
  }
  blob(c, hx, hy, 3 * u, 2.4 * u);
  if (c.m.id === 'mire_hydra') {
    for (const d of [-4, 4]) {
      limb(p, hx - 4 * u, hy + 2 * u, hx - 2 * u, hy + d * u - 3 * u, P[1], 2 * u);
      blob(c, hx - u, hy + d * u - 4 * u, 2.5 * u, 2 * u);
      eye(c, hx, hy + d * u - 5 * u, A[2]);
    }
  }
  eye(c, hx + u, hy - u, A[2]);
  if (o.open > 0.2 || (o.anim === 'idle' && o.t > 0.6)) limb(p, hx + 3 * u, hy + u, hx + 5 * u, hy + u + (o.t > 0.8 ? u : 0), '#e03040');
  if (c.m.traits.includes('venom')) for (const [x, y] of pts.slice(2, 9)) p.paint(x, y - u, A[1]);
}

// ---- 人形 ----

function humanoid(c: Ctx) {
  const { p, u, g, o, P, A, form, m } = c;
  const big = ['orc', 'yeti', 'troll', 'golem', 'gargoyle'].includes(form);
  const tiny = form === 'goblin' || form === 'imp';
  const robed = form === 'cultist' || form === 'lich';
  const floating = form === 'lich';
  const bony = form === 'skeleton';
  const golem = form === 'golem' || form === 'gargoyle';
  const skin = form === 'yeti' ? P : bony ? shades('#e8e4d4') : golem ? P
    : form === 'zombie' ? P : form === 'goblin' || form === 'orc' || form === 'troll' || form === 'imp' ? P : shades('#e0b088');
  const cloth = form === 'zombie' ? A : form === 'goblin' || form === 'orc' || form === 'troll' || form === 'imp' ? A : P;
  const sc = big ? 1.25 : tiny ? 0.85 : 1.1;
  const legL = (golem ? 5 : 6) * u * sc;
  const hip = g - legL + o.bob - (floating ? 3 * u + Math.round(Math.sin(o.t * TAU) * u) : 0);
  const torsoH = 7 * u * sc * o.squash;
  const torsoW = (golem ? 5.5 : big ? 4.5 : 3.2) * u * sc;
  const cx = c.S / 2 - u + o.lean + (form === 'troll' ? u : 0);
  const shoulder = hip - torsoH;
  const hunch = form === 'troll' || form === 'zombie' || form === 'gargoyle' ? 2 * u : 0;
  // 腿
  if (!robed) {
    for (const [s, far] of [[Math.PI, true], [0, false]] as [number, boolean][]) {
      const sw = o.moving ? Math.sin(o.phase + s) * 2.5 * u : o.anim === 'attack' && !far ? o.open * 1.5 * u : 0;
      const col = far ? skin[0] : bony ? skin[2] : form === 'knight' ? P[1] : cloth[golem ? 1 : 0];
      limb(p, cx + (far ? -u : u), hip, cx + (far ? -u : u) + sw, g - (o.moving ? Math.max(0, Math.cos(o.phase + s)) * 1.5 * u : 0), col, (golem ? 3.5 : bony ? 1 : big ? 2.5 : 2) * u * sc);
    }
  }
  // 翅膀、尾巴
  if (form === 'imp' || form === 'gargoyle') wing(c, cx - u, shoulder + 2 * u, 'far', form === 'imp' ? 6 : 10, true);
  if (form === 'imp') limb(p, cx - 2 * u, hip, cx - 6 * u, hip + Math.sin(o.t * TAU) * u - 2 * u, P[1]);
  // 后手臂
  const armLen = (big ? 7 : 5.5) * u * sc * (form === 'troll' ? 1.3 : 1);
  const swingB = o.moving ? -Math.sin(o.phase) * 0.5 : 0;
  const armW = (golem ? 3 : bony ? 1 : big ? 2.2 : 1.6) * u * sc;
  limb(p, cx - u, shoulder + 1.5 * u + hunch, cx - u + Math.sin(swingB) * armLen, shoulder + 1.5 * u + hunch + Math.cos(swingB) * armLen, skin[0], armW);
  // 身体
  if (robed) {
    fillPoly(p, [[cx - torsoW, shoulder + hunch], [cx + torsoW, shoulder + hunch], [cx + torsoW + 2 * u, floating ? hip + 4 * u : g], [cx - torsoW - 2 * u, floating ? hip + 4 * u : g]], cloth[1]);
    limb(p, cx + torsoW * 0.3, shoulder + 2 * u, cx + torsoW * 0.6, floating ? hip + 3 * u : g - u, cloth[2]);
    limb(p, cx - torsoW, shoulder + hunch + u, cx - torsoW - 2 * u, floating ? hip + 4 * u : g, cloth[0]);
    if (floating) for (let k = 0; k < 3; k++) p.set(cx - 2 * u + k * 2 * u, hip + 5 * u + (k % 2) * u, A[2]);
  } else if (bony) {
    limb(p, cx, shoulder + hunch, cx, hip, skin[2], u);
    for (let k = 0; k < 3; k++) limb(p, cx - 2 * u, shoulder + 2 * u + k * 1.6 * u, cx + 2 * u, shoulder + 2 * u + k * 1.6 * u, skin[k % 2 ? 1 : 2]);
    limb(p, cx - 2 * u, hip, cx + 2 * u, hip, skin[1]);
    if (m.id === 'bone_knight') fillPoly(p, [[cx - 3 * u, shoulder], [cx + 3 * u, shoulder], [cx + 2 * u, hip - u], [cx - 2 * u, hip - u]], A[1]);
  } else {
    blob(c, cx + hunch * 0.3, shoulder + torsoH * 0.5 + hunch * 0.5, torsoW, torsoH * 0.6, golem ? P : form === 'knight' ? P : cloth, 9);
    if (golem) for (let k = 0; k < 3; k++) limb(p, cx - torsoW * 0.5 + k * u * 2, shoulder + 2 * u + k * u, cx - torsoW * 0.3 + k * u * 2, shoulder + 5 * u + k * u, A[2]);
    if (form === 'knight') {
      limb(p, cx - torsoW * 0.6, shoulder + 3 * u, cx + torsoW * 0.6, shoulder + 3 * u, A[2]);
      ell(p, cx + torsoW * 0.2, shoulder + 5 * u, u, u, A[3]);
    }
    if (form === 'bandit' || form === 'pirate') limb(p, cx - torsoW, hip - u, cx + torsoW, hip - u, '#3a2a1a', u);
    if (form === 'zombie') for (let k = 0; k < 3; k++) p.paint(cx - u + k * u, hip - u + (k % 2) * u, '#2a1a12');
    if (form === 'yeti' || form === 'troll') for (let k = 0; k < 6; k++) p.paint(cx - torsoW + k * u * 1.5, shoulder + torsoH * 0.9, skin[0]);
  }
  // 头
  const hr = (golem ? 3 : big ? 3.6 : tiny ? 3.2 : 2.8) * u * sc * (tiny ? 1.1 : 1);
  const hx = cx + (big ? 1.5 * u : u) + hunch + (o.anim === 'attack' ? o.open * u : 0);
  const hy = shoulder - hr * 0.7 + hunch;
  if (golem) {
    fillPoly(p, [[hx - hr, hy - hr], [hx + hr, hy - hr * 0.8], [hx + hr, hy + hr], [hx - hr, hy + hr]], P[2]);
    limb(p, hx - hr, hy + hr, hx + hr, hy + hr, P[0]);
    for (const ex of [hx, hx + hr * 0.6]) p.set(ex, hy, A[3]);
  } else {
    blob(c, hx, hy, hr, hr, skin, 10);
    eye(c, hx + hr * 0.45, hy - u * 0.5, bony || form === 'lich' ? A[2] : form === 'zombie' || form === 'imp' ? A[3] : '#140c10');
    if (bony || form === 'lich') {
      ell(p, hx + hr * 0.1, hy - u * 0.5, u * 0.9, u * 0.9, '#140c10');
      p.set(hx + hr * 0.1, hy - u * 0.5, A[2]);
      for (let k = 0; k < 3; k++) p.set(hx + k * u, hy + hr * 0.7, '#140c10');
    }
  }
  // 头饰
  const top = hy - hr;
  if (form === 'goblin') {
    fillPoly(p, [[hx - hr, hy - u], [hx - hr - 4 * u, hy - 3 * u], [hx - hr + u, hy + u]], skin[1]);
    p.set(hx + hr, hy + u, skin[1]);
  }
  if (form === 'imp' || form === 'gargoyle' || m.id === 'frost_giant' || m.id === 'cinder_imp') {
    limb(p, hx - u, top + u, hx - 2 * u, top - 3 * u, A[2], u);
    limb(p, hx + u, top + u, hx + 2 * u, top - 2.5 * u, A[3], u);
  }
  if (form === 'bandit') limb(p, hx - hr, top + u * 1.5, hx + hr, top + u * 1.5, A[2], 1.5 * u);
  if (form === 'pirate') {
    fillPoly(p, [[hx - hr - 2 * u, top + u], [hx + hr + 2 * u, top + u], [hx + hr, top - 2 * u], [hx - hr, top - 2 * u]], '#2a2228');
    limb(p, hx - hr, top, hx + hr, top, A[2]);
    for (let k = 0; k < 3; k++) p.paint(hx + k * u - u, hy + hr * 0.8, '#3a2418');
  }
  if (form === 'knight') {
    fillPoly(p, [[hx - hr - u, hy + hr * 0.6], [hx - hr - u, top], [hx + hr + u, top], [hx + hr + u, hy + hr * 0.6]], P[2]);
    limb(p, hx, hy - u * 0.3, hx + hr + u, hy - u * 0.3, '#140c10');
    limb(p, hx - u, top, hx - 4 * u, top - 3 * u + Math.sin(o.t * TAU) * u, A[2], 1.5 * u);
  }
  if (form === 'cultist' || form === 'lich') {
    fillPoly(p, [[hx - hr - u, hy + hr], [hx - hr, top - u], [hx + u, top - 3 * u], [hx + hr + u, top + u], [hx + hr, hy - u]], cloth[form === 'lich' ? 0 : 1]);
    if (form === 'lich' || c.rank !== 'normal') fillPoly(p, [[hx - 2 * u, top], [hx - 2 * u, top - 2 * u], [hx, top - u], [hx + 2 * u, top - 3 * u], [hx + 2 * u, top]], A[3]);
  }
  if (form === 'orc' || form === 'troll') {
    p.set(hx + hr * 0.6, hy + hr * 0.5, '#f0ece0');
    p.set(hx + hr * 0.6, hy + hr * 0.5 - u, '#f0ece0');
  }
  // 前手臂 + 武器
  const weapon = golem || form === 'yeti' || form === 'zombie' ? 'fist'
    : form === 'cultist' || form === 'lich' || /shaman|witch/.test(m.id) ? 'staff'
    : form === 'troll' || form === 'goblin' ? 'club'
    : form === 'orc' ? 'axe' : form === 'imp' ? 'fist' : 'sword';
  const swing = o.anim === 'attack' ? (o.raise > 0 && o.open === 0 ? Math.PI * 0.95 * o.raise : Math.PI * (0.95 - 0.85 * (o.open > 0 ? 1 - o.raise : 1)) * (o.t < 0.625 ? 1 : 0.4)) : o.moving ? Math.sin(o.phase) * 0.5 : 0.25;
  const a = (form === 'zombie' && o.anim !== 'attack' ? Math.PI / 2 : 0) + swing;
  const sx = cx + u + hunch;
  const sy = shoulder + 1.5 * u + hunch;
  const ex = sx + Math.sin(a) * armLen;
  const ey = sy + Math.cos(a) * armLen;
  limb(p, sx, sy, ex, ey, skin[bony ? 2 : 1], armW);
  if (golem) ell(p, ex, ey, 2.2 * u * sc, 2.2 * u * sc, P[2]);
  const wl = (weapon === 'staff' ? 11 : weapon === 'sword' ? 7 : 6) * u * (big ? 1.2 : 1);
  const wa = a - (weapon === 'staff' ? 2.6 : 2.0);
  const wx = ex + Math.sin(wa) * wl;
  const wy = ey + Math.cos(wa) * wl;
  if (weapon === 'sword') {
    limb(p, ex, ey, wx, wy, '#c5cad2', u);
    limb(p, ex + Math.sin(wa + 1.57) * 1.5 * u, ey + Math.cos(wa + 1.57) * 1.5 * u, ex - Math.sin(wa + 1.57) * 1.5 * u, ey - Math.cos(wa + 1.57) * 1.5 * u, '#8a6a3a');
    if (form === 'knight' || c.rank !== 'normal') limb(p, (ex + wx) / 2, (ey + wy) / 2, wx, wy, '#ffffff');
  } else if (weapon === 'club' || weapon === 'axe') {
    limb(p, ex, ey, wx, wy, '#6a4a2a', u * 1.2);
    if (weapon === 'club') ell(p, wx, wy, 2 * u, 2 * u, '#5a3a22');
    else fillPoly(p, [[wx, wy], [wx + Math.sin(wa + 1.57) * 3 * u, wy + Math.cos(wa + 1.57) * 3 * u], [wx - Math.sin(wa) * 3 * u + Math.sin(wa + 1.57) * 2 * u, wy - Math.cos(wa) * 3 * u + Math.cos(wa + 1.57) * 2 * u]], '#9aa0a8');
  } else if (weapon === 'staff') {
    const bx = ex - Math.sin(wa) * 3 * u;
    const byy = ey - Math.cos(wa) * 3 * u;
    limb(p, bx, byy, wx, wy, '#6a4a2a', u);
    ell(p, wx, wy, 1.6 * u, 1.6 * u, A[2]);
    p.set(wx, wy, '#ffffff');
    if (o.open > 0.3) sparks(c, wx + 2 * u, wy + 4 * u, 5, A);
  } else if (form === 'imp' || form === 'yeti') {
    for (let k = 0; k < 3; k++) p.set(ex + u, ey - u + k * u, '#ffffff');
  }
  if (form === 'knight') {
    const shx = cx - torsoW + u;
    fillPoly(p, [[shx - 2 * u, shoulder + 2 * u], [shx + 2 * u, shoulder + 2 * u], [shx + 2 * u, shoulder + 7 * u], [shx, shoulder + 9 * u], [shx - 2 * u, shoulder + 7 * u]], A[1]);
    ell(p, shx, shoulder + 5 * u, u, u, A[3]);
  }
  if (form === 'gargoyle') wing(c, cx, shoulder + 2 * u, 'near', 10, true);
}

// ---- 幽灵、报丧女妖 ----

function ghost(c: Ctx) {
  const { p, u, o, P, A, form } = c;
  const cx = c.S / 2 + o.lean;
  const cy = c.S * 0.45 + Math.round(Math.sin(o.t * TAU) * 1.5 * u) + o.bob;
  const h = 9 * u * o.squash;
  const w = 5 * u;
  const pts: [number, number][] = [[cx - w, cy]];
  for (let k = 0; k <= 6; k++) {
    const q = k / 6;
    pts.push([cx - w - 3 * u + q * (2 * w + 3 * u) - Math.sin(q * 3 + o.t * TAU) * u, cy + h * (0.9 + 0.25 * Math.sin(q * 9 + o.t * TAU * 2)) - (q < 0.3 ? 0 : 0)]);
  }
  pts.push([cx + w, cy]);
  fillPoly(p, pts.reverse(), P[1]);
  blob(c, cx, cy, w, w * 1.1, P, 11);
  fillPoly(p, [[cx - w - u, cy + 2 * u], [cx - w - 4 * u, cy + h + 2 * u], [cx - w + u, cy + h * 0.6]], P[0]);
  if (form === 'banshee') {
    for (let k = 0; k < 5; k++) limb(p, cx - w + k * u, cy - w, cx - w - 4 * u + k * u, cy + h * 0.6 + Math.sin(o.t * TAU + k) * u, A[k % 2 ? 1 : 2]);
  }
  ell(p, cx + w * 0.3, cy - u, w * 0.6, w * 0.65, '#140c10');
  eye(c, cx + w * 0.15, cy - u * 1.5, A[3]);
  eye(c, cx + w * 0.55, cy - u * 1.5, A[3]);
  if (o.open > 0.2 || form === 'banshee') ell(p, cx + w * 0.4, cy + u * 1.2, u * 0.8, u * (0.6 + o.open), A[2]);
  const reach = o.open * 4 * u;
  limb(p, cx + w * 0.6, cy + 3 * u, cx + w + 3 * u + reach, cy + 4 * u - o.raise * 4 * u, P[2], 1.5 * u);
  if (c.rank === 'boss') {
    fillPoly(p, [[cx - 3 * u, cy - w - u], [cx - 3 * u, cy - w - 4 * u], [cx - u, cy - w - 2 * u], [cx + u, cy - w - 5 * u], [cx + 3 * u, cy - w - 2 * u], [cx + 4 * u, cy - w - 4 * u], [cx + 4 * u, cy - w]], A[3]);
  }
}

// ---- 元素、鬼火 ----

function wisp(c: Ctx) {
  const { p, u, o, P, A } = c;
  const cx = c.S / 2 + o.lean;
  const cy = c.S * 0.5 + Math.round(Math.sin(o.t * TAU) * 1.5 * u) + o.bob;
  const r = 5 * u * o.squash * (1 + o.open * 0.25);
  for (let k = 0; k < 5; k++) {
    const a = o.t * TAU + k * 1.3;
    fillPoly(p, [[cx - r * 0.6 + Math.cos(a) * u, cy], [cx + Math.sin(a) * 2 * u, cy - r * 1.8 - Math.sin(a * 2) * u], [cx + r * 0.6, cy]], P[k % 2 ? 1 : 2]);
  }
  blob(c, cx, cy, r, r, P, 12);
  ell(p, cx, cy + u, r * 0.55, r * 0.55, A[2]);
  ell(p, cx, cy + u, r * 0.25, r * 0.25, '#ffffff');
  eye(c, cx + r * 0.3, cy - r * 0.2, '#140c10');
  eye(c, cx + r * 0.7, cy - r * 0.2, '#140c10');
  sparks(c, cx, cy, 6, A);
}

// ---- 植物 ----

function plant(c: Ctx) {
  const { p, u, g, o, P, A, form } = c;
  const cx = c.S / 2 + o.lean;
  if (form === 'treant') {
    const trunkW = 6 * u;
    const top = g - 15 * u * o.squash + o.bob;
    for (const s of [Math.PI, 0]) {
      const sw = o.moving ? Math.sin(o.phase + s) * 2 * u : 0;
      limb(p, cx + (s ? -2 : 2) * u, g - 4 * u, cx + (s ? -4 : 4) * u + sw, g, s ? P[0] : P[1], 2.5 * u);
    }
    limb(p, cx - 2 * u, top + 4 * u, cx - 8 * u, top + 7 * u - o.raise * 2 * u, P[0], 2 * u);
    for (let y = top; y <= g - 3 * u; y++) for (let i = 0; i < trunkW; i++) {
      const x = Math.round(cx - trunkW / 2 + i);
      p.set(x, y, i < 1 ? P[3] : i >= trunkW - 1.5 ? P[0] : phash(x, y, 13) < 0.2 ? P[1] : P[2]);
    }
    ell(p, cx + u, top + 5 * u, 1.5 * u, u, '#140c10');
    p.set(cx + 1.5 * u, top + 5 * u, A[3]);
    ell(p, cx + u, top + 9 * u, 2 * u, 0.8 * u + o.open * u, '#2a1a10');
    blob(c, cx - u, top - u, 9 * u, 6 * u, shades(A[1]), 14);
    for (let k = 0; k < 6; k++) p.paint(cx - 7 * u + k * 3 * u, top - 4 * u + (k % 2) * 3 * u, A[3]);
    const a = o.anim === 'attack' ? Math.PI * (o.open ? 0.3 : 0.9 * o.raise + 0.2) : 0.6 + Math.sin(o.t * TAU) * 0.1;
    limb(p, cx + 2 * u, top + 4 * u, cx + 2 * u + Math.sin(a) * 9 * u, top + 4 * u - Math.cos(a) * 6 * u + 4 * u, P[1], 2 * u);
    return;
  }
  if (form === 'mushroom') {
    const top = g - 12 * u * o.squash + o.bob;
    for (const s of [Math.PI, 0]) {
      const sw = o.moving ? Math.sin(o.phase + s) * 1.5 * u : 0;
      limb(p, cx + (s ? -u : u), g - 3 * u, cx + (s ? -2 : 2) * u + sw, g, '#d8ccb8', 1.5 * u);
    }
    blob(c, cx, g - 6 * u + o.bob, 3.5 * u, 4.5 * u, shades('#efe4d0'), 15);
    eye(c, cx + u, g - 7 * u + o.bob);
    eye(c, cx + 3 * u, g - 7 * u + o.bob);
    if (o.open > 0.3) sparks(c, cx + 4 * u, g - 6 * u, 6, A);
    const capH = 5 * u * (1 + o.open * 0.15);
    blob(c, cx, top + capH * 0.4, 8 * u, capH, P, 16);
    for (let k = 0; k < 5; k++) ell(c.p, cx - 5 * u + k * 2.6 * u, top + (k % 2 ? 0 : 2) * u, u, u, A[3]);
    return;
  }
  if (form === 'mandrake') {
    const top = g - 8 * u * o.squash + o.bob + (o.moving ? -Math.round(Math.abs(Math.sin(o.phase)) * 2 * u) : 0);
    const root = shades(mix(P[2], '#c09060', 0.6));
    limb(p, cx - u, top + 6 * u, cx - 2 * u, g, root[1], u);
    limb(p, cx + u, top + 6 * u, cx + 2 * u, g, root[0], u);
    blob(c, cx, top + 3 * u, 3.5 * u, 4 * u, root, 17);
    eye(c, cx + u, top + 2 * u);
    eye(c, cx + 2.5 * u, top + 2 * u);
    if (o.open > 0.2) ell(p, cx + 2 * u, top + 4.5 * u, u, u * (0.5 + o.open), '#3a0a10');
    const sway = Math.sin(o.t * TAU) * u;
    for (const d of [-3, 0, 3]) fillPoly(p, [[cx, top - u], [cx + d * u + sway, top - 6 * u], [cx + d * u * 0.4 + 1.5 * u, top - u]], P[d ? 1 : 2]);
    ell(p, cx + sway, top - 6 * u, 1.5 * u, 1.5 * u, A[2]);
    return;
  }
  if (form === 'cactoid') {
    // 仙人掌怪：圆柱身子，两只手臂向上弯，满身小刺，头顶开一朵花
    const top = g - 15 * u * o.squash + o.bob + (o.moving ? -Math.round(Math.abs(Math.sin(o.phase)) * 1.5 * u) : 0);
    for (const s of [Math.PI, 0]) {
      const sw = o.moving ? Math.sin(o.phase + s) * 1.5 * u : 0;
      limb(p, cx + (s ? -2 : 2) * u, g - 3 * u, cx + (s ? -2.5 : 2.5) * u + sw, g, P[0], 2 * u);
    }
    const w = 4.5 * u;
    for (let y = top; y <= g - 2 * u; y++) {
      const round = y < top + 3 * u ? Math.sqrt(1 - ((top + 3 * u - y) / (3 * u)) ** 2) : 1;
      for (let x = Math.round(cx - w * round); x <= Math.round(cx + w * round); x++) {
        const s2 = (x - cx) / w;
        // 竖棱
        const rib = Math.abs(Math.round((x - cx) / (1.5 * u))) % 2 === 1;
        p.set(x, y, s2 < -0.5 ? P[3] : s2 > 0.5 ? P[0] : rib ? P[1] : P[2]);
      }
    }
    const armA = o.anim === 'attack' ? o.raise * 3 * u - o.open * 2 * u : Math.sin(o.t * TAU) * u;
    for (const d of [-1, 1]) {
      const ax = cx + d * w;
      const ay = top + 7 * u;
      limb(p, ax, ay, ax + d * 3 * u, ay, P[1], 2.4 * u);
      limb(p, ax + d * 3 * u, ay, ax + d * 3.5 * u + (d > 0 ? armA : 0), ay - 5 * u - (d > 0 ? armA : 0), P[d > 0 ? 1 : 2], 2.2 * u);
    }
    for (let k = 0; k < 14; k++) p.paint(cx - w + phash(k, 1, 31) * w * 2, top + phash(k, 2, 31) * 13 * u, '#f8f4d8');
    eye(c, cx + u, top + 4 * u);
    eye(c, cx + 3 * u, top + 4 * u);
    if (o.open > 0.3) ell(p, cx + 2 * u, top + 7 * u, u, u * (0.5 + o.open), '#3a0a10');
    for (let k = 0; k < 5; k++) ell(p, cx + Math.cos((k / 5) * TAU) * 1.6 * u, top - u + Math.sin((k / 5) * TAU) * 1.2 * u, u, u, A[2]);
    ell(p, cx, top - u, 0.8 * u, 0.8 * u, A[3]);
    return;
  }
  // 缠藤：从地里伸出的花茎，花冠是一张大嘴
  const sway = Math.sin(o.t * TAU) * 2 * u;
  const lunge = o.anim === 'attack' ? o.open * 5 * u - o.raise * 2 * u : 0;
  const hx = cx + sway * 0.5 + lunge;
  const hy = g - 13 * u * o.squash + o.bob;
  for (let k = 0; k <= 10; k++) {
    const q = k / 10;
    ell(p, cx + (hx - cx) * q + Math.sin(q * 5) * 1.5 * u, g - q * (g - hy), 1.4 * u, 1.4 * u, P[k % 2 ? 1 : 2]);
  }
  for (const [d, y] of [[-1, 0.3], [1, 0.55]]) fillPoly(p, [[cx, g - y * (g - hy)], [cx + d * 6 * u, g - y * (g - hy) - 2 * u], [cx + d * 2 * u, g - y * (g - hy) + u]], P[1]);
  const jaw = 1 + o.open * 2;
  ell(p, hx, hy, 4 * u, 3 * u * jaw * 0.6 + u, A[1]);
  ell(p, hx + u, hy, 3 * u, (jaw - 0.6) * u, '#3a0a10');
  for (let k = 0; k < 4; k++) p.set(hx - u + k * u, hy - (jaw - 0.6) * u, '#ffffff');
  for (let k = 0; k < 6; k++) ell(p, hx + Math.cos(k * 1.05) * 4.5 * u, hy + Math.sin(k * 1.05) * 4 * u, u, u, A[2]);
  ell(p, cx, g - u, 4 * u, 1.2 * u, '#3a2a1a');
}

// ---- 魔眼 ----

function eyeball(c: Ctx) {
  const { p, u, o, P, A } = c;
  const cx = c.S / 2 + o.lean;
  const cy = c.S * 0.42 + Math.round(Math.sin(o.t * TAU) * 1.5 * u) + o.bob;
  const r = 7 * u * o.squash;
  const n = c.rank === 'boss' ? 7 : 5;
  for (let k = 0; k < n; k++) {
    const x0 = cx - r * 0.7 + (k / (n - 1)) * r * 1.4;
    let px = x0;
    let py = cy + r * 0.6;
    for (let j = 0; j < 6; j++) {
      const nx = px + Math.sin(o.t * TAU + k + j * 0.7) * 1.2 * u + (o.open ? u * 0.6 : 0);
      const ny = py + 1.6 * u;
      limb(p, px, py, nx, ny, P[j < 3 ? 1 : 0], (1.6 - j * 0.2) * u);
      px = nx;
      py = ny;
    }
  }
  blob(c, cx, cy, r, r, P, 18);
  const lid = o.anim === 'idle' && o.t > 0.8 ? 0.2 : o.anim === 'hurt' ? 0.4 : 1;
  ell(p, cx + r * 0.15, cy, r * 0.75, r * 0.7 * lid, '#f4ece8');
  if (lid > 0.5) {
    const lx = cx + r * 0.3 + (o.anim === 'attack' ? o.open * u : 0);
    ell(p, lx, cy, r * 0.38, r * 0.38, A[2]);
    ell(p, lx, cy, r * 0.16, r * 0.3, '#140c10');
    p.set(lx - r * 0.15, cy - r * 0.15, '#ffffff');
    for (let k = 0; k < 3; k++) p.set(cx - r * 0.4 + k * u, cy + r * 0.3 - k * u, '#c03030');
  }
  if (o.open > 0.5) for (let k = 0; k < 5; k++) p.set(cx + r + k * 2 * u, cy + (k % 2) * u, A[3]);
}

// ---- 龟 ----

function turtle(c: Ctx) {
  const { p, u, g, o, P, A } = c;
  const cx = c.S / 2 - u + o.lean;
  const by = g - 5 * u + o.bob;
  for (const [x, far] of [[cx - 5 * u, true], [cx + 4 * u, false], [cx - 4 * u, false], [cx + 5 * u, true]] as [number, boolean][]) {
    const sw = o.moving ? Math.sin(o.phase + x) * u : 0;
    limb(p, x, by + u, x + sw, g, far ? P[0] : P[1], 2.5 * u);
  }
  const hx = cx + 8 * u + (o.anim === 'attack' ? o.open * 3 * u : o.anim === 'hurt' ? -2 * u : 0);
  limb(p, cx + 5 * u, by, hx, by - 2 * u, P[1], 2.5 * u);
  blob(c, hx, by - 3 * u, 2.5 * u, 2.2 * u);
  eye(c, hx + u, by - 4 * u);
  if (o.open > 0.3) limb(p, hx + u, by - 2 * u, hx + 3 * u, by - 2 * u + o.open * u, '#3a0a10');
  const shell = shades(A[2]);
  blob(c, cx, by - 2 * u, 8 * u, 6 * u * o.squash, shell, 19);
  for (let k = 0; k < 3; k++) {
    const sx = cx - 4 * u + k * 4 * u;
    for (let a = 0; a < 6; a++) p.paint(sx + Math.cos(a) * 2 * u, by - 4 * u + Math.sin(a) * 1.5 * u, shell[0]);
  }
  limb(p, cx - 8 * u, by + u, cx + 8 * u, by + u, P[0], u);
  if (c.m.traits.includes('thorns')) for (let k = 0; k < 4; k++) fillPoly(p, [[cx - 5 * u + k * 3 * u, by - 7 * u], [cx - 4 * u + k * 3 * u, by - 10 * u], [cx - 3 * u + k * 3 * u, by - 7 * u]], A[3]);
}

// ---- 汇总 ----

function draw(c: Ctx) {
  switch (c.form) {
    case 'rabbit': case 'rat': case 'hen': case 'frog': return small(c);
    case 'hawk': case 'phoenix': case 'bat': return flyer(c);
    case 'slime': case 'jellyfish': return slime(c);
    case 'spider': case 'beetle': case 'scorpion': case 'ant': case 'mantis': case 'wasp': return insect(c);
    case 'crab': return crab(c);
    case 'snake': case 'eel': case 'worm': return serpent(c);
    case 'turtle': return turtle(c);
    case 'wyvern': return wyvern(c);
    case 'goblin': case 'bandit': case 'pirate': case 'imp': case 'cultist': case 'knight': case 'orc': case 'yeti': case 'troll':
    case 'skeleton': case 'zombie': case 'lich': case 'golem': case 'gargoyle':
      return humanoid(c);
    case 'ghost': case 'banshee': return ghost(c);
    case 'wisp': return wisp(c);
    case 'treant': case 'mushroom': case 'mandrake': case 'vine': case 'cactoid': return plant(c);
    case 'eye': return eyeball(c);
    default: return beast(c);
  }
}

/** 飞龙：两条腿站着，一对大翅膀 */
function wyvern(c: Ctx) {
  const { p, u, g, o, P, A } = c;
  const cx = c.S / 2 - u + o.lean;
  const by = g - 9 * u + o.bob;
  wing(c, cx, by - 4 * u, 'far', 13, true);
  for (let k = 0; k <= 8; k++) {
    const q = k / 8;
    ell(p, cx - 3 * u - q * 10 * u, by + q * 4 * u + Math.sin(q * 3 + o.t * TAU) * u, (1 - q * 0.7) * 2.5 * u, (1 - q * 0.7) * 2.5 * u, P[1]);
  }
  for (const [s, far] of [[Math.PI, true], [0, false]] as [number, boolean][]) {
    const sw = o.moving ? Math.sin(o.phase + s) * 2 * u : 0;
    limb(p, cx, by + 2 * u, cx + sw + u, g, far ? P[0] : P[1], 2.5 * u);
  }
  blob(c, cx, by, 6 * u, 5 * u * o.squash, P, 20);
  ell(p, cx + 2 * u, by + u, 3 * u, 3 * u, A[3]);
  const hx = cx + 7 * u + (o.open ? 2 * u : 0);
  const hy = by - 8 * u + o.raise * -u;
  limb(p, cx + 3 * u, by - 2 * u, hx - u, hy + u, P[1], 3 * u);
  blob(c, hx, hy, 3.5 * u, 2.8 * u);
  fillPoly(p, [[hx + 2 * u, hy - u], [hx + 6 * u, hy + u], [hx + 2 * u, hy + 2 * u]], P[2]);
  eye(c, hx + u, hy - u, A[3]);
  limb(p, hx - u, hy - 2 * u, hx - 5 * u, hy - 4 * u, A[2], u);
  if (o.open > 0.5) breath(c, hx + 6 * u, hy + u);
  wing(c, cx - u, by - 3 * u, 'near', 13, true);
}

/** 受击闪白、死亡溶解 */
function finish(c: Ctx) {
  const { p, o } = c;
  if (o.anim === 'hurt' && o.t < 0.5) {
    p.data = p.data.map((col) => (col ? mix(col, '#ffffff', 0.65) : col));
  }
  p.outline();
  if (o.anim === 'death' && o.t > 0.25) {
    const k = (o.t - 0.25) / 0.75;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const col = p.get(x, y);
      if (!col) continue;
      if (phash(x, y, 77) < k * 1.15) p.set(x, y, null);
      else p.set(x, y, mix(col, '#1a1020', k * 0.5));
    }
  }
  // 首领脚下一圈光环
  if (c.rank === 'boss' && o.anim !== 'death') {
    for (let x = 0; x < p.w; x++) if (!p.get(x, c.g + 1) && Math.abs(x - c.S / 2) < c.S * 0.35 && (x + Math.floor(o.t * 8)) % 3 === 0) p.set(x, c.g + 1, c.A[3]);
  }
}

export function monsterFrameSize(m: MonsterDef) {
  return SIZE_PX[sizeOf({ form: m.form as Form, rank: m.rank })];
}

export function drawMonsterFrame(m: MonsterDef, anim: MonAnim, i: number): Pix {
  const S = monsterFrameSize(m);
  const n = MON_ANIMS.find((a) => a.key === anim)!.frames;
  const p = new Pix(S, S);
  const seed = m.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const c: Ctx = {
    p, S, u: S / 32, g: S - 3, o: poseOf(anim, i, n), P: shades(m.art.color), A: shades(m.art.accent),
    m, form: m.form as Form, rank: m.rank, r: (k) => phash(seed % 9973, k, 5),
  };
  draw(c);
  finish(c);
  return p;
}

/** 整张精灵表：每种动画一行 */
export function paintMonsterSheet(m: MonsterDef) {
  const S = monsterFrameSize(m);
  const cols = Math.max(...MON_ANIMS.map((a) => a.frames));
  const canvas = document.createElement('canvas');
  canvas.width = cols * S;
  canvas.height = MON_ANIMS.length * S;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  MON_ANIMS.forEach((a, row) => {
    for (let i = 0; i < a.frames; i++) {
      ctx.drawImage(drawMonsterFrame(m, a.key, i).canvas(), i * S, row * S);
      frames.push({ name: `${a.key}-${i}`, x: i * S, y: row * S });
    }
  });
  return { canvas, frames, size: S };
}

const iconCache = new Map<string, string>();
/** 界面里用的头像：待机第一帧 */
export function monsterIconUrl(m: MonsterDef): string {
  let url = iconCache.get(m.id);
  if (!url) {
    url = drawMonsterFrame(m, 'idle', 0).canvas().toDataURL();
    iconCache.set(m.id, url);
  }
  return url;
}
