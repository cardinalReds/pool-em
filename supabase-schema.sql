-- ============================================
-- Pool'em Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Profiles (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Users can view all profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Pools
create table if not exists public.pools (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sport text not null default 'world_cup',
  package_id text not null,
  tournament_scope text not null default 'full',
  deadline_type text not null default 'before_each_game',
  invite_code text not null unique,
  admin_id uuid references auth.users(id) on delete cascade not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Bank transfer payment details (UK only)
alter table public.pools add column if not exists bank_sort_code text;
alter table public.pools add column if not exists bank_account_number text;

-- If true, any member can share the invite link/section, not just the admin
alter table public.pools add column if not exists allow_member_invites boolean not null default false;

-- How each week's weekly-pot winnings are split (mirrors payout_structure for season pot)
alter table public.pools add column if not exists weekly_payout_structure text;

-- Ghost entries need their own paid flag — they don't have a pool_members row to store it on
alter table public.ghost_entries add column if not exists is_paid boolean not null default false;

-- ghost_entries had select/insert/delete policies for the pool admin but no UPDATE policy,
-- so admin writes to is_paid (or anything else) silently matched 0 rows and no-op'd —
-- PostgREST still returns 204 success even when RLS hides every row from the UPDATE.
create policy "Admins can update ghost entries in their pools" on public.ghost_entries for update
  using (
    exists (
      select 1 from public.pools
      where pools.id = ghost_entries.pool_id
      and pools.admin_id = auth.uid()
    )
  );

-- Optional admin fee, taken as a percentage of both the season pot and weekly pot totals.
-- Null/0 means no fee. One rate applies to both pots (kept simple — no separate rate per pot).
alter table public.pools add column if not exists admin_fee_percent numeric;

-- weekly_payouts already existed (id, pool_id, matchday, winner_user_id, amount, paid_out,
-- notified, created_at) but only ever supported a single winner per matchday. Payout
-- structures like "top 2 split" or "top 3 equal" need one row per paid position.
-- Named payout_rank, not rank — "rank" collides with Postgres's built-in rank() window
-- function and breaks PostgREST's query parser ("WITHIN GROUP is required for
-- ordered-set aggregate rank") when it appears bare in a select=... list.
alter table public.weekly_payouts add column if not exists payout_rank int not null default 1;

-- The pre-existing unique constraint was (pool_id, matchday) alone — fine for a single
-- winner, but blocks inserting more than one row per matchday for split payouts (top 2,
-- top 3, etc). Widen it to (pool_id, matchday, payout_rank).
alter table public.weekly_payouts drop constraint if exists weekly_payouts_pool_id_matchday_key;
alter table public.weekly_payouts add constraint weekly_payouts_pool_id_matchday_rank_key unique (pool_id, matchday, payout_rank);

alter table public.weekly_payouts enable row level security;
create policy "Pool members can view weekly payouts" on public.weekly_payouts for select
  using (
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = weekly_payouts.pool_id
      and pool_members.user_id = auth.uid()
    )
  );
-- Only the admin can write payout results — matches the trust model already used for
-- marking members paid and recording weekly-pot credit payments.
create policy "Pool admins can insert weekly payouts" on public.weekly_payouts for insert
  with check (
    exists (
      select 1 from public.pools
      where pools.id = weekly_payouts.pool_id
      and pools.admin_id = auth.uid()
    )
  );
create policy "Pool admins can update weekly payouts" on public.weekly_payouts for update
  using (
    exists (
      select 1 from public.pools
      where pools.id = weekly_payouts.pool_id
      and pools.admin_id = auth.uid()
    )
  );
grant select, insert, update on public.weekly_payouts to authenticated;

alter table public.pools enable row level security;
create policy "Members can view their pools" on public.pools for select
  using (
    auth.uid() = admin_id or
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = pools.id
      and pool_members.user_id = auth.uid()
    )
  );
create policy "Anyone can view pool by invite code" on public.pools for select
  using (true);
create policy "Authenticated users can create pools" on public.pools for insert
  with check (auth.uid() = admin_id);
create policy "Admins can update their pools" on public.pools for update
  using (auth.uid() = admin_id);

-- Pool members
create table if not exists public.pool_members (
  id uuid default gen_random_uuid() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text not null,
  joined_at timestamptz default now(),
  unique(pool_id, user_id)
);

alter table public.pool_members enable row level security;
create policy "Members can view pool members" on public.pool_members for select
  using (
    exists (
      select 1 from public.pool_members pm
      where pm.pool_id = pool_members.pool_id
      and pm.user_id = auth.uid()
    )
  );
create policy "Users can join pools" on public.pool_members for insert
  with check (auth.uid() = user_id);

-- Predictions
create table if not exists public.predictions (
  id uuid default gen_random_uuid() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  fixture_id bigint not null,
  predicted_result text check (predicted_result in ('home', 'away', 'draw')),
  predicted_home_score int,
  predicted_away_score int,
  predicted_first_scorer_name text,
  points_earned int,
  submitted_at timestamptz default now(),
  unique(pool_id, user_id, fixture_id)
);

alter table public.predictions enable row level security;
create policy "Users can view all predictions in their pools" on public.predictions for select
  using (
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = predictions.pool_id
      and pool_members.user_id = auth.uid()
    )
  );
create policy "Users can insert own predictions" on public.predictions for insert
  with check (auth.uid() = user_id);
create policy "Users can update own predictions" on public.predictions for update
  using (auth.uid() = user_id);
