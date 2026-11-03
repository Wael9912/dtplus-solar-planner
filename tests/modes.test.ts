// v0.2 flexibility: project modes (full design / known size / product list), demand from the bill, fixed sizes, backup-only,
// existing equipment, outage-hours economics and the company price list (methodology §16).
import { describe, it, expect } from 'vitest'
import { computeProject } from '../src/engine/compute'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, modeDefaults } from '../src/engine/defaults'
import { buildQuote } from '../src/engine/quote'
import { defaultSizing, resolveSizing, demandFromBill } from '../src/engine/sizing'
import { emptyPriceBook, resolveCatalog, normalizePriceBook } from '../src/engine/catalogContext'
import { normalizeProject } from '../src/store/useAppStore'
import { catalog } from '../src/data/catalog'
import { sampleProjects } from '../src/data/samples'
import type { LoadItem, Panel, PriceBook, Project, Results, SystemType } from '../src/engine/types'

const L = (name: string, watts: number, qty: number, h: number, sf = 1, night = 50): LoadItem =>
  ({ id: name, name, category: 'x', watts, qty, hoursPerDay: h, surgeFactor: sf, nightSharePct: night, phase: 1, critical: true })
const check = (r: Results, id: string) => r.checks.find((c) => c.id === id)
const bomQty = (r: Results, id: string) => r.bom.find((b) => b.id === id)?.qty
const noNaN = (r: Results) => JSON.stringify(r, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `BAD:${v}` : v)).includes('BAD:') === false
const sized = (type: SystemType, targets: Partial<NonNullable<Project['sizing']>['targets']> = {}, f?: (p: Project) => void) => {
  const p = newProject({ name: 's', ...modeDefaults('size', type) })
  p.design = defaultDesign(type); p.site = siteFromLocation('khartoum'); p.pricing = defaultPricing(20, 0)
  p.sizing = { ...p.sizing!, targets: { ...p.sizing!.targets, ...targets } }
  f?.(p)
  return p
}

describe('mode "size": price a system the client already chose, no load list', () => {
  it('default 5 kWp · 5 kW · 10 kWh hybrid is priced with no loads and no "no-loads" error', () => {
    const p = sized('hybrid')
    const r = computeProject(p)
    expect(r.mode).toBe('size'); expect(r.demand).toBe('none')
    expect(r.arrayKwp).toBeGreaterThanOrEqual(5); expect(r.arrayKwp).toBeLessThan(6.5)
    expect(r.inverterTotalKw).toBeGreaterThanOrEqual(5)
    expect(r.batteryKwh).toBeGreaterThanOrEqual(10); expect(r.batteryKwh).toBeLessThan(16)
    expect(check(r, 'no-loads')).toBeUndefined()
    expect(r.totalUsd).toBeGreaterThan(2000)
    expect(r.annualSavingsUsd).toBeGreaterThan(0) // assumes the solar energy is used on site
    expect(check(r, 'savings-assumed')?.level).toBe('ok')
    expect(noNaN(r)).toBe(true)
  })
  it('loads left in the project are ignored in size mode', () => {
    const a = computeProject(sized('hybrid'))
    const b = computeProject(sized('hybrid', {}, (p) => { p.loads = [L('ac', 2000, 4, 10, 3)] }))
    expect(b.dailyWh).toBe(0); expect(b.totalUsd).toBeCloseTo(a.totalUsd, 6)
  })
  it('grid-tied 10 kWp: no battery, inverter follows the array', () => {
    const r = computeProject(sized('gridtie', { pvKwp: 10, inverterKw: null, batteryKwh: null }))
    expect(r.battery).toBeNull(); expect(r.arrayKwp).toBeGreaterThanOrEqual(10)
    expect(r.inverterTotalKw).toBeGreaterThanOrEqual(10 / 1.3 - 1e-9)
  })
  it('backup only (pvKwp 0): no panels, no strings, no mounting or PV DC parts, labour per inverter kW, no NaN', () => {
    const r = computeProject(sized('hybrid', { pvKwp: 0, inverterKw: 5, batteryKwh: 10 }))
    expect(r.panelQty).toBe(0); expect(r.arrayKwp).toBe(0); expect(r.strings).toBeNull()
    expect(r.annualProductionKwh).toBe(0)
    for (const id of ['rail', 'mid-clamp', 'end-clamp', 'mc4-pair', 'earth-clip', r.panel.id]) expect(bomQty(r, id), id).toBeUndefined()
    expect(r.bom.some((b) => b.id.startsWith('dc-cable') || b.id.startsWith('dc-isolator') || b.id.startsWith('spd-dc'))).toBe(false)
    const labour = r.bom.find((b) => b.id === 'labour')!
    expect(labour.unit).toBe('kW'); expect(labour.qty).toBeGreaterThanOrEqual(5)
    expect(r.batteryKwh).toBeGreaterThanOrEqual(10); expect(r.inverter).not.toBeNull()
    expect(r.paybackYears).toBeNull()
    expect(noNaN(r)).toBe(true)
  })
  it('battery 0 on a hybrid = no battery, noted not flagged', () => {
    const r = computeProject(sized('hybrid', { batteryKwh: 0 }))
    expect(r.battery).toBeNull(); expect(check(r, 'no-batt')?.level).toBe('ok')
  })
  it('inverter target below the array still prices; a manual inverter is honoured', () => {
    const inv = catalog.inverters.find((i) => i.type === 'hybrid' && i.phase === 1 && i.batteryVoltage === 48)!
    const r = computeProject(sized('hybrid', {}, (p) => { p.design.inverterId = inv.id }))
    expect(r.inverter?.id).toBe(inv.id)
  })
})

