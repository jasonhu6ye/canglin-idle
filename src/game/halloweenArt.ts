import { MONSTERS } from '../core/data';
import { hwBossId } from '../core/halloween';
import { ell, fillPoly, limb } from './monsterArt';
import { phash, Pix } from './pix';
import { drawWorldFrame } from './worldBossArt';

/*
 * 万圣节活动的美术（用户 10-24，全部代码绘制）：地图上的活动祭坛、南瓜礼盒和南瓜积分图标、
 * 活动公告里的几张贴图（夜空横幅、祭坛、奖励）。
 */

const ORANGE = ['#7a3008', '#c0560e', '#e8781a', '#ffb050'];
const PURPLE = ['#2a1040', '#5a2088', '#8a3ad8', '#d0a0ff'];
const STONE = ['#2a2630', '#4a4552', '#6e6878', '#9a94a4'];

/** 一个小南瓜灯（cx,cy 是中心，r 是半径） */
function lantern(p: Pix, cx: number, cy: number, r: number, lit = true) {
  ell(p, cx, cy, r, r * 0.82, ORANGE[1]);
  ell(p, cx - r * 0.35, cy, r * 0.42, r * 0.78, ORANGE[2]);
  ell(p, cx + r * 0.35, cy, r * 0.42, r * 0.78, ORANGE[2]);
  ell(p, cx, cy, r * 0.35, r * 0.8, ORANGE[2]);
  p.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.5), ORANGE[3]);
  limb(p, cx, cy - r * 0.8, cx - 1, cy - r * 1.15, '#3a7a2a', Math.max(1, r * 0.25));
  if (r < 2.5) return;
  const g = lit ? '#fff0a0' : '#3a1404';
  fillPoly(p, [[cx - r * 0.6, cy - r * 0.05], [cx - r * 0.35, cy - r * 0.45], [cx - r * 0.1, cy - r * 0.05]], g);
  fillPoly(p, [[cx + r * 0.1, cy - r * 0.05], [cx + r * 0.35, cy - r * 0.45], [cx + r * 0.6, cy - r * 0.05]], g);
  fillPoly(p, [[cx - r * 0.55, cy + r * 0.2], [cx + r * 0.55, cy + r * 0.2], [cx + r * 0.35, cy + r * 0.5], [cx - r * 0.35, cy + r * 0.5]], g);
}

/** 地图上的活动祭坛：石台阶、刻着南瓜脸的石柱、顶上一团紫色鬼火、两边蜡烛和南瓜，地上一圈召唤符文 */
export function paintAltar(frame = 0): HTMLCanvasElement {
  const p = new Pix(64, 64);
  // 地上的召唤阵
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2 + frame * 0.13;
    const x = 32 + Math.cos(a) * 27;
    const y = 54 + Math.sin(a) * 8;
    if (k % 2 === 0) p.set(Math.round(x), Math.round(y), k % 6 === 0 ? PURPLE[3] : PURPLE[2]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + frame * 0.13;
    p.set(Math.round(32 + Math.cos(a) * 20), Math.round(54 + Math.sin(a) * 6), PURPLE[3]);
  }
  // 三层石台阶
  const step = (y: number, half: number) => {
    p.rect(32 - half, y, half * 2, 3, STONE[1]);
    p.rect(32 - half, y, half * 2, 1, STONE[3]);
    p.rect(32 - half, y + 2, half * 2, 1, STONE[0]);
    for (let x = 32 - half + 3; x < 32 + half; x += 6) p.set(x, y + 1, STONE[0]);
  };
  step(52, 22);
  step(49, 18);
  step(46, 14);
  // 石柱：上宽下窄，刻着南瓜脸
  fillPoly(p, [[24, 46], [40, 46], [42, 28], [22, 28]], STONE[2]);
  for (let y = 29; y < 46; y += 4) limb(p, 23, y, 41, y, STONE[1], 1);
  limb(p, 23, 28, 23, 46, STONE[3], 1);
  limb(p, 41, 28, 41, 46, STONE[0], 1);
  p.rect(20, 25, 24, 3, STONE[3]);
  p.rect(20, 27, 24, 1, STONE[0]);
  // 柱子上的发光刻纹
  fillPoly(p, [[27, 36], [29, 32], [31, 36]], '#ffb030');
  fillPoly(p, [[33, 36], [35, 32], [37, 36]], '#ffb030');
  fillPoly(p, [[27, 39], [37, 39], [35, 42], [29, 42]], '#ffb030');
  for (let k = 0; k < 3; k++) p.set(29 + k * 3, 39, STONE[2]);
  // 柱顶的大南瓜灯和鬼火
  lantern(p, 32, 19, 7);
  const fl = [0, 1, 2, 1][frame % 4];
  fillPoly(p, [[27, 12], [32 + (frame % 2 ? 1 : -1), 0 + fl], [37, 12]], PURPLE[2]);
  fillPoly(p, [[29, 12], [32, 4 + fl], [35, 12]], PURPLE[3]);
  p.set(32, 9, '#ffffff');
  // 两边的蜡烛和小南瓜
  for (const x of [12, 52]) {
    p.rect(x - 1, 40, 3, 9, '#e8e0c8');
    p.rect(x + 1, 40, 1, 9, '#b8b098');
    p.set(x, 38 - (frame % 2), '#ffd040');
    p.set(x, 39, '#ff8020');
    p.set(x - 1, 49, '#d8d0b8');
    p.set(x + 2, 48, '#d8d0b8');
  }
  lantern(p, 8, 54, 4);
  lantern(p, 56, 55, 3.5);
  lantern(p, 18, 57, 3, false);
  // 蜘蛛网
  for (let k = 0; k < 4; k++) limb(p, 20, 25, 20 - k * 2, 30 + k, '#c8c8d8', 0.6);
  p.outline();
  return p.canvas();
}

