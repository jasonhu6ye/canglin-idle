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

-- contribute（交任务物品）在文件末尾「公会等级、贡献、仓库」里

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
-- 新注册账号的数字 ID 改成随机 8 位（10-27 用户要求）；老账号的 ID 不变
-- 随机范围 20000000-99999999，避开以前按顺序发的 1000xxxx；撞号就重抽
create or replace function public.random_pid() returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare n bigint;
begin
  loop
    n := 20000000 + floor(random() * 80000000)::bigint;
    exit when not exists (select 1 from profiles where pid = n);
  end loop;
  return n;
end $$;
alter table public.profiles alter column pid drop identity if exists;
alter table public.profiles alter column pid set default public.random_pid();

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


-- ============ GM 管理员和 GM 增益（10-26）============
-- 管理员按玩家数字 ID（pid）登记；只有管理员能加、删增益，权限在服务器上检查
create table if not exists public.gm_admins (
  pid bigint primary key
);
insert into public.gm_admins (pid) values (10000001) on conflict do nothing;
alter table public.gm_admins enable row level security;
drop policy if exists "gm_admins 所有人可看" on public.gm_admins;
create policy "gm_admins 所有人可看" on public.gm_admins for select using (true);

create or replace function public.is_gm() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p join gm_admins a on a.pid = p.pid where p.id = auth.uid());
$$;
grant execute on function public.is_gm() to authenticated;