describe('demand from the electricity bill', () => {
  it('450 kWh/month residential → 14.8 kWh/day, 45 % night, peak ≈ 3.5 × average', () => {
    const d = demandFromBill({ monthlyKwh: 450, profile: 'residential', peakKw: null, largestMotorKw: null })
    expect(d.dailyWh).toBeCloseTo(450000 / 30.4, 6)
    expect(d.nightWh / d.dailyWh).toBeCloseTo(0.45, 9)
    expect(d.peakW).toBeCloseTo((d.dailyWh / 24) * 3.5, 6)
  })
  it('a motor raises the surge (3 × start) and the peak floor', () => {
    const d = demandFromBill({ monthlyKwh: 300, profile: 'daytime', peakKw: 4, largestMotorKw: 5.5 })
    expect(d.peakW).toBe(5500); expect(d.surgeW).toBe(4000 + 5500 * 2)
  })
  it('grid-tied design sized from a bill: no appliance list, sensible array, savings > 0', () => {
    const p = newProject({ name: 'bill' })
    p.design = defaultDesign('gridtie'); p.site = siteFromLocation('khartoum')
    p.sizing = { ...defaultSizing(), demand: 'bill', bill: { monthlyKwh: 450, profile: 'residential', peakKw: null, largestMotorKw: null } }
    const r = computeProject(p)
    expect(r.demand).toBe('bill'); expect(r.dailyWh).toBeCloseTo(14803, 0)
    expect(r.arrayKwp).toBeGreaterThan(2.5); expect(r.arrayKwp).toBeLessThan(5)
    expect(check(r, 'no-loads')).toBeUndefined(); expect(r.annualSavingsUsd).toBeGreaterThan(0)
  })
  it('bill demand with 0 kWh asks for the consumption', () => {
    const p = newProject({ name: 'bill0' })
    p.sizing = { ...defaultSizing(), demand: 'bill' }
    expect(check(computeProject(p), 'no-loads')?.level).toBe('error')
  })
})

describe('mode "items": a priced product list, no design', () => {
  const items = (lines: Project['pricing']['customItems']) => {
    const p = newProject({ name: 'counter', ...modeDefaults('items') })
    p.pricing = { ...defaultPricing(10, 5), labourPerKwUsd: 0, transportUsd: 0, commissioningUsd: 0, customItems: lines }
    return p
  }
  it('only the chosen lines are quoted; money chain identical to a design quote', () => {
    const p = items([
      { id: 'a', category: 'PV Modules', name: 'Panel', spec: '', unit: 'pcs', qty: 6, unitPriceUsd: 100, totalUsd: 0, source: 'custom', ref: catalog.panels[0].id },
      { id: 'b', category: 'Battery', name: 'Battery', spec: '', unit: 'pcs', qty: 1, unitPriceUsd: 900, totalUsd: 0, source: 'custom' },
    ])
    const r = computeProject(p), q = buildQuote(p, r)
    expect(r.mode).toBe('items'); expect(r.bom).toHaveLength(2)
    expect(q.costSubtotal).toBe(1500); expect(q.sellSubtotal).toBe(1650); expect(q.total).toBeCloseTo(1732.5, 6)
    expect(r.totalUsd).toBeCloseTo(q.total, 6)
    expect(r.panelQty).toBe(0); expect(r.inverter).toBeNull(); expect(noNaN(r)).toBe(true)
  })
  it('empty list → "no-items" error; excluded lines are not quoted', () => {
    expect(check(computeProject(items([])), 'no-items')?.level).toBe('error')
    const p = items([{ id: 'a', category: 'Custom', name: 'X', spec: '', unit: 'pcs', qty: 2, unitPriceUsd: 50, totalUsd: 0, source: 'custom' }])
    p.pricing.excludedIds = ['a']
    expect(computeProject(p).bom).toHaveLength(0)
  })
})

