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

-- ============ AI 玩家（10-31）============
-- 只存名字和种子；外观、等级、去哪干活、世界频道说什么，各家按种子和时间算出来（src/net/bots.ts）
create table if not exists public.ai_players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 12),
  seed bigint not null,
  created_at timestamptz not null default now()
);
alter table public.ai_players enable row level security;
drop policy if exists "ai_players 所有人可看" on public.ai_players;
create policy "ai_players 所有人可看" on public.ai_players for select using (true);
drop policy if exists "ai_players 管理员加" on public.ai_players;
create policy "ai_players 管理员加" on public.ai_players for insert with check (public.is_gm());
drop policy if exists "ai_players 管理员改" on public.ai_players;
create policy "ai_players 管理员改" on public.ai_players for update using (public.is_gm()) with check (public.is_gm());
drop policy if exists "ai_players 管理员删" on public.ai_players;
create policy "ai_players 管理员删" on public.ai_players for delete using (public.is_gm());

-- ============ 全服开关（11-01）============
-- key → value。ai_mute：AI 玩家不在世界频道说话；ac：防作弊阈值。所有人可读，管理员可写
create table if not exists public.game_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_flags enable row level security;
drop policy if exists "game_flags 所有人可看" on public.game_flags;
create policy "game_flags 所有人可看" on public.game_flags for select using (true);
drop policy if exists "game_flags 管理员写" on public.game_flags;
create policy "game_flags 管理员写" on public.game_flags for all using (public.is_gm()) with check (public.is_gm());

-- ============ 防作弊（11-01）============
-- 存档和排行榜是客户端传的，服务器在入库时按真实时间检查：
--   时间：存档里的游戏时间比服务器时间跑得快（改系统时间刷离线收益）
--   经验：两次上传之间涨的经验超过每小时上限（按 GM 经验增益放宽）
--   金币：两次上传之间涨的金币超过每小时上限（扣掉 GM 邮件送的）
--   排行榜：上传的经验和云存档对不上
-- 可疑的记一条 cheat_flags；严重的自动移出排行榜（ac_hidden），GM 在面板里看记录、解除、封禁。
-- 封禁：不上排行榜、不能在世界频道说话。
alter table public.profiles add column if not exists ac_hidden boolean not null default false;
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists ac_note text;

create table if not exists public.cheat_flags (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  severe boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists cheat_flags_at on public.cheat_flags (at desc);
create index if not exists cheat_flags_player on public.cheat_flags (player_id, kind, at desc);
alter table public.cheat_flags enable row level security;
drop policy if exists "cheat_flags 管理员看" on public.cheat_flags;
create policy "cheat_flags 管理员看" on public.cheat_flags for select using (public.is_gm());
drop policy if exists "cheat_flags 管理员删" on public.cheat_flags;
create policy "cheat_flags 管理员删" on public.cheat_flags for delete using (public.is_gm());

create or replace function public.is_banned(p uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = p), false)
$$;
grant execute on function public.is_banned(uuid) to authenticated;

-- 阈值（GM 面板可改，存在 game_flags.ac）
create or replace function public.ac_conf(k text, d numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> k)::numeric from game_flags where key = 'ac'), d)
$$;

-- 记一条（同一个人同一种 10 分钟内只记一次）；严重的顺手移出排行榜
create or replace function public.ac_flag(p uuid, p_kind text, p_severe boolean, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from cheat_flags where player_id = p and kind = p_kind and (severe or not p_severe) and at > now() - interval '10 minutes') then
    return;
  end if;
  insert into cheat_flags (player_id, kind, severe, detail) values (p, p_kind, p_severe, p_detail);
  if p_severe and public.ac_conf('auto_hide', 1) > 0 then
    update profiles set ac_hidden = true where id = p;
  end if;
end $$;
revoke execute on function public.ac_flag(uuid, text, boolean, jsonb) from public, anon, authenticated;

create or replace function public.ac_sum(o jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) from jsonb_each(coalesce(o, '{}'::jsonb)) as e(k, v)
$$;

-- 上传存档时检查
create or replace function public.ac_check_save() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  real_ms numeric; game_ms numeric; hours numeric;
  xp_new numeric; xp_old numeric; xp_cap numeric; boost numeric;
  c_new numeric; c_old numeric; c_cap numeric; gifted numeric;
  me_pid bigint; since timestamptz;
