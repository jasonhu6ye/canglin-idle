import { mix, phash, Pix, ramp } from './pix';

/*
 * 主角多帧动画（冒险者造型，衣橱可换配色）：头、身体、双臂、双腿、围巾、行囊分开画，每一帧按姿势参数重新拼一次，
 * 工具和武器跟着手的角度旋转，最后描一圈跟着底色走的深色边。生成一张精灵表，交给 Phaser 播放。
 *
 * 每个部件都当成球或圆柱体，按左上方的光算法线明暗，分成五阶（最暗、暗、中、亮、高光）。
 * 侧面的腿和手臂有膝盖、手肘两节；脚始终踩在地上，身体高度由支撑腿算出来，所以走路自然起伏。
 *
 * 角度约定：0 = 朝下，π/2 = 朝前（脸朝的方向），π = 朝上，再大就是往身后。
 */

export const HERO_W = 28;
export const HERO_H = 30;
/** 脚底所在的行，精灵原点放在这里 */
export const HERO_FEET = 27;
/** 地图上的主角精灵表用几倍精度 */
export const HERO_RES = 2;

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
  /** 镇上的村民：不背行囊 */
  npc?: boolean;
  /** 兑换码限定外观：大头 Q 版造型，用两倍精度单独画（见 drawChibi），hair 是头部主色 */
  head?: 'pumpkin' | 'voidpumpkin' | 'paleknight' | 'jester' | 'bone';
  /** 发光色（眼睛、脸、火、粒子）：暗、中、亮 */
  glow?: string[];
  /** 粒子特效 */
  fx?: 'embers' | 'wisps' | 'sparks' | 'mist' | 'confetti';
  /** 要用这个兑换码解锁 */
  code?: string;
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
  // ---- 兑换码「为爱发电」解锁的五套（用户 10-23 给的参考图和录屏，按本作画法重画） ----
  {
    id: 'pumpkin', name: '南瓜提灯人', desc: '雕着笑脸的南瓜头，眼里的火一明一暗；破旧的灰绿斗篷，手提一盏冒火星的油灯。',
    skin: ['#5a4a3a', '#7a6650'], hair: ['#8a2408', '#c8440e', '#f06a1a', '#ff9a3a'],
    coat: ['#1e2420', '#2e3a32', '#46564a', '#6a7a6c'], shirt: ['#2a2018', '#40321f'],
    pants: ['#1a1a18', '#2a2a26'], boots: ['#141412', '#2e2a24'], scarf: ['#3a4a3a', '#5a6e58'],
    pack: ['#2a2018', '#3e3024', '#5a4632'], roll: '#3a4a3a',
    head: 'pumpkin',
    glow: ['#e88a10', '#ffe04a', '#fffce8'], fx: 'embers', code: '为爱发电',
  },
  {
    id: 'voidpumpkin', name: '幽蓝南瓜', desc: '烧成焦黑的南瓜头里亮着幽蓝的鬼火，偶尔闪过一丝红光；提灯里的火也是冷的。',
    skin: ['#3a3a40', '#5a5a62'], hair: ['#16161c', '#26262e', '#3a3a44', '#565662'],
    coat: ['#1a201e', '#283430', '#3c4c46', '#5c6e66'], shirt: ['#1e1e22', '#2e2e34'],
    pants: ['#141416', '#222226'], boots: ['#0e0e10', '#24242a'], scarf: ['#2e3e38', '#4a6058'],
    pack: ['#1e1e22', '#2e2e34', '#44444c'], roll: '#2e3e38',
    head: 'voidpumpkin',
    glow: ['#1a6ab0', '#4ab0ff', '#c8f0ff'], fx: 'wisps', code: '为爱发电',
  },
  {
    id: 'paleknight', name: '白发魔骑', desc: '一头乱翘的白发，灰白的脸上一双红眼；黑铁铠甲配一面染血的木盾，脚下缠着暗红的雾。',
    skin: ['#6a6e78', '#a8acb6'], hair: ['#8a909a', '#c8ccd6', '#eef0f6', '#ffffff'],
    coat: ['#141418', '#26262e', '#3c3c48', '#6a6a7a'], shirt: ['#4a4a56', '#9a9aa8'],
    pants: ['#16161a', '#28282e'], boots: ['#0e0e10', '#2a2a30'], scarf: ['#2a2228', '#4a3a40'],
    pack: ['#4a2a1a', '#6e3e22', '#8e5a34'], roll: '#4a2a1a',
    head: 'paleknight',
    glow: ['#8a0e0e', '#ff3a2a', '#ffb08a'], fx: 'mist', code: '为爱发电',
  },
  {
    id: 'jester', name: '红黑小丑', desc: '红黑两色的分叉小丑帽挂着银铃，白面具上画着红泪痕；菱格衣服，走到哪都撒红色的纸花。',
    skin: ['#c8c8d0', '#f4f4f8'], hair: ['#2a2a32', '#44444e', '#62626e', '#8a8a96'],
    coat: ['#141418', '#26262e', '#3a3a44', '#585864'], shirt: ['#8a0e14', '#e01e28'],
    pants: ['#1e1e24', '#34343c'], boots: ['#7a0a10', '#c81a22'], scarf: ['#b8b8c4', '#ffffff'],
    pack: ['#26262e', '#3a3a44', '#585864'], roll: '#8a0e14',
    head: 'jester',
    glow: ['#8a0e14', '#ff2a3a', '#ffd0d0'], fx: 'confetti', code: '为爱发电',
  },
  {
    id: 'bone', name: '骸骨术士', desc: '戴着兽骨头盔、肩披骨甲，眼窝里燃着青色的魂火，身边飘着点点灵光。',
    skin: ['#8a7e6a', '#d8ccb4'], hair: ['#8a7e6a', '#c8bca4', '#ece2cc', '#fffaf0'],
    coat: ['#1a1a1e', '#2c2a2a', '#4a4440', '#6a6258'], shirt: ['#a89a84', '#e8dece'],
    pants: ['#241c16', '#3a2e24'], boots: ['#141010', '#2e2420'], scarf: ['#1a6a5a', '#3aa890'],
    pack: ['#3a2e24', '#5a4634', '#7a6248'], roll: '#5a2a1a',
    head: 'bone',
    glow: ['#1a8aa0', '#5ae0f0', '#e0ffff'], fx: 'sparks', code: '为爱发电',
  },
];
/** 兑换码解锁的外观 */
export const OUTFIT_CODES = new Set(OUTFITS.map((o) => o.code).filter(Boolean) as string[]);

const SKIN = ['#c8946a', '#f2c9a0'];
/** 镇上走动的村民，用和主角同一套画法，只换配色、不背行囊 */
export const NPC_OUTFITS: Record<string, Outfit> = {
  villager: {
    id: 'npc-villager', name: '村民', desc: '', npc: true,
    skin: SKIN, hair: ['#1e1612', '#3a2a20', '#5a4232'],
    coat: ['#6a2a1e', '#9a3e2a', '#c05a3a', '#e07a52'], shirt: ['#b8a888', '#e8dcc0'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#8a6a1a', '#c8a03a'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#8a6a1a',
  },
  villager2: {
    id: 'npc-villager2', name: '村民', desc: '', npc: true,
    skin: ['#d8a882', '#f8dcc0'], hair: ['#a8803a', '#d0a850', '#f0d080'],
    coat: ['#1e3a6a', '#2a5a90', '#3a7ac0', '#6aa0e0'], shirt: ['#c8c8c8', '#f4f4f0'],
    pants: ['#3a3a44', '#565662'], boots: ['#3a2a1a', '#6a4a2a'], scarf: ['#a89060', '#e8d0a0'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#2a5a90',
  },
  villager3: {
    id: 'npc-villager3', name: '村民', desc: '', npc: true,
    skin: ['#a8704a', '#d8a078'], hair: ['#5a2414', '#8a3a1e', '#b05a2a'],
    coat: ['#23401e', '#3a6a32', '#5aa04a', '#80c068'], shirt: ['#a89878', '#d8c8a0'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#4a3020', '#7a5030'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#5aa04a',
  },
  guard: {
    id: 'npc-guard', name: '卫兵', desc: '', npc: true,
    skin: SKIN, hair: ['#4a5058', '#8a9098', '#c8ced6'],
    coat: ['#3e444c', '#62666e', '#8a8f99', '#c0c6ce'], shirt: ['#2a3a6a', '#3a4a7a'],
    pants: ['#2a2a34', '#3e3e4a'], boots: ['#2a1a10', '#4a3020'], scarf: ['#2a3a6a', '#4a5a9a'],
    pack: ['#2a3a6a', '#3a4a7a', '#5a6a9a'], roll: '#3a4a7a',
  },
  merchant: {
    id: 'npc-merchant', name: '商人', desc: '', npc: true,
    skin: SKIN, hair: ['#5a5a5a', '#8a8a8a', '#c0c0c0'],
    coat: ['#3a1458', '#5a2080', '#8a3ab0', '#b070d8'], shirt: ['#b8a888', '#e8dcc0'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#b08a2a', '#f0c84a'],
    pack: ['#6a4a1a', '#9a6a2a', '#c8903a'], roll: '#8a3ab0',
  },
};
export const outfitOf = (id?: string) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
const GOLD = ['#8a5a1a', '#c8902a', '#f0c050', '#fff0a0'];
const EYE = '#20141c';
const WOOD = ['#3a2414', '#6a4426', '#9a6a3c'];
const STEEL = ['#3e444c', '#7a828c', '#bcc4ce', '#f4f8fc'];
const BELT = ['#1e120a', '#3a2414', '#5a3a20'];

export type HeroDir = 'down' | 'up' | 'side';
export type HeroTool = 'pickaxe' | 'axe' | 'hoe' | 'sickle' | 'rod' | 'hammer' | 'knife' | 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'none';

interface Pose {
  dir: HeroDir;
  /** 上半身上下浮动（呼吸，负数向上） */
  bob?: number;
  /** 正面/背面整个人跳起多少（负数向上） */
  hop?: number;
  /** 下蹲多少像素 */
  crouch?: number;
  /** 侧面：两条大腿的摆角；正面/背面：抬脚高度 */
  legF?: number;
  legB?: number;
  /** 侧面膝盖弯曲 */
  kneeF?: number;
  kneeB?: number;
  /** 侧面手臂角度 */
  armF?: number;
  armB?: number;
  /** 侧面手肘弯曲（往前弯） */
  elbowF?: number;
  elbowB?: number;
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
  /** 眨眼 */
  blink?: boolean;
  /** 生成精灵表时填：动作名、这一帧的进度 0-1、整张表里的帧序号（Q 版外观的晃动、闪烁、特效用） */
  key?: string;
  t?: number;
  seed?: number;
}

const v = (a: number, len: number): [number, number] => [Math.sin(a) * len, Math.cos(a) * len];

// ---- 明暗 ----

/** 光从左上前方来 */
const LX = -0.55, LY = -0.6, LZ = 0.58;
/** 按法线挑色阶；dim 让背后的手脚整体暗一阶 */
function tone(R: string[], nx: number, ny: number, dim = 0) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const s = nx * LX + ny * LY + nz * LZ;
  const i = s > 0.9 ? 4 : s > 0.7 ? 3 : s > 0.38 ? 2 : s > 0.08 ? 1 : 0;
  return R[Math.max(0, Math.min(4, i - dim))];
}

/** 有明暗的椭球；clip 返回 false 的像素跳过 */
function ball(p: Pix, cx: number, cy: number, rx: number, ry: number, R: string[], dim = 0, clip?: (x: number, y: number) => boolean) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1 || (clip && !clip(x, y))) continue;
      p.set(x, y, tone(R, nx, ny, dim));
    }
  }
}

