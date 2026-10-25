import { mix, phash, Pix } from './pix';
import { tl } from '../i18n';

/*
 * 坐骑马和野马（用户 10-24）：全部逐像素画。
 * 坐骑帧和狼一样大（64×44，脚底在第 42 行），每帧分后层、前层，骑手夹在中间。
 * 侧面奔跑用四拍跑步（后左、后右、前左、前右依次落地，最后一段四蹄腾空），
 * 蹄子落地的那段时间跟着地面往后退，不会滑步；腿用两节反向运动学算膝盖和跗关节。
 * 野马（怪物）用同一个画法，缩小画到怪物格子里。
 */

export const HORSE_W = 64;
export const HORSE_H = 44;
export const HORSE_FEET = 42;

/** 毛色：按资质分四档，资质越高越稀有 */
export interface Coat { id: number; name: string; body: string; mane: string; blanket: string; dapple?: boolean; shine?: boolean; sock?: boolean }
export const COATS: Coat[] = [
  { id: 0, name: tl('栗色'), body: '#9a5226', mane: '#3a1c0c', blanket: '#3a6ab0', sock: true },
  { id: 1, name: tl('乌骓'), body: '#2e2832', mane: '#0c0a10', blanket: '#b03a3a' },
  { id: 2, name: tl('银白'), body: '#d4d0c8', mane: '#f8f6f2', blanket: '#6a3ab0', dapple: true },
  { id: 3, name: tl('金鬃'), body: '#dca23e', mane: '#fff4d0', blanket: '#a8202a', shine: true },
];
export { coatOf } from '../core/ranch';

const TAU = Math.PI * 2;
const ramp = (c: string) => [mix(c, '#000000', 0.58), mix(c, '#000000', 0.34), mix(c, '#000000', 0.12), c, mix(c, '#ffffff', 0.28)];
const HOOF = ['#141014', '#2a2228', '#4a4048'];
const LEATHER = ['#2a160a', '#4a2a14', '#6e4220', '#8e5a2c'];
const METAL = '#d8d0b0';

/** 明暗：左上亮，右下暗 */
function shade(R: string[], nx: number, ny: number, dim = 0) {
  const s = -nx * 0.5 - ny * 0.8 + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.45;
  const i = s > 0.72 ? 4 : s > 0.4 ? 3 : s > 0.05 ? 2 : s > -0.35 ? 1 : 0;
  return R[Math.max(0, Math.min(R.length - 1, i - dim))];
}

/** 画笔：设计坐标 ×k 再平移，野马缩小画时共用 */
interface Pen { p: Pix; k: number; ox: number; oy: number }
function ball(d: Pen, cx: number, cy: number, rx: number, ry: number, R: string[], dim = 0, dapple = false) {
  const X = d.ox + cx * d.k;
  const Y = d.oy + cy * d.k;
  const RX = rx * d.k;
  const RY = ry * d.k;
  for (let y = Math.floor(Y - RY - 1); y <= Math.ceil(Y + RY + 1); y++) {
    for (let x = Math.floor(X - RX - 1); x <= Math.ceil(X + RX + 1); x++) {
      const nx = (x + 0.5 - X) / RX;
      const ny = (y + 0.5 - Y) / RY;
      if (nx * nx + ny * ny > 1) continue;
      let c = shade(R, nx, ny, dim);
      // 银白马身上的斑点
      if (dapple && phash(x >> 1, y >> 1, 3) < 0.22 && nx * nx + ny * ny < 0.7) c = R[Math.max(0, R.indexOf(c) - 1)];
      d.p.set(x, y, c);
    }
  }
}
function seg(d: Pen, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, R: string[], dim = 0) {
  const X0 = d.ox + x0 * d.k;
  const Y0 = d.oy + y0 * d.k;
  const X1 = d.ox + x1 * d.k;
  const Y1 = d.oy + y1 * d.k;
  const R0 = Math.max(0.5, r0 * d.k);
  const R1 = Math.max(0.5, r1 * d.k);
  const dx = X1 - X0;
  const dy = Y1 - Y0;
  const len2 = dx * dx + dy * dy || 1;
  const rm = Math.max(R0, R1);
  for (let y = Math.floor(Math.min(Y0, Y1) - rm); y <= Math.ceil(Math.max(Y0, Y1) + rm); y++) {
    for (let x = Math.floor(Math.min(X0, X1) - rm); x <= Math.ceil(Math.max(X0, X1) + rm); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - X0) * dx + (py - Y0) * dy) / len2));
      const r = R0 + (R1 - R0) * t;
      const ex = px - (X0 + dx * t);
      const ey = py - (Y0 + dy * t);
      if (ex * ex + ey * ey > r * r) continue;
      d.p.set(x, y, shade(R, ex / r, ey / r, dim));
    }
  }
}
const dot = (d: Pen, x: number, y: number, c: string) => d.p.set(Math.floor(d.ox + x * d.k), Math.floor(d.oy + y * d.k), c);
function strand(d: Pen, pts: [number, number][], c: string, w = 0.6) {
  for (let i = 0; i + 1 < pts.length; i++) seg(d, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, w * 0.8, [c, c, c, c, c]);
}

