import { HW_ALTAR, HW_TIERS, hwBossId } from './halloween';
/*
 * 怪物与生物图鉴：原 192 种（T1-T8 每阶 24 种），10-23 又加了 28 种（见 NEW_SPECIES），
 * 8848 大地图外圈再加 70 种和 4 个首领（见 RING_ROWS）。
 * 这里只放设计表（名字、等级、区域、外形、特性、配色），
 * 属性、掉落和刷新点在 data.ts 里按统一规则算出来。
 */
import type { RegionId } from './types';

export type Rank = 'normal' | 'elite' | 'boss';

export const TRAITS = {
  passive: { name: '温顺', desc: '不会还手' },
  swift: { name: '迅捷', desc: '攻击间隔 -25%' },
  slow: { name: '笨重', desc: '攻击间隔 +25%' },
  armored: { name: '坚甲', desc: '防御 +40%' },
  tough: { name: '皮糙肉厚', desc: '生命 +30%' },
  frail: { name: '脆弱', desc: '生命 -25%' },
  fierce: { name: '凶猛', desc: '最大伤害 +25%' },
  evasive: { name: '灵巧', desc: '你的命中率 ×0.8' },
  venom: { name: '剧毒', desc: '命中时额外造成 等级÷8 点毒伤' },
  lifesteal: { name: '吸血', desc: '造成伤害的一半回复自身' },
  regen: { name: '再生', desc: '每次攻击回复生命（普通 3%、精英 1.5%、首领 0.6%、世界首领 0.3%）' },
  berserk: { name: '狂暴', desc: '生命低于一半时伤害 ×1.5' },
  thorns: { name: '荆棘', desc: '你造成伤害的 15% 反弹给你' },
  pack: { name: '群居', desc: '刷新时间减半' },
  resist_melee: { name: '抗近战', desc: '近战伤害 ×0.7' },
  resist_ranged: { name: '抗远程', desc: '远程伤害 ×0.7' },
  resist_magic: { name: '抗魔法', desc: '魔法伤害 ×0.7' },
  weak_melee: { name: '怕近战', desc: '近战伤害 ×1.3' },
  weak_ranged: { name: '怕远程', desc: '远程伤害 ×1.3' },
  weak_magic: { name: '怕魔法', desc: '魔法伤害 ×1.3' },
} as const;
export type TraitId = keyof typeof TRAITS;

/** 外形 → 种族大类（决定掉落和体型） */
export const FORM_FAMILY = {
  wolf: 'beast', fox: 'beast', boar: 'beast', deer: 'beast', bear: 'beast', cat: 'beast', mammoth: 'beast', goat: 'beast',
  lion: 'beast', rhino: 'beast', camel: 'beast', panther: 'beast', yak: 'beast', hyena: 'beast', horse: 'beast',
  rabbit: 'small', rat: 'small', hen: 'small', frog: 'small',
  hawk: 'bird', griffin: 'bird', phoenix: 'bird', bat: 'bat',
  slime: 'slime', jellyfish: 'slime',
  spider: 'insect', beetle: 'insect', scorpion: 'insect', ant: 'insect', mantis: 'insect', wasp: 'insect',
  crab: 'crab',
  snake: 'serpent', eel: 'serpent', worm: 'serpent',
  lizard: 'reptile', croc: 'reptile', salamander: 'reptile', turtle: 'reptile',
  drake: 'dragon', dragon: 'dragon', wyvern: 'dragon',
  goblin: 'humanoid', bandit: 'humanoid', pirate: 'humanoid', imp: 'humanoid', cultist: 'humanoid', knight: 'humanoid',
  orc: 'humanoid', yeti: 'humanoid', troll: 'humanoid',
  skeleton: 'undead', zombie: 'undead', lich: 'undead', ghost: 'undead', banshee: 'undead',
  golem: 'golem', gargoyle: 'golem',
  wisp: 'spirit',
  treant: 'plant', mushroom: 'plant', mandrake: 'plant', vine: 'plant', cactoid: 'plant',
  eye: 'eye',
  // 12080 外圈新外形（10-24）
  octopus: 'aquatic', shark: 'aquatic', manta: 'aquatic', moth: 'insect', elemental: 'spirit', hydra: 'dragon',
} as const;
export type Form = keyof typeof FORM_FAMILY;
export type Family = (typeof FORM_FAMILY)[Form];

export const FAMILY_NAME: Record<Family, string> = {
  beast: '野兽', small: '小动物', bird: '飞禽', bat: '蝙蝠', slime: '软泥', insect: '虫类', crab: '甲壳', serpent: '蛇虫',
  reptile: '爬行', dragon: '龙类', humanoid: '人形', undead: '亡灵', golem: '魔像', spirit: '元素', plant: '植物', eye: '魔眼', aquatic: '海兽',
};

/** 动物类：掉兽皮和兽肉，算「生物」；其余算「怪物」，掉魔核 */
export const isAnimal = (f: Family, form: Form) =>
  ['beast', 'small', 'bird', 'bat', 'reptile', 'dragon', 'aquatic'].includes(f) || form === 'snake';

/** 体型档：0=20px 1=24 2=32 3=40 4=48 5=56 */
export const FORM_SIZE: Record<Form, number> = {
  rabbit: 0, rat: 0, hen: 0, frog: 0, wisp: 0, bat: 0,
  fox: 1, slime: 1, snake: 1, spider: 1, ant: 1, wasp: 1, crab: 1, salamander: 1, lizard: 1, goblin: 1, imp: 1, mandrake: 1, eye: 1,
  wolf: 2, boar: 2, deer: 2, cat: 2, goat: 2, hawk: 2, beetle: 2, scorpion: 2, mantis: 2, eel: 2, worm: 2, turtle: 2, croc: 2,
  skeleton: 2, zombie: 2, bandit: 2, pirate: 2, cultist: 2, ghost: 2, banshee: 2, mushroom: 2, vine: 2, knight: 2, drake: 2,
  bear: 3, orc: 3, yeti: 3, troll: 3, lich: 3, golem: 3, gargoyle: 3, treant: 3, griffin: 3, phoenix: 3, mammoth: 3, wyvern: 3,
  dragon: 4,
  hyena: 2, panther: 2, lion: 3, camel: 3, yak: 3, rhino: 3, jellyfish: 1, cactoid: 2,
  octopus: 2, shark: 3, manta: 2, moth: 2, elemental: 2, hydra: 3, horse: 3,
};

export interface Species {
  id: string;
  name: string;
  tier: number;
  level: number;
  region: RegionId;
  form: Form;
  rank: Rank;
  traits: TraitId[];
  /** 主色、点缀色 */
  color: string;
  accent: string;
  /** 专属地点（新地点的生物只在那里出现） */
  home?: string;
  /** 8848 外圈新区域的生物（用户 10-23 加的 70 种 + 4 个首领） */
  ring?: boolean;
  /** 12080 最外圈的新生物（10-24） */
  outer?: boolean;
  /** 世界首领（用户 10-24）：地图上红色骷髅头标记，有专属动画、大招和传说掉落 */
  world?: boolean;
  /** 野马（用户 10-24）：会掉小马崽，拿去畜牧站养成坐骑 */
  horse?: boolean;
  /** 活动限定（万圣节南瓜王）：只能在活动祭坛召唤 */
  event?: boolean;
}

// [id, 名字, 等级, 区域, 外形, 级别 n/e/b, 特性（空格分隔）, 主色, 点缀色]
type Row = [string, string, number, RegionId, Form, 'n' | 'e' | 'b', string, string, string, string?];

