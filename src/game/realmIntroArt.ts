import { OUTFITS } from './hero';
import { canvas, glowAt, hero, whole } from './dungeonPoster';
import { phash } from './pix';
import { ICE, ROCK, SNOW, aurora, blizzard, frostMon, glacier, lord, moon, mountains, px, rift, sky, snowField } from './winterPoster';

/*
 * 永冬冰原入场 CG（用户 11-01：点传送门踏入新地图时播一段 CG）。全部代码逐像素画，320×180 一帧，按时间 t（秒）画：
 *   0.0-3.2  雪夜里的永冬传送门：冰拱门里转着青白的漩涡，雪被吸进门里；主角从左边走过去，走进门里被光吞没，白光一闪
 *   3.2-5.4  冰隙穿越：漆黑里向四周飞散的光线和冰晶碎片，主角的身影在正中往前冲，再一道白光
 *   5.4-10   永冬冰原全景：极光冷月、冰川墙正中一道通天的永冬裂隙、远处山顶的雪堡、永冬领主站在裂隙前、霜狼；镜头慢慢往右摇，
 *            主角背对镜头站在雪坡上；中段浮出标题「永冬冰原」，最后压黑
 */
export const CG_W = 320;
export const CG_H = 180;
export const CG_LEN = 10;
/** 各段的起止秒 */
export const CG_T = { portal: 0, flash1: 3.0, tunnel: 3.2, flash2: 5.2, realm: 5.4, title: 6.6, fadeOut: 9.3, end: CG_LEN };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

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
const outfitIndex = (id?: string) => Math.max(0, OUTFITS.findIndex((o) => o.id === id));

// ---------------- 第一幕：雪夜里的传送门 ----------------