/** 两节腿的反向运动学：从髋 (hx,hy) 到蹄 (fx,fy)，关节往 side 那边弯（+1 往前，-1 往后） */
function ik(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, side: number): [number, number] {
  let dx = fx - hx;
  let dy = fy - hy;
  let dist = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (dist > max) { dx *= max / dist; dy *= max / dist; dist = max; }
  const a = Math.atan2(dy, dx);
  const cos = Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
  const b = Math.acos(cos);
  // 屏幕坐标 y 朝下：往前弯 = 关节在髋-蹄连线的前方
  const ang = a - side * b;
  return [hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1];
}

interface Look { R: string[]; M: string[]; coat: Coat; saddle: boolean; foal?: boolean }

/** 一条腿：髋 → 膝/跗 → 蹄，后腿粗、前腿细一点；dim 是远侧变暗 */
function horseLeg(d: Pen, L: Look, hx: number, hy: number, fx: number, fy: number, hind: boolean, dim: number) {
  const l1 = hind ? 9.5 : 8.5;
  const l2 = hind ? 9.5 : 9;
  const [kx, ky] = ik(hx, hy, fx, fy, l1, l2, hind ? -1 : 1);
  seg(d, hx, hy, kx, ky, hind ? 3.4 : 2.8, 1.7, L.R, dim);
  seg(d, kx, ky, fx, fy - 1.2, 1.5, 1.2, L.R, dim);
  // 栗色马四只白袜子
  if (L.coat.sock && !dim) seg(d, fx + (kx - fx) * 0.25, fy - 1.2 - (fy - ky) * 0.25, fx, fy - 1.2, 1.3, 1.2, ramp('#e8e0d0'));
  seg(d, fx - 1.1, fy - 0.6, fx + 1.3, fy - 0.6, 0.9, 0.9, HOOF, 0);
}

/** 侧面一帧的姿势 */
interface SidePose {
  bob: number;
  /** 身体前后倾（弧度，负数抬前身） */
  pitch: number;
  /** 四只蹄子相对各自髋/肩的位置：[远后, 近后, 远前, 近前] */
  feet: [number, number][];
  /** 头的位置（相对肩的偏移） */
  head: [number, number];
  tail: number;
  wind: number;
  mouth: number;
  blink: boolean;
  ear: number;
  /** 0 站着；1 前身完全立起来（嘶鸣） */
  rear?: number;
}

/** 四拍跑步一只蹄子的轨迹：phase 起跳顺序，duty 落地占比 */
function gallopFoot(t: number, phase: number, reach: number, lift: number): [number, number] {
  const duty = 0.4;
  const u = (((t - phase) % 1) + 1) % 1;
  if (u < duty) return [reach - (u / duty) * reach * 2, 0];
  const s = (u - duty) / (1 - duty);
  const e = s * s * (3 - 2 * s);
  return [-reach + e * reach * 2, -Math.sin(Math.PI * s) * lift - (s < 0.5 ? s : 1 - s) * 2];
}
const PHASES = [0, 0.1, 0.38, 0.48];
const gallopBob = (t: number) => -1.6 * Math.sin(TAU * (t - 0.62)) - 0.2;
const gallop = (t: number): SidePose => {
  const bob = gallopBob(t);
  return {
    bob,
    pitch: 0.06 * Math.sin(TAU * (t - 0.15)),
    feet: PHASES.map((ph, k) => gallopFoot(t, ph, k < 2 ? 6.5 : 7.5, k < 2 ? 5 : 7)) as [number, number][],
    head: [9.5 + Math.sin(TAU * t) * 0.8, -9 - bob * 0.6],
    tail: Math.sin(TAU * t) * 0.5, wind: 2.4, mouth: 0, blink: false, ear: -1,
  };
};

/** 鞍位跟着马背起伏（像素，正数往下） */
export function horseSaddle(key: string, i: number): number {
  const a = HORSE_ANIMS.find((x) => key.endsWith(x.key));
  if (!a) return 0;
  const t = i / a.frames;
  if (a.key.startsWith('run')) return Math.round(gallopBob(t));
  if (a.key.startsWith('idle')) return Math.sin(t * TAU) > 0.5 ? -1 : 0;
  return 0;
}

