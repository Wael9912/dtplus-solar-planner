// Regression tests for the 2026-11 engine audit (calc-sizing C1–C5, M1–M17, minors; calc-bom C1–C3, M1, M5, M7–M9, m1–m18).
// Each block names the finding it locks down; expected values are derived by hand in the comments.
import { describe, it, expect } from 'vitest'
import {
  computeProject, computeLoads, allocatePhases, autoCoincidence, designStrings, sizeCable, recommendInverter, batteryCompatibility, getInverter, getBattery, getPanel, K_AMB,
} from '../src/engine/compute'
import { monthlyTiltRatios, annualRatio } from '../src/engine/irradiance'
import { replacementYears } from '../src/engine/economics'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, applySystemType, loadFromAppliance, nightShareFor } from '../src/engine/defaults'
import { buildQuote, currencyDecimals } from '../src/engine/quote'
import { money } from '../src/engine/format'
import { sampleProjects } from '../src/data/samples'
import { appliances } from '../src/data/appliances'
import { catalog } from '../src/data/catalog'
import { getLocation, locations } from '../src/data/locations'
import type { LoadItem, Project, Results } from '../src/engine/types'

const L = (name: string, watts: number, qty: number, h: number, sf = 1, night = 50, phase: 1 | 3 = 1, critical = true): LoadItem =>
  ({ id: name, name, category: 'x', watts, qty, hoursPerDay: h, surgeFactor: sf, nightSharePct: night, phase, critical })
const check = (r: Results, id: string) => r.checks.find((c) => c.id === id)
const bomQty = (r: Results, id: string) => r.bom.find((b) => b.id === id)?.qty
const proj = (f: (p: Project) => void) => { const p = newProject({ name: 't' }); p.pricing = defaultPricing(0, 0); f(p); return p }
const [riyadh, farm, pharmacy, dubai] = sampleProjects()
const ARABIC = /[؀-ۿ]/

// ---------------------------------------------------------------- C1 / C2 protection vs conductor
describe('C1/C2 cables: I_B ≤ I_n ≤ I_z, overflow → parallel conductors or an error', () => {
  it('sweep 1–600 A: the device never exceeds the derated conductor ampacity and the conductor always carries the design current', () => {
    for (const [use, three, V] of [['dc', false, 600], ['battery', false, 48], ['ac', false, 230], ['ac', true, 400]] as const) {
      for (let I = 1; I <= 600; I += 1.7) {
        const c = sizeCable(use, I, 2, V, 5, three)
        const factor = use === 'dc' ? 1.56 : 1.25
        expect(c.ampacityA! + 0.05).toBeGreaterThanOrEqual(I * factor) // conductor ≥ 1.56 × Isc (PV) / 1.25 × I_B
        if (c.deviceStd) {
          expect(c.breakerA).toBeGreaterThanOrEqual(I * factor - 1e-9) // I_B × factor ≤ I_n
          expect(c.ampacityA! + 0.05).toBeGreaterThanOrEqual(c.breakerA) // I_n ≤ I_z
        }
      }
    }
  })
  it('doc §8.2 per-use tables: PV 4 mm² free air 55 × 0.87 = 47.9 A; battery method F; AC method C 2-/3-loaded', () => {
    expect(sizeCable('dc', 14.37, 20, 255, 3).ampacityA).toBeCloseTo(55 * K_AMB, 1)
    expect(sizeCable('ac', 21.7, 15, 230, 2)).toMatchObject({ breakerA: 32, sizeMm2: 6 }) // farm (old engine): 4 mm² = 31.3 A < 32 A → 6 mm² = 40.0 A
    expect(sizeCable('ac', 26.1, 15, 230, 2)).toMatchObject({ breakerA: 40, sizeMm2: 6 }) // pharmacy: 6 mm² = 46 × 0.87 = 40.0 A
    expect(sizeCable('battery', 131.6, 2, 48, 1)).toMatchObject({ breakerA: 175, sizeMm2: 50 }) // 50 mm² F = 209 × 0.87 = 181.8 A
  })
  it('a 451 A AC design current uses 2 × 150 mm² in parallel under a 500 A breaker (one 240 mm² = 403 × 0.87 = 351 A is not enough)', () => {
    const c = sizeCable('ac', 360.8, 15, 400, 2, true) // 300 kWp grid-tied in the audit
    expect(c.breakerA).toBe(500)
    expect(c.parallelRuns).toBe(2)
    expect(c.sizeMm2).toBe(150) // 2 × 299 × 0.87 = 520 A ≥ 500 A
    expect(c.ampacityA!).toBeGreaterThanOrEqual(500)
  })
  it('above the largest standard breaker the device is flagged (deviceStd false) and the project raises an error', () => {
    const c = sizeCable('ac', 1500, 10, 400, 2, true) // 1875 A design > 1600 A
    expect(c.deviceStd).toBe(false)
    const p = proj((q) => {
      q.site = siteFromLocation('dubai')
      q.design = { ...defaultDesign('gridtie'), phase: 3, inverterId: 'inv-huawei-100ktl-m2', inverterQty: 12, panelOverrideQty: 2400 }
      q.loads = [L('plant', 300000, 1, 10, 1, 0, 3)]
    })
    const r = computeProject(p)
    expect(r.cableSchedule.find((x) => x.id === 'ac')!.deviceStd).toBe(false) // 1200 kW → 1732 A × 1.25 = 2165 A
    expect(check(r, 'breaker-range-ac')).toMatchObject({ level: 'error', step: 'design' })
    expect(r.cableSchedule.find((x) => x.id === 'ac-inverter')).toMatchObject({ breakerA: 200, count: 12 }) // each 100 kW unit: 144 A → 200 A
  })
})

