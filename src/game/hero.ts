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
  head?: 'pumpkin' | 'voidpumpkin' | 'paleknight' | 'jester' | 'bone' | 'voidhood' | 'reaper' | 'vampire';
  /** 袍子下摆、兜帽边的金线 */
  trim?: string;
  /** 不背行囊、没有围巾尾巴 */
  noPack?: boolean;
  /** 身后的破披风 */
  cloak?: string[];
  /** 副手：提灯 / 盾牌 */
  offhand?: 'lantern' | 'shield';
  /** 发光色（眼睛、脸、灯、粒子）：暗、中、亮 */
  glow?: string[];
  /** 粒子特效 */
  fx?: 'embers' | 'wisps' | 'sparks' | 'mist' | 'confetti' | 'frostfire' | 'soulfire' | 'bats';
  /** 衣服上的菱格花纹（小丑） */
  harlequin?: boolean;
  /** 要用这个兑换码解锁 */
  code?: string;
  /** 暂未开放：衣橱里能看，谁都穿不上（用户 10-27：冰火咒师先不能解锁） */
  sealed?: boolean;
  /** 没有腿、飘在半空（用户 10-30 死神）：下身是一截往后飘的破袍尾巴，整个人上下浮动 */
  float?: boolean;
  /** 活动解锁：万圣节祭坛用南瓜积分兑换 */
  event?: 'halloween';
  /** 住在棺材里（用户 10-31 录屏）：角色站在一口立着的木棺材里，没有腿；待机时棺盖合上、棺材自己蹦、开盖、倒地再弹起来 */
  coffin?: boolean;
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
  {
    // 用户 10-27 给的录屏原型：黑袍尖帽的咒师，脸是一团黑只剩两点幽光，左手火右手冰，脚下金色法阵，待机会施法
    id: 'frostfire', name: tl('冰火咒师'), desc: tl('黑袍尖帽，帽檐下是一团看不见脸的黑暗，只剩两点幽光。左手燃火、右手凝冰，脚下一圈金色法阵，站着不动时会施法。'),
    skin: ['#6a6058', '#a89c90'], hair: ['#1a1620', '#2a2430', '#3c3448'],
    coat: ['#1c1630', '#2a2248', '#3a3062', '#564a88'], shirt: ['#241e3c', '#342c54'],
    pants: ['#14101e', '#1e1830'], boots: ['#3a2a18', '#6a4a28'], scarf: ['#2a2248', '#3a3062'],
    pack: ['#2a2248', '#3a3062', '#564a88'], roll: '#2a2248',
    head: 'voidhood', noPack: true, cloak: ['#181430', '#262040', '#38305a'], trim: '#e0a030',
    glow: ['#1a6ab0', '#4ad0ff', '#e0ffff'], fx: 'frostfire', sealed: true,
  },
  {
    // 用户 10-30：万圣节死神皮肤。没有腿、飘在半空，待机时从袍子里掏出镰刀耍一轮，镰刀上烧着魂火；百帧特效
    id: 'reaper', name: tl('幽冥死神'), desc: tl('兜帽下是一张骷髅脸，眼窝里烧着幽绿的魂火。没有腿，破烂的黑袍下摆散成雾气，整个人飘在半空；站着不动时会从袍子里抽出燃着魂火的巨镰，耍上一轮再散掉。'),
    skin: ['#8a887c', '#dcdad0'], hair: ['#141020', '#241c34', '#38304c'],
    coat: ['#141020', '#241c34', '#38304c', '#5e5078'], shirt: ['#1c1628', '#2c2440'],
    pants: ['#0a0810', '#141020'], boots: ['#0a0810', '#141020'], scarf: ['#1c1628', '#2c2440'],
    pack: ['#1c1628', '#2c2440', '#463a5c'], roll: '#1c1628',
    head: 'reaper', noPack: true, float: true, cloak: ['#0c0a12', '#181424', '#262034'],
    glow: ['#1a7a40', '#4ae080', '#d8ffe8'], fx: 'soulfire', event: 'halloween',
  },
  {
    // 用户 10-31 录屏原型：立着的木棺材，棺盖上一个金十字；里面住着一个红眼吸血鬼。待机时棺材自己晃、蹦、小鬼探头、开盖放蝙蝠、倒地躺平、再弹起来
    id: 'coffin', name: tl('棺材伯爵'), desc: tl('一口立着的旧木棺材，盖上钉着金十字，里面住着苍白的红眼伯爵。干活时开盖伸手，站着不动时棺材会自己晃、蹦跶，吱呀开盖放出蝙蝠，然后砰地倒在地上躺一会儿再弹起来。'),
    skin: ['#9a9aa8', '#eceaf2'], hair: ['#08080c', '#141418', '#26262e'],
    coat: ['#0e0c12', '#1c1a22', '#2c2a34', '#46444e'], shirt: ['#c8c0c8', '#f4f0f4'],
    pants: ['#0e0c12', '#1c1a22'], boots: ['#0e0c12', '#1c1a22'], scarf: ['#6a0a14', '#b01a24'],
    pack: ['#1c1a22', '#2c2a34', '#46444e'], roll: '#1c1a22',
    head: 'vampire', noPack: true, coffin: true,
    glow: ['#8a0a14', '#ff2a2a', '#ffb0a0'], fx: 'bats', event: 'halloween',
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
export const outfitOf = (id?: string) => { const o = OUTFITS.find((o) => o.id === id); return o && !o.sealed ? o : OUTFITS[0]; };
const GOLD = ['#8a5a1a', '#c8902a', '#f0c050', '#fff0a0'];
const EYE = '#20141c';
const WOOD = ['#3a2414', '#6a4426', '#9a6a3c'];
const STEEL = ['#3e444c', '#7a828c', '#bcc4ce', '#f4f8fc'];
const BELT = ['#1e120a', '#3a2414', '#5a3a20'];

export type HeroDir = 'down' | 'up' | 'side';
export type HeroTool = 'pickaxe' | 'axe' | 'hoe' | 'sickle' | 'rod' | 'hammer' | 'knife' | 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'handaxe' | 'greatshield' | 'longbow' | 'crossbow' | 'warbow' | 'arbalest' | 'scythe' | 'none';

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
  /** 正面/背面骑坐：两腿分开跨在坐骑上，膝盖往外撇、小腿垂在两边（用户 10-30：正面看着像站着） */
  straddle?: boolean;
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
  /** 待机施法阶段（冰火咒师用）：抬手、掌心凝聚元素、白光召剑、握剑、剑散成光点、放下手；castK 是该阶段的进度 0-1 */
  cast?: 'rise' | 'raise' | 'merge' | 'orb' | 'flash' | 'beam' | 'slam' | 'wave' | 'fade' | 'lower';
  castK?: number;
  /** 死神待机（用户 10-30）：伸手到袍子里、镰刀凭空成形、持镰、旋镰、举镰、横扫、镰刀散成魂火、放下手；reapK 是阶段进度 0-1 */
  reap?: 'reach' | 'summon' | 'hold' | 'spin' | 'raise' | 'slash' | 'fade' | 'lower';
  reapK?: number;
  /** 飘浮外观：整个人离地的高度（负数向上） */
  hover?: number;
  /** 工具从手里长出来的比例 0-1（召唤镰刀时） */
  toolGrow?: number;
  /** 镰刀的刀刃朝哪一侧（1 / -1） */
  bladeFlip?: number;
  /** 棺材皮肤（用户 10-31）：棺盖打开的程度 0-1（没写就是全开）、整口棺材倾倒的角度（正数往左倒）、里面的人是否只剩剪影、红眼亮度、小鬼探头高度 */
  lid?: number;
  tilt?: number;
  dark?: boolean;
  eyeGlow?: number;
  ghost?: number;
  /** 棺材待机阶段：晃、蹦、小鬼探头、吱呀开缝、开盖、龇牙、倒地、躺着、弹起、落定 */
  cof?: 'sway' | 'hop' | 'ghost' | 'creak' | 'open' | 'grin' | 'fall' | 'lie' | 'rise' | 'settle';
  cofK?: number;
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
/** 死神巨镰的刀刃：从杆顶往一侧探出去、再往下弯成月牙。按 0-1 的位置返回 [沿杆高度, 横向距离, 厚度] */
function scytheBlade(s: number) {
  return [2.2 - s * s * 6.5, s * 9.5, 2.4 * (1 - s) + 0.5] as const;
}
/** 刀背那条边上的点（魂火从这里烧起来） */
function scytheEdge(hx: number, hy: number, a: number, flip: number, K = 1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const [h, u] = scytheBlade(i / 20);
    const [dx, dy] = v(a, (12 + h + 0.6) * K);
    const [px, py] = v(a + Math.PI / 2, u * flip * K);
    pts.push([hx + dx + px, hy + dy + py]);
  }
  return pts;
}

function drawTool(p: Pix, tool: HeroTool, hx: number, hy: number, a: number, pose: Pose): [number, number][] | undefined {
  const K = pose.toolGrow ?? 1;
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
  } else if (tool === 'scythe') {
    // 死神巨镰（用户 10-30 要炫酷）：乌黑的长杆缠着四道骨白绑带，杆顶一截铁套，月牙刀刃往一侧探出去再垂下来，
    // 刀背暗、刃口亮，刀身上三点幽绿符文，杆顶另一侧挂着一颗小骷髅
    const flip = pose.bladeFlip ?? 1;
    const DARK = ['#120c14', '#2a1e2c', '#4a3a4c'];
    handle(-4.5, 12, DARK);
    for (const w of [-2.5, 0.5, 3.5, 6.5]) {
      strip(w, -0.9, 0.9, (k) => (k < 0.5 ? '#dcd8cc' : '#a8a498'));
      strip(w + 0.7, -0.9, 0.9, () => '#8a867c');
    }
    strip(11, -1.1, 1.1, () => STEEL[1]);
    strip(11.8, -1.1, 1.1, () => STEEL[2]);
    strip(12.6, -0.8, 0.8, () => STEEL[0]);
    for (let i = 0; i <= 44; i++) {
      const s = i / 44;
      const [h, u, th] = scytheBlade(s);
      for (let w = 0; w <= th; w += 0.4) {
        const [x, y] = along(12 + h - w);
        const [bx, by] = perp(x, y, u * flip);
        p.set(bx, by, w < 0.5 ? STEEL[1] : w > th - 0.6 || s > 0.9 ? STEEL[3] : STEEL[2]);
      }
    }
    for (const s of [0.22, 0.42, 0.62]) {
      const [h, u, th] = scytheBlade(s);
      const [x, y] = along(12 + h - th * 0.45);
      p.set(...perp(x, y, u * flip), '#4ae080');
    }
    // 杆顶的小骷髅：3×3 骨白，两个黑眼
    const [kx, ky] = perp(...along(11.2), -1.9 * flip);
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]]) p.set(kx + dx, ky + dy, dy === 0 ? '#1a1418' : dy < 0 ? '#ece8dc' : '#b8b4a8');
    p.set(kx, ky, '#dcd8cc');
    return scytheEdge(hx, hy, a, flip, K);
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
  } else if (tool === 'bow' || tool === 'longbow' || tool === 'warbow') {
    // 弓竖在手里，弓背朝前；长弓更高、弯得更深、拉得更开；单手战弓短小、两端反曲
    const L = tool === 'longbow' ? 10 : tool === 'warbow' ? 6 : 7;
    const pull = (pose.draw ?? 0) * (tool === 'longbow' ? 7 : tool === 'warbow' ? 4.5 : 5);
    p.line(hx, hy - L, hx - pull, hy, '#e8e8e8');
    p.line(hx - pull, hy, hx, hy + L, '#e8e8e8');
    for (let i = -L; i <= L; i++) {
      const bulge = (1 - (i * i) / (L * L)) * (tool === 'longbow' ? 3.6 : 3);
      p.set(hx + bulge, hy + i, Math.abs(i) > L - 2 ? WOOD[0] : i < 0 ? WOOD[2] : WOOD[1]);
      p.set(hx + bulge + 1, hy + i, WOOD[0]);
    }
    if (tool === 'longbow') for (const i of [-L, L]) p.set(hx + 0.6, hy + i, GOLD[2]);
    // 战弓：两端往前翻卷的弓梢
    if (tool === 'warbow') for (const sg of [-1, 1]) { p.set(hx + 1, hy + sg * (L + 1), WOOD[0]); p.set(hx + 2, hy + sg * (L + 1), WOOD[2]); p.set(hx + 2, hy + sg * L, STEEL[2]); }
    p.rect(Math.round(hx + 2), Math.round(hy) - 1, 2, 2, '#e0d0a8');
    if (pose.draw && pose.draw > 0.2) {
      p.line(hx - pull, hy, hx + 4, hy, WOOD[2]);
      p.set(hx + 5, hy, STEEL[2]);
      p.set(hx + 6, hy, STEEL[3]);
      p.set(hx - pull - 1, hy - 1, '#e8e8e8');
      p.set(hx - pull - 1, hy + 1, '#e8e8e8');
    }
  } else if (tool === 'crossbow') {
    // 弩横端在胸前：木托朝前，弩臂横在前端；draw=1 时弦扣在机括上、箭已上好
    handle(-3.5, 6.5);
    p.set(...along(-3.8), WOOD[0]);
    const [nx, ny] = along(5.6);
    for (let i = -10; i <= 10; i++) {
      const k = i / 10;
      const [x, y] = perp(...along(5.6 - k * k * 1.6), k * 4.6);
      p.set(x, y, Math.abs(k) > 0.8 ? STEEL[3] : STEEL[1]);
    }
    p.set(nx, ny, GOLD[2]);
    const loaded = (pose.draw ?? 0) > 0.5;
    const [tx, ty] = loaded ? along(1.2) : along(4.6);
    p.line(...perp(...along(4), 4.6), tx, ty, '#e8e8e8');
    p.line(...perp(...along(4), -4.6), tx, ty, '#e8e8e8');
    if (loaded) {
      const [bx, by] = along(1.4);
      const [ex, ey] = along(8);
      p.line(bx, by, ex, ey, WOOD[2]);
      p.set(ex, ey, STEEL[3]);
    }
    p.set(...perp(...along(0.6), -1.2), STEEL[0]);
  } else if (tool === 'arbalest') {
    // 十字弩：比弩更长更粗的木托，钢弩臂很宽，前端有脚蹬；draw=1 时上好一支粗弩矢
    handle(-4.5, 7.5);
    p.set(...along(-4.8), STEEL[1]);
    p.set(...perp(...along(-3.6), -1.6), STEEL[2]);
    const [nx, ny] = along(6.4);
    for (let i = -12; i <= 12; i++) {
      const k = i / 12;
      const [x, y] = perp(...along(6.4 - k * k * 2), k * 6.2);
      p.set(x, y, Math.abs(k) > 0.85 ? STEEL[3] : STEEL[1]);
      const [x2, y2] = perp(...along(6.9 - k * k * 2), k * 6);
      p.set(x2, y2, STEEL[0]);
    }
    p.set(nx, ny, GOLD[2]);
    const [sx, sy] = along(8.4);
    p.set(sx, sy, STEEL[2]);
    p.set(...perp(sx, sy, 1), STEEL[2]);
    p.set(...perp(sx, sy, -1), STEEL[2]);
    const loaded = (pose.draw ?? 0) > 0.5;
    const [tx, ty] = loaded ? along(0.6) : along(5.2);
    p.line(...perp(...along(4.6), 6.2), tx, ty, '#e8e8e8');
    p.line(...perp(...along(4.6), -6.2), tx, ty, '#e8e8e8');
    if (loaded) {
      const [bx, by] = along(0.8);
      const [ex, ey] = along(9.6);
      p.line(bx, by, ex, ey, WOOD[2]);
      p.line(...perp(bx, by, 0.6), ...perp(ex, ey, 0.6), WOOD[1]);
      p.set(ex, ey, STEEL[3]);
      p.set(...along(10.4), STEEL[3]);
    }
  } else if (tool === 'handaxe') {
    // 单手斧：短柄，斧刃朝挥砍的方向，带一个下勾的斧须
    handle(-1.5, 6.6);
    for (let i = 0; i <= 4; i++) {
      const t = 3.9 + i * 0.7;
      const out = 2.6 + (i === 0 ? 0.9 : i === 4 ? 0.4 : 0);
      strip(t, -0.4, -out, (k) => (k > 0.8 ? STEEL[3] : k > 0.4 ? STEEL[2] : STEEL[1]));
    }
    strip(6.6, -0.5, 1.2, () => STEEL[0]);
    p.set(...along(-1.8), GOLD[1]);
  }
}

