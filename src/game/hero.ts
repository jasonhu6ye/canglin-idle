import { Pix } from './pix';

/*
 * 主角多帧动画（冒险者造型，衣橱可换配色）：头、身体、双臂、双腿、围巾、行囊分开画，每一帧按姿势参数重新拼一次，
 * 工具和武器跟着手的角度旋转，最后统一描边。生成一张精灵表，交给 Phaser 播放。
 *
 * 角度约定：0 = 朝下，π/2 = 朝前（脸朝的方向），π = 朝上，再大就是往身后。
 */

export const HERO_W = 28;
export const HERO_H = 30;
/** 脚底所在的行，精灵原点放在这里 */
export const HERO_FEET = 27;

/** 一套外观的配色：衣橱里每套皮肤就是一组颜色和几个开关 */
export interface Outfit {
  id: string;
  name: string;
  desc: string;
  skin: string[];
  hair: string[];
  /** 皮背心 / 外衣：暗、中、亮、高光 */
  coat: string[];
  /** 衬衣袖子 */
  shirt: string[];
  pants: string[];
  boots: string[];
  scarf: string[];
  /** 背包、睡袋卷 */
  pack: string[];
  roll: string;
  /** 兜帽代替头发 */
  hood?: boolean;
}

export const OUTFITS: Outfit[] = [
  {
    id: 'adventurer', name: '冒险者', desc: '原皮。皮背心、红围巾、背着行囊的旅人。',
    skin: ['#c8946a', '#f2c9a0'], hair: ['#4a2a18', '#7a4a28', '#a8703a'],
    coat: ['#4a2a18', '#6e4226', '#8e5a34', '#b07a48'], shirt: ['#b8a888', '#e8dcc0'],
    pants: ['#2a3438', '#3e4c52'], boots: ['#2a1a10', '#5a3a22'], scarf: ['#8a1e22', '#c83a32'],
    pack: ['#5a3a22', '#8a6038', '#b08050'], roll: '#4e7a4a',
  },
  {
    id: 'ranger', name: '林地游侠', desc: '绿色斗篷兜帽，适合在林子里打猎。',
    skin: ['#c8946a', '#f2c9a0'], hair: ['#2a3a1a', '#3a5a2a', '#5a7a3a'],
    coat: ['#23381e', '#335230', '#4a7040', '#6a9058'], shirt: ['#8a7a58', '#b8a47a'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#5a4a2a', '#8a7038'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#a08a5a', hood: true,
  },
  {
    id: 'snow', name: '雪原旅人', desc: '白色毛领外套和蓝围巾，冰原上不怕冷。',
    skin: ['#d8a882', '#f8dcc0'], hair: ['#c8b080', '#e0cc98', '#f8ecc0'],
    coat: ['#6a7a90', '#a8b8c8', '#d8e2ec', '#ffffff'], shirt: ['#5a6a80', '#7a8ca4'],
    pants: ['#3a4250', '#525c6e'], boots: ['#4a3a30', '#7a6050'], scarf: ['#2a5a9a', '#4a8ad8'],
    pack: ['#5a5a6a', '#7a7a8c', '#9a9aac'], roll: '#c8382e',
  },
  {
    id: 'shadow', name: '暗影刺客', desc: '黑色紧身装束，深红围巾。',
    skin: ['#b88660', '#e0b890'], hair: ['#141418', '#26262e', '#3a3a46'],
    coat: ['#141418', '#24242c', '#363642', '#50505e'], shirt: ['#2a2a34', '#3e3e4a'],
    pants: ['#16161a', '#24242a'], boots: ['#0e0e10', '#26262c'], scarf: ['#5a0e14', '#9a1a24'],
    pack: ['#26262c', '#3a3a42', '#50505a'], roll: '#5a1a2a', hood: true,
  },
  {
    id: 'noble', name: '王都骑士', desc: '蓝白罩衣配金边，镇上骑士团的制式装扮。',
    skin: ['#c8946a', '#f2c9a0'], hair: ['#c89a3a', '#e8c060', '#fff0a0'],
    coat: ['#1a2a5a', '#2a4088', '#3e5cb8', '#7a98e0'], shirt: ['#a8acb4', '#e0e4ec'],
    pants: ['#3a3a44', '#565662'], boots: ['#3a2a1a', '#6a4a2a'], scarf: ['#b08a2a', '#f0c84a'],
    pack: ['#6a6a74', '#9a9aa4', '#c8c8d0'], roll: '#2a4088',
  },
];
export const outfitOf = (id?: string) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
const GOLD = '#e8b84a';
const EYE = '#1a1a1a';
const WOOD = ['#5a3a22', '#8a5c34'];
const STEEL = ['#6a7078', '#c5cad2', '#ffffff'];

export type HeroDir = 'down' | 'up' | 'side';
export type HeroTool = 'pickaxe' | 'axe' | 'hoe' | 'sickle' | 'rod' | 'hammer' | 'knife' | 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'none';

interface Pose {
  dir: HeroDir;
  /** 整体上下浮动（负数向上） */
  bob?: number;
  /** 下蹲多少像素 */
  crouch?: number;
  /** 侧面：两条腿的摆角；正面/背面：抬脚高度 */
  legF?: number;
  legB?: number;
  /** 侧面手臂角度 */
  armF?: number;
  armB?: number;
  /** 正面/背面手臂上下摆动 */
  armLift?: [number, number];
  tool?: HeroTool;
  /** 工具相对手臂再转多少 */
  toolTurn?: number;
  /** 手往前推出去的像素（刺、拉弓） */
  reach?: number;
  /** 弓弦拉开程度 0-1 */
  draw?: number;
  /** 披风飘动 */
  cape?: number;
  /** 法杖顶端发光 */
  glow?: boolean;
  /** 鱼线：浮漂相对身体的位置 */
  bobber?: [number, number];
}

const v = (a: number, len: number): [number, number] => [Math.sin(a) * len, Math.cos(a) * len];

function thick(p: Pix, x0: number, y0: number, x1: number, y1: number, c: string, w = 2) {
  p.line(x0, y0, x1, y1, c);
  if (w > 1) p.line(x0 + 1, y0, x1 + 1, y1, c);
}

/** 工具：从手的位置沿角度 a 伸出去 */
function drawTool(p: Pix, tool: HeroTool, hx: number, hy: number, a: number, pose: Pose) {
  const along = (t: number) => {
    const [dx, dy] = v(a, t);
    return [hx + dx, hy + dy] as [number, number];
  };
  const perp = (x: number, y: number, t: number) => {
    const [dx, dy] = v(a + Math.PI / 2, t);
    return [x + dx, y + dy] as [number, number];
  };
  const handle = (len: number, c = WOOD) => {
    const [bx, by] = along(-2);
    const [ex, ey] = along(len);
    p.line(bx, by, ex, ey, c[1]);
    return [ex, ey] as [number, number];
  };
  if (tool === 'pickaxe') {
    const [ex, ey] = handle(8);
    const [ax, ay] = perp(ex, ey, 4);
    const [bx, by] = perp(ex, ey, -4);
    const [mx, my] = along(9);
    p.line(ax, ay, mx, my, STEEL[1]);
    p.line(mx, my, bx, by, STEEL[0]);
    p.set(ax, ay, STEEL[2]);
  } else if (tool === 'axe') {
    const [ex, ey] = handle(8);
    for (let i = 0; i < 4; i++) {
      const [x, y] = along(5.5 + i * 0.9);
      const [fx, fy] = perp(x, y, 3.5);
      p.line(x, y, fx, fy, i === 0 ? STEEL[2] : STEEL[1]);
    }
    p.set(ex, ey, STEEL[0]);
  } else if (tool === 'hoe') {
    const [ex, ey] = handle(9);
    const [fx, fy] = perp(ex, ey, 3);
    p.line(ex, ey, fx, fy, STEEL[1]);
  } else if (tool === 'sickle') {
    const [ex, ey] = handle(3);
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI * 0.9;
      const [x, y] = along(3 + Math.sin(t) * 3);
      const [fx, fy] = perp(x, y, (1 - Math.cos(t)) * 2.2);
      p.set(fx, fy, i < 2 ? STEEL[0] : STEEL[1]);
    }
    p.set(ex, ey, STEEL[0]);
  } else if (tool === 'hammer') {
    const [ex, ey] = handle(5);
    for (let i = -1; i <= 1; i++) {
      const [x, y] = perp(ex, ey, i * 1.5);
      p.set(x, y, STEEL[1]);
      const [x2, y2] = along(6);
      const [fx, fy] = perp(x2, y2, i * 1.5);
      p.set(fx, fy, STEEL[0]);
    }
  } else if (tool === 'knife' || tool === 'dagger') {
    handle(0.5);
    const [ex, ey] = along(tool === 'dagger' ? 5 : 4);
    const [sx, sy] = along(1);
    p.line(sx, sy, ex, ey, STEEL[1]);
    if (tool === 'dagger') p.set(sx, sy, GOLD);
  } else if (tool === 'sword') {
    const [gx, gy] = along(1);
    const [ax, ay] = perp(gx, gy, 2);
    const [bx, by] = perp(gx, gy, -2);
    p.line(ax, ay, bx, by, GOLD);
    const [ex, ey] = along(10);
    p.line(gx, gy, ex, ey, STEEL[1]);
    const [hx2, hy2] = along(-2);
    p.line(hx2, hy2, hx, hy, WOOD[0]);
    p.set(ex, ey, STEEL[2]);
  } else if (tool === 'spear') {
    const [ex, ey] = handle(12);
    const [tx, ty] = along(15);
    p.line(ex, ey, tx, ty, STEEL[1]);
    p.set(tx, ty, STEEL[2]);
    const [ax, ay] = perp(ex, ey, 1);
    const [bx, by] = perp(ex, ey, -1);
    p.set(ax, ay, STEEL[0]);
    p.set(bx, by, STEEL[0]);
  } else if (tool === 'staff') {
    const [ex, ey] = handle(11);
    const [ox, oy] = along(12.5);
    p.rect(Math.round(ox) - 1, Math.round(oy) - 1, 3, 3, pose.glow ? '#b8f0ff' : '#5ad8e0');
    p.set(ox, oy, '#ffffff');
    p.set(ex, ey, GOLD);
  } else if (tool === 'rod') {
    const [ex, ey] = handle(13);
    if (pose.bobber) {
      const [bx, by] = pose.bobber;
      p.line(ex, ey, bx, by, '#e8e8e8');
      p.set(bx, by, '#e04a4a');
      p.set(bx, by - 1, '#ffffff');
    }
  } else if (tool === 'bow') {
    // 弓竖在手里，弓背朝前
    for (let i = -7; i <= 7; i++) {
      const bulge = Math.round((1 - (i * i) / 49) * 3);
      p.set(hx + bulge, hy + i, Math.abs(i) > 5 ? WOOD[0] : WOOD[1]);
    }
    const pull = (pose.draw ?? 0) * 5;
    p.line(hx, hy - 7, hx - pull, hy, '#e8e8e8');
    p.line(hx - pull, hy, hx, hy + 7, '#e8e8e8');
    if (pose.draw && pose.draw > 0.2) {
      p.line(hx - pull, hy, hx + 4, hy, WOOD[1]);
      p.set(hx + 4, hy, STEEL[1]);
      p.set(hx + 5, hy, STEEL[2]);
    }
  }
}