/** 圆柱（胶囊）：手臂、腿、围巾、睡袋卷 */
function capsule(p: Pix, x0: number, y0: number, x1: number, y1: number, r: number, R: string[], dim = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = Math.floor(Math.min(y0, y1) - r); y <= Math.ceil(Math.max(y0, y1) + r); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - r); x <= Math.ceil(Math.max(x0, x1) + r); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
      const ex = px - (x0 + dx * t);
      const ey = py - (y0 + dy * t);
      if (ex * ex + ey * ey > r * r) continue;
      p.set(x, y, tone(R, ex / r, ey / r, dim));
    }
  }
}

/** 两个像素宽、一边亮一边暗的杆子 */
function rod(p: Pix, x0: number, y0: number, x1: number, y1: number, a: number, R: string[]) {
  const [ox, oy] = v(a - Math.PI / 2, 0.7);
  p.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, R[0]);
  p.line(x0, y0, x1, y1, R[1]);
  if (R[2]) p.line(x0 - ox * 0.2, y0 - oy * 0.2, x1 - ox * 0.2, y1 - oy * 0.2, R[2]);
}

/** 工具：从手的位置沿角度 a 伸出去 */
function drawTool(p: Pix, tool: HeroTool, hx: number, hy: number, a: number, pose: Pose) {
  const K = 1;
  const along = (t: number) => {
    const [dx, dy] = v(a, t * K);
    return [hx + dx, hy + dy] as [number, number];
  };
  const perp = (x: number, y: number, t: number) => {
    const [dx, dy] = v(a + Math.PI / 2, t * K);
    return [x + dx, y + dy] as [number, number];
  };
  const handle = (from: number, to: number, R = WOOD) => {
    const [bx, by] = along(from);
    const [ex, ey] = along(to);
    rod(p, bx, by, ex, ey, a, R);
    return [ex, ey] as [number, number];
  };
  /** 沿着工具方向画一排金属 */
  const strip = (t: number, p0: number, p1: number, cols: (k: number) => string) => {
    const [x, y] = along(t);
    const n = Math.ceil(Math.abs(p1 - p0) * K * 1.5) + 1;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const [fx, fy] = perp(x, y, p0 + (p1 - p0) * k);
      p.set(fx, fy, cols(k));
    }
  };
  if (tool === 'pickaxe') {
    handle(-2, 8);
    // 弯弯的镐头，两头尖
    for (let i = -10; i <= 10; i++) {
      const k = i / 10;
      const [x, y] = along(8.4 + (1 - k * k) * 1.1);
      const [fx, fy] = perp(x, y, k * 4.6);
      p.set(fx, fy, Math.abs(k) > 0.85 ? STEEL[3] : k < 0 ? STEEL[2] : STEEL[1]);
      const [gx, gy] = perp(...along(7.8 + (1 - k * k) * 1.1), k * 4.2);
      if (Math.abs(k) < 0.8) p.set(gx, gy, STEEL[0]);
    }
  } else if (tool === 'axe') {
    handle(-2, 9);
    for (let i = 0; i <= 5; i++) {
      const flare = i === 0 || i === 5 ? 0.6 : 0;
      strip(5.4 + i * 0.75, 0.5, 3.4 + flare, (k) => (k > 0.8 ? STEEL[3] : k > 0.4 ? STEEL[2] : STEEL[1]));
    }
    strip(9.4, -0.6, 0.6, () => STEEL[0]);
  } else if (tool === 'hoe') {
    handle(-2, 10);
    strip(10, -0.3, 3.2, (k) => (k > 0.75 ? STEEL[3] : STEEL[2]));
    strip(9.3, 0, 3, () => STEEL[0]);
  } else if (tool === 'sickle') {
    handle(-1, 3, [WOOD[0], WOOD[2]]);
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI * 0.95;
      const [x, y] = along(3 + Math.sin(t) * 3.2);
      const [fx, fy] = perp(x, y, (1 - Math.cos(t)) * 2.4);
      p.set(fx, fy, i < 3 ? STEEL[1] : i > 10 ? STEEL[3] : STEEL[2]);
    }
  } else if (tool === 'hammer') {
    handle(-1.5, 5.5);
    for (let t = 5.5; t <= 7.6; t += 0.5) strip(t, -2, 2, (k) => (t > 7.2 ? STEEL[0] : k < 0.3 ? STEEL[3] : k < 0.7 ? STEEL[2] : STEEL[1]));
  } else if (tool === 'knife' || tool === 'dagger') {
    handle(-1, 0.8, [WOOD[0], WOOD[1]]);
    if (tool === 'dagger') strip(1, -1.1, 1.1, (k) => GOLD[k < 0.5 ? 2 : 1]);
    const [sx, sy] = along(1.4);
    const [ex, ey] = along(tool === 'dagger' ? 6 : 4.6);
    rod(p, sx, sy, ex, ey, a, [STEEL[1], STEEL[2], STEEL[3]]);
    p.set(ex, ey, STEEL[3]);
  } else if (tool === 'sword') {
    handle(-2.4, 0.4, [WOOD[0], WOOD[1]]);
    p.set(...along(-2.8), GOLD[2]);
    strip(0.8, -2.3, 2.3, (k) => (k < 0.15 || k > 0.85 ? GOLD[1] : GOLD[2]));
    const [bx, by] = along(1.6);
    const [ex, ey] = along(10.5);
    rod(p, bx, by, ex, ey, a, [STEEL[1], STEEL[2], STEEL[3]]);
    p.set(ex, ey, STEEL[3]);
    p.set(...along(11.2), STEEL[2]);
  } else if (tool === 'spear') {
    handle(-3, 12.5);
    // 枪缨
    p.set(...perp(...along(12.2), 0.8), '#c83a32');
    p.set(...perp(...along(11.6), 1.2), '#8a1e22');
    for (let t = 12.8; t <= 16.4; t += 0.4) {
      const w = t < 14 ? (t - 12.8) * 1.0 : (16.4 - t) * 0.55;
      strip(t, -w, w, (k) => (k < 0.5 ? STEEL[3] : STEEL[1]));
    }
  } else if (tool === 'staff') {
    handle(-3, 9);
    const [ox, oy] = along(10.4);
    const orb = pose.glow ? ['#3a8ab0', '#6ad0f0', '#b8f0ff', '#e8fcff', '#ffffff'] : ['#1a5a7a', '#2a8aa8', '#5ad8e0', '#a8f0f0', '#ffffff'];
    if (pose.glow) for (let i = 0; i < 8; i++) p.set(ox + Math.cos(i * 0.785) * 2.8, oy + Math.sin(i * 0.785) * 2.8, '#b8f0ff');
    ball(p, ox, oy, 1.6, 1.6, orb);
    strip(9.2, -1.4, 1.4, () => GOLD[2]);
  } else if (tool === 'rod') {
    handle(-2, 9);
    const [ex, ey] = handle(9, 15, [WOOD[1], WOOD[2]]);
    if (pose.bobber) {
      const [bx, by] = pose.bobber;
      p.line(ex, ey, bx, by, '#d8dce0');
      p.set(bx, by, '#e04a4a');
      p.set(bx, by - 1, '#ffffff');
    }
  } else if (tool === 'bow') {
    // 弓竖在手里，弓背朝前
    const pull = (pose.draw ?? 0) * 5;
    p.line(hx, hy - 7, hx - pull, hy, '#e8e8e8');
    p.line(hx - pull, hy, hx, hy + 7, '#e8e8e8');
    for (let i = -7; i <= 7; i++) {
      const bulge = (1 - (i * i) / 49) * 3;
      p.set(hx + bulge, hy + i, Math.abs(i) > 5 ? WOOD[0] : i < 0 ? WOOD[2] : WOOD[1]);
      p.set(hx + bulge + 1, hy + i, WOOD[0]);
    }
    p.rect(Math.round(hx + 2), Math.round(hy) - 1, 2, 2, '#e0d0a8');
    if (pose.draw && pose.draw > 0.2) {
      p.line(hx - pull, hy, hx + 4, hy, WOOD[2]);
      p.set(hx + 5, hy, STEEL[2]);
      p.set(hx + 6, hy, STEEL[3]);
      p.set(hx - pull - 1, hy - 1, '#e8e8e8');
      p.set(hx - pull - 1, hy + 1, '#e8e8e8');
    }
  }
}

interface Ramps { skin: string[]; hair: string[]; coat: string[]; shirt: string[]; pants: string[]; boots: string[]; scarf: string[]; pack: string[]; roll: string[] }
const rampCache = new Map<string, Ramps>();
/** 头发不要太亮：亮阶往中间收一点，高光用原来的亮阶 */
const soft = (r: string[]) => [r[0], r[1], r[2], mix(r[2], r[3], 0.55), r[3]];
/** 脸基本是平的亮肤色，只有右边和下巴暗一阶 */
const faceRamp = (S: string[]) => [S[1], S[2], S[3], S[3], S[4]];
function rampsOf(o: Outfit): Ramps {
  let r = rampCache.get(o.id);
  if (!r) {
    r = {
      skin: ramp(o.skin), hair: soft(ramp(o.hair)), coat: ramp(o.coat), shirt: ramp(o.shirt), pants: ramp(o.pants),
      boots: ramp(o.boots), scarf: ramp(o.scarf), pack: ramp(o.pack), roll: ramp([mix(o.roll, '#000000', 0.35), o.roll]),
    };
    rampCache.set(o.id, r);
  }
  return r;
}