/** 双手大盾：竖着挡在身前，盾面朝外，压在前手上面（手握在盾背后） */
function drawGreatShield(p: Pix, hx: number, hy: number) {
  const x0 = Math.round(hx) - 1;
  const y0 = Math.round(hy) - 9;
  const W = 5;
  const H = 15;
  for (let y = 0; y < H; y++) {
    // 下端收成尖
    const w = y > H - 4 ? W - (y - (H - 4)) : W;
    const off = Math.floor((W - w) / 2);
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === H - 1;
      const c = edge ? STEEL[x === 0 ? 1 : 2] : x < 2 ? STEEL[1] : x < 3 ? '#4a5a7a' : '#3a4866';
      p.set(x0 + off + x, y0 + y, c);
    }
  }
  // 中间一道金色的盾饰和高光
  for (let y = 3; y < H - 4; y++) p.set(x0 + 2, y0 + y, y === 6 ? GOLD[3] : GOLD[2]);
  p.set(x0 + 1, y0 + 6, GOLD[2]);
  p.set(x0 + 3, y0 + 6, GOLD[2]);
  p.set(x0 + 1, y0 + 1, STEEL[3]);
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
  if (o.head && o.head !== 'vampire') return drawSpecialHead(p, o, R, cx, cy, pose);
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
  if (o.head === 'vampire' && dir !== 'up') {
    // 伯爵（用户 10-31）：背头正中一个尖的美人尖，眼睛是红的、亮度按 eyeGlow 来，嘴角两颗獠牙
    const G = o.glow ?? ['#8a0a14', '#ff2a2a', '#ffb0a0'];
    const glow = pose.eyeGlow ?? 0.5;
    if (!side) {
      p.set(Math.round(hx), Math.round(cy - 1.4), HR[1]);
      p.set(Math.round(hx), Math.round(cy - 0.6), HR[0]);
    }
    for (let y = Math.round(cy - 1); y <= Math.round(cy + 3); y++) {
      for (let x = Math.round(cx - 4); x <= Math.round(cx + 5); x++) {
        if (p.get(x, y) !== EYE) continue;
        p.set(x, y, glow > 0.6 ? G[1] : glow > 0.2 ? mix(G[0], G[1], 0.5) : G[0]);
        if (glow > 0.75 && y === ey) { p.set(x, y, G[2]); }
      }
    }
    const fx0 = side ? Math.round(hx + 2.4) : Math.round(hx - 0.5);
    const fy0 = ey + 3;
    p.set(fx0 - (side ? 0 : 1), fy0, '#ffffff');
    if (!side) p.set(fx0 + 1, fy0, '#ffffff');
    else p.set(fx0 + 1, fy0, '#ffffff');
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
  const float = !!o.float;
  const coffin = !!o.coffin;
  const noLegs = float || coffin;

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
  // 飘着的死神没有腿：腰的高度固定，再加上浮动
  const hipY = noLegs
    ? ground - 6 + crouch + (pose.hop ?? 0) + (float ? pose.hover ?? -2 : 0)
    : side
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
  if (noLegs) {
    // 没有腿，下身在身体之后画成一截袍尾
  } else if (side) {
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
    // 跨坐：大腿从胯部往两边斜着伸出去（正面看短），膝盖在外，小腿往下收，靴尖朝外
    const straddle = (k: number) => {
      const hx = cx + k * 1.6;
      const kx = cx + k * 4.6;
      const ky = hipY + 1.6;
      const fx = cx + k * 5;
      const fy = hipY + 4.4;
      capsule(p, hx, hipY, kx, ky, 1.6, R.pants);
      capsule(p, kx, ky, fx, fy, 1.3, R.pants);
      capsule(p, fx, fy - 1.4, fx, fy, 1.45, up ? R.boots.map((_, i) => R.boots[Math.max(0, i - 1)]) : R.boots);
      ball(p, fx + k * 0.6, fy + 0.3, 1.5, 0.9, R.boots);
    };
    if (pose.straddle) {
      straddle(-1);
      straddle(1);
    } else {
      leg(cx - 2, pose.legB ?? 0);
      leg(cx + 2, pose.legF ?? 0);
    }
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
      p.set(Math.floor(cx - open - 0.5), y, o.trim ?? C[3]);
      p.set(Math.ceil(cx + open - 0.5), y, o.trim ? mix(o.trim, '#000000', 0.3) : C[2]);
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
  // 袍子下摆的金线
  if (o.trim) {
    for (let x = Math.floor(cx - (side ? 2.9 : 4.2)); x <= Math.ceil(cx + (side ? 3 : 4.2)); x++) {
      const y = Math.ceil(hipY);
      if (C.includes(p.get(x, y) ?? '')) p.set(x, y, o.trim);
    }
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

  // ---- 咒师的长袍下摆（用户 10-27：下身要有披风感，脚别露出来）：从腰下一直罩到脚面，只露一点靴尖；走路时随步子摆动 ----
  if (o.head === 'voidhood') {
    const top = Math.floor(hipY) - 1;
    const bottom = HERO_FEET - 1;
    const swing = side ? (pose.legF ?? 0) * 2.2 : 0;
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / (bottom - top);
      let l: number, r: number;
      if (side) {
        l = cx - 2.8 - k * (2 + wave * 0.4) + swing * k * 0.4;
        r = cx + 3 + k * 1.8 + swing * k;
      } else {
        const hw = 4 + k * 2.8;
        l = cx - hw;
        r = cx + hw;
      }
      for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
        const px = x + 0.5;
        if (px < l || px > r) continue;
        // 下摆撕成几缕
        const hem = bottom - phash(x, 9, 13) * 1.6;
        if (y > hem) continue;
        const nx = ((px - (l + r) / 2) / ((r - l) / 2 || 1)) * 0.9;
        // 布料的竖褶：一道亮一道暗，往下摆方向慢慢散开，走路时跟着飘
        const ph = Math.sin(x * 0.95 + k * 1.6 + wave * 0.4 + swing * 0.3);
        const dim = ph < -0.45 ? 1 : 0;
        const lit = ph > 0.55 ? 0.5 : 0;
        const c = y > hem - 1 ? (o.trim ?? C[3]) : y > hem - 2 ? C[3] : tone(C, nx * 0.6 + lit, 0.15 - lit * 0.6, dim);
        p.set(x, y, c);
      }
    }
    // 正面袍子中间的金线一直延到下摆
    if (down) for (let y = top; y < bottom - 1; y++) if (C.includes(p.get(cx - 1, y) ?? '')) p.set(cx - 1, y, o.trim ?? C[3]);
  }

  if (float) drawFloatTail(p, o, R, cx, hipY, pose);

  // ---- 正面 / 背面的手臂 ----
  let hands: [number, number][] = [];
  /** 死神的镰刀：握在哪只手、什么角度，头画完之后再画（刀刃举过头顶时要压在头上面） */
  let scythe: { hx: number; hy: number; a: number; grow: number; fade: number; flip: number } | null = null;
  let blade: [number, number][] | undefined;
  if (!side) {
    const [l, r] = pose.armLift ?? [0, 0];
    const arm = (x: number, lift: number) => {
      const top = sy + 1.1;
      const end = sy + 6.6 - lift;
      capsule(p, x, top, x, top + 2.8, 1.35, R.shirt);
      capsule(p, x, top + 2.8, x, end, 1.25, C);
      if (!up) ball(p, x, end + 0.5, 1.1, 1.05, R.skin);
    };
    if (o.head === 'voidhood' && down && pose.cast) {
      // 咒师施法（用户 10-27）：聚元素时双臂往两边伸直、掌心朝上；召剑和握剑时双手收到胸前握住剑柄；抬手和放手按进度插值
      const k = ease(pose.castK ?? 1);
      // 三种手位：垂着、张开、合在胸前（肘、手的相对位置）
      const DOWN = { ex: 4.4, ey: 3.9, hx: 4.4, hy: 7.1 };
      const WIDE = { ex: 6.4, ey: 3.2, hx: 8.2, hy: 1.6 };
      const HOLD = { ex: 4.8, ey: 4.6, hx: 1.3, hy: 4.8 };
      // 举剑过头
      const UP = { ex: 4.6, ey: 0.6, hx: 1.3, hy: -2.2 };
      const slamK = pose.cast === 'slam' ? (pose.castK ?? 0) : 0;
      const [from, to, kk] = pose.cast === 'rise' ? [DOWN, WIDE, k] : pose.cast === 'raise' ? [WIDE, WIDE, k] : pose.cast === 'merge' ? [WIDE, HOLD, k] : pose.cast === 'lower' ? [HOLD, DOWN, k]
        : pose.cast === 'slam' ? (slamK < 0.5 ? [HOLD, UP, ease(slamK * 2)] : [UP, HOLD, Math.min(1, (slamK - 0.5) * 4)]) : [HOLD, HOLD, k];
      const at = (key: keyof typeof DOWN) => lerp(from[key], to[key], kk);
      hands = [];
      for (const sg of [-1, 1]) {
        const sx = cx + sg * 4.2, sy0 = sy + 1.3;
        const ex = cx + sg * at('ex'), ey = sy + at('ey');
        const hx = cx + sg * at('hx'), hy = sy + at('hy');
        capsule(p, sx, sy0, ex, ey, 1.35, R.shirt);
        capsule(p, ex, ey, hx, hy, 1.2, C);
        ball(p, hx, hy, 1.15, 1.05, R.skin);
        hands.push([hx, hy]);
      }
    } else if (float && pose.reap) {
      // 死神掏镰刀（用户 10-30）：右手先探到肩后的袍子里、左手张开聚魂火，镰刀在右手里凭空成形，
      // 然后竖在身侧、绕手旋一整圈、双手举过头顶、从右上斜着横扫到左下，最后镰刀散成魂火、放下手
      const rp = pose.reap;
      const rk = pose.reapK ?? 1;
      const k = ease(rk);
      const fast = ease(Math.min(1, rk * 2.2));
      type H = { ex: number; ey: number; hx: number; hy: number };
      const DOWN: H = { ex: 4.4, ey: 3.9, hx: 4.4, hy: 7.1 };
      const BACK: H = { ex: 6.4, ey: 1.4, hx: 3.6, hy: -1.6 };
      const HOLD: H = { ex: 6.2, ey: 3.4, hx: 6.8, hy: 5.2 };
      const SPIN: H = { ex: 6, ey: 3, hx: 5, hy: 4 };
      const RAISE: H = { ex: 5.4, ey: 0.2, hx: 2.2, hy: -2.8 };
      const LOW: H = { ex: 5, ey: 4.6, hx: -1.5, hy: 7.6 };
      const LOPEN: H = { ex: 6, ey: 3.4, hx: 7.6, hy: 2.4 };
      const LRAISE: H = { ex: 5, ey: 0.8, hx: 0.6, hy: -1.4 };
      const LLOW: H = { ex: 4.6, ey: 4.2, hx: 2.6, hy: 6.8 };
      const SEQ: Record<NonNullable<Pose['reap']>, [[H, H, number], [H, H, number]]> = {
        reach: [[DOWN, BACK, k], [DOWN, LOPEN, k]],
        summon: [[BACK, BACK, k], [LOPEN, LOPEN, k]],
        hold: [[BACK, HOLD, Math.min(1, k * 2.5)], [LOPEN, DOWN, Math.min(1, k * 2.5)]],
        spin: [[HOLD, SPIN, Math.min(1, k * 3)], [DOWN, DOWN, k]],
        raise: [[SPIN, RAISE, k], [DOWN, LRAISE, k]],
        slash: [[RAISE, LOW, fast], [LRAISE, LLOW, fast]],
        fade: [[LOW, LOW, k], [LLOW, LLOW, k]],
        lower: [[LOW, DOWN, k], [LLOW, DOWN, k]],
      };
      const [right, left] = SEQ[rp];
      hands = [];
      for (const sg of [-1, 1]) {
        const [from, to, kk] = sg < 0 ? left : right;
        const at = (key: keyof H) => lerp(from[key], to[key], kk);
        const sx = cx + sg * 4.2, sy0 = sy + 1.3;
        const ex = cx + sg * at('ex'), ey = sy + at('ey');
        const hx = cx + sg * at('hx'), hy = sy + at('hy');
        capsule(p, sx, sy0, ex, ey, 1.35, R.shirt);
        capsule(p, ex, ey, hx, hy, 1.2, C);
        ball(p, hx, hy, 1.15, 1.05, R.skin);
        hands.push([hx, hy]);
      }
      // 镰刀角度：竖着略向右倾，旋镰绕手转一整圈，举镰时再往右歪一点，横扫从右上扫到左下
      const UPR = Math.PI - 0.15;
      const a = rp === 'spin' ? UPR + ease(rk) * TAU : rp === 'raise' ? lerp(UPR, Math.PI - 0.55, k) : rp === 'slash' ? lerp(Math.PI - 0.55, -0.75, fast) : rp === 'fade' ? -0.75 : UPR;
      if (rp !== 'reach' && rp !== 'lower') scythe = { hx: hands[1][0], hy: hands[1][1], a, grow: rp === 'summon' ? ease(rk) : 1, fade: rp === 'fade' ? rk : 0, flip: -1 };
    } else {
      arm(cx - 4.4, l);
      arm(cx + 4.4, r);
      hands = [[cx - 4.4, sy + 7.1 - l], [cx + 4.4, sy + 7.1 - r]];
    }
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

  // ---- 伯爵的高领披风：肩上两片竖起来的黑领子，里子暗红 ----
  if (o.head === 'vampire' && !up) {
    for (const sg of side ? [-1] : [-1, 1]) {
      const x0 = cx + sg * 4.4 + (side ? -0.4 : 0);
      capsule(p, x0, sy + 1, x0 + sg * 0.8, sy - 4.6, 1.7, C, 1);
      capsule(p, x0 - sg * 0.6, sy + 0.6, x0 - sg * 0.2, sy - 3.4, 0.7, ramp(o.scarf), 1);
    }
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
  if (o.head === 'voidhood' && !up) {
    // 咒师的披肩：肩上一圈厚厚的斗篷，下缘镶金线，肩膀看起来才像披着袍子
    for (const sx of side ? [cx + 0.4] : [cx - 4.4, cx + 4.4]) {
      ball(p, sx, sy + 0.8, side ? 3 : 2.4, 1.7, R.coat);
      p.line(sx - (side ? 2 : 1.6), sy + 2.1, sx + (side ? 2 : 1.6), sy + 2.1, o.trim ?? GOLD[1]);
    }
    // 领口的灰扣
    const bx = side ? cx + 2 : cx - 0.5;
    p.set(bx, sy + 1, '#b0b0b8');
    p.set(bx + 1, sy + 1, '#7a7a84');
    p.set(bx, sy + 2, '#8a8a94');
    p.set(bx + 1, sy + 2, '#5a5a64');
  }

  // ---- 头 ----
  drawHead(p, o, R, cx, headY, pose);
  if (scythe) blade = drawScythe(p, scythe, pose);

  if (up && !bare) capsule(p, cx - 4.3, sy - 0.2, cx + 4.3, sy - 0.2, 1.5, R.roll);

  // ---- 前面的手臂和工具 ----
  if (side) {
    const rs = float && pose.reap ? reapSide(pose) : null;
    const arm = sideArm(rs ? rs.armF : pose.armF ?? 0, rs ? rs.elbowF : pose.elbowF ?? 0, pose.reach ?? 0, 0);
    const tool = pose.tool ?? 'none';
    if (rs?.show) {
      scythe = { hx: arm.hx, hy: arm.hy, a: rs.a, grow: rs.grow, fade: rs.fade, flip: -1 };
      blade = drawScythe(p, scythe, pose);
    } else if (tool !== 'none' && tool !== 'greatshield') drawTool(p, tool, arm.hx, arm.hy, arm.a + (pose.toolTurn ?? 0), pose);
    arm.draw();
    if (tool === 'greatshield') drawGreatShield(p, arm.hx, arm.hy);
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
  const out = (coffin ? composeCoffin(p, o, pose, cx, ground) : p).outlineTinted();
  if (o.fx) drawFx(out, o, pose, { cx, sy, hipY, headY, lantern, hands, blade, scythe, ground });
  return out;
}

// ---- 棺材皮肤（用户 10-31 录屏）：先把棺材的背板和红绒里子画在底图上，再把画好的人叠上去（合盖时人只剩剪影），最后盖棺盖、整口倾倒 ----
const COF_T = 25.5;
/** 棺材正面六角轮廓：离顶 d 格处的半宽 */
const cofHalf = (d: number) => {
  const k = Math.max(0, Math.min(1, d / COF_T));
  return k < 0.28 ? lerp(3.6, 7.2, k / 0.28) : lerp(7.2, 4.4, (k - 0.28) / 0.72);
};
const COFWOOD = ['#2a1a10', '#4a3018', '#6a4a26', '#8a6436', '#a88048'];
const COFLID = ['#3a2412', '#5c3c1e', '#7c5630', '#9a7040', '#b88a52'];
const VELVET = ['#1c0810', '#3a0a16', '#5a1020', '#7a1a2a'];
const COFRIM = '#1a100a';
/** 小蝙蝠：两种拍翅姿势，5×3 */
const BAT: number[][][] = [
  [[1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 1, 0, 0]],
  [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [1, 0, 1, 0, 1]],
];
function drawBat(put: (x: number, y: number, c: string) => void, x: number, y: number, flap: number, c = '#141018') {
  const m = BAT[flap & 1];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) if (m[j][i]) put(x + i - 2, y + j - 1, c);
  put(x, y, '#2a2030');
}
function composeCoffin(p: Pix, o: Outfit, pose: Pose, cx: number, ground: number): Pix {
  const base = new Pix(p.w, p.h);
  base.ox = p.ox;
  base.oy = p.oy;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const lid = Math.max(0, Math.min(1, pose.lid ?? 1));
  const top = ground - COF_T + (pose.hop ?? 0);
  const g = o.glow ?? ['#8a0a14', '#ff2a2a', '#ffb0a0'];
  // ---- 小鬼探头：白布单子从棺材后面冒出来，两个黑眼睛，下摆几个波浪 ----
  if (pose.ghost && pose.ghost > 0.05) {
    const h = pose.ghost * 9;
    const gx = cx + (side ? -1 : 5.5);
    const gy = top + 2 - h;
    for (let y = 0; y < 9; y++) {
      const w = y < 2 ? 2 + y : 3.4;
      for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
        if (y === 8 && ((x + 10) % 3 === 1)) continue;
        if (Math.abs(x) > w + 0.3) continue;
        base.set(gx + x, gy + y, x < -1.5 ? '#c8c8d8' : y < 7 ? '#f4f4fc' : '#dcdce8');
      }
    }
    base.set(gx - 1, gy + 3, '#1a1a24');
    base.set(gx + 1, gy + 3, '#1a1a24');
    base.set(gx, gy + 5, '#8a8aa0');
  }
  if (side) {
    // ---- 侧面：窄窄的木箱，背板几道横木纹；棺盖是前面那块板，开盖时整块往前（右）推出去 ----
    const hw = 3.6;
    for (let y = Math.floor(top); y <= ground; y++) {
      const d = y - top;
      const taper = d < 7 ? (7 - d) * 0.25 : d > 18 ? (d - 18) * 0.15 : 0;
      for (let x = Math.floor(cx - hw + taper); x <= Math.ceil(cx + hw - taper); x++) {
        const edge = x <= cx - hw + taper + 0.5 || x >= cx + hw - taper - 0.5 || d < 0.5 || y >= ground - 0.5;
        // 背板那条边压暗两格、朝前的那条边提亮一格，木箱才有厚度；横木纹里撒一点颗粒
        const grain = phash(x, y, 4) > 0.82 ? 1 : 0;
        base.set(x, y, edge ? COFRIM : d % 6 < 1 ? COFWOOD[1] : x < cx - hw + taper + 2.5 ? COFWOOD[1 + grain] : x > cx + hw - taper - 1.8 ? COFWOOD[4 - grain] : x < cx - 1 ? COFWOOD[3 - grain] : COFWOOD[2 + grain]);
      }
    }
    // 里子：开盖后看得见一条红绒
    if (lid > 0.1) for (let y = Math.floor(top + 1); y < ground; y++) for (let x = Math.floor(cx - 1); x <= Math.ceil(cx + hw - 0.5); x++) if (base.get(x, y) !== COFRIM) base.set(x, y, x > cx + 1 ? VELVET[2] : VELVET[1]);
  } else {
    // ---- 正面 / 背面：六角木棺的正面：边一圈深色木框，里面铺暗红绒布（背面只有背板的木纹）。侧板、底板在最后按盒子的角度另画 ----
    for (let y = Math.floor(top); y <= ground; y++) {
      const d = y - top;
      const hw = cofHalf(d);
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        const px = x + 0.5;
        if (Math.abs(px - cx) > hw + 0.4) continue;
        const rim = Math.abs(px - cx) > hw - 1 || d < 1 || y >= ground - 0.5;
        const grain = phash(x, y, 7) > 0.8 ? 1 : 0;
        if (rim) base.set(x, y, COFRIM);
        else if (up) base.set(x, y, (x - Math.round(cx) + 20) % 4 === 0 ? COFWOOD[1] : d % 9 < 1 ? COFWOOD[1] : px < cx - 2 ? COFWOOD[3 - grain] : COFWOOD[2 + grain]);
        else {
          const inner = Math.abs(px - cx) < hw - 3 && d > 3 && d < COF_T - 3;
          base.set(x, y, inner ? VELVET[0] : Math.abs(px - cx) > hw - 2 ? VELVET[3] : VELVET[2]);
        }
      }
    }
  }
  // ---- 把人叠上去：合盖时棺材里一片黑，只剩红眼和獠牙 ----
  // 盖子合着的时候人完全看不见，背面全被背板挡住；开着时露在棺材后面（侧面是背板后面、正面是棺材顶上方）的部分也不画
  const eyeC = new Set([g[1], g[2], '#ffffff']);
  if (lid >= 0.15 && !up) {
    for (let i = 0; i < p.data.length; i++) {
      const c = p.data[i];
      if (!c) continue;
      const x = (i % p.w) - p.ox, y = Math.floor(i / p.w) - p.oy;
      if (side ? x + 0.5 < cx - 2.8 : y < top) continue;
      base.data[i] = pose.dark && !eyeC.has(c) ? mix(c, '#0c0810', 0.82) : c;
    }
  }
  // ---- 棺盖 ----
  if (!up && lid < 1) {
    const open = ease(lid);
    if (side) {
      // 前面那块板往前推出去，越开越斜
      const sh = open * 7;
      for (let y = Math.floor(top); y <= ground; y++) {
        const d = y - top;
        const taper = d < 7 ? (7 - d) * 0.25 : d > 18 ? (d - 18) * 0.15 : 0;
        const x0 = cx + 3.6 - taper + sh * (0.6 + 0.4 * (1 - d / COF_T));
        base.set(x0, y, COFRIM);
        base.set(x0 - 1, y, d % 6 < 1 ? COFLID[1] : COFLID[3]);
        if (open > 0.3) base.set(x0 + 1, y, COFLID[0]);
      }
    } else {
      // 正面：棺盖铰链在左边，开盖时整块往左转过去，看起来越来越窄；转过一半就看见盖子里面的红绒；
      // 盖子四边有倒角（左上亮、右下暗），几道竖木板带木纹，金十字钉在盖上、右下带一格投影
      const w = 1 - open * 0.94;
      const isCross = (u: number, d: number) => (Math.abs(u) < 0.6 && d > 4.5 && d < 15) || (Math.abs(u) < 3 && d > 7.5 && d < 9.5);
      for (let y = Math.floor(top + 1); y < ground; y++) {
        const d = y - top;
        const hw = cofHalf(d) - 1;
        const left = cx - hw;
        for (let x = Math.floor(left); x <= Math.ceil(cx + hw); x++) {
          const px = x + 0.5;
          if (px < left || px > cx + hw) continue;
          // 盖子上这一格原本在哪一列
          const ux = left + (px - left) / w;
          if (ux > cx + hw + 0.5) continue;
          const u = ux - cx;
          const plank = ((Math.round(u) + 40) % 4 === 0) ? 1 : 0;
          const grain = phash(Math.round(ux), y, 8) > 0.78 ? 1 : 0;
          let c: string;
          if (open > 0.5) c = Math.abs(u) > hw - 1.2 || d < 2 || d > COF_T - 2.5 ? COFLID[2] : grain ? VELVET[1] : VELVET[2];
          else if (u < -hw + 1.6 || d < 2.2) c = COFLID[4];
          else if (u > hw - 1.6 || d > COF_T - 3) c = COFLID[1];
          else if (plank) c = COFLID[1];
          else c = COFLID[3 - grain];
          // 金十字和它右下的投影
          if (open <= 0.5) {
            if (isCross(u, d)) c = (Math.abs(u) < 0.6 && u < 0) || (d < 8.5 && Math.abs(u) >= 0.6) ? GOLD[3] : GOLD[2];
            else if (isCross(u - 1, d - 1)) c = COFLID[0];
          }
          if (open > 0 && open <= 0.5) c = mix(c, '#100a08', open * 0.5);
          base.set(x, y, c);
        }
        // 盖子的外沿
        const r = left + (cx + hw + 0.5 - left) * w;
        base.set(r, y, COFRIM);
        if (open > 0.4) base.set(r - 1, y, COFLID[0]);
      }
      // 合着的时候盖缝里透出一线红光
      if (pose.eyeGlow && open < 0.08) for (let y = Math.floor(top + 4); y < ground - 3; y += 2) if (phash(y, pose.seed ?? 0, 3) < pose.eyeGlow) base.set(cx + cofHalf(y - top) - 0.5, y, g[0]);
    }
  }
  // ---- 整口倾倒 ----
  const tilt = pose.tilt ?? 0;
  if (side) {
    // 侧面：绕着底角转，越躺越扁
    if (Math.abs(tilt) < 0.01) return base;
    const out = new Pix(p.w, p.h);
    out.ox = p.ox;
    out.oy = p.oy;
    const pivX = cx - 4 * Math.max(-1, Math.min(1, tilt / 0.3));
    const sq = 1 - 0.62 * Math.abs(Math.sin(tilt));
    const cs = Math.cos(tilt), sn = Math.sin(tilt);
    for (let y = -p.oy; y < p.h - p.oy; y++) {
      for (let x = -p.ox; x < p.w - p.ox; x++) {
        const dx = x + 0.5 - pivX;
        const dy = (y + 0.5 - ground) / sq;
        const c = base.get(Math.floor(pivX + dx * cs - dy * sn), Math.floor(ground + dx * sn + dy * cs));
        if (c) out.set(x, y, c);
      }
    }
    return out;
  }
  return coffinBox(p, base, cx, ground, tilt, pose.seed ?? 0);
}

