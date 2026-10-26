import type { GameState } from '../core/types';
import type { GmInput, GmMailInput, GmMailRow, GmRow, Board, ChatChannel, ChatMsg, Friend, Party, PartyInvite, Trade, Guild, GuildBankLog, GuildMember, GuildVault, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { GUILD_MAX, levelSnapshot } from './api';
import { tl } from '../i18n';
import { EXCHANGE_DAY_MAX, VAULT_COST, VAULT_SLOTS, exchangeGain, guildLevelOf, guildMembersCap, guildSlots, utcDay, utcWeek, type TaskSpec } from '../core/guild';

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
  /** 公会仓库（键「公会 id:仓库编号」，键的顺序就是显示顺序）、私人仓库、流水（按公会 id） */
  bank?: Record<string, Record<string, number>>;
  vaults?: Record<string, GuildVault[]>;
  bankLog?: Record<string, GuildBankLog[]>;
  chat: ChatMsg[];
  gm?: GmRow[];
  gmMail?: GmMailRow[];
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
    const g: Guild = { id: uid(), name, tag, notice: '', level: 1, xp: 0, members: 1, maxMembers: GUILD_MAX, open: true, takeMin: 0, points: 0 };
    this.db.guilds.push(g);
    this.db.members[g.id] = [{ playerId: me.id, name: me.name, role: 'leader', totalLevel: this.db.snap?.total ?? 0, weekly: 0, contrib: 0, lastSeen: Date.now() }];
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
    (this.db.members[id] ??= []).push({ playerId: me.id, name: me.name, role: 'member', totalLevel: this.db.snap?.total ?? 0, weekly: 0, contrib: 0, lastSeen: Date.now() });
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
  async guildTasks() { return this.db.tasks.filter((t) => t.endsAt > Date.now() - 86_400_000); }
  async ensureGuildTasks(list: TaskSpec[]) {
    this.myGuild();
    const end = Date.parse(utcDay()) + 86_400_000;
    if (this.db.tasks.some((t) => t.endsAt === end)) return;
    this.db.tasks = [...this.db.tasks.filter((t) => t.endsAt > Date.now() - 86_400_000),
      ...list.slice(0, 5).map((t): GuildTask => ({ id: uid(), kind: 'donate', target: t.target, need: t.need, have: 0, per: t.per, reward: t.reward, endsAt: end }))];
    this.flush();
  }
  private meMember() {
    const g = this.myGuild();
    const m = (this.db.members[g.id] ?? []).find((x) => x.playerId === this.need().id);
    if (!m) throw new Error(tl('还没加入公会'));
    return { g, m };
  }
  private addContrib(n: number) {
    const { g, m } = this.meMember();
    const wk = utcWeek();
    m.weekly = (m.week === wk ? m.weekly : 0) + n;
    m.week = wk;
    m.contrib += n;
    g.xp += n;
    g.points += n;
    this.levelUp(g);
  }
  private levelUp(g: Guild) {
    g.level = guildLevelOf(g.xp);
    g.maxMembers = guildMembersCap(g.level);
  }
  async contribute(taskId: string, qty: number) {
    const t = this.db.tasks.find((x) => x.id === taskId);
    if (!t) throw new Error(tl('任务不存在'));
    if (t.endsAt < Date.now()) throw new Error(tl('任务已结束'));
    const add = Math.max(0, Math.min(qty, t.need - t.have));
    if (!add) return 0;
    t.have += add;
    this.addContrib(add * t.per);
    if (t.have >= t.need) { const g = this.myGuild(); g.xp += t.reward; g.points += t.reward; this.levelUp(g); }
    this.flush();
    return add;
  }
  async exchangeItems(item: string, qty: number, value: number) {
    if (item === 'coins') throw new Error(tl('金币不能兑换贡献'));
    const { m } = this.meMember();
    const today = utcDay();
    const left = EXCHANGE_DAY_MAX - (m.donatedDay === today ? m.donated ?? 0 : 0);
    if (left <= 0) throw new Error(tl('今天的兑换已经满了'));
    const v = Math.max(1, Math.min(100000, Math.floor(value)));
    const q = Math.max(0, Math.min(qty, Math.floor((left * 10) / v)));
    const n = exchangeGain(v, q);
    if (q <= 0 || n <= 0) throw new Error(tl('数量太少，换不到 1 点贡献'));
    m.donated = EXCHANGE_DAY_MAX - left + n;
    m.donatedDay = today;
    this.addContrib(n);
    this.flush();
    return q;
  }
  private canVault(vault: number) {
    const { g, m } = this.meMember();
    if (vault === 0) return true;
    const v = this.db.vaults?.[g.id]?.find((x) => x.idx === vault);
    return !!v && (m.role === 'leader' || v.allow.includes(m.playerId) || (v.officers && m.role === 'officer'));
  }
  private box(vault: number) {
    if (!this.canVault(vault)) throw new Error(tl('没有这个仓库的权限'));
    return ((this.db.bank ??= {})[`${this.myGuild().id}:${vault}`] ??= {});
  }
  async guildBank(vault: number) { return Object.entries(this.box(vault)); }
  async guildBankLog() {
    return (this.db.bankLog?.[this.myGuild().id] ?? []).filter((l) => this.canVault(l.vault)).slice(0, 300);
  }
  private log(vault: number, item: string, qty: number) {
    const g = this.myGuild();
    ((this.db.bankLog ??= {})[g.id] ??= []).unshift({ vault, name: this.need().name, item, qty, at: Date.now() });
  }
  async guildDeposit(item: string, qty: number, vault: number) {
    const g = this.myGuild();
    if (qty <= 0) throw new Error(tl('数量不对'));
    const bank = this.box(vault);
    if (!bank[item] && Object.keys(bank).length >= (vault ? VAULT_SLOTS : guildSlots(g.level))) throw new Error(tl('公会仓库满了'));
    bank[item] = (bank[item] ?? 0) + qty;
    this.log(vault, item, qty);
    this.flush();
  }
  async guildWithdraw(item: string, qty: number, vault: number) {
    const { g, m } = this.meMember();
    const bank = this.box(vault);
    if (!vault && m.role === 'member' && (g.takeMin < 0 || m.contrib < g.takeMin)) throw new Error(tl('贡献不够，不能从公会仓库取东西'));
    const n = Math.max(0, Math.min(qty, bank[item] ?? 0));
    if (!n) return 0;
    bank[item] -= n;
    if (!bank[item]) delete bank[item];
    this.log(vault, item, -n);
    this.flush();
    return n;
  }
  async sortGuildBank(vault: number, items: string[]) {
    const bank = this.box(vault);
    const next: Record<string, number> = {};
    for (const id of [...items, ...Object.keys(bank)]) if (bank[id] && !next[id]) next[id] = bank[id];
    this.db.bank![`${this.myGuild().id}:${vault}`] = next;
    this.flush();
  }
  async guildVaults() { return [...(this.db.vaults?.[this.myGuild().id] ?? [])]; }
  async openVault(name: string) {
    const { g, m } = this.meMember();
    if (m.role === 'member') throw new Error(tl('只有会长和副会长能开私人仓库'));
    const list = ((this.db.vaults ??= {})[g.id] ??= []);
    if (list.length >= VAULT_COST.length) throw new Error(tl('私人仓库最多 3 个'));
    const cost = VAULT_COST[list.length];
    if (g.points < cost) throw new Error(tl('公会贡献值不够'));
    g.points -= cost;
    list.push({ idx: list.length + 1, name: name.trim().slice(0, 12) || tl('私人仓库'), allow: [m.playerId], officers: false });
    this.flush();
    return list.length;
  }
  async setVault(idx: number, name: string, allow: string[], officers: boolean) {
    const { g, m } = this.meMember();
    if (!(m.role === 'leader' || (m.role === 'officer' && this.canVault(idx)))) throw new Error(tl('没有权限'));
    const v = this.db.vaults?.[g.id]?.find((x) => x.idx === idx);
    if (!v) return;
    const ids = new Set((this.db.members[g.id] ?? []).map((x) => x.playerId));
    Object.assign(v, { name: name.trim().slice(0, 12) || v.name, allow: [...new Set(allow)].filter((a) => ids.has(a)), officers });
    this.flush();
  }
  async setTakeMin(min: number) { this.myGuild().takeMin = Math.max(-1, Math.floor(min)); this.flush(); }

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
  async myGmMail() { return (this.db.gmMail ?? []).filter((m) => m.targetPid === this.db.me?.pid && !m.claimedAt).map(({ targetPid: _p, targetName: _n, claimedAt: _c, ...m }) => m); }
  async claimGmMail(id: string) {
    const m = (this.db.gmMail ?? []).find((x) => x.id === id && !x.claimedAt && x.targetPid === this.db.me?.pid);
    if (!m) return false;
    m.claimedAt = Date.now();
    this.flush();
    return true;
  }
  async gmMailList() { return [...(this.db.gmMail ?? [])]; }
  async gmMailSend(m: GmMailInput) {
    this.db.gmMail = [{ ...m, id: uid(), at: Date.now(), claimedAt: null }, ...(this.db.gmMail ?? [])];
    this.flush();
  }
  async gmMailDelete(id: string) {
    this.db.gmMail = (this.db.gmMail ?? []).filter((x) => x.id !== id);
    this.flush();
  }
}