// ---------------------------------------------------------------- C3 BOM = design
describe('C3 (sizing) / C2 (BOM): every cable and protective-device line carries exactly the designed rating', () => {
  const famIds: Record<string, string> = { 'pv-string': 'dc-cable', 'pv-array': 'dc-cable', battery: 'batt-cable', 'cc-battery': 'batt-cable' }
  for (const p of sampleProjects()) {
    it(p.name, () => {
      const r = computeProject(p)
      for (const c of r.cableSchedule) {
        const fam = famIds[c.id!] ?? 'ac-cable'
        expect(bomQty(r, `${fam}-${c.sizeMm2}`), `${c.id} ${c.sizeMm2} mm²`).toBeGreaterThan(0)
        if (c.use === 'ac') expect(r.bom.some((b) => b.id === (c.breakerA >= 160 ? `ac-mccb-${c.breakerA}` : `ac-mcb-${c.breakerA}`)), `${c.id} breaker ${c.breakerA}`).toBe(true)
        if (c.id === 'battery') expect(bomQty(r, `batt-fuse-${c.breakerA}`)).toBe(r.inverterQty)
      }
      // no cable line of a size that was not designed
      for (const b of r.bom.filter((x) => /^(ac|batt|dc)-cable-/.test(x.id))) {
        const [fam, size] = [b.id.replace(/-[\d.]+$/, ''), Number(b.id.split('-').at(-1))]
        expect(r.cableSchedule.some((c) => (famIds[c.id!] ?? 'ac-cable') === fam && c.sizeMm2 === size), b.id).toBe(true)
      }
      for (const b of r.bom.filter((x) => x.source === 'auto')) expect(catalog.items.some((i) => i.id === b.id) || ['PV Modules', 'Inverter', 'Battery', 'Generator', 'Services'].includes(b.category), b.id).toBe(true)
    })
  }
  it('HV battery banks get a 1000 V DC-rated fuse, not an 80 V class-T item', () => {
    const p = proj((q) => { q.site = siteFromLocation('riyadh'); q.design = { ...defaultDesign('hybrid'), phase: 3, systemVoltage: 'hv' }; q.loads = [L('AC', 4800, 2, 8, 3, 60, 3), L('lights', 18, 40, 8, 1, 90)] })
    const r = computeProject(p)
    const bt = r.cableSchedule.find((c) => c.id === 'battery')!
    expect(bt.deviceRatedV).toBe(1000)
    expect(r.protection.batteryFuseVdc).toBe(1000)
    const fuse = r.bom.find((b) => b.id === `batt-fuse-hv-${bt.breakerA}`)!
    expect(fuse.spec).toMatch(/1000 V DC/)
    expect(r.bom.some((b) => /^batt-fuse-\d/.test(b.id))).toBe(false)
  })
  it('PV string fuse is the exact rating (25 A gPV for Isc 14.37 A), within the module max series fuse', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), inverterId: 'inv-growatt-spf5000es', panelId: 'pnl-ja-550-jam72s30', panelOverrideQty: 18 }; q.loads = [L('x', 500, 1, 6)] })
    const r = computeProject(p)
    expect(r.protection.stringFuseA).toBe(25) // nextStd(1.56 × 14.0 = 21.8) = 25 ≤ JA 550 max series fuse 25 A
    expect(bomQty(r, 'pv-fuse-25')).toBe(r.strings!.strings * 2)
    expect(check(r, 'pv-fuse-module')).toBeUndefined()
  })
})

// ---------------------------------------------------------------- C4 grid-tied inverter
describe('C4 grid-tied: inverter from the array (P = PV / DC:AC), grid-tie string units, no load/surge errors', () => {
  it('a 15 kW motor load no longer drives a 50 kW hybrid: grid-tie unit, sized on the array, no surge check', () => {
    const p = proj((q) => { q.site = siteFromLocation('dubai'); q.design = { ...defaultDesign('gridtie'), phase: 3 }; q.loads = [L('motor', 15000, 1, 2, 5, 0, 3)] })
    const r = computeProject(p)
    expect(r.inverterSizingBasis).toBe('array')
    expect(r.requiredInverterKw).toBeCloseTo(r.requiredPvKwp / 1.2, 9)
    expect(r.inverter!.type).toBe('gridtie')
    expect(r.inverterTotalKw).toBeLessThanOrEqual(15)
    expect(check(r, 'inv-surge')).toBeUndefined()
    expect(check(r, 'inv-small')).toBeUndefined()
  })
  it('a correct manual grid-tie choice (5.8 kWp on 5 kW, DC/AC 1.16) raises no error', () => {
    const p = proj((q) => { q.site = siteFromLocation('dubai'); q.design = { ...defaultDesign('gridtie'), inverterId: 'inv-growatt-min5000', panelOverrideQty: 10 }; q.loads = [L('AC', 6000, 3, 8, 3, 20)] })
    const r = computeProject(p)
    expect(r.dcAcRatio).toBeCloseTo(5.8 / 5, 9)
    expect(r.inverterOk).toBe(true)
    expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
  })
  it('200 kWp grid-tied → 2 × 100 kW grid-tie units (not 4 × 50 kW hybrids); per-inverter 200 A breakers, 400 A point of connection on 2 × 120 mm²', () => {
    const p = proj((q) => { q.site = siteFromLocation('dubai'); q.design = { ...defaultDesign('gridtie'), phase: 3 }; q.loads = [L('plant', 40000, 1, 24, 1, 30, 3)] })
    const r = computeProject(p)
    expect(r.inverter!.type).toBe('gridtie')
    expect(r.inverterQty).toBe(2)
    expect(r.inverterTotalKw).toBe(200)
    expect(r.protection).toMatchObject({ acBreakerPerInverterA: 200, acMainBreakerA: 400 }) // 144.3 A → 200 A ; 288.7 A → 400 A
    expect(r.cableSchedule.find((c) => c.id === 'ac')).toMatchObject({ parallelRuns: 2, sizeMm2: 120 })
    expect(bomQty(r, 'ac-mccb-200')).toBe(2)
    expect(bomQty(r, 'ac-mccb-400')).toBe(1)
    expect(bomQty(r, 'ac-cable-120')).toBe(15 * 5 * 2 + 3 * 5 * 2) // combined feeder 2 runs × 15 m × 5 cores + 2 × 3 m unit leads
    expect(check(r, 'cable-parallel-ac')?.level).toBe('ok')
  })
  it('the DC:AC target drives the requirement', () => {
    const p = { ...dubai, design: { ...dubai.design, dcAcRatio: 1.0 } }
    expect(computeProject(p).requiredInverterKw).toBeCloseTo(computeProject(p).requiredPvKwp, 9)
  })
  it('respects parallelMax off-grid (M15): 3 kW on a 12 V bus → error, plus the 12 V ≤ 1 kW bus warning', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), systemVoltage: 12 }; q.loads = [L('x', 3000, 1, 2)] })
    const r = computeProject(p)
    expect(check(r, 'inv-parallel')).toMatchObject({ level: 'error', step: 'design' })
    expect(check(r, 'lv-bus')?.level).toBe('warn')
    expect(recommendInverter('hybrid', 1, 40, 40, 48)?.qty).toBeLessThanOrEqual(16)
  })
})

