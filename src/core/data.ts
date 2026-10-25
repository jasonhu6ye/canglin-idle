import type {
  ActionDef, Buff, BuffKind, CombatStyle, Drop, EquipSlot, ItemCategory, ItemDef, ItemStack, LootTable, MonsterDef, RegionId, SkillGroup, SkillId, ToolSlot,
} from './types';
import { QUALITY_NAME, QUALITY_STAT, QUALITY_SPEED, QUALITY_VALUE, qid } from './quality';
import { FORM_FAMILY, isAnimal, SPECIES, WORLD_SKILL, type Family, type Species } from './bestiary';
import { doorOf, FACILITY_NAME, townAt, TOWNS, type Facility, type TownDef } from './towns';

/*
 * 资源、装备、怪物都是正式内容，数值按公式批量生成；怪物设计表在 bestiary.ts。
 * 闭环：采集 → 仓库 → 生产 → 装备/消耗品 → 战斗 → 掉落 → 生产或卖钱。
 */

export { MAP_W, MAP_H, MID_BOX, OLD_BOX, at, atW, atF } from './geo';
import { MAP_W, MAP_H, MID_BOX, OLD_BOX, at, atW, atF } from './geo';
import { APT_MAX, APT_MIN, COAT_NAME, coatOf, FOAL, FOAL_CHANCE, horseItem, RANCH } from './ranch';
import { HW_ALTAR, HW_BOX, HW_POINT, HW_TIERS, hwTierOf } from './halloween';
import { SP, isEn, tl, tlc } from '../i18n';

/** soon：占位技能，还没有内容（养殖，用户 10-23） */
export interface SkillInfo { name: string; color: string; group: SkillGroup; desc: string; soon?: boolean }

export const SKILLS: Record<SkillId, SkillInfo> = {
  mining: { name: tl('挖矿'), color: '#b08d57', group: 'gather', desc: tl('采集矿石、符文石和宝石') },
  woodcutting: { name: tl('伐木'), color: '#6a9a4a', group: 'gather', desc: tl('砍伐各地的树木') },
  fishing: { name: tl('钓鱼'), color: '#4f86b8', group: 'gather', desc: tl('在湖泊、海岸和熔池钓鱼') },
  gathering: { name: tl('采集'), color: '#7cc456', group: 'gather', desc: tl('用镰刀采棉花和草药，偶尔捡到野生种子') },
  farming: { name: tl('种植'), color: '#c8a040', group: 'gather', desc: tl('在城镇附近的田里用锄头播种、收获作物，收成时会收回种子') },
  hunting: { name: tl('狩猎'), color: '#b0703a', group: 'gather', desc: tl('在野外狩猎野兽，用刮皮刀剥取兽皮') },
  husbandry: { name: tl('养殖'), color: '#e0a8a0', group: 'gather', desc: tl('在城镇畜牧站养小马崽，养大得到坐骑马；等级越高长得越快') },
  thieving: { name: tl('偷窃'), color: '#8a7ab8', group: 'gather', desc: tl('从镇民和商队身上摸金币，失败会被晕眩') },
  cooking: { name: tl('烹饪'), color: '#d4a03c', group: 'produce', desc: tl('把鱼和作物做成回血的食物') },
  smithing: { name: tl('锻造'), color: '#c26a3a', group: 'produce', desc: tl('冶炼精炼锭，打造剑、长枪、匕首、板甲和工具') },
  fletching: { name: tl('制弓'), color: '#a8944a', group: 'produce', desc: tl('加工木材，制作短弓、长弓、弩和鱼竿') },
  herblore: { name: tl('药剂'), color: '#4ab89a', group: 'produce', desc: tl('用草药调配治疗药水') },
  crafting: { name: tl('工艺'), color: '#b87a9a', group: 'produce', desc: tl('鞣制皮革、纺织布料，制作皮甲、布甲、法杖和首饰') },
  enhancing: { name: tl('强化'), color: '#e8d04a', group: 'produce', desc: tl('制作强化石（装备强化系统待开放）') },
  melee: { name: tl('近战'), color: '#c84a4a', group: 'combat', desc: tl('装备剑、长枪、匕首时获得经验') },
  ranged: { name: tl('远程'), color: '#6ab84a', group: 'combat', desc: tl('装备短弓、长弓、弩时获得经验，不用带箭') },
  magic: { name: tl('魔法'), color: '#5a7ae8', group: 'combat', desc: tl('装备法杖时获得经验，不用带符文') },
  defence: { name: tl('防御'), color: '#7a8ab8', group: 'combat', desc: tl('任何战斗都会获得，决定能穿的护甲') },
  hitpoints: { name: tl('生命'), color: '#d0566b', group: 'combat', desc: tl('任何战斗都会获得，每级 10 点生命上限') },
};

export const SKILL_GROUPS: { id: SkillGroup; name: string }[] = [
  { id: 'gather', name: tl('采集') },
  { id: 'produce', name: tl('生产') },
  { id: 'combat', name: tl('战斗') },
];

export const REGIONS: Record<RegionId, { name: string; color: string }> = {
  town: { name: tl('城镇·安全区'), color: '#7a9a52' },
  snow: { name: tl('冰封雪原'), color: '#dfe8f0' },
  highland: { name: tl('灰岩高地'), color: '#8a8a88' },
  coast: { name: tl('金沙海岸'), color: '#e0c27a' },
  lava: { name: tl('熔岩荒地'), color: '#6a3a2e' },
  abyss: { name: tl('深渊裂谷'), color: '#3e3352' },
  swamp: { name: tl('亡者沼泽'), color: '#4a5a3a' },
  woodland: { name: tl('幽深林地'), color: '#3f6e34' },
  giantwood: { name: tl('巨木森林'), color: '#2f5a32' },
  savanna: { name: tl('金穗草原'), color: '#c8b052' },
  autumn: { name: tl('枫红秋林'), color: '#b0562a' },
  jungle: { name: tl('蛮荒雨林'), color: '#2a6a2a' },
  tropic: { name: tl('珊瑚群岛'), color: '#3aa8b8' },
  canyon: { name: tl('赤岩峡谷'), color: '#a84a30' },
  desert: { name: tl('流沙大漠'), color: '#dcb066' },
  alpine: { name: tl('云岭高山'), color: '#8aa898' },
  crystal: { name: tl('晶簇荒原'), color: '#6a52a0' },
  // 12080 最外圈（用户 10-24 的新版世界地图）
  hills: { name: tl('青岚丘陵'), color: '#6aa878' },
  vineisles: { name: tl('古藤群岛'), color: '#3a7a4a' },
  moonmire: { name: tl('腐月湿地'), color: '#6a5a8a' },
  archipelago: { name: tl('潮歌群岛'), color: '#4ab8a8' },
  frostpeak: { name: tl('寒星山脉'), color: '#8aa0c8' },
  ashcape: { name: tl('灰烬海角'), color: '#4a3a3a' },
  thunder: { name: tl('雷鸣断层'), color: '#4a4a6a' },
  starsea: { name: tl('星陨晶海'), color: '#3a3a8a' },
};

// ---- 物品 ----

const itemList: ItemDef[] = [];
const ITEMS_NAME = (id: string) => itemList.find((x) => x.id === id)?.name ?? id;
const item = (id: string, name: string, category: ItemCategory, value: number, extra: Partial<ItemDef> = {}) => {
  itemList.push({ id, name, category, value, ...extra });
  return id;
};

item('coins', tl('金币'), 'misc', 1);
item('bones', tl('骨头'), 'misc', 3);

/**
 * T1-T8 八个阶级：矿石、木头、棉花、兽皮各 8 阶，装备档位和它们一一对应。
 * T1 石头直接打磨成石料，T3 起用两种矿石合炼。
 */
export const TIERS = [
  { id: 'wood', metal: tlc('metal', '木'), ore: 'stone', oreName: tl('石头'), wood: 'plain', woodName: tl('原木'), rune: tl('木'), level: 1 },
  { id: 'copper', metal: tl('铜'), ore: 'copper_ore', oreName: tl('铜矿'), wood: 'birch', woodName: tl('桦木'), rune: tl('铜'), level: 10 },
  { id: 'tin', metal: tl('锡'), ore: 'tin_ore', oreName: tl('锡矿'), wood: 'pine', woodName: tl('松木'), rune: tl('锡'), level: 20 },
  { id: 'iron', metal: tl('铁'), ore: 'iron_ore', oreName: tl('铁矿'), wood: 'oak', woodName: tl('橡木'), rune: tl('铁'), level: 30 },
  { id: 'titanium', metal: tl('钛'), ore: 'titanium_ore', oreName: tl('钛矿'), wood: 'cedar', woodName: tl('雪松木'), rune: tl('钛'), level: 40 },
  { id: 'runic', metal: tlc('metal', '符文'), ore: 'rune_ore', oreName: tl('符文矿'), wood: 'bloodoak', woodName: tl('血橡木'), rune: tl('秘纹'), level: 55 },
  { id: 'meteor', metal: tl('陨铁'), ore: 'meteor_ore', oreName: tl('陨铁矿'), wood: 'ashbark', woodName: tl('灰烬树皮木'), rune: tl('陨星'), level: 70 },
  { id: 'adamant', metal: tl('精金'), ore: 'adamant_ore', oreName: tl('精金矿'), wood: 'white', woodName: tl('白木'), rune: tl('精金'), level: 95 },
];
/** 阶级下标（0-7）→ 显示用的 T1-T8 */
/** 烤兽肉回复量，比同阶鱼略高，鼓励打猎 */
const MEAT_HEAL = [40, 70, 110, 150, 200, 260, 330, 420];
export const tierName = (i: number) => `T${i + 1}`;
/** 等级对应能拿到的最高阶级下标 */
export const tierForLevel = (level: number) => TIERS.reduce((best, t, i) => (t.level <= level ? i : best), 0);
const POWER = [5, 10, 17, 25, 34, 45, 58, 72];
const TOOL_SPEED = [0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32];
export const BAR_VALUE = [5, 12, 30, 60, 120, 250, 520, 1000];
const RES_VALUE = [2, 5, 12, 25, 50, 100, 200, 400];

// 四类分阶资源，同阶同价
TIERS.forEach((t, i) => {
  item(t.ore, t.oreName, 'resource', RES_VALUE[i], { tier: i });
  item(`${t.wood}_log`, t.woodName, 'resource', RES_VALUE[i], { tier: i });
  item(`cotton_${i + 1}`, tl('棉花'), 'resource', RES_VALUE[i], { tier: i });
  item(`hide_${i + 1}`, tl('兽皮'), 'resource', RES_VALUE[i], { tier: i });
  // 怪物掉落：动物掉兽肉（烹饪成烤兽肉），其他怪物掉魔核（和骨头一起淬炼强化石）
  item(`meat_${i + 1}`, tl('兽肉'), 'resource', RES_VALUE[i], { tier: i });
  item(`steak_${i + 1}`, tl('烤兽肉'), 'food', RES_VALUE[i] * 2, { tier: i, heals: MEAT_HEAL[i] });
  item(`core_${i + 1}`, tl('魔核'), 'material', RES_VALUE[i] * 3, { tier: i });
});
// 宝石：挖矿时小概率顺带挖到
item('sapphire', tl('蓝宝石'), 'resource', 150);
item('ruby', tl('红宝石'), 'resource', 300);
item('diamond', tl('钻石'), 'resource', 600);
export const GEM_FOR_TIER = ['sapphire', 'sapphire', 'sapphire', 'sapphire', 'ruby', 'ruby', 'diamond', 'diamond'];

// 鱼与食物：[id, 名字, 钓鱼等级, 回复]
const FISH: [string, string, number, number][] = [
  ['minnow', tl('银鱼'), 1, 30], ['shrimp', tl('虾'), 1, 30], ['carp', tl('绿洲鲤'), 5, 45], ['trout', tl('鳟鱼'), 10, 60],
  ['bass', tl('海鲈'), 15, 80], ['cod', tl('冰鳕'), 20, 100], ['salmon', tl('鲑鱼'), 25, 130], ['eel', tl('沉潭鳗'), 30, 160],
  ['lava_eel', tl('熔岩鳗'), 35, 190], ['ghostfish', tl('幽灵鱼'), 40, 220], ['abyssfish', tl('深渊鱼'), 58, 300],
];
/** 新增鱼获（用户 10-22 要求）：每阶 4 种，[id, 名字, 钓鱼等级, 回复, 产地说明] */
const NEW_FISH: [string, string, number, number, string][] = [
  ['loach', tl('泥鳅'), 2, 32, tl('镜湖浅滩的泥底')], ['crucian', tl('鲫鱼'), 4, 36, tl('镜湖码头')], ['grass_carp', tl('草鱼'), 6, 42, tl('幽苔水洼')], ['perch', tl('河鲈'), 8, 48, tl('幽苔水洼')],
  ['bighead', tl('花鲢'), 11, 62, tl('桦影溪谷')], ['catfish', tl('黄颡鱼'), 13, 68, tl('桦影溪谷')], ['bream', tl('银鳊'), 16, 76, tl('腐沼渡口')], ['pike', tl('狗鱼'), 18, 84, tl('腐沼渡口')],
  ['snow_trout', tl('雪鳟'), 21, 104, tl('北境冰莲湾')], ['herring', tl('冰原鲱'), 23, 112, tl('北境冰莲湾')], ['flounder', tl('寒带比目鱼'), 26, 124, tl('冰湖峡湾')], ['sturgeon', tl('鲟鱼'), 28, 134, tl('冰湖峡湾')],
  ['swamp_catfish', tl('沼泽鲶'), 31, 164, tl('亡语沉潭')], ['bonefin', tl('骨鳍鱼'), 34, 176, tl('亡语沉潭')], ['stingray', tl('毒刺鳐'), 36, 184, tl('鳄鱼泥滩')], ['squid', tl('墨乌贼'), 38, 192, tl('沉船湾')],
  ['grouper', tl('珊瑚石斑'), 42, 226, tl('珊瑚浅滩')], ['lanternfish', tl('灯笼鱼'), 45, 238, tl('珊瑚浅滩')], ['swordfish', tl('剑鱼'), 48, 250, tl('沉船湾')], ['tuna', tl('金枪鱼'), 52, 266, tl('沉船湾')],
  ['magma_shrimp', tl('熔岩虾'), 56, 290, tl('黑曜熔池')], ['fire_carp', tl('火鳞鲤'), 60, 306, tl('黑曜熔池')], ['flame_shark', tl('炽鳍鲨'), 64, 322, tl('硫磺泉')], ['sulfur_catfish', tl('硫磺鲶'), 68, 338, tl('硫磺泉')],
  ['star_ray', tl('星斑魟'), 72, 356, tl('星光湖')], ['crystal_fish', tl('晶鳞鱼'), 78, 380, tl('星光湖')], ['phantom_eel', tl('幻光鳗'), 84, 404, tl('幻潮海崖')], ['thunder_shark', tl('雷纹鲨'), 90, 428, tl('幻潮海崖')],
  ['abyss_bass', tl('深渊巨鲈'), 96, 452, tl('深渊潮眼')], ['void_angler', tl('虚空鮟鱇'), 102, 476, tl('深渊潮眼')], ['dragonfish', tl('古龙鱼'), 110, 508, tl('龙渊')], ['starwhale', tl('星海鲸鲨'), 120, 548, tl('龙渊')],
];
for (const [id, name, lvl, heals] of NEW_FISH) FISH.push([id, name, lvl, heals]);
/** 12080 外圈的新鱼（用户 10-24）：每个新群系、新港口一种，[id, 名字, 钓鱼等级, 回复, 产地说明, 配菜香料阶] */
export const SEA_FISH: [string, string, number, number, string][] = [
  ['hill_trout', tl('青岚溪鳟'), 12, 66, tl('青岚丘陵的溪流')], ['vine_perch', tl('古藤鲈'), 33, 172, tl('霜叶海湾')],
  ['harbor_mackerel', tl('港湾鲭'), 41, 230, tl('珊瑚港的栈桥')], ['moon_catfish', tl('月影鲶'), 46, 246, tl('腐月湿地')],
  ['tide_bream', tl('潮歌鲷'), 50, 260, tl('碧潮圣礁')], ['aurora_salmon', tl('极光鲑'), 74, 364, tl('极光冰湖')],
  ['ash_shark', tl('灰鳍鲨'), 86, 418, tl('灼风峡湾')], ['storm_eel', tl('雷鸣鳗'), 104, 488, tl('苍白裂岸')], ['star_whale', tl('星陨鲸'), 128, 582, tl('坠星环礁')],
];
for (const [id, name, lvl, heals] of SEA_FISH) FISH.push([id, name, lvl, heals]);
export const fishTier = (lvl: number) => Math.max(0, [1, 10, 20, 30, 40, 55, 70, 95].filter((l) => lvl >= l).length - 1);
for (const [id, name, lvl, heals] of FISH) {
  const where = (NEW_FISH.find((f) => f[0] === id) ?? SEA_FISH.find((f) => f[0] === id))?.[4];
  item(`raw_${id}`, tl`生${name}`, 'resource', Math.round(2 + lvl * 0.9), { tier: fishTier(lvl), desc: tl`钓鱼 ${lvl} 级可钓${where ? tl`，产自${where}` : ''}。直接烤熟能回血，也能做成料理。` });
  item(id, tl`烤${name}`, 'food', Math.round(4 + lvl * 1.4), { tier: fishTier(lvl), heals, desc: tl(`最简单的做法，只回复生命，没有增益。`) });
}
item('burnt_food', tl('烧焦的食物'), 'misc', 0);

