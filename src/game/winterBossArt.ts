import type { MonsterDef } from '../core/types';
import { ell, fillPoly, finish, limb, mix, shades, type MonAnim } from './monsterArt';
import { phash, Pix } from './pix';

/*
 * 永冬冰原的两个限时首领（用户 11-01：冰原独有、都是 125 级、要 120 帧动态模型、攻击特效和技能特效）。
 * 画布 128×128，设计格 64×64（×2 画）。比世界首领（96）更大，帧数也最多：
 * 待机 24、移动 16、攻击 16、大招一 24、大招二 20、受击 8、死亡 12，一共 120 帧。
 * 两个大招在精灵表里自带特效（冰刺、吐息、剑光、暴雪），场景里再配一层粒子（MapScene.worldSkillFx）。
 * 全部朝右画，朝左时翻转。
 *
 * 永霜巨人：蓝灰皮肤、霜白长胡子、冰角铁盔、披兽皮，扛一根冻满冰川的巨木棒。
 *   普攻：抡棒横扫；大招一「冰川崩落」：双手举棒过顶，棒头结出冰川，砸地后冰刺一路炸开；
 *   大招二「永霜吐息」：仰头吸气，吐出一大团冻雾，地上结满冰晶（把人冻住）。
 * 雪堡男爵：高瘦的银蓝板甲骑士，深蓝貂皮披风、冰冠头盔和长羽饰，握一把冰晶长剑。
 *   普攻：突刺；大招一「霜刃三连」：三道冰蓝剑光，最后一下十字斩；
 *   大招二「凛冬号令」：用寒气凝出雪堡军旗插在地上，脚下符文圈展开、刮起暴雪（吸寒气回血）。
 */

export const REALM_SIZE = 128;
export const REALM_ANIMS = [
  { key: 'idle', frames: 24, rate: 8, repeat: -1 },
  { key: 'move', frames: 16, rate: 12, repeat: -1 },
  { key: 'attack', frames: 16, rate: 16, repeat: 0 },
  { key: 'skill', frames: 24, rate: 14, repeat: 0 },
  { key: 'skill2', frames: 20, rate: 13, repeat: 0 },
  { key: 'hurt', frames: 8, rate: 16, repeat: 0 },
  { key: 'death', frames: 12, rate: 9, repeat: 0 },
] as const;
export const REALM_FRAMES = REALM_ANIMS.reduce((n, a) => n + a.frames, 0);

const TAU = Math.PI * 2;
const G = 61;

interface W {
  p: Pix;
  u: number;
  anim: MonAnim;
  t: number;
  i: number;
  P: string[];
  A: string[];
}

const E = (w: W, x: number, y: number, rx: number, ry: number, c: string) => ell(w.p, x * w.u, y * w.u, rx * w.u, ry * w.u, c);
const F = (w: W, pts: [number, number][], c: string) => fillPoly(w.p, pts.map(([x, y]) => [x * w.u, y * w.u]), c);
const L = (w: W, x0: number, y0: number, x1: number, y1: number, c: string, width = 0.5) => limb(w.p, x0 * w.u, y0 * w.u, x1 * w.u, y1 * w.u, c, width * w.u);
const dot = (w: W, x: number, y: number, c: string) => w.p.set(x * w.u, y * w.u, c);
/** 真像素一点（不放大），做细碎的雪花、冰屑 */
const px = (w: W, x: number, y: number, c: string) => w.p.set(x * w.u, y * w.u, c);
const blob = (w: W, x: number, y: number, rx: number, ry: number, pal: string[], seed: number) => w.p.blob(x * w.u, y * w.u, rx * w.u, ry * w.u, pal, seed);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ph = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);
/** 方向角：0 朝下，π/2 朝前（右），π 朝上 */
const dir = (a: number): [number, number] => [Math.sin(a), Math.cos(a)];

const shadow = (w: W, cx: number, rx: number) => {
  for (let x = cx - rx; x <= cx + rx; x += 0.5) dot(w, x, G + 0.5, w.P[0]);
};
/** 一串圆连成的弯曲部件（胡子、披风、羽饰） */
function chain(w: W, pts: [number, number][], r0: number, r1: number, col: (k: number) => string, n = 14) {
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    const seg = Math.min(pts.length - 2, Math.floor(q * (pts.length - 1)));
    const f = q * (pts.length - 1) - seg;
    const [ax, ay] = pts[seg];
    const [bx, by] = pts[seg + 1];
    const r = r0 + (r1 - r0) * q;
    E(w, ax + (bx - ax) * f, ay + (by - ay) * f, r, r, col(k));
  }
}
/** 地上冒出来的一根冰刺：亮边 + 暗边 + 小冰晶 */
function spike(w: W, x: number, h: number, wd: number, ice: string[], tilt = 0) {
  if (h <= 0.3) return;
  F(w, [[x - wd, G], [x + tilt, G - h], [x + wd, G]], ice[2]);
  F(w, [[x + tilt * 0.6, G - h * 0.85], [x + wd, G], [x + wd * 0.2, G]], ice[1]);
  L(w, x - wd * 0.5, G - 0.3, x + tilt - 0.2, G - h + 0.6, ice[3], 0.35);
  if (h > 4) dot(w, x + tilt, G - h, '#ffffff');
}
/** 雪花：十字小点 */
function flake(w: W, x: number, y: number, c: string, big = false) {
  px(w, x, y, c);
  if (big) {
    px(w, x - 0.5, y, c);
    px(w, x + 0.5, y, c);
    px(w, x, y - 0.5, c);
    px(w, x, y + 0.5, c);
  }
}
/** 一段弧形剑光：圆心、半径、起止角（0 朝右，逆时针为负 y），越靠近刀尖越亮 */
function arc(w: W, cx: number, cy: number, r: number, a0: number, a1: number, thick: number, cols: string[]) {
  const n = Math.ceil(Math.abs(a1 - a0) * r * 4) + 2;
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    const a = a0 + (a1 - a0) * q;
    const th = thick * (0.25 + 0.75 * Math.sin(q * Math.PI * 0.5 + 0.2));
    for (let d = 0; d <= th; d += 0.4) {
      const rr = r - d;
      const c = d < th * 0.3 ? cols[3] : d < th * 0.65 ? cols[2] : cols[1];
      dot(w, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, q > 0.8 && d < th * 0.4 ? '#ffffff' : c);
    }
  }
}
/** 一缕向上飘的寒气 */
function mist(w: W, x: number, y: number, k: number, c: string) {
  for (let j = 0; j < 4; j++) dot(w, x + Math.sin(k * 3 + j) * 0.8, y - j * 1.1, j % 2 ? c : mix(c, '#ffffff', 0.4));
}

// ======================================================================
// 永霜巨人
// ======================================================================