/**
 * 正面 / 背面的棺材当成一个有厚度的盒子画（用户 10-31：倒下去也要立体）：盖子那一面按角度贴上去，
 * 长边侧板和底板按盒子厚度另画。立着时镜头偏左上，能看见右侧板和底板；躺下时盖子朝天、压扁一半，下面露出整条长边侧板。
 * 三个方向的屏幕向量：A 沿棺材长度、V 沿宽度、D 沿厚度（从背板指向盖子）
 */
function coffinBox(p: Pix, base: Pix, cx: number, ground: number, tilt: number, seed: number): Pix {
  const out = new Pix(p.w, p.h);
  out.ox = p.ox;
  out.oy = p.oy;
  const sn = Math.sin(tilt), cs = Math.cos(tilt);
  const A = [-sn, -cs], V = [cs, -sn * 0.5], D = [-0.75 * (1 - sn), -(0.25 + 0.75 * sn)];
  const T = 4;
  // 转轴在底部偏左的角上；O 是盖子上 (u=0, v=0) 那一点在屏幕上的位置
  const pivX = cx - 4 * Math.max(-1, Math.min(1, tilt / 0.3));
  const O = [pivX + (cx - pivX) * V[0], ground + (cx - pivX) * V[1]];
  const at = (u: number, v: number, w: number): [number, number] => [O[0] + u * A[0] + v * V[0] + (w - T) * D[0], O[1] + u * A[1] + v * V[1] + (w - T) * D[1]];
  // 哪条长边、哪头看得见：背板相对盖子的偏移（-D）朝哪边，那边的侧板就露出来
  const sideSign = -(D[0] * V[0] + D[1] * V[1]) > 0 ? 1 : -1;
  const endDot = -(D[0] * A[0] + D[1] * A[1]);
  const face = (u: number, v: number, w: number, c: string) => { const [x, y] = at(u, v, w); out.set(x, y, c); };
  for (let u = 0; u <= COF_T; u += 0.5) {
    const hw = cofHalf(COF_T - u) - 0.5;
    for (let w = 0; w <= T; w += 0.5) {
      const c = w < 0.6 ? COFRIM : u % 5 < 0.5 ? COFWOOD[1] : phash(Math.round(u * 2), Math.round(w * 2), 6) > 0.82 ? COFWOOD[1] : w > T - 0.9 ? COFWOOD[3] : COFWOOD[2];
      face(u, sideSign * hw, w, c);
      face(u, sideSign * (hw - 0.5), w, c);
    }
  }
  if (Math.abs(endDot) > 0.05) {
    const u0 = endDot < 0 ? 0 : COF_T;
    const hw = cofHalf(COF_T - u0);
    for (let v = -hw; v <= hw; v += 0.5) for (let w = 0; w <= T; w += 0.5) face(u0, v, w, w < 0.6 || Math.abs(v) > hw - 0.6 ? COFRIM : COFWOOD[1]);
  }
  // 盖子那一面：屏幕上每一格反算回盖子上的 (u, v)，从立着画好的那张图里取色
  const det = A[0] * V[1] - A[1] * V[0];
  for (let y = -p.oy; y < p.h - p.oy; y++) {
    for (let x = -p.ox; x < p.w - p.ox; x++) {
      const dx = x + 0.5 - O[0], dy = y + 0.5 - O[1];
      const u = (dx * V[1] - dy * V[0]) / det;
      const v = (A[0] * dy - A[1] * dx) / det;
      const c = base.get(Math.floor(cx + v), Math.floor(ground - u));
      if (c) out.set(x, y, c);
    }
  }
  void seed;
  return out;
}

/** 镰刀先画在一张空图上再拷过来：散掉时按像素哈希一格格消失（同一格每帧的哈希一样，所以是渐渐散而不是乱闪） */
function drawScythe(p: Pix, s: { hx: number; hy: number; a: number; grow: number; fade: number; flip: number }, pose: Pose) {
  const tp = new Pix(p.w, p.h);
  tp.ox = p.ox;
  tp.oy = p.oy;
  const edge = drawTool(tp, 'scythe', s.hx, s.hy, s.a, { ...pose, toolGrow: s.grow, bladeFlip: s.flip });
  for (let i = 0; i < tp.data.length; i++) {
    const c = tp.data[i];
    if (!c || (s.fade > 0 && phash(i % p.w, Math.floor(i / p.w), 5) < s.fade)) continue;
    p.data[i] = c;
  }
  return edge;
}

