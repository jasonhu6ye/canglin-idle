import { beam, canvas, glowAt, hero, once, sparkles, whole } from './dungeonPoster';
import { paintDgChest } from './dungeonArt';
import { paintResNode } from './resArt';
import { phash } from './pix';

/*
 * 「异域之路」预告公告的贴图（用户 10-30：弹出即将更新的异域公告，参考 Albion 的阿瓦隆之路，全部代码画）：
 * 头图（星空下白石古道通向远方的金色拱门）、三种传送门、道路网、高阶资源和守卫、三色宝箱、公会营地。
 * 配色：白石、金色符文、淡金色的光，夜空偏蓝紫。
 */

const MARBLE = ['#5a5868', '#8a8898', '#b8b6c4', '#dcdae4', '#f6f4fa'];
const GOLD = ['#6a4a10', '#a07a1e', '#d8aa3a', '#f4d878', '#fff6c8'];

/** 夜空：上深下浅，星星，远处一层雾 */
function sky(ctx: CanvasRenderingContext2D, w: number, h: number, salt: number, horizon = 0.6) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0a24');
  g.addColorStop(horizon, '#2a2a5a');
  g.addColorStop(1, '#141030');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  sparkles(ctx, w, h * horizon, ['#ffffff', '#c8d0ff', '#fff0c0'], Math.round(w * h / 400), salt);
  const m = ctx.createLinearGradient(0, h * horizon - 10, 0, h * horizon + 14);
  m.addColorStop(0, 'rgba(200,190,255,0)');
  m.addColorStop(0.5, 'rgba(200,190,255,0.22)');
  m.addColorStop(1, 'rgba(200,190,255,0)');
  ctx.fillStyle = m;
  ctx.fillRect(0, h * horizon - 10, w, 24);
}

/** 浮在空中的一块碎岩（上面一层草，下面尖尖的石头） */
function islet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, salt: number) {
  for (let y = 0; y < r * 1.6; y++) {
    const half = y < 3 ? r : r * (1 - (y - 3) / (r * 1.6));
    for (let x = Math.ceil(cx - half); x < cx + half; x++) {
      ctx.fillStyle = y === 0 ? '#5a9a5a' : y < 3 ? '#3a6a3a' : phash(x, y, salt) < 0.3 ? '#3a3448' : x < cx ? '#5a5466' : '#423c50';
      ctx.fillRect(x, cy + y, 1, 1);
    }
  }
}

/** 一段白石古道：从 (x0,y0) 到 (x1,y1)，近处宽远处窄，石板缝和金色符文 */
function road(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, salt: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = Math.round(y0 + (y1 - y0) * t);
    const half = (w0 + (w1 - w0) * t) / 2;
    for (let dx = -half; dx < half; dx++) {
      const px = Math.round(x + dx);
      const edge = dx < -half + 1 || dx >= half - 1;
      const seam = (i + Math.floor((dx + 40) / 4)) % 5 === 0;
      ctx.fillStyle = edge ? MARBLE[1] : seam ? MARBLE[2] : phash(px, y, salt) < 0.08 ? GOLD[3] : MARBLE[3];
      ctx.fillRect(px, y, 1, 1);
    }
  }
}

