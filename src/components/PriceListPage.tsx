import { memo, useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Search, RotateCcw, Pencil, Plus, ChevronDown, Copy, Trash2, Percent, PackagePlus, X, CheckCheck, Ban, SlidersHorizontal } from 'lucide-react'
import { useAppStore, type ProductKind } from '../store/useAppStore'
import { useT, type Dict, type Lang } from '../i18n'
import { usePriceBook } from './useEngine'
import { resolveCatalog, type ResolvedCatalog } from '../engine/catalogContext'
import { fmt, fxOf, money } from '../engine/format'
import { bomCatLabel, fmtDate, unitLabel } from '../i18n/labels'
import { Field, NumberInput, Parts, Segmented, Switch, EmptyState, IconButton } from './ui'
import { ConfirmDialog, Menu, Sheet } from './overlay'
import { ProductForm, type CurView, type Product } from './ProductForm'
import { toast } from '../store/useToast'
import type { CustomProducts, PriceBook } from '../engine/types'

type Tab = ProductKind | 'mine'
const FAMILIES: ProductKind[] = ['panels', 'inverters', 'batteries', 'chargeControllers', 'items']
const TABS: Tab[] = [...FAMILIES, 'mine']
const ENTRY_KEY = 'dtplus-prices-entry'
/** Key of the product form instance (a fresh draft each time the form opens). */
let formSeq = 0

/** One product row of the list (stable while only prices / stock change, so memoised rows skip re-rendering). */
interface Desc { id: string; kind: ProductKind; title: string; sub: string[]; search: string; base: number; own: boolean; cat: string; unit: string }

const round2 = (x: number) => Math.round(x * 100) / 100
const decFor = (v: number) => (Math.abs(v) >= 1000 || Number.isInteger(round2(v)) ? 0 : 2)

/** Rows of every family: catalogue + own products, base (catalogue / own) price, key spec and a search string. */
function describe(base: ResolvedCatalog, own: Set<string>, t: Dict, lang: Lang): Record<ProductKind, Desc[]> {
  const tp = t.prices
  const mk = (kind: ProductKind, x: { id: string; approxPriceUsd: number }, title: string, sub: (string | false | null | undefined)[], extra = '', cat = '', unit = 'pcs'): Desc => {
    const parts = sub.filter(Boolean) as string[]
    return { id: x.id, kind, title, sub: parts, base: x.approxPriceUsd, own: own.has(x.id), cat, unit, search: `${title} ${parts.join(' ')} ${extra} ${x.id}`.toLowerCase() }
  }
  const bv = (v: string | number | null) => (v == null ? null : typeof v === 'string' ? `HV ${v} V` : `${v} V`)
  return {
    panels: [...base.panels].sort((a, b) => a.watts - b.watts || a.brand.localeCompare(b.brand)).map((x) =>
      mk('panels', x, `${x.brand} ${x.model}`, [`${x.watts} W`, t.design.tech[x.technology] ?? x.technology, `${fmt(x.efficiencyPct, 1)}%`, x.bifacial && tp.bifacial], x.technology)),
    inverters: [...base.inverters].sort((a, b) => a.ratedAcKw - b.ratedAcKw || a.brand.localeCompare(b.brand)).map((x) =>
      mk('inverters', x, `${x.brand} ${x.model}`, [`${fmt(x.ratedAcKw, 1)} kW`, t.design.invTypes[x.type] ?? x.type, t.design.phaseN(x.phase), bv(x.batteryVoltage)], x.type)),
    batteries: [...base.batteries].sort((a, b) => a.energyKwh - b.energyKwh || a.brand.localeCompare(b.brand)).map((x) =>
      mk('batteries', x, `${x.brand} ${x.model}`, [`${fmt(x.energyKwh, x.energyKwh < 10 ? 2 : 1)} kWh`, `${x.nominalVoltage} V`, `${fmt(x.capacityAh)} Ah`, t.design.chem[x.chemistry] ?? x.chemistry], x.chemistry)),
    chargeControllers: [...base.chargeControllers].sort((a, b) => a.maxChargeA - b.maxChargeA || a.brand.localeCompare(b.brand)).map((x) =>
      mk('chargeControllers', x, `${x.brand} ${x.model}`, [`${x.maxChargeA} A`, tp.pvMax(`${x.maxPvVoltage} V`), x.type, x.batteryVoltages.join('/') + ' V'])),
    // The generator is priced per kVA by the engine (generatorPriceUsd), not from the list
    items: base.items.filter((x) => x.id !== 'generator').map((x) => mk('items', x, lang === 'ar' ? x.nameAr || x.name : x.name, [lang === 'ar' ? x.specAr || x.spec : x.spec],
      `${x.name} ${x.nameAr ?? ''} ${x.spec ?? ''} ${x.specAr ?? ''} ${bomCatLabel(x.category, t)}`, x.category, x.unit)),
  }
}