const T1: Row[] = [
  ['hen', '走地鸡', 1, 'town', 'hen', 'n', 'passive', '#f0ece0', '#d84030'],
  ['rabbit', '野兔', 2, 'woodland', 'rabbit', 'n', 'passive frail', '#b08a64', '#f0e0d0'],
  ['field_mouse', '田鼠', 2, 'town', 'rat', 'n', 'swift frail pack', '#a08a70', '#e8b0a0'],
  ['rat', '矿坑老鼠', 3, 'town', 'rat', 'n', 'pack', '#7a7068', '#e8a0a0'],
  ['moss_slime', '苔藓史莱姆', 3, 'woodland', 'slime', 'n', 'regen weak_magic', '#6aa84a', '#c8f080'],
  ['sand_crab', '沙蟹', 4, 'coast', 'crab', 'n', 'armored', '#e0b070', '#f8e0a0'],
  ['green_frog', '绿皮蛙', 4, 'swamp', 'frog', 'n', 'evasive', '#5aa040', '#e8e070'],
  ['garden_snake', '草蛇', 5, 'town', 'snake', 'n', 'venom', '#6a9a3a', '#e8d870'],
  ['hedge_boar', '小獠猪', 5, 'woodland', 'boar', 'n', 'tough', '#8a6a4a', '#e8e0c8'],
  ['cave_bat', '洞穴蝙蝠', 5, 'snow', 'bat', 'n', 'swift evasive', '#5a4a6a', '#e05050'],
  ['reef_crab', '礁石蟹', 6, 'coast', 'crab', 'n', 'armored resist_melee', '#d06040', '#f0a080'],
  ['sprout', '嫩芽精', 6, 'woodland', 'mandrake', 'n', 'regen weak_melee', '#7ac050', '#f0a0c0'],
  ['dawn_beetle', '晨光甲虫', 6, 'highland', 'beetle', 'n', 'armored slow', '#c08a3a', '#f8d070'],
  ['deer', '林鹿', 7, 'woodland', 'deer', 'n', 'passive swift', '#b07a4a', '#f0e0c0'],
  ['snow_fox', '雪狐', 8, 'snow', 'fox', 'n', 'swift evasive', '#f0f0f8', '#a0c0e0'],
  ['pond_turtle', '池塘小龟', 3, 'swamp', 'turtle', 'n', 'passive armored', '#6a8a4a', '#a0c060'],
  ['field_crow', '田野乌鸦', 4, 'town', 'hawk', 'n', 'swift frail', '#2a2a34', '#e0c040'],
  ['bramble_sprite', '荆棘精', 9, 'woodland', 'mandrake', 'e', 'thorns regen', '#4a8a3a', '#e04060'],
  ['old_ram', '倔脾气公羊', 8, 'highland', 'goat', 'e', 'tough fierce', '#d8d0c0', '#8a6a4a'],
  ['thief_goblin', '偷鸡地精', 8, 'town', 'goblin', 'e', 'swift evasive', '#7aa050', '#8a5a3a'],
  ['bog_toad', '沼泽蟾蜍', 9, 'swamp', 'frog', 'e', 'venom tough', '#7a8a3a', '#d0a040'],
  ['wild_dog', '野狗头领', 9, 'woodland', 'wolf', 'e', 'pack fierce', '#9a7a5a', '#e8d8c0'],
  ['slime_king', '史莱姆王', 10, 'woodland', 'slime', 'b', 'regen tough weak_magic', '#4ac060', '#f8e050'],
  ['rat_king', '鼠王', 11, 'town', 'rat', 'b', 'pack venom berserk', '#5a5048', '#f0d050'],
];

const T2: Row[] = [
  ['boar', '野猪', 10, 'woodland', 'boar', 'n', 'tough', '#6a4a34', '#f0e0c0'],
  ['brook_heron', '溪鹭', 11, 'woodland', 'hawk', 'n', 'passive evasive', '#c8d0d8', '#e8b040'],
  ['rock_lizard', '岩蜥', 11, 'highland', 'lizard', 'n', 'armored', '#8a8a88', '#c0a070'],
  ['pine_wolf', '松谷狼', 12, 'woodland', 'wolf', 'n', 'pack', '#6a6058', '#d8c8a8'],
  ['fire_lizard', '火蜥蜴', 12, 'lava', 'salamander', 'n', 'resist_magic', '#d05a2a', '#f8c040'],
  ['oasis_scarab', '绿洲圣甲虫', 13, 'coast', 'beetle', 'n', 'armored', '#3a8a7a', '#f0d060'],
  ['glow_moth', '萤光飞蛾', 13, 'snow', 'wasp', 'n', 'evasive frail', '#a0b8e0', '#c0ff90'],
  ['ash_imp', '灰烬小鬼', 14, 'lava', 'imp', 'n', 'swift', '#c04030', '#f8a040'],
  ['sand_snake', '沙蛇', 14, 'coast', 'snake', 'n', 'venom swift', '#d8b070', '#8a5a3a'],
  ['bog_skeleton', '沉潭骷髅', 15, 'swamp', 'skeleton', 'n', 'weak_melee resist_ranged', '#d8d4c0', '#6a8a5a'],
  ['cave_spider', '洞穴蜘蛛', 15, 'snow', 'spider', 'n', 'venom', '#4a4058', '#c0e0ff'],
  ['mushroom_man', '蘑菇人', 16, 'giantwood', 'mushroom', 'n', 'regen', '#d05a50', '#f8f0e0'],
  ['mud_worm', '泥沼蠕虫', 16, 'swamp', 'worm', 'n', 'tough slow', '#8a6a5a', '#d0a090'],
  ['pebble_golem', '碎石魔像', 17, 'highland', 'golem', 'n', 'armored slow weak_magic', '#9a948a', '#d0a060'],
  ['lost_wisp', '迷途鬼火', 18, 'swamp', 'wisp', 'n', 'evasive resist_melee', '#80e0c0', '#e0fff0'],
  ['pond_eel', '池沼鳗', 13, 'swamp', 'eel', 'n', 'evasive', '#5a6a4a', '#e0e080'],
  ['highland_goat', '高地岩羊', 15, 'highland', 'goat', 'n', 'passive tough', '#a09080', '#5a4a3a'],
  ['ash_golem', '灰烬魔像', 19, 'lava', 'golem', 'e', 'armored thorns slow', '#5a4a48', '#ff7030'],
  ['bandit_scout', '盗匪斥候', 17, 'coast', 'bandit', 'e', 'swift evasive', '#8a6a4a', '#c04040'],
  ['tusk_boar', '獠牙巨猪', 18, 'woodland', 'boar', 'e', 'tough berserk', '#5a3a2a', '#ffffff'],
  ['ember_hound', '余烬猎犬', 18, 'lava', 'wolf', 'e', 'pack fierce resist_magic', '#5a2a20', '#ff7030'],
  ['marsh_witch', '沼泽女巫', 19, 'swamp', 'cultist', 'e', 'venom lifesteal', '#4a5a3a', '#a0e060'],
  ['copper_tortoise', '铜甲巨龟', 20, 'highland', 'turtle', 'b', 'armored tough slow resist_melee', '#c07a3a', '#5a8a5a'],
  ['mushroom_queen', '蘑菇女王', 21, 'giantwood', 'mushroom', 'b', 'regen venom tough', '#a050c0', '#f8e0f8'],
];

const T3: Row[] = [
  ['goblin', '矿洞地精', 20, 'highland', 'goblin', 'n', 'pack', '#6a9040', '#a0a0a8'],
  ['scorpion', '沙蝎', 20, 'highland', 'scorpion', 'n', 'venom armored', '#e0b060', '#8a4a2a'],
  ['snow_hare', '雪兔', 20, 'snow', 'rabbit', 'n', 'passive swift', '#f8f8ff', '#c0d0f0'],
  ['grey_wolf', '灰狼', 22, 'woodland', 'wolf', 'n', 'pack fierce', '#8a8a8a', '#e0e0e0'],
  ['tin_beetle', '锡壳甲虫', 22, 'highland', 'beetle', 'n', 'armored resist_ranged', '#b8bcc4', '#6a7080'],
  ['lynx', '猞猁', 23, 'woodland', 'cat', 'n', 'swift evasive', '#c09a6a', '#3a2a20'],
  ['pirate', '海盗', 24, 'coast', 'pirate', 'n', 'fierce', '#c0a090', '#c03030'],
  ['flame_wasp', '炎蜂', 24, 'lava', 'wasp', 'n', 'venom swift frail', '#f0a020', '#3a2a10'],
  ['coral_eel', '珊瑚鳗', 25, 'coast', 'eel', 'n', 'evasive', '#e07070', '#f8d0a0'],
  ['canopy_hawk', '冠林鹰', 25, 'giantwood', 'hawk', 'n', 'swift', '#7a5a3a', '#f0f0e0'],
  ['snow_bear', '雪熊', 26, 'snow', 'bear', 'n', 'tough slow', '#f0f4ff', '#3a3a48'],
  ['canopy_spider', '冠林巨蛛', 26, 'giantwood', 'spider', 'n', 'venom pack', '#3a5a2a', '#e0c040'],
  ['frost_wisp', '霜灵', 27, 'snow', 'wisp', 'n', 'evasive weak_magic resist_melee', '#a0e0ff', '#ffffff'],
  ['ruin_skeleton', '废墟骷髅兵', 27, 'woodland', 'skeleton', 'n', 'weak_melee resist_ranged', '#e0dccc', '#8a6a4a'],
  ['bandit', '林地强盗', 28, 'woodland', 'bandit', 'n', 'fierce', '#6a5a4a', '#3a6a3a'],
  ['ice_beetle', '冰甲虫', 24, 'snow', 'beetle', 'n', 'armored resist_magic', '#a0d0f0', '#ffffff'],
  ['ruin_ghost', '废墟游魂', 26, 'woodland', 'ghost', 'n', 'evasive resist_melee', '#a0b0a0', '#e0ffe0'],
  ['sea_troll', '海岸巨魔', 29, 'coast', 'troll', 'e', 'regen tough', '#5a8a7a', '#e0d0a0'],
  ['goblin_shaman', '地精萨满', 28, 'highland', 'goblin', 'e', 'regen resist_magic', '#5a8040', '#a060e0'],
  ['lotus_serpent', '冰莲水蟒', 28, 'snow', 'snake', 'e', 'venom tough', '#5ab0d0', '#f0c0e0'],
  ['pirate_mate', '海盗大副', 29, 'coast', 'pirate', 'e', 'fierce berserk', '#b08070', '#2a2a3a'],
  ['alpha_wolf', '头狼', 29, 'woodland', 'wolf', 'e', 'pack fierce swift', '#4a4a50', '#e0c040'],
  ['bandit_king', '山贼头子', 31, 'woodland', 'bandit', 'b', 'fierce tough berserk', '#5a3a2a', '#e0b040'],
  ['sand_wyrm', '沙海巨虫', 32, 'highland', 'worm', 'b', 'tough armored slow resist_ranged', '#d8b070', '#a04030'],
];