const cache = new Map<string, string>();
const once = (key: string, draw: () => HTMLCanvasElement) => {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = draw().toDataURL();
  cache.set(key, url);
  return url;
};

/** 南瓜礼盒：橙色盒子、紫色丝带、蝴蝶结，盒身上刻着南瓜脸 */
function boxPix() {
  const p = new Pix(20, 20);
  p.rect(3, 9, 14, 9, ORANGE[2]);
  p.rect(3, 9, 2, 9, ORANGE[3]);
  p.rect(14, 9, 3, 9, ORANGE[1]);
  p.rect(2, 6, 16, 4, ORANGE[3]);
  p.rect(2, 9, 16, 1, ORANGE[0]);
  p.rect(9, 6, 2, 12, PURPLE[2]);
  p.rect(9, 6, 1, 12, PURPLE[3]);
  p.rect(2, 7, 16, 1, PURPLE[2]);
  fillPoly(p, [[10, 6], [5, 2], [5, 6]], PURPLE[2]);
  fillPoly(p, [[10, 6], [15, 2], [15, 6]], PURPLE[1]);
  p.set(6, 3, PURPLE[3]);
  p.rect(9, 5, 2, 2, PURPLE[3]);
  p.set(6, 12, '#3a1404');
  p.set(13, 12, '#3a1404');
  for (let x = 5; x <= 14; x++) if (x < 9 || x > 10) p.set(x, 15, x % 2 ? '#3a1404' : ORANGE[1]);
  p.outline();
  return p;
}
export const pumpkinBoxUrl = () => once('box', () => boxPix().canvas());

/** 南瓜积分：一枚刻着南瓜的金币 */
export const pumpkinPointUrl = () => once('pt', () => {
  const p = new Pix(20, 20);
  ell(p, 10, 10, 8, 8, '#a07a20');
  ell(p, 10, 10, 7, 7, '#e8b83a');
  ell(p, 9, 9, 5, 5, '#ffd86a');
  lantern(p, 10, 11, 4);
  p.set(5, 6, '#fff4c0');
  p.outline();
  return p.canvas();
});

// ---- 活动公告的贴图：用 2D 画布画的像素风小场景，CSS 放大时保持像素感 ----

