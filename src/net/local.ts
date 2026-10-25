import type { GameState } from '../core/types';
import type { Board, ChatMsg, Guild, GuildMember, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { GUILD_MAX, levelSnapshot } from './api';

/**
 * 本地假后端：数据放 localStorage，只有你自己。用来在后端接好前把排行榜和公会界面做出来、跑测试。
 * 换真后端时界面不用改。
 */
const KEY = 'canglin-net-local';

interface Db {
  me: Profile | null;
  save: GameState | null;
  snap: ReturnType<typeof levelSnapshot> | null;
  guilds: Guild[];
  members: Record<string, GuildMember[]>;
  tasks: GuildTask[];
  chat: ChatMsg[];
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
    if (!this.db.me) throw new Error('请先登录');
    return this.db.me;
  }
  private myGuild() {
    const g = this.db.guilds.find((x) => x.id === this.db.me?.guildId);
    if (!g) throw new Error('还没加入公会');
    return g;
  }

  me() { return this.db.me; }
  async signIn(email: string) {
    this.db.me ??= { id: uid(), name: email.split('@')[0].slice(0, 12) };
    this.flush();
    return this.db.me;
  }
  async signUp(_email: string, _pw: string, name: string) {
    this.db.me = { id: uid(), name };
    this.flush();
    return this.db.me;
  }
  async signOut() { this.db.me = null; this.flush(); }
  async rename(name: string) { this.need().name = name; this.flush(); }

  async pushSave(s: GameState) {
    this.need();
    this.db.save = s;
    this.db.snap = levelSnapshot(s);
    this.flush();
  }
  async pullSave() { return this.db.save; }

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
    if (me.guildId) throw new Error('已经在公会里了');
    const g: Guild = { id: uid(), name, tag, notice: '', level: 1, xp: 0, members: 1, maxMembers: GUILD_MAX, open: true };
    this.db.guilds.push(g);
    this.db.members[g.id] = [{ playerId: me.id, name: me.name, role: 'leader', totalLevel: this.db.snap?.total ?? 0, weekly: 0, lastSeen: Date.now() }];
    me.guildId = g.id;
    this.flush();
    return g;
  }
  async joinGuild(id: string) {
    const me = this.need();
    const g = this.db.guilds.find((x) => x.id === id);
    if (!g) throw new Error('公会不存在');
    if (g.members >= g.maxMembers) throw new Error('公会满员了');
    (this.db.members[id] ??= []).push({ playerId: me.id, name: me.name, role: 'member', totalLevel: this.db.snap?.total ?? 0, weekly: 0, lastSeen: Date.now() });
    g.members++;
    me.guildId = id;
    this.flush();
  }
  async leaveGuild() {
    const me = this.need(), g = this.myGuild();
    this.db.members[g.id] = (this.db.members[g.id] ?? []).filter((m) => m.playerId !== me.id);
    g.members--;
    if (g.members <= 0) this.db.guilds = this.db.guilds.filter((x) => x !== g);
    me.guildId = null;
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
  async sendChat(channel: ChatMsg['channel'], text: string) {
    const me = this.need();
    const m: ChatMsg = { id: uid(), channel, playerId: me.id, name: me.name, text: text.slice(0, 200), at: Date.now() };
    this.db.chat = [...this.db.chat, m].slice(-100);
    this.flush();
    this.chatFns.forEach((fn) => fn(m));
  }
  onChat(f: (m: ChatMsg) => void) { this.chatFns.add(f); return () => { this.chatFns.delete(f); }; }
}
