import { mix, phash, Pix, ramp } from './pix';
import { tl } from '../i18n';

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
/**
 * 每帧四周的留白（用户 10-24：挥镐、挥斧时工具头超出 28×30 被裁掉）。
 * 角色本身还是 28×30，画法坐标不变，只是画布变大、精灵原点跟着平移
 */
export const HERO_PAD = { l: 18, r: 18, t: 10, b: 2 };
export const FRAME_W = HERO_W + HERO_PAD.l + HERO_PAD.r;
export const FRAME_H = HERO_H + HERO_PAD.t + HERO_PAD.b;

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
  /** 兑换码外观（用户 10-23）：特殊头部造型，hair 这时是头部主色 */
  head?: 'pumpkin' | 'voidpumpkin' | 'paleknight' | 'jester' | 'bone';
  /** 不背行囊、没有围巾尾巴 */
  noPack?: boolean;
  /** 身后的破披风 */
  cloak?: string[];
  /** 副手：提灯 / 盾牌 */
  offhand?: 'lantern' | 'shield';
  /** 发光色（眼睛、脸、灯、粒子）：暗、中、亮 */
  glow?: string[];
  /** 粒子特效 */
  fx?: 'embers' | 'wisps' | 'sparks' | 'mist' | 'confetti';
  /** 衣服上的菱格花纹（小丑） */
  harlequin?: boolean;
  /** 要用这个兑换码解锁 */
  code?: string;
}

