-- Supabase's security advisor flagged "Policy Exists RLS Disabled" on several tables:
-- policies were defined (correctly matching how the app actually uses each table) but
-- RLS itself was never turned on, so the policies were inert and the tables were fully
-- open under default anon/authenticated grants. Most notably: pools.bank_account_number
-- and pools.bank_sort_code were readable by anyone via the public anon key, and
-- pool_rules could be updated by anyone who guessed a rule id (the app's own update
-- call has no ownership check beyond RLS). Verified every affected table's real usage
-- in the codebase before enabling, so this activates the already-intended access model
-- rather than changing behavior.

alter table public.pools enable row level security;
alter table public.pool_rules enable row level security;
alter table public.fixtures enable row level security;

-- No existing policies and no client-side usage anywhere (only ever read/written by
-- /api/score/route.ts via the service role key, which bypasses RLS regardless) — safe
-- to lock out anon/authenticated entirely.
alter table public.players enable row level security;

-- pool_changes had zero policies AND real client-side usage (the pool edit page reads
-- and inserts, the delete-pool flow deletes) — needs policies added, not just RLS
-- flipped on, or those flows break.
alter table public.pool_changes enable row level security;

create policy "Members can view pool changes" on public.pool_changes
  for select using (
    exists (select 1 from pool_members where pool_members.pool_id = pool_changes.pool_id and pool_members.user_id = auth.uid())
  );

create policy "Admins can log pool changes" on public.pool_changes
  for insert with check (
    exists (select 1 from pools where pools.id = pool_changes.pool_id and pools.admin_id = auth.uid())
  );

create policy "Admins can delete pool changes" on public.pool_changes
  for delete using (
    exists (select 1 from pools where pools.id = pool_changes.pool_id and pools.admin_id = auth.uid())
  );
