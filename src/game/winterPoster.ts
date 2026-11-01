import { MONSTERS } from '../core/data';
import type { MonsterDef } from '../core/types';
import { canvas, glowAt, hero, once, whole } from './dungeonPoster';
import { drawMonsterFrame, monsterFrameSize } from './monsterArt';
import { phash } from './pix';

/*
 * 「永冬之裔」活动预告的贴图（用户 11-01：像万圣节一样的活动，这次是地图上随机刷出活动生物；只是预告；要做得精美；全部代码画）。
 * 头图：极光和冷月下的冰川，冰墙正中裂开一道发青光的「永冬裂隙」，冰霜巨人和霜狼从裂隙里走出来，主角提剑迎上去。
 * 卡片：随机降临（雪原地图上的雪花标记）、三种永冬生物、冰晶和礼盒、限定奖励、组队讨伐。
 * 配色：深蓝夜空、青绿极光、冰蓝、带蓝影的雪地（不用纯白，怪才看得清）。
 */

export const ICE = ['#12304e', '#2a6a9a', '#5ab0e0', '#a8e0ff', '#eafaff'];
export const SNOW = ['#4a6e96', '#6e94ba', '#94b8d8', '#bcd6ec', '#e2eef8'];
export const ROCK = ['#141c30', '#1e2a44', '#2c3c5a', '#3e5272'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function px(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, w = 1, h = 1) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** 夜空：上深下浅，星星有大有小，几颗会闪成十字 */
export function sky(ctx: CanvasRenderingContext2D, w: number, h: number, salt: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#040818');
  g.addColorStop(0.55, '#0e2042');
  g.addColorStop(1, '#1e3e66');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const n = Math.round((w * h) / 140);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(phash(k, 1, salt) * w);
    const y = Math.floor(phash(k, 2, salt) * h);
    const r = phash(k, 3, salt);
    px(ctx, x, y, r < 0.6 ? 'rgba(200,220,255,0.55)' : '#ffffff');
    if (r > 0.97) { px(ctx, x - 1, y, 'rgba(200,230,255,0.6)'); px(ctx, x + 1, y, 'rgba(200,230,255,0.6)'); px(ctx, x, y - 1, 'rgba(200,230,255,0.6)'); px(ctx, x, y + 1, 'rgba(200,230,255,0.6)'); }
  }
}

/** 极光：几条竖帘一样的光带，底下亮、往上淡，颜色从青绿渐到紫 */
export function aurora(ctx: CanvasRenderingContext2D, w: number, y0: number, len: number, salt: number, bands = 2) {
  for (let b = 0; b < bands; b++) {
    const base = y0 + b * len * 0.45;
    const hue = b === 0 ? [90, 255, 190] : [130, 170, 255];
    for (let x = 0; x < w; x++) {
      const yc = base + Math.sin(x * 0.035 + salt + b * 2) * len * 0.35 + Math.sin(x * 0.11 + b) * 3;
      const bright = 0.5 + 0.5 * Math.sin(x * 0.07 + salt * 3 + b);
      const L = len * (0.6 + 0.4 * Math.sin(x * 0.05 + b * 4));
      for (let d = 0; d < L; d++) {
        const t = d / L;
        const a = (1 - t) * (1 - t) * 0.5 * bright * (b === 0 ? 1 : 0.7);
        if (a < 0.01) continue;
        const r = Math.round(lerp(hue[0], 200, t)), gg = Math.round(lerp(hue[1], 120, t)), bb = Math.round(lerp(hue[2], 255, t));
        ctx.fillStyle = `rgba(${r},${gg},${bb},${a.toFixed(3)})`;
        ctx.fillRect(x, Math.round(yc - d), 1, 1);
      }
      // 底边一条亮线
      ctx.fillStyle = `rgba(200,255,230,${(0.35 * bright).toFixed(3)})`;
      ctx.fillRect(x, Math.round(yc), 1, 1);
    }
  }
}

/** 一轮冷月，带光晕和几块月斑 */
export function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  glowAt(ctx, x, y, r * 4, 'rgba(180,220,255,0.35)');
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const spot = phash(dx + 50, dy + 50, 3) < 0.12 && d < r - 1;
    px(ctx, x + dx, y + dy, spot ? '#b8cce0' : dx + dy < -r * 0.4 ? '#ffffff' : '#e4f0fa');
  }
}

