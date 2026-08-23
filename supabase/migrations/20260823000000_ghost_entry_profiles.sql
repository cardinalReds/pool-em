-- Ghost entries get their own lightweight profile - a channel name/link and an avatar
-- (see components/GhostAccessManager.tsx for the existing can_manage_ghosts concept this
-- reuses). A ghost added to a matching public pool gets a separate mirror row
-- (source_ghost_entry_id - see lib/publicPoolSync.ts), so these fields live on the
-- original row only; mirrors read through to it rather than duplicating the data.
alter table public.ghost_entries add column if not exists channel_name text;
alter table public.ghost_entries add column if not exists channel_url text;
alter table public.ghost_entries add column if not exists avatar_url text;

-- Profile info needs to be readable from a mirror's pool context too (a public-pool
-- viewer looking at a mirrored ghost's profile needs to read the original row, which
-- lives in a different, private pool they aren't a member of) - channel name/link/avatar
-- is public-facing content by design, so open SELECT broadly rather than scoping it to
-- pool membership like the rest of ghost_entries' row data implicitly is elsewhere.
drop policy if exists "Anyone can view ghost entries" on public.ghost_entries;
create policy "Anyone can view ghost entries" on public.ghost_entries
  for select
  using (true);

-- Editing the profile fields uses the same admin-or-can_manage_ghosts authority as ghost
-- picks (20260821200000_ghost_entry_managers.sql) - scoped to whichever row is actually
-- being updated, which the client always resolves to the original (non-mirror) row first.
drop policy if exists "Admins and ghost managers can update ghost entries" on public.ghost_entries;
create policy "Admins and ghost managers can update ghost entries" on public.ghost_entries
  for update
  using (
    exists (select 1 from public.pools where pools.id = ghost_entries.pool_id and pools.admin_id = auth.uid())
    or exists (
      select 1 from public.pool_members
      where pool_members.pool_id = ghost_entries.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
  )
  with check (
    exists (select 1 from public.pools where pools.id = ghost_entries.pool_id and pools.admin_id = auth.uid())
    or exists (
      select 1 from public.pool_members
      where pool_members.pool_id = ghost_entries.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
  );
