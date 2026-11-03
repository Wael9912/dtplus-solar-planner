import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Save } from 'lucide-react'
import { useT } from '../i18n'
import { Field, NumberInput, Switch } from './ui'
import { Sheet } from './overlay'
import { useCatalog } from './useEngine'
import { uid } from '../engine/defaults'
import { fmt } from '../engine/format'
import { bomCatLabel, unitLabel } from '../i18n/labels'
import type { ProductKind } from '../store/useAppStore'
import type { Panel, Battery, Inverter, ChargeController, CatalogItem, CustomProducts, Chemistry, InverterType } from '../engine/types'

/** One of the company's own products (any family). */
export type Product = CustomProducts[ProductKind][number]
/** How money is entered and shown on the price list: USD (catalogue base) or the company currency. */
export interface CurView {
  /** Currency code prices are typed in. */
  code: string
  /** Company currency is not USD (so a hint in the other currency is shown). */
  hasLocal: boolean
  toShow: (usd: number) => number
  fromShow: (v: number) => number
  /** Formatted in the entry currency. */
  fmt: (usd: number) => string
  /** Formatted in the other currency (null when the company works in USD). */
  other: (usd: number) => string | null
}

type Draft = Record<string, unknown>
type Spec =
  | { k: string; t: 'num'; label: string; min: number; max: number; req?: boolean; int?: boolean; suffix?: string; help?: string; neg?: boolean; step?: number; wide?: boolean }
  | { k: string; t: 'text'; label: string; req?: boolean; help?: string; dir?: 'auto' | 'rtl'; wide?: boolean; placeholder?: string }
  | { k: string; t: 'select'; label: string; options: { value: string; label: string }[]; num?: boolean; wide?: boolean }
  | { k: string; t: 'bool'; label: string }
  | { k: string; t: 'custom'; render: () => ReactNode }
interface Group { title: string; fields: Spec[] }

const KIND_ID: Record<ProductKind, string> = { panels: 'panel', inverters: 'inverter', batteries: 'battery', chargeControllers: 'cc', items: 'item' }
const KINDS: ProductKind[] = ['panels', 'inverters', 'batteries', 'chargeControllers', 'items']
const TECH = ['TOPCon', 'PERC', 'HJT', 'HPBC', 'IBC', 'mono', 'poly']
const CHEM: Chemistry[] = ['LiFePO4', 'NMC', 'AGM', 'Gel', 'Flooded']
const FORMS = ['wall', 'rack', 'floor']
const INV_TYPES: InverterType[] = ['hybrid', 'offgrid', 'gridtie']
const CC_VOLTS = [12, 24, 36, 48]
const ITEM_CATS = ['Mounting', 'Cabling', 'Protection', 'Earthing', 'Monitoring', 'Battery', 'Generator', 'Accessories']
const UNITS = ['pcs', 'm', 'pair', 'kit', 'kWp', 'lot']
/** New id for a company product: my-<kind>-<random>. */
const newId = (kind: ProductKind) => `my-${KIND_ID[kind]}-${uid().replace(/-/g, '').slice(0, 10)}`
const BLANK: Record<ProductKind, Draft> = {
  panels: { brand: '', model: '', technology: 'TOPCon', bifacial: false, watts: null, efficiencyPct: null, voc: null, vmp: null, isc: null, imp: null, tempCoeffPmaxPctPerC: -0.3, tempCoeffVocPctPerC: -0.25, noct: 45, maxSystemVoltage: 1500, maxSeriesFuseA: null, lengthMm: null, widthMm: null, thicknessMm: null, weightKg: null, cells: null, warrantyYears: 12, approxPriceUsd: null },
  batteries: { brand: '', model: '', chemistry: 'LiFePO4', formFactor: 'wall', nominalVoltage: 51.2, capacityAh: null, energyKwh: null, usableDodPct: 90, maxChargeA: null, maxDischargeA: null, cycles: 6000, parallelMax: 16, weightKg: null, warrantyYears: 10, inverterBrands: '', approxPriceUsd: null },
  inverters: { brand: '', model: '', type: 'hybrid', phase: 1, ratedAcKw: null, surgeKw: null, efficiencyPct: 97, parallelMax: 1, generatorInput: true, mpptCount: 2, maxPvInputKw: null, maxPvVoltage: 500, mpptMinV: 120, mpptMaxV: 450, maxInputCurrentPerMppt: 16, batteryVoltage: 48, maxChargeA: null, batteryBrands: '', approxPriceUsd: null },
  chargeControllers: { brand: '', model: '', type: 'MPPT', maxChargeA: null, maxPvVoltage: null, batteryVoltages: [12, 24, 48], approxPriceUsd: null },
  items: { name: '', nameAr: '', category: 'Accessories', unit: 'pcs', spec: '', specAr: '', approxPriceUsd: null },
}
/** Product → editable draft (brand lists become comma text; the id is kept separately). */
function toDraft(kind: ProductKind, p: Product | null): Draft {
  if (!p) return { ...BLANK[kind] }
  const d: Draft = { ...BLANK[kind], ...p }
  delete d.id
  for (const k of ['inverterBrands', 'batteryBrands']) if (Array.isArray(d[k])) d[k] = (d[k] as string[]).join(', ')
  return d
}
const HV_RE = /^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/
const hvOk = (s: string) => { const m = HV_RE.exec(s); return !!m && Number(m[1]) < Number(m[2]) }
const round2 = (x: number) => Math.round(x * 100) / 100
const energyOf = (v: unknown, ah: unknown) => (typeof v === 'number' && typeof ah === 'number' && v > 0 && ah > 0 ? round2((v * ah) / 1000) : null)