/** 死神侧面掏镰刀的手位：前臂角度、手肘、镰刀的绝对角度（0 朝下、π/2 朝前、π 朝上） */
function reapSide(pose: Pose) {
  const rp = pose.reap!;
  const rk = pose.reapK ?? 1;
  const k = ease(rk);
  const fast = ease(Math.min(1, rk * 2.2));
  type A = [number, number, number];
  const REST: A = [0.1, 0.25, 0], BACK: A = [3.4, 0.4, Math.PI - 0.4], HOLD: A = [0.9, 1, Math.PI - 0.15], SPIN: A = [1.2, 0.9, Math.PI - 0.15], RAISE: A = [2.6, 0.5, Math.PI + 0.45], LOW: A = [0.5, 0.9, 0.9];
  const SEQ: Record<NonNullable<Pose['reap']>, [A, A, number]> = {
    reach: [REST, BACK, k], summon: [BACK, BACK, k], hold: [BACK, HOLD, Math.min(1, k * 2.5)], spin: [HOLD, SPIN, Math.min(1, k * 3)],
    raise: [SPIN, RAISE, k], slash: [RAISE, LOW, fast], fade: [LOW, LOW, k], lower: [LOW, REST, k],
  };
  const [f, to, kk] = SEQ[rp];
  const a = rp === 'spin' ? SPIN[2] + ease(rk) * TAU : lerp(f[2], to[2], kk);
  return { armF: lerp(f[0], to[0], kk), elbowF: lerp(f[1], to[1], kk), a, grow: rp === 'summon' ? ease(rk) : 1, fade: rp === 'fade' ? rk : 0, show: rp !== 'reach' && rp !== 'lower' };
}

/** 死神的下身（用户 10-30：没有腿、飘在半空）：腰下一截破袍子越往下越窄，被风吹着往后飘，下摆撕成缕、末端泛绿散成雾 */
function drawFloatTail(p: Pix, o: Outfit, R: Ramps, cx: number, hipY: number, pose: Pose) {
  const side = pose.dir === 'side';
  const wave = pose.cape ?? 0;
  const C = R.coat;
  const G = o.glow ?? ['#1a7a40', '#4ae080', '#d8ffe8'];
  const top = Math.floor(hipY) - 1;
  const len = 8;
  const seed = pose.seed ?? 0;
  for (let y = top; y <= top + len; y++) {
    const k = (y - top) / len;
    // 往后（侧面是往左）飘：越往下偏得越多，走路时摆得更开
    const drift = side ? -(k * k * (3.5 + wave * 1.2)) : Math.sin(k * 2.2 + wave * 0.5) * k * 1.2;
    const hw = side ? 3 * (1 - k) + 0.8 : k < 0.3 ? 4 + k * 2 : 4.6 - (k - 0.3) * 5.2;
    const mid = cx + drift + (side ? 0.3 : 0);
    const l = mid - hw, r = mid + hw;
    for (let x = Math.floor(l); x <= Math.ceil(r); x++) {
      const px = x + 0.5;
      if (px < l || px > r) continue;
      const hem = top + len - phash(x, 7, 17) * 3;
      if (y > hem) continue;
      const nx = ((px - mid) / (hw || 1)) * 0.9;
      const ph = Math.sin(x * 0.95 + k * 1.8 + wave * 0.4);
      const dim = ph < -0.45 ? 1 : 0;
      const lit = ph > 0.55 ? 0.5 : 0;
      p.set(x, y, y > hem - 1 ? mix(C[1], G[0], 0.6) : tone(C, nx * 0.6 + lit, 0.15 - lit * 0.6, dim));
    }
  }
  // 袍尾下散开的几点雾
  for (let j = 0; j < 4; j++) {
    const ph = ((pose.t ?? 0) * 1.5 + j * 0.25 + (seed % 5) * 0.03) % 1;
    const x = cx + (side ? -3 - j * 1.6 - ph * 3 : (j - 1.5) * 2.4 + Math.sin(ph * 6 + j) * 1.2);
    const y = top + len - 1 + ph * 3 - (side ? j * 0.6 : 0);
    if (!p.get(Math.round(x), Math.round(y))) p.set(x, y, ph < 0.5 ? mix(C[2], G[0], 0.5) : mix(C[1], G[0], 0.35));
  }
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

  if (o.head === 'voidhood') return drawVoidHood(p, o, R, cx, cy, pose);
  if (o.head === 'reaper') return drawReaperHead(p, o, R, cx, cy, pose);
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
/** 冰火咒师的头：尖顶兜帽往一边弯、帽口镶金线，帽檐下一团黑，两只眼睛随施法变色，帽前两道白色的翎纹 */
function drawVoidHood(p: Pix, o: Outfit, R: Ramps, cx: number, cy: number, pose: Pose) {
  const { dir } = pose;
  const side = dir === 'side';
  const up = dir === 'up';
  const wave = pose.cape ?? 0;
  const HD = R.coat;
  const hx = side ? cx + 0.5 : cx;
  const trim = o.trim ?? GOLD[2];
  // 圆兜帽（用户 10-27：不要尖顶）：罩住整个头，头顶偏后多出一截软塌塌的帽兜垂下来，走路时轻轻晃
  const bend = side ? -1 : 1;
  if (side) {
    // 侧面（用户 10-27 参考图）：兜帽往脑后拖出一大截，越往后越细，收成一个尖角；下面顺着脖子披到肩上
    const sag = wave * 0.35;
    // 末端圆钝，不收成尖（用户 10-27）
    // 侧面（用户 10-27：不要尖）：脑后一个圆鼓鼓的大帽兜，整体像一颗往后偏的圆球
    ball(p, hx - 3.2 + sag * 0.3, cy - 1.2 + sag * 0.4, 6, 5.4, HD, 1);
    ball(p, hx - 1.6, cy - 0.8, 5.6, 5.4, HD);
    ball(p, hx + 0.2, cy - 0.4, 5.4, 5.5, HD);
    // 帽子后面顺着脖子披到肩上，和披风连成一片
    capsule(p, hx - 4.2, cy + 1, hx - 4.4, cy + 5.6, 2.4, HD, 1);
    capsule(p, hx + 2.6, cy + 3.4, hx + 3.4, cy + 5.6, 1.6, HD, 0);
    // 帽子上几道顺着拖尾走的褶子
    for (let i = 0; i < 3; i++) p.paint(hx - 3 - i * 2.4, cy + 0.2 - i * 0.6, HD[0]);
    p.paint(hx - 4.4, cy + 2, HD[0]);
  } else {
    // 正面 / 背面（用户 10-27 定稿，不要再改）：圆兜帽，头顶偏右多出一截软塌塌的帽兜垂下来，走路时轻轻晃
    ball(p, hx, cy - 0.6, 5.5, 5.3, HD);
    const fold: [number, number][] = [[hx + bend * 1.5, cy - 4.4], [hx + bend * 4.2, cy - 4.2 + wave * 0.15], [hx + bend * (6.2 + wave * 0.3), cy - 2.4 + wave * 0.4], [hx + bend * (6.6 + wave * 0.3), cy + 0.6 + wave * 0.5]];
    for (let i = 1; i < fold.length; i++) capsule(p, fold[i - 1][0], fold[i - 1][1], fold[i][0], fold[i][1], 2.3 - i * 0.45, HD, i > 1 ? 1 : 0);
    // 帽兜上的几道褶子
    for (let i = 0; i < 3; i++) p.paint(hx + bend * (3.2 + i * 1.1), cy - 3.4 + i * 1.5, HD[0]);
  }
  // 帽前两道白翎纹
  const W = '#f4f0f8';
  if (!up) {
    const fx0 = side ? hx + 1.4 : hx;
    for (let i = 0; i <= 4; i++) {
      p.paint(fx0 - 2 + i, cy - 2.2 - i * 0.8, W);
      if (!side) p.paint(fx0 + 2 - i, cy - 2.2 - i * 0.8, W);
    }
  } else {
    p.paint(hx - 1, cy - 4.6, W);
    p.paint(hx + 1, cy - 4.6, W);
  }
  if (up) return;
  // 帽檐下是一团黑：圆拱形的帽口，几乎占满正脸，顶上圆、下面平
  const VOID = ['#060408', '#060408', '#0a0810', '#0a0810', '#0e0c16'];
  const fx = side ? hx + 2 : hx;
  const top = side ? cy - 2.2 : cy - 2.6;
  const chin = side ? cy + 3.2 : cy + 3.6;
  const hw = side ? 3 : 4;
  const isFace = (x: number, y: number) => {
    const px = x + 0.5, py = y + 0.5;
    if (py > chin || py < top) return false;
    const dx = Math.abs(px - fx);
    if (side) {
      // 侧面帽口是个圆
      const dy = (py - (top + chin) / 2) / ((chin - top) / 2);
      return (dx / hw) * (dx / hw) + dy * dy <= 1;
    }
    const r = Math.min(1, (py - top) / hw);
    // 上半截是半圆，下半截是直边
    return dx <= (r < 1 ? Math.sqrt(Math.max(0, 1 - (1 - r) * (1 - r))) * hw : hw);
  };
  ball(p, fx, (top + chin) / 2, hw + 1, (chin - top) / 2 + 1, VOID, 0, isFace);
  // 帽口镶金线：黑洞周围一圈兜帽像素换成金色
  for (let y = Math.floor(top - 2); y <= Math.ceil(chin + 1); y++) {
    for (let x = Math.floor(fx - hw - 2); x <= Math.ceil(fx + hw + 2); x++) {
      if (isFace(x, y) || !HD.includes(p.get(x, y) ?? '')) continue;
      if (isFace(x - 1, y) || isFace(x + 1, y) || isFace(x, y + 1)) p.set(x, y, trim);
    }
  }
  if (pose.blink) return;
  // 眼睛：两个小亮点，旁边各带一格暗光；平时青色，凝聚元素时左红右青，光柱时紫色
  const cyan = ['#1e6a98', '#5ae0ff'];
  const red = ['#8a2418', '#ff6a4a'];
  const purple = ['#5a2a98', '#d090ff'];
  const ey = Math.round(cy + 0.9);
  const eyes: [number, string[]][] = side
    ? [[Math.round(hx + 1.2), pose.cast === 'beam' || pose.cast === 'slam' || pose.cast === 'wave' ? purple : pose.cast === 'raise' || pose.cast === 'rise' || pose.cast === 'merge' ? red : cyan]]
    : [[Math.round(hx - 2), pose.cast === 'beam' || pose.cast === 'slam' || pose.cast === 'wave' ? purple : pose.cast === 'raise' || pose.cast === 'rise' || pose.cast === 'merge' || pose.cast === 'orb' ? red : cyan], [Math.round(hx + 1), pose.cast === 'beam' || pose.cast === 'slam' || pose.cast === 'wave' ? purple : cyan]];
  const bright = flicker(pose, 2) > 0.45;
  for (const [x, c] of eyes) {
    // 亮点四周一圈暗光，眼睛才像在发光
    const halo = mix(c[0], '#060408', 0.45);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (VOID.includes(p.get(x + dx, ey + dy) ?? '')) p.set(x + dx, ey + dy, halo);
    p.set(x, ey, c[1]);
    if (side) p.set(x + 2, ey, bright ? c[1] : c[0]);
    else if (bright) p.set(x + (x < hx ? -1 : 1), ey, c[0]);
    p.set(x, ey + 1, c[0]);
  }
}

const BONE = ['#5a584e', '#8a887c', '#b8b6aa', '#dcdad0', '#f6f4ec'];
/** 死神（用户 10-30）：深兜帽罩着头，帽兜在脑后松松垂下一截；帽口一团黑，黑暗里浮着一张骷髅脸，眼窝里烧着幽绿魂火 */
function drawReaperHead(p: Pix, o: Outfit, R: Ramps, cx: number, cy: number, pose: Pose) {
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  const wave = pose.cape ?? 0;
  const HD = R.coat;
  const hx = side ? cx + 0.5 : cx;
  const G = o.glow ?? ['#1a7a40', '#4ae080', '#d8ffe8'];
  if (side) {
    ball(p, hx - 2.2 + wave * 0.1, cy - 1, 5.2, 5.2, HD, 1);
    ball(p, hx - 0.4, cy - 0.6, 5.2, 5.4, HD);
    capsule(p, hx - 4.6, cy + 0.6, hx - 5.4 - wave * 0.3, cy + 5.4, 2.2, HD, 1);
    capsule(p, hx + 2.8, cy + 3.2, hx + 3.4, cy + 5.4, 1.5, HD);
    for (let i = 0; i < 3; i++) p.paint(hx - 2.4 - i * 2, cy - 0.4 - i * 0.8, HD[0]);
  } else {
    ball(p, hx, cy - 0.6, 5.5, 5.3, HD);
    // 帽兜往左后方垂下去，走路时轻晃
    const fold: [number, number][] = [[hx - 1.5, cy - 4.4], [hx - 4.2, cy - 4 + wave * 0.15], [hx - 6.2 - wave * 0.3, cy - 2 + wave * 0.4], [hx - 6.4 - wave * 0.3, cy + 1 + wave * 0.5]];
    for (let i = 1; i < fold.length; i++) capsule(p, fold[i - 1][0], fold[i - 1][1], fold[i][0], fold[i][1], 2.2 - i * 0.45, HD, i > 1 ? 1 : 0);
    for (let i = 0; i < 3; i++) p.paint(hx - 3.2 - i * 1.1, cy - 3.4 + i * 1.5, HD[0]);
  }
  if (up) return;
  const VOID = ['#040306', '#040306', '#08060c', '#08060c', '#0c0a12'];
  const fx0 = side ? hx + 2 : hx;
  const top = side ? cy - 2.4 : cy - 2.8;
  const chin = side ? cy + 3.4 : cy + 3.8;
  const hw = side ? 3 : 4;
  const isFace = (x: number, y: number) => {
    const px = x + 0.5, py = y + 0.5;
    if (py > chin || py < top) return false;
    const dx = Math.abs(px - fx0);
    if (side) {
      const dy = (py - (top + chin) / 2) / ((chin - top) / 2);
      return (dx / hw) * (dx / hw) + dy * dy <= 1;
    }
    const r = Math.min(1, (py - top) / hw);
    return dx <= (r < 1 ? Math.sqrt(Math.max(0, 1 - (1 - r) * (1 - r))) * hw : hw);
  };
  ball(p, fx0, (top + chin) / 2, hw + 1, (chin - top) / 2 + 1, VOID, 0, isFace);
  // 骷髅：圆颅骨、窄下颌、一排牙、鼻孔
  const sx = side ? fx0 + 0.6 : fx0;
  const sy0 = (top + chin) / 2 - 0.2;
  ball(p, sx, sy0 - 0.4, side ? 2.4 : 3.1, 2.6, BONE, 0, isFace);
  ball(p, sx, sy0 + 2, side ? 1.8 : 2.2, 1.3, BONE, 1, isFace);
  const ty = Math.round(sy0 + 2.4);
  for (let i = side ? -1 : -2; i <= 2; i++) p.set(Math.round(sx) + i, ty, i & 1 ? BONE[4] : '#1a1418');
  p.set(Math.round(sx) + (side ? 1 : 0), Math.round(sy0 + 0.8), '#1a1418');
  if (side) p.set(Math.round(sx) + 1, Math.round(sy0 + 0.4), '#1a1418');
  // 眼窝：两个黑洞，里面一点魂火忽明忽暗；旋镰、举镰、横扫时烧得更旺，往上冒出一截
  const ey = Math.round(sy0 - 0.6);
  const bright = flicker(pose, 2) > 0.4;
  const blaze = pose.reap === 'raise' || pose.reap === 'slash' || pose.reap === 'spin';
  const eyes = side ? [Math.round(sx) + 1] : [Math.round(sx) - 2, Math.round(sx) + 1];
  for (const x of eyes) {
    p.rect(x, ey - 1, 2, 2, '#0a0810');
    const inner = side ? x : x < sx ? x + 1 : x;
    p.set(x, ey, G[1]);
    p.set(x + 1, ey, G[1]);
    p.set(inner, ey, bright || blaze ? G[2] : G[1]);
    p.set(inner, ey - 1, blaze ? G[1] : bright ? G[0] : '#0a0810');
    if (blaze) p.set(inner, ey - 2, bright ? G[1] : G[0]);
  }
}

/**
 * 细节火焰：以 (x0, y0) 为火苗底部中心、宽 w 高 h 的火焰场。越往上越窄，边缘按噪声舔动，噪声随帧号往上滚，
 * 中心是白黄的内焰、外面一层橙红的外焰，最外一圈暗红
 */
const FLAME = ['#7a1a10', '#d03a1a', '#ff7a2a', '#ffd060', '#fff8e0'];
function flameField(put: (x: number, y: number, c: string) => void, x0: number, y0: number, w: number, h: number, t: number, seed: number, R = FLAME, lean = 0) {
  for (let dy = 0; dy < h; dy++) {
    const yy = dy / h;
    const half = (w / 2) * (1 - yy * yy * 0.85) * (1 + 0.15 * Math.sin(t * TAU * 2 + dy * 0.8));
    const sway = Math.round(Math.sin(t * TAU * 3 + dy * 0.6) * yy * 1.2 + lean * yy);
    for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
      const edge = Math.abs(dx) / (half || 1);
      if (edge > 1) continue;
      const n = phash(dx + 40, dy - seed * 2, 21);
      const v = (1 - yy) * (1 - edge * 0.8) + (n - 0.5) * 0.4;
      if (v < 0.18) continue;
      put(x0 + dx + sway, y0 - dy, v > 0.82 ? R[4] : v > 0.62 ? R[3] : v > 0.42 ? R[2] : v > 0.28 ? R[1] : R[0]);
    }
  }
}
/** 小符文：3×3 的几个形状，围着角色转 */
const RUNES: number[][] = [[0, 1, 0, 1, 1, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 1, 0, 1], [1, 1, 1, 0, 1, 0, 0, 1, 0], [0, 1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 1, 1], [0, 1, 1, 0, 1, 0, 1, 1, 0]];

