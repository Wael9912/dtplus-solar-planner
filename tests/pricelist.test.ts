// Company price list in the store: prices, stock, own products, company file and full backup round trips.
// The store is persisted with zustand `persist`; vitest runs in node without localStorage, so persist works in memory only.
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, type CompanyBundle, type Backup } from '../src/store/useAppStore'
import { resolveCatalog, emptyPriceBook } from '../src/engine/catalogContext'
import { computeProject } from '../src/engine/compute'
import { catalog } from '../src/data/catalog'
import type { Panel, CatalogItem } from '../src/engine/types'

const S = () => useAppStore.getState()
const initial = useAppStore.getState()
beforeEach(() => useAppStore.setState({ ...initial, projects: [], company: { ...initial.company, priceBook: emptyPriceBook() } }, true))

const panel = catalog.panels.find((p) => p.watts >= 500) ?? catalog.panels[catalog.panels.length - 1]
const myPanel: Panel = { ...panel, id: 'my-panel-test1', brand: 'Acme', model: 'AC-600', watts: 600, approxPriceUsd: 99 }
const myItem: CatalogItem = { id: 'my-item-test1', name: 'Cable tray', category: 'Mounting', unit: 'm', approxPriceUsd: 3.5 }

describe('store without localStorage', () => {
  it('runs in memory (persist does not throw when storage is missing)', () => {
    S().setCompany({ name: 'X' })
    expect(S().company.name).toBe('X')
  })
})