/** 刘海的锯齿：每一列往下垂多少 */
const BANGS = [1.4, 0.4, 0.9, 1.6, 0.5, 1.2, 0.3, 1.0, 1.5, 0.6, 1.1];

function drawHead(p: Pix, o: Outfit, R: Ramps, cx: number, cy: number, pose: Pose) {
  const { dir } = pose;
  const side = dir === 'side';
  const wave = pose.cape ?? 0;
  const hood = !!o.hood;
  const HR = hood ? R.coat : R.hair;
  const hx = side ? cx + 0.5 : cx;
  // 头发 / 兜帽的整体
  if (side) {
    if (hood) capsule(p, cx - 3.8, cy - 2.2, cx - 6.2, cy + 0.4 + wave * 0.4, 1.3, HR, 1);
    else capsule(p, cx - 3.4, cy + 0.5, cx - 5.4, cy + 2.4 + wave * 0.5, 1.1, HR, 1);
  }
  ball(p, cx, cy - 0.3, hood ? 5.1 : 4.9, hood ? 5 : 4.7, HR);
  if (!hood) {
    // 几缕发丝：在头发上压一道暗线
    const strand = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        const c = p.get(x, y);
        if (c && (c === HR[3] || c === HR[2])) p.set(x, y, HR[1]);
      }
    };
    if (dir !== 'up') strand(hx + 0.5, cy - 4.4, hx - 2, cy - 2);
    else {
      strand(hx - 1, cy - 4, hx - 1.4, cy + 3.4);
      strand(hx + 1.6, cy - 3.6, hx + 2, cy + 3.4);
    }
  }
  const S = R.skin;
  const fy = cy + 0.9;
  const ey = Math.round(cy + 1.1);
  const bangY = (x: number) => cy - 1 + (hood ? 0 : BANGS[(x - Math.round(cx) + 5 + 11) % 11] * 0.7);
  /** 刘海下面一行皮肤压暗，像头发的投影 */
  const bangShadow = (x0: number, x1: number) => {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const y = Math.ceil(bangY(x) - 0.5);
      if (S.includes(p.get(x, y) ?? '')) p.set(x, y, S[1]);
    }
  };
  const blush = mix(S[3], '#e05050', 0.35);
  const lip = mix(S[1], '#7a2a2a', 0.3);
  if (dir === 'down') {
    ball(p, hx, fy, 3.8, 3.5, faceRamp(S), 0, (x, y) => {
      if (y + 0.5 < bangY(x)) return false;
      const edge = Math.abs(x + 0.5 - hx);
      return !(edge > (hood ? 3.1 : 2.9) && y < cy + (hood ? 3 : 2));
    });
    bangShadow(hx - 3, hx + 2);
    const eL = Math.round(hx - 2);
    const eR = Math.round(hx + 1);
    for (const x of [eL, eR]) {
      if (pose.blink) p.set(x, ey + 1, S[0]);
      else {
        p.set(x, ey, EYE);
        p.set(x, ey + 1, EYE);
      }
    }
    p.set(eL - 1, ey + 2, blush);
    p.set(eR + 1, ey + 2, blush);
    p.set(Math.round(hx - 0.5), ey + 2, lip);
  } else if (side) {
    const fx = hx + 1.1;
    ball(p, fx, fy, 3.6, 3.5, [S[2], S[3], S[3], S[3], S[4]], 0, (x, y) => x + 0.5 > hx - 0.2 && y + 0.5 >= bangY(x) && !(hood && x + 0.5 < hx + 1.2));
    bangShadow(hx, fx + 3);
    const ex = Math.round(hx + 2.4);
    if (pose.blink) p.set(ex, ey + 1, S[0]);
    else {
      p.set(ex, ey, EYE);
      p.set(ex, ey + 1, EYE);
    }
    p.set(ex - 1, ey + 2, blush);
    p.set(ex + 1, ey + 2, lip);
    if (!hood) p.set(Math.round(hx - 0.4), ey + 1, S[1]);
  } else if (!hood) {
    // 背面：后颈露一点皮肤
    p.set(Math.round(cx - 1), Math.round(cy + 4.2), S[1]);
    p.set(Math.round(cx), Math.round(cy + 4.2), S[1]);
  }
}

