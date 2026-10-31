// Engine review tests — every expected value is hand-computed from docs/sizing-methodology.md and the catalog numbers.
// Arithmetic is shown inline so a reviewer can re-derive each number without running the code.
import { describe, it, expect } from 'vitest'
import {
  computeProject, computeLoads, cellTemp, designStrings, sizeCable, fitsSystemVoltage, recommendInverter, recommendBattery, INV_EFF_BATT,
} from '../src/engine/compute'
import { roundUpStd, STD_MCB_A, STD_PV_FUSE_A } from '../src/engine/standards'
import { newProject, siteFromLocation, defaultDesign, defaultPricing } from '../src/engine/defaults'
import type { LoadItem, Panel, Inverter, Project, Results } from '../src/engine/types'
import { catalog } from '../src/data/catalog'

const L = (name: string, watts: number, qty: number, hoursPerDay: number, surgeFactor = 1, nightSharePct = 100, phase: 1 | 3 = 1, critical = true): LoadItem =>
  ({ id: name, name, category: 'x', watts, qty, hoursPerDay, surgeFactor, nightSharePct, phase, critical })

// Fixture module M580 from §13 (Voc 51.5, Vmp 43, Isc 14, Imp 13.49, β −0.25 %/°C, γ −0.30 %/°C, NOCT 45)
const M580: Panel = { id: 'M580', brand: 'Test', model: 'M580', watts: 580, voc: 51.5, vmp: 43, isc: 14, imp: 13.49, efficiencyPct: 22.4, tempCoeffPmaxPctPerC: -0.3, tempCoeffVocPctPerC: -0.25, noct: 45, lengthMm: 2278, widthMm: 1134, weightKg: 27, technology: 'TOPCon', bifacial: false, warrantyYears: 25, approxPriceUsd: 75 }
// Fixture (b) 8 kW LV hybrid: 500 V max, MPPT 150–425 V, 2 × 22 A
const inv8k: Inverter = { id: 'i8', brand: 'T', model: '8K', type: 'hybrid', phase: 1, ratedAcKw: 8, maxPvInputKw: 10.4, maxPvVoltage: 500, mpptMinV: 150, mpptMaxV: 425, mpptCount: 2, maxInputCurrentPerMppt: 22, batteryVoltage: 48, maxChargeA: 190, surgeKw: 16, efficiencyPct: 97, parallelMax: 16, generatorInput: true, approxPriceUsd: 1000 }

// Catalog Jinko 580 used in the end-to-end fixtures: Voc 51.47, Vmp 42.59, Isc 14.37, Imp 13.62, γ −0.30, β −0.25, NOCT 45, 1.134 m wide
const JINKO = 'pnl-jinko-580-neo72'

const site = (city: string, psh: number, recordLowC: number, ambientHighC: number, ambientAvgC: number) =>
  ({ ...siteFromLocation(city), psh, monthlyPsh: Array(12).fill(psh), tiltGainFactor: 1, recordLowC, ambientHighC, ambientAvgC, shadingLossPct: 0, soilingLossPct: 3 })

const loadsA = [L('LED', 10, 5, 6), L('Fan', 60, 2, 8, 1.5), L('Fridge', 150, 1, 8, 4), L('TV', 80, 1, 4), L('Router', 10, 1, 22)]
const loadsB = [L('AC', 1300, 2, 6, 3, 60), L('Fridge', 200, 1, 10, 4, 60), L('Freezer', 150, 1, 8, 4, 60), L('Washer', 500, 1, 1, 3, 60), L('TV', 100, 1, 5, 1, 60), L('LED', 10, 12, 6, 1, 60), L('Fans', 70, 4, 8, 1.5, 60), L('Router', 10, 1, 24, 1, 60), L('Laptop', 60, 1, 4, 1, 60), L('Pump', 400, 1, 1, 3, 60), L('Microwave', 1200, 1, 0.3, 1.5, 60), L('Kettle', 2000, 1, 0.25, 1, 60), L('Misc', 100, 1, 5, 1, 60)]

