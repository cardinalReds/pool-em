-- Lets a pool admin delegate ghost-entry pick management to a trusted pool member,
-- instead of only the admin being able to enter picks on a ghost's behalf.
alter table public.pool_members add column if not exists can_manage_ghosts boolean not null default false;

-- pool_members already has a blanket "Users can update their own pool_members row" policy
-- (auth.uid() = user_id, no column restriction), which would otherwise let any member
-- self-grant can_manage_ghosts via a direct client update. RLS is row-level, not
-- column-level, so close that off with a trigger instead: any change to this specific
-- column must be made by the pool's admin, regardless of which UPDATE policy let the
-- statement through.
create or replace function public.guard_can_manage_ghosts()
returns trigger as $$
begin
  if new.can_manage_ghosts is distinct from old.can_manage_ghosts then
    if not exists (
      select 1 from public.pools
      where pools.id = new.pool_id
      and pools.admin_id = auth.uid()
    ) then
      raise exception 'Only the pool admin can change can_manage_ghosts';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists guard_can_manage_ghosts_trigger on public.pool_members;
create trigger guard_can_manage_ghosts_trigger
  before update on public.pool_members
  for each row execute function public.guard_can_manage_ghosts();

-- Extends predictions_v2 ghost-picks access (see 20260806020000_ghost_predictions_admin_policy.sql,
-- which covers the pool admin) to members explicitly granted can_manage_ghosts. Purely
-- additive — permissive policies OR together, so this only widens who can write a ghost's
-- predictions_v2 rows, it doesn't touch real users' own-prediction permissions or the
-- existing admin policy.
create policy "Ghost managers can manage ghost predictions in their pools" on public.predictions_v2
  for all
  using (
    exists (
      select 1 from public.ghost_entries
      join public.pool_members on pool_members.pool_id = ghost_entries.pool_id
      where ghost_entries.id = predictions_v2.user_id
      and ghost_entries.pool_id = predictions_v2.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
  )
  with check (
    exists (
      select 1 from public.ghost_entries
      join public.pool_members on pool_members.pool_id = ghost_entries.pool_id
      where ghost_entries.id = predictions_v2.user_id
      and ghost_entries.pool_id = predictions_v2.pool_id
      and pool_members.user_id = auth.uid()
      and pool_members.can_manage_ghosts = true
    )
  );
