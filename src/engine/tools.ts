// Standalone engineering calculators (view `tools`): pure functions over datasheet values — no project, no load list.
// They reuse the project engine's own formulas (designStrings, sizeCable, batteryCompatibility and the §4 / §5 / §8 / §11
// constants in compute.ts / standards.ts), so a tool result matches the same circuit inside a project. Section numbers refer to
// docs/sizing-methodology.md. Every function validates its input and returns `{ valid: false, invalid: [...] }` instead of NaN.
import type { Panel, Inverter, Battery, ChargeController, Chemistry, StringDesign, CableResult, DesignInput } from './types'
import {
  designStrings, sizeCable, batteryCompatibility, fitsSystemVoltage, cellTemp, INV_EFF_BATT, INV_EFF_DC, K_AMB,
  PV_CABLE_MIN_MM2, BATTERY_CABLE_MIN_MM2, AC_CABLE_MIN_MM2, type BatteryCompatIssue, type SizeCableOpts,
} from './compute'
import { AMPACITY, AWG_EQUIV, STD_PV_FUSE_A, STD_DC_FUSE_A, STD_BATTERY_FUSE_A, STD_MCB_A, STD_GENERATOR_KVA, nextStd, ceilSafe } from './standards'

/** Result of one check row: pass (green), warn (works, but review), fail (must change). */
export type Level = 'pass' | 'warn' | 'fail'
export type Invalid<F extends string> = { valid: false; invalid: F[] }
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const within = (x: unknown, lo: number, hi: number): x is number => fin(x) && x >= lo && x <= hi
const pos = (x: unknown): x is number => fin(x) && x > 0
/** Worst level of a list of rows. */
export const worst = (rows: { level: Level }[]): Level => (rows.some((r) => r.level === 'fail') ? 'fail' : rows.some((r) => r.level === 'warn') ? 'warn' : 'pass')

// =====================================================================================================================
// 1. String checker (§7) — module + MPPT input (inverter, charge controller or datasheet), site temperatures, code limit
// =====================================================================================================================
export interface PvModuleSpec {
  watts: number | null; voc: number | null; vmp: number | null; isc: number | null; imp: number | null
  /** %/°C, negative (e.g. −0.28). */
  tempCoeffVocPctPerC: number | null; tempCoeffPmaxPctPerC: number | null; noct: number | null
  /** Module max system voltage (V); null → 1500 V like the engine. */
  maxSystemVoltage?: number | null
  /** Module max series fuse (A); null → not checked. */
  maxSeriesFuseA?: number | null
}
export interface MpptSpec {
  maxPvVoltage: number | null; mpptMinV: number | null; mpptMaxV: number | null; mpptCount: number | null
  maxInputCurrentPerMppt: number | null
  /** Max PV array power per unit (kW); null / 0 → not checked. */
  maxPvInputKw: number | null
}
export interface StringCheckInput {
  module: PvModuleSpec; mppt: MpptSpec
  /** Identical inverters / controllers sharing the array. */
  units: number | null
  /** Panels to wire; null → only the allowed series range is reported. */
  panelCount: number | null
  recordLowC: number | null; hotAmbientC: number | null
  /** §7 code limit: 1000 V on buildings, 1500 V ground mounts. */
  codeLimitV: number
}
export type StringField = 'watts' | 'voc' | 'vmp' | 'isc' | 'imp' | 'tcVoc' | 'tcPmax' | 'noct' | 'maxSysV' | 'maxFuse'
  | 'maxPvV' | 'mpptMin' | 'mpptMax' | 'mpptCount' | 'maxA' | 'maxPvKw' | 'units' | 'panelCount' | 'low' | 'hot'
export type StringRowId = 'coldVoc' | 'hotVmp' | 'stcVmp' | 'current' | 'inputs' | 'pvPower' | 'fuse'
export interface StringRow { id: StringRowId; level: Level; value: number; limit: number; extra?: number }
export interface StringFuse { required: boolean; ratingA: number | null; stringsPerInput: number; maxSeriesFuseA: number | null }
export interface StringCheck {
  valid: true
  vocColdModule: number; vmpHotModule: number; cellHotC: number
  /** min(inverter max PV V × 0.97, module max system V, code limit) — the series count is designed against it (§15.7). */
  vLimit: number; vHard: number; limitBy: 'inverter' | 'module' | 'code'
  /** Longest string by cold Voc / by the MPPT upper limit at STC Vmp; shortest by hot Vmp ≥ MPPT min. */
  seriesMaxVoc: number; seriesMaxMppt: number; seriesMin: number; seriesMax: number
  /** false when no string length satisfies every limit (window too narrow or one module already above the limit). */
  rangeOk: boolean
  layout: StringDesign | null
  stringsPerMpptCap: number; capacityStrings: number; arrayKw: number
  rows: StringRow[]; fuse: StringFuse | null; level: Level
}