/** 异域传送门：白石拱门，门里一团旋转的金白色光，柱子上刻金色符文。size 0 小门 / 1 中门 / 2 大门 */
export function paintAvalonGate(size: 0 | 1 | 2): HTMLCanvasElement {
  const W = [22, 30, 42][size];
  const H = [30, 40, 54][size];
  const { c, ctx } = canvas(W, H);
  const pw = size === 2 ? 6 : 4;
  const inner = { x: pw, y: Math.round(W / 2 - pw), w: W - pw * 2, h: H - Math.round(W / 2 - pw) - 2 };
  // 门里的光：中心白、边上金，转着的光点
  const g = ctx.createRadialGradient(W / 2, H * 0.58, 1, W / 2, H * 0.58, W / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.5, 'rgba(255,220,120,0.9)');
  g.addColorStop(1, 'rgba(200,150,60,0.75)');
  ctx.fillStyle = g;
  for (let y = 0; y < H - 2; y++) for (let x = pw; x < W - pw; x++) {
    const dy = y - W / 2;
    if (y < W / 2 && Math.hypot(x + 0.5 - W / 2, dy) > W / 2 - pw) continue;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let k = 0; k < 14 + size * 8; k++) {
    const a = k * 0.9;
    const r = (k / (14 + size * 8)) * (W / 2 - pw - 1);
    ctx.fillStyle = k % 2 ? '#ffffff' : '#fff2a0';
    ctx.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(H * 0.58 + Math.sin(a) * r * 1.3), 1, 1);
  }
  // 拱：一圈白石
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const top = y < W / 2;
    const d = top ? Math.hypot(x + 0.5 - W / 2, y - W / 2) : Math.min(Math.abs(x + 0.5 - pw / 2), Math.abs(x + 0.5 - (W - pw / 2)));
    const ring = top ? d <= W / 2 && d > W / 2 - pw : x < pw || x >= W - pw;
    if (!ring) continue;
    const side = top ? (y < W / 4 ? 4 : x < W / 2 ? 3 : 2) : (x === 0 || x === W - pw ? 4 : x === pw - 1 || x === W - 1 ? 1 : 3);
    let col = MARBLE[side];
    if (!top && (y % 6 === 0)) col = MARBLE[1];
    if (!top && y % 6 === 3 && (x === Math.floor(pw / 2) || x === W - Math.ceil(pw / 2))) col = GOLD[4];
    if (top && Math.abs(x + 0.5 - W / 2) < 1.5 && y < pw) col = GOLD[3];
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }
  // 底座
  ctx.fillStyle = MARBLE[1];
  ctx.fillRect(0, H - 2, W, 2);
  ctx.fillStyle = MARBLE[3];
  ctx.fillRect(0, H - 2, W, 1);
  return c;
}

/** 异域守卫：金色盔甲的人形（主角的图层上叠一层金光） */
function guardian(ctx: CanvasRenderingContext2D, x: number, y: number, k = 1, flip = false) {
  const { c, ctx: t } = canvas(80, 80);
  hero(t, 5, 'fight-sword-ready', 0, 40, 76, k, flip);
  t.globalCompositeOperation = 'source-atop';
  t.fillStyle = 'rgba(240,200,90,0.5)';
  t.fillRect(0, 0, 80, 80);
  glowAt(ctx, x, y - 14 * k, 18 * k, 'rgba(255,220,120,0.45)');
  ctx.drawImage(c, x - 40, y - 76);
}

/** 头图：星空下浮空碎岩之间，一条白石古道通向远处发光的金色拱门，主角背对镜头站在路口 */
export const avBannerUrl = () => once('av-banner', () => {
  const W = 240;
  const H = 100;
  const { c, ctx } = canvas(W, H);
  sky(ctx, W, H, 31, 0.55);
  islet(ctx, 30, 36, 14, 1);
  islet(ctx, 206, 26, 18, 2);
  islet(ctx, 168, 58, 8, 3);
  islet(ctx, 60, 64, 7, 4);
  // 远处的门和光
  glowAt(ctx, 150, 34, 40, 'rgba(255,220,130,0.5)');
  beam(ctx, 150, 46, 46, 'rgba(255,230,150,0.45)');
  whole(ctx, paintAvalonGate(1), 135, 6);
  // 古道：近处宽，弯到远处的门口
  road(ctx, 120, 100, 132, 72, 54, 26, 5);
  road(ctx, 132, 72, 150, 46, 26, 10, 6);
  // 路边两排金色灯柱
  for (const [x, y, s] of [[96, 88, 3], [146, 88, 3], [112, 70, 2], [146, 66, 2], [134, 54, 1], [158, 52, 1]] as [number, number, number][]) {
    ctx.fillStyle = MARBLE[2];
    ctx.fillRect(x, y - s * 6, s, s * 6);
    glowAt(ctx, x + s / 2, y - s * 6, s * 4, 'rgba(255,220,120,0.8)');
    ctx.fillStyle = GOLD[4];
    ctx.fillRect(x, y - s * 6 - 1, s, s);
  }
  hero(ctx, 0, 'idle-up', 0, 120, 104, 2);
  sparkles(ctx, W, H, ['#fff6c8', '#ffffff'], 18, 12);
  return c;
});