function drawFrame(pose: Pose, o: Outfit): Pix {
  const p = new Pix(HERO_W, HERO_H);
  const R = rampsOf(o);
  const cx = 14;
  const crouch = pose.crouch ?? 0;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const down = pose.dir === 'down';
  const wave = pose.cape ?? 0;
  const ground = HERO_FEET - 0.8;

  // ---- 先算腿：侧面两节腿，身体高度由更低的那只脚决定 ----
  const THIGH = 3.4;
  const SHIN = 3.2;
  const legs = side
    ? ([
      [(pose.legB ?? 0) + crouch * 0.1, (pose.kneeB ?? 0.1) + crouch * 0.3],
      [(pose.legF ?? 0) + crouch * 0.18, (pose.kneeF ?? 0.1) + crouch * 0.32],
    ] as const)
    : [];
  const reachDown = (a: number, k: number) => THIGH * Math.cos(a) + SHIN * Math.cos(a - k);
  const hipY = side
    ? ground - Math.max(...legs.map(([a, k]) => reachDown(a, k)))
    : ground - 6 + crouch + (pose.hop ?? 0);
  const sy = hipY - 7.4 + (pose.bob ?? 0);
  const headY = sy - 4.6;
  const C = R.coat;

  // ---- 围巾尾巴（身后飘） ----
  if (side) {
    capsule(p, cx - 2, sy + 0.3, cx - 6.2, sy + 1.8 + wave, 0.9, R.scarf);
    capsule(p, cx - 2, sy + 1, cx - 5.4, sy + 3.6 + wave * 0.7, 0.75, R.scarf, 1);
  }

  // ---- 行囊（侧面背在身后） ----
  const pack = (l: number, t: number, w: number, h: number) => {
    for (let y = Math.floor(t); y < t + h; y++) {
      for (let x = Math.floor(l); x < l + w; x++) {
        const nx = ((x + 0.5 - l) / w) * 2 - 1;
        const ny = y < t + 1 ? -0.7 : y >= t + h - 1 ? 0.6 : 0;
        p.set(x, y, tone(R.pack, nx * 0.85, ny));
      }
    }
  };
  if (side && !o.npc) {
    pack(cx - 5.9, sy + 0.8, 3.8, 6.2);
    p.line(cx - 5.6, sy + 2.8, cx - 2.4, sy + 2.8, R.pack[0]);
    p.set(cx - 4, sy + 3.8, GOLD[2]);
    capsule(p, cx - 6.6, sy, cx - 3, sy, 1.35, R.roll);
    p.line(cx - 5, sy - 1.2, cx - 5, sy + 1.2, R.pack[0]);
  }

  // ---- 后面的手臂 ----
  const UPPER = 3.2;
  const FORE = 3.3;
  const sideArm = (a: number, elbow: number, reach: number, dim: number) => {
    const sx = cx + 0.3 + reach * 0.3;
    const syy = sy + 1.1;
    const [ux, uy] = v(a, UPPER);
    const ex = sx + ux;
    const eY = syy + uy;
    const [fx, fy] = v(a + elbow, FORE);
    const hx = ex + fx + reach * 0.7;
    const hy = eY + fy;
    return {
      hx, hy, a: a + elbow,
      draw: () => {
        capsule(p, sx, syy, ex, eY, 1.3, R.shirt, dim);
        capsule(p, ex, eY, hx, hy, 1.2, C, dim);
        ball(p, hx, hy, 1.05, 1.05, R.skin, dim);
      },
    };
  };
  if (side) sideArm(pose.armB ?? 0, pose.elbowB ?? 0, 0, 1).draw();

  // ---- 腿 ----
  if (side) {
    legs.forEach(([a, k], i) => {
      const dim = i === 0 ? 1 : 0;
      const [tx, ty] = v(a, THIGH);
      const kx = cx + tx;
      const ky = hipY + ty;
      const [sx, sy2] = v(a - k, SHIN);
      const ax = kx + sx;
      const ay = ky + sy2;
      capsule(p, cx, hipY, kx, ky, 1.5, R.pants, dim);
      capsule(p, kx, ky, ax, ay, 1.3, R.pants, dim);
      // 靴子：靴筒加脚掌，脚尖朝前
      const [bx, by] = v(a - k, SHIN - 1.9);
      capsule(p, kx + bx, ky + by, ax, ay, 1.45, R.boots, dim);
      capsule(p, ax - 0.3, ay + 0.2, ax + 1.8, ay + 0.3, 1.05, R.boots, dim);
    });
  } else {
    const leg = (x: number, lift: number) => {
      const ay = ground - Math.max(0, lift);
      capsule(p, x, hipY, x, ay, 1.3, R.pants);
      capsule(p, x, ay - 1.9, x, ay, 1.45, up ? R.boots.map((_, i) => R.boots[Math.max(0, i - 1)]) : R.boots);
      ball(p, x, ay + 0.3, 1.6, 1, R.boots);
    };
    leg(cx - 2, pose.legB ?? 0);
    leg(cx + 2, pose.legF ?? 0);
  }

  // ---- 身体：衬衣 + 敞开的皮背心 ----
  const beltY = Math.round(sy + 5);
  const openAt = (k: number) => 0.8 + Math.max(0, 0.45 - k) * 1.8;
  for (let y = Math.floor(sy); y <= Math.ceil(hipY); y++) {
    const k = (y + 0.5 - sy) / (hipY + 0.6 - sy);
    if (k < 0 || k > 1) continue;
    let l: number, r: number;
    if (side) {
      l = cx - 2.6 - (k > 0.75 ? 0.3 : 0);
      r = cx + 2.8 - (k > 0.45 && k < 0.72 ? 0.4 : 0) + (k > 0.75 ? 0.2 : 0);
    } else {
      const hw = k < 0.1 ? 3.4 : k < 0.6 ? 4 - k : 3.4 + (k - 0.6);
      l = cx - hw;
      r = cx + hw;
    }
    const ny = k < 0.12 ? -0.65 : k > 0.88 ? 0.35 : 0;
    for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
      const px = x + 0.5;
      if (px < l || px > r) continue;
      const nx = ((px - (l + r) / 2) / ((r - l) / 2)) * 0.92;
      let pal = C;
      if (y < beltY) {
        if (down && Math.abs(px - cx) < openAt(k)) pal = R.shirt;
        if (side && px > r - 1.4 && k < 0.6) pal = R.shirt;
      }
      p.set(x, y, tone(pal, nx, ny));
    }
  }
  if (down) {
    // 背心翻领：贴着衬衣的一列亮边
    for (let y = Math.floor(sy + 1); y < beltY; y++) {
      const open = openAt((y + 0.5 - sy) / (hipY - sy));
      p.set(Math.floor(cx - open - 0.5), y, C[3]);
      p.set(Math.ceil(cx + open - 0.5), y, C[2]);
    }
    // 背带
    if (!o.npc) {
      p.line(cx - 2.6, sy + 0.5, cx - 2.6, beltY - 1, R.pack[1]);
      p.line(cx + 2.4, sy + 0.5, cx + 2.4, beltY - 1, R.pack[0]);
    }
  } else if (side && !o.npc) {
    p.line(cx - 1.1, sy + 0.3, cx + 1.1, beltY - 0.5, R.pack[1]);
    p.line(cx - 1.8, sy + 0.6, cx + 0.4, beltY, R.pack[0]);
  }
  // 腰带、铜扣、挂包
  const bl = cx - (side ? 2.7 : 3.7);
  const br = cx + (side ? 2.9 : 3.7);
  p.line(bl, beltY, br, beltY, BELT[2]);
  p.line(bl, beltY + 1, br, beltY + 1, BELT[1]);
  if (down) {
    p.set(cx - 1, beltY, GOLD[3]);
    p.set(cx, beltY, GOLD[2]);
    p.set(cx - 1, beltY + 1, GOLD[1]);
    p.set(cx, beltY + 1, GOLD[1]);
    ball(p, cx + 2.8, beltY + 2, 1.3, 1.1, R.pack);
  } else if (side) {
    p.set(cx + 2, beltY, GOLD[3]);
    p.set(cx + 2, beltY + 1, GOLD[1]);
    ball(p, cx - 1.8, beltY + 2, 1.3, 1.2, R.pack);
  }

  // ---- 正面 / 背面的手臂 ----
  if (!side) {
    const [l, r] = pose.armLift ?? [0, 0];
    const arm = (x: number, lift: number) => {
      const top = sy + 1.1;
      const end = sy + 6.6 - lift;
      capsule(p, x, top, x, top + 2.8, 1.35, R.shirt);
      capsule(p, x, top + 2.8, x, end, 1.25, C);
      if (!up) ball(p, x, end + 0.5, 1.1, 1.05, R.skin);
    };
    arm(cx - 4.4, l);
    arm(cx + 4.4, r);
  }

  // ---- 背面：大背包压在身上 ----
  if (up && !o.npc) {
    pack(cx - 3.7, sy + 1, 7.4, 7);
    for (let x = Math.floor(cx - 3.4); x <= Math.ceil(cx + 2.9); x++) {
      p.set(x, sy + 3.6, R.pack[0]);
      p.set(x, sy + 2.8, R.pack[3]);
    }
    p.set(cx - 1, sy + 4, GOLD[3]);
    p.set(cx, sy + 4, GOLD[1]);
    ball(p, cx - 2.6, sy + 6.2, 1.2, 1.3, R.pack, 1);
    ball(p, cx + 2.6, sy + 6.2, 1.2, 1.3, R.pack, 1);
  }

  // ---- 围巾绕脖子 ----
  capsule(p, cx - (side ? 2.2 : 3), sy - 0.2, cx + (side ? 2.7 : 3), sy - 0.2, 1.2, R.scarf);
  if (down) capsule(p, cx + 1.8, sy + 0.6, cx + 2.1 + wave * 0.2, sy + 3.8, 0.85, R.scarf);

  // ---- 头 ----
  drawHead(p, o, R, cx, headY, pose);

  if (up && !o.npc) capsule(p, cx - 4.3, sy - 0.2, cx + 4.3, sy - 0.2, 1.5, R.roll);

  // ---- 前面的手臂和工具 ----
  if (side) {
    const arm = sideArm(pose.armF ?? 0, pose.elbowF ?? 0, pose.reach ?? 0, 0);
    const tool = pose.tool ?? 'none';
    if (tool !== 'none') drawTool(p, tool, arm.hx, arm.hy, arm.a + (pose.toolTurn ?? 0), pose);
    arm.draw();
  }
  return p.outlineTinted();
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
  key: `walk-${dir}`, frames: 16, rate: 24,
  pose: (t) => {
    const s = Math.sin(t * TAU);
    const c = Math.cos(t * TAU);
    if (dir === 'side') {
      // 往前摆的那条腿抬膝，着地的腿伸直；手臂和腿反着摆，往前摆时手肘多弯一点
      return {
        dir, legF: s * 0.52, legB: -s * 0.52,
        kneeF: 0.12 + Math.max(0, c) * 0.95, kneeB: 0.12 + Math.max(0, -c) * 0.95,
        armF: -s * 0.5, armB: s * 0.5, elbowF: 0.3 + Math.max(0, -s) * 0.45, elbowB: 0.3 + Math.max(0, s) * 0.45,
        cape: 1 + Math.abs(s),
      };
    }
    return {
      dir, hop: Math.abs(s) > 0.55 ? -1 : 0, legF: Math.max(0, s) * 2.4, legB: Math.max(0, -s) * 2.4,
      armLift: [Math.max(0, s) * 1.6, Math.max(0, -s) * 1.6], cape: s,
    };
  },
});

const idle = (dir: HeroDir): HeroAnim => ({
  key: `idle-${dir}`, frames: 8, rate: 6,
  pose: (t, i) => ({
    dir, bob: Math.sin(t * TAU) > 0.3 ? 1 : 0, legF: 0.12, legB: -0.1, armF: 0.1 + Math.sin(t * TAU) * 0.05, armB: -0.1,
    elbowF: 0.25, elbowB: 0.2, cape: Math.round(1 + Math.sin(t * TAU)), blink: i === 5,
  }),
});

/** 双手挥动的工具：从 from 抡到 to */
const swing = (key: string, tool: HeroTool, from: number, to: number, crouch = 0, frames = 8): HeroAnim => ({
  key, frames, rate: 10,
  pose: (t) => {
    const a = keys([[0, to + 0.3], [0.45, from], [0.62, to], [1, to + 0.3]], t);
    return { dir: 'side', tool, armF: a, armB: a - 0.25, crouch: crouch + (t > 0.55 && t < 0.8 ? 1 : 0), legF: 0.35, legB: -0.3, cape: t > 0.5 ? 2 : 0 };
  },
});

/** 骑在狼背上（坐骑「Chinese can fly」）：大腿往前跨，小腿垂下，手往前抓鬃毛；跑起来随狼背起伏 */
const ride = (dir: HeroDir, run: boolean): HeroAnim => ({
  // 跑的时候和狼的步子同一个周期（0.5 秒）；身体起伏由地图场景按狼背的高度整体挪
  key: `ride${run ? '' : 'idle'}-${dir}`, frames: run ? 16 : 8, rate: run ? 32 : 6,
  pose: (t, i) => {
    const s = Math.sin(t * TAU);
    const bob = 0;
    if (dir === 'side') {
      return {
        dir, bob, legF: 1.25, legB: 1.05, kneeF: 1.45, kneeB: 1.35,
        armF: run ? 1.0 + s * 0.12 : 0.7, armB: run ? 0.9 : 0.6, elbowF: 0.7, elbowB: 0.7,
        cape: run ? 2 + (i % 2) : 1, blink: !run && i === 5,
      };
    }
    return { dir, bob, legF: 1, legB: 1, armLift: [run ? 1 : 0.5, run ? 1 : 0.5], cape: run ? 2 : 0, blink: !run && i === 5 };
  },
});

export const HERO_ANIMS: HeroAnim[] = [
  walk('down'), walk('up'), walk('side'),
  idle('down'), idle('up'), idle('side'),
  ride('side', true), ride('down', true), ride('up', true),
  ride('side', false), ride('down', false), ride('up', false),
  {
    // 上下坐骑时跳一下：缩腿、张手
    key: 'jump-side', frames: 6, rate: 12,
    pose: (t) => ({ dir: 'side', legF: keys([[0, 0.3], [0.5, 1.2], [1, 0.9]], t), legB: keys([[0, -0.3], [0.5, 0.9], [1, 0.7]], t), kneeF: 1.4, kneeB: 1.4, armF: keys([[0, 0.4], [0.5, 2.4], [1, 1.0]], t), armB: keys([[0, -0.3], [0.5, 2.0], [1, 0.8]], t), cape: 2 }),
  },
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
  // 背对 / 面朝镜头钓鱼（水在上方或下方）：双手举竿，竿和鱼线由地图场景另外画
  ...(['up', 'down'] as const).map((dir): HeroAnim => ({
    key: `work-fish-${dir}`, frames: 10, rate: 7,
    pose: (t, i) => {
      const casting = t < 0.4;
      const lift = casting ? keys([[0, 1.4], [0.2, 3.2], [0.4, 2.0]], t) : 2.0 + (i % 2 ? 0.2 : 0);
      return { dir, armLift: [lift, lift - 0.4], legF: 0, legB: 0, cape: casting ? 1 : 0 };
    },
  })),
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
/** 村民只要走路和待机 */
export const NPC_ANIMS = HERO_ANIMS.filter((a) => a.key.startsWith('walk-') || a.key.startsWith('idle-'));

/**
 * res = 每个游戏像素用几个像素画：地图上的主角用 2（限定外观按两倍精度画，普通外观放大两倍，贴图再缩回原大小），
 * 村民和小图标用 1。
 */
export function paintHeroSheet(outfit: Outfit = OUTFITS[0], canvas = document.createElement('canvas'), anims = HERO_ANIMS, res = 1) {
  const total = anims.reduce((n, a) => n + a.frames, 0);
  const cols = 16;
  const rows = Math.ceil(total / cols);
  const FW = HERO_W * res;
  const FH = HERO_H * res;
  canvas.width = cols * FW;
  canvas.height = rows * FH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of anims) {
    for (let i = 0; i < a.frames; i++) {
      const x = (k % cols) * FW;
      const y = Math.floor(k / cols) * FH;
      ctx.clearRect(x, y, FW, FH);
      const pose = a.pose(i / a.frames, i);
      pose.key = a.key;
      pose.t = i / a.frames;
      pose.seed = k;
      ctx.drawImage((outfit.head ? drawChibi(pose, outfit) : drawFrame(pose, outfit)).canvas(), x, y, FW, FH);
      frames.push({ name: `${a.key}-${i}`, x, y });
      k++;
    }
  }
  return { canvas, frames, total, res };
}

