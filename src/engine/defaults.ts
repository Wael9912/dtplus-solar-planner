import type { Project, CompanySettings, LoadItem, SiteInput, DesignInput, PricingInput, Appliance } from './types'
import { getLocation, tiltGainFor } from '../data/locations'
import { nightShareByCategory } from '../data/appliances'

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

export function siteFromLocation(id: string): SiteInput {
  const loc = getLocation(id) ?? getLocation('khartoum')!
  const highs = Array.isArray(loc.avgHighTempC) ? loc.avgHighTempC : [loc.avgHighTempC]
  return {
    locationId: loc.id, customName: '', psh: loc.annualPsh, monthlyPsh: [...loc.monthlyPsh],
    tiltDeg: loc.optimalTiltDeg, azimuthDeg: 0, tiltGainFactor: Math.round(tiltGainFor(loc.lat) * 100) / 100,
    ambientHighC: Math.round(Math.max(...highs)), ambientAvgC: Math.round(highs.reduce((a, b) => a + b, 0) / highs.length), recordLowC: loc.recordLowTempC, shadingLossPct: 2, soilingLossPct: 3,
    roofType: 'flat-concrete', availableAreaM2: null, gridTariff: loc.typicalTariffUsdPerKwh, gridEmission: loc.gridEmissionKgPerKwh,
    currency: 'USD', fxRateToUsd: 1,
  }
}

export const defaultDesign = (systemType: DesignInput['systemType'] = 'hybrid'): DesignInput => ({
  systemType, phase: 1, autonomyDays: systemType === 'offgrid' ? 1 : 1, dodOverridePct: null, systemVoltage: 48, coincidenceFactor: 0.8,
  dcAcRatio: 1.2, inverterSafety: 1.25, pvOversize: systemType === 'offgrid' ? 1.2 : 1.0, // §3.1 offGridMargin when sizing on annual PSH
  panelId: 'auto', batteryId: systemType === 'gridtie' ? null : 'auto', inverterId: null, inverterQty: 1, chargeControllerId: null, useSeparateController: false,
  dcCableRunM: 20, batteryCableRunM: 2, acCableRunM: 15, maxVoltageDropPct: 2, generatorBackup: false, generatorKva: null,
  degradationPctPerYear: 0.5, analysisYears: 25, panelOverrideQty: null, batteryOverrideQty: null,
})

export const defaultPricing = (marginPct = 20, vatPct = 0): PricingInput => ({
  marginPct, vatPct, labourPerKwUsd: 120, transportUsd: 100, commissioningUsd: 150, discountPct: 0, priceOverrides: {}, qtyOverrides: {}, excludedIds: [], customItems: [],
})

export function newProject(partial: Partial<Project> = {}, company?: CompanySettings): Project {
  const now = new Date().toISOString()
  return {
    id: uid(), name: 'New solar project', clientName: '', clientPhone: '', clientEmail: '', clientAddress: '', reference: `Q-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    notes: '', createdAt: now, updatedAt: now, status: 'draft', loads: [], site: siteFromLocation('khartoum'), design: defaultDesign('hybrid'), pricing: defaultPricing(20, company ? 0 : 0),
    ...partial,
  }
}

export function loadFromAppliance(a: Appliance, qty = 1): LoadItem {
  return { id: uid(), name: a.name, category: a.category, watts: a.watts, qty, hoursPerDay: a.hoursPerDay, surgeFactor: a.surgeFactor, nightSharePct: nightShareByCategory[a.category] ?? 40, phase: a.phase, critical: true }
}

export const defaultCompany: CompanySettings = {
  name: 'Your Solar Company', tagline: 'Clean energy, engineered.', phone: '', email: '', website: '', address: '', logoDataUrl: null, primaryColor: '#0f766e',
  quoteValidityDays: 30, currency: 'USD', fxRateToUsd: 1,
  terms: 'Prices are valid for the stated period and subject to stock availability. 50% deposit on order, balance on commissioning. Equipment warranties as per manufacturer. Installation workmanship warranty: 2 years. Civil works, grid connection fees and permits are excluded unless stated.',
}