function drawFrame(pose: Pose, o: Outfit): Pix {
  const p = new Pix(HERO_W, HERO_H);
  const cx = 13;
  const crouch = pose.crouch ?? 0;
  const bob = (pose.bob ?? 0) + crouch;
  const hipY = 20 + bob;
  const shoulderY = 12 + bob;
  const headY = 7 + bob;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const down = pose.dir === 'down';
  const wave = pose.cape ?? 0;
  const C = o.coat;

  // ---- 围巾尾巴（身后飘） ----
  if (side) {
    p.line(cx - 2, shoulderY, cx - 5, shoulderY + 2 + wave, o.scarf[1]);
    p.line(cx - 2, shoulderY + 1, cx - 6, shoulderY + 3 + wave, o.scarf[0]);
  }

  // ---- 行囊（背在身后） ----
  if (side) {
    p.rect(cx - 5, shoulderY + 1, 3, 6, o.pack[1]);
    p.line(cx - 5, shoulderY + 1, cx - 5, shoulderY + 6, o.pack[0]);
    p.line(cx - 4, shoulderY + 3, cx - 3, shoulderY + 3, o.pack[2]);
    p.rect(cx - 6, shoulderY - 1, 4, 2, o.roll);
    p.set(cx - 6, shoulderY - 1, o.pack[0]);
  } else if (up) {
    p.rect(cx - 3, shoulderY + 1, 7, 7, o.pack[1]);
    p.line(cx - 3, shoulderY + 8, cx + 3, shoulderY + 8, o.pack[0]);
    p.rect(cx - 2, shoulderY + 4, 5, 2, o.pack[2]);
    p.set(cx, shoulderY + 5, GOLD);
    p.rect(cx - 4, shoulderY - 1, 9, 2, o.roll);
  }

  // ---- 后面的手臂 ----
  const armLen = 6;
  if (side) {
    const a = pose.armB ?? 0;
    const sx = cx - 1;
    const sy = shoulderY + 1;
    const [dx, dy] = v(a, armLen);
    thick(p, sx, sy, sx + dx * 0.55, sy + dy * 0.55, o.shirt[0]);
    thick(p, sx + dx * 0.55, sy + dy * 0.55, sx + dx, sy + dy, o.coat[0]);
    p.set(sx + dx, sy + dy, o.skin[0]);
  }

  // ---- 腿 ----
  const legLen = 7 - Math.min(crouch, 3);
  if (side) {
    const leg = (a: number, back: boolean) => {
      const [dx, dy] = v(a, legLen);
      const fx = cx + dx;
      const fy = hipY + dy;
      thick(p, cx, hipY, fx, fy, back ? o.pants[0] : o.pants[1]);
      p.rect(Math.round(fx), Math.round(fy) - 1, 3, 3, back ? o.boots[0] : o.boots[1]);
      p.set(Math.round(fx) + 2, Math.round(fy) + 1, back ? o.boots[0] : o.boots[1]);
      if (!back) p.set(Math.round(fx), Math.round(fy) - 1, o.boots[0]);
    };
    leg((pose.legB ?? 0) - crouch * 0.12, true);
    leg((pose.legF ?? 0) + crouch * 0.2, false);
  } else {
    const leg = (x: number, lift: number) => {
      const bottom = hipY + legLen - Math.round(lift);
      p.rect(x, hipY, 2, bottom - hipY, o.pants[1]);
      p.set(x + (x < cx ? 0 : 1), hipY + 1, o.pants[0]);
      p.rect(x, bottom - 1, 2, 3, up ? o.boots[0] : o.boots[1]);
      p.line(x, bottom - 1, x + 1, bottom - 1, o.boots[0]);
    };
    leg(cx - 3, pose.legB ?? 0);
    leg(cx + 1, pose.legF ?? 0);
  }

  // ---- 身体：衬衣 + 敞开的皮背心 ----
  for (let y = shoulderY; y <= hipY + 1; y++) {
    const k = (y - shoulderY) / (hipY + 1 - shoulderY);
    const hw = side ? 2 + (k > 0.6 ? 1 : 0) : 3 + (k > 0.7 ? 1 : 0);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const s = side ? (x - cx) / (hw + 0.5) : -(x - cx) / (hw + 0.5);
      p.set(x, y, s > 0.5 ? C[3] : s > -0.2 ? C[2] : s > -0.7 ? C[1] : C[0]);
    }
  }
  // 衬衣：正面露出中间一条，侧面露在胸前
  if (down) {
    p.line(cx, shoulderY + 1, cx, shoulderY + 4, o.shirt[1]);
    p.line(cx + 1, shoulderY + 1, cx + 1, shoulderY + 3, o.shirt[0]);
  } else if (side) {
    p.line(cx + 2, shoulderY + 1, cx + 2, shoulderY + 4, o.shirt[1]);
  }
  // 背带
  if (down) {
    p.line(cx - 2, shoulderY, cx - 2, shoulderY + 4, o.pack[0]);
    p.line(cx + 3, shoulderY, cx + 3, shoulderY + 4, o.pack[0]);
  } else if (side) {
    p.line(cx - 1, shoulderY, cx + 1, shoulderY + 5, o.pack[0]);
  }
  // 腰带、扣子和挂包
  const beltY = shoulderY + 5;
  p.line(cx - (side ? 2 : 3), beltY, cx + (side ? 3 : 4), beltY, '#2e1c10');
  if (!up) p.set(cx + (side ? 2 : 0), beltY, GOLD);
  if (down) p.rect(cx + 2, beltY + 1, 2, 2, o.pack[1]);
  if (side) p.rect(cx - 2, beltY + 1, 2, 2, o.pack[1]);
  // 下摆
  p.line(cx - (side ? 3 : 4), hipY + 1, cx + (side ? 3 : 4), hipY + 1, C[0]);

  // ---- 头 ----
  const H = o.hair;
  const hr = 4.2;
  // 先画整颗头（头发色），再在前面挖出脸
  for (let y = Math.floor(headY - hr); y <= headY + hr; y++) {
    for (let x = Math.floor(cx - hr); x <= cx + hr + 1; x++) {
      const dx = x - cx - 0.5;
      const dy = y - headY;
      if (dx * dx + dy * dy > hr * hr + 1) continue;
      const s = (side ? dx : -dx) * 0.4 - dy * 0.5;
      const pal = o.hood ? C : H;
      p.set(x, y, s > 1.3 ? pal[o.hood ? 3 : 2] : s > -0.7 ? pal[o.hood ? 2 : 1] : pal[0]);
    }
  }
  const S = o.skin;
  if (down) {
    p.rect(cx - 2, headY - 1, 6, 5, S[1]);
    p.line(cx - 2, headY + 3, cx + 3, headY + 3, S[0]);
    p.set(cx - 1, headY + 1, EYE);
    p.set(cx + 2, headY + 1, EYE);
    p.set(cx - 2, headY + 2, '#e89a88');
    p.set(cx + 3, headY + 2, '#e89a88');
    // 刘海
    if (!o.hood) {
      p.line(cx - 2, headY - 1, cx + 3, headY - 1, H[1]);
      p.set(cx - 1, headY, H[1]);
      p.set(cx + 2, headY, H[0]);
    } else {
      p.line(cx - 2, headY - 1, cx + 3, headY - 1, C[0]);
    }
  } else if (side) {
    p.rect(cx + 1, headY - 1, 4, 5, S[1]);
    p.line(cx + 1, headY + 3, cx + 4, headY + 3, S[0]);
    p.set(cx + 3, headY + 1, EYE);
    p.set(cx + 5, headY + 1, S[1]);
    p.set(cx + 4, headY + 2, '#e89a88');
    if (!o.hood) {
      p.line(cx + 1, headY - 1, cx + 4, headY - 1, H[1]);
      p.set(cx + 1, headY, H[1]);
      p.set(cx, headY + 1, S[0]);
      // 发梢往后飘
      p.set(cx - 4, headY + 1 + Math.round(wave * 0.5), H[0]);
      p.set(cx - 5, headY + Math.round(wave * 0.5), H[1]);
    } else {
      p.line(cx + 1, headY - 1, cx + 4, headY - 1, C[0]);
      p.set(cx - 4, headY - 3, C[2]);
      p.set(cx - 5, headY - 2 + Math.round(wave * 0.5), C[1]);
    }
  } else if (!o.hood) {
    p.line(cx - 2, headY + 3, cx + 3, headY + 4, H[0]);
  }
  // 围巾绕脖子
  p.line(cx - 3, shoulderY - 1, cx + 3, shoulderY - 1, o.scarf[1]);
  p.line(cx - 2, shoulderY, cx + 2, shoulderY, o.scarf[0]);
  if (down) {
    p.set(cx + 2, shoulderY + 1, o.scarf[1]);
    p.set(cx + 2, shoulderY + 2 + Math.round(wave * 0.5), o.scarf[0]);
  }

  // ---- 前面的手臂和工具 ----
  if (side) {
    const a = pose.armF ?? 0;
    const sx = cx + 1 + (pose.reach ?? 0) * 0.3;
    const sy = shoulderY + 1;
    const [dx, dy] = v(a, armLen);
    const hx = sx + dx + (pose.reach ?? 0) * 0.7;
    const hy = sy + dy;
    const tool = pose.tool ?? 'none';
    if (tool !== 'none') drawTool(p, tool, hx, hy, a + (pose.toolTurn ?? 0), pose);
    // 袖子到手肘，小臂戴皮护腕
    const ex = sx + (hx - sx) * 0.55;
    const ey = sy + (hy - sy) * 0.55;
    thick(p, sx, sy, ex, ey, o.shirt[1]);
    thick(p, ex, ey, hx, hy, C[1]);
    p.set(hx, hy, S[1]);
    p.set(hx + 1, hy, S[0]);
  } else {
    const [l, r] = pose.armLift ?? [0, 0];
    const arm = (x: number, lift: number) => {
      p.rect(x, shoulderY + 1 - lift, 2, 3, up ? o.shirt[0] : o.shirt[1]);
      p.rect(x, shoulderY + 4 - lift, 2, 3, up ? C[0] : C[1]);
      if (!up) p.rect(x, shoulderY + 7 - lift, 2, 1, S[1]);
    };
    arm(cx - 6, l);
    arm(cx + 5, r);
  }
  return p.outline();
}

