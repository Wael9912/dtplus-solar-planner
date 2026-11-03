import type { Project, CompanySettings, LoadItem, SiteInput, DesignInput, PricingInput, Appliance, SystemType, ProjectMode } from './types'
import { getLocation, tiltGainFor } from '../data/locations'
import { nightShareByCategory } from '../data/appliances'
import { cat } from './catalogContext'
import { defaultSizing } from './sizing'

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

/** Default cost of a diesel-generated kWh displaced by an off-grid system (USD/kWh): ~0.32 L/kWh × ~1.1 USD/L + ~0.05 O&M (§10). */
export const DEFAULT_DIESEL_USD_PER_KWH = 0.4

export function siteFromLocation(id: string): SiteInput {
  const loc = getLocation(id) ?? getLocation('khartoum')!
  const highs = Array.isArray(loc.avgHighTempC) ? loc.avgHighTempC : [loc.avgHighTempC]
  return {
    locationId: loc.id, customName: '', psh: loc.annualPsh, monthlyPsh: [...loc.monthlyPsh],
    tiltDeg: loc.optimalTiltDeg, azimuthDeg: 0, tiltGainFactor: Math.round(tiltGainFor(loc.lat) * 100) / 100,
    ambientHighC: Math.round(Math.max(...highs)), ambientAvgC: Math.round(highs.reduce((a, b) => a + b, 0) / highs.length), recordLowC: loc.recordLowTempC, shadingLossPct: 2, soilingLossPct: 3,
    roofType: 'flat-concrete', availableAreaM2: null, gridTariff: loc.typicalTariffUsdPerKwh, gridEmission: loc.gridEmissionKgPerKwh,
    currency: 'USD', fxRateToUsd: 1, dieselCostUsdPerKwh: DEFAULT_DIESEL_USD_PER_KWH, lat: loc.lat,
  }
}

export const defaultDesign = (systemType: DesignInput['systemType'] = 'hybrid'): DesignInput => ({
  systemType, phase: 1, autonomyDays: systemType === 'gridtie' ? 0 : 1, dodOverridePct: null, systemVoltage: 48, coincidenceFactor: 0.8, coincidenceAuto: true,
  dcAcRatio: 1.2, inverterSafety: 1.25, pvOversize: systemType === 'offgrid' ? 1.2 : 1.0, // §3.1 offGridMargin when sizing on annual PSH
  panelId: 'auto', batteryId: systemType === 'gridtie' ? null : 'auto', inverterId: null, inverterQty: 1, chargeControllerId: null, useSeparateController: false,
  dcCableRunM: 20, batteryCableRunM: 2, acCableRunM: 15, maxVoltageDropPct: 2, generatorBackup: false, generatorKva: null,
  degradationPctPerYear: 0.5, analysisYears: 25, panelOverrideQty: null, batteryOverrideQty: null,
  discountRatePct: 6, omPctPerYear: 1, tariffEscalationPct: 3, inverterLifeYears: 15,
})

/**
 * Switch a design to another system type and keep it consistent (call this from the system-type selector):
 * - pvOversize follows the type default (off-grid 1.2 margin, hybrid / grid-tied 1.0) unless the user changed it from the old type's default;
 * - grid-tied drops the battery and autonomy; hybrid / off-grid get an auto battery and ≥ 1 day (off-grid) of autonomy;
 * - a manually chosen inverter that cannot serve the new type is reset to auto; a separate controller is only kept off-grid / hybrid.
 */
