import { mix, Pix } from './pix';

/*
 * 南瓜坐骑「南瓜灵驹」（用户 10-27）：靠鬼火悬浮着飞的巨型南瓜灯，全部逐像素画。
 * 帧和狼、马一样大（64×44，脚底在第 42 行），后层、前层两张，骑手夹在中间。
 * 南瓜按瓣算明暗（瓣与瓣之间的沟更暗），刻出来的眼睛、鼻子、嘴里透出鬼火的光：
 * 洞口上沿画一圈内壁（看得出南瓜壳的厚度），光每帧明暗跳动。
 * 没有腿，靠底下一团鬼火托着悬浮（用户 10-27）：站着时上下慢慢飘，飞的时候往前倾、离地更高，
 * 鬼火往后拖成尾巴，屁股后面的藤蔓尾巴也往后飘。
 */

export const PK_W = 64;
export const PK_H = 44;
const FEET = 42;
const TAU = Math.PI * 2;

const SKIN = ['#4a1606', '#8a3008', '#c04c0e', '#e66e18', '#f58c2c', '#ffae5a'];
const VINE = ['#16300c', '#28501a', '#3f7a26', '#68a83c', '#9ad060'];
const STEM = ['#2e2410', '#4e3e1a', '#6e5a28', '#8e7a3a'];
const WALL = '#962c08';
const HOLE = '#2a0802';

/** 鬼火的颜色：k 0 最暗（洞口边缘）… 1 最亮（中心），lit 是这一帧的亮度 */
function fire(k: number, lit: number) {
  const v = Math.max(0, Math.min(1, k * 0.7 + lit * 0.45));
  return v > 0.8 ? '#fff8c0' : v > 0.6 ? '#ffe04a' : v > 0.42 ? '#ffb020' : v > 0.26 ? '#9a2a06' : '#480c02';
}

interface Body { cx: number; cy: number; rx: number; ry: number; tilt: number }

/** 南瓜本体：view 0 侧面（朝右）、1 正面、2 背面 */
function pumpkin(p: Pix, b: Body, view: 0 | 1 | 2) {
  const { cx, cy, rx, ry } = b;
  // 侧面：南瓜的正中线偏到右边（脸朝右），瓣跟着偏
  const mid = view === 0 ? 0.45 : 0;
  for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy - nx * b.tilt * ry) / ry;
      // 顶上蒂的位置往下凹一点、底部稍平
      const dent = ny < 0 ? 0.16 * Math.exp(-(((nx - (view === 0 ? -0.15 : 0)) / 0.28) ** 2)) : 0;
      const r2 = nx * nx + (ny > 0 ? ny * ny * 1.06 : ny * ny);
      if (r2 > 1 - dent) continue;
      const z = Math.sqrt(Math.max(0, 1 - r2));
      // 瓣：按经度分，两瓣之间是沟
      const u = Math.asin(Math.max(-1, Math.min(1, nx))) - mid;
      const lobe = Math.abs(Math.cos(u * 5));
      let s = -nx * 0.42 - ny * 0.62 + z * 0.55 + (lobe - 0.55) * 0.55;
      if (view === 2) s -= 0.08;
      let i = s > 0.95 ? 5 : s > 0.68 ? 4 : s > 0.36 ? 3 : s > 0.02 ? 2 : s > -0.38 ? 1 : 0;
      if (lobe < 0.2 && r2 < 0.92) i = Math.max(0, i - (lobe < 0.08 ? 2 : 1));
      // 底下贴地的一圈反射一点地面暖光
      if (ny > 0.78 && i < 2 && nx > -0.6) i = 2;
      p.set(x, y, SKIN[i]);
    }
  }
}

/** 在南瓜上刻一个洞：pts 是相对南瓜中心的像素多边形，光从里面透出来 */
function carve(p: Pix, b: Body, pts: [number, number][], lit: number) {
  // 脸是按 14×10 的南瓜设计的，按实际大小（含压扁拉长）缩放
  const kx = b.rx / 14;
  const ky = b.ry / 10;
  const xs = pts.map((q) => q[0] * kx + b.cx);
  const ys = pts.map((q, k) => q[1] * ky + b.cy + ((xs[k] - b.cx) / b.rx) * b.tilt * b.ry);
  const x0 = Math.floor(Math.min(...xs));
  const x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  const inside = (x: number, y: number) => {
    let c = false;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) {
      if ((ys[k] > y) !== (ys[j] > y) && x < ((xs[j] - xs[k]) * (y - ys[k])) / (ys[j] - ys[k]) + xs[k]) c = !c;
    }
    return c;
  };
  const mx = (x0 + x1) / 2;
  const hw = Math.max(1, (x1 - x0) / 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5) || !p.get(x, y)) continue;
      // 上沿一圈是南瓜壳的内壁（看得到厚度），往下才是透光的里面
      const top = !inside(x + 0.5, y - 0.5);
      const k = 0.25 + ((y - y0) / Math.max(1, y1 - y0)) * 0.6 - Math.abs((x - mx) / hw) * 0.15;
      p.set(x, y, top ? WALL : lit < 0 ? HOLE : fire(k, lit));
    }
  }
}

