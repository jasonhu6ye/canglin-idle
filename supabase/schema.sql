-- 苍岭放置 联机数据库（Supabase / Postgres）
-- 在 Supabase 后台 SQL Editor 里整段粘贴运行一次即可；重复运行也不会出错。
-- 原则：玩家只能改自己的数据；公会的加入/退出/踢人等都走下面的函数，在服务器上检查权限。

-- ========== 玩家 ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique check (char_length(name) between 2 and 12),
  outfit text,
  guild_id uuid,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles 所有人可看" on public.profiles;
create policy "profiles 所有人可看" on public.profiles for select using (true);
drop policy if exists "profiles 自己建" on public.profiles;
create policy "profiles 自己建" on public.profiles for insert with check (auth.uid() = id and guild_id is null);
drop policy if exists "profiles 自己改" on public.profiles;
create policy "profiles 自己改" on public.profiles for update using (auth.uid() = id);
-- 公会归属只能由下面的函数改：玩家自己只能改名字、外观、在线时间
revoke update on public.profiles from anon, authenticated;
grant update (name, outfit, last_seen) on public.profiles to authenticated;

-- ========== 云存档 ==========
create table if not exists public.saves (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null,
  last_tick bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
drop policy if exists "saves 只有自己" on public.saves;
create policy "saves 只有自己" on public.saves for all using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- ========== 排行榜快照（上传存档时顺便写） ==========
create table if not exists public.ranks (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  total int not null default 0,
  combat int not null default 1,
  skills jsonb not null default '{}',
  xp jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists ranks_total on public.ranks (total desc);
create index if not exists ranks_combat on public.ranks (combat desc);
alter table public.ranks enable row level security;
drop policy if exists "ranks 所有人可看" on public.ranks;
create policy "ranks 所有人可看" on public.ranks for select using (true);
drop policy if exists "ranks 自己写" on public.ranks;
create policy "ranks 自己写" on public.ranks for all using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- ========== 公会 ==========
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 12),
  tag text not null unique check (char_length(tag) between 2 and 4),
  notice text not null default '' check (char_length(notice) <= 200),
  level int not null default 1,
  xp bigint not null default 0,
  max_members int not null default 30,
  open boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.guild_members (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'officer', 'member')),
  weekly bigint not null default 0,
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_guild on public.guild_members (guild_id);
create table if not exists public.guild_tasks (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  kind text not null check (kind in ('donate', 'kills', 'craft')),
  target text not null,
  need int not null,
  have int not null default 0,
  reward int not null,
  ends_at timestamptz not null
);
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_tasks enable row level security;
drop policy if exists "guilds 所有人可看" on public.guilds;
create policy "guilds 所有人可看" on public.guilds for select using (true);
drop policy if exists "members 所有人可看" on public.guild_members;
create policy "members 所有人可看" on public.guild_members for select using (true);
drop policy if exists "tasks 本会可看" on public.guild_tasks;
create policy "tasks 本会可看" on public.guild_tasks for select
  using (guild_id = (select guild_id from public.profiles where id = auth.uid()));
-- guilds / guild_members / guild_tasks 没有写入规则：只能通过下面的函数改

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as $$
  select role from guild_members where player_id = auth.uid()
$$;

create or replace function public.create_guild(p_name text, p_tag text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from guild_members where player_id = auth.uid()) then raise exception '已经在公会里了'; end if;
  insert into guilds (name, tag) values (p_name, p_tag) returning id into g;
  insert into guild_members (player_id, guild_id, role) values (auth.uid(), g, 'leader');
  update profiles set guild_id = g where id = auth.uid();
  return g;
end $$;

create or replace function public.join_guild(p_guild uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; cap int; o boolean;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from guild_members where player_id = auth.uid()) then raise exception '已经在公会里了'; end if;
  select max_members, open into cap, o from guilds where id = p_guild for update;
  if cap is null then raise exception '公会不存在'; end if;
  if not o then raise exception '这个公会不接受直接加入'; end if;
  select count(*) into n from guild_members where guild_id = p_guild;
  if n >= cap then raise exception '公会满员了'; end if;
  insert into guild_members (player_id, guild_id) values (auth.uid(), p_guild);
  update profiles set guild_id = p_guild where id = auth.uid();
end $$;

