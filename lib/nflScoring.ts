// Per-game scoring logic for NFL CUSTOM pools — mirrors lib/soccerScoring.ts's shape.
// Halftime facts are derived by callers as quarter_1 + quarter_2 from the API-Sports
// American Football games response; this module just takes the resulting numbers.

export interface NFLPoolRule {
  category_id: string
  points: number
  bonus_points: number
}

export interface NFLMatchFacts {
  homeScore: number
  awayScore: number
  htHomeScore: number | null
  htAwayScore: number | null
  spreadLine: number | null    // home team's spread, e.g. -3.5 means home favored by 3.5
  totalLine: number | null
  htSpreadLine: number | null
  htTotalLine: number | null
}

export function getNFLResult(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

export function scoreNFLPrediction(categoryId: string, pred: any, facts: NFLMatchFacts, rule: NFLPoolRule): number {
  switch (categoryId) {
    case 'nfl_result':
      return pred.value_wld === getNFLResult(facts.homeScore, facts.awayScore) ? rule.points : 0

    case 'nfl_ht_result': {
      if (facts.htHomeScore === null || facts.htAwayScore === null) return 0
      return pred.value_wld === getNFLResult(facts.htHomeScore, facts.htAwayScore) ? rule.points : 0
    }

    case 'nfl_spread': {
      if (facts.spreadLine === null) return 0
      const adjustedHome = facts.homeScore + facts.spreadLine
      const result = adjustedHome > facts.awayScore ? 'home' : adjustedHome < facts.awayScore ? 'away' : 'draw'
      return pred.value_wld === result ? rule.points : 0
    }

    case 'nfl_ht_spread': {
      if (facts.htSpreadLine === null || facts.htHomeScore === null || facts.htAwayScore === null) return 0
      const adjustedHome = facts.htHomeScore + facts.htSpreadLine
      const result = adjustedHome > facts.htAwayScore ? 'home' : adjustedHome < facts.htAwayScore ? 'away' : 'draw'
      return pred.value_wld === result ? rule.points : 0
    }

    case 'nfl_total_points_ou': {
      if (facts.totalLine === null) return 0
      const total = facts.homeScore + facts.awayScore
      return pred.value_ou === (total > facts.totalLine ? 'over' : 'under') ? rule.points : 0
    }

    case 'nfl_ht_total_points_ou': {
      if (facts.htTotalLine === null || facts.htHomeScore === null || facts.htAwayScore === null) return 0
      const total = facts.htHomeScore + facts.htAwayScore
      return pred.value_ou === (total > facts.htTotalLine ? 'over' : 'under') ? rule.points : 0
    }

    default:
      return 0
  }
}
