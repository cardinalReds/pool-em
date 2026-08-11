-- Backs /api/mma/odds. MMA fixtures already store BallDontLie's fight id as fixtures.id
-- (used for live/scoring), but odds come from a different provider on the same
-- API-Sports account (v1.mma.api-sports.io) which has its own, unrelated fight id
-- scheme. Cached here once resolved (matched by fighter names + event date) so repeat
-- odds-refresh runs don't need to re-search every time.
alter table public.fixtures add column if not exists api_sports_fight_id integer;