export const OUTFITS: Outfit[] = [
  {
    id: 'adventurer', name: tl('冒险者'), desc: tl('原皮。皮背心、红围巾、背着行囊的旅人。'),
    skin: ['#c8946a', '#f2c9a0'], hair: ['#4a2a18', '#7a4a28', '#a8703a'],
    coat: ['#4a2a18', '#6e4226', '#8e5a34', '#b07a48'], shirt: ['#b8a888', '#e8dcc0'],
    pants: ['#2a3438', '#3e4c52'], boots: ['#2a1a10', '#5a3a22'], scarf: ['#8a1e22', '#c83a32'],
    pack: ['#5a3a22', '#8a6038', '#b08050'], roll: '#4e7a4a',
  },
  {
    id: 'ranger', name: tl('林地游侠'), desc: tl('绿色斗篷兜帽，适合在林子里打猎。'),
    skin: ['#c8946a', '#f2c9a0'], hair: ['#2a3a1a', '#3a5a2a', '#5a7a3a'],
    coat: ['#23381e', '#335230', '#4a7040', '#6a9058'], shirt: ['#8a7a58', '#b8a47a'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#5a4a2a', '#8a7038'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#a08a5a', hood: true,
  },
  {
    id: 'snow', name: tl('雪原旅人'), desc: tl('白色毛领外套和蓝围巾，冰原上不怕冷。'),
    skin: ['#d8a882', '#f8dcc0'], hair: ['#c8b080', '#e0cc98', '#f8ecc0'],
    coat: ['#6a7a90', '#a8b8c8', '#d8e2ec', '#ffffff'], shirt: ['#5a6a80', '#7a8ca4'],
    pants: ['#3a4250', '#525c6e'], boots: ['#4a3a30', '#7a6050'], scarf: ['#2a5a9a', '#4a8ad8'],
    pack: ['#5a5a6a', '#7a7a8c', '#9a9aac'], roll: '#c8382e',
  },
  {
    id: 'shadow', name: tl('暗影刺客'), desc: tl('黑色紧身装束，深红围巾。'),
    skin: ['#b88660', '#e0b890'], hair: ['#141418', '#26262e', '#3a3a46'],
    coat: ['#141418', '#24242c', '#363642', '#50505e'], shirt: ['#2a2a34', '#3e3e4a'],
    pants: ['#16161a', '#24242a'], boots: ['#0e0e10', '#26262c'], scarf: ['#5a0e14', '#9a1a24'],
    pack: ['#26262c', '#3a3a42', '#50505a'], roll: '#5a1a2a', hood: true,
  },
  {
    id: 'noble', name: tl('王都骑士'), desc: tl('蓝白罩衣配金边，镇上骑士团的制式装扮。'),
    skin: ['#c8946a', '#f2c9a0'], hair: ['#c89a3a', '#e8c060', '#fff0a0'],
    coat: ['#1a2a5a', '#2a4088', '#3e5cb8', '#7a98e0'], shirt: ['#a8acb4', '#e0e4ec'],
    pants: ['#3a3a44', '#565662'], boots: ['#3a2a1a', '#6a4a2a'], scarf: ['#b08a2a', '#f0c84a'],
    pack: ['#6a6a74', '#9a9aa4', '#c8c8d0'], roll: '#2a4088',
  },
  // ---- 兑换码「为爱发电」解锁的五套（用户 10-23 给的参考图和录屏，按本作画法重画） ----
  {
    id: 'pumpkin', name: tl('南瓜提灯人'), desc: tl('雕着笑脸的南瓜头，眼里的火一明一暗；破旧的灰绿斗篷，手提一盏冒火星的油灯。'),
    skin: ['#5a4a3a', '#7a6650'], hair: ['#a8300c', '#e0561a', '#ff8a2a', '#ffc060'],
    coat: ['#1e2420', '#2e3a32', '#46564a', '#6a7a6c'], shirt: ['#2a2018', '#40321f'],
    pants: ['#1a1a18', '#2a2a26'], boots: ['#141412', '#2e2a24'], scarf: ['#3a4a3a', '#5a6e58'],
    pack: ['#2a2018', '#3e3024', '#5a4632'], roll: '#3a4a3a',
    head: 'pumpkin', noPack: true, cloak: ['#26342c', '#3a4c40', '#56705c'], offhand: 'lantern',
    glow: ['#c84a10', '#ffa020', '#fff0a0'], fx: 'embers', code: tl('为爱发电'),
  },
  {
    id: 'voidpumpkin', name: tl('幽蓝南瓜'), desc: tl('烧成焦黑的南瓜头里亮着幽蓝的鬼火，偶尔闪过一丝红光；提灯里的火也是冷的。'),
    skin: ['#3a3a40', '#5a5a62'], hair: ['#16161c', '#26262e', '#3a3a44', '#565662'],
    coat: ['#1a201e', '#283430', '#3c4c46', '#5c6e66'], shirt: ['#1e1e22', '#2e2e34'],
    pants: ['#141416', '#222226'], boots: ['#0e0e10', '#24242a'], scarf: ['#2e3e38', '#4a6058'],
    pack: ['#1e1e22', '#2e2e34', '#44444c'], roll: '#2e3e38',
    head: 'voidpumpkin', noPack: true, cloak: ['#1e2c28', '#2e423c', '#465e56'], offhand: 'lantern',
    glow: ['#1a6ab0', '#4ab0ff', '#c8f0ff'], fx: 'wisps', code: tl('为爱发电'),
  },
  {
    id: 'paleknight', name: tl('白发魔骑'), desc: tl('一头乱翘的白发，灰白的脸上一双红眼；黑铁铠甲配一面染血的木盾，脚下缠着暗红的雾。'),
    skin: ['#6a6e78', '#a8acb6'], hair: ['#8a909a', '#c8ccd6', '#eef0f6', '#ffffff'],
    coat: ['#141418', '#26262e', '#3c3c48', '#6a6a7a'], shirt: ['#4a4a56', '#9a9aa8'],
    pants: ['#16161a', '#28282e'], boots: ['#0e0e10', '#2a2a30'], scarf: ['#2a2228', '#4a3a40'],
    pack: ['#4a2a1a', '#6e3e22', '#8e5a34'], roll: '#4a2a1a',
    head: 'paleknight', noPack: true, cloak: ['#141418', '#22222a', '#34343e'], offhand: 'shield',
    glow: ['#8a0e0e', '#ff3a2a', '#ffb08a'], fx: 'mist', code: tl('为爱发电'),
  },
  {
    id: 'jester', name: tl('红黑小丑'), desc: tl('红黑两色的分叉小丑帽挂着银铃，白面具上画着红泪痕；菱格衣服，走到哪都撒红色的纸花。'),
    skin: ['#c8c8d0', '#f4f4f8'], hair: ['#2a2a32', '#44444e', '#62626e', '#8a8a96'],
    coat: ['#141418', '#26262e', '#3a3a44', '#585864'], shirt: ['#8a0e14', '#e01e28'],
    pants: ['#1e1e24', '#34343c'], boots: ['#7a0a10', '#c81a22'], scarf: ['#b8b8c4', '#ffffff'],
    pack: ['#26262e', '#3a3a44', '#585864'], roll: '#8a0e14',
    head: 'jester', noPack: true, harlequin: true,
    glow: ['#8a0e14', '#ff2a3a', '#ffd0d0'], fx: 'confetti', code: tl('为爱发电'),
  },
  {
    id: 'bone', name: tl('骸骨术士'), desc: tl('戴着兽骨头盔、肩披骨甲，眼窝里燃着青色的魂火，身边飘着点点灵光。'),
    skin: ['#8a7e6a', '#d8ccb4'], hair: ['#8a7e6a', '#c8bca4', '#ece2cc', '#fffaf0'],
    coat: ['#1a1a1e', '#2c2a2a', '#4a4440', '#6a6258'], shirt: ['#a89a84', '#e8dece'],
    pants: ['#241c16', '#3a2e24'], boots: ['#141010', '#2e2420'], scarf: ['#1a6a5a', '#3aa890'],
    pack: ['#3a2e24', '#5a4634', '#7a6248'], roll: '#5a2a1a',
    head: 'bone', noPack: true, cloak: ['#1a2a28', '#2a4440', '#3e5e58'],
    glow: ['#1a8aa0', '#5ae0f0', '#e0ffff'], fx: 'sparks', code: tl('为爱发电'),
  },
];
/** 兑换码解锁的外观 */
export const OUTFIT_CODES = new Set(OUTFITS.map((o) => o.code).filter(Boolean) as string[]);
const SKIN = ['#c8946a', '#f2c9a0'];
/** 镇上走动的村民，用和主角同一套画法，只换配色、不背行囊 */
export const NPC_OUTFITS: Record<string, Outfit> = {
  villager: {
    id: 'npc-villager', name: tl('村民'), desc: '', npc: true,
    skin: SKIN, hair: ['#1e1612', '#3a2a20', '#5a4232'],
    coat: ['#6a2a1e', '#9a3e2a', '#c05a3a', '#e07a52'], shirt: ['#b8a888', '#e8dcc0'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#8a6a1a', '#c8a03a'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#8a6a1a',
  },
  villager2: {
    id: 'npc-villager2', name: tl('村民'), desc: '', npc: true,
    skin: ['#d8a882', '#f8dcc0'], hair: ['#a8803a', '#d0a850', '#f0d080'],
    coat: ['#1e3a6a', '#2a5a90', '#3a7ac0', '#6aa0e0'], shirt: ['#c8c8c8', '#f4f4f0'],
    pants: ['#3a3a44', '#565662'], boots: ['#3a2a1a', '#6a4a2a'], scarf: ['#a89060', '#e8d0a0'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#2a5a90',
  },
  villager3: {
    id: 'npc-villager3', name: tl('村民'), desc: '', npc: true,
    skin: ['#a8704a', '#d8a078'], hair: ['#5a2414', '#8a3a1e', '#b05a2a'],
    coat: ['#23401e', '#3a6a32', '#5aa04a', '#80c068'], shirt: ['#a89878', '#d8c8a0'],
    pants: ['#3a2e22', '#54432f'], boots: ['#2a1a10', '#4a3020'], scarf: ['#4a3020', '#7a5030'],
    pack: ['#4a3a22', '#6e5a34', '#8e7a48'], roll: '#5aa04a',
  },
  guard: {
    id: 'npc-guard', name: tl('卫兵'), desc: '', npc: true,
    skin: SKIN, hair: ['#4a5058', '#8a9098', '#c8ced6'],
    coat: ['#3e444c', '#62666e', '#8a8f99', '#c0c6ce'], shirt: ['#2a3a6a', '#3a4a7a'],
    pants: ['#2a2a34', '#3e3e4a'], boots: ['#2a1a10', '#4a3020'], scarf: ['#2a3a6a', '#4a5a9a'],
    pack: ['#2a3a6a', '#3a4a7a', '#5a6a9a'], roll: '#3a4a7a',
  },
  merchant: {
    id: 'npc-merchant', name: tl('商人'), desc: '', npc: true,
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
  /** 这一帧在动作里的进度 0-1、帧序号（特效闪烁用，生成精灵表时填） */
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
  if (o.head) return drawSpecialHead(p, o, R, cx, cy, pose);
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

export function drawFrame(pose: Pose, o: Outfit): Pix {
  const p = new Pix(FRAME_W, FRAME_H);
  p.ox = HERO_PAD.l;
  p.oy = HERO_PAD.t;
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
  let lantern: [number, number] | null = null;

  const bare = !!(o.npc || o.noPack);
  // ---- 破披风（身后） ----
  if (o.cloak && !up) drawCloak(p, o, cx, sy, hipY, pose);

  // ---- 围巾尾巴（身后飘） ----
  if (side && !o.noPack) {
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
  if (side && !bare) {
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
  const back = side ? sideArm(pose.armB ?? 0, pose.elbowB ?? 0, 0, 1) : null;
  // 盾牌背在后手外侧：先画盾，后手压在上面
  if (back && o.offhand === 'shield') drawShield(p, back.hx - 1, back.hy - 1, 'side');
  back?.draw();

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
      if (o.harlequin && pal === C && !up) {
        const u = x - Math.round(cx) + 40;
        if (((u + y) >> 1) % 2 === ((u - y + 80) >> 1) % 2) pal = R.shirt;
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
    if (!bare) {
      p.line(cx - 2.6, sy + 0.5, cx - 2.6, beltY - 1, R.pack[1]);
      p.line(cx + 2.4, sy + 0.5, cx + 2.4, beltY - 1, R.pack[0]);
    }
  } else if (side && !bare) {
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
  let hands: [number, number][] = [];
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
    hands = [[cx - 4.4, sy + 7.1 - l], [cx + 4.4, sy + 7.1 - r]];
  }

  // ---- 背面：披风盖住整个背 ----
  if (up && o.cloak) drawCloak(p, o, cx, sy, hipY, pose);
  // ---- 背面：大背包压在身上 ----
  if (up && !bare) {
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
  if (down && !o.noPack) capsule(p, cx + 1.8, sy + 0.6, cx + 2.1 + wave * 0.2, sy + 3.8, 0.85, R.scarf);
  if (o.head === 'jester') {
    // 小丑的白色褶领：一圈小圆
    for (let i = -2; i <= 2; i++) ball(p, cx + i * 1.6 + (side ? 0.4 : 0), sy - 0.1 + (i & 1 ? 0.4 : 0), 1, 0.9, R.scarf);
  }
  if (o.head === 'bone' && !up) {
    // 骨质肩甲
    for (const sx of side ? [cx + 1] : [cx - 4.2, cx + 4.2]) {
      ball(p, sx, sy + 0.6, 2, 1.5, ramp(o.hair.slice(0, 3)));
      p.set(sx, sy + 1.6, R.coat[0]);
    }
  }
  if (o.head === 'paleknight' && !up) {
    for (const sx of side ? [cx + 0.8] : [cx - 4.3, cx + 4.3]) ball(p, sx, sy + 0.6, 2, 1.5, R.shirt);
  }

  // ---- 头 ----
  drawHead(p, o, R, cx, headY, pose);

  if (up && !bare) capsule(p, cx - 4.3, sy - 0.2, cx + 4.3, sy - 0.2, 1.5, R.roll);

  // ---- 前面的手臂和工具 ----
  if (side) {
    const arm = sideArm(pose.armF ?? 0, pose.elbowF ?? 0, pose.reach ?? 0, 0);
    const tool = pose.tool ?? 'none';
    if (tool !== 'none') drawTool(p, tool, arm.hx, arm.hy, arm.a + (pose.toolTurn ?? 0), pose);
    arm.draw();
    hands = [[back!.hx, back!.hy], [arm.hx, arm.hy]];
    if (o.offhand === 'lantern') {
      // 空手时灯提在前手，拿着工具就换到后手
      const [lx, ly] = tool === 'none' && !pose.reach ? [arm.hx, arm.hy] : [back!.hx, back!.hy];
      lantern = drawLantern(p, o, lx, ly, pose);
    }
  } else if (o.offhand === 'lantern' && hands.length) {
    lantern = drawLantern(p, o, hands[1][0], hands[1][1], pose, up);
  }
  if (o.offhand === 'shield' && down) drawShield(p, cx - 5.6, sy + 3.2, 'front');
  if (o.offhand === 'shield' && up) drawShield(p, cx - 2.6, sy + 1.4, 'back');
  const out = p.outlineTinted();
  if (o.fx) drawFx(out, o, pose, { cx, sy, hipY, headY, lantern });
  return out;
}

// ---- 兑换码外观的特殊部件（用户 10-23：南瓜提灯人、幽蓝南瓜、白发魔骑、红黑小丑、骸骨术士） ----

/** 发光强度 0-1：按帧进度和帧号起伏，像火苗一明一暗 */
const flicker = (pose: Pose, speed = 3) => {
  const t = pose.t ?? 0;
  const s = pose.seed ?? 0;
  return 0.5 + 0.32 * Math.sin(t * TAU * speed + s * 1.7) + 0.18 * Math.sin(t * TAU * 7 + s * 0.6);
};
const glowAt = (o: Outfit, k: number) => {
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  return k > 0.62 ? G[2] : k > 0.3 ? G[1] : G[0];
};
/** 少数帧换个表情（南瓜「哦？」、幽蓝南瓜红眼） */
const oddFrame = (pose: Pose) => (pose.seed ?? 0) % 17 === 5;

function drawSpecialHead(p: Pix, o: Outfit, R: Ramps, cx: number, cy: number, pose: Pose) {
  const { dir } = pose;
  const side = dir === 'side';
  const up = dir === 'up';
  const H = ramp(o.hair);
  const hx = side ? cx + 0.6 : cx;
  const f = flicker(pose);
  const lit = glowAt(o, f);
  const mid = glowAt(o, f - 0.3);
  const ey = Math.round(cy + 0.2);

  if (o.head === 'pumpkin' || o.head === 'voidpumpkin') {
    // 扁圆的南瓜，五道竖棱，顶上一截弯梗和一片叶子
    ball(p, hx, cy - 0.2, side ? 5.2 : 5.7, 4.7, H);
    for (const k of side ? [-0.55, 0.05, 0.6] : [-0.62, -0.22, 0.22, 0.62]) {
      for (let y = Math.floor(cy - 4); y <= Math.ceil(cy + 3.6); y++) {
        const yy = (y + 0.5 - cy) / 4.7;
        const x = Math.round(hx + k * 5.4 * Math.sqrt(Math.max(0, 1 - yy * yy)) - 0.5);
        if (H.includes(p.get(x, y) ?? '')) p.set(x, y, H[1]);
      }
    }
    const STEM = o.head === 'pumpkin' ? ['#1e3a14', '#2e5a1e', '#4a8a2e', '#7ab84a', '#a8e070'] : ['#141a16', '#22302a', '#34483e', '#4e6a5c', '#6a8a7a'];
    capsule(p, hx - 0.3, cy - 4.4, hx + 0.6, cy - 6.6, 0.9, STEM);
    p.set(hx + 1.6, cy - 6.6, STEM[3]);
    p.set(hx + 2.4, cy - 6.2, STEM[2]);
    p.set(hx + 2, cy - 5.6, STEM[2]);
    if (up) return;
    const red = o.head === 'voidpumpkin' && oddFrame(pose);
    const eye = red ? '#ff3a2a' : lit;
    const surprised = o.head === 'pumpkin' && oddFrame(pose);
    const fx = side ? hx + 2.2 : hx;
    const pts: [number, number, string][] = [];
    if (surprised) {
      // 「哦？」：两个方眼一张圆嘴
      for (const ex of side ? [1] : [-3, 2]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pts.push([Math.round(fx - 0.5) + ex + dx - (side ? 0 : 0.5), ey - 2 + dy, eye]);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pts.push([Math.round(fx - 0.5) + dx - (side ? -1 : 0.5), ey + 1 + dy, mid]);
    } else {
      // 斜着往里压的三角眼，中间隔一行南瓜皮，下面一张锯齿笑口（牙缝是暗的）
      const DARKP = H[1];
      const L = Math.round(fx - 0.5);
      const face: [number, number, string][] = side
        ? [[0, -2, mid], [0, -1, eye], [1, -1, eye], [2, -1, mid],
          [0, 1, mid], [1, 1, lit], [2, 1, DARKP], [3, 1, mid], [1, 2, mid], [2, 2, lit], [3, 2, mid]]
        : [[-3, -2, mid], [-3, -1, eye], [-2, -1, eye], [-1, -1, mid],
          [3, -2, mid], [3, -1, eye], [2, -1, eye], [1, -1, mid],
          [-3, 1, mid], [-2, 1, lit], [-1, 1, DARKP], [0, 1, lit], [1, 1, DARKP], [2, 1, lit], [3, 1, mid],
          [-2, 2, mid], [-1, 2, lit], [0, 2, lit], [1, 2, lit], [2, 2, mid]];
      for (const [dx, dy, c] of face) pts.push([L + dx + (side ? 0 : 0.5) - 0.5, ey + dy, c]);
    }
    for (const [x, y, c] of pts) {
      if (side && x < hx - 0.5) continue;
      p.set(x, y, c);
    }
    return;
  }

  if (o.head === 'paleknight') {
    // 乱翘的白发：一圈尖刺 + 盖住额头的刘海；灰白的脸，红眼
    const spikes = up ? [-2.0, -1.4, -0.8, -0.25, 0.3, 0.85, 1.45, 2.05] : side ? [-2.3, -1.7, -1.1, -0.5, 0.1, 0.7] : [-1.95, -1.35, -0.8, -0.25, 0.3, 0.85, 1.4, 1.95];
    spikes.forEach((a, i) => {
      const len = 5.4 + ((i * 5) % 3) * 0.9;
      const [dx, dy] = [Math.sin(a) * len * 1.1, -Math.cos(a) * len];
      for (let k = 0; k <= 1; k += 0.1) {
        const r = 1.35 * (1 - k) + 0.3;
        ball(p, hx + dx * k, cy - 2 + dy * k, r, r, H);
      }
    });
    ball(p, hx, cy - 2, 5.2, 3.7, H);
    // 几缕暗一点的发丝
    for (const [x0, x1] of [[-2, -3], [1, 2], [-0.5, -0.5]]) for (let y = 0; y < 3; y++) {
      const x = Math.round(hx + x0 + ((x1 - x0) * y) / 3);
      const yy = Math.round(cy - 4 + y);
      if (H.includes(p.get(x, yy) ?? '')) p.set(x, yy, H[1]);
    }
    if (up) return;
    const S = R.skin;
    const fx = side ? hx + 1.2 : hx;
    const bang = (x: number) => cy - 0.9 + (((Math.round(x) * 7) % 4 + 4) % 4) * 0.4;
    ball(p, fx, cy + 1.6, side ? 3.5 : 3.9, 3.4, faceRamp(S), 0, (x, y) => y + 0.5 >= bang(x) && (!side || x + 0.5 > hx - 0.2));
    const eyes = side ? [Math.round(hx + 2.6)] : [Math.round(hx - 2), Math.round(hx + 1)];
    for (const x of eyes) {
      p.set(x, ey + 1, pose.blink ? S[0] : f > 0.6 ? '#ff6a4a' : '#e8241c');
      p.set(x, ey, S[0]);
    }
    p.set(side ? Math.round(hx + 2) : Math.round(hx - 0.5), ey + 3, S[0]);
    return;
  }

  if (o.head === 'jester') {
    // 分叉小丑帽：左红右黑两只角往外卷，角尖挂银铃；白面具
    const RED = ramp(['#7a0a10', '#c81a22', '#ff3a44']);
    const BLK = ramp(['#1e1e24', '#34343c', '#50505a']);
    const BELL = ['#5a5a66', '#9a9aa6', '#d8d8e0', '#f4f4f8', '#ffffff'];
    const wob = Math.sin((pose.t ?? 0) * TAU) * 0.6;
    const horn = (sgn: number, R2: string[], back: boolean) => {
      const pts: [number, number][] = [[1.5, -3.6], [4, -5.6], [6.4, -5.8 + wob * 0.5], [7.8, -4.2 + wob], [8, -2 + wob]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        capsule(p, hx + sgn * x0, cy + y0, hx + sgn * x1, cy + y1, 1.5 - i * 0.2, R2, back ? 1 : 0);
      }
      const [bx, by] = pts[pts.length - 1];
      ball(p, hx + sgn * bx, cy + by + 1.2, 1.2, 1.2, BELL);
    };
    if (side) {
      horn(-1, BLK, true);
    } else {
      horn(-1, up ? BLK : RED, false);
      horn(1, up ? RED : BLK, false);
    }
    ball(p, hx, cy - 2.2, 4.8, 3, BLK, 0, (_, y) => y < cy - 0.4);
    capsule(p, hx, cy - 4.4, hx + 0.6, cy - 7, 1, BLK);
    ball(p, hx + 0.7, cy - 7.4, 1, 1, BELL);
    if (side) horn(1, RED, false);
    // 帽檐一道红边
    for (let x = Math.round(hx - 4); x <= Math.round(hx + 3); x++) p.set(x, Math.round(cy - 0.6), RED[2]);
    if (up) return;
    const S = R.skin;
    const fx = side ? hx + 1 : hx;
    ball(p, fx, cy + 1.6, side ? 3.4 : 3.8, 3, [S[2], S[3], S[3], S[4], S[4]], 0, (x, y) => y > cy - 0.2 && (!side || x + 0.5 > hx - 0.4));
    const eyes = side ? [Math.round(hx + 2.4)] : [Math.round(hx - 2), Math.round(hx + 1)];
    for (const x of eyes) p.set(x, ey + 1, pose.blink ? S[1] : EYE);
    // 右眼下一道红色菱形泪痕
    const tx = side ? eyes[0] : eyes[1];
    p.set(tx, ey + 2, RED[2]);
    p.set(tx, ey + 3, RED[1]);
    // 咧开的笑
    const mx = side ? Math.round(hx + 1.5) : Math.round(hx - 2);
    for (let i = 0; i < (side ? 3 : 4); i++) p.set(mx + i, ey + 3 + (i === 0 || i === 3 ? -0.6 : 0), EYE);
    return;
  }

  if (o.head === 'bone') {
    // 兽骨头盔：头顶一道骨冠，两侧青色的鳍；眼窝里青色魂火，下面一排牙
    const FIN = ramp(['#1a6a5a', '#3aa890', '#7ae0c8']);
    for (const sgn of side ? [-1] : [-1, 1]) {
      capsule(p, hx + sgn * 4.2, cy - 0.5, hx + sgn * 6.6, cy - 4.6, 1, FIN, side ? 1 : 0);
      capsule(p, hx + sgn * 4.6, cy + 1, hx + sgn * 6.8, cy - 1.4, 0.8, FIN, 1);
    }
    ball(p, hx, cy - 0.4, 4.9, 4.7, H);
    for (let y = Math.round(cy - 5.4); y <= Math.round(cy - 2); y++) p.set(hx - 0.5, y, H[3]);
    p.set(hx - 0.5, cy - 6, H[4]);
    if (side) {
      capsule(p, hx + 3.6, cy + 1.6, hx + 5.4, cy + 2.4, 1, H);
    }
    if (up) {
      for (let y = Math.round(cy - 3); y <= Math.round(cy + 3); y++) if (y % 2 === 0) p.set(hx - 0.5, y, H[1]);
      return;
    }
    const DARK = '#141418';
    const eyes = side ? [Math.round(hx + 2.2)] : [Math.round(hx - 2.4), Math.round(hx + 1.4)];
    for (const x of eyes) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p.set(x + dx, ey - 0.5 + dy, DARK);
      p.set(x + (side ? 1 : dxEye(x, hx)), ey + 0.5, lit);
      if (f > 0.6) p.set(x + (side ? 1 : dxEye(x, hx)), ey - 0.5, glowAt(o, 0.4));
    }
    const ty = Math.round(cy + 3.2);
    for (let x = Math.round((side ? hx + 1 : hx - 2.5)); x <= Math.round(hx + (side ? 4 : 2)); x++) p.set(x, ty, x % 2 ? DARK : H[3]);
    p.set(Math.round(side ? hx + 3.4 : hx - 0.5), ey + 2, DARK);
  }
}
const dxEye = (x: number, hx: number) => (x < hx ? 1 : 0);

/** 破披风：侧面往身后飘，正面从两肩露出来，背面盖住整个背；下摆一缕一缕的 */
function drawCloak(p: Pix, o: Outfit, cx: number, sy: number, hipY: number, pose: Pose) {
  const CL = ramp(o.cloak!);
  const wave = pose.cape ?? 0;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const bottom = hipY + (up ? 4.5 : 4);
  for (let y = Math.floor(sy - 0.5); y <= Math.ceil(bottom); y++) {
    const k = (y - sy) / (bottom - sy);
    let l: number, r: number;
    if (side) {
      l = cx - 2.4 - k * (3.4 + wave * 0.9);
      r = cx + 0.8 - k * 1.2;
    } else {
      const hw = 4.2 + k * (up ? 1.8 : 1.6);
      l = cx - hw;
      r = cx + hw;
    }
    for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
      if (x + 0.5 < l || x + 0.5 > r) continue;
      // 下摆撕成几缕：按列长短不一
      const ragged = bottom - (phash(x, 3, 11) * 2.4 + (x & 1) * 0.6);
      if (y > ragged) continue;
      const nx = ((x + 0.5 - (l + r) / 2) / ((r - l) / 2 || 1)) * 0.8;
      const fold = Math.sin(x * 1.3 + wave) > 0.6 ? 1 : 0;
      p.set(x, y, tone(CL, nx, k < 0.1 ? -0.6 : 0.1, fold));
    }
  }
}

/** 木盾：深色木板 + 铁边 + 一道血红 */
function drawShield(p: Pix, x: number, y: number, view: 'front' | 'side' | 'back') {
  const W = view === 'side' ? 3 : 5;
  const H = 8;
  const WOODS = ['#2e1a10', '#4a2a18', '#6e4226', '#8e5a34'];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const edge = i === 0 || i === W - 1 || j === 0 || j === H - 1;
      const xx = Math.round(x) + i;
      const yy = Math.round(y) + j;
      if ((j === H - 1 && (i === 0 || i === W - 1))) continue;
      let c = edge ? (i === 0 || j === 0 ? STEEL[2] : STEEL[1]) : WOODS[1 + ((i + (j >> 1)) % 2)];
      if (!edge && view !== 'back' && (i === 1 || j === 3) && phash(i, j, 4) > 0.25) c = j === 3 ? '#8a1a14' : '#6a1410';
      p.set(xx, yy, c);
    }
  }
  if (view === 'front') p.set(Math.round(x) + 2, Math.round(y) + 4, STEEL[3]);
}

/** 提灯：铁框玻璃罩，里面的火一明一暗，周围一圈光晕；返回灯芯位置给粒子用 */
function drawLantern(p: Pix, o: Outfit, hx: number, hy: number, pose: Pose, hidden = false): [number, number] {
  const x = Math.round(hx);
  const y = Math.round(hy + 1);
  const f = flicker(pose, 4);
  if (hidden) return [x, y + 3];
  const IRON = ['#1e1e22', '#3a3a42', '#5a5a64'];
  p.set(x, y, IRON[1]);
  for (let j = 1; j <= 4; j++) {
    for (let i = -1; i <= 1; i++) {
      const frame = i !== 0 || j === 1 || j === 4;
      p.set(x + i, y + j, frame ? IRON[j === 1 ? 2 : i < 0 ? 1 : 0] : glowAt(o, f + 0.2));
    }
  }
  p.set(x, y + 2, glowAt(o, f + 0.4));
  p.set(x, y + 3, glowAt(o, f));
  p.set(x, y + 5, IRON[0]);
  return [x, y + 2];
}

/** 粒子特效：画在描边之后，不带黑边；按帧进度循环，位置用哈希打散 */
function drawFx(p: Pix, o: Outfit, pose: Pose, at: { cx: number; sy: number; hipY: number; headY: number; lantern: [number, number] | null }) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  const { cx, sy, hipY, headY, lantern } = at;
  const put = (x: number, y: number, c: string) => {
    if (x >= -HERO_PAD.l && y >= -HERO_PAD.t && x < HERO_W + HERO_PAD.r && y < HERO_H + HERO_PAD.b) p.set(x, y, c);
  };
  if (o.fx === 'embers' || o.fx === 'wisps') {
    // 火星 / 鬼火：从灯里往上飘，越往上越暗，到头就灭
    const src: [number, number][] = [];
    if (lantern) src.push(lantern);
    src.push([cx, headY - 1]);
    for (let j = 0; j < 4; j++) {
      const [sx, sy0] = src[j % src.length];
      const ph = (t * (o.fx === 'wisps' ? 1 : 2) + j * 0.27 + (seed % 5) * 0.03) % 1;
      if (ph > 0.85) continue;
      const x = sx + Math.sin(ph * 7 + j * 2) * (1 + ph * 1.5) + (j - 1.5) * 0.6;
      const y = sy0 - 1 - ph * (o.fx === 'wisps' ? 9 : 7);
      put(x, y, ph < 0.25 ? G[2] : ph < 0.55 ? G[1] : G[0]);
      if (o.fx === 'wisps' && ph < 0.4) put(x, y + 1, G[0]);
    }
    if (o.fx === 'embers' && lantern && flicker(pose, 4) > 0.7) put(lantern[0] + 2, lantern[1] - 1, G[1]);
  } else if (o.fx === 'sparks') {
    // 青色灵光：身边几处一闪一闪的小方块和十字星
    for (let j = 0; j < 7; j++) {
      const ph = (t * 2 + j * 0.37 + phash(j, 1, 7)) % 1;
      if (ph > 0.55) continue;
      const ang = phash(j, 2, 7) * TAU + t * TAU * 0.5;
      const rad = 7 + phash(j, 3, 7) * 5;
      const x = Math.round(cx + Math.cos(ang) * rad);
      const y = Math.round((sy + hipY) / 2 - 2 + Math.sin(ang) * rad * 0.9);
      const c = ph < 0.2 ? G[2] : ph < 0.4 ? G[1] : G[0];
      put(x, y, c);
      if (ph < 0.15 && j % 2 === 0) {
        put(x - 1, y, G[0]);
        put(x + 1, y, G[0]);
        put(x, y - 1, G[0]);
        put(x, y + 1, G[0]);
      }
    }
  } else if (o.fx === 'mist') {
    // 脚下缠着的暗红雾气：贴地左右漂
    const MIST = ['#3a0a12', '#5a1420', '#8a1e28'];
    for (let j = 0; j < 9; j++) {
      const ph = (t + j / 9) % 1;
      const x = Math.round(cx - 9 + ((j * 7 + ph * 18) % 18));
      const y = HERO_FEET - (j % 3) - Math.round(Math.sin(ph * TAU) * 0.6);
      if (p.get(x, y) && j % 3 !== 0) continue;
      put(x, y, MIST[(j + Math.floor(ph * 3)) % 3]);
    }
    if (flicker(pose) > 0.75) put(cx + (pose.dir === 'side' ? 4 : 0), Math.round(headY - 1), G[1]);
  } else if (o.fx === 'confetti') {
    // 红白纸花：从帽尖的铃铛撒下来，转着往下飘
    for (let j = 0; j < 5; j++) {
      const ph = (t * 1.5 + j * 0.21 + (seed % 3) * 0.05) % 1;
      const side = j % 2 ? 1 : -1;
      const x = Math.round(cx + side * (8 - ph * 2) + Math.sin(ph * 9 + j) * 1.2);
      const y = Math.round(headY - 4 + ph * 16);
      if (p.get(x, y)) continue;
      const c = j % 3 === 0 ? '#ffffff' : ph < 0.5 ? G[1] : G[0];
      put(x, y, c);
      if ((Math.floor(ph * 8) + j) % 2 === 0) put(x + 1, y, c);
    }
  }
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

export function paintHeroSheet(outfit: Outfit = OUTFITS[0], canvas = document.createElement('canvas'), anims = HERO_ANIMS) {
  const total = anims.reduce((n, a) => n + a.frames, 0);
  const cols = 16;
  const rows = Math.ceil(total / cols);
  canvas.width = cols * FRAME_W;
  canvas.height = rows * FRAME_H;
  const ctx = canvas.getContext('2d')!;
  const frames: { name: string; x: number; y: number }[] = [];
  let k = 0;
  for (const a of anims) {
    for (let i = 0; i < a.frames; i++) {
      const x = (k % cols) * FRAME_W;
      const y = Math.floor(k / cols) * FRAME_H;
      ctx.clearRect(x, y, FRAME_W, FRAME_H);
      const pose = a.pose(i / a.frames, i);
      pose.t = i / a.frames;
      pose.seed = k;
      ctx.drawImage(drawFrame(pose, outfit).canvas(), x, y);
      frames.push({ name: `${a.key}-${i}`, x, y });
      k++;
    }
  }
  return { canvas, frames, total };
}
