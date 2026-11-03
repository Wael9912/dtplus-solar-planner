import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Search, Pencil, Library, Home, Building2, Store, Droplets, Stethoscope, PenLine, Check, ListChecks, ReceiptText } from 'lucide-react'
import { useT, dicts } from '../../i18n'
import { Field, NumberInput, Section, Stat, Switch, Disclosure, IconButton, Segmented, Choice } from '../ui'
import { useMediaQuery } from '../hooks'
import { Sheet, ConfirmDialog, Menu } from '../overlay'
import type { StepProps } from '../Wizard'
import type { Appliance, BillInput, BillProfile, LoadItem } from '../../engine/types'
import { appliances, applianceCategories, searchAppliances } from '../../data/appliances'
import { BILL_PROFILES, demandFromBill, resolveSizing } from '../../engine/sizing'
import { loadFromAppliance, uid } from '../../engine/defaults'
import { fmt, fxOf } from '../../engine/format'
import { loadTemplates } from '../../data/samples'
import { applianceName, catLabel, iso, loadName, matchAppliance } from '../../i18n/labels'
import { toast } from '../../store/useToast'

type TplKey = (typeof loadTemplates)[number]['key']
const TPL_ICON: Record<TplKey, typeof Home> = { tplSmallHome: Home, tplFamilyHome: Building2, tplShop: Store, tplFarm: Droplets, tplClinic: Stethoscope }
const whDay = (l: LoadItem) => l.watts * l.qty * l.hoursPerDay

/** Where the load editor is shown: a wizard step, or the load calculator (no Site step there). */
export type LoadsContext = 'wizard' | 'calc'