/** ① 三种传送门：小门、中门、大门，头上写能过几个人 */
export const avGatesUrl = () => once('av-gates', () => {
  const { c, ctx } = canvas(120, 90);
  sky(ctx, 120, 90, 7, 0.7);
  ctx.fillStyle = '#1e3a24';
  ctx.fillRect(0, 70, 120, 20);
  for (let k = 0; k < 40; k++) { ctx.fillStyle = k % 2 ? '#2a5a30' : '#163a1c'; ctx.fillRect(Math.floor(phash(k, 1, 9) * 120), 70 + Math.floor(phash(k, 2, 9) * 20), 1, 2); }
  const at: [0 | 1 | 2, number, string][] = [[0, 16, '2'], [1, 50, '7'], [2, 92, '20']];
  for (const [s, x, n] of at) {
    const gc = paintAvalonGate(s);
    glowAt(ctx, x, 78 - gc.height / 2, gc.width, 'rgba(255,220,130,0.35)');
    whole(ctx, gc, x - gc.width / 2, 80 - gc.height);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#fff2a0';
    ctx.strokeText(`${n}P`, x, 80 - gc.height - 3);
    ctx.fillText(`${n}P`, x, 80 - gc.height - 3);
  }
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd86a';
  ctx.strokeText('02:47:10', 4, 10);
  ctx.fillText('02:47:10', 4, 10);
  return c;
});

/** ② 道路网：一张星图一样的小地图，几段古道连着几个区域，入口、出口、资源、宝箱 */
export const avMapUrl = () => once('av-map', () => {
  const { c, ctx } = canvas(120, 90);
  ctx.fillStyle = '#0c0a1e';
  ctx.fillRect(0, 0, 120, 90);
  sparkles(ctx, 120, 90, ['#3a3a6a', '#5a5a8a'], 60, 4);
  const nodes: [number, number, string][] = [
    [14, 72, 'in'], [38, 56, 'res'], [30, 26, 'chest'], [64, 40, 'camp'], [62, 74, 'res'], [92, 22, 'out'], [100, 60, 'chest'], [86, 82, 'out'],
  ];
  const links = [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5], [3, 6], [6, 7], [4, 7]];
  for (const [a, b] of links) {
    const [x0, y0] = nodes[a];
    const [x1, y1] = nodes[b];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#fff2a0' : '#b8b0d8';
      ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    }
  }
  for (const [x, y, k] of nodes) {
    const col = k === 'in' ? '#5aff7a' : k === 'out' ? '#ff8a5a' : k === 'res' ? '#7ad8ff' : k === 'chest' ? '#ffd86a' : '#e0b0ff';
    glowAt(ctx, x, y, 8, col.replace(/^#(..)(..)(..)$/, (_m, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},0.45)`));
    ctx.fillStyle = MARBLE[3];
    ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.fillStyle = col;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, y - 2, 2, 1);
  }
  return c;
});

