import type { Project, Results, BomLine, PricingInput, SiteInput } from './types'
import { fmt, fxOf } from './format'

// Display-currency quotation. The UI (BOM step, results), the PDF and the Excel export must take every money
// figure from here so that qty × unit = line total, Σ lines = subtotal and the grand total agree everywhere.
// All amounts are in the project's display currency (USD × fx), rounded to `decimals` (ISO 4217 minor units:
// USD/SDG/SAR 2, KWD/BHD/OMR/JOD 3, IQD/JPY 0). computeProject derives Results money fields (÷ fx) from the same
// builder, so Results.totalUsd × fx === quote.total.

export interface QuoteLine {
  id: string; category: string; name: string; nameAr?: string; spec: string; specAr?: string; unit: string; qty: number
  unitCost: number; totalCost: number // internal view (wholesale cost)
  unitSell: number; totalSell: number // client view: markup spread into the line price
  source: 'auto' | 'custom'
}
export interface Quote {
  currency: string; fx: number; decimals: number
  lines: QuoteLine[]
  equipmentCost: number; servicesCost: number; costSubtotal: number
  markupPct: number; markup: number; grossMarginPct: number // markup on cost; gross margin = markup / sell
  sellSubtotal: number // Σ totalSell
  discountPct: number; discount: number
  vatPct: number; vat: number
  total: number // sellSubtotal − discount + vat
}

/** Round half away from zero at `d` decimals, robust to binary noise (1.005 → 1.01). */
export const roundTo = (n: number, d: number) => {
  if (!Number.isFinite(n)) return 0
  const k = 10 ** d, x = Number((Math.abs(n) * k).toPrecision(15))
  return (Math.sign(n) * Math.round(x)) / k
}

const decimalsCache = new Map<string, number>()
/** ISO 4217 minor units of a currency code (2 when unknown). */
export function currencyDecimals(code: string): number {
  const c = (code || 'USD').toUpperCase()
  const hit = decimalsCache.get(c); if (hit != null) return hit
  let d = 2
  try { d = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits ?? 2 } catch { d = 2 }
  decimalsCache.set(c, d)
  return d
}
/** Local currency units per USD actually used for display: 1 for USD (whatever is stored), the stored rate when > 0, else 1. */
export const quoteFx = (s: Pick<SiteInput, 'currency' | 'fxRateToUsd'>) => fxOf(s)

const clampPct = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0)
/** Pricing percentages as applied: markup 0–1000 %, discount 0–100 %, VAT 0–100 % (out-of-range inputs are flagged by computeProject). */
export const effectivePercents = (pr: Pick<PricingInput, 'marginPct' | 'discountPct' | 'vatPct'>) => ({
  markupPct: clampPct(pr.marginPct, 0, 1000), discountPct: clampPct(pr.discountPct, 0, 100), vatPct: clampPct(pr.vatPct, 0, 100),
})

/** Quote from a BOM (used by computeProject before Results exist). */
export function buildQuoteFromBom(pricing: Pick<PricingInput, 'marginPct' | 'discountPct' | 'vatPct'>, site: Pick<SiteInput, 'currency' | 'fxRateToUsd'>, bom: BomLine[]): Quote {
  const currency = site.currency || 'USD'
  const fx = quoteFx(site)
  const decimals = currencyDecimals(currency)
  const rd = (n: number) => roundTo(n, decimals)
  const { markupPct, discountPct, vatPct } = effectivePercents(pricing)
  const k = 1 + markupPct / 100
  const lines: QuoteLine[] = bom.map((b) => {
    const unitCost = rd(b.unitPriceUsd * fx)
    const unitSell = rd(unitCost * k)
    return {
      id: b.id, category: b.category, name: b.name, nameAr: b.nameAr, spec: b.spec, specAr: b.specAr, unit: b.unit, qty: b.qty,
      unitCost, totalCost: rd(b.qty * unitCost), unitSell, totalSell: rd(b.qty * unitSell), source: b.source,
    }
  })
  const sum = (xs: number[]) => rd(xs.reduce((a, b) => a + b, 0))
  const servicesCost = sum(lines.filter((l) => l.category === 'Services').map((l) => l.totalCost))
  const equipmentCost = sum(lines.filter((l) => l.category !== 'Services').map((l) => l.totalCost))
  const costSubtotal = rd(equipmentCost + servicesCost)
  const sellSubtotal = sum(lines.map((l) => l.totalSell))
  const markup = rd(sellSubtotal - costSubtotal)
  const discount = rd(sellSubtotal * (discountPct / 100))
  const vat = rd((sellSubtotal - discount) * (vatPct / 100))
  return {
    currency, fx, decimals, lines, equipmentCost, servicesCost, costSubtotal,
    markupPct, markup, grossMarginPct: sellSubtotal > 0 ? (markup / sellSubtotal) * 100 : 0,
    sellSubtotal, discountPct, discount, vatPct, vat, total: rd(sellSubtotal - discount + vat),
  }
}

export function buildQuote(p: Project, r: Results): Quote {
  return buildQuoteFromBom(p.pricing, p.site, r.bom)
}

/** Format an amount that is already in the quote's display currency. */
export const formatQuoteMoney = (v: number, q: Pick<Quote, 'currency' | 'decimals'>, d = q.decimals) =>
  q.currency === 'USD' ? (v < 0 ? '−$' : '$') + fmt(Math.abs(v), d) : (v < 0 ? '−' : '') + fmt(Math.abs(v), d) + ' ' + q.currency