export function validateStrings(x: StringCheckInput): StringField[] {
  const m = x.module, p = x.mppt, bad: StringField[] = []
  // Physical ranges with headroom (modules 1 W–5 kW, 1–2000 V, 0.1–100 A): absurd magnitudes are rejected, never overflow
  if (!within(m.watts, 1, 5000)) bad.push('watts')
  if (!within(m.voc, 1, 2000)) bad.push('voc')
  if (!within(m.vmp, 0.5, 2000) || (pos(m.voc) && m.vmp >= m.voc)) bad.push('vmp')
  if (!within(m.isc, 0.1, 100)) bad.push('isc')
  if (!within(m.imp, 0.05, 100) || (pos(m.isc) && m.imp > m.isc)) bad.push('imp')
  if (!within(m.tempCoeffVocPctPerC, -1, 0)) bad.push('tcVoc')
  if (!within(m.tempCoeffPmaxPctPerC, -1, 0)) bad.push('tcPmax')
  if (!within(m.noct, 20, 70)) bad.push('noct')
  if (m.maxSystemVoltage != null && !within(m.maxSystemVoltage, 1, 3000)) bad.push('maxSysV')
  if (m.maxSeriesFuseA != null && !within(m.maxSeriesFuseA, 1, 200)) bad.push('maxFuse')
  if (!within(p.maxPvVoltage, 1, 3000)) bad.push('maxPvV')
  if (!within(p.mpptMinV, 0, 2000)) bad.push('mpptMin')
  if (!within(p.mpptMaxV, 1, 3000) || (fin(p.mpptMinV) && p.mpptMaxV <= p.mpptMinV)) bad.push('mpptMax')
  if (!fin(p.mpptCount) || !Number.isInteger(p.mpptCount) || p.mpptCount < 1 || p.mpptCount > 100) bad.push('mpptCount')
  if (!within(p.maxInputCurrentPerMppt, 0.1, 2000)) bad.push('maxA')
  if (p.maxPvInputKw != null && !within(p.maxPvInputKw, 0, 100000)) bad.push('maxPvKw')
  if (!fin(x.units) || !Number.isInteger(x.units) || x.units < 1 || x.units > 1000) bad.push('units')
  if (x.panelCount != null && (!fin(x.panelCount) || !Number.isInteger(x.panelCount) || x.panelCount < 1 || x.panelCount > 100000)) bad.push('panelCount')
  if (!within(x.recordLowC, -50, 40)) bad.push('low')
  if (!within(x.hotAmbientC, -20, 60) || (fin(x.recordLowC) && x.hotAmbientC < x.recordLowC)) bad.push('hot')
  return bad
}

/** Catalogue panel → datasheet spec. */
export const panelSpec = (p: Panel): PvModuleSpec => ({
  watts: p.watts, voc: p.voc, vmp: p.vmp, isc: p.isc, imp: p.imp, tempCoeffVocPctPerC: p.tempCoeffVocPctPerC, tempCoeffPmaxPctPerC: p.tempCoeffPmaxPctPerC,
  noct: p.noct, maxSystemVoltage: p.maxSystemVoltage ?? null, maxSeriesFuseA: p.maxSeriesFuseA ?? null,
})
/** Catalogue inverter → MPPT input spec. */
export const inverterMppt = (i: Inverter): MpptSpec => ({
  maxPvVoltage: i.maxPvVoltage, mpptMinV: i.mpptMinV, mpptMaxV: i.mpptMaxV, mpptCount: i.mpptCount, maxInputCurrentPerMppt: i.maxInputCurrentPerMppt, maxPvInputKw: i.maxPvInputKw,
})
/**
 * Separate MPPT charge controller → MPPT input spec, exactly as the engine models it (§6, §15.7 `virtualFor`): one tracker per
 * controller, tracking starts at 1.2 × V_bus + 5 V, MPPT upper limit 0.95 × max PV V, input current ≈ output power / (2 × module Vmp)
 * but never below the module Isc. Max PV power = rated charge current × V_bus × 1.3 (§6: a controller may be oversized 1.3×; it clips).
 */
export function controllerMppt(c: ChargeController, busV: number, module: Pick<PvModuleSpec, 'isc' | 'vmp'>): MpptSpec {
  const isc = fin(module.isc) ? module.isc : 0, vmp = fin(module.vmp) && module.vmp > 0 ? module.vmp : 1
  return {
    maxPvVoltage: c.maxPvVoltage, mpptMinV: busV * 1.2 + 5, mpptMaxV: c.maxPvVoltage * 0.95, mpptCount: 1,
    maxInputCurrentPerMppt: Math.max(isc, (c.maxChargeA * busV) / Math.max(1, vmp * 2)), maxPvInputKw: (c.maxChargeA * busV * 1.3) / 1000,
  }
}
const asPanel = (m: PvModuleSpec): Panel => ({
  id: 'tool-panel', brand: '', model: '', watts: m.watts!, voc: m.voc!, vmp: m.vmp!, isc: m.isc!, imp: m.imp!, efficiencyPct: 0,
  tempCoeffPmaxPctPerC: m.tempCoeffPmaxPctPerC!, tempCoeffVocPctPerC: m.tempCoeffVocPctPerC!, noct: m.noct!, lengthMm: 0, widthMm: 0, weightKg: 0,
  technology: '', bifacial: false, warrantyYears: 0, approxPriceUsd: 0, maxSystemVoltage: m.maxSystemVoltage ?? undefined, maxSeriesFuseA: m.maxSeriesFuseA ?? undefined,
})
const asInverter = (s: MpptSpec): Inverter => ({
  id: 'tool-inverter', brand: '', model: '', type: 'hybrid', phase: 1, ratedAcKw: 0, maxPvInputKw: s.maxPvInputKw ?? 0, maxPvVoltage: s.maxPvVoltage!,
  mpptMinV: s.mpptMinV!, mpptMaxV: s.mpptMaxV!, mpptCount: s.mpptCount!, maxInputCurrentPerMppt: s.maxInputCurrentPerMppt!, batteryVoltage: null,
  maxChargeA: 0, surgeKw: 0, efficiencyPct: 0, parallelMax: 1, generatorInput: false, approxPriceUsd: 0,
})

