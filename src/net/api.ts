import type { GameState, GmBuff, ItemStack, SkillId } from '../core/types';
import { combatLevel, level } from '../core/sim';

/**
 * 联机接口层（10-25）：界面只认这里的类型和 OnlineApi，不直接碰具体后端。
 * 后端还没选定，先有一个本地假实现（local.ts）让界面能做出来；选定后加一个实现换上去。
 */

export interface Profile {
  id: string;
  /** 8 位数字 ID，给别人加好友用 */
  pid?: number;
  name: string;
  /** 衣橱外观 id，别的玩家看到的样子 */
  outfit?: string;
  guildId?: string | null;
  guildTag?: string;
}

/** 排行榜：总等级 = 所有技能等级之和；也可以按单个技能或战斗等级排 */
export type Board = 'total' | 'combat' | SkillId;
export interface RankRow {
  rank: number;
  playerId: string;
  name: string;
  guildTag?: string;
  value: number;
  /** 按技能排时，同级再比经验 */
  xp?: number;
}

export type GuildRole = 'leader' | 'officer' | 'member';
export interface Guild {
  id: string;
  name: string;
  /** 2-4 个字的会标，显示在名字前 */
  tag: string;
  notice: string;
  level: number;
  xp: number;
  members: number;
  maxMembers: number;
  /** 申请制还是直接加入 */
  open: boolean;
  /** 成员从公会仓库取东西要多少累计贡献（-1 = 只有会长和副会长能取） */
  takeMin: number;
  /** 公会贡献值：成员兑换、交任务时和公会经验一起涨，会长和副会长花（开私人仓库） */
  points: number;
  /** 公会科技等级（10-27） */
  tech: Partial<Record<import('../core/guild').TechId, number>>;
  /** 普通成员每天最多从公共仓库取多少金币价值的东西（0 = 不限） */
  takeDay: number;
}
/** 公会动态（10-27）：kind = join/leave/role/level/tech/vault/task */
export interface GuildEvent { kind: string; name: string; detail: string; at: number }
/** 自己今天兑换了多少贡献、从公共仓库取了多少金币价值、签到没有 */
export interface GuildDay { exchanged: number; took: number; checkedIn: boolean }
/** 私人仓库（vault 1-3）：allow 是能进的成员，officers = 副会长都能进；会长总能进 */
export interface GuildVault { idx: number; name: string; allow: string[]; officers: boolean }
export interface GuildMember {
  playerId: string;
  name: string;
  role: GuildRole;
  totalLevel: number;
  /** 本周贡献（week 是这周一的 UTC 日期，不是这周的话就当 0） */
  weekly: number;
  week?: string;
  /** 累计贡献 */
  contrib: number;
  /** 在公会商店花掉的贡献（可用 = contrib - spent） */
  spent: number;
  lastSeen: number;
}
/** 公会仓库流水：qty 正数存入、负数取出 */
export interface GuildBankLog { vault: number; name: string; item: string; qty: number; at: number }
export interface GuildTask {
  id: string;
  /** 上交物品或做到某个计数 */
  kind: 'donate' | 'kills' | 'craft';
  target: string;
  need: number;
  have: number;
  /** 每交一个得几点贡献（同时给公会同样多的经验） */
  per: number;
  /** 交满后公会额外拿的经验 */
  reward: number;
  endsAt: number;
}

