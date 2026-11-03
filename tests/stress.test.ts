// Engine stress tests (DT+ Solar Planner v0.2): seeded property fuzz over every project mode, monotonicity, regression
// equivalence, hostile store input, the engineering tools and performance. Formulas: docs/sizing-methodology.md §15–§16.
//
// Reproduce a fuzz failure: every case is generated from SEED and its index only (`genCase(i)`); messages print `#i`.
// Dump one: STRESS_CASE=123 npx vitest run tests/stress.test.ts -t debug --silent=false   (STRESS_DEBUG=1 prints every bucket)
// Known defects keep their failing assertion under `it(...)` with a `DEFECT:` comment — flip them to `it` after the fix.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { computeProject, sizeCable } from '../src/engine/compute'
import { buildQuote, effectivePercents, type Quote } from '../src/engine/quote'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, modeDefaults, defaultCompany } from '../src/engine/defaults'
import { defaultSizing, resolveSizing } from '../src/engine/sizing'
import { cat, emptyPriceBook, resolveCatalog, withPriceBook } from '../src/engine/catalogContext'
import { STD_PV_FUSE_A, STD_DC_FUSE_A, nextStd } from '../src/engine/standards'
import {
  checkStrings, panelSpec, inverterMppt, controllerMppt, sizeBatteryBank, batterySpec, sizeCircuit, sizeGenerator,
  type StringCheckInput, type BatteryBankInput, type CableToolInput, type GeneratorInput, type CircuitKind, type StartMethod,
} from '../src/engine/tools'
import { normalizeProject, normalizeCompany, useAppStore, type Company } from '../src/store/useAppStore'
import { STEPS, MODE_STEPS } from '../src/components/wizardModel'
import { catalog } from '../src/data/catalog'
import { locations } from '../src/data/locations'
import { appliances } from '../src/data/appliances'
import { sampleProjects } from '../src/data/samples'
import type { Project, Results, PriceBook, Panel, Battery, Inverter, ChargeController, CatalogItem, LoadItem, SystemType, ProjectMode, Chemistry } from '../src/engine/types'

// zustand `persist` only installs its API (and `migrate`) when `window.localStorage` exists: give this worker an in-memory one
vi.hoisted(() => {
  const mem = new Map<string, string>()
  const localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)) }, removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size } }
  const g = globalThis as unknown as { window?: unknown }
  if (g.window === undefined) g.window = { localStorage }
})

// ====================================================================================================== seeded PRNG
const SEED = Number(process.env.STRESS_SEED ?? 20261103) // other seeds explore further; the DEFECT expectations are pinned to this one
/** mulberry32 — `rngFor(seedOf(i))` reproduces case i on its own, independent of every other case. */
function rngFor(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    num: (lo: number, hi: number) => lo + next() * (hi - lo),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Rng = ReturnType<typeof rngFor>
const seedOf = (i: number, salt = 0) => (SEED ^ Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0
const r2 = (x: number) => Math.round(x * 100) / 100
const ARABIC = /[؀-ۿ]/
const DISCRETE = new Set(['pcs', 'pair', 'kit', 'lot'])
const MOUNTING = new Set(['rail', 'mid-clamp', 'end-clamp', 'rail-splice', 'tile-hook', 'l-foot', 'triangle-frame', 'ballast-block', 'ground-structure', 'earth-clip'])
const isPvDc = (id: string) => id.startsWith('dc-cable-') || id === 'mc4-pair' || id === 'combiner-box' || id.startsWith('pv-fuse-') || id.startsWith('pv-array-fuse-') || id.startsWith('dc-isolator-') || id.startsWith('spd-dc-')

// ====================================================================================================== deep helpers
/** Paths of every non-finite number. */
function nonFinite(x: unknown, path = '', out: string[] = []): string[] {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(`${path}=${x}`) }
  else if (Array.isArray(x)) x.forEach((v, i) => nonFinite(v, `${path}[${i}]`, out))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) nonFinite(v, `${path}.${k}`, out)
  return out
}
function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.freeze(x); for (const v of Object.values(x as object)) deepFreeze(v) }
  return x
}
const clone = <T,>(x: T): T => structuredClone(x)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** BOM lines whose qty / price is not a non-negative number (the UI, PDF and Excel format them as numbers). */
const badLines = (r: Results) => r.bom.filter((b) => typeof b.qty !== 'number' || typeof b.unitPriceUsd !== 'number' || typeof b.totalUsd !== 'number' || b.qty < 0 || b.unitPriceUsd < 0 || b.totalUsd < 0)

// ====================================================================================================== case generator
const UNKNOWN_IDS = ['deleted-product-x', 'my-gone-1', 'pnl-discontinued-2024']
const CURRENCIES: [string, number][] = [['USD', 1], ['SDG', 2500], ['SAR', 3.75], ['KWD', 0.307], ['IQD', 1310], ['JOD', 0.709], ['BHD', 0.376], ['OMR', 0.3845], ['EUR', 0.86], ['EGP', 48.5], ['YER', 535], ['LYD', 5.45]]
const ROOFS = ['flat-concrete', 'pitched-tile', 'metal-sheet', 'ground'] as const
const ITEM_POOL = ['mid-clamp', 'end-clamp', 'earth-rod', 'lightning-arrestor', 'mc4-pair', 'rail', 'labour', 'transport', 'commissioning', 'db-board', 'spd-ac', 'wifi-dongle', 'conduit', 'busbar-kit', 'cable-lug']
const CHEMS: Chemistry[] = ['LiFePO4', 'NMC', 'AGM', 'Gel', 'Flooded']

type Kind = 'design-loads' | 'design-bill' | 'size' | 'items'
interface Case {
  i: number; p: Project; book: PriceBook | null; kind: Kind
  /** Ids the generator gave a fractional qty override (UI-reachable: the BOM qty field is not integer-only). */
  fractionalQtyIds: Set<string>
}

// Own products: catalogue clones, or random datasheets inside the ProductForm limits (src/components/ProductForm.tsx)
function ownPanel(r: Rng, k: number): Panel {
  if (r.chance(0.6)) return { ...r.pick(catalog.panels), id: `my-pnl-${k}`, brand: 'Own', model: `P${k}`, approxPriceUsd: r2(r.num(30, 250)) }
  const voc = r2(r.num(5, 120)), isc = r2(r.num(1, 30))
  return { id: `my-pnl-${k}`, brand: 'Own', model: `P${k}`, watts: r.int(5, 1000), voc, vmp: r2(voc * r.num(0.6, 0.95)), isc, imp: r2(isc * r.num(0.8, 0.98)), efficiencyPct: r.int(10, 23),
    tempCoeffPmaxPctPerC: -r2(r.num(0.2, 0.5)), tempCoeffVocPctPerC: -r2(r.num(0.2, 0.4)), noct: r.int(35, 60), lengthMm: r.int(300, 3000), widthMm: r.int(200, 2000), weightKg: r.int(1, 80),
    technology: 'mono', bifacial: false, warrantyYears: 25, approxPriceUsd: r2(r.num(5, 400)), maxSystemVoltage: r.pick([1000, 1500, undefined]), maxSeriesFuseA: r.pick([undefined, r.int(1, 60)]) }
}
function ownBattery(r: Rng, k: number): Battery {
  if (r.chance(0.6)) return { ...r.pick(catalog.batteries), id: `my-bat-${k}`, brand: 'Own', model: `B${k}`, approxPriceUsd: r2(r.num(200, 4000)) }
  const v = r.pick([12, 12.8, 24, 25.6, 48, 51.2, 102.4, 204.8, 409.6, r2(r.num(1, 1000))]), ah = r.int(1, 5000)
  return { id: `my-bat-${k}`, brand: 'Own', model: `B${k}`, chemistry: r.pick(CHEMS), nominalVoltage: v, capacityAh: ah, energyKwh: Math.max(0.05, r2((v * ah) / 1000)), usableDodPct: r.int(10, 100),
    maxChargeA: r.int(1, 2000), maxDischargeA: r.int(1, 2000), cycles: r.int(50, 20000), warrantyYears: 5, weightKg: r.int(1, 300), formFactor: r.pick(['rack', 'wall', 'floor']), parallelMax: r.int(1, 64), approxPriceUsd: r2(r.num(50, 9000)) }
}
function ownInverter(r: Rng, k: number): Inverter {
  if (r.chance(0.6)) return { ...r.pick(catalog.inverters), id: `my-inv-${k}`, brand: 'Own', model: `I${k}`, approxPriceUsd: r2(r.num(300, 9000)) }
  const type = r.pick(['offgrid', 'hybrid', 'gridtie'] as const), mppt = r.chance(0.2) ? 0 : r.int(1, 24)
  const maxV = mppt ? r.int(100, 1500) : 0, hi = mppt ? r.int(Math.ceil(maxV * 0.5), maxV) : 0
  return { id: `my-inv-${k}`, brand: 'Own', model: `I${k}`, type, phase: r.pick([1, 3] as const), ratedAcKw: r2(r.num(0.1, 200)), maxPvInputKw: mppt ? r2(r.num(0.5, 300)) : 0, maxPvVoltage: maxV,
    mpptMinV: mppt ? r.int(0, hi - 1) : 0, mpptMaxV: hi, mpptCount: mppt, maxInputCurrentPerMppt: mppt ? r.int(5, 100) : 0,
    batteryVoltage: type === 'gridtie' ? null : r.pick([12, 24, 48, '150-600', '160-800']), maxChargeA: r.int(0, 2000), surgeKw: r.chance(0.3) ? 0 : r2(r.num(0.5, 400)), efficiencyPct: 96,
    parallelMax: r.int(1, 30), generatorInput: true, approxPriceUsd: r2(r.num(100, 30000)) }
}
function ownController(r: Rng, k: number): ChargeController {
  if (r.chance(0.6)) return { ...r.pick(catalog.chargeControllers), id: `my-cc-${k}`, brand: 'Own', model: `C${k}`, approxPriceUsd: r2(r.num(50, 900)) }
  return { id: `my-cc-${k}`, brand: 'Own', model: `C${k}`, maxChargeA: r.int(1, 500), maxPvVoltage: r.int(10, 1500), batteryVoltages: [12, 24, 36, 48].filter(() => r.chance(0.6)).concat([r.pick([12, 24, 48])]),
    approxPriceUsd: r2(r.num(20, 2000)), type: r.pick(['MPPT', 'PWM', undefined]) }
}

function genBook(r: Rng): PriceBook | null {
  if (r.chance(0.4)) return null
  const b = emptyPriceBook()
  if (r.chance(0.5)) for (let k = r.int(1, 3); k > 0; k--) {
    b.custom.panels.push(ownPanel(r, k)); b.custom.batteries.push(ownBattery(r, k)); b.custom.inverters.push(ownInverter(r, k)); b.custom.chargeControllers.push(ownController(r, k))
    b.custom.items.push({ id: `my-item-${k}`, name: `Own item ${k}`, category: r.pick(['Accessories', 'Mounting', 'Custom']), unit: r.pick(['pcs', 'm', 'kit', 'pair', 'lot']), approxPriceUsd: r2(r.num(0, 200)) })
  }
  const all = resolveCatalog({ ...b }) // a copy: resolveCatalog caches per price-list object and `b` is still being filled
  const ids = [...all.panels, ...all.batteries, ...all.inverters, ...all.chargeControllers, ...all.items].map((x) => x.id)
  for (const id of ids) if (r.chance(0.12)) b.prices[id] = r.chance(0.1) ? 0 : r2(r.num(1, 5000))
  for (const id of ids) if (r.chance(0.08)) b.hidden.push(id)
  // hide an entire family now and then (the auto-selection then falls back to every product of that family, §16.6)
  for (const fam of ['panels', 'batteries', 'inverters', 'chargeControllers'] as const) if (r.chance(0.1)) for (const x of all[fam]) b.hidden.push(x.id)
  return b
}

const genTargets = (r: Rng): NonNullable<Project['sizing']>['targets'] => ({
  pvKwp: r.chance(0.2) ? null : r.chance(0.18) ? 0 : r2(r.num(0.3, 150)),
  batteryKwh: r.chance(0.2) ? null : r.chance(0.18) ? 0 : r2(r.num(1, 200)),
  inverterKw: r.chance(0.3) ? null : r2(r.num(1, 120)),
})

function genLoads(r: Rng, phase: 1 | 3): LoadItem[] {
  return Array.from({ length: r.int(0, 10) }, (_, k) => {
    const a = r.pick(appliances)
    const l: LoadItem = { id: `l${k}`, name: a.name, category: a.category, watts: a.watts, qty: r.int(1, 5), hoursPerDay: r.chance(0.3) ? r2(r.num(0, 24)) : a.hoursPerDay,
      surgeFactor: a.surgeFactor, nightSharePct: r.int(0, 100), phase: phase === 3 ? a.phase : 1, critical: r.chance(0.7) }
    if (r.chance(0.03)) l.hoursPerDay = 30 // §15.1 guard: clamped, `load-input`
    if (r.chance(0.02)) l.watts = -100 // §15.1 guard: row ignored
    if (r.chance(0.02)) l.nightSharePct = 150
    return l
  })
}