/**
 * §7 string check. Module temperatures as the engine: Voc_cold at the record low; Vmp_hot at the NOCT cell temperature for
 * 1000 W/m² over the hot ambient. The layout is `designStrings` with the panel count fixed (it reports the nearest equal layout
 * when the count does not divide). Rows are evaluated on that layout:
 * - cold Voc of the string ≤ the design limit (warn inside the inverter's 3 % margin, fail above the hard limit);
 * - hot Vmp ≥ MPPT min (fail: the tracker drops out on hot afternoons); STC Vmp ≤ MPPT max (warn: clips on cold mornings);
 * - Isc per MPPT ≤ 1.25 × the input current (hard limit as compute.ts `isc-mppt`); Imp per MPPT above the operating current → warn;
 * - strings ≤ MPPT inputs × strings each input takes; array kW ≤ max PV input × units (warn: clipping);
 * - string fuse nextStd(1.56 × Isc) (1.5 × Isc when 1.56 lands above the module max series fuse), required at ≥ 3 strings per input.
 */
export function checkStrings(x: StringCheckInput): StringCheck | Invalid<StringField> {
  const invalid = validateStrings(x)
  if (invalid.length) return { valid: false, invalid }
  const mod = x.module, mp = x.mppt
  const m = { watts: mod.watts!, voc: mod.voc!, vmp: mod.vmp!, isc: mod.isc!, imp: mod.imp!, tcVoc: mod.tempCoeffVocPctPerC!, tcPmax: mod.tempCoeffPmaxPctPerC!, noct: mod.noct!, maxSystemVoltage: mod.maxSystemVoltage ?? null, maxSeriesFuseA: mod.maxSeriesFuseA ?? null }
  const p = { maxPvVoltage: mp.maxPvVoltage!, mpptMinV: mp.mpptMinV!, mpptMaxV: mp.mpptMaxV!, mpptCount: mp.mpptCount!, maxInputCurrentPerMppt: mp.maxInputCurrentPerMppt!, maxPvInputKw: mp.maxPvInputKw ?? 0 }
  const low = x.recordLowC!, hot = x.hotAmbientC!, units = x.units!
  const vocColdModule = m.voc * (1 + (m.tcVoc / 100) * (low - 25))
  const cellHotC = cellTemp(hot, m.noct, 1000)
  const vmpHotModule = m.vmp * (1 + (m.tcPmax / 100) * (cellHotC - 25))
  const vModule = m.maxSystemVoltage ?? 1500, code = x.codeLimitV > 0 ? x.codeLimitV : 1000
  const vLimit = Math.min(p.maxPvVoltage * 0.97, vModule, code)
  const vHard = Math.min(p.maxPvVoltage, vModule, code)
  const limitBy = vLimit === code ? 'code' : vLimit === vModule ? 'module' : 'inverter'
  // same rounding as designStrings so the range and the layout agree
  const seriesMaxVoc = Math.floor(vLimit / vocColdModule)
  const seriesMaxMppt = Math.floor(p.mpptMaxV / m.vmp)
  const seriesMin = Math.max(1, ceilSafe(p.mpptMinV / vmpHotModule))
  const seriesMax = Math.min(seriesMaxVoc, seriesMaxMppt)
  const rangeOk = seriesMaxVoc >= 1 && seriesMax >= seriesMin
  const stringsPerMpptCap = Math.max(1, Math.floor(p.maxInputCurrentPerMppt / m.imp))
  const capacityStrings = Math.max(1, p.mpptCount * units) * stringsPerMpptCap
  const panel = asPanel(x.module)
  const layout = x.panelCount != null ? designStrings(panel, asInverter(x.mppt), units, x.panelCount, low, hot, { codeLimitV: code, fixedCount: true }) : null
  const rows: StringRow[] = []
  let fuse: StringFuse | null = null, arrayKw = 0
  if (layout) {
    const n = layout.panelsPerString, perMppt = layout.stringsPerMppt
    const voc = vocColdModule * n, vmpHot = vmpHotModule * n, vmpStc = m.vmp * n
    rows.push({ id: 'coldVoc', level: voc <= vLimit + 1e-9 ? 'pass' : voc <= vHard + 1e-9 ? 'warn' : 'fail', value: voc, limit: vLimit, extra: vHard })
    rows.push({ id: 'hotVmp', level: vmpHot >= p.mpptMinV - 1e-9 ? 'pass' : 'fail', value: vmpHot, limit: p.mpptMinV })
    rows.push({ id: 'stcVmp', level: vmpStc <= p.mpptMaxV + 1e-9 ? 'pass' : 'warn', value: vmpStc, limit: p.mpptMaxV })
    const iscIn = perMppt * m.isc, impIn = perMppt * m.imp
    rows.push({ id: 'current', level: iscIn > p.maxInputCurrentPerMppt * 1.25 + 1e-9 ? 'fail' : impIn > p.maxInputCurrentPerMppt + 1e-9 ? 'warn' : 'pass', value: iscIn, limit: p.maxInputCurrentPerMppt, extra: impIn })
    rows.push({ id: 'inputs', level: layout.strings <= capacityStrings ? 'pass' : 'fail', value: layout.strings, limit: capacityStrings })
    arrayKw = (layout.totalPanels * m.watts) / 1000
    if (p.maxPvInputKw > 0) rows.push({ id: 'pvPower', level: arrayKw <= p.maxPvInputKw * units + 1e-9 ? 'pass' : 'warn', value: arrayKw, limit: p.maxPvInputKw * units })
    // String fuse (§8.3, as compute.ts): nextStd(1.56 × Isc); 1.5 × Isc when that is above the module rating; needed at ≥ 3 strings per input
    const maxFuse = m.maxSeriesFuseA
    let rating = nextStd(m.isc * 1.56, STD_PV_FUSE_A)
    if (maxFuse && rating != null && rating > maxFuse) rating = nextStd(m.isc * 1.5, STD_PV_FUSE_A)
    fuse = { required: perMppt > 2, ratingA: rating, stringsPerInput: perMppt, maxSeriesFuseA: maxFuse }
    rows.push({ id: 'fuse', level: perMppt <= 2 ? 'pass' : rating == null ? 'fail' : maxFuse && rating > maxFuse ? 'warn' : 'pass', value: rating ?? m.isc * 1.56, limit: maxFuse ?? 0, extra: perMppt })
  }
  const level: Level = !rangeOk ? 'fail' : worst(rows)
  return { valid: true, vocColdModule, vmpHotModule, cellHotC, vLimit, vHard, limitBy, seriesMaxVoc, seriesMaxMppt, seriesMin, seriesMax, rangeOk, layout, stringsPerMpptCap, capacityStrings, arrayKw, rows, fuse, level }
}

