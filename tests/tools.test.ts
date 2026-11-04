// Standalone engineering tools (src/engine/tools.ts): hand-checked fixtures. The arithmetic is in the comments.
import { describe, it, expect } from 'vitest'
import {
  checkStrings, panelSpec, inverterMppt, controllerMppt, sizeBatteryBank, batterySpec, sizeCircuit, sizeCableAt, ambientFactor, currentFromPower,
  sizeGenerator, worst, type StringCheckInput, type BatteryBankInput, type CableToolInput, type GeneratorInput, type StringCheck, type BatteryBank,
  type CableTool, type GeneratorSizing,
} from '../src/engine/tools'
import { sizeCable } from '../src/engine/compute'
import { catalog } from '../src/data/catalog'
import { normalizeToolState } from '../src/components/tools/state'

const panel = (id: string) => catalog.panels.find((p) => p.id === id)!
const inverter = (id: string) => catalog.inverters.find((i) => i.id === id)!
const battery = (id: string) => catalog.batteries.find((b) => b.id === id)!
const controller = (id: string) => catalog.chargeControllers.find((c) => c.id === id)!
const ok = <T extends { valid: true }>(r: T | { valid: false; invalid: string[] }): T => { if (!r.valid) throw new Error('invalid: ' + r.invalid.join(',')); return r }
const row = (r: { rows: { id: string; level: string; value: number; limit: number; extra?: number }[] }, id: string) => r.rows.find((x) => x.id === id)!
const noBad = (x: unknown) => !JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'BAD' : v)).includes('BAD')

// JA Solar JAM72S30 550 W: Voc 49.9, Vmp 41.96, Isc 14, Imp 13.11, β_Voc −0.275 %/°C, γ −0.35 %/°C, NOCT 45, 1500 V, fuse 25 A
// Deye SUN-8K-SG01LP1: 500 V max, MPPT 150–425 V, 2 MPPT × 26 A, max PV 10.4 kW
const ja550 = panelSpec(panel('pnl-ja-550-jam72s30'))
const deye8k = inverterMppt(inverter('inv-deye-8k-sg01lp1'))
const strIn = (over: Partial<StringCheckInput> = {}): StringCheckInput => ({ module: ja550, mppt: deye8k, units: 1, panelCount: 16, recordLowC: 5, hotAmbientC: 42, codeLimitV: 1000, ...over })

