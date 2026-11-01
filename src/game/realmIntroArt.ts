import { canvas, glowAt } from './dungeonPoster';
import { phash } from './pix';
import { ICE, ROCK, SNOW, aurora, moon, mountains, px, sky, snowField } from './winterPoster';
import { WPORTAL_EYE, WPORTAL_FOOT, WPORTAL_H, WPORTAL_RX, WPORTAL_RY, WPORTAL_W, drawWinterPortal } from './winterPortalArt';

/*
 * 永冬冰原入场 CG（用户 11-01：点传送门踏入新地图时播一段 CG；第一人称，画面里不出现人物）。
 * 全部代码逐像素画，320×180 一帧，按时间 t（秒）实时画，60fps：
 *   0.0-6.0  第一人称从城外草原走向永冬传送门：夜色里的草地、树丛、石头迎面滑过，远处是城镇的灯火，视线随脚步轻微起伏，
 *            巨门越走越大，门周围结着霜，门洞里的漩涡卷着冰屑，最后漩涡填满整个视野，白光一闪
 *   6.0-9.4  穿过空间隧道：漆黑里向四周飞散的光线、冷光环和冰晶碎片迎面扑来，再一道白光
 *   9.4-18   眼前一片茫茫雪原和雪山（极光冷月，没有任何生物）；
 *            看了两秒后猛地回头——身后只有自己来时的脚印和一道正在碎成冰屑的门影，传送门消失了；
 *            这时浮出标题「永冬冰原」，最后压黑
 */
export const CG_W = 320;
export const CG_H = 180;
export const CG_LEN = 18;
/** 各段的起止秒 */
export const CG_T = { portal: 0, flash1: 5.8, tunnel: 6.0, flash2: 9.2, realm: 9.4, turn: 12.6, turnEnd: 13.8, vanish: 13.7, title: 14.6, fadeOut: 17.3, end: CG_LEN };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/** outfit 参数保留着（接口兼容），第一人称版画面里不出现人物 */
export interface CgOpts { outfit?: string; from?: 'canglin' | 'duskhaven' }

const cache = new Map<string, HTMLCanvasElement>();
const cached = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  let c = cache.get(key);
  if (!c) {
    const o = canvas(w, h);
    draw(o.ctx);
    c = o.c;
    cache.set(key, c);
  }
  return c;
};

// ---------------- 透视：第一人称相机 ----------------
/** 焦距（像素）；世界单位≈米，眼高 EYE；传送门按 20 像素/米 画成原图再按距离缩放 */
const F = 120;
const EYE = 2.6;
const NATIVE = 20;

// ---------------- 传送门（画法在 winterPortalArt，原图 160×170，门脚 y=156） ----------------
const PX0 = WPORTAL_W / 2;
const PY0 = WPORTAL_FOOT;
/** 门洞中心离地的高度（米） */
const GATE_EYE_M = WPORTAL_EYE / NATIVE;
let portalTmp: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
/** 把整座传送门画到原图大小的临时画布上 */
function portalImage(t: number, power: number, dissolve: number) {
  portalTmp ??= canvas(WPORTAL_W, WPORTAL_H);
  const { c, ctx } = portalTmp;
  ctx.clearRect(0, 0, WPORTAL_W, WPORTAL_H);
  drawWinterPortal(ctx, PX0, PY0, t, power, dissolve);
  return c;
}

// ---------------- 第一幕：第一人称从城外草原走向传送门 ----------------

