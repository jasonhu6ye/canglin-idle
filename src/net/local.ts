import type { GameState } from '../core/types';
import type { GmInput, GmRow, Board, ChatChannel, ChatMsg, Friend, Party, PartyInvite, Trade, Guild, GuildMember, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { GUILD_MAX, levelSnapshot } from './api';
import { tl } from '../i18n';

/**
 * 本地假后端：数据放 localStorage，只有你自己。用来在后端接好前把排行榜和公会界面做出来、跑测试。
 * 换真后端时界面不用改。
 */
const KEY = 'canglin-net-local';

interface Db {
  session?: boolean;
  me: Profile | null;
  save: GameState | null;
  snap: ReturnType<typeof levelSnapshot> | null;
  guilds: Guild[];
  members: Record<string, GuildMember[]>;
  tasks: GuildTask[];
  chat: ChatMsg[];
  gm?: GmRow[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

export class LocalApi implements OnlineApi {
  readonly kind = 'local';
  private db: Db;
  private chatFns = new Set<(m: ChatMsg) => void>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    let db: Db | null = null;
    try { db = JSON.parse(storage.getItem(KEY) ?? 'null'); } catch { db = null; }
    this.db = db ?? { me: null, save: null, snap: null, guilds: [], members: {}, tasks: [], chat: [] };
  }
  private flush() {
    try { this.storage.setItem(KEY, JSON.stringify(this.db)); } catch { /* 存不了就算了 */ }
  }
  private need() {
    if (!this.db.me) throw new Error(tl('请先登录'));
    return this.db.me;
  }
  private myGuild() {
    const g = this.db.guilds.find((x) => x.id === this.db.me?.guildId);
    if (!g) throw new Error(tl('还没加入公会'));
    return g;
  }

  me() { return this.db.session ? this.db.me : null; }
  signedIn() { return !!this.db.session; }
  async ready() { return this.me(); }
  async signIn(_email?: string, _pw?: string) {
    this.db.session = true;
    this.flush();
    return this.me();
  }
  async signUp(_email?: string, _pw?: string) { return this.signIn(); }
  async createProfile(name: string, outfit: string) {
    if (!this.db.session) throw new Error(tl('请先登录'));
    this.db.me = { id: uid(), name, outfit };
    this.flush();
    return this.db.me;
  }
  async signOut() { this.db.session = false; this.flush(); }
  async rename(name: string) { this.need().name = name; this.flush(); }

  async pushSave(s: GameState) {
    this.need();
    this.db.save = s;
    this.db.snap = levelSnapshot(s);
    this.flush();
  }
  async pullSave() { return this.db.save; }
  async cloudHead() { return this.db.save ? { tick: this.db.save.lastTick } : null; }

  private row(board: Board): RankRow | null {
    const me = this.db.me, snap = this.db.snap;
    if (!me || !snap) return null;
    const value = board === 'total' ? snap.total : board === 'combat' ? snap.combat : snap.skills[board] ?? 1;
    const tag = this.db.guilds.find((g) => g.id === me.guildId)?.tag;
    return { rank: 1, playerId: me.id, name: me.name, guildTag: tag, value, xp: board in snap.xp ? snap.xp[board as keyof typeof snap.xp] : undefined };
  }
  async leaderboard(board: Board) { const r = this.row(board); return r ? [r] : []; }
  async myRank(board: Board) { return this.row(board); }

  async guild(id?: string) { return this.db.guilds.find((g) => g.id === (id ?? this.db.me?.guildId)) ?? null; }
  async searchGuilds(q: string) { return this.db.guilds.filter((g) => g.name.includes(q) || g.tag.includes(q)); }
  async createGuild(name: string, tag: string) {
    const me = this.need();
    if (me.guildId) throw new Error(tl('已经在公会里了'));
    const g: Guild = { id: uid(), name, tag, notice: '', level: 1, xp: 0, members: 1, maxMembers: GUILD_MAX, open: true };
    this.db.guilds.push(g);
    this.db.members[g.id] = [{ playerId: me.id, name: me.name, role: 'leader', totalLevel: this.db.snap?.total ?? 0, weekly: 0, lastSeen: Date.now() }];
    me.guildId = g.id;
    me.guildTag = tag;
    this.flush();
    return g;
  }
  async joinGuild(id: string) {
    const me = this.need();
    const g = this.db.guilds.find((x) => x.id === id);
    if (!g) throw new Error(tl('公会不存在'));
    if (g.members >= g.maxMembers) throw new Error(tl('公会满员了'));
    (this.db.members[id] ??= []).push({ playerId: me.id, name: me.name, role: 'member', totalLevel: this.db.snap?.total ?? 0, weekly: 0, lastSeen: Date.now() });
    g.members++;
    me.guildId = id;
    me.guildTag = g.tag;
    this.flush();
  }
  async leaveGuild() {
    const me = this.need(), g = this.myGuild();
    this.db.members[g.id] = (this.db.members[g.id] ?? []).filter((m) => m.playerId !== me.id);
    g.members--;
    if (g.members <= 0) this.db.guilds = this.db.guilds.filter((x) => x !== g);
    me.guildId = null;
    me.guildTag = undefined;
    this.flush();
  }
  async guildMembers(id: string) { return this.db.members[id] ?? []; }
  async setRole(playerId: string, role: GuildRole) {
    const m = (this.db.members[this.myGuild().id] ?? []).find((x) => x.playerId === playerId);
    if (m) m.role = role;
    this.flush();
  }
  async kick(playerId: string) {
    const g = this.myGuild();
    this.db.members[g.id] = (this.db.members[g.id] ?? []).filter((m) => m.playerId !== playerId);
    g.members = this.db.members[g.id].length;
    this.flush();
  }
  async setNotice(text: string) { this.myGuild().notice = text.slice(0, 200); this.flush(); }
  async guildTasks() { return this.db.tasks; }
  async contribute(taskId: string, qty: number) {
    const t = this.db.tasks.find((x) => x.id === taskId);
    if (t) t.have = Math.min(t.need, t.have + qty);
    this.flush();
  }

  publishPresence() { /* 只有自己，不用发 */ }
  onPresence(f: (all: Presence[]) => void) { f([]); return () => {}; }
  async sendChat(channel: ChatChannel, text: string, toId?: string) {
    const me = this.need();
    const m: ChatMsg = { id: uid(), channel, playerId: me.id, name: me.name, toId, text: text.slice(0, 200), at: Date.now() };
    this.db.chat = [...this.db.chat, m].slice(-100);
    this.flush();
    this.chatFns.forEach((fn) => fn(m));
  }
  onChat(f: (m: ChatMsg) => void) { this.chatFns.add(f); return () => { this.chatFns.delete(f); }; }

  // 只有自己一个人：好友和队伍都是空的
  async friends(): Promise<Friend[]> { return []; }
  async addFriend(): Promise<'sent' | 'accepted'> { throw new Error(tl('没有这个 ID 的玩家')); }
  async answerFriend() {}
  async removeFriend() {}
  async party(): Promise<Party | null> { return null; }
  async partyInvites(): Promise<PartyInvite[]> { return []; }
  async inviteParty() { throw new Error(tl('只能邀请好友')); }
  async answerParty() {}
  async leaveParty() {}
  async kickParty() {}
  async promoteParty() {}
  async disbandParty() {}
  onSocial() { return () => {}; }
  onlineCount() { return this.me() ? 1 : 0; }
  realtimeStatus() { return 'off' as const; }
  presenceOf() { return undefined; }
  onlineIds() { return new Set(this.me() ? [this.me()!.id] : []); }
  async trades(): Promise<Trade[]> { return []; }
  async startTrade(): Promise<string> { throw new Error(tl('只能和好友交易')); }
  async setOffer() {}
  async confirmTrade(): Promise<'open' | 'done'> { return 'open'; }
  async cancelTrade() {}
  async claimTrade() { return false; }
  async ping() { return 0; }
  async joinedAt() { return null; }
  // GM 增益：本地假后端里自己就是管理员（测试用）
  async myGmBuffs() { return (this.db.gm ?? []).filter((b) => b.targetPid == null || b.targetPid === this.db.me?.pid).map(({ targetPid, targetName: _n, ...b }) => ({ ...b, all: targetPid == null })); }
  async gmList() { return [...(this.db.gm ?? [])]; }
  async gmAdd(b: GmInput) {
    this.db.gm = [{ ...b, id: uid(), all: b.targetPid == null }, ...(this.db.gm ?? [])];
    this.flush();
  }
  async gmUpdate(id: string, b: Partial<GmInput>) {
    this.db.gm = (this.db.gm ?? []).map((x) => (x.id === id ? { ...x, ...b, all: (b.targetPid !== undefined ? b.targetPid : x.targetPid) == null } : x));
    this.flush();
  }
  async gmDelete(id: string) {
    this.db.gm = (this.db.gm ?? []).filter((x) => x.id !== id);
    this.flush();
  }
}

