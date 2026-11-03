// Bill of materials (methodology §12). Every cable / protective-device line uses exactly the rating designed in the
// cable schedule (one catalogue item per standard size), so the quote can never contradict the technical report.
import type { Project, Panel, Battery, Inverter, ChargeController, StringDesign, CableResult, BomLine, CatalogItem, PricingInput, ProtectionSummary } from './types'
import { cat } from './catalogContext'
import { generatorPriceUsd } from '../data/items'
import { ceilSafe } from './standards'
import { currencyDecimals, quoteFx, roundTo } from './quote'

export interface BomCtx {
  panel: Panel; panelQty: number; arrayKwp: number
  inverter: Inverter | null; inverterQty: number
  battery: Battery | null; batteryQty: number; batteryParallel: number; hvBattery: boolean
  controller: ChargeController | null; controllerQty: number
  strings: StringDesign | null
  schedule: CableResult[]; protection: ProtectionSummary
  /** Combiner boxes and combiner outputs (0 when no combiner is needed). */
  combiners: number; combinerOutputs: number
  /** PV DC inputs that each get an isolator + SPD (inverters, or charge controllers on the controller path). */
  dcInputs: number
  generatorKva: number | null
  /** Main equipment already on site (§16.3): counted in the design, deducted from the quoted qty. */
  existing?: { panels: number; batteries: number; inverters: number }
}
export const COMBINER_TO_INVERTER_M = 3 // combiner at the inverter end: short output lead (string home-runs carry the full DC run)
export const AC_INV_TO_COMBINER_M = 3 // parallel inverters land on an AC combiner next to them; acCableRunM is the combined feeder

