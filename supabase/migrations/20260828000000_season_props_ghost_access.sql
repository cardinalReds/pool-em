-- Lets a pool admin or a member granted can_manage_ghosts enter season-long
-- predictions (season_props) on behalf of a ghost entry, same authority already
-- granted for predictions_v2 in 20260821200000_ghost_entry_managers.sql. Without this,
-- SeasonPropsTicket's insert/update always fails RLS for a ghost's user_id (auth.uid()
-- never equals a ghost's id), which is why it silently fell back to always
-- reading/writing the real logged-in user's own row regardless of which ghost was
-- selected elsewhere on the page.
drop policy if exists "Ghost managers can manage ghost season props" on public.season_props;
create policy "Ghost managers can manage ghost season props" on public.season_props
  for all
  using (
    exists (
      select 1 from public.ghost_entries
      join public.pool_members on pool_members.pool_id = ghost_entries.pool_id
      where ghost_entries.id = season_props.user_id
      and ghost_entries.pool_id = season_props.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
    or exists (
      select 1 from public.pools
      where pools.id = season_props.pool_id
      and pools.admin_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ghost_entries
      join public.pool_members on pool_members.pool_id = ghost_entries.pool_id
      where ghost_entries.id = season_props.user_id
      and ghost_entries.pool_id = season_props.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
    or exists (
      select 1 from public.pools
      where pools.id = season_props.pool_id
      and pools.admin_id = auth.uid()
    )
  );
