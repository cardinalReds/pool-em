-- best10-select can compute a week's games before the AP poll (or CFBD_API_KEY) is
-- available, in which case it silently falls back to the pure-spread algorithm with no
-- ranking signal at all. That selection was previously stored as source='auto' —
-- indistinguishable from a real ranked selection — and then treated as permanently
-- stable, so a poll simply not being out yet at the moment someone first opened the picks
-- page could lock a week onto an unranked selection forever. 'auto_fallback' marks that
-- case so app/api/ncaaf/best10-select/route.ts can retry with real rankings once they're
-- available (as long as nobody has predicted on the fallback games yet), and so it's
-- visible in the data instead of looking identical to a normal ranked pick.
alter table public.pool_matchweek_selections drop constraint if exists pool_matchweek_selections_source_check;
alter table public.pool_matchweek_selections add constraint pool_matchweek_selections_source_check
  check (source in ('auto', 'auto_fallback', 'admin', 'vote'));