function projectA(): Project {
  const p = newProject({ name: 'a' })
  p.site = site('khartoum', 6.0, 5, 42, 36)
  p.design = { ...defaultDesign('offgrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 1, pvOversize: 1.2, panelId: JINKO, batteryId: 'bat-gen-48v100-rack', inverterId: null, generatorBackup: true }
  p.loads = loadsA
  p.pricing = defaultPricing(0, 0)
  return p
}
function projectB(): Project {
  const p = newProject({ name: 'b' })
  p.site = site('riyadh', 5.8, 0, 44, 34)
  p.design = { ...defaultDesign('hybrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 0.8, pvOversize: 1.0, panelId: JINKO, batteryId: 'bat-gen-48v100-rack', inverterId: 'inv-deye-8k-sg01lp1', generatorBackup: true }
  p.loads = loadsB
  return p
}
function projectC(): Project {
  const p = newProject({ name: 'c' })
  p.site = site('dubai', 5.5, 0, 42, 34)
  p.design = { ...defaultDesign('gridtie'), phase: 3, coincidenceFactor: 1, panelId: JINKO, batteryId: null, inverterId: 'inv-huawei-100ktl-m2' }
  p.loads = [L('Plant', 22000, 1, 24, 1, 20, 3)]
  return p
}
const bomQty = (r: Results, id: string) => r.bom.find((b) => b.id === id)?.qty
const check = (r: Results, id: string) => r.checks.find((c) => c.id === id)

// ---------------------------------------------------------------- §1 loads
describe('§1 load analysis', () => {
  it('energy, connected, peak with coincidence, single-largest surge', () => {
    // E = 10·5·6 + 60·2·8 + 150·1·8 + 80·1·4 + 10·1·22 = 300 + 960 + 1200 + 320 + 220 = 3000 Wh
    // P_sum = 50 + 120 + 150 + 80 + 10 = 410 W ; P_peak = 410 × 0.8 = 328 W ; surge extra = max_i W_i(sf_i − 1) = 150 × 3 = 450 → 778 W
    const r = computeLoads(loadsA, 0.8)
    expect(r.dailyWh).toBe(3000)
    expect(r.connectedW).toBe(410)
    expect(r.peakW).toBeCloseTo(328, 9)
    expect(r.surgeW).toBeCloseTo(778, 9)
    expect(r.nightWh).toBe(3000) // nightShare 100 %
    expect(r.dayWh).toBe(0)
  })
  it('night split, critical subset, ignores qty 0 / 0 W rows, clamps surge factors < 1', () => {
    const loads = [L('a', 100, 2, 10, 0.5, 30, 1, true), L('b', 50, 1, 4, 1, 50, 1, false), L('zero', 0, 5, 10), L('none', 100, 0, 10)]
    const r = computeLoads(loads, 1)
    // a: 2000 Wh, night 600 ; b: 200 Wh, night 100
    expect(r.dailyWh).toBe(2200)
    expect(r.nightWh).toBe(700)
    expect(r.dayWh).toBe(1500)
    expect(r.criticalWh).toBe(2000)
    expect(r.criticalNightWh).toBe(600)
    expect(r.connectedW).toBe(250)
    expect(r.criticalConnectedW).toBe(200)
    expect(r.surgeW).toBe(250) // surgeFactor 0.5 clamps to 1 → no extra
  })
  it('empty load list yields zeros, not NaN/−Infinity', () => {
    const r = computeLoads([], 0.8)
    for (const v of Object.values(r)) expect(v).toBe(0)
  })
  it('fixture (b): 25 kWh/day, 15 kWh night, P_sum 7720, P_peak 6176, P_surge 8776', () => {
    const r = computeLoads(loadsB, 0.8)
    expect(r.dailyWh).toBeCloseTo(25000, 6)
    expect(r.nightWh).toBeCloseTo(15000, 6)
    expect(r.connectedW).toBe(7720)
    expect(r.peakW).toBeCloseTo(6176, 9)
    expect(r.surgeW).toBeCloseTo(8776, 9) // 6176 + 1300 × (3 − 1)
  })
})

// ---------------------------------------------------------------- §3.3 cell temperature
describe('§3.3 NOCT cell temperature', () => {
  it('T_cell = T_amb + (NOCT − 20)/800 × G', () => {
    expect(cellTemp(36, 45)).toBe(61) // 36 + 25/800 × 800 (spec example: Khartoum 36 °C → 61 °C)
    expect(cellTemp(20, 42)).toBe(42) // at NOCT conditions the cell IS at NOCT
    expect(cellTemp(36, 45, 1000)).toBeCloseTo(67.25, 9) // 36 + 25 × 1.25 (hot-extreme string check)
    expect(cellTemp(45, 45, 1000)).toBeCloseTo(76.25, 9)
  })
})

// ---------------------------------------------------------------- §3.2 derate chain & §3.1 PV sizing
describe('§3 derate chain and PV sizing', () => {
  it('grid-tied Dubai: f_temp 0.898 × soil 0.97 × shade 1 × wire 0.97 × mm 0.97 × inv 0.96 × avail 0.98 = 0.771061', () => {
    const r = computeProject(projectC())
    // f_temp = 1 − 0.003 × (59 − 25) = 0.898 ; 0.898 × 0.97 = 0.87106 ; × 0.97 = 0.8449282 ; × 0.97 = 0.8195804 ; × 0.96 = 0.7867971 ; × 0.98 = 0.7710612
    expect(r.derateBreakdown[0].factor).toBeCloseTo(0.898, 9)
    expect(r.derate).toBeCloseTo(0.7710612, 6)
    // derate must equal the product of the displayed breakdown (no hidden rounding)
    expect(r.derate).toBeCloseTo(r.derateBreakdown.reduce((a, b) => a * b.factor, 1), 12)
    expect(r.derateBreakdown.some((b) => b.name.startsWith('Battery'))).toBe(false)
  })
  it('off-grid Khartoum: 0.892 base chain × battery round-trip 0.92 (100 % via battery) = 0.704637', () => {
    const r = computeProject(projectA())
    // f_temp = 1 − 0.003 × 36 = 0.892 ; × 0.97 × 0.97 × 0.97 × 0.96 × 0.98 = 0.7659093 ; × 0.92 = 0.7046366
    expect(r.derateBreakdown[0].factor).toBeCloseTo(0.892, 9)
    expect(r.derate).toBeCloseTo(0.7046366, 6)
    expect(r.derateBreakdown.at(-1)!.factor).toBeCloseTo(0.92, 9)
  })
  it('hybrid Riyadh: night share 60 % → battery factor 1 − 0.6 × 0.08 = 0.952 ; derate 0.771061 × 0.952 = 0.734050', () => {
    const r = computeProject(projectB())
    expect(r.derateBreakdown.at(-1)!.factor).toBeCloseTo(0.952, 9)
    expect(r.derate).toBeCloseTo(0.7340503, 6)
  })
  it('PV_kWp = E/(PSH × D) × oversize ; N = ceil(kWp × 1000 / 580)', () => {
    const a = computeProject(projectA())
    // 3 / (6.0 × 0.7046366) × 1.2 = 3.6 / 4.2278 = 0.85150 kWp → ceil(851.5/580) = 2 → 1.16 kWp
    expect(a.requiredPvKwp).toBeCloseTo(0.85150, 4)
    expect(a.panelQty).toBe(2)
    expect(a.arrayKwp).toBeCloseTo(1.16, 9)
    const b = computeProject(projectB())
    // 25 / (5.8 × 0.7340503) = 25 / 4.25749 = 5.87201 kWp → ceil(5872/580) = 11 → string rounding → 12 (2 × 6)
    expect(b.requiredPvKwp).toBeCloseTo(5.87201, 4)
    expect(b.panelQty).toBe(12)
    expect(b.strings!.notes.join(' ')).toMatch(/adjusted from 11 to 12/)
  })
  it('monthly production uses days-in-month; annual = kWp × PSH × 365 × D when PSH is flat', () => {
    const r = computeProject(projectB())
    // 6.96 × 5.8 × 365 × 0.7340503 = 10815.7 kWh ; Feb = 6.96 × 5.8 × 28 × 0.7340503 = 829.69
    expect(r.annualProductionKwh).toBeCloseTo(6.96 * 5.8 * 365 * r.derate, 6)
    expect(r.annualProductionKwh).toBeCloseTo(10815.7, 0)
    expect(r.monthlyProductionKwh[1]).toBeCloseTo(6.96 * 5.8 * 28 * r.derate, 6)
    expect(r.specificYield).toBeCloseTo(5.8 * 365 * r.derate, 6) // 1554.0 kWh/kWp
    expect(r.monthlyKwh).toBeCloseTo(25 * 30.4, 6)
    expect(r.annualKwh).toBeCloseTo(25 * 365, 6)
  })
  it('falls back to the annual PSH when monthlyPsh is not a 12-entry array', () => {
    const p = projectB()
    p.site.monthlyPsh = []
    const r = computeProject(p)
    expect(r.monthlyProductionKwh).toHaveLength(12)
    expect(r.annualProductionKwh).toBeCloseTo(r.arrayKwp * 5.8 * 365 * r.derate, 6)
  })
  it('off-grid default carries the §3.1 offGridMargin 1.20; hybrid/grid-tied 1.0', () => {
    expect(defaultDesign('offgrid').pvOversize).toBe(1.2)
    expect(defaultDesign('hybrid').pvOversize).toBe(1.0)
    expect(defaultDesign('gridtie').pvOversize).toBe(1.0)
  })
})

// ---------------------------------------------------------------- §4 battery
describe('§4 battery sizing', () => {
  it('off-grid: C = E_day × N / (DoD × η_inv) with η_inv 0.95 and the unit DoD (90 %) → 3000/(0.9 × 0.95) = 3508.8 Wh', () => {
    expect(INV_EFF_BATT).toBe(0.95)
    const r = computeProject(projectA())
    expect(r.batteryRequiredKwh).toBeCloseTo(3.508772, 5)
    expect(r.batteryQty).toBe(1)
    expect(r.batteryConfig).toEqual({ series: 1, parallel: 1 }) // round(48/51.2) = 1
    expect(r.batteryKwh).toBeCloseTo(5.12, 9)
    expect(r.batteryUsableKwh).toBeCloseTo(4.608, 9) // 5.12 × 0.9
    expect(r.batteryAh).toBe(100)
    // backup hours = usable Wh × 0.95 / (night Wh / 12 h) = 4608 × 0.95 / 250 = 17.5104 h
    expect(r.batteryHoursBackup).toBeCloseTo(17.5104, 4)
  })
  it('hybrid: night energy only → 15000/(0.9 × 0.95) = 17543.9 Wh → 4 × 5.12 kWh, 400 Ah, 14.008 h', () => {
    const r = computeProject(projectB())
    expect(r.batteryRequiredKwh).toBeCloseTo(17.54386, 4)
    expect(r.batteryQty).toBe(4) // ceil(17.54/5.12) = ceil(3.43) = 4
    expect(r.batteryConfig).toEqual({ series: 1, parallel: 4 })
    expect(r.batteryAh).toBe(400)
    expect(r.batteryHoursBackup).toBeCloseTo((20.48 * 0.9 * 1000 * 0.95) / (15000 / 12), 6) // 14.00832
  })
  it('series × parallel for 12.8 V units on a 48 V bus: 7 kWh / 1.28 → 6 needed → 4S × 2P = 8 units, 200 Ah', () => {
    const p = projectA()
    p.design = { ...p.design, batteryId: 'bat-gen-12v100-lfp', generatorBackup: false }
    p.loads = [L('x', 1000, 1, 5.985)] // 5985 Wh / (0.9 × 0.95) = 7000 Wh
    const r = computeProject(p)
    expect(r.batteryRequiredKwh).toBeCloseTo(7.0, 6)
    expect(r.batteryConfig).toEqual({ series: 4, parallel: 2 }) // round(48/12.8) = 4 ; ceil(6/4) = 2
    expect(r.batteryQty).toBe(8)
    expect(r.batteryAh).toBe(200) // parallel × 100 Ah (series does not add Ah)
    expect(r.batteryKwh).toBeCloseTo(10.24, 9)
  })
  it('auto-selected unit: requirement is re-based on the unit DoD before counting modules (HV: BYD HVS 10.24 kWh, DoD 100 %)', () => {
    const p = projectB()
    p.design = { ...p.design, systemVoltage: 'hv', batteryId: 'auto', inverterId: null, generatorBackup: false }
    p.loads = [L('x', 1000, 1, 7.695)] // night 7695 Wh → 7.695 / (0.9 × 0.95) = 9.000 kWh at the chemistry DoD
    const r = computeProject(p)
    expect(recommendBattery('hv', 9)?.id).toBe('bat-byd-hvs102') // 1 module (vs 2 × LUNA 5 kWh)
    expect(r.dod).toBe(1.0)
    expect(r.batteryRequiredKwh).toBeCloseTo(8.1, 6) // 9.0 × 0.9 / 1.0
    expect(r.batteryQty).toBe(1)
    expect(r.batteryUsableKwh).toBeGreaterThanOrEqual(r.batteryRequiredKwh)
  })
  it('recommendBattery prefers the fewest modules, then lowest $/kWh, within parallelMax', () => {
    // 10 kWh at 48 V: one-module candidates 48v200 ($122/kWh), 48v280 ($118.6/kWh), 48v300 ($120.4/kWh), felicity ($156/kWh) → 48v280
    expect(recommendBattery(48, 10)?.id).toBe('bat-gen-48v280')
    expect(recommendBattery(12, 1, 'AGM')?.id).toBe('bat-gen-12v200-agm')
    expect(recommendBattery(48, 5, 'NMC')).toBeNull()
  })
  it('fitsSystemVoltage: 2 V OPzS cells and 12/24/48 V units on a 48 V bus; 48 V unit rejected on 24 V', () => {
    const b = (v: number) => ({ ...catalog.batteries[0], nominalVoltage: v })
    expect(fitsSystemVoltage(b(2), 48)).toBe(true) // 24S exact
    expect(fitsSystemVoltage(b(12), 48)).toBe(true)
    expect(fitsSystemVoltage(b(24), 48)).toBe(true)
    expect(fitsSystemVoltage(b(48), 24)).toBe(false) // k = round(0.5) = 1 → |48 − 24|/24 = 100 %
    expect(fitsSystemVoltage(b(51.2), 24)).toBe(false) // k = 0
    expect(fitsSystemVoltage(b(12.8), 12)).toBe(true)
  })
  it('C-rate: inverter 12 kW on a single 100 A module → I = 12000/(48 × 0.95) = 263 A > 100 A → warning', () => {
    const p = projectB()
    p.design = { ...p.design, inverterId: 'inv-deye-12k-sg02lp1', batteryOverrideQty: 1, generatorBackup: false }
    const r = computeProject(p)
    expect(r.batteryQty).toBe(1)
    expect(check(r, 'batt-discharge')?.level).toBe('warn')
    expect(check(r, 'batt-discharge')?.message).toMatch(/263 A/)
  })
  it('off-grid without a battery is an error, hybrid without one a warning', () => {
    const a = projectA(); a.design = { ...a.design, batteryId: null }
    expect(check(computeProject(a), 'no-batt')?.level).toBe('error')
    const b = projectB(); b.design = { ...b.design, batteryId: null }
    expect(check(computeProject(b), 'no-batt')?.level).toBe('warn')
  })
})

// ---------------------------------------------------------------- §5 inverter
describe('§5 inverter sizing & auto-selection', () => {
  it('P_req = P_peak × 1.25 (hybrid: critical loads × DF)', () => {
    expect(computeProject(projectB()).requiredInverterKw).toBeCloseTo(7.72, 9) // 7720 × 0.8 × 1.25 / 1000
    expect(computeProject(projectA()).requiredInverterKw).toBeCloseTo(0.5125, 9) // 410 × 1.25
  })
  it('single unit: smallest matching type/phase/bus voltage with kW ≥ req and surge ≥ P_surge', () => {
    expect(recommendInverter('hybrid', 1, 7.72, 8.776, 48)).toEqual({ inverter: expect.objectContaining({ id: 'inv-deye-8k-sg01lp1' }), qty: 1 })
    expect(recommendInverter('hybrid', 3, 7.72, 8.776, 48)?.inverter.id).toBe('inv-deye-8k-sg04lp3')
    // HV 3-ph: 20 kW Deye has kW < 25 → 30 kW unit
    expect(recommendInverter('hybrid', 3, 25, 30, 'hv')?.inverter.id).toBe('inv-deye-30k-sg01hp3')
    // surge rejects: 6176 W peak × 1.25 = 7.72 kW but a 20 kW surge needs more than the 8 kW Deye (16 kW surge) → next unit whose surge ≥ 20 kW is the Luxpower 10 kW (20 kW surge)
    expect(recommendInverter('hybrid', 1, 7.72, 20, 48)?.inverter.id).toBe('inv-lux-lxp-lb-eu-10k')
    expect(recommendInverter('hybrid', 1, 7.72, 21, 48)?.inverter.id).toBe('inv-deye-12k-sg02lp1') // 24 kW surge
    // grid-tied ignores the battery-voltage filter
    expect(recommendInverter('gridtie', 3, 100, 100, 48)?.inverter.id).toBe('inv-huawei-100ktl-m2')
  })
  it('parallel stacking: 40 kW single-phase 48 V → 3 × 16 kW (ceil(40/16) = 3 ≤ parallelMax 16)', () => {
    expect(recommendInverter('hybrid', 1, 40, 40, 48)).toEqual({ inverter: expect.objectContaining({ id: 'inv-deye-16k-sg01lp1' }), qty: 3 })
  })
  it('no candidate (3-phase at 12 V) → null and an error check on the project', () => {
    expect(recommendInverter('offgrid', 3, 1, 1, 12)).toBeNull()
    const p = projectA(); p.design = { ...p.design, systemVoltage: 12, phase: 3, generatorBackup: false }
    const r = computeProject(p)
    expect(r.inverter).toBeNull()
    expect(r.strings).toBeNull()
    expect(r.cables).toEqual([])
    expect(check(r, 'no-inverter')?.level).toBe('error')
  })
  it('undersized manual choice is an error; phase mismatch is an error; 3-ph loads on 1-ph is an error', () => {
    const p = projectB()
    p.design = { ...p.design, inverterId: 'inv-deye-5k-sg03lp1', coincidenceFactor: 1 } // 7720 × 1.25 = 9.65 kW > 5
    const r = computeProject(p)
    expect(check(r, 'inv-small')?.level).toBe('error')
    const q = projectB(); q.design = { ...q.design, inverterId: 'inv-deye-8k-sg04lp3' } // 3-ph unit in a 1-ph project
    expect(check(computeProject(q), 'inv-phase')?.level).toBe('error')
    const s = projectB(); s.loads = [L('m', 3700, 1, 6, 4, 50, 3)]
    expect(check(computeProject(s), 'load-phase')?.level).toBe('error')
  })
  it('> 15 kW on a 48 V bus raises the HV-recommendation warning', () => {
    const p = projectB(); p.design = { ...p.design, inverterId: 'inv-deye-16k-sg01lp1' }
    expect(check(computeProject(p), 'lv-bus')?.level).toBe('warn')
    expect(check(computeProject(projectB()), 'lv-bus')).toBeUndefined()
  })
})

// ---------------------------------------------------------------- §7 strings
describe('§7 string design', () => {
  it('Voc_cold / Vmp_hot per module and fixture (b) 2 × 5', () => {
    const s = designStrings(M580, inv8k, 1, 10, 0, 45)
    // Voc_cold = 51.5 × (1 + (−0.0025)(0 − 25)) = 54.71875 ; N_max = floor(500 × 0.97 / 54.71875) = 8 ; MPPT max at STC floor(425/43) = 9
    // T_cell_hot = 45 + 31.25 = 76.25 → Vmp_hot = 43 × (1 − 0.003 × 51.25) = 36.389 ; N_min = ceil(150/36.389) = 5
    // 10 panels: 5 × 2 has zero waste → chosen ; string Voc_cold = 273.6 V ; Vmp_hot = 181.9 V
    expect(s.panelsPerString).toBe(5)
    expect(s.strings).toBe(2)
    expect(s.vocCold).toBeCloseTo(273.6, 1)
    expect(s.vmpHot).toBeCloseTo(181.9, 1)
    expect(s.stringIscA).toBe(14)
    expect(s.stringsPerMppt).toBe(1) // floor(22/13.49) = 1
    expect(s.mpptsUsed).toBe(2)
    expect(s.ok).toBe(true)
  })
  it('MPPT upper limit is enforced at STC Vmp, not hot Vmp', () => {
    // Vmax 600 → N_voc = floor(582/54.72) = 10 ; MPPT max 300 V: floor(300/43) = 6 at STC (floor(300/36.39) = 8 would clip on cold mornings)
    const inv: Inverter = { ...inv8k, maxPvVoltage: 600, mpptMinV: 100, mpptMaxV: 300, mpptCount: 1, maxInputCurrentPerMppt: 30 }
    const s = designStrings(M580, inv, 1, 12, 0, 45)
    expect(s.panelsPerString).toBe(6)
    expect(s.strings).toBe(2)
    expect(6 * M580.vmp).toBeLessThanOrEqual(300)
    expect(s.vocCold).toBeCloseTo(328.3, 1) // 6 × 54.71875
    expect(s.stringsPerMppt).toBe(2) // floor(30/13.49) = 2
  })
  it('prefers long strings: 207 panels on a 1000 V / 10 × 30 A inverter → 13 × 16 (not 23 × 9)', () => {
    const inv100: Inverter = { ...inv8k, id: 'i100', phase: 3, type: 'gridtie', ratedAcKw: 100, maxPvInputKw: 150, maxPvVoltage: 1000, mpptMinV: 200, mpptMaxV: 1000, mpptCount: 10, maxInputCurrentPerMppt: 30, batteryVoltage: null }
    const s = designStrings(M580, inv100, 1, 207, 0, 45)
    // N_max = floor(970/54.71875) = 17 ; 16 × 13 = 208 (1 spare, score 10 + 3 + 3 = 16) beats 9 × 23 = 207 (score 0 + 3 + 24 = 27) and 17 × 13 = 221 (143)
    expect(s.panelsPerString).toBe(16)
    expect(s.strings).toBe(13)
    expect(s.totalPanels).toBe(208)
    expect(s.vocCold).toBeCloseTo(875.5, 1) // 16 × 54.71875
    expect(s.ok).toBe(true) // 13 ≤ 10 MPPT × 2 strings
  })
  it('window too narrow (N_min > N_max) is reported and ok = false', () => {
    const inv: Inverter = { ...inv8k, maxPvVoltage: 150, mpptMinV: 150, mpptMaxV: 140, mpptCount: 1 }
    const s = designStrings(M580, inv, 1, 4, 0, 45) // N_max = floor(145.5/54.72) = 2 ; N_min = ceil(150/36.39) = 5
    expect(s.ok).toBe(false)
    expect(s.notes.join(' ')).toMatch(/too narrow: need ≥5 panels\/string for MPPT min but max is 2/)
  })
  it('more strings than MPPT inputs → ok = false with a combiner note', () => {
    const s = designStrings(M580, inv8k, 1, 30, 0, 45) // capacity = 2 MPPT × 1 string
    expect(s.strings).toBeGreaterThan(2)
    expect(s.ok).toBe(false)
    expect(s.notes.join(' ')).toMatch(/exceed inverter MPPT capacity \(2\)/)
  })
  it('Isc vs MPPT limit: 720 W module (18.45 A) on a 13 A input is an error; 580 W (Isc 14.37, Imp 13.62) only warns of clipping', () => {
    const p = projectB(); p.design = { ...p.design, panelId: 'pnl-cs-720-topbihiku7', inverterId: 'inv-deye-5k-sg03lp1', generatorBackup: false }
    expect(check(computeProject(p), 'isc-mppt')?.level).toBe('error') // 18.45 > 13 × 1.25 = 16.25
    const q = projectB(); q.design = { ...q.design, inverterId: 'inv-deye-5k-sg03lp1', generatorBackup: false, coincidenceFactor: 0.5 }
    const r = computeProject(q)
    expect(check(r, 'isc-mppt')).toBeUndefined() // 14.37 ≤ 16.25
    expect(check(r, 'imp-mppt')?.level).toBe('warn') // 13.62 > 13
  })
  it('end-to-end fixture (c): 215 → 12 strings × 18 = 216 panels, 125.28 kWp, Voc_cold 984.4 V < 1000', () => {
    const r = computeProject(projectC())
    // 528 kWh/day / (5.5 × 0.771061) = 124.50 kWp → 215 panels ; N_max = floor(1067/54.687) = 19 ; 18 × 12 = 216 (1 spare) wins
    expect(r.requiredPvKwp).toBeCloseTo(124.504, 2)
    expect(r.strings!.panelsPerString).toBe(18)
    expect(r.strings!.strings).toBe(12)
    expect(r.panelQty).toBe(216)
    expect(r.arrayKwp).toBeCloseTo(125.28, 9)
    expect(r.strings!.vocCold).toBeCloseTo(984.4, 1) // 18 × 51.47 × 1.0625
    expect(r.strings!.vmpHot).toBeCloseTo(655.7, 1) // 18 × 42.59 × (1 − 0.003 × 48.25)
    expect(r.strings!.stringsPerMppt).toBe(2)
    expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
  })
  it('inverter/charger without PV input (Victron) is designed against the MPPT controller: 2S1P under 150 V, 150/35 controller', () => {
    const r = computeProject(projectA())
    expect(r.inverter?.id).toBe('inv-victron-mp2-5000') // smallest 48 V unit in the catalogue
    expect(r.controller?.id).toBe('cc-victron-150-35')
    expect(r.requiredControllerA).toBeCloseTo((1160 * 1.25) / 48, 6) // 30.21 A
    expect(r.controllerQty).toBe(1)
    expect(r.strings).toMatchObject({ panelsPerString: 2, strings: 1, totalPanels: 2 })
    expect(r.strings!.vocCold).toBeCloseTo(108.1, 1) // 2 × 51.47 × (1 + 0.0025 × 20)
    expect(check(r, 'inv-charger')?.level).toBe('ok')
  })
})

// ---------------------------------------------------------------- §8 cables & protection
describe('§8 cable sizing and protection', () => {
  it('DC: Vd = 2 L I ρ / A with ρ 0.0206; 14 A, 12 m, 86 V → 4 mm² (floor), 2.01 %, fuse nextStd(1.56 × 14 = 21.8) = 25 A', () => {
    const c = sizeCable('dc', 14, 12, 86, 3)
    // Vd = 2 × 12 × 14 × 0.0206 / 4 = 1.7304 V → 1.7304 / 86 = 2.012 %
    expect(c.sizeMm2).toBe(4)
    expect(c.dropPct).toBeCloseTo(2.01, 2)
    expect(c.breakerA).toBe(25)
    expect(c.currentA).toBe(14)
    expect(c.voltage).toBe(86)
  })
  it('three-phase uses √3: 144.3 A, 40 m, 400 V → 95 mm² (232 × 0.87 = 201.8 ≥ 180.4), 0.54 %, 200 A breaker', () => {
    const c = sizeCable('ac', 144.3, 40, 400, 2, true)
    // Vd = √3 × 40 × 144.3 × 0.0206 / 95 = 2.168 V → 0.542 % ; 70 mm² fails ampacity (192 × 0.87 = 167 < 180.4)
    expect(c.sizeMm2).toBe(95)
    expect(c.dropPct).toBeCloseTo(0.54, 2)
    expect(c.breakerA).toBe(200) // nextStd(144.3 × 1.25 = 180.4)
    const single = sizeCable('ac', 144.3, 40, 400, 2, false)
    expect(single.dropPct / c.dropPct).toBeCloseTo(2 / Math.sqrt(3), 1) // same size, k = 2 vs √3
  })
  it('AC minimum is 2.5 mm²: 4.35 A → 2.5 mm², 0.47 %, 6 A MCB', () => {
    const c = sizeCable('ac', 4.35, 15, 230, 2)
    // Vd = 2 × 15 × 4.35 × 0.0206 / 2.5 = 1.0753 V → 0.4675 %
    expect(c.sizeMm2).toBe(2.5)
    expect(c.dropPct).toBeCloseTo(0.47, 2)
    expect(c.breakerA).toBe(6) // nextStd(5.44)
  })
  it('battery minimum is 10 mm² and the fuse list starts at 63 A: 22.2 A → 10 mm², 0.38 %, 63 A', () => {
    const c = sizeCable('battery', 22.2, 2, 48, 1.5)
    // Vd = 2 × 2 × 22.2 × 0.0206 / 10 = 0.1829 V → 0.381 %
    expect(c.sizeMm2).toBe(10)
    expect(c.dropPct).toBeCloseTo(0.38, 2)
    expect(c.breakerA).toBe(63)
  })
  it('ampacity derating k_amb 0.87 × 1.25 design margin picks the size: 175.4 A battery → 120 mm² (269 × 0.87 = 234 ≥ 219.3; 95 mm² gives 201.8)', () => {
    const c = sizeCable('battery', 175.44, 2, 48, 1.5)
    expect(c.sizeMm2).toBe(120)
    expect(c.breakerA).toBe(250) // nextStd(219.3)
    expect(c.dropPct).toBeCloseTo(0.25, 2) // 2 × 2 × 175.44 × 0.0206 / 120 = 0.1205 V → 0.251 %
  })
  it('when no size meets the drop target the largest (240 mm²) is returned with its real drop, and the project warns', () => {
    const c = sizeCable('dc', 14, 1000, 86, 2)
    // Vd(240) = 2 × 1000 × 14 × 0.0206 / 240 = 2.403 V → 2.79 % > 2 %
    expect(c.sizeMm2).toBe(240)
    expect(c.dropPct).toBeCloseTo(2.79, 2)
    // In project B the string runs at 5 × 43 = 215 V, so 1000 m only drops 1.1 %; 3000 m → 2 × 3000 × 14.2 × 0.0206 / 240 = 7.3 V → 3.4 % > 2 %
    const p = projectB(); p.design = { ...p.design, dcCableRunM: 3000, generatorBackup: false }
    expect(check(computeProject(p), 'vdrop-dc')?.level).toBe('warn')
    expect(check(computeProject(projectB()), 'vdrop-dc')).toBeUndefined()
  })
  it('roundUpStd returns the next standard size and silently caps at the list maximum', () => {
    expect(roundUpStd(21.84, STD_PV_FUSE_A)).toBe(25)
    expect(roundUpStd(32, STD_PV_FUSE_A)).toBe(32)
    expect(roundUpStd(1000, STD_MCB_A)).toBe(400)
  })
  it('end-to-end fixture (b) cables: DC 4 mm² at 255.5 V (1.16 %), battery 175.4 A → 120 mm² / 250 A, AC 34.8 A → 10 mm² / 50 A (0.93 %)', () => {
    const r = computeProject(projectB())
    const dc = r.cables.find((c) => c.use === 'dc')!, bt = r.cables.find((c) => c.use === 'battery')!, ac = r.cables.find((c) => c.use === 'ac')!
    expect(dc).toMatchObject({ sizeMm2: 4, voltage: 256, breakerA: 25 }) // 6 × 42.59 = 255.5 V ; 2.96 V / 255.5 = 1.16 %
    expect(dc.dropPct).toBeCloseTo(1.16, 2)
    expect(bt.currentA).toBeCloseTo(175.4, 1) // 8000 / (48 × 0.95)
    expect(bt).toMatchObject({ sizeMm2: 120, breakerA: 250 })
    expect(ac.currentA).toBeCloseTo(34.8, 1) // 8000 / 230
    expect(ac).toMatchObject({ sizeMm2: 10, breakerA: 50 })
    expect(ac.dropPct).toBeCloseTo(0.93, 2) // 2 × 15 × 34.78 × 0.0206 / 10 = 2.15 V / 230
  })
  it('end-to-end fixture (c) AC: 100 kW / (√3 × 400) = 144.3 A → 95 mm², 200 A, 0.20 % over 15 m', () => {
    const ac = computeProject(projectC()).cables.find((c) => c.use === 'ac')!
    expect(ac.currentA).toBeCloseTo(144.3, 1)
    expect(ac).toMatchObject({ sizeMm2: 95, breakerA: 200, voltage: 400 })
    expect(ac.dropPct).toBeCloseTo(0.2, 2) // √3 × 15 × 144.34 × 0.0206 / 95 = 0.813 V / 400
  })
})

// ---------------------------------------------------------------- §11 generator
describe('§11 generator sizing', () => {
  it('fixture (b): charge 0.2 C × 20.48 = 4.096 kW (< 9.12 kW charger); (6.176 + 4.096/0.95) × 1.1 / 0.8 = 14.4 kVA ≥ 1.5 × 8 → 15 kVA', () => {
    expect(computeProject(projectB()).generatorKva).toBe(15)
  })
  it('fixture (a): (0.41 + 1.024/0.95) × 1.1 / 0.8 = 2.05 kVA but ≥ 1.5 × 4 kW inverter = 6 → 7.5 kVA', () => {
    expect(computeProject(projectA()).generatorKva).toBe(7.5)
  })
  it('lead-acid recharges at 0.1 C: 28 × 2.4 kWh AGM = 67.2 kWh → 6.72 kW; (5 + 6.72/0.95) × 1.1 / 0.8 = 16.6 kVA → 20 kVA', () => {
    const p = projectB()
    p.design = { ...p.design, batteryId: 'bat-gen-12v200-agm', coincidenceFactor: 1 }
    p.loads = [L('x', 5000, 1, 6)] // night 30 kWh → 30 / (0.5 × 0.95) = 63.2 kWh → ceil(63.2/2.4) = 27 → 4S × 7P = 28 units
    const r = computeProject(p)
    expect(r.batteryQty).toBe(28)
    expect(r.batteryKwh).toBeCloseTo(67.2, 9)
    expect(r.generatorKva).toBe(20)
  })
  it('user override wins; no generator when disabled', () => {
    const p = projectB(); p.design = { ...p.design, generatorKva: 20 }
    expect(computeProject(p).generatorKva).toBe(20)
    const q = projectB(); q.design = { ...q.design, generatorBackup: false }
    expect(computeProject(q).generatorKva).toBeNull()
  })
})

// ---------------------------------------------------------------- §12 BOM
describe('§12 bill of materials quantity rules', () => {
  it('fixture (b) mounting: rail 12 × 1.134 × 2 × 1.05 = 28.58 m; mid 2 × 12 − 2 × 2 rows = 20; end 4 × 2 = 8; splices ceil(28.58/4.2) − 4 = 3', () => {
    const r = computeProject(projectB())
    expect(bomQty(r, 'rail')).toBeCloseTo(28.58, 2)
    expect(bomQty(r, 'mid-clamp')).toBe(20)
    expect(bomQty(r, 'end-clamp')).toBe(8)
    expect(bomQty(r, 'rail-splice')).toBe(3)
    expect(bomQty(r, 'triangle-frame')).toBe(12) // flat-concrete default
    expect(bomQty(r, 'ballast-block')).toBe(24)
  })
  it('fixture (b) electrical: DC 2 strings × 20 m × 2 = 80 m; MC4 2 × 2 + 2 = 6; no combiner/fuses (1 string per MPPT); AC 15 m × 3 cores = 45 m', () => {
    const r = computeProject(projectB())
    expect(bomQty(r, 'dc-cable-4')).toBe(80)
    expect(bomQty(r, 'mc4-pair')).toBe(6)
    expect(bomQty(r, 'combiner-box')).toBeUndefined()
    expect(r.bom.some((b) => b.id.startsWith('pv-fuse'))).toBe(false)
    expect(bomQty(r, 'dc-isolator')).toBe(1)
    expect(bomQty(r, 'spd-dc')).toBe(1)
    expect(bomQty(r, 'batt-cable-95')).toBeCloseTo(6.4, 6) // (2 × 2 + 4 × 0.6) × 1 (largest stocked size for a 120 mm² result)
    expect(bomQty(r, 'cable-lug')).toBe(20) // 4 × 4 + 4
    expect(bomQty(r, 'batt-fuse-250')).toBe(1)
    expect(bomQty(r, 'ac-cable-10')).toBe(45)
    expect(bomQty(r, 'ac-mcb-63')).toBe(2) // inverter output + grid input
    expect(bomQty(r, 'changeover-63')).toBe(1)
    expect(bomQty(r, 'ct-meter')).toBe(1)
    expect(bomQty(r, 'wifi-dongle')).toBe(1)
    expect(bomQty(r, 'earth-rod')).toBe(1)
    expect(bomQty(r, 'earth-cable')).toBeCloseTo(34.4, 6) // 20 + 12 × 1.2
    expect(bomQty(r, 'conduit')).toBe(37) // 20 + 15 + 2
    expect(bomQty(r, 'cable-ties-labels')).toBe(1)
    expect(bomQty(r, 'generator')).toBe(1)
    expect(bomQty(r, 'battery-rack')).toBe(1) // ceil(4/4)
  })
  it('fixture (c): 3-ph AC cable 15 × 5 cores = 75 m; 12 strings on 10 MPPTs (≤ 2 per input) need no string fuses; > 20 kWp adds a lightning arrestor and 2 earth rods', () => {
    const r = computeProject(projectC())
    expect(bomQty(r, 'ac-cable-35')).toBe(75)
    expect(bomQty(r, 'dc-cable-4')).toBe(480) // 12 × 20 × 2
    expect(bomQty(r, 'mc4-pair')).toBe(26)
    expect(bomQty(r, 'combiner-box')).toBeUndefined()
    expect(bomQty(r, 'rail')).toBeCloseTo(514.39, 2) // 216 × 1.134 × 2 × 1.05
    expect(bomQty(r, 'mid-clamp')).toBe(388) // 432 − 22 × 2
    expect(bomQty(r, 'end-clamp')).toBe(88) // 22 rows × 4
    expect(bomQty(r, 'rail-splice')).toBe(79) // ceil(514.39/4.2) = 123 − 44
    expect(bomQty(r, 'earth-rod')).toBe(2)
    expect(bomQty(r, 'lightning-arrestor')).toBe(1)
    expect(bomQty(r, 'earth-cable')).toBeCloseTo(279.2, 6) // 20 + 216 × 1.2
    expect(bomQty(r, 'cable-ties-labels')).toBe(11) // ceil(216/20)
    expect(bomQty(r, 'changeover-63')).toBeUndefined() // grid-tied
  })
  it('string fuses + combiner appear only when ≥ 3 strings share one MPPT input: 18 panels on a single-MPPT SPF 5000 ES → 3 × 6S → 6 fuses, 1 combiner', () => {
    const p = projectA()
    p.design = { ...p.design, inverterId: 'inv-growatt-spf5000es', panelOverrideQty: 18, generatorBackup: false }
    const r = computeProject(p)
    expect(r.strings).toMatchObject({ panelsPerString: 6, strings: 3 })
    expect(bomQty(r, 'combiner-box')).toBe(1) // ceil(3/6)
    expect(bomQty(r, 'pv-fuse-30')).toBe(6) // 2 per string; 1.56 × 14.37 = 22.4 → 25 A → stocked 30 A item
    expect(check(r, 'strings')?.level).toBe('warn') // 3 strings > 1 MPPT × 1 string capacity
  })
  it('controller path (Victron, 1 string) gets no combiner; roof type drives the fixings', () => {
    const r = computeProject(projectA())
    expect(bomQty(r, 'combiner-box')).toBeUndefined()
    expect(r.bom.some((b) => b.id.startsWith('pv-fuse'))).toBe(false)
    expect(bomQty(r, 'ac-cable-4')).toBe(45)
    const tile = projectA(); tile.site = { ...tile.site, roofType: 'pitched-tile' }
    expect(bomQty(computeProject(tile), 'tile-hook')).toBe(5) // 2 × 2.5
    const ground = projectC(); ground.site = { ...ground.site, roofType: 'ground' }
    const g = computeProject(ground)
    expect(bomQty(g, 'ground-structure')).toBeCloseTo(125.28, 2) // per kWp
    expect(bomQty(g, 'rail')).toBeUndefined()
  })
  it('pricing overrides: excluded ids drop out, qty/price overrides apply, services carry labour per kWp', () => {
    const p = projectB()
    p.pricing = { ...defaultPricing(0, 0), excludedIds: ['spd-ac'], qtyOverrides: { 'earth-rod': 3 }, priceOverrides: { 'earth-rod': 10 } }
    const r = computeProject(p)
    expect(bomQty(r, 'spd-ac')).toBeUndefined()
    const rod = r.bom.find((b) => b.id === 'earth-rod')!
    expect(rod).toMatchObject({ qty: 3, unitPriceUsd: 10, totalUsd: 30 })
    expect(r.labourUsd).toBeCloseTo(6.96 * 120 + 100 + 150, 6) // 1085.2
  })
  it('cost chain: margin on subtotal, discount on (subtotal + margin), VAT after discount', () => {
    const p = projectB()
    p.pricing = { ...defaultPricing(20, 15), discountPct: 5 }
    const r = computeProject(p)
    expect(r.subtotalUsd).toBeCloseTo(r.equipmentCostUsd + r.labourUsd, 6)
    expect(r.marginUsd).toBeCloseTo(0.2 * r.subtotalUsd, 6)
    expect(r.discountUsd).toBeCloseTo(0.05 * 1.2 * r.subtotalUsd, 6)
    expect(r.vatUsd).toBeCloseTo(0.15 * (1.2 - 0.06) * r.subtotalUsd, 6)
    expect(r.totalUsd).toBeCloseTo(1.311 * r.subtotalUsd, 6) // 1.2 × 0.95 × 1.15
    expect(r.costPerWp).toBeCloseTo(r.totalUsd / 6960, 9)
  })
})

// ---------------------------------------------------------------- §10 economics
describe('§10 economics', () => {
  it('savings are capped at consumption; payback = capex / savings; CO₂ = offset × EF', () => {
    const p = projectC()
    const r = computeProject(p)
    // production 125.28 × 5.5 × 365 × 0.771061 = 193 922 kWh > consumption 22 kW × 24 × 365 = 192 720 kWh → offset 192 720
    expect(r.annualProductionKwh).toBeCloseTo(193921.6, 0)
    expect(r.annualKwh).toBeCloseTo(192720, 6)
    expect(r.annualSavingsUsd).toBeCloseTo(192720 * p.site.gridTariff, 6)
    expect(r.paybackYears).toBeCloseTo(r.totalUsd / r.annualSavingsUsd, 9)
    expect(r.co2TonsPerYear).toBeCloseTo((192720 * p.site.gridEmission) / 1000, 6)
  })
  it('degradation 0.5 %/yr over 25 years: lifetime = E₁ × Σ 0.995^(t−1) = 23.556 × E₁; LCOE = capex / lifetime', () => {
    const r = computeProject(projectB())
    let f = 0
    for (let t = 1; t <= 25; t++) f += Math.pow(0.995, t - 1)
    expect(f).toBeCloseTo(23.556, 3) // = (1 − 0.995^25) / 0.005
    expect(r.lifetimeProductionKwh).toBeCloseTo(r.annualProductionKwh * f, 3)
    expect(r.lcoeUsdPerKwh).toBeCloseTo(r.totalUsd / r.lifetimeProductionKwh, 9)
  })
  it('cumulative cashflow: starts at −capex, year-1 step = min(E₁, load) × tariff, 3 % escalation, ROI = (Σ savings − capex)/capex', () => {
    const p = projectB()
    const r = computeProject(p)
    expect(r.cumulativeCashflow).toHaveLength(26)
    expect(r.cumulativeCashflow[0]).toBeCloseTo(-r.totalUsd, 9)
    const y1 = Math.min(r.annualProductionKwh, r.annualKwh) * p.site.gridTariff
    expect(r.cumulativeCashflow[1] - r.cumulativeCashflow[0]).toBeCloseTo(y1, 6)
    const y2 = Math.min(r.annualProductionKwh * 0.995, r.annualKwh) * p.site.gridTariff * 1.03
    expect(r.cumulativeCashflow[2] - r.cumulativeCashflow[1]).toBeCloseTo(y2, 6)
    expect(r.roi25Pct).toBeCloseTo(((r.cumulativeCashflow[25] + r.totalUsd) / r.totalUsd - 1) * 100, 9)
  })
  it('respects analysisYears', () => {
    const p = projectB(); p.design = { ...p.design, analysisYears: 10 }
    const r = computeProject(p)
    expect(r.cumulativeCashflow).toHaveLength(11)
    let f = 0
    for (let t = 1; t <= 10; t++) f += Math.pow(0.995, t - 1)
    expect(r.lifetimeProductionKwh).toBeCloseTo(r.annualProductionKwh * f, 3)
  })
})

// ---------------------------------------------------------------- edge cases / NaN paths
describe('edge cases produce finite numbers and the right checks', () => {
  const finiteOrNull = (r: Results) => {
    const scalars: (number | null)[] = [r.dailyWh, r.peakW, r.surgeW, r.monthlyKwh, r.annualKwh, r.derate, r.requiredPvKwp, r.panelQty, r.arrayKwp, r.arrayAreaM2,
      r.tiltedPsh, r.annualProductionKwh, r.specificYield, r.batteryRequiredKwh, r.batteryQty, r.batteryKwh, r.batteryUsableKwh, r.batteryAh, r.batteryHoursBackup, r.dod,
      r.requiredInverterKw, r.inverterTotalKw, r.requiredControllerA, r.totalUsd, r.costPerWp, r.annualSavingsUsd, r.paybackYears, r.lcoeUsdPerKwh, r.co2TonsPerYear,
      r.lifetimeProductionKwh, r.roi25Pct, ...r.cumulativeCashflow, ...r.monthlyProductionKwh]
    for (const v of scalars) expect(v === null || Number.isFinite(v)).toBe(true)
  }
  it('no loads: zero energy, no battery, null payback, no NaN, "no-loads" error', () => {
    const p = newProject({ name: 'e' }); p.loads = []
    const r = computeProject(p)
    finiteOrNull(r)
    expect(r.dailyWh).toBe(0)
    expect(r.requiredPvKwp).toBe(0)
    expect(r.batteryRequiredKwh).toBe(0)
    expect(r.batteryQty).toBe(0)
    expect(r.annualSavingsUsd).toBe(0)
    expect(r.paybackYears).toBeNull()
    expect(r.roi25Pct).toBe(-100)
    expect(check(r, 'no-loads')?.level).toBe('error')
  })
  it('PSH 0: no production, zero LCOE, null payback, no division by zero', () => {
    const p = projectB(); p.site = { ...p.site, psh: 0, monthlyPsh: Array(12).fill(0) }
    const r = computeProject(p)
    finiteOrNull(r)
    expect(r.requiredPvKwp).toBe(0)
    expect(r.panelQty).toBeGreaterThanOrEqual(1)
    expect(r.annualProductionKwh).toBe(0)
    expect(r.lcoeUsdPerKwh).toBe(0)
    expect(r.paybackYears).toBeNull()
  })
  it('all three fixtures are finite and the "all-ok" sentinel only appears when nothing else is flagged', () => {
    for (const p of [projectA(), projectB(), projectC()]) {
      const r = computeProject(p)
      finiteOrNull(r)
      const others = r.checks.filter((c) => c.level !== 'ok')
      expect(r.checks.some((c) => c.id === 'all-ok')).toBe(others.length === 0)
    }
  })
})