-- target_pid 为空 = 全服
create table if not exists public.gm_buffs (
  id uuid primary key default gen_random_uuid(),
  target_pid bigint,
  name text not null check (char_length(name) between 1 and 20),
  tag text not null default '' check (char_length(tag) <= 4),
  kind text not null check (kind in ('xp', 'drop', 'coins', 'yield', 'speed', 'atk', 'str', 'def', 'hp')),
  pct numeric not null check (pct > 0 and pct <= 1000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists gm_buffs_ends on public.gm_buffs (ends_at desc);
alter table public.gm_buffs enable row level security;
drop policy if exists "gm_buffs 看自己的和全服的" on public.gm_buffs;
create policy "gm_buffs 看自己的和全服的" on public.gm_buffs for select using (
  target_pid is null
  or target_pid = (select pid from profiles where id = auth.uid())
  or public.is_gm()
);
drop policy if exists "gm_buffs 管理员加" on public.gm_buffs;
create policy "gm_buffs 管理员加" on public.gm_buffs for insert with check (public.is_gm());
drop policy if exists "gm_buffs 管理员改" on public.gm_buffs;
create policy "gm_buffs 管理员改" on public.gm_buffs for update using (public.is_gm()) with check (public.is_gm());
drop policy if exists "gm_buffs 管理员删" on public.gm_buffs;
create policy "gm_buffs 管理员删" on public.gm_buffs for delete using (public.is_gm());

-- ============ GM 赠送物品（10-26）============
-- 管理员给指定玩家发邮件附带物品；玩家拉到后 claim_gm_mail 只成功一次，再放进自己的邮箱
create table if not exists public.gm_mail (
  id uuid primary key default gen_random_uuid(),
  target_pid bigint not null,
  title text not null check (char_length(title) between 1 and 30),
  body text not null default '' check (char_length(body) <= 500),
  items jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists gm_mail_target on public.gm_mail (target_pid, claimed_at);
alter table public.gm_mail enable row level security;
drop policy if exists "gm_mail 看自己的" on public.gm_mail;
create policy "gm_mail 看自己的" on public.gm_mail for select using (
  target_pid = (select pid from profiles where id = auth.uid()) or public.is_gm()
);
drop policy if exists "gm_mail 管理员发" on public.gm_mail;
create policy "gm_mail 管理员发" on public.gm_mail for insert with check (public.is_gm());
drop policy if exists "gm_mail 管理员删" on public.gm_mail;
create policy "gm_mail 管理员删" on public.gm_mail for delete using (public.is_gm());

create or replace function public.claim_gm_mail(p_mail uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update gm_mail set claimed_at = now()
    where id = p_mail and claimed_at is null and target_pid = (select pid from profiles where id = auth.uid());
  get diagnostics n = row_count;
  return n > 0;
end $$;
grant execute on function public.claim_gm_mail(uuid) to authenticated;

-- ============ 公会等级、贡献、仓库（10-26）============
-- 等级按公会经验算（和 src/core/guild.ts 的 GUILD_XP 保持一致），升级加人数上限和仓库格子。
-- 贡献：用物品兑换或交公会任务的物品得到（donated / donated_day = 今天换了多少贡献）；每周贡献每周一（UTC）清零，累计贡献一直留着。
-- 仓库：不用回城，随时存取（用户 10-26）；存取都记日志（保留 30 天）。
-- 公共仓库（vault 0）：成员都能存；取要副会长以上，或者累计贡献达到会长设的门槛（take_min，-1 = 只有副会长以上）。
-- 私人仓库（vault 1-3）：会长或副会长花公会贡献值开，只有名单里的人能看和存取（会长总能进），名单可以改。
alter table public.guilds add column if not exists take_min int not null default 0;
alter table public.guilds add column if not exists points bigint not null default 0;
alter table public.guild_members add column if not exists contrib bigint not null default 0;
alter table public.guild_members add column if not exists week date;
alter table public.guild_members add column if not exists donated bigint not null default 0;
alter table public.guild_members add column if not exists donated_day date;
alter table public.guild_tasks add column if not exists per int not null default 1;
alter table public.guild_tasks add column if not exists day date;

-- 10-27 完善：物品价格表（兑换、任务、限额都按服务器上的价格算，不信客户端）、公会商店、科技、签到、动态。
-- item_values / guild_shop 的数据在 supabase/guild-data.sql（由 src/core/guildSql.ts 生成，改了物品价格要重新生成再跑一次）
create table if not exists public.item_values (
  id text primary key,
  value int not null,
  -- 能出现在每日公会任务里的阶级（0-7），不能出的是空
  task_tier int
);
create table if not exists public.guild_shop (
  item text primary key,
  price int not null check (price > 0),
  lv int not null,
  daily int not null
);
alter table public.item_values enable row level security;
alter table public.guild_shop enable row level security;
drop policy if exists "item_values 所有人可看" on public.item_values;
create policy "item_values 所有人可看" on public.item_values for select using (true);
drop policy if exists "guild_shop 所有人可看" on public.guild_shop;
create policy "guild_shop 所有人可看" on public.guild_shop for select using (true);
-- 每天的兑换、取物、签到记在玩家身上（以前记在公会成员上，退会再进就能重置）
alter table public.profiles add column if not exists g_day date;
alter table public.profiles add column if not exists g_exchanged bigint not null default 0;
alter table public.profiles add column if not exists g_took bigint not null default 0;
alter table public.profiles add column if not exists g_checkin date;
-- 个人贡献花掉的部分（公会商店）：可用 = contrib - spent
alter table public.guild_members add column if not exists spent bigint not null default 0;
-- 公会科技等级 {xp, speed, coins, drop}；成员每天从公共仓库最多取多少金币价值的东西（0 = 不限）
alter table public.guilds add column if not exists tech jsonb not null default '{}'::jsonb;
alter table public.guilds add column if not exists take_day int not null default 0;
create table if not exists public.guild_shop_buys (
  player_id uuid not null references public.profiles(id) on delete cascade,
  item text not null,
  day date not null,
  qty int not null default 0,
  primary key (player_id, item, day)
);
alter table public.guild_shop_buys enable row level security;
drop policy if exists "guild_shop_buys 看自己的" on public.guild_shop_buys;
create policy "guild_shop_buys 看自己的" on public.guild_shop_buys for select using (player_id = auth.uid());
-- 公会动态：入会、退会、升级、任职、科技、私人仓库、任务完成
create table if not exists public.guild_events (
  id bigserial primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  kind text not null,
  name text not null default '',
  detail text not null default '',
  at timestamptz not null default now()
);
create index if not exists guild_events_guild on public.guild_events (guild_id, at desc);
alter table public.guild_events enable row level security;
drop policy if exists "guild_events 本会可看" on public.guild_events;
create policy "guild_events 本会可看" on public.guild_events for select
  using (guild_id = (select guild_id from public.guild_members where player_id = auth.uid()));

-- 记一条公会动态（内部用），顺便清掉 30 天前的
create or replace function public.guild_event(p_guild uuid, p_kind text, p_name text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from guilds where id = p_guild) then return; end if;
  insert into guild_events (guild_id, kind, name, detail) values (p_guild, p_kind, coalesce(p_name, ''), coalesce(p_detail, ''));
  delete from guild_events where guild_id = p_guild and at < now() - interval '30 days';
end $$;
revoke execute on function public.guild_event(uuid, text, text, text) from public, anon, authenticated;

-- 跨天了把玩家的每日计数清零（内部用）
create or replace function public.guild_day_reset(p_player uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set g_day = (now() at time zone 'utc')::date, g_exchanged = 0, g_took = 0
    where id = p_player and g_day is distinct from (now() at time zone 'utc')::date
$$;
revoke execute on function public.guild_day_reset(uuid) from public, anon, authenticated;

create or replace function public.guild_xp_table() returns bigint[] language sql immutable as $$
  select array[0, 5000, 15000, 35000, 70000, 120000, 200000, 320000, 500000, 800000]::bigint[]
$$;
create or replace function public.guild_level_of(p_xp bigint) returns int language sql immutable as $$
  select count(*)::int from unnest(public.guild_xp_table()) x where x <= p_xp
$$;
-- 仓库能放几种东西
create or replace function public.guild_slots(p_level int) returns int language sql immutable as $$
  select 30 + 10 * (greatest(p_level, 1) - 1)
$$;

-- 加公会经验，顺便升级、加人数上限（内部用，不给客户端直接调）
create or replace function public.guild_add_xp(p_guild uuid, p_xp bigint) returns void
language plpgsql security definer set search_path = public as $$
declare x bigint; lv int;
begin
  -- points：公会贡献值，和经验一起涨，会长和副会长能花（开私人仓库）
  update guilds set xp = xp + greatest(p_xp, 0), points = points + greatest(p_xp, 0) where id = p_guild returning xp into x;
  lv := guild_level_of(x);
  update guilds set level = lv, max_members = 30 + 2 * (lv - 1) where id = p_guild and level <> lv;
end $$;
revoke execute on function public.guild_add_xp(uuid, bigint) from public, anon, authenticated;

-- 给自己记贡献：跨周了先把每周贡献清零
create or replace function public.guild_add_contrib(p_player uuid, p_n bigint) returns void
language plpgsql security definer set search_path = public as $$
declare wk date := date_trunc('week', now() at time zone 'utc')::date;
begin
  update guild_members set
    weekly = case when week is distinct from wk then 0 else weekly end + p_n,
    week = wk,
    contrib = contrib + p_n
  where player_id = p_player;
end $$;
revoke execute on function public.guild_add_contrib(uuid, bigint) from public, anon, authenticated;

-- 物品兑换贡献（用户 10-26：贡献靠物品换）：每 10 金币价值 = 1 贡献 = 1 公会经验，每人每天（UTC）最多换 2000 贡献。
-- 价格查服务器上的 item_values（10-27 修：以前单价由客户端给，可以乱填）；东西本地先扣，返回实际收下的数量，多的退回
drop function if exists public.donate_coins(int);
drop function if exists public.exchange_items(text, int, int);
create or replace function public.exchange_items(p_item text, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare m guild_members; left_ bigint; v int; q int; n bigint;
begin
  if p_item = 'coins' then raise exception '金币不能兑换贡献'; end if;
  select * into m from guild_members where player_id = auth.uid();
  if m.player_id is null then raise exception '还没加入公会'; end if;
  select value into v from item_values where id = p_item;
  if v is null or v <= 0 then raise exception '这个东西不能兑换'; end if;
  perform guild_day_reset(auth.uid());
  select 2000 - g_exchanged into left_ from profiles where id = auth.uid() for update;
  if left_ <= 0 then raise exception '今天的兑换已经满了'; end if;
  q := least(greatest(p_qty, 0)::bigint, (left_ * 10) / v)::int;
  n := (q::bigint * v) / 10;
  if q <= 0 or n <= 0 then raise exception '数量太少，换不到 1 点贡献'; end if;
  update profiles set g_exchanged = g_exchanged + n where id = auth.uid();
  perform guild_add_contrib(auth.uid(), n);
  perform guild_add_xp(m.guild_id, n);
  return q;
end $$;
grant execute on function public.exchange_items(text, int) to authenticated;

-- 每日公会任务：客户端按公会 id + 日期挑出同样的三样东西，谁先打开公会页谁把今天的写进来。
-- 10-27 修：只收物品 id，要多少个、每个几点贡献、奖励都由服务器按价格算（和 src/core/guild.ts dailyTasks 一样的公式）
create or replace function public.ensure_guild_tasks(p_tasks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; lv int; top int; today date := (now() at time zone 'utc')::date; t jsonb; iv item_values; nd int; pr int; n int := 0;
begin
  select guild_id into g from guild_members where player_id = auth.uid();
  if g is null then raise exception '还没加入公会'; end if;
  select level into lv from guilds where id = g for update;
  top := least(7, greatest(1, lv));
  if exists (select 1 from guild_tasks where guild_id = g and day = today) then return; end if;
  delete from guild_tasks where guild_id = g and ends_at < now() - interval '1 day';
  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    exit when n >= 3;
    select * into iv from item_values where id = t->>'target' and task_tier is not null and task_tier <= top;
    continue when iv.id is null or exists (select 1 from guild_tasks where guild_id = g and day = today and target = iv.id);
    nd := greatest(10, least(300, (round(1500.0 / iv.value / 5) * 5)::int));
    pr := greatest(1, round(iv.value * 1.5 / 10)::int);
    insert into guild_tasks (guild_id, kind, target, need, have, reward, per, day, ends_at) values (
      g, 'donate', iv.id, nd, 0, (round(nd * pr * 0.5) + 100 * lv)::int, pr, today, (today + 1)::timestamp at time zone 'utc');
    n := n + 1;
  end loop;
end $$;
grant execute on function public.ensure_guild_tasks(jsonb) to authenticated;

-- 交任务物品（本地先扣）：返回实际收下的数量；交满时公会再拿任务奖励经验
drop function if exists public.contribute(uuid, int);
create or replace function public.contribute(p_task uuid, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; t guild_tasks; add int;
begin
  select guild_id into g from guild_members where player_id = auth.uid();
  select * into t from guild_tasks where id = p_task and guild_id = g for update;
  if t.id is null then raise exception '任务不存在'; end if;
  if t.ends_at < now() then raise exception '任务已结束'; end if;
  add := least(greatest(p_qty, 0), t.need - t.have);
  if add <= 0 then return 0; end if;
  update guild_tasks set have = have + add where id = p_task;
  perform guild_add_contrib(auth.uid(), add::bigint * t.per);
  perform guild_add_xp(g, add::bigint * t.per);
  if t.have + add >= t.need then
    perform guild_add_xp(g, t.reward);
    perform guild_event(g, 'task', '', t.target);
  end if;
  return add;
end $$;
grant execute on function public.contribute(uuid, int) to authenticated;

-- 公会仓库：vault 0 是公共仓库，1-3 是私人仓库
create table if not exists public.guild_vaults (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  idx int not null check (idx between 1 and 3),
  name text not null check (char_length(name) between 1 and 12),
  allow uuid[] not null default '{}',
  officers boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (guild_id, idx)
);
create table if not exists public.guild_bank (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  vault int not null default 0 check (vault between 0 and 3),
  item text not null check (char_length(item) <= 60),
  qty bigint not null check (qty > 0),
  -- 显示顺序：新存的排最后，「整理」时整体重排
  pos int not null default 0,
  primary key (guild_id, vault, item)
);
create table if not exists public.guild_bank_log (
  id bigserial primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  vault int not null default 0,
  player_id uuid,
  name text not null default '',
  item text not null,
  qty bigint not null,
  at timestamptz not null default now()
);
create index if not exists guild_bank_log_guild on public.guild_bank_log (guild_id, at desc);

-- 能不能进某个仓库：公共仓库本会成员都能进；私人仓库会长、名单里的人、勾了「副会长可进」时的副会长
create or replace function public.can_vault(p_guild uuid, p_vault int, p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from guild_members m
    left join guild_vaults v on v.guild_id = m.guild_id and v.idx = p_vault
    where m.player_id = p_player and m.guild_id = p_guild
      and (p_vault = 0 or (v.idx is not null and (m.role = 'leader' or p_player = any(v.allow) or (v.officers and m.role = 'officer'))))
  )
$$;
grant execute on function public.can_vault(uuid, int, uuid) to authenticated;

alter table public.guild_vaults enable row level security;
alter table public.guild_bank enable row level security;
alter table public.guild_bank_log enable row level security;
drop policy if exists "guild_vaults 本会可看" on public.guild_vaults;
create policy "guild_vaults 本会可看" on public.guild_vaults for select
  using (guild_id = (select guild_id from public.guild_members where player_id = auth.uid()));
drop policy if exists "guild_bank 本会可看" on public.guild_bank;
create policy "guild_bank 本会可看" on public.guild_bank for select using (public.can_vault(guild_id, vault, auth.uid()));
drop policy if exists "guild_bank_log 本会可看" on public.guild_bank_log;
create policy "guild_bank_log 本会可看" on public.guild_bank_log for select using (public.can_vault(guild_id, vault, auth.uid()));
-- 只能通过下面的函数存取

-- 开私人仓库要花的公会贡献值：第 1/2/3 个
create or replace function public.vault_cost(p_idx int) returns bigint language sql immutable as $$
  select (array[5000, 15000, 40000]::bigint[])[p_idx]
$$;
create or replace function public.open_vault(p_name text) returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; r text; n int; c bigint; pts bigint;
begin
  select guild_id, role into g, r from guild_members where player_id = auth.uid();
  if r is null or r = 'member' then raise exception '只有会长和副会长能开私人仓库'; end if;
  select points into pts from guilds where id = g for update;
  select count(*) into n from guild_vaults where guild_id = g;
  if n >= 3 then raise exception '私人仓库最多 3 个'; end if;
  c := vault_cost(n + 1);
  if pts < c then raise exception '公会贡献值不够'; end if;
  update guilds set points = points - c where id = g;
  insert into guild_vaults (guild_id, idx, name, allow) values (g, n + 1, left(coalesce(nullif(trim(p_name), ''), '私人仓库'), 12), array[auth.uid()]);
  return n + 1;
end $$;
grant execute on function public.open_vault(text) to authenticated;

-- 改私人仓库的名字和名单：会长，或者能进这个仓库的副会长
create or replace function public.set_vault(p_idx int, p_name text, p_allow uuid[], p_officers boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; r text;
begin
  select guild_id, role into g, r from guild_members where player_id = auth.uid();
  if not (r = 'leader' or (r = 'officer' and can_vault(g, p_idx, auth.uid()))) then raise exception '没有权限'; end if;
  update guild_vaults set
    name = left(coalesce(nullif(trim(p_name), ''), name), 12),
    -- 只留本会成员
    allow = coalesce((select array_agg(distinct a) from unnest(p_allow) a where exists (select 1 from guild_members where player_id = a and guild_id = g)), '{}'),
    officers = coalesce(p_officers, officers)
  where guild_id = g and idx = p_idx;
end $$;
grant execute on function public.set_vault(int, text, uuid[], boolean) to authenticated;

drop function if exists public.guild_deposit(text, int);
create or replace function public.guild_deposit(p_item text, p_qty int, p_vault int default 0) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid; lv int; nm text; cap int;
begin
  if p_qty <= 0 or p_qty > 1000000 then raise exception '数量不对'; end if;
  if p_item = 'coins' then raise exception '金币不能存进公会仓库'; end if;
  if not exists (select 1 from item_values where id = p_item) then raise exception '这个东西不能存'; end if;
  select guild_id into g from guild_members where player_id = auth.uid();
  if g is null then raise exception '还没加入公会'; end if;
  if not can_vault(g, p_vault, auth.uid()) then raise exception '没有这个仓库的权限'; end if;
  select level into lv from guilds where id = g for update;
  cap := case when p_vault = 0 then guild_slots(lv) else 30 end;
  if not exists (select 1 from guild_bank where guild_id = g and vault = p_vault and item = p_item)
    and (select count(*) from guild_bank where guild_id = g and vault = p_vault) >= cap then
    raise exception '公会仓库满了';
  end if;
  insert into guild_bank (guild_id, vault, item, qty, pos)
    values (g, p_vault, p_item, p_qty, (select coalesce(max(pos), 0) + 1 from guild_bank where guild_id = g and vault = p_vault))
    on conflict (guild_id, vault, item) do update set qty = guild_bank.qty + excluded.qty;
  select name into nm from profiles where id = auth.uid();
  insert into guild_bank_log (guild_id, vault, player_id, name, item, qty) values (g, p_vault, auth.uid(), coalesce(nm, ''), p_item, p_qty);
  delete from guild_bank_log where guild_id = g and at < now() - interval '30 days';
end $$;
grant execute on function public.guild_deposit(text, int, int) to authenticated;

-- 取东西：返回实际取到的数量（仓库里不够就取剩下的）
drop function if exists public.guild_withdraw(text, int);
create or replace function public.guild_withdraw(p_item text, p_qty int, p_vault int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare m guild_members; tm int; td int; have bigint; n int; nm text; v int; took bigint; capped boolean;
begin
  select * into m from guild_members where player_id = auth.uid();
  if m.player_id is null then raise exception '还没加入公会'; end if;
  if not can_vault(m.guild_id, p_vault, auth.uid()) then raise exception '没有这个仓库的权限'; end if;
  select take_min, take_day into tm, td from guilds where id = m.guild_id;
  if p_vault = 0 and m.role = 'member' and (tm < 0 or m.contrib < tm) then raise exception '贡献不够，不能从公会仓库取东西'; end if;
  select qty into have from guild_bank where guild_id = m.guild_id and vault = p_vault and item = p_item for update;
  n := least(greatest(p_qty, 0), coalesce(have, 0))::int;
  if n <= 0 then return 0; end if;
  -- 10-27：会长可以限制普通成员每天从公共仓库取多少金币价值的东西，防止有人一次搬空
  capped := p_vault = 0 and m.role = 'member' and td > 0;
  if capped then
    perform guild_day_reset(auth.uid());
    select coalesce(value, 1) into v from item_values where id = p_item;
    v := greatest(coalesce(v, 1), 1);
    select g_took into took from profiles where id = auth.uid() for update;
    n := least(n::bigint, (td - took) / v)::int;
    if n <= 0 then raise exception '今天从公会仓库取的东西已经到上限了'; end if;
    update profiles set g_took = g_took + n::bigint * v where id = auth.uid();
  end if;
  if n = have then delete from guild_bank where guild_id = m.guild_id and vault = p_vault and item = p_item;
  else update guild_bank set qty = qty - n where guild_id = m.guild_id and vault = p_vault and item = p_item; end if;
  select name into nm from profiles where id = auth.uid();
  insert into guild_bank_log (guild_id, vault, player_id, name, item, qty) values (m.guild_id, p_vault, auth.uid(), coalesce(nm, ''), p_item, -n);
  delete from guild_bank_log where guild_id = m.guild_id and at < now() - interval '30 days';
  return n;
end $$;
grant execute on function public.guild_withdraw(text, int, int) to authenticated;

-- 会长设成员从公共仓库取东西要多少累计贡献（-1 = 只有会长和副会长能取）
create or replace function public.set_take_min(p_min int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'leader' then raise exception '只有会长能改'; end if;
  update guilds set take_min = greatest(p_min, -1)
    where id = (select guild_id from guild_members where player_id = auth.uid());
end $$;
grant execute on function public.set_take_min(int) to authenticated;

-- 整理：客户端按类别、阶级排好顺序传上来（不在列表里的排最后）
create or replace function public.sort_guild_bank(p_vault int, p_items text[]) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select guild_id into g from guild_members where player_id = auth.uid();
  if g is null or not can_vault(g, p_vault, auth.uid()) then raise exception '没有这个仓库的权限'; end if;
  update guild_bank b set pos = coalesce(array_position(p_items, b.item), 100000) where b.guild_id = g and b.vault = p_vault;
end $$;
grant execute on function public.sort_guild_bank(int, text[]) to authenticated;

-- ============ 公会完善（10-27）：签到、商店、科技、取物上限、动态 ============
-- 每日签到：每人每天一次（记在玩家身上，换公会也只能签一次），得 10 + 5×公会等级 贡献，公会拿同样多的经验和贡献值
create or replace function public.guild_checkin() returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; lv int; today date := (now() at time zone 'utc')::date; n int; ok int;
begin
  select guild_id into g from guild_members where player_id = auth.uid();
  if g is null then raise exception '还没加入公会'; end if;
  update profiles set g_checkin = today where id = auth.uid() and g_checkin is distinct from today;
  get diagnostics ok = row_count;
  if ok = 0 then raise exception '今天已经签到过了'; end if;
  select level into lv from guilds where id = g;
  n := 10 + 5 * lv;
  perform guild_add_contrib(auth.uid(), n);
  perform guild_add_xp(g, n);
  return n;
end $$;
grant execute on function public.guild_checkin() to authenticated;

-- 公会商店：花自己的可用贡献（累计 - 已花）买东西，商品按公会等级解锁，每样每天限购。返回买到的数量，东西客户端放进仓库
create or replace function public.buy_guild_item(p_item text, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare m guild_members; sh guild_shop; lv int; today date := (now() at time zone 'utc')::date; bought int; q int;
begin
  select * into m from guild_members where player_id = auth.uid() for update;
  if m.player_id is null then raise exception '还没加入公会'; end if;
  select * into sh from guild_shop where item = p_item;
  if sh.item is null then raise exception '商店里没有这个'; end if;
  select level into lv from guilds where id = m.guild_id;
  if lv < sh.lv then raise exception '公会等级不够'; end if;
  select coalesce(sum(qty), 0) into bought from guild_shop_buys where player_id = auth.uid() and item = p_item and day = today;
  q := least(greatest(p_qty, 0), sh.daily - bought);
  if q <= 0 then raise exception '今天已经买到上限了'; end if;
  q := least(q::bigint, (m.contrib - m.spent) / sh.price)::int;
  if q <= 0 then raise exception '贡献不够'; end if;
  update guild_members set spent = spent + q::bigint * sh.price where player_id = auth.uid();
  insert into guild_shop_buys (player_id, item, day, qty) values (auth.uid(), p_item, today, q)
    on conflict (player_id, item, day) do update set qty = guild_shop_buys.qty + excluded.qty;
  delete from guild_shop_buys where player_id = auth.uid() and day < today - 7;
  return q;
end $$;
grant execute on function public.buy_guild_item(text, int) to authenticated;

-- 公会科技：会长和副会长花公会贡献值升级，每项最高 5 级、不超过公会等级的一半；第 n 级花 3000×2^(n-1)
create or replace function public.upgrade_tech(p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; r text; gd guilds; cur int; cost bigint; nm text;
begin
  if p_kind not in ('xp', 'speed', 'coins', 'drop') then raise exception '没有这项科技'; end if;
  select guild_id, role into g, r from guild_members where player_id = auth.uid();
  if r is null or r = 'member' then raise exception '只有会长和副会长能升级科技'; end if;
  select * into gd from guilds where id = g for update;
  cur := coalesce((gd.tech->>p_kind)::int, 0);
  if cur >= least(5, gd.level / 2) then raise exception '已经到上限了，公会升级后才能继续'; end if;
  cost := 3000 * (2 ^ cur)::bigint;
  if gd.points < cost then raise exception '公会贡献值不够'; end if;
  update guilds set points = points - cost, tech = tech || jsonb_build_object(p_kind, cur + 1) where id = g;
  select name into nm from profiles where id = auth.uid();
  perform guild_event(g, 'tech', nm, p_kind || ':' || (cur + 1));
  return cur + 1;
end $$;
grant execute on function public.upgrade_tech(text) to authenticated;

-- 会长设普通成员每天从公共仓库最多取多少金币价值（0 = 不限）
create or replace function public.set_take_day(p_value int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'leader' then raise exception '只有会长能改'; end if;
  update guilds set take_day = greatest(p_value, 0)
    where id = (select guild_id from guild_members where player_id = auth.uid());
end $$;
grant execute on function public.set_take_day(int) to authenticated;

-- 公会动态的触发器：入会、离开（同时从私人仓库名单里删掉，以后重新加入也不会自动有权限）、任职、升级、开私人仓库
create or replace function public.guild_members_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select name into nm from profiles where id = coalesce(new.player_id, old.player_id);
  if tg_op = 'INSERT' then
    perform guild_event(new.guild_id, 'join', nm, '');
  elsif tg_op = 'DELETE' then
    update guild_vaults set allow = array_remove(allow, old.player_id) where guild_id = old.guild_id;
    perform guild_event(old.guild_id, 'leave', nm, '');
  elsif new.role is distinct from old.role then
    perform guild_event(new.guild_id, 'role', nm, new.role);
  end if;
  return null;
end $$;
drop trigger if exists guild_members_event on public.guild_members;
create trigger guild_members_event after insert or delete or update of role on public.guild_members
  for each row execute function public.guild_members_event();

create or replace function public.guilds_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level > old.level then perform guild_event(new.id, 'level', '', new.level::text); end if;
  return null;
end $$;
drop trigger if exists guilds_event on public.guilds;
create trigger guilds_event after update of level on public.guilds for each row execute function public.guilds_event();

create or replace function public.guild_vaults_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select name into nm from profiles where id = auth.uid();
  perform guild_event(new.guild_id, 'vault', nm, new.name);
  return null;
end $$;
drop trigger if exists guild_vaults_event on public.guild_vaults;
create trigger guild_vaults_event after insert on public.guild_vaults for each row execute function public.guild_vaults_event();

-- 自己今天的兑换、取物、签到（profiles 的这几列自己能看）
create or replace function public.my_guild_day() returns table (exchanged bigint, took bigint, checked_in boolean)
language sql stable security definer set search_path = public as $$
  select case when g_day = (now() at time zone 'utc')::date then g_exchanged else 0 end,
         case when g_day = (now() at time zone 'utc')::date then g_took else 0 end,
         g_checkin is not distinct from (now() at time zone 'utc')::date
  from profiles where id = auth.uid()
$$;
grant execute on function public.my_guild_day() to authenticated;