// =====================================================================================================================
// 2. Battery bank (§4, §4.3, §8.3, §15.6)
// =====================================================================================================================
export type Bus = DesignInput['systemVoltage']
export interface BatteryModuleSpec {
  nominalVoltage: number | null; capacityAh: number | null
  /** Module energy (kWh); null → V × Ah / 1000. */
  energyKwh: number | null
  usableDodPct: number | null
  maxChargeA: number | null; maxDischargeA: number | null; parallelMax: number | null
  chemistry: Chemistry
}
export interface BatteryBankInput {
  /** 'load' → energy = load W × backup hours; 'energy' → the energy the loads draw from the bank (kWh). */
  basis: 'load' | 'energy'
  loadW: number | null; hours: number | null; energyKwh: number | null
  module: BatteryModuleSpec
  /** Catalogue battery the spec came from (brand-locked compatibility); null → a datasheet entry. */
  battery?: Battery | null
  bus: Bus
  /** Overrides the module's usable DoD (%). */
  dodOverridePct: number | null
  inverter?: Inverter | null
  /** One-way battery cable run (m), for the fuse / cable. */
  cableRunM: number | null
}
export type BatteryField = 'loadW' | 'hours' | 'energy' | 'V' | 'Ah' | 'kWh' | 'dod' | 'maxChargeA' | 'maxDischargeA' | 'parallelMax' | 'dodOverride' | 'run'
export type BatteryRowId = 'bus' | 'parallel' | 'discharge' | 'charge' | 'compat'
export interface BatteryRow { id: BatteryRowId; level: Level; value: number; limit: number; issue?: BatteryCompatIssue }
export interface BatteryBank {
  valid: true
  energyNeedKwh: number; usableNeedKwh: number; nominalNeedKwh: number; dod: number; unitKwh: number
  series: number; parallel: number; modules: number
  nominalKwh: number; usableKwh: number; ah: number; bankV: number
  /** Hours at the entered load (usable × η_inv / load); null without a load. */
  backupHours: number | null
  /** DC current at the entered load (P / (V × 0.94)); null without a load. */
  loadA: number | null
  /** Worst-case discharge current (inverter rated power when an inverter is chosen, else the load) and its C-rate. */
  dischargeA: number | null; cRate: number | null
  /** Bank continuous discharge limit (A) = module max discharge × parallel (× 0.2 C cap for lead-acid). */
  dischargeLimitA: number | null
  cable: CableResult | null; fuseType: 'class-t' | 'dc-mccb'
  rows: BatteryRow[]; level: Level
}
const LEAD: Chemistry[] = ['AGM', 'Gel', 'Flooded']
export const isLead = (c: Chemistry) => LEAD.includes(c)
export const busVolts = (b: Bus) => (b === 'hv' ? 400 : b)

