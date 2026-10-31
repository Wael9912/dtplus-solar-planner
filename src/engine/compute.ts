import type {
  Project, Results, Check, Panel, Battery, Inverter, ChargeController, LoadItem, StringDesign, CableResult, BomLine, CatalogItem,
} from './types'
import {
  CABLE_AMPACITY, COPPER_RHO_HOT, DAYS_IN_MONTH, DOD_BY_CHEMISTRY, ROUNDTRIP_BY_CHEMISTRY, STD_BATTERY_FUSE_A, STD_CABLE_MM2, STD_GENERATOR_KVA,
  STD_MCB_A, STD_PV_FUSE_A, r0, r1, r2, roundUpStd,
} from './standards'
import { catalog } from '../data/catalog'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

// ---------------- Loads ----------------
export function computeLoads(loads: LoadItem[], coincidence: number) {
  const items = loads.filter((l) => l.qty > 0 && l.watts > 0)
  const dailyWh = sum(items.map((l) => l.watts * l.qty * l.hoursPerDay))
  const nightWh = sum(items.map((l) => l.watts * l.qty * l.hoursPerDay * (l.nightSharePct / 100)))
  const criticalWh = sum(items.filter((l) => l.critical).map((l) => l.watts * l.qty * l.hoursPerDay))
  const criticalNightWh = sum(items.filter((l) => l.critical).map((l) => l.watts * l.qty * l.hoursPerDay * (l.nightSharePct / 100)))
  const connectedW = sum(items.map((l) => l.watts * l.qty))
  const criticalConnectedW = sum(items.filter((l) => l.critical).map((l) => l.watts * l.qty))
  const peakW = connectedW * coincidence
  // Largest single motor starting while everything else runs
  const largestSurgeExtra = Math.max(0, ...items.map((l) => l.watts * (Math.max(1, l.surgeFactor) - 1)))
  const surgeW = peakW + largestSurgeExtra
  return { dailyWh, dayWh: dailyWh - nightWh, nightWh, criticalWh, criticalNightWh, connectedW, criticalConnectedW, peakW, surgeW }
}

// ---------------- Lookups ----------------
export const getPanel = (id: string): Panel | undefined => catalog.panels.find((p) => p.id === id)
export const getBattery = (id: string | null): Battery | undefined => (id ? catalog.batteries.find((b) => b.id === id) : undefined)
export const getInverter = (id: string | null): Inverter | undefined => (id ? catalog.inverters.find((i) => i.id === id) : undefined)
export const getController = (id: string | null): ChargeController | undefined => (id ? catalog.chargeControllers.find((c) => c.id === id) : undefined)
const item = (id: string): CatalogItem | undefined => catalog.items.find((i) => i.id === id)

/** NOCT cell-temperature model (methodology §3.3): T_cell = T_amb + (NOCT − 20)/800 × G.
 *  Default G = 800 W/m² (the NOCT reference) → ambient + 25 °C for NOCT 45, which is what the annual-energy derate uses.
 *  Pass G = 1000 for the hot-extreme string check (ambient + 31 °C ≈ the "T_amb_max + 30" guidance). */
export function cellTemp(ambientC: number, noct: number, irradianceWm2 = 800) {
  return ambientC + ((noct - 20) / 800) * irradianceWm2
}
/** Inverter efficiency on battery discharge, used for bank sizing and backup-hours (§4.1: 0.95). */
export const INV_EFF_BATT = 0.95

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

export function recommendInverter(type: Project['design']['systemType'], phase: 1 | 3, requiredKw: number, surgeKw: number, sysVoltage: Project['design']['systemVoltage']): { inverter: Inverter; qty: number } | null {
  const allowedTypes: Inverter['type'][] = type === 'gridtie' ? ['gridtie', 'hybrid'] : type === 'hybrid' ? ['hybrid'] : ['offgrid', 'hybrid']
  const pool = catalog.inverters
    .filter((i) => allowedTypes.includes(i.type) && i.phase === phase && (type !== 'gridtie' || i.mpptCount > 0))
    .filter((i) => {
      if (type === 'gridtie') return true
      if (sysVoltage === 'hv') return typeof i.batteryVoltage === 'string'
      return i.batteryVoltage === sysVoltage
    })
    .sort((a, b) => a.ratedAcKw - b.ratedAcKw)
  if (!pool.length) return null
  // Single unit first
  const single = pool.find((i) => i.ratedAcKw >= requiredKw && (i.surgeKw ?? i.ratedAcKw * 1.5) >= surgeKw)
  if (single) return { inverter: single, qty: 1 }
  // Parallel units: pick the largest unit and stack
  for (const inv of [...pool].reverse()) {
    const qty = Math.ceil(requiredKw / inv.ratedAcKw)
    if (qty <= inv.parallelMax) return { inverter: inv, qty }
  }
  const biggest = pool[pool.length - 1]
  return { inverter: biggest, qty: Math.ceil(requiredKw / biggest.ratedAcKw) }
}

