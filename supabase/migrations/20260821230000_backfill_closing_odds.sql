-- One-time backfill: closing_odds_* (added this session) only gets populated going
-- forward, the instant a fixture first goes live — so every fixture that finished
-- before that code shipped (the whole World Cup, plus any PL/NFL games already played)
-- has it NULL and the $1-per-pick P&L on /dashboard/profile silently has nothing to
-- show for them. Best-effort fills it from whatever odds_home/draw/away last held for
-- that fixture — not a true "price at kickoff" for matches that went through the old
-- live-odds refresh (removed this session), but far better than no data at all.
update public.fixtures
set closing_odds_home = odds_home,
    closing_odds_draw = odds_draw,
    closing_odds_away = odds_away
where closing_odds_home is null
  and odds_home is not null
  and status in ('FT', 'AOT');
