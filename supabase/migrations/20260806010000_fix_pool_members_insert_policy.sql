-- LIVE BUG: verified against the live database (two throwaway auth accounts, plain
-- REST inserts under their own session, no service role) that self-inserting into
-- pool_members — auth.uid() = user_id, the textbook case — fails with 42501 "new row
-- violates row-level security policy for table pool_members". This is the exact insert
-- both /app/pool/create/page.tsx's "add admin as member" step (the final step of
-- creating any pool) and /app/pool/[id]/page.tsx's admin-membership self-heal path
-- perform, so as of this migration EVERY new pool creation and EVERY pool join fails.
--
-- supabase-schema.sql documents the intended policy as a plain
-- `with check (auth.uid() = user_id)`, which should pass this case — so the live policy
-- has drifted from the tracked file (same class of drift already seen on ghost_entries'
-- read policy and the messages/round_facts/bracket_scoring_rules tables before this).
-- Re-asserting it here regardless of whatever the live version currently says.
drop policy if exists "Users can join pools" on public.pool_members;
create policy "Users can join pools" on public.pool_members for insert
  with check (auth.uid() = user_id);
