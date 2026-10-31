// ---------- Catalog types ----------
export interface Panel {
  id: string; brand: string; model: string; watts: number;
  voc: number; vmp: number; isc: number; imp: number;
  efficiencyPct: number; tempCoeffPmaxPctPerC: number; tempCoeffVocPctPerC: number; noct: number;
  lengthMm: number; widthMm: number; thicknessMm?: number; weightKg: number; cells?: number;
  technology: string; bifacial: boolean; warrantyYears: number; approxPriceUsd: number;
}
export type Chemistry = 'LiFePO4' | 'AGM' | 'Gel' | 'Flooded' | 'NMC'
export interface Battery {
  id: string; brand: string; model: string; chemistry: Chemistry;
  nominalVoltage: number; capacityAh: number; energyKwh: number; usableDodPct: number;
  maxChargeA: number; maxDischargeA: number; cycles: number; warrantyYears: number; weightKg: number;
  formFactor: string; parallelMax: number; approxPriceUsd: number;
}
export type InverterType = 'offgrid' | 'hybrid' | 'gridtie'
export interface Inverter {
  id: string; brand: string; model: string; type: InverterType; phase: 1 | 3;
  ratedAcKw: number; maxPvInputKw: number; maxPvVoltage: number; mpptMinV: number; mpptMaxV: number;
  mpptCount: number; maxInputCurrentPerMppt: number; batteryVoltage: number | string | null;
  maxChargeA: number; surgeKw: number; efficiencyPct: number; parallelMax: number; generatorInput: boolean;
  approxPriceUsd: number;
}
export interface ChargeController {
  id: string; brand: string; model: string; maxChargeA: number; maxPvVoltage: number;
  batteryVoltages: number[]; approxPriceUsd: number; type?: 'MPPT' | 'PWM';
}
export interface CableSpec { id: string; use: 'dc' | 'battery' | 'ac'; sizeMm2: number; awg?: string; ampacityA: number; priceUsdPerM: number }
export interface CatalogItem { id: string; name: string; category: string; unit: string; approxPriceUsd: number; spec?: string }

export interface Appliance { id: string; name: string; nameAr?: string; category: string; watts: number; hoursPerDay: number; surgeFactor: number; phase: 1 | 3 }

export interface Location {
  id: string; city: string; country: string; region: string; lat: number; lon: number;
  annualPsh: number; monthlyPsh: number[]; optimalTiltDeg: number;
  avgHighTempC: number[] | number; recordLowTempC: number; gridEmissionKgPerKwh: number;
  currency: string; typicalTariffUsdPerKwh: number;
}

// ---------- Project input ----------
export type SystemType = 'offgrid' | 'hybrid' | 'gridtie'
export type Phase = 1 | 3

export interface LoadItem {
  id: string; name: string; category: string; watts: number; qty: number; hoursPerDay: number;
  surgeFactor: number; nightSharePct: number; // % of this load's energy consumed at night (from battery)
  phase: Phase; critical: boolean; // critical = must be backed up (hybrid)
}

export interface SiteInput {
  locationId: string | 'custom'; customName: string; psh: number; monthlyPsh: number[];
  tiltDeg: number; azimuthDeg: number; tiltGainFactor: number;
  ambientHighC: number; ambientAvgC: number; recordLowC: number; shadingLossPct: number; soilingLossPct: number;
  roofType: 'flat-concrete' | 'pitched-tile' | 'metal-sheet' | 'ground';
  availableAreaM2: number | null; gridTariff: number; gridEmission: number; currency: string; fxRateToUsd: number; // 1 local = fxRateToUsd USD? we store local per USD
}

export interface DesignInput {
  systemType: SystemType; phase: Phase;
  autonomyDays: number; dodOverridePct: number | null; systemVoltage: 12 | 24 | 48 | 'hv'; coincidenceFactor: number;
  dcAcRatio: number; inverterSafety: number; pvOversize: number;
  panelId: string; batteryId: string | null; inverterId: string | null; inverterQty: number;
  chargeControllerId: string | null; useSeparateController: boolean;
  dcCableRunM: number; batteryCableRunM: number; acCableRunM: number; maxVoltageDropPct: number;
  generatorBackup: boolean; generatorKva: number | null;
  degradationPctPerYear: number; analysisYears: number;
  panelOverrideQty: number | null; batteryOverrideQty: number | null;
}

export interface PricingInput {
  marginPct: number; vatPct: number; labourPerKwUsd: number; transportUsd: number; commissioningUsd: number;
  discountPct: number; priceOverrides: Record<string, number>; qtyOverrides: Record<string, number>; excludedIds: string[];
  customItems: BomLine[];
}

export interface Project {
  id: string; name: string; clientName: string; clientPhone: string; clientEmail: string; clientAddress: string;
  reference: string; notes: string; createdAt: string; updatedAt: string; status: 'draft' | 'quoted' | 'approved' | 'installed';
  loads: LoadItem[]; site: SiteInput; design: DesignInput; pricing: PricingInput;
}

export interface CompanySettings {
  name: string; tagline: string; phone: string; email: string; website: string; address: string;
  logoDataUrl: string | null; primaryColor: string; quoteValidityDays: number; terms: string; currency: string; fxRateToUsd: number;
}

// ---------- Results ----------
export interface Check { id: string; level: 'ok' | 'warn' | 'error'; message: string; messageAr?: string }
export interface BomLine {
  id: string; category: string; name: string; spec: string; unit: string; qty: number; unitPriceUsd: number; totalUsd: number; source: 'auto' | 'custom'
}
export interface StringDesign {
  panelsPerString: number; strings: number; totalPanels: number;
  vocCold: number; vmpHot: number; stringIscA: number; stringsPerMppt: number; mpptsUsed: number;
  ok: boolean; notes: string[];
}
export interface CableResult { use: 'dc' | 'battery' | 'ac'; currentA: number; lengthM: number; voltage: number; sizeMm2: number; dropPct: number; breakerA: number; fuseA?: number }

export interface Results {
  panel: Panel;
  // loads
  dailyWh: number; dayWh: number; nightWh: number; criticalWh: number; peakW: number; surgeW: number; connectedW: number;
  monthlyKwh: number; annualKwh: number;
  // pv
  derate: number; derateBreakdown: { name: string; factor: number }[];
  requiredPvKwp: number; panelQty: number; arrayKwp: number; arrayAreaM2: number; arrayWeightKg: number;
  tiltedPsh: number; monthlyProductionKwh: number[]; annualProductionKwh: number; specificYield: number;
  // battery
  batteryRequiredKwh: number; batteryQty: number; batteryKwh: number; batteryUsableKwh: number; batteryAh: number;
  batteryConfig: { series: number; parallel: number }; batteryHoursBackup: number; dod: number;
  // inverter
  requiredInverterKw: number; inverter: Inverter | null; inverterQty: number; inverterTotalKw: number; inverterOk: boolean;
  controller: ChargeController | null; controllerQty: number; requiredControllerA: number;
  strings: StringDesign | null;
  cables: CableResult[];
  // generator
  generatorKva: number | null;
  // economics
  bom: BomLine[]; equipmentCostUsd: number; labourUsd: number; subtotalUsd: number; marginUsd: number; discountUsd: number; vatUsd: number; totalUsd: number;
  costPerWp: number; annualSavingsUsd: number; paybackYears: number | null; lcoeUsdPerKwh: number; co2TonsPerYear: number; lifetimeProductionKwh: number;
  roi25Pct: number | null; cumulativeCashflow: number[];
  checks: Check[];
}
