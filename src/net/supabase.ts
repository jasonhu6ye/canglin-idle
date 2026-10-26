import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState, GmBuff } from '../core/types';
import type { GmInput, GmMail, GmMailInput, GmMailRow, GmRow, Board, ChatChannel, ChatMsg, Friend, Party, PartyInvite, Trade, Guild, GuildBankLog, GuildMember, GuildVault, GuildRole, GuildTask, OnlineApi, Presence, Profile, RankRow } from './api';
import { levelSnapshot } from './api';
import type { TaskSpec } from '../core/guild';
import { fastOf, readFast, slowKey, withMove, type Fast } from './presenceSync';
import { tl } from '../i18n';

/** Supabase 实现（10-25 用户选定）。表和权限见 supabase/schema.sql */

type Row = Record<string, any>;
const toGuild = (g: Row, members = 0): Guild => ({
  id: g.id, name: g.name, tag: g.tag, notice: g.notice, level: g.level, xp: Number(g.xp),
  members, maxMembers: g.max_members, open: g.open, takeMin: g.take_min ?? 0, points: Number(g.points ?? 0),
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

/**
 * 轮询别人位置的间隔、自己写位置的最短间隔（45 秒没更新算下线，在 SQL 里）。
 * 实时连得上时位置走广播，数据库只是兜底：慢慢拉、慢慢写，给数据库减负（10-26）
 */
const POLL_MS = 4000;
const POLL_RT_MS = 20_000;
const WRITE_MS = 3000;
const WRITE_RT_MS = 15_000;
/** 两次 presence track 至少隔多久（免费版全服每秒 20 条 presence），中间的变化攒着最后一次发 */
const TRACK_MS = 4000;

export class SupabaseApi implements OnlineApi {
  readonly kind = 'supabase';
  private sb: SupabaseClient;
  private profile: Profile | null = null;
  private world: RealtimeChannel | null = null;
  private presenceFns = new Set<(all: Presence[]) => void>();
  private lastPresence: Omit<Presence, 'playerId' | 'name' | 'at'> | null = null;
  /** 两路来源：Realtime presence（快）和 positions 表轮询（实时连不上也能看到人） */
  private rtSeen = new Map<string, Presence>();
  private dbSeen = new Map<string, Presence>();
  private rt_: 'connecting' | 'ok' | 'failed' = 'connecting';
  private poller: ReturnType<typeof setInterval> | null = null;
  private wroteAt = 0;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 收到的移动广播（按玩家），比在线状态新就叠上去 */
  private moves = new Map<string, Fast>();
  private seq = 0;
  private tracked = { key: '', at: 0 };
  private trackTimer: ReturnType<typeof setTimeout> | null = null;
  private mergeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingCh: RealtimeChannel | null = null;

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
    if (this.poller) clearInterval(this.poller);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    if (this.trackTimer) clearTimeout(this.trackTimer);
    if (this.mergeTimer) clearTimeout(this.mergeTimer);
    this.poller = this.writeTimer = this.trackTimer = this.mergeTimer = null;
    if (this.pingCh) void this.sb.removeChannel(this.pingCh);
    this.pingCh = null;
    this.rtSeen.clear(); this.dbSeen.clear(); this.byId.clear(); this.moves.clear(); this.ids_ = new Set();
    this.lastPresence = null;
    this.tracked = { key: '', at: 0 };
    this.rt_ = 'connecting';
  }
  private need() {
    if (!this.profile) throw new Error(tl('请先登录'));
    return this.profile;
  }
  async rename(name: string) {
    ok(await this.sb.from('profiles').update({ name }).eq('id', this.need().id));
    this.need().name = name;
  }

  async pushSave(s: GameState, device?: string) {
    const id = this.need().id;
    const snap = levelSnapshot(s);
    ok(await this.sb.from('saves').upsert({ player_id: id, data: device ? { ...s, _device: device } : s, last_tick: s.lastTick, updated_at: new Date().toISOString() }));
    void this.sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', id);
    ok(await this.sb.from('ranks').upsert({ player_id: id, total: snap.total, combat: snap.combat, skills: snap.skills, xp: snap.xp, updated_at: new Date().toISOString() }));
  }
  async cloudHead() {
    const r = ok(await this.sb.from('saves').select('last_tick, device:data->>_device').eq('player_id', this.need().id).maybeSingle()) as Row | null;
    return r ? { tick: Number(r.last_tick), device: r.device ?? undefined } : null;
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
      .select('player_id, role, weekly, week, contrib, donated, donated_day, profiles(name, last_seen, ranks(total))')
      .eq('guild_id', id)) as Row[];
    return rows.map((m) => ({
      playerId: m.player_id, role: m.role, weekly: Number(m.weekly), week: m.week ?? undefined,
      contrib: Number(m.contrib ?? 0), donated: Number(m.donated ?? 0), donatedDay: m.donated_day ?? undefined,
      name: m.profiles?.name ?? '?', lastSeen: Date.parse(m.profiles?.last_seen ?? 0),
      totalLevel: m.profiles?.ranks?.total ?? 0,
    }));
  }
  async setRole(playerId: string, role: GuildRole) { ok(await this.sb.rpc('set_role', { p_player: playerId, p_role: role })); }
  async kick(playerId: string) { ok(await this.sb.rpc('kick_member', { p_player: playerId })); }
  async setNotice(text: string) { ok(await this.sb.rpc('set_notice', { p_text: text })); }
  async guildTasks(): Promise<GuildTask[]> {
    const rows = ok(await this.sb.from('guild_tasks').select('*').order('ends_at')) as Row[];
    return rows.map((t) => ({ id: t.id, kind: t.kind, target: t.target, need: t.need, have: t.have, per: t.per ?? 1, reward: t.reward, endsAt: Date.parse(t.ends_at) }));
  }
  async ensureGuildTasks(tasks: TaskSpec[]) { ok(await this.sb.rpc('ensure_guild_tasks', { p_tasks: tasks })); }
  async contribute(taskId: string, qty: number) { return Number(ok(await this.sb.rpc('contribute', { p_task: taskId, p_qty: qty })) ?? 0); }
  async exchangeItems(item: string, qty: number, value: number) { return Number(ok(await this.sb.rpc('exchange_items', { p_item: item, p_qty: qty, p_value: value })) ?? 0); }
  async guildBank(vault: number): Promise<[string, number][]> {
    const gid = this.need().guildId;
    if (!gid) return [];
    const rows = ok(await this.sb.from('guild_bank').select('item, qty, pos').eq('guild_id', gid).eq('vault', vault).order('pos')) as Row[];
    return rows.map((r) => [r.item, Number(r.qty)]);
  }
  async guildBankLog(): Promise<GuildBankLog[]> {
    const gid = this.need().guildId;
    if (!gid) return [];
    const rows = ok(await this.sb.from('guild_bank_log').select('vault, name, item, qty, at').eq('guild_id', gid).order('at', { ascending: false }).limit(300)) as Row[];
    return rows.map((r) => ({ vault: r.vault ?? 0, name: r.name, item: r.item, qty: Number(r.qty), at: Date.parse(r.at) }));
  }
  async guildDeposit(item: string, qty: number, vault: number) { ok(await this.sb.rpc('guild_deposit', { p_item: item, p_qty: qty, p_vault: vault })); }
  async guildWithdraw(item: string, qty: number, vault: number) { return Number(ok(await this.sb.rpc('guild_withdraw', { p_item: item, p_qty: qty, p_vault: vault })) ?? 0); }
  async sortGuildBank(vault: number, items: string[]) { ok(await this.sb.rpc('sort_guild_bank', { p_vault: vault, p_items: items })); }
  async guildVaults(): Promise<GuildVault[]> {
    const gid = this.need().guildId;
    if (!gid) return [];
    const rows = ok(await this.sb.from('guild_vaults').select('idx, name, allow, officers').eq('guild_id', gid).order('idx')) as Row[];
    return rows.map((v) => ({ idx: v.idx, name: v.name, allow: v.allow ?? [], officers: !!v.officers }));
  }
  async openVault(name: string) { return Number(ok(await this.sb.rpc('open_vault', { p_name: name }))); }
  async setVault(idx: number, name: string, allow: string[], officers: boolean) {
    ok(await this.sb.rpc('set_vault', { p_idx: idx, p_name: name, p_allow: allow, p_officers: officers }));
  }
  async setTakeMin(min: number) { ok(await this.sb.rpc('set_take_min', { p_min: min })); }

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
  /**
   * 延迟：实时连得上就测实时通道一个来回（别的玩家的位置、副本队友的伤害都走这条，最能说明手感）；
   * 连不上再测一次数据库请求
   */
  async ping() {
    if (this.rt_ === 'ok') {
      if (!this.pingCh) {
        this.pingCh = this.sb.channel(`ping-${this.need().id}`, { config: { broadcast: { ack: true, self: false } } });
        const ch = this.pingCh;
        await Promise.race([
          new Promise<void>((res) => ch.subscribe((st) => { if (st === 'SUBSCRIBED') res(); })),
          new Promise<void>((res) => setTimeout(res, 3000)),
        ]);
      }
      const t = performance.now();
      const r = await this.pingCh.send({ type: 'broadcast', event: 'p', payload: {} });
      if (r === 'ok') return Math.round(performance.now() - t);
    }
    const t = performance.now();
    ok(await this.sb.from('guilds').select('id').limit(1));
    return Math.round(performance.now() - t);
  }

  /** 实时连接状态，「更多」页显示 */
  realtimeStatus() { return this.profile ? this.rt_ : 'off'; }

  /** 世界频道：在线玩家位置走 Realtime presence；同时开轮询，实时连不上也能看到人 */
  private channel() {
    const me = this.need();
    if (!this.poller) {
      // 实时正常时数据库只是兜底，20 秒拉一次；连不上才 4 秒一次
      let n = 0;
      this.poller = setInterval(() => { n++; if (this.rt_ !== 'ok' || n % (POLL_RT_MS / POLL_MS) === 0) void this.pollPositions(); }, POLL_MS);
      void this.pollPositions();
    }
    if (this.world) return this.world;
    const ch = this.sb.channel('world', { config: { presence: { key: me.id }, broadcast: { self: false, ack: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      this.rtSeen = new Map();
      for (const [, metas] of Object.entries(ch.presenceState<Presence>())) if (metas[0]) this.rtSeen.set(metas[0].playerId, metas[0]);
      this.mergePresence();
    }).on('broadcast', { event: 'mv' }, ({ payload }) => {
      const m = readFast(payload);
      if (!m || m.id === me.id) return;
      const old = this.moves.get(m.id);
      if (old && old.s >= m.s) return;
      this.moves.set(m.id, m);
      this.scheduleMerge();
    }).subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        this.rt_ = 'ok';
        this.tracked = { key: '', at: 0 };
        if (this.lastPresence) this.publishPresence(this.lastPresence);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.rt_ = 'failed';
        if (err) console.warn('realtime', status, err);
      }
    });
    return (this.world = ch);
  }
  /** 两路合起来，同一个人取更新的那条 */
  /** 移动广播一秒能来好几十条：攒 50 毫秒合一次，界面不用跟着每条都重画 */
  private scheduleMerge() {
    if (this.mergeTimer) return;
    this.mergeTimer = setTimeout(() => { this.mergeTimer = null; this.mergePresence(); }, 50);
  }
  private mergePresence() {
    const me = this.profile;
    if (!me) return;
    const all = new Map(this.dbSeen);
    for (const [id, p] of this.rtSeen) { const d = all.get(id); if (!d || (p.at ?? 0) >= (d.at ?? 0)) all.set(id, p); }
    for (const [id, p] of all) all.set(id, withMove(p, this.moves.get(id)));
    // 下线的人的移动记录也清掉
    for (const id of this.moves.keys()) if (!all.has(id)) this.moves.delete(id);
    if (this.lastPresence) all.set(me.id, this.mine(this.lastPresence));
    this.count_ = Math.max(1, all.size);
    this.ids_ = new Set([...all.keys(), me.id]);
    this.byId = all;
    const others = [...all.values()].filter((p) => p.playerId !== me.id);
    this.presenceFns.forEach((f) => f(others));
  }
  private async pollPositions() {
    const me = this.profile;
    if (!me) return;
    // 用服务器时间判断谁在线，玩家电脑时钟不准也没关系
    const { data, error } = await this.sb.rpc('online_positions');
    if (error) { console.warn('positions', error.message); return; }
    this.dbSeen = new Map();
    for (const r of (data ?? []) as Row[]) {
      if (!r.data || typeof r.data !== 'object') continue;
      this.dbSeen.set(r.player_id, { ...r.data, playerId: r.player_id, at: Date.parse(r.updated_at) });
    }
    this.mergePresence();
  }
  private mine(p: Omit<Presence, 'playerId' | 'name' | 'at'>): Presence {
    const me = this.need();
    return { ...p, playerId: me.id, pid: me.pid, name: me.name, guildTag: me.guildTag, at: Date.now(), s: this.seq };
  }
  publishPresence(p: Omit<Presence, 'playerId' | 'name' | 'at'>) {
    if (!this.profile) return;
    this.lastPresence = p;
    this.seq = Math.max(Date.now(), this.seq + 1);
    const ch = this.channel();
    if (this.rt_ === 'ok') {
      // 慢变的东西变了才 track（最多每 TRACK_MS 一次，攒着发最后的）；位置和动作每次都走广播
      const key = slowKey(p);
      if (key !== this.tracked.key) this.trackSoon();
      void ch.send({ type: 'broadcast', event: 'mv', payload: { id: this.need().id, ...fastOf(p, this.seq) } });
    }
    // 写数据库不用那么勤：最多每 WRITE_MS 一次（实时正常时 15 秒），最后一次一定写上
    const wait = this.wroteAt + (this.rt_ === 'ok' ? WRITE_RT_MS : WRITE_MS) - Date.now();
    if (wait <= 0) void this.writePosition();
    else if (!this.writeTimer) this.writeTimer = setTimeout(() => { this.writeTimer = null; void this.writePosition(); }, wait);
  }
  private trackSoon() {
    if (this.trackTimer) return;
    const go = () => {
      this.trackTimer = null;
      if (!this.profile || !this.lastPresence || !this.world || this.rt_ !== 'ok') return;
      this.tracked = { key: slowKey(this.lastPresence), at: Date.now() };
      void this.world.track(this.mine(this.lastPresence));
    };
    const wait = this.tracked.at + TRACK_MS - Date.now();
    if (wait <= 0) go();
    else this.trackTimer = setTimeout(go, wait);
  }
  private async writePosition() {
    if (!this.profile || !this.lastPresence) return;
    this.wroteAt = Date.now();
    const { playerId: _id, at: _at, ...data } = this.mine(this.lastPresence);
    const { error } = await this.sb.rpc('put_position', { p_data: data });
    if (error) console.warn('positions', error.message);
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
    let last = 0;
    const pull = () => void this.sb.from('chat').select('*').gt('id', last).order('id', { ascending: false }).limit(50)
      .then((r) => (r.data ?? []).reverse().forEach((m) => { last = Math.max(last, Number(m.id)); f(toChat(m)); }));
    pull();
    // 实时连不上时每 5 秒拉一次新消息
    const t = setInterval(() => { if (this.rt_ !== 'ok') pull(); }, 5000);
    return () => { clearInterval(t); void this.sb.removeChannel(ch); };
  }

  async friends(): Promise<Friend[]> {
    const me = this.need().id;
    const who = 'name, pid, last_seen, created_at, guild_id, ranks(total, combat)';
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
      createdAt: o?.created_at ? Date.parse(o.created_at) : undefined,
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
  async kickParty(playerId: string) { ok(await this.sb.rpc('kick_party', { p_player: playerId })); }
  async promoteParty(playerId: string) { ok(await this.sb.rpc('promote_party', { p_player: playerId })); }
  async disbandParty() { ok(await this.sb.rpc('disband_party')); }
  onSocial(f: () => void) {
    const ch = this.sb.channel(`social-${Math.random().toString(36).slice(2)}`);
    for (const table of ['friends', 'party_invites', 'party_members', 'trades']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => f());
    ch.subscribe();
    // 实时连不上时每 15 秒刷新一次好友、队伍、交易；连得上也每分钟兜底一次
    let n = 0;
    const t = setInterval(() => { n++; if (this.rt_ !== 'ok' || n % 4 === 0) f(); }, 15_000);
    return () => { clearInterval(t); void this.sb.removeChannel(ch); };
  }
  async joinedAt(playerId: string) {
    const r = ok(await this.sb.from('profiles').select('created_at').eq('id', playerId).maybeSingle());
    return r?.created_at ? Date.parse(r.created_at) : null;
  }
  // ---- GM 增益（10-26）----
  async myGmBuffs(): Promise<GmBuff[]> {
    if (!this.profile) return [];
    const rows: Row[] = ok(await this.sb.from('gm_buffs').select('id,target_pid,name,tag,kind,pct,starts_at,ends_at')
      .gt('ends_at', new Date(Date.now() - 3600_000).toISOString())
      .or(`target_pid.is.null,target_pid.eq.${Number(this.profile.pid) || 0}`).limit(50));
    return rows.map(toGm);
  }
  async gmList(): Promise<GmRow[]> {
    const rows: Row[] = ok(await this.sb.from('gm_buffs').select('id,target_pid,name,tag,kind,pct,starts_at,ends_at').order('created_at', { ascending: false }).limit(100));
    const pids = [...new Set(rows.map((r) => r.target_pid).filter((x) => x != null))];
    const names = new Map<number, string>();
    if (pids.length) for (const p of ok(await this.sb.from('profiles').select('pid,name').in('pid', pids)) as Row[]) names.set(Number(p.pid), p.name);
    return rows.map((r) => ({ ...toGm(r), targetPid: r.target_pid == null ? null : Number(r.target_pid), targetName: names.get(Number(r.target_pid)) }));
  }
  async gmAdd(b: GmInput) { ok(await this.sb.from('gm_buffs').insert(fromGm(b))); }
  async gmUpdate(id: string, b: Partial<GmInput>) { ok(await this.sb.from('gm_buffs').update(fromGm(b)).eq('id', id)); }
  async gmDelete(id: string) {
    const r = ok(await this.sb.from('gm_buffs').delete().eq('id', id).select('id'));
    if (!r?.length) throw new Error(tl('没有权限，或者这条已经删掉了'));
  }
  // ---- GM 赠送物品（10-26）----
  async myGmMail(): Promise<GmMail[]> {
    if (!this.profile?.pid) return [];
    const rows: Row[] = ok(await this.sb.from('gm_mail').select('id,title,body,items,created_at').eq('target_pid', Number(this.profile.pid)).is('claimed_at', null).limit(20));
    return rows.map(toGmMail);
  }
  async claimGmMail(id: string) { return ok(await this.sb.rpc('claim_gm_mail', { p_mail: id })) as boolean; }
  async gmMailList(): Promise<GmMailRow[]> {
    const rows: Row[] = ok(await this.sb.from('gm_mail').select('id,target_pid,title,body,items,created_at,claimed_at').order('created_at', { ascending: false }).limit(100));
    const pids = [...new Set(rows.map((r) => r.target_pid))];
    const names = new Map<number, string>();
    if (pids.length) for (const p of ok(await this.sb.from('profiles').select('pid,name').in('pid', pids)) as Row[]) names.set(Number(p.pid), p.name);
    return rows.map((r) => ({ ...toGmMail(r), targetPid: Number(r.target_pid), targetName: names.get(Number(r.target_pid)), claimedAt: r.claimed_at ? Date.parse(r.claimed_at) : null }));
  }
  async gmMailSend(m: GmMailInput) {
    const who = ok(await this.sb.from('profiles').select('pid').eq('pid', m.targetPid).maybeSingle());
    if (!who) throw new Error(tl`找不到 UID ${m.targetPid} 的玩家`);
    ok(await this.sb.from('gm_mail').insert({ target_pid: m.targetPid, title: m.title, body: m.body, items: m.items }));
  }
  async gmMailDelete(id: string) {
    const r = ok(await this.sb.from('gm_mail').delete().eq('id', id).select('id'));
    if (!r?.length) throw new Error(tl('没有权限，或者这条已经删掉了'));
  }
}
const toGmMail = (r: Row): GmMail => ({
  id: r.id, title: r.title, body: r.body ?? '', at: Date.parse(r.created_at),
  items: (Array.isArray(r.items) ? r.items : []).filter((i: Row) => typeof i?.item === 'string' && Number(i.qty) > 0).map((i: Row) => ({ item: i.item, qty: Math.floor(Number(i.qty)) })),
});
const toGm = (r: Row): GmBuff => ({
  id: r.id, name: r.name, tag: r.tag ?? '', kind: r.kind, pct: Number(r.pct),
  from: Date.parse(r.starts_at), to: Date.parse(r.ends_at), all: r.target_pid == null,
});
function fromGm(b: Partial<GmInput>) {
  const o: Row = {};
  if (b.targetPid !== undefined) o.target_pid = b.targetPid;
  if (b.name !== undefined) o.name = b.name;
  if (b.tag !== undefined) o.tag = b.tag;
  if (b.kind !== undefined) o.kind = b.kind;
  if (b.pct !== undefined) o.pct = b.pct;
  if (b.from !== undefined) o.starts_at = new Date(b.from).toISOString();
  if (b.to !== undefined) o.ends_at = new Date(b.to).toISOString();
  return o;
}

