-- World Cup and Premier League pools both score against ruleset_categories with
-- sport='soccer' (categories are shared across soccer competitions) — 'world_cup' only
-- ever existed as a pools.sport value, never as its own tracked sport. Collapse it here
-- so interest tracking treats World Cup and Premier League as one "soccer" interest.

-- Merge any world_cup-only interest into soccer (keep 'manual' if either row was manual)
insert into public.user_sport_interests (user_id, sport, source)
select wc.user_id, 'soccer', max(wc.source)
from public.user_sport_interests wc
where wc.sport = 'world_cup'
group by wc.user_id
on conflict (user_id, sport) do update set source = excluded.source
  where public.user_sport_interests.source = 'derived' and excluded.source = 'manual';

delete from public.user_sport_interests where sport = 'world_cup';

-- Canonicalize the derive trigger so it never writes 'world_cup' again
create or replace function public.derive_sport_interest_on_pool_join()
returns trigger as $$
begin
  insert into public.user_sport_interests (user_id, sport, source)
  select new.user_id, (case when p.sport = 'world_cup' then 'soccer' else p.sport end), 'derived'
  from public.pools p
  where p.id = new.pool_id
  on conflict (user_id, sport) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
