import type {
  ActionDef, CombatStyle, Drop, EquipSlot, ItemCategory, ItemDef, ItemStack, MonsterDef, RegionId, SkillGroup, SkillId, ToolSlot,
} from './types';

/*
 * 占位数值：装备、工具、资源、怪物都按公式批量生成，等正式设计再逐个替换。
 * 闭环：采集 → 仓库 → 生产 → 装备/消耗品 → 战斗 → 掉落 → 生产或卖钱。
 */

export const MAP_W = 1080;
export const MAP_H = 1080;

export interface SkillInfo { name: string; color: string; group: SkillGroup; desc: string }

export const SKILLS: Record<SkillId, SkillInfo> = {
  mining: { name: '挖矿', color: '#b08d57', group: 'gather', desc: '采集矿石、符文石和宝石' },
  woodcutting: { name: '伐木', color: '#6a9a4a', group: 'gather', desc: '砍伐各地的树木' },
  fishing: { name: '钓鱼', color: '#4f86b8', group: 'gather', desc: '在湖泊、海岸和熔池钓鱼' },
  farming: { name: '种植', color: '#8fbf4a', group: 'gather', desc: '用锄头种作物，用镰刀采棉花和草药' },
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
};

// ---- 物品 ----

const itemList: ItemDef[] = [];
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
  { id: 'adamant', metal: '精金', ore: 'adamant_ore', oreName: '精金矿', wood: 'white', woodName: '白木', rune: '精金', level: 85 },
];
/** 阶级下标（0-7）→ 显示用的 T1-T8 */
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
});
// 宝石：挖矿时小概率顺带挖到
item('sapphire', '蓝宝石', 'resource', 150);
item('ruby', '红宝石', 'resource', 300);
item('diamond', '钻石', 'resource', 600);
const GEM_FOR_TIER = ['sapphire', 'sapphire', 'sapphire', 'sapphire', 'ruby', 'ruby', 'diamond', 'diamond'];

// 鱼与食物：[id, 名字, 钓鱼等级, 回复]
const FISH: [string, string, number, number][] = [
  ['minnow', '银鱼', 1, 30], ['shrimp', '虾', 1, 30], ['carp', '绿洲鲤', 5, 45], ['trout', '鳟鱼', 10, 60],
  ['bass', '海鲈', 15, 80], ['cod', '冰鳕', 20, 100], ['salmon', '鲑鱼', 25, 130], ['eel', '沉潭鳗', 30, 160],
  ['lava_eel', '熔岩鳗', 35, 190], ['ghostfish', '幽灵鱼', 40, 220], ['abyssfish', '深渊鱼', 58, 300],
];
for (const [id, name, lvl, heals] of FISH) {
  item(`raw_${id}`, `生${name}`, 'resource', Math.round(2 + lvl * 0.9));
  item(id, `烤${name}`, 'food', Math.round(4 + lvl * 1.4), { heals });
}
item('burnt_food', '烧焦的食物', 'misc', 0);

// 作物与草药
item('potato', '土豆', 'resource', 2);
item('wheat', '小麦', 'resource', 3);
item('baked_potato', '烤土豆', 'food', 4, { heals: 25 });
item('bread', '面包', 'food', 10, { heals: 50 });
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

