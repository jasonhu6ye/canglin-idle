import { canvas, glowAt } from './dungeonPoster';
import { phash } from './pix';
import { ICE, ROCK, SNOW, aurora, frostMon, glacier, lord, moon, mountains, px, rift, sky, snowField } from './winterPoster';
import { WPORTAL_EYE, WPORTAL_FOOT, WPORTAL_H, WPORTAL_RX, WPORTAL_RY, WPORTAL_W, drawWinterPortal } from './winterPortalArt';

/*
 * 永冬冰原入场 CG（用户 11-01：点传送门踏入新地图时播一段 CG；第一人称，画面里不出现人物）。
 * 全部代码逐像素画，320×180 一帧，按时间 t（秒）实时画，60fps：
 *   0.0-3.2  第一人称走向雪夜里的永冬传送门：地上的雪脊、冰晶、枯树迎面滑过，视线随脚步轻微起伏，
 *            冰拱门越走越大，门洞里的漩涡把雪吸进去，最后漩涡填满整个视野，白光一闪
 *   3.2-5.4  穿过空间隧道：漆黑里向四周飞散的光线、冷光环和冰晶碎片迎面扑来，再一道白光
 *   5.4-11.6 眼前一片永冬冰原：极光冷月、冰川墙正中一道通天的裂隙、山顶雪堡、永冬领主与霜狼；
 *            看了两秒后猛地回头——身后只有自己来时的脚印和一道正在碎成冰屑的门影，传送门消失了；
 *            这时浮出标题「永冬冰原」，最后压黑
 */
export const CG_W = 320;
export const CG_H = 180;
export const CG_LEN = 11.6;
/** 各段的起止秒 */
export const CG_T = { portal: 0, flash1: 3.0, tunnel: 3.2, flash2: 5.2, realm: 5.4, turn: 7.3, turnEnd: 8.4, vanish: 8.3, title: 8.9, fadeOut: 11.0, end: CG_LEN };

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

// ---------------- 第一幕：第一人称走向传送门 ----------------