const standing = (t: number, i: number): SidePose => {
  // 待机：呼吸起伏，甩尾巴，偶尔抖耳朵、刨一下前蹄、点一下头
  const stamp = i >= 14 && i <= 18 ? Math.sin(((i - 14) / 4) * Math.PI) : 0;
  return {
    bob: Math.sin(t * TAU) > 0.5 ? -0.5 : 0,
    pitch: 0,
    feet: [[0.5, 0], [-0.8, 0], [0.4, 0], [0.8 + stamp * 2, -stamp * 3]],
    head: [8, -11 + (i >= 4 && i <= 7 ? 1.5 : 0)],
    tail: Math.sin(t * TAU * 2) * 0.7, wind: 0, mouth: 0, blink: i === 20, ear: i === 9 || i === 10 ? 1 : 0,
  };
};
const grazing = (t: number, i: number): SidePose => ({
  // 低头吃草：头一点一点地往下啃
  bob: 0, pitch: 0.02,
  feet: [[0.5, 0], [-0.8, 0], [-0.6, 0], [1.4, 0]],
  head: [9, 11 + Math.abs(Math.sin(t * TAU * 2)) * 1.2],
  tail: Math.sin(t * TAU) * 0.8, wind: 0, mouth: i % 8 < 4 ? 1 : 0, blink: false, ear: i > 10 ? 1 : 0,
});
const rearing = (t: number, i: number): SidePose => {
  // 召唤时：前身立起来嘶鸣，前蹄在空中刨两下，再落地
  const up = (t < 0.2 ? t / 0.2 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3) * 0.8;
  const kick = Math.sin(t * TAU * 3) * up;
  return {
    bob: 0, pitch: -0.75 * up, rear: up,
    feet: [[1.5 * up, 0], [-0.5, 0], [4 + kick * 2, -10 * up + kick * 2], [6 - kick * 2, -12 * up - kick * 2]],
    head: [7 - up * 2, -12 - up * 2],
    tail: -0.6 * up + Math.sin(t * TAU * 2) * 0.3, wind: up * 1.5, mouth: up > 0.5 ? 1 : 0, blink: false, ear: -1 * (i % 2),
  };
};

