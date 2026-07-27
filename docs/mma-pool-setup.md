# MMA Pool Setup Instructions
*How UFC events get into pool-em now. Feed this file back to Claude when setting up future events.*

**This process changed from the last version of this doc.** Fixture seeding and fighter
photos are now automated via a cron (`/api/mma/seed`, every 12 hours) — no more manual
SQL inserts for fights. There's still exactly one manual step: creating the tournament
row. Everything else backfills on its own.

---

## What's automatic now

`app/api/mma/seed/route.ts` runs every 12 hours (`vercel.json`) and, for every
`tournaments` row where `sport='mma'` and `status='active'`:

1. Finds the matching **BallDontLie** event by date (`api.balldontlie.io/mma/v1`,
   `Authorization: <BALLDONTLIE_API_KEY>`, no `Bearer` prefix) and backfills
   `tournaments.api_league_id` with it — this is also what `app/api/mma/live` and
   `app/api/mma/score` read to know which event to poll for live status/results.
2. Pulls the full fight card (`GET /fights?event_ids[]=<id>`) and upserts every fight
   into `fixtures`, keyed by BallDontLie's own fight `id` (used as both `id` and
   `api_fixture_id`) — safe to re-run, and it will **never touch a fixture once
   `scored=true`**, so re-running mid-event doesn't clobber results.
3. Looks up each fighter's photo from **api-sports** (`v1.mma.api-sports.io`, same
   account/key as football/F1 — `API_FOOTBALL_KEY`, header `x-apisports-key`) and
   fills in `fighter1_photo`/`fighter2_photo`, since BallDontLie doesn't provide photos
   at all (checked every field in its fighter objects — genuinely not there).

You should not need to run any manual SQL for fixtures or photos anymore. Substitutions,
late-announced fights, and newly-revealed fighters all pick up automatically within a
12-hour cycle once the event is close enough that BallDontLie has announced them.

---

## The one manual step — create the tournament row

The seed cron only *looks for* active MMA tournaments; it never creates one. For a new
event:

```sql
insert into tournaments (id, name, sport, status, end_date, event_date, season)
values ('ufc_NNN', 'UFC NNN', 'mma', 'active', 'YYYY-MM-DDT00:00:00Z', 'YYYY-MM-DDT00:00:00Z', YYYY)
on conflict (id) do nothing;
```

- `id` — format `ufc_NNN` (e.g. `ufc_330`)
- `event_date` — the card's actual date (used for the pool-creation gate: pools for this
  event stay hidden/disabled until 6 days before this date, and for the homepage's
  "next: UFC NNN · Mon D" teaser)
- `end_date` — a day or so after `event_date` (when the tournament stops being visible
  in pool creation once passed; also gates the `/api/mma/seed` refresh — a tournament
  stops being refreshed once its `event_date` is in the past)
- `season` — integer year, required
- Leave `api_league_id` null — the seed cron fills it in automatically on its first run
  for this tournament
- Do not set a `start_date` column — it doesn't exist

Once this row exists, the next `/api/mma/seed` run (within 12h, or trigger manually —
see below) will populate fixtures and photos on its own.

To trigger it immediately instead of waiting for the cron:
```bash
curl -X POST "https://www.pool-em.com/api/mma/seed?secret=YOUR_CRON_SECRET"
```

---

## Fighter photo lookup — gotchas learned setting up UFC 330

- **Endpoint**: `GET https://v1.mma.api-sports.io/fighters?search=<name>` — this is
  *not* season/date-restricted the way `/fights` is (a Free-tier api-sports account can
  use it fine even though it can't query current-season fight schedules), because it's
  fighter bio data, not event-scoped.
- **Rate limit**: 10 requests/minute on the Free plan (separate from a 100/day cap).
  The seed route respects this with a ~6.5s delay between lookups and caps itself to 8
  new lookups per run (`MAX_PHOTO_LOOKUPS_PER_RUN` in the route) — a brand new card's
  ~20 fighters backfill over a couple of 12h cycles rather than one long, timeout-risking
  request. This is fine in practice since most runs only have a couple of new names to
  resolve (late replacements), not a whole fresh card at once.
- **Search field only accepts alphanumeric characters and spaces** — hyphens and
  diacritics 400. `Mansur Abdul-Malik` had to be searched as `Mansur Abdul Malik`, and
  even then didn't match — ended up finding him via last-name-only search (`Malik`).
  `Kauê Fernandes` didn't match any normalized spelling at all — turned out api-sports
  has him stored under a **mangled double-encoding of his name**, literally
  `"KauÃª Fernandes"` (a data quality issue on their end, not fixable on ours) — found
  by searching just `Fernandes` and matching by elimination. The route normalizes names
  (strip diacritics, hyphens → spaces) before searching, but a small number of fighters
  may still need a manual one-off DB update if the automatic search can't find them —
  check `fixtures.fighter1_photo`/`fighter2_photo` for nulls a few days after a new
  event is seeded, and look the stragglers up by hand the same way (try last name only,
  or search api-sports' own site).
- Photos are cached by fighter name across all past-seeded events before spending any
  of a run's lookup budget — a fighter who's already been resolved once (e.g. Neil
  Magny, who fights often) never needs a second API call.

---

## Scoring rules (CUSTOM pool)

Still a manual step when creating the actual pool via the UI (Sport: MMA → select the
tournament → Package: CUSTOM). Check the previous UFC pool's rules to carry forward
unless Fred says otherwise:
```sql
select pr.category_id, pr.points, pr.bonus_points
from pool_rules pr
join pools p on p.id = pr.pool_id
where p.sport = 'mma'
order by p.created_at desc
limit 20;
```

---

## Reference

- BallDontLie: `https://api.balldontlie.io/mma/v1` — `Authorization: <BALLDONTLIE_API_KEY>`
  (no `Bearer` prefix). Events: `/events?league_ids[]=1` (1 = UFC). Fights:
  `/fights?event_ids[]=<id>`.
- api-sports MMA: `https://v1.mma.api-sports.io` — `x-apisports-key: <API_FOOTBALL_KEY>`
  (same key as football/F1, separate product/plan). Fighters: `/fighters?search=<name>`.
  `/fights` and `/fighters` (non-search) are season/date-restricted on the Free plan;
  `/fighters?search=` is not.
- `app/api/mma/seed/route.ts` — the automated route described above.
- `app/api/mma/live/route.ts` / `app/api/mma/score/route.ts` — live status + scoring,
  unchanged, still BallDontLie-based, now actually able to find the event since
  `api_league_id` gets backfilled correctly.

---

## UFC 330 — set up this way (August 15, 2026)

Tournament: `ufc_330`, venue: Xfinity Mobile Arena, Philadelphia. BallDontLie event id
`101995` ("UFC 330: Makhachev vs. Machado Garry"), auto-discovered and backfilled into
`api_league_id` by the seed route. 10 fights across early_prelims (1), prelims (6),
main_card (3) — main event Islam Makhachev vs. Ian Machado Garry. All 20 fighter photos
resolved via api-sports' `/fighters` search, including the two problem cases documented
above.
