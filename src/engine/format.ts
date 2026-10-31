export const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–')
export const fmtK = (n: number) => (Math.abs(n) >= 1000 ? fmt(n / 1000, 2) + ' k' : fmt(n, 0) + ' ')
/** Local currency units per USD actually applied: 1 for USD (whatever rate is stored), the stored rate when > 0, else 1. */
export const fxOf = (s: { currency?: string; fxRateToUsd: number }) =>
  (s.currency || 'USD') === 'USD' ? 1 : Number.isFinite(s.fxRateToUsd) && s.fxRateToUsd > 0 ? s.fxRateToUsd : 1
export const money = (usd: number, currency = 'USD', fx = 1, d = 0) => {
  const v = usd * fxOf({ currency, fxRateToUsd: fx })
  if (currency === 'USD') return '$' + fmt(v, d)
  return fmt(v, d) + ' ' + currency
}
export const pct = (x: number, d = 0) => fmt(x * 100, d) + '%'