/** 冰火咒师的特效：脚下双层金色法阵、左手火右手冰、白光召剑、光剑、砸地冲击波，所有动作里法阵和火星冰晶都在 */
function drawFrostfireFx(p: Pix, o: Outfit, pose: Pose, at: { cx: number; sy: number; hipY: number; headY: number; hands: [number, number][] }, put: (x: number, y: number, c: string) => void) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const { cx, sy, hipY, headY, hands } = at;
  const empty = (x: number, y: number, c: string) => { if (!p.get(Math.round(x), Math.round(y))) put(x, y, c); };
  const cast = pose.cast;
  const k = pose.castK ?? 1;
  // ---- 脚下的法阵：外圈金环上亮点转动，内圈一圈符文反向转，环外放射光线，环上不时升起光点 ----
  const RING = ['#a86a14', '#e8a020', '#ffd850', '#fff4b0'];
  const PUR = ['#4a1e8a', '#9a5ae8', '#d8b8ff', '#ffffff'];
  const ry = 4.2, rx = 13;
  const gy = HERO_FEET - 0.4;
  const spin = t * TAU + seed * 0.37;
  const hot = cast === 'flash' || (cast === 'slam' && k > 0.5);
  // 环内铺一层稀疏的暗金光（隔点画），环本身两格厚
  for (let y = Math.floor(gy - ry); y <= Math.ceil(gy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - gy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 0.9 || ((x + y * 2 + Math.floor(t * 4)) % 3)) continue;
      empty(x, y, d > 0.55 ? RING[1] : RING[0]);
    }
  }
  for (const [rr, bright] of [[1, true], [0.9, false]] as [number, boolean][]) {
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * TAU;
      const x = cx + Math.cos(a) * rx * rr;
      const y = gy + Math.sin(a) * ry * rr;
      const kk = (Math.sin(a * 3 - spin) + 1) / 2;
      const c = hot ? (kk > 0.5 ? '#ffffff' : RING[3]) : kk > 0.8 ? RING[3] : kk > 0.45 ? RING[2] : RING[1];
      empty(x, y, bright ? c : mix(c, RING[0], 0.5));
    }
  }
  // 内圈符文：八个小点，每个点两格，反向转；握剑时变紫
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - spin * 0.7;
    const x = cx + Math.cos(a) * rx * 0.62;
    const y = gy + Math.sin(a) * ry * 0.62;
    const c = cast === 'beam' || cast === 'slam' ? PUR[2] : i % 2 ? RING[2] : RING[1];
    empty(x, y, c);
    empty(x + 1, y, cast === 'beam' || cast === 'slam' ? PUR[1] : RING[0]);
  }
  for (let j = 0; j < 10; j++) {
    const a = (j / 10) * TAU + spin * 0.5;
    const ph = (t * 2 + j * 0.3) % 1;
    const r0 = 0.55 + ph * 0.5;
    const x = cx + Math.cos(a) * rx * r0;
    const y = gy + Math.sin(a) * ry * r0;
    empty(x, y, ph < 0.5 ? RING[2] : RING[0]);
    if (ph < 0.3) empty(x + Math.cos(a), y + Math.sin(a) * 0.4, RING[3]);
  }
  // 环上升起的光点
  for (let j = 0; j < 6; j++) {
    const ph = (t * 1.2 + j * 0.17 + phash(j, seed % 3, 5) * 0.3) % 1;
    const a = (j / 6) * TAU + seed * 0.2;
    const x = cx + Math.cos(a) * rx * 0.95;
    const y = gy + Math.sin(a) * ry * 0.95 - ph * 9;
    empty(x, y, ph < 0.3 ? RING[3] : ph < 0.65 ? RING[2] : RING[0]);
  }
  // ---- 身边常驻：左边飘火星、右边飘冰晶 ----
  const FIRE = ['#c83a1a', '#ff7a2a', '#ffd060', '#fff8e0'];
  const ICE = ['#1a7ab8', '#4ac8ff', '#c8f4ff', '#ffffff'];
  for (let j = 0; j < 4; j++) {
    const ph = (t * 1.5 + j * 0.25 + (seed % 7) * 0.05) % 1;
    const fx = cx - 8 - (j % 2) * 2 + Math.sin(ph * 6 + j) * 1.5;
    const fy = hipY + 2 - ph * 15;
    empty(fx, fy, ph < 0.4 ? FIRE[2] : FIRE[1]);
    if (ph < 0.5) { empty(fx, fy + 1, FIRE[0]); empty(fx + 1, fy, FIRE[1]); }
    const ix = cx + 8 + (j % 2) * 2 + Math.sin(ph * 5 + j * 2) * 1.5;
    const iy = hipY + 1 - ((ph + 0.5) % 1) * 15;
    empty(ix, iy, ((ph + 0.5) % 1) < 0.4 ? ICE[2] : ICE[1]);
    if (((ph + 0.5) % 1) < 0.5) { empty(ix - 1, iy, ICE[0]); empty(ix, iy - 1, ICE[1]); }
  }
  if (pose.dir !== 'down' || hands.length < 2) return;
  const [[lx, ly], [rx2, ry2]] = hands;
  if (!cast) {
    // 站着的时候掌心也在阴燃：左手一小簇火、右手一粒冰光，一明一暗
    if (flicker(pose, 2) > 0.35) flameField(put, lx, ly - 1, 3, 4, t, seed);
    put(rx2, ry2 - 1.5, flicker(pose, 3) > 0.5 ? ICE[3] : ICE[2]);
    put(rx2, ry2 - 2.5, ICE[1]);
    return;
  }
  // 施法时绕身一圈金色符文（握剑时变紫），在身后的那几个被身体挡住
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + t * TAU * 1.2 + seed * 0.05;
    const ox = Math.round(cx + Math.cos(a) * 11);
    const oy = Math.round(sy + 3 + Math.sin(a) * 3.2);
    const rune = RUNES[(i + Math.floor(t * 6)) % RUNES.length];
    const c = cast === 'beam' || cast === 'slam' || cast === 'wave' || cast === 'fade' ? PUR[2] : Math.sin(a) > 0 ? RING[3] : RING[2];
    for (let j = 0; j < 9; j++) if (rune[j]) empty(ox + (j % 3) - 1, oy + Math.floor(j / 3) - 1, c);
  }
  if (cast === 'rise' || cast === 'raise') {
    // 掌心起火、凝冰：抬手时只有一点火星，抬到位后火越烧越旺、冰晶越长越大，火焰和冰雾绕着手螺旋上升
    const grow = cast === 'rise' ? k * 0.3 : 0.3 + k * 0.7;
    const h0 = Math.round(3 + grow * 10);
    flameField(put, lx, ly - 1, 3 + grow * 5, h0, t, seed, FLAME, -0.6);
    // 火星从火尖往上蹦
    for (let j = 0; j < 6; j++) {
      const ph = (t * 3 + j * 0.17 + phash(j, 4, 9) * 0.5) % 1;
      if (ph > grow) continue;
      empty(lx - 3 + j * 1.2 + Math.sin(ph * 10 + j) * 1.5, ly - 1 - h0 * 0.7 - ph * 7, ph < 0.4 ? FLAME[3] : ph < 0.7 ? FLAME[2] : FLAME[1]);
    }
    // 右手周围的霜雾：一团带噪声的冷光，越大越浓
    const mr = 2 + grow * 4;
    for (let dy = -Math.ceil(mr); dy <= Math.ceil(mr); dy++) {
      for (let dx = -Math.ceil(mr * 1.3); dx <= Math.ceil(mr * 1.3); dx++) {
        const d = Math.sqrt((dx / 1.3) * (dx / 1.3) + dy * dy) / mr;
        if (d > 1) continue;
        const n = phash(dx + 60, dy - seed, 33);
        const v = (1 - d) * 0.9 + (n - 0.5) * 0.5;
        if (v < 0.45) continue;
        empty(rx2 + dx, ry2 - 3 - grow * 2 + dy, v > 0.85 ? ICE[2] : v > 0.65 ? ICE[1] : ICE[0]);
      }
    }
    // 飘落的雪花（小十字）
    for (let j = 0; j < 4; j++) {
      const ph = (t * 1.2 + j * 0.25 + phash(j, 5, 9) * 0.5) % 1;
      if (ph > grow) continue;
      const x = rx2 - 5 + j * 3 + Math.round(Math.sin(ph * 7 + j) * 1.5);
      const y = ry2 - 10 + ph * 12;
      empty(x, y, ICE[3]);
      empty(x - 1, y, ICE[2]); empty(x + 1, y, ICE[2]); empty(x, y - 1, ICE[2]); empty(x, y + 1, ICE[2]);
    }
    // 绕手的火焰螺旋和冰雾螺旋
    const turns = grow * 1.5;
    for (let j = 0; j < 14; j++) {
      const ph = j / 14;
      if (ph > turns) continue;
      const a = ph * TAU * 2 + t * TAU * 2;
      empty(lx + Math.cos(a) * (3 + ph * 2), ly - 2 - ph * 9 + Math.sin(a) * 1.2, ph < 0.5 ? FIRE[2] : FIRE[1]);
      empty(rx2 + Math.cos(a + 1) * (3 + ph * 2), ry2 - 2 - ph * 9 + Math.sin(a + 1) * 1.2, ph < 0.5 ? ICE[2] : ICE[1]);
    }
    for (let j = 0; j < 5; j++) {
      const ph = (t * 3 + j * 0.2) % 1;
      if (ph > grow) continue;
      empty(lx - 2 + j * 1.2 + Math.sin(ph * 8 + j) * 1.5, ly - 2 - h0 - ph * 6, ph < 0.5 ? FIRE[2] : FIRE[0]);
    }
    // 右手冰晶：菱形晶体慢慢长大，四角的星光闪烁，周围小冰碴
    const ir = 1 + grow * 3.6;
    const cy0 = ry2 - 1.2 - ir;
    for (let dy = -Math.ceil(ir); dy <= Math.ceil(ir); dy++) {
      const w = (ir - Math.abs(dy)) * 0.75;
      if (w < 0) continue;
      for (let dx = -Math.floor(w); dx <= Math.floor(w); dx++) {
        put(rx2 + dx, cy0 + dy, dx === 0 && dy <= 0 ? ICE[3] : Math.abs(dx) + Math.abs(dy) < ir * 0.5 ? ICE[2] : dx < 0 ? ICE[2] : ICE[1]);
      }
    }
    if (grow > 0.4) {
      const tw = Math.floor(t * 12) % 2;
      for (const [dx, dy] of tw ? [[-4, -3], [4, 1], [0, -ir - 3]] : [[4, -4], [-4, 2], [0, -ir - 3]]) {
        empty(rx2 + dx, cy0 + dy, ICE[3]);
        empty(rx2 + dx + 1, cy0 + dy, ICE[1]);
        empty(rx2 + dx - 1, cy0 + dy, ICE[1]);
        empty(rx2 + dx, cy0 + dy - 1, ICE[1]);
        empty(rx2 + dx, cy0 + dy + 1, ICE[1]);
      }
    }
    for (let j = 0; j < 5; j++) {
      const ph = (t * 2 + j * 0.2) % 1;
      if (ph > grow) continue;
      empty(rx2 - 3 + j * 1.5, cy0 - ir - 1 - ph * 5, j % 2 ? ICE[2] : ICE[3]);
    }
    // 快聚满时两手之间拉出一道火冰交错的弧光
    if (grow > 0.75) {
      for (let i = 0; i <= 12; i++) {
        const kk = i / 12;
        const x = lerp(lx, rx2, kk);
        const y = lerp(ly, ry2, kk) - 4 - Math.sin(kk * Math.PI) * 5 + Math.sin(kk * 9 + t * TAU * 2) * 0.8;
        empty(x, y, kk < 0.5 ? (i % 2 ? FIRE[2] : FIRE[1]) : (i % 2 ? ICE[2] : ICE[1]));
      }
    }
  } else if (cast === 'merge' || cast === 'orb') {
    // 合掌：火和冰顺着手臂往胸前汇，越来越多；法球：一颗火冰各半、旋转的双色球，核心白亮，外面一圈火星和冰屑绕着飞
    const ox = cx - 0.5, oy = sy + 2.2;
    const r = cast === 'merge' ? 1 + k * 2.4 : 3.4 + Math.sin(k * TAU * 2) * 0.4;
    if (cast === 'merge') {
      for (let j = 0; j < 7; j++) {
        const ph = (t * 4 + j * 0.14) % 1;
        if (ph > 0.9) continue;
        const fx = lerp(lx, ox, ph), fy = lerp(ly - 3, oy, ph) - Math.sin(ph * Math.PI) * 3;
        const ix = lerp(rx2, ox, ph), iy = lerp(ry2 - 3, oy, ph) - Math.sin(ph * Math.PI) * 3;
        put(fx, fy, ph < 0.5 ? FLAME[3] : FLAME[2]);
        put(fx, fy + 1, FLAME[1]);
        put(ix, iy, ph < 0.5 ? ICE[3] : ICE[2]);
        put(ix + 1, iy, ICE[1]);
      }
      // 手上残留的火和冰慢慢熄
      const left = 1 - k;
      if (left > 0.15) flameField(put, lx, ly - 1, 2 + left * 4, Math.round(2 + left * 7), t, seed);
      if (left > 0.15) for (let dy = -1; dy <= 1; dy++) put(rx2, ry2 - 3 + dy, dy ? ICE[1] : ICE[3]);
    }
    const spin = t * TAU * 3;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const a = Math.atan2(dy, dx) + spin + d * 0.9;
        const fire = Math.sin(a) > 0;
        const R2 = fire ? FLAME : ICE;
        put(ox + dx, oy + dy, d < r * 0.35 ? '#ffffff' : d < r * 0.7 ? R2[3] : R2[2]);
      }
    }
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU - spin * 0.8;
      const rr = r + 2.5 + (j % 2);
      empty(ox + Math.cos(a) * rr * 1.3, oy + Math.sin(a) * rr, j % 2 ? FLAME[2] : ICE[2]);
    }
    if (cast === 'orb' && k > 0.6) {
      // 快召剑时法球往外冒白光
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + spin;
        const len = (k - 0.6) * 12;
        for (let q = r + 1; q < r + 1 + len; q++) empty(ox + Math.cos(a) * q * 1.3, oy + Math.sin(a) * q * 0.8, '#ffffff');
      }
    }
  } else if (cast === 'flash') {
    // 白光炸开：身前一团白加十二道放射线，一帧比一帧更长更散，法阵也亮成白色
    const mx = cx, my = sy + 5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + k * 0.5;
      const len = 5 + (i % 2) * 3 + k * 7;
      for (let r = 1; r <= len; r++) put(mx + Math.cos(a) * r * 1.4, my + Math.sin(a) * r * 0.8, r < len - 2 ? '#ffffff' : i % 3 ? '#e8d8ff' : '#d8b8ff');
    }
    const core = 2 + Math.round(k * 2);
    for (let dy = -core; dy <= core; dy++) for (let dx = -core; dx <= core; dx++) if (Math.abs(dx) + Math.abs(dy) <= core + 1) put(mx + dx, my + dy, '#ffffff');
    for (let j = 0; j < 10; j++) empty(mx - 12 + ((j * 5 + seed) % 24), HERO_FEET - 1 - (j % 4), j % 3 ? '#ffffff' : PUR[2]);
  } else if (cast === 'beam' || cast === 'slam' || cast === 'wave' || cast === 'fade') {
    // 召唤出的光剑：双手握住剑柄，剑尖朝下；剑身白芯紫边，边上几道亮光往下走，剑周围飘紫色光屑。
    // 举剑砸地时剑跟着手上下，砸下去从脚下放出一圈紫色冲击波。消散时从剑尖开始化成光点
    const gy = Math.round(ly);
    const len = Math.min(15, HERO_FEET + 0.5 - gy);
    const tip = gy + len;
    const fade = cast === 'fade' ? k : 0;
    const cut = tip - fade * (len + 4);
    const slamK = cast === 'slam' ? k : 0;
    const strike = slamK > 0.5;
    const glow = flicker(pose, 3);
    if (fade < 0.85) {
      for (let y = gy - 3; y < gy; y++) { put(cx - 1, y, '#3a2a50'); put(cx, y, '#5a4a70'); }
      put(cx - 0.5, gy - 3.6, GOLD[2]);
      for (let dx = -3; dx <= 2; dx++) put(cx + dx, gy, dx === -3 || dx === 2 ? GOLD[1] : GOLD[2]);
      put(cx - 1, gy - 1, GOLD[3]);
    }
    for (let y = gy + 1; y <= tip; y++) {
      if (y > cut) continue;
      const kk = (y - gy) / len;
      if (kk > 0.93) { put(cx - 1, y, PUR[2]); continue; }
      put(cx - 2, y, glow > 0.6 ? PUR[2] : PUR[1]);
      put(cx - 1, y, PUR[3]);
      put(cx, y, kk < 0.7 ? PUR[3] : PUR[2]);
      put(cx + 1, y, glow > 0.6 ? PUR[2] : PUR[1]);
      // 剑身两侧的光晕：两格宽，隔行闪
      if (!fade) {
        put(cx - 3, y, PUR[0]);
        put(cx + 2, y, PUR[0]);
        if ((y + seed) % 2 === 0) { empty(cx - 4, y, PUR[0]); empty(cx + 3, y, PUR[0]); }
      }
    }
    if (!fade) {
      for (let j = 0; j < 4; j++) {
        const ph = (t * 2 + j * 0.25) % 1;
        const y = Math.round(gy + 1 + ph * (len - 2));
        put(cx + (j % 2 ? 2 : -3), y, ph < 0.5 ? PUR[2] : PUR[1]);
        put(cx + (j % 2 ? 3 : -4), y, PUR[0]);
      }
      // 剑身上不时窜过的电光：一道锯齿从柄到尖
      if (seed % 3 === 0) {
        let zx = cx - 1 + (seed % 2 ? 2 : -3);
        for (let y = gy + 1; y <= tip; y += 2) {
          zx += (phash(y, seed, 44) > 0.5 ? 1 : -1);
          zx = Math.max(cx - 5, Math.min(cx + 4, zx));
          empty(zx, y, '#ffffff');
          empty(zx + (zx < cx ? -1 : 1), y + 1, PUR[2]);
        }
      }
      // 绕着剑飘的紫色光屑
      for (let j = 0; j < 8; j++) {
        const ph = (t * 1.5 + j * 0.125 + (seed % 4) * 0.03) % 1;
        const a = ph * TAU * 1.5 + j;
        empty(cx - 0.5 + Math.cos(a) * (4 + ph * 3), tip - 2 - ph * (len + 4) + Math.sin(a) * 0.8, ph < 0.3 ? PUR[3] : ph < 0.6 ? PUR[2] : PUR[1]);
      }
      if (!strike) for (let j = 0; j < 4; j++) empty(cx - 5 + ((j * 3 + seed * 3) % 10), HERO_FEET - (j % 2), PUR[1]);
    } else {
      // 剑化成的光点：从断口处往上飘散
      for (let j = 0; j < 10; j++) {
        const ph = (fade * 1.2 + j * 0.1) % 1;
        const x = cx - 1 + Math.round(Math.sin(j * 2.1 + fade * 6) * (2 + ph * 5));
        const y = cut - ph * 9 + (j % 3);
        empty(x, y, ph < 0.4 ? PUR[3] : ph < 0.7 ? PUR[2] : PUR[1]);
      }
    }
    if (cast === 'wave') {
      // 剑插在地上：接连两道冲击波往外扩，脚下八道紫色地裂光纹一闪一闪，剑尖处往上冒光柱
      for (const off of [0, 0.5]) {
        const w = (k + off) % 1;
        for (const [rr, c] of [[w, w < 0.3 ? PUR[3] : PUR[2]], [w - 0.15, PUR[1]]] as [number, string][]) {
          if (rr <= 0) continue;
          for (let i = 0; i < 96; i++) {
            const a = (i / 96) * TAU;
            empty(cx + Math.cos(a) * 16 * rr, gy + 1 + Math.sin(a) * 5 * rr, c);
          }
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3;
        const len = 6 + ((i * 3 + seed) % 4) * 2;
        for (let q = 2; q < len; q++) {
          if ((q + seed + i) % 2) continue;
          empty(cx + Math.cos(a) * q * 1.6, HERO_FEET - 0.5 + Math.sin(a) * q * 0.45, q < len * 0.6 ? PUR[2] : PUR[0]);
        }
      }
      for (let j = 0; j < 6; j++) {
        const ph = (t * 3 + j * 0.17) % 1;
        empty(cx - 3 + j + Math.round(Math.sin(ph * 6 + j) * 1), tip - 1 - ph * 12, ph < 0.4 ? PUR[3] : PUR[1]);
      }
    }
    if (strike) {
      // 砸地冲击波：一圈紫色椭圆从脚下向外扩，后面跟一圈暗紫；地面溅起碎光
      const w = (slamK - 0.5) * 2;
      for (const [rr, c] of [[w, w < 0.5 ? PUR[3] : PUR[2]], [w - 0.18, PUR[1]], [w - 0.32, PUR[0]]] as [number, string][]) {
        if (rr <= 0) continue;
        for (let i = 0; i < 96; i++) {
          const a = (i / 96) * TAU;
          empty(cx + Math.cos(a) * 15 * rr, gy + 1 + Math.sin(a) * 4.6 * rr, c);
        }
      }
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * TAU + seed;
        const r0 = 0.3 + w * 0.8;
        empty(cx + Math.cos(a) * 14 * r0, HERO_FEET - 1 - w * 6 - (j % 3), j % 2 ? PUR[3] : PUR[2]);
      }
      // 砸下那一下剑尖的闪光
      if (w < 0.4) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0]]) empty(cx - 1 + dx * 2, tip + dy, '#ffffff');
    }
  }
}