export function validateBattery(x: BatteryBankInput): BatteryField[] {
  const m = x.module, bad: BatteryField[] = []
  if (x.basis === 'load') {
    if (!within(x.loadW, 0.1, 1e7)) bad.push('loadW')
    if (!within(x.hours, 0.01, 240)) bad.push('hours')
  } else {
    if (!within(x.energyKwh, 0.001, 100000)) bad.push('energy')
    // optional load for the backup time: empty or 0 = none, else the load basis range (a 1e-300 W load gave Infinity hours)
    if (x.loadW != null && x.loadW !== 0 && !within(x.loadW, 0.1, 1e7)) bad.push('loadW')
  }
  if (!within(m.nominalVoltage, 1, 2000)) bad.push('V')
  if (!within(m.capacityAh, 0.1, 100000)) bad.push('Ah')
  if (m.energyKwh != null && !within(m.energyKwh, 0.01, 10000)) bad.push('kWh')
  if (!within(m.usableDodPct, 10, 100)) bad.push('dod')
  if (m.maxChargeA != null && !within(m.maxChargeA, 0.1, 100000)) bad.push('maxChargeA')
  if (m.maxDischargeA != null && !within(m.maxDischargeA, 0.1, 100000)) bad.push('maxDischargeA')
  if (m.parallelMax != null && !within(m.parallelMax, 1, 1000)) bad.push('parallelMax')
  if (x.dodOverridePct != null && !within(x.dodOverridePct, 10, 100)) bad.push('dodOverride')
  if (!within(x.cableRunM, 0.1, 500)) bad.push('run')
  return bad
}

/** Datasheet spec → Battery record (for the engine helpers); a catalogue battery keeps its brand for the compatibility check. */
export function batteryFromSpec(m: BatteryModuleSpec, base?: Battery | null): Battery {
  const unitKwh = m.energyKwh ?? ((m.nominalVoltage ?? 0) * (m.capacityAh ?? 0)) / 1000
  return {
    id: base?.id ?? 'tool-battery', brand: base?.brand ?? '', model: base?.model ?? '', chemistry: m.chemistry, nominalVoltage: m.nominalVoltage ?? 0, capacityAh: m.capacityAh ?? 0,
    energyKwh: unitKwh, usableDodPct: m.usableDodPct ?? 90, maxChargeA: m.maxChargeA ?? 0, maxDischargeA: m.maxDischargeA ?? 0, cycles: base?.cycles ?? 0,
    warrantyYears: base?.warrantyYears ?? 0, weightKg: base?.weightKg ?? 0, formFactor: base?.formFactor ?? '', parallelMax: m.parallelMax ?? 99, approxPriceUsd: base?.approxPriceUsd ?? 0,
    inverterBrands: base?.inverterBrands,
  }
}
export const batterySpec = (b: Battery): BatteryModuleSpec => ({
  nominalVoltage: b.nominalVoltage, capacityAh: b.capacityAh, energyKwh: b.energyKwh, usableDodPct: b.usableDodPct, maxChargeA: b.maxChargeA, maxDischargeA: b.maxDischargeA,
  parallelMax: b.parallelMax, chemistry: b.chemistry,
})

/**
 * Battery bank for a backup requirement (§4.1–4.3, the engine's rules):
 * usable needed = energy / η_inv (0.95); nominal needed = usable / DoD (override > module usable DoD);
 * series = round(V_bus / V_module) (1 on an HV bus — HV stacks are single strings); parallel = ceil(nominal / (kWh_module × series)).
 * Bank voltage for currents = the bus (LV) or the module voltage (HV), η_DC 0.94 (§8.3). Battery fuse and cable = sizeCable('battery')
 * at the inverter's rated power (or the load when no inverter is chosen), 1 % drop, practical minimum 10 / 16 (≥ 3 kW) / 25 mm² (≥ 5 kW), HV 6 mm².
 */
