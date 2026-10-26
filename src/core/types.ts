export type SkillId =
  // 采集
  | 'mining' | 'woodcutting' | 'fishing' | 'gathering' | 'farming' | 'hunting' | 'thieving' | 'husbandry'
  // 生产
  | 'cooking' | 'smithing' | 'fletching' | 'herblore' | 'crafting' | 'enhancing'
  // 战斗
  | 'melee' | 'ranged' | 'magic' | 'defence' | 'hitpoints';

export type SkillGroup = 'gather' | 'produce' | 'combat';

export type CombatStyle = 'melee' | 'ranged' | 'magic';
export type ArmorKind = 'plate' | 'leather' | 'cloth';

/** mount：坐骑栏（用户 10-23 要求先留好栏位，坐骑以后加） */
export type GearSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'feet' | 'hands' | 'neck' | 'ring' | 'mount' | 'pack';
export type ToolSlot = 'axe' | 'pickaxe' | 'sickle' | 'knife' | 'rod' | 'hoe' | 'hammer' | 'needle' | 'pan';
export type EquipSlot = GearSlot | ToolSlot;

/** 料理增益：攻击（命中）、力量（最高伤害）、防御、干活速度、经验 */
export type BeltSlot = 'food' | 'potion';
export type BuffKind = 'atk' | 'str' | 'def' | 'speed' | 'xp';
export interface Buff { kind: BuffKind; pct: number; ms: number }
/** GM 增益（用户 10-26）：管理员加的，全服或指定玩家 */
export type GmKind = 'xp' | 'drop' | 'coins' | 'yield' | 'speed' | 'atk' | 'str' | 'def' | 'hp';
export interface GmBuff {
  id: string;
  name: string;
  /** 1-4 个字的小标签，显示在增益栏图标下面 */
  tag: string;
  kind: GmKind;
  /** 百分比，50 = +50% */
  pct: number;
  /** 生效时间段（毫秒时间戳） */
  from: number;
  to: number;
  /** 全服的（否则是单独给这个玩家的） */
  all?: boolean;
}

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
  /** 装备和工具的品质：0 普通 … 5 神话 */
  quality?: number;
  /** 不带品质前缀的名字 */
  baseName?: string;
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
    /** 武器决定战斗方式；箭袋、魔法书上的 style 表示它的命中和攻击力只对这种战斗方式生效 */
    style?: CombatStyle;
    /** 工具：对应技能的速度加成，0.1 = 快 10% */
    speed?: number;
    /** 武器：每次攻击间隔（毫秒），不填用默认 */
    attackMs?: number;
    /** 坐骑：骑上后移动速度加成，1 = +100% */
    move?: number;
    /** 火把：攻击速度加成，0.1 = 出手间隔 ÷1.1 */
    haste?: number;
    /** 背包（10-26）：多几格背包 */
    bag?: number;
    /** 洞察者背包（10-26）：经验多拿这么多（0.1 = 10%），每多拿 1 点经验扣 1 金币，金币不够就不加 */
    sage?: number;
    /** 双手武器（双手大盾）：装上就不能用副手 */
    twoHanded?: boolean;
    /** 饰品（10-26）：生命上限（点数）、经验、掉率、暴击、闪避、干活速度（0.05 = 5%） */
    hp?: number;
    xp?: number;
    luck?: number;
    crit?: number;
    dodge?: number;
    work?: number;
    /** 护甲（10-26）：哪种护甲（算套装效果）、防御加成、伤害加成（0.05 = 5%） */
    armor?: ArmorKind;
    defPct?: number;
    dmgPct?: number;
    /** 嘲讽值（10-26）：板甲、双手大盾有，组队时怪物更爱打嘲讽高的人 */
    threat?: number;
    /** 灯笼（10-26）：吸血，打出伤害的这个比例回成自己的血（0.05 = 5%） */
    leech?: number;
  };
}