begin
  -- 回档函数写入时不检查
  if current_setting('ac.bypass', true) = '1' then return new; end if;
  -- 上传时间以服务器为准
  new.updated_at := now();
  if (select exists (select 1 from gm_admins a join profiles p on p.pid = a.pid where p.id = new.player_id)) then
    return new;
  end if;
  select pid into me_pid from profiles where id = new.player_id;
  -- 存档时间跑到服务器前面去了
  if new.last_tick > extract(epoch from now()) * 1000 + public.ac_conf('clock_skew_min', 10) * 60000 then
    perform public.ac_flag(new.player_id, 'clock', new.last_tick > extract(epoch from now()) * 1000 + 3 * 3600000, jsonb_build_object('ahead_min', round((new.last_tick - extract(epoch from now()) * 1000) / 60000)));
  end if;
  if tg_op = 'UPDATE' then
    since := old.updated_at;
    xp_old := public.ac_sum(old.data -> 'xp');
    c_old := coalesce((old.data -> 'bank' ->> 'coins')::numeric, 0);
    game_ms := new.last_tick - old.last_tick;
  else
    since := coalesce((select created_at from profiles where id = new.player_id), now() - interval '1 hour');
    xp_old := 0; c_old := 0; game_ms := 0;
  end if;
  real_ms := greatest(extract(epoch from now() - since) * 1000, 0);
  hours := greatest(real_ms / 3600000.0, 0.02);
  -- 游戏时间比真实时间多走了很多（离线结算最多 24 小时，正常不会超过真实时间）
  if tg_op = 'UPDATE' and game_ms - real_ms > public.ac_conf('drift_min', 30) * 60000 then
    perform public.ac_flag(new.player_id, 'clock', game_ms - real_ms > 3 * 3600000,
      jsonb_build_object('game_min', round(game_ms / 60000), 'real_min', round(real_ms / 60000)));
  end if;
  -- 经验：GM 经验增益期间按比例放宽
  select coalesce(sum(pct), 0) / 100.0 into boost from gm_buffs
    where kind = 'xp' and ends_at > since and starts_at < now() and (target_pid is null or target_pid = me_pid);
  xp_new := public.ac_sum(new.data -> 'xp');
  xp_cap := public.ac_conf('xp_per_hour', 6000000) * (1 + boost) * hours + public.ac_conf('xp_slack', 300000);
  if xp_new - xp_old > xp_cap then
    perform public.ac_flag(new.player_id, 'xp', xp_new - xp_old > 3 * xp_cap,
      jsonb_build_object('gain', xp_new - xp_old, 'cap', round(xp_cap), 'hours', round(hours, 2)));
  end if;
  -- 经验不可能变少（GM 改档除外，这里只记不算严重）
  if tg_op = 'UPDATE' and xp_new < xp_old - 1 then
    perform public.ac_flag(new.player_id, 'xp_drop', false, jsonb_build_object('old', xp_old, 'new', xp_new));
  end if;
  -- 金币：扣掉这段时间 GM 邮件送的
  select coalesce(sum((it ->> 'qty')::numeric), 0) into gifted
    from gm_mail m, jsonb_array_elements(m.items) it
    where m.target_pid = me_pid and m.claimed_at > since - interval '5 minutes' and it ->> 'item' = 'coins';
  c_new := coalesce((new.data -> 'bank' ->> 'coins')::numeric, 0);
  c_cap := public.ac_conf('coins_per_hour', 50000000) * hours + public.ac_conf('coins_slack', 5000000) + gifted;
  if c_new - c_old > c_cap then
    perform public.ac_flag(new.player_id, 'coins', c_new - c_old > 5 * c_cap,
      jsonb_build_object('gain', c_new - c_old, 'cap', round(c_cap), 'hours', round(hours, 2)));
  end if;
  return new;
end $$;
drop trigger if exists ac_check_save on public.saves;
create trigger ac_check_save before insert or update on public.saves for each row execute function public.ac_check_save();

-- 排行榜：经验必须和云存档一致，等级总和要对得上
create or replace function public.ac_check_rank() returns trigger
language plpgsql security definer set search_path = public as $$
declare save_xp numeric; lv_sum numeric;
begin
  if current_setting('ac.bypass', true) = '1' then return new; end if;
  new.updated_at := now();
  select public.ac_sum(data -> 'xp') into save_xp from saves where player_id = new.player_id;
  select public.ac_sum(new.skills) into lv_sum;
  if save_xp is null or public.ac_sum(new.xp) > save_xp + 1 or new.total <> lv_sum then
    perform public.ac_flag(new.player_id, 'rank', true,
      jsonb_build_object('rank_xp', public.ac_sum(new.xp), 'save_xp', save_xp, 'total', new.total, 'lv_sum', lv_sum));
  end if;
  return new;
end $$;
drop trigger if exists ac_check_rank on public.ranks;
create trigger ac_check_rank before insert or update on public.ranks for each row execute function public.ac_check_rank();

