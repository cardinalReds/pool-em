-- LIVE BUG, found while verifying the public-pool auto-sync feature: pool_rules'
-- only SELECT policy is member-scoped ("Members can view pool rules"), so the sync
-- logic (which has to read a *public* pool's category set to decide whether it's a
-- match, necessarily before the joining user is a member of it) silently saw an empty
-- ruleset and never matched anything. supabase-schema.sql's own comment claims
-- pool_rules is "world-readable, same pattern as pools" -- that's stale; the live
-- policy is member-only. Rather than reopen it globally, add the same narrow carve-out
-- pool_members already has for public pools ("Anyone can view members of public
-- pools") -- pool_rules for a public pool becomes readable by anyone, private pools'
-- rules stay exactly as member-scoped as before.
create policy "Anyone can view rules of public pools" on public.pool_rules
  for select using (
    exists (select 1 from public.pools where pools.id = pool_rules.pool_id and pools.is_public = true)
  );
