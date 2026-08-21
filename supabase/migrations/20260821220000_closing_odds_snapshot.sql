-- fixtures.odds_home/draw/away get overwritten continuously — pre-match by /api/odds
-- and /api/nfl/odds, then in-play by refreshLiveOdds() in /api/live once a match goes
-- live — so by full-time those columns hold whatever the last live update was, not the
-- odds a prediction was actually made against. The "if I'd bet $1 on each pick" stat
-- needs a frozen snapshot instead: captured once, the instant a fixture transitions to
-- live, before any in-play overwrite touches it.
alter table public.fixtures add column if not exists closing_odds_home numeric;
alter table public.fixtures add column if not exists closing_odds_draw numeric;
alter table public.fixtures add column if not exists closing_odds_away numeric;
