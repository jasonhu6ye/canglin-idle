import { MONSTERS } from '../core/data';
import { dungeonFloor } from '../core/dungeon';
import type { DungeonGate } from '../core/types';
import { keyCanvas, paintDgChest, paintDgDecor, paintDgFloor, paintDgWall, paintGatePortal, paintStairs, type DgThemeId } from './dungeonArt';
import { FRAME_H, FRAME_W, HERO_ANIMS, OUTFITS, paintHeroSheet } from './hero';
import { drawMonsterFrame, monsterFrameSize } from './monsterArt';
import { phash } from './pix';

/*
 * 副本更新公告的贴图（用户 10-25：进游戏弹的绿洞蓝洞公告要配图，全部代码画）：
 * 头图（洞穴里一绿一蓝两个洞口）、开洞口、随机地形、首领守宝箱、四色宝箱、组队蓝洞。
 */

const cache = new Map<string, string>();
export const once = (key: string, draw: () => HTMLCanvasElement) => {
  let url = cache.get(key);
  if (!url) { url = draw().toDataURL(); cache.set(key, url); }
  return url;
};
export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}
export function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
/** 按整数倍放大画（保持像素感），flip 左右翻转 */
function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, x: number, y: number, k = 1, flip = false) {
  ctx.save();
  if (flip) { ctx.translate(x + sw * k, y); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * k, sh * k); }
  else ctx.drawImage(img, sx, sy, sw, sh, x, y, sw * k, sh * k);
  ctx.restore();
}
export const whole = (ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, k = 1, flip = false) => blit(ctx, img, 0, 0, img.width, img.height, x, y, k, flip);

/** 洞里的地面和后墙：地砖铺满，上面一排墙 */
function cave(ctx: CanvasRenderingContext2D, w: number, h: number, th: DgThemeId, wallRows = 2) {
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) ctx.drawImage(paintDgFloor(th, Math.floor(phash(x, y, 3) * 4)), x, y);
  for (let r = 0; r < wallRows; r++) for (let x = 0; x < w; x += 16) ctx.drawImage(paintDgWall(th, r === wallRows - 1, Math.floor(phash(x, r, 4) * 3)), x, r * 16);
  // 四周压暗
  const g = ctx.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.2, w / 2, h * 0.6, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,8,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
export function sparkles(ctx: CanvasRenderingContext2D, w: number, h: number, cols: string[], n: number, salt: number) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = cols[k % cols.length];
    const x = Math.floor(phash(k, 6, salt) * w);
    const y = Math.floor(phash(k, 7, salt) * h);
    ctx.fillRect(x, y, 1, 1);
    if (k % 3 === 0) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}
/** 一道竖着的光柱 */
export function beam(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, col: string) {
  const g = ctx.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.fillRect(x - 5, y - h, 10, h);
  ctx.fillRect(x - 2, y - h, 4, h);
}

/** 主角某一帧（外观 o、动画 key、第 i 帧） */
const heroSheets = new Map<string, ReturnType<typeof paintHeroSheet>>();
export function hero(ctx: CanvasRenderingContext2D, o: number, anim: string, i: number, x: number, y: number, k = 1, flip = false) {
  const key = `${o}|${anim}`;
  let sh = heroSheets.get(key);
  if (!sh) { sh = paintHeroSheet(OUTFITS[o % OUTFITS.length], document.createElement('canvas'), HERO_ANIMS.filter((a) => a.key === anim)); heroSheets.set(key, sh); }
  const f = sh.frames.find((q) => q.name === `${anim}-${i}`) ?? sh.frames[0];
  blit(ctx, sh.canvas, f.x, f.y, FRAME_W, FRAME_H, x - (FRAME_W * k) / 2, y - FRAME_H * k, k, flip);
}

const SAMPLE: DungeonGate = { id: 'poster', kind: 'blue', tier: 5, x: 0, y: 0, at: 0, expires: 0, seed: 20261025, floors: 4 };
/** 样例副本最后一层首领的外形 */
function sampleBoss() {
  const F = dungeonFloor(SAMPLE, SAMPLE.floors - 1);
  const st = F.stops.find((s) => s.monster && MONSTERS[s.monster]?.rank === 'boss') ?? F.stops.find((s) => s.monster);
  const m = MONSTERS[st!.monster!];
  return MONSTERS[m.dungeon?.base ?? m.id] ?? m;
}

