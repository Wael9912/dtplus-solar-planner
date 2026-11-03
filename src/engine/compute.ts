import type {
  Project, Results, Check, StepKey, Panel, Battery, Inverter, ChargeController, LoadItem, StringDesign, CableResult, DesignInput, ProtectionSummary,
  PriceBook, SizingInput, ProjectMode,
} from './types'
import {
  AMPACITY, COPPER_RHO_HOT, CALENDAR_LIFE_BY_CHEMISTRY, DAYS_IN_MONTH, DOD_BY_CHEMISTRY, ROUNDTRIP_BY_CHEMISTRY, STD_BATTERY_FUSE_A, STD_CABLE_MM2,
  STD_CHANGEOVER_A, STD_DC_FUSE_A, STD_DC_ISOLATOR_A, STD_GENERATOR_KVA, STD_MCB_A, STD_PV_DC_CLASS_V, STD_PV_FUSE_A, STD_RCD_A,
  ceilSafe, clamp, nextStd, r0, r1, r2,
} from './standards'
import { cat, avail, withPriceBook } from './catalogContext'
import { getLocation } from '../data/locations'
import { tiltGains, monthlyTiltRatios, annualRatio, optimalTiltFor } from './irradiance'
import { buildBom, COMBINER_TO_INVERTER_M, AC_INV_TO_COMBINER_M } from './bom'
import { buildQuoteFromBom, quoteFx, effectivePercents } from './quote'
import { computeEconomics } from './economics'
import { DEFAULT_DIESEL_USD_PER_KWH } from './defaults'
import { demandFromBill, projectMode, resolveSizing } from './sizing'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const mk = (id: string, level: Check['level'], step: StepKey, message: string, messageAr: string): Check => ({ id, level, message, messageAr, step })

// ---------------- Loads ----------------
/** §1.2 default coincidence (diversity) factor by number of load lines: ≤ 5 → 1.0, 6–15 → 0.8, > 15 → 0.7. */
export const autoCoincidence = (lines: number) => (lines <= 5 ? 1 : lines <= 15 ? 0.8 : 0.7)
/** A load running more than ~12 h/day cannot fit in daylight: night share ≥ (h − 12) / h (§1.4). */
export const nightShareFloorPct = (hoursPerDay: number) => (hoursPerDay > 12 ? ((hoursPerDay - 12) / hoursPerDay) * 100 : 0)
const sanitize = (loads: LoadItem[]) => loads
  .filter((l) => l.qty > 0 && l.watts > 0 && Number.isFinite(l.qty) && Number.isFinite(l.watts))
  .map((l) => {
    const h = clamp(l.hoursPerDay, 0, 24)
    return { ...l, hoursPerDay: h, nightSharePct: clamp(Math.max(Number.isFinite(l.nightSharePct) ? l.nightSharePct : 0, nightShareFloorPct(h)), 0, 100), surgeFactor: Math.max(1, Number.isFinite(l.surgeFactor) ? l.surgeFactor : 1) }
  })

/**
 * Load analysis (§1). `coincidence` applies to all loads, `criticalCoincidence` to the critical (backed-up) subset.
 * peak = max(connected × DF, largest single unit) — the design peak is never below the largest running appliance.
 */
export function computeLoads(loads: LoadItem[], coincidence: number, criticalCoincidence = coincidence) {
  const items = sanitize(loads)
  const crit = items.filter((l) => l.critical)
  const E = (l: LoadItem) => l.watts * l.qty * l.hoursPerDay
  const dailyWh = sum(items.map(E))
  const nightWh = sum(items.map((l) => E(l) * (l.nightSharePct / 100)))
  const criticalWh = sum(crit.map(E))
  const criticalNightWh = sum(crit.map((l) => E(l) * (l.nightSharePct / 100)))
  const connectedW = sum(items.map((l) => l.watts * l.qty))
  const criticalConnectedW = sum(crit.map((l) => l.watts * l.qty))
  const maxUnitW = Math.max(0, ...items.map((l) => l.watts))
  const criticalMaxUnitW = Math.max(0, ...crit.map((l) => l.watts))
  const peakW = Math.max(connectedW * coincidence, maxUnitW)
  // Largest single motor starting while everything else runs
  const extra = (xs: LoadItem[]) => Math.max(0, ...xs.map((l) => l.watts * (l.surgeFactor - 1)))
  const surgeW = peakW + extra(items)
  const criticalPeakW = crit.length ? Math.max(criticalConnectedW * criticalCoincidence, criticalMaxUnitW) : 0
  const criticalSurgeW = crit.length ? criticalPeakW + extra(crit) : 0
  return {
    dailyWh, dayWh: dailyWh - nightWh, nightWh, criticalWh, criticalNightWh, connectedW, criticalConnectedW, peakW, surgeW,
    maxUnitW, criticalMaxUnitW, criticalPeakW, criticalSurgeW, lineCount: items.length, criticalLineCount: crit.length,
  }
}

/**
 * Three-phase allocation (§1.2): 3-ph loads split evenly; single-phase units distributed largest-first to the least-loaded phase.
 * Returns connected W per phase and the largest single-phase unit.
 */
export function allocatePhases(loads: LoadItem[]): { phaseW: [number, number, number]; maxSinglePhaseUnitW: number } {
  const ph: [number, number, number] = [0, 0, 0]
  const items = sanitize(loads)
  for (const l of items.filter((x) => x.phase === 3)) for (let i = 0; i < 3; i++) ph[i] += (l.watts * l.qty) / 3
  const singles = items.filter((x) => x.phase !== 3).sort((a, b) => b.watts - a.watts)
  for (const l of singles) {
    const q = Math.ceil(l.qty), base = Math.floor(q / 3)
    if (base) for (let i = 0; i < 3; i++) ph[i] += base * l.watts
    for (let k = 0; k < q - base * 3; k++) { const i = ph.indexOf(Math.min(...ph)); ph[i] += l.watts }
  }
  return { phaseW: ph, maxSinglePhaseUnitW: Math.max(0, ...singles.map((l) => l.watts)) }
}

// ---------------- Lookups ----------------
export const getPanel = (id: string): Panel | undefined => cat().panels.find((p) => p.id === id)
export const getBattery = (id: string | null): Battery | undefined => (id ? cat().batteries.find((b) => b.id === id) : undefined)
export const getInverter = (id: string | null): Inverter | undefined => (id ? cat().inverters.find((i) => i.id === id) : undefined)
export const getController = (id: string | null): ChargeController | undefined => (id ? cat().chargeControllers.find((c) => c.id === id) : undefined)

/** NOCT cell-temperature model (methodology §3.3): T_cell = T_amb + (NOCT − 20)/800 × G.
 *  Default G = 800 W/m² (the NOCT reference) → ambient + 25 °C for NOCT 45, which is what the annual-energy derate uses.
 *  Pass G = 1000 for the hot-extreme string check (ambient + 31 °C ≈ the "T_amb_max + 30" guidance). */
export function cellTemp(ambientC: number, noct: number, irradianceWm2 = 800) {
  return ambientC + ((noct - 20) / 800) * irradianceWm2
}
/** Inverter efficiency on battery discharge, used for bank sizing and backup/autonomy (§4.1: 0.95). */
export const INV_EFF_BATT = 0.95
/** Inverter efficiency for the battery DC current (fuse/cable/C-rate, §8.3: 0.94). */
export const INV_EFF_DC = 0.94
/** Default inverter surge when a datasheet value is missing (§5: 2 × continuous). */
export const INV_SURGE_FACTOR = 2
/** Per-module balance-of-system allowance used when comparing battery configurations (cables, lugs, breaker). */
export const BATTERY_BOS_USD = 40

// ---------------- Auto-selection helpers ----------------
/** Does a battery unit fit the chosen bus voltage (in series groups)? 48 V bus accepts 12/12.8/24/25.6/48/51.2 V units; 'hv' accepts >60 V units. */
export function fitsSystemVoltage(b: Battery, sysV: Project['design']['systemVoltage']): boolean {
  if (sysV === 'hv') return b.nominalVoltage > 60
  if (b.nominalVoltage > 60) return false
  const k = Math.round(sysV / b.nominalVoltage)
  return k >= 1 && Math.abs(k * b.nominalVoltage - sysV) / sysV < 0.12
}
export const PV_CABLE_MIN_MM2 = 4
export const BATTERY_CABLE_MIN_MM2 = 10
export const AC_CABLE_MIN_MM2 = 2.5 // §8.2 A_min_practical for AC output
export const K_AMB = 0.87 // ampacity derating at 40 °C ambient (IEC 60364-5-52)

/** Parse an inverter battery window "160-800" → [160, 800]. */
export const parseVoltageWindow = (v: Inverter['batteryVoltage']): [number, number] | null => {
  if (typeof v !== 'string') return null
  const m = v.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}
export type BatteryCompatIssue = 'bus' | 'inverter-bus' | 'window' | 'brand' | null
/** Battery ↔ bus ↔ inverter compatibility (§4.2): bus voltage, inverter battery voltage / HV window, brand-locked interfaces. */
export function batteryCompatibility(b: Battery, inv: Inverter | null | undefined, sysV: DesignInput['systemVoltage']): BatteryCompatIssue {
  if (!fitsSystemVoltage(b, sysV)) return 'bus'
  if (!inv || inv.type === 'gridtie' || inv.batteryVoltage == null) return null
  if (b.inverterBrands && !b.inverterBrands.includes(inv.brand)) return 'brand'
  if (inv.batteryBrands) return inv.batteryBrands.includes(b.brand) ? null : 'brand'
  if (typeof inv.batteryVoltage === 'number') return sysV === inv.batteryVoltage ? null : 'inverter-bus'
  if (sysV !== 'hv') return 'inverter-bus'
  const w = parseVoltageWindow(inv.batteryVoltage)
  if (!w) return null
  return b.nominalVoltage >= w[0] && b.nominalVoltage <= w[1] ? null : 'window'
}

export function recommendInverter(type: Project['design']['systemType'], phase: 1 | 3, requiredKw: number, surgeKw: number, sysVoltage: Project['design']['systemVoltage'], allowChargerOnly = false, pvKwp = 0, panelImp = 0, panelIsc = 0): { inverter: Inverter; qty: number } | null {
  if (type === 'gridtie') return recommendGridTieInverter(phase, requiredKw, pvKwp, panelImp, panelIsc)
  const allowedTypes: Inverter['type'][] = type === 'hybrid' ? ['hybrid'] : ['offgrid', 'hybrid']
  const pool = avail().inverters
    // Inverter/chargers without PV input (mpptCount 0) are only auto-picked when the design already uses a separate MPPT controller
    .filter((i) => allowedTypes.includes(i.type) && i.phase === phase && (i.mpptCount > 0 || allowChargerOnly))
    .filter((i) => (sysVoltage === 'hv' ? typeof i.batteryVoltage === 'string' : i.batteryVoltage === sysVoltage))
    .sort((a, b) => a.ratedAcKw - b.ratedAcKw)
  if (!pool.length) return null
  // Single unit first: kW, surge, PV input capacity (×1.05 tolerance) and MPPT current ≥ module Imp; relax the PV criteria if nothing fits
  const fitsPv = (i: Inverter, q = 1) => i.mpptCount === 0 || i.maxPvInputKw * q * 1.05 >= pvKwp
  const fitsImp = (i: Inverter) => i.mpptCount === 0 || i.maxInputCurrentPerMppt >= panelImp
  const singles = pool.filter((i) => i.ratedAcKw >= requiredKw && (i.surgeKw || i.ratedAcKw * INV_SURGE_FACTOR) >= surgeKw)
  const single = singles.find((i) => fitsPv(i) && fitsImp(i)) ?? singles.find((i) => fitsPv(i))
  if (single) return { inverter: single, qty: 1 }
  // Parallel units: pick the largest unit that can be stacked within its parallel limit (enough units for load, surge and array)
  const qtyFor = (inv: Inverter) => Math.max(
    ceilSafe(requiredKw / inv.ratedAcKw), ceilSafe(surgeKw / (inv.surgeKw || inv.ratedAcKw * INV_SURGE_FACTOR)),
    inv.mpptCount > 0 && inv.maxPvInputKw > 0 ? ceilSafe(pvKwp / (inv.maxPvInputKw * 1.05)) : 1, 1)
  // No single unit takes the whole array: stack units of one size when that fits within the parallel limit, else the first single unit
  const stack = (xs: Inverter[]) => { for (const inv of xs) { const qty = qtyFor(inv); if (qty <= inv.parallelMax) return { inverter: inv, qty } } return null }
  if (singles.length) return stack(singles.filter((i) => fitsImp(i) && i.parallelMax > 1)) ?? { inverter: singles[0], qty: 1 }
  const stacked = stack([...pool].reverse())
  if (stacked) return stacked
  // Nothing stacks within its limit (e.g. 3 kW on a 12 V bus): return the biggest unit — computeProject raises `inv-parallel`
  const biggest = pool[pool.length - 1]
  return { inverter: biggest, qty: qtyFor(biggest) }
}