/** Draft → engine product (optional values left out when empty). */
function build(kind: ProductKind, id: string, d: Draft): Product {
  const n = (k: string) => Number(d[k])
  const o = (k: string) => (d[k] == null || d[k] === '' ? undefined : Number(d[k]))
  const s = (k: string) => String(d[k] ?? '').trim()
  const list = (k: string) => { const xs = s(k).split(/[,،;]+/).map((x) => x.trim()).filter(Boolean); return xs.length ? xs : undefined }
  const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  switch (kind) {
    case 'panels': {
      const p: Panel = { id, brand: s('brand'), model: s('model'), watts: n('watts'), voc: n('voc'), vmp: n('vmp'), isc: n('isc'), imp: n('imp'), efficiencyPct: n('efficiencyPct'),
        tempCoeffPmaxPctPerC: n('tempCoeffPmaxPctPerC'), tempCoeffVocPctPerC: n('tempCoeffVocPctPerC'), noct: n('noct'), lengthMm: n('lengthMm'), widthMm: n('widthMm'), thicknessMm: o('thicknessMm'),
        weightKg: n('weightKg'), cells: o('cells'), technology: s('technology'), bifacial: !!d.bifacial, warrantyYears: n('warrantyYears'), approxPriceUsd: n('approxPriceUsd'),
        maxSystemVoltage: o('maxSystemVoltage'), maxSeriesFuseA: o('maxSeriesFuseA') }
      return clean(p)
    }
    case 'batteries': {
      const b: Battery = { id, brand: s('brand'), model: s('model'), chemistry: s('chemistry') as Chemistry, nominalVoltage: n('nominalVoltage'), capacityAh: n('capacityAh'), energyKwh: n('energyKwh'),
        usableDodPct: n('usableDodPct'), maxChargeA: n('maxChargeA'), maxDischargeA: n('maxDischargeA'), cycles: n('cycles'), warrantyYears: n('warrantyYears'), weightKg: n('weightKg'),
        formFactor: s('formFactor'), parallelMax: n('parallelMax'), approxPriceUsd: n('approxPriceUsd'), inverterBrands: list('inverterBrands') }
      return clean(b)
    }
    case 'inverters': {
      const gt = d.type === 'gridtie'
      const bv = d.batteryVoltage
      const i: Inverter = { id, brand: s('brand'), model: s('model'), type: s('type') as InverterType, phase: n('phase') === 3 ? 3 : 1, ratedAcKw: n('ratedAcKw'), maxPvInputKw: n('maxPvInputKw'),
        maxPvVoltage: n('maxPvVoltage'), mpptMinV: n('mpptMinV'), mpptMaxV: n('mpptMaxV'), mpptCount: n('mpptCount'), maxInputCurrentPerMppt: n('maxInputCurrentPerMppt'),
        batteryVoltage: gt ? null : typeof bv === 'string' ? bv.replace(/\s+/g, '').replace('–', '-') : typeof bv === 'number' ? bv : null,
        maxChargeA: gt ? 0 : n('maxChargeA'), surgeKw: n('surgeKw'), efficiencyPct: n('efficiencyPct'), parallelMax: n('parallelMax'), generatorInput: !!d.generatorInput,
        approxPriceUsd: n('approxPriceUsd'), batteryBrands: gt ? undefined : list('batteryBrands') }
      return clean(i)
    }
    case 'chargeControllers': {
      const c: ChargeController = { id, brand: s('brand'), model: s('model'), maxChargeA: n('maxChargeA'), maxPvVoltage: n('maxPvVoltage'),
        batteryVoltages: [...(d.batteryVoltages as number[])].sort((a, b) => a - b), approxPriceUsd: n('approxPriceUsd'), type: d.type === 'PWM' ? 'PWM' : 'MPPT' }
      return c
    }
    case 'items': {
      const it: CatalogItem = { id, name: s('name'), category: s('category'), unit: s('unit'), approxPriceUsd: n('approxPriceUsd'),
        spec: s('spec') || undefined, nameAr: s('nameAr') || undefined, specAr: s('specAr') || undefined }
      return clean(it)
    }
  }
}