// 强化石（占位）
const STONES: [string, string, number][] = [
  ['enh_basic', '初级强化石', 1], ['enh_mid', '中级强化石', 30], ['enh_high', '高级强化石', 55], ['enh_legend', '传说强化石', 85],
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
  W('staff', '法杖', 'magic', 'crafting', [['plank', 2], ['cloth', 1]], 4, 1.0, 0.6, 2600, 'magic'),
  // 护甲：头、身、脚、手
  ...A('plate', ['板甲头盔', '板甲胸甲', '板甲战靴', '板甲护手'], 'bar', 'smithing', 2.0, 0, 0.25, 'melee'),
  ...A('leather', ['皮帽', '皮甲', '皮靴', '皮手套'], 'leather', 'crafting', 1.4, 0.5, 0, 'ranged'),
  ...A('cloth', ['布帽', '布袍', '布鞋', '布手套'], 'cloth', 'crafting', 1.0, 0.3, 0.4, 'magic'),
  // 工具
  TL('axe', '斧头', 'axe', 'woodcutting', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('pickaxe', '镐子', 'pickaxe', 'mining', 'smithing', [['bar', 1], ['plank', 1]], 1),
  TL('sickle', '镰刀', 'sickle', 'farming', 'smithing', [['bar', 1], ['plank', 1]], 1),
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

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(itemList.map((i) => [i.id, i]));

// ---- 怪物 ----

const monsterList: MonsterDef[] = [];
function monster(
  id: string, name: string, level: number, sprite: string,
  opts: { boss?: boolean; beast?: boolean; tint?: number; drops?: Drop[] } = {},
) {
  const mult = opts.boss ? 3 : 1;
  const drops: Drop[] = [{ item: 'coins', qty: Math.round(level * 3 * (opts.boss ? 5 : 1)) }, { item: 'bones', qty: 1 }];
  if (opts.beast) drops.push({ item: `hide_${tierForLevel(level) + 1}`, qty: 1, chance: 0.5 });
  monsterList.push({
    id, name, level, sprite, tint: opts.tint, boss: opts.boss,
    hp: Math.round((20 + level * 14) * mult),
    attack: level, defence: level,
    maxHit: Math.round(2 + level * 0.4),
    attackMs: opts.boss ? 3200 : 2800,
    drops: [...drops, ...(opts.drops ?? [])],
  });
  return id;
}

monsterList.push({ id: 'dummy', name: '稻草人', level: 1, hp: 30, attack: 0, defence: 0, maxHit: 0, attackMs: 3000, drops: [], sprite: 'scarecrow' });
monster('rabbit', '野兔', 2, 'rabbit', { beast: true });
monster('moss_slime', '苔藓史莱姆', 3, 'slime', { drops: [{ item: 'green_herb', qty: 1, chance: 0.25 }] });
monster('cave_bat', '洞穴蝙蝠', 5, 'bat', { drops: [{ item: 'stone', qty: 2, chance: 0.3 }] });
monster('reef_crab', '礁石蟹', 6, 'crab', { drops: [{ item: 'raw_shrimp', qty: 2, chance: 0.4 }] });
monster('snow_fox', '雪狐', 8, 'wolf', { beast: true, tint: 0xf4f0ff });
monster('boar', '野猪', 10, 'boar', { beast: true });
monster('pine_wolf', '松谷狼', 12, 'wolf', { beast: true });
monster('fire_lizard', '火蜥蜴', 12, 'lizard', { beast: true, drops: [{ item: 'fire_bloom', qty: 1, chance: 0.25 }] });
monster('bog_skeleton', '沉潭骷髅', 15, 'skeleton', { drops: [{ item: 'raw_eel', qty: 1, chance: 0.2 }] });
monster('goblin', '矿洞地精', 18, 'goblin', { drops: [{ item: 'iron_ore', qty: 3, chance: 0.4 }, { item: 'iron_ore', qty: 2, chance: 0.3 }] });
monster('scorpion', '沙蝎', 20, 'lizard', { beast: true, tint: 0xe8c070, drops: [{ item: 'tin_ore', qty: 3, chance: 0.3 }] });
monster('grey_wolf', '灰狼', 22, 'wolf', { beast: true, tint: 0xb0b0b0 });
monster('canopy_spider', '冠林巨蛛', 26, 'spider', { beast: true, drops: [{ item: 'cedar_log', qty: 1, chance: 0.2 }] });
monster('frost_wolf', '霜狼', 30, 'wolf', { beast: true, tint: 0xa8d8ff, drops: [{ item: 'titanium_ore', qty: 1, chance: 0.15 }] });
monster('treant', '树精', 32, 'treant', { drops: [{ item: 'bloodoak_log', qty: 1, chance: 0.2 }] });
monster('magma', '熔岩元素', 34, 'golem', { tint: 0xff8a50, drops: [{ item: 'rune_ore', qty: 2, chance: 0.4 }] });
monster('harpy', '峭壁鹰妖', 36, 'bat', { tint: 0xd8b080, drops: [{ item: 'titanium_ore', qty: 1, chance: 0.3 }] });
monster('bog_wraith', '沉潭怨灵', 40, 'wraith', { drops: [{ item: 'raw_ghostfish', qty: 1, chance: 0.25 }] });
monster('gargoyle', '石像鬼', 50, 'golem', { tint: 0x9a9aa8, drops: [{ item: 'titanium_ore', qty: 3, chance: 0.4 }, { item: 'ruby', qty: 1, chance: 0.03 }] });
monster('tide_guardian', '潮眼守卫', 58, 'wraith', { boss: true, tint: 0x60d0ff, drops: [{ item: 'raw_abyssfish', qty: 5 }, { item: 'diamond', qty: 1, chance: 0.1 }] });
monster('drakeling', '龙裔', 66, 'dragon', { beast: true, tint: 0xc0a0ff, drops: [{ item: 'adamant_ore', qty: 1, chance: 0.2 }] });
monster('frost_giant', '冰霜巨人', 70, 'golem', { boss: true, tint: 0xd0f0ff, drops: [{ item: 'titanium_ore', qty: 10 }, { item: 'diamond', qty: 1, chance: 0.1 }] });
monster('treant_king', '远古树王', 70, 'treant', { boss: true, tint: 0xffe080, drops: [{ item: 'white_log', qty: 5 }, { item: 'diamond', qty: 1, chance: 0.1 }] });
monster('prism_golem', '棱晶魔像', 72, 'golem', { tint: 0xe0a0ff, drops: [{ item: 'meteor_ore', qty: 3, chance: 0.5 }] });
// 1080 大地图新增点位的怪物
monster('hen', '走地鸡', 1, 'chicken', { drops: [{ item: 'raw_minnow', qty: 1, chance: 0.1 }] });
monster('rat', '矿坑老鼠', 3, 'rabbit', { tint: 0x9a9088, drops: [{ item: 'copper_ore', qty: 2, chance: 0.3 }] });
monster('sand_crab', '沙蟹', 4, 'crab', { tint: 0xf0d090, drops: [{ item: 'raw_shrimp', qty: 1, chance: 0.3 }] });
monster('deer', '林鹿', 7, 'wolf', { beast: true, tint: 0xd0a070 });
monster('bog_toad', '沼泽蟾蜍', 9, 'slime', { tint: 0x8a9a4a, drops: [{ item: 'green_herb', qty: 1, chance: 0.3 }] });
monster('rock_lizard', '岩蜥', 11, 'lizard', { beast: true, tint: 0xa0a0a0, drops: [{ item: 'iron_ore', qty: 1, chance: 0.3 }] });
monster('ash_imp', '灰烬小鬼', 14, 'goblin', { tint: 0xff7050, drops: [{ item: 'iron_ore', qty: 2, chance: 0.4 }] });
monster('mushroom_man', '蘑菇人', 16, 'treant', { tint: 0xe08a80, drops: [{ item: 'moon_herb', qty: 1, chance: 0.25 }] });
monster('pirate', '海盗', 24, 'villager2', { tint: 0xc0a090, drops: [{ item: 'meteor_ore', qty: 1, chance: 0.2 }, { item: 'cotton_3', qty: 2, chance: 0.3 }] });
monster('snow_bear', '雪熊', 26, 'boar', { beast: true, tint: 0xf0f4ff });
monster('bandit', '林地强盗', 28, 'villager3', { tint: 0x998877, drops: [{ item: 'iron_bar', qty: 1, chance: 0.2 }, { item: 'sapphire', qty: 1, chance: 0.02 }] });
monster('crocodile', '沼泽巨鳄', 44, 'lizard', { beast: true, tint: 0x6a8a4a, drops: [{ item: 'raw_ghostfish', qty: 1, chance: 0.3 }] });
monster('lava_scorpion', '熔岩巨蝎', 47, 'lizard', { beast: true, tint: 0xff6030, drops: [{ item: 'rune_ore', qty: 3, chance: 0.4 }] });
monster('lurker', '深渊潜伏者', 53, 'spider', { tint: 0x8060c0, drops: [{ item: 'meteor_ore', qty: 1, chance: 0.15 }] });
monster('lich', '墓园巫妖', 55, 'skeleton', { tint: 0xb0a0ff, drops: [{ item: 'ruby', qty: 1, chance: 0.04 }, { item: 'titanium_ore', qty: 2, chance: 0.3 }] });
monster('mammoth', '雪原猛犸', 55, 'boar', { beast: true, tint: 0xc0a080, drops: [{ item: 'titanium_ore', qty: 2, chance: 0.4 }] });
monster('griffin', '狮鹫', 58, 'bat', { beast: true, tint: 0xe0c080, drops: [{ item: 'meteor_ore', qty: 3, chance: 0.4 }] });
monster('tree_guard', '古树守卫', 62, 'treant', { tint: 0x80c080, drops: [{ item: 'bloodoak_log', qty: 2, chance: 0.4 }] });
monster('abyss_eye', '深渊魔眼', 64, 'slime', { tint: 0xa060ff, drops: [{ item: 'meteor_ore', qty: 2, chance: 0.3 }] });
monster('lava_lord', '熔岩领主', 76, 'golem', { boss: true, tint: 0xff4020, drops: [{ item: 'rune_ore', qty: 10 }, { item: 'adamant_ore', qty: 2 }, { item: 'diamond', qty: 1, chance: 0.15 }] });
monster('abyss_lord', '深渊之主', 85, 'wraith', { boss: true, tint: 0x6040a0, drops: [{ item: 'hide_8', qty: 3 }, { item: 'diamond', qty: 1, chance: 0.3 }] });
monster('crystal_dragon', '晶龙', 80, 'dragon', { boss: true, beast: true, drops: [{ item: 'adamant_ore', qty: 5 }, { item: 'hide_8', qty: 3 }, { item: 'diamond', qty: 1, chance: 0.2 }] });

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(monsterList.map((m) => [m.id, m]));

// ---- 动作 ----

const actionList: ActionDef[] = [];
const xpFor = (level: number) => Math.round(8.4 + level * 1.6);

/** 采集：durationMs 随等级变长，经验随等级变多 */
function gather(id: string, name: string, skill: SkillId, level: number, outputs: Drop[], extra: { ms?: number; xp?: number; fail?: { chance: number; noFailLevel: number; stunMs?: number }; tool?: ToolSlot } = {}) {
  actionList.push({
    id, kind: 'skill', name, skill, level, durationMs: extra.ms ?? 3000 + (level - 1) * 20, xp: extra.xp ?? xpFor(level), outputs, fail: extra.fail, tool: extra.tool,
  });
  return id;
}

function make(id: string, name: string, skill: SkillId, level: number, inputs: ItemStack[], outputs: Drop[], xpMult = 1) {
  const n = inputs.reduce((a, i) => a + i.qty, 0);
  actionList.push({
    id, kind: 'skill', name, skill, level, durationMs: 2400 + Math.min(n, 6) * 300, xp: Math.round(xpFor(level) * xpMult), inputs, outputs,
  });
  return id;
}

const one = (item: string, qty = 1): ItemStack => ({ item, qty });
const fight = (monsterId: string, name?: string) => {
  const m = MONSTERS[monsterId];
  const id = `fight_${monsterId}`;
  actionList.push({ id, kind: 'combat', name: name ?? m.name, difficulty: m.boss ? 'HARD' : m.level >= 30 ? 'MEDIUM' : 'EASY', level: m.level, monster: monsterId });
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
  gather(`cotton_${t + 1}${suffix}`, '棉花', 'farming', TIERS[t].level, [one(`cotton_${t + 1}`), { item: `cotton_${t + 1}`, qty: 1, chance: 0.2 }], { tool: 'sickle' });
const hunt = (t: number, suffix = '') =>
  gather(`hunt_${t + 1}${suffix}`, '兽皮', 'hunting', TIERS[t].level, [one(`hide_${t + 1}`), { item: 'bones', qty: 1, chance: 0.3 }]);
const fishAt = (fish: string, suffix = '') => {
  const f = FISH.find((x) => x[0] === fish)!;
  return gather(`fish_${fish}${suffix}`, f[1], 'fishing', f[2], [one(`raw_${fish}`)]);
};
const herb = (id: string, suffix = '') => {
  const h = HERBS.find((x) => x[0] === id)!;
  return gather(`farm_${id}${suffix}`, `采集${h[1]}`, 'farming', h[2], [one(id), { item: id, qty: 1, chance: 0.2 }], { tool: 'sickle' });
};
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
    id: `cook_${fish}`, kind: 'skill', name: `烤${name}`, skill: 'cooking', level: lvl, durationMs: 2500 + lvl * 15, xp: xpFor(lvl),
    inputs: [one(`raw_${fish}`)], outputs: [one(fish)], fail: { chance: 0.4, noFailLevel: lvl + 20 },
  });
}
make('cook_potato', '烤土豆', 'cooking', 1, [one('potato')], [one('baked_potato')]);
make('cook_bread', '烤面包', 'cooking', 8, [one('wheat', 2)], [one('bread')]);
// 烹饪失败统一得到烧焦的食物
for (const a of actionList) if (a.kind === 'skill' && a.fail && a.skill === 'cooking') a.fail.item = 'burnt_food';

