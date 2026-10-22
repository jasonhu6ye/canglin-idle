import type { ActionDef, ItemDef, MonsterDef, SkillId } from './types';

export const SKILLS: Record<SkillId, { name: string; color: string }> = {
  mining: { name: '挖矿', color: '#b08d57' },
  woodcutting: { name: '伐木', color: '#6a9a4a' },
  fishing: { name: '钓鱼', color: '#4f86b8' },
  smithing: { name: '锻造', color: '#c26a3a' },
  cooking: { name: '烹饪', color: '#d4a03c' },
  melee: { name: '近战', color: '#b84a4a' },
  hitpoints: { name: '生命', color: '#d0566b' },
};

const items: ItemDef[] = [
  { id: 'coins', name: '金币', value: 1 },
  // 矿石与锭
  { id: 'copper_ore', name: '铜矿石', value: 3 },
  { id: 'tin_ore', name: '锡矿石', value: 3 },
  { id: 'iron_ore', name: '铁矿石', value: 10 },
  { id: 'coal', name: '煤', value: 15 },
  { id: 'gem', name: '原石宝石', value: 120 },
  { id: 'bronze_bar', name: '青铜锭', value: 10 },
  { id: 'iron_bar', name: '铁锭', value: 30 },
  { id: 'steel_bar', name: '钢锭', value: 70 },
  // 木材
  { id: 'pine_log', name: '松木', value: 2 },
  { id: 'oak_log', name: '橡木', value: 8 },
  { id: 'willow_log', name: '柳木', value: 18 },
  // 鱼
  { id: 'raw_minnow', name: '生银鱼', value: 2 },
  { id: 'raw_trout', name: '生鳟鱼', value: 9 },
  { id: 'raw_salmon', name: '生鲑鱼', value: 20 },
  { id: 'minnow', name: '烤银鱼', value: 4, heals: 30 },
  { id: 'trout', name: '烤鳟鱼', value: 14, heals: 70 },
  { id: 'salmon', name: '烤鲑鱼', value: 30, heals: 120 },
  { id: 'burnt_fish', name: '烧焦的鱼', value: 0 },
  // 装备
  { id: 'bronze_sword', name: '青铜剑', value: 40, equip: { slot: 'weapon', level: 1, attack: 6, strength: 5, defence: 0 } },
  { id: 'bronze_helm', name: '青铜头盔', value: 30, equip: { slot: 'head', level: 1, attack: 0, strength: 0, defence: 4 } },
  { id: 'bronze_body', name: '青铜胸甲', value: 60, equip: { slot: 'body', level: 1, attack: 0, strength: 0, defence: 9 } },
  { id: 'iron_sword', name: '铁剑', value: 120, equip: { slot: 'weapon', level: 15, attack: 14, strength: 12, defence: 0 } },
  { id: 'iron_helm', name: '铁头盔', value: 90, equip: { slot: 'head', level: 15, attack: 0, strength: 0, defence: 9 } },
  { id: 'iron_body', name: '铁胸甲', value: 180, equip: { slot: 'body', level: 15, attack: 0, strength: 0, defence: 20 } },
  { id: 'steel_sword', name: '钢剑', value: 300, equip: { slot: 'weapon', level: 30, attack: 25, strength: 22, defence: 0 } },
  { id: 'steel_body', name: '钢胸甲', value: 450, equip: { slot: 'body', level: 30, attack: 0, strength: 0, defence: 34 } },
  // 怪物掉落
  { id: 'bones', name: '骨头', value: 2 },
  { id: 'rabbit_pelt', name: '兔皮', value: 6 },
  { id: 'slime_gel', name: '史莱姆凝胶', value: 12 },
  { id: 'wolf_fang', name: '狼牙', value: 25 },
  { id: 'ash_core', name: '余烬核心', value: 80 },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.id, i]));