function genCase(i: number, force?: { kind?: Kind; type?: SystemType; salt?: number }): Case {
  const r = rngFor(seedOf(i, force?.salt ?? 0))
  const book = genBook(r)
  const resolved = resolveCatalog(book)
  const type: SystemType = force?.type ?? r.pick(['offgrid', 'hybrid', 'gridtie'] as const)
  const u = r.next()
  const kind: Kind = force?.kind ?? (u < 0.35 ? 'design-loads' : u < 0.55 ? 'design-bill' : u < 0.85 ? 'size' : 'items')
  const mode: ProjectMode = kind === 'size' ? 'size' : kind === 'items' ? 'items' : 'design'
  const p = newProject({ id: `fz-${i}`, name: `fuzz ${i}`, reference: `Q-FZ-${i}`, createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z', ...modeDefaults(mode, type) })
  const phase: 1 | 3 = r.chance(0.3) ? 3 : 1

  // ---- site
  const loc = r.pick(locations)
  const [currency, fxReal] = r.pick(CURRENCIES)
  const fx = r.chance(0.04) ? r.pick([1, 0, -3, Number.NaN, 0.0001, 1e6]) : fxReal // §15.1: fx ≤ 0 / NaN → 1 (`fx-invalid`), 1 → `fx-unset`
  p.site = {
    ...siteFromLocation(loc.id), roofType: r.pick(ROOFS), currency, fxRateToUsd: fx,
    tiltDeg: r.int(0, 60), azimuthDeg: r.int(-180, 180), gridTariff: r2(r.num(0, 0.6)),
    availableAreaM2: r.chance(0.7) ? null : r.int(5, 3000),
    soilingLossPct: r.chance(0.03) ? r.pick([-5, 120]) : r.int(0, 15), shadingLossPct: r.chance(0.03) ? r.pick([-5, 150]) : r.int(0, 15),
  }
  if (r.chance(0.03)) { p.site.psh = 0; p.site.monthlyPsh = Array(12).fill(0) }
  if (r.chance(0.5)) p.site.outageHoursPerDay = r.chance(0.2) ? r.int(0, 24) : Math.round(r.num(0, 24) * 10) / 10
  if (r.chance(0.3)) p.site.dieselCostUsdPerKwh = r.chance(0.5) ? undefined : r2(r.num(0, 1.5))

  // ---- design (manual picks include hidden products, own products and unknown ids)
  const d = { ...defaultDesign(type), phase, systemVoltage: r.pick([12, 24, 48, 48, 48, 'hv'] as const), coincidenceAuto: r.chance(0.6) }
  d.autonomyDays = r.chance(0.03) ? r.pick([-1, 20]) : r.pick([0, 0.5, 1, 1, 1.5, 2, 3])
  if (r.chance(0.1)) d.dodOverridePct = r.chance(0.3) ? r.pick([5, 150]) : r.pick([50, 80, 100])
  d.coincidenceFactor = r.chance(0.04) ? r.pick([0, 1.5]) : r2(r.num(0.5, 1))
  d.useSeparateController = type !== 'gridtie' && r.chance(0.2)
  d.generatorBackup = type !== 'gridtie' && r.chance(0.25)
  if (d.generatorBackup && r.chance(0.3)) d.generatorKva = r.int(5, 100)
  const idPool = <T extends { id: string }>(xs: T[]) => [...xs.map((x) => x.id), ...UNKNOWN_IDS]
  if (r.chance(0.3)) d.panelId = r.pick(idPool(resolved.panels))
  if (r.chance(0.3)) { d.inverterId = r.pick(idPool(resolved.inverters)); d.inverterQty = r.int(1, 4) }
  if (type !== 'gridtie' && r.chance(0.25)) d.batteryId = r.pick(idPool(resolved.batteries))
  if (r.chance(0.15)) d.chargeControllerId = r.pick(idPool(resolved.chargeControllers))
  if (r.chance(0.1)) d.panelOverrideQty = r.int(1, 80)
  if (type !== 'gridtie' && r.chance(0.08)) d.batteryOverrideQty = r.int(1, 16)
  if (r.chance(0.05)) d.pvOversize = r.pick([0, 0.8, 1.3, 5])
  if (r.chance(0.05)) d.inverterSafety = r.pick([0.5, 1.1, 1.5, 4])
  if (r.chance(0.05)) d.dcAcRatio = r.pick([0.5, 1.0, 1.4, 3])
  d.dcCableRunM = r.int(1, 80); d.batteryCableRunM = r.int(1, 10); d.acCableRunM = r.int(1, 120)
  // §15.1 guard: cable runs / drop target outside their range are clamped or defaulted (`design-input`)
  if (r.chance(0.02)) d.dcCableRunM = r.pick([0, -5, 20000]); if (r.chance(0.02)) d.batteryCableRunM = r.pick([0, 0.1, 900]); if (r.chance(0.02)) d.acCableRunM = r.pick([0, -1, 20000])
  if (r.chance(0.02)) d.maxVoltageDropPct = r.pick([0, 0.2, 30])
  d.analysisYears = r.pick([10, 20, 25, 30]); d.degradationPctPerYear = r2(r.num(0, 1))
  d.discountRatePct = r2(r.num(0, 15)); d.tariffEscalationPct = r2(r.num(0, 10)); d.omPctPerYear = r2(r.num(0, 3)); d.inverterLifeYears = r.int(10, 20)
  p.design = d

  // ---- demand / sizing
  p.loads = genLoads(r, phase)
  const sizing = defaultSizing()
  if (kind === 'design-bill') {
    sizing.demand = 'bill'
    sizing.bill = { monthlyKwh: r.chance(0.05) ? 0 : r.int(50, 6000), profile: r.pick(['residential', 'commercial', 'daytime'] as const), peakKw: r.chance(0.6) ? null : r2(r.num(1, 80)), largestMotorKw: r.chance(0.6) ? null : r2(r.num(0.5, 30)) }
  }
  if (kind === 'size' || r.chance(0.2)) sizing.targets = genTargets(r)
  if (kind === 'size' && r.chance(0.1)) sizing.targets = { pvKwp: null, batteryKwh: null, inverterKw: null }
  if (r.chance(kind === 'size' ? 0.3 : 0.2)) sizing.existing = { panels: r.chance(0.05) ? 999 : r.int(0, 60), batteries: r.int(0, 12), inverters: r.int(0, 4) }
  p.sizing = sizing

  // ---- pricing (UI-reachable values + the §15.1 out-of-range values the engine promises to clamp)
  const pr = defaultPricing(r.chance(0.05) ? r.pick([-10, 1500]) : r.pick([0, 15, 20, 26.5, 100, 300]), r.chance(0.04) ? r.pick([-1, 150]) : r.pick([0, 5, 15, 50]))
  pr.discountPct = r.chance(0.04) ? r.pick([-5, 120]) : r.pick([0, 0, 5, 12.5, 100])
  pr.labourPerKwUsd = r.chance(0.1) ? 0 : r2(r.num(0, 300)); pr.transportUsd = r2(r.num(0, 500)); pr.commissioningUsd = r2(r.num(0, 500))
  if (kind === 'items' && r.chance(0.7)) { pr.labourPerKwUsd = 0; pr.transportUsd = 0; pr.commissioningUsd = 0 }
  const fractionalQtyIds = new Set<string>()
  const lineIdPool = [...ITEM_POOL, ...[...resolved.panels, ...resolved.inverters, ...resolved.batteries, ...resolved.chargeControllers].map((x) => x.id)]
  if (r.chance(0.25)) for (let k = r.int(1, 3); k > 0; k--) {
    const id = r.pick(lineIdPool), frac = r.chance(0.15)
    pr.qtyOverrides[id] = frac ? r.int(0, 9) + 0.5 : r.int(0, 20)
    if (frac) fractionalQtyIds.add(id); else fractionalQtyIds.delete(id)
  }
  if (r.chance(0.2)) for (let k = r.int(1, 3); k > 0; k--) pr.priceOverrides[r.pick(lineIdPool)] = r.chance(0.1) ? 0 : r2(r.num(0, 3000))
  const nCustom = kind === 'items' ? r.int(0, 6) : r.chance(0.25) ? r.int(1, 3) : 0
  for (let k = 0; k < nCustom; k++) {
    const src = r.chance(0.6) ? r.pick([...resolved.panels, ...resolved.batteries, ...resolved.inverters, ...resolved.items]) : null
    const unit = src && 'unit' in src ? (src as CatalogItem).unit : src ? 'pcs' : r.pick(['pcs', 'm', 'lot', 'kWp'])
    pr.customItems.push({
      id: `c${k}`, ref: src?.id, category: src ? 'Accessories' : 'Custom', name: src ? src.id : `Typed line ${k}`, spec: '', unit,
      qty: r.chance(0.1) ? 0 : DISCRETE.has(unit) ? r.int(1, 12) : r2(r.num(0.5, 80)), unitPriceUsd: src ? src.approxPriceUsd : r2(r.num(0, 900)), totalUsd: 0, source: 'custom',
    })
  }
  if (r.chance(0.15)) for (let k = r.int(1, 2); k > 0; k--) pr.excludedIds.push(r.pick([...lineIdPool, ...pr.customItems.map((c) => c.id)]))
  p.pricing = pr
  return { i, p, book, kind, fractionalQtyIds }
}

// ====================================================================================================== invariants
type Bucket = { count: number; examples: string[] }
class Violations {
  readonly buckets = new Map<string, Bucket>()
  readonly coverage = new Map<string, number>()
  assertions = 0
  add(cat: string, msg: string) {
    const b = this.buckets.get(cat) ?? { count: 0, examples: [] }
    b.count++; if (b.examples.length < (process.env.STRESS_DEBUG ? 40 : 4)) b.examples.push(msg)
    this.buckets.set(cat, b)
  }
  check(cond: boolean, cat: string, msg: () => string) { this.assertions++; if (!cond) this.add(cat, msg()) }
  get(cat: string): string[] { return this.buckets.get(cat)?.examples ?? [] }
  /** Examples of every bucket whose name starts with `prefix` (e.g. 'check-step-mode:size'). */
  prefixed(prefix: string): string[] { return [...this.buckets.entries()].filter(([k]) => k.startsWith(prefix)).flatMap(([k, b]) => b.examples.map((e) => `${k}: ${e}`)) }
  seen(what: string, cond = true) { if (cond) this.coverage.set(what, (this.coverage.get(what) ?? 0) + 1) }
}

const checkOf = (r: Results, id: string) => r.checks.find((c) => c.id === id)
/** Float slack for amounts of this size: roundTo() works on 15 significant digits (quote.ts), so amounts above ~10^13 minor units
 *  cannot be exact to the minor unit; below that the slack is far under half a minor unit. */
const slack = (x: number) => Math.abs(x) * 1e-14 + 1e-9
const onGrid = (x: number, q: Quote) => { const y = x * 10 ** q.decimals; return Math.abs(y - Math.round(y)) <= slack(y) * 4 }

function checkCase(c: Case, r: Results, q: Quote, V: Violations) {
  const { p, book, i } = c
  const tag = `#${i} (${c.kind}, ${p.design.systemType})`
  const res = resolveCatalog(book)
  const mode = (p.mode ?? 'design') as ProjectMode
  const isGT = p.design.systemType === 'gridtie'
  const u = 10 ** -q.decimals
  const pr = p.pricing
  V.seen(`mode:${mode}`); V.seen(`decimals:${q.decimals}`); V.seen('book', !!book); V.seen('own-product-used', [r.panel.id, r.inverter?.id, r.battery?.id, r.controller?.id].some((x) => x?.startsWith('my-')))

  // 1. no non-finite number anywhere; every BOM qty / price is a non-negative number
  const bad = [...nonFinite(r, 'r'), ...nonFinite(q, 'q')]
  V.check(bad.length === 0, 'finite', () => `${tag} ${bad.slice(0, 4).join(' ')}`)
  for (const b of badLines(r)) V.add('bom-negative', `${tag} ${b.id} qty ${b.qty} price ${b.unitPriceUsd}`)
  V.assertions += r.bom.length

  // 2. money chain (§15.10): lines foot to the subtotal, total = subtotal − discount + VAT, Results.totalUsd × fx = quote.total
  const eff = effectivePercents(pr)
  const sumSell = q.lines.reduce((a, l) => a + l.totalSell, 0)
  const sumCost = q.lines.reduce((a, l) => a + l.totalCost, 0)
  V.check(Math.abs(sumSell - q.sellSubtotal) <= u / 2 + slack(sumSell), 'sum-lines', () => `${tag} Σ sell ${sumSell} vs ${q.sellSubtotal}`)
  V.check(Math.abs(sumCost - q.costSubtotal) <= u / 2 + slack(sumCost), 'sum-lines', () => `${tag} Σ cost ${sumCost} vs ${q.costSubtotal}`)
  V.check(Math.abs(q.sellSubtotal - q.discount + q.vat - q.total) <= u / 2 + slack(q.sellSubtotal + q.vat), 'total-chain', () => `${tag} ${q.sellSubtotal} − ${q.discount} + ${q.vat} ≠ ${q.total}`)
  V.check(Math.abs(q.discount - (q.sellSubtotal * eff.discountPct) / 100) <= u / 2 + slack(q.sellSubtotal), 'total-chain', () => `${tag} discount ${q.discount}`)
  V.check(Math.abs(q.vat - ((q.sellSubtotal - q.discount) * eff.vatPct) / 100) <= u / 2 + slack(q.sellSubtotal), 'total-chain', () => `${tag} vat ${q.vat}`)
  V.check(q.total >= 0, 'total-chain', () => `${tag} total ${q.total} < 0`)
  for (const x of [q.total, q.sellSubtotal, q.costSubtotal, q.discount, q.vat, ...q.lines.flatMap((l) => [l.unitCost, l.unitSell, l.totalCost, l.totalSell])])
    V.check(onGrid(x, q), 'minor-unit', () => `${tag} ${x} not a multiple of ${u} (${q.currency})`)
  V.check(Math.abs(r.totalUsd * q.fx - q.total) <= u / 2 + slack(q.total), 'usd-total', () => `${tag} totalUsd ${r.totalUsd} × ${q.fx} ≠ ${q.total}`)
  V.check(Math.abs(r.subtotalUsd - r.equipmentCostUsd - r.labourUsd) * q.fx <= u + slack(q.costSubtotal), 'usd-total', () => `${tag} subtotal ≠ equipment + services`)
  V.check(q.lines.length === r.bom.length && q.lines.every((l, k) => l.id === r.bom[k].id), 'quote-lines', () => `${tag} quote lines ≠ BOM`)
  r.bom.forEach((b, k) => V.check(Math.abs(b.totalUsd * q.fx - q.lines[k]?.totalCost) <= u / 2 + slack(q.lines[k]?.totalCost ?? 0), 'usd-total', () => `${tag} line ${b.id} ${b.totalUsd} × fx ≠ ${q.lines[k]?.totalCost}`))
  // §15.1: out-of-range markup / discount / VAT is clamped *and reported*, in every mode
  const clamped = eff.markupPct !== pr.marginPct || eff.discountPct !== pr.discountPct || eff.vatPct !== pr.vatPct
  if (clamped) V.check(checkOf(r, 'pricing-input')?.level === 'warn', mode === 'items' ? 'D-items-pricing-input' : 'pricing-input', () => `${tag} markup ${pr.marginPct} / discount ${pr.discountPct} / VAT ${pr.vatPct} clamped silently`)

  // 3. discrete auto lines are whole units (§15.10)
  for (const b of r.bom) if (b.source === 'auto' && DISCRETE.has(b.unit))
    V.check(Number.isInteger(b.qty), c.fractionalQtyIds.has(b.id) ? 'D-fractional-override' : 'discrete-integer', () => `${tag} ${b.id} ${b.qty} ${b.unit}`)

  // 4. checks: message, Arabic text, a wizard step; non-ok checks point to a step of this mode (others lose their "Fix in …" link)
  for (const ch of r.checks) {
    V.check(typeof ch.message === 'string' && ch.message.length > 0 && ARABIC.test(ch.messageAr ?? '') && (STEPS as readonly string[]).includes(ch.step ?? ''), 'check-shape', () => `${tag} ${ch.id} step=${ch.step}`)
    if (ch.level !== 'ok') V.check(MODE_STEPS[mode].includes(ch.step!), `check-step-mode:${mode}:${ch.id}`, () => `${tag} ${ch.id} → ${ch.step}`)
  }
  V.check(!checkOf(r, 'all-ok') || r.checks.every((x) => x.level === 'ok'), 'all-ok', () => `${tag} all-ok next to a warning`)

  if (mode === 'items') {
    // 5. items mode (§16.5): every engineering figure 0, BOM = non-excluded custom lines in order
    const zeros: (keyof Results)[] = ['dailyWh', 'dayWh', 'nightWh', 'criticalWh', 'peakW', 'surgeW', 'connectedW', 'monthlyKwh', 'annualKwh', 'maxUnitW', 'sizingPeakW', 'sizingSurgeW', 'phaseMaxW',
      'requiredPvKwp', 'panelQty', 'arrayKwp', 'arrayAreaM2', 'arrayWeightKg', 'tiltedPsh', 'annualProductionKwh', 'specificYield', 'footprintM2', 'batteryRequiredKwh', 'batteryQty', 'batteryKwh',
      'batteryUsableKwh', 'batteryAh', 'batteryHoursBackup', 'dod', 'batteryDailyWh', 'autonomyDays', 'requiredInverterKw', 'inverterQty', 'inverterTotalKw', 'dcAcRatio', 'controllerQty',
      'requiredControllerA', 'costPerWp', 'annualSavingsUsd', 'lcoeUsdPerKwh', 'co2TonsPerYear', 'lifetimeProductionKwh', 'usefulEnergyKwh', 'lifetimeUsefulKwh', 'omUsdPerYear', 'npvUsd', 'avoidedCostUsdPerKwh']
    for (const k of zeros) V.check(r[k] === 0, 'items-zero', () => `${tag} ${k}=${String(r[k])}`)
    V.check(r.monthlyProductionKwh.every((x) => x === 0) && r.strings === null && r.inverter === null && r.battery === null && r.controller === null && r.generatorKva === null
      && r.cableSchedule.length === 0 && r.replacements.length === 0 && r.paybackYears === null && r.roi25Pct === null, 'items-zero', () => `${tag} non-empty engineering output`)
    const expected = pr.customItems.filter((x) => !pr.excludedIds.includes(x.id)).map((x) => x.id)
    V.check(same(r.bom.map((b) => b.id), expected) && r.bom.every((b) => b.source === 'custom'), 'items-bom', () => `${tag} bom ${r.bom.map((b) => b.id)} vs ${expected}`)
    return
  }

  // 6. price precedence (§16.6): project BOM override > company price > catalogue price
  for (const b of r.bom) {
    if (b.source !== 'auto' || ['labour', 'transport', 'commissioning', 'generator'].includes(b.id) || b.spec.startsWith('not in catalogue')) continue
    const listed = book && Number.isFinite(book.prices[b.id]) && book.prices[b.id] >= 0 ? book.prices[b.id] : res.basePrice.get(b.id)
    V.check(b.unitPriceUsd === (pr.priceOverrides[b.id] ?? listed), 'price-precedence', () => `${tag} ${b.id} ${b.unitPriceUsd} ≠ ${pr.priceOverrides[b.id] ?? listed}`)
  }

  // 7. main equipment: quoted qty = design qty − existing (never negative); overrides of 0 keep a 0 line (§15.10, §16.3)
  const ex = (p.sizing ?? defaultSizing()).existing
  V.seen('existing', ex.panels + ex.batteries + ex.inverters > 0)
  const mains: [string | undefined, number, number][] = [
    [r.panelQty > 0 ? r.panel.id : undefined, r.panelQty, ex.panels], [r.inverter?.id, r.inverter ? r.inverterQty : 0, ex.inverters],
    [r.battery?.id, r.batteryQty, ex.batteries], [r.controller?.id, r.controllerQty, 0],
  ]
  for (const [id, design, exN] of mains) {
    if (!id || pr.excludedIds.includes(id)) continue
    const ov = pr.qtyOverrides[id]
    const line = r.bom.find((b) => b.id === id)
    const want = ov === 0 ? 0 : Math.max(0, design - Math.min(exN, design))
    // fully existing equipment stays listed at qty 0 with its existingQty (shown as "already on site")
    V.check((line?.qty ?? 0) === want && (want > 0 || ov != null || !line || (line.existingQty ?? 0) > 0), 'main-qty', () => `${tag} ${id} design ${design} existing ${exN} → quoted ${line?.qty} (want ${want})`)
    if (line) V.check((line.existingQty ?? 0) === Math.min(exN, design), 'main-qty', () => `${tag} ${id} existingQty ${line.existingQty}`)
  }
  V.check((ex.panels + ex.batteries + ex.inverters > 0) === !!checkOf(r, 'existing'), 'existing-note', () => `${tag} existing note`)

  // 8. no panels ⇒ no strings, no mounting / PV DC lines, no production, no payback (§16.2 backup only)
  if (r.panelQty === 0) {
    V.seen('no-panels')
    const stray = r.bom.filter((b) => (MOUNTING.has(b.id) || isPvDc(b.id) || b.id === r.panel.id) && b.qty > 0 && pr.qtyOverrides[b.id] == null)
    V.check(r.strings === null && stray.length === 0 && r.annualProductionKwh === 0 && r.arrayKwp === 0 && r.paybackYears === null && !r.cableSchedule.some((x) => x.id === 'pv-string'),
      'no-panels', () => `${tag} strings=${!!r.strings} stray=${stray.map((b) => b.id)} prod=${r.annualProductionKwh} payback=${r.paybackYears}`)
  }

  // 9. demand sources and fixed sizes (§16.1, §16.2)
  const sz = p.sizing ?? defaultSizing()
  if (mode === 'size') V.check(r.demand === 'none' && r.dailyWh === 0, 'demand', () => `${tag} size mode has demand ${r.demand}`)
  if (mode === 'design' && sz.demand === 'bill') V.check(Math.abs(r.dailyWh - (sz.bill.monthlyKwh * 1000) / 30.4) < 1e-6, 'demand', () => `${tag} bill ${sz.bill.monthlyKwh} → ${r.dailyWh}`)
  const panelFixed = (pr.qtyOverrides[r.panel.id] != null && pr.qtyOverrides[r.panel.id] >= 1) || p.design.panelOverrideQty != null
  if (sz.targets.pvKwp != null && sz.targets.pvKwp > 0 && !panelFixed) V.check(r.arrayKwp >= sz.targets.pvKwp - 1e-9, 'target-pv', () => `${tag} array ${r.arrayKwp} < target ${sz.targets.pvKwp}`)
  const battFixed = !!r.battery && ((pr.qtyOverrides[r.battery.id] != null && pr.qtyOverrides[r.battery.id] >= 1) || p.design.batteryOverrideQty != null)
  if (!isGT && r.battery && sz.targets.batteryKwh != null && sz.targets.batteryKwh > 0 && !battFixed) V.check(r.batteryKwh >= sz.targets.batteryKwh - 1e-9, 'target-batt', () => `${tag} bank ${r.batteryKwh} < target ${sz.targets.batteryKwh}`)
  const invAuto = !p.design.inverterId || !res.inverters.some((x) => x.id === p.design.inverterId)
  if (sz.targets.inverterKw && r.inverter && invAuto && pr.qtyOverrides[r.inverter.id] == null)
    V.check(r.inverterTotalKw >= sz.targets.inverterKw * 0.999 || r.checks.some((x) => x.level === 'error' && (x.id === 'inv-small' || x.id === 'inv-parallel')), 'target-inv', () => `${tag} inverter ${r.inverterTotalKw} kW < target ${sz.targets.inverterKw}`)
  if (mode === 'size' && r.annualProductionKwh > 0) V.check(checkOf(r, 'savings-assumed')?.level === 'ok', 'demand', () => `${tag} no savings-assumed note`)

  // 10. company stock list (§16.6): hidden products are never auto-selected unless the whole family is hidden
  const d = p.design
  const inCat = <T extends { id: string }>(xs: T[], id: string | null | undefined) => !!id && xs.some((x) => x.id === id)
  const autoPanel = d.panelId === 'auto' || !inCat(res.panels, d.panelId)
  const autoInv = !d.inverterId || !inCat(res.inverters, d.inverterId)
  const autoBat = d.batteryId === 'auto'
  const autoCc = !d.chargeControllerId || !inCat(res.chargeControllers, d.chargeControllerId)
  const notHidden = (fam: 'panels' | 'batteries' | 'inverters' | 'chargeControllers', id: string | undefined) => {
    V.seen(`hidden-family-fallback:${fam}`, !!id && res.avail[fam].length === 0)
    V.seen(`hidden-partial:${fam}`, !!id && res.avail[fam].length > 0 && res.avail[fam].length < res[fam].length)
    return !id || res.avail[fam].length === 0 || !res.hidden.has(id)
  }
  V.check(!autoPanel || notHidden('panels', r.panel.id), 'hidden-auto', () => `${tag} auto panel ${r.panel.id} is hidden`)
  V.check(!autoInv || notHidden('inverters', r.inverter?.id), 'hidden-auto', () => `${tag} auto inverter ${r.inverter?.id} is hidden`)
  V.check(!autoBat || notHidden('batteries', r.battery?.id), 'hidden-auto', () => `${tag} auto battery ${r.battery?.id} is hidden`)
  V.check(!autoCc || notHidden('chargeControllers', r.controller?.id), 'hidden-auto', () => `${tag} auto controller ${r.controller?.id} is hidden`)

  // 11. manual picks are kept; a hidden manual pick carries a `not-stocked-<id>` warning
  const notStocked = (id: string) => checkOf(r, `not-stocked-${id}`)?.level === 'warn'
  if (!autoPanel) {
    V.check(r.panel.id === d.panelId, 'manual-kept', () => `${tag} panel ${d.panelId} → ${r.panel.id}`)
    if (res.hidden.has(d.panelId)) { V.seen('hidden-manual'); V.check(notStocked(d.panelId), 'not-stocked', () => `${tag} panel ${d.panelId}`) }
  }
  if (!autoInv) {
    V.check(r.inverter?.id === d.inverterId, 'manual-kept', () => `${tag} inverter ${d.inverterId} → ${r.inverter?.id}`)
    if (res.hidden.has(d.inverterId!)) { V.seen('hidden-manual'); V.check(notStocked(d.inverterId!), 'not-stocked', () => `${tag} inverter ${d.inverterId}`) }
  }
  if (!isGT && d.batteryId && d.batteryId !== 'auto' && inCat(res.batteries, d.batteryId)) {
    if (r.battery) V.check(r.battery.id === d.batteryId, 'manual-kept', () => `${tag} battery ${d.batteryId} → ${r.battery?.id}`)
    if (res.hidden.has(d.batteryId)) { V.seen('hidden-manual'); V.check(notStocked(d.batteryId), 'not-stocked', () => `${tag} battery ${d.batteryId}`) }
  }
  if (!autoCc && r.controller) {
    V.check(r.controller.id === d.chargeControllerId, 'manual-kept', () => `${tag} controller ${d.chargeControllerId} → ${r.controller?.id}`)
    if (res.hidden.has(d.chargeControllerId!)) V.check(notStocked(d.chargeControllerId!), 'D-cc-not-stocked', () => `${tag} hidden manual controller ${d.chargeControllerId}`)
  }

  // 12. unknown ids raise `unknown-*` errors (never a silent swap)
  const unk = (what: string) => checkOf(r, `unknown-${what}`)?.level === 'error'
  const flag = (what: string, cond: boolean) => { if (cond) { V.seen('unknown-id'); V.check(unk(what), 'unknown-id', () => `${tag} ${what} id not flagged`) } }
  flag('panel', d.panelId !== 'auto' && !inCat(res.panels, d.panelId))
  flag('inverter', !!d.inverterId && !inCat(res.inverters, d.inverterId))
  flag('battery', !isGT && !!d.batteryId && d.batteryId !== 'auto' && !inCat(res.batteries, d.batteryId))
  flag('controller', !!d.chargeControllerId && !inCat(res.chargeControllers, d.chargeControllerId))
  // the unknown-* text says the planner "picked one automatically": it must not say so when nothing was picked
  const ub = checkOf(r, 'unknown-battery')
  if (ub) V.check(!!r.battery || !/picked one automatically/.test(ub.message), 'D-unknown-battery-text', () => `${tag} battery ${d.batteryId}: "${ub.message}" but no battery`)

  // 13. the BOM cable metres follow the cable schedule (the run lengths the design used, after the §15.1 guards)
  const lineQty = (id: string) => (pr.excludedIds.includes(id) || pr.qtyOverrides[id] != null ? null : r.bom.find((b) => b.id === id)?.qty ?? 0)
  const cores = p.design.phase === 3 ? 5 : 3
  // §16.3 upgrades quote wiring only for new parts: an all-existing array / inverter / bank (and its circuits) is not re-cabled
  const exq = resolveSizing(p).existing
  const allExisting = (qty: number, n: number) => qty > 0 && n >= qty
  const skip: Record<string, boolean> = {
    'pv-string': allExisting(r.panelQty, exq.panels),
    battery: allExisting(r.inverterQty, exq.inverters),
    ac: !!r.inverter && allExisting(r.inverterQty, exq.inverters),
  }
  for (const cb of r.cableSchedule) {
    if (skip[cb.id ?? '']) continue
    const runs = cb.parallelRuns ?? 1
    const [id, want] = cb.id === 'pv-string' ? [`dc-cable-${cb.sizeMm2}`, (r.strings?.strings ?? 0) * cb.lengthM * 2 * runs]
      : cb.id === 'battery' ? [`batt-cable-${cb.sizeMm2}`, 2 * cb.lengthM * runs * Math.max(0, r.inverterQty - Math.min(exq.inverters, r.inverterQty))]
        : cb.id === 'ac' ? [`ac-cable-${cb.sizeMm2}`, cb.lengthM * cores * runs] : ['', 0]
    if (!id) continue
    const got = lineQty(id)
    const raw = cb.id === 'pv-string' ? p.design.dcCableRunM : cb.id === 'battery' ? p.design.batteryCableRunM : p.design.acCableRunM
    if (got != null) V.check(got >= want - 0.01, raw === cb.lengthM ? 'bom-cable-run' : 'D-bom-cable-run', () => `${tag} ${cb.id}: schedule ${cb.lengthM} m → BOM ${id} ${got} m < ${r2(want)} m (design runs dc ${p.design.dcCableRunM} / batt ${p.design.batteryCableRunM} / ac ${p.design.acCableRunM})`)
  }

  // 14. internal consistency of the design figures and the economics (§3–§5, §10)
  const cons = (cond: boolean, what: string) => V.check(cond, 'consistency', () => `${tag} ${what}`)
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
  cons(close(r.arrayKwp, (r.panelQty * r.panel.watts) / 1000), `arrayKwp ${r.arrayKwp} ≠ ${r.panelQty} × ${r.panel.watts} W`)
  cons(!r.battery || close(r.batteryKwh, r.batteryQty * r.battery.energyKwh), `batteryKwh ${r.batteryKwh}`)
  cons(!r.inverter || close(r.inverterTotalKw, r.inverter.ratedAcKw * r.inverterQty), `inverterTotalKw ${r.inverterTotalKw}`)
  cons(close(r.annualProductionKwh, r.monthlyProductionKwh.reduce((a, x) => a + x, 0)) && r.monthlyProductionKwh.every((x) => x >= 0), 'monthly production')
  cons(r.usefulEnergyKwh <= r.annualProductionKwh + 1e-6 && r.annualSavingsUsd >= 0 && r.co2TonsPerYear >= 0, `useful ${r.usefulEnergyKwh} / production ${r.annualProductionKwh} / savings ${r.annualSavingsUsd}`)
  cons(r.paybackYears === null ? !(r.annualSavingsUsd > 0) : close(r.paybackYears, Math.max(0, r.totalUsd) / r.annualSavingsUsd), `payback ${r.paybackYears}`)
  cons(r.cumulativeCashflow.length === Math.round(p.design.analysisYears) + 1 && r.replacements.every((x) => x.year >= 1 && x.year < p.design.analysisYears), 'cash-flow years / replacement years')
  if (r.strings) {
    const fixedCount = (pr.qtyOverrides[r.panel.id] != null && pr.qtyOverrides[r.panel.id] >= 1) || p.design.panelOverrideQty != null
    cons(r.strings.totalPanels === r.panelQty || (fixedCount && checkOf(r, 'strings-count')?.level === 'warn'), `strings ${r.strings.strings} × ${r.strings.panelsPerString} vs ${r.panelQty} panels`)
    cons(r.strings.ok || checkOf(r, 'strings')?.level === 'warn', 'a failed string design is reported')
  }
  if (r.arrayKwp > 0) cons(close(r.costPerWp, r.totalUsd / (r.arrayKwp * 1000)), 'cost per Wp')

  // 15. protection never above the conductor; every BOM item exists unless its rating is flagged out of range (§15.8, §15.10)
  for (const cb of r.cableSchedule) if (cb.deviceStd) V.check((cb.ampacityA ?? 0) + 0.05 >= cb.breakerA, 'in-le-iz', () => `${tag} ${cb.id} I_n ${cb.breakerA} > I_z ${cb.ampacityA}`)
  if (r.checks.some((x) => x.id.startsWith('bom-missing'))) V.check(r.checks.some((x) => x.id.startsWith('breaker-range')), 'bom-missing', () => `${tag} ${r.checks.filter((x) => x.id.startsWith('bom-missing')).map((x) => x.id)}`)
}

// ====================================================================================================== 1. property fuzz
const N_FUZZ = Number(process.env.STRESS_N ?? 5000)
const V = new Violations()
let fuzzRan = 0
const cases: Case[] = []
const computed: Results[] = []
beforeAll(() => {
  for (let i = 0; i < N_FUZZ; i++) {
    const c = genCase(i)
    const before = JSON.stringify(c.p)
    const frozenP = deepFreeze(clone(c.p)), frozenB = c.book ? deepFreeze(clone(c.book)) : null
    let r1: Results, r2: Results, r3: Results
    try {
      r1 = computeProject(frozenP, frozenB) // frozen: any write to the input throws in strict mode
      r2 = computeProject(frozenP, frozenB)
      r3 = computeProject(clone(c.p), c.book ? clone(c.book) : null) // fresh objects: no stale price-list cache
    } catch (e) {
      V.add('throws', `#${i} ${(e as Error).message}`)
      continue
    }
    V.check(cat() === resolveCatalog(null), 'catalog-restored', () => `#${i} active catalogue not restored`)
    V.check(same(r1, r2) && same(r1, r3), 'deterministic', () => `#${i} two runs differ`)
    V.check(JSON.stringify(frozenP) === before, 'no-mutation', () => `#${i} project changed`)
    checkCase({ ...c, p: frozenP, book: frozenB }, r1, buildQuote(frozenP, r1), V)
    cases.push({ ...c, p: frozenP, book: frozenB }); computed.push(r1)
    fuzzRan++
  }
  if (process.env.STRESS_DEBUG) {
    console.log(`fuzz: ${fuzzRan} projects, ${V.assertions} assertions`)
    for (const [k, b] of [...V.buckets.entries()].sort((a, b) => b[1].count - a[1].count)) console.log(`${k}: ${b.count}\n   ${b.examples.join('\n   ')}`)
    console.log('coverage', JSON.stringify(Object.fromEntries(V.coverage)))
  }
}, 120_000)

describe(`1. property fuzz: ${N_FUZZ} seeded projects (modes, system types, buses, price lists, currencies, overrides)`, () => {
  it('every case computes without throwing, twice identically, without touching its (deep-frozen) input', () => {
    expect(fuzzRan).toBe(N_FUZZ)
    expect([...V.get('throws'), ...V.get('deterministic'), ...V.get('no-mutation'), ...V.get('catalog-restored')]).toEqual([])
  })
  it('the generator reaches every path it is meant to exercise', () => {
    const cov = (k: string) => V.coverage.get(k) ?? 0
    for (const k of ['mode:design', 'mode:size', 'mode:items', 'decimals:0', 'decimals:2', 'decimals:3', 'book', 'own-product-used', 'existing', 'no-panels', 'unknown-id', 'hidden-manual',
      'hidden-family-fallback:panels', 'hidden-family-fallback:inverters', 'hidden-family-fallback:batteries', 'hidden-partial:panels', 'hidden-partial:inverters', 'hidden-partial:batteries'])
      expect(cov(k), k).toBeGreaterThanOrEqual(20)
    expect(V.assertions).toBeGreaterThan(1_000_000)
  })
  const inv: [string, string][] = [
    ['finite', 'no NaN / Infinity anywhere in Results or the quote'],
    ['bom-negative', 'no BOM line with a negative (or non-numeric) qty or price'],
    ['sum-lines', 'Σ line totals = subtotal (sell and cost)'],
    ['total-chain', 'total = subtotal − discount + VAT, each rounded to the minor unit'],
    ['minor-unit', 'every quote amount is a whole number of minor units (IQD 0, USD 2, KWD 3 decimals)'],
    ['usd-total', 'Results.totalUsd × fx = quote.total and every BOM line × fx = its quote line'],
    ['quote-lines', 'the quote lists exactly the BOM lines'],
    ['pricing-input', 'clamped markup / discount / VAT raise `pricing-input` (design and size modes)'],
    ['discrete-integer', 'discrete auto lines (pcs, pair, kit, lot) are whole numbers'],
    ['check-shape', 'every check has a message, Arabic text and a wizard step'],
    ['all-ok', '`all-ok` only when nothing else is raised'],
    ['items-zero', 'items mode: every engineering figure is 0'],
    ['items-bom', 'items mode: BOM = the non-excluded custom lines'],
    ['price-precedence', 'BOM price = project override > company price > catalogue price'],
    ['main-qty', 'quoted main-equipment qty = design qty − existing, never negative'],
    ['existing-note', 'existing equipment is noted'],
    ['no-panels', 'no panels ⇒ no strings, mounting or PV DC lines, no production, no payback'],
    ['demand', 'size mode has no demand; bill demand = monthly kWh / 30.4'],
    ['target-pv', 'a fixed kWp is met (rounded up)'],
    ['target-batt', 'a fixed battery kWh is met (rounded up)'],
    ['target-inv', 'a fixed inverter kW is met or flagged'],
    ['hidden-auto', 'hidden products are never auto-selected unless the whole family is hidden'],
    ['manual-kept', 'manual picks are kept'],
    ['not-stocked', 'a hidden manual panel / inverter / battery keeps the pick with a `not-stocked-*` warning'],
    ['unknown-id', 'unknown product ids raise `unknown-*` errors'],
    ['in-le-iz', 'I_n ≤ I_z on every circuit'],
    ['bom-cable-run', 'BOM cable metres cover the cable schedule (runs inside the §15.1 range)'],
    ['consistency', 'design figures and economics are internally consistent (kWp = n × W, kWh = n × unit, Σ months, useful ≤ production, payback = capex / savings, strings = panels)'],
    ['bom-missing', 'every BOM item exists unless its rating is flagged'],
  ]
  for (const [k, title] of inv) it(title, () => expect(V.get(k)).toEqual([]))
  it('design mode: every non-ok check points to a step of the full design', () => expect(V.prefixed('check-step-mode:design')).toEqual([]))
  it('items mode: every non-ok check points to a step of the product list', () => expect(V.prefixed('check-step-mode:items')).toEqual([]))

  // DEFECT (minor): the §15.1 guard clamps / defaults an out-of-range cable run for the design (cable schedule, voltage drop), but
  // buildBom reads the raw `p.design` runs, so the quote prices a different length than the design: an imported dcCableRunM of 0
  // is designed as 20 m and quoted as 0 m of string cable (−5 m likewise; 20,000 m is designed at 10,000 m and quoted at 20,000 m).
  // src/engine/bom.ts:57 (`const { design: d, site: s } = p`) — pass the guarded design (computeCore's `d`) in the BomCtx.
  it('DEFECT: BOM cable metres follow the guarded cable runs of the design', () => expect(V.get('D-bom-cable-run')).toEqual([]))
  // DEFECT (minor): a qty typed with decimals on a discrete BOM line (the BOM qty field is not integer-only) is quoted as is,
  // e.g. `qtyOverrides: { 'mid-clamp': 9.5 }` → "9.5 pcs" on the quotation. §15.10 says discrete units are whole numbers.
  // src/engine/bom.ts:213 (`const q = hasOv && (!main.has(x.id) || ov === 0) ? ov : computed`) — ceil `ov` for DISCRETE units.
  it('DEFECT: a fractional qty override on a discrete line is rounded up to whole units', () => expect(V.get('D-fractional-override')).toEqual([]))
  // DEFECT (minor): a hidden (not stocked) charge controller picked by hand gets no `not-stocked-*` warning — §16.6 promises it for
  // every manual pick. src/engine/compute.ts:788 only lists [panelPick, manualInverter, manualBattery]; add the manual controller.
  it('DEFECT: a hidden manual charge controller carries a `not-stocked-*` warning', () => expect(V.get('D-cc-not-stocked')).toEqual([]))
  // DEFECT (minor): in items mode an out-of-range markup / discount / VAT is clamped silently (120 % discount → total 0 and
  // "Quote is complete."); design / size raise `pricing-input` (§15.1). src/engine/compute.ts:855 computeItems has no pricing guard.
  it('DEFECT: items mode reports clamped markup / discount / VAT (`pricing-input`)', () => expect(V.get('D-items-pricing-input')).toEqual([]))
  // DEFECT (minor): size mode has no load list, yet a manual coincidence factor outside 0.1–1 raises `df` (step 'loads', which the
  // size wizard does not have — the warning cannot be fixed there). src/engine/compute.ts:375 — skip it unless demand = 'loads'.
  it('DEFECT: size mode: every non-ok check points to a step of the known-size wizard', () => expect(V.prefixed('check-step-mode:size')).toEqual([]))
  // DEFECT (minor): an unknown battery id leaves the project without a battery (not auto-picked, unlike panel / inverter / controller),
  // but `unknown-battery` says "the planner picked one automatically". src/engine/compute.ts:428/441 — word it per family or auto-pick.
  it('DEFECT: the `unknown-battery` message does not claim an automatic pick when no battery was picked', () => expect(V.get('D-unknown-battery-text')).toEqual([]))
})

// ====================================================================================================== minimal repros of the engine defects
/** 5 kWp · 5 kW · 10 kWh hybrid known-size quote in Khartoum, USD, markup 20 %, no VAT (modeDefaults('size')). */
const sizedHybrid = (f?: (p: Project) => void) => {
  const p = newProject({ id: 'repro', name: 'repro', ...modeDefaults('size', 'hybrid') })
  p.design = defaultDesign('hybrid'); p.site = siteFromLocation('khartoum'); p.pricing = defaultPricing(20, 0)
  f?.(p)
  return p
}
describe('minimal repros of the engine defects found by the fuzz (each DEFECT above, one project)', () => {
  it('DEFECT repro: existing panels 8 → 9 (of 9) must not raise the total (labour switches to per inverter kW)', () => {
    const at = (n: number) => computeProject(sizedHybrid((p) => { p.sizing!.existing = { panels: n, batteries: 0, inverters: 0 } }))
    expect(at(9).panelQty).toBe(9)
    expect(at(9).totalUsd).toBeLessThanOrEqual(at(8).totalUsd)
  })
  it('DEFECT repro: qtyOverrides { "mid-clamp": 9.5 } is quoted as 9.5 pcs', () => {
    const p = sizedHybrid((q) => { q.pricing.qtyOverrides = { 'mid-clamp': 9.5 } })
    expect(Number.isInteger(computeProject(p).bom.find((b) => b.id === 'mid-clamp')!.qty)).toBe(true)
  })
  it('DEFECT repro: a hidden manual charge controller gets no `not-stocked-*` warning', () => {
    const p = sizedHybrid((q) => { q.design = { ...defaultDesign('offgrid'), useSeparateController: true, chargeControllerId: 'cc-victron-250-100' } })
    const book = emptyPriceBook(); book.hidden.push('cc-victron-250-100')
    const r = computeProject(p, book)
    expect(r.controller?.id).toBe('cc-victron-250-100')
    expect(checkOf(r, 'not-stocked-cc-victron-250-100')?.level).toBe('warn')
  })
  it('DEFECT repro: items mode with a 120 % discount → total 0 and "Quote is complete." (no `pricing-input`)', () => {
    const p = newProject({ id: 'repro', ...modeDefaults('items') })
    p.pricing = { ...defaultPricing(20, 0), discountPct: 120, customItems: [{ id: 'a', category: 'Custom', name: 'Panel', spec: '', unit: 'pcs', qty: 2, unitPriceUsd: 100, totalUsd: 0, source: 'custom' }] }
    const r = computeProject(p)
    expect(buildQuote(p, r).total).toBe(0)
    expect(checkOf(r, 'pricing-input')?.level).toBe('warn')
  })
  it('DEFECT repro: size mode with a manual coincidence factor 1.5 raises `df` on the loads step the size wizard does not have', () => {
    const r = computeProject(sizedHybrid((p) => { p.design.coincidenceAuto = false; p.design.coincidenceFactor = 1.5 }))
    expect(r.checks.filter((c) => c.level !== 'ok' && !MODE_STEPS.size.includes(c.step!)).map((c) => c.id)).toEqual([])
  })
  it('fixed: batteryId "deleted-battery" → the automatic battery is used (like panels / inverters) and `unknown-battery` says so', () => {
    const r = computeProject(sizedHybrid((p) => { p.design.batteryId = 'deleted-battery' }))
    expect(r.battery).not.toBeNull()
    expect(checkOf(r, 'unknown-battery')!.level).toBe('error')
    expect(checkOf(r, 'unknown-battery')!.message).toMatch(/automatic choice/)
  })
  it('DEFECT repro: dcCableRunM 0 is designed as 20 m (§15.1) but quoted as 0 m of string cable', () => {
    const r = computeProject(sizedHybrid((p) => { p.design.dcCableRunM = 0 }))
    const pv = r.cableSchedule.find((c) => c.id === 'pv-string')!
    expect(pv.lengthM).toBe(20)
    expect(r.bom.find((b) => b.id === `dc-cable-${pv.sizeMm2}`)?.qty ?? 0).toBeGreaterThanOrEqual(r.strings!.strings * 20 * 2)
  })
})

// ====================================================================================================== 2. monotonicity / sanity
describe('2. monotonicity and sanity', () => {
  const N_PAIRS = Number(process.env.STRESS_PAIRS ?? 300)
  it(`raising a bill's monthly kWh never lowers the array (${N_PAIRS} pairs)`, () => {
    const bad: string[] = []
    for (let i = 0; i < N_PAIRS; i++) {
      const c = genCase(i, { kind: 'design-bill', salt: 11 })
      const p = c.p
      p.design.panelOverrideQty = null; p.pricing.qtyOverrides = {}; p.sizing!.targets = { pvKwp: null, batteryKwh: null, inverterKw: null }
      const r = rngFor(seedOf(i, 12))
      const a = r.int(50, 4000), b = a + r.int(1, 1500)
      const at = (kwh: number) => computeProject({ ...p, sizing: { ...p.sizing!, bill: { ...p.sizing!.bill, monthlyKwh: kwh } } }, c.book)
      const ra = at(a), rb = at(b)
      expect(rb.requiredPvKwp).toBeGreaterThanOrEqual(ra.requiredPvKwp)
      // §7: the installed array always covers the requirement; equal-string rounding may land a higher demand on a layout one or two
      // panels smaller than the lower demand's (e.g. 16 × 6 = 96 vs 19 × 5 = 95), so compare against the requirement, not the other array
      const oneString = rb.strings ? (rb.strings.panelsPerString * rb.panel.watts) / 1000 : 0
      if (rb.arrayKwp < rb.requiredPvKwp - 1e-9 && !rb.checks.some((x) => x.id === 'strings')) bad.push(`#${i} array ${rb.arrayKwp} below required ${rb.requiredPvKwp}`)
      if (rb.arrayKwp < ra.arrayKwp - Math.max(oneString, (rb.panel.watts / 1000) * 2) - 1e-9) bad.push(`#${i} ${a} → ${b} kWh/month: array ${ra.arrayKwp} (${ra.panelQty} × ${ra.panel.id}, ${ra.inverter?.id}) → ${rb.arrayKwp} (${rb.panelQty} × ${rb.panel.id}, ${rb.inverter?.id})`)
    }
    expect(bad).toEqual([])
  })
  it(`raising a fixed battery kWh never lowers the bank (${N_PAIRS} pairs)`, () => {
    const bad: string[] = []
    for (let i = 0; i < N_PAIRS; i++) {
      const c = genCase(i, { kind: 'size', type: rngFor(seedOf(i, 21)).pick(['offgrid', 'hybrid'] as const), salt: 22 })
      const p = c.p
      p.design.batteryOverrideQty = null; p.pricing.qtyOverrides = {}
      const r = rngFor(seedOf(i, 23))
      const a = r2(r.num(1, 150)), b = r2(a + r.num(0.01, 60))
      const at = (kwh: number) => computeProject({ ...p, sizing: { ...p.sizing!, targets: { ...p.sizing!.targets, batteryKwh: kwh } } }, c.book)
      const ra = at(a), rb = at(b)
      if (rb.batteryKwh < ra.batteryKwh - 1e-9) bad.push(`#${i} ${a} → ${b} kWh: bank ${ra.batteryKwh} (${ra.batteryQty} × ${ra.battery?.id}) → ${rb.batteryKwh} (${rb.batteryQty} × ${rb.battery?.id})`)
    }
    expect(bad).toEqual([])
  })
  // Adding existing panels / batteries / inverters may only lower the quote. Compared on the sell subtotal without the rail-splice
  // line: §9 counts splices as ceil(total rail / 4.2 m) − 2 × rows with rows = ceil(N / 10), which is not monotone in N by design
  // (42 → 40 new panels: 5 → 4 rows, 14 → 15 splices) — a documented approximation, not a defect.
  const existingRuns = (labour: boolean) => {
    const bad: string[] = []
    for (let i = 0; i < N_PAIRS; i++) {
      const c = genCase(i, { kind: rngFor(seedOf(i, 31)).pick(['design-loads', 'design-bill', 'size'] as const), salt: 32 })
      const p: Project = labour ? c.p : { ...c.p, pricing: { ...c.p.pricing, labourPerKwUsd: 0 } }
      const none = { panels: 0, batteries: 0, inverters: 0 }
      const at = (ex: typeof none) => {
        const pp = { ...p, sizing: { ...p.sizing!, existing: ex } }
        const res = computeProject(pp, c.book), q = buildQuote(pp, res)
        const lab = res.bom.find((x) => x.id === 'labour')
        return { sub: q.sellSubtotal - (q.lines.find((l) => l.id === 'rail-splice')?.totalSell ?? 0), res, lab: lab ? `${lab.qty} ${lab.unit}` : '–' }
      }
      const base = at(none)
      const r = rngFor(seedOf(i, 33))
      let prev = base, ex = none
      for (let step = 0; step < 6; step++) {
        const what = r.pick(['panels', 'batteries', 'inverters'] as const)
        const lim = what === 'panels' ? base.res.panelQty : what === 'batteries' ? base.res.batteryQty : base.res.inverterQty
        ex = { ...ex, [what]: Math.min(lim + 1, ex[what] + r.int(1, Math.max(1, Math.ceil(lim / 2)))) }
        const cur = at(ex)
        if (cur.sub > prev.sub + 1e-6 * Math.max(1, prev.sub)) { bad.push(`#${i} existing ${JSON.stringify(ex)}: subtotal ${r2(prev.sub)} → ${r2(cur.sub)}, labour ${prev.lab} → ${cur.lab}`); break }
        prev = cur
      }
    }
    return bad
  }
  it(`adding existing units never raises the quote when labour is not charged (${N_PAIRS} sequences)`, () => expect(existingRuns(false)).toEqual([]))
  // DEFECT (major): when the last panel of an expansion becomes "existing", installation labour switches from per new kWp to per
  // inverter kW (bom.ts:196 `labourKw = N > 0 ? newKwp : newInvKw …`), so declaring one more panel as already on site *raises* the
  // quote: 5 kWp / 5 kW / 10 kWh hybrid size-mode quote, existing panels 8 → 9 of 9: labour 0.58 kWp → 6 kW, total $4,146 → $4,747.
  // While new panels remain, a new inverter costs no labour at all. Fix: labour on max(new kWp, new inverter kW) (or their sum).
  it(`DEFECT: adding existing units never raises the quote (${N_PAIRS} sequences, labour charged)`, () => expect(existingRuns(true)).toEqual([]))
  it(`raising outage hours (hybrid, diesel cost > tariff) never lowers the savings (${N_PAIRS} pairs)`, () => {
    for (let i = 0; i < N_PAIRS; i++) {
      const c = genCase(i, { kind: rngFor(seedOf(i, 41)).pick(['design-loads', 'design-bill', 'size'] as const), type: 'hybrid', salt: 42 })
      const r = rngFor(seedOf(i, 43))
      const tariff = r2(r.num(0, 0.4))
      const site = { ...c.p.site, gridTariff: tariff, dieselCostUsdPerKwh: r2(tariff + r.num(0.01, 1)) }
      const h1 = r.int(0, 23), h2 = r.int(h1 + 1, 24)
      const s1 = computeProject({ ...c.p, site: { ...site, outageHoursPerDay: h1 } }, c.book), s2 = computeProject({ ...c.p, site: { ...site, outageHoursPerDay: h2 } }, c.book)
      expect(s2.annualSavingsUsd, `#${i} ${h1} → ${h2} h`).toBeGreaterThanOrEqual(s1.annualSavingsUsd - 1e-9)
      expect(s2.avoidedCostUsdPerKwh).toBeGreaterThan(s1.avoidedCostUsdPerKwh)
    }
  })
  it(`a company price increase on the chosen inverter raises the total by qty × Δ × (1 + markup) × (1 − discount) × (1 + VAT) (${N_PAIRS} cases)`, () => {
    let tested = 0
    for (let i = 0; i < N_PAIRS * 2 && tested < N_PAIRS; i++) {
      const c = genCase(i, { kind: rngFor(seedOf(i, 51)).pick(['design-loads', 'design-bill', 'size'] as const), salt: 52 })
      const r0 = computeProject(c.p, c.book)
      if (!r0.inverter) continue
      const id = r0.inverter.id
      // pin the choice (a grid-tie auto-pick is the cheapest unit — a price change could switch it) and drop project-level overrides
      const pricing = { ...c.p.pricing, priceOverrides: { ...c.p.pricing.priceOverrides }, excludedIds: c.p.pricing.excludedIds.filter((x) => x !== id) }
      delete pricing.priceOverrides[id]
      const p: Project = { ...c.p, design: { ...c.p.design, inverterId: id, inverterQty: r0.inverterQty }, pricing }
      const book0 = c.book ? clone(c.book) : emptyPriceBook()
      const base = resolveCatalog(book0).basePrice.get(id)!
      const p0 = Number.isFinite(book0.prices[id]) ? book0.prices[id] : base
      const rnd = rngFor(seedOf(i, 53))
      const delta = r2(rnd.num(0.01, 3000))
      const ra = computeProject(p, { ...book0, prices: { ...book0.prices, [id]: p0 } }), rb = computeProject(p, { ...book0, prices: { ...book0.prices, [id]: r2(p0 + delta) } })
      const qa = buildQuote(p, ra), qb = buildQuote(p, rb)
      const n = ra.bom.find((b) => b.id === id)?.qty ?? 0
      const eff = effectivePercents(p.pricing)
      const k = (1 + eff.markupPct / 100) * (1 - eff.discountPct / 100) * (1 + eff.vatPct / 100)
      const exact = n * (r2(p0 + delta) - p0) * qa.fx * k
      // rounding: unit cost ±½u twice (× markup), unit sell ±½u twice (per unit), line / discount / VAT / total ±½u each
      const u = 10 ** -qa.decimals
      const tol = (n * (1 + eff.markupPct / 100 + 1) * (1 + eff.vatPct / 100) + 4) * u + slack(qb.total)
      expect(Math.abs(qb.total - qa.total - exact), `#${i} ${id} × ${n}, Δ ${delta} USD, ${qa.currency}`).toBeLessThanOrEqual(tol)
      if (exact > tol) expect(qb.total).toBeGreaterThan(qa.total) // (a tiny fx can round both totals to the same minor unit)
      tested++
    }
    expect(tested).toBe(N_PAIRS)
  })
})

// ====================================================================================================== 3. regression equivalence
const JINKO = 'pnl-jinko-580-neo72'
const fixtureSite = (city: string, psh: number, recordLowC: number, ambientHighC: number, ambientAvgC: number) =>
  ({ ...siteFromLocation(city), psh, monthlyPsh: Array(12).fill(psh), tiltGainFactor: 1, recordLowC, ambientHighC, ambientAvgC, shadingLossPct: 0, soilingLossPct: 3 })
const FL = (name: string, watts: number, qty: number, h: number, sf = 1, night = 100, phase: 1 | 3 = 1): LoadItem =>
  ({ id: name, name, category: 'x', watts, qty, hoursPerDay: h, surgeFactor: sf, nightSharePct: night, phase, critical: true })
/** §13 worked examples (a) off-grid Khartoum, (b) hybrid Riyadh, (c) 100 kW grid-tied — as built in tests/engine-review.test.ts. */
function fixtures(): Project[] {
  const a = newProject({ name: '§13 a' })
  a.site = fixtureSite('khartoum', 6.0, 5, 42, 36)
  a.design = { ...defaultDesign('offgrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 1, pvOversize: 1.2, panelId: JINKO, batteryId: 'bat-gen-48v100-rack', inverterId: null, generatorBackup: true, useSeparateController: true }
  a.loads = [FL('LED', 10, 5, 6), FL('Fan', 60, 2, 8, 1.5), FL('Fridge', 150, 1, 8, 4), FL('TV', 80, 1, 4), FL('Router', 10, 1, 22)]
  a.pricing = defaultPricing(0, 0)
  const b = newProject({ name: '§13 b' })
  b.site = fixtureSite('riyadh', 5.8, 0, 44, 34)
  b.design = { ...defaultDesign('hybrid'), systemVoltage: 48, autonomyDays: 1, coincidenceFactor: 0.8, pvOversize: 1.0, panelId: JINKO, batteryId: 'bat-gen-48v100-rack', inverterId: 'inv-deye-8k-sg01lp1', generatorBackup: true }
  b.loads = [FL('AC', 1300, 2, 6, 3, 60), FL('Fridge', 200, 1, 10, 4, 60), FL('Freezer', 150, 1, 8, 4, 60), FL('Washer', 500, 1, 1, 3, 60), FL('TV', 100, 1, 5, 1, 60), FL('LED', 10, 12, 6, 1, 60), FL('Fans', 70, 4, 8, 1.5, 60),
    FL('Router', 10, 1, 24, 1, 60), FL('Laptop', 60, 1, 4, 1, 60), FL('Pump', 400, 1, 1, 3, 60), FL('Microwave', 1200, 1, 0.3, 1.5, 60), FL('Kettle', 2000, 1, 0.25, 1, 60), FL('Misc', 100, 1, 5, 1, 60)]
  const c = newProject({ name: '§13 c' })
  c.site = fixtureSite('dubai', 5.5, 0, 42, 34)
  c.design = { ...defaultDesign('gridtie'), phase: 3, coincidenceFactor: 1, panelId: JINKO, batteryId: null, inverterId: 'inv-huawei-100ktl-m2' }
  c.loads = [FL('Plant', 22000, 1, 24, 1, 20, 3)]
  return [a, b, c]
}

describe('3. regression equivalence: samples and §13 fixtures compute identically without v0.2 fields, in design mode and with an empty price list', () => {
  for (const p of [...sampleProjects(), ...fixtures()]) {
    it(p.name, () => {
      const ref = computeProject(p)
      const legacy = { ...p } as Partial<Project>
      delete legacy.mode; delete legacy.sizing
      expect(computeProject(legacy as Project)).toEqual(ref)
      expect(computeProject({ ...p, mode: 'design', sizing: defaultSizing() })).toEqual(ref)
      expect(computeProject(p, emptyPriceBook())).toEqual(ref)
      expect(computeProject(p, null)).toEqual(ref)
      expect(buildQuote(legacy as Project, computeProject(legacy as Project))).toEqual(buildQuote(p, ref))
    })
  }
})

// ====================================================================================================== withPriceBook
describe('withPriceBook', () => {
  it('restores the default catalogue after a throw (also nested and from inside computeProject)', () => {
    const book = emptyPriceBook(); book.hidden.push(catalog.panels[0].id); book.prices[catalog.panels[1].id] = 1
    const def = resolveCatalog(null)
    expect(() => withPriceBook(book, () => { expect(cat()).toBe(resolveCatalog(book)); throw new Error('boom') })).toThrow('boom')
    expect(cat()).toBe(def)
    expect(() => withPriceBook(book, () => withPriceBook(emptyPriceBook(), () => { throw new Error('inner') }))).toThrow('inner')
    expect(cat()).toBe(def)
    expect(withPriceBook(book, () => withPriceBook(null, () => cat()))).toBe(def)
    expect(cat()).toBe(def)
    // a hostile project that makes computeProject throw (DEFECT, section 4) still leaves the default catalogue active
    const hostile = { ...sampleProjects()[0], loads: [null] } as unknown as Project
    try { computeProject(hostile, book) } catch { /* expected while the section 4 defect is open */ }
    expect(cat()).toBe(def)
  })
})

// ====================================================================================================== 4. store
const HOSTILE: unknown[] = [null, 'abc', '5', '', [], {}, [1, 2], { a: 1 }, true, false, -1, 0, -1e9, 1e308, -1e308, 5e-324, 'NaN', 'Infinity', '__proto__', 'constructor', 'toString', 'hasOwnProperty']
type Json = Record<string, unknown> | unknown[]
/** 1–4 hostile edits on a JSON tree: wrong types, deletions, `__proto__` / `constructor` keys, arrays where objects are expected. */
function mutate(r: Rng, root: Json): string[] {
  const edits: string[] = []
  for (let k = r.int(1, 4); k > 0; k--) {
    const slots: [Json, string | number, string][] = []
    const walk = (x: unknown, depth: number, path: string) => {
      if (!x || typeof x !== 'object' || depth > 6) return
      for (const key of Array.isArray(x) ? [...x.keys()] : Object.keys(x)) {
        const sub = `${path}${path ? '.' : ''}${key}`
        slots.push([x as Json, key, sub]); walk((x as Record<string | number, unknown>)[key], depth + 1, sub)
      }
    }
    walk(root, 0, '')
    if (!slots.length) break
    // a third of the edits hit the top two levels so whole sections (site, design, pricing, sizing, loads) get replaced too
    const top = slots.filter(([pp]) => pp === root || Object.values(root).includes(pp))
    const [parent, key, path] = r.chance(0.35) && top.length ? r.pick(top) : r.pick(slots)
    const obj = parent as Record<string | number, unknown>
    const op = r.next()
    if (op < 0.55) { obj[key] = clone(r.pick(HOSTILE)); edits.push(`${path}=${JSON.stringify(obj[key])}`) }
    else if (op < 0.7 && !Array.isArray(parent)) { delete obj[key]; edits.push(`delete ${path}`) }
    else if (op < 0.85) {
      const v = obj[key]
      const target = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : (obj as Record<string, unknown>)
      const pk = r.pick(['__proto__', 'constructor', 'prototype'])
      Object.defineProperty(target, pk, { value: r.pick([{ polluted: 1 }, { psh: 0, marginPct: -1 }, 'x', null, [1]]), enumerable: true, configurable: true, writable: true })
      edits.push(`${target === v ? path : path.replace(/\.?[^.]*$/, '')}.${pk}=…`)
    } else { obj[key] = Array.isArray(obj[key]) ? { 0: 'x' } : [obj[key]]; edits.push(`${path} reshaped`) }
  }
  return edits
}

describe('4. store: hostile imports, migration, backups, company files', () => {
  const N_HOSTILE = 2000
  const H = new Violations()
  beforeAll(() => {
    const protoKeys = Object.getOwnPropertyNames(Object.prototype).join()
    for (let i = 0; i < N_HOSTILE; i++) {
      const r = rngFor(seedOf(i, 61))
      const src = r.chance(0.3) ? r.pick(sampleProjects()) : genCase(i, { salt: 62 }).p
      const tree = JSON.parse(JSON.stringify(src)) as Json
      const edits = mutate(r, tree).join('; ')
      const text = JSON.stringify(tree) // the file as imported: JSON.parse(text) creates own `__proto__` keys
      let np: Project | null
      try { np = normalizeProject(JSON.parse(text)) } catch (e) { H.add('normalize-throws', `#${i} ${(e as Error).message}`); continue }
      H.check(Object.getOwnPropertyNames(Object.prototype).join() === protoKeys && ({} as Record<string, unknown>).polluted === undefined, 'pollution', () => `#${i} Object.prototype changed`)
      if (!np) { H.seen('rejected'); continue }
      H.seen('accepted')
      H.check(Object.getPrototypeOf(np) === Object.prototype && Object.getPrototypeOf(np.site) === Object.prototype && Object.getPrototypeOf(np.design) === Object.prototype, 'prototype', () => `#${i} prototype replaced`)
      const book = r.chance(0.3) ? genCase(i, { salt: 63 }).book : null
      let res: Results
      try { res = computeProject(np, book) } catch (e) {
        H.add('compute-throws', `#${i} ${(e as Error).message.slice(0, 80)} ← ${edits}`)
        H.check(cat() === resolveCatalog(null), 'catalog-restored', () => `#${i}`)
        continue
      }
      const bad = nonFinite(res)
      H.check(bad.length === 0, 'compute-nonfinite', () => `#${i} ${bad.slice(0, 3).join(' ')} ← ${edits}`)
      H.check(badLines(res).length === 0, 'compute-bad-lines', () => `#${i} ${badLines(res).slice(0, 2).map((b) => `${b.id}:${JSON.stringify(b.unitPriceUsd)}`).join(' ')} ← ${edits}`)
      H.check(nonFinite(buildQuote(np, res)).length === 0, 'compute-nonfinite', () => `#${i} quote ${nonFinite(buildQuote(np, res)).slice(0, 3).join(' ')} ← ${edits}`)
    }
    if (process.env.STRESS_DEBUG) { for (const [k, b] of H.buckets) console.log(`hostile ${k}: ${b.count}\n   ${b.examples.join('\n   ')}`); console.log(`hostile: ${N_HOSTILE} files, ${H.assertions} checks`, JSON.stringify(Object.fromEntries(H.coverage))) }
  }, 60_000)

  it(`normalizeProject never throws on ${N_HOSTILE} hostile files, never pollutes Object.prototype, never swaps a prototype`, () => {
    expect([...H.get('normalize-throws'), ...H.get('pollution'), ...H.get('prototype'), ...H.get('catalog-restored')]).toEqual([])
    expect(H.coverage.get('accepted') ?? 0).toBeGreaterThan(500)
    expect(H.coverage.get('rejected') ?? 0).toBeGreaterThan(20)
  })
  // DEFECT (major): normalizeProject only checks that site / design are objects and loads an array; it keeps every field as found.
  // Wrong-typed values then crash computeProject (and ProjectsPage, which computes every stored project — there is no error boundary,
  // so the home page stays blank on every reload) or leak NaN / non-numeric prices into the quote. Minimal repros below.
  // src/store/useAppStore.ts:80 (normalizeProject) — coerce each numeric / string / array field against `newProject()` defaults
  // (like normalizeToolState does for the tools), drop non-object loads / custom lines; and/or guard the economics inputs in computeCore.
  it(`DEFECT: computeProject never throws on a normalized hostile project (${N_HOSTILE} files)`, () => expect(H.get('compute-throws')).toEqual([]))
  it('DEFECT: a normalized hostile project never makes computeProject produce NaN / Infinity', () => expect(H.get('compute-nonfinite')).toEqual([]))
  it('DEFECT: a normalized hostile project never yields a BOM line with a non-numeric or negative qty / price', () => expect(H.get('compute-bad-lines')).toEqual([]))

  describe('minimal hostile repros (each is a JSON file a user could import)', () => {
    type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const run = (f: (p: Raw) => void) => { const raw = JSON.parse(JSON.stringify(sampleProjects()[0])) as Raw; f(raw); const p = normalizeProject(JSON.parse(JSON.stringify(raw)))!; expect(p).not.toBeNull(); return computeProject(p) }
    it('DEFECT: `"loads": [null]` → computeProject throws (compute.ts:28 sanitize reads l.qty)', () => { expect(() => run((p) => { p.loads = [null] })).not.toThrow() })
    it('DEFECT: `"customItems": [null]` → computeProject throws (bom.ts:48 reads ci.id / ci.qty)', () => { expect(() => run((p) => { p.pricing.customItems = [null] })).not.toThrow() })
    it('DEFECT: `"currency": 123` → computeProject throws (quote.ts:37 code.toUpperCase)', () => { expect(() => run((p) => { p.site.currency = 123 })).not.toThrow() })
    it('DEFECT: non-numeric economics inputs ("discountRatePct": "6 %", "gridTariff": "0.10 USD", …) → NaN savings / NPV / LCOE / CO₂ (compute.ts:813–824)', () => {
      const edits: ((p: Raw) => void)[] = [(p) => { p.design.discountRatePct = '6 %' }, (p) => { p.design.tariffEscalationPct = 'n/a' }, (p) => { p.design.omPctPerYear = '1%' },
        (p) => { p.site.gridTariff = '0.10 USD' }, (p) => { p.site.gridEmission = 'unknown' }]
      for (const f of edits) expect(nonFinite(run(f))).toEqual([])
    })
    // DEFECT (minor, crafted file): `bill.profile` is checked with `in`, which walks the prototype chain: "constructor", "toString", "__proto__"
    // pass, BILL_PROFILES[profile] is a function / Object.prototype and the whole design is NaN. src/engine/sizing.ts:41 → Object.hasOwn.
    it('DEFECT: `"profile": "constructor"` (or "toString" / "__proto__") on a bill → NaN demand, peak and sizing', () => {
      for (const profile of ['constructor', 'toString', '__proto__']) expect(nonFinite(run((p) => { p.sizing = { demand: 'bill', bill: { monthlyKwh: 500, profile } } }))).toEqual([])
    })
    it('DEFECT: `"inverterQty": "two"` with a manual inverter → NaN inverter qty / kW (compute.ts:487 Math.round("two" || 1))', () => {
      expect(nonFinite(run((p) => { p.design.inverterId = 'inv-deye-8k-sg01lp1'; p.design.inverterQty = 'two' }))).toEqual([])
    })
    it('DEFECT: `"labourPerKwUsd": null` / `"priceOverrides": {"earth-rod": -10}` → BOM lines priced null / negative (bom.ts:196–215)', () => {
      expect(badLines(run((p) => { p.pricing.labourPerKwUsd = null }))).toEqual([])
      expect(badLines(run((p) => { p.pricing.priceOverrides = { 'earth-rod': -10 } }))).toEqual([])
    })
  })

  describe('persist migrate v2 → v3', () => {
    const migrate = useAppStore.persist.getOptions().migrate!
    const v2Projects = () => [...sampleProjects(), ...fixtures()].map((p) => { const x = JSON.parse(JSON.stringify(p)); delete x.mode; delete x.sizing; return x as Project })
    // a version-2 company: settings + quote defaults, no price list and no services (labour / transport / commissioning)
    const v2Company = () => ({ ...defaultCompany, marginPct: 22, vatPct: 5, defaultLocationId: 'riyadh', defaultSystemType: 'hybrid', defaultPhase: 1 })
    it('fills mode / sizing / priceBook / services and every project computes the same results and total', () => {
      const old = v2Projects()
      const st = migrate({ lang: 'en', view: 'projects', step: 0, projects: old, currentId: null, company: v2Company(), clientView: true, lastStep: {} }, 2) as unknown as { projects: Project[]; company: Company; tools: unknown; calc: unknown }
      expect(st.projects).toHaveLength(old.length)
      expect(st.company.priceBook).toEqual(emptyPriceBook())
      expect([st.company.labourPerKwUsd, st.company.transportUsd, st.company.commissioningUsd]).toEqual([120, 100, 150])
      expect(st.company.marginPct).toBe(22)
      expect(st.tools).toEqual({}); expect(st.calc).toBeNull()
      st.projects.forEach((p, k) => {
        expect(p.mode).toBe('design'); expect(p.sizing).toEqual(defaultSizing())
        const a = computeProject(old[k]), b = computeProject(p, st.company.priceBook)
        expect(b).toEqual(a)
        expect(buildQuote(p, b).total).toBe(buildQuote(old[k], a).total)
      })
    })
    it('a version-1 state and junk entries migrate without throwing; junk projects are dropped', () => {
      const st = migrate({ projects: [null, 'x', 42, {}, { design: {}, site: {} }, ...v2Projects().slice(0, 2)], company: null } as unknown, 1) as unknown as { projects: Project[]; company: Company; lastStep: unknown }
      expect(st.projects).toHaveLength(2)
      expect(st.company.priceBook).toEqual(emptyPriceBook()); expect(st.lastStep).toEqual({})
      for (const junk of [undefined, null, {}, { company: 'y' }, { projects: [], company: [] }]) expect(() => migrate(junk as unknown, 2)).not.toThrow()
    })
    // DEFECT (minor, corrupt storage only): a stored state whose `projects` is not an array makes migrate throw; zustand swallows the
    // error, starts from the initial state and overwrites the stored company on the next change. src/store/useAppStore.ts:276 —
    // `Array.isArray(st.projects) ? … : []`.
    it('DEFECT: migrate tolerates a stored `projects` that is not an array', () => {
      for (const projects of ['x', 42, { a: 1 }]) expect(() => migrate({ projects, company: {} } as unknown, 2)).not.toThrow()
    })
  })

  describe('importBackup / importCompany', () => {
    const S = () => useAppStore.getState()
    const initial = useAppStore.getState()
    const mine = (): Company => {
      const priceBook = emptyPriceBook(); priceBook.prices[catalog.panels[0].id] = 77; priceBook.hidden.push(catalog.inverters[0].id)
      return { ...initial.company, name: 'Keep Me Solar', fxRateToUsd: 600, currency: 'SDG', marginPct: 27, logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=', priceBook }
    }
    beforeEach(() => useAppStore.setState({ ...initial, projects: sampleProjects().slice(0, 2), company: mine() }, true))
    const JUNK: unknown[] = [null, undefined, 'x', 42, true, [], {}, { kind: 'dtplus-backup' }, { kind: 'dtplus-backup', company: 'x', projects: 'y' }, { kind: 'dtplus-backup', company: [], projects: [null, 1, 'p'] },
      { kind: 'dtplus-company' }, { kind: 'dtplus-company', company: null }, { kind: 'dtplus-company', company: [] }, { kind: 'dtplus-company', company: 'x' }, { kind: 'something-else', company: {} }, [{ kind: 'dtplus-backup' }]]
    it('junk is rejected and the current company and projects are kept', () => {
      for (const j of JUNK) {
        const before = { company: clone(S().company), projects: S().projects.map((p) => p.id) }
        expect(S().importBackup(j), JSON.stringify(j)).toBeNull()
        expect(S().importCompany(j), JSON.stringify(j)).toBe(false)
        expect(S().company).toEqual(before.company)
        expect(S().projects.map((p) => p.id)).toEqual(before.projects)
      }
    })
    it('a company file with wrong-typed fields keeps the current values for them', () => {
      const ok = S().importCompany({ kind: 'dtplus-company', version: 1, company: { name: 123, fxRateToUsd: 'x', defaultPhase: 2, defaultSystemType: 'boat', marginPct: null, currency: ['SDG'], terms: 'New terms' } })
      expect(ok).toBe(true)
      const c = S().company
      expect([c.name, c.fxRateToUsd, c.defaultPhase, c.defaultSystemType, c.marginPct, c.currency, c.terms]).toEqual(['Keep Me Solar', 600, 1, 'hybrid', 27, 'SDG', 'New terms'])
      expect(c.priceBook).toEqual(mine().priceBook)
    })
    // DEFECT (minor): normalizeCompany's contract is "wrong types → current value", but a company file whose `priceBook` has the wrong
    // type ("priceBook": "x" / [] / 42) replaces the company price list with an empty one — prices, stock list and own products are lost
    // silently. src/store/useAppStore.ts:114 — only replace the price list when `x.priceBook` is an object.
    it('DEFECT: a company file with a wrong-typed `priceBook` keeps the current price list', () => {
      for (const priceBook of ['x', [], 42, true]) {
        useAppStore.setState({ company: mine() })
        expect(S().importCompany({ kind: 'dtplus-company', version: 1, company: { name: 'Other', priceBook } })).toBe(true)
        expect(S().company.priceBook, JSON.stringify(priceBook)).toEqual(mine().priceBook)
      }
    })
  })

  describe('normalizeCompany: the logo must be an image data URL', () => {
    const cur = { ...useAppStore.getState().company, logoDataUrl: 'data:image/png;base64,AAAA' } as Company
    const accepted = ['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ', 'data:image/jpg;base64,/9j/', 'data:image/gif;base64,R0lGOD', 'data:image/webp;base64,UklGR', 'data:image/svg+xml;base64,PHN2Zz4=']
    const rejected: unknown[] = ['data:text/html;base64,PHNjcmlwdD4=', 'javascript:alert(1)', 'data:image/png,not-base64', 'https://evil.example/logo.png', 'DATA:IMAGE/PNG;BASE64,AAAA', ' data:image/png;base64,AAAA',
      'data:application/pdf;base64,JVBERi0=', 'data:image/x-icon;base64,AAAB', 'data:image/svg+xml,<svg onload=alert(1)>', 42, {}, ['data:image/png;base64,AAAA'], true]
    it('accepts png / jpeg / gif / webp / svg base64 data URLs', () => { for (const v of accepted) expect(normalizeCompany({ logoDataUrl: v }, cur)!.logoDataUrl).toBe(v) })
    it('rejects every non-image, non-base64 or non-string logo (it never becomes the stored logo)', () => {
      for (const v of rejected) {
        const out = normalizeCompany({ logoDataUrl: v }, cur)!.logoDataUrl
        expect(out, String(v)).not.toBe(v)
        expect([null, cur.logoDataUrl]).toContain(out)
      }
    })
  })
})

// ====================================================================================================== 5. tools
const GARBAGE: unknown[] = [null, undefined, Number.NaN, Infinity, -Infinity, -1, 0, 1e-300, 1e308, -1e308, 'abc', '5', [], {}, true]
const EXTREME = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x !== 0 && (Math.abs(x) >= 1e15 || Math.abs(x) <= 1e-15)
/** Inputs with a finite but absurd magnitude (≥ 1e15 or ≤ 1e-15) anywhere — they overflow / underflow inside the formulas. */
const hasExtreme = (x: unknown): boolean => EXTREME(x) || (!!x && typeof x === 'object' && Object.values(x as object).some(hasExtreme))

describe('5. engineering tools', () => {
  const N_TOOL = 2000
  const T = new Violations()
  const g = (r: Rng, valid: () => unknown, p = 0.12) => (r.chance(p) ? clone(r.pick(GARBAGE)) : valid())
  const verdict = (tool: string, x: unknown, out: { valid: boolean; invalid?: string[] }, fields: readonly string[]) => {
    if (!out.valid) { T.check(Array.isArray(out.invalid) && out.invalid.length > 0 && out.invalid.every((f) => fields.includes(f)), `${tool}-invalid`, () => JSON.stringify(out)); T.seen(`${tool}:invalid`); return }
    T.seen(`${tool}:valid`)
    const bad = nonFinite(out)
    T.check(bad.length === 0, hasExtreme(x) ? `${tool}-extreme` : `${tool}-nonfinite`, () => `${bad.slice(0, 3).join(' ')} ← ${JSON.stringify(x)}`)
  }
  const STRING_FIELDS = ['watts', 'voc', 'vmp', 'isc', 'imp', 'tcVoc', 'tcPmax', 'noct', 'maxSysV', 'maxFuse', 'maxPvV', 'mpptMin', 'mpptMax', 'mpptCount', 'maxA', 'maxPvKw', 'units', 'panelCount', 'low', 'hot']
  const BATTERY_FIELDS = ['loadW', 'hours', 'energy', 'V', 'Ah', 'kWh', 'dod', 'maxChargeA', 'maxDischargeA', 'parallelMax', 'dodOverride', 'run']
  const CABLE_FIELDS = ['current', 'power', 'pf', 'voltage', 'length', 'drop', 'ambient']
  const GEN_FIELDS = ['running', 'motor', 'pf', 'charge', 'ambient']
  const mpptPool = catalog.inverters.filter((x) => x.mpptCount > 0)

  beforeAll(() => {
    for (let i = 0; i < N_TOOL; i++) {
      const r = rngFor(seedOf(i, 71))
      // ---- string checker
      const base = panelSpec(r.pick(catalog.panels))
      // 2 %: a module voltage typed in the wrong unit (µV-scale Voc / Vmp) — valid for the validator, absurd for the layout search
      if (r.chance(0.02)) { const voc = r.pick([1e-6, 2e-7, 5e-5]); Object.assign(base, { voc, vmp: voc * 0.8 }) }
      const module = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, g(r, () => (r.chance(0.2) && typeof v === 'number' ? r2(v * r.num(0.3, 3)) : v), 0.06)])) as unknown as StringCheckInput['module']
      const mp = r.chance(0.3) ? controllerMppt(r.pick(catalog.chargeControllers), r.pick([12, 24, 48]), base) : inverterMppt(r.pick(mpptPool))
      const mppt = Object.fromEntries(Object.entries(mp).map(([k, v]) => [k, g(r, () => v, 0.06)])) as unknown as StringCheckInput['mppt']
      const sIn: StringCheckInput = { module, mppt, units: g(r, () => r.int(1, 4)) as number, panelCount: g(r, () => (r.chance(0.2) ? null : r.int(1, 300))) as number | null,
        recordLowC: g(r, () => r.int(-30, 25)) as number, hotAmbientC: g(r, () => r.int(25, 55)) as number, codeLimitV: r.chance(0.05) ? clone(r.pick(GARBAGE)) as number : r.pick([1000, 1500]) }
      // the layout search loops once per string length between the shortest and the longest allowed: measure the range first
      const range = checkStrings({ ...sIn, panelCount: null })
      if (range.valid && range.seriesMax - range.seriesMin > 10_000) T.add('strings-unbounded', `${range.seriesMin}…${range.seriesMax} in series ← voc ${module.voc}, vmp ${module.vmp}, mpptMax ${mppt.mpptMaxV}`)
      else {
        const out = checkStrings(sIn)
        verdict('strings', sIn, out, STRING_FIELDS)
        T.check(!out.valid || range.valid, 'strings-consistent', () => `range invalid, layout valid ← ${JSON.stringify(sIn)}`)
      }

      // ---- battery bank
      const bat = r.pick(catalog.batteries)
      const bIn: BatteryBankInput = {
        basis: r.pick(['load', 'energy'] as const), loadW: g(r, () => r.int(100, 50000)) as number, hours: g(r, () => r2(r.num(0.5, 48))) as number, energyKwh: g(r, () => r2(r.num(0.5, 500))) as number,
        module: Object.fromEntries(Object.entries(batterySpec(bat)).map(([k, v]) => [k, k === 'chemistry' ? v : g(r, () => v, 0.06)])) as unknown as BatteryBankInput['module'],
        battery: r.chance(0.5) ? bat : null, bus: r.pick([12, 24, 48, 'hv'] as const), dodOverridePct: g(r, () => (r.chance(0.7) ? null : r.int(10, 100))) as number | null,
        inverter: r.chance(0.5) ? r.pick(catalog.inverters) : null, cableRunM: g(r, () => r2(r.num(0.5, 20))) as number,
      }
      verdict('battery', bIn, sizeBatteryBank(bIn), BATTERY_FIELDS)

      // ---- cable & breaker
      const cIn: CableToolInput = { circuit: r.pick(['pv', 'battery', 'ac1', 'ac3'] as const), by: r.pick(['current', 'power'] as const), currentA: g(r, () => r2(r.num(0.5, 900))) as number,
        powerKw: g(r, () => r2(r.num(0.1, 400))) as number, pf: g(r, () => r2(r.num(0.5, 1))) as number, voltage: g(r, () => r.pick([12, 24, 48, 230, 400, 600, 1000])) as number,
        lengthM: g(r, () => r2(r.num(0.5, 300))) as number, maxDropPct: g(r, () => r2(r.num(0.5, 5))) as number, ambientC: g(r, () => r.int(-10, 85)) as number, insulation: r.pick(['pvc', 'xlpe'] as const) }
      const ct = sizeCircuit(cIn)
      verdict('cable', cIn, ct, CABLE_FIELDS)
      if (ct.valid && ct.cable.deviceStd !== false && !hasExtreme(cIn)) T.check(ct.cable.ampacityA! + 0.05 >= ct.cable.breakerA, 'cable-in-le-iz', () => `${ct.cable.breakerA} A > ${ct.cable.ampacityA} A ← ${JSON.stringify(cIn)}`)

      // ---- generator
      const gIn: GeneratorInput = { runningKw: g(r, () => r2(r.num(0.1, 400))) as number, motorKw: g(r, () => (r.chance(0.3) ? null : r2(r.num(0, 200)))) as number | null,
        start: r.pick(['dol', 'star-delta', 'soft', 'vfd'] as StartMethod[]), pf: g(r, () => r2(r.num(0.6, 1))) as number, chargeKw: g(r, () => (r.chance(0.3) ? null : r2(r.num(0, 50)))) as number | null, ambientC: g(r, () => r.int(-10, 55)) as number }
      verdict('generator', gIn, sizeGenerator(gIn), GEN_FIELDS)
    }
    if (process.env.STRESS_DEBUG) { for (const [k, b] of T.buckets) console.log(`tools ${k}: ${b.count}\n   ${b.examples.join('\n   ')}`); console.log(`tools: ${N_TOOL} × 4 inputs, ${T.assertions} checks`, JSON.stringify(Object.fromEntries(T.coverage))) }
  }, 60_000)

  it(`${N_TOOL} random / garbage inputs per tool → {valid:false, invalid:[known fields]} or finite outputs`, () => {
    for (const t of ['strings', 'battery', 'cable', 'generator']) {
      expect(T.coverage.get(`${t}:valid`) ?? 0, t).toBeGreaterThan(200)
      expect(T.coverage.get(`${t}:invalid`) ?? 0, t).toBeGreaterThan(200)
      expect([...T.get(`${t}-invalid`), ...T.get(`${t}-nonfinite`)], t).toEqual([])
    }
    expect([...T.get('strings-consistent'), ...T.get('cable-in-le-iz')]).toEqual([])
  })
  // DEFECT (minor): the tool validators only require "finite and > 0" (no plausibility bounds like ProductForm's), so absurd magnitudes
  // pass and overflow / underflow inside the formulas: e.g. battery V = 1e-300 → unit kWh 0 → Infinity modules; current 1e308 A → Infinity.
  // src/engine/tools.ts:232 validateBattery / :394 validateCable / :68 validateStrings — add upper / lower bounds (as ProductForm does).
  it('DEFECT: absurd-magnitude inputs (≥ 1e15 / ≤ 1e-15) are rejected instead of overflowing to Infinity / NaN', () => {
    expect(['strings', 'battery', 'cable', 'generator'].flatMap((t) => T.get(`${t}-extreme`))).toEqual([])
  })
  // DEFECT (minor): checkStrings accepts any Voc / Vmp > 0, and designStrings tries every string length between the shortest and the
  // longest allowed: Voc = 1e-6 V gives ~10^9 lengths and the String checker page freezes. src/engine/tools.ts:68 validateStrings —
  // bound the module voltages (ProductForm: Voc 1–120 V) or cap the series range.
  it('DEFECT: the string checker never has to search more than 10,000 string lengths', () => expect(T.get('strings-unbounded')).toEqual([]))

  it('string checker agrees with computeProject\'s string design for the same panel / inverter (or controller) / count / temperatures', () => {
    let compared = 0
    const mismatch: string[] = []
    cases.forEach((c, k) => {
      const r = computed[k]
      if (!r.strings || !r.inverter) return
      const s = c.p.site
      const viaCc = !!r.strings.viaController
      if (viaCc && !r.controller) return
      const busV = c.p.design.systemVoltage === 'hv' ? 400 : c.p.design.systemVoltage
      const mppt = viaCc ? controllerMppt(r.controller!, busV, panelSpec(r.panel)) : inverterMppt(r.inverter)
      // the tool takes the count as fixed: give it the engine's final count (its own equal layout), or the user's fixed count
      const fixed = r.strings.totalPanels !== r.panelQty
      const t = checkStrings({ module: panelSpec(r.panel), mppt, units: viaCc ? r.controllerQty : r.inverterQty, panelCount: fixed ? r.panelQty : r.strings.totalPanels, recordLowC: s.recordLowC,
        hotAmbientC: s.ambientHighC, codeLimitV: s.roofType === 'ground' ? 1500 : 1000 })
      if (!t.valid || !t.layout) return // e.g. an own controller whose 0.95 × max PV V is below 1.2 × bus + 5 V: the tool rejects the datasheet
      compared++
      const a = r.strings, b = t.layout
      if (a.panelsPerString !== b.panelsPerString || a.strings !== b.strings || a.totalPanels !== b.totalPanels || Math.abs(a.vocCold - b.vocCold) > 0.051 || a.stringsPerMppt !== b.stringsPerMppt)
        mismatch.push(`#${c.i} ${r.panel.id} on ${viaCc ? r.controller!.id : r.inverter.id} × ${viaCc ? r.controllerQty : r.inverterQty}, ${r.panelQty} panels: engine ${a.strings} × ${a.panelsPerString} vs tool ${b.strings} × ${b.panelsPerString}`)
    })
    expect(compared).toBeGreaterThan(1000)
    expect(mismatch).toEqual([])
  })

  it('cable tool at 40 °C PVC equals sizeCable for the same circuit (3,000 circuits)', () => {
    const r = rngFor(seedOf(0, 81))
    for (let i = 0; i < 3000; i++) {
      const circuit: CircuitKind = r.pick(['pv', 'battery', 'ac1', 'ac3'] as const)
      const I = r2(r.num(0.5, circuit === 'pv' ? 400 : 1500)), L = r2(r.num(0.5, 150)), drop = r2(r.num(0.5, 5))
      const V = circuit === 'pv' ? r.int(100, 1000) : circuit === 'battery' ? r.pick([12, 24, 48, 51.2, 400, 700]) : circuit === 'ac1' ? 230 : 400
      const t = sizeCircuit({ circuit, by: 'current', currentA: I, powerKw: null, pf: null, voltage: V, lengthM: L, maxDropPct: drop, ambientC: 40, insulation: 'pvc' })
      if (!t.valid) throw new Error(`invalid ${t.invalid}`)
      expect(t.kAmb).toBeCloseTo(0.87, 12)
      const kw = (I * V * 0.94) / 1000
      const e = circuit === 'pv' ? sizeCable('dc', I, L, V, drop, false, { minMm2: L > 25 ? 6 : 4, deviceList: nextStd(I * 1.56, STD_PV_FUSE_A) != null ? STD_PV_FUSE_A : STD_DC_FUSE_A })
        : circuit === 'battery' ? sizeCable('battery', I, L, V, drop, false, { minMm2: V > 60 ? 6 : kw >= 5 ? 25 : kw >= 3 ? 16 : 10 })
          : sizeCable('ac', I, L, V, drop, circuit === 'ac3')
      const key = (x: typeof e) => ({ sizeMm2: x.sizeMm2, breakerA: x.breakerA, dropPct: x.dropPct, parallelRuns: x.parallelRuns, ampacityA: x.ampacityA, deviceStd: x.deviceStd, currentA: x.currentA })
      expect(key(t.cable), `${circuit} ${I} A ${L} m ${V} V`).toEqual(key(e))
    }
  })
})

// ====================================================================================================== 6. performance
describe('6. performance', () => {
  it('computeProject of the largest sample averages < 20 ms', () => {
    const size = (p: Project) => { const r = computeProject(p); return r.bom.length + r.panelQty }
    const largest = [...sampleProjects(), ...fixtures()].reduce((a, b) => (size(b) > size(a) ? b : a))
    for (let k = 0; k < 10; k++) computeProject(largest) // warm-up
    const n = 50, t0 = performance.now()
    for (let k = 0; k < n; k++) computeProject(largest)
    const avg = (performance.now() - t0) / n
    if (process.env.STRESS_DEBUG) console.log(`largest sample "${largest.name}": ${avg.toFixed(2)} ms / computeProject`)
    expect(avg).toBeLessThan(20)
  })
  it('a ProjectsPage-like batch: 200 projects with a 600-entry price list < 2 s', () => {
    const book = emptyPriceBook()
    const ids = [...catalog.panels, ...catalog.batteries, ...catalog.inverters, ...catalog.chargeControllers, ...catalog.items].map((x) => x.id)
    ids.forEach((id, k) => { book.prices[id] = 10 + (k % 97) })
    const r = rngFor(seedOf(0, 91))
    const entries = () => Object.keys(book.prices).length + book.custom.panels.length + book.custom.inverters.length + book.custom.batteries.length + book.custom.items.length
    for (let k = 0; entries() < 600; k++) {
      if (k % 4 === 0) book.custom.panels.push(ownPanel(r, 100 + k))
      else if (k % 4 === 1) book.custom.inverters.push(ownInverter(r, 100 + k))
      else if (k % 4 === 2) book.custom.batteries.push(ownBattery(r, 100 + k))
      else book.custom.items.push({ id: `my-item-${100 + k}`, name: `Own ${k}`, category: 'Custom', unit: 'pcs', approxPriceUsd: k })
    }
    for (let k = 0; k < 40; k++) book.hidden.push(ids[(k * 7) % ids.length])
    const projects = [...sampleProjects(), ...fixtures(), ...Array.from({ length: 193 }, (_, k) => genCase(10_000 + k).p)]
    expect(projects).toHaveLength(200)
    expect(entries()).toBe(600)
    const t0 = performance.now()
    let sum = 0
    for (const p of projects) { const res = computeProject(p, book); sum += buildQuote(p, res).total }
    const ms = performance.now() - t0
    // and with a new price-list object per project (no resolveCatalog cache hit)
    const t1 = performance.now()
    for (const p of projects) computeProject(p, { ...book })
    const msCold = performance.now() - t1
    if (process.env.STRESS_DEBUG) console.log(`batch 200 × 600-entry book: ${ms.toFixed(0)} ms (cached list), ${msCold.toFixed(0)} ms (new list object each time)`)
    expect(Number.isFinite(sum)).toBe(true)
    expect(ms).toBeLessThan(2000)
    expect(msCold).toBeLessThan(2000)
  })
})

// ====================================================================================================== debugging aid
if (process.env.STRESS_CASE) describe('debug', () => {
  it('dump', () => {
    for (const s of process.env.STRESS_CASE!.split(',')) {
      const c = genCase(Number(s))
      const r = computeProject(c.p, c.book)
      console.log(JSON.stringify({ case: { ...c, fractionalQtyIds: [...c.fractionalQtyIds] }, total: buildQuote(c.p, r).total, checks: r.checks.map((x) => `${x.level}:${x.id}`) }, null, 1))
    }
  })
})