/** 一层山：ridge(x) 给出山顶高度；迎光面亮、背光面暗，山顶一层雪 */
export function mountains(ctx: CanvasRenderingContext2D, w: number, base: number, ridge: (x: number) => number, pal: string[], snowLine: number, salt: number) {
  for (let x = 0; x < w; x++) {
    const top = ridge(x);
    const slope = ridge(x + 1) - ridge(x - 1);
    for (let y = Math.floor(top); y < base; y++) {
      const depth = y - top;
      const lit = slope > 0;
      let col: string;
      if (depth < snowLine + phash(x, 0, salt) * 3) col = lit ? SNOW[4] : SNOW[2];
      else col = lit ? (phash(x, y, salt) < 0.08 ? pal[3] ?? pal[2] : pal[2]) : phash(x, y, salt + 1) < 0.06 ? pal[2] : pal[1];
      if (depth < 1) col = lit ? '#ffffff' : SNOW[3];
      px(ctx, x, y, col);
    }
  }
}

/** 雪地：近处亮、远处带蓝影，起伏的雪堆，堆背面一道阴影 */
export function snowField(ctx: CanvasRenderingContext2D, w: number, h: number, y0: number, salt: number) {
  for (let y = y0; y < h; y++) {
    const t = (y - y0) / Math.max(1, h - y0);
    for (let x = 0; x < w; x++) {
      const bump = Math.sin(x * 0.06 + salt) * 3 + Math.sin(x * 0.17 + y * 0.05) * 1.5;
      const v = t * 4 + bump * 0.25 + (phash(x, y, salt) - 0.5) * 0.6;
      const k = Math.max(0, Math.min(4, Math.round(v)));
      px(ctx, x, y, SNOW[Math.max(1, k)]);
    }
  }
  // 几条雪堆的脊线
  for (let k = 0; k < 4; k++) {
    const yy = y0 + (h - y0) * (0.2 + k * 0.22);
    for (let x = 0; x < w; x++) {
      const y = yy + Math.sin(x * 0.04 + k * 2 + salt) * 3;
      px(ctx, x, y, SNOW[4]);
      px(ctx, x, y + 1, SNOW[1]);
    }
  }
}

/** 斜着刮的风雪：短斜线 + 小点，近大远小 */
export function blizzard(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, salt: number) {
  for (let k = 0; k < n; k++) {
    const x = phash(k, 7, salt) * w;
    const y = phash(k, 8, salt) * h;
    const near = phash(k, 9, salt);
    if (near > 0.8) {
      for (let i = 0; i < 3; i++) px(ctx, x + i, y + i * 0.5, 'rgba(255,255,255,0.85)');
    } else px(ctx, x, y, near < 0.4 ? 'rgba(200,225,255,0.6)' : '#ffffff');
  }
}

/** 冰川墙：一块块竖着的冰柱拼起来，每块有亮面、暗面和裂纹 */
export function glacier(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, height: (x: number) => number, salt: number) {
  let x = x0;
  while (x < x1) {
    const bw = 5 + Math.floor(phash(x, 1, salt) * 7);
    const top = base - height(x + bw / 2) - phash(x, 2, salt) * 6;
    for (let i = 0; i < bw && x + i < x1; i++) {
      const tip = top + Math.abs(i - bw / 2) * 0.9;
      for (let y = Math.floor(tip); y < base; y++) {
        const f = i / bw;
        const col = i === 0 ? ICE[0] : f < 0.35 ? ICE[3] : f < 0.7 ? ICE[2] : ICE[1];
        px(ctx, x + i, y, (y - tip) < 1 ? ICE[4] : phash(x + i, y, salt) < 0.03 ? ICE[4] : col);
      }
    }
    x += bw;
  }
}

/** 永冬裂隙：冰墙上一道锯齿形的竖裂口，里面是青白色的光，往外溢 */
export function rift(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number, maxW: number, salt: number) {
  glowAt(ctx, cx, (top + bottom) / 2, maxW * 4, 'rgba(80,230,255,0.45)');
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = Math.sin(Math.PI * Math.min(1, t * 1.1)) * maxW * (0.7 + 0.3 * phash(y, 1, salt));
    const off = Math.sin(y * 0.35 + salt) * 2 + (phash(y >> 2, 2, salt) - 0.5) * 3;
    for (let dx = -half - 1; dx <= half + 1; dx++) {
      const a = Math.abs(dx) / Math.max(0.5, half);
      const col = a > 1 ? '#0a2a44' : a < 0.35 ? '#ffffff' : a < 0.7 ? '#bafcff' : '#3ae0ff';
      px(ctx, cx + off + dx, y, col);
    }
  }
}