describe('equipment already on site (expansion)', () => {
  it('existing batteries / inverter / panels are designed but not quoted', () => {
    const p = sized('hybrid', { pvKwp: 5, inverterKw: 5, batteryKwh: 20 })
    const base = computeProject(p)
    expect(base.batteryQty).toBeGreaterThanOrEqual(2)
    p.sizing = { ...p.sizing!, existing: { panels: 4, batteries: 1, inverters: 1 } }
    const r = computeProject(p)
    expect(r.batteryQty).toBe(base.batteryQty); expect(r.panelQty).toBe(base.panelQty)
    expect(bomQty(r, r.battery!.id)).toBe(base.batteryQty - 1)
    expect(bomQty(r, r.panel.id)).toBe(base.panelQty - 4)
    expect(bomQty(r, r.inverter!.id)).toBeUndefined() // the only inverter is existing
    expect(r.bom.find((b) => b.id === r.battery!.id)?.existingQty).toBe(1)
    expect(r.totalUsd).toBeLessThan(base.totalUsd)
    expect(bomQty(r, 'end-clamp')).toBeLessThanOrEqual(bomQty(base, 'end-clamp')!)
  })
  it('more existing units than designed → warning, deduction capped', () => {
    const p = sized('hybrid', {}, (q) => { q.sizing = { ...q.sizing!, existing: { panels: 0, batteries: 99, inverters: 0 } } })
    const r = computeProject(p)
    expect(check(r, 'existing-batteries')?.level).toBe('warn')
    expect(bomQty(r, r.battery!.id)).toBeUndefined()
  })
})

describe('hybrid with daily outages: outage energy is valued at the diesel cost', () => {
  it('8 h/day outages raise the avoided cost and the savings', () => {
    const [, , pharmacy] = sampleProjects()
    const base = computeProject(pharmacy)
    const out = computeProject({ ...pharmacy, site: { ...pharmacy.site, outageHoursPerDay: 8 } })
    expect(out.avoidedCostUsdPerKwh).toBeCloseTo(pharmacy.site.gridTariff * (16 / 24) + (pharmacy.site.dieselCostUsdPerKwh ?? 0.4) * (8 / 24), 9)
    expect(out.annualSavingsUsd).toBeGreaterThan(base.annualSavingsUsd)
  })
})

describe('engine guards', () => {
  it('an unknown product id raises an error instead of a silent swap', () => {
    const p = sampleProjects()[0]
    const r = computeProject({ ...p, design: { ...p.design, panelId: 'deleted-panel', inverterId: 'deleted-inv' } })
    expect(check(r, 'unknown-panel')?.level).toBe('error'); expect(check(r, 'unknown-inverter')?.level).toBe('error')
    expect(r.inverter).not.toBeNull()
  })
  it('auto-selection stacks inverters instead of overloading one unit with PV', () => {
    const p = sized('offgrid', { pvKwp: 24, inverterKw: 10, batteryKwh: 30 })
    const r = computeProject(p)
    expect(check(r, 'pv-input')).toBeUndefined()
    expect(r.inverter!.maxPvInputKw * r.inverterQty * 1.05).toBeGreaterThanOrEqual(r.arrayKwp)
  })
  it('battery parallel count far above the limit is an error', () => {
    const b = catalog.batteries.find((x) => x.parallelMax <= 4 && x.nominalVoltage === 51.2)!
    const p = sized('offgrid', { batteryKwh: b.energyKwh * b.parallelMax * 3 }, (q) => { q.design.batteryId = b.id })
    expect(check(computeProject(p), 'batt-parallel')?.level).toBe('error')
  })
  it('resolveSizing drops negatives and keeps 0 = none for PV / battery', () => {
    const s = resolveSizing({ sizing: { ...defaultSizing(), targets: { pvKwp: 0, batteryKwh: -3, inverterKw: 0 }, existing: { panels: -2, batteries: 1.6, inverters: Number.NaN } } })
    expect(s.targets).toEqual({ pvKwp: 0, batteryKwh: null, inverterKw: null })
    expect(s.existing).toEqual({ panels: 0, batteries: 2, inverters: 0 })
  })
  it('projects saved before v0.2 compute exactly as before (design mode, load demand)', () => {
    for (const p of sampleProjects()) {
      const legacy = { ...p } as Partial<Project>; delete legacy.mode; delete legacy.sizing
      expect(computeProject(legacy as Project).totalUsd).toBeCloseTo(computeProject(p).totalUsd, 9)
    }
  })
})

