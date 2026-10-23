import type {
  ActionDef, Buff, BuffKind, CombatStyle, Drop, EquipSlot, ItemCategory, ItemDef, ItemStack, LootTable, MonsterDef, RegionId, SkillGroup, SkillId, ToolSlot,
} from './types';
import { FORM_FAMILY, isAnimal, SPECIES, type Family, type Species } from './bestiary';

/*
 * 资源、装备、怪物都是正式内容，数值按公式批量生成；怪物设计表在 bestiary.ts。
 * 闭环：采集 → 仓库 → 生产 → 装备/消耗品 → 战斗 → 掉落 → 生产或卖钱。
 */

/** 世界大小：1080 → 1480 → 2188（用户 10-22 嫌挤，两次要求扩大） */
export const MAP_W = 8848;
export const MAP_H = 8848;
/**
 * 8848 大地图（用户 10-23）：原来 5088 的世界原样放在正中间这个方框里（格子尺寸不变，老地方之间走路时间不变），
 * 外面一圈是 8 个新区域
 */
export const OLD_BOX = { x: 1880, y: 1880, size: 5088 };

export interface SkillInfo { name: string; color: string; group: SkillGroup; desc: string }

export const SKILLS: Record<SkillId, SkillInfo> = {
  mining: { name: '挖矿', color: '#b08d57', group: 'gather', desc: '采集矿石、符文石和宝石' },
  woodcutting: { name: '伐木', color: '#6a9a4a', group: 'gather', desc: '砍伐各地的树木' },
  fishing: { name: '钓鱼', color: '#4f86b8', group: 'gather', desc: '在湖泊、海岸和熔池钓鱼' },
  gathering: { name: '采集', color: '#7cc456', group: 'gather', desc: '用镰刀采棉花和草药，偶尔捡到野生种子' },
  farming: { name: '种植', color: '#c8a040', group: 'gather', desc: '在城镇附近的田里用锄头播种、收获作物，收成时会收回种子' },
  hunting: { name: '狩猎', color: '#b0703a', group: 'gather', desc: '在野外狩猎野兽，用刮皮刀剥取兽皮' },
  thieving: { name: '偷窃', color: '#8a7ab8', group: 'gather', desc: '从镇民和商队身上摸金币，失败会被晕眩' },
  cooking: { name: '烹饪', color: '#d4a03c', group: 'produce', desc: '把鱼和作物做成回血的食物' },
  smithing: { name: '锻造', color: '#c26a3a', group: 'produce', desc: '冶炼精炼锭，打造剑、长枪、匕首、板甲、工具和箭头' },
  fletching: { name: '制弓', color: '#a8944a', group: 'produce', desc: '加工木材，制作短弓、长弓、弩、鱼竿和箭' },
  herblore: { name: '药剂', color: '#4ab89a', group: 'produce', desc: '用草药调配治疗药水' },
  crafting: { name: '工艺', color: '#b87a9a', group: 'produce', desc: '鞣制皮革、纺织布料，制作皮甲、布甲、法杖、符文和首饰' },
  enhancing: { name: '强化', color: '#e8d04a', group: 'produce', desc: '制作强化石（装备强化系统待开放）' },
  melee: { name: '近战', color: '#c84a4a', group: 'combat', desc: '装备剑、长枪、匕首时获得经验' },
  ranged: { name: '远程', color: '#6ab84a', group: 'combat', desc: '装备短弓、长弓、弩时获得经验，消耗箭' },
  magic: { name: '魔法', color: '#5a7ae8', group: 'combat', desc: '装备法杖时获得经验，消耗符文' },
  defence: { name: '防御', color: '#7a8ab8', group: 'combat', desc: '任何战斗都会获得，决定能穿的护甲' },
  hitpoints: { name: '生命', color: '#d0566b', group: 'combat', desc: '任何战斗都会获得，每级 10 点生命上限' },
};

export const SKILL_GROUPS: { id: SkillGroup; name: string }[] = [
  { id: 'gather', name: '采集' },
  { id: 'produce', name: '生产' },
  { id: 'combat', name: '战斗' },
];

export const REGIONS: Record<RegionId, { name: string; color: string }> = {
  town: { name: '城镇·安全区', color: '#7a9a52' },
  snow: { name: '冰封雪原', color: '#dfe8f0' },
  highland: { name: '灰岩高地', color: '#8a8a88' },
  coast: { name: '金沙海岸', color: '#e0c27a' },
  lava: { name: '熔岩荒地', color: '#6a3a2e' },
  abyss: { name: '深渊裂谷', color: '#3e3352' },
  swamp: { name: '亡者沼泽', color: '#4a5a3a' },
  woodland: { name: '幽深林地', color: '#3f6e34' },
  giantwood: { name: '巨木森林', color: '#2f5a32' },
  savanna: { name: '金穗草原', color: '#c8b052' },
  autumn: { name: '枫红秋林', color: '#b0562a' },
  jungle: { name: '蛮荒雨林', color: '#2a6a2a' },
  tropic: { name: '珊瑚群岛', color: '#3aa8b8' },
  canyon: { name: '赤岩峡谷', color: '#a84a30' },
  desert: { name: '流沙大漠', color: '#dcb066' },
  alpine: { name: '云岭高山', color: '#8aa898' },
  crystal: { name: '晶簇荒原', color: '#6a52a0' },
};

// ---- 物品 ----

const itemList: ItemDef[] = [];
const ITEMS_NAME = (id: string) => itemList.find((x) => x.id === id)?.name ?? id;
const item = (id: string, name: string, category: ItemCategory, value: number, extra: Partial<ItemDef> = {}) => {
  itemList.push({ id, name, category, value, ...extra });
  return id;
};

item('coins', '金币', 'misc', 1);
item('bones', '骨头', 'misc', 3);

/**
 * T1-T8 八个阶级：矿石、木头、棉花、兽皮各 8 阶，装备档位和它们一一对应。
 * T1 石头直接打磨成石料，T3 起用两种矿石合炼。
 */
export const TIERS = [
  { id: 'wood', metal: '木', ore: 'stone', oreName: '石头', wood: 'plain', woodName: '原木', rune: '木', level: 1 },
  { id: 'copper', metal: '铜', ore: 'copper_ore', oreName: '铜矿', wood: 'birch', woodName: '桦木', rune: '铜', level: 10 },
  { id: 'tin', metal: '锡', ore: 'tin_ore', oreName: '锡矿', wood: 'pine', woodName: '松木', rune: '锡', level: 20 },
  { id: 'iron', metal: '铁', ore: 'iron_ore', oreName: '铁矿', wood: 'oak', woodName: '橡木', rune: '铁', level: 30 },
  { id: 'titanium', metal: '钛', ore: 'titanium_ore', oreName: '钛矿', wood: 'cedar', woodName: '雪松木', rune: '钛', level: 40 },
  { id: 'runic', metal: '符文', ore: 'rune_ore', oreName: '符文矿', wood: 'bloodoak', woodName: '血橡木', rune: '秘纹', level: 55 },
  { id: 'meteor', metal: '陨铁', ore: 'meteor_ore', oreName: '陨铁矿', wood: 'ashbark', woodName: '灰烬树皮木', rune: '陨星', level: 70 },
  { id: 'adamant', metal: '精金', ore: 'adamant_ore', oreName: '精金矿', wood: 'white', woodName: '白木', rune: '精金', level: 95 },
];
/** 阶级下标（0-7）→ 显示用的 T1-T8 */
/** 烤兽肉回复量，比同阶鱼略高，鼓励打猎 */
const MEAT_HEAL = [40, 70, 110, 150, 200, 260, 330, 420];
export const tierName = (i: number) => `T${i + 1}`;
/** 等级对应能拿到的最高阶级下标 */
export const tierForLevel = (level: number) => TIERS.reduce((best, t, i) => (t.level <= level ? i : best), 0);
const POWER = [5, 10, 17, 25, 34, 45, 58, 72];
const TOOL_SPEED = [0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32];
const BAR_VALUE = [5, 12, 30, 60, 120, 250, 520, 1000];
const RES_VALUE = [2, 5, 12, 25, 50, 100, 200, 400];

// 四类分阶资源，同阶同价
TIERS.forEach((t, i) => {
  item(t.ore, t.oreName, 'resource', RES_VALUE[i], { tier: i });
  item(`${t.wood}_log`, t.woodName, 'resource', RES_VALUE[i], { tier: i });
  item(`cotton_${i + 1}`, '棉花', 'resource', RES_VALUE[i], { tier: i });
  item(`hide_${i + 1}`, '兽皮', 'resource', RES_VALUE[i], { tier: i });
  // 怪物掉落：动物掉兽肉（烹饪成烤兽肉），其他怪物掉魔核（和骨头一起淬炼强化石）
  item(`meat_${i + 1}`, '兽肉', 'resource', RES_VALUE[i], { tier: i });
  item(`steak_${i + 1}`, '烤兽肉', 'food', RES_VALUE[i] * 2, { tier: i, heals: MEAT_HEAL[i] });
  item(`core_${i + 1}`, '魔核', 'material', RES_VALUE[i] * 3, { tier: i });
});
// 宝石：挖矿时小概率顺带挖到
item('sapphire', '蓝宝石', 'resource', 150);
item('ruby', '红宝石', 'resource', 300);
item('diamond', '钻石', 'resource', 600);
export const GEM_FOR_TIER = ['sapphire', 'sapphire', 'sapphire', 'sapphire', 'ruby', 'ruby', 'diamond', 'diamond'];

// 鱼与食物：[id, 名字, 钓鱼等级, 回复]
const FISH: [string, string, number, number][] = [
  ['minnow', '银鱼', 1, 30], ['shrimp', '虾', 1, 30], ['carp', '绿洲鲤', 5, 45], ['trout', '鳟鱼', 10, 60],
  ['bass', '海鲈', 15, 80], ['cod', '冰鳕', 20, 100], ['salmon', '鲑鱼', 25, 130], ['eel', '沉潭鳗', 30, 160],
  ['lava_eel', '熔岩鳗', 35, 190], ['ghostfish', '幽灵鱼', 40, 220], ['abyssfish', '深渊鱼', 58, 300],
];
/** 新增鱼获（用户 10-22 要求）：每阶 4 种，[id, 名字, 钓鱼等级, 回复, 产地说明] */
const NEW_FISH: [string, string, number, number, string][] = [
  ['loach', '泥鳅', 2, 32, '镜湖浅滩的泥底'], ['crucian', '鲫鱼', 4, 36, '镜湖码头'], ['grass_carp', '草鱼', 6, 42, '幽苔水洼'], ['perch', '河鲈', 8, 48, '幽苔水洼'],
  ['bighead', '花鲢', 11, 62, '桦影溪谷'], ['catfish', '黄颡鱼', 13, 68, '桦影溪谷'], ['bream', '银鳊', 16, 76, '腐沼渡口'], ['pike', '狗鱼', 18, 84, '腐沼渡口'],
  ['snow_trout', '雪鳟', 21, 104, '北境冰莲湾'], ['herring', '冰原鲱', 23, 112, '北境冰莲湾'], ['flounder', '寒带比目鱼', 26, 124, '冰湖峡湾'], ['sturgeon', '鲟鱼', 28, 134, '冰湖峡湾'],
  ['swamp_catfish', '沼泽鲶', 31, 164, '亡语沉潭'], ['bonefin', '骨鳍鱼', 34, 176, '亡语沉潭'], ['stingray', '毒刺鳐', 36, 184, '鳄鱼泥滩'], ['squid', '墨乌贼', 38, 192, '沉船湾'],
  ['grouper', '珊瑚石斑', 42, 226, '珊瑚浅滩'], ['lanternfish', '灯笼鱼', 45, 238, '珊瑚浅滩'], ['swordfish', '剑鱼', 48, 250, '沉船湾'], ['tuna', '金枪鱼', 52, 266, '沉船湾'],
  ['magma_shrimp', '熔岩虾', 56, 290, '黑曜熔池'], ['fire_carp', '火鳞鲤', 60, 306, '黑曜熔池'], ['flame_shark', '炽鳍鲨', 64, 322, '硫磺泉'], ['sulfur_catfish', '硫磺鲶', 68, 338, '硫磺泉'],
  ['star_ray', '星斑魟', 72, 356, '星光湖'], ['crystal_fish', '晶鳞鱼', 78, 380, '星光湖'], ['phantom_eel', '幻光鳗', 84, 404, '幻潮海崖'], ['thunder_shark', '雷纹鲨', 90, 428, '幻潮海崖'],
  ['abyss_bass', '深渊巨鲈', 96, 452, '深渊潮眼'], ['void_angler', '虚空鮟鱇', 102, 476, '深渊潮眼'], ['dragonfish', '古龙鱼', 110, 508, '龙渊'], ['starwhale', '星海鲸鲨', 120, 548, '龙渊'],
];
for (const [id, name, lvl, heals] of NEW_FISH) FISH.push([id, name, lvl, heals]);
export const fishTier = (lvl: number) => Math.max(0, [1, 10, 20, 30, 40, 55, 70, 95].filter((l) => lvl >= l).length - 1);
for (const [id, name, lvl, heals] of FISH) {
  const where = NEW_FISH.find((f) => f[0] === id)?.[4];
  item(`raw_${id}`, `生${name}`, 'resource', Math.round(2 + lvl * 0.9), { tier: fishTier(lvl), desc: `钓鱼 ${lvl} 级可钓${where ? `，产自${where}` : ''}。直接烤熟能回血，也能做成料理。` });
  item(id, `烤${name}`, 'food', Math.round(4 + lvl * 1.4), { tier: fishTier(lvl), heals, desc: `最简单的做法，只回复生命，没有增益。` });
}
item('burnt_food', '烧焦的食物', 'misc', 0);

