// Sport values as they appear in pools.sport / tournaments.sport. World Cup and Premier
// League pools both store their picks against ruleset_categories with sport='soccer' (the
// category definitions are shared across soccer competitions) — 'world_cup' only exists as
// a pools.sport value, never as its own tracked "sport". canonicalSport() collapses it so
// interest-tracking and any other per-sport bucketing treats them as one sport.
export function canonicalSport(sport: string): string {
  return sport === 'world_cup' ? 'soccer' : sport
}

export const SPORT_ORDER = ['soccer', 'nfl', 'f1', 'mma']

export const SPORT_META: Record<string, { emoji: string; label: string }> = {
  soccer: { emoji: '⚽', label: 'Soccer' },
  nfl: { emoji: '🏈', label: 'NFL' },
  f1: { emoji: '🏎', label: 'Formula 1' },
  mma: { emoji: '🥊', label: 'MMA' },
}

export function sportLabel(sport: string): string {
  const canonical = canonicalSport(sport)
  return SPORT_META[canonical]?.label || canonical
}
