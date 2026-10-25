import type { GameState, SkillId } from '../core/types';
import { combatLevel, level } from '../core/sim';

/**
 * 联机接口层（10-25）：界面只认这里的类型和 OnlineApi，不直接碰具体后端。
 * 后端还没选定，先有一个本地假实现（local.ts）让界面能做出来；选定后加一个实现换上去。
 */

export interface Profile {
  id: string;
  name: string;
  /** 衣橱外观 id，别的玩家看到的样子 */
  outfit?: string;
  guildId?: string | null;
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
}
export interface GuildMember {
  playerId: string;
  name: string;
  role: GuildRole;
  totalLevel: number;
  /** 本周给公会贡献的经验 */
  weekly: number;
  lastSeen: number;
}
export interface GuildTask {
  id: string;
  /** 上交物品或做到某个计数 */
  kind: 'donate' | 'kills' | 'craft';
  target: string;
  need: number;
  have: number;
  /** 完成后公会经验 */
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
  at: number;
}

export interface ChatMsg {
  id: string;
  channel: 'world' | 'guild';
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface OnlineApi {
  readonly kind: string;
  /** 当前登录的玩家；没登录是 null，单机照常玩 */
  me(): Profile | null;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(email: string, password: string, name: string): Promise<Profile>;
  signOut(): Promise<void>;
  rename(name: string): Promise<void>;

  /** 云存档：存的是整个 GameState；冲突时比 lastTick，新的赢 */
  pushSave(s: GameState): Promise<void>;
  pullSave(): Promise<GameState | null>;

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
  /** 上交物品：本地先扣，服务器记账 */
  contribute(taskId: string, qty: number): Promise<void>;

  /** 实时：返回取消订阅函数 */
  publishPresence(p: Omit<Presence, 'playerId' | 'name' | 'at'>): void;
  onPresence(f: (all: Presence[]) => void): () => void;
  sendChat(channel: ChatMsg['channel'], text: string): Promise<void>;
  onChat(f: (m: ChatMsg) => void): () => void;
}

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
