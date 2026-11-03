// ---------- Catalog types ----------
export interface Panel {
  id: string; brand: string; model: string; watts: number;
  voc: number; vmp: number; isc: number; imp: number;
  efficiencyPct: number; tempCoeffPmaxPctPerC: number; tempCoeffVocPctPerC: number; noct: number;
  lengthMm: number; widthMm: number; thicknessMm?: number; weightKg: number; cells?: number;
  technology: string; bifacial: boolean; warrantyYears: number; approxPriceUsd: number;
  /** Module max system voltage (V DC, 1000 or 1500). Missing → 1500. */
  maxSystemVoltage?: number;
  /** Module max series fuse rating (A). Missing → not checked. */
  maxSeriesFuseA?: number;
}
export type Chemistry = 'LiFePO4' | 'AGM' | 'Gel' | 'Flooded' | 'NMC'
export interface Battery {
  id: string; brand: string; model: string; chemistry: Chemistry;
  nominalVoltage: number; capacityAh: number; energyKwh: number; usableDodPct: number;
  maxChargeA: number; maxDischargeA: number; cycles: number; warrantyYears: number; weightKg: number;
  formFactor: string; parallelMax: number; approxPriceUsd: number;
  /** Proprietary battery that only works with these inverter brands (e.g. Huawei LUNA2000). */
  inverterBrands?: string[];
}
export type InverterType = 'offgrid' | 'hybrid' | 'gridtie'
export interface Inverter {
  id: string; brand: string; model: string; type: InverterType; phase: 1 | 3;
  ratedAcKw: number; maxPvInputKw: number; maxPvVoltage: number; mpptMinV: number; mpptMaxV: number;
  mpptCount: number; maxInputCurrentPerMppt: number; batteryVoltage: number | string | null;
  maxChargeA: number; surgeKw: number; efficiencyPct: number; parallelMax: number; generatorInput: boolean;
  approxPriceUsd: number;
  /** Inverter only accepts these battery brands (brand-locked HV interface); when set, the voltage-window check is replaced by this list. */
  batteryBrands?: string[];
}
export interface ChargeController {
  id: string; brand: string; model: string; maxChargeA: number; maxPvVoltage: number;
  batteryVoltages: number[]; approxPriceUsd: number; type?: 'MPPT' | 'PWM';
}
export interface CableSpec { id: string; use: 'dc' | 'battery' | 'ac'; sizeMm2: number; awg?: string; ampacityA: number; priceUsdPerM: number }
export interface CatalogItem { id: string; name: string; category: string; unit: string; approxPriceUsd: number; spec?: string; nameAr?: string; specAr?: string }

export interface Appliance { id: string; name: string; nameAr?: string; category: string; watts: number; hoursPerDay: number; surgeFactor: number; phase: 1 | 3 }

export interface Location {
  id: string; city: string; country: string; region: string; lat: number; lon: number;
  annualPsh: number; monthlyPsh: number[]; optimalTiltDeg: number;
  avgHighTempC: number[] | number; recordLowTempC: number; gridEmissionKgPerKwh: number;
  currency: string; typicalTariffUsdPerKwh: number;
  cityAr?: string; countryAr?: string;
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
  availableAreaM2: number | null; gridTariff: number; gridEmission: number; currency: string; fxRateToUsd: number; // local currency units per 1 USD
  /** Off-grid only: cost of the diesel-generated kWh the solar system displaces (USD/kWh, fuel + O&M). Missing → 0.40. */
  dieselCostUsdPerKwh?: number;
  /** Site latitude (°, + north) — needed for the monthly tilt model on custom sites (catalogue sites use the location record). */
  lat?: number;
  /** Hybrid: average grid outage hours per day. The solar energy used during outages is valued at the diesel cost instead of the grid tariff. Missing → 0. */
  outageHoursPerDay?: number;
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
  /** true → the engine uses the §1.2 line-count coincidence factor (≤5 lines 1.0, 6–15 0.8, >15 0.7) and ignores `coincidenceFactor`. */
  coincidenceAuto?: boolean;
  /** Economics (§10). Missing → defaults: discount 6 %, O&M 1 %/yr of capex, tariff escalation 3 %/yr, inverter life 15 yr. */
  discountRatePct?: number; omPctPerYear?: number; tariffEscalationPct?: number; inverterLifeYears?: number;
}

export interface PricingInput {
  marginPct: number; vatPct: number; labourPerKwUsd: number; transportUsd: number; commissioningUsd: number;
  discountPct: number; priceOverrides: Record<string, number>; qtyOverrides: Record<string, number>; excludedIds: string[];
  customItems: BomLine[];
}

/**
 * How a project is built (the wizard shows only the steps a mode needs):
 * - 'design': full design from the client's demand (appliance list or electricity bill) — every step;
 * - 'size': the client already knows the system size (kWp / kWh / kW targets), no load list needed;
 * - 'items': a priced list of products only (counter sale, spare parts) — no design.
 */