function sky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e0820');
  g.addColorStop(0.6, '#3a1450');
  g.addColorStop(1, '#7a2a40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = phash(k, 1, 5) > 0.8 ? '#ffffff' : '#a090c0';
    ctx.fillRect(Math.floor(phash(k, 2, 5) * w), Math.floor(phash(k, 3, 5) * h * 0.6), 1, 1);
  }
}
function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
  g.addColorStop(0, 'rgba(255,220,150,0.45)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  ctx.fillStyle = '#ffe8b0';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c890';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.35, -0.35, 0.1]]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fill();
  }
}
function bat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = '#0a0410';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 4 * s, y - 2 * s);
  ctx.lineTo(x - 3 * s, y + 0.5 * s);
  ctx.lineTo(x - 1.5 * s, y);
  ctx.lineTo(x, y + 1.5 * s);
  ctx.lineTo(x + 1.5 * s, y);
  ctx.lineTo(x + 3 * s, y + 0.5 * s);
  ctx.lineTo(x + 4 * s, y - 2 * s);
  ctx.closePath();
  ctx.fill();
}
function hills(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#1a0c24';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h - 22 - Math.sin(x * 0.03) * 6 - Math.sin(x * 0.11) * 2);
  ctx.lineTo(w, h);
  ctx.fill();
  // 一棵歪脖子枯树
  ctx.strokeStyle = '#0a0410';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.86, h - 22);
  ctx.lineTo(w * 0.87, h - 52);
  ctx.lineTo(w * 0.83, h - 66);
  ctx.moveTo(w * 0.87, h - 46);
  ctx.lineTo(w * 0.93, h - 60);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.83, h - 60);
  ctx.lineTo(w * 0.79, h - 64);
  ctx.moveTo(w * 0.91, h - 56);
  ctx.lineTo(w * 0.95, h - 54);
  ctx.stroke();
}
const pix = (p: Pix) => p.canvas();
function lanternCanvas(r: number, lit = true) {
  const S = Math.ceil(r * 3);
  const p = new Pix(S, S);
  lantern(p, S / 2, S / 2 + 1, r, lit);
  p.outline();
  return pix(p);
}
function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** 公告头图：月夜、蝙蝠、一排南瓜灯，南瓜王站在正中间 */
export const posterBannerUrl = () => once('banner', () => {
  const W = 240;
  const H = 100;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  sky(ctx, W, H);
  moon(ctx, 214, 22, 12);
  for (const [x, y, s] of [[40, 20, 1], [62, 12, 0.8], [150, 30, 1.2], [176, 50, 0.7], [24, 38, 0.6]]) bat(ctx, x, y, s);
  hills(ctx, W, H);
  glowAt(ctx, 168, 62, 46, 'rgba(255,140,30,0.35)');
  const king = drawWorldFrame(MONSTERS[hwBossId(2)], 'idle', 3).canvas();
  ctx.drawImage(king, 168 - 48, H - 96 + 2);
  const lit = lanternCanvas(6);
  const small = lanternCanvas(4);
  for (const [x, big] of [[14, true], [44, false], [72, true], [104, false], [212, true], [232, false]] as [number, boolean][]) {
    glowAt(ctx, x, H - 12, 16, 'rgba(255,170,40,0.4)');
    ctx.drawImage(big ? lit : small, x - (big ? 9 : 6), H - (big ? 22 : 16));
  }
  // 地上的薄雾
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = 'rgba(200,170,230,0.12)';
    ctx.fillRect(Math.floor(phash(k, 9, 1) * W), H - 6 - Math.floor(phash(k, 8, 1) * 8), 10 + Math.floor(phash(k, 7, 1) * 20), 2);
  }
  return c;
});

/** 祭坛贴图：召唤阵发着紫光 */
export const posterAltarUrl = () => once('altar', () => {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 90;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  sky(ctx, 120, 90);
  moon(ctx, 20, 18, 8);
  bat(ctx, 96, 16, 0.8);
  glowAt(ctx, 60, 50, 40, 'rgba(160,80,255,0.4)');
  ctx.drawImage(paintAltar(1), 28, 22);
  return c;
});

/** 奖励贴图：一堆南瓜礼盒和积分金币 */
export const posterRewardUrl = () => once('reward', () => {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 90;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const g = ctx.createLinearGradient(0, 0, 0, 90);
  g.addColorStop(0, '#2a1040');
  g.addColorStop(1, '#5a2010');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 120, 90);
  glowAt(ctx, 60, 55, 46, 'rgba(255,170,40,0.45)');
  const box = boxPix().canvas();
  const draw = (x: number, y: number, k: number) => ctx.drawImage(box, x, y, 20 * k, 20 * k);
  draw(16, 40, 2);
  draw(62, 46, 1.6);
  draw(40, 20, 1.4);
  // 积分金币散在前面
  const coin = new Pix(12, 12);
  ell(coin, 6, 6, 5, 5, '#a07a20');
  ell(coin, 6, 6, 4, 4, '#e8b83a');
  ell(coin, 5, 5, 2, 2, '#ffd86a');
  coin.outline();
  const cc = coin.canvas();
  for (let k = 0; k < 9; k++) ctx.drawImage(cc, 8 + Math.floor(phash(k, 4, 2) * 100), 66 + Math.floor(phash(k, 5, 2) * 16));
  // 闪光
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = k % 2 ? '#fff4c0' : '#d0a0ff';
    const x = Math.floor(phash(k, 6, 2) * 120);
    const y = Math.floor(phash(k, 7, 2) * 60);
    ctx.fillRect(x, y, 1, 1);
    if (k % 3 === 0) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
  return c;
});

/** 公告里的南瓜王动图：返回待机 12 帧 */
export function kingFrames(d: number): HTMLCanvasElement[] {
  return Array.from({ length: 12 }, (_, i) => drawWorldFrame(MONSTERS[hwBossId(d)], 'idle', i).canvas());
}