/** 地图上的其他玩家：只同步位置和在做什么，频率很低（每几秒一次） */
export interface Presence {
  playerId: string;
  name: string;
  guildTag?: string;
  outfit?: string;
  x: number;
  y: number;
  mounted?: string;
  /** 当前任务的动作 id，用来摆采集/战斗动作 */
  action?: string;
  /** 点开别的玩家时看的信息：数字 ID、等级、身上的装备 */
  pid?: number;
  total?: number;
  combat?: number;
  equip?: Partial<Record<string, string>>;
  /** 血量（队伍栏用） */
  hp?: number;
  maxHp?: number;
  /** 正在播的干活动画（work-mine、fight-sword…）和朝向；没在干活就没有 */
  anim?: string;
  flip?: boolean;
  /** 队长发起召集的时间（毫秒），队友看到就寻路过来 */
  rally?: number;
  /** 开着的副本洞口（10-25），队友可以进同一个 */
  gates?: import('../core/types').DungeonGate[];
  /** 在副本里（10-25 同步）：哪个洞口、第几层、进度、在副本里的像素位置和动作 */
  dg?: DungeonPresence;
  /** 野外组队打怪（10-27）：打的哪个点的怪（动作 id）、第几只、对它累计打了多少、最近一下暴击没有 */
  fd?: FieldHit;
  at: number;
  /** AI 玩家（10-31，见 bots.ts） */
  bot?: boolean;
  /** 发送序号（发送方的毫秒时钟，单调递增）：在线状态和移动广播谁新用谁，见 presenceSync.ts */
  s?: number;
}

export interface FieldHit {
  k: string;
  n: number;
  dmg: number;
  crit?: boolean;
}

export interface DungeonPresence {
  gate: string;
  floor: number;
  idx: number;
  phase: string;
  kills: number;
  x: number;
  y: number;
  anim?: string;
  flip?: boolean;
  /** 自己对当前这只怪一共打了多少伤害、最近一下是不是暴击（10-26：队友那边记到同一只怪上、飘字） */
  dmg?: number;
  crit?: boolean;
}

export type ChatChannel = 'world' | 'guild' | 'party' | 'private';
export interface ChatMsg {
  id: string;
  channel: ChatChannel;
  playerId: string;
  name: string;
  /** 私聊的对象 */
  toId?: string;
  text: string;
  at: number;
  /** AI 玩家的话自带中文翻译（10-31，见 i18n/bot-zh.ts） */
  zh?: string;
}

export interface Friend {
  playerId: string;
  pid: number;
  name: string;
  /** false：还在申请中 */
  accepted: boolean;
  /** 申请是对方发来的 */
  incoming: boolean;
  totalLevel?: number;
  combat?: number;
  guildTag?: string;
  lastSeen?: number;
  /** 注册时间（毫秒） */
  createdAt?: number;
}
/** 好友交易：mine / theirs 是 {物品 id: 数量}，东西都从仓库出 */
export interface Trade {
  id: string;
  otherId: string;
  mine: Record<string, number>;
  theirs: Record<string, number>;
  myOk: boolean;
  theirOk: boolean;
  status: 'open' | 'done' | 'cancelled';
  /** 成交后自己这边领取过了 */
  claimed: boolean;
  updatedAt: number;
}
export interface Party {
  id: string;
  leader: string;
  members: { playerId: string; name: string }[];
}
export interface PartyInvite { partyId: string; fromId: string; fromName: string }

export interface OnlineApi {
  readonly kind: string;
  /** 当前登录的玩家；没登录是 null，单机照常玩 */
  me(): Profile | null;
  /** 已登录账号（可能还没建角色） */
  signedIn(): boolean;
  /** 读出上次的登录状态；之后 me() 才准。连不上服务器时抛错 */
  ready(): Promise<Profile | null>;
  /** 登录/注册后返回角色；账号还没建角色时是 null */
  signIn(email: string, password: string): Promise<Profile | null>;
  signUp(email: string, password: string): Promise<Profile | null>;
  /** 新账号建角色：起名、选外观 */
  createProfile(name: string, outfit: string): Promise<Profile>;
  signOut(): Promise<void>;
  rename(name: string): Promise<void>;

  /** 云存档：存的是整个 GameState；冲突时比 lastTick，新的赢 */
  pullSave(): Promise<GameState | null>;
  /** 存档上传时带上设备 id，好认出是不是别的设备传的 */
  pushSave(s: GameState, device?: string): Promise<void>;
  /** 云端存档的 lastTick 和上传它的设备（不下载整份存档），没有就是 null */
  cloudHead(): Promise<{ tick: number; device?: string } | null>;

