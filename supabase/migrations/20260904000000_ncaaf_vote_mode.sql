-- "Democratize" NCAAF game mode (pool.cfb_game_mode = 'vote'): each pool member votes for
-- up to 10 games they want to predict that week, instead of an algorithm or the admin
-- picking. Votes close 5 days before the matchweek's earliest kickoff; the final selection
-- tallies vote counts (ties broken by AP ranking, remaining slots padded via the same
-- ranked-priority algorithm as best10 mode if turnout is low) and is written into
-- pool_matchweek_selections with source='vote' — same table best10/admin-override already use.

create table if not exists public.pool_game_votes (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  round text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id bigint not null,
  created_at timestamptz not null default now(),
  unique (pool_id, round, user_id, fixture_id)
);

alter table public.pool_game_votes enable row level security;

-- Members manage their own votes only — a vote is toggled by deleting and re-inserting,
-- same pattern as most pick UIs in this app.
create policy "members manage own votes" on public.pool_game_votes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Any pool member (including the admin) can see aggregate vote activity, not just their own.
create policy "pool members can read votes" on public.pool_game_votes for select
  using (
    exists (
      select 1 from public.pool_members
      where pool_members.pool_id = pool_game_votes.pool_id
      and pool_members.user_id = auth.uid()
    )
  );

grant select, insert, delete on public.pool_game_votes to authenticated;

alter table public.pool_matchweek_selections drop constraint if exists pool_matchweek_selections_source_check;
alter table public.pool_matchweek_selections add constraint pool_matchweek_selections_source_check
  check (source in ('auto', 'admin', 'vote'));
