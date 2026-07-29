-- Round-special predictions (soccer_clean_sheet_round, soccer_brace_round, etc.) have
-- fixture_id = null and are keyed by matchday instead. FixturesList.tsx's
-- saveRoundSpecials() upserts with onConflict targeting (pool_id,user_id,fixture_id,
-- category_id,matchday), but no unique constraint on that column set has ever existed —
-- every save has failed with 42P10 (no matching unique/exclusion constraint), silently
-- (the app doesn't check the upsert's error), so round-special picks were never actually
-- persisted.
--
-- fixture_id doesn't need to be part of the key at all here — it's always null for these
-- rows, and NULL never violates a unique constraint, so a plain (pool_id, user_id,
-- category_id, matchday) index is both sufficient and correct: it enforces "one pick per
-- category per matchday" for round-specials, and is a no-op for regular per-fixture rows
-- (matchday is always null there, so they never collide under it).
create unique index if not exists predictions_v2_round_special_key
  on public.predictions_v2 (pool_id, user_id, category_id, matchday);