/** 一只「永冬化」的怪：保留原图细节，叠一层冰蓝，脚下一块阴影，背后一团冷光；k 是放大倍数 */
export function frostMon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, k = 1, flip = false, glow = 'rgba(110,210,255,0.4)', tint = 0.15) {
  const m: MonsterDef | undefined = MONSTERS[id];
  if (!m) return;
  const S = monsterFrameSize(m);
  const { c, ctx: t } = canvas(S, S);
  t.drawImage(drawMonsterFrame(m, 'idle', 0).canvas(), 0, 0);
  t.globalCompositeOperation = 'source-atop';
  const g = t.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, `rgba(210,240,255,${tint})`);
  g.addColorStop(1, `rgba(60,130,220,${tint})`);
  t.fillStyle = g;
  t.fillRect(0, 0, S, S);
  glowAt(ctx, x, y - (S * k) / 2, S * k * 0.7, glow);
  // 脚下阴影
  for (let dx = -S * k * 0.35; dx <= S * k * 0.35; dx++) {
    const hh = Math.sqrt(Math.max(0, 1 - (dx / (S * k * 0.35)) ** 2)) * 2;
    for (let dy = -hh; dy <= hh; dy++) px(ctx, x + dx, y - 1 + dy, 'rgba(30,60,110,0.35)');
  }
  whole(ctx, c, x - (S * k) / 2, y - S * k, k, flip);
}


/**
 * 永冬领主（专门画的，不用现成怪物图）：深蓝冰甲的巨人，肩上和头上长着冰晶，白色毛皮披肩，
 * 眼睛和胸口发青光，右手拄一把冰川巨剑。原尺寸 40×52，k 倍放大。
 */
