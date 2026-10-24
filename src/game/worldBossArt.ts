import type { MonsterDef } from '../core/types';
import { ell, fillPoly, finish, limb, mix, shades, type MonAnim } from './monsterArt';
import { phash, Pix } from './pix';

/*
 * 世界首领的专属动画（用户 10-24）：五个首领各画一套，比普通怪大得多（96×96），
 * 帧数也多：待机 12、移动 12、攻击 12、大招 16、受击 6、死亡 16，一共 74 帧。
 * 大招在画面里自带特效（喷火、树根破土、冰刺、落雷、光束），场景里再配一层粒子。
 * 坐标按 48×48 的设计格写，画的时候 ×2。全部朝右画，朝左时翻转。
 */

export const WORLD_SIZE = 96;
export const WORLD_ANIMS = [
  { key: 'idle', frames: 12, rate: 8, repeat: -1 },
  { key: 'move', frames: 12, rate: 12, repeat: -1 },
  { key: 'attack', frames: 12, rate: 16, repeat: 0 },
  { key: 'skill', frames: 16, rate: 12, repeat: 0 },
  { key: 'hurt', frames: 6, rate: 14, repeat: 0 },
  { key: 'death', frames: 16, rate: 10, repeat: 0 },
] as const;

const TAU = Math.PI * 2;
const GROUND = 46;

interface W {
  p: Pix;
  u: number;
  anim: MonAnim;
  /** 动画进度 0-1 */
  t: number;
  /** 帧号（做闪烁用） */
  i: number;
  P: string[];
  A: string[];
  m: MonsterDef;
}

// ---- 设计格坐标的画笔 ----
const E = (w: W, x: number, y: number, rx: number, ry: number, c: string) => ell(w.p, x * w.u, y * w.u, rx * w.u, ry * w.u, c);
const F = (w: W, pts: [number, number][], c: string) => fillPoly(w.p, pts.map(([x, y]) => [x * w.u, y * w.u]), c);
const L = (w: W, x0: number, y0: number, x1: number, y1: number, c: string, width = 0.5) => limb(w.p, x0 * w.u, y0 * w.u, x1 * w.u, y1 * w.u, c, width * w.u);
const dot = (w: W, x: number, y: number, c: string) => w.p.set(x * w.u, y * w.u, c);
const blob = (w: W, x: number, y: number, rx: number, ry: number, pal: string[], seed: number) => w.p.blob(x * w.u, y * w.u, rx * w.u, ry * w.u, pal, seed);
/** 一串圆连成的弯曲肢体（脖子、尾巴、触手） */
function chain(w: W, pts: [number, number][], r0: number, r1: number, col: (k: number) => string) {
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    const seg = Math.min(pts.length - 2, Math.floor(q * (pts.length - 1)));
    const f = q * (pts.length - 1) - seg;
    const [ax, ay] = pts[seg];
    const [bx, by] = pts[seg + 1];
    E(w, ax + (bx - ax) * f, ay + (by - ay) * f, r0 + (r1 - r0) * q, r0 + (r1 - r0) * q, col(k));
  }
}
/** 一道折线闪电 */
function bolt(w: W, x0: number, y0: number, x1: number, y1: number, seed: number, core: string, glow: string) {
  const n = 7;
  let px = x0;
  let py = y0;
  for (let k = 1; k <= n; k++) {
    const q = k / n;
    const nx = x0 + (x1 - x0) * q + (k < n ? (phash(k, seed, 3) - 0.5) * 5 : 0);
    const ny = y0 + (y1 - y0) * q;
    L(w, px, py, nx, ny, glow, 1.4);
    L(w, px, py, nx, ny, core, 0.5);
    px = nx;
    py = ny;
  }
}
/** 地上点状影子 */
const shadow = (w: W, cx: number, rx: number) => {
  for (let x = cx - rx; x <= cx + rx; x += 1) dot(w, x, GROUND + 0.5, w.P[0]);
};
/** 各动画的通用节奏：攻击前摇—出手—收招；大招蓄力—释放—收招 */
const phase = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const strike = (w: W) => (w.anim === 'attack' ? (w.t < 0.4 ? -phase(w.t, 0, 0.4) * 0.6 : w.t < 0.65 ? 1 : 1 - phase(w.t, 0.65, 1)) : 0);
const charge = (w: W) => (w.anim === 'skill' ? (w.t < 0.3 ? phase(w.t, 0, 0.3) : w.t < 0.85 ? 1 : 1 - phase(w.t, 0.85, 1)) : 0);
const release = (w: W) => (w.anim === 'skill' && w.t >= 0.3 && w.t < 0.85 ? phase(w.t, 0.3, 0.85) : -1);
const sink = (w: W) => (w.anim === 'death' ? Math.min(1, w.t * 1.6) : 0);
const recoil = (w: W) => (w.anim === 'hurt' ? -2 * (1 - w.t) : 0);