/** 侧面（朝右）：远侧两条腿画在后层，其余画在前层 */
function drawSide(back: Pen, front: Pen, L: Look, o: SidePose) {
  const { R, M } = L;
  const by = 25 + o.bob;
  // 以后髋为轴转身体（嘶鸣时前身抬起）
  const pivot: [number, number] = [22, 27];
  const rot = (x: number, y: number): [number, number] => {
    const c = Math.cos(o.pitch);
    const s = Math.sin(o.pitch);
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
  };
  const hipF: [number, number] = rot(23, by + 1); // 远后
  const hipN: [number, number] = rot(21.5, by + 1.5);
  const shF: [number, number] = rot(41, by + 1);
  const shN: [number, number] = rot(39.5, by + 1.5);
  const G = HORSE_FEET;
  const foot = (h: [number, number], f: [number, number], hind: boolean): [number, number] =>
    [h[0] + f[0], f[1] === 0 && !o.rear ? G : hind ? G + f[1] : Math.min(G, (o.rear ? h[1] + 14 : G) + f[1])];
  // 后层：远侧的腿
  horseLeg(back, L, hipF[0], hipF[1], ...foot(hipF, o.feet[0], true), true, 1);
  horseLeg(back, L, shF[0], shF[1], ...foot(shF, o.feet[2], false), false, 1);
  // 尾巴：从屁股甩下来，跑起来往后飘
  const [tx, ty] = rot(15.5, by - 3);
  const sw = o.tail;
  const tailPts: [number, number][] = [];
  for (let k = 0; k <= 5; k++) {
    const q = k / 5;
    tailPts.push([tx - q * (3 + o.wind * 3.5) - sw * q * q * 2, ty + q * (13 - o.wind * 3) + Math.sin(q * 3 + sw) * 0.8]);
  }
  for (let j = -1; j <= 1; j++) strand(front, tailPts.map(([x, y], k) => [x + j * 0.6 * (k / 5), y + j * 0.4]), j ? M[2] : M[1], 1.1 - Math.abs(j) * 0.3);
  // 身体：屁股、肚子、胸三团
  const [rx, ry] = rot(20, by - 1);
  const [mx, my] = rot(30, by);
  const [cx, cy] = rot(40, by - 1);
  ball(front, mx, my, 12, 6.2, R, 0, L.coat.dapple);
  ball(front, rx, ry, 7, 6.6, R, 0, L.coat.dapple);
  ball(front, cx, cy, 6.4, 6.2, R, 0, L.coat.dapple);
  // 金鬃马身上的光泽
  if (L.coat.shine) for (let k = 0; k < 5; k++) dot(front, mx - 8 + k * 4, my - 4.5 + (k % 2), '#fff8e0');
  // 近侧的腿
  horseLeg(front, L, hipN[0], hipN[1], ...foot(hipN, o.feet[1], true), true, 0);
  horseLeg(front, L, shN[0], shN[1], ...foot(shN, o.feet[3], false), false, 0);
  // 脖子和头
  const [nx, ny] = rot(42, by - 4);
  const hx = nx + o.head[0] * Math.cos(o.pitch) - o.head[1] * Math.sin(o.pitch);
  const hy = ny + o.head[0] * Math.sin(o.pitch) + o.head[1] * Math.cos(o.pitch);
  seg(front, nx - 1, ny + 1, hx - 1, hy + 1.5, 4.6, 3, R);
  // 头：额头一团，往前下方伸出长脸和嘴
  const down = Math.max(-0.4, Math.min(1.2, (hy - ny) / 14));
  const fdx = Math.cos(0.75 + down * 0.6);
  const fdy = Math.sin(0.75 + down * 0.6);
  ball(front, hx, hy, 3.4, 3, R);
  seg(front, hx, hy, hx + fdx * 6.5, hy + fdy * 6.5, 2.8, 2, R);
  ball(front, hx + fdx * 6.8, hy + fdy * 6.8, 2.3, 2, ramp(mix(L.coat.body, '#2a1a14', 0.35)));
  if (o.mouth) seg(front, hx + fdx * 5, hy + fdy * 5 + 1.6, hx + fdx * 7.6, hy + fdy * 7.6 + 2, 0.6, 0.6, ['#2a0a08', '#2a0a08', '#2a0a08', '#2a0a08', '#2a0a08']);
  dot(front, hx + fdx * 8, hy + fdy * 8 - 0.6, '#140a0a');
  // 眼睛、耳朵
  if (!o.blink) { dot(front, hx + 1.2, hy - 0.6, '#0a0608'); dot(front, hx + 1.2, hy - 1.4, '#ffffff'); }
  else dot(front, hx + 1.2, hy - 0.4, R[0]);
  const earA = -1.9 + o.ear * 0.5;
  seg(front, hx - 1, hy - 2, hx - 1 + Math.cos(earA) * 4, hy - 2 + Math.sin(earA) * 4, 1.1, 0.4, R);
  // 鬃毛：沿着脖子一缕缕往后飘
  for (let k = 0; k < 8; k++) {
    const q = k / 7;
    const x = hx - 2 + (nx - 4 - (hx - 2)) * q;
    const y = hy - 2.5 + (ny - 3 - (hy - 2.5)) * q;
    const len = 3 + q * 2 + o.wind;
    strand(front, [[x, y], [x - len * 0.6, y + len * 0.3 - o.wind * 0.3], [x - len, y + len * 0.7]], k % 2 ? M[2] : M[3], 0.7);
  }
  strand(front, [[hx - 0.5, hy - 2.5], [hx + 1.5, hy + 0.2]], M[3], 0.6);
  // 鞍具：鞍褥、鞍座、前后鞍桥、马镫、缰绳
  if (L.saddle) {
    const [s0x, s0y] = rot(26, by - 6);
    const [s1x, s1y] = rot(36, by - 6.3);
    const bl = ramp(L.coat.blanket);
    seg(front, s0x - 1, s0y + 2.5, s1x + 1, s1y + 2.5, 2.4, 2.4, bl);
    for (let k = 0; k < 5; k++) dot(front, s0x + k * 2.6, s0y + 4.6, '#f0e0a0');
    seg(front, s0x, s0y, s1x, s1y, 1.6, 1.6, LEATHER);
    seg(front, s0x - 0.5, s0y + 0.5, s0x - 1.2, s0y - 2, 1, 0.8, LEATHER);
    seg(front, s1x, s1y + 0.5, s1x + 0.6, s1y - 1.8, 1, 0.8, LEATHER);
    const [stx, sty] = rot(31, by + 3);
    seg(front, (s0x + s1x) / 2, s0y + 1, stx, sty + 2, 0.4, 0.4, [LEATHER[0], LEATHER[0], LEATHER[1], LEATHER[1], LEATHER[1]]);
    dot(front, stx, sty + 3, METAL);
    dot(front, stx + 1, sty + 3, METAL);
    // 缰绳：嘴角到鞍桥
    strand(front, [[hx + fdx * 6, hy + fdy * 6], [hx - 1, hy + 3], [s1x + 1, s1y - 1]], LEATHER[1], 0.35);
    dot(front, hx + fdx * 6, hy + fdy * 6, METAL);
  }
}

