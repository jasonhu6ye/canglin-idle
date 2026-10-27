import { MONSTERS } from '../../src/core/data';
import { paintBuilding, paintProp } from '../../src/game/art';
import { FRAME_H, FRAME_W, HERO_ANIMS, HERO_FEET, HERO_PAD, OUTFITS, paintHeroSheet } from '../../src/game/hero';
import { paintHorseSheet } from '../../src/game/horseArt';
import { drawMonsterFrame, monsterFrameSize } from '../../src/game/monsterArt';
import { seatOf } from '../../src/game/mounts';
import { phash } from '../../src/game/pix';
import { paintResNode } from '../../src/game/resArt';
import { paintTileset, TILESET, tileIndex } from '../../src/game/tiles';
import { GROUNDS } from '../../src/game/world';
import { paintWolfSheet, WOLF_FEET, WOLF_H, WOLF_W } from '../../src/game/wolfArt';

/*
 * 宣传海报（朋友圈 / Discord 分享用的一张大图，10-27）：
 * 先在 480×270 的小画布上用游戏里的像素美术拼场景，再整数倍放大到 1920×1080，文字按原分辨率写在上面。
 * 打开 /scripts/poster/ 就能看到，?w=1080&h=1350 之类可以换尺寸（会按比例重新排版）；长图在 /scripts/poster/long.html（?lang=en 英文版）。
 */

let W = 480;
let H = 270;

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
function blit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, x: number, y: number, k = 1, flip = false) {
  ctx.save();
  if (flip) { ctx.translate(Math.round(x + sw * k), Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * k, sh * k); }
  else ctx.drawImage(img, sx, sy, sw, sh, Math.round(x), Math.round(y), sw * k, sh * k);
  ctx.restore();
}
/** 脚底在 (x, y) 处画一张图 */
export const stand = (ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, k = 1, flip = false) =>
  blit(ctx, img, 0, 0, img.width, img.height, x - (img.width * k) / 2, y - img.height * k, k, flip);

// ---------- 角色、坐骑、怪物 ----------
const heroSheets = new Map<string, ReturnType<typeof paintHeroSheet>>();
/** 主角某一帧，脚底在 (x, y) */
export function hero(ctx: CanvasRenderingContext2D, o: number, anim: string, i: number, x: number, y: number, k = 1, flip = false) {
  const key = `${o}|${anim}`;
  let sh = heroSheets.get(key);
  if (!sh) { sh = paintHeroSheet(OUTFITS[o % OUTFITS.length], document.createElement('canvas'), HERO_ANIMS.filter((a) => a.key === anim)); heroSheets.set(key, sh); }
  const f = sh.frames.find((fr) => fr.name === `${anim}-${i}`) ?? sh.frames[0];
  const feet = HERO_PAD.t + HERO_FEET;
  blit(ctx, sh.canvas, f.x, f.y, FRAME_W, FRAME_H, x - (FRAME_W * k) / 2, y - feet * k, k, flip);
}
/** 骑着坐骑跑：坐骑后层、骑手、前层（侧面时骑手画在最前） */
export function rider(ctx: CanvasRenderingContext2D, o: number, mount: 'wolf' | number, i: number, x: number, y: number, k = 1, flip = false) {
  const sheet = mount === 'wolf' ? paintWolfSheet() : paintHorseSheet(mount);
  const kind = mount === 'wolf' ? 'wolf' : `horse${mount}`;
  const name = (layer: string) => (mount === 'wolf' ? `wolf-run-side-${i}-${layer}` : `${kind}-run-side-${i}-${layer}`);
  const fr = (layer: string) => sheet.frames.find((f) => f.name === name(layer))!;
  const draw = (layer: string) => {
    const f = fr(layer);
    blit(ctx, sheet.canvas, f.x, f.y, WOLF_W, WOLF_H, x - (WOLF_W * k) / 2, y - WOLF_FEET * k, k, flip);
  };
  const seat = seatOf(kind, 'side');
  draw('b');
  draw('f');
  hero(ctx, o, 'ride-side', i % 16, x + (flip ? -seat.x : seat.x) * k, y + seat.y * k, k, flip);
}
export const mon = (id: string) => MONSTERS[id];
export function monster(ctx: CanvasRenderingContext2D, id: string, anim: 'idle' | 'attack' | 'walk', i: number, x: number, y: number, k = 1, flip = false) {
  const m = mon(id);
  const S = monsterFrameSize(m);
  const img = drawMonsterFrame(m, anim, i).canvas();
  blit(ctx, img, 0, 0, S, S, x - (S * k) / 2, y - S * k, k, flip);
}

// ---------- 地面 ----------
const tileset = canvas(TILESET.width, TILESET.height);
paintTileset(tileset.c);
export function tile(ctx: CanvasRenderingContext2D, ground: (typeof GROUNDS)[number], v: number, x: number, y: number) {
  const i = tileIndex(GROUNDS.indexOf(ground), v);
  const cols = 16;
  const cell = 18;
  ctx.drawImage(tileset.c, (i % cols) * cell + 1, Math.floor(i / cols) * cell + 1, 16, 16, x, y, 16, 16);
}