/**
 * Datasheet form for one of the company's own products (opened in a Sheet). `initial` = product to edit (isNew false) or a prefilled copy
 * (duplicate, isNew true). Mount it only while open: the draft is initialised from the props.
 */
export function ProductForm({ kind: kind0, initial, isNew, cur, onClose, onSave }: {
  kind: ProductKind; initial: Product | null; isNew: boolean; cur: CurView; onClose: () => void; onSave: (kind: ProductKind, item: Product) => void
}) {
  const { t, lang } = useT()
  const tp = t.prices, f = tp.f
  const cat = useCatalog()
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [kind, setKind] = useState<ProductKind>(kind0)
  const [draft, setDraft] = useState<Draft>(() => toDraft(kind0, initial))
  const [from, setFrom] = useState('')
  const [tried, setTried] = useState(false)

  const set = (k: string, v: unknown) => setDraft((d) => {
    const next: Draft = { ...d, [k]: v }
    if (kind === 'batteries' && (k === 'nominalVoltage' || k === 'capacityAh')) {
      // Energy follows V × Ah while it still matches the previous product (or is empty)
      const prev = energyOf(d.nominalVoltage, d.capacityAh), calc = energyOf(next.nominalVoltage, next.capacityAh)
      if (calc != null && (d.energyKwh == null || (prev != null && Math.abs(Number(d.energyKwh) - prev) < 0.011))) next.energyKwh = calc
    }
    if (kind === 'inverters' && k === 'type') {
      if (v === 'gridtie') next.batteryVoltage = null
      else if (d.type === 'gridtie' && next.batteryVoltage == null) next.batteryVoltage = 48
    }
    return next
  })
  const changeKind = (k: ProductKind) => { setKind(k); setDraft(toDraft(k, null)); setFrom(''); setTried(false) }
  const pickFrom = (pid: string) => {
    setFrom(pid)
    const src = pid ? (cat[kind] as Product[]).find((x) => x.id === pid) ?? null : null
    setDraft(toDraft(kind, src))
  }

  // Error of a field, shown after the first save attempt (read lazily by the render functions, after errorsOf is computed)
  const err = (k: string): string | undefined => (tried ? errorsOf[k] : undefined)
  const sfx = { w: 'W', v: 'V', a: 'A', pct: '%', tc: '%/°C', c: '°C', mm: 'mm', kg: 'kg', ah: 'Ah', kwh: 'kWh', kw: 'kW', yr: tp.years }
  const priceSpec: Spec = { k: 'approxPriceUsd', t: 'num', label: f.price, min: 0, max: 10_000_000, req: true, wide: true,
    suffix: kind === 'items' ? tp.perUnit(cur.code, unitLabel(String(draft.unit ?? 'pcs'), t)) : cur.code }
  const brandModel: Spec[] = [{ k: 'brand', t: 'text', label: f.brand, req: true }, { k: 'model', t: 'text', label: f.model, req: true }]

  const groups = ((): Group[] => {
    const d = draft
    switch (kind) {
      case 'panels': return [
        { title: tp.groups.product, fields: [...brandModel, { k: 'technology', t: 'select', label: f.technology, options: TECH.map((x) => ({ value: x, label: t.design.tech[x] ?? x })) },
          { k: 'maxSystemVoltage', t: 'select', label: f.maxSystemVoltage, num: true, options: [1000, 1500].map((x) => ({ value: String(x), label: `${x} V` })) }, { k: 'bifacial', t: 'bool', label: f.bifacial }] },
        { title: tp.groups.electrical, fields: [
          { k: 'watts', t: 'num', label: f.watts, min: 5, max: 1000, req: true, suffix: sfx.w }, { k: 'efficiencyPct', t: 'num', label: f.panelEff, min: 5, max: 30, req: true, suffix: sfx.pct },
          { k: 'voc', t: 'num', label: f.voc, min: 1, max: 120, req: true, suffix: sfx.v }, { k: 'vmp', t: 'num', label: f.vmp, min: 1, max: 120, req: true, suffix: sfx.v },
          { k: 'isc', t: 'num', label: f.isc, min: 0.1, max: 30, req: true, suffix: sfx.a }, { k: 'imp', t: 'num', label: f.imp, min: 0.1, max: 30, req: true, suffix: sfx.a },
          { k: 'tempCoeffPmaxPctPerC', t: 'num', label: f.tcPmax, min: -1, max: 0, req: true, neg: true, step: 0.01, suffix: sfx.tc }, { k: 'tempCoeffVocPctPerC', t: 'num', label: f.tcVoc, min: -1, max: 0, req: true, neg: true, step: 0.01, suffix: sfx.tc },
          { k: 'noct', t: 'num', label: f.noct, min: 35, max: 60, req: true, suffix: sfx.c }, { k: 'maxSeriesFuseA', t: 'num', label: f.maxSeriesFuseA, min: 1, max: 60, suffix: sfx.a }] },
        { title: tp.groups.physical, fields: [
          { k: 'lengthMm', t: 'num', label: f.lengthMm, min: 300, max: 3000, req: true, suffix: sfx.mm }, { k: 'widthMm', t: 'num', label: f.widthMm, min: 200, max: 2000, req: true, suffix: sfx.mm },
          { k: 'thicknessMm', t: 'num', label: f.thicknessMm, min: 5, max: 80, suffix: sfx.mm }, { k: 'weightKg', t: 'num', label: f.weightKg, min: 1, max: 80, req: true, suffix: sfx.kg },
          { k: 'cells', t: 'num', label: f.cells, min: 1, max: 300, int: true }, { k: 'warrantyYears', t: 'num', label: f.warrantyYears, min: 0, max: 40, int: true, req: true, suffix: sfx.yr }] },
      ]
      case 'batteries': {
        const calc = energyOf(d.nominalVoltage, d.capacityAh)
        return [
          { title: tp.groups.product, fields: [...brandModel, { k: 'chemistry', t: 'select', label: f.chemistry, options: CHEM.map((x) => ({ value: x, label: t.design.chem[x] ?? x })) },
            { k: 'formFactor', t: 'select', label: f.formFactor, options: FORMS.map((x) => ({ value: x, label: tp.formFactors[x] ?? x })) }] },
          { title: tp.groups.electrical, fields: [
            { k: 'nominalVoltage', t: 'num', label: f.nominalVoltage, min: 1, max: 1000, req: true, suffix: sfx.v }, { k: 'capacityAh', t: 'num', label: f.capacityAh, min: 1, max: 5000, req: true, suffix: sfx.ah },
            { k: 'energyKwh', t: 'num', label: f.energyKwh, min: 0.05, max: 1000, req: true, suffix: sfx.kwh, help: calc != null ? tp.energyCalc(fmt(calc, 2)) : undefined },
            { k: 'usableDodPct', t: 'num', label: f.usableDodPct, min: 10, max: 100, req: true, suffix: sfx.pct },
            { k: 'maxChargeA', t: 'num', label: f.battChargeA, min: 1, max: 2000, req: true, suffix: sfx.a }, { k: 'maxDischargeA', t: 'num', label: f.maxDischargeA, min: 1, max: 2000, req: true, suffix: sfx.a },
            { k: 'cycles', t: 'num', label: f.cycles, min: 50, max: 20000, int: true, req: true }, { k: 'parallelMax', t: 'num', label: f.parallelMax, min: 1, max: 64, int: true, req: true }] },
          { title: tp.groups.physical, fields: [
            { k: 'weightKg', t: 'num', label: f.weightKg, min: 0.5, max: 3000, req: true, suffix: sfx.kg }, { k: 'warrantyYears', t: 'num', label: f.warrantyYears, min: 0, max: 30, int: true, req: true, suffix: sfx.yr },
            { k: 'inverterBrands', t: 'text', label: f.inverterBrands, help: tp.brandsHelp, wide: true, placeholder: 'Huawei' }] },
        ]
      }
      case 'inverters': {
        const gt = d.type === 'gridtie'
        const bv = d.batteryVoltage
        const bvSel = bv == null ? 'none' : typeof bv === 'string' ? 'hv' : String(bv)
        const bvNode = () => (
          <div key="bv" className="col-span-2 grid grid-cols-2 items-start gap-x-3 gap-y-4">
            <Field label={f.batteryVoltage} error={err('batteryVoltage')} className={typeof bv === 'string' ? 'col-span-2 min-[22rem]:col-span-1' : 'col-span-2'}>
              <select className="input" value={bvSel} data-testid="pf-batteryVoltage" aria-invalid={err('batteryVoltage') ? true : undefined}
                onChange={(e) => set('batteryVoltage', e.target.value === 'none' ? null : e.target.value === 'hv' ? (typeof bv === 'string' ? bv : '') : Number(e.target.value))}>
                <option value="none">{tp.bvNone}</option>
                {[12, 24, 48].map((x) => <option key={x} value={String(x)}>{`${x} V`}</option>)}
                <option value="hv">{tp.bvHv}</option>
              </select>
            </Field>
            {typeof bv === 'string' && (
              <Field label={f.hvWindow} help={tp.hvHelp} error={err('hvWindow')} className="col-span-2 min-[22rem]:col-span-1">
                <input className="input" dir="ltr" inputMode="decimal" value={bv} placeholder="160-800" aria-invalid={err('hvWindow') ? true : undefined} data-testid="pf-hvWindow"
                  onChange={(e) => set('batteryVoltage', e.target.value)} />
              </Field>
            )}
          </div>
        )
        const battery: Spec[] = gt ? [] : [
          { k: 'bv', t: 'custom', render: bvNode },
          { k: 'maxChargeA', t: 'num', label: f.invChargeA, min: 0, max: 2000, req: true, suffix: sfx.a },
          { k: 'batteryBrands', t: 'text', label: f.batteryBrands, help: tp.brandsHelp, wide: true, placeholder: 'Huawei, LG' },
        ]
        return [
          { title: tp.groups.product, fields: [...brandModel, { k: 'type', t: 'select', label: f.invType, options: INV_TYPES.map((x) => ({ value: x, label: t.info[`${x}Short`] })) },
            { k: 'phase', t: 'select', label: f.phase, num: true, options: [1, 3].map((x) => ({ value: String(x), label: t.design.phaseN(x) })) }] },
          { title: tp.groups.electrical, fields: [
            { k: 'ratedAcKw', t: 'num', label: f.ratedAcKw, min: 0.1, max: 2000, req: true, suffix: sfx.kw }, { k: 'surgeKw', t: 'num', label: f.surgeKw, min: 0, max: 5000, req: true, suffix: sfx.kw },
            { k: 'efficiencyPct', t: 'num', label: f.invEff, min: 80, max: 100, req: true, suffix: sfx.pct }, { k: 'parallelMax', t: 'num', label: f.parallelMax, min: 1, max: 30, int: true, req: true },
            { k: 'generatorInput', t: 'bool', label: f.generatorInput }] },
          { title: tp.groups.pv, fields: [
            { k: 'mpptCount', t: 'num', label: f.mpptCount, min: 0, max: 24, int: true, req: true, help: tp.mpptHelp, wide: true },
            { k: 'maxPvInputKw', t: 'num', label: f.maxPvInputKw, min: 0, max: 3000, req: true, suffix: sfx.kw }, { k: 'maxPvVoltage', t: 'num', label: f.maxPvVoltage, min: 0, max: 1500, req: true, suffix: sfx.v },
            { k: 'mpptMinV', t: 'num', label: f.mpptMinV, min: 0, max: 1500, req: true, suffix: sfx.v }, { k: 'mpptMaxV', t: 'num', label: f.mpptMaxV, min: 0, max: 1500, req: true, suffix: sfx.v },
            { k: 'maxInputCurrentPerMppt', t: 'num', label: f.maxInputCurrentPerMppt, min: 0, max: 100, req: true, suffix: sfx.a, wide: true }] },
          ...(gt ? [] : [{ title: tp.groups.battery, fields: battery }]),
        ]
      }
      case 'chargeControllers': {
        const vs = (d.batteryVoltages as number[]) ?? []
        const node = () => (
          <Field key="bvs" as="div" label={f.batteryVoltages} error={err('batteryVoltages')} className="col-span-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label={f.batteryVoltages}>
              {CC_VOLTS.map((v) => <button key={v} type="button" className="chip min-h-11 px-4" aria-pressed={vs.includes(v)} data-testid={`pf-bv-${v}`}
                onClick={() => set('batteryVoltages', vs.includes(v) ? vs.filter((x) => x !== v) : [...vs, v])}>{`${v} V`}</button>)}
            </div>
          </Field>
        )
        return [
          { title: tp.groups.product, fields: [...brandModel, { k: 'type', t: 'select', label: f.ccType, options: ['MPPT', 'PWM'].map((x) => ({ value: x, label: x })), wide: true }] },
          { title: tp.groups.electrical, fields: [
            { k: 'maxChargeA', t: 'num', label: f.ccChargeA, min: 1, max: 500, req: true, suffix: sfx.a }, { k: 'maxPvVoltage', t: 'num', label: f.ccPvV, min: 10, max: 1500, req: true, suffix: sfx.v },
            { k: 'bvs', t: 'custom', render: node }] },
        ]
      }
      case 'items': {
        const cats = [...new Set([...ITEM_CATS, ...cat.items.map((x) => x.category)])]
        return [{ title: tp.groups.product, fields: [
          { k: 'name', t: 'text', label: f.name, req: true, wide: true }, { k: 'nameAr', t: 'text', label: f.nameAr, dir: 'rtl', wide: true },
          { k: 'category', t: 'select', label: f.category, options: cats.map((x) => ({ value: x, label: bomCatLabel(x, t) })) },
          { k: 'unit', t: 'select', label: f.unit, options: UNITS.map((x) => ({ value: x, label: unitLabel(x, t) })) },
          { k: 'spec', t: 'text', label: f.spec, wide: true }, { k: 'specAr', t: 'text', label: f.specAr, dir: 'rtl', wide: true }] }]
      }
    }
  })()
  const all = [...groups.flatMap((g) => g.fields), priceSpec]

  // ---- validation (always computed; shown after the first save attempt)
  const errorsOf = (() => {
    const e: Record<string, string> = {}
    const d = draft
    const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null)
    for (const s of all) {
      if (s.t === 'num') {
        const v = num(s.k)
        if (v == null) { if (s.req) e[s.k] = tp.required }
        else if (s.k !== 'approxPriceUsd' && (v < s.min || v > s.max)) e[s.k] = tp.range(fmt(s.min, dec(s.min)), fmt(s.max, dec(s.max)))
      } else if (s.t === 'text' && s.req && !String(d[s.k] ?? '').trim()) e[s.k] = tp.required
    }
    if (kind === 'panels') {
      if (num('vmp') != null && num('voc') != null && num('vmp')! >= num('voc')!) e.vmp ??= tp.err.vmpVoc
      if (num('imp') != null && num('isc') != null && num('imp')! >= num('isc')!) e.imp ??= tp.err.impIsc
    }
    if (kind === 'inverters') {
      if ((num('mpptCount') ?? 0) > 0) {
        for (const k of ['maxPvInputKw', 'maxPvVoltage', 'maxInputCurrentPerMppt']) if (num(k) === 0) e[k] ??= tp.err.pvNeeded
        const lo = num('mpptMinV'), hi = num('mpptMaxV'), max = num('maxPvVoltage')
        if (lo != null && hi != null && lo >= hi) e.mpptMaxV ??= tp.err.mpptOrder
        else if (hi != null && max != null && max > 0 && hi > max) e.mpptMaxV ??= tp.err.mpptMax
      }
      if (d.type !== 'gridtie') {
        if (d.batteryVoltage == null) e.batteryVoltage = tp.err.battV
        else if (typeof d.batteryVoltage === 'string' && !hvOk(d.batteryVoltage)) e.hvWindow = tp.err.hv
      }
    }
    if (kind === 'chargeControllers' && !((d.batteryVoltages as number[]) ?? []).length) e.batteryVoltages = tp.err.ccVolts
    return e
  })()
  const nErr = Object.keys(errorsOf).length

  const submit = () => {
    setTried(true)
    if (nErr) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus())
      return
    }
    // New products get their id on save, from the type finally chosen (my-<kind>-<random>)
    onSave(kind, build(kind, !isNew && initial ? initial.id : newId(kind), draft))
  }

  const fromOptions = useMemo(() => {
    const xs = cat[kind] as Product[]
    if (kind !== 'items') return { flat: (xs as (Panel | Battery | Inverter | ChargeController)[]).map((x) => ({ id: x.id, label: `${x.brand} ${x.model}` })), groups: null }
    const by = new Map<string, { id: string; label: string }[]>()
    for (const x of xs as CatalogItem[]) by.set(x.category, [...(by.get(x.category) ?? []), { id: x.id, label: lang === 'ar' ? x.nameAr || x.name : x.name }])
    return { flat: null, groups: [...by] }
  }, [cat, kind, lang])

  const render = (s: Spec) => {
    if (s.t === 'custom') return s.render()
    if (s.t === 'bool') return <div key={s.k} className="col-span-2"><Switch checked={!!draft[s.k]} onChange={(v) => set(s.k, v)} label={s.label} data-testid={`pf-${s.k}`} /></div>
    const span = s.wide ? 'col-span-2' : 'col-span-2 min-[22rem]:col-span-1'
    if (s.t === 'select') return (
      <Field key={s.k} label={s.label} className={span}>
        <select className="input" value={String(draft[s.k] ?? '')} data-testid={`pf-${s.k}`} onChange={(e) => set(s.k, s.num ? Number(e.target.value) : e.target.value)}>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    )
    if (s.t === 'text') return (
      <Field key={s.k} label={s.label} help={s.help ?? (s.req ? undefined : tp.optional)} error={err(s.k)} className={span}>
        <input className="input" dir={s.dir ?? 'auto'} value={String(draft[s.k] ?? '')} placeholder={s.placeholder} aria-invalid={err(s.k) ? true : undefined} data-testid={`pf-${s.k}`}
          onChange={(e) => set(s.k, e.target.value)} />
      </Field>
    )
    const isPrice = s.k === 'approxPriceUsd'
    const raw = typeof draft[s.k] === 'number' ? (draft[s.k] as number) : null
    const value = isPrice && raw != null ? round2(cur.toShow(raw)) : raw
    const other = isPrice && raw != null ? cur.other(raw) : null
    const range = tp.range(fmt(s.min, dec(s.min)), fmt(s.max, dec(s.max)))
    const help = isPrice ? <>{tp.priceHelp}{other && <> · <bdi>{tp.approx(other)}</bdi></>}</> : s.help ?? (s.req ? range : `${tp.optional} · ${range}`)
    return (
      <Field key={s.k} label={s.label} help={help} error={err(s.k)} className={span}>
        <NumberInput value={value} allowEmpty min={isPrice ? 0 : s.min} max={isPrice ? undefined : s.max} integer={s.int} allowNegative={s.neg} step={s.step ?? 1} suffix={s.suffix}
          invalid={!!err(s.k)} data-testid={`pf-${s.k}`} aria-label={s.label}
          onChange={(v) => set(s.k, v == null ? null : isPrice ? cur.fromShow(v) : v)} />
      </Field>
    )
  }

  const title = isNew ? tp.newTitle : tp.editTitle
  return (
    <Sheet open onClose={onClose} title={title} description={isNew ? undefined : tp.kinds[kind]} variant="drawer" wide testId="product-form"
      footer={<>
        {tried && nErr > 0 && <p className="me-auto w-full text-sm font-medium text-red-700 sm:w-auto" role="alert">{tp.fixErrors(nErr)}</p>}
        <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="btn-primary flex-1 sm:flex-none" data-testid="pf-save"><Save size={18} />{tp.save}</button>
      </>}>
      <form id={formId} ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-6 pb-2">
        {isNew && (
          <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <Field label={tp.kind}>
              <select className="input" value={kind} data-testid="pf-kind" onChange={(e) => changeKind(e.target.value as ProductKind)}>
                {KINDS.map((k) => <option key={k} value={k}>{tp.kinds[k]}</option>)}
              </select>
            </Field>
            <Field label={tp.from} help={tp.fromHelp}>
              <select className="input" value={from} data-testid="pf-from" onChange={(e) => pickFrom(e.target.value)}>
                <option value="">{tp.fromNone}</option>
                {fromOptions.flat?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                {fromOptions.groups?.map(([g, xs]) => <optgroup key={g} label={bomCatLabel(g, t)}>{xs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>)}
              </select>
            </Field>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="eyebrow mb-3">{g.title}</h3>
            <div className="grid grid-cols-2 items-end gap-x-3 gap-y-4">{g.fields.map(render)}</div>
          </section>
        ))}
        <section>
          <h3 className="eyebrow mb-3">{tp.groups.price}</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">{render(priceSpec)}</div>
        </section>
      </form>
    </Sheet>
  )
}
const dec = (n: number) => (Number.isInteger(n) ? 0 : Math.min(3, String(n).split('.')[1]?.length ?? 0))