const T4: Row[] = [
  ['frost_wolf', '霜狼', 30, 'snow', 'wolf', 'n', 'pack resist_magic', '#a8d8ff', '#ffffff'],
  ['iron_ant', '铁颚蚁', 31, 'highland', 'ant', 'n', 'armored pack', '#4a4a50', '#c04030'],
  ['bog_leech', '巨型水蛭', 31, 'swamp', 'worm', 'n', 'lifesteal', '#4a3a3a', '#c04040'],
  ['treant', '树精', 32, 'giantwood', 'treant', 'n', 'tough slow regen weak_magic', '#6a4a2a', '#5a9a3a'],
  ['oak_stag', '橡木雄鹿', 32, 'giantwood', 'deer', 'n', 'passive tough', '#8a5a3a', '#d8c090'],
  ['obsidian_crab', '黑曜蟹', 33, 'lava', 'crab', 'n', 'armored resist_melee', '#2a2430', '#ff6030'],
  ['cliff_goat', '峭壁山羊', 33, 'coast', 'goat', 'n', 'passive evasive', '#e8e0d0', '#6a5a4a'],
  ['magma', '熔岩元素', 34, 'lava', 'golem', 'n', 'resist_magic thorns', '#ff7a40', '#ffe060'],
  ['swamp_zombie', '沼泽行尸', 34, 'swamp', 'zombie', 'n', 'tough slow weak_magic', '#6a8a5a', '#4a3a3a'],
  ['frost_bat', '霜翼蝠', 35, 'snow', 'bat', 'n', 'swift evasive', '#8ab0d8', '#e0f0ff'],
  ['drowned', '溺亡水手', 35, 'coast', 'zombie', 'n', 'tough', '#5a8a9a', '#c0a070'],
  ['harpy', '峭壁鹰妖', 36, 'coast', 'hawk', 'n', 'swift fierce', '#d8b080', '#8a4a2a'],
  ['lava_toad', '熔岩蟾蜍', 36, 'lava', 'frog', 'n', 'venom resist_magic', '#c04020', '#ffc040'],
  ['iron_orc', '黑铁兽人', 37, 'highland', 'orc', 'n', 'fierce armored', '#5a7a4a', '#6a6a70'],
  ['vine_lurker', '缠藤', 37, 'giantwood', 'vine', 'n', 'thorns regen', '#3a7a3a', '#c03050'],
  ['ember_bat', '余烬蝠', 33, 'lava', 'bat', 'n', 'swift lifesteal', '#5a2a20', '#ff8030'],
  ['moss_golem', '苔藓魔像', 35, 'giantwood', 'golem', 'n', 'armored regen slow', '#5a7a4a', '#c0e060'],
  ['swamp_hag', '沼泽巫婆', 39, 'swamp', 'cultist', 'e', 'venom lifesteal resist_magic', '#3a4a2a', '#c0ff60'],
  ['iron_golem', '黑铁魔像', 38, 'highland', 'golem', 'e', 'armored tough slow weak_magic', '#5a5c66', '#ff9030'],
  ['bog_wraith', '沉潭怨灵', 38, 'swamp', 'ghost', 'e', 'lifesteal resist_melee evasive', '#7a9a8a', '#c0ffe0'],
  ['dire_bear', '恐熊', 38, 'snow', 'bear', 'e', 'tough berserk fierce', '#4a3a30', '#c0d0e0'],
  ['storm_harpy', '风暴鹰妖', 39, 'coast', 'hawk', 'e', 'swift evasive fierce', '#6a7aa0', '#f0f060'],
  ['magma_tortoise', '熔岩巨龟', 41, 'lava', 'turtle', 'b', 'armored tough thorns slow', '#3a2a28', '#ff6020'],
  ['drowned_captain', '溺亡船长', 42, 'coast', 'pirate', 'b', 'lifesteal fierce tough', '#4a7a8a', '#e0c040'],
];

const T5: Row[] = [
  ['cedar_mantis', '雪松螳螂', 42, 'giantwood', 'mantis', 'n', 'swift fierce', '#7ab05a', '#f0e080'],
  ['peak_eagle', '峰顶金雕', 43, 'highland', 'hawk', 'n', 'swift evasive', '#8a5a2a', '#f0c040'],
  ['crocodile', '沼泽巨鳄', 44, 'swamp', 'croc', 'n', 'tough armored', '#5a7a3a', '#e0d090'],
  ['frost_ram', '霜角公羊', 44, 'snow', 'goat', 'n', 'passive tough', '#e0e8f0', '#80b0e0'],
  ['ash_salamander', '灰烬蝾螈', 45, 'lava', 'salamander', 'n', 'regen resist_magic', '#4a3a38', '#ff8030'],
  ['ice_troll', '冰原巨魔', 46, 'snow', 'troll', 'n', 'regen tough slow', '#8ab0c8', '#f0f8ff'],
  ['titan_beetle', '钛甲犀虫', 46, 'coast', 'beetle', 'n', 'armored resist_melee', '#5ab0d0', '#e0f0f8'],
  ['lava_scorpion', '熔岩巨蝎', 47, 'lava', 'scorpion', 'n', 'venom armored', '#c03a20', '#ffb040'],
  ['brine_serpent', '咸水海蛇', 47, 'coast', 'eel', 'n', 'venom swift', '#3a7a9a', '#e0f060'],
  ['grave_ghoul', '墓园食尸鬼', 48, 'swamp', 'zombie', 'n', 'lifesteal fierce', '#7a7a6a', '#c03030'],
  ['shadow_bat', '暗影蝠', 49, 'abyss', 'bat', 'n', 'lifesteal swift', '#3a2a4a', '#c060ff'],
  ['gargoyle', '石像鬼', 50, 'coast', 'gargoyle', 'n', 'armored resist_ranged', '#8a8a98', '#e04040'],
  ['mammoth', '雪原猛犸', 50, 'snow', 'mammoth', 'n', 'tough slow', '#8a6a4a', '#f0e8d8'],
  ['rune_wisp', '符文灵火', 51, 'abyss', 'wisp', 'n', 'evasive resist_magic resist_melee', '#a070ff', '#f0d0ff'],
  ['bog_horror', '泥沼恐魔', 52, 'swamp', 'slime', 'n', 'regen tough venom', '#4a5a30', '#c0e040'],
  ['sand_worm', '流沙巨虫', 45, 'coast', 'worm', 'n', 'tough armored', '#d0b080', '#a04030'],
  ['frost_lynx', '霜纹猞猁', 48, 'snow', 'cat', 'n', 'swift evasive', '#c0d8f0', '#3a4a6a'],
  ['rune_knight', '符文骑士', 54, 'abyss', 'knight', 'e', 'armored resist_magic', '#4a4a6a', '#a070ff'],
  ['yeti', '雪人', 52, 'snow', 'yeti', 'e', 'tough berserk', '#f0f4ff', '#6080a0'],
  ['griffin', '狮鹫', 53, 'highland', 'griffin', 'e', 'swift fierce', '#e0c080', '#8a5a2a'],
  ['lurker', '深渊潜伏者', 53, 'abyss', 'spider', 'e', 'venom evasive', '#3a2a50', '#a060ff'],
  ['lich', '墓园巫妖', 54, 'swamp', 'lich', 'e', 'lifesteal resist_magic weak_melee', '#b0a0ff', '#40ff90'],
  ['croc_king', '鳄王', 56, 'swamp', 'croc', 'b', 'tough armored berserk', '#3a5a2a', '#e0b040'],
  ['scorpion_queen', '巨蝎女王', 57, 'lava', 'scorpion', 'b', 'venom armored fierce', '#8a1a3a', '#ffd040'],
];