// ---------------------------------------------------------------- C5 battery ↔ inverter
describe('C5 battery-voltage compatibility', () => {
  const byd = getBattery('bat-byd-hvs102')!, luna = getBattery('bat-huawei-luna5')!, rack = getBattery('bat-gen-48v100-rack')!, lfp12 = getBattery('bat-gen-12v100-lfp')!
  it('window, bus and brand rules', () => {
    expect(batteryCompatibility(byd, getInverter('inv-growatt-mod10-xh'), 'hv')).toBeNull() // 409.6 V in the corrected 100–550 V window
    expect(batteryCompatibility(byd, getInverter('inv-deye-30k-sg01hp3'), 'hv')).toBeNull() // 160–800 V
    expect(batteryCompatibility(byd, getInverter('inv-huawei-10ktl-m1'), 'hv')).toBe('brand') // LUNA2000 / LG RESU only
    expect(batteryCompatibility(luna, getInverter('inv-deye-30k-sg01hp3'), 'hv')).toBe('brand')
    expect(batteryCompatibility(luna, getInverter('inv-huawei-10ktl-m1'), 'hv')).toBeNull()
    expect(batteryCompatibility(rack, getInverter('inv-deye-8k-sg01lp1'), 24)).toBe('bus')
    expect(batteryCompatibility(lfp12, getInverter('inv-deye-8k-sg01lp1'), 12)).toBe('inverter-bus')
    expect(batteryCompatibility(rack, getInverter('inv-deye-8k-sg01lp1'), 48)).toBeNull()
  })
  it('manual Huawei M1 + BYD is an error; the auto design never pairs incompatible units', () => {
    const bad = proj((q) => { q.site = siteFromLocation('riyadh'); q.design = { ...defaultDesign('hybrid'), phase: 3, systemVoltage: 'hv', inverterId: 'inv-huawei-10ktl-m1', batteryId: 'bat-byd-hvs102' }; q.loads = [L('x', 7000, 1, 6, 1, 50, 3)] })
    expect(check(computeProject(bad), 'batt-inverter')).toMatchObject({ level: 'error', step: 'design' })
    const auto = proj((q) => { q.site = siteFromLocation('riyadh'); q.design = { ...defaultDesign('hybrid'), phase: 3, systemVoltage: 'hv' }; q.loads = [L('x', 7000, 1, 6, 1, 50, 3)] })
    const r = computeProject(auto)
    expect(r.battery).not.toBeNull()
    expect(batteryCompatibility(r.battery!, r.inverter, 'hv')).toBeNull()
    expect(check(r, 'batt-inverter')).toBeUndefined()
  })
  it('a 51.2 V unit on a 12 V bus (imported project) is an error', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), systemVoltage: 12, batteryId: 'bat-gen-48v100-rack' }; q.loads = [L('LED', 10, 5, 6, 1, 90)] })
    expect(check(computeProject(p), 'batt-voltage')?.level).toBe('error')
  })
})

// ---------------------------------------------------------------- M1 peak / DF
describe('M1 peak demand and coincidence factor', () => {
  it('§1.2 line-count DF: ≤ 5 lines 1.0, 6–15 0.8, > 15 0.7', () => {
    expect([1, 5, 6, 15, 16, 40].map(autoCoincidence)).toEqual([1, 1, 0.8, 0.8, 0.7, 0.7])
  })
  it('peak never falls below the largest single running unit', () => {
    const r = computeLoads([L('pump', 1500, 1, 4, 5, 0), L('LED', 10, 4, 6)], 0.5)
    expect(r.peakW).toBe(1500) // 1540 × 0.5 = 770 < 1500
    expect(r.maxUnitW).toBe(1500)
  })
  it('farm sample (3 lines → DF 1.0): peak 2 050 + 40 + 20 = 2 110 W, surge 2 110 + 2 050 × 4 = 10 310 W', () => {
    const r = computeProject(farm)
    expect(r.coincidenceFactor).toBe(1)
    expect(r.peakW).toBe(2110)
    expect(r.surgeW).toBe(10310)
  })
  it('a manual DF is respected when coincidenceAuto is off', () => {
    const p = proj((q) => { q.design = { ...defaultDesign('hybrid'), coincidenceAuto: false, coincidenceFactor: 0.5 }; q.loads = [L('a', 1000, 1, 2), L('b', 800, 1, 2)] })
    const r = computeProject(p)
    expect(r.coincidenceFactor).toBe(0.5)
    expect(r.peakW).toBe(1000) // max(1800 × 0.5 = 900, 1000)
  })
})

// ---------------------------------------------------------------- M2 / M3 battery choice and overrides
describe('M2/M3 battery auto-pick and overrides', () => {
  it('Riyadh sample: 24.21 kWh → 5 × 5.12 kWh rack ($3,450) — the cheapest adequate bank', () => {
    const r = computeProject(riyadh)
    expect(r.batteryRequiredKwh).toBeCloseTo(20698 / 0.95 / 0.9 / 1000, 6)
    expect(r.battery?.id).toBe('bat-gen-48v100-rack')
    expect(r.batteryQty).toBe(5)
  })
  it('a manual battery quantity is honoured even when the requirement is 0 (autonomy 0)', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), autonomyDays: 0, batteryId: 'bat-gen-48v100-rack', batteryOverrideQty: 2 }; q.loads = [L('x', 500, 1, 6, 1, 30)] })
    const r = computeProject(p)
    expect(r.batteryRequiredKwh).toBe(0)
    expect(r.batteryQty).toBe(2)
    expect(bomQty(r, 'bat-gen-48v100-rack')).toBe(2)
    expect(check(r, 'no-batt')).toBeUndefined()
  })
  it('off-grid with autonomy 0 and no battery is a daytime-only warning, not "No battery selected"', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), autonomyDays: 0 }; q.loads = [L('x', 500, 1, 6, 1, 30)] })
    const r = computeProject(p)
    expect(check(r, 'daytime-only')?.level).toBe('warn')
    expect(check(r, 'no-batt')).toBeUndefined()
  })
})