/** Grid-tied (§5): sized from the array (P_inv = PV / DC:AC target), grid-tie string inverters first, units side by side
 *  (no parallel limit, no surge — the grid supplies motor starts). Cheapest adequate configuration. */
function recommendGridTieInverter(phase: 1 | 3, requiredKw: number, pvKwp: number, panelImp: number, panelIsc: number): { inverter: Inverter; qty: number } | null {
  for (const types of [['gridtie'], ['hybrid']] as Inverter['type'][][]) {
    const pool = avail().inverters.filter((i) => types.includes(i.type) && i.phase === phase && i.mpptCount > 0 && i.maxInputCurrentPerMppt * 1.25 >= panelIsc)
    if (!pool.length) continue
    const cands = pool.map((i) => {
      const qty = Math.max(1, ceilSafe(requiredKw / i.ratedAcKw), i.maxPvInputKw > 0 ? ceilSafe(pvKwp / (i.maxPvInputKw * 1.05)) : 1)
      // a module Imp above the MPPT operating current only clips slightly: small price penalty, not a hard filter
      return { i, qty, score: qty * i.approxPriceUsd * (i.maxInputCurrentPerMppt >= panelImp ? 1 : 1.05) }
    })
    cands.sort((a, b) => a.score - b.score || a.qty - b.qty || a.i.ratedAcKw - b.i.ratedAcKw)
    return { inverter: cands[0].i, qty: cands[0].qty }
  }
  return null
}

/**
 * Cheapest adequate battery configuration (§4.2): for every unit that fits the bus (and the inverter, if given) the module
 * count is derived from the usable energy needed at that unit's DoD; the cheapest total (incl. a per-module BOS allowance)
 * within the unit's parallel limit wins, ties → fewer modules.
 * `requiredKwh` is nominal capacity at the chemistry default DoD (or at `dodOverride` when given).
 */
export function recommendBattery(sysVoltage: Project['design']['systemVoltage'], requiredKwh: number, chemistry: string = 'LiFePO4', opts: { inverter?: Inverter | null; dodOverride?: number | null; minDischargeA?: number } = {}): Battery | null {
  const pool = avail().batteries.filter((b) => b.chemistry === chemistry && batteryCompatibility(b, opts.inverter, sysVoltage) === null)
  if (!pool.length) return null
  const usableKwh = requiredKwh * (opts.dodOverride ?? DOD_BY_CHEMISTRY[chemistry] ?? 0.9)
  const cands = pool.map((b) => {
    const dod = opts.dodOverride ?? b.usableDodPct / 100
    const series = sysVoltage === 'hv' ? 1 : Math.max(1, Math.round(sysVoltage / b.nominalVoltage))
    const parallel = Math.max(1, ceilSafe(usableKwh / dod / (b.energyKwh * series)))
    const qty = series * parallel
    return { b, qty, parallel, cost: qty * (b.approxPriceUsd + BATTERY_BOS_USD) }
  })
  // Prefer configurations within the parallel limit that can also deliver the design discharge current
  const within = cands.filter((c) => c.parallel <= c.b.parallelMax)
  const strong = within.filter((c) => !opts.minDischargeA || c.b.maxDischargeA * c.parallel >= opts.minDischargeA)
  const list = (strong.length ? strong : within.length ? within : cands).sort((x, y) => x.cost - y.cost || x.qty - y.qty)
  return list[0]?.b ?? null
}

export function recommendPanel(targetKwp: number): Panel {
  // Large systems → high-watt modules; tiny systems → smaller modules
  const sorted = [...avail().panels].sort((a, b) => a.watts - b.watts)
  if (targetKwp < 0.6) return sorted.find((p) => p.watts >= 150) ?? sorted[0]
  if (targetKwp < 2) return sorted.find((p) => p.watts >= 400) ?? sorted[sorted.length - 1]
  return sorted.find((p) => p.watts >= 580) ?? sorted[sorted.length - 1]
}

// ---------------- Strings ----------------
export interface StringOpts {
  /** Building / site code limit on PV DC voltage (§7: 1000 V on buildings, 1500 V ground-mount). Default 1000. */
  codeLimitV?: number
  /** The panel count is fixed by the user: strongly prefer configurations without spare panels. */
  fixedCount?: boolean
}
export function designStrings(panel: Panel, inverter: Inverter, inverterQty: number, totalPanels: number, recordLowC: number, hotAmbientC: number, opts: StringOpts = {}): StringDesign {
  const notes: string[] = [], notesAr: string[] = []
  const vocCold = panel.voc * (1 + (panel.tempCoeffVocPctPerC / 100) * (recordLowC - 25))
  const tHot = cellTemp(hotAmbientC, panel.noct, 1000)
  const vmpHot = panel.vmp * (1 + (panel.tempCoeffPmaxPctPerC / 100) * (tHot - 25))
  // §7: N_max = floor(min(V_dc_max inverter (−3 % margin), module max system V, code limit) / Voc_cold)
  const vLimit = Math.min(inverter.maxPvVoltage * 0.97, panel.maxSystemVoltage ?? 1500, opts.codeLimitV ?? 1000)
  const rawMax = vocCold > 0 ? Math.floor(vLimit / vocCold) : 0
  if (rawMax < 1) {
    notes.push(`One module's cold Voc (${r1(vocCold)} V at ${recordLowC} °C) already exceeds the ${r0(vLimit)} V input limit.`)
    notesAr.push(`جهد الدائرة المفتوحة للوح واحد في البرد (${r1(vocCold)} V عند ${recordLowC} °م) يتجاوز وحده حد الدخل ${r0(vLimit)} V.`)
  }
  const maxSeries = Math.max(1, rawMax)
  // MPPT upper limit is checked at STC Vmp (§7: Vmp_STC × N ≤ V_mppt_max), otherwise the tracker clips on cold mornings
  const mpptMaxSeries = Math.max(1, Math.floor(inverter.mpptMaxV / panel.vmp))
  const minSeries = Math.max(1, ceilSafe(inverter.mpptMinV / vmpHot))
  const hi = Math.min(maxSeries, mpptMaxSeries)
  const stringsPerMpptCap = Math.max(1, Math.floor(inverter.maxInputCurrentPerMppt / panel.imp))
  const mpptTotal = Math.max(1, inverter.mpptCount * inverterQty)
  const capacityStrings = mpptTotal * stringsPerMpptCap

  let best = { pps: hi, strings: ceilSafe(totalPanels / hi), waste: Infinity }
  if (hi < minSeries) {
    notes.push(`Voltage window too narrow: need ≥${minSeries} panels/string for MPPT min but max is ${hi}.`)
    notesAr.push(`نطاق الجهد ضيق جداً: يلزم ${minSeries} ألواح على الأقل في السلسلة لبلوغ الحد الأدنى لـ MPPT، بينما الحد الأقصى المسموح ${hi}.`)
  }
  const wasteWeight = opts.fixedCount ? 100 : 10
  for (let pps = hi; pps >= Math.max(1, minSeries); pps--) {
    const strings = ceilSafe(totalPanels / pps)
    const waste = strings * pps - totalPanels
    // Prefer: fits MPPT capacity, minimal waste, equal strings per MPPT, and longer strings (§7: "prefer the largest N_series") —
    // each panel dropped from the string costs 3 points so that e.g. 13 × 17 (1 spare panel) beats 20 × 11 on a 1000 V inverter.
    const fits = strings <= capacityStrings
    const score = (fits ? 0 : 1000) + waste * wasteWeight + (strings % mpptTotal === 0 ? 0 : 3) + (hi - pps) * 3
    if (score < best.waste) best = { pps, strings, waste: score }
  }
  const total = best.pps * best.strings
  if (total !== totalPanels) {
    notes.push(opts.fixedCount
      ? `${totalPanels} panels do not divide into equal strings; the nearest equal layout is ${best.strings} × ${best.pps} = ${total} panels.`
      : `Panel count adjusted from ${totalPanels} to ${total} to give ${best.strings} equal strings of ${best.pps}.`)
    notesAr.push(opts.fixedCount
      ? `لا يمكن تقسيم ${totalPanels} لوحاً إلى سلاسل متساوية؛ أقرب توزيع متساوٍ هو ${best.strings} × ${best.pps} = ${total} لوحاً.`
      : `عُدِّل عدد الألواح من ${totalPanels} إلى ${total} للحصول على ${best.strings} سلاسل متساوية، في كلٍّ منها ${best.pps} ألواح.`)
  }
  const stringVocCold = vocCold * best.pps
  const ok = rawMax >= 1 && hi >= minSeries && best.strings <= capacityStrings && stringVocCold <= vLimit + 1e-9
  if (best.strings > capacityStrings) {
    notes.push(`${best.strings} strings exceed inverter MPPT capacity (${capacityStrings}); add a combiner box or a larger/second inverter.`)
    notesAr.push(`عدد السلاسل (${best.strings}) يتجاوز سعة مداخل MPPT في الإنفرتر (${capacityStrings})؛ أضف صندوق تجميع أو استخدم إنفرتراً أكبر أو إنفرتراً إضافياً.`)
  }
  return {
    panelsPerString: best.pps, strings: best.strings, totalPanels: total,
    vocCold: r1(stringVocCold), vmpHot: r1(vmpHot * best.pps), stringIscA: r1(panel.isc),
    stringsPerMppt: ceilSafe(best.strings / mpptTotal), mpptsUsed: Math.min(mpptTotal, best.strings), ok, notes, notesAr, maxSystemVoltageV: r0(vLimit),
  }
}

// ---------------- Cables ----------------
export interface SizeCableOpts {
  /** Protective device rating (A). Default: nextStd(currentA × factor) from the list for `use`; null = no standard device. */
  deviceA?: number | null
  deviceList?: number[]
  /** Conductor/device design factor on currentA (default 1.56 PV — NEC 690.8(B) — 1.25 battery / AC). */
  factor?: number
  minMm2?: number
  id?: string; count?: number; deviceType?: string; deviceRatedV?: number
}
/**
 * §8 selection: device I_n = nextStd(I_B × factor); conductor ampacity (per-use IEC/EN table × k_amb 0.87) ≥ max(I_n, I_B × factor)
 * so that I_B ≤ I_n ≤ I_z; smallest size that also meets the voltage-drop target and the practical minimum. When one 240 mm²
 * conductor cannot carry the current, n equal conductors are paralleled (`parallelRuns`). When the voltage-drop target cannot be
 * met, the largest size (for that number of runs) is returned with its real drop (the project raises `vdrop-*`).
 */
export function sizeCable(use: CableResult['use'], currentA: number, lengthM: number, voltage: number, maxDropPct: number, threePhase = false, opts: SizeCableOpts = {}): CableResult {
  const table = use === 'dc' ? AMPACITY.pv : use === 'battery' ? AMPACITY.battery : threePhase ? AMPACITY.ac3 : AMPACITY.ac1
  const factor = opts.factor ?? (use === 'dc' ? 1.56 : 1.25)
  const list = opts.deviceList ?? (use === 'dc' ? STD_PV_FUSE_A : use === 'battery' ? STD_BATTERY_FUSE_A : STD_MCB_A)
  const I = Math.max(0, Number.isFinite(currentA) ? currentA : 0)
  const rawDevice = I * factor
  const device = opts.deviceA !== undefined ? opts.deviceA : nextStd(rawDevice, list)
  const need = Math.max(device ?? 0, rawDevice)
  const k = threePhase ? Math.sqrt(3) : 2
  const floor = opts.minMm2 ?? (use === 'dc' ? PV_CABLE_MIN_MM2 : use === 'battery' ? BATTERY_CABLE_MIN_MM2 : AC_CABLE_MIN_MM2)
  const sizes = STD_CABLE_MM2.filter((x) => x >= floor)
  const largest = sizes[sizes.length - 1]
  const runs = Math.max(1, ceilSafe(need / (table[largest] * K_AMB)))
  const V = voltage > 0 ? voltage : 1
  const dropOf = (mm2: number) => ((k * lengthM * (I / runs) * COPPER_RHO_HOT) / mm2 / V) * 100
  let chosen = largest
  for (const mm2 of sizes) {
    if (table[mm2] * K_AMB * runs >= need && dropOf(mm2) <= maxDropPct) { chosen = mm2; break }
  }
  return {
    use, currentA: r1(I), lengthM, voltage: r0(voltage), sizeMm2: chosen, dropPct: r2(dropOf(chosen)),
    breakerA: device ?? Math.ceil(rawDevice), id: opts.id, count: opts.count ?? 1, parallelRuns: runs,
    ampacityA: r1(table[chosen] * K_AMB * runs), deviceType: opts.deviceType, deviceRatedV: opts.deviceRatedV, deviceStd: device != null,
  }
}

