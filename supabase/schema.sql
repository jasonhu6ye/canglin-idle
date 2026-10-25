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

-- ========== 聊天 ==========
create table if not exists public.chat (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('world', 'guild')),
  guild_id uuid references public.guilds(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  text text not null check (char_length(text) between 1 and 200),
  at timestamptz not null default now()
);
create index if not exists chat_at on public.chat (at desc);
alter table public.chat enable row level security;
drop policy if exists "chat 世界和本会可看" on public.chat;
create policy "chat 世界和本会可看" on public.chat for select using (
  channel = 'world' or guild_id = (select guild_id from public.profiles where id = auth.uid()));
drop policy if exists "chat 自己发" on public.chat;
create policy "chat 自己发" on public.chat for insert with check (
  auth.uid() = player_id
  and name = (select name from public.profiles where id = auth.uid())
  and (channel = 'world' and guild_id is null
    or channel = 'guild' and guild_id = (select guild_id from public.profiles where id = auth.uid())));

-- 新聊天实时推送
do $$ begin
  alter publication supabase_realtime add table public.chat;
exception when duplicate_object then null; end $$;