// ======================================================================
// 兑换码限定外观（用户 10-23 给参考图和录屏）：大头 Q 版造型，两倍精度（56×60）单独画，贴到地图上再缩回 28×30。
// 动作照录屏：待机时大头左右轻晃、肩上的破斗篷跟着呼吸起伏、手里的火一明一暗、脸偶尔换个表情；
// 走路时袍子下摆来回摆、两只脚从袍子底下交替露出来。侧面、背面、干活、战斗、骑狼都用同一套部件。
// ======================================================================

const X2W = HERO_W * 2;
const X2H = HERO_H * 2;
/** 两倍精度下脚底最后一行 */
const X2FEET = HERO_FEET * 2 + 1;

type ChibiItem = 'blade' | 'flame' | 'orb' | 'shield' | 'staff' | 'wand' | 'fist';
interface ChibiStyle {
  /** 长袍：最暗 → 亮 */
  robe: string[];
  /** 肩上的破斗篷 / 披肩 */
  mantle: string[];
  /** 手（骨手、手套） */
  hand: string[];
  left: ChibiItem;
  right: ChibiItem;
}
const CHIBI: Record<NonNullable<Outfit['head']>, ChibiStyle> = {
  pumpkin: {
    robe: ['#120e0b', '#1e1711', '#2a2017', '#3a2c1e'], mantle: ['#26302a', '#3e4c42', '#5e6e60', '#8a9a88'],
    hand: ['#7a7262', '#b8b098', '#e8e2cc'], left: 'blade', right: 'flame',
  },
  voidpumpkin: {
    robe: ['#111114', '#1b1b20', '#26262c', '#36363e'], mantle: ['#22302b', '#36483f', '#567062', '#82a092'],
    hand: ['#7a7a74', '#b8b8b0', '#e8e8e0'], left: 'blade', right: 'orb',
  },
  paleknight: {
    robe: ['#101014', '#1c1c24', '#2c2c36', '#46465a'], mantle: ['#141418', '#24242c', '#383844', '#5a5a6c'],
    hand: ['#2a2a34', '#4a4a58', '#7a7a8c'], left: 'shield', right: 'fist',
  },
  jester: {
    robe: ['#121216', '#20202a', '#30303a', '#46465a'], mantle: ['#16161c', '#26262e', '#3a3a46', '#5a5a68'],
    hand: ['#a8a8b8', '#e0e0ea', '#ffffff'], left: 'fist', right: 'wand',
  },
  bone: {
    robe: ['#141218', '#221e1e', '#322c28', '#48403a'], mantle: ['#3a3228', '#6e6252', '#b0a48c', '#e8dfca'],
    hand: ['#7a6e5c', '#b8ac94', '#ece2cc'], left: 'staff', right: 'orb',
  },
};

/** 填三角形（脸上的眼睛、牙） */
function tri(p: Pix, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, col: (x: number, y: number) => string | null) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const s = (x0: number, y0: number, x1: number, y1: number, x: number, y: number) => (x - x1) * (y0 - y1) - (x0 - x1) * (y - y1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d1 = s(px, py, ax, ay, bx, by);
      const d2 = s(px, py, bx, by, cx, cy);
      const d3 = s(px, py, cx, cy, ax, ay);
      if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
      const c = col(x, y);
      if (c) p.set(x, y, c);
    }
  }
}

/** 只在已经画了某组颜色的像素上画（脸上的五官不会画到头外面） */
const onto = (p: Pix, R: string[], x: number, y: number, c: string) => {
  if (R.includes(p.get(x, y) ?? '')) p.set(x, y, c);
};