function giant(w: W) {
  const { t, anim, i } = w;
  const skin = shades('#6f8fb0');
  const fur = shades('#c8d2de');
  const hide = shades('#6a5040');
  const wood = shades('#8a6a48');
  const iron = shades('#4e5a6c');
  const ice = shades('#8fd8ff');
  const beard = shades('#dce8f4');
  const glow = w.A;

  // ---- 每个动作的姿势参数 ----
  let lean = 0; // 上身前倾（正）/后仰（负），格
  let crouch = 0; // 下蹲
  let shift = 0; // 整体左右平移
  let bob = 0;
  let armN = 0.35; // 近手（握棒）上臂角
  let clubA = 0.62; // 棒子角
  let armF = -0.15; // 远手上臂角
  let farGrip = false; // 远手也握棒
  let clubGrow = 0; // 棒头冰川长大
  let head = 0; // 抬头（负）/低头
  let mouth = 0;
  let stepN = 0;
  let stepF = 0;
  let kneel = 0;
  let eyeK = 0.5 + 0.5 * Math.sin(t * TAU * 2);

  if (anim === 'idle') {
    // 待机 24 帧：呼吸、胡子飘、偶尔把棒子在地上顿一下、哈出白气
    const br = Math.sin(t * TAU);
    bob = br * 0.5;
    lean = br * 0.3;
    const tap = ph(t, 0.55, 0.7) - ph(t, 0.7, 0.85);
    armN = 0.35 + tap * 0.5;
    clubA = 0.62 + tap * 0.55;
    head = -tap * 0.6;
  } else if (anim === 'move') {
    const s = Math.sin(t * TAU);
    stepN = s;
    stepF = -s;
    bob = Math.abs(Math.cos(t * TAU)) * -1.2 + 0.6;
    lean = 0.8;
    armN = 0.45 + s * 0.15;
    clubA = 0.85 + s * 0.12;
    armF = -0.15 - s * 0.35;
  } else if (anim === 'attack') {
    // 前摇举棒到身后 → 横扫 → 收
    const up = ease(ph(t, 0, 0.38));
    const sw = ease(ph(t, 0.38, 0.55));
    const back = ease(ph(t, 0.7, 1));
    armN = lerp(lerp(0.35, Math.PI + 0.6, up), 1.3, sw);
    clubA = lerp(lerp(0.62, Math.PI + 1.1, up), 1.6, sw);
    armN = lerp(armN, 0.35, back);
    clubA = lerp(clubA, 0.62, back);
    lean = -up * 1.2 + sw * 2.5 - back * 1.3;
    shift = sw * 2 - back * 2;
    armF = -0.15 - sw * 0.6 + back * 0.6;
  } else if (anim === 'skill') {
    // 冰川崩落：0-0.4 双手举棒、棒头结冰川；0.4-0.48 砸地；之后冰刺炸开
    const up = ease(ph(t, 0, 0.36));
    const slam = ease(ph(t, 0.4, 0.48));
    const rec = ease(ph(t, 0.82, 1));
    farGrip = t < 0.82;
    armN = lerp(lerp(0.35, Math.PI + 0.45, up), 0.7, slam);
    clubA = lerp(lerp(0.62, Math.PI + 1.15, up), 0.8, slam);
    armF = lerp(lerp(-0.15, Math.PI + 0.3, up), 1.0, slam);
    armN = lerp(armN, 0.35, rec);
    clubA = lerp(clubA, 0.62, rec);
    armF = lerp(armF, -0.15, rec);
    clubGrow = clamp01(up * 1.1) * (1 - rec);
    lean = -up * 1.6 + slam * 3.5 - rec * 1.9;
    crouch = slam * 2.5 * (1 - rec);
    head = -up * 1 + slam * 1;
    mouth = slam * (1 - rec) * 1.2;
    eyeK = 0.6 + up * 0.4;
  } else if (anim === 'skill2') {
    // 永霜吐息：0-0.35 仰头吸气；0.35-0.85 吐出冻雾；之后收
    const inh = ease(ph(t, 0, 0.32));
    const out = ease(ph(t, 0.35, 0.45));
    const rec = ease(ph(t, 0.85, 1));
    lean = -inh * 2 + out * 3 - rec * 1;
    head = -inh * 2.2 + out * 3.2 - rec * 1;
    mouth = inh * 0.6 + (t >= 0.35 && t < 0.88 ? 2.2 : 0) * (1 - rec);
    armF = -0.15 + inh * 0.9 - out * 0.4;
    eyeK = 1;
  } else if (anim === 'hurt') {
    lean = -1.6 * (1 - t);
    shift = -1.5 * (1 - t);
    head = -0.8 * (1 - t);
  } else if (anim === 'death') {
    kneel = ease(ph(t, 0, 0.45));
    const fall = ease(ph(t, 0.4, 0.8));
    lean = kneel * 2 + fall * 6;
    crouch = kneel * 7 + fall * 3;
    armN = lerp(0.35, 0.9, kneel);
    clubA = lerp(0.62, 1.55, ease(ph(t, 0.15, 0.5)));
    head = kneel * 2;
    eyeK = 1 - kneel;
  }

  const cx = 26 + shift;
  const hip = 44 + bob + crouch;
  shadow(w, cx + 2, 17);

  // ---- 背后飘的雪（待机时一直下） ----
  if (anim === 'idle' || anim === 'move') {
    for (let k = 0; k < 10; k++) {
      const x = 4 + phash(k, 3, 11) * 56 + Math.sin(t * TAU + k) * 1.5;
      const y = ((phash(k, 4, 11) * 64 + t * 64 * (0.5 + phash(k, 5, 11) * 0.5)) % 64);
      flake(w, x, y, k % 3 ? ice[3] : '#ffffff', k % 4 === 0);
    }
  }

  // ---- 腿 ----
  const knee = (x: number, s: number): [number, number] => [x + s * 2.2 + lean * 0.2, hip + 9 - Math.max(0, s) * 1.6 - kneel * 3];
  const foot = (x: number, s: number): [number, number] => (kneel > 0 ? [x - kneel * 4 + 3, G - 1] : [x + s * 3.6, G - 1 - Math.max(0, s) * 2.2]);
  const leg = (x: number, s: number, far: boolean) => {
    const k = knee(x, s);
    const f = foot(x, s);
    const pal = far ? shades(mix(skin[1], '#141c2a', 0.25)) : skin;
    L(w, x, hip + 2, k[0], k[1], pal[1], 6.5);
    L(w, k[0], k[1], f[0], f[1] - 2.5, pal[1], 5.2);
    E(w, k[0] + 0.8, k[1] - 0.5, 2.2, 1.8, pal[2]);
    // 兽皮靴 + 绑绳
    blob(w, f[0] + 0.8, f[1] - 1.5, 4, 2.6, far ? shades(fur[1]) : fur, 31);
    L(w, f[0] - 2.2, f[1] - 3.2, f[0] + 3, f[1] - 3.6, hide[0], 0.5);
    // 脚下冰屑：踩地那一下
    if (anim === 'move' && Math.abs(s) < 0.25) for (let j = 0; j < 4; j++) dot(w, f[0] - 3 + j * 2.2, G - 0.5 - phash(j, i, 2) * 1.5, ice[3]);
  };
  leg(cx - 4, stepF, true);

  // ---- 远手 ----
  const shF: [number, number] = [cx - 6 + lean * 0.9, hip - 21 + lean * 0.4];
  const shN: [number, number] = [cx + 8 + lean * 0.9, hip - 20 + lean * 0.4];
  const [cdx, cdy] = dir(clubA);
  const elbowN: [number, number] = [shN[0] + dir(armN)[0] * 7, shN[1] + dir(armN)[1] * 7];
  const handN: [number, number] = [elbowN[0] + dir(armN + (armN > 2 ? -0.3 : 0.25))[0] * 6.5, elbowN[1] + dir(armN + (armN > 2 ? -0.3 : 0.25))[1] * 6.5];
  const farArm = () => {
    const pal = shades(mix(skin[1], '#141c2a', 0.25));
    let el: [number, number];
    let hd: [number, number];
    if (farGrip) {
      // 远手握在近手下面一点的棒身上
      hd = [handN[0] - cdx * 3.2, handN[1] - cdy * 3.2];
      el = [(shF[0] + hd[0]) / 2 - 2, (shF[1] + hd[1]) / 2 + 1.5];
    } else {
      el = [shF[0] + dir(armF)[0] * 7, shF[1] + dir(armF)[1] * 7];
      hd = [el[0] + dir(armF + 0.2)[0] * 6.5, el[1] + dir(armF + 0.2)[1] * 6.5];
    }
    L(w, shF[0], shF[1], el[0], el[1], pal[1], 5);
    L(w, el[0], el[1], hd[0], hd[1], pal[1], 4.2);
    // 皮护腕
    L(w, el[0] + (hd[0] - el[0]) * 0.62, el[1] + (hd[1] - el[1]) * 0.62, el[0] + (hd[0] - el[0]) * 0.85, el[1] + (hd[1] - el[1]) * 0.85, hide[0], 4.6);
    E(w, hd[0], hd[1], 2.4, 2.4, pal[2]);
  };
  farArm();

  // ---- 背上的冰刺（从肩胛长出来） ----
  for (let k = 0; k < 4; k++) {
    const bx = cx - 9 + k * 2.6 + lean * 0.8;
    const byy = hip - 22 + k * 0.6 + lean * 0.3;
    const h = 5 + (k % 2) * 3 + Math.sin(t * TAU + k) * 0.3;
    F(w, [[bx - 1.4, byy + 1], [bx - 2.6 - k * 0.3, byy - h], [bx + 1.2, byy + 0.5]], k % 2 ? ice[2] : ice[1]);
    L(w, bx - 1.1, byy, bx - 2.4 - k * 0.3, byy - h + 1, ice[3], 0.3);
  }

  // ---- 身体：大肚腩 + 胸膛，兽皮斜挎 ----
  const tx = cx + 1 + lean;
  const ty = hip - 11;
  blob(w, tx, ty, 12, 11.5, skin, 71);
  // 胸肌、肚子的明暗
  E(w, tx + 3, ty - 4, 4.5, 3.2, skin[2]);
  E(w, tx + 3.5, ty + 5, 6, 5, skin[2]);
  L(w, tx + 1, ty - 5, tx + 6, ty - 6, skin[3], 0.4);
  // 冰霜纹（皮肤上结的霜）
  for (let k = 0; k < 8; k++) {
    const a = phash(k, 1, 91) * TAU;
    const r = 4 + phash(k, 2, 91) * 7;
    px(w, tx + Math.cos(a) * r, ty + Math.sin(a) * r * 1.1, ice[3]);
  }
  // 兽皮披肩：盖住后背和两肩，下沿一撮撮毛
  blob(w, tx - 3, ty - 8, 9, 5.5, fur, 23);
  for (let k = 0; k < 8; k++) {
    const x = tx - 11 + k * 2.3;
    const y = ty - 4 + Math.abs(k - 3.5) * -0.5 + Math.sin(t * TAU + k) * 0.3;
    F(w, [[x - 1.3, y - 1], [x + 1.3, y - 1], [x + 0.2, y + 2.2 + (k % 2)]], k % 2 ? fur[1] : fur[2]);
  }
  E(w, tx - 5, ty - 10, 3, 1.5, fur[3]);
  // 披肩用一根骨扣扣在胸前
  E(w, tx + 4, ty - 6, 1.3, 1, '#e8e0d0');
  // 腰带 + 冰晶带扣
  L(w, tx - 10, hip - 1.5, tx + 10, hip - 2.5, hide[0], 2.4);
  L(w, tx - 10, hip - 2.3, tx + 10, hip - 3.3, hide[1], 0.6);
  F(w, [[tx + 2, hip - 4.5], [tx + 4, hip - 6], [tx + 6, hip - 4.5], [tx + 4, hip - 0.5]], ice[2]);
  dot(w, tx + 4, hip - 4.2, glow[3]);
  // 兽皮裙：一条条往下垂
  for (let k = 0; k < 8; k++) {
    const x = tx - 9 + k * 2.6;
    const wave = Math.sin(t * TAU + k * 0.7) * 0.6 * (anim === 'move' ? 2 : 1);
    const len = 6 + (k % 3) * 1.5;
    F(w, [[x - 1.6, hip - 0.5], [x + 1.6, hip - 0.5], [x + 0.6 + wave, hip + len], [x - 0.8 + wave, hip + len - 0.5]], k % 2 ? fur[1] : fur[2]);
  }

  leg(cx + 5, stepN, false);

  // ---- 头 ----
  const hx = cx + 11 + lean * 1.4 + head * 0.4;
  const hy = hip - 25 + lean * 0.5 + head * 0.6 + crouch * 0.1;
  const drawHead = () => {
  // 脖子
  E(w, hx - 1, hy + 5, 4.5, 3.5, skin[1]);
  blob(w, hx, hy, 5.2, 5.6, skin, 33);
  E(w, hx + 1.8, hy + 0.6, 3.6, 3.4, skin[2]);
  E(w, hx + 3, hy + 2.2, 2.2, 1.2, mix(skin[2], '#ffffff', 0.15));
  // 鼻子、眉骨
  E(w, hx + 4.6, hy + 0.6, 1.3, 1.8, skin[2]);
  L(w, hx + 1, hy - 2.2, hx + 5, hy - 1.6, skin[0], 0.7);
  // 眼睛：两点青光，大招时更亮还拖光
  const ec = eyeK > 0.7 ? '#ffffff' : glow[3];
  L(w, hx + 0.8, hy - 1.9, hx + 5, hy - 1.5, skin[0], 0.8);
  E(w, hx + 3.2, hy - 0.6, 1.3, 0.9, glow[2]);
  E(w, hx + 3.4, hy - 0.6, 0.6, 0.5, ec);
  if (eyeK > 0.9 && (anim === 'skill' || anim === 'skill2')) for (let j = 1; j < 4; j++) dot(w, hx + 3 - j * 1.1, hy - 1.2 - j * 0.3, glow[j % 2 ? 2 : 3]);
  // 嘴（大招张开，露出冰牙）
  if (mouth > 0.3) {
    F(w, [[hx + 2, hy + 2.5], [hx + 5.5, hy + 2], [hx + 5, hy + 2.5 + mouth * 1.4], [hx + 2.2, hy + 2.8 + mouth]], '#0e1828');
    dot(w, hx + 3, hy + 2.6, '#eaf8ff');
    dot(w, hx + 4.4, hy + 2.4, '#eaf8ff');
  }
  // 胡子：霜白一大把，末梢结冰、跟着身子晃
  const sway = Math.sin(t * TAU + 0.6) * 1 + (anim === 'move' ? Math.sin(t * TAU * 2) * 0.8 : 0) - lean * 0.3;
  const bTop: [number, number] = [hx + 2, hy + 4.4 + mouth * 0.8];
  chain(w, [bTop, [hx + 1.5 + sway * 0.4, hy + 8.5], [hx + 0.5 + sway, hy + 13]], 2.4, 0.9, (k) => (k % 3 === 0 ? beard[2] : k % 3 === 1 ? beard[1] : beard[3]));
  chain(w, [[hx + 4.5, hy + 3 + mouth * 0.8], [hx + 5 + sway * 0.3, hy + 7], [hx + 4 + sway * 0.8, hy + 10.5]], 1.8, 0.6, (k) => (k % 2 ? beard[2] : beard[3]));
  dot(w, hx + 0.5 + sway, hy + 13.6, ice[3]);
  dot(w, hx + 4 + sway * 0.8, hy + 11, ice[3]);
  // 胡子下哈白气
  if (anim === 'idle' && t > 0.15 && t < 0.5) mist(w, hx + 7 + (t - 0.15) * 8, hy + 2 - (t - 0.15) * 6, t * 9, ice[3]);
  // 铁盔 + 冰角
  F(w, [[hx - 5.5, hy - 2], [hx - 4.5, hy - 6], [hx, hy - 7.5], [hx + 4.5, hy - 6], [hx + 5.5, hy - 2.2], [hx + 5, hy - 1.5], [hx - 5, hy - 1.2]], iron[1]);
  L(w, hx - 4.5, hy - 5.6, hx + 3.5, hy - 6.6, iron[3], 0.5);
  L(w, hx - 5.6, hy - 1.8, hx + 5.6, hy - 2.2, iron[0], 0.8);
  for (let k = 0; k < 4; k++) dot(w, hx - 4 + k * 2.6, hy - 2, iron[3]);
  // 冰角：往后上方弯
  chain(w, [[hx - 3, hy - 5.5], [hx - 7, hy - 9], [hx - 8, hy - 14]], 1.8, 0.5, (k) => (k % 3 ? ice[2] : ice[3]), 10);
  chain(w, [[hx + 2, hy - 6.8], [hx + 2.5, hy - 11], [hx + 0.5, hy - 15]], 1.6, 0.4, (k) => (k % 3 ? ice[1] : ice[2]), 10);
  // 盔顶冰晶冠
  for (let k = 0; k < 3; k++) F(w, [[hx - 2 + k * 2, hy - 7], [hx - 1.4 + k * 2, hy - 9.5 - (k % 2) * 1.2], [hx - 0.6 + k * 2, hy - 7]], k % 2 ? ice[3] : ice[2]);

  };
  // ---- 近手 + 冰川巨棒 ----
  const club = () => {
    const len = 18;
    const base: [number, number] = [handN[0] - cdx * 4, handN[1] - cdy * 4];
    const tip: [number, number] = [handN[0] + cdx * len, handN[1] + cdy * len];
    // 棒身：粗木头，越往头越粗
    for (let k = 0; k <= 10; k++) {
      const q = k / 10;
      const x = lerp(base[0], tip[0], q);
      const y = lerp(base[1], tip[1], q);
      E(w, x, y, 1.3 + q * 1.4, 1.3 + q * 1.4, wood[1]);
    }
    L(w, base[0] + 0.4, base[1], tip[0] * 0.7 + base[0] * 0.3 + 0.4, tip[1] * 0.7 + base[1] * 0.3, wood[2], 0.4);
    // 铁箍
    for (const q of [0.45, 0.62]) {
      const x = lerp(base[0], tip[0], q);
      const y = lerp(base[1], tip[1], q);
      E(w, x, y, 2.4 + q, 2.4 + q, iron[1]);
      dot(w, x - 0.5, y - 0.8, iron[3]);
    }
    // 棒头冻着的冰川：几块尖冰
    const g = 1 + clubGrow * 0.5;
    const [nx, ny] = [-cdy, cdx];
    const hx2 = tip[0] - cdx * 2;
    const hy2 = tip[1] - cdy * 2;
    blob(w, hx2, hy2, 4.6 * g, 4.6 * g, ice, 17);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      const len2 = (3.5 + (k % 3) * 1.6) * g;
      const bx = hx2 + ox * 3.2 * g;
      const by = hy2 + oy * 3.2 * g;
      F(w, [[bx - oy * 1.3, by + ox * 1.3], [bx + ox * len2, by + oy * len2], [bx + oy * 1.3, by - ox * 1.3]], k % 2 ? ice[2] : ice[3]);
    }
    E(w, hx2 - nx * 0.5, hy2 - ny * 0.5, 1.6 * g, 1.6 * g, glow[2]);
    dot(w, hx2 - 1, hy2 - 1, '#ffffff');
    // 蓄力时冰晶往棒头聚
    if (clubGrow > 0 && anim === 'skill' && t < 0.4) {
      for (let k = 0; k < 14; k++) {
        const a = phash(k, 7, 3) * TAU;
        const r = (1 - ((t * 2.5 + phash(k, 8, 3)) % 1)) * 14 + 4;
        flake(w, hx2 + Math.cos(a) * r, hy2 + Math.sin(a) * r, k % 2 ? glow[3] : '#ffffff', k % 3 === 0);
      }
    }
    // 横扫的拖影
    if (anim === 'attack' && t >= 0.38 && t < 0.62) {
      for (let k = 1; k <= 5; k++) {
        const a = clubA - k * 0.22;
        const [ex, ey] = dir(a);
        const x = handN[0] + ex * (len - 1);
        const y = handN[1] + ey * (len - 1);
        E(w, x, y, 3.4 - k * 0.5, 3.4 - k * 0.5, k < 3 ? ice[3] : ice[2]);
      }
    }
  };
  if (!(anim === 'death' && t > 0.5)) {
    if (clubA > Math.PI * 0.8) club();
  }
  const pal = skin;
  L(w, shN[0], shN[1], elbowN[0], elbowN[1], pal[1], 5.6);
  E(w, shN[0] + 0.5, shN[1] - 0.5, 3.6, 3.4, pal[2]);
  // 冰甲护肩
  F(w, [[shN[0] - 4, shN[1] - 1], [shN[0] - 2, shN[1] - 4.5], [shN[0] + 3, shN[1] - 4.5], [shN[0] + 4.5, shN[1] - 0.5], [shN[0] + 1, shN[1] + 1.5]], iron[1]);
  L(w, shN[0] - 2, shN[1] - 4, shN[0] + 3, shN[1] - 4, iron[3], 0.5);
  F(w, [[shN[0] - 1, shN[1] - 4], [shN[0], shN[1] - 8.5], [shN[0] + 1.6, shN[1] - 4.2]], ice[2]);
  F(w, [[shN[0] + 2, shN[1] - 4], [shN[0] + 3.8, shN[1] - 7], [shN[0] + 3.6, shN[1] - 3.2]], ice[3]);
  drawHead();
  L(w, elbowN[0], elbowN[1], handN[0], handN[1], pal[1], 4.8);
  L(w, elbowN[0] + (handN[0] - elbowN[0]) * 0.62, elbowN[1] + (handN[1] - elbowN[1]) * 0.62, elbowN[0] + (handN[0] - elbowN[0]) * 0.85, elbowN[1] + (handN[1] - elbowN[1]) * 0.85, hide[1], 5.2);
  if (clubA <= Math.PI * 0.8 && !(anim === 'death' && t > 0.5)) club();
  E(w, handN[0], handN[1], 2.6, 2.6, pal[2]);
  dot(w, handN[0] + 1, handN[1] - 1, pal[3]);
  if (anim === 'death' && t > 0.5) {
    // 棒子脱手倒在地上
    const k = ease(ph(t, 0.5, 0.75));
    const bx = cx + 14 + k * 4;
    L(w, bx - 10, G - 2, bx + 8, G - 3 - (1 - k) * 6, hide[1], 3);
    blob(w, bx + 10, G - 4 - (1 - k) * 6, 4.5, 4, ice, 17);
  }

  // ---- 特效 ----
  if (anim === 'attack' && t >= 0.48 && t < 0.75) {
    // 横扫打中：前方一圈冰屑和冲击
    const k = ph(t, 0.48, 0.75);
    const ox = cx + 34;
    const oy = hip - 14;
    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * TAU;
      const r = 2 + k * 9 * (0.6 + phash(j, 2, i) * 0.6);
      flake(w, ox + Math.cos(a) * r, oy + Math.sin(a) * r * 0.7, j % 3 ? ice[3] : '#ffffff', j % 4 === 0);
    }
    if (k < 0.4) E(w, ox, oy, 3 * (1 - k), 3 * (1 - k), '#ffffff');
  }
  if (anim === 'skill' && t >= 0.46) {
    // 冰川崩落：砸地点冲击波 + 冰刺一路往前炸开 + 碎冰飞溅
    const r = ph(t, 0.46, 1);
    const impact = handN[0] + cdx * 18;
    // 冲击波：地上的扁圈
    const ring = r * 26;
    if (r < 0.7) {
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * TAU;
        const x = impact + Math.cos(a) * ring;
        const y = G - 0.5 + Math.sin(a) * ring * 0.18;
        if (x > 0 && x < 64) dot(w, x, y, k % 2 ? glow[3] : '#ffffff');
      }
    }
    // 冰刺：先近后远依次冒出，后半段碎掉
    for (let k = 0; k < 8; k++) {
      const grow = clamp01(r * 9 - k * 0.8);
      const fade = clamp01((r - 0.7) * 3.3);
      const x = impact - 12 + k * 3.4;
      if (x > 63) continue;
      const h = (5 + (k % 3) * 3.5 + (k === 3 ? 4 : 0)) * ease(grow) * (1 - fade * 0.7);
      spike(w, x, h, 1.3 + (k % 2) * 0.5, ice, (k % 2 ? 0.6 : -0.4));
      if (fade > 0) for (let j = 0; j < 3; j++) dot(w, x + (phash(k, j, 5) - 0.5) * 4, G - h - fade * 4 * phash(j, k, 6), ice[3]);
    }
    // 碎冰往上飞的抛物线
    for (let k = 0; k < 12; k++) {
      const vx = (phash(k, 1, 23) - 0.3) * 16;
      const vy = 10 + phash(k, 2, 23) * 12;
      const q = clamp01(r * 1.6);
      const x = impact + vx * q;
      const y = G - 2 - vy * q + 18 * q * q;
      if (y < G) E(w, x, y, 0.7, 0.7, k % 2 ? ice[2] : ice[3]);
    }
    if (r < 0.15) E(w, impact, G - 3, 5 * (1 - r * 6), 3 * (1 - r * 6), '#ffffff');
  }
  if (anim === 'skill2') {
    const mx = hx + 6;
    const my = hy + 3;
    if (t < 0.35) {
      // 吸气：雪花往嘴里卷
      for (let k = 0; k < 14; k++) {
        const a = phash(k, 3, 41) * Math.PI - Math.PI * 0.5;
        const r = (1 - ((t * 3 + phash(k, 4, 41)) % 1)) * 18 + 2;
        flake(w, mx + Math.cos(a) * r, my + Math.sin(a) * r, k % 2 ? ice[3] : '#ffffff', k % 4 === 0);
      }
    } else if (t < 0.9) {
      // 吐息：一团冻雾斜着喷向前方地面，越远越宽，地面结冰晶
      const r = ph(t, 0.35, 0.85);
      const len = clamp01(r * 2.2);
      const ex = 63;
      const ey = G - 4;
      for (let k = 0; k < 46; k++) {
        const q = (k / 45) * len;
        const spread = 1 + q * 7;
        const x = lerp(mx, ex, q) + (phash(k, i, 4) - 0.5) * spread;
        const y = lerp(my, ey, q) + (phash(k, i, 8) - 0.5) * spread;
        const rr = 1 + q * 2.4 + phash(k, 3, i) * 0.8;
        E(w, x, y, rr, rr * 0.8, q < 0.15 ? '#ffffff' : phash(k, i, 5) < 0.45 ? ice[3] : phash(k, i, 6) < 0.6 ? ice[2] : mix(ice[2], '#ffffff', 0.3));
      }
      for (let k = 0; k < 12; k++) flake(w, lerp(mx, ex, phash(k, 9, i) * len) + (phash(k, 7, i) - 0.5) * 10, lerp(my, ey, phash(k, 9, i) * len) - 3 - phash(k, 5, i) * 6, '#ffffff', k % 3 === 0);
      // 地上冻出的一片冰晶
      if (len >= 0.8) {
        const k2 = clamp01((r - 0.36) * 2.5);
        for (let k = 0; k < 7; k++) {
          const x = 40 + k * 3.3;
          spike(w, x, (2 + (k % 3) * 1.8) * k2, 0.9, ice, (k % 2 ? 0.4 : -0.3));
        }
        for (let x = 36; x < 63; x += 0.5) if (phash(Math.round(x * 2), 1, 9) < 0.6 * k2) dot(w, x, G - 0.3, ice[3]);
      }
    } else {
      for (let k = 0; k < 6; k++) mist(w, 42 + k * 3.5, G - 2 - (t - 0.9) * 30, k + t * 5, ice[3]);
    }
  }
  if (anim === 'death' && t > 0.3) {
    // 碎成冰块往下掉
    for (let k = 0; k < 10; k++) {
      const q = ph(t, 0.3, 1);
      const x = cx - 8 + phash(k, 1, 61) * 24 + (phash(k, 2, 61) - 0.5) * q * 10;
      const y = hip - 24 + phash(k, 3, 61) * 22 + q * q * 20;
      if (y < G) F(w, [[x - 1, y], [x, y - 1.4], [x + 1.2, y + 0.2], [x, y + 1]], k % 2 ? ice[2] : ice[3]);
    }
  }
}

