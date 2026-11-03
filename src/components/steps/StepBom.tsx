import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, RotateCcw, Trash2, SlidersHorizontal, Eye, EyeOff, ArrowLeft, ArrowRight, PackagePlus, Search, X } from 'lucide-react'
import { useT, type Lang } from '../../i18n'
import type { Dict } from '../../i18n/en'
import { Field, NumberInput, Section, Segmented, Switch, IconButton, EmptyState, Parts } from '../ui'
import { useIsDesktop } from '../hooks'
import { Sheet, Menu } from '../overlay'
import type { StepProps } from '../Wizard'
import type { BomLine, PricingInput, Project, SiteInput } from '../../engine/types'
import type { ResolvedCatalog } from '../../engine/catalogContext'
import { fmt } from '../../engine/format'
import { uid } from '../../engine/defaults'
import { computeProject } from '../../engine/compute'
import { buildQuote, formatQuoteMoney, roundTo, type Quote, type QuoteLine } from '../../engine/quote'
import { currencies, defaultFx, currencyName } from '../../data/currencies'
import { useAppStore } from '../../store/useAppStore'
import { useCatalog, usePriceBook } from '../useEngine'
import { bomCatLabel, bomLineName, bomLineSpec, unitLabel } from '../../i18n/labels'
import { toast } from '../../store/useToast'

// ---------------------------------------------------------------- catalogue picker entries
type Kind = 'panels' | 'inverters' | 'batteries' | 'controllers' | 'items'
/** A product of the company price list as it becomes a quote line (names and specs in both languages, the company's unit cost). */
interface Entry { kind: Kind; id: string; own: boolean; category: string; name: string; nameAr?: string; spec: string; specAr?: string; unit: string; priceUsd: number; hay: string }
const TYPE_AR: Record<string, string> = { hybrid: 'هجين', offgrid: 'منفصل عن الشبكة', gridtie: 'متصل بالشبكة' }
const CHEM_AR: Record<string, string> = { LiFePO4: 'ليثيوم حديد فوسفات (LiFePO4)', NMC: 'ليثيوم NMC', AGM: 'رصاص حمضي AGM', Gel: 'رصاص حمضي جل', Flooded: 'رصاص حمضي سائل' }
const OWN = 'my-'
/** Every product the company stocks (hidden ones left out), shaped like the BOM lines the engine writes for the same product. */
function catalogEntries(c: ResolvedCatalog, t: Dict): Entry[] {
  const vis = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !c.hidden.has(x.id))
  const out: Omit<Entry, 'hay'>[] = [
    ...vis(c.panels).map((x) => ({ kind: 'panels' as const, id: x.id, own: x.id.startsWith(OWN), category: 'PV Modules', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.watts} W · ${x.technology}${x.bifacial ? ' bifacial' : ''} · Voc ${x.voc} V`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${x.watts} W · ${x.technology === 'poly' ? 'متعدد البلورات' : x.technology}${x.bifacial ? ' · ثنائي الوجه' : ''} · Voc ${x.voc} V` })),
    ...vis(c.inverters).map((x) => ({ kind: 'inverters' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Inverter', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.ratedAcKw} kW ${x.type} · ${x.phase}-ph · ${x.mpptCount} MPPT`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${TYPE_AR[x.type] ?? x.type} · ${x.phase === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور'} · ${x.ratedAcKw} kW · ${x.mpptCount} MPPT` })),
    ...vis(c.batteries).map((x) => ({ kind: 'batteries' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Battery', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.nominalVoltage} V ${x.capacityAh} Ah · ${x.energyKwh} kWh ${x.chemistry}`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${CHEM_AR[x.chemistry] ?? x.chemistry} · ${x.nominalVoltage} V ${x.capacityAh} Ah · ${x.energyKwh} kWh` })),
    ...vis(c.chargeControllers).map((x) => ({ kind: 'controllers' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Inverter', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.maxChargeA} A ${x.type ?? 'MPPT'} · ${x.maxPvVoltage} V PV`,
      nameAr: `${x.brand} ${x.model}`, specAr: `منظم شحن ${x.type ?? 'MPPT'} \u200F${x.maxChargeA} A · ${x.maxPvVoltage} V` })),
    ...vis(c.items).map((x) => ({ kind: 'items' as const, id: x.id, own: x.id.startsWith(OWN), category: x.category || 'Accessories', unit: x.unit || 'pcs', priceUsd: x.approxPriceUsd,
      name: x.name, spec: x.spec ?? '', nameAr: x.nameAr, specAr: x.specAr })),
  ]
  return out.map((e) => ({ ...e, hay: [e.name, e.nameAr, e.spec, e.specAr, e.id, t.bom.cats[e.category], e.category].filter(Boolean).join(' ').toLowerCase() }))
}
const entryName = (e: Pick<Entry, 'name' | 'nameAr'>, lang: Lang) => (lang === 'ar' && e.nameAr) || e.name
const entrySpec = (e: Pick<Entry, 'spec' | 'specAr'>, lang: Lang) => (lang === 'ar' && e.specAr) || e.spec