/** 脸：view 0 侧面（只看到右半边脸），1 正面；mouth 0 闭着 1 张大，lit 鬼火亮度（<0 闭眼的时候眼洞是暗的） */
function face(p: Pix, b0: Body, view: 0 | 1, mouth: number, lit: number, blink = false) {
  const b = { ...b0, cy: b0.cy - 2 * (b0.ry / 10) };
  const e = blink ? -1 : lit;
  if (view === 1) {
    carve(p, b, [[-10.5, -0.5], [-2.5, -0.5], [-6.5, -7.5]], e);
    carve(p, b, [[2.5, -0.5], [10.5, -0.5], [6.5, -7.5]], e);
    carve(p, b, [[-1.8, 2.6], [1.8, 2.6], [0, 0]], lit);
    const o = 0.8 + mouth * 1.5;
    carve(p, b, [[-11.5, 2], [-8, 3.8], [-6, 2.8], [-4, 4.4], [-1.5, 3.4], [1.5, 4.4], [4, 3.2], [6, 4.4], [8, 3.4], [11.5, 2], [10, 6.5 + o], [6, 8.2 + o], [4, 6.6 + o], [1, 8.4 + o], [-2, 6.8 + o], [-5, 8.4 + o], [-9, 6.8 + o]], lit);
  } else {
    carve(p, b, [[2.5, -1], [10.5, -1], [7.5, -8]], e);
    carve(p, b, [[10.5, 2.4], [13.2, 2.4], [12.6, -0.4]], lit);
    const o = 0.8 + mouth * 1.6;
    carve(p, b, [[0.5, 3.2], [4, 4.8], [6, 3.8], [8.5, 5], [11, 3.8], [14, 2.6], [13, 6.8 + o], [10, 8.6 + o], [7.5, 7.2 + o], [4.5, 8.6 + o], [1.5, 6.6 + o]], lit);
  }
  // 刻口：洞的左右和下沿描一圈暗色切面，火光和南瓜皮分得开
  const isHole = (c: string | null) => !!c && !SKIN.includes(c) && c !== WALL;
  const edits: [number, number, string][] = [];
  for (let y = Math.floor(b.cy - 10); y <= b.cy + 12; y++) {
    for (let x = Math.floor(b.cx - b.rx); x <= b.cx + b.rx; x++) {
      const c = p.get(x, y);
      if (!c || !SKIN.includes(c)) continue;
      if (isHole(p.get(x, y - 1)) || isHole(p.get(x - 1, y)) || isHole(p.get(x + 1, y))) edits.push([x, y, '#5a1806']);
    }
  }
  for (const [x, y, c] of edits) p.set(x, y, c);
}

/** 一根有粗细的藤：沿着点画，起点粗终点细 */
function vine(p: Pix, pts: [number, number][], r0: number, r1: number, R = VINE) {
  const n = pts.length - 1;
  for (let k = 0; k < n; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let j = 0; j <= steps; j++) {
      const q = (k + j / steps) / n;
      const x = ax + ((bx - ax) * j) / steps;
      const y = ay + ((by - ay) * j) / steps;
      const r = r0 + (r1 - r0) * q;
      for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
        for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
          const dx = xx + 0.5 - x;
          const dy = yy + 0.5 - y;
          if (dx * dx + dy * dy > r * r + 0.15) continue;
          const s = -dx / Math.max(r, 0.6) - dy / Math.max(r, 0.6);
          p.set(xx, yy, R[s > 0.6 ? 3 : s > -0.3 ? 2 : 1]);
        }
      }
    }
  }
}