const T6: Row[] = [
  ['root_worm', '古根巨虫', 56, 'giantwood', 'worm', 'n', 'tough regen', '#7a5a3a', '#e0c090'],
  ['cult_acolyte', '深渊信徒', 57, 'abyss', 'cultist', 'n', 'lifesteal resist_magic', '#3a2a50', '#c050ff'],
  ['bloodoak_spider', '血橡蛛', 58, 'swamp', 'spider', 'n', 'venom pack', '#6a1a1a', '#ff6040'],
  ['snow_leopard', '雪豹', 59, 'snow', 'cat', 'n', 'swift evasive fierce', '#e8e8f0', '#5a5a68'],
  ['void_hound', '虚空猎犬', 60, 'abyss', 'wolf', 'n', 'pack fierce', '#2a2040', '#a080ff'],
  ['glacier_tortoise', '冰川陆龟', 60, 'snow', 'turtle', 'n', 'passive armored tough', '#a0c0d8', '#e8f8ff'],
  ['bone_knight', '白骨骑士', 61, 'swamp', 'skeleton', 'n', 'armored weak_melee', '#e8e4d8', '#5a5a70'],
  ['tree_guard', '古树守卫', 62, 'giantwood', 'treant', 'n', 'tough thorns slow', '#5a3a28', '#c04030'],
  ['thunder_bird', '雷鸟', 62, 'highland', 'hawk', 'n', 'swift fierce resist_magic', '#4a5a8a', '#f0f040'],
  ['abyss_eye', '深渊魔眼', 64, 'abyss', 'eye', 'n', 'evasive resist_ranged', '#a060ff', '#ffe060'],
  ['ghost_lantern', '幽灯魂', 65, 'swamp', 'wisp', 'n', 'lifesteal evasive', '#60ffb0', '#f0fff8'],
  ['drakeling', '龙裔', 66, 'highland', 'drake', 'n', 'fierce armored', '#c0a0ff', '#f8e0a0'],
  ['rune_golem', '符文魔像', 66, 'abyss', 'golem', 'n', 'armored resist_magic slow', '#5a5070', '#c070ff'],
  ['abyss_slime', '深渊软泥', 67, 'abyss', 'slime', 'n', 'regen venom resist_melee', '#5a3a8a', '#ff60c0'],
  ['root_mandrake', '古根曼德拉', 68, 'giantwood', 'mandrake', 'n', 'regen thorns', '#8a6a4a', '#ff80a0'],
  ['blood_bat', '血翼蝠', 58, 'swamp', 'bat', 'n', 'lifesteal swift', '#5a1a20', '#ff4040'],
  ['crystal_scorpion', '晶刺巨蝎', 63, 'highland', 'scorpion', 'n', 'venom armored', '#a0a0e0', '#e0ffff'],
  ['frost_troll', '霜巨魔酋长', 69, 'snow', 'troll', 'e', 'regen tough fierce', '#7aa0c0', '#ffffff'],
  ['banshee', '报丧女妖', 67, 'swamp', 'banshee', 'e', 'lifesteal evasive resist_melee', '#c0d0e0', '#60c0ff'],
  ['frost_wyvern', '霜翼飞龙', 68, 'snow', 'wyvern', 'e', 'swift fierce resist_magic', '#a0c8f0', '#ffffff'],
  ['elder_griffin', '老狮鹫', 68, 'highland', 'griffin', 'e', 'swift tough fierce', '#c0a070', '#ffffff'],
  ['abyss_knight', '深渊骑士', 69, 'abyss', 'knight', 'e', 'armored lifesteal', '#3a3050', '#a060ff'],
  ['tide_guardian', '潮眼守卫', 69, 'abyss', 'eye', 'b', 'regen resist_ranged tough', '#40a0d0', '#a0ffff'],
  ['mire_hydra', '沼泽九头蛇', 70, 'swamp', 'snake', 'b', 'venom regen tough berserk', '#3a6a3a', '#e0d040'],
];

const T7: Row[] = [
  ['meteor_beetle', '陨铁甲虫', 70, 'highland', 'beetle', 'n', 'armored resist_melee', '#5a3a30', '#ff9040'],
  ['cinder_imp', '余烬恶魔', 71, 'lava', 'imp', 'n', 'swift fierce resist_magic', '#8a2020', '#ffb040'],
  ['white_stag', '白角神鹿', 72, 'giantwood', 'deer', 'n', 'passive swift tough', '#f0ece0', '#e0c060'],
  ['prism_golem', '棱晶魔像', 72, 'highland', 'golem', 'n', 'armored thorns', '#e0a0ff', '#a0ffff'],
  ['magma_hound', '熔核魔犬', 73, 'lava', 'wolf', 'n', 'pack fierce thorns', '#3a1a18', '#ff5020'],
  ['star_wisp', '坠星之灵', 74, 'highland', 'wisp', 'n', 'evasive resist_melee resist_ranged', '#f0e080', '#ffffff'],
  ['frost_wraith', '霜魂', 75, 'snow', 'ghost', 'n', 'lifesteal resist_melee', '#c0e8ff', '#ffffff'],
  ['glacier_mammoth', '冰川古象', 76, 'snow', 'mammoth', 'n', 'tough slow armored', '#a0b8c8', '#f0f8ff'],
  ['fire_drake', '火焰亚龙', 77, 'lava', 'drake', 'n', 'fierce resist_magic', '#c03a20', '#ffd040'],
  ['ancient_mantis', '远古螳螂', 78, 'giantwood', 'mantis', 'n', 'swift fierce evasive', '#5a8a3a', '#e0f0a0'],
  ['void_eel', '虚空鳗', 79, 'abyss', 'eel', 'n', 'evasive lifesteal', '#2a2050', '#80a0ff'],
  ['abyss_spider', '深渊织网者', 80, 'abyss', 'spider', 'n', 'venom pack evasive', '#1a1428', '#ff40a0'],
  ['ashbark_treant', '灰烬树人', 81, 'lava', 'treant', 'n', 'tough thorns regen', '#4a3a34', '#ff7a30'],
  ['phoenix_chick', '火凤雏', 82, 'lava', 'phoenix', 'n', 'regen swift resist_magic', '#ff7030', '#fff060'],
  ['star_serpent', '星纹巨蛇', 83, 'highland', 'snake', 'n', 'venom tough', '#2a3a6a', '#f0e080'],
  ['meteor_wisp', '陨火之灵', 88, 'highland', 'wisp', 'n', 'evasive resist_magic', '#ff9040', '#fff0a0'],
  ['lava_worm', '熔岩巨虫', 90, 'lava', 'worm', 'n', 'tough thorns', '#5a2a20', '#ff6020'],
  ['void_banshee', '虚空女妖', 93, 'abyss', 'banshee', 'e', 'lifesteal evasive resist_melee', '#3a2a6a', '#c080ff'],
  ['frost_giant', '冰霜巨人', 78, 'snow', 'yeti', 'e', 'tough armored slow berserk', '#d0f0ff', '#4a7aa0'],
  ['obsidian_golem', '黑曜魔像', 80, 'lava', 'golem', 'e', 'armored thorns tough', '#1e1a24', '#ff4030'],
  ['dragon_knight', '龙骑士', 82, 'highland', 'knight', 'e', 'armored fierce resist_magic', '#8a3a3a', '#f0c040'],
  ['dread_lich', '恐惧巫妖', 84, 'abyss', 'lich', 'e', 'lifesteal resist_magic venom', '#6a4a9a', '#ff60ff'],
  ['treant_king', '远古树王', 93, 'giantwood', 'treant', 'b', 'tough regen thorns slow', '#e8e0c8', '#ffe080'],
  ['bone_dragon', '骸骨龙', 95, 'abyss', 'dragon', 'b', 'lifesteal armored weak_melee', '#e0dcc8', '#60ff90'],
];

const T8: Row[] = [
  ['spirit_deer', '白木灵鹿', 96, 'giantwood', 'deer', 'n', 'passive evasive', '#f8f8f0', '#a0ffe0'],
  ['white_wolf', '白木神狼', 97, 'giantwood', 'wolf', 'n', 'pack swift fierce', '#f0f0f0', '#80e0ff'],
  ['adamant_golem', '精金魔像', 98, 'highland', 'golem', 'n', 'armored tough slow', '#3a9a7a', '#a0ffd0'],
  ['inferno_scorpion', '炼狱巨蝎', 99, 'lava', 'scorpion', 'n', 'venom armored fierce', '#5a0a10', '#ff6020'],
  ['void_walker', '虚空行者', 100, 'abyss', 'ghost', 'n', 'evasive lifesteal resist_ranged', '#3a2a6a', '#e080ff'],
  ['celestial_hawk', '星穹神隼', 101, 'snow', 'hawk', 'n', 'swift evasive resist_magic', '#e0e8ff', '#80a0ff'],
  ['elder_drake', '古龙裔', 102, 'highland', 'drake', 'n', 'fierce armored tough', '#8a6ac0', '#f8e0a0'],
  ['glacier_golem', '冰川魔像', 103, 'snow', 'golem', 'n', 'armored resist_melee slow', '#a0d8f0', '#ffffff'],
  ['ancient_beetle', '精金圣甲虫', 104, 'highland', 'beetle', 'n', 'armored resist_ranged tough', '#2a7a5a', '#f0e070'],
  ['abyss_horror', '深渊恐魔', 105, 'abyss', 'eye', 'n', 'venom lifesteal resist_ranged', '#5a1a5a', '#ff3060'],
  ['ashen_wyvern', '灰烬飞龙', 106, 'lava', 'wyvern', 'n', 'swift fierce resist_magic', '#3a3230', '#ff8030'],
  ['elder_treant', '白木古树人', 107, 'giantwood', 'treant', 'n', 'tough regen thorns', '#e0d8c0', '#a0e080'],
  ['void_slime', '虚空软泥', 108, 'abyss', 'slime', 'n', 'regen resist_melee resist_ranged', '#2a1a4a', '#c0a0ff'],
  ['death_knight', '死亡骑士', 109, 'abyss', 'knight', 'n', 'armored lifesteal fierce', '#2a2a30', '#60ff90'],
  ['world_serpent', '吞星巨蟒', 110, 'abyss', 'snake', 'n', 'venom tough fierce', '#1a2a4a', '#ffd040'],
  ['adamant_ant', '精金巨蚁', 100, 'highland', 'ant', 'n', 'armored pack', '#2a6a5a', '#a0ffd0'],
  ['white_mantis', '白木螳螂', 103, 'giantwood', 'mantis', 'n', 'swift fierce evasive', '#e8e8d8', '#80e0a0'],
  ['abyss_wyrm', '深渊巨虫', 112, 'abyss', 'worm', 'e', 'tough venom armored', '#2a1a3a', '#ff40a0'],
  ['lava_lord', '熔岩领主', 112, 'lava', 'golem', 'e', 'thorns tough fierce resist_magic', '#ff4020', '#ffe060'],
  ['frost_dragon', '霜龙', 114, 'snow', 'dragon', 'e', 'fierce armored resist_magic', '#a0d0ff', '#ffffff'],
  ['abyss_lich', '深渊大巫妖', 115, 'abyss', 'lich', 'e', 'lifesteal venom resist_magic', '#4a2a7a', '#ff40c0'],
  ['phoenix', '不死鸟', 116, 'lava', 'phoenix', 'e', 'regen swift fierce resist_magic', '#ff5020', '#fff080'],
  ['crystal_dragon', '晶龙', 120, 'highland', 'dragon', 'b', 'armored fierce tough resist_ranged', '#c0a0ff', '#a0ffff'],
  ['abyss_lord', '深渊之主', 125, 'abyss', 'ghost', 'b', 'lifesteal berserk tough resist_melee', '#4a2a80', '#ff40ff'],
];