/** 第一幕的背景：夜空极光、远山、雪地，右边一座冰拱门（门洞留空，漩涡每帧另画） */
function portalBg() {
  return cached('cg-portal-bg', CG_W, CG_H, (ctx) => {
    const HY = 118;
    sky(ctx, CG_W, HY + 8, 31);
    aurora(ctx, CG_W, 52, 30, 2.1, 2);
    moon(ctx, 52, 28, 6);
    mountains(ctx, CG_W, HY, (x) => HY - 18 - Math.abs(Math.sin(x * 0.03 + 2)) * 24 - Math.sin(x * 0.1) * 3, ROCK, 5, 33);
    mountains(ctx, CG_W, HY + 4, (x) => HY - 2 - Math.abs(Math.sin(x * 0.06 + 1)) * 10 - Math.sin(x * 0.2) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 34);
    snowField(ctx, CG_W, CG_H, HY + 4, 35);
    // 几棵被雪压着的枯树
    for (const [tx, th] of [[30, 26], [70, 20], [300, 24]]) {
      for (let y = 0; y < th; y++) px(ctx, tx, HY + 30 - y, y < 2 ? ROCK[1] : ROCK[0]);
      for (let b = 0; b < 4; b++) {
        const by = HY + 30 - th * 0.35 - b * 5;
        for (let i = 1; i <= 5 - b; i++) { px(ctx, tx - i, by + i * 0.4, ROCK[0]); px(ctx, tx + i, by - i * 0.3 + 1, ROCK[0]); px(ctx, tx - i, by + i * 0.4 - 1, SNOW[3]); }
      }
    }
    portalArch(ctx, PORTAL_X, PORTAL_Y);
  });
}
const PORTAL_X = 232;
const PORTAL_Y = 158;
const ARCH_W = 30;
const ARCH_H = 72;
/** 冰拱门：两根冰柱和一道拱顶，柱脚堆着雪，门楣上三根冰棱 */
function portalArch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  glowAt(ctx, x, y - 20, 64, 'rgba(90,200,255,0.28)');
  for (const sg of [-1, 1]) {
    const px0 = x + sg * ARCH_W;
    glacier(ctx, px0 - 5, px0 + 6, y, () => ARCH_H - 12, 41 + sg);
  }
  // 拱顶
  for (let dx = -ARCH_W - 3; dx <= ARCH_W + 3; dx++) {
    const k = dx / (ARCH_W + 3);
    const top = y - ARCH_H + 4 - Math.sqrt(Math.max(0, 1 - k * k)) * 14;
    for (let d = 0; d < 7; d++) px(ctx, x + dx, top + d, d === 0 ? ICE[4] : d < 2 ? ICE[3] : d < 4 ? ICE[2] : ICE[1]);
  }
  for (const [dx, h] of [[-12, 6], [0, 10], [12, 6], [-22, 4], [22, 4]]) for (let j = 0; j < h; j++) px(ctx, x + dx, y - ARCH_H - 10 + j, j === h - 1 ? '#ffffff' : ICE[3]);
  // 柱脚的雪
  for (const sg of [-1, 1]) for (let dx = -8; dx <= 8; dx++) px(ctx, x + sg * ARCH_W + dx, y - 1 + (Math.abs(dx) > 5 ? 1 : 0), SNOW[4]);
}
/** 门洞里的漩涡：一圈圈往里转的青白光带，中心一团白光，门口漏出的光洒在雪地上 */
function portalVortex(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, power: number) {
  const cy = y - ARCH_H * 0.5 - 2;
  const rx = ARCH_W - 6, ry = ARCH_H * 0.5 - 3;
  // 门洞底色
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const d = (dx / rx) ** 2 + (dy / ry) ** 2;
    if (d > 1) continue;
    px(ctx, x + dx, cy + dy, d > 0.8 ? '#0a1a34' : '#06102a');
  }
  // 旋臂
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < 70; i++) {
      const s = i / 70;
      const a = s * Math.PI * 3.2 + (arm * Math.PI) / 2 - t * 3.2;
      const r = 0.1 + s * 0.9;
      const dx = Math.cos(a) * rx * r, dy = Math.sin(a) * ry * r;
      const col = s < 0.25 ? '#ffffff' : s < 0.55 ? ICE[4] : s < 0.8 ? ICE[2] : 'rgba(120,120,255,0.8)';
      px(ctx, x + dx, cy + dy, col);
      if (s < 0.5 && i % 3 === 0) px(ctx, x + dx + 1, cy + dy, ICE[3]);
    }
  }
  // 中心白光，越来越强
  glowAt(ctx, x, cy, 8 + power * 12, `rgba(230,250,255,${(0.6 + power * 0.4).toFixed(2)})`);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy * 2 <= 9) px(ctx, x + dx, cy + dy, '#ffffff');
  // 门口漏到雪地上的光和飘出来的碎光
  glowAt(ctx, x, y + 2, 34 + power * 20, `rgba(90,220,255,${(0.25 + power * 0.25).toFixed(2)})`);
  for (let k = 0; k < 10; k++) {
    const ph = (t * 0.6 + phash(k, 1, 51)) % 1;
    const ang = phash(k, 2, 51) * Math.PI * 2;
    const r = 6 + ph * 40;
    px(ctx, x + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.7, ph < 0.4 ? ICE[4] : ICE[2]);
  }
}
/** 被吸进门里的雪：从四面八方向门洞汇聚的小点，越近越亮 */
function suckedSnow(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, n: number) {
  const cy = y - ARCH_H * 0.5 - 2;
  for (let k = 0; k < n; k++) {
    const ph = 1 - ((t * 0.5 + phash(k, 3, 52)) % 1);
    const ang = phash(k, 4, 52) * Math.PI * 2;
    const r = 8 + ph * 150;
    const sx = x + Math.cos(ang) * r, sy = cy + Math.sin(ang) * r * 0.55;
    if (sx < 0 || sx >= CG_W || sy < 0 || sy >= CG_H) continue;
    px(ctx, sx, sy, ph < 0.3 ? '#ffffff' : ph < 0.6 ? ICE[3] : 'rgba(200,230,255,0.6)');
    if (ph < 0.5) px(ctx, sx - Math.cos(ang) * 1.5, sy - Math.sin(ang) * 0.8, ICE[2]);
  }
}

