import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { computeProject } from '../engine/compute'
import { buildQuote } from '../engine/quote'
import { resolveCatalog } from '../engine/catalogContext'
import type { Project } from '../engine/types'

/** The company price list (prices, hidden products, own products) every computation must use. */
export const usePriceBook = () => useAppStore((s) => s.company.priceBook)
/** Catalogue with the company prices and products applied — use for every product picker (`avail` = stocked only). */
export function useCatalog() {
  const book = usePriceBook()
  return useMemo(() => resolveCatalog(book), [book])
}
/** Results + quote of a project with the company price list applied (memoised on the project and the list). */
export function useComputed(p: Project | null) {
  const book = usePriceBook()
  const results = useMemo(() => (p ? computeProject(p, book) : null), [p, book])
  const quote = useMemo(() => (p && results ? buildQuote(p, results) : null), [p, results])
  return { results, quote, book }
}