// ---- 动作表 ----

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
/** 关键帧插值：[时间, 值] */
function keys(k: [number, number][], t: number) {
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  }
  return k[k.length - 1][1];
}

export interface HeroAnim { key: string; frames: number; rate: number; pose: (t: number, i: number) => Pose }

const walk = (dir: HeroDir): HeroAnim => ({
  key: `walk-${dir}`, frames: 12, rate: 18,
  pose: (t) => {
    const s = Math.sin(t * TAU);
    const bob = Math.abs(Math.cos(t * TAU)) > 0.7 ? 0 : -1;
    return dir === 'side'
      ? { dir, bob, legF: s * 0.6, legB: -s * 0.6, armF: -s * 0.55, armB: s * 0.55, cape: 1 + Math.abs(s) }
      : { dir, bob, legF: Math.max(0, s) * 2, legB: Math.max(0, -s) * 2, armLift: [Math.round(Math.max(0, s)), Math.round(Math.max(0, -s))], cape: s };
  },
});

const idle = (dir: HeroDir): HeroAnim => ({
  key: `idle-${dir}`, frames: 8, rate: 6,
  pose: (t) => ({ dir, bob: Math.sin(t * TAU) > 0.5 ? 1 : 0, armF: 0.1 + Math.sin(t * TAU) * 0.05, armB: -0.1, cape: Math.round(1 + Math.sin(t * TAU)) }),
});