describe('setPrice / setHidden', () => {
  it('stores a USD price, stamps updatedAt and resets with null; bad values reset too', () => {
    expect(S().company.priceBook.updatedAt).toBeUndefined()
    S().setPrice(panel.id, 123.45)
    expect(S().company.priceBook.prices[panel.id]).toBe(123.45)
    expect(S().company.priceBook.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(resolveCatalog(S().company.priceBook).panels.find((p) => p.id === panel.id)?.approxPriceUsd).toBe(123.45)
    expect(resolveCatalog(S().company.priceBook).basePrice.get(panel.id)).toBe(panel.approxPriceUsd)
    S().setPrice(panel.id, null)
    expect(panel.id in S().company.priceBook.prices).toBe(false)
    S().setPrice(panel.id, -5); S().setPrice('x', Number.NaN)
    expect(S().company.priceBook.prices).toEqual({})
  })
  it('hides and unhides idempotently; hidden products leave the auto-selection pool only', () => {
    S().setHidden(panel.id, true); S().setHidden(panel.id, true)
    expect(S().company.priceBook.hidden).toEqual([panel.id])
    const r = resolveCatalog(S().company.priceBook)
    expect(r.avail.panels.some((p) => p.id === panel.id)).toBe(false)
    expect(r.panels.some((p) => p.id === panel.id)).toBe(true)
    S().setHidden(panel.id, false)
    expect(S().company.priceBook.hidden).toEqual([])
  })
  it('a company price flows into a new project quote', () => {
    const p = S().createProject({}, 'size')
    const base = computeProject(p, S().company.priceBook)
    const used = base.panel.id
    S().setPrice(used, base.panel.approxPriceUsd * 2)
    const after = computeProject(p, S().company.priceBook)
    expect(after.panel.id).toBe(used)
    expect(after.equipmentCostUsd).toBeGreaterThan(base.equipmentCostUsd)
  })
})

describe('own products', () => {
  it('upsert adds then updates in place; the product joins the catalogue', () => {
    S().upsertProduct('panels', myPanel)
    S().upsertProduct('panels', { ...myPanel, approxPriceUsd: 101 })
    expect(S().company.priceBook.custom.panels).toHaveLength(1)
    expect(S().company.priceBook.custom.panels[0].approxPriceUsd).toBe(101)
    const r = resolveCatalog(S().company.priceBook)
    expect(r.panels.find((p) => p.id === myPanel.id)?.watts).toBe(600)
    expect(r.avail.panels.some((p) => p.id === myPanel.id)).toBe(true)
  })
  it('remove clears the product with its price and stock flag; a project using it raises unknown-panel', () => {
    S().upsertProduct('panels', myPanel)
    S().upsertProduct('items', myItem)
    S().setPrice(myPanel.id, 80); S().setHidden(myPanel.id, true)
    const p = S().createProject()
    S().updateProject(p.id, (x) => ({ design: { ...x.design, panelId: myPanel.id } }))
    const proj = () => S().projects.find((x) => x.id === p.id)!
    expect(computeProject(proj(), S().company.priceBook).panel.id).toBe(myPanel.id)
    S().removeProduct('panels', myPanel.id)
    const b = S().company.priceBook
    expect(b.custom.panels).toHaveLength(0)
    expect(b.custom.items).toHaveLength(1)
    expect(myPanel.id in b.prices).toBe(false)
    expect(b.hidden.includes(myPanel.id)).toBe(false)
    const r = computeProject(proj(), b)
    expect(r.checks.some((c) => c.id === 'unknown-panel' && c.level === 'error')).toBe(true)
  })
  it('an own product whose id collides with a catalogue id is ignored by the catalogue', () => {
    S().upsertProduct('panels', { ...myPanel, id: panel.id, brand: 'Clash' })
    expect(resolveCatalog(S().company.priceBook).panels.filter((p) => p.id === panel.id).map((p) => p.brand)).toEqual([panel.brand])
  })
})

describe('company file and backup', () => {
  it('company file round trip restores settings, quote defaults and the price list', () => {
    S().setCompany({ name: 'Nile Solar', currency: 'SDG', fxRateToUsd: 2600, labourPerKwUsd: 90, transportUsd: 40, commissioningUsd: 60, defaultSystemType: 'offgrid', defaultPhase: 3 })
    S().setPrice(panel.id, 77); S().setHidden(catalog.inverters[0].id, true); S().upsertProduct('panels', myPanel); S().upsertProduct('items', myItem)
    const file = JSON.parse(JSON.stringify(S().exportCompany())) as CompanyBundle
    expect(file.kind).toBe('dtplus-company')
    useAppStore.setState({ ...initial, company: { ...initial.company, priceBook: emptyPriceBook() } }, true)
    expect(S().company.name).not.toBe('Nile Solar')
    expect(S().importCompany(file)).toBe(true)
    const c = S().company
    expect(c).toMatchObject({ name: 'Nile Solar', currency: 'SDG', fxRateToUsd: 2600, labourPerKwUsd: 90, transportUsd: 40, commissioningUsd: 60, defaultSystemType: 'offgrid', defaultPhase: 3 })
    expect(c.priceBook.prices[panel.id]).toBe(77)
    expect(c.priceBook.hidden).toEqual([catalog.inverters[0].id])
    expect(c.priceBook.custom.panels.map((p) => p.id)).toEqual([myPanel.id])
    expect(c.priceBook.custom.items.map((p) => p.id)).toEqual([myItem.id])
    // New projects take the imported defaults
    const p = S().createProject()
    expect(p.design.systemType).toBe('offgrid'); expect(p.design.phase).toBe(3)
    expect(p.pricing).toMatchObject({ labourPerKwUsd: 90, transportUsd: 40, commissioningUsd: 60 })
    expect(p.site).toMatchObject({ currency: 'SDG', fxRateToUsd: 2600 })
  })
  it('rejects files that are not company files and drops values of the wrong type', () => {
    const before = S().company
    expect(S().importCompany(null)).toBe(false)
    expect(S().importCompany({ kind: 'dtplus-backup', company: {} })).toBe(false)
    expect(S().importCompany({ kind: 'dtplus-company' })).toBe(false)
    expect(S().company).toBe(before)
    expect(S().importCompany({ kind: 'dtplus-company', version: 1, company: { name: 42, marginPct: 'x', vatPct: 5, defaultPhase: 2, priceBook: { prices: { a: 10, b: -1, c: 'x' }, hidden: [1, 'h'] }, logoDataUrl: 'javascript:alert(1)' } })).toBe(true)
    const c = S().company
    expect(c.name).toBe(before.name); expect(c.marginPct).toBe(before.marginPct); expect(c.vatPct).toBe(5); expect(c.defaultPhase).toBe(before.defaultPhase)
    expect(c.logoDataUrl).toBeNull()
    expect(c.priceBook.prices).toEqual({ a: 10 }); expect(c.priceBook.hidden).toEqual(['h'])
  })
  it('full backup restores the company and adds the projects (clashing ids get new ids)', () => {
    S().setCompany({ name: 'Backup Co' }); S().setPrice(panel.id, 66)
    const a = S().createProject({ name: 'A' }), b = S().createProject({ name: 'B' }, 'items')
    const backup = JSON.parse(JSON.stringify(S().exportBackup())) as Backup
    expect(backup.kind).toBe('dtplus-backup'); expect(backup.projects).toHaveLength(2)
    useAppStore.setState({ ...initial, projects: [], company: { ...initial.company, priceBook: emptyPriceBook() } }, true)
    const r = S().importBackup(backup)
    expect(r).toEqual({ company: true, projects: 2 })
    expect(S().company.name).toBe('Backup Co'); expect(S().company.priceBook.prices[panel.id]).toBe(66)
    expect(S().projects.map((p) => p.name).sort()).toEqual(['A', 'B'])
    expect(S().projects.map((p) => p.id).sort()).toEqual([a.id, b.id].sort())
    // Restoring the same backup again keeps both copies apart
    expect(S().importBackup(backup)).toEqual({ company: true, projects: 2 })
    expect(new Set(S().projects.map((p) => p.id)).size).toBe(4)
  })
  it('restore accepts a company file and rejects anything else', () => {
    S().setCompany({ name: 'Only Company' })
    const file = S().exportCompany()
    useAppStore.setState({ ...initial, company: { ...initial.company, priceBook: emptyPriceBook() } }, true)
    expect(S().importBackup(file)).toEqual({ company: true, projects: 0 })
    expect(S().company.name).toBe('Only Company')
    expect(S().importBackup({ kind: 'something' })).toBeNull()
    expect(S().importBackup([1, 2])).toBeNull()
    expect(S().importBackup({ kind: 'dtplus-backup', projects: [{ nope: 1 }] })).toBeNull()
  })
})