function scenePortal(ctx: CanvasRenderingContext2D, t: number, o: CgOpts) {
  ctx.drawImage(portalBg(), 0, 0);
  const walkEnd = 2.4;
  const k = clamp01(t / walkEnd);
  const inDoor = clamp01((t - walkEnd) / 0.6);
  const power = clamp01((t - 1.2) / 1.8);
  portalVortex(ctx, PORTAL_X, PORTAL_Y, t, power);
  suckedSnow(ctx, PORTAL_X, PORTAL_Y, t, 40 + Math.round(power * 60));
  // 主角从左边走到门口，走进去时越缩越小、被光染白
  const hx = lerp(40, PORTAL_X - 6, ease(k) * 0.3 + k * 0.7);
  const frame = Math.floor(t * 12) % 16;
  const scale = lerp(2, 0.35, ease(inDoor));
  const oi = outfitIndex(o.outfit);
  if (inDoor < 1) {
    const { c, ctx: h } = canvas(96, 96);
    hero(h, oi, inDoor > 0 ? 'walk-up' : 'walk-side', frame, 48, 94, 1, false);
    if (inDoor > 0) {
      h.globalCompositeOperation = 'source-atop';
      h.fillStyle = `rgba(230,250,255,${(inDoor * 0.9).toFixed(2)})`;
      h.fillRect(0, 0, 96, 96);
    }
    const y = inDoor > 0 ? lerp(PORTAL_Y + 2, PORTAL_Y - ARCH_H * 0.5 + 10, ease(inDoor)) : PORTAL_Y + 2;
    whole(ctx, c, hx - 48 * scale, y - 94 * scale, scale);
    // 脚下的影子
    if (inDoor === 0) for (let dx = -6; dx <= 6; dx++) px(ctx, hx + dx, PORTAL_Y + 2, 'rgba(20,40,80,0.35)');
  }
  blizzard(ctx, CG_W, CG_H, 120, 60 + Math.floor(t * 10));
  // 白光一闪
  const fl = clamp01((t - CG_T.flash1) / (CG_T.tunnel - CG_T.flash1));
  if (fl > 0) {
    ctx.fillStyle = `rgba(240,252,255,${ease(fl).toFixed(2)})`;
    ctx.fillRect(0, 0, CG_W, CG_H);
  }
}

// ---------------- 第二幕：冰隙穿越 ----------------

