-- Adds NCAA college football as a new tournament under the existing 'nfl' sport (same
-- pattern as PL/WC both being 'soccer' with different tournament_id/api_league_id) —
-- reuses nfl_* ruleset categories, lib/nflScoring.ts, and NFLGamesList as-is.
insert into public.tournaments (id, name, sport, season, status, allows_draw, api_league_id, end_date)
values ('ncaaf_2026', 'NCAA Football 2026', 'nfl', 2026, 'active', true, 2, '2027-01-26T00:00:00Z')
on conflict (id) do nothing;

-- Mirrors pl_game_mode/pl_best5_admin_override — 'every_game' (predict the full slate) or
-- 'best10' (algorithm/admin picks 10 games a week, see lib/best10Selection.ts). Column is
-- generic to college football pools generally (cfb_*), not tied to a specific season.
alter table public.pools add column if not exists cfb_game_mode text;
alter table public.pools add column if not exists cfb_best10_admin_override boolean not null default false;