const DISCRETE = new Set(['pcs', 'pair', 'kit', 'lot'])
/** Ceilings for hand-entered quantities and prices (USD) — far above any real quote, low enough that totals stay finite. */
const MAX_QTY = 1e7, MAX_PRICE_USD = 1e9
const TYPE_AR: Record<string, string> = { hybrid: 'هجين', offgrid: 'منفصل عن الشبكة', gridtie: 'متصل بالشبكة' }
const CHEM_AR: Record<string, string> = { LiFePO4: 'ليثيوم حديد فوسفات (LiFePO4)', NMC: 'ليثيوم NMC', AGM: 'رصاص حمضي AGM', Gel: 'رصاص حمضي جل', Flooded: 'رصاص حمضي سائل' }
const phaseAr = (ph: number) => (ph === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور')
/** Product name on the quote: brand + model, without the "Generic" placeholder brand of unbranded catalogue items. */
export const productName = (x: { brand: string; model: string }) => (/^generic$/i.test(x.brand.trim()) ? x.model : `${x.brand} ${x.model}`)
export const breakerItemId = (a: number) => (a >= 160 ? `ac-mccb-${a}` : `ac-mcb-${a}`)

/** Main-equipment ids whose BOM qty is the design qty (qty overrides on them are applied to the design by computeProject). */
export function mainEquipmentIds(c: Pick<BomCtx, 'panel' | 'inverter' | 'battery' | 'controller'>): Set<string> {
  return new Set([c.panel.id, c.inverter?.id, c.battery?.id, c.controller?.id].filter((x): x is string => !!x))
}

interface Draft { id: string; category: string; name: string; spec: string; nameAr?: string; specAr?: string; unit: string; qty: number; price: number }

/** `c` null → product list only (mode 'items'): the custom lines, priced the same way. */
export function buildBom(p: Project, pr: PricingInput, c: BomCtx | null): { lines: BomLine[]; missing: string[] } {
  const { site: s } = p
  const fx = quoteFx(s), dec = currencyDecimals(s.currency)
  const money = (qty: number, price: number) => {
    const unitL = roundTo(Math.min(price, MAX_PRICE_USD) * fx, dec)
    return roundTo(qty * unitL, dec) / fx
  }
  const custom = (pr.customItems ?? []).filter((ci) => !pr.excludedIds.includes(ci.id)).map((ci): BomLine => {
    const q = Number.isFinite(ci.qty) && ci.qty >= 0 ? Math.min(ci.qty, MAX_QTY) : 0, price = Number.isFinite(ci.unitPriceUsd) && ci.unitPriceUsd >= 0 ? Math.min(ci.unitPriceUsd, MAX_PRICE_USD) : 0
    return { ...ci, qty: q, unitPriceUsd: price, totalUsd: money(q, price), source: 'custom' }
  })
  if (!c) return { lines: custom, missing: [] }
  return buildDesignBom(p, pr, c, money, custom)
}

function buildDesignBom(p: Project, pr: PricingInput, c: BomCtx, money: (qty: number, price: number) => number, custom: BomLine[]): { lines: BomLine[]; missing: string[] } {
  const { design: d, site: s } = p
  // Upgrade (§16.3): wiring and accessories are quoted only for the parts that are new — a battery added to an existing inverter
  // and array gets its modules, interconnects and labour, not new PV strings or a new AC board. Nothing existing → full system.
  const ex = c.existing ?? { panels: 0, batteries: 0, inverters: 0 }
  const newBatt = Math.max(0, c.batteryQty - ex.batteries), newInvQty = Math.max(0, c.inverterQty - ex.inverters)
  const pvNew = !(c.panelQty > 0 && c.panelQty <= ex.panels)
  const acNew = !(c.inverter && c.inverterQty > 0 && newInvQty === 0)
  const battNew = newBatt > 0 || newInvQty > 0
  const drafts = new Map<string, Draft>()
  const missing: string[] = []
  const add = (x: Draft) => {
    const prev = drafts.get(x.id)
    if (prev) prev.qty += x.qty
    else drafts.set(x.id, { ...x })
  }
  const addItem = (id: string, qty: number) => {
    const it: CatalogItem | undefined = cat().items.find((i) => i.id === id)
    if (!it) { missing.push(id); add({ id, category: 'Accessories', name: id, spec: 'not in catalogue — price manually', unit: 'pcs', qty, price: 0 }); return }
    add({ id: it.id, category: it.category, name: it.name, spec: it.spec ?? '', nameAr: it.nameAr, specAr: it.specAr, unit: it.unit, qty, price: it.approxPriceUsd })
  }
  const cab = (id: string) => c.schedule.find((x) => x.id === id)
  const runs = (x: CableResult | undefined) => x?.parallelRuns ?? 1
  const cores = d.phase === 3 ? 5 : 3 // per-core pricing: L+N+PE (1-ph) or 3L+N+PE (3-ph)

  // ---- Generation
  const pn = c.panel
  add({ id: pn.id, category: 'PV Modules', name: productName(pn), spec: `${pn.watts} W · ${pn.technology} · Voc ${pn.voc} V`,
    nameAr: productName(pn), specAr: `${pn.watts} W · ${pn.technology === 'poly' ? 'متعدد البلورات' : pn.technology} · Voc ${pn.voc} V`, unit: 'pcs', qty: c.panelQty, price: pn.approxPriceUsd })
  if (c.inverter) {
    const iv = c.inverter
    add({ id: iv.id, category: 'Inverter', name: productName(iv), spec: `${iv.ratedAcKw} kW ${iv.type} · ${iv.phase}-ph · ${iv.mpptCount} MPPT`,
      nameAr: productName(iv), specAr: `${iv.ratedAcKw} kW · ${TYPE_AR[iv.type] ?? iv.type} · ${phaseAr(iv.phase)} · ${iv.mpptCount} MPPT`, unit: 'pcs', qty: c.inverterQty, price: iv.approxPriceUsd })
  }
  if (c.battery && c.batteryQty > 0) {
    const b = c.battery
    add({ id: b.id, category: 'Battery', name: productName(b), spec: `${b.nominalVoltage} V ${b.capacityAh} Ah · ${b.energyKwh} kWh ${b.chemistry}`,
      nameAr: productName(b), specAr: `${b.nominalVoltage} V ‏${b.capacityAh} Ah · ${b.energyKwh} kWh · ${CHEM_AR[b.chemistry] ?? b.chemistry}`, unit: 'pcs', qty: c.batteryQty, price: b.approxPriceUsd })
  }
  if (c.controller && c.controllerQty > 0) {
    const cc = c.controller, t = cc.type ?? 'MPPT'
    add({ id: cc.id, category: 'Inverter', name: productName(cc), spec: `${cc.maxChargeA} A ${t} · ${cc.maxPvVoltage} V PV`,
      nameAr: productName(cc), specAr: `منظم شحن ${t} ‏${cc.maxChargeA} A · ${cc.maxPvVoltage} V`, unit: 'pcs', qty: c.controllerQty, price: cc.approxPriceUsd })
  }
  if (c.battery && c.batteryQty > 0) {
    const b = c.battery
    if (b.formFactor === 'rack') addItem('battery-rack', ceilSafe(newBatt / 4))
    else {
      if (b.formFactor === 'floor' && b.chemistry !== 'LiFePO4' && b.chemistry !== 'NMC') addItem('battery-stand', ceilSafe(newBatt / 4))
      // Parallel strings (or several inverters sharing the bank) land on a busbar, not on the first battery's terminals
      if (!c.hvBattery && battNew && (c.batteryParallel >= 2 || c.inverterQty > 1)) addItem('busbar-kit', Math.max(1, ceilSafe(c.batteryParallel / 8)))
    }
    // CAN/RS485 link per module for LV lithium rack / wall units (generic floor batteries have no comms port)
    if (!c.hvBattery && (b.chemistry === 'LiFePO4' || b.chemistry === 'NMC') && (b.formFactor === 'rack' || b.formFactor === 'wall')) addItem('bms-cable', newBatt)
  }

  // ---- Mounting (2 rails × panel width per panel, rows of ~10, §9 / §12) — new panels only (existing ones are already mounted)
  const N = Math.max(0, c.panelQty - ex.panels), rows = ceilSafe(N / 10)
  const newKwp = (N * pn.watts) / 1000
  const railM = N * (pn.widthMm / 1000) * 2 * 1.05
  if (s.roofType === 'ground') {
    addItem('ground-structure', newKwp) // rails/purlins and foundations included; module clamps below
    addItem('mid-clamp', Math.max(0, N * 2 - rows * 2))
    addItem('end-clamp', rows * 4)
  } else {
    addItem('rail', railM)
    addItem('mid-clamp', Math.max(0, N * 2 - rows * 2))
    addItem('end-clamp', rows * 4)
    addItem('rail-splice', Math.max(0, ceilSafe(railM / 4.2) - rows * 2))
    if (s.roofType === 'pitched-tile') addItem('tile-hook', N * 2.5)
    else if (s.roofType === 'metal-sheet') addItem('l-foot', N * 2.5)
    else { addItem('triangle-frame', N); addItem('ballast-block', N * 2) }
  }
  addItem('earth-clip', N)

  // ---- PV DC side
  const str = cab('pv-string')
  if (str && c.strings && pvNew) {
    const ns = c.strings.strings
    addItem(`dc-cable-${str.sizeMm2}`, ns * d.dcCableRunM * 2 * runs(str))
    addItem('mc4-pair', ns * 2 + 2)
    const hiV = (c.strings.vocCold ?? 0) > 1000
    if (c.combiners > 0) {
      addItem('combiner-box', c.combiners)
      if (c.protection.stringFuseA) addItem(`pv-fuse-${c.protection.stringFuseA}${hiV ? '-1500v' : ''}`, ns * 2)
      const arr = cab('pv-array')
      if (arr) {
        addItem(`dc-cable-${arr.sizeMm2}`, c.combinerOutputs * COMBINER_TO_INVERTER_M * 2 * runs(arr))
        if (c.protection.arrayFuseA) addItem(`pv-array-fuse-${c.protection.arrayFuseA}${hiV ? '-1500v' : ''}`, c.combinerOutputs * 2)
      }
    }
    // Isolator + SPD at every PV input, and again at the array end when the DC run exceeds 10 m (§8.3, §12 #14/#15)
    const n = c.dcInputs * (d.dcCableRunM > 10 ? 2 : 1)
    if (c.protection.dcIsolatorV && c.protection.dcIsolatorA) addItem(`dc-isolator-${c.protection.dcIsolatorV}v-${c.protection.dcIsolatorA}a`, n)
    if (c.protection.spdDcV) addItem(`spd-dc-${c.protection.spdDcV}v`, n)
  }

  // ---- Battery side
  const bt = cab('battery')
  if (bt && c.battery && battNew) {
    // feeders + fuses for each new inverter, interconnects + lugs for each new module
    addItem(`batt-cable-${bt.sizeMm2}`, d.batteryCableRunM * 2 * runs(bt) * newInvQty + newBatt * 0.6)
    addItem('cable-lug', newBatt * 4 + 4 * runs(bt) * newInvQty)
    addItem(`${c.hvBattery ? 'batt-fuse-hv' : 'batt-fuse'}-${bt.breakerA}`, newInvQty)
  }
  const ccb = cab('cc-battery')
  if (ccb && c.controllerQty > 0) {
    addItem(`batt-cable-${ccb.sizeMm2}`, d.batteryCableRunM * 2 * runs(ccb) * c.controllerQty)
    addItem('cable-lug', 4 * runs(ccb) * c.controllerQty)
    addItem(`batt-fuse-${ccb.breakerA}`, c.controllerQty)
  }

  // ---- AC side
  const ac = cab('ac')
  if (ac && c.inverter && acNew) {
    const acInv = cab('ac-inverter'), acGrid = cab('ac-grid'), acGen = cab('ac-generator')
    addItem(`ac-cable-${ac.sizeMm2}`, d.acCableRunM * cores * runs(ac))
    if (acInv) addItem(`ac-cable-${acInv.sizeMm2}`, AC_INV_TO_COMBINER_M * cores * runs(acInv) * c.inverterQty)
    if (acGrid) addItem(`ac-cable-${acGrid.sizeMm2}`, d.acCableRunM * cores * runs(acGrid))
    if (acGen) addItem(`ac-cable-${acGen.sizeMm2}`, d.acCableRunM * cores * runs(acGen))
    // Breakers: one per inverter output; + grid input (hybrid), point of connection (grid-tied) or main incomer (off-grid with parallel units); + generator input
    addItem(breakerItemId((acInv ?? ac).breakerA), c.inverterQty)
    if (acGrid) addItem(breakerItemId(acGrid.breakerA), 1)
    else if (d.systemType === 'gridtie' || c.inverterQty > 1) addItem(breakerItemId(ac.breakerA), 1)
    if (acGen) addItem(breakerItemId(acGen.breakerA), 1)
    if (c.protection.rcdA) addItem(`rcd-${c.protection.rcdA}`, 1)
    else if (d.systemType !== 'gridtie') addItem('rcd-relay', 1)
    addItem('spd-ac', 1)
    addItem('db-board', 1)
    if (c.protection.changeoverA && c.protection.changeoverType) addItem(`${c.protection.changeoverType === 'ats' ? 'ats' : 'changeover'}-${c.protection.changeoverA}`, 1)
    if (d.systemType !== 'offgrid') addItem('ct-meter', 1)
    addItem('wifi-dongle', c.inverterQty)
  }

  // ---- Earthing & misc
  // the site earth exists when neither new panels nor a new inverter are installed
  if (N > 0 || newInvQty > 0 || !c.inverter) {
    addItem('earth-rod', c.arrayKwp > 10 ? 2 : 1)
    addItem('earth-cable', 20 + N * 1.2)
    addItem('lightning-arrestor', c.arrayKwp > 20 ? 1 : 0)
  }
  addItem('conduit', (c.strings && pvNew ? d.dcCableRunM : 0) + (acNew ? d.acCableRunM : 0) + (c.battery && battNew ? d.batteryCableRunM : 0))
  addItem('cable-ties-labels', ceilSafe(N / 20) || 1)
  if (c.generatorKva) {
    const kva = c.generatorKva
    add({ id: 'generator', category: 'Generator', name: 'Diesel generator', spec: `${kva} kVA, silent canopy, ATS-ready`, nameAr: 'مولد ديزل',
      specAr: `${kva} kVA، بكاتم صوت، جاهز لمفتاح التحويل الآلي ATS`, unit: 'pcs', qty: 1, price: generatorPriceUsd(kva) })
  }
  // ---- Services: labour per new kWp (a complete new system: the whole array, as in §12). When some or all panels are already on
  // site (upgrade) or there are none (backup-only), a new inverter is charged per kW on top; a battery-only job is one lot (1 kW).
  // Capped at the complete-system labour, so marking more equipment as existing never raises the price.
  const invKw = c.inverter ? c.inverter.ratedAcKw * c.inverterQty : 0
  const newInvKw = c.inverter ? c.inverter.ratedAcKw * Math.max(0, c.inverterQty - ex.inverters) : 0
  const fullKw = c.panelQty > 0 ? c.arrayKwp : Math.max(invKw, c.batteryQty > 0 ? 1 : 0)
  const labourKw = Math.min(fullKw, newKwp + (ex.panels > 0 || N === 0 ? newInvKw : 0) + (c.batteryQty - ex.batteries > 0 ? 1 : 0))
  const labourUnit = c.panelQty > 0 && labourKw === fullKw ? 'kWp' : 'kW'
  add({ id: 'labour', category: 'Services', name: 'Installation labour', spec: `${roundTo(labourKw, 2)} ${labourUnit}`, nameAr: 'أعمال التركيب', specAr: `${roundTo(labourKw, 2)} ${labourUnit}`, unit: labourUnit, qty: labourKw, price: pr.labourPerKwUsd })
  add({ id: 'transport', category: 'Services', name: 'Transport & logistics', spec: '', nameAr: 'النقل والترحيل', specAr: '', unit: 'lot', qty: 1, price: pr.transportUsd })
  add({ id: 'commissioning', category: 'Services', name: 'Commissioning, testing & handover', spec: '', nameAr: 'التشغيل والاختبار والتسليم', specAr: '', unit: 'lot', qty: 1, price: pr.commissioningUsd })

  // ---- Finalise: exclusions, overrides, sane quantities, display-currency rounding (line total = qty × unit, to the cent)
  const main = mainEquipmentIds(c)
  const exBy = new Map<string, number>([[pn.id, ex.panels], [c.inverter?.id ?? '', ex.inverters], [c.battery?.id ?? '', ex.batteries]].filter(([id, n]) => id && (n as number) > 0) as [string, number][])
  const lines: BomLine[] = []
  for (const x of drafts.values()) {
    if (pr.excludedIds.includes(x.id)) continue
    const ov = pr.qtyOverrides[x.id]
    const hasOv = ov != null && Number.isFinite(ov) && ov >= 0
    // Main equipment: computeProject already applied overrides ≥ 1 to the design; an override of 0 keeps the line at 0 (not quoted)
    const existingQty = exBy.get(x.id) ?? 0
    const computed = Math.max(0, (DISCRETE.has(x.unit) ? ceilSafe(x.qty) : Math.ceil(Math.round(x.qty * 1e6) / 1e4) / 100) - existingQty)
    const q = hasOv && (!main.has(x.id) || ov === 0) ? Math.min(DISCRETE.has(x.unit) && ov > 0 ? ceilSafe(ov) : ov, MAX_QTY) : computed
    if (!hasOv && !(computed > 0) && !existingQty) continue // fully existing equipment stays listed (qty 0, "already on site")
    const ovp = pr.priceOverrides[x.id]
    const price = Math.min(ovp != null && Number.isFinite(ovp) && ovp >= 0 ? ovp : Number.isFinite(x.price) && x.price >= 0 ? x.price : 0, MAX_PRICE_USD)
    lines.push({ id: x.id, category: x.category, name: x.name, spec: x.spec, nameAr: x.nameAr, specAr: x.specAr, unit: x.unit, qty: q, unitPriceUsd: price, totalUsd: money(q, price), source: 'auto', ...(existingQty ? { existingQty } : {}) })
  }
  return { lines: [...lines, ...custom], missing }
}