// ---- 炎煌古龙：四足巨龙，振翅，大招喷出一道火焰，火星往天上卷 ----
function dragon(w: W) {
  const { t, P, A } = w;
  const fire = shades('#ff7a1a');
  const flap = w.anim === 'move' ? Math.sin(t * TAU * 2) : w.anim === 'skill' ? 0.9 * charge(w) + Math.sin(t * TAU * 3) * 0.15 : Math.sin(t * TAU) * 0.45;
  const st = strike(w);
  const ch = charge(w);
  const dn = sink(w);
  const x0 = recoil(w);
  const bob = (w.anim === 'move' ? -Math.abs(Math.sin(t * TAU * 2)) * 0.8 : Math.sin(t * TAU) * 0.4) + dn * 5;
  const bx = 16 + x0;
  const by = 31 + bob - ch * 2;
  shadow(w, bx, 14);
  // 尾巴：从屁股甩到左边，尾尖一团火
  const tw = Math.sin(t * TAU + 1) * 2;
  const tail: [number, number][] = [[bx - 8, by + 1], [bx - 12, by + 4 + tw * 0.5], [bx - 15, by + 1 + tw], [bx - 16, by - 4 + tw]];
  chain(w, tail, 3, 0.8, (k) => (k % 3 ? P[1] : P[0]));
  for (let k = 0; k < 4; k++) dot(w, bx - 16 + (phash(k, w.i, 1) - 0.5) * 2, by - 6 + tw - k * 0.8, k % 2 ? fire[3] : fire[2]);
  // 远处的翅膀
  const wing = (near: boolean) => {
    const sx = bx + 4;
    const sy = by - 6;
    const lift = flap * (near ? 14 : 12) - dn * 10;
    const tipX = sx - (near ? 10 : 6);
    const tipY = sy - 4 - lift;
    const mem = near ? P[2] : P[0];
    F(w, [[sx, sy], [tipX, tipY], [tipX - 8, tipY + 6 + lift * 0.3], [sx - 14, sy + 6], [sx - 4, sy + 4]], mem);
    // 翼骨
    L(w, sx, sy, tipX, tipY, near ? P[3] : P[1], 1);
    L(w, tipX, tipY, tipX - 8, tipY + 6 + lift * 0.3, near ? P[1] : P[0], 0.5);
    L(w, tipX, tipY, sx - 14, sy + 6, near ? P[1] : P[0], 0.5);
    if (near) for (let k = 0; k < 3; k++) dot(w, tipX - 2 - k * 3, tipY + 3 + k * 2 + lift * 0.1 * k, A[2]);
  };
  wing(false);
  // 腿：远侧两条暗一些，走路时前后摆
  const leg = (x: number, far: boolean, ph: number) => {
    const sw = w.anim === 'move' ? Math.sin(t * TAU * 2 + ph) * 2.5 : 0;
    const top = by + 3;
    L(w, x, top, x + sw * 0.5, top + 6, far ? P[0] : P[1], 3.2);
    L(w, x + sw * 0.5, top + 6, x + sw, GROUND - 1, far ? P[0] : P[1], 2.4);
    for (let k = -1; k <= 1; k++) dot(w, x + sw + 1.2 + k * 0.8, GROUND, A[3]);
  };
  leg(bx - 6, true, Math.PI);
  leg(bx + 7, true, 0);
  // 身体和肚皮的鳞甲
  blob(w, bx, by, 12, 7.5 * (1 - dn * 0.25), P, 61);
  for (let k = 0; k < 6; k++) E(w, bx - 7 + k * 2.8, by + 4.5, 1.6, 1, k % 2 ? A[1] : A[2]);
  for (let k = 0; k < 5; k++) F(w, [[bx - 8 + k * 3.5, by - 6.5], [bx - 7 + k * 3.5, by - 9.5], [bx - 6 + k * 3.5, by - 6.5]], P[3]);
  leg(bx - 4, false, 0);
  leg(bx + 9, false, Math.PI);
  // 脖子和头：攻击时往前咬，大招时仰起再往前喷
  const hx = bx + 14 + st * 6 + ch * 2 - dn * 6;
  const hy = by - 13 + st * 4 - ch * 3 + dn * 12 + Math.sin(t * TAU) * 0.6;
  chain(w, [[bx + 8, by - 3], [bx + 12, by - 9], [hx - 3, hy + 2]], 3.4, 2.4, (k) => (k % 4 === 0 ? A[1] : P[1]));
  const open = Math.max(0, st) * 3 + (release(w) >= 0 ? 3.5 : ch * 1.5);
  // 上颚、下颚
  F(w, [[hx - 3, hy - 3], [hx + 2, hy - 3.5], [hx + 7, hy - 1], [hx + 7, hy + 0.5], [hx - 3, hy + 1]], P[2]);
  F(w, [[hx - 2, hy + 1], [hx + 6, hy + 1 + open * 0.6], [hx + 5, hy + 2.5 + open], [hx - 2, hy + 3]], P[1]);
  if (open > 0.5) {
    F(w, [[hx, hy + 1], [hx + 6, hy + 1], [hx + 5, hy + 1 + open]], '#3a0a08');
    for (let k = 0; k < 3; k++) dot(w, hx + 1.5 + k * 1.6, hy + 1.4, '#fff4d6');
  }
  // 角、眼、鼻孔冒火星
  L(w, hx - 2, hy - 3, hx - 7, hy - 7, A[3], 1);
  L(w, hx, hy - 3.5, hx - 4, hy - 8.5, A[2], 1);
  E(w, hx + 1.5, hy - 1.6, 0.9, 0.7, A[3]);
  dot(w, hx + 1.8, hy - 1.6, '#140c10');
  if (w.anim === 'idle' && Math.sin(t * TAU) > 0.6) dot(w, hx + 8, hy - 1.5 - t * 2, fire[2]);
  wing(true);
  // 攻击：一口火喷在嘴前
  if (w.anim === 'attack' && st > 0.5) for (let k = 0; k < 8; k++) E(w, hx + 8 + k * 0.9, hy + 1 + (phash(k, w.i, 2) - 0.5) * 3, 1.4 - k * 0.12, 1.4 - k * 0.12, k < 3 ? fire[3] : fire[2]);
  // 大招：火焰从嘴里斜着喷到身前地上，落地后沿地面烧开，火星往上卷
  const r = release(w);
  if (r >= 0) {
    const sx = hx + 7;
    const sy = hy + 2;
    const ex = 44;
    const ey = GROUND - 2;
    const len = Math.min(1, 0.25 + r * 2);
    for (let k = 0; k < 24; k++) {
      const q = (k / 23) * len;
      const x = sx + (ex - sx) * q + (phash(k, w.i, 4) - 0.5) * (1 + q * 3);
      const y = sy + (ey - sy) * q + (phash(k, w.i, 8) - 0.5) * (1 + q * 3);
      E(w, x, y, 1.3 + q * 1.8, 1.2 + q * 1.5, q < 0.2 ? '#fff4c0' : phash(k, w.i, 5) < 0.5 ? fire[2] : fire[1]);
    }
    if (len >= 1) {
      const spread = Math.min(1, (r - 0.38) * 3);
      for (let k = 0; k < 9; k++) {
        const x = ex + (k - 4) * 1.6 * spread;
        const h = 2 + phash(k, w.i, 9) * 4;
        F(w, [[x - 1.2, GROUND], [x, GROUND - h], [x + 1.2, GROUND]], k % 2 ? fire[2] : fire[3]);
      }
    }
    for (let k = 0; k < 10; k++) dot(w, sx + phash(k, w.i, 6) * (ex - sx + 3), sy - 2 - phash(k, w.i, 7) * 12, fire[3]);
  }
}

