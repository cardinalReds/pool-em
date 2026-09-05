// Share-recap: builds a pool-wide, presentation-only summary of a finished round/event.
// No scoring is recomputed here — every number comes straight from predictions_v2's
// existing points_earned / is_correct columns, the same source ScopedLeaderboard reads.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type RecapLeaderboardRow = {
  display_name: string
  points: number // primary number for the active scope — season total if scope='total', this-round points if scope='round'
  secondaryPoints: number // the other number — round delta if scope='total', season total if scope='round'
  games: number | null
  is_ghost?: boolean
  avatar_url?: string | null
  rank: number // competition ranking — tied rows (same points AND same tiebreak) share a rank
}

export type RecapItem = {
  label: string
  pickSummary: string
  result: string
  hit: boolean
}

export type RecapCTA =
  | { kind: 'join'; link: string }
  | { kind: 'nextRound'; link: string; roundLabel: string; deadlineLabel: string }
  | { kind: 'standings'; link: string }

export type RecapData = {
  poolName: string
  roundLabel: string
  dateLabel: string
  gameUnit: string | null // "game" / "session" / null (MMA omits the count entirely)
  leaderboard: RecapLeaderboardRow[]
  scope: 'total' | 'round'
  ghostsOnly: boolean
  // Only meaningful when ghostsOnly is true — 'ghosts' means each row's rank is its
  // position among just the ghosts shown; 'overall' means it's the row's real position in
  // the full general-table leaderboard (not consecutive), and otherCount says how many
  // non-ghost entries also exist in that same general table.
  rankBasis: 'overall' | 'ghosts'
  otherCount?: number
  items: RecapItem[]
  itemsOverflow: number
  empty: boolean
  cta: RecapCTA
}

// Rough content-height estimate (at scale 1, matching RecapPoster's own px values) so the
// PNG route can size its canvas to the actual content instead of leaving dead space or
// clipping a long recap.
export function estimateHeight(data: RecapData): number {
  let h = 5 // top accent bar
  h += 24 + 28 // top + bottom content padding
  h += 20 // pool'em wordmark / date row
  h += 12 + 28 // pool name margin + line
  h += 9 + 20 // round pill margin + pill
  if (data.empty) {
    h += 48 * 2 + 20
  } else {
    h += 22 + 18 + 8 // "standings" label
    h += data.leaderboard.length * 44 // each row now carries a secondary points sub-line
    h += 20 // buffer for the optional otherCount/ghost-disclaimer lines below the table
    if (data.items.length > 0) {
      h += 22 + 18 + 8 + data.items.length * 23 + (data.itemsOverflow > 0 ? 18 : 0)
    }
  }
  h += 24 + 40 + 10 + 16 // footer: margin + CTA button + margin + "made with" line
  return h
}

export type RecapResult =
  | { error: 'unauthorized' | 'not_found' | 'forbidden' }
  | { data: RecapData; roundsAvailable: string[] }

type RawGame = {
  id: number
  label_home: string
  label_away: string
  home_score: number | null
  away_score: number | null
  round: string
  date: string
  finished: boolean
  fight_order?: number | null
  card_segment?: string | null
  result_method?: string | null
  result_round?: number | null
  results?: any
  session_type?: string
}

type RawPred = {
  user_id: string
  fixture_id: number | null
  category_id: string
  value_wld: string | null
  value_text: string | null
  value_ou: string | null
  value_yesno: boolean | null
  value_number: number | null
  points_earned: number | null
  is_correct: boolean | null
}

function pickKey(p: RawPred): string | null {
  if (p.value_wld) return `wld:${p.value_wld}`
  if (p.value_text) return `text:${p.value_text}`
  if (p.value_yesno !== null && p.value_yesno !== undefined) return `yesno:${p.value_yesno}`
  if (p.value_ou !== null && p.value_ou !== undefined) return `ou:${p.value_ou}`
  if (p.value_number !== null && p.value_number !== undefined) return `number:${p.value_number}`
  return null
}