export function StepLoads({ project: p, results: r, update, context = 'wizard' }: StepProps & { context?: LoadsContext }) {
  const { t, lang } = useT()
  const demand = resolveSizing(p).demand
  const setDemand = (v: 'loads' | 'bill') => update((prev) => ({ sizing: { ...resolveSizing(prev), demand: v } }))
  const wide = useMediaQuery('(min-width: 1024px)')
  const [libOpen, setLibOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<LoadItem | null>(null) // new custom appliance (not yet in the list)
  const [confirmClear, setConfirmClear] = useState(false)
  const [tplAsk, setTplAsk] = useState<TplKey | null>(null)
  const isHybrid = p.design.systemType === 'hybrid'
  const three = p.design.phase === 3

  const setLoads = (fn: (ls: LoadItem[]) => LoadItem[]) => update((prev) => ({ loads: fn(prev.loads) }))
  const patch = (id: string, x: Partial<LoadItem>) => setLoads((ls) => ls.map((l) => (l.id === id ? { ...l, ...x } : l)))
  const localize = (l: LoadItem): LoadItem => { const a = matchAppliance(l.name); return lang === 'ar' && a?.nameAr ? { ...l, name: a.nameAr } : l }
  const countOf = (a: Appliance) => p.loads.filter((l) => matchAppliance(l.name)?.id === a.id).reduce((s, l) => s + l.qty, 0)

  const addAppliance = (a: Appliance) => setLoads((ls) => {
    const ex = ls.find((l) => matchAppliance(l.name)?.id === a.id)
    return ex ? ls.map((l) => (l.id === ex.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, localize(loadFromAppliance(a))]
  })
  const decAppliance = (a: Appliance) => setLoads((ls) => {
    const ex = [...ls].reverse().find((l) => matchAppliance(l.name)?.id === a.id); if (!ex) return ls
    return ex.qty > 1 ? ls.map((l) => (l.id === ex.id ? { ...l, qty: l.qty - 1 } : l)) : ls.filter((l) => l.id !== ex.id)
  })
  /** Library quantity typed directly: earlier rows of this appliance keep their quantity, the last one takes the rest (0 removes them). */
  const setCount = (a: Appliance, n: number) => setLoads((ls) => {
    const idx = ls.flatMap((l, i) => (matchAppliance(l.name)?.id === a.id ? [i] : []))
    if (!idx.length) return n > 0 ? [...ls, localize(loadFromAppliance(a, n))] : ls
    let left = Math.max(0, Math.round(n))
    const qty = new Map<number, number>()
    idx.forEach((i, k) => { const q = k === idx.length - 1 ? left : Math.min(ls[i].qty, left); qty.set(i, q); left -= q })
    return ls.flatMap((l, i) => { const q = qty.get(i); return q == null ? [l] : q > 0 ? [{ ...l, qty: q }] : [] })
  })
  const remove = (id: string) => {
    let removed: LoadItem | undefined, idx = -1
    setLoads((ls) => { idx = ls.findIndex((l) => l.id === id); removed = ls[idx]; return ls.filter((l) => l.id !== id) })
    if (!removed) return
    const back = removed
    setEditId(null)
    toast({ message: t.loads.removed(loadName(back, lang, t)), action: { label: t.common.undo, run: () => setLoads((ls) => { const c = [...ls]; c.splice(Math.min(idx, c.length), 0, back); return c }) } })
  }
  const clearAll = () => {
    const prev = p.loads
    setLoads(() => [])
    toast({ message: t.loads.cleared(prev.length), action: { label: t.common.undo, run: () => setLoads(() => prev) } })
  }
  const applyTemplate = (key: TplKey, mode: 'add' | 'replace') => {
    const tpl = loadTemplates.find((x) => x.key === key); if (!tpl) return
    const built = tpl.build().map(localize)
    const prev = p.loads
    setLoads((ls) => (mode === 'replace' ? built : [...ls, ...built]))
    setLibOpen(false)
    toast({ message: t.loads.tplApplied(t.loads[key]), action: prev.length ? { label: t.common.undo, run: () => setLoads(() => prev) } : undefined })
  }
  const pickTemplate = (key: TplKey) => (p.loads.length ? setTplAsk(key) : applyTemplate(key, 'replace'))
  const newCustom = () => setDraft({ id: uid(), name: '', category: 'other', watts: 100, qty: 1, hoursPerDay: 4, surgeFactor: 1, nightSharePct: 40, phase: 1, critical: true })
  const commitDraft = () => {
    if (!draft) return
    const id = draft.id
    setLoads((ls) => [...ls, draft]); setDraft(null)
    requestAnimationFrame(() => { const el = document.querySelector<HTMLElement>(`[data-load-id="${id}"]`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.classList.add('ring-2', 'ring-brand-300'); setTimeout(() => el?.classList.remove('ring-2', 'ring-brand-300'), 1600) })
  }
  const editing = editId ? p.loads.find((l) => l.id === editId) ?? null : null
  const nightPct = r.dailyWh ? (r.nightWh / r.dailyWh) * 100 : 0
  // Table header: small type, wraps to two lines at most (Arabic labels are long), full text on hover
  const head = (label: string, num = true, pad = 'px-2', title = label) => (
    <th className={`${num ? 'num' : ''} ${pad} align-bottom leading-tight whitespace-normal`} title={title}><span className="line-clamp-2">{label.replace(/\//g, '/\u200B')}</span></th>
  )

  const emptyView = (
      <section className="card p-4 sm:p-6" data-testid="loads-empty">
          <h3 className="card-title">{t.loads.emptyTitle}</h3>
          <p className="mt-1 text-sm text-slate-600">{t.loads.emptyBody}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {loadTemplates.map((tp) => {
              const Icon = TPL_ICON[tp.key]
              const kwh = tp.build().reduce((s, l) => s + whDay(l), 0) / 1000
              return (
                <button key={tp.key} type="button" data-testid={`tpl-${tp.key}`} onClick={() => applyTemplate(tp.key, 'replace')}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-start transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:flex-col lg:items-start">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={20} /></span>
                  <span className="min-w-0"><span className="block font-medium text-slate-900">{t.loads[tp.key]}</span><span className="block text-xs text-slate-500"><bdi>{t.loads.approxDay(fmt(kwh, 1))}</bdi></span></span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" data-testid="open-library" onClick={() => setLibOpen(true)}><Library size={18} />{t.loads.pickOne}</button>
            <button type="button" className="btn-secondary" data-testid="add-custom" onClick={newCustom}><PenLine size={18} />{t.loads.custom}</button>
          </div>
        </section>
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="demand-switch">
        <span className="text-sm font-medium text-slate-700">{t.inputs.loads.demandFrom}</span>
        <Segmented className="w-full sm:w-96" full label={t.inputs.loads.demandFrom} value={demand} onChange={setDemand} options={[
          { value: 'loads', label: t.inputs.loads.demandLoads, icon: <ListChecks size={16} className="shrink-0" />, testId: 'demand-loads' },
          { value: 'bill', label: t.inputs.loads.demandBill, icon: <ReceiptText size={16} className="shrink-0" />, testId: 'demand-bill' },
        ]} />
      </div>
      {demand === 'bill' ? <BillView project={p} results={r} update={update} context={context} /> : p.loads.length === 0 ? emptyView : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3" data-testid="load-kpis">
        <Stat tone="brand" className="col-span-2 sm:col-span-1" label={t.loads.totalDaily} value={fmt(r.dailyWh / 1000, 2)} unit="kWh" sub={<>{iso(`${fmt(r.monthlyKwh)} kWh`)} {t.loads.monthly}</>} />
        <Stat label={t.loads.peak} value={fmt(r.peakW / 1000, 2)} unit="kW" sub={isHybrid && r.sizingPeakW < r.peakW ? t.results.sizedFor(fmt(r.sizingPeakW / 1000, 2)) : <>{t.loads.surgeW}: {iso(`${fmt(r.surgeW / 1000, 1)} kW`)}</>} />
        <Stat label={t.loads.nightEnergy} value={fmt(r.nightWh / 1000, 2)} unit="kWh" sub={`${fmt(nightPct)}%`} />
      </div>

      <Section flush title={<>{t.loads.listTitle} <span className="font-normal text-slate-500">({p.loads.length})</span></>} right={<>
        <button type="button" className="btn-primary" data-testid="open-library" onClick={() => setLibOpen(true)}><Plus size={18} />{t.loads.add}</button>
        <button type="button" className="btn-secondary" data-testid="add-custom" onClick={newCustom}><PenLine size={18} /><span className="hidden sm:inline">{t.loads.custom}</span></button>
        <Menu label={t.loads.more} testId="loads-menu" items={[{ label: t.loads.clear, icon: <Trash2 size={18} />, danger: true, onClick: () => setConfirmClear(true), testId: 'loads-clear' }]} />
      </>}>
        {wide ? (
          <div className="overflow-x-auto border-t border-slate-200">
            {/* Fixed layout: compact numeric columns, the name column takes the rest (min ≈ 11 rem) and wraps to two lines; headers wrap too */}
            <table className="table table-fixed" data-testid="loads-table" style={{ minWidth: `${43 + (three ? 4.5 : 0) + (isHybrid ? 5 : 0)}rem` }}>
              <colgroup>
                <col /><col className="w-20" /><col className="w-16" /><col className="w-20" /><col className="w-20" /><col className="w-16" />
                {three && <col className="w-[4.5rem]" />}{isHybrid && <col className="w-20" />}<col className="w-24" /><col className="w-14" />
              </colgroup>
              <thead><tr>
                {head(t.loads.name, false, 'px-3')}{head(t.loads.watts)}{head(t.loads.qty)}{head(t.loads.hours)}{head(t.loads.night)}{head(t.loads.surge)}
                {three && head(t.loads.phase, false)}{isHybrid && head(t.loads.critical, false, 'px-2', t.loads.criticalHelp)}{head(t.loads.daily)}<th className="px-1"><span className="sr-only">{t.common.actions}</span></th>
              </tr></thead>
              <tbody>
                {p.loads.map((l) => {
                  const nm = loadName(l, lang, t)
                  return (
                    <tr key={l.id} data-load-id={l.id} className="transition hover:bg-slate-50/60">
                      <td className="ps-2 pe-1"><NameCell value={matchAppliance(l.name) ? nm : l.name} placeholder={t.loads.namePh} label={t.loads.name} onChange={(v) => patch(l.id, { name: v })} /></td>
                      <td className="px-1"><NumberInput quiet align="end" value={l.watts} min={0} onChange={(v) => patch(l.id, { watts: v ?? 0 })} aria-label={`${t.loads.watts} — ${nm}`} /></td>
                      <td className="px-1"><NumberInput quiet align="end" integer value={l.qty} min={0} onChange={(v) => patch(l.id, { qty: v ?? 0 })} aria-label={`${t.loads.qty} — ${nm}`} /></td>
                      <td className="px-1"><NumberInput quiet align="end" value={l.hoursPerDay} min={0} max={24} step={0.5} onChange={(v) => patch(l.id, { hoursPerDay: v ?? 0 })} aria-label={`${t.loads.hours} — ${nm}`} /></td>
                      <td className="px-1"><NumberInput quiet align="end" value={l.nightSharePct} min={0} max={100} step={10} onChange={(v) => patch(l.id, { nightSharePct: v ?? 0 })} aria-label={`${t.loads.night} — ${nm}`} /></td>
                      <td className="px-1"><NumberInput quiet align="end" value={l.surgeFactor} min={1} max={10} step={0.5} onChange={(v) => patch(l.id, { surgeFactor: v ?? 1 })} aria-label={`${t.loads.surge} — ${nm}`} /></td>
                      {three && <td className="px-1"><select className="input-quiet" value={l.phase} aria-label={`${t.loads.phase} — ${nm}`} onChange={(e) => patch(l.id, { phase: Number(e.target.value) as 1 | 3 })}><option value={1}>1φ</option><option value={3}>3φ</option></select></td>}
                      {isHybrid && <td className="text-center"><input type="checkbox" className="size-5 accent-brand-700" checked={l.critical} aria-label={`${t.loads.onBattery} — ${nm}`} onChange={(e) => patch(l.id, { critical: e.target.checked })} /></td>}
                      <td className="num px-2 font-medium text-slate-900">{fmt(whDay(l))}</td>
                      <td className="px-1"><IconButton label={`${t.common.delete} — ${nm}`} className="btn-ghost text-slate-500 hover:text-red-700" onClick={() => remove(l.id)} data-testid="load-delete"><Trash2 size={18} /></IconButton></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="font-semibold text-slate-900"><td colSpan={6 + (three ? 1 : 0) + (isHybrid ? 1 : 0)} className="text-end">{t.loads.totalDaily}</td><td className="num px-2"><bdi>{fmt(r.dailyWh / 1000, 2)} kWh</bdi></td><td /></tr></tfoot>
            </table>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-slate-50/60 p-2 sm:p-3 md:grid-cols-2" data-testid="load-cards">
            {p.loads.map((l) => {
              const nm = loadName(l, lang, t)
              return (
                <li key={l.id} data-load-id={l.id} data-testid="load-card" className="rounded-xl border border-slate-200 bg-white p-3 transition">
                  <div className="flex items-start gap-3">
                    {/* Full name (wraps, never cut off); tap opens the editor for the less-used fields */}
                    <button type="button" className="min-w-0 flex-1 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={() => setEditId(l.id)} data-testid="load-card-edit">
                      <span className="flex items-start gap-1.5"><bdi className="min-w-0 leading-snug font-medium text-slate-900 [overflow-wrap:anywhere]">{nm}</bdi><Pencil size={14} className="mt-1 shrink-0 text-slate-400" aria-hidden="true" /></span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        <bdi>{t.loads.nightShort(fmt(l.nightSharePct))}</bdi>{l.surgeFactor > 1 && <> · <bdi>{t.loads.surgeShort(fmt(l.surgeFactor, l.surgeFactor % 1 ? 1 : 0))}</bdi></>}{three && l.phase === 3 && <> · 3φ</>}
                      </span>
                    </button>
                    <div className="shrink-0 text-end leading-tight"><div className="font-semibold text-slate-900 tabular-nums">{fmt(whDay(l))}</div><div className="text-xs text-slate-500">{t.loads.daily}</div></div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-2">
                    <label className="block min-w-0"><span className="mb-1 block text-xs leading-tight text-slate-500">{t.loads.watts}</span><NumberInput className="[&_input]:px-2" value={l.watts} min={0} onChange={(v) => patch(l.id, { watts: v ?? 0 })} aria-label={`${t.loads.watts} — ${nm}`} /></label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs leading-tight text-slate-500">{t.loads.hoursCompact}</span><NumberInput className="[&_input]:px-2" value={l.hoursPerDay} min={0} max={24} step={0.5} onChange={(v) => patch(l.id, { hoursPerDay: v ?? 0 })} aria-label={`${t.loads.hours} — ${nm}`} /></label>
                    <label className="block min-w-0"><span className="mb-1 block text-xs leading-tight text-slate-500">{t.loads.qty}</span><NumberInput className="[&_input]:px-2" integer value={l.qty} min={0} onChange={(v) => patch(l.id, { qty: v ?? 0 })} aria-label={`${t.loads.qty} — ${nm}`} /></label>
                    <IconButton label={`${t.common.delete} — ${nm}`} className="btn-ghost text-slate-500 hover:text-red-700" onClick={() => remove(l.id)} data-testid="load-delete"><Trash2 size={18} /></IconButton>
                  </div>
                  {isHybrid && (
                    <label className="mt-1 -mb-1.5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-sm text-slate-700">
                      <input type="checkbox" className="size-5 shrink-0 accent-brand-700" checked={l.critical} onChange={(e) => patch(l.id, { critical: e.target.checked })} />{t.loads.onBattery}
                    </label>
                  )}
                </li>
              )
            })}
            <li className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-slate-900 md:col-span-2"><span>{t.loads.totalDaily}</span><bdi className="tabular-nums">{fmt(r.dailyWh / 1000, 2)} kWh</bdi></li>
          </ul>
        )}
        <div className="border-t border-slate-200 px-4 sm:px-5">
          <Disclosure title={t.loads.advanced} description={t.loads.coincidence}>
            <div className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2">
              <div>
                <Field label={t.loads.coincidence} help={t.loads.coincidenceHelp} className="max-w-sm">
                  <NumberInput value={p.design.coincidenceAuto === true ? r.coincidenceFactor : p.design.coincidenceFactor} min={0.3} max={1} step={0.05} data-testid="coincidence"
                    onChange={(v) => update((prev) => ({ design: { ...prev.design, coincidenceFactor: v ?? 0.8, coincidenceAuto: false } }))} />
                </Field>
                <Switch className="mt-1" checked={p.design.coincidenceAuto === true} onChange={(v) => update((prev) => ({ design: { ...prev.design, coincidenceAuto: v } }))} label={t.common.auto} data-testid="coincidence-auto" />
              </div>
              {isHybrid && <p className="text-sm text-slate-600">{t.loads.criticalHelp}</p>}
            </div>
          </Disclosure>
        </div>
      </Section>
      </>}

      <LibrarySheet open={libOpen} onClose={() => setLibOpen(false)} countOf={countOf} onAdd={addAppliance} onDec={decAppliance} onSet={setCount} onTemplate={pickTemplate} total={p.loads.length} />
      <LoadEditor load={editing} three={three} hybrid={isHybrid} onChange={(x) => editing && patch(editing.id, x)} onClose={() => setEditId(null)} onDelete={() => editing && remove(editing.id)} />
      <LoadEditor load={draft} isNew three={three} hybrid={isHybrid} onChange={(x) => setDraft((d) => (d ? { ...d, ...x } : d))} onClose={() => setDraft(null)} onAdd={commitDraft} />
      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} title={t.loads.confirmClear(p.loads.length)} body={t.loads.confirmClearBody} confirmLabel={t.loads.clear} onConfirm={clearAll} />
      <ConfirmDialog open={!!tplAsk} onClose={() => setTplAsk(null)} title={tplAsk ? t.loads.tplApplyTitle(t.loads[tplAsk]) : ''} body={t.loads.tplApplyBody} confirmLabel="" onConfirm={() => undefined}>
        <button type="button" className="btn-secondary flex-1 sm:flex-none" data-testid="tpl-replace" onClick={() => { if (tplAsk) applyTemplate(tplAsk, 'replace'); setTplAsk(null) }}>{t.loads.tplReplace}</button>
        <button type="button" className="btn-primary flex-1 sm:flex-none" data-testid="tpl-add" onClick={() => { if (tplAsk) applyTemplate(tplAsk, 'add'); setTplAsk(null) }}>{t.loads.tplAdd}</button>
      </ConfirmDialog>
    </div>
  )
}

function LibrarySheet({ open, onClose, countOf, onAdd, onDec, onSet, onTemplate, total }: { open: boolean; onClose: () => void; countOf: (a: Appliance) => number; onAdd: (a: Appliance) => void; onDec: (a: Appliance) => void; onSet: (a: Appliance, n: number) => void; onTemplate: (k: TplKey) => void; total: number }) {
  const { t, lang } = useT()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const listTop = useRef<HTMLDivElement>(null)
  // All words in any order, English / Arabic names, trade aliases ("1.5 hp", "btu", "مكيف", "طلمبة") and category labels in both languages
  const filtered = useMemo(() => searchAppliances(appliances.filter((a) => cat === 'all' || a.category === cat), q,
    (a) => `${catLabel(a.category, dicts.en)} ${catLabel(a.category, dicts.ar)}`), [q, cat])
  return (
    <Sheet open={open} onClose={onClose} title={t.loads.library} variant="drawer" testId="library-sheet"
      footer={<><span className="me-auto text-sm text-slate-600" data-testid="library-count">{t.loads.nAdded(total)}</span><button type="button" className="btn-primary" onClick={onClose} data-testid="library-done"><Check size={18} />{t.loads.done}</button></>}>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
          <input className="input ps-10" type="search" dir="auto" placeholder={t.loads.search} aria-label={t.loads.search} value={q} onChange={(e) => { setQ(e.target.value); listTop.current?.scrollIntoView({ block: 'nearest' }) }} data-testid="library-search" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5" role="group" aria-label={t.loads.allCategories}>
          {['all', ...applianceCategories].map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c === 'all' ? t.loads.allCategories : catLabel(c, t)}</button>
          ))}
        </div>
      </div>
      <p className="eyebrow mt-2 mb-1.5">{t.loads.templates}</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {loadTemplates.map((tp) => <button key={tp.key} type="button" className="chip border-brand-200 bg-brand-50 text-brand-800" onClick={() => onTemplate(tp.key)} data-testid={`lib-tpl-${tp.key}`}><Plus size={14} />{t.loads[tp.key]}</button>)}
      </div>
      <div ref={listTop} />
      <ul className="mt-3 divide-y divide-slate-100" data-testid="library-list">
        {filtered.map((a) => {
          const n = countOf(a)
          return (
            <li key={a.id} className="flex min-h-14 items-center gap-3 py-1.5" data-testid="library-item">
              <button type="button" className="min-w-0 flex-1 rounded-md py-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" onClick={() => onAdd(a)}>
                <span className="block text-sm leading-snug font-medium text-slate-900 [overflow-wrap:anywhere]"><bdi>{applianceName(a, lang)}</bdi></span>
                <span className="block text-xs text-slate-500"><bdi>{fmt(a.watts)} W</bdi> · <bdi>{t.loads.hoursShort(fmt(a.hoursPerDay, a.hoursPerDay % 1 ? 1 : 0))}</bdi> · {catLabel(a.category, t)}</span>
              </button>
              {n > 0 ? (
                <div className="flex shrink-0 items-center rounded-lg border border-brand-200 bg-brand-50">
                  <button type="button" className="grid size-11 place-items-center text-brand-800" aria-label={`${t.loads.decrease} — ${applianceName(a, lang)}`} onClick={() => onDec(a)}>−</button>
                  <LibQty n={n} label={`${t.loads.qty} — ${applianceName(a, lang)}`} onSet={(x) => onSet(a, x)} />
                  <button type="button" className="grid size-11 place-items-center text-brand-800" aria-label={`${t.loads.increase} — ${applianceName(a, lang)}`} onClick={() => onAdd(a)}><Plus size={16} /></button>
                </div>
              ) : (
                <button type="button" className="btn-secondary btn-icon" aria-label={`${t.loads.add} — ${applianceName(a, lang)}`} onClick={() => onAdd(a)} data-testid="library-add"><Plus size={18} /></button>
              )}
            </li>
          )
        })}
        {!filtered.length && <li className="py-8 text-center text-sm text-slate-500">{t.loads.noResults}</li>}
      </ul>
    </Sheet>
  )
}

/** Desktop table name: up to two lines of text (wraps between words, never cut off); a click or Enter turns it into a text field. */
function NameCell({ value, placeholder, label, onChange }: { value: string; placeholder: string; label: string; onChange: (v: string) => void }) {
  // While editing, the field shows what is typed (a library name is shown translated, so the stored text can differ)
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const editing = draft !== null
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  if (editing) return (
    <input ref={ref} className="input-quiet font-medium" dir="auto" value={draft} placeholder={placeholder} aria-label={label} data-testid="load-name-input"
      onChange={(e) => { setDraft(e.target.value); onChange(e.target.value) }} onBlur={() => setDraft(null)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
  )
  return (
    <button type="button" onClick={() => setDraft(value)} title={value || undefined} aria-label={`${label}: ${value || placeholder}`} data-testid="load-name"
      className="block min-h-9 w-full rounded-md border border-transparent px-2 py-1 text-start text-sm leading-snug font-medium text-slate-900 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <span dir="auto" className={`line-clamp-2 text-start break-words ${value ? '' : 'font-normal text-slate-400'}`}>{value || placeholder}</span>
    </button>
  )
}

function LoadEditor({ load, isNew = false, three, hybrid, onChange, onClose, onAdd, onDelete }: { load: LoadItem | null; isNew?: boolean; three: boolean; hybrid: boolean; onChange: (x: Partial<LoadItem>) => void; onClose: () => void; onAdd?: () => void; onDelete?: () => void }) {
  const { t, lang } = useT()
  const nameRef = useRef<HTMLInputElement>(null)
  if (!load) return null
  const shownName = matchAppliance(load.name) ? loadName(load, lang, t) : load.name
  return (
    <Sheet open={!!load} onClose={onClose} title={isNew ? t.loads.newTitle : t.loads.editTitle} initialFocus={isNew ? nameRef : undefined} testId="load-editor"
      footer={<>
        {!isNew && onDelete && <button type="button" className="btn-danger me-auto" onClick={onDelete}><Trash2 size={18} />{t.common.delete}</button>}
        {isNew && <button type="button" className="btn-secondary" onClick={onClose}>{t.common.cancel}</button>}
        <button type="button" className="btn-primary min-w-28" data-testid="load-editor-done" onClick={isNew ? onAdd : onClose}>{isNew ? t.loads.add : t.loads.done}</button>
      </>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label={t.loads.name} className="col-span-2"><input ref={nameRef} className="input" dir="auto" value={shownName} placeholder={t.loads.namePh} onChange={(e) => onChange({ name: e.target.value })} /></Field>
        <Field label={t.loads.watts}><NumberInput value={load.watts} min={0} onChange={(v) => onChange({ watts: v ?? 0 })} suffix="W" /></Field>
        <Field label={t.loads.qty}><NumberInput stepper integer value={load.qty} min={0} onChange={(v) => onChange({ qty: v ?? 0 })} /></Field>
        <Field label={t.loads.hours}><NumberInput value={load.hoursPerDay} min={0} max={24} step={0.5} onChange={(v) => onChange({ hoursPerDay: v ?? 0 })} /></Field>
        <Field label={t.loads.night}><NumberInput value={load.nightSharePct} min={0} max={100} step={10} onChange={(v) => onChange({ nightSharePct: v ?? 0 })} suffix="%" /></Field>
        <Field label={t.loads.surge}><NumberInput value={load.surgeFactor} min={1} max={10} step={0.5} onChange={(v) => onChange({ surgeFactor: v ?? 1 })} /></Field>
        {three && <Field label={t.loads.phase}><select className="input" value={load.phase} onChange={(e) => onChange({ phase: Number(e.target.value) as 1 | 3 })}><option value={1}>1φ</option><option value={3}>3φ</option></select></Field>}
        {hybrid && <div className="col-span-2"><Switch checked={load.critical} onChange={(v) => onChange({ critical: v })} label={t.loads.onBattery} help={t.loads.criticalHelp} /></div>}
        <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{t.loads.totalDaily}: <bdi className="font-semibold tabular-nums">{fmt(whDay(load))} Wh</bdi></p>
      </div>
    </Sheet>
  )
}

const westernDigits = (s: string) => s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
/** Quantity typed straight into a library row (Arabic digits accepted); 0 on leaving the field removes the appliance. */
function LibQty({ n, label, onSet }: { n: number; label: string; onSet: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input type="text" inputMode="numeric" dir="ltr" autoComplete="off" aria-label={label} data-testid="library-qty"
      className="h-11 w-11 rounded-md bg-transparent text-center text-base font-semibold text-brand-900 tabular-nums outline-none focus:bg-white focus:ring-2 focus:ring-brand-500"
      value={draft ?? String(n)}
      onFocus={(e) => { setDraft(String(n)); const el = e.currentTarget; requestAnimationFrame(() => { try { el.select() } catch { /* ignore */ } }) }}
      onChange={(e) => {
        const v = westernDigits(e.target.value).replace(/\D/g, '').slice(0, 4)
        setDraft(v)
        if (v !== '' && Number(v) > 0) onSet(Number(v))
      }}
      onBlur={() => { if (draft === '0') onSet(0); setDraft(null) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
  )
}

/** Demand from the electricity bill (methodology §15.1): monthly kWh (or the amount ÷ tariff), usage profile, optional peak and motor. */
function BillView({ project: p, results: r, update, context }: Pick<StepProps, 'project' | 'results' | 'update'> & { context: LoadsContext }) {
  const { t } = useT()
  const T = t.inputs.loads
  const calc = context === 'calc' // the calculator has no Site step: the tariff is the selected city's typical one
  const b = resolveSizing(p).bill
  const setBill = (x: Partial<BillInput>) => update((prev) => { const sz = resolveSizing(prev); return { sizing: { ...sz, bill: { ...sz.bill, ...x } } } })
  const [amount, setAmount] = useState<number | null>(null)
  const cur = p.site.currency || 'USD'
  const tariffLocal = Math.max(0, p.site.gridTariff || 0) * fxOf(p.site)
  const tariffTxt = `${fmt(tariffLocal, tariffLocal < 1 ? 3 : tariffLocal < 10 ? 2 : 1)} ${cur}`
  const fromAmount = (v: number | null) => { setAmount(v); if (v != null && tariffLocal > 0) setBill({ monthlyKwh: Math.round(v / tariffLocal) }) }
  const est = demandFromBill({ ...b, peakKw: null, largestMotorKw: null })
  const nightPct = r.dailyWh > 0 ? (r.nightWh / r.dailyWh) * 100 : BILL_PROFILES[b.profile].nightPct
  const profiles: BillProfile[] = ['residential', 'commercial', 'daytime']
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5" data-testid="bill-view">
      <Section title={T.billTitle} description={T.billHelp} className="lg:col-span-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label={T.monthlyKwh}>
            <NumberInput value={b.monthlyKwh || null} allowEmpty min={0} max={10000000} placeholder="0" suffix={T.kwhMonth} data-testid="bill-kwh"
              onChange={(v) => { setAmount(null); setBill({ monthlyKwh: v ?? 0 }) }} />
          </Field>
          <Field label={T.amount(cur)} help={tariffLocal > 0 ? (amount ? T.amountHelp(tariffTxt, fmt(amount / tariffLocal)) : calc ? T.tariffIsCalc(tariffTxt) : T.tariffIs(tariffTxt)) : calc ? T.amountNoTariffCalc : T.amountNoTariff}>
            <NumberInput value={amount} allowEmpty min={0} placeholder={T.amountPh} suffix={cur} disabled={!(tariffLocal > 0)} data-testid="bill-amount" onChange={fromAmount} />
          </Field>
        </div>
        <div className="mt-5">
          <span className="label">{T.profile}</span>
          <Choice label={T.profile} columns="sm:grid-cols-3" value={b.profile} onChange={(v) => setBill({ profile: v })}
            options={profiles.map((k) => ({ value: k, label: T.profiles[k], help: T.profileHelp[k] }))} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label={T.peakKw} help={T.peakHelp}>
            <NumberInput value={b.peakKw} allowEmpty min={0.1} max={100000} step={0.5} suffix="kW" placeholder={T.estimated(fmt(est.peakW / 1000, 1))} data-testid="bill-peak" onChange={(v) => setBill({ peakKw: v })} />
          </Field>
          <Field label={T.motorKw} help={T.motorHelp}>
            <NumberInput value={b.largestMotorKw} allowEmpty min={0.1} max={10000} step={0.5} suffix="kW" placeholder={T.motorPh} data-testid="bill-motor" onChange={(v) => setBill({ largestMotorKw: v })} />
          </Field>
        </div>
        {p.loads.length > 0 && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{T.keptList(p.loads.length)}</p>}
      </Section>
      <Section title={T.derived} className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-2 sm:gap-3" data-testid="bill-kpis">
          <Stat tone="brand" className="col-span-2" label={T.perDay} value={fmt(r.dailyWh / 1000, 1)} unit="kWh" sub={<>{iso(`${fmt(r.monthlyKwh)} kWh`)} {t.loads.monthly}</>} />
          <Stat label={T.nightShare} value={fmt(nightPct)} unit="%" sub={iso(`${fmt(r.nightWh / 1000, 1)} kWh`)} />
          <Stat label={t.loads.peak} value={fmt(r.peakW / 1000, 1)} unit="kW" sub={b.peakKw == null ? T.estimatedShort : undefined} />
          <Stat className="col-span-2" label={T.surge} value={fmt(r.surgeW / 1000, 1)} unit="kW" sub={b.largestMotorKw ? T.fromMotor(fmt(b.largestMotorKw, 1)) : T.noMotor} />
        </div>
      </Section>
    </div>
  )
}