// ---- 噬魂魔树：扭曲的巨树，树干上一张嘴两只眼，魂火绕着飘；大招从地里钻出尖刺树根 ----
function soulTree(w: W) {
  const { t, P, A } = w;
  const bark = P;
  const leaf = shades(mix(P[2], A[2], 0.35));
  const st = strike(w);
  const ch = charge(w);
  const dn = sink(w);
  const sway = (w.anim === 'move' ? Math.sin(t * TAU * 2) * 1.2 : Math.sin(t * TAU) * 0.6) + recoil(w) * 0.6 - dn * 4;
  const cx = 22;
  shadow(w, cx, 13);
  // 树根当脚：一圈弯曲的根，走路时轮流抬起
  for (let k = 0; k < 6; k++) {
    const side = k < 3 ? -1 : 1;
    const j = k % 3;
    const lift = w.anim === 'move' && (k + Math.floor(t * 4)) % 2 === 0 ? 1.5 : 0;
    const ex = cx + side * (5 + j * 3.5);
    chain(w, [[cx + side * 2, GROUND - 4], [cx + side * (3 + j * 2), GROUND - 2 - lift], [ex, GROUND - lift * 0.5]], 1.6, 0.6, () => (j === 1 ? bark[0] : bark[1]));
  }
  // 树干：下粗上细，往一边歪
  const top = 14 + dn * 6;
  F(w, [[cx - 7, GROUND - 3], [cx - 5 + sway * 0.5, top + 8], [cx - 3 + sway, top], [cx + 4 + sway, top], [cx + 6 + sway * 0.5, top + 8], [cx + 8, GROUND - 3]], bark[1]);
  for (let k = 0; k < 6; k++) {
    const x = cx - 4 + k * 1.8;
    L(w, x + sway * 0.3, top + 3 + (k % 2) * 2, x + Math.sin(k) * 0.6, GROUND - 5, k % 2 ? bark[0] : bark[2], 0.4);
  }
  // 远处那只枝手
  const arm = (near: boolean) => {
    const sx = cx + (near ? 5 : -4) + sway;
    const sy = top + 7;
    const reach = near ? Math.max(0, st) * 10 : 0;
    const ex = sx + (near ? 9 + reach : -9) ;
    const ey = sy + (near ? 3 - reach * 0.4 + ch * -6 : 2) + Math.sin(t * TAU + (near ? 0 : 2)) * 1.2;
    chain(w, [[sx, sy], [(sx + ex) / 2, sy - 2], [ex, ey]], 1.8, 0.8, () => (near ? bark[2] : bark[0]));
    for (let k = -1; k <= 1; k++) L(w, ex, ey, ex + (near ? 3 : -3), ey + k * 1.6, near ? bark[3] : bark[1], 0.4);
  };
  arm(false);
  // 树冠：几团暗紫色叶子，结着发光的果
  const crown: [number, number, number][] = [[-6, -2, 7], [5, -3, 7], [0, -7, 8], [-9, 3, 5], [9, 2, 5]];
  crown.forEach(([dx, dy, r], k) => blob(w, cx + dx + sway * 1.3, top + dy - 2, r, r * 0.75, leaf, 70 + k));
  for (let k = 0; k < 6; k++) {
    const glow = 0.5 + 0.5 * Math.sin(t * TAU + k);
    E(w, cx - 10 + phash(k, 1, 8) * 20 + sway * 1.3, top - 8 + phash(k, 2, 8) * 10, 0.8, 0.8, glow > 0.5 ? A[3] : A[2]);
  }
  // 脸：两只发光的眼、一张锯齿嘴，攻击和大招时张大
  const fx = cx + 1 + sway * 0.8;
  const fy = top + 10;
  const open = Math.max(0, st) * 2 + ch * 3;
  E(w, fx - 2.5, fy - 3, 1.2, 0.9, A[3]);
  E(w, fx + 2.5, fy - 3, 1.2, 0.9, A[3]);
  dot(w, fx - 2.3, fy - 3, '#ffffff');
  dot(w, fx + 2.7, fy - 3, '#ffffff');
  F(w, [[fx - 3.5, fy], [fx + 3.5, fy], [fx + 2.5, fy + 1.5 + open], [fx - 2.5, fy + 1.5 + open]], '#14081a');
  for (let k = 0; k < 4; k++) {
    F(w, [[fx - 3 + k * 2, fy], [fx - 2 + k * 2, fy + 1.2], [fx - 1 + k * 2, fy]], bark[3]);
    if (open > 0.8) F(w, [[fx - 2.5 + k * 1.8, fy + 1.5 + open], [fx - 1.6 + k * 1.8, fy + 0.4 + open], [fx - 0.7 + k * 1.8, fy + 1.5 + open]], bark[3]);
  }
  arm(true);
  // 魂火：三团绕着树转；大招时被吸进嘴里
  for (let k = 0; k < 3; k++) {
    const a = t * TAU + (k / 3) * TAU;
    const pull = w.anim === 'skill' ? phase(w.t, 0.5, 0.9) : 0;
    const ox = Math.cos(a) * 14 * (1 - pull);
    const oy = Math.sin(a) * 5 * (1 - pull);
    const x = fx + ox;
    const y = fy - 6 + oy + pull * 6;
    E(w, x, y, 1.4, 1.8, A[2]);
    E(w, x, y + 0.4, 0.8, 1, '#ffffff');
    dot(w, x - 0.5, y + 2.2, A[1]);
  }
  // 攻击：枝手抽下去带出一道紫光
  if (w.anim === 'attack' && st > 0.6) for (let k = 0; k < 6; k++) dot(w, cx + 16 + k, top + 6 + k * 1.2, A[3]);
  // 大招：尖刺树根一根接一根从地里钻出来
  const r = release(w);
  if (r >= 0) {
    for (let k = 0; k < 5; k++) {
      const grow = Math.max(0, Math.min(1, r * 6 - k));
      if (grow <= 0) continue;
      const x = 30 + k * 3.6;
      const h = (5 + (k % 2) * 3) * grow;
      F(w, [[x - 1.6, GROUND], [x - 0.3, GROUND - h], [x + 0.6, GROUND - h * 0.7], [x + 1.6, GROUND]], k % 2 ? bark[2] : bark[1]);
      L(w, x - 0.2, GROUND - h, x - 0.2, GROUND - 1, A[2], 0.3);
      for (let j = 0; j < 3; j++) dot(w, x + (phash(j, k, 9) - 0.5) * 4, GROUND - 0.5, bark[0]);
    }
  }
}