/** Replace the price of some own products (USD) inside a price list. */
function withOwnPrices(c: CustomProducts, next: Map<string, number>): CustomProducts {
  const out = { ...c } as Record<ProductKind, Product[]>
  for (const k of FAMILIES) if (out[k].some((x) => next.has(x.id))) out[k] = out[k].map((x) => (next.has(x.id) ? { ...x, approxPriceUsd: next.get(x.id)! } : x))
  return out as unknown as CustomProducts
}
/** Change the price list and offer Undo (puts the list back as it was). */
function changeBook(fn: (b: PriceBook) => PriceBook, message: string, undo: string) {
  const st = useAppStore.getState()
  const before = st.company.priceBook
  st.setPriceBook(fn)
  toast({ message, action: { label: undo, run: () => useAppStore.getState().setPriceBook(() => before) } })
}

const PriceRow = memo(function PriceRow({ d, override, hidden, cur, onEdit }: { d: Desc; override: number | undefined; hidden: boolean; cur: CurView; onEdit: (d: Desc) => void }) {
  const { t } = useT()
  const tp = t.prices
  const usd = override ?? d.base
  const edited = !d.own && override != null
  const other = cur.other(usd)
  const unit = d.unit !== 'pcs' ? unitLabel(d.unit, t) : null
  const onPrice = (v: number | null) => {
    const st = useAppStore.getState()
    if (d.own) {
      if (v == null) return
      const u = cur.fromShow(v)
      st.setPriceBook((b) => { const prices = { ...b.prices }; delete prices[d.id]; return { ...b, prices, custom: withOwnPrices(b.custom, new Map([[d.id, u]])) } })
      return
    }
    // Typing the catalogue price (or clearing the field) goes back to the catalogue
    if (v == null || Math.abs(v - round2(cur.toShow(d.base))) < 0.005) st.setPrice(d.id, null)
    else st.setPrice(d.id, cur.fromShow(v))
  }
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem_5rem_2.75rem] md:gap-x-3 md:px-5" data-testid={`row-${d.id}`}>
      <div className="col-span-3 min-w-0 md:col-span-1">
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${hidden ? 'text-slate-500' : 'text-slate-900'}`}>
          <bdi className="min-w-0 break-words">{d.title}</bdi>
          {d.own && <span className="badge-info">{tp.mine}</span>}
          {edited && <span className="badge-warn">{tp.edited}</span>}
          {hidden && <span className="badge-neutral">{tp.notStocked}</span>}
        </p>
        {d.sub.length > 0 && <Parts parts={d.sub} className="mt-0.5 block text-xs text-slate-600" />}
      </div>
      <div className="hidden text-end text-sm text-slate-600 tabular-nums md:block">
        {d.own ? <span className="text-xs text-slate-500">{tp.ownProduct}</span> : <bdi>{cur.fmt(d.base)}</bdi>}
      </div>
      <div className="min-w-0">
        <NumberInput value={round2(cur.toShow(usd))} onChange={onPrice} min={0} allowEmpty={!d.own} align="end" suffix={unit ? tp.perUnit(cur.code, unit) : cur.code}
          aria-label={tp.priceFor(d.title)} data-testid={`price-${d.id}`} />
        <p className="mt-1 text-xs text-slate-500">
          <span className="md:hidden">{d.own ? tp.ownProduct : <>{tp.catalogue} <bdi>{cur.fmt(d.base)}</bdi></>}{other && ' · '}</span>
          {other && <bdi>{tp.approx(other)}</bdi>}
        </p>
      </div>
      <Switch checked={!hidden} onChange={(v) => useAppStore.getState().setHidden(d.id, !v)} data-testid={`stock-${d.id}`}
        label={<><span className="md:sr-only">{tp.stocked}</span><span className="sr-only"> · {d.title}</span></>} />
      {d.own
        ? <IconButton label={tp.editOwn} onClick={() => onEdit(d)} data-testid={`edit-${d.id}`}><Pencil size={18} /></IconButton>
        : edited
          ? <IconButton label={tp.reset} onClick={() => useAppStore.getState().setPrice(d.id, null)} data-testid={`reset-${d.id}`}><RotateCcw size={18} /></IconButton>
          : <span className="size-11" aria-hidden="true" />}
    </li>
  )
})

function OwnRow({ d, price, hidden, cur, onEdit, onDuplicate, onDelete }: { d: Desc; price: number; hidden: boolean; cur: CurView; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { t } = useT()
  const tp = t.prices
  return (
    <li className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 last:border-b-0 sm:px-3" data-testid={`own-${d.id}`}>
      <button type="button" onClick={onEdit} className="flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center rounded-lg px-2 py-1.5 text-start hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-900"><bdi className="min-w-0 break-words">{d.title}</bdi>{hidden && <span className="badge-neutral">{tp.notStocked}</span>}</span>
        {d.sub.length > 0 && <Parts parts={d.sub} className="mt-0.5 block text-xs text-slate-600" />}
      </button>
      <span className="shrink-0 text-sm font-medium text-slate-800 tabular-nums"><bdi>{cur.fmt(price)}</bdi></span>
      <Menu label={tp.actionsFor(d.title)} testId={`own-menu-${d.id}`} items={[
        { label: tp.edit, icon: <Pencil size={18} />, onClick: onEdit, testId: 'own-edit' },
        { label: tp.duplicate, icon: <Copy size={18} />, onClick: onDuplicate, testId: 'own-duplicate' },
        { label: tp.delete, icon: <Trash2 size={18} />, onClick: onDelete, danger: true, testId: 'own-delete' },
      ]} />
    </li>
  )
}

function GroupHeader({ title, count, edited, open, onToggle, testId }: { title: string; count: number; edited: number; open: boolean; onToggle: () => void; testId: string }) {
  const { t } = useT()
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} data-testid={testId}
      className="flex min-h-12 w-full items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-start hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset md:px-5">
      <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{title} <span className="font-normal text-slate-500">{count}</span></span>
      {edited > 0 && <span className="badge-warn">{t.prices.editedN(edited)}</span>}
    </button>
  )
}

const readEntry = (): 'usd' | 'local' => { try { return localStorage.getItem(ENTRY_KEY) === 'local' ? 'local' : 'usd' } catch { return 'usd' } }

export function PriceListPage() {
  const { t, lang } = useT()
  const tp = t.prices
  const book = usePriceBook()
  const currency = useAppStore((s) => s.company.currency)
  const fxRate = useAppStore((s) => s.company.fxRateToUsd)
  const [tab, setTab] = useState<Tab>('panels')
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query).trim().toLowerCase()
  const [editedOnly, setEditedOnly] = useState(false)
  const [hiddenOnly, setHiddenOnly] = useState(false)
  const [entry, setEntryState] = useState<'usd' | 'local'>(readEntry)
  const setEntry = (v: 'usd' | 'local') => { setEntryState(v); try { localStorage.setItem(ENTRY_KEY, v) } catch { /* storage unavailable */ } }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState<{ kind: ProductKind; initial: Product | null; isNew: boolean; n: number } | null>(null)
  const [adjust, setAdjust] = useState<{ pct: number | null } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [del, setDel] = useState<{ d: Desc; used: number } | null>(null)

  // Money: typed in USD (the catalogue base) or in the company currency
  const cur = useMemo<CurView>(() => {
    const code = currency || 'USD'
    const fx = fxOf({ currency: code, fxRateToUsd: fxRate })
    const hasLocal = code !== 'USD'
    const local = hasLocal && entry === 'local'
    const show = (usd: number, c: string) => money(usd, c, fx, decFor(c === 'USD' ? usd : usd * fx))
    return { code: local ? code : 'USD', hasLocal, toShow: (u) => (local ? u * fx : u), fromShow: (v) => (local ? v / fx : v), fmt: (u) => show(u, local ? code : 'USD'), other: (u) => (hasLocal ? show(u, local ? 'USD' : code) : null) }
  }, [currency, fxRate, entry])

  // Row descriptions depend on the products, not on prices / stock (so editing a price re-renders one row)
  const custom = book.custom
  const ownIds = useMemo(() => new Set(FAMILIES.flatMap((k) => (custom[k] as { id: string }[]).map((x) => x.id))), [custom])
  const descs = useMemo(() => describe(resolveCatalog({ prices: {}, hidden: [], custom }), ownIds, t, lang), [custom, ownIds, t, lang])
  const ownDescs = useMemo(() => FAMILIES.flatMap((k) => descs[k].filter((d) => d.own)), [descs])
  const hiddenSet = useMemo(() => new Set(book.hidden), [book.hidden])
  const prices = book.prices
  const isEdited = useCallback((d: Desc) => !d.own && prices[d.id] != null, [prices])

  const totals = useMemo(() => {
    const all = FAMILIES.flatMap((k) => descs[k])
    return { edited: all.filter(isEdited).length, hidden: all.filter((d) => hiddenSet.has(d.id)).length, own: ownDescs.length }
  }, [descs, isEdited, hiddenSet, ownDescs])

  const filtering = q !== '' || editedOnly || hiddenOnly
  const tabAll = tab === 'mine' ? ownDescs : descs[tab]
  const shown = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean)
    return tabAll.filter((d) => words.every((w) => d.search.includes(w)) && (!editedOnly || isEdited(d)) && (!hiddenOnly || hiddenSet.has(d.id)))
  }, [tabAll, q, editedOnly, isEdited, hiddenOnly, hiddenSet])
  const tabEdited = useMemo(() => tabAll.filter(isEdited).length, [tabAll, isEdited])
  const tabHidden = useMemo(() => tabAll.filter((d) => hiddenSet.has(d.id)).length, [tabAll, hiddenSet])
  const shownEdited = useMemo(() => shown.filter(isEdited), [shown, isEdited])

  const findOwn = (d: Desc) => (useAppStore.getState().company.priceBook.custom[d.kind] as Product[]).find((x) => x.id === d.id) ?? null
  const onEdit = useCallback((d: Desc) => {
    const p = (useAppStore.getState().company.priceBook.custom[d.kind] as Product[]).find((x) => x.id === d.id)
    if (p) setForm({ kind: d.kind, initial: p, isNew: false, n: ++formSeq })
  }, [])
  const duplicate = (d: Desc) => {
    const p = findOwn(d); if (!p) return
    const copy = 'model' in p ? { ...p, model: `${p.model} ${tp.copySuffix}` } : { ...p, name: `${p.name} ${tp.copySuffix}`, nameAr: p.nameAr ? `${p.nameAr} ${tp.copySuffix}` : p.nameAr }
    setForm({ kind: d.kind, initial: copy as Product, isNew: true, n: ++formSeq })
  }
  const askDelete = (d: Desc) => {
    const used = useAppStore.getState().projects.filter((p) => [p.design.panelId, p.design.batteryId, p.design.inverterId, p.design.chargeControllerId].includes(d.id)
      || p.pricing.customItems.some((l) => l.ref === d.id)).length
    setDel({ d, used })
  }
  const doDelete = (d: Desc) => {
    const p = findOwn(d); if (!p) return
    const before = useAppStore.getState().company.priceBook
    useAppStore.getState().removeProduct(d.kind, d.id)
    toast({ message: tp.deleted(d.title), action: { label: t.common.undo, run: () => useAppStore.getState().setPriceBook((b) => ({
      ...b, prices: before.prices[d.id] != null ? { ...b.prices, [d.id]: before.prices[d.id] } : b.prices,
      hidden: before.hidden.includes(d.id) ? [...b.hidden, d.id] : b.hidden,
      custom: { ...b.custom, [d.kind]: [...(b.custom[d.kind] as Product[]), p] },
    })) } })
  }
  const onSave = (kind: ProductKind, item: Product) => {
    useAppStore.getState().upsertProduct(kind, item as never)
    setForm(null)
    toast({ message: tp.saved('model' in item ? `${item.brand} ${item.model}` : item.name), tone: 'ok' })
  }

  // ---- bulk actions on the products shown in the tab (search and filters applied)
  const applyAdjust = (pct: number) => {
    const list = shown, f = 1 + pct / 100
    changeBook((b) => {
      const next = { ...b.prices }
      const own = new Map<string, number>()
      for (const d of list) {
        const v = round2(cur.toShow(next[d.id] ?? d.base) * f)
        if (d.own) { own.set(d.id, cur.fromShow(v)); delete next[d.id] }
        else if (Math.abs(v - round2(cur.toShow(d.base))) < 0.005) delete next[d.id]
        else next[d.id] = cur.fromShow(v)
      }
      return { ...b, prices: next, custom: own.size ? withOwnPrices(b.custom, own) : b.custom }
    }, tp.adjusted(list.length, (pct > 0 ? '+' : '') + fmt(pct, decFor(pct))), t.common.undo)
  }
  const resetShown = () => {
    const ids = shownEdited.map((d) => d.id)
    changeBook((b) => { const next = { ...b.prices }; for (const id of ids) delete next[id]; return { ...b, prices: next } }, tp.resetDone(ids.length), t.common.undo)
  }
  const stockShown = (stocked: boolean) => {
    const ids = new Set(shown.map((d) => d.id))
    changeBook((b) => ({ ...b, hidden: stocked ? b.hidden.filter((x) => !ids.has(x)) : [...new Set([...b.hidden, ...ids])] }), stocked ? tp.stockedDone(ids.size) : tp.unstockedDone(ids.size), t.common.undo)
  }

  const clearFilters = () => { setQuery(''); setEditedOnly(false); setHiddenOnly(false) }
  const groupKey = (c: string) => `${filtering ? 'f' : 'a'}:${c}`
  const isOpen = (c: string) => openGroups[groupKey(c)] ?? filtering
  const row = (d: Desc) => <PriceRow key={d.id} d={d} override={prices[d.id]} hidden={hiddenSet.has(d.id)} cur={cur} onEdit={onEdit} />

  const list = (): ReactNode => {
    if (tab === 'mine') {
      if (!ownDescs.length) return (
        <EmptyState icon={PackagePlus} title={tp.ownEmptyTitle} body={tp.ownEmptyBody}>
          <button type="button" className="btn-primary" data-testid="own-add-empty" onClick={() => setForm({ kind: 'panels', initial: null, isNew: true, n: ++formSeq })}><Plus size={18} />{tp.add}</button>
        </EmptyState>
      )
      return (
        <div className="card overflow-hidden">
          {FAMILIES.map((k) => {
            const xs = shown.filter((d) => d.kind === k)
            if (!xs.length) return null
            return (
              <section key={k} aria-label={tp.tabs[k]}>
                <h3 className="eyebrow border-b border-slate-100 bg-slate-50 px-4 py-2 sm:px-5">{tp.tabs[k]} <span className="text-slate-400">{xs.length}</span></h3>
                <ul>{xs.map((d) => <OwnRow key={d.id} d={d} price={prices[d.id] ?? d.base} hidden={hiddenSet.has(d.id)} cur={cur}
                  onEdit={() => onEdit(d)} onDuplicate={() => duplicate(d)} onDelete={() => askDelete(d)} />)}</ul>
              </section>
            )
          })}
        </div>
      )
    }
    const head = (
      <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_10.5rem_5rem_2.75rem] gap-x-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 md:grid" aria-hidden="true">
        <span className="eyebrow">{tp.colProduct}</span><span className="eyebrow text-end">{tp.colCatalogue}</span><span className="eyebrow">{`${tp.colYours} (${cur.code})`}</span><span className="eyebrow">{tp.colStocked}</span><span />
      </div>
    )
    if (tab !== 'items') return <div className="card overflow-hidden">{head}<ul>{shown.map(row)}</ul></div>
    // Accessories: grouped by category, collapsed until opened (open while searching / filtering)
    const groups = new Map<string, Desc[]>()
    for (const d of shown) groups.set(d.cat, [...(groups.get(d.cat) ?? []), d])
    return (
      <div className="card overflow-hidden">
        {head}
        <ul>
          {[...groups].map(([c, xs]) => {
            const open = isOpen(c)
            return (
              <li key={c}>
                <GroupHeader title={bomCatLabel(c, t)} count={xs.length} edited={xs.filter(isEdited).length} open={open} testId={`group-${c}`}
                  onToggle={() => setOpenGroups((g) => ({ ...g, [groupKey(c)]: !open }))} />
                {open && <ul>{xs.map(row)}</ul>}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const example = adjust?.pct && shown[0] ? (() => {
    const d = shown[0], from = prices[d.id] ?? d.base
    return tp.adjustExample(d.title, cur.fmt(from), cur.fmt(cur.fromShow(round2(cur.toShow(from) * (1 + adjust.pct / 100)))))
  })() : null
  const tabCount = (k: Tab) => (k === 'mine' ? ownDescs.length : descs[k].length)

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5" data-testid="prices-page">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-display text-slate-900">{tp.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{tp.intro}</p>
          <p className="mt-1.5 text-xs text-slate-500" data-testid="prices-summary">
            <bdi>{book.updatedAt ? tp.lastUpdated(fmtDate(book.updatedAt)) : tp.neverEdited}</bdi> · <bdi>{tp.link.summary(totals.edited, totals.hidden, totals.own)}</bdi>
          </p>
        </div>
        {cur.hasLocal && (
          <div className="shrink-0">
            <span className="label">{tp.enterIn}</span>
            <Segmented label={tp.enterIn} value={entry} onChange={setEntry}
              options={[{ value: 'usd', label: 'USD', testId: 'prices-cur-usd' }, { value: 'local', label: currency, testId: 'prices-cur-local' }]} />
          </div>
        )}
      </div>

      <div role="tablist" aria-label={tp.tabsLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((k) => {
          const on = tab === k
          return (
            <button key={k} type="button" role="tab" aria-selected={on} data-testid={`prices-tab-${k}`} onClick={() => setTab(k)}
              className={`chip min-h-11 ${on ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800' : ''}`}>
              {tp.tabs[k]} <span className="opacity-70">{tabCount(k)}</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" aria-label={tp.tabs[tab]} className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:w-80">
            <Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
            <input className="input ps-10" type="search" dir="auto" placeholder={tp.search} aria-label={tp.search} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="prices-search" />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:flex-1">
            {tab !== 'mine' && <>
              <button type="button" className="chip min-h-11" aria-pressed={editedOnly} onClick={() => setEditedOnly((v) => !v)} data-testid="prices-filter-edited">{tp.editedOnly}</button>
              <button type="button" className="chip min-h-11" aria-pressed={hiddenOnly} onClick={() => setHiddenOnly((v) => !v)} data-testid="prices-filter-hidden">{tp.hiddenOnly}</button>
            </>}
            <div className="ms-auto flex items-center gap-2">
              <button type="button" className={tab === 'mine' ? 'btn-primary' : 'btn-secondary px-3'} data-testid="prices-add" aria-label={tp.add} title={tp.add}
                onClick={() => setForm({ kind: tab === 'mine' ? 'panels' : tab, initial: null, isNew: true, n: ++formSeq })}>
                <Plus size={18} /><span className={tab === 'mine' ? '' : 'hidden sm:inline'}>{tp.add}</span>
              </button>
              {tab !== 'mine' && (
                <Menu label={tp.bulk} testId="prices-bulk" buttonClassName="btn-secondary px-3" items={[
                  { label: tp.adjust, icon: <Percent size={18} />, onClick: () => setAdjust({ pct: null }), testId: 'bulk-adjust', hidden: !shown.length },
                  { label: tp.resetShown, icon: <RotateCcw size={18} />, onClick: () => setConfirmReset(true), testId: 'bulk-reset', hidden: !shownEdited.length },
                  { label: tp.stockShown, icon: <CheckCheck size={18} />, onClick: () => stockShown(true), testId: 'bulk-stock', hidden: !shown.some((d) => hiddenSet.has(d.id)) },
                  { label: tp.unstockShown, icon: <Ban size={18} />, onClick: () => stockShown(false), testId: 'bulk-unstock', hidden: !shown.some((d) => !hiddenSet.has(d.id)) },
                ]}>
                  <SlidersHorizontal size={18} /><span className="hidden sm:inline">{tp.bulk}</span>
                </Menu>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-slate-600">
          <p data-testid="prices-counts">
            {tp.shown(shown.length, tabAll.length)}
            {tab !== 'mine' && <> · {tp.editedN(tabEdited)} · {tp.hiddenN(tabHidden)}</>}
          </p>
          <p className="text-xs text-slate-500">{tab === 'mine' ? tp.ownHelp : tp.stockedHelp}</p>
        </div>

        {shown.length === 0 && tabAll.length > 0
          ? (
            <div className="card flex flex-col items-center px-6 py-10 text-center" data-testid="prices-no-match">
              <p className="text-sm text-slate-700">{tp.noMatch}</p>
              <button type="button" className="btn-secondary mt-4" onClick={clearFilters}><X size={18} />{tp.clearFilters}</button>
            </div>
          )
          : list()}
      </div>

      {form && <ProductForm key={form.n} kind={form.kind} initial={form.initial} isNew={form.isNew} cur={cur} onClose={() => setForm(null)} onSave={onSave} />}

      <Sheet open={!!adjust} onClose={() => setAdjust(null)} title={tp.adjustTitle} testId="adjust-sheet"
        footer={<>
          <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => setAdjust(null)}>{t.common.cancel}</button>
          <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={!adjust?.pct} data-testid="adjust-confirm"
            onClick={() => { if (adjust?.pct) applyAdjust(adjust.pct); setAdjust(null) }}>{tp.adjustConfirm(shown.length)}</button>
        </>}>
        <p className="text-sm text-slate-600">{tp.adjustHelp}</p>
        <Field label={tp.adjustPct} className="mt-4">
          <NumberInput value={adjust?.pct ?? null} onChange={(v) => setAdjust({ pct: v })} min={-90} max={500} allowEmpty allowNegative suffix="%" placeholder="+10" data-testid="adjust-pct" />
        </Field>
        {example && <p className="mt-3 text-sm text-slate-700" data-testid="adjust-example"><bdi>{example}</bdi></p>}
      </Sheet>

      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} title={tp.resetTitle(shownEdited.length)} body={tp.resetBody} confirmLabel={tp.resetConfirm} onConfirm={resetShown} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={del ? tp.deleteTitle(del.d.title) : ''} confirmLabel={tp.delete}
        body={del ? (del.used ? tp.deleteUsed(del.used) : tp.deleteBody) : undefined} onConfirm={() => { if (del) doDelete(del.d) }} />
    </div>
  )
}
