-- LIVE BUG, confirmed end-to-end with a disposable test account: predictions_v2's only
-- write policy is "Users can manage own predictions" FOR ALL USING (auth.uid() = user_id)
-- with no separate WITH CHECK, so Postgres reuses the USING clause as the check — which
-- blocks the admin ghost-picks flow in FixturesList.tsx (addGhostEntry/switchEntry/
-- saveFixture), since those write rows with user_id set to a ghost_entries.id, not the
-- admin's own auth.uid(). saveFixture()'s upsert doesn't check the error it gets back,
-- so the UI has been showing "saved" while every ghost pick silently failed to persist.
--
-- Purely additive: doesn't touch real users' own-prediction permissions, only opens
-- writes to predictions_v2 rows whose user_id is a ghost entry belonging to a pool the
-- caller administers, and only when pool_id on the two rows actually match (so an admin
-- of pool A can't write a row claiming to be for a ghost that lives in pool B).
create policy "Admins can manage ghost predictions in their pools" on public.predictions_v2
  for all
  using (
    exists (
      select 1 from public.ghost_entries
      join public.pools on pools.id = ghost_entries.pool_id
      where ghost_entries.id = predictions_v2.user_id
      and ghost_entries.pool_id = predictions_v2.pool_id
      and pools.admin_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ghost_entries
      join public.pools on pools.id = ghost_entries.pool_id
      where ghost_entries.id = predictions_v2.user_id
      and ghost_entries.pool_id = predictions_v2.pool_id
      and pools.admin_id = auth.uid()
    )
  );