describe('string checker (§7)', () => {
  it('16 × 550 W on a Deye 8K: range 5…9, layout 2 × 8, every row passes', () => {
    const r = ok(checkStrings(strIn()) as StringCheck)
    // Voc_cold = 49.9 × (1 + (−0.00275)(5 − 25)) = 49.9 × 1.055 = 52.6445 V
    expect(r.vocColdModule).toBeCloseTo(52.6445, 4)
    // T_cell = 42 + (45 − 20)/800 × 1000 = 73.25 °C; Vmp_hot = 41.96 × (1 − 0.0035 × 48.25) = 41.96 × 0.831125 = 34.874 V
    expect(r.cellHotC).toBeCloseTo(73.25, 6)
    expect(r.vmpHotModule).toBeCloseTo(34.874, 3)
    // limit = min(500 × 0.97 = 485, 1500, 1000) = 485 V (inverter); max series = floor(485 / 52.6445 = 9.21) = 9
    expect(r.vLimit).toBeCloseTo(485, 6); expect(r.limitBy).toBe('inverter'); expect(r.seriesMaxVoc).toBe(9)
    // MPPT max: floor(425 / 41.96 = 10.13) = 10; min = ceil(150 / 34.874 = 4.30) = 5 → range 5…9
    expect(r.seriesMaxMppt).toBe(10); expect(r.seriesMin).toBe(5); expect(r.seriesMax).toBe(9); expect(r.rangeOk).toBe(true)
    // each MPPT takes floor(26 / 13.11) = 1 string → 2 strings; 16 = 2 × 8 with no spare (9 would leave 2 spare)
    expect(r.stringsPerMpptCap).toBe(1); expect(r.capacityStrings).toBe(2)
    expect(r.layout).toMatchObject({ panelsPerString: 8, strings: 2, totalPanels: 16, stringsPerMppt: 1, mpptsUsed: 2 })
    // rows at 8 in series: cold Voc 8 × 52.6445 = 421.16 ≤ 485; hot Vmp 8 × 34.874 = 278.99 ≥ 150; STC Vmp 8 × 41.96 = 335.68 ≤ 425
    expect(row(r, 'coldVoc').value).toBeCloseTo(421.156, 2); expect(row(r, 'coldVoc').level).toBe('pass')
    expect(row(r, 'hotVmp').value).toBeCloseTo(278.99, 1); expect(row(r, 'hotVmp').level).toBe('pass')
    expect(row(r, 'stcVmp').value).toBeCloseTo(335.68, 2); expect(row(r, 'stcVmp').level).toBe('pass')
    // 1 string per MPPT: Isc 14 ≤ 1.25 × 26 and Imp 13.11 ≤ 26; array 16 × 550 = 8.8 kW ≤ 10.4 kW
    expect(row(r, 'current')).toMatchObject({ level: 'pass', value: 14, limit: 26 })
    expect(row(r, 'pvPower').value).toBeCloseTo(8.8, 6); expect(row(r, 'pvPower').level).toBe('pass')
    // string fuse nextStd(1.56 × 14 = 21.84) = 25 A ≤ module 25 A; not required with 1 string per input
    expect(r.fuse).toMatchObject({ required: false, ratingA: 25, stringsPerInput: 1, maxSeriesFuseA: 25 })
    expect(r.level).toBe('pass')
  })

  it('40 panels on one Deye 8K: 5 strings on 2 inputs fail (Isc 3 × 14 = 42 A > 1.25 × 26 = 32.5 A), array 22 kW > 10.4 kW warns', () => {
    const r = ok(checkStrings(strIn({ panelCount: 40 })) as StringCheck)
    // designStrings: no layout fits 2 strings; 5 × 8 = 40 has no spare panel → chosen
    expect(r.layout).toMatchObject({ panelsPerString: 8, strings: 5, stringsPerMppt: 3 })
    expect(row(r, 'current')).toMatchObject({ level: 'fail', value: 42 })
    expect(row(r, 'inputs')).toMatchObject({ level: 'fail', value: 5, limit: 2 })
    expect(row(r, 'pvPower').level).toBe('warn') // 40 × 0.55 = 22 kW
    // 3 strings per input → string fuses required: 25 A
    expect(r.fuse).toMatchObject({ required: true, ratingA: 25 })
    expect(r.level).toBe('fail')
  })

  it('two inverters double the inputs; 1500 V code limit does not lift the 500 V inverter limit', () => {
    const r = ok(checkStrings(strIn({ panelCount: 32, units: 2, codeLimitV: 1500 })) as StringCheck)
    expect(r.capacityStrings).toBe(4) // 2 units × 2 MPPT × 1 string
    expect(r.layout).toMatchObject({ panelsPerString: 8, strings: 4, totalPanels: 32 })
    expect(r.vLimit).toBeCloseTo(485, 6)
    expect(row(r, 'pvPower').limit).toBeCloseTo(20.8, 6) // 2 × 10.4 kW
    expect(r.level).toBe('pass')
  })

  it('a 600 W module on a Victron 100/20 at 48 V: window too narrow (min 2 > max 1) → fail', () => {
    const cs600 = panelSpec(panel('pnl-cs-600-tophiku6'))
    const mppt = controllerMppt(controller('cc-victron-100-20'), 48, cs600)
    // controller model: MPPT min = 1.2 × 48 + 5 = 62.6 V, max = 0.95 × 100 = 95 V, one tracker, PV max 20 A × 48 V × 1.3 = 1.248 kW
    expect(mppt).toMatchObject({ maxPvVoltage: 100, mpptCount: 1 })
    expect(mppt.mpptMinV).toBeCloseTo(62.6, 6); expect(mppt.mpptMaxV).toBeCloseTo(95, 6); expect(mppt.maxPvInputKw).toBeCloseTo(1.248, 6)
    const r = ok(checkStrings(strIn({ module: cs600, mppt, panelCount: 2 })) as StringCheck)
    // Voc_cold = 51.8 × 1.05 = 54.39 → floor(97 / 54.39) = 1; T_cell = 42 + 21/800 × 1000 = 68.25 °C,
    // Vmp_hot = 44 × (1 − 0.0029 × 43.25) = 38.48 V → min = ceil(62.6 / 38.48 = 1.63) = 2
    expect(r.seriesMaxVoc).toBe(1); expect(r.seriesMin).toBe(2); expect(r.rangeOk).toBe(false)
    expect(row(r, 'hotVmp').level).toBe('fail')
    expect(r.level).toBe('fail')
  })

  it('no panel count → range only; bad datasheet values → invalid fields, never NaN', () => {
    const r = ok(checkStrings(strIn({ panelCount: null })) as StringCheck)
    expect(r.layout).toBeNull(); expect(r.rows).toHaveLength(0); expect(r.seriesMax).toBe(9)
    const bad = checkStrings(strIn({ module: { ...ja550, vmp: 60, isc: null }, mppt: { ...deye8k, mpptMaxV: 100, mpptMinV: 150 }, recordLowC: null }))
    expect(bad.valid).toBe(false)
    if (!bad.valid) expect(bad.invalid).toEqual(expect.arrayContaining(['vmp', 'isc', 'mpptMax', 'low']))
  })
})