export type ProjectMode = 'design' | 'size' | 'items'
/** Where the daily demand comes from: the appliance list, or the electricity bill (monthly kWh). */
export type DemandSource = 'loads' | 'bill'
export type BillProfile = 'residential' | 'commercial' | 'daytime'
export interface BillInput {
  /** Average monthly consumption (kWh/month) from the electricity bills. */
  monthlyKwh: number
  /** Usage pattern → night share and peak/average ratio (residential 45 % night, commercial 25 %, daytime-only 5 %). */
  profile: BillProfile
  /** Measured or contracted peak demand (kW); null → estimated from the average load and the profile. */
  peakKw: number | null
  /** Largest motor that starts on the system (kW) — sets the starting surge; null → no large motor. */
  largestMotorKw: number | null
}
/** Sizes fixed by the user. null = size it automatically; pvKwp 0 = no panels (battery backup only); batteryKwh 0 = no battery. */
export interface SizeTargets { pvKwp: number | null; batteryKwh: number | null; inverterKw: number | null }
/** Equipment already on site (expansion / upgrade): counted in the design, not quoted. Same models as the design's panel / battery / inverter. */
export interface ExistingEquipment { panels: number; batteries: number; inverters: number }
export interface SizingInput { demand: DemandSource; bill: BillInput; targets: SizeTargets; existing: ExistingEquipment }

export interface Project {
  id: string; name: string; clientName: string; clientPhone: string; clientEmail: string; clientAddress: string;
  /** `notes` are internal (never printed); `proposalNote` is printed on the client proposal / quotation. */
  reference: string; notes: string; createdAt: string; updatedAt: string; status: ProjectStatus;
  loads: LoadItem[]; site: SiteInput; design: DesignInput; pricing: PricingInput;
  /** Missing → 'design' (projects saved before v0.2). */
  mode?: ProjectMode
  /** Missing → demand from the load list, nothing fixed, nothing existing. */
  sizing?: SizingInput
  proposalNote?: string
  /** Id of the project this one is a revision of (New revision keeps the reference with -R2, -R3 …). */
  revisionOf?: string
}
export type ProjectStatus = 'draft' | 'quoted' | 'approved' | 'installed' | 'lost'

export interface CompanySettings {
  name: string; tagline: string; phone: string; email: string; website: string; address: string;
  logoDataUrl: string | null; primaryColor: string; quoteValidityDays: number; terms: string; currency: string; fxRateToUsd: number;
}

// ---------- Company price list ----------
/** The company's own products (datasheet values entered by the user); ids start with `my-`. */
export interface CustomProducts { panels: Panel[]; batteries: Battery[]; inverters: Inverter[]; chargeControllers: ChargeController[]; items: CatalogItem[] }
/**
 * Company price list, applied to every project: unit cost overrides (USD, by catalogue / item id), products the company
 * does not stock (never auto-selected; a hidden product picked by hand still works), and the company's own products.
 * Per-project BOM price overrides still win over this list.
 */
export interface PriceBook { prices: Record<string, number>; hidden: string[]; custom: CustomProducts; updatedAt?: string }

// ---------- Results ----------
export type StepKey = 'info' | 'loads' | 'site' | 'design' | 'results' | 'bom' | 'export'
/** `step` = the wizard step where the user fixes this check; `messageAr` = Arabic text of `message`. */
export interface Check { id: string; level: 'ok' | 'warn' | 'error'; message: string; messageAr?: string; step?: StepKey }
export interface BomLine {
  id: string; category: string; name: string; spec: string; unit: string; qty: number; unitPriceUsd: number; totalUsd: number; source: 'auto' | 'custom'
  nameAr?: string; specAr?: string
  /** Custom lines added from the catalogue: the catalogue / item id they came from. */
  ref?: string
  /** Main equipment already on site (expansion): units counted in the design but not quoted. */
  existingQty?: number
}
export interface StringDesign {
  panelsPerString: number; strings: number; totalPanels: number;
  vocCold: number; vmpHot: number; stringIscA: number; stringsPerMppt: number; mpptsUsed: number;
  ok: boolean; notes: string[];
  notesAr?: string[];
  /** Voltage limit the series count was designed against: min(inverter/controller max PV V × 0.97, module max system V, code limit). */
  maxSystemVoltageV?: number;
  /** true when the strings are designed against a separate charge controller (virtual MPPT inputs = controllers). */
  viaController?: boolean;
}
export interface CableResult {
  use: 'dc' | 'battery' | 'ac'; currentA: number; lengthM: number; voltage: number; sizeMm2: number; dropPct: number; breakerA: number; fuseA?: number
  /** Circuit id: 'pv-string' | 'pv-array' | 'battery' | 'cc-battery' | 'ac' | 'ac-inverter' | 'ac-grid' | 'ac-generator'. */
  id?: string; label?: string; labelAr?: string
  /** Conductors in parallel per pole (> 1 only when one 240 mm² conductor is not enough). */
  parallelRuns?: number
  /** Derated ampacity I_z of the installed conductor(s) (A, all parallel runs). */
  ampacityA?: number
  /** Number of identical circuits (e.g. one per inverter or per string). */
  count?: number
  /** Protective device description and DC voltage rating. */
  deviceType?: string; deviceRatedV?: number
  /** false when the design current is above the largest standard device (an error check is raised). */
  deviceStd?: boolean
}
/** Ratings of the protective devices that drive the BOM (methodology §8.3). null = not applicable. */
export interface ProtectionSummary {
  stringFuseA: number | null; arrayFuseA: number | null
  dcIsolatorV: number | null; dcIsolatorA: number | null; spdDcV: number | null
  batteryFuseA: number | null; batteryFuseVdc: number | null
  acBreakerPerInverterA: number | null; acMainBreakerA: number | null; generatorBreakerA: number | null
  rcdA: number | null; changeoverA: number | null; changeoverType: 'manual' | 'ats' | null
}
export interface Replacement { year: number; item: 'battery' | 'inverter'; usd: number }