const monsters: MonsterDef[] = [
  { id: 'rabbit', name: '野兔', level: 2, hp: 40, attack: 1, defence: 1, maxHit: 2, attackMs: 3000,
    drops: [{ item: 'coins', qty: 5 }, { item: 'rabbit_pelt', qty: 1, chance: 0.5 }, { item: 'bones', qty: 1 }] },
  { id: 'crab', name: '岩蟹', level: 6, hp: 80, attack: 6, defence: 12, maxHit: 6, attackMs: 3000,
    drops: [{ item: 'coins', qty: 12 }, { item: 'copper_ore', qty: 3, chance: 0.4 }, { item: 'bones', qty: 1 }] },
  { id: 'slime', name: '沼泽史莱姆', level: 12, hp: 150, attack: 14, defence: 10, maxHit: 11, attackMs: 2800,
    drops: [{ item: 'coins', qty: 25 }, { item: 'slime_gel', qty: 1, chance: 0.6 }, { item: 'raw_trout', qty: 2, chance: 0.2 }] },
  { id: 'wolf', name: '灰狼', level: 22, hp: 260, attack: 22, defence: 24, maxHit: 11, attackMs: 2600,
    drops: [{ item: 'coins', qty: 50 }, { item: 'wolf_fang', qty: 1, chance: 0.5 }, { item: 'iron_ore', qty: 4, chance: 0.3 }] },
  { id: 'ash_wraith', name: '余烬怨灵', level: 35, hp: 450, attack: 34, defence: 40, maxHit: 16, attackMs: 2600,
    drops: [{ item: 'coins', qty: 110 }, { item: 'ash_core', qty: 1, chance: 0.35 }, { item: 'gem', qty: 1, chance: 0.05 }] },
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(monsters.map((m) => [m.id, m]));

const smith = (id: string, name: string, level: number, bar: string, bars: number, xpPerBar: number): ActionDef => ({
  id: `smith_${id}`, kind: 'skill', name, skill: 'smithing', level, durationMs: 3000 + bars * 500,
  xp: xpPerBar * bars, inputs: [{ item: bar, qty: bars }], outputs: [{ item: id, qty: 1 }],
});

const actions: ActionDef[] = [
  // 挖矿
  { id: 'mine_copper', kind: 'skill', name: '铜矿', skill: 'mining', level: 1, durationMs: 3000, xp: 10,
    outputs: [{ item: 'copper_ore', qty: 1 }, { item: 'gem', qty: 1, chance: 0.002 }] },
  { id: 'mine_tin', kind: 'skill', name: '锡矿', skill: 'mining', level: 1, durationMs: 3000, xp: 10,
    outputs: [{ item: 'tin_ore', qty: 1 }, { item: 'gem', qty: 1, chance: 0.002 }] },
  { id: 'mine_iron', kind: 'skill', name: '铁矿', skill: 'mining', level: 15, durationMs: 3500, xp: 26,
    outputs: [{ item: 'iron_ore', qty: 1 }, { item: 'gem', qty: 1, chance: 0.004 }] },
  { id: 'mine_coal', kind: 'skill', name: '煤矿', skill: 'mining', level: 30, durationMs: 4000, xp: 40,
    outputs: [{ item: 'coal', qty: 1 }, { item: 'gem', qty: 1, chance: 0.006 }] },
  // 伐木
  { id: 'chop_pine', kind: 'skill', name: '松树', skill: 'woodcutting', level: 1, durationMs: 3000, xp: 10,
    outputs: [{ item: 'pine_log', qty: 1 }] },
  { id: 'chop_oak', kind: 'skill', name: '橡树', skill: 'woodcutting', level: 15, durationMs: 3500, xp: 25,
    outputs: [{ item: 'oak_log', qty: 1 }] },
  { id: 'chop_willow', kind: 'skill', name: '柳树', skill: 'woodcutting', level: 30, durationMs: 4000, xp: 45,
    outputs: [{ item: 'willow_log', qty: 1 }] },
  // 钓鱼
  { id: 'fish_minnow', kind: 'skill', name: '浅滩银鱼', skill: 'fishing', level: 1, durationMs: 3000, xp: 10,
    outputs: [{ item: 'raw_minnow', qty: 1 }] },
  { id: 'fish_trout', kind: 'skill', name: '溪流鳟鱼', skill: 'fishing', level: 20, durationMs: 4000, xp: 30,
    outputs: [{ item: 'raw_trout', qty: 1 }] },
  { id: 'fish_salmon', kind: 'skill', name: '深潭鲑鱼', skill: 'fishing', level: 35, durationMs: 4500, xp: 50,
    outputs: [{ item: 'raw_salmon', qty: 1 }] },
  // 冶炼与锻造
  { id: 'smelt_bronze', kind: 'skill', name: '冶炼青铜锭', skill: 'smithing', level: 1, durationMs: 3000, xp: 8,
    inputs: [{ item: 'copper_ore', qty: 1 }, { item: 'tin_ore', qty: 1 }], outputs: [{ item: 'bronze_bar', qty: 1 }] },
  { id: 'smelt_iron', kind: 'skill', name: '冶炼铁锭', skill: 'smithing', level: 15, durationMs: 3500, xp: 18,
    inputs: [{ item: 'iron_ore', qty: 1 }], outputs: [{ item: 'iron_bar', qty: 1 }] },
  { id: 'smelt_steel', kind: 'skill', name: '冶炼钢锭', skill: 'smithing', level: 30, durationMs: 4000, xp: 32,
    inputs: [{ item: 'iron_ore', qty: 1 }, { item: 'coal', qty: 2 }], outputs: [{ item: 'steel_bar', qty: 1 }] },
  smith('bronze_sword', '锻造青铜剑', 1, 'bronze_bar', 1, 12),
  smith('bronze_helm', '锻造青铜头盔', 3, 'bronze_bar', 1, 12),
  smith('bronze_body', '锻造青铜胸甲', 8, 'bronze_bar', 3, 12),
  smith('iron_sword', '锻造铁剑', 16, 'iron_bar', 1, 25),
  smith('iron_helm', '锻造铁头盔', 18, 'iron_bar', 1, 25),
  smith('iron_body', '锻造铁胸甲', 22, 'iron_bar', 3, 25),
  smith('steel_sword', '锻造钢剑', 31, 'steel_bar', 1, 40),
  smith('steel_body', '锻造钢胸甲', 35, 'steel_bar', 3, 40),
  // 烹饪
  { id: 'cook_minnow', kind: 'skill', name: '烤银鱼', skill: 'cooking', level: 1, durationMs: 2500, xp: 10,
    inputs: [{ item: 'raw_minnow', qty: 1 }], outputs: [{ item: 'minnow', qty: 1 }],
    fail: { chance: 0.4, noFailLevel: 20, item: 'burnt_fish' } },
  { id: 'cook_trout', kind: 'skill', name: '烤鳟鱼', skill: 'cooking', level: 15, durationMs: 3000, xp: 28,
    inputs: [{ item: 'raw_trout', qty: 1 }], outputs: [{ item: 'trout', qty: 1 }],
    fail: { chance: 0.4, noFailLevel: 40, item: 'burnt_fish' } },
  { id: 'cook_salmon', kind: 'skill', name: '烤鲑鱼', skill: 'cooking', level: 30, durationMs: 3500, xp: 45,
    inputs: [{ item: 'raw_salmon', qty: 1 }], outputs: [{ item: 'salmon', qty: 1 }],
    fail: { chance: 0.4, noFailLevel: 55, item: 'burnt_fish' } },
  // 战斗区域
  { id: 'fight_rabbit', kind: 'combat', name: '野兔草坡', difficulty: 'EASY', level: 1, monster: 'rabbit' },
  { id: 'fight_crab', kind: 'combat', name: '碎石滩', difficulty: 'EASY', level: 5, monster: 'crab' },
  { id: 'fight_slime', kind: 'combat', name: '雾沼', difficulty: 'MEDIUM', level: 12, monster: 'slime' },
  { id: 'fight_wolf', kind: 'combat', name: '狼嚎林', difficulty: 'MEDIUM', level: 22, monster: 'wolf' },
  { id: 'fight_ash', kind: 'combat', name: '余烬荒原', difficulty: 'HARD', level: 35, monster: 'ash_wraith' },
];

export const ACTIONS: Record<string, ActionDef> = Object.fromEntries(actions.map((a) => [a.id, a]));

/** 地图上可点击的资源点，坐标单位为格子 */
export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  sprite: 'rock' | 'tree' | 'water' | 'anvil' | 'campfire' | 'monster';
  actions: string[];
}