// Generic 51.2 V 100 Ah rack (5.12 kWh, DoD 90 %, 100 A, 16 in parallel); Deye 5K SG03LP1 (5 kW, 48 V, 120 A charger)
const rack = battery('bat-gen-48v100-rack')
const battIn = (over: Partial<BatteryBankInput> = {}): BatteryBankInput => ({
  basis: 'load', loadW: 1000, hours: 5, energyKwh: null, module: batterySpec(rack), battery: rack, bus: 48, dodOverridePct: null, inverter: null, cableRunM: 2, ...over,
})

describe('battery bank (§4)', () => {
  it('1 kW for 5 h on 51.2 V / 100 Ah racks: 2 modules, 10.24 kWh, 8.76 h backup', () => {
    const r = ok(sizeBatteryBank(battIn()) as BatteryBank)
    // 1000 W × 5 h = 5 kWh; usable = 5 / 0.95 = 5.263 kWh; nominal = 5.263 / 0.9 = 5.848 kWh
    expect(r.energyNeedKwh).toBeCloseTo(5, 9); expect(r.usableNeedKwh).toBeCloseTo(5.26316, 4); expect(r.nominalNeedKwh).toBeCloseTo(5.84795, 4)
    // series = round(48 / 51.2) = 1; parallel = ceil(5.848 / 5.12 = 1.14) = 2
    expect(r).toMatchObject({ series: 1, parallel: 2, modules: 2, ah: 200, bankV: 48 })
    // 2 × 5.12 = 10.24 kWh nominal, × 0.9 = 9.216 usable; backup = 9.216 × 1000 × 0.95 / 1000 W = 8.755 h
    expect(r.nominalKwh).toBeCloseTo(10.24, 9); expect(r.usableKwh).toBeCloseTo(9.216, 9); expect(r.backupHours).toBeCloseTo(8.7552, 4)
    // discharge at the load = 1000 / (48 × 0.94) = 22.16 A → 0.111 C; limit 2 × 100 A
    expect(r.dischargeA).toBeCloseTo(22.163, 3); expect(r.cRate).toBeCloseTo(0.1108, 4); expect(r.dischargeLimitA).toBe(200)
    expect(r.rows.map((x) => [x.id, x.level])).toEqual([['bus', 'pass'], ['parallel', 'pass'], ['discharge', 'pass']])
    // fuse / cable at 1 kW: nextStd(22.16 × 1.25 = 27.7) = 30 A; practical minimum 10 mm²
    expect(r.cable).toMatchObject({ breakerA: 30, sizeMm2: 10 })
  })

  it('with a Deye 5 kW inverter: currents at the inverter rating, 150 A fuse on 50 mm², compatible', () => {
    const r = ok(sizeBatteryBank(battIn({ inverter: inverter('inv-deye-5k-sg03lp1') })) as BatteryBank)
    // 5000 / (48 × 0.94) = 110.82 A ≤ 200 A; inverter charger 120 A ≤ 2 × 100 A
    expect(r.dischargeA).toBeCloseTo(110.816, 2)
    expect(row(r, 'discharge').level).toBe('pass'); expect(row(r, 'charge')).toMatchObject({ level: 'pass', value: 120, limit: 200 })
    expect(row(r, 'compat').level).toBe('pass')
    // fuse nextStd(110.82 × 1.25 = 138.5) = 150 A; method F × 0.87: 25 → 120 A, 35 → 148.8 A < 150, 50 → 181.8 A ✓;
    // drop at 50 mm² = 2 × 2 m × 110.82 × 0.0206 / 50 / 48 = 0.38 % ≤ 1 %
    expect(r.cable).toMatchObject({ breakerA: 150, sizeMm2: 50, dropPct: 0.38 })
    expect(r.level).toBe('pass')
  })

  it('HV: 20 kWh on BYD HVS (409.6 V, 10.24 kWh) → 3 towers; Huawei 5KTL only takes LUNA / LG → brand fail; Deye 20K HV window passes', () => {
    const byd = battery('bat-byd-hvs102')
    const base = battIn({ basis: 'energy', loadW: null, energyKwh: 20, module: batterySpec(byd), battery: byd, bus: 'hv' })
    const r = ok(sizeBatteryBank(base) as BatteryBank)
    // usable 20 / 0.95 = 21.05 kWh; DoD 100 % → parallel = ceil(21.05 / 10.24 = 2.06) = 3, series 1; 3 ≤ parallel max 3
    expect(r).toMatchObject({ series: 1, parallel: 3, modules: 3, bankV: 409.6 })
    expect(r.nominalKwh).toBeCloseTo(30.72, 9)
    expect(r.backupHours).toBeNull(); expect(r.cable).toBeNull()
    const hw = ok(sizeBatteryBank({ ...base, inverter: inverter('inv-huawei-5ktl-l1') }) as BatteryBank)
    expect(row(hw, 'compat')).toMatchObject({ level: 'fail', issue: 'brand' })
    const dy = ok(sizeBatteryBank({ ...base, inverter: inverter('inv-deye-20k-sg01hp3') }) as BatteryBank)
    expect(row(dy, 'compat').level).toBe('pass')
    // 20 kW / (409.6 V × 0.94) = 51.9 A ≤ 3 × 25 A = 75 A → pass; HV fuse is a DC MCCB, cable ≥ 6 mm²
    expect(dy.dischargeA).toBeCloseTo(51.94, 2); expect(row(dy, 'discharge').level).toBe('pass')
    expect(dy.fuseType).toBe('dc-mccb'); expect(dy.cable!.sizeMm2).toBeGreaterThanOrEqual(6)
  })

  it('lead-acid 12 V 200 Ah AGM on 24 V: 2S × 3P, discharge capped at 0.2 C; a 12.8 V module on an HV bus fails the bus row', () => {
    const agm = battery('bat-gen-12v200-agm')
    const r = ok(sizeBatteryBank(battIn({ loadW: 500, hours: 10, module: batterySpec(agm), battery: agm, bus: 24 })) as BatteryBank)
    // 5 kWh / 0.95 / 0.5 = 10.526 kWh; series = 24 / 12 = 2; parallel = ceil(10.526 / (2.4 × 2) = 2.19) = 3 → 6 modules, 14.4 kWh, 600 Ah
    expect(r).toMatchObject({ series: 2, parallel: 3, modules: 6, ah: 600 })
    // usable 14.4 × 0.5 = 7.2 kWh → 7.2 × 950 / 500 = 13.68 h; limit min(3 × 200 A, 0.2 × 600 Ah = 120 A) = 120 A
    expect(r.backupHours).toBeCloseTo(13.68, 6); expect(r.dischargeLimitA).toBeCloseTo(120, 9)
    const lv = ok(sizeBatteryBank(battIn({ bus: 'hv', module: batterySpec(battery('bat-gen-12v100-lfp')), battery: battery('bat-gen-12v100-lfp') })) as BatteryBank)
    expect(row(lv, 'bus').level).toBe('fail')
  })

  it('DoD override, too many in parallel and empty inputs', () => {
    // 1 kW × 50 h = 50 kWh / 0.95 / 0.8 = 65.79 kWh → ceil(65.79 / 2.56) = 26 × 2.56 kWh racks in parallel; limit 16 → 26 > 24 → fail
    const small = battery('bat-gen-48v50-rack')
    const r = ok(sizeBatteryBank(battIn({ hours: 50, module: batterySpec(small), battery: small, dodOverridePct: 80 })) as BatteryBank)
    expect(r.parallel).toBe(26); expect(row(r, 'parallel').level).toBe('fail')
    const bad = sizeBatteryBank(battIn({ loadW: null, hours: 0, module: { ...batterySpec(rack), nominalVoltage: null } }))
    expect(bad.valid).toBe(false)
    if (!bad.valid) expect(bad.invalid).toEqual(expect.arrayContaining(['loadW', 'hours', 'V']))
  })
  it('by energy: the optional load is empty, 0 or 0.1 W … 10 MW (a 5e-324 W load gave Infinity backup hours)', () => {
    const at = (loadW: number | null) => sizeBatteryBank(battIn({ basis: 'energy', energyKwh: 10, loadW }))
    expect(ok(at(null) as BatteryBank).backupHours).toBeNull()
    expect(ok(at(0) as BatteryBank).backupHours).toBeNull()
    expect(Number.isFinite(ok(at(0.1) as BatteryBank).backupHours)).toBe(true)
    for (const w of [Number.MIN_VALUE, 1e-300, 0.05, -1, 2e7]) expect(at(w)).toEqual({ valid: false, invalid: ['loadW'] })
  })
})