// ---------------------------------------------------------------- M4 / M5 hybrid critical loads, autonomy
describe('M4/M5 hybrid critical loads and autonomy', () => {
  const e10 = () => proj((q) => {
    q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('hybrid') }
    q.loads = [L('lights', 100, 5, 6, 1, 90, 1, true), L('fridge', 200, 1, 10, 4, 50, 1, true), L('AC', 2400, 2, 8, 3, 60, 1, false), L('pump', 1500, 1, 2, 5, 0, 1, false)]
  })
  it('bank, inverter, surge and backup hours all follow the critical loads', () => {
    const r = computeProject(e10())
    // critical night = 100 × 5 × 6 × 0.9 + 200 × 10 × 0.5 = 2 700 + 1 000 = 3 700 Wh → 3.7 / 0.95 / 0.9 = 4.327 kWh
    expect(r.batteryDailyWh).toBe(3700)
    expect(r.batteryRequiredKwh).toBeCloseTo(3.7 / 0.95 / 0.9, 6)
    // critical peak (2 lines → DF 1.0) = 500 + 200 = 700 W → 0.875 kW ; critical surge 700 + 200 × 3 = 1 300 W (not the AC/pump starts)
    expect(r.requiredInverterKw).toBeCloseTo(0.875, 9)
    expect(r.sizingPeakW).toBe(700)
    expect(r.sizingSurgeW).toBe(1300)
    expect(r.peakW).toBeGreaterThan(r.sizingPeakW) // whole-house peak is still reported
    expect(check(r, 'inv-surge')).toBeUndefined()
    // backup = usable × 0.95 / (3 700 / 12 h)
    expect(r.batteryHoursBackup).toBeCloseTo((r.batteryUsableKwh * 1000 * 0.95) / (3700 / 12), 6)
  })
  it('critical loads without night energy do not borrow the non-critical night load (no 31 kWh bank for non-critical ACs)', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('hybrid') }; q.loads = [L('pump', 1500, 1, 4, 5, 0, 1, true), L('AC', 2400, 2, 8, 3, 70, 1, false)] })
    const r = computeProject(p)
    expect(r.batteryRequiredKwh).toBe(0)
    expect(r.batteryQty).toBe(0)
    expect(check(r, 'no-batt')?.message).toMatch(/no energy at night/)
  })
  it('autonomyDays = usable × 0.95 / E_batt_daily: farm 10.24 × 0.9 × 0.95 / 12.6 = 0.695 d (not "584 h")', () => {
    const r = computeProject(farm)
    expect(r.batteryDailyWh).toBe(12600)
    expect(r.autonomyDays).toBeCloseTo((10.24 * 0.9 * 0.95) / 12.6, 6)
  })
})

// ---------------------------------------------------------------- M6 phases
describe('M6 per-phase allocation (3-phase systems)', () => {
  it('single-phase units are spread largest-first; 3-phase loads split evenly', () => {
    const a = allocatePhases([L('AC', 2400, 3, 8), L('heater', 2000, 1, 2), L('m', 3000, 1, 2, 1, 0, 3)])
    expect([...a.phaseW].sort((x, y) => x - y)).toEqual([3400, 3400, 5400]) // 2400 each + 1000 each (3 kW/3) + 2000 on one phase
    expect(a.maxSinglePhaseUnitW).toBe(2400)
  })
  it('3 × 2.4 kW + 2 kW single-phase on a 3-ph hybrid → required 3 × 4.4 kW × 1.25 = 16.5 kW and an unbalance warning', () => {
    const p = proj((q) => { q.site = siteFromLocation('riyadh'); q.design = { ...defaultDesign('hybrid'), phase: 3, systemVoltage: 48 }; q.loads = [L('AC', 2400, 3, 8, 3, 60), L('heater', 2000, 1, 2, 1, 50)] })
    const r = computeProject(p)
    expect(r.requiredInverterKw).toBeCloseTo(16.5, 9)
    expect(r.phaseMaxW).toBe(4400)
    expect(check(r, 'phase-unbalance')).toMatchObject({ level: 'warn', step: 'loads' })
    expect(r.inverterTotalKw).toBeGreaterThanOrEqual(16.5)
  })
})

// ---------------------------------------------------------------- M7 / M8 strings
describe('M7/M8 string voltage limits and the separate-controller path', () => {
  const jinko = getPanel('pnl-jinko-580-neo72')!, huawei = getInverter('inv-huawei-100ktl-m2')!
  it('buildings are limited to 1000 V; ground mounts may use the inverter/module limit (1067 V here)', () => {
    for (let n = 140; n <= 240; n += 7) {
      const s = designStrings(jinko, huawei, 1, n, -2, 45)
      expect(s.vocCold, `${n}`).toBeLessThanOrEqual(1000)
      expect(s.maxSystemVoltageV).toBe(1000)
    }
    expect(designStrings(jinko, huawei, 1, 152, -2, 45, { codeLimitV: 1500 }).maxSystemVoltageV).toBe(1067)
  })
  it('1000 V-rated modules are kept under 1000 V even on a 1100 V inverter', () => {
    const poly = getPanel('pnl-gen-330-poly')!
    const s = designStrings(poly, huawei, 1, 300, -2, 45, { codeLimitV: 1500 })
    expect(s.vocCold).toBeLessThanOrEqual(1000)
    expect(s.maxSystemVoltageV).toBe(1000)
  })
  it('a single module above the input limit is reported and ok = false', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), useSeparateController: true, chargeControllerId: 'cc-gen-pwm-30', inverterId: 'inv-victron-mp2-5000', panelId: 'pnl-jinko-580-neo72' }; q.loads = [L('x', 300, 1, 6)] })
    const r = computeProject(p)
    expect(r.strings!.ok).toBe(false)
    expect(r.strings!.notes.join(' ')).toMatch(/already exceeds/)
    expect(check(r, 'cc-voltage')?.level).toBe('error') // 12/24 V PWM controller on a 48 V bus
    expect(check(r, 'cc-pwm')?.level).toBe('warn')
  })
  it('separate controller + MPPT hybrid: strings are designed against the controller that is quoted', () => {
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('hybrid'), useSeparateController: true, inverterId: 'inv-deye-8k-sg01lp1' }; q.loads = [L('x', 1000, 1, 10, 1, 50)] })
    const r = computeProject(p)
    expect(r.strings!.viaController).toBe(true)
    expect(r.controller).not.toBeNull()
    expect(r.strings!.vocCold).toBeLessThanOrEqual(r.controller!.maxPvVoltage)
    expect(bomQty(r, r.controller!.id)).toBe(r.controllerQty)
    expect(r.controllerQty * r.controller!.maxChargeA).toBeGreaterThanOrEqual(r.requiredControllerA - 1e-9)
    expect(r.cableSchedule.some((c) => c.id === 'cc-battery')).toBe(true)
  })
})