/**
 * 5088 大地图新增（用户 10-23）：8 处特色地点，20 种新生物 + 8 个新首领，最后一列是专属地点。
 * 属性和掉落按统一规则从等级、级别、外形、特性算出来（见 data.ts）。
 */
const NEW_SPECIES: Row[][] = [
  [],
  [
    ['isle_turtle', '千岛巨龟', 13, 'town', 'turtle', 'n', 'passive armored tough', '#5a8a6a', '#c8e0a0', 'isles'],
    ['lake_otter', '湖畔水獭', 15, 'town', 'fox', 'n', 'swift evasive', '#7a5a3a', '#e8d0b0', 'isles'],
    ['wave_croc', '浪涛鳄', 19, 'town', 'croc', 'e', 'armored fierce', '#3a6a5a', '#e0e090', 'isles'],
    ['isle_eel', '千岛湖鳗王', 22, 'town', 'eel', 'b', 'tough lifesteal regen', '#2a5a7a', '#80f0ff', 'isles'],
  ],
  [
    ['bamboo_viper', '竹叶青', 24, 'woodland', 'snake', 'n', 'venom swift', '#4ac04a', '#f0e060', 'bamboo'],
    ['mist_mantis', '雾林螳螂', 27, 'woodland', 'mantis', 'n', 'evasive fierce', '#8ab08a', '#f0f0e0', 'bamboo'],
    ['bamboo_bear', '竹林熊', 30, 'woodland', 'bear', 'e', 'tough berserk', '#e8e8e8', '#2a2a2a', 'bamboo'],
    ['ape_king', '竹海猿王', 34, 'woodland', 'troll', 'b', 'fierce berserk swift', '#6a5a3a', '#e0c060', 'bamboo'],
  ],
  [
    ['salt_scorpion', '盐地毒蝎', 32, 'coast', 'scorpion', 'n', 'venom armored', '#e8e0d0', '#a0c0e0', 'saltflat'],
    ['crystal_lizard', '晶壳蜥', 36, 'coast', 'lizard', 'n', 'armored resist_ranged', '#c0e0f0', '#ffffff', 'saltflat'],
    ['salt_worm', '盐漠沙虫', 40, 'coast', 'worm', 'e', 'tough thorns', '#d8c8a8', '#ff8060', 'saltflat'],
    ['salt_crab', '盐晶巨蟹', 45, 'coast', 'crab', 'b', 'armored resist_melee tough', '#f0f0ff', '#80c0ff', 'saltflat'],
  ],
  [
    ['star_slime', '星屑史莱姆', 44, 'highland', 'slime', 'n', 'regen resist_magic', '#4a4a8a', '#f0e080', 'crater'],
    ['crater_gargoyle', '陨坑石像鬼', 50, 'highland', 'gargoyle', 'e', 'armored swift', '#5a5a6a', '#ff9040', 'crater'],
    ['meteor_colossus', '陨星巨像', 58, 'highland', 'golem', 'b', 'armored tough thorns slow', '#3a3448', '#ffb040', 'crater'],
    ['spore_bat', '孢子蝠', 45, 'giantwood', 'bat', 'n', 'swift venom', '#6a5a7a', '#a0ff80', 'fungal'],
    ['glow_shroom', '荧光菇人', 47, 'giantwood', 'mushroom', 'n', 'regen weak_melee', '#4a8a9a', '#a0ffe0', 'fungal'],
    ['rotroot_treant', '腐根树人', 52, 'giantwood', 'treant', 'e', 'tough venom', '#4a3a2a', '#a0e060', 'fungal'],
    ['spore_mother', '菌母', 56, 'giantwood', 'mushroom', 'b', 'regen venom tough', '#8a3a8a', '#80ffc0', 'fungal'],
  ],
  [
    ['rift_wolf', '冰裂狼', 58, 'snow', 'wolf', 'n', 'pack fierce', '#d0e8f8', '#4a7ab0', 'glacier'],
    ['rift_mammoth', '冰川猛犸', 66, 'snow', 'mammoth', 'e', 'tough armored slow', '#8aa8c0', '#ffffff', 'glacier'],
    ['ice_wyrm', '冰渊巨蠕', 72, 'snow', 'worm', 'b', 'tough armored berserk', '#a0d8f0', '#2a4a8a', 'glacier'],
  ],
  [
    ['obsidian_scorpion', '黑曜蝎', 80, 'lava', 'scorpion', 'n', 'armored venom', '#1a1418', '#ff5030', 'obsidian'],
    ['flame_wyvern', '炎翼飞龙', 88, 'lava', 'wyvern', 'e', 'fierce swift resist_magic', '#8a2a10', '#ffc040', 'obsidian'],
    ['magma_titan', '熔核泰坦', 98, 'lava', 'golem', 'b', 'armored thorns tough fierce', '#2a1a18', '#ff6020', 'obsidian'],
  ],
  [
    ['star_eye', '星渊魔眼', 105, 'abyss', 'eye', 'n', 'evasive lifesteal resist_ranged', '#1a1040', '#f0e0ff', 'starabyss'],
    ['void_knight', '虚空骑士', 112, 'abyss', 'knight', 'e', 'armored fierce lifesteal', '#2a2050', '#b080ff', 'starabyss'],
    ['star_devourer', '星渊吞噬者', 130, 'abyss', 'eye', 'b', 'lifesteal berserk tough resist_magic', '#100828', '#ffe080', 'starabyss'],
  ],
];

/**
 * 8848 大地图外圈 8 个新区域的生物（用户 10-23）：每区 8-9 种，共 70 种，另有 4 个首领
 * （金鬃狮王、雨林蛇母、沙暴之王、晶簇主宰）。最后一列是住的地点。
 */
