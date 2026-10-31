// The bundled sample projects must compute cleanly (no error-level checks) — they are the client's first impression.
import { describe, it, expect } from 'vitest'
import { computeProject } from '../src/engine/compute'
import { buildQuote } from '../src/engine/quote'
import { sampleProjects } from '../src/data/samples'

describe('sample projects', () => {
  for (const p of sampleProjects()) {
    it(`${p.name} computes without errors`, () => {
      const r = computeProject(p)
      const line = `${p.name} | ${r.arrayKwp.toFixed(1)} kWp | ${r.inverterQty} × ${r.inverter?.model ?? '-'} | ${r.batteryKwh.toFixed(1)} kWh | $${Math.round(r.totalUsd)} | ${r.checks.map((c) => `${c.level}:${c.id}`).join(' ')}`
      console.log(line)
      expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
      expect(r.totalUsd).toBeGreaterThan(0)
      expect(Number.isFinite(r.paybackYears ?? 0)).toBe(true)
      expect(r.totalUsd * buildQuote(p, r).fx).toBeCloseTo(buildQuote(p, r).total, 6)
    })
  }
})

// Key figures recomputed by hand from the templates (src/data/samples.ts), the catalogue and methodology §1–§10.
describe('sample key figures (hand-computed)', () => {
  const [riyadh, farm, pharmacy, dubai] = sampleProjects().map((p) => ({ p, r: computeProject(p) }))

  it('Riyadh villa (hybrid, 12 lines → DF 0.8)', () => {
    const { r } = riyadh
    // E: LED 720 + fans 2 240 + 2 AC × 1 300 × 8 h 20 800 + fridge 1 800 + freezer 2 500 + TV 750 + washer 500 + pump 1 000 W × 2 h 2 000
    //    + router 240 + laptops 720 + microwave 600 + iron 600 = 33 470 Wh
    expect(r.dailyWh).toBe(33470)
    // night: 648 + 1 344 + 14 560 (AC 70 %) + 900 + 1 250 + 450 + 150 + 400 + 144 + 432 + 240 + 180 = 20 698 Wh
    expect(r.nightWh).toBeCloseTo(20698, 9)
    // connected 7 630 W × 0.8 = 6 104 W ; surge + surface pump 1 000 × (3 − 1) = 8 104 W ; inverter 6 104 × 1.25 = 7.63 kW → Deye 8K
    expect(r.connectedW).toBe(7630)
    expect(r.peakW).toBeCloseTo(6104, 9)
    expect(r.surgeW).toBeCloseTo(8104, 9)
    expect(r.requiredInverterKw).toBeCloseTo(7.63, 9)
    expect(r.inverter?.id).toBe('inv-deye-8k-sg01lp1')
    // bank 20 698 / 0.95 / 0.9 = 24.21 kWh → cheapest: 5 × 5.12 kWh rack ($3 450) ; autonomy 23.04 × 0.95 / 20.698 = 1.06 nights
    expect(r.batteryRequiredKwh).toBeCloseTo(24.2082, 3)
    expect(r.batteryQty).toBe(5)
    expect(r.autonomyDays).toBeCloseTo((25.6 * 0.9 * 0.95) / 20.698, 6)
    // PV 12 × 580 W (2 × 6) ; battery 8 000 / (48 × 0.94) = 177.3 A → 225 A / 70 mm² ; AC 34.8 A → 50 A / 10 mm² ; footprint × 1.650
    expect(r.panelQty).toBe(12)
    expect(r.cables.find((c) => c.use === 'battery')).toMatchObject({ breakerA: 225, sizeMm2: 70 })
    expect(r.cables.find((c) => c.use === 'ac')).toMatchObject({ breakerA: 50, sizeMm2: 10 })
    expect(r.footprintM2).toBeCloseTo(51.16, 1)
    expect(r.checks.map((c) => c.id)).toEqual(['all-ok'])
  })

  it('El Obeid farm (off-grid, 3 lines → DF 1.0, 0.5 day autonomy, diesel 0.45 $/kWh)', () => {
    const { r } = farm
    // pump 2 050 W × 6 h 12 300 + LED 4 × 10 × 6 240 + chargers 2 × 10 × 3 60 = 12 600 Wh ; peak 2 110 W ; surge 2 110 + 2 050 × 4 = 10 310 W
    expect(r.dailyWh).toBe(12600)
    expect(r.peakW).toBe(2110)
    expect(r.surgeW).toBe(10310)
    // bank 12 600 × 0.5 / 0.95 / 0.9 = 7.368 kWh → 1 × 10.24 kWh ($1 290 with BOS, cheapest) ; autonomy 9.216 × 0.95 / 12.6 = 0.695 d
    expect(r.batteryRequiredKwh).toBeCloseTo(7.3684, 3)
    expect(r.battery?.id).toBe('bat-gen-48v200')
    expect(r.autonomyDays).toBeCloseTo(0.6948, 3)
    // savings at the diesel cost on the energy actually used: min(production, 12.6 × 365 = 4 599 kWh) × 0.45
    expect(r.annualKwh).toBeCloseTo(4599, 9)
    expect(r.usefulEnergyKwh).toBeCloseTo(Math.min(r.annualProductionKwh, 4599), 9)
    expect(r.annualSavingsUsd).toBeCloseTo(4599 * 0.45, 6)
    expect(r.co2TonsPerYear).toBeCloseTo((4599 * 0.85) / 1000, 9)
  })

  it('Khartoum pharmacy (hybrid, 8 lines → DF 0.8)', () => {
    const { r } = pharmacy
    // E = 1 080 + 16 200 + 3 200 + 500 + 500 + 7 200 + 1 200 + 240 = 30 120 Wh ; night 972 + 1 620 + 160 + 50 + 50 + 3 600 + 600 + 144 = 7 196 Wh
    expect(r.dailyWh).toBe(30120)
    expect(r.nightWh).toBeCloseTo(7196, 9)
    // connected 3 590 × 0.8 = 2 872 W → 3.59 kW → Solis 6 kW (first single-phase hybrid whose MPPT current ≥ Imp 13.62 A)
    expect(r.requiredInverterKw).toBeCloseTo(3.59, 9)
    expect(r.inverter?.id).toBe('inv-solis-s6-eh1p6k')
    // bank 7 196 / 0.95 / 0.9 = 8.416 kWh → 1 × 10.24 kWh ; battery 6 000 / (48 × 0.94) = 133.0 A → 175 A / 50 mm² ; AC 26.1 A → 40 A / 6 mm²
    expect(r.batteryRequiredKwh).toBeCloseTo(8.4164, 3)
    expect(r.battery?.id).toBe('bat-gen-48v200')
    expect(r.cables.find((c) => c.use === 'battery')).toMatchObject({ breakerA: 175, sizeMm2: 50 })
    expect(r.cables.find((c) => c.use === 'ac')).toMatchObject({ breakerA: 40, sizeMm2: 6 })
  })

  it('Dubai warehouse (grid-tied, 3-ph, manual DF 0.9)', () => {
    const { p, r } = dubai
    // E = 90 000 + 240 000 + motor 8 400 × 8 = 67 200 + 24 000 + server 9 600 = 430 800 Wh ; night 18 000 + 24 000 + 0 + 1 200 + 4 800 (24 h → 50 %)
    expect(r.dailyWh).toBe(430800)
    expect(r.nightWh).toBeCloseTo(48000, 9)
    expect(r.coincidenceFactor).toBe(0.9)
    // inverter from the array: required PV / 1.2 → one 100 kW grid-tie string inverter (cheapest adequate) ; AC 144.3 A → 200 A / 120 mm²
    expect(r.inverterSizingBasis).toBe('array')
    expect(r.requiredInverterKw).toBeCloseTo(r.requiredPvKwp / 1.2, 9)
    expect(r.inverter?.type).toBe('gridtie')
    expect(r.inverterTotalKw).toBe(100)
    expect(r.cables.find((c) => c.use === 'ac')).toMatchObject({ breakerA: 200, sizeMm2: 120 })
    // savings: daytime self-consumption 382.8 kWh/day × 365 = 139 722 kWh (< production) × tariff
    expect(r.usefulEnergyKwh).toBeCloseTo(139722, 6)
    expect(r.annualSavingsUsd).toBeCloseTo(139722 * p.site.gridTariff, 6)
    expect(r.strings!.vocCold).toBeLessThanOrEqual(1000)
  })
})