export function recommendBattery(sysVoltage: Project['design']['systemVoltage'], requiredKwh: number, chemistry: string = 'LiFePO4'): Battery | null {
  const pool = catalog.batteries.filter((b) => fitsSystemVoltage(b, sysVoltage)).filter((b) => b.chemistry === chemistry)
  if (!pool.length) return null
  // Prefer the unit that gives the fewest modules while staying within parallelMax; tie-break on price per kWh
  const fit = pool
    .map((b) => ({ b, qty: Math.ceil(requiredKwh / b.energyKwh) }))
    .sort((x, y) => x.qty - y.qty || x.b.approxPriceUsd / x.b.energyKwh - y.b.approxPriceUsd / y.b.energyKwh)
  return (fit.find((f) => f.qty <= f.b.parallelMax) ?? fit[0])?.b ?? null
}

export function recommendPanel(targetKwp: number): Panel {
  // Large systems → high-watt modules; tiny systems → smaller modules
  const sorted = [...catalog.panels].sort((a, b) => a.watts - b.watts)
  if (targetKwp < 0.6) return sorted.find((p) => p.watts >= 150) ?? sorted[0]
  if (targetKwp < 2) return sorted.find((p) => p.watts >= 400) ?? sorted[sorted.length - 1]
  return sorted.find((p) => p.watts >= 580) ?? sorted[sorted.length - 1]
}

// ---------------- Strings ----------------
export function designStrings(panel: Panel, inverter: Inverter, inverterQty: number, totalPanels: number, recordLowC: number, hotAmbientC: number): StringDesign {
  const notes: string[] = []
  const vocCold = panel.voc * (1 + (panel.tempCoeffVocPctPerC / 100) * (recordLowC - 25))
  const tHot = cellTemp(hotAmbientC, panel.noct, 1000)
  const vmpHot = panel.vmp * (1 + (panel.tempCoeffPmaxPctPerC / 100) * (tHot - 25))
  const maxSeries = Math.max(1, Math.floor((inverter.maxPvVoltage * 0.97) / vocCold))
  // MPPT upper limit is checked at STC Vmp (§7: Vmp_STC × N ≤ V_mppt_max), otherwise the tracker clips on cold mornings
  const mpptMaxSeries = Math.max(1, Math.floor(inverter.mpptMaxV / panel.vmp))
  const minSeries = Math.max(1, Math.ceil(inverter.mpptMinV / vmpHot))
  const hi = Math.min(maxSeries, mpptMaxSeries)
  const stringsPerMppt = Math.max(1, Math.floor(inverter.maxInputCurrentPerMppt / panel.imp))
  const mpptTotal = inverter.mpptCount * inverterQty
  const capacityStrings = mpptTotal * stringsPerMppt

  let best = { pps: hi, strings: Math.ceil(totalPanels / hi), waste: Infinity }
  if (hi < minSeries) {
    notes.push(`Voltage window too narrow: need ≥${minSeries} panels/string for MPPT min but max is ${hi}.`)
  }
  for (let pps = hi; pps >= Math.max(1, minSeries); pps--) {
    const strings = Math.ceil(totalPanels / pps)
    const waste = strings * pps - totalPanels
    // Prefer: fits MPPT capacity, minimal waste, equal strings per MPPT, and longer strings (§7: "prefer the largest N_series") —
    // each panel dropped from the string costs 3 points so that e.g. 13 × 17 (1 spare panel) beats 20 × 11 on a 1000 V inverter.
    const fits = strings <= capacityStrings
    const score = (fits ? 0 : 1000) + waste * 10 + (strings % mpptTotal === 0 ? 0 : 3) + (hi - pps) * 3
    if (score < best.waste) best = { pps, strings, waste: score }
  }
  const total = best.pps * best.strings
  if (total !== totalPanels) notes.push(`Panel count adjusted from ${totalPanels} to ${total} to give ${best.strings} equal strings of ${best.pps}.`)
  const ok = hi >= minSeries && best.strings <= capacityStrings
  if (best.strings > capacityStrings) notes.push(`${best.strings} strings exceed inverter MPPT capacity (${capacityStrings}); add a combiner box or a larger/second inverter.`)
  return {
    panelsPerString: best.pps, strings: best.strings, totalPanels: total,
    vocCold: r1(vocCold * best.pps), vmpHot: r1(vmpHot * best.pps), stringIscA: r1(panel.isc),
    stringsPerMppt: Math.min(stringsPerMppt, Math.ceil(best.strings / mpptTotal)), mpptsUsed: Math.min(mpptTotal, best.strings), ok, notes,
  }
}

// ---------------- Cables ----------------
export function sizeCable(use: CableResult['use'], currentA: number, lengthM: number, voltage: number, maxDropPct: number, threePhase = false): CableResult {
  const k = threePhase ? Math.sqrt(3) : 2
  let chosen = STD_CABLE_MM2[STD_CABLE_MM2.length - 1]
  let drop = 100
  const floor = use === 'dc' ? PV_CABLE_MIN_MM2 : use === 'battery' ? BATTERY_CABLE_MIN_MM2 : AC_CABLE_MIN_MM2
  for (const mm2 of STD_CABLE_MM2) {
    if (mm2 < floor) continue
    const amp = CABLE_AMPACITY[mm2] * K_AMB
    const vd = (k * lengthM * currentA * COPPER_RHO_HOT) / mm2
    const pct = (vd / voltage) * 100
    if (amp >= currentA * 1.25 && pct <= maxDropPct) { chosen = mm2; drop = pct; break }
  }
  if (drop === 100) drop = ((k * lengthM * currentA * COPPER_RHO_HOT) / chosen / voltage) * 100
  const breakerA = use === 'dc' ? roundUpStd(currentA * 1.56, STD_PV_FUSE_A) : use === 'battery' ? roundUpStd(currentA * 1.25, STD_BATTERY_FUSE_A) : roundUpStd(currentA * 1.25, STD_MCB_A)
  return { use, currentA: r1(currentA), lengthM, voltage: r0(voltage), sizeMm2: chosen, dropPct: r2(drop), breakerA }
}

