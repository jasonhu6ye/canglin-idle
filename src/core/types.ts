export type SkillId =
  // 采集
  | 'mining' | 'woodcutting' | 'fishing' | 'gathering' | 'farming' | 'hunting' | 'thieving' | 'husbandry'
  // 生产
  | 'cooking' | 'smithing' | 'fletching' | 'herblore' | 'crafting' | 'enhancing'
  // 战斗
  | 'melee' | 'ranged' | 'magic' | 'defence' | 'hitpoints';

export type SkillGroup = 'gather' | 'produce' | 'combat';

export type CombatStyle = 'melee' | 'ranged' | 'magic';

/** mount：坐骑栏（用户 10-23 要求先留好栏位，坐骑以后加） */
export type GearSlot = 'weapon' | 'head' | 'body' | 'feet' | 'hands' | 'neck' | 'ring' | 'mount';
export type ToolSlot = 'axe' | 'pickaxe' | 'sickle' | 'knife' | 'rod' | 'hoe' | 'hammer' | 'needle';
export type EquipSlot = GearSlot | ToolSlot;

/** 料理增益：攻击（命中）、力量（最高伤害）、防御、干活速度、经验 */
export type BeltSlot = 'food' | 'potion';
export type BuffKind = 'atk' | 'str' | 'def' | 'speed' | 'xp';
export interface Buff { kind: BuffKind; pct: number; ms: number }

export type ItemCategory = 'resource' | 'material' | 'food' | 'potion' | 'ammo' | 'gear' | 'tool' | 'seed' | 'loot' | 'deco' | 'misc';

/** 宝箱、福袋打开后：先给一把金币，再从奖池里按权重抽 rolls 次 */
export interface LootTable {
  coins: [number, number];
  rolls: number;
  pool: { item: string; min: number; max: number; w: number }[];
}

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
  /** 料理吃下后的限时增益 */
  buff?: Buff;
  /** 图鉴里的说明 */
  desc?: string;
  /** 弹药：ranged 用箭，magic 用符文；power 加到力量加成上 */
  ammo?: { style: 'ranged' | 'magic'; power: number };
  /** 宝箱、福袋：可以打开 */
  opens?: LootTable;
  /** 战利品图标：首领战旗、首领战利品按哪个首领画 */
  boss?: string;
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
    /** 工具：对应技能的速度加成，0.1 = 快 10% */
    speed?: number;
    /** 武器：每次攻击间隔（毫秒），不填用默认 */
    attackMs?: number;
    /** 坐骑：骑上后移动速度加成，1 = +100% */
    move?: number;
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
  /** 用哪个工具加速；不填按技能默认 */
  tool?: ToolSlot;
}

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  /** 0-7 对应 T1-T8 */
  tier: number;
  rank: 'normal' | 'elite' | 'boss';
  boss?: boolean;
  /** 种族大类和外形（外形决定动画怎么画） */
  family: string;
  form: string;
  region: RegionId;
  /** 战斗特性，见 bestiary.ts 的 TRAITS */
  traits: string[];
  /** 生物（动物，掉兽皮兽肉）还是怪物（掉魔核） */
  kind: 'creature' | 'monster';
  hp: number;
  attack: number;
  defence: number;
  maxHit: number;
  attackMs: number;
  respawnMs: number;
  drops: Drop[];
  art: { color: string; accent: string };
  /** 世界首领：专属动画、大招（每第 4 下）和宝库掉落 */
  world?: boolean;
}

export type RegionId = 'town' | 'snow' | 'highland' | 'coast' | 'lava' | 'abyss' | 'swamp' | 'woodland' | 'giantwood'
  // 8848 大地图外圈的新区域（用户 10-23）
  | 'savanna' | 'autumn' | 'jungle' | 'tropic' | 'canyon' | 'desert' | 'alpine' | 'crystal'
  // 12080 最外圈的新群系（用户 10-24）
  | 'hills' | 'vineisles' | 'moonmire' | 'archipelago' | 'frostpeak' | 'ashcape' | 'thunder' | 'starsea';

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
  /** 战斗任务：开打前已经回仓库补过食物（或者不用补） */
  stocked?: boolean;
  /** 战斗任务：连续阵亡次数，打死一只清零 */
  deathStreak?: number;
}

export interface CombatState {
  monsterHp: number;
  playerTimerMs: number;
  monsterTimerMs: number;
  respawnMs: number;
  /** 出手次数和最近一次伤害（-1 = 没打中），只给画面做飘字用 */
  pSwings?: number;
  pDmg?: number;
  mSwings?: number;
  mDmg?: number;
  /** 最近一次出手是不是暴击（飘字用） */
  pCrit?: boolean;
  /** 怪物最近一次出手：elite / boss 大招，enrage 刚进入狂怒 */
  mArt?: string;
  /** 首领已经狂怒了 */
  enraged?: boolean;
  /** 这一只怪打到现在拿了多少经验（击杀时记进战斗日志） */
  gain?: Partial<Record<SkillId, number>>;
}