export function sparkles(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, cols: string[], n: number, salt: number) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = cols[k % cols.length];
    const x = Math.floor(x0 + phash(k, 6, salt) * w);
    const y = Math.floor(y0 + phash(k, 7, salt) * h);
    ctx.fillRect(x, y, 1, 1);
    if (k % 4 === 0) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}

/** 一道山脊：基线 base，起伏 amp，雪线 */
function ridge(ctx: CanvasRenderingContext2D, base: number, amp: number, col: string, salt: number, snow?: string, dark?: string) {
  const hs: number[] = [];
  for (let x = 0; x < W; x++) {
    const f = Math.sin(x / 37 + salt) * 0.5 + Math.sin(x / 13 + salt * 2) * 0.25 + Math.sin(x / 5.3 + salt * 3) * 0.08 + Math.sin(x / 71 + salt) * 0.6;
    hs.push(Math.round(base - amp * (0.5 + f * 0.5)));
  }
  for (let x = 0; x < W; x++) {
    ctx.fillStyle = col;
    ctx.fillRect(x, hs[x], 1, H - hs[x]);
    // 背光的一面
    if (dark && hs[x] < (hs[x + 1] ?? hs[x])) { ctx.fillStyle = dark; ctx.fillRect(x, hs[x], 1, Math.min(18, H - hs[x])); }
    if (snow && hs[x] < base - amp * 0.62) {
      ctx.fillStyle = snow;
      ctx.fillRect(x, hs[x], 1, Math.max(1, Math.round((base - amp * 0.62 - hs[x]) * 0.7)));
    }
  }
  return hs;
}