// 作物与草药
item('potato', '土豆', 'resource', 2, { tier: 0, desc: '种植收获的作物，烤一下就能吃。' });
item('wheat', '小麦', 'resource', 3, { tier: 0, desc: '种植收获的作物，两份能烤成面包。' });
const ITEMS_EARLY = new Set(['potato', 'wheat']);
item('baked_potato', '烤土豆', 'food', 4, { heals: 25 });
item('bread', '面包', 'food', 10, { heals: 50 });
/**
 * 作物（用户 10-23 要求：种植和采集分开，种子几十种）。每阶 4 种，共 32 种。
 * [id, 名字, 种植等级, 颜色, 料理名, 形状]
 * 种子来源：集市种子摊（T1-T2）、收成时收回、1% 变异出下一种作物的种子、
 * 同阶野怪掉落、采集草药棉花时捡到、偷农夫/小贩。
 */
export const CROPS: [string, string, number, string, string, 'veg' | 'grain'][] = [
  ['potato', '土豆', 1, '#b08a50', '', 'veg'], ['wheat', '小麦', 3, '#e0c050', '', 'grain'],
  ['carrot', '胡萝卜', 5, '#f08a2a', '蜜汁胡萝卜', 'veg'], ['cabbage', '卷心菜', 7, '#8ad060', '卷心菜汤', 'veg'],
  ['onion', '洋葱', 10, '#d8b0d0', '酥炸洋葱圈', 'veg'], ['corn', '玉米', 12, '#f0d040', '黄油烤玉米', 'grain'],
  ['tomato', '番茄', 15, '#e04a3a', '番茄浓汤', 'veg'], ['pea', '豌豆', 17, '#6ac04a', '奶香豌豆泥', 'veg'],
  ['pumpkin', '南瓜', 20, '#f0902a', '南瓜派', 'veg'], ['pepper', '甜椒', 23, '#e0c030', '烤甜椒', 'veg'],
  ['eggplant', '茄子', 25, '#7a4ab0', '红烧茄子', 'veg'], ['strawberry', '草莓', 27, '#f04a6a', '草莓挞', 'veg'],
  ['garlic', '大蒜', 30, '#f0ece0', '蒜香面包', 'veg'], ['beet', '甜菜', 33, '#a02a5a', '甜菜汤', 'veg'],
  ['watermelon', '西瓜', 35, '#4aa04a', '西瓜冰沙', 'veg'], ['chili', '辣椒', 37, '#e0302a', '麻辣小炒', 'veg'],
  ['rice', '稻米', 40, '#f4f0e0', '香米饭团', 'grain'], ['melon', '香瓜', 44, '#c8e070', '香瓜沙拉', 'veg'],
  ['grape', '葡萄', 48, '#8a4ac0', '葡萄干糕', 'veg'], ['asparagus', '芦笋', 51, '#7ab04a', '黄油芦笋', 'grain'],
  ['snow_yam', '雪莲薯', 55, '#e8f0ff', '雪莲薯泥', 'veg'], ['gold_wheat', '金穗麦', 59, '#ffd040', '金麦面包', 'grain'],
  ['fire_pepper', '火焰椒', 63, '#ff6a1a', '火焰椒酱烤肉', 'veg'], ['moon_melon', '月光瓜', 66, '#c8d8ff', '月光瓜羹', 'veg'],
  ['star_berry', '星光莓', 70, '#9ab0ff', '星光莓果酱', 'veg'], ['dragon_cress', '龙须菜', 76, '#3ac08a', '清炒龙须菜', 'grain'],
  ['frost_kale', '霜晶菜', 82, '#8ae0f0', '霜晶菜卷', 'veg'], ['blood_corn', '血玉米', 88, '#c0203a', '血玉米浓汤', 'grain'],
  ['lingzhi', '灵芝', 95, '#a0402a', '灵芝炖汤', 'veg'], ['immortal_peach', '仙桃', 100, '#ffb0c0', '仙桃蜜饯', 'veg'],
  ['phoenix_fruit', '凤凰果', 105, '#ff8a3a', '凤凰果挞', 'veg'], ['world_fruit', '世界树果', 110, '#f0ffb0', '世界树果羹', 'veg'],
];
/** 集市种子摊卖的种子（T1-T2） */
export const SEED_SHOP = CROPS.filter((c) => c[2] < 20).map((c) => `seed_${c[0]}`);
/** 种子在集市的售价 = 价值 × 4 */
export const SEED_PRICE = 4;
CROPS.forEach(([id, name, lvl, , dish]) => {
  const tier = tierForLevel(lvl);
  const where = ['家园农田', '家园农田', '南郊麦田', '南郊麦田', '东郊菜园', '东郊菜园', '西岭灵田', '西岭灵田'][tier];
  item(`seed_${id}`, `${name}种子`, 'seed', Math.max(1, Math.round(1 + lvl * 0.6)), {
    tier, desc: `种植 ${lvl} 级可在${where}播种。${tier < 2 ? '集市种子摊有卖；' : ''}收成时大概率收回种子，${tier}阶野怪和采集时也会掉落。`,
  });
  if (!ITEMS_EARLY.has(id)) item(id, name, 'resource', Math.round(2 + lvl * 0.8), { tier, desc: `种植收获的作物。两个能做成${dish}。` });
  if (dish) item(`meal_${id}`, dish, 'food', Math.round(5 + lvl * 1.6), { tier, heals: Math.round(28 + lvl * 4.4), desc: `用${name}做的家常菜，只回复生命。` });
});
const HERBS: [string, string, number, number][] = [
  // [id, 名字, 采集等级, 药水回复]
  ['green_herb', '绿叶草', 1, 80], ['fire_bloom', '火绒花', 2, 110], ['moon_herb', '月露草', 18, 170],
  ['silver_leaf', '银叶草', 21, 210], ['flame_heart', '炎心花', 25, 260], ['frost_lotus', '冰莲', 26, 330],
];
HERBS.forEach(([id, name, lvl, heals]) => {
  item(id, name, 'resource', Math.round(3 + lvl * 1.5));
  item(`${id}_potion`, `${name}药水`, 'potion', Math.round(15 + lvl * 4), { heals });
});

// ---- 加工材料 ----
// 精炼锭（锻造）：T1 是硬木锭（原木 + 石头打磨），T2 起由同阶矿石冶炼
// 加工木材（制弓）、皮革和布料（工艺）都是同阶原料 ×2 → 1
TIERS.forEach((t, i) => {
  item(`${t.id}_bar`, i === 0 ? '硬木锭' : `${t.metal}锭`, 'material', BAR_VALUE[i], { tier: i });
  item(`plank_${i + 1}`, `${t.woodName}板材`, 'material', RES_VALUE[i] * 3, { tier: i });
  item(`leather_${i + 1}`, '皮革', 'material', RES_VALUE[i] * 3, { tier: i });
  item(`cloth_${i + 1}`, '布料', 'material', RES_VALUE[i] * 3, { tier: i });
  item(`${t.id}_arrowhead`, `${t.metal}箭头`, 'material', Math.ceil(BAR_VALUE[i] / 12), { tier: i });
  item(`${t.id}_arrow`, `${t.metal}箭`, 'ammo', Math.ceil(BAR_VALUE[i] / 8), { tier: i, ammo: { style: 'ranged', power: Math.round(POWER[i] / 2) } });
  item(`${t.id}_rune`, `${t.rune}符文`, 'ammo', Math.ceil(BAR_VALUE[i] / 8), { tier: i, ammo: { style: 'magic', power: Math.round(POWER[i] / 2) } });
});
item('shaft', '箭杆', 'material', 1);

/**
 * 新资源线（用户 10-23 要求几十种 T1-T8 新材料）：晶石、香料、树脂、羽毛，各 8 阶共 32 种。
 * T1 在老地图城镇附近，T2-T8 在 8848 外圈的新区域。用途都在落霞城的珍材坊：
 * 晶石 + 树脂 + 布料 → 晶能符文；羽毛 + 树脂 + 箭杆 + 箭头 → 羽箭；香料 + 兽肉 → 香料料理
 */
export type MatLine = 'crystal' | 'spice' | 'resin' | 'feather';
export const MAT_LINES: Record<MatLine, { name: string; skill: SkillId; verb: string; names: string[]; desc: string }> = {
  crystal: { name: '晶石', skill: 'mining', verb: '开采', names: ['石英', '紫晶', '黄晶', '碧玉', '蓝晶', '星辉晶', '日耀晶', '虚空晶'], desc: '从岩缝里敲下来的晶石，能把魔力存进符文里' },
  spice: { name: '香料', skill: 'gathering', verb: '采摘', names: ['薄荷叶', '野茴香', '肉桂皮', '丁香', '豆蔻', '藏红花', '雪域花椒', '虚空星椒'], desc: '晒干的香草和香料，和兽肉一起做成料理' },
  resin: { name: '树脂', skill: 'woodcutting', verb: '割取', names: ['松脂', '桦胶', '枫脂', '琥珀脂', '龙血脂', '烈阳脂', '霜华脂', '白玉脂'], desc: '割开树皮流出的树脂，做箭和符文时用来粘合' },
  feather: { name: '羽毛', skill: 'hunting', verb: '收集', names: ['雀羽', '鸦羽', '鹰羽', '鹤羽', '孔雀羽', '雷鸟羽', '冰凰羽', '天凤羽'], desc: '鸟巢边捡到的羽毛，装在箭尾上箭飞得更稳' },
};
export const MAT_LINE_IDS = Object.keys(MAT_LINES) as MatLine[];
const SPICE_DISH = ['薄荷烤肉', '茴香炖肉', '肉桂烤排', '丁香焖肉', '豆蔻咖喱', '藏红花炖肉', '花椒爆肉', '星椒龙排'];
const SPICE_BUFF: BuffKind[] = ['speed', 'str', 'atk', 'def', 'xp', 'str', 'atk', 'def'];
TIERS.forEach((t, i) => {
  const n = i + 1;
  for (const line of MAT_LINE_IDS) {
    const L = MAT_LINES[line];
    item(`${line}_${n}`, L.names[i], 'resource', Math.round(RES_VALUE[i] * 1.3), {
      tier: i, desc: `${L.desc}。${SKILLS[L.skill].name} ${t.level} 级可${L.verb}。`,
    });
  }
  const crys = MAT_LINES.crystal.names[i];
  const fea = MAT_LINES.feather.names[i];
  item(`crystal_rune_${n}`, `${crys}符文`, 'ammo', Math.ceil(BAR_VALUE[i] / 5), {
    tier: i, ammo: { style: 'magic', power: Math.round((POWER[i] / 2) * 1.3) }, desc: `嵌了${crys}的符文，比同阶普通符文威力高三成。`,
  });
  item(`feather_arrow_${n}`, `${fea}箭`, 'ammo', Math.ceil(BAR_VALUE[i] / 5), {
    tier: i, ammo: { style: 'ranged', power: Math.round((POWER[i] / 2) * 1.3) }, desc: `箭尾装了${fea}，比同阶普通箭威力高三成。`,
  });
});