// ---------------------------------------------------------------- M9 / M10 / M11 site
describe('M9/M10/M11 irradiance, tilt and area', () => {
  it('editing the annual PSH rescales the monthly profile (sizing and production agree)', () => {
    const p = { ...riyadh, site: { ...riyadh.site, psh: 5.0 } }
    const r = computeProject(p)
    expect(r.monthlyPshUsed.reduce((a, b) => a + b, 0) / 12).toBeCloseTo(5.0, 9)
    // SY ≈ 5.0 × 365 × tilt × derate (day-weighting of the profile differs by < 1 %)
    expect(r.specificYield / (5.0 * 365 * r.tiltGainUsed * r.derate)).toBeCloseTo(1, 2)
    expect(r.specificYield).toBeLessThan(computeProject(riyadh).specificYield * 0.85)
  })
  it('isotropic monthly model reproduces the audit (Riyadh 21°: annual 1.06, June 0.90, December ≈ 1.33)', () => {
    const loc = getLocation('riyadh')!
    const rm = monthlyTiltRatios(loc.lat, 21, 0, loc.monthlyPsh)
    expect(annualRatio(rm, loc.monthlyPsh)).toBeCloseTo(1.06, 2)
    expect(rm[5]).toBeCloseTo(0.9, 1)
    expect(rm[11]).toBeGreaterThan(1.3)
  })
  it('the tilt-gain factor anchors the reference geometry; a flat array gets 1.0; azimuth and low tilt are flagged', () => {
    expect(computeProject(riyadh).tiltGainUsed).toBeCloseTo(riyadh.site.tiltGainFactor, 9)
    const flat = computeProject({ ...riyadh, site: { ...riyadh.site, tiltDeg: 0 } })
    expect(flat.tiltGainUsed).toBe(1)
    expect(flat.monthlyTiltGain.every((g) => g === 1)).toBe(true)
    expect(check(flat, 'tilt-low')).toMatchObject({ level: 'warn', step: 'site' })
    const east = computeProject({ ...riyadh, site: { ...riyadh.site, azimuthDeg: 90 } })
    expect(east.tiltGainUsed).toBeLessThan(riyadh.site.tiltGainFactor)
    expect(check(east, 'azimuth')?.level).toBe('warn')
    const custom = computeProject({ ...riyadh, site: { ...riyadh.site, locationId: 'custom', lat: undefined } })
    expect(custom.monthlyTiltGain.every((g) => g === riyadh.site.tiltGainFactor)).toBe(true)
  })
  it('footprint: tilted rows on a flat roof × (cos β + 2 sin β); flush mounts × 1.2', () => {
    const r = computeProject(riyadh) // flat concrete, 21°
    const k = Math.cos((21 * Math.PI) / 180) + 2 * Math.sin((21 * Math.PI) / 180) // 1.6503
    expect(r.areaFactor).toBeCloseTo(k, 9)
    expect(r.footprintM2).toBeCloseTo(12 * 2.278 * 1.134 * k, 6) // 51.2 m² (old check: 36 m²)
    expect(check(computeProject({ ...riyadh, site: { ...riyadh.site, availableAreaM2: 45 } }), 'area')?.level).toBe('warn')
    expect(computeProject(dubai).areaFactor).toBe(1.2) // metal sheet, flush
  })
})

// ---------------------------------------------------------------- M12 / M13 / M14 data & defaults
describe('M12/M13/M14 system-type switch, appliance data, night share', () => {
  it('applySystemType keeps the off-grid margin and the battery consistent', () => {
    const off = applySystemType(defaultDesign('hybrid'), 'offgrid')
    expect(off.pvOversize).toBe(1.2)
    expect(off.autonomyDays).toBeGreaterThanOrEqual(1)
    expect(off.batteryId).toBe('auto')
    const gt = applySystemType(off, 'gridtie')
    expect(gt).toMatchObject({ pvOversize: 1.0, batteryId: null, autonomyDays: 0, useSeparateController: false })
    expect(applySystemType({ ...defaultDesign('hybrid'), pvOversize: 1.1 }, 'offgrid').pvOversize).toBe(1.1) // user value kept
    expect(applySystemType({ ...defaultDesign('gridtie'), inverterId: 'inv-sma-sb3' }, 'hybrid').inverterId).toBeNull() // grid-tie unit cannot run a hybrid
    expect(applySystemType({ ...defaultDesign('hybrid'), inverterId: 'inv-deye-8k-sg01lp1' }, 'gridtie').inverterId).toBe('inv-deye-8k-sg01lp1')
  })
  it('pumps and motors carry electrical input power (≥ ~1 kW per HP), not shaft power', () => {
    const w = (id: string) => appliances.find((a) => a.id === id)!.watts
    expect(w('pump_sub_2hp')).toBe(2050)
    expect(w('motor_3ph_10hp')).toBe(8400)
    expect(w('compressor_2hp')).toBe(2000)
    for (const a of appliances.filter((x) => /(\d+(?:_\d)?)hp/.test(x.id))) {
      const hp = Number(a.id.match(/(\d+(?:_\d)?)hp/)![1].replace('_', '.'))
      expect(a.watts / hp, a.id).toBeGreaterThanOrEqual(830) // ≥ 746 W / 0.9
    }
  })
  it('24 h loads put at least half their energy at night (category default 10 % for a server is impossible)', () => {
    expect(nightShareFor('office', 24)).toBe(50)
    expect(nightShareFor('agri', 24)).toBe(50)
    expect(nightShareFor('office', 8)).toBe(10)
    expect(loadFromAppliance(appliances.find((a) => a.id === 'server_rack')!).nightSharePct).toBe(50)
    expect(computeLoads([L('srv', 400, 1, 24, 1, 10)], 1).nightWh).toBe(4800) // floored in the engine too
  })
})

