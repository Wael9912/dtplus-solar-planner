// Bill of materials (methodology §12). Every cable / protective-device line uses exactly the rating designed in the
// cable schedule (one catalogue item per standard size), so the quote can never contradict the technical report.
import type { Project, Panel, Battery, Inverter, ChargeController, StringDesign, CableResult, BomLine, CatalogItem, PricingInput, ProtectionSummary } from './types'
import { catalog } from '../data/catalog'
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
}
export const COMBINER_TO_INVERTER_M = 3 // combiner at the inverter end: short output lead (string home-runs carry the full DC run)
export const AC_INV_TO_COMBINER_M = 3 // parallel inverters land on an AC combiner next to them; acCableRunM is the combined feeder

const DISCRETE = new Set(['pcs', 'pair', 'kit', 'lot'])
const TYPE_AR: Record<string, string> = { hybrid: 'هجين', offgrid: 'منفصل عن الشبكة', gridtie: 'متصل بالشبكة' }
const CHEM_AR: Record<string, string> = { LiFePO4: 'ليثيوم حديد فوسفات (LiFePO4)', NMC: 'ليثيوم NMC', AGM: 'رصاص حمضي AGM', Gel: 'رصاص حمضي جل', Flooded: 'رصاص حمضي سائل' }
const phaseAr = (ph: number) => (ph === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور')
export const breakerItemId = (a: number) => (a >= 160 ? `ac-mccb-${a}` : `ac-mcb-${a}`)

/** Main-equipment ids whose BOM qty is the design qty (qty overrides on them are applied to the design by computeProject). */
export function mainEquipmentIds(c: Pick<BomCtx, 'panel' | 'inverter' | 'battery' | 'controller'>): Set<string> {
  return new Set([c.panel.id, c.inverter?.id, c.battery?.id, c.controller?.id].filter((x): x is string => !!x))
}

interface Draft { id: string; category: string; name: string; spec: string; nameAr?: string; specAr?: string; unit: string; qty: number; price: number }

export function buildBom(p: Project, pr: PricingInput, c: BomCtx): { lines: BomLine[]; missing: string[] } {
  const { design: d, site: s } = p
  const fx = quoteFx(s), dec = currencyDecimals(s.currency)
  const drafts = new Map<string, Draft>()
  const missing: string[] = []
  const add = (x: Draft) => {
    const prev = drafts.get(x.id)
    if (prev) prev.qty += x.qty
    else drafts.set(x.id, { ...x })
  }
  const addItem = (id: string, qty: number) => {
    const it: CatalogItem | undefined = catalog.items.find((i) => i.id === id)
    if (!it) { missing.push(id); add({ id, category: 'Accessories', name: id, spec: 'not in catalogue — price manually', unit: 'pcs', qty, price: 0 }); return }
    add({ id: it.id, category: it.category, name: it.name, spec: it.spec ?? '', nameAr: it.nameAr, specAr: it.specAr, unit: it.unit, qty, price: it.approxPriceUsd })
  }
  const cab = (id: string) => c.schedule.find((x) => x.id === id)
  const runs = (x: CableResult | undefined) => x?.parallelRuns ?? 1
  const cores = d.phase === 3 ? 5 : 3 // per-core pricing: L+N+PE (1-ph) or 3L+N+PE (3-ph)

  // ---- Generation
  const pn = c.panel
  add({ id: pn.id, category: 'PV Modules', name: `${pn.brand} ${pn.model}`, spec: `${pn.watts} W · ${pn.technology} · Voc ${pn.voc} V`,
    nameAr: `${pn.brand} ${pn.model}`, specAr: `${pn.watts} W · ${pn.technology === 'poly' ? 'متعدد البلورات' : pn.technology} · Voc ${pn.voc} V`, unit: 'pcs', qty: c.panelQty, price: pn.approxPriceUsd })
  if (c.inverter) {
    const iv = c.inverter
    add({ id: iv.id, category: 'Inverter', name: `${iv.brand} ${iv.model}`, spec: `${iv.ratedAcKw} kW ${iv.type} · ${iv.phase}-ph · ${iv.mpptCount} MPPT`,
      nameAr: `${iv.brand} ${iv.model}`, specAr: `${iv.ratedAcKw} kW · ${TYPE_AR[iv.type] ?? iv.type} · ${phaseAr(iv.phase)} · ${iv.mpptCount} MPPT`, unit: 'pcs', qty: c.inverterQty, price: iv.approxPriceUsd })
  }
  if (c.battery && c.batteryQty > 0) {
    const b = c.battery
    add({ id: b.id, category: 'Battery', name: `${b.brand} ${b.model}`, spec: `${b.nominalVoltage} V ${b.capacityAh} Ah · ${b.energyKwh} kWh ${b.chemistry}`,
      nameAr: `${b.brand} ${b.model}`, specAr: `${b.nominalVoltage} V ‏${b.capacityAh} Ah · ${b.energyKwh} kWh · ${CHEM_AR[b.chemistry] ?? b.chemistry}`, unit: 'pcs', qty: c.batteryQty, price: b.approxPriceUsd })
  }
  if (c.controller && c.controllerQty > 0) {
    const cc = c.controller, t = cc.type ?? 'MPPT'
    add({ id: cc.id, category: 'Inverter', name: `${cc.brand} ${cc.model}`, spec: `${cc.maxChargeA} A ${t} · ${cc.maxPvVoltage} V PV`,
      nameAr: `${cc.brand} ${cc.model}`, specAr: `منظم شحن ${t} ‏${cc.maxChargeA} A · ${cc.maxPvVoltage} V`, unit: 'pcs', qty: c.controllerQty, price: cc.approxPriceUsd })
  }
  if (c.battery && c.batteryQty > 0) {
    const b = c.battery
    if (b.formFactor === 'rack') addItem('battery-rack', ceilSafe(c.batteryQty / 4))
    else {
      if (b.formFactor === 'floor' && b.chemistry !== 'LiFePO4' && b.chemistry !== 'NMC') addItem('battery-stand', ceilSafe(c.batteryQty / 4))
      // Parallel strings (or several inverters sharing the bank) land on a busbar, not on the first battery's terminals
      if (!c.hvBattery && (c.batteryParallel >= 2 || c.inverterQty > 1)) addItem('busbar-kit', Math.max(1, ceilSafe(c.batteryParallel / 8)))
    }
    // CAN/RS485 link per module for LV lithium rack / wall units (generic floor batteries have no comms port)
    if (!c.hvBattery && (b.chemistry === 'LiFePO4' || b.chemistry === 'NMC') && (b.formFactor === 'rack' || b.formFactor === 'wall')) addItem('bms-cable', c.batteryQty)
  }

  // ---- Mounting (2 rails × panel width per panel, rows of ~10, §9 / §12)
  const N = c.panelQty, rows = ceilSafe(N / 10)
  const railM = N * (pn.widthMm / 1000) * 2 * 1.05
  if (s.roofType === 'ground') {
    addItem('ground-structure', c.arrayKwp) // rails/purlins and foundations included; module clamps below
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
  if (str && c.strings) {
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
  if (bt && c.battery) {
    addItem(`batt-cable-${bt.sizeMm2}`, d.batteryCableRunM * 2 * runs(bt) * c.inverterQty + c.batteryQty * 0.6)
    addItem('cable-lug', c.batteryQty * 4 + 4 * runs(bt) * c.inverterQty)
    addItem(`${c.hvBattery ? 'batt-fuse-hv' : 'batt-fuse'}-${bt.breakerA}`, c.inverterQty)
  }
  const ccb = cab('cc-battery')
  if (ccb && c.controllerQty > 0) {
    addItem(`batt-cable-${ccb.sizeMm2}`, d.batteryCableRunM * 2 * runs(ccb) * c.controllerQty)
    addItem('cable-lug', 4 * runs(ccb) * c.controllerQty)
    addItem(`batt-fuse-${ccb.breakerA}`, c.controllerQty)
  }

  // ---- AC side
  const ac = cab('ac')
  if (ac && c.inverter) {
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
  addItem('earth-rod', c.arrayKwp > 10 ? 2 : 1)
  addItem('earth-cable', 20 + N * 1.2)
  addItem('lightning-arrestor', c.arrayKwp > 20 ? 1 : 0)
  addItem('conduit', d.dcCableRunM + d.acCableRunM + (c.battery ? d.batteryCableRunM : 0))
  addItem('cable-ties-labels', ceilSafe(N / 20) || 1)
  if (c.generatorKva) {
    const kva = c.generatorKva
    add({ id: 'generator', category: 'Generator', name: 'Diesel generator', spec: `${kva} kVA, silent canopy, ATS-ready`, nameAr: 'مولد ديزل',
      specAr: `${kva} kVA، بكاتم صوت، جاهز لمفتاح التحويل الآلي ATS`, unit: 'pcs', qty: 1, price: generatorPriceUsd(kva) })
  }
  // ---- Services
  add({ id: 'labour', category: 'Services', name: 'Installation labour', spec: `${roundTo(c.arrayKwp, 2)} kWp`, nameAr: 'أعمال التركيب', specAr: `${roundTo(c.arrayKwp, 2)} kWp`, unit: 'kWp', qty: c.arrayKwp, price: pr.labourPerKwUsd })
  add({ id: 'transport', category: 'Services', name: 'Transport & logistics', spec: '', nameAr: 'النقل والترحيل', specAr: '', unit: 'lot', qty: 1, price: pr.transportUsd })
  add({ id: 'commissioning', category: 'Services', name: 'Commissioning, testing & handover', spec: '', nameAr: 'التشغيل والاختبار والتسليم', specAr: '', unit: 'lot', qty: 1, price: pr.commissioningUsd })

  // ---- Finalise: exclusions, overrides, sane quantities, display-currency rounding (line total = qty × unit, to the cent)
  const main = mainEquipmentIds(c)
  const money = (qty: number, price: number) => {
    const unitL = roundTo(price * fx, dec)
    return roundTo(qty * unitL, dec) / fx
  }
  const lines: BomLine[] = []
  for (const x of drafts.values()) {
    if (pr.excludedIds.includes(x.id)) continue
    const ov = pr.qtyOverrides[x.id]
    const hasOv = ov != null && Number.isFinite(ov) && ov >= 0
    // Main equipment: computeProject already applied overrides ≥ 1 to the design; an override of 0 keeps the line at 0 (not quoted)
    const computed = DISCRETE.has(x.unit) ? ceilSafe(x.qty) : Math.ceil(Math.round(x.qty * 1e6) / 1e4) / 100
    const q = hasOv && (!main.has(x.id) || ov === 0) ? ov : computed
    if (!hasOv && !(computed > 0)) continue
    const price = pr.priceOverrides[x.id] ?? x.price
    lines.push({ id: x.id, category: x.category, name: x.name, spec: x.spec, nameAr: x.nameAr, specAr: x.specAr, unit: x.unit, qty: q, unitPriceUsd: price, totalUsd: money(q, price), source: 'auto' })
  }
  for (const ci of pr.customItems) lines.push({ ...ci, totalUsd: money(ci.qty, ci.unitPriceUsd), source: 'custom' })
  return { lines, missing }
}
