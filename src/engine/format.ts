export const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–')
export const fmtK = (n: number) => (Math.abs(n) >= 1000 ? fmt(n / 1000, 2) + ' k' : fmt(n, 0) + ' ')
export const money = (usd: number, currency = 'USD', fx = 1, d = 0) => {
  const v = usd * fx
  if (currency === 'USD') return '$' + fmt(v, d)
  return fmt(v, d) + ' ' + currency
}
export const pct = (x: number, d = 0) => fmt(x * 100, d) + '%'