// ---------------------------------------------------------------- M16 guards
describe('M16 input guards: no NaN / Infinity, an error or warning with the step to fix', () => {
  const finite = (r: Results) => {
    for (const [k, v] of Object.entries(r)) if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true)
    for (const v of [...r.cumulativeCashflow, ...r.monthlyProductionKwh, ...r.bom.map((b) => b.totalUsd)]) expect(Number.isFinite(v)).toBe(true)
  }
  const cases: [string, (p: Project) => void, string, string][] = [
    ['DoD 0', (p) => { p.design.dodOverridePct = 0 }, 'dod', 'design'],
    ['soiling 100 %', (p) => { p.site.soilingLossPct = 100 }, 'losses', 'site'],
    ['shading 150 %', (p) => { p.site.shadingLossPct = 150 }, 'losses', 'site'],
    ['PSH 0', (p) => { p.site.psh = 0; p.site.monthlyPsh = Array(12).fill(0) }, 'psh', 'site'],
    ['PSH NaN', (p) => { p.site.psh = NaN }, 'psh', 'site'],
    ['autonomy 1e6', (p) => { p.design.autonomyDays = 1e6 }, 'autonomy', 'design'],
    ['hours 30', (p) => { p.loads = [...p.loads, L('bad', 100, 1, 30, 1, 150)] }, 'load-input', 'loads'],
    ['FX 0 (SDG)', (p) => { p.site.currency = 'SDG'; p.site.fxRateToUsd = 0 }, 'fx-invalid', 'site'],
    ['FX 1 (SDG)', (p) => { p.site.currency = 'SDG'; p.site.fxRateToUsd = 1 }, 'fx-unset', 'site'],
    ['pvOversize 0', (p) => { p.design.pvOversize = 0 }, 'design-input', 'design'],
    ['discount 120 %', (p) => { p.pricing.discountPct = 120 }, 'pricing-input', 'bom'],
    ['imported project with NaN ambient / record low / tilt', (p) => { p.site.ambientHighC = NaN; p.site.ambientAvgC = NaN; p.site.recordLowC = NaN; p.site.tiltDeg = NaN }, 'site-input', 'site'],
  ]
  for (const [name, f, id, step] of cases) {
    it(name, () => {
      const p = structuredClone(riyadh); f(p)
      const r = computeProject(p)
      finite(r)
      expect(check(r, id)?.step).toBe(step)
      expect(check(r, id)?.level).not.toBe('ok')
    })
  }
  it('autonomy is clamped to 10 days and discount to 100 % (total never negative)', () => {
    const p = structuredClone(riyadh); p.design.autonomyDays = 1e6; p.pricing.discountPct = 120
    const r = computeProject(p)
    expect(r.batteryRequiredKwh).toBeCloseTo((20698 * 10) / 0.95 / 0.9 / 1000, 6)
    expect(r.totalUsd).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------- BOM quantities & overrides
describe('BOM: overrides flow into the design, sane quantities, completeness', () => {
  it('a panel qty override in the BOM becomes the design panel count (mounting, labour, strings, production follow)', () => {
    const base = computeProject(riyadh)
    const p = structuredClone(riyadh); p.pricing.qtyOverrides = { [base.panel.id]: 16 }
    const r = computeProject(p)
    expect(r.panelQty).toBe(16)
    expect(r.arrayKwp).toBeCloseTo(9.28, 9)
    expect(r.strings!.totalPanels).toBe(16) // 2 × 8
    expect(bomQty(r, base.panel.id)).toBe(16)
    expect(bomQty(r, 'labour')).toBeCloseTo(9.28, 9)
    expect(bomQty(r, 'rail')).toBeCloseTo(Math.ceil(16 * 1.134 * 2 * 1.05 * 100) / 100, 9)
    expect(r.annualProductionKwh / base.annualProductionKwh).toBeCloseTo(16 / 12, 9)
  })
  it('battery and inverter qty overrides reach the design; 0 keeps the line at 0 (not quoted) and the design unchanged', () => {
    const p = structuredClone(riyadh); p.pricing.qtyOverrides = { 'bat-gen-48v100-rack': 6, 'inv-deye-8k-sg01lp1': 2 }
    const r = computeProject(p)
    expect(r.batteryQty).toBe(6)
    expect(r.batteryKwh).toBeCloseTo(30.72, 9)
    expect(r.inverterQty).toBe(2)
    expect(r.inverterTotalKw).toBe(16)
    // m5: battery wiring per inverter + jumpers per unit: 2 m × 2 × 2 inverters + 6 × 0.6 m ; lugs 6 × 4 + 4 × 2
    const bt = r.cableSchedule.find((c) => c.id === 'battery')!
    expect(bomQty(r, `batt-cable-${bt.sizeMm2}`)).toBeCloseTo(2 * 2 * 2 + 6 * 0.6, 9)
    expect(bomQty(r, 'cable-lug')).toBe(6 * 4 + 4 * 2)
    expect(bomQty(r, `batt-fuse-${bt.breakerA}`)).toBe(2)
    const z = structuredClone(riyadh); z.pricing.qtyOverrides = { 'bat-gen-48v100-rack': 0 }
    const rz = computeProject(z)
    expect(rz.batteryQty).toBe(5)
    expect(rz.bom.find((b) => b.id === 'bat-gen-48v100-rack')).toMatchObject({ qty: 0, totalUsd: 0 })
  })
  it('m3/m4: no float overshoot (1.1 kWp stays 1.1) and discrete items are whole pieces', () => {
    const p = proj((q) => { q.site = { ...siteFromLocation('khartoum'), roofType: 'pitched-tile' }; q.design = { ...defaultDesign('gridtie'), panelId: 'pnl-ja-550-jam72s30', panelOverrideQty: 2 }; q.loads = [L('x', 500, 1, 6)] })
    const r = computeProject(p)
    expect(bomQty(r, 'labour')).toBe(1.1)
    expect(bomQty(r, 'tile-hook')).toBe(5) // ceil(2 × 2.5)
    const q3 = proj((q) => { q.site = { ...siteFromLocation('khartoum'), roofType: 'metal-sheet' }; q.design = { ...defaultDesign('gridtie'), panelOverrideQty: 3 }; q.loads = [L('x', 500, 1, 6)] })
    expect(bomQty(computeProject(q3), 'l-foot')).toBe(8) // ceil(7.5)
    for (const s of sampleProjects()) for (const b of computeProject(s).bom.filter((x) => ['pcs', 'pair', 'kit', 'lot'].includes(x.unit))) expect(Number.isInteger(b.qty), b.id).toBe(true)
  })
  it('m6: a qty override can add an item the rule left out (lightning arrestor on a small array)', () => {
    const p = structuredClone(farm); p.pricing.qtyOverrides = { 'lightning-arrestor': 1 }
    expect(bomQty(computeProject(p), 'lightning-arrestor')).toBe(1)
  })
  it('M9: the generator is priced per kVA with the kVA in the spec', () => {
    const p = structuredClone(farm); p.design.generatorBackup = true
    const r = computeProject(p)
    const g = r.bom.find((b) => b.id === 'generator')!
    expect(g.spec).toContain(`${r.generatorKva} kVA`)
    expect(g.unitPriceUsd).toBeGreaterThan(0)
    expect(r.protection.changeoverType).toBe('ats')
    expect(r.cableSchedule.some((c) => c.id === 'ac-generator')).toBe(true)
  })
  it('M7: an excluded battery line keeps the battery in the results (proposal can still name it)', () => {
    const p = structuredClone(riyadh); p.pricing.excludedIds = ['bat-gen-48v100-rack']
    const r = computeProject(p)
    expect(r.battery?.id).toBe('bat-gen-48v100-rack')
    expect(r.bom.some((b) => b.id === 'bat-gen-48v100-rack')).toBe(false)
  })
  it('completeness (§12): RCD on backup output, grid-input run for hybrids, earth clips, BMS cable, one CT meter per system', () => {
    const r = computeProject(riyadh)
    expect(bomQty(r, 'rcd-63')).toBe(1)
    expect(r.cableSchedule.some((c) => c.id === 'ac-grid')).toBe(true)
    expect(bomQty(r, 'earth-clip')).toBe(12)
    expect(bomQty(r, 'bms-cable')).toBe(5)
    expect(bomQty(r, 'ct-meter')).toBe(1)
    expect(bomQty(computeProject(farm), 'ct-meter')).toBeUndefined()
  })
  it('every auto BOM line has Arabic name and spec text', () => {
    for (const s of sampleProjects()) for (const b of computeProject(s).bom.filter((x) => x.source === 'auto')) {
      expect(typeof b.nameAr, b.id).toBe('string')
      expect(typeof b.specAr, b.id).toBe('string')
    }
    for (const i of catalog.items) expect(i.nameAr && ARABIC.test(i.nameAr), i.id).toBe(true)
  })
})

// ---------------------------------------------------------------- checks carry step + Arabic
describe('every check carries a wizard step and Modern Standard Arabic text', () => {
  const scenarios: Project[] = [
    ...sampleProjects(),
    proj((q) => { q.loads = [] }),
    proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), systemVoltage: 12 }; q.loads = [L('x', 3000, 1, 2)] }),
    proj((q) => { q.site = { ...siteFromLocation('riyadh'), tiltDeg: 5, azimuthDeg: 120, availableAreaM2: 5, soilingLossPct: 120 }; q.design = { ...defaultDesign('hybrid'), phase: 3, dodOverridePct: 0 }; q.loads = [L('AC', 2400, 3, 8, 3, 60), L('m', 3000, 1, 4, 5, 0, 3)] }),
    proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), useSeparateController: true, chargeControllerId: 'cc-gen-pwm-30', inverterId: 'inv-victron-mp2-5000', panelId: 'pnl-jinko-580-neo72' }; q.loads = [L('x', 300, 1, 6)] }),
    proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), systemVoltage: 24, batteryId: 'bat-gen-12v200-agm', autonomyDays: 1 }; q.loads = [L('x', 400, 1, 10, 1, 60)] }),
  ]
  it('step ∈ wizard steps, messageAr contains Arabic', () => {
    const steps = new Set(['info', 'loads', 'site', 'design', 'results', 'bom', 'export'])
    let n = 0
    for (const p of scenarios) for (const c of computeProject(p).checks) {
      n++
      expect(steps.has(c.step!), c.id).toBe(true)
      expect(ARABIC.test(c.messageAr ?? ''), c.id).toBe(true)
    }
    expect(n).toBeGreaterThan(25)
  })
})