/** 卷须：从 (x,y) 出发按角度画一圈螺旋 */
function curl(p: Pix, x: number, y: number, a: number, len: number, turn: number, r = 0.7) {
  const pts: [number, number][] = [[x, y]];
  let cx = x;
  let cy = y;
  for (let k = 1; k <= 10; k++) {
    a += turn * (k / 10);
    cx += Math.cos(a) * (len / 10);
    cy += Math.sin(a) * (len / 10);
    pts.push([cx, cy]);
  }
  vine(p, pts, r, 0.45);
}

/** 叶子：一片有叶脉的南瓜叶，ang 是叶尖方向 */
function leaf(p: Pix, x: number, y: number, ang: number, size: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let v = -size; v <= size; v += 0.5) {
    for (let u = 0; u <= size * 2; u += 0.5) {
      const w = Math.sin((u / (size * 2)) * Math.PI) * size * 0.75 * (1 + 0.18 * Math.sin(u * 2.2));
      if (Math.abs(v) > w) continue;
      const px = x + u * c - v * s;
      const py = y + u * s + v * c;
      const vein = Math.abs(v) < 0.5 || (Math.abs(Math.abs(v) - u * 0.4) < 0.4 && u < size * 1.4);
      p.set(px, py, vein ? VINE[1] : v < 0 ? VINE[3] : VINE[2]);
    }
  }
}

/** 南瓜蒂：一截弯弯的粗茎 */
function stem(p: Pix, x: number, y: number, lean: number) {
  for (let k = 0; k < 6; k++) {
    const q = k / 5;
    const sx = x + lean * q * q * 3;
    const sy = y - k * 0.9;
    const w = 2.2 - q * 0.8;
    for (let dx = -w; dx <= w; dx += 0.5) p.set(sx + dx, sy, STEM[dx < -w * 0.4 ? 3 : dx > w * 0.4 ? 0 : k % 2 ? 1 : 2]);
  }
}

/** 南瓜底下托着它飘的鬼火：贴着南瓜是热的金橙色，往下变成幽紫，火舌一跳一跳；lean 是往后拖的程度（侧面飞的时候） */
const GHOST = ['#2a0c48', '#5a22a0', '#9050e8', '#c8a0ff'];
/** 画在描边之后、只填空像素：火不带黑边，也不会盖住南瓜 */
function ghostfire(p: Pix, b: Body, phase: number, len: number, lean: number) {
  const by = b.cy + b.ry * 0.86;
  const half = b.rx * 0.66;
  const put = (x: number, y: number, c: string) => {
    if (y <= FEET && !p.get(Math.round(x), Math.round(y))) p.set(x, y, c);
  };
  // 五条火舌：中间长两边短，各自一伸一缩
  [-0.8, -0.4, 0, 0.4, 0.8].forEach((q, k) => {
    const L = len * (1 - 0.35 * Math.abs(q)) * (0.68 + 0.32 * Math.sin(phase * TAU * 2 + k * 1.9));
    const w = half * 0.3 * (1 - Math.abs(q) * 0.3);
    const x0 = b.cx + q * half;
    const y0 = by - Math.abs(q) * 2.2;
    for (let st = 0; st <= L; st += 0.5) {
      const f = st / L;
      const ww = w * Math.pow(1 - f, 0.8) + 0.3;
      const cx = x0 - lean * f * f * len * 0.9 + Math.sin(st * 0.8 - phase * TAU * 3 + k) * 0.8 * f;
      const cy = y0 + st - lean * f * 1.2;
      const c = f < 0.14 ? '#fff0a0' : f < 0.3 ? '#ffa030' : f < 0.5 ? GHOST[3] : f < 0.75 ? GHOST[2] : GHOST[1];
      for (let dx = -ww; dx <= ww; dx += 0.5) put(cx + dx, cy, Math.abs(dx) > ww - 0.6 && f > 0.3 ? GHOST[Math.max(1, GHOST.indexOf(c) - 1)] : c);
    }
    // 火舌尖上断开飘走的一点
    const u = (phase * 2 + k * 0.37) % 1;
    put(x0 - lean * (len * 0.9 + u * 4), y0 + L + 1 + u * 2 - lean * 2, u < 0.5 ? GHOST[3] : GHOST[2]);
  });
}

/** 一帧的姿势：float 离地多高，tilt 往前倾 */
interface Pose { float: number; squash: number; tilt: number; tail: number; mouth: number; lit: number; blink: boolean; leaf: number; phase: number; flame: number; lean: number }

const flick = (i: number) => 0.55 + 0.25 * Math.sin(i * 2.7) + 0.2 * Math.sin(i * 7.3 + 1);