// ---------------- Main ----------------
export function computeProject(p: Project): Results {
  const checks: Check[] = []
  const { design: d, site: s, pricing: pr } = p
  const L = computeLoads(p.loads, d.coincidenceFactor)
  const monthlyKwh = L.dailyWh * 30.4 / 1000
  const annualKwh = L.dailyWh * 365 / 1000

  // Rough kWp estimate (derate 0.7) to pick a sensible module class when on Auto
  const roughKwp = (L.dailyWh / 1000) / Math.max(1, s.psh * s.tiltGainFactor * 0.7)
  const panel = (d.panelId === 'auto' ? recommendPanel(roughKwp) : getPanel(d.panelId)) ?? recommendPanel(roughKwp)
  const battery = d.batteryId === 'auto' ? undefined : getBattery(d.batteryId)
  const chem = battery?.chemistry ?? 'LiFePO4'
  const dod = (d.dodOverridePct ?? (battery ? battery.usableDodPct : DOD_BY_CHEMISTRY[chem] * 100)) / 100
  const rt = ROUNDTRIP_BY_CHEMISTRY[chem] ?? 0.9

  // ---- Derate (energy): use the year-round average daytime high; the hot-day peak is reserved for the Vmp string check
  const tCell = cellTemp(s.ambientAvgC ?? s.ambientHighC - 8, panel.noct)
  const tempFactor = 1 + (panel.tempCoeffPmaxPctPerC / 100) * (tCell - 25)
  const invEff = 0.96
  // Factors are stored unrounded so that `derate` is exactly the product of the displayed breakdown (UI/PDF/Excel round to 2 dp)
  const breakdown = [
    { name: 'Temperature', factor: Math.min(1, tempFactor) },
    { name: 'Soiling', factor: 1 - s.soilingLossPct / 100 },
    { name: 'Shading', factor: 1 - s.shadingLossPct / 100 },
    { name: 'Wiring (DC+AC)', factor: 0.97 },
    { name: 'Mismatch & nameplate', factor: 0.97 },
    { name: 'Inverter efficiency', factor: invEff },
    { name: 'Availability / dust storms', factor: 0.98 },
  ]
  let derate = breakdown.reduce((a, b) => a * b.factor, 1)
  if (d.systemType !== 'gridtie') {
    // Energy that passes through the battery loses round-trip efficiency
    const nightShare = L.dailyWh > 0 ? L.nightWh / L.dailyWh : 0.5
    const battFactor = 1 - nightShare * (1 - rt)
    breakdown.push({ name: `Battery round-trip (${Math.round(nightShare * 100)}% via battery)`, factor: battFactor })
    derate *= battFactor
  }

  // ---- PV
  const tiltedPsh = s.psh * s.tiltGainFactor
  const requiredPvKwp = tiltedPsh > 0 ? (L.dailyWh / 1000) / (tiltedPsh * derate) * d.pvOversize : 0
  let panelQty = d.panelOverrideQty ?? Math.max(1, Math.ceil((requiredPvKwp * 1000) / panel.watts))

  // ---- Battery
  let batteryRequiredKwh = 0
  if (d.systemType === 'offgrid') batteryRequiredKwh = (L.dailyWh * d.autonomyDays) / 1000 / (dod * INV_EFF_BATT)
  else if (d.systemType === 'hybrid') {
    const base = L.criticalNightWh > 0 ? L.criticalNightWh : L.nightWh
    batteryRequiredKwh = (base * d.autonomyDays) / 1000 / (dod * INV_EFF_BATT)
  }
  const batteryResolved = battery ?? (d.batteryId === 'auto' && batteryRequiredKwh > 0 ? recommendBattery(d.systemVoltage, batteryRequiredKwh) ?? undefined : undefined)
  // Final DoD: user override > selected unit's usable DoD > chemistry default. For an auto-selected unit the requirement is
  // re-based on that unit's DoD *before* counting modules, so the bank is never smaller than the reported requirement.
  const dodFinal = d.dodOverridePct != null ? d.dodOverridePct / 100 : batteryResolved ? batteryResolved.usableDodPct / 100 : dod
  if (batteryResolved && d.dodOverridePct == null && !battery) batteryRequiredKwh = (batteryRequiredKwh * dod) / dodFinal
  let batteryQty = 0, series = 1, parallel = 0
  if (batteryResolved && batteryRequiredKwh > 0) {
    const battery = batteryResolved
    series = d.systemVoltage === 'hv' ? 1 : Math.max(1, Math.round((d.systemVoltage as number) / battery.nominalVoltage))
    const needed = d.batteryOverrideQty ?? Math.ceil(batteryRequiredKwh / battery.energyKwh)
    parallel = Math.max(1, Math.ceil(needed / series))
    batteryQty = series * parallel
    if (parallel > battery.parallelMax) checks.push({ id: 'batt-parallel', level: 'warn', message: `${parallel} batteries in parallel exceeds manufacturer limit of ${battery.parallelMax}; split across inverters or use larger units.` })
  }
  const batteryKwh = batteryResolved ? batteryQty * batteryResolved.energyKwh : 0
  const batteryUsableKwh = batteryKwh * dodFinal
  const batteryAh = batteryResolved ? parallel * batteryResolved.capacityAh : 0
  const nightLoadW = L.nightWh > 0 ? L.nightWh / 12 : L.peakW * 0.3
  const batteryHoursBackup = nightLoadW > 0 ? (batteryUsableKwh * 1000 * INV_EFF_BATT) / nightLoadW : 0

  // ---- Inverter
  const basePeak = d.systemType === 'hybrid' && L.criticalConnectedW > 0 ? L.criticalConnectedW * d.coincidenceFactor : L.peakW
  const requiredInverterKw = (basePeak * d.inverterSafety) / 1000
  // Grid-tied auto-selection must also carry the array (DC/AC ≤ 1.3), not just the peak load, otherwise large arrays clip
  const selectionKw = Math.max(requiredInverterKw, d.systemType === 'gridtie' ? requiredPvKwp / 1.3 : 0)
  const surgeKw = L.surgeW / 1000
  let inverter = getInverter(d.inverterId) ?? null
  let inverterQty = d.inverterQty || 1
  if (!inverter) {
    const rec = recommendInverter(d.systemType, d.phase, selectionKw, surgeKw, d.systemVoltage)
    inverter = rec?.inverter ?? null
    inverterQty = rec?.qty ?? 1
  }
  const inverterTotalKw = inverter ? inverter.ratedAcKw * inverterQty : 0
  const inverterOk = !!inverter && inverterTotalKw >= requiredInverterKw * 0.999
  if (!inverter) checks.push({ id: 'no-inverter', level: 'error', message: `No ${d.systemType} inverter in the catalogue matches ${d.phase}-phase at ${d.systemVoltage === 'hv' ? 'HV' : d.systemVoltage + ' V'} battery voltage; pick one manually or change the bus voltage.` })
  if (inverter && !inverterOk) checks.push({ id: 'inv-small', level: 'error', message: `Inverter capacity ${inverterTotalKw} kW is below required ${r1(requiredInverterKw)} kW.` })
  const inverterSurgeKw = inverter ? (inverter.surgeKw || inverter.ratedAcKw * 2) * inverterQty : 0
  if (inverter && inverterSurgeKw < surgeKw) checks.push({ id: 'inv-surge', level: 'warn', message: `Motor starting surge ${r1(surgeKw)} kW exceeds inverter peak ${r1(inverterSurgeKw)} kW.` })
  if (inverter && d.systemType !== 'gridtie' && d.systemVoltage !== 'hv' && inverterTotalKw > 15) checks.push({ id: 'lv-bus', level: 'warn', message: `${inverterTotalKw} kW on a ${d.systemVoltage} V bus means ~${r0((inverterTotalKw * 1000) / ((d.systemVoltage as number) * 0.95))} A of battery current; consider a high-voltage battery system above 15 kW.` })
  if (inverter && inverter.phase !== d.phase) checks.push({ id: 'inv-phase', level: 'error', message: `Selected inverter is ${inverter.phase}-phase but the project is ${d.phase}-phase.` })
  if (p.loads.some((l) => l.phase === 3) && d.phase === 1) checks.push({ id: 'load-phase', level: 'error', message: 'Three-phase loads present but system is single-phase.' })

  // ---- Strings
  let strings: StringDesign | null = null
  let arrayKwp = (panelQty * panel.watts) / 1000
  if (inverter && inverter.mpptCount === 0) {
    // Inverter/charger (no PV input): strings are designed against the MPPT charge controller instead
    const sysV0 = d.systemVoltage === 'hv' ? 400 : (d.systemVoltage as number)
    const reqA = (arrayKwp * 1000 * 1.25) / sysV0
    const cc = getController(d.chargeControllerId) ?? catalog.chargeControllers.filter((c) => c.batteryVoltages.includes(sysV0) && c.type !== 'PWM').sort((a, b) => a.maxChargeA - b.maxChargeA).find((c) => c.maxChargeA >= reqA) ?? catalog.chargeControllers[catalog.chargeControllers.length - 1]
    const ccQty = Math.max(1, Math.ceil(reqA / cc.maxChargeA))
    const virtual: Inverter = { ...inverter, maxPvVoltage: cc.maxPvVoltage, mpptMinV: sysV0 * 1.2 + 5, mpptMaxV: cc.maxPvVoltage * 0.95, mpptCount: ccQty, maxInputCurrentPerMppt: Math.max(panel.isc, (cc.maxChargeA * sysV0) / Math.max(1, panel.vmp * 2)) }
    strings = designStrings(panel, virtual, 1, panelQty, s.recordLowC, s.ambientHighC)
    if (d.panelOverrideQty == null) panelQty = strings.totalPanels
    arrayKwp = (panelQty * panel.watts) / 1000
    if (!strings.ok) checks.push({ id: 'strings', level: 'warn', message: strings.notes.join(' ') })
    checks.push({ id: 'inv-charger', level: 'ok', message: `${inverter.brand} ${inverter.model} has no PV input; ${ccQty} × ${cc.brand} ${cc.model} MPPT controller(s) added.` })
  } else if (inverter) {
    strings = designStrings(panel, inverter, inverterQty, panelQty, s.recordLowC, s.ambientHighC)
    if (d.panelOverrideQty == null) panelQty = strings.totalPanels
    arrayKwp = (panelQty * panel.watts) / 1000
    if (!strings.ok) checks.push({ id: 'strings', level: 'warn', message: strings.notes.join(' ') })
    // Datasheets quote an operating current (stored) and a higher Isc limit (typically 1.3–1.5× it). Isc above ~1.25× the operating
    // limit is a hard stop (210 mm modules on 13 A inputs); Imp above the operating limit only clips a little at peak irradiance.
    if (panel.isc > inverter.maxInputCurrentPerMppt * 1.25) checks.push({ id: 'isc-mppt', level: 'error', message: `Module Isc ${panel.isc} A exceeds the inverter MPPT input limit of ${inverter.maxInputCurrentPerMppt} A per string (common with 700 W+ 210 mm modules). Choose a smaller module or a different inverter.` })
    else if (panel.imp > inverter.maxInputCurrentPerMppt) checks.push({ id: 'imp-mppt', level: 'warn', message: `Module Imp ${panel.imp} A is above the MPPT operating limit of ${inverter.maxInputCurrentPerMppt} A; expect slight clipping at peak irradiance (confirm Isc ${panel.isc} A ≤ the inverter's Isc limit).` })
    if (inverter.maxPvInputKw * inverterQty < arrayKwp) checks.push({ id: 'pv-input', level: 'warn', message: `PV array ${r2(arrayKwp)} kWp exceeds inverter max PV input ${r1(inverter.maxPvInputKw * inverterQty)} kW; clipping or over-current risk.` })
    const ratio = inverterTotalKw > 0 ? arrayKwp / inverterTotalKw : 0
    if (ratio > 1.5) checks.push({ id: 'dcac-high', level: 'warn', message: `DC/AC ratio ${r2(ratio)} is high (>1.5). Consider a larger inverter.` })
    if (ratio > 0 && ratio < 0.7) checks.push({ id: 'dcac-low', level: 'warn', message: `DC/AC ratio ${r2(ratio)} is low (<0.7); inverter is oversized for the array.` })
  }
  const arrayAreaM2 = (panelQty * panel.lengthMm * panel.widthMm) / 1e6
  const arrayWeightKg = panelQty * panel.weightKg
  if (s.availableAreaM2 != null && s.availableAreaM2 > 0 && arrayAreaM2 * 1.15 > s.availableAreaM2)
    checks.push({ id: 'area', level: 'warn', message: `Array needs ~${r0(arrayAreaM2 * 1.15)} m² (incl. spacing) but only ${s.availableAreaM2} m² is available.` })

  const monthlyPsh = s.monthlyPsh?.length === 12 ? s.monthlyPsh : Array<number>(12).fill(s.psh)
  const monthlyProductionKwh = monthlyPsh.map((psh, m) => arrayKwp * psh * s.tiltGainFactor * derate * DAYS_IN_MONTH[m])
  const annualProductionKwh = sum(monthlyProductionKwh)
  const specificYield = arrayKwp > 0 ? annualProductionKwh / arrayKwp : 0
  const dailyNeedKwh = L.dailyWh / 1000
  const deficitMonths = monthlyPsh.map((psh, m) => (arrayKwp * psh * s.tiltGainFactor * derate < dailyNeedKwh ? m : -1)).filter((m) => m >= 0)
  if (d.systemType === 'offgrid' && deficitMonths.length) checks.push({ id: 'deficit', level: 'warn', message: `Daily production falls short of demand in ${deficitMonths.length} month(s); consider sizing for the worst month or adding a generator.` })

  // ---- Charge controller
  let controller: ChargeController | null = null
  let controllerQty = 0
  const sysV = d.systemVoltage === 'hv' ? 400 : (d.systemVoltage as number)
  const needsController = d.systemType !== 'gridtie' && (d.useSeparateController || (inverter?.mpptCount ?? 1) === 0)
  const requiredControllerA = needsController ? (arrayKwp * 1000 * 1.25) / sysV : 0
  if (requiredControllerA > 0) {
    controller = getController(d.chargeControllerId) ?? catalog.chargeControllers.filter((c) => c.batteryVoltages.includes(sysV) && c.type !== 'PWM').sort((a, b) => a.maxChargeA - b.maxChargeA).find((c) => c.maxChargeA >= requiredControllerA) ?? catalog.chargeControllers.filter((c) => c.batteryVoltages.includes(sysV)).sort((a, b) => b.maxChargeA - a.maxChargeA)[0] ?? null
    controllerQty = controller ? Math.ceil(requiredControllerA / controller.maxChargeA) : 0
  }

  // ---- Battery current checks
  if (batteryResolved && batteryQty > 0 && inverter) {
    const dischargeA = (inverterTotalKw * 1000) / (sysV * 0.95)
    if (dischargeA > batteryResolved.maxDischargeA * parallel) checks.push({ id: 'batt-discharge', level: 'warn', message: `Inverter can draw ${r0(dischargeA)} A but battery bank allows ${batteryResolved.maxDischargeA * parallel} A continuous. Add batteries in parallel or reduce inverter size.` })
    const chargeA = (arrayKwp * 1000 * 0.9) / sysV
    if (chargeA > batteryResolved.maxChargeA * parallel) checks.push({ id: 'batt-charge', level: 'warn', message: `PV charge current ~${r0(chargeA)} A exceeds bank limit ${batteryResolved.maxChargeA * parallel} A; the inverter will throttle charging.` })
    if (inverter.type !== 'gridtie' && inverter.maxChargeA * inverterQty * sysV < (L.nightWh / 1000) * 1000 / 5) checks.push({ id: 'charge-time', level: 'warn', message: `Inverter charger (${inverter.maxChargeA * inverterQty} A) may be too small to refill the bank in ~5 sun hours.` })
  }
  if (d.systemType !== 'gridtie' && !batteryResolved) checks.push({ id: 'no-batt', level: d.systemType === 'offgrid' ? 'error' : 'warn', message: 'No battery selected.' })

  // ---- Cables & protection
  const cables: CableResult[] = []
  if (strings) {
    cables.push(sizeCable('dc', panel.isc, d.dcCableRunM, strings.vmpHot > 0 ? panel.vmp * strings.panelsPerString : panel.vmp, d.maxVoltageDropPct))
  }
  if (batteryResolved && batteryQty > 0 && inverter) {
    const battI = (inverterTotalKw * 1000) / (sysV * 0.95)
    cables.push(sizeCable('battery', battI / Math.max(1, inverterQty), d.batteryCableRunM, sysV, Math.min(1.5, d.maxVoltageDropPct)))
  }
  if (inverter) {
    const acI = d.phase === 3 ? (inverterTotalKw * 1000) / (Math.sqrt(3) * 400) : (inverterTotalKw * 1000) / 230
    cables.push(sizeCable('ac', acI, d.acCableRunM, d.phase === 3 ? 400 : 230, d.maxVoltageDropPct, d.phase === 3))
  }
  for (const c of cables) {
    const limit = c.use === 'battery' ? Math.min(1.5, d.maxVoltageDropPct) : d.maxVoltageDropPct
    if (c.dropPct > limit + 0.005) checks.push({ id: `vdrop-${c.use}`, level: 'warn', message: `${c.use.toUpperCase()} cable voltage drop ${c.dropPct}% exceeds the ${limit}% target even at ${c.sizeMm2} mm²; shorten the run or parallel conductors.` })
  }

  // ---- Generator (§11): peak load + battery recharge at a gentle C-rate (0.2 C LiFePO4/NMC, 0.1 C lead-acid, capped by the
  // inverter charger), charger efficiency 0.95, 10 % margin, PF 0.8, and never below 1.5 × inverter kVA (Victron FAQ)
  let generatorKva: number | null = null
  if (d.generatorBackup) {
    const cRate = batteryResolved && (batteryResolved.chemistry === 'LiFePO4' || batteryResolved.chemistry === 'NMC') ? 0.2 : 0.1
    const chargerKw = inverter ? (inverter.maxChargeA * inverterQty * sysV) / 1000 : Infinity
    const chargeKw = batteryResolved ? Math.min(batteryKwh * cRate, chargerKw) : 0
    const genKw = (L.peakW / 1000 + chargeKw / 0.95) * 1.1
    const kva = Math.max(genKw / 0.8, 1.5 * inverterTotalKw)
    generatorKva = d.generatorKva ?? roundUpStd(kva, STD_GENERATOR_KVA)
  }

  // ---- BOM
  const bom = buildBom(p, { panel, panelQty, battery: batteryResolved, batteryQty, inverter, inverterQty, controller, controllerQty, strings, cables, arrayKwp, generatorKva })

  // ---- Costs
  const equipment = sum(bom.filter((b) => b.category !== 'Services').map((b) => b.totalUsd))
  const labourUsd = sum(bom.filter((b) => b.category === 'Services').map((b) => b.totalUsd))
  const subtotalUsd = equipment + labourUsd
  const marginUsd = subtotalUsd * (pr.marginPct / 100)
  const discountUsd = (subtotalUsd + marginUsd) * (pr.discountPct / 100)
  const vatUsd = (subtotalUsd + marginUsd - discountUsd) * (pr.vatPct / 100)
  const totalUsd = subtotalUsd + marginUsd - discountUsd + vatUsd
  const costPerWp = arrayKwp > 0 ? totalUsd / (arrayKwp * 1000) : 0

  // ---- Economics
  const offsetKwh = Math.min(annualProductionKwh, annualKwh)
  const annualSavingsUsd = offsetKwh * s.gridTariff
  const paybackYears = annualSavingsUsd > 0 ? totalUsd / annualSavingsUsd : null
  const years = d.analysisYears || 25
  let lifetime = 0
  const cumulativeCashflow: number[] = [-totalUsd]
  for (let y = 1; y <= years; y++) {
    const prod = annualProductionKwh * Math.pow(1 - d.degradationPctPerYear / 100, y - 1)
    lifetime += prod
    const saving = Math.min(prod, annualKwh) * s.gridTariff * Math.pow(1.03, y - 1) // 3% tariff escalation
    cumulativeCashflow.push(cumulativeCashflow[y - 1] + saving)
  }
  const lcoeUsdPerKwh = lifetime > 0 ? totalUsd / lifetime : 0
  const co2TonsPerYear = (offsetKwh * s.gridEmission) / 1000
  const roi25Pct = totalUsd > 0 ? ((cumulativeCashflow[years] + totalUsd) / totalUsd - 1) * 100 : null

  if (L.dailyWh === 0) checks.push({ id: 'no-loads', level: 'error', message: 'No loads entered yet.' })
  if (!checks.some((c) => c.level !== 'ok')) checks.unshift({ id: 'all-ok', level: 'ok', message: 'All design checks passed.' })

  return {
    panel,
    dailyWh: L.dailyWh, dayWh: L.dayWh, nightWh: L.nightWh, criticalWh: L.criticalWh, peakW: L.peakW, surgeW: L.surgeW, connectedW: L.connectedW,
    monthlyKwh, annualKwh,
    derate, derateBreakdown: breakdown, requiredPvKwp, panelQty, arrayKwp, arrayAreaM2, arrayWeightKg, tiltedPsh,
    monthlyProductionKwh, annualProductionKwh, specificYield,
    batteryRequiredKwh, batteryQty, batteryKwh, batteryUsableKwh, batteryAh, batteryConfig: { series, parallel }, batteryHoursBackup, dod: dodFinal,
    requiredInverterKw, inverter, inverterQty, inverterTotalKw, inverterOk, controller, controllerQty, requiredControllerA, strings, cables,
    generatorKva, bom, equipmentCostUsd: equipment, labourUsd, subtotalUsd, marginUsd, discountUsd, vatUsd, totalUsd, costPerWp,
    annualSavingsUsd, paybackYears, lcoeUsdPerKwh, co2TonsPerYear, lifetimeProductionKwh: lifetime, roi25Pct, cumulativeCashflow, checks,
  }
}

