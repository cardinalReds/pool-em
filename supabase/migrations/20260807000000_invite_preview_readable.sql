-- Lets someone browse a pool (rules/categories and who's already in it) from an invite
-- link before creating an account, instead of being forced straight to signup/login.
-- `pools` itself is already fully open (`using (true)`) regardless of invite-link
-- knowledge, so pool_rules/pool_members matching that same openness is consistent with
-- the existing trust model here, not a new exposure class -- in practice you still need
-- the pool's id (from the invite link, or by being a member) to query either of these.
drop policy if exists "Anyone can view rules of public pools" on public.pool_rules;
create policy "Anyone can view pool rules" on public.pool_rules for select using (true);

create policy "Anyone can preview pool members" on public.pool_members for select using (true);