const cabIn = (over: Partial<CableToolInput> = {}): CableToolInput => ({
  circuit: 'ac1', by: 'power', currentA: null, powerKw: 5, pf: 1, voltage: 230, lengthM: 10, maxDropPct: 2, ambientC: 40, insulation: 'pvc', ...over,
})

describe('cable & breaker (§8) at any ambient', () => {
  it('IEC 60364-5-52 B.52.14 factors: PVC 40 °C = engine K_AMB 0.87, interpolated between rows, none above the insulation limit', () => {
    expect(ambientFactor(40, 'pvc')).toBe(0.87)
    expect(ambientFactor(30, 'pvc')).toBe(1)
    expect(ambientFactor(42, 'pvc')).toBeCloseTo(0.838, 9) // 0.87 + (0.79 − 0.87) × 2/5
    expect(ambientFactor(0, 'pvc')).toBe(1.22) // below 10 °C: the 10 °C factor (conservative)
    expect(ambientFactor(60, 'xlpe')).toBe(0.71)
    expect(ambientFactor(65, 'pvc')).toBeNull()
  })

  it('at 40 °C PVC the wrapper is identical to compute.ts sizeCable', () => {
    for (const [use, I, L, V, d, three] of [['ac', 21.7, 30, 230, 2, false], ['battery', 110.8, 2, 48, 1, false], ['dc', 14, 40, 330, 2, false], ['ac', 350, 60, 400, 2, true], ['ac', 900, 20, 400, 2, true]] as const) {
      expect(sizeCableAt(use, I, L, V, d, three, 0.87)).toEqual(sizeCable(use, I, L, V, d, three))
    }
  })

  it('5 kW single-phase, 10 m: 4 mm² at 30 °C, 6 mm² at 40–50 °C, 10 mm² at 55 °C (PVC)', () => {
    // I = 5000 / 230 = 21.74 A; MCB nextStd(21.74 × 1.25 = 27.2) = 32 A; need I_z ≥ 32 A (method C 2-loaded)
    const at = (ambientC: number) => ok(sizeCircuit(cabIn({ ambientC })) as CableTool)
    const r30 = at(30)
    expect(r30.currentA).toBeCloseTo(21.739, 3)
    expect(r30.cable).toMatchObject({ breakerA: 32, sizeMm2: 4 }) // 4 mm²: 36 A × 1.00 ≥ 32; drop 2 × 10 × 21.74 × 0.0206 / 4 / 230 = 0.97 %
    expect(r30.cable.dropPct).toBeCloseTo(0.97, 2)
    expect(at(40).cable.sizeMm2).toBe(6) // 4 mm²: 36 × 0.87 = 31.3 < 32 → 6 mm²: 40.0 A
    expect(at(50).cable.sizeMm2).toBe(6) // 6 mm²: 46 × 0.71 = 32.7 ≥ 32
    const r55 = at(55)
    expect(r55.kAmb).toBe(0.61)
    expect(r55.cable).toMatchObject({ sizeMm2: 10, ampacityA: 38.4, breakerA: 32, lengthM: 10, currentA: 21.7 }) // 6: 28.1 < 32; 10: 63 × 0.61 = 38.43
    expect(r55.cable.dropPct).toBeCloseTo(0.39, 2) // same drop formula on the real current: 8.9565 / 10 / 230
    expect(r55.device).toBe('mcb'); expect(r55.level).toBe('pass')
  })

  it('kW → A: battery η 0.94, three-phase √3 × V × PF', () => {
    expect(currentFromPower('battery', 5, 48)).toBeCloseTo(110.816, 3) // 5000 / (48 × 0.94)
    expect(currentFromPower('ac3', 20, 400, 0.8)).toBeCloseTo(36.084, 3) // 20000 / (1.7320508 × 400 × 0.8) = 20000 / 554.26
    expect(currentFromPower('ac1', 3, 230, 0.8)).toBeCloseTo(16.304, 3) // 3000 / 184
  })

  it('PV string 14 A: gPV fuse 25 A, 4 mm² (6 mm² beyond 25 m); 40 A string → NH combiner fuse; drop target missed → warn', () => {
    const pv = ok(sizeCircuit(cabIn({ circuit: 'pv', by: 'current', currentA: 14, voltage: 335, lengthM: 20 })) as CableTool)
    expect(pv.cable).toMatchObject({ breakerA: 25, sizeMm2: 4 }); expect(pv.device).toBe('gpv-fuse')
    expect(ok(sizeCircuit(cabIn({ circuit: 'pv', by: 'current', currentA: 14, voltage: 335, lengthM: 30 })) as CableTool).cable.sizeMm2).toBe(6)
    const nh = ok(sizeCircuit(cabIn({ circuit: 'pv', by: 'power', currentA: 42, voltage: 600 })) as CableTool) // PV ignores kW mode
    expect(nh.currentA).toBe(42); expect(nh.device).toBe('gpv-nh'); expect(nh.cable.breakerA).toBe(80) // nextStd(42 × 1.56 = 65.5) = 80
    // 48 V, 100 A over 30 m at 1 %: even 240 mm² drops 2 × 30 × 100 × 0.0206 / 240 / 48 = 1.07 % → warn
    const far = ok(sizeCircuit(cabIn({ circuit: 'battery', by: 'current', currentA: 100, voltage: 48, lengthM: 30, maxDropPct: 1 })) as CableTool)
    expect(far.dropOk).toBe(false); expect(far.level).toBe('warn'); expect(far.device).toBe('class-t')
  })

  it('above the largest breaker → fail; invalid inputs listed', () => {
    const big = ok(sizeCircuit(cabIn({ circuit: 'ac3', by: 'current', currentA: 1400, voltage: 400 })) as CableTool)
    expect(big.cable.deviceStd).toBe(false); expect(big.level).toBe('fail')
    const bad = sizeCircuit(cabIn({ powerKw: null, voltage: 0, ambientC: 70 }))
    expect(bad.valid).toBe(false)
    if (!bad.valid) expect(bad.invalid).toEqual(['power', 'voltage', 'ambient'])
  })
})