export interface Results {
  panel: Panel;
  /** Mode and demand source the results were computed for ('none' = no consumption data: size / items modes without loads). */
  mode: ProjectMode; demand: DemandSource | 'none';
  // loads
  dailyWh: number; dayWh: number; nightWh: number; criticalWh: number; peakW: number; surgeW: number; connectedW: number;
  monthlyKwh: number; annualKwh: number;
  /** Effective coincidence factor used for peakW (auto or manual). */
  coincidenceFactor: number;
  /** Largest single running unit (W) — peakW is never below it. */
  maxUnitW: number;
  /** Peak / surge the inverter and generator are sized on: the critical (backed-up) subset for hybrids with critical loads, else peakW / surgeW. */
  sizingPeakW: number; sizingSurgeW: number;
  /** Three-phase systems: connected W per phase after round-robin allocation of single-phase loads (null for 1-ph). */
  phaseLoadsW: [number, number, number] | null; phaseMaxW: number;
  // pv
  derate: number; derateBreakdown: { name: string; factor: number; nameAr?: string }[];
  requiredPvKwp: number; panelQty: number; arrayKwp: number; arrayAreaM2: number; arrayWeightKg: number;
  tiltedPsh: number; monthlyProductionKwh: number[]; annualProductionKwh: number; specificYield: number;
  /** Horizontal monthly PSH actually used (profile scaled so its mean equals the annual PSH input). */
  monthlyPshUsed: number[];
  /** Monthly plane-of-array gain applied to monthlyPshUsed (annual-weighted mean = tiltGainUsed). */
  monthlyTiltGain: number[]; tiltGainUsed: number;
  /** Roof/ground footprint incl. row spacing / setbacks = arrayAreaM2 × areaFactor. */
  footprintM2: number; areaFactor: number;
  // battery
  batteryRequiredKwh: number; batteryQty: number; batteryKwh: number; batteryUsableKwh: number; batteryAh: number;
  batteryConfig: { series: number; parallel: number }; batteryHoursBackup: number; dod: number;
  battery: Battery | null;
  /** Daily energy the bank is sized to deliver (Wh): off-grid = whole day, hybrid = night energy of backed-up loads. */
  batteryDailyWh: number;
  /** Actual autonomy = usable kWh × η_inv / batteryDailyWh (days; §4.2). 0 when there is no battery or no demand. */
  autonomyDays: number;
  // inverter
  requiredInverterKw: number; inverter: Inverter | null; inverterQty: number; inverterTotalKw: number; inverterOk: boolean;
  /** 'array' for grid-tied (P_inv = PV / DC:AC target), 'load' otherwise (peak × safety). */
  inverterSizingBasis: 'load' | 'array';
  /** Installed DC/AC ratio (arrayKwp / inverterTotalKw). */
  dcAcRatio: number;
  controller: ChargeController | null; controllerQty: number; requiredControllerA: number;
  strings: StringDesign | null;
  cables: CableResult[];
  /** Every sized circuit (cables keeps one entry per use for backwards compatibility). */
  cableSchedule: CableResult[];
  protection: ProtectionSummary;
  // generator
  generatorKva: number | null;
  // economics
  bom: BomLine[]; equipmentCostUsd: number; labourUsd: number; subtotalUsd: number; marginUsd: number; discountUsd: number; vatUsd: number; totalUsd: number;
  costPerWp: number; annualSavingsUsd: number; paybackYears: number | null; lcoeUsdPerKwh: number; co2TonsPerYear: number; lifetimeProductionKwh: number;
  roi25Pct: number | null; cumulativeCashflow: number[];
  /** 'grid' = savings at the grid tariff; 'diesel' = off-grid, savings at the displaced diesel cost per kWh. */
  savingsBasis: 'grid' | 'diesel'; avoidedCostUsdPerKwh: number;
  /** Year-1 solar energy actually used (self-consumed / useful), kWh — the basis of savings, CO₂ and LCOE. */
  usefulEnergyKwh: number; lifetimeUsefulKwh: number;
  omUsdPerYear: number; replacements: Replacement[]; npvUsd: number;
  checks: Check[];
}
