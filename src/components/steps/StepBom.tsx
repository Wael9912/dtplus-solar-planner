import { useMemo, useState, type ReactNode } from 'react'
import { Plus, RotateCcw, Trash2, SlidersHorizontal, Eye, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Segmented, Switch, IconButton } from '../ui'
import { useIsDesktop } from '../hooks'
import { Sheet, Menu } from '../overlay'
import type { StepProps } from '../Wizard'
import type { BomLine, PricingInput, Project } from '../../engine/types'
import { fmt } from '../../engine/format'
import { uid } from '../../engine/defaults'
import { computeProject } from '../../engine/compute'
import { buildQuote, formatQuoteMoney, type Quote, type QuoteLine } from '../../engine/quote'
import { useAppStore } from '../../store/useAppStore'
import { bomCatLabel, bomLineName, bomLineSpec, unitLabel } from '../../i18n/labels'
import { toast } from '../../store/useToast'

const SERVICE_FIELD = { labour: 'labourPerKwUsd', transport: 'transportUsd', commissioning: 'commissioningUsd' } as const
type ServiceId = keyof typeof SERVICE_FIELD
const isService = (id: string): id is ServiceId => id in SERVICE_FIELD
function omit<T extends Record<string, unknown>>(o: T, k: string): T { const c = { ...o }; delete c[k]; return c }