export function lordCanvas() {
  const W = 40, H = 52;
  const { c, ctx } = canvas(W, H);
  const P = (x: number, y: number, col: string) => px(ctx, x, y, col);
  const cx = 18;
  // 腿
  for (let y = 38; y < 52; y++) for (const lx of [cx - 7, cx + 2]) for (let i = 0; i < 6; i++) P(lx + i, y, y > 48 ? ROCK[0] : i === 0 ? ROCK[3] : i < 3 ? ROCK[2] : ROCK[1]);
  // 腰带
  for (let x = cx - 9; x < cx + 10; x++) { P(x, 36, ICE[2]); P(x, 37, ROCK[1]); }
  // 躯干：上宽下窄
  for (let y = 18; y < 36; y++) {
    const half = 11 - (y - 18) * 0.25;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const f = (x - (cx - half)) / (half * 2);
      P(x, y, f < 0.15 ? ROCK[3] : f < 0.55 ? ROCK[2] : ROCK[1]);
    }
  }
  // 胸甲上的冰纹和发光的核心
  for (let y = 22; y < 34; y++) P(cx, y, ICE[1]);
  for (let i = 0; i < 6; i++) { P(cx - 6 + i, 21 + i, ICE[1]); P(cx + 6 - i, 21 + i, ICE[1]); }
  P(cx - 1, 26, '#eaffff'); P(cx, 26, '#ffffff'); P(cx - 1, 27, '#7af0ff'); P(cx, 27, '#bafcff');
  // 毛皮披肩
  for (let y = 15; y < 21; y++) for (let x = cx - 13; x < cx + 13; x++) {
    const edge = y === 20 && (x + y) % 2 === 0;
    if (Math.abs(x - cx) > 13 - (20 - y) * 0.3) continue;
    P(x, y, edge ? SNOW[2] : (x - cx) < 0 ? SNOW[4] : SNOW[3]);
  }
  // 肩上的冰晶
  for (const [sx, dir] of [[cx - 12, -1], [cx + 11, 1]] as [number, number][]) for (let k = 0; k < 3; k++) for (let i = 0; i < 6 - k; i++) {
    const x = sx + dir * k * 2 + (dir < 0 ? -0 : 0);
    P(x + dir * Math.floor(i / 3), 14 - i - k, i > 3 - k ? '#ffffff' : k === 1 ? ICE[3] : ICE[2]);
  }
  // 头：头盔 + 冰冠
  for (let y = 6; y < 15; y++) for (let x = cx - 5; x < cx + 5; x++) P(x, y, x < cx - 3 ? ROCK[3] : x < cx + 2 ? ROCK[2] : ROCK[1]);
  for (let x = cx - 5; x < cx + 5; x++) P(x, 11, ROCK[0]);
  P(cx - 3, 11, '#bafcff'); P(cx - 2, 11, '#ffffff'); P(cx + 1, 11, '#ffffff'); P(cx + 2, 11, '#bafcff');
  for (let i = -5; i < 5; i++) { const h = [3, 5, 2, 4, 2, 7, 2, 4, 2, 5][i + 5]; for (let j = 0; j < h; j++) P(cx + i, 5 - j, j === h - 1 ? '#ffffff' : i < 0 ? ICE[3] : ICE[2]); }
  // 胡子（冰霜）
  for (let y = 13; y < 17; y++) for (let x = cx - 3; x < cx + 3; x++) if ((x + y) % 3) P(x, y, y === 16 ? SNOW[2] : SNOW[3]);
  // 左臂垂着、右臂拄剑
  for (let y = 19; y < 35; y++) {
    const half = 11 - Math.max(0, y - 18) * 0.25;
    const lx = Math.round(cx - half) - 4 + (y > 26 ? 1 : 0);
    const rx = Math.round(cx + half) + (y > 26 ? -1 : 0);
    for (let i = 0; i < 5; i++) { P(lx + i, y, y > 32 ? SNOW[3] : i === 0 ? ROCK[3] : i === 4 ? ROCK[1] : ROCK[2]); P(rx + i, y, y > 32 ? SNOW[3] : i === 4 ? ROCK[0] : i === 0 ? ROCK[2] : ROCK[1]); }
  }
  // 冰川巨剑：竖着拄在地上，剑尖朝下
  const sx = cx + 18;
  for (let y = 28; y < 33; y++) P(sx, y, '#3a2a1a');
  for (let x = sx - 3; x <= sx + 3; x++) P(x, 33, ICE[3]);
  for (let y = 34; y < 51; y++) {
    const half = y > 47 ? (51 - y) * 0.6 : 1.6;
    for (let x = Math.round(sx - half); x <= Math.round(sx + half); x++) P(x, y, x < sx ? '#ffffff' : x === sx ? ICE[3] : ICE[2]);
  }
  return c;
}
export function lord(ctx: CanvasRenderingContext2D, x: number, y: number, k = 2) {
  const c = lordCanvas();
  glowAt(ctx, x, y - 26 * k, 30 * k, 'rgba(120,200,255,0.45)');
  for (let dx = -14 * k; dx <= 14 * k; dx++) px(ctx, x + dx, y - 1, 'rgba(20,40,80,0.35)', 1, 2);
  whole(ctx, c, x - 20 * k, y - 52 * k, k);
  glowAt(ctx, x - 1 * k, y - 41 * k, 5 * k, 'rgba(120,255,255,0.7)');
  glowAt(ctx, x - 0.5 * k, y - 25.5 * k, 6 * k, 'rgba(120,255,255,0.6)');
}

/** 怪物眼睛发光：在给定位置点两点亮青色加一圈光 */
function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number) {
  glowAt(ctx, x + gap / 2, y, gap * 2 + 4, 'rgba(120,255,255,0.55)');
  px(ctx, x, y, '#eaffff', 2, 1);
  px(ctx, x + gap, y, '#eaffff', 2, 1);
}

/** 冰霜外观的主角 */
function frostHero(ctx: CanvasRenderingContext2D, o: number, anim: string, x: number, y: number, k = 1, flip = false, tint = 0) {
  if (!tint) return hero(ctx, o, anim, 0, x, y, k, flip);
  const { c, ctx: h } = canvas(48 * k + 16, 48 * k + 16);
  hero(h, o, anim, 0, c.width / 2, c.height - 2, k, flip);
  h.globalCompositeOperation = 'source-atop';
  h.fillStyle = `rgba(150,215,255,${tint})`;
  h.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height + 2));
}