HERBS.forEach(([id, name, lvl], i) => {
  const potionLvl = [1, 8, 20, 28, 36, 45][i];
  make(`brew_${id}`, `${name}药水`, 'herblore', potionLvl, [one(id, 2)], [one(`${id}_potion`)], 1.5);
});

make('enhance_basic', '初级强化石', 'enhancing', 1, [one('wood_bar', 2), one('stone', 3)], [one('enh_basic')]);
make('enhance_mid', '中级强化石', 'enhancing', 30, [one('iron_bar', 2), one('sapphire')], [one('enh_mid')], 2);
make('enhance_high', '高级强化石', 'enhancing', 55, [one('runic_bar', 2), one('ruby')], [one('enh_high')], 3);
make('enhance_legend', '传说强化石', 'enhancing', 85, [one('adamant_bar', 2), one('diamond')], [one('enh_legend')], 4);

const filterIds = (prefix: string) => actionList.filter((a) => a.id.startsWith(prefix)).map((a) => a.id);

// ---- 地图点位 ----

export type NodeSprite =
  | 'ore' | 'tree' | 'fish' | 'herb' | 'camp' | 'boss' | 'anvil' | 'stove' | 'bench' | 'bowyer' | 'potion' | 'enhance'
  | 'market' | 'farm' | 'bank' | 'dummy';

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
}