/** 夜里的草地：暗到亮 */
const GRASS = ['#0e2a1e', '#16402a', '#1f5634', '#2c6e40', '#3f8a4e'];
const BARK = ['#1a140e', '#2e2416', '#4a3a22'];
const HY1 = 100;
const SKY_PAD = 90;
/** 当前这帧的地平线（抬头时往下移） */
let hy = HY1;
/** 没有雪的山和草丘：顶上一道亮边，迎光面亮背光面暗 */
function hills(ctx: CanvasRenderingContext2D, w: number, base: number, ridge: (x: number) => number, pal: string[], salt: number) {
  for (let x = 0; x < w; x++) {
    const top = ridge(x);
    const lit = ridge(x + 1) - ridge(x - 1) > 0;
    for (let y = Math.floor(top); y < base; y++) {
      const depth = y - top;
      const col = depth < 1 ? pal[3] : lit ? (phash(x, y, salt) < 0.08 ? pal[3] : pal[2]) : phash(x, y, salt + 1) < 0.06 ? pal[2] : pal[1];
      px(ctx, x, y, col);
    }
  }
}
/** 远处的城镇剪影：城墙、几座房子和塔楼，窗里透着暖光 */
function townSilhouette(ctx: CanvasRenderingContext2D, x0: number, base: number) {
  const DARK = '#0a1226', MID = '#101a34', WIN = '#f0c060';
  glowAt(ctx, x0 + 50, base - 10, 60, 'rgba(240,180,90,0.14)');
  // 城墙和垛口、两座门楼
  for (let dx = 0; dx < 100; dx++) for (let d = 0; d < 7; d++) {
    if (d === 6 && dx % 4 >= 2) continue;
    px(ctx, x0 + dx, base - d, dx % 11 === 0 ? MID : DARK);
  }
  for (const tx of [0, 92]) for (let d = 0; d < 12; d++) px(ctx, x0 + tx, base - d, DARK, 8, 1);
  for (const tx of [0, 92]) { px(ctx, x0 + tx - 1, base - 12, DARK, 10, 1); px(ctx, x0 + tx + 3, base - 6, WIN, 1, 1); }
  // 屋顶尖尖的房子、一座教堂塔、风车
  for (const [dx, w, h, roof] of [[10, 9, 5, 4], [22, 11, 7, 5], [36, 8, 5, 4], [47, 13, 8, 6], [64, 9, 6, 4], [76, 11, 5, 5]]) {
    for (let d = 0; d < h; d++) px(ctx, x0 + dx, base - 6 - d, dx % 2 ? DARK : MID, w, 1);
    for (let d = 0; d < roof; d++) {
      const inset = roof - 1 - d;
      px(ctx, x0 + dx + inset, base - 6 - h - roof + d, DARK, Math.max(1, w - inset * 2), 1);
    }
    if (phash(dx, 1, 37) < 0.85) px(ctx, x0 + dx + Math.floor(w / 2) - 1, base - 8 - Math.floor(h / 2), WIN, 1, 1);
    if (w > 10) px(ctx, x0 + dx + 2, base - 8 - Math.floor(h / 2), WIN, 1, 1);
  }
  // 教堂塔
  for (let d = 0; d < 22; d++) px(ctx, x0 + 56, base - 6 - d, MID, 6, 1);
  for (let d = 0; d < 7; d++) px(ctx, x0 + 56 + (6 - d), base - 28 - d, DARK, Math.max(1, d * 2 - 6), 1);
  px(ctx, x0 + 58, base - 20, WIN, 2, 2);
  // 几缕炊烟
  for (let k = 0; k < 3; k++) for (let j = 0; j < 8; j++) px(ctx, x0 + 26 + k * 24 + Math.sin(j * 0.9 + k) * 1.5, base - 16 - j * 1.6 - k * 2, `rgba(160,170,190,${(0.35 - j * 0.04).toFixed(2)})`);
}
/** 第一幕的天空：冷月、星星、远山和远处的城镇灯火（相机前进时远景几乎不动） */
function fpSky() {
  // 比画面高 SKY_PAD：走近时镜头会抬头，天空要有余量
  const H = HY1 + 12 + SKY_PAD, B = HY1 + SKY_PAD;
  return cached('cg-fp-sky', CG_W, H, (ctx) => {
    sky(ctx, CG_W, H, 31);
    moon(ctx, 268, 30 + SKY_PAD, 6);
    hills(ctx, CG_W, B + 2, (x) => B - 14 - Math.abs(Math.sin(x * 0.025 + 2)) * 20 - Math.sin(x * 0.1) * 3, ['#0a1430', '#122244', '#1a2e58', '#2a4878'], 33);
    hills(ctx, CG_W, B + 2, (x) => B - 6 - Math.abs(Math.sin(x * 0.04 + 0.5)) * 10 - Math.sin(x * 0.15) * 2, ['#0a1430', '#0e1c3c', '#14284c', '#1e3660'], 35);
    // 远处起伏的草丘
    hills(ctx, CG_W, B + 8, (x) => B - 1 - Math.abs(Math.sin(x * 0.05 + 1)) * 6 - Math.sin(x * 0.2) * 1.5, [GRASS[0], GRASS[0], GRASS[1], GRASS[2]], 34);
    townSilhouette(ctx, 24, B - 1);
  });
}
/** 慢慢飘的夜云：一层比画面宽的薄云，每帧错开画 */
function cloudLayer() {
  const W = CG_W + 96;
  return cached('cg-fp-clouds', W, 70, (ctx) => {
    for (let k = 0; k < 7; k++) {
      const cx = phash(k, 1, 38) * W, cy = 12 + phash(k, 2, 38) * 40, rw = 26 + phash(k, 3, 38) * 34;
      for (let i = 0; i < 5; i++) {
        const ox = (phash(k, i + 4, 38) - 0.5) * rw * 1.4, oy = (phash(k, i + 9, 38) - 0.5) * 6;
        const r = rw * (0.35 + phash(k, i + 14, 38) * 0.3);
        for (let yy = -r * 0.35; yy <= r * 0.35; yy++) for (let xx = -r; xx <= r; xx++) {
          if ((xx / r) ** 2 + (yy / (r * 0.35)) ** 2 > 1) continue;
          px(ctx, cx + ox + xx, cy + oy + yy, yy < -r * 0.15 ? 'rgba(60,80,130,0.35)' : 'rgba(20,30,60,0.45)');
        }
      }
    }
  });
}
/** 第一幕的草地底色：远处暗、近处亮，带杂点（会动的草丛和石头另画） */
function fpGround() {
  return cached('cg-fp-ground', CG_W, CG_H - HY1 + 12, (ctx) => {
    const h = CG_H - HY1 + 12;
    for (let y = 0; y < h; y++) for (let x = 0; x < CG_W; x++) {
      const t = y / h;
      const v = 0.3 + t * 2.4 + (phash(x, y, 36) - 0.5) * 1.1;
      px(ctx, x, y, GRASS[Math.max(0, Math.min(4, Math.round(v)))]);
    }
  });
}
/** 世界坐标 → 屏幕：x 向右、y 向上（地面 0）、z 向前 */
const proj = (xw: number, yw: number, z: number) => ({ x: CG_W / 2 + (xw * F) / z, y: hy + ((EYE - yw) * F) / z, s: F / z });
/** 一棵结了冰的枯树，按比例 s 画（s=1 时约 40 像素高） */
function deadTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, salt: number) {
  const th = 40 * s;
  const w = Math.max(1, Math.round(2.4 * s));
  for (let j = 0; j < th; j++) px(ctx, x - w / 2, y - j, j < th * 0.1 ? ROCK[1] : ROCK[0], w, 1);
  for (let b = 0; b < 4; b++) {
    const by = y - th * (0.4 + b * 0.16);
    const len = (9 - b * 1.5) * s;
    const sg = phash(b, salt, 3) < 0.5 ? -1 : 1;
    for (let i = 1; i <= len; i++) {
      px(ctx, x + sg * i, by - i * 0.5, ROCK[0], Math.max(1, Math.round(s * 0.8)), Math.max(1, Math.round(s * 0.8)));
      if (i % 2 === 0) px(ctx, x + sg * i, by - i * 0.5 - Math.max(1, s * 0.8), SNOW[4], Math.max(1, Math.round(s * 0.8)), 1);
    }
  }
}
/** 一簇冰晶，按比例 s 画（s=1 时约 14 像素高） */
function iceCluster(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, salt: number) {
  for (const [dx, h, c] of [[0, 14, ICE[3]], [-3, 8, ICE[2]], [3, 10, ICE[2]], [-5, 4, ICE[1]], [6, 5, ICE[1]]] as [number, number, string][]) {
    const hh = h * s * (0.8 + phash(dx + 9, salt, 4) * 0.4);
    const w = Math.max(1, Math.round(1.6 * s));
    for (let j = 0; j < hh; j++) px(ctx, x + dx * s - w / 2, y - j, j > hh - 1.5 * s ? '#ffffff' : c, w, 1);
  }
  glowAt(ctx, x, y - 6 * s, 10 * s, 'rgba(110,210,255,0.22)');
}