/** 雪花标记：六个角带分叉的冰晶 */
function flake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col = ICE[4]) {
  glowAt(ctx, x, y, r * 2.6, 'rgba(140,220,255,0.6)');
  for (let a = 0; a < 6; a++) {
    const ang = (a * Math.PI) / 3 - Math.PI / 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let i = 0; i <= r; i++) px(ctx, x + dx * i, y + dy * i, col);
    // 分叉
    const bx = x + dx * r * 0.6, by = y + dy * r * 0.6;
    for (const s of [-1, 1]) {
      const a2 = ang + s * 0.9;
      px(ctx, bx + Math.cos(a2) * 1.5, by + Math.sin(a2) * 1.5, ICE[3]);
    }
  }
  px(ctx, x - 1, y - 1, '#ffffff', 3, 3);
}

/** 永冬冰晶（活动积分）：六棱冰晶，左亮右暗，中间一道高光 */
function crystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const H = 8 * s;
  for (let y = 0; y < H; y++) {
    const k = y / H;
    const half = (k < 0.3 ? k / 0.3 : k > 0.75 ? (1 - k) / 0.25 : 1) * 2.6 * s;
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
      const u = (x + 0.5 - cx) / Math.max(0.5, half);
      const col = u < -0.55 ? ICE[4] : u < -0.1 ? ICE[3] : u < 0.15 ? '#ffffff' : u < 0.6 ? ICE[2] : ICE[1];
      px(ctx, x, cy - H / 2 + y, col);
    }
  }
}

/** 霜雪礼盒：冰蓝盒子，白丝带，盒盖比盒身宽一圈，蝴蝶结 */
function giftBox(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number) {
  glowAt(ctx, bx + bw / 2, by + bh / 2, bw, 'rgba(160,210,255,0.4)');
  const lid = Math.round(bh * 0.28);
  for (let y = 0; y < bh; y++) for (let x = -1; x < bw + 1; x++) {
    const isLid = y < lid;
    if (!isLid && (x < 0 || x >= bw)) continue;
    const ribV = Math.abs(x - bw / 2 + 0.5) < 2;
    const ribH = y === lid - 2 || y === lid - 3;
    const f = (x + 1) / (bw + 2);
    let col = isLid ? (f < 0.5 ? ICE[3] : ICE[2]) : f < 0.5 ? ICE[2] : ICE[1];
    if (y === lid) col = ICE[0];
    if (ribV || (isLid && ribH)) col = f < 0.5 ? '#ffffff' : SNOW[3];
    if (!isLid && phash(x, y, 4) < 0.05) col = ICE[3];
    px(ctx, bx + x, by + y, col);
  }
  // 蝴蝶结
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const h = Math.round(Math.sin((i / 6) * Math.PI) * 4);
    for (let j = 0; j <= h; j++) px(ctx, bx + bw / 2 + s * (1 + i) - (s < 0 ? 1 : 0), by - 1 - j, j === h ? '#ffffff' : SNOW[3]);
  }
  px(ctx, bx + bw / 2 - 1, by - 3, '#ffffff', 2, 3);
}

/** 卡片通用背景：夜空、极光、远山、雪地 */
function scene(ctx: CanvasRenderingContext2D, w: number, h: number, salt: number, horizon = 0.6) {
  const hy = Math.round(h * horizon);
  sky(ctx, w, hy, salt);
  aurora(ctx, w, h * 0.32, h * 0.22, salt, 2);
  mountains(ctx, w, hy, (x) => hy - 10 - Math.abs(Math.sin(x * 0.05 + salt)) * 12 - Math.sin(x * 0.17 + salt) * 2, ROCK, 4, salt);
  snowField(ctx, w, h, hy, salt);
}