function chibiHead(p: Pix, o: Outfit, hx: number, hy: number, pose: Pose) {
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const H = ramp(o.hair);
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  const f = flicker(pose);
  const lit = f > 0.55 ? G[2] : G[1];
  const mid = f > 0.3 ? G[1] : G[0];
  const t = pose.t ?? 0;

  if (o.head === 'pumpkin' || o.head === 'voidpumpkin') {
    const rx = side ? 12 : 13.2;
    ball(p, hx, hy, rx, 10.4, H);
    // 竖棱：一道暗槽，左边贴一道亮边，南瓜就鼓起来了
    for (const k of side ? [-0.55, -0.1, 0.38, 0.78] : [-0.7, -0.36, 0, 0.36, 0.7]) {
      for (let y = Math.floor(hy - 9.4); y <= Math.ceil(hy + 9.4); y++) {
        const yy = (y + 0.5 - hy) / 10.4;
        if (Math.abs(yy) > 0.97) continue;
        const x = Math.round(hx + k * rx * Math.sqrt(1 - yy * yy) - 0.5);
        onto(p, H, x, y, H[1]);
        if (k <= 0) onto(p, H, x + 1, y, H[3]);
        else onto(p, H, x - 1, y, H[2]);
      }
    }
    // 高光
    for (const [dx, dy] of [[-8, -6], [-7, -6], [-8, -5], [-9, -4]]) onto(p, H, Math.round(hx + dx), Math.round(hy + dy), H[4]);
    // 弯梗和一片叶
    const STEM = o.head === 'pumpkin' ? ['#14280e', '#24461a', '#3a6e28', '#5a9a3a', '#86c860'] : ['#10140f', '#1c2620', '#2c3c32', '#44584c', '#62806e'];
    capsule(p, hx - 0.5, hy - 8.6, hx + 0.6, hy - 13.4, 1.9, STEM);
    capsule(p, hx + 0.6, hy - 13.4, hx + 3, hy - 14.6, 1.2, STEM);
    ball(p, hx + 5.2, hy - 10.8, 3, 1.5, STEM.map((c) => mix(c, '#3a7a2a', 0.25)));
    if (up) return;
    const red = o.head === 'voidpumpkin' && oddFrame(pose);
    const eye = (x: number, y: number, cx: number, cy: number) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      return red ? (d < 2 ? '#ffb08a' : '#e8241c') : d < 2.2 ? lit : d < 3.6 ? mid : G[0];
    };
    const fx = side ? hx + 4.5 : hx;
    if (o.head === 'pumpkin' && oddFrame(pose)) {
      // 「哦？」：圆眼 + 小圆嘴（录屏里偶尔会换这个表情）
      for (const ex of side ? [2] : [-5, 5]) ball(p, fx + ex, hy - 1.5, 2.4, 2.6, [G[0], G[1], G[1], G[2], G[2]]);
      ball(p, fx + (side ? 3 : 0), hy + 5, 1.8, 1.8, [G[0], G[1], G[1], G[2], G[2]]);
      return;
    }
    // 斜着往里压的三角眼
    const eyes: [number, number, number, number, number, number][] = side
      ? [[fx + 0.5, hy - 4, fx + 6.5, hy + 0.5, fx + 0.5, hy + 1.6]]
      : [[fx - 10, hy - 4.2, fx - 2.6, hy + 0.6, fx - 9.6, hy + 1.6], [fx + 10, hy - 4.2, fx + 2.6, hy + 0.6, fx + 9.6, hy + 1.6]];
    for (const [ax, ay, bx, by, cx2, cy2] of eyes) {
      const ccx = (ax + bx + cx2) / 3;
      const ccy = (ay + by + cy2) / 3 + 0.6;
      tri(p, ax, ay, bx, by, cx2, cy2, (x, y) => (H.includes(p.get(x, y) ?? '') ? eye(x, y, ccx, ccy) : null));
    }
    // 锯齿大嘴：上下两排牙（牙是南瓜皮的颜色）
    const m0 = side ? fx - 1 : fx - 8.5;
    const m1 = side ? fx + 8 : fx + 8.5;
    const mc = (m0 + m1) / 2;
    for (let x = Math.floor(m0); x <= Math.ceil(m1); x++) {
      const u = (x + 0.5 - mc) / ((m1 - m0) / 2);
      if (Math.abs(u) > 1) continue;
      const top = hy + 3.2 + u * u * -1.6;
      const bot = hy + 7.4 - u * u * 2.4;
      for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
        if (y + 0.5 < top || y + 0.5 > bot) continue;
        const tooth = (y < top + 2.2 && Math.abs(((x - Math.round(mc) + 40) % 5) - 2) < 1 && Math.abs(u) < 0.8) || (y > bot - 2.2 && ((x - Math.round(mc) + 40) % 5) === 0 && Math.abs(u) < 0.6);
        if (tooth) continue;
        const d = Math.abs(u) * 0.7 + Math.abs(y + 0.5 - (top + bot) / 2) / 4;
        onto(p, H, x, y, red ? '#e8241c' : d < 0.35 ? lit : d < 0.7 ? mid : G[0]);
      }
    }
    return;
  }

  if (o.head === 'paleknight') {
    // 乱翘的白发：一圈尖刺往上往两边翘，额前一排刘海；灰白的脸，红眼
    const spikes = up ? [-2.1, -1.55, -1.0, -0.5, 0, 0.5, 1.0, 1.55, 2.1] : side ? [-2.4, -1.85, -1.3, -0.75, -0.2, 0.35, 0.9] : [-2.0, -1.5, -0.95, -0.45, 0.05, 0.55, 1.05, 1.55, 2.05];
    spikes.forEach((a, i) => {
      const len = 10 + ((i * 5) % 3) * 1.6;
      const dx = Math.sin(a) * len * 1.12;
      const dy = -Math.cos(a) * len;
      for (let k = 0; k <= 1; k += 0.06) ball(p, hx + dx * k, hy - 3 + dy * k, 2.9 * (1 - k) + 0.6, 2.9 * (1 - k) + 0.6, H);
    });
    ball(p, hx, hy - 2.6, 11.6, 8.4, H);
    // 发丝：几道弯弯的暗线
    for (let s = -3; s <= 3; s++) {
      for (let k = 0; k < 7; k++) {
        const x = Math.round(hx + s * 3.2 + Math.sin(k * 0.6 + s) * 1.2);
        const y = Math.round(hy - 9 + k * 1.3);
        onto(p, H, x, y, H[s % 2 ? 1 : 2]);
      }
    }
    if (up) return;
    const S = ramp(o.skin);
    const fx = side ? hx + 3 : hx;
    const bang = (x: number) => hy - 1.6 + [0, 2.4, 1, 3, 0.6, 2, 1.4][((Math.round(x) % 7) + 7) % 7];
    ball(p, fx, hy + 3.6, side ? 7.4 : 8.6, 6.8, faceRamp(S), 0, (x, y) => y + 0.5 >= bang(x) && (!side || x + 0.5 > hx - 1));
    // 红眼：眉骨一道暗影，眼睛两格，亮的时候中间一点发白
    const eyes = side ? [Math.round(hx + 6)] : [Math.round(hx - 5), Math.round(hx + 3)];
    const glowEye = f > 0.6;
    for (const x of eyes) {
      p.set(x - 1, hy + 2, S[1]);
      p.set(x, hy + 2, S[1]);
      p.set(x + 1, hy + 2, S[1]);
      if (pose.blink) { p.set(x, hy + 4, S[0]); p.set(x + 1, hy + 4, S[0]); continue; }
      p.set(x, hy + 3, '#e8241c');
      p.set(x + 1, hy + 3, '#e8241c');
      p.set(x, hy + 4, '#a01010');
      p.set(x + 1, hy + 4, glowEye ? '#ffb08a' : '#e8241c');
    }
    const my = Math.round(hy + 7.4);
    for (let i = 0; i < 3; i++) p.set(Math.round(side ? hx + 5 : hx - 1.5) + i, my, S[0]);
    return;
  }

  if (o.head === 'jester') {
    // 分叉小丑帽：左红右黑两只角往外卷，角尖挂银铃；白面具、红泪痕、咧嘴笑
    const RED = ramp(['#7a0a10', '#c81a22', '#ff3a44']);
    const BLK = ramp(['#1e1e24', '#34343c', '#52525c']);
    const BELL = ['#5a5a66', '#9a9aa6', '#d8d8e0', '#f4f4f8', '#ffffff'];
    const wob = Math.sin(t * TAU) * 1.2;
    const horn = (sgn: number, R2: string[], dim: number) => {
      const pts: [number, number][] = [[3, -7.6], [8.4, -11.6], [13.2, -12 + wob * 0.4], [16.2, -8.6 + wob * 0.8], [16.6, -4 + wob]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        capsule(p, hx + sgn * x0, hy + y0, hx + sgn * x1, hy + y1, 3.2 - i * 0.45, R2, dim);
      }
      const [bx, by] = pts[pts.length - 1];
      ball(p, hx + sgn * bx, hy + by + 2.6, 2.5, 2.5, BELL);
    };
    if (side) horn(-1, BLK, 1);
    else {
      horn(-1, up ? BLK : RED, 0);
      horn(1, up ? RED : BLK, 0);
    }
    ball(p, hx, hy - 4.6, 10.4, 6.4, BLK, 0, (_, y) => y < hy - 0.5);
    capsule(p, hx, hy - 9, hx + 1.4, hy - 15, 2.2, up ? RED : BLK);
    ball(p, hx + 1.8, hy - 16, 2.2, 2.2, BELL);
    if (side) horn(1, RED, 0);
    // 帽檐：一道红边，上面一排小菱形
    for (let x = Math.round(hx - 9.5); x <= Math.round(hx + 9); x++) {
      p.set(x, Math.round(hy - 1.4), RED[3]);
      p.set(x, Math.round(hy - 0.4), RED[1]);
      if ((x + 40) % 4 === 0) p.set(x, Math.round(hy - 2.6), RED[2]);
    }
    if (up) return;
    const S = ramp(o.skin);
    const fx = side ? hx + 2.4 : hx;
    ball(p, fx, hy + 4.4, side ? 7.4 : 8.6, 6.4, [S[1], S[2], S[3], S[4], S[4]], 0, (x, y) => y >= hy + 0.6 && (!side || x + 0.5 > hx - 1));
    const eyes = side ? [Math.round(hx + 5.6)] : [Math.round(hx - 5), Math.round(hx + 3)];
    for (const x of eyes) {
      if (pose.blink) { p.set(x, hy + 4, EYE); p.set(x + 1, hy + 4, EYE); continue; }
      // 弯弯的眯眼
      p.set(x - 1, hy + 4, EYE);
      p.set(x, hy + 3, EYE);
      p.set(x + 1, hy + 3, EYE);
      p.set(x + 2, hy + 4, EYE);
    }
    // 右眼下一颗红菱形泪痕
    const tx = eyes[eyes.length - 1] + 0.5;
    tri(p, tx - 1.6, hy + 7, tx, hy + 5.2, tx + 1.6, hy + 7, () => RED[2]);
    tri(p, tx - 1.6, hy + 7, tx, hy + 8.8, tx + 1.6, hy + 7, () => RED[1]);
    // 咧到耳根的笑
    const m0 = side ? hx + 2 : hx - 5;
    const m1 = side ? hx + 8 : hx + 5;
    for (let x = Math.round(m0); x <= Math.round(m1); x++) {
      const u = (x + 0.5 - (m0 + m1) / 2) / ((m1 - m0) / 2);
      const y = Math.round(hy + 8.6 - (1 - u * u) * -1.2 - Math.abs(u) * 1.6);
      p.set(x, y, EYE);
      if (Math.abs(u) < 0.6) p.set(x, y + 1, RED[1]);
    }
    return;
  }

  // 骸骨术士：兽骨头盔，两侧青色鳍，眼窝里青色魂火，下面一排牙
  const FIN = ramp(['#14584a', '#2a9a80', '#6ae0c4']);
  for (const sgn of side ? [-1] : [-1, 1]) {
    capsule(p, hx + sgn * 9.6, hy - 1, hx + sgn * 15, hy - 10.6, 2.4, FIN, side ? 1 : 0);
    capsule(p, hx + sgn * 10.4, hy + 2.4, hx + sgn * 15.4, hy - 3, 1.8, FIN, 1);
    for (let k = 0; k < 5; k++) p.set(Math.round(hx + sgn * (11 + k)), Math.round(hy - 2.4 - k * 1.8), FIN[4]);
  }
  ball(p, hx, hy - 1, side ? 10.6 : 11.4, 10, H);
  // 骨冠：头顶一道脊，几道裂纹
  for (let y = Math.round(hy - 11); y <= Math.round(hy - 3); y++) {
    p.set(Math.round(hx - 0.5), y, H[4]);
    onto(p, H, Math.round(hx + 0.5), y, H[2]);
  }
  for (const [x0, y0] of [[-6, -6], [5, -7]]) for (let k = 0; k < 4; k++) onto(p, H, Math.round(hx + x0 + (k % 2)), Math.round(hy + y0 + k), H[1]);
  if (up) return;
  const DARK = '#141418';
  const sockets = side ? [hx + 6] : [hx - 4.8, hx + 4.8];
  for (const sx of sockets) {
    ball(p, sx, hy + 1.6, 2.9, 2.5, [DARK, DARK, '#22222a', '#22222a', '#2a2a34']);
    // 魂火：中心两格，亮的时候往上窜一格
    p.set(Math.round(sx - 0.5), Math.round(hy + 1.6), lit);
    p.set(Math.round(sx + 0.5), Math.round(hy + 1.6), mid);
    p.set(Math.round(sx - 0.5), Math.round(hy + 2.6), mid);
    if (f > 0.6) p.set(Math.round(sx - 0.5), Math.round(hy + 0.6), G[1]);
  }
  // 鼻孔和牙
  if (!side) {
    p.set(Math.round(hx - 1), Math.round(hy + 5), DARK);
    p.set(Math.round(hx), Math.round(hy + 5), DARK);
  }
  const ty = Math.round(hy + 7.4);
  for (let x = Math.round(side ? hx + 2 : hx - 5); x <= Math.round(side ? hx + 9 : hx + 5); x++) {
    p.set(x, ty, x % 2 ? DARK : H[3]);
    p.set(x, ty + 1, x % 2 ? H[2] : DARK);
  }
}

/** 一团火：水滴形，外圈暗、里面亮，火尖跟着闪烁左右晃 */
function chibiFlame(p: Pix, x: number, y: number, G: string[], f: number, wob: number) {
  const H = 10;
  for (let j = 0; j < H; j++) {
    const k = j / (H - 1);
    const w = k < 0.25 ? k * 6 : k < 0.75 ? 1.5 + (k - 0.25) * 4 : 3.5 - (k - 0.75) * 8;
    const ox = (1 - k) * wob;
    for (let i = Math.floor(-w); i <= Math.ceil(w); i++) {
      if (Math.abs(i) > w + 0.2) continue;
      const d = Math.abs(i) / Math.max(w, 0.6);
      const c = d > 0.72 ? G[0] : k > 0.45 && d < 0.4 ? (f > 0.5 ? '#ffffff' : G[2]) : d < 0.5 ? G[2] : G[1];
      p.set(Math.round(x + i + ox), Math.round(y - H + j + 2), c);
    }
  }
}

/** 菱形魂晶（幽蓝南瓜、骸骨术士手里那颗） */
function chibiOrb(p: Pix, x: number, y: number, G: string[], f: number) {
  const r = 3.6 + (f > 0.6 ? 0.6 : 0);
  for (let j = -5; j <= 5; j++) {
    for (let i = -4; i <= 4; i++) {
      const d = Math.abs(i) / r + Math.abs(j) / (r + 1.4);
      if (d > 1) continue;
      p.set(Math.round(x + i), Math.round(y + j), d < 0.35 ? '#ffffff' : d < 0.6 ? G[2] : d < 0.85 ? G[1] : G[0]);
    }
  }
}

