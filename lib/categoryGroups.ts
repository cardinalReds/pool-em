// Shared prop-type grouping, used by the pool-creation ruleset builder
// (components/RulesetBuilder.tsx) and the cross-pool stats page
// (app/dashboard/profile/page.tsx) so both present props in the same order.

// Most commonly picked soccer predictions — surfaced up top so admins don't have to dig through groups for them
export const COMMON_IDS = ['soccer_result', 'soccer_first_team_score', 'soccer_ht_result', 'soccer_first_goalscorer']

export const CATEGORY_GROUPS = [
  { label: 'Match Outcome Props', ids: ['soccer_result', 'soccer_team_to_advance', 'soccer_ht_result', 'soccer_asian_handicap'], plExclude: ['soccer_team_to_advance'] },
  { label: 'Goals Props', ids: ['soccer_exact_score', 'soccer_ht_exact_score', 'soccer_btts', 'soccer_total_goals_ou', 'soccer_first_team_score', 'soccer_first_goalscorer', 'soccer_anytime_goalscorer'] },
  { label: 'Corners Props', ids: ['soccer_corners_winner', 'soccer_ht_corners_winner', 'soccer_total_corners_ou'] },
  { label: 'Cards Props', ids: ['soccer_card_points_ou', 'soccer_cards_home_away', 'soccer_cards_ht', 'soccer_first_yellow_team'] },
  { label: 'Fight Result', ids: ['mma_result', 'mma_method'] },
  { label: 'Fight Duration', ids: ['mma_round_finish'] },
  { label: 'Race', ids: ['f1_race_winner', 'f1_podium_order', 'f1_podium', 'f1_points_finish', 'f1_fastest_lap', 'f1_first_retirement', 'f1_pole_to_win', 'f1_first_pit_lap', 'f1_teammate_battle'] },
  { label: 'Qualifying', ids: ['f1_pole_position', 'f1_top3_quali', 'f1_q1_eliminated', 'f1_q3_qualifier'] },
  { label: 'Sprint', ids: ['f1_sprint_winner', 'f1_sprint_podium'] },
  { label: 'Head to Head', ids: ['f1_top6_teammate'] },
  { label: 'Full Game Props', ids: ['nfl_result', 'nfl_spread', 'nfl_total_points_ou'] },
  { label: '1st Half Props', ids: ['nfl_ht_result', 'nfl_ht_spread', 'nfl_ht_total_points_ou'] },
]

export const ROUND_SPECIALS = ['soccer_clean_sheet_round', 'soccer_brace_round', 'soccer_red_card_round', 'soccer_penalty_round']

// predictions_v2 rows store f1_podium_order_1/_2/_3 (per-position picks), but the group
// config above only lists the base 'f1_podium_order' id (that's the single pool_rules /
// ruleset_categories row admins configure) — resolve a prediction's actual category_id to
// whichever id the group config keys off of.
export function groupKeyFor(categoryId: string): string {
  if (categoryId.startsWith('f1_podium_order_')) return 'f1_podium_order'
  return categoryId
}
