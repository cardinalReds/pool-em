// Sport values as they appear in pools.sport / tournaments.sport / user_sport_interests.sport.
export const SPORT_ORDER = ['soccer', 'world_cup', 'nfl', 'f1', 'mma']

export const SPORT_META: Record<string, { emoji: string; label: string }> = {
  soccer: { emoji: '⚽', label: 'Premier League' },
  world_cup: { emoji: '⚽', label: 'World Cup' },
  nfl: { emoji: '🏈', label: 'NFL' },
  f1: { emoji: '🏎', label: 'Formula 1' },
  mma: { emoji: '🥊', label: 'MMA' },
}

export function sportLabel(sport: string): string {
  return SPORT_META[sport]?.label || sport
}
