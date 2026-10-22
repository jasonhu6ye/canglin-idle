export type SkillId =
  // 采集
  | 'mining' | 'woodcutting' | 'fishing' | 'farming' | 'hunting' | 'thieving'
  // 生产
  | 'cooking' | 'smithing' | 'fletching' | 'herblore' | 'crafting' | 'enhancing'
  // 战斗
  | 'melee' | 'ranged' | 'magic' | 'defence' | 'hitpoints';

export type SkillGroup = 'gather' | 'produce' | 'combat';

export type CombatStyle = 'melee' | 'ranged' | 'magic';

export type GearSlot = 'weapon' | 'shield' | 'head' | 'body' | 'legs' | 'neck' | 'ring';
export type ToolSlot = 'pickaxe' | 'axe' | 'rod' | 'hoe' | 'knife' | 'gloves';
export type EquipSlot = GearSlot | ToolSlot;

export type ItemCategory = 'resource' | 'material' | 'food' | 'potion' | 'ammo' | 'gear' | 'tool' | 'seed' | 'misc';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  /** 卖给商店的价格（金币） */
  value: number;
  /** 分阶资源的阶级下标，0 = T1 */
  tier?: number;
  /** 食物和药水回复的生命值 */
  heals?: number;
  /** 弹药：ranged 用箭，magic 用符文；power 加到力量加成上 */
  ammo?: { style: 'ranged' | 'magic'; power: number };
  equip?: {
    slot: EquipSlot;
    /** 装备要求：skill 达到 level */
    skill: SkillId;
    level: number;
    attack: number;
    strength: number;
    defence: number;
    /** 武器决定战斗方式；护甲上的 style 表示攻击和力量加成只对这种战斗方式生效 */
    style?: CombatStyle;
    /** 工具：对应采集技能的速度加成，0.1 = 快 10% */
    speed?: number;
  };
}

export interface ItemStack {
  item: string;
  qty: number;
}

export interface Drop extends ItemStack {
  /** 0-1，省略即 100% */
  chance?: number;
}

/** 采集或制作：固定耗时，消耗 inputs，产出 outputs */
export interface SkillAction {
  id: string;
  kind: 'skill';
  name: string;
  skill: SkillId;
  level: number;
  durationMs: number;
  xp: number;
  inputs?: ItemStack[];
  outputs: Drop[];
  /**
   * 失败：在 level 时失败率为 chance，每级降低，到 noFailLevel 为 0。
   * 烹饪失败得到 item（烧焦）；偷窃被抓住晕眩 stunMs。
   */
  fail?: { chance: number; noFailLevel: number; item?: string; stunMs?: number };
}

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  attack: number;
  defence: number;
  maxHit: number;
  attackMs: number;
  drops: Drop[];
  boss?: boolean;
  /** 占位美术：用哪张精灵图、染什么颜色 */
  sprite: string;
  tint?: number;
}

export type RegionId = 'town' | 'snow' | 'highland' | 'coast' | 'lava' | 'abyss' | 'swamp' | 'woodland' | 'giantwood';

export interface CombatAction {
  id: string;
  kind: 'combat';
  name: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  level: number; // 推荐战斗等级
  monster: string;
}

export type ActionDef = SkillAction | CombatAction;

export type TaskMode =
  | { type: 'count'; count: number }
  | { type: 'time'; ms: number }
  | { type: 'infinite' };

export interface Task {
  action: string;
  mode: TaskMode;
  /** 已完成次数 / 已用时，用于判断 count/time 模式是否结束 */
  done: number;
  elapsedMs: number;
}

export interface CombatState {
  monsterHp: number;
  playerTimerMs: number;
  monsterTimerMs: number;
  respawnMs: number;
}

export interface Settings {
  /** 生命低于此比例时自动进食 */
  eatThreshold: number;
  /** 开始战斗时从仓库带多少份食物进背包，-1 = 全部 */
  carryFood: number;
}

export interface GameState {
  version: 3;
  lastTick: number;
  rng: number;
  xp: Record<SkillId, number>;
  hp: number;
  /** 仓库：容量不限，所有产出进这里 */
  bank: Record<string, number>;
  /** 背包：只放战斗消耗品，格数有限 */
  bag: Record<string, number>;
  equipment: Partial<Record<EquipSlot, string>>;
  queue: Task[];
  /** 当前任务（queue[0]）的进度 */
  progressMs: number;
  combat: CombatState | null;
  settings: Settings;
  /** 非战斗时回血的计时 */
  regenMs: number;
  stats: { kills: number; deaths: number };
}

export type TaskEndReason = 'complete' | 'noInput' | 'death' | 'level' | 'noAmmo';

/** 一次结算的汇总，用于离线收获弹窗和实时提示 */
export interface Summary {
  elapsedMs: number;
  xp: Partial<Record<SkillId, number>>;
  items: Record<string, number>;
  levelUps: { skill: SkillId; level: number }[];
  kills: Record<string, number>;
  deaths: number;
  foodEaten: number;
  ammoUsed: number;
  taskEnds: { action: string; reason: TaskEndReason }[];
}