export function StepBom({ project: p, results: r, quote, update, goTo }: StepProps) {
  const { t, lang } = useT()
  const desktop = useIsDesktop()
  const clientView = useAppStore((s) => s.clientView)
  const setClientView = useAppStore((s) => s.setClientView)
  const [showRemoved, setShowRemoved] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const pr = p.pricing
  const fx = quote.fx
  const cur = quote.currency
  const setPr = (fn: (x: PricingInput) => Partial<PricingInput>) => update((prev) => ({ pricing: { ...prev.pricing, ...fn(prev.pricing) } }))
  const m = (v: number, d = quote.decimals) => formatQuoteMoney(v, quote, d)

  // Lines incl. excluded ones (greyed) when the user asks to see them
  const allQuote = useMemo(() => {
    if (!showRemoved || !pr.excludedIds.length) return quote
    const pAll: Project = { ...p, pricing: { ...pr, excludedIds: [] } }
    return buildQuote(pAll, computeProject(pAll))
  }, [showRemoved, p, pr, quote])
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

  const name = (l: QuoteLine) => bomLineName(l, lang, t)
  const qtyInput = (l: QuoteLine, cls = '', quiet = false) => (
    <NumberInput quiet={quiet} align={quiet ? 'end' : 'start'} className={cls} value={l.qty} min={0} onChange={(v) => setQty(l, v)} aria-label={`${t.bom.qty} — ${name(l)}`} suffix={quiet ? undefined : unitLabel(l.unit, t)} />
  )
  const priceCell = (l: QuoteLine, quiet = false) => clientView
    ? <span className="block text-end font-medium text-slate-900 tabular-nums"><bdi>{m(l.unitSell)}</bdi></span>
    : <NumberInput quiet={quiet} align={quiet ? 'end' : 'start'} value={l.unitCost} min={0} step={0.5} onChange={(v) => setPrice(l, v)} aria-label={`${t.bom.costIn(cur)} — ${name(l)}`} />
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label={t.nav.clientView} value={clientView ? 'client' : 'cost'} onChange={(v) => setClientView(v === 'client')} options={[{ value: 'client', label: t.bom.clientPrices, testId: 'view-client' }, { value: 'cost', label: t.bom.costView, testId: 'view-cost' }]} />
      <button type="button" className="btn-secondary" onClick={addCustom} data-testid="bom-add-custom"><Plus size={18} /><span className="hidden sm:inline">{t.bom.addCustom}</span></button>
      <Menu label={t.common.more} testId="bom-menu" items={[
        { label: showRemoved ? t.bom.hideRemoved : t.bom.showRemoved(pr.excludedIds.length), icon: showRemoved ? <EyeOff size={18} /> : <Eye size={18} />, onClick: () => setShowRemoved((s) => !s), hidden: !pr.excludedIds.length, testId: 'bom-show-removed' },
        { label: t.bom.reset, icon: <RotateCcw size={18} />, onClick: resetAll, hidden: !nEdited, testId: 'bom-reset' },
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
              const ex = pr.excludedIds.includes(l.id), custom = l.source === 'custom', ed = edited(l.id)
              const c = pr.customItems.find((x) => x.id === l.id)
              return (
                <tr key={l.id} data-line-id={l.id} data-testid="bom-row" className={`${ex ? 'opacity-50' : ''} ${ed ? 'shadow-[inset_3px_0_0_0_#f59e0b] rtl:shadow-[inset_-3px_0_0_0_#f59e0b]' : ''}`}>
                  <td className="text-center">{!custom && <input type="checkbox" className="size-5 accent-brand-700" checked={!ex} onChange={() => toggle(l.id)} aria-label={t.bom.includeItem(name(l))} data-testid="bom-include" />}</td>
                  <td className="text-xs text-slate-500 tabular-nums">{numbering.get(l.id)}</td>
                  <td className="min-w-64">
                    {custom ? (
                      <div className="grid grid-cols-1 gap-1">
                        <input className="input-quiet font-medium" dir="auto" value={c?.name ?? ''} placeholder={t.bom.customItem} aria-label={t.bom.item} onChange={(e) => patchCustom(l.id, { name: e.target.value })} />
                        <input className="input-quiet text-xs text-slate-600" dir="auto" value={c?.spec ?? ''} placeholder={t.bom.spec} aria-label={t.bom.spec} onChange={(e) => patchCustom(l.id, { spec: e.target.value })} />
                      </div>
                    ) : (
                      <div className={ex ? 'line-through' : ''}>
                        <span className="font-medium text-slate-900"><bdi>{name(l)}</bdi></span>{ed && <span className="badge-warn ms-2 align-middle">{t.bom.edited}</span>}
                        {bomLineSpec(l, lang) && <span className="block text-xs text-slate-500"><bdi>{bomLineSpec(l, lang)}</bdi></span>}
                      </div>
                    )}
                  </td>
                  <td>{qtyInput(l, '', true)}</td>
                  <td className="text-sm text-slate-600">{custom ? <input className="input-quiet w-16" dir="auto" value={c?.unit ?? ''} aria-label={t.bom.unit} onChange={(e) => patchCustom(l.id, { unit: e.target.value })} /> : unitLabel(l.unit, t)}</td>
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
                const ex = pr.excludedIds.includes(l.id), custom = l.source === 'custom', ed = edited(l.id)
                const c = pr.customItems.find((x) => x.id === l.id)
                return (
                  <li key={l.id} data-line-id={l.id} data-testid="bom-card" className={`px-3 py-3 ${ex ? 'bg-slate-50' : ''} ${ed ? 'border-s-4 border-s-amber-400' : ''}`}>
                    {custom ? (
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
                          {bomLineSpec(l, lang) && <p className="text-xs text-slate-500"><bdi>{bomLineSpec(l, lang)}</bdi></p>}
                        </div>
                        <p className={`shrink-0 text-end font-semibold text-slate-900 tabular-nums ${ex ? 'opacity-60' : ''}`}><bdi>{m(clientView ? l.totalSell : l.totalCost)}</bdi></p>
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <label className="block min-w-0"><span className="mb-1 block text-xs text-slate-500">{t.bom.qty}</span>{qtyInput(l)}</label>
                      <label className="block min-w-0"><span className="mb-1 block text-xs text-slate-500">{clientView ? t.bom.unitPrice : t.bom.costIn(cur)}</span>{clientView ? <span className="flex min-h-11 items-center"><bdi className="font-medium tabular-nums">{m(l.unitSell)}</bdi></span> : priceCell(l)}</label>
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

  const panel = <PricingPanel quote={quote} p={p} clientView={clientView} setPr={setPr} goSite={() => goTo('site')} perWpKwp={r.arrayKwp} />

  return (
    <div className="space-y-4 sm:space-y-5">
      <p className={`rounded-lg px-3 py-2 text-sm ${clientView ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'}`} data-testid="bom-view-note">{clientView ? t.bom.clientNote : t.bom.costNote}</p>
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-5">
          <Section flush title={t.bom.title} description={<>{t.bom.nLines(quote.lines.length)} · {t.bom.pricesNote}</>} right={toolbar}>{table}</Section>
          <aside className="sticky top-20 space-y-4">{panel}</aside>
        </div>
      ) : (
        <>
          <section className="card p-4" data-testid="bom-totals">
            <TotalsList quote={quote} clientView={clientView} />
            <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setPricingOpen(true)} data-testid="bom-adjust"><SlidersHorizontal size={18} />{t.bom.adjust}</button>
          </section>
          <Section flush title={t.bom.title} description={t.bom.nLines(quote.lines.length)} right={toolbar}>{cards}</Section>
          <Sheet open={pricingOpen} onClose={() => setPricingOpen(false)} title={t.bom.pricingTitle} testId="pricing-sheet" footer={<button type="button" className="btn-primary w-full" onClick={() => setPricingOpen(false)}>{t.common.done}</button>}>
            <PricingControls quote={quote} p={p} clientView={clientView} setPr={setPr} goSite={() => { setPricingOpen(false); goTo('site') }} />
            <div className="mt-4 border-t border-slate-100 pt-3"><TotalsList quote={quote} clientView={clientView} /></div>
          </Sheet>
        </>
      )}
    </div>
  )
}

function Line({ k, v, strong }: { k: ReactNode; v: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}><dt className="min-w-0">{k}</dt><dd className="shrink-0 tabular-nums"><bdi>{v}</bdi></dd></div>
}

function TotalsList({ quote: q, clientView }: { quote: Quote; clientView: boolean }) {
  const { t } = useT()
  const m = (v: number) => formatQuoteMoney(v, q)
  return (
    <div data-testid="bom-totals-list">
      <dl className="text-sm">
        {!clientView && <>
          <Line k={t.bom.equipment} v={m(q.equipmentCost)} />
          <Line k={t.bom.services} v={m(q.servicesCost)} />
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

function PricingControls({ quote: q, p, clientView, setPr, goSite }: { quote: Quote; p: Project; clientView: boolean; setPr: (fn: (x: PricingInput) => Partial<PricingInput>) => void; goSite: () => void }) {
  const { t, dir } = useT()
  const pr = p.pricing
  const fx = q.fx
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      {!clientView && <Field label={t.bom.markup} help={q.sellSubtotal > 0 ? t.bom.grossMargin(fmt(q.grossMarginPct, 1)) : t.bom.markupHelp} className="col-span-2"><NumberInput value={pr.marginPct} min={0} max={300} onChange={(v) => setPr(() => ({ marginPct: v ?? 0 }))} suffix="%" data-testid="bom-markup" /></Field>}
      <Field label={t.bom.discount}><NumberInput value={pr.discountPct} min={0} max={100} onChange={(v) => setPr(() => ({ discountPct: v ?? 0 }))} suffix="%" data-testid="bom-discount" /></Field>
      <Field label={t.bom.vat}><NumberInput value={pr.vatPct} min={0} max={50} onChange={(v) => setPr(() => ({ vatPct: v ?? 0 }))} suffix="%" data-testid="bom-vat" /></Field>
      {!clientView && <>
        <p className="col-span-2 -mb-2 text-sm font-semibold text-slate-800">{t.bom.services}</p>
        <Field label={t.bom.labourPerKw} className="col-span-2"><NumberInput value={Math.round(pr.labourPerKwUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ labourPerKwUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
        <Field label={t.bom.transport}><NumberInput value={Math.round(pr.transportUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ transportUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
        <Field label={t.bom.commissioning}><NumberInput value={Math.round(pr.commissioningUsd * fx * 100) / 100} min={0} onChange={(v) => setPr(() => ({ commissioningUsd: (v ?? 0) / fx }))} suffix={q.currency} /></Field>
      </>}
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <bdi>{q.currency === 'USD' ? 'USD' : `1 USD = ${fmt(fx, fx < 10 ? 4 : 2)} ${q.currency}`}</bdi>
        <button type="button" className="btn-link min-h-9" onClick={goSite}>{t.site.economics}<Arrow size={14} /></button>
      </div>
    </div>
  )
}

function PricingPanel({ quote: q, p, clientView, setPr, goSite, perWpKwp }: { quote: Quote; p: Project; clientView: boolean; setPr: (fn: (x: PricingInput) => Partial<PricingInput>) => void; goSite: () => void; perWpKwp: number }) {
  const { t } = useT()
  return (
    <section className="card max-h-[calc(100dvh-10.5rem)] overflow-y-auto overscroll-contain p-5" data-testid="bom-panel">
      <h3 className="card-title mb-3">{t.bom.pricingTitle}</h3>
      <TotalsList quote={q} clientView={clientView} />
      {perWpKwp > 0 && <p className="mt-1 text-end text-xs text-slate-500"><bdi>{`${fmt(perWpKwp, 2)} kWp · ${t.bom.perWp(formatQuoteMoney(q.total / (perWpKwp * 1000), q, 2))}`}</bdi></p>}
      <div className="mt-4 border-t border-slate-100 pt-4"><PricingControls quote={q} p={p} clientView={clientView} setPr={setPr} goSite={goSite} /></div>
    </section>
  )
}