/** 双手挥动的工具：从 from 抡到 to */
const swing = (key: string, tool: HeroTool, from: number, to: number, crouch = 0, frames = 8): HeroAnim => ({
  key, frames, rate: 10,
  pose: (t) => {
    const a = keys([[0, to + 0.3], [0.45, from], [0.62, to], [1, to + 0.3]], t);
    return { dir: 'side', tool, armF: a, armB: a - 0.25, crouch: crouch + (t > 0.55 && t < 0.8 ? 1 : 0), legF: 0.35, legB: -0.3, cape: t > 0.5 ? 2 : 0 };
  },
});

export const HERO_ANIMS: HeroAnim[] = [
  walk('down'), walk('up'), walk('side'),
  idle('down'), idle('up'), idle('side'),
  swing('work-mine', 'pickaxe', 3.7, 1.1),
  swing('work-chop', 'axe', 3.2, 1.5),
  swing('work-farm', 'hoe', 2.9, 0.9, 1),
  {
    key: 'work-gather', frames: 6, rate: 8,
    pose: (t) => ({ dir: 'side', tool: 'sickle', crouch: 3, armF: keys([[0, 1.0], [0.5, 1.9], [1, 1.0]], t), armB: 0.6, legF: 0.6, legB: -0.5 }),
  },
  {
    key: 'work-skin', frames: 6, rate: 8,
    pose: (t) => ({ dir: 'side', tool: 'knife', crouch: 3, armF: 1.1 + Math.sin(t * TAU) * 0.35, toolTurn: 0.4, armB: 0.9, legF: 0.6, legB: -0.5 }),
  },
  {
    key: 'work-craft', frames: 6, rate: 9,
    pose: (t) => ({ dir: 'side', tool: 'hammer', armF: keys([[0, 1.3], [0.4, 2.5], [0.6, 1.1], [1, 1.3]], t), armB: 1.2, legF: 0.2, legB: -0.2, bob: t > 0.55 && t < 0.75 ? 1 : 0 }),
  },
  {
    key: 'work-fish', frames: 10, rate: 7,
    pose: (t, i) => {
      const casting = t < 0.4;
      const a = casting ? keys([[0, 1.6], [0.2, 3.3], [0.4, 1.9]], t) : 1.9 + (i % 2 ? 0.05 : 0);
      return {
        dir: 'side', tool: 'rod', armF: a, armB: a - 0.2, toolTurn: 0.2, legF: 0.25, legB: -0.2,
        bobber: casting ? undefined : [26, 25 + (i % 3 === 0 ? 1 : 0)],
      };
    },
  },
  {
    key: 'work-steal', frames: 6, rate: 7,
    pose: (t) => ({ dir: 'side', crouch: 2, armF: keys([[0, 1.2], [0.5, 1.7], [1, 1.2]], t), reach: keys([[0, 0], [0.5, 3], [1, 0]], t), armB: -0.4, legF: 0.5, legB: -0.5, cape: 1 }),
  },
  {
    key: 'fight-sword', frames: 8, rate: 12,
    pose: (t) => {
      const a = keys([[0, 0.8], [0.35, 3.5], [0.55, 1.0], [1, 0.8]], t);
      return { dir: 'side', tool: 'sword', armF: a, armB: 0.3, legF: 0.5, legB: -0.4, cape: t > 0.4 ? 2 : 0, crouch: t > 0.5 && t < 0.7 ? 1 : 0 };
    },
  },
  {
    key: 'fight-spear', frames: 8, rate: 12,
    pose: (t) => ({ dir: 'side', tool: 'spear', armF: 1.55, armB: 1.3, reach: keys([[0, -2], [0.4, -3], [0.55, 5], [1, -2]], t), legF: 0.55, legB: -0.5, cape: 1 }),
  },
  {
    key: 'fight-dagger', frames: 8, rate: 14,
    pose: (t) => ({ dir: 'side', tool: 'dagger', armF: keys([[0, 1.0], [0.25, 2.2], [0.4, 1.4], [0.6, 2.2], [0.75, 1.4], [1, 1.0]], t), reach: keys([[0, 0], [0.4, 2], [0.75, 2], [1, 0]], t), armB: 0.4, legF: 0.5, legB: -0.4, crouch: 1 }),
  },
  {
    key: 'fight-bow', frames: 8, rate: 10,
    pose: (t) => ({ dir: 'side', tool: 'bow', armF: 1.57, armB: 1.5, draw: keys([[0, 0], [0.6, 1], [0.7, 0], [1, 0]], t), legF: 0.4, legB: -0.4 }),
  },
  {
    key: 'fight-staff', frames: 8, rate: 10,
    pose: (t) => ({ dir: 'side', tool: 'staff', armF: keys([[0, 1.0], [0.4, 2.6], [0.6, 1.6], [1, 1.0]], t), toolTurn: keys([[0, 2.2], [0.4, 0.4], [0.6, 0], [1, 2.2]], t), glow: t > 0.45 && t < 0.75, armB: 0.2, legF: 0.3, legB: -0.3, cape: t > 0.45 ? 2 : 0 }),
  },
];

/** 生成整张精灵表；frames 里是每帧在表上的位置 */
export function paintHeroSheet(outfit: Outfit = OUTFITS[0], canvas = document.createElement('canvas')) {
  const total = HERO_ANIMS.reduce((n, a) => n + a.frames, 0);
  const cols = 16;
  const rows = Math.ceil(total / cols);
  canvas.width = cols * HERO_W;
  canvas.height = rows * HERO_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of HERO_ANIMS) {
    for (let i = 0; i < a.frames; i++) {
      const x = (k % cols) * HERO_W;
      const y = Math.floor(k / cols) * HERO_H;
      ctx.clearRect(x, y, HERO_W, HERO_H);
      ctx.drawImage(drawFrame(a.pose(i / a.frames, i), outfit).canvas(), x, y);
      frames.push({ name: `${a.key}-${i}`, x, y });
      k++;
    }
  }
  return { canvas, frames, total };
}