const RING_ROWS: Row[] = [
  // 金穗草原 T2-T3
  ['striped_antelope', '斑纹羚', 11, 'savanna', 'deer', 'n', 'passive swift', '#d8c090', '#3a2a20', 'golden_plain'],
  ['meerkat', '狐獴', 10, 'savanna', 'rat', 'n', 'swift frail pack', '#c8a878', '#6a4a30', 'golden_plain'],
  ['termite_soldier', '白蚁兵', 12, 'savanna', 'ant', 'n', 'pack armored', '#e8d8b0', '#a06030', 'golden_plain'],
  ['spotted_hyena', '斑鬣狗', 13, 'savanna', 'hyena', 'n', 'pack fierce', '#b8986a', '#4a3a2a', 'golden_plain'],
  ['gold_ring_snake', '金环蛇', 14, 'savanna', 'snake', 'n', 'venom', '#e8c040', '#2a2a2a', 'lion_rock'],
  ['savanna_vulture', '秃鹫', 15, 'savanna', 'hawk', 'n', 'swift', '#4a3a34', '#e8d8c8', 'lion_rock'],
  ['savanna_lioness', '草原母狮', 17, 'savanna', 'lion', 'n', 'swift fierce', '#d8a85a', '#c08a4a', 'lion_rock'],
  ['grass_rhino', '草原犀牛', 22, 'savanna', 'rhino', 'e', 'tough armored', '#8a8a86', '#e8e0d0', 'lion_rock'],
  ['lion_king', '金鬃狮王', 28, 'savanna', 'lion', 'b', 'fierce berserk tough', '#e8b850', '#8a3a10', 'lion_rock'],
  // 枫红秋林 T3-T4
  ['maple_deer', '枫角鹿', 21, 'autumn', 'deer', 'n', 'passive', '#c06a3a', '#f0d0a0', 'maple_valley'],
  ['red_fox', '赤狐', 22, 'autumn', 'fox', 'n', 'swift evasive', '#d0602a', '#f8f0e0', 'maple_valley'],
  ['squirrel', '栗鼠', 20, 'autumn', 'rat', 'n', 'swift frail', '#a0603a', '#e8c090', 'maple_valley'],
  ['leaf_sprite', '落叶精', 24, 'autumn', 'mandrake', 'n', 'regen evasive', '#e08a30', '#a03020', 'maple_valley'],
  ['chestnut_boar', '栗毛野猪', 25, 'autumn', 'boar', 'n', 'tough', '#8a4a2a', '#e8c890', 'leaf_corridor'],
  ['night_owl', '夜枭', 26, 'autumn', 'hawk', 'n', 'swift evasive', '#6a5a48', '#f0c040', 'leaf_corridor'],
  ['straw_golem', '稻草魔偶', 27, 'autumn', 'golem', 'n', 'slow thorns weak_magic', '#c8a060', '#6a4a2a', 'leaf_corridor'],
  ['toadstool', '毒伞菇', 28, 'autumn', 'mushroom', 'n', 'venom', '#b03a2a', '#f8e8d0', 'leaf_corridor'],
  ['maple_treant', '枫木树人', 34, 'autumn', 'treant', 'e', 'regen tough', '#a03a20', '#f0a040', 'maple_valley'],
  // 蛮荒雨林 T4-T5
  ['dart_frog', '箭毒蛙', 33, 'jungle', 'frog', 'n', 'venom evasive', '#3ad0f0', '#f0e030', 'vine_realm'],
  ['toucan', '巨嘴鸟', 34, 'jungle', 'hawk', 'n', 'swift', '#1a1a1a', '#f0a020', 'vine_realm'],
  ['bird_spider', '食鸟蛛', 36, 'jungle', 'spider', 'n', 'venom', '#3a2a20', '#e06030', 'vine_realm'],
  ['black_panther', '黑豹', 38, 'jungle', 'panther', 'n', 'swift fierce', '#1a1a24', '#e0c040', 'vine_realm'],
  ['vine_lasher', '鞭藤', 40, 'jungle', 'vine', 'n', 'thorns regen', '#3a8a2a', '#e04a6a', 'python_marsh'],
  ['orchid_mantis', '兰花螳螂', 41, 'jungle', 'mantis', 'n', 'swift evasive', '#f0a0d0', '#80d070', 'python_marsh'],
  ['jungle_croc', '雨林鳄', 42, 'jungle', 'croc', 'n', 'armored tough', '#4a6a3a', '#e0d080', 'python_marsh'],
  ['tribal_hunter', '蛮族猎手', 44, 'jungle', 'bandit', 'n', 'swift', '#7a4a2a', '#e0c040', 'python_marsh'],
  ['jungle_ape', '雨林巨猿', 48, 'jungle', 'troll', 'e', 'tough berserk', '#3a3a34', '#a07050', 'vine_realm'],
  ['python_mother', '雨林蛇母', 55, 'jungle', 'snake', 'b', 'venom tough regen', '#3a6a2a', '#e0c040', 'python_marsh'],
  // 珊瑚群岛 T4-T5
  ['seagull', '海鸥', 32, 'tropic', 'hawk', 'n', 'swift frail', '#f0f0f0', '#f0a030', 'palm_coast'],
  ['hermit_crab', '寄居蟹', 33, 'tropic', 'crab', 'n', 'armored', '#e0904a', '#f0e0c0', 'palm_coast'],
  ['lamp_jelly', '灯水母', 35, 'tropic', 'jellyfish', 'n', 'venom evasive', '#a0d0ff', '#f0a0e0', 'coral_atoll'],
  ['sea_turtle', '玳瑁海龟', 37, 'tropic', 'turtle', 'n', 'passive armored tough', '#3a8a6a', '#d8c890', 'palm_coast'],
  ['banded_seasnake', '环纹海蛇', 39, 'tropic', 'eel', 'n', 'venom swift', '#3a5aa0', '#f0e0a0', 'coral_atoll'],
  ['island_pirate', '海盗水手', 40, 'tropic', 'pirate', 'n', 'fierce', '#6a4a3a', '#c04040', 'palm_coast'],
  ['moray', '珊瑚海鳗', 43, 'tropic', 'eel', 'n', 'fierce evasive', '#6a6a3a', '#e0e060', 'coral_atoll'],
  ['coral_golem', '珊瑚魔像', 46, 'tropic', 'golem', 'n', 'armored slow', '#f07a6a', '#f8e0d0', 'coral_atoll'],
  ['pirate_captain', '海盗船长', 50, 'tropic', 'knight', 'e', 'fierce berserk', '#2a2a40', '#e0b040', 'palm_coast'],
  // 赤岩峡谷 T5-T6
  ['redrock_lizard', '赤岩蜥', 46, 'canyon', 'lizard', 'n', 'armored', '#c05a3a', '#f0c080', 'red_mesa'],
  ['coyote', '郊狼', 47, 'canyon', 'hyena', 'n', 'pack swift', '#b08860', '#5a4030', 'red_mesa'],
  ['bighorn', '大角羊', 49, 'canyon', 'goat', 'n', 'tough', '#a07050', '#e8d8c0', 'wind_pillars'],
  ['golden_eagle', '峡谷金雕', 50, 'canyon', 'hawk', 'n', 'swift fierce', '#6a4a2a', '#f0d070', 'wind_pillars'],
  ['dust_devil', '尘旋灵', 52, 'canyon', 'wisp', 'n', 'evasive swift', '#d8a070', '#fff0d0', 'wind_pillars'],
  ['red_scorpion', '赤蝎', 53, 'canyon', 'scorpion', 'n', 'venom armored', '#c04a2a', '#f0a040', 'red_mesa'],
  ['canyon_raider', '峡谷劫匪', 54, 'canyon', 'bandit', 'n', 'fierce', '#8a4a2a', '#e0c040', 'red_mesa'],
  ['redrock_golem', '赤岩魔像', 58, 'canyon', 'golem', 'n', 'armored slow', '#b05a3a', '#f0a060', 'red_mesa'],
  ['storm_roc', '雷霆巨鹏', 62, 'canyon', 'griffin', 'e', 'swift fierce', '#3a4a8a', '#f0f070', 'wind_pillars'],
  // 流沙大漠 T6-T7
  ['desert_camel', '野骆驼', 56, 'desert', 'camel', 'n', 'passive tough', '#d8b078', '#8a5a30', 'sand_oasis'],
  ['cactus_man', '仙人掌怪', 57, 'desert', 'cactoid', 'n', 'thorns regen', '#4a8a3a', '#f0e060', 'sand_oasis'],
  ['sand_monitor', '沙漠巨蜥', 58, 'desert', 'lizard', 'n', 'fierce', '#b08a50', '#5a3a20', 'sand_oasis'],
  ['scarab_swarm', '圣甲虫群', 59, 'desert', 'beetle', 'n', 'pack armored', '#2a6a8a', '#f0d040', 'sand_oasis'],
  ['quicksand_worm', '流沙蠕虫', 60, 'desert', 'worm', 'n', 'tough slow', '#c8a060', '#8a3a2a', 'king_tomb'],
  ['tomb_mummy', '古墓干尸', 62, 'desert', 'zombie', 'n', 'slow tough', '#c8b890', '#6a5a3a', 'king_tomb'],
  ['sand_wraith', '沙之怨灵', 64, 'desert', 'ghost', 'n', 'evasive', '#d8c8a0', '#a06030', 'king_tomb'],
  ['jackal_priest', '胡狼祭司', 65, 'desert', 'cultist', 'n', 'resist_magic', '#2a2a2a', '#e0b040', 'king_tomb'],
  ['tomb_guardian', '王陵守卫', 70, 'desert', 'knight', 'e', 'armored tough', '#c8a050', '#3a6a8a', 'king_tomb'],
  ['sandstorm_king', '沙暴之王', 78, 'desert', 'scorpion', 'b', 'venom fierce tough', '#d8a040', '#6a2a1a', 'king_tomb'],
  // 云岭高山 T6-T7
  ['shaggy_yak', '牦牛', 66, 'alpine', 'yak', 'n', 'passive tough', '#3a3030', '#e8e0d0', 'cloud_slope'],
  ['cliff_antelope', '岩羚', 68, 'alpine', 'deer', 'n', 'swift', '#c8c0b0', '#6a5a4a', 'cloud_slope'],
  ['cloud_leopard', '云豹', 70, 'alpine', 'panther', 'n', 'swift evasive', '#e8e8f0', '#4a4a5a', 'cloud_slope'],
  ['cloud_eagle', '云鹰', 72, 'alpine', 'hawk', 'n', 'swift fierce', '#8a7a6a', '#f8f0e0', 'eagle_gorge'],
  ['peak_yeti', '雪峰雪人', 74, 'alpine', 'yeti', 'n', 'tough fierce', '#f0f0f8', '#6a8ab0', 'eagle_gorge'],
  ['ice_ogre', '冰原食人魔', 76, 'alpine', 'troll', 'n', 'tough regen', '#a0c0d8', '#e0f0ff', 'eagle_gorge'],
  ['ice_rock_golem', '冰岩魔像', 78, 'alpine', 'golem', 'n', 'armored slow resist_melee', '#8ab0d0', '#e0f8ff', 'eagle_gorge'],
  ['storm_wisp', '风暴之灵', 80, 'alpine', 'wisp', 'n', 'evasive', '#c0d8ff', '#ffffff', 'cloud_slope'],
  ['cloud_dragon', '云岭古龙', 90, 'alpine', 'dragon', 'e', 'fierce tough', '#c8d8e8', '#6a8ac0', 'eagle_gorge'],
  // 晶簇荒原 T7-T8
  ['crystal_crab', '晶甲蟹', 86, 'crystal', 'crab', 'n', 'armored resist_melee', '#a080f0', '#e0d0ff', 'crystal_heart'],
  ['prism_slime', '棱镜史莱姆', 87, 'crystal', 'slime', 'n', 'regen weak_melee', '#c0e8ff', '#ff90e0', 'crystal_heart'],
  ['shard_spider', '晶刺蛛', 88, 'crystal', 'spider', 'n', 'venom', '#6a4aa0', '#c0a0ff', 'crystal_heart'],
  ['crystal_golem', '晶簇魔像', 95, 'crystal', 'golem', 'n', 'armored slow', '#8a60e0', '#f0e0ff', 'crystal_heart'],
  ['void_gazer', '虚空之眼', 98, 'crystal', 'eye', 'n', 'resist_ranged', '#2a1a4a', '#c080ff', 'void_field'],
  ['crystal_wyvern', '晶翼飞龙', 100, 'crystal', 'wyvern', 'n', 'swift fierce', '#a0a0ff', '#ffffff', 'void_field'],
  ['crystal_knight', '晶骸骑士', 102, 'crystal', 'knight', 'n', 'armored resist_magic', '#6a5aa0', '#e0d0ff', 'void_field'],
  ['crystal_lich', '晶冠巫妖', 110, 'crystal', 'lich', 'e', 'resist_magic lifesteal', '#4a3a8a', '#e0c0ff', 'void_field'],
  ['crystal_sovereign', '晶簇主宰', 120, 'crystal', 'golem', 'b', 'armored tough thorns', '#b080ff', '#ffffff', 'crystal_heart'],
];
/**
 * 12080 最外圈（用户 10-24）：8 个新群系各 6-8 种生物 + 1 个首领，用了 6 种新外形
 * （章鱼、鲨鱼、魔鬼鱼、飞蛾、元素、多头蛇）。都绑在最外圈的地点上，海岛上的等航行系统开放
 */
