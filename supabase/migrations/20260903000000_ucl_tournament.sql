-- Adds Champions League as a new tournament under the existing 'soccer' sport (same
-- pattern as PL/WC) — reuses soccer_* ruleset categories, lib/soccerScoring.ts, and
-- FixturesList as-is. No new pools columns needed; UCL is a plain soccer competition
-- with real knockout rounds (unlike PL), so it uses the generic bracket-scoring machinery
-- already built for WC-style pools.
insert into public.tournaments (id, name, sport, season, status, allows_draw, api_league_id, end_date)
values ('ucl_2026', 'Champions League 2026/27', 'soccer', 2026, 'active', true, 2, '2027-06-01T00:00:00Z')
on conflict (id) do nothing;