/** 一棵夜里的阔叶树，按比例 s 画（s=1 时约 46 像素高） */
function leafTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, salt: number) {
  const th = 18 * s;
  const w = Math.max(1, Math.round(3 * s));
  for (let j = 0; j < th; j++) px(ctx, x - w / 2, y - j, BARK[1], w, 1);
  px(ctx, x - w / 2, y - th, BARK[0], Math.max(1, Math.round(s)), Math.round(th));
  // 三团树冠
  for (const [dx, dy, r] of [[0, 32, 15], [-9, 24, 11], [10, 25, 11]]) {
    const rr = r * s * (0.9 + phash(dx + 20, salt, 5) * 0.2);
    for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr * 1.15; xx <= rr * 1.15; xx++) {
      if ((xx / 1.15) ** 2 + yy * yy > rr * rr) continue;
      const edge = (xx / 1.15) ** 2 + yy * yy > rr * rr * 0.6;
      const col = yy < -rr * 0.3 && xx > 0 ? GRASS[3] : edge && yy > 0 ? GRASS[0] : phash(Math.round(xx), Math.round(yy), salt) < 0.15 ? GRASS[0] : GRASS[1];
      px(ctx, x + dx * s + xx, y - dy * s + yy, col);
    }
  }
}
/** 一丛灌木 / 草丛 */
function bush(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, salt: number) {
  for (const [dx, h, c] of [[0, 9, GRASS[2]], [-4, 6, GRASS[1]], [4, 7, GRASS[1]], [-7, 4, GRASS[1]], [7, 4, GRASS[0]]] as [number, number, string][]) {
    const hh = h * s * (0.8 + phash(dx + 9, salt, 4) * 0.4);
    const w = Math.max(1, Math.round(2.4 * s));
    for (let j = 0; j < hh; j++) px(ctx, x + dx * s - w / 2 + (j % 2 ? 0.5 : -0.5) * s, y - j, j > hh - 1.5 * s ? GRASS[3] : c, w, 1);
  }
}
/** 一块长着苔的石头 */
function boulder(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const rx = 7 * s, ry = 4.5 * s;
  for (let yy = -ry; yy <= 0.5; yy++) for (let xx = -rx; xx <= rx; xx++) {
    if ((xx / rx) ** 2 + (yy / ry) ** 2 > 1) continue;
    px(ctx, x + xx, y + yy, yy < -ry * 0.5 && xx < 0 ? '#5a6478' : xx > rx * 0.4 ? '#262c3c' : yy < -ry * 0.7 ? GRASS[2] : '#3c4458');
  }
}
/** 路两旁的东西：固定的世界坐标，相机往前走它们就迎面滑过来 */
const SIDE: { x: number; z: number; kind: 'tree' | 'bush' | 'rock'; salt: number }[] = [];
for (let k = 0; k < 22; k++) {
  const side = k % 2 ? 1 : -1;
  const r = phash(k, 3, 44);
  SIDE.push({ x: side * (2.4 + phash(k, 1, 44) * 5), z: 1.2 + k * 0.85 + phash(k, 2, 44) * 0.8, kind: r < 0.4 ? 'tree' : r < 0.75 ? 'bush' : 'rock', salt: k });
}
const DOTS = 220;
const RIDGES = 7;
const WORLD_DEPTH = 30;
const FLAKES = 130;