// ---- 永冬巨像：冰块堆成的巨人，胸口一颗冰核；大招双拳砸地，冰刺一路炸开 ----
function frostColossus(w: W) {
  const { t, P, A } = w;
  const st = strike(w);
  const ch = charge(w);
  const dn = sink(w);
  const r = release(w);
  const step = w.anim === 'move' ? Math.sin(t * TAU * 2) : 0;
  const bob = (w.anim === 'move' ? Math.abs(step) * 0.8 : Math.sin(t * TAU) * 0.3) + dn * 6;
  const cx = 22 + recoil(w);
  // 砸地那一下整个身体往下一沉
  const slam = r >= 0 && r < 0.25 ? 1.5 : 0;
  const by = 24 + bob + slam - ch * 1.5;
  shadow(w, cx, 13);
  const block = (x0: number, y0: number, x1: number, y1: number, pal: string[]) => {
    F(w, [[x0, y0 + 1], [x0 + 1, y0], [x1 - 1, y0], [x1, y0 + 1], [x1, y1 - 1], [x1 - 1, y1], [x0 + 1, y1], [x0, y1 - 1]], pal[1]);
    L(w, x0 + 1, y0 + 0.5, x1 - 1, y0 + 0.5, pal[3], 0.4);
    L(w, x0 + 0.5, y0 + 1, x0 + 0.5, y1 - 1, pal[2], 0.4);
  };
  // 腿：两根冰柱，走路时左右交替抬起
  const legs = [[cx - 6, -step], [cx + 4, step]] as const;
  for (const [x, s] of legs) block(x - 3, by + 9 - Math.max(0, s) * 1.5, x + 3, GROUND - Math.max(0, s) * 1.5, s > 0 ? P : shades(mix(P[2], '#14202a', 0.2)));
  // 远处的手臂
  const arm = (near: boolean) => {
    const sx = near ? cx + 9 : cx - 9;
    const sy = by - 6;
    let ex = sx + (near ? 2 : -2);
    let ey = sy + 13;
    if (near && st > 0) { ex = sx + 4 + st * 8; ey = sy + 6 - st * 2; }
    if (ch > 0) { ex = sx + (near ? 1 : -1); ey = sy - 10 * ch; }
    if (slam) { ex = sx + (near ? 5 : -3); ey = GROUND - 3; }
    ey += dn * 6;
    L(w, sx, sy, ex, ey, near ? P[1] : P[0], 4.5);
    block(ex - 3, ey - 2.5, ex + 3, ey + 2.5, near ? P : shades(P[0]));
    // 肩上的冰晶尖刺
    F(w, [[sx - 2, sy - 2], [sx - 1, sy - 8], [sx + 0.5, sy - 3]], near ? A[2] : A[1]);
    F(w, [[sx + 0.5, sy - 2], [sx + 2.5, sy - 6], [sx + 2.5, sy - 1]], near ? A[3] : A[1]);
  };
  arm(false);
  // 身体：倒梯形的大冰块，裂纹，胸口冰核一明一暗
  F(w, [[cx - 10, by - 8], [cx + 10, by - 8], [cx + 7, by + 10], [cx - 7, by + 10]], P[1]);
  F(w, [[cx - 10, by - 8], [cx + 10, by - 8], [cx + 9, by - 5], [cx - 9, by - 5]], P[3]);
  L(w, cx - 5, by - 4, cx - 2, by + 4, P[0], 0.3);
  L(w, cx + 6, by - 2, cx + 3, by + 7, P[0], 0.3);
  const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 2) + ch * 0.6;
  E(w, cx, by, 3 + pulse * 0.6, 3 + pulse * 0.6, A[1]);
  E(w, cx, by, 2, 2, pulse > 0.8 ? '#ffffff' : A[3]);
  // 头：小方块，一条发光的眼缝
  block(cx - 3.5, by - 14, cx + 3.5, by - 8, P);
  L(w, cx - 1.5, by - 11, cx + 3, by - 11, A[3], 0.7);
  arm(true);
  // 攻击：拳头前面一圈冰屑
  if (w.anim === 'attack' && st > 0.6) for (let k = 0; k < 7; k++) dot(w, cx + 24 + Math.cos(k) * 3, by + Math.sin(k) * 3, A[3]);
  // 大招：冰刺从近到远依次破土，霜雾往上飘
  if (r >= 0) {
    for (let k = 0; k < 6; k++) {
      const grow = Math.max(0, Math.min(1, r * 7 - k));
      if (grow <= 0) continue;
      const x = 28 + k * 3.3;
      const h = (4 + (k % 3) * 2.5) * grow;
      F(w, [[x - 1.5, GROUND], [x, GROUND - h], [x + 1.5, GROUND]], A[2]);
      L(w, x - 0.3, GROUND - h + 0.5, x - 0.8, GROUND - 0.5, '#ffffff', 0.3);
      F(w, [[x + 1, GROUND], [x + 2, GROUND - h * 0.5], [x + 2.6, GROUND]], P[3]);
    }
    for (let k = 0; k < 10; k++) dot(w, 26 + phash(k, w.i, 3) * 20, GROUND - 2 - phash(k, w.i, 4) * 12 * r, '#ffffff');
  }
}