const run = (t: number, i: number): Pose => ({
  // 飞：离地更高、往前倾，上下轻轻起伏，鬼火往后拖成一条尾巴
  float: 7.5 + Math.sin(t * TAU) * 1.2, squash: -0.03, tilt: 0.12 + Math.sin(t * TAU) * 0.02, tail: Math.sin(t * TAU) * 0.6,
  mouth: 0.5 + 0.5 * Math.sin(t * TAU), lit: flick(i) + 0.15, blink: false, leaf: 0.6 + Math.sin(t * TAU * 2) * 0.3, phase: t, flame: 11, lean: 1,
});
const idle = (t: number, i: number): Pose => ({
  float: 5.5 + Math.sin(t * TAU) * 1.5, squash: 0.03 * Math.sin(t * TAU), tilt: 0, tail: Math.sin(t * TAU) * 0.4,
  mouth: 0, lit: flick(i), blink: i === 15 || i === 16, leaf: Math.sin(t * TAU) * 0.2, phase: t, flame: 7.5, lean: 0,
});
const sit = (t: number, i: number): Pose => ({
  // 主角干活时：飘低一点，眯着眼打盹，鬼火变小变暗
  float: 3 + Math.sin(t * TAU) * 0.6, squash: 0.06, tilt: 0.03 * Math.sin(t * TAU), tail: Math.sin(t * TAU) * 0.3,
  mouth: 0, lit: 0.25 + 0.15 * Math.sin(t * TAU), blink: i % 16 < 12, leaf: 0, phase: t, flame: 4, lean: 0,
});
const howl = (t: number, i: number): Pose => {
  // 召唤：鬼火猛地窜起，南瓜升高、转一圈似的晃，嘴张大，再慢慢降回去
  const up = t < 0.25 ? Math.sin((t / 0.25) * Math.PI * 0.5) : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  const big = t > 0.2 && t < 0.8;
  return {
    float: 5.5 + up * 6 + Math.sin(t * TAU * 3) * up, squash: big ? -0.06 : 0, tilt: Math.sin(t * TAU * 2) * 0.1 * up, tail: Math.sin(t * TAU * 2) * 0.8,
    mouth: big ? 1 : 0.2, lit: big ? 1 : flick(i), blink: false, leaf: Math.sin(t * TAU * 3) * 0.6, phase: t, flame: 6.5 + up * 5, lean: 0,
  };
};

function bodyOf(o: Pose, view: 0 | 1 | 2): Body {
  const rx0 = view === 0 ? 16.5 : 16;
  const ry0 = 11.5;
  const rx = rx0 * (1 + o.squash * 0.6);
  const ry = ry0 * (1 - o.squash);
  // 正面、背面飞的时候不往前倾（倾斜方向朝着镜头看不出来）
  return { cx: view === 0 ? 30 : 32, cy: FEET - 1 - ry - o.float, rx, ry, tilt: view === 0 ? o.tilt : 0 };
}

/** 侧面（朝右） */
function drawSide(back: Pix, front: Pix, o: Pose) {
  const b = bodyOf(o, 0);
  // 藤蔓尾巴：从屁股后面卷出来，飞起来往后飘
  const tx = b.cx - b.rx + 2;
  const ty = b.cy - 2;
  curl(back, tx, ty, Math.PI + 0.5 + o.tail * 0.4 - o.lean * 0.5, 11 + o.lean * 3, -2.4 - o.tail * 0.6 + o.lean, 1);
  pumpkin(front, b, 0);
  face(front, b, 0, o.mouth, o.lit, o.blink);
  // 蒂和叶子长在偏后的位置，给骑手腾出前面的位置
  const top = b.cy - b.ry * 0.92 + b.tilt * b.ry * -0.4;
  stem(front, b.cx - 4, top, -1 - o.tail * 0.5 - o.lean);
  leaf(front, b.cx - 6, top - 2, Math.PI + 0.35 + o.leaf * 0.4 - o.lean * 0.3, 3.2);
  curl(front, b.cx - 2, top - 3, -2.2 + o.tail * 0.3 - o.lean * 0.5, 6, 2.6, 0.6);
}

/** 正面（朝镜头）：整颗南瓜和脸在后层，叶子在前层 */
function drawFront(back: Pix, front: Pix, o: Pose) {
  const b = bodyOf(o, 1);
  pumpkin(back, b, 1);
  face(back, b, 1, o.mouth, o.lit, o.blink);
  const top = b.cy - b.ry * 0.92;
  stem(back, b.cx, top, 1);
  // 两片叶子垂在南瓜两边，像马鞍旁的挂饰
  leaf(front, b.cx - 9, top + 2, Math.PI * 0.75 + o.leaf * 0.3, 2.6);
  leaf(front, b.cx + 9, top + 2, Math.PI * 0.25 - o.leaf * 0.3, 2.6);
}