/** 头图 */
export const wtBannerUrl = () => once('wt-banner2', () => {
  const W = 320;
  const H = 140;
  const { c, ctx } = canvas(W, H);
  const HY = 88;
  sky(ctx, W, HY + 10, 3);
  aurora(ctx, W, 46, 34, 1.3, 2);
  moon(ctx, 286, 22, 7);
  // 远山两层
  mountains(ctx, W, HY, (x) => HY - 22 - Math.abs(Math.sin(x * 0.028 + 1)) * 26 - Math.sin(x * 0.09) * 4, ROCK, 6, 11);
  mountains(ctx, W, HY + 4, (x) => HY - 4 - Math.abs(Math.sin(x * 0.05 + 3)) * 12 - Math.sin(x * 0.21) * 2, [ROCK[0], ROCK[1], ROCK[3]], 3, 12);
  // 冰川墙和裂隙
  glacier(ctx, 130, 250, HY + 6, (x) => 40 - Math.abs(x - 190) * 0.4, 5);
  rift(ctx, 190, 34, HY + 6, 8, 7);
  // 裂隙里飘出来的冰碎片
  for (let k = 0; k < 14; k++) {
    const a = phash(k, 1, 9) * Math.PI * 2;
    const r = 10 + phash(k, 2, 9) * 30;
    const x = 190 + Math.cos(a) * r;
    const y = 62 + Math.sin(a) * r * 0.6;
    px(ctx, x, y, k % 3 ? ICE[3] : '#ffffff', 2, 1);
    px(ctx, x, y + 1, ICE[2]);
  }
  snowField(ctx, W, H, HY + 6, 2);
  // 裂隙的光洒在雪地上
  glowAt(ctx, 190, HY + 14, 70, 'rgba(90,230,255,0.32)');
  // 永冬生物：冰霜巨人站在裂隙前，两只霜狼在前面，一只霜魂飘在空中
  lord(ctx, 258, 132, 2);
  frostMon(ctx, 'frost_wolf', 150, 130, 1.5, false, 'rgba(110,210,255,0.35)', 0.12);
  frostMon(ctx, 'frost_wolf', 196, 136, 1.5, false, 'rgba(110,210,255,0.35)', 0.12);
  frostMon(ctx, 'frost_wraith', 150, 74, 1.5, true, 'rgba(150,230,255,0.45)', 0.1);
  // 主角：左下，提剑面朝右
  glowAt(ctx, 72, 118, 30, 'rgba(255,200,120,0.25)');
  hero(ctx, 0, 'fight-sword-ready', 0, 72, 138, 2.5);
  blizzard(ctx, W, H, 260, 21);
  // 下方压暗一点，给文字和边框留气口
  const v = ctx.createLinearGradient(0, H - 18, 0, H);
  v.addColorStop(0, 'rgba(10,20,40,0)');
  v.addColorStop(1, 'rgba(10,20,40,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, H - 18, W, 18);
  return c;
});

/** ① 随机降临：一张雪原小地图，几处雪花标记带倒计时，标记周围一圈暴风雪 */
export const wtSpawnUrl = () => once('wt-spawn2', () => {
  const { c, ctx } = canvas(120, 90);
  for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
    const r = phash(x >> 2, y >> 2, 5);
    const r2 = phash(x, y, 6);
    const snowy = y < 34 + Math.sin(x * 0.08) * 6;
    const col = snowy ? (r < 0.25 ? SNOW[2] : r2 < 0.1 ? SNOW[3] : SNOW[4]) : r < 0.2 ? '#244a2a' : r < 0.5 ? '#2e5a30' : '#3a6a38';
    px(ctx, x, y, col);
  }
  // 雪线边上一圈过渡
  for (let x = 0; x < 120; x++) { const y = Math.round(34 + Math.sin(x * 0.08) * 6); px(ctx, x, y, SNOW[1]); px(ctx, x, y + 1, '#5a7a5a'); }
  // 树和河
  for (let k = 0; k < 26; k++) { const x = phash(k, 1, 3) * 120, y = 44 + phash(k, 2, 3) * 44; px(ctx, x, y, '#183a1e', 2, 2); px(ctx, x, y - 1, '#2a5a2e'); }
  for (let x = 0; x < 120; x++) { const y = Math.round(62 + Math.sin(x * 0.07) * 7); px(ctx, x, y, '#2a6aa0', 1, 3); px(ctx, x, y, '#5aa0d0'); }
  // 城
  px(ctx, 55, 46, '#8a6a4a', 10, 8); px(ctx, 54, 44, '#a03a2a', 12, 3); px(ctx, 59, 50, '#3a2a1a', 2, 4);
  // 地图边框
  ctx.strokeStyle = '#c8a060';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 119, 89);
  const at: [number, number, string][] = [[22, 16, '14:59'], [96, 24, '08:12'], [28, 76, '02:40'], [92, 74, '11:05']];
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  for (const [x, y, t] of at) {
    // 一圈风雪
    for (let k = 0; k < 24; k++) { const a = k * 0.8, r = 7 + (k % 3) * 2; px(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 'rgba(255,255,255,0.75)'); }
    flake(ctx, x, y, 4);
    ctx.strokeStyle = '#06101e';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#c8f4ff';
    ctx.strokeText(t, x, y + 14);
    ctx.fillText(t, x, y + 14);
  }
  return c;
});