export function sizeBatteryBank(x: BatteryBankInput): BatteryBank | Invalid<BatteryField> {
  const invalid = validateBattery(x)
  if (invalid.length) return { valid: false, invalid }
  const m = x.module, b = batteryFromSpec(m, x.battery)
  const unitKwh = b.energyKwh
  const energyNeedKwh = x.basis === 'load' ? (x.loadW! * x.hours!) / 1000 : x.energyKwh!
  const dod = (x.dodOverridePct ?? m.usableDodPct!) / 100
  const usableNeedKwh = energyNeedKwh / INV_EFF_BATT
  const nominalNeedKwh = usableNeedKwh / dod
  const hv = x.bus === 'hv'
  const series = hv ? 1 : Math.max(1, Math.round((x.bus as number) / b.nominalVoltage))
  const parallel = Math.max(1, ceilSafe(nominalNeedKwh / (unitKwh * series)))
  const modules = series * parallel
  const nominalKwh = modules * unitKwh, usableKwh = nominalKwh * dod, ah = parallel * b.capacityAh
  const bankV = hv ? b.nominalVoltage * series : (x.bus as number)
  const loadW = fin(x.loadW) && x.loadW > 0 ? x.loadW : null
  const backupHours = loadW ? (usableKwh * 1000 * INV_EFF_BATT) / loadW : null
  const loadA = loadW ? loadW / (bankV * INV_EFF_DC) : null
  const inv = x.inverter && x.inverter.type !== 'gridtie' && x.inverter.batteryVoltage != null ? x.inverter : null
  const invA = inv ? (inv.ratedAcKw * 1000) / (bankV * INV_EFF_DC) : null
  const dischargeA = invA ?? loadA
  const cRate = dischargeA != null ? dischargeA / ah : null
  const leadCap = isLead(m.chemistry) ? 0.2 * ah : Infinity
  const dischargeLimitA = m.maxDischargeA != null ? Math.min(m.maxDischargeA * parallel, leadCap) : Number.isFinite(leadCap) ? leadCap : null
  const rows: BatteryRow[] = []
  rows.push({ id: 'bus', level: fitsSystemVoltage(b, x.bus) ? 'pass' : 'fail', value: b.nominalVoltage * series, limit: busVolts(x.bus) })
  if (m.parallelMax != null) rows.push({ id: 'parallel', level: parallel <= m.parallelMax ? 'pass' : parallel <= m.parallelMax * 1.5 ? 'warn' : 'fail', value: parallel, limit: m.parallelMax })
  if (dischargeA != null && dischargeLimitA != null) rows.push({ id: 'discharge', level: dischargeA <= dischargeLimitA + 1e-9 ? 'pass' : 'warn', value: dischargeA, limit: dischargeLimitA })
  if (inv && m.maxChargeA != null) {
    const leadChg = isLead(m.chemistry) ? 0.2 * ah : Infinity
    const lim = Math.min(m.maxChargeA * parallel, leadChg)
    rows.push({ id: 'charge', level: inv.maxChargeA <= lim + 1e-9 ? 'pass' : 'warn', value: inv.maxChargeA, limit: lim })
  }
  if (inv) {
    const issue = batteryCompatibility(b, inv, x.bus)
    rows.push({ id: 'compat', level: issue ? 'fail' : 'pass', value: 0, limit: 0, issue })
  }
  const fuseType = hv ? 'dc-mccb' : 'class-t'
  let cable: CableResult | null = null
  if (dischargeA != null && dischargeA > 0) {
    const kw = inv ? inv.ratedAcKw : loadW! / 1000
    const minMm2 = hv ? 6 : kw >= 5 ? 25 : kw >= 3 ? 16 : BATTERY_CABLE_MIN_MM2
    cable = sizeCable('battery', dischargeA, x.cableRunM!, bankV, 1, false, { minMm2, id: 'battery', deviceType: hv ? 'DC fuse / DC MCCB' : 'class-T fuse', deviceRatedV: hv ? 1000 : 125 })
  }
  return {
    valid: true, energyNeedKwh, usableNeedKwh, nominalNeedKwh, dod, unitKwh, series, parallel, modules, nominalKwh, usableKwh, ah, bankV,
    backupHours, loadA, dischargeA, cRate, dischargeLimitA, cable, fuseType, rows, level: worst(rows),
  }
}

// =====================================================================================================================
// 3. Cable & breaker (§8) at any ambient temperature
// =====================================================================================================================
/**
 * Ambient-air correction factors k_amb for cables in air, IEC 60364-5-52 Table B.52.14 (reference 30 °C):
 * PVC (70 °C conductor) and XLPE / EPR (90 °C; also EN 50618 H1Z2Z2-K PV cable). Linear between the 5 °C rows; below 10 °C the
 * 10 °C factor is kept (conservative); above the last row the insulation cannot be used (null).
 * PVC at 40 °C = 0.87 = compute.ts K_AMB, so a PVC tool result at 40 °C is identical to the project engine.
 */