create or replace function public.leave_guild() returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; r text; heir uuid;
begin
  select guild_id, role into g, r from guild_members where player_id = auth.uid();
  if g is null then raise exception '还没加入公会'; end if;
  delete from guild_members where player_id = auth.uid();
  update profiles set guild_id = null where id = auth.uid();
  if r = 'leader' then
    -- 会长走了：传给副会长里入会最早的，没有就传给成员里最早的；没人了就解散
    select player_id into heir from guild_members where guild_id = g
      order by (role = 'officer') desc, joined_at limit 1;
    if heir is null then delete from guilds where id = g;
    else update guild_members set role = 'leader' where player_id = heir; end if;
  end if;
end $$;

create or replace function public.set_role(p_player uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if public.my_role() is distinct from 'leader' then raise exception '只有会长能任命'; end if;
  if p_player = auth.uid() then raise exception '不能改自己'; end if;
  select guild_id into g from guild_members where player_id = auth.uid();
  if p_role = 'leader' then
    -- 转让会长
    update guild_members set role = 'officer' where player_id = auth.uid();
  end if;
  update guild_members set role = p_role where player_id = p_player and guild_id = g;
end $$;

create or replace function public.kick_member(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; mine text; theirs text;
begin
  mine := public.my_role();
  select guild_id into g from guild_members where player_id = auth.uid();
  select role into theirs from guild_members where player_id = p_player and guild_id = g;
  if theirs is null then raise exception '不是本会成员'; end if;
  if not (mine = 'leader' or (mine = 'officer' and theirs = 'member')) then raise exception '没有权限'; end if;
  delete from guild_members where player_id = p_player;
  update profiles set guild_id = null where id = p_player;
end $$;

create or replace function public.set_notice(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('leader', 'officer') then raise exception '没有权限'; end if;
  update guilds set notice = left(p_text, 200)
    where id = (select guild_id from guild_members where player_id = auth.uid());
end $$;

create or replace function public.contribute(p_task uuid, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; t guild_tasks; add int;
begin
  select guild_id into g from guild_members where player_id = auth.uid();
  select * into t from guild_tasks where id = p_task and guild_id = g for update;
  if t.id is null then raise exception '任务不存在'; end if;
  if t.ends_at < now() then raise exception '任务已结束'; end if;
  add := least(greatest(p_qty, 0), t.need - t.have);
  update guild_tasks set have = have + add where id = p_task;
  update guild_members set weekly = weekly + add where player_id = auth.uid();
  if t.have + add >= t.need and t.have < t.need then
    update guilds set xp = xp + t.reward where id = g;
  end if;
end $$;

-- ========== 排行榜查询 ==========
-- board: 'total' / 'combat' / 技能 id（mining 等）
create or replace function public.leaderboard(p_board text, p_limit int default 100)
returns table (rank bigint, player_id uuid, name text, guild_tag text, value int, xp numeric)
language sql stable security definer set search_path = public as $$
  with v as (
    select r.player_id,
      case p_board when 'total' then r.total when 'combat' then r.combat
        else coalesce((r.skills ->> p_board)::int, 1) end as value,
      coalesce((r.xp ->> p_board)::numeric, 0) as xp
    from ranks r
  )
  select rank() over (order by v.value desc, v.xp desc), v.player_id, p.name, g.tag, v.value, v.xp
  from v join profiles p on p.id = v.player_id left join guilds g on g.id = p.guild_id
  order by 1 limit least(p_limit, 200)
$$;

create or replace function public.my_rank(p_board text)
returns table (rank bigint, player_id uuid, name text, guild_tag text, value int, xp numeric)
language sql stable security definer set search_path = public as $$
  with v as (
    select r.player_id,
      case p_board when 'total' then r.total when 'combat' then r.combat
        else coalesce((r.skills ->> p_board)::int, 1) end as value,
      coalesce((r.xp ->> p_board)::numeric, 0) as xp
    from ranks r
  ), me as (select * from v where player_id = auth.uid())
  select (select count(*) + 1 from v where v.value > me.value or (v.value = me.value and v.xp > me.xp)),
    me.player_id, p.name, g.tag, me.value, me.xp
  from me join profiles p on p.id = me.player_id left join guilds g on g.id = p.guild_id
$$;

-- ========== 玩家数字 ID（10-25，用来加好友） ==========
alter table public.profiles add column if not exists pid bigint generated always as identity (start with 10000001);
create unique index if not exists profiles_pid on public.profiles (pid);

-- ========== 好友 ==========
-- 一对好友存一行：from_id 发的申请，accepted 后算好友
create table if not exists public.friends (
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index if not exists friends_to on public.friends (to_id);
alter table public.friends enable row level security;
drop policy if exists "friends 自己相关" on public.friends;
create policy "friends 自己相关" on public.friends for select using (auth.uid() in (from_id, to_id));

create or replace function public.is_friend(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friends where accepted and ((from_id = a and to_id = b) or (from_id = b and to_id = a)))
$$;

-- 按数字 ID 发好友申请；对方已经申请过我就直接成为好友
create or replace function public.add_friend(p_pid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare other uuid; n int;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  select id into other from profiles where pid = p_pid;
  if other is null then raise exception '没有这个 ID 的玩家'; end if;
  if other = auth.uid() then raise exception '不能加自己'; end if;
  if is_friend(auth.uid(), other) then raise exception '已经是好友了'; end if;
  if exists (select 1 from friends where from_id = other and to_id = auth.uid()) then
    update friends set accepted = true where from_id = other and to_id = auth.uid();
    return 'accepted';
  end if;
  select count(*) into n from friends where from_id = auth.uid() or to_id = auth.uid();
  if n >= 200 then raise exception '好友和申请加起来最多 200 个'; end if;
  insert into friends (from_id, to_id) values (auth.uid(), other) on conflict do nothing;
  return 'sent';
end $$;

create or replace function public.answer_friend(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then update friends set accepted = true where from_id = p_from and to_id = auth.uid();
  else delete from friends where from_id = p_from and to_id = auth.uid() and not accepted; end if;
end $$;

create or replace function public.remove_friend(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from friends where (from_id = auth.uid() and to_id = p_other) or (from_id = p_other and to_id = auth.uid());
end $$;

-- ========== 队伍（最多 5 人） ==========
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists party_members_party on public.party_members (party_id);
create table if not exists public.party_invites (
  party_id uuid not null references public.parties(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (party_id, to_id)
);
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_invites enable row level security;

create or replace function public.my_party() returns uuid language sql stable security definer set search_path = public as $$
  select party_id from party_members where player_id = auth.uid()
$$;
drop policy if exists "parties 本队可看" on public.parties;
create policy "parties 本队可看" on public.parties for select using (id = public.my_party());
drop policy if exists "party_members 本队可看" on public.party_members;
create policy "party_members 本队可看" on public.party_members for select using (party_id = public.my_party());
drop policy if exists "party_invites 自己相关" on public.party_invites;
create policy "party_invites 自己相关" on public.party_invites for select using (auth.uid() in (to_id, from_id));

-- 邀请好友组队：自己还没队伍就先建一个
create or replace function public.invite_party(p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pt uuid; n int;
begin
  if not is_friend(auth.uid(), p_to) then raise exception '只能邀请好友'; end if;
  pt := my_party();
  if pt is null then
    insert into parties (leader) values (auth.uid()) returning id into pt;
    insert into party_members (player_id, party_id) values (auth.uid(), pt);
  end if;
  if exists (select 1 from party_members where player_id = p_to) then raise exception '对方已经在队伍里了'; end if;
  select count(*) into n from party_members where party_id = pt;
  if n >= 5 then raise exception '队伍满了（最多 5 人）'; end if;
  insert into party_invites (party_id, to_id, from_id) values (pt, p_to, auth.uid())
    on conflict (party_id, to_id) do update set created_at = now();
end $$;

create or replace function public.answer_party(p_party uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from party_invites where party_id = p_party and to_id = auth.uid()) then raise exception '邀请已失效'; end if;
  delete from party_invites where party_id = p_party and to_id = auth.uid();
  if not p_accept then return; end if;
  if my_party() is not null then raise exception '先退出现在的队伍'; end if;
  select count(*) into n from party_members where party_id = p_party;
  if n = 0 then raise exception '队伍已解散'; end if;
  if n >= 5 then raise exception '队伍满了'; end if;
  insert into party_members (player_id, party_id) values (auth.uid(), p_party);
end $$;

create or replace function public.leave_party() returns void
language plpgsql security definer set search_path = public as $$
declare pt uuid; heir uuid;
begin
  pt := my_party();
  if pt is null then return; end if;
  delete from party_members where player_id = auth.uid();
  select player_id into heir from party_members where party_id = pt order by joined_at limit 1;
  -- 只剩一个人就解散
  if heir is null or (select count(*) from party_members where party_id = pt) < 2 then
    delete from parties where id = pt;
  else
    update parties set leader = heir where id = pt and leader = auth.uid();
  end if;
end $$;

-- 队长：踢人、转让队长、解散（用户 10-25）
create or replace function public.kick_party(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pt uuid;
begin
  pt := my_party();
  if pt is null or not exists (select 1 from parties where id = pt and leader = auth.uid()) then raise exception '只有队长能踢人'; end if;
  if p_player = auth.uid() then raise exception '不能踢自己'; end if;
  delete from party_members where party_id = pt and player_id = p_player;
  if (select count(*) from party_members where party_id = pt) < 2 then delete from parties where id = pt; end if;
end $$;

create or replace function public.promote_party(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pt uuid;
begin
  pt := my_party();
  if pt is null or not exists (select 1 from parties where id = pt and leader = auth.uid()) then raise exception '只有队长能转让'; end if;
  if not exists (select 1 from party_members where party_id = pt and player_id = p_player) then raise exception '对方不在队伍里'; end if;
  update parties set leader = p_player where id = pt;
end $$;

create or replace function public.disband_party() returns void
language plpgsql security definer set search_path = public as $$
declare pt uuid;
begin
  pt := my_party();
  if pt is null or not exists (select 1 from parties where id = pt and leader = auth.uid()) then raise exception '只有队长能解散队伍'; end if;
  delete from parties where id = pt;
end $$;

-- ========== 聊天：世界 / 公会 / 队伍 / 私聊 ==========
create table if not exists public.chat (
  id bigint generated always as identity primary key,
  channel text not null,
  guild_id uuid references public.guilds(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  text text not null check (char_length(text) between 1 and 200),
  at timestamptz not null default now()
);
alter table public.chat add column if not exists party_id uuid references public.parties(id) on delete cascade;
alter table public.chat add column if not exists to_id uuid references public.profiles(id) on delete cascade;
alter table public.chat drop constraint if exists chat_channel_check;
alter table public.chat add constraint chat_channel_check check (channel in ('world', 'guild', 'party', 'private'));
create index if not exists chat_at on public.chat (at desc);
alter table public.chat enable row level security;
drop policy if exists "chat 世界和本会可看" on public.chat;
drop policy if exists "chat 能看的" on public.chat;
create policy "chat 能看的" on public.chat for select using (
  channel = 'world'
  or (channel = 'guild' and guild_id = (select guild_id from public.profiles where id = auth.uid()))
  or (channel = 'party' and party_id = public.my_party())
  or (channel = 'private' and auth.uid() in (player_id, to_id)));
drop policy if exists "chat 自己发" on public.chat;
create policy "chat 自己发" on public.chat for insert with check (
  auth.uid() = player_id
  and name = (select name from public.profiles where id = auth.uid())
  and (channel = 'world' and guild_id is null and party_id is null and to_id is null
    or channel = 'guild' and guild_id = (select guild_id from public.profiles where id = auth.uid())
    or channel = 'party' and party_id = public.my_party()
    or channel = 'private' and to_id is not null and public.is_friend(auth.uid(), to_id)));

-- 新聊天、好友申请、组队邀请实时推送
do $$ begin alter publication supabase_realtime add table public.chat; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.friends; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.party_invites; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.party_members; exception when duplicate_object then null; end $$;

-- ========== 好友交易（10-25） ==========
-- 双方各放物品（从仓库出），都点确认才成交；成交后各自的游戏领取一次（claimed），东西才真正到账
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles(id) on delete cascade,
  b uuid not null references public.profiles(id) on delete cascade,
  a_items jsonb not null default '{}',
  b_items jsonb not null default '{}',
  a_ok boolean not null default false,
  b_ok boolean not null default false,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  a_claimed boolean not null default false,
  b_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trades_a on public.trades (a);
create index if not exists trades_b on public.trades (b);
alter table public.trades enable row level security;
drop policy if exists "trades 双方可看" on public.trades;
create policy "trades 双方可看" on public.trades for select using (auth.uid() in (a, b));

create or replace function public.start_trade(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not is_friend(auth.uid(), p_other) then raise exception '只能和好友交易'; end if;
  select id into t from trades where status = 'open' and ((a = auth.uid() and b = p_other) or (a = p_other and b = auth.uid()));
  if t is not null then return t; end if;
  if (select count(*) from trades where status = 'open' and auth.uid() in (a, b)) >= 5 then raise exception '同时最多 5 笔交易'; end if;
  insert into trades (a, b) values (auth.uid(), p_other) returning id into t;
  return t;
end $$;

-- 改自己这边放的东西：{物品 id: 数量}，改了以后双方都要重新确认
create or replace function public.set_offer(p_trade uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t trades; k text; v jsonb;
begin
  select * into t from trades where id = p_trade for update;
  if t.id is null or auth.uid() not in (t.a, t.b) then raise exception '交易不存在'; end if;
  if t.status <> 'open' then raise exception '交易已经结束'; end if;
  if jsonb_typeof(p_items) <> 'object' then raise exception '物品格式不对'; end if;
  if (select count(*) from jsonb_object_keys(p_items)) > 12 then raise exception '一次最多放 12 种东西'; end if;
  for k, v in select * from jsonb_each(p_items) loop
    if jsonb_typeof(v) <> 'number' or (v::text)::numeric <= 0 or (v::text)::numeric <> floor((v::text)::numeric) then
      raise exception '数量不对';
    end if;
  end loop;
  if auth.uid() = t.a then update trades set a_items = p_items, a_ok = false, b_ok = false, updated_at = now() where id = p_trade;
  else update trades set b_items = p_items, a_ok = false, b_ok = false, updated_at = now() where id = p_trade; end if;
end $$;

-- 确认 / 取消确认；双方都确认就成交
create or replace function public.confirm_trade(p_trade uuid, p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare t trades;
begin
  select * into t from trades where id = p_trade for update;
  if t.id is null or auth.uid() not in (t.a, t.b) then raise exception '交易不存在'; end if;
  if t.status <> 'open' then raise exception '交易已经结束'; end if;
  if auth.uid() = t.a then t.a_ok := p_ok; else t.b_ok := p_ok; end if;
  if t.a_ok and t.b_ok then
    if t.a_items = '{}'::jsonb and t.b_items = '{}'::jsonb then raise exception '双方都没放东西'; end if;
    t.status := 'done';
  end if;
  update trades set a_ok = t.a_ok, b_ok = t.b_ok, status = t.status, updated_at = now() where id = p_trade;
  return t.status;
end $$;

create or replace function public.cancel_trade(p_trade uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update trades set status = 'cancelled', updated_at = now()
    where id = p_trade and status = 'open' and auth.uid() in (a, b);
end $$;

-- 成交后领取：只有第一次返回 true，游戏据此扣掉自己给出的、加上收到的
create or replace function public.claim_trade(p_trade uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update trades set a_claimed = true where id = p_trade and status = 'done' and a = auth.uid() and not a_claimed;
  get diagnostics n = row_count;
  if n = 0 then
    update trades set b_claimed = true where id = p_trade and status = 'done' and b = auth.uid() and not b_claimed;
    get diagnostics n = row_count;
  end if;
  return n > 0;
end $$;

do $$ begin alter publication supabase_realtime add table public.trades; exception when duplicate_object then null; end $$;


-- ============ 在线玩家位置（10-25）============
-- Realtime presence 连不上时的后备：每人一行，几秒写一次，别人轮询最近 45 秒更新过的
create table if not exists public.positions (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists positions_updated on public.positions (updated_at desc);
alter table public.positions enable row level security;
drop policy if exists "positions 所有人可看" on public.positions;
create policy "positions 所有人可看" on public.positions for select using (true);

create or replace function public.put_position(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if pg_column_size(p_data) > 4000 then raise exception '数据太大'; end if;
  insert into positions (player_id, data, updated_at) values (auth.uid(), p_data, now())
  on conflict (player_id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.online_positions()
returns table (player_id uuid, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select player_id, data, updated_at from positions
  where updated_at > now() - interval '45 seconds'
  order by updated_at desc limit 500;
$$;
grant execute on function public.put_position(jsonb) to authenticated;
grant execute on function public.online_positions() to authenticated;