// ---------------------------------------------------------------- quote / money
describe('quote and money chain (contract with UI / PDF / Excel)', () => {
  const variants: [string, Project][] = [
    ...sampleProjects().map((p) => [p.name, p] as [string, Project]),
    ['SDG @ 600, discount 5 %, VAT 15 %', (() => { const p = structuredClone(riyadh); p.site.currency = 'SDG'; p.site.fxRateToUsd = 600; p.pricing.discountPct = 5; p.pricing.vatPct = 15; return p })()],
    ['KWD @ 0.307 (3 decimals)', (() => { const p = structuredClone(pharmacy); p.site.currency = 'KWD'; p.site.fxRateToUsd = 0.307; p.pricing.vatPct = 5; return p })()],
    ['SAR markup 26 %, discount 5 %, VAT 5 %', (() => { const p = structuredClone(dubai); p.site.currency = 'SAR'; p.site.fxRateToUsd = 3.75; p.pricing.marginPct = 26; p.pricing.discountPct = 5; p.pricing.vatPct = 5; return p })()],
  ]
  for (const [name, p] of variants) {
    it(name, () => {
      const r = computeProject(p)
      const q = buildQuote(p, r)
      const eps = 0.5 * 10 ** -q.decimals
      for (const l of q.lines) {
        expect(Math.abs(l.qty * l.unitCost - l.totalCost), l.id).toBeLessThanOrEqual(eps + 1e-9)
        expect(Math.abs(l.qty * l.unitSell - l.totalSell), l.id).toBeLessThanOrEqual(eps + 1e-9)
      }
      expect(Math.abs(q.lines.reduce((a, l) => a + l.totalSell, 0) - q.sellSubtotal)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(q.lines.reduce((a, l) => a + l.totalCost, 0) - q.costSubtotal)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(q.sellSubtotal - q.discount + q.vat - q.total)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(r.totalUsd * q.fx - q.total)).toBeLessThanOrEqual(1e-6 * Math.max(1, q.total))
      for (const b of r.bom) expect(b.totalUsd * q.fx).toBeCloseTo(q.lines.find((l) => l.id === b.id)!.totalCost, 6)
    })
  }
  it('currency decimals and fx: KWD 3, SDG 2, USD ignores a stored rate', () => {
    expect(currencyDecimals('KWD')).toBe(3)
    expect(currencyDecimals('SDG')).toBe(2)
    const p = structuredClone(farm); p.site.fxRateToUsd = 600 // currency still USD
    expect(buildQuote(p, computeProject(p)).fx).toBe(1)
    expect(money(10, 'USD', 600)).toBe('$10')
  })
  it('a price typed in SDG (1,000 SDG at 600/USD) foots exactly: 7 × 1,000.00 = 7,000.00', () => {
    const p = structuredClone(riyadh); p.site.currency = 'SDG'; p.site.fxRateToUsd = 600
    p.pricing.priceOverrides = { 'earth-rod': 1000 / 600 }; p.pricing.qtyOverrides = { 'earth-rod': 7 }
    const r = computeProject(p)
    const line = buildQuote(p, r).lines.find((l) => l.id === 'earth-rod')!
    expect(line).toMatchObject({ qty: 7, unitCost: 1000, totalCost: 7000 })
  })
})