/** 正面（朝镜头跑来）：头、胸、前腿在前层；身体、后腿、尾巴在后层 */
function drawFront(back: Pen, front: Pen, L: Look, t: number, run: boolean, i: number) {
  const { R, M } = L;
  const bob = run ? gallopBob(t) : Math.sin(t * TAU) > 0.5 ? -0.5 : 0;
  const lift = (ph: number) => (run ? Math.max(0, -gallopFoot(t, ph, 6, 6)[1]) : 0);
  // 后层：身体、后腿、两边露出一点尾巴
  ball(back, 32, 24 + bob, 9.5, 7, R, 1, L.coat.dapple);
  seg(back, 27, 28 + bob, 27, 41 - lift(0) * 0.6, 2.6, 1.4, R, 1);
  seg(back, 37, 28 + bob, 37, 41 - lift(0.1) * 0.6, 2.6, 1.4, R, 1);
  seg(back, 25.8, 41 - lift(0) * 0.6, 28.2, 41 - lift(0) * 0.6, 0.9, 0.9, HOOF);
  seg(back, 35.8, 41 - lift(0.1) * 0.6, 38.2, 41 - lift(0.1) * 0.6, 0.9, 0.9, HOOF);
  const sw = Math.sin(t * TAU * (run ? 1 : 2)) * 2;
  strand(back, [[37, 22 + bob], [41 + sw, 26 + bob], [42 + sw, 32]], M[2], 1);
  if (L.saddle) {
    seg(back, 24, 18 + bob, 40, 18 + bob, 2.2, 2.2, ramp(L.coat.blanket));
    seg(back, 25, 16.5 + bob, 39, 16.5 + bob, 1.4, 1.4, LEATHER);
  }
  // 前层：胸、前腿
  ball(front, 32, 27 + bob, 7, 6.2, R, 0, L.coat.dapple);
  for (const [x, ph] of [[28.5, 0.38], [35.5, 0.48]] as const) {
    const up = lift(ph);
    seg(front, x, 30 + bob, x, 36 - up * 0.5 + bob * 0.3, 2.4, 1.6, R);
    seg(front, x, 36 - up * 0.5 + bob * 0.3, x, 41 - up, 1.6, 1.3, R);
    if (L.coat.sock) seg(front, x, 39 - up, x, 41 - up, 1.4, 1.3, ramp('#e8e0d0'));
    seg(front, x - 1.2, 41.4 - up, x + 1.2, 41.4 - up, 0.9, 0.9, HOOF);
  }
  // 脖子和朝向镜头的长脸
  const hb = bob * 0.5 + (run ? 0 : Math.sin(t * TAU) * 0.4);
  seg(front, 32, 24 + bob, 32, 14 + hb, 4.4, 3.6, R);
  ball(front, 32, 11 + hb, 3.8, 3.4, R);
  seg(front, 32, 11 + hb, 32, 19 + hb, 3.2, 2.4, R);
  ball(front, 32, 19.5 + hb, 2.6, 2, ramp(mix(L.coat.body, '#2a1a14', 0.35)));
  dot(front, 31, 20 + hb, '#140a0a');
  dot(front, 33, 20 + hb, '#140a0a');
  // 白色额星（栗色、乌骓）
  if (!L.coat.dapple && !L.coat.shine) { dot(front, 32, 11 + hb, '#f4f0e8'); dot(front, 32, 12 + hb, '#f4f0e8'); }
  const blink = !run && i === 20;
  for (const s of [-1, 1]) {
    dot(front, 32 + s * 3, 11 + hb, blink ? R[0] : '#0a0608');
    seg(front, 32 + s * 2.4, 8.5 + hb, 32 + s * 3.6, 4.5 + hb, 1.1, 0.4, R);
  }
  // 额前的鬃毛和脖子两边的鬃毛
  strand(front, [[31, 8 + hb], [32, 10.5 + hb], [33, 9 + hb]], M[3], 0.7);
  for (const s of [-1, 1]) strand(front, [[32 + s * 2, 14 + hb], [32 + s * 4.5, 18 + hb + (run ? 1 : 0)], [32 + s * 5, 22 + bob]], M[2], 0.7);
  if (L.saddle) {
    strand(front, [[29.5, 19 + hb], [27, 22 + bob]], LEATHER[1], 0.35);
    strand(front, [[34.5, 19 + hb], [37, 22 + bob]], LEATHER[1], 0.35);
    dot(front, 29.5, 19 + hb, METAL);
    dot(front, 34.5, 19 + hb, METAL);
  }
}