-- 客户端发现的异常（改系统时间、改本地存档）也报上来
create or replace function public.report_cheat(p_kind text, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('clock_local', 'save_edit', 'speed') then return; end if;
  perform public.ac_flag(auth.uid(), p_kind, false, coalesce(p_detail, '{}'::jsonb));
end $$;
grant execute on function public.report_cheat(text, jsonb) to authenticated;

-- 服务器时间（客户端校准时钟用）
create or replace function public.server_now() returns bigint
language sql stable as $$ select (extract(epoch from now()) * 1000)::bigint $$;
grant execute on function public.server_now() to anon, authenticated;

-- 自己的状态（被封禁 / 被移出排行榜时客户端提示）
create or replace function public.my_ac() returns table (hidden boolean, banned boolean)
language sql stable security definer set search_path = public as $$
  select ac_hidden, banned from profiles where id = auth.uid()
$$;
grant execute on function public.my_ac() to authenticated;

-- 管理员：可疑玩家列表（每人一行：最近的记录、次数、状态）
create or replace function public.gm_cheaters(p_limit int default 100)
returns table (player_id uuid, pid bigint, name text, hidden boolean, banned boolean, note text, n bigint, severe bigint, last_at timestamptz, flags jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return query
    select p.id, p.pid, p.name, p.ac_hidden, p.banned, p.ac_note, count(f.id), count(f.id) filter (where f.severe), max(f.at),
      (select jsonb_agg(x order by x.at desc) from (select f2.kind, f2.severe, f2.detail, f2.at from cheat_flags f2 where f2.player_id = p.id order by f2.at desc limit 10) x)
    from profiles p left join cheat_flags f on f.player_id = p.id
    where f.id is not null or p.ac_hidden or p.banned
    group by p.id
    order by max(f.at) desc nulls last
    limit least(p_limit, 300);
end $$;
grant execute on function public.gm_cheaters(int) to authenticated;

-- 管理员：改状态。action: hide / unhide / ban / unban / clear（清记录并解除移出）
create or replace function public.gm_ac_set(p_player uuid, p_action text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  if p_action = 'hide' then update profiles set ac_hidden = true where id = p_player;
  elsif p_action = 'unhide' then update profiles set ac_hidden = false where id = p_player;
  elsif p_action = 'ban' then update profiles set banned = true, ac_hidden = true where id = p_player;
  elsif p_action = 'unban' then update profiles set banned = false, ac_hidden = false where id = p_player;
  elsif p_action = 'clear' then delete from cheat_flags where player_id = p_player; update profiles set ac_hidden = false where id = p_player and not banned;
  else raise exception '未知操作'; end if;
  if p_note is not null then update profiles set ac_note = left(p_note, 100) where id = p_player; end if;
end $$;
grant execute on function public.gm_ac_set(uuid, text, text) to authenticated;

-- 排行榜不显示被移出 / 封禁的人
create or replace function public.leaderboard(p_board text, p_limit int default 100)
returns table (rank bigint, player_id uuid, name text, guild_tag text, value int, xp numeric)
language sql stable security definer set search_path = public as $$
  with v as (
    select r.player_id,
      case p_board when 'total' then r.total when 'combat' then r.combat
        else coalesce((r.skills ->> p_board)::int, 1) end as value,
      coalesce((r.xp ->> p_board)::numeric, 0) as xp
    from ranks r join profiles p0 on p0.id = r.player_id
    where not p0.ac_hidden and not p0.banned
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
    from ranks r join profiles p0 on p0.id = r.player_id
    where (not p0.ac_hidden and not p0.banned) or r.player_id = auth.uid()
  ), me as (select * from v where player_id = auth.uid())
  select (select count(*) + 1 from v where v.player_id <> me.player_id and (v.value > me.value or (v.value = me.value and v.xp > me.xp))),
    me.player_id, p.name, g.tag, me.value, me.xp
  from me join profiles p on p.id = me.player_id left join guilds g on g.id = p.guild_id
$$;

-- 封禁的人不能在世界频道说话
drop policy if exists "chat 自己发" on public.chat;
create policy "chat 自己发" on public.chat for insert with check (
  auth.uid() = player_id
  and name = (select name from public.profiles where id = auth.uid())
  and (channel = 'world' and guild_id is null and party_id is null and to_id is null and not public.is_banned()
    or channel = 'guild' and guild_id = (select guild_id from public.profiles where id = auth.uid())
    or channel = 'party' and party_id = public.my_party()
    or channel = 'private' and to_id is not null and public.is_friend(auth.uid(), to_id)));

-- ============ 防作弊第二批（11-01）============
-- 物品：存档里不存在的物品、数量不合法、仓库总价值涨得太快（按 item_values 价格，扣掉交易收到的和 GM 送的）
-- 回档：存档时间倒退（交易出去以后再传旧存档刷物品）
-- 交易：价值严重不对等（大号给小号送资源）、给出的东西比云存档里还多
-- 世界频道刷屏：每分钟最多 8 句，超了丢掉并记录
-- 多开：同一台设备登录过多个账号
-- 交易记录：GM 面板可以看所有玩家的交易

-- 一包物品按服务器价格算总价值（coins 按 1）
create or replace function public.ac_value(o jsonb) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when jsonb_typeof(e.v) = 'number' then e.v::text::numeric * coalesce(iv.value, 0) else 0 end), 0)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as e(k, v) left join item_values iv on iv.id = e.k
$$;

-- 物品总价值（仓库 + 背包 + 身上，不算金币）
create or replace function public.ac_save_value(d jsonb) returns numeric
language sql stable security definer set search_path = public as $$
  select public.ac_value(coalesce(d -> 'bank', '{}'::jsonb) - 'coins') + public.ac_value(coalesce(d -> 'bag', '{}'::jsonb) - 'coins')
    + coalesce((select sum(coalesce(iv.value, 0)) from jsonb_each_text(coalesce(d -> 'equipment', '{}'::jsonb)) e(k, v) join item_values iv on iv.id = e.v), 0)
$$;

-- 不合法的物品：不存在的 id、数量不是正整数、数量离谱
create or replace function public.ac_bad_items(d jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.k, 'n', x.v)), '[]'::jsonb) from (
    select e.k, e.v from jsonb_each(coalesce(d -> 'bank', '{}'::jsonb) || coalesce(d -> 'bag', '{}'::jsonb)) e(k, v)
    where (e.k <> 'coins' and not exists (select 1 from item_values iv where iv.id = e.k))
       or jsonb_typeof(e.v) <> 'number'
       or e.v::text::numeric < 0
       or e.v::text::numeric <> floor(e.v::text::numeric)
       or (e.k <> 'coins' and e.v::text::numeric > 1000000000)
    limit 10
  ) x
$$;

create or replace function public.ac_check_save() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  real_ms numeric; game_ms numeric; hours numeric;
  xp_new numeric; xp_old numeric; xp_cap numeric; boost numeric;
  c_new numeric; c_old numeric; c_cap numeric; gifted numeric;
  v_new numeric; v_old numeric; v_cap numeric; v_in numeric;
  bad jsonb; traded boolean; dev text; n_acc int;
  me_pid bigint; since timestamptz;