const at = (u: number, v: number) => ({ x: Math.round(u * (MAP_W - 1)), y: Math.round(v * (MAP_H - 1)) });

/** 野外点位的等级范围直接取它所有动作的最低和最高等级 */
const wild = (id: string, name: string, u: number, v: number, region: RegionId, sprite: NodeSprite, actions: string[], pond = false): MapNode => {
  const lvls = actions.map((a) => actionList.find((x) => x.id === a)!.level);
  return { id, name, ...at(u, v), region, lv: [Math.min(...lvls), Math.max(...lvls)], sprite, actions, pond };
};

export const TOWN_CENTER = { x: 518, y: 529 };
/** 城镇布局按「镇中心 = (167, 170)」画的，这里平移到真正的镇中心 */
export const townXY = (x: number, y: number) => ({ x: x - 167 + TOWN_CENTER.x, y: y - 170 + TOWN_CENTER.y });

const town = (id: string, name: string, x: number, y: number, sprite: NodeSprite, actions: string[], extra: Partial<MapNode> = {}): MapNode =>
  ({ id, name, ...townXY(x, y), region: 'town', lv: [1, 1], sprite, actions, town: true, ...extra });

export const NODES: MapNode[] = [
  // 城镇：坐标与 world.ts 里的建筑对齐（建筑门口下方一格）
  town('bank', '仓库', 151, 158, 'bank', [], { opens: 'bank' }),
  town('smithy', '铁匠铺', 174, 158, 'anvil', filterIds('smelt_').concat(filterIds('smith_'))),
  town('kitchen', '灶台', 184, 158, 'stove', filterIds('cook_')),
  town('workshop', '工坊', 151, 170, 'bench', filterIds('tan_').concat(filterIds('weave_'), filterIds('craft_'))),
  town('bowyer', '制弓台', 159, 170, 'bowyer', filterIds('plank_').concat(filterIds('fletch_'))),
  town('apothecary', '药剂铺', 177, 170, 'potion', filterIds('brew_')),
  town('enhancer', '强化台', 185, 170, 'enhance', filterIds('enhance_')),
  town('market', '集市', 155, 182, 'market', [
    steal('farmer', '偷农夫', 1, 3, [{ item: 'potato', qty: 2, chance: 0.3 }]),
    steal('vendor', '偷小贩', 10, 9, [{ item: 'cotton_1', qty: 2, chance: 0.2 }]),
    steal('guard', '偷守卫', 25, 22, [{ item: 'iron_bar', qty: 1, chance: 0.1 }]),
    steal('merchant', '偷富商', 40, 45, [{ item: 'sapphire', qty: 1, chance: 0.02 }]),
    steal('noble', '偷贵族', 55, 80, [{ item: 'runic_bar', qty: 1, chance: 0.05 }]),
  ]),
  town('dummy', '训练场', 181, 182, 'dummy', [fight('dummy', '打稻草人')]),
  town('farm', '家园农田', 148, 198, 'farm', [
    gather('farm_potato', '种土豆', 'farming', 1, [one('potato', 2)]),
    herb('green_herb'),
    gather('farm_wheat', '种小麦', 'farming', 5, [one('wheat', 2)]),
    cotton(0),
  ]),
  { ...wild('town_lake', '镜湖码头', 0.37, 0.65, 'town', 'fish', [fishAt('minnow'), fishAt('trout', '_lake')], true), town: true },

  // 巨木森林
  wild('redwood_canopy', '雪松冠林', 0.07, 0.12, 'giantwood', 'tree', [chop(4), fight('canopy_spider')]),
  wild('ancient_court', '远古白木庭', 0.25, 0.10, 'giantwood', 'boss', [chop(7), cotton(7, '_court'), fight('treant'), fight('treant_king')]),
  wild('moon_garden', '月露药圃', 0.09, 0.28, 'giantwood', 'herb', [herb('moon_herb'), herb('silver_leaf'), cotton(2)]),
  // 幽深林地
  wild('pine_valley', '西风松谷', 0.09, 0.36, 'woodland', 'tree', [chop(2), hunt(1), fight('pine_wolf')]),
  wild('birch_brook', '桦影溪谷', 0.08, 0.58, 'woodland', 'fish', [chop(1), fishAt('trout')], true),
  wild('maple_slope', '落叶长坡', 0.23, 0.64, 'woodland', 'camp', [chop(0), cotton(1), hunt(0), fight('rabbit'), fight('boar'), fight('grey_wolf')]),
  wild('moss_pool', '幽苔水洼', 0.08, 0.68, 'woodland', 'fish', [fishAt('minnow', '_moss'), hunt(0, '_moss'), fight('moss_slime')], true),
  // 亡者沼泽
  wild('whisper_pool', '亡语沉潭', 0.09, 0.89, 'swamp', 'fish', [fishAt('eel'), fishAt('ghostfish'), fight('bog_skeleton'), fight('bog_wraith')], true),
  // 冰封雪原
  wild('lotus_bay', '北境冰莲湾', 0.42, 0.13, 'snow', 'fish', [fishAt('cod'), fishAt('salmon'), herb('frost_lotus'), chop(4, '_bay'), cotton(4)], true),
  wild('snow_plateau', '雪绒台地', 0.53, 0.22, 'snow', 'boss', [mine(6, '_plateau'), cotton(6), hunt(6, '_plateau'), fight('snow_fox'), fight('frost_wolf'), fight('frost_giant')]),
  wild('glow_cave', '蓝萤洞坡', 0.49, 0.33, 'snow', 'ore', [mine(2, '_cave'), fight('cave_bat')]),
  // 灰岩高地
  wild('dawn_hill', '晨曦铜石丘', 0.67, 0.36, 'highland', 'ore', [mine(0), mine(1)]),
  wild('dragon_rift', '精金裂隙', 0.69, 0.19, 'highland', 'boss', [mine(7), hunt(6), fight('drakeling'), fight('crystal_dragon')]),
  wild('prism_fault', '陨星断层', 0.79, 0.09, 'highland', 'ore', [mine(6), fight('prism_golem')]),
  wild('gold_ridge', '锡砂山脊', 0.85, 0.21, 'highland', 'ore', [mine(2, '_ridge'), hunt(3, '_ridge'), fight('scorpion')]),
  wild('iron_seam', '黑铁矿层', 0.80, 0.39, 'highland', 'ore', [mine(3), fight('goblin')]),
  // 金沙海岸
  wild('mithril_cliff', '钛岩峭壁', 0.88, 0.50, 'coast', 'ore', [mine(4), fight('harpy'), fight('gargoyle')]),
  wild('oasis', '金沙绿洲', 0.73, 0.50, 'coast', 'fish', [fishAt('carp'), cotton(1, '_oasis'), steal('caravan', '偷商队', 20, 30, [{ item: 'cotton_2', qty: 3, chance: 0.2 }])], true),
  wild('coral_shoal', '珊瑚浅滩', 0.88, 0.65, 'coast', 'fish', [fishAt('shrimp'), fishAt('bass'), cotton(3, '_shoal'), fight('reef_crab')], true),
  // 熔岩荒地
  wild('flame_slope', '烈焰花坡', 0.65, 0.66, 'lava', 'herb', [herb('fire_bloom'), herb('flame_heart'), cotton(3), fight('fire_lizard')]),
  wild('obsidian_pool', '黑曜熔池', 0.86, 0.84, 'lava', 'fish', [mine(3, '_pool'), fishAt('lava_eel'), fight('magma')], true),
  // 深渊裂谷
  wild('abyss_eye', '深渊潮眼', 0.43, 0.92, 'abyss', 'boss', [fishAt('abyssfish'), cotton(7), fight('tide_guardian')], true),

  // ---- 1080 大地图新增点位 ----
  // 城郊
  wild('orchard', '城郊果园', 0.56, 0.55, 'town', 'camp', [chop(0, '_orchard'), cotton(0, '_orchard'), herb('green_herb', '_orchard'), fight('hen')]),
  wild('old_pit', '老矿坑', 0.45, 0.40, 'town', 'ore', [mine(0, '_pit'), mine(1, '_pit'), fight('rat')]),
  // 巨木森林
  wild('mushroom_grove', '苔光蘑菇林', 0.20, 0.30, 'giantwood', 'herb', [herb('moon_herb', '_grove'), chop(3, '_grove'), cotton(4, '_grove'), fight('mushroom_man')]),
  wild('root_cave', '古根洞穴', 0.05, 0.05, 'giantwood', 'ore', [mine(5, '_root'), chop(5, '_root'), fight('tree_guard')]),
  // 幽深林地
  wild('hunter_camp', '猎人营地', 0.28, 0.47, 'woodland', 'camp', [chop(1, '_camp'), hunt(1, '_camp'), fight('deer')]),
  wild('forest_ruins', '林间废墟', 0.17, 0.50, 'woodland', 'camp', [chop(3), hunt(2), steal('ruins', '翻找废墟', 30, 35, [{ item: 'sapphire', qty: 1, chance: 0.02 }]), fight('bandit')]),
  // 亡者沼泽
  wild('rot_ferry', '腐沼渡口', 0.25, 0.80, 'swamp', 'fish', [fishAt('trout', '_ferry'), herb('green_herb', '_ferry'), cotton(2, '_ferry'), fight('bog_toad')], true),
  wild('croc_flats', '鳄鱼泥滩', 0.18, 0.96, 'swamp', 'fish', [fishAt('ghostfish', '_flats'), hunt(4), fight('crocodile')], true),
  wild('bone_yard', '血橡墓园', 0.31, 0.91, 'swamp', 'boss', [chop(5), cotton(5, '_yard'), steal('grave', '盗墓', 45, 60, [{ item: 'ruby', qty: 1, chance: 0.02 }]), fight('lich')]),
  // 深渊裂谷
  wild('dark_vein', '符文矿脉', 0.53, 0.84, 'abyss', 'ore', [mine(5), fight('lurker')]),
  wild('abyss_altar', '深渊祭坛', 0.37, 0.82, 'abyss', 'boss', [chop(6, '_altar'), cotton(6, '_altar'), hunt(7, '_altar'), fight('abyss_eye'), fight('abyss_lord')]),
  // 熔岩荒地
  wild('ash_outpost', '焦土前哨', 0.58, 0.76, 'lava', 'ore', [mine(3, '_ash'), fight('ash_imp')]),
  wild('scorpion_nest', '熔岩巨蝎巢', 0.71, 0.92, 'lava', 'camp', [mine(4, '_nest'), hunt(4, '_nest'), fight('lava_scorpion')]),
  wild('lava_crater', '炎王火山口', 0.80, 0.73, 'lava', 'boss', [mine(7, '_crater'), chop(6), hunt(7), fight('lava_lord')]),
  // 金沙海岸
  wild('wreck_bay', '沉船湾', 0.90, 0.58, 'coast', 'fish', [fishAt('bass', '_wreck'), cotton(5), steal('smuggler', '偷走私贩', 35, 40, [{ item: 'cotton_3', qty: 2, chance: 0.3 }]), fight('pirate')], true),
  wild('turtle_beach', '海龟沙滩', 0.78, 0.62, 'coast', 'fish', [fishAt('shrimp', '_turtle'), hunt(2, '_turtle'), fight('sand_crab')], true),
  // 灰岩高地
  wild('stone_forest', '风蚀石林', 0.75, 0.32, 'highland', 'ore', [mine(2), fight('rock_lizard')]),
  wild('griffin_peak', '鹰巢峰', 0.93, 0.15, 'highland', 'boss', [mine(4, '_peak'), cotton(5, '_peak'), hunt(5), fight('griffin')]),
  // 冰封雪原
  wild('tundra_pines', '冻原松林', 0.31, 0.05, 'snow', 'tree', [chop(2, '_tundra'), hunt(3), fight('snow_bear')]),
  wild('ice_cavern', '冰晶洞窟', 0.60, 0.05, 'snow', 'ore', [mine(4, '_cavern'), hunt(5, '_cavern'), fight('mammoth')]),
];

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(actionList.map((a) => [a.id, a]));

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