/** ② 三种永冬生物：霜裔成群、冰冠精英、永冬领主（头上冰冠和光环） */
export const wtFoesUrl = () => once('wt-foes2', () => {
  const { c, ctx } = canvas(120, 90);
  scene(ctx, 120, 90, 7, 0.52);
  lord(ctx, 94, 88, 1);
  frostMon(ctx, 'ice_troll', 52, 86, 1, true, 'rgba(110,210,255,0.45)');
  frostMon(ctx, 'frost_wolf', 14, 84, 1, false);
  frostMon(ctx, 'frost_wolf', 24, 90, 1, false);
  // 冰冠：一排尖冰
  const crown = (x: number, y: number, n: number) => { for (let i = -n; i <= n; i++) { const hh = i % 2 === 0 ? 3 : 1; px(ctx, x + i, y - hh, ICE[4], 1, hh); px(ctx, x + i, y, ICE[2]); } };
  crown(52, 52, 3);

  blizzard(ctx, 120, 90, 60, 17);
  return c;
});

/** ③ 永冬冰晶和霜雪礼盒 */
export const wtLootUrl = () => once('wt-loot2', () => {
  const { c, ctx } = canvas(120, 90);
  scene(ctx, 120, 90, 21, 0.6);
  glowAt(ctx, 36, 56, 32, 'rgba(120,220,255,0.6)');
  crystal(ctx, 34, 52, 3.4);
  crystal(ctx, 50, 62, 2.1);
  crystal(ctx, 22, 66, 1.6);
  giftBox(ctx, 72, 52, 30, 26);
  blizzard(ctx, 120, 90, 50, 23);
  return c;
});

/** ④ 限定奖励：一身冰霜外观的主角，旁边一座冰狼冰雕 */
export const wtRewardUrl = () => once('wt-reward2', () => {
  const { c, ctx } = canvas(120, 90);
  scene(ctx, 120, 90, 29, 0.6);
  // 冰雕底座
  px(ctx, 70, 80, ICE[1], 36, 4); px(ctx, 70, 80, ICE[3], 36, 1);
  frostMon(ctx, 'frost_wolf', 88, 80, 2, true, 'rgba(200,240,255,0.5)', 0.55);
  glowAt(ctx, 34, 74, 26, 'rgba(140,220,255,0.55)');
  frostHero(ctx, 0, 'idle-down', 34, 88, 2, false, 0.18);
  for (let k = 0; k < 12; k++) flake(ctx, phash(k, 1, 31) * 120, phash(k, 2, 31) * 40, 1);
  return c;
});

/** ⑤ 组队讨伐永冬领主：三个人围着冰霜巨人 */
export const wtTeamUrl = () => once('wt-team2', () => {
  const { c, ctx } = canvas(120, 90);
  scene(ctx, 120, 90, 37, 0.52);
  lord(ctx, 86, 86, 1.25);
  hero(ctx, 1, 'fight-staff-ready', 0, 16, 74);
  hero(ctx, 0, 'fight-sword-ready', 0, 40, 86);
  hero(ctx, 2, 'fight-shortbow-ready', 0, 14, 90);
  // 法球和箭
  glowAt(ctx, 56, 52, 6, 'rgba(120,200,255,0.8)');
  px(ctx, 55, 51, '#ffffff', 2, 2);
  px(ctx, 50, 70, '#e8e8e8', 6, 1);
  blizzard(ctx, 120, 90, 70, 41);
  return c;
});

/** 主界面小按钮上的冰晶图标 */
export const wtIconUrl = () => once('wt-icon', () => {
  const { c, ctx } = canvas(16, 16);
  crystal(ctx, 8, 8, 1.8);
  return c;
});

