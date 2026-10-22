export type SkillId =
  | 'mining'
  | 'woodcutting'
  | 'fishing'
  | 'smithing'
  | 'cooking'
  | 'melee'
  | 'hitpoints';

export type EquipSlot = 'weapon' | 'head' | 'body';

export interface ItemDef {
  id: string;
  name: string;
  /** 卖给商店的价格（金币） */
  value: number;
  /** 食物回复的生命值 */
  heals?: number;
  equip?: {
    slot: EquipSlot;
    level: number; // 需要的近战等级
    attack: number;
    strength: number;
    defence: number;
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
  /** 烹饪烧焦：level 时的失败率，每级降低，到 noFailLevel 为 0 */
  fail?: { chance: number; noFailLevel: number; item: string };
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
}

export interface CombatAction {
  id: string;
  kind: 'combat';
  name: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  level: number; // 推荐近战等级
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
}

export interface GameState {
  version: 1;
  lastTick: number;
  rng: number;
  xp: Record<SkillId, number>;
  hp: number;
  bank: Record<string, number>;
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

export type TaskEndReason = 'complete' | 'noInput' | 'death' | 'level';

/** 一次结算的汇总，用于离线收获弹窗和实时提示 */
export interface Summary {
  elapsedMs: number;
  xp: Partial<Record<SkillId, number>>;
  items: Record<string, number>;
  levelUps: { skill: SkillId; level: number }[];
  kills: Record<string, number>;
  deaths: number;
  foodEaten: number;
  taskEnds: { action: string; reason: TaskEndReason }[];
}