// 强化石（占位）
const STONES: [string, string, number][] = [
  ['enh_basic', '初级强化石', 1], ['enh_mid', '中级强化石', 30], ['enh_high', '高级强化石', 55], ['enh_legend', '传说强化石', 95],
];
for (const [id, name, lvl] of STONES) item(id, name, 'material', 20 + lvl * 12);

// ---- 装备 ----
/*
 * T1 木制 … T8 精金，每阶都有下面全部装备。基础属性 = 本阶强度 POWER × 系数。
 * mat 是材料：bar 精炼锭、plank 加工木材、leather 皮革、cloth 布料。
 * plus 是在本阶解锁等级上再加几级才能做。
 */
type Mat = 'bar' | 'plank' | 'leather' | 'cloth';
export interface EquipType {
  key: string;
  name: string;
  slot: EquipSlot;
  /** 穿戴要求的技能 */
  skill: SkillId;
  /** 制作技能 */
  maker: SkillId;
  mats: [Mat, number][];
  plus: number;
  stats: { attack?: number; strength?: number; defence?: number; style?: CombatStyle; speed?: boolean; attackMs?: number };
  group: string;
}
const W = (key: string, name: string, skill: SkillId, maker: SkillId, mats: [Mat, number][], plus: number, attack: number, strength: number, attackMs: number, style: CombatStyle): EquipType =>
  ({ key, name, slot: 'weapon', skill, maker, mats, plus, stats: { attack, strength, attackMs, style }, group: '武器' });
const ARMOR_SLOTS: [EquipSlot, number, number][] = [
  // [部位, 防御占比, 制作多加几级]
  ['head', 0.3, 2], ['body', 0.5, 6], ['feet', 0.2, 3], ['hands', 0.15, 1],
];
const A = (type: string, names: string[], mat: Mat, maker: SkillId, def: number, attack: number, strength: number, style: CombatStyle): EquipType[] =>
  ARMOR_SLOTS.map(([slot, k, plus], j) => ({
    key: `${type}_${slot}`, name: names[j], slot, skill: 'defence' as SkillId, maker, mats: [[mat, [2, 4, 2, 1][j]]] as [Mat, number][], plus,
    stats: { defence: def * k, attack: attack * k, strength: strength * k, style }, group: { plate: '板甲', leather: '皮甲', cloth: '布甲' }[type]!,
  }));
const TL = (key: string, name: string, slot: EquipSlot, skill: SkillId, maker: SkillId, mats: [Mat, number][], plus: number): EquipType =>
  ({ key, name, slot, skill, maker, mats, plus, stats: { speed: true }, group: '工具' });

