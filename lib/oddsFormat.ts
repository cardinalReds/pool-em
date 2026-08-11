export type OddsFormat = 'decimal' | 'american' | 'fractional'

// All odds are stored as decimal (e.g. 1.73) — this only changes how they're displayed.
export function formatOdds(decimal: number, format: OddsFormat): string {
  if (format === 'american') {
    const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1)
    const rounded = Math.round(american)
    return rounded > 0 ? `+${rounded}` : `${rounded}`
  }
  if (format === 'fractional') {
    const numerator = Math.round((decimal - 1) * 100)
    const denominator = 100
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(numerator, denominator) || 1
    return `${numerator / divisor}/${denominator / divisor}`
  }
  return decimal.toFixed(2)
}