begin
  -- 回档函数写入时不检查
  if current_setting('ac.bypass', true) = '1' then return new; end if;
  -- 上传时间以服务器为准
  new.updated_at := now();
  if (select exists (select 1 from gm_admins a join profiles p on p.pid = a.pid where p.id = new.player_id)) then
    return new;
  end if;
  select pid into me_pid from profiles where id = new.player_id;
  -- 存档时间跑到服务器前面去了
  if new.last_tick > extract(epoch from now()) * 1000 + public.ac_conf('clock_skew_min', 10) * 60000 then
    perform public.ac_flag(new.player_id, 'clock', new.last_tick > extract(epoch from now()) * 1000 + 3 * 3600000, jsonb_build_object('ahead_min', round((new.last_tick - extract(epoch from now()) * 1000) / 60000)));
  end if;
  if tg_op = 'UPDATE' then
    since := old.updated_at;
    xp_old := public.ac_sum(old.data -> 'xp');
    c_old := coalesce((old.data -> 'bank' ->> 'coins')::numeric, 0);
    v_old := public.ac_save_value(old.data);
    game_ms := new.last_tick - old.last_tick;
  else
    since := coalesce((select created_at from profiles where id = new.player_id), now() - interval '1 hour');
    xp_old := 0; c_old := 0; v_old := 0; game_ms := 0;
  end if;
  real_ms := greatest(extract(epoch from now() - since) * 1000, 0);
  hours := greatest(real_ms / 3600000.0, 0.02);
  -- 游戏时间比真实时间多走了很多（离线结算最多 24 小时，正常不会超过真实时间）
  if tg_op = 'UPDATE' and game_ms - real_ms > public.ac_conf('drift_min', 30) * 60000 then
    perform public.ac_flag(new.player_id, 'clock', game_ms - real_ms > 3 * 3600000,
      jsonb_build_object('game_min', round(game_ms / 60000), 'real_min', round(real_ms / 60000)));
  end if;
  -- 回档：存档时间倒退。这段时间里做成过交易的算严重（交易出去再传旧档 = 刷物品）
  if tg_op = 'UPDATE' and game_ms < -5 * 60000 then
    select exists (select 1 from trades t where t.status = 'done' and new.player_id in (t.a, t.b)
      and t.updated_at > to_timestamp(new.last_tick / 1000.0)) into traded;
    perform public.ac_flag(new.player_id, 'rollback', traded,
      jsonb_build_object('back_min', round(-game_ms / 60000), 'traded', traded));
  end if;
  -- 经验：GM 经验增益期间按比例放宽
  select coalesce(sum(pct), 0) / 100.0 into boost from gm_buffs
    where kind = 'xp' and ends_at > since and starts_at < now() and (target_pid is null or target_pid = me_pid);
  xp_new := public.ac_sum(new.data -> 'xp');
  xp_cap := public.ac_conf('xp_per_hour', 6000000) * (1 + boost) * hours + public.ac_conf('xp_slack', 300000);
  if xp_new - xp_old > xp_cap then
    perform public.ac_flag(new.player_id, 'xp', xp_new - xp_old > 3 * xp_cap,
      jsonb_build_object('gain', xp_new - xp_old, 'cap', round(xp_cap), 'hours', round(hours, 2)));
  end if;
  if tg_op = 'UPDATE' and xp_new < xp_old - 1 then
    perform public.ac_flag(new.player_id, 'xp_drop', false, jsonb_build_object('old', xp_old, 'new', xp_new));
  end if;
  -- 这段时间别人交易给的、GM 送的（金币和物品价值分开算）
  select coalesce(sum((it ->> 'qty')::numeric), 0) into gifted
    from gm_mail m, jsonb_array_elements(m.items) it
    where m.target_pid = me_pid and m.claimed_at > since - interval '5 minutes' and it ->> 'item' = 'coins';
  select coalesce(sum(coalesce((case when t.a = new.player_id then t.b_items else t.a_items end ->> 'coins')::numeric, 0)), 0) into c_cap
    from trades t where t.status = 'done' and new.player_id in (t.a, t.b) and t.updated_at > since - interval '5 minutes';
  gifted := gifted + c_cap;
  c_new := coalesce((new.data -> 'bank' ->> 'coins')::numeric, 0);
  c_cap := public.ac_conf('coins_per_hour', 50000000) * hours + public.ac_conf('coins_slack', 5000000) + gifted;
  if c_new - c_old > c_cap then
    perform public.ac_flag(new.player_id, 'coins', c_new - c_old > 5 * c_cap,
      jsonb_build_object('gain', c_new - c_old, 'cap', round(c_cap), 'hours', round(hours, 2)));
  end if;
  -- 物品总价值
  select coalesce(sum(public.ac_value(case when t.a = new.player_id then t.b_items else t.a_items end - 'coins')), 0) into v_in
    from trades t where t.status = 'done' and new.player_id in (t.a, t.b) and t.updated_at > since - interval '5 minutes';
  select v_in + coalesce(sum((it ->> 'qty')::numeric * coalesce(iv.value, 0)), 0) into v_in
    from gm_mail m, jsonb_array_elements(m.items) it left join item_values iv on iv.id = it ->> 'item'
    where m.target_pid = me_pid and m.claimed_at > since - interval '5 minutes' and it ->> 'item' <> 'coins';
  v_new := public.ac_save_value(new.data);
  v_cap := public.ac_conf('value_per_hour', 50000000) * hours + public.ac_conf('value_slack', 5000000) + v_in;
  if v_new - v_old > v_cap then
    perform public.ac_flag(new.player_id, 'items', v_new - v_old > 5 * v_cap,
      jsonb_build_object('gain', round(v_new - v_old), 'cap', round(v_cap), 'hours', round(hours, 2)));
  end if;
  -- 不合法的物品
  bad := public.ac_bad_items(new.data);
  if jsonb_array_length(bad) > 0 then
    perform public.ac_flag(new.player_id, 'bad_item',
      exists (select 1 from jsonb_array_elements(bad) b where jsonb_typeof(b -> 'n') <> 'number' or (b ->> 'n')::numeric < 0 or (b ->> 'n')::numeric > 1000000000),
      jsonb_build_object('items', bad));
  end if;
  -- 多开：同一台设备传过几个账号的存档
  dev := new.data ->> '_device';
  if dev is not null then
    select count(distinct player_id) into n_acc from saves where data ->> '_device' = dev and player_id <> new.player_id;
    if n_acc + 1 >= public.ac_conf('multi_accounts', 3) then
      perform public.ac_flag(new.player_id, 'multi', false, jsonb_build_object('accounts', n_acc + 1));
    end if;
  end if;
  return new;