function drawCloak(p: Pix, o: Outfit, cx: number, sy: number, hipY: number, pose: Pose) {
  const CL = ramp(o.cloak!);
  const wave = pose.cape ?? 0;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  // 咒师的袍子：下摆撑得更开，像一只钟
  const bell = o.head === 'voidhood' || !!o.float;
  const bottom = hipY + (up ? 4.5 : bell && !side ? (o.float ? 3.5 : 5) : 4);
  for (let y = Math.floor(sy - 0.5); y <= Math.ceil(bottom); y++) {
    const k = (y - sy) / (bottom - sy);
    let l: number, r: number;
    if (side) {
      l = cx - 2.4 - k * (3.4 + wave * 0.9 + (bell ? 1 + wave * 0.6 : 0));
      r = cx + 0.8 - k * 1.2 + (bell ? k * 2.6 : 0);
    } else {
      // 咒师的披风从肩膀外侧披下来（用户 10-27：要有穿着披风的感觉），两边都比身体宽出一截
      const hw = bell ? 5.6 + k * 2.4 + (k < 0.2 ? 0.4 : 0) : 4.2 + k * (up ? 1.8 : 1.6);
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
      // 下摆每一缕的尖上镶金线；披风外沿亮一阶，内侧暗一阶，看起来才有厚度
      const edge = bell && !side ? (x + 0.5 < l + 1 ? -1 : x + 0.5 > r - 1 ? 0 : 1) : 0;
      p.set(x, y, o.trim && y > ragged - 1 ? o.trim : tone(CL, nx, k < 0.1 ? -0.6 : 0.1, Math.max(0, fold + edge)));
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
interface FxAt { cx: number; sy: number; hipY: number; headY: number; lantern: [number, number] | null; hands: [number, number][]; blade?: [number, number][]; scythe?: { hx: number; hy: number; a: number; grow: number; fade: number; flip: number } | null; ground?: number }
function drawFx(p: Pix, o: Outfit, pose: Pose, at: FxAt) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const G = o.glow ?? ['#c84a10', '#ffa020', '#fff0a0'];
  const { cx, sy, hipY, headY, lantern } = at;
  const put = (x: number, y: number, c: string) => {
    if (x >= -HERO_PAD.l && y >= -HERO_PAD.t && x < HERO_W + HERO_PAD.r && y < HERO_H + HERO_PAD.b) p.set(x, y, c);
  };
  if (o.fx === 'frostfire') return drawFrostfireFx(p, o, pose, at, put);
  if (o.fx === 'soulfire') return drawSoulfireFx(p, o, pose, at, put);
  if (o.fx === 'bats') return drawBatsFx(p, o, pose, at, put);
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

const SOUL = ['#0e3a24', '#1a7a40', '#4ae080', '#a8ffc8', '#f0fff4'];
/** 3×3 的小骷髅魂：骨白的脑壳、两个暗绿的眼窝、一格下巴 */
function soulSkull(put: (x: number, y: number, c: string) => void, x: number, y: number, c: string, eye = SOUL[1]) {
  for (const dx of [-1, 0, 1]) { put(x + dx, y - 1, c); put(x + dx, y, dx ? eye : c); }
  put(x, y + 1, c);
  put(x - 1, y + 1, SOUL[2]);
  put(x + 1, y + 1, SOUL[2]);
}
/**
 * 死神的魂火特效（用户 10-30：百帧、精美、镰刀炫酷）：
 * 常驻：脚下一圈幽绿的雾打转（人是飘着的）、袍尾往上飘魂火丝、三颗小骷髅魂绕身慢转；
 * 掏镰刀：魂火被吸进手里 → 白绿闪光里镰刀成形、冲击环散开 → 刀背烧着魂火、火星飘落 → 旋镰留残影 → 举镰时绕身一圈绿符文、眼火冲天 →
 * 横扫拉出一道绿白的月牙刀光、刀光里飞出魂魄、地上裂开绿光 → 镰刀散成往上飘的光点
 */
function drawSoulfireFx(p: Pix, o: Outfit, pose: Pose, at: FxAt, put: (x: number, y: number, c: string) => void) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const { cx, sy, hipY, headY, hands, blade, scythe } = at;
  const empty = (x: number, y: number, c: string) => { if (!p.get(Math.round(x), Math.round(y))) put(x, y, c); };
  const rp = pose.reap;
  const k = pose.reapK ?? 1;
  const side = pose.dir === 'side';
  const up = pose.dir === 'up';
  // ---- 脚下的雾：一圈在地上打转的暗绿雾点，偶尔冒起一点亮的 ----
  const gy = HERO_FEET - 0.6;
  for (let j = 0; j < 14; j++) {
    const a = (j / 14) * TAU + t * TAU * 0.5;
    const r = 0.55 + phash(j, 2, 9) * 0.45;
    const x = cx + Math.cos(a) * 8 * r;
    const y = gy + Math.sin(a) * 2.2 * r;
    empty(x, y, j % 4 ? SOUL[0] : SOUL[1]);
    if (j % 5 === 0 && flicker(pose, 2 + j) > 0.7) empty(x, y - 1, SOUL[1]);
  }
  // ---- 袍尾往上飘的魂火丝 ----
  for (let j = 0; j < 5; j++) {
    const ph = (t * 1.3 + j * 0.2 + (seed % 7) * 0.02) % 1;
    if (ph > 0.9) continue;
    const x = cx + (j - 2) * 3.2 + Math.sin(ph * 7 + j * 2) * 1.6;
    const y = hipY + 6 - ph * 16;
    empty(x, y, ph < 0.3 ? SOUL[3] : ph < 0.6 ? SOUL[2] : SOUL[1]);
    if (ph < 0.5) empty(x, y + 1, SOUL[1]);
  }
  // ---- 三颗小骷髅魂绕着身子慢慢转：转到身后的那颗被身体挡住 ----
  for (let j = 0; j < 3; j++) {
    const a = (j / 3) * TAU + t * TAU * 0.6;
    const x = Math.round(cx + Math.cos(a) * 11);
    const y = Math.round(sy + 2 + Math.sin(a) * 3.5 - Math.sin(t * TAU * 2 + j) * 1);
    if (Math.sin(a) < -0.2) continue;
    soulSkull(Math.sin(a) > 0.3 ? put : empty, x, y, Math.sin(a) > 0.5 ? SOUL[4] : SOUL[3]);
  }
  if (!rp) return;
  const grip = scythe ? [scythe.hx, scythe.hy] : hands[hands.length - 1];
  if (!grip) return;
  const [gx, gy2] = grip;
  if (rp === 'reach') {
    // 魂火从四面八方被吸进伸出去的那只手，另一只手掌心聚起一团绿光
    if (k < 0.3) return;
    for (let j = 0; j < 12; j++) {
      const ph = 1 - ((t * 3 + j * 0.1 + phash(j, 1, 9) * 0.4) % 1);
      const a = (j / 12) * TAU + j * 0.7;
      const r = 1.5 + ph * 11;
      empty(gx + Math.cos(a) * r, gy2 + Math.sin(a) * r * 0.7, ph < 0.3 ? SOUL[3] : ph < 0.6 ? SOUL[2] : SOUL[1]);
    }
    if (!side && hands[0]) {
      const [lx, ly] = hands[0];
      const g = (k - 0.3) / 0.7;
      put(lx, ly - 2, flicker(pose, 3) > 0.5 ? SOUL[3] : SOUL[2]);
      if (g > 0.4) { put(lx - 1, ly - 2, SOUL[1]); put(lx + 1, ly - 2, SOUL[1]); put(lx, ly - 3, SOUL[1]); }
    }
    return;
  }
  if (rp === 'summon') {
    // 手里炸开一团白绿的光：八道光芒先长后缩，一圈冲击环往外散，镰刀在光里成形
    const burst = Math.sin(Math.min(1, k * 1.3) * Math.PI);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3;
      const len = 2 + burst * 9;
      for (let r = 1.5; r < len; r += 0.7) empty(gx + Math.cos(a) * r, gy2 + Math.sin(a) * r, r < len * 0.5 ? SOUL[4] : r < len * 0.8 ? SOUL[3] : SOUL[2]);
    }
    const rr = k * 13;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      empty(gx + Math.cos(a) * rr, gy2 + Math.sin(a) * rr * 0.6, k < 0.5 ? SOUL[3] : SOUL[1]);
    }
    if (k < 0.5) for (let i = 0; i < 48; i += 2) { const a = (i / 48) * TAU; empty(gx + Math.cos(a) * rr * 0.6, gy2 + Math.sin(a) * rr * 0.4, SOUL[4]); }
    if (!side && hands[0]) {
      const [lx, ly] = hands[0];
      put(lx, ly - 2, SOUL[3]);
      put(lx, ly - 3, SOUL[2]);
    }
  }
  if (!blade || !scythe) return;
  // ---- 刀背上的魂火：每隔一点起一簇，举镰时最高，散掉时跟着变矮；火星从刀上飘下来 ----
  const heat = rp === 'summon' ? k * 0.6 : rp === 'hold' ? 0.7 + 0.3 * Math.min(1, k * 3) : rp === 'spin' ? 0.8 : rp === 'raise' ? 1 + k * 0.8 : rp === 'slash' ? 1.5 : rp === 'fade' ? 1 - k : 1;
  if (heat > 0.05) {
    for (let i = 0; i < blade.length; i += 2) {
      const [bx, by] = blade[i];
      const s = i / (blade.length - 1);
      const h = Math.round((2.5 + s * 3) * heat + 0.5);
      flameField(empty, bx, by, 2.2, h, t, seed + i * 3, SOUL, (scythe.flip < 0 ? 1 : -1) * 0.4);
    }
    for (let j = 0; j < 6; j++) {
      const ph = (t * 3 + j * 0.17 + phash(j, 4, 9) * 0.5) % 1;
      if (ph > heat * 0.7) continue;
      const [bx, by] = blade[Math.min(blade.length - 1, Math.floor(phash(j, seed % 3, 5) * blade.length))];
      empty(bx + Math.sin(ph * 10 + j) * 1.5, by - 2 - ph * 7, ph < 0.4 ? SOUL[3] : ph < 0.7 ? SOUL[2] : SOUL[1]);
    }
  }
  if (rp === 'spin') {
    // 旋镰的残影：刀刃在稍早两个角度的位置留两道越来越淡的暗绿影子（隔点画）
    for (const [back, c] of [[0.45, SOUL[1]], [0.9, SOUL[0]]] as [number, string][]) {
      const pts = scytheEdge(gx, gy2, scythe.a - back, scythe.flip);
      for (let i = 0; i < pts.length; i++) {
        if ((i + Math.floor(back * 4)) % 2) continue;
        const [x, y] = pts[i];
        empty(x, y, c);
        empty(x, y + 1, SOUL[0]);
      }
    }
    // 刀尖拖出的光迹
    const tip = blade[blade.length - 1];
    for (let j = 1; j <= 5; j++) {
      const pts = scytheEdge(gx, gy2, scythe.a - j * 0.12, scythe.flip);
      const [x, y] = pts[pts.length - 1];
      empty(x, y, j < 3 ? SOUL[3] : SOUL[2]);
    }
    empty(tip[0], tip[1] - 1, SOUL[4]);
  }
  if (rp === 'raise') {
    // 绕身一圈绿符文，身后的被身体挡住；两眼的魂火冲上去一截
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * TAU * 1.2;
      const ox = Math.round(cx + Math.cos(a) * 11);
      const oy = Math.round(sy + 3 + Math.sin(a) * 3.2);
      const rune = RUNES[(i + Math.floor(t * 6)) % RUNES.length];
      const c = Math.sin(a) > 0 ? SOUL[3] : SOUL[2];
      for (let j = 0; j < 9; j++) if (rune[j]) empty(ox + (j % 3) - 1, oy + Math.floor(j / 3) - 1, c);
    }
    if (!up) for (const [dx, h] of side ? [[3, 3]] : [[-2, 3], [2, 3]]) for (let j = 1; j <= h; j++) empty(cx + dx + (j > 1 ? Math.sin(t * TAU * 4 + j) * 0.8 : 0), headY - 1 - j, j === 1 ? SOUL[3] : j === 2 ? SOUL[2] : SOUL[1]);
  }
  if (rp === 'slash') {
    // 刀光：以手为圆心，从起手角度到当前角度拉出一道两格厚的绿白月牙，越靠近刀刃越亮、越早的越暗越稀
    const a0 = side ? Math.PI + 0.45 : Math.PI - 0.55;
    const a1 = scythe.a;
    const span = a0 - a1;
    const n = Math.max(2, Math.ceil(Math.abs(span) * 18));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const a = lerp(a0, a1, f);
      const age = 1 - f;
      if (age > 0.75 && (i & 1)) continue;
      for (const r of [13, 14.2, 15.4, 16.6]) {
        if (r > 15 && age > 0.5) continue;
        const [dx, dy] = v(a, r);
        const [px, py] = v(a + Math.PI / 2, (r - 12) * 0.9 * scythe.flip);
        const c = age < 0.15 ? SOUL[4] : age < 0.4 ? SOUL[3] : age < 0.7 ? SOUL[2] : SOUL[1];
        empty(gx + dx + px, gy2 + dy + py, c);
      }
    }
    // 刀光里飞出来的魂魄和地上的绿光裂纹
    if (k > 0.4) {
      const g = (k - 0.4) / 0.6;
      for (let j = 0; j < 4; j++) {
        const a = lerp(a0, a1, 0.3 + j * 0.2);
        const r = 16 + g * 7;
        const [dx, dy] = v(a, r);
        soulSkull(empty, Math.round(gx + dx), Math.round(gy2 + dy - g * 3), g < 0.5 ? SOUL[4] : SOUL[3], g < 0.5 ? SOUL[1] : SOUL[0]);
      }
      for (let j = 0; j < 7; j++) {
        if (j / 7 > g * 1.4) continue;
        const x = cx + (side ? 3 + j * 2.4 : -3 - j * 2.2);
        const y = HERO_FEET - (j % 2) - (j === 3 ? 1 : 0);
        empty(x, y, g < 0.6 ? SOUL[2] : SOUL[1]);
        empty(x + 1, y, SOUL[0]);
      }
    }
  }
  if (rp === 'fade') {
    // 镰刀散成光点往上飘
    for (let i = 0; i < blade.length; i += 2) {
      const ph = (k + phash(i, 3, 7) * 0.5) % 1;
      const [bx, by] = blade[i];
      empty(bx + Math.sin(ph * 6 + i) * 1.2, by - ph * 9, ph < 0.4 ? SOUL[3] : ph < 0.7 ? SOUL[2] : SOUL[1]);
    }
    const [hx2, hy2] = v(scythe.a, 4);
    for (let j = 0; j < 4; j++) {
      const ph = (k * 1.2 + j * 0.25) % 1;
      empty(gx + hx2 * j * 0.6 + Math.sin(ph * 5 + j) * 1.5, gy2 + hy2 * j * 0.6 - ph * 8, ph < 0.5 ? SOUL[2] : SOUL[1]);
    }
  }
}