const HY1 = 100;
const SKY_PAD = 90;
/** 当前这帧的地平线（抬头时往下移） */
let hy = HY1;
/** 第一幕的天空：极光、冷月、远山（相机前进时远景几乎不动） */
function fpSky() {
  // 比画面高 SKY_PAD：走近时镜头会抬头，天空要有余量
  const H = HY1 + 12 + SKY_PAD, B = HY1 + SKY_PAD;
  return cached('cg-fp-sky', CG_W, H, (ctx) => {
    sky(ctx, CG_W, H, 31);
    aurora(ctx, CG_W, 44 + SKY_PAD, 30, 2.1, 2);
    moon(ctx, 52, 28 + SKY_PAD, 6);
    mountains(ctx, CG_W, B + 2, (x) => B - 18 - Math.abs(Math.sin(x * 0.03 + 2)) * 24 - Math.sin(x * 0.1) * 3, ROCK, 5, 33);
    mountains(ctx, CG_W, B + 6, (x) => B - 2 - Math.abs(Math.sin(x * 0.06 + 1)) * 10 - Math.sin(x * 0.2) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 34);
  });
}
/** 第一幕的雪地底色：远处暗蓝、近处亮，带一点杂点（会动的雪脊和冰晶另画） */
function fpGround() {
  return cached('cg-fp-ground', CG_W, CG_H - HY1 + 12, (ctx) => {
    const h = CG_H - HY1 + 12;
    for (let y = 0; y < h; y++) for (let x = 0; x < CG_W; x++) {
      const t = y / h;
      const v = 0.6 + t * 2.6 + (phash(x, y, 36) - 0.5) * 0.7;
      px(ctx, x, y, SNOW[Math.max(0, Math.min(4, Math.round(v)))]);
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

/** 路两旁的东西：固定的世界坐标，相机往前走它们就迎面滑过来 */
const SIDE: { x: number; z: number; kind: 'tree' | 'ice'; salt: number }[] = [];
for (let k = 0; k < 18; k++) {
  const side = k % 2 ? 1 : -1;
  SIDE.push({ x: side * (2.6 + phash(k, 1, 44) * 4.5), z: 1.5 + k * 1.05 + phash(k, 2, 44) * 0.8, kind: phash(k, 3, 44) < 0.45 ? 'tree' : 'ice', salt: k });
}
const DOTS = 220;
const RIDGES = 7;
const WORLD_DEPTH = 30;
const FLAKES = 130;

function scenePortal(ctx: CanvasRenderingContext2D, t: number) {
  const k = clamp01(t / CG_T.flash1);
  // 相机前进：起步稍慢，最后被门吸着加速
  const camZ = 15.6 * (0.7 * k + 0.3 * k * k * k);
  const portalZ = 16.8 - camZ;
  const power = clamp01((t - 1.0) / 2.0);
  // 脚步带来的起伏和左右轻晃
  const bob = Math.sin(t * Math.PI * 2 * 1.75) * 1.3 * (1 - k * 0.5);
  const sway = Math.sin(t * Math.PI * 2 * 0.875) * 1.2;
  // 越走近越抬头看这座巨门
  const pitch = ease(clamp01((t - 0.6) / 2.4)) * 80;
  hy = HY1 + pitch;
  ctx.save();
  ctx.translate(Math.round(sway), Math.round(bob));
  ctx.drawImage(fpSky(), 0, Math.round(pitch) - 6 - SKY_PAD);
  ctx.drawImage(fpGround(), 0, Math.round(hy) - 6);
  // 雪脊：一条条横着的雪堆脊线，迎面滑过
  for (let r = 0; r < RIDGES; r++) {
    const z0 = (r / RIDGES) * WORLD_DEPTH;
    const z = ((z0 - camZ) % WORLD_DEPTH + WORLD_DEPTH) % WORLD_DEPTH + 0.6;
    const p = proj(0, 0, z);
    if (p.y > CG_H + 8) continue;
    const amp = Math.min(4, 2.2 * (F / z) / 20);
    for (let x = -4; x < CG_W + 4; x++) {
      const xw = ((x - CG_W / 2) * z) / F;
      const y = p.y + Math.sin(xw * 0.9 + r * 2.1) * amp;
      px(ctx, x, y, SNOW[4]);
      px(ctx, x, y + 1, SNOW[1]);
      if (z < 4) px(ctx, x, y + 2, SNOW[2]);
    }
  }
  // 雪地上的碎亮点和凹影
  for (let i = 0; i < DOTS; i++) {
    const xw = (phash(i, 1, 45) - 0.5) * 24;
    const z0 = phash(i, 2, 45) * WORLD_DEPTH;
    const z = ((z0 - camZ) % WORLD_DEPTH + WORLD_DEPTH) % WORLD_DEPTH + 0.4;
    const p = proj(xw, 0, z);
    if (p.x < -2 || p.x > CG_W + 2 || p.y > CG_H + 8) continue;
    const kind = phash(i, 3, 45);
    const sz = z < 2.5 ? 2 : 1;
    px(ctx, p.x, p.y, kind < 0.35 ? SNOW[1] : kind < 0.7 ? SNOW[4] : '#ffffff', sz, sz);
  }
  // 路两旁和门：按远近先画远的
  const drawSide = (far: boolean) => {
    for (const o of SIDE) {
      const z = o.z - camZ;
      if (z < 0.35 || (far ? z <= portalZ : z > portalZ)) continue;
      const p = proj(o.x, 0, z);
      if (p.x < -60 || p.x > CG_W + 60) continue;
      const s = p.s / NATIVE;
      if (o.kind === 'tree') deadTree(ctx, p.x, p.y, s, o.salt);
      else iceCluster(ctx, p.x, p.y, s, o.salt);
    }
  };
  drawSide(true);
  // 传送门
  {
    const p = proj(0, 0, Math.max(0.5, portalZ));
    const s = p.s / NATIVE;
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
  // 迎面飘来的雪花（有远近，顺风往右飘）
  for (let i = 0; i < FLAKES; i++) {
    const xw = ((phash(i, 1, 46) * 16 + t * 0.9) % 16) - 8;
    const yw = ((phash(i, 2, 46) * 4.2 - t * 1.1) % 4.2 + 4.2) % 4.2;
    const z0 = phash(i, 3, 46) * 18;
    const z = ((z0 - camZ * 0.9) % 18 + 18) % 18 + 0.3;
    const p = proj(xw, yw, z);
    if (p.x < 0 || p.x >= CG_W || p.y < 0 || p.y >= CG_H) continue;
    if (z < 1.6) px(ctx, p.x, p.y, 'rgba(255,255,255,0.9)', 2, 2);
    else px(ctx, p.x, p.y, z < 6 ? '#ffffff' : 'rgba(200,225,255,0.55)');
  }
  ctx.restore();
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
  const cx = CG_W / 2 + Math.sin(tt * 3) * 3, cy = CG_H / 2 + Math.cos(tt * 2.3) * 2;
  ctx.fillStyle = '#030616';
  ctx.fillRect(0, 0, CG_W, CG_H);
  glowAt(ctx, cx, cy, 90, 'rgba(40,80,160,0.5)');
  glowAt(ctx, cx, cy, 26, 'rgba(160,220,255,0.35)');
  // 向外飞的光线：越外越长越亮（迎面扑来）
  for (let k = 0; k < 100; k++) {
    const ang = phash(k, 1, 71) * Math.PI * 2;
    const speed = 0.7 + phash(k, 2, 71) * 1.3;
    const ph = (tt * speed + phash(k, 3, 71)) % 1;
    const r0 = ph * ph * 190;
    const len = 4 + ph * 30;
    const col = ph < 0.3 ? 'rgba(120,160,255,0.5)' : ph < 0.7 ? ICE[2] : k % 3 ? ICE[4] : '#ffffff';
    for (let d = 0; d < len; d += 1) px(ctx, cx + Math.cos(ang) * (r0 + d), cy + Math.sin(ang) * (r0 + d) * 0.8, col);
  }
  // 一圈圈往外扩的冷光环
  for (let k = 0; k < 3; k++) {
    const ph = (tt * 0.9 + k / 3) % 1;
    const r = ph * 170;
    for (let i = 0; i < 120; i++) {
      const ang = (i / 120) * Math.PI * 2;
      px(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, ph < 0.5 ? `rgba(160,220,255,${(0.9 - ph).toFixed(2)})` : `rgba(140,120,255,${(0.9 - ph).toFixed(2)})`);
    }
  }
  // 飞过去的冰晶碎片
  for (let k = 0; k < 18; k++) {
    const ang = phash(k, 4, 72) * Math.PI * 2;
    const ph = (tt * (0.5 + phash(k, 5, 72) * 0.7) + phash(k, 6, 72)) % 1;
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
/** 山顶的雪堡：石基、城墙、三座尖顶塔，窗里透青光，檐上积雪 */
function castle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const W = 46;
  for (let dx = -40; dx <= 40; dx++) {
    const h = Math.sqrt(Math.max(0, 1 - (dx / 40) ** 2)) * 14;
    for (let d = 0; d < h; d++) px(ctx, x + dx, y - d, d > h - 2 ? SNOW[4] : dx < 0 ? ROCK[2] : ROCK[1]);
  }
  const base = y - 12;
  for (let dx = -W / 2; dx <= W / 2; dx++) for (let d = 0; d < 12; d++) px(ctx, x + dx, base - d, d === 11 && (dx & 2) ? ROCK[3] : phash(dx + 50, d, 81) < 0.08 ? ROCK[3] : dx < -8 ? ROCK[2] : ROCK[1]);
  for (let dx = -W / 2; dx <= W / 2; dx += 3) px(ctx, x + dx, base - 12, SNOW[4], 2, 1);
  for (const [tx, th, tw] of [[-16, 28, 7], [0, 40, 9], [16, 30, 7]] as [number, number, number][]) {
    for (let d = 0; d < th; d++) for (let dx = -tw / 2; dx <= tw / 2; dx++) px(ctx, x + tx + dx, base - d, dx < -tw / 4 ? ROCK[3] : dx < tw / 4 ? ROCK[2] : ROCK[1]);
    for (let d = 0; d < tw + 6; d++) {
      const half = (tw / 2 + 1) * (1 - d / (tw + 6));
      for (let dx = -half; dx <= half; dx++) px(ctx, x + tx + dx, base - th - d, dx < -half * 0.3 ? ICE[4] : dx < half * 0.3 ? ICE[3] : ICE[1]);
    }
    px(ctx, x + tx, base - th - tw - 7, '#ffffff');
    for (let w = 0; w < Math.floor(th / 9); w++) { px(ctx, x + tx, base - 5 - w * 9, '#7ae8ff', 1, 2); px(ctx, x + tx - 1, base - 5 - w * 9, 'rgba(120,230,255,0.4)', 3, 2); }
  }
  glowAt(ctx, x, base - 18, 36, 'rgba(90,200,255,0.18)');
}
/** 第三幕的全景图：左半是正前方的冰原（冰川、裂隙、雪堡、领主），右半是回头看到的空旷雪原 */
function realmPano() {
  return cached('cg-realm-pano', PANO_W, CG_H, (ctx) => {
    sky(ctx, PANO_W, HY3 + 10, 91);
    aurora(ctx, PANO_W, 48, 40, 0.7, 3);
    moon(ctx, 410, 26, 8);
    mountains(ctx, PANO_W, HY3, (x) => HY3 - 26 - Math.abs(Math.sin(x * 0.022 + 1)) * 30 - Math.sin(x * 0.08) * 4, ROCK, 7, 93);
    castle(ctx, 118, HY3 - 2);
    mountains(ctx, PANO_W, HY3 + 5, (x) => HY3 - 4 - Math.abs(Math.sin(x * 0.045 + 3)) * 14 - Math.sin(x * 0.19) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 94);
    // 冰川墙贯穿正前方的右半边，正中裂隙直通天上
    glacier(ctx, 230, 430, HY3 + 8, (x) => 44 - Math.abs(x - 330) * 0.32, 95);
    rift(ctx, 330, 8, HY3 + 8, 9, 97);
    for (let y = 0; y < 40; y++) {
      const a = (1 - y / 40) * 0.35;
      ctx.fillStyle = `rgba(140,240,255,${a.toFixed(2)})`;
      ctx.fillRect(322 + Math.sin(y * 0.3) * 1.5, y, 16, 1);
    }
    snowField(ctx, PANO_W, CG_H, HY3 + 8, 96);
    glowAt(ctx, 330, HY3 + 16, 80, 'rgba(90,230,255,0.35)');
    // 冰原上散落的冰晶
    for (let k = 0; k < 22; k++) {
      const x = 20 + phash(k, 1, 98) * (PANO_W - 40), y = HY3 + 20 + phash(k, 2, 98) * 40;
      if (Math.abs(x - BACK_X) < 90) continue;
      const h = 4 + phash(k, 3, 98) * 6;
      for (let j = 0; j < h; j++) { px(ctx, x, y - j, j === h - 1 ? '#ffffff' : ICE[3]); px(ctx, x + 1, y - j * 0.8, ICE[2]); }
    }
    lord(ctx, 352, HY3 + 44, 2);
    frostMon(ctx, 'frost_wolf', 290, HY3 + 50, 1.5, false, 'rgba(110,210,255,0.35)', 0.12);
    frostMon(ctx, 'frost_wolf', 410, HY3 + 56, 1.5, true, 'rgba(110,210,255,0.35)', 0.12);
    frostMon(ctx, 'frost_wraith', 250, HY3 - 20, 1.5, true, 'rgba(150,230,255,0.45)', 0.1);
    // 回头那边：几棵枯树、一簇簇冰晶、空旷的雪
    deadTree(ctx, BACK_X - 140, HY3 + 30, 1.1, 5);
    deadTree(ctx, BACK_X + 146, HY3 + 36, 1.3, 6);
    deadTree(ctx, BACK_X + 90, HY3 + 14, 0.6, 7);
    iceCluster(ctx, BACK_X - 96, HY3 + 48, 1, 8);
    iceCluster(ctx, BACK_X + 112, HY3 + 60, 1.3, 9);
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
  // 裂隙的光一呼一吸
  glowAt(ctx, 330 + ox, 60 + oy, 40 + Math.sin(tt * 2) * 8, 'rgba(120,240,255,0.18)');
  // 回头：传送门正在碎成冰屑，碎完只剩雪地上一圈霜和一点余光
  const dis = clamp01((t - CG_T.vanish) / 1.0);
  const bx = BACK_X + ox, by = BACK_Y + oy;
  if (bx > -80 && bx < CG_W + 80) {
    const glowA = 0.42 * (1 - clamp01((t - CG_T.vanish) / 1.8));
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
    // 碎掉的冰屑往上飘散
    if (t > CG_T.vanish) for (let i = 0; i < 46; i++) {
      const ph = (t - CG_T.vanish - phash(i, 1, 61) * 0.7) / 1.1;
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