// ---------------- Main ----------------
const PEGGED_1_TO_1 = new Set(['USD', 'BSD', 'BMD', 'PAB'])

/**
 * Compute a project with the company price list applied (`book`: prices, hidden products, own products; omitted → catalogue).
 * Mode 'items' is a priced product list only; 'size' and 'design' run the full engine (§15: demand, fixed sizes, existing kit).
 */
export function computeProject(p: Project, book?: PriceBook | null): Results {
  return withPriceBook(book, () => (projectMode(p) === 'items' ? computeItems(p) : computeCore(p)))
}

function computeCore(p: Project): Results {
  const checks: Check[] = []
  const s = { ...p.site }, d = { ...p.design }, pr = p.pricing
  const isGT = d.systemType === 'gridtie'
  const mode: ProjectMode = projectMode(p)
  const sz: SizingInput = resolveSizing(p)
  const tgt = sz.targets
  // 'size' mode prices a system the client already chose: no consumption data, whatever the load list holds
  const demand: Results['demand'] = mode === 'size' ? 'none' : sz.demand
  const loadsIn = demand === 'loads' ? p.loads : []
  const qo = (id: string | undefined) => { const v = id ? pr.qtyOverrides?.[id] : undefined; return v != null && Number.isFinite(v) && v >= 1 ? Math.round(v) : null }

  // ---- Input guards (no NaN / Infinity can leave the engine)
  if (!(s.psh > 0)) { checks.push(mk('psh', 'error', 'site', 'Peak sun hours must be greater than 0 — enter the site irradiation.', 'يجب أن تكون ساعات الذروة الشمسية أكبر من صفر — أدخل قيمة الإشعاع الشمسي للموقع.')); s.psh = 0 }
  if (!(s.soilingLossPct >= 0 && s.soilingLossPct <= 95) || !(s.shadingLossPct >= 0 && s.shadingLossPct <= 95)) {
    checks.push(mk('losses', 'error', 'site', `Soiling ${s.soilingLossPct}% / shading ${s.shadingLossPct}% must each be between 0 and 95 % — values were limited.`,
      `يجب أن تكون خسائر الأتربة (${s.soilingLossPct}%) والتظليل (${s.shadingLossPct}%) بين 0 و95% لكلٍّ منهما — تم حصر القيم.`))
    s.soilingLossPct = clamp(s.soilingLossPct, 0, 95); s.shadingLossPct = clamp(s.shadingLossPct, 0, 95)
  }
  const siteFixes: string[] = []
  if (!Number.isFinite(s.ambientHighC)) { s.ambientHighC = 40; siteFixes.push('ambientHighC') }
  if (!Number.isFinite(s.ambientAvgC)) { s.ambientAvgC = s.ambientHighC - 8; siteFixes.push('ambientAvgC') }
  if (!Number.isFinite(s.recordLowC)) { s.recordLowC = 0; siteFixes.push('recordLowC') }
  if (!Number.isFinite(s.tiltDeg) || s.tiltDeg < 0 || s.tiltDeg > 90) { s.tiltDeg = clamp(s.tiltDeg, 0, 90); siteFixes.push('tiltDeg') }
  if (!Number.isFinite(s.azimuthDeg)) { s.azimuthDeg = 0; siteFixes.push('azimuthDeg') }
  if (siteFixes.length) checks.push(mk('site-input', 'warn', 'site', `Invalid site inputs were replaced: ${siteFixes.join(', ')}.`, `تم استبدال مدخلات موقع غير صالحة: ${siteFixes.join('، ')}.`))
  let dodOverride: number | null = null
  if (d.dodOverridePct != null) {
    if (d.dodOverridePct >= 10 && d.dodOverridePct <= 100) dodOverride = d.dodOverridePct / 100
    else checks.push(mk('dod', 'error', 'design', `Depth of discharge ${d.dodOverridePct}% must be between 10 % and 100 %; the battery's own DoD was used.`,
      `يجب أن يكون عمق التفريغ (${d.dodOverridePct}%) بين 10% و100%؛ تم استخدام عمق التفريغ الخاص بالبطارية.`))
  }
  const autonomyIn = d.autonomyDays
  d.autonomyDays = isGT ? 0 : clamp(autonomyIn, 0, 10)
  if (!isGT && (!Number.isFinite(autonomyIn) || autonomyIn < 0 || autonomyIn > 10)) checks.push(mk('autonomy', 'warn', 'design', `Autonomy ${autonomyIn} days is outside 0–10 days; ${d.autonomyDays} days was used.`,
    `أيام الاستقلالية (${autonomyIn}) خارج النطاق 0–10 أيام؛ تم استخدام ${d.autonomyDays}.`))
  const fixes: string[] = []
  const guard = (key: keyof DesignInput, lo: number, hi: number, fallback: number) => {
    const v = d[key] as number
    const nv = Number.isFinite(v) && v > 0 ? clamp(v, lo, hi) : fallback
    if (nv !== v) { fixes.push(String(key)); (d as unknown as Record<string, number>)[key] = nv }
  }
  guard('pvOversize', 0.5, 3, 1); guard('inverterSafety', 1, 3, 1.25); guard('dcAcRatio', 0.8, 2, 1.2)
  guard('dcCableRunM', 0.5, 10000, 20); guard('batteryCableRunM', 0.3, 500, 2); guard('acCableRunM', 0.5, 10000, 15); guard('maxVoltageDropPct', 0.5, 10, 2)
  guard('analysisYears', 1, 50, 25)
  if (!(d.degradationPctPerYear >= 0 && d.degradationPctPerYear <= 5)) { fixes.push('degradationPctPerYear'); d.degradationPctPerYear = clamp(d.degradationPctPerYear, 0, 5) }
  if (!d.coincidenceAuto && !(d.coincidenceFactor > 0 && d.coincidenceFactor <= 1)) {
    checks.push(mk('df', 'warn', 'loads', `Coincidence factor ${d.coincidenceFactor} must be between 0.1 and 1; ${r2(clamp(d.coincidenceFactor, 0.1, 1))} was used.`,
      `يجب أن يكون معامل التزامن (${d.coincidenceFactor}) بين 0.1 و1؛ تم استخدام ${r2(clamp(d.coincidenceFactor, 0.1, 1))}.`))
  }
  if (fixes.length) checks.push(mk('design-input', 'warn', 'design', `Out-of-range design inputs were limited: ${fixes.join(', ')}.`, `تم حصر مدخلات تصميم خارج النطاق المسموح: ${fixes.join('، ')}.`))
  if (loadsIn.some((l) => l.hoursPerDay > 24 || l.hoursPerDay < 0 || l.nightSharePct < 0 || l.nightSharePct > 100 || l.watts < 0 || l.qty < 0 || !Number.isFinite(l.watts) || !Number.isFinite(l.hoursPerDay)))
    checks.push(mk('load-input', 'warn', 'loads', 'Some load rows have hours above 24, a night share outside 0–100 % or negative values; they were limited.',
      'بعض صفوف الأحمال تحتوي على ساعات تشغيل أكثر من 24 أو نسبة ليلية خارج 0–100% أو قيم سالبة؛ تم حصرها.'))
  const cur = s.currency || 'USD'
  if (cur !== 'USD' && !(s.fxRateToUsd > 0 && Number.isFinite(s.fxRateToUsd))) checks.push(mk('fx-invalid', 'error', 'site', `Exchange rate must be greater than 0 ${cur} per USD; 1 was used.`, `يجب أن يكون سعر الصرف أكبر من صفر (${cur} لكل دولار)؛ تم استخدام 1.`))
  else if (!PEGGED_1_TO_1.has(cur) && s.fxRateToUsd === 1) checks.push(mk('fx-unset', 'error', 'site', `Exchange rate is 1 ${cur} per USD — enter the current rate on the Site step before quoting.`, `سعر الصرف مضبوط على 1 ${cur} لكل دولار — أدخل سعر الصرف الحالي في خطوة الموقع قبل إصدار العرض.`))
  const pc = effectivePercents(pr)
  if (pc.markupPct !== pr.marginPct || pc.discountPct !== pr.discountPct || pc.vatPct !== pr.vatPct)
    checks.push(mk('pricing-input', 'warn', 'bom', 'Markup (0–1000 %), discount (0–100 %) or VAT (0–100 %) was out of range and has been limited.', 'كانت نسبة الإضافة (0–1000%) أو الخصم (0–100%) أو ضريبة القيمة المضافة (0–100%) خارج النطاق وتم حصرها.'))

  // ---- Loads (§1) — or the electricity bill (§15.1)
  const items = sanitize(loadsIn)
  const dfManual = clamp(d.coincidenceFactor, 0.1, 1)
  const critCount = items.filter((l) => l.critical).length
  const df = d.coincidenceAuto ? autoCoincidence(items.length) : dfManual
  const dfCrit = d.coincidenceAuto ? autoCoincidence(critCount) : dfManual
  const L = demand === 'bill' ? demandFromBill(sz.bill) : computeLoads(loadsIn, df, dfCrit)
  const monthlyKwh = L.dailyWh * 30.4 / 1000
  const annualKwh = L.dailyWh * 365 / 1000
  // Hybrid: the bank, inverter, surge and backup time all follow the critical (backed-up) loads when any are flagged
  const hybridCritical = d.systemType === 'hybrid' && L.criticalLineCount > 0
  const sizingPeakW = hybridCritical ? L.criticalPeakW : L.peakW
  const sizingSurgeW = hybridCritical ? L.criticalSurgeW : L.surgeW

  // ---- Irradiance: monthly profile scaled to the annual PSH input (M9), monthly tilt gain from the site geometry
  const mpRaw = Array.isArray(s.monthlyPsh) && s.monthlyPsh.length === 12 && s.monthlyPsh.every((x) => Number.isFinite(x) && x >= 0) ? s.monthlyPsh : Array<number>(12).fill(s.psh)
  const mpMean = sum(mpRaw) / 12
  const kPsh = s.psh > 0 && mpMean > 0 ? s.psh / mpMean : 0
  const monthlyPshUsed = kPsh > 0 ? (Math.abs(kPsh - 1) < 1e-9 ? [...mpRaw] : mpRaw.map((x) => x * kPsh)) : Array<number>(12).fill(s.psh)
  const loc = s.locationId !== 'custom' ? getLocation(s.locationId) : undefined
  const lat = s.lat ?? loc?.lat
  const tg = tiltGains({ lat, tiltDeg: s.tiltDeg, azimuthDeg: s.azimuthDeg, tiltGainFactor: s.tiltGainFactor, refTiltDeg: loc?.optimalTiltDeg ?? (lat != null ? optimalTiltFor(lat) : undefined), monthlyGhi: monthlyPshUsed })
  const tiltGainUsed = tg.annual
  if (s.tiltDeg < 10) checks.push(mk('tilt-low', 'warn', 'site', `Tilt ${s.tiltDeg}° is below 10°: rain and wind will not self-clean the panels — expect higher soiling losses.`,
    `زاوية الميل ${s.tiltDeg}° أقل من 10°: لن تنظّف الأمطار والرياح الألواح ذاتياً — توقّع خسائر أتربة أعلى.`))
  const azAbs = Math.abs(((((s.azimuthDeg + 180) % 360) + 360) % 360) - 180)
  if (tg.modelled && lat != null && azAbs > 45) {
    const loss = 1 - annualRatio(monthlyTiltRatios(lat, s.tiltDeg, s.azimuthDeg, monthlyPshUsed), monthlyPshUsed) / annualRatio(monthlyTiltRatios(lat, s.tiltDeg, 0, monthlyPshUsed), monthlyPshUsed)
    checks.push(mk('azimuth', 'warn', 'site', `The array faces ${r0(azAbs)}° away from the equator: about ${r0(loss * 100)} % less annual energy than facing the equator at the same tilt.`,
      `المصفوفة منحرفة ${r0(azAbs)}° عن اتجاه خط الاستواء: إنتاج سنوي أقل بنحو ${r0(loss * 100)}% مقارنةً بتوجيهها نحو خط الاستواء بنفس الميل.`))
  }

  // ---- Panel (fixed PV size §15.2: pvKwp 0 = no panels, battery backup only)
  const pvTarget = tgt.pvKwp
  const invTarget = tgt.inverterKw
  // No consumption data and no PV size: the array follows the inverter (DC:AC target), else nothing
  const pvAuto = demand === 'none' ? (invTarget ?? 0) * d.dcAcRatio : null
  const roughKwp = pvTarget ?? pvAuto ?? (L.dailyWh / 1000) / Math.max(1, s.psh * tiltGainUsed * 0.7)
  const unknown = (what: string, whatAr: string, id: string) => checks.push(mk(`unknown-${what}`, 'error', 'design', `The selected ${what} "${id}" is not in the catalogue or your price list (deleted product?); the planner picked one automatically — choose it again.`,
    `${whatAr} المختار "${id}" غير موجود في الكتالوج أو قائمة أسعارك (منتج محذوف؟)؛ اختار المخطط بديلاً تلقائياً — اختره من جديد.`))
  const panelPick = d.panelId === 'auto' ? undefined : getPanel(d.panelId)
  if (d.panelId !== 'auto' && !panelPick) unknown('panel', 'اللوح', d.panelId)
  const panel = panelPick ?? recommendPanel(roughKwp)
  const panelOverride = qo(panel.id) ?? (d.panelOverrideQty != null && d.panelOverrideQty >= 1 ? Math.round(d.panelOverrideQty) : null)
  const manualInverter = getInverter(d.inverterId) ?? null
  if (d.inverterId && !manualInverter) unknown('inverter', 'الإنفرتر', d.inverterId)
  const noPv = panelOverride == null && (pvTarget === 0 || (pvAuto != null && pvTarget == null && !(pvAuto > 0)))
  const ccPath = !isGT && !noPv && (d.useSeparateController || manualInverter?.mpptCount === 0)

  // ---- Derate (energy): year-round average daytime high; the hot-day peak is reserved for the Vmp string check
  const manualBattery = !isGT && d.batteryId && d.batteryId !== 'auto' ? getBattery(d.batteryId) ?? null : null
  if (!isGT && d.batteryId && d.batteryId !== 'auto' && !manualBattery) unknown('battery', 'البطارية', d.batteryId)
  if (d.chargeControllerId && !getController(d.chargeControllerId)) unknown('controller', 'منظم الشحن', d.chargeControllerId)
  const chem = manualBattery?.chemistry ?? 'LiFePO4'
  const rt = ROUNDTRIP_BY_CHEMISTRY[chem] ?? 0.9
  const tCell = cellTemp(s.ambientAvgC, panel.noct)
  const tempFactor = 1 + (panel.tempCoeffPmaxPctPerC / 100) * (tCell - 25)
  const invEff = 0.96
  // Factors are stored unrounded so that `derate` is exactly the product of the displayed breakdown (UI/PDF/Excel round to 2 dp)
  const breakdown: Results['derateBreakdown'] = [
    { name: 'Temperature', nameAr: 'الحرارة', factor: Math.min(1, tempFactor) },
    { name: 'Soiling', nameAr: 'الأتربة والغبار', factor: 1 - s.soilingLossPct / 100 },
    { name: 'Shading', nameAr: 'التظليل', factor: 1 - s.shadingLossPct / 100 },
    { name: 'Wiring (DC+AC)', nameAr: 'الأسلاك (DC + AC)', factor: 0.97 },
    { name: 'Mismatch & nameplate', nameAr: 'عدم التطابق وتفاوت القدرة الاسمية', factor: 0.97 },
    { name: 'Inverter efficiency', nameAr: 'كفاءة الإنفرتر', factor: invEff },
    { name: 'Availability / dust storms', nameAr: 'جاهزية النظام / العواصف الترابية', factor: 0.98 },
  ]
  if (ccPath) breakdown.push({ name: 'MPPT charge controller', nameAr: 'منظم الشحن MPPT', factor: 0.97 }) // §3.2 η_cc
  if (!isGT) {
    // Energy that passes through the battery loses round-trip efficiency
    const nightShare = L.dailyWh > 0 ? L.nightWh / L.dailyWh : 0.5
    breakdown.push({ name: `Battery round-trip (${Math.round(nightShare * 100)}% via battery)`, nameAr: `كفاءة دورة البطارية (${Math.round(nightShare * 100)}% من الطاقة عبر البطارية)`, factor: 1 - nightShare * (1 - rt) })
  }
  const derate = breakdown.reduce((a, b) => a * b.factor, 1)

  // ---- PV (§3) — or the fixed size (§15.2)
  const tiltedPsh = s.psh * tiltGainUsed
  const requiredPvKwp = pvTarget ?? pvAuto ?? (tiltedPsh > 0 && derate > 0 ? (L.dailyWh / 1000) / (tiltedPsh * derate) * d.pvOversize : 0)
  const sizedQty = noPv ? 0 : Math.max(1, ceilSafe((requiredPvKwp * 1000) / panel.watts - 1e-9))
  let panelQty = panelOverride ?? sizedQty
  const arrayTargetKwp = panelOverride != null ? (panelOverride * panel.watts) / 1000 : noPv ? 0 : requiredPvKwp

  // ---- Inverter (§5): grid-tied from the array (DC:AC target), otherwise from the (critical) peak, the per-phase peak and the surge
  let phaseLoadsW: [number, number, number] | null = null, phaseMaxW = 0, phaseReqW = 0
  if (d.phase === 3) {
    const a = allocatePhases(hybridCritical ? items.filter((l) => l.critical) : items)
    phaseLoadsW = a.phaseW; phaseMaxW = Math.max(...a.phaseW)
    if (!isGT) phaseReqW = 3 * Math.max(phaseMaxW * (hybridCritical ? dfCrit : df), a.maxSinglePhaseUnitW) * d.inverterSafety
  }
  const balancedReqW = sizingPeakW * d.inverterSafety
  // Load-based requirement (checks) vs the size actually aimed for: the user's fixed kW, else the load (no data → follows the array)
  const loadReqKw = isGT || demand === 'none' ? arrayTargetKwp / d.dcAcRatio : Math.max(balancedReqW, phaseReqW) / 1000
  const requiredInverterKw = invTarget ?? loadReqKw
  const surgeKw = isGT ? 0 : sizingSurgeW / 1000
  let inverter: Inverter | null = manualInverter
  let inverterQty = 1
  if (inverter) inverterQty = qo(inverter.id) ?? Math.max(1, Math.round(d.inverterQty || 1))
  else {
    const rec = recommendInverter(d.systemType, d.phase, requiredInverterKw, surgeKw, d.systemVoltage, d.useSeparateController || noPv, arrayTargetKwp, panel.imp, panel.isc)
    inverter = rec?.inverter ?? null
    inverterQty = rec ? qo(rec.inverter.id) ?? rec.qty : 1
  }
  const inverterTotalKw = inverter ? inverter.ratedAcKw * inverterQty : 0
  const sysV = d.systemVoltage
  const sysVnum = sysV === 'hv' ? 400 : sysV
  if (!inverter) checks.push(mk('no-inverter', 'error', 'design', `No ${d.systemType} inverter in the catalogue matches ${d.phase}-phase at ${sysV === 'hv' ? 'HV' : sysV + ' V'} battery voltage; pick one manually or change the bus voltage.`,
    `لا يوجد في الكتالوج إنفرتر ${d.systemType === 'hybrid' ? 'هجين' : d.systemType === 'offgrid' ? 'منفصل عن الشبكة' : 'متصل بالشبكة'} يناسب نظاماً ${d.phase === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور'} بجهد بطاريات ${sysV === 'hv' ? 'عالٍ (HV)' : sysV + ' V'}؛ اختر إنفرتراً يدوياً أو غيّر جهد النظام.`))
  if (inverter && !isGT) {
    const need = demand === 'none' ? requiredInverterKw : Math.max(loadReqKw, invTarget ?? 0)
    if (inverterTotalKw < need * 0.999) checks.push(mk('inv-small', 'error', 'design', `Inverter capacity ${inverterTotalKw} kW is below required ${r1(need)} kW.`, `قدرة الإنفرتر ${inverterTotalKw} kW أقل من القدرة المطلوبة ${r1(need)} kW.`))
    const invSurge = (inverter.surgeKw || inverter.ratedAcKw * INV_SURGE_FACTOR) * inverterQty
    if (invSurge < surgeKw) checks.push(mk('inv-surge', 'warn', 'design', `Motor starting surge ${r1(surgeKw)} kW exceeds inverter peak ${r1(invSurge)} kW.`, `قدرة بدء تشغيل المحركات ${r1(surgeKw)} kW تتجاوز قدرة الذروة للإنفرتر ${r1(invSurge)} kW.`))
    if (inverterQty > inverter.parallelMax) checks.push(mk('inv-parallel', 'error', 'design', `${inverterQty} × ${inverter.brand} ${inverter.model} exceeds the manufacturer's parallel limit of ${inverter.parallelMax}; choose a larger unit or a higher bus voltage.`,
      `توصيل ${inverterQty} × ${inverter.brand} ${inverter.model} على التوازي يتجاوز حد الشركة المصنعة (${inverter.parallelMax})؛ اختر إنفرتراً أكبر أو جهد نظام أعلى.`))
    // §4.2 recommended DC bus by inverter power: 12 V ≤ 1 kW, 24 V ≤ 3 kW, 48 V ≤ 15 kW
    const busMax = sysV === 12 ? 1 : sysV === 24 ? 3 : sysV === 48 ? 15 : Infinity
    if (inverterTotalKw > busMax) checks.push(mk('lv-bus', 'warn', 'design', `${inverterTotalKw} kW on a ${sysV} V bus means ~${r0((inverterTotalKw * 1000) / (sysVnum * INV_EFF_DC))} A of battery current; use ${sysV === 48 ? 'a high-voltage battery system' : sysV === 24 ? 'a 48 V bus' : 'a 24 V or 48 V bus'} above ${busMax} kW.`,
      `قدرة ${inverterTotalKw} kW على جهد ${sysV} V تعني تيار بطارية يقارب ${r0((inverterTotalKw * 1000) / (sysVnum * INV_EFF_DC))} A؛ يُنصح باستخدام ${sysV === 48 ? 'بطاريات عالية الجهد' : sysV === 24 ? 'نظام 48 V' : 'نظام 24 V أو 48 V'} للأنظمة الأكبر من ${busMax} kW.`))
    if (inverter.type === 'gridtie') checks.push(mk('inv-type', 'error', 'design', `${inverter.brand} ${inverter.model} is a grid-tie inverter and cannot run from batteries; choose a ${d.systemType === 'hybrid' ? 'hybrid' : 'off-grid or hybrid'} inverter.`,
      `الإنفرتر ${inverter.brand} ${inverter.model} من النوع المتصل بالشبكة ولا يعمل على البطاريات؛ اختر إنفرتراً ${d.systemType === 'hybrid' ? 'هجيناً' : 'منفصلاً عن الشبكة أو هجيناً'}.`))
    else if (d.systemType === 'hybrid' && inverter.type === 'offgrid') checks.push(mk('inv-type', 'warn', 'design', `${inverter.brand} ${inverter.model} is an off-grid inverter: it can use the grid only as a charger/bypass input, not export or follow a meter.`,
      `الإنفرتر ${inverter.brand} ${inverter.model} من النوع المنفصل عن الشبكة: يستخدم الشبكة فقط كمدخل شحن/تجاوز، ولا يصدّر الطاقة ولا يعمل مع العداد.`))
    if (phaseLoadsW && phaseReqW > balancedReqW * 1.1) checks.push(mk('phase-unbalance', 'warn', 'loads',
      `Single-phase loads are unbalanced across the phases (L1 ${r0(phaseLoadsW[0])} W, L2 ${r0(phaseLoadsW[1])} W, L3 ${r0(phaseLoadsW[2])} W); the inverter is sized for 3 × the heaviest phase (${r1(phaseReqW / 1000)} kW). Rebalance the circuits to reduce it.`,
      `الأحمال أحادية الطور غير متوازنة بين الأطوار (L1 ‏${r0(phaseLoadsW[0])} W، L2 ‏${r0(phaseLoadsW[1])} W، L3 ‏${r0(phaseLoadsW[2])} W)؛ تم تحديد قدرة الإنفرتر على أساس 3 × أثقل طور (${r1(phaseReqW / 1000)} kW). أعد توزيع الدوائر لتقليلها.`))
  }
  if (inverter && isGT && inverter.type === 'offgrid') checks.push(mk('inv-type', 'error', 'design', `${inverter.brand} ${inverter.model} is an off-grid inverter and cannot feed the grid; choose a grid-tie or hybrid inverter.`,
    `الإنفرتر ${inverter.brand} ${inverter.model} منفصل عن الشبكة ولا يمكنه تغذية الشبكة؛ اختر إنفرتراً متصلاً بالشبكة أو هجيناً.`))
  if (inverter && inverter.phase !== d.phase) checks.push(mk('inv-phase', 'error', 'design', `Selected inverter is ${inverter.phase}-phase but the project is ${d.phase}-phase.`,
    `الإنفرتر المختار ${inverter.phase === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور'} بينما المشروع ${d.phase === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور'}.`))
  if (items.some((l) => l.phase === 3) && d.phase === 1) checks.push(mk('load-phase', 'error', 'info', 'Three-phase loads present but system is single-phase.', 'توجد أحمال ثلاثية الأطوار بينما النظام أحادي الطور.'))

  // ---- Battery (§4): sized for the energy it must deliver — or the fixed nominal kWh (§15.2; 0 = no battery); unit must suit the bus and the inverter
  const battTarget = isGT ? null : tgt.batteryKwh
  const battDailyWh = d.systemType === 'offgrid' ? L.dailyWh : d.systemType === 'hybrid' ? (hybridCritical ? L.criticalNightWh : L.nightWh) : 0
  const usableNeedKwh = (battDailyWh * d.autonomyDays) / INV_EFF_BATT / 1000
  const chemDod = DOD_BY_CHEMISTRY[chem] ?? 0.9
  const battery: Battery | null = isGT || battTarget === 0 ? null : manualBattery ?? (d.batteryId === 'auto' && (battTarget ?? usableNeedKwh) > 0
    ? recommendBattery(sysV, battTarget ?? usableNeedKwh / (dodOverride ?? chemDod), 'LiFePO4', { inverter, dodOverride, minDischargeA: (sizingPeakW * d.inverterSafety) / (sysVnum * INV_EFF_DC) }) : null)
  // Final DoD: user override > unit's usable DoD > chemistry default; the requirement is quoted at that DoD
  const dodFinal = dodOverride ?? (battery ? battery.usableDodPct / 100 : chemDod)
  const batteryRequiredKwh = battTarget ?? usableNeedKwh / dodFinal
  const battOverride = battery ? qo(battery.id) ?? (d.batteryOverrideQty != null && d.batteryOverrideQty >= 1 ? Math.round(d.batteryOverrideQty) : null)
    ?? (battTarget != null && battTarget > 0 ? Math.max(1, ceilSafe(battTarget / battery.energyKwh - 1e-9)) : null) : null
  let batteryQty = 0, series = 1, parallel = 0
  if (battery && (batteryRequiredKwh > 0 || battOverride != null)) {
    series = sysV === 'hv' ? 1 : Math.max(1, Math.round(sysVnum / battery.nominalVoltage))
    const needed = battOverride ?? ceilSafe(batteryRequiredKwh / battery.energyKwh)
    parallel = Math.max(1, ceilSafe(needed / series))
    batteryQty = series * parallel
    if (parallel > battery.parallelMax) checks.push(mk('batt-parallel', parallel > battery.parallelMax * 1.5 ? 'error' : 'warn', 'design', `${parallel} batteries in parallel exceeds manufacturer limit of ${battery.parallelMax}; split across inverters or use larger units.`,
      `توصيل ${parallel} بطاريات على التوازي يتجاوز حد الشركة المصنعة (${battery.parallelMax})؛ وزّعها على أكثر من إنفرتر أو استخدم بطاريات أكبر سعة.`))
  }
  const batteryKwh = battery ? batteryQty * battery.energyKwh : 0
  const batteryUsableKwh = batteryKwh * dodFinal
  const batteryAh = battery ? parallel * battery.capacityAh : 0
  const autonomyDays = battDailyWh > 0 ? (batteryUsableKwh * 1000 * INV_EFF_BATT) / battDailyWh : 0
  // Hours at the average night load (hybrid: of the backed-up loads; off-grid: of all loads, legacy meaning — use autonomyDays there)
  const nightBasisWh = d.systemType === 'hybrid' ? battDailyWh : L.nightWh
  const nightLoadW = nightBasisWh > 0 ? nightBasisWh / 12 : sizingPeakW * 0.3
  const batteryHoursBackup = nightLoadW > 0 ? (batteryUsableKwh * 1000 * INV_EFF_BATT) / nightLoadW : 0
  const hvBattery = sysV === 'hv'
  if (battery) {
    const issue = batteryCompatibility(battery, inverter, sysV)
    if (issue === 'bus') checks.push(mk('batt-voltage', 'error', 'design', `${battery.brand} ${battery.model} (${battery.nominalVoltage} V) does not suit a ${sysV === 'hv' ? 'high-voltage' : sysV + ' V'} battery bus.`,
      `البطارية ${battery.brand} ${battery.model} ‏(${battery.nominalVoltage} V) لا تناسب جهد نظام ${sysV === 'hv' ? 'عالٍ (HV)' : sysV + ' V'}.`))
    else if (issue && inverter) {
      const why = issue === 'brand' ? `only works with ${(inverter.batteryBrands ?? battery.inverterBrands ?? []).join(' / ')} ${inverter.batteryBrands ? 'batteries' : 'inverters'}`
        : issue === 'window' ? `accepts ${inverter.batteryVoltage} V but the bank is ${battery.nominalVoltage} V` : `is a ${inverter.batteryVoltage} V-battery inverter but the bus is ${sysV === 'hv' ? 'HV' : sysV + ' V'}`
      const whyAr = issue === 'brand' ? `لا يعمل إلا مع ${inverter.batteryBrands ? 'بطاريات' : 'إنفرترات'} ${(inverter.batteryBrands ?? battery.inverterBrands ?? []).join(' / ')}`
        : issue === 'window' ? `يقبل جهد بطاريات ${inverter.batteryVoltage} V بينما جهد البنك ${battery.nominalVoltage} V` : `مصمم لبطاريات ${inverter.batteryVoltage} V بينما جهد النظام ${sysV === 'hv' ? 'عالٍ (HV)' : sysV + ' V'}`
      checks.push(mk('batt-inverter', 'error', 'design', `Battery and inverter are not compatible: ${issue === 'brand' && battery.inverterBrands && !inverter.batteryBrands ? `${battery.brand} ${battery.model}` : `${inverter.brand} ${inverter.model}`} ${why}.`,
        `البطارية والإنفرتر غير متوافقين: ${issue === 'brand' && battery.inverterBrands && !inverter.batteryBrands ? `${battery.brand} ${battery.model}` : `${inverter.brand} ${inverter.model}`} ${whyAr}.`))
    }
  }
  if (!isGT && !battery) {
    if (battTarget === 0 && d.systemType === 'hybrid') checks.push(mk('no-batt', 'ok', 'design', 'No battery: the system runs with the grid only and gives no backup during outages.', 'بدون بطارية: يعمل النظام مع الشبكة فقط ولا يوفّر طاقة احتياطية أثناء الانقطاع.'))
    else if (d.systemType === 'offgrid' && (d.autonomyDays === 0 || battTarget === 0)) checks.push(mk('daytime-only', 'warn', 'design', 'Off-grid with 0 days autonomy and no battery: loads only run while the sun shines and stop at sunset.',
      'نظام منفصل عن الشبكة بدون أيام استقلالية وبدون بطارية: تعمل الأحمال فقط أثناء سطوع الشمس وتتوقف عند الغروب.'))
    else if (d.systemType === 'hybrid' && hybridCritical && L.criticalNightWh === 0 && d.batteryId === 'auto') checks.push(mk('no-batt', 'warn', 'design', 'The critical (backed-up) loads use no energy at night, so no battery was sized. Set their night share, mark night loads as critical or choose a battery manually.',
      'الأحمال الحرجة (المدعومة احتياطياً) لا تستهلك طاقة ليلاً، لذلك لم تُحدَّد بطارية. اضبط النسبة الليلية لها أو حدّد الأحمال الليلية كحرجة أو اختر بطارية يدوياً.'))
    else checks.push(mk('no-batt', d.systemType === 'offgrid' ? 'error' : 'warn', 'design', 'No battery selected.', 'لم يتم اختيار بطارية.'))
  }

  // ---- Strings (§7) — against the inverter MPPTs, or against the separate charge controller(s) (§6)
  let strings: StringDesign | null = null
  let controller: ChargeController | null = null, controllerQty = 0, requiredControllerA = 0
  const codeLimitV = s.roofType === 'ground' ? 1500 : 1000
  const fixedCount = panelOverride != null
  const viaController = !!inverter && !isGT && !noPv && panelQty > 0 && (d.useSeparateController || inverter.mpptCount === 0)
  if (inverter && viaController) {
    const manualCc = getController(d.chargeControllerId) ?? null
    const pickCc = (kwp: number) => {
      const reqA = (kwp * 1000 * 1.25) / sysVnum
      const cc = manualCc ?? avail().chargeControllers.filter((c) => c.batteryVoltages.includes(sysVnum) && c.type !== 'PWM').sort((a, b) => a.maxChargeA - b.maxChargeA).find((c) => c.maxChargeA >= reqA)
        ?? avail().chargeControllers.filter((c) => c.batteryVoltages.includes(sysVnum) && c.type !== 'PWM').sort((a, b) => b.maxChargeA - a.maxChargeA)[0] ?? null
      return { cc, reqA, qty: cc ? qo(cc.id) ?? Math.max(1, ceilSafe(reqA / cc.maxChargeA)) : 0 }
    }
    const virtualFor = (cc: ChargeController, qty: number): Inverter => ({ ...inverter!, maxPvVoltage: cc.maxPvVoltage, mpptMinV: sysVnum * 1.2 + 5, mpptMaxV: cc.maxPvVoltage * 0.95, mpptCount: qty, maxInputCurrentPerMppt: Math.max(panel.isc, (cc.maxChargeA * sysVnum) / Math.max(1, panel.vmp * 2)) })
    let sel = pickCc(arrayTargetKwp)
    const basePanelQty = panelQty
    if (sel.cc) {
      strings = designStrings(panel, virtualFor(sel.cc, sel.qty), 1, panelQty, s.recordLowC, s.ambientHighC, { codeLimitV, fixedCount })
      if (!fixedCount) panelQty = strings.totalPanels
      const again = pickCc((panelQty * panel.watts) / 1000)
      if (again.cc && (again.qty !== sel.qty || again.cc.id !== sel.cc.id)) {
        sel = again
        strings = designStrings(panel, virtualFor(sel.cc!, sel.qty), 1, basePanelQty, s.recordLowC, s.ambientHighC, { codeLimitV, fixedCount })
        if (!fixedCount) panelQty = strings.totalPanels
      }
      strings.viaController = true
      controller = sel.cc; controllerQty = sel.qty
      requiredControllerA = (panelQty * panel.watts * 1.25) / sysVnum
      const t = controller!.type ?? 'MPPT'
      if (!controller!.batteryVoltages.includes(sysVnum)) checks.push(mk('cc-voltage', 'error', 'design', `${controller!.brand} ${controller!.model} does not support a ${sysV === 'hv' ? 'high-voltage' : sysV + ' V'} battery.`,
        `منظم الشحن ${controller!.brand} ${controller!.model} لا يدعم بطاريات بجهد ${sysV === 'hv' ? 'عالٍ (HV)' : sysV + ' V'}.`))
      if (t === 'PWM') checks.push(mk('cc-pwm', 'warn', 'design', `${controller!.brand} ${controller!.model} is a PWM controller: the string Vmp must match the battery voltage and the extra voltage is wasted (≈ 20–30 % less energy). Use an MPPT controller.`,
        `منظم الشحن ${controller!.brand} ${controller!.model} من نوع PWM: يجب أن يطابق جهد السلسلة جهد البطارية ويُهدر فرق الجهد (طاقة أقل بنحو 20–30%). استخدم منظم MPPT.`))
      if (controllerQty * controller!.maxChargeA < requiredControllerA * 0.999) checks.push(mk('cc-small', 'warn', 'design', `${controllerQty} × ${controller!.maxChargeA} A controller(s) are below the ${r0(requiredControllerA)} A the array needs (§6); expect clipping.`,
        `${controllerQty} × منظم ${controller!.maxChargeA} A أقل من ${r0(requiredControllerA)} A التي تحتاجها المصفوفة؛ يُتوقع قصّ في القدرة.`))
      checks.push(inverter.mpptCount === 0
        ? mk('inv-charger', 'ok', 'design', `${inverter.brand} ${inverter.model} has no PV input; ${controllerQty} × ${controller!.brand} ${controller!.model} ${t} controller(s) added.`, `الإنفرتر ${inverter.brand} ${inverter.model} لا يحتوي على مدخل للألواح؛ أُضيف ${controllerQty} × منظم شحن ${t} ‏${controller!.brand} ${controller!.model}.`)
        : mk('inv-charger', 'ok', 'design', `PV is DC-coupled through ${controllerQty} × ${controller!.brand} ${controller!.model} ${t} controller(s); the inverter's own PV inputs are not used.`, `الألواح موصولة على جانب التيار المستمر عبر ${controllerQty} × منظم شحن ${t} ‏${controller!.brand} ${controller!.model}؛ ولا تُستخدم مداخل الألواح في الإنفرتر.`))
    } else checks.push(mk('cc-voltage', 'error', 'design', `No charge controller in the catalogue supports a ${sysV === 'hv' ? 'high-voltage' : sysV + ' V'} battery; use an inverter with built-in MPPT.`,
      `لا يوجد في الكتالوج منظم شحن يدعم بطاريات بجهد ${sysV === 'hv' ? 'عالٍ (HV)' : sysV + ' V'}؛ استخدم إنفرتراً بمنظم MPPT مدمج.`))
  } else if (inverter && inverter.mpptCount > 0 && panelQty > 0) {
    strings = designStrings(panel, inverter, inverterQty, panelQty, s.recordLowC, s.ambientHighC, { codeLimitV, fixedCount })
    if (!fixedCount) panelQty = strings.totalPanels
    // Datasheets quote an operating current (stored) and a higher Isc limit (typically 1.3–1.5× it). Isc above ~1.25× the operating
    // limit is a hard stop (210 mm modules on 13 A inputs); Imp above the operating limit only clips a little at peak irradiance.
    if (panel.isc > inverter.maxInputCurrentPerMppt * 1.25) checks.push(mk('isc-mppt', 'error', 'design', `Module Isc ${panel.isc} A exceeds the inverter MPPT input limit of ${inverter.maxInputCurrentPerMppt} A per string (common with 700 W+ 210 mm modules). Choose a smaller module or a different inverter.`,
      `تيار قصر الدائرة للوح (Isc) ‏${panel.isc} A يتجاوز حد مدخل MPPT في الإنفرتر (${inverter.maxInputCurrentPerMppt} A لكل سلسلة)، وهذا شائع مع ألواح 700 W فأكثر بخلايا 210 مم. اختر لوحاً أصغر أو إنفرتراً آخر.`))
    else if (panel.imp > inverter.maxInputCurrentPerMppt) checks.push(mk('imp-mppt', 'warn', 'design', `Module Imp ${panel.imp} A is above the MPPT operating limit of ${inverter.maxInputCurrentPerMppt} A; expect slight clipping at peak irradiance (confirm Isc ${panel.isc} A ≤ the inverter's Isc limit).`,
      `تيار التشغيل للوح (Imp) ‏${panel.imp} A أعلى من حد تشغيل MPPT ‏(${inverter.maxInputCurrentPerMppt} A)؛ يُتوقع قصّ طفيف للقدرة عند ذروة الإشعاع (تأكد أن Isc ‏${panel.isc} A لا يتجاوز حد Isc للإنفرتر).`))
  }
  let arrayKwp = (panelQty * panel.watts) / 1000
  if (strings && !strings.ok) checks.push(mk('strings', 'warn', 'design', strings.notes.join(' '), (strings.notesAr ?? strings.notes).join(' ')))
  if (strings && fixedCount && strings.totalPanels !== panelQty) checks.push(mk('strings-count', 'warn', 'design',
    `${panelQty} panels cannot be wired as equal strings; the string design assumes ${strings.strings} × ${strings.panelsPerString} = ${strings.totalPanels}. Change the panel quantity to ${strings.totalPanels}.`,
    `لا يمكن توصيل ${panelQty} لوحاً في سلاسل متساوية؛ تصميم السلاسل يفترض ${strings.strings} × ${strings.panelsPerString} = ${strings.totalPanels}. غيّر عدد الألواح إلى ${strings.totalPanels}.`))
  if (inverter && !viaController && inverter.mpptCount > 0 && inverter.maxPvInputKw * inverterQty < arrayKwp) checks.push(mk('pv-input', 'warn', 'design', `PV array ${r2(arrayKwp)} kWp exceeds inverter max PV input ${r1(inverter.maxPvInputKw * inverterQty)} kW; clipping or over-current risk.`,
    `قدرة المصفوفة ${r2(arrayKwp)} kWp تتجاوز أقصى قدرة دخل ألواح للإنفرتر ${r1(inverter.maxPvInputKw * inverterQty)} kW؛ يوجد خطر قص القدرة أو زيادة التيار.`))
  const dcAcRatio = inverterTotalKw > 0 ? arrayKwp / inverterTotalKw : 0
  if (isGT && inverter) {
    // §3.4/§14: grid-tied DC:AC 1.1–1.3; off-grid / hybrid inverters are sized for the load, so a low ratio is normal there
    if (dcAcRatio > 1.3) checks.push(mk('dcac-high', 'warn', 'design', `DC/AC ratio ${r2(dcAcRatio)} is high (>1.3); expect clipping — consider a larger inverter.`, `نسبة DC/AC ‏${r2(dcAcRatio)} مرتفعة (أكبر من 1.3)؛ يُتوقع قص في القدرة — يُنصح بإنفرتر أكبر.`))
    if (dcAcRatio > 0 && dcAcRatio < 0.7) checks.push(mk('dcac-low', 'warn', 'design', `DC/AC ratio ${r2(dcAcRatio)} is low (<0.7); inverter is oversized for the array.`, `نسبة DC/AC ‏${r2(dcAcRatio)} منخفضة (أقل من 0.7)؛ الإنفرتر أكبر من اللازم بالنسبة للمصفوفة.`))
  }
  const inverterOk = !!inverter && (isGT ? dcAcRatio <= 1.3 + 1e-9 && (inverter.maxPvInputKw * inverterQty * 1.05 >= arrayKwp || inverter.maxPvInputKw === 0) : inverterTotalKw >= requiredInverterKw * 0.999)

  // ---- Area (§9): flush mounts × 1.2; tilted rows on flat roofs / ground: cos β + 2 sin β (row spacing D = 2H), at least 1.2
  const arrayAreaM2 = (panelQty * panel.lengthMm * panel.widthMm) / 1e6
  const arrayWeightKg = panelQty * panel.weightKg
  const beta = (clamp(s.tiltDeg, 0, 90) * Math.PI) / 180
  const areaFactor = s.roofType === 'flat-concrete' || s.roofType === 'ground' ? Math.max(1.2, Math.cos(beta) + 2 * Math.sin(beta)) : 1.2
  const footprintM2 = arrayAreaM2 * areaFactor
  if (s.availableAreaM2 != null && s.availableAreaM2 > 0 && footprintM2 > s.availableAreaM2)
    checks.push(mk('area', 'warn', 'site', `Array needs ~${r0(footprintM2)} m² (incl. row spacing/setbacks) but only ${s.availableAreaM2} m² is available.`, `تحتاج المصفوفة إلى نحو ${r0(footprintM2)} m² (شاملة المسافات بين الصفوف) بينما المساحة المتاحة ${s.availableAreaM2} m² فقط.`))

  // ---- Energy (§10)
  const monthlyProductionKwh = monthlyPshUsed.map((psh, m) => arrayKwp * psh * tg.monthly[m] * derate * DAYS_IN_MONTH[m])
  const annualProductionKwh = sum(monthlyProductionKwh)
  const specificYield = arrayKwp > 0 ? annualProductionKwh / arrayKwp : 0
  const dailyNeedKwh = L.dailyWh / 1000
  const deficitMonths = monthlyPshUsed.map((psh, m) => (arrayKwp * psh * tg.monthly[m] * derate < dailyNeedKwh ? m : -1)).filter((m) => m >= 0)
  if (d.systemType === 'offgrid' && deficitMonths.length && L.dailyWh > 0) checks.push(mk('deficit', 'warn', 'design', `Daily production falls short of demand in ${deficitMonths.length} month(s); consider sizing for the worst month or adding a generator.`,
    `الإنتاج اليومي أقل من الطلب في ${deficitMonths.length} شهر/أشهر؛ فكّر في التصميم على أساس أسوأ شهر أو إضافة مولد.`))

  // ---- Battery current checks (§4.3)
  const battV = battery ? (hvBattery ? battery.nominalVoltage * series : sysVnum) : sysVnum
  if (battery && batteryQty > 0 && inverter && inverter.type !== 'gridtie') {
    const dischargeA = (inverterTotalKw * 1000) / (battV * INV_EFF_DC)
    if (dischargeA > battery.maxDischargeA * parallel) checks.push(mk('batt-discharge', 'warn', 'design', `Inverter can draw ${r0(dischargeA)} A but battery bank allows ${battery.maxDischargeA * parallel} A continuous. Add batteries in parallel, reduce inverter size or set its discharge limit to ≤ ${battery.maxDischargeA * parallel} A.`,
      `قد يسحب الإنفرتر ${r0(dischargeA)} A بينما يسمح بنك البطاريات بتفريغ مستمر قدره ${battery.maxDischargeA * parallel} A فقط. أضف بطاريات على التوازي أو اختر إنفرتراً أصغر أو اضبط حد التفريغ فيه على ${battery.maxDischargeA * parallel} A أو أقل.`))
    const chargeA = (arrayKwp * 1000 * 0.9) / battV
    if (chargeA > battery.maxChargeA * parallel) checks.push(mk('batt-charge', 'warn', 'design', `PV charge current ~${r0(chargeA)} A exceeds bank limit ${battery.maxChargeA * parallel} A; the inverter will throttle charging.`,
      `تيار الشحن من الألواح نحو ${r0(chargeA)} A يتجاوز حد البنك (${battery.maxChargeA * parallel} A)؛ سيقوم الإنفرتر بتقييد الشحن.`))
    if (inverter.maxChargeA * inverterQty * battV < (battDailyWh || L.nightWh) / 5) checks.push(mk('charge-time', 'warn', 'design', `Inverter charger (${inverter.maxChargeA * inverterQty} A) may be too small to refill the bank in ~5 sun hours.`,
      `قد يكون شاحن الإنفرتر (${inverter.maxChargeA * inverterQty} A) صغيراً لإعادة شحن البنك خلال نحو 5 ساعات شمس.`))
    if (battery.chemistry === 'AGM' || battery.chemistry === 'Gel' || battery.chemistry === 'Flooded') {
      const cDis = dischargeA / Math.max(1, batteryAh), cChg = chargeA / Math.max(1, batteryAh)
      if (cDis > 0.2 || cChg > 0.2) checks.push(mk('lead-crate', 'warn', 'design', `Lead-acid C-rate is high (discharge ${r2(cDis)} C, charge ${r2(cChg)} C; keep ≤ 0.2 C): usable capacity and life drop — add parallel strings or cap the inverter's currents.`,
        `معدل التفريغ/الشحن لبطاريات الرصاص مرتفع (تفريغ ${r2(cDis)} C، شحن ${r2(cChg)} C؛ الحد ≤ 0.2 C): تقل السعة المتاحة والعمر — أضف سلاسل على التوازي أو حدّد تيارات الإنفرتر.`))
      if (d.systemType === 'offgrid' && autonomyDays < 2) checks.push(mk('lead-autonomy', 'warn', 'design', `Lead-acid off-grid bank gives ${r1(autonomyDays)} day(s) of autonomy; ≥ 2 days is recommended to avoid deep daily cycling.`,
        `بنك بطاريات الرصاص في النظام المنفصل يعطي ${r1(autonomyDays)} يوم استقلالية؛ يُنصح بيومين على الأقل لتجنب التفريغ العميق اليومي.`))
    }
  }

  // ---- Generator (§11): peak load + battery recharge at a gentle C-rate (0.2 C LiFePO4/NMC, 0.1 C lead-acid, capped by the
  // inverter charger), charger efficiency 0.95, 10 % margin, PF 0.8, never below 1.5 × inverter kVA, +10 % above 40 °C ambient
  let generatorKva: number | null = null
  if (d.generatorBackup && !isGT) {
    const cRate = battery && (battery.chemistry === 'LiFePO4' || battery.chemistry === 'NMC') ? 0.2 : 0.1
    const chargerKw = inverter ? (inverter.maxChargeA * inverterQty * battV) / 1000 : Infinity
    const chargeKw = battery ? Math.min(batteryKwh * cRate, chargerKw) : 0
    const genKw = (sizingPeakW / 1000 + chargeKw / 0.95) * 1.1
    const kva = Math.max(genKw / 0.8, 1.5 * inverterTotalKw) * (s.ambientHighC > 40 ? 1.1 : 1)
    const std = nextStd(kva, STD_GENERATOR_KVA)
    if (d.generatorKva != null && d.generatorKva > 0) generatorKva = d.generatorKva
    else if (std != null) generatorKva = std
    else {
      generatorKva = Math.ceil(kva / 50) * 50
      checks.push(mk('gen-range', 'warn', 'design', `Generator of ~${r0(kva)} kVA is above the standard range; use synchronised parallel sets.`, `المولد المطلوب نحو ${r0(kva)} kVA أكبر من المقاسات القياسية؛ استخدم مولدات متوازية متزامنة.`))
    }
  }

  // ---- Cables & protection (§8)
  const schedule: CableResult[] = []
  const label = (c: CableResult, en: string, ar: string) => { c.label = en; c.labelAr = ar; schedule.push(c); return c }
  let combiners = 0, combinerOutputs = 0, perInput = 1
  let stringFuseA: number | null = null, arrayFuseA: number | null = null
  if (strings && strings.strings > 0) {
    // PV string fuse nextStd(1.56 × Isc) (≥ 1.5 × Isc per IEC 62548), never above the module's max series fuse
    let pvFuse = nextStd(panel.isc * 1.56, STD_PV_FUSE_A)
    if (panel.maxSeriesFuseA && pvFuse != null && pvFuse > panel.maxSeriesFuseA) pvFuse = nextStd(panel.isc * 1.5, STD_PV_FUSE_A)
    const inputs = viaController ? Math.max(1, controllerQty) : Math.max(1, (inverter?.mpptCount ?? 1) * inverterQty)
    perInput = ceilSafe(strings.strings / inputs)
    const stringV = panel.vmp * strings.panelsPerString
    label(sizeCable('dc', panel.isc, d.dcCableRunM, stringV, d.maxVoltageDropPct, false, { deviceA: pvFuse, minMm2: d.dcCableRunM > 25 ? 6 : PV_CABLE_MIN_MM2, id: 'pv-string', count: strings.strings, deviceType: 'gPV fuse', deviceRatedV: strings.vocCold > 1000 ? 1500 : 1000 }),
      'PV string DC', 'سلاسل الألواح DC')
    if (perInput > 2) {
      // ≥ 3 strings on one input: string fuses + combiner; the combiner output carries perInput × Isc (§7, §8.3)
      stringFuseA = pvFuse
      if (panel.maxSeriesFuseA && pvFuse != null && pvFuse > panel.maxSeriesFuseA) checks.push(mk('pv-fuse-module', 'warn', 'design', `String fuse ${pvFuse} A is above the module's ${panel.maxSeriesFuseA} A max series fuse rating; check the datasheet.`,
        `فيوز السلسلة ${pvFuse} A أعلى من الحد الأقصى لفيوز اللوح ${panel.maxSeriesFuseA} A؛ راجع ورقة البيانات.`))
      combinerOutputs = Math.min(inputs, ceilSafe(strings.strings / perInput))
      combiners = Math.max(ceilSafe(strings.strings / 6), 1)
      const arr = label(sizeCable('dc', panel.isc * perInput, COMBINER_TO_INVERTER_M, stringV, d.maxVoltageDropPct, false, { deviceList: STD_DC_FUSE_A, id: 'pv-array', count: combinerOutputs, deviceType: 'gPV NH fuse', deviceRatedV: strings.vocCold > 1000 ? 1500 : 1000 }),
        'PV array (combiner → inverter) DC', 'خرج صندوق التجميع ← الإنفرتر DC')
      arrayFuseA = arr.deviceStd ? arr.breakerA : null
    }
  }
  if (battery && batteryQty > 0 && inverter && inverter.type !== 'gridtie' && inverter.batteryVoltage != null) {
    const iPerInv = (inverter.ratedAcKw * 1000) / (battV * INV_EFF_DC)
    const minMm2 = hvBattery ? 6 : inverter.ratedAcKw >= 5 ? 25 : inverter.ratedAcKw >= 3 ? 16 : BATTERY_CABLE_MIN_MM2 // §8.2 practical minimum
    label(sizeCable('battery', iPerInv, d.batteryCableRunM, battV, Math.min(1, d.maxVoltageDropPct), false, { minMm2, id: 'battery', count: inverterQty, deviceType: hvBattery ? 'DC fuse / DC MCCB' : 'class-T fuse', deviceRatedV: hvBattery ? 1000 : 125 }),
      'Battery DC (per inverter)', 'البطارية DC (لكل إنفرتر)')
  }
  if (controller && controllerQty > 0 && battery) {
    label(sizeCable('battery', controller.maxChargeA, d.batteryCableRunM, sysVnum, Math.min(1, d.maxVoltageDropPct), false, { id: 'cc-battery', count: controllerQty, deviceType: 'class-T fuse', deviceRatedV: 125 }),
      'Charge controller → battery DC', 'منظم الشحن ← البطارية DC')
  }
  const three = d.phase === 3
  const acV = three ? 400 : 230
  const acI = (kw: number) => (three ? (kw * 1000) / (Math.sqrt(3) * 400) : (kw * 1000) / 230)
  let acMain: CableResult | null = null, acInv: CableResult | null = null, acGen: CableResult | null = null
  if (inverter) {
    acMain = label(sizeCable('ac', acI(inverterTotalKw), d.acCableRunM, acV, d.maxVoltageDropPct, three, { id: 'ac', deviceType: 'MCB/MCCB' }),
      inverterQty > 1 ? 'Inverter AC (combined feeder)' : 'Inverter AC output', inverterQty > 1 ? 'خرج الإنفرترات AC (المغذي المجمع)' : 'خرج الإنفرتر AC')
    if (inverterQty > 1) acInv = label(sizeCable('ac', acI(inverter.ratedAcKw), AC_INV_TO_COMBINER_M, acV, d.maxVoltageDropPct, three, { id: 'ac-inverter', count: inverterQty, deviceType: 'MCB/MCCB' }),
      'Inverter AC (each unit → AC combiner)', 'خرج كل إنفرتر AC ← لوحة التجميع')
    if (d.systemType === 'hybrid') label(sizeCable('ac', acI(inverterTotalKw), d.acCableRunM, acV, d.maxVoltageDropPct, three, { id: 'ac-grid', deviceType: 'MCB/MCCB' }),
      'Grid → inverter AC input', 'الشبكة ← مدخل الإنفرتر AC')
    if (generatorKva) acGen = label(sizeCable('ac', three ? (generatorKva * 1000) / (Math.sqrt(3) * 400) : (generatorKva * 1000) / 230, d.acCableRunM, acV, d.maxVoltageDropPct, three, { id: 'ac-generator', deviceType: 'MCB/MCCB' }),
      'Generator → ATS / inverter AC input', 'المولد ← مفتاح التحويل / مدخل الإنفرتر AC')
  }
  const legacyId: Record<string, string> = { 'pv-string': 'dc', battery: 'battery', ac: 'ac' }
  for (const c of schedule) {
    const limit = c.use === 'battery' ? Math.min(1, d.maxVoltageDropPct) : d.maxVoltageDropPct
    const cid = legacyId[c.id ?? ''] ?? c.id ?? c.use
    if (c.dropPct > limit + 0.005) checks.push(mk(`vdrop-${cid}`, 'warn', 'design', `${c.label} cable voltage drop ${c.dropPct}% exceeds the ${limit}% target even at ${c.sizeMm2} mm²; shorten the run or parallel conductors.`,
      `هبوط الجهد في كابل ${c.labelAr} ‏(${c.dropPct}%) يتجاوز الحد المستهدف ${limit}% حتى عند مقطع ${c.sizeMm2} mm²؛ قصّر مسار الكابل أو استخدم موصلات متوازية.`))
    if ((c.parallelRuns ?? 1) > 1) checks.push(mk(`cable-parallel-${cid}`, 'ok', 'design', `${c.label}: ${c.currentA} A is carried by ${c.parallelRuns} × ${c.sizeMm2} mm² conductors in parallel per pole (one 240 mm² cable is not enough); equal lengths and terminations are required.`,
      `${c.labelAr}: يُنقل التيار ${c.currentA} A عبر ${c.parallelRuns} × ${c.sizeMm2} mm² موصلات متوازية لكل قطب (لا يكفي كابل واحد 240 mm²)؛ يجب أن تتساوى الأطوال والتوصيلات.`))
    if (c.deviceStd === false) checks.push(mk(`breaker-range-${cid}`, 'error', 'design', `${c.label}: design current ${c.currentA} A needs a protective device above ${c.breakerA} A, beyond the standard range; split the circuit (more inverters / parallel feeders).`,
      `${c.labelAr}: تيار التصميم ${c.currentA} A يحتاج جهاز حماية أكبر من ${c.breakerA} A خارج المقاسات القياسية؛ قسّم الدائرة (عدد أكبر من الإنفرترات / مغذيات متوازية).`))
  }
  const bt = schedule.find((c) => c.id === 'battery')
  if (bt && inverter && bt.deviceStd !== false && inverter.maxChargeA > bt.breakerA) checks.push(mk('batt-charge-limit', 'warn', 'design', `Inverter max charge current ${inverter.maxChargeA} A is above the ${bt.breakerA} A battery fuse; set the inverter's charge limit to ≤ ${bt.breakerA} A.`,
    `أقصى تيار شحن للإنفرتر ${inverter.maxChargeA} A أعلى من فيوز البطارية ${bt.breakerA} A؛ اضبط حد الشحن في الإنفرتر على ${bt.breakerA} A أو أقل.`))
  const vocString = strings ? strings.vocCold : 0
  const protection: ProtectionSummary = {
    stringFuseA, arrayFuseA,
    dcIsolatorV: strings ? nextStd(vocString, STD_PV_DC_CLASS_V) : null,
    dcIsolatorA: strings ? nextStd(1.25 * panel.isc * Math.min(perInput, Math.max(1, strings.strings)), STD_DC_ISOLATOR_A) ?? STD_DC_ISOLATOR_A[STD_DC_ISOLATOR_A.length - 1] : null,
    spdDcV: strings ? nextStd(vocString, STD_PV_DC_CLASS_V) : null,
    batteryFuseA: bt ? bt.breakerA : null, batteryFuseVdc: bt ? (hvBattery ? 1000 : 125) : null,
    acBreakerPerInverterA: (acInv ?? acMain)?.breakerA ?? null, acMainBreakerA: acMain?.breakerA ?? null, generatorBreakerA: acGen?.breakerA ?? null,
    rcdA: !isGT && acMain ? nextStd(acMain.breakerA, STD_RCD_A) : null,
    changeoverA: null, changeoverType: null,
  }
  if (!isGT && acMain && (generatorKva || d.systemType === 'hybrid')) {
    protection.changeoverType = generatorKva ? 'ats' : 'manual'
    protection.changeoverA = nextStd(Math.max(acMain.breakerA, acGen?.breakerA ?? 0), STD_CHANGEOVER_A)
  }

  // ---- BOM (§12) and the money chain (same builder as the quote → Results.totalUsd × fx === quote.total)
  // ---- Existing equipment (§15.3): counted in the design, not quoted; company stock list
  const ex = sz.existing
  const exCheck = (n: number, of: number, what: string, whatAr: string) => {
    if (n > of) checks.push(mk(`existing-${what}`, 'warn', 'design', `${n} existing ${what} entered but the design has only ${of}; only ${of} are deducted from the quote.`,
      `أُدخل ${n} ${whatAr} موجودة بينما يحتوي التصميم على ${of} فقط؛ خُصم ${of} فقط من العرض.`))
  }
  exCheck(ex.panels, panelQty, 'panels', 'ألواح'); exCheck(ex.batteries, batteryQty, 'batteries', 'بطاريات'); exCheck(ex.inverters, inverter ? inverterQty : 0, 'inverters', 'إنفرترات')
  if (ex.panels + ex.batteries + ex.inverters > 0) checks.push(mk('existing', 'ok', 'design', 'Equipment already on site is part of the design but not of the price; savings and payback are shown for the whole system.',
    'المعدات الموجودة في الموقع جزء من التصميم وليست ضمن السعر؛ تُعرض الوفورات وفترة الاسترداد للنظام بالكامل.'))
  const hiddenIds = cat().hidden
  for (const x of [panelPick, manualInverter, manualBattery].filter((y): y is Panel | Inverter | Battery => !!y && hiddenIds.has(y.id)))
    checks.push(mk(`not-stocked-${x.id}`, 'warn', 'design', `${x.brand} ${x.model} is marked "not stocked" in your price list — confirm availability before quoting.`,
      `${x.brand} ${x.model} مُعلَّم "غير متوفر" في قائمة أسعارك — تأكّد من توفره قبل إصدار العرض.`))

  const { lines: bom, missing } = buildBom(p, pr, {
    panel, panelQty, arrayKwp, inverter, inverterQty, battery: batteryQty > 0 ? battery : null, batteryQty, batteryParallel: parallel, hvBattery,
    controller, controllerQty, strings, schedule, protection, combiners, combinerOutputs,
    dcInputs: viaController ? Math.max(1, controllerQty) : inverterQty, generatorKva,
    existing: { panels: Math.min(ex.panels, panelQty), batteries: Math.min(ex.batteries, batteryQty), inverters: inverter ? Math.min(ex.inverters, inverterQty) : 0 },
  })
  for (const id of missing) checks.push(mk(`bom-missing-${id}`, 'warn', 'bom', `BOM item "${id}" is not in the catalogue and is priced at 0 — enter a price.`, `البند "${id}" غير موجود في الكتالوج وسعره صفر — أدخل السعر.`))
  const fx = quoteFx(s)
  const q = buildQuoteFromBom(pr, s, bom)
  const equipmentCostUsd = q.equipmentCost / fx, labourUsd = q.servicesCost / fx, subtotalUsd = q.costSubtotal / fx
  const marginUsd = q.markup / fx, discountUsd = q.discount / fx, vatUsd = q.vat / fx, totalUsd = q.total / fx
  const costPerWp = arrayKwp > 0 ? totalUsd / (arrayKwp * 1000) : 0

  // ---- Economics (§10, §4.4)
  const sellRatio = subtotalUsd > 0 ? totalUsd / subtotalUsd : 1
  const lineUsd = (id: string | undefined) => (id ? bom.filter((b) => b.id === id).reduce((a, b) => a + b.totalUsd, 0) : 0)
  const battLife = battery ? Math.max(1, Math.min(battery.cycles / 365, CALENDAR_LIFE_BY_CHEMISTRY[battery.chemistry] ?? 10)) : null
  const offgrid = d.systemType === 'offgrid'
  const dieselKwh = s.dieselCostUsdPerKwh != null && s.dieselCostUsdPerKwh >= 0 ? s.dieselCostUsdPerKwh : DEFAULT_DIESEL_USD_PER_KWH
  // Hybrid with daily outages (§15.4): energy used during outages displaces diesel, the rest the grid tariff
  const outageShare = d.systemType === 'hybrid' ? clamp(Number.isFinite(s.outageHoursPerDay) ? s.outageHoursPerDay ?? 0 : 0, 0, 24) / 24 : 0
  const avoidedCostUsdPerKwh = offgrid ? dieselKwh : Math.max(0, s.gridTariff || 0) * (1 - outageShare) + dieselKwh * outageShare
  // No consumption data (fixed-size quote): assume the solar energy is used on site
  const noDemand = demand === 'none'
  if (noDemand && annualProductionKwh > 0) checks.push(mk('savings-assumed', 'ok', 'results', 'No consumption data: savings assume all the solar energy is used on site.',
    'لا توجد بيانات استهلاك: تفترض الوفورات استخدام كامل الطاقة الشمسية في الموقع.'))
  const eco = computeEconomics({
    systemType: d.systemType, annualProductionKwh,
    annualLoadKwh: noDemand ? annualProductionKwh : annualKwh, dayLoadKwhYr: noDemand ? annualProductionKwh : (L.dayWh * 365) / 1000, nightLoadKwhYr: noDemand ? 0 : (L.nightWh * 365) / 1000,
    batteryUsableKwh, tariffUsdPerKwh: avoidedCostUsdPerKwh, gridEmissionKgPerKwh: Math.max(0, s.gridEmission || 0), capexUsd: totalUsd,
    batteryReplacementUsd: lineUsd(battery?.id) * sellRatio, batteryLifeYears: battLife,
    inverterReplacementUsd: (lineUsd(inverter?.id) + lineUsd(controller?.id)) * sellRatio, inverterLifeYears: clamp(d.inverterLifeYears ?? 15, 5, 30),
    years: d.analysisYears, degradationPct: d.degradationPctPerYear, escalationPct: d.tariffEscalationPct ?? 3, discountRatePct: d.discountRatePct ?? 6, omPctPerYear: d.omPctPerYear ?? 1,
  })

  if (demand === 'loads' && L.dailyWh === 0) checks.push(mk('no-loads', 'error', 'loads', 'No loads entered yet.', 'لم تُدخل أي أحمال بعد.'))
  if (demand === 'bill' && L.dailyWh === 0) checks.push(mk('no-loads', 'error', 'loads', 'Enter the monthly consumption from the electricity bill.', 'أدخل الاستهلاك الشهري من فاتورة الكهرباء.'))
  if (!checks.some((c) => c.level !== 'ok')) checks.unshift(mk('all-ok', 'ok', 'results', 'All design checks passed.', 'اجتاز التصميم جميع الفحوصات.'))

  return {
    panel, mode, demand,
    dailyWh: L.dailyWh, dayWh: L.dayWh, nightWh: L.nightWh, criticalWh: L.criticalWh, peakW: L.peakW, surgeW: L.surgeW, connectedW: L.connectedW,
    monthlyKwh, annualKwh, coincidenceFactor: df, maxUnitW: L.maxUnitW, sizingPeakW, sizingSurgeW, phaseLoadsW, phaseMaxW,
    derate, derateBreakdown: breakdown, requiredPvKwp, panelQty, arrayKwp, arrayAreaM2, arrayWeightKg, tiltedPsh,
    monthlyProductionKwh, annualProductionKwh, specificYield, monthlyPshUsed, monthlyTiltGain: tg.monthly, tiltGainUsed, footprintM2, areaFactor,
    batteryRequiredKwh, batteryQty, batteryKwh, batteryUsableKwh, batteryAh, batteryConfig: { series, parallel }, batteryHoursBackup, dod: dodFinal,
    battery: batteryQty > 0 ? battery : null, batteryDailyWh: battDailyWh, autonomyDays,
    requiredInverterKw, inverter, inverterQty, inverterTotalKw, inverterOk, inverterSizingBasis: isGT ? 'array' : 'load', dcAcRatio,
    controller, controllerQty, requiredControllerA, strings,
    cables: schedule.filter((c) => c.id === 'pv-string' || c.id === 'battery' || c.id === 'ac'), cableSchedule: schedule, protection,
    generatorKva, bom, equipmentCostUsd, labourUsd, subtotalUsd, marginUsd, discountUsd, vatUsd, totalUsd, costPerWp,
    annualSavingsUsd: eco.annualSavingsUsd, paybackYears: eco.paybackYears, lcoeUsdPerKwh: eco.lcoeUsdPerKwh, co2TonsPerYear: eco.co2TonsPerYear,
    lifetimeProductionKwh: eco.lifetimeProductionKwh, roi25Pct: eco.roiPct, cumulativeCashflow: eco.cumulativeCashflow,
    savingsBasis: offgrid ? 'diesel' : 'grid', avoidedCostUsdPerKwh, usefulEnergyKwh: eco.usefulEnergyKwh, lifetimeUsefulKwh: eco.lifetimeUsefulKwh,
    omUsdPerYear: eco.omUsdPerYear, replacements: eco.replacements, npvUsd: eco.npvUsd,
    checks,
  }
}