const OUTER_ROWS: Row[] = [
  // 青岚丘陵 T2-T3：刚出新手区的第二站，大多是温和的山地动物
  ['hill_hare', '青岚山兔', 11, 'hills', 'rabbit', 'n', 'passive swift', '#a8b890', '#f0f0e0', 'hill_pines'],
  ['pine_moth', '松针蛾', 13, 'hills', 'moth', 'n', 'evasive', '#7a9a6a', '#e8d070', 'hill_pines'],
  ['quarry_golem', '青石傀儡', 17, 'hills', 'golem', 'n', 'armored slow', '#7a8a8a', '#a0e0c0', 'hill_quarry'],
  ['brook_otter', '岚溪水獭', 14, 'hills', 'fox', 'n', 'swift pack', '#6a5040', '#d8c0a0', 'hill_brook'],
  ['terrace_goat', '梯田山羊', 16, 'hills', 'goat', 'n', 'tough', '#e0d8c0', '#8a6a4a', 'hill_terrace'],
  ['mist_hawk', '岚雾鹰', 19, 'hills', 'hawk', 'n', 'swift', '#8a9aa8', '#f0f0f0', 'hill_terrace'],
  ['sunken_octopus', '沉木章鱼', 23, 'hills', 'octopus', 'e', 'regen evasive', '#a05a6a', '#f0c0a0', 'sunken_bay'],
  ['terrace_ox_king', '青岚牛王', 28, 'hills', 'yak', 'b', 'tough berserk', '#5a6a5a', '#e8d080', 'hill_terrace'],
  // 古藤群岛 T4-T5：海上群岛，古藤和巨木里住着植物和飞虫
  ['isle_vine_lurker', '藤影潜伏者', 42, 'vineisles', 'vine', 'n', 'venom', '#3a6a3a', '#c0e070', 'vine_isle'],
  ['drift_crab', '浮木寄居蟹', 44, 'vineisles', 'crab', 'n', 'armored', '#a07050', '#e8d0a0', 'drift_isle'],
  ['leaf_moth', '霜叶蛾', 46, 'vineisles', 'moth', 'n', 'swift evasive', '#c86a3a', '#f0e0c0', 'frost_bay'],
  ['bay_manta', '霜湾魔鬼鱼', 49, 'vineisles', 'manta', 'n', 'evasive', '#4a6a8a', '#c0e0f0', 'frost_bay'],
  ['root_treant', '古根树人', 52, 'vineisles', 'treant', 'e', 'tough regen', '#5a4a2a', '#8ac060', 'vine_heart'],
  ['vine_mother', '万藤之母', 60, 'vineisles', 'hydra', 'b', 'regen venom tough', '#2a7a3a', '#f0a0d0', 'vine_heart'],
  // 腐月湿地 T5-T6：紫色月光下的沼泽，亡灵和毒虫
  ['moon_toad', '月沼蟾蜍', 56, 'moonmire', 'frog', 'n', 'venom', '#6a5a8a', '#c0f080', 'moon_pool'],
  ['bog_moth', '腐木灯蛾', 58, 'moonmire', 'moth', 'n', 'venom evasive', '#5a4a6a', '#c0a0ff', 'bog_hollow'],
  ['mire_hag', '泥沼巫婆', 62, 'moonmire', 'cultist', 'n', 'resist_magic', '#4a3a5a', '#a0e0a0', 'bog_hollow'],
  ['grave_walker', '荒冢行尸', 64, 'moonmire', 'zombie', 'n', 'tough slow', '#5a6a5a', '#c0c0a0', 'grave_moor'],
  ['moon_wisp', '月影幽火', 66, 'moonmire', 'elemental', 'n', 'evasive weak_melee', '#4a3a8a', '#e0c0ff', 'moon_pool'],
  ['bone_hydra', '骸骨多头蛇', 70, 'moonmire', 'hydra', 'e', 'lifesteal armored', '#c8c0a8', '#6a3a8a', 'grave_moor'],
  ['eclipse_witch', '月蚀魔女', 78, 'moonmire', 'banshee', 'b', 'lifesteal resist_magic berserk', '#2a1a3a', '#ff80c0', 'eclipse_mire'],
  // 潮歌群岛 T5：东边海上的珊瑚群岛
  ['song_siren', '潮歌海妖', 55, 'archipelago', 'banshee', 'n', 'evasive resist_ranged', '#4ab8a8', '#f0f0ff', 'song_isle'],
  ['reef_octopus', '礁石章鱼', 57, 'archipelago', 'octopus', 'n', 'regen', '#d07050', '#f0e0a0', 'song_isle'],
  ['turtle_shark', '海龟岛鲨', 60, 'archipelago', 'shark', 'n', 'fierce swift', '#5a7a9a', '#e8f0f0', 'turtle_isle'],
  ['coral_manta', '珊瑚魔鬼鱼', 62, 'archipelago', 'manta', 'e', 'evasive tough', '#e06a8a', '#ffe0a0', 'turtle_isle'],
  ['tide_queen', '碧潮女王', 70, 'archipelago', 'octopus', 'b', 'regen tough thorns', '#2ab0a0', '#ffd060', 'holy_reef'],
  // 寒星山脉 T7：北边雪山，冰元素和雪兽
  ['frost_elemental', '霜晶元素', 74, 'frostpeak', 'elemental', 'n', 'armored resist_ranged', '#8ab0e0', '#ffffff', 'star_peak'],
  ['starpeak_yeti', '寒星雪怪', 78, 'frostpeak', 'yeti', 'n', 'tough fierce', '#e8f0f8', '#6a8ac0', 'frost_pines'],
  ['ice_moth', '冰翼蛾', 80, 'frostpeak', 'moth', 'n', 'swift evasive', '#c0e0ff', '#8a60e0', 'snow_eagle_cliff'],
  ['snow_griffin', '雪鹰狮鹫', 84, 'frostpeak', 'griffin', 'n', 'swift fierce', '#f0f0f0', '#c0a060', 'snow_eagle_cliff'],
  ['aurora_shark', '极光冰鲨', 87, 'frostpeak', 'shark', 'n', 'fierce', '#6a8ab0', '#a0ffd0', 'aurora_lake'],
  ['star_mammoth', '寒星猛犸', 90, 'frostpeak', 'mammoth', 'e', 'tough armored', '#8a7a6a', '#e0f0ff', 'frost_pines'],
  ['aurora_hydra', '极光冰蛟', 96, 'frostpeak', 'hydra', 'b', 'armored regen fierce', '#a0c8f0', '#80ffc0', 'aurora_lake'],
  // 雷鸣断层 T8：东北角的雷暴高原
  ['storm_elemental', '雷暴元素', 98, 'thunder', 'elemental', 'n', 'swift weak_ranged', '#4a4a8a', '#f0f080', 'storm_mesa'],
  ['thunder_ram', '雷角公羊', 100, 'thunder', 'goat', 'n', 'fierce tough', '#5a5a7a', '#f0e060', 'storm_mesa'],
  ['spire_beetle', '铁林雷甲虫', 103, 'thunder', 'beetle', 'n', 'armored thorns', '#3a3a5a', '#80c0ff', 'iron_spires'],
  ['pale_shark', '苍岸雷鲨', 106, 'thunder', 'shark', 'n', 'swift fierce', '#c0c8d0', '#80c0ff', 'pale_shore'],
  ['rift_wyvern', '裂谷雷翼龙', 110, 'thunder', 'wyvern', 'e', 'swift fierce', '#4a5a8a', '#ffff80', 'thunder_rift'],
  ['thunder_lord', '雷鸣之主', 122, 'thunder', 'elemental', 'b', 'swift fierce berserk', '#2a2a6a', '#ffff60', 'thunder_rift'],
  // 灰烬海角 T7：东南角的火山海岸
  ['ash_hound', '灰烬猎犬', 76, 'ashcape', 'wolf', 'n', 'pack fierce', '#3a2a2a', '#ff8030', 'ash_dunes'],
  ['cinder_elemental', '余烬元素', 80, 'ashcape', 'elemental', 'n', 'thorns resist_melee', '#5a2a1a', '#ffa030', 'cinder_vents'],
  ['ember_moth', '焦林火蛾', 83, 'ashcape', 'moth', 'n', 'swift', '#6a2a1a', '#ffd040', 'ember_grove'],
  ['fjord_shark', '灼风火鲨', 88, 'ashcape', 'shark', 'n', 'fierce berserk', '#5a3a3a', '#ff6020', 'scorch_fjord'],
  ['magma_salamander', '熔岩蝾螈王', 92, 'ashcape', 'salamander', 'e', 'regen thorns', '#c04a1a', '#ffe060', 'cinder_vents'],
  ['ash_tyrant', '灰烬暴君', 104, 'ashcape', 'hydra', 'b', 'fierce tough berserk', '#3a1a1a', '#ff5010', 'scorch_fjord'],
  // 星陨晶海 T8+：南边海上的终局区域
  ['starglow_moth', '晶光蛾', 108, 'starsea', 'moth', 'n', 'evasive resist_magic', '#3a3a8a', '#a0f0ff', 'glow_isle'],
  ['star_manta', '星海魔鬼鱼', 112, 'starsea', 'manta', 'n', 'swift evasive', '#2a2a6a', '#e0e0ff', 'tide_ruins'],
  ['ruin_sentinel', '遗迹守卫', 116, 'starsea', 'golem', 'n', 'armored resist_ranged', '#8a8aa8', '#a0c0ff', 'tide_ruins'],
  ['void_octopus', '虚空章鱼', 120, 'starsea', 'octopus', 'e', 'regen lifesteal', '#1a1a4a', '#c080ff', 'glow_isle'],
  ['star_elemental', '星辉元素', 124, 'starsea', 'elemental', 'n', 'resist_magic weak_melee', '#4a4ab0', '#ffffff', 'starfall'],
  ['star_leviathan', '坠星海兽', 140, 'starsea', 'shark', 'b', 'tough fierce lifesteal', '#1a1a5a', '#80e0ff', 'starfall'],
];
/**
 * 世界首领（用户 10-24）：比普通首领强得多，各有一招专属大招和一套传说装备。
 * 外形字段只决定种族大类（掉落），动画在 game/worldBossArt.ts 里单独画。
 */
