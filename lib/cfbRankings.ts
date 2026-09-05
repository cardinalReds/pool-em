// AP Top 25 rankings from CollegeFootballData.com — used to weight NCAAF's "best 10"
// selection toward marquee/ranked matchups instead of pure kickoff-time spreading.
// api-sports.io (the fixtures/scoring source) has no standings/rankings data at all
// (coverage.standings === false), so this is a second, independent data source.
const CFBD_API_KEY = process.env.CFBD_API_KEY

// team name -> AP rank (1-25)
export type RankedTeams = Map<string, number>

function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // strip accents
    .replace(/\s*\([^)]*\)\s*$/, '') // strip trailing "(FL)"/"(OH)"-style disambiguators
    .toLowerCase()
    .trim()
}

// Returns an empty map on any failure (no key set, API error, no poll released yet for this
// week) — callers must treat that as "no ranking signal available" and fall back gracefully,
// never throw.
export async function fetchApRankings(season: number, week: number): Promise<RankedTeams> {
  if (!CFBD_API_KEY) return new Map()
  try {
    const res = await fetch(
      `https://api.collegefootballdata.com/rankings?year=${season}&week=${week}&seasonType=regular`,
      { headers: { Authorization: `Bearer ${CFBD_API_KEY}` } }
    )
    if (!res.ok) return new Map()
    const data = await res.json()
    const apPoll = data?.[0]?.polls?.find((p: any) => p.poll === 'AP Top 25')
    const map: RankedTeams = new Map()
    for (const r of apPoll?.ranks || []) {
      if (r.school && r.rank) map.set(normalizeTeamName(r.school), r.rank)
    }
    return map
  } catch (err) {
    console.error('fetchApRankings error:', err)
    return new Map()
  }
}

// Exposed so best10Selection.ts can match our fixtures' team names (from api-sports.io)
// against CFBD's normalized school names without duplicating the normalization logic.
export function rankOf(rankedTeams: RankedTeams, team: string): number | null {
  return rankedTeams.get(normalizeTeamName(team)) ?? null
}
