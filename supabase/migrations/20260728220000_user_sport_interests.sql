-- Track which sports a user is interested in, so invites can flag mismatches
-- (e.g. don't invite someone with no MMA interest to a UFC pool).
--
-- Presence of a row = interested. No row = unknown/not interested.
-- source='derived' rows are auto-added when a user joins a pool of that sport;
-- source='manual' rows come from explicit edits in settings. Removing a row
-- (of either source) is how a user opts out — the derive trigger uses
-- ON CONFLICT DO NOTHING so it never re-adds over an explicit removal, but a
-- fresh pool join after removal is treated as a renewed positive signal.

create table if not exists public.user_sport_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sport text not null,
  source text not null default 'derived' check (source in ('derived', 'manual')),
  created_at timestamptz not null default now(),
  primary key (user_id, sport)
);

alter table public.user_sport_interests enable row level security;

drop policy if exists "Sport interests are viewable by everyone" on public.user_sport_interests;
create policy "Sport interests are viewable by everyone" on public.user_sport_interests
  for select using (true);

drop policy if exists "Users can add their own sport interests" on public.user_sport_interests;
create policy "Users can add their own sport interests" on public.user_sport_interests
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own sport interests" on public.user_sport_interests;
create policy "Users can remove their own sport interests" on public.user_sport_interests
  for delete using (auth.uid() = user_id);

-- Auto-derive interest whenever someone joins a pool
create or replace function public.derive_sport_interest_on_pool_join()
returns trigger as $$
begin
  insert into public.user_sport_interests (user_id, sport, source)
  select new.user_id, p.sport, 'derived'
  from public.pools p
  where p.id = new.pool_id
  on conflict (user_id, sport) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_pool_member_added_derive_interest on public.pool_members;
create trigger on_pool_member_added_derive_interest
  after insert on public.pool_members
  for each row execute procedure public.derive_sport_interest_on_pool_join();

-- One-time backfill from existing pool memberships
insert into public.user_sport_interests (user_id, sport, source)
select distinct pm.user_id, p.sport, 'derived'
from public.pool_members pm
join public.pools p on p.id = pm.pool_id
on conflict (user_id, sport) do nothing;
