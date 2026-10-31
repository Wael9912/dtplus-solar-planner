// Fixtures from docs/sizing-methodology.md §13 (worked examples). Tolerances reflect the documented differences in
// derate assumptions (fixtures use fixed 0.70 / 0.7616 / 0.80 derates; the engine multiplies component factors).
import { describe, it, expect } from 'vitest'
import { computeProject, computeLoads, designStrings, sizeCable, fitsSystemVoltage } from '../src/engine/compute'
import { newProject, siteFromLocation, defaultDesign, defaultPricing } from '../src/engine/defaults'
import type { LoadItem, Panel, Inverter } from '../src/engine/types'
import { catalog } from '../src/data/catalog'

const L = (name: string, watts: number, qty: number, hoursPerDay: number, surgeFactor = 1, nightSharePct = 100, phase: 1 | 3 = 1): LoadItem =>
  ({ id: name, name, category: 'x', watts, qty, hoursPerDay, surgeFactor, nightSharePct, phase, critical: true })

const M580: Panel = { id: 'M580', brand: 'Test', model: 'M580', watts: 580, voc: 51.5, vmp: 43, isc: 14, imp: 13.49, efficiencyPct: 22.4, tempCoeffPmaxPctPerC: -0.3, tempCoeffVocPctPerC: -0.25, noct: 45, lengthMm: 2278, widthMm: 1134, weightKg: 27, technology: 'TOPCon', bifacial: false, warrantyYears: 25, approxPriceUsd: 75 }

describe('load analysis (fixture a)', () => {
  const loads = [L('LED', 10, 5, 6), L('Fan', 60, 2, 8, 1.5), L('Fridge', 150, 1, 8, 4), L('TV', 80, 1, 4), L('Router', 10, 1, 22)]
  it('sums energy, peak and surge', () => {
    const r = computeLoads(loads, 1.0)
    expect(r.dailyWh).toBe(3000)
    expect(r.peakW).toBe(420)
    expect(r.surgeW).toBe(870) // 420 + fridge (150×4 − 150)
  })
})

describe('string design (fixture b/c)', () => {
  const inv8k: Inverter = { id: 'i', brand: 'T', model: '8K', type: 'hybrid', phase: 1, ratedAcKw: 8, maxPvInputKw: 10.4, maxPvVoltage: 500, mpptMinV: 150, mpptMaxV: 425, mpptCount: 2, maxInputCurrentPerMppt: 22, batteryVoltage: 48, maxChargeA: 190, surgeKw: 16, efficiencyPct: 97, parallelMax: 16, generatorInput: true, approxPriceUsd: 1000 }
  it('hybrid 10 panels → 2 strings × 5, Voc cold 273.6 V', () => {
    const s = designStrings(M580, inv8k, 1, 10, 0, 45)
    expect(s.panelsPerString).toBe(5)
    expect(s.strings).toBe(2)
    expect(s.vocCold).toBeCloseTo(273.6, 0)
    expect(s.ok).toBe(true)
  })
  it('100 kW string inverter → 18 in series under 1000 V', () => {
    const inv100: Inverter = { ...inv8k, id: 'i100', phase: 3, type: 'gridtie', ratedAcKw: 100, maxPvInputKw: 150, maxPvVoltage: 1000, mpptMinV: 200, mpptMaxV: 1000, mpptCount: 10, maxInputCurrentPerMppt: 30, batteryVoltage: null }
    const s = designStrings(M580, inv100, 1, 207, 0, 45)
    expect(s.panelsPerString).toBeLessThanOrEqual(18)
    expect(s.vocCold).toBeLessThan(1000)
    expect(s.totalPanels).toBeGreaterThanOrEqual(207)
    expect(s.strings).toBeLessThanOrEqual(20)
  })
})

describe('cable sizing', () => {
  it('PV string: 14 A over 12 m at ~86 V → 4 mm² floor, fuse 25 A (1.56×Isc)', () => {
    const c = sizeCable('dc', 14, 12, 86, 3)
    expect(c.sizeMm2).toBe(4)
    expect(c.breakerA).toBe(25)
  })
  it('battery: 177 A → ≥70 mm², fuse ≥ 225 A', () => {
    const c = sizeCable('battery', 177.3, 2, 48, 1.5)
    expect(c.sizeMm2).toBeGreaterThanOrEqual(70)
    expect(c.breakerA).toBeGreaterThanOrEqual(225)
  })
  it('AC single-phase 34.8 A → 50 A MCB, ≤10 mm²', () => {
    const c = sizeCable('ac', 34.8, 15, 230, 2)
    expect(c.breakerA).toBe(50)
    expect(c.sizeMm2).toBeLessThanOrEqual(10)
  })
})