/** 背面（背对镜头跑远）：屁股、尾巴、后腿在前层；头和前腿在后层 */
function drawBack(back: Pen, front: Pen, L: Look, t: number, run: boolean) {
  const { R, M } = L;
  const bob = run ? gallopBob(t) : Math.sin(t * TAU) > 0.5 ? -0.5 : 0;
  const lift = (ph: number) => (run ? Math.max(0, -gallopFoot(t, ph, 6, 6)[1]) : 0);
  // 后层：脖子、头的后脑勺、耳朵、前腿
  seg(back, 32, 22 + bob, 32, 12 + bob * 0.5, 4.2, 3.4, R, 1);
  ball(back, 32, 10 + bob * 0.5, 3.4, 3, R, 1);
  for (const s of [-1, 1]) seg(back, 32 + s * 2.2, 8 + bob * 0.5, 32 + s * 3.2, 4 + bob * 0.5, 1.1, 0.4, R, 1);
  strand(back, [[32, 8 + bob * 0.5], [31.5, 14 + bob * 0.5], [32.5, 20 + bob]], M[2], 1.2);
  for (const [x, ph] of [[28, 0.38], [36, 0.48]] as const) {
    const up = lift(ph);
    seg(back, x, 30 + bob, x, 41 - up * 0.7, 2, 1.3, R, 1);
    seg(back, x - 1, 41 - up * 0.7, x + 1, 41 - up * 0.7, 0.8, 0.8, HOOF);
  }
  // 前层：屁股两团、后腿、尾巴
  for (const [x, ph] of [[27, 0], [37, 0.1]] as const) {
    const up = lift(ph);
    seg(front, x, 27 + bob, x, 35 - up * 0.4, 3, 2, R);
    seg(front, x, 35 - up * 0.4, x, 41 - up, 1.8, 1.4, R);
    if (L.coat.sock) seg(front, x, 39 - up, x, 41 - up, 1.5, 1.3, ramp('#e8e0d0'));
    seg(front, x - 1.3, 41.4 - up, x + 1.3, 41.4 - up, 0.9, 0.9, HOOF);
  }
  ball(front, 28, 24 + bob, 6, 6.4, R, 0, L.coat.dapple);
  ball(front, 36, 24 + bob, 6, 6.4, R, 0, L.coat.dapple);
  if (L.saddle) {
    seg(front, 25, 18.5 + bob, 39, 18.5 + bob, 1.8, 1.8, ramp(L.coat.blanket));
    seg(front, 26, 17 + bob, 38, 17 + bob, 1.3, 1.3, LEATHER);
  }
  const sw = Math.sin(t * TAU * (run ? 1 : 2)) * (run ? 1.5 : 2.5);
  for (let j = -1; j <= 1; j++) strand(front, [[32 + j * 0.6, 21 + bob], [32 + sw * 0.5 + j, 28 + bob * 0.5], [32 + sw + j * 1.2, 35 - (run ? 2 : 0)]], j ? M[2] : M[1], 1);
}

// ---- 坐骑精灵表 ----

export interface HorseAnim { key: string; frames: number; rate: number }
export const HORSE_ANIMS: HorseAnim[] = [
  // 一个跑步周期 0.5 秒（骑乘速度下），每个方向 32 帧
  { key: 'run-side', frames: 32, rate: 64 },
  { key: 'run-down', frames: 32, rate: 64 },
  { key: 'run-up', frames: 32, rate: 64 },
  { key: 'idle-side', frames: 24, rate: 10 },
  { key: 'idle-down', frames: 24, rate: 10 },
  { key: 'idle-up', frames: 24, rate: 10 },
  // 主角干活时马在旁边低头吃草
  { key: 'sit', frames: 16, rate: 8 },
  // 召唤出来时前身立起嘶鸣
  { key: 'howl', frames: 24, rate: 24 },
];

const lookOf = (coat: number, saddle = true): Look => {
  const c = COATS[coat];
  return { R: ramp(c.body), M: ramp(c.mane), coat: c, saddle };
};