end $$;

-- 交易成交时检查：价值严重不对等；给出去的比云存档里有的还多
create or replace function public.ac_check_trade() returns trigger
language plpgsql security definer set search_path = public as $$
declare va numeric; vb numeric; gap numeric; k text; v jsonb; have numeric; fake jsonb; side uuid; items jsonb;
begin
  if new.status <> 'done' or old.status = 'done' then return new; end if;
  va := public.ac_value(new.a_items);
  vb := public.ac_value(new.b_items);
  gap := public.ac_conf('trade_gap', 3000000);
  if abs(va - vb) > gap and greatest(va, vb) > 5 * least(va, vb) then
    -- 记在收东西多的那一方（被送资源的小号）
    perform public.ac_flag(case when va > vb then new.b else new.a end, 'trade', false,
      jsonb_build_object('trade', new.id, 'from', (select name from profiles where id = case when va > vb then new.a else new.b end),
        'got', round(greatest(va, vb)), 'gave', round(least(va, vb))));
  end if;
  foreach side in array array[new.a, new.b] loop
    items := case when side = new.a then new.a_items else new.b_items end;
    fake := '[]'::jsonb;
    for k, v in select * from jsonb_each(items) loop
      select coalesce(case when k = 'coins' then (data -> 'bank' ->> 'coins')::numeric
        else coalesce((data -> 'bank' ->> k)::numeric, 0) + coalesce((data -> 'bag' ->> k)::numeric, 0) end, 0)
        into have from saves where player_id = side;
      if coalesce(have, 0) < v::text::numeric then
        fake := fake || jsonb_build_object('id', k, 'gave', v, 'had', coalesce(have, 0));
      end if;
    end loop;
    if jsonb_array_length(fake) > 0 then
      perform public.ac_flag(side, 'trade_fake', public.ac_value((select jsonb_object_agg(f ->> 'id', (f ->> 'gave')::numeric - (f ->> 'had')::numeric) from jsonb_array_elements(fake) f)) > public.ac_conf('trade_gap', 3000000),
        jsonb_build_object('trade', new.id, 'items', fake));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists ac_check_trade on public.trades;
create trigger ac_check_trade before update on public.trades for each row execute function public.ac_check_trade();

-- 世界频道刷屏：每分钟最多 8 句（GM 不限）
create or replace function public.ac_check_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.channel <> 'world' or public.is_gm() then return new; end if;
  select count(*) into n from chat where player_id = new.player_id and channel = 'world' and at > now() - interval '1 minute';
  if n >= public.ac_conf('chat_per_min', 8) then
    perform public.ac_flag(new.player_id, 'spam', false, jsonb_build_object('per_min', n + 1));
    -- 不报错（报错的话记录也会一起撤销），直接丢掉这句
    return null;
  end if;
  return new;
end $$;
drop trigger if exists ac_check_chat on public.chat;
create trigger ac_check_chat before insert on public.chat for each row execute function public.ac_check_chat();