/** 背面：看到的是后脑勺，蒂在最前面（离镜头近），透光从两边缝里漏出一点 */
function drawBack(back: Pix, front: Pix, o: Pose) {
  const b = bodyOf(o, 2);
  pumpkin(back, b, 2);
  // 脸在另一面：两侧边缘透出一点火光
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) back.paint(b.cx + sx * (b.rx - 0.5), b.cy + 1 + k, fire(0.3, o.lit));
  const top = b.cy - b.ry * 0.92;
  // 藤蔓尾巴朝镜头这边卷
  curl(front, b.cx + 1, b.cy + 2, 1.6 + o.tail * 0.5, 9, 2.4 + o.tail * 0.5, 1);
  stem(front, b.cx, top + 1, -1);
  leaf(front, b.cx + 2, top - 1, -0.3 + o.leaf * 0.4, 3);
}

export interface PumpkinAnim { key: string; frames: number; rate: number }
export const PK_ANIMS: PumpkinAnim[] = [
  // 飞的起伏一个周期 0.5 秒（骑乘速度下），每个方向 32 帧
  { key: 'run-side', frames: 32, rate: 64 },
  { key: 'run-down', frames: 32, rate: 64 },
  { key: 'run-up', frames: 32, rate: 64 },
  { key: 'idle-side', frames: 24, rate: 10 },
  { key: 'idle-down', frames: 24, rate: 10 },
  { key: 'idle-up', frames: 24, rate: 10 },
  { key: 'sit', frames: 16, rate: 8 },
  { key: 'howl', frames: 24, rate: 24 },
];

function poseOf(key: string, t: number, i: number) {
  return key.startsWith('run') ? run(t, i) : key.startsWith('idle') ? idle(t, i) : key === 'sit' ? sit(t, i) : howl(t, i);
}

function drawPumpkin(key: string, i: number, n: number): [Pix, Pix] {
  const back = new Pix(PK_W, PK_H);
  const front = new Pix(PK_W, PK_H);
  const o = poseOf(key, i / n, i);
  if (key.endsWith('-down')) drawFront(back, front, o);
  else if (key.endsWith('-up')) drawBack(back, front, o);
  else drawSide(back, front, o);
  back.outlineTinted('#1a0604', 0.62);
  front.outlineTinted('#1a0604', 0.62);
  const view = key.endsWith('-down') ? 1 : key.endsWith('-up') ? 2 : 0;
  ghostfire(back, bodyOf(o, view), o.phase, o.flame, view === 0 ? o.lean : 0);
  return [back, front];
}

/** 鞍位跟着南瓜飘的高度起伏（像素，正数往下）；离地 5.5 格时正好是 seatOf 的位置 */
export function pumpkinSaddle(key: string, i: number): number {
  const a = PK_ANIMS.find((x) => x.key === key);
  if (!a) return 0;
  const o = poseOf(key, i / a.frames, i);
  return Math.round(5.5 - o.float + o.squash * 20 + (key === 'run-side' ? 1 : 0));
}

/** 整张精灵表：每帧 `pumpkin-${key}-${i}-b`（后层）和 `-f`（前层） */
export function paintPumpkinSheet() {
  const total = PK_ANIMS.reduce((k, a) => k + a.frames * 2, 0);
  const cols = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * PK_W;
  canvas.height = Math.ceil(total / cols) * PK_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of PK_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      drawPumpkin(a.key, i, a.frames).forEach((pix, j) => {
        const x = (k % cols) * PK_W;
        const y = Math.floor(k / cols) * PK_H;
        ctx.drawImage(pix.canvas(), x, y);
        frames.push({ name: `pumpkin-${a.key}-${i}-${j ? 'f' : 'b'}`, x, y });
        k++;
      });
    }
  }
  return { canvas, frames };
}

let iconUrl = '';
/** 背包、坐骑栏里的图标：侧面待机，火光最亮的一帧 */
export function pumpkinMountIconUrl() {
  if (iconUrl) return iconUrl;
  const [b, f] = drawPumpkin('idle-side', 3, 24);
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 40;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(b.canvas(), -12, -6);
  ctx.drawImage(f.canvas(), -12, -6);
  iconUrl = c.toDataURL();
  return iconUrl;
}