export const NODES: MapNode[] = [
  { id: 'mine', name: '矿洞口', x: 7, y: 6, sprite: 'rock', actions: ['mine_copper', 'mine_tin', 'mine_iron', 'mine_coal'] },
  { id: 'forest', name: '林场', x: 31, y: 6, sprite: 'tree', actions: ['chop_pine', 'chop_oak', 'chop_willow'] },
  { id: 'lake', name: '镜湖码头', x: 30, y: 16, sprite: 'water', actions: ['fish_minnow', 'fish_trout', 'fish_salmon'] },
  { id: 'forge', name: '铁匠铺', x: 17, y: 13, sprite: 'anvil',
    actions: ['smelt_bronze', 'smelt_iron', 'smelt_steel', 'smith_bronze_sword', 'smith_bronze_helm', 'smith_bronze_body',
      'smith_iron_sword', 'smith_iron_helm', 'smith_iron_body', 'smith_steel_sword', 'smith_steel_body'] },
  { id: 'kitchen', name: '篝火', x: 22, y: 15, sprite: 'campfire', actions: ['cook_minnow', 'cook_trout', 'cook_salmon'] },
  { id: 'wilds', name: '城外战场', x: 9, y: 22, sprite: 'monster',
    actions: ['fight_rabbit', 'fight_crab', 'fight_slime', 'fight_wolf', 'fight_ash'] },
];

export const MAP_W = 40;
export const MAP_H = 30;