/** ③ 高阶资源：古道边 T6-T8 的矿和水晶，一个金甲守卫站在旁边 */
export const avResUrl = () => once('av-res', () => {
  const { c, ctx } = canvas(120, 90);
  sky(ctx, 120, 90, 17, 0.5);
  road(ctx, 0, 89, 120, 89, 1, 1, 7);
  ctx.fillStyle = '#2a2640';
  ctx.fillRect(0, 60, 120, 30);
  road(ctx, 60, 90, 70, 60, 40, 18, 8);
  const nodes: [string, number, number, number][] = [['ore', 7, 6, 70], ['ore', 6, 24, 82], ['log', 7, 96, 74], ['cotton', 5, 104, 88]];
  for (const [kind, tier, x, y] of nodes) {
    try {
      const n = paintResNode(kind as never, tier);
      glowAt(ctx, x + n.width / 2, y - n.height / 2, 14, 'rgba(140,200,255,0.35)');
      whole(ctx, n, x, y - n.height);
    } catch { /* 万一某种节点没有就跳过 */ }
  }
  guardian(ctx, 70, 66);
  sparkles(ctx, 120, 90, ['#c8f0ff', '#fff6c8'], 12, 21);
  return c;
});

/** ④ 三色宝箱：绿（一个人）、蓝（小队）、金（公会），金箱旁边守卫最多 */
export const avChestsUrl = () => once('av-chests', () => {
  const { c, ctx } = canvas(120, 90);
  sky(ctx, 120, 90, 23, 0.45);
  ctx.fillStyle = '#26223a';
  ctx.fillRect(0, 50, 120, 40);
  road(ctx, 0, 72, 120, 72, 10, 10, 9);
  const at: [number, number, number, string][] = [[0, 8, 62, 'rgba(90,220,110,0.5)'], [1, 44, 56, 'rgba(80,150,255,0.5)'], [3, 82, 48, 'rgba(255,200,60,0.7)']];
  for (const [q, x, y, col] of at) {
    glowAt(ctx, x + 14, y + 12, 18 + q * 4, col);
    whole(ctx, paintDgChest(q, q === 3), x, y, 0.85 as number);
  }
  guardian(ctx, 112, 84, 1, true);
  sparkles(ctx, 120, 90, ['#fff4c0', '#c8f0ff'], 16, 29);
  return c;
});

/** ⑤ 公会营地：古道尽头的空地上搭着帐篷、插着公会旗，篝火，几个人在休整 */
export const avCampUrl = () => once('av-camp', () => {
  const { c, ctx } = canvas(120, 90);
  sky(ctx, 120, 90, 37, 0.5);
  ctx.fillStyle = '#2a3a2a';
  ctx.fillRect(0, 54, 120, 36);
  road(ctx, 0, 80, 60, 70, 12, 10, 11);
  // 帐篷
  for (const [x, y, col] of [[18, 66, '#8a3a3a'], [78, 62, '#3a4a8a']] as [number, number, string][]) {
    for (let j = 0; j < 18; j++) {
      const half = 2 + j * 0.9;
      for (let i = Math.ceil(-half); i < half; i++) { ctx.fillStyle = i < 0 ? col : '#2a1a2a'; ctx.fillRect(x + i, y - 18 + j, 1, 1); }
    }
    ctx.fillStyle = '#140a14';
    ctx.fillRect(x - 3, y - 8, 6, 8);
  }
  // 旗杆和旗
  ctx.fillStyle = MARBLE[2];
  ctx.fillRect(52, 24, 2, 38);
  ctx.fillStyle = '#c8302a';
  ctx.fillRect(54, 25, 14, 9);
  ctx.fillStyle = GOLD[3];
  ctx.fillRect(59, 27, 4, 4);
  // 篝火
  glowAt(ctx, 54, 76, 22, 'rgba(255,150,50,0.55)');
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(49, 78, 10, 2);
  for (const [x, y, col] of [[53, 72, '#ff8a20'], [54, 70, '#ffd060'], [55, 73, '#ff6a10'], [54, 74, '#fff0a0']] as [number, number, string][]) { ctx.fillStyle = col; ctx.fillRect(x, y, 2, 3); }
  hero(ctx, 1, 'idle-down', 0, 36, 88);
  hero(ctx, 2, 'idle-down', 0, 72, 90, 1, true);
  sparkles(ctx, 120, 50, ['#fff6c8', '#ffffff'], 10, 41);
  return c;
});