/** 邮件种类：标题和正文按种类在界面上生成，换语言也能跟着变 */
export type MailKind = 'hw_daily' | 'quest' | 'redeem' | 'hw_expired' | 'gift' | 'custom';
export interface Mail {
  id: number;
  kind: MailKind;
  at: number;
  /** 附件；金币用 'coins' */
  items: ItemStack[];
  /** 种类需要的参数：任务序号、兑换码等 */
  arg?: string;
  read?: boolean;
  claimed?: boolean;
  /** 到这个时间自动删掉（万圣节礼物活动结束就没了） */
  expires?: number;
  /** custom 邮件（管理员发的）自带标题和正文 */
  title?: string;
  body?: string;
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
  /** 活动限定首领（万圣节南瓜王）：要在活动祭坛召唤才能打 */
  event?: boolean;
  /** 副本里的怪（10-25）：哪种副本、第几层（0 起），外形和配色用 base 那只 */
  dungeon?: { kind: 'green' | 'blue'; floor: number; base: string };
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
  /** 这一下灯笼吸回了多少血 */
  pLeech?: number;
  /** 副本（10-26）：自己对这只怪一共打了多少伤害（发给队友）、怪的血量上限和开打时洞里有几个队友 */
  pTotal?: number;
  monsterMax?: number;
  crew?: number;
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
  stats: { kills: number; deaths: number; /** 洞察者背包一共烧掉的金币 */ sageCoins?: number };
  /** 每种怪物击杀数（怪物图鉴用），旧存档没有 */
  /** 装备栏里的食物栏和药水栏：各放一种，不占背包格子 */
  belt?: Partial<Record<BeltSlot, { id: string; qty: number }>>;
  /** 料理增益：每种只保留一个，剩余毫秒 */
  buffs?: Partial<Record<BuffKind, { pct: number; ms: number }>>;
  /** GM 增益（服务器下发） */
  gmBuffs?: GmBuff[];
  /** 新手任务：第几个、当前进度 */
  quest?: { i: number; n: number };
  bestiary?: Record<string, number>;
  /** 骑在坐骑上（坐骑栏有坐骑时才有效） */
  mounted?: boolean;
  /** 用过的兑换码，每个存档只能领一次 */
  redeemed?: string[];
  /** 邮箱（用户 10-25）：系统奖励都发到这里，领取后才进背包/仓库 */
  mail?: Mail[];
  /** 已经发过的系统邮件（比如某天的登录礼物），防止重复发 */
  mailKeys?: string[];
  /** 邮件编号计数 */
  mailSeq?: number;
  /** 畜牧站的栏位：每栏一匹小马崽，start 放进去的时间，ms 要长多久（放进去时按养殖等级算好） */
  ranch?: { pens: ({ start: number; ms: number } | null)[] };
  /** 万圣节活动：当前召唤出来的是第几档南瓜王（打赢就清掉）、上次召唤的时间 */
  halloween?: { summoned?: number; last?: number };
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
  /** 副本洞口（10-25）：自己用钥匙开的，30 分钟后消失 */
  gates?: DungeonGate[];
  /** 进过的洞口 id（通关（开了宝箱）的洞口 id，通关后不能再进） */
  gatesUsed?: string[];
  /** 没通关就出来的副本进度（阵亡、离开、回城卷轴）：洞口没消失前再进接着打（用户 10-25） */
  dgResume?: DungeonRun[];
  /** 上次开洞口的时间（冷却用） */
  lastGateAt?: number;
  /** 正在打的副本；不在副本里是 null */
  dungeon?: DungeonRun | null;
}

/** 副本洞口：开门时就定好层数和随机种子，队友进同一个洞口地形一样 */
export interface DungeonGate {
  id: string;
  kind: 'green' | 'blue';
  /** 阶级下标 3-7（T4-T8） */
  tier: number;
  x: number;
  y: number;
  /** 开门时间、消失时间（毫秒） */
  at: number;
  expires: number;
  seed: number;
  floors: number;
  /** 队友的洞口：谁开的 */
  owner?: string;
}

/**
 * 副本进度：按层、按这一层第几个停靠点推进。
 * phase：walk 正在走向下一个停靠点（怪、楼梯或宝箱），fight 正在打，chest 打完了等开宝箱，open 宝箱开过了。
 */
export interface DungeonRun {
  gate: DungeonGate;
  floor: number;
  idx: number;
  phase: 'walk' | 'fight' | 'chest' | 'open';
  /** 走路剩余、本段总时长 */
  ms: number;
  total: number;
  /** 进副本时队伍几个人（蓝洞的协战加成按这个算，离线也一样） */
  party: number;
  kills: number;
  /** 宝箱品质 0 绿 1 蓝 2 紫 3 金（打完首领时定）、开出来的东西 */
  chest?: number;
  loot?: Record<string, number>;
  started: number;
  /** 这一趟打怪拿到的东西合计 */
  got?: Record<string, number>;
  /** 组队进的：进副本时的队员（按 id 排好）和自己是谁；开箱时定好的每人一份（下标对应 members） */
  members?: { id: string; name: string }[];
  me?: string;
  split?: Record<string, number>[];
  /** 这一趟对怪打出过伤害的队员 id（10-26：宝箱只分给他们） */
  contrib?: string[];
  /** 最近打死的一只怪：最后一下的伤害、是不是自己打的（画面补放最后一击和死亡动画） */
  lastHit?: { floor: number; idx: number; dmg: number; crit?: boolean; mine: boolean };
}

export type TaskEndReason = 'complete' | 'noInput' | 'death' | 'level' | 'noAmmo' | 'summon';

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
  /** 副本：这次结算里阵亡被送出副本 */
  dungeon?: { dead?: boolean };
}