// ---------------- BOM ----------------
interface BomCtx {
  panel: Panel; panelQty: number; battery?: Battery; batteryQty: number; inverter: Inverter | null; inverterQty: number;
  controller: ChargeController | null; controllerQty: number; strings: StringDesign | null; cables: CableResult[]; arrayKwp: number; generatorKva: number | null
}
function buildBom(p: Project, c: BomCtx): BomLine[] {
  const { pricing: pr, design: d, site: s } = p
  const lines: BomLine[] = []
  const add = (id: string, category: string, name: string, spec: string, unit: string, qty: number, unitPriceUsd: number) => {
    if (pr.excludedIds.includes(id) || qty <= 0) return
    const q = pr.qtyOverrides[id] ?? Math.ceil(qty * 100) / 100
    const price = pr.priceOverrides[id] ?? unitPriceUsd
    lines.push({ id, category, name, spec, unit, qty: q, unitPriceUsd: price, totalUsd: r2(q * price), source: 'auto' })
  }
  const it = (id: string) => item(id) ?? { id, name: id, category: 'Accessories', unit: 'pcs', approxPriceUsd: 0, spec: '' }
  const addItem = (id: string, qty: number, category?: string) => { const x = it(id); add(x.id, category ?? x.category, x.name, x.spec ?? '', x.unit, qty, x.approxPriceUsd) }

  // Generation
  add(c.panel.id, 'PV Modules', `${c.panel.brand} ${c.panel.model}`, `${c.panel.watts} W · ${c.panel.technology} · Voc ${c.panel.voc} V`, 'pcs', c.panelQty, c.panel.approxPriceUsd)
  if (c.inverter) add(c.inverter.id, 'Inverter', `${c.inverter.brand} ${c.inverter.model}`, `${c.inverter.ratedAcKw} kW ${c.inverter.type} · ${c.inverter.phase}-ph · ${c.inverter.mpptCount} MPPT`, 'pcs', c.inverterQty, c.inverter.approxPriceUsd)
  if (c.battery && c.batteryQty) add(c.battery.id, 'Battery', `${c.battery.brand} ${c.battery.model}`, `${c.battery.nominalVoltage} V ${c.battery.capacityAh} Ah · ${c.battery.energyKwh} kWh ${c.battery.chemistry}`, 'pcs', c.batteryQty, c.battery.approxPriceUsd)
  if (c.controller && c.controllerQty) add(c.controller.id, 'Inverter', `${c.controller.brand} ${c.controller.model}`, `${c.controller.maxChargeA} A MPPT`, 'pcs', c.controllerQty, c.controller.approxPriceUsd)
  if (c.battery && c.batteryQty) {
    if (c.battery.formFactor === 'rack') addItem('battery-rack', Math.ceil(c.batteryQty / 4))
    else if (c.battery.formFactor === 'floor' && c.battery.chemistry !== 'LiFePO4') addItem('battery-stand', Math.ceil(c.batteryQty / 4))
  }
  // Mounting (per panel approximations: 2 rails × panel width, 2 mid clamps, end clamps 4 per row of ~10, 4 fixings)
  const panelWm = c.panel.widthMm / 1000
  const railM = c.panelQty * panelWm * 2 * 1.05
  if (s.roofType === 'ground') addItem('ground-structure', c.arrayKwp)
  else {
    addItem('rail', railM)
    addItem('mid-clamp', Math.max(0, c.panelQty * 2 - Math.ceil(c.panelQty / 10) * 2))
    addItem('end-clamp', Math.ceil(c.panelQty / 10) * 4)
    addItem('rail-splice', Math.max(0, Math.ceil(railM / 4.2) - Math.ceil(c.panelQty / 10) * 2))
    if (s.roofType === 'pitched-tile') addItem('tile-hook', c.panelQty * 2.5)
    else if (s.roofType === 'metal-sheet') addItem('l-foot', c.panelQty * 2.5)
    else { addItem('triangle-frame', c.panelQty); addItem('ballast-block', c.panelQty * 2) }
  }
  // DC side
  const strings = c.strings?.strings ?? 1
  const dcCable = c.cables.find((x) => x.use === 'dc')
  if (dcCable) {
    const dcId = dcCable.sizeMm2 <= 4 ? 'dc-cable-4' : dcCable.sizeMm2 <= 6 ? 'dc-cable-6' : 'dc-cable-10'
    addItem(dcId, strings * d.dcCableRunM * 2)
    addItem('mc4-pair', strings * 2 + 2)
    // String fuses + combiner only when ≥ 3 strings share one MPPT input (§7/§12: reverse current from 2 strings stays below the module fuse rating)
    const mppts = c.inverter && c.inverter.mpptCount > 0 ? c.inverter.mpptCount * c.inverterQty : Math.max(1, c.controllerQty)
    if (Math.ceil(strings / mppts) > 2) {
      addItem('combiner-box', Math.ceil(strings / 6))
      addItem(dcCable.breakerA <= 15 ? 'pv-fuse-15' : dcCable.breakerA <= 20 ? 'pv-fuse-20' : 'pv-fuse-30', strings * 2)
    }
    addItem('dc-isolator', c.inverterQty || 1)
    addItem('spd-dc', c.inverterQty || 1)
  }
  // Battery side
  const battCable = c.cables.find((x) => x.use === 'battery')
  if (battCable && c.battery) {
    const sz = battCable.sizeMm2
    const id = sz <= 16 ? 'batt-cable-16' : sz <= 25 ? 'batt-cable-25' : sz <= 35 ? 'batt-cable-35' : sz <= 50 ? 'batt-cable-50' : sz <= 70 ? 'batt-cable-70' : 'batt-cable-95'
    addItem(id, (d.batteryCableRunM * 2 + c.batteryQty * 0.6) * (c.inverterQty || 1))
    addItem('cable-lug', c.batteryQty * 4 + 4)
    addItem(battCable.breakerA <= 125 ? 'batt-fuse-125' : battCable.breakerA <= 200 ? 'batt-fuse-200' : battCable.breakerA <= 250 ? 'batt-fuse-250' : 'batt-fuse-400', c.inverterQty || 1)
  }
  // AC side
  const ac = c.cables.find((x) => x.use === 'ac')
  if (ac && c.inverter) {
    const sz = ac.sizeMm2
    const acId = sz <= 2.5 ? 'ac-cable-2.5' : sz <= 4 ? 'ac-cable-4' : sz <= 6 ? 'ac-cable-6' : sz <= 10 ? 'ac-cable-10' : sz <= 16 ? 'ac-cable-16' : sz <= 25 ? 'ac-cable-25' : 'ac-cable-35'
    addItem(acId, d.acCableRunM * (d.phase === 3 ? 5 : 3)) // priced per core: L+N+PE (1-ph) or 3L+N+PE (3-ph)
    const mcb = ac.breakerA <= 32 ? 'ac-mcb-32' : ac.breakerA <= 63 ? 'ac-mcb-63' : ac.breakerA <= 100 ? 'ac-mcb-100' : 'ac-mccb-160'
    addItem(mcb, c.inverterQty + 1)
    addItem('spd-ac', 1)
    addItem('db-board', 1)
    if (d.systemType !== 'gridtie') addItem(ac.breakerA <= 63 ? 'changeover-63' : 'changeover-125', 1)
    if (d.systemType !== 'offgrid') addItem('ct-meter', c.inverterQty)
    addItem('wifi-dongle', c.inverterQty)
  }
  // Earthing & misc
  addItem('earth-rod', c.arrayKwp > 10 ? 2 : 1)
  addItem('earth-cable', 20 + c.panelQty * 1.2)
  addItem('lightning-arrestor', c.arrayKwp > 20 ? 1 : 0)
  addItem('conduit', d.dcCableRunM + d.acCableRunM + d.batteryCableRunM)
  addItem('cable-ties-labels', Math.ceil(c.panelQty / 20) || 1)
  if (c.generatorKva) addItem('generator', 1); // priced per kVA below via override; placeholder name
  // Services
  add('labour', 'Services', 'Installation labour', `${r2(c.arrayKwp)} kWp`, 'kWp', c.arrayKwp, pr.labourPerKwUsd)
  add('transport', 'Services', 'Transport & logistics', '', 'lot', 1, pr.transportUsd)
  add('commissioning', 'Services', 'Commissioning, testing & handover', '', 'lot', 1, pr.commissioningUsd)
  for (const ci of pr.customItems) lines.push({ ...ci, totalUsd: r2(ci.qty * ci.unitPriceUsd), source: 'custom' })
  return lines
}