// ---------- 场景 ----------
/** 宣传图的主场景，w×h 是小画布尺寸（之后整数倍放大）；shadeLeft 左边压暗给文字留地方 */
export function scene(w = 480, h = 270, shadeLeft = true) {
  W = w;
  H = h;
  const { c, ctx } = canvas(W, H);
  const horizon = Math.round(H * 0.62);
  // 天空：上面深蓝夜色，地平线上一抹晚霞
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0b0d26');
  sky.addColorStop(0.45, '#2a2552');
  sky.addColorStop(0.78, '#7a3d5e');
  sky.addColorStop(1, '#f08a4a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  sparkles(ctx, 0, 0, W, horizon * 0.55, ['#ffffff', '#c8d8ff', '#ffe8c0'], 90, 1);
  // 月亮
  ctx.fillStyle = '#fff2d0';
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 49 && (x - 3) * (x - 3) + (y + 2) * (y + 2) > 30) ctx.fillRect(Math.round(W * 0.56) + x, 26 + y, 1, 1);
  glowAt(ctx, Math.round(W * 0.56), 26, 26, 'rgba(255,240,200,0.18)');

  // 远山（苍青色，带雪顶）
  ridge(ctx, horizon - 18, 70, '#33406a', 0.7, '#a8b4d8', '#2a345a');
  // 首领盘踞的山头
  const bx = Math.round(W * 0.8);
  glowAt(ctx, bx, horizon - 70, 90, 'rgba(255,110,40,0.45)');
  // 古龙站在两道山脊之间，下半身被近处的山挡住
  monster(ctx, 'wb_flame_dragon', 'attack', 2, bx, horizon - 16, 1, true);
  sparkles(ctx, bx - 70, horizon - 130, 140, 110, ['#ffd060', '#ff7a30', '#fff0a0'], 40, 5);
  ridge(ctx, horizon + 6, 46, '#2a4a56', 2.1, undefined, '#223c48');

  // 远处的城镇：风车、房子立在山坡上
  ridge(ctx, horizon + 22, 18, '#24503a', 4.2, undefined, '#1d4230');
  const town: [Parameters<typeof paintBuilding>[0], number, number, number][] = [['house2', 5, 4, 0.47], ['windmill', 3, 4, 0.56], ['house', 5, 4, 0.64], ['tower', 3, 6, 0.71]];
  for (const [kind, w, h, fx] of town) {
    const img = paintBuilding(kind, w, h, 1);
    stand(ctx, img, W * fx, horizon + 14, 0.5);
  }
  // 窗户亮着
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = k % 2 ? '#ffd870' : '#ffb850';
    ctx.fillRect(Math.round(W * (0.45 + phash(k, 1, 9) * 0.3)), horizon + 4 + Math.round(phash(k, 2, 9) * 6), 1, 1);
  }

  // 近处草地（游戏里的地砖）
  const gy = horizon + 12;
  for (let y = gy; y < H; y += 16) for (let x = 0; x < W; x += 16) {
    const g = y < gy + 16 ? 'darkgrass' : phash(x, y, 2) > 0.85 ? 'meadow' : 'grass';
    tile(ctx, g, Math.floor(phash(x, y, 3) * 4), x, y);
  }
  // 夜色压暗地砖
  ctx.fillStyle = 'rgba(30,24,70,0.32)';
  ctx.fillRect(0, gy, W, H - gy);
  // 右下角一汪池塘（像素椭圆，带岸边和水波）
  const pcx = Math.round(W * 0.94);
  const pcy = H - 6;
  for (let y = pcy - 30; y < H; y++) for (let x = pcx - 60; x < W; x++) {
    const d = ((x - pcx) / 58) ** 2 + ((y - pcy) / 28) ** 2;
    if (d > 1.12) continue;
    ctx.fillStyle = d > 0.94 ? '#6a5a3a' : d > 0.86 ? '#3a6a8a' : (y + Math.floor(phash(x >> 3, y, 6) * 3)) % 6 === 0 ? '#5a9ac8' : '#2a4e7a';
    ctx.fillRect(x, y, 1, 1);
  }
  glowAt(ctx, pcx, pcy - 8, 30, 'rgba(255,240,200,0.12)');
  // 地平线压暗，近处亮一点
  const fog = ctx.createLinearGradient(0, gy - 4, 0, gy + 30);
  fog.addColorStop(0, 'rgba(240,138,74,0.28)');
  fog.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, gy - 4, W, 34);

  // 树和石头
  const props: [Parameters<typeof paintProp>[0], number, number][] = [
    ['pine', 0.36, gy + 10], ['pine', 0.97, gy + 8], ['oak', 0.995, gy + 34], ['birch', 0.39, gy + 34],
    ['bush', 0.63, gy + 40], ['flowers', 0.78, H - 8], ['tuft', 0.47, H - 20], ['flowers', 0.72, gy + 30], ['rock', 0.78, gy + 18],
  ];
  for (const [kind, fx, y] of props) stand(ctx, paintProp(kind), W * fx, y);

  // 资源点：发光的符文矿、血橡木
  const ore = paintResNode('ore', 5);
  glowAt(ctx, W * 0.58, gy + 14, 18, 'rgba(120,200,255,0.5)');
  stand(ctx, ore, W * 0.58, gy + 22);
  hero(ctx, 1, 'work-mine', 3, W * 0.58 - 18, gy + 24, 1);
  const tree = paintResNode('log', 6);
  glowAt(ctx, W * 0.45, gy + 10, 22, 'rgba(255,122,42,0.4)');
  stand(ctx, tree, W * 0.45, gy + 22);
  hero(ctx, 4, 'work-chop', 2, W * 0.45 + 16, gy + 23, 1, true);

  // 池塘边钓鱼
  hero(ctx, 2, 'work-fish', 6, W * 0.865, H - 24, 1);

  // 右边：组队打一只恐熊
  monster(ctx, 'dire_bear', 'attack', 1, W * 0.93, gy + 36, 1, true);
  hero(ctx, 3, 'fight-sword-ready', 1, W * 0.93 - 34, gy + 38, 1);
  hero(ctx, 8, 'fight-staff-ready', 2, W * 0.93 - 60, gy + 30, 1);
  glowAt(ctx, W * 0.93 - 24, gy + 20, 8, 'rgba(150,210,255,0.9)');
  ctx.fillStyle = '#e8f6ff';
  ctx.fillRect(Math.round(W * 0.93 - 25), gy + 19, 2, 2);

  // 主角骑狼、队友骑马，在路上奔驰
  rider(ctx, 6, 2, 12, W * 0.49, H - 24, 1);
  glowAt(ctx, W * 0.66, H - 50, 70, 'rgba(255,190,110,0.22)');
  rider(ctx, 0, 'wolf', 5, W * 0.66, H - 8, 2);
  // 扬起的尘土
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = `rgba(230,210,170,${0.25 + phash(k, 1, 8) * 0.3})`;
    ctx.fillRect(Math.round(W * 0.66 - 64 - phash(k, 2, 8) * 40), Math.round(H - 14 - phash(k, 3, 8) * 12), 2, 2);
  }
  sparkles(ctx, W * 0.4, gy, W * 0.6, H - gy, ['#fff8c0', '#c0ffb0'], 18, 12);

  // 左边压暗，给文字留地方
  if (shadeLeft) {
  const shade = ctx.createLinearGradient(0, 0, W * 0.5, 0);
  shade.addColorStop(0, 'rgba(6,8,20,0.86)');
  shade.addColorStop(0.65, 'rgba(6,8,20,0.55)');
  shade.addColorStop(1, 'rgba(6,8,20,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W * 0.5, H);
  }
  const vig = ctx.createRadialGradient(W * 0.6, H * 0.55, H * 0.3, W * 0.6, H * 0.55, W * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,10,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  return c;
}