function drawHorse(coat: number, key: string, i: number, n: number): [Pix, Pix] {
  const back = new Pix(HORSE_W, HORSE_H);
  const front = new Pix(HORSE_W, HORSE_H);
  const B = { p: back, k: 1, ox: 0, oy: 0 };
  const F = { p: front, k: 1, ox: 0, oy: 0 };
  const L = lookOf(coat);
  const t = i / n;
  if (key === 'run-side') drawSide(B, F, L, gallop(t));
  else if (key === 'idle-side') drawSide(B, F, L, standing(t, i));
  else if (key === 'sit') drawSide(B, F, L, grazing(t, i));
  else if (key === 'howl') drawSide(B, F, L, rearing(t, i));
  else if (key === 'run-down') drawFront(B, F, L, t, true, i);
  else if (key === 'idle-down') drawFront(B, F, L, t, false, i);
  else if (key === 'run-up') drawBack(B, F, L, t, true);
  else drawBack(B, F, L, t, false);
  back.outlineTinted('#0a0608', 0.6);
  front.outlineTinted('#0a0608', 0.6);
  return [back, front];
}

/** 坐骑的动画前缀：狼是 wolf，马按毛色 horse0…horse3 */
export const horseKind = (coat: number) => `horse${coat}`;

/** 一种毛色的整张精灵表：每帧 `${kind}-${key}-${i}-b`（后层）和 `-f`（前层） */
export function paintHorseSheet(coat: number) {
  const kind = horseKind(coat);
  const total = HORSE_ANIMS.reduce((k, a) => k + a.frames * 2, 0);
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * HORSE_W;
  canvas.height = Math.ceil(total / cols) * HORSE_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of HORSE_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      drawHorse(coat, a.key, i, a.frames).forEach((pix, j) => {
        const x = (k % cols) * HORSE_W;
        const y = Math.floor(k / cols) * HORSE_H;
        ctx.drawImage(pix.canvas(), x, y);
        frames.push({ name: `${kind}-${a.key}-${i}-${j ? 'f' : 'b'}`, x, y });
        k++;
      });
    }
  }
  return { canvas, frames };
}