/**
 * Mode 'items' (§15.5): a priced product list with no design — the BOM is the custom lines only, every engineering figure is 0.
 * The money chain is the same quote builder as a full design, so screen, PDF and Excel agree.
 */
function computeItems(p: Project): Results {
  const pr = p.pricing, s = p.site
  const checks: Check[] = []
  const lines = (pr.customItems ?? []).filter((l) => !pr.excludedIds.includes(l.id))
  const fx = quoteFx(s)
  const { lines: bom } = buildBom(p, pr, null)
  const q = buildQuoteFromBom(pr, s, bom)
  const cur = s.currency || 'USD'
  if (cur !== 'USD' && !(s.fxRateToUsd > 0 && Number.isFinite(s.fxRateToUsd))) checks.push(mk('fx-invalid', 'error', 'bom', `Exchange rate must be greater than 0 ${cur} per USD; 1 was used.`, `يجب أن يكون سعر الصرف أكبر من صفر (${cur} لكل دولار)؛ تم استخدام 1.`))
  else if (!PEGGED_1_TO_1.has(cur) && s.fxRateToUsd === 1) checks.push(mk('fx-unset', 'error', 'bom', `Exchange rate is 1 ${cur} per USD — enter the current rate before quoting.`, `سعر الصرف مضبوط على 1 ${cur} لكل دولار — أدخل سعر الصرف الحالي قبل إصدار العرض.`))
  if (!lines.length) checks.push(mk('no-items', 'error', 'bom', 'Add the products to quote.', 'أضف المنتجات المطلوب تسعيرها.'))
  const zero12 = Array<number>(12).fill(0)
  const panel = cat().panels[0]
  return {
    panel, mode: 'items', demand: 'none',
    dailyWh: 0, dayWh: 0, nightWh: 0, criticalWh: 0, peakW: 0, surgeW: 0, connectedW: 0, monthlyKwh: 0, annualKwh: 0, coincidenceFactor: 1, maxUnitW: 0,
    sizingPeakW: 0, sizingSurgeW: 0, phaseLoadsW: null, phaseMaxW: 0,
    derate: 1, derateBreakdown: [], requiredPvKwp: 0, panelQty: 0, arrayKwp: 0, arrayAreaM2: 0, arrayWeightKg: 0, tiltedPsh: 0,
    monthlyProductionKwh: zero12, annualProductionKwh: 0, specificYield: 0, monthlyPshUsed: zero12, monthlyTiltGain: zero12, tiltGainUsed: 1, footprintM2: 0, areaFactor: 1,
    batteryRequiredKwh: 0, batteryQty: 0, batteryKwh: 0, batteryUsableKwh: 0, batteryAh: 0, batteryConfig: { series: 0, parallel: 0 }, batteryHoursBackup: 0, dod: 0,
    battery: null, batteryDailyWh: 0, autonomyDays: 0,
    requiredInverterKw: 0, inverter: null, inverterQty: 0, inverterTotalKw: 0, inverterOk: true, inverterSizingBasis: 'load', dcAcRatio: 0,
    controller: null, controllerQty: 0, requiredControllerA: 0, strings: null, cables: [], cableSchedule: [],
    protection: { stringFuseA: null, arrayFuseA: null, dcIsolatorV: null, dcIsolatorA: null, spdDcV: null, batteryFuseA: null, batteryFuseVdc: null, acBreakerPerInverterA: null, acMainBreakerA: null, generatorBreakerA: null, rcdA: null, changeoverA: null, changeoverType: null },
    generatorKva: null,
    bom, equipmentCostUsd: q.equipmentCost / fx, labourUsd: q.servicesCost / fx, subtotalUsd: q.costSubtotal / fx, marginUsd: q.markup / fx, discountUsd: q.discount / fx, vatUsd: q.vat / fx, totalUsd: q.total / fx,
    costPerWp: 0, annualSavingsUsd: 0, paybackYears: null, lcoeUsdPerKwh: 0, co2TonsPerYear: 0, lifetimeProductionKwh: 0, roi25Pct: null, cumulativeCashflow: [],
    savingsBasis: 'grid', avoidedCostUsdPerKwh: 0, usefulEnergyKwh: 0, lifetimeUsefulKwh: 0, omUsdPerYear: 0, replacements: [], npvUsd: 0,
    checks: checks.length ? checks : [mk('all-ok', 'ok', 'bom', 'Quote is complete.', 'العرض مكتمل.')],
  }
}