// ---------------------------------------------------------------- economics
describe('economics (BOM report C1, M1, m14, m15)', () => {
  it('off-grid is compared against diesel and uses the diesel CO₂ factor', () => {
    const r = computeProject(farm)
    expect(r.savingsBasis).toBe('diesel')
    expect(r.avoidedCostUsdPerKwh).toBe(0.45)
    expect(r.usefulEnergyKwh).toBeCloseTo(Math.min(r.annualProductionKwh, 12.6 * 365), 6)
    expect(r.annualSavingsUsd).toBeCloseTo(r.usefulEnergyKwh * 0.45, 6)
    expect(r.co2TonsPerYear).toBeCloseTo((r.usefulEnergyKwh * 0.85) / 1000, 9)
  })
  it('hybrid savings are capped by what the battery can shift to the night', () => {
    const p = structuredClone(riyadh); p.design.batteryOverrideQty = 1
    const r = computeProject(p)
    // day 12 772 Wh × 365 + min(night 20 698 Wh × 365, 1 × 5.12 × 0.9 × 0.95 × 365)
    const cap = (12772 * 365) / 1000 + Math.min((20698 * 365) / 1000, 5.12 * 0.9 * 0.95 * 365)
    expect(r.usefulEnergyKwh).toBeCloseTo(Math.min(r.annualProductionKwh, cap), 6)
  })
  it('replacement years fall strictly inside the analysis period', () => {
    expect(replacementYears(15, 25)).toEqual([15])
    expect(replacementYears(5, 25)).toEqual([5, 10, 15, 20])
    expect(replacementYears(15, 15)).toEqual([])
    expect(replacementYears(null, 25)).toEqual([])
    // AGM (500 cycles → 1.4 yr, calendar 5 yr) off-grid: replaced every 1.37 years → many replacements in 25 years
    const p = proj((q) => { q.site = siteFromLocation('khartoum'); q.design = { ...defaultDesign('offgrid'), systemVoltage: 24, batteryId: 'bat-gen-12v200-agm', autonomyDays: 2 }; q.loads = [L('x', 200, 1, 10, 1, 60)] })
    const r = computeProject(p)
    expect(r.replacements.filter((x) => x.item === 'battery').length).toBeGreaterThanOrEqual(17)
  })
  it('Dubai sample: savings = daytime load 382.8 kWh/day × 365 × tariff (production surplus is not credited)', () => {
    const r = computeProject(dubai)
    expect(r.dayWh).toBe(382800)
    expect(r.usefulEnergyKwh).toBeCloseTo(382.8 * 365, 6)
    expect(r.annualSavingsUsd).toBeCloseTo(382.8 * 365 * dubai.site.gridTariff, 6)
    expect(r.replacements.map((x) => x.item)).toEqual(['inverter']) // no battery; inverter at year 15
  })
})

// ---------------------------------------------------------------- seeded robustness sweep
describe('seeded random designs: no exceptions, no NaN, I_n ≤ I_z, money foots, every BOM item exists unless the rating is flagged', () => {
  it('400 random projects', () => {
    let seed = 20261101
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
    for (let n = 0; n < 400; n++) {
      const type = pick(['offgrid', 'hybrid', 'gridtie'] as const)
      const p = newProject({ name: `f${n}` })
      p.site = { ...siteFromLocation(pick(locations).id), roofType: pick(['flat-concrete', 'pitched-tile', 'metal-sheet', 'ground'] as const), currency: pick(['USD', 'SDG', 'KWD']), fxRateToUsd: pick([600, 0.307, 3.75]) }
      p.design = { ...defaultDesign(type), phase: pick([1, 3] as const), systemVoltage: pick([12, 24, 48, 48, 'hv'] as const), autonomyDays: pick([0, 0.5, 1, 2]), useSeparateController: rnd() < 0.2, generatorBackup: rnd() < 0.3, coincidenceAuto: rnd() < 0.5 }
      if (rnd() < 0.3) { p.design.inverterId = pick(catalog.inverters).id; p.design.inverterQty = pick([1, 2, 3]) }
      if (type !== 'gridtie' && rnd() < 0.3) p.design.batteryId = pick(catalog.batteries).id
      if (rnd() < 0.3) p.design.panelId = pick(catalog.panels).id
      if (rnd() < 0.2) p.design.panelOverrideQty = Math.ceil(rnd() * 60)
      if (rnd() < 0.2) p.design.chargeControllerId = pick(catalog.chargeControllers).id
      p.loads = Array.from({ length: Math.ceil(rnd() * 8) }, (_, i) => { const a = pick(appliances); return { id: `l${i}`, name: a.name, category: a.category, watts: a.watts, qty: Math.ceil(rnd() * 5), hoursPerDay: a.hoursPerDay, surgeFactor: a.surgeFactor, nightSharePct: Math.round(rnd() * 100), phase: p.design.phase === 3 ? a.phase : 1, critical: rnd() < 0.7 } })
      p.pricing = { ...defaultPricing(Math.round(rnd() * 40), pick([0, 5, 15])), discountPct: pick([0, 5]) }
      const r = computeProject(p)
      for (const [k, v] of Object.entries(r)) if (typeof v === 'number') expect(Number.isFinite(v), `${n} ${k}`).toBe(true)
      for (const v of [...r.cumulativeCashflow, ...r.monthlyProductionKwh, ...r.bom.map((b) => b.totalUsd)]) expect(Number.isFinite(v)).toBe(true)
      for (const c of r.cableSchedule) if (c.deviceStd) expect(c.ampacityA! + 0.05, `${n} ${c.id}`).toBeGreaterThanOrEqual(c.breakerA)
      const q = buildQuote(p, r)
      expect(Math.abs(r.totalUsd * q.fx - q.total)).toBeLessThanOrEqual(1e-6 * Math.max(1, q.total))
      const missing = r.checks.filter((c) => c.id.startsWith('bom-missing'))
      if (missing.length) expect(r.checks.some((c) => c.id.startsWith('breaker-range')), `${n} ${missing.map((c) => c.id)}`).toBe(true)
      for (const c of r.checks) expect(!!c.step && ARABIC.test(c.messageAr ?? ''), `${n} ${c.id}`).toBe(true)
    }
  })
})
