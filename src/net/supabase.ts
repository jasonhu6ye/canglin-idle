import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../core/types';
import type { Board, ChatChannel, ChatMsg, Friend, Party, PartyInvite, Trade, Guild, GuildMember, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { levelSnapshot } from './api';
import { tl } from '../i18n';

/** Supabase 实现（10-25 用户选定）。表和权限见 supabase/schema.sql */

type Row = Record<string, any>;
const toGuild = (g: Row, members = 0): Guild => ({
  id: g.id, name: g.name, tag: g.tag, notice: g.notice, level: g.level, xp: Number(g.xp),
  members, maxMembers: g.max_members, open: g.open,
});
const toRank = (r: Row): RankRow => ({
  rank: Number(r.rank), playerId: r.player_id, name: r.name, guildTag: r.guild_tag ?? undefined,
  value: r.value, xp: r.xp == null ? undefined : Number(r.xp),
});
const toChat = (m: Row): ChatMsg => ({
  id: String(m.id), channel: m.channel, playerId: m.player_id, name: m.name, toId: m.to_id ?? undefined, text: m.text, at: Date.parse(m.at),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(r: { data: any; error: { message: string } | null }): any {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export class SupabaseApi implements OnlineApi {
  readonly kind = 'supabase';
  private sb: SupabaseClient;
  private profile: Profile | null = null;
  private world: RealtimeChannel | null = null;
  private presenceFns = new Set<(all: Presence[]) => void>();
  private lastPresence: Omit<Presence, 'playerId' | 'name' | 'at'> | null = null;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, storageKey: 'canglin-auth' } });
  }

  me() { return this.profile; }

  private session = false;
  signedIn() { return this.session; }

  /** 读角色；账号还没建角色时是 null。网络出错时抛错 */
  private async loadProfile(): Promise<Profile | null> {
    const { data: { session } } = await this.sb.auth.getSession();
    this.session = !!session;
    if (!session) return (this.profile = null);
    const p = ok(await this.sb.from('profiles').select('id,pid,name,outfit,guild_id').eq('id', session.user.id).maybeSingle());
    if (!p) return (this.profile = null);
    this.profile = { id: p.id, pid: p.pid, name: p.name, outfit: p.outfit ?? undefined, guildId: p.guild_id };
    await this.loadTag();
    void this.sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', p.id);
    return this.profile;
  }
  private async loadTag() {
    if (!this.profile) return;
    const id = this.profile.guildId;
    this.profile.guildTag = id ? (await this.sb.from('guilds').select('tag').eq('id', id).maybeSingle()).data?.tag : undefined;
  }
  async ready() { return this.loadProfile(); }

  async signIn(email: string, password: string) {
    ok(await this.sb.auth.signInWithPassword({ email, password }));
    return this.loadProfile();
  }
  async signUp(email: string, password: string) {
    const r = ok(await this.sb.auth.signUp({ email, password }));
    if (!r.session) throw new Error(tl('注册成功，请去邮箱点确认链接后再登录'));
    return this.loadProfile();
  }
  async createProfile(name: string, outfit: string) {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) throw new Error(tl('请先登录'));
    ok(await this.sb.from('profiles').insert({ id: session.user.id, name, outfit }));
    const p = await this.loadProfile();
    if (!p) throw new Error(tl('创建角色失败'));
    return p;
  }
  async signOut() {
    await this.sb.auth.signOut();
    this.profile = null;
    this.session = false;
    if (this.world) void this.sb.removeChannel(this.world);
    this.world = null;
    this.count_ = null;
  }
  private need() {
    if (!this.profile) throw new Error(tl('请先登录'));
    return this.profile;
  }
  async rename(name: string) {
    ok(await this.sb.from('profiles').update({ name }).eq('id', this.need().id));
    this.need().name = name;
  }

  async pushSave(s: GameState) {
    const id = this.need().id;
    const snap = levelSnapshot(s);
    ok(await this.sb.from('saves').upsert({ player_id: id, data: s, last_tick: s.lastTick, updated_at: new Date().toISOString() }));
    void this.sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
    ok(await this.sb.from('ranks').upsert({ player_id: id, total: snap.total, combat: snap.combat, skills: snap.skills, xp: snap.xp, updated_at: new Date().toISOString() }));
  }
  async pullSave() {
    const r = ok(await this.sb.from('saves').select('data').eq('player_id', this.need().id).maybeSingle());
    return (r?.data as GameState) ?? null;
  }

  async leaderboard(board: Board, limit = 100) {
    return (ok(await this.sb.rpc('leaderboard', { p_board: board, p_limit: limit })) as Row[]).map(toRank);
  }
  async myRank(board: Board) {
    const rows = ok(await this.sb.rpc('my_rank', { p_board: board })) as Row[];
    return rows[0] ? toRank(rows[0]) : null;
  }

  private async count(guildId: string) {
    const r = await this.sb.from('guild_members').select('player_id', { count: 'exact', head: true }).eq('guild_id', guildId);
    return r.count ?? 0;
  }
  async guild(id?: string): Promise<Guild | null> {
    const gid = id ?? this.profile?.guildId;
    if (!gid) return null;
    if (!id && this.profile) {
      // 可能被踢了或公会解散了：以服务器为准
      const r = ok(await this.sb.from('profiles').select('guild_id').eq('id', this.profile.id).single());
      if (r.guild_id !== gid) { this.profile.guildId = r.guild_id; await this.loadTag(); return this.guild(); }
    }
    const g = ok(await this.sb.from('guilds').select('*').eq('id', gid).maybeSingle());
    return g ? toGuild(g, await this.count(gid)) : null;
  }
  async searchGuilds(q: string) {
    const safe = q.replace(/[%,()]/g, '');
    const rows = ok(await this.sb.from('guilds').select('*, guild_members(count)')
      .or(`name.ilike.%${safe}%,tag.ilike.%${safe}%`).order('level', { ascending: false }).limit(30)) as Row[];
    return rows.map((g) => toGuild(g, g.guild_members?.[0]?.count ?? 0));
  }
  async createGuild(name: string, tag: string) {
    const id = ok(await this.sb.rpc('create_guild', { p_name: name, p_tag: tag })) as string;
    this.need().guildId = id;
    await this.loadTag();
    return (await this.guild(id))!;
  }
  async joinGuild(id: string) {
    ok(await this.sb.rpc('join_guild', { p_guild: id }));
    this.need().guildId = id;
    await this.loadTag();
  }
  async leaveGuild() {
    ok(await this.sb.rpc('leave_guild'));
    this.need().guildId = null;
    this.need().guildTag = undefined;
  }
  async guildMembers(id: string): Promise<GuildMember[]> {
    const rows = ok(await this.sb.from('guild_members')
      .select('player_id, role, weekly, profiles(name, last_seen, ranks(total))')
      .eq('guild_id', id)) as Row[];
    return rows.map((m) => ({
      playerId: m.player_id, role: m.role, weekly: Number(m.weekly),
      name: m.profiles?.name ?? '?', lastSeen: Date.parse(m.profiles?.last_seen ?? 0),
      totalLevel: m.profiles?.ranks?.total ?? 0,
    }));
  }
  async setRole(playerId: string, role: GuildRole) { ok(await this.sb.rpc('set_role', { p_player: playerId, p_role: role })); }
  async kick(playerId: string) { ok(await this.sb.rpc('kick_member', { p_player: playerId })); }
  async setNotice(text: string) { ok(await this.sb.rpc('set_notice', { p_text: text })); }
  async guildTasks(): Promise<GuildTask[]> {
    const rows = ok(await this.sb.from('guild_tasks').select('*').order('ends_at')) as Row[];
    return rows.map((t) => ({ id: t.id, kind: t.kind, target: t.target, need: t.need, have: t.have, reward: t.reward, endsAt: Date.parse(t.ends_at) }));
  }
  async contribute(taskId: string, qty: number) { ok(await this.sb.rpc('contribute', { p_task: taskId, p_qty: qty })); }

  private count_: number | null = null;
  private ids_ = new Set<string>();
  private byId = new Map<string, Presence>();
  presenceOf(playerId: string) { return this.byId.get(playerId); }
  onlineIds() { if (this.profile) this.channel(); return this.ids_; }
  async trades(): Promise<Trade[]> {
    const me = this.need().id;
    // 没结束的和最近一天的（成交后要领取）
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const rows = ok(await this.sb.from('trades').select('*').or(`status.eq.open,updated_at.gt.${since}`).order('updated_at', { ascending: false })) as Row[];
    return rows.map((t) => {
      const a = t.a === me;
      return {
        id: t.id, otherId: a ? t.b : t.a, mine: a ? t.a_items : t.b_items, theirs: a ? t.b_items : t.a_items,
        myOk: a ? t.a_ok : t.b_ok, theirOk: a ? t.b_ok : t.a_ok, status: t.status, claimed: a ? t.a_claimed : t.b_claimed,
        updatedAt: Date.parse(t.updated_at),
      };
    });
  }
  async startTrade(playerId: string) { return ok(await this.sb.rpc('start_trade', { p_other: playerId })) as string; }
  async setOffer(tradeId: string, items: Record<string, number>) { ok(await this.sb.rpc('set_offer', { p_trade: tradeId, p_items: items })); }
  async confirmTrade(tradeId: string, yes: boolean) { return ok(await this.sb.rpc('confirm_trade', { p_trade: tradeId, p_ok: yes })) as 'open' | 'done'; }
  async cancelTrade(tradeId: string) { ok(await this.sb.rpc('cancel_trade', { p_trade: tradeId })); }
  async claimTrade(tradeId: string) { return ok(await this.sb.rpc('claim_trade', { p_trade: tradeId })) as boolean; }
  onlineCount() { if (this.profile) this.channel(); return this.count_; }
  async ping() {
    const t = performance.now();
    ok(await this.sb.from('guilds').select('id').limit(1));
    return Math.round(performance.now() - t);
  }

  /** 世界频道：在线玩家位置走 Realtime presence，不进数据库 */
  private channel() {
    const me = this.need();
    if (this.world) return this.world;
    const ch = this.sb.channel('world', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const all: Presence[] = [];
      for (const [, metas] of Object.entries(ch.presenceState<Presence>())) if (metas[0]) all.push(metas[0]);
      this.count_ = all.length;
      this.ids_ = new Set(all.map((p) => p.playerId));
      this.byId = new Map(all.map((p) => [p.playerId, p]));
      const others = all.filter((p) => p.playerId !== me.id);
      this.presenceFns.forEach((f) => f(others));
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED' && this.lastPresence) this.publishPresence(this.lastPresence);
    });
    return (this.world = ch);
  }
  publishPresence(p: Omit<Presence, 'playerId' | 'name' | 'at'>) {
    if (!this.profile) return;
    this.lastPresence = p;
    void this.channel().track({ ...p, playerId: this.profile.id, pid: this.profile.pid, name: this.profile.name, guildTag: this.profile.guildTag, at: Date.now() });
  }
  onPresence(f: (all: Presence[]) => void) {
    this.presenceFns.add(f);
    if (this.profile) this.channel();
    return () => { this.presenceFns.delete(f); };
  }

  async sendChat(channel: ChatChannel, text: string, toId?: string) {
    const me = this.need();
    if (channel === 'guild' && !me.guildId) throw new Error(tl('还没加入公会'));
    let party_id: string | null = null;
    if (channel === 'party') {
      party_id = ok(await this.sb.rpc('my_party')) as string | null;
      if (!party_id) throw new Error(tl('还没有队伍'));
    }
    if (channel === 'private' && !toId) throw new Error(tl('选一个好友'));
    ok(await this.sb.from('chat').insert({
      channel, guild_id: channel === 'guild' ? me.guildId : null, party_id, to_id: channel === 'private' ? toId : null,
      player_id: me.id, name: me.name, text: text.slice(0, 200),
    }));
  }
  onChat(f: (m: ChatMsg) => void) {
    // 能收到哪些消息由数据库的权限规则决定（世界频道 + 本会）
    const ch = this.sb.channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, (e) => f(toChat(e.new as Row)))
      .subscribe();
    void this.sb.from('chat').select('*').order('at', { ascending: false }).limit(50)
      .then((r) => (r.data ?? []).reverse().forEach((m) => f(toChat(m))));
    return () => { void this.sb.removeChannel(ch); };
  }

  async friends(): Promise<Friend[]> {
    const me = this.need().id;
    const who = 'name, pid, last_seen, guild_id, ranks(total, combat)';
    const rows = ok(await this.sb.from('friends')
      .select(`from_id, to_id, accepted, a:profiles!friends_from_id_fkey(${who}), b:profiles!friends_to_id_fkey(${who})`)) as Row[];
    const list = rows.map((r) => ({ r, incoming: r.to_id === me, o: (r.to_id === me ? r.a : r.b) as Row | null }));
    // 会标单独查（profiles.guild_id 没有外键，不能直接嵌）
    const gids = [...new Set(list.map((x) => x.o?.guild_id).filter(Boolean))];
    const tags = new Map<string, string>();
    if (gids.length) for (const g of ok(await this.sb.from('guilds').select('id, tag').in('id', gids)) as Row[]) tags.set(g.id, g.tag);
    return list.map(({ r, incoming, o }) => ({
      playerId: incoming ? r.from_id : r.to_id, pid: Number(o?.pid), name: o?.name ?? '?', accepted: r.accepted, incoming,
      totalLevel: o?.ranks?.total, combat: o?.ranks?.combat, guildTag: o?.guild_id ? tags.get(o.guild_id) : undefined,
      lastSeen: o?.last_seen ? Date.parse(o.last_seen) : undefined,
    }));
  }
  async addFriend(pid: number) { return ok(await this.sb.rpc('add_friend', { p_pid: pid })) as 'sent' | 'accepted'; }
  async answerFriend(fromId: string, accept: boolean) { ok(await this.sb.rpc('answer_friend', { p_from: fromId, p_accept: accept })); }
  async removeFriend(playerId: string) { ok(await this.sb.rpc('remove_friend', { p_other: playerId })); }
  async party(): Promise<Party | null> {
    const rows = ok(await this.sb.from('party_members').select('player_id, party_id, joined_at, profiles(name), parties(leader)').order('joined_at')) as Row[];
    if (!rows.length) return null;
    return {
      id: rows[0].party_id, leader: rows[0].parties?.leader,
      members: rows.map((r) => ({ playerId: r.player_id, name: r.profiles?.name ?? '?' })),
    };
  }
  async partyInvites(): Promise<PartyInvite[]> {
    const rows = ok(await this.sb.from('party_invites').select('party_id, from_id, profiles!party_invites_from_id_fkey(name)').eq('to_id', this.need().id)) as Row[];
    return rows.map((r) => ({ partyId: r.party_id, fromId: r.from_id, fromName: r.profiles?.name ?? '?' }));
  }
  async inviteParty(playerId: string) { ok(await this.sb.rpc('invite_party', { p_to: playerId })); }
  async answerParty(partyId: string, accept: boolean) { ok(await this.sb.rpc('answer_party', { p_party: partyId, p_accept: accept })); }
  async leaveParty() { ok(await this.sb.rpc('leave_party')); }
  onSocial(f: () => void) {
    const ch = this.sb.channel(`social-${Math.random().toString(36).slice(2)}`);
    for (const table of ['friends', 'party_invites', 'party_members', 'trades']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => f());
    ch.subscribe();
    return () => { void this.sb.removeChannel(ch); };
  }
}