// 作物与草药
item('potato', tl('土豆'), 'resource', 2, { tier: 0, desc: tl('种植收获的作物，烤一下就能吃。') });
item('wheat', tl('小麦'), 'resource', 3, { tier: 0, desc: tl('种植收获的作物，两份能烤成面包。') });
const ITEMS_EARLY = new Set(['potato', 'wheat']);
item('baked_potato', tl('烤土豆'), 'food', 4, { heals: 25 });
item('bread', tl('面包'), 'food', 10, { heals: 50 });
/**
 * 作物（用户 10-23 要求：种植和采集分开，种子几十种）。每阶 4 种，共 32 种。
 * [id, 名字, 种植等级, 颜色, 料理名, 形状]
 * 种子来源：集市种子摊（T1-T2）、收成时收回、1% 变异出下一种作物的种子、
 * 同阶野怪掉落、采集草药棉花时捡到、偷农夫/小贩。
 */
export const CROPS: [string, string, number, string, string, 'veg' | 'grain'][] = [
  ['potato', tl('土豆'), 1, '#b08a50', '', 'veg'], ['wheat', tl('小麦'), 3, '#e0c050', '', 'grain'],
  ['carrot', tl('胡萝卜'), 5, '#f08a2a', tl('蜜汁胡萝卜'), 'veg'], ['cabbage', tl('卷心菜'), 7, '#8ad060', tl('卷心菜汤'), 'veg'],
  ['onion', tl('洋葱'), 10, '#d8b0d0', tl('酥炸洋葱圈'), 'veg'], ['corn', tl('玉米'), 12, '#f0d040', tl('黄油烤玉米'), 'grain'],
  ['tomato', tl('番茄'), 15, '#e04a3a', tl('番茄浓汤'), 'veg'], ['pea', tl('豌豆'), 17, '#6ac04a', tl('奶香豌豆泥'), 'veg'],
  ['pumpkin', tl('南瓜'), 20, '#f0902a', tl('南瓜派'), 'veg'], ['pepper', tl('甜椒'), 23, '#e0c030', tl('烤甜椒'), 'veg'],
  ['eggplant', tl('茄子'), 25, '#7a4ab0', tl('红烧茄子'), 'veg'], ['strawberry', tl('草莓'), 27, '#f04a6a', tl('草莓挞'), 'veg'],
  ['garlic', tl('大蒜'), 30, '#f0ece0', tl('蒜香面包'), 'veg'], ['beet', tl('甜菜'), 33, '#a02a5a', tl('甜菜汤'), 'veg'],
  ['watermelon', tl('西瓜'), 35, '#4aa04a', tl('西瓜冰沙'), 'veg'], ['chili', tl('辣椒'), 37, '#e0302a', tl('麻辣小炒'), 'veg'],
  ['rice', tl('稻米'), 40, '#f4f0e0', tl('香米饭团'), 'grain'], ['melon', tl('香瓜'), 44, '#c8e070', tl('香瓜沙拉'), 'veg'],
  ['grape', tl('葡萄'), 48, '#8a4ac0', tl('葡萄干糕'), 'veg'], ['asparagus', tl('芦笋'), 51, '#7ab04a', tl('黄油芦笋'), 'grain'],
  ['snow_yam', tl('雪莲薯'), 55, '#e8f0ff', tl('雪莲薯泥'), 'veg'], ['gold_wheat', tl('金穗麦'), 59, '#ffd040', tl('金麦面包'), 'grain'],
  ['fire_pepper', tl('火焰椒'), 63, '#ff6a1a', tl('火焰椒酱烤肉'), 'veg'], ['moon_melon', tl('月光瓜'), 66, '#c8d8ff', tl('月光瓜羹'), 'veg'],
  ['star_berry', tl('星光莓'), 70, '#9ab0ff', tl('星光莓果酱'), 'veg'], ['dragon_cress', tl('龙须菜'), 76, '#3ac08a', tl('清炒龙须菜'), 'grain'],
  ['frost_kale', tl('霜晶菜'), 82, '#8ae0f0', tl('霜晶菜卷'), 'veg'], ['blood_corn', tl('血玉米'), 88, '#c0203a', tl('血玉米浓汤'), 'grain'],
  ['lingzhi', tl('灵芝'), 95, '#a0402a', tl('灵芝炖汤'), 'veg'], ['immortal_peach', tl('仙桃'), 100, '#ffb0c0', tl('仙桃蜜饯'), 'veg'],
  ['phoenix_fruit', tl('凤凰果'), 105, '#ff8a3a', tl('凤凰果挞'), 'veg'], ['world_fruit', tl('世界树果'), 110, '#f0ffb0', tl('世界树果羹'), 'veg'],
];
/** 集市种子摊卖的种子（T1-T2） */
export const SEED_SHOP = CROPS.filter((c) => c[2] < 20).map((c) => `seed_${c[0]}`);
/** 种子在集市的售价 = 价值 × 4 */
export const SEED_PRICE = 4;
CROPS.forEach(([id, name, lvl, , dish]) => {
  const tier = tierForLevel(lvl);
  const where = [tl('城镇农田'), tl('城镇农田'), tl('南郊麦田'), tl('南郊麦田'), tl('东郊菜园'), tl('东郊菜园'), tl('西岭灵田'), tl('西岭灵田')][tier];
  item(`seed_${id}`, tl`${name}种子`, 'seed', Math.max(1, Math.round(1 + lvl * 0.6)), {
    tier, desc: tl`种植 ${lvl} 级可在${where}播种。${tier < 2 ? tl('集市种子摊有卖；') : ''}收成时大概率收回种子，${tierName(tier)} 阶野怪和采集时也会掉落。`,
  });
  if (!ITEMS_EARLY.has(id)) item(id, name, 'resource', Math.round(2 + lvl * 0.8), { tier, desc: tl`种植收获的作物。两个能做成${dish}。` });
  if (dish) item(`meal_${id}`, dish, 'food', Math.round(5 + lvl * 1.6), { tier, heals: Math.round(28 + lvl * 4.4), desc: tl`用${name}做的家常菜，只回复生命。` });
});
// 农耕（用户 10-23 要求增加农耕玩法）：肥料、洒水器（品质用户说暂时不做）
item('fert_basic', tl('普通肥料'), 'misc', 6, { desc: tl('在工坊用草药和小鱼沤成。田地面板选了施肥后，每种一格用掉 1 份：作物长得快 20%。') });
item('fert_rich', tl('高级肥料'), 'misc', 40, { desc: tl('普通肥料加魔核调成。每种一格用掉 1 份：长得快 35%，收获时多收 1 个作物。') });
item('sprinkler', tl('洒水器'), 'misc', 120, { desc: tl('在铁匠铺打造。站在田里装上后，这块田新种下的作物自动浇好水（自动补种、离线也算）。一块田装一个，装上就不会坏。') });
const HERBS: [string, string, number, number][] = [
  // [id, 名字, 采集等级, 药水回复]
  ['green_herb', tl('绿叶草'), 1, 80], ['fire_bloom', tl('火绒花'), 2, 110], ['moon_herb', tl('月露草'), 18, 170],
  ['silver_leaf', tl('银叶草'), 21, 210], ['flame_heart', tl('炎心花'), 25, 260], ['frost_lotus', tl('冰莲'), 26, 330],
];
HERBS.forEach(([id, name, lvl, heals]) => {
  item(id, name, 'resource', Math.round(3 + lvl * 1.5));
  item(`${id}_potion`, tl`${name}药水`, 'potion', Math.round(15 + lvl * 4), { heals });
});

// ---- 加工材料 ----
// 精炼锭（锻造）：T1 是硬木锭（原木 + 石头打磨），T2 起由同阶矿石冶炼
// 加工木材（制弓）、皮革和布料（工艺）都是同阶原料 ×2 → 1
TIERS.forEach((t, i) => {
  item(`${t.id}_bar`, i === 0 ? tl('硬木锭') : tl`${t.metal}锭`, 'material', BAR_VALUE[i], { tier: i });
  item(`plank_${i + 1}`, tl`${isEn ? t.woodName.replace(/ ?Log$/, '') : t.woodName}板材`.trim(), 'material', RES_VALUE[i] * 3, { tier: i });
  item(`leather_${i + 1}`, tl('皮革'), 'material', RES_VALUE[i] * 3, { tier: i });
  item(`cloth_${i + 1}`, tl('布料'), 'material', RES_VALUE[i] * 3, { tier: i });
});
// 箭和符文（弹药）10-25 用户要求删掉：远程、魔法不再耗弹药，原来弹药的威力并进了弓弩法杖

/**
 * 新资源线（用户 10-23 要求几十种 T1-T8 新材料）：晶石、香料、树脂、羽毛，各 8 阶共 32 种。
 * T1 在老地图城镇附近，T2-T8 在 8848 外圈的新区域。用途都在落霞城的珍材坊：
 * 香料 + 兽肉 → 香料料理；晶石、树脂、羽毛原来做符文和箭，弹药 10-25 删掉后暂时只能卖钱
 */
export type MatLine = 'crystal' | 'spice' | 'resin' | 'feather';
export const MAT_LINES: Record<MatLine, { name: string; skill: SkillId; verb: string; names: string[]; desc: string }> = {
  crystal: { name: tl('晶石'), skill: 'mining', verb: tl('开采'), names: [tl('石英'), tl('紫晶'), tl('黄晶'), tl('碧玉'), tl('蓝晶'), tl('星辉晶'), tl('日耀晶'), tl('虚空晶')], desc: tl('从岩缝里敲下来的晶石，能卖不少钱') },
  spice: { name: tl('香料'), skill: 'gathering', verb: tl('采摘'), names: [tl('薄荷叶'), tl('野茴香'), tl('肉桂皮'), tl('丁香'), tl('豆蔻'), tl('藏红花'), tl('雪域花椒'), tl('虚空星椒')], desc: tl('晒干的香草和香料，和兽肉一起做成料理') },
  resin: { name: tl('树脂'), skill: 'woodcutting', verb: tl('割取'), names: [tl('松脂'), tl('桦胶'), tl('枫脂'), tl('琥珀脂'), tl('龙血脂'), tl('烈阳脂'), tl('霜华脂'), tl('白玉脂')], desc: tl('割开树皮流出的树脂，能卖不少钱') },
  feather: { name: tl('羽毛'), skill: 'hunting', verb: tl('收集'), names: [tl('雀羽'), tl('鸦羽'), tl('鹰羽'), tl('鹤羽'), tl('孔雀羽'), tl('雷鸟羽'), tl('冰凰羽'), tl('天凤羽')], desc: tl('鸟巢边捡到的羽毛，能卖不少钱') },
};
export const MAT_LINE_IDS = Object.keys(MAT_LINES) as MatLine[];
const SPICE_DISH = [tl('薄荷烤肉'), tl('茴香炖肉'), tl('肉桂烤排'), tl('丁香焖肉'), tl('豆蔻咖喱'), tl('藏红花炖肉'), tl('花椒爆肉'), tl('星椒龙排')];
const SPICE_BUFF: BuffKind[] = ['speed', 'str', 'atk', 'def', 'xp', 'str', 'atk', 'def'];
TIERS.forEach((t, i) => {
  const n = i + 1;
  for (const line of MAT_LINE_IDS) {
    const L = MAT_LINES[line];
    item(`${line}_${n}`, L.names[i], 'resource', Math.round(RES_VALUE[i] * 1.3), {
      tier: i, desc: tl`${L.desc}。${SKILLS[L.skill].name} ${t.level} 级可${L.verb}。`,
    });
  }
});