  /** 排行榜读的是 pushSave 时顺便写的等级快照 */
  leaderboard(board: Board, limit?: number): Promise<RankRow[]>;
  myRank(board: Board): Promise<RankRow | null>;

  guild(id?: string): Promise<Guild | null>;
  searchGuilds(q: string): Promise<Guild[]>;
  createGuild(name: string, tag: string): Promise<Guild>;
  joinGuild(id: string): Promise<void>;
  leaveGuild(): Promise<void>;
  guildMembers(id: string): Promise<GuildMember[]>;
  setRole(playerId: string, role: GuildRole): Promise<void>;
  kick(playerId: string): Promise<void>;
  setNotice(text: string): Promise<void>;
  guildTasks(): Promise<GuildTask[]>;
  /** 今天还没有任务就写进去（客户端按 core/guild.ts dailyTasks 算好） */
  ensureGuildTasks(tasks: import('../core/guild').TaskSpec[]): Promise<void>;
  /** 上交物品：本地先扣，服务器记账，返回实际收下的数量（多的退回） */
  contribute(taskId: string, qty: number): Promise<number>;
  /** 物品兑换贡献：价格按服务器上的价格表，本地先扣，返回实际收下的数量（每天有上限） */
  exchangeItems(item: string, qty: number): Promise<number>;
  /** 10-27：今天的兑换/取物/签到、每日签到（返回得到的贡献）、公会商店（返回买到的数量）、升级科技（返回新等级）、公会动态 */
  guildDay(): Promise<GuildDay>;
  guildCheckin(): Promise<number>;
  buyGuildItem(item: string, qty: number): Promise<number>;
  upgradeTech(kind: string): Promise<number>;
  guildEvents(): Promise<GuildEvent[]>;
  /** 会长：普通成员每天从公共仓库取物的价值上限 */
  setTakeDay(value: number): Promise<void>;
  /**
   * 公会仓库（10-26）：vault 0 = 公共仓库，1-3 = 私人仓库。返回按显示顺序排好的 [物品 id, 数量]；
   * 存取记录（自己能进的仓库的）、存（本地先扣）、取（返回实际取到的）、整理（按给的顺序重排）
   */
  guildBank(vault: number): Promise<[string, number][]>;
  guildBankLog(): Promise<GuildBankLog[]>;
  guildDeposit(item: string, qty: number, vault: number): Promise<void>;
  guildWithdraw(item: string, qty: number, vault: number): Promise<number>;
  sortGuildBank(vault: number, items: string[]): Promise<void>;
  /** 私人仓库列表（本会所有人都看得到名字）、开一个（返回编号）、改名字和名单 */
  guildVaults(): Promise<GuildVault[]>;
  openVault(name: string): Promise<number>;
  setVault(idx: number, name: string, allow: string[], officers: boolean): Promise<void>;
  /** 会长：成员从公共仓库取东西的贡献门槛 */
  setTakeMin(min: number): Promise<void>;

  /** 实时：返回取消订阅函数 */
  publishPresence(p: Omit<Presence, 'playerId' | 'name' | 'at'>): void;
  onPresence(f: (all: Presence[]) => void): () => void;
  /** 私聊要给 toId */
  sendChat(channel: ChatChannel, text: string, toId?: string): Promise<void>;
  onChat(f: (m: ChatMsg) => void): () => void;