function chibiItem(p: Pix, item: ChibiItem, x: number, y: number, o: Outfit, pose: Pose, view: 'down' | 'up' | 'side') {
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  const f = flicker(pose, 4);
  const t = pose.t ?? 0;
  if (item === 'flame') chibiFlame(p, x, y + 3, G, f, Math.sin(t * TAU * 3 + (pose.seed ?? 0)) * 1.4);
  else if (item === 'orb') chibiOrb(p, x, y + 3 + Math.round(Math.sin(t * TAU) * 1), G, f);
  else if (item === 'blade') {
    // 骨白色的弯刃，刃尖朝下
    const B = ['#6a6458', '#a8a08c', '#dcd6c4', '#fbf8ee'];
    for (let j = 0; j < 12; j++) {
      const bx = x - 1 + Math.round(Math.sin((j / 11) * 1.5) * -2.4);
      p.set(bx, y + 2 + j, j > 9 ? B[3] : B[2]);
      p.set(bx + 1, y + 2 + j, B[1]);
      if (j < 9) p.set(bx - 1, y + 2 + j, B[3]);
    }
    p.rect(x - 2, y + 1, 4, 2, '#4a3220');
  } else if (item === 'shield') {
    // 木盾：深色木板、铁边铆钉、一道干掉的血迹
    const w = view === 'side' ? 6 : 11;
    const h = 16;
    const WOODS = ['#2a160c', '#40241a', '#5a3422', '#74462c'];
    const x0 = Math.round(x - w / 2);
    const y0 = Math.round(y - 4);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (j === h - 1 && (i === 0 || i === w - 1)) continue;
        const edge = i === 0 || i === w - 1 || j === 0 || j === h - 1;
        let c = edge ? (i === 0 || j === 0 ? STEEL[2] : STEEL[1]) : WOODS[(Math.floor(i / 3) % 2) + (j % 7 === 0 ? 0 : 1)];
        if (!edge && view !== 'up' && (((i * 3 + j) % 9 < 3 && j > 4 && j < 13 && i < w - 3) || (i === 2 && j > 2))) c = j % 3 ? '#7a1a14' : '#5a120e';
        p.set(x0 + i, y0 + j, c);
      }
    }
    for (const [i, j] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) p.set(x0 + i, y0 + j, STEEL[3]);
  } else if (item === 'staff') {
    // 木杖，杖头嵌一颗青晶，缠两圈布条
    for (let j = -16; j <= 14; j++) {
      p.set(x, y + j, WOOD[1]);
      p.set(x + 1, y + j, WOOD[0]);
      if (j % 9 === 0) p.set(x, y + j, WOOD[2]);
    }
    for (const j of [-8, -6]) { p.set(x - 1, y + j, '#c8bca4'); p.set(x + 2, y + j, '#8a7e6a'); }
    chibiOrb(p, x + 0.5, y - 19, o.glow ?? G, f);
  } else if (item === 'wand') {
    // 小丑棒：一根短棍，顶上红白相间的小球挂个铃
    for (let k = 0; k < 9; k++) p.set(x + Math.round(k * 0.5), y - k, k % 2 ? '#3a2a1a' : '#5a4028');
    ball(p, x + 4.6, y - 11, 2.8, 2.8, ['#6a0a10', '#c81a22', '#ff3a44', '#ffffff', '#ffffff']);
    p.set(x + 4, y - 12, '#ffffff');
    ball(p, x + 6.4, y - 7.4, 1.4, 1.4, ['#5a5a66', '#9a9aa6', '#d8d8e0', '#f4f4f8', '#ffffff']);
  }
}

function drawChibi(pose: Pose, o: Outfit): Pix {
  const p = new Pix(X2W, X2H);
  const st = CHIBI[o.head!];
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  const dir = pose.dir;
  const side = dir === 'side';
  const up = dir === 'up';
  const key = pose.key ?? '';
  const t = pose.t ?? 0;
  const idle = key.startsWith('idle') || key.startsWith('rideidle');
  const walking = key.startsWith('walk');
  const riding = key.startsWith('ride');
  const breath = idle ? Math.sin(t * TAU) : 0;
  const stepBob = walking ? -Math.round(Math.abs(Math.sin(t * TAU)) * 2) : 0;
  const cx = side ? 27 : 28;
  const sy = 30 + Math.round((pose.crouch ?? 0) * 1.6) + (pose.hop ?? 0) * 2 + stepBob + (breath > 0.4 ? 1 : 0) + Math.round((pose.bob ?? 0) * 1.4);
  const hem = riding ? 46 : 53;
  // 待机时大头左右轻晃（录屏里那样），走路时跟着步子晃一点
  const sway = idle && !side ? Math.round(Math.sin(t * TAU) * 1.8) : walking && !side ? Math.round(Math.sin(t * TAU) * 1) : 0;
  const hx = cx + sway + (side ? 1 : 0);
  const hy = sy - 11 + (idle && Math.cos(t * TAU) > 0.6 ? 1 : 0);
  const wave = pose.cape ?? 0;
  const ROBE = ramp(st.robe);
  const MANT = ramp(st.mantle);
  const HAND = ramp(st.hand);
  const RED = ramp(['#7a0a10', '#c81a22', '#ff3a44']);
  let flameAt: [number, number] | null = null;

  // ---- 身后：侧面的披风尾巴、后手和后手拿的东西 ----
  const hemSwing = walking ? Math.sin(t * TAU) * 1.6 : breath * 0.6;
  if (side) {
    const tip = cx - 15 - wave * 1.6;
    for (let y = sy; y <= hem - 1; y++) {
      const k = (y - sy) / (hem - 1 - sy);
      const l = cx - 6 + (tip - (cx - 6)) * k;
      for (let x = Math.floor(l); x <= cx - 2; x++) {
        if (y > hem - 3 && phash(x, 2, 13) > 0.5) continue;
        p.set(x, y, tone(MANT, -0.3 + ((x - l) / 8) * 0.6, 0.2, 1));
      }
    }
    const bh: [number, number] = [cx - 4 + Math.sin(pose.armB ?? 0) * 6, sy + 4 + Math.cos(pose.armB ?? 0) * 6];
    if (st.left !== 'fist') chibiItem(p, st.left, Math.round(bh[0]) - (st.left === 'shield' ? 3 : 0), Math.round(bh[1]), o, pose, 'side');
  }

  // ---- 脚：从袍子底下露出来，走路时交替抬起 ----
  const BOOT = ramp(['#16120e', '#2a221a']);
  if (!riding) {
    if (side) {
      for (const [a, dim] of [[pose.legB ?? 0, 1], [pose.legF ?? 0, 0]] as const) {
        const fx2 = cx + Math.sin(a) * 6;
        const lift = Math.max(0, Math.cos(a * 2) < 0.5 ? 1 : 0);
        ball(p, fx2 + 1.5, X2FEET - 1.2 - lift, 3, 1.8, BOOT, dim);
      }
    } else {
      const lL = Math.min(3, (pose.legB ?? 0) * 1.4);
      const lR = Math.min(3, (pose.legF ?? 0) * 1.4);
      ball(p, cx - 4.5, X2FEET - 1.2 - lL, 3, 1.8, BOOT);
      ball(p, cx + 4.5, X2FEET - 1.2 - lR, 3, 1.8, BOOT);
    }
  }

  // ---- 长袍：下摆往外撑，布纹是细格子，下摆一缕一缕 ----
  for (let y = sy; y <= hem; y++) {
    const k = (y - sy) / (hem - sy);
    const off = hemSwing * k * k;
    const l = side ? cx - 7.5 - k * 3.5 + off : cx - 9.5 - k * 4.6 + off;
    const r = side ? cx + 7 + k * 2.6 + off : cx + 9.5 + k * 4.6 + off;
    for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
      const px = x + 0.5;
      if (px < l || px > r) continue;
      if (y >= hem - 1 && phash(x, 1, 5) > 0.55) continue;
      const nx = ((px - (l + r) / 2) / ((r - l) / 2)) * 0.92;
      let R = ROBE;
      if (o.head === 'jester') {
        // 红黑菱格
        const u = x - cx + 64;
        if (((u + y) >> 2) % 2 === ((u - y + 128) >> 2) % 2) R = RED;
      }
      let c = tone(R, nx, k < 0.08 ? -0.5 : 0.15);
      if (o.head !== 'jester' && ((x >> 1) + (y >> 1)) % 2 === 0) c = tone(R, nx, 0.15, 1);
      p.set(x, y, c);
    }
  }
  // 各套袍子上的细节
  if (o.head === 'paleknight' && !up) {
    // 黑铁胸甲：一层层甲片的亮边、铆钉，腰间一条紫色饰带
    for (let y = sy + 4; y < hem - 6; y += 5) {
      for (let x = cx - 8; x <= cx + 8; x++) if (p.get(x, y)) p.set(x, y, x < cx ? ROBE[3] : ROBE[2]);
      p.set(cx - 6, y + 2, STEEL[2]);
      p.set(cx + 6, y + 2, STEEL[1]);
    }
    for (let x = cx - 10; x <= cx + 10; x++) if (p.get(x, sy + 12)) { p.set(x, sy + 12, '#4a2a5a'); p.set(x, sy + 13, '#2e1a3a'); }
  } else if (o.head === 'bone' && !up) {
    // 胸前一副肋骨
    for (let i = 0; i < 4; i++) {
      const y = sy + 4 + i * 3;
      for (let x = -6 + i; x <= 6 - i; x++) {
        if (Math.abs(x) < 1) continue;
        const yy = y + Math.round(Math.abs(x) * 0.3);
        if (p.get(cx + x, yy)) p.set(cx + x, yy, x < 0 ? '#e8dfca' : '#b0a48c');
      }
    }
    for (let y = sy + 3; y < sy + 15; y++) p.set(cx, y, '#c8bca4');
  } else if (!up && (o.head === 'pumpkin' || o.head === 'voidpumpkin')) {
    // 腰间一根草绳
    for (let x = cx - 11; x <= cx + 11; x++) if (p.get(x, sy + 13)) p.set(x, sy + 13, (x + 40) % 3 ? '#5a4a2a' : '#3a2e1a');
  }

  // ---- 肩上的破披肩：圆肩，下沿一缕一缕，跟着呼吸起伏；正面右边垂下一片披风 ----
  const mTop = sy - 3 + (breath > 0.4 ? 0 : 0);
  const mantleRow = (x: number) => sy + 4 + [3, 1, 2, 4, 1, 3, 2][((x % 7) + 7) % 7] + (breath > 0.4 ? 1 : 0);
  const ml = side ? cx - 10 : cx - 13;
  const mr = side ? cx + 8.5 : cx + 13;
  for (let x = Math.floor(ml); x <= Math.ceil(mr); x++) {
    const u = (x + 0.5 - (ml + mr) / 2) / ((mr - ml) / 2);
    if (Math.abs(u) > 1) continue;
    const top = mTop + Math.max(0, Math.abs(u) - 0.55) * 9;
    const bot = mantleRow(x);
    for (let y = Math.floor(top); y <= bot; y++) {
      const fold = ((x + 40) % 4 === 0 ? 1 : 0);
      p.set(x, y, tone(MANT, u * 0.85, y < top + 1.5 ? -0.6 : 0.1, fold));
    }
  }
  if (!side && !up) {
    const x0 = cx + 9;
    for (let y = sy + 3; y <= hem - 1; y++) {
      const k = (y - sy - 3) / (hem - 4 - sy);
      const xr = x0 + 2 + k * (6 + wave * 0.6) + hemSwing * k;
      for (let x = x0; x <= Math.ceil(xr); x++) {
        if (y > hem - 3 && phash(x, 4, 9) > 0.45) continue;
        p.set(x, y, tone(MANT, ((x - x0) / Math.max(1, xr - x0)) * 0.9 - 0.2, 0.2, 1));
      }
    }
  }
  if (up) {
    // 背面：披风盖住整个背
    for (let y = sy - 1; y <= hem - 2; y++) {
      const k = (y - sy) / (hem - sy);
      const half = 11.5 + k * 4 + Math.abs(hemSwing) * k;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (y > hem - 4 && phash(x, 6, 3) > 0.5) continue;
        const nx = (x + 0.5 - cx) / half;
        p.set(x, y, tone(MANT, nx * 0.85, 0.1, (x + 40) % 5 === 0 ? 1 : 0));
      }
    }
  }

  // ---- 正面 / 背面的两只手和手里的东西 ----
  if (!side) {
    const [lL, lR] = pose.armLift ?? [0, 0];
    const bL: [number, number] = [cx - 12, sy + 11 - lL * 2.4];
    const bR: [number, number] = [cx + 12, sy + 11 - lR * 2.4];
    for (const [hxx, hyy, sgn] of [[...bL, -1], [...bR, 1]] as [number, number, number][]) {
      capsule(p, cx + sgn * 10.5, sy + 2, hxx, hyy - 2, 2.8, MANT, up ? 0 : 1);
      if (!up) ball(p, hxx, hyy, 2.3, 2.1, HAND);
    }
    // 左手（画面左边）拿的东西
    if (st.left === 'shield') chibiItem(p, 'shield', up ? cx - 7 : bL[0] - 2, bL[1] - 2, o, pose, up ? 'up' : 'down');
    else if (!up && st.left !== 'fist') chibiItem(p, st.left, Math.round(bL[0]), Math.round(bL[1]), o, pose, 'down');
    if (st.right !== 'fist' && !(up && st.right === 'wand')) {
      chibiItem(p, st.right, Math.round(bR[0]) + (st.right === 'wand' ? 1 : 0), Math.round(bR[1]) + (st.right === 'wand' ? 0 : 2), o, pose, up ? 'up' : 'down');
      flameAt = [Math.round(bR[0]), Math.round(bR[1]) - 4];
    }
  }

  // ---- 大头 ----
  chibiHead(p, o, hx, hy, pose);

  // ---- 侧面：前手和工具（工具按原来的样子画，放大两倍） ----
  if (side) {
    const a = (pose.armF ?? 0) + (pose.elbowF ?? 0) * 0.6;
    const px0 = cx + 2 + (pose.reach ?? 0) * 1.2;
    const py0 = sy + 3;
    const [dx, dy] = v(a, 8);
    const hxx = px0 + dx;
    const hyy = py0 + dy;
    const tool = pose.tool ?? 'none';
    if (tool !== 'none') {
      const small = new Pix(HERO_W, HERO_H);
      drawTool(small, tool, hxx / 2, hyy / 2, a + (pose.toolTurn ?? 0), pose);
      for (let y = 0; y < HERO_H; y++) for (let x = 0; x < HERO_W; x++) {
        const c = small.get(x, y);
        if (c) p.rect(x * 2, y * 2, 2, 2, c);
      }
    }
    capsule(p, px0, py0, hxx, hyy, 2.6, MANT);
    ball(p, hxx, hyy, 2.2, 2.1, HAND);
    if (tool === 'none' && st.right !== 'fist') {
      chibiItem(p, st.right, Math.round(hxx), Math.round(hyy) + (st.right === 'wand' ? 0 : 2), o, pose, 'side');
      flameAt = [Math.round(hxx), Math.round(hyy) - 4];
    }
  }

  const out = p.outlineTinted('#0c0a10', 0.8);
  chibiFx(out, o, pose, { cx, sy, hem, hy, flameAt, G });
  return out;
}