describe('battery voltage matching', () => {
  it('48 V bus accepts 12.8 / 25.6 / 48 / 51.2 V units, rejects HV', () => {
    const b = (v: number) => ({ ...catalog.batteries[0], nominalVoltage: v })
    expect(fitsSystemVoltage(b(12.8), 48)).toBe(true)
    expect(fitsSystemVoltage(b(25.6), 48)).toBe(true)
    expect(fitsSystemVoltage(b(51.2), 48)).toBe(true)
    expect(fitsSystemVoltage(b(48), 48)).toBe(true)
    expect(fitsSystemVoltage(b(409.6), 48)).toBe(false)
    expect(fitsSystemVoltage(b(409.6), 'hv')).toBe(true)
  })
})

describe('end-to-end fixture a: Khartoum off-grid 3 kWh/day', () => {
  const p = newProject({ name: 'a' })
  p.site = { ...siteFromLocation('khartoum'), psh: 6.0, monthlyPsh: Array(12).fill(6.0), tiltGainFactor: 1, recordLowC: 5, ambientHighC: 36, shadingLossPct: 0, soilingLossPct: 3 }
  p.design = { ...defaultDesign('offgrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 1, pvOversize: 1.2, panelId: 'pnl-jinko-580-neo72', batteryId: 'bat-gen-48v100-rack', inverterId: null }
  p.loads = [L('LED', 10, 5, 6), L('Fan', 60, 2, 8, 1.5), L('Fridge', 150, 1, 8, 4), L('TV', 80, 1, 4), L('Router', 10, 1, 22)]
  p.pricing = defaultPricing(0, 0)
  const r = computeProject(p)
  it('requires ~0.7–0.9 kWp and 2 panels', () => {
    expect(r.requiredPvKwp).toBeGreaterThan(0.75)
    expect(r.requiredPvKwp).toBeLessThan(1.0)
    expect(r.panelQty).toBe(2)
  })
  it('battery: 1 × 5.12 kWh unit, required ≈ 3.5–4.0 kWh', () => {
    expect(r.batteryQty).toBe(1)
    expect(r.batteryRequiredKwh).toBeGreaterThan(3.4)
    expect(r.batteryRequiredKwh).toBeLessThan(4.1)
  })
  it('picks a small 48 V inverter and no errors', () => {
    expect(r.inverter).not.toBeNull()
    expect(r.inverter!.ratedAcKw).toBeLessThanOrEqual(5)
    expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
  })
  it('annual production in the 1.6–2.0 MWh range', () => {
    expect(r.annualProductionKwh).toBeGreaterThan(1600)
    expect(r.annualProductionKwh).toBeLessThan(2100)
  })
})

describe('end-to-end fixture b: Riyadh hybrid 25 kWh/day', () => {
  const p = newProject({ name: 'b' })
  p.site = { ...siteFromLocation('riyadh'), psh: 5.8, monthlyPsh: Array(12).fill(5.8), tiltGainFactor: 1, recordLowC: 0, ambientHighC: 44, shadingLossPct: 0, soilingLossPct: 3 }
  p.design = { ...defaultDesign('hybrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 0.8, pvOversize: 1.0, panelId: 'pnl-jinko-580-neo72', batteryId: 'bat-gen-48v100-rack', inverterId: 'inv-deye-8k-sg01lp1' }
  p.loads = [L('AC', 1300, 2, 6, 3, 60), L('Fridge', 200, 1, 10, 4, 60), L('Freezer', 150, 1, 8, 4, 60), L('Washer', 500, 1, 1, 3, 60), L('TV', 100, 1, 5, 1, 60), L('LED', 10, 12, 6, 1, 60), L('Fans', 70, 4, 8, 1.5, 60), L('Router', 10, 1, 24, 1, 60), L('Laptop', 60, 1, 4, 1, 60), L('Pump', 400, 1, 1, 3, 60), L('Microwave', 1200, 1, 0.3, 1.5, 60), L('Kettle', 2000, 1, 0.25, 1, 60), L('Misc', 100, 1, 5, 1, 60)]
  const r = computeProject(p)
  it('loads: 25 kWh/day, 15 kWh night, peak 6176 W, surge 8776 W', () => {
    expect(r.dailyWh).toBeCloseTo(25000, -1)
    expect(r.nightWh).toBeCloseTo(15000, -1)
    expect(r.peakW).toBeCloseTo(6176, 0)
    expect(r.surgeW).toBeCloseTo(8776, 0)
  })
  it('PV ≈ 5.5–6.5 kWp → 10 panels in 2 × 5 strings', () => {
    expect(r.requiredPvKwp).toBeGreaterThan(5.3)
    expect(r.requiredPvKwp).toBeLessThan(6.6)
    expect(r.panelQty).toBe(10)
    expect(r.strings?.strings).toBe(2)
    expect(r.strings?.panelsPerString).toBe(5)
  })
  it('battery 4 × 5.12 kWh (≈19.7 kWh required)', () => {
    expect(r.batteryRequiredKwh).toBeGreaterThan(17)
    expect(r.batteryRequiredKwh).toBeLessThan(21)
    expect(r.batteryQty).toBe(4)
  })
  it('AC breaker 50 A; battery cable ≥ 50 mm²', () => {
    expect(r.cables.find((c) => c.use === 'ac')?.breakerA).toBe(50)
    expect(r.cables.find((c) => c.use === 'battery')?.sizeMm2).toBeGreaterThanOrEqual(50)
  })
  it('BOM has panels, inverter, battery, mounting, protection, services and a positive total', () => {
    const cats = new Set(r.bom.map((b) => b.category))
    for (const c of ['PV Modules', 'Inverter', 'Battery', 'Mounting', 'Cabling', 'Protection', 'Services']) expect(cats.has(c)).toBe(true)
    expect(r.totalUsd).toBeGreaterThan(5000)
  })
})

describe('end-to-end fixture c: 100 kW three-phase grid-tied', () => {
  const p = newProject({ name: 'c' })
  p.site = { ...siteFromLocation('dubai'), psh: 5.5, monthlyPsh: Array(12).fill(5.5), tiltGainFactor: 1, recordLowC: 0, ambientHighC: 42, shadingLossPct: 0, soilingLossPct: 3 }
  p.design = { ...defaultDesign('gridtie'), phase: 3, coincidenceFactor: 1, panelId: 'pnl-jinko-580-neo72', batteryId: null, inverterId: 'inv-huawei-100ktl-m2', panelOverrideQty: null }
  // Demand that needs ~120 kWp at 0.8 derate: 120 × 5.5 × 0.8 = 528 kWh/day
  p.loads = [L('Plant', 22000, 1, 24, 1, 20, 3)]
  const r = computeProject(p)
  it('array ~115–135 kWp, strings ≤ 18 in series, Voc < 1000 V, no errors', () => {
    expect(r.arrayKwp).toBeGreaterThan(110)
    expect(r.arrayKwp).toBeLessThan(140)
    expect(r.strings!.panelsPerString).toBeLessThanOrEqual(18)
    expect(r.strings!.vocCold).toBeLessThan(1000)
    expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
  })
  it('AC: ~144 A per inverter → 200 A MCCB; specific yield 1500–1700 kWh/kWp', () => {
    expect(r.cables.find((c) => c.use === 'ac')?.breakerA).toBe(200)
    expect(r.specificYield).toBeGreaterThan(1450)
    expect(r.specificYield).toBeLessThan(1750)
  })
})

describe('catalog sanity', () => {
  it('every inverter with MPPTs has a usable voltage window and current', () => {
    for (const i of catalog.inverters.filter((x) => x.mpptCount > 0)) {
      expect(i.maxPvVoltage, i.id).toBeGreaterThan(0); expect(i.mpptMaxV, i.id).toBeGreaterThan(i.mpptMinV); expect(i.maxInputCurrentPerMppt, i.id).toBeGreaterThan(0)
    }
  })
  it('700 W+ modules are flagged against 13 A MPPT inverters', () => {
    const p = newProject({ name: 'isc' })
    p.design = { ...defaultDesign('hybrid'), panelId: 'pnl-cs-720-topbihiku7', inverterId: 'inv-deye-5k-sg03lp1', batteryId: 'auto' }
    p.loads = [L('x', 1000, 1, 10)]
    expect(computeProject(p).checks.some((c) => c.id === 'isc-mppt')).toBe(true)
  })
})
