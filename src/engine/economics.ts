// Energy economics (methodology §10, §4.4). Savings, CO₂ and LCOE are based on the solar energy actually *used*:
// - grid-tied (no battery, no feed-in tariff): daytime self-consumption only — surplus is exported unpaid or curtailed;
// - hybrid: daytime load + night load the battery can shift (usable kWh × η_inv per day);
// - off-grid: the load served, valued at the displaced diesel cost per kWh, diesel CO₂ factor.
import type { Replacement, SystemType } from './types'

export const EF_DIESEL_KG_PER_KWH = 0.85 // §10 tool default (0.32 L/kWh × 2.68 kg/L)
export const INV_EFF_SHIFT = 0.95 // battery → AC efficiency for energy shifted to the night

export interface EconomicsInput {
  systemType: SystemType
  annualProductionKwh: number; annualLoadKwh: number; dayLoadKwhYr: number; nightLoadKwhYr: number; batteryUsableKwh: number
  tariffUsdPerKwh: number; gridEmissionKgPerKwh: number
  capexUsd: number
  /** Client price of the battery / inverter (+ controller) lines, for replacements (0 when not quoted). */
  batteryReplacementUsd: number; batteryLifeYears: number | null
  inverterReplacementUsd: number; inverterLifeYears: number
  years: number; degradationPct: number; escalationPct: number; discountRatePct: number; omPctPerYear: number
}
export interface EconomicsResult {
  annualSavingsUsd: number; paybackYears: number | null; lcoeUsdPerKwh: number; co2TonsPerYear: number
  lifetimeProductionKwh: number; lifetimeUsefulKwh: number; usefulEnergyKwh: number
  roiPct: number | null; cumulativeCashflow: number[]; npvUsd: number; omUsdPerYear: number; replacements: Replacement[]
}

/** Replacement years strictly inside the analysis period: life, 2 × life, … < years. */
export function replacementYears(life: number | null, years: number): number[] {
  if (!(life != null && life >= 1)) return []
  const out: number[] = []
  for (let k = 1; Math.round(k * life) < years; k++) out.push(Math.round(k * life))
  return out
}

export function usefulEnergy(e: Pick<EconomicsInput, 'systemType' | 'annualLoadKwh' | 'dayLoadKwhYr' | 'nightLoadKwhYr' | 'batteryUsableKwh'>, productionKwh: number): number {
  const prod = Math.max(0, productionKwh)
  if (e.systemType === 'gridtie') return Math.min(prod, e.dayLoadKwhYr)
  if (e.systemType === 'hybrid') return Math.min(prod, e.dayLoadKwhYr + Math.min(e.nightLoadKwhYr, e.batteryUsableKwh * INV_EFF_SHIFT * 365))
  return Math.min(prod, e.annualLoadKwh)
}

export function computeEconomics(e: EconomicsInput): EconomicsResult {
  const years = Math.max(1, Math.round(e.years || 25))
  const r = Math.max(0, e.discountRatePct) / 100, g = e.escalationPct / 100, deg = Math.max(0, e.degradationPct) / 100
  const capex = Math.max(0, e.capexUsd)
  const om = capex * Math.max(0, e.omPctPerYear) / 100
  const ef = e.systemType === 'offgrid' ? EF_DIESEL_KG_PER_KWH : e.gridEmissionKgPerKwh
  const replacements: Replacement[] = [
    ...(e.batteryReplacementUsd > 0 ? replacementYears(e.batteryLifeYears, years).map((year) => ({ year, item: 'battery' as const, usd: e.batteryReplacementUsd })) : []),
    ...(e.inverterReplacementUsd > 0 ? replacementYears(e.inverterLifeYears, years).map((year) => ({ year, item: 'inverter' as const, usd: e.inverterReplacementUsd })) : []),
  ].sort((a, b) => a.year - b.year)

  let lifetime = 0, lifetimeUseful = 0, pvCost = capex, pvEnergy = 0, npv = -capex, savings1 = 0, useful1 = 0
  const cumulativeCashflow: number[] = [-capex]
  for (let t = 1; t <= years; t++) {
    const prod = e.annualProductionKwh * Math.pow(1 - deg, t - 1)
    const used = usefulEnergy(e, prod)
    const saving = used * e.tariffUsdPerKwh * Math.pow(1 + g, t - 1)
    const repl = replacements.filter((x) => x.year === t).reduce((a, x) => a + x.usd, 0)
    const disc = Math.pow(1 + r, t)
    lifetime += prod; lifetimeUseful += used
    pvCost += (om + repl) / disc; pvEnergy += used / disc
    npv += (saving - om - repl) / disc
    cumulativeCashflow.push(cumulativeCashflow[t - 1] + saving - om - repl)
    if (t === 1) { savings1 = saving; useful1 = used }
  }
  return {
    annualSavingsUsd: savings1,
    paybackYears: savings1 > 0 ? capex / savings1 : null,
    lcoeUsdPerKwh: pvEnergy > 0 ? pvCost / pvEnergy : 0,
    co2TonsPerYear: (useful1 * ef) / 1000,
    lifetimeProductionKwh: lifetime, lifetimeUsefulKwh: lifetimeUseful, usefulEnergyKwh: useful1,
    roiPct: capex > 0 ? ((cumulativeCashflow[years] + capex) / capex - 1) * 100 : null,
    cumulativeCashflow, npvUsd: npv, omUsdPerYear: om, replacements,
  }
}