export function applySystemType(design: DesignInput, systemType: SystemType): DesignInput {
  if (design.systemType === systemType) return design
  const oldDefault = defaultDesign(design.systemType), newDefault = defaultDesign(systemType)
  const d: DesignInput = { ...design, systemType }
  if (Math.abs(design.pvOversize - oldDefault.pvOversize) < 1e-9) d.pvOversize = newDefault.pvOversize
  if (systemType === 'gridtie') {
    d.batteryId = null; d.batteryOverrideQty = null; d.autonomyDays = 0; d.useSeparateController = false; d.chargeControllerId = null; d.generatorBackup = false
  } else {
    if (!d.batteryId) d.batteryId = 'auto'
    if (!(d.autonomyDays > 0)) d.autonomyDays = newDefault.autonomyDays
    if (systemType === 'offgrid' && d.autonomyDays < 1) d.autonomyDays = 1
  }
  const inv = d.inverterId ? cat().inverters.find((i) => i.id === d.inverterId) : undefined
  if (inv) {
    const ok = systemType === 'gridtie' ? inv.type !== 'offgrid' && inv.mpptCount > 0 : systemType === 'hybrid' ? inv.type === 'hybrid' : inv.type !== 'gridtie'
    if (!ok) { d.inverterId = null; d.inverterQty = 1 }
  }
  return d
}

export const defaultPricing = (marginPct = 20, vatPct = 0): PricingInput => ({
  marginPct, vatPct, labourPerKwUsd: 120, transportUsd: 100, commissioningUsd: 150, discountPct: 0, priceOverrides: {}, qtyOverrides: {}, excludedIds: [], customItems: [],
})

export function newProject(partial: Partial<Project> = {}, company?: CompanySettings): Project {
  const now = new Date().toISOString()
  return {
    id: uid(), name: 'New solar project', clientName: '', clientPhone: '', clientEmail: '', clientAddress: '', reference: `Q-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    notes: '', createdAt: now, updatedAt: now, status: 'draft', loads: [], site: siteFromLocation('khartoum'), design: defaultDesign('hybrid'), pricing: defaultPricing(20, company ? 0 : 0),
    mode: 'design', sizing: defaultSizing(), proposalNote: '',
    ...partial,
  }
}

/**
 * Starting point of each project mode: 'size' opens with a typical fixed system (5 kWp · 5 kW · 10 kWh hybrid; grid-tied 5 kWp, no battery)
 * so the first screen already shows a price; 'items' is an empty product list.
 */
export function modeDefaults(mode: ProjectMode, systemType: SystemType = 'hybrid'): Pick<Project, 'mode' | 'sizing'> {
  const sizing = defaultSizing()
  if (mode === 'size') sizing.targets = { pvKwp: 5, inverterKw: 5, batteryKwh: systemType === 'gridtie' ? null : 10 }
  return { mode, sizing }
}

/**
 * Night share of a load's daily energy: the category default, but never below the hours that cannot fit in a ~12 h day
 * (a 24 h server or incubator runs at least half of its energy after sunset) — methodology §1.4.
 */
export function nightShareFor(category: string, hoursPerDay: number): number {
  const base = nightShareByCategory[category] ?? 40
  const floor = hoursPerDay > 12 ? Math.round(((hoursPerDay - 12) / hoursPerDay) * 100) : 0
  return Math.max(base, floor)
}

export function loadFromAppliance(a: Appliance, qty = 1): LoadItem {
  return { id: uid(), name: a.name, category: a.category, watts: a.watts, qty, hoursPerDay: a.hoursPerDay, surgeFactor: a.surgeFactor, nightSharePct: nightShareFor(a.category, a.hoursPerDay), phase: a.phase, critical: true }
}

export const defaultCompany: CompanySettings = {
  name: 'Your Solar Company', tagline: 'Clean energy, engineered.', phone: '', email: '', website: '', address: '', logoDataUrl: null, primaryColor: '#0f766e',
  quoteValidityDays: 30, currency: 'USD', fxRateToUsd: 1, nameAr: '', taglineAr: '', termsAr: '',
  terms: 'Prices are valid for the stated period and subject to stock availability. 50% deposit on order, balance on commissioning. Equipment warranties as per manufacturer. Installation workmanship warranty: 2 years. Civil works, grid connection fees and permits are excluded unless stated.',
}