// 强化石（占位）
const STONES: [string, string, number][] = [
  ['enh_basic', tl('初级强化石'), 1], ['enh_mid', tl('中级强化石'), 30], ['enh_high', tl('高级强化石'), 55], ['enh_legend', tl('传说强化石'), 95],
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
  ({ key, name, slot: 'weapon', skill, maker, mats, plus, stats: { attack, strength, attackMs, style }, group: tl('武器') });
const ARMOR_SLOTS: [EquipSlot, number, number][] = [
  // [部位, 防御占比, 制作多加几级]
  ['head', 0.3, 2], ['body', 0.5, 6], ['feet', 0.2, 3], ['hands', 0.15, 1],
];
const A = (type: string, names: string[], mat: Mat, maker: SkillId, def: number, attack: number, strength: number, style: CombatStyle): EquipType[] =>
  ARMOR_SLOTS.map(([slot, k, plus], j) => ({
    key: `${type}_${slot}`, name: names[j], slot, skill: 'defence' as SkillId, maker, mats: [[mat, [2, 4, 2, 1][j]]] as [Mat, number][], plus,
    stats: { defence: def * k, attack: attack * k, strength: strength * k, style }, group: { plate: tl('板甲'), leather: tl('皮甲'), cloth: tl('布甲') }[type]!,
  }));
const TL = (key: string, name: string, slot: EquipSlot, skill: SkillId, maker: SkillId, mats: [Mat, number][], plus: number): EquipType =>
  ({ key, name, slot, skill, maker, mats, plus, stats: { speed: true }, group: tl('工具') });

export const EQUIP_TYPES: EquipType[] = [
  // 近战：精炼锭
  W('sword', tl('剑'), 'melee', 'smithing', [['bar', 2]], 1, 1.0, 1.0, 2400, 'melee'),
  W('spear', tl('长枪'), 'melee', 'smithing', [['bar', 2], ['plank', 1]], 3, 0.8, 1.4, 3000, 'melee'),
  W('dagger', tl('匕首'), 'melee', 'smithing', [['bar', 1]], 0, 1.25, 0.65, 2000, 'melee'),
  // 远程：皮革 + 加工木材
  W('shortbow', tl('短弓'), 'ranged', 'fletching', [['plank', 2], ['leather', 1]], 1, 1.0, 1.1, 2200, 'ranged'),
  W('longbow', tl('长弓'), 'ranged', 'fletching', [['plank', 3], ['leather', 1]], 4, 1.25, 1.3, 2800, 'ranged'),
  W('crossbow', tl('弩'), 'ranged', 'fletching', [['plank', 3], ['leather', 2]], 6, 0.85, 1.8, 3400, 'ranged'),
  // 魔法：加工木材 + 布料
  W('staff', tl('法杖'), 'magic', 'crafting', [['plank', 2], ['cloth', 1]], 4, 1.0, 1.1, 2400, 'magic'),
  // 护甲：头、身、脚、手
  ...A('plate', [tl('板甲头盔'), tl('板甲胸甲'), tl('板甲战靴'), tl('板甲护手')], 'bar', 'smithing', 2.0, 0, 0.25, 'melee'),
  ...A('leather', [tl('皮帽'), tl('皮甲'), tl('皮靴'), tl('皮手套')], 'leather', 'crafting', 1.4, 0.5, 0, 'ranged'),
  ...A('cloth', [tl('布帽'), tl('布袍'), tl('布鞋'), tl('布手套')], 'cloth', 'crafting', 1.0, 0.3, 0.4, 'magic'),
  // 工具
  TL('axe', tl('斧头'), 'axe', 'woodcutting', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('pickaxe', tl('镐子'), 'pickaxe', 'mining', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('sickle', tl('镰刀'), 'sickle', 'gathering', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('knife', tl('刮皮刀'), 'knife', 'hunting', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('hoe', tl('锄头'), 'hoe', 'farming', 'smithing', [['bar', 1], ['plank', 1]], 2),
  TL('hammer', tl('锻造锤'), 'hammer', 'smithing', 'smithing', [['bar', 2], ['plank', 1]], 2),
  TL('rod', tl('鱼竿'), 'rod', 'fishing', 'fletching', [['plank', 2], ['cloth', 1]], 2),
  TL('needle', tl('缝纫针'), 'needle', 'crafting', 'smithing', [['bar', 1]], 0),
  // 烹饪工具锅铲（用户 10-25：烹饪缺了一系列工具；slot 仍叫 pan）
  TL('pan', tl('锅铲'), 'pan', 'cooking', 'smithing', [['bar', 1], ['plank', 1]], 1),
];
const TOOL_SLOTS: EquipSlot[] = ['axe', 'pickaxe', 'sickle', 'knife', 'rod', 'hoe', 'hammer', 'needle', 'pan'];
const matItem = (m: Mat, i: number) => (m === 'bar' ? `${TIERS[i].id}_bar` : `${m}_${i + 1}`);
const matCost = (m: Mat, i: number) => (m === 'bar' ? BAR_VALUE[i] : RES_VALUE[i] * 3);

TIERS.forEach((t, i) => {
  const p = POWER[i];
  for (const e of EQUIP_TYPES) {
    const st = e.stats;
    const value = Math.round(e.mats.reduce((v, [m, q]) => v + matCost(m, i) * q, 0) * 1.5);
    item(`${t.id}_${e.key}`, `${t.metal}${SP}${e.name}`, TOOL_SLOTS.includes(e.slot) ? 'tool' : 'gear', value, {
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
  { gem: 'sapphire', name: tl('蓝宝石'), level: 40, power: 8, bar: 'titanium_bar' },
  { gem: 'ruby', name: tl('红宝石'), level: 55, power: 13, bar: 'runic_bar' },
  { gem: 'diamond', name: tl('钻石'), level: 70, power: 20, bar: 'meteor_bar' },
];
for (const j of JEWELS) {
  item(`${j.gem}_ring`, tl`${j.name}戒指`, 'gear', 200 + j.power * 40, { equip: { slot: 'ring', skill: 'hitpoints', level: j.level, attack: j.power, strength: 0, defence: 0 } });
  item(`${j.gem}_amulet`, tl`${j.name}项链`, 'gear', 220 + j.power * 40, { equip: { slot: 'neck', skill: 'hitpoints', level: j.level, attack: 0, strength: j.power, defence: 0 } });
}

/** 坐骑：测试服兑换码「中国人能飞」领取（用户 10-23 要求，名字用户改为 Chinese can fly） */
// 坐骑马（用户 10-24）：畜牧站养大的小马崽，速度资质 50%-200% 随机，每个资质一种物品
item(FOAL, tl('小马崽'), 'misc', 0, { desc: tl('打败野马有几率得到。拿到城镇的畜牧站放进栏里养，大约 1 小时长成坐骑马，养殖等级越高长得越快。成年后才知道它的速度资质。') });
for (let apt = APT_MIN; apt <= APT_MAX; apt++) {
  const c = coatOf(apt);
  item(horseItem(apt), tl`${COAT_NAME[c]}（资质 ${apt}%）`, 'gear', 0, {
    desc: tl`畜牧站养大的${COAT_NAME[c]}，速度资质 ${apt}%：骑乘时移动速度 +${apt}%。资质 50%-200% 随机，资质不同毛色也不一样。`,
    equip: { slot: 'mount', skill: 'hitpoints', level: 1, attack: 0, strength: 0, defence: 0, move: apt / 100 },
  });
}
item('mount_danmark', 'Chinese can fly', 'gear', 0, {
  desc: tl('黑毛银鬃的巨狼，红眼，身上有旧伤疤。骑乘时移动速度 +160%。在「更多」页输入兑换码获得。'),
  equip: { slot: 'mount', skill: 'hitpoints', level: 1, attack: 0, strength: 0, defence: 0, move: 1.6 },
});

const HERB_FOR_TIER = ['green_herb', 'fire_bloom', 'moon_herb', 'silver_leaf', 'flame_heart', 'frost_lotus', 'frost_lotus', 'frost_lotus'];
const FISH_FOR_TIER = ['raw_minnow', 'raw_trout', 'raw_cod', 'raw_eel', 'raw_ghostfish', 'raw_abyssfish', 'raw_abyssfish', 'raw_abyssfish'];
const ENH_FOR_TIER = ['enh_basic', 'enh_basic', 'enh_mid', 'enh_mid', 'enh_mid', 'enh_high', 'enh_high', 'enh_legend'];

// ---- 精英和首领的战利品（用户 10-23）：福袋、宝箱、首领宝藏能打开；首领还有专属战利品和战旗 ----
const BAG_NAME = [tl('粗布福袋'), tl('麻布福袋'), tl('红绸福袋'), tl('锦绣福袋'), tl('祥云福袋'), tl('紫金福袋'), tl('龙鳞福袋'), tl('天官福袋')];
const CHEST_NAME = [tl('旧木宝箱'), tl('铁皮宝箱'), tl('铜扣宝箱'), tl('银边宝箱'), tl('金饰宝箱'), tl('秘银宝箱'), tl('龙骨宝箱'), tl('星辉宝箱')];
/** 每个首领掉的专属战利品，名字跟着首领走 */
const BOSS_TROPHY: Record<string, [string, string]> = {
  slime_king: [tl('史莱姆王冠核'), tl('史莱姆王体内那颗会发光的核，软软弹弹的。')],
  rat_king: [tl('鼠王金牙'), tl('鼠王嘴里镶的金牙，不知道从哪偷来的。')],
  copper_tortoise: [tl('铜甲龟壳片'), tl('一片泛着铜绿的厚龟甲。')],
  mushroom_queen: [tl('女王菌冠'), tl('蘑菇女王头顶的伞盖，还在慢慢冒孢子。')],
  isle_eel: [tl('鳗王电鳍'), tl('摸上去还会轻轻发麻。')],
  bandit_king: [tl('山贼金印'), tl('山贼头子用来盖「借条」的金印。')],
  sand_wyrm: [tl('沙虫利齿'), tl('一排倒钩似的牙，咬住就不松口。')],
  ape_king: [tl('猿王金箍'), tl('竹海猿王戴在头上的金箍。')],
  magma_tortoise: [tl('熔岩龟甲'), tl('摸着还是烫的。')],
  drowned_captain: [tl('船长罗盘'), tl('指针永远指向海底沉船的方向。')],
  salt_crab: [tl('盐晶巨钳'), tl('整只钳子结满了盐晶。')],
  croc_king: [tl('鳄王獠牙'), tl('比手臂还长的獠牙。')],
  scorpion_queen: [tl('蝎后毒针'), tl('针尖上还挂着一滴毒液。')],
  meteor_colossus: [tl('陨星之心'), tl('陨星巨像胸口那块还在发烫的陨石。')],
  spore_mother: [tl('菌母孢核'), tl('菌母孕育孢子的核心。')],
  tide_guardian: [tl('潮汐之眼'), tl('盯着它看久了能听到浪声。')],
  mire_hydra: [tl('九头蛇鳞'), tl('九头蛇身上最硬的一片鳞。')],
  ice_wyrm: [tl('冰渊寒髓'), tl('一团永远不会化的寒冰。')],
  treant_king: [tl('远古树心'), tl('远古树王的心材，年轮数不清。')],
  bone_dragon: [tl('骸龙头骨碎片'), tl('骸骨龙额头上的一块骨片。')],
  magma_titan: [tl('熔核碎片'), tl('熔核泰坦体内的熔核碎块。')],
  crystal_dragon: [tl('晶龙之鳞'), tl('一片会折射彩光的龙鳞。')],
  abyss_lord: [tl('深渊王冠'), tl('深渊之主的王冠，冷得刺骨。')],
  star_devourer: [tl('星渊之瞳'), tl('瞳孔里像装着一整片星空。')],
  lion_king: [tl('金鬃'), tl('金鬃狮王的一绺鬃毛，在阳光下闪着金光。')],
  python_mother: [tl('蛇母之卵'), tl('一颗没孵化的巨蛇卵，壳上有花纹。')],
  sandstorm_king: [tl('沙暴之翼'), tl('沙暴之王的一片翅膜，薄得透光。')],
  crystal_sovereign: [tl('主宰晶冠'), tl('晶簇主宰头顶的晶冠。')],
  // 世界首领
  wb_flame_dragon: [tl('炎煌逆鳞'), tl('炎煌古龙喉下那片倒长的鳞，烫得握不住。')],
  wb_soul_tree: [tl('噬魂树心'), tl('噬魂魔树的树心，里面困着一团团魂火。')],
  wb_frost_colossus: [tl('永冬之核'), tl('永冬巨像胸口的冰核，周围的空气都会结霜。')],
  wb_thunder_roc: [tl('天罚雷翎'), tl('天罚雷鹏的尾翎，一直噼啪冒着电火花。')],
  wb_void_eye: [tl('虚无晶瞳'), tl('虚无魔眼的晶体瞳孔，盯着它看会头晕。')],
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
      tier: t, desc: tl('精英和首领身上搜出来的福袋，打开能得到金币和一把同阶材料。'),
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
      tier: t, desc: tl('精英和首领守着的宝箱，里面有锭、宝石、强化石，运气好有本阶装备。'),
      opens: { coins: [v * 6, v * 15], rolls: 3, pool: pick([
        { item: `${T.id}_bar`, min: 2, max: 5, w: 4 }, { item: `core_${n}`, min: 1, max: 3, w: 3 },
        { item: GEM_FOR_TIER[t], min: 1, max: 1, w: 1.5 }, { item: ENH_FOR_TIER[t], min: 1, max: 2, w: 1.5 },
        { item: `luckybag_${n}`, min: 1, max: 1, w: 2 }, ...gearPool(1.5),
      ]) },
    });
    item(`bosschest_${n}`, tl`${CHEST_NAME[t].replace(tl('宝箱'), '')}首领宝藏`, 'loot', v * 30, {
      tier: t, desc: tl('只有首领会掉的宝藏，开出本阶装备、宝石、强化石的机会大得多。'),
      opens: { coins: [v * 20, v * 50], rolls: 5, pool: pick([
        { item: `${T.id}_bar`, min: 4, max: 10, w: 3 }, { item: `core_${n}`, min: 2, max: 5, w: 3 },
        { item: GEM_FOR_TIER[t], min: 1, max: 2, w: 2.5 }, { item: ENH_FOR_TIER[t], min: 1, max: 3, w: 2.5 },
        { item: `chest_${n}`, min: 1, max: 1, w: 1.5 }, { item: `luckybag_${n}`, min: 1, max: 2, w: 2 },
        ...gearPool(4),
      ]) },
    });
  });
  for (const sp of SPECIES) {
    if (sp.rank !== 'boss' || sp.event) continue;
    const [tn, td] = BOSS_TROPHY[sp.id] ?? [tl`${sp.name}之证`, tl('击败首领的凭证。')];
    item(`trophy_${sp.id}`, tn, 'loot', BAR_VALUE[sp.tier] * 20, { tier: sp.tier, boss: sp.id, desc: tl`${td}击败「${sp.name}」才能得到，能卖个好价钱。` });
    item(`banner_${sp.id}`, tl`${sp.name}战旗`, 'deco', BAR_VALUE[sp.tier] * 50, {
      tier: sp.tier, boss: sp.id, desc: tl`「${sp.name}」的专属战旗，极少掉落。装饰品，收集齐全部首领战旗是一份荣誉。`,
    });
  }
}

/** 世界首领的宝库（用户 10-24）：必掉，开出大量锭、宝石、强化石、珍材和首领宝藏。传说装备先不出，留到以后。 */
for (const sp of SPECIES.filter((x) => x.world)) {
  const t = tierForLevel(sp.level);
  const n = t + 1;
  const T = TIERS[t];
  item(`worldchest_${sp.id}`, tl`${sp.name}的宝库`, 'loot', BAR_VALUE[t] * 80, {
    tier: t, boss: sp.id, desc: tl`击败世界首领「${sp.name}」必掉的宝库，开出大量锭、宝石、强化石、珍材和首领宝藏。`,
    opens: { coins: [BAR_VALUE[t] * 60, BAR_VALUE[t] * 150], rolls: 6, pool: [
      { item: `${T.id}_bar`, min: 6, max: 15, w: 3 }, { item: `core_${n}`, min: 3, max: 8, w: 3 },
      { item: GEM_FOR_TIER[t], min: 1, max: 3, w: 2.5 }, { item: ENH_FOR_TIER[t], min: 2, max: 4, w: 2.5 },
      { item: `bosschest_${n}`, min: 1, max: 2, w: 2 }, { item: `chest_${n}`, min: 1, max: 2, w: 2 },
      ...MAT_LINE_IDS.map((l) => ({ item: `${l}_${n}`, min: 5, max: 12, w: 1 })),
    ] },
  });
}

// 万圣节活动（用户 10-24）：南瓜礼盒开出南瓜积分；积分直接进仓库，活动结束前拿去兑换（兑换商店后续开放）
item(HW_POINT, tl('南瓜积分'), 'misc', 0, { desc: tl('万圣节活动积分，开南瓜礼盒得到，直接存进仓库。活动结束前可以拿去兑换限定物品（兑换商店即将开放）。') });
item(HW_BOX, tl('南瓜礼盒'), 'loot', 0, {
  tier: 0, desc: tl('击败万圣节限定首领「南瓜王」得到的礼盒，打开得南瓜积分和一些金币。难度越高给的礼盒越多。'),
  opens: { coins: [80, 240], rolls: 1, pool: [{ item: HW_POINT, min: 8, max: 15, w: 1 }] },
});

// 装备和工具的品质（用户 10-25）：每件装备再生成 5 个品质版本，属性和价格按品质放大；普通版名字也带「普通·」
for (const it of itemList.filter((x) => x.equip && !x.equip.move)) {
  const base = { ...it, equip: { ...it.equip! } };
  for (let q = 0; q < QUALITY_NAME.length; q++) {
    const e = base.equip;
    const def: ItemDef = {
      ...base, id: qid(base.id, q), name: tl`${QUALITY_NAME[q]}·${base.name}`, value: Math.round(base.value * QUALITY_VALUE[q]), quality: q, baseName: base.name,
      equip: {
        ...e, attack: Math.round(e.attack * QUALITY_STAT[q]), strength: Math.round(e.strength * QUALITY_STAT[q]), defence: Math.round(e.defence * QUALITY_STAT[q]),
        speed: e.speed ? Math.round(e.speed * QUALITY_SPEED[q] * 1000) / 1000 : undefined,
      },
    };
    if (q === 0) Object.assign(it, def);
    else itemList.push(def);
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
  dragon: 3000, humanoid: 2600, undead: 2800, golem: 3400, spirit: 2400, plant: 3200, eye: 2800, aquatic: 2600,
};

/** 最外圈每个群系的默认特产材料 */
const OUTER_MAT: Partial<Record<RegionId, MatLine>> = {
  hills: 'spice', vineisles: 'resin', moonmire: 'resin', archipelago: 'crystal', frostpeak: 'crystal', thunder: 'crystal', ashcape: 'spice', starsea: 'crystal',
};
function speciesDrops(sp: Species, idx: number): Drop[] {
  const t = sp.tier;
  const n = t + 1;
  const T = TIERS[t];
  const k = RANK_LOOT[sp.rank];
  const fam = FORM_FAMILY[sp.form];
  const d: Drop[] = [{ item: 'coins', qty: Math.round(sp.level * 3 * (sp.rank === 'boss' ? 12 : sp.rank === 'elite' ? 3 : 1)) }];
  const add = (item: string, qty: number, chance?: number) => d.push(chance === undefined || chance >= 1 ? { item, qty } : { item, qty, chance });
  // 野马：有几率掉小马崽
  if (sp.horse) add(FOAL, 1, FOAL_CHANCE[sp.rank]);
  // 南瓜王：只掉南瓜礼盒（数量看难度）和金币
  if (sp.event) {
    add(HW_BOX, HW_TIERS[hwTierOf(sp.id)].boxes);
    return d;
  }
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
  if (fam === 'dragon') add(T.ore, 2 * k, 0.3);
  if (fam === 'serpent' && sp.form === 'worm') add(T.ore, k, 0.25);
  // 最外圈的新生物掉本群系的特产材料（晶石、香料、树脂、羽毛），接上珍材坊的加工链（10-24）
  if (sp.outer) {
    const line: MatLine = fam === 'bird' || sp.form === 'moth' ? 'feather' : fam === 'plant' || fam === 'insect' ? 'resin'
      : fam === 'golem' || fam === 'spirit' || fam === 'aquatic' ? 'crystal' : OUTER_MAT[sp.region] ?? 'spice';
    add(`${line}_${n}`, sp.rank === 'normal' ? 1 : 2 * k, sp.rank === 'normal' ? 0.25 : 1);
  }
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
  // 世界首领：必掉宝库，战利品和战旗比普通首领好拿（传说装备用户 10-24 说先不出，留到以后）
  if (sp.world) {
    add(`worldchest_${sp.id}`, 1);
    add(GEM_FOR_TIER[t], 2, 0.6);
    add(`trophy_${sp.id}`, 1, 0.6);
    add(`banner_${sp.id}`, 1, 0.06);
    add(ENH_FOR_TIER[t], 2, 0.5);
    add(`bosschest_${n}`, 1, 0.6);
    return d;
  }
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
  // 世界首领：血量再 ×4（约同级普通怪的 40 倍），伤害、防御各 +15%
  if (sp.world) hp *= 4;
  if (sp.event) hp *= 1.6;
  let ms = FAMILY_MS[fam] + (sp.rank === 'boss' ? 400 : 0);
  if (tr.has('swift')) ms *= 0.75;
  if (tr.has('slow')) ms *= 1.25;
  return {
    id: sp.id, name: sp.name, level: L, tier: sp.tier, rank: sp.rank, boss: sp.rank === 'boss' || undefined,
    family: fam, form: sp.form, region: sp.region, traits: sp.traits, kind: isAnimal(fam, sp.form) ? 'creature' : 'monster',
    hp: Math.round(hp),
    // 攻击值跟着同阶护甲一起涨，不然高阶护甲会让怪物几乎打不中
    attack: Math.round(((L + 8) * (1 + (1.6 * POWER[tierForLevel(L)]) / 64) - 8) * RANK_POW[sp.rank]),
    defence: Math.round(L * RANK_POW[sp.rank] * (tr.has('armored') ? 1.4 : 1) * (sp.world ? 1.15 : 1)),
    maxHit: tr.has('passive') ? 0 : Math.max(1, Math.round(0.025 * refHp(L) * (ms / 1000) * RANK_HIT[sp.rank] * (tr.has('fierce') ? 1.25 : 1) * (sp.world ? 1.15 : 1))),
    attackMs: Math.round(ms / 100) * 100,
    // 世界首领倒下后 2 分钟才重新出现
    respawnMs: sp.world ? 120_000 : sp.event ? 3000 : (sp.rank === 'boss' ? 6000 : sp.rank === 'elite' ? 3000 : 1500) * (tr.has('pack') ? 0.5 : 1),
    drops: speciesDrops(sp, idx),
    art: { color: sp.color, accent: sp.accent },
    ...(sp.world ? { world: true } : {}),
    ...(sp.event ? { event: true } : {}),
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
  id: 'dummy', name: tl('稻草人'), level: 1, tier: 0, rank: 'normal', family: 'plant', form: 'mandrake', region: 'town', traits: ['passive'], kind: 'monster',
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
  gather(`cotton_${t + 1}${suffix}`, tl('棉花'), 'gathering', TIERS[t].level, [one(`cotton_${t + 1}`), { item: `cotton_${t + 1}`, qty: 1, chance: 0.2 }, wildSeed(t, t)], { tool: 'sickle' });
const hunt = (t: number, suffix = '') =>
  gather(`hunt_${t + 1}${suffix}`, tl('兽皮'), 'hunting', TIERS[t].level, [one(`hide_${t + 1}`), { item: 'bones', qty: 1, chance: 0.3 }]);
const fishAt = (fish: string, suffix = '') => {
  const f = FISH.find((x) => x[0] === fish)!;
  return gather(`fish_${fish}${suffix}`, f[1], 'fishing', f[2], [one(`raw_${fish}`)]);
};
const herb = (id: string, suffix = '') => {
  const h = HERBS.find((x) => x[0] === id)!;
  return gather(`gather_${id}${suffix}`, tl`采集${h[1]}`, 'gathering', h[2], [one(id), { item: id, qty: 1, chance: 0.2 }, wildSeed(tierForLevel(h[2]), h[2])], { tool: 'sickle' });
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
/**
 * 地块制种田（用户 10-23 改成星露谷那样一格一格地种，取消排队种地）：
 * 种一格耗 1 颗种子，按现实时间长大（离线也长），浇过水快 25%；
 * 收获 2-3 个作物，80% 收回种子、25% 多收一颗、1% 变异出下一种作物的种子。
 * 一整块田种满时每小时经验和原来排队种地差不多，但种下后可以去干别的。
 */
export interface CropDef { id: string; name: string; level: number; tier: number; xp: number; outputs: Drop[]; growMs: number }
export const CROP_DEFS: Record<string, CropDef> = {};
CROPS.forEach(([id, name, lvl], i) => {
  const next = CROPS[i + 1];
  CROP_DEFS[id] = {
    id, name, level: lvl, tier: tierForLevel(lvl),
    // 田从 56 格减到 24 格（10-23），每格经验相应提高，种满一块田每小时经验不变
    xp: Math.round(xpFor(lvl) * tierTime(lvl) * 2 * 56 / 24),
    growMs: Math.round(6 * 60_000 * tierTime(lvl)),
    outputs: [
      one(id, 2), { item: id, qty: 1, chance: 0.3 },
      { item: `seed_${id}`, qty: 1, chance: 0.8 }, { item: `seed_${id}`, qty: 1, chance: 0.25 },
      ...(next ? [{ item: `seed_${next[0]}`, qty: 1, chance: 0.01 }] : []),
    ],
  };
});
/** 浇过水的作物长得快多少 */
export const WATER_SPEEDUP = 0.25;
const steal = (id: string, name: string, level: number, coins: number, extra: Drop[] = []) =>
  gather(`steal_${id}`, name, 'thieving', level, [one('coins', coins), ...extra], {
    ms: 2500 + level * 15, fail: { chance: 0.5, noFailLevel: level + 30, stunMs: 4000 },
  });

// 生产动作：采集 → 加工（锭 / 板材 / 皮革 / 布料）→ 制作装备
TIERS.forEach((t, i) => {
  const lvl = t.level;
  const n = i + 1;
  // 加工
  make(`smelt_${t.id}`, i === 0 ? tl('打磨硬木锭') : tl`冶炼${t.metal}锭`, 'smithing', lvl,
    i === 0 ? [one('plain_log', 2), one('stone')] : [one(t.ore, 2)], [one(`${t.id}_bar`)], 0.8);
  make(`plank_${n}`, tl`${isEn ? t.woodName.replace(/ ?Log$/, '') : t.woodName}板材`.trim(), 'fletching', lvl, [one(`${t.wood}_log`, 2)], [one(`plank_${n}`)], 0.8);
  make(`tan_${n}`, tl('鞣制皮革'), 'crafting', lvl, [one(`hide_${n}`, 2)], [one(`leather_${n}`)], 0.8);
  make(`weave_${n}`, tl('纺织布料'), 'crafting', lvl, [one(`cotton_${n}`, 2)], [one(`cloth_${n}`)], 0.8);
  // 装备
  const prefix = { smithing: 'smith', fletching: 'fletch', crafting: 'craft' } as Record<SkillId, string>;
  for (const e of EQUIP_TYPES) {
    const id = `${t.id}_${e.key}`;
    const inputs = e.mats.map(([m, q]) => one(matItem(m, i), q));
    const qty = inputs.reduce((a, x) => a + x.qty, 0);
    make(`${prefix[e.maker]}_${id}`, ITEMS[id].name, e.maker, lvl + e.plus, inputs, [one(id)], Math.max(1, qty * 0.8));
  }
  // 弹药
});

for (const j of JEWELS) {
  const inputs = [one(j.bar), one(j.gem)];
  make(`craft_${j.gem}_ring`, ITEMS[`${j.gem}_ring`].name, 'crafting', j.level, inputs, [one(`${j.gem}_ring`)], 2);
  make(`craft_${j.gem}_amulet`, ITEMS[`${j.gem}_amulet`].name, 'crafting', j.level + 2, inputs, [one(`${j.gem}_amulet`)], 2);
}

for (const [fish, name, lvl] of FISH) {
  actionList.push({
    id: `cook_${fish}`, kind: 'skill', name: tl`烤${name}`, skill: 'cooking', level: lvl, durationMs: Math.round(2500 * tierTime(lvl)), xp: Math.round(xpFor(lvl) * tierTime(lvl)),
    inputs: [one(`raw_${fish}`)], outputs: [one(fish)], fail: { chance: 0.4, noFailLevel: lvl + 20 },
  });
}
make('craft_fert_basic', tl('普通肥料'), 'farming', 5, [one('green_herb', 2), one('raw_minnow')], [one('fert_basic', 3)]);
make('craft_fert_rich', tl('高级肥料'), 'farming', 30, [one('fert_basic', 3), one('core_2')], [one('fert_rich', 2)]);
make('smith_sprinkler', tl('洒水器'), 'smithing', 20, [one('tin_bar', 4), one('plank_2', 2)], [one('sprinkler')]);
make('cook_potato', tl('烤土豆'), 'cooking', 1, [one('potato')], [one('baked_potato')]);
make('cook_bread', tl('烤面包'), 'cooking', 8, [one('wheat', 2)], [one('bread')]);
for (const [id, , lvl, , dish] of CROPS) if (dish) make(`cook_meal_${id}`, dish, 'cooking', lvl, [one(id, 2)], [one(`meal_${id}`)]);
// 烹饪失败统一得到烧焦的食物
for (const a of actionList) if (a.kind === 'skill' && a.fail && a.skill === 'cooking') a.fail.item = 'burnt_food';

HERBS.forEach(([id, name, lvl], i) => {
  const potionLvl = [1, 8, 20, 28, 36, 45][i];
  make(`brew_${id}`, tl`${name}药水`, 'herblore', potionLvl, [one(id, 2)], [one(`${id}_potion`)], 1.5);
});

make('enhance_basic', tl('初级强化石'), 'enhancing', 1, [one('wood_bar', 2), one('stone', 3)], [one('enh_basic')]);
make('enhance_mid', tl('中级强化石'), 'enhancing', 30, [one('iron_bar', 2), one('sapphire')], [one('enh_mid')], 2);
make('enhance_high', tl('高级强化石'), 'enhancing', 55, [one('runic_bar', 2), one('ruby')], [one('enh_high')], 3);
make('enhance_legend', tl('传说强化石'), 'enhancing', 95, [one('adamant_bar', 2), one('diamond')], [one('enh_legend')], 4);
// 打怪掉落的闭环：兽肉 → 烤兽肉（战斗食物），魔核 + 骨头 → 强化石
TIERS.forEach((t, i) => {
  const n = i + 1;
  make(`cook_meat_${n}`, tl`烤兽肉 ${tierName(i)}`, 'cooking', t.level, [one(`meat_${n}`)], [one(`steak_${n}`)]);
  const enh = ['enh_basic', 'enh_basic', 'enh_mid', 'enh_mid', 'enh_mid', 'enh_high', 'enh_high', 'enh_legend'][i];
  make(`enhance_core_${n}`, tl`魔核淬炼 ${tierName(i)}`, 'enhancing', t.level, [one(`core_${n}`, 3), one('bones', 5)], [one(enh)], 1 + i * 0.3);
});

// ---- 料理（用户 10-22 要求）：鱼 + 配菜，回血更多，吃下后有限时增益 ----
// 增益随阶级变强、持续更久；同类增益只保留一个（新吃的覆盖旧的）
export const BUFF_NAME: Record<BuffKind, string> = { atk: tl('命中'), str: tl('最高伤害'), def: tl('防御'), speed: tl('干活速度'), xp: tl('获得经验') };
const BUFF_BASE: Record<BuffKind, number> = { atk: 0.04, str: 0.04, def: 0.05, speed: 0.03, xp: 0.04 };
export const buffText = (b: Buff) => tl`${BUFF_NAME[b.kind]} +${Math.round(b.pct * 100)}%，持续 ${Math.round(b.ms / 60000)} 分钟`;
type Side = { item: string; qty: number; name: (fish: string) => string; kind: BuffKind; note: string };
const SIDES: Side[][] = [
  [
    { item: 'potato', qty: 1, name: (f) => tl`${f}土豆饼`, kind: 'def', note: tl('煎得外脆里软，吃了扛揍') },
    { item: 'wheat', qty: 1, name: (f) => tl`${f}麦饼`, kind: 'speed', note: tl('揣在怀里边干活边吃') },
    { item: 'green_herb', qty: 1, name: (f) => tl`绿叶${f}汤`, kind: 'xp', note: tl('清汤提神，学东西更快') },
    { item: 'meat_1', qty: 1, name: (f) => tl`${f}兽肉串`, kind: 'str', note: tl('鱼肉兽肉一起烤，越吃越有劲') },
  ],
  [
    { item: 'wheat', qty: 2, name: (f) => tl`香煎${f}`, kind: 'atk', note: tl('裹上麦粉煎，吃完手稳') },
    { item: 'fire_bloom', qty: 1, name: (f) => tl`火绒${f}汤`, kind: 'str', note: tl('辣得冒汗，力气大增') },
    { item: 'potato', qty: 2, name: (f) => tl`${f}炖土豆`, kind: 'def', note: tl('一锅炖到软烂，扛饿又扛打') },
    { item: 'meat_2', qty: 1, name: (f) => tl`${f}兽肉卷`, kind: 'speed', note: tl('一卷到底，路上就能吃完') },
  ],
  [
    { item: 'moon_herb', qty: 1, name: (f) => tl`月露${f}羹`, kind: 'xp', note: tl('月露草的清香让人头脑清明') },
    { item: 'wheat', qty: 2, name: (f) => tl`${f}馅饼`, kind: 'speed', note: tl('冰原旅人的干粮') },
    { item: 'meat_3', qty: 1, name: (f) => tl`${f}肉排`, kind: 'str', note: tl('厚切煎排，饱腹又长力气') },
    { item: 'potato', qty: 2, name: (f) => tl`奶油${f}浓汤`, kind: 'def', note: tl('一碗下肚浑身暖和') },
  ],
  [
    { item: 'silver_leaf', qty: 1, name: (f) => tl`银叶清蒸${f}`, kind: 'atk', note: tl('银叶草去腥，吃完眼明手快') },
    { item: 'meat_4', qty: 1, name: (f) => tl`${f}兽肉锅`, kind: 'str', note: tl('沼泽猎人的大锅菜') },
    { item: 'wheat', qty: 3, name: (f) => tl`${f}面包盒`, kind: 'speed', note: tl('携带方便，一口一个') },
    { item: 'moon_herb', qty: 1, name: (f) => tl`${f}药膳`, kind: 'xp', note: tl('药材与鱼同炖，滋补提神') },
  ],
  [
    { item: 'flame_heart', qty: 1, name: (f) => tl`炎心烤${f}`, kind: 'str', note: tl('炎心花的火气全进了肉里') },
    { item: 'frost_lotus', qty: 1, name: (f) => tl`冰莲${f}刺身`, kind: 'atk', note: tl('冰镇切片，入口清冽') },
    { item: 'meat_5', qty: 1, name: (f) => tl`${f}海陆拼盘`, kind: 'def', note: tl('一盘吃两样，耐打耐磨') },
    { item: 'wheat', qty: 3, name: (f) => tl`${f}三明治`, kind: 'speed', note: tl('海边渔夫最爱的午饭') },
  ],
  [
    { item: 'frost_lotus', qty: 1, name: (f) => tl`冰火${f}`, kind: 'def', note: tl('熔岩鱼配冰莲，冷热交替') },
    { item: 'meat_6', qty: 1, name: (f) => tl`熔岩${f}烧肉`, kind: 'str', note: tl('在热石上烤出来的') },
    { item: 'flame_heart', qty: 1, name: (f) => tl`炎心${f}汤`, kind: 'atk', note: tl('喝完全身发热，出手更准') },
    { item: 'silver_leaf', qty: 2, name: (f) => tl`银叶${f}卷`, kind: 'xp', note: tl('清爽解腻，越吃越精神') },
  ],
  [
    { item: 'meat_7', qty: 1, name: (f) => tl`${f}王者烤`, kind: 'str', note: tl('只有高手钓得到、烤得好') },
    { item: 'frost_lotus', qty: 2, name: (f) => tl`冰莲${f}冻`, kind: 'def', note: tl('晶莹剔透，入口即化') },
    { item: 'moon_herb', qty: 2, name: (f) => tl`星露${f}`, kind: 'xp', note: tl('在星光下慢慢收汁') },
    { item: 'flame_heart', qty: 2, name: (f) => tl`雷火${f}`, kind: 'atk', note: tl('吃完手指都在发麻') },
  ],
  [
    { item: 'meat_8', qty: 1, name: (f) => tl`${f}深渊宴`, kind: 'str', note: tl('深渊之物做的盛宴') },
    { item: 'frost_lotus', qty: 2, name: (f) => tl`${f}冰莲御膳`, kind: 'def', note: tl('王都御厨的手艺') },
    { item: 'flame_heart', qty: 2, name: (f) => tl`炎心${f}`, kind: 'atk', note: tl('烈火灼烧出的极致鲜味') },
    { item: 'silver_leaf', qty: 2, name: (f) => tl`${f}长生汤`, kind: 'xp', note: tl('传说喝了能长生，至少能学得快') },
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
    desc: tl`${side.note}。烹饪 ${level} 级，用生${fname}和${ITEMS_NAME(side.item)}×${side.qty}做成。回复 ${Math.round(heals * 1.35)} 生命；吃下后${buffText(buff)}。`,
  });
  make(`cook_${id}`, name, 'cooking', level, [one(`raw_${fish}`), one(side.item, side.qty)], [one(id)], 1.4);
});
// 外圈新鱼的海味料理（用户 10-24）：生鱼 + 同阶香料，带增益
const SEA_BUFF: BuffKind[] = ['def', 'atk', 'speed', 'str', 'xp', 'def', 'atk', 'str', 'xp'];
SEA_FISH.forEach(([fish, fname, lvl, heals], k) => {
  const t = fishTier(lvl);
  const kind = SEA_BUFF[k];
  const buff: Buff = { kind, pct: Math.round((BUFF_BASE[kind] * 1.3 + t * 0.012) * 100) / 100, ms: (15 + t * 3) * 60000 };
  const id = `dish_${fish}`;
  const name = tl`香煎${fname}`;
  const level = lvl + 3;
  item(id, name, 'food', Math.round((4 + lvl * 1.4) * 2.8), {
    tier: t, heals: Math.round(heals * 1.4), buff,
    desc: tl`外圈新鱼的海味做法。烹饪 ${level} 级，用生${fname}和${MAT_LINES.spice.names[t]}做成。回复 ${Math.round(heals * 1.4)} 生命；吃下后${buffText(buff)}。`,
  });
  make(`cook_${id}`, name, 'cooking', level, [one(`raw_${fish}`), one(`spice_${t + 1}`)], [one(id)], 1.5);
});
// 每阶一道宴席：两种鱼 + 兽肉 + 配菜，同时给两种增益里更强的那种（攻防兼顾的放在力量和防御轮换）
const FEASTS: [string, BuffKind][] = [[tl('渔家小宴'), 'def'], [tl('溪谷全鱼宴'), 'atk'], [tl('冰原围炉宴'), 'xp'], [tl('沼泽猎人宴'), 'str'], [tl('金沙海鲜宴'), 'speed'], [tl('熔岩烧烤宴'), 'str'], [tl('星光盛宴'), 'atk'], [tl('龙渊御宴'), 'xp']];
FEASTS.forEach(([name, kind], t) => {
  const [a, b] = [NEW_FISH[t * 4], NEW_FISH[t * 4 + 2]];
  const lvl = Math.max(a[2], b[2]) + 4;
  const heals = Math.round((a[3] + b[3]) * 0.9);
  const buff: Buff = { kind, pct: Math.round((BUFF_BASE[kind] * 1.6 + t * 0.016) * 100) / 100, ms: (20 + t * 4) * 60000 };
  const id = `feast_${t + 1}`;
  item(id, name, 'food', Math.round((a[2] + b[2]) * 4), {
    tier: t, heals, buff,
    desc: tl`用${a[1]}、${b[1]}和兽肉摆的一桌。烹饪 ${lvl} 级。回复 ${heals} 生命；吃下后${buffText(buff)}，比单道料理更强更久。`,
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
    tier: i, heals, buff, desc: tl`兽肉用${MAT_LINES.spice.names[i]}腌过再烤。烹饪 ${lvl} 级，在落霞城珍材坊做。回复 ${heals} 生命；吃下后${buffText(buff)}。`,
  });
  make(`rare_cook_${n}`, SPICE_DISH[i], 'cooking', lvl, [one(`meat_${n}`), one(`spice_${n}`, 2)], [one(id)], 1.6);
});
// 料理物品定义在 ITEMS 建好之后，补登记进去
for (const it of itemList) ITEMS[it.id] ??= it;

const filterIds = (prefix: string) => actionList.filter((a) => a.id.startsWith(prefix)).map((a) => a.id);

// ---- 地图点位 ----

export type NodeSprite =
  | 'ore' | 'tree' | 'fish' | 'herb' | 'camp' | 'boss' | 'anvil' | 'furnace' | 'stove' | 'bench' | 'bowyer' | 'potion' | 'enhance'
  | 'market' | 'farm' | 'bank' | 'dummy' | 'cave' | 'atelier' | 'waystone' | 'portal' | 'worldboss' | 'altar' | 'ranch' | 'salvage';

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
  /** 分解台：分解仓库里的装备换金币 */
  salvage?: boolean;
  /** 5088 大地图新增的特色地点：自带一片地貌、专属生物和首领，地图上标大字地名（用户 10-23） */
  site?: { kind: SiteKind; r: number };
  /** 大型洞窟入口（用户 10-23：先占位，以后开放） */
  cave?: boolean;
  /** 暂未开放的建筑（用户 10-23：强化台先不开放） */
  closed?: boolean;
  /** 海上的岛（用户 10-24：水路先不开放，以后做航行系统），走不到，动作和怪物都暂时用不了 */
  sea?: boolean;
  /** 世界首领的巢穴（用户 10-24）：地图上红色骷髅头标记 */
  world?: boolean;
  /** 活动祭坛（万圣节）：点了选难度召唤南瓜王，不刷野怪 */
  event?: boolean;
  /** 田地：能种哪几阶的作物（地块制种田） */
  farm?: number[];
  /** 传说石碑：传送点 */
  waystone?: boolean;
  /** 家园传送门：进家园岛屿 */
  portal?: boolean;
  /** 12080 新城镇里的点位（城镇布局自己管地面，不用清空地） */
  townId?: string;
}
export type SiteKind = 'islands' | 'bamboo' | 'saltflat' | 'crater' | 'fungal' | 'glacier' | 'obsidian' | 'starabyss'
  | 'oasis' | 'mesa' | 'atoll' | 'crystalheart'
  // 12080 最外圈（10-24）
  | 'terraces' | 'sunkenwood' | 'vineheart' | 'frostbay' | 'aurora' | 'thunderrift' | 'paleshore' | 'holyreef' | 'fjord' | 'starfall' | 'eclipse';


/** 野外点位的等级范围直接取它所有动作的最低和最高等级 */
const wild = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode => {
  const lvls = actions.map((a) => actionList.find((x) => x.id === a)!.level);
  return { id, name, ...at(u, v), region, lv: [Math.min(...lvls), Math.max(...lvls)], sprite, actions, pond };
};
/** 外圈新区域的点位 */
const ring = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode =>
  ({ ...wild(id, name, 0, 0, region, sprite, actions, pond), ...atW(u, v) });
/** 12080 最外圈新群系的点位（整张地图的相对坐标） */
const band = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode =>
  ({ ...wild(id, name, 0, 0, region, sprite, actions, pond), ...atF(u, v) });
/** 洞窟入口：暂时没有内容 */
const cave = (id: string, name: string, pos: { x: number; y: number }, region: RegionId): MapNode =>
  ({ id, name, ...pos, region, lv: [0, 0], sprite: 'cave', actions: [], cave: true });

const site = (n: MapNode, kind: SiteKind, r: number): MapNode => ({ ...n, site: { kind, r } });
/** 世界首领的巢穴：只有一只世界首领，没有资源 */
const lair = (id: string, name: string, x: number, y: number, region: RegionId): MapNode =>
  ({ id, name, x, y, region, lv: [1, 1], sprite: 'worldboss', actions: [], world: true });
/** 海岛上的地点：内容先放好，等航行系统开放 */
const isle = (n: MapNode): MapNode => ({ ...n, sea: true, closed: true });

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

/** 新城镇的偷窃目标（集市里） */
const TOWN_STEAL: Record<string, string[]> = {
  fengmai: [steal('miller', tl('偷磨坊主'), 12, 14, [{ item: 'wheat', qty: 3, chance: 0.3 }, { item: 'seed_corn', qty: 1, chance: 0.08 }])],
  yandeng: [steal('lantern_maker', tl('偷灯匠'), 35, 40, [{ item: 'iron_bar', qty: 1, chance: 0.15 }, { item: 'sapphire', qty: 1, chance: 0.02 }])],
  coralport: [steal('sailor', tl('偷水手'), 42, 50, [{ item: 'raw_tuna', qty: 2, chance: 0.2 }]), steal('captain', tl('偷船长'), 65, 100, [{ item: 'ruby', qty: 1, chance: 0.03 }])],
  crystalfort: [steal('crystal_monk', tl('偷晶修士'), 90, 150, [{ item: 'crystal_7', qty: 1, chance: 0.12 }])],
  voidruins: [steal('relic_hunter', tl('偷遗物猎人'), 110, 220, [{ item: 'diamond', qty: 1, chance: 0.03 }, { item: 'crystal_8', qty: 1, chance: 0.1 }])],
};
/** 新城镇里外圈新鱼的钓点 */
const TOWN_FISH: Record<string, string[]> = {
  coralport: [fishAt('harbor_mackerel'), fishAt('squid', '_port'), fishAt('swordfish', '_port')],
  forgotten: [fishAt('moon_catfish', '_walk'), fishAt('swamp_catfish', '_walk'), fishAt('bonefin', '_walk')],
};
const FACILITY_NODE: Record<Facility, () => Pick<MapNode, 'sprite' | 'actions' | 'opens'>> = {
  bank: () => ({ sprite: 'bank', actions: [], opens: 'bank' }),
  market: () => ({ sprite: 'market', actions: [] }),
  smithy: () => ({ sprite: 'anvil', actions: filterIds('smith_') }),
  furnace: () => ({ sprite: 'furnace', actions: filterIds('smelt_') }),
  kitchen: () => ({ sprite: 'stove', actions: filterIds('cook_') }),
  workshop: () => ({ sprite: 'bench', actions: filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_')) }),
  bowyer: () => ({ sprite: 'bowyer', actions: filterIds('plank_').concat(filterIds('fletch_')) }),
  apothecary: () => ({ sprite: 'potion', actions: filterIds('brew_') }),
  atelier: () => ({ sprite: 'atelier', actions: filterIds('rare_') }),
};
/** 一座新城镇的设施点位：每个带 fac 的建筑门口一个，另有家园传送门、码头钓点 */
function townNodes(t: TownDef): MapNode[] {
  const base = { region: t.region, lv: [1, 1] as [number, number], town: true, townId: t.id };
  const out: MapNode[] = t.buildings.filter((bd) => bd.fac).map((bd) => {
    const f = FACILITY_NODE[bd.fac!]();
    return {
      id: `${t.id}_${bd.fac}`, name: tl`${t.name}·${FACILITY_NAME[bd.fac!]}`, ...doorOf(t, bd), ...base, ...f,
      actions: bd.fac === 'market' ? [...(TOWN_STEAL[t.id] ?? [])] : f.actions,
    };
  });
  if (t.portal) out.push({ id: `${t.id}_portal`, name: tl`${t.name}·家园传送门`, ...townAt(t, ...t.portal), ...base, sprite: 'portal', actions: [], portal: true });
  if (t.fish) out.push({ id: `${t.id}_pier`, name: tl`${t.name}·钓鱼栈桥`, ...townAt(t, ...t.fish), ...base, sprite: 'fish', actions: TOWN_FISH[t.id] ?? [] });
  return out;
}

export const NODES: MapNode[] = [
  // 城镇：坐标与 world.ts 里的建筑对齐（建筑门口下方一格）
  town('bank', tl('仓库'), 151, 158, 'bank', [], { opens: 'bank' }),
  town('smithy', tl('铁匠铺'), 174, 158, 'anvil', filterIds('smith_')),
  // 熔炉：炼锭单独一座建筑（用户 10-23），铁匠铺只管打造
  town('furnace', tl('熔炉'), 190, 157, 'furnace', filterIds('smelt_')),
  town('kitchen', tl('灶台'), 184, 158, 'stove', filterIds('cook_')),
  town('workshop', tl('工坊'), 151, 170, 'bench', filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_'))),
  town('bowyer', tl('制弓台'), 159, 170, 'bowyer', filterIds('plank_').concat(filterIds('fletch_'))),
  town('apothecary', tl('药剂铺'), 177, 170, 'potion', filterIds('brew_')),
  town('enhancer', tl('强化台'), 185, 170, 'enhance', filterIds('enhance_'), { closed: true }),
  // 家园传送门（用户 10-23）：进自己的家园岛屿
  town('portal_home', tl('家园传送门'), 169, 184, 'portal', [], { portal: true }),
  town('market', tl('集市'), 155, 182, 'market', [
    steal('farmer', tl('偷农夫'), 1, 3, [{ item: 'potato', qty: 2, chance: 0.3 }, { item: 'seed_potato', qty: 2, chance: 0.2 }, { item: 'seed_carrot', qty: 1, chance: 0.08 }]),
    steal('vendor', tl('偷小贩'), 10, 9, [{ item: 'cotton_1', qty: 2, chance: 0.2 }, { item: 'seed_onion', qty: 1, chance: 0.08 }, { item: 'seed_tomato', qty: 1, chance: 0.05 }]),
    steal('guard', tl('偷守卫'), 25, 22, [{ item: 'iron_bar', qty: 1, chance: 0.1 }]),
    steal('merchant', tl('偷富商'), 40, 45, [{ item: 'sapphire', qty: 1, chance: 0.02 }]),
    steal('noble', tl('偷贵族'), 55, 80, [{ item: 'runic_bar', qty: 1, chance: 0.05 }]),
  ]),
  town('dummy', tl('训练场'), 181, 182, 'dummy', [fight('dummy', tl('打稻草人'))]),
  // 畜牧站（用户 10-24）：养小马崽，长大得到坐骑马
  town(RANCH, tl('畜牧站'), 196, 194, 'ranch', []),
  // 万圣节活动祭坛（用户 10-24）：苍岭城东门外，和城镇在同一块地上
  { id: HW_ALTAR, name: tl('万圣节活动祭坛'), ...townXY(207, 163), region: 'town', lv: [30, 120], sprite: 'altar', actions: [], event: true },
  // 城镇周围的四块田（用户 10-23 要求），每块种两阶作物
  town('farm', tl('城镇农田'), 148, 198, 'farm', [], { farm: [0, 1], lv: [1, 7] }),
  town('farm_south', tl('南郊麦田'), 147, 217, 'farm', [], { farm: [2, 3], lv: [10, 27] }),
  town('farm_east', tl('东郊菜园'), 187, 213, 'farm', [], { farm: [4, 5], lv: [30, 51] }),
  town('farm_west', tl('西岭灵田'), 115, 203, 'farm', [], { farm: [6, 7], lv: [55, 110] }),
  { ...wild('town_lake', tl('镜湖码头'), 0.37, 0.65, 'town', 'fish', [fishAt('minnow'), fishAt('loach'), fishAt('crucian'), fishAt('trout', '_lake')], true), town: true },

  // 巨木森林
  wild('redwood_canopy', tl('雪松冠林'), 0.07, 0.12, 'giantwood', 'tree', [chop(4)]),
  wild('ancient_court', tl('远古白木庭'), 0.25, 0.10, 'giantwood', 'boss', [chop(7), cotton(7, '_court')]),
  wild('moon_garden', tl('月露药圃'), 0.09, 0.28, 'giantwood', 'herb', [herb('moon_herb'), herb('silver_leaf'), cotton(2)]),
  // 幽深林地
  wild('pine_valley', tl('西风松谷'), 0.09, 0.36, 'woodland', 'tree', [chop(2), hunt(1)]),
  wild('birch_brook', tl('桦影溪谷'), 0.08, 0.58, 'woodland', 'fish', [chop(1), fishAt('trout'), fishAt('bighead'), fishAt('catfish')], true),
  wild('maple_slope', tl('落叶长坡'), 0.23, 0.64, 'woodland', 'camp', [chop(0), cotton(1), hunt(0), mat('feather', 0)]),
  wild('moss_pool', tl('幽苔水洼'), 0.08, 0.68, 'woodland', 'fish', [fishAt('minnow', '_moss'), fishAt('grass_carp'), fishAt('perch'), hunt(0, '_moss')], true),
  // 亡者沼泽
  wild('whisper_pool', tl('亡语沉潭'), 0.09, 0.89, 'swamp', 'fish', [fishAt('eel'), fishAt('ghostfish'), fishAt('swamp_catfish'), fishAt('bonefin')], true),
  // 冰封雪原
  wild('lotus_bay', tl('北境冰莲湾'), 0.42, 0.13, 'snow', 'fish', [fishAt('cod'), fishAt('salmon'), fishAt('snow_trout'), fishAt('herring'), herb('frost_lotus'), chop(4, '_bay'), cotton(4)], true),
  wild('snow_plateau', tl('雪绒台地'), 0.53, 0.22, 'snow', 'boss', [mine(6, '_plateau'), cotton(6), hunt(6, '_plateau')]),
  wild('glow_cave', tl('蓝萤洞坡'), 0.49, 0.33, 'snow', 'ore', [mine(2, '_cave')]),
  // 灰岩高地
  wild('dawn_hill', tl('晨曦铜石丘'), 0.67, 0.36, 'highland', 'ore', [mine(0), mine(1)]),
  wild('dragon_rift', tl('精金裂隙'), 0.69, 0.19, 'highland', 'boss', [mine(7), hunt(6)]),
  wild('prism_fault', tl('陨星断层'), 0.79, 0.09, 'highland', 'ore', [mine(6)]),
  wild('gold_ridge', tl('锡砂山脊'), 0.85, 0.21, 'highland', 'ore', [mine(2, '_ridge'), hunt(3, '_ridge')]),
  wild('iron_seam', tl('黑铁矿层'), 0.80, 0.39, 'highland', 'ore', [mine(3)]),
  // 金沙海岸
  wild('mithril_cliff', tl('钛岩峭壁'), 0.88, 0.50, 'coast', 'ore', [mine(4)]),
  wild('oasis', tl('金沙绿洲'), 0.73, 0.50, 'coast', 'fish', [fishAt('carp'), cotton(1, '_oasis'), steal('caravan', tl('偷商队'), 20, 30, [{ item: 'cotton_2', qty: 3, chance: 0.2 }])], true),
  wild('coral_shoal', tl('珊瑚浅滩'), 0.88, 0.65, 'coast', 'fish', [fishAt('shrimp'), fishAt('bass'), fishAt('grouper'), fishAt('lanternfish'), cotton(3, '_shoal')], true),
  // 熔岩荒地
  wild('flame_slope', tl('烈焰花坡'), 0.65, 0.66, 'lava', 'herb', [herb('fire_bloom'), herb('flame_heart'), cotton(3)]),
  wild('obsidian_pool', tl('黑曜熔池'), 0.86, 0.84, 'lava', 'fish', [mine(3, '_pool'), fishAt('lava_eel'), fishAt('magma_shrimp'), fishAt('fire_carp')], true),
  // 深渊裂谷
  wild('abyss_eye', tl('深渊潮眼'), 0.43, 0.92, 'abyss', 'boss', [fishAt('abyssfish'), fishAt('abyss_bass'), fishAt('void_angler'), cotton(7)], true),

  // ---- 1080 大地图新增点位 ----
  // 城郊
  wild('orchard', tl('城郊果园'), 0.56, 0.55, 'town', 'camp', [chop(0, '_orchard'), cotton(0, '_orchard'), herb('green_herb', '_orchard'), mat('spice', 0), mat('resin', 0)]),
  wild('old_pit', tl('老矿坑'), 0.45, 0.40, 'town', 'ore', [mine(0, '_pit'), mine(1, '_pit'), mat('crystal', 0)]),
  // 巨木森林
  wild('mushroom_grove', tl('苔光蘑菇林'), 0.20, 0.30, 'giantwood', 'herb', [herb('moon_herb', '_grove'), chop(3, '_grove'), cotton(4, '_grove')]),
  wild('root_cave', tl('古根洞穴'), 0.05, 0.05, 'giantwood', 'ore', [mine(5, '_root'), chop(5, '_root')]),
  // 幽深林地
  wild('hunter_camp', tl('猎人营地'), 0.28, 0.47, 'woodland', 'camp', [chop(1, '_camp'), hunt(1, '_camp')]),
  wild('forest_ruins', tl('林间废墟'), 0.17, 0.50, 'woodland', 'camp', [chop(3), hunt(2), steal('ruins', tl('翻找废墟'), 30, 35, [{ item: 'sapphire', qty: 1, chance: 0.02 }])]),
  // 亡者沼泽
  wild('rot_ferry', tl('腐沼渡口'), 0.25, 0.80, 'swamp', 'fish', [fishAt('trout', '_ferry'), fishAt('bream'), fishAt('pike'), herb('green_herb', '_ferry'), cotton(2, '_ferry')], true),
  wild('croc_flats', tl('鳄鱼泥滩'), 0.18, 0.96, 'swamp', 'fish', [fishAt('ghostfish', '_flats'), fishAt('stingray'), hunt(4)], true),
  wild('bone_yard', tl('血橡墓园'), 0.31, 0.91, 'swamp', 'boss', [chop(5), cotton(5, '_yard'), steal('grave', tl('盗墓'), 45, 60, [{ item: 'ruby', qty: 1, chance: 0.02 }])]),
  // 深渊裂谷
  wild('dark_vein', tl('符文矿脉'), 0.53, 0.84, 'abyss', 'ore', [mine(5)]),
  wild('abyss_altar', tl('深渊祭坛'), 0.37, 0.82, 'abyss', 'boss', [chop(6, '_altar'), cotton(6, '_altar'), hunt(7, '_altar')]),
  // 熔岩荒地
  wild('ash_outpost', tl('焦土前哨'), 0.58, 0.76, 'lava', 'ore', [mine(3, '_ash')]),
  wild('scorpion_nest', tl('熔岩巨蝎巢'), 0.71, 0.92, 'lava', 'camp', [mine(4, '_nest'), hunt(4, '_nest')]),
  wild('lava_crater', tl('炎王火山口'), 0.80, 0.73, 'lava', 'boss', [mine(7, '_crater'), chop(6), hunt(7)]),
  // 金沙海岸
  wild('wreck_bay', tl('沉船湾'), 0.90, 0.58, 'coast', 'fish', [fishAt('bass', '_wreck'), fishAt('squid'), fishAt('swordfish'), fishAt('tuna'), cotton(5), steal('smuggler', tl('偷走私贩'), 35, 40, [{ item: 'cotton_3', qty: 2, chance: 0.3 }])], true),
  wild('turtle_beach', tl('海龟沙滩'), 0.78, 0.62, 'coast', 'fish', [fishAt('shrimp', '_turtle'), hunt(2, '_turtle')], true),
  // 新鱼获的钓点（用户 10-22 要求加鱼）
  wild('frost_fjord', tl('冰湖峡湾'), 0.33, 0.06, 'snow', 'fish', [fishAt('flounder'), fishAt('sturgeon')], true),
  wild('sulfur_springs', tl('硫磺泉'), 0.93, 0.93, 'lava', 'fish', [fishAt('flame_shark'), fishAt('sulfur_catfish')], true),
  wild('starlight_lake', tl('星光湖'), 0.94, 0.30, 'highland', 'fish', [fishAt('star_ray'), fishAt('crystal_fish')], true),
  wild('phantom_tide', tl('幻潮海崖'), 0.94, 0.45, 'coast', 'fish', [fishAt('phantom_eel'), fishAt('thunder_shark')], true),
  wild('dragon_abyss', tl('龙渊'), 0.55, 0.95, 'abyss', 'fish', [fishAt('dragonfish'), fishAt('starwhale')], true),
  // 灰岩高地
  wild('stone_forest', tl('风蚀石林'), 0.75, 0.32, 'highland', 'ore', [mine(2)]),
  wild('griffin_peak', tl('鹰巢峰'), 0.93, 0.15, 'highland', 'boss', [mine(4, '_peak'), cotton(5, '_peak'), hunt(5)]),
  // 冰封雪原
  wild('tundra_pines', tl('冻原松林'), 0.31, 0.05, 'snow', 'tree', [chop(2, '_tundra'), hunt(3)]),
  wild('ice_cavern', tl('冰晶洞窟'), 0.60, 0.05, 'snow', 'ore', [mine(4, '_cavern'), hunt(5, '_cavern')]),

  // ---- 5088 大地图新增的特色地点（用户 10-23）：每处一片新地貌、2-4 种专属生物和一个首领 ----
  site(wild('isles', tl('千岛湖'), 0.40, 0.66, 'town', 'boss', [fishAt('crucian', '_isles'), fishAt('bighead', '_isles')]), 'islands', 120),
  site(wild('bamboo', tl('雾隐竹海'), 0.07, 0.64, 'woodland', 'boss', [chop(2, '_bamboo'), herb('fire_bloom', '_bamboo')]), 'bamboo', 110),
  site(wild('saltflat', tl('盐晶荒原'), 0.85, 0.43, 'coast', 'boss', [mine(3, '_salt'), cotton(3, '_salt')]), 'saltflat', 120),
  site(wild('crater', tl('碎星陨坑'), 0.84, 0.27, 'highland', 'boss', [mine(4, '_meteor')]), 'crater', 100),
  site(wild('fungal', tl('菌丝深谷'), 0.14, 0.12, 'giantwood', 'boss', [herb('moon_herb', '_fungal'), cotton(4, '_fungal')]), 'fungal', 110),
  site(wild('glacier', tl('冰川裂谷'), 0.47, 0.15, 'snow', 'boss', [mine(5, '_glacier'), hunt(5, '_glacier')]), 'glacier', 120),
  site(wild('obsidian', tl('黑曜火山群'), 0.88, 0.80, 'lava', 'boss', [mine(6, '_obsidian'), hunt(6, '_obsidian')]), 'obsidian', 120),
  site(wild('starabyss', tl('星渊祭坛'), 0.47, 0.80, 'abyss', 'boss', [mine(7, '_star'), cotton(7, '_star')]), 'starabyss', 110),

  // ---- 8848 大地图外圈（用户 10-23）：8 个新区域、新大型城镇落霞城、16 处新地点 ----
  // 落霞城：第二个仓库和集市，珍材坊专做新资源线的东西
  town2('bank2', tl('落霞城·仓库'), -15, -9, 'bank', [], { opens: 'bank' }),
  town2('market2', tl('落霞城·集市'), -14, 12, 'market', [
    steal('caravan_guard', tl('偷驼队护卫'), 30, 35, [{ item: 'spice_3', qty: 2, chance: 0.2 }]),
    steal('spice_merchant', tl('偷香料商'), 50, 70, [{ item: 'spice_5', qty: 2, chance: 0.15 }, { item: 'resin_5', qty: 1, chance: 0.1 }]),
  ]),
  town2('atelier', tl('落霞城·珍材坊'), 14, -9, 'atelier', filterIds('rare_')),
  town2('portal_home2', tl('落霞城·家园传送门'), -7, -2, 'portal', [], { portal: true }),
  town2('smithy2', tl('落霞城·铁匠铺'), -27, 19, 'anvil', filterIds('smith_')),
  town2('furnace2', tl('落霞城·熔炉'), -20, 28, 'furnace', filterIds('smelt_')),
  town2('kitchen2', tl('落霞城·灶台'), 16, 14, 'stove', filterIds('cook_')),
  town2('workshop2', tl('落霞城·工坊'), 28, 17, 'bench', filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_'))),
  town2('bowyer2', tl('落霞城·制弓台'), 27, -4, 'bowyer', filterIds('plank_').concat(filterIds('fletch_'))),
  town2('apothecary2', tl('落霞城·药剂铺'), -27, -1, 'potion', filterIds('brew_')),
  town2('enhancer2', tl('落霞城·强化台'), -4, 16, 'enhance', filterIds('enhance_'), { closed: true }),
  // 金穗草原
  ring('golden_plain', tl('金穗原野'), 0.06, 0.42, 'savanna', 'camp', [mat('spice', 1), mat('resin', 1), mat('feather', 1), chop(1, '_plain')]),
  ring('lion_rock', tl('狮吼岩'), 0.15, 0.63, 'savanna', 'boss', [mat('crystal', 1), mat('crystal', 2), mat('feather', 2), mine(1, '_lion')]),
  // 枫红秋林
  ring('maple_valley', tl('枫红谷'), 0.08, 0.22, 'autumn', 'tree', [mat('resin', 2), mat('spice', 2), chop(3, '_maple')]),
  ring('leaf_corridor', tl('落叶回廊'), 0.19, 0.08, 'autumn', 'camp', [mat('feather', 3), mat('crystal', 3), hunt(3, '_leaf')]),
  // 蛮荒雨林
  ring('vine_realm', tl('藤蔓秘境'), 0.08, 0.78, 'jungle', 'tree', [mat('spice', 3), mat('resin', 4), chop(4, '_vine')]),
  ring('python_marsh', tl('蟒河湿地'), 0.17, 0.92, 'jungle', 'boss', [mat('feather', 4), hunt(4, '_python'), herb('flame_heart', '_python')]),
  // 珊瑚群岛
  site(ring('coral_atoll', tl('珊瑚环礁'), 0.90, 0.47, 'tropic', 'fish', [mat('crystal', 4), fishAt('grouper', '_atoll'), fishAt('lanternfish', '_atoll')], true), 'atoll', 110),
  ring('palm_coast', tl('椰风海岸'), 0.86, 0.61, 'tropic', 'camp', [mat('resin', 3), mat('spice', 4), cotton(4, '_palm')]),
  // 赤岩峡谷
  site(ring('red_mesa', tl('赤岩台地'), 0.88, 0.12, 'canyon', 'ore', [mat('crystal', 5), mine(5, '_mesa')]), 'mesa', 120),
  ring('wind_pillars', tl('风语石柱'), 0.93, 0.29, 'canyon', 'camp', [mat('feather', 5), hunt(5, '_pillar')]),
  // 流沙大漠
  site(ring('sand_oasis', tl('沙海绿洲'), 0.86, 0.80, 'desert', 'fish', [mat('spice', 5), mat('resin', 5), fishAt('carp', '_sand')], true), 'oasis', 90),
  ring('king_tomb', tl('古王陵'), 0.93, 0.93, 'desert', 'boss', [mat('crystal', 6), mine(6, '_tomb')]),
  // 云岭高山
  ring('cloud_slope', tl('云巅雪坡'), 0.38, 0.06, 'alpine', 'tree', [mat('resin', 6), mat('spice', 6), chop(6, '_cloud')]),
  ring('eagle_gorge', tl('鹰愁涧'), 0.62, 0.07, 'alpine', 'camp', [mat('feather', 6), mine(6, '_gorge')]),
  // 晶簇荒原
  site(ring('crystal_heart', tl('晶簇之心'), 0.40, 0.93, 'crystal', 'boss', [mat('crystal', 7), mine(7, '_heart')]), 'crystalheart', 110),
  ring('void_field', tl('虚空晶原'), 0.62, 0.93, 'crystal', 'camp', [mat('spice', 7), mat('resin', 7), mat('feather', 7)]),

  // ---- 12 个大型洞窟（用户 10-23：先占位，以后开放） ----
  cave('cave_shadow', tl('幽影洞窟'), at(0.15, 0.50), 'woodland'),
  cave('cave_magma', tl('熔心洞'), at(0.70, 0.86), 'lava'),
  cave('cave_frost', tl('寒晶洞'), at(0.55, 0.13), 'snow'),
  cave('cave_mine', tl('古矿坑道'), at(0.80, 0.20), 'highland'),
  cave('cave_spider', tl('蛛巢洞'), at(0.12, 0.85), 'swamp'),
  cave('cave_maw', tl('深渊之喉'), at(0.52, 0.88), 'abyss'),
  cave('cave_echo', tl('回音窟'), atW(0.05, 0.56), 'savanna'),
  cave('cave_bone', tl('龙骨洞'), atW(0.95, 0.20), 'canyon'),
  cave('cave_falls', tl('水帘洞'), atW(0.12, 0.86), 'jungle'),
  cave('cave_bat', tl('蝠影窟'), atW(0.12, 0.14), 'autumn'),
  cave('cave_sunken', tl('沉海洞'), atW(0.95, 0.55), 'tropic'),
  cave('cave_vein', tl('晶脉洞'), atW(0.52, 0.95), 'crystal'),

  // ---- 12080 最外圈（用户 10-24 的新版世界地图）：8 个新群系，每个 3-4 处资源点 + 1 处带首领的特色地点 ----
  // 青岚丘陵 T2-T3（落霞城北边，刚出新手村的第二站）
  site(band('hill_terrace', tl('青岚梯田'), 0.06, 0.27, 'hills', 'boss', [cotton(1, '_terrace'), herb('fire_bloom', '_terrace'), mat('spice', 1, '_hill')]), 'terraces', 100),
  band('hill_pines', tl('风岭松坡'), 0.072, 0.409, 'hills', 'tree', [chop(2, '_hill'), hunt(1, '_hill'), mat('feather', 2, '_hill')]),
  band('hill_quarry', tl('青石采场'), 0.10, 0.215, 'hills', 'ore', [mine(1, '_hill'), mine(2, '_hill'), mat('crystal', 2, '_hill')]),
  band('hill_brook', tl('岚溪'), 0.11, 0.43, 'hills', 'fish', [fishAt('hill_trout'), fishAt('bighead', '_hill'), fishAt('catfish', '_hill')], true),
  site(band('sunken_bay', tl('沉木海湾'), 0.035, 0.56, 'hills', 'fish', [chop(4, '_sunken'), fishAt('squid', '_sunken'), fishAt('bass', '_sunken')], true), 'sunkenwood', 110),
  // 古藤群岛 T4-T5（西北角的海上群岛）
  isle(site(band('vine_heart', tl('古藤之心'), 0.06, 0.07, 'vineisles', 'boss', [chop(4, '_vine2'), mat('resin', 4, '_vine2'), herb('flame_heart', '_vine2')]), 'vineheart', 110)),
  site(band('frost_bay', tl('霜叶海湾'), 0.21, 0.05, 'vineisles', 'fish', [fishAt('vine_perch'), fishAt('salmon', '_bay2'), chop(3, '_frostleaf')], true), 'frostbay', 110),
  band('vine_isle', tl('藤蔓岛'), 0.03, 0.19, 'vineisles', 'camp', [hunt(3, '_vineisle'), mat('feather', 4, '_vineisle'), cotton(4, '_vineisle')]),
  band('drift_isle', tl('浮木岛'), 0.14, 0.11, 'vineisles', 'tree', [chop(3, '_drift'), mat('resin', 3, '_drift')]),
  // 腐月湿地 T5-T6（西南角）
  site(band('eclipse_mire', tl('月蚀泥潭'), 0.122, 0.819, 'moonmire', 'boss', [herb('moon_herb', '_eclipse'), chop(5, '_eclipse'), mat('resin', 5, '_eclipse')]), 'eclipse', 120),
  band('moon_pool', tl('月影池'), 0.053, 0.69, 'moonmire', 'fish', [fishAt('moon_catfish'), fishAt('eel', '_moon'), fishAt('ghostfish', '_moon')], true),
  band('bog_hollow', tl('腐木洼'), 0.12, 0.93, 'moonmire', 'camp', [hunt(5, '_bog'), cotton(5, '_bog'), mat('feather', 5, '_bog')]),
  band('grave_moor', tl('遗骨荒冢'), 0.236, 0.914, 'moonmire', 'camp', [chop(5, '_moor'), mine(5, '_moor'),
    steal('mire_grave', tl('盗月沼古墓'), 60, 90, [{ item: 'ruby', qty: 1, chance: 0.03 }])]),
  // 潮歌群岛 T5（东边海上）
  isle(site(band('holy_reef', tl('碧潮圣礁'), 0.95, 0.52, 'archipelago', 'boss', [fishAt('tide_bream'), fishAt('tuna', '_reef2'), mat('crystal', 4, '_reef')]), 'holyreef', 110)),
  band('song_isle', tl('潮歌岛'), 0.94, 0.36, 'archipelago', 'camp', [mat('resin', 5, '_song'), cotton(5, '_song'), hunt(4, '_song')]),
  isle(band('turtle_isle', tl('海龟岛'), 0.955, 0.645, 'archipelago', 'fish', [fishAt('swordfish', '_isle2'), fishAt('grouper', '_isle2'), chop(4, '_isle2')], true)),
  // 寒星山脉 T7（北边）
  site(band('aurora_lake', tl('极光冰湖'), 0.64, 0.06, 'frostpeak', 'boss', [fishAt('aurora_salmon'), fishAt('sturgeon', '_aurora'), herb('frost_lotus', '_aurora')], true), 'aurora', 120),
  band('star_peak', tl('寒星峰'), 0.426, 0.082, 'frostpeak', 'ore', [mine(6, '_peak2'), mine(7, '_peak2'), mat('crystal', 6, '_peak')]),
  band('frost_pines', tl('冰杉林'), 0.30, 0.07, 'frostpeak', 'tree', [chop(6, '_frostpeak'), chop(5, '_frostpeak'), hunt(6, '_frostpeak')]),
  band('snow_eagle_cliff', tl('雪鹰崖'), 0.53, 0.09, 'frostpeak', 'camp', [mat('feather', 6, '_frostpeak'), cotton(6, '_frostpeak')]),
  // 雷鸣断层 T8（东北角）
  site(band('thunder_rift', tl('雷鸣裂谷'), 0.88, 0.065, 'thunder', 'boss', [mine(7, '_thunder'), mat('crystal', 7, '_thunder')]), 'thunderrift', 120),
  site(band('pale_shore', tl('苍白裂岸'), 0.882, 0.248, 'thunder', 'fish', [fishAt('storm_eel'), fishAt('thunder_shark', '_pale'), mine(6, '_pale')], true), 'paleshore', 110),
  band('storm_mesa', tl('风暴台地'), 0.80, 0.04, 'thunder', 'camp', [hunt(7, '_storm'), mat('feather', 7, '_storm'), cotton(7, '_storm')]),
  band('iron_spires', tl('雷击铁林'), 0.955, 0.075, 'thunder', 'tree', [chop(7, '_thunder'), chop(6, '_thunder')]),
  // 灰烬海角 T7（东南角）
  site(band('scorch_fjord', tl('灼风峡湾'), 0.932, 0.823, 'ashcape', 'boss', [fishAt('ash_shark'), fishAt('flame_shark', '_fjord'), mine(6, '_fjord')], true), 'fjord', 130),
  band('ash_dunes', tl('黑沙丘'), 0.846, 0.946, 'ashcape', 'camp', [mat('spice', 6, '_ash'), mat('resin', 6, '_ash'), hunt(6, '_ash')]),
  band('cinder_vents', tl('余烬喷口'), 0.95, 0.955, 'ashcape', 'ore', [mine(5, '_vent'), mine(6, '_vent')]),
  band('ember_grove', tl('余烬焦林'), 0.918, 0.707, 'ashcape', 'tree', [chop(6, '_ember'), herb('flame_heart', '_ember')]),
  // 星陨晶海 T8 以上（南边海上，终局区域）
  isle(site(band('starfall', tl('坠星环礁'), 0.44, 0.955, 'starsea', 'boss', [mine(7, '_starfall'), mat('crystal', 7, '_starfall'), fishAt('star_whale')]), 'starfall', 120)),
  band('glow_isle', tl('晶光岛'), 0.322, 0.9, 'starsea', 'camp', [mat('spice', 7, '_glow'), mat('resin', 7, '_glow'), cotton(7, '_glow')]),
  band('tide_ruins', tl('潮汐遗迹'), 0.553, 0.905, 'starsea', 'fish', [fishAt('starwhale', '_tide'), fishAt('dragonfish', '_tide'), herb('frost_lotus', '_tide')], true),

  // ---- 世界首领的巢穴（用户 10-24）：地图上红色骷髅头标记，各在一片群系的腹地 ----
  lair('wb_flame_lair', tl('炎煌龙巢'), 7640, 7060, 'lava'),
  lair('wb_soul_lair', tl('噬魂古林'), 2150, 10600, 'moonmire'),
  lair('wb_frost_lair', tl('永冬冰原'), 4400, 1250, 'frostpeak'),
  lair('wb_thunder_lair', tl('天罚雷巅'), 10150, 1500, 'thunder'),
  lair('wb_void_lair', tl('虚无裂隙'), 5900, 10500, 'starsea'),

  // 外圈的大型洞窟（先占位，以后开放）
  cave('cave_hill', tl('青岚石窟'), atF(0.05, 0.47), 'hills'),
  isle(cave('cave_vine', tl('古藤根洞'), atF(0.10, 0.04), 'vineisles')),
  cave('cave_moon', tl('月蚀窟'), atF(0.09, 0.79), 'moonmire'),
  isle(cave('cave_tidal', tl('潮汐洞'), atF(0.965, 0.44), 'archipelago')),
  cave('cave_aurora', tl('寒星洞'), atF(0.48, 0.03), 'frostpeak'),
  cave('cave_thunder', tl('雷音窟'), atF(0.90, 0.13), 'thunder'),
  cave('cave_ember', tl('余烬洞'), atF(0.90, 0.90), 'ashcape'),
  cave('cave_star', tl('星陨深穴'), atF(0.62, 0.975), 'starsea'),

  // ---- 12080 的 8 座新城镇（布局在 towns.ts） ----
  ...TOWNS.flatMap(townNodes),
];

/** 分解台（用户 10-25）：每座城镇仓库旁一个，把仓库里的装备、工具分解成金币。位置挑仓库附近空着的路面 */
export const SALVAGE_SPOTS: Record<string, [number, number]> = {
  bank: [-4, 3], bank2: [-4, 4], fengmai_bank: [4, 4], xueai_bank: [-5, 4], yandeng_bank: [4, 3], coralport_bank: [4, 3],
  ashcamp_bank: [4, 3], crystalfort_bank: [4, 3], forgotten_bank: [8, -15], voidruins_bank: [3, 4],
};
for (const b of NODES.filter((n) => n.opens === 'bank')) {
  const d = SALVAGE_SPOTS[b.id];
  if (!d) continue;
  const town = b.id === 'bank' ? '' : b.id === 'bank2' ? tl('落霞城') : TOWNS.find((t) => `${t.id}_bank` === b.id)?.name ?? '';
  NODES.push({
    id: `salvage_${b.id}`, name: town ? tl`${town}·分解台` : tl('分解台'), x: b.x + d[0], y: b.y + d[1], region: b.region, lv: [1, 1],
    town: true, townId: b.townId, sprite: 'salvage', actions: [], salvage: true,
  });
}

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

/**
 * 传说石碑（用户 10-23：地图太大，加传送点）：主城、落霞城各一座，每个野外区域一座，
 * 立在该区域最低级的野外点位旁边。第一次要走到石碑旁边激活，之后站在任意一座激活过的石碑旁就能传到别的石碑。
 */
export const WAYSTONE_HOME = 'stone_town';
const stoneAt = (id: string, name: string, x: number, y: number, region: RegionId, town = false): MapNode =>
  ({ id: `stone_${id}`, name, x, y, region, lv: [1, 1], sprite: 'waystone', actions: [], waystone: true, ...(town ? { town: true } : {}) });
export const WAYSTONES: MapNode[] = [
  stoneAt('town', tl('传说石碑·苍岭城'), townXY(160, 181).x, townXY(160, 181).y, 'town', true),
  stoneAt('town2', tl('传说石碑·落霞城'), town2XY(6, 4).x, town2XY(6, 4).y, 'savanna', true),
  ...(Object.keys(REGIONS) as RegionId[]).filter((r) => r !== 'town' && r !== 'savanna').flatMap((r) => {
    const pool = NODES.filter((n) => n.region === r && !n.town && !n.cave && !n.site && !n.sea && n.actions.length);
    if (!pool.length) return [];
    const hub = pool.reduce((a, b) => (b.lv[0] < a.lv[0] ? b : a));
    return [stoneAt(r, tl`传说石碑·${REGIONS[r].name}`, hub.x + 6, hub.y + 2, r)];
  }),
  // 12080（用户 10-24 要求规划传送石碑）：每座新城镇一座，每处带首领的特色地点旁边一座
  ...TOWNS.map((t) => stoneAt(t.id, tl`传说石碑·${t.name}`, townAt(t, ...t.stone).x, townAt(t, ...t.stone).y, t.region, true)),
  ...NODES.filter((n) => n.site && !n.sea).map((n) => stoneAt(`site_${n.id}`, tl`传说石碑·${n.name}`, n.x + 6, n.y + 2, n.region)),
];
NODES.push(...WAYSTONES);

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(actionList.map((a) => [a.id, a]));

/** 动作 → 所在地点 */
/** 城镇周围四块田的范围（老城的局部坐标）：每三行里两行耕地、一行走道，中间 5×5 留给牌子 */
export const FARM_RECTS = [
  { x0: 134, y0: 191, x1: 160, y1: 206, node: [148, 198], id: 'farm' },
  { x0: 134, y0: 211, x1: 160, y1: 223, node: [147, 217], id: 'farm_south' },
  { x0: 175, y0: 206, x1: 200, y1: 220, node: [187, 213], id: 'farm_east' },
  { x0: 106, y0: 196, x1: 124, y1: 210, node: [115, 203], id: 'farm_west' },
];
export const isFarmRow = (r: { y0: number }, localY: number) => (localY - r.y0) % 3 !== 2;
/** 田里能种的地块：牌子上下各一垄（两行耕地），牌子左右各 3 格，每块田 24 格（用户 10-23 从 56 格减到 24 格） */
export const FARM_COLS = 3;
export interface FarmPlot { id: string; field: string; x: number; y: number }
export const FARM_NODES = NODES.filter((n) => n.farm);
export const FARM_PLOTS: FarmPlot[] = FARM_RECTS.flatMap((r) => {
  const [nx, ny] = r.node;
  // 牌子上方、下方各挑离得最近的一垄（相邻的两行耕地）
  const pairs: number[] = [];
  for (let y = r.y0; y < r.y1; y++) if (isFarmRow(r, y) && isFarmRow(r, y + 1)) pairs.push(y);
  const above = pairs.filter((y) => y + 1 < ny).pop()!;
  const below = pairs.find((y) => y > ny)!;
  const out: FarmPlot[] = [];
  // 编号沿用原来 56 格时的顺序（跳过的列也占号），留下的格子编号不变，种着的作物原地不动
  let k = 0;
  for (const y of [above, above + 1, below, below + 1]) {
    for (let x = nx - 9; x <= nx + 9; x++) {
      if (Math.abs(x - nx) <= 2 || x < r.x0 || x > r.x1) continue;
      const id = `${r.id}:${k++}`;
      if (Math.abs(x - nx) <= 2 + FARM_COLS) out.push({ id, field: r.id, ...townXY(x, y) });
    }
  }
  return out;
});
export const PLOT_BY_ID: Record<string, FarmPlot> = Object.fromEntries(FARM_PLOTS.map((p) => [p.id, p]));
export const plotsOf = (field: string) => FARM_PLOTS.filter((p) => p.field === field);
/** 这种作物种在哪块田 */
export const fieldOfCrop = (crop: string) => FARM_NODES.find((n) => n.farm!.includes(CROP_DEFS[crop]?.tier ?? -1));
/** 这块田能种的作物（按等级从低到高） */
export const cropsOfField = (field: string) => {
  const n = FARM_NODES.find((x) => x.id === field);
  return n ? CROPS.map((c) => CROP_DEFS[c[0]]).filter((c) => n.farm!.includes(c.tier)) : [];
};

const NODES_OF: Record<string, MapNode[]> = {};
for (const n of NODES) if (!n.sea) for (const a of n.actions) (NODES_OF[a] ??= []).push(n);
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

/** 自动寻路顺路用石碑传送时，传送本身算多久 */
export const STONE_JUMP_MS = 3000;
export interface Route { ms: number; via?: [string, string] }
/**
 * 自动寻路的路线（用户 10-23：寻路要会自己用传送石碑）：在所有已激活的石碑里挑「走到 A + 传送 + 从 B 走到终点」最快的一对，
 * 比直接走快就用石碑（10-25 用户反馈：以前只看离起点、终点最近的两座，还要省两成才用，明明传送更快却跑过去）。
 */
export function planRoute(stones: string[] | undefined, from: { x: number; y: number }, to: { x: number; y: number }, speed = WALK_TILES_PER_SEC): Route {
  const direct = travelMs(from, to, speed);
  const lit = WAYSTONES.filter((n) => stones?.includes(n.id));
  if (lit.length < 2) return { ms: direct };
  const toA = lit.map((n) => travelMs(from, standOf(n), speed));
  const fromB = lit.map((n) => travelMs(standOf(n), to, speed));
  let best: Route = { ms: direct };
  // 省不到 2 秒就别绕去石碑了，免得来回折腾
  let bestMs = direct - 2000;
  lit.forEach((a, i) => lit.forEach((b, j) => {
    if (i === j) return;
    const ms = toA[i] + STONE_JUMP_MS + fromB[j];
    if (ms < bestMs) {
      bestMs = ms;
      best = { ms, via: [a.id, b.id] };
    }
  }));
  return best;
}

/** 世界地图危险度：按地点最强怪物和玩家战斗等级的差距 */
export const DANGER = [
  { name: tl('安全'), color: '#7cc46a' },
  { name: tl('低'), color: '#9ad0e0' },
  { name: tl('中等'), color: '#e8c84a' },
  { name: tl('高'), color: '#e8883a' },
  { name: tl('致命'), color: '#e04848' },
];

export function dangerLevel(node: MapNode, combatLevel: number): number {
  const levels = node.actions.map((id) => ACTIONS[id]).filter((a) => a.kind === 'combat' && a.monster !== 'dummy').map((a) => a.level);
  if (!levels.length) return 0;
  const d = Math.max(...levels) - combatLevel;
  return d <= -10 ? 1 : d <= 5 ? 2 : d <= 20 ? 3 : 4;
}