const genIn = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({ runningKw: 10, motorKw: 4, start: 'dol', pf: 0.8, chargeKw: 2, ambientC: 45, ...over })

describe('generator & inverter sizing (§5, §11)', () => {
  it('10 kW incl. a 4 kW DOL pump, 2 kW charging, 45 °C → 25 kVA; inverter 12.5 kW / 18 kW surge → 15 kW', () => {
    const r = ok(sizeGenerator(genIn()) as GeneratorSizing)
    // surge = 10 + 4 × (3 − 1) = 18 kW; steady = (10 + 2 / 0.95) × 1.1 = 13.316 kW → 16.645 kVA; start 18 / 0.8 = 22.5 kVA
    expect(r.surgeKw).toBe(18); expect(r.steadyKw).toBeCloseTo(13.3158, 4); expect(r.steadyKva).toBeCloseTo(16.6447, 4); expect(r.startKva).toBeCloseTo(22.5, 9)
    // 22.5 × 1.1 (above 40 °C) = 24.75 → 25 kVA
    expect(r).toMatchObject({ hot: true, basis: 'start', generatorKva: 25 }); expect(r.requiredKva).toBeCloseTo(24.75, 9)
    // inverter 10 × 1.25 = 12.5 kW continuous, surge 18 kW → nextStd(max(12.5, 18 / 2)) = 15 kW
    expect(r.inverterKw).toBeCloseTo(12.5, 9); expect(r.inverterSurgeKw).toBe(18); expect(r.inverterStdKw).toBe(15)
  })

  it('start methods change the surge; 40 °C exactly is not derated', () => {
    // VFD: surge 10 + 4 × 0.1 = 10.4 kW → 13 kVA < steady 16.64 kVA → 16.64 × 1.1 = 18.3 → 20 kVA
    const vfd = ok(sizeGenerator(genIn({ start: 'vfd' })) as GeneratorSizing)
    expect(vfd.surgeKw).toBeCloseTo(10.4, 9); expect(vfd.basis).toBe('steady'); expect(vfd.generatorKva).toBe(20)
    // star-delta at 40 °C: surge 10 + 4 = 14 kW → 17.5 kVA; no derate → 20 kVA
    const sd = ok(sizeGenerator(genIn({ start: 'star-delta', ambientC: 40 })) as GeneratorSizing)
    expect(sd.hot).toBe(false); expect(sd.startKva).toBeCloseTo(17.5, 9); expect(sd.generatorKva).toBe(20)
    // soft starter: 10 + 4 × 0.5 = 12 kW
    expect(ok(sizeGenerator(genIn({ start: 'soft' })) as GeneratorSizing).surgeKw).toBe(12)
  })

  it('running load below the motor is raised to it; above 500 kVA → no standard set; invalid inputs', () => {
    const r = ok(sizeGenerator(genIn({ runningKw: 3, motorKw: 5, chargeKw: null, ambientC: 30 })) as GeneratorSizing)
    // running 5 kW; surge 5 + 5 × 2 = 15 kW → 18.75 kVA → 20 kVA
    expect(r).toMatchObject({ runningKw: 5, raisedToMotor: true, surgeKw: 15, generatorKva: 20 })
    const huge = ok(sizeGenerator(genIn({ runningKw: 400, motorKw: null, chargeKw: null })) as GeneratorSizing)
    expect(huge.generatorKva).toBeNull(); expect(huge.inverterStdKw).toBeNull() // 400 × 1.1 / 0.8 × 1.1 = 605 kVA; 500 kW inverter
    const bad = sizeGenerator(genIn({ runningKw: 0, pf: 1.2 }))
    expect(bad.valid).toBe(false)
    if (!bad.valid) expect(bad.invalid).toEqual(['running', 'pf'])
  })
})