describe('company price list', () => {
  const book = (f: (b: PriceBook) => void) => { const b = emptyPriceBook(); f(b); return b }
  it('a company price replaces the catalogue price in the BOM and the total', () => {
    const p = sampleProjects()[0]
    const r0 = computeProject(p)
    const inv = r0.inverter!
    const r1 = computeProject(p, book((b) => { b.prices[inv.id] = inv.approxPriceUsd + 500 }))
    expect(r1.bom.find((l) => l.id === inv.id)!.unitPriceUsd).toBe(inv.approxPriceUsd + 500)
    expect(r1.totalUsd).toBeGreaterThan(r0.totalUsd)
    // per-project override still wins
    const p2 = { ...p, pricing: { ...p.pricing, priceOverrides: { [inv.id]: 1 } } }
    expect(computeProject(p2, book((b) => { b.prices[inv.id] = 9999 })).bom.find((l) => l.id === inv.id)!.unitPriceUsd).toBe(1)
  })
  it('hidden (not stocked) products are never auto-selected; a hidden manual pick still works with a warning', () => {
    const p = sampleProjects()[0]
    const auto = computeProject(p).inverter!
    const r = computeProject({ ...p, design: { ...p.design, inverterId: null } }, book((b) => { b.hidden.push(auto.id) }))
    expect(r.inverter!.id).not.toBe(auto.id)
    const m = computeProject({ ...p, design: { ...p.design, inverterId: auto.id, inverterQty: 1 } }, book((b) => { b.hidden.push(auto.id) }))
    expect(m.inverter!.id).toBe(auto.id); expect(check(m, `not-stocked-${auto.id}`)?.level).toBe('warn')
  })
  it("the company's own panel is usable by id in a design and priced from the list", () => {
    const mine: Panel = { ...catalog.panels.find((x) => x.watts >= 550)!, id: 'my-panel-1', brand: 'Acme', model: 'X600', watts: 600, approxPriceUsd: 77 }
    const b = book((x) => { x.custom.panels.push(mine) })
    expect(resolveCatalog(b).panels.some((x) => x.id === 'my-panel-1')).toBe(true)
    const p = sampleProjects()[0]
    const r = computeProject({ ...p, design: { ...p.design, panelId: 'my-panel-1' } }, b)
    expect(r.panel.id).toBe('my-panel-1'); expect(check(r, 'unknown-panel')).toBeUndefined()
    expect(r.bom.find((l) => l.id === 'my-panel-1')!.unitPriceUsd).toBe(77)
    // the same project without the price list flags the missing product instead of swapping silently
    expect(check(computeProject({ ...p, design: { ...p.design, panelId: 'my-panel-1' } }), 'unknown-panel')?.level).toBe('error')
  })
  it('normalizePriceBook drops bad prices and fills missing parts', () => {
    const b = normalizePriceBook({ prices: { a: 5, b: -1, c: 'x', d: Number.NaN }, hidden: ['z', 3] })
    expect(b.prices).toEqual({ a: 5 }); expect(b.hidden).toEqual(['z']); expect(b.custom.panels).toEqual([])
  })
})

describe('project import (normalizeProject)', () => {
  it('accepts a product-list project without loads and fills sizing defaults', () => {
    const p = normalizeProject({ mode: 'items', design: {}, site: {}, pricing: { customItems: [] } })!
    expect(p.mode).toBe('items'); expect(p.loads).toEqual([]); expect(p.sizing?.demand).toBe('loads')
  })
  it('still rejects a design project without a load array, and keeps the "lost" status', () => {
    expect(normalizeProject({ design: {}, site: {} })).toBeNull()
    expect(normalizeProject({ ...sampleProjects()[0], status: 'lost' })!.status).toBe('lost')
  })
})