/** 限定外观的粒子特效：画在描边外面，按帧进度循环 */
function chibiFx(p: Pix, o: Outfit, pose: Pose, at: { cx: number; sy: number; hem: number; hy: number; flameAt: [number, number] | null; G: string[] }) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const { cx, sy, hem, hy, flameAt, G } = at;
  const put = (x: number, y: number, c: string, s = 1) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const xx = Math.round(x) + i;
      const yy = Math.round(y) + j;
      if (xx >= 0 && yy >= 0 && xx < X2W && yy < X2H) p.set(xx, yy, c);
    }
  };
  if (o.fx === 'embers' || o.fx === 'wisps') {
    // 火星 / 鬼火：从手里的火往上飘，边飘边晃，越往上越小越暗
    const src: [number, number] = flameAt ?? [cx, hy - 10];
    const n = o.fx === 'wisps' ? 4 : 6;
    for (let j = 0; j < n; j++) {
      const ph = (t * (o.fx === 'wisps' ? 1 : 2) + j / n + (seed % 7) * 0.013) % 1;
      if (ph > 0.9) continue;
      const x = src[0] + Math.sin(ph * 8 + j * 2.3) * (1.5 + ph * 3) + (j % 3 - 1) * 1.5;
      const y = src[1] - 2 - ph * (o.fx === 'wisps' ? 22 : 18);
      put(x, y, ph < 0.3 ? G[2] : ph < 0.6 ? G[1] : G[0], ph < 0.45 ? 2 : 1);
    }
    // 脸上的光往外溢一点
    if (flicker(pose) > 0.7 && pose.dir !== 'up') put(cx + (pose.dir === 'side' ? 13 : 12), hy + 1, G[1]);
  } else if (o.fx === 'sparks') {
    // 青色灵光：身边一闪一闪的小光点和十字星
    for (let j = 0; j < 9; j++) {
      const ph = (t * 2 + j * 0.31 + phash(j, 1, 7)) % 1;
      if (ph > 0.6) continue;
      const ang = phash(j, 2, 7) * TAU + t * TAU * 0.4;
      const rad = 15 + phash(j, 3, 7) * 9;
      const x = cx + Math.cos(ang) * rad;
      const y = (sy + hem) / 2 - 6 + Math.sin(ang) * rad * 0.95;
      const c = ph < 0.2 ? G[2] : ph < 0.4 ? G[1] : G[0];
      if (ph < 0.18 && j % 3 === 0) {
        put(x, y, '#ffffff');
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) put(x + dx, y + dy, Math.abs(dx) + Math.abs(dy) > 1 ? G[0] : G[1]);
      } else put(x, y, c, ph < 0.3 ? 2 : 1);
    }
  } else if (o.fx === 'mist') {
    // 脚下缠着的暗红雾：贴地一团一团往两边漂
    const MIST = ['#2a0810', '#4a101a', '#7a1a26', '#a02a30'];
    for (let j = 0; j < 14; j++) {
      const ph = (t + j / 14) % 1;
      const x = cx - 20 + ((j * 11 + ph * 40) % 40);
      const y = X2FEET - 1 - (j % 4) - Math.round(Math.sin(ph * TAU) * 1.2);
      if (p.get(Math.round(x), Math.round(y)) && j % 4 !== 0) continue;
      put(x, y, MIST[(j + Math.floor(ph * 4)) % 4], j % 3 === 0 ? 2 : 1);
    }
    // 红眼的光拖一点尾巴
    if (flicker(pose) > 0.7 && pose.dir !== 'up') {
      const ex = pose.dir === 'side' ? cx + 10 : cx - 8;
      put(ex, hy + 3, '#ff6a4a');
      put(ex - 1, hy + 3, '#a01010');
    }
  } else if (o.fx === 'confetti') {
    // 红白纸花：从帽角的铃铛撒下来，翻着往下飘
    for (let j = 0; j < 8; j++) {
      const ph = (t * 1.4 + j * 0.13 + (seed % 3) * 0.05) % 1;
      const sgn = j % 2 ? 1 : -1;
      const x = cx + sgn * (17 - ph * 4) + Math.sin(ph * 9 + j) * 2.4;
      const y = hy - 4 + ph * 34;
      if (p.get(Math.round(x), Math.round(y))) continue;
      const c = j % 3 === 0 ? '#ffffff' : ph < 0.5 ? G[1] : G[0];
      const flip = (Math.floor(ph * 10) + j) % 3;
      if (flip === 0) put(x, y, c, 2);
      else if (flip === 1) { put(x, y, c); put(x + 1, y + 1, c); }
      else { put(x, y, c); put(x + 1, y, c); }
    }
  }
}

/** 南瓜脸、魂火的明暗：按帧进度和帧号起伏，像火苗一明一暗 */
function flicker(pose: Pose, speed = 3) {
  const t = pose.t ?? 0;
  const s = pose.seed ?? 0;
  return 0.5 + 0.32 * Math.sin(t * TAU * speed + s * 1.7) + 0.18 * Math.sin(t * TAU * 7 + s * 0.6);
}
/** 少数帧换个表情（南瓜「哦？」、幽蓝南瓜红眼） */
const oddFrame = (pose: Pose) => (pose.seed ?? 0) % 17 === 5;