export const K_AMB_TABLE: Record<Insulation, [number, number][]> = {
  pvc: [[10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5]],
  xlpe: [[10, 1.15], [15, 1.12], [20, 1.08], [25, 1.04], [30, 1], [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [55, 0.76], [60, 0.71], [65, 0.65], [70, 0.58], [75, 0.5], [80, 0.41]],
}
export type Insulation = 'pvc' | 'xlpe'
export function ambientFactor(ambientC: number, insulation: Insulation = 'pvc'): number | null {
  const t = K_AMB_TABLE[insulation]
  if (!fin(ambientC)) return null
  if (ambientC <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    const [t1, k1] = t[i], [t0, k0] = t[i - 1]
    if (ambientC <= t1) return Math.round((k0 + ((k1 - k0) * (ambientC - t0)) / (t1 - t0)) * 1e4) / 1e4
  }
  return null
}

/**
 * sizeCable (compute.ts, fixed k_amb 0.87) at another ambient factor `k`, without changing compute.ts:
 * with s = K_AMB / k the engine is called with current × s and length ÷ s (and a device rating × s), so that
 * - its ampacity test `table × K_AMB × runs ≥ need × s` is exactly `table × k × runs ≥ need` (need = max(I_n, I_B × factor)),
 * - its voltage drop (∝ current × length) is unchanged;
 * the device rating is chosen on the real current. The reported current, length, device and derated ampacity are the real values.
 */
export function sizeCableAt(use: CableResult['use'], currentA: number, lengthM: number, voltage: number, maxDropPct: number, threePhase: boolean, k: number, opts: SizeCableOpts = {}): CableResult {
  const factor = opts.factor ?? (use === 'dc' ? 1.56 : 1.25)
  const list = opts.deviceList ?? (use === 'dc' ? STD_PV_FUSE_A : use === 'battery' ? STD_BATTERY_FUSE_A : STD_MCB_A)
  const I = Math.max(0, fin(currentA) ? currentA : 0)
  const device = opts.deviceA !== undefined ? opts.deviceA : nextStd(I * factor, list)
  const s = K_AMB / k
  const r = sizeCable(use, I * s, lengthM / s, voltage, maxDropPct, threePhase, { ...opts, factor, deviceList: list, deviceA: device == null ? null : device * s })
  const table = use === 'dc' ? AMPACITY.pv : use === 'battery' ? AMPACITY.battery : threePhase ? AMPACITY.ac3 : AMPACITY.ac1
  return { ...r, currentA: Math.round(I * 10) / 10, lengthM, breakerA: device ?? Math.ceil(I * factor), ampacityA: Math.round(table[r.sizeMm2] * k * (r.parallelRuns ?? 1) * 10) / 10 }
}

export type CircuitKind = 'pv' | 'battery' | 'ac1' | 'ac3'
export type DeviceKind = 'gpv-fuse' | 'gpv-nh' | 'class-t' | 'dc-mccb' | 'mcb' | 'mccb'
export interface CableToolInput {
  circuit: CircuitKind
  /** 'current' → currentA; 'power' → powerKw converted with the circuit voltage (battery: η 0.94; AC: power factor). PV strings take Isc only. */
  by: 'current' | 'power'
  currentA: number | null; powerKw: number | null; pf: number | null
  voltage: number | null; lengthM: number | null; maxDropPct: number | null; ambientC: number | null; insulation: Insulation
}
export type CableField = 'current' | 'power' | 'pf' | 'voltage' | 'length' | 'drop' | 'ambient'
export interface CableTool {
  valid: true
  currentA: number; kAmb: number; cable: CableResult; device: DeviceKind; minMm2: number; awg: string | null
  dropOk: boolean; level: Level
}
/** Circuit defaults: typical voltage and voltage-drop target (§8.1: PV ≤ 2 %, battery ≤ 1 %, AC ≤ 2 %). */
export const CIRCUIT_DEFAULTS: Record<CircuitKind, { voltage: number; dropPct: number; lengthM: number }> = {
  pv: { voltage: 400, dropPct: 2, lengthM: 20 }, battery: { voltage: 48, dropPct: 1, lengthM: 2 }, ac1: { voltage: 230, dropPct: 2, lengthM: 15 }, ac3: { voltage: 400, dropPct: 2, lengthM: 15 },
}
/** Design current from power: battery I = P / (V × 0.94) (§8.3); AC 1-ph I = P / (V × PF); AC 3-ph I = P / (√3 × V_LL × PF). */
export function currentFromPower(circuit: CircuitKind, kw: number, voltage: number, pf = 1): number {
  const W = kw * 1000
  if (circuit === 'battery') return W / (voltage * INV_EFF_DC)
  if (circuit === 'ac3') return W / (Math.sqrt(3) * voltage * pf)
  return W / (voltage * pf)
}
export function validateCable(x: CableToolInput): CableField[] {
  const bad: CableField[] = []
  const byPower = x.by === 'power' && x.circuit !== 'pv'
  if (byPower) {
    if (!within(x.powerKw, 0.001, 100000)) bad.push('power')
    if (x.circuit !== 'battery' && !within(x.pf, 0.1, 1)) bad.push('pf')
  } else if (!within(x.currentA, 0.01, 100000)) bad.push('current')
  if (!within(x.voltage, 1, 1500)) bad.push('voltage')
  if (!within(x.lengthM, 0.1, 10000)) bad.push('length')
  if (!within(x.maxDropPct, 0.1, 20)) bad.push('drop')
  if (!fin(x.ambientC) || ambientFactor(x.ambientC, x.insulation) == null || x.ambientC < -40) bad.push('ambient')
  return bad
}
/**
 * One circuit, sized like the project engine (§8, §15.8) at the entered ambient: device I_n = nextStd(I_B × 1.56) for PV (gPV string
 * fuse ≤ 40 A, else a gPV NH combiner fuse) or × 1.25 for battery / AC; conductor = smallest size with derated I_z ≥ max(I_n, I_B × factor)
 * that meets the drop target and the practical minimum (PV 4 mm², 6 mm² above 25 m; battery 10 / 16 (≥ 3 kW) / 25 mm² (≥ 5 kW) at LV,
 * 6 mm² at HV; AC 2.5 mm²); parallel conductors when one 240 mm² is not enough.
 */
export function sizeCircuit(x: CableToolInput): CableTool | Invalid<CableField> {
  const invalid = validateCable(x)
  if (invalid.length) return { valid: false, invalid }
  const V = x.voltage!, L = x.lengthM!, drop = x.maxDropPct!
  const byPower = x.by === 'power' && x.circuit !== 'pv'
  const I = byPower ? currentFromPower(x.circuit, x.powerKw!, V, x.pf ?? 1) : x.currentA!
  const k = ambientFactor(x.ambientC!, x.insulation)!
  const three = x.circuit === 'ac3'
  let cable: CableResult, device: DeviceKind, minMm2: number
  if (x.circuit === 'pv') {
    const stringFuse = nextStd(I * 1.56, STD_PV_FUSE_A) != null
    minMm2 = L > 25 ? 6 : PV_CABLE_MIN_MM2
    cable = sizeCableAt('dc', I, L, V, drop, false, k, { minMm2, deviceList: stringFuse ? STD_PV_FUSE_A : STD_DC_FUSE_A })
    device = stringFuse ? 'gpv-fuse' : 'gpv-nh'
  } else if (x.circuit === 'battery') {
    const hv = V > 60, kw = (I * V * INV_EFF_DC) / 1000
    minMm2 = hv ? 6 : kw >= 5 ? 25 : kw >= 3 ? 16 : BATTERY_CABLE_MIN_MM2
    cable = sizeCableAt('battery', I, L, V, drop, false, k, { minMm2 })
    device = hv ? 'dc-mccb' : 'class-t'
  } else {
    minMm2 = AC_CABLE_MIN_MM2
    cable = sizeCableAt('ac', I, L, V, drop, three, k, { minMm2 })
    device = cable.breakerA > 125 ? 'mccb' : 'mcb'
  }
  const dropOk = cable.dropPct <= drop + 0.005
  const level: Level = cable.deviceStd === false ? 'fail' : dropOk ? 'pass' : 'warn'
  return { valid: true, currentA: I, kAmb: k, cable, device, minMm2, awg: AWG_EQUIV[cable.sizeMm2] ?? null, dropOk, level }
}

// =====================================================================================================================
// 4. Generator & inverter sizing (§5, §11)
// =====================================================================================================================
export type StartMethod = 'dol' | 'star-delta' | 'soft' | 'vfd'
/**
 * Starting power of the largest motor as a multiple of its running kW, as used in generator / inverter sizing rules of thumb:
 * direct-on-line 3 × (locked-rotor current 6–8 × FLC at a poor starting PF; the set must hold the voltage dip), star-delta 2 ×
 * (starting current ÷ 3), soft-starter 1.5 × (current limit ≈ 2.5–3.5 × FLC, better PF), VFD 1.1 × (ramps from zero at ≤ rated current).
 */
export const START_FACTOR: Record<StartMethod, number> = { dol: 3, 'star-delta': 2, soft: 1.5, vfd: 1.1 }
/** §5 standard inverter sizes (kW). */
export const STD_INV_KW = [1, 1.5, 2, 3, 3.6, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 110, 125, 150, 200, 250]
export interface GeneratorInput { runningKw: number | null; motorKw: number | null; start: StartMethod; pf: number | null; chargeKw: number | null; ambientC: number | null }
export type GeneratorField = 'running' | 'motor' | 'pf' | 'charge' | 'ambient'
export interface GeneratorSizing {
  valid: true
  /** Running load used (raised to the motor's running power when the entered running load was smaller). */
  runningKw: number; raisedToMotor: boolean; motorKw: number; startFactor: number
  /** Load with the largest motor starting = running + motor × (factor − 1). */
  surgeKw: number
  /** §11: (running + charging / η_charger 0.95) × 1.10 margin. */
  steadyKw: number; steadyKva: number; startKva: number
  /** +10 % above 40 °C ambient (§11, §15.9). */
  hot: boolean; requiredKva: number; basis: 'steady' | 'start'
  /** Next standard set (null above 500 kVA: synchronised parallel sets). */
  generatorKva: number | null
  /** §5: continuous ≥ running × 1.25; surge rating ≥ surgeKw; the standard size also covers the surge at the default 2 × rating. */
  inverterKw: number; inverterSurgeKw: number; inverterStdKw: number | null
}
export function validateGenerator(x: GeneratorInput): GeneratorField[] {
  const bad: GeneratorField[] = []
  if (!within(x.runningKw, 0.01, 100000)) bad.push('running')
  if (x.motorKw != null && !within(x.motorKw, 0, 100000)) bad.push('motor')
  if (!within(x.pf, 0.5, 1)) bad.push('pf')
  if (x.chargeKw != null && !within(x.chargeKw, 0, 100000)) bad.push('charge')
  if (!within(x.ambientC, -20, 60)) bad.push('ambient')
  return bad
}
export function sizeGenerator(x: GeneratorInput): GeneratorSizing | Invalid<GeneratorField> {
  const invalid = validateGenerator(x)
  if (invalid.length) return { valid: false, invalid }
  const motorKw = x.motorKw ?? 0, startFactor = START_FACTOR[x.start] ?? 3
  const runningKw = Math.max(x.runningKw!, motorKw)
  const surgeKw = runningKw + motorKw * (startFactor - 1)
  const steadyKw = (runningKw + (x.chargeKw ?? 0) / 0.95) * 1.1
  const pf = x.pf!
  const steadyKva = steadyKw / pf, startKva = surgeKw / pf
  const hot = x.ambientC! > 40
  const requiredKva = Math.max(steadyKva, startKva) * (hot ? 1.1 : 1)
  const inverterKw = runningKw * 1.25
  return {
    valid: true, runningKw, raisedToMotor: runningKw > x.runningKw!, motorKw, startFactor, surgeKw, steadyKw, steadyKva, startKva, hot, requiredKva,
    basis: startKva > steadyKva ? 'start' : 'steady', generatorKva: nextStd(requiredKva, STD_GENERATOR_KVA),
    inverterKw, inverterSurgeKw: surgeKw, inverterStdKw: nextStd(Math.max(inverterKw, surgeKw / 2), STD_INV_KW),
  }
}