// ---- 天罚雷鹏：悬在半空的巨鸟，羽毛上窜着电光；大招张开双翼，召下一道道落雷 ----
function thunderRoc(w: W) {
  const { t, P, A } = w;
  const st = strike(w);
  const ch = charge(w);
  const dn = sink(w);
  const r = release(w);
  const flap = w.anim === 'move' ? Math.sin(t * TAU * 2) : w.anim === 'skill' ? 0.4 + ch * 0.6 : w.anim === 'death' ? -0.6 : Math.sin(t * TAU);
  const cx = 22 + recoil(w) + st * 4;
  const cy = 22 + Math.sin(t * TAU) * 1.2 - flap * 1.2 + st * 5 + dn * 18;
  // 地上的影子跟着离地高度变大变小
  shadow(w, cx, 8 + (cy - 22) * 0.3);
  // 尾羽：一把扇子
  for (let k = 0; k < 5; k++) {
    const a = Math.PI + (k - 2) * 0.22 + Math.sin(t * TAU + k) * 0.05;
    L(w, cx - 6, cy + 1, cx - 6 + Math.cos(a) * 11, cy + 1 + Math.sin(a) * 11 + 3, k % 2 ? P[1] : P[2], 1.6);
    dot(w, cx - 6 + Math.cos(a) * 11, cy + 4 + Math.sin(a) * 11, A[2]);
  }
  const wing = (near: boolean) => {
    const sx = cx + 1;
    const sy = cy - 3;
    const lift = flap * (near ? 16 : 13);
    const tipX = sx - (near ? 14 : 9);
    const tipY = sy - lift;
    const col = near ? P[2] : P[0];
    F(w, [[sx + 3, sy], [tipX, tipY], [tipX - 2, tipY + 4], [sx - 10, sy + 6], [sx - 2, sy + 4]], col);
    // 飞羽一根根伸出去
    for (let k = 0; k < 5; k++) {
      const q = k / 4;
      const bx = tipX + (sx - 10 - tipX) * q;
      const byy = tipY + (sy + 6 - tipY) * q;
      L(w, bx, byy, bx - 4, byy + 2 + q * 2, near ? P[1] : P[0], 1);
    }
    if (near) L(w, sx + 3, sy, tipX, tipY, P[3], 0.6);
    // 电光在翅膀上窜
    if (near && (w.i + (near ? 0 : 1)) % 3 === 0) bolt(w, sx, sy + 1, tipX + 2, tipY + 2, w.i, '#ffffff', A[2]);
  };
  wing(false);
  // 爪子：攻击时往前抓
  for (const [dx, far] of [[1, true], [4, false]] as [number, boolean][]) {
    const reach = st > 0 ? st * 4 : 0;
    const fx = cx + dx + reach;
    const fy = cy + 8 + reach * 0.5;
    L(w, cx + dx - 1, cy + 4, fx, fy, far ? P[0] : A[1], 0.8);
    for (let k = -1; k <= 1; k++) L(w, fx, fy, fx + 1.5, fy + 1 + k * 0.6, A[3], 0.4);
  }
  // 身体、胸口的浅色羽毛
  blob(w, cx, cy, 8, 5.5, P, 81);
  E(w, cx + 2, cy + 1.5, 4.5, 3, mix(P[3], A[3], 0.3));
  // 头：弯钩喙、头冠，眼睛发黄光
  const hx = cx + 8 + st * 2 + ch * 1;
  const hy = cy - 5 - ch * 2;
  E(w, hx, hy, 3.6, 3, P[2]);
  F(w, [[hx + 2.5, hy - 1.5], [hx + 7, hy], [hx + 6, hy + 2.5], [hx + 2.5, hy + 1]], A[2]);
  dot(w, hx + 6.6, hy + 2, A[1]);
  if (st > 0.5) F(w, [[hx + 3, hy + 0.5], [hx + 6, hy + 1.5], [hx + 3, hy + 2]], '#2a1008');
  for (let k = 0; k < 4; k++) L(w, hx - 1 - k * 0.6, hy - 2.5, hx - 4 - k * 1.2, hy - 5 - k * 0.8 - ch * 2, k % 2 ? A[2] : P[3], 0.5);
  E(w, hx + 1.2, hy - 0.8, 0.9, 0.8, A[3]);
  dot(w, hx + 1.5, hy - 0.8, '#140c10');
  wing(true);
  // 大招：天上劈下三道雷，打到地上溅出电火花
  if (r >= 0) {
    for (let k = 0; k < 3; k++) {
      const on = Math.floor(r * 9) % 3 === k || r > 0.7;
      if (!on) continue;
      const x = 32 + k * 5.5;
      bolt(w, x + (phash(k, w.i, 1) - 0.5) * 4, 0, x, GROUND, w.i * 7 + k, '#ffffff', A[2]);
      for (let j = 0; j < 4; j++) dot(w, x + (phash(j, k, w.i) - 0.5) * 6, GROUND - phash(j, k, 2) * 3, A[3]);
    }
  }
  // 蓄力：全身窜电
  if (ch > 0.3 && w.anim === 'skill' && w.t < 0.3) bolt(w, cx - 6, cy - 2, cx + 8, cy + 3, w.i, '#ffffff', A[2]);
}

