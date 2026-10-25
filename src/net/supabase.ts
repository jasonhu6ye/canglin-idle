import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../core/types';
import type { Board, ChatMsg, Guild, GuildMember, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { levelSnapshot } from './api';

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
  id: String(m.id), channel: m.channel, playerId: m.player_id, name: m.name, text: m.text, at: Date.parse(m.at),
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

  /** 读档案；第一次登录时按注册时填的名字建档 */
  private async loadProfile(): Promise<Profile | null> {
    const { data: { user } } = await this.sb.auth.getUser();
    if (!user) return (this.profile = null);
    let p = ok(await this.sb.from('profiles').select('id,name,outfit,guild_id').eq('id', user.id).maybeSingle());
    if (!p) {
      const name = String(user.user_metadata?.name ?? user.email?.split('@')[0] ?? '冒险者').slice(0, 12);
      p = ok(await this.sb.from('profiles').insert({ id: user.id, name }).select('id,name,outfit,guild_id').single());
    }
    this.profile = { id: p.id, name: p.name, outfit: p.outfit ?? undefined, guildId: p.guild_id };
    return this.profile;
  }
  async ready() { return this.loadProfile(); }

  async signIn(email: string, password: string) {
    ok(await this.sb.auth.signInWithPassword({ email, password }));
    const p = await this.loadProfile();
    if (!p) throw new Error('登录失败');
    return p;
  }
  async signUp(email: string, password: string, name: string) {
    const r = ok(await this.sb.auth.signUp({ email, password, options: { data: { name } } }));
    if (!r.session) throw new Error('注册成功，请去邮箱点确认链接后再登录');
    const p = await this.loadProfile();
    if (!p) throw new Error('注册失败');
    return p;
  }
  async signOut() {
    await this.sb.auth.signOut();
    this.profile = null;
    this.world?.unsubscribe();
    this.world = null;
  }
  private need() {
    if (!this.profile) throw new Error('请先登录');
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
  async guild(id?: string) {
    const gid = id ?? this.profile?.guildId;
    if (!gid) return null;
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
    return (await this.guild(id))!;
  }
  async joinGuild(id: string) {
    ok(await this.sb.rpc('join_guild', { p_guild: id }));
    this.need().guildId = id;
  }
  async leaveGuild() {
    ok(await this.sb.rpc('leave_guild'));
    this.need().guildId = null;
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

  /** 世界频道：在线玩家位置走 Realtime presence，不进数据库 */
  private channel() {
    const me = this.need();
    if (this.world) return this.world;
    const ch = this.sb.channel('world', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const all: Presence[] = [];
      for (const [, metas] of Object.entries(ch.presenceState<Presence>())) if (metas[0]) all.push(metas[0]);
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
    void this.channel().track({ ...p, playerId: this.profile.id, name: this.profile.name, at: Date.now() });
  }
  onPresence(f: (all: Presence[]) => void) {
    this.presenceFns.add(f);
    if (this.profile) this.channel();
    return () => { this.presenceFns.delete(f); };
  }

  async sendChat(channel: ChatMsg['channel'], text: string) {
    const me = this.need();
    if (channel === 'guild' && !me.guildId) throw new Error('还没加入公会');
    ok(await this.sb.from('chat').insert({
      channel, guild_id: channel === 'guild' ? me.guildId : null, player_id: me.id, name: me.name, text: text.slice(0, 200),
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
}