const WORLD_ROWS: Row[] = [
  ['wb_flame_dragon', '炎煌古龙', 50, 'lava', 'dragon', 'b', 'fierce tough armored', '#b8241a', '#ffb030', 'wb_flame_lair'],
  ['wb_soul_tree', '噬魂魔树', 70, 'moonmire', 'treant', 'b', 'lifesteal regen tough', '#3a2a4a', '#c070ff', 'wb_soul_lair'],
  ['wb_frost_colossus', '永冬巨像', 90, 'frostpeak', 'golem', 'b', 'armored tough slow', '#7aa8d8', '#e0f8ff', 'wb_frost_lair'],
  ['wb_thunder_roc', '天罚雷鹏', 110, 'thunder', 'griffin', 'b', 'swift fierce evasive', '#34345e', '#fff060', 'wb_thunder_lair'],
  ['wb_void_eye', '虚无魔眼', 135, 'starsea', 'eye', 'b', 'resist_magic lifesteal thorns', '#1a1030', '#ff40a0', 'wb_void_lair'],
];
/** 世界首领的专属大招：每第 4 下放一次，伤害 ×2.6 */
export const WORLD_SKILL: Record<string, { name: string; desc: string }> = {
  ...Object.fromEntries(HW_TIERS.map((_, d) => [hwBossId(d), { name: '南瓜炸弹', desc: '高举权杖，一串燃着鬼火的南瓜灯从天而降，落地炸开' }])),
  wb_flame_dragon: { name: '天火流星', desc: '振翅升空，喷出烈焰，天上落下一阵火流星' },
  wb_soul_tree: { name: '噬魂缠根', desc: '地下钻出尖刺树根把人缠住，再吸走魂火' },
  wb_frost_colossus: { name: '永冬崩裂', desc: '双拳砸地，冰刺一路从地底炸开' },
  wb_thunder_roc: { name: '天罚雷霆', desc: '张开双翼，召下一道道落雷' },
  wb_void_eye: { name: '虚无凝视', desc: '瞳孔聚光，射出一道撕裂空间的光束' },
};
const TIER_LEVELS = [1, 10, 20, 30, 40, 55, 70, 95];
const tierOfLevel = (lvl: number) => TIER_LEVELS.filter((l) => lvl >= l).length - 1;

const RANK: Record<string, Rank> = { n: 'normal', e: 'elite', b: 'boss' };

const toSpecies = ([id, name, level, region, form, rank, traits, color, accent, home]: Row, tier: number): Species => ({
  id, name, tier, level, region, form, rank: RANK[rank], traits: traits.split(' ').filter(Boolean) as TraitId[], color, accent, home,
});
export const SPECIES: Species[] = [
  ...[T1, T2, T3, T4, T5, T6, T7, T8].map((rows, t) => [...rows, ...NEW_SPECIES[t]]).flatMap((rows, tier) => rows.map((r) => toSpecies(r, tier))),
  ...RING_ROWS.map((r) => ({ ...toSpecies(r, tierOfLevel(r[2])), ring: true })),
  ...OUTER_ROWS.map((r) => ({ ...toSpecies(r, tierOfLevel(r[2])), outer: true })),
  ...WORLD_ROWS.map((r) => ({ ...toSpecies(r, tierOfLevel(r[2])), world: true })),
  // 野马（用户 10-24）：三个地方各一种，打败有几率掉小马崽
  ...([
    ['wild_horse', '金穗野马', 12, 'savanna', 'horse', 'n', 'swift', '#9a6232', '#3a2010', 'golden_plain'],
    ['hill_horse', '青岚野马', 32, 'hills', 'horse', 'n', 'swift tough', '#5a4a46', '#e8e0d4', 'hill_pines'],
    ['snow_horse', '雪鬃野马', 72, 'alpine', 'horse', 'e', 'swift tough evasive', '#dfe6ee', '#9ab4d0', 'cloud_slope'],
  ] as Row[]).map((r): Species => ({ ...toSpecies(r, tierOfLevel(r[2])), horse: true })),
  // 万圣节南瓜王（用户 10-24）：5 档难度各一只，住在活动祭坛，召唤了才能打
  ...HW_TIERS.map((h, d): Species => ({
    ...toSpecies([hwBossId(d), `南瓜王·${h.name}`, h.lv, 'town', 'golem', 'b', d < 2 ? 'tough fierce' : d < 4 ? 'tough fierce lifesteal' : 'tough fierce lifesteal thorns', '#e8781a', ['#8a3ad8', '#3a9ae8', '#3ad87a', '#e83a4a', '#f0d040'][d], HW_ALTAR], tierOfLevel(h.lv)),
    event: true,
  })),
];

/** 体型档（精英大一档，首领大两档） */
export const sizeOf = (sp: Pick<Species, 'form' | 'rank'>) =>
  Math.min(5, FORM_SIZE[sp.form] + (sp.rank === 'elite' ? 1 : sp.rank === 'boss' ? 2 : 0));
export const SIZE_PX = [20, 24, 32, 40, 48, 56];
