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

-- The live "Authenticated users can read ghost entries" policy (qual: auth.uid() is not
-- null) let ANY signed-in user read every pool's ghost entries -- it was never this
-- permissive in this file, so it must have been swapped in directly against the database
-- at some point. Replacing it with a properly pool-scoped policy, using the same
-- recursion-safe is_pool_member() helper defined in the pool_members block above.
drop policy if exists "Authenticated users can read ghost entries" on public.ghost_entries;
create policy "Pool members can view ghost entries" on public.ghost_entries for select
  using (public.is_pool_member(ghost_entries.pool_id, auth.uid()));

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

-- Single-use invite links for buy-in pools. allow_member_invites previously only hid a
-- UI button for non-admins — the underlying pools.invite_code was still one static,
-- unlimited-use code anyone with it could join through repeatedly. For pools with money
-- on the line, the admin needs individual links they generate one at a time, each usable
-- by exactly one person, so they always know who's actually in the pool.
create table if not exists public.pool_invites (
  id uuid default gen_random_uuid() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  token text not null unique,
  created_by uuid references auth.users(id) not null,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table public.pool_invites enable row level security;
create policy "Anyone can look up an invite token" on public.pool_invites for select using (true);
create policy "Pool admins can create invite tokens" on public.pool_invites for insert
  with check (
    exists (
      select 1 from public.pools
      where pools.id = pool_invites.pool_id
      and pools.admin_id = auth.uid()
    )
  );
-- Anyone authenticated can claim an unclaimed token (this is how joining works) — the
-- `using (used_by is null)` clause is what actually enforces single-use: once a row has
-- used_by set, RLS hides it from matching a further update, so a second claim attempt
-- affects 0 rows instead of overwriting the first person's claim.
--
-- The `with check` is required, not optional: without it, Postgres reuses the `using`
-- clause as the check too, and since the update SETS used_by to a non-null value, the
-- written row would fail its own "still null" check and get silently rejected (0 rows
-- affected) — indistinguishable from someone else having claimed it first.
create policy "Authenticated users can claim an unused invite token" on public.pool_invites for update
  using (used_by is null)
  with check (used_by = auth.uid());
grant select on public.pool_invites to anon;
grant select, insert, update on public.pool_invites to authenticated;

-- Force off allow_member_invites for any pool that already has a buy-in configured —
-- once money's on the line, only the admin should control who gets in.
update public.pools set allow_member_invites = false
  where allow_member_invites = true and (coalesce(buy_in_amount, 0) > 0 or coalesce(weekly_buy_in, 0) > 0);

-- NFL 2026/27 season. Reuses the fixtures table as-is — no new columns needed:
-- ht_home_score/ht_away_score already exist for halftime scores (derived from the API's
-- quarter_1+quarter_2), and line_total_goals/line_asian_handicap_home already exist for
-- the total-points and spread lines. Scoped to Regular Season only for now — postseason
-- is single-elimination (different shape, like the World Cup bracket) and not built yet.
insert into public.tournaments (id, name, sport, season, status, api_league_id, end_date)
values ('nfl_2026', 'NFL 2026/27', 'nfl', 2026, 'active', 1, '2027-02-14T00:00:00Z')
on conflict (id) do nothing;

-- 1st-half spread/total lines are distinct from the full-game ones already on this
-- table (line_asian_handicap_home/away, line_total_goals) — needed for nfl_ht_spread
-- and nfl_ht_total_points_ou. Generic enough that soccer's 1st-half markets could use
-- them too later, though nothing does yet.
alter table public.fixtures add column if not exists line_ht_asian_handicap_home numeric;
alter table public.fixtures add column if not exists line_ht_asian_handicap_away numeric;
alter table public.fixtures add column if not exists line_ht_total_points numeric;

-- No exact-score category — unlike soccer's 0-5-ish scorelines, NFL final scores are
-- high-variance (24-17, 31-28, ...), making an exact-score guess close to unhittable.
insert into public.ruleset_categories (id, sport, name, description, default_points, prediction_type, requires_line, input_type, sort_order) values
('nfl_result', 'nfl', 'Game Winner', 'Pick who wins the game, or a tie.', 1, 'per_game', false, 'wld', 10),
('nfl_spread', 'nfl', 'Against the Spread', 'Pick who covers the point spread.', 2, 'per_game', true, 'wld', 20),
('nfl_total_points_ou', 'nfl', 'Total Points Over/Under', 'Will the combined score go over or under the line?', 2, 'per_game', true, 'ou', 30),
('nfl_ht_result', 'nfl', 'Halftime Leader', 'Pick who''s ahead at halftime, or tied.', 2, 'per_game', false, 'wld', 50),
('nfl_ht_spread', 'nfl', 'Halftime Spread', 'Pick who covers the spread at halftime.', 2, 'per_game', true, 'wld', 60),
('nfl_ht_total_points_ou', 'nfl', 'Halftime Total Points Over/Under', 'Will the combined halftime score go over or under the line?', 2, 'per_game', true, 'ou', 70)
on conflict (id) do nothing;

-- MMA has no season — each tournament row is one card, so "is this sport active right
-- now" can't be answered the way PL/NFL/F1 answer it (season started or not). end_date
-- already means "when does this stop being poolable" (day-after-card, since cards often
-- run past midnight UTC) and isn't a good display date. event_date is the actual
-- human-facing card date, used to find and label the next upcoming card on the homepage.
alter table public.tournaments add column if not exists event_date timestamptz;

insert into public.tournaments (id, name, sport, season, status, end_date, event_date)
values ('ufc_330', 'UFC 330', 'mma', 2026, 'active', '2026-08-17T00:00:00Z', '2026-08-15T00:00:00Z')
on conflict (id) do nothing;

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

-- A plain self-referencing EXISTS subquery here (checking pool_members from within
-- pool_members' own policy) is prone to "infinite recursion detected in policy" once any
-- OTHER table's policy also references pool_members (e.g. pool_invitations) -- evaluating
-- that other table's RLS re-triggers pool_members' RLS, which re-triggers the other
-- table's RLS, etc. Route the membership check through a security-definer function
-- instead, so it bypasses RLS on its own internal query and can't feed back into a cycle.
create or replace function public.is_pool_member(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id
    and user_id = p_user_id
  );
$$;

grant execute on function public.is_pool_member(uuid, uuid) to authenticated;

create policy "Members can view pool members" on public.pool_members for select
  using (public.is_pool_member(pool_members.pool_id, auth.uid()));
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

-- PL "best 5 games" matchweek selection. pl_game_mode already existed on pools but was
-- never read anywhere — this is what actually implements it.

-- pl_teams was previously just a name/logo directory (no standings). Adding real table
-- position here — needed as a tiebreaker signal for game selection, and useful for a
-- standings UI later regardless.
alter table public.pl_teams add column if not exists position int;
alter table public.pl_teams add column if not exists points int;
alter table public.pl_teams add column if not exists played int;
alter table public.pl_teams add column if not exists won int;
alter table public.pl_teams add column if not exists drawn int;
alter table public.pl_teams add column if not exists lost int;
alter table public.pl_teams add column if not exists goals_for int;
alter table public.pl_teams add column if not exists goals_against int;
alter table public.pl_teams add column if not exists goal_difference int;

-- Gates whether the admin override control shows at all for a best5 pool — off by
-- default, matching "predictions lock to the admin's judgment" being an opt-in, not
-- the default trust model.
alter table public.pools add column if not exists pl_best5_admin_override boolean not null default false;

-- One row per selected fixture per pool per matchweek. Stored per-pool (not shared across
-- pools even though the auto-selection algorithm is pool-agnostic) so an admin override in
-- one pool never affects another, and so a pool's selection stays stable once computed —
-- it must never silently change under members who've already predicted on it.
create table if not exists public.pool_matchweek_selections (
  id uuid default gen_random_uuid() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  round text not null,
  fixture_id bigint not null,
  source text not null default 'auto' check (source in ('auto', 'admin')),
  created_at timestamptz default now(),
  unique(pool_id, round, fixture_id)
);

alter table public.pool_matchweek_selections enable row level security;
create policy "Pool members can view matchweek selections" on public.pool_matchweek_selections for select
  using (
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = pool_matchweek_selections.pool_id
      and pool_members.user_id = auth.uid()
    )
  );
-- Only the admin can write from the browser (the override swap). The initial 'auto'
-- population is done by /api/pl/best5-select using the service-role key, which bypasses
-- RLS entirely — same pattern as every cron route in this file.
create policy "Pool admins can insert matchweek selections" on public.pool_matchweek_selections for insert
  with check (
    exists (
      select 1 from public.pools
      where pools.id = pool_matchweek_selections.pool_id
      and pools.admin_id = auth.uid()
    )
  );
create policy "Pool admins can delete matchweek selections" on public.pool_matchweek_selections for delete
  using (
    exists (
      select 1 from public.pools
      where pools.id = pool_matchweek_selections.pool_id
      and pools.admin_id = auth.uid()
    )
  );
grant select, insert, delete on public.pool_matchweek_selections to authenticated;

-- ============================================
-- Contact book invites: invite existing-account contacts into a pool,
-- track every inviter, require explicit accept/decline.
-- ============================================

create table if not exists public.pool_invitations (
  id uuid default gen_random_uuid() primary key,
  pool_id uuid references public.pools(id) on delete cascade not null,
  invited_user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique(pool_id, invited_user_id)
);

-- pool_id is denormalized here (in addition to invitation_id) so this table fits the
-- app's existing pool-deletion convention (POOL_CHILD_TABLES in app/pool/[id]/page.tsx),
-- which deletes every child table with a flat `.eq('pool_id', poolId)` -- no joins.
create table if not exists public.pool_invitation_inviters (
  id uuid default gen_random_uuid() primary key,
  invitation_id uuid references public.pool_invitations(id) on delete cascade not null,
  pool_id uuid references public.pools(id) on delete cascade not null,
  inviter_user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(invitation_id, inviter_user_id)
);

alter table public.pool_invitations enable row level security;

create policy "Pool members can view pool invitations" on public.pool_invitations for select
  using (
    exists (select 1 from public.pools where pools.id = pool_invitations.pool_id and pools.admin_id = auth.uid())
    or public.is_pool_member(pool_invitations.pool_id, auth.uid())
  );

create policy "Invitee can view their own invitation" on public.pool_invitations for select
  using (invited_user_id = auth.uid());

create policy "Eligible members can create invitations" on public.pool_invitations for insert
  with check (
    invited_user_id <> auth.uid()
    and exists (
      select 1 from public.pools
      where pools.id = pool_invitations.pool_id
      and (
        pools.admin_id = auth.uid()
        or (
          pools.allow_member_invites = true
          and public.is_pool_member(pools.id, auth.uid())
        )
      )
    )
  );

create policy "Invitee can respond to their own invitation" on public.pool_invitations for update
  using (invited_user_id = auth.uid() and status = 'pending')
  with check (invited_user_id = auth.uid() and status in ('accepted', 'declined'));

create policy "Pool admins can delete invitations" on public.pool_invitations for delete
  using (exists (select 1 from public.pools where pools.id = pool_invitations.pool_id and pools.admin_id = auth.uid()));

grant select, insert, update, delete on public.pool_invitations to authenticated;

alter table public.pool_invitation_inviters enable row level security;

create policy "Pool members can view invitation inviters" on public.pool_invitation_inviters for select
  using (
    exists (select 1 from public.pools where pools.id = pool_invitation_inviters.pool_id and pools.admin_id = auth.uid())
    or public.is_pool_member(pool_invitation_inviters.pool_id, auth.uid())
    or exists (select 1 from public.pool_invitations pi where pi.id = pool_invitation_inviters.invitation_id and pi.invited_user_id = auth.uid())
  );

create policy "Eligible members can add themselves as an inviter" on public.pool_invitation_inviters for insert
  with check (
    inviter_user_id = auth.uid()
    and exists (
      select 1 from public.pool_invitations pi
      join public.pools p on p.id = pi.pool_id
      where pi.id = pool_invitation_inviters.invitation_id
      and pi.status = 'pending'
      and (
        p.admin_id = auth.uid()
        or (p.allow_member_invites = true and public.is_pool_member(p.id, auth.uid()))
      )
    )
  );

create policy "Pool admins can delete invitation inviters" on public.pool_invitation_inviters for delete
  using (exists (select 1 from public.pools where pools.id = pool_invitation_inviters.pool_id and pools.admin_id = auth.uid()));

grant select, insert, delete on public.pool_invitation_inviters to authenticated;

-- Lets an invitee preview a pool's member list BEFORE accepting (for "mutual contacts
-- already in this pool"), scoped tightly to only a pool they have a pending invitation
-- for. Additive alongside the existing members-only select policy -- doesn't replace it.
--
-- This check has to go through a security-definer function rather than a plain EXISTS
-- subquery: pool_invitations' own select policy checks pool_members, so a plain subquery
-- here would make the two tables' RLS policies check each other in a cycle (Postgres
-- errors with "infinite recursion detected in policy", 42P17). A security-definer
-- function runs with the privileges of its owner, which bypasses RLS on the table it
-- queries (same as the existing handle_new_user trigger function above), breaking the
-- cycle at this one point.
create or replace function public.has_pending_pool_invitation(p_pool_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pool_invitations
    where pool_id = p_pool_id
    and invited_user_id = p_user_id
    and status = 'pending'
  );