/** 日志的一条：击杀（掉落和经验）、阵亡、采集制作完成一次（fail = 失手） */
export interface CombatLogEntry {
  t: number;
  kind: 'kill' | 'death' | 'skill' | 'fail';
  /** 战斗记怪物 id，采集制作记动作 id */
  monster?: string;
  action?: string;
  /** 种田：收获的作物 id（auto = 自动补种时收的） */
  crop?: string;
  auto?: boolean;
  /** 种田：这条日志合并了几格 */
  n?: number;
  xp: Partial<Record<SkillId, number>>;
  items: Record<string, number>;
}

export interface Settings {
  /** 生命低于此比例时自动进食 */
  eatThreshold: number;
  /** 开始战斗时从仓库带多少份食物进背包，-1 = 全部 */
  carryFood: number;
  /** false = 战斗不带药水：不补药水栏，也不喝 */
  carryPotion?: boolean;
  /** 衣橱里选中的外观 */
  skin?: string;
  /** 种田：每块田「一键种满」用的种子 */
  farmSeed?: Record<string, string>;
  /** 种田：哪些田开了自动补种（熟了自动收、再种同一种，离线也照样） */
  autoFarm?: Record<string, boolean>;
  /** 种田：每块田种下时施哪种肥料（fert_basic / fert_rich），不选就不施 */
  farmFert?: Record<string, string>;
}

/** 一格地：种下的作物、种下的时刻、成熟的时刻；浇过水成熟得早 */
export interface Plot {
  crop: string;
  at: number;
  ripe: number;
  water?: boolean;
  /** 施了肥：1 普通肥料、2 高级肥料 */
  fert?: 1 | 2;
}

/** 家园岛屿上摆的一件东西：左上角所在的格子 */
export interface HomeThing { id: string; x: number; y: number }

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
  /** 每种怪物击杀数（怪物图鉴用），旧存档没有 */
  /** 装备栏里的食物栏和药水栏：各放一种，不占背包格子 */
  belt?: Partial<Record<BeltSlot, { id: string; qty: number }>>;
  /** 料理增益：每种只保留一个，剩余毫秒 */
  buffs?: Partial<Record<BuffKind, { pct: number; ms: number }>>;
  /** 新手任务：第几个、当前进度 */
  quest?: { i: number; n: number };
  bestiary?: Record<string, number>;
  /** 骑在坐骑上（坐骑栏有坐骑时才有效） */
  mounted?: boolean;
  /** 用过的兑换码，每个存档只能领一次 */
  redeemed?: string[];
  /** 角色所在的格子（寻路的起点） */
  loc: { x: number; y: number };
  /** 存档时的地图边长；地图扩大后用来换算旧位置 */
  mapSize?: number;
  /** 正在自动寻路去当前任务的地点；到达前任务不开始 */
  /** 自动寻路：via 是顺路用的两座石碑（先走到第一座，传到第二座） */
  travel: { to: string; ms: number; total: number; via?: [string, string] } | null;
  /** 玩家手动寻路（没有任务或已暂停时）：关掉游戏也照样走完 */
  walk?: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number; total: number } | null;
  /** 玩家点地图走开了：队列保留但不干活，点「继续工作」才走回去 */
  paused?: boolean;
  /** 图鉴：获得过的物品 */
  seen: Record<string, 1>;
  /** 激活过的传说石碑 */
  waystones?: string[];
  /** 田里种着的地块（地块 id → 作物），空地不存 */
  farm?: Record<string, Plot>;
  /** 最近一次任务停下的原因（顶部提示条用，排新任务或点掉就清空） */
  /** 家园岛屿：扩建等级、地板、摆的东西、人在不在岛上、从哪个传送门进去的 */
  home?: { lv: number; floors: Record<string, string>; things: HomeThing[]; inside?: boolean; from?: string };
  /** 装了洒水器的田 */
  sprinklers?: string[];
  lastStop?: { action: string; reason: TaskEndReason; mode: TaskMode; item?: string; at: number } | null;
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
  /** 背包满了回仓库存东西的次数 */
  bankTrips: number;
  ammoUsed: number;
  taskEnds: { action: string; reason: TaskEndReason }[];
  /** 这段时间完成的新手任务（序号） */
  quests?: number[];
  /** 战斗日志（只留最近 LOG_CAP 条） */
  log?: CombatLogEntry[];
  /** 这次激活的传说石碑 */
  waystones?: string[];
}
