// Company price list applied to the catalogue. The engine reads products through `cat()` (every product, used for lookups
// by id and for pricing) and `avail()` (products the company stocks, used by the auto-selection). computeProject runs
// inside `withPriceBook()` so the active list is set for exactly one synchronous computation.
import type { Panel, Battery, Inverter, ChargeController, CatalogItem, PriceBook, CustomProducts } from './types'
import { catalog } from '../data/catalog'

export interface ResolvedCatalog {
  panels: Panel[]; batteries: Battery[]; inverters: Inverter[]; chargeControllers: ChargeController[]; items: CatalogItem[]
  /** Products the company stocks (hidden ids removed) — what the auto-selection may pick. */
  avail: { panels: Panel[]; batteries: Battery[]; inverters: Inverter[]; chargeControllers: ChargeController[] }
  /** Ids the company has hidden (not stocked). */
  hidden: Set<string>
  /** Catalogue default unit cost (USD) by id, before the price list — for "list price" hints. */
  basePrice: Map<string, number>
}

export const emptyCustom = (): CustomProducts => ({ panels: [], batteries: [], inverters: [], chargeControllers: [], items: [] })
export const emptyPriceBook = (): PriceBook => ({ prices: {}, hidden: [], custom: emptyCustom() })
/** Ids of the company's own products start with this prefix so they never collide with catalogue ids. */
export const CUSTOM_PREFIX = 'my-'

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])

/** Validate a stored / imported price list (missing parts → empty, bad prices dropped). */
export function normalizePriceBook(x: unknown): PriceBook {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<PriceBook>
  const prices: Record<string, number> = {}
  for (const [k, v] of Object.entries(o.prices && typeof o.prices === 'object' ? o.prices : {})) if (isNum(v) && v >= 0) prices[k] = v
  const c = (o.custom && typeof o.custom === 'object' ? o.custom : {}) as Partial<CustomProducts>
  return {
    prices, hidden: arr<string>(o.hidden).filter((h) => typeof h === 'string'),
    custom: { panels: arr(c.panels), batteries: arr(c.batteries), inverters: arr(c.inverters), chargeControllers: arr(c.chargeControllers), items: arr(c.items) },
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
  }
}

const cache = new WeakMap<PriceBook, ResolvedCatalog>()
let defaultResolved: ResolvedCatalog | null = null

/** Catalogue + company products with the company prices applied (cached per price-list object). */
export function resolveCatalog(book?: PriceBook | null): ResolvedCatalog {
  if (!book) return (defaultResolved ??= build(null))
  let r = cache.get(book)
  if (!r) { r = build(book); cache.set(book, r) }
  return r
}

function build(book: PriceBook | null): ResolvedCatalog {
  const prices = book?.prices ?? {}
  const hidden = new Set(book?.hidden ?? [])
  const custom = book?.custom ?? emptyCustom()
  const basePrice = new Map<string, number>()
  const price = <T extends { id: string; approxPriceUsd: number }>(xs: T[]): T[] => xs.map((x) => {
    basePrice.set(x.id, x.approxPriceUsd)
    const p = prices[x.id]
    return isNum(p) && p >= 0 ? { ...x, approxPriceUsd: p } : x
  })
  // Company products with an id that is already in the catalogue are ignored (catalogue ids are stable)
  const merge = <T extends { id: string; approxPriceUsd: number }>(base: T[], own: T[]) => {
    const ids = new Set(base.map((x) => x.id))
    return price([...base, ...own.filter((x) => x && typeof x.id === 'string' && !ids.has(x.id))])
  }
  const panels = merge(catalog.panels, custom.panels)
  const batteries = merge(catalog.batteries, custom.batteries)
  const inverters = merge(catalog.inverters, custom.inverters)
  const chargeControllers = merge(catalog.chargeControllers, custom.chargeControllers)
  const items = merge(catalog.items, custom.items)
  const vis = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !hidden.has(x.id))
  return { panels, batteries, inverters, chargeControllers, items, avail: { panels: vis(panels), batteries: vis(batteries), inverters: vis(inverters), chargeControllers: vis(chargeControllers) }, hidden, basePrice }
}

let active: ResolvedCatalog = resolveCatalog(null)
/** Products with company prices (lookups by id, pricing). */
export const cat = () => active
/** Products the company stocks (auto-selection). Falls back to every product of a family when the company hid all of them. */
export function avail(): ResolvedCatalog['avail'] {
  const a = active.avail
  return {
    panels: a.panels.length ? a.panels : active.panels, batteries: a.batteries.length ? a.batteries : active.batteries,
    inverters: a.inverters.length ? a.inverters : active.inverters, chargeControllers: a.chargeControllers.length ? a.chargeControllers : active.chargeControllers,
  }
}

/** Run `fn` with the company price list active (synchronous; restores the previous list afterwards). */
export function withPriceBook<T>(book: PriceBook | null | undefined, fn: () => T): T {
  const prev = active
  active = resolveCatalog(book)
  try { return fn() } finally { active = prev }
}