function pickDisplay(key: string, game: RawGame): string {
  const [type, val] = key.split(':')
  if (type === 'wld') return val === 'home' ? game.label_home : val === 'away' ? game.label_away : 'draw'
  if (type === 'yesno') return val === 'true' ? 'yes' : 'no'
  return val
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDeadline(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase()
}

// One recap item per finished game/session in the round, majority-pick vs. actual result.
// The "whose picks" decision (spec's open question): pool-level majority pick, not the
// sharer's own picks — a group-chat artifact should read the same for every viewer.
// Falls back to null items only if a fixture has zero picks at all (nothing to summarize).
function buildItems(games: RawGame[], preds: RawPred[], isMma: boolean): RecapItem[] {
  const items: RecapItem[] = []

  for (const game of games) {
    const predsForGame = preds.filter(p => p.fixture_id === game.id && pickKey(p) !== null)
    if (predsForGame.length === 0) continue

    // Primary category = whichever category the most people actually picked for this
    // game — data-driven so it works without hardcoding a "main" category per sport.
    const byCategory: Record<string, RawPred[]> = {}
    predsForGame.forEach(p => { (byCategory[p.category_id] ||= []).push(p) })
    const primaryCategory = Object.keys(byCategory).sort((a, b) => byCategory[b].length - byCategory[a].length)[0]
    const predsForCategory = byCategory[primaryCategory]

    const tally: Record<string, RawPred[]> = {}
    predsForCategory.forEach(p => { const k = pickKey(p)!; (tally[k] ||= []).push(p) })
    const majorityKey = Object.keys(tally).sort((a, b) => tally[b].length - tally[a].length)[0]
    const majorityRows = tally[majorityKey]

    // Not insightful, skip it: a "1 of 4 picked X" plurality isn't a story — a real
    // majority (>50%, with enough people weighing in to mean something) is. Better to
    // show nothing for a game than a stat nobody would find interesting.
    const majorityShare = majorityRows.length / predsForCategory.length
    if (predsForCategory.length < 3 || majorityShare <= 0.5) continue

    const hit = majorityRows[0].is_correct != null
      ? majorityRows[0].is_correct
      : (majorityRows[0].points_earned || 0) > 0

    let label: string
    let result = ''
    if (isMma) {
      const isMain = game.card_segment === 'main_card' && game.fight_order === 1
      const isCoMain = game.card_segment === 'main_card' && game.fight_order === 2
      label = isMain ? 'main event' : isCoMain ? 'co-main' : `${game.label_home} vs ${game.label_away}`
      const parts = [game.result_method, game.result_round ? `R${game.result_round}` : null].filter(Boolean)
      result = parts.join(', ')
    } else if (game.session_type) {
      label = game.session_type.toLowerCase()
      const podium = Array.isArray(game.results) ? game.results.find((r: any) => r?.position === 1) : null
      result = podium?.driver_name ? `${podium.driver_name} finished P1` : ''
    } else {
      label = game.home_score != null && game.away_score != null
        ? `${game.label_home} ${game.home_score}-${game.away_score} ${game.label_away}`
        : `${game.label_home} vs ${game.label_away}`
    }

    const pickSummary = `${majorityRows.length} of ${predsForCategory.length} picked ${pickDisplay(majorityKey, game)}`

    items.push({ label, pickSummary, result, hit })
  }

  return items
}

const ITEM_CAP = 6

export function buildRecap(input: {
  poolName: string
  roundLabel: string
  roundDate: string | null
  isF1: boolean
  isMma: boolean
  members: { user_id: string; display_name: string; is_ghost?: boolean; avatar_url?: string | null }[]
  roundGames: RawGame[]
  allFinishedGames: RawGame[] // whole tournament, not just this round — for the global leaderboard
  roundByFixtureId: Record<number, string>
  preds: RawPred[]
  isPublic: boolean
  joinLink: string
  poolLink: string
  nextDeadlineIso: string | null
  nextRoundLabel: string | null
  ghostsOnly: boolean
  rankBasis: 'overall' | 'ghosts'
  scope: 'total' | 'round'
  showCount: number | 'all'
}): RecapData {
  const SEGMENT_ORDER: Record<string, number> = { main_card: 0, prelims: 1, prelim_card: 1, early_prelims: 2 }
  const finishedGames = input.roundGames.filter(g => g.finished).sort((a, b) => {
    if (input.isMma) {
      const segA = SEGMENT_ORDER[a.card_segment || ''] ?? 1
      const segB = SEGMENT_ORDER[b.card_segment || ''] ?? 1
      if (segA !== segB) return segA - segB
      return (a.fight_order || 0) - (b.fight_order || 0) // main event = fight_order 1, first
    }
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })
  const gameIds = new Set(finishedGames.map(g => g.id))

  const empty = gameIds.size === 0

  // Inactive members don't feature in the recap at all — "active" means they made at
  // least one pick on a game in THIS round (not lifetime), so someone who stopped
  // predicting weeks ago drops out even though their season point total is still real.
  const roundGameIds = new Set(input.roundGames.map(g => g.id))
  const activeUserIds = new Set(
    input.preds
      .filter(p => p.fixture_id != null && roundGameIds.has(p.fixture_id) && pickKey(p) !== null)
      .map(p => p.user_id)
  )
  const activeMembers = input.members.filter(m => activeUserIds.has(m.user_id))

  // Global (season/tournament-wide) standings, not scoped to this one round — the same
  // total shown by ScopedLeaderboard's default "all games" view, so a recap doubles as
  // an "and here's where everyone stands overall" artifact, not just this round's tally.
  const allFinishedIds = new Set(input.allFinishedGames.map(g => g.id))
  const memberStats = activeMembers.map(m => {
    const ownPreds = input.preds.filter(p => p.user_id === m.user_id)
    const totalPoints = ownPreds.reduce((sum, p) => sum + (p.points_earned || 0), 0)
    const roundPoints = ownPreds
      .filter(p => p.fixture_id != null && roundGameIds.has(p.fixture_id))
      .reduce((sum, p) => sum + (p.points_earned || 0), 0)
    // Tiebreak signal: raw points ties happen constantly once a pool's been running a
    // while (same categories, same point values) — correct-pick count as a secondary sort
    // is the standard sports-pool tiebreaker, applied at whichever scope is being ranked.
    const totalCorrect = ownPreds.filter(p => p.fixture_id != null && allFinishedIds.has(p.fixture_id) && p.is_correct === true).length
    const roundCorrect = ownPreds.filter(p => p.fixture_id != null && roundGameIds.has(p.fixture_id) && p.is_correct === true).length

    const seasonPickedIds = new Set(
      ownPreds.filter(p => p.fixture_id != null && allFinishedIds.has(p.fixture_id) && pickKey(p) !== null).map(p => p.fixture_id as number)
    )
    const seasonGames = input.isF1
      ? new Set([...seasonPickedIds].map(id => input.roundByFixtureId[id]).filter(Boolean)).size
      : seasonPickedIds.size
    const roundGamesPicked = new Set(
      ownPreds.filter(p => p.fixture_id != null && roundGameIds.has(p.fixture_id) && pickKey(p) !== null).map(p => p.fixture_id as number)
    ).size

    return {
      display_name: m.display_name, is_ghost: m.is_ghost, avatar_url: m.avatar_url,
      totalPoints, roundPoints, totalCorrect, roundCorrect, seasonGames, roundGamesPicked,
    }
  })

  const primaryPoints = (r: typeof memberStats[number]) => input.scope === 'round' ? r.roundPoints : r.totalPoints
  const primaryCorrect = (r: typeof memberStats[number]) => input.scope === 'round' ? r.roundCorrect : r.totalCorrect
  const secondaryPoints = (r: typeof memberStats[number]) => input.scope === 'round' ? r.totalPoints : r.roundPoints
  const games = (r: typeof memberStats[number]) => input.scope === 'round' ? r.roundGamesPicked : r.seasonGames

  const sorted = [...memberStats].sort((a, b) => {
    const byPoints = primaryPoints(b) - primaryPoints(a)
    if (byPoints !== 0) return byPoints
    const byCorrect = primaryCorrect(b) - primaryCorrect(a)
    if (byCorrect !== 0) return byCorrect
    return a.display_name.localeCompare(b.display_name) // final deterministic tiebreak — never a coin flip
  })

  // Competition ranking (1, 1, 3, 4, 4, 6) — a row only shares the previous row's rank if
  // it's genuinely tied on both points AND the tiebreaker; anything else gets a real,
  // distinct rank instead of the old behavior (plain array position, which silently broke
  // real ties by insertion order with no indication they were ever tied).
  let rank = 0
  const leaderboardFull: RecapLeaderboardRow[] = sorted.map((row, i) => {
    const tiedWithPrev = i > 0 && primaryPoints(row) === primaryPoints(sorted[i - 1]) && primaryCorrect(row) === primaryCorrect(sorted[i - 1])
    if (!tiedWithPrev) rank = i + 1
    return {
      display_name: row.display_name,
      points: primaryPoints(row),
      secondaryPoints: secondaryPoints(row),
      games: games(row),
      is_ghost: row.is_ghost,
      avatar_url: row.avatar_url,
      rank,
    }
  })

  // Three shapes, per the general/ghosts-only/ghosts-ranked-overall distinction:
  //  - not ghostsOnly: the general table, ranks as computed above.
  //  - ghostsOnly + rankBasis 'ghosts': just the ghost rows, re-ranked among themselves.
  //  - ghostsOnly + rankBasis 'overall': just the ghost rows, keeping their real (non-
  //    consecutive) rank from the general table, plus how many non-ghosts sit alongside them.
  let scopedLeaderboard: RecapLeaderboardRow[]
  let otherCount: number | undefined
  if (!input.ghostsOnly) {
    scopedLeaderboard = leaderboardFull
  } else if (input.rankBasis === 'ghosts') {
    const ghostRows = leaderboardFull.filter(row => row.is_ghost)
    let ghostRank = 0
    scopedLeaderboard = ghostRows.map((row, i) => {
      const tiedWithPrev = i > 0 && row.points === ghostRows[i - 1].points
      if (!tiedWithPrev) ghostRank = i + 1
      return { ...row, rank: ghostRank }
    })
  } else {
    scopedLeaderboard = leaderboardFull.filter(row => row.is_ghost)
    otherCount = leaderboardFull.length - scopedLeaderboard.length
  }

  const leaderboard = input.showCount === 'all' ? scopedLeaderboard : scopedLeaderboard.slice(0, input.showCount)

  const allItems = empty ? [] : buildItems(finishedGames, input.preds, input.isMma)
  const items = allItems.slice(0, ITEM_CAP)
  const itemsOverflow = Math.max(0, allItems.length - ITEM_CAP)

  let cta: RecapCTA
  if (input.isPublic) {
    cta = { kind: 'join', link: input.joinLink }
  } else if (input.nextDeadlineIso && input.nextRoundLabel) {
    cta = { kind: 'nextRound', link: input.poolLink, roundLabel: input.nextRoundLabel, deadlineLabel: shortDeadline(input.nextDeadlineIso) }
  } else {
    cta = { kind: 'standings', link: input.poolLink }
  }

  return {
    poolName: input.poolName,
    roundLabel: input.roundLabel,
    dateLabel: input.roundDate ? shortDate(input.roundDate) : '',
    gameUnit: input.isMma ? null : input.isF1 ? 'round' : 'game',
    leaderboard,
    scope: input.scope,
    ghostsOnly: input.ghostsOnly,
    rankBasis: input.rankBasis,
    otherCount,
    items,
    itemsOverflow,
    empty,
    cta,
  }
}

// Fetches everything buildRecap needs and applies the access gate. Works with either the
// browser client (preview page) or the SSR cookie client (image route) — both are typed
// SupabaseClient<Database> and expose the same query surface, so this one function keeps
// the two routes gated identically, per the spec's requirement.
export async function loadRecap(
  supabase: SupabaseClient<Database>,
  poolId: string,
  opts: {
    round?: string; baseUrl: string
    ghostsOnly?: boolean; rankBasis?: 'overall' | 'ghosts'
    scope?: 'total' | 'round'; showCount?: number | 'all'
  }
): Promise<RecapResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const { data: pool } = await supabase.from('pools').select('*').eq('id', poolId).maybeSingle()
  if (!pool) return { error: 'not_found' }
  if (pool.admin_id !== user.id) return { error: 'forbidden' }

  const isF1 = pool.sport === 'f1'
  const isMma = pool.sport === 'mma'

  const { data: members } = await supabase.from('pool_members').select('user_id, display_name').eq('pool_id', poolId)
  const { data: ghosts } = await supabase.from('ghost_entries').select('id, name, avatar_url').eq('pool_id', poolId)
  const allMembers = [
    ...(members || []).map(m => ({ user_id: m.user_id, display_name: m.display_name, is_ghost: false })),
    ...(ghosts || []).map(g => ({ user_id: g.id, display_name: g.name, is_ghost: true, avatar_url: g.avatar_url })),
  ]

  const { data: tournament } = await supabase.from('tournaments').select('name, event_date').eq('id', pool.tournament_id).maybeSingle()

  let rawGames: RawGame[]
  if (isF1) {
    const { data } = await supabase.from('f1_sessions')
      .select('id, competition_name, session_type, date, status, scored, results')
      .eq('tournament_id', pool.tournament_id)
    rawGames = (data || []).map(g => ({
      id: g.id, label_home: '', label_away: '', home_score: null, away_score: null,
      round: g.competition_name, date: g.date, finished: !!g.scored,
      session_type: g.session_type, results: g.results,
    }))
  } else {
    const { data } = await supabase.from('fixtures')
      .select('id, home_team, away_team, home_score, away_score, round, card_segment, fight_order, result_method, result_round, date, status')
      .eq('tournament_id', pool.tournament_id)
    rawGames = (data || []).map(g => ({
      id: g.id, label_home: g.home_team, label_away: g.away_team,
      home_score: g.home_score, away_score: g.away_score, round: g.round, date: g.date,
      finished: g.status === 'FT', fight_order: g.fight_order, card_segment: g.card_segment,
      result_method: g.result_method, result_round: g.result_round,
    }))
  }

  const { data: predsRaw } = await supabase.from('predictions_v2')
    .select('user_id, fixture_id, category_id, value_wld, value_text, value_ou, value_yesno, value_number, points_earned, is_correct')
    .eq('pool_id', poolId)
  const preds = (predsRaw || []) as RawPred[]
  const pickedFixtureIds = new Set(preds.filter(p => p.fixture_id != null && pickKey(p) !== null).map(p => p.fixture_id))

  const roundOf = (g: RawGame) => g.round
  // Only finished games this pool actually has picks on — a round with no picks from
  // this pool's members isn't a meaningful default (e.g. a pool that stopped picking
  // after the group stage shouldn't default to a knockout round it never touched).
  const finished = rawGames.filter(g => g.finished && pickedFixtureIds.has(g.id))

  let roundLabel: string
  let roundDate: string | null
  let roundsAvailable: string[] = []
  if (isMma) {
    roundLabel = tournament?.name || pool.tournament_id
    roundDate = tournament?.event_date || (rawGames[0]?.date ?? null)
  } else {
    const earliestByRound: Record<string, number> = {}
    finished.forEach(g => {
      const t = new Date(g.date).getTime()
      if (!(g.round in earliestByRound) || t < earliestByRound[g.round]) earliestByRound[g.round] = t
    })
    roundsAvailable = Object.keys(earliestByRound).sort((a, b) => earliestByRound[b] - earliestByRound[a])
    roundLabel = opts.round && roundsAvailable.includes(opts.round) ? opts.round : (roundsAvailable[0] || '')
    const roundGamesForDate = finished.filter(g => g.round === roundLabel)
    roundDate = roundGamesForDate.length
      ? roundGamesForDate.reduce((min, g) => new Date(g.date) < new Date(min) ? g.date : min, roundGamesForDate[0].date)
      : null
  }

  const roundGames = isMma ? rawGames : rawGames.filter(g => roundOf(g) === roundLabel)
  const allFinishedGames = rawGames.filter(g => g.finished)
  const roundByFixtureId: Record<number, string> = {}
  rawGames.forEach(g => { roundByFixtureId[g.id] = g.round })

  // Next upcoming lock deadline: earliest not-yet-started game across the whole
  // tournament. Simplification — doesn't replicate each sport list's exact per-round
  // "before_weekend" lock-time grouping, just uses the next game's own kickoff/session
  // time as a close proxy, since locks always land at or before that moment.
  const now = Date.now()
  const upcoming = rawGames.filter(g => new Date(g.date).getTime() > now)
  let nextDeadlineIso: string | null = null
  let nextRoundLabel: string | null = null
  if (upcoming.length) {
    const next = upcoming.reduce((min, g) => new Date(g.date) < new Date(min.date) ? g : min, upcoming[0])
    nextDeadlineIso = next.date
    nextRoundLabel = isMma ? (tournament?.name || pool.tournament_id) : next.round
  }

  const recap = buildRecap({
    poolName: pool.name,
    roundLabel,
    roundDate,
    isF1,
    isMma,
    members: allMembers,
    roundGames,
    allFinishedGames,
    roundByFixtureId,
    preds,
    isPublic: pool.is_public,
    joinLink: `${opts.baseUrl}/pool/join/${pool.invite_code}`,
    poolLink: `${opts.baseUrl}/pool/${pool.id}`,
    nextDeadlineIso,
    nextRoundLabel,
    ghostsOnly: !!opts.ghostsOnly,
    scope: opts.scope || 'total',
    showCount: opts.showCount ?? 5,
    rankBasis: opts.rankBasis || 'overall',
  })

  return { data: recap, roundsAvailable }
}