describe('tool results are finite and stored state is validated', () => {
  it('no NaN / Infinity across catalogue panels × inverters × batteries', () => {
    for (const p of catalog.panels) for (const i of catalog.inverters.filter((x) => x.mpptCount > 0)) {
      const r = checkStrings(strIn({ module: panelSpec(p), mppt: inverterMppt(i), panelCount: 23, recordLowC: -5 }))
      expect(r.valid && noBad(r)).toBe(true)
    }
    for (const b of catalog.batteries) for (const bus of [12, 24, 48, 'hv'] as const) {
      const r = sizeBatteryBank(battIn({ module: batterySpec(b), battery: b, bus, inverter: inverter('inv-deye-8k-sg01lp1') }))
      expect(r.valid && noBad(r)).toBe(true)
    }
    expect(worst([{ level: 'pass' }, { level: 'warn' }])).toBe('warn')
  })

  it('normalizeToolState keeps valid fields, drops wrong types and unknown enum values, recurses into objects', () => {
    const defaults = { a: 1 as number | null, b: 'x', mode: 'load' as 'load' | 'energy', nested: { v: 2 as number | null, w: null as number | null } }
    const enums = { mode: ['load', 'energy'] as const }
    expect(normalizeToolState(undefined, defaults, enums)).toEqual(defaults)
    expect(normalizeToolState({ a: null, b: 5, mode: 'bogus', nested: { v: 'no', w: 3 }, extra: 1 }, defaults, enums)).toEqual({ a: null, b: 'x', mode: 'load', nested: { v: 2, w: 3 } })
    expect(normalizeToolState({ a: Infinity, mode: 'energy', nested: 7 }, defaults, enums)).toEqual({ ...defaults, mode: 'energy' })
  })
})