/** 头图：水晶洞穴里一绿一蓝两个洞口，后面金色宝箱发光，主角背对镜头 */
export const dgBannerUrl = () => once('banner', () => {
  const W = 240;
  const H = 100;
  const { c, ctx } = canvas(W, H);
  cave(ctx, W, H, 'crystal', 2);
  glowAt(ctx, 120, 30, 34, 'rgba(255,200,60,0.45)');
  whole(ctx, paintDgChest(3, true), 100, 6);
  for (const [x, kind, col] of [[150, 'green', 'rgba(80,230,120,0.55)'], [206, 'blue', 'rgba(80,190,255,0.55)']] as const) {
    glowAt(ctx, x, 70, 40, col);
    beam(ctx, x, 70, 60, col);
    const cv = paintGatePortal(kind);
    whole(ctx, cv, x - cv.width / 2, 92 - cv.height);
  }
  for (const [x, y, k] of [[8, 70, 0], [34, 82, 1], [226, 40, 2], [92, 84, 3], [60, 36, 4]]) ctx.drawImage(paintDgDecor('crystal', k), x, y);
  hero(ctx, 0, 'idle-up', 0, 98, 104, 2);
  sparkles(ctx, W, H, ['#e0c8ff', '#ffffff', '#9ae0ff'], 26, 11);
  return c;
});

/** ① 用钥匙开洞口：地表草地上裂开的洞口、光柱、钥匙 */
export const dgGateUrl = () => once('gate', () => {
  const { c, ctx } = canvas(120, 90);
  const g = ctx.createLinearGradient(0, 0, 0, 90);
  g.addColorStop(0, '#0a1424');
  g.addColorStop(0.45, '#1a2c3a');
  g.addColorStop(0.46, '#1e4a26');
  g.addColorStop(1, '#0e2a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 120, 90);
  for (let k = 0; k < 50; k++) {
    ctx.fillStyle = k % 2 ? '#2a6a34' : '#163a1c';
    ctx.fillRect(Math.floor(phash(k, 1, 7) * 120), 44 + Math.floor(phash(k, 2, 7) * 46), 1, 2);
  }
  sparkles(ctx, 120, 38, ['#ffffff', '#a0b8d8'], 18, 3);
  glowAt(ctx, 70, 66, 36, 'rgba(80,230,120,0.5)');
  beam(ctx, 70, 66, 64, 'rgba(80,230,120,0.5)');
  const cv = paintGatePortal('green');
  whole(ctx, cv, 70 - cv.width, 84 - cv.height * 2, 2);
  glowAt(ctx, 24, 30, 16, 'rgba(255,230,120,0.5)');
  whole(ctx, keyCanvas('green', 4), 8, 12, 1.6 as number);
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#7aff9a';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeText('30:00', 56, 20);
  ctx.fillText('30:00', 56, 20);
  return c;
});

/** ② 随机地形：一层副本的小地图，路线、怪、楼梯 */
export const dgMapUrl = () => once('map', () => {
  const { c, ctx } = canvas(120, 90);
  ctx.fillStyle = '#0a0812';
  ctx.fillRect(0, 0, 120, 90);
  const F = dungeonFloor(SAMPLE, 1);
  const k = Math.min(116 / F.w, 86 / F.h);
  const ox = (120 - F.w * k) / 2;
  const oy = (90 - F.h * k) / 2;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    if (F.grid[y * F.w + x] !== 1) continue;
    const wall = y > 0 && F.grid[(y - 1) * F.w + x] !== 1;
    ctx.fillStyle = wall ? '#6a5a8a' : phash(x, y, 2) > 0.5 ? '#3a3050' : '#332a48';
    ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
  }
  // 路线：一段段走过去
  ctx.fillStyle = 'rgba(255,220,100,0.8)';
  F.legs.forEach((leg) => leg.forEach((p, i) => { if (i % 2 === 0) ctx.fillRect(ox + p.x * k + k / 2 - 0.5, oy + p.y * k + k / 2 - 0.5, 1, 1); }));
  for (const st of F.stops) {
    const x = ox + st.x * k;
    const y = oy + st.y * k;
    if (st.kind === 'mob') {
      const r = MONSTERS[st.monster!]?.rank;
      ctx.fillStyle = r === 'boss' ? '#ff4a3a' : r === 'elite' ? '#ffb030' : '#e05a5a';
      ctx.fillRect(x - 1, y - 1, r === 'normal' ? 2 : 3, r === 'normal' ? 2 : 3);
    }
  }
  ctx.drawImage(paintStairs(), ox + F.stairs!.x * k - 6, oy + F.stairs!.y * k - 6, 12, 12);
  ctx.fillStyle = '#5aff7a';
  ctx.fillRect(ox + F.start.x * k - 1, oy + F.start.y * k - 1, 3, 3);
  return c;
});