function scenePortal(ctx: CanvasRenderingContext2D, t: number) {
  const k = clamp01(t / CG_T.flash1);
  // 相机前进：起步稍慢，最后被门吸着加速
  // 起步先站半秒，再走，最后被门吸着加速
  const kk = ease(clamp01(t / 1.2)) * 0.08 + clamp01((t - 0.5) / (CG_T.flash1 - 0.5)) * 0.92;
  const camZ = 25.4 * (0.72 * kk + 0.28 * kk * kk * kk);
  const portalZ = 26.6 - camZ;
  const power = clamp01((t - 2.0) / 3.4);
  // 脚步带来的起伏和左右轻晃
  const walking = clamp01((t - 0.5) / 0.8);
  const bob = Math.sin(t * Math.PI * 2 * 1.75) * 1.3 * walking * (1 - k * 0.4);
  const sway = Math.sin(t * Math.PI * 2 * 0.875) * 1.2 * walking;
  // 越走近越抬头看这座巨门
  const pitch = ease(clamp01((t - 2.6) / 3.0)) * 80;
  hy = HY1 + pitch;
  ctx.save();
  ctx.translate(Math.round(sway), Math.round(bob));
  ctx.drawImage(fpSky(), 0, Math.round(pitch) - 6 - SKY_PAD);
  ctx.drawImage(cloudLayer(), -Math.round((t * 4) % 96), Math.round(pitch) - 6 - SKY_PAD + 4);
  ctx.drawImage(fpGround(), 0, Math.round(hy) - 6);
  // 远处贴着地的薄雾
  for (let i = 0; i < 6; i++) {
    const y = hy + 2 + i * 1.5;
    ctx.fillStyle = `rgba(120,150,190,${(0.22 - i * 0.035).toFixed(3)})`;
    ctx.fillRect(0, y, CG_W, 2);
  }
  // 脚下通向门的小路：踩出来的土路，带透视，微微弯
  for (let y = Math.ceil(hy) + 2; y < CG_H + 4; y++) {
    const z = (EYE * F) / (y - hy);
    const zw = z + camZ;
    const half = (0.9 * F) / z;
    const cx = CG_W / 2 + (Math.sin(zw * 0.35) * 0.5 * F) / z;
    const col = phash(0, y + Math.round(camZ * 10), 50) < 0.3 ? '#2c2418' : '#3a3020';
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx - half), y, Math.round(half * 2), 1);
    px(ctx, cx - half - 1, y, GRASS[0]);
    px(ctx, cx + half, y, GRASS[0]);
  }
  // 一垄垄的草：横着的草带，迎面滑过
  for (let r = 0; r < RIDGES; r++) {
    const z0 = (r / RIDGES) * WORLD_DEPTH;
    const z = ((z0 - camZ) % WORLD_DEPTH + WORLD_DEPTH) % WORLD_DEPTH + 0.6;
    const p = proj(0, 0, z);
    if (p.y > CG_H + 8) continue;
    const amp = Math.min(4, 2.2 * (F / z) / 20);
    const tuft = Math.max(1, Math.round((F / z) / 24));
    for (let x = -4; x < CG_W + 4; x++) {
      const xw = ((x - CG_W / 2) * z) / F;
      const y = p.y + Math.sin(xw * 0.9 + r * 2.1) * amp;
      px(ctx, x, y, GRASS[3]);
      px(ctx, x, y + 1, GRASS[0]);
      if (phash(x, r, 47) < 0.25) px(ctx, x + Math.round(Math.sin(t * 2.4 + x * 0.12 + r) * (tuft > 1 ? 1 : 0.4)), y - tuft, GRASS[4], 1, tuft);
    }
  }
  // 草地上的碎草叶和小花
  for (let i = 0; i < DOTS; i++) {
    const xw = (phash(i, 1, 45) - 0.5) * 24;
    const z0 = phash(i, 2, 45) * WORLD_DEPTH;
    const z = ((z0 - camZ) % WORLD_DEPTH + WORLD_DEPTH) % WORLD_DEPTH + 0.4;
    const p = proj(xw, 0, z);
    if (p.x < -2 || p.x > CG_W + 2 || p.y > CG_H + 8) continue;
    const kind = phash(i, 3, 45);
    const sz = z < 2.5 ? 2 : 1;
    px(ctx, p.x, p.y, kind < 0.4 ? GRASS[0] : kind < 0.8 ? GRASS[4] : kind < 0.9 ? '#e8e0a0' : '#d8a0c0', sz, sz);
  }
  // 路两旁和门：按远近先画远的
  const drawSide = (far: boolean) => {
    for (const o of SIDE) {
      const z = o.z - camZ;
      if (z < 0.35 || (far ? z <= portalZ : z > portalZ)) continue;
      const p = proj(o.x, 0, z);
      if (p.x < -60 || p.x > CG_W + 60) continue;
      const s = p.s / NATIVE;
      if (o.kind === 'tree') leafTree(ctx, p.x, p.y, s, o.salt);
      else if (o.kind === 'bush') bush(ctx, p.x, p.y, s, o.salt);
      else boulder(ctx, p.x, p.y, s);
    }
  };
  drawSide(true);
  // 传送门
  {
    const p = proj(0, 0, Math.max(0.5, portalZ));
    const s = p.s / NATIVE;
    // 门周围的草地结了一圈霜
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      const rr = (1 + phash(i, 1, 48) * 0.5) * (i % 2 ? 1 : 0.8);
      const q = proj(Math.cos(a) * 7 * rr, 0, Math.max(0.5, portalZ) + Math.sin(a) * 2.2 * rr);
      if (q.y > CG_H + 4 || q.y < HY1 - 2) continue;
      px(ctx, q.x, q.y, i % 3 ? SNOW[3] : SNOW[4], s > 1 ? 2 : 1, 1);
    }
    glowAt(ctx, p.x, p.y, 60 * s, `rgba(90,220,255,${(0.22 + power * 0.28).toFixed(2)})`);
    const img = portalImage(t, power, 0);
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(img, p.x - PX0 * s, p.y - PY0 * s, WPORTAL_W * s, WPORTAL_H * s);
    ctx.imageSmoothingEnabled = false;
    // 被吸进门洞的雪：从四面八方向门洞中心汇聚
    const cx = p.x, cy = proj(0, GATE_EYE_M, Math.max(0.5, portalZ)).y;
    const n = 30 + Math.round(power * 60);
    for (let i = 0; i < n; i++) {
      const ph = 1 - ((t * 0.55 + phash(i, 3, 52)) % 1);
      const ang = phash(i, 4, 52) * Math.PI * 2;
      const r = (6 + ph * 200) * Math.max(0.35, Math.min(2.2, s));
      const sx = cx + Math.cos(ang) * r, sy = cy + Math.sin(ang) * r * 0.6;
      if (sx < 0 || sx >= CG_W || sy < 0 || sy >= CG_H) continue;
      px(ctx, sx, sy, ph < 0.3 ? '#ffffff' : ph < 0.6 ? ICE[3] : 'rgba(200,230,255,0.6)');
      if (ph < 0.5) px(ctx, sx - Math.cos(ang) * 1.5, sy - Math.sin(ang) * 0.8, ICE[2]);
    }
  }
  drawSide(false);
  // 夜里的萤火虫：慢慢飘、一明一暗
  for (let i = 0; i < 26; i++) {
    const xw = (phash(i, 1, 46) - 0.5) * 16 + Math.sin(t * 0.7 + i) * 0.6;
    const yw = 0.4 + phash(i, 2, 46) * 2.2 + Math.sin(t * 1.1 + i * 2) * 0.3;
    const z0 = phash(i, 3, 46) * 18;
    const z = ((z0 - camZ) % 18 + 18) % 18 + 0.5;
    const p = proj(xw, yw, z);
    if (p.x < 0 || p.x >= CG_W || p.y < 0 || p.y >= CG_H) continue;
    const a = 0.3 + (Math.sin(t * 3 + i * 1.7) + 1) * 0.35;
    px(ctx, p.x, p.y, `rgba(220,255,150,${a.toFixed(2)})`, z < 2 ? 2 : 1, z < 2 ? 2 : 1);
    if (z < 3) glowAt(ctx, p.x, p.y, 3, `rgba(200,255,120,${(a * 0.4).toFixed(2)})`);
  }
  // 从门里吹出来的冰屑，越近门越多
  for (let i = 0; i < FLAKES; i++) {
    if (phash(i, 4, 46) > power * 0.9 + 0.1) continue;
    const xw = (phash(i, 1, 49) - 0.5) * 10;
    const yw = ((phash(i, 2, 49) * 4.2 - t * 0.8) % 4.2 + 4.2) % 4.2;
    const z0 = phash(i, 3, 49) * 10;
    const z = ((z0 - camZ) % 10 + 10) % 10 + 0.3;
    const p = proj(xw, yw, z);
    if (p.x < 0 || p.x >= CG_W || p.y < 0 || p.y >= CG_H) continue;
    if (z < 1.6) px(ctx, p.x, p.y, 'rgba(230,250,255,0.9)', 2, 2);
    else px(ctx, p.x, p.y, z < 6 ? ICE[4] : 'rgba(200,225,255,0.55)');
  }
  ctx.restore();
  // 门里的能量偶尔一闪，照亮整片草地
  const flick = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)) * power;
  if (flick > 0.55) {
    ctx.fillStyle = `rgba(150,230,255,${((flick - 0.55) * 0.5).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
  // 四角压暗
  {
    const g = ctx.createRadialGradient(CG_W / 2, CG_H / 2, 70, CG_W / 2, CG_H / 2, 200);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,10,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
  // 开头从黑里淡入
  if (t < 0.8) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - ease(t / 0.8)).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
  // 白光一闪
  const fl = clamp01((t - CG_T.flash1) / (CG_T.tunnel - CG_T.flash1));
  if (fl > 0) {
    ctx.fillStyle = `rgba(240,252,255,${ease(fl).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
}

// ---------------- 第二幕：空间隧道 ----------------

/** 旋转的冰晶碎片：一个菱形，按角度 a 转 */
function shard(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let v = -s; v <= s; v += 0.5) for (let u = -s * 0.5; u <= s * 0.5; u += 0.5) {
    if (Math.abs(u) / (s * 0.5) + Math.abs(v) / s > 1) continue;
    const col = u < -s * 0.15 ? '#ffffff' : u < s * 0.1 ? ICE[4] : ICE[2];
    px(ctx, x + u * ca - v * sa, y + u * sa + v * ca, col);
  }
}
function sceneTunnel(ctx: CanvasRenderingContext2D, t: number) {
  const tt = t - CG_T.tunnel;
  // 越飞越快，最后一秒开始抖
  const spd = 1 + tt * 0.35;
  const tz = tt * spd * 0.6;
  const shake = clamp01((tt - 2.2) / 1.0) * 2;
  const cx = CG_W / 2 + Math.sin(tt * 3) * 3 + (phash(Math.floor(t * 60), 1, 77) - 0.5) * shake;
  const cy = CG_H / 2 + Math.cos(tt * 2.3) * 2 + (phash(Math.floor(t * 60), 2, 77) - 0.5) * shake;
  ctx.fillStyle = '#030616';
  ctx.fillRect(0, 0, CG_W, CG_H);
  glowAt(ctx, cx, cy, 90, 'rgba(40,80,160,0.5)');
  glowAt(ctx, cx, cy, 26, 'rgba(160,220,255,0.35)');
  // 向外飞的光线：越外越长越亮（迎面扑来）
  for (let k = 0; k < 100; k++) {
    const ang = phash(k, 1, 71) * Math.PI * 2;
    const speed = 0.7 + phash(k, 2, 71) * 1.3;
    const ph = (tz * speed + phash(k, 3, 71)) % 1;
    const r0 = ph * ph * 190;
    const len = (4 + ph * 30) * Math.min(2, spd);
    const col = ph < 0.3 ? 'rgba(120,160,255,0.5)' : ph < 0.7 ? ICE[2] : k % 3 ? ICE[4] : '#ffffff';
    for (let d = 0; d < len; d += 1) px(ctx, cx + Math.cos(ang) * (r0 + d), cy + Math.sin(ang) * (r0 + d) * 0.8, col);
  }
  // 一圈圈往外扩的冷光环
  for (let k = 0; k < 3; k++) {
    const ph = (tz * 0.9 + k / 3) % 1;
    const r = ph * 170;
    for (let i = 0; i < 120; i++) {
      const ang = (i / 120) * Math.PI * 2;
      px(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, ph < 0.5 ? `rgba(160,220,255,${(0.9 - ph).toFixed(2)})` : `rgba(140,120,255,${(0.9 - ph).toFixed(2)})`);
    }
  }
  // 一道道迎面飞过的冰环（隧道壁）
  for (let k = 0; k < 5; k++) {
    const ph = (tz * 0.5 + k / 5) % 1;
    const r = 6 + ph * ph * 260;
    const a = (ph < 0.15 ? ph / 0.15 : 1 - (ph - 0.15) / 0.85) * 0.9;
    const n = Math.round(r * 5);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + tz * 0.4 + k;
      const rr = r * (1 + Math.sin(ang * 6 + k) * 0.03);
      const w = ph > 0.6 ? 2 : 1;
      px(ctx, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.8, i % 10 < 6 ? `rgba(120,200,255,${a.toFixed(2)})` : `rgba(230,250,255,${a.toFixed(2)})`, w, w);
    }
  }
  // 飞过去的冰晶碎片
  for (let k = 0; k < 18; k++) {
    const ang = phash(k, 4, 72) * Math.PI * 2;
    const ph = (tz * (0.5 + phash(k, 5, 72) * 0.7) + phash(k, 6, 72)) % 1;
    const r = 10 + ph * ph * 180;
    shard(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, 2 + ph * 8, tt * 4 + k);
  }
  // 四角压暗
  const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, 200);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,10,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CG_W, CG_H);
  const fl = clamp01((t - CG_T.flash2) / (CG_T.realm - CG_T.flash2));
  if (fl > 0) {
    ctx.fillStyle = `rgba(240,252,255,${ease(fl).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
}

// ---------------- 第三幕：永冬冰原（环视全景） ----------------

const PANO_W = 1280;
const HY3 = 112;
/** 回头看到的那个位置（全景图上的 x），传送门原本立在这里 */
const BACK_X = 950;
const BACK_Y = 152;
/** 回头看到的门按这个比例画（离得稍远） */
const BACK_K = 0.7;
/** 视线：先在正前方慢慢往右看 150 像素，再猛地转身 640 像素（半圈） */
const LOOK_DRIFT = 150;
const TURN = 640;
/** 第三幕的全景图：茫茫雪原和连绵的雪山，极光冷月，没有任何生物；右半是回头看到的那片雪 */
function realmPano() {
  return cached('cg-realm-pano', PANO_W, CG_H, (ctx) => {
    sky(ctx, PANO_W, HY3 + 10, 91);
    aurora(ctx, PANO_W, 48, 40, 0.7, 3);
    moon(ctx, 410, 26, 8);
    // 三层雪山：最远的高而淡，越近越暗越矮
    mountains(ctx, PANO_W, HY3 - 6, (x) => HY3 - 44 - Math.abs(Math.sin(x * 0.014 + 0.6)) * 34 - Math.sin(x * 0.05) * 5, ['#1c2e52', '#24406a', '#2e5080', '#3a6296'], 9, 92);
    mountains(ctx, PANO_W, HY3, (x) => HY3 - 26 - Math.abs(Math.sin(x * 0.022 + 1)) * 30 - Math.sin(x * 0.08) * 4, ROCK, 7, 93);
    mountains(ctx, PANO_W, HY3 + 5, (x) => HY3 - 4 - Math.abs(Math.sin(x * 0.045 + 3)) * 14 - Math.sin(x * 0.19) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 94);
    snowField(ctx, PANO_W, CG_H, HY3 + 8, 96);
    // 几道被风吹出来的雪丘
    for (let k = 0; k < 7; k++) {
      const cx = 60 + phash(k, 1, 97) * (PANO_W - 120), cy = HY3 + 26 + phash(k, 2, 97) * 36, rw = 30 + phash(k, 3, 97) * 40;
      if (Math.abs(cx - BACK_X) < 110) continue;
      for (let dx = -rw; dx <= rw; dx++) {
        const h = Math.sqrt(Math.max(0, 1 - (dx / rw) ** 2)) * rw * 0.14;
        for (let d = 0; d < h; d++) px(ctx, cx + dx, cy - d, d > h - 1.5 ? SNOW[4] : dx < 0 ? SNOW[3] : SNOW[2]);
      }
    }
    // 散落的冰晶和几棵冻死的枯树（远远的，很小）
    for (let k = 0; k < 16; k++) {
      const x = 20 + phash(k, 1, 98) * (PANO_W - 40), y = HY3 + 20 + phash(k, 2, 98) * 40;
      if (Math.abs(x - BACK_X) < 90) continue;
      const h = 4 + phash(k, 3, 98) * 6;
      for (let j = 0; j < h; j++) { px(ctx, x, y - j, j === h - 1 ? '#ffffff' : ICE[3]); px(ctx, x + 1, y - j * 0.8, ICE[2]); }
    }
    deadTree(ctx, 70, HY3 + 22, 0.7, 4);
    deadTree(ctx, 520, HY3 + 18, 0.5, 5);
    deadTree(ctx, BACK_X - 150, HY3 + 30, 1.1, 5);
    deadTree(ctx, BACK_X + 156, HY3 + 36, 1.3, 6);
    iceCluster(ctx, BACK_X - 100, HY3 + 48, 1, 8);
    iceCluster(ctx, BACK_X + 118, HY3 + 60, 1.3, 9);
    // 自己来时的脚印：从脚下一路通到门原来立着的地方
    for (let i = 0; i < 8; i++) {
      const y = CG_H - 2 - i * 3.6;
      const spread = 9 - i * 0.9;
      const w = i < 4 ? 2 : 1;
      px(ctx, BACK_X - spread, y - (i % 2 ? 0 : 1.5), SNOW[1], w, w);
      px(ctx, BACK_X + spread, y - (i % 2 ? 1.5 : 0), SNOW[1], w, w);
    }
  });
}
/** 这一刻视线转到了全景图的哪里 */
function panAt(t: number) {
  const tt = t - CG_T.realm;
  const drift = ease(clamp01(tt / (CG_T.turn - CG_T.realm))) * LOOK_DRIFT;
  const turn = ease(clamp01((t - CG_T.turn) / (CG_T.turnEnd - CG_T.turn))) * TURN;
  return drift + turn;
}
function sceneRealm(ctx: CanvasRenderingContext2D, t: number) {
  const tt = t - CG_T.realm;
  const pan = panAt(t);
  // 站着时的轻微呼吸晃动
  const sway = Math.sin(t * 2.2) * 1.5;
  const bob = Math.sin(t * 3.1) * 0.8;
  const ox = -Math.round(pan + sway), oy = Math.round(bob);
  ctx.drawImage(realmPano(), ox, oy);
  // 转身时带拖影：再叠两层错开的全景
  const spinK = clamp01((t - CG_T.turn) / (CG_T.turnEnd - CG_T.turn));
  const spinV = Math.sin(Math.PI * spinK);
  if (spinV > 0.05) {
    ctx.globalAlpha = 0.35 * spinV;
    ctx.drawImage(realmPano(), ox + Math.round(6 * spinV), oy);
    ctx.drawImage(realmPano(), ox + Math.round(12 * spinV), oy);
    ctx.globalAlpha = 1;
  }
  // 贴着地面被风卷起的雪：一道道横着飞的细线
  for (let i = 0; i < 24; i++) {
    const d = phash(i, 1, 64);
    const y = HY3 + 14 + d * 60 + oy;
    const len = 6 + d * 14;
    const x = (((phash(i, 2, 64) * CG_W + t * (90 + d * 120) - pan * (0.4 + 0.6 * d)) % CG_W) + CG_W) % CG_W;
    for (let j = 0; j < len; j++) px(ctx, x - j, y, `rgba(235,245,255,${(0.6 * (1 - j / len)).toFixed(2)})`);
  }
  // 回头：传送门正在碎成冰屑，碎完只剩雪地上一圈霜和一点余光
  const dis = clamp01((t - CG_T.vanish) / 1.4);
  const bx = BACK_X + ox, by = BACK_Y + oy;
  if (bx > -80 && bx < CG_W + 80) {
    const glowA = 0.42 * (1 - clamp01((t - CG_T.vanish) / 2.4));
    if (glowA > 0.01) glowAt(ctx, bx, by, 40, `rgba(90,220,255,${glowA.toFixed(2)})`);
    // 雪地上留下的霜圈
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * Math.PI * 2;
      px(ctx, bx + Math.cos(a) * 60, by + 1 + Math.sin(a) * 7, `rgba(190,245,255,${(0.35 + dis * 0.55).toFixed(2)})`);
    }
    if (dis < 1) {
      ctx.globalAlpha = 1 - dis * 0.5;
      ctx.drawImage(portalImage(t, 1 - dis, dis), bx - PX0 * BACK_K, by - PY0 * BACK_K, WPORTAL_W * BACK_K, WPORTAL_H * BACK_K);
      ctx.globalAlpha = 1;
    }
    // 门碎完以后地上剩下几块插着的冰碴
    if (dis > 0.6) for (let i = 0; i < 9; i++) {
      const sx = bx + (phash(i, 1, 66) - 0.5) * 100, sy = by + 1 + (phash(i, 2, 66) - 0.5) * 8;
      const h = (2 + phash(i, 3, 66) * 5) * clamp01((dis - 0.6) / 0.4);
      for (let j = 0; j < h; j++) px(ctx, sx + (i % 2 ? j * 0.3 : -j * 0.3), sy - j, j === Math.floor(h) - 1 ? '#ffffff' : ICE[3]);
    }
    // 碎掉的冰屑往上飘散
    if (t > CG_T.vanish) for (let i = 0; i < 46; i++) {
      const ph = (t - CG_T.vanish - phash(i, 1, 61) * 1.0) / 1.4;
      if (ph <= 0 || ph >= 1) continue;
      const x = bx + (phash(i, 2, 61) - 0.5) * 120 + Math.sin(ph * 6 + i) * 3;
      const y = by - phash(i, 3, 61) * 130 - ph * ph * 40;
      const a = 1 - ph;
      px(ctx, x, y, i % 3 ? `rgba(200,240,255,${a.toFixed(2)})` : `rgba(255,255,255,${a.toFixed(2)})`, ph < 0.4 ? 2 : 1, ph < 0.4 ? 2 : 1);
    }
  }
  // 风雪：有远近，顺风往右飘；转头时近处的雪跟着视线反向滑
  for (let i = 0; i < 150; i++) {
    const d = phash(i, 1, 63);
    const vx = 24 + 48 * d, vy = 18 + 70 * d;
    const x = (((phash(i, 2, 63) * CG_W + t * vx - pan * (0.25 + 0.75 * d)) % CG_W) + CG_W) % CG_W;
    const y = (phash(i, 3, 63) * CG_H + t * vy) % CG_H;
    if (d > 0.82) px(ctx, x, y, 'rgba(255,255,255,0.9)', 2, 2);
    else px(ctx, x, y, d < 0.4 ? 'rgba(200,225,255,0.55)' : '#ffffff');
  }
  // 转身时画面边缘带一点拖影感：两侧压暗
  const spin = Math.sin(Math.PI * clamp01((t - CG_T.turn) / (CG_T.turnEnd - CG_T.turn)));
  if (spin > 0.01) {
    const g = ctx.createLinearGradient(0, 0, CG_W, 0);
    g.addColorStop(0, `rgba(0,0,10,${(0.5 * spin).toFixed(2)})`);
    g.addColorStop(0.35, 'rgba(0,0,10,0)');
    g.addColorStop(0.65, 'rgba(0,0,10,0)');
    g.addColorStop(1, `rgba(0,0,10,${(0.5 * spin).toFixed(2)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
  // 冷得呼出的白气：每 3 秒一口，从画面下方中间冒上来散开
  {
    const ph = (tt + 1.2) % 3 / 1.6;
    if (ph < 1) for (let i = 0; i < 22; i++) {
      const a = (1 - ph) * 0.45 * (0.5 + phash(i, 1, 67) * 0.5);
      const x = CG_W / 2 + (phash(i, 2, 67) - 0.5) * (10 + ph * 50) + Math.sin(ph * 5 + i) * 2;
      const y = CG_H - 4 - ph * (30 + phash(i, 3, 67) * 30);
      px(ctx, x, y, `rgba(235,245,255,${a.toFixed(2)})`, 2, 2);
    }
  }
  // 从白光里淡入
  const fi = clamp01(tt / 0.7);
  if (fi < 1) {
    ctx.fillStyle = `rgba(240,252,255,${(1 - ease(fi)).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
  const fo = clamp01((t - CG_T.fadeOut) / (CG_T.end - CG_T.fadeOut));
  if (fo > 0) {
    ctx.fillStyle = `rgba(0,0,0,${ease(fo).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
}

/** 开播前把三幕的背景先画好，播的时候不卡一下 */
export function warmRealmIntro(o: CgOpts = {}) {
  const { ctx } = canvas(CG_W, CG_H);
  for (const t of [0.1, CG_T.tunnel + 0.1, CG_T.realm + 0.1]) drawRealmIntroFrame(ctx, t, o);
}
/** 画 CG 在 t 秒时的一帧（画布是 CG_W×CG_H） */
export function drawRealmIntroFrame(ctx: CanvasRenderingContext2D, t: number, _o: CgOpts = {}) {
  ctx.imageSmoothingEnabled = false;
  if (t < CG_T.tunnel) scenePortal(ctx, t);
  else if (t < CG_T.realm) sceneTunnel(ctx, t);
  else sceneRealm(ctx, Math.min(t, CG_LEN));
}
/** 标题这一刻该显示多少（0-1） */
export function realmIntroTitleAlpha(t: number) {
  return Math.min(ease((t - CG_T.title) / 0.8), 1 - ease((t - CG_T.fadeOut + 0.2) / 0.6));
}