/**
 * 棺材皮肤的特效（用户 10-31）：平时一只蝙蝠绕着棺材转、脚边一层紫雾；蹦起落地和倒地时扬起尘土；
 * 开缝时盖缝透红光、开盖时一群蝙蝠从棺材里飞出来、龇牙时红眼闪光；躺着的时候一只蝙蝠落在棺材上
 */
function drawBatsFx(p: Pix, o: Outfit, pose: Pose, at: FxAt, put: (x: number, y: number, c: string) => void) {
  const t = pose.t ?? 0;
  const seed = pose.seed ?? 0;
  const { cx, headY } = at;
  const ground = at.ground ?? HERO_FEET - 0.8;
  const empty = (x: number, y: number, c: string) => { if (!p.get(Math.round(x), Math.round(y))) put(x, y, c); };
  const cf = pose.cof;
  const k = pose.cofK ?? 1;
  const flap = Math.floor(t * 24 + seed) & 1;
  const DUST = ['#5a4a3a', '#8a7a62', '#b8a888'];
  const MIST = ['#2a1434', '#3e2050', '#58306c'];
  // 脚边的紫雾
  for (let j = 0; j < 7; j++) {
    const ph = (t + j / 7) % 1;
    const x = Math.round(cx - 9 + ((j * 5 + ph * 18) % 18));
    const y = Math.round(ground) - (j % 2) - Math.round(Math.sin(ph * TAU) * 0.6);
    empty(x, y, MIST[(j + Math.floor(ph * 3)) % 3]);
  }
  // 常驻一只蝙蝠绕着飞（躺着时落在棺材上）
  if (cf !== 'lie' && cf !== 'open' && cf !== 'grin' && cf !== 'fall') {
    const a = t * TAU + seed * 0.01;
    drawBat(put, Math.round(cx + Math.cos(a) * 13), Math.round(headY - 4 + Math.sin(a * 2) * 2.5), flap);
  }
  // 蹦起落地 / 倒地 / 弹起时扬起的尘土
  const dust = (amt: number, x0: number, spread: number) => {
    for (let j = 0; j < 8; j++) {
      if (phash(j, 1, 5) > amt) continue;
      const ph = amt;
      const x = x0 + (j - 3.5) * spread * (0.5 + ph);
      const y = ground - Math.abs(Math.sin(j * 1.7)) * (1 + ph * 4);
      empty(x, y, ph < 0.5 ? DUST[2] : ph < 0.8 ? DUST[1] : DUST[0]);
    }
  };
  if (cf === 'hop') {
    const land = Math.abs(Math.sin(k * TAU));
    if (land < 0.35 && pose.hop === 0) dust(1 - land / 0.35, cx, 2.2);
  }
  if (cf === 'fall' && k > 0.85) dust((k - 0.85) / 0.15, cx - 14, 2.4);
  if (cf === 'lie' && k < 0.25) dust(1 - k / 0.25, cx - 12, 2.6);
  if (cf === 'rise' && k > 0.8) dust((k - 0.8) / 0.2, cx, 2);
  if (cf === 'lie') {
    // 一只蝙蝠落在躺倒的棺材上，翅膀偶尔抖一下
    drawBat(put, Math.round(cx - 12), Math.round(ground - 6.5), Math.floor(t * 30 + seed) % 7 === 0 ? 1 : 0);
    // 旁边再飞走一只
    if (k > 0.3) drawBat(put, Math.round(cx - 4 + (k - 0.3) * 20), Math.round(ground - 10 - (k - 0.3) * 18 + Math.sin(k * 30) * 1.5), flap);
  }
  if (cf === 'open' || cf === 'grin') {
    // 一群蝙蝠从棺材里飞出来：开盖时往左上四散，龇牙时在头顶绕圈
    const G = o.glow ?? ['#8a0a14', '#ff2a2a', '#ffb0a0'];
    for (let j = 0; j < 4; j++) {
      const d = phash(j, 2, 9);
      const ph = cf === 'open' ? Math.max(0, k * 1.6 - j * 0.18) : 1;
      if (ph <= 0) continue;
      const ax = cx - 3 - ph * (8 + d * 10);
      const ay = headY - 2 - ph * (4 + j * 3) + Math.sin(ph * 9 + j) * 1.5;
      const bx = cf === 'grin' ? cx + Math.cos(t * TAU * 2 + j * 1.57) * (9 + j * 2) : ax;
      const by = cf === 'grin' ? headY - 6 - j * 1.5 + Math.sin(t * TAU * 2 + j * 1.57) * 2.5 : ay;
      drawBat(put, Math.round(bx), Math.round(by), (flap + j) & 1);
    }
    // 棺材里透出来的红光：围着开口一圈暗红亮点
    for (let j = 0; j < 6; j++) {
      const ph = (t * 2 + j * 0.17) % 1;
      empty(cx - 5 + j * 2 + Math.sin(ph * 6 + j) * 1.2, ground - 2 + ph * 3, ph < 0.5 ? G[0] : MIST[1]);
    }
    if (cf === 'grin' && Math.floor(k * 10) % 3 === 0) {
      // 眼睛闪一下：眼旁一格亮红
      for (const dx of pose.dir === 'side' ? [3.5] : [-3, 2]) empty(cx + dx, headY + 1, G[1]);
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

/** once：只播一遍（战斗出手），其余循环 */
export interface HeroAnim { key: string; frames: number; rate: number; once?: boolean; pose: (t: number, i: number) => Pose }

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
        cape: 1 + Math.abs(s), hover: -2 + (Math.abs(s) > 0.5 ? -1 : 0),
        // 棺材：合着盖往前一跳一跳地挪，落地时前倾
        lid: 0, dark: true, tilt: -0.1 - Math.max(0, -c) * 0.12,
      };
    }
    return {
      dir, hop: Math.abs(s) > 0.55 ? -1 : 0, legF: Math.max(0, s) * 2.4, legB: Math.max(0, -s) * 2.4,
      armLift: [Math.max(0, s) * 1.6, Math.max(0, -s) * 1.6], cape: s, hover: -2 + (Math.abs(s) > 0.5 ? -1 : 0),
      lid: 0, dark: true, tilt: s * 0.1,
    };
  },
});

/**
 * 待机 96 帧、8 帧每秒（12 秒一圈，呼吸 8 次）。普通外观只是呼吸眨眼；冰火咒师在这一圈里施法（用户 10-27 要十几帧以上的动作展示、再拉长、再加帧）：
 * 0-11 站立，12-17 抬手，18-35 掌心聚火凝冰，36-43 合掌把火冰汇到胸前，44-53 双色法球旋转，54-56 白光召剑，57-68 握剑，
 * 69-76 举剑砸地放冲击波，77-84 剑插在地上再放两道冲击波和地裂光纹，85-90 剑散成光点，91-95 放下手
 */
const CAST_PHASES: [number, Pose['cast']][] = [[12, undefined], [18, 'rise'], [36, 'raise'], [44, 'merge'], [54, 'orb'], [57, 'flash'], [69, 'beam'], [77, 'slam'], [85, 'wave'], [91, 'fade'], [96, 'lower']];
/**
 * 死神掏镰刀（用户 10-30，待机 120 帧、10 帧每秒）：0-19 飘着，20-31 右手探到肩后、左手聚魂火，32-39 镰刀在手里成形，
 * 40-63 竖镰在身侧烧着魂火，64-79 绕手旋一整圈留残影，80-91 双手举过头顶、符文绕身、眼火冲天，92-99 从右上横扫到左下拉出刀光，
 * 100-109 镰刀散成光点，110-119 放下手
 */
const REAP_PHASES: [number, Pose['reap']][] = [[20, undefined], [32, 'reach'], [40, 'summon'], [64, 'hold'], [80, 'spin'], [92, 'raise'], [100, 'slash'], [110, 'fade'], [120, 'lower']];
const IDLE_FRAMES = 120;
/**
 * 棺材皮肤待机（用户 10-31 录屏，120 帧）：0-15 立着轻晃，16-27 蹦两下，28-39 小鬼从棺材后面探头又缩回去，40-51 棺盖吱呀开一条缝、里面亮起红眼，
 * 52-65 棺盖大开、蝙蝠飞出来，66-75 伯爵剪影龇牙、眼睛闪光，76-85 整口棺材往左倒下去（盖子顺势合上），86-99 躺在地上，100-107 弹起来立住，108-119 落定晃两下
 */
const COF_PHASES: [number, Pose['cof']][] = [[16, 'sway'], [28, 'hop'], [40, 'ghost'], [52, 'creak'], [66, 'open'], [76, 'grin'], [86, 'fall'], [100, 'lie'], [108, 'rise'], [120, 'settle']];
function coffinPose(i: number): Partial<Pose> {
  const [cof, k] = phaseOf(COF_PHASES, i);
  const e = ease(k);
  const base: Partial<Pose> = { cof, cofK: k, lid: 0, dark: true, eyeGlow: 0, armLift: [0, 0] };
  switch (cof) {
    case 'sway': return { ...base, tilt: Math.sin(k * TAU * 2) * 0.07 };
    case 'hop': { const h = Math.abs(Math.sin(k * TAU)); return { ...base, hop: h > 0.3 ? -Math.round(h * 3) : 0, tilt: Math.sin(k * TAU * 2) * 0.05 }; }
    case 'ghost': return { ...base, ghost: Math.sin(k * Math.PI) };
    case 'creak': return { ...base, lid: e * 0.3, eyeGlow: Math.min(1, k * 1.6) };
    case 'open': return { ...base, lid: 0.3 + Math.min(1, k * 2.2) * 0.7, eyeGlow: 1 };
    case 'grin': return { ...base, lid: 1, eyeGlow: 1 };
    case 'fall': return { ...base, lid: Math.max(0, 1 - k * 2.2), eyeGlow: 1 - k, tilt: k * k * (Math.PI / 2) };
    case 'lie': return { ...base, tilt: Math.PI / 2, hop: k < 0.12 ? -1 : 0 };
    case 'rise': return { ...base, tilt: (1 - e) * (Math.PI / 2) - Math.sin(e * Math.PI) * 0.12 };
    default: return { ...base, tilt: Math.sin(k * TAU * 1.5) * 0.08 * (1 - k) };
  }
}
/** 按阶段表找出帧 i 所在的阶段和阶段内进度 */
function phaseOf<T>(table: [number, T][], i: number): [T, number] {
  let from = 0;
  for (const [end, c] of table) {
    if (i < end) return [c, (i - from + 0.5) / (end - from)];
    from = end;
  }
  return [table[table.length - 1][1], 1];
}
const idle = (dir: HeroDir): HeroAnim => ({
  key: `idle-${dir}`, frames: IDLE_FRAMES, rate: 10,
  pose: (t, i) => {
    const b = Math.sin(t * TAU * 8);
    // 冰火咒师的施法表是按 96 帧写的，换算到现在的帧数
    const [cast, castK] = phaseOf(CAST_PHASES, (i * 96) / IDLE_FRAMES);
    const [reap, reapK] = phaseOf(REAP_PHASES, i);
    return {
      dir, bob: b > 0.3 ? 1 : 0, legF: 0.12, legB: -0.1, armF: 0.1 + b * 0.05, armB: -0.1,
      elbowF: 0.25, elbowB: 0.2, cape: Math.round(1 + b), blink: i === 6 || i === 79, cast, castK, reap, reapK,
      // 飘着的外观：慢慢上下浮
      hover: -2 + Math.round(Math.sin(t * TAU * 3) * 1.4),
      // 棺材皮肤：按录屏的阶段表来（其他皮肤不看这些字段）
      ...coffinPose(i),
    };
  },
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
    return { dir, bob, straddle: true, armLift: [run ? 1 : 0.5, run ? 1 : 0.5], cape: run ? 2 : 0, blink: !run && i === 5 };
  },
});