/** ③ 首领守着宝箱 */
export const dgBossUrl = () => once('boss', () => {
  const { c, ctx } = canvas(120, 90);
  cave(ctx, 120, 90, 'lava', 2);
  glowAt(ctx, 82, 60, 40, 'rgba(255,90,40,0.45)');
  const m = sampleBoss();
  const S = monsterFrameSize(m);
  const kk = S >= 48 ? 1 : 2;
  whole(ctx, paintDgChest(3, false), 26, 50);
  whole(ctx, drawMonsterFrame(m, 'idle', 0).canvas(), 88 - (S * kk) / 2, 84 - S * kk, kk, true);
  hero(ctx, 1, 'fight-sword-ready', 0, 16, 88, 1);
  sparkles(ctx, 120, 90, ['#ffd86a', '#ff8a4a'], 12, 5);
  return c;
});

/** ④ 四种品质的宝箱：绿、蓝、紫、金 */
export const dgChestsUrl = () => once('chests', () => {
  const { c, ctx } = canvas(120, 90);
  const g = ctx.createLinearGradient(0, 0, 0, 90);
  g.addColorStop(0, '#120a20');
  g.addColorStop(1, '#2a1a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 120, 90);
  const cols = ['rgba(90,220,110,0.5)', 'rgba(80,150,255,0.5)', 'rgba(190,100,255,0.55)', 'rgba(255,200,60,0.65)'];
  [[4, 52], [30, 44], [58, 36], [84, 26]].forEach(([x, y], q) => {
    glowAt(ctx, x + 16, y + 18, 18 + q * 4, cols[q]);
    whole(ctx, paintDgChest(q, q === 3), x, y, 0.8 as number);
  });
  sparkles(ctx, 120, 90, ['#fff4c0', '#c8f0ff', '#e0c0ff'], 20, 9);
  return c;
});

/** ⑤ 组队打蓝洞：近战在前、弓手法师在后，一起打一只大怪 */
export const dgPartyUrl = () => once('party', () => {
  const { c, ctx } = canvas(120, 90);
  cave(ctx, 120, 90, 'ice', 2);
  glowAt(ctx, 92, 60, 34, 'rgba(80,190,255,0.4)');
  const m = sampleBoss();
  const S = monsterFrameSize(m);
  whole(ctx, drawMonsterFrame(m, 'attack', 1).canvas(), 96 - S / 2, 80 - S, 1, true);
  hero(ctx, 2, 'fight-sword-ready', 1, 64, 82);
  hero(ctx, 3, 'fight-shortbow-ready', 2, 34, 70);
  hero(ctx, 4, 'fight-staff-ready', 3, 30, 92);
  // 一支箭和一颗法球正飞向怪
  ctx.fillStyle = '#e8d8b0';
  ctx.fillRect(48, 57, 14, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(62, 56, 2, 3);
  glowAt(ctx, 60, 74, 6, 'rgba(120,200,255,0.9)');
  ctx.fillStyle = '#e0f4ff';
  ctx.fillRect(59, 73, 2, 2);
  sparkles(ctx, 120, 90, ['#c8f0ff', '#ffffff'], 14, 13);
  return c;
});