// ---- 虚无魔眼：飘着的巨大眼球，眼皮一眨一眨，下面一圈触手；大招瞳孔聚光射出一道光束 ----
function voidEye(w: W) {
  const { t, P, A } = w;
  const st = strike(w);
  const ch = charge(w);
  const dn = sink(w);
  const r = release(w);
  const cx = 21 + recoil(w);
  const cy = 20 + Math.sin(t * TAU) * 1.5 + dn * 14;
  shadow(w, cx, 9);
  // 触手：六条，各自摆动，攻击时最前面那条甩出去
  for (let k = 0; k < 6; k++) {
    const bx = cx - 7 + k * 2.8;
    const whip = k === 5 ? Math.max(0, st) : 0;
    const pts: [number, number][] = [];
    for (let j = 0; j <= 4; j++) {
      const q = j / 4;
      const wave = Math.sin(t * TAU * (w.anim === 'move' ? 2 : 1) + k * 1.3 + q * 3) * 2 * q;
      pts.push([bx + wave + whip * q * q * 18 + (k - 2.5) * q * 1.5, cy + 9 + q * (14 - whip * 10) - dn * q * 4]);
    }
    chain(w, pts, 1.5, 0.5, (j) => (j > 10 ? A[2] : k % 2 ? P[1] : P[2]));
  }
  // 绕着转的符文碎片
  for (let k = 0; k < 5; k++) {
    const a = t * TAU + (k / 5) * TAU;
    const rr = 17 - ch * 6;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.4;
    if (Math.sin(a) < 0) F(w, [[x, y - 1.2], [x + 1, y], [x, y + 1.2], [x - 1, y]], A[1]);
  }
  // 眼球：深色外壳 + 布满血丝的眼白 + 发光的虹膜和竖瞳
  E(w, cx, cy, 13, 12, P[1]);
  E(w, cx + 1, cy, 11, 10, mix('#e8d8e8', P[3], 0.25));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4;
    L(w, cx + 1 + Math.cos(a) * 10, cy + Math.sin(a) * 9, cx + 1 + Math.cos(a) * 6, cy + Math.sin(a) * 5.5, '#c04060', 0.3);
  }
  const look = w.anim === 'move' ? Math.sin(t * TAU) * 1.5 : 2 + st * 1.5 + ch;
  const ix = cx + 2 + look;
  E(w, ix, cy, 5.5 + ch, 5.5 + ch, A[1]);
  E(w, ix, cy, 4.2 + ch, 4.2 + ch, A[2]);
  E(w, ix, cy, 1.2 + ch * 0.8, 3.6, ch > 0.5 ? '#ffffff' : '#0a0410');
  dot(w, ix - 2, cy - 2.5, '#ffffff');
  // 眼皮：待机时偶尔眨一下，受击时闭紧
  const blink = w.anim === 'idle' ? Math.max(0, 1 - Math.abs(t - 0.6) * 12) : w.anim === 'hurt' ? 1 - w.t : w.anim === 'death' ? Math.min(1, w.t * 2) : 0;
  if (blink > 0) {
    F(w, [[cx - 12, cy - 1], [cx - 8, cy - 10], [cx + 9, cy - 10], [cx + 13, cy - 1], [cx + 13, cy - 1 + blink * 10], [cx - 12, cy - 1 + blink * 10]], P[2]);
    L(w, cx - 12, cy - 1 + blink * 10, cx + 13, cy - 1 + blink * 10, P[0], 0.6);
  }
  // 大招：蓄力时光点往瞳孔聚，然后射出一道光束到画框边
  if (w.anim === 'skill' && w.t < 0.3) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const rr = 14 * (1 - ch);
      dot(w, ix + Math.cos(a) * rr, cy + Math.sin(a) * rr, A[3]);
    }
  }
  if (r >= 0) {
    const thick = 2.5 + Math.sin(r * TAU * 3) * 0.6;
    const x0 = ix + 3;
    F(w, [[x0, cy - thick], [48, cy - thick - 2], [48, cy + thick + 2], [x0, cy + thick]], A[1]);
    F(w, [[x0, cy - thick * 0.6], [48, cy - thick * 0.8], [48, cy + thick * 0.8], [x0, cy + thick * 0.6]], A[3]);
    L(w, x0, cy, 48, cy, '#ffffff', 0.8);
    for (let k = 0; k < 8; k++) dot(w, x0 + phash(k, w.i, 1) * (48 - x0), cy + (phash(k, w.i, 2) - 0.5) * 10, A[3]);
  }
}

const DRAW: Record<string, (w: W) => void> = {
  wb_flame_dragon: dragon,
  wb_soul_tree: soulTree,
  wb_frost_colossus: frostColossus,
  wb_thunder_roc: thunderRoc,
  wb_void_eye: voidEye,
};

export function drawWorldFrame(m: MonsterDef, anim: MonAnim, i: number): Pix {
  const S = WORLD_SIZE;
  const n = WORLD_ANIMS.find((a) => a.key === anim)?.frames ?? 12;
  const p = new Pix(S, S);
  const w: W = { p, u: S / 48, anim, t: i / n, i, P: shades(m.art.color), A: shades(m.art.accent), m };
  (DRAW[m.id] ?? dragon)(w);
  finish({ p, rank: m.rank, g: S - 4, S, A: w.A, o: { anim: anim === 'skill' ? 'attack' : anim, t: w.t } });
  return p;
}