$$;

grant execute on function public.has_pending_pool_invitation(uuid, uuid) to authenticated;

create policy "Invited users can preview pool members before accepting" on public.pool_members for select
  using (public.has_pending_pool_invitation(pool_members.pool_id, auth.uid()));

-- No pool_rules/ruleset_categories policy needed -- confirmed live via anon key that both
-- are already world-readable (same pattern as `pools`).

-- ============================================
-- Account settings: email notification preferences, and a pool_members
-- self-update policy so a display-name change can propagate to existing pools.
-- ============================================

-- Two independent opt-in/opt-out toggles, separate from the existing per-fixture
-- `reminders` table (those are set up explicitly per pool; these are account-wide).
-- Both default true so existing rows, and any signup path that doesn't pass a value,
-- stay opted in.
alter table public.profiles add column if not exists notify_pool_invites boolean not null default true;
alter table public.profiles add column if not exists notify_new_competitions boolean not null default true;

-- Signup already threads display_name through raw_user_meta_data into this trigger;
-- extend it to also read the two new preference checkboxes (see app/auth/signup/page.tsx).
-- The trigger itself (on_auth_user_created) is unchanged -- CREATE OR REPLACE on the
-- function body is enough to pick this up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, notify_pool_invites, notify_new_competitions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'notify_pool_invites')::boolean, true),
    coalesce((new.raw_user_meta_data->>'notify_new_competitions')::boolean, true)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Display names live in three places (auth user_metadata, profiles.display_name,
-- pool_members.display_name -- the one actually rendered in pool UIs). A settings-page
-- rename should update all three. profiles already allows self-update; pool_members
-- doesn't (its only UPDATE policy is admin-only). This adds a second, narrower
-- self-service policy alongside it -- permissive policies OR together, so this only adds
-- an allowed case, it doesn't loosen the admin one.
create policy "Users can update their own pool_members row" on public.pool_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Idempotency marker for the daily "new competition live" notify cron.
alter table public.tournaments add column if not exists notified_at timestamptz;