// ======================================================================
// 雪堡男爵
// ======================================================================

function baron(w: W) {
  const { t, anim, i } = w;
  const plate = w.P;
  const cape = shades('#25305e');
  const lining = shades('#7a1e2e');
  const gold = shades('#d8b45a');
  const ice = shades('#9fe6ff');
  const glow = w.A;
  const ermine = ['#a8b4c4', '#d4dce6', '#eef4f8', '#ffffff'];
  const dark = shades('#1a2238');

  let lean = 0;
  let shift = 0;
  let bob = 0;
  let crouch = 0;
  let swordA = 0.12; // 剑的方向
  let armN = 0.4; // 近手上臂
  let foreN = 0.1; // 近手小臂相对
  let armF = 0.2;
  let foreF = 0.6;
  let stepN = 0;
  let stepF = 0;
  let capeWind = 0.4;
  let banner = 0; // 军旗显形 0-1
  let bannerX = 0;
  let kneel = 0;
  let trail: number[] = [];

  if (anim === 'idle') {
    // 待机 24 帧：拄剑站立、披风飘；中段举剑到面前行礼，再把剑收回拄地
    const br = Math.sin(t * TAU);
    bob = br * 0.35;
    const sal = ease(ph(t, 0.45, 0.6)) - ease(ph(t, 0.78, 0.95));
    swordA = lerp(0.12, Math.PI - 0.1, sal);
    armN = lerp(0.45, 0.25, sal);
    foreN = lerp(0.1, Math.PI - 0.6, sal);
    armF = 0.2 + br * 0.05;
    foreF = 0.6;
    capeWind = 0.5 + br * 0.25;
  } else if (anim === 'move') {
    const s = Math.sin(t * TAU);
    stepN = s;
    stepF = -s;
    bob = -Math.abs(Math.cos(t * TAU)) * 0.9 + 0.4;
    lean = 0.6;
    swordA = 0.9;
    armN = 0.25 + s * 0.2;
    foreN = 0.7;
    armF = -0.2 - s * 0.35;
    foreF = 0.4;
    capeWind = 1.2;
  } else if (anim === 'attack') {
    // 突刺：收剑到腰 → 弓步前刺 → 收
    const pull = ease(ph(t, 0, 0.35));
    const thr = ease(ph(t, 0.35, 0.5));
    const back = ease(ph(t, 0.7, 1));
    swordA = lerp(lerp(0.12, 1.75, pull), 1.6, thr);
    armN = lerp(lerp(0.45, -0.3, pull), 1.4, thr);
    foreN = lerp(lerp(0.1, 1.9, pull), 0.1, thr);
    swordA = lerp(swordA, 0.12, back);
    armN = lerp(armN, 0.45, back);
    foreN = lerp(foreN, 0.1, back);
    lean = -pull * 0.8 + thr * 2.6 - back * 1.8;
    shift = thr * 4 - back * 4;
    stepN = thr * 0.9 * (1 - back);
    armF = 0.2 - thr * 0.9 + back * 0.9;
    capeWind = 0.5 + thr * 1.2;
    if (t >= 0.35 && t < 0.62) trail = [1];
  } else if (anim === 'skill') {
    // 霜刃三连：三刀，每刀都有一道剑光，最后十字斩
    const cut = (a: number, b: number) => ease(ph(t, a, b));
    const c1 = cut(0.08, 0.26);
    const c2 = cut(0.34, 0.5);
    const c3 = cut(0.6, 0.78);
    const back = ease(ph(t, 0.88, 1));
    // 第一刀：举到身后上方，斜劈到前下
    let a = lerp(Math.PI + 0.6, 0.55, c1);
    a = lerp(a, 2.7, c2); // 第二刀：上挑
    a = lerp(a, 0.35, c3); // 第三刀：再从上往下重劈
    const wind = ease(ph(t, 0, 0.08));
    swordA = lerp(0.12, a, wind);
    swordA = lerp(swordA, 0.12, back);
    armN = lerp(0.45, swordA > 1.6 ? 2.3 : 1.2, wind) * (1 - back) + 0.45 * back;
    foreN = lerp(0.1, 0.2, wind);
    lean = (c1 - c2 * 0.5 + c3 * 1.2) * 1.6 * (1 - back);
    shift = (c1 * 2 + c2 * 1 + c3 * 2) * (1 - back);
    stepN = (c1 > 0 ? 0.6 : 0) * (1 - back);
    armF = 0.2 - c3 * 0.9 * (1 - back);
    capeWind = 1.4;
    trail = [c1 > 0 && c1 < 1 ? 1 : 0, c2 > 0 && c2 < 1 ? 1 : 0, c3 > 0 && c3 < 1 ? 1 : 0];
  } else if (anim === 'skill2') {
    // 凛冬号令：远手举起凝出军旗（0-0.3）→ 插地（0.3-0.4）→ 符文圈展开、暴雪
    const up = ease(ph(t, 0, 0.28));
    const plant = ease(ph(t, 0.3, 0.4));
    const rec = ease(ph(t, 0.9, 1));
    banner = clamp01(t / 0.25);
    bannerX = plant;
    armF = lerp(lerp(0.2, Math.PI - 0.3, up), 1.1, plant);
    foreF = lerp(0.6, 0.1, up);
    swordA = lerp(0.12, 1.9, ease(ph(t, 0.35, 0.5)));
    swordA = lerp(swordA, 0.12, rec);
    armN = lerp(0.45, 1.6, ease(ph(t, 0.35, 0.5)));
    armN = lerp(armN, 0.45, rec);
    foreN = 0.1;
    lean = -up * 0.6 + plant * 1.2 - rec * 0.6;
    crouch = plant * 1.2 * (1 - ease(ph(t, 0.45, 0.6)));
    capeWind = 0.6 + ph(t, 0.4, 0.6) * 1.6;
  } else if (anim === 'hurt') {
    lean = -1.4 * (1 - t);
    shift = -1.6 * (1 - t);
    swordA = 0.4;
    armN = 0.2;
    capeWind = 0.8;
  } else if (anim === 'death') {
    kneel = ease(ph(t, 0, 0.45));
    lean = kneel * 2.2 + ease(ph(t, 0.45, 0.85)) * 4;
    crouch = kneel * 6 + ease(ph(t, 0.45, 0.85)) * 3;
    swordA = lerp(0.12, 0.6, kneel);
    capeWind = 0.3 * (1 - kneel);
  }

  const cx = 26 + shift;
  const hip = 40 + bob + crouch;
  shadow(w, cx + 1, 14);

  // ---- 凛冬号令：地上的符文圈（画在最底层） ----
  if (anim === 'skill2' && t >= 0.35) {
    const r = ease(ph(t, 0.35, 0.55));
    const fade = ph(t, 0.88, 1);
    const R = 6 + r * 22;
    const ox = cx + 8;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * TAU + t * 2;
      const x = ox + Math.cos(a) * R;
      const y = G - 0.5 + Math.sin(a) * R * 0.2;
      if (x < 0 || x > 64 || phash(k, 3, 2) < fade) continue;
      dot(w, x, y, k % 6 === 0 ? '#ffffff' : glow[2]);
    }
    // 圈上的 8 个符文刻痕
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU - t * 3;
      const x = ox + Math.cos(a) * R * 0.75;
      const y = G - 0.5 + Math.sin(a) * R * 0.15;
      if (fade > 0.5) continue;
      L(w, x - 0.8, y, x + 0.8, y, glow[3], 0.4);
      dot(w, x, y - 0.6, glow[3]);
    }
  }

  // ---- 披风：从肩后垂到地，往后飘，内衬深红 ----
  const shY = hip - 17 + lean * 0.3;
  const shX = cx + lean;
  const flutter = (k: number) => Math.sin(t * TAU * (anim === 'move' ? 2 : 1) + k * 0.9) * (0.6 + capeWind * 0.8);
  const capePts: [number, number][] = [];
  const n = 7;
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    capePts.push([shX - 3 - q * (6 + capeWind * 7) + flutter(k) * q, shY + q * (G - 1 - shY) - capeWind * q * q * 5 + (kneel * q * 3)]);
  }
  // 披风背面（深蓝）
  const capePoly: [number, number][] = [[shX + 3, shY - 1], ...capePts.slice(1).map(([x, y]) => [x - 2.5, y] as [number, number]), [capePts[n][0] + 6, capePts[n][1] + 0.5], [shX + 2, hip + 8]];
  F(w, capePoly, cape[1]);
  // 内衬露一点
  for (let k = 2; k < n; k++) {
    const [x, y] = capePts[k];
    if (k % 2 === 0) F(w, [[x - 1.6, y - 1], [x - 0.4, y - 1.4], [x - 0.6, y + 2]], lining[1]);
  }
  for (let k = 1; k <= n; k++) {
    const [x, y] = capePts[k];
    L(w, x - 1.5, y - 3, x - 2, y + 1, cape[0], 0.5);
  }
  // 下摆的锯齿和冰霜
  for (let k = 0; k < 4; k++) {
    const x = capePts[n][0] - 2 + k * 2.4;
    const y = capePts[n][1];
    F(w, [[x - 1.2, y - 0.5], [x, y + 1.5 + flutter(k) * 0.3], [x + 1.2, y - 0.5]], cape[1]);
    dot(w, x, y + 0.6, ice[3]);
  }

  // ---- 远腿 ----
  const leg = (x: number, s: number, far: boolean) => {
    const pal = far ? shades(mix(plate[1], '#141c2a', 0.3)) : plate;
    const kx = x + s * 2 + lean * 0.2;
    const ky = hip + 9 - Math.max(0, s) * 1.4 - kneel * 3;
    const fx = kneel > 0 && far ? x - 4 * kneel : x + s * 3.4;
    const fy = kneel > 0 && !far ? ky + 4 : G - 1 - Math.max(0, s) * 1.8;
    L(w, x, hip + 1, kx, ky, pal[1], 3.6);
    L(w, kx, ky, fx, fy - 1.5, pal[1], 3);
    L(w, x + 0.8, hip + 1.5, kx + 0.8, ky - 1, pal[2], 0.6);
    // 膝甲
    E(w, kx + 0.6, ky, 1.8, 1.6, pal[2]);
    dot(w, kx + 1, ky - 0.6, pal[3]);
    // 战靴：尖头
    F(w, [[fx - 2, fy - 2.2], [fx + 1.5, fy - 2.5], [fx + 4, fy], [fx - 2, fy + 0.5]], far ? dark[1] : dark[2]);
    L(w, fx - 1.8, fy - 2, fx + 1.4, fy - 2.3, gold[far ? 1 : 2], 0.4);
  };
  leg(cx - 3, stepF, true);

  // ---- 远手（叉腰 / 举旗） ----
  const sF: [number, number] = [cx - 5 + lean, shY + 0.8];
  const eF: [number, number] = [sF[0] + dir(armF)[0] * 5.5, sF[1] + dir(armF)[1] * 5.5];
  const hF: [number, number] = [eF[0] + dir(armF + foreF)[0] * 5, eF[1] + dir(armF + foreF)[1] * 5];
  const farArm = () => {
    const pal = shades(mix(plate[1], '#141c2a', 0.3));
    L(w, sF[0], sF[1], eF[0], eF[1], pal[1], 3);
    L(w, eF[0], eF[1], hF[0], hF[1], pal[1], 2.8);
    E(w, hF[0], hF[1], 1.5, 1.5, dark[1]);
  };
  farArm();
  E(w, sF[0], sF[1] - 0.3, 3.6, 3, shades(mix(plate[1], '#141c2a', 0.3))[2]);

  // ---- 雪堡军旗 ----
  if (anim === 'skill2' && banner > 0 && t < 0.97) {
    const planted = bannerX >= 1;
    const bx = planted ? cx - 9 : hF[0];
    const top = planted ? G - 30 : hF[1] - 16;
    const bot = planted ? G : hF[1] + 8;
    const vis = (y: number) => banner >= 1 || phash(Math.round(y * 3), 1, i) < banner;
    for (let y = top; y <= bot; y += 0.5) if (vis(y)) dot(w, bx, y, y < top + 1.5 ? gold[3] : '#5a4a3a');
    // 旗杆顶的冰晶矛尖
    F(w, [[bx - 1, top + 0.5], [bx, top - 3], [bx + 1, top + 0.5]], ice[3]);
    // 旗面：深蓝底、白色城堡、金边，往后飘
    const fl = (q: number) => Math.sin(t * TAU * 3 + q * 4) * (planted ? 1.4 : 0.6);
    if (banner > 0.5) {
      const wd = 11 * clamp01((banner - 0.5) * 2);
      const pts: [number, number][] = [[bx, top + 1]];
      for (let k = 0; k <= 6; k++) pts.push([bx - (k / 6) * wd, top + 1 + fl(k / 6)]);
      for (let k = 6; k >= 0; k--) pts.push([bx - (k / 6) * wd, top + 9 + fl(k / 6) + (k === 6 ? -2 : 0)]);
      F(w, pts, cape[2]);
      L(w, bx, top + 1, bx - wd, top + 1 + fl(1), gold[2], 0.5);
      L(w, bx, top + 9, bx - wd, top + 7 + fl(1), gold[2], 0.5);
      if (wd > 8) {
        // 城堡徽：三座塔
        const ex = bx - 5.5;
        const ey = top + 5 + fl(0.5);
        F(w, [[ex - 2.5, ey + 2], [ex - 2.5, ey - 1], [ex - 1.5, ey - 1], [ex - 1.5, ey - 2], [ex - 0.5, ey - 2], [ex - 0.5, ey - 3.2], [ex + 0.5, ey - 3.2], [ex + 0.5, ey - 2], [ex + 1.5, ey - 2], [ex + 1.5, ey - 1], [ex + 2.5, ey - 1], [ex + 2.5, ey + 2]], ermine[3]);
        dot(w, ex, ey + 1, cape[0]);
      }
    }
    // 显形时寒气往旗杆上缠
    if (banner < 1) for (let k = 0; k < 10; k++) {
      const q = phash(k, 2, i);
      flake(w, bx + Math.sin(q * 9 + t * 20) * 3, lerp(bot, top, q), k % 2 ? glow[3] : '#ffffff', k % 3 === 0);
    }
    // 插地瞬间：地面冰裂
    if (planted && t < 0.6) {
      const k = ph(t, 0.4, 0.6);
      for (let j = 0; j < 5; j++) L(w, bx, G - 0.3, bx + (j - 2) * 3 * (0.4 + k), G - 0.3 + (j % 2) * 0.4, ice[3], 0.35);
      if (k < 0.3) E(w, bx, G - 1, 3, 1.5, '#ffffff');
    }
  }

  // ---- 身体：腰甲裙 + 胸甲 ----
  const tx = cx + 1 + lean;
  // 腰甲裙：几片甲叶
  for (let k = 0; k < 5; k++) {
    const x = tx - 5 + k * 2.5;
    F(w, [[x - 1.5, hip - 1], [x + 1.5, hip - 1], [x + 1.3 + stepN * 0.3, hip + 5], [x - 1.3 + stepN * 0.3, hip + 5]], k % 2 ? plate[1] : plate[2]);
    dot(w, x, hip + 4.5, gold[2]);
  }
  // 胸甲：上宽下窄，中线棱，金边
  F(w, [[tx - 6, shY], [tx + 6, shY], [tx + 5, hip - 6], [tx + 3, hip], [tx - 4, hip], [tx - 5.5, hip - 6]], plate[1]);
  F(w, [[tx - 1, shY], [tx + 6, shY], [tx + 5, hip - 6], [tx + 3, hip], [tx, hip]], plate[2]);
  L(w, tx + 0.5, shY + 1, tx + 0.5, hip - 1, plate[3], 0.5);
  L(w, tx + 3, shY + 2, tx + 4.5, shY + 6, plate[3], 0.4);
  L(w, tx - 5.5, shY + 0.5, tx + 5.5, shY + 0.5, gold[2], 0.6);
  // 胸口冰晶纹章，一明一暗
  const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 2);
  F(w, [[tx + 1.5, shY + 4], [tx + 3, shY + 6.5], [tx + 1.5, shY + 9], [tx, shY + 6.5]], ice[2]);
  dot(w, tx + 1.5, shY + 6.3, pulse > 0.6 ? '#ffffff' : glow[3]);
  // 腰带
  L(w, tx - 5, hip - 1.2, tx + 4, hip - 1.2, dark[1], 1.4);
  E(w, tx + 1, hip - 1.2, 1, 0.8, gold[3]);
  // 貂皮领：白底黑尾点
  for (let k = 0; k < 7; k++) {
    const x = tx - 6 + k * 2;
    const y = shY - 0.6 + Math.abs(k - 3) * 0.25;
    E(w, x, y, 1.6, 1.3, k % 2 ? ermine[2] : ermine[1]);
    if (k % 3 === 1) dot(w, x, y + 0.5, '#1a1a24');
  }

  leg(cx + 4, stepN, false);

  // ---- 头：带冰冠的骑士盔，面甲一条发光的缝，长羽饰往后飘 ----
  const hx = tx + 1.5 + lean * 0.3;
  const hy = shY - 5.5;
  F(w, [[hx - 3.5, hy + 3.5], [hx - 3.8, hy - 2], [hx - 2, hy - 4.5], [hx + 2, hy - 4.5], [hx + 4, hy - 2], [hx + 4.2, hy + 1.5], [hx + 2.5, hy + 4], [hx - 1, hy + 4.5]], plate[1]);
  F(w, [[hx, hy - 4.5], [hx + 2, hy - 4.5], [hx + 4, hy - 2], [hx + 4.2, hy + 1.5], [hx + 2.5, hy + 4], [hx, hy + 4.3]], plate[2]);
  L(w, hx - 2, hy - 4, hx + 2, hy - 4, plate[3], 0.4);
  // 面甲缝：青光，大招时拖出光尾
  L(w, hx + 0.5, hy - 0.3, hx + 4.2, hy - 0.3, '#0c1220', 0.9);
  L(w, hx + 1.5, hy - 0.3, hx + 3.6, hy - 0.3, glow[anim === 'skill' || anim === 'skill2' ? 3 : 2], 0.5);
  if (anim === 'skill' || anim === 'skill2') for (let j = 1; j <= 3; j++) dot(w, hx + 0.5 - j * 1.2, hy - 0.5 - j * 0.2, j % 2 ? glow[3] : glow[2]);
  // 透气孔
  for (let k = 0; k < 3; k++) dot(w, hx + 2.6 + k * 0.6, hy + 2 + k * 0.4, plate[0]);
  // 冰冠：一圈冰尖
  for (let k = 0; k < 4; k++) {
    const x = hx - 2.5 + k * 1.9;
    const h = 2.6 + (k % 2) * 1.6;
    F(w, [[x - 0.8, hy - 4.2], [x, hy - 4.4 - h], [x + 0.8, hy - 4.2]], k % 2 ? ice[3] : ice[2]);
  }
  L(w, hx - 3, hy - 4.2, hx + 3.5, hy - 4.2, gold[2], 0.6);
  // 羽饰
  const pw = Math.sin(t * TAU * (anim === 'move' ? 2 : 1) + 1) * (0.8 + capeWind * 0.5);
  chain(w, [[hx - 1.5, hy - 5], [hx - 6, hy - 6 + pw * 0.4], [hx - 11 - capeWind * 2, hy - 3 + pw]], 1.5, 0.6, (k) => (k % 3 === 0 ? ermine[3] : k % 3 === 1 ? ermine[2] : ice[3]), 12);
  // 头盔边哈出的白气
  if (anim === 'idle' && t > 0.05 && t < 0.4) mist(w, hx + 5 + (t - 0.05) * 7, hy + 1 - (t - 0.05) * 5, t * 8, ice[3]);

  // ---- 近手 + 冰晶长剑 ----
  const sN: [number, number] = [tx + 4, shY + 1];
  const eN: [number, number] = [sN[0] + dir(armN)[0] * 5.5, sN[1] + dir(armN)[1] * 5.5];
  const hN: [number, number] = [eN[0] + dir(armN + foreN)[0] * 5, eN[1] + dir(armN + foreN)[1] * 5];
  // 拄剑时剑尖落地：把手放到剑柄上
  const [sdx, sdy] = dir(swordA);
  const blade = 19;
  const sword = () => {
    const gx = hN[0];
    const gy = hN[1];
    // 剑柄和配重球
    L(w, gx - sdx * 3, gy - sdy * 3, gx, gy, dark[2], 0.9);
    E(w, gx - sdx * 3.5, gy - sdy * 3.5, 1, 1, gold[3]);
    // 护手：横着的金色一条，两端冰晶
    const [nx, ny] = [-sdy, sdx];
    L(w, gx + sdx * 0.6 - nx * 3, gy + sdy * 0.6 - ny * 3, gx + sdx * 0.6 + nx * 3, gy + sdy * 0.6 + ny * 3, gold[2], 0.9);
    dot(w, gx + sdx * 0.6 - nx * 3.4, gy + sdy * 0.6 - ny * 3.4, ice[3]);
    dot(w, gx + sdx * 0.6 + nx * 3.4, gy + sdy * 0.6 + ny * 3.4, ice[3]);
    // 剑身：半透明冰晶，中间一条亮芯，边缘高光
    for (let k = 0; k <= 26; k++) {
      const q = k / 26;
      const x = gx + sdx * (1.2 + q * blade);
      const y = gy + sdy * (1.2 + q * blade);
      const wd = 1.3 * (1 - q * 0.6);
      E(w, x, y, wd, wd, q > 0.9 ? ice[3] : ice[2]);
    }
    L(w, gx + sdx * 1.5, gy + sdy * 1.5, gx + sdx * (blade - 1), gy + sdy * (blade - 1), glow[3], 0.4);
    L(w, gx + sdx * 2 + nx * 0.9, gy + sdy * 2 + ny * 0.9, gx + sdx * (blade - 3) + nx * 0.5, gy + sdy * (blade - 3) + ny * 0.5, '#ffffff', 0.3);
    // 剑上的寒光一闪一闪往上爬
    const sp = (t * 2) % 1;
    dot(w, gx + sdx * (2 + sp * (blade - 2)), gy + sdy * (2 + sp * (blade - 2)), '#ffffff');
  };
  // 剑在身后（举高时）先画剑再画手
  if (swordA > 2.2) sword();
  L(w, sN[0], sN[1], eN[0], eN[1], plate[1], 3.2);
  // 肩甲：圆壳 + 金边 + 冰尖
  E(w, sN[0], sN[1] - 0.5, 4.2, 3.4, plate[2]);
  E(w, sN[0] - 0.8, sN[1] - 1.5, 2.2, 1.4, plate[3]);
  L(w, sN[0] - 3, sN[1] + 1.2, sN[0] + 3.2, sN[1] + 1.2, gold[2], 0.5);
  dot(w, sN[0] - 1, sN[1] - 2, plate[3]);
  F(w, [[sN[0] - 1, sN[1] - 2.5], [sN[0] - 0.4, sN[1] - 6], [sN[0] + 0.8, sN[1] - 2.6]], ice[3]);
  L(w, eN[0], eN[1], hN[0], hN[1], plate[2], 2.8);
  E(w, eN[0], eN[1], 1.4, 1.4, plate[3]);
  if (swordA <= 2.2 && !(anim === 'death' && t > 0.55)) sword();
  E(w, hN[0], hN[1], 1.6, 1.6, dark[2]);
  if (anim === 'death' && t > 0.55) {
    const k = ease(ph(t, 0.55, 0.8));
    const bx = cx + 10;
    L(w, bx, G - 1 - (1 - k) * 8, bx + 18, G - 1.5 - (1 - k) * 2, ice[2], 1.6);
    L(w, bx + 1, G - 1.5 - (1 - k) * 8, bx + 18, G - 2 - (1 - k) * 2, '#ffffff', 0.3);
  }

  // ---- 普攻：突刺的冰光和剑尖前的冰屑 ----
  const tipX = hN[0] + sdx * blade;
  const tipY = hN[1] + sdy * blade;
  if (anim === 'attack' && trail.length) {
    const k = ph(t, 0.35, 0.62);
    for (let j = 0; j < 8; j++) dot(w, tipX - sdx * j * 1.4, tipY - sdy * j * 1.4 + (j % 2 ? 0.4 : -0.4), j < 3 ? '#ffffff' : glow[2]);
    if (k > 0.25) for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU;
      const r = 1 + (k - 0.25) * 8;
      flake(w, tipX + 2 + Math.cos(a) * r, tipY + Math.sin(a) * r, j % 2 ? ice[3] : '#ffffff', j % 3 === 0);
    }
  }
  // ---- 霜刃三连：三道剑光 ----
  if (anim === 'skill') {
    const cols = [ice[0], ice[1], glow[2], glow[3]];
    const sx = hN[0];
    const sy = hN[1];
    const rr = blade + 1;
    const show = (a: number, b: number) => t >= a && t < b + 0.12;
    // 第一刀：从后上方劈到前下方（顺时针）
    if (show(0.08, 0.26)) {
      const k = ease(ph(t, 0.08, 0.26));
      const fade = ph(t, 0.26, 0.38);
      if (fade < 1) arc(w, sx, sy, rr, -Math.PI * 0.75, -Math.PI * 0.75 + k * Math.PI * 1.05, 3.5 * (1 - fade), cols);
    }
    // 第二刀：从下往上挑
    if (show(0.34, 0.5)) {
      const k = ease(ph(t, 0.34, 0.5));
      const fade = ph(t, 0.5, 0.62);
      if (fade < 1) arc(w, sx, sy, rr, Math.PI * 0.35, Math.PI * 0.35 - k * Math.PI * 0.95, 3 * (1 - fade), cols);
    }
    // 第三刀：十字重斩，剑光最粗，砍完前方炸开一个冰十字
    if (show(0.6, 0.78)) {
      const k = ease(ph(t, 0.6, 0.78));
      const fade = ph(t, 0.78, 0.9);
      if (fade < 1) arc(w, sx, sy, rr + 1, -Math.PI * 0.6, -Math.PI * 0.6 + k * Math.PI * 0.95, 4.5 * (1 - fade), cols);
    }
    if (t >= 0.74 && t < 0.98) {
      const k = ph(t, 0.74, 0.98);
      const ox = cx + 30;
      const oy = hip - 12;
      const len = 4 + k * 9;
      const a = 1 - k;
      L(w, ox - len, oy - len * 0.8, ox + len, oy + len * 0.8, a > 0.5 ? '#ffffff' : glow[3], 1.2 * a + 0.3);
      L(w, ox - len, oy + len * 0.8, ox + len, oy - len * 0.8, a > 0.5 ? '#ffffff' : glow[3], 1.2 * a + 0.3);
      for (let j = 0; j < 12; j++) {
        const an = (j / 12) * TAU;
        const r = 2 + k * 12 * (0.7 + phash(j, 3, 9) * 0.5);
        flake(w, ox + Math.cos(an) * r, oy + Math.sin(an) * r * 0.8, j % 2 ? ice[3] : '#ffffff', j % 4 === 0);
      }
    }
    // 每刀打出的冰屑
    for (const [a, b] of [[0.2, 0.34], [0.45, 0.58]] as const) {
      if (t < a || t >= b) continue;
      const k = ph(t, a, b);
      for (let j = 0; j < 7; j++) flake(w, cx + 26 + (phash(j, 1, a * 9) - 0.3) * 10 * (0.5 + k), hip - 14 + (phash(j, 2, a * 9) - 0.5) * 12 * (0.5 + k), j % 2 ? ice[3] : '#ffffff', j % 3 === 0);
    }
  }
  // ---- 凛冬号令：暴雪绕着人转 ----
  if (anim === 'skill2' && t >= 0.4) {
    const k = ph(t, 0.4, 0.95);
    const fade = ph(t, 0.88, 1);
    const ox = cx + 8;
    for (let j = 0; j < 34; j++) {
      if (phash(j, 4, 1) < fade) continue;
      const a = phash(j, 1, 33) * TAU + k * 9 * (0.6 + phash(j, 2, 33) * 0.6);
      const r = 6 + phash(j, 3, 33) * 22;
      const x = ox + Math.cos(a) * r;
      const y = G - 4 - phash(j, 5, 33) * 30 + Math.sin(a) * r * 0.25;
      if (x < 0 || x > 64 || y < 0) continue;
      // 风雪拖成短线
      L(w, x, y, x - Math.sin(a) * 1.8, y + Math.cos(a) * 0.5, j % 3 ? ice[3] : '#ffffff', 0.35);
    }
    for (let j = 0; j < 4; j++) {
      const a = k * 7 + j * 1.6;
      const r = 12 + j * 4;
      const x = ox + Math.cos(a) * r;
      const y = G - 8 - j * 5 + Math.sin(a) * 2;
      if (x > 0 && x < 64 && fade < 0.6) flake(w, x, y, '#ffffff', true);
    }
    // 寒气往男爵身上回流（回血）
    if (t > 0.6 && t < 0.9) for (let j = 0; j < 8; j++) {
      const q = ((t - 0.6) * 4 + phash(j, 6, 2)) % 1;
      dot(w, lerp(ox + (phash(j, 7, 2) - 0.5) * 30, tx, q), lerp(G - 2, shY + 4, q), j % 2 ? glow[3] : '#ffffff');
    }
  }
  if (anim === 'death' && t > 0.35) {
    // 化成雪往下飘
    const q = ph(t, 0.35, 1);
    for (let k = 0; k < 16; k++) {
      const x = cx - 8 + phash(k, 1, 7) * 22 + Math.sin(q * 6 + k) * 2;
      const y = hip - 22 + phash(k, 2, 7) * 24 + q * 10;
      if (y < G) flake(w, x, y, k % 2 ? ice[3] : '#ffffff', k % 4 === 0);
    }
  }
}

const DRAW: Record<string, (w: W) => void> = {
  wb_everfrost_giant: giant,
  wb_snow_baron: baron,
};

export const isRealmBoss = (m: Pick<MonsterDef, 'id'>) => m.id in DRAW;

export function drawRealmFrame(m: MonsterDef, anim: MonAnim, i: number): Pix {
  const S = REALM_SIZE;
  const n = REALM_ANIMS.find((a) => a.key === anim)?.frames ?? 16;
  const p = new Pix(S, S);
  const w: W = { p, u: S / 64, anim, t: i / n, i, P: shades(m.art.color), A: shades(m.art.accent) };
  DRAW[m.id](w);
  finish({ p, rank: m.rank, g: S - 4, S, A: w.A, o: { anim: anim === 'skill' || anim === 'skill2' ? 'attack' : anim === 'hurt' && i > 2 ? 'idle' : anim, t: anim === 'death' ? (w.t < 0.45 ? w.t * 0.5 : 0.25 + ((w.t - 0.45) / 0.55) * 0.75) : w.t } });
  return p;
}