const SERVICE_FIELD = { labour: 'labourPerKwUsd', transport: 'transportUsd', commissioning: 'commissioningUsd' } as const
type ServiceId = keyof typeof SERVICE_FIELD
const isService = (id: string): id is ServiceId => id in SERVICE_FIELD
function omit<T extends Record<string, unknown>>(o: T, k: string): T { const c = { ...o }; delete c[k]; return c }

/**
 * Pricing step: the bill of materials with editable quantities and prices, lines from the company price list ("Add from
 * catalogue"), free-text lines, markup / discount / VAT. In a product quote (mode 'items') the catalogue is the main action.
 */
export function StepBom({ project: p, results: r, quote, update, goTo }: StepProps) {
  const { t, lang } = useT()
  const O = t.outputs.bom
  const desktop = useIsDesktop()
  const book = usePriceBook()
  const clientView = useAppStore((s) => s.clientView)
  const setClientView = useAppStore((s) => s.setClientView)
  const [showRemoved, setShowRemoved] = useState(true) // unticked lines stay in the list, greyed, so they can be ticked back on
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pr = p.pricing
  const fx = quote.fx
  const cur = quote.currency
  const items = r.mode === 'items'
  const setPr = (fn: (x: PricingInput) => Partial<PricingInput>) => update((prev) => ({ pricing: { ...prev.pricing, ...fn(prev.pricing) } }))
  const setSite = (patch: Partial<SiteInput>) => update((prev) => ({ site: { ...prev.site, ...patch } }))
  const m = (v: number, d = quote.decimals) => formatQuoteMoney(v, quote, d)

  // Lines incl. excluded ones (greyed) when the user asks to see them (computed with the company price list, like the quote)
  const all = useMemo(() => {
    if (!showRemoved || !pr.excludedIds.length) return { quote, bom: r.bom }
    const pAll: Project = { ...p, pricing: { ...pr, excludedIds: [] } }
    const rAll = computeProject(pAll, book)
    return { quote: buildQuote(pAll, rAll), bom: rAll.bom }
  }, [showRemoved, p, pr, quote, r.bom, book])
  const allQuote = all.quote
  const onSite = useMemo(() => new Map(all.bom.filter((b) => (b.existingQty ?? 0) > 0).map((b) => [b.id, b.existingQty!])), [all.bom])
  const lines = clientView ? allQuote.lines.filter((l) => l.qty > 0) : allQuote.lines
  const categories = Array.from(new Set(lines.map((l) => l.category)))
  const numbering = new Map(categories.flatMap((c) => lines.filter((l) => l.category === c)).map((l, i) => [l.id, i + 1]))

  // Quantity on the panel / inverter / battery / controller line drives the design in the engine; 0 = not quoted.
  const setQty = (l: QuoteLine, v: number | null) => {
    if (l.source === 'custom') return patchCustom(l.id, { qty: v ?? 0 })
    setPr((x) => ({ qtyOverrides: v == null ? omit(x.qtyOverrides, l.id) : { ...x.qtyOverrides, [l.id]: v } }))
  }
  const setPrice = (l: QuoteLine, v: number | null) => {
    const usd = v == null ? null : v / fx
    if (l.source === 'custom') return patchCustom(l.id, { unitPriceUsd: usd ?? 0 })
    if (isService(l.id)) return setPr((x) => ({ [SERVICE_FIELD[l.id as ServiceId]]: usd ?? 0, priceOverrides: omit(x.priceOverrides, l.id) }))
    setPr((x) => ({ priceOverrides: usd == null ? omit(x.priceOverrides, l.id) : { ...x.priceOverrides, [l.id]: usd } }))
  }
  const edited = (id: string) => pr.priceOverrides[id] != null || pr.qtyOverrides[id] != null
  const resetLine = (id: string) => setPr((x) => ({ priceOverrides: omit(x.priceOverrides, id), qtyOverrides: omit(x.qtyOverrides, id) }))
  const toggle = (id: string) => setPr((x) => ({ excludedIds: x.excludedIds.includes(id) ? x.excludedIds.filter((y) => y !== id) : [...x.excludedIds, id] }))
  const patchCustom = (id: string, x: Partial<BomLine>) => setPr((y) => ({ customItems: y.customItems.map((c) => (c.id === id ? { ...c, ...x } : c)) }))
  // Catalogue product → custom line (ref = product id); the same product again adds one to its line
  const addFromCatalog = (e: Entry) => setPr((x) => {
    const hit = x.customItems.find((c) => c.ref === e.id)
    if (hit) return { customItems: x.customItems.map((c) => (c === hit ? { ...c, qty: (Number.isFinite(c.qty) && c.qty > 0 ? c.qty : 0) + 1 } : c)) }
    return { customItems: [...x.customItems, { id: uid(), ref: e.id, category: e.category, name: e.name, nameAr: e.nameAr, spec: e.spec, specAr: e.specAr, unit: e.unit, qty: 1, unitPriceUsd: e.priceUsd, totalUsd: 0, source: 'custom' }] }
  })
  const openPicker = () => setPickerOpen(true)
  const addCustom = () => {
    const id = uid()
    setPr((x) => ({ customItems: [...x.customItems, { id, category: 'Custom', name: '', spec: '', unit: 'pcs', qty: 1, unitPriceUsd: 0, totalUsd: 0, source: 'custom' }] }))
    if (clientView) setClientView(false)
    requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>(`[data-line-id="${id}"]`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }) })
  }
  const removeCustom = (id: string) => {
    const prev = pr.customItems
    setPr((x) => ({ customItems: x.customItems.filter((c) => c.id !== id) }))
    toast({ message: t.bom.lineRemoved, action: { label: t.common.undo, run: () => setPr(() => ({ customItems: prev })) } })
  }
  const resetAll = () => {
    const prev = { priceOverrides: pr.priceOverrides, qtyOverrides: pr.qtyOverrides }
    setPr(() => ({ priceOverrides: {}, qtyOverrides: {} }))
    toast({ message: t.bom.resetDone, action: { label: t.common.undo, run: () => setPr(() => prev) } })
  }
  const nEdited = Object.keys(pr.priceOverrides).length + Object.keys(pr.qtyOverrides).length
  const catTotal = (cat: string) => lines.filter((l) => l.category === cat && !pr.excludedIds.includes(l.id)).reduce((s, l) => s + (clientView ? l.totalSell : l.totalCost), 0)

  // Catalogue lines carry the product's Arabic name; typed lines show what was typed
  const name = (l: QuoteLine) => (l.source === 'custom' && lang === 'ar' && l.nameAr) || bomLineName(l, lang, t)
  const existingBadge = (id: string) => { const n = onSite.get(id); return n ? <span className="badge-info mt-1 whitespace-normal" data-testid="bom-existing"><bdi>{O.existing(n)}</bdi></span> : null }
  const qtyInput = (l: QuoteLine, cls = '', quiet = false) => (
    <NumberInput quiet={quiet} align={quiet ? 'end' : 'start'} className={cls} value={l.qty} min={0} onChange={(v) => setQty(l, v)} aria-label={`${t.bom.qty} — ${name(l)}`} suffix={quiet ? undefined : unitLabel(l.unit, t)} />
  )
  const priceCell = (l: QuoteLine, quiet = false) => clientView
    ? <span className="block text-end font-medium text-slate-900 tabular-nums"><bdi>{m(l.unitSell)}</bdi></span>
    : <NumberInput quiet={quiet} align={quiet ? 'end' : 'start'} value={l.unitCost} min={0} step={0.5} onChange={(v) => setPrice(l, v)} aria-label={`${t.bom.costIn(cur)} — ${name(l)}`} />
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label={t.nav.clientView} value={clientView ? 'client' : 'cost'} onChange={(v) => setClientView(v === 'client')} options={[{ value: 'client', label: t.bom.clientPrices, testId: 'view-client' }, { value: 'cost', label: t.bom.costView, testId: 'view-cost' }]} />
      <button type="button" className={items ? 'btn-primary' : 'btn-secondary'} onClick={openPicker} data-testid="bom-add-catalog" aria-label={items ? undefined : O.addFromCatalog} title={O.addFromCatalog}>
        <PackagePlus size={18} /><span className={items ? '' : 'hidden sm:inline'}>{items ? O.addProducts : O.addFromCatalog}</span>
      </button>
      <button type="button" className="btn-secondary" onClick={addCustom} data-testid="bom-add-custom" aria-label={t.bom.addCustom} title={t.bom.addCustom}><Plus size={18} /><span className="hidden sm:inline">{t.bom.addCustom}</span></button>
      <Menu label={t.common.more} testId="bom-menu" items={[
        { label: showRemoved ? t.bom.hideRemoved(pr.excludedIds.length) : t.bom.showRemoved(pr.excludedIds.length), icon: showRemoved ? <EyeOff size={18} /> : <Eye size={18} />, onClick: () => setShowRemoved((s) => !s), hidden: !pr.excludedIds.length, testId: 'bom-show-removed' },
        { label: t.bom.reset, icon: <RotateCcw size={18} />, onClick: resetAll, hidden: !nEdited, testId: 'bom-reset' },
        { label: O.addFromCatalog, icon: <PackagePlus size={18} />, onClick: openPicker },
        { label: t.bom.addCustom, icon: <Plus size={18} />, onClick: addCustom },
      ]} />
    </div>
  )

  const table = (
    <div className="overflow-x-auto border-t border-slate-200">
      <table className="table" data-testid="bom-table">
        <thead><tr>
          <th className="w-12 text-center"><span className="sr-only">{t.bom.included}</span></th><th className="w-10">#</th><th>{t.bom.item}</th>
          <th className="num w-32">{t.bom.qty}</th><th className="w-16">{t.bom.unit}</th>
          <th className="num w-36">{clientView ? t.bom.priceIn(cur) : t.bom.costIn(cur)}</th><th className="num w-36">{t.bom.totalIn(cur)}</th><th className="w-12"><span className="sr-only">{t.common.actions}</span></th>
        </tr></thead>
        <tbody>
          {categories.map((cat) => [
            <tr key={`c-${cat}`} className="bg-slate-50"><td colSpan={6} className="font-semibold text-brand-800">{bomCatLabel(cat, t)}</td><td className="num font-semibold text-slate-700"><bdi>{m(catTotal(cat))}</bdi></td><td /></tr>,
            ...lines.filter((l) => l.category === cat).map((l) => {
              const ex = pr.excludedIds.includes(l.id), ed = edited(l.id)
              const c = pr.customItems.find((x) => x.id === l.id)
              const custom = l.source === 'custom', typed = custom && !c?.ref // typed lines: editable name / spec / unit
              return (
                <tr key={l.id} data-line-id={l.id} data-testid="bom-row" className={`${ex ? 'opacity-50' : ''} ${ed ? 'shadow-[inset_3px_0_0_0_#f59e0b] rtl:shadow-[inset_-3px_0_0_0_#f59e0b]' : ''}`}>
                  <td className="text-center">{!custom && <input type="checkbox" className="size-5 accent-brand-700" checked={!ex} onChange={() => toggle(l.id)} aria-label={t.bom.includeItem(name(l))} data-testid="bom-include" />}</td>
                  <td className="text-xs text-slate-500 tabular-nums">{numbering.get(l.id)}</td>
                  <td className="min-w-64">
                    {typed ? (
                      <div className="grid grid-cols-1 gap-1">
                        <input className="input-quiet font-medium" dir="auto" value={c?.name ?? ''} placeholder={t.bom.customItem} aria-label={t.bom.item} onChange={(e) => patchCustom(l.id, { name: e.target.value })} />
                        <input className="input-quiet text-xs text-slate-600" dir="auto" value={c?.spec ?? ''} placeholder={t.bom.spec} aria-label={t.bom.spec} onChange={(e) => patchCustom(l.id, { spec: e.target.value })} />
                      </div>
                    ) : (
                      <div className={ex ? 'line-through' : ''}>
                        <span className="font-medium text-slate-900"><bdi>{name(l)}</bdi></span>{ed && <span className="badge-warn ms-2 align-middle">{t.bom.edited}</span>}
                        {bomLineSpec(l, lang) && <Parts className="block text-xs text-slate-500" parts={bomLineSpec(l, lang).split(' · ')} />}
                        {existingBadge(l.id)}
                      </div>
                    )}
                  </td>
                  <td>{qtyInput(l, '', true)}</td>
                  <td className="text-sm text-slate-600">{typed ? <input className="input-quiet w-16" dir="auto" value={c?.unit ?? ''} aria-label={t.bom.unit} onChange={(e) => patchCustom(l.id, { unit: e.target.value })} /> : unitLabel(l.unit, t)}</td>
                  <td>{priceCell(l, true)}</td>
                  <td className="num font-semibold text-slate-900"><bdi>{m(clientView ? l.totalSell : l.totalCost)}</bdi></td>
                  <td>
                    {custom ? <IconButton label={`${t.bom.removeLine} — ${name(l)}`} className="btn-ghost text-slate-500 hover:text-red-700" onClick={() => removeCustom(l.id)}><Trash2 size={18} /></IconButton>
                      : ed ? <IconButton label={t.bom.resetLine} className="btn-ghost text-amber-700" onClick={() => resetLine(l.id)}><RotateCcw size={18} /></IconButton> : null}
                  </td>
                </tr>
              )
            }),
          ])}
        </tbody>
      </table>
    </div>
  )

  const cards = (
    <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 p-2 sm:p-3" data-testid="bom-cards">
      {categories.map((cat) => {
        const ls = lines.filter((l) => l.category === cat)
        return (
          <details key={cat} open className="disclosure group rounded-xl border border-slate-200 bg-white">
            <summary className="px-3">
              <span className="min-w-0 flex-1 font-semibold text-brand-800">{bomCatLabel(cat, t)} <span className="font-normal text-slate-500">· {ls.length}</span></span>
              <bdi className="shrink-0 font-semibold text-slate-800 tabular-nums">{m(catTotal(cat), 0)}</bdi>
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {ls.map((l) => {
                const ex = pr.excludedIds.includes(l.id), ed = edited(l.id)
                const c = pr.customItems.find((x) => x.id === l.id)
                const custom = l.source === 'custom', typed = custom && !c?.ref
                return (
                  <li key={l.id} data-line-id={l.id} data-testid="bom-card" className={`px-3 py-3 ${ex ? 'bg-slate-50' : ''} ${ed ? 'border-s-4 border-s-amber-400' : ''}`}>
                    {typed ? (
                      <div className="grid grid-cols-1 gap-2">
                        <Field label={t.bom.item}><input className="input" dir="auto" value={c?.name ?? ''} placeholder={t.bom.customItem} onChange={(e) => patchCustom(l.id, { name: e.target.value })} /></Field>
                        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                          <Field label={t.bom.spec}><input className="input" dir="auto" value={c?.spec ?? ''} onChange={(e) => patchCustom(l.id, { spec: e.target.value })} /></Field>
                          <Field label={t.bom.unit}><input className="input" dir="auto" value={c?.unit ?? ''} onChange={(e) => patchCustom(l.id, { unit: e.target.value })} /></Field>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className={`min-w-0 flex-1 ${ex ? 'opacity-60' : ''}`}>
                          <p className={`font-medium text-slate-900 ${ex ? 'line-through' : ''}`}><bdi>{name(l)}</bdi>{ed && <span className="badge-warn ms-2 align-middle">{t.bom.edited}</span>}</p>
                          {bomLineSpec(l, lang) && <Parts className="block text-xs text-slate-500" parts={bomLineSpec(l, lang).split(' · ')} />}
                          {existingBadge(l.id)}
                        </div>
                        <p className={`shrink-0 text-end font-semibold text-slate-900 tabular-nums ${ex ? 'opacity-60' : ''}`}><bdi>{m(clientView ? l.totalSell : l.totalCost)}</bdi></p>
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <label className={`block min-w-0 ${ex ? 'opacity-60' : ''}`}><span className="mb-1 block text-xs text-slate-500">{t.bom.qty}</span>{qtyInput(l, "[&_input]:px-2")}</label>
                      <label className={`block min-w-0 ${ex ? 'opacity-60' : ''}`}><span className="mb-1 block text-xs text-slate-500">{clientView ? t.bom.unitPrice : t.bom.costIn(cur)}</span>{clientView ? <span className="flex min-h-11 items-center"><bdi className="font-medium tabular-nums">{m(l.unitSell)}</bdi></span> : priceCell(l)}</label>
                      <div className="flex items-center">
                        {custom ? <IconButton label={`${t.bom.removeLine} — ${name(l)}`} className="btn-ghost text-slate-500 hover:text-red-700" onClick={() => removeCustom(l.id)}><Trash2 size={18} /></IconButton>
                          : <>
                            {ed && <IconButton label={t.bom.resetLine} className="btn-ghost text-amber-700" onClick={() => resetLine(l.id)}><RotateCcw size={18} /></IconButton>}
                            <Switch checked={!ex} onChange={() => toggle(l.id)} label={<span className="sr-only">{t.bom.includeItem(name(l))}</span>} data-testid="bom-include" />
                          </>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
    </div>
  )

  const panel = <PricingPanel quote={quote} p={p} clientView={clientView} setPr={setPr} setSite={setSite} items={items} goSite={() => goTo('site')} perWpKwp={r.arrayKwp} />
  const picker = <CatalogSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addFromCatalog} customItems={pr.customItems} quote={quote} clientView={clientView} />

  // Product quote with nothing in it yet: the catalogue is the way in
  if (items && !pr.customItems.length) return (
    <div className="space-y-4 sm:space-y-5" data-testid="bom-empty">
      <EmptyState icon={PackagePlus} title={O.emptyTitle} body={O.emptyBody}>
        <button type="button" className="btn-primary min-h-12 px-6 text-base" onClick={openPicker} data-testid="bom-add-products"><PackagePlus size={20} />{O.addProducts}</button>
        <button type="button" className="btn-secondary min-h-12" onClick={addCustom} data-testid="bom-add-custom"><Plus size={18} />{t.bom.addCustom}</button>
      </EmptyState>
      {picker}
    </div>
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      <p className={`rounded-lg px-3 py-2 text-sm ${clientView ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'}`} data-testid="bom-view-note">{clientView ? t.bom.clientNote : t.bom.costNote}</p>
      {picker}
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-5">
          <Section flush title={t.bom.title} description={<>{t.bom.nLines(quote.lines.length)} · {t.bom.pricesNote}</>} right={toolbar}>{table}</Section>
          <aside className="sticky top-20 space-y-4">{panel}</aside>
        </div>
      ) : (
        <>
          <section className="card p-4" data-testid="bom-totals">
            <TotalsList quote={quote} clientView={clientView} items={items} />
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setPricingOpen(true)} data-testid="bom-adjust"><SlidersHorizontal size={18} />{t.bom.adjust}</button>
          </section>
          <Section flush title={t.bom.title} description={t.bom.nLines(quote.lines.length)} right={toolbar}>{cards}</Section>
          <Sheet open={pricingOpen} onClose={() => setPricingOpen(false)} title={t.bom.pricingTitle} testId="pricing-sheet" footer={<button type="button" className="btn-primary w-full" onClick={() => setPricingOpen(false)}>{t.common.done}</button>}>
            <PricingControls quote={quote} p={p} clientView={clientView} setPr={setPr} setSite={setSite} items={items} goSite={() => { setPricingOpen(false); goTo('site') }} />
            <div className="mt-4 border-t border-slate-100 pt-3"><TotalsList quote={quote} clientView={clientView} items={items} /></div>
          </Sheet>
        </>
      )}
    </div>
  )
}

function Line({ k, v, strong }: { k: ReactNode; v: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}><dt className="min-w-0">{k}</dt><dd className="shrink-0 tabular-nums"><bdi>{v}</bdi></dd></div>
}

function TotalsList({ quote: q, clientView, items = false }: { quote: Quote; clientView: boolean; items?: boolean }) {
  const { t } = useT()
  const m = (v: number) => formatQuoteMoney(v, q)
  return (
    <div data-testid="bom-totals-list">
      <dl className="text-sm">
        {!clientView && <>
          <Line k={t.bom.equipment} v={m(q.equipmentCost)} />
          {!(items && q.servicesCost === 0) && <Line k={t.bom.services} v={m(q.servicesCost)} />}
          <Line k={t.bom.costSubtotal} v={m(q.costSubtotal)} strong />
          <Line k={<>{t.bom.margin} <bdi>({fmt(q.markupPct, q.markupPct % 1 ? 1 : 0)}%)</bdi></>} v={'+' + m(q.markup)} />
        </>}
        <Line k={t.bom.sellSubtotal} v={m(q.sellSubtotal)} strong={clientView} />
        {q.discount > 0 && <Line k={<>{t.bom.discount} <bdi>({fmt(q.discountPct, q.discountPct % 1 ? 1 : 0)}%)</bdi></>} v={formatQuoteMoney(-q.discount, q)} />}
        {q.vat > 0 && <Line k={<>{t.bom.vat} <bdi>({fmt(q.vatPct, q.vatPct % 1 ? 1 : 0)}%)</bdi></>} v={m(q.vat)} />}
      </dl>
      <div className="mt-2 flex items-end justify-between gap-3 border-t border-slate-200 pt-3">
        <span className="text-sm font-medium text-slate-700">{t.bom.grand}</span>
        <bdi className="text-kpi-sm text-slate-900 tabular-nums sm:text-2xl sm:font-semibold" data-testid="bom-grand">{m(q.total)}</bdi>
      </div>
      {!clientView && q.sellSubtotal > 0 && <p className="mt-1 text-end text-xs text-slate-500">{t.bom.grossMargin(fmt(q.grossMarginPct, 1))}</p>}
    </div>
  )
}

interface ControlsProps { quote: Quote; p: Project; clientView: boolean; setPr: (fn: (x: PricingInput) => Partial<PricingInput>) => void; setSite: (patch: Partial<SiteInput>) => void; items: boolean; goSite: () => void }
function PricingControls({ quote: q, p, clientView, setPr, setSite, items, goSite }: ControlsProps) {
  const { t, dir, lang } = useT()
  const O = t.outputs.bom
  const pr = p.pricing, s = p.site
  const fx = q.fx
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight
  const local = s.currency !== 'USD'
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      {!clientView && <Field label={t.bom.markup} help={q.sellSubtotal > 0 ? t.bom.grossMargin(fmt(q.grossMarginPct, 1)) : t.bom.markupHelp} className="col-span-2"><NumberInput value={pr.marginPct} min={0} max={300} onChange={(v) => setPr(() => ({ marginPct: v ?? 0 }))} suffix="%" data-testid="bom-markup" /></Field>}
      <Field label={t.bom.discount}><NumberInput value={pr.discountPct} min={0} max={100} onChange={(v) => setPr(() => ({ discountPct: v ?? 0 }))} suffix="%" data-testid="bom-discount" /></Field>
      <Field label={t.bom.vat}><NumberInput value={pr.vatPct} min={0} max={50} onChange={(v) => setPr(() => ({ vatPct: v ?? 0 }))} suffix="%" data-testid="bom-vat" /></Field>
      {!clientView && !items && <>
        <p className="col-span-2 -mb-2 text-sm font-semibold text-slate-800">{t.bom.services}</p>
        <Field label={t.bom.labourPerKw} className="col-span-2"><NumberInput value={Math.round(pr.labourPerKwUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ labourPerKwUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
        <Field label={t.bom.transport}><NumberInput value={Math.round(pr.transportUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ transportUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
        <Field label={t.bom.commissioning}><NumberInput value={Math.round(pr.commissioningUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ commissioningUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
      </>}
      {items ? <>
        {/* A product quote has no Site step: currency and rate are set here */}
        <Field label={O.currency} className={local ? '' : 'col-span-2'}>
          <select className="input" value={s.currency} onChange={(e) => { const c = e.target.value; setSite({ currency: c, fxRateToUsd: c === 'USD' ? 1 : defaultFx(c) }) }} data-testid="bom-currency">
            {currencies.map((c) => <option key={c.code} value={c.code}>{`${c.code} — ${currencyName(c.code, lang)}`}</option>)}
            {!currencies.some((c) => c.code === s.currency) && <option value={s.currency}>{s.currency}</option>}
          </select>
        </Field>
        {local && (
          <Field label={O.fx} help={Math.abs(s.fxRateToUsd - defaultFx(s.currency)) < 1e-9 ? O.fxIndicative : <bdi>{O.fxLabel(s.currency)}</bdi>}>
            <NumberInput value={s.fxRateToUsd} min={0.0001} step={0.01} onChange={(v) => v != null && v > 0 && setSite({ fxRateToUsd: v })} suffix={s.currency} invalid={!(s.fxRateToUsd > 0)} data-testid="bom-fx" />
          </Field>
        )}
      </> : (
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <bdi>{q.currency === 'USD' ? 'USD' : `1 USD = ${fmt(fx, fx < 10 ? 4 : 2)} ${q.currency}`}</bdi>
          <button type="button" className="btn-link min-h-9" onClick={goSite}>{t.site.economics}<Arrow size={14} /></button>
        </div>
      )}
    </div>
  )
}

function PricingPanel({ perWpKwp, ...c }: ControlsProps & { perWpKwp: number }) {
  const { t } = useT()
  const q = c.quote
  return (
    <section className="card max-h-[calc(100dvh-10.5rem)] overflow-y-auto overscroll-contain p-5" data-testid="bom-panel">
      <h3 className="card-title mb-3">{t.bom.pricingTitle}</h3>
      <TotalsList quote={q} clientView={c.clientView} items={c.items} />
      {perWpKwp > 0 && <p className="mt-1 text-end text-xs text-slate-500"><bdi>{`${fmt(perWpKwp, 2)} kWp · ${t.bom.perWp(formatQuoteMoney(q.total / (perWpKwp * 1000), q, 2))}`}</bdi></p>}
      <div className="mt-4 border-t border-slate-100 pt-4"><PricingControls {...c} /></div>
    </section>
  )
}

// ---------------------------------------------------------------- "Add from catalogue" sheet
const TABS = ['all', 'panels', 'inverters', 'batteries', 'controllers', 'items', 'own'] as const
type Tab = (typeof TABS)[number]
const MAX_SHOWN = 60

/** Search + category tabs over the company price list; tapping a product adds it (again = one more). Prices in the quote currency. */
function CatalogSheet({ open, onClose, onAdd, customItems, quote: q, clientView }: { open: boolean; onClose: () => void; onAdd: (e: Entry) => void; customItems: BomLine[]; quote: Quote; clientView: boolean }) {
  const { t, lang } = useT()
  const O = t.outputs.bom
  const cat = useCatalog()
  const entries = useMemo(() => catalogEntries(cat, t), [cat, t])
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [said, setSaid] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const deferred = useDeferredValue(query)
  const hasOwn = entries.some((e) => e.own)
  const tabs = TABS.filter((x) => x !== 'own' || hasOwn)
  const inQuote = useMemo(() => {
    const mm = new Map<string, number>()
    for (const c of customItems) if (c.ref) mm.set(c.ref, (mm.get(c.ref) ?? 0) + (Number.isFinite(c.qty) ? c.qty : 0))
    return mm
  }, [customItems])
  const found = useMemo(() => {
    const words = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return entries.filter((e) => (tab === 'all' || (tab === 'own' ? e.own : e.kind === tab)) && words.every((w) => e.hay.includes(w)))
  }, [entries, tab, deferred])
  const shown = found.slice(0, MAX_SHOWN)
  const k = 1 + q.markupPct / 100
  const price = (usd: number) => {
    const unitCost = roundTo(usd * q.fx, q.decimals)
    return formatQuoteMoney(clientView ? roundTo(unitCost * k, q.decimals) : unitCost, q)
  }
  const add = (e: Entry) => { onAdd(e); setSaid(O.added(entryName(e, lang), (inQuote.get(e.id) ?? 0) + 1)) }

  return (
    <Sheet open={open} onClose={onClose} title={O.pickerTitle} description={O.pickerHelp} variant="drawer" wide testId="catalog-sheet" initialFocus={search}
      footer={<button type="button" className="btn-primary w-full sm:w-auto" onClick={onClose} data-testid="catalog-done">{t.common.done}</button>}>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
        <div className="input-group">
          <span className="flex shrink-0 items-center ps-3 text-slate-400" aria-hidden="true"><Search size={18} /></span>
          <input ref={search} type="text" inputMode="search" dir="auto" enterKeyHint="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={O.search} aria-label={O.search} data-testid="catalog-search" />
          {query && <button type="button" className="adorn-btn" aria-label={O.clearSearch} title={O.clearSearch} onClick={() => { setQuery(''); search.current?.focus() }}><X size={18} /></button>}
        </div>
        <div role="group" aria-label={O.pickerTitle} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5" data-testid="catalog-tabs">
          {tabs.map((x) => (
            <button key={x} type="button" aria-pressed={tab === x} className="chip min-h-11" onClick={() => setTab(x)} data-testid={`catalog-tab-${x}`}>{O.tabs[x]}</button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-emerald-700" data-testid="catalog-status">{said && <bdi>{said}</bdi>}</p>
      </div>
      {/* min height: the sheet keeps its size while the list is filtered */}
      <div className="min-h-[50dvh]">
        {shown.length === 0 ? <p className="py-8 text-center text-sm text-slate-600">{O.noResults}</p> : (
          <ul className="divide-y divide-slate-100" data-testid="catalog-list">
            {shown.map((e) => {
              const n = inQuote.get(e.id) ?? 0
              return (
                <li key={e.id}>
                  <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    onClick={() => add(e)} data-testid="catalog-item" data-id={e.id}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900"><bdi>{entryName(e, lang)}</bdi></span>
                      <Parts className="block text-xs text-slate-500" parts={[bomCatLabel(e.category, t), ...entrySpec(e, lang).split(' · ')]} />
                      {(e.own || n > 0) && <span className="mt-1 flex flex-wrap gap-1">
                        {e.own && <span className="badge-neutral">{O.own}</span>}
                        {n > 0 && <span className="badge-ok" data-testid="catalog-in-quote">{O.inQuote(n)}</span>}
                      </span>}
                    </span>
                    <span className="shrink-0 text-end">
                      <bdi className="block text-sm font-semibold text-slate-900 tabular-nums">{e.priceUsd > 0 ? price(e.priceUsd) : O.noPrice}</bdi>
                      <span className="text-xs text-slate-500">{unitLabel(e.unit, t)}</span>
                    </span>
                    <PackagePlus size={20} className="shrink-0 text-brand-700" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {found.length > shown.length && <p className="pt-3 text-center text-xs text-slate-500">{O.showing(shown.length, found.length)}</p>}
      </div>
    </Sheet>
  )
}
