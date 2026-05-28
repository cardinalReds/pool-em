export type Sport = 'world_cup'

export type PackageId = 'WLD' | 'WLD_1TS' | 'EXACT_SCORE' | 'EXACT_1TS'

export type DeadlineType = 'before_each_game' | 'before_tournament'

export type TournamentScope = 'group_stage' | 'knockout' | 'full'

export interface RulePackage {
  id: PackageId
  name: string
  description: string
  requires: {
    result: boolean       // Win/Loss/Draw
    first_scorer: boolean // First goalscorer
    exact_score: boolean  // Exact final score
  }
  scoring: {
    correct_result: number
    correct_first_scorer: number
    correct_exact_score: number
  }
}

export interface Pool {
  id: string
  name: string
  sport: Sport
  package_id: PackageId
  tournament_scope: TournamentScope
  deadline_type: DeadlineType
  invite_code: string
  admin_id: string
  is_active: boolean
  created_at: string
}

export interface PoolMember {
  id: string
  pool_id: string
  user_id: string
  display_name: string
  joined_at: string
}

export interface Prediction {
  id: string
  pool_id: string
  user_id: string
  fixture_id: number
  predicted_home_score: number | null
  predicted_away_score: number | null
  predicted_result: 'home' | 'away' | 'draw' | null
  predicted_first_scorer_id: number | null
  predicted_first_scorer_name: string | null
  points_earned: number | null
  submitted_at: string
}

export interface Fixture {
  id: number
  date: string
  home_team: string
  home_team_logo: string
  away_team: string
  away_team_logo: string
  venue: string
  status: string
  home_score: number | null
  away_score: number | null
  round: string
  first_scorer_id: number | null
  first_scorer_name: string | null
  odds_home: number | null
  odds_draw: number | null
  odds_away: number | null
}

export const RULE_PACKAGES: Record<PackageId, RulePackage> = {
  WLD: {
    id: 'WLD',
    name: 'Win / Loss / Draw',
    description: 'Pick the result of each match. 1 point per correct call.',
    requires: { result: true, first_scorer: false, exact_score: false },
    scoring: { correct_result: 1, correct_first_scorer: 0, correct_exact_score: 0 },
  },
  WLD_1TS: {
    id: 'WLD_1TS',
    name: 'WLD + First Scorer',
    description: 'Pick the result and the first goalscorer. 1pt for result, 3pts for first scorer.',
    requires: { result: true, first_scorer: true, exact_score: false },
    scoring: { correct_result: 1, correct_first_scorer: 3, correct_exact_score: 0 },
  },
  EXACT_SCORE: {
    id: 'EXACT_SCORE',
    name: 'Exact Score',
    description: 'Predict the exact final score. 3pts for exact score, 1pt for correct result.',
    requires: { result: false, first_scorer: false, exact_score: true },
    scoring: { correct_result: 1, correct_first_scorer: 0, correct_exact_score: 3 },
  },
  EXACT_1TS: {
    id: 'EXACT_1TS',
    name: 'Exact Score + First Scorer',
    description: 'The full package. Exact score + first goalscorer.',
    requires: { result: false, first_scorer: true, exact_score: true },
    scoring: { correct_result: 1, correct_first_scorer: 3, correct_exact_score: 3 },
  },
}