/*
 * 战斗动作（用户 10-25）：每种武器各一套「出手」和「架势」。
 * 出手只在真正攻击的那一下播一遍（地图场景按攻速缩放），两次攻击之间停在架势里不乱挥。
 * 出手动作开头的蓄力要短，hit 是打中的时刻（0-1），特效在这时候放。
 */
export type FightWeapon = 'sword' | 'spear' | 'dagger' | 'handaxe' | 'greatshield' | 'shortbow' | 'longbow' | 'crossbow' | 'warbow' | 'arbalest' | 'staff' | 'fist';
export const FIGHT: Record<FightWeapon, { hit: number; ms: number }> = {
  sword: { hit: 0.42, ms: 640 },
  spear: { hit: 0.4, ms: 700 },
  dagger: { hit: 0.3, ms: 560 },
  handaxe: { hit: 0.45, ms: 680 },
  greatshield: { hit: 0.45, ms: 760 },
  shortbow: { hit: 0.55, ms: 720 },
  longbow: { hit: 0.6, ms: 900 },
  crossbow: { hit: 0.22, ms: 1100 },
  warbow: { hit: 0.42, ms: 460 },
  arbalest: { hit: 0.2, ms: 1400 },
  staff: { hit: 0.55, ms: 800 },
  fist: { hit: 0.3, ms: 520 },
};
/** 战斗站位（用户 10-25）：离怪多远开打，单位格。近战贴身，长枪隔半格，远程隔几格 */
export const FIGHT_RANGE: Record<FightWeapon, number> = {
  sword: 0, spear: 0.6, dagger: 0, handaxe: 0, greatshield: 0, fist: 0,
  shortbow: 3, longbow: 4, crossbow: 3.5, warbow: 3, arbalest: 4.5, staff: 3,
};
/** 装备的武器 id（已去掉品质后缀）对应哪套动作 */
export function fightWeapon(base: string): FightWeapon {
  const key = base.slice(base.indexOf('_') + 1);
  return key in FIGHT && key !== 'fist' ? (key as FightWeapon) : base ? 'sword' : 'fist';
}

const breathe = (t: number) => (Math.sin(t * TAU) > 0.2 ? 1 : 0);
const fight = (w: FightWeapon, frames: number, ready: (t: number) => Pose, swing: (t: number) => Pose): HeroAnim[] => [
  { key: `fight-${w}`, frames, rate: (frames * 1000) / FIGHT[w].ms, once: true, pose: swing },
  { key: `fight-${w}-ready`, frames: 6, rate: 5, pose: ready },
];
const FIGHT_ANIMS: HeroAnim[] = [
  // 剑：剑尖斜指前上方；出手时举过头顶，一刀劈下去再收回
  ...fight('sword', 10,
    (t) => ({ dir: 'side', tool: 'sword', armF: 1.2, elbowF: 0.4, toolTurn: 0.9, armB: 0.3, legF: 0.5, legB: -0.4, bob: breathe(t), cape: 1 }),
    (t) => ({
      dir: 'side', tool: 'sword', armB: 0.3, legF: keys([[0, 0.5], [0.4, 0.75], [1, 0.5]], t), legB: -0.45,
      armF: keys([[0, 1.2], [0.22, 3.5], [0.45, 0.55], [0.7, 0.7], [1, 1.2]], t),
      elbowF: keys([[0, 0.4], [0.22, 0], [0.7, 0], [1, 0.4]], t),
      toolTurn: keys([[0, 0.9], [0.22, 0.2], [0.45, 0], [0.7, 0], [1, 0.9]], t),
      cape: t > 0.3 ? 2 : 1, crouch: t > 0.4 && t < 0.7 ? 1 : 0,
    })),
  // 长枪：双手端平；往后一收，弓步把枪整个刺出去
  ...fight('spear', 10,
    (t) => ({ dir: 'side', tool: 'spear', armF: 1.45, armB: 1.3, reach: -1, toolTurn: 0.1, legF: 0.55, legB: -0.5, bob: breathe(t), cape: 1 }),
    (t) => ({
      dir: 'side', tool: 'spear', armF: 1.5, armB: 1.35, toolTurn: keys([[0, 0.1], [0.25, 0.15], [0.4, 0], [1, 0.1]], t),
      reach: keys([[0, -1], [0.25, -3.5], [0.4, 6], [0.65, 5], [1, -1]], t),
      legF: keys([[0, 0.55], [0.4, 0.95], [0.7, 0.9], [1, 0.55]], t), legB: keys([[0, -0.5], [0.4, -0.8], [1, -0.5]], t),
      crouch: t > 0.35 && t < 0.75 ? 1 : 0, cape: t > 0.35 ? 2 : 1,
    })),
  // 匕首：压低身子，反手握刀；出手是快速的两下连刺
  ...fight('dagger', 10,
    (t) => ({ dir: 'side', tool: 'dagger', crouch: 1 + breathe(t), armF: 1.1, elbowF: 0.6, armB: 0.9, elbowB: 0.6, legF: 0.6, legB: -0.5 }),
    (t) => ({
      dir: 'side', tool: 'dagger', crouch: 1, armB: 0.9, elbowB: 0.6, legF: 0.6, legB: -0.5,
      armF: keys([[0, 1.1], [0.15, 1.9], [0.3, 1.5], [0.45, 1.9], [0.6, 1.4], [1, 1.1]], t),
      elbowF: keys([[0, 0.6], [0.15, 0], [0.3, 0.4], [0.45, 0], [1, 0.6]], t),
      reach: keys([[0, 0], [0.15, 3], [0.3, 1], [0.45, 3], [0.7, 0], [1, 0]], t),
    })),
  // 单手斧：斧子扛在肩头；出手是从头顶往下一记重劈，后手张开保持平衡
  ...fight('handaxe', 10,
    (t) => ({ dir: 'side', tool: 'handaxe', armF: 2.3, elbowF: 0.6, toolTurn: 0.2, armB: 0.6, legF: 0.45, legB: -0.4, bob: breathe(t), cape: 1 }),
    (t) => ({
      dir: 'side', tool: 'handaxe', toolTurn: keys([[0, 0.2], [0.25, 0.5], [0.45, 0], [1, 0.2]], t),
      armF: keys([[0, 2.3], [0.25, 3.7], [0.45, 0.7], [0.65, 0.6], [1, 2.3]], t),
      elbowF: keys([[0, 0.6], [0.25, 0.3], [0.45, 0], [0.65, 0], [1, 0.6]], t),
      armB: keys([[0, 0.6], [0.3, -0.6], [0.6, -0.4], [1, 0.6]], t),
      legF: keys([[0, 0.45], [0.45, 0.8], [1, 0.45]], t), legB: -0.45,
      crouch: t > 0.42 && t < 0.72 ? 2 : 0, cape: t > 0.3 ? 2 : 1,
    })),
  // 双手大盾：盾牌竖在身前顶住；出手是往后蓄一下再整个人撞过去
  ...fight('greatshield', 10,
    (t) => ({ dir: 'side', tool: 'greatshield', armF: 1.5, elbowF: -0.2, armB: 1.3, elbowB: 0.2, crouch: 1, legF: 0.6, legB: -0.55, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'greatshield', armF: 1.5, elbowF: -0.2, armB: 1.3, elbowB: 0.2,
      reach: keys([[0, 0], [0.28, -2.5], [0.45, 5], [0.7, 4], [1, 0]], t),
      legF: keys([[0, 0.6], [0.45, 1.0], [0.7, 0.95], [1, 0.6]], t), legB: keys([[0, -0.55], [0.45, -0.85], [1, -0.55]], t),
      crouch: keys([[0, 1], [0.28, 2], [0.45, 1], [1, 1]], t), cape: t > 0.4 ? 2 : 1,
    })),
  // 短弓：弓垂在身前；举弓、拉满、放箭，动作轻快
  ...fight('shortbow', 10,
    (t) => ({ dir: 'side', tool: 'bow', armF: 1.0, armB: 0.6, legF: 0.4, legB: -0.4, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'bow', armF: keys([[0, 1.0], [0.25, 1.57], [0.8, 1.57], [1, 1.0]], t), armB: keys([[0, 0.6], [0.25, 1.5], [0.8, 1.5], [1, 0.6]], t),
      draw: keys([[0, 0], [0.25, 0.3], [0.5, 1], [0.56, 0], [1, 0]], t), legF: 0.4, legB: -0.4,
    })),
  // 长弓：弓更大，拉弦更慢更满，放箭后身子往后一仰
  ...fight('longbow', 12,
    (t) => ({ dir: 'side', tool: 'longbow', armF: 0.9, armB: 0.5, legF: 0.45, legB: -0.45, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'longbow', armF: keys([[0, 0.9], [0.2, 1.62], [0.85, 1.62], [1, 0.9]], t), armB: keys([[0, 0.5], [0.2, 1.5], [0.85, 1.5], [1, 0.5]], t),
      draw: keys([[0, 0], [0.2, 0.2], [0.55, 1], [0.61, 0], [1, 0]], t), reach: keys([[0, 0], [0.6, 0], [0.7, -1.5], [1, 0]], t),
      legF: 0.5, legB: -0.5, cape: t > 0.6 && t < 0.85 ? 2 : 0,
    })),
  // 弩：平端在胸前已经上好箭；扣下扳机后坐一下，再低头拉弦上新箭
  ...fight('crossbow', 12,
    (t) => ({ dir: 'side', tool: 'crossbow', armF: 1.5, elbowF: 0.1, armB: 1.35, draw: 1, legF: 0.4, legB: -0.4, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'crossbow', elbowF: 0.1, draw: t < 0.2 || t > 0.85 ? 1 : 0,
      armF: keys([[0, 1.5], [0.2, 1.57], [0.3, 1.75], [0.45, 1.2], [0.8, 1.2], [1, 1.5]], t),
      armB: keys([[0, 1.35], [0.45, 1.0], [0.6, 0.4], [0.75, 1.0], [1, 1.35]], t),
      reach: keys([[0, 0], [0.2, 0], [0.3, -2], [0.45, 0], [1, 0]], t),
      crouch: t > 0.45 && t < 0.85 ? 1 : 0, legF: 0.4, legB: -0.4,
    })),
  // 单手战弓（10-26）：弓斜握在腰间；出手是一个快速的抬手速射，几乎不停顿，放完箭弓往下一甩
  ...fight('warbow', 8,
    (t) => ({ dir: 'side', tool: 'warbow', armF: 1.2, armB: 0.7, legF: 0.5, legB: -0.45, bob: breathe(t), crouch: 1 }),
    (t) => ({
      dir: 'side', tool: 'warbow', crouch: 1, legF: 0.5, legB: -0.45,
      armF: keys([[0, 1.2], [0.18, 1.6], [0.6, 1.6], [1, 1.2]], t), armB: keys([[0, 0.7], [0.18, 1.55], [0.42, 1.3], [0.6, 0.9], [1, 0.7]], t),
      draw: keys([[0, 0], [0.15, 0.6], [0.38, 1], [0.44, 0], [1, 0]], t), reach: keys([[0, 0], [0.42, 0], [0.5, -1], [0.7, 0]], t),
    })),
  // 十字弩（10-26）：半蹲架稳瞄准；扣扳机后整个人被后坐力顶退，再脚踩脚蹬、两手拉弦上新弩矢
  ...fight('arbalest', 14,
    (t) => ({ dir: 'side', tool: 'arbalest', armF: 1.5, elbowF: 0.1, armB: 1.35, draw: 1, crouch: 1, legF: 0.6, legB: -0.5, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'arbalest', elbowF: 0.1, draw: t < 0.18 || t > 0.88 ? 1 : 0,
      armF: keys([[0, 1.5], [0.18, 1.55], [0.26, 1.95], [0.4, 1.3], [0.55, 0.9], [0.85, 1.2], [1, 1.5]], t),
      armB: keys([[0, 1.35], [0.4, 1.1], [0.5, 0.3], [0.62, 1.2], [0.72, 0.3], [0.84, 1.1], [1, 1.35]], t),
      reach: keys([[0, 0], [0.18, 0], [0.26, -3.5], [0.4, -1], [0.5, 0], [1, 0]], t),
      crouch: keys([[0, 1], [0.26, 0], [0.45, 2], [0.85, 2], [1, 1]], t), legF: keys([[0, 0.6], [0.45, 0.9], [0.85, 0.9], [1, 0.6]], t), legB: -0.5,
      cape: t > 0.2 && t < 0.45 ? 2 : 0,
    })),
  // 法杖：杖立在身前，顶端微微发亮；出手是举杖蓄力，往前一指放出法球
  ...fight('staff', 10,
    (t) => ({ dir: 'side', tool: 'staff', armF: 1.3, elbowF: 0.2, toolTurn: 1.6, glow: t > 0.5 && t < 0.7, armB: 0.2, legF: 0.3, legB: -0.3, bob: breathe(t) }),
    (t) => ({
      dir: 'side', tool: 'staff', armB: keys([[0, 0.2], [0.35, 1.8], [0.6, 0.5], [1, 0.2]], t),
      armF: keys([[0, 1.3], [0.35, 2.7], [0.55, 1.6], [1, 1.3]], t), elbowF: keys([[0, 0.2], [0.35, 0], [1, 0.2]], t),
      toolTurn: keys([[0, 1.6], [0.35, 0.3], [0.55, 0], [1, 1.6]], t),
      glow: t > 0.2 && t < 0.7, legF: 0.35, legB: -0.3, cape: t > 0.45 && t < 0.8 ? 2 : 0,
    })),
  // 空手：两拳护在脸前；出手是前手一记直拳接后手一拳
  ...fight('fist', 10,
    (t) => ({ dir: 'side', armF: 2.0, elbowF: -1.3, armB: 1.8, elbowB: -1.3, legF: 0.5, legB: -0.45, bob: breathe(t) }),
    (t) => ({
      dir: 'side', legF: 0.55, legB: -0.45,
      armF: keys([[0, 2.0], [0.15, 1.57], [0.35, 2.0], [1, 2.0]], t), elbowF: keys([[0, -1.3], [0.15, 0], [0.35, -1.3], [1, -1.3]], t),
      reach: keys([[0, 0], [0.15, 3], [0.35, 0], [0.5, 2], [0.7, 0], [1, 0]], t),
      armB: keys([[0, 1.8], [0.35, 1.8], [0.5, 1.57], [0.7, 1.8], [1, 1.8]], t), elbowB: keys([[0, -1.3], [0.35, -1.3], [0.5, 0], [0.7, -1.3], [1, -1.3]], t),
    })),
];

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
  ...FIGHT_ANIMS,
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
