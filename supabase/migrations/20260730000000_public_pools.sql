-- Public pools: discoverable and self-joinable without an invite link.
-- pools SELECT is already unrestricted (existing "Anyone can view pool by invite code"
-- policy has qual=true), so no policy change needed there for browsing — this just adds
-- the column browse/create/edit filter and display on.
alter table public.pools add column if not exists is_public boolean not null default false;

create index if not exists idx_pools_is_public on public.pools (is_public) where is_public = true;

-- pool_members SELECT is normally scoped to existing members (is_pool_member()) or
-- invitees previewing before accepting — neither covers someone browsing a public pool
-- who isn't a member yet. Let anyone see the member list (display_name only matters here)
-- of a pool that's explicitly public; this is no more exposure than the pool itself
-- already being publicly listed.
drop policy if exists "Anyone can view members of public pools" on public.pool_members;
create policy "Anyone can view members of public pools" on public.pool_members
  for select using (
    exists (select 1 from public.pools where pools.id = pool_members.pool_id and pools.is_public = true)
  );