export const EQUIP_TYPES: EquipType[] = [
  // 近战：精炼锭
  W('sword', '剑', 'melee', 'smithing', [['bar', 2]], 1, 1.0, 1.0, 2400, 'melee'),
  W('spear', '长枪', 'melee', 'smithing', [['bar', 2], ['plank', 1]], 3, 0.8, 1.4, 3000, 'melee'),
  W('dagger', '匕首', 'melee', 'smithing', [['bar', 1]], 0, 1.25, 0.65, 2000, 'melee'),
  // 远程：皮革 + 加工木材
  W('shortbow', '短弓', 'ranged', 'fletching', [['plank', 2], ['leather', 1]], 1, 1.0, 0.6, 2200, 'ranged'),
  W('longbow', '长弓', 'ranged', 'fletching', [['plank', 3], ['leather', 1]], 4, 1.25, 0.8, 2800, 'ranged'),
  W('crossbow', '弩', 'ranged', 'fletching', [['plank', 3], ['leather', 2]], 6, 0.85, 1.3, 3400, 'ranged'),
  // 魔法：加工木材 + 布料
  W('staff', '法杖', 'magic', 'crafting', [['plank', 2], ['cloth', 1]], 4, 1.0, 0.6, 2400, 'magic'),
  // 护甲：头、身、脚、手
  ...A('plate', ['板甲头盔', '板甲胸甲', '板甲战靴', '板甲护手'], 'bar', 'smithing', 2.0, 0, 0.25, 'melee'),
  ...A('leather', ['皮帽', '皮甲', '皮靴', '皮手套'], 'leather', 'crafting', 1.4, 0.5, 0, 'ranged'),
  ...A('cloth', ['布帽', '布袍', '布鞋', '布手套'], 'cloth', 'crafting', 1.0, 0.3, 0.4, 'magic'),
  // 工具
  TL('axe', '斧头', 'axe', 'woodcutting', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('pickaxe', '镐子', 'pickaxe', 'mining', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('sickle', '镰刀', 'sickle', 'gathering', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('knife', '刮皮刀', 'knife', 'hunting', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('hoe', '锄头', 'hoe', 'farming', 'smithing', [['bar', 1], ['plank', 1]], 2),
  TL('hammer', '锻造锤', 'hammer', 'smithing', 'smithing', [['bar', 2], ['plank', 1]], 2),
  TL('rod', '鱼竿', 'rod', 'fishing', 'fletching', [['plank', 2], ['cloth', 1]], 2),
  TL('needle', '缝纫针', 'needle', 'crafting', 'smithing', [['bar', 1]], 0),
];
const TOOL_SLOTS: EquipSlot[] = ['axe', 'pickaxe', 'sickle', 'knife', 'rod', 'hoe', 'hammer', 'needle'];
const matItem = (m: Mat, i: number) => (m === 'bar' ? `${TIERS[i].id}_bar` : `${m}_${i + 1}`);
const matCost = (m: Mat, i: number) => (m === 'bar' ? BAR_VALUE[i] : RES_VALUE[i] * 3);

TIERS.forEach((t, i) => {
  const p = POWER[i];
  for (const e of EQUIP_TYPES) {
    const st = e.stats;
    const value = Math.round(e.mats.reduce((v, [m, q]) => v + matCost(m, i) * q, 0) * 1.5);
    item(`${t.id}_${e.key}`, `${t.metal}${e.name}`, TOOL_SLOTS.includes(e.slot) ? 'tool' : 'gear', value, {
      tier: i,
      equip: {
        slot: e.slot, skill: e.skill, level: t.level,
        attack: Math.round(p * (st.attack ?? 0)), strength: Math.round(p * (st.strength ?? 0)), defence: Math.round(p * (st.defence ?? 0)),
        style: st.style, speed: st.speed ? TOOL_SPEED[i] : undefined, attackMs: st.attackMs,
      },
    });
  }
});

/** 首饰：精炼锭 + 宝石 */
const JEWELS: { gem: string; name: string; level: number; power: number; bar: string }[] = [
  { gem: 'sapphire', name: '蓝宝石', level: 40, power: 8, bar: 'titanium_bar' },
  { gem: 'ruby', name: '红宝石', level: 55, power: 13, bar: 'runic_bar' },
  { gem: 'diamond', name: '钻石', level: 70, power: 20, bar: 'meteor_bar' },
];
for (const j of JEWELS) {
  item(`${j.gem}_ring`, `${j.name}戒指`, 'gear', 200 + j.power * 40, { equip: { slot: 'ring', skill: 'hitpoints', level: j.level, attack: j.power, strength: 0, defence: 0 } });
  item(`${j.gem}_amulet`, `${j.name}项链`, 'gear', 220 + j.power * 40, { equip: { slot: 'neck', skill: 'hitpoints', level: j.level, attack: 0, strength: j.power, defence: 0 } });
}

const HERB_FOR_TIER = ['green_herb', 'fire_bloom', 'moon_herb', 'silver_leaf', 'flame_heart', 'frost_lotus', 'frost_lotus', 'frost_lotus'];
const FISH_FOR_TIER = ['raw_minnow', 'raw_trout', 'raw_cod', 'raw_eel', 'raw_ghostfish', 'raw_abyssfish', 'raw_abyssfish', 'raw_abyssfish'];
const ENH_FOR_TIER = ['enh_basic', 'enh_basic', 'enh_mid', 'enh_mid', 'enh_mid', 'enh_high', 'enh_high', 'enh_legend'];

// ---- 精英和首领的战利品（用户 10-23）：福袋、宝箱、首领宝藏能打开；首领还有专属战利品和战旗 ----
const BAG_NAME = ['粗布福袋', '麻布福袋', '红绸福袋', '锦绣福袋', '祥云福袋', '紫金福袋', '龙鳞福袋', '天官福袋'];
const CHEST_NAME = ['旧木宝箱', '铁皮宝箱', '铜扣宝箱', '银边宝箱', '金饰宝箱', '秘银宝箱', '龙骨宝箱', '星辉宝箱'];
/** 每个首领掉的专属战利品，名字跟着首领走 */
const BOSS_TROPHY: Record<string, [string, string]> = {
  slime_king: ['史莱姆王冠核', '史莱姆王体内那颗会发光的核，软软弹弹的。'],
  rat_king: ['鼠王金牙', '鼠王嘴里镶的金牙，不知道从哪偷来的。'],
  copper_tortoise: ['铜甲龟壳片', '一片泛着铜绿的厚龟甲。'],
  mushroom_queen: ['女王菌冠', '蘑菇女王头顶的伞盖，还在慢慢冒孢子。'],
  isle_eel: ['鳗王电鳍', '摸上去还会轻轻发麻。'],
  bandit_king: ['山贼金印', '山贼头子用来盖「借条」的金印。'],
  sand_wyrm: ['沙虫利齿', '一排倒钩似的牙，咬住就不松口。'],
  ape_king: ['猿王金箍', '竹海猿王戴在头上的金箍。'],
  magma_tortoise: ['熔岩龟甲', '摸着还是烫的。'],
  drowned_captain: ['船长罗盘', '指针永远指向海底沉船的方向。'],
  salt_crab: ['盐晶巨钳', '整只钳子结满了盐晶。'],
  croc_king: ['鳄王獠牙', '比手臂还长的獠牙。'],
  scorpion_queen: ['蝎后毒针', '针尖上还挂着一滴毒液。'],
  meteor_colossus: ['陨星之心', '陨星巨像胸口那块还在发烫的陨石。'],
  spore_mother: ['菌母孢核', '菌母孕育孢子的核心。'],
  tide_guardian: ['潮汐之眼', '盯着它看久了能听到浪声。'],
  mire_hydra: ['九头蛇鳞', '九头蛇身上最硬的一片鳞。'],
  ice_wyrm: ['冰渊寒髓', '一团永远不会化的寒冰。'],
  treant_king: ['远古树心', '远古树王的心材，年轮数不清。'],
  bone_dragon: ['骸龙头骨碎片', '骸骨龙额头上的一块骨片。'],
  magma_titan: ['熔核碎片', '熔核泰坦体内的熔核碎块。'],
  crystal_dragon: ['晶龙之鳞', '一片会折射彩光的龙鳞。'],
  abyss_lord: ['深渊王冠', '深渊之主的王冠，冷得刺骨。'],
  star_devourer: ['星渊之瞳', '瞳孔里像装着一整片星空。'],
  lion_king: ['金鬃', '金鬃狮王的一绺鬃毛，在阳光下闪着金光。'],
  python_mother: ['蛇母之卵', '一颗没孵化的巨蛇卵，壳上有花纹。'],
  sandstorm_king: ['沙暴之翼', '沙暴之王的一片翅膜，薄得透光。'],
  crystal_sovereign: ['主宰晶冠', '晶簇主宰头顶的晶冠。'],
};
{
  const have = new Set(itemList.map((i) => i.id));
  const pick = (pool: LootTable['pool']) => pool.filter((e) => have.has(e.item));
  TIERS.forEach((T, t) => {
    const n = t + 1;
    const v = BAR_VALUE[t];
    const seeds = CROPS.filter((c) => tierForLevel(c[2]) === t).map((c) => `seed_${c[0]}`);
    const gear = EQUIP_TYPES.filter((e) => !e.stats.speed).map((e) => `${T.id}_${e.key}`);
    const gearPool = (w: number) => gear.map((g) => ({ item: g, min: 1, max: 1, w: w / gear.length }));
    item(`luckybag_${n}`, BAG_NAME[t], 'loot', v * 3, {
      tier: t, desc: '精英和首领身上搜出来的福袋，打开能得到金币和一把同阶材料。',
      opens: { coins: [v * 2, v * 6], rolls: 2, pool: pick([
        { item: T.ore, min: 3, max: 8, w: 3 }, { item: `${T.wood}_log`, min: 3, max: 8, w: 3 },
        { item: `hide_${n}`, min: 2, max: 5, w: 2 }, { item: `cotton_${n}`, min: 2, max: 5, w: 2 },
        { item: `steak_${n}`, min: 2, max: 5, w: 2 }, { item: HERB_FOR_TIER[t], min: 1, max: 3, w: 2 },
        { item: FISH_FOR_TIER[t], min: 1, max: 3, w: 1 },
        ...MAT_LINE_IDS.map((l) => ({ item: `${l}_${n}`, min: 2, max: 5, w: 1 })),
        ...seeds.map((id) => ({ item: id, min: 1, max: 3, w: 2 / Math.max(1, seeds.length) })),
        { item: ENH_FOR_TIER[t], min: 1, max: 1, w: 0.5 }, { item: GEM_FOR_TIER[t], min: 1, max: 1, w: 0.3 },
      ]) },
    });
    item(`chest_${n}`, CHEST_NAME[t], 'loot', v * 10, {
      tier: t, desc: '精英和首领守着的宝箱，里面有锭、弹药、宝石，运气好有本阶装备。',
      opens: { coins: [v * 6, v * 15], rolls: 3, pool: pick([
        { item: `${T.id}_bar`, min: 2, max: 5, w: 4 }, { item: `core_${n}`, min: 1, max: 3, w: 3 },
        { item: `${T.id}_rune`, min: 10, max: 25, w: 1.5 }, { item: `${T.id}_arrow`, min: 10, max: 25, w: 1.5 },
        { item: `crystal_rune_${n}`, min: 5, max: 15, w: 1 }, { item: `feather_arrow_${n}`, min: 5, max: 15, w: 1 },
        { item: GEM_FOR_TIER[t], min: 1, max: 1, w: 1.5 }, { item: ENH_FOR_TIER[t], min: 1, max: 2, w: 1.5 },
        { item: `luckybag_${n}`, min: 1, max: 1, w: 2 }, ...gearPool(1.5),
      ]) },
    });
    item(`bosschest_${n}`, `${CHEST_NAME[t].replace('宝箱', '')}首领宝藏`, 'loot', v * 30, {
      tier: t, desc: '只有首领会掉的宝藏，开出本阶装备、宝石、强化石的机会大得多。',
      opens: { coins: [v * 20, v * 50], rolls: 5, pool: pick([
        { item: `${T.id}_bar`, min: 4, max: 10, w: 3 }, { item: `core_${n}`, min: 2, max: 5, w: 3 },
        { item: GEM_FOR_TIER[t], min: 1, max: 2, w: 2.5 }, { item: ENH_FOR_TIER[t], min: 1, max: 3, w: 2.5 },
        { item: `chest_${n}`, min: 1, max: 1, w: 1.5 }, { item: `luckybag_${n}`, min: 1, max: 2, w: 2 },
        ...gearPool(4),
      ]) },
    });
  });
  for (const sp of SPECIES) {
    if (sp.rank !== 'boss') continue;
    const [tn, td] = BOSS_TROPHY[sp.id] ?? [`${sp.name}之证`, '击败首领的凭证。'];
    item(`trophy_${sp.id}`, tn, 'loot', BAR_VALUE[sp.tier] * 20, { tier: sp.tier, boss: sp.id, desc: `${td}击败「${sp.name}」才能得到，能卖个好价钱。` });
    item(`banner_${sp.id}`, `${sp.name}战旗`, 'deco', BAR_VALUE[sp.tier] * 50, {
      tier: sp.tier, boss: sp.id, desc: `「${sp.name}」的专属战旗，极少掉落。装饰品，收集齐全部首领战旗是一份荣誉。`,
    });
  }
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(itemList.map((i) => [i.id, i]));

// ---- 怪物与生物 ----
// 设计表在 bestiary.ts，这里按统一规则算出属性和掉落

/*
 * 数值平衡（用户 10-23）：按「同等级、穿同阶装备」的玩家来定怪物血量和伤害，
 * 让每个等级段手感一致：普通怪约 15 秒一只、每只掉 1/4 血；精英约 4 倍时间；首领约 2-3 分钟，要带食物。
 */
const RANK_HP = { normal: 1, elite: 3.5, boss: 10 };
/** 同级玩家的参考每秒伤害：命中约五成半，本阶武器的力量加成 */
function refDps(L: number) {
  const str = POWER[tierForLevel(L)];
  const maxHit = ((L + 8) * (str + 64)) / 64;
  return (0.55 * (maxHit + 1)) / 2 / 2.4;
}
/** 同级玩家的参考血量（生命等级比战斗等级涨得慢一点） */
const refHp = (L: number) => 10 * Math.max(10, L * 0.9);
const RANK_POW = { normal: 1, elite: 1.15, boss: 1.3 };
const RANK_HIT = { normal: 1, elite: 0.9, boss: 0.8 };
const RANK_LOOT = { normal: 1, elite: 2, boss: 5 };
/** 每个大类的基础攻击间隔 */
const FAMILY_MS: Record<Family, number> = {
  beast: 2600, small: 2400, bird: 2400, bat: 2200, slime: 3000, insect: 2400, crab: 2800, serpent: 2600, reptile: 2800,
  dragon: 3000, humanoid: 2600, undead: 2800, golem: 3400, spirit: 2400, plant: 3200, eye: 2800,
};

function speciesDrops(sp: Species, idx: number): Drop[] {
  const t = sp.tier;
  const n = t + 1;
  const T = TIERS[t];
  const k = RANK_LOOT[sp.rank];
  const fam = FORM_FAMILY[sp.form];
  const d: Drop[] = [{ item: 'coins', qty: Math.round(sp.level * 3 * (sp.rank === 'boss' ? 12 : sp.rank === 'elite' ? 3 : 1)) }];
  const add = (item: string, qty: number, chance?: number) => d.push(chance === undefined || chance >= 1 ? { item, qty } : { item, qty, chance });
  if (!['golem', 'spirit', 'slime', 'plant', 'eye'].includes(fam)) add('bones', k);
  if (isAnimal(fam, sp.form)) {
    add(`hide_${n}`, k, sp.rank === 'normal' ? 0.5 : 1);
    add(`meat_${n}`, k, sp.rank === 'normal' ? 0.6 : 1);
  } else {
    add(`core_${n}`, sp.rank === 'boss' ? 3 : 1, sp.rank === 'normal' ? 0.15 : sp.rank === 'elite' ? 0.6 : 1);
  }
  // 按大类的特产，接上采集 → 加工 → 装备的链条
  if (fam === 'golem') add(T.ore, 2 * k, 0.4);
  if (fam === 'golem' || fam === 'humanoid') add(`${T.id}_bar`, k, 0.12);
  if (fam === 'plant') { add(`${T.wood}_log`, 2 * k, 0.4); add(HERB_FOR_TIER[t], k, 0.25); }
  if (fam === 'insect') add(`cotton_${n}`, 2 * k, 0.3);
  if (fam === 'humanoid') { add(`cotton_${n}`, k, 0.25); add(`cloth_${n}`, 1, 0.1); }
  if (fam === 'crab' || sp.form === 'eel' || sp.form === 'frog' || sp.form === 'croc' || sp.form === 'turtle') add(FISH_FOR_TIER[t], k, 0.3);
  if (fam === 'spirit' || fam === 'eye' || sp.form === 'lich' || sp.form === 'cultist' || sp.form === 'imp') add(`${T.id}_rune`, 5 * k, 0.3);
  if (fam === 'undead' && sp.form !== 'lich') add(`${T.id}_arrow`, 5 * k, 0.2);
  if (fam === 'dragon') add(T.ore, 2 * k, 0.3);
  if (fam === 'serpent' && sp.form === 'worm') add(T.ore, k, 0.25);
  // 精英和首领：宝石、本阶装备、强化石
  if (sp.rank !== 'normal' || fam === 'dragon') add(GEM_FOR_TIER[t], 1, sp.rank === 'boss' ? 0.25 : sp.rank === 'elite' ? 0.03 : 0.01);
  if (sp.rank !== 'normal') {
    const gear = EQUIP_TYPES.filter((e) => !e.stats.speed);
    add(`${T.id}_${gear[idx % gear.length].key}`, 1, sp.rank === 'boss' ? 0.1 : 0.01);
    if (sp.rank === 'boss') add(`${T.id}_${gear[(idx + 7) % gear.length].key}`, 1, 0.06);
  }
  // 福袋、宝箱、首领宝藏、首领专属战利品和战旗（用户 10-23）
  if (sp.rank === 'normal') add(`luckybag_${n}`, 1, 0.004);
  if (sp.rank === 'elite') { add(`luckybag_${n}`, 1, 0.12); add(`chest_${n}`, 1, 0.04); }
  if (sp.rank === 'boss') {
    add(ENH_FOR_TIER[t], 1, 0.2);
    add(`luckybag_${n}`, 2, 0.5);
    add(`chest_${n}`, 1, 0.25);
    add(`bosschest_${n}`, 1, 0.3);
    add(`trophy_${sp.id}`, 1, 0.35);
    add(`banner_${sp.id}`, 1, 0.03);
  }
  return d;
}

const monsterList: MonsterDef[] = SPECIES.map((sp, idx) => {
  const tr = new Set(sp.traits);
  const L = sp.level;
  const fam = FORM_FAMILY[sp.form];
  let hp = refDps(L) * 15 * RANK_HP[sp.rank];
  if (tr.has('tough')) hp *= 1.3;
  if (tr.has('frail')) hp *= 0.75;
  let ms = FAMILY_MS[fam] + (sp.rank === 'boss' ? 400 : 0);
  if (tr.has('swift')) ms *= 0.75;
  if (tr.has('slow')) ms *= 1.25;
  return {
    id: sp.id, name: sp.name, level: L, tier: sp.tier, rank: sp.rank, boss: sp.rank === 'boss' || undefined,
    family: fam, form: sp.form, region: sp.region, traits: sp.traits, kind: isAnimal(fam, sp.form) ? 'creature' : 'monster',
    hp: Math.round(hp),
    // 攻击值跟着同阶护甲一起涨，不然高阶护甲会让怪物几乎打不中
    attack: Math.round(((L + 8) * (1 + (1.6 * POWER[tierForLevel(L)]) / 64) - 8) * RANK_POW[sp.rank]),
    defence: Math.round(L * RANK_POW[sp.rank] * (tr.has('armored') ? 1.4 : 1)),
    maxHit: tr.has('passive') ? 0 : Math.max(1, Math.round(0.025 * refHp(L) * (ms / 1000) * RANK_HIT[sp.rank] * (tr.has('fierce') ? 1.25 : 1))),
    attackMs: Math.round(ms / 100) * 100,
    respawnMs: (sp.rank === 'boss' ? 6000 : sp.rank === 'elite' ? 3000 : 1500) * (tr.has('pack') ? 0.5 : 1),
    drops: speciesDrops(sp, idx),
    art: { color: sp.color, accent: sp.accent },
  };
});
// 野怪掉同阶的种子：普通 2%、精英 6%、Boss 25% 一次 3 颗
monsterList.forEach((m, i) => {
  const pool = CROPS.filter((c) => tierForLevel(c[2]) === m.tier);
  if (!pool.length) return;
  const boss = m.rank === 'boss';
  m.drops.push({ item: `seed_${pool[i % pool.length][0]}`, qty: boss ? 3 : 1, chance: boss ? 0.25 : m.rank === 'elite' ? 0.06 : 0.02 });
});
monsterList.push({
  id: 'dummy', name: '稻草人', level: 1, tier: 0, rank: 'normal', family: 'plant', form: 'mandrake', region: 'town', traits: ['passive'], kind: 'monster',
  hp: 30, attack: 0, defence: 0, maxHit: 0, attackMs: 3000, respawnMs: 1500, drops: [], art: { color: '#d8b060', accent: '#8a5a3a' },
});

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(monsterList.map((m) => [m.id, m]));

// ---- 动作 ----

const actionList: ActionDef[] = [];
const xpFor = (level: number) => Math.round(8.4 + level * 1.6);
/**
 * 每阶动作时间倍率：T1 约 3 秒一次，T8 约 15 秒一次。
 * 单次经验按同样倍率放大，所以每小时经验不变，但工具和等级加速省下的时间更明显。
 */
const TIER_TIME = [1, 1.35, 1.7, 2.15, 2.7, 3.35, 4.15, 5];
const tierTime = (level: number) => TIER_TIME[tierForLevel(level)];

/** 采集：durationMs 随等级变长，经验随等级变多 */
function gather(id: string, name: string, skill: SkillId, level: number, outputs: Drop[], extra: { ms?: number; xp?: number; fail?: { chance: number; noFailLevel: number; stunMs?: number }; tool?: ToolSlot } = {}) {
  actionList.push({
    id, kind: 'skill', name, skill, level, durationMs: extra.ms ?? Math.round(3000 * tierTime(level)),
    xp: extra.xp ?? Math.round(xpFor(level) * (extra.ms ? 1 : (3000 * tierTime(level)) / (3000 + (level - 1) * 20))), outputs, fail: extra.fail, tool: extra.tool,
  });
  return id;
}

function make(id: string, name: string, skill: SkillId, level: number, inputs: ItemStack[], outputs: Drop[], xpMult = 1) {
  const n = inputs.reduce((a, i) => a + i.qty, 0);
  actionList.push({
    id, kind: 'skill', name, skill, level, durationMs: Math.round((2400 + Math.min(n, 6) * 300) * tierTime(level)),
    xp: Math.round(xpFor(level) * xpMult * tierTime(level)), inputs, outputs,
  });
  return id;
}

const one = (item: string, qty = 1): ItemStack => ({ item, qty });
const fight = (monsterId: string, name?: string) => {
  const m = MONSTERS[monsterId];
  const id = `fight_${monsterId}`;
  actionList.push({ id, kind: 'combat', name: name ?? m.name, difficulty: m.boss ? 'HARD' : m.rank === 'elite' || m.level >= 30 ? 'MEDIUM' : 'EASY', level: m.level, monster: monsterId });
  return id;
};

// 采集动作
// 同一种资源出现在多个地点时，用 suffix 区分动作 id
const oreKey = (t: number) => TIERS[t].ore.replace('_ore', '');
const mine = (t: number, suffix = '') =>
  gather(`mine_${oreKey(t)}${suffix}`, TIERS[t].oreName, 'mining', TIERS[t].level,
    [one(TIERS[t].ore), { item: GEM_FOR_TIER[t], qty: 1, chance: 0.003 + t * 0.0005 }]);
const chop = (t: number, suffix = '') =>
  gather(`chop_${TIERS[t].wood}${suffix}`, TIERS[t].woodName, 'woodcutting', TIERS[t].level, [one(`${TIERS[t].wood}_log`)]);
const cotton = (t: number, suffix = '') =>
  gather(`cotton_${t + 1}${suffix}`, '棉花', 'gathering', TIERS[t].level, [one(`cotton_${t + 1}`), { item: `cotton_${t + 1}`, qty: 1, chance: 0.2 }, wildSeed(t, t)], { tool: 'sickle' });
const hunt = (t: number, suffix = '') =>
  gather(`hunt_${t + 1}${suffix}`, '兽皮', 'hunting', TIERS[t].level, [one(`hide_${t + 1}`), { item: 'bones', qty: 1, chance: 0.3 }]);
const fishAt = (fish: string, suffix = '') => {
  const f = FISH.find((x) => x[0] === fish)!;
  return gather(`fish_${fish}${suffix}`, f[1], 'fishing', f[2], [one(`raw_${fish}`)]);
};
const herb = (id: string, suffix = '') => {
  const h = HERBS.find((x) => x[0] === id)!;
  return gather(`gather_${id}${suffix}`, `采集${h[1]}`, 'gathering', h[2], [one(id), { item: id, qty: 1, chance: 0.2 }, wildSeed(tierForLevel(h[2]), h[2])], { tool: 'sickle' });
};
/** 新资源线的采集动作（同一阶出现在多处时用 suffix 区分） */
const mat = (line: MatLine, t: number, suffix = '') =>
  gather(`${line}_${t + 1}${suffix}`, MAT_LINES[line].names[t], MAT_LINES[line].skill, TIERS[t].level, [
    one(`${line}_${t + 1}`), { item: `${line}_${t + 1}`, qty: 1, chance: 0.15 },
    ...(line === 'feather' ? [{ item: 'bones', qty: 1, chance: 0.1 }] : []),
  ]);
/** 采集时 3% 捡到同阶的野生种子 */
function wildSeed(tier: number, salt: number): Drop {
  const pool = CROPS.filter((c) => tierForLevel(c[2]) === tier);
  return { item: `seed_${pool[salt % pool.length][0]}`, qty: 1, chance: 0.03 };
}
/** 种田：消耗 1 颗种子，收 2-3 个作物；80% 收回种子、25% 多收一颗、1% 变异出下一种作物的种子 */
const plant = (i: number) => {
  const [id, name, lvl] = CROPS[i];
  const next = CROPS[i + 1];
  const aid = gather(`farm_${id}`, `种${name}`, 'farming', lvl, [
    one(id, 2), { item: id, qty: 1, chance: 0.3 },
    { item: `seed_${id}`, qty: 1, chance: 0.8 }, { item: `seed_${id}`, qty: 1, chance: 0.25 },
    ...(next ? [{ item: `seed_${next[0]}`, qty: 1, chance: 0.01 }] : []),
  ], { tool: 'hoe' });
  const a = actionList[actionList.length - 1];
  if (a.kind === 'skill') a.inputs = [one(`seed_${id}`)];
  return aid;
};
const plantTiers = (...tiers: number[]) => CROPS.map((c, i) => [c, i] as const).filter(([c]) => tiers.includes(tierForLevel(c[2]))).map(([, i]) => plant(i));
const steal = (id: string, name: string, level: number, coins: number, extra: Drop[] = []) =>
  gather(`steal_${id}`, name, 'thieving', level, [one('coins', coins), ...extra], {
    ms: 2500 + level * 15, fail: { chance: 0.5, noFailLevel: level + 30, stunMs: 4000 },
  });

// 生产动作：采集 → 加工（锭 / 板材 / 皮革 / 布料）→ 制作装备
TIERS.forEach((t, i) => {
  const lvl = t.level;
  const n = i + 1;
  // 加工
  make(`smelt_${t.id}`, i === 0 ? '打磨硬木锭' : `冶炼${t.metal}锭`, 'smithing', lvl,
    i === 0 ? [one('plain_log', 2), one('stone')] : [one(t.ore, 2)], [one(`${t.id}_bar`)], 0.8);
  make(`plank_${n}`, `${t.woodName}板材`, 'fletching', lvl, [one(`${t.wood}_log`, 2)], [one(`plank_${n}`)], 0.8);
  make(`tan_${n}`, '鞣制皮革', 'crafting', lvl, [one(`hide_${n}`, 2)], [one(`leather_${n}`)], 0.8);
  make(`weave_${n}`, '纺织布料', 'crafting', lvl, [one(`cotton_${n}`, 2)], [one(`cloth_${n}`)], 0.8);
  // 装备
  const prefix = { smithing: 'smith', fletching: 'fletch', crafting: 'craft' } as Record<SkillId, string>;
  for (const e of EQUIP_TYPES) {
    const id = `${t.id}_${e.key}`;
    const inputs = e.mats.map(([m, q]) => one(matItem(m, i), q));
    const qty = inputs.reduce((a, x) => a + x.qty, 0);
    make(`${prefix[e.maker]}_${id}`, ITEMS[id].name, e.maker, lvl + e.plus, inputs, [one(id)], Math.max(1, qty * 0.8));
  }
  // 弹药
  make(`smith_${t.id}_arrowhead`, `${t.metal}箭头 ×15`, 'smithing', lvl, [one(`${t.id}_bar`)], [one(`${t.id}_arrowhead`, 15)]);
  make(`fletch_${t.id}_arrow`, `${t.metal}箭 ×10`, 'fletching', lvl, [one('shaft', 10), one(`${t.id}_arrowhead`, 10)], [one(`${t.id}_arrow`, 10)], 1.5);
  make(`craft_${t.id}_rune`, `${t.rune}符文 ×5`, 'crafting', lvl, [one(t.ore), one(`cloth_${n}`)], [one(`${t.id}_rune`, 5)]);
});
make('fletch_shaft', '箭杆 ×15', 'fletching', 1, [one('plank_1')], [one('shaft', 15)]);
make('fletch_shaft_birch', '箭杆 ×25', 'fletching', 10, [one('plank_2')], [one('shaft', 25)]);

for (const j of JEWELS) {
  const inputs = [one(j.bar), one(j.gem)];
  make(`craft_${j.gem}_ring`, ITEMS[`${j.gem}_ring`].name, 'crafting', j.level, inputs, [one(`${j.gem}_ring`)], 2);
  make(`craft_${j.gem}_amulet`, ITEMS[`${j.gem}_amulet`].name, 'crafting', j.level + 2, inputs, [one(`${j.gem}_amulet`)], 2);
}

for (const [fish, name, lvl] of FISH) {
  actionList.push({
    id: `cook_${fish}`, kind: 'skill', name: `烤${name}`, skill: 'cooking', level: lvl, durationMs: Math.round(2500 * tierTime(lvl)), xp: Math.round(xpFor(lvl) * tierTime(lvl)),
    inputs: [one(`raw_${fish}`)], outputs: [one(fish)], fail: { chance: 0.4, noFailLevel: lvl + 20 },
  });
}
make('cook_potato', '烤土豆', 'cooking', 1, [one('potato')], [one('baked_potato')]);
make('cook_bread', '烤面包', 'cooking', 8, [one('wheat', 2)], [one('bread')]);
for (const [id, , lvl, , dish] of CROPS) if (dish) make(`cook_meal_${id}`, dish, 'cooking', lvl, [one(id, 2)], [one(`meal_${id}`)]);
// 烹饪失败统一得到烧焦的食物
for (const a of actionList) if (a.kind === 'skill' && a.fail && a.skill === 'cooking') a.fail.item = 'burnt_food';

HERBS.forEach(([id, name, lvl], i) => {
  const potionLvl = [1, 8, 20, 28, 36, 45][i];
  make(`brew_${id}`, `${name}药水`, 'herblore', potionLvl, [one(id, 2)], [one(`${id}_potion`)], 1.5);
});

make('enhance_basic', '初级强化石', 'enhancing', 1, [one('wood_bar', 2), one('stone', 3)], [one('enh_basic')]);
make('enhance_mid', '中级强化石', 'enhancing', 30, [one('iron_bar', 2), one('sapphire')], [one('enh_mid')], 2);
make('enhance_high', '高级强化石', 'enhancing', 55, [one('runic_bar', 2), one('ruby')], [one('enh_high')], 3);
make('enhance_legend', '传说强化石', 'enhancing', 95, [one('adamant_bar', 2), one('diamond')], [one('enh_legend')], 4);
// 打怪掉落的闭环：兽肉 → 烤兽肉（战斗食物），魔核 + 骨头 → 强化石
TIERS.forEach((t, i) => {
  const n = i + 1;
  make(`cook_meat_${n}`, `烤兽肉 ${tierName(i)}`, 'cooking', t.level, [one(`meat_${n}`)], [one(`steak_${n}`)]);
  const enh = ['enh_basic', 'enh_basic', 'enh_mid', 'enh_mid', 'enh_mid', 'enh_high', 'enh_high', 'enh_legend'][i];
  make(`enhance_core_${n}`, `魔核淬炼 ${tierName(i)}`, 'enhancing', t.level, [one(`core_${n}`, 3), one('bones', 5)], [one(enh)], 1 + i * 0.3);
});

// ---- 料理（用户 10-22 要求）：鱼 + 配菜，回血更多，吃下后有限时增益 ----
// 增益随阶级变强、持续更久；同类增益只保留一个（新吃的覆盖旧的）
const BUFF_NAME: Record<BuffKind, string> = { atk: '命中', str: '最高伤害', def: '防御', speed: '干活速度', xp: '获得经验' };
const BUFF_BASE: Record<BuffKind, number> = { atk: 0.04, str: 0.04, def: 0.05, speed: 0.03, xp: 0.04 };
export const buffText = (b: Buff) => `${BUFF_NAME[b.kind]} +${Math.round(b.pct * 100)}%，持续 ${Math.round(b.ms / 60000)} 分钟`;
type Side = { item: string; qty: number; name: (fish: string) => string; kind: BuffKind; note: string };
const SIDES: Side[][] = [
  [
    { item: 'potato', qty: 1, name: (f) => `${f}土豆饼`, kind: 'def', note: '煎得外脆里软，吃了扛揍' },
    { item: 'wheat', qty: 1, name: (f) => `${f}麦饼`, kind: 'speed', note: '揣在怀里边干活边吃' },
    { item: 'green_herb', qty: 1, name: (f) => `绿叶${f}汤`, kind: 'xp', note: '清汤提神，学东西更快' },
    { item: 'meat_1', qty: 1, name: (f) => `${f}兽肉串`, kind: 'str', note: '鱼肉兽肉一起烤，越吃越有劲' },
  ],
  [
    { item: 'wheat', qty: 2, name: (f) => `香煎${f}`, kind: 'atk', note: '裹上麦粉煎，吃完手稳' },
    { item: 'fire_bloom', qty: 1, name: (f) => `火绒${f}汤`, kind: 'str', note: '辣得冒汗，力气大增' },
    { item: 'potato', qty: 2, name: (f) => `${f}炖土豆`, kind: 'def', note: '一锅炖到软烂，扛饿又扛打' },
    { item: 'meat_2', qty: 1, name: (f) => `${f}兽肉卷`, kind: 'speed', note: '一卷到底，路上就能吃完' },
  ],
  [
    { item: 'moon_herb', qty: 1, name: (f) => `月露${f}羹`, kind: 'xp', note: '月露草的清香让人头脑清明' },
    { item: 'wheat', qty: 2, name: (f) => `${f}馅饼`, kind: 'speed', note: '冰原旅人的干粮' },
    { item: 'meat_3', qty: 1, name: (f) => `${f}肉排`, kind: 'str', note: '厚切煎排，饱腹又长力气' },
    { item: 'potato', qty: 2, name: (f) => `奶油${f}浓汤`, kind: 'def', note: '一碗下肚浑身暖和' },
  ],
  [
    { item: 'silver_leaf', qty: 1, name: (f) => `银叶清蒸${f}`, kind: 'atk', note: '银叶草去腥，吃完眼明手快' },
    { item: 'meat_4', qty: 1, name: (f) => `${f}兽肉锅`, kind: 'str', note: '沼泽猎人的大锅菜' },
    { item: 'wheat', qty: 3, name: (f) => `${f}面包盒`, kind: 'speed', note: '携带方便，一口一个' },
    { item: 'moon_herb', qty: 1, name: (f) => `${f}药膳`, kind: 'xp', note: '药材与鱼同炖，滋补提神' },
  ],
  [
    { item: 'flame_heart', qty: 1, name: (f) => `炎心烤${f}`, kind: 'str', note: '炎心花的火气全进了肉里' },
    { item: 'frost_lotus', qty: 1, name: (f) => `冰莲${f}刺身`, kind: 'atk', note: '冰镇切片，入口清冽' },
    { item: 'meat_5', qty: 1, name: (f) => `${f}海陆拼盘`, kind: 'def', note: '一盘吃两样，耐打耐磨' },
    { item: 'wheat', qty: 3, name: (f) => `${f}三明治`, kind: 'speed', note: '海边渔夫最爱的午饭' },
  ],
  [
    { item: 'frost_lotus', qty: 1, name: (f) => `冰火${f}`, kind: 'def', note: '熔岩鱼配冰莲，冷热交替' },
    { item: 'meat_6', qty: 1, name: (f) => `熔岩${f}烧肉`, kind: 'str', note: '在热石上烤出来的' },
    { item: 'flame_heart', qty: 1, name: (f) => `炎心${f}汤`, kind: 'atk', note: '喝完全身发热，出手更准' },
    { item: 'silver_leaf', qty: 2, name: (f) => `银叶${f}卷`, kind: 'xp', note: '清爽解腻，越吃越精神' },
  ],
  [
    { item: 'meat_7', qty: 1, name: (f) => `${f}王者烤`, kind: 'str', note: '只有高手钓得到、烤得好' },
    { item: 'frost_lotus', qty: 2, name: (f) => `冰莲${f}冻`, kind: 'def', note: '晶莹剔透，入口即化' },
    { item: 'moon_herb', qty: 2, name: (f) => `星露${f}`, kind: 'xp', note: '在星光下慢慢收汁' },
    { item: 'flame_heart', qty: 2, name: (f) => `雷火${f}`, kind: 'atk', note: '吃完手指都在发麻' },
  ],
  [
    { item: 'meat_8', qty: 1, name: (f) => `${f}深渊宴`, kind: 'str', note: '深渊之物做的盛宴' },
    { item: 'frost_lotus', qty: 2, name: (f) => `${f}冰莲御膳`, kind: 'def', note: '王都御厨的手艺' },
    { item: 'flame_heart', qty: 2, name: (f) => `炎心${f}`, kind: 'atk', note: '烈火灼烧出的极致鲜味' },
    { item: 'silver_leaf', qty: 2, name: (f) => `${f}长生汤`, kind: 'xp', note: '传说喝了能长生，至少能学得快' },
  ],
];
NEW_FISH.forEach(([fish, fname, lvl, heals], k) => {
  const t = Math.floor(k / 4);
  const side = SIDES[t][k % 4];
  const id = `dish_${fish}`;
  const name = side.name(fname);
  const buff: Buff = { kind: side.kind, pct: Math.round((BUFF_BASE[side.kind] + t * 0.012) * 100) / 100, ms: (10 + t * 3) * 60000 };
  const level = lvl + 3;
  item(id, name, 'food', Math.round((4 + lvl * 1.4) * 2.6), {
    tier: t, heals: Math.round(heals * 1.35), buff,
    desc: `${side.note}。烹饪 ${level} 级，用生${fname}和${ITEMS_NAME(side.item)}×${side.qty}做成。回复 ${Math.round(heals * 1.35)} 生命；吃下后${buffText(buff)}。`,
  });
  make(`cook_${id}`, name, 'cooking', level, [one(`raw_${fish}`), one(side.item, side.qty)], [one(id)], 1.4);
});
// 每阶一道宴席：两种鱼 + 兽肉 + 配菜，同时给两种增益里更强的那种（攻防兼顾的放在力量和防御轮换）
const FEASTS: [string, BuffKind][] = [['渔家小宴', 'def'], ['溪谷全鱼宴', 'atk'], ['冰原围炉宴', 'xp'], ['沼泽猎人宴', 'str'], ['金沙海鲜宴', 'speed'], ['熔岩烧烤宴', 'str'], ['星光盛宴', 'atk'], ['龙渊御宴', 'xp']];
FEASTS.forEach(([name, kind], t) => {
  const [a, b] = [NEW_FISH[t * 4], NEW_FISH[t * 4 + 2]];
  const lvl = Math.max(a[2], b[2]) + 4;
  const heals = Math.round((a[3] + b[3]) * 0.9);
  const buff: Buff = { kind, pct: Math.round((BUFF_BASE[kind] * 1.6 + t * 0.016) * 100) / 100, ms: (20 + t * 4) * 60000 };
  const id = `feast_${t + 1}`;
  item(id, name, 'food', Math.round((a[2] + b[2]) * 4), {
    tier: t, heals, buff,
    desc: `用${a[1]}、${b[1]}和兽肉摆的一桌。烹饪 ${lvl} 级。回复 ${heals} 生命；吃下后${buffText(buff)}，比单道料理更强更久。`,
  });
  make(`cook_${id}`, name, 'cooking', lvl, [one(`raw_${a[0]}`, 2), one(`raw_${b[0]}`, 2), one(`meat_${t + 1}`, 2)], [one(id)], 2.2);
});
// 香料料理（新资源线）：兽肉 + 香料，回血比烤兽肉多四成，带增益
TIERS.forEach((t, i) => {
  const n = i + 1;
  const kind = SPICE_BUFF[i];
  const heals = Math.round(MEAT_HEAL[i] * 1.4);
  const buff: Buff = { kind, pct: Math.round((BUFF_BASE[kind] * 1.2 + i * 0.012) * 100) / 100, ms: (15 + i * 3) * 60000 };
  const id = `spice_meal_${n}`;
  const lvl = t.level + 4;
  item(id, SPICE_DISH[i], 'food', Math.round(RES_VALUE[i] * 6), {
    tier: i, heals, buff, desc: `兽肉用${MAT_LINES.spice.names[i]}腌过再烤。烹饪 ${lvl} 级，在落霞城珍材坊做。回复 ${heals} 生命；吃下后${buffText(buff)}。`,
  });
  make(`rare_cook_${n}`, SPICE_DISH[i], 'cooking', lvl, [one(`meat_${n}`), one(`spice_${n}`, 2)], [one(id)], 1.6);
  make(`rare_rune_${n}`, `${MAT_LINES.crystal.names[i]}符文 ×8`, 'crafting', lvl, [one(`crystal_${n}`), one(`resin_${n}`), one(`cloth_${n}`)], [one(`crystal_rune_${n}`, 8)], 1.4);
  make(`rare_arrow_${n}`, `${MAT_LINES.feather.names[i]}箭 ×10`, 'fletching', lvl,
    [one('shaft', 10), one(`${t.id}_arrowhead`, 10), one(`feather_${n}`, 2), one(`resin_${n}`)], [one(`feather_arrow_${n}`, 10)], 1.8);
});
// 料理物品定义在 ITEMS 建好之后，补登记进去
for (const it of itemList) ITEMS[it.id] ??= it;

const filterIds = (prefix: string) => actionList.filter((a) => a.id.startsWith(prefix)).map((a) => a.id);

// ---- 地图点位 ----

export type NodeSprite =
  | 'ore' | 'tree' | 'fish' | 'herb' | 'camp' | 'boss' | 'anvil' | 'furnace' | 'stove' | 'bench' | 'bowyer' | 'potion' | 'enhance'
  | 'market' | 'farm' | 'bank' | 'dummy' | 'cave' | 'atelier';

export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  region: RegionId;
  /** 地图上标注的等级范围 */
  lv: [number, number];
  sprite: NodeSprite;
  actions: string[];
  /** 镇内的建筑点位，不在世界地图上标危险度 */
  town?: boolean;
  /** 钓鱼点在北边挖一片水 */
  pond?: boolean;
  /** 打开仓库而不是任务列表 */
  opens?: 'bank';
  /** 5088 大地图新增的特色地点：自带一片地貌、专属生物和首领，地图上标大字地名（用户 10-23） */
  site?: { kind: SiteKind; r: number };
  /** 大型洞窟入口（用户 10-23：先占位，以后开放） */
  cave?: boolean;
  /** 暂未开放的建筑（用户 10-23：强化台先不开放） */
  closed?: boolean;
}
export type SiteKind = 'islands' | 'bamboo' | 'saltflat' | 'crater' | 'fungal' | 'glacier' | 'obsidian' | 'starabyss'
  | 'oasis' | 'mesa' | 'atoll' | 'crystalheart';

/** 老地图（中间方框）里的相对坐标 */
const at = (u: number, v: number) => ({ x: OLD_BOX.x + Math.round(u * (OLD_BOX.size - 1)), y: OLD_BOX.y + Math.round(v * (OLD_BOX.size - 1)) });
/** 整张 8848 大地图的相对坐标（外圈新区域用） */
const atW = (u: number, v: number) => ({ x: Math.round(u * (MAP_W - 1)), y: Math.round(v * (MAP_H - 1)) });

/** 野外点位的等级范围直接取它所有动作的最低和最高等级 */
const wild = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode => {
  const lvls = actions.map((a) => actionList.find((x) => x.id === a)!.level);
  return { id, name, ...at(u, v), region, lv: [Math.min(...lvls), Math.max(...lvls)], sprite, actions, pond };
};
/** 外圈新区域的点位 */
const ring = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode =>
  ({ ...wild(id, name, 0, 0, region, sprite, actions, pond), ...atW(u, v) });
/** 洞窟入口：暂时没有内容 */
const cave = (id: string, name: string, pos: { x: number; y: number }, region: RegionId): MapNode =>
  ({ id, name, ...pos, region, lv: [0, 0], sprite: 'cave', actions: [], cave: true });

const site = (n: MapNode, kind: SiteKind, r: number): MapNode => ({ ...n, site: { kind, r } });

/** 镇中心：原来 1080 地图上的 (518, 529)，按比例放到老地图方框里 */
export const TOWN_CENTER = { x: OLD_BOX.x + Math.round((518 * OLD_BOX.size) / 1080), y: OLD_BOX.y + Math.round((529 * OLD_BOX.size) / 1080) };
/** 城镇布局按「镇中心 = (167, 170)」画的，这里平移到真正的镇中心 */
export const townXY = (x: number, y: number) => ({ x: x - 167 + TOWN_CENTER.x, y: y - 170 + TOWN_CENTER.y });

const town = (id: string, name: string, x: number, y: number, sprite: NodeSprite, actions: string[], extra: Partial<MapNode> = {}): MapNode =>
  ({ id, name, ...townXY(x, y), region: 'town', lv: [1, 1], sprite, actions, town: true, ...extra });

/** 新大型城镇「落霞城」（用户 10-23）：在西边金穗草原，布局按镇中心 = (0, 0) 画 */
export const TOWN2_CENTER = atW(0.1, 0.52);
export const town2XY = (x: number, y: number) => ({ x: x + TOWN2_CENTER.x, y: y + TOWN2_CENTER.y });
const town2 = (id: string, name: string, x: number, y: number, sprite: NodeSprite, actions: string[], extra: Partial<MapNode> = {}): MapNode =>
  ({ id, name, ...town2XY(x, y), region: 'savanna', lv: [1, 1], sprite, actions, town: true, ...extra });

export const NODES: MapNode[] = [
  // 城镇：坐标与 world.ts 里的建筑对齐（建筑门口下方一格）
  town('bank', '仓库', 151, 158, 'bank', [], { opens: 'bank' }),
  town('smithy', '铁匠铺', 174, 158, 'anvil', filterIds('smith_')),
  // 熔炉：炼锭单独一座建筑（用户 10-23），铁匠铺只管打造
  town('furnace', '熔炉', 190, 157, 'furnace', filterIds('smelt_')),
  town('kitchen', '灶台', 184, 158, 'stove', filterIds('cook_')),
  town('workshop', '工坊', 151, 170, 'bench', filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_'))),
  town('bowyer', '制弓台', 159, 170, 'bowyer', filterIds('plank_').concat(filterIds('fletch_'))),
  town('apothecary', '药剂铺', 177, 170, 'potion', filterIds('brew_')),
  town('enhancer', '强化台', 185, 170, 'enhance', filterIds('enhance_'), { closed: true }),
  town('market', '集市', 155, 182, 'market', [
    steal('farmer', '偷农夫', 1, 3, [{ item: 'potato', qty: 2, chance: 0.3 }, { item: 'seed_potato', qty: 2, chance: 0.2 }, { item: 'seed_carrot', qty: 1, chance: 0.08 }]),
    steal('vendor', '偷小贩', 10, 9, [{ item: 'cotton_1', qty: 2, chance: 0.2 }, { item: 'seed_onion', qty: 1, chance: 0.08 }, { item: 'seed_tomato', qty: 1, chance: 0.05 }]),
    steal('guard', '偷守卫', 25, 22, [{ item: 'iron_bar', qty: 1, chance: 0.1 }]),
    steal('merchant', '偷富商', 40, 45, [{ item: 'sapphire', qty: 1, chance: 0.02 }]),
    steal('noble', '偷贵族', 55, 80, [{ item: 'runic_bar', qty: 1, chance: 0.05 }]),
  ]),
  town('dummy', '训练场', 181, 182, 'dummy', [fight('dummy', '打稻草人')]),
  // 城镇周围的四块田（用户 10-23 要求），每块种两阶作物
  town('farm', '家园农田', 148, 198, 'farm', plantTiers(0, 1)),
  town('farm_south', '南郊麦田', 147, 217, 'farm', plantTiers(2, 3)),
  town('farm_east', '东郊菜园', 187, 213, 'farm', plantTiers(4, 5)),
  town('farm_west', '西岭灵田', 115, 203, 'farm', plantTiers(6, 7)),
  { ...wild('town_lake', '镜湖码头', 0.37, 0.65, 'town', 'fish', [fishAt('minnow'), fishAt('loach'), fishAt('crucian'), fishAt('trout', '_lake')], true), town: true },

  // 巨木森林
  wild('redwood_canopy', '雪松冠林', 0.07, 0.12, 'giantwood', 'tree', [chop(4)]),
  wild('ancient_court', '远古白木庭', 0.25, 0.10, 'giantwood', 'boss', [chop(7), cotton(7, '_court')]),
  wild('moon_garden', '月露药圃', 0.09, 0.28, 'giantwood', 'herb', [herb('moon_herb'), herb('silver_leaf'), cotton(2)]),
  // 幽深林地
  wild('pine_valley', '西风松谷', 0.09, 0.36, 'woodland', 'tree', [chop(2), hunt(1)]),
  wild('birch_brook', '桦影溪谷', 0.08, 0.58, 'woodland', 'fish', [chop(1), fishAt('trout'), fishAt('bighead'), fishAt('catfish')], true),
  wild('maple_slope', '落叶长坡', 0.23, 0.64, 'woodland', 'camp', [chop(0), cotton(1), hunt(0), mat('feather', 0)]),
  wild('moss_pool', '幽苔水洼', 0.08, 0.68, 'woodland', 'fish', [fishAt('minnow', '_moss'), fishAt('grass_carp'), fishAt('perch'), hunt(0, '_moss')], true),
  // 亡者沼泽
  wild('whisper_pool', '亡语沉潭', 0.09, 0.89, 'swamp', 'fish', [fishAt('eel'), fishAt('ghostfish'), fishAt('swamp_catfish'), fishAt('bonefin')], true),
  // 冰封雪原
  wild('lotus_bay', '北境冰莲湾', 0.42, 0.13, 'snow', 'fish', [fishAt('cod'), fishAt('salmon'), fishAt('snow_trout'), fishAt('herring'), herb('frost_lotus'), chop(4, '_bay'), cotton(4)], true),
  wild('snow_plateau', '雪绒台地', 0.53, 0.22, 'snow', 'boss', [mine(6, '_plateau'), cotton(6), hunt(6, '_plateau')]),
  wild('glow_cave', '蓝萤洞坡', 0.49, 0.33, 'snow', 'ore', [mine(2, '_cave')]),
  // 灰岩高地
  wild('dawn_hill', '晨曦铜石丘', 0.67, 0.36, 'highland', 'ore', [mine(0), mine(1)]),
  wild('dragon_rift', '精金裂隙', 0.69, 0.19, 'highland', 'boss', [mine(7), hunt(6)]),
  wild('prism_fault', '陨星断层', 0.79, 0.09, 'highland', 'ore', [mine(6)]),
  wild('gold_ridge', '锡砂山脊', 0.85, 0.21, 'highland', 'ore', [mine(2, '_ridge'), hunt(3, '_ridge')]),
  wild('iron_seam', '黑铁矿层', 0.80, 0.39, 'highland', 'ore', [mine(3)]),
  // 金沙海岸
  wild('mithril_cliff', '钛岩峭壁', 0.88, 0.50, 'coast', 'ore', [mine(4)]),
  wild('oasis', '金沙绿洲', 0.73, 0.50, 'coast', 'fish', [fishAt('carp'), cotton(1, '_oasis'), steal('caravan', '偷商队', 20, 30, [{ item: 'cotton_2', qty: 3, chance: 0.2 }])], true),
  wild('coral_shoal', '珊瑚浅滩', 0.88, 0.65, 'coast', 'fish', [fishAt('shrimp'), fishAt('bass'), fishAt('grouper'), fishAt('lanternfish'), cotton(3, '_shoal')], true),
  // 熔岩荒地
  wild('flame_slope', '烈焰花坡', 0.65, 0.66, 'lava', 'herb', [herb('fire_bloom'), herb('flame_heart'), cotton(3)]),
  wild('obsidian_pool', '黑曜熔池', 0.86, 0.84, 'lava', 'fish', [mine(3, '_pool'), fishAt('lava_eel'), fishAt('magma_shrimp'), fishAt('fire_carp')], true),
  // 深渊裂谷
  wild('abyss_eye', '深渊潮眼', 0.43, 0.92, 'abyss', 'boss', [fishAt('abyssfish'), fishAt('abyss_bass'), fishAt('void_angler'), cotton(7)], true),

  // ---- 1080 大地图新增点位 ----
  // 城郊
  wild('orchard', '城郊果园', 0.56, 0.55, 'town', 'camp', [chop(0, '_orchard'), cotton(0, '_orchard'), herb('green_herb', '_orchard'), mat('spice', 0), mat('resin', 0)]),
  wild('old_pit', '老矿坑', 0.45, 0.40, 'town', 'ore', [mine(0, '_pit'), mine(1, '_pit'), mat('crystal', 0)]),
  // 巨木森林
  wild('mushroom_grove', '苔光蘑菇林', 0.20, 0.30, 'giantwood', 'herb', [herb('moon_herb', '_grove'), chop(3, '_grove'), cotton(4, '_grove')]),
  wild('root_cave', '古根洞穴', 0.05, 0.05, 'giantwood', 'ore', [mine(5, '_root'), chop(5, '_root')]),
  // 幽深林地
  wild('hunter_camp', '猎人营地', 0.28, 0.47, 'woodland', 'camp', [chop(1, '_camp'), hunt(1, '_camp')]),
  wild('forest_ruins', '林间废墟', 0.17, 0.50, 'woodland', 'camp', [chop(3), hunt(2), steal('ruins', '翻找废墟', 30, 35, [{ item: 'sapphire', qty: 1, chance: 0.02 }])]),
  // 亡者沼泽
  wild('rot_ferry', '腐沼渡口', 0.25, 0.80, 'swamp', 'fish', [fishAt('trout', '_ferry'), fishAt('bream'), fishAt('pike'), herb('green_herb', '_ferry'), cotton(2, '_ferry')], true),
  wild('croc_flats', '鳄鱼泥滩', 0.18, 0.96, 'swamp', 'fish', [fishAt('ghostfish', '_flats'), fishAt('stingray'), hunt(4)], true),
  wild('bone_yard', '血橡墓园', 0.31, 0.91, 'swamp', 'boss', [chop(5), cotton(5, '_yard'), steal('grave', '盗墓', 45, 60, [{ item: 'ruby', qty: 1, chance: 0.02 }])]),
  // 深渊裂谷
  wild('dark_vein', '符文矿脉', 0.53, 0.84, 'abyss', 'ore', [mine(5)]),
  wild('abyss_altar', '深渊祭坛', 0.37, 0.82, 'abyss', 'boss', [chop(6, '_altar'), cotton(6, '_altar'), hunt(7, '_altar')]),
  // 熔岩荒地
  wild('ash_outpost', '焦土前哨', 0.58, 0.76, 'lava', 'ore', [mine(3, '_ash')]),
  wild('scorpion_nest', '熔岩巨蝎巢', 0.71, 0.92, 'lava', 'camp', [mine(4, '_nest'), hunt(4, '_nest')]),
  wild('lava_crater', '炎王火山口', 0.80, 0.73, 'lava', 'boss', [mine(7, '_crater'), chop(6), hunt(7)]),
  // 金沙海岸
  wild('wreck_bay', '沉船湾', 0.90, 0.58, 'coast', 'fish', [fishAt('bass', '_wreck'), fishAt('squid'), fishAt('swordfish'), fishAt('tuna'), cotton(5), steal('smuggler', '偷走私贩', 35, 40, [{ item: 'cotton_3', qty: 2, chance: 0.3 }])], true),
  wild('turtle_beach', '海龟沙滩', 0.78, 0.62, 'coast', 'fish', [fishAt('shrimp', '_turtle'), hunt(2, '_turtle')], true),
  // 新鱼获的钓点（用户 10-22 要求加鱼）
  wild('frost_fjord', '冰湖峡湾', 0.33, 0.06, 'snow', 'fish', [fishAt('flounder'), fishAt('sturgeon')], true),
  wild('sulfur_springs', '硫磺泉', 0.93, 0.93, 'lava', 'fish', [fishAt('flame_shark'), fishAt('sulfur_catfish')], true),
  wild('starlight_lake', '星光湖', 0.94, 0.30, 'highland', 'fish', [fishAt('star_ray'), fishAt('crystal_fish')], true),
  wild('phantom_tide', '幻潮海崖', 0.94, 0.45, 'coast', 'fish', [fishAt('phantom_eel'), fishAt('thunder_shark')], true),
  wild('dragon_abyss', '龙渊', 0.55, 0.95, 'abyss', 'fish', [fishAt('dragonfish'), fishAt('starwhale')], true),
  // 灰岩高地
  wild('stone_forest', '风蚀石林', 0.75, 0.32, 'highland', 'ore', [mine(2)]),
  wild('griffin_peak', '鹰巢峰', 0.93, 0.15, 'highland', 'boss', [mine(4, '_peak'), cotton(5, '_peak'), hunt(5)]),
  // 冰封雪原
  wild('tundra_pines', '冻原松林', 0.31, 0.05, 'snow', 'tree', [chop(2, '_tundra'), hunt(3)]),
  wild('ice_cavern', '冰晶洞窟', 0.60, 0.05, 'snow', 'ore', [mine(4, '_cavern'), hunt(5, '_cavern')]),

  // ---- 5088 大地图新增的特色地点（用户 10-23）：每处一片新地貌、2-4 种专属生物和一个首领 ----
  site(wild('isles', '千岛湖', 0.40, 0.66, 'town', 'boss', [fishAt('crucian', '_isles'), fishAt('bighead', '_isles')]), 'islands', 120),
  site(wild('bamboo', '雾隐竹海', 0.07, 0.64, 'woodland', 'boss', [chop(2, '_bamboo'), herb('fire_bloom', '_bamboo')]), 'bamboo', 110),
  site(wild('saltflat', '盐晶荒原', 0.85, 0.43, 'coast', 'boss', [mine(3, '_salt'), cotton(3, '_salt')]), 'saltflat', 120),
  site(wild('crater', '碎星陨坑', 0.84, 0.27, 'highland', 'boss', [mine(4, '_meteor')]), 'crater', 100),
  site(wild('fungal', '菌丝深谷', 0.14, 0.12, 'giantwood', 'boss', [herb('moon_herb', '_fungal'), cotton(4, '_fungal')]), 'fungal', 110),
  site(wild('glacier', '冰川裂谷', 0.47, 0.15, 'snow', 'boss', [mine(5, '_glacier'), hunt(5, '_glacier')]), 'glacier', 120),
  site(wild('obsidian', '黑曜火山群', 0.88, 0.80, 'lava', 'boss', [mine(6, '_obsidian'), hunt(6, '_obsidian')]), 'obsidian', 120),
  site(wild('starabyss', '星渊祭坛', 0.47, 0.80, 'abyss', 'boss', [mine(7, '_star'), cotton(7, '_star')]), 'starabyss', 110),

  // ---- 8848 大地图外圈（用户 10-23）：8 个新区域、新大型城镇落霞城、16 处新地点 ----
  // 落霞城：第二个仓库和集市，珍材坊专做新资源线的东西
  town2('bank2', '落霞城·仓库', -15, -9, 'bank', [], { opens: 'bank' }),
  town2('market2', '落霞城·集市', -14, 12, 'market', [
    steal('caravan_guard', '偷驼队护卫', 30, 35, [{ item: 'spice_3', qty: 2, chance: 0.2 }]),
    steal('spice_merchant', '偷香料商', 50, 70, [{ item: 'spice_5', qty: 2, chance: 0.15 }, { item: 'resin_5', qty: 1, chance: 0.1 }]),
  ]),
  town2('atelier', '落霞城·珍材坊', 14, -9, 'atelier', filterIds('rare_')),
  town2('smithy2', '落霞城·铁匠铺', -27, 19, 'anvil', filterIds('smith_')),
  town2('furnace2', '落霞城·熔炉', -20, 28, 'furnace', filterIds('smelt_')),
  town2('kitchen2', '落霞城·灶台', 16, 14, 'stove', filterIds('cook_')),
  town2('workshop2', '落霞城·工坊', 28, 17, 'bench', filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_'))),
  town2('bowyer2', '落霞城·制弓台', 27, -4, 'bowyer', filterIds('plank_').concat(filterIds('fletch_'))),
  town2('apothecary2', '落霞城·药剂铺', -27, -1, 'potion', filterIds('brew_')),
  town2('enhancer2', '落霞城·强化台', -4, 16, 'enhance', filterIds('enhance_'), { closed: true }),
  // 金穗草原
  ring('golden_plain', '金穗原野', 0.06, 0.42, 'savanna', 'camp', [mat('spice', 1), mat('resin', 1), mat('feather', 1), chop(1, '_plain')]),
  ring('lion_rock', '狮吼岩', 0.15, 0.63, 'savanna', 'boss', [mat('crystal', 1), mat('crystal', 2), mat('feather', 2), mine(1, '_lion')]),
  // 枫红秋林
  ring('maple_valley', '枫红谷', 0.08, 0.22, 'autumn', 'tree', [mat('resin', 2), mat('spice', 2), chop(3, '_maple')]),
  ring('leaf_corridor', '落叶回廊', 0.19, 0.08, 'autumn', 'camp', [mat('feather', 3), mat('crystal', 3), hunt(3, '_leaf')]),
  // 蛮荒雨林
  ring('vine_realm', '藤蔓秘境', 0.08, 0.78, 'jungle', 'tree', [mat('spice', 3), mat('resin', 4), chop(4, '_vine')]),
  ring('python_marsh', '蟒河湿地', 0.17, 0.92, 'jungle', 'boss', [mat('feather', 4), hunt(4, '_python'), herb('flame_heart', '_python')]),
  // 珊瑚群岛
  site(ring('coral_atoll', '珊瑚环礁', 0.90, 0.47, 'tropic', 'fish', [mat('crystal', 4), fishAt('grouper', '_atoll'), fishAt('lanternfish', '_atoll')], true), 'atoll', 110),
  ring('palm_coast', '椰风海岸', 0.86, 0.61, 'tropic', 'camp', [mat('resin', 3), mat('spice', 4), cotton(4, '_palm')]),
  // 赤岩峡谷
  site(ring('red_mesa', '赤岩台地', 0.88, 0.12, 'canyon', 'ore', [mat('crystal', 5), mine(5, '_mesa')]), 'mesa', 120),
  ring('wind_pillars', '风语石柱', 0.93, 0.29, 'canyon', 'camp', [mat('feather', 5), hunt(5, '_pillar')]),
  // 流沙大漠
  site(ring('sand_oasis', '沙海绿洲', 0.86, 0.80, 'desert', 'fish', [mat('spice', 5), mat('resin', 5), fishAt('carp', '_sand')], true), 'oasis', 90),
  ring('king_tomb', '古王陵', 0.93, 0.93, 'desert', 'boss', [mat('crystal', 6), mine(6, '_tomb')]),
  // 云岭高山
  ring('cloud_slope', '云巅雪坡', 0.38, 0.06, 'alpine', 'tree', [mat('resin', 6), mat('spice', 6), chop(6, '_cloud')]),
  ring('eagle_gorge', '鹰愁涧', 0.62, 0.07, 'alpine', 'camp', [mat('feather', 6), mine(6, '_gorge')]),
  // 晶簇荒原
  site(ring('crystal_heart', '晶簇之心', 0.40, 0.93, 'crystal', 'boss', [mat('crystal', 7), mine(7, '_heart')]), 'crystalheart', 110),
  ring('void_field', '虚空晶原', 0.62, 0.93, 'crystal', 'camp', [mat('spice', 7), mat('resin', 7), mat('feather', 7)]),

  // ---- 12 个大型洞窟（用户 10-23：先占位，以后开放） ----
  cave('cave_shadow', '幽影洞窟', at(0.15, 0.50), 'woodland'),
  cave('cave_magma', '熔心洞', at(0.70, 0.86), 'lava'),
  cave('cave_frost', '寒晶洞', at(0.55, 0.13), 'snow'),
  cave('cave_mine', '古矿坑道', at(0.80, 0.20), 'highland'),
  cave('cave_spider', '蛛巢洞', at(0.12, 0.85), 'swamp'),
  cave('cave_maw', '深渊之喉', at(0.52, 0.88), 'abyss'),
  cave('cave_echo', '回音窟', atW(0.05, 0.56), 'savanna'),
  cave('cave_bone', '龙骨洞', atW(0.95, 0.20), 'canyon'),
  cave('cave_falls', '水帘洞', atW(0.12, 0.86), 'jungle'),
  cave('cave_bat', '蝠影窟', atW(0.12, 0.14), 'autumn'),
  cave('cave_sunken', '沉海洞', atW(0.95, 0.55), 'tropic'),
  cave('cave_vein', '晶脉洞', atW(0.52, 0.95), 'crystal'),
];

/**
 * 刷新点：每种怪物去它所在区域里、资源等级最接近它的野外点位，
 * 同一个点位怪越多越不优先，避免全挤在一起。分好后点位的等级范围把怪物也算进去。
 */
(() => {
  const load = new Map<MapNode, number>();
  const mid = (n: MapNode) => (n.lv[0] + n.lv[1]) / 2;
  for (const sp of SPECIES) {
    // 新地点的专属生物住在自己的地点；老生物不往新地点分，原来的分布不变
    const home = sp.home && NODES.find((n) => n.id === sp.home);
    if (home) {
      home.actions.push(fight(sp.id));
      continue;
    }
    const pool = NODES.filter((n) => !n.town && !n.site && !n.cave && n.region === sp.region);
    const best = pool.reduce((a, b) => {
      const cost = (n: MapNode) => Math.abs(mid(n) - sp.level) + (load.get(n) ?? 0) * 6;
      return cost(b) < cost(a) ? b : a;
    });
    best.actions.push(fight(sp.id));
    load.set(best, (load.get(best) ?? 0) + 1);
  }
  for (const n of NODES) {
    if (n.town || !n.actions.length) continue;
    const lvls = n.actions.map((a) => actionList.find((x) => x.id === a)!.level);
    n.lv = [Math.min(...lvls), Math.max(...lvls)];
  }
})();

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(actionList.map((a) => [a.id, a]));

/** 动作 → 所在地点 */
const NODES_OF: Record<string, MapNode[]> = {};
for (const n of NODES) for (const a of n.actions) (NODES_OF[a] ??= []).push(n);
/** 能做这个动作的所有地点（两座城的同类建筑会重复） */
export const nodesOfAction = (id: string | undefined): MapNode[] => (id ? NODES_OF[id] ?? [] : []);
/** 动作所在地点；给了位置就挑离它最近的那个 */
export function nodeOfAction(id: string | undefined, near?: { x: number; y: number }): MapNode | undefined {
  const all = nodesOfAction(id);
  if (!near || all.length < 2) return all[0];
  return all.reduce((a, b) => (Math.hypot(b.x - near.x, b.y - near.y) < Math.hypot(a.x - near.x, a.y - near.y) ? b : a));
}
/** 干活时站的格子：地点正下方一格 */
export const standOf = (n: MapNode) => ({ x: n.x, y: n.y + 1 });
/** 出生点：镇中心广场 */
export const SPAWN_TILE = townXY(167, 175);
/** 步行速度（格/秒），坐骑以后乘倍率 */
export const WALK_TILES_PER_SEC = 4;
/** 自动寻路要走多久：直线距离 × 1.25 估算绕路 */
export function travelMs(from: { x: number; y: number }, to: { x: number; y: number }, speed = WALK_TILES_PER_SEC) {
  return Math.round((Math.hypot(to.x - from.x, to.y - from.y) * 1.25 * 1000) / speed);
}

/** 世界地图危险度：按地点最强怪物和玩家战斗等级的差距 */
export const DANGER = [
  { name: '安全', color: '#7cc46a' },
  { name: '低', color: '#9ad0e0' },
  { name: '中等', color: '#e8c84a' },
  { name: '高', color: '#e8883a' },
  { name: '致命', color: '#e04848' },
];

export function dangerLevel(node: MapNode, combatLevel: number): number {
  const levels = node.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat' && a.monster !== 'dummy').map((a) => a.level);
  if (!levels.length) return 0;
  const d = Math.max(...levels) - combatLevel;
  return d <= -10 ? 1 : d <= 5 ? 2 : d <= 20 ? 3 : 4;
}