-- 客户端报上来的种类加上「游戏加速」
create or replace function public.report_cheat(p_kind text, p_detail jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('clock_local', 'save_edit', 'speed') then return; end if;
  perform public.ac_flag(auth.uid(), p_kind, false, coalesce(p_detail, '{}'::jsonb));
end $$;

-- 管理员：所有玩家的交易记录（最近的在前），可以按数字 ID 或名字筛
create or replace function public.gm_trades(p_who text default null, p_limit int default 100)
returns table (id uuid, a uuid, a_pid bigint, a_name text, b uuid, b_pid bigint, b_name text,
  a_items jsonb, b_items jsonb, a_value numeric, b_value numeric, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return query
    select t.id, t.a, pa.pid, pa.name, t.b, pb.pid, pb.name, t.a_items, t.b_items,
      public.ac_value(t.a_items), public.ac_value(t.b_items), t.status, t.created_at, t.updated_at
    from trades t join profiles pa on pa.id = t.a join profiles pb on pb.id = t.b
    where p_who is null or p_who = ''
      or pa.pid::text = p_who or pb.pid::text = p_who
      or lower(pa.name) like '%' || lower(p_who) || '%' or lower(pb.name) like '%' || lower(p_who) || '%'
    order by t.updated_at desc
    limit least(p_limit, 300);
end $$;
grant execute on function public.gm_trades(text, int) to authenticated;

-- ============ 服务器存档 / 回档（11-01）============
-- 快照：把所有玩家的云存档和排行榜复制一份。每天自动存一份（保留最近 snap_keep_auto 份，默认 3），GM 也能手动存（保留最近 10 份）。
-- 回档：把存档换回快照里的样子（全服或单个玩家）。全服回档前会先自动存一份「回档前」快照，回错了还能再回来。
-- 每个玩家有 save_epoch，回档时 +1 并写进存档的 _epoch；客户端上传时带的 _epoch 比它小就拒收（报 ROLLBACK），
-- 客户端收到后读回档后的存档并刷新，所以开着游戏的人也不会把旧进度传回去。
-- 不回档的：公会仓库、交易、邮件、聊天这些服务器上的表（只回角色存档和排行榜）。
alter table public.profiles add column if not exists save_epoch int not null default 0;

create table if not exists public.server_snapshots (
  id bigint generated always as identity primary key,
  label text not null default '',
  auto boolean not null default false,
  players int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.snapshot_saves (
  snapshot_id bigint not null references public.server_snapshots(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  last_tick bigint not null,
  rank jsonb,
  primary key (snapshot_id, player_id)
);
alter table public.server_snapshots enable row level security;
alter table public.snapshot_saves enable row level security;
-- 不开任何策略：只能通过下面的函数读写

create or replace function public.ac_snapshot(p_label text, p_auto boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare sid bigint; n int;
begin
  insert into server_snapshots (label, auto) values (left(coalesce(p_label, ''), 40), p_auto) returning id into sid;
  insert into snapshot_saves (snapshot_id, player_id, data, last_tick, rank)
    select sid, s.player_id, s.data, s.last_tick,
      (select to_jsonb(r) - 'player_id' - 'updated_at' from ranks r where r.player_id = s.player_id)
    from saves s;
  get diagnostics n = row_count;
  update server_snapshots set players = n where id = sid;
  -- 只留最近几份
  delete from server_snapshots where auto and id not in (select id from server_snapshots where auto order by id desc limit greatest(public.ac_conf('snap_keep_auto', 3)::int, 1));
  delete from server_snapshots where not auto and id not in (select id from server_snapshots where not auto order by id desc limit 10);
  return sid;
end $$;
revoke execute on function public.ac_snapshot(text, boolean) from public, anon, authenticated;

-- 每天自动存一份：有人上传存档时顺便看一下（同一时刻只让一个人做）
create or replace function public.ac_auto_snapshot() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from server_snapshots where auto and created_at > now() - interval '24 hours') then return; end if;
  if not pg_try_advisory_xact_lock(424242) then return; end if;
  perform public.ac_snapshot('每日自动', true);
end $$;
revoke execute on function public.ac_auto_snapshot() from public, anon, authenticated;

-- 上传存档：先看回档版本，再做原来的检查
create or replace function public.ac_check_save_epoch() returns trigger
language plpgsql security definer set search_path = public as $$
declare ep int;
begin
  -- 回档函数自己写存档时不检查
  if current_setting('ac.bypass', true) = '1' then return new; end if;
  select save_epoch into ep from profiles where id = new.player_id;
  if coalesce((new.data ->> '_epoch')::int, 0) < coalesce(ep, 0) then
    raise exception 'ROLLBACK:%', ep;
  end if;
  perform public.ac_auto_snapshot();
  return new;
end $$;
drop trigger if exists ac_check_save_epoch on public.saves;
-- 触发器按名字顺序跑：ac_check_save 在前会先改 updated_at，回档检查要放最前面
drop trigger if exists aa_check_save_epoch on public.saves;
create trigger aa_check_save_epoch before insert or update on public.saves for each row execute function public.ac_check_save_epoch();

-- 管理员：快照列表
create or replace function public.gm_snapshots()
returns table (id bigint, label text, auto boolean, players int, created_at timestamptz, mb numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return query
    select s.id, s.label, s.auto, s.players, s.created_at,
      round(coalesce((select sum(pg_column_size(x.data)) from snapshot_saves x where x.snapshot_id = s.id), 0) / 1048576.0, 1)
    from server_snapshots s order by s.id desc;
end $$;
grant execute on function public.gm_snapshots() to authenticated;

create or replace function public.gm_snapshot_create(p_label text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return public.ac_snapshot(coalesce(nullif(trim(p_label), ''), '手动'), false);
end $$;
grant execute on function public.gm_snapshot_create(text) to authenticated;

create or replace function public.gm_snapshot_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  delete from server_snapshots where id = p_id;
end $$;
grant execute on function public.gm_snapshot_delete(bigint) to authenticated;

-- 回档：p_pid 为空 = 全服（先自动存一份回档前快照），否则只回这个数字 ID 的玩家。返回回档了几个人
create or replace function public.gm_rollback(p_snapshot bigint, p_pid bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; ep int; who uuid;
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  if not exists (select 1 from server_snapshots where id = p_snapshot) then raise exception '快照不存在'; end if;
  if p_pid is not null then
    select id into who from profiles where pid = p_pid;
    if who is null then raise exception '没有这个玩家'; end if;
    if not exists (select 1 from snapshot_saves where snapshot_id = p_snapshot and player_id = who) then raise exception '这个快照里没有这个玩家'; end if;
  else
    perform public.ac_snapshot('回档前', false);
  end if;
  perform set_config('ac.bypass', '1', true);
  for r in select * from snapshot_saves where snapshot_id = p_snapshot and (who is null or player_id = who) loop
    update profiles set save_epoch = save_epoch + 1 where id = r.player_id returning save_epoch into ep;
    insert into saves (player_id, data, last_tick, updated_at)
      values (r.player_id, r.data || jsonb_build_object('_epoch', ep, '_device', 'rollback'), r.last_tick, to_timestamp(r.last_tick / 1000.0))
      on conflict (player_id) do update set data = excluded.data, last_tick = excluded.last_tick, updated_at = excluded.updated_at;
    if r.rank is not null then
      insert into ranks (player_id, total, combat, skills, xp, updated_at)
        values (r.player_id, (r.rank ->> 'total')::int, (r.rank ->> 'combat')::int, coalesce(r.rank -> 'skills', '{}'), coalesce(r.rank -> 'xp', '{}'), now())
        on conflict (player_id) do update set total = excluded.total, combat = excluded.combat, skills = excluded.skills, xp = excluded.xp, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  perform set_config('ac.bypass', '', true);
  return n;
end $$;
grant execute on function public.gm_rollback(bigint, bigint) to authenticated;

-- ============ 管理员：真人玩家列表（11-01）============
-- 新注册的在前；带注册时间、最后在线、等级、公会、防作弊状态。p_who 按数字 ID 或名字筛
create or replace function public.gm_players(p_who text default null, p_limit int default 200)
returns table (id uuid, pid bigint, name text, created_at timestamptz, last_seen timestamptz, total int, combat int,
  guild_tag text, hidden boolean, banned boolean, flags bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return query
    select p.id, p.pid, p.name, p.created_at, p.last_seen, r.total, r.combat, g.tag, p.ac_hidden, p.banned,
      (select count(*) from cheat_flags f where f.player_id = p.id)
    from profiles p left join ranks r on r.player_id = p.id left join guilds g on g.id = p.guild_id
    where p_who is null or p_who = '' or p.pid::text = p_who or lower(p.name) like '%' || lower(p_who) || '%'
    order by p.created_at desc
    limit least(p_limit, 500);
end $$;
grant execute on function public.gm_players(text, int) to authenticated;

create or replace function public.gm_player_count() returns table (total bigint, today bigint, week bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gm() then raise exception '没有权限'; end if;
  return query select count(*), count(*) filter (where created_at > now() - interval '1 day'), count(*) filter (where created_at > now() - interval '7 days') from profiles;
end $$;
grant execute on function public.gm_player_count() to authenticated;

-- ============ 服务器结算（11-02） ============
-- 存档改由服务器算：游戏把玩家操作（指令）发给 Edge Function「game」，它按服务器时钟结算后用 service_role
-- 调 server_commit 写进存档和排行榜。玩家自己不能再写 saves / ranks（网页变速、改存档都没用了）。
-- 公会仓库、兑换、交易、建公会这些会动物品的，直接在数据库里改存档（save_take / save_give）。
alter table public.saves add column if not exists rev bigint not null default 0;

drop policy if exists "saves 只有自己" on public.saves;
drop policy if exists "saves 自己看" on public.saves;
create policy "saves 自己看" on public.saves for select using (auth.uid() = player_id);
drop policy if exists "ranks 自己写" on public.ranks;
revoke insert, update, delete on public.saves from anon, authenticated;
revoke insert, update, delete on public.ranks from anon, authenticated;

-- 存档内容变了就加版本号（服务器结算写入时自己带上新版本号；数据库里直接改的这里补上）
create or replace function public.saves_rev() returns trigger
language plpgsql as $$
begin
  if new.rev = old.rev and new.data is distinct from old.data then new.rev := old.rev + 1; end if;
  return new;
end $$;
drop trigger if exists a0_saves_rev on public.saves;
create trigger a0_saves_rev before update on public.saves for each row execute function public.saves_rev();

-- 服务器结算写入：版本号对得上才写（同时有别的写入就返回 -1，服务器重算一次），顺便标记已领的 GM 邮件、写排行榜
create or replace function public.server_commit(p_player uuid, p_rev bigint, p_data jsonb, p_tick bigint, p_mail uuid[], p_rank jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare n int; nr bigint;
begin
  if p_rev < 0 then
    insert into saves (player_id, data, last_tick, rev, updated_at) values (p_player, p_data, p_tick, 1, now())
      on conflict (player_id) do nothing;
    get diagnostics n = row_count;
    if n = 0 then return -1; end if;
    nr := 1;
  else
    update saves set data = p_data, last_tick = p_tick, rev = p_rev + 1, updated_at = now()
      where player_id = p_player and rev = p_rev;
    get diagnostics n = row_count;
    if n = 0 then return -1; end if;
    nr := p_rev + 1;
  end if;
  if coalesce(array_length(p_mail, 1), 0) > 0 then
    update gm_mail set claimed_at = now() where id = any(p_mail) and claimed_at is null;
    get diagnostics n = row_count;
    -- 别的请求已经领过了：整个撤回重来，免得发两次
    if n <> array_length(p_mail, 1) then raise exception 'MAIL_RACE'; end if;
  end if;
  insert into ranks (player_id, total, combat, skills, xp, updated_at)
    values (p_player, (p_rank ->> 'total')::int, (p_rank ->> 'combat')::int, p_rank -> 'skills', p_rank -> 'xp', now())
    on conflict (player_id) do update set total = excluded.total, combat = excluded.combat, skills = excluded.skills, xp = excluded.xp, updated_at = now();
  update profiles set last_seen = now() where id = p_player;
  return nr;
end $$;
revoke execute on function public.server_commit(uuid, bigint, jsonb, bigint, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.server_commit(uuid, bigint, jsonb, bigint, uuid[], jsonb) to service_role;

-- 从服务器存档里扣东西（先扣仓库，不够的扣背包），不够就报错
create or replace function public.save_take(p uuid, p_item text, p_qty bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb; bank bigint; bag bigint; a bigint;
begin
  if p_qty <= 0 then return; end if;
  select data into d from saves where player_id = p for update;
  if d is null then raise exception '找不到存档'; end if;
  bank := coalesce((d -> 'bank' ->> p_item)::bigint, 0);
  bag := case when p_item = 'coins' then 0 else coalesce((d -> 'bag' ->> p_item)::bigint, 0) end;
  if bank + bag < p_qty then raise exception '东西不够：%', p_item; end if;
  a := least(p_qty, bank);
  d := jsonb_set(d, '{bank}', case when bank - a > 0 then (d -> 'bank') || jsonb_build_object(p_item, bank - a) else (d -> 'bank') - p_item end);
  if p_qty > a then
    d := jsonb_set(d, '{bag}', case when bag - (p_qty - a) > 0 then (d -> 'bag') || jsonb_build_object(p_item, bag - (p_qty - a)) else (d -> 'bag') - p_item end);
  end if;
  perform set_config('ac.bypass', '1', true);
  update saves set data = d where player_id = p;
  perform set_config('ac.bypass', '0', true);
end $$;
revoke execute on function public.save_take(uuid, text, bigint) from public, anon, authenticated;

-- 往服务器存档的仓库里加东西
create or replace function public.save_give(p uuid, p_item text, p_qty bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if p_qty <= 0 then return; end if;
  select data into d from saves where player_id = p for update;
  if d is null then raise exception '找不到存档'; end if;
  d := jsonb_set(d, '{bank}', coalesce(d -> 'bank', '{}'::jsonb) || jsonb_build_object(p_item, coalesce((d -> 'bank' ->> p_item)::bigint, 0) + p_qty));
  if p_item <> 'coins' then d := jsonb_set(d, '{seen}', coalesce(d -> 'seen', '{}'::jsonb) || jsonb_build_object(p_item, 1)); end if;
  perform set_config('ac.bypass', '1', true);
  update saves set data = d where player_id = p;
  perform set_config('ac.bypass', '0', true);
end $$;
revoke execute on function public.save_give(uuid, text, bigint) from public, anon, authenticated;

-- 下面这些以前是「游戏本地先扣、服务器只记账」，现在在数据库里直接扣 / 加存档
create or replace function public.create_guild(p_name text, p_tag text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from guild_members where player_id = auth.uid()) then raise exception '已经在公会里了'; end if;
  perform save_take(auth.uid(), 'coins', 10000);
  insert into guilds (name, tag) values (p_name, p_tag) returning id into g;
  insert into guild_members (player_id, guild_id, role) values (auth.uid(), g, 'leader');
  update profiles set guild_id = g where id = auth.uid();
  return g;
end $$;

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
  perform save_take(auth.uid(), p_item, q);
  update profiles set g_exchanged = g_exchanged + n where id = auth.uid();
  perform guild_add_contrib(auth.uid(), n);
  perform guild_add_xp(m.guild_id, n);
  return q;
end $$;

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
  perform save_take(auth.uid(), t.target, add);
  update guild_tasks set have = have + add where id = p_task;
  perform guild_add_contrib(auth.uid(), add::bigint * t.per);
  perform guild_add_xp(g, add::bigint * t.per);
  if t.have + add >= t.need then
    perform guild_add_xp(g, t.reward);
    perform guild_event(g, 'task', '', t.target);
  end if;
  return add;
end $$;

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
  perform save_take(auth.uid(), p_item, p_qty);
  insert into guild_bank (guild_id, vault, item, qty, pos)
    values (g, p_vault, p_item, p_qty, (select coalesce(max(pos), 0) + 1 from guild_bank where guild_id = g and vault = p_vault))
    on conflict (guild_id, vault, item) do update set qty = guild_bank.qty + excluded.qty;
  select name into nm from profiles where id = auth.uid();
  insert into guild_bank_log (guild_id, vault, player_id, name, item, qty) values (g, p_vault, auth.uid(), coalesce(nm, ''), p_item, p_qty);
  delete from guild_bank_log where guild_id = g and at < now() - interval '30 days';
end $$;

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
  perform save_give(auth.uid(), p_item, n);
  select name into nm from profiles where id = auth.uid();
  insert into guild_bank_log (guild_id, vault, player_id, name, item, qty) values (m.guild_id, p_vault, auth.uid(), coalesce(nm, ''), p_item, -n);
  delete from guild_bank_log where guild_id = m.guild_id and at < now() - interval '30 days';
  return n;
end $$;

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
  perform save_give(auth.uid(), p_item, q);
  delete from guild_shop_buys where player_id = auth.uid() and day < today - 7;
  return q;
end $$;

create or replace function public.confirm_trade(p_trade uuid, p_ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare t trades; k text; v jsonb;
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
  if t.status = 'done' then
    -- 成交：在数据库里把双方的东西换过来（不够就报错，整笔撤回、交易保持未成交）。
    -- 放在改状态之后，交易检查触发器看到的还是换之前的存档
    for k, v in select * from jsonb_each(t.a_items) loop
      perform save_take(t.a, k, (v #>> '{}')::bigint);
      perform save_give(t.b, k, (v #>> '{}')::bigint);
    end loop;
    for k, v in select * from jsonb_each(t.b_items) loop
      perform save_take(t.b, k, (v #>> '{}')::bigint);
      perform save_give(t.a, k, (v #>> '{}')::bigint);
    end loop;
  end if;
  return t.status;
end $$;

-- ============ 资料表收紧（11-02）============
-- 建角色时只能填名字和外观（以前能自己填数字 ID、公会每日计数、隐藏标记）；
-- 别人只能看公开的几项（名字、数字 ID、外观、公会、上线时间），其余只有服务器函数能读
revoke insert, select on public.profiles from anon, authenticated;
grant insert (id, name, outfit) on public.profiles to authenticated;
grant select (id, pid, name, outfit, guild_id, last_seen, created_at) on public.profiles to anon, authenticated;
-- 已经被乱填过的改回正常值
update public.profiles set
  g_exchanged = greatest(g_exchanged, 0),
  g_took = greatest(g_took, 0),
  g_day = least(g_day, (now() at time zone 'utc')::date),
  g_checkin = least(g_checkin, (now() at time zone 'utc')::date)
where g_exchanged < 0 or g_took < 0 or g_day > (now() at time zone 'utc')::date or g_checkin > (now() at time zone 'utc')::date;

-- ============ 服务器结算记可疑操作（11-02）============
-- 结算程序（service_role）发现被拒的可疑操作时调用 ac_flag 记进 cheat_flags
grant execute on function public.ac_flag(uuid, text, boolean, jsonb) to service_role;
