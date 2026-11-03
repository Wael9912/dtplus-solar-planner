// Sizing sources (methodology §16): where the demand comes from (appliance list or electricity bill), sizes the user fixes,
// and equipment already on site. Projects saved before v0.2 have no `sizing` → appliance list, nothing fixed, nothing existing.
import type { BillInput, BillProfile, Project, ProjectMode, SizingInput } from './types'

export const defaultBill = (): BillInput => ({ monthlyKwh: 0, profile: 'residential', peakKw: null, largestMotorKw: null })
export const defaultSizing = (): SizingInput => ({
  demand: 'loads', bill: defaultBill(),
  targets: { pvKwp: null, batteryKwh: null, inverterKw: null },
  existing: { panels: 0, batteries: 0, inverters: 0 },
})

/**
 * Bill profiles (§16.1): share of the daily energy used after sunset, and peak ÷ 24-hour average load.
 * Residential: evening-heavy, peak ≈ 3.5 × average; commercial (shops, offices ~12 h): 25 % at night, ≈ 2.8 ×;
 * daytime-only (workshops, schools, farms): 5 % at night, ≈ 3.2 × (the same energy in ~8–10 working hours).
 */
export const BILL_PROFILES: Record<BillProfile, { nightPct: number; peakFactor: number }> = {
  residential: { nightPct: 45, peakFactor: 3.5 },
  commercial: { nightPct: 25, peakFactor: 2.8 },
  daytime: { nightPct: 5, peakFactor: 3.2 },
}
/** Direct-on-line motor start ≈ 3 × running power (the running 1 × is already in the peak). */
export const BILL_MOTOR_START_FACTOR = 3

const num = (x: unknown, fallback: number | null): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : fallback)
const pos = (x: unknown, max = 1e6): number | null => { const v = num(x, null); return v != null && v >= 0 ? Math.min(v, max) : null }

/** Sizing input with defaults filled and impossible values dropped (negative → unset). */
export function resolveSizing(p: Pick<Project, 'sizing'>): SizingInput {
  const d = defaultSizing()
  const s = p.sizing
  if (!s || typeof s !== 'object') return d
  const b = (s.bill ?? {}) as Partial<BillInput>
  const t = (s.targets ?? {}) as Partial<SizingInput['targets']>
  const e = (s.existing ?? {}) as Partial<SizingInput['existing']>
  const cnt = (x: unknown) => Math.min(1e5, Math.max(0, Math.round(num(x, 0) ?? 0)))
  return {
    demand: s.demand === 'bill' ? 'bill' : 'loads',
    bill: {
      monthlyKwh: pos(b.monthlyKwh, 1e8) ?? 0,
      profile: typeof b.profile === 'string' && Object.hasOwn(BILL_PROFILES, b.profile) ? b.profile : 'residential',
      peakKw: pos(b.peakKw) || null, largestMotorKw: pos(b.largestMotorKw) || null,
    },
    // Ceilings far above any real job (100 MWp / 1 GWh / 100 MW) keep hostile inputs finite
    targets: { pvKwp: pos(t.pvKwp, 1e5), batteryKwh: pos(t.batteryKwh), inverterKw: pos(t.inverterKw, 1e5) || null },
    existing: { panels: cnt(e.panels), batteries: cnt(e.batteries), inverters: cnt(e.inverters) },
  }
}

export const projectMode = (p: Pick<Project, 'mode'>): ProjectMode => (p.mode === 'size' || p.mode === 'items' ? p.mode : 'design')

/** Demand summary from a monthly bill — same shape as computeLoads() (§16.1). */
export function demandFromBill(b: BillInput) {
  const prof = BILL_PROFILES[b.profile] ?? BILL_PROFILES.residential
  const dailyWh = (Math.max(0, b.monthlyKwh) * 1000) / 30.4
  const nightWh = (dailyWh * prof.nightPct) / 100
  const peakW = b.peakKw && b.peakKw > 0 ? b.peakKw * 1000 : (dailyWh / 24) * prof.peakFactor
  const motorW = b.largestMotorKw && b.largestMotorKw > 0 ? b.largestMotorKw * 1000 : 0
  const surgeW = peakW + motorW * (BILL_MOTOR_START_FACTOR - 1)
  return {
    dailyWh, dayWh: dailyWh - nightWh, nightWh, criticalWh: dailyWh, criticalNightWh: nightWh, connectedW: peakW, criticalConnectedW: peakW,
    peakW: Math.max(peakW, motorW), surgeW, maxUnitW: motorW, criticalMaxUnitW: motorW, criticalPeakW: Math.max(peakW, motorW), criticalSurgeW: surgeW,
    lineCount: 0, criticalLineCount: 0,
  }
}