  friends(): Promise<Friend[]>;
  /** 按数字 ID 加好友：对方也申请过我就直接成为好友 */
  addFriend(pid: number): Promise<'sent' | 'accepted'>;
  answerFriend(fromId: string, accept: boolean): Promise<void>;
  removeFriend(playerId: string): Promise<void>;
  party(): Promise<Party | null>;
  partyInvites(): Promise<PartyInvite[]>;
  inviteParty(playerId: string): Promise<void>;
  answerParty(partyId: string, accept: boolean): Promise<void>;
  leaveParty(): Promise<void>;
  /** 队长：踢人、转让队长、解散 */
  kickParty(playerId: string): Promise<void>;
  promoteParty(playerId: string): Promise<void>;
  disbandParty(): Promise<void>;
  trades(): Promise<Trade[]>;
  /** 和好友开一笔交易（已有没结束的就返回那一笔） */
  startTrade(playerId: string): Promise<string>;
  setOffer(tradeId: string, items: Record<string, number>): Promise<void>;
  confirmTrade(tradeId: string, ok: boolean): Promise<'open' | 'done'>;
  cancelTrade(tradeId: string): Promise<void>;
  /** 成交后领取：只有第一次返回 true */
  claimTrade(tradeId: string): Promise<boolean>;
  /** 在线玩家最近一次同步的信息（点开别的玩家时用） */
  presenceOf(playerId: string): Presence | undefined;
  /** 在线玩家的 id（看好友在不在线） */
  onlineIds(): Set<string>;
  /** 全服在线人数（还没连上时是 null） */
  onlineCount(): number | null;
  /** 实时连接状态：ok 正常，failed 连不上（靠轮询同步），off 没开联机 */
  realtimeStatus(): 'connecting' | 'ok' | 'failed' | 'off';
  /** 到服务器跑一个来回要多少毫秒 */
  ping(): Promise<number>;
  /** 好友申请、组队邀请、队伍成员有变化 */
  onSocial(f: () => void): () => void;
  /** 玩家的注册时间（点开名片看，10-26） */
  joinedAt(playerId: string): Promise<number | null>;

  /** GM 增益（10-26）：自己身上的（全服的 + 单独给自己的），登录后定时拉 */
  myGmBuffs(): Promise<GmBuff[]>;
  /** 管理员：所有 GM 增益（含已过期的最近 100 条）、加、改、删。权限在服务器上检查 */
  gmList(): Promise<GmRow[]>;
  gmAdd(b: GmInput): Promise<void>;
  gmUpdate(id: string, b: Partial<GmInput>): Promise<void>;
  gmDelete(id: string): Promise<void>;

  /** GM 赠送物品（10-26）：发给自己、还没领的；领取（服务器上只成功一次） */
  myGmMail(): Promise<GmMail[]>;
  claimGmMail(id: string): Promise<boolean>;
  /** 管理员：发过的最近 100 封、发、删（删只对没领的有意义） */
  gmMailList(): Promise<GmMailRow[]>;
  gmMailSend(m: GmMailInput): Promise<void>;
  gmMailDelete(id: string): Promise<void>;

  /** AI 玩家（10-31）：所有人都能读名单，管理员能加、改名、删 */
  aiList(): Promise<AiPlayer[]>;
  aiAdd(list: { name: string; seed: number }[]): Promise<void>;
  aiRename(id: string, name: string): Promise<void>;
  aiDelete(ids: string[]): Promise<void>;
}

/** AI 玩家：服务器只存名字和种子，其余按种子和时间算（见 bots.ts）；at 是加入时间 */
export interface AiPlayer { id: string; name: string; seed: number; at: number }

export interface GmMail { id: string; title: string; body: string; items: ItemStack[]; at: number }
export interface GmMailRow extends GmMail { targetPid: number; targetName?: string; claimedAt: number | null }
export interface GmMailInput { targetPid: number; title: string; body: string; items: ItemStack[] }

/** 管理员面板里的一行：多了给谁（null = 全服） */
export interface GmRow extends GmBuff { targetPid: number | null; targetName?: string }
export type GmInput = Omit<GmBuff, 'id' | 'all'> & { targetPid: number | null };

/** 上传排行榜用的等级快照 */
export function levelSnapshot(s: GameState) {
  const skills = {} as Record<SkillId, number>;
  let total = 0;
  for (const k of Object.keys(s.xp) as SkillId[]) {
    skills[k] = level(s, k);
    total += skills[k];
  }
  return { total, combat: combatLevel(s), skills, xp: s.xp };
}

export const NAME_RE = /^[\p{L}\p{N}_]{2,12}$/u;
export const TAG_RE = /^[\p{L}\p{N}]{2,4}$/u;
export const GUILD_COST = 10000;
export const GUILD_MAX = 30;