/** 旋转的冰晶碎片：一个菱形，按角度 a 转 */
function shard(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let v = -s; v <= s; v += 0.5) for (let u = -s * 0.5; u <= s * 0.5; u += 0.5) {
    if (Math.abs(u) / (s * 0.5) + Math.abs(v) / s > 1) continue;
    const col = u < -s * 0.15 ? '#ffffff' : u < s * 0.1 ? ICE[4] : ICE[2];
    px(ctx, x + u * ca - v * sa, y + u * sa + v * ca, col);
  }
}
function sceneTunnel(ctx: CanvasRenderingContext2D, t: number, o: CgOpts) {
  const tt = t - CG_T.tunnel;
  const cx = CG_W / 2, cy = CG_H / 2 + 6;
  ctx.fillStyle = '#030616';
  ctx.fillRect(0, 0, CG_W, CG_H);
  glowAt(ctx, cx, cy, 90, 'rgba(40,80,160,0.5)');
  // 向外飞的光线：越外越长越亮
  for (let k = 0; k < 90; k++) {
    const ang = phash(k, 1, 71) * Math.PI * 2;
    const speed = 0.6 + phash(k, 2, 71) * 1.2;
    const ph = (tt * speed + phash(k, 3, 71)) % 1;
    const r0 = ph * ph * 190;
    const len = 4 + ph * 26;
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
  for (let k = 0; k < 16; k++) {
    const ang = phash(k, 4, 72) * Math.PI * 2;
    const ph = (tt * (0.5 + phash(k, 5, 72) * 0.7) + phash(k, 6, 72)) % 1;
    const r = 10 + ph * ph * 180;
    shard(ctx, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.8, 2 + ph * 7, tt * 4 + k);
  }
  // 主角在正中往前冲（背影），身子随着气流轻轻晃
  const oi = outfitIndex(o.outfit);
  const bob = Math.sin(tt * 9) * 2;
  const { c, ctx: h } = canvas(96, 96);
  hero(h, oi, 'walk-up', Math.floor(tt * 14) % 16, 48, 94, 1, false);
  h.globalCompositeOperation = 'source-atop';
  h.fillStyle = 'rgba(120,180,255,0.35)';
  h.fillRect(0, 0, 96, 96);
  glowAt(ctx, cx, cy - 20, 40, 'rgba(160,220,255,0.35)');
  whole(ctx, c, cx - 48 * 2.5 + Math.sin(tt * 5) * 2, cy + 50 - 94 * 2.5 + bob, 2.5);
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

// ---------------- 第三幕：永冬冰原 ----------------

const REALM_W = 480;
/** 山顶的雪堡：石基、城墙、三座尖顶塔，窗里透青光，檐上积雪 */
function castle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const W = 46;
  // 山丘
  for (let dx = -40; dx <= 40; dx++) {
    const h = Math.sqrt(Math.max(0, 1 - (dx / 40) ** 2)) * 14;
    for (let d = 0; d < h; d++) px(ctx, x + dx, y - d, d > h - 2 ? SNOW[4] : dx < 0 ? ROCK[2] : ROCK[1]);
  }
  const base = y - 12;
  // 城墙
  for (let dx = -W / 2; dx <= W / 2; dx++) for (let d = 0; d < 12; d++) px(ctx, x + dx, base - d, d === 11 && (dx & 2) ? ROCK[3] : phash(dx + 50, d, 81) < 0.08 ? ROCK[3] : dx < -8 ? ROCK[2] : ROCK[1]);
  for (let dx = -W / 2; dx <= W / 2; dx += 3) px(ctx, x + dx, base - 12, SNOW[4], 2, 1);
  // 塔
  for (const [tx, th, tw] of [[-16, 28, 7], [0, 40, 9], [16, 30, 7]] as [number, number, number][]) {
    for (let d = 0; d < th; d++) for (let dx = -tw / 2; dx <= tw / 2; dx++) px(ctx, x + tx + dx, base - d, dx < -tw / 4 ? ROCK[3] : dx < tw / 4 ? ROCK[2] : ROCK[1]);
    // 尖顶（冰）
    for (let d = 0; d < tw + 6; d++) {
      const half = (tw / 2 + 1) * (1 - d / (tw + 6));
      for (let dx = -half; dx <= half; dx++) px(ctx, x + tx + dx, base - th - d, dx < -half * 0.3 ? ICE[4] : dx < half * 0.3 ? ICE[3] : ICE[1]);
    }
    px(ctx, x + tx, base - th - tw - 7, '#ffffff');
    // 窗
    for (let w = 0; w < Math.floor(th / 9); w++) { px(ctx, x + tx, base - 5 - w * 9, '#7ae8ff', 1, 2); px(ctx, x + tx - 1, base - 5 - w * 9, 'rgba(120,230,255,0.4)', 3, 2); }
  }
  glowAt(ctx, x, base - 18, 36, 'rgba(90,200,255,0.18)');
}
/** 第三幕的背景（比画面宽，镜头从左摇到右） */
function realmBg() {
  return cached('cg-realm-bg', REALM_W, CG_H, (ctx) => {
    const HY = 112;
    sky(ctx, REALM_W, HY + 10, 91);
    aurora(ctx, REALM_W, 48, 40, 0.7, 3);
    moon(ctx, 410, 26, 8);
    mountains(ctx, REALM_W, HY, (x) => HY - 26 - Math.abs(Math.sin(x * 0.022 + 1)) * 30 - Math.sin(x * 0.08) * 4, ROCK, 7, 93);
    castle(ctx, 118, HY - 2);
    mountains(ctx, REALM_W, HY + 5, (x) => HY - 4 - Math.abs(Math.sin(x * 0.045 + 3)) * 14 - Math.sin(x * 0.19) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 94);
    // 冰川墙贯穿右半边，正中裂隙直通天上
    glacier(ctx, 230, 430, HY + 8, (x) => 44 - Math.abs(x - 330) * 0.32, 95);
    rift(ctx, 330, 8, HY + 8, 9, 97);
    // 裂隙上方冲到天上的光柱
    for (let y = 0; y < 40; y++) {
      const a = (1 - y / 40) * 0.35;
      ctx.fillStyle = `rgba(140,240,255,${a.toFixed(2)})`;
      ctx.fillRect(322 + Math.sin(y * 0.3) * 1.5, y, 16, 1);
    }
    snowField(ctx, REALM_W, CG_H, HY + 8, 96);
    glowAt(ctx, 330, HY + 16, 80, 'rgba(90,230,255,0.35)');
    // 冰原上散落的冰晶和冻住的枯树
    for (let k = 0; k < 9; k++) {
      const x = 20 + phash(k, 1, 98) * 440, y = HY + 20 + phash(k, 2, 98) * 40;
      const h = 4 + phash(k, 3, 98) * 6;
      for (let j = 0; j < h; j++) { px(ctx, x, y - j, j === h - 1 ? '#ffffff' : ICE[3]); px(ctx, x + 1, y - j * 0.8, ICE[2]); }
    }
    // 永冬领主站在裂隙前，两只霜狼
    lord(ctx, 352, HY + 44, 2);
    frostMon(ctx, 'frost_wolf', 290, HY + 50, 1.5, false, 'rgba(110,210,255,0.35)', 0.12);
    frostMon(ctx, 'frost_wolf', 410, HY + 56, 1.5, true, 'rgba(110,210,255,0.35)', 0.12);
    frostMon(ctx, 'frost_wraith', 250, HY - 20, 1.5, true, 'rgba(150,230,255,0.45)', 0.1);
  });
}
function sceneRealm(ctx: CanvasRenderingContext2D, t: number, o: CgOpts) {
  const tt = t - CG_T.realm;
  const pan = ease(clamp01(tt / 4.2)) * (REALM_W - CG_W);
  ctx.drawImage(realmBg(), -Math.round(pan), 0);
  // 裂隙的光一呼一吸
  glowAt(ctx, 330 - pan, 60, 40 + Math.sin(tt * 2) * 8, 'rgba(120,240,255,0.18)');
  // 主角背对镜头站在近处的雪坡上（跟着镜头）
  const oi = outfitIndex(o.outfit);
  for (let dx = -30; dx <= 30; dx++) {
    const h = Math.sqrt(Math.max(0, 1 - (dx / 30) ** 2)) * 7;
    for (let d = 0; d < h; d++) px(ctx, 54 + dx, CG_H - d, d > h - 1.5 ? SNOW[4] : SNOW[2]);
  }
  hero(ctx, oi, 'idle-up', Math.floor(tt * 10) % 120, 54, CG_H - 6, 2, false);
  blizzard(ctx, CG_W, CG_H, 160, 200 + Math.floor(t * 10));
  // 从白光里淡入
  const fi = clamp01((tt) / 0.7);
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

/** 开播前把三幕的背景和主角精灵表先画好，播的时候不卡一下 */
export function warmRealmIntro(o: CgOpts = {}) {
  const { ctx } = canvas(CG_W, CG_H);
  for (const t of [0.1, CG_T.tunnel + 0.1, CG_T.realm + 0.1]) drawRealmIntroFrame(ctx, t, o);
}
/** 画 CG 在 t 秒时的一帧（画布是 CG_W×CG_H） */
export function drawRealmIntroFrame(ctx: CanvasRenderingContext2D, t: number, o: CgOpts = {}) {
  ctx.imageSmoothingEnabled = false;
  if (t < CG_T.tunnel) scenePortal(ctx, t, o);
  else if (t < CG_T.realm) sceneTunnel(ctx, t, o);
  else sceneRealm(ctx, Math.min(t, CG_LEN), o);
}
/** 标题这一刻该显示多少（0-1） */
export function realmIntroTitleAlpha(t: number) {
  return Math.min(ease((t - CG_T.title) / 0.8), 1 - ease((t - CG_T.fadeOut + 0.2) / 0.6));
}