const icons = new Map<string, string>();
/** 坐骑马图标：侧面站着那一帧 */
export function horseIconUrl(coat: number) {
  const key = `h${coat}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const [b, f] = drawHorse(coat, 'idle-side', 0, 24);
  const c = document.createElement('canvas');
  c.width = 46;
  c.height = 46;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(b.canvas(), -10, 2);
  ctx.drawImage(f.canvas(), -10, 2);
  const url = c.toDataURL();
  icons.set(key, url);
  return url;
}

/** 小马崽：头大腿长，没有鞍具；frame 给畜牧站里的待机动画用 */
export function paintFoal(frame = 0, coat = 0, size = 32): HTMLCanvasElement {
  const p = new Pix(size, size);
  const k = size / 48;
  const d = { p, k, ox: -4 * k, oy: size - 1 - HORSE_FEET * k };
  const L: Look = { ...lookOf(coat, false), foal: true };
  const o = standing((frame % 24) / 24, frame % 24);
  // 小马的头更大更圆、更靠上
  drawSide(d, d, L, { ...o, head: [7, -12 + (frame % 24 > 16 ? 1 : 0)] });
  p.outlineTinted('#0a0608', 0.6);
  return p.canvas();
}
export const foalIconUrl = () => {
  const hit = icons.get('foal');
  if (hit) return hit;
  const url = paintFoal(0, 0, 24).toDataURL();
  icons.set('foal', url);
  return url;
};

// ---- 野马（怪物）：同一套画法缩小，没有鞍具 ----

/** 画一帧野马到怪物格子里：anim 是怪物动画名，t 是进度 */
export function drawWildHorse(p: Pix, S: number, g: number, anim: string, t: number, color: string, accent: string) {
  const k = S / 54;
  const d = { p, k, ox: S / 2 - 32 * k, oy: g - HORSE_FEET * k };
  const L: Look = { R: ramp(color), M: ramp(accent), coat: { ...COATS[0], body: color, mane: accent, sock: false }, saddle: false };
  const i = Math.round(t * 24);
  let o: SidePose;
  if (anim === 'move') o = gallop(t);
  else if (anim === 'attack') o = rearing(Math.min(0.99, t * 0.9 + 0.05), i);
  else if (anim === 'hurt') o = { ...standing(0, 0), pitch: 0.12, head: [6, -8], ear: 1 };
  else if (anim === 'death') {
    const q = Math.min(1, t * 1.4);
    o = { ...standing(0, 0), bob: q * 9, feet: [[2 * q, -q * 3], [-2 * q, -q * 3], [3 * q, -q * 4], [4 * q, -q * 4]], head: [8, -6 + q * 10], ear: 1 };
  } else o = standing(t, i);
  drawSide(d, d, L, o);
}

// ---- 城镇畜牧站（用户 10-24）：红色马厩 + 木栅栏围起来的马场、草料堆、水槽 ----
export const RANCH_W = 120;
export const RANCH_H = 84;
/** 马场里放小马崽的位置（相对图片左上角），每个栏位一个 */
export const PADDOCK_SPOTS: [number, number][] = [[70, 62], [88, 70], [104, 60]];

export function paintRanch(): HTMLCanvasElement {
  const p = new Pix(RANCH_W, RANCH_H);
  const WOOD = ['#4a2c16', '#6e4424', '#8e5c32', '#b07a46'];
  const RED = ['#5a1a14', '#8a2a1e', '#b03a28', '#d0583e'];
  const ROOF = ['#2a2230', '#3e3446', '#554a5e', '#6e627a'];
  // 马场地面：踩实的泥土
  for (let y = 46; y < 82; y++) for (let x = 56; x < 118; x++) {
    const edge = Math.min(x - 56, 117 - x, y - 46, 81 - y);
    if (edge < 0) continue;
    p.set(x, y, phash(x, y, 4) < 0.12 ? '#7a5a36' : phash(x, y, 5) < 0.05 ? '#9a7a4a' : '#8a6a40');
  }
  // 马厩：墙、白色门框和交叉木条、两坡屋顶、阁楼的小窗
  p.rect(4, 34, 52, 44, RED[2]);
  for (let x = 4; x < 56; x += 4) p.rect(x, 34, 1, 44, RED[1]);
  p.rect(4, 34, 2, 44, RED[3]);
  p.rect(53, 34, 3, 44, RED[0]);
  // 屋顶（两坡，屋脊在中间）
  for (let y = 10; y < 36; y++) {
    const half = 8 + (y - 10) * 1.2;
    for (let x = Math.round(30 - half); x <= Math.round(30 + half); x++) {
      if (x < 0 || x >= 60) continue;
      const shingle = (y + (x >> 2)) % 4 === 0;
      p.set(x, y, shingle ? ROOF[0] : x < 30 ? ROOF[2] : ROOF[1]);
    }
  }
  for (let x = 2; x < 59; x++) p.set(x, 35, ROOF[3]);
  // 大门：白框 + X 木条
  p.rect(18, 52, 24, 26, RED[0]);
  p.rect(17, 51, 26, 2, '#f0ece0');
  p.rect(17, 51, 2, 27, '#f0ece0');
  p.rect(41, 51, 2, 27, '#f0ece0');
  p.rect(29, 53, 2, 25, '#f0ece0');
  for (let k = 0; k < 24; k++) {
    p.set(19 + Math.round(k * 10 / 24), 53 + k, '#e0dcd0');
    p.set(28 - Math.round(k * 10 / 24), 53 + k, '#e0dcd0');
    p.set(31 + Math.round(k * 10 / 24), 53 + k, '#e0dcd0');
    p.set(40 - Math.round(k * 10 / 24), 53 + k, '#e0dcd0');
  }
  // 阁楼小窗 + 露出来的草料
  p.rect(25, 38, 10, 9, '#f0ece0');
  p.rect(26, 39, 8, 7, '#2a1a10');
  for (let x = 27; x < 33; x++) p.set(x, 45 - (x % 2), '#e8c858');
  // 马头标志
  ball({ p, k: 1, ox: 0, oy: 0 }, 30, 24, 3, 2.6, ramp('#f0ece0'));
  seg({ p, k: 1, ox: 0, oy: 0 }, 30, 24, 33, 28, 1.6, 1.2, ramp('#f0ece0'));
  // 马场的木栅栏：上下两根横杆，每 8 格一根柱子
  const fence = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      p.set(x, y - 4, WOOD[3]);
      p.set(x, y - 1, WOOD[2]);
      if (k % 8 === 0) { p.rect(x, y - 7, 2, 8, WOOD[1]); p.set(x, y - 7, WOOD[3]); }
    }
  };
  fence(56, 46, 117, 46);
  fence(117, 46, 117, 81);
  fence(56, 81, 117, 81);
  // 草料堆、水槽
  for (const [hx, hy] of [[60, 52], [66, 55]]) {
    p.rect(hx, hy, 8, 6, '#d8b048');
    p.rect(hx, hy, 8, 1, '#f0d070');
    p.rect(hx, hy + 2, 8, 1, '#a88030');
    p.rect(hx, hy + 5, 8, 1, '#a88030');
  }
  p.rect(96, 49, 16, 5, WOOD[1]);
  p.rect(97, 50, 14, 2, '#4a8ad8');
  p.set(99, 50, '#a8d8ff');
  // 招牌
  p.rect(44, 76, 14, 7, WOOD[2]);
  p.rect(44, 76, 14, 1, WOOD[3]);
  p.rect(50, 83, 2, 1, WOOD[0]);
  p.outline();
  return p.canvas();
}
